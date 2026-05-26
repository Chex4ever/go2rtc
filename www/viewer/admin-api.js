export const ADMIN_KEY = 'go2rtc-viewer-admin';

export function basePath() {
    const m = location.pathname.match(/^(.*)\/viewer\//);
    return m ? m[1] : '';
}

export function apiUrl(path) {
    return basePath() + path;
}

export function adminPass() {
    return sessionStorage.getItem(ADMIN_KEY) || '';
}

export function setAdminPass(pass) {
    if (pass) {
        sessionStorage.setItem(ADMIN_KEY, pass);
    } else {
        sessionStorage.removeItem(ADMIN_KEY);
    }
}

export async function adminApi(method, path, body) {
    const opts = {
        method,
        credentials: 'include',
        headers: {'X-Viewer-Admin': adminPass()},
    };
    if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const r = await fetch(apiUrl(path), opts);
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

export async function verifyAdmin(pass) {
    const r = await fetch(apiUrl('/api/viewer/admin/users'), {
        headers: {'X-Viewer-Admin': pass},
    });
    return r.ok;
}
