const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const FULL_UPDATE_FILES = new Set([
    'electron.exe',
    'go2rtc camera wall.exe',
    'ffmpeg.dll',
    'libEGL.dll',
    'libGLESv2.dll',
    'd3dcompiler_47.dll',
    'vk_swiftshader.dll',
    'vulkan-1.dll',
]);

const DEFAULT_BYTE_THRESHOLD = 0.4;

/**
 * @param {string} filePath
 * @returns {Promise<{sha256: string, size: number}>}
 */
async function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        let size = 0;
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => {
            size += chunk.length;
            hash.update(chunk);
        });
        stream.on('error', reject);
        stream.on('end', () => resolve({sha256: hash.digest('hex'), size}));
    });
}

function hashFileSync(filePath) {
    const data = fs.readFileSync(filePath);
    return {
        sha256: crypto.createHash('sha256').update(data).digest('hex'),
        size: data.length,
    };
}

/**
 * @param {string} rootDir install root (win-unpacked)
 * @returns {Promise<Array<{path: string, sha256: string, size: number}>>}
 */
async function walkInstallDir(rootDir) {
    const files = [];
    async function walk(relDir) {
        const absDir = path.join(rootDir, relDir);
        for (const name of fs.readdirSync(absDir)) {
            const rel = relDir ? path.join(relDir, name) : name;
            const abs = path.join(rootDir, rel);
            const st = fs.statSync(abs);
            if (st.isDirectory()) {
                await walk(rel);
                continue;
            }
            const {sha256, size} = await hashFile(abs);
            files.push({
                path: rel.replace(/\\/g, '/'),
                sha256,
                size,
            });
        }
    }
    await walk('');
    files.sort((a, b) => a.path.localeCompare(b.path));
    return files;
}

/**
 * @param {string} version
 * @param {string} rootDir
 */
async function buildManifest(version, rootDir) {
    const files = await walkInstallDir(rootDir);
    return {version, files};
}

/**
 * @param {{files: Array<{path: string, sha256: string, size: number}>}} prev
 * @param {{files: Array<{path: string, sha256: string, size: number}>}} curr
 */
function diffManifests(prev, curr) {
    const prevMap = new Map((prev?.files || []).map((f) => [f.path, f]));
    const currMap = new Map((curr?.files || []).map((f) => [f.path, f]));
    const changed = [];
    let totalBytes = 0;
    let changedBytes = 0;

    for (const file of curr.files || []) {
        totalBytes += file.size;
        const old = prevMap.get(file.path);
        if (!old || old.sha256 !== file.sha256) {
            changed.push(file);
            changedBytes += file.size;
        }
    }

    return {changed, totalBytes, changedBytes, prevCount: prevMap.size, currCount: currMap.size};
}

/**
 * @param {{changed: Array<{path: string}>, changedBytes: number, totalBytes: number}} diff
 * @param {number} [byteThreshold]
 */
function shouldUseFullUpdate(diff, byteThreshold = DEFAULT_BYTE_THRESHOLD) {
    if (!diff.changed.length) {
        return false;
    }
    for (const file of diff.changed) {
        const base = path.basename(file.path).toLowerCase();
        if (FULL_UPDATE_FILES.has(base)) {
            return true;
        }
    }
    if (diff.totalBytes > 0 && diff.changedBytes / diff.totalBytes > byteThreshold) {
        return true;
    }
    return false;
}

function patchZipName(from, to) {
    return `go2rtc.Camera.Wall.Patch.${from}-${to}.zip`;
}

function manifestFileName(version) {
    return `desktop-shell-manifest-${version}.json`;
}

function updateMetaFileName(version) {
    return `desktop-update-meta-${version}.json`;
}

/**
 * @param {object} opts
 * @param {string} opts.rootDir
 * @param {string} opts.from
 * @param {string} opts.to
 * @param {Array<{path: string, sha256: string, size: number}>} opts.changed
 * @param {string} opts.outZip
 */
function buildPatchZip({rootDir, from, to, changed, outZip}) {
    const staging = `${outZip}.staging`;
    fs.rmSync(staging, {recursive: true, force: true});
    fs.mkdirSync(staging, {recursive: true});

    const patchJson = {
        from,
        to,
        files: changed.map((f) => ({path: f.path, sha256: f.sha256, size: f.size})),
    };
    fs.writeFileSync(path.join(staging, 'patch.json'), `${JSON.stringify(patchJson, null, 2)}\n`, 'utf8');

    for (const file of changed) {
        const src = path.join(rootDir, file.path);
        const dest = path.join(staging, 'files', file.path);
        fs.mkdirSync(path.dirname(dest), {recursive: true});
        fs.copyFileSync(src, dest);
    }

    fs.rmSync(outZip, {force: true});
    if (process.platform === 'win32') {
        execFileSync(
            'powershell.exe',
            [
                '-NoProfile',
                '-Command',
                `Compress-Archive -LiteralPath '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${outZip.replace(/'/g, "''")}' -Force`,
            ],
            {stdio: 'inherit'},
        );
    } else {
        execFileSync('zip', ['-r', '-q', outZip, '.'], {cwd: staging, stdio: 'inherit'});
    }

    fs.rmSync(staging, {recursive: true, force: true});
    return hashFileSync(outZip).sha256;
}

/**
 * Find win-unpacked under electron-builder output.
 * @param {string} outputDir
 */
function findUnpackedDir(outputDir) {
    const direct = path.join(outputDir, 'win-unpacked');
    if (fs.existsSync(direct)) {
        return direct;
    }
    for (const name of fs.readdirSync(outputDir)) {
        if (name.endsWith('-unpacked')) {
            return path.join(outputDir, name);
        }
    }
    throw new Error(`No unpacked dir under ${outputDir}`);
}

module.exports = {
    DEFAULT_BYTE_THRESHOLD,
    hashFile,
    hashFileSync,
    walkInstallDir,
    buildManifest,
    diffManifests,
    shouldUseFullUpdate,
    patchZipName,
    manifestFileName,
    updateMetaFileName,
    buildPatchZip,
    findUnpackedDir,
};
