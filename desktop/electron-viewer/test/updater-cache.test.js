const {describe, it, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cache = require('../updater-cache');

describe('updater-cache', () => {
    /** @type {string} */
    let tempDir;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-update-cache-'));
        cache.setUserDataPath(() => tempDir);
    });

    afterEach(() => {
        cache.setUserDataPath(() => path.join(process.cwd(), '.update-cache-test'));
        fs.rmSync(tempDir, {recursive: true, force: true});
    });

    it('writes pending update and reuses verified artifact', () => {
        const bytes = 'installer-bytes';
        const dest = cache.artifactPath('1.2.17', 'full', 'https://example.test/go2rtc.Camera.Wall.Setup.1.2.17.exe');
        fs.mkdirSync(path.dirname(dest), {recursive: true});
        fs.writeFileSync(dest, bytes);
        const digest = require('crypto').createHash('sha256').update(bytes).digest('hex');
        const info = {
            version: '1.2.17',
            downloadUrl: 'https://example.test/go2rtc.Camera.Wall.Setup.1.2.17.exe',
            sha256: digest,
            updateKind: 'full',
        };

        cache.rememberPendingUpdate(info, dest);
        const pending = cache.readPendingUpdate();
        assert.equal(pending.version, '1.2.17');
        assert.equal(pending.path, dest);

        const found = cache.findCachedArtifact(info);
        assert.ok(found);
        assert.equal(found.path, dest);
    });

    it('cleans old cached files after successful update', () => {
        const dir = cache.updatesDir();
        fs.writeFileSync(path.join(dir, '1.2.16-full-old.exe'), 'old');
        fs.writeFileSync(path.join(dir, '1.2.17-full-new.exe'), 'new');
        cache.writePendingUpdate({version: '1.2.17', kind: 'full', path: path.join(dir, '1.2.17-full-new.exe')});

        cache.cleanupAfterSuccessfulUpdate('1.2.17');

        assert.equal(fs.existsSync(path.join(dir, '1.2.16-full-old.exe')), false);
        assert.equal(fs.existsSync(path.join(dir, '1.2.17-full-new.exe')), true);
        assert.equal(cache.readPendingUpdate(), null);
    });

    it('appends update log lines', () => {
        cache.logUpdate('test event', {ok: true});
        const text = fs.readFileSync(cache.updateLogFile(), 'utf8');
        assert.match(text, /test event/);
        assert.match(text, /"ok":true/);
    });
});
