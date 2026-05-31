import './viewer-stream.js';
import {GRID_PRESETS, slotsFromLayout} from './grids.js';
import {wallLayoutMode} from './device.js';
import {saveLastLayoutId} from './layout-auto.js';
import {planMorningStart} from './morning-start.js';
import {api, apiUrl, serverHint, isFetchFailure} from './viewer-api.js';
import {isSessionProbeFatalError, shouldShowLoginScreen} from './viewer-session-boot.js';
import {$} from './viewer-dom.js';
import {state, stopAllRecordings} from './viewer-state.js';
import {showFatalError, showScreen, onWallMouseMove, onWallTouch, bindWallTileChromeDismiss} from './viewer-ui.js';
import {initDesktopUpdateUi, showDesktopNotice} from './desktop-update-ui.js';
import {renderWall, exitFocus, applyWallLayoutClasses} from './viewer-wall.js';
import {openAboutModal} from './viewer-about.js';

function bindAboutButtons() {
    for (const id of ['btn-about-login', 'btn-about-layouts', 'btn-about-wall']) {
        const el = $(id);
        if (el) {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openAboutModal().catch((err) => {
                    console.error('About dialog failed', err);
                });
            });
        }
    }
}

async function trySession() {
    try {
        const me = await api('GET', '/api/viewer/me');
        state.user = me.user;
        state.layouts = me.layouts || [];
        return true;
    } catch (e) {
        if (isSessionProbeFatalError(e)) {
            showFatalError(
                'Cannot reach go2rtc',
                e.message || 'Network error',
                serverHint(),
            );
        }
        return false;
    }
}

async function onLogin(ev) {
    ev.preventDefault();
    const err = $('#login-error');
    err.textContent = '';
    try {
        const res = await api('POST', '/api/viewer/login', {
            user: $('#login-user').value.trim(),
            password: $('#login-password').value,
            remember: $('#login-remember').checked,
        });
        state.user = res.user;
        state.layouts = res.layouts || [];
        await enterAfterAuth();
    } catch (e) {
        if (isFetchFailure(e)) {
            err.textContent = 'Cannot reach go2rtc. ' + serverHint();
        } else {
            err.textContent = e.message || 'Login failed';
        }
    }
}

async function enterAfterAuth() {
    const plan = planMorningStart({
        layouts: state.layouts,
        user: state.user,
    });
    if (plan.action === 'picker') {
        showLayoutsScreen();
        return;
    }
    try {
        await openLayout(plan.layoutId);
    } catch (e) {
        showLayoutsScreen();
        const errEl = $('#layout-open-error');
        if (errEl) {
            errEl.textContent = e.message || 'Could not open layout';
        }
    }
}

function showLayoutsScreen() {
    exitFocus();
    showScreen('screen-layouts');
    $('#layout-user').textContent = state.user || '';
    const list = $('#layout-list');
    list.innerHTML = '';
    if (!state.layouts.length) {
        list.innerHTML = '<p class="error">No layouts assigned to your account.</p>';
        return;
    }
    for (const l of state.layouts) {
        const card = document.createElement('div');
        card.className = 'layout-card';
        card.innerHTML = `<h3>${escapeHtml(l.id)}</h3><span>${l.grid} cameras · ${(l.cameras || []).length} streams</span>`;
        card.addEventListener('click', () => openLayout(l.id));
        list.appendChild(card);
    }
}

async function openLayout(id) {
    const errEl = $('#layout-open-error');
    if (errEl) {
        errEl.textContent = '';
    }
    try {
        exitFocus();
        state.currentLayoutId = id;
        const detail = await api('GET', `/api/viewer/layouts/${encodeURIComponent(id)}`);
        const grid = Number(detail?.grid);
        if (!detail?.id || !GRID_PRESETS[grid]) {
            throw new Error('Invalid layout from server (check grid is 6, 7, 25, or 36)');
        }
        state.layoutDetail = {...detail, grid};
        state.slots = slotsFromLayout(state.layoutDetail);
        saveLastLayoutId(state.user, id);
        showScreen('screen-wall');
        renderWall();
    } catch (e) {
        const msg = e.message || 'Failed to open layout';
        if (errEl) {
            errEl.textContent = msg;
        } else {
            alert(msg);
        }
    }
}

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function logout(forget) {
    stopAllRecordings();
    exitFocus();
    try {
        await fetch(apiUrl('/api/viewer/logout' + (forget ? '?forget=1' : '')), {
            method: 'POST',
            credentials: 'include',
        });
    } catch {
        /* ignore */
    }
    state.user = null;
    state.layouts = [];
    state.currentLayoutId = null;
    showScreen('screen-login');
}

async function init() {
    const loginForm = $('#login-form');
    if (!loginForm) {
        throw new Error('Viewer page is incomplete (missing login form). Reload or reinstall go2rtc.');
    }
    loginForm.addEventListener('submit', onLogin);
    $('#btn-logout').addEventListener('click', () => logout(false));
    $('#btn-logout-forget').addEventListener('click', () => logout(true));
    $('#btn-logout-wall').addEventListener('click', () => logout(false));
    $('#layout-select').addEventListener('change', (e) => openLayout(e.target.value));
    $('#btn-back-layouts').addEventListener('click', showLayoutsScreen);
    $('#btn-exit-focus').addEventListener('click', exitFocus);
    bindAboutButtons();

    initDesktopUpdateUi();

    if (window.go2rtcDesktop?.getClientInfo) {
        try {
            const client = await window.go2rtcDesktop.getClientInfo();
            if (client?.wall_chrome_hidden) {
                state.wallChromeHidden = true;
            }
        } catch {
            /* ignore */
        }
    }

    if (window.go2rtcDesktop?.onUpdateNotice) {
        window.go2rtcDesktop.onUpdateNotice((message) => {
            showDesktopNotice(message, 8000);
        });
    }
    if (new URLSearchParams(window.location.search).get('viewer_notice') === 'updated') {
        showDesktopNotice('Viewer updated on server — press Ctrl+R to reload.', 8000);
    }

    document.addEventListener('mousemove', onWallMouseMove);
    document.addEventListener('touchstart', onWallTouch, {passive: true});
    bindWallTileChromeDismiss();

    let lastLayoutMode = wallLayoutMode();
    window.addEventListener('resize', () => {
        const mode = wallLayoutMode();
        if (mode === lastLayoutMode) {
            return;
        }
        lastLayoutMode = mode;
        if (state.layoutDetail) {
            renderWall();
        } else {
            applyWallLayoutClasses();
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.focusSlot !== null) {
            exitFocus();
        }
    });

    const sessionOk = await trySession();
    if (sessionOk) {
        await enterAfterAuth();
    } else if (shouldShowLoginScreen(sessionOk, $('#bootstrap-error')?.textContent)) {
        showScreen('screen-login');
    }
}

init().catch((e) => {
    showFatalError(
        'Camera wall failed to start',
        e?.message || String(e),
        'Reload this page (Ctrl+R). If using the desktop app, check the server URL with Ctrl+Shift+S.',
    );
});
