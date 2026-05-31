const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {app, dialog} = require('electron');
const core = require('./updater-core');
const cache = require('./updater-cache');
const notify = require('./update-notify');
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
    }
}

function canApplyUpdates() {
    return app.isPackaged && process.platform === 'win32';
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
    if (onProgress) {
        onProgress(5);
    }
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

async function applyDesktopPatchOneClick(info, localPath, source = 'user') {
    if (!canApplyUpdates()) {
        throw new Error('Patch update works only in the installed Windows application.');
    }
    if (cache.isInstallInProgress()) {
        throw new Error('An update is already installing. Please wait for the app to restart.');
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
    cache.recordInstallAttempt(
        {version: info.version, path: patchPath},
        source,
    );
    cache.writeInstallLock({version: info.version, kind: 'patch', path: patchPath});
    notify.emitUpdateEvent({
        kind: 'installing',
        version: info.version,
        message: 'Installing update — the app will restart…',
    });
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

async function applyDesktopUpdateOneClick(info, localPath, source = 'user') {
    if (!canApplyUpdates()) {
        throw new Error('One-click update works only in the installed Windows application.');
    }
    if (cache.isInstallInProgress()) {
        throw new Error('An update is already installing. Please wait for the app to restart.');
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
    cache.recordInstallAttempt(
        {version: info.version, path: installerPath},
        source,
    );
    cache.writeInstallLock({version: info.version, kind: 'full', path: installerPath});
    notify.emitUpdateEvent({
        kind: 'installing',
        version: info.version,
        message: 'Installing update — the app will restart…',
    });
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

async function applyDesktopUpdateSmart(info, localPath, source = 'user') {
    if (info.updateKind === 'patch' && info.patchUrl) {
        return applyDesktopPatchOneClick(info, localPath, source);
    }
    return applyDesktopUpdateOneClick(info, localPath, source);
}

async function installPendingUpdate(_parent, pending, info, source = 'user') {
    const updateInfo = info || {
        version: pending.version,
        updateKind: pending.updateKind || pending.kind,
        patchUrl: pending.patchUrl,
        downloadUrl: pending.downloadUrl,
        patchSha256: pending.sha256,
        sha256: pending.sha256,
    };
    try {
        await applyDesktopUpdateSmart(updateInfo, pending.path, source);
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
        notify.emitUpdateEvent({kind: 'error', message: e?.message || String(e)});
        throw e;
    }
}

async function downloadUpdateForVersion(result, opts = {}) {
    const version = result.remoteVersion;
    notify.emitUpdateEvent({
        kind: 'downloading',
        version,
        progress: 0,
        message: 'Downloading update…',
    });
    cache.logUpdate('download started (background)', {
        remoteVersion: version,
        updateKind: result.info.updateKind,
        auto: !!opts.auto,
    });

    try {
        await downloadUpdateArtifact(result.info, (pct) => {
            notify.emitUpdateEvent({kind: 'downloading', version, progress: pct});
        });
        notify.emitUpdateEvent({
            kind: 'ready',
            version,
            message: `Version ${version} is ready to install.`,
        });
        cache.logUpdate('download finished (background)', {version});
        return cache.readPendingUpdate();
    } catch (e) {
        notify.emitUpdateEvent({kind: 'error', message: e?.message || String(e)});
        throw e;
    }
}

/**
 * On startup: apply a previously downloaded update without prompting.
 * @returns {Promise<boolean>} true when the app is quitting to install
 */
async function trySilentStartupInstall() {
    if (!canApplyUpdates()) {
        return false;
    }
    initUpdaterCache();
    const currentVersion = app.getVersion();
    const pending = pendingReadyForInstall(currentVersion);
    if (!pending) {
        return false;
    }

    const gate = cache.shouldRunStartupInstall(pending, currentVersion);
    if (!gate.ok) {
        if (gate.reason === 'max_attempts') {
            cache.abandonPendingInstall('max_startup_attempts', {
                version: pending.version,
                currentVersion,
                log: cache.updateLogFile(),
            });
            notify.emitUpdateEvent({
                kind: 'error',
                message:
                    `Automatic install of version ${pending.version} did not complete. ` +
                    `Use Restart to install from the menu, or run the Setup manually. Log: ${cache.updateLogFile()}`,
            });
        } else {
            cache.logUpdate('startup silent install skipped', {
                reason: gate.reason,
                version: pending.version,
                currentVersion,
            });
        }
        return false;
    }

    cache.logUpdate('startup silent install', pending);
    try {
        await installPendingUpdate(null, pending, null, 'startup');
        return true;
    } catch (e) {
        cache.clearInstallLock();
        cache.logUpdate('startup silent install failed', {error: String(e?.message || e), pending});
        cache.writeInstallState({
            ...(cache.readInstallState() || {}),
            version: pending.version,
            lastError: String(e?.message || e),
            lastAttemptAt: new Date().toISOString(),
        });
        return false;
    }
}

function finalizeSuccessfulLaunch(installedVersion) {
    initUpdaterCache();
    return cache.finalizeSuccessfulLaunch(installedVersion || app.getVersion());
}

function getUpdateDiagnostics() {
    initUpdaterCache();
    const appLog = require('./app-log');
    return {
        update_log: cache.updateLogFile(),
        app_log: appLog.appLogFile(),
        pending_update: cache.pendingUpdateFile(),
        install_state: cache.installStateFile(),
        updates_dir: cache.updatesDir(),
    };
}

/**
 * Background update check after the wall is open.
 * @param {{serverUrl: string, autoDownloadUpdates?: boolean}} opts
 */
async function runBackgroundUpdateCheck(opts) {
    initUpdaterCache();
    const currentVersion = app.getVersion();
    cache.logUpdate('background update check', {currentVersion});

    const result = await checkForUpdates({...opts, silent: true});
    if (result.status === 'viewer_only') {
        return result;
    }
    if (result.status === 'current' || result.status === 'unavailable') {
        notify.patchUpdateState({status: 'idle'});
        return result;
    }
    if (result.status !== 'available') {
        return result;
    }

    const pending = pendingReadyForInstall(currentVersion, result.info);
    if (pending && pending.version === result.remoteVersion) {
        notify.emitUpdateEvent({
            kind: 'ready',
            version: pending.version,
            message: `Version ${pending.version} is ready to install.`,
        });
        return {...result, status: 'ready', pending};
    }

    const autoDownload = opts.autoDownloadUpdates !== false;
    if (autoDownload) {
        await downloadUpdateForVersion(result, {auto: true});
        return {...result, status: 'ready'};
    }

    notify.emitUpdateEvent({
        kind: 'available',
        version: result.remoteVersion,
        message: `Version ${result.remoteVersion} is available.`,
    });
    return result;
}

/**
 * Menu / settings: check, optionally download, surface in-app notifications.
 */
async function runManualDesktopUpdateCheck(opts) {
    initUpdaterCache();
    const currentVersion = app.getVersion();
    const result = await checkForUpdates(opts);

    if (result.status === 'unavailable') {
        notify.emitUpdateEvent({
            kind: 'error',
            message: result.message || 'No desktop update published on this server.',
        });
        return result;
    }
    if (result.status === 'current') {
        notify.emitUpdateEvent({
            kind: 'installed',
            title: 'Up to date',
            message: `Camera Wall ${currentVersion} is the latest version offered by your server.`,
        });
        return result;
    }
    if (result.status === 'viewer_only') {
        notify.emitUpdateEvent({
            kind: 'installed',
            title: 'Viewer updated on server',
            message: 'Press Ctrl+R to reload the camera wall. No desktop download is required.',
        });
        return result;
    }

    const pending = pendingReadyForInstall(currentVersion, result.info);
    if (pending && pending.version === result.remoteVersion) {
        notify.emitUpdateEvent({
            kind: 'ready',
            version: pending.version,
            message: `Version ${pending.version} is ready to install.`,
        });
        return {...result, status: 'ready', pending};
    }

    if (!canApplyUpdates()) {
        notify.emitUpdateEvent({
            kind: 'available',
            version: result.remoteVersion,
            message: 'Updates apply automatically only in the installed Windows build.',
        });
        return result;
    }

    await downloadUpdateForVersion(result, {auto: false});
    return {...result, status: 'ready'};
}

/** @deprecated use runManualDesktopUpdateCheck */
async function runUpdateFlow(parent, opts) {
    return runManualDesktopUpdateCheck(opts);
}

/** @deprecated use runBackgroundUpdateCheck + trySilentStartupInstall */
async function runStartupUpdateCheck(parent, opts) {
    return runBackgroundUpdateCheck(opts);
}

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

async function runAllUpdateFlows(parent, opts) {
    initUpdaterCache();
    const desktop = await runManualDesktopUpdateCheck(opts);
    await runGo2rtcUpdateFlow(parent, {...opts, silent: true});
    return {desktop};
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
    trySilentStartupInstall,
    finalizeSuccessfulLaunch,
    getUpdateDiagnostics,
    runBackgroundUpdateCheck,
    runManualDesktopUpdateCheck,
    runUpdateFlow,
    runStartupUpdateCheck,
    runGo2rtcUpdateFlow,
    runAllUpdateFlows,
    fetchUpdateInfo,
    fetchGo2rtcUpdateInfo,
    setRequestAppQuit,
    updateLogFile: () => cache.updateLogFile(),
};
