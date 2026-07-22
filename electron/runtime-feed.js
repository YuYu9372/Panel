const crypto = require('crypto');
const semver = require('semver');
const { canonicalJson } = require('./patch-security');

const MAX_FEED_LIFETIME_MS = 31 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_PACKAGE_BYTES = 272 * 1024 * 1024;
const PACKAGE_PATH_PREFIX = '/YuYu9372/Panel/releases/download/';

function exactFields(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const keys = Object.keys(value);
  if (keys.length !== allowed.size || keys.some((key) => !allowed.has(key))) {
    throw new Error(`${label} fields are not valid.`);
  }
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} is not valid.`);
}

function validatePackageUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Runtime package URL is not valid.');
  }
  if (url.protocol !== 'https:'
      || url.hostname !== 'github.com'
      || url.port
      || url.username
      || url.password
      || url.search
      || url.hash
      || !url.pathname.startsWith(PACKAGE_PATH_PREFIX)
      || !url.pathname.endsWith('.zip')) {
    throw new Error('Runtime package URL is not trusted.');
  }
  return url.href;
}

function validateReleaseNotes(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    throw new Error('Runtime release notes are not valid.');
  }
  return value.map((note) => {
    if (typeof note !== 'string') throw new Error('Runtime release notes are not valid.');
    const cleaned = note.trim();
    if (!cleaned || cleaned.length > 240 || /[\u0000-\u001f\u007f]/.test(cleaned)) {
      throw new Error('Runtime release notes are not valid.');
    }
    return cleaned;
  });
}

function verifyRuntimeFeed(envelope, options) {
  exactFields(envelope, new Set(['keyId', 'signed', 'signature']), 'Runtime feed envelope');
  if (envelope.keyId !== options.keyId) throw new Error('Runtime feed key ID is not trusted.');
  exactFields(envelope.signed, new Set([
    'schemaVersion',
    'runtimeRevision',
    'sequence',
    'channel',
    'baselineRange',
    'bootstrapApiVersion',
    'runtimeApiVersion',
    'issuedAt',
    'expiresAt',
    'package',
    'releaseNotes',
  ]), 'Signed Runtime feed');
  const signed = envelope.signed;
  if (signed.schemaVersion !== 1) throw new Error('Unsupported Runtime feed schema.');
  positiveInteger(signed.runtimeRevision, 'Runtime revision');
  positiveInteger(signed.sequence, 'Runtime sequence');
  if (!['stable', 'developer'].includes(signed.channel) || signed.channel !== options.channel) {
    throw new Error('Runtime feed channel does not match this device.');
  }
  if (signed.bootstrapApiVersion !== options.bootstrapApiVersion
      || signed.runtimeApiVersion !== options.runtimeApiVersion) {
    throw new Error('Runtime feed API versions are not compatible.');
  }
  if (typeof signed.baselineRange !== 'string'
      || signed.baselineRange.includes('||')
      || !semver.validRange(signed.baselineRange)
      || !semver.satisfies(options.currentVersion, signed.baselineRange, { includePrerelease: true })) {
    throw new Error('Runtime feed is not compatible with this Panel version.');
  }
  const issuedAt = Date.parse(signed.issuedAt);
  const expiresAt = Date.parse(signed.expiresAt);
  if (!Number.isFinite(issuedAt)
      || !Number.isFinite(expiresAt)
      || issuedAt > options.now + CLOCK_SKEW_MS
      || expiresAt <= options.now
      || expiresAt <= issuedAt
      || expiresAt - issuedAt > MAX_FEED_LIFETIME_MS) {
    throw new Error('Runtime feed lifetime is not valid.');
  }
  exactFields(signed.package, new Set(['url', 'sha256', 'size']), 'Runtime package');
  const packageUrl = validatePackageUrl(signed.package.url);
  if (typeof signed.package.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(signed.package.sha256)) {
    throw new Error('Runtime package digest is not valid.');
  }
  positiveInteger(signed.package.size, 'Runtime package size');
  if (signed.package.size > MAX_PACKAGE_BYTES) throw new Error('Runtime package is too large.');
  const releaseNotes = validateReleaseNotes(signed.releaseNotes);
  if (typeof envelope.signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.signature)) {
    throw new Error('Runtime feed signature encoding is not valid.');
  }
  const signature = Buffer.from(envelope.signature, 'base64');
  const valid = crypto.verify(
    null,
    Buffer.from(canonicalJson(signed), 'utf8'),
    options.publicKey,
    signature,
  );
  if (!valid) throw new Error('Runtime feed signature verification failed.');
  return {
    ...signed,
    package: { ...signed.package, url: packageUrl },
    releaseNotes,
  };
}

module.exports = {
  MAX_PACKAGE_BYTES,
  validatePackageUrl,
  verifyRuntimeFeed,
};
