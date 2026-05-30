const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {app, dialog} = require('electron');
const core = require('./updater-core');
const {launchSilentInstallerAndRelaunch, resolveInstallDir} = require('./installer-launch');
const {launchPatchApplyAndRelaunch} = require('./patch-apply');

/** Set by main.js — allows app.quit() during one-click update. */
let requestAppQuit = () => app.quit();

function setRequestAppQuit(fn) {
    requestAppQuit = typeof fn === 'function' ? fn : requestAppQuit;
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
        } catch {
            /* try next */
        }
    }
    return {info: null, source: null, serverBase};
}

/**
 * @param {{serverUrl: string, currentVersion?: string, silent?: boolean}} opts
 */
async function checkForUpdates(opts) {
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
    const res = await fetch(info.downloadUrl, {redirect: 'follow'});
    if (!res.ok) {
        throw new Error(`Download failed (${res.status})`);
    }
    const dest = path.join(app.getPath('temp'), fileNameFromUrl(info.downloadUrl));
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

    return dest;
}

/**
 * @param {{patchUrl: string, sha256?: string, patchSha256?: string}} info
 */
async function downloadPatch(info) {
    const sha = info.patchSha256 || info.sha256;
    return downloadInstaller({downloadUrl: info.patchUrl, sha256: sha});
}

/**
 * Download patch zip and apply changed shell files in-place, then quit app.
 * @param {{version: string, patchUrl: string, patchSha256?: string}} info
 */
async function applyDesktopPatchOneClick(info) {
    if (!app.isPackaged) {
        throw new Error('Patch update works only in the installed application (not npm start).');
    }
    if (process.platform !== 'win32') {
        throw new Error('Automatic patch apply is supported on Windows only.');
    }
    if (!info.patchUrl) {
        throw new Error('Patch URL missing');
    }

    const downloaded = await downloadPatch(info);
    const installDir = resolveInstallDir();
    if (!installDir) {
        throw new Error('Could not detect install folder');
    }

    const {helperPid, logPath} = await launchPatchApplyAndRelaunch(
        downloaded,
        process.execPath,
        installDir,
    );
    app.quittingForUpdate = true;
    requestAppQuit();
    return {patchPath: downloaded, installDir, logPath, helperPid};
}

/**
 * Download installer and run NSIS silent upgrade in-place, then quit app.
 * @param {{version: string, downloadUrl: string, sha256?: string}} info
 */
async function applyDesktopUpdateOneClick(info) {
    if (!app.isPackaged) {
        throw new Error('One-click update works only in the installed application (not npm start).');
    }
    if (process.platform !== 'win32') {
        throw new Error('Automatic install is supported on Windows only.');
    }

    const downloaded = await downloadInstaller(info);
    const installDir = resolveInstallDir();
    if (!installDir) {
        throw new Error('Could not detect install folder');
    }

    const {helperPid, logPath} = await launchSilentInstallerAndRelaunch(
        downloaded,
        process.execPath,
        installDir,
    );
    app.quittingForUpdate = true;
    requestAppQuit();
    return {installerPath: downloaded, installDir, logPath, helperPid};
}

async function applyDesktopUpdateSmart(info) {
    if (info.updateKind === 'patch' && info.patchUrl) {
        return applyDesktopPatchOneClick(info);
    }
    return applyDesktopUpdateOneClick(info);
}

/**
 * @param {import('electron').BrowserWindow | null} parent
 * @param {{serverUrl: string, silent?: boolean}} opts
 */
async function runUpdateFlow(parent, opts) {
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
    ]
        .filter(Boolean)
        .join('\n');

    const canOneClick = app.isPackaged && process.platform === 'win32';
    const choice = await dialog.showMessageBox(parent || undefined, {
        type: 'info',
        title: 'Update available',
        message: isPatch
            ? `Small update ${result.remoteVersion} is available`
            : `Version ${result.remoteVersion} is available`,
        detail,
        buttons: canOneClick ? ['Update now', 'Later'] : ['OK'],
        defaultId: 0,
        cancelId: canOneClick ? 1 : 0,
    });

    if (!canOneClick || choice.response !== 0) {
        return result;
    }

    try {
        await applyDesktopUpdateSmart(result.info);
        return {...result, status: 'installing'};
    } catch (e) {
        if (isPatch) {
            try {
                await applyDesktopUpdateOneClick(result.info);
                return {...result, status: 'installing', fallback: 'full'};
            } catch (fallbackErr) {
                e = fallbackErr;
            }
        }
        await dialog.showMessageBox(parent || undefined, {
            type: 'error',
            title: 'Update failed',
            message: e?.message || String(e),
            detail: isPatch ? result.info.patchUrl : result.info.downloadUrl,
        });
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
    const desktop = await runUpdateFlow(parent, {...opts, silent: true});
    const go2rtc = await runGo2rtcUpdateFlow(parent, {...opts, silent: true});

    if (opts.silent) {
        return {desktop, go2rtc};
    }

    const lines = [];
    if (desktop.status === 'available') {
        lines.push(`Camera Wall app: ${desktop.remoteVersion} available (installed ${desktop.currentVersion}).`);
    } else if (desktop.status === 'viewer_only') {
        lines.push(`Camera Wall viewer UI: ${desktop.remoteVersion} on server (reload page; shell ${desktop.currentVersion}).`);
    } else if (desktop.status === 'current') {
        lines.push(`Camera Wall app: up to date (${desktop.currentVersion}).`);
    } else {
        lines.push(`Camera Wall app: ${desktop.message || desktop.status}.`);
    }

    if (go2rtc.status === 'available') {
        lines.push(`go2rtc server: ${go2rtc.remoteVersion} available (running ${go2rtc.runningVersion}).`);
    } else if (go2rtc.status === 'current') {
        lines.push(`go2rtc server: up to date (${go2rtc.runningVersion}).`);
    } else {
        lines.push(`go2rtc server: ${go2rtc.message || go2rtc.status}.`);
    }

    const actions = [];
    if (desktop.status === 'available') {
        actions.push({key: 'desktop', label: 'Update Camera Wall (one click)'});
    }
    if (go2rtc.status === 'available') {
        actions.push({key: 'go2rtc', label: 'Update go2rtc'});
    }

    const buttons = actions.map((a) => a.label);
    if (buttons.length) {
        buttons.push('Close');
    } else {
        buttons.push('OK');
    }

    const choice = await dialog.showMessageBox(parent || undefined, {
        type: 'info',
        title: 'Check for updates',
        message: actions.length ? 'Updates available' : 'Update check',
        detail: lines.join('\n'),
        buttons,
        defaultId: 0,
        cancelId: Math.max(0, buttons.length - 1),
    });

    const picked = actions[choice.response];
    if (picked?.key === 'desktop') {
        await runUpdateFlow(parent, opts);
    } else if (picked?.key === 'go2rtc') {
        await runGo2rtcUpdateFlow(parent, opts);
    }

    return {desktop, go2rtc};
}

module.exports = {
    checkForUpdates,
    checkGo2rtcUpdates,
    downloadInstaller,
    downloadPatch,
    applyDesktopPatchOneClick,
    applyDesktopUpdateOneClick,
    applyDesktopUpdateSmart,
    runUpdateFlow,
    runGo2rtcUpdateFlow,
    runAllUpdateFlows,
    fetchUpdateInfo,
    fetchGo2rtcUpdateInfo,
    setRequestAppQuit,
};
