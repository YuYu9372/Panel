const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const semver = require('semver');
const { canonicalJson } = require('../electron/patch-security');
const { validatePackageUrl, verifyRuntimeFeed } = require('../electron/runtime-feed');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function exactFields(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is not valid.`);
  const keys = Object.keys(value);
  if (keys.length !== fields.size || keys.some((key) => !fields.has(key))) {
    fail(`${label} fields are not valid.`);
  }
}

const manifestPath = process.argv[2];
const packagePath = process.argv[3];
const draftPath = process.argv[4];
const outputPath = process.argv[5];
const privateKeyPath = process.env.PANEL_RUNTIME_SIGNING_KEY;
const keyId = process.env.PANEL_RUNTIME_KEY_ID;

if (!manifestPath || !packagePath || !draftPath || !outputPath) {
  fail('Usage: npm run sign:runtime-feed -- manifest.json package.zip draft.json output.json');
}
if (!privateKeyPath || !keyId) {
  fail('PANEL_RUNTIME_SIGNING_KEY and PANEL_RUNTIME_KEY_ID are required.');
}
if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(keyId)) fail('Runtime key ID is not valid.');
if (fs.existsSync(outputPath)) fail('Output already exists; refusing to overwrite it.');
const keyStats = fs.statSync(privateKeyPath);
if (process.platform !== 'win32' && (keyStats.mode & 0o077) !== 0) {
  fail('Runtime private key permissions must be owner-only.');
}

let manifestEnvelope;
let draft;
try {
  manifestEnvelope = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
} catch {
  fail('Runtime feed inputs are not valid JSON.');
}
exactFields(manifestEnvelope, new Set(['keyId', 'signed', 'signature']), 'Runtime manifest');
if (manifestEnvelope.keyId !== keyId) fail('Runtime manifest key ID does not match.');
exactFields(draft, new Set(['schemaVersion', 'lifetimeDays', 'packageUrl', 'releaseNotes']), 'Runtime feed draft');
if (draft.schemaVersion !== 1) fail('Unsupported Runtime feed schema.');
if (!Number.isInteger(draft.lifetimeDays) || draft.lifetimeDays < 1 || draft.lifetimeDays > 30) {
  fail('lifetimeDays must be a whole number from 1 to 30.');
}
const packageUrl = validatePackageUrl(draft.packageUrl);
const privateKey = crypto.createPrivateKey(fs.readFileSync(privateKeyPath));
if (privateKey.asymmetricKeyType !== 'ed25519') fail('Runtime private key must be Ed25519.');
const publicKey = crypto.createPublicKey(privateKey);
const manifestMessage = Buffer.from(canonicalJson(manifestEnvelope.signed), 'utf8');
if (!crypto.verify(
  null,
  manifestMessage,
  publicKey,
  Buffer.from(manifestEnvelope.signature, 'base64'),
)) {
  fail('Runtime package manifest signature is not valid.');
}
const packageBytes = fs.readFileSync(packagePath);
const issuedAt = process.env.PANEL_RUNTIME_ISSUED_AT
  ? new Date(process.env.PANEL_RUNTIME_ISSUED_AT)
  : new Date();
if (!Number.isFinite(issuedAt.getTime())) fail('PANEL_RUNTIME_ISSUED_AT is not valid.');
const requestedExpiry = issuedAt.getTime() + draft.lifetimeDays * 24 * 60 * 60 * 1000;
const manifestExpiry = Date.parse(manifestEnvelope.signed.expiresAt);
const expiry = Math.min(requestedExpiry, manifestExpiry);
if (!Number.isFinite(manifestExpiry) || expiry <= issuedAt.getTime()) {
  fail('Runtime package manifest expires too soon.');
}
const signed = {
  schemaVersion: 1,
  runtimeRevision: manifestEnvelope.signed.runtimeRevision,
  sequence: manifestEnvelope.signed.sequence,
  channel: manifestEnvelope.signed.channel,
  baselineRange: manifestEnvelope.signed.baselineRange,
  bootstrapApiVersion: manifestEnvelope.signed.bootstrapApiVersion,
  runtimeApiVersion: manifestEnvelope.signed.runtimeApiVersion,
  issuedAt: issuedAt.toISOString(),
  expiresAt: new Date(expiry).toISOString(),
  package: {
    url: packageUrl,
    sha256: crypto.createHash('sha256').update(packageBytes).digest('hex'),
    size: packageBytes.length,
  },
  releaseNotes: draft.releaseNotes,
};
const signature = crypto.sign(null, Buffer.from(canonicalJson(signed), 'utf8'), privateKey);
const envelope = { keyId, signed, signature: signature.toString('base64') };
const minimumVersion = semver.minVersion(signed.baselineRange);
if (!minimumVersion) fail('Runtime Baseline range is not valid.');
verifyRuntimeFeed(envelope, {
  keyId,
  publicKey,
  channel: signed.channel,
  currentVersion: minimumVersion.version,
  bootstrapApiVersion: signed.bootstrapApiVersion,
  runtimeApiVersion: signed.runtimeApiVersion,
  now: issuedAt.getTime(),
});
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(envelope, null, 2)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
  mode: 0o644,
});
process.stdout.write(`Signed Runtime feed r${signed.runtimeRevision} for ${signed.channel}.\n`);
