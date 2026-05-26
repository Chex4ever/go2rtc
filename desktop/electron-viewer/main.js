const {app, BrowserWindow, Menu, shell, ipcMain, dialog, globalShortcut} = require('electron');
const path = require('path');
const fs = require('fs');
const cfg = require('./config');
const {buildLoadErrorPage} = require('./load-error-page');
const updater = require('./updater');

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let settingsWindow = null;
/** @type {ReturnType<typeof cfg.loadConfig> | null} */
let currentConfig = null;

if (cfg.earlyLoadConfig().allowInsecureHttps) {
    app.commandLine.appendSwitch('ignore-certificate-errors');
}

function getConfig() {
    currentConfig = cfg.loadConfig();
    return currentConfig;
}

function viewerUrl(serverUrl) {
    return `${cfg.normalizeServerUrl(serverUrl)}/viewer/`;
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
    const logoUrl = cfg.logoFileUrl(b);
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

function showViewerLoadError(win, config, details) {
    const serverUrl = cfg.normalizeServerUrl(config.serverUrl);
    const html = buildLoadErrorPage({
        serverUrl,
        viewerUrl: viewerUrl(config.serverUrl),
        branding: config.branding,
        ...details,
    });
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function attachViewerLoadHandlers(win, config) {
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) {
            return;
        }
        // -3 ERR_ABORTED — navigation replaced (e.g. reload); not a user-visible failure.
        if (errorCode === -3) {
            return;
        }
        event.preventDefault();
        showViewerLoadError(win, config, {errorCode, errorDescription, validatedURL});
    });

    win.webContents.on('did-finish-load', () => {
        const url = win.webContents.getURL();
        if (!url || url.startsWith('data:')) {
            return;
        }
        injectViewerBranding(win, config);
    });
}

function createMainWindow(existingBounds) {
    const config = getConfig();
    applyAppBranding(config);

    const winOpts = {
        width: existingBounds?.width || 1360,
        height: existingBounds?.height || 860,
        x: existingBounds?.x,
        y: existingBounds?.y,
        minWidth: config.kiosk ? undefined : 800,
        minHeight: config.kiosk ? undefined : 600,
        title: config.branding.windowTitle || 'Camera Wall',
        autoHideMenuBar: config.kiosk,
        fullscreen: config.kiosk,
        kiosk: config.kiosk,
        frame: !config.kiosk,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    };

    mainWindow = new BrowserWindow(winOpts);
    attachViewerLoadHandlers(mainWindow, config);
    mainWindow.loadURL(viewerUrl(config.serverUrl));

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
    const serverChanged = prev.serverUrl !== next.serverUrl;

    if (kioskChanged) {
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
    if (serverChanged) {
        await mainWindow.loadURL(viewerUrl(next.serverUrl));
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

function buildMenu() {
    const config = getConfig();
    const b = config.branding;
    const appLabel = b.productName || 'Camera Wall';

    const template = [
        {
            label: appLabel,
            submenu: [
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
                {type: 'separator'},
                {role: 'quit'},
            ],
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

    settingsWindow = new BrowserWindow({
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
    });

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
            .runUpdateFlow(mainWindow, {serverUrl: config.serverUrl, silent: true})
            .catch(() => {});
    }, 8000);
}

async function checkForUpdatesNow() {
    const config = getConfig();
    await updater.runUpdateFlow(mainWindow, {serverUrl: config.serverUrl, silent: false});
}

function registerShortcuts() {
    globalShortcut.register('CommandOrControl+Shift+S', () => openSettings());
}

function unregisterShortcuts() {
    globalShortcut.unregisterAll();
}

ipcMain.handle('settings:get', () => {
    const config = getConfig();
    return {
        ...config,
        brandingDirs: cfg.brandingSearchDirs(),
        logoPreviewUrl: cfg.logoFileUrl(config.branding),
        autoStartSupported: process.platform === 'win32' || process.platform === 'darwin',
        isPackaged: app.isPackaged,
    };
});

ipcMain.handle('settings:pick-logo', async () => {
    const result = await dialog.showOpenDialog(settingsWindow || mainWindow, {
        title: 'Select organization logo',
        properties: ['openFile'],
        filters: [{name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp']}],
    });
    if (result.canceled || !result.filePaths[0]) {
        return null;
    }
    const dir = path.join(cfg.userDataDir(), 'branding');
    fs.mkdirSync(dir, {recursive: true});
    const ext = path.extname(result.filePaths[0]) || '.png';
    const dest = path.join(dir, `logo${ext}`);
    fs.copyFileSync(result.filePaths[0], dest);
    const fileName = path.basename(dest);
    const branding = {...getConfig().branding, logoFile: fileName};
    return {logoFile: fileName, logoPreviewUrl: cfg.logoFileUrl(branding)};
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
    return updater.runUpdateFlow(settingsWindow || mainWindow, {serverUrl: url, silent: false});
});

ipcMain.handle('settings:save', async (_event, payload) => {
    const prev = getConfig();
    const next = cfg.normalizeConfig({
        serverUrl: cfg.normalizeServerUrl(payload?.serverUrl),
        allowInsecureHttps: !!payload?.allowInsecureHttps,
        kiosk: !!payload?.kiosk,
        autoStart: !!payload?.autoStart,
        checkUpdatesOnStartup: payload?.checkUpdatesOnStartup !== false,
        branding: payload?.branding || prev.branding,
    });

    const brandingDir = path.join(cfg.userDataDir(), 'branding');
    fs.mkdirSync(brandingDir, {recursive: true});
    fs.writeFileSync(
        path.join(brandingDir, 'branding.json'),
        JSON.stringify(next.branding, null, 2),
        'utf8',
    );

    cfg.saveConfig(next);
    applyAutoStart(next.autoStart);
    applyAppBranding(next);

    await applyMainWindowAfterSettings(prev, next);

    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.close();
    }
    settingsWindow = null;
    mainWindow?.focus();

    buildMenu();
    return next;
});

app.whenReady().then(() => {
    applyCliOverrides();
    const config = getConfig();
    applyAutoStart(config.autoStart);
    buildMenu();
    registerShortcuts();
    createMainWindow();
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
    // Keep running while the camera wall window is open or being recreated.
    if (mainWindow && !mainWindow.isDestroyed()) {
        return;
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
