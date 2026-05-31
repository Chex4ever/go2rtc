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
    if (!verifyArtifact(dest, sha)) {
        return null;
    }
    return {path: dest, reused: true, kind, url, sha256: sha || ''};
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
 * Remove pending update and cache after a successful install.
 * @param {string} installedVersion
 */
function cleanupAfterSuccessfulUpdate(installedVersion) {
    const pending = readPendingUpdate();
    if (pending && pending.version === installedVersion) {
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
    cleanupOldUpdates,
    cleanupAfterSuccessfulUpdate,
    rememberPendingUpdate,
};
