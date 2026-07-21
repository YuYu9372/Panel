const fields = {
  anthropicApiKey: document.getElementById('anthropic-api-key'),
  composioMcpToken: document.getElementById('composio-mcp-token'),
};

const form = document.getElementById('connections-form');
const refreshMinutes = document.getElementById('refresh-minutes');
const formMessage = document.getElementById('form-message');
const testButton = document.getElementById('test-button');
const saveButton = document.getElementById('save-button');

function applyTheme() {
  const hour = new Date().getHours();
  document.documentElement.dataset.theme = hour >= 18 || hour < 5 ? 'dark' : 'light';
}

function setBusy(busy) {
  testButton.disabled = busy;
  saveButton.disabled = busy;
  document.getElementById('back-button').disabled = busy;
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
}

async function loadStatus() {
  try {
    applyStatus(await window.panelApp.getSettingsStatus());
  } catch {
    setMessage('Settings could not be loaded.', 'error');
  }
}

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
loadStatus();
