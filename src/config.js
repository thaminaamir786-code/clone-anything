'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKSPACE = path.join(ROOT, '.workbench');
const DIRS = {
  root: WORKSPACE,
  jobs: path.join(WORKSPACE, 'jobs'),
  exports: path.join(WORKSPACE, 'exports'),
  targets: path.join(WORKSPACE, 'targets'),
  build: path.join(WORKSPACE, 'build')
};

for (const dir of Object.values(DIRS)) {
  fs.mkdirSync(dir, { recursive: true });
}

function getConfig() {
  return {
    port: Number(process.env.PORT || 3000),
    ai: {
      baseUrl: process.env.AI_BASE_URL || '',
      apiKey: process.env.AI_API_KEY || '',
      model: process.env.AI_MODEL || 'gpt-4o-mini'
    },
    browser: {
      cdpUrl: process.env.BROWSER_CDP_URL || 'http://127.0.0.1:9222'
    }
  };
}

module.exports = { ROOT, WORKSPACE, DIRS, getConfig };
