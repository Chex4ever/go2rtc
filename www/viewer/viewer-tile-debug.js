import {api, apiUrl} from './viewer-api.js';
import {state} from './viewer-state.js';

const MEDIA_ERRORS = {
    1: 'MEDIA_ERR_ABORTED',
    2: 'MEDIA_ERR_NETWORK',
    3: 'MEDIA_ERR_DECODE',
    4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
};

const WS_STATES = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];

let dialogEl;

function ensureDialog() {
    if (dialogEl) {
        return dialogEl;
    }
    dialogEl = document.createElement('dialog');
    dialogEl.id = 'tile-debug-dialog';
    dialogEl.className = 'tile-debug-dialog';
    dialogEl.innerHTML = `
        <form method="dialog" class="tile-debug-panel">
            <header class="tile-debug-header">
                <h2 id="tile-debug-title">Camera debug</h2>
                <button type="submit" class="tile-debug-close" aria-label="Close">✕</button>
            </header>
            <div id="tile-debug-body" class="tile-debug-body"></div>
            <footer class="tile-debug-footer">
                <button type="button" id="tile-debug-refresh" class="primary">Refresh</button>
                <button type="button" id="tile-debug-copy">Copy report</button>
                <button type="submit">Close</button>
            </footer>
        </form>`;
    document.body.appendChild(dialogEl);
    return dialogEl;
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function streamUrls(entry) {
    if (typeof entry === 'string') {
        return [entry];
    }
    if (Array.isArray(entry)) {
        return entry;
    }
    if (entry?.producers?.length) {
        const urls = [];
        for (const p of entry.producers) {
            if (typeof p?.url === 'string') {
                urls.push(p.url);
            } else if (typeof p?.source === 'string') {
                urls.push(p.source);
            }
        }
        if (urls.length) {
            return urls;
        }
    }
    return [];
}

function summarizeStreamEntry(name, entry) {
    if (!entry) {
        return {name, online: false, urls: [], recv: null, error: 'Not in go2rtc config / api/streams'};
    }
    const urls = streamUrls(entry);
    let recv = null;
    if (entry?.producers) {
        let total = 0;
        let any = false;
        for (const p of entry.producers) {
            if (typeof p.bytes_recv === 'number') {
                total += p.bytes_recv;
                any = true;
            }
        }
        recv = any ? total : null;
    }
    return {
        name,
        online: recv != null,
        urls,
        recv,
        producers: entry.producers?.length ?? 0,
    };
}

function videoSnapshot(video) {
    if (!video) {
        return null;
    }
    const err = video.error;
    return {
        readyState: video.readyState,
        networkState: video.networkState,
        paused: video.paused,
        muted: video.muted,
        width: video.videoWidth,
        height: video.videoHeight,
        currentTime: video.currentTime,
        error: err ? MEDIA_ERRORS[err.code] || err.code : null,
        errorMessage: err?.message || null,
    };
}

function playerSnapshot(vs) {
    if (!vs) {
        return {error: 'viewer-stream element missing'};
    }
    const snap = typeof vs.getDebugSnapshot === 'function' ? vs.getDebugSnapshot() : {};
    return {
        wsURL: vs.wsURL || vs.src || '',
        mode: vs.mode,
        wsState: WS_STATES[vs.wsState] ?? String(vs.wsState),
        pcConnected: vs.pcState === 1,
        ...snap,
        video: videoSnapshot(vs.video),
    };
}

/**
 * @param {object} ctx
 * @param {string} ctx.logicalName
 * @param {string} ctx.playbackName
 * @param {string} ctx.src
 * @param {HTMLElement} ctx.vs
 * @param {number} ctx.slotIndex
 * @param {boolean} ctx.inFocus
 */
export async function buildTileDebugReport(ctx) {
    const layout = state.layoutDetail;
    const preview = layout?.preview?.[ctx.logicalName] || null;
    let streams = {};
    let streamsError = null;
    try {
        streams = (await api('GET', '/api/streams')) || {};
    } catch (e) {
        streamsError = e?.message || String(e);
    }

    const mainSummary = summarizeStreamEntry(ctx.logicalName, streams[ctx.logicalName]);
    const previewSummary = preview ? summarizeStreamEntry(preview, streams[preview]) : null;
    const playbackSummary = summarizeStreamEntry(ctx.playbackName, streams[ctx.playbackName]);

    return {
        generatedAt: new Date().toISOString(),
        layout: {
            id: layout?.id ?? state.currentLayoutId,
            grid: layout?.grid,
            slot: ctx.slotIndex,
            inFocus: ctx.inFocus,
        },
        channels: {
            main: ctx.logicalName,
            preview,
            playback: ctx.playbackName,
            label: preview && !ctx.inFocus ? `${ctx.logicalName} → ${preview}` : ctx.logicalName,
        },
        urls: {
            ws: ctx.src,
            wsDecoded: decodeURIComponent((ctx.src.match(/src=([^&]+)/) || [])[1] || ''),
            apiStream: apiUrl(`/api/streams?src=${encodeURIComponent(ctx.playbackName)}`),
            probe: apiUrl(`/api/frame.jpeg?src=${encodeURIComponent(ctx.playbackName)}&width=320&height=180`),
        },
        streams: {
            main: mainSummary,
            preview: previewSummary,
            playback: playbackSummary,
            fetchError: streamsError,
        },
        player: playerSnapshot(ctx.vs),
    };
}

function renderSection(title, rows) {
    const lines = rows
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td><code>${escapeHtml(String(v))}</code></td></tr>`)
        .join('');
    if (!lines) {
        return '';
    }
    return `<section class="tile-debug-section"><h3>${escapeHtml(title)}</h3><table class="tile-debug-table">${lines}</table></section>`;
}

function renderReportHtml(report) {
    const parts = [
        renderSection('Layout & channels', [
            ['Layout', report.layout.id],
            ['Grid', report.layout.grid],
            ['Slot', report.layout.slot],
            ['Focus mode', report.layout.inFocus ? 'yes' : 'no'],
            ['Main stream', report.channels.main],
            ['Preview stream', report.channels.preview || '(none)'],
            ['Now playing', report.channels.playback],
        ]),
        renderSection('WebSocket / player', [
            ['WS URL', report.urls.ws],
            ['Stream name', report.urls.wsDecoded],
            ['Mode', report.player.mode],
            ['WebSocket', report.player.wsState],
            ['WebRTC', report.player.pcConnected ? 'connected' : 'not connected'],
            ['Connected for (ms)', report.player.connectAgeMs],
            ['Video size', report.player.video ? `${report.player.video.width}×${report.player.video.height}` : '—'],
            ['Video state', report.player.video?.readyState],
            ['Network state', report.player.video?.networkState],
            ['Video error', report.player.video?.error],
        ]),
    ];

    for (const key of ['main', 'preview', 'playback']) {
        const s = report.streams[key];
        if (!s) {
            continue;
        }
        parts.push(
            renderSection(`go2rtc stream: ${s.name}`, [
                ['In config', s.error ? 'no' : 'yes'],
                ['Receiving bytes', s.recv ?? 'offline / no producer'],
                ['Producer URLs', (s.urls || []).join(' | ') || '—'],
                ['Status', s.error || (s.online ? 'active' : 'idle')],
            ]),
        );
    }

    if (report.streams.fetchError) {
        parts.push(`<p class="tile-debug-warn">${escapeHtml(report.streams.fetchError)}</p>`);
    }

    const events = report.player.events || [];
    if (events.length) {
        const evHtml = events
            .slice(-15)
            .reverse()
            .map((e) => `<li><time>${escapeHtml(new Date(e.t).toISOString().slice(11, 19))}</time> ${escapeHtml(e.type)}${e.detail ? `: ${escapeHtml(e.detail)}` : ''}</li>`)
            .join('');
        parts.push(`<section class="tile-debug-section"><h3>Recent events</h3><ul class="tile-debug-events">${evHtml}</ul></section>`);
    }

    if (!report.streams.main.error && !report.streams.playback.online && !report.player.pcConnected) {
        parts.push(
            '<p class="tile-debug-hint">Black tile? Check preview stream exists (*_sub), RTSP URL in config, and stagger delay (150ms) — try ↻ Refresh on tile.</p>',
        );
    }

    return parts.join('');
}

function reportText(report) {
    return JSON.stringify(report, null, 2);
}

/**
 * @param {object} ctx — same as buildTileDebugReport
 */
export async function openTileDebugModal(ctx) {
    const dlg = ensureDialog();
    const title = dlg.querySelector('#tile-debug-title');
    const body = dlg.querySelector('#tile-debug-body');
    const btnRefresh = dlg.querySelector('#tile-debug-refresh');
    const btnCopy = dlg.querySelector('#tile-debug-copy');

    title.textContent = `Debug: ${ctx.logicalName}`;
    body.innerHTML = '<p class="tile-debug-loading">Loading…</p>';

    let lastReport = null;

    const refresh = async () => {
        body.innerHTML = '<p class="tile-debug-loading">Loading…</p>';
        try {
            lastReport = await buildTileDebugReport(ctx);
            body.innerHTML = renderReportHtml(lastReport);
        } catch (e) {
            body.innerHTML = `<p class="tile-debug-warn">${escapeHtml(e?.message || String(e))}</p>`;
        }
    };

    btnRefresh.onclick = () => refresh();
    btnCopy.onclick = async () => {
        if (!lastReport) {
            await refresh();
        }
        try {
            await navigator.clipboard.writeText(reportText(lastReport));
            btnCopy.textContent = 'Copied';
            setTimeout(() => {
                btnCopy.textContent = 'Copy report';
            }, 1500);
        } catch {
            btnCopy.textContent = 'Copy failed';
        }
    };

    if (!dlg.open) {
        dlg.showModal();
    }
    await refresh();
}
