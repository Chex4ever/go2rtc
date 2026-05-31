const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('updater module wiring', () => {
    it('exports update flow helpers', () => {
        const updater = require('../updater');
        assert.equal(typeof updater.checkForUpdates, 'function');
        assert.equal(typeof updater.runManualDesktopUpdateCheck, 'function');
        assert.equal(typeof updater.runBackgroundUpdateCheck, 'function');
        assert.equal(typeof updater.trySilentStartupInstall, 'function');
        assert.equal(typeof updater.downloadInstaller, 'function');
        assert.equal(typeof updater.pendingReadyForInstall, 'function');
    });

    it('main.js uses silent startup install and in-app update events', () => {
        const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
        assert.match(main, /runPendingInstallerManual/);
        assert.match(main, /guardStartupDuringInstall/);
        assert.match(main, /desktop:update-event/);
        assert.match(main, /runBackgroundUpdateCheck/);
        assert.match(main, /app\.exit\(0\)/);
    });

    it('recreates main window before destroying the old one', () => {
        const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
        assert.match(main, /async function applyMainWindowAfterSettings/);
        assert.doesNotMatch(main, /mainWindow\?\.destroy\(\);\s*\n\s*mainWindow = null;\s*\n\s*createMainWindow/s);
    });
});
