'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const DEMO_TARGET = {
  id: 'demo-notes',
  name: 'Notes Example (built-in demo)',
  type: 'demo',
  path: 'builtin://notes-example',
  version: '1.0',
  description: 'Six-file Electron-style sample with an Export notes action. Safe to analyze and reconstruct.'
};

async function registryApps() {
  if (process.platform !== 'win32') return [];
  const keys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  ];
  const found = [];
  for (const key of keys) {
    try {
      const { stdout } = await execFileAsync('reg', ['query', key, '/s'], {
        maxBuffer: 24 * 1024 * 1024,
        windowsHide: true,
        timeout: 8000
      });
      let current = {};
      for (const line of stdout.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.startsWith('HKEY')) {
          if (current.DisplayName) found.push(current);
          current = {};
          continue;
        }
        const match = trimmed.match(/^(DisplayName|DisplayVersion|InstallLocation)\s+REG_\w+\s+(.*)$/);
        if (match) current[match[1]] = match[2].trim();
      }
      if (current.DisplayName) found.push(current);
    } catch (err) {
      // Registry access is optional; keep scanning other sources.
    }
  }
  return found
    .filter((item) => item.DisplayName && item.DisplayName.length > 1)
    .map((item) => ({
      id: `reg-${Buffer.from(item.DisplayName).toString('hex').slice(0, 16)}`,
      name: item.DisplayName,
      type: 'installed',
      path: item.InstallLocation || '',
      version: item.DisplayVersion || '',
      description: 'Installed application found in the Windows registry'
    }));
}

function directoryApps() {
  const roots = [
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    path.join(process.env.LOCALAPPDATA || '', 'Programs')
  ].filter(Boolean);

  const found = [];
  for (const root of roots) {
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || found.length >= 120) continue;
        found.push({
          id: `dir-${Buffer.from(root + entry.name).toString('hex').slice(0, 16)}`,
          name: entry.name,
          type: 'installed',
          path: path.join(root, entry.name),
          version: '',
          description: 'Application folder found on this computer'
        });
      }
    } catch (err) {
      // Unreadable roots are skipped.
    }
  }
  return found;
}

function customTarget(input) {
  const isUrl = /^https?:\/\//i.test(input);
  let label = input;
  let exists = isUrl;
  if (!isUrl) {
    try {
      exists = fs.existsSync(input);
      label = path.basename(input);
    } catch (err) {
      exists = false;
    }
  }
  return {
    id: `custom-${Date.now()}`,
    name: label || input,
    type: isUrl ? 'url' : (exists ? 'path' : 'unknown'),
    path: input,
    version: '',
    description: isUrl ? 'Website target for browser observation' : 'Local path target'
  };
}

async function searchTargets(query) {
  const q = String(query || '').trim();

  if (/^https?:\/\//i.test(q)) return [customTarget(q)];

  if (q && (path.isAbsolute(q) || q.includes('\\') || q.includes('/'))) {
    try {
      if (fs.existsSync(q)) return [customTarget(q)];
    } catch (err) {
      // Fall through to name search.
    }
  }

  const registry = await registryApps();
  const directories = directoryApps();
  const all = [...registry, ...directories];
  const seen = new Set();
  const matches = [];

  for (const item of all) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!q || key.includes(q.toLowerCase())) matches.push(item);
    if (matches.length >= 24) break;
  }

  return [DEMO_TARGET, ...matches];
}

module.exports = { searchTargets, DEMO_TARGET };
