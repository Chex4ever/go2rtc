const {spawn} = require('child_process');
const fs = require('fs');
const os = require('os');
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

function psEscapeLiteral(value) {
    return String(value || '').replace(/'/g, "''");
}

/**
 * PowerShell script: wait for app exit, run silent NSIS in-place upgrade.
 * NSIS customInstall relaunches the app after a successful silent update.
 * @param {object} opts
 * @param {string} opts.installerPath
 * @param {string | null} [opts.installDir]
 * @param {number} opts.parentPid
 * @param {string} opts.logPath
 */
function buildUpdatePs1({installerPath, installDir, parentPid, logPath, appExePath}) {
    const instArgs = silentInstallArgs(installDir);
    const argLines = instArgs.map((a) => `    '${psEscapeLiteral(a)}'`).join(',\n');
    const exeName = appExePath ? path.basename(appExePath) : '';
    const waitByName = exeName
        ? [
              `$procName = '${psEscapeLiteral(path.basename(exeName, path.extname(exeName)))}'`,
              'while ((Get-Process -Name $procName -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {',
              '    Start-Sleep -Milliseconds 400',
              '}',
          ].join('\n')
        : '';
    return [
        '$ErrorActionPreference = "Stop"',
        `$log = '${psEscapeLiteral(logPath)}'`,
        'function Write-Log([string]$Message) {',
        '    Add-Content -LiteralPath $log -Value ("{0} {1}" -f (Get-Date -Format o), $Message)',
        '}',
        `Write-Log "Camera Wall update helper started (parent PID ${parentPid})"`,
        `$pidToWait = ${parentPid}`,
        '$deadline = (Get-Date).AddSeconds(120)',
        'while ((Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {',
        '    Start-Sleep -Milliseconds 400',
        '}',
        waitByName,
        'Start-Sleep -Seconds 2',
        `Write-Log "Running installer: ${installerPath}"`,
        `$p = Start-Process -LiteralPath '${psEscapeLiteral(installerPath)}' -ArgumentList @(`,
        argLines,
        ') -Wait -PassThru -WindowStyle Hidden',
        'if (-not $p) { Write-Log "Start-Process returned null"; exit 1 }',
        'Write-Log ("Installer exit code: {0}" -f $p.ExitCode)',
        'if ($p.ExitCode -ne 0) { exit $p.ExitCode }',
        appExePath
            ? [
                  `Write-Log "Relaunching app: ${appExePath}"`,
                  `Start-Process -LiteralPath '${psEscapeLiteral(appExePath)}' | Out-Null`,
                  'Write-Log "App relaunch requested"',
              ].join('\n')
            : 'Write-Log "Install finished — NSIS may relaunch the app"',
    ].join('\n');
}

/** @deprecated kept for tests — use buildUpdatePs1 */
function relaunchAfterSilentInstallScript(installerPath, appExePath, installDir = resolveInstallDir(), parentPid = process.pid) {
    const logPath = path.join(os.tmpdir(), `go2rtc-viewer-update-${parentPid}.log`);
    return buildUpdatePs1({
        installerPath,
        installDir,
        parentPid,
        logPath,
    });
}

function updateLogPath(parentPid = process.pid) {
    return path.join(os.tmpdir(), `go2rtc-viewer-update-${parentPid}.log`);
}

function updateScriptPath(parentPid = process.pid) {
    return path.join(os.tmpdir(), `go2rtc-viewer-update-${parentPid}.ps1`);
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
 * Silent in-place upgrade then quit Camera Wall (Windows installed build).
 * Writes a temp .ps1, waits for this process to exit, runs NSIS /S; installer relaunches app.
 * @param {string} installerPath
 * @param {string} appExePath unused — relaunch is done by NSIS after silent update
 * @param {string | null} [installDir]
 * @param {number} [parentPid]
 * @returns {Promise<{helperPid: number, logPath: string}>}
 */
function launchSilentInstallerAndRelaunch(installerPath, appExePath, installDir = resolveInstallDir(), parentPid = process.pid) {
    if (process.platform !== 'win32') {
        return launchSilentInstaller(installerPath, installDir).then((helperPid) => ({helperPid, logPath: ''}));
    }
    const logPath = updateLogPath(parentPid);
    const ps1Path = updateScriptPath(parentPid);
    const script = buildUpdatePs1({installerPath, installDir, parentPid, logPath, appExePath});
    fs.writeFileSync(ps1Path, script, 'utf8');

    return new Promise((resolve, reject) => {
        const child = spawn(
            'powershell.exe',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps1Path],
            {
                detached: true,
                stdio: 'ignore',
                windowsHide: true,
            },
        );
        child.on('error', reject);
        child.unref();
        if (child.pid) {
            resolve({helperPid: child.pid, logPath});
        } else {
            reject(new Error('Failed to start update helper'));
        }
    });
}

module.exports = {
    resolveInstallDir,
    silentInstallArgs,
    quoteCmdArg,
    psSingleQuote,
    buildUpdatePs1,
    relaunchAfterSilentInstallScript,
    updateLogPath,
    launchSilentInstaller,
    launchSilentInstallerAndRelaunch,
};
