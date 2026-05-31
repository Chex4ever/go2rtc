const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/** Runtime modules reachable from main.js via require('./…'). */
const RUNTIME_MODULES = [
    'main.js',
    'config.js',
    'config-core.js',
    'branding-assets.js',
    'preload.js',
    'settings-preload.js',
    'load-error-page.js',
    'updater.js',
    'updater-core.js',
    'updater-cache.js',
    'installer-launch.js',
    'patch-apply.js',
    'shell-patch-lib.js',
];

describe('electron-builder packaging', () => {
    it('includes all main-process runtime modules in build.files', () => {
        const pkg = JSON.parse(
            fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
        );
        const packed = new Set(pkg.build.files);
        for (const mod of RUNTIME_MODULES) {
            assert.ok(packed.has(mod), `build.files must include ${mod}`);
            assert.ok(
                fs.existsSync(path.join(__dirname, '..', mod)),
                `${mod} must exist on disk`,
            );
        }
    });
});
