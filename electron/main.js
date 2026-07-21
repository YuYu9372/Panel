// Electron wrapper for Panel.
// Launches the existing Python server (serve.py) as a child process, waits for
// it to answer on the local port, then opens a full-screen kiosk window at it.
// Uses the system python3 — if none is found, it tells the user to install it.

const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const HOST = '127.0.0.1';
const PORT = 8642;
const APP_URL = `http://${HOST}:${PORT}/`;

let pyProc = null;
let win = null;

// serve.py + the static assets live in the repo root during dev, and in
// Resources/panel inside the packaged .app.
function panelDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'panel')
    : path.join(__dirname, '..');
}

// Apps launched from Finder inherit a minimal PATH (no Homebrew dirs), so probe
// the usual python3 locations directly instead of relying on `python3` in PATH.
function findPython() {
  const homes = [
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
  ];
  const fromPath = (process.env.PATH || '')
    .split(':')
    .filter(Boolean)
    .map((dir) => path.join(dir, 'python3'));
  for (const candidate of [...homes, ...fromPath]) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  return null;
}

// True if a Panel server is already answering on the port.
function ping() {
  return new Promise((resolve) => {
    const req = http.get(APP_URL, (res) => {
      res.destroy();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await ping()) return true;
    await new Promise((r) => setTimeout(r, 300));
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
  pyProc = spawn(python, ['serve.py'], {
    cwd: panelDir(),
    env: {
      ...process.env,
      PANEL_HOST: HOST,
      PANEL_PORT: String(PORT),
      PYTHONDONTWRITEBYTECODE: '1',
    },
    stdio: 'ignore',
  });
  pyProc.on('error', (err) => fail('Could not start Panel server', String(err)));
  return true;
}

function createWindow() {
  win = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    backgroundColor: '#f3eee4',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  });
  win.loadURL(APP_URL);
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(async () => {
  // Reuse a server that's already running (e.g. started from Terminal).
  if (!(await ping())) {
    if (!startServer()) return;
  }
  if (!(await waitForServer())) {
    fail('Panel server did not respond', 'The local server did not come up in time.');
    return;
  }
  createWindow();
});

app.on('window-all-closed', () => app.quit());

app.on('will-quit', () => {
  if (pyProc && !pyProc.killed) {
    try {
      pyProc.kill('SIGTERM');
    } catch {}
  }
});
