const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {app, dialog, Notification} = require('electron');
const core = require('./updater-core');
const cache = require('./updater-cache');
const {launchSilentInstallerAndRelaunch, resolveInstallDir} = require('./installer-launch');
const {launchPatchApplyAndRelaunch} = require('./patch-apply');

/** Set by main.js — allows app.quit() during one-click update. */
let requestAppQuit = () => app.quit();

function setRequestAppQuit(fn) {
    requestAppQuit = typeof fn === 'function' ? fn : requestAppQuit;
}

function initUpdaterCache() {
    if (app?.isReady?.()) {
        cache.setUserDataPath(() => app.getPath('userData'));
        cache.cleanupAfterSuccessfulUpdate(app.getVersion());
    }
}

function showUpdateNotification(title, body) {
    cache.logUpdate(`notify: ${title}`, {body});
    if (Notification.isSupported()) {
        try {
            new Notification({title, body}).show();
        } catch {
            /* ignore */
        }
    }
}

async function showUpdateDialog(parent, opts) {
    if (opts.silent) {
        return opts.cancelId ?? 1;
    }
    const choice = await dialog.showMessageBox(parent || undefined, opts);
    return choice.response;
}

/**
 * @param {{serverUrl: string, currentVersion?: string, platform?: string}} opts
 */
async function fetchUpdateInfo(opts) {
    const serverUrl = opts.serverUrl;
    const platform = opts.platform || process.platform;
    const currentVersion = opts.currentVersion || app.getVersion();
    const serverBase = require('./config-core').normalizeServerUrl(serverUrl);

    for (const url of core.updateCheckUrls(serverUrl, currentVersion)) {
        try {
            const res = await fetch(url, {redirect: 'follow'});
            if (!res.ok) {
                continue;
            }
            const data = await res.json();
            const info = core.normalizeUpdateInfo(data, serverBase, platform);
            if (info) {
                return {info, source: url};
            }
        } catch (err) {
            cache.logUpdate('update check failed', {url, error: String(err?.message || err)});
        }
    }
    return {info: null, source: null, serverBase};
}

/**
 * @param {{serverUrl: string, currentVersion?: string, silent?: boolean}} opts
 */
async function checkForUpdates(opts) {
    initUpdaterCache();
    const currentVersion = opts.currentVersion || app.getVersion();
    const {info, source} = await fetchUpdateInfo(opts);
    if (!info) {
        return {
            status: 'unavailable',
            currentVersion,
            message: 'No desktop update published on this go2rtc server.',
        };
    }
    if (info.updateKind === 'none' && core.isNewerVersion(info.version, currentVersion)) {
        return {
            status: 'viewer_only',
            currentVersion,
            remoteVersion: info.version,
            info,
            source,
        };
    }
    if (!core.isNewerVersion(info.version, currentVersion)) {
        return {
            status: 'current',
            currentVersion,
            remoteVersion: info.version,
            info,
            source,
        };
    }
    return {
        status: 'available',
        currentVersion,
        remoteVersion: info.version,
        info,
        source,
    };
}

function fileNameFromUrl(downloadUrl) {
    try {
        const name = path.basename(new URL(downloadUrl).pathname);
        if (name && name !== '/') {
            return name;
        }
    } catch {
        /* ignore */
    }
    return 'go2rtc-viewer-update.exe';
}

/**
 * @param {{downloadUrl: string, sha256?: string}} info
 * @param {(pct: number) => void} [onProgress]
 */
async function downloadInstaller(info, onProgress) {
    initUpdaterCache();
    const currentVersion = app.getVersion();
    const existing = cache.resolveLocalArtifact(info, currentVersion);
    if (existing?.path) {
        cache.logUpdate('reusing cached installer', {path: existing.path, pending: existing.pending});
        cache.rememberPendingUpdate(info, existing.path);
        if (onProgress) {
            onProgress(100);
        }
        return existing.path;
    }

    const res = await fetch(info.downloadUrl, {redirect: 'follow'});
    if (!res.ok) {
        throw new Error(`Download failed (${res.status})`);
    }
    const dest = cache.artifactPath(
        info.version || 'unknown',
        info.updateKind === 'patch' && info.patchUrl ? 'patch' : 'full',
        info.downloadUrl,
    );
    cache.logUpdate('download started', {url: info.downloadUrl, dest});
    const buf = Buffer.from(await res.arrayBuffer());
    if (onProgress) {
        onProgress(100);
    }

    const hash = info.sha256 ? crypto.createHash('sha256') : null;
    if (hash) {
        hash.update(buf);
    }
    fs.writeFileSync(dest, buf);

    if (hash && info.sha256) {
        const got = hash.digest('hex').toLowerCase();
        const want = String(info.sha256).toLowerCase();
        if (got !== want) {
            fs.unlinkSync(dest);
            throw new Error('Download checksum mismatch');
        }
    }

    cache.rememberPendingUpdate(info, dest);
    cache.cleanupOldUpdates(info.version);
    cache.logUpdate('download finished', {path: dest, bytes: buf.length});
    return dest;
}

/**
 * @param {{patchUrl: string, sha256?: string, patchSha256?: string}} info
 */
async function downloadPatch(info) {
    const sha = info.patchSha256 || info.sha256;
    return downloadInstaller({
        ...info,
        downloadUrl: info.patchUrl,
        sha256: sha,
        updateKind: 'patch',
    });
}

async function downloadUpdateArtifact(info, onProgress) {
    if (info.updateKind === 'patch' && info.patchUrl) {
        return downloadPatch(info);
    }
    return downloadInstaller(info, onProgress);
}

function pendingReadyForInstall(currentVersion, info) {
    initUpdaterCache();
    const local = info ? cache.resolveLocalArtifact(info, currentVersion) : null;
    if (local?.path) {
        if (info) {
            cache.rememberPendingUpdate(info, local.path);
        }
        const pending = cache.readPendingUpdate();
        if (pending?.path && fs.existsSync(pending.path)) {
            return pending;
        }
        return {version: local.version, path: local.path};
    }

    const pending = cache.readPendingUpdate();
    if (!pending?.path || !pending.version) {
        return null;
    }
    if (!fs.existsSync(pending.path)) {
        cache.logUpdate('pending update missing file', pending);
        cache.clearPendingUpdate();
        return null;
    }
    if (!core.isNewerVersion(pending.version, currentVersion)) {
        cache.cleanupAfterSuccessfulUpdate(currentVersion);
        return null;
    }
    if (pending.sha256 && !cache.verifyArtifact(pending.path, pending.sha256)) {
        cache.logUpdate('pending update checksum mismatch — keeping file for retry', pending);
        return pending;
    }
    return pending;
}

/**
 * Download patch zip and apply changed shell files in-place, then quit app.
 * @param {{version: string, patchUrl: string, patchSha256?: string}} info
 */
async function applyDesktopPatchOneClick(info, localPath) {
    if (!app.isPackaged) {
        throw new Error('Patch update works only in the installed application (not npm start).');
    }
    if (process.platform !== 'win32') {
        throw new Error('Automatic patch apply is supported on Windows only.');
    }
    const patchPath = localPath;
    if (!patchPath || !fs.existsSync(patchPath)) {
        throw new Error('Patch file missing');
    }

    const installDir = resolveInstallDir();
    if (!installDir) {
        throw new Error('Could not detect install folder');
    }

    cache.logUpdate('starting patch apply', {patchPath, installDir});
    const {helperPid, logPath} = await launchPatchApplyAndRelaunch(
        patchPath,
        process.execPath,
        installDir,
    );
    cache.logUpdate('patch helper started', {helperPid, logPath});
    app.quittingForUpdate = true;
    requestAppQuit();
    return {patchPath, installDir, logPath, helperPid};
}

/**
 * Download installer and run NSIS silent upgrade in-place, then quit app.
 * @param {{version: string, downloadUrl: string, sha256?: string}} info
 */
async function applyDesktopUpdateOneClick(info, localPath) {
    if (!app.isPackaged) {
        throw new Error('One-click update works only in the installed application (not npm start).');
    }
    if (process.platform !== 'win32') {
        throw new Error('Automatic install is supported on Windows only.');
    }

    const installerPath = localPath;
    if (!installerPath || !fs.existsSync(installerPath)) {
        throw new Error('Installer file missing');
    }
    const installDir = resolveInstallDir();
    if (!installDir) {
        throw new Error('Could not detect install folder');
    }

    cache.logUpdate('starting full installer apply', {installerPath, installDir});
    const {helperPid, logPath} = await launchSilentInstallerAndRelaunch(
        installerPath,
        process.execPath,
        installDir,
    );
    cache.logUpdate('installer helper started', {helperPid, logPath});
    app.quittingForUpdate = true;
    requestAppQuit();
    return {installerPath, installDir, logPath, helperPid};
}

async function applyDesktopUpdateSmart(info, localPath) {
    if (info.updateKind === 'patch' && info.patchUrl) {
        return applyDesktopPatchOneClick(info, localPath);
    }
    return applyDesktopUpdateOneClick(info, localPath);
}

async function promptInstallReady(parent, pending, opts = {}) {
    const detail = [
        `Version ${pending.version} has been downloaded and is ready to install.`,
        '',
        'The app will close briefly while files are replaced, then restart automatically.',
        '',
        `Update log: ${cache.updateLogFile()}`,
    ].join('\n');

    showUpdateNotification('Camera Wall update ready', `Version ${pending.version} is ready to install.`);

    const response = await showUpdateDialog(parent, {
        type: 'info',
        title: 'Update ready',
        message: `Install Camera Wall ${pending.version}?`,
        detail,
        buttons: ['Install now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        silent: opts.silent,
    });
    return response === 0;
}

async function downloadUpdateWithNotice(parent, result, opts = {}) {
    const isPatch = result.info.updateKind === 'patch' && !!result.info.patchUrl;
    showUpdateNotification(
        'Downloading Camera Wall update',
        `Downloading version ${result.remoteVersion}…`,
    );
    if (!opts.silent) {
        await dialog.showMessageBox(parent || undefined, {
            type: 'info',
            title: 'Downloading update',
            message: `Downloading version ${result.remoteVersion}…`,
            detail: isPatch
                ? 'Small update package is downloading in the background.'
                : 'Full installer is downloading. You can keep using the camera wall.',
        });
    }

    cache.logUpdate('user accepted download', {
        remoteVersion: result.remoteVersion,
        updateKind: result.info.updateKind,
    });

    const localPath = await downloadUpdateArtifact(result.info);
    showUpdateNotification(
        'Camera Wall update downloaded',
        `Version ${result.remoteVersion} is ready to install.`,
    );
    return localPath;
}

async function installPendingUpdate(parent, pending, info) {
    const updateInfo = info || {
        version: pending.version,
        updateKind: pending.updateKind || pending.kind,
        patchUrl: pending.patchUrl,
        downloadUrl: pending.downloadUrl,
        patchSha256: pending.sha256,
        sha256: pending.sha256,
    };
    try {
        await applyDesktopUpdateSmart(updateInfo, pending.path);
        return {status: 'installing'};
    } catch (e) {
        cache.logUpdate('install failed', {error: String(e?.message || e), pending});
        if ((updateInfo.updateKind === 'patch' || pending.kind === 'patch') && updateInfo.downloadUrl) {
            try {
                const fullPath = await downloadInstaller({
                    version: pending.version,
                    downloadUrl: updateInfo.downloadUrl,
                    sha256: updateInfo.sha256,
                });
                await applyDesktopUpdateOneClick(
                    {version: pending.version, downloadUrl: updateInfo.downloadUrl, sha256: updateInfo.sha256},
                    fullPath,
                );
                return {status: 'installing', fallback: 'full'};
            } catch (fallbackErr) {
                e = fallbackErr;
            }
        }
        throw e;
    }
}

/**
 * @param {import('electron').BrowserWindow | null} parent
 * @param {{serverUrl: string, silent?: boolean}} opts
 */
async function runUpdateFlow(parent, opts) {
    initUpdaterCache();
    const result = await checkForUpdates(opts);

    if (result.status === 'unavailable') {
        if (!opts.silent) {
            await dialog.showMessageBox(parent || undefined, {
                type: 'info',
                title: 'Check for updates',
                message: result.message,
                detail:
                    'Ask your administrator to publish an installer on the go2rtc server ' +
                    '(viewer.desktop in go2rtc.yaml or viewer/desktop/update.json).',
            });
        }
        return result;
    }

    if (result.status === 'current') {
        if (!opts.silent) {
            await dialog.showMessageBox(parent || undefined, {
                type: 'info',
                title: 'Check for updates',
                message: `You have the latest version (${result.currentVersion}).`,
                detail: `Update log: ${cache.updateLogFile()}`,
            });
        }
        return result;
    }

    if (result.status === 'viewer_only') {
        if (!opts.silent) {
            await dialog.showMessageBox(parent || undefined, {
                type: 'info',
                title: 'Viewer updated on server',
                message: 'The camera wall web UI was updated on the go2rtc server.',
                detail: 'Press Ctrl+R to reload. No desktop download is required.',
            });
        }
        return result;
    }

    const pending = pendingReadyForInstall(result.currentVersion, result.info);
    if (pending && pending.version === result.remoteVersion) {
        const install = await promptInstallReady(parent, pending, opts);
        if (!install) {
            return {...result, status: 'ready', pending};
        }
        try {
            await installPendingUpdate(parent, pending, result.info);
            return {...result, status: 'installing', pending};
        } catch (e) {
            await dialog.showMessageBox(parent || undefined, {
                type: 'error',
                title: 'Update failed',
                message: e?.message || String(e),
                detail: [
                    'The installer could not run. Check the update log for details.',
                    '',
                    `Log: ${cache.updateLogFile()}`,
                    `Helper log: ${path.join(require('os').tmpdir(), `go2rtc-viewer-update-${process.pid}.log`)}`,
                ].join('\n'),
            });
            return {...result, error: e, pending};
        }
    }

    const isPatch = result.info.updateKind === 'patch' && !!result.info.patchUrl;
    const detail = [
        result.info.notes || '',
        '',
        `Installed: ${result.currentVersion}`,
        `Available: ${result.remoteVersion}`,
        '',
        isPatch
            ? 'Small update: download changed shell files only, then restart the app.'
            : 'Full update: download installer, replace files, and restart the app (Windows installed build).',
        '',
        `Update log: ${cache.updateLogFile()}`,
    ]
        .filter(Boolean)
        .join('\n');

    const canOneClick = app.isPackaged && process.platform === 'win32';
    const response = await showUpdateDialog(parent, {
        type: 'info',
        title: 'Update available',
        message: isPatch
            ? `Small update ${result.remoteVersion} is available`
            : `Version ${result.remoteVersion} is available`,
        detail,
        buttons: canOneClick ? ['Download update', 'Later'] : ['OK'],
        defaultId: 0,
        cancelId: canOneClick ? 1 : 0,
        silent: opts.silent,
    });

    if (!canOneClick || response !== 0) {
        return result;
    }

    try {
        const localPath = await downloadUpdateWithNotice(parent, result, opts);
        const readyPending = cache.readPendingUpdate();
        const install = await promptInstallReady(
            parent,
            readyPending || {version: result.remoteVersion, path: localPath},
            opts,
        );
        if (!install) {
            return {...result, status: 'ready', localPath, pending: readyPending};
        }
        await installPendingUpdate(
            parent,
            readyPending || {version: result.remoteVersion, path: localPath},
            result.info,
        );
        return {...result, status: 'installing', localPath};
    } catch (e) {
        cache.logUpdate('download/install failed', {error: String(e?.message || e)});
        await dialog.showMessageBox(parent || undefined, {
            type: 'error',
            title: 'Update failed',
            message: e?.message || String(e),
            detail: `See log: ${cache.updateLogFile()}`,
        });
        return {...result, error: e};
    }
}

async function runStartupUpdateCheck(parent, opts) {
    initUpdaterCache();
    const currentVersion = app.getVersion();
    cache.logUpdate('startup update check', {currentVersion});

    const pending = pendingReadyForInstall(currentVersion);
    if (pending) {
        cache.logUpdate('found cached pending update', pending);
        const install = await promptInstallReady(parent, pending, {silent: false});
        if (install) {
            try {
                await installPendingUpdate(parent, pending);
                return {status: 'installing', pending};
            } catch (e) {
                cache.logUpdate('startup install failed', {error: String(e?.message || e)});
                await dialog.showMessageBox(parent || undefined, {
                    type: 'error',
                    title: 'Update failed',
                    message: e?.message || String(e),
                    detail: `See log: ${cache.updateLogFile()}`,
                });
                return {status: 'error', error: e, pending};
            }
        }
        return {status: 'ready', pending};
    }

    const result = await checkForUpdates({...opts, silent: true});
    if (result.status === 'viewer_only') {
        return result;
    }
    if (result.status !== 'available') {
        return result;
    }

    const cached = cache.resolveLocalArtifact(result.info, currentVersion);
    if (cached?.path) {
        cache.rememberPendingUpdate(result.info, cached.path);
        const ready = cache.readPendingUpdate();
        const install = await promptInstallReady(parent, ready, {silent: false});
        if (install) {
            try {
                await installPendingUpdate(parent, ready, result.info);
                return {status: 'installing', pending: ready};
            } catch (e) {
                cache.logUpdate('startup cached install failed', {error: String(e?.message || e)});
            }
        }
        return {...result, status: 'ready', pending: ready};
    }

    const response = await showUpdateDialog(parent, {
        type: 'info',
        title: 'Update available',
        message: `Camera Wall ${result.remoteVersion} is available`,
        detail: [
            `Installed: ${result.currentVersion}`,
            'Download now and install when ready.',
            '',
            `Update log: ${cache.updateLogFile()}`,
        ].join('\n'),
        buttons: ['Download update', 'Later'],
        defaultId: 0,
        cancelId: 1,
        silent: false,
    });
    if (response !== 0) {
        return result;
    }

    try {
        const localPath = await downloadUpdateWithNotice(parent, result, {silent: false});
        const readyPending = cache.readPendingUpdate();
        const install = await promptInstallReady(
            parent,
            readyPending || {version: result.remoteVersion, path: localPath},
            {silent: false},
        );
        if (install) {
            await installPendingUpdate(
                parent,
                readyPending || {version: result.remoteVersion, path: localPath},
                result.info,
            );
            return {...result, status: 'installing', localPath};
        }
        return {...result, status: 'ready', localPath, pending: readyPending};
    } catch (e) {
        cache.logUpdate('startup download failed', {error: String(e?.message || e)});
        return {...result, error: e};
    }
}

/**
 * @param {{serverUrl: string}} opts
 */
async function fetchGo2rtcUpdateInfo(opts) {
    const serverBase = require('./config-core').normalizeServerUrl(opts.serverUrl);
    const platform = process.platform;

    for (const url of core.go2rtcUpdateUrls(opts.serverUrl)) {
        try {
            const res = await fetch(url, {redirect: 'follow'});
            if (!res.ok) {
                continue;
            }
            const data = await res.json();
            const info = core.normalizeGo2rtcUpdateInfo(data, serverBase, platform);
            if (info) {
                return {info, source: url};
            }
        } catch {
            /* try next */
        }
    }
    return {info: null, source: null};
}

async function checkGo2rtcUpdates(opts) {
    const {info, source} = await fetchGo2rtcUpdateInfo(opts);
    if (!info) {
        return {
            status: 'unavailable',
            message: 'No go2rtc update source on this server (configure viewer.go2rtc.github in go2rtc.yaml).',
        };
    }
    const running = info.runningVersion || 'unknown';
    if (!core.isNewerVersion(info.version, running)) {
        return {
            status: 'current',
            runningVersion: running,
            remoteVersion: info.version,
            info,
            source,
        };
    }
    return {
        status: 'available',
        runningVersion: running,
        remoteVersion: info.version,
        info,
        source,
    };
}

/**
 * @param {import('electron').BrowserWindow | null} parent
 * @param {{serverUrl: string, silent?: boolean}} opts
 */
async function runGo2rtcUpdateFlow(parent, opts) {
    const result = await checkGo2rtcUpdates(opts);

    if (result.status === 'unavailable') {
        if (!opts.silent) {
            await dialog.showMessageBox(parent || undefined, {
                type: 'info',
                title: 'go2rtc update',
                message: result.message,
            });
        }
        return result;
    }

    if (result.status === 'current') {
        if (!opts.silent) {
            await dialog.showMessageBox(parent || undefined, {
                type: 'info',
                title: 'go2rtc update',
                message: `Server is up to date (running ${result.runningVersion}, latest ${result.remoteVersion}).`,
            });
        }
        return result;
    }

    const detail = [
        result.info.notes || '',
        '',
        `Running on server: ${result.runningVersion}`,
        `Latest release: ${result.remoteVersion}`,
        result.info.source === 'github' ? 'Download from GitHub (via go2rtc API).' : 'Download from this go2rtc server.',
        '',
        'Stop the go2rtc service, replace go2rtc.exe, restart the service. Config files are kept.',
    ]
        .filter(Boolean)
        .join('\n');

    const choice = await dialog.showMessageBox(parent || undefined, {
        type: 'info',
        title: 'go2rtc update available',
        message: `Version ${result.remoteVersion} is available`,
        detail,
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
    });

    if (choice.response !== 0) {
        return result;
    }

    try {
        const dest = await downloadInstaller({
            ...result.info,
            downloadUrl: result.info.downloadUrl,
        });
        await dialog.showMessageBox(parent || undefined, {
            type: 'info',
            title: 'go2rtc downloaded',
            message: 'Replace the running go2rtc.exe with this file, then restart the service.',
            detail: dest,
        });
        const {shell} = require('electron');
        await shell.openPath(dest);
        if (result.info.releaseUrl) {
            await shell.openExternal(result.info.releaseUrl);
        }
        return {...result, installerPath: dest};
    } catch (e) {
        await dialog.showMessageBox(parent || undefined, {
            type: 'error',
            title: 'Download failed',
            message: e?.message || String(e),
        });
        return {...result, error: e};
    }
}

/**
 * Check desktop app then go2rtc server updates (non-silent shows dialogs in sequence).
 */
async function runAllUpdateFlows(parent, opts) {
    initUpdaterCache();
    const desktop = await runUpdateFlow(parent, opts);
    const go2rtc = await runGo2rtcUpdateFlow(parent, {...opts, silent: true});

    if (opts.silent) {
        return {desktop, go2rtc};
    }

    if (desktop.status !== 'current' && desktop.status !== 'unavailable') {
        return {desktop, go2rtc};
    }

    const lines = [];
    if (go2rtc.status === 'available') {
        lines.push(`go2rtc server: ${go2rtc.remoteVersion} available (running ${go2rtc.runningVersion}).`);
    } else if (go2rtc.status === 'current') {
        lines.push(`go2rtc server: up to date (${go2rtc.runningVersion}).`);
    } else {
        lines.push(`go2rtc server: ${go2rtc.message || go2rtc.status}.`);
    }
    lines.push('', `Update log: ${cache.updateLogFile()}`);

    if (go2rtc.status === 'available') {
        const choice = await dialog.showMessageBox(parent || undefined, {
            type: 'info',
            title: 'Check for updates',
            message: 'go2rtc update available',
            detail: lines.join('\n'),
            buttons: ['Update go2rtc', 'Close'],
            defaultId: 0,
            cancelId: 1,
        });
        if (choice.response === 0) {
            await runGo2rtcUpdateFlow(parent, opts);
        }
    } else {
        await dialog.showMessageBox(parent || undefined, {
            type: 'info',
            title: 'Check for updates',
            message: lines[0],
            detail: lines.slice(1).join('\n'),
        });
    }

    return {desktop, go2rtc};
}

module.exports = {
    initUpdaterCache,
    checkForUpdates,
    checkGo2rtcUpdates,
    downloadInstaller,
    downloadPatch,
    downloadUpdateArtifact,
    pendingReadyForInstall,
    applyDesktopPatchOneClick,
    applyDesktopUpdateOneClick,
    applyDesktopUpdateSmart,
    installPendingUpdate,
    runUpdateFlow,
    runStartupUpdateCheck,
    runGo2rtcUpdateFlow,
    runAllUpdateFlows,
    fetchUpdateInfo,
    fetchGo2rtcUpdateInfo,
    setRequestAppQuit,
    updateLogFile: () => cache.updateLogFile(),
};
