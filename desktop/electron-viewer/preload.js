const {contextBridge, ipcRenderer} = require('electron');

/** Preload for the camera wall window — IPC for load-error page (data: URLs block inline handlers). */
contextBridge.exposeInMainWorld('go2rtcDesktop', {
    retryViewerLoad: () => ipcRenderer.invoke('viewer:retry-load'),
    openServerExternal: () => ipcRenderer.invoke('viewer:open-server'),
    openSettings: () => ipcRenderer.invoke('viewer:open-settings'),
    getClientInfo: () => ipcRenderer.invoke('viewer:client-info'),
    onUpdateNotice: (callback) => {
        if (typeof callback !== 'function') {
            return;
        }
        ipcRenderer.on('viewer:update-notice', (_event, message) => callback(message));
    },
    onUpdateEvent: (callback) => {
        if (typeof callback !== 'function') {
            return;
        }
        ipcRenderer.on('desktop:update-event', (_event, payload) => callback(payload));
    },
    getUpdateState: () => ipcRenderer.invoke('desktop:update-state'),
    installPendingUpdate: () => ipcRenderer.invoke('desktop:install-pending-update'),
    runPendingInstallerManual: () => ipcRenderer.invoke('desktop:run-pending-installer-manual'),
    showPendingInstaller: () => ipcRenderer.invoke('desktop:show-pending-installer'),
    dismissUpdateReady: () => ipcRenderer.invoke('desktop:dismiss-update-ready'),
});
