// A plain static server for dist/ — the suites and a look in a real browser.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(process.argv[2] ?? 'dist')
const port = Number(process.argv[3] ?? 8765)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' }
http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0].split('#')[0])
  let file = path.join(root, url === '/' ? 'index.html' : url)
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file, 'index.html')
    fs.stat(file, (err2, st2) => {
      if (err2 || !st2.isFile()) { res.writeHead(404); res.end('not found'); return }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'content-length': st2.size, 'cache-control': 'no-cache' })
      fs.createReadStream(file).pipe(res)
    })
  })
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}/`))
