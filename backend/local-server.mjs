// Local dev: serves the PWA and runs the Lambda handler in-process. No AWS needed.
// Usage (from repo root): node backend/local-server.mjs  ->  http://localhost:3000
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
  if (url.pathname === '/health' || url.pathname === '/v1/air') {
    const out = await handler({ rawPath: url.pathname, requestContext: { http: { method: req.method } }, queryStringParameters: Object.fromEntries(url.searchParams) });
    res.writeHead(out.statusCode, out.headers).end(out.body);
    return;
  }
  // Point the frontend at this server instead of the deployed API.
  if (url.pathname === '/frontend-config.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' }).end('window.SAANS_API_BASE = location.origin;');
    return;
  }
  const file = join(ROOT, normalize(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(ROOT) || file.startsWith(join(ROOT, 'backend')) || file.includes(`${sep}.git`)) return res.writeHead(404).end();
  let body;
  try { body = await readFile(file); } catch { return res.writeHead(404).end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
}).listen(PORT, () => console.log(`Saans local: http://localhost:${PORT}`));
