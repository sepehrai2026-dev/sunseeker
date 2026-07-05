const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dir = args.find(a => !a.match(/^\d+$/)) || '.';
const port = process.env.PORT || args.find(a => a.match(/^\d+$/)) || 8090;

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  let filePath = path.join(dir, url === '/' ? 'index.html' : url);
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'text/html';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}).listen(port, () => console.log(`Serving ${path.resolve(dir)} on http://localhost:${port}`));
