const test = require('node:test');
const assert = require('node:assert/strict');
const { wifiThresholds, wifiTierFor } = require('../widgets/wifi-tiers');

test('wifi thresholds are ordered and complete', () => {
  assert.deepEqual(wifiThresholds, [20, 30, 41]);
});

test('wifi latency boundaries have no gaps or overlaps', () => {
  assert.equal(wifiTierFor(0), 'green');
  assert.equal(wifiTierFor(19.99), 'green');
  assert.equal(wifiTierFor(20), 'yellow');
  assert.equal(wifiTierFor(29.99), 'yellow');
  assert.equal(wifiTierFor(30), 'red');
  assert.equal(wifiTierFor(40), 'red');
  assert.equal(wifiTierFor(40.99), 'red');
  assert.equal(wifiTierFor(41), 'purple');
  assert.equal(wifiTierFor(100), 'purple');
});

test('missing wifi latency uses the unavailable tier', () => {
  assert.equal(wifiTierFor(null), 'gray');
  assert.equal(wifiTierFor(Number.NaN), 'gray');
});
