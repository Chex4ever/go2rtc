const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const core = require('../config-core');

describe('configFromInstallMode', () => {
    it('manual', () => {
        const c = core.configFromInstallMode('manual');
        assert.equal(c.kiosk, false);
        assert.equal(c.autoStart, false);
    });

    it('autostart', () => {
        const c = core.configFromInstallMode('autostart');
        assert.equal(c.kiosk, false);
        assert.equal(c.autoStart, true);
        assert.equal(c.autoOpenLayout, true);
    });

    it('kiosk', () => {
        const c = core.configFromInstallMode('kiosk');
        assert.equal(c.kiosk, true);
        assert.equal(c.autoStart, true);
    });

    it('matches installer JSON shape', () => {
        const json = JSON.parse(core.configToInstallerJson(core.configFromInstallMode('kiosk')));
        assert.equal(json.kiosk, true);
        assert.equal(json.autoStart, true);
        assert.equal(json.checkUpdatesOnStartup, true);
        assert.equal(json.serverUrl, core.DEFAULT_SERVER);
    });
});
