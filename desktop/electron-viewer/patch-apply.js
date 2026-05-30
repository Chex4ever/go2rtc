const {spawn} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {resolveInstallDir} = require('./installer-launch');

function psEscapeLiteral(value) {
    return String(value || '').replace(/'/g, "''");
}

function patchLogPath(parentPid = process.pid) {
    return path.join(os.tmpdir(), `go2rtc-viewer-patch-${parentPid}.log`);
}

function patchScriptPath(parentPid = process.pid) {
    return path.join(os.tmpdir(), `go2rtc-viewer-patch-${parentPid}.ps1`);
}

/**
 * @param {object} opts
 * @param {string} opts.patchZip
 * @param {string | null} [opts.installDir]
 * @param {string} opts.appExePath
 * @param {number} opts.parentPid
 * @param {string} opts.logPath
 */
function buildPatchApplyPs1({patchZip, installDir, appExePath, parentPid, logPath}) {
    const inst = installDir || resolveInstallDir() || '';
    return [
        '$ErrorActionPreference = "Stop"',
        `$log = '${psEscapeLiteral(logPath)}'`,
        'function Write-Log([string]$Message) {',
        '    Add-Content -LiteralPath $log -Value ("{0} {1}" -f (Get-Date -Format o), $Message)',
        '}',
        `Write-Log "Camera Wall patch helper started (parent PID ${parentPid})"`,
        `$pidToWait = ${parentPid}`,
        '$deadline = (Get-Date).AddSeconds(90)',
        'while ((Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {',
        '    Start-Sleep -Milliseconds 400',
        '}',
        'Start-Sleep -Seconds 2',
        `$patchZip = '${psEscapeLiteral(patchZip)}'`,
        `$installDir = '${psEscapeLiteral(inst)}'`,
        `$appExe = '${psEscapeLiteral(appExePath)}'`,
        '$extract = Join-Path $env:TEMP ("go2rtc-viewer-patch-" + [guid]::NewGuid().ToString())',
        'New-Item -ItemType Directory -Path $extract -Force | Out-Null',
        'Write-Log ("Extracting patch to " + $extract)',
        'Expand-Archive -LiteralPath $patchZip -DestinationPath $extract -Force',
        '$manifestPath = Join-Path $extract "patch.json"',
        'if (-not (Test-Path -LiteralPath $manifestPath)) { Write-Log "patch.json missing"; exit 2 }',
        '$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json',
        'foreach ($entry in $manifest.files) {',
        '    $rel = [string]$entry.path',
        '    $src = Join-Path $extract ("files\\" + ($rel -replace "/","\\"))',
        '    $dst = Join-Path $installDir ($rel -replace "/","\\")',
        '    if (-not (Test-Path -LiteralPath $src)) { Write-Log ("Missing patch file: " + $rel); exit 3 }',
        '    $hash = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash.ToLowerInvariant()',
        '    if ($hash -ne [string]$entry.sha256) { Write-Log ("Checksum mismatch: " + $rel); exit 4 }',
        '    $parent = Split-Path -Parent $dst',
        '    if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }',
        '    Copy-Item -LiteralPath $src -Destination $dst -Force',
        '    Write-Log ("Patched " + $rel)',
        '}',
        'Remove-Item -LiteralPath $extract -Recurse -Force -ErrorAction SilentlyContinue',
        'Write-Log ("Relaunching " + $appExe)',
        'Start-Process -LiteralPath $appExe | Out-Null',
        'Write-Log "Patch apply finished"',
    ].join('\n');
}

/**
 * @param {string} patchZip
 * @param {string} appExePath
 * @param {string | null} [installDir]
 * @param {number} [parentPid]
 * @returns {Promise<{helperPid: number, logPath: string}>}
 */
function launchPatchApplyAndRelaunch(patchZip, appExePath, installDir = resolveInstallDir(), parentPid = process.pid) {
    if (process.platform !== 'win32') {
        return Promise.reject(new Error('Patch apply is supported on Windows only.'));
    }
    const logPath = patchLogPath(parentPid);
    const ps1Path = patchScriptPath(parentPid);
    const script = buildPatchApplyPs1({patchZip, installDir, appExePath, parentPid, logPath});
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
            reject(new Error('Failed to start patch helper'));
        }
    });
}

module.exports = {
    buildPatchApplyPs1,
    patchLogPath,
    patchScriptPath,
    launchPatchApplyAndRelaunch,
};
