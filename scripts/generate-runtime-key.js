const fs = require('fs');
const path = require('path');
const { generateKeyPairSync } = require('crypto');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const privateKeyPath = process.argv[2];
const publicKeyPath = process.argv[3];

if (!privateKeyPath || !publicKeyPath) {
  fail('Usage: npm run generate:runtime-key -- private.pem public.pem');
}
if (fs.existsSync(privateKeyPath) || fs.existsSync(publicKeyPath)) {
  fail('A Runtime key output already exists; refusing to overwrite it.');
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
fs.mkdirSync(path.dirname(path.resolve(privateKeyPath)), { recursive: true, mode: 0o700 });
fs.chmodSync(path.dirname(path.resolve(privateKeyPath)), 0o700);
fs.mkdirSync(path.dirname(path.resolve(publicKeyPath)), { recursive: true });
fs.writeFileSync(privateKeyPath, privateKey, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
try {
  fs.writeFileSync(publicKeyPath, publicKey, { encoding: 'utf8', flag: 'wx', mode: 0o644 });
} catch (error) {
  fs.unlinkSync(privateKeyPath);
  throw error;
}
process.stdout.write('Created an Ed25519 Runtime key pair. Keep the private key offline.\n');
