const path = require('path');
const fs = require('fs');
const os = require('os');
const core = require('./config-core');

const CONFIG_FILE = 'config.json';

function userDataDir() {
    if (process.platform === 'win32' && process.env.APPDATA) {
        return path.join(process.env.APPDATA, 'go2rtc-viewer');
    }
    if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'go2rtc-viewer');
    }
    return path.join(os.homedir(), '.config', 'go2rtc-viewer');
}

function configPath() {
    const {app} = require('electron');
    return path.join(app.getPath('userData'), CONFIG_FILE);
}

function brandingSearchDirs() {
    const dirs = [path.join(__dirname, 'branding')];
    if (process.resourcesPath) {
        dirs.push(path.join(process.resourcesPath, 'branding'));
    }
    dirs.push(path.join(userDataDir(), 'branding'));
    return [...new Set(dirs)];
}

function readJsonFile(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function loadBrandingFiles() {
    return core.mergeBrandingFromDirs(core.DEFAULT_BRANDING, brandingSearchDirs(), readJsonFile);
}

function normalizeConfig(raw) {
    return core.normalizeConfig(raw, loadBrandingFiles());
}

function loadConfig() {
    let raw = null;
    try {
        raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    } catch {
        /* use defaults */
    }
    return normalizeConfig(raw || {});
}

function saveConfig(cfg) {
    const dir = path.dirname(configPath());
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(configPath(), JSON.stringify(normalizeConfig(cfg), null, 2), 'utf8');
}

function earlyLoadConfig() {
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(userDataDir(), CONFIG_FILE), 'utf8'));
        return normalizeConfig(raw);
    } catch {
        return normalizeConfig({});
    }
}

function resolveLogoPath(branding) {
    return core.resolveLogoPath(branding, brandingSearchDirs(), (p) => fs.existsSync(p));
}

function logoFileUrl(branding) {
    return core.logoFileUrl(branding, brandingSearchDirs(), (p) => fs.existsSync(p));
}

module.exports = {
    CONFIG_FILE,
    ...core,
    userDataDir,
    configPath,
    brandingSearchDirs,
    loadConfig,
    saveConfig,
    earlyLoadConfig,
    normalizeConfig,
    resolveLogoPath,
    logoFileUrl,
};
