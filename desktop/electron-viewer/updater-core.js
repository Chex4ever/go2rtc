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
    const version = String(data.version || '').trim();
    if (!version) {
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

    return {version, downloadUrl, notes, sha256};
}

function updateCheckUrls(serverUrl) {
    const base = normalizeServerUrl(serverUrl);
    return [
        `${base}/api/viewer/desktop/update?platform=win32`,
        `${base}/viewer/desktop/update.json`,
    ];
}

function isNewerVersion(remote, current) {
    return compareSemver(remote, current) > 0;
}

module.exports = {
    compareSemver,
    normalizeUpdateInfo,
    updateCheckUrls,
    isNewerVersion,
    resolveUrl,
};
