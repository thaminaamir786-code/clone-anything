'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const zip = require('../src/zip');
const brain = require('../src/brain');
const { setModel, getConfig } = require('../src/config');

test('ZIP writer produces a valid archive', () => {
  const buffer = zip.createZip({ 'hello.txt': 'hello world' });
  assert.ok(buffer.length > 100);
  assert.equal(buffer.readUInt32LE(0), 0x04034b50);
  assert.ok(buffer.includes(Buffer.from('hello.txt')));
});

test('local brain summarizes real evidence keys', () => {
  const text = brain.fallback({
    step: 'analyze',
    target: { name: 'Demo' },
    evidence: { confidence: 'derived', limitations: ['a', 'b'] }
  });
  assert.match(text, /REA recorded Evidence/);
  assert.match(text, /derived/);
  assert.match(text, /2 explicit limitations/);
});

test('model settings can be changed at runtime', () => {
  const before = getConfig().ai.model;
  const saved = setModel({ baseUrl: '', apiKey: '', model: 'test-model' });
  assert.equal(saved.model, 'test-model');
  setModel({ model: before });
});
