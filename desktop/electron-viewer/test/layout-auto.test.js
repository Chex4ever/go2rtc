const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function loadLayoutAuto() {
    const modPath = path.join(__dirname, '..', '..', '..', 'www', 'viewer', 'layout-auto.js');
    return import(pathToFileURL(modPath).href);
}

describe('pickAutoLayoutId', () => {
    it('returns empty when autoOpen disabled', async () => {
        const {pickAutoLayoutId} = await loadLayoutAuto();
        assert.equal(
            pickAutoLayoutId({
                layouts: [{id: 'wall'}],
                user: 'op',
                autoOpen: false,
            }),
            '',
        );
    });

    it('prefers defaultLayoutId when allowed', async () => {
        const {pickAutoLayoutId} = await loadLayoutAuto();
        assert.equal(
            pickAutoLayoutId({
                layouts: [{id: 'a'}, {id: 'wall_25'}],
                user: 'op',
                defaultLayoutId: 'wall_25',
            }),
            'wall_25',
        );
    });

    it('uses stored last layout', async () => {
        const {pickAutoLayoutId} = await loadLayoutAuto();
        assert.equal(
            pickAutoLayoutId({
                layouts: [{id: 'wall_6'}, {id: 'wall_25'}],
                user: 'op',
                storedLayoutId: 'wall_6',
            }),
            'wall_6',
        );
    });

    it('falls back to first layout', async () => {
        const {pickAutoLayoutId} = await loadLayoutAuto();
        assert.equal(
            pickAutoLayoutId({
                layouts: [{id: 'first'}, {id: 'second'}],
                user: 'x',
                defaultLayoutId: 'missing',
            }),
            'first',
        );
    });
});
