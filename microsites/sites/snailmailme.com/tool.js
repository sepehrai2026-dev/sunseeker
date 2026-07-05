function initTool(container) {
  const designs = [
    { name: 'Sunset', bg: 'linear-gradient(135deg, #f97316, #ec4899, #8b5cf6)', color: '#fff' },
    { name: 'Ocean', bg: 'linear-gradient(135deg, #06b6d4, #3b82f6, #1d4ed8)', color: '#fff' },
    { name: 'Forest', bg: 'linear-gradient(135deg, #16a34a, #15803d, #14532d)', color: '#fff' },
    { name: 'Minimal', bg: '#fafaf9', color: '#1c1917' },
    { name: 'Night', bg: 'linear-gradient(135deg, #1e1b4b, #312e81, #4338ca)', color: '#e0e7ff' },
    { name: 'Warm', bg: 'linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)', color: '#451a03' }
  ];

  let selectedDesign = 0;

  container.innerHTML = `
    <h3>Design your postcard</h3>
    <label>Choose a design</label>
    <div id="sm-designs" style="display:flex;gap:8px;margin-bottom:1rem;flex-wrap:wrap"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
      <div>
        <label for="sm-to">To (recipient name)</label>
        <input type="text" id="sm-to" placeholder="Jane Smith">
        <label for="sm-addr">Mailing address</label>
        <textarea id="sm-addr" rows="3" placeholder="123 Main St&#10;New York, NY 10001&#10;USA"></textarea>
      </div>
      <div>
        <label for="sm-msg">Your message</label>
        <textarea id="sm-msg" rows="5" placeholder="Write something nice..."></textarea>
        <label for="sm-from">From</label>
        <input type="text" id="sm-from" placeholder="Your name">
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

  document.getElementById('sm-preview').addEventListener('click', () => {
    const to = document.getElementById('sm-to').value || 'Friend';
    const addr = document.getElementById('sm-addr').value || '123 Main St\nAnytown, USA';
    const msg = document.getElementById('sm-msg').value || 'Wish you were here!';
    const from = document.getElementById('sm-from').value || 'Me';
    const d = designs[selectedDesign];

    document.getElementById('sm-result').innerHTML = `
      <div class="tool-result">
        <strong>Postcard preview</strong>
        <div style="margin:1rem 0;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
          <div style="background:${d.bg};color:${d.color};padding:3rem 2rem;text-align:center;font-size:1.5rem;font-weight:600">
            ${d.name === 'Minimal' ? '✉️ A letter for you' : '📮 Greetings!'}
          </div>
          <div style="padding:1.25rem;display:grid;grid-template-columns:1fr 1fr;gap:1rem;background:var(--bg-card)">
            <div style="font-size:0.85rem;line-height:1.6;white-space:pre-line;border-right:1px solid var(--border);padding-right:1rem">
              <p style="margin-bottom:1rem">${msg}</p>
              <p style="color:var(--text-muted)">— ${from}</p>
            </div>
            <div style="font-size:0.85rem;line-height:1.6">
              <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">To:</div>
              <strong>${to}</strong><br>
              <span style="white-space:pre-line;color:var(--text-secondary)">${addr}</span>
              <div style="float:right;width:40px;height:48px;border:1px dashed var(--border);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:var(--text-muted)">STAMP</div>
            </div>
          </div>
        </div>
        <p style="font-size:0.85rem;color:var(--text-muted)">This is a preview. In the full version, clicking "Send" would print and mail this postcard for $2.99.</p>
        <button onclick="this.textContent='Coming soon!';this.style.opacity='0.5'" style="margin-top:8px">Send for $2.99 →</button>
      </div>
    `;
  });
}
