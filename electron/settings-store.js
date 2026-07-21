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
      anthropicApiKey: this.decrypt(data.secrets.anthropicApiKey),
      composioMcpToken: this.decrypt(data.secrets.composioMcpToken),
    };
  }

  status() {
    const settings = this.runtimeSettings();
    return {
      refreshMinutes: settings.refreshMinutes,
      hasAnthropicApiKey: Boolean(settings.anthropicApiKey),
      hasComposioMcpToken: Boolean(settings.composioMcpToken),
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
      anthropicApiKey: replacement('anthropicApiKey'),
      composioMcpToken: replacement('composioMcpToken'),
    };
  }

  save(payload) {
    const settings = this.mergePayload(payload);
    const data = {
      schemaVersion: 1,
      refreshMinutes: settings.refreshMinutes,
      secrets: {
        anthropicApiKey: this.encrypt(settings.anthropicApiKey),
        composioMcpToken: this.encrypt(settings.composioMcpToken),
      },
    };
    Object.keys(data.secrets).forEach((key) => {
      if (!data.secrets[key]) delete data.secrets[key];
    });
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
    return this.status();
  }
}

module.exports = {
  DEFAULT_REFRESH_MINUTES,
  MAX_REFRESH_MINUTES,
  MIN_REFRESH_MINUTES,
  SettingsStore,
  validateRefreshMinutes,
};
