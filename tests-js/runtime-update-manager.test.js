const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { canonicalJson } = require('../electron/patch-security');
const { RuntimeUpdateManager } = require('../electron/runtime-update-manager');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const feedUrl = 'https://raw.githubusercontent.com/YuYu9372/Panel/main/runtime/developer-feed.json';
const packageUrl = 'https://github.com/YuYu9372/Panel/releases/download/runtime-test/runtime.zip';

function feed(packageBytes, overrides = {}) {
  const signed = {
    schemaVersion: 1,
    runtimeRevision: 2,
    sequence: 2,
    channel: 'developer',
    baselineRange: '>=1.1.0-alpha.1 <1.2.0',
    bootstrapApiVersion: 1,
    runtimeApiVersion: 1,
    issuedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    package: {
      url: packageUrl,
      sha256: crypto.createHash('sha256').update(packageBytes).digest('hex'),
      size: packageBytes.length,
    },
    releaseNotes: ['Runtime download test.'],
    ...overrides,
  };
  return {
    keyId: 'panel-runtime-test',
    signed,
    signature: crypto.sign(null, Buffer.from(canonicalJson(signed)), privateKey).toString('base64'),
  };
}

function response(body, contentType, includeLength = true) {
  const headers = { 'content-type': contentType };
  if (includeLength) headers['content-length'] = String(Buffer.byteLength(body));
  return new Response(body, {
    status: 200,
    headers,
  });
}

function manager(packageBytes, options = {}) {
  const envelope = feed(packageBytes, options.feedOverrides);
  const staged = [];
  const bootstrap = {
    status: async () => ({
      runtimeRevision: options.currentRevision || 1,
      highestRuntimeRevision: options.highestRevision || 1,
      highestSequence: options.highestSequence || 1,
      pendingRevision: options.pendingRevision || null,
      awaitingHealth: Boolean(options.awaitingHealth),
    }),
    stage: async (packagePath) => {
      staged.push(fs.readFileSync(packagePath));
      return { status: 'staged', runtimeRevision: envelope.signed.runtimeRevision, slot: 'b' };
    },
  };
  const fetcher = async (url) => {
    if (url === feedUrl) return response(JSON.stringify(envelope), 'application/json');
    if (url === packageUrl) return response(options.downloadBytes || packageBytes, 'application/zip');
    throw new Error('Unexpected URL');
  };
  return {
    staged,
    instance: new RuntimeUpdateManager({
      enabled: true,
      bootstrap,
      fetcher,
      feedUrl,
      publicKey,
      keyId: 'panel-runtime-test',
      channel: 'developer',
      currentVersion: '1.1.0-alpha.1',
      bootstrapApiVersion: 1,
      runtimeApiVersion: 1,
      downloadDirectory: fs.mkdtempSync(path.join(os.tmpdir(), 'panel-runtime-download-')),
    }),
  };
}

test('Runtime manager checks a signed feed and stages an exact streamed package', async () => {
  const packageBytes = Buffer.from('signed Runtime package bytes');
  const { instance, staged } = manager(packageBytes);
  const available = await instance.check();
  assert.equal(available.status, 'available');
  assert.equal(available.availableRevision, 2);
  const result = await instance.downloadAndStage();
  assert.equal(result.status, 'staged');
  assert.equal(instance.transitionActive(), true);
  assert.equal(result.progress, 100);
  assert.deepEqual(staged, [packageBytes]);
  assert.deepEqual(fs.readdirSync(instance.downloadDirectory), []);
});

test('Runtime manager deletes a download whose digest does not match', async () => {
  const packageBytes = Buffer.from('expected package');
  const { instance, staged } = manager(packageBytes, {
    downloadBytes: Buffer.from('tampered package'),
  });
  await instance.check();
  await assert.rejects(instance.downloadAndStage(), /size does not match|digest does not match/);
  assert.equal(instance.snapshot().status, 'error');
  assert.deepEqual(staged, []);
  assert.deepEqual(fs.readdirSync(instance.downloadDirectory), []);
});

test('Runtime manager suppresses used feeds and overlapping downloads', async () => {
  const packageBytes = Buffer.from('signed Runtime package bytes');
  const used = manager(packageBytes, { highestRevision: 2, highestSequence: 2 });
  assert.equal((await used.instance.check()).status, 'idle');
  const active = manager(packageBytes);
  await active.instance.check();
  active.instance.operationInFlight = true;
  assert.equal(active.instance.transitionActive(), true);
  await assert.rejects(active.instance.downloadAndStage(), /operation is active/);
});

test('Runtime manager accepts a streamed package without a Content-Length header', async () => {
  const packageBytes = Buffer.from('streamed package without declared length');
  const envelope = feed(packageBytes);
  const staged = [];
  const instance = new RuntimeUpdateManager({
    enabled: true,
    bootstrap: {
      status: async () => ({ runtimeRevision: 1, highestRuntimeRevision: 1, highestSequence: 1 }),
      stage: async (packagePath) => {
        staged.push(fs.readFileSync(packagePath));
        return { runtimeRevision: 2, slot: 'b' };
      },
    },
    fetcher: async (url) => (
      url === feedUrl
        ? response(JSON.stringify(envelope), 'application/json', false)
        : response(packageBytes, 'application/zip', false)
    ),
    feedUrl,
    publicKey,
    keyId: 'panel-runtime-test',
    channel: 'developer',
    currentVersion: '1.1.0-alpha.1',
    bootstrapApiVersion: 1,
    runtimeApiVersion: 1,
    downloadDirectory: fs.mkdtempSync(path.join(os.tmpdir(), 'panel-runtime-download-')),
  });
  await instance.check();
  assert.equal((await instance.downloadAndStage()).status, 'staged');
  assert.deepEqual(staged, [packageBytes]);
});

test('Runtime manager restores staged and health-recovery state after relaunch', async () => {
  const packageBytes = Buffer.from('signed Runtime package bytes');
  const staged = manager(packageBytes, {
    highestRevision: 2,
    highestSequence: 2,
    pendingRevision: 2,
  });
  assert.equal((await staged.instance.check()).status, 'staged');
  assert.equal(staged.instance.snapshot().availableRevision, 2);

  const recovery = manager(packageBytes, {
    currentRevision: 2,
    highestRevision: 2,
    highestSequence: 2,
    awaitingHealth: true,
  });
  assert.equal((await recovery.instance.check()).status, 'recovery');
});

test('Runtime manager restores a staged update without network access', async () => {
  const instance = new RuntimeUpdateManager({
    enabled: true,
    bootstrap: {
      status: async () => ({ runtimeRevision: 1, pendingRevision: 2 }),
    },
    fetcher: async () => {
      throw new Error('offline');
    },
    feedUrl,
    publicKey,
    keyId: 'panel-runtime-test',
    channel: 'developer',
    currentVersion: '1.1.0-alpha.1',
    bootstrapApiVersion: 1,
    runtimeApiVersion: 1,
    downloadDirectory: fs.mkdtempSync(path.join(os.tmpdir(), 'panel-runtime-download-')),
  });
  assert.equal((await instance.check()).status, 'staged');
});

test('Runtime manager activates, health-checks, and confirms a staged Runtime', async () => {
  let state = {
    activeSlot: 'a',
    previousSlot: null,
    pendingSlot: 'b',
    runtimeRevision: 1,
    pendingRevision: 2,
    highestRuntimeRevision: 2,
    highestSequence: 2,
    awaitingHealth: false,
  };
  const calls = [];
  const instance = new RuntimeUpdateManager({
    enabled: true,
    bootstrap: {
      status: async () => ({ ...state }),
      activate: async () => {
        calls.push('activate');
        state = {
          ...state,
          activeSlot: 'b',
          previousSlot: 'a',
          pendingSlot: null,
          runtimeRevision: 2,
          pendingRevision: null,
          awaitingHealth: true,
        };
      },
      confirm: async () => {
        calls.push('confirm');
        state = { ...state, awaitingHealth: false };
      },
      rollback: async () => {
        calls.push('rollback');
      },
    },
    fetcher: async () => {
      throw new Error('not used');
    },
    feedUrl,
    publicKey,
    keyId: 'panel-runtime-test',
    channel: 'developer',
    currentVersion: '1.1.0-alpha.1',
    bootstrapApiVersion: 1,
    runtimeApiVersion: 1,
    downloadDirectory: fs.mkdtempSync(path.join(os.tmpdir(), 'panel-runtime-download-')),
  });
  instance.updateState({ status: 'staged', availableRevision: 2, progress: 100 });
  const phases = [];
  const result = await instance.apply(async (runtimeState, report) => {
    calls.push(`restart:${runtimeState.activeSlot}`);
    report('Checking services', 70, 'Checking');
    phases.push(instance.snapshot().phase);
  });
  assert.equal(result.status, 'idle');
  assert.equal(result.currentRevision, 2);
  assert.deepEqual(calls, ['activate', 'restart:b', 'confirm']);
  assert.deepEqual(phases, ['Checking services']);
  assert.equal(instance.transitionActive(), false);
});

test('Runtime manager rolls back when the activated Runtime fails health checks', async () => {
  let state = {
    activeSlot: 'a',
    previousSlot: null,
    pendingSlot: 'b',
    runtimeRevision: 1,
    pendingRevision: 2,
    highestRuntimeRevision: 2,
    highestSequence: 2,
    awaitingHealth: false,
  };
  const calls = [];
  const instance = new RuntimeUpdateManager({
    enabled: true,
    bootstrap: {
      status: async () => ({ ...state }),
      activate: async () => {
        calls.push('activate');
        state = {
          ...state,
          activeSlot: 'b',
          previousSlot: 'a',
          pendingSlot: null,
          runtimeRevision: 2,
          pendingRevision: null,
          awaitingHealth: true,
        };
      },
      confirm: async () => {
        calls.push('confirm');
      },
      rollback: async () => {
        calls.push('rollback');
        state = {
          ...state,
          activeSlot: 'a',
          previousSlot: null,
          runtimeRevision: 1,
          awaitingHealth: false,
        };
      },
    },
    fetcher: async () => {
      throw new Error('not used');
    },
    feedUrl,
    publicKey,
    keyId: 'panel-runtime-test',
    channel: 'developer',
    currentVersion: '1.1.0-alpha.1',
    bootstrapApiVersion: 1,
    runtimeApiVersion: 1,
    downloadDirectory: fs.mkdtempSync(path.join(os.tmpdir(), 'panel-runtime-download-')),
  });
  instance.updateState({ status: 'staged', availableRevision: 2, progress: 100 });
  let firstRestart = true;
  await assert.rejects(
    instance.apply(async (runtimeState) => {
      calls.push(`restart:${runtimeState.activeSlot}`);
      if (firstRestart) {
        firstRestart = false;
        throw new Error('health failed');
      }
    }),
    /health failed/,
  );
  assert.deepEqual(calls, ['activate', 'restart:b', 'rollback', 'restart:a']);
  assert.equal(instance.snapshot().status, 'rolledBack');
  assert.equal(instance.snapshot().currentRevision, 1);
});

test('Runtime manager rolls back an unconfirmed Runtime before launch', async () => {
  let state = {
    activeSlot: 'b',
    previousSlot: 'a',
    runtimeRevision: 2,
    pendingRevision: null,
    awaitingHealth: true,
  };
  const instance = new RuntimeUpdateManager({
    enabled: true,
    bootstrap: {
      status: async () => ({ ...state }),
      rollback: async () => {
        state = {
          ...state,
          activeSlot: 'a',
          previousSlot: null,
          runtimeRevision: 1,
          awaitingHealth: false,
        };
      },
    },
    fetcher: async () => {
      throw new Error('not used');
    },
    feedUrl,
    publicKey,
    keyId: 'panel-runtime-test',
    channel: 'developer',
    currentVersion: '1.1.0-alpha.1',
    bootstrapApiVersion: 1,
    runtimeApiVersion: 1,
    downloadDirectory: fs.mkdtempSync(path.join(os.tmpdir(), 'panel-runtime-download-')),
  });
  const restored = await instance.prepareForLaunch();
  assert.equal(restored.activeSlot, 'a');
  assert.equal(instance.snapshot().status, 'rolledBack');
  assert.equal(instance.snapshot().currentRevision, 1);
});
