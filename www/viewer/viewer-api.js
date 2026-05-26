const API_TIMEOUT_MS = 15000;

export function basePath() {
    const m = location.pathname.match(/^(.*)\/viewer\//);
    return m ? m[1] : '';
}

export function apiUrl(path) {
    return basePath() + path;
}

export async function api(method, path, body) {
    const opts = {method, credentials: 'include', headers: {}};
    if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
    opts.signal = ctrl.signal;
    let r;
    try {
        r = await fetch(apiUrl(path), opts);
    } catch (e) {
        if (e?.name === 'AbortError') {
            throw new Error('Request timed out — is go2rtc running?');
        }
        throw e;
    } finally {
        clearTimeout(timer);
    }
    const text = await r.text();
    if (!r.ok) {
        throw new Error(text || r.statusText);
    }
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

export function serverHint() {
    const origin = location.origin || '';
    const base = basePath();
    return `Server: ${origin}${base} — is go2rtc running at this address?`;
}

export function isFetchFailure(err) {
    if (err instanceof TypeError) {
        return true;
    }
    const msg = String(err?.message || err || '');
    return /failed to fetch|networkerror|load failed|network request failed/i.test(msg);
}
