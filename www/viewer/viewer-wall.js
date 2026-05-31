import {GRID_PRESETS, tilesFromSlots, slotStream, slotView, setSlotView} from './grids.js';
import {TileViewport, toggleStreamAudio, refreshStream} from './tile-viewport.js';
import {wallLayoutMode, isTouchDevice, tabletGrid, allowTileDrag} from './device.js';
import {takeSnapshot, TileRecorder} from './capture.js';
import {openTileDebugModal} from './viewer-tile-debug.js';
import {api, apiUrl} from './viewer-api.js';
import {$, CHROME_HIDE_MS} from './viewer-dom.js';
import {state, stopAllRecordings} from './viewer-state.js';
import {bumpChrome, startChromeHide} from './viewer-ui.js';

/** Stagger tile connects so Electron/go2rtc are not hit with N WebSockets at once. */
const STREAM_CONNECT_STAGGER_MS = 150;

function disconnectWallStreams() {
    for (const vp of state.tileViewports.values()) {
        vp.streamEl?.forceDisconnect?.();
    }
    for (const vs of document.querySelectorAll('#wall-grid viewer-stream')) {
        vs.forceDisconnect?.();
    }
}

function applyWallLayoutClasses() {
    const wall = $('#screen-wall');
    if (!wall) {
        return;
    }
    const mode = wallLayoutMode();
    state.wallLayoutMode = mode;
    wall.classList.toggle('wall-mobile', mode === 'mobile');
    wall.classList.toggle('wall-tablet', mode === 'tablet');
    document.body.classList.toggle('touch-device', isTouchDevice());
}

function configureWallGrid(grid, preset, focusSlot) {
    grid.style.gridAutoRows = '';
    grid.style.overflowY = '';

    if (focusSlot !== null) {
        grid.style.gridTemplateColumns = '1fr';
        grid.style.gridTemplateRows = '1fr';
        return;
    }

    const mode = wallLayoutMode();
    if (mode === 'mobile') {
        grid.style.gridTemplateColumns = '1fr';
        grid.style.gridTemplateRows = '';
        grid.style.gridAutoRows = 'minmax(min(42vw, 220px), auto)';
        grid.style.overflowY = 'auto';
        return;
    }

    if (mode === 'tablet') {
        const tg = tabletGrid(preset);
        grid.style.gridTemplateColumns = `repeat(${tg.cols}, 1fr)`;
        grid.style.gridTemplateRows = `repeat(${tg.rows}, minmax(140px, 1fr))`;
        grid.style.overflowY = 'auto';
        return;
    }

    grid.style.gridTemplateColumns = `repeat(${preset.cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${preset.rows}, minmax(0, 1fr))`;
}

function setActiveTile(tile) {
    if (state.activeTile) {
        state.activeTile.classList.remove('tile-active');
    }
    state.activeTile = tile;
    if (tile) {
        tile.classList.add('tile-active');
    }
}

function tileViewMode(inFocus) {
    return inFocus ? 'main' : 'preview';
}

function loadTileSettings(slotIndex, inFocus) {
    return slotView(state.slots[slotIndex], tileViewMode(inFocus)) || null;
}

function saveTileSettings(slotIndex, viewport, inFocus) {
    setSlotView(state.slots, slotIndex, viewport.toJSON(), tileViewMode(inFocus));
    scheduleSave();
}

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function streamSrc(name) {
    return apiUrl('/api/ws?src=' + encodeURIComponent(name));
}

/** Grid uses preview sub-stream when configured; fullscreen uses main (layout camera name). */
function playbackStream(logicalName, forFocus) {
    const preview = state.layoutDetail?.preview?.[logicalName];
    if (forFocus || !preview) {
        return logicalName;
    }
    return preview;
}

function tileLabel(logicalName, inFocus) {
    const preview = state.layoutDetail?.preview?.[logicalName];
    if (inFocus && preview) {
        return `${logicalName} (main)`;
    }
    if (!inFocus && preview) {
        return `${logicalName} → ${preview}`;
    }
    return logicalName;
}

/** Grow/shrink animation when entering or leaving main-channel focus. */
const FOCUS_ANIM_MS = 500;

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clearFocusAnimStyles(cell) {
    if (!cell) {
        return;
    }
    cell.classList.remove('focus-animating');
    cell.style.transform = '';
    cell.style.transformOrigin = '';
    cell.style.transition = '';
}

/**
 * FLIP: capture rect → mutate layout → animate from old visual to new.
 * @param {Element | null} cell
 * @param {() => void} mutateLayout
 */
function flipFocusCell(cell, mutateLayout) {
    if (!cell || prefersReducedMotion()) {
        mutateLayout();
        return Promise.resolve();
    }

    const first = cell.getBoundingClientRect();
    mutateLayout();
    const last = cell.getBoundingClientRect();

    if (!first.width || !first.height || !last.width || !last.height) {
        return Promise.resolve();
    }

    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = first.width / last.width;
    const sy = first.height / last.height;

    cell.classList.add('focus-animating');
    cell.style.transformOrigin = '0 0';
    cell.style.transition = 'none';
    cell.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                cell.style.transition = `transform ${FOCUS_ANIM_MS}ms ease`;
                cell.style.transform = '';
            });
        });
        window.setTimeout(() => {
            clearFocusAnimStyles(cell);
            resolve();
        }, FOCUS_ANIM_MS);
    });
}

function getTileCell(slotIndex) {
    return $('#wall-grid')?.querySelector(`.cell[data-slot="${slotIndex}"]`);
}

/** Grid position of a tile (stable after drag-and-drop swap moves DOM). */
function slotIndexOfTile(tile) {
    const cell = tile?.closest('.cell');
    if (!cell?.dataset.slot) {
        return -1;
    }
    return parseInt(cell.dataset.slot, 10);
}

function swapMapEntry(map, a, b) {
    const va = map.get(a);
    const vb = map.get(b);
    map.delete(a);
    map.delete(b);
    if (va !== undefined) {
        map.set(b, va);
    }
    if (vb !== undefined) {
        map.set(a, vb);
    }
}

function getTilePreviewStream(slotIndex) {
    const cell = getTileCell(slotIndex);
    return cell?.querySelector('viewer-stream:not(.stream-main)') || null;
}

function detachFocusMainStream(slotIndex) {
    const cell = getTileCell(slotIndex);
    const mainVs = cell?.querySelector('viewer-stream.stream-main');
    if (mainVs) {
        if (mainVs._focusMainReady) {
            for (const evt of ['playing', 'loadeddata', 'canplay']) {
                mainVs.removeEventListener(evt, mainVs._focusMainReady);
            }
            delete mainVs._focusMainReady;
        }
        mainVs.forceDisconnect?.();
        mainVs.remove();
    }
    const previewVs = cell?.querySelector('viewer-stream.stream-preview');
    previewVs?.classList.remove('stream-preview');
    const vp = state.tileViewports.get(slotIndex);
    if (vp) {
        vp.focusMainEl = null;
    }
}

function attachFocusMainStream(slotIndex, logicalName) {
    const previewName = state.layoutDetail?.preview?.[logicalName];
    if (!previewName) {
        return;
    }
    const previewVs = getTilePreviewStream(slotIndex);
    if (!previewVs) {
        return;
    }
    const inner = previewVs.parentElement;
    if (!inner) {
        return;
    }

    let mainVs = inner.querySelector('viewer-stream.stream-main');
    if (!mainVs) {
        mainVs = document.createElement('viewer-stream');
        mainVs.className = 'stream-main';
        previewVs.classList.add('stream-preview');
        inner.appendChild(mainVs);
    }

    mainVs.classList.remove('is-playing');
    const vp = state.tileViewports.get(slotIndex);
    if (vp) {
        vp.focusMainEl = mainVs;
    }

    const markPlaying = () => {
        mainVs.classList.add('is-playing');
        vp?.applyFit?.();
    };
    if (!mainVs._focusMainReady) {
        mainVs._focusMainReady = markPlaying;
        for (const evt of ['playing', 'loadeddata', 'canplay']) {
            mainVs.addEventListener(evt, markPlaying);
        }
    }

    const mainSrc = streamSrc(logicalName);
    const mainWs = mainVs.wsURL || '';
    if (mainWs !== mainSrc) {
        if (mainVs.ws || mainVs.pc) {
            mainVs.forceDisconnect?.();
        }
        connectStreamSrc(mainVs, mainSrc);
    }

    const video = mainVs.querySelector('video');
    if (video && (video.srcObject || video.readyState >= 2)) {
        markPlaying();
    }
}

function setTileFocusChrome(slotIndex, inFocus) {
    const cell = getTileCell(slotIndex);
    const tile = cell?.querySelector('.tile');
    if (!tile) {
        return;
    }
    const logicalName = tile.dataset.logicalStream || '';
    const nameEl = tile.querySelector('.tile-bar .name');
    if (nameEl) {
        nameEl.textContent = tileLabel(logicalName, inFocus);
    }
    tile.classList.toggle('tile-in-focus', inFocus);

    const bar = tile.querySelector('.tile-bar');
    if (!bar) {
        return;
    }
    let backBtn = bar.querySelector('.tile-focus-btn-back');
    let expandBtn = bar.querySelector('.tile-focus-btn-expand');
    if (inFocus) {
        expandBtn?.classList.add('hidden');
        if (!backBtn) {
            backBtn = document.createElement('button');
            backBtn.type = 'button';
            backBtn.className = 'tile-focus-btn tile-focus-btn-back';
            backBtn.textContent = '←';
            backBtn.title = 'Back to grid (Esc)';
            backBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                exitFocus();
            });
            bar.appendChild(backBtn);
        }
        backBtn.classList.remove('hidden');
    } else {
        backBtn?.classList.add('hidden');
        expandBtn?.classList.remove('hidden');
    }

    const ctrlFocus = tile.querySelector('.tile-controls button[data-act="focus"]');
    const ctrlExit = tile.querySelector('.tile-controls button[data-act="exit-focus"]');
    ctrlFocus?.classList.toggle('hidden', inFocus);
    ctrlExit?.classList.toggle('hidden', !inFocus);
}

function applyFocusLayout() {
    const focusSlot = state.focusSlot;
    const detail = state.layoutDetail;
    if (!detail) {
        return;
    }
    const preset = GRID_PRESETS[Number(detail.grid)];
    if (!preset) {
        return;
    }

    const wallGrid = $('#wall-grid');
    configureWallGrid(wallGrid, preset, focusSlot);

    const wall = $('#screen-wall');
    if (focusSlot !== null) {
        wall?.classList.add('focus-mode');
        $('#btn-exit-focus')?.classList.remove('hidden');
    } else {
        wall?.classList.remove('focus-mode');
        $('#btn-exit-focus')?.classList.add('hidden');
    }

    for (let i = 0; i < state.slots.length; i++) {
        const cell = getTileCell(i);
        if (!cell || cell.classList.contains('empty')) {
            continue;
        }
        cell.classList.toggle('focused', focusSlot === i);
        if (focusSlot === i) {
            const logicalName = slotStream(state.slots[i]);
            if (logicalName) {
                attachFocusMainStream(i, logicalName);
            }
            const vp = state.tileViewports.get(i);
            vp?.fromJSON(loadTileSettings(i, true));
            setTileFocusChrome(i, true);
        } else {
            detachFocusMainStream(i);
            const vp = state.tileViewports.get(i);
            vp?.fromJSON(loadTileSettings(i, false));
            setTileFocusChrome(i, false);
        }
    }
}

export function exitFocus() {
    if (state.focusSlot === null || state.focusAnimating) {
        return;
    }
    stopAllRecordings();
    const slotIndex = state.focusSlot;
    const cell = getTileCell(slotIndex);

    state.focusAnimating = true;
    flipFocusCell(cell, () => {
        state.focusSlot = null;
        applyFocusLayout();
        const wall = $('#screen-wall');
        wall?.classList.remove('chrome-hidden', 'show-top-chrome');
        startChromeHide();
    }).finally(() => {
        state.focusAnimating = false;
    });
}

export function enterFocus(slotIndex) {
    if (!slotStream(state.slots[slotIndex]) || state.focusAnimating) {
        return;
    }
    if (state.focusSlot === slotIndex) {
        return;
    }
    stopAllRecordings();
    const cell = getTileCell(slotIndex);

    state.focusAnimating = true;
    flipFocusCell(cell, () => {
        state.focusSlot = slotIndex;
        applyFocusLayout();
        const wall = $('#screen-wall');
        wall?.classList.add('focus-mode', 'chrome-hidden');
        wall?.classList.remove('show-top-chrome');
        $('#btn-exit-focus')?.classList.remove('hidden');
        clearTimeout(state.chromeTimer);
        state.chromeTimer = null;
    }).finally(() => {
        state.focusAnimating = false;
    });
}

export function renderWall() {
    disconnectWallStreams();
    stopAllRecordings();
    state.tileViewports.forEach((vp) => vp.destroy());
    state.tileViewports.clear();
    setActiveTile(null);

    const detail = state.layoutDetail;
    if (!detail) {
        return;
    }
    const gridSize = Number(detail.grid);
    const preset = GRID_PRESETS[gridSize];
    if (!preset) {
        const gridEl = $('#wall-grid');
        if (gridEl) {
            gridEl.innerHTML = '<p class="error" style="padding:16px">Invalid layout grid. Ask admin to set grid to 6, 7, 25, or 36.</p>';
        }
        return;
    }

    const focusSlot = state.focusSlot;
    applyWallLayoutClasses();

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

    const wallGrid = $('#wall-grid');
    configureWallGrid(wallGrid, preset, focusSlot);
    wallGrid.innerHTML = '';

    const dragEnabled = allowTileDrag() && focusSlot === null;
    let connectSeq = 0;

    for (let i = 0; i < state.slots.length; i++) {
        const stream = slotStream(state.slots[i]);
        if (wallLayoutMode() === 'mobile' && focusSlot === null && !stream) {
            continue;
        }

        const cell = document.createElement('div');
        cell.className = 'cell' + (stream ? '' : ' empty');
        if (focusSlot === i) {
            cell.classList.add('focused');
        }
        cell.dataset.slot = String(i);

        if (dragEnabled) {
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

        if (stream) {
            cell.appendChild(createTile(stream, i, connectSeq++));
        }
        wallGrid.appendChild(cell);
    }

    applyFocusLayout();
}

function createTileControls(viewport, streamName, previewVs, tile, previewPlayback) {
    const bar = document.createElement('div');
    bar.className = 'tile-controls';
    bar.innerHTML = `
        <button type="button" data-act="fit" title="Aspect ratio (preview)">◫</button>
        <button type="button" data-act="width-dec" title="Narrower width">◁</button>
        <button type="button" data-act="width-inc" title="Wider width">▷</button>
        <button type="button" data-act="zoom-out" title="Zoom out">−</button>
        <button type="button" data-act="zoom-in" title="Zoom in">+</button>
        <button type="button" data-act="reset" title="Reset view">⟲</button>
        <button type="button" data-act="audio" title="Sound (off by default)">🔇</button>
        <button type="button" data-act="snapshot" title="Save snapshot">📷</button>
        <button type="button" data-act="record" title="Record">⏺</button>
        <button type="button" data-act="refresh" title="Refresh stream">↻</button>
        <button type="button" data-act="debug" title="Debug this camera">🐞</button>
        <button type="button" data-act="focus" class="tile-focus-btn-expand" title="Full screen">⛶</button>
        <button type="button" data-act="exit-focus" class="hidden" title="Back to grid (Esc)">←</button>
    `;

    const fitBtn = bar.querySelector('[data-act="fit"]');

    bar.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) {
            return;
        }
        e.stopPropagation();
        const slotIndex = slotIndexOfTile(tile);
        const inFocus = state.focusSlot === slotIndex;
        const channelLabel = inFocus ? 'main' : 'preview';
        const activeVs = viewport.activeStreamEl || previewVs;
        const activePlayback = inFocus ? streamName : previewPlayback;
        const activeSrc = streamSrc(activePlayback);
        switch (btn.dataset.act) {
            case 'fit': {
                const fit = viewport.cycleFit();
                fitBtn.title = `Aspect (${channelLabel}): ${fit}`;
                break;
            }
            case 'width-dec': {
                const mul = viewport.adjustWidthScale(-0.05);
                btn.title = `Width x${mul.toFixed(2)}`;
                break;
            }
            case 'width-inc': {
                const mul = viewport.adjustWidthScale(0.05);
                btn.title = `Width x${mul.toFixed(2)}`;
                break;
            }
            case 'zoom-in':
                viewport.zoom(0.2);
                break;
            case 'zoom-out':
                viewport.zoom(-0.2);
                break;
            case 'reset':
                viewport.reset();
                break;
            case 'audio': {
                const on = toggleStreamAudio(activeVs, activeSrc);
                btn.textContent = on ? '🔊' : '🔇';
                btn.title = on ? 'Mute' : 'Unmute';
                break;
            }
            case 'snapshot': {
                btn.disabled = true;
                takeSnapshot({video: viewport.video, streamName, apiUrlFn: apiUrl})
                    .then(() => {
                        btn.title = 'Saved';
                        setTimeout(() => {
                            btn.title = 'Save snapshot';
                        }, 1500);
                    })
                    .catch(() => {
                        btn.title = 'Snapshot failed';
                    })
                    .finally(() => {
                        btn.disabled = false;
                    });
                break;
            }
            case 'record': {
                let rec = state.recorders.get(slotIndex);
                if (!rec) {
                    rec = new TileRecorder(viewport.video);
                    state.recorders.set(slotIndex, rec);
                }
                if (rec.recording) {
                    btn.disabled = true;
                    rec.stop(streamName)
                        .then(() => {
                            btn.classList.remove('active');
                            btn.textContent = '⏺';
                            btn.title = 'Record';
                            tile.classList.remove('recording');
                        })
                        .catch(() => {
                            btn.title = 'Stop failed';
                        })
                        .finally(() => {
                            btn.disabled = false;
                        });
                } else {
                    try {
                        rec.video = viewport.video;
                        rec.start();
                        btn.classList.add('active');
                        btn.textContent = '⏹';
                        btn.title = 'Stop recording';
                        tile.classList.add('recording');
                    } catch (err) {
                        btn.title = err.message || 'Record failed';
                    }
                }
                break;
            }
            case 'refresh':
                refreshStream(activeVs, activeSrc);
                break;
            case 'debug':
                openTileDebugModal({
                    logicalName: streamName,
                    playbackName: activePlayback,
                    src: activeSrc,
                    vs: activeVs,
                    slotIndex,
                    inFocus,
                }).catch((err) => {
                    btn.title = err?.message || 'Debug failed';
                });
                break;
            case 'focus':
                if (slotIndex >= 0) {
                    enterFocus(slotIndex);
                }
                break;
            case 'exit-focus':
                exitFocus();
                break;
        }
    });

    return bar;
}

function connectStreamSrc(vs, src) {
    if (!vs) {
        return;
    }
    vs.src = src;
}

function scheduleStreamSrc(vs, src, connectIndex) {
    const apply = () => {
        if (!vs.isConnected) {
            return;
        }
        connectStreamSrc(vs, src);
    };
    const delay = connectIndex * STREAM_CONNECT_STAGGER_MS;
    if (delay > 0) {
        setTimeout(apply, delay);
    } else {
        requestAnimationFrame(apply);
    }
}

function createTile(logicalName, slotIndex, connectIndex = 0) {
    const playback = playbackStream(logicalName, false);
    const src = streamSrc(playback);
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.logicalStream = logicalName;

    const bar = document.createElement('div');
    bar.className = 'tile-bar';
    bar.innerHTML = `<span class="name">${escapeHtml(tileLabel(logicalName, false))}</span><span class="drag-handle" title="Drag to swap">⠿</span>`;

    if (allowTileDrag()) {
        const handle = bar.querySelector('.drag-handle');
        handle.draggable = true;
        handle.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            e.dataTransfer.setData('text/slot', String(slotIndexOfTile(tile)));
            e.dataTransfer.effectAllowed = 'move';
            tile.classList.add('dragging');
        });
        handle.addEventListener('dragend', () => tile.classList.remove('dragging'));
    } else {
        bar.querySelector('.drag-handle')?.remove();
        const expand = document.createElement('button');
        expand.type = 'button';
        expand.className = 'tile-focus-btn tile-focus-btn-expand';
        expand.textContent = '⛶';
        expand.title = 'Full screen';
        expand.addEventListener('click', (e) => {
            e.stopPropagation();
            const si = slotIndexOfTile(tile);
            if (si >= 0) {
                enterFocus(si);
            }
        });
        bar.appendChild(expand);
    }

    const body = document.createElement('div');
    body.className = 'tile-body';

    const viewportWrap = document.createElement('div');
    viewportWrap.className = 'viewport';

    const vs = document.createElement('viewer-stream');

    const viewport = new TileViewport(viewportWrap);
    viewport.mount(vs);
    scheduleStreamSrc(vs, src, connectIndex);
    viewport.fromJSON(loadTileSettings(slotIndex, false));
    viewport.onChange = () => {
        const si = slotIndexOfTile(tile);
        if (si < 0) {
            return;
        }
        saveTileSettings(si, viewport, state.focusSlot === si);
    };
    state.tileViewports.set(slotIndex, viewport);

    body.appendChild(viewportWrap);
    body.appendChild(bar);
    body.appendChild(createTileControls(viewport, logicalName, vs, tile, playback));

    body.addEventListener('dblclick', (e) => {
        if (e.target.closest('.tile-controls, .tile-bar')) {
            return;
        }
        const si = slotIndexOfTile(tile);
        if (si < 0) {
            return;
        }
        if (state.focusSlot === si) {
            exitFocus();
        } else if (state.focusSlot === null) {
            enterFocus(si);
        }
    });

    if (isTouchDevice()) {
        tile.addEventListener('click', (e) => {
            if (e.target.closest('.tile-controls button, .tile-focus-btn')) {
                return;
            }
            if (state.focusSlot !== null) {
                return;
            }
            setActiveTile(tile);
            bumpChrome();
        });
    }

    tile.appendChild(body);
    return tile;
}

function swapSlots(a, b) {
    if (a === b || Number.isNaN(a) || Number.isNaN(b)) {
        return;
    }

    const tmp = state.slots[a];
    state.slots[a] = state.slots[b];
    state.slots[b] = tmp;

    const cellA = getTileCell(a);
    const cellB = getTileCell(b);
    if (cellA && cellB) {
        const tileA = cellA.querySelector(':scope > .tile');
        const tileB = cellB.querySelector(':scope > .tile');
        if (tileA) {
            cellA.removeChild(tileA);
        }
        if (tileB) {
            cellB.removeChild(tileB);
        }
        if (tileB) {
            cellA.appendChild(tileB);
        }
        if (tileA) {
            cellB.appendChild(tileA);
        }
        cellA.classList.toggle('empty', !slotStream(state.slots[a]));
        cellB.classList.toggle('empty', !slotStream(state.slots[b]));
    }

    swapMapEntry(state.tileViewports, a, b);
    swapMapEntry(state.recorders, a, b);

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

export {applyWallLayoutClasses};
