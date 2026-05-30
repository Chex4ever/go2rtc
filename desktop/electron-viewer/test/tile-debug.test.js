const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const TILE_DEBUG = path.join(__dirname, '..', '..', '..', 'www', 'viewer', 'viewer-tile-debug.js');
const VIEWER_WALL = path.join(__dirname, '..', '..', '..', 'www', 'viewer', 'viewer-wall.js');

describe('viewer-tile-debug.js', () => {
    it('parses as ES module', () => {
        const code = fs.readFileSync(TILE_DEBUG, 'utf8');
        assert.doesNotThrow(() => {
            acorn.parse(code, {ecmaVersion: 'latest', sourceType: 'module'});
        });
    });

    it('exports openTileDebugModal and buildTileDebugReport', () => {
        const code = fs.readFileSync(TILE_DEBUG, 'utf8');
        assert.match(code, /export async function openTileDebugModal/);
        assert.match(code, /export async function buildTileDebugReport/);
    });
});

describe('viewer-wall debug button', () => {
    it('wires debug action to tile controls', () => {
        const code = fs.readFileSync(VIEWER_WALL, 'utf8');
        assert.match(code, /data-act="debug"/);
        assert.match(code, /openTileDebugModal/);
    });
});
