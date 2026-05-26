/** Auto-resume layout after session restore (LAN kiosk / power-on). */

export function lastLayoutKey(user) {
    return `viewer:lastLayout:${user || ''}`;
}

export function saveLastLayoutId(user, layoutId) {
    if (!user || !layoutId) {
        return;
    }
    try {
        localStorage.setItem(lastLayoutKey(user), layoutId);
    } catch {
        /* private mode */
    }
}

export function loadLastLayoutId(user) {
    if (!user) {
        return '';
    }
    try {
        return localStorage.getItem(lastLayoutKey(user)) || '';
    } catch {
        return '';
    }
}

/**
 * Pick layout to open without user click.
 * @param {{ layouts: {id: string}[], user: string, defaultLayoutId?: string, autoOpen?: boolean }} opts
 */
export function pickAutoLayoutId(opts) {
    const layouts = opts.layouts || [];
    if (!layouts.length) {
        return '';
    }
    if (opts.autoOpen === false) {
        return '';
    }

    const ids = new Set(layouts.map((l) => l.id));
    const preferred = (opts.defaultLayoutId || '').trim();
    if (preferred && ids.has(preferred)) {
        return preferred;
    }

    const stored = opts.storedLayoutId ?? loadLastLayoutId(opts.user);
    if (stored && ids.has(stored)) {
        return stored;
    }

    if (layouts.length === 1) {
        return layouts[0].id;
    }

    return layouts[0].id;
}

export function readAutoOpenPref() {
    try {
        const params = new URLSearchParams(location.search);
        const q = params.get('auto_open');
        if (q === '0' || q === 'false') {
            return false;
        }
        if (q === '1' || q === 'true') {
            return true;
        }
        const stored = localStorage.getItem('viewer:autoOpen');
        if (stored === '0') {
            return false;
        }
    } catch {
        /* ignore */
    }
    return true;
}

export function defaultLayoutFromUrl() {
    try {
        return new URLSearchParams(location.search).get('default_layout')?.trim() || '';
    } catch {
        return '';
    }
}
