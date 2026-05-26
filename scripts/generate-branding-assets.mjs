/**
 * Dev/CI: regenerate shipped defaults from repo-root tesla.png.
 * Same pipeline as Settings → Choose logo (see branding-assets.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ELECTRON_DIR = path.join(ROOT, 'desktop/electron-viewer');
const req = createRequire(path.join(ELECTRON_DIR, 'package.json'));
const {generateBrandingAssets, copyViewerWebIcons} = req('./branding-assets.js');

const SRC = path.join(ROOT, 'tesla.png');

async function main() {
    if (!fs.existsSync(SRC)) {
        console.error('Missing', SRC);
        process.exit(1);
    }

    const brandingDir = path.join(ELECTRON_DIR, 'branding');
    const buildDir = path.join(ELECTRON_DIR, 'build');
    const viewerIcons = path.join(ROOT, 'www/viewer/icons');

    fs.mkdirSync(buildDir, {recursive: true});

    const result = await generateBrandingAssets(SRC, brandingDir);
    for (const file of result.files) {
        const base = path.basename(file);
        if (base.startsWith('icon-') || base === 'icon.png' || base === 'icon.ico' || base === 'favicon.ico') {
            fs.copyFileSync(file, path.join(buildDir, base));
        }
    }
    fs.copyFileSync(path.join(brandingDir, 'icon.ico'), path.join(buildDir, 'icon.ico'));
    fs.copyFileSync(path.join(brandingDir, 'icon.png'), path.join(buildDir, 'icon.png'));

    copyViewerWebIcons(brandingDir, viewerIcons);
    fs.copyFileSync(SRC, path.join(brandingDir, 'tesla.png'));

    console.log('Generated branding from', SRC);
    console.log('  branding/', brandingDir);
    console.log('  build/icons', buildDir);
    console.log('  www/viewer/icons/', viewerIcons);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
