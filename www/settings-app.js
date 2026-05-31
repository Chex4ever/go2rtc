/**
 * go2rtc Settings tab — friendly forms + ONVIF dual-channel cameras.
 */

/** @see viewer/stream-pairs.js — duplicated here so config.html works without ES modules */
function suggestPreviewStream(main, streams) {
    if (!main || !streams?.length) {
        return null;
    }
    const names = new Set(streams);
    const exact = [
        `${main}_sub`,
        `${main}_substream`,
        `${main}_preview`,
        `${main}_low`,
        `${main}_substream1`,
        `${main}2`,
        `${main}_2`,
        `${main}-sub`,
        `${main}_chn2`,
        `${main}_channel2`,
        `${main}02`,
        `${main}_102`,
    ];
    for (const c of exact) {
        if (names.has(c)) {
            return c;
        }
    }
    const mainLower = main.toLowerCase();
    for (const s of streams) {
        if (s === main) {
            continue;
        }
        const lower = s.toLowerCase();
        if (!lower.startsWith(mainLower)) {
            continue;
        }
        const tail = lower.slice(mainLower.length);
        if (/^[_-]?(sub|preview|low|minor|chn2|channel2|stream2|102|02|2)/.test(tail)) {
            return s;
        }
    }
    return null;
}

const $ = (sel, root = document) => root.querySelector(sel);

function yamlLoad(text) {
    if (!window.jsyaml) {
        throw new Error('js-yaml not loaded');
    }
    return window.jsyaml.load(text) || {};
}

function yamlDump(obj) {
    return window.jsyaml.dump(obj, {lineWidth: 120, noRefs: true});
}

const state = {
    config: {},
    streams: {},
    onvifDevices: [],
    onvifProfiles: [],
    probeSrc: '',
    serviceBusy: false,
    updaterBusy: false,
    settingsLoaded: false,
    bandwidth: {},
    bandwidthPollId: null,
    settingsTabActive: false,
};

function setStatus(msg, isError = false) {
    const el = $('#settings-save-status');
    if (el) {
        el.textContent = msg || '';
        el.className = 'settings-status' + (isError ? ' err' : msg ? ' ok' : '');
    }
    const cam = $('#camera-actions-status');
    if (cam && msg) {
        cam.textContent = msg;
        cam.className = 'settings-status' + (isError ? ' err' : ' ok');
    }
}

function apiFetch(url, opts = {}) {
    return fetch(url, {credentials: 'include', cache: 'no-cache', ...opts});
}

function apiUrl(path) {
    return new URL(path, location.href).href;
}

function formatFetchError(err, url) {
    const msg = err?.message || String(err);
    if (msg === 'Failed to fetch' || err instanceof TypeError) {
        return (
            `Cannot reach go2rtc API (${url}). ` +
            'Check that go2rtc is running and this page URL matches api.listen in go2rtc.yaml.'
        );
    }
    return msg;
}

async function fetchConfig() {
    const r = await apiFetch('api/config');
    if (r.status === 410) {
        throw new Error('Config file is disabled (run with -config path)');
    }
    if (!r.ok) {
        throw new Error(r.statusText || String(r.status));
    }
    state.config = yamlLoad(await r.text());
}

async function patchConfig(partial) {
    const r = await apiFetch('api/config', {
        method: 'PATCH',
        headers: {'Content-Type': 'application/yaml'},
        body: yamlDump(partial),
    });
    if (!r.ok) {
        throw new Error(await r.text() || r.statusText);
    }
    await fetchConfig();
}

async function loadStreams() {
    const r = await apiFetch('api/streams');
    if (!r.ok) {
        throw new Error(await r.text() || r.statusText);
    }
    state.streams = await r.json();
}

function fillSettingsForm() {
    const api = state.config.api || {};
    const viewer = state.config.viewer || {};
    $('#set-api-listen').value = api.listen || ':1984';
    $('#set-api-user').value = api.username || '';
    $('#set-api-pass').value = api.password || '';
    $('#set-viewer-admin').value = viewer.admin_password || '';
    $('#set-viewer-session').value = viewer.session_ttl || '24h';
    $('#set-viewer-trust').value = viewer.trust_ip_ttl || '720h';
    $('#set-viewer-secure').checked = !!viewer.cookie_secure;
}

function readSettingsPatch() {
    const patch = {
        api: {},
        viewer: {},
    };
    const listen = $('#set-api-listen').value.trim();
    if (listen) {
        patch.api.listen = listen;
    }
    const user = $('#set-api-user').value.trim();
    const pass = $('#set-api-pass').value;
    if (user) {
        patch.api.username = user;
    }
    if (pass) {
        patch.api.password = pass;
    }
    const admin = $('#set-viewer-admin').value;
    if (admin) {
        patch.viewer.admin_password = admin;
    }
    const session = $('#set-viewer-session').value.trim();
    if (session) {
        patch.viewer.session_ttl = session;
    }
    const trust = $('#set-viewer-trust').value.trim();
    if (trust) {
        patch.viewer.trust_ip_ttl = trust;
    }
    patch.viewer.cookie_secure = $('#set-viewer-secure').checked;
    return patch;
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

/** URLs from go2rtc.yaml (full credentials — api/streams redacts them). */
function streamConfigUrls(name) {
    const entry = state.config?.streams?.[name];
    if (entry == null) {
        return [];
    }
    if (typeof entry === 'string') {
        return [entry];
    }
    if (Array.isArray(entry)) {
        return entry.filter((u) => typeof u === 'string' && !/^mode:/i.test(u.trim()));
    }
    return [];
}

function isRedactedUrl(url) {
    return typeof url === 'string' && /:\*\*\*(:?\*\*\*)?@/.test(url);
}

/** Prefer yaml sources for display, copy, and VLC; fall back to api/streams. */
function streamDisplayUrls(name) {
    const fromConfig = streamConfigUrls(name);
    if (fromConfig.length) {
        return fromConfig;
    }
    return streamUrls(state.streams[name]);
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
}

function groupCameraRows() {
    const names = Object.keys(state.streams).sort();
    const shown = new Set();
    const rows = [];

    for (const name of names) {
        if (shown.has(name)) {
            continue;
        }
        const subName = `${name}_sub`;
        const hasSub = names.includes(subName);
        if (hasSub) {
            shown.add(name);
            shown.add(subName);
            rows.push({
                name,
                main: streamDisplayUrls(name)[0] || '',
                sub: streamDisplayUrls(subName)[0] || '',
                subName,
            });
            continue;
        }
        if (name.endsWith('_sub')) {
            const base = name.slice(0, -4);
            if (names.includes(base)) {
                continue;
            }
        }
        shown.add(name);
        const guess = suggestPreviewStream(name, names);
        rows.push({
            name,
            main: streamDisplayUrls(name)[0] || '',
            sub: '',
            subName,
            guessedPreview: guess && guess !== name ? guess : '',
        });
    }
    return rows;
}

function streamEntryRecv(entry) {
    if (!entry || typeof entry === 'string') {
        return null;
    }
    const producers = entry.producers;
    if (!Array.isArray(producers)) {
        return null;
    }
    let total = 0;
    let any = false;
    for (const p of producers) {
        if (p && typeof p.bytes_recv === 'number') {
            total += p.bytes_recv;
            any = true;
        }
    }
    return any ? total : null;
}

function formatKbps(bytesPerSec) {
    if (bytesPerSec == null || Number.isNaN(bytesPerSec)) {
        return '—';
    }
    if (bytesPerSec <= 0) {
        return '0 KB/s';
    }
    const kb = bytesPerSec / 1024;
    if (kb >= 100) {
        return `${Math.round(kb)} KB/s`;
    }
    if (kb >= 10) {
        return `${kb.toFixed(1)} KB/s`;
    }
    return `${kb.toFixed(2)} KB/s`;
}

function streamRateLabel(streamName) {
    const snap = state.bandwidth[streamName];
    if (!snap) {
        return {text: 'offline', cls: 'offline'};
    }
    if (snap.rate == null) {
        return {text: snap.online ? 'connecting…' : 'offline', cls: 'offline'};
    }
    return {text: formatKbps(snap.rate), cls: ''};
}

function updateBandwidthFromStreams(streams) {
    const now = Date.now();
    for (const [name, entry] of Object.entries(streams)) {
        const bytes = streamEntryRecv(entry);
        const online = bytes != null;
        const prev = state.bandwidth[name];
        let rate = null;
        if (online && prev?.bytes != null && prev.t && now > prev.t) {
            const dt = (now - prev.t) / 1000;
            if (dt > 0.2) {
                const db = bytes - prev.bytes;
                if (db >= 0) {
                    rate = db / dt;
                }
            }
        }
        state.bandwidth[name] = {
            bytes: bytes ?? prev?.bytes ?? null,
            t: now,
            online,
            rate: rate ?? (online && prev?.rate != null ? prev.rate : null),
        };
    }
}

function renderCameraStats() {
    const host = $('#camera-stats-list');
    if (!host) {
        return;
    }
    const rows = groupCameraRows();
    if (!rows.length) {
        host.innerHTML = '<p class="settings-note">No cameras in config yet.</p>';
        return;
    }
    host.innerHTML = '';
    for (const row of rows) {
        const block = document.createElement('div');
        block.className = 'cam-stat-block';
        const mainRate = streamRateLabel(row.name);
        const subRate = row.sub ? streamRateLabel(row.subName) : null;
        let previewLine;
        if (row.sub) {
            previewLine = `
                <div class="cam-stat-line">
                    <span class="label">preview</span>
                    <span class="rate ${subRate.cls}">${escapeHtml(subRate.text)}</span>
                    <code class="stream-url">${escapeHtml(row.sub)}</code>
                    <button type="button" class="linkish" data-copy-stream="${escapeHtml(row.subName)}">Copy</button>
                </div>`;
        } else {
            const hint = row.guessedPreview
                ? ` <span class="rate warn">found as ${escapeHtml(row.guessedPreview)}</span>`
                : '';
            previewLine = `
                <div class="cam-stat-line">
                    <span class="label">preview</span>
                    <button type="button" class="linkish" data-add-preview="${escapeHtml(row.name)}">add preview channel</button>${hint}
                </div>`;
        }
        block.innerHTML = `
            <h3>${escapeHtml(row.name)}</h3>
            <div class="cam-stat-line">
                <span class="label">main</span>
                <span class="rate ${mainRate.cls}">${escapeHtml(mainRate.text)}</span>
                <code class="stream-url">${escapeHtml(row.main)}</code>
                <button type="button" class="linkish" data-copy-stream="${escapeHtml(row.name)}">Copy</button>
            </div>
            ${previewLine}
            <div class="cam-stat-actions">
                <button type="button" data-del-stream="${escapeHtml(row.name)}">Remove main</button>
                ${row.sub ? `<button type="button" data-del-stream="${escapeHtml(row.subName)}">Remove preview</button>` : ''}
            </div>`;
        host.appendChild(block);
    }
}

function subStreamUrlVariants(mainUrl) {
    if (typeof go2rtcSubStreamUrlVariants === 'function') {
        return go2rtcSubStreamUrlVariants(mainUrl);
    }
    return rtspSubUrlVariantsFallback(mainUrl);
}

function rtspStreamsEquivalent(a, b) {
    if (typeof go2rtcRtspStreamsEquivalent === 'function') {
        return go2rtcRtspStreamsEquivalent(a, b);
    }
    return a === b;
}

function mergeRtspCredentials(mainUrl, profileUrl) {
    if (typeof go2rtcMergeRtspCredentials === 'function') {
        return go2rtcMergeRtspCredentials(mainUrl, profileUrl);
    }
    return profileUrl;
}

function preferPreviewUrl(mainUrl, candidateUrl) {
    if (typeof go2rtcPreferPreviewUrl === 'function') {
        return go2rtcPreferPreviewUrl(mainUrl, candidateUrl);
    }
    const variants = subStreamUrlVariants(mainUrl);
    if (!candidateUrl || candidateUrl === mainUrl) {
        return variants[0] || null;
    }
    return candidateUrl;
}

function resolvePreviewStreamUrl(mainUrl, profiles) {
    const list = (profiles || []).filter((p) => p.url && !p.url.includes('snapshot'));
    const resolved = list.filter((p) => onvifProfileRtsp(p));
    let onvifResolved = false;

    if (resolved.length) {
        onvifResolved = true;
        const subProf = pickSubProfile(profiles, mainUrl);
        const rtsp = subProf && onvifProfileRtsp(subProf);
        if (rtsp && !rtspStreamsEquivalent(mainUrl, rtsp)) {
            return mergeRtspCredentials(mainUrl, rtsp);
        }
    }

    if (onvifResolved && isDahuaRealmonitorUrl(mainUrl)) {
        // Dahua ONVIF often maps subtype=1 to main; don't guess subtype flip after ONVIF.
        return null;
    }

    return preferPreviewUrl(mainUrl, null);
}

function onvifProfileRtsp(profile) {
    const rtsp = profile?.info?.trim();
    if (rtsp && /^rtsp:/i.test(rtsp)) {
        return rtsp;
    }
    return null;
}

function isDahuaRealmonitorUrl(url) {
    if (typeof go2rtcIsDahuaRealmonitorUrl === 'function') {
        return go2rtcIsDahuaRealmonitorUrl(url);
    }
    return false;
}

function rtspSubUrlVariantsFallback(mainUrl) {
    const variants = [];
    if (!mainUrl || typeof mainUrl !== 'string') {
        return variants;
    }
    try {
        const u = new URL(mainUrl);
        if (u.searchParams.has('subtype')) {
            const v = u.searchParams.get('subtype');
            const u2 = new URL(mainUrl);
            u2.searchParams.set('subtype', v === '0' ? '1' : '0');
            variants.push(u2.toString());
        }
        if (u.searchParams.has('channel')) {
            const v = u.searchParams.get('channel');
            const u2 = new URL(mainUrl);
            u2.searchParams.set('channel', v === '1' ? '2' : '1');
            variants.push(u2.toString());
        }
    } catch {
        /* not a URL */
    }
    const reps = [
        [/stream1/gi, 'stream2'],
        [/\/main\b/gi, '/sub'],
        [/_main\b/gi, '_sub'],
        [/channel1/gi, 'channel2'],
    ];
    for (const [re, to] of reps) {
        if (re.test(mainUrl)) {
            variants.push(mainUrl.replace(re, to));
        }
    }
    return [...new Set(variants)].filter((u) => u && u !== mainUrl);
}

function credentialsFromStreamUrl(url) {
    try {
        const u = new URL(url);
        return {
            user: decodeURIComponent(u.username || '') || 'admin',
            pass: decodeURIComponent(u.password || ''),
            host: u.hostname,
            port: u.port,
        };
    } catch {
        const m = url.match(/\/\/([^@]+)@([^/:]+)/);
        if (m) {
            const [user, pass] = m[1].split(':');
            return {user: user || 'admin', pass: pass || '', host: m[2], port: ''};
        }
        return {user: 'admin', pass: '', host: '', port: ''};
    }
}

/** RTSP ports — never use for ONVIF HTTP device_service */
const RTSP_PORTS = new Set(['554', '8554', '10554', '1935']);

/** Common ONVIF HTTP ports (Reolink 8000, Tapo 2020, etc.) */
const ONVIF_PORTS = ['8000', '80', '8080', '8899', '2020', ''];

function onvifSrcCandidatesFromMain(mainUrl) {
    if (!mainUrl) {
        return [];
    }
    const trimmed = mainUrl.trim();
    if (trimmed.toLowerCase().startsWith('onvif://')) {
        const {user, pass} = credentialsFromStreamUrl(trimmed);
        return [buildOnvifSrc(trimmed, user, pass)];
    }

    const {user, pass, host, port} = credentialsFromStreamUrl(mainUrl);
    if (!host) {
        return [];
    }

    const ports = [];
    if (port && !RTSP_PORTS.has(port) && !ports.includes(port)) {
        ports.push(port);
    }
    for (const p of ONVIF_PORTS) {
        if (!ports.includes(p)) {
            ports.push(p);
        }
    }

    return ports.map((p) => {
        const portPart = p ? `:${p}` : '';
        return buildOnvifSrc(`onvif://${host}${portPart}`, user, pass);
    });
}

function onvifSrcForMain(mainUrl) {
    const candidates = onvifSrcCandidatesFromMain(mainUrl);
    return candidates[0] || null;
}

async function probeOnvifProfilesForSrc(src, resolve = true) {
    const url = new URL('api/onvif', location.href);
    url.searchParams.set('src', src);
    if (resolve) {
        url.searchParams.set('resolve', '1');
    }
    const r = await apiFetch(url);
    if (!r.ok) {
        return null;
    }
    const data = await r.json();
    return data.sources || [];
}

/** Try ONVIF HTTP ports until profiles are returned (avoids RTSP :554). */
async function discoverOnvifProfiles(mainUrl) {
    for (const src of onvifSrcCandidatesFromMain(mainUrl)) {
        const profiles = await probeOnvifProfilesForSrc(src);
        if (profiles?.length) {
            return profiles;
        }
    }
    return [];
}

function pickSubProfile(profiles, mainUrl) {
    const list = profiles.filter((p) => p.url && !p.url.includes('snapshot'));
    if (!list.length) {
        return null;
    }

    const mainProfileIdx = list.findIndex((p) => {
        const rtsp = onvifProfileRtsp(p);
        return rtsp && rtspStreamsEquivalent(mainUrl, rtsp);
    });

    const ranked = list
        .map((p, idx) => {
            const rtsp = onvifProfileRtsp(p);
            let score = 0;

            if (rtsp && rtspStreamsEquivalent(mainUrl, rtsp)) {
                score -= 30;
            }
            if (mainProfileIdx >= 0 && idx !== mainProfileIdx) {
                score += 12;
            }
            if (/sub|low|minor|preview|second/i.test(p.name || '')) {
                score += 6;
            }
            if (/main|high|primary|master/i.test(p.name || '')) {
                score -= 6;
            }

            return {p, score, rtsp};
        })
        .filter((r) => !r.rtsp || !rtspStreamsEquivalent(mainUrl, r.rtsp))
        .sort((a, b) => b.score - a.score);

    return ranked[0]?.p || null;
}

async function detectPreviewChannels() {
    setStatus('Scanning cameras for preview channels…');
    await loadStreams();
    let names = Object.keys(state.streams);
    const rows = groupCameraRows();
    let added = 0;
    let onvifMiss = 0;

    for (const row of rows) {
        if (row.sub) {
            continue;
        }
        const subName = row.subName;
        const mainUrl = streamConfigUrls(row.name)[0] || row.main;
        if (isRedactedUrl(mainUrl)) {
            continue;
        }

        const guess = suggestPreviewStream(row.name, names);
        if (guess && guess !== row.name && !names.includes(subName)) {
            const url = streamConfigUrls(guess)[0] || streamUrls(state.streams[guess])[0];
            if (url && !isRedactedUrl(url)) {
                await putStream(subName, url);
                names.push(subName);
                added++;
                continue;
            }
        }

        const profiles = await discoverOnvifProfiles(mainUrl);
        if (!profiles.length) {
            onvifMiss++;
        }
        const previewUrl = resolvePreviewStreamUrl(mainUrl, profiles);
        if (previewUrl && !rtspStreamsEquivalent(mainUrl, previewUrl) && !names.includes(subName)) {
            await putStream(subName, previewUrl);
            names.push(subName);
            added++;
        }
    }

    await loadStreams();
    await fetchConfig();
    renderCameraStats();
    let msg = added
        ? `Added ${added} preview channel(s) (*_sub) to config`
        : 'No new preview channels found (already configured or device has one stream)';
    if (onvifMiss && !added) {
        msg += `. ONVIF failed for ${onvifMiss} camera(s) — use “Add camera — ONVIF” with correct device port (often :8000, not :554).`;
    } else if (onvifMiss) {
        msg += ` (${onvifMiss} without ONVIF; RTSP subtype guess used where possible)`;
    }
    setStatus(msg);
}

async function addPreviewForCamera(baseName) {
    const subName = `${baseName}_sub`;
    const names = Object.keys(state.streams);
    if (names.includes(subName)) {
        return;
    }
    const main = streamDisplayUrls(baseName)[0] || '';
    if (!main) {
        throw new Error('Main stream URL missing');
    }
    if (isRedactedUrl(main)) {
        throw new Error('Main stream URL is redacted in config — edit Config (YAML) and restore login:password');
    }
    $('#manual-cam-name').value = baseName;
    $('#manual-main-url').value = main;
    const variants = subStreamUrlVariants(main);
    if (variants.length) {
        $('#manual-sub-url').value = variants[0];
    }
    $('#manual-sub-url').focus();
    setStatus(`Enter preview URL for ${baseName} below, or use Detect preview channels`);
}

async function wakeOfflineStreams() {
    const rows = groupCameraRows();
    const tasks = [];
    for (const row of rows) {
        for (const name of [row.name, row.sub ? row.subName : null].filter(Boolean)) {
            if (streamEntryRecv(state.streams[name]) != null) {
                continue;
            }
            const u = new URL('api/frame.jpeg', location.href);
            u.searchParams.set('src', name);
            u.searchParams.set('width', '2');
            u.searchParams.set('height', '2');
            tasks.push(apiFetch(u).catch(() => {}));
        }
    }
    if (!tasks.length) {
        setStatus('All listed streams already active');
        return;
    }
    setStatus('Waking offline streams…');
    await Promise.all(tasks);
    await loadStreams();
    renderCameraStats();
    setStatus('Wake requested — rates appear within a few seconds');
}

function startBandwidthPoll() {
    stopBandwidthPoll();
    state.settingsTabActive = true;
    state.bandwidthPollId = setInterval(async () => {
        if (!state.settingsTabActive || document.hidden) {
            return;
        }
        try {
            await loadStreams();
            updateBandwidthFromStreams(state.streams);
            renderCameraStats();
        } catch {
            /* ignore transient errors while polling */
        }
    }, 2000);
}

function stopBandwidthPoll() {
    state.settingsTabActive = false;
    if (state.bandwidthPollId) {
        clearInterval(state.bandwidthPollId);
        state.bandwidthPollId = null;
    }
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function sanitizeName(s) {
    return String(s)
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^[_-]+|[_-]+$/g, '')
        .slice(0, 48) || 'cam';
}

function buildOnvifSrc(hostUrl, user, pass) {
    const u = new URL(hostUrl);
    if (user) {
        u.username = user;
    }
    if (pass) {
        u.password = pass;
    }
    return u.toString();
}

async function refreshServiceStatus() {
    const serviceStatus = $('#service-status');
    const serviceLabel = $('#service-install-label');
    const serviceCheck = $('#service-install');
    if (!serviceStatus) {
        return;
    }
    try {
        const r = await apiFetch('api/service');
        if (!r.ok) {
            serviceStatus.textContent = await r.text() || r.statusText;
            return;
        }
        const st = await r.json();
        if (!st.supported) {
            serviceStatus.textContent = st.message || 'Service control is only available on Windows.';
            serviceLabel?.classList.add('hidden');
            return;
        }
        serviceLabel?.classList.remove('hidden');
        if (serviceCheck) {
            serviceCheck.checked = st.installed;
            serviceCheck.disabled = state.serviceBusy;
        }
        const parts = [];
        if (st.installed) {
            parts.push('Service installed');
            parts.push(st.running ? 'running' : 'stopped');
        } else {
            parts.push('Service not installed');
        }
        if (st.message) {
            parts.push(st.message);
        }
        serviceStatus.textContent = parts.join(' · ');
    } catch (e) {
        serviceStatus.textContent = String(e);
    }
}

function setUpdaterActionStatus(msg, isError = false) {
    const el = $('#updater-actions-status');
    if (!el) {
        return;
    }
    el.textContent = msg || '';
    el.className = 'settings-status' + (isError ? ' err' : msg ? ' ok' : '');
}

function setGo2rtcUpdateStatus(msg, isError = false) {
    const el = $('#go2rtc-update-status');
    if (!el) {
        return;
    }
    el.textContent = msg || '';
    el.className = 'settings-status' + (isError ? ' err' : msg ? ' ok' : '');
}

function formatUpdaterLastStatus(st) {
    if (!st || typeof st !== 'object') {
        return '';
    }
    const parts = [];
    if (st.state) {
        parts.push(String(st.state));
    }
    if (st.running_version && st.available_version) {
        parts.push(`${st.running_version} → ${st.available_version}`);
    } else if (st.version_current && st.version_latest) {
        parts.push(`${st.version_current} → ${st.version_latest}`);
    }
    if (st.message) {
        parts.push(String(st.message));
    }
    return parts.join(' · ');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll updater status while go2rtc restarts after manual apply. */
async function pollUpdaterApplyStatus(maxMs = 120000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
        await sleep(2000);
        try {
            const r = await apiFetch('api/updater/status');
            if (!r.ok) {
                setGo2rtcUpdateStatus('go2rtc is restarting…');
                continue;
            }
            const st = await r.json();
            await refreshUpdaterStatus();
            if (st.state === 'applying') {
                setGo2rtcUpdateStatus(st.message || 'Applying update…');
                continue;
            }
            if (st.state === 'updated') {
                setGo2rtcUpdateStatus(st.message || 'Update complete.');
                return;
            }
            if (st.state === 'error') {
                setGo2rtcUpdateStatus(st.message || 'Update failed.', true);
                return;
            }
            if (st.state === 'current') {
                setGo2rtcUpdateStatus(st.message || 'Already up to date.');
                return;
            }
            if (st.state === 'disabled') {
                setGo2rtcUpdateStatus(st.message || 'Updater is disabled in config.', true);
                return;
            }
        } catch {
            setGo2rtcUpdateStatus('go2rtc is restarting…');
        }
    }
    setGo2rtcUpdateStatus(
        'Update may still be running — refresh this page or check the go2rtc service.',
        true,
    );
}

async function refreshUpdaterStatus() {
    const host = $('#updater-service-status');
    const last = $('#updater-last-status');
    const btnInstall = $('#btn-install-updater');
    const btnUninstall = $('#btn-uninstall-updater');
    if (!host) {
        return;
    }
    try {
        const r = await apiFetch('api/updater?action=updater-status');
        if (!r.ok) {
            host.textContent = await r.text() || r.statusText;
            return;
        }
        const st = await r.json();
        if (!st.supported) {
            host.textContent = st.message || 'Updater service is only supported on Windows.';
            btnInstall?.setAttribute('disabled', 'disabled');
            btnUninstall?.setAttribute('disabled', 'disabled');
            return;
        }
        const parts = [];
        if (st.installed) {
            parts.push('Updater service installed');
            parts.push(st.running ? 'running' : 'stopped');
        } else {
            parts.push('Updater service not installed');
        }
        if (st.message) {
            parts.push(st.message);
        }
        if (st.updater_exe_found === false && !st.installed) {
            parts.push('Download go2rtc-updater.exe from the release and place it next to go2rtc.exe');
        }
        host.textContent = parts.join(' · ');
        if (btnInstall) {
            btnInstall.disabled = state.updaterBusy || st.installed || st.updater_exe_found === false;
        }
        if (btnUninstall) {
            btnUninstall.disabled = state.updaterBusy || !st.installed;
        }
    } catch (e) {
        host.textContent = formatFetchError(e, apiUrl('api/updater?action=updater-status'));
    }

    if (last) {
        try {
            const r2 = await apiFetch('api/updater/status');
            if (r2.ok) {
                const st2 = await r2.json();
                last.textContent = formatUpdaterLastStatus(st2);
            } else {
                last.textContent = '';
            }
        } catch {
            last.textContent = '';
        }
    }
}

async function putStream(name, src) {
    if (isRedactedUrl(src)) {
        throw new Error('Cannot save redacted URL (***) — use Config (YAML) or re-enter credentials');
    }
    const url = new URL('api/streams', location.href);
    url.searchParams.set('name', name);
    url.searchParams.set('src', src);
    const r = await apiFetch(url.toString(), {method: 'PUT'});
    if (!r.ok) {
        throw new Error(await r.text() || r.statusText);
    }
}

async function deleteStream(name) {
    const url = new URL('api/streams', location.href);
    url.searchParams.set('src', name);
    const r = await apiFetch(url.toString(), {method: 'DELETE'});
    if (!r.ok) {
        throw new Error(await r.text() || r.statusText);
    }
}

async function scanOnvif() {
    const host = $('#onvif-scan-status');
    if (host) {
        host.textContent = 'Scanning LAN for ONVIF devices…';
    }
    const r = await apiFetch('api/onvif');
    if (!r.ok) {
        throw new Error(await r.text() || r.statusText);
    }
    const data = await r.json();
    state.onvifDevices = data.sources || [];
    renderOnvifDevices();
    if (host) {
        host.textContent = state.onvifDevices.length
            ? `Found ${state.onvifDevices.length} device(s)`
            : 'No ONVIF devices found on the network';
    }
}

function renderOnvifDevices() {
    const tbody = $('#onvif-device-tbody');
    if (!tbody) {
        return;
    }
    tbody.innerHTML = '';
    if (!state.onvifDevices.length) {
        tbody.innerHTML = '<tr><td colspan="3">No devices — click Scan ONVIF</td></tr>';
        return;
    }
    for (const dev of state.onvifDevices) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(dev.name || dev.url)}</td>
            <td>${escapeHtml(dev.info || '')}</td>
            <td><button type="button" data-probe-url="${escapeHtml(dev.url)}">Probe streams</button></td>`;
        tbody.appendChild(tr);
    }
}

function onvifProfileUrlWithCredentials(profileUrl) {
    const user = $('#onvif-user')?.value.trim() || 'admin';
    const pass = $('#onvif-pass')?.value ?? '';
    try {
        const u = new URL(profileUrl.replace(/^onvif:\/\//i, 'http://'));
        if (user) {
            u.username = user;
        }
        if (pass) {
            u.password = pass;
        }
        return `onvif://${u.host}${u.pathname}${u.search}`;
    } catch {
        return profileUrl;
    }
}

function renderOnvifProfiles() {
    const box = $('#onvif-profiles-box');
    const list = $('#onvif-profiles-list');
    if (!box || !list) {
        return;
    }
    if (!state.onvifProfiles.length) {
        box.classList.add('hidden');
        return;
    }
    box.classList.remove('hidden');
    list.innerHTML = '';
    state.onvifProfiles.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'onvif-profile';
        const displayUrl = onvifProfileUrlWithCredentials(p.url);
        row.innerHTML = `
            <span><strong>${escapeHtml(p.name)}</strong></span>
            <code class="stream-url">${escapeHtml(displayUrl)}</code>
            <button type="button" class="linkish" data-copy-onvif-profile="${i}">Copy</button>
            <label><input type="radio" name="onvif-main" value="${i}" ${i === 0 ? 'checked' : ''}> Main (fullscreen)</label>
            <label><input type="radio" name="onvif-sub" value="${i}" ${i === 1 ? 'checked' : ''}> Preview (grid)</label>`;
        list.appendChild(row);
    });
    if (state.onvifProfiles.length === 1) {
        const sub = list.querySelector('input[name="onvif-sub"]');
        if (sub) {
            sub.checked = true;
        }
    }
}

async function probeOnvif(deviceUrl) {
    const user = $('#onvif-user').value.trim() || 'admin';
    const pass = $('#onvif-pass').value;
    const src = buildOnvifSrc(deviceUrl, user, pass);
    state.probeSrc = src;
    const status = $('#onvif-probe-status');
    if (status) {
        status.textContent = 'Loading stream profiles…';
    }
    const url = new URL('api/onvif', location.href);
    url.searchParams.set('src', src);
    const r = await apiFetch(url);
    if (!r.ok) {
        throw new Error(await r.text() || r.statusText);
    }
    const data = await r.json();
    state.onvifProfiles = (data.sources || []).filter((s) => !s.url.includes('snapshot'));
    renderOnvifProfiles();
    if (status) {
        status.textContent = `${state.onvifProfiles.length} profile(s) — pick main and preview, then Add camera pair`;
    }
    const base = $('#manual-cam-name');
    if (base && !base.value) {
        try {
            const h = new URL(deviceUrl.replace(/^onvif:\/\//, 'http://')).hostname.replace(/\./g, '_');
            base.value = sanitizeName(h);
        } catch {
            /* ignore */
        }
    }
}

async function addDualFromOnvif() {
    const base = sanitizeName($('#manual-cam-name').value.trim());
    if (!base) {
        throw new Error('Enter a camera base name (e.g. cam_front_door)');
    }
    if (!state.onvifProfiles.length) {
        throw new Error('Probe ONVIF device first');
    }
    const mainIdx = parseInt(document.querySelector('input[name="onvif-main"]:checked')?.value ?? '0', 10);
    let subIdx = parseInt(document.querySelector('input[name="onvif-sub"]:checked')?.value ?? '1', 10);
    if (Number.isNaN(mainIdx) || mainIdx < 0 || mainIdx >= state.onvifProfiles.length) {
        throw new Error('Select a main stream');
    }
    if (Number.isNaN(subIdx) || subIdx < 0 || subIdx >= state.onvifProfiles.length) {
        subIdx = mainIdx;
    }
    const mainUrl = onvifProfileUrlWithCredentials(state.onvifProfiles[mainIdx].url);
    await putStream(base, mainUrl);
    if (subIdx !== mainIdx) {
        const mainResolved = onvifProfileRtsp(state.onvifProfiles[mainIdx]);
        let subUrl = onvifProfileRtsp(state.onvifProfiles[subIdx]);
        if (subUrl) {
            subUrl = mergeRtspCredentials(mainUrl, subUrl);
        } else {
            subUrl = onvifProfileUrlWithCredentials(state.onvifProfiles[subIdx].url);
            subUrl = preferPreviewUrl(mainUrl, mergeRtspCredentials(mainUrl, subUrl));
        }
        if (mainResolved && subUrl && rtspStreamsEquivalent(mainResolved, subUrl)) {
            subUrl = preferPreviewUrl(mainUrl, null);
        }
        if (subUrl && !rtspStreamsEquivalent(mainUrl, subUrl)) {
            await putStream(`${base}_sub`, subUrl);
        }
    } else {
        const subUrl = preferPreviewUrl(mainUrl, null);
        if (subUrl && !rtspStreamsEquivalent(mainUrl, subUrl)) {
            await putStream(`${base}_sub`, subUrl);
        }
    }
}

async function addManualDual() {
    const base = sanitizeName($('#manual-cam-name').value.trim());
    const main = $('#manual-main-url').value.trim();
    const sub = $('#manual-sub-url').value.trim();
    if (!base || !main) {
        throw new Error('Base name and main stream URL are required');
    }
    await putStream(base, main);
    if (sub && sub !== main) {
        await putStream(`${base}_sub`, sub);
    }
}

async function loadSettingsTab() {
    if (!state.settingsLoaded) {
        state.settingsLoaded = true;
        await refreshServiceStatus();
        await refreshUpdaterStatus();
    }
    setStatus('Loading…');
    try {
        await fetchConfig();
        await loadStreams();
        fillSettingsForm();
        updateBandwidthFromStreams(state.streams);
        renderCameraStats();
        setStatus('');
        startBandwidthPoll();
    } catch (e) {
        setStatus(e.message, true);
    }
}

function wireSettings() {
    window.addEventListener('go2rtc-config-tab', (e) => {
        if (e.detail?.tab === 'settings') {
            loadSettingsTab();
        } else {
            stopBandwidthPoll();
        }
    });

    $('#btn-save-settings')?.addEventListener('click', async () => {
        setStatus('Saving…');
        try {
            await patchConfig(readSettingsPatch());
            setStatus('Saved. Restart go2rtc if listen port or modules changed.');
        } catch (e) {
            setStatus(e.message, true);
        }
    });

    const serviceCheck = $('#service-install');
    serviceCheck?.addEventListener('change', async () => {
        if (state.serviceBusy) {
            return;
        }
        state.serviceBusy = true;
        serviceCheck.disabled = true;
        const install = serviceCheck.checked;
        try {
            const r = await apiFetch(`api/service?action=${install ? 'install' : 'uninstall'}`, {method: 'POST'});
            if (!r.ok) {
                throw new Error(await r.text() || r.statusText);
            }
            await refreshServiceStatus();
        } catch (e) {
            alert(e.message || String(e));
            serviceCheck.checked = !install;
        } finally {
            state.serviceBusy = false;
            serviceCheck.disabled = false;
        }
    });

    $('#btn-install-updater')?.addEventListener('click', async () => {
        if (state.updaterBusy) {
            return;
        }
        state.updaterBusy = true;
        setUpdaterActionStatus('Installing… Windows may show a UAC prompt (same as go2rtc service).');
        const installUrl = apiUrl('api/updater?action=install-updater');
        try {
            const r = await apiFetch(installUrl, {method: 'POST'});
            if (!r.ok) {
                throw new Error(await r.text() || r.statusText);
            }
            setUpdaterActionStatus('Installed. Updater will apply updates on schedule.');
            await refreshUpdaterStatus();
        } catch (e) {
            const msg = formatFetchError(e, installUrl);
            setUpdaterActionStatus(msg, true);
            alert(msg);
        } finally {
            state.updaterBusy = false;
            await refreshUpdaterStatus();
        }
    });

    $('#btn-uninstall-updater')?.addEventListener('click', async () => {
        if (state.updaterBusy) {
            return;
        }
        if (!confirm('Uninstall go2rtc-updater service? Automatic updates will stop.')) {
            return;
        }
        state.updaterBusy = true;
        setUpdaterActionStatus('Uninstalling…');
        const uninstallUrl = apiUrl('api/updater?action=uninstall-updater');
        try {
            const r = await apiFetch(uninstallUrl, {method: 'POST'});
            if (!r.ok) {
                throw new Error(await r.text() || r.statusText);
            }
            setUpdaterActionStatus('Uninstalled.');
            await refreshUpdaterStatus();
        } catch (e) {
            const msg = formatFetchError(e, uninstallUrl);
            setUpdaterActionStatus(msg, true);
            alert(msg);
        } finally {
            state.updaterBusy = false;
            await refreshUpdaterStatus();
        }
    });

    $('#btn-check-go2rtc-update')?.addEventListener('click', async () => {
        if (state.updaterBusy) {
            return;
        }
        state.updaterBusy = true;
        setGo2rtcUpdateStatus('Checking…');
        const checkUrl = apiUrl('api/updater?action=check-now');
        try {
            const r = await apiFetch(checkUrl, {method: 'POST'});
            if (!r.ok) {
                throw new Error(await r.text() || r.statusText);
            }
            const info = await r.json();
            const msg = info.message || `${info.running_version} → ${info.available_version}`;
            setGo2rtcUpdateStatus(msg, !info.needs_update && info.state === 'error');
            await refreshUpdaterStatus();
        } catch (e) {
            const msg = formatFetchError(e, checkUrl);
            setGo2rtcUpdateStatus(msg, true);
            alert(msg);
        } finally {
            state.updaterBusy = false;
        }
    });

    $('#btn-apply-go2rtc-update')?.addEventListener('click', async () => {
        if (state.updaterBusy) {
            return;
        }
        if (!confirm('Install the latest go2rtc.exe now? The service will stop briefly. Approve UAC if prompted.')) {
            return;
        }
        state.updaterBusy = true;
        setGo2rtcUpdateStatus('Installing… go2rtc will restart. Approve UAC if prompted.');
        const applyUrl = apiUrl('api/updater?action=apply-now');
        try {
            const r = await apiFetch(applyUrl, {method: 'POST'});
            if (!r.ok) {
                throw new Error(await r.text() || r.statusText);
            }
            const info = await r.json();
            setGo2rtcUpdateStatus(info.message || 'Update started.');
            await pollUpdaterApplyStatus();
        } catch (e) {
            const msg = formatFetchError(e, applyUrl);
            setGo2rtcUpdateStatus(msg, true);
            alert(msg);
        } finally {
            state.updaterBusy = false;
        }
    });

    $('#btn-refresh-cameras')?.addEventListener('click', async () => {
        setStatus('Refreshing…');
        try {
            await fetchConfig();
            await loadStreams();
            updateBandwidthFromStreams(state.streams);
            renderCameraStats();
            setStatus('Camera list refreshed');
        } catch (e) {
            setStatus(e.message, true);
        }
    });

    $('#btn-detect-preview-channels')?.addEventListener('click', async () => {
        setStatus('Detecting preview channels…');
        try {
            await detectPreviewChannels();
        } catch (e) {
            setStatus(e.message, true);
        }
    });

    $('#btn-wake-streams')?.addEventListener('click', async () => {
        setStatus('Waking streams…');
        try {
            await wakeOfflineStreams();
        } catch (e) {
            setStatus(e.message, true);
        }
    });

    $('#btn-scan-onvif')?.addEventListener('click', async () => {
        try {
            await scanOnvif();
        } catch (e) {
            $('#onvif-scan-status').textContent = e.message;
        }
    });

    $('#onvif-device-tbody')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-probe-url]');
        if (!btn) {
            return;
        }
        try {
            await probeOnvif(btn.dataset.probeUrl);
        } catch (err) {
            $('#onvif-probe-status').textContent = err.message;
        }
    });

    $('#onvif-profiles-list')?.addEventListener('click', async (e) => {
        const copyBtn = e.target.closest('[data-copy-onvif-profile]');
        if (copyBtn) {
            const idx = parseInt(copyBtn.dataset.copyOnvifProfile, 10);
            const profile = state.onvifProfiles[idx];
            if (!profile?.url) {
                return;
            }
            const url = onvifProfileUrlWithCredentials(profile.url);
            try {
                await copyTextToClipboard(url);
                setStatus('Copied ONVIF profile URL');
            } catch (err) {
                setStatus(err.message || String(err), true);
            }
            return;
        }
    });

    $('#btn-add-onvif-pair')?.addEventListener('click', async () => {
        setStatus('Adding cameras…');
        try {
            await addDualFromOnvif();
            await fetchConfig();
            await loadStreams();
            updateBandwidthFromStreams(state.streams);
            renderCameraStats();
            setStatus('Camera pair added to go2rtc.yaml');
        } catch (e) {
            setStatus(e.message, true);
        }
    });

    $('#btn-add-manual-pair')?.addEventListener('click', async () => {
        setStatus('Adding cameras…');
        try {
            await addManualDual();
            await fetchConfig();
            await loadStreams();
            updateBandwidthFromStreams(state.streams);
            renderCameraStats();
            setStatus('Camera pair added');
        } catch (e) {
            setStatus(e.message, true);
        }
    });

    $('#camera-stats-list')?.addEventListener('click', async (e) => {
        const copyBtn = e.target.closest('[data-copy-stream]');
        if (copyBtn) {
            const name = copyBtn.dataset.copyStream;
            const url = streamDisplayUrls(name)[0];
            if (!url) {
                setStatus(`No URL for ${name}`, true);
                return;
            }
            if (isRedactedUrl(url)) {
                setStatus('URL is redacted (***) — restore credentials in Config (YAML)', true);
                return;
            }
            try {
                await copyTextToClipboard(url);
                setStatus(`Copied ${name} URL`);
            } catch (err) {
                setStatus(err.message || String(err), true);
            }
            return;
        }
        const addBtn = e.target.closest('[data-add-preview]');
        if (addBtn) {
            try {
                await addPreviewForCamera(addBtn.dataset.addPreview);
            } catch (err) {
                setStatus(err.message, true);
            }
            return;
        }
        const btn = e.target.closest('[data-del-stream]');
        if (!btn) {
            return;
        }
        if (!confirm(`Remove stream "${btn.dataset.delStream}" from config?`)) {
            return;
        }
        try {
            await deleteStream(btn.dataset.delStream);
            await fetchConfig();
            await loadStreams();
            updateBandwidthFromStreams(state.streams);
            renderCameraStats();
            setStatus('Removed');
        } catch (err) {
            setStatus(err.message, true);
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireSettings);
} else {
    wireSettings();
}
window.go2rtcSettingsReady = true;
