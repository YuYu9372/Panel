const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  SettingsStore,
  validateRefreshMinutes,
  validateUpdateChannel,
} = require('../electron/settings-store');

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`protected:${Buffer.from(value).toString('base64')}`),
    decryptString: (value) => Buffer.from(
      value.toString().slice('protected:'.length),
      'base64',
    ).toString(),
  };
}

function withStore(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-settings-test-'));
  try {
    return run(new SettingsStore({
      safeStorage: fakeSafeStorage(),
      userDataPath: directory,
    }));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('new settings use the fifteen minute default without credentials', () => {
  withStore((store) => {
    assert.deepEqual(store.status(), {
      refreshMinutes: 15,
      updateChannel: 'stable',
      hasAnthropicApiKey: false,
      hasComposioMcpToken: false,
    });
  });
});

test('credentials are encrypted on disk and decrypt for the managed server', () => {
  withStore((store) => {
    const values = {
      refreshMinutes: 30,
      updateChannel: 'stable',
      anthropicApiKey: 'anthropic-secret-value',
      composioMcpToken: 'composio-secret-value',
    };
    store.save(values);
    const contents = fs.readFileSync(store.file, 'utf8');
    assert.equal(contents.includes(values.anthropicApiKey), false);
    assert.equal(contents.includes(values.composioMcpToken), false);
    assert.deepEqual(store.runtimeSettings(), values);
    assert.equal(fs.statSync(store.file).mode & 0o777, 0o600);
  });
});

test('blank credential fields preserve previously saved values', () => {
  withStore((store) => {
    store.save({
      refreshMinutes: 15,
      anthropicApiKey: 'first-key',
      composioMcpToken: 'first-token',
    });
    store.save({
      refreshMinutes: 20,
      anthropicApiKey: '',
      composioMcpToken: '',
    });
    assert.deepEqual(store.runtimeSettings(), {
      refreshMinutes: 20,
      updateChannel: 'stable',
      anthropicApiKey: 'first-key',
      composioMcpToken: 'first-token',
    });
  });
});

test('update channel is stored without changing encrypted credentials', () => {
  withStore((store) => {
    store.save({
      refreshMinutes: 15,
      anthropicApiKey: 'saved-key',
      composioMcpToken: 'saved-token',
    });
    store.setUpdateChannel('developer');
    assert.deepEqual(store.runtimeSettings(), {
      refreshMinutes: 15,
      updateChannel: 'developer',
      anthropicApiKey: 'saved-key',
      composioMcpToken: 'saved-token',
    });
    assert.equal(store.status().updateChannel, 'developer');
  });
});

test('update channel only accepts stable and developer', () => {
  assert.equal(validateUpdateChannel('stable'), 'stable');
  assert.equal(validateUpdateChannel('developer'), 'developer');
  assert.throws(() => validateUpdateChannel('nightly'));
});

test('status checks encrypted field presence without decrypting credentials', () => {
  withStore((store) => {
    store.save({
      refreshMinutes: 15,
      anthropicApiKey: 'saved-key',
      composioMcpToken: 'saved-token',
    });
    store.safeStorage.decryptString = () => {
      throw new Error('Credentials should not be decrypted for status.');
    };
    assert.deepEqual(store.status(), {
      refreshMinutes: 15,
      updateChannel: 'stable',
      hasAnthropicApiKey: true,
      hasComposioMcpToken: true,
    });
  });
});

test('refresh time only accepts whole minutes in the supported range', () => {
  assert.equal(validateRefreshMinutes(1), 1);
  assert.equal(validateRefreshMinutes(1440), 1440);
  assert.throws(() => validateRefreshMinutes(0));
  assert.throws(() => validateRefreshMinutes(1.5));
  assert.throws(() => validateRefreshMinutes(1441));
});
