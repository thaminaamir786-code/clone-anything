'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { DIRS, ROOT, getConfig } = require('./config');
const { delay, slug } = require('./utils');
const rea = require('./rea');
const brain = require('./brain');
const zip = require('./zip');
const browser = require('./tools/browser');

const STEP_DEFS = [
  { key: 'prepare', label: 'Getting your target ready' },
  { key: 'tools', label: 'Loading REA tools' },
  { key: 'analyze', label: 'Running REA analysis' },
  { key: 'files', label: 'Reading target files' },
  { key: 'understand', label: 'Explaining the evidence' },
  { key: 'report', label: 'Building the report' },
  { key: 'export', label: 'Packing the evidence bundle' }
];

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.json', '.html', '.css', '.md', '.py', '.java', '.cs', '.go', '.rs']);
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.workbench']);

const jobs = new Map();

function createJob(target, question) {
  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const job = {
    id,
    target: target || { name: 'unknown', type: 'unknown', path: '' },
    question: question || '',
    status: 'queued',
    steps: STEP_DEFS.map((step) => Object.assign({}, step, { status: 'pending', detail: '' })),
    events: [],
    tools: [],
    evidence: null,
    evidenceSize: 0,
    rawOutput: '',
    targetFiles: [],
    observation: null,
    report: '',
    downloadPath: '',
    downloadUrl: '',
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    error: null,
    onEvent: null
  };
  jobs.set(id, job);
  return job;
}

function getJob(id) {
  return jobs.get(id) || null;
}

function publicJob(job) {
  const evidenceJson = job.evidence ? JSON.stringify(job.evidence) : '';
  return {
    id: job.id,
    status: job.status,
    target: job.target,
    question: job.question,
    steps: job.steps,
    events: job.events,
    tools: job.tools,
    evidenceSize: job.evidenceSize,
    evidencePreview: evidenceJson.slice(0, 200000),
    rawOutput: job.rawOutput.slice(0, 120000),
    targetFiles: job.targetFiles,
    observation: job.observation,
    report: job.report,
    downloadUrl: job.downloadUrl,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error
  };
}

async function emit(job, kind, title, text, extra) {
  const event = Object.assign({ kind, title, text, at: new Date().toISOString() }, extra || {});
  job.events.push(event);
  if (typeof job.onEvent === 'function') job.onEvent(event);
  await delay(120);
}

function setStep(job, key, status, detail) {
  const step = job.steps.find((item) => item.key === key);
  if (!step) return;
  step.status = status;
  if (detail) step.detail = String(detail).slice(0, 300);
}

async function thinkFor(job, stepKey, config) {
  const text = await brain.think({
    step: stepKey,
    target: job.target,
    question: job.question,
    evidence: job.evidence || job.observation,
    config
  });
  const label = (job.steps.find((item) => item.key === stepKey) || {}).label || stepKey;
  await emit(job, 'thought', label, text);
}

function collectTargetFiles(root, limit) {
  const collected = [];
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length && collected.length < limit) {
    const { dir, depth } = stack.shift();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (err) { continue; }
    for (const entry of entries) {
      if (collected.length >= limit) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < 4 && !SKIP.has(entry.name)) stack.push({ dir: full, depth: depth + 1 });
        continue;
      }
      if (!entry.isFile() || !TEXT_EXT.has(path.extname(entry.name).toLowerCase())) continue;
      let content;
      try {
        if (fs.statSync(full).size > 80 * 1024) continue;
        content = fs.readFileSync(full, 'utf8').slice(0, 60000);
      } catch (err) { continue; }
      collected.push({ path: path.relative(root, full).replace(/\\/g, '/'), content });
    }
  }
  return collected;
}

function resolveTargetPath(job) {
  const target = job.target || {};
  const value = target.path || '';
  if (target.type === 'demo') return path.join(ROOT, 'examples', 'notes-app');
  if (/^https?:\/\//i.test(value)) return '';
  if (value && fs.existsSync(value)) return value;
  return '';
}

async function runReaAnalysis(job) {
  const targetPath = resolveTargetPath(job);
  const isUrl = /^https?:\/\//i.test(job.target.path || '');

  if (isUrl) {
    try {
      job.observation = await browser.observe(job.target.path);
    } catch (err) {
      job.observation = { error: err.message };
    }
    const result = await rea.analyzeWebBundle(job.target.path);
    if (result.ok && result.data) {
      job.evidence = result.data;
      job.rawOutput = result.raw;
      return 'REA analyze-web-bundle';
    }
    await emit(job, 'tool', 'Browser fallback', 'REA web-bundle capture was unavailable; browser observation is used instead.');
    return 'Browser observation';
  }

  if (targetPath) {
    const jsResult = await rea.analyzeJavaScript(targetPath);
    if (jsResult.ok && jsResult.data) {
      job.evidence = jsResult.data;
      job.rawOutput = jsResult.raw;
      return 'REA analyze-javascript-application';
    }
    const generic = await rea.analyze(targetPath);
    if (generic.ok && generic.data) {
      job.evidence = generic.data;
      job.rawOutput = generic.raw;
      return 'REA analyze';
    }
    throw new Error('REA analysis failed: ' + (generic.error || jsResult.error || 'unknown error'));
  }

  throw new Error('Target path does not exist and is not a URL');
}

function buildReport(job) {
  const evidence = job.evidence || {};
  const limitations = Array.isArray(evidence.limitations) ? evidence.limitations : [];
  const keys = Object.keys(evidence);
  return [
    '# REA analysis report',
    '',
    'Target: ' + (job.target.name || 'unknown'),
    'Path: ' + (job.target.path || 'n/a'),
    'Generated: ' + new Date().toISOString(),
    'Tool: ' + (job.steps.find((s) => s.key === 'analyze') || {}).detail,
    '',
    '## Evidence keys',
    '',
    ...keys.map((key) => '- ' + key),
    '',
    '## Summary',
    '',
    brain.summarizeEvidence(evidence),
    '',
    '## Limitations (from REA)',
    '',
    ...(limitations.length ? limitations.map((item) => '- ' + item) : ['- REA reported no explicit limitation list for this operation.']),
    '',
    '## User question',
    '',
    job.question || '(none)',
    '',
    'This report presents recorded evidence. It does not produce a copied application or bypass any license or subscription.',
    ''
  ].join('\n');
}

async function runJob(job) {
  if (!job || job.status === 'running' || job.status === 'done') return job;
  const config = getConfig();
  job.status = 'running';
  job.startedAt = new Date().toISOString();

  try {
    await thinkFor(job, 'prepare', config);
    setStep(job, 'prepare', 'done');

    const catalog = await rea.listTools();
    job.tools = catalog;
    await thinkFor(job, 'tools', config);
    await emit(job, 'tool', 'REA tool catalog', catalog.length + ' REA tools are installed and available.');
    setStep(job, 'tools', 'done');

    const toolName = await runReaAnalysis(job);
    job.evidenceSize = JSON.stringify(job.evidence || {}).length;
    setStep(job, 'analyze', 'done', toolName);
    await thinkFor(job, 'analyze', config);
    await emit(job, 'tool', toolName, 'REA returned ' + job.evidenceSize + ' bytes of evidence.');

    const targetPath = resolveTargetPath(job);
    if (targetPath) {
      job.targetFiles = collectTargetFiles(targetPath, 60);
    }
    await thinkFor(job, 'files', config);
    await emit(job, 'tool', 'Target files', 'Read-only snapshot of ' + job.targetFiles.length + ' original target files.');
    setStep(job, 'files', 'done');

    await thinkFor(job, 'understand', config);
    setStep(job, 'understand', 'done');

    job.report = buildReport(job);
    await thinkFor(job, 'report', config);
    setStep(job, 'report', 'done');

    const files = {
      'report.md': job.report,
      'rea-evidence.json': JSON.stringify(job.evidence || {}, null, 2),
      'rea-output.txt': job.rawOutput.slice(0, 1024 * 1024),
      'README-evidence-bundle.md': [
        '# Evidence bundle',
        '',
        'Generated by Clone Anything using the official REA package (MIT).',
        'This bundle contains recorded analysis evidence, not a copied application.',
        ''
      ].join('\n')
    };
    for (const file of job.targetFiles) {
      files['target-files/' + file.path] = file.content;
    }
    const archive = zip.createZip(files);
    const exportPath = path.join(DIRS.exports, `${job.id}.zip`);
    fs.writeFileSync(exportPath, archive);
    job.downloadPath = exportPath;
    job.downloadUrl = '/api/download/' + job.id;
    await thinkFor(job, 'export', config);
    await emit(job, 'done', 'REA evidence ready', 'Bundle contains the report, full evidence, tool output and target file snapshots.', {
      downloadUrl: job.downloadUrl
    });
    setStep(job, 'export', 'done');

    job.evidenceSize = JSON.stringify(job.evidence || {}).length;
    job.status = 'done';
  } catch (err) {
    if (process.env.DEBUG_REA) console.error(err && err.stack ? err.stack : err);
    job.status = 'error';
    job.error = err && err.message ? err.message : String(err);
    await emit(job, 'error', 'Analysis stopped', job.error);
  } finally {
    job.finishedAt = new Date().toISOString();
  }
  return job;
}

module.exports = { createJob, getJob, publicJob, runJob, STEP_DEFS };
