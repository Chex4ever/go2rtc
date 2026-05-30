import {api, basePath} from './viewer-api.js';
import {state} from './viewer-state.js';

let dialogEl;

function ensureDialog() {
    if (dialogEl) {
        return dialogEl;
    }
    dialogEl = document.createElement('dialog');
    dialogEl.id = 'viewer-about-dialog';
    dialogEl.className = 'tile-debug-dialog viewer-about-dialog';
    dialogEl.innerHTML = `
        <form method="dialog" class="tile-debug-panel">
            <header class="tile-debug-header">
                <h2>About Camera Wall</h2>
                <button type="submit" class="tile-debug-close" aria-label="Close">✕</button>
            </header>
            <div id="viewer-about-body" class="tile-debug-body"></div>
            <footer class="tile-debug-footer">
                <button type="button" id="viewer-about-copy">Copy info</button>
                <button type="submit" class="primary">Close</button>
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

async function clientInfo() {
    const info = {
        page_url: location.href,
        user_agent: navigator.userAgent,
        base_path: basePath() || '/',
    };
    if (state.user) {
        info.signed_in_as = state.user;
    }
    if (state.currentLayoutId) {
        info.current_layout = state.currentLayoutId;
    }
    try {
        if (window.go2rtcDesktop?.getClientInfo) {
            Object.assign(info, await window.go2rtcDesktop.getClientInfo());
        }
    } catch {
        /* optional desktop bridge */
    }
    return info;
}

function formatUpdateSource(src) {
    if (!src) {
        return 'not configured';
    }
    if (src.source === 'github') {
        return `GitHub (${src.github})`;
    }
    if (src.source === 'local') {
        return `local file (v${src.version})`;
    }
    return src.source || 'unknown';
}

function renderAboutHtml(server, client) {
    const parts = [
        renderSection('Versions', [
            ['go2rtc server', server?.go2rtc_version || '(unknown)'],
            ['Camera wall UI', server?.viewer_ui_version || '(old server — upgrade go2rtc.exe)'],
            ['Desktop app', client.desktop_app || '(browser)'],
            ['Electron', client.electron || '—'],
        ]),
        renderSection('Connection', [
            ['Server URL', client.server_url || location.origin + (basePath() || '')],
            ['Page', client.page_url],
            ['Signed in as', client.signed_in_as],
            ['Current layout', client.current_layout],
        ]),
        renderSection('Updates configured on server', [
            ['go2rtc binary', formatUpdateSource(server?.updates?.go2rtc)],
            ['Camera Wall app', formatUpdateSource(server?.updates?.desktop)],
        ]),
        renderSection('Features', [
            ['Tile debug (🐞)', server?.features?.tile_debug ? 'yes' : 'no — upgrade go2rtc.exe'],
            ['About dialog', server?.features?.about ? 'yes' : 'no'],
        ]),
    ];

    if (server?.viewer_config) {
        parts.push(
            renderSection('Server config', [
                ['viewer.yaml path', server.viewer_config],
                ['Server time (UTC)', server.server_time],
                ['Build', server.build],
            ]),
        );
    }

    parts.push(
        '<p class="tile-debug-hint">Tile controls (zoom, snapshot, <strong>🐞 debug</strong>) appear when you <strong>hover</strong> a camera tile. Move the mouse to the top edge to show the wall menu.</p>',
    );

    if (!server?.features?.tile_debug) {
        parts.push(
            '<p class="tile-debug-warn">This server is missing the tile debug button. Replace <code>go2rtc.exe</code> with a build that includes viewer UI v1.2.4+ and reload the page (Ctrl+R).</p>',
        );
    }

    if (server?.fetchError) {
        parts.unshift(`<p class="tile-debug-warn">${escapeHtml(server.fetchError)}</p>`);
    }

    return parts.join('');
}

async function loadAboutReport() {
    let server = null;
    let fetchError = null;
    try {
        server = await api('GET', '/api/viewer/about');
    } catch (e) {
        fetchError = e?.message || String(e);
        server = {fetchError};
    }
    const client = await clientInfo();
    return {server, client, html: renderAboutHtml(server, client), text: JSON.stringify({server, client}, null, 2)};
}

export async function openAboutModal() {
    const dlg = ensureDialog();
    const body = dlg.querySelector('#viewer-about-body');
    const btnCopy = dlg.querySelector('#viewer-about-copy');

    body.innerHTML = '<p class="tile-debug-loading">Loading…</p>';

    let lastReport = null;

    const refresh = async () => {
        body.innerHTML = '<p class="tile-debug-loading">Loading…</p>';
        lastReport = await loadAboutReport();
        body.innerHTML = lastReport.html;
    };

    btnCopy.onclick = async () => {
        if (!lastReport) {
            await refresh();
        }
        try {
            await navigator.clipboard.writeText(lastReport.text);
            btnCopy.textContent = 'Copied';
            setTimeout(() => {
                btnCopy.textContent = 'Copy info';
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
