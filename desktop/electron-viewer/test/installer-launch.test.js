const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {
    silentInstallArgs,
    relaunchAfterSilentInstallScript,
    quoteCmdArg,
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

    it('builds relaunch batch script', () => {
        const script = relaunchAfterSilentInstallScript(
            'C:\\Temp\\setup.exe',
            'C:\\Program Files\\App\\Camera Wall.exe',
            'C:\\Program Files\\App',
        );
        assert.match(script, /start \/wait "" .*setup\.exe/);
        assert.match(script, /\/S/);
        assert.match(script, /start "" "C:\\Program Files\\App\\Camera Wall.exe"/);
    });

    it('quotes paths with spaces', () => {
        assert.equal(quoteCmdArg('C:\\Program Files\\a.exe'), '"C:\\Program Files\\a.exe"');
    });
});
