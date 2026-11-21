'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
// Runtime data goes to the user profile so the app also works when installed
// under a protected folder such as "Program Files".
const WORKSPACE = process.env.CLONE_ANYTHING_WORKSPACE
  ? path.resolve(process.env.CLONE_ANYTHING_WORKSPACE)
  : path.join(os.homedir(), '.clone-anything-workbench');
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
