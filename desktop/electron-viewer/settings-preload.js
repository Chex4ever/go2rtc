const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('viewerSettings', {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (cfg) => ipcRenderer.invoke('settings:save', cfg),
    pickLogo: () => ipcRenderer.invoke('settings:pick-logo'),
    exportBranding: (branding) => ipcRenderer.invoke('settings:export-branding', branding),
    exportBrandingKit: (branding) => ipcRenderer.invoke('settings:export-branding-kit', branding),
    checkUpdates: (serverUrl) => ipcRenderer.invoke('settings:check-updates', serverUrl),
});
