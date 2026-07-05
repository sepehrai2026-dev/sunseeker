const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.argv[2] || 8091;
const sitesDir = path.join(__dirname, 'sites');
const sites = fs.readdirSync(sitesDir).filter(d =>
  fs.existsSync(path.join(sitesDir, d, 'dist', 'index.html'))
).sort();

const siteInfo = sites.map(domain => {
  const config = JSON.parse(fs.readFileSync(path.join(sitesDir, domain, 'site.json'), 'utf8'));
  return {
    domain,
    name: config.name || domain,
    template: config.template || 'redirect',
    redirect: config.redirect || null,
    accent: config.accentColor || '#666'
  };
});

const templateLabels = {
  a: 'Comparison/Affiliate',
  b: 'Education/Guide',
  c: 'Interactive Tool',
  d: 'Professional Landing',
  e: 'Editorial/Brand',
  f: 'AI/Startup Landing',
  redirect: 'Redirect'
};

function galleryHTML() {
  const groups = {};
  siteInfo.forEach(s => {
    const t = s.template;
    if (!groups[t]) groups[t] = [];
    groups[t].push(s);
  });

  const sidebar = Object.entries(groups).map(([t, sites]) => {
    const items = sites.map(s => {
      if (s.redirect) {
        return `<div class="site-item redirect" title="Redirects to ${s.redirect}"><span class="dot" style="background:#888"></span>${s.domain} <span class="redir">→ ${s.redirect}</span></div>`;
      }
      return `<div class="site-item" onclick="loadSite('${s.domain}')" title="${s.name}"><span class="dot" style="background:${s.accent}"></span>${s.domain}</div>`;
    }).join('');
    return `<div class="group"><div class="group-title">${templateLabels[t] || t} (${sites.length})</div>${items}</div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Microsite Gallery — 45 Sites</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;height:100vh;overflow:hidden}
.sidebar{width:320px;min-width:320px;background:#1e293b;border-right:1px solid #334155;overflow-y:auto;padding:1rem 0}
.sidebar-header{padding:0.75rem 1rem;font-size:1.1rem;font-weight:700;border-bottom:1px solid #334155;margin-bottom:0.5rem;display:flex;justify-content:space-between;align-items:center}
.sidebar-header span{font-size:0.75rem;color:#94a3b8;font-weight:400}
.group{margin-bottom:0.5rem}
.group-title{font-size:0.7rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;padding:0.5rem 1rem 0.25rem}
.site-item{padding:0.4rem 1rem;font-size:0.82rem;cursor:pointer;display:flex;align-items:center;gap:0.5rem;transition:background 0.15s}
.site-item:hover{background:#334155}
.site-item.active{background:#3b82f6;color:#fff}
.site-item.redirect{opacity:0.5;cursor:default;font-style:italic}
.redir{font-size:0.7rem;color:#64748b}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.main{flex:1;display:flex;flex-direction:column}
.toolbar{padding:0.5rem 1rem;background:#1e293b;border-bottom:1px solid #334155;display:flex;align-items:center;gap:1rem;font-size:0.85rem}
.toolbar .domain{font-weight:600;color:#f1f5f9}
.toolbar .template-badge{background:#334155;padding:0.2rem 0.6rem;border-radius:4px;font-size:0.7rem;color:#94a3b8}
.toolbar .btn{background:#334155;border:none;color:#e2e8f0;padding:0.3rem 0.75rem;border-radius:4px;cursor:pointer;font-size:0.78rem}
.toolbar .btn:hover{background:#475569}
.preview{flex:1;background:#fff}
.preview iframe{width:100%;height:100%;border:none}
.empty{flex:1;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:1.1rem}
</style>
</head>
<body>
<div class="sidebar">
  <div class="sidebar-header">Microsites <span>${sites.length} sites</span></div>
  ${sidebar}
</div>
<div class="main">
  <div class="toolbar" id="toolbar" style="display:none">
    <span class="domain" id="tb-domain"></span>
    <span class="template-badge" id="tb-template"></span>
    <button class="btn" onclick="toggleDevice()">Toggle Mobile</button>
  </div>
  <div class="empty" id="empty-state">← Click a site to preview</div>
  <div class="preview" id="preview" style="display:none">
    <iframe id="frame"></iframe>
  </div>
</div>
<script>
let mobile = false;
const labels = ${JSON.stringify(templateLabels)};
const info = ${JSON.stringify(Object.fromEntries(siteInfo.filter(s=>!s.redirect).map(s=>[s.domain,s])))};

function loadSite(domain) {
  document.querySelectorAll('.site-item.active').forEach(el => el.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('preview').style.display = 'block';
  document.getElementById('toolbar').style.display = 'flex';
  document.getElementById('tb-domain').textContent = domain;
  const s = info[domain];
  document.getElementById('tb-template').textContent = labels[s.template] || s.template;
  const frame = document.getElementById('frame');
  frame.src = '/site/' + domain + '/';
  mobile = false;
  frame.style.width = '100%';
  frame.style.margin = '0';
}

function toggleDevice() {
  const frame = document.getElementById('frame');
  mobile = !mobile;
  if (mobile) {
    frame.style.width = '375px';
    frame.style.margin = '0 auto';
    frame.style.borderLeft = '1px solid #334155';
    frame.style.borderRight = '1px solid #334155';
  } else {
    frame.style.width = '100%';
    frame.style.margin = '0';
    frame.style.borderLeft = 'none';
    frame.style.borderRight = 'none';
  }
}
</script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(galleryHTML());
    return;
  }

  const siteMatch = req.url.match(/^\/site\/([^/]+)\//);
  if (siteMatch) {
    const domain = siteMatch[1];
    const filePath = path.join(sitesDir, domain, 'dist', 'index.html');
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Gallery running at http://localhost:${PORT}`);
});
