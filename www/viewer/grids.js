/** Grid presets: tile count → columns × rows */
export const GRID_PRESETS = {
    6: {cols: 3, rows: 2},
    7: {cols: 4, rows: 2},
    25: {cols: 5, rows: 5},
    36: {cols: 6, rows: 6},
};

/** @typedef {'preview' | 'main'} TileViewMode */

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

/**
 * Tile viewport settings for preview (grid) or main (fullscreen) channel.
 * @param {object|string|null} slot
 * @param {TileViewMode} [mode]
 * @returns {object|null}
 */
export function slotView(slot, mode = 'preview') {
    if (!slot || typeof slot === 'string') {
        return null;
    }
    if (mode === 'main') {
        return slot.viewMain || slot.view || null;
    }
    return slot.view || null;
}

/**
 * @param {Array} slots
 * @param {number} index
 * @param {object|null} view
 * @param {TileViewMode} [mode]
 */
export function setSlotView(slots, index, view, mode = 'preview') {
    const stream = slotStream(slots[index]);
    if (!stream) {
        return;
    }

    const prev = slots[index];
    const next =
        typeof prev === 'object' && prev !== null && prev.stream ? {...prev, stream} : {stream};

    if (mode === 'main') {
        if (view) {
            next.viewMain = view;
        } else {
            delete next.viewMain;
        }
    } else if (view) {
        next.view = view;
    } else {
        delete next.view;
    }

    if (!next.view && !next.viewMain) {
        slots[index] = stream;
    } else {
        slots[index] = next;
    }
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
                const hasView = t.view && typeof t.view === 'object';
                const hasViewMain = t.viewMain && typeof t.viewMain === 'object';
                if (hasView || hasViewMain) {
                    const entry = {stream: t.stream};
                    if (hasView) {
                        entry.view = t.view;
                    }
                    if (hasViewMain) {
                        entry.viewMain = t.viewMain;
                    }
                    slots[i] = entry;
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
        const previewView =
            typeof slots[i] === 'object' && slots[i]?.view ? slots[i].view : null;
        const mainView =
            typeof slots[i] === 'object' && slots[i]?.viewMain ? slots[i].viewMain : null;
        if (previewView) {
            tile.view = previewView;
        }
        if (mainView) {
            tile.viewMain = mainView;
        }
        tiles.push(tile);
    }
    return tiles;
}
