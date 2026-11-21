'use strict';

const { getConfig } = require('./config');

const SYSTEM_PROMPT = [
  'You are the reasoning core of Clone Anything, an app analysis and reconstruction workbench.',
  'You work like REA: inspect evidence first, then explain, then generate original code.',
  'You only analyze software the user owns or is authorized to examine.',
  'You never help clone proprietary apps, copy protected code, bypass subscriptions, paywalls, licensing or DRM.',
  'Generated projects must be original implementations, not copies of the target.',
  'Write concise, confident reasoning with references to the evidence you were given.'
].join(' ');

function buildUserPrompt(ctx) {
  const facts = ctx.facts || {};
  return [
    `Step: ${ctx.step || 'analysis'}`,
    `Question from user: ${ctx.question || ''}`,
    `Target: ${facts.name || 'unknown'}`,
    `Detected type: ${facts.type || 'unknown'}`,
    `Files inspected: ${(facts.files || []).length}`,
    `Modules: ${(facts.modules || []).slice(0, 8).join(', ')}`,
    `Functions: ${(facts.functions || []).slice(0, 8).join(', ')}`,
    `Routes: ${(facts.routes || []).slice(0, 6).join(', ')}`,
    `IPC handlers: ${(facts.ipc || []).slice(0, 6).join(', ')}`,
    `Browser observation: ${facts.browser ? JSON.stringify(facts.browser).slice(0, 900) : 'none'}`,
    'Give a short reasoning paragraph about what the evidence shows and what to do next.'
  ].join('\n');
}

function fallback(ctx) {
  const facts = ctx.facts || {};
  const step = ctx.step || 'analysis';
  const name = facts.name || 'the target';
  const type = facts.type || 'unknown';
  const fileCount = (facts.files || []).length;
  const modules = (facts.modules || []).length;
  const functions = (facts.functions || []).length;
  const routes = (facts.routes || []).length;
  const ipc = (facts.ipc || []).length;

  const byStep = {
    prepare: `Target "${name}" is registered as an authorized analysis job. I will keep all work local and avoid any protected or proprietary material.`,
    inspect: `The target looks like a ${type}. I found ${fileCount} readable file references and a digest of ${facts.digest || 'n/a'}; that gives enough structure to start tracing behavior.`,
    read: `I scanned ${fileCount} files and recovered ${modules} module references, ${functions} function names, ${routes} routes and ${ipc} IPC handlers. These are the anchors for understanding the feature.`,
    understand: facts.browser
      ? `Browser observation returned the page title "${facts.browser.title || 'untitled'}", ${(facts.browser.scripts || []).length} scripts and ${(facts.browser.forms || []).length} forms. I will treat those as runtime evidence, not as code to copy.`
      : `No live browser session was available, so I am relying on the static evidence. The detected structure still supports a minimal original reconstruction.`,
    reconstruct: `I am writing an original project from the findings. No source code is copied from "${name}"; the output is a fresh implementation with its own MIT license.`,
    normalize: `The demo source I generated contains a clearly marked mock subscription gate. I am stripping that scaffolding from the generated copy only - no real paywall or license check is touched.`,
    verify: `I am syntax-checking every generated JavaScript file before packaging so the downloadable project opens cleanly.`,
    export: `The original reconstruction is complete and packaged for download. The report keeps the evidence and limitations alongside the code.`
  };

  return byStep[step] || `I reviewed the evidence for "${name}" and will continue with an original, authorized reconstruction.`;
}

async function think(ctx) {
  const config = ctx.config || getConfig();
  const ai = config.ai || {};
  if (ai.apiKey && ai.baseUrl) {
    try {
      const base = String(ai.baseUrl).replace(/\/$/, '');
      const response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${ai.apiKey}`
        },
        body: JSON.stringify({
          model: ai.model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(ctx) }
          ],
          temperature: 0.3,
          max_tokens: 600
        }),
        signal: AbortSignal.timeout(20000)
      });
      if (response.ok) {
        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    } catch (err) {
      // Fall back to the deterministic local brain.
    }
  }
  return fallback(ctx);
}

module.exports = { think, SYSTEM_PROMPT, fallback };
