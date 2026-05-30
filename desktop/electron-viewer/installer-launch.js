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

function psSingleQuote(value) {
    return `'${String(value || '').replace(/'/g, "''")}'`;
}

/**
 * PowerShell: wait for app exit, silent NSIS install, relaunch.
 * @param {string} installerPath
 * @param {string} appExePath
 * @param {string | null} [installDir]
 * @param {number} [parentPid]
 */
function relaunchAfterSilentInstallScript(installerPath, appExePath, installDir = resolveInstallDir(), parentPid = process.pid) {
    const instArgs = silentInstallArgs(installDir).map(psSingleQuote).join(',');
    return [
        'powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command',
        psSingleQuote(
            `& { $ErrorActionPreference = 'Stop'; ` +
                `Wait-Process -Id ${parentPid} -ErrorAction SilentlyContinue; ` +
                `Start-Sleep -Seconds 2; ` +
                `$p = Start-Process -FilePath ${psSingleQuote(installerPath)} -ArgumentList @(${instArgs}) -Wait -PassThru -WindowStyle Hidden; ` +
                `if ($p -and $p.ExitCode -ne 0) { exit $p.ExitCode }; ` +
                `Start-Process -FilePath ${psSingleQuote(appExePath)} }`,
        ),
    ].join(' ');
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
 * @param {number} [parentPid]
 * @returns {Promise<number>}
 */
function launchSilentInstallerAndRelaunch(installerPath, appExePath, installDir = resolveInstallDir(), parentPid = process.pid) {
    if (process.platform !== 'win32') {
        return launchSilentInstaller(installerPath, installDir);
    }
    return new Promise((resolve, reject) => {
        const script = relaunchAfterSilentInstallScript(installerPath, appExePath, installDir, parentPid);
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
    psSingleQuote,
    relaunchAfterSilentInstallScript,
    launchSilentInstaller,
    launchSilentInstallerAndRelaunch,
};
