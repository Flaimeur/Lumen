// Sert l'interface dans un navigateur avec des données de démonstration (sans Electron).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src', 'renderer');
const port = Number(process.env.PORT) || 5178;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(root, path.normalize(p));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`Aperçu Lumen : http://localhost:${port}`));
