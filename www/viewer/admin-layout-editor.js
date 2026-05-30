import {
    buildPreviewMap,
    isLayoutPreviewStream,
    partitionLayoutStreams,
    previewParentStream,
    suggestPreviewStream,
} from './stream-pairs.js';
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

function mainCameraSelection(selected, streams) {
    return selected.filter((name) => !isLayoutPreviewStream(name, streams));
}

export function cameraCheckboxes(container, selected, maxCount, previewMap) {
    container.innerHTML = '';
    if (!state.streams.length) {
        container.innerHTML = '<p class="hint">No streams in go2rtc. Add cameras in go2rtc.yaml first.</p>';
        updatePreviewRows([], previewMap || {});
        return;
    }

    const {mains, previews} = partitionLayoutStreams(state.streams);
    const mainSelected = mainCameraSelection(selected, state.streams);
    let preview = {...(previewMap || {})};

    const mainSection = document.createElement('div');
    mainSection.className = 'stream-section stream-section-main';
    mainSection.innerHTML = '<div class="stream-section-title">Main cameras</div>';
    for (const name of mains) {
        mainSection.appendChild(createMainCameraCheck(name, mainSelected.includes(name), container, maxCount, () => {
            preview = onMainSelectionChange(container, maxCount, preview);
        }));
    }
    container.appendChild(mainSection);

    if (previews.length) {
        const previewSection = document.createElement('div');
        previewSection.className = 'stream-section stream-section-preview';
        previewSection.innerHTML =
            '<div class="stream-section-title">Preview / sub-streams <span class="stream-badge">not on grid</span></div>' +
            '<p class="hint stream-section-hint">Used only as low-res preview for a main camera. Click <strong>Auto preview</strong> after selecting mains.</p>';
        const list = document.createElement('ul');
        list.className = 'stream-preview-entities';
        for (const name of previews) {
            const parent = previewParentStream(name, state.streams);
            const li = document.createElement('li');
            li.innerHTML = `<code>${escapeHtml(name)}</code>${parent ? `<span class="stream-preview-parent">→ ${escapeHtml(parent)}</span>` : ''}`;
            list.appendChild(li);
        }
        previewSection.appendChild(list);
        container.appendChild(previewSection);
    }

    updateCameraHint(container, maxCount);
    updatePreviewRows(mainSelected, preview);
}

function createMainCameraCheck(name, checked, container, maxCount, onChange) {
    const label = document.createElement('label');
    label.className = 'check check-main-camera';
    label.innerHTML =
        `<input type="checkbox" data-layout-role="main" value="${escapeHtml(name)}" ${checked ? 'checked' : ''}> ${escapeHtml(name)}`;
    label.querySelector('input').addEventListener('change', () => {
        enforceCameraLimit(container, maxCount);
        onChange();
    });
    return label;
}

function onMainSelectionChange(container, maxCount, preview) {
    const cams = selectedCameras(container);
    const next = buildPreviewMap(cams, state.streams, collectPreviewMap());
    updatePreviewRows(cams, next);
    updateCameraHint(container, maxCount);
    return next;
}

export function applyAutoPreview(container) {
    const cams = selectedCameras(container);
    const preview = buildPreviewMap(cams, state.streams, collectPreviewMap());
    updatePreviewRows(cams, preview);
    const n = Object.keys(preview).length;
    setStatus(n ? `Auto-mapped ${n} preview stream(s)` : 'No matching sub-stream names found (use *_sub, *_preview, etc.)');
}

export function selectAllCameras(container, maxCount) {
    const inputs = [...container.querySelectorAll('input[type="checkbox"][data-layout-role="main"]')];
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
    for (const i of container.querySelectorAll('input[data-layout-role="main"]:checked')) {
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
    const {previews} = partitionLayoutStreams(state.streams);
    const previewSet = new Set(previews);
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

        const guess = suggestPreviewStream(cam, state.streams);
        if (guess) {
            const group = document.createElement('optgroup');
            group.label = 'Sub / preview streams';
            for (const s of previews) {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s;
                group.appendChild(opt);
            }
            sel.appendChild(group);
        }

        const other = state.streams.filter((s) => s !== cam && !previewSet.has(s));
        if (other.length) {
            const group = document.createElement('optgroup');
            group.label = 'Other streams';
            for (const s of other) {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s;
                group.appendChild(opt);
            }
            sel.appendChild(group);
        }

        sel.value = previewMap[cam] || '';
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
    const checked = container.querySelectorAll('input[data-layout-role="main"]:checked');
    if (checked.length > maxCount) {
        checked[checked.length - 1].checked = false;
        setStatus(`Maximum ${maxCount} cameras for this grid`, true);
    }
    updateCameraHint(container, maxCount);
}

function updateCameraHint(container, maxCount) {
    const n = container.querySelectorAll('input[data-layout-role="main"]:checked').length;
    $('#layout-camera-hint').textContent = `(${n} / ${maxCount})`;
}

export function selectedCameras(container) {
    return [...container.querySelectorAll('input[data-layout-role="main"]:checked')].map((i) => i.value);
}

export function selectedLayouts(container) {
    return [...container.querySelectorAll('input:checked')].map((i) => i.value);
}
