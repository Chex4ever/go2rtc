import {buildPreviewMap, suggestPreviewStream} from './stream-pairs.js';
import {state} from './admin-state.js';
import {$, escapeHtml, setStatus} from './admin-ui.js';

export function layoutCheckboxes(container, selected) {
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

export function cameraCheckboxes(container, selected, maxCount, previewMap) {
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

export function applyAutoPreview(container) {
    const cams = selectedCameras(container);
    const preview = buildPreviewMap(cams, state.streams, collectPreviewMap());
    updatePreviewRows(cams, preview);
    const n = Object.keys(preview).length;
    setStatus(n ? `Auto-mapped ${n} preview stream(s)` : 'No matching sub-stream names found (use *_sub, *_preview, etc.)');
}

export function selectAllCameras(container, maxCount) {
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

export function clearAllCameras(container, maxCount) {
    for (const i of container.querySelectorAll('input:checked')) {
        i.checked = false;
    }
    updateCameraHint(container, maxCount);
    updatePreviewRows([], {});
}

export function collectPreviewMap() {
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

export function selectedCameras(container) {
    return [...container.querySelectorAll('input:checked')].map((i) => i.value);
}

export function selectedLayouts(container) {
    return [...container.querySelectorAll('input:checked')].map((i) => i.value);
}
