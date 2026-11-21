'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, getConfig } = require('./config');
const { searchTargets } = require('./tools/search');
const { createJob, getJob, publicJob, runJob } = require('./engine');
const { openBrowser } = require('./utils');

const PUBLIC_DIR = path.join(ROOT, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png'
};

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? '/index.html' : pathname;
  const full = path.join(PUBLIC_DIR, relative);
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    res.end(data);
  });
}

async function handleApi(req, res, pathname) {
  const method = req.method || 'GET';

  if (pathname === '/api/status' && method === 'GET') {
    const cfg = getConfig();
    return sendJson(res, 200, {
      ok: true,
      name: 'clone-anything-workbench',
      version: '1.0.0',
      node: process.version,
      ai: {
        configured: Boolean(cfg.ai.apiKey && cfg.ai.baseUrl),
        model: cfg.ai.model
      },
      browser: { cdpUrl: cfg.browser.cdpUrl, websocket: typeof WebSocket === 'function' },
      policy: 'Authorized analysis only. No proprietary cloning, no subscription or DRM bypass.'
    });
  }

  if (pathname === '/api/search' && method === 'POST') {
    const body = await readBody(req);
    const targets = await searchTargets(body.query || '');
    return sendJson(res, 200, { targets });
  }

  if (pathname === '/api/analyze' && method === 'POST') {
    const body = await readBody(req);
    let target = body.target;
    if (typeof target === 'string') {
      target = {
        name: /^https?:\/\//i.test(target) ? target : path.basename(target),
        type: /^https?:\/\//i.test(target) ? 'url' : 'path',
        path: target,
        description: 'Target supplied from the browser UI'
      };
    }
    if (!target || !target.path) {
      return sendJson(res, 400, { error: 'A target is required' });
    }
    const job = createJob(target, body.question || '');
    runJob(job).catch((err) => {
      job.status = 'error';
      job.error = err.message || String(err);
    });
    return sendJson(res, 202, { id: job.id });
  }

  if (pathname.startsWith('/api/job/') && method === 'GET') {
    const id = pathname.slice('/api/job/'.length);
    const job = getJob(id);
    if (!job) return sendJson(res, 404, { error: 'Job not found' });
    return sendJson(res, 200, publicJob(job));
  }

  if (pathname.startsWith('/api/download/') && method === 'GET') {
    const id = pathname.slice('/api/download/'.length);
    const job = getJob(id);
    if (!job || !job.downloadPath || !fs.existsSync(job.downloadPath)) {
      return sendJson(res, 404, { error: 'Export not ready' });
    }
    const stat = fs.statSync(job.downloadPath);
    res.writeHead(200, {
      'content-type': 'application/zip',
      'content-length': stat.size,
      'content-disposition': `attachment; filename="${job.id}.zip"`
    });
    return fs.createReadStream(job.downloadPath).pipe(res);
  }

  return sendJson(res, 404, { error: 'API endpoint not found' });
}

async function handler(req, res) {
  try {
    const parsed = new URL(req.url || '/', 'http://localhost');
    const pathname = decodeURIComponent(parsed.pathname);
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    return serveStatic(req, res, pathname);
  } catch (err) {
    return sendJson(res, 500, { error: err.message || String(err) });
  }
}

async function startServer(options) {
  const cfg = getConfig();
  const opts = options || {};
  const port = opts.port || cfg.port;
  const server = http.createServer(handler);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  const url = `http://127.0.0.1:${port}`;
  if (opts.open !== false) openBrowser(url);

  process.once('SIGINT', () => server.close(() => process.exit(0)));
  return { server, url, port };
}

module.exports = { handler, startServer };
