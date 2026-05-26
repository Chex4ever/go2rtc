const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('viewerSettings', {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (cfg) => ipcRenderer.invoke('settings:save', cfg),
});
