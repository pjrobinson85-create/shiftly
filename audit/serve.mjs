// Minimal static server + API proxy for the CI contrast audit.
// Serves client/dist under /shiftly/ (matching vite's base) and proxies
// /shiftly/api and /shiftly/socket.io (HTTP + WebSocket upgrade) to the
// API on :3000.
//
// Usage: AUDIT_PORT=5173 API_PORT=3000 node audit/serve.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../client/dist');
const API_PORT = parseInt(process.env.API_PORT || '3000', 10);
const PORT = parseInt(process.env.AUDIT_PORT || '5173', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function isApiPath(p) {
  return p.startsWith('/shiftly/api') || p.startsWith('/shiftly/socket.io');
}

// --- HTTP proxy ---
function proxy(req, res) {
  const target = `http://127.0.0.1:${API_PORT}${req.url.replace(/^\/shiftly/, '')}`;
  const upstream = http.request(
    target,
    {
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${API_PORT}` },
    },
    (up) => {
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    }
  );
  upstream.on('error', (e) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('proxy error: ' + e.message);
  });
  req.pipe(upstream);
}

// --- WebSocket upgrade proxy (socket.io uses websocket-only transport) ---
function proxyUpgrade(req, socket, head) {
  const target = `http://127.0.0.1:${API_PORT}${req.url.replace(/^\/shiftly/, '')}`;
  const upstreamReq = http.request(target, {
    method: 'GET',
    headers: { ...req.headers, host: `127.0.0.1:${API_PORT}` },
  });
  upstreamReq.on('upgrade', (upRes, upSocket, upHead) => {
    // The accept token is derived from the client's sec-websocket-key, which
    // we forwarded — so the upstream's accept value is valid for this client.
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${upRes.headers['sec-websocket-accept']}\r\n\r\n`
    );
    // Data the client already sent before the upgrade completed.
    if (head && head.length) upSocket.write(head);
    // Data the upstream sent with the 101 (socket.io's open packet) —
    // Node passes this as upgradeHead, NOT on the socket.
    if (upHead && upHead.length) socket.write(upHead);
    socket.on('data', (d) => upSocket.write(d));
    upSocket.on('data', (d) => socket.write(d));
    socket.on('close', () => upSocket.destroy());
    socket.on('error', () => upSocket.destroy());
    upSocket.on('close', () => socket.destroy());
    upSocket.on('error', () => socket.destroy());
  });
  upstreamReq.on('error', (e) => {
    socket.write(
      'HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\nproxy error: ' + e.message
    );
    socket.destroy();
  });
  upstreamReq.end();
}

function serveFile(file, res) {
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('missing: ' + file);
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  if (isApiPath(p)) {
    return proxy(req, res);
  }

  if (p === '/shiftly' || p === '/shiftly/') {
    return serveFile(path.join(DIST, 'index.html'), res);
  }
  if (p.startsWith('/shiftly/')) {
    const rel = p.slice('/shiftly/'.length);
    const candidate = path.join(DIST, rel);
    if (!candidate.startsWith(DIST)) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return serveFile(candidate, res);
    }
    // SPA fallback — let react-router handle the route
    return serveFile(path.join(DIST, 'index.html'), res);
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found (expect /shiftly/...)');
});

server.on('upgrade', (req, socket, head) => {
  const p = new URL(req.url, 'http://localhost').pathname;
  if (isApiPath(p)) {
    return proxyUpgrade(req, socket, head);
  }
  socket.destroy();
});

server.listen(PORT, () => {
  console.log(
    `audit static server on :${PORT}, proxying /shiftly/api + /shiftly/socket.io -> :${API_PORT}`
  );
});
