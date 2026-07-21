const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  UpdateManager,
  displayVersion,
  releaseNotes,
} = require('../electron/update-manager');

class FakeUpdater extends EventEmitter {
  constructor() {
    super();
    this.downloaded = false;
    this.installed = false;
  }

  async checkForUpdates() {
    return null;
  }

  async downloadUpdate() {
    this.downloaded = true;
    return [];
  }

  quitAndInstall() {
    this.installed = true;
  }
}

function createManager(enabled = true) {
  const updater = new FakeUpdater();
  const settings = {
    channel: 'stable',
    status() {
      return { updateChannel: this.channel };
    },
    setUpdateChannel(channel) {
      this.channel = channel;
    },
  };
  const app = { getVersion: () => '0.5.2-alpha.4' };
  return {
    manager: new UpdateManager({ app, updater, settingsStore: settings, enabled }),
    updater,
    settings,
  };
}

test('alpha version is displayed with the Panel milestone suffix', () => {
  assert.equal(displayVersion('0.5.2-alpha.2'), '0.5.2_B');
  assert.equal(displayVersion('0.5.2-alpha.3'), '0.5.2_C');
  assert.equal(displayVersion('0.5.2-alpha.4'), '0.5.2_D');
  assert.equal(displayVersion('0.5.2'), '0.5.2');
});

test('release notes are converted to short plain-text entries', () => {
  assert.deepEqual(releaseNotes('<b>Secure update</b>\n- Better rollback'), [
    'Secure update',
    'Better rollback',
  ]);
});

test('update lifecycle exposes safe state and installs only after download', async () => {
  const { manager, updater } = createManager();
  updater.emit('update-available', {
    version: '0.5.3-alpha.1',
    releaseName: 'Developer build',
    releaseNotes: '<b>New update panel</b>',
  });
  assert.equal(manager.snapshot().status, 'available');
  assert.deepEqual(manager.snapshot().releaseNotes, ['New update panel']);
  await manager.download();
  assert.equal(updater.downloaded, true);
  updater.emit('download-progress', { percent: 51.6 });
  assert.equal(manager.snapshot().progress, 52);
  updater.emit('update-downloaded', { version: '0.5.3-alpha.1' });
  assert.equal(manager.snapshot().status, 'downloaded');
  assert.equal(manager.install(), true);
  assert.equal(updater.installed, true);
});

test('channel selection enables alpha without allowing downgrade', () => {
  const { manager, updater, settings } = createManager();
  manager.setChannel('developer');
  assert.equal(settings.channel, 'developer');
  assert.equal(updater.channel, 'alpha');
  assert.equal(updater.allowPrerelease, true);
  assert.equal(updater.allowDowngrade, false);
  manager.setChannel('stable');
  assert.equal(updater.channel, 'latest');
  assert.equal(updater.allowPrerelease, false);
});

test('development runtime reports updates as unavailable', async () => {
  const { manager } = createManager(false);
  const state = await manager.check();
  assert.equal(state.status, 'unavailable');
});
