import './viewer-stream.js';
import {GRID_PRESETS, slotsFromLayout, tilesFromSlots} from './grids.js';
import {TileViewport, toggleStreamAudio, refreshStream} from './tile-viewport.js';

const $ = (sel) => document.querySelector(sel);
const CHROME_HIDE_MS = 2000;

function basePath() {
    const m = location.pathname.match(/^(.*)\/viewer\//);
    return m ? m[1] : '';
}

function apiUrl(path) {
    return basePath() + path;
}

async function api(method, path, body) {
    const opts = {method, credentials: 'include', headers: {}};
    if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const r = await fetch(apiUrl(path), opts);
    const text = await r.text();
    if (!r.ok) {
        throw new Error(text || r.statusText);
    }
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

const state = {
    user: null,
    layouts: [],
    currentLayoutId: null,
    layoutDetail: null,
    slots: [],
    saveTimer: null,
    focusSlot: null,
    tileViewports: new Map(),
    chromeTimer: null,
};

function settingsKey(slot) {
    return `viewer:${state.currentLayoutId}:${slot}`;
}

function loadTileSettings(slot) {
    try {
        return JSON.parse(sessionStorage.getItem(settingsKey(slot)) || 'null');
    } catch {
        return null;
    }
}

function saveTileSettings(slot, viewport) {
    sessionStorage.setItem(settingsKey(slot), JSON.stringify(viewport.toJSON()));
}

function showScreen(id) {
    for (const el of document.querySelectorAll('.screen')) {
        el.classList.toggle('hidden', el.id !== id);
    }
    if (id === 'screen-wall') {
        startChromeHide();
    } else {
        stopChromeHide();
    }
}

function startChromeHide() {
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

function stopChromeHide() {
    clearTimeout(state.chromeTimer);
    $('#screen-wall')?.classList.remove('chrome-hidden', 'show-top-chrome');
}

function bumpChrome() {
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

function onWallMouseMove(e) {
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

async function trySession() {
    try {
        const me = await api('GET', '/api/viewer/me');
        state.user = me.user;
        state.layouts = me.layouts || [];
        return true;
    } catch {
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
        showLayoutsScreen();
    } catch (e) {
        err.textContent = e.message || 'Login failed';
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
    exitFocus();
    state.currentLayoutId = id;
    state.layoutDetail = await api('GET', `/api/viewer/layouts/${encodeURIComponent(id)}`);
    state.slots = slotsFromLayout(state.layoutDetail);
    renderWall();
    showScreen('screen-wall');
}

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function streamSrc(name) {
    return apiUrl('/api/ws?src=' + encodeURIComponent(name));
}

function exitFocus() {
    if (state.focusSlot === null) {
        return;
    }
    state.focusSlot = null;
    const wall = $('#screen-wall');
    wall?.classList.remove('focus-mode', 'chrome-hidden', 'show-top-chrome');
    $('#btn-exit-focus')?.classList.add('hidden');
    renderWall();
    bumpChrome();
}

function enterFocus(slotIndex) {
    if (!state.slots[slotIndex]) {
        return;
    }
    state.focusSlot = slotIndex;
    renderWall();
    const wall = $('#screen-wall');
    wall.classList.add('focus-mode');
    wall.classList.remove('chrome-hidden', 'show-top-chrome');
    $('#btn-exit-focus')?.classList.remove('hidden');
    clearTimeout(state.chromeTimer);
    state.chromeTimer = setTimeout(() => wall.classList.add('chrome-hidden'), CHROME_HIDE_MS);
}

function renderWall() {
    state.tileViewports.forEach((vp) => vp.destroy());
    state.tileViewports.clear();

    const detail = state.layoutDetail;
    const preset = GRID_PRESETS[detail.grid];
    if (!preset) {
        return;
    }

    const focusSlot = state.focusSlot;

    $('#wall-title').textContent = detail.id;
    const sel = $('#layout-select');
    sel.innerHTML = '';
    for (const l of state.layouts) {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = `${l.id} (${l.grid})`;
        opt.selected = l.id === state.currentLayoutId;
        sel.appendChild(opt);
    }

    const grid = $('#wall-grid');
    grid.style.gridTemplateColumns = `repeat(${preset.cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${preset.rows}, 1fr)`;
    grid.innerHTML = '';

    for (let i = 0; i < state.slots.length; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell' + (state.slots[i] ? '' : ' empty');
        if (focusSlot === i) {
            cell.classList.add('focused');
        }
        cell.dataset.slot = String(i);

        if (focusSlot === null) {
            cell.addEventListener('dragover', (e) => {
                e.preventDefault();
                cell.classList.add('drag-over');
            });
            cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
            cell.addEventListener('drop', (e) => {
                e.preventDefault();
                cell.classList.remove('drag-over');
                const from = parseInt(e.dataTransfer.getData('text/slot'), 10);
                const to = parseInt(cell.dataset.slot, 10);
                if (!Number.isNaN(from) && !Number.isNaN(to) && from !== to) {
                    swapSlots(from, to);
                }
            });
        }

        const stream = state.slots[i];
        if (stream) {
            cell.appendChild(createTile(stream, i, focusSlot !== null));
        }
        grid.appendChild(cell);
    }

    if (focusSlot !== null) {
        $('#screen-wall').classList.add('focus-mode');
        $('#btn-exit-focus')?.classList.remove('hidden');
    }
}

function createTileControls(viewport, streamName, slotIndex, src, vs, inFocus) {
    const bar = document.createElement('div');
    bar.className = 'tile-controls';
    bar.innerHTML = `
        <button type="button" data-act="fit" title="Aspect ratio">◫</button>
        <button type="button" data-act="zoom-out" title="Zoom out">−</button>
        <button type="button" data-act="zoom-in" title="Zoom in">+</button>
        <button type="button" data-act="reset" title="Reset view">⟲</button>
        <button type="button" data-act="audio" title="Sound (off by default)">🔇</button>
        <button type="button" data-act="refresh" title="Refresh stream">↻</button>
        ${inFocus ? '' : '<button type="button" data-act="focus" title="Full screen">⛶</button>'}
    `;

    bar.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) {
            return;
        }
        e.stopPropagation();
        switch (btn.dataset.act) {
            case 'fit': {
                const fit = viewport.cycleFit();
                btn.title = `Aspect: ${fit}`;
                saveTileSettings(slotIndex, viewport);
                break;
            }
            case 'zoom-in':
                viewport.zoom(0.2);
                saveTileSettings(slotIndex, viewport);
                break;
            case 'zoom-out':
                viewport.zoom(-0.2);
                saveTileSettings(slotIndex, viewport);
                break;
            case 'reset':
                viewport.reset();
                saveTileSettings(slotIndex, viewport);
                break;
            case 'audio': {
                const on = toggleStreamAudio(vs, src);
                btn.textContent = on ? '🔊' : '🔇';
                btn.title = on ? 'Mute' : 'Unmute';
                break;
            }
            case 'refresh':
                refreshStream(vs, src);
                break;
            case 'focus':
                enterFocus(slotIndex);
                break;
        }
    });

    return bar;
}

function createTile(streamName, slotIndex, inFocus) {
    const src = streamSrc(streamName);
    const tile = document.createElement('div');
    tile.className = 'tile';

    const bar = document.createElement('div');
    bar.className = 'tile-bar';
    bar.innerHTML = `<span class="name">${escapeHtml(streamName)}</span><span class="drag-handle" title="Drag to swap">⠿</span>`;

    if (!inFocus) {
        const handle = bar.querySelector('.drag-handle');
        handle.draggable = true;
        handle.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            e.dataTransfer.setData('text/slot', String(slotIndex));
            e.dataTransfer.effectAllowed = 'move';
            tile.classList.add('dragging');
        });
        handle.addEventListener('dragend', () => tile.classList.remove('dragging'));
        tile.appendChild(bar);
    }

    const body = document.createElement('div');
    body.className = 'tile-body';

    const viewportWrap = document.createElement('div');
    viewportWrap.className = 'viewport';

    const vs = document.createElement('viewer-stream');
    vs.src = src;

    const viewport = new TileViewport(viewportWrap);
    viewport.mount(vs);
    viewport.fromJSON(loadTileSettings(slotIndex));
    state.tileViewports.set(slotIndex, viewport);

    body.appendChild(viewportWrap);
    body.appendChild(createTileControls(viewport, streamName, slotIndex, src, vs, inFocus));

    body.addEventListener('dblclick', (e) => {
        if (e.target.closest('.tile-controls, .tile-bar')) {
            return;
        }
        if (!inFocus) {
            enterFocus(slotIndex);
        }
    });

    tile.appendChild(body);
    return tile;
}

function swapSlots(a, b) {
    const tmp = state.slots[a];
    state.slots[a] = state.slots[b];
    state.slots[b] = tmp;
    renderWall();
    scheduleSave();
}

function scheduleSave() {
    const hint = $('#save-hint');
    hint.textContent = '…';
    hint.className = 'save-hint';
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveTiles, 400);
}

async function saveTiles() {
    const hint = $('#save-hint');
    const preset = GRID_PRESETS[state.layoutDetail.grid];
    try {
        await api('PUT', `/api/viewer/layouts/${encodeURIComponent(state.currentLayoutId)}/tiles`, {
            tiles: tilesFromSlots(state.slots, preset.cols),
        });
        hint.textContent = 'saved';
        hint.className = 'save-hint ok';
    } catch (e) {
        hint.textContent = 'error';
        hint.className = 'save-hint err';
    }
}

async function logout(forget) {
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
    $('#login-form').addEventListener('submit', onLogin);
    $('#btn-logout').addEventListener('click', () => logout(false));
    $('#btn-logout-forget').addEventListener('click', () => logout(true));
    $('#btn-logout-wall').addEventListener('click', () => logout(false));
    $('#layout-select').addEventListener('change', (e) => openLayout(e.target.value));
    $('#btn-back-layouts').addEventListener('click', showLayoutsScreen);
    $('#btn-exit-focus').addEventListener('click', exitFocus);

    document.addEventListener('mousemove', onWallMouseMove);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.focusSlot !== null) {
            exitFocus();
        }
    });

    if (await trySession()) {
        showLayoutsScreen();
    } else {
        showScreen('screen-login');
    }
}

init();
