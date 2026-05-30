import {$, CHROME_HIDE_MS} from './viewer-dom.js';
import {state} from './viewer-state.js';

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
    state.chromeTimer = setTimeout(() => {
        wall.classList.add('chrome-hidden');
    }, CHROME_HIDE_MS);
}

export function stopChromeHide() {
    clearTimeout(state.chromeTimer);
    $('#screen-wall')?.classList.remove('chrome-hidden', 'show-top-chrome');
}

export function bumpChrome() {
    const wall = $('#screen-wall');
    if (!wall || wall.classList.contains('hidden')) {
        return;
    }
    if (state.focusSlot !== null) {
        return;
    }
    wall.classList.remove('chrome-hidden');
    clearTimeout(state.chromeTimer);
    state.chromeTimer = setTimeout(() => wall.classList.add('chrome-hidden'), CHROME_HIDE_MS);
}

export function onWallMouseMove(e) {
    const wall = $('#screen-wall');
    if (!wall || wall.classList.contains('hidden')) {
        return;
    }

    if (state.focusSlot !== null) {
        wall.classList.toggle('show-top-chrome', e.clientY < 56);
        if (e.clientY >= 56) {
            clearTimeout(state.chromeTimer);
            state.chromeTimer = setTimeout(() => wall.classList.add('chrome-hidden'), CHROME_HIDE_MS);
        } else {
            wall.classList.remove('chrome-hidden');
        }
        return;
    }

    bumpChrome();
}

export function onWallTouch(e) {
    const wall = $('#screen-wall');
    if (!wall || wall.classList.contains('hidden')) {
        return;
    }
    if (state.focusSlot !== null) {
        const y = e.touches?.[0]?.clientY ?? 0;
        wall.classList.toggle('show-top-chrome', y < 56);
        wall.classList.remove('chrome-hidden');
        clearTimeout(state.chromeTimer);
        state.chromeTimer = setTimeout(() => wall.classList.add('chrome-hidden'), CHROME_HIDE_MS);
        return;
    }
    bumpChrome();
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
