const DEFAULT_SETTINGS_LAYOUT = Object.freeze({
  title: 'Settings',
  fieldOrder: [
    'anthropicApiKey',
    'composioMcpToken',
    'refreshMinutes',
    'updateChannel',
  ],
  labels: {
    anthropicApiKey: 'Anthropic API Key',
    composioMcpToken: 'Composio MCP Token',
    refreshMinutes: 'Refresh time',
    updateChannel: 'Update channel',
  },
});

const fields = {
  anthropicApiKey: document.getElementById('anthropic-api-key'),
  composioMcpToken: document.getElementById('composio-mcp-token'),
};

const form = document.getElementById('connections-form');
const refreshMinutes = document.getElementById('refresh-minutes');
const updateChannel = document.getElementById('update-channel');
const formMessage = document.getElementById('form-message');
const testButton = document.getElementById('test-button');
const saveButton = document.getElementById('save-button');
const checkUpdateButton = document.getElementById('settings-check-update');
const settingsFields = document.getElementById('settings-fields');
const rawSettingsPanel = document.getElementById('raw-settings');
const rawEnv = document.getElementById('raw-env');
const rawModeButton = document.getElementById('raw-mode-button');
let rawMode = false;
let currentStatus = null;

function applyTheme() {
  const hour = new Date().getHours();
  document.documentElement.dataset.theme = hour >= 18 || hour < 5 ? 'dark' : 'light';
}

function layoutOrDefault(candidate) {
  if (!candidate || typeof candidate !== 'object') return DEFAULT_SETTINGS_LAYOUT;
  const allowedFields = DEFAULT_SETTINGS_LAYOUT.fieldOrder;
  const order = Array.isArray(candidate.fieldOrder)
    && candidate.fieldOrder.length === allowedFields.length
    && new Set(candidate.fieldOrder).size === allowedFields.length
    && candidate.fieldOrder.every((field) => allowedFields.includes(field))
    ? candidate.fieldOrder
    : allowedFields;
  const labels = { ...DEFAULT_SETTINGS_LAYOUT.labels };
  if (candidate.labels && typeof candidate.labels === 'object') {
    allowedFields.forEach((field) => {
      if (typeof candidate.labels[field] === 'string' && candidate.labels[field]) {
        labels[field] = candidate.labels[field];
      }
    });
  }
  return {
    title: typeof candidate.title === 'string' && candidate.title
      ? candidate.title
      : DEFAULT_SETTINGS_LAYOUT.title,
    fieldOrder: order,
    labels,
  };
}

function applySettingsLayout(candidate) {
  const layout = layoutOrDefault(candidate);
  document.getElementById('settings-title').textContent = layout.title;
  document.title = `Panel ${layout.title}`;
  const container = document.getElementById('settings-fields');
  layout.fieldOrder.forEach((field) => {
    document.getElementById(`settings-label-${field}`).textContent = layout.labels[field];
    container.appendChild(document.getElementById(`settings-field-${field}`));
  });
}

function setBusy(busy) {
  testButton.disabled = busy;
  saveButton.disabled = busy;
  rawModeButton.disabled = busy;
  rawEnv.disabled = busy;
  document.getElementById('back-button').disabled = busy;
}

function setUpdateBusy(busy) {
  checkUpdateButton.disabled = busy;
  updateChannel.disabled = busy || rawMode;
}

function setMessage(message, state = '') {
  formMessage.textContent = message;
  formMessage.dataset.state = state;
}

function setConnectionStatus(id, response) {
  const element = document.getElementById(`${id}-status`);
  element.textContent = response.message;
  element.dataset.state = response.ok ? 'success' : 'error';
}

function payload() {
  if (rawMode) return window.panelRawSettings.parseRawSettings(rawEnv.value);
  return {
    refreshMinutes: Number(refreshMinutes.value),
    updateChannel: updateChannel.value,
    anthropicApiKey: fields.anthropicApiKey.value,
    composioMcpToken: fields.composioMcpToken.value,
  };
}

function applyStatus(status) {
  currentStatus = status;
  refreshMinutes.value = status.refreshMinutes;
  fields.anthropicApiKey.placeholder = status.hasAnthropicApiKey
    ? 'Saved — enter a new key to replace it'
    : 'Enter Anthropic API key';
  fields.composioMcpToken.placeholder = status.hasComposioMcpToken
    ? 'Saved — enter a new token to replace it'
    : 'Enter Composio MCP token';
  updateChannel.value = status.updateChannel;
  if (rawMode) {
    rawEnv.value = window.panelRawSettings.serializeRawSettings({
      refreshMinutes: status.refreshMinutes,
      updateChannel: status.updateChannel,
    });
  }
}

function setFormDisabled(disabled) {
  settingsFields.querySelectorAll('input, select, button').forEach((element) => {
    element.disabled = disabled;
  });
}

function openRawMode() {
  rawEnv.value = window.panelRawSettings.serializeRawSettings({
    refreshMinutes: Number(refreshMinutes.value),
    updateChannel: updateChannel.value,
    anthropicApiKey: fields.anthropicApiKey.value,
    composioMcpToken: fields.composioMcpToken.value,
  });
  rawMode = true;
  setFormDisabled(true);
  settingsFields.hidden = true;
  rawSettingsPanel.hidden = false;
  rawModeButton.textContent = 'FORM';
  rawEnv.focus();
  setMessage('RAW mode is active. Saved secret values remain hidden.');
}

function closeRawMode() {
  const settings = window.panelRawSettings.parseRawSettings(rawEnv.value);
  refreshMinutes.value = settings.refreshMinutes;
  updateChannel.value = settings.updateChannel;
  fields.anthropicApiKey.value = settings.anthropicApiKey;
  fields.composioMcpToken.value = settings.composioMcpToken;
  rawMode = false;
  rawSettingsPanel.hidden = true;
  settingsFields.hidden = false;
  setFormDisabled(false);
  rawModeButton.textContent = 'RAW';
  setMessage('Form mode is active.');
}

function renderUpdateState(state) {
  document.getElementById('settings-update-status').textContent = state.message || 'Ready to check';
  if (state.version && state.version.appVersion) {
    document.getElementById('settings-app-version').textContent = state.version.appVersion;
  }
  updateChannel.value = state.channel;
  const patch = state.uiPatch && state.uiPatch.patch;
  applySettingsLayout(patch && patch.settingsLayout);
}

async function loadStatus() {
  try {
    const [status, updateState] = await Promise.all([
      window.panelApp.getSettingsStatus(),
      window.panelApp.getUpdateState(),
    ]);
    applyStatus(status);
    renderUpdateState(updateState);
  } catch {
    setMessage('Settings could not be loaded.', 'error');
  }
}

updateChannel.addEventListener('change', async () => {
  const previous = updateChannel.value === 'developer' ? 'stable' : 'developer';
  setUpdateBusy(true);
  try {
    renderUpdateState(await window.panelApp.setUpdateChannel(updateChannel.value));
  } catch {
    updateChannel.value = previous;
    document.getElementById('settings-update-status').textContent = 'The channel could not be changed.';
  } finally {
    setUpdateBusy(false);
  }
});

rawModeButton.addEventListener('click', (event) => {
  if (event.detail === 1) setMessage(`Double-click ${rawMode ? 'FORM' : 'RAW'} to switch mode.`);
});

rawModeButton.addEventListener('dblclick', () => {
  try {
    if (rawMode) closeRawMode();
    else openRawMode();
  } catch (error) {
    setMessage(error.message || 'RAW settings are not valid.', 'error');
  }
});

checkUpdateButton.addEventListener('click', async () => {
  setUpdateBusy(true);
  document.getElementById('settings-update-status').textContent = 'Checking for updates…';
  try {
    renderUpdateState(await window.panelApp.checkForUpdates());
  } catch {
    document.getElementById('settings-update-status').textContent = 'The secure update check failed.';
  } finally {
    setUpdateBusy(false);
  }
});

document.querySelectorAll('.reveal-button').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.target);
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    button.textContent = reveal ? 'Hide' : 'Show';
  });
});

document.getElementById('back-button').addEventListener('click', async () => {
  setBusy(true);
  try {
    await window.panelApp.closeSettings();
  } catch {
    setBusy(false);
    setMessage('The dashboard could not be opened.', 'error');
  }
});

testButton.addEventListener('click', async () => {
  if (!rawMode && !form.reportValidity()) return;
  setBusy(true);
  setMessage('Testing connections…');
  try {
    const settings = payload();
    const response = await window.panelApp.testConnections(settings);
    setConnectionStatus('anthropic', response.anthropic);
    setConnectionStatus('composio', response.composio);
    const connected = response.anthropic.ok && response.composio.ok;
    setMessage(
      connected ? 'All connections are ready.' : 'One or more connections need attention.',
      connected ? 'success' : 'error',
    );
  } catch (error) {
    setMessage(error.message || 'Connections could not be tested.', 'error');
  } finally {
    setBusy(false);
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!rawMode && !form.reportValidity()) return;
  setBusy(true);
  setMessage('Saving encrypted settings…');
  try {
    const settings = payload();
    if (currentStatus && settings.updateChannel !== currentStatus.updateChannel) {
      await window.panelApp.setUpdateChannel(settings.updateChannel);
    }
    const status = await window.panelApp.saveSettings(settings);
    Object.values(fields).forEach((field) => {
      field.value = '';
      field.type = 'password';
    });
    document.querySelectorAll('.reveal-button').forEach((button) => {
      button.textContent = 'Show';
    });
    applyStatus(status);
    setMessage(
      status.servicesRestarted
        ? 'Settings saved. Panel services were restarted.'
        : 'Settings saved. Reopen Panel to apply them to an external server.',
      'success',
    );
  } catch (error) {
    setMessage(error.message || 'Settings could not be saved.', 'error');
  } finally {
    setBusy(false);
  }
});

applyTheme();
applySettingsLayout();
if (window.panelApp) {
  window.panelApp.onUpdateState((state) => renderUpdateState(state));
  loadStatus();
}
