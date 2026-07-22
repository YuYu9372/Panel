const test = require('node:test');
const assert = require('node:assert/strict');
const { RuntimeBootstrap, parseResult } = require('../electron/runtime-bootstrap');

function options(overrides = {}) {
  return {
    executable: '/Applications/Panel.app/Contents/Resources/bootstrap/panel-bootstrap',
    root: '/Users/test/Library/Application Support/Panel/runtime-v1',
    publicKey: '/Applications/Panel.app/Contents/Resources/runtime-trust/developer.pem',
    keyId: 'panel-runtime-developer-2026-01',
    appVersion: '1.1.0-alpha.1',
    channel: 'developer',
    ...overrides,
  };
}

test('Runtime Bootstrap uses argument arrays and a credential-free environment', async () => {
  let invocation;
  const bootstrap = new RuntimeBootstrap(options({
    runner: async (executable, args, commandOptions) => {
      invocation = { executable, args, commandOptions };
      return { stdout: '{"runtimeRevision":1}', stderr: '' };
    },
  }));
  const packagePath = '/tmp/runtime package; echo unsafe.zip';
  const result = await bootstrap.verify(packagePath);
  assert.equal(result.runtimeRevision, 1);
  assert.equal(invocation.executable, options().executable);
  assert.deepEqual(invocation.args.slice(0, 4), [
    '--root', options().root, 'verify', packagePath,
  ]);
  assert.equal(invocation.commandOptions.shell, false);
  assert.equal(invocation.commandOptions.env.ANTHROPIC_API_KEY, undefined);
  assert.equal(invocation.commandOptions.env.COMPOSIO_MCP_TOKEN, undefined);
});

test('Runtime Bootstrap prevents overlapping state transitions', async () => {
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const bootstrap = new RuntimeBootstrap(options({
    runner: async () => {
      await blocked;
      return { stdout: '{"status":"healthy"}', stderr: '' };
    },
  }));
  const active = bootstrap.confirm();
  await assert.rejects(bootstrap.rollback(), /operation is active/);
  release();
  assert.deepEqual(await active, { status: 'healthy' });
});

test('Runtime Bootstrap rejects unsafe construction and malformed output', async () => {
  assert.throws(() => new RuntimeBootstrap(options({ executable: 'panel-bootstrap' })), /absolute path/);
  assert.throws(() => new RuntimeBootstrap(options({ channel: 'nightly' })), /channel/);
  assert.throws(() => new RuntimeBootstrap(options({ appVersion: '1.1' })), /App version/);
  assert.throws(() => parseResult('not-json'), /invalid JSON/);
  const bootstrap = new RuntimeBootstrap(options({
    runner: async () => ({ stdout: '[]', stderr: '' }),
  }));
  await assert.rejects(bootstrap.status(), /invalid JSON/);
  assert.throws(() => bootstrap.stage('/tmp/runtime.dmg'), /ZIP file/);
});
