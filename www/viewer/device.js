/** @returns {'mobile'|'tablet'|'desktop'} */
export function wallLayoutMode() {
    if (window.matchMedia('(max-width: 767px)').matches) {
        return 'mobile';
    }
    if (window.matchMedia('(max-width: 1024px)').matches) {
        return 'tablet';
    }
    return 'desktop';
}

export function isTouchDevice() {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

/** Tablet: at most 2 columns, scroll vertically. */
export function tabletGrid(preset) {
    const total = preset.cols * preset.rows;
    const cols = Math.min(2, preset.cols);
    return {cols, rows: Math.ceil(total / cols), total};
}

export function allowTileDrag() {
    return wallLayoutMode() === 'desktop';
}
