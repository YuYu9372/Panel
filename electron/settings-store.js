const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_REFRESH_MINUTES = 15;
const MIN_REFRESH_MINUTES = 1;
const MAX_REFRESH_MINUTES = 1440;

function cleanSecret(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateRefreshMinutes(value) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes)
      || minutes < MIN_REFRESH_MINUTES
      || minutes > MAX_REFRESH_MINUTES) {
    throw new Error(`Refresh time must be between ${MIN_REFRESH_MINUTES} and ${MAX_REFRESH_MINUTES} minutes.`);
  }
  return minutes;
}

function validateUpdateChannel(value) {
  if (!['stable', 'developer'].includes(value)) throw new Error('Unknown update channel.');
  return value;
}

class SettingsStore {
  constructor({ safeStorage, userDataPath, fsModule = fs }) {
    this.safeStorage = safeStorage;
    this.fs = fsModule;
    this.directory = path.join(userDataPath, 'secure-settings');
    this.file = path.join(this.directory, 'settings.json');
  }

  defaultData() {
    return {
      schemaVersion: 1,
      refreshMinutes: DEFAULT_REFRESH_MINUTES,
      updateChannel: 'stable',
      secrets: {},
    };
  }

  readData() {
    if (!this.fs.existsSync(this.file)) return this.defaultData();
    const data = JSON.parse(this.fs.readFileSync(this.file, 'utf8'));
    if (data.schemaVersion !== 1 || typeof data.secrets !== 'object' || data.secrets === null) {
      throw new Error('The saved settings format is not supported.');
    }
    data.refreshMinutes = validateRefreshMinutes(data.refreshMinutes);
    data.updateChannel = validateUpdateChannel(data.updateChannel || 'stable');
    return data;
  }

  encrypt(value) {
    if (!value) return undefined;
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error('macOS secure storage is not available.');
    }
    return this.safeStorage.encryptString(value).toString('base64');
  }

  decrypt(value) {
    if (!value) return '';
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error('macOS secure storage is not available.');
    }
    return this.safeStorage.decryptString(Buffer.from(value, 'base64'));
  }

  runtimeSettings() {
    const data = this.readData();
    return {
      refreshMinutes: data.refreshMinutes,
      updateChannel: data.updateChannel,
      anthropicApiKey: this.decrypt(data.secrets.anthropicApiKey),
      composioMcpToken: this.decrypt(data.secrets.composioMcpToken),
    };
  }

  status() {
    const data = this.readData();
    return {
      refreshMinutes: data.refreshMinutes,
      updateChannel: data.updateChannel,
      hasAnthropicApiKey: Boolean(data.secrets.anthropicApiKey),
      hasComposioMcpToken: Boolean(data.secrets.composioMcpToken),
    };
  }

  mergePayload(payload = {}) {
    const current = this.runtimeSettings();
    const replacement = (name) => {
      const candidate = cleanSecret(payload[name]);
      return candidate || current[name];
    };
    return {
      refreshMinutes: validateRefreshMinutes(payload.refreshMinutes ?? current.refreshMinutes),
      updateChannel: validateUpdateChannel(payload.updateChannel ?? current.updateChannel),
      anthropicApiKey: replacement('anthropicApiKey'),
      composioMcpToken: replacement('composioMcpToken'),
    };
  }

  save(payload) {
    const settings = this.mergePayload(payload);
    const data = {
      schemaVersion: 1,
      refreshMinutes: settings.refreshMinutes,
      updateChannel: settings.updateChannel,
      secrets: {
        anthropicApiKey: this.encrypt(settings.anthropicApiKey),
        composioMcpToken: this.encrypt(settings.composioMcpToken),
      },
    };
    Object.keys(data.secrets).forEach((key) => {
      if (!data.secrets[key]) delete data.secrets[key];
    });
    this.writeData(data);
    return this.status();
  }

  writeData(data) {
    this.fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.fs.chmodSync(this.directory, 0o700);
    const temporaryFile = path.join(this.directory, `settings-${crypto.randomUUID()}.tmp`);
    this.fs.writeFileSync(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    this.fs.renameSync(temporaryFile, this.file);
    this.fs.chmodSync(this.file, 0o600);
  }

  setUpdateChannel(channel) {
    const data = this.readData();
    data.updateChannel = validateUpdateChannel(channel);
    this.writeData(data);
    return this.status();
  }
}

module.exports = {
  DEFAULT_REFRESH_MINUTES,
  MAX_REFRESH_MINUTES,
  MIN_REFRESH_MINUTES,
  SettingsStore,
  validateRefreshMinutes,
  validateUpdateChannel,
};
