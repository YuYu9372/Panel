const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const packageScript = path.join(projectRoot, 'scripts', 'runtime-package.py');
const signerScript = path.join(projectRoot, 'scripts', 'sign-runtime-manifest.js');
const cargoManifest = path.join(projectRoot, 'bootstrap-native', 'Cargo.toml');

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('Node signer and deterministic Python packager produce a Rust-verifiable Runtime', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-runtime-package-'));
  const sourceRoot = path.join(temporary, 'source');
  fs.mkdirSync(path.join(sourceRoot, 'widgets'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'index.html'), '<h1>Panel Runtime</h1>\n');
  fs.writeFileSync(path.join(sourceRoot, 'widgets', 'clock.js'), 'export const clock = true;\n');
  const config = {
    schemaVersion: 1,
    runtimeRevision: 1,
    sequence: 1,
    channel: 'developer',
    baselineRange: '>=1.1.0 <1.2.0',
    bootstrapApiVersion: 1,
    runtimeApiVersion: 1,
    lifetimeDays: 7,
    sourceRoot: 'source',
    entries: [
      { source: 'index.html', target: 'renderer/index.html' },
      { source: 'widgets', target: 'renderer/widgets' },
    ],
  };
  const configPath = path.join(temporary, 'runtime.json');
  const draftPath = path.join(temporary, 'manifest.draft.json');
  const signedPath = path.join(temporary, 'manifest.signed.json');
  const firstPackage = path.join(temporary, 'runtime-a.zip');
  const secondPackage = path.join(temporary, 'runtime-b.zip');
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const privateKeyPath = path.join(temporary, 'developer-private.pem');
  const publicKeyPath = path.join(temporary, 'developer-public.pem');
  fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
  fs.writeFileSync(publicKeyPath, publicKey);

  const prepared = run('python3', [packageScript, 'prepare', configPath, draftPath]);
  assert.equal(prepared.status, 0, prepared.stderr);
  const signed = run(process.execPath, [signerScript, draftPath, signedPath], {
    env: {
      ...process.env,
      PANEL_RUNTIME_SIGNING_KEY: privateKeyPath,
      PANEL_RUNTIME_KEY_ID: 'panel-runtime-test',
    },
  });
  assert.equal(signed.status, 0, signed.stderr);
  const packedA = run('python3', [packageScript, 'pack', configPath, signedPath, firstPackage]);
  const packedB = run('python3', [packageScript, 'pack', configPath, signedPath, secondPackage]);
  assert.equal(packedA.status, 0, packedA.stderr);
  assert.equal(packedB.status, 0, packedB.stderr);
  assert.equal(sha256(firstPackage), sha256(secondPackage));
  assert.equal(fs.readFileSync(firstPackage).includes(Buffer.from('PRIVATE KEY')), false);

  const verified = run('cargo', [
    'run',
    '--quiet',
    '--manifest-path', cargoManifest,
    '--',
    '--root', path.join(temporary, 'state'),
    'verify', firstPackage,
    '--public-key', publicKeyPath,
    '--key-id', 'panel-runtime-test',
    '--app-version', '1.1.0',
    '--channel', 'developer',
    '--bootstrap-api', '1',
    '--runtime-api', '1',
  ]);
  assert.equal(verified.status, 0, verified.stderr);
  assert.match(verified.stdout, /"runtimeRevision": 1/);

  fs.writeFileSync(path.join(sourceRoot, 'index.html'), '<h1>Tampered</h1>\n');
  const rejected = run('python3', [
    packageScript,
    'pack',
    configPath,
    signedPath,
    path.join(temporary, 'tampered.zip'),
  ]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /does not match/);
});

test('Runtime signer refuses a private key with broad file permissions', () => {
  if (process.platform === 'win32') return;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-runtime-key-'));
  const { privateKey } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const keyPath = path.join(temporary, 'private.pem');
  const draftPath = path.join(temporary, 'draft.json');
  fs.writeFileSync(keyPath, privateKey, { mode: 0o644 });
  fs.writeFileSync(draftPath, JSON.stringify({}));
  const result = run(process.execPath, [signerScript, draftPath, path.join(temporary, 'signed.json')], {
    env: {
      ...process.env,
      PANEL_RUNTIME_SIGNING_KEY: keyPath,
      PANEL_RUNTIME_KEY_ID: 'panel-runtime-test',
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /permissions must be owner-only/);
});

test('Runtime builder rejects credentials and symlinked sources', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-runtime-source-'));
  const sourceRoot = path.join(temporary, 'source');
  fs.mkdirSync(sourceRoot);
  fs.writeFileSync(path.join(sourceRoot, '.env'), 'API_KEY=secret\n');
  fs.writeFileSync(path.join(sourceRoot, 'real.js'), 'export const safe = true;\n');
  fs.symlinkSync(path.join(sourceRoot, 'real.js'), path.join(sourceRoot, 'linked.js'));

  const base = {
    schemaVersion: 1,
    runtimeRevision: 1,
    sequence: 1,
    channel: 'developer',
    baselineRange: '>=1.1.0 <1.2.0',
    bootstrapApiVersion: 1,
    runtimeApiVersion: 1,
    lifetimeDays: 7,
    sourceRoot: 'source',
  };
  const credentialConfig = path.join(temporary, 'credential.json');
  fs.writeFileSync(credentialConfig, JSON.stringify({
    ...base,
    entries: [{ source: '.env', target: 'renderer/settings.env' }],
  }));
  const credentialResult = run('python3', [
    packageScript,
    'prepare',
    credentialConfig,
    path.join(temporary, 'credential-draft.json'),
  ]);
  assert.notEqual(credentialResult.status, 0);
  assert.match(credentialResult.stderr, /Sensitive source files/);

  const symlinkConfig = path.join(temporary, 'symlink.json');
  fs.writeFileSync(symlinkConfig, JSON.stringify({
    ...base,
    entries: [{ source: 'linked.js', target: 'renderer/linked.js' }],
  }));
  const symlinkResult = run('python3', [
    packageScript,
    'prepare',
    symlinkConfig,
    path.join(temporary, 'symlink-draft.json'),
  ]);
  assert.notEqual(symlinkResult.status, 0);
  assert.match(symlinkResult.stderr, /cannot use a symlink/);
});
