const {normalizeServerUrl} = require('./config-core');

/** @returns {-1|0|1} */
function compareSemver(a, b) {
    const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const da = pa[i] || 0;
        const db = pb[i] || 0;
        if (da > db) {
            return 1;
        }
        if (da < db) {
            return -1;
        }
    }
    return 0;
}

function resolveUrl(base, maybeRelative) {
    const u = String(maybeRelative || '').trim();
    if (!u) {
        return '';
    }
    try {
        return new URL(u, base.endsWith('/') ? base : `${base}/`).href;
    } catch {
        return '';
    }
}

function versionFromInstallerUrl(url) {
    let path = String(url || '');
    try {
        path = new URL(path).pathname;
    } catch {
        /* relative URL — use as-is */
    }
    const base = path.split(/[/\\]/).pop() || path;
    const matches = base.match(/\d+\.\d+\.\d+/g);
    if (!matches || !matches.length) {
        return '';
    }
    return matches[matches.length - 1];
}

/** Prefer installer filename version when API tag and asset disagree. */
function effectiveUpdateVersion(data) {
    const apiVersion = String(data.version || '').trim();
    const fileVersion = versionFromInstallerUrl(data.download_url || data.downloadUrl || '');
    if (fileVersion && apiVersion && compareSemver(fileVersion, apiVersion) !== 0) {
        return fileVersion;
    }
    return apiVersion || fileVersion;
}

/**
 * Normalize API or static update.json into {version, downloadUrl, notes, sha256}.
 * @param {object} data
 * @param {string} serverBase normalized server URL (no trailing slash)
 * @param {string} platform node process.platform (win32, darwin, ...)
 */
function normalizeUpdateInfo(data, serverBase, platform) {
    if (!data || typeof data !== 'object') {
        return null;
    }

    let downloadUrl = String(data.download_url || data.downloadUrl || '').trim();
    let sha256 = String(data.sha256 || '').trim();
    let notes = String(data.notes || '').trim();

    if (!downloadUrl && platform === 'win32' && data.windows) {
        downloadUrl = String(data.windows.url || '').trim();
        sha256 = sha256 || String(data.windows.sha256 || '').trim();
        notes = notes || String(data.windows.notes || '').trim();
    }

    downloadUrl = resolveUrl(serverBase, downloadUrl);
    if (!downloadUrl) {
        return null;
    }

    const version = effectiveUpdateVersion({...data, download_url: downloadUrl});
    if (!version) {
        return null;
    }

    let patchUrl = String(data.patch_url || data.patchUrl || '').trim();
    patchUrl = resolveUrl(serverBase, patchUrl);

    return {
        version,
        downloadUrl,
        notes,
        sha256,
        updateKind: String(data.update_kind || data.updateKind || 'full').trim().toLowerCase() || 'full',
        shellChanged: data.shell_changed !== false && data.shellChanged !== false,
        patchFrom: String(data.patch_from || data.patchFrom || '').trim(),
        patchUrl,
        patchSha256: String(data.patch_sha256 || data.patchSha256 || '').trim(),
        releaseTag: String(data.release_tag || data.releaseTag || '').trim(),
    };
}

function updateCheckUrls(serverUrl, fromVersion) {
    const base = normalizeServerUrl(serverUrl);
    const from = String(fromVersion || '').trim();
    const fromQuery = from ? `&from=${encodeURIComponent(from)}` : '';
    return [
        `${base}/api/viewer/desktop/update?platform=win32${fromQuery}`,
        `${base}/viewer/desktop/update.json`,
    ];
}

function go2rtcUpdateUrls(serverUrl) {
    const base = normalizeServerUrl(serverUrl);
    return [
        `${base}/api/viewer/go2rtc/update?platform=win32&arch=amd64`,
        `${base}/viewer/go2rtc/update.json`,
    ];
}

/**
 * @param {object} data
 * @param {string} serverBase
 * @param {string} platform
 */
function normalizeGo2rtcUpdateInfo(data, serverBase, platform) {
    if (!data || typeof data !== 'object') {
        return null;
    }
    const version = String(data.version || '').trim();
    if (!version) {
        return null;
    }
    let downloadUrl = String(data.download_url || data.downloadUrl || '').trim();
    if (downloadUrl.startsWith('http://') || downloadUrl.startsWith('https://')) {
        /* GitHub direct URL */
    } else {
        downloadUrl = resolveUrl(serverBase, downloadUrl);
    }
    if (!downloadUrl) {
        return null;
    }
    return {
        version,
        downloadUrl,
        notes: String(data.notes || '').trim(),
        sha256: String(data.sha256 || '').trim(),
        runningVersion: String(data.running_version || data.runningVersion || '').trim(),
        source: String(data.source || '').trim(),
        releaseUrl: String(data.release_url || data.releaseUrl || '').trim(),
    };
}

function isNewerVersion(remote, current) {
    return compareSemver(remote, current) > 0;
}

module.exports = {
    compareSemver,
    versionFromInstallerUrl,
    effectiveUpdateVersion,
    normalizeUpdateInfo,
    normalizeGo2rtcUpdateInfo,
    updateCheckUrls,
    go2rtcUpdateUrls,
    isNewerVersion,
    resolveUrl,
};
