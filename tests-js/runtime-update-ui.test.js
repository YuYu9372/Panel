const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Runtime download and activation IPC are exposed and restricted to the dashboard', () => {
  const main = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'electron', 'preload.js'), 'utf8');
  assert.match(preload, /downloadRuntimeUpdate: \(\) => ipcRenderer\.invoke\('panel:download-runtime-update'\)/);
  assert.match(preload, /applyRuntimeUpdate: \(\) => ipcRenderer\.invoke\('panel:apply-runtime-update'\)/);
  assert.match(preload, /reportRuntimeReady: \(\) => ipcRenderer\.invoke\('panel:report-runtime-ready'\)/);
  assert.match(
    main,
    /ipcMain\.handle\('panel:download-runtime-update',[\s\S]*?requireSender\(event, isDashboardSender\);[\s\S]*?downloadAndStage\(\)/,
  );
  assert.match(
    main,
    /ipcMain\.handle\('panel:apply-runtime-update',[\s\S]*?requireSender\(event, isDashboardSender\);[\s\S]*?\.apply\(restartRuntimeForUpdate\)/,
  );
  assert.match(
    main,
    /ipcMain\.handle\('panel:report-runtime-ready',[\s\S]*?requireSender\(event, isDashboardSender\)/,
  );
  assert.match(
    fs.readFileSync(path.join(root, 'app.js'), 'utf8'),
    /startWidgets\(\)\.then\([\s\S]*?reportRuntimeReady\(\)/,
  );
});

test('Update card enables secure Runtime activation and renders its progress screen', () => {
  const widget = fs.readFileSync(path.join(root, 'widgets', 'update.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(widget, /downloadRuntimeUpdate\(\)/);
  assert.match(widget, /applyRuntimeUpdate\(\)/);
  assert.match(widget, /runtime\.status === 'staged'.*Apply Runtime update/);
  assert.match(widget, /'updating', 'rollingBack', 'recovery'/);
  assert.match(html, /id="runtime-updating-screen"/);
  assert.match(html, /id="runtime-updating-progress"/);
});

test('Dashboard loading requires the managed server and matching Runtime identity', () => {
  const main = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
  assert.match(
    main,
    /async function showDashboard\(\)[\s\S]*?if \(!pyProc\)[\s\S]*?Panel local port is already in use/,
  );
  assert.match(
    main,
    /async function runtimeHealthMatches[\s\S]*?runtimeRevision === descriptor\.revision[\s\S]*?runtimeSlot === descriptor\.slot/,
  );
  assert.match(
    main,
    /async function restartRuntimeForUpdate[\s\S]*?if \(!pyProc\)[\s\S]*?runtimeHealthMatches\(runtimeState\)/,
  );
});
