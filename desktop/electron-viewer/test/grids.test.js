const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {slotsFromLayout, tilesFromSlots, slotStream, slotView, setSlotView, mergeLayoutCamerasIntoSlots} = require('../../../www/viewer/grids.js');

describe('grids tile view persistence', () => {
    it('loads and saves preview view settings per tile', () => {
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
        assert.deepEqual(slotView(slots[0], 'preview'), layout.tiles[0].view);
        assert.equal(slotView(slots[0], 'main'), layout.tiles[0].view);

        setSlotView(slots, 0, {fit: 'fill', scale: 2, tx: 0, ty: 0, widthScale: 0.9}, 'preview');
        const tiles = tilesFromSlots(slots, 3);
        assert.equal(tiles[0].stream, 'cam1');
        assert.deepEqual(tiles[0].view, {fit: 'fill', scale: 2, tx: 0, ty: 0, widthScale: 0.9});
        assert.equal(tiles[0].viewMain, undefined);
    });

    it('keeps preview and main view settings separate', () => {
        const slots = ['cam1', null, null, null, null, null];
        setSlotView(
            slots,
            0,
            {fit: 'contain', scale: 1, tx: 0, ty: 0, widthScale: 1},
            'preview',
        );
        setSlotView(
            slots,
            0,
            {fit: 'cover', scale: 1.5, tx: 5, ty: -3, widthScale: 1.2},
            'main',
        );

        assert.deepEqual(slotView(slots[0], 'preview'), {
            fit: 'contain',
            scale: 1,
            tx: 0,
            ty: 0,
            widthScale: 1,
        });
        assert.deepEqual(slotView(slots[0], 'main'), {
            fit: 'cover',
            scale: 1.5,
            tx: 5,
            ty: -3,
            widthScale: 1.2,
        });

        const tiles = tilesFromSlots(slots, 3);
        assert.deepEqual(tiles[0].view.fit, 'contain');
        assert.deepEqual(tiles[0].viewMain.fit, 'cover');
    });

    it('adds new layout cameras into empty saved tiles', () => {
        const layout = {
            grid: 6,
            cameras: ['cam1', 'cam2', 'cam3'],
            tiles: [{stream: 'cam1', x: 0, y: 0, w: 1, h: 1}],
        };
        const slots = slotsFromLayout(layout);
        assert.equal(slotStream(slots[0]), 'cam1');
        assert.equal(slotStream(slots[1]), 'cam2');
        assert.equal(slotStream(slots[2]), 'cam3');
    });

    it('removes cameras dropped from layout allow-list', () => {
        const slots = ['cam1', 'cam2', null, null, null, null];
        mergeLayoutCamerasIntoSlots(slots, ['cam1']);
        assert.equal(slotStream(slots[0]), 'cam1');
        assert.equal(slotStream(slots[1]), null);
    });
});
