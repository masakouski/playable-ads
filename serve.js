/**
 * Minimal static server for local testing: `npm run dev`
 * Serves dist/ at http://localhost:8080 so you can open the built playable
 * on a phone on the same Wi-Fi (use the LAN address it prints).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, 'dist');
const PORT = process.env.PORT || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

http
  .createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found. Did you run `npm run build`?');
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(PORT, () => {
    const nets = os.networkInterfaces();
    const lan = Object.values(nets)
      .flat()
      .find((n) => n && n.family === 'IPv4' && !n.internal);
    console.log(`\n  local    http://localhost:${PORT}/`);
    if (lan) console.log(`  network  http://${lan.address}:${PORT}/   <- open this on your phone\n`);
  });
