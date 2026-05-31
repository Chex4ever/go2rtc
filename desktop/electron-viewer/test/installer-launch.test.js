const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {
    silentInstallArgs,
    buildUpdatePs1,
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

    it('builds update ps1 that waits for app exit before install', () => {
        const script = buildUpdatePs1({
            installerPath: 'C:\\Temp\\setup.exe',
            installDir: 'C:\\Program Files\\App',
            parentPid: 4242,
            logPath: 'C:\\Temp\\go2rtc-viewer-update.log',
            appExePath: 'C:\\Program Files\\App\\go2rtc Camera Wall.exe',
        });
        assert.match(script, /pidToWait = 4242/);
        assert.match(script, /setup\.exe/);
        assert.match(script, /'\/S'/);
        assert.match(script, /'\/D=C:\\Program Files\\App'/);
        assert.match(script, /Start-Sleep -Seconds 2/);
        assert.match(script, /Relaunching app/);
        assert.match(script, /go2rtc Camera Wall\.exe/);
    });

    it('quotes paths with spaces', () => {
        assert.equal(quoteCmdArg('C:\\Program Files\\a.exe'), '"C:\\Program Files\\a.exe"');
        assert.equal(psSingleQuote("C:\\a'b.exe"), "'C:\\a''b.exe'");
    });
});
