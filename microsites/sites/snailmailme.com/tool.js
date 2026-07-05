function initTool(container) {
  const API_BASE = 'https://snailmail-api.sepehrai2026.workers.dev';
  const PRICE = '$3.99';
  const MESSAGE_MAX = 350;

  const designs = [
    { name: 'Sunset', bg: 'linear-gradient(135deg, #f97316, #ec4899, #8b5cf6)', color: '#fff' },
    { name: 'Ocean', bg: 'linear-gradient(135deg, #06b6d4, #3b82f6, #1d4ed8)', color: '#fff' },
    { name: 'Forest', bg: 'linear-gradient(135deg, #16a34a, #15803d, #14532d)', color: '#fff' },
    { name: 'Minimal', bg: '#fafaf9', color: '#1c1917' },
    { name: 'Night', bg: 'linear-gradient(135deg, #1e1b4b, #312e81, #4338ca)', color: '#e0e7ff' },
    { name: 'Warm', bg: 'linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)', color: '#451a03' }
  ];

  let selectedDesign = 0;
  let configured = null; // null = unknown, true/false once /status resolves

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Payment status banner from Stripe redirect (?success=1 / ?canceled=1)
  const qs = new URLSearchParams(window.location.search);
  let banner = '';
  if (qs.get('success') === '1') {
    banner = '<div id="sm-banner" style="margin-bottom:1rem;padding:0.85rem 1rem;border:1px solid #16a34a;background:rgba(22,163,74,0.08);color:var(--text);font-size:0.9rem"><strong>Payment received.</strong> Your postcard is being printed and will be in the mail within 1 business day. Thank you!</div>';
  } else if (qs.get('canceled') === '1') {
    banner = '<div id="sm-banner" style="margin-bottom:1rem;padding:0.85rem 1rem;border:1px solid var(--border);background:var(--bg-card);color:var(--text-secondary);font-size:0.9rem"><strong>Checkout canceled.</strong> Your card was not charged. Your design is still here if you want to try again.</div>';
  }

  container.innerHTML = banner + `
    <h3>Design your postcard</h3>
    <label>Choose a design</label>
    <div id="sm-designs" style="display:flex;gap:8px;margin-bottom:1rem;flex-wrap:wrap"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
      <div>
        <label for="sm-to">To (recipient name)</label>
        <input type="text" id="sm-to" maxlength="64" placeholder="Jane Smith">
        <label for="sm-addr">Mailing address (US only for now)</label>
        <textarea id="sm-addr" rows="3" placeholder="123 Main St&#10;New York, NY 10001"></textarea>
        <p style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">Street address, then city, state and ZIP on the last line.</p>
      </div>
      <div>
        <label for="sm-msg">Your message</label>
        <textarea id="sm-msg" rows="5" maxlength="${MESSAGE_MAX}" placeholder="Write something nice..."></textarea>
        <p style="font-size:0.75rem;color:var(--text-muted);margin-top:4px"><span id="sm-msg-count">0</span>/${MESSAGE_MAX} characters</p>
        <label for="sm-from">From</label>
        <input type="text" id="sm-from" maxlength="64" placeholder="Your name">
      </div>
    </div>
    <button id="sm-preview">Preview postcard</button>
    <div id="sm-result"></div>
  `;

  const designsEl = document.getElementById('sm-designs');
  designs.forEach((d, i) => {
    const btn = document.createElement('div');
    btn.style.cssText = `width:60px;height:40px;border-radius:6px;background:${d.bg};cursor:pointer;border:2px solid ${i === 0 ? 'var(--accent)' : 'transparent'};display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:500;color:${d.color}`;
    btn.textContent = d.name;
    btn.addEventListener('click', () => {
      selectedDesign = i;
      designsEl.querySelectorAll('div').forEach((el, j) => {
        el.style.borderColor = j === i ? 'var(--accent)' : 'transparent';
      });
    });
    designsEl.appendChild(btn);
  });

  const msgEl = document.getElementById('sm-msg');
  const msgCount = document.getElementById('sm-msg-count');
  msgEl.addEventListener('input', () => { msgCount.textContent = String(msgEl.value.length); });

  // Parse the freeform address textarea into a structured US address.
  // Expected: street on the first line, optional unit line, then "City, ST 12345".
  function parseAddress(addr) {
    const lines = addr.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return { error: 'Enter the street address, then "City, ST ZIP" on the last line.' };
    const m = lines[lines.length - 1].match(/^(.+?),?\s+([A-Za-z]{2})[,\s]+(\d{5}(?:-\d{4})?)$/);
    if (!m) return { error: 'Last line must look like "New York, NY 10001" (US addresses only for now).' };
    return {
      line1: lines[0],
      line2: lines.length > 2 ? lines.slice(1, -1).join(', ') : '',
      city: m[1].replace(/,$/, ''),
      state: m[2].toUpperCase(),
      zip: m[3]
    };
  }

  function orderSectionHtml() {
    if (configured === true) {
      return `<button id="sm-send" style="margin-top:8px">Send for ${PRICE} &rarr;</button>
        <div id="sm-send-status" style="margin-top:8px;font-size:0.85rem;color:var(--text-secondary)"></div>`;
    }
    return `<p style="font-size:0.85rem;color:var(--text-secondary);margin-top:8px"><strong>Ordering opens soon.</strong> The designer is fully working, and printing + mailing (${PRICE} per postcard, stamp and postage included) is on the way.</p>
      <a href="mailto:contact@snailmailme.com?subject=Postcard%20waitlist&amp;body=Let%20me%20know%20when%20I%20can%20send%20real%20postcards!" style="display:inline-block;margin-top:6px;font-size:0.9rem;color:var(--accent)">Join the waitlist &rarr;</a>`;
  }

  function wireSendButton() {
    const sendBtn = document.getElementById('sm-send');
    if (!sendBtn) return;
    sendBtn.addEventListener('click', async () => {
      const statusEl = document.getElementById('sm-send-status');
      const to = document.getElementById('sm-to').value.trim();
      const addr = document.getElementById('sm-addr').value.trim();
      const message = document.getElementById('sm-msg').value.trim();
      const from = document.getElementById('sm-from').value.trim();

      if (!to) { statusEl.textContent = 'Please enter the recipient name.'; return; }
      if (!message) { statusEl.textContent = 'Please write a message first.'; return; }
      const parsed = parseAddress(addr);
      if (parsed.error) { statusEl.textContent = parsed.error; return; }

      sendBtn.disabled = true;
      statusEl.textContent = 'Starting secure checkout...';
      try {
        const resp = await fetch(API_BASE + '/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            design: designs[selectedDesign].name,
            to: { name: to, line1: parsed.line1, line2: parsed.line2, city: parsed.city, state: parsed.state, zip: parsed.zip },
            message: message,
            from: from
          })
        });
        const data = await resp.json();
        if (resp.ok && data.url) {
          statusEl.textContent = 'Redirecting to checkout...';
          window.location.href = data.url;
          return;
        }
        statusEl.textContent = data.details ? data.details.join(' ') : (data.error || 'Something went wrong. Please try again.');
      } catch (e) {
        statusEl.textContent = 'Could not reach the ordering service. Please try again in a minute.';
      }
      sendBtn.disabled = false;
    });
  }

  function refreshOrderSection() {
    const orderEl = document.getElementById('sm-order');
    if (!orderEl) return;
    orderEl.innerHTML = orderSectionHtml();
    wireSendButton();
  }

  // Ask the fulfillment worker whether ordering is live.
  fetch(API_BASE + '/status')
    .then((r) => r.json())
    .then((s) => { configured = !!s.configured; refreshOrderSection(); })
    .catch(() => { configured = false; refreshOrderSection(); });

  document.getElementById('sm-preview').addEventListener('click', () => {
    const to = document.getElementById('sm-to').value || 'Friend';
    const addr = document.getElementById('sm-addr').value || '123 Main St\nAnytown, CA 90210';
    const msg = document.getElementById('sm-msg').value || 'Wish you were here!';
    const from = document.getElementById('sm-from').value || 'Me';
    const d = designs[selectedDesign];

    document.getElementById('sm-result').innerHTML = `
      <div class="tool-result">
        <strong>Postcard preview</strong>
        <div style="margin:1rem 0;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
          <div style="background:${d.bg};color:${d.color};padding:3rem 2rem;text-align:center;font-size:1.5rem;font-weight:600">
            ${d.name === 'Minimal' ? 'A letter for you' : 'Greetings!'}
          </div>
          <div style="padding:1.25rem;display:grid;grid-template-columns:1fr 1fr;gap:1rem;background:var(--bg-card)">
            <div style="font-size:0.85rem;line-height:1.6;white-space:pre-line;border-right:1px solid var(--border);padding-right:1rem">
              <p style="margin-bottom:1rem">${esc(msg)}</p>
              <p style="color:var(--text-muted)">&mdash; ${esc(from)}</p>
            </div>
            <div style="font-size:0.85rem;line-height:1.6">
              <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">To:</div>
              <strong>${esc(to)}</strong><br>
              <span style="white-space:pre-line;color:var(--text-secondary)">${esc(addr)}</span>
              <div style="float:right;width:40px;height:48px;border:1px dashed var(--border);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:var(--text-muted)">STAMP</div>
            </div>
          </div>
        </div>
        <p style="font-size:0.85rem;color:var(--text-muted)">Printed on premium 4x6 cardstock and mailed within 1 business day.</p>
        <div id="sm-order"></div>
      </div>
    `;
    refreshOrderSection();
  });
}
