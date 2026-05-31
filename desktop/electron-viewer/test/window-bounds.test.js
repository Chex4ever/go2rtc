const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const bounds = require('../window-bounds');

const PRIMARY = [{workArea: {x: 0, y: 0, width: 1920, height: 1040}}];
const SECONDARY = [
    {workArea: {x: 0, y: 0, width: 1920, height: 1040}},
    {workArea: {x: 1920, y: 0, width: 1920, height: 1080}},
];

describe('window-bounds', () => {
    it('normalizes valid bounds', () => {
        assert.deepEqual(bounds.normalizeWindowBounds({x: 100.4, y: 50.6, width: 1360, height: 860}), {
            x: 100,
            y: 51,
            width: 1360,
            height: 860,
        });
    });

    it('rejects too-small windows', () => {
        assert.equal(bounds.normalizeWindowBounds({x: 0, y: 0, width: 200, height: 860}), null);
    });

    it('accepts bounds on a visible display', () => {
        const b = {x: 1950, y: 40, width: 1360, height: 860};
        assert.equal(bounds.isBoundsOnVisibleDisplay(b, SECONDARY), true);
        assert.deepEqual(bounds.resolveWindowBounds(b, SECONDARY), b);
    });

    it('rejects bounds on a disconnected monitor', () => {
        const b = {x: 4000, y: 40, width: 1360, height: 860};
        assert.equal(bounds.isBoundsOnVisibleDisplay(b, PRIMARY), false);
        assert.equal(bounds.resolveWindowBounds(b, PRIMARY), null);
    });
});
