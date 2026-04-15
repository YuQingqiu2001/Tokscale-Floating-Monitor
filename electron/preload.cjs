const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('tokenMonitor', {
  getLatest: () => ipcRenderer.invoke('metrics:get-latest'),
  refreshNow: () => ipcRenderer.invoke('metrics:refresh'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setRefreshInterval: (seconds) => ipcRenderer.invoke('settings:set-refresh-interval', seconds),
  getPanel: (tab) => ipcRenderer.invoke('panel:get', tab),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  onUpdate: (callback) => {
    if (typeof callback !== 'function') {
      return () => {}
    }

    const wrapped = (_event, payload) => {
      callback(payload)
    }

    ipcRenderer.on('metrics:update', wrapped)
    return () => {
      ipcRenderer.removeListener('metrics:update', wrapped)
    }
  },
})
