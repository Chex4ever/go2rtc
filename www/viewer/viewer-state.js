import {slotStream} from './grids.js';

export const state = {
    user: null,
    layouts: [],
    currentLayoutId: null,
    layoutDetail: null,
    slots: [],
    saveTimer: null,
    focusSlot: null,
    focusAnimating: false,
    tileViewports: new Map(),
    chromeTimer: null,
    wallLayoutMode: 'desktop',
    wallChromeHidden: false,
    activeTile: null,
    recorders: new Map(),
};

export function stopAllRecordings() {
    for (const [slot, rec] of state.recorders) {
        if (rec.recording) {
            const name = slotStream(state.slots[slot]) || 'recording';
            rec.stop(name).catch(() => {});
        }
    }
    state.recorders.clear();
}
