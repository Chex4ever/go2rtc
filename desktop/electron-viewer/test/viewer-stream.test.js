const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const VIEWER_STREAM = path.join(__dirname, '..', '..', '..', 'www', 'viewer', 'viewer-stream.js');

describe('viewer-stream.js', () => {
    it('disables intersection lazy disconnect for multi-tile wall', () => {
        const src = fs.readFileSync(VIEWER_STREAM, 'utf8');
        assert.match(src, /visibilityThreshold\s*=\s*0/);
        assert.match(src, /forceDisconnect/);
        assert.match(src, /getDebugSnapshot/);
        assert.match(src, /_logDebug/);
    });
});
