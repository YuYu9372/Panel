const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  compactDuration,
  monitoringStats,
} = require('../widgets/status-grid');

const root = path.join(__dirname, '..');

test('Monitoring statistics ignore unavailable windows', () => {
  assert.deepEqual(
    monitoringStats('cpu', [
      { cpu: 10 },
      { cpu: null },
      { cpu: 30 },
      {},
    ]),
    { average: 20, peak: 30, available: 2 },
  );
  assert.deepEqual(
    monitoringStats('wifi', [{ wifi: null }, {}]),
    { average: null, peak: null, available: 0 },
  );
});

test('Monitoring uptime uses a compact server-style duration', () => {
  assert.equal(compactDuration(30), '<1m');
  assert.equal(compactDuration(90 * 60), '1h 30m');
  assert.equal(compactDuration((2 * 24 + 3) * 60 * 60), '2d 3h');
});

test('Dashboard includes the detailed Monitoring screen and 24-cell renderer', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const widget = fs.readFileSync(path.join(root, 'widgets', 'status-grid.js'), 'utf8');
  assert.match(html, /id="monitoring-screen"/);
  assert.match(html, /id="monitoring-back"/);
  assert.match(html, /id="monitoring-grid"/);
  assert.match(widget, /detailBlocks: 24/);
  assert.match(widget, /repeat\(this\.detailBlocks\)/);
  assert.match(widget, /openMonitoring\(row\.dataset\.metric\)/);
});
