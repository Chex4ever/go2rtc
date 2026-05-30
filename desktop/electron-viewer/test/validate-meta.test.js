const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {execFileSync} = require('child_process');

const REPO = path.join(__dirname, '..', '..', '..');
const VALIDATE = path.join(REPO, 'scripts', 'validate-desktop-update-meta.mjs');

function writeJson(file, data) {
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

describe('validate-desktop-update-meta.mjs', () => {
    it('accepts viewer-only meta when manifests match', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-val-'));
        const files = [{path: 'resources/app.asar', sha256: 'same', size: 100}];
        const from = path.join(dir, 'from.json');
        const to = path.join(dir, 'to.json');
        const meta = path.join(dir, 'meta.json');
        writeJson(from, {version: '1.2.13', files});
        writeJson(to, {version: '1.2.14', files});
        writeJson(meta, {
            version: '1.2.14',
            from: '1.2.13',
            to: '1.2.14',
            shell_changed: false,
            update_kind: 'none',
            changed_files: 0,
            changed_bytes: 0,
            total_bytes: 100,
            patch_file: '',
            patch_sha256: '',
        });
        execFileSync(process.execPath, [VALIDATE, '--meta', meta, '--from-manifest', from, '--to-manifest', to, '--out-dir', dir], {
            stdio: 'pipe',
        });
    });

    it('rejects fake changed_files zero when shell diff exists', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-val-'));
        const from = path.join(dir, 'from.json');
        const to = path.join(dir, 'to.json');
        const meta = path.join(dir, 'meta.json');
        writeJson(from, {
            version: '1.2.13',
            files: [{path: 'resources/app.asar', sha256: 'aaa', size: 100}],
        });
        writeJson(to, {
            version: '1.2.14',
            files: [{path: 'resources/app.asar', sha256: 'bbb', size: 110}],
        });
        writeJson(meta, {
            version: '1.2.14',
            from: '1.2.13',
            to: '1.2.14',
            shell_changed: true,
            update_kind: 'full',
            changed_files: 0,
            changed_bytes: 0,
            total_bytes: 110,
            patch_file: '',
            patch_sha256: '',
        });
        assert.throws(
            () =>
                execFileSync(
                    process.execPath,
                    [VALIDATE, '--meta', meta, '--from-manifest', from, '--to-manifest', to, '--out-dir', dir],
                    {stdio: 'pipe'},
                ),
            /changed_files=0/,
        );
    });
});
