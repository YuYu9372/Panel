const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generateKeyPairSync } = require('node:crypto');
const { PatchManager } = require('../electron/patch-manager');
const { signPatchPayload } = require('../electron/patch-security');

const fixedNow = Date.parse('2026-07-22T00:00:00.000Z');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const keyId = 'manager-test-key';

function envelope(sequence, patchId = `patch-${sequence}`) {
  return signPatchPayload({
    schemaVersion: 1,
    patchId,
    channel: 'developer',
    sequence,
    issuedAt: '2026-07-21T23:55:00.000Z',
    expiresAt: '2026-07-29T00:00:00.000Z',
    appVersionRange: '>=0.5.2-alpha.2 <0.5.3',
    ui: { availableTitle: `Patch ${sequence}`, radius: 18 },
  }, privateKey, keyId);
}

function response(body, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  };
}

async function withManager(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-patch-test-'));
  const queue = [];
  const options = {
    appVersion: '0.5.2-alpha.2',
    userDataPath: directory,
    fetcher: async () => queue.shift(),
    manifestBaseUrl: 'https://updates.example.test/',
    trust: {
      developer: { keyId, publicKey },
      stable: { keyId: 'stable-test-key', publicKey },
    },
    now: () => fixedNow,
  };
  try {
    return await run(new PatchManager(options), queue, options);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('signed patch is atomically stored and confirmed healthy', async () => {
  await withManager(async (manager, queue) => {
    queue.push(response(envelope(1)));
    const checked = await manager.check('developer');
    assert.equal(checked.status, 'applied');
    assert.equal(checked.patch.patchId, 'patch-1');
    assert.equal(fs.statSync(manager.file).mode & 0o777, 0o600);
    assert.equal(manager.confirm('patch-1', 'developer'), true);
    assert.equal(manager.state.pendingPatchId, null);
    assert.equal(manager.reportFailure('patch-1', 'developer'), false);
    assert.equal(manager.snapshot('developer').patch.patchId, 'patch-1');
  });
});

test('sequence replay does not replace the active patch', async () => {
  await withManager(async (manager, queue) => {
    queue.push(response(envelope(2)));
    await manager.check('developer');
    manager.confirm('patch-2', 'developer');
    queue.push(response(envelope(2, 'replayed-patch')));
    const replay = await manager.check('developer');
    assert.equal(replay.status, 'idle');
    assert.equal(replay.patch.patchId, 'patch-2');
  });
});

test('failed health check rolls back while retaining anti-replay sequence', async () => {
  await withManager(async (manager, queue) => {
    queue.push(response(envelope(1)));
    await manager.check('developer');
    manager.confirm('patch-1', 'developer');
    queue.push(response(envelope(2)));
    await manager.check('developer');
    assert.equal(manager.reportFailure('patch-2', 'developer'), true);
    assert.equal(manager.snapshot('developer').patch.patchId, 'patch-1');
    assert.equal(manager.state.channelSequences.developer, 2);
  });
});

test('unconfirmed patch is rolled back on the next launch', async () => {
  await withManager(async (manager, queue, options) => {
    queue.push(response(envelope(1)));
    await manager.check('developer');
    manager.confirm('patch-1', 'developer');
    queue.push(response(envelope(2)));
    await manager.check('developer');
    const restarted = new PatchManager(options);
    assert.equal(restarted.snapshot('developer').patch.patchId, 'patch-1');
    assert.equal(restarted.state.pendingPatchId, null);
  });
});

test('invalid signature is rejected without replacing the active patch', async () => {
  await withManager(async (manager, queue) => {
    const invalid = envelope(1);
    invalid.signed.ui.availableTitle = 'Changed';
    queue.push(response(invalid));
    const checked = await manager.check('developer');
    assert.equal(checked.status, 'error');
    assert.equal(checked.patch, null);
  });
});

test('oversized manifest is rejected before activation', async () => {
  await withManager(async (manager, queue) => {
    queue.push({
      ok: true,
      status: 200,
      text: async () => 'x'.repeat(128 * 1024 + 1),
    });
    const checked = await manager.check('developer');
    assert.equal(checked.status, 'error');
    assert.equal(checked.patch, null);
  });
});
