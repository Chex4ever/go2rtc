/** Shared RTSP sub-stream URL heuristics (Node tests + browser bundle). */

function hikvisionDvrSubUrlVariants(mainUrl) {
    const variants = [];
    if (!mainUrl || typeof mainUrl !== 'string') {
        return variants;
    }

    const channelPath = (match) => {
        const num = match[2];
        const prefix = match[1];
        const suffix = match[3] || '';
        if (!/^\d+$/.test(num)) {
            return;
        }
        if (num.length >= 3 && num.endsWith('1')) {
            variants.push(prefix + num.slice(0, -1) + '2' + suffix);
        }
        if (num.endsWith('01')) {
            variants.push(prefix + num.slice(0, -2) + '02' + suffix);
        }
        if (num === '1') {
            variants.push(prefix + '2' + suffix);
        }
    };

    let m = mainUrl.match(/^(.*\/Channels\/)(\d+)(.*)$/i);
    if (m) {
        channelPath(m);
    }
    m = mainUrl.match(/^(.*\/channels\/)(\d+)(.*)$/i);
    if (m) {
        channelPath(m);
    }
    m = mainUrl.match(/^(.*\/tracks\/)(\d+)(.*)$/i);
    if (m) {
        channelPath(m);
    }

    return variants;
}

function rtspQuerySubUrlVariants(mainUrl) {
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
    return variants;
}

function subStreamUrlVariants(mainUrl) {
    const seen = new Set();
    const out = [];
    for (const u of [
        ...hikvisionDvrSubUrlVariants(mainUrl),
        ...rtspQuerySubUrlVariants(mainUrl),
    ]) {
        if (u && u !== mainUrl && !seen.has(u)) {
            seen.add(u);
            out.push(u);
        }
    }
    return out;
}

/** Compare stream identity ignoring credentials and parameter order. */
function rtspStreamKey(url) {
    if (!url || typeof url !== 'string') {
        return '';
    }
    try {
        const u = new URL(url.replace(/^onvif:\/\//i, 'rtsp://').replace(/^rtsp:\/\//i, 'http://'));
        const bits = [u.pathname.toLowerCase()];
        for (const key of ['channel', 'subtype', 'stream']) {
            if (u.searchParams.has(key)) {
                bits.push(`${key}=${u.searchParams.get(key)}`);
            }
        }
        return bits.join('|');
    } catch {
        return url.trim();
    }
}

function rtspStreamsEquivalent(a, b) {
    return !!a && !!b && rtspStreamKey(a) === rtspStreamKey(b);
}

function mergeRtspCredentials(mainUrl, profileUrl) {
    if (!profileUrl) {
        return profileUrl;
    }
    try {
        const from = new URL(mainUrl.replace(/^onvif:\/\//i, 'rtsp://'));
        const to = new URL(profileUrl.replace(/^onvif:\/\//i, 'rtsp://'));
        if (from.username) {
            to.username = from.username;
        }
        if (from.password) {
            to.password = from.password;
        }
        return to.toString();
    } catch {
        return profileUrl;
    }
}

/** Prefer a distinct sub-stream URL; flip subtype/channel when candidate repeats main. */
function preferPreviewUrl(mainUrl, candidateUrl) {
    const variants = subStreamUrlVariants(mainUrl);
    const fallback = variants.find((v) => !rtspStreamsEquivalent(mainUrl, v)) || null;
    if (!candidateUrl) {
        return fallback;
    }
    if (rtspStreamsEquivalent(mainUrl, candidateUrl)) {
        return fallback;
    }
    return candidateUrl;
}

function isDahuaRealmonitorUrl(url) {
    if (!url) {
        return false;
    }
    try {
        const u = new URL(url.replace(/^onvif:\/\//i, 'rtsp://'));
        return /\/cam\/realmonitor/i.test(u.pathname);
    } catch {
        return false;
    }
}

const lib = {
    hikvisionDvrSubUrlVariants,
    rtspQuerySubUrlVariants,
    subStreamUrlVariants,
    rtspStreamKey,
    rtspStreamsEquivalent,
    mergeRtspCredentials,
    preferPreviewUrl,
    isDahuaRealmonitorUrl,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = lib;
}
if (typeof globalThis !== 'undefined') {
    globalThis.go2rtcSubStreamUrlVariants = lib.subStreamUrlVariants;
    globalThis.go2rtcHikvisionDvrSubUrlVariants = lib.hikvisionDvrSubUrlVariants;
    globalThis.go2rtcRtspStreamKey = lib.rtspStreamKey;
    globalThis.go2rtcRtspStreamsEquivalent = lib.rtspStreamsEquivalent;
    globalThis.go2rtcMergeRtspCredentials = lib.mergeRtspCredentials;
    globalThis.go2rtcPreferPreviewUrl = lib.preferPreviewUrl;
    globalThis.go2rtcIsDahuaRealmonitorUrl = lib.isDahuaRealmonitorUrl;
}
