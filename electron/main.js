const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  safeStorage,
  session,
} = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');
const { SettingsStore } = require('./settings-store');
const { testConnections } = require('./connections');
const { PatchManager } = require('./patch-manager');
const { UpdateManager } = require('./update-manager');
const { RuntimeUpdateManager } = require('./runtime-update-manager');
const {
  BOOTSTRAP_API_VERSION,
  RUNTIME_API_VERSION,
  RUNTIME_FEED_URLS,
  createRuntimeBootstrap,
  runtimePaths,
} = require('./runtime-trust');
const { PATCH_MANIFEST_BASE_URL, PATCH_TRUST } = require('./update-trust');
const {
  loadVersionInfo,
  matchesPackageVersion,
  runtimeVersionInfo,
} = require('./version-info');

const HOST = '127.0.0.1';
const PORT = 8642;
const APP_URL = `http://${HOST}:${PORT}/`;
const APP_ORIGIN = `http://${HOST}:${PORT}`;
const SETTINGS_FILE = path.join(__dirname, 'settings.html');
const SETTINGS_URL = pathToFileURL(SETTINGS_FILE).href;

let pyProc = null;
let win = null;
let settingsStore = null;
let updateManager = null;
let patchManager = null;
let runtimeUpdateManager = null;
let versionInfo = null;
let activeRuntimeState = null;
let rendererHealthExpectation = null;
const updateTimers = [];

function panelDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'panel')
    : path.join(__dirname, '..');
}

function findPython() {
  const homes = [
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
  ];
  const fromPath = (process.env.PATH || '')
    .split(':')
    .filter(Boolean)
    .map((directory) => path.join(directory, 'python3'));
  for (const candidate of [...homes, ...fromPath]) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  return null;
}

function ping(target = APP_URL) {
  return new Promise((resolve) => {
    const request = http.get(target, (response) => {
      const healthy = response.statusCode === 200;
      response.destroy();
      resolve(healthy);
    });
    request.on('error', () => resolve(false));
    request.setTimeout(800, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await ping()) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

async function waitForServerStop(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await ping())) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

function fail(title, detail) {
  dialog.showMessageBoxSync({
    type: 'error',
    title,
    message: title,
    detail,
    buttons: ['Quit'],
  });
  app.quit();
}

function runtimeDescriptor(runtimeState = activeRuntimeState) {
  if (!runtimeState || !runtimeState.activeSlot) {
    const root = panelDir();
    return {
      root,
      pythonDirectory: root,
      script: path.join(root, 'serve.py'),
      webRoot: root,
      revision: 0,
      slot: 'bundled',
    };
  }
  if (!['a', 'b'].includes(runtimeState.activeSlot)) {
    throw new Error('The active Runtime slot is not valid.');
  }
  const root = path.join(runtimeUpdateManager.bootstrap.root, 'slots', runtimeState.activeSlot);
  const descriptor = {
    root,
    pythonDirectory: path.join(root, 'python'),
    script: path.join(root, 'python', 'serve.py'),
    webRoot: path.join(root, 'renderer'),
    revision: runtimeState.runtimeRevision || 0,
    slot: runtimeState.activeSlot,
  };
  for (const required of [
    descriptor.script,
    path.join(descriptor.pythonDirectory, 'macos_sensors.py'),
    path.join(descriptor.webRoot, 'index.html'),
  ]) {
    if (!fs.existsSync(required)) throw new Error('The active Runtime is incomplete.');
  }
  return descriptor;
}

function serverEnvironment(descriptor) {
  const settings = settingsStore.runtimeSettings();
  const environment = {
    ...process.env,
    PANEL_HOST: HOST,
    PANEL_PORT: String(PORT),
    PANEL_MANAGED_SETTINGS: '1',
    PANEL_REFRESH_MINUTES: String(settings.refreshMinutes),
    PANEL_RUNTIME_REVISION: String(descriptor.revision),
    PANEL_RUNTIME_SLOT: descriptor.slot,
    PANEL_WEB_ROOT: descriptor.webRoot,
    PYTHONDONTWRITEBYTECODE: '1',
  };
  delete environment.ANTHROPIC_API_KEY;
  delete environment.COMPOSIO_MCP_TOKEN;
  if (settings.anthropicApiKey) environment.ANTHROPIC_API_KEY = settings.anthropicApiKey;
  if (settings.composioMcpToken) environment.COMPOSIO_MCP_TOKEN = settings.composioMcpToken;
  return environment;
}

function startServer(runtimeState = activeRuntimeState, { fatal = true } = {}) {
  const python = findPython();
  if (!python) {
    if (fatal) {
      fail(
        'Python 3 not found',
        'Panel needs Python 3 to run its local server.\n\n'
          + 'Install it from https://www.python.org/downloads/macos/ '
          + 'or run this in Terminal:\n\n    brew install python\n\n'
          + 'Then reopen Panel.',
      );
    }
    return false;
  }
  let descriptor;
  let environment;
  try {
    descriptor = runtimeDescriptor(runtimeState);
    environment = serverEnvironment(descriptor);
  } catch (error) {
    if (fatal) fail('Panel Runtime could not be started', String(error));
    return false;
  }
  pyProc = spawn(python, [descriptor.script], {
    cwd: descriptor.pythonDirectory,
    env: environment,
    stdio: 'ignore',
  });
  const processReference = pyProc;
  pyProc.on('error', (error) => {
    if (fatal) fail('Could not start Panel server', String(error));
  });
  pyProc.on('exit', () => {
    if (pyProc === processReference) pyProc = null;
  });
  return true;
}

function stopServer() {
  const processReference = pyProc;
  if (!processReference || processReference.killed) return Promise.resolve(false);
  return new Promise((resolve) => {
    let finished = false;
    const complete = () => {
      if (finished) return;
      finished = true;
      resolve(true);
    };
    const timeout = setTimeout(complete, 4000);
    processReference.once('exit', () => {
      clearTimeout(timeout);
      complete();
    });
    try {
      processReference.kill('SIGTERM');
    } catch {
      clearTimeout(timeout);
      complete();
    }
  });
}

async function restartManagedServer() {
  if (!pyProc) return false;
  await stopServer();
  if (!(await waitForServerStop())) return false;
  if (!startServer(activeRuntimeState)) return false;
  return waitForServer();
}

function readRuntimeHealth() {
  return new Promise((resolve, reject) => {
    const request = http.get(`${APP_ORIGIN}/api/runtime-health`, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > 16 * 1024) {
          request.destroy(new Error('Runtime health response is too large.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error('Runtime health endpoint did not return success.'));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('Runtime health response is not valid JSON.'));
        }
      });
    });
    request.on('error', reject);
    request.setTimeout(1500, () => {
      request.destroy(new Error('Runtime health request timed out.'));
    });
  });
}

async function runtimeHealthMatches(runtimeState = activeRuntimeState) {
  const descriptor = runtimeDescriptor(runtimeState);
  const health = await readRuntimeHealth();
  return health.ok === true
    && health.runtimeRevision === descriptor.revision
    && health.runtimeSlot === descriptor.slot;
}

function expectRendererHealth(timeoutMs = 10000) {
  if (rendererHealthExpectation) rendererHealthExpectation.finish(false);
  let finish;
  const promise = new Promise((resolve) => {
    let complete = false;
    const timeout = setTimeout(() => {
      if (complete) return;
      complete = true;
      rendererHealthExpectation = null;
      resolve(false);
    }, timeoutMs);
    finish = (healthy) => {
      if (complete) return;
      complete = true;
      clearTimeout(timeout);
      rendererHealthExpectation = null;
      resolve(Boolean(healthy));
    };
  });
  rendererHealthExpectation = {
    senderId: win.webContents.id,
    finish,
  };
  return {
    promise,
    cancel: () => finish(false),
  };
}

async function restartRuntimeForUpdate(runtimeState, report) {
  report('Stopping services', 25, 'Stopping the current Runtime services…');
  await stopServer();
  if (!(await waitForServerStop())) throw new Error('The current Runtime server did not stop.');
  activeRuntimeState = runtimeState;
  report('Starting services', 48, 'Starting the new Runtime services…');
  if (!startServer(runtimeState, { fatal: false })) throw new Error('The Runtime server could not start.');
  if (!(await waitForServer(15000))) throw new Error('The Runtime server did not respond.');
  if (!pyProc) throw new Error('The managed Runtime server exited.');
  report('Checking services', 68, 'Checking the Runtime API…');
  if (!(await runtimeHealthMatches(runtimeState))) {
    throw new Error('The Runtime health response did not match the active slot.');
  }
  report('Loading interface', 82, 'Loading and checking the updated interface…');
  const rendererHealth = expectRendererHealth();
  try {
    await win.loadURL(APP_URL);
  } catch (error) {
    rendererHealth.cancel();
    throw error;
  }
  const rendererHealthy = await win.webContents.executeJavaScript(
    "document.readyState === 'complete' && Boolean(document.querySelector('.dashboard')) && Boolean(document.getElementById('app-version'))",
    true,
  );
  const rendererReportedReady = await rendererHealth.promise;
  if (!rendererHealthy || !rendererReportedReady) {
    throw new Error('The Runtime interface health check failed.');
  }
  report('Health check passed', 90, 'The updated Runtime is healthy.');
}

function senderLocation(event) {
  return event.senderFrame && event.senderFrame.url ? event.senderFrame.url : '';
}

function isDashboardSender(event) {
  try {
    return new URL(senderLocation(event)).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function isSettingsSender(event) {
  return senderLocation(event) === SETTINGS_URL;
}

function isPanelSender(event) {
  return isDashboardSender(event) || isSettingsSender(event);
}

function requireSender(event, validator) {
  if (!validator(event)) throw new Error('Unauthorized Panel request.');
}

async function showDashboard() {
  if (!pyProc) {
    if (await ping()) {
      fail(
        'Panel local port is already in use',
        `Another process is using ${APP_ORIGIN}. Close it, then reopen Panel.`,
      );
      return false;
    }
    if (!startServer(activeRuntimeState)) return false;
    if (!(await waitForServer())) {
      fail('Panel server did not respond', 'The local server did not come up in time.');
      return false;
    }
  }
  try {
    if (!(await runtimeHealthMatches(activeRuntimeState))) {
      throw new Error('The managed server identity does not match the active Runtime.');
    }
  } catch (error) {
    fail('Panel server validation failed', String(error));
    return false;
  }
  await win.loadURL(APP_URL);
  return true;
}

async function showSettings() {
  await win.loadFile(SETTINGS_FILE);
  return true;
}

function combinedUpdateState() {
  const fullUpdate = updateManager.snapshot();
  const uiPatch = patchManager.snapshot(fullUpdate.channel);
  const patchNumber = uiPatch.patch && uiPatch.patch.patchNumber;
  return {
    ...fullUpdate,
    version: runtimeVersionInfo(versionInfo, patchNumber),
    uiPatch,
    runtimeUpdate: runtimeUpdateManager.snapshot(),
  };
}

function publishUpdateState() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('panel:update-state', combinedUpdateState());
}

async function checkAllUpdates() {
  const channel = updateManager.snapshot().channel;
  await Promise.allSettled([
    updateManager.check(),
    patchManager.check(channel),
    runtimeUpdateManager.check(),
  ]);
  publishUpdateState();
  return combinedUpdateState();
}

function createRuntimeUpdateService(channel) {
  const bootstrap = createRuntimeBootstrap({
    app,
    channel,
    resourcesPath: process.resourcesPath,
  });
  const developmentFeedUrl = process.env.PANEL_RUNTIME_FEED_URL || '';
  const enabled = Boolean(bootstrap) && (app.isPackaged || Boolean(developmentFeedUrl));
  let publicKey = null;
  if (enabled) {
    const paths = runtimePaths({
      app,
      channel,
      resourcesPath: process.resourcesPath,
    });
    publicKey = fs.readFileSync(paths.publicKey);
  }
  runtimeUpdateManager = new RuntimeUpdateManager({
    enabled,
    bootstrap,
    fetcher: (url, options) => net.fetch(url, options),
    feedUrl: app.isPackaged ? RUNTIME_FEED_URLS[channel] : developmentFeedUrl,
    publicKey,
    keyId: bootstrap ? bootstrap.keyId : '',
    channel,
    currentVersion: app.getVersion(),
    bootstrapApiVersion: BOOTSTRAP_API_VERSION,
    runtimeApiVersion: RUNTIME_API_VERSION,
    downloadDirectory: path.join(app.getPath('userData'), 'runtime-downloads'),
  });
  runtimeUpdateManager.on('state', publishUpdateState);
}

function createUpdateServices() {
  const versionFile = app.isPackaged
    ? path.join(process.resourcesPath, 'VERSION.json')
    : path.join(__dirname, '..', 'VERSION.json');
  versionInfo = loadVersionInfo(versionFile);
  if (!matchesPackageVersion(versionInfo, app.getVersion())) {
    throw new Error('App version does not match VERSION.json.');
  }
  updateManager = new UpdateManager({
    app,
    updater: autoUpdater,
    settingsStore,
    enabled: app.isPackaged,
  });
  const developmentPatchUrl = process.env.PANEL_PATCH_MANIFEST_BASE_URL || '';
  patchManager = new PatchManager({
    appVersion: app.getVersion(),
    userDataPath: app.getPath('userData'),
    fetcher: (url, options) => net.fetch(url, options),
    manifestBaseUrl: app.isPackaged ? PATCH_MANIFEST_BASE_URL : developmentPatchUrl,
    trust: PATCH_TRUST,
    allowHttp: !app.isPackaged,
  });
  createRuntimeUpdateService(settingsStore.status().updateChannel);
  updateManager.on('state', publishUpdateState);
  patchManager.on('state', publishUpdateState);
  if (app.isPackaged) {
    updateTimers.push(setTimeout(checkAllUpdates, 15000));
    updateTimers.push(setInterval(checkAllUpdates, 4 * 60 * 60 * 1000));
  }
}

function registerIpc() {
  ipcMain.handle('panel:open-settings', async (event) => {
    requireSender(event, isDashboardSender);
    return showSettings();
  });

  ipcMain.handle('panel:close-settings', async (event) => {
    requireSender(event, isSettingsSender);
    return showDashboard();
  });

  ipcMain.handle('panel:get-settings-status', (event) => {
    requireSender(event, isSettingsSender);
    return settingsStore.status();
  });

  ipcMain.handle('panel:test-connections', async (event, payload) => {
    requireSender(event, isSettingsSender);
    const settings = settingsStore.mergePayload(payload);
    return testConnections((url, options) => net.fetch(url, options), settings);
  });

  ipcMain.handle('panel:save-settings', async (event, payload) => {
    requireSender(event, isSettingsSender);
    const status = settingsStore.save(payload);
    const servicesRestarted = await restartManagedServer();
    return { ...status, servicesRestarted };
  });

  ipcMain.handle('panel:get-update-state', (event) => {
    requireSender(event, isPanelSender);
    return combinedUpdateState();
  });

  ipcMain.handle('panel:check-for-updates', async (event) => {
    requireSender(event, isPanelSender);
    return checkAllUpdates();
  });

  ipcMain.handle('panel:download-update', async (event) => {
    requireSender(event, isDashboardSender);
    await updateManager.download();
    return combinedUpdateState();
  });

  ipcMain.handle('panel:download-runtime-update', async (event) => {
    requireSender(event, isDashboardSender);
    await runtimeUpdateManager.downloadAndStage();
    return combinedUpdateState();
  });

  ipcMain.handle('panel:apply-runtime-update', async (event) => {
    requireSender(event, isDashboardSender);
    await runtimeUpdateManager.apply(restartRuntimeForUpdate);
    return combinedUpdateState();
  });

  ipcMain.handle('panel:report-runtime-ready', (event) => {
    requireSender(event, isDashboardSender);
    if (
      rendererHealthExpectation
      && rendererHealthExpectation.senderId === event.sender.id
    ) {
      rendererHealthExpectation.finish(true);
    }
    return true;
  });

  ipcMain.handle('panel:install-update', (event) => {
    requireSender(event, isDashboardSender);
    return updateManager.install();
  });

  ipcMain.handle('panel:set-update-channel', async (event, channel) => {
    requireSender(event, isPanelSender);
    if (runtimeUpdateManager.transitionActive()) {
      throw new Error('Finish the active Runtime update before changing channels.');
    }
    updateManager.setChannel(channel);
    patchManager.publish(channel);
    createRuntimeUpdateService(channel);
    activeRuntimeState = await runtimeUpdateManager.prepareForLaunch();
    await restartManagedServer();
    return combinedUpdateState();
  });

  ipcMain.handle('panel:confirm-ui-patch', (event, patchId) => {
    requireSender(event, isDashboardSender);
    return patchManager.confirm(patchId, updateManager.snapshot().channel);
  });

  ipcMain.handle('panel:report-ui-patch-failure', (event, patchId) => {
    requireSender(event, isDashboardSender);
    return patchManager.reportFailure(patchId, updateManager.snapshot().channel);
  });
}

function createWindow() {
  win = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    backgroundColor: '#f3eee4',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, targetUrl) => {
    const currentUrl = win.webContents.getURL();
    if (targetUrl !== APP_URL && targetUrl !== SETTINGS_URL && targetUrl !== currentUrl) {
      event.preventDefault();
    }
  });
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  settingsStore = new SettingsStore({
    safeStorage,
    userDataPath: app.getPath('userData'),
  });
  try {
    createUpdateServices();
    activeRuntimeState = await runtimeUpdateManager.prepareForLaunch();
  } catch (error) {
    fail('Panel startup validation failed', String(error));
    return;
  }
  registerIpc();
  createWindow();
  await showDashboard();
});

app.on('window-all-closed', () => app.quit());

app.on('will-quit', () => {
  updateTimers.forEach((timer) => clearTimeout(timer));
  if (!pyProc || pyProc.killed) return;
  try {
    pyProc.kill('SIGTERM');
  } catch {}
});

app.on('will-quit', () => {
  if (pyProc && !pyProc.killed) {
    try {
      pyProc.kill('SIGTERM');
    } catch {}
  }
});
