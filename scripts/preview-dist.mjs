import { createServer, get } from 'node:http';
import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(repoRoot, 'dist');
const defaultPort = Number(process.env.UNITFLIP_PREVIEW_PORT || process.env.PORT || 3001);
const defaultHost = process.env.UNITFLIP_PREVIEW_HOST || process.env.HOST || '127.0.0.1';

const args = process.argv.slice(2);
const smokeMode = args.includes('--smoke');
const readArg = (name, fallback) => {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
};

const host = readArg('--host', defaultHost);
const port = Number(readArg('--port', String(defaultPort)));

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const fail = (message) => {
  console.error(`UnitFlip preview failed: ${message}`);
  process.exit(1);
};

if (!existsSync(path.join(distRoot, 'index.html'))) {
  fail('dist/index.html was not found. Run `npm run build` before `npm run preview`.');
}

if (!Number.isFinite(port) || port <= 0) {
  fail(`invalid port "${port}".`);
}

const resolveRequestPath = (url) => {
  const pathname = decodeURIComponent(new URL(url || '/', `http://${host}:${port}`).pathname);
  const requestedPath = path.resolve(distRoot, pathname === '/' ? 'index.html' : `.${pathname}`);

  if (!requestedPath.startsWith(distRoot)) {
    return null;
  }

  if (existsSync(requestedPath) && statSync(requestedPath).isFile()) {
    return requestedPath;
  }

  return path.join(distRoot, 'index.html');
};

const server = createServer((request, response) => {
  const filePath = resolveRequestPath(request.url);

  if (!filePath) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  try {
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(readFileSync(filePath));
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? error.message : 'Preview server error');
  }
});

server.on('error', (error) => {
  fail(error instanceof Error ? error.message : 'unknown server error');
});

server.listen(port, host, () => {
  const visibleHost = host === '0.0.0.0' ? 'localhost' : host;
  console.log(`UnitFlip production preview: http://${visibleHost}:${port}`);
  console.log('Serving built files from dist. Press Ctrl+C to stop.');

  if (!smokeMode) return;

  get(`http://${visibleHost}:${port}/`, (response) => {
    let body = '';
    response.on('data', (chunk) => {
      body += chunk;
    });
    response.on('end', () => {
      const passed = response.statusCode === 200 && body.includes('<div id="root">');
      console.log(`Preview smoke check: ${passed ? 'passed' : 'failed'} (${response.statusCode}, ${body.length} bytes)`);
      server.close(() => process.exit(passed ? 0 : 1));
    });
  }).on('error', (error) => {
    console.error(`Preview smoke check failed: ${error.message}`);
    server.close(() => process.exit(1));
  });
});
