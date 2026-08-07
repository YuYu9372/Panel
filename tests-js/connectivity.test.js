const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { formatOfflineDuration } = require('../widgets/connectivity');

const root = path.join(__dirname, '..');

test('Offline duration uses an unbounded tabular stopwatch', () => {
  assert.equal(formatOfflineDuration(0), '00:00:00');
  assert.equal(formatOfflineDuration(1000), '00:00:01');
  assert.equal(formatOfflineDuration((1 * 3600 + 2 * 60 + 3) * 1000), '01:02:03');
  assert.equal(formatOfflineDuration((26 * 3600 + 4) * 1000), '26:00:04');
  assert.equal(formatOfflineDuration(-5000), '00:00:00');
  assert.equal(formatOfflineDuration(null), '00:00:00');
});

test('Offline screen exposes the stopwatch element and refreshed widget asset', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="offline-stopwatch">00:00:00<\/time>/);
  assert.match(html, /widgets\/connectivity\.js\?v=5/);
});
