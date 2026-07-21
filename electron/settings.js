const fields = {
  anthropicApiKey: document.getElementById('anthropic-api-key'),
  composioMcpToken: document.getElementById('composio-mcp-token'),
};

const form = document.getElementById('connections-form');
const refreshMinutes = document.getElementById('refresh-minutes');
const formMessage = document.getElementById('form-message');
const testButton = document.getElementById('test-button');
const saveButton = document.getElementById('save-button');
const checkUpdateButton = document.getElementById('settings-check-update');
const channelButtons = [...document.querySelectorAll('.channel-option')];

function applyTheme() {
  const hour = new Date().getHours();
  document.documentElement.dataset.theme = hour >= 18 || hour < 5 ? 'dark' : 'light';
}

function setBusy(busy) {
  testButton.disabled = busy;
  saveButton.disabled = busy;
  document.getElementById('back-button').disabled = busy;
}

function setUpdateBusy(busy) {
  checkUpdateButton.disabled = busy;
  channelButtons.forEach((button) => {
    button.disabled = busy;
  });
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
  return {
    refreshMinutes: Number(refreshMinutes.value),
    anthropicApiKey: fields.anthropicApiKey.value,
    composioMcpToken: fields.composioMcpToken.value,
  };
}

function applyStatus(status) {
  refreshMinutes.value = status.refreshMinutes;
  fields.anthropicApiKey.placeholder = status.hasAnthropicApiKey
    ? 'Saved — enter a new key to replace it'
    : 'Enter Anthropic API key';
  fields.composioMcpToken.placeholder = status.hasComposioMcpToken
    ? 'Saved — enter a new token to replace it'
    : 'Enter Composio MCP token';
  channelButtons.forEach((button) => {
    const active = button.dataset.channel === status.updateChannel;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-checked', String(active));
  });
}

function renderUpdateState(state) {
  document.getElementById('settings-current-version').textContent = state.currentDisplayVersion;
  document.getElementById('settings-update-status').textContent = state.message || 'Ready to check';
  channelButtons.forEach((button) => {
    const active = button.dataset.channel === state.channel;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-checked', String(active));
  });
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

document.querySelectorAll('.settings-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.settings-tab').forEach((candidate) => {
      const active = candidate === tab;
      candidate.classList.toggle('is-active', active);
      if (active) candidate.setAttribute('aria-current', 'page');
      else candidate.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
      panel.hidden = panel.id !== tab.dataset.panel;
    });
  });
});

channelButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    setUpdateBusy(true);
    try {
      const state = await window.panelApp.setUpdateChannel(button.dataset.channel);
      renderUpdateState(state);
    } catch {
      document.getElementById('settings-update-status').textContent = 'The channel could not be changed.';
    } finally {
      setUpdateBusy(false);
    }
  });
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
  if (!form.reportValidity()) return;
  setBusy(true);
  setMessage('Testing connections…');
  try {
    const response = await window.panelApp.testConnections(payload());
    setConnectionStatus('anthropic', response.anthropic);
    setConnectionStatus('composio', response.composio);
    const connected = response.anthropic.ok && response.composio.ok;
    setMessage(
      connected ? 'All connections are ready.' : 'One or more connections need attention.',
      connected ? 'success' : 'error',
    );
  } catch {
    setMessage('Connections could not be tested.', 'error');
  } finally {
    setBusy(false);
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  setBusy(true);
  setMessage('Saving encrypted settings…');
  try {
    const status = await window.panelApp.saveSettings(payload());
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
window.panelApp.onUpdateState((state) => renderUpdateState(state));
loadStatus();
