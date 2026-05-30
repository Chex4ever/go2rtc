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
        return {
            index,
            url,
            format: p.format_name || '',
            protocol: p.protocol || '',
            remote: p.remote_addr || '',
            bytes_recv: bytes,
            medias: p.medias?.length ?? 0,
            receivers: p.receivers?.length ?? 0,
            senders: p.senders?.length ?? 0,
            online: bytes != null && bytes > 0,
        };
    });
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

function collectEventText(events) {
    return (events || []).map((e) => `${e.type} ${e.detail || ''}`.toLowerCase()).join(' ');
}

function buildDiagnosis(report) {
    const hints = [];
    const playback = report.streams?.playback;
    const player = report.player || {};
    const events = collectEventText(player.events);
    const videoErr = player.video?.errorMessage || player.video?.error || '';
    const wsErrors = (player.events || [])
        .filter((e) => e.type === 'ws-error')
        .map((e) => e.detail)
        .join(' ');

    if (playback?.error) {
        hints.push(`Stream "${playback.name}" is missing from go2rtc — add it to streams: in go2rtc.yaml.`);
    }

    for (const p of playback?.producerDetails || []) {
        if (!p.url) {
            hints.push('Producer has no URL — stream never started pulling from camera.');
        } else if (/^mode:/i.test(p.url) || p.url.includes('mode:webrtc')) {
            hints.push(
                `Invalid producer URL "${p.url}" — looks like a player mode string, not rtsp/http/ffmpeg. Fix streams: entry in go2rtc.yaml.`,
            );
        } else if (/unsupported scheme/i.test(wsErrors) || /unsupported scheme/i.test(events)) {
            hints.push(
                `go2rtc rejected URL scheme (${p.url}). Use rtsp://, http(s)://, ffmpeg:, or other supported schemes — not "mode:webrtc".`,
            );
        }
        if (p.bytes_recv === 0 || (p.bytes_recv == null && playback?.producers > 0)) {
            hints.push(
                `Camera source not delivering data (${p.url}). Check RTSP credentials, firewall, and camera uptime — matches go2rtc log "connection forcibly closed".`,
            );
        }
    }

    if (/empty src attribute/i.test(videoErr) || /empty src attribute/i.test(events)) {
        if (playback?.online) {
            hints.push(
                'Video element has no media yet although go2rtc receives bytes — WebRTC/MSE negotiation may still be in progress; try ↻ Refresh. If persistent, check ws-error lines below.',
            );
        } else {
            hints.push(
                'Video "Empty src attribute" — no frames reached the browser because the upstream stream is offline or failed (fix RTSP/source first).',
            );
        }
    }

    if (player.wsState === 'OPEN' && !player.pcConnected && player.videoSrcObject === false) {
        hints.push(
            `WebSocket OK but WebRTC not connected (mode: ${player.mode}). Look for ws-error events — often upstream stream failure or codec mismatch.`,
        );
    }

    if (player.wsState === 'CONNECTING' || player.wsState === 'CLOSED') {
        hints.push('WebSocket not open — go2rtc unreachable, wrong stream name, or player still connecting (stagger queue).');
    }

    if (report.probe?.ok === false && !report.probe?.error?.includes('abort')) {
        hints.push(
            `Server snapshot failed (${report.probe.status || report.probe.error}) — go2rtc cannot produce a JPEG for this stream.`,
        );
    } else if (report.probe?.ok) {
        hints.push('Server snapshot OK — go2rtc can produce frames; black tile is likely player/WebRTC path, not RTSP.');
    }

    if (!hints.length && !playback?.online) {
        hints.push('Black tile? Check preview stream (*_sub) exists, RTSP URL in config, and stagger delay — try ↻ Refresh on tile.');
    }

    return hints;
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

    const playbackDetail = await fetchStreamDetail(ctx.playbackName);
    if (playbackDetail && !playbackDetail.error) {
        playbackSummary = summarizeStreamEntry(ctx.playbackName, playbackDetail);
    }

    const probeUrl = apiUrl(`/api/frame.jpeg?src=${encodeURIComponent(ctx.playbackName)}&width=320&height=180`);
    const probe = await probeFrame(probeUrl);

    const report = {
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
            wsDecoded: decodeWsStreamName(ctx.src),
            apiStream: apiUrl(`/api/streams?src=${encodeURIComponent(ctx.playbackName)}`),
            probe: probeUrl,
        },
        streams: {
            main: mainSummary,
            preview: previewSummary,
            playback: playbackSummary,
            playbackDetailError: playbackDetail?.error || null,
            fetchError: streamsError,
        },
        probe,
        player: playerSnapshot(ctx.vs),
    };
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
        renderSection('Server snapshot probe', [
            ['URL', report.urls.probe],
            ['Result', report.probe?.ok ? 'OK' : 'failed'],
            ['HTTP', report.probe?.status],
            ['Bytes', report.probe?.bytes],
            ['Error', report.probe?.error],
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

    if (report.diagnosis?.length) {
        const list = report.diagnosis.map((h) => `<li>${escapeHtml(h)}</li>`).join('');
        parts.push(`<section class="tile-debug-section"><h3>Diagnosis</h3><ul class="tile-debug-events">${list}</ul></section>`);
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
