const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {silentInstallArgs} = require('../installer-launch');

describe('installer-launch', () => {
    it('puts /D= last for NSIS', () => {
        const args = silentInstallArgs('C:\\Program Files\\App');
        assert.deepEqual(args, ['/S', '/D=C:\\Program Files\\App']);
        assert.equal(args[args.length - 1], '/D=C:\\Program Files\\App');
    });

    it('silent without dir', () => {
        assert.deepEqual(silentInstallArgs(null), ['/S']);
    });
});
