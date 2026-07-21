const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('panelApp', {
  openSettings: () => ipcRenderer.invoke('panel:open-settings'),
  closeSettings: () => ipcRenderer.invoke('panel:close-settings'),
  getSettingsStatus: () => ipcRenderer.invoke('panel:get-settings-status'),
  saveSettings: (settings) => ipcRenderer.invoke('panel:save-settings', settings),
  testConnections: (settings) => ipcRenderer.invoke('panel:test-connections', settings),
  getUpdateState: () => ipcRenderer.invoke('panel:get-update-state'),
  checkForUpdates: () => ipcRenderer.invoke('panel:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('panel:download-update'),
  installUpdate: () => ipcRenderer.invoke('panel:install-update'),
  setUpdateChannel: (channel) => ipcRenderer.invoke('panel:set-update-channel', channel),
  confirmUiPatch: (patchId) => ipcRenderer.invoke('panel:confirm-ui-patch', patchId),
  reportUiPatchFailure: (patchId) => ipcRenderer.invoke('panel:report-ui-patch-failure', patchId),
  onUpdateState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('panel:update-state', handler);
    return () => ipcRenderer.removeListener('panel:update-state', handler);
  },
});
