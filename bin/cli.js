#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { startServer } = require('../src/server');
const { createJob, runJob } = require('../src/engine');
const { getConfig, WORKSPACE } = require('../src/config');
const { openBrowser } = require('../src/utils');

const BANNER = [
  '============================================================',
  '  CLONE ANYTHING  -  App Analysis & Reconstruction Workbench',
  '============================================================',
  ''
].join('\n');

function parseArgs(rest) {
  const opts = {};
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--no-open') opts.open = false;
    else if (a === '--port') opts.port = Number(rest[++i]);
    else if (a === '--question') opts.question = rest[++i];
    else if (a.startsWith('--')) opts[a.slice(2)] = true;
    else if (opts.target === undefined) opts.target = a;
  }
  return opts;
}

async function doctor() {
  const cfg = getConfig();
  const checks = [
    ['Node runtime', process.version, /^v(2[2-9]|[3-9]\d)/.test(process.version) ? 'ok' : 'needs Node >=22.23.4'],
    ['fetch API', typeof fetch === 'function' ? 'available' : 'missing', typeof fetch === 'function' ? 'ok' : 'fail'],
    ['WebSocket API', typeof WebSocket === 'function' ? 'available' : 'missing', typeof WebSocket === 'function' ? 'ok' : 'CDP browser tool disabled'],
    ['Workspace', WORKSPACE, fs.existsSync(WORKSPACE) ? 'ok' : 'missing'],
    ['AI provider', cfg.ai.apiKey ? `${cfg.ai.model} @ ${cfg.ai.baseUrl}` : 'not configured - local heuristic brain active', cfg.ai.apiKey ? 'ok' : 'info'],
    ['Browser CDP', cfg.browser.cdpUrl, 'optional']
  ];
  console.log(BANNER);
  console.log('  Diagnostics\n');
  for (const [name, value, status] of checks) {
    console.log(`  ${String(status).padEnd(30)} ${name.padEnd(16)} ${value}`);
  }
  console.log('\n  Tip: set AI_BASE_URL, AI_API_KEY and AI_MODEL to plug in a strong model.');
  console.log('  Tip: launch Chrome/Edge with --remote-debugging-port=9222 for live browser analysis.\n');
}

async function analyze(opts) {
  if (!opts.target) {
    console.error('  Usage: node bin/cli.js analyze <path-or-url> [--question "..."]');
    process.exitCode = 1;
    return;
  }
  const isUrl = /^https?:\/\//i.test(opts.target);
  const isDemo = /^builtin:\/\/notes-example$/i.test(opts.target);
  const target = isDemo
    ? {
        id: 'demo-notes',
        name: 'Notes Example (real local target)',
        type: 'demo',
        path: require('node:path').join(__dirname, '..', 'examples', 'notes-app'),
        description: 'Real local JavaScript target supplied through the CLI'
      }
    : {
        id: `cli-${Date.now()}`,
        name: isUrl ? opts.target : path.basename(opts.target),
        type: isUrl ? 'url' : 'path',
        path: opts.target,
        description: 'Target supplied through the CLI'
      };
  const job = createJob(target, opts.question || 'Explain how this target works and reconstruct a minimal original version.');
  job.onEvent = (ev) => {
    if (ev.kind === 'thought' || ev.kind === 'done' || ev.kind === 'error') {
      console.log(`  [${ev.title}] ${ev.text}`);
    }
  };
  await runJob(job);
  console.log('\n  Export ready: ' + job.downloadPath);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = parseArgs(rest);
  switch ((cmd || 'start').toLowerCase()) {
    case 'start': {
      const cfg = getConfig();
      const result = await startServer({
        port: opts.port || cfg.port,
        open: opts.open !== false
      });
      console.log(BANNER);
      console.log(`  Workbench running at  ${result.url}`);
      console.log('  Press Ctrl+C to stop.\n');
      return result;
    }
    case 'doctor':
      await doctor();
      return;
    case 'analyze':
      await analyze(opts);
      return;
    case 'help':
    case '-h':
    case '--help':
      console.log(BANNER);
      console.log('  Commands:');
      console.log('    start [--port 3000] [--no-open]   Start the browser workbench');
      console.log('    doctor                            Check runtime and integrations');
      console.log('    analyze <path|url> [--question]   Analyze a target from the terminal');
      console.log('    help                              Show this message\n');
      return;
    default:
      console.error(`  Unknown command: ${cmd}. Try "help".`);
      process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('  Fatal: ' + (err && err.stack ? err.stack : err));
    process.exitCode = 1;
  });
}

module.exports = { main };
