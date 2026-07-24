const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  BOOTSTRAP_API_VERSION,
  RUNTIME_API_VERSION,
  RUNTIME_FEED_URLS,
  RUNTIME_TRUST,
  createRuntimeBootstrap,
  runtimePaths,
} = require('../electron/runtime-trust');

function app(isPackaged = false) {
  return {
    isPackaged,
    getPath: () => '/Users/test/Library/Application Support/Panel',
    getVersion: () => '1.1.0-alpha.1',
  };
}

test('Runtime trust maps each channel to a distinct fixed key', () => {
  assert.equal(BOOTSTRAP_API_VERSION, 1);
  assert.equal(RUNTIME_API_VERSION, 1);
  assert.notEqual(RUNTIME_TRUST.stable.keyId, RUNTIME_TRUST.developer.keyId);
  assert.notEqual(RUNTIME_TRUST.stable.publicKeyFile, RUNTIME_TRUST.developer.publicKeyFile);
  assert.match(RUNTIME_FEED_URLS.developer, /YuYu9372\/Panel\/main\/runtime\/developer-feed\.json$/);
});

test('Runtime paths stay inside fixed App and user-data locations', () => {
  const packaged = runtimePaths({
    app: app(true),
    channel: 'developer',
    resourcesPath: '/Applications/Panel.app/Contents/Resources',
  });
  assert.equal(
    packaged.executable,
    '/Applications/Panel.app/Contents/Resources/bootstrap/panel-bootstrap',
  );
  assert.equal(
    packaged.publicKey,
    '/Applications/Panel.app/Contents/Resources/runtime-trust/developer-public.pem',
  );
  assert.equal(
    packaged.root,
    '/Users/test/Library/Application Support/Panel/runtime-v1/developer',
  );
  const stable = runtimePaths({
    app: app(true),
    channel: 'stable',
    resourcesPath: '/Applications/Panel.app/Contents/Resources',
  });
  assert.equal(
    stable.root,
    '/Users/test/Library/Application Support/Panel/runtime-v1/stable',
  );
  assert.notEqual(packaged.root, stable.root);
});

test('Runtime Bootstrap stays disabled until both immutable resources exist', () => {
  const projectRoot = path.join(__dirname, '..');
  const missing = createRuntimeBootstrap({
    app: app(),
    channel: 'developer',
    projectRoot,
    fsModule: { existsSync: () => false },
  });
  assert.equal(missing, null);
  const available = createRuntimeBootstrap({
    app: app(),
    channel: 'developer',
    projectRoot,
    fsModule: { existsSync: () => true },
    runner: async () => ({ stdout: '{"schemaVersion":1}', stderr: '' }),
  });
  assert.equal(available.channel, 'developer');
  assert.equal(available.keyId, RUNTIME_TRUST.developer.keyId);
});
