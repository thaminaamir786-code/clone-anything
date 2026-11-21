'use strict';

const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { ROOT } = require('./config');

const execFileAsync = promisify(execFile);
const ENTRY = path.join(ROOT, 'node_modules', 'rea-agents', 'scripts', 'rea.mjs');

async function invoke(args, options) {
  const opts = options || {};
  const argv = [ENTRY, ...args];
  if (opts.json !== false) argv.push('--format', 'json');
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, argv, {
      cwd: ROOT,
      maxBuffer: 96 * 1024 * 1024,
      timeout: opts.timeout || 240000,
      windowsHide: true
    });
    let data = null;
    try { data = JSON.parse(stdout); } catch (err) { data = null; }
    return { ok: true, stdout, raw: stdout, stderr: stderr || '', data };
  } catch (err) {
    return {
      ok: false,
      error: err.message || String(err),
      stdout: err.stdout || '',
      stderr: err.stderr || ''
    };
  }
}

async function listTools() {
  const { stdout, error } = await invoke(['--help'], { json: false });
  if (error) return [];
  const tools = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^  ([a-z0-9][a-z0-9-]*)\s{2,}(.+)$/);
    if (match) tools.push({ name: match[1], description: match[2].trim() });
  }
  return tools;
}

async function analyzeJavaScript(targetPath) {
  return invoke(['analyze-javascript-application', targetPath]);
}

async function analyze(targetPath) {
  return invoke(['analyze', targetPath]);
}

async function inspect(targetPath) {
  return invoke(['inspect', targetPath]);
}

async function analyzeWebBundle(url) {
  return invoke(['analyze-web-bundle', url]);
}

async function doctor() {
  return invoke(['doctor'], { json: false });
}

module.exports = {
  invoke,
  listTools,
  analyzeJavaScript,
  analyze,
  inspect,
  analyzeWebBundle,
  doctor
};
