import {buildPreviewMap, suggestPreviewStream} from './stream-pairs.js';

const ADMIN_KEY = 'go2rtc-viewer-admin';

const $ = (sel) => document.querySelector(sel);

function basePath() {
    const m = location.pathname.match(/^(.*)\/viewer\//);
    return m ? m[1] : '';
}

function apiUrl(path) {
    return basePath() + path;
}

function adminPass() {
    return sessionStorage.getItem(ADMIN_KEY) || '';
}

function setAdminPass(pass) {
    if (pass) {
        sessionStorage.setItem(ADMIN_KEY, pass);
    } else {
        sessionStorage.removeItem(ADMIN_KEY);
    }
}

async function adminApi(method, path, body) {
    const opts = {
        method,
        credentials: 'include',
        headers: {'X-Viewer-Admin': adminPass()},
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
    users: {},
    layouts: {},
    streams: [],
    editingUser: null,
    editingLayout: null,
};

function showScreen(id) {
    for (const el of document.querySelectorAll('#admin-app .screen')) {
        el.classList.toggle('hidden', el.id !== id);
    }
}

function setStatus(msg, isError = false) {
    const el = $('#admin-status');
    el.textContent = msg || '';
    el.className = 'admin-status' + (isError ? ' err' : msg ? ' ok' : '');
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function verifyAdmin(pass) {
    const r = await fetch(apiUrl('/api/viewer/admin/users'), {
        headers: {'X-Viewer-Admin': pass},
    });
    return r.ok;
}

async function loadAll() {
    const [users, layouts, streams] = await Promise.all([
        adminApi('GET', '/api/viewer/admin/users'),
        adminApi('GET', '/api/viewer/admin/layouts'),
        adminApi('GET', '/api/streams'),
    ]);
    state.users = users || {};
    state.layouts = layouts || {};
    state.streams = Object.keys(streams || {}).sort();
    renderUsers();
    renderLayouts();
}

function renderUsers() {
    const tbody = $('#users-list');
    tbody.innerHTML = '';
    const names = Object.keys(state.users).sort();
    if (!names.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty">No users yet.</td></tr>';
        return;
    }
    for (const name of names) {
        const u = state.users[name];
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(name)}</strong></td>
            <td>${escapeHtml((u.layouts || []).join(', ') || '—')}</td>
            <td class="actions">
                <button type="button" data-edit-user="${escapeHtml(name)}">Edit</button>
                <button type="button" data-del-user="${escapeHtml(name)}" class="danger">Delete</button>
            </td>`;
        tbody.appendChild(tr);
    }
}

function renderLayouts() {
    const tbody = $('#layouts-list');
    tbody.innerHTML = '';
    const ids = Object.keys(state.layouts).sort();
    if (!ids.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty">No layouts yet.</td></tr>';
        return;
    }
    for (const id of ids) {
        const l = state.layouts[id];
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(id)}</strong></td>
            <td>${l.grid}</td>
            <td>${(l.cameras || []).length}${previewCount(l)}: ${escapeHtml((l.cameras || []).slice(0, 3).join(', '))}${(l.cameras || []).length > 3 ? '…' : ''}</td>
            <td class="actions">
                <button type="button" data-edit-layout="${escapeHtml(id)}">Edit</button>
                <button type="button" data-del-layout="${escapeHtml(id)}" class="danger">Delete</button>
            </td>`;
        tbody.appendChild(tr);
    }
}

function layoutCheckboxes(container, selected) {
    container.innerHTML = '';
    const ids = Object.keys(state.layouts).sort();
    if (!ids.length) {
        container.innerHTML = '<p class="hint">Create a layout first.</p>';
        return;
    }
    for (const id of ids) {
        const label = document.createElement('label');
        label.className = 'check';
        label.innerHTML = `<input type="checkbox" value="${escapeHtml(id)}" ${selected.includes(id) ? 'checked' : ''}> ${escapeHtml(id)}`;
        container.appendChild(label);
    }
}

function cameraCheckboxes(container, selected, maxCount, previewMap) {
    container.innerHTML = '';
    if (!state.streams.length) {
        container.innerHTML = '<p class="hint">No streams in go2rtc. Add cameras in go2rtc.yaml first.</p>';
        updatePreviewRows([], previewMap || {});
        return;
    }
    let preview = {...(previewMap || {})};
    for (const name of state.streams) {
        const label = document.createElement('label');
        label.className = 'check';
        const checked = selected.includes(name);
        label.innerHTML = `<input type="checkbox" value="${escapeHtml(name)}" ${checked ? 'checked' : ''}> ${escapeHtml(name)}`;
        const input = label.querySelector('input');
        input.addEventListener('change', () => {
            enforceCameraLimit(container, maxCount);
            const cams = selectedCameras(container);
            preview = buildPreviewMap(cams, state.streams, collectPreviewMap());
            updatePreviewRows(cams, preview);
        });
        container.appendChild(label);
    }
    updateCameraHint(container, maxCount);
    updatePreviewRows(selected, preview);
}

function applyAutoPreview(container) {
    const cams = selectedCameras(container);
    const preview = buildPreviewMap(cams, state.streams, collectPreviewMap());
    updatePreviewRows(cams, preview);
    const n = Object.keys(preview).length;
    setStatus(n ? `Auto-mapped ${n} preview stream(s)` : 'No matching sub-stream names found (use *_sub, *_preview, etc.)');
}

function selectAllCameras(container, maxCount) {
    const inputs = [...container.querySelectorAll('input[type="checkbox"]')];
    inputs.forEach((i) => {
        i.checked = false;
    });
    for (let i = 0; i < Math.min(maxCount, inputs.length); i++) {
        inputs[i].checked = true;
    }
    updateCameraHint(container, maxCount);
    applyAutoPreview(container);
}

function clearAllCameras(container, maxCount) {
    for (const i of container.querySelectorAll('input:checked')) {
        i.checked = false;
    }
    updateCameraHint(container, maxCount);
    updatePreviewRows([], {});
}

function collectPreviewMap() {
    const preview = {};
    for (const sel of document.querySelectorAll('#layout-preview-rows select[data-preview-for]')) {
        const main = sel.dataset.previewFor;
        if (sel.value && sel.value !== main) {
            preview[main] = sel.value;
        }
    }
    return preview;
}

function updatePreviewRows(cameras, previewMap) {
    const section = $('#layout-preview-section');
    const rows = $('#layout-preview-rows');
    if (!cameras.length) {
        section.classList.add('hidden');
        rows.innerHTML = '';
        return;
    }
    section.classList.remove('hidden');
    rows.innerHTML = '';
    for (const cam of cameras) {
        const row = document.createElement('div');
        row.className = 'preview-row';
        const label = document.createElement('label');
        label.className = 'field';
        label.textContent = cam;
        const sel = document.createElement('select');
        sel.dataset.previewFor = cam;
        const optSame = document.createElement('option');
        optSame.value = '';
        optSame.textContent = 'Same as main (no separate preview)';
        sel.appendChild(optSame);
        for (const s of state.streams) {
            if (s === cam) {
                continue;
            }
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            sel.appendChild(opt);
        }
        sel.value = previewMap[cam] || '';
        const guess = suggestPreviewStream(cam, state.streams);
        if (guess && guess === sel.value) {
            sel.title = 'Auto-detected preview stream';
        }
        sel.addEventListener('change', () => {
            if (sel.value) {
                sel.title = 'Manual preview stream';
            }
        });
        row.appendChild(label);
        row.appendChild(sel);
        rows.appendChild(row);
    }
}

function enforceCameraLimit(container, maxCount) {
    const checked = container.querySelectorAll('input:checked');
    if (checked.length > maxCount) {
        checked[checked.length - 1].checked = false;
        setStatus(`Maximum ${maxCount} cameras for this grid`, true);
    }
    updateCameraHint(container, maxCount);
}

function updateCameraHint(container, maxCount) {
    const n = container.querySelectorAll('input:checked').length;
    $('#layout-camera-hint').textContent = `(${n} / ${maxCount})`;
}

function openUserDialog(name) {
    state.editingUser = name;
    const form = $('#form-user');
    form.name.value = name || '';
    form.name.disabled = !!name;
    form.password.value = '';
    form.password.required = !name;
    $('#dialog-user-title').textContent = name ? `Edit user: ${name}` : 'Add user';
    layoutCheckboxes($('#user-layout-checks'), name ? (state.users[name]?.layouts || []) : []);
    $('#dialog-user').showModal();
}

function previewCount(layout) {
    const n = layout.preview ? Object.keys(layout.preview).length : 0;
    return n ? ` (${n} preview)` : '';
}

function openLayoutDialog(id) {
    state.editingLayout = id;
    const form = $('#form-layout');
    const l = id ? state.layouts[id] : null;
    form.id.value = id || '';
    form.id.disabled = !!id;
    form.grid.value = String(l?.grid || 6);
    $('#dialog-layout-title').textContent = id ? `Edit layout: ${id}` : 'Add layout';
    const max = parseInt(form.grid.value, 10);
    cameraCheckboxes($('#layout-camera-checks'), l?.cameras || [], max, l?.preview || {});
    form.grid.onchange = () => {
        cameraCheckboxes(
            $('#layout-camera-checks'),
            selectedCameras($('#layout-camera-checks')),
            parseInt(form.grid.value, 10),
            collectPreviewMap(),
        );
    };
    $('#dialog-layout').showModal();
}

function selectedCameras(container) {
    return [...container.querySelectorAll('input:checked')].map((i) => i.value);
}

function selectedLayouts(container) {
    return [...container.querySelectorAll('input:checked')].map((i) => i.value);
}

async function saveUser(ev) {
    ev.preventDefault();
    const form = ev.target;
    const name = form.name.value.trim();
    const password = form.password.value;
    if (!state.editingUser && !password) {
        setStatus('Password required for new user', true);
        return;
    }
    try {
        await adminApi('PUT', '/api/viewer/admin/users', {
            name,
            password,
            layouts: selectedLayouts($('#user-layout-checks')),
        });
        $('#dialog-user').close();
        setStatus('User saved');
        await loadAll();
    } catch (e) {
        setStatus(e.message, true);
    }
}

async function saveLayout(ev) {
    ev.preventDefault();
    const form = ev.target;
    const id = form.id.value.trim();
    const grid = parseInt(form.grid.value, 10);
    const cameras = selectedCameras($('#layout-camera-checks'));
    if (cameras.length > grid) {
        setStatus(`Too many cameras for grid ${grid}`, true);
        return;
    }
    try {
        await adminApi('PUT', '/api/viewer/admin/layouts', {
            id,
            grid,
            cameras,
            preview: collectPreviewMap(),
        });
        $('#dialog-layout').close();
        setStatus('Layout saved');
        await loadAll();
    } catch (e) {
        setStatus(e.message, true);
    }
}

async function deleteUser(name) {
    if (!confirm(`Delete user "${name}"?`)) {
        return;
    }
    try {
        await adminApi('DELETE', `/api/viewer/admin/users/${encodeURIComponent(name)}`);
        setStatus('User deleted');
        await loadAll();
    } catch (e) {
        setStatus(e.message, true);
    }
}

async function deleteLayout(id) {
    if (!confirm(`Delete layout "${id}"? Users will lose access to it.`)) {
        return;
    }
    try {
        await adminApi('DELETE', `/api/viewer/admin/layouts/${encodeURIComponent(id)}`);
        setStatus('Layout deleted');
        await loadAll();
    } catch (e) {
        setStatus(e.message, true);
    }
}

function switchTab(tab) {
    for (const btn of document.querySelectorAll('.admin-tabs button')) {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    }
    $('#tab-users').classList.toggle('hidden', tab !== 'users');
    $('#tab-layouts').classList.toggle('hidden', tab !== 'layouts');
}

async function onAdminLogin(ev) {
    ev.preventDefault();
    const pass = $('#admin-password').value;
    $('#admin-login-error').textContent = '';
    if (!(await verifyAdmin(pass))) {
        $('#admin-login-error').textContent = 'Invalid admin password (or viewer admin disabled in config)';
        return;
    }
    setAdminPass(pass);
    showScreen('admin-main');
    try {
        await loadAll();
    } catch (e) {
        setStatus(e.message, true);
    }
}

async function init() {
    $('#admin-login-form').addEventListener('submit', onAdminLogin);
    $('#admin-logout').addEventListener('click', () => {
        setAdminPass('');
        showScreen('admin-login');
        $('#admin-password').value = '';
    });
    $('#btn-add-user').addEventListener('click', () => openUserDialog(null));
    $('#btn-add-layout').addEventListener('click', () => openLayoutDialog(null));
    $('#form-user').addEventListener('submit', saveUser);
    $('#form-layout').addEventListener('submit', saveLayout);

    $('#btn-select-all-cameras').addEventListener('click', () => {
        const max = parseInt($('#form-layout').grid.value, 10);
        selectAllCameras($('#layout-camera-checks'), max);
    });
    $('#btn-clear-cameras').addEventListener('click', () => {
        const max = parseInt($('#form-layout').grid.value, 10);
        clearAllCameras($('#layout-camera-checks'), max);
    });
    $('#btn-auto-preview').addEventListener('click', () => {
        applyAutoPreview($('#layout-camera-checks'));
    });

    for (const btn of document.querySelectorAll('[data-close]')) {
        btn.addEventListener('click', () => btn.closest('dialog')?.close());
    }

    document.querySelectorAll('.admin-tabs button').forEach((btn) => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    $('#users-list').addEventListener('click', (e) => {
        const edit = e.target.closest('[data-edit-user]');
        const del = e.target.closest('[data-del-user]');
        if (edit) openUserDialog(edit.dataset.editUser);
        if (del) deleteUser(del.dataset.delUser);
    });

    $('#layouts-list').addEventListener('click', (e) => {
        const edit = e.target.closest('[data-edit-layout]');
        const del = e.target.closest('[data-del-layout]');
        if (edit) openLayoutDialog(edit.dataset.editLayout);
        if (del) deleteLayout(del.dataset.delLayout);
    });

    if (adminPass() && await verifyAdmin(adminPass())) {
        showScreen('admin-main');
        try {
            await loadAll();
        } catch {
            setAdminPass('');
            showScreen('admin-login');
        }
    } else {
        showScreen('admin-login');
    }
}

init();
