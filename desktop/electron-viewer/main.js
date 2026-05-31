const {app, BrowserWindow, Menu, shell, ipcMain, dialog, globalShortcut, screen} = require('electron');
const path = require('path');
const fs = require('fs');
const cfg = require('./config');
const {buildLoadErrorPage} = require('./load-error-page');
const updater = require('./updater');
const updateNotify = require('./update-notify');
const appLog = require('./app-log');

appLog.setUserDataPath(() => {
    try {
        return require('electron').app.getPath('userData');
    } catch {
        return cfg.userDataDir();
    }
});
appLog.installProcessLogHandlers();
function sendUpdateEventToViewer(payload) {
    const win = mainWindow;
    if (!win || win.isDestroyed()) {
        return;
    }
    win.webContents.send('desktop:update-event', payload);
    if (payload?.kind === 'ready') {
        buildMenu();
    }
}

updateNotify.setUpdateEventSender(sendUpdateEventToViewer);

async function installPendingUpdateFromMenu() {
    updater.initUpdaterCache();
    const currentVersion = app.getVersion();
    let pending = updater.pendingReadyForInstall(currentVersion);
    if (!pending) {
        try {
            const check = await updater.checkForUpdates({serverUrl: getConfig().serverUrl});
            if (check.info) {
                pending = updater.pendingReadyForInstall(currentVersion, check.info);
            }
        } catch (e) {
            require('./updater-cache').logUpdate('install menu resolve failed', {error: String(e?.message || e)});
        }
    }
    if (!pending) {
        const diag = updater.getUpdateDiagnostics();
        updateNotify.emitUpdateEvent({
            kind: 'error',
            message: `No downloaded update is ready to install. Log: ${diag.update_log}`,
        });
        return;
    }
    try {
        await updater.installPendingUpdate(mainWindow, pending);
    } catch (e) {
        updateNotify.emitUpdateEvent({kind: 'error', message: e?.message || String(e)});
    }
}

updater.setRequestAppQuit(() => {
    app.quittingForUpdate = true;
    for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) {
            w.destroy();
        }
    }
    setTimeout(() => app.exit(0), 1500);
});
const brandingAssets = require('./branding-assets');
const windowBoundsLib = require('./window-bounds');

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let settingsWindow = null;
/** @type {ReturnType<typeof cfg.loadConfig> | null} */
let currentConfig = null;

const LOAD_RETRY_MAX = 8;
const LOAD_RETRY_MS = 1500;
/** @type {boolean} */
let promptedConnectionSettings = false;

if (cfg.earlyLoadConfig().allowInsecureHttps) {
    app.commandLine.appendSwitch('ignore-certificate-errors');
}

function getConfig() {
    currentConfig = cfg.loadConfig();
    return currentConfig;
}

function viewerUrlForConfig(config) {
    return cfg.viewerUrl(config.serverUrl, {
        autoOpenLayout: config.autoOpenLayout,
        defaultLayoutId: config.defaultLayoutId,
    });
}

function serverBase(serverUrl) {
    try {
        const u = new URL(cfg.normalizeServerUrl(serverUrl));
        return `${u.protocol}//${u.host}`;
    } catch {
        return cfg.normalizeServerUrl(serverUrl);
    }
}

function isAllowedNavigation(url, serverUrl) {
    const base = serverBase(serverUrl);
    return url === base || url.startsWith(`${base}/`);
}

function brandingDir() {
    return path.join(cfg.userDataDir(), 'branding');
}

function appIconPath() {
    const candidates = [
        path.join(brandingDir(), 'icon.png'),
        path.join(brandingDir(), 'icon.ico'),
        path.join(__dirname, 'build', 'icon.png'),
        path.join(__dirname, 'build', 'icon.ico'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    return undefined;
}

function applyWindowIcon(win) {
    const icon = appIconPath();
    if (icon && win && !win.isDestroyed()) {
        try {
            win.setIcon(icon);
        } catch {
            /* ignore */
        }
    }
}

function applyAppBranding(config) {
    const b = config.branding;
    app.setName(b.productName || 'Camera Wall');
    if (process.platform === 'win32' && b.productName) {
        try {
            app.setAppUserModelId(`com.iridi.viewer.${b.productName.replace(/\W+/g, '').slice(0, 24)}`);
        } catch {
            /* ignore */
        }
    }
}

function applyAutoStart(enabled) {
    if (process.platform === 'darwin' || process.platform === 'win32') {
        const login = {
            openAtLogin: enabled,
            openAsHidden: false,
            path: process.execPath,
        };
        if (!app.isPackaged) {
            login.args = [path.resolve(__dirname)];
        }
        app.setLoginItemSettings(login);
    }
}

function parseCliOverrides() {
    const out = {};
    for (const arg of process.argv.slice(1)) {
        if (arg.startsWith('--server=')) {
            out.serverUrl = cfg.normalizeServerUrl(arg.slice('--server='.length));
        }
        if (arg === '--kiosk') {
            out.kiosk = true;
        }
        if (arg.startsWith('--branding=')) {
            out.brandingFile = arg.slice('--branding='.length);
        }
    }
    return out;
}

function applyCliOverrides() {
    const cli = parseCliOverrides();
    if (cli.brandingFile && fs.existsSync(cli.brandingFile)) {
        const dir = path.join(cfg.userDataDir(), 'branding');
        fs.mkdirSync(dir, {recursive: true});
        fs.copyFileSync(cli.brandingFile, path.join(dir, 'branding.json'));
    }
    if (cli.serverUrl !== undefined || cli.kiosk !== undefined) {
        const c = getConfig();
        if (cli.serverUrl !== undefined) {
            c.serverUrl = cli.serverUrl;
        }
        if (cli.kiosk !== undefined) {
            c.kiosk = cli.kiosk;
        }
        cfg.saveConfig(c);
    }
}

async function injectViewerBranding(win, config) {
    const b = config.branding;
    const logoUrl = cfg.logoDataUrl(b) || cfg.logoFileUrl(b) || '';
    const accent = b.accentColor || '#1565c0';
    const css = `
      :root { --viewer-accent: ${accent}; }
      #app .primary, #login-form button.primary, #layout-list .layout-card:focus {
        background: ${accent} !important;
        border-color: ${accent} !important;
      }
      #app h1, #app .panel h1 { color: ${accent}; }
      #electron-brand-bar {
        display: flex; align-items: center; gap: 10px;
        padding: 6px 12px; background: #1a1a1a; color: #eee;
        font: 14px/1.3 system-ui, Segoe UI, sans-serif;
        border-bottom: 2px solid ${accent};
      }
      #electron-brand-bar img { height: 28px; width: auto; }
      #electron-brand-footer {
        text-align: center; font-size: 12px; color: #888;
        padding: 4px; background: #111;
      }
    `;
    try {
        await win.webContents.insertCSS(css);
        await win.webContents.executeJavaScript(`
          (function() {
            document.title = ${JSON.stringify(b.windowTitle || 'Camera Wall')};
            const app = document.getElementById('app');
            if (!app) return;
            let bar = document.getElementById('electron-brand-bar');
            if (!bar && (${JSON.stringify(b.orgName || '')} || ${JSON.stringify(logoUrl || '')})) {
              bar = document.createElement('div');
              bar.id = 'electron-brand-bar';
              app.prepend(bar);
            }
            if (bar) {
              bar.innerHTML = '';
              const logo = ${JSON.stringify(logoUrl || '')};
              const org = ${JSON.stringify(b.orgName || '')};
              if (logo) {
                document.querySelectorAll('img.brand-logo').forEach(function(img) {
                  img.src = logo;
                });
                const img = document.createElement('img');
                img.src = logo;
                img.alt = 'logo';
                bar.appendChild(img);
              }
              if (org) {
                const span = document.createElement('span');
                span.textContent = org;
                bar.appendChild(span);
              }
              if (!logo && !org) bar.remove();
            }
            let foot = document.getElementById('electron-brand-footer');
            const footText = ${JSON.stringify(b.footerText || '')};
            if (footText) {
              if (!foot) {
                foot = document.createElement('div');
                foot.id = 'electron-brand-footer';
                app.appendChild(foot);
              }
              foot.textContent = footText;
            } else if (foot) foot.remove();
          })();
        `);
    } catch {
        /* viewer DOM may differ */
    }
}

function brandingLogoDataUrl(config) {
    const fromBranding = cfg.logoDataUrl(config?.branding || getConfig().branding);
    if (fromBranding) {
        return fromBranding;
    }
    const candidates = [
        path.join(__dirname, 'branding', 'logo.png'),
        path.join(__dirname, 'build', 'icon-128.png'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
        }
    }
    return null;
}

function wireLoadErrorPageActions(win) {
    win.webContents.once('did-finish-load', () => {
        const url = win.webContents.getURL();
        if (!url.startsWith('data:text/html')) {
            return;
        }
        win.webContents
            .executeJavaScript(
                `(function () {
                  var api = window.go2rtcDesktop;
                  if (!api) return;
                  var retry = document.getElementById('load-error-retry');
                  var openSrv = document.getElementById('load-error-open-server');
                  var openSettings = document.getElementById('load-error-open-settings');
                  if (retry) {
                    retry.addEventListener('click', function () { api.retryViewerLoad(); });
                  }
                  if (openSrv) {
                    openSrv.addEventListener('click', function () { api.openServerExternal(); });
                  }
                  if (openSettings) {
                    openSettings.addEventListener('click', function () { api.openSettings(); });
                  }
                })();`,
            )
            .catch(() => {});
    });
}

function showViewerLoadError(win, config, details) {
    const serverUrl = cfg.normalizeServerUrl(config.serverUrl);
    const html = buildLoadErrorPage({
        serverUrl,
        viewerUrl: viewerUrlForConfig(config),
        branding: config.branding,
        logoDataUrl: brandingLogoDataUrl(config),
        ...details,
    });
    wireLoadErrorPageActions(win);
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    win.setTitle(config.branding.windowTitle || 'Camera Wall');

    if (
        !promptedConnectionSettings &&
        details.errorCode === -102 &&
        cfg.isLocalhostServer(serverUrl)
    ) {
        promptedConnectionSettings = true;
        setTimeout(() => openSettings(), 400);
    }
}

function attachViewerLoadHandlers(win, config) {
    let loadRetryCount = 0;

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) {
            return;
        }
        // -3 ERR_ABORTED — navigation replaced (e.g. reload); not a user-visible failure.
        if (errorCode === -3) {
            return;
        }
        event.preventDefault();

        const retryable = errorCode === -102 || errorCode === -105 || errorCode === -106;
        if (retryable && loadRetryCount < LOAD_RETRY_MAX) {
            loadRetryCount += 1;
            const title = config.branding.windowTitle || 'Camera Wall';
            win.setTitle(`${title} — waiting for go2rtc (${loadRetryCount}/${LOAD_RETRY_MAX})…`);
            setTimeout(() => {
                if (win.isDestroyed()) {
                    return;
                }
                win.loadURL(viewerUrlForConfig(getConfig()));
            }, LOAD_RETRY_MS);
            return;
        }

        loadRetryCount = 0;
        showViewerLoadError(win, getConfig(), {errorCode, errorDescription, validatedURL});
    });

    win.webContents.on('did-finish-load', () => {
        const url = win.webContents.getURL();
        if (!url || url.startsWith('data:')) {
            return;
        }
        loadRetryCount = 0;
        win.setTitle(config.branding.windowTitle || 'Camera Wall');
        injectViewerBranding(win, config);
        win.webContents
            .executeJavaScript(
                `(function () {
                  setTimeout(function () {
                    var boot = document.getElementById('screen-bootstrap');
                    if (!boot || boot.classList.contains('hidden')) return;
                    var st = document.getElementById('bootstrap-status');
                    if (!st || st.textContent.indexOf('Loading') === -1) return;
                    if (window.__viewerShowError) {
                      window.__viewerShowError(
                        'Camera wall did not start',
                        'Still loading after 20s. Sign in may be required, or go2rtc is not reachable.',
                        'Open ' + location.origin + '/viewer/ in a browser, or check Ctrl+Shift+S server URL (e.g. http://127.0.0.1:1984), then Retry (Ctrl+R).'
                      );
                    }
                  }, 20000);
                })();`,
            )
            .catch(() => {});
    });
}

/** @type {ReturnType<typeof setTimeout> | null} */
let saveBoundsTimer = null;

function loadMainWindowBounds(existingBounds) {
    const config = getConfig();
    if (config.kiosk) {
        return existingBounds || null;
    }
    if (existingBounds) {
        return windowBoundsLib.normalizeWindowBounds(existingBounds) || existingBounds;
    }
    return windowBoundsLib.resolveWindowBounds(config.windowBounds, screen.getAllDisplays());
}

function persistMainWindowBounds() {
    const config = getConfig();
    if (config.kiosk || !mainWindow || mainWindow.isDestroyed()) {
        return;
    }
    const normalized = windowBoundsLib.normalizeWindowBounds(mainWindow.getBounds());
    if (!normalized) {
        return;
    }
    const prev = config.windowBounds;
    if (
        prev &&
        prev.x === normalized.x &&
        prev.y === normalized.y &&
        prev.width === normalized.width &&
        prev.height === normalized.height
    ) {
        return;
    }
    cfg.saveConfig({...config, windowBounds: normalized});
}

function schedulePersistMainWindowBounds() {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => {
        saveBoundsTimer = null;
        persistMainWindowBounds();
    }, 400);
}

function attachMainWindowBoundsPersistence(win) {
    if (!win || getConfig().kiosk) {
        return;
    }
    win.on('move', schedulePersistMainWindowBounds);
    win.on('resize', schedulePersistMainWindowBounds);
    win.on('close', () => {
        clearTimeout(saveBoundsTimer);
        persistMainWindowBounds();
    });
}

function createMainWindow(existingBounds) {
    const config = getConfig();
    applyAppBranding(config);
    const savedBounds = loadMainWindowBounds(existingBounds);

    const winOpts = {
        backgroundColor: '#0f1114',
        show: false,
        width: savedBounds?.width || 1360,
        height: savedBounds?.height || 860,
        minWidth: config.kiosk ? undefined : 800,
        minHeight: config.kiosk ? undefined : 600,
        title: config.branding.windowTitle || 'Camera Wall',
        autoHideMenuBar: config.kiosk || config.startFullscreen,
        fullscreen: config.kiosk || config.startFullscreen,
        kiosk: config.kiosk,
        frame: !config.kiosk,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    };
    if (savedBounds?.x != null && savedBounds?.y != null) {
        winOpts.x = savedBounds.x;
        winOpts.y = savedBounds.y;
    }
    const icon = appIconPath();
    if (icon) {
        winOpts.icon = icon;
    }

    mainWindow = new BrowserWindow(winOpts);
    applyWindowIcon(mainWindow);
    attachMainWindowBoundsPersistence(mainWindow);
    attachViewerLoadHandlers(mainWindow, config);
    mainWindow.once('ready-to-show', () => {
        if (!config.kiosk && config.startFullscreen) {
            mainWindow?.setFullScreen(true);
        }
        mainWindow?.show();
        mainWindow?.focus();
    });
    mainWindow.loadURL(viewerUrlForConfig(config));

    mainWindow.webContents.setWindowOpenHandler(({url}) => {
        shell.openExternal(url);
        return {action: 'deny'};
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!isAllowedNavigation(url, config.serverUrl)) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    if (config.kiosk) {
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
    }
}

function recreateMainWindow() {
    const bounds = mainWindow?.getBounds();
    const oldMain = mainWindow;
    mainWindow = null;
    createMainWindow(bounds);
    if (oldMain && !oldMain.isDestroyed()) {
        oldMain.destroy();
    }
    mainWindow?.show();
    mainWindow?.focus();
}

async function applyMainWindowAfterSettings(prev, next) {
    const kioskChanged = prev.kiosk !== next.kiosk;
    const fullscreenChanged = prev.startFullscreen !== next.startFullscreen;
    const serverChanged = prev.serverUrl !== next.serverUrl;

    if (kioskChanged || fullscreenChanged) {
        recreateMainWindow();
        return;
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
        createMainWindow();
        mainWindow?.show();
        mainWindow?.focus();
        return;
    }

    mainWindow.setTitle(next.branding.windowTitle || 'Camera Wall');
    applyWindowIcon(mainWindow);
    if (serverChanged) {
        await mainWindow.loadURL(viewerUrlForConfig(next));
    } else {
        await injectViewerBranding(mainWindow, next);
    }
    mainWindow.show();
    mainWindow.focus();
}

function openServerUrl(pathSuffix) {
    const url = `${cfg.normalizeServerUrl(getConfig().serverUrl)}${pathSuffix}`;
    shell.openExternal(url);
}

async function fetchServerAbout(serverUrl) {
    const url = `${cfg.normalizeServerUrl(serverUrl)}/api/viewer/about`;
    const res = await fetch(url, {headers: {Accept: 'application/json'}});
    if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
    }
    return res.json();
}

function formatUpdateSource(src) {
    if (!src) {
        return 'not configured';
    }
    if (src.source === 'github') {
        return `GitHub (${src.github})`;
    }
    if (src.source === 'local') {
        return `local v${src.version}`;
    }
    return src.source || 'unknown';
}

function formatAboutDetail(client, server, serverError) {
    const lines = [
        `Desktop app: ${client.desktop_app}`,
        `Electron: ${client.electron}`,
        `Platform: ${client.platform} (${client.arch})`,
        `Server URL: ${client.server_url}`,
        '',
    ];
    if (server) {
        lines.push(
            `go2rtc server: ${server.go2rtc_version}`,
            `Camera wall UI: ${server.viewer_ui_version}`,
            `Tile debug (🐞): ${server.features?.tile_debug ? 'yes' : 'no — upgrade go2rtc.exe'}`,
            `go2rtc updates: ${formatUpdateSource(server.updates?.go2rtc)}`,
            `Desktop updates: ${formatUpdateSource(server.updates?.desktop)}`,
        );
        if (server.viewer_config) {
            lines.push(`viewer.yaml: ${server.viewer_config}`);
        }
    } else {
        lines.push(`Server info unavailable: ${serverError || 'unknown error'}`);
    }
    lines.push(
        '',
        'Tile controls (zoom, snapshot, debug 🐞) appear when you hover a camera tile.',
        'Move the mouse to the top edge to show the wall menu (About, Sign out).',
    );
    return lines.join('\n');
}

async function showAboutDialog() {
    const config = getConfig();
    const b = config.branding;
    const appLabel = b.productName || 'Camera Wall';
    const client = {
        desktop_app: app.getVersion(),
        electron: process.versions.electron,
        platform: process.platform,
        arch: process.arch,
        server_url: cfg.normalizeServerUrl(config.serverUrl),
        packaged: app.isPackaged,
    };
    let server = null;
    let serverError = null;
    try {
        server = await fetchServerAbout(config.serverUrl);
    } catch (e) {
        serverError = e.message || String(e);
    }
    await dialog.showMessageBox(mainWindow || settingsWindow, {
        type: 'info',
        title: `About ${appLabel}`,
        message: appLabel,
        detail: formatAboutDetail(client, server, serverError),
    });
}

function buildMenu() {
    const config = getConfig();
    const b = config.branding;
    const appLabel = b.productName || 'Camera Wall';

    const pending = app.isPackaged ? updater.pendingReadyForInstall(app.getVersion()) : null;
    const appSubmenu = [
        {
            label: 'go2rtc home',
            click: () => openServerUrl('/'),
        },
        {
            label: 'go2rtc config (YAML)',
            click: () => openServerUrl('/config.html'),
        },
        {
            label: 'Viewer admin',
            click: () => openServerUrl('/viewer/admin.html'),
        },
        {type: 'separator'},
        {
            label: 'Settings…',
            accelerator: 'CmdOrCtrl+,',
            click: () => openSettings(),
        },
        {
            label: 'Check for updates…',
            click: () => checkForUpdatesNow(),
        },
    ];
    if (pending) {
        appSubmenu.push({
            label: `Restart to install ${pending.version}…`,
            click: () => {
                installPendingUpdateFromMenu().catch(() => {});
            },
        });
    }
    appSubmenu.push(
        {
            label: 'About Camera Wall…',
            click: () => {
                showAboutDialog().catch((e) => {
                    dialog.showErrorBox('About', e.message || String(e));
                });
            },
        },
        {type: 'separator'},
        {role: 'quit'},
    );

    const template = [
        {
            label: appLabel,
            submenu: appSubmenu,
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Reload viewer',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => mainWindow?.webContents.reload(),
                },
                {
                    label: config.kiosk ? 'Exit kiosk (reload window)' : 'Enter kiosk mode',
                    click: () => {
                        const c = getConfig();
                        c.kiosk = !c.kiosk;
                        cfg.saveConfig(c);
                        recreateMainWindow();
                        buildMenu();
                    },
                },
                {role: 'togglefullscreen'},
                {type: 'separator'},
                {role: 'toggledevtools'},
            ],
        },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function openSettings() {
    const config = getConfig();
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }

    const settingsOpts = {
        width: 560,
        height: 640,
        resizable: true,
        minimizable: false,
        maximizable: false,
        parent: mainWindow || undefined,
        modal: !!mainWindow,
        title: config.branding.settingsTitle || 'Settings',
        webPreferences: {
            preload: path.join(__dirname, 'settings-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    };
    const settingsIcon = appIconPath();
    if (settingsIcon) {
        settingsOpts.icon = settingsIcon;
    }
    settingsWindow = new BrowserWindow(settingsOpts);
    settingsWindow.loadFile(path.join(__dirname, 'settings.html'));

    settingsWindow.on('closed', () => {
        settingsWindow = null;
        mainWindow?.focus();
    });
}

function scheduleUpdateCheck() {
    if (!app.isPackaged) {
        return;
    }
    const config = getConfig();
    if (config.checkUpdatesOnStartup === false) {
        return;
    }
    setTimeout(() => {
        updater
            .runBackgroundUpdateCheck({
                serverUrl: config.serverUrl,
                autoDownloadUpdates: config.autoDownloadUpdates !== false,
            })
            .then((desktop) => {
                maybeShowViewerUpdateNotice(desktop);
            })
            .catch((err) => {
                require('./updater-cache').logUpdate('background update check failed', {
                    error: String(err?.message || err),
                });
            });
    }, 8000);
}

function maybeShowViewerUpdateNotice(desktopResult) {
    if (!desktopResult || desktopResult.status !== 'viewer_only') {
        return;
    }
    const remote = String(desktopResult.remoteVersion || '').trim();
    if (!remote) {
        return;
    }
    const config = getConfig();
    if (config.lastViewerNoticeVersion === remote) {
        return;
    }
    showViewerNoticeToast('Viewer updated on server — press Ctrl+R to reload.');
    cfg.saveConfig({...config, lastViewerNoticeVersion: remote});
}

function showViewerNoticeToast(message) {
    const win = mainWindow;
    if (!win || win.isDestroyed()) {
        return;
    }
    win.webContents.send('viewer:update-notice', message);
}

async function checkForUpdatesNow() {
    const config = getConfig();
    await updater.runManualDesktopUpdateCheck({
        serverUrl: config.serverUrl,
        autoDownloadUpdates: config.autoDownloadUpdates !== false,
    });
    await updater.runGo2rtcUpdateFlow(mainWindow, {serverUrl: config.serverUrl, silent: false});
}

function registerShortcuts() {
    globalShortcut.register('CommandOrControl+Shift+S', () => openSettings());
}

function unregisterShortcuts() {
    globalShortcut.unregisterAll();
}

ipcMain.handle('viewer:retry-load', async () => {
    const config = getConfig();
    const win = mainWindow;
    if (!win || win.isDestroyed()) {
        return;
    }
    await win.loadURL(viewerUrlForConfig(config));
});

ipcMain.handle('viewer:open-settings', async () => {
    openSettings();
});

ipcMain.handle('viewer:open-server', async () => {
    const config = getConfig();
    await shell.openExternal(cfg.normalizeServerUrl(config.serverUrl));
});

ipcMain.handle('viewer:client-info', () => {
    const config = getConfig();
    return {
        desktop_app: app.getVersion(),
        electron: process.versions.electron,
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        server_url: cfg.normalizeServerUrl(config.serverUrl),
        packaged: app.isPackaged,
        kiosk: !!config.kiosk,
        auto_start: !!config.autoStart,
        start_fullscreen: !!(config.kiosk || config.startFullscreen),
        wall_chrome_hidden: !!(config.kiosk || config.wallChromeHidden),
        ...updater.getUpdateDiagnostics(),
    };
});

ipcMain.handle('settings:get', () => {
    const config = getConfig();
    return {
        ...config,
        brandingDirs: cfg.brandingSearchDirs(),
        logoPreviewUrl: cfg.logoDataUrl(config.branding) || cfg.logoFileUrl(config.branding),
        autoStartSupported: process.platform === 'win32' || process.platform === 'darwin',
        isPackaged: app.isPackaged,
    };
});

ipcMain.handle('settings:pick-logo', async () => {
    const result = await dialog.showOpenDialog(settingsWindow || mainWindow, {
        title: 'Select organization logo',
        properties: ['openFile'],
        filters: [{name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp']}],
    });
    if (result.canceled || !result.filePaths[0]) {
        return null;
    }
    const dir = brandingDir();
    try {
        const generated = await brandingAssets.generateBrandingAssets(result.filePaths[0], dir);
        const branding = {...getConfig().branding, logoFile: generated.logoFile};
        applyWindowIcon(mainWindow);
        applyWindowIcon(settingsWindow);
        const merged = {...getConfig(), branding};
        if (mainWindow && !mainWindow.isDestroyed()) {
            injectViewerBranding(mainWindow, merged).catch(() => {});
        }
        return {
            logoFile: generated.logoFile,
            logoPreviewUrl: cfg.logoDataUrl(branding) || cfg.logoFileUrl(branding),
            generatedCount: generated.files.length,
            message: `Created logo.png and ${generated.files.length} icon files in branding folder.`,
        };
    } catch (e) {
        return {error: e.message || String(e)};
    }
});

ipcMain.handle('settings:export-branding-kit', async (_e, branding) => {
    const result = await dialog.showOpenDialog(settingsWindow || mainWindow, {
        title: 'Export branding kit folder',
        properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) {
        return false;
    }
    const dest = path.join(result.filePaths[0], 'go2rtc-branding-kit');
    brandingAssets.writeBrandingKit(dest, branding || getConfig().branding, brandingDir());
    await dialog.showMessageBox(settingsWindow || mainWindow, {
        type: 'info',
        title: 'Branding kit exported',
        message: 'Branding kit saved',
        detail: `${dest}\n\nCopy icons to go2rtc www/viewer/icons/ and restart go2rtc. See DEPLOY.txt in the folder.`,
    });
    return dest;
});

ipcMain.handle('settings:export-branding', async (_e, branding) => {
    const result = await dialog.showSaveDialog(settingsWindow || mainWindow, {
        title: 'Export branding.json',
        defaultPath: 'branding.json',
        filters: [{name: 'JSON', extensions: ['json']}],
    });
    if (result.canceled || !result.filePath) {
        return false;
    }
    fs.writeFileSync(result.filePath, JSON.stringify(branding, null, 2), 'utf8');
    return true;
});

ipcMain.handle('settings:check-updates', async (_event, serverUrl) => {
    const url = cfg.normalizeServerUrl(serverUrl || getConfig().serverUrl);
    const config = getConfig();
    return updater.runManualDesktopUpdateCheck({
        serverUrl: url,
        autoDownloadUpdates: config.autoDownloadUpdates !== false,
    });
});

ipcMain.handle('desktop:install-pending-update', async () => {
    await installPendingUpdateFromMenu();
    return {ok: true};
});

ipcMain.handle('desktop:dismiss-update-ready', () => {
    updateNotify.patchUpdateState({status: 'idle'});
    return true;
});

ipcMain.handle('desktop:update-state', () => updateNotify.getUpdateState());

ipcMain.handle('settings:save', async (_event, payload) => {
    const prev = getConfig();
    const next = cfg.normalizeConfig({
        serverUrl: cfg.normalizeServerUrl(payload?.serverUrl),
        allowInsecureHttps: !!payload?.allowInsecureHttps,
        kiosk: !!payload?.kiosk,
        autoStart: !!payload?.autoStart,
        startFullscreen: !!payload?.startFullscreen,
        wallChromeHidden: !!payload?.wallChromeHidden,
        checkUpdatesOnStartup: payload?.checkUpdatesOnStartup !== false,
        autoDownloadUpdates: payload?.autoDownloadUpdates !== false,
        autoOpenLayout: payload?.autoOpenLayout !== false,
        defaultLayoutId: String(payload?.defaultLayoutId || '').trim(),
        branding: payload?.branding || prev.branding,
    });

    const brandingDir = path.join(cfg.userDataDir(), 'branding');
    fs.mkdirSync(brandingDir, {recursive: true});
    fs.writeFileSync(
        path.join(brandingDir, 'branding.json'),
        JSON.stringify(next.branding, null, 2),
        'utf8',
    );

    const insecureChanged = prev.allowInsecureHttps !== next.allowInsecureHttps;
    cfg.saveConfig(next);
    applyAutoStart(next.autoStart);
    applyAppBranding(next);

    if (insecureChanged) {
        dialog.showMessageBox(settingsWindow || mainWindow || undefined, {
            type: 'info',
            title: 'Restart required',
            message: 'HTTPS certificate setting changed.',
            detail: 'Close and reopen the Camera Wall app for it to take effect.',
        });
    }

    await applyMainWindowAfterSettings(prev, next);

    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.close();
    }
    settingsWindow = null;
    mainWindow?.focus();

    buildMenu();
    return next;
});

app.whenReady().then(async () => {
    applyCliOverrides();
    updater.initUpdaterCache();
    const config = getConfig();
    const upgraded = updateNotify.shouldNotifyVersionUpgrade(
        config.lastSeenAppVersion,
        app.getVersion(),
    );

    const quittingForInstall = await updater.trySilentStartupInstall();
    if (quittingForInstall) {
        return;
    }

    applyAutoStart(config.autoStart);
    buildMenu();
    registerShortcuts();
    createMainWindow();
    updater.finalizeSuccessfulLaunch(app.getVersion());
    appLog.appendAppLog('app', 'Camera Wall started', {version: app.getVersion(), packaged: app.isPackaged});

    if (upgraded) {
        const version = app.getVersion();
        mainWindow?.webContents.once('did-finish-load', () => {
            updateNotify.emitUpdateEvent({
                kind: 'installed',
                version,
                title: 'Camera Wall updated',
                message: `You are now running version ${version}.`,
            });
        });
    }
    cfg.saveConfig({...getConfig(), lastSeenAppVersion: app.getVersion()});

    scheduleUpdateCheck();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('will-quit', () => {
    unregisterShortcuts();
});

app.on('window-all-closed', () => {
    if (app.quittingForUpdate) {
        if (process.platform !== 'darwin') {
            app.quit();
        }
        return;
    }
    // Keep running while the camera wall window is open or being recreated.
    if (mainWindow && !mainWindow.isDestroyed()) {
        return;
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
