const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
    extractChangelogSection,
    collectReleaseAssets,
    buildReleaseNotes,
} = require('../../../scripts/generate-release-notes.mjs');

const CHANGELOG = path.join(__dirname, '..', '..', '..', 'docs', 'CHANGELOG_VIEWER.md');

describe('generate-release-notes', () => {
    it('extracts changelog section for version', () => {
        const body = extractChangelogSection(CHANGELOG, '1.2.34');
        assert.match(body, /Fullscreen focus/);
        assert.doesNotMatch(body, /^## 1\.2\.33/m);
    });

    it('builds assets table with CRC32 and SHA-256 columns', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rel-notes-'));
        const bin = path.join(dir, 'go2rtc_1.0.0_windows_amd64.exe');
        fs.writeFileSync(bin, Buffer.alloc(2048, 1));
        fs.writeFileSync(`${bin}.sha256`, 'abc123\n');

        const assets = collectReleaseAssets(dir);
        assert.equal(assets.downloads.length, 1);
        assert.equal(assets.downloads[0].sha256, 'abc123');
        assert.match(assets.downloads[0].crc32, /^[0-9A-F]{8}$/);

        const notes = buildReleaseNotes(
            {
                version: '1.0.0',
                tag: 'v1.0.0',
                changelog: CHANGELOG,
                repo: 'test/repo',
            },
            assets,
        );
        assert.match(notes, /\| File \| Size \| CRC32 \| SHA-256 \|/);
        assert.match(notes, /go2rtc_1\.0\.0_windows_amd64\.exe/);
        assert.doesNotMatch(notes, /\.sha256`/);
    });

    it('excludes sidecar sha256 files from downloads table', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rel-notes-'));
        fs.writeFileSync(path.join(dir, 'go2rtc-updater.exe'), 'x');
        fs.writeFileSync(path.join(dir, 'go2rtc-updater.exe.sha256'), 'deadbeef');

        const assets = collectReleaseAssets(dir);
        assert.equal(assets.downloads.length, 1);
        assert.equal(assets.downloads[0].name, 'go2rtc-updater.exe');
    });
});
