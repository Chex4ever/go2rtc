const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {app, dialog} = require('electron');
const core = require('./updater-core');

/**
 * @param {{serverUrl: string, currentVersion?: string, platform?: string}} opts
 */
async function fetchUpdateInfo(opts) {
    const serverUrl = opts.serverUrl;
    const platform = opts.platform || process.platform;
    const serverBase = require('./config-core').normalizeServerUrl(serverUrl);

    for (const url of core.updateCheckUrls(serverUrl)) {
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

    const detail = [
        result.info.notes || '',
        '',
        `Installed: ${result.currentVersion}`,
        `Available: ${result.remoteVersion}`,
        '',
        'The installer will download from your go2rtc server, then you run it to upgrade.',
    ]
        .filter(Boolean)
        .join('\n');

    const choice = await dialog.showMessageBox(parent || undefined, {
        type: 'info',
        title: 'Update available',
        message: `Version ${result.remoteVersion} is available`,
        detail,
        buttons: ['Download and install', 'Later'],
        defaultId: 0,
        cancelId: 1,
    });

    if (choice.response !== 0) {
        return result;
    }

    try {
        const installerPath = await downloadInstaller(result.info);
        await dialog.showMessageBox(parent || undefined, {
            type: 'info',
            title: 'Update downloaded',
            message: 'Run the installer to finish upgrading.',
            detail: installerPath,
        });
        const {shell} = require('electron');
        await shell.openPath(installerPath);
        return {...result, installerPath};
    } catch (e) {
        await dialog.showMessageBox(parent || undefined, {
            type: 'error',
            title: 'Update failed',
            message: e?.message || String(e),
            detail: result.info.downloadUrl,
        });
        return {...result, error: e};
    }
}

module.exports = {
    checkForUpdates,
    downloadInstaller,
    runUpdateFlow,
    fetchUpdateInfo,
};
