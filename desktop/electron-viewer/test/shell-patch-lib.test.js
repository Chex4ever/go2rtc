const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    diffManifests,
    shouldUseFullUpdate,
    patchZipName,
    buildManifest,
} = require('../shell-patch-lib');

describe('shell-patch-lib', () => {
    it('diffManifests finds changed files', () => {
        const prev = {
            version: '1.2.10',
            files: [
                {path: 'resources/app.asar', sha256: 'aaa', size: 100},
                {path: 'go2rtc Camera Wall.exe', sha256: 'bbb', size: 200},
            ],
        };
        const curr = {
            version: '1.2.11',
            files: [
                {path: 'resources/app.asar', sha256: 'ccc', size: 110},
                {path: 'go2rtc Camera Wall.exe', sha256: 'bbb', size: 200},
            ],
        };
        const diff = diffManifests(prev, curr);
        assert.equal(diff.changed.length, 1);
        assert.equal(diff.changed[0].path, 'resources/app.asar');
    });

    it('shouldUseFullUpdate when electron.exe changes', () => {
        const diff = {
            changed: [{path: 'electron.exe'}],
            changedBytes: 1000,
            totalBytes: 2000,
        };
        assert.equal(shouldUseFullUpdate(diff), true);
    });

    it('shouldUseFullUpdate when byte ratio exceeds threshold', () => {
        const diff = {
            changed: [{path: 'resources/app.asar'}],
            changedBytes: 900,
            totalBytes: 1000,
        };
        assert.equal(shouldUseFullUpdate(diff), true);
    });

    it('patchZipName follows convention', () => {
        assert.equal(patchZipName('1.2.10', '1.2.11'), 'go2rtc.Camera.Wall.Patch.1.2.10-1.2.11.zip');
    });

    it('buildManifest walks unpacked tree', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-manifest-'));
        fs.mkdirSync(path.join(root, 'resources'), {recursive: true});
        fs.writeFileSync(path.join(root, 'resources', 'app.asar'), 'hello');
        const manifest = await buildManifest('1.0.0', root);
        assert.equal(manifest.version, '1.0.0');
        assert.equal(manifest.files.length, 1);
        assert.equal(manifest.files[0].path, 'resources/app.asar');
        fs.rmSync(root, {recursive: true, force: true});
    });
});
