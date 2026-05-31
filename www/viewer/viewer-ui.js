import {$, CHROME_HIDE_MS, TOP_CHROME_AUTO_HIDE_MS} from './viewer-dom.js';
import {state} from './viewer-state.js';

/** Pointer within this many px from top reveals wall-header + electron-brand-bar. */
export const TOP_CHROME_ZONE_PX = 5;
/** Focus mode: thin strip at top edge for tile back bar + wall header. */
export const TOP_CHROME_FOCUS_ZONE_PX = 5;

const CHROME_UI_SELECTOR =
    '.wall-header, #electron-brand-bar, .tile-bar, .tile-focus-btn-back, #btn-exit-focus, .wall-header button, .wall-header select';

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

export function onWallMouseMove(e) {
    const wall = $('#screen-wall');
    if (!wall || wall.classList.contains('hidden')) {
        return;
    }
    if (e.target?.closest?.(CHROME_UI_SELECTOR)) {
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
    if (touch?.target?.closest?.(CHROME_UI_SELECTOR)) {
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
