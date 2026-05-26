const {spawn} = require('child_process');
const path = require('path');

/**
 * Install directory of the running app (NSIS $INSTDIR).
 * @returns {string | null}
 */
function resolveInstallDir() {
    if (process.platform !== 'win32') {
        return null;
    }
    try {
        return path.dirname(process.execPath);
    } catch {
        return null;
    }
}

/**
 * NSIS silent install args. /D= must be last.
 * @param {string | null} installDir
 */
function silentInstallArgs(installDir) {
    const args = ['/S'];
    if (installDir) {
        args.push(`/D=${installDir}`);
    }
    return args;
}

/**
 * Start installer detached; caller should quit the app so files can be replaced.
 * @param {string} installerPath
 * @param {string | null} [installDir]
 * @returns {Promise<number>}
 */
function launchSilentInstaller(installerPath, installDir = resolveInstallDir()) {
    return new Promise((resolve, reject) => {
        const child = spawn(installerPath, silentInstallArgs(installDir), {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
        });
        child.on('error', reject);
        child.unref();
        if (child.pid) {
            resolve(child.pid);
        } else {
            reject(new Error('Failed to start installer'));
        }
    });
}

module.exports = {
    resolveInstallDir,
    silentInstallArgs,
    launchSilentInstaller,
};
