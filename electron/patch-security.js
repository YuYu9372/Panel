const crypto = require('crypto');
const semver = require('semver');
const { validateRefreshPolicy } = require('../widgets/refresh-policy');
const { validateStatusTierConfig } = require('../widgets/status-tiers');
const { validateSettingsLayout } = require('./settings-layout');

const ALLOWED_CHANNELS = new Set(['stable', 'developer']);
const MAX_PATCH_LIFETIME_MS = 31 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const STRING_LIMITS = Object.freeze({
  eyebrow: 32,
  availableTitle: 80,
  downloadedTitle: 80,
  releaseLabel: 48,
  downloadLabel: 48,
  installLabel: 48,
  checkingLabel: 80,
  upToDateLabel: 80,
  errorTitle: 80,
});

const COLOR_FIELDS = new Set([
  'accent',
  'accentSoft',
  'surface',
  'text',
  'muted',
  'darkAccent',
  'darkAccentSoft',
  'darkSurface',
  'darkText',
  'darkMuted',
]);
const UI_FIELDS = new Set([
  ...Object.keys(STRING_LIMITS),
  ...COLOR_FIELDS,
  'radius',
  'width',
  'density',
]);

function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Signed JSON contains a non-finite number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  throw new Error('Signed JSON contains an unsupported value.');
}

function ensureExactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length) throw new Error(`${label} contains unsupported fields.`);
}

function cleanText(value, maximum, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maximum || /[\u0000-\u001f\u007f]/.test(cleaned)) {
    throw new Error(`${label} is not valid.`);
  }
  return cleaned;
}

function validateUiPatch(ui) {
  ensureExactKeys(ui, UI_FIELDS, 'UI patch');
  const cleaned = {};
  for (const [field, maximum] of Object.entries(STRING_LIMITS)) {
    if (ui[field] !== undefined) cleaned[field] = cleanText(ui[field], maximum, field);
  }
  for (const field of COLOR_FIELDS) {
    if (ui[field] === undefined) continue;
    if (typeof ui[field] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(ui[field])) {
      throw new Error(`${field} must be a six-digit hex color.`);
    }
    cleaned[field] = ui[field].toLowerCase();
  }
  if (ui.radius !== undefined) {
    if (!Number.isInteger(ui.radius) || ui.radius < 8 || ui.radius > 28) {
      throw new Error('radius must be a whole number from 8 to 28.');
    }
    cleaned.radius = ui.radius;
  }
  if (ui.width !== undefined) {
    if (!Number.isInteger(ui.width) || ui.width < 320 || ui.width > 480) {
      throw new Error('width must be a whole number from 320 to 480.');
    }
    cleaned.width = ui.width;
  }
  if (ui.density !== undefined) {
    if (!['compact', 'comfortable'].includes(ui.density)) {
      throw new Error('density must be compact or comfortable.');
    }
    cleaned.density = ui.density;
  }
  if (!Object.keys(cleaned).length) throw new Error('UI patch is empty.');
  return cleaned;
}

function validateSignedPayload(signed, options) {
  const allowed = new Set([
    'schemaVersion',
    'patchId',
    'channel',
    'sequence',
    'issuedAt',
    'expiresAt',
    'appVersionRange',
    'ui',
    'statusColors',
    'refreshPolicy',
    'settingsLayout',
  ]);
  ensureExactKeys(signed, allowed, 'Signed patch');
  if (signed.schemaVersion !== 1) throw new Error('Unsupported patch schema.');
  if (typeof signed.patchId !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(signed.patchId)) {
    throw new Error('Patch ID is not valid.');
  }
  if (!ALLOWED_CHANNELS.has(signed.channel) || signed.channel !== options.channel) {
    throw new Error('Patch channel does not match this device.');
  }
  if (!Number.isSafeInteger(signed.sequence) || signed.sequence < 1) {
    throw new Error('Patch sequence is not valid.');
  }
  if (typeof signed.appVersionRange !== 'string'
      || !semver.validRange(signed.appVersionRange)
      || !semver.satisfies(options.currentVersion, signed.appVersionRange, { includePrerelease: true })) {
    throw new Error('Patch is not compatible with this Panel version.');
  }
  const issuedAt = Date.parse(signed.issuedAt);
  const expiresAt = Date.parse(signed.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    throw new Error('Patch timestamps are not valid.');
  }
  if (issuedAt > options.now + CLOCK_SKEW_MS || expiresAt <= options.now) {
    throw new Error('Patch is not currently valid.');
  }
  if (expiresAt <= issuedAt || expiresAt - issuedAt > MAX_PATCH_LIFETIME_MS) {
    throw new Error('Patch lifetime is not valid.');
  }
  const patchFields = ['ui', 'statusColors', 'refreshPolicy', 'settingsLayout'];
  if (!patchFields.some((field) => signed[field] !== undefined)) {
    throw new Error('Patch has no supported content.');
  }
  const validated = { ...signed };
  if (signed.ui !== undefined) validated.ui = validateUiPatch(signed.ui);
  if (signed.statusColors !== undefined) {
    validated.statusColors = validateStatusTierConfig(signed.statusColors);
  }
  if (signed.refreshPolicy !== undefined) {
    validated.refreshPolicy = validateRefreshPolicy(signed.refreshPolicy);
  }
  if (signed.settingsLayout !== undefined) {
    validated.settingsLayout = validateSettingsLayout(signed.settingsLayout);
  }
  return validated;
}

function verifyPatchEnvelope(envelope, options) {
  ensureExactKeys(envelope, new Set(['signed', 'signatures']), 'Patch envelope');
  if (!Array.isArray(envelope.signatures) || !envelope.signatures.length) {
    throw new Error('Patch has no signatures.');
  }
  const signed = validateSignedPayload(envelope.signed, options);
  const signature = envelope.signatures.find((candidate) => (
    candidate
    && candidate.keyId === options.keyId
    && candidate.algorithm === 'ed25519'
    && typeof candidate.signature === 'string'
    && /^[A-Za-z0-9+/]+={0,2}$/.test(candidate.signature)
  ));
  if (!signature) throw new Error('Patch does not have a trusted signature.');
  const valid = crypto.verify(
    null,
    Buffer.from(canonicalJson(envelope.signed), 'utf8'),
    options.publicKey,
    Buffer.from(signature.signature, 'base64'),
  );
  if (!valid) throw new Error('Patch signature verification failed.');
  return signed;
}

function signPatchPayload(signed, privateKey, keyId) {
  const signature = crypto.sign(
    null,
    Buffer.from(canonicalJson(signed), 'utf8'),
    privateKey,
  );
  return {
    signed,
    signatures: [{
      keyId,
      algorithm: 'ed25519',
      signature: signature.toString('base64'),
    }],
  };
}

module.exports = {
  canonicalJson,
  signPatchPayload,
  validateSettingsLayout,
  validateUiPatch,
  verifyPatchEnvelope,
};
