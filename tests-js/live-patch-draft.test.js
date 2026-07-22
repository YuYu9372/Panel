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

test('Developer live-patch example contains the exact bundled 1.0.1 configuration', () => {
  const draft = readJson('patches/developer-live-patch.example.json');
  const statusColors = readJson('config/status-colors.json');
  const refreshPolicy = readJson('config/refresh-policy.json');
  const settingsLayout = readJson('config/settings-layout.json');
  assert.deepEqual(validateStatusTierConfig(draft.statusColors), statusColors);
  assert.deepEqual(validateRefreshPolicy(draft.refreshPolicy), refreshPolicy);
  assert.deepEqual(validateSettingsLayout(draft.settingsLayout), settingsLayout);
  assert.equal(draft.appVersionRange, '>=1.0.1 <1.0.2');
  assert.equal(draft.patchNumber, 1);
  assert.equal(draft.channel, 'developer');
});

test('release metadata identifies the developer 1.0.1 build and artifact', () => {
  const version = readJson('VERSION.json');
  const packageJson = readJson('package.json');
  assert.deepEqual(version, {
    appVersion: '1.0.1',
    channel: 'devbeta',
    build: '1.0.1+1.1D',
    gitTag: '1.0.1',
    artifact: 'panel.dmg',
    public: false,
    livePatchCompatibility: '>=1.0.1 <1.0.2',
  });
  assert.equal(packageJson.version, '1.0.1-alpha.1');
  assert.equal(packageJson.build.artifactName, 'panel.${ext}');
  assert.equal(packageJson.build.directories.output, 'dist/1.0.1/1.0.1+1.1D');
  assert.equal(packageJson.build.publish[0].channel, 'alpha');
  assert.equal(packageJson.build.publish[0].repo, 'Panel');
});
