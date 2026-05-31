const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {slotsFromLayout, tilesFromSlots, slotStream, slotView, setSlotView} = require('../../../www/viewer/grids.js');

describe('grids tile view persistence', () => {
    it('loads and saves view settings per tile', () => {
        const layout = {
            grid: 6,
            cameras: ['cam1', 'cam2'],
            tiles: [
                {
                    stream: 'cam1',
                    x: 0,
                    y: 0,
                    w: 1,
                    h: 1,
                    view: {fit: 'cover', scale: 1.4, tx: 10, ty: -4, widthScale: 1.15},
                },
            ],
        };
        const slots = slotsFromLayout(layout);
        assert.equal(slotStream(slots[0]), 'cam1');
        assert.deepEqual(slotView(slots[0]), layout.tiles[0].view);

        setSlotView(slots, 0, {fit: 'fill', scale: 2, tx: 0, ty: 0, widthScale: 0.9});
        const tiles = tilesFromSlots(slots, 3);
        assert.equal(tiles[0].stream, 'cam1');
        assert.deepEqual(tiles[0].view, {fit: 'fill', scale: 2, tx: 0, ty: 0, widthScale: 0.9});
    });
});
