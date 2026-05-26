const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

/** Load ES module stream-pairs.js in Node test runner. */
async function loadStreamPairs() {
    const modPath = path.join(__dirname, '..', '..', '..', 'www', 'viewer', 'stream-pairs.js');
    return import(pathToFileURL(modPath).href);
}

describe('suggestPreviewStream', () => {
    it('finds name_sub', async () => {
        const {suggestPreviewStream} = await loadStreamPairs();
        assert.equal(suggestPreviewStream('cam1', ['cam1', 'cam1_sub']), 'cam1_sub');
    });

    it('finds Hikvision-style suffix', async () => {
        const {suggestPreviewStream} = await loadStreamPairs();
        assert.equal(suggestPreviewStream('dvr_ch1', ['dvr_ch1', 'dvr_ch102']), 'dvr_ch102');
    });

    it('returns null when no match', async () => {
        const {suggestPreviewStream} = await loadStreamPairs();
        assert.equal(suggestPreviewStream('cam1', ['cam1', 'other']), null);
    });
});
