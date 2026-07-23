const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Runtime download IPC is exposed through preload and restricted to the dashboard', () => {
  const main = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'electron', 'preload.js'), 'utf8');
  assert.match(preload, /downloadRuntimeUpdate: \(\) => ipcRenderer\.invoke\('panel:download-runtime-update'\)/);
  assert.match(
    main,
    /ipcMain\.handle\('panel:download-runtime-update',[\s\S]*?requireSender\(event, isDashboardSender\);[\s\S]*?downloadAndStage\(\)/,
  );
});

test('Update card keeps Runtime activation disabled after secure staging', () => {
  const widget = fs.readFileSync(path.join(root, 'widgets', 'update.js'), 'utf8');
  assert.match(widget, /downloadRuntimeUpdate\(\)/);
  assert.match(widget, /\['downloading', 'verifying', 'staged'\]\.includes\(presentation\.status\)/);
  assert.match(widget, /runtime\.status === 'staged'.*Ready to apply/);
});
