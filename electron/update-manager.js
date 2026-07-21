const { EventEmitter } = require('events');

function displayVersion(version) {
  const match = /^(\d+\.\d+\.\d+)-alpha\.(\d+)$/.exec(version || '');
  if (!match) return version || '';
  const suffix = Number(match[2]);
  if (suffix >= 1 && suffix <= 26) return `${match[1]}_${String.fromCharCode(64 + suffix)}`;
  return version;
}

function releaseNotes(value) {
  const notes = Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item : item && item.note))
    : [value];
  return notes
    .filter((item) => typeof item === 'string')
    .flatMap((item) => item.split(/\r?\n/))
    .map((item) => item.replace(/<[^>]*>/g, '').replace(/^[-*\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((item) => item.slice(0, 240));
}

class UpdateManager extends EventEmitter {
  constructor({ app, updater, settingsStore, enabled }) {
    super();
    this.app = app;
    this.updater = updater;
    this.settingsStore = settingsStore;
    this.enabled = enabled;
    this.checkInFlight = null;
    this.state = {
      status: enabled ? 'idle' : 'unavailable',
      channel: settingsStore.status().updateChannel,
      currentVersion: app.getVersion(),
      currentDisplayVersion: displayVersion(app.getVersion()),
      availableVersion: '',
      availableDisplayVersion: '',
      releaseName: '',
      releaseNotes: [],
      progress: 0,
      message: enabled ? 'Updates are checked securely.' : 'Updates require a packaged app.',
    };
    this.configureUpdater();
  }

  configureUpdater() {
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = true;
    this.applyChannel(this.state.channel);
    this.updater.on('checking-for-update', () => {
      this.updateState({ status: 'checking', message: 'Checking for updates…' });
    });
    this.updater.on('update-available', (info) => {
      this.updateState({
        status: 'available',
        availableVersion: info.version || '',
        availableDisplayVersion: displayVersion(info.version),
        releaseName: typeof info.releaseName === 'string' ? info.releaseName.slice(0, 120) : '',
        releaseNotes: releaseNotes(info.releaseNotes),
        progress: 0,
        message: 'A verified Panel update is available.',
      });
    });
    this.updater.on('update-not-available', () => {
      this.updateState({
        status: 'idle',
        availableVersion: '',
        availableDisplayVersion: '',
        releaseName: '',
        releaseNotes: [],
        progress: 0,
        message: 'Panel is up to date.',
      });
    });
    this.updater.on('download-progress', (progress) => {
      this.updateState({
        status: 'downloading',
        progress: Math.max(0, Math.min(100, Math.round(progress.percent || 0))),
        message: 'Downloading the signed update…',
      });
    });
    this.updater.on('update-downloaded', (info) => {
      this.updateState({
        status: 'downloaded',
        availableVersion: info.version || this.state.availableVersion,
        availableDisplayVersion: displayVersion(info.version || this.state.availableVersion),
        releaseNotes: releaseNotes(info.releaseNotes).length
          ? releaseNotes(info.releaseNotes)
          : this.state.releaseNotes,
        progress: 100,
        message: 'Update verified and ready to install.',
      });
    });
    this.updater.on('error', () => {
      this.updateState({ status: 'error', message: 'The secure update check failed.' });
    });
  }

  applyChannel(channel) {
    const updaterChannel = channel === 'developer' ? 'alpha' : 'latest';
    this.updater.channel = updaterChannel;
    this.updater.allowPrerelease = channel === 'developer';
    this.updater.allowDowngrade = false;
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  updateState(changes) {
    this.state = { ...this.state, ...changes };
    this.emit('state', this.snapshot());
  }

  async check() {
    if (!this.enabled) {
      this.updateState({ status: 'unavailable', message: 'Updates require a packaged app.' });
      return this.snapshot();
    }
    if (this.checkInFlight) return this.checkInFlight;
    this.checkInFlight = this.updater.checkForUpdates()
      .catch(() => {
        this.updateState({ status: 'error', message: 'The secure update check failed.' });
        return null;
      })
      .finally(() => {
        this.checkInFlight = null;
      });
    await this.checkInFlight;
    return this.snapshot();
  }

  async download() {
    if (this.state.status !== 'available') throw new Error('No update is ready to download.');
    this.updateState({ status: 'downloading', progress: 0, message: 'Downloading the signed update…' });
    await this.updater.downloadUpdate();
    return this.snapshot();
  }

  install() {
    if (this.state.status !== 'downloaded') throw new Error('The update has not finished downloading.');
    this.updater.quitAndInstall(false, true);
    return true;
  }

  setChannel(channel) {
    if (!['stable', 'developer'].includes(channel)) throw new Error('Unknown update channel.');
    this.settingsStore.setUpdateChannel(channel);
    this.applyChannel(channel);
    this.updateState({
      status: this.enabled ? 'idle' : 'unavailable',
      channel,
      availableVersion: '',
      availableDisplayVersion: '',
      releaseName: '',
      releaseNotes: [],
      progress: 0,
      message: channel === 'developer'
        ? 'Developer updates are enabled.'
        : 'Stable updates are enabled.',
    });
    return this.snapshot();
  }
}

module.exports = {
  UpdateManager,
  displayVersion,
  releaseNotes,
};
