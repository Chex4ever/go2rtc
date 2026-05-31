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
 * PowerShell script: wait for app exit, kill lingering processes, run silent NSIS, relaunch app.
 * @param {object} opts
 * @param {string} opts.installerPath
 * @param {string | null} [opts.installDir]
 * @param {number} opts.parentPid
 * @param {string} opts.logPath
 */
function buildUpdatePs1({installerPath, installDir, parentPid, logPath, appExePath, lockFilePath}) {
    const instArgs = silentInstallArgs(installDir);
    const argLines = instArgs.map((a) => `    '${psEscapeLiteral(a)}'`).join(',\n');
    const exePath = appExePath || (installDir ? path.join(installDir, 'go2rtc Camera Wall.exe') : '');
    const procName = exePath ? path.basename(exePath, path.extname(exePath)) : '';
    const killBlock = procName
        ? [
              `$procName = '${psEscapeLiteral(procName)}'`,
              `$installDir = '${psEscapeLiteral(installDir || '')}'`,
              'function Stop-CameraWallProcesses {',
              '    Get-Process -Name $procName -ErrorAction SilentlyContinue | ForEach-Object {',
              '        try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}',
              '    }',
              '    if ($installDir) {',
              '        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {',
              '            $_.Name -ieq ($procName + ".exe") -and $_.ExecutablePath -and ($_.ExecutablePath -like ($installDir + "*"))',
              '        } | ForEach-Object {',
              '            try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}',
              '        }',
              '    }',
              '}',
              'Stop-CameraWallProcesses',
          ].join('\n')
        : '';
    return [
        '$ErrorActionPreference = "Stop"',
        `$log = '${psEscapeLiteral(logPath)}'`,
        `$lockFile = '${psEscapeLiteral(lockFilePath || '')}'`,
        'function Write-Log([string]$Message) {',
        '    Add-Content -LiteralPath $log -Value ("{0} {1}" -f (Get-Date -Format o), $Message)',
        '}',
        'function Clear-InstallLock {',
        '    if ($lockFile) { Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue }',
        '}',
        `Write-Log "Camera Wall update helper started (parent PID ${parentPid})"`,
        `Write-Log "Install dir: ${psEscapeLiteral(installDir || '')}"`,
        `$pidToWait = ${parentPid}`,
        '$deadline = (Get-Date).AddSeconds(180)',
        'while ((Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {',
        '    Start-Sleep -Milliseconds 400',
        '}',
        killBlock,
        'Start-Sleep -Seconds 2',
        killBlock,
        `$waitName = '${psEscapeLiteral(procName)}'`,
        'if ($waitName) {',
        '    while ((Get-Process -Name $waitName -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {',
        '        Start-Sleep -Milliseconds 400',
        '    }',
        '}',
        'Start-Sleep -Seconds 1',
        `Write-Log "Running installer: ${installerPath}"`,
        `$p = Start-Process -LiteralPath '${psEscapeLiteral(installerPath)}' -ArgumentList @(`,
        argLines,
        ') -Wait -PassThru -WindowStyle Hidden',
        'if (-not $p) { Write-Log "Start-Process returned null"; Clear-InstallLock; exit 1 }',
        'Write-Log ("Installer exit code: {0}" -f $p.ExitCode)',
        'if ($p.ExitCode -ne 0) { Clear-InstallLock; exit $p.ExitCode }',
        'Clear-InstallLock',
        `$appExe = '${psEscapeLiteral(exePath)}'`,
        'if (Test-Path -LiteralPath $appExe) {',
        '    Write-Log ("Relaunching " + $appExe)',
        '    Start-Process -LiteralPath $appExe | Out-Null',
        '} else {',
        '    Write-Log "App exe missing after install"',
        '    exit 5',
        '}',
        'Write-Log "Install finished"',
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
function launchSilentInstallerAndRelaunch(installerPath, appExePath, installDir = resolveInstallDir(), parentPid = process.pid, lockFilePath = '') {
    if (process.platform !== 'win32') {
        return launchSilentInstaller(installerPath, installDir).then((helperPid) => ({helperPid, logPath: ''}));
    }
    const logPath = updateLogPath(parentPid);
    const ps1Path = updateScriptPath(parentPid);
    const script = buildUpdatePs1({
        installerPath,
        installDir,
        parentPid,
        logPath,
        appExePath,
        lockFilePath,
    });
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

/**
 * Start installer with normal UI (no /S). User closes Camera Wall when the wizard asks.
 * @param {string} installerPath
 * @returns {Promise<number>}
 */
function launchInteractiveInstaller(installerPath) {
    return new Promise((resolve, reject) => {
        const child = spawn(installerPath, [], {
            detached: true,
            stdio: 'ignore',
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
    quoteCmdArg,
    psSingleQuote,
    buildUpdatePs1,
    relaunchAfterSilentInstallScript,
    updateLogPath,
    launchSilentInstaller,
    launchSilentInstallerAndRelaunch,
    launchInteractiveInstaller,
};
