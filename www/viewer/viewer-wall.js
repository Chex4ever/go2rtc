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

export function exitFocus() {
    if (state.focusSlot === null) {
        return;
    }
    stopAllRecordings();
    state.focusSlot = null;
    const wall = $('#screen-wall');
    wall?.classList.remove('focus-mode', 'chrome-hidden', 'show-top-chrome');
    $('#btn-exit-focus')?.classList.add('hidden');
    renderWall();
    startChromeHide();
}

export function enterFocus(slotIndex) {
    if (!slotStream(state.slots[slotIndex])) {
        return;
    }
    state.focusSlot = slotIndex;
    renderWall();
    const wall = $('#screen-wall');
    wall.classList.add('focus-mode', 'chrome-hidden');
    wall.classList.remove('show-top-chrome');
    $('#btn-exit-focus')?.classList.remove('hidden');
    clearTimeout(state.chromeTimer);
    state.chromeTimer = null;
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
        if (focusSlot !== null && focusSlot !== i) {
            continue;
        }
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
            cell.appendChild(createTile(stream, i, focusSlot === i, connectSeq++));
        }
        wallGrid.appendChild(cell);
    }

    if (focusSlot !== null) {
        $('#screen-wall').classList.add('focus-mode');
        $('#btn-exit-focus')?.classList.remove('hidden');
    }
}

function createTileControls(viewport, streamName, slotIndex, src, vs, inFocus, tile, playbackName) {
    const channelLabel = inFocus ? 'main' : 'preview';
    const bar = document.createElement('div');
    bar.className = 'tile-controls';
    bar.innerHTML = `
        <button type="button" data-act="fit" title="Aspect ratio (${channelLabel})">◫</button>
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
        ${inFocus ? '<button type="button" data-act="exit-focus" title="Back to grid (Esc)">←</button>' : '<button type="button" data-act="focus" title="Full screen">⛶</button>'}
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
                btn.title = `Aspect (${channelLabel}): ${fit}`;
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
                const on = toggleStreamAudio(vs, src);
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
                refreshStream(vs, src);
                break;
            case 'debug':
                openTileDebugModal({
                    logicalName: streamName,
                    playbackName,
                    src,
                    vs,
                    slotIndex,
                    inFocus,
                }).catch((err) => {
                    btn.title = err?.message || 'Debug failed';
                });
                break;
            case 'focus':
                enterFocus(slotIndex);
                break;
            case 'exit-focus':
                exitFocus();
                break;
        }
    });

    return bar;
}

function scheduleStreamSrc(vs, src, connectIndex) {
    const apply = () => {
        if (!vs.isConnected) {
            return;
        }
        vs.src = src;
    };
    const delay = connectIndex * STREAM_CONNECT_STAGGER_MS;
    if (delay > 0) {
        setTimeout(apply, delay);
    } else {
        requestAnimationFrame(apply);
    }
}

function createTile(logicalName, slotIndex, inFocus, connectIndex = 0) {
    const playback = playbackStream(logicalName, inFocus);
    const src = streamSrc(playback);
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.logicalStream = logicalName;

    const bar = document.createElement('div');
    bar.className = 'tile-bar';
    bar.innerHTML = `<span class="name">${escapeHtml(tileLabel(logicalName, inFocus))}</span><span class="drag-handle" title="Drag to swap">⠿</span>`;

    if (inFocus) {
        bar.querySelector('.drag-handle')?.remove();
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'tile-focus-btn';
        back.textContent = '←';
        back.title = 'Back to grid (Esc)';
        back.addEventListener('click', (e) => {
            e.stopPropagation();
            exitFocus();
        });
        bar.appendChild(back);
    } else if (allowTileDrag()) {
        const handle = bar.querySelector('.drag-handle');
        handle.draggable = true;
        handle.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            e.dataTransfer.setData('text/slot', String(slotIndex));
            e.dataTransfer.effectAllowed = 'move';
            tile.classList.add('dragging');
        });
        handle.addEventListener('dragend', () => tile.classList.remove('dragging'));
    } else {
        bar.querySelector('.drag-handle')?.remove();
        const expand = document.createElement('button');
        expand.type = 'button';
        expand.className = 'tile-focus-btn';
        expand.textContent = '⛶';
        expand.title = 'Full screen';
        expand.addEventListener('click', (e) => {
            e.stopPropagation();
            enterFocus(slotIndex);
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
    viewport.fromJSON(loadTileSettings(slotIndex, inFocus));
    viewport.onChange = () => saveTileSettings(slotIndex, viewport, inFocus);
    state.tileViewports.set(slotIndex, viewport);

    body.appendChild(viewportWrap);
    body.appendChild(bar);
    body.appendChild(createTileControls(viewport, logicalName, slotIndex, src, vs, inFocus, tile, playback));

    body.addEventListener('dblclick', (e) => {
        if (e.target.closest('.tile-controls, .tile-bar')) {
            return;
        }
        if (!inFocus) {
            enterFocus(slotIndex);
        }
    });

    if (isTouchDevice() && !inFocus) {
        tile.addEventListener('click', (e) => {
            if (e.target.closest('.tile-controls button, .tile-focus-btn')) {
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

export {applyWallLayoutClasses};
