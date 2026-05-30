const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {
    silentInstallArgs,
    relaunchAfterSilentInstallScript,
    quoteCmdArg,
    psSingleQuote,
} = require('../installer-launch');

describe('installer-launch', () => {
    it('puts /D= last for NSIS', () => {
        const args = silentInstallArgs('C:\\Program Files\\App');
        assert.deepEqual(args, ['/S', '/D=C:\\Program Files\\App']);
        assert.equal(args[args.length - 1], '/D=C:\\Program Files\\App');
    });

    it('silent without dir', () => {
        assert.deepEqual(silentInstallArgs(null), ['/S']);
    });

    it('builds relaunch script that waits for app exit before install', () => {
        const script = relaunchAfterSilentInstallScript(
            'C:\\Temp\\setup.exe',
            'C:\\Program Files\\App\\Camera Wall.exe',
            'C:\\Program Files\\App',
            4242,
        );
        assert.match(script, /Wait-Process -Id 4242/);
        assert.match(script, /setup\.exe/);
        assert.match(script, /\/S/);
        assert.match(script, /Camera Wall\.exe/);
        assert.match(script, /Start-Sleep -Seconds 2/);
    });

    it('quotes paths with spaces', () => {
        assert.equal(quoteCmdArg('C:\\Program Files\\a.exe'), '"C:\\Program Files\\a.exe"');
        assert.equal(psSingleQuote("C:\\a'b.exe"), "'C:\\a''b.exe'");
    });
});
