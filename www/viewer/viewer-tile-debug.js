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

const READY_STATES = ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'];
const NETWORK_STATES = ['EMPTY', 'IDLE', 'LOADING', 'NO_SOURCE'];

function producerBytes(p) {
    if (typeof p?.bytes_recv === 'number') {
        return p.bytes_recv;
    }
    if (typeof p?.Recv === 'number') {
        return p.Recv;
    }
    return null;
}

function producerUrl(p) {
    if (typeof p?.url === 'string') {
        return p.url;
    }
    if (typeof p?.URL === 'string') {
        return p.URL;
    }
    if (typeof p?.source === 'string') {
        return p.source;
    }
    return '';
}

function parseProducers(entry) {
    if (!entry?.producers?.length) {
        return [];
    }
    return entry.producers.map((p, index) => {
        const url = producerUrl(p);
        const bytes = producerBytes(p);
        let state = 'unknown';
        if (isStreamOption(url)) {
            state = 'go2rtc option (mode:webrtc etc.)';
        } else if (bytes != null && bytes > 0) {
            state = 'receiving';
        } else if (bytes === 0) {
            state = 'connected, 0 bytes';
        } else if (url) {
            state = 'idle — RTSP not connected or camera down';
        } else {
            state = 'no URL';
        }
        return {
            index,
            url,
            isOption: isStreamOption(url),
            format: p.format_name || '',
            protocol: p.protocol || '',
            remote: p.remote_addr || '',
            bytes_recv: bytes,
            medias: p.medias?.length ?? 0,
            receivers: p.receivers?.length ?? 0,
            senders: p.senders?.length ?? 0,
            online: bytes != null && bytes > 0,
            state,
        };
    });
}

function isStreamOption(url) {
    if (!url) {
        return false;
    }
    const u = String(url).trim();
    // go2rtc stream list options (see go2rtc README / streams module) — not RTSP URLs
    return /^mode:/i.test(u) || /^video:/i.test(u) || /^audio:/i.test(u);
}

function dialableProducers(producerDetails) {
    return (producerDetails || []).filter((p) => p.url && !p.isOption);
}

function allProducerDetails(report) {
    const out = [];
    for (const key of ['main', 'preview', 'playback']) {
        const s = report.streams?.[key];
        if (!s?.producerDetails?.length) {
            continue;
        }
        for (const p of s.producerDetails) {
            out.push({...p, streamName: s.name, role: key});
        }
    }
    return out;
}

function summarizeStreamEntry(name, entry) {
    if (!entry) {
        return {
            name,
            online: false,
            urls: [],
            recv: null,
            producers: 0,
            producerDetails: [],
            consumers: 0,
            error: 'Not in go2rtc config / api/streams',
        };
    }
    const producerDetails = parseProducers(entry);
    const urls = producerDetails.map((p) => p.url).filter(Boolean);
    let recv = null;
    for (const p of producerDetails) {
        if (p.bytes_recv != null) {
            recv = (recv ?? 0) + p.bytes_recv;
        }
    }
    const hasActiveProducer = producerDetails.some((p) => p.online);
    return {
        name,
        online: hasActiveProducer,
        urls,
        recv,
        producers: producerDetails.length,
        producerDetails,
        consumers: entry.consumers?.length ?? 0,
    };
}

async function fetchStreamDetail(name) {
    if (!name) {
        return null;
    }
    try {
        return await api('GET', `/api/streams?src=${encodeURIComponent(name)}`);
    } catch (e) {
        return {error: e?.message || String(e)};
    }
}

async function probeFrame(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
        const res = await fetch(url, {credentials: 'include', signal: ctrl.signal});
        const len = res.headers.get('content-length');
        return {
            ok: res.ok,
            status: res.status,
            bytes: len ? Number(len) : null,
            contentType: res.headers.get('content-type') || '',
        };
    } catch (e) {
        return {ok: false, error: e?.message || String(e)};
    } finally {
        clearTimeout(timer);
    }
}

async function fetchAbout() {
    try {
        return await api('GET', '/api/viewer/about');
    } catch {
        return null;
    }
}

function invalidConfigSources(report) {
    return allProducerDetails(report).filter((p) => p.url && !p.isOption && !/^rtsp:|^http|^ffmpeg:|^onvif:|^webrtc:/i.test(p.url));
}

function buildPipeline(report) {
    const playback = report.streams?.playback;
    const player = report.player || {};
    const playbackProducers = playback?.producerDetails || [];
    const rtspProducers = dialableProducers(playbackProducers).filter((p) => /^rtsp:/i.test(p.url));
    const rtspLive = rtspProducers.some((p) => p.bytes_recv != null && p.bytes_recv > 0);
    const hasVideo = Boolean(player.videoSrcObject) || (player.video?.videoWidth > 0);
    const connect = report.connectTest || {};
    const yamlSources = playbackProducers
        .map((p) => (p.isOption ? `${p.url} (option)` : p.url))
        .filter(Boolean)
        .join(' | ');

    return [
        {
            step: '1. Stream name in go2rtc.yaml',
            ok: !playback?.error,
            detail: playback?.error || playback?.name || '—',
        },
        {
            step: '2. YAML sources (playback stream)',
            ok: rtspProducers.length > 0,
            detail: yamlSources || 'no dialable source URL',
        },
        {
            step: '3. go2rtc connect test GET /api/streams?src=…',
            ok: connect.ok === true,
            detail: connect.ok
                ? 'AddConsumer OK — server can open this stream'
                : connect.error || 'failed (see go2rtc log)',
        },
        {
            step: '4. RTSP receiving bytes (bytes_recv > 0)',
            ok: rtspLive,
            detail: rtspProducers.length
                ? rtspProducers.map((p) => `${p.url} → ${p.bytes_recv ?? 0} B`).join(' | ')
                : 'no active RTSP session',
        },
        {
            step: '5. Snapshot /api/frame.jpeg',
            ok: Boolean(report.probe?.ok),
            detail: report.probe?.ok
                ? `HTTP ${report.probe.status}, ${report.probe.bytes ?? '?'} bytes`
                : report.probe?.error || `HTTP ${report.probe?.status ?? 'failed'}`,
        },
        {
            step: '6. Browser WebSocket',
            ok: player.wsState === 'OPEN',
            detail: `${player.wsState || '?'} → ${report.urls?.wsDecoded || '—'}`,
        },
        {
            step: '7. Browser video track',
            ok: hasVideo || player.pcConnected,
            detail: hasVideo
                ? `${player.video?.width || 0}×${player.video?.height || 0}`
                : `pc=${player.pcConnectionState || 'not connected'}, srcObject=${player.videoSrcObject ? 'yes' : 'no'}`,
        },
    ];
}

function renderPipelineHtml(pipeline) {
    if (!pipeline?.length) {
        return '';
    }
    const rows = pipeline
        .map((s) => {
            const cls = s.ok ? 'tile-debug-ok' : 'tile-debug-warn';
            const mark = s.ok ? '✓' : '✗';
            return `<li class="${cls}"><strong>${escapeHtml(mark)} ${escapeHtml(s.step)}</strong><br><code>${escapeHtml(s.detail)}</code></li>`;
        })
        .join('');
    return `<section class="tile-debug-section"><h3>Where it breaks (first ✗ is the problem)</h3><ul class="tile-debug-events tile-debug-pipeline">${rows}</ul></section>`;
}

function buildDiagnosis(report) {
    const hints = [];
    const playback = report.streams?.playback;
    const player = report.player || {};
    const pipeline = report.pipeline || buildPipeline(report);
    const failedStep = pipeline.find((s) => !s.ok);
    const connectErr = report.connectTest?.error || '';

    if (report.server?.viewer_ui_version && report.server.viewer_ui_version < '1.2.6') {
        hints.push(
            `Old viewer UI (${report.server.viewer_ui_version}) — replace go2rtc.exe with v1.2.6+ and reload (Ctrl+R) for pipeline debug.`,
        );
    }

    for (const p of invalidConfigSources(report)) {
        hints.push(`Unknown source scheme on "${p.streamName}": ${p.url} — check go2rtc streams docs.`);
    }

    if (connectErr.includes('forcibly closed') || connectErr.includes('connection refused')) {
        hints.push(
            `RTSP rejected by camera/NVR (step 3): ${connectErr}. For Hikvision ISAPI channel 102 — verify substream enabled, user/password, max RTSP clients, same NVR as channel 101.`,
        );
    } else if (connectErr && report.connectTest?.ok === false) {
        hints.push(`go2rtc connect failed (step 3): ${connectErr}`);
    }

    if (failedStep?.step.startsWith('4.') && !connectErr) {
        hints.push(
            'RTSP session idle (0 bytes) — stream name exists but camera not sending. Open go2rtc web UI → Streams → click stream name to test.',
        );
    }

    if (failedStep?.step.startsWith('5.')) {
        hints.push(`Snapshot failed — open ${report.urls?.probe} in browser tab (same error as go2rtc log).`);
    }

    if (failedStep?.step.startsWith('7.') && report.probe?.ok) {
        hints.push('Camera OK on server; browser player stuck — try ↻ Refresh on tile or check ws-error events below.');
    }

    if (playback?.producerDetails?.some((p) => p.isOption)) {
        hints.push(
            'Note: mode:webrtc in yaml is a valid go2rtc stream option on main streams. Log line "unsupported scheme: mode:webrtc" on dial is normal; it is not your black-tile cause unless step 3 fails only for that reason.',
        );
    }

    const wsErrors = (player.events || [])
        .filter((e) => e.type === 'ws-error')
        .map((e) => e.detail)
        .join(' ');
    if (wsErrors) {
        hints.push(`Browser WebSocket errors from go2rtc: ${wsErrors}`);
    }

    if (player.wsState === 'OPEN' && !player.videoSrcObject && !player.pcConnected && failedStep?.step.startsWith('7.')) {
        hints.push('WebSocket open but no video — fix steps 3–5 first (RTSP upstream).');
    }

    if (!hints.length && failedStep) {
        hints.push(`First failing step: ${failedStep.step} — ${failedStep.detail}`);
    }

    return [...new Set(hints)];
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

function decodeWsStreamName(src) {
    const raw = (src.match(/src=([^&]+)/) || [])[1] || '';
    if (!raw) {
        return '';
    }
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

function playerSnapshot(vs) {
    if (!vs) {
        return {error: 'viewer-stream element missing'};
    }
    const snap = typeof vs.getDebugSnapshot === 'function' ? vs.getDebugSnapshot() : {};
    const video = videoSnapshot(vs.video);
    return {
        wsURL: vs.wsURL || vs.src || '',
        mode: vs.mode,
        wsState: WS_STATES[vs.wsState] ?? String(vs.wsState),
        pcConnected: vs.pcState === WebSocket.OPEN,
        pcConnectionState: snap.pcConnectionState || '',
        iceConnectionState: snap.iceConnectionState || '',
        videoSrcObject: snap.videoSrcObject,
        videoElementSrc: snap.videoElementSrc || '',
        mseCodecs: snap.mseCodecs || '',
        ...snap,
        video,
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
    let playbackSummary = summarizeStreamEntry(ctx.playbackName, streams[ctx.playbackName]);

    const [playbackDetail, mainDetail, serverAbout] = await Promise.all([
        fetchStreamDetail(ctx.playbackName),
        fetchStreamDetail(ctx.logicalName),
        fetchAbout(),
    ]);

    if (playbackDetail && !playbackDetail.error) {
        playbackSummary = summarizeStreamEntry(ctx.playbackName, playbackDetail);
    }
    let mainSummaryDetailed = mainSummary;
    if (mainDetail && !mainDetail.error) {
        mainSummaryDetailed = summarizeStreamEntry(ctx.logicalName, mainDetail);
    }

    const probeUrl = apiUrl(`/api/frame.jpeg?src=${encodeURIComponent(ctx.playbackName)}&width=320&height=180`);
    const probe = await probeFrame(probeUrl);

    const report = {
        generatedAt: new Date().toISOString(),
        server: serverAbout,
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
            wsDecoded: decodeWsStreamName(ctx.src),
            apiStream: apiUrl(`/api/streams?src=${encodeURIComponent(ctx.playbackName)}`),
            probe: probeUrl,
        },
        streams: {
            main: mainSummaryDetailed,
            preview: previewSummary,
            playback: playbackSummary,
            playbackDetailError: playbackDetail?.error || null,
            mainDetailError: mainDetail?.error || null,
            fetchError: streamsError,
        },
        probe,
        connectTest: {
            ok: playbackDetail && !playbackDetail.error,
            error: playbackDetail?.error || null,
        },
        player: playerSnapshot(ctx.vs),
    };
    report.pipeline = buildPipeline(report);
    report.diagnosis = buildDiagnosis(report);
    return report;
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
    const parts = [];

    if (report.server?.viewer_ui_version) {
        parts.push(
            renderSection('Server / viewer build', [
                ['go2rtc', report.server.go2rtc_version],
                ['Viewer UI', report.server.viewer_ui_version],
                ['Tile debug v2', report.server.features?.tile_debug ? 'yes' : 'no'],
            ]),
        );
    }

    parts.push(renderPipelineHtml(report.pipeline));

    if (report.diagnosis?.length) {
        const list = report.diagnosis.map((h) => `<li>${escapeHtml(h).replace(/\n/g, '<br>')}</li>`).join('');
        parts.push(`<section class="tile-debug-section"><h3>What to fix</h3><ul class="tile-debug-events">${list}</ul></section>`);
    }

    parts.push(
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
            ['WebRTC peer', report.player.pcConnectionState || (report.player.pcConnected ? 'connected' : 'not connected')],
            ['ICE', report.player.iceConnectionState || '—'],
            ['video.srcObject', report.player.videoSrcObject ? 'yes' : 'no'],
            ['video.src', report.player.videoElementSrc || '(empty — normal for WebRTC/MSE)'],
            ['Connected for (ms)', report.player.connectAgeMs],
            ['Video size', report.player.video ? `${report.player.video.width}×${report.player.video.height}` : '—'],
            ['Video ready', READY_STATES[report.player.video?.readyState] ?? report.player.video?.readyState],
            ['Video network', NETWORK_STATES[report.player.video?.networkState] ?? report.player.video?.networkState],
            ['Video error', report.player.video?.errorMessage || report.player.video?.error],
        ]),
        renderSection('Server connect test', [
            ['GET', report.urls.apiStream],
            ['Result', report.connectTest?.ok ? 'OK' : 'failed'],
            ['go2rtc error', report.connectTest?.error || '—'],
        ]),
        renderSection('Server snapshot probe', [
            ['URL', report.urls.probe],
            ['Result', report.probe?.ok ? 'OK' : 'failed'],
            ['HTTP', report.probe?.status],
            ['Bytes', report.probe?.bytes],
            ['Error', report.probe?.error],
        ]),
    );

    for (const key of ['main', 'preview', 'playback']) {
        const s = report.streams[key];
        if (!s) {
            continue;
        }
        parts.push(
            renderSection(`go2rtc stream: ${s.name}`, [
                ['In config', s.error ? 'no' : 'yes'],
                ['Receiving bytes', s.recv ?? '0 / offline'],
                ['Producers', s.producers],
                ['Consumers', s.consumers ?? '—'],
                ['Producer URLs', (s.urls || []).join(' | ') || '—'],
                ['Status', s.error || (s.online ? 'active' : 'idle / no bytes')],
            ]),
        );
        for (const p of s.producerDetails || []) {
            parts.push(
                renderSection(`Producer #${p.index} (${s.name})`, [
                    ['URL', p.url || '—'],
                    ['State', p.state || '—'],
                    ['Option?', p.isOption ? 'yes (mode:webrtc etc.)' : 'no'],
                    ['Format', p.format || '—'],
                    ['Protocol', p.protocol || '—'],
                    ['Remote', p.remote || '—'],
                    ['bytes_recv', p.bytes_recv ?? '0'],
                    ['Medias', p.medias],
                    ['Receivers', p.receivers],
                ]),
            );
        }
    }

    if (report.streams.fetchError) {
        parts.push(`<p class="tile-debug-warn">${escapeHtml(report.streams.fetchError)}</p>`);
    }
    if (report.streams.playbackDetailError) {
        parts.push(`<p class="tile-debug-warn">Stream detail: ${escapeHtml(report.streams.playbackDetailError)}</p>`);
    }

    if (report.streams.mainDetailError) {
        parts.push(`<p class="tile-debug-warn">Main stream detail: ${escapeHtml(report.streams.mainDetailError)}</p>`);
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
