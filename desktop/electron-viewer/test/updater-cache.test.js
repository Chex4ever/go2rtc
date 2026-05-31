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

    it('does not delete a newer cached installer while upgrade is pending', () => {
        const dir = cache.updatesDir();
        const oldFile = path.join(dir, '1.2.22-full-old.exe');
        const newFile = path.join(dir, '1.2.23-full-new.exe');
        fs.writeFileSync(oldFile, 'old');
        fs.writeFileSync(newFile, 'new');
        cache.writePendingUpdate({version: '1.2.23', kind: 'full', path: newFile});

        cache.cleanupAfterSuccessfulUpdate('1.2.22');

        assert.equal(fs.existsSync(newFile), true);
        assert.equal(cache.readPendingUpdate()?.version, '1.2.23');
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

    it('resolveLocalArtifact reuses pending file when URL changes', () => {
        const bytes = 'cached-installer';
        const dest = cache.artifactPath('1.2.19', 'full', 'https://example.test/old-url.exe');
        fs.mkdirSync(path.dirname(dest), {recursive: true});
        fs.writeFileSync(dest, bytes);
        cache.writePendingUpdate({
            version: '1.2.19',
            kind: 'full',
            path: dest,
        });

        const resolved = cache.resolveLocalArtifact(
            {
                version: '1.2.19',
                downloadUrl: 'https://example.test/new-url.exe',
                updateKind: 'full',
            },
            '1.2.18',
        );
        assert.ok(resolved);
        assert.equal(resolved.path, dest);
    });

    it('appends update log lines', () => {
        cache.logUpdate('test event', {ok: true});
        const text = fs.readFileSync(cache.updateLogFile(), 'utf8');
        assert.match(text, /test event/);
        assert.match(text, /"ok":true/);
    });

    it('limits startup install retries and cooldown', () => {
        const pending = {version: '1.2.26', path: 'C:\\Temp\\setup.exe'};
        assert.equal(cache.shouldRunStartupInstall(pending, '1.2.25').ok, true);
        cache.recordInstallAttempt(pending, 'startup');
        assert.equal(cache.shouldRunStartupInstall(pending, '1.2.25').reason, 'cooldown');
        cache.writeInstallState({
            version: '1.2.26',
            startupAttempts: 3,
            lastAttemptAt: new Date(Date.now() - 200000).toISOString(),
        });
        assert.equal(cache.shouldRunStartupInstall(pending, '1.2.25').reason, 'max_attempts');
    });

    it('does not count user install attempts toward startup retry limit', () => {
        const pending = {version: '1.2.27', path: 'C:\\Temp\\setup.exe'};
        cache.recordInstallAttempt(pending, 'user');
        cache.recordInstallAttempt(pending, 'user');
        assert.equal(cache.readInstallState()?.startupAttempts || 0, 0);
        cache.writeInstallState({
            version: '1.2.27',
            startupAttempts: 3,
            lastAttemptAt: new Date(Date.now() - 200000).toISOString(),
        });
        cache.recordInstallAttempt(pending, 'user');
        assert.equal(cache.readInstallState()?.startupAttempts, 0);
        assert.equal(cache.shouldRunStartupInstall(pending, '1.2.26').ok, false);
        assert.equal(cache.shouldRunStartupInstall(pending, '1.2.26').reason, 'cooldown');
    });

    it('clears stale install lock on startup when update still pending', () => {
        const pending = {version: '1.2.30', path: 'C:\\Temp\\setup.exe'};
        cache.writePendingUpdate({...pending, kind: 'full', sha256: ''});
        fs.writeFileSync(
            cache.installLockFile(),
            JSON.stringify(
                {
                    version: pending.version,
                    kind: 'full',
                    path: pending.path,
                    startedAt: new Date(Date.now() - 15000).toISOString(),
                },
                null,
                2,
            ),
            'utf8',
        );
        cache.reconcileInstallLockOnStartup('1.2.27');
        assert.equal(cache.readInstallLock(), null);
        assert.equal(cache.readPendingUpdate()?.version, '1.2.30');
    });

    it('keeps newer cached installer even without pending metadata', () => {
        const dir = cache.updatesDir();
        const oldFile = path.join(dir, '1.2.26-full-old.exe');
        const newFile = path.join(dir, '1.2.27-full-new.exe');
        fs.writeFileSync(oldFile, 'old');
        fs.writeFileSync(newFile, 'new');

        cache.cleanupOldUpdates('1.2.26');

        assert.equal(fs.existsSync(oldFile), true);
        assert.equal(fs.existsSync(newFile), true);
    });

    it('abandon keeps pending installer on disk', () => {
        const dir = cache.updatesDir();
        const installer = path.join(dir, '1.2.27-full-new.exe');
        fs.writeFileSync(installer, 'new');
        cache.writePendingUpdate({version: '1.2.27', kind: 'full', path: installer});

        cache.abandonPendingInstall('max_startup_attempts', {currentVersion: '1.2.26'});

        assert.equal(fs.existsSync(installer), true);
        assert.equal(cache.readPendingUpdate()?.version, '1.2.27');
        assert.equal(cache.readInstallState(), null);
    });

    it('blocks startup install while helper lock is active', () => {
        const pending = {version: '1.2.27', path: 'C:\\Temp\\setup.exe'};
        cache.writeInstallLock({version: '1.2.27', kind: 'full', path: pending.path});
        assert.equal(cache.shouldRunStartupInstall(pending, '1.2.26').reason, 'install_in_progress');
    });

    it('clears stale pending when app is already at pending version', () => {
        cache.writePendingUpdate({version: '1.2.26', kind: 'full', path: 'C:\\Temp\\setup.exe'});
        cache.writeInstallState({version: '1.2.26', attempts: 1});
        const pending = cache.readPendingUpdate();
        const gate = cache.shouldRunStartupInstall(pending, '1.2.26');
        assert.equal(gate.ok, false);
        assert.equal(gate.reason, 'already_installed');
        assert.equal(cache.readPendingUpdate(), null);
        assert.equal(cache.readInstallState(), null);
    });

    it('clears older pending after manual install to a newer version', () => {
        cache.writePendingUpdate({version: '1.2.25', kind: 'full', path: 'C:\\Temp\\old.exe'});
        const pending = cache.readPendingUpdate();
        const gate = cache.shouldRunStartupInstall(pending, '1.2.26');
        assert.equal(gate.reason, 'already_installed');
        assert.equal(cache.readPendingUpdate(), null);
    });
});
