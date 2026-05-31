const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const core = require('../config-core');

describe('normalizeServerUrl', () => {
    it('defaults empty to localhost', () => {
        assert.equal(core.normalizeServerUrl(''), core.DEFAULT_SERVER);
    });

    it('adds http scheme', () => {
        assert.equal(core.normalizeServerUrl('192.168.1.10:1984'), 'http://192.168.1.10:1984');
    });

    it('strips trailing slash', () => {
        assert.equal(core.normalizeServerUrl('http://host:1984/'), 'http://host:1984');
    });
});

describe('viewerUrl and adminUrls', () => {
    it('builds viewer path with auto_open', () => {
        assert.equal(
            core.viewerUrl('http://10.0.0.5:1984'),
            'http://10.0.0.5:1984/viewer/?auto_open=1',
        );
    });

    it('adds default_layout query', () => {
        assert.equal(
            core.viewerUrl('http://10.0.0.5:1984', {defaultLayoutId: 'wall_25'}),
            'http://10.0.0.5:1984/viewer/?auto_open=1&default_layout=wall_25',
        );
    });

    it('builds admin links', () => {
        const urls = core.adminUrls('http://10.0.0.5:1984');
        assert.equal(urls.home, 'http://10.0.0.5:1984/');
        assert.equal(urls.config, 'http://10.0.0.5:1984/config.html');
        assert.equal(urls.viewerAdmin, 'http://10.0.0.5:1984/viewer/admin.html');
    });
});

describe('normalizeConfig', () => {
    it('merges branding overlay and flags', () => {
        const cfg = core.normalizeConfig(
            {
                serverUrl: 'http://cam.local:1984',
                kiosk: true,
                branding: {orgName: 'Acme', accentColor: '#ff0000'},
            },
            core.DEFAULT_BRANDING,
        );
        assert.equal(cfg.serverUrl, 'http://cam.local:1984');
        assert.equal(cfg.kiosk, true);
        assert.equal(cfg.branding.orgName, 'Acme');
        assert.equal(cfg.branding.accentColor, '#ff0000');
        assert.equal(cfg.branding.productName, 'Тесла — Camera Wall');
    });

    it('rejects invalid accent color', () => {
        const cfg = core.normalizeConfig(
            {branding: {accentColor: 'red'}},
            core.DEFAULT_BRANDING,
        );
        assert.equal(cfg.branding.accentColor, core.DEFAULT_BRANDING.accentColor);
    });

    it('defaults checkUpdatesOnStartup to true', () => {
        const cfg = core.normalizeConfig({}, core.DEFAULT_BRANDING);
        assert.equal(cfg.checkUpdatesOnStartup, true);
    });

    it('allows disabling checkUpdatesOnStartup', () => {
        const cfg = core.normalizeConfig({checkUpdatesOnStartup: false}, core.DEFAULT_BRANDING);
        assert.equal(cfg.checkUpdatesOnStartup, false);
    });

    it('defaults autoDownloadUpdates to true', () => {
        const cfg = core.normalizeConfig({}, core.DEFAULT_BRANDING);
        assert.equal(cfg.autoDownloadUpdates, true);
    });

    it('allows disabling autoDownloadUpdates', () => {
        const cfg = core.normalizeConfig({autoDownloadUpdates: false}, core.DEFAULT_BRANDING);
        assert.equal(cfg.autoDownloadUpdates, false);
    });

    it('stores normalized windowBounds', () => {
        const cfg = core.normalizeConfig(
            {windowBounds: {x: 10, y: 20, width: 1200, height: 800}},
            core.DEFAULT_BRANDING,
        );
        assert.deepEqual(cfg.windowBounds, {x: 10, y: 20, width: 1200, height: 800});
    });

    it('drops invalid windowBounds', () => {
        const cfg = core.normalizeConfig({windowBounds: {x: 0, y: 0, width: 100, height: 100}}, core.DEFAULT_BRANDING);
        assert.equal(cfg.windowBounds, null);
    });
});

describe('mergeBrandingFromDirs', () => {
    it('prefers branding.json over default.json', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'branding-test-'));
        fs.writeFileSync(
            path.join(tmp, 'default.json'),
            JSON.stringify({windowTitle: 'Default Title'}),
        );
        fs.writeFileSync(
            path.join(tmp, 'branding.json'),
            JSON.stringify({windowTitle: 'Org Title', productName: 'Org App'}),
        );
        const merged = core.mergeBrandingFromDirs(
            core.DEFAULT_BRANDING,
            [tmp],
            (p) => JSON.parse(fs.readFileSync(p, 'utf8')),
        );
        assert.equal(merged.windowTitle, 'Org Title');
        assert.equal(merged.productName, 'Org App');
        fs.rmSync(tmp, {recursive: true, force: true});
    });
});

describe('resolveLogoPath', () => {
    it('finds logo in search dir', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-test-'));
        const logo = path.join(tmp, 'acme.png');
        fs.writeFileSync(logo, 'png');
        const found = core.resolveLogoPath(
            {logoFile: 'acme.png'},
            [tmp],
            (p) => fs.existsSync(p),
        );
        assert.equal(found, logo);
        fs.rmSync(tmp, {recursive: true, force: true});
    });
});

describe('logoDataUrl', () => {
    it('embeds logo as a data URL for remote viewer pages', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-data-test-'));
        const logo = path.join(tmp, 'logo.png');
        fs.writeFileSync(logo, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        const url = core.logoDataUrl(
            {logoFile: 'logo.png'},
            [tmp],
            (p) => fs.existsSync(p),
            (p) => fs.readFileSync(p),
        );
        assert.match(url, /^data:image\/png;base64,/);
        fs.rmSync(tmp, {recursive: true, force: true});
    });
});
