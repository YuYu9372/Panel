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
const { SettingsStore } = require('./settings-store');
const { testConnections } = require('./connections');

const HOST = '127.0.0.1';
const PORT = 8642;
const APP_URL = `http://${HOST}:${PORT}/`;
const APP_ORIGIN = `http://${HOST}:${PORT}`;
const SETTINGS_FILE = path.join(__dirname, 'settings.html');
const SETTINGS_URL = pathToFileURL(SETTINGS_FILE).href;

let pyProc = null;
let win = null;
let settingsStore = null;

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

function ping() {
  return new Promise((resolve) => {
    const request = http.get(APP_URL, (response) => {
      response.destroy();
      resolve(true);
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

function serverEnvironment() {
  const settings = settingsStore.runtimeSettings();
  const environment = {
    ...process.env,
    PANEL_HOST: HOST,
    PANEL_PORT: String(PORT),
    PANEL_MANAGED_SETTINGS: '1',
    PANEL_REFRESH_MINUTES: String(settings.refreshMinutes),
    PYTHONDONTWRITEBYTECODE: '1',
  };
  delete environment.ANTHROPIC_API_KEY;
  delete environment.COMPOSIO_MCP_TOKEN;
  if (settings.anthropicApiKey) environment.ANTHROPIC_API_KEY = settings.anthropicApiKey;
  if (settings.composioMcpToken) environment.COMPOSIO_MCP_TOKEN = settings.composioMcpToken;
  return environment;
}

function startServer() {
  const python = findPython();
  if (!python) {
    fail(
      'Python 3 not found',
      'Panel needs Python 3 to run its local server.\n\n'
        + 'Install it from https://www.python.org/downloads/macos/ '
        + 'or run this in Terminal:\n\n    brew install python\n\n'
        + 'Then reopen Panel.',
    );
    return false;
  }
  let environment;
  try {
    environment = serverEnvironment();
  } catch (error) {
    fail('Panel settings could not be read', String(error));
    return false;
  }
  pyProc = spawn(python, ['serve.py'], {
    cwd: panelDir(),
    env: environment,
    stdio: 'ignore',
  });
  const processReference = pyProc;
  pyProc.on('error', (error) => fail('Could not start Panel server', String(error)));
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
  if (!startServer()) return false;
  return waitForServer();
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

function requireSender(event, validator) {
  if (!validator(event)) throw new Error('Unauthorized Panel request.');
}

async function showDashboard() {
  if (!(await ping())) {
    if (!startServer()) return false;
    if (!(await waitForServer())) {
      fail('Panel server did not respond', 'The local server did not come up in time.');
      return false;
    }
  }
  await win.loadURL(APP_URL);
  return true;
}

async function showSettings() {
  await win.loadFile(SETTINGS_FILE);
  return true;
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
  registerIpc();
  createWindow();
  await showDashboard();
});

app.on('window-all-closed', () => app.quit());

app.on('will-quit', () => {
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
