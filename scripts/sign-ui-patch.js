const fs = require('fs');
const path = require('path');
const { createPublicKey } = require('crypto');
const packageJson = require('../package.json');
const { signPatchPayload, verifyPatchEnvelope } = require('../electron/patch-security');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const privateKeyPath = process.env.PANEL_PATCH_SIGNING_KEY;
const keyId = process.env.PANEL_PATCH_KEY_ID;

if (!inputPath || !outputPath) fail('Usage: npm run sign:patch -- input.json output.json');
if (!privateKeyPath || !keyId) {
  fail('PANEL_PATCH_SIGNING_KEY and PANEL_PATCH_KEY_ID are required.');
}
if (fs.existsSync(outputPath)) fail('Output already exists; refusing to overwrite it.');

const draft = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const allowed = new Set([
  'schemaVersion',
  'patchId',
  'channel',
  'sequence',
  'appVersionRange',
  'lifetimeDays',
  'ui',
  'statusColors',
  'refreshPolicy',
  'settingsLayout',
]);
if (Object.keys(draft).some((field) => !allowed.has(field))) {
  fail('Patch draft contains unsupported fields.');
}
const lifetimeDays = Number(draft.lifetimeDays || 7);
if (!Number.isInteger(lifetimeDays) || lifetimeDays < 1 || lifetimeDays > 30) {
  fail('lifetimeDays must be a whole number from 1 to 30.');
}
const issuedAt = new Date();
const expiresAt = new Date(issuedAt.getTime() + lifetimeDays * 24 * 60 * 60 * 1000);
const signed = {
  schemaVersion: draft.schemaVersion,
  patchId: draft.patchId,
  channel: draft.channel,
  sequence: draft.sequence,
  issuedAt: issuedAt.toISOString(),
  expiresAt: expiresAt.toISOString(),
  appVersionRange: draft.appVersionRange,
};
if (draft.ui !== undefined) signed.ui = draft.ui;
if (draft.statusColors !== undefined) signed.statusColors = draft.statusColors;
if (draft.refreshPolicy !== undefined) signed.refreshPolicy = draft.refreshPolicy;
if (draft.settingsLayout !== undefined) signed.settingsLayout = draft.settingsLayout;
const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
const envelope = signPatchPayload(signed, privateKey, keyId);
verifyPatchEnvelope(envelope, {
  channel: signed.channel,
  currentVersion: packageJson.version,
  now: issuedAt.getTime(),
  keyId,
  publicKey: createPublicKey(privateKey),
});
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(envelope, null, 2)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
  mode: 0o644,
});
process.stdout.write(`Signed ${signed.patchId} for ${signed.channel}.\n`);
