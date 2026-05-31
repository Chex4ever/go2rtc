import {$, CHROME_HIDE_MS, TOP_CHROME_AUTO_HIDE_MS, TILE_CHROME_FADE_MS, TILE_CHROME_HIDE_DELAY_MS} from './viewer-dom.js';
import {state} from './viewer-state.js';
import {isTouchDevice} from './device.js';

/** Pointer within this many px from top reveals wall-header + electron-brand-bar. */
export const TOP_CHROME_ZONE_PX = 5;
/** Focus mode: thin strip at top edge for tile back bar + wall header. */
export const TOP_CHROME_FOCUS_ZONE_PX = 5;

const TOP_WALL_CHROME_SELECTOR =
    '.wall-header, #electron-brand-bar, .tile-focus-btn-back, #btn-exit-focus, .wall-header button, .wall-header select';
const TILE_CHROME_SELECTOR = '.tile-bar, .tile-controls';

function syncTopChrome(wall, visible) {
    wall.classList.toggle('show-top-chrome', visible);
    $('#app')?.classList.toggle('show-top-chrome', visible);
}

function scheduleTopChromeHide(wall) {
    clearTimeout(state.chromeTimer);
    state.chromeTimer = setTimeout(() => syncTopChrome(wall, false), TOP_CHROME_AUTO_HIDE_MS);
}

function revealTopChromeOnPointer(wall, atTop) {
    wall.classList.add('chrome-hidden');
    if (atTop) {
        clearTimeout(state.chromeTimer);
        syncTopChrome(wall, true);
        return;
    }
    if (!wall.classList.contains('show-top-chrome')) {
        return;
    }
    scheduleTopChromeHide(wall);
}

export function showFatalError(title, message, hint) {
    if (typeof window.__viewerShowError === 'function') {
        window.__viewerShowError(title, message, hint);
        return;
    }
    const boot = $('#screen-bootstrap');
    if (!boot) {
        return;
    }
    $('#bootstrap-status').textContent = title || 'Cannot start camera wall';
    $('#bootstrap-error').textContent = message || '';
    const hintEl = $('#bootstrap-hint');
    if (hint) {
        hintEl.textContent = hint;
        hintEl.classList.remove('hidden');
    } else {
        hintEl.textContent = '';
        hintEl.classList.add('hidden');
    }
    for (const el of document.querySelectorAll('.screen')) {
        el.classList.toggle('hidden', el.id !== 'screen-bootstrap');
    }
}

export function showScreen(id) {
    for (const el of document.querySelectorAll('.screen')) {
        el.classList.toggle('hidden', el.id !== id);
    }
    if (id === 'screen-wall') {
        startChromeHide();
    } else {
        stopChromeHide();
    }
}

export function startChromeHide() {
    stopChromeHide();
    const wall = $('#screen-wall');
    if (!wall) {
        return;
    }
    wall.classList.remove('chrome-hidden', 'show-top-chrome');
    $('#app')?.classList.remove('show-top-chrome');
    if (state.wallChromeHidden) {
        wall.classList.add('chrome-hidden');
        return;
    }
    state.chromeTimer = setTimeout(() => {
        wall.classList.add('chrome-hidden');
    }, CHROME_HIDE_MS);
}

export function stopChromeHide() {
    clearTimeout(state.chromeTimer);
    const wall = $('#screen-wall');
    wall?.classList.remove('chrome-hidden', 'show-top-chrome');
    $('#app')?.classList.remove('show-top-chrome');
}

/** Keep tile chrome on hover/active; top bars stay edge-revealed only. */
export function bumpChrome() {
    const wall = $('#screen-wall');
    if (!wall || wall.classList.contains('hidden') || state.focusSlot !== null) {
        return;
    }
    wall.classList.add('chrome-hidden');
    syncTopChrome(wall, false);
}

function clearTileChromeTimers() {
    clearTimeout(state.tileChromeHideTimer);
    clearTimeout(state.tileChromeFadeTimer);
    state.tileChromeHideTimer = null;
    state.tileChromeFadeTimer = null;
}

function clearTileChromeClasses(tile) {
    tile?.classList.remove('tile-active', 'tile-chrome-passthrough');
}

/** Hide tile bar + controls with fade; pointer-events pass through during fade. */
export function deactivateTileChrome(tile = state.activeTile) {
    if (!tile?.classList.contains('tile-active')) {
        return;
    }
    clearTileChromeTimers();
    tile.classList.add('tile-chrome-passthrough');
    tile.classList.remove('tile-active');
    state.tileChromeFadeTimer = setTimeout(() => {
        clearTileChromeClasses(tile);
        if (state.activeTile === tile) {
            state.activeTile = null;
        }
        state.tileChromeFadeTimer = null;
    }, TILE_CHROME_FADE_MS);
}

/** Show tile bar + controls after tile click (chrome-hidden grid mode). */
export function activateTileChrome(tile) {
    if (!tile || state.focusSlot !== null) {
        return;
    }
    const wall = $('#screen-wall');
    if (!wall?.classList.contains('chrome-hidden') || wall.classList.contains('focus-mode')) {
        return;
    }

    if (state.activeTile && state.activeTile !== tile) {
        clearTileChromeTimers();
        clearTileChromeClasses(state.activeTile);
        state.activeTile = null;
    }

    clearTileChromeTimers();
    state.activeTile = tile;
    tile.classList.add('tile-active', 'tile-chrome-passthrough');
    state.tileChromeFadeTimer = setTimeout(() => {
        if (state.activeTile === tile) {
            tile.classList.remove('tile-chrome-passthrough');
        }
        state.tileChromeFadeTimer = null;
    }, TILE_CHROME_FADE_MS);
    scheduleTileChromeHide(tile);
}

export function scheduleTileChromeHide(tile) {
    if (!tile || state.activeTile !== tile) {
        return;
    }
    clearTimeout(state.tileChromeHideTimer);
    state.tileChromeHideTimer = setTimeout(() => {
        state.tileChromeHideTimer = null;
        if (state.activeTile === tile) {
            deactivateTileChrome(tile);
        }
    }, TILE_CHROME_HIDE_DELAY_MS);
}

export function cancelTileChromeHide() {
    clearTimeout(state.tileChromeHideTimer);
    state.tileChromeHideTimer = null;
}

function isWithinSameTileChrome(related, tile) {
    return related?.closest?.('.tile-bar, .tile-controls') && tile.contains(related);
}

/** Auto-hide tile chrome 2s after pointer leaves tile or bar/controls (desktop). */
export function bindTileChromeHover(tile) {
    if (!tile || isTouchDevice()) {
        return;
    }
    const onEnter = () => {
        if (state.activeTile === tile) {
            cancelTileChromeHide();
        }
    };
    const onLeaveChrome = (e) => {
        if (state.activeTile !== tile) {
            return;
        }
        if (isWithinSameTileChrome(e.relatedTarget, tile)) {
            return;
        }
        scheduleTileChromeHide(tile);
    };
    const onLeaveTile = (e) => {
        if (state.activeTile !== tile) {
            return;
        }
        const related = e.relatedTarget;
        if (related && tile.contains(related)) {
            return;
        }
        scheduleTileChromeHide(tile);
    };
    tile.addEventListener('mouseenter', onEnter);
    tile.addEventListener('mouseleave', onLeaveTile);
    for (const el of tile.querySelectorAll('.tile-bar, .tile-controls')) {
        el.addEventListener('mouseenter', onEnter);
        el.addEventListener('mouseleave', onLeaveChrome);
    }
}

/** Click on empty grid area starts hide timer for the active tile. */
export function bindWallTileChromeDismiss() {
    const grid = $('#wall-grid');
    if (!grid || grid.dataset.tileChromeDismissBound) {
        return;
    }
    grid.dataset.tileChromeDismissBound = '1';
    grid.addEventListener('click', (e) => {
        if (state.focusSlot !== null) {
            return;
        }
        if (e.target.closest('.tile')) {
            return;
        }
        if (state.activeTile) {
            scheduleTileChromeHide(state.activeTile);
        }
    });
}

export function onWallMouseMove(e) {
    const wall = $('#screen-wall');
    if (!wall || wall.classList.contains('hidden')) {
        return;
    }
    const target = e.target;
    if (target?.closest?.(TILE_CHROME_SELECTOR)) {
        wall.classList.add('chrome-hidden');
        revealTopChromeOnPointer(wall, false);
        return;
    }
    if (target?.closest?.(TOP_WALL_CHROME_SELECTOR)) {
        wall.classList.add('chrome-hidden');
        clearTimeout(state.chromeTimer);
        syncTopChrome(wall, true);
        return;
    }
    const zone = state.focusSlot !== null ? TOP_CHROME_FOCUS_ZONE_PX : TOP_CHROME_ZONE_PX;
    revealTopChromeOnPointer(wall, e.clientY < zone);
}

export function onWallTouch(e) {
    const wall = $('#screen-wall');
    if (!wall || wall.classList.contains('hidden')) {
        return;
    }
    const touch = e.touches?.[0];
    const target = touch?.target;
    if (target?.closest?.(TILE_CHROME_SELECTOR)) {
        wall.classList.add('chrome-hidden');
        revealTopChromeOnPointer(wall, false);
        return;
    }
    if (target?.closest?.(TOP_WALL_CHROME_SELECTOR)) {
        wall.classList.add('chrome-hidden');
        clearTimeout(state.chromeTimer);
        syncTopChrome(wall, true);
        return;
    }
    const y = touch?.clientY ?? 0;
    const zone = state.focusSlot !== null ? TOP_CHROME_FOCUS_ZONE_PX : TOP_CHROME_ZONE_PX;
    revealTopChromeOnPointer(wall, y < zone);
}

let noticeTimer = null;

/** Brief corner toast (e.g. server-side viewer update in Electron). */
export function showViewerNotice(message, ms = 5000) {
    let el = document.getElementById('viewer-notice-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'viewer-notice-toast';
        el.className = 'viewer-notice-toast hidden';
        document.body.appendChild(el);
    }
    clearTimeout(noticeTimer);
    el.textContent = message || '';
    el.classList.remove('hidden');
    noticeTimer = setTimeout(() => el.classList.add('hidden'), ms);
}
