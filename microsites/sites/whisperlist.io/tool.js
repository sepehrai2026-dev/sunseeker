function initTool(container) {
  const stored = JSON.parse(localStorage.getItem('whisperlist_lists') || '{}');

  function renderCreate() {
    container.innerHTML = `
      <h3>Create a whisperlist</h3>
      <label for="wl-title">What do you want feedback on?</label>
      <input type="text" id="wl-title" placeholder="e.g., How was the team offsite?">
      <label for="wl-prompt">Prompt (what should people respond to?)</label>
      <textarea id="wl-prompt" rows="3" placeholder="e.g., Share one thing that went well and one thing to improve"></textarea>
      <button id="wl-create">Create whisperlist</button>
      ${Object.keys(stored).length > 0 ? '<button id="wl-view-all" style="background:transparent;color:var(--accent);border:1px solid var(--border);margin-left:8px">View my lists</button>' : ''}
    `;

    document.getElementById('wl-create').addEventListener('click', () => {
      const title = document.getElementById('wl-title').value.trim();
      const prompt = document.getElementById('wl-prompt').value.trim();
      if (!title) return;
      const id = Math.random().toString(36).substring(2, 8);
      stored[id] = { title, prompt, responses: [], created: new Date().toISOString() };
      localStorage.setItem('whisperlist_lists', JSON.stringify(stored));
      renderShare(id);
    });

    const viewAll = document.getElementById('wl-view-all');
    if (viewAll) viewAll.addEventListener('click', renderListAll);
  }

  function renderShare(id) {
    const list = stored[id];
    const link = window.location.origin + '#respond-' + id;
    container.innerHTML = `
      <h3>Your whisperlist is ready</h3>
      <div class="tool-result">
        <strong>${list.title}</strong><br>
        <p style="margin:0.5rem 0;font-size:0.9rem;color:var(--text-secondary)">${list.prompt}</p>
        <label>Share this link to collect anonymous responses:</label>
        <div style="display:flex;gap:8px;margin-top:4px">
          <input type="text" id="wl-link" value="${link}" readonly style="flex:1">
          <button id="wl-copy" style="margin-top:0;white-space:nowrap">Copy</button>
        </div>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-top:8px">${list.responses.length} response${list.responses.length !== 1 ? 's' : ''} so far</p>
      </div>
      <div style="display:flex;gap:8px;margin-top:0">
        <button id="wl-results">View responses</button>
        <button id="wl-new" style="background:transparent;color:var(--accent);border:1px solid var(--border)">Create another</button>
      </div>
    `;
    document.getElementById('wl-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(link).catch(() => {
        document.getElementById('wl-link').select();
      });
      document.getElementById('wl-copy').textContent = 'Copied';
    });
    document.getElementById('wl-results').addEventListener('click', () => renderResults(id));
    document.getElementById('wl-new').addEventListener('click', renderCreate);
  }

  function renderResults(id) {
    const list = stored[id];
    const responses = list.responses.length > 0
      ? list.responses.map((r, i) => `<div style="padding:0.75rem;background:var(--bg);border-radius:8px;margin-bottom:8px"><span style="font-size:0.75rem;color:var(--text-muted)">#${i + 1}</span><p style="margin:4px 0 0;font-size:0.9rem">${r.text}</p></div>`).join('')
      : '<p style="color:var(--text-muted);font-size:0.9rem">No responses yet. Share the link to start collecting feedback.</p>';

    container.innerHTML = `
      <h3>${list.title}</h3>
      <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1rem">${list.responses.length} response${list.responses.length !== 1 ? 's' : ''}</p>
      <div>${responses}</div>
      <div style="display:flex;gap:8px">
        <button id="wl-back-share">Share link</button>
        <button id="wl-new2" style="background:transparent;color:var(--accent);border:1px solid var(--border)">Create new</button>
      </div>
    `;
    document.getElementById('wl-back-share').addEventListener('click', () => renderShare(id));
    document.getElementById('wl-new2').addEventListener('click', renderCreate);
  }

  function renderRespond(id) {
    const list = stored[id];
    if (!list) {
      container.innerHTML = '<div class="tool-result">This whisperlist was not found or has expired.</div>';
      return;
    }
    container.innerHTML = `
      <h3>${list.title}</h3>
      <p style="color:var(--text-secondary);margin-bottom:1rem;font-size:0.95rem">${list.prompt}</p>
      <label for="wl-response">Your anonymous response</label>
      <textarea id="wl-response" rows="4" placeholder="Type your response here... it's completely anonymous"></textarea>
      <button id="wl-submit">Submit anonymously</button>
    `;
    document.getElementById('wl-submit').addEventListener('click', () => {
      const text = document.getElementById('wl-response').value.trim();
      if (!text) return;
      list.responses.push({ text, ts: new Date().toISOString() });
      localStorage.setItem('whisperlist_lists', JSON.stringify(stored));
      container.innerHTML = `
        <div class="tool-result">
          <strong>Response submitted anonymously</strong><br>
          <p style="margin-top:8px;font-size:0.9rem">Your feedback has been recorded. No one will know it was you.</p>
        </div>
        <button id="wl-another">Submit another response</button>
      `;
      document.getElementById('wl-another').addEventListener('click', () => renderRespond(id));
    });
  }

  function renderListAll() {
    const ids = Object.keys(stored);
    const items = ids.map(id => {
      const l = stored[id];
      return `<div style="padding:0.75rem;background:var(--bg);border-radius:8px;margin-bottom:8px;cursor:pointer" data-id="${id}">
        <strong>${l.title}</strong>
        <span style="font-size:0.8rem;color:var(--text-muted);margin-left:8px">${l.responses.length} responses</span>
      </div>`;
    }).join('');

    container.innerHTML = `
      <h3>Your whisperlists</h3>
      <div id="wl-list">${items}</div>
      <button id="wl-new3" style="background:transparent;color:var(--accent);border:1px solid var(--border)">Create new</button>
    `;
    document.querySelectorAll('[data-id]').forEach(el => {
      el.addEventListener('click', () => renderShare(el.dataset.id));
    });
    document.getElementById('wl-new3').addEventListener('click', renderCreate);
  }

  const hash = window.location.hash;
  if (hash.startsWith('#respond-')) {
    renderRespond(hash.replace('#respond-', ''));
  } else {
    renderCreate();
  }
}
