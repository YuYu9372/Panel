const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');

const source = path.resolve(__dirname, '..', 'docs', 'OPERATIONS.md');
const output = path.resolve(__dirname, '..', packageJson.build.directories.output);
const targets = [
  path.resolve(__dirname, '..', 'dist', 'OPERATIONS.md'),
  path.join(output, 'OPERATIONS.md'),
];

for (const target of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  process.stdout.write(`Copied operations manual to ${target}\n`);
}
