'use strict';

const { getConfig } = require('./config');

const SYSTEM_PROMPT = [
  'You are the reasoning layer of Clone Anything, a web front-end for REA-style analysis.',
  'REA (Reverse Engineer Anything) supplies local Evidence about a real target.',
  'Your job is to explain that Evidence, point to concrete facts, and state limitations.',
  'Never invent a different app. Never claim code was copied or that a paywall/license was bypassed.',
  'If evidence is missing or inconclusive, say so plainly.'
].join(' ');

function summarizeEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') return 'REA returned no structured Evidence.';
  const keys = Object.keys(evidence).slice(0, 10);
  const confidence = evidence.confidence || evidence.authority || 'not reported';
  const limitations = Array.isArray(evidence.limitations) ? evidence.limitations.length : 0;
  const graph = evidence.application_graph || evidence.graph || {};
  const sources = Array.isArray(graph.sources) ? graph.sources.length : 0;
  const unknowns = Array.isArray(graph.unknowns) ? graph.unknowns.length : 0;
  return [
    'REA recorded Evidence with keys: ' + keys.join(', ') + '.',
    'Confidence/authority: ' + confidence + '.',
    sources ? 'The application graph retains ' + sources + ' source records and ' + unknowns + ' unknown records.' : '',
    limitations ? 'REA declares ' + limitations + ' explicit limitations; treat those as authoritative.' : ''
  ].filter(Boolean).join(' ');
}

function fallback(ctx) {
  const step = ctx.step || 'analysis';
  const evidence = ctx.evidence;
  const target = (ctx.target && ctx.target.name) || 'the target';
  const byStep = {
    prepare: 'Registered ' + target + ' as an authorized analysis job. All REA tools run locally on your machine.',
    tools: 'Loaded the installed REA tool catalog. Every action below is an actual REA tool, not a simulated one.',
    analyze: 'REA has inspected ' + target + '. ' + summarizeEvidence(evidence),
    files: 'Collected a read-only snapshot of the target files so you can view the original source alongside the evidence.',
    understand: summarizeEvidence(evidence) + ' The summary stays faithful to the recorded facts.',
    report: 'Built a report from the REA Evidence. Any unknowns and limitations are kept visible rather than hidden.',
    export: 'Packaged the REA Evidence, tool output and report into a downloadable evidence bundle.'
  };
  return byStep[step] || summarizeEvidence(evidence) || ('Analyzing ' + target + '.');
}

async function think(ctx) {
  const config = ctx.config || getConfig();
  const ai = config.ai || {};
  if (ai.apiKey && ai.baseUrl) {
    try {
      const base = String(ai.baseUrl).replace(/\/$/, '');
      const response = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + ai.apiKey
        },
        body: JSON.stringify({
          model: ai.model || 'hy4',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                'Step: ' + (ctx.step || 'analysis'),
                'Target: ' + ((ctx.target && ctx.target.name) || 'unknown'),
                'User question: ' + (ctx.question || ''),
                'REA Evidence (JSON, possibly truncated):',
                JSON.stringify(ctx.evidence || {}).slice(0, 12000),
                'Write a short, evidence-grounded explanation.'
              ].join('\n')
            }
          ],
          temperature: 0.2,
          max_tokens: 700
        }),
        signal: AbortSignal.timeout(25000)
      });
      if (response.ok) {
        const data = await response.json();
        const text = data && data.choices && data.choices[0] && data.choices[0].message
          ? String(data.choices[0].message.content || '').trim()
          : '';
        if (text) return text;
      }
    } catch (err) {
      // Fall back to deterministic evidence summary.
    }
  }
  return fallback(ctx);
}

module.exports = { think, fallback, summarizeEvidence, SYSTEM_PROMPT };
