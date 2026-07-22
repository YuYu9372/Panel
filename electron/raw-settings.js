const COMPOSIO_MCP_URL = 'https://connect.composio.dev/mcp';
const RAW_KEYS = Object.freeze([
  'PANEL_REFRESH_MINUTES',
  'PANEL_UPDATE_CHANNEL',
  'ANTHROPIC_API_KEY',
  'COMPOSIO_MCP_URL',
  'COMPOSIO_MCP_TOKEN',
]);

function cleanValue(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseRawSettings(text) {
  if (typeof text !== 'string') throw new Error('RAW settings must be text.');
  const values = {};
  for (const [index, sourceLine] of text.split(/\r?\n/).entries()) {
    const line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error(`RAW line ${index + 1} must use KEY=value.`);
    const key = line.slice(0, separator).trim();
    if (!RAW_KEYS.includes(key)) throw new Error(`RAW field ${key} is not supported.`);
    if (key in values) throw new Error(`RAW field ${key} is duplicated.`);
    values[key] = cleanValue(line.slice(separator + 1));
  }
  const missing = RAW_KEYS.filter((key) => !(key in values));
  if (missing.length) throw new Error(`RAW settings are missing ${missing.join(', ')}.`);
  const refreshMinutes = Number(values.PANEL_REFRESH_MINUTES);
  if (!Number.isInteger(refreshMinutes) || refreshMinutes < 1 || refreshMinutes > 1440) {
    throw new Error('PANEL_REFRESH_MINUTES must be a whole number from 1 to 1440.');
  }
  if (!['stable', 'developer'].includes(values.PANEL_UPDATE_CHANNEL)) {
    throw new Error('PANEL_UPDATE_CHANNEL must be stable or developer.');
  }
  if (values.COMPOSIO_MCP_URL !== COMPOSIO_MCP_URL) {
    throw new Error('COMPOSIO_MCP_URL is fixed and cannot be changed.');
  }
  return {
    refreshMinutes,
    updateChannel: values.PANEL_UPDATE_CHANNEL,
    anthropicApiKey: values.ANTHROPIC_API_KEY,
    composioMcpToken: values.COMPOSIO_MCP_TOKEN,
  };
}

function serializeRawSettings(settings = {}) {
  const refreshMinutes = Number.isInteger(settings.refreshMinutes)
    ? settings.refreshMinutes
    : 15;
  const updateChannel = ['stable', 'developer'].includes(settings.updateChannel)
    ? settings.updateChannel
    : 'stable';
  return [
    `PANEL_REFRESH_MINUTES=${refreshMinutes}`,
    `PANEL_UPDATE_CHANNEL=${updateChannel}`,
    `ANTHROPIC_API_KEY=${settings.anthropicApiKey || ''}`,
    `COMPOSIO_MCP_URL=${COMPOSIO_MCP_URL}`,
    `COMPOSIO_MCP_TOKEN=${settings.composioMcpToken || ''}`,
  ].join('\n');
}

const rawSettings = {
  COMPOSIO_MCP_URL,
  RAW_KEYS,
  parseRawSettings,
  serializeRawSettings,
};

if (typeof module !== 'undefined' && module.exports) module.exports = rawSettings;
if (typeof window !== 'undefined') window.panelRawSettings = rawSettings;
