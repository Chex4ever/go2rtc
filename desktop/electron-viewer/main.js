const {app, BrowserWindow, Menu, shell, ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CONFIG_FILE = 'config.json';
const DEFAULT_SERVER = 'http://127.0.0.1:1984';

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let settingsWindow = null;

function configPath() {
    return path.join(app.getPath('userData'), CONFIG_FILE);
}

/** Read config before app.ready (for certificate switch). */
function earlyUserDataDir() {
    if (process.platform === 'win32' && process.env.APPDATA) {
        return path.join(process.env.APPDATA, 'go2rtc-viewer');
    }
    if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'go2rtc-viewer');
    }
    return path.join(os.homedir(), '.config', 'go2rtc-viewer');
}

function earlyLoadConfig() {
    try {
        const raw = fs.readFileSync(path.join(earlyUserDataDir(), CONFIG_FILE), 'utf8');
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

if (earlyLoadConfig().allowInsecureHttps) {
    app.commandLine.appendSwitch('ignore-certificate-errors');
}

function loadConfig() {
    try {
        const raw = fs.readFileSync(configPath(), 'utf8');
        const cfg = JSON.parse(raw);
        return {
            serverUrl: cfg.serverUrl || DEFAULT_SERVER,
            allowInsecureHttps: !!cfg.allowInsecureHttps,
        };
    } catch {
        return {serverUrl: DEFAULT_SERVER, allowInsecureHttps: false};
    }
}

function saveConfig(cfg) {
    fs.mkdirSync(path.dirname(configPath()), {recursive: true});
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
}

function normalizeServerUrl(url) {
    let u = String(url || '').trim();
    if (!u) {
        return DEFAULT_SERVER;
    }
    u = u.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(u)) {
        u = `http://${u}`;
    }
    return u;
}

function viewerUrl(serverUrl) {
    return `${normalizeServerUrl(serverUrl)}/viewer/`;
}

function serverBaseFromUrl(url) {
    try {
        const u = new URL(url);
        return `${u.protocol}//${u.host}`;
    } catch {
        return normalizeServerUrl(loadConfig().serverUrl);
    }
}

function parseCliServer() {
    const argv = process.argv.slice(1);
    for (const arg of argv) {
        if (arg.startsWith('--server=')) {
            return normalizeServerUrl(arg.slice('--server='.length));
        }
    }
    return null;
}

function applyCliServer() {
    const fromCli = parseCliServer();
    if (fromCli) {
        const cfg = loadConfig();
        cfg.serverUrl = fromCli;
        saveConfig(cfg);
    }
}

function isAllowedNavigation(url) {
    const base = serverBaseFromUrl(viewerUrl(loadConfig().serverUrl));
    return url === base || url.startsWith(`${base}/`);
}

function createMainWindow() {
    const cfg = loadConfig();

    mainWindow = new BrowserWindow({
        width: 1360,
        height: 860,
        minWidth: 800,
        minHeight: 600,
        title: 'go2rtc Camera Wall',
        autoHideMenuBar: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    mainWindow.loadURL(viewerUrl(cfg.serverUrl));

    mainWindow.webContents.setWindowOpenHandler(({url}) => {
        shell.openExternal(url);
        return {action: 'deny'};
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!isAllowedNavigation(url)) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function openSettings() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
        width: 480,
        height: 280,
        resizable: false,
        minimizable: false,
        maximizable: false,
        parent: mainWindow || undefined,
        modal: !!mainWindow,
        title: 'Server settings',
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
    });
}

function buildMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Server settings…',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => openSettings(),
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
                {role: 'togglefullscreen'},
                {type: 'separator'},
                {role: 'toggledevtools'},
            ],
        },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('settings:get', () => loadConfig());

ipcMain.handle('settings:save', (_event, payload) => {
    const serverUrl = normalizeServerUrl(payload?.serverUrl);
    const cfg = {
        serverUrl,
        allowInsecureHttps: !!payload?.allowInsecureHttps,
    };
    saveConfig(cfg);
    if (mainWindow) {
        mainWindow.loadURL(viewerUrl(serverUrl));
    } else {
        createMainWindow();
    }
    settingsWindow?.close();
    return cfg;
});

app.whenReady().then(() => {
    applyCliServer();
    buildMenu();
    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
