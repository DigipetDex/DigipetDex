const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  saveProjectData: (projectJson) => ipcRenderer.invoke('save-project-data', projectJson),
  deployToNetlify: () => ipcRenderer.invoke('deploy-to-netlify')
});
