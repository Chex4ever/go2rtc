/**
 * Persist main window position/size so the app reopens on the same monitor.
 * @param {object | null | undefined} raw
 * @returns {{x:number,y:number,width:number,height:number} | null}
 */
function normalizeWindowBounds(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const x = Number(raw.x);
    const y = Number(raw.y);
    const width = Number(raw.width);
    const height = Number(raw.height);
    if (![x, y, width, height].every(Number.isFinite)) {
        return null;
    }
    if (width < 400 || height < 300) {
        return null;
    }
    return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
    };
}

/**
 * @param {{x:number,y:number,width:number,height:number}} bounds
 * @param {Array<{workArea:{x:number,y:number,width:number,height:number}}>} displays
 * @returns {boolean}
 */
function isBoundsOnVisibleDisplay(bounds, displays) {
    if (!bounds || !Array.isArray(displays) || !displays.length) {
        return false;
    }
    const minVisible = 80;
    for (const display of displays) {
        const area = display.workArea || display.bounds;
        if (!area) {
            continue;
        }
        const overlapW =
            Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
        const overlapH =
            Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
        if (overlapW >= minVisible && overlapH >= minVisible) {
            return true;
        }
    }
    return false;
}

/**
 * @param {{x:number,y:number,width:number,height:number} | null | undefined} bounds
 * @param {Array<{workArea:{x:number,y:number,width:number,height:number}}>} displays
 * @returns {{x:number,y:number,width:number,height:number} | null}
 */
function resolveWindowBounds(bounds, displays) {
    const normalized = normalizeWindowBounds(bounds);
    if (!normalized) {
        return null;
    }
    return isBoundsOnVisibleDisplay(normalized, displays) ? normalized : null;
}

module.exports = {
    normalizeWindowBounds,
    isBoundsOnVisibleDisplay,
    resolveWindowBounds,
};
