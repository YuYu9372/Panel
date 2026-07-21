const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateRefreshPolicy } = require('../widgets/refresh-policy');
const { validateStatusTierConfig } = require('../widgets/status-tiers');
const { validateSettingsLayout } = require('../electron/settings-layout');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'));
}

test('Developer live-patch example contains the exact bundled D configuration', () => {
  const draft = readJson('patches/developer-live-patch.example.json');
  const statusColors = readJson('config/status-colors.json');
  const refreshPolicy = readJson('config/refresh-policy.json');
  const settingsLayout = readJson('config/settings-layout.json');
  assert.deepEqual(validateStatusTierConfig(draft.statusColors), statusColors);
  assert.deepEqual(validateRefreshPolicy(draft.refreshPolicy), refreshPolicy);
  assert.deepEqual(validateSettingsLayout(draft.settingsLayout), settingsLayout);
  assert.equal(draft.appVersionRange, '>=0.5.2-alpha.4 <0.5.3');
  assert.equal(draft.channel, 'developer');
});
