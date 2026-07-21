const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_SETTINGS_LAYOUT,
  validateSettingsLayout,
} = require('../electron/settings-layout');

const configuredLayout = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'config', 'settings-layout.json'),
  'utf8',
));

test('bundled minimal Settings layout matches the immutable field model', () => {
  assert.deepEqual(validateSettingsLayout(configuredLayout), DEFAULT_SETTINGS_LAYOUT);
});

test('Settings layout may safely change labels and field order', () => {
  assert.deepEqual(validateSettingsLayout({
    schemaVersion: 1,
    title: 'Panel preferences',
    fieldOrder: [
      'updateChannel',
      'refreshMinutes',
      'anthropicApiKey',
      'composioMcpToken',
    ],
    labels: {
      refreshMinutes: 'Automatic refresh',
    },
  }), {
    schemaVersion: 1,
    title: 'Panel preferences',
    fieldOrder: [
      'updateChannel',
      'refreshMinutes',
      'anthropicApiKey',
      'composioMcpToken',
    ],
    labels: {
      refreshMinutes: 'Automatic refresh',
    },
  });
});

test('Settings layout cannot hide controls, add values, or add unknown fields', () => {
  assert.throws(() => validateSettingsLayout({
    schemaVersion: 1,
    fieldOrder: ['anthropicApiKey', 'composioMcpToken', 'refreshMinutes'],
  }), /every supported field exactly once/);
  assert.throws(() => validateSettingsLayout({
    schemaVersion: 1,
    connections: { anthropicApiKey: 'secret' },
  }), /unsupported fields/);
  assert.throws(() => validateSettingsLayout({
    schemaVersion: 1,
    labels: { composioMcpUrl: 'MCP URL' },
  }), /unsupported fields/);
});
