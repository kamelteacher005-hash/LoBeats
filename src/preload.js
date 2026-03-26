const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('minimize-window'),
    close: () => ipcRenderer.send('close-window'),
    onTogglePlay: (callback) => ipcRenderer.on('toggle-play', () => callback()),
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_, data) => callback(data)),
    getAppPath: () => ipcRenderer.invoke('get-app-path'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
    setAlwaysOnTop: (enabled) => ipcRenderer.invoke('set-always-on-top', enabled),
    exportLibraryData: (payload) => ipcRenderer.invoke('export-library-data', payload),
    importLibraryData: () => ipcRenderer.invoke('import-library-data'),
    checkStreamHealth: (streamList) => ipcRenderer.invoke('check-stream-health', streamList)
});
