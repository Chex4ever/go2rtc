const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** @type {() => string} */
let getUserDataPath = () => path.join(process.cwd(), '.update-cache-test');

function setUserDataPath(fn) {
    getUserDataPath = typeof fn === 'function' ? fn : getUserDataPath;
}

function updatesDir() {
    const dir = path.join(getUserDataPath(), 'updates');
    fs.mkdirSync(dir, {recursive: true});
    return dir;
}

function logsDir() {
    const dir = path.join(getUserDataPath(), 'logs');
    fs.mkdirSync(dir, {recursive: true});
    return dir;
}

function updateLogFile() {
    return path.join(logsDir(), 'camera-wall-update.log');
}

function pendingUpdateFile() {
    return path.join(getUserDataPath(), 'pending-update.json');
}

function logUpdate(message, extra) {
    const line = extra
        ? `[${new Date().toISOString()}] ${message} ${JSON.stringify(extra)}\n`
        : `[${new Date().toISOString()}] ${message}\n`;
    try {
        fs.appendFileSync(updateLogFile(), line, 'utf8');
    } catch {
        /* ignore logging failures */
    }
}

function readPendingUpdate() {
    try {
        const raw = fs.readFileSync(pendingUpdateFile(), 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function writePendingUpdate(data) {
    fs.writeFileSync(pendingUpdateFile(), JSON.stringify(data, null, 2), 'utf8');
    logUpdate('pending update saved', {version: data.version, kind: data.kind, path: data.path});
}

function clearPendingUpdate() {
    try {
        fs.unlinkSync(pendingUpdateFile());
    } catch {
        /* ignore */
    }
    logUpdate('pending update cleared');
}

function sha256File(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex').toLowerCase();
}

function artifactFileName(version, kind, url) {
    let base = 'update.bin';
    try {
        base = path.basename(new URL(url).pathname) || base;
    } catch {
        /* relative URL */
    }
    return `${version}-${kind}-${base}`;
}

function artifactPath(version, kind, url) {
    return path.join(updatesDir(), artifactFileName(version, kind, url));
}

function verifyArtifact(filePath, sha256) {
    if (!sha256) {
        return fs.existsSync(filePath);
    }
    if (!fs.existsSync(filePath)) {
        return false;
    }
    return sha256File(filePath) === String(sha256).toLowerCase();
}

/**
 * @param {object} info normalized update info
 * @returns {{path: string, reused: boolean} | null}
 */
function findCachedArtifact(info) {
    const kind = info.updateKind === 'patch' && info.patchUrl ? 'patch' : 'full';
    const url = kind === 'patch' ? info.patchUrl : info.downloadUrl;
    const sha = kind === 'patch' ? (info.patchSha256 || info.sha256) : info.sha256;
    const dest = artifactPath(info.version, kind, url);
    if (verifyArtifact(dest, sha)) {
        return {path: dest, reused: true, kind, url, sha256: sha || ''};
    }
    return findCachedArtifactByVersion(info.version, kind, sha);
}

/** Reuse any verified file in updates/ for this version (stable even if download URL changed). */
function findCachedArtifactByVersion(version, kind, sha256) {
    if (!version) {
        return null;
    }
    const prefix = `${version}-${kind}-`;
    let dir;
    try {
        dir = updatesDir();
    } catch {
        return null;
    }
    for (const name of fs.readdirSync(dir)) {
        if (!name.startsWith(prefix)) {
            continue;
        }
        const filePath = path.join(dir, name);
        if (verifyArtifact(filePath, sha256)) {
            return {path: filePath, reused: true, kind, sha256: sha256 || ''};
        }
    }
    return null;
}

/**
 * Prefer pending-update.json, then version/kind cache (ignore URL drift).
 * @param {object} info
 * @param {string} currentVersion
 */
function resolveLocalArtifact(info, currentVersion) {
    const pending = readPendingUpdate();
    if (pending?.path && pending.version && fs.existsSync(pending.path)) {
        if (coreIsNewerVersion(pending.version, currentVersion)) {
            if (!info?.version || pending.version === info.version) {
                if (!pending.sha256 || verifyArtifact(pending.path, pending.sha256)) {
                    return {path: pending.path, pending: true, version: pending.version};
                }
            }
        }
    }

    if (info?.version) {
        const cached = findCachedArtifact(info);
        if (cached?.path) {
            return {path: cached.path, pending: false, version: info.version};
        }
    }
    return null;
}

/** Avoid circular require — duplicated semver check for cache-only use. */
function coreIsNewerVersion(remote, current) {
    const pa = String(remote || '0').split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(current || '0').split('.').map((n) => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const da = pa[i] || 0;
        const db = pb[i] || 0;
        if (da > db) {
            return true;
        }
        if (da < db) {
            return false;
        }
    }
    return false;
}

function cleanupOldUpdates(keepVersion) {
    const dir = updatesDir();
    for (const name of fs.readdirSync(dir)) {
        if (keepVersion && name.startsWith(`${keepVersion}-`)) {
            continue;
        }
        try {
            fs.unlinkSync(path.join(dir, name));
            logUpdate('removed old cached update', {file: name});
        } catch {
            /* ignore */
        }
    }
}

/**
 * Remove pending update and obsolete cache after a successful install.
 * Does not delete a downloaded newer version waiting to be applied.
 * @param {string} installedVersion
 */
function cleanupAfterSuccessfulUpdate(installedVersion) {
    const pending = readPendingUpdate();
    if (pending && pending.version === installedVersion) {
        clearPendingUpdate();
        cleanupOldUpdates(installedVersion);
        logUpdate('cleanup after successful update', {installedVersion});
        return;
    }
    if (pending && coreIsNewerVersion(pending.version, installedVersion)) {
        logUpdate('skip cache cleanup — newer update pending', {
            installedVersion,
            pendingVersion: pending.version,
        });
        return;
    }
    if (pending) {
        clearPendingUpdate();
    }
    cleanupOldUpdates(installedVersion);
    logUpdate('cleanup after successful update', {installedVersion});
}

/**
 * @param {object} info
 * @param {string} dest
 */
function rememberPendingUpdate(info, dest) {
    const kind = info.updateKind === 'patch' && info.patchUrl ? 'patch' : 'full';
    writePendingUpdate({
        version: info.version,
        kind,
        path: dest,
        sha256: kind === 'patch' ? (info.patchSha256 || info.sha256 || '') : (info.sha256 || ''),
        savedAt: new Date().toISOString(),
        updateKind: info.updateKind,
        patchUrl: info.patchUrl || '',
        downloadUrl: info.downloadUrl || '',
    });
}

module.exports = {
    setUserDataPath,
    updatesDir,
    logsDir,
    updateLogFile,
    pendingUpdateFile,
    logUpdate,
    readPendingUpdate,
    writePendingUpdate,
    clearPendingUpdate,
    sha256File,
    artifactPath,
    verifyArtifact,
    findCachedArtifact,
    findCachedArtifactByVersion,
    resolveLocalArtifact,
    cleanupOldUpdates,
    cleanupAfterSuccessfulUpdate,
    rememberPendingUpdate,
};
