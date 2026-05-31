const {describe, it} = require('node:test');
const assert = require('node:assert/strict');

describe('TileViewport width scale', () => {
    it('stores widthScale in JSON', async () => {
        global.document = {
            createElement() {
                return {
                    className: '',
                    style: {},
                    innerHTML: '',
                    appendChild() {},
                    addEventListener() {},
                    removeEventListener() {},
                };
            },
        };

        const {TileViewport} = await import('../../../www/viewer/tile-viewport.js');
        const container = {
            innerHTML: '',
            addEventListener() {},
            appendChild() {},
            removeEventListener() {},
        };
        const vp = new TileViewport(container);
        vp.widthScale = 1.15;
        vp.scale = 1.2;
        vp.tx = 3;
        vp.ty = 4;
        vp.fitIndex = 2;

        const json = vp.toJSON();
        assert.equal(json.widthScale, 1.15);
        assert.equal(json.fit, 'fill');
        assert.equal(json.scale, 1.2);

        vp.fromJSON({fit: 'cover', scale: 1.1, tx: 1, ty: 2, widthScale: 0.9});
        assert.equal(vp.widthScale, 0.9);
        assert.equal(vp.fitIndex, 1);
    });
});
