const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {
    compareSemver,
    normalizeUpdateInfo,
    normalizeGo2rtcUpdateInfo,
    isNewerVersion,
    updateCheckUrls,
    go2rtcUpdateUrls,
} = require('../updater-core');

describe('compareSemver', () => {
    it('orders versions', () => {
        assert.equal(compareSemver('1.2.0', '1.1.9'), 1);
        assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
        assert.equal(compareSemver('1.0', '1.0.1'), -1);
    });
});

describe('normalizeUpdateInfo', () => {
    it('parses API shape', () => {
        const info = normalizeUpdateInfo(
            {
                version: '2.0.0',
                download_url: '/api/viewer/desktop/download',
                notes: 'Hi',
            },
            'http://192.168.1.10:1984',
            'win32',
        );
        assert.equal(info.version, '2.0.0');
        assert.equal(info.downloadUrl, 'http://192.168.1.10:1984/api/viewer/desktop/download');
    });

    it('parses static update.json windows block', () => {
        const info = normalizeUpdateInfo(
            {
                version: '1.2.0',
                windows: {url: '/viewer/desktop/setup.exe'},
            },
            'http://127.0.0.1:1984',
            'win32',
        );
        assert.match(info.downloadUrl, /setup\.exe$/);
    });
});

describe('isNewerVersion', () => {
    it('detects newer remote', () => {
        assert.equal(isNewerVersion('1.2.0', '1.1.0'), true);
        assert.equal(isNewerVersion('1.1.0', '1.1.0'), false);
    });
});

describe('updateCheckUrls', () => {
    it('uses configured server host', () => {
        const urls = updateCheckUrls('192.168.1.5:1984');
        assert.match(urls[0], /^http:\/\/192\.168\.1\.5:1984\/api\/viewer\/desktop\/update/);
        assert.match(urls[1], /\/viewer\/desktop\/update\.json$/);
    });
});

describe('go2rtc update', () => {
    it('parses API shape with running_version', () => {
        const info = normalizeGo2rtcUpdateInfo(
            {
                version: '2.0.0',
                running_version: '1.9.0',
                download_url: 'https://github.com/example/dl.exe',
                source: 'github',
            },
            'http://127.0.0.1:1984',
            'win32',
        );
        assert.equal(info.version, '2.0.0');
        assert.equal(info.runningVersion, '1.9.0');
        assert.match(info.downloadUrl, /^https:/);
    });

    it('go2rtcUpdateUrls', () => {
        const urls = go2rtcUpdateUrls('http://10.0.0.5:1984');
        assert.match(urls[0], /\/api\/viewer\/go2rtc\/update/);
    });
});

describe('normalizeUpdateInfo edge cases', () => {
    it('returns null without version', () => {
        assert.equal(normalizeUpdateInfo({windows: {url: '/a.exe'}}, 'http://x', 'win32'), null);
    });

    it('returns null for win32 without windows url', () => {
        assert.equal(normalizeUpdateInfo({version: '1.0.0'}, 'http://x', 'win32'), null);
    });
});
