// Local dev: serves the PWA and runs the Lambda handler in-process. No AWS needed.
// Usage (from repo root): node backend/local-server.mjs  ->  http://localhost:3000
// LIVE_API=1 node backend/local-server.mjs  ->  site only, calls the deployed AWS API
// Without CACHE_TABLE / OPENAQ_PARAMETER_NAME the handler skips DynamoDB and OpenAQ (forecast only).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handler } from './src/handler.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (['/health', '/v1/air', '/v1/ask', '/v1/fires', '/v1/history', '/v1/geocode', '/v1/explain', '/v1/ward-forecast', '/v1/route', '/v1/alerts', '/v1/advisory'].includes(url.pathname)) {
    let body = '';
    for await (const chunk of req) if ((body += chunk).length > 10000) return res.writeHead(413).end();
    const out = await handler({ rawPath: url.pathname, requestContext: { http: { method: req.method } }, queryStringParameters: Object.fromEntries(url.searchParams), body });
    res.writeHead(out.statusCode, out.headers).end(out.body);
    return;
  }
  // Point the frontend at this server instead of the deployed API (LIVE_API=1 keeps the deployed one).
  if (url.pathname === '/frontend-config.js' && !process.env.LIVE_API) {
    res.writeHead(200, { 'content-type': 'text/javascript' }).end('window.SAANS_API_BASE = location.origin;');
    return;
  }
  const file = join(ROOT, normalize(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(ROOT) || file.startsWith(join(ROOT, 'backend')) || file.includes(`${sep}.git`)) return res.writeHead(404).end();
  let body;
  try { body = await readFile(file); } catch { return res.writeHead(404).end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
}).listen(PORT, process.env.HOST, () => console.log(`Saans local: http://localhost:${PORT}`)); // HOST=0.0.0.0 for WSL -> Windows IPv4
