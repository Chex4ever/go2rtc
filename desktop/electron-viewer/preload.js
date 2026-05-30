const {contextBridge, ipcRenderer} = require('electron');

/** Preload for the camera wall window — IPC for load-error page (data: URLs block inline handlers). */
contextBridge.exposeInMainWorld('go2rtcDesktop', {
    retryViewerLoad: () => ipcRenderer.invoke('viewer:retry-load'),
    openServerExternal: () => ipcRenderer.invoke('viewer:open-server'),
    getClientInfo: () => ipcRenderer.invoke('viewer:client-info'),
});
