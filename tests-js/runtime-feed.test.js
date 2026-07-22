const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { canonicalJson } = require('../electron/patch-security');
const { validatePackageUrl, verifyRuntimeFeed } = require('../electron/runtime-feed');

const now = Date.now();
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

function signedFeed(overrides = {}) {
  const signed = {
    schemaVersion: 1,
    runtimeRevision: 1,
    sequence: 1,
    channel: 'developer',
    baselineRange: '>=1.1.0-alpha.1 <1.2.0',
    bootstrapApiVersion: 1,
    runtimeApiVersion: 1,
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    package: {
      url: 'https://github.com/YuYu9372/Panel/releases/download/runtime-1.1.0-r1/panel-runtime-r1.zip',
      sha256: 'a'.repeat(64),
      size: 1024,
    },
    releaseNotes: ['Runtime test update.'],
    ...overrides,
  };
  return {
    keyId: 'panel-runtime-test',
    signed,
    signature: crypto.sign(null, Buffer.from(canonicalJson(signed)), privateKey).toString('base64'),
  };
}

function verify(envelope, overrides = {}) {
  return verifyRuntimeFeed(envelope, {
    keyId: 'panel-runtime-test',
    publicKey,
    channel: 'developer',
    currentVersion: '1.1.0-alpha.1',
    bootstrapApiVersion: 1,
    runtimeApiVersion: 1,
    now,
    ...overrides,
  });
}

test('valid Runtime feed binds a trusted GitHub package', () => {
  const result = verify(signedFeed());
  assert.equal(result.runtimeRevision, 1);
  assert.equal(result.package.size, 1024);
});

test('Runtime feed rejects tampering, incompatible versions, and expiry', () => {
  const tampered = signedFeed();
  tampered.signed.releaseNotes[0] = 'Changed after signing.';
  assert.throws(() => verify(tampered), /signature verification failed/);
  assert.throws(
    () => verify(signedFeed({ baselineRange: '>=2.0.0' })),
    /not compatible/,
  );
  assert.throws(
    () => verify(signedFeed({ expiresAt: new Date(now - 1).toISOString() })),
    /lifetime/,
  );
});

test('Runtime package URL cannot leave the fixed GitHub release path', () => {
  assert.throws(() => validatePackageUrl('https://example.com/panel-runtime-r1.zip'), /not trusted/);
  assert.throws(
    () => validatePackageUrl('https://github.com/Other/Repo/releases/download/r1/panel-runtime-r1.zip'),
    /not trusted/,
  );
  assert.throws(
    () => verify(signedFeed({
      package: {
        url: 'https://example.com/panel-runtime-r1.zip',
        sha256: 'a'.repeat(64),
        size: 1024,
      },
    })),
    /not trusted/,
  );
});

test('Runtime feed signer binds the real package digest and manifest identity', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-runtime-feed-'));
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const keyPath = path.join(temporary, 'private.pem');
  const manifestPath = path.join(temporary, 'manifest.json');
  const packagePath = path.join(temporary, 'runtime.zip');
  const draftPath = path.join(temporary, 'feed-draft.json');
  const outputPath = path.join(temporary, 'feed.json');
  fs.writeFileSync(keyPath, privatePem, { mode: 0o600 });
  const packageManifest = signedFeed().signed;
  delete packageManifest.package;
  delete packageManifest.releaseNotes;
  const manifestEnvelope = {
    keyId: 'panel-runtime-test',
    signed: packageManifest,
    signature: crypto.sign(
      null,
      Buffer.from(canonicalJson(packageManifest)),
      privateKey,
    ).toString('base64'),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifestEnvelope));
  fs.writeFileSync(packagePath, 'deterministic package bytes');
  fs.writeFileSync(draftPath, JSON.stringify({
    schemaVersion: 1,
    lifetimeDays: 1,
    packageUrl: 'https://github.com/YuYu9372/Panel/releases/download/runtime-test/runtime.zip',
    releaseNotes: ['Signed feed test.'],
  }));
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'scripts', 'sign-runtime-feed.js'),
    manifestPath,
    packagePath,
    draftPath,
    outputPath,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PANEL_RUNTIME_SIGNING_KEY: keyPath,
      PANEL_RUNTIME_KEY_ID: 'panel-runtime-test',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const feed = JSON.parse(fs.readFileSync(outputPath));
  assert.equal(feed.signed.package.sha256, crypto.createHash('sha256').update('deterministic package bytes').digest('hex'));
  assert.equal(feed.signed.runtimeRevision, packageManifest.runtimeRevision);
});
