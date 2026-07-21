const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('panelApp', {
  openSettings: () => ipcRenderer.invoke('panel:open-settings'),
  closeSettings: () => ipcRenderer.invoke('panel:close-settings'),
  getSettingsStatus: () => ipcRenderer.invoke('panel:get-settings-status'),
  saveSettings: (settings) => ipcRenderer.invoke('panel:save-settings', settings),
  testConnections: (settings) => ipcRenderer.invoke('panel:test-connections', settings),
});
