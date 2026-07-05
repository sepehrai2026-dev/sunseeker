#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// These domains have separate live deployments and must NEVER be built or deployed.
const NEVER_DEPLOY = ['balmorallaw.com', 'gizempilates.com', 'liquidblock.io', 'ndpventuresinc.com'];

const siteName = process.argv[2];
if (siteName === '--all') {
  const sitesDir = path.join(__dirname, 'sites');
  const sites = fs.readdirSync(sitesDir).filter(d => {
    return fs.existsSync(path.join(sitesDir, d, 'site.json'));
  });
  sites.forEach(s => buildSite(s));
  process.exit(0);
}

if (!siteName) {
  console.error('Usage: node build.js <site-folder-name> | --all');
  process.exit(1);
}

buildSite(siteName);

function buildSite(name) {
  if (NEVER_DEPLOY.includes(name)) {
    console.log(`Skipping ${name} (NEVER_DEPLOY list — has a separate live deployment)`);
    return;
  }
  const siteDir = path.join(__dirname, 'sites', name);
  const configPath = path.join(siteDir, 'site.json');

  if (!fs.existsSync(configPath)) {
    console.error(`No site.json found in ${siteDir}`);
    return;
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  if (config.redirect) {
    const distDir = path.join(siteDir, 'dist');
    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=https://${config.redirect}">
<title>Redirecting to ${config.redirect}</title>
<link rel="canonical" href="https://${config.redirect}">
</head>
<body>
<p>Redirecting to <a href="https://${config.redirect}">${config.redirect}</a>...</p>
</body>
</html>`;
    fs.writeFileSync(path.join(distDir, 'index.html'), html);
    console.log(`Built redirect ${name} → ${config.redirect}`);
    return;
  }

  const templateDir = path.join(__dirname, `template-${config.template}`);
  const templatePath = path.join(templateDir, 'index.html');
  const cssPath = path.join(templateDir, 'styles.css');
  const jsPath = path.join(templateDir, 'script.js');
  const cardPath = path.join(templateDir, 'card.html');

  if (!fs.existsSync(templatePath)) {
    console.error(`Template not found: ${templatePath}`);
    return;
  }

  let html = fs.readFileSync(templatePath, 'utf8');
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  const js = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, 'utf8') : '';
  const cardTemplate = fs.existsSync(cardPath) ? fs.readFileSync(cardPath, 'utf8') : '';
  const siteJsPath = path.join(siteDir, 'tool.js');
  const siteJs = fs.existsSync(siteJsPath) ? fs.readFileSync(siteJsPath, 'utf8') : '';

  // Inject CSS/JS and expand cards BEFORE the {{site.*}} pass, so placeholders
  // inside styles.css / script.js / card.html get substituted too.
  html = html.replace('/* {{styles}} */', () => css);
  html = html.replace('// {{script}}', () => js + '\n' + siteJs);

  html = html.replace('{{items}}', () => {
    if (!config.items || !cardTemplate) return '';
    return config.items.map((item, i) => {
      let card = cardTemplate;
      card = card.replace(/\{\{item\.(\w+)\}\}/g, (m, k) => {
        return item[k] !== undefined ? String(item[k]) : '';
      });
      card = card.replace('{{item.features}}', () => {
        if (!item.features) return '';
        return item.features.map(f => `<li>${f}</li>`).join('\n');
      });
      card = card.replace(/\{\{item\.index\}\}/g, String(i));
      if (item.featured) {
        card = card.replace('card"', 'card card-featured"');
      }
      return card;
    }).join('\n');
  });

  const jsonBlob = JSON.stringify({
    faqs: config.faqs || [],
    accentColor: config.accentColor,
    accentLight: config.accentLight,
    accentDark: config.accentDark,
    ctaText: config.ctaText || ''
  });
  html = html.replace('{{site._jsonBlob}}', () => jsonBlob);

  html = html.replace(/\{\{site\.(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
    const val = key.split('.').reduce((o, k) => o && o[k], config);
    return val !== undefined ? String(val) : '';
  });

  const distDir = path.join(siteDir, 'dist');
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'index.html'), html);
  console.log(`Built ${name} → ${distDir}/index.html`);
}
