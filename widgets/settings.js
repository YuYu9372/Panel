const settingsWidget = {
  init() {
    const button = document.getElementById('settings-button');
    if (!button) return;
    button.addEventListener('click', async () => {
      if (!window.panelApp) return;
      button.disabled = true;
      try {
        await window.panelApp.openSettings();
      } finally {
        button.disabled = false;
      }
    });
  },
};
