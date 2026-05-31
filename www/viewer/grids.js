/** Grid presets: tile count → columns × rows */
export const GRID_PRESETS = {
    6: {cols: 3, rows: 2},
    7: {cols: 4, rows: 2},
    25: {cols: 5, rows: 5},
    36: {cols: 6, rows: 6},
};

export function gridSize(grid) {
    const p = GRID_PRESETS[grid];
    return p ? p.cols * p.rows : 0;
}

/** @returns {string|null} */
export function slotStream(slot) {
    if (!slot) {
        return null;
    }
    if (typeof slot === 'string') {
        return slot;
    }
    return slot.stream || null;
}

/** @returns {object|null} */
export function slotView(slot) {
    if (!slot || typeof slot === 'string') {
        return null;
    }
    return slot.view || null;
}

export function setSlotView(slots, index, view) {
    const stream = slotStream(slots[index]);
    if (!stream) {
        return;
    }
    slots[index] = view ? {stream, view} : stream;
}

export function slotsFromLayout(layout) {
    const grid = Number(layout?.grid);
    const preset = GRID_PRESETS[grid];
    if (!preset) {
        return [];
    }
    const total = preset.cols * preset.rows;
    const slots = new Array(total).fill(null);

    if (layout.tiles && layout.tiles.length > 0) {
        for (const t of layout.tiles) {
            const i = t.y * preset.cols + t.x;
            if (i >= 0 && i < total) {
                if (t.view && typeof t.view === 'object') {
                    slots[i] = {stream: t.stream, view: t.view};
                } else {
                    slots[i] = t.stream;
                }
            }
        }
        return slots;
    }

    let i = 0;
    for (const cam of layout.cameras || []) {
        if (i >= total) {
            break;
        }
        slots[i++] = cam;
    }
    return slots;
}

export function tilesFromSlots(slots, cols) {
    const tiles = [];
    for (let i = 0; i < slots.length; i++) {
        const stream = slotStream(slots[i]);
        if (!stream) {
            continue;
        }
        const tile = {
            stream,
            x: i % cols,
            y: Math.floor(i / cols),
            w: 1,
            h: 1,
        };
        const view = slotView(slots[i]);
        if (view) {
            tile.view = view;
        }
        tiles.push(tile);
    }
    return tiles;
}
