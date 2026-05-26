const path = require('path');

const DEFAULT_SERVER = 'http://127.0.0.1:1984';

const DEFAULT_BRANDING = {
    productName: 'Тесла — Camera Wall',
    windowTitle: 'Тесла — Camera Wall',
    settingsTitle: 'Тесла — settings',
    accentColor: '#1a7a62',
    orgName: 'Тесла',
    footerText: '',
    logoFile: 'logo.png',
};

function mergeBranding(base, overlay) {
    if (!overlay || typeof overlay !== 'object') {
        return {...base};
    }
    return {...base, ...overlay};
}

function mergeBrandingFromDirs(defaults, dirs, readJson) {
    let merged = {...defaults};
    for (const dir of dirs) {
        const brandingFile = readJson(path.join(dir, 'branding.json'));
        const defaultFile = readJson(path.join(dir, 'default.json'));
        if (brandingFile) {
            merged = mergeBranding(merged, brandingFile);
        } else if (defaultFile) {
            merged = mergeBranding(merged, defaultFile);
        }
    }
    return merged;
}

function normalizeConfig(raw, brandingFromFiles) {
    const cfg = {
        serverUrl: raw?.serverUrl || DEFAULT_SERVER,
        allowInsecureHttps: !!raw?.allowInsecureHttps,
        kiosk: !!raw?.kiosk,
        autoStart: !!raw?.autoStart,
        checkUpdatesOnStartup: raw?.checkUpdatesOnStartup !== false,
        autoOpenLayout: raw?.autoOpenLayout !== false,
        defaultLayoutId: String(raw?.defaultLayoutId || '').trim(),
        branding: mergeBranding(brandingFromFiles, raw?.branding),
    };
    if (!/^#[0-9A-Fa-f]{6}$/.test(cfg.branding.accentColor)) {
        cfg.branding.accentColor = DEFAULT_BRANDING.accentColor;
    }
    return cfg;
}

function resolveLogoPath(branding, searchDirs, exists) {
    const name = (branding?.logoFile || '').trim();
    if (!name) {
        return null;
    }
    if (path.isAbsolute(name) && exists(name)) {
        return name;
    }
    for (const dir of searchDirs) {
        const candidate = path.join(dir, name);
        if (exists(candidate)) {
            return candidate;
        }
    }
    return null;
}

function logoFileUrl(branding, searchDirs, exists) {
    const p = resolveLogoPath(branding, searchDirs, exists);
    if (!p) {
        return null;
    }
    return `file:///${p.replace(/\\/g, '/')}`;
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

function viewerUrl(serverUrl, opts = {}) {
    const base = normalizeServerUrl(serverUrl);
    const url = new URL(`${base}/viewer/`);
    const autoOpen = opts.autoOpenLayout !== false;
    if (autoOpen) {
        url.searchParams.set('auto_open', '1');
    }
    const layoutId = String(opts.defaultLayoutId || '').trim();
    if (layoutId) {
        url.searchParams.set('default_layout', layoutId);
    }
    return url.href;
}

function adminUrls(serverUrl) {
    const base = normalizeServerUrl(serverUrl);
    return {
        home: `${base}/`,
        config: `${base}/config.html`,
        viewerAdmin: `${base}/viewer/admin.html`,
    };
}

/** NSIS installer modes: manual | autostart | kiosk */
function configFromInstallMode(mode, serverUrl = DEFAULT_SERVER) {
    const m = String(mode || 'manual').toLowerCase();
    return normalizeConfig(
        {
            serverUrl,
            kiosk: m === 'kiosk',
            autoStart: m === 'autostart' || m === 'kiosk',
            autoOpenLayout: m !== 'manual',
        },
        {...DEFAULT_BRANDING},
    );
}

function configToInstallerJson(cfg) {
    return JSON.stringify(
        {
            serverUrl: cfg.serverUrl,
            allowInsecureHttps: cfg.allowInsecureHttps,
            kiosk: cfg.kiosk,
            autoStart: cfg.autoStart,
            checkUpdatesOnStartup: cfg.checkUpdatesOnStartup !== false,
            autoOpenLayout: cfg.autoOpenLayout !== false,
            defaultLayoutId: cfg.defaultLayoutId || '',
        },
        null,
        2,
    );
}

module.exports = {
    DEFAULT_SERVER,
    DEFAULT_BRANDING,
    mergeBranding,
    mergeBrandingFromDirs,
    normalizeConfig,
    resolveLogoPath,
    logoFileUrl,
    normalizeServerUrl,
    viewerUrl,
    adminUrls,
    configFromInstallMode,
    configToInstallerJson,
};
