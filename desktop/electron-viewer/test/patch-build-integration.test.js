const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {execFileSync} = require('child_process');

const REPO = path.join(__dirname, '..', '..', '..');
const BUILD_PATCH = path.join(REPO, 'scripts', 'build-desktop-patch.mjs');
const VALIDATE = path.join(REPO, 'scripts', 'validate-desktop-update-meta.mjs');

function sha256File(filePath) {
    const data = fs.readFileSync(filePath);
    return {
        sha256: crypto.createHash('sha256').update(data).digest('hex'),
        size: data.length,
    };
}

function writeJson(file, data) {
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

describe('build-desktop-patch.mjs integration', () => {
    it('builds patch zip for small asar-only shell diff', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-build-'));
        const rootDir = path.join(dir, 'unpacked');
        const asarPath = path.join(rootDir, 'resources', 'app.asar');
        fs.mkdirSync(path.dirname(asarPath), {recursive: true});
        fs.writeFileSync(asarPath, 'shell-v1', 'utf8');
        const fromHash = sha256File(asarPath);

        const fromManifest = path.join(dir, 'from.json');
        const toManifest = path.join(dir, 'to.json');
        writeJson(fromManifest, {
            version: '1.2.13',
            files: [
                {path: 'resources/app.asar', sha256: fromHash.sha256, size: fromHash.size},
                {path: 'chrome_100_percent.pak', sha256: 'deadbeef', size: 500000},
                {path: 'icudtl.dat', sha256: 'cafebabe', size: 5000000},
            ],
        });

        fs.writeFileSync(asarPath, 'shell-v2-longer', 'utf8');
        const toHash = sha256File(asarPath);
        writeJson(toManifest, {
            version: '1.2.14',
            files: [
                {path: 'resources/app.asar', sha256: toHash.sha256, size: toHash.size},
                {path: 'chrome_100_percent.pak', sha256: 'deadbeef', size: 500000},
                {path: 'icudtl.dat', sha256: 'cafebabe', size: 5000000},
            ],
        });

        execFileSync(
            process.execPath,
            [BUILD_PATCH, '--root', rootDir, '--from-manifest', fromManifest, '--to-manifest', toManifest, '--out-dir', dir],
            {stdio: 'pipe'},
        );

        const metaPath = path.join(dir, 'desktop-update-meta-1.2.14.json');
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        assert.equal(meta.update_kind, 'patch');
        assert.equal(meta.changed_files, 1);
        assert.equal(meta.patch_file, 'go2rtc.Camera.Wall.Patch.1.2.13-1.2.14.zip');
        assert.ok(meta.patch_sha256);

        const zipPath = path.join(dir, meta.patch_file);
        assert.ok(fs.existsSync(zipPath), `expected patch zip at ${zipPath}`);

        execFileSync(
            process.execPath,
            [VALIDATE, '--meta', metaPath, '--from-manifest', fromManifest, '--to-manifest', toManifest, '--out-dir', dir],
            {stdio: 'pipe'},
        );
    });

    it('selects full update when branded exe changes', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-build-'));
        const rootDir = path.join(dir, 'unpacked');
        fs.mkdirSync(rootDir, {recursive: true});
        const exePath = path.join(rootDir, 'go2rtc Camera Wall.exe');
        fs.writeFileSync(exePath, 'exe-v1');
        const fromHash = sha256File(exePath);

        const fromManifest = path.join(dir, 'from.json');
        const toManifest = path.join(dir, 'to.json');
        writeJson(fromManifest, {
            version: '1.2.13',
            files: [{path: 'go2rtc Camera Wall.exe', sha256: fromHash.sha256, size: fromHash.size}],
        });

        fs.writeFileSync(exePath, 'exe-v2-changed');
        const toHash = sha256File(exePath);
        writeJson(toManifest, {
            version: '1.2.14',
            files: [{path: 'go2rtc Camera Wall.exe', sha256: toHash.sha256, size: toHash.size}],
        });

        execFileSync(
            process.execPath,
            [BUILD_PATCH, '--root', rootDir, '--from-manifest', fromManifest, '--to-manifest', toManifest, '--out-dir', dir],
            {stdio: 'pipe'},
        );

        const meta = JSON.parse(fs.readFileSync(path.join(dir, 'desktop-update-meta-1.2.14.json'), 'utf8'));
        assert.equal(meta.update_kind, 'full');
        assert.equal(meta.changed_files, 1);
        assert.equal(meta.patch_file, '');
    });
});
