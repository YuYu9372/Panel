const SETTINGS_FIELD_IDS = Object.freeze([
  'anthropicApiKey',
  'composioMcpToken',
  'refreshMinutes',
  'updateChannel',
]);

const DEFAULT_SETTINGS_LAYOUT = Object.freeze({
  schemaVersion: 1,
  title: 'Settings',
  fieldOrder: [...SETTINGS_FIELD_IDS],
  labels: Object.freeze({
    anthropicApiKey: 'Anthropic API Key',
    composioMcpToken: 'Composio MCP Token',
    refreshMinutes: 'Refresh time',
    updateChannel: 'Update channel',
  }),
});

function cleanLabel(value, maximum, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maximum || /[\u0000-\u001f\u007f]/.test(cleaned)) {
    throw new Error(`${label} is not valid.`);
  }
  return cleaned;
}

function validateSettingsLayout(layout) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
    throw new Error('Settings layout must be an object.');
  }
  const allowed = new Set(['schemaVersion', 'title', 'fieldOrder', 'labels']);
  if (Object.keys(layout).some((key) => !allowed.has(key))) {
    throw new Error('Settings layout contains unsupported fields.');
  }
  if (layout.schemaVersion !== 1) throw new Error('Unsupported Settings layout schema.');

  const cleaned = { schemaVersion: 1 };
  let hasChange = false;
  if (layout.title !== undefined) {
    cleaned.title = cleanLabel(layout.title, 40, 'Settings title');
    hasChange = true;
  }
  if (layout.fieldOrder !== undefined) {
    if (!Array.isArray(layout.fieldOrder)
        || layout.fieldOrder.length !== SETTINGS_FIELD_IDS.length
        || new Set(layout.fieldOrder).size !== SETTINGS_FIELD_IDS.length
        || layout.fieldOrder.some((field) => !SETTINGS_FIELD_IDS.includes(field))) {
      throw new Error('Settings field order must contain every supported field exactly once.');
    }
    cleaned.fieldOrder = [...layout.fieldOrder];
    hasChange = true;
  }
  if (layout.labels !== undefined) {
    if (!layout.labels || typeof layout.labels !== 'object' || Array.isArray(layout.labels)) {
      throw new Error('Settings labels must be an object.');
    }
    const entries = Object.entries(layout.labels);
    if (!entries.length || entries.some(([field]) => !SETTINGS_FIELD_IDS.includes(field))) {
      throw new Error('Settings labels contain unsupported fields.');
    }
    cleaned.labels = Object.fromEntries(entries.map(([field, label]) => (
      [field, cleanLabel(label, 48, `${field} label`)]
    )));
    hasChange = true;
  }
  if (!hasChange) throw new Error('Settings layout is empty.');
  return cleaned;
}

module.exports = {
  DEFAULT_SETTINGS_LAYOUT,
  SETTINGS_FIELD_IDS,
  validateSettingsLayout,
};
