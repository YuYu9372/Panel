const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateRefreshPolicy } = require('../widgets/refresh-policy');
const { validateStatusTierConfig } = require('../widgets/status-tiers');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'));
}

test('Developer live-patch example contains the exact bundled C configuration', () => {
  const draft = readJson('patches/developer-live-patch.example.json');
  const statusColors = readJson('config/status-colors.json');
  const refreshPolicy = readJson('config/refresh-policy.json');
  assert.deepEqual(validateStatusTierConfig(draft.statusColors), statusColors);
  assert.deepEqual(validateRefreshPolicy(draft.refreshPolicy), refreshPolicy);
  assert.equal(draft.appVersionRange, '>=0.5.2-alpha.3 <0.5.3');
  assert.equal(draft.channel, 'developer');
});
