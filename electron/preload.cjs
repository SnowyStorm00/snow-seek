const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  search: (query) => ipcRenderer.invoke('search', query),
  launch: (filePath, type) => ipcRenderer.invoke('launch', { filePath, type }),
  getSystemStats: () => ipcRenderer.invoke('get-system-stats'),
  getQuickNotes: () => ipcRenderer.invoke('get-quick-notes'),
  saveQuickNotes: (content) => ipcRenderer.invoke('save-quick-notes', content),
  getFileIcon: (filePath) => ipcRenderer.invoke('get-file-icon', filePath),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  hideWindow: () => ipcRenderer.send('hide-window'),
  getIndexStatus: () => ipcRenderer.invoke('get-index-status'),
  onIndexStatus: (callback) => ipcRenderer.on('index-status', (event, status) => callback(status))
});
