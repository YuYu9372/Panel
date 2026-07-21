const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');

const output = path.resolve(__dirname, '..', packageJson.build.directories.output);
const copies = [
  {
    source: path.resolve(__dirname, '..', 'docs', 'OPERATIONS.md'),
    name: 'OPERATIONS.md',
  },
  {
    source: path.resolve(__dirname, '..', 'config', 'status-colors.json'),
    name: 'status-colors.json',
  },
];

for (const copy of copies) {
  for (const directory of [path.resolve(__dirname, '..', 'dist'), output]) {
    const target = path.join(directory, copy.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(copy.source, target);
    process.stdout.write(`Copied release resource to ${target}\n`);
  }
}
