import './viewer-stream.js';
import {GRID_PRESETS, slotsFromLayout, tilesFromSlots} from './grids.js';

const $ = (sel) => document.querySelector(sel);

/** HTTP path prefix when go2rtc uses api.base_path */
function basePath() {
    const m = location.pathname.match(/^(.*)\/viewer\//);
    return m ? m[1] : '';
}

function apiUrl(path) {
    return basePath() + path;
}

async function api(method, path, body) {
    const opts = {
        method,
        credentials: 'include',
        headers: {},
    };
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
};

function showScreen(id) {
    for (const el of document.querySelectorAll('.screen')) {
        el.classList.toggle('hidden', el.id !== id);
    }
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
    const user = $('#login-user').value.trim();
    const password = $('#login-password').value;
    const remember = $('#login-remember').checked;
    try {
        const res = await api('POST', '/api/viewer/login', {user, password, remember});
        state.user = res.user;
        state.layouts = res.layouts || [];
        showLayoutsScreen();
    } catch (e) {
        err.textContent = e.message || 'Login failed';
    }
}

function showLayoutsScreen() {
    showScreen('screen-layouts');
    const userEl = $('#layout-user');
    if (userEl) {
        userEl.textContent = state.user || '';
    }
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
    state.currentLayoutId = id;
    const detail = await api('GET', `/api/viewer/layouts/${encodeURIComponent(id)}`);
    state.layoutDetail = detail;
    state.slots = slotsFromLayout(detail);
    renderWall();
    showScreen('screen-wall');
}

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function streamSrc(name) {
    return apiUrl('/api/ws?src=' + encodeURIComponent(name));
}

function renderWall() {
    const detail = state.layoutDetail;
    const preset = GRID_PRESETS[detail.grid];
    if (!preset) {
        return;
    }

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
        cell.dataset.slot = String(i);

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
            if (Number.isNaN(from) || Number.isNaN(to) || from === to) {
                return;
            }
            swapSlots(from, to);
        });

        const stream = state.slots[i];
        if (stream) {
            cell.appendChild(createTile(stream, i));
        }
        grid.appendChild(cell);
    }
}

function createTile(streamName, slotIndex) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.draggable = true;

    const bar = document.createElement('div');
    bar.className = 'tile-bar';
    bar.innerHTML = `<span class="name">${escapeHtml(streamName)}</span><span>⠿</span>`;

    bar.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/slot', String(slotIndex));
        e.dataTransfer.effectAllowed = 'move';
        tile.classList.add('dragging');
    });
    bar.addEventListener('dragend', () => tile.classList.remove('dragging'));

    const body = document.createElement('div');
    body.className = 'tile-body';
    const vs = document.createElement('viewer-stream');
    vs.src = streamSrc(streamName);
    body.appendChild(vs);

    tile.appendChild(bar);
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
    const tiles = tilesFromSlots(state.slots, preset.cols);
    try {
        await api('PUT', `/api/viewer/layouts/${encodeURIComponent(state.currentLayoutId)}/tiles`, {tiles});
        hint.textContent = 'saved';
        hint.className = 'save-hint ok';
    } catch (e) {
        hint.textContent = 'error';
        hint.className = 'save-hint err';
        console.error(e);
    }
}

async function logout(forget) {
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

    if (await trySession()) {
        showLayoutsScreen();
    } else {
        showScreen('screen-login');
    }
}

init();
