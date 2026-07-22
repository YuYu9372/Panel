const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  expectedPackageVersion,
  matchesPackageVersion,
  runtimeVersionInfo,
  validateVersionInfo,
} = require('../electron/version-info');

const versionInfo = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'VERSION.json'),
  'utf8',
));

test('developer 1.0.1 metadata follows the build naming scheme', () => {
  assert.deepEqual(validateVersionInfo(versionInfo), versionInfo);
  assert.equal(versionInfo.build, '1.0.1+1.1D');
  assert.equal(versionInfo.artifact, 'panel.dmg');
});

test('runtime metadata adds only a validated positive patch number', () => {
  assert.equal(runtimeVersionInfo(versionInfo, 2).build, '1.0.1+1.1Dp2');
  assert.equal(runtimeVersionInfo(versionInfo, 0).build, '1.0.1+1.1D');
  assert.equal(runtimeVersionInfo(versionInfo, '2').build, '1.0.1+1.1D');
});

test('developer metadata matches only its corresponding packaged prerelease', () => {
  assert.equal(expectedPackageVersion(versionInfo), '1.0.1-alpha.1');
  assert.equal(matchesPackageVersion(versionInfo, '1.0.1-alpha.1'), true);
  assert.equal(matchesPackageVersion(versionInfo, '1.0.1'), false);
  assert.equal(matchesPackageVersion(versionInfo, '1.0.1-alpha.2'), false);
});

test('metadata rejects mismatched channels, artifacts, and compatibility', () => {
  assert.throws(
    () => validateVersionInfo({ ...versionInfo, channel: 'Beta' }),
    /does not match/,
  );
  assert.throws(
    () => validateVersionInfo({ ...versionInfo, artifact: 'other.dmg' }),
    /artifact/,
  );
  assert.throws(
    () => validateVersionInfo({ ...versionInfo, livePatchCompatibility: '>=1.0.2' }),
    /compatibility/,
  );
});

test('dashboard exposes public version and triple-click build details', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '..', 'widgets', 'version.js'), 'utf8');
  assert.match(html, /id="app-version"[^>]*>1\.0\.1</);
  assert.match(html, /id="version-dialog"/);
  assert.match(script, /event\.detail === 3/);
  assert.match(script, /JSON\.stringify\(this\.metadata/);
});
