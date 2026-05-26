/**
 * Zero-click morning start: session restored → open wall without layout picker.
 * Pure logic for tests; keep in sync with enterAfterAuth() in viewer-session.js.
 */
import {pickAutoLayoutId, readAutoOpenPref, defaultLayoutFromUrl} from './layout-auto.js';

/** @typedef {'picker' | 'open'} MorningStartAction */

/**
 * @param {{ layouts: {id: string}[], user: string, defaultLayoutId?: string, autoOpen?: boolean | null }} opts
 * @returns {{ action: 'picker' } | { action: 'open', layoutId: string }}
 */
export function planMorningStart(opts) {
    const layouts = opts.layouts || [];
    const autoOpen = opts.autoOpen ?? readAutoOpenPref();

    if (!layouts.length || autoOpen === false) {
        return {action: 'picker'};
    }

    const layoutId = pickAutoLayoutId({
        layouts,
        user: opts.user,
        defaultLayoutId: opts.defaultLayoutId ?? defaultLayoutFromUrl(),
        storedLayoutId: opts.storedLayoutId,
        autoOpen: true,
    });

    if (!layoutId) {
        return {action: 'picker'};
    }

    return {action: 'open', layoutId};
}
