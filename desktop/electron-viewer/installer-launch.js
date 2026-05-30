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

function quoteCmdArg(value) {
    const s = String(value || '');
    if (/[\s"]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

/**
 * Batch one-liner: wait for NSIS silent install, then relaunch the app.
 * Runs detached so the Electron process can exit and unlock files.
 * @param {string} installerPath
 * @param {string} appExePath
 * @param {string | null} [installDir]
 */
function relaunchAfterSilentInstallScript(installerPath, appExePath, installDir = resolveInstallDir()) {
    const instArgs = silentInstallArgs(installDir);
    const installerCmd = [quoteCmdArg(installerPath), ...instArgs.map((a) => quoteCmdArg(a))].join(' ');
    const appCmd = quoteCmdArg(appExePath);
    return `start /wait "" ${installerCmd} & start "" ${appCmd}`;
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

/**
 * Silent in-place upgrade then relaunch Camera Wall (Windows installed build).
 * @param {string} installerPath
 * @param {string} appExePath
 * @param {string | null} [installDir]
 * @returns {Promise<number>}
 */
function launchSilentInstallerAndRelaunch(installerPath, appExePath, installDir = resolveInstallDir()) {
    if (process.platform !== 'win32') {
        return launchSilentInstaller(installerPath, installDir);
    }
    return new Promise((resolve, reject) => {
        const script = relaunchAfterSilentInstallScript(installerPath, appExePath, installDir);
        const child = spawn('cmd.exe', ['/c', script], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
        });
        child.on('error', reject);
        child.unref();
        if (child.pid) {
            resolve(child.pid);
        } else {
            reject(new Error('Failed to start update relaunch script'));
        }
    });
}

module.exports = {
    resolveInstallDir,
    silentInstallArgs,
    quoteCmdArg,
    relaunchAfterSilentInstallScript,
    launchSilentInstaller,
    launchSilentInstallerAndRelaunch,
};
