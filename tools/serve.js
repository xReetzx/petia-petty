/* Minimal static server for the test harness — avoids depending on python
 * being present just to run the suite. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'
};

function serve(root, port) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(root, rel === '/' ? '/index.html' : rel);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

module.exports = { serve };

if (require.main === module) {
  const port = Number(process.argv[2] || 8777);
  serve(path.resolve(__dirname, '..'), port)
    .then(() => console.log('serving ' + path.resolve(__dirname, '..') + ' on http://127.0.0.1:' + port));
}
