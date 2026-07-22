const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  COMPOSIO_MCP_URL,
  parseRawSettings,
  serializeRawSettings,
} = require('../electron/raw-settings');

test('RAW settings serialize only allowlisted Panel environment fields', () => {
  const text = serializeRawSettings({
    refreshMinutes: 30,
    updateChannel: 'developer',
  });
  assert.equal(text, [
    'PANEL_REFRESH_MINUTES=30',
    'PANEL_UPDATE_CHANNEL=developer',
    'ANTHROPIC_API_KEY=',
    `COMPOSIO_MCP_URL=${COMPOSIO_MCP_URL}`,
    'COMPOSIO_MCP_TOKEN=',
  ].join('\n'));
});

test('RAW settings parse replacements without requiring saved secret values', () => {
  const parsed = parseRawSettings([
    'PANEL_REFRESH_MINUTES=15',
    'PANEL_UPDATE_CHANNEL=stable',
    'ANTHROPIC_API_KEY="new-anthropic-key"',
    `COMPOSIO_MCP_URL=${COMPOSIO_MCP_URL}`,
    'COMPOSIO_MCP_TOKEN=',
  ].join('\n'));
  assert.deepEqual(parsed, {
    refreshMinutes: 15,
    updateChannel: 'stable',
    anthropicApiKey: 'new-anthropic-key',
    composioMcpToken: '',
  });
});

test('RAW settings reject unknown fields, duplicates, and MCP URL changes', () => {
  const valid = serializeRawSettings({ refreshMinutes: 15, updateChannel: 'stable' });
  assert.throws(() => parseRawSettings(`${valid}\nPATH=/tmp`), /not supported/);
  assert.throws(() => parseRawSettings(`${valid}\nPANEL_REFRESH_MINUTES=20`), /duplicated/);
  assert.throws(
    () => parseRawSettings(valid.replace(COMPOSIO_MCP_URL, 'https://example.test/mcp')),
    /fixed/,
  );
});

test('Settings requires a double-click before entering RAW mode', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'electron', 'settings.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'electron', 'settings.html'), 'utf8');
  assert.match(script, /addEventListener\('dblclick'/);
  assert.match(html, /id="raw-mode-button"/);
  assert.match(html, /id="raw-env"/);
});
