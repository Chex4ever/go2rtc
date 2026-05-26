/**
 * Generate logo + icon set from one source image (resize, square fit, PNG, ICO).
 * Used by Settings UI and `npm run icons`.
 */
const fs = require('fs');
const path = require('path');

const ICON_SIZES = [16, 32, 48, 64, 128, 256, 512];

const DEFAULT_BG = {r: 255, g: 255, b: 255, alpha: 1};

function loadSharp() {
    return require('sharp');
}

function loadPngToIco() {
    const mod = require('png-to-ico');
    return mod.default || mod;
}

/**
 * @param {string} inputPath
 * @param {string} outDir
 * @param {{ background?: {r:number,g:number,b:number,alpha:number} }} [opts]
 * @returns {Promise<{ logoFile: string, files: string[] }>}
 */
async function generateBrandingAssets(inputPath, outDir, opts = {}) {
    if (!inputPath || !fs.existsSync(inputPath)) {
        throw new Error('Logo image file not found');
    }

    const sharp = loadSharp();
    const pngToIco = loadPngToIco();
    const bg = opts.background || DEFAULT_BG;

    fs.mkdirSync(outDir, {recursive: true});

    const logoPath = path.join(outDir, 'logo.png');
    await sharp(inputPath).png().toFile(logoPath);

    const sourcePath = path.join(outDir, 'source.png');
    try {
        const ext = path.extname(inputPath).toLowerCase();
        if (ext === '.png') {
            fs.copyFileSync(inputPath, sourcePath);
        } else {
            await sharp(inputPath).png().toFile(sourcePath);
        }
    } catch {
        /* optional archive of original */
    }

    const icoInputs = [];
    const written = [logoPath];

    for (const size of ICON_SIZES) {
        const buf = await sharp(inputPath)
            .resize(size, size, {fit: 'contain', background: bg, position: 'centre'})
            .png()
            .toBuffer();
        const pngPath = path.join(outDir, `icon-${size}.png`);
        fs.writeFileSync(pngPath, buf);
        written.push(pngPath);
        if (size <= 256) {
            icoInputs.push(pngPath);
        }
    }

    const icon256 = path.join(outDir, 'icon-256.png');
    const iconPng = path.join(outDir, 'icon.png');
    fs.copyFileSync(icon256, iconPng);
    written.push(iconPng);

    const icoBuf = await pngToIco(icoInputs);
    const icoPath = path.join(outDir, 'icon.ico');
    fs.writeFileSync(icoPath, icoBuf);
    written.push(icoPath);

    const faviconPath = path.join(outDir, 'favicon.ico');
    fs.copyFileSync(icoPath, faviconPath);
    written.push(faviconPath);

    const apple = path.join(outDir, 'apple-touch-icon.png');
    fs.copyFileSync(icon256, apple);
    written.push(apple);

    const fav32 = path.join(outDir, 'favicon-32.png');
    const fav16 = path.join(outDir, 'favicon-16.png');
    fs.copyFileSync(path.join(outDir, 'icon-32.png'), fav32);
    fs.copyFileSync(path.join(outDir, 'icon-16.png'), fav16);
    written.push(fav32, fav16);

    return {logoFile: 'logo.png', files: [...new Set(written)]};
}

/**
 * Copy generated web icons into go2rtc viewer static folder (dev / IT workflow).
 * @param {string} brandingDir
 * @param {string} viewerIconsDir
 */
function copyViewerWebIcons(brandingDir, viewerIconsDir) {
    fs.mkdirSync(viewerIconsDir, {recursive: true});
    const names = [
        'logo.png',
        'favicon.ico',
        'favicon-32.png',
        'favicon-16.png',
        'apple-touch-icon.png',
        ...ICON_SIZES.map((s) => `icon-${s}.png`),
    ];
    for (const name of names) {
        const src = path.join(brandingDir, name);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(viewerIconsDir, name));
        }
    }
}

const DEPLOY_README = `Тесла / go2rtc branding kit
=============================

1. Desktop app (this PC)
   Copy all files into:
   %APPDATA%\\go2rtc-viewer\\branding\\
   (Settings → Branding → Choose logo does this automatically.)

2. go2rtc server (browser + embedded viewer)
   Copy PNG/ICO files into:
   <go2rtc install>\\www\\viewer\\icons\\
   Then restart go2rtc (or replace go2rtc.exe if viewer is embedded).

3. branding.json
   Deploy next to logo in the branding folder, or merge fields in go2rtc.yaml / viewer config as documented.

Generated files:
  logo.png          — full logo for viewer header
  icon.ico          — Windows app / installer icon (rebuild desktop installer to apply)
  favicon.ico       — browser tab
  icon-16..512.png  — assorted sizes
  apple-touch-icon.png
`;

/**
 * @param {string} destDir
 * @param {object} branding
 * @param {string} brandingSourceDir
 */
function writeBrandingKit(destDir, branding, brandingSourceDir) {
    fs.mkdirSync(destDir, {recursive: true});
    fs.writeFileSync(path.join(destDir, 'branding.json'), JSON.stringify(branding, null, 2), 'utf8');
    fs.writeFileSync(path.join(destDir, 'DEPLOY.txt'), DEPLOY_README, 'utf8');

    if (!fs.existsSync(brandingSourceDir)) {
        return;
    }
    for (const name of fs.readdirSync(brandingSourceDir)) {
        if (!/\.(png|ico|json)$/i.test(name)) {
            continue;
        }
        fs.copyFileSync(path.join(brandingSourceDir, name), path.join(destDir, name));
    }
}

module.exports = {
    ICON_SIZES,
    generateBrandingAssets,
    copyViewerWebIcons,
    writeBrandingKit,
    DEPLOY_README,
};
