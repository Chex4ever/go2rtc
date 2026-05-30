const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const VIEWER_DIR = path.join(__dirname, '..', '..', '..', 'www', 'viewer');

const MODULES = [
    'viewer-app.js',
    'viewer-api.js',
    'viewer-ui.js',
    'viewer-state.js',
    'viewer-dom.js',
    'viewer-wall.js',
    'viewer-tile-debug.js',
    'layout-auto.js',
    'morning-start.js',
    'admin.js',
    'admin-api.js',
    'admin-ui.js',
    'admin-state.js',
    'admin-layout-editor.js',
];

describe('viewer ES modules parse', () => {
    for (const file of MODULES) {
        it(file, () => {
            const code = fs.readFileSync(path.join(VIEWER_DIR, file), 'utf8');
            assert.doesNotThrow(() => {
                acorn.parse(code, {ecmaVersion: 'latest', sourceType: 'module'});
            });
        });
    }
});

describe('viewer-app morning-start wiring', () => {
    it('uses planMorningStart in enterAfterAuth', () => {
        const src = fs.readFileSync(path.join(VIEWER_DIR, 'viewer-app.js'), 'utf8');
        assert.match(src, /import \{planMorningStart\}/);
        assert.match(src, /async function enterAfterAuth[\s\S]*planMorningStart/);
        assert.match(src, /await openLayout\(plan\.layoutId\)/);
    });
});
