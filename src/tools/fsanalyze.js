'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.html', '.htm',
  '.css', '.md', '.py', '.java', '.cs', '.go', '.rs', '.rb', '.php', '.sh',
  '.yml', '.yaml', '.toml', '.xml', '.txt'
]);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', '.workbench']);

function walk(root, maxFiles, maxDepth) {
  const out = [];
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length && out.length < maxFiles) {
    const { dir, depth } = stack.shift();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      continue;
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth && !SKIP_DIRS.has(entry.name)) {
          stack.push({ dir: full, depth: depth + 1 });
        }
        continue;
      }
      if (entry.isFile()) out.push(full);
    }
  }
  return out;
}

function analyzePath(targetPath) {
  const stat = fs.statSync(targetPath);
  const files = stat.isDirectory()
    ? walk(targetPath, 250, 4)
    : [targetPath];

  const modules = new Set();
  const functions = new Set();
  const routes = new Set();
  const ipc = new Set();
  const hints = new Set();
  const readFiles = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    let content = '';
    try {
      if (TEXT_EXT.has(ext) && fs.statSync(file).size <= 180 * 1024) {
        content = fs.readFileSync(file, 'utf8');
      }
    } catch (err) {
      content = '';
    }
    readFiles.push(path.relative(targetPath, file) || path.basename(file));
    if (!content) continue;

    for (const match of content.matchAll(/(?:import\s+[^;]*?from\s+)?['"](\.{1,2}\/[^'"]+)['"]|require\(['"](\.{1,2}\/[^'"]+)['"]\)/g)) {
      modules.add(match[1] || match[2]);
    }
    for (const match of content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) {
      functions.add(match[1]);
    }
    for (const match of content.matchAll(/\b(?:app|router)\.(?:get|post|put|delete|use)\(\s*['"]([^'"]+)['"]/g)) {
      routes.add(match[1]);
    }
    for (const match of content.matchAll(/ipc(?:Main|Renderer)\.(?:handle|on|invoke)\(\s*['"]([^'"]+)['"]/g)) {
      ipc.add(match[1]);
    }
    for (const match of content.matchAll(/\b(subscription|paywall|premium|subscribe|licen[cs]e|checkout|plan)\b/gi)) {
      hints.add(match[1].toLowerCase());
    }
  }

  let type = 'unknown';
  if (files.some((f) => f.endsWith('.asar'))) type = 'electron-asar';
  if (files.some((f) => path.basename(f) === 'package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(files.find((f) => path.basename(f) === 'package.json'), 'utf8'));
      if (pkg.dependencies?.electron || pkg.devDependencies?.electron) type = 'electron';
      else type = 'node';
    } catch (err) {
      type = 'node';
    }
  }
  if (type === 'unknown' && files.some((f) => /\.(exe|dll)$/i.test(f))) type = 'native-pe';
  if (type === 'unknown' && files.some((f) => /\.(html|htm)$/i.test(f))) type = 'web';

  const digestInput = files.slice(0, 40).join('|');
  return {
    name: path.basename(targetPath),
    kind: 'path',
    path: targetPath,
    type,
    fileCount: files.length,
    files: readFiles.slice(0, 120),
    modules: [...modules].slice(0, 60),
    functions: [...functions].slice(0, 60),
    routes: [...routes].slice(0, 40),
    ipc: [...ipc].slice(0, 40),
    hints: [...hints].slice(0, 30),
    digest: crypto.createHash('sha256').update(digestInput).digest('hex').slice(0, 16)
  };
}

module.exports = { analyzePath };
