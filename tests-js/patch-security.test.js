const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  canonicalJson,
  signPatchPayload,
  verifyPatchEnvelope,
} = require('../electron/patch-security');

const now = Date.parse('2026-07-22T00:00:00.000Z');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const keyId = 'test-developer-key';
const statusColors = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'config', 'status-colors.json'),
  'utf8',
));
const refreshPolicy = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'config', 'refresh-policy.json'),
  'utf8',
));

function payload(overrides = {}) {
  return {
    schemaVersion: 1,
    patchId: 'developer-patch-1',
    channel: 'developer',
    sequence: 1,
    issuedAt: '2026-07-21T23:55:00.000Z',
    expiresAt: '2026-07-29T00:00:00.000Z',
    appVersionRange: '>=0.5.2-alpha.2 <0.5.3',
    ui: {
      availableTitle: 'Test update ready',
      accent: '#d1843f',
      radius: 18,
    },
    ...overrides,
  };
}

function verify(envelope, overrides = {}) {
  return verifyPatchEnvelope(envelope, {
    channel: 'developer',
    currentVersion: '0.5.2-alpha.2',
    now,
    keyId,
    publicKey,
    ...overrides,
  });
}

test('canonical JSON is independent of object key order', () => {
  assert.equal(canonicalJson({ b: 2, a: { d: 4, c: 3 } }), canonicalJson({ a: { c: 3, d: 4 }, b: 2 }));
});

test('valid Ed25519 patch is accepted and sanitized', () => {
  const verified = verify(signPatchPayload(payload(), privateKey, keyId));
  assert.equal(verified.patchId, 'developer-patch-1');
  assert.deepEqual(verified.ui, {
    availableTitle: 'Test update ready',
    accent: '#d1843f',
    radius: 18,
  });
});

test('tampering after signing is rejected', () => {
  const envelope = signPatchPayload(payload(), privateKey, keyId);
  envelope.signed.ui.availableTitle = 'Tampered update';
  assert.throws(() => verify(envelope), /signature verification failed/);
});

test('signed status colors and refresh policy are accepted without UI code', () => {
  const configPayload = payload({
    ui: undefined,
    statusColors,
    refreshPolicy,
  });
  delete configPayload.ui;
  const verified = verify(signPatchPayload(configPayload, privateKey, keyId));
  assert.deepEqual(verified.statusColors, statusColors);
  assert.deepEqual(verified.refreshPolicy, refreshPolicy);
});

test('tampered thresholds and unsafe refresh policy are rejected', () => {
  const configPayload = payload({ statusColors, refreshPolicy });
  const tampered = signPatchPayload(configPayload, privateKey, keyId);
  tampered.signed.statusColors.metrics.wifi.rules[0].maxExclusive = 99;
  assert.throws(() => verify(tampered), /continuous and ordered|signature verification failed/);
  const unsafePolicy = structuredClone(refreshPolicy);
  unsafePolicy.manualRefresh = false;
  assert.throws(
    () => verify(signPatchPayload(payload({ refreshPolicy: unsafePolicy }), privateKey, keyId)),
    /Manual refresh/,
  );
});

test('cross-channel and expired patches are rejected', () => {
  const stable = signPatchPayload(payload({ channel: 'stable' }), privateKey, keyId);
  assert.throws(() => verify(stable), /channel/);
  const expired = signPatchPayload(payload({ expiresAt: '2026-07-21T23:59:59.000Z' }), privateKey, keyId);
  assert.throws(() => verify(expired), /currently valid/);
});

test('arbitrary script fields and incompatible versions are rejected', () => {
  const scripted = signPatchPayload(payload({
    ui: { availableTitle: 'Unsafe', script: 'run()' },
  }), privateKey, keyId);
  assert.throws(() => verify(scripted), /unsupported fields/);
  const incompatible = signPatchPayload(payload({ appVersionRange: '>=0.6.0' }), privateKey, keyId);
  assert.throws(() => verify(incompatible), /not compatible/);
  const empty = payload({ ui: undefined });
  delete empty.ui;
  assert.throws(() => verify(signPatchPayload(empty, privateKey, keyId)), /no supported content/);
});
