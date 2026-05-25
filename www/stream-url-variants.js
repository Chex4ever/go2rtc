/**
 * Guess RTSP sub-stream / preview URLs from a main stream URL.
 * Loaded on config.html; attached to globalThis.go2rtcSubStreamUrlVariants.
 */
(function () {
    /** Hikvision NVR/DVR: main 101/201 → sub 102/202 (channel ID over RTSP, not isapi:// audio). */
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

    const root = typeof globalThis !== 'undefined' ? globalThis : window;
    root.go2rtcSubStreamUrlVariants = subStreamUrlVariants;
    root.go2rtcHikvisionDvrSubUrlVariants = hikvisionDvrSubUrlVariants;
})();
