/** In-app update cards for the Electron desktop shell (no OS toast notifications). */

let stackEl = null;

function ensureStack() {
    if (stackEl) {
        return stackEl;
    }
    stackEl = document.createElement('div');
    stackEl.id = 'desktop-update-stack';
    stackEl.className = 'desktop-update-stack';
    stackEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(stackEl);
    return stackEl;
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function removeCard(id) {
    document.getElementById(id)?.remove();
}

function showCard(id, html, autoHideMs = 0) {
    const stack = ensureStack();
    removeCard(id);
    const card = document.createElement('div');
    card.id = id;
    card.className = 'desktop-update-card';
    card.innerHTML = html;
    stack.appendChild(card);
    if (autoHideMs > 0) {
        setTimeout(() => removeCard(id), autoHideMs);
    }
    return card;
}

function bindActions(card, actions) {
    for (const [sel, fn] of actions) {
        card.querySelector(sel)?.addEventListener('click', (e) => {
            e.preventDefault();
            fn();
        });
    }
}

function iconFor(kind) {
    switch (kind) {
        case 'downloading':
            return '⬇';
        case 'ready':
            return '✓';
        case 'installing':
            return '⟳';
        case 'installed':
            return '★';
        case 'error':
            return '!';
        default:
            return '↑';
    }
}

function renderFromState(state) {
    if (!state?.status || state.status === 'idle') {
        return;
    }
    handleUpdateEvent({kind: state.status, ...state});
}

export function handleUpdateEvent(event) {
    if (!event?.kind) {
        return;
    }

    const kind = event.kind;
    const version = event.version ? ` ${event.version}` : '';
    const title =
        event.title ||
        ({
            available: 'Update available',
            downloading: 'Downloading update',
            ready: 'Update ready',
            installing: 'Installing update',
            installed: 'Update complete',
            error: 'Update failed',
        }[kind] ||
            'Update');

    if (kind === 'state') {
        if (event.status === 'idle') {
            removeCard('desktop-update-active');
            return;
        }
        renderFromState(event);
        return;
    }

    if (kind === 'installed') {
        showCard(
            'desktop-update-active',
            `
            <div class="desktop-update-icon success">${iconFor(kind)}</div>
            <div class="desktop-update-body">
                <div class="desktop-update-title">${escapeHtml(title)}</div>
                <p class="desktop-update-text">${escapeHtml(event.message || `Camera Wall${version} is ready.`)}</p>
            </div>
            <button type="button" class="desktop-update-close" data-act="dismiss" aria-label="Dismiss">×</button>
            `,
            12000,
        );
        const card = document.getElementById('desktop-update-active');
        bindActions(card, [['[data-act="dismiss"]', () => removeCard('desktop-update-active')]]);
        return;
    }

    if (kind === 'ready') {
        const card = showCard(
            'desktop-update-active',
            `
            <div class="desktop-update-icon ready">${iconFor(kind)}</div>
            <div class="desktop-update-body">
                <div class="desktop-update-title">${escapeHtml(title)}</div>
                <p class="desktop-update-text">Version${escapeHtml(version)} has been downloaded. Restart for silent install, or run the installer manually if that fails.</p>
                <div class="desktop-update-actions">
                    <button type="button" class="primary" data-act="install">Restart now</button>
                    <button type="button" class="ghost" data-act="manual">Run installer…</button>
                    <button type="button" class="ghost" data-act="folder">Show download</button>
                    <button type="button" class="ghost" data-act="later">Later</button>
                </div>
            </div>
            `,
            10000,
        );
        bindActions(card, [
            [
                '[data-act="install"]',
                () => {
                    window.go2rtcDesktop?.installPendingUpdate?.();
                },
            ],
            [
                '[data-act="manual"]',
                () => {
                    window.go2rtcDesktop?.runPendingInstallerManual?.();
                },
            ],
            [
                '[data-act="folder"]',
                () => {
                    window.go2rtcDesktop?.showPendingInstaller?.();
                },
            ],
            [
                '[data-act="later"]',
                () => {
                    removeCard('desktop-update-active');
                    window.go2rtcDesktop?.dismissUpdateReady?.();
                },
            ],
        ]);
        return;
    }

    if (kind === 'downloading') {
        const pct = Math.max(0, Math.min(100, Number(event.progress) || 0));
        const card = showCard(
            'desktop-update-active',
            `
            <div class="desktop-update-icon">${iconFor(kind)}</div>
            <div class="desktop-update-body">
                <div class="desktop-update-title">${escapeHtml(title)}</div>
                <p class="desktop-update-text">Camera Wall${escapeHtml(version)} — please wait…</p>
                <div class="desktop-update-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
                    <div class="desktop-update-progress-bar" style="width:${pct || 8}%"></div>
                </div>
            </div>
            `,
        );
        return card;
    }

    if (kind === 'installing') {
        showCard(
            'desktop-update-active',
            `
            <div class="desktop-update-icon spinning">${iconFor(kind)}</div>
            <div class="desktop-update-body">
                <div class="desktop-update-title">${escapeHtml(title)}</div>
                <p class="desktop-update-text">${escapeHtml(event.message || 'The app will restart in a moment…')}</p>
            </div>
            `,
        );
        return;
    }

    if (kind === 'available') {
        showCard(
            'desktop-update-active',
            `
            <div class="desktop-update-icon">${iconFor(kind)}</div>
            <div class="desktop-update-body">
                <div class="desktop-update-title">${escapeHtml(title)}</div>
                <p class="desktop-update-text">Version${escapeHtml(version)} is available. Enable auto-download in Settings or use the menu to download.</p>
            </div>
            <button type="button" class="desktop-update-close" data-act="dismiss" aria-label="Dismiss">×</button>
            `,
            10000,
        );
        const card = document.getElementById('desktop-update-active');
        bindActions(card, [['[data-act="dismiss"]', () => removeCard('desktop-update-active')]]);
        return;
    }

    if (kind === 'error') {
        const hasInstaller = !!(event.installerPath || event.updatesDir);
        const card = showCard(
            'desktop-update-active',
            `
            <div class="desktop-update-icon error">${iconFor(kind)}</div>
            <div class="desktop-update-body">
                <div class="desktop-update-title">${escapeHtml(title)}</div>
                <p class="desktop-update-text">${escapeHtml(event.message || 'Something went wrong.')}</p>
                ${
                    hasInstaller
                        ? `<div class="desktop-update-actions">
                    <button type="button" class="primary" data-act="manual">Run installer…</button>
                    <button type="button" class="ghost" data-act="folder">Show download</button>
                </div>`
                        : ''
                }
            </div>
            <button type="button" class="desktop-update-close" data-act="dismiss" aria-label="Dismiss">×</button>
            `,
            15000,
        );
        const actions = [['[data-act="dismiss"]', () => removeCard('desktop-update-active')]];
        if (hasInstaller) {
            actions.push(
                [
                    '[data-act="manual"]',
                    () => {
                        window.go2rtcDesktop?.runPendingInstallerManual?.();
                    },
                ],
                [
                    '[data-act="folder"]',
                    () => {
                        window.go2rtcDesktop?.showPendingInstaller?.();
                    },
                ],
            );
        }
        bindActions(card, actions);
    }
}

export async function initDesktopUpdateUi() {
    const api = window.go2rtcDesktop;
    if (!api?.onUpdateEvent) {
        return;
    }
    api.onUpdateEvent(handleUpdateEvent);
    if (typeof api.getUpdateState === 'function') {
        try {
            const state = await api.getUpdateState();
            renderFromState(state);
        } catch {
            /* ignore */
        }
    }
}

/** Legacy string toast from main process — route through the same UI stack. */
export function showDesktopNotice(message, ms = 8000) {
    showCard(
        'desktop-update-notice',
        `
        <div class="desktop-update-icon">i</div>
        <div class="desktop-update-body">
            <p class="desktop-update-text">${escapeHtml(message)}</p>
        </div>
        <button type="button" class="desktop-update-close" data-act="dismiss" aria-label="Dismiss">×</button>
        `,
        ms,
    );
    const card = document.getElementById('desktop-update-notice');
    bindActions(card, [['[data-act="dismiss"]', () => removeCard('desktop-update-notice')]]);
}
