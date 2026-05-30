const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const ABOUT = path.join(__dirname, '..', '..', '..', 'www', 'viewer', 'viewer-about.js');
const APP = path.join(__dirname, '..', '..', '..', 'www', 'viewer', 'viewer-app.js');
const MAIN = path.join(__dirname, '..', 'main.js');

describe('viewer-about.js', () => {
    it('parses as ES module', () => {
        const code = fs.readFileSync(ABOUT, 'utf8');
        assert.doesNotThrow(() => {
            acorn.parse(code, {ecmaVersion: 'latest', sourceType: 'module'});
        });
    });

    it('exports openAboutModal', () => {
        const code = fs.readFileSync(ABOUT, 'utf8');
        assert.match(code, /export async function openAboutModal/);
        assert.match(code, /\/api\/viewer\/about/);
    });
});

describe('viewer-app about wiring', () => {
    it('binds About buttons', () => {
        const src = fs.readFileSync(APP, 'utf8');
        assert.match(src, /import \{openAboutModal\}/);
        assert.match(src, /btn-about-wall/);
    });
});

describe('electron About menu', () => {
    it('registers About menu and client-info IPC', () => {
        const src = fs.readFileSync(MAIN, 'utf8');
        assert.match(src, /About Camera Wall/);
        assert.match(src, /viewer:client-info/);
        assert.match(src, /\/api\/viewer\/about/);
    });
});
