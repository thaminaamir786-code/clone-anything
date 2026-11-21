'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const zip = require('../src/zip');
const generator = require('../src/generator');
const brain = require('../src/brain');
const { createZip } = zip;

test('ZIP writer produces a valid empty-root archive', () => {
  const buffer = createZip({ 'hello.txt': 'hello world' });
  assert.ok(buffer.length > 100);
  assert.equal(buffer.readUInt32LE(0), 0x04034b50);
  assert.ok(buffer.includes(Buffer.from('hello.txt')));
});

test('demo source contains a clearly marked mock gate and the stripper removes it', () => {
  const files = generator.demoSourceFiles();
  assert.match(files['src/main.js'], /MOCK-SUBSCRIPTION-START/);
  const result = generator.stripMockPaywall(files);
  assert.ok(result.removed > 0);
  assert.doesNotMatch(result.files['src/main.js'], /MOCK-SUBSCRIPTION|@mock-paywall|requireMockSubscription/);
});

test('generated reconstruction includes license and notices', () => {
  const output = generator.generateReconstruction({ name: 'Demo', type: 'demo' }, { demo: false });
  assert.ok(output['package.json']);
  assert.ok(output['src/index.js']);
  assert.ok(output['THIRD_PARTY_NOTICES.md']);
  assert.match(output['THIRD_PARTY_NOTICES.md'], /morluto\/rea/);
});

test('local brain returns a reasoning paragraph', async () => {
  const text = await brain.think({
    facts: { name: 'Demo', type: 'demo', files: ['a.js'] },
    step: 'inspect',
    question: 'What does it do?',
    config: { ai: {} }
  });
  assert.equal(typeof text, 'string');
  assert.ok(text.length > 20);
});
