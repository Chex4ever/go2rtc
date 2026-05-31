const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const SETTINGS_APP = path.join(__dirname, '..', '..', '..', 'www', 'settings-app.js');

describe('settings-app.js', () => {
    it('parses as a script (no duplicate const in same scope)', () => {
        const code = fs.readFileSync(SETTINGS_APP, 'utf8');
        assert.doesNotThrow(() => {
            acorn.parse(code, {ecmaVersion: 'latest', sourceType: 'script'});
        });
    });

    it('exports preview stream helper used by config UI', () => {
        const code = fs.readFileSync(SETTINGS_APP, 'utf8');
        assert.match(code, /function suggestPreviewStream/);
    });

    it('wires updater service controls (install/uninstall)', () => {
        const code = fs.readFileSync(SETTINGS_APP, 'utf8');
        assert.match(code, /refreshUpdaterStatus/);
        assert.match(code, /api\/updater\?action=install-updater/);
        assert.match(code, /api\/updater\?action=uninstall-updater/);
        assert.doesNotMatch(code, /pollUpdaterInstallJob/);
        assert.match(code, /UAC prompt \(same as go2rtc service\)/);
    });

    it('uses yaml stream URLs for display and copy (not api redaction)', () => {
        const code = fs.readFileSync(SETTINGS_APP, 'utf8');
        assert.match(code, /function streamConfigUrls/);
        assert.match(code, /function isRedactedUrl/);
        assert.match(code, /data-copy-stream/);
    });
});
