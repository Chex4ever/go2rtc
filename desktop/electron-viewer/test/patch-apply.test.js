const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {buildPatchApplyPs1, patchLogPath} = require('../patch-apply');

describe('patch-apply', () => {
    it('buildPatchApplyPs1 waits, extracts, verifies, relaunches', () => {
        const script = buildPatchApplyPs1({
            patchZip: 'C:\\Temp\\patch.zip',
            installDir: 'C:\\Program Files\\go2rtc Camera Wall',
            appExePath: 'C:\\Program Files\\go2rtc Camera Wall\\go2rtc Camera Wall.exe',
            parentPid: 4242,
            logPath: patchLogPath(4242),
        });
        assert.match(script, /parent PID 4242/);
        assert.match(script, /Expand-Archive/);
        assert.match(script, /patch\.json/);
        assert.match(script, /Start-Process -LiteralPath \$appExe/);
    });
});
