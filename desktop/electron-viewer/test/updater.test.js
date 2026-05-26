const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('updater module wiring', () => {
    it('exports update flow helpers', () => {
        const updater = require('../updater');
        assert.equal(typeof updater.checkForUpdates, 'function');
        assert.equal(typeof updater.runUpdateFlow, 'function');
        assert.equal(typeof updater.downloadInstaller, 'function');
    });

    it('main.js references updater', () => {
        const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
        assert.match(main, /require\('\.\/updater'\)/);
        assert.match(main, /Check for updates/);
        assert.match(main, /scheduleUpdateCheck/);
    });

    it('recreates main window before destroying the old one', () => {
        const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
        assert.match(main, /async function applyMainWindowAfterSettings/);
        assert.doesNotMatch(main, /mainWindow\?\.destroy\(\);\s*\n\s*mainWindow = null;\s*\n\s*createMainWindow/s);
    });
});
