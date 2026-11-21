'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { DIRS, getConfig } = require('./config');
const { delay } = require('./utils');
const fsanalyze = require('./tools/fsanalyze');
const browser = require('./tools/browser');
const brain = require('./brain');
const generator = require('./generator');
const zip = require('./zip');

const STEP_DEFS = [
  { key: 'prepare', label: 'Getting your app ready' },
  { key: 'inspect', label: 'Inspecting target' },
  { key: 'read', label: 'Reading code' },
  { key: 'understand', label: 'Understanding behavior' },
  { key: 'reconstruct', label: 'Writing files' },
  { key: 'normalize', label: 'Removing mock subscription gate (demo only)' },
  { key: 'verify', label: 'Verifying output' },
  { key: 'export', label: 'Exporting downloadable project' }
];

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
    files: {},
    report: null,
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
  return {
    id: job.id,
    status: job.status,
    target: job.target,
    question: job.question,
    steps: job.steps,
    events: job.events,
    files: job.files,
    report: job.report,
    downloadUrl: job.downloadUrl,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error
  };
}

async function emit(job, kind, title, text, extra) {
  const event = Object.assign({
    kind,
    title,
    text,
    at: new Date().toISOString()
  }, extra || {});
  job.events.push(event);
  if (typeof job.onEvent === 'function') job.onEvent(event);
  await delay(140);
}

function setStep(job, key, status, detail) {
  const step = job.steps.find((item) => item.key === key);
  if (!step) return;
  step.status = status;
  if (detail) step.detail = String(detail).slice(0, 300);
}

async function thinkFor(job, facts, stepKey, config) {
  const text = await brain.think({
    facts,
    step: stepKey,
    question: job.question,
    config
  });
  const label = (job.steps.find((item) => item.key === stepKey) || {}).label || stepKey;
  await emit(job, 'thought', label, text);
}

function writeTree(root, files) {
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
}

async function resolveTarget(job) {
  const target = job.target || {};
  const targetPath = target.path || '';

  if (target.type === 'demo') {
    const dir = path.join(DIRS.targets, job.id);
    fs.mkdirSync(dir, { recursive: true });
    const sources = generator.demoSourceFiles();
    writeTree(dir, sources);
    return {
      kind: 'demo',
      path: dir,
      facts: {
        name: target.name || 'Notes Example',
        type: 'electron-demo',
        path: dir,
        fileCount: Object.keys(sources).length,
        files: Object.keys(sources),
        modules: ['./notes', './csv'],
        functions: ['exportNotes', 'listNotes', 'toCsv'],
        routes: [],
        ipc: ['notes:export'],
        hints: ['export', 'csv', 'mock subscription (demo)'],
        digest: 'demo-notes',
        authorizedScope: 'Built-in demo generated locally by this workbench'
      }
    };
  }

  if (/^https?:\/\//i.test(targetPath)) {
    const observation = await browser.observe(targetPath);
    return {
      kind: 'url',
      path: targetPath,
      facts: {
        name: target.name || targetPath,
        type: 'website',
        path: targetPath,
        fileCount: 0,
        files: [],
        modules: observation.scripts || [],
        functions: [],
        routes: observation.forms || [],
        ipc: [],
        hints: [observation.title].filter(Boolean),
        digest: '',
        browser: observation,
        authorizedScope: 'Public website observation; verify your right to analyze it'
      }
    };
  }

  if (targetPath && fs.existsSync(targetPath)) {
    const facts = fsanalyze.analyzePath(targetPath);
    facts.authorizedScope = 'Local target supplied by the operator';
    return { kind: 'path', path: targetPath, facts };
  }

  return {
    kind: 'unknown',
    path: targetPath,
    facts: {
      name: target.name || 'unknown',
      type: 'unknown',
      path: targetPath,
      fileCount: 0,
      files: [],
      modules: [],
      functions: [],
      routes: [],
      ipc: [],
      hints: [],
      digest: '',
      authorizedScope: 'Target could not be resolved'
    }
  };
}

async function runJob(job) {
  if (!job || job.status === 'running' || job.status === 'done') return job;
  const config = getConfig();
  job.status = 'running';
  job.startedAt = new Date().toISOString();

  let facts = { name: job.target.name };
  let files = {};

  try {
    await thinkFor(job, facts, 'prepare', config);
    setStep(job, 'prepare', 'done');
    await emit(job, 'tool', 'Authorization check', 'Analysis stays local. No subscription, paywall, license check or DRM is bypassed.');

    const resolved = await resolveTarget(job);
    facts = resolved.facts;
    await thinkFor(job, facts, 'inspect', config);
    await emit(job, 'tool', 'Target inspector', `Resolved ${resolved.kind} target: ${facts.name} (${facts.type}).`);
    setStep(job, 'inspect', 'done');

    await thinkFor(job, facts, 'read', config);
    await emit(job, 'tool', 'Static reader', `Captured ${(facts.files || []).length} file references, ${(facts.modules || []).length} modules and ${(facts.functions || []).length} functions.`);
    setStep(job, 'read', 'done');

    await thinkFor(job, facts, 'understand', config);
    if (facts.browser) {
      await emit(job, 'tool', 'Browser tool', `Observation via ${facts.browser.tool}: title "${facts.browser.title || 'untitled'}", ${(facts.browser.scripts || []).length} scripts found.`);
    }
    setStep(job, 'understand', 'done');

    files = generator.generateReconstruction(facts, { demo: resolved.kind === 'demo', question: job.question });
    job.files = files;
    await thinkFor(job, facts, 'reconstruct', config);
    await emit(job, 'tool', 'File writer', `Created ${Object.keys(files).length} original project files.`);
    setStep(job, 'reconstruct', 'done');

    if (resolved.kind === 'demo') {
      const stripped = generator.stripMockPaywall(files);
      files = stripped.files;
      job.files = files;
      await thinkFor(job, facts, 'normalize', config);
      await emit(job, 'tool', 'Mock-gate cleanup', `Removed ${stripped.removed} lines of mock subscription scaffolding from the generated demo copy only.`);
      setStep(job, 'normalize', 'done');
    } else {
      setStep(job, 'normalize', 'skipped', 'No mock scaffolding in generated output');
    }

    const buildDir = path.join(DIRS.build, job.id);
    fs.mkdirSync(buildDir, { recursive: true });
    writeTree(buildDir, files);

    const syntaxErrors = [];
    for (const [relative, content] of Object.entries(files)) {
      if (!/\.js$/.test(relative)) continue;
      try {
        new vm.Script(content, { filename: relative });
      } catch (err) {
        syntaxErrors.push(`${relative}: ${err.message}`);
      }
    }
    await thinkFor(job, facts, 'verify', config);
    if (syntaxErrors.length) {
      await emit(job, 'tool', 'Verifier', syntaxErrors.join('\n'));
      throw new Error('Generated files failed syntax verification');
    }
    await emit(job, 'tool', 'Verifier', 'All generated JavaScript files passed syntax verification.');
    setStep(job, 'verify', 'done');

    const archive = zip.createZip(files);
    const exportPath = path.join(DIRS.exports, `${job.id}.zip`);
    fs.writeFileSync(exportPath, archive);
    job.downloadPath = exportPath;
    job.downloadUrl = `/api/download/${job.id}`;
    job.report = facts;
    await thinkFor(job, facts, 'export', config);
    await emit(job, 'done', 'Reconstruction ready', `Downloadable project created with ${Object.keys(files).length} files.`, {
      downloadUrl: job.downloadUrl
    });
    setStep(job, 'export', 'done');

    job.status = 'done';
  } catch (err) {
    job.status = 'error';
    job.error = err && err.message ? err.message : String(err);
    await emit(job, 'error', 'Analysis stopped', job.error);
  } finally {
    job.finishedAt = new Date().toISOString();
  }
  return job;
}

module.exports = { createJob, getJob, publicJob, runJob, STEP_DEFS };
