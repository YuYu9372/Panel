const fs = require('fs');
const semver = require('semver');

const CHANNEL_CODES = Object.freeze({
  Release: 'R',
  Beta: 'B',
  devbeta: 'D',
});

const VERSION_FIELDS = new Set([
  'appVersion',
  'channel',
  'build',
  'gitTag',
  'artifact',
  'public',
  'livePatchCompatibility',
]);

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateVersionInfo(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Version metadata must be an object.');
  }
  const unexpected = Object.keys(value).filter((field) => !VERSION_FIELDS.has(field));
  const missing = [...VERSION_FIELDS].filter((field) => !(field in value));
  if (unexpected.length || missing.length) {
    throw new Error('Version metadata fields do not match the supported format.');
  }
  if (!semver.valid(value.appVersion)) throw new Error('App version is not valid.');
  if (!(value.channel in CHANNEL_CODES)) throw new Error('Release channel is not valid.');
  const buildPattern = new RegExp(
    `^${escapePattern(value.appVersion)}\\+([1-9]\\d*)\\.([1-9]\\d*)([RBD])$`,
  );
  const match = buildPattern.exec(value.build);
  if (!match || match[3] !== CHANNEL_CODES[value.channel]) {
    throw new Error('Build identifier does not match the App version and channel.');
  }
  if (value.gitTag !== value.appVersion) throw new Error('Git tag must match the App version.');
  if (value.artifact !== 'panel.dmg') throw new Error('Public artifact must be panel.dmg.');
  if (typeof value.public !== 'boolean') throw new Error('Public status must be true or false.');
  if (!semver.validRange(value.livePatchCompatibility)
      || !semver.satisfies(value.appVersion, value.livePatchCompatibility)) {
    throw new Error('Live Patch compatibility must include the App version.');
  }
  return Object.freeze({ ...value });
}

function loadVersionInfo(file) {
  return validateVersionInfo(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function expectedPackageVersion(versionInfo) {
  const match = new RegExp(
    `^${escapePattern(versionInfo.appVersion)}\\+([1-9]\\d*)\\.([1-9]\\d*)[RBD]$`,
  ).exec(versionInfo.build);
  if (!match) throw new Error('Build identifier is not valid.');
  if (versionInfo.channel === 'Release') return versionInfo.appVersion;
  const prerelease = versionInfo.channel === 'devbeta' ? 'alpha' : 'beta';
  return `${versionInfo.appVersion}-${prerelease}.${match[1]}`;
}

function matchesPackageVersion(versionInfo, packageVersion) {
  return expectedPackageVersion(versionInfo) === packageVersion;
}

function runtimeVersionInfo(versionInfo, patchNumber) {
  const patched = Number.isSafeInteger(patchNumber) && patchNumber > 0;
  return {
    ...versionInfo,
    build: patched ? `${versionInfo.build}p${patchNumber}` : versionInfo.build,
  };
}

module.exports = {
  CHANNEL_CODES,
  expectedPackageVersion,
  loadVersionInfo,
  matchesPackageVersion,
  runtimeVersionInfo,
  validateVersionInfo,
};
