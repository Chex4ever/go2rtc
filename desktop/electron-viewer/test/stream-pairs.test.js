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

describe('layout stream partition', () => {
    it('isLayoutPreviewStream detects _sub and paired names', async () => {
        const {isLayoutPreviewStream} = await loadStreamPairs();
        const streams = ['kitchen', 'kitchen_sub', 'garage', 'dvr_ch1', 'dvr_ch102'];
        assert.equal(isLayoutPreviewStream('kitchen_sub', streams), true);
        assert.equal(isLayoutPreviewStream('dvr_ch102', streams), true);
        assert.equal(isLayoutPreviewStream('kitchen', streams), false);
        assert.equal(isLayoutPreviewStream('garage', streams), false);
    });

    it('partitionLayoutStreams splits mains and previews', async () => {
        const {partitionLayoutStreams} = await loadStreamPairs();
        const {mains, previews} = partitionLayoutStreams(['kitchen', 'kitchen_sub', 'garage']);
        assert.deepEqual(mains, ['kitchen', 'garage']);
        assert.deepEqual(previews, ['kitchen_sub']);
    });

    it('select all mains skips sub streams', async () => {
        const {partitionLayoutStreams} = await loadStreamPairs();
        const streams = ['a', 'a_sub', 'b', 'b_sub', 'c'];
        const {mains} = partitionLayoutStreams(streams);
        assert.equal(mains.length, 3);
        assert.ok(!mains.includes('a_sub'));
    });
});
