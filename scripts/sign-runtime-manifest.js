const fs = require('fs');
const path = require('path');
const semver = require('semver');
const {
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} = require('crypto');
const { canonicalJson } = require('../electron/patch-security');

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const DRAFT_FIELDS = new Set([
  'schemaVersion',
  'runtimeRevision',
  'sequence',
  'channel',
  'baselineRange',
  'bootstrapApiVersion',
  'runtimeApiVersion',
  'lifetimeDays',
  'files',
]);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function exactFields(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  const keys = Object.keys(value);
  if (keys.length !== allowed.size || keys.some((key) => !allowed.has(key))) {
    fail(`${label} fields are not valid.`);
  }
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SAFE_INTEGER) {
    fail(`${label} must be a positive safe integer.`);
  }
}

function validateDraft(draft) {
  exactFields(draft, DRAFT_FIELDS, 'Runtime draft');
  if (draft.schemaVersion !== 1) fail('Unsupported Runtime schema.');
  for (const field of ['runtimeRevision', 'sequence', 'bootstrapApiVersion', 'runtimeApiVersion']) {
    positiveSafeInteger(draft[field], field);
  }
  if (!['stable', 'developer'].includes(draft.channel)) fail('Runtime channel is not valid.');
  if (typeof draft.baselineRange !== 'string'
      || draft.baselineRange.includes('||')
      || !semver.validRange(draft.baselineRange)) {
    fail('baselineRange is not valid.');
  }
  if (!Number.isInteger(draft.lifetimeDays) || draft.lifetimeDays < 1 || draft.lifetimeDays > 30) {
    fail('lifetimeDays must be a whole number from 1 to 30.');
  }
  if (!draft.files || typeof draft.files !== 'object' || Array.isArray(draft.files)) {
    fail('Runtime files are not valid.');
  }
  const fileEntries = Object.entries(draft.files);
  if (!fileEntries.length || fileEntries.length > 4096) fail('Runtime files are not valid.');
  for (const [name, metadata] of fileEntries) {
    if (!name || name === 'manifest.json' || name.includes('\\') || name.split('/').some((part) => !part || part === '.' || part === '..')) {
      fail('Runtime file path is not valid.');
    }
    exactFields(metadata, new Set(['sha256', 'size']), 'Runtime file metadata');
    if (typeof metadata.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.sha256)) {
      fail('Runtime file digest is not valid.');
    }
    positiveSafeInteger(metadata.size, 'Runtime file size');
  }
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const privateKeyPath = process.env.PANEL_RUNTIME_SIGNING_KEY;
const keyId = process.env.PANEL_RUNTIME_KEY_ID;

if (!inputPath || !outputPath) fail('Usage: npm run sign:runtime -- draft.json signed.json');
if (!privateKeyPath || !keyId) {
  fail('PANEL_RUNTIME_SIGNING_KEY and PANEL_RUNTIME_KEY_ID are required.');
}
if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(keyId)) fail('Runtime key ID is not valid.');
if (fs.existsSync(outputPath)) fail('Output already exists; refusing to overwrite it.');
const keyStats = fs.statSync(privateKeyPath);
if (process.platform !== 'win32' && (keyStats.mode & 0o077) !== 0) {
  fail('Runtime private key permissions must be owner-only.');
}

let draft;
try {
  draft = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch {
  fail('Runtime draft is not valid JSON.');
}
validateDraft(draft);
const issuedAt = process.env.PANEL_RUNTIME_ISSUED_AT
  ? new Date(process.env.PANEL_RUNTIME_ISSUED_AT)
  : new Date();
if (!Number.isFinite(issuedAt.getTime())) fail('PANEL_RUNTIME_ISSUED_AT is not valid.');
const expiresAt = new Date(issuedAt.getTime() + draft.lifetimeDays * 24 * 60 * 60 * 1000);
const signed = {
  schemaVersion: draft.schemaVersion,
  runtimeRevision: draft.runtimeRevision,
  sequence: draft.sequence,
  channel: draft.channel,
  baselineRange: draft.baselineRange,
  bootstrapApiVersion: draft.bootstrapApiVersion,
  runtimeApiVersion: draft.runtimeApiVersion,
  issuedAt: issuedAt.toISOString(),
  expiresAt: expiresAt.toISOString(),
  files: draft.files,
};
const privateKey = createPrivateKey(fs.readFileSync(privateKeyPath));
if (privateKey.asymmetricKeyType !== 'ed25519') fail('Runtime private key must be Ed25519.');
const message = Buffer.from(canonicalJson(signed), 'utf8');
const signature = sign(null, message, privateKey);
if (!verify(null, message, createPublicKey(privateKey), signature)) {
  fail('Runtime signature self-check failed.');
}
const envelope = {
  keyId,
  signed,
  signature: signature.toString('base64'),
};
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(envelope, null, 2)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
  mode: 0o644,
});
process.stdout.write(`Signed Runtime r${signed.runtimeRevision} for ${signed.channel}.\n`);
