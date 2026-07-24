const path = require('path');
const { execFile } = require('child_process');
const semver = require('semver');

const MAX_OUTPUT_BYTES = 1024 * 1024;
const COMMAND_TIMEOUT_MS = 30 * 1000;

function defaultRunner(executable, args, options) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function absolutePath(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new Error(`${label} must be an absolute path.`);
  }
  return path.normalize(value);
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function parseResult(stdout) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) {
    throw new Error('Runtime Bootstrap returned invalid output.');
  }
  try {
    const result = JSON.parse(stdout);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch {
    throw new Error('Runtime Bootstrap returned invalid JSON.');
  }
}

class RuntimeBootstrap {
  constructor({
    executable,
    root,
    publicKey,
    keyId,
    appVersion,
    channel,
    bootstrapApiVersion = 1,
    runtimeApiVersion = 1,
    runner = defaultRunner,
  }) {
    this.executable = absolutePath(executable, 'Runtime Bootstrap executable');
    this.root = absolutePath(root, 'Runtime state root');
    this.publicKey = absolutePath(publicKey, 'Runtime public key');
    if (typeof keyId !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(keyId)) {
      throw new Error('Runtime key ID is not valid.');
    }
    if (typeof appVersion !== 'string' || !semver.valid(appVersion)) {
      throw new Error('Runtime App version is not valid.');
    }
    if (!['stable', 'developer'].includes(channel)) {
      throw new Error('Runtime channel is not valid.');
    }
    if (typeof runner !== 'function') throw new Error('Runtime command runner is not valid.');
    this.keyId = keyId;
    this.appVersion = appVersion;
    this.channel = channel;
    this.bootstrapApiVersion = positiveInteger(bootstrapApiVersion, 'Bootstrap API version');
    this.runtimeApiVersion = positiveInteger(runtimeApiVersion, 'Runtime API version');
    this.runner = runner;
    this.inFlight = false;
  }

  contextArgs() {
    return [
      '--public-key', this.publicKey,
      '--key-id', this.keyId,
      '--app-version', this.appVersion,
      '--channel', this.channel,
      '--bootstrap-api', String(this.bootstrapApiVersion),
      '--runtime-api', String(this.runtimeApiVersion),
    ];
  }

  async run(args) {
    if (this.inFlight) throw new Error('Another Runtime operation is active.');
    this.inFlight = true;
    try {
      const result = await this.runner(
        this.executable,
        ['--root', this.root, ...args],
        {
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH || '/usr/bin:/bin',
            TMPDIR: process.env.TMPDIR || '/tmp',
          },
          maxBuffer: MAX_OUTPUT_BYTES,
          shell: false,
          timeout: COMMAND_TIMEOUT_MS,
          windowsHide: true,
        },
      );
      return parseResult(result.stdout);
    } finally {
      this.inFlight = false;
    }
  }

  status() {
    return this.run(['status']);
  }

  verify(packagePath) {
    const packageFile = absolutePath(packagePath, 'Runtime package');
    if (path.extname(packageFile).toLowerCase() !== '.zip') {
      throw new Error('Runtime package must be a ZIP file.');
    }
    return this.run(['verify', packageFile, ...this.contextArgs()]);
  }

  stage(packagePath) {
    const packageFile = absolutePath(packagePath, 'Runtime package');
    if (path.extname(packageFile).toLowerCase() !== '.zip') {
      throw new Error('Runtime package must be a ZIP file.');
    }
    return this.run(['stage', packageFile, ...this.contextArgs()]);
  }

  activate() {
    return this.run(['activate']);
  }

  confirm() {
    return this.run(['confirm']);
  }

  rollback() {
    return this.run(['rollback']);
  }
}

module.exports = {
  RuntimeBootstrap,
  parseResult,
};
