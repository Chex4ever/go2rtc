const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const VIEWER_APP = path.join(__dirname, '..', '..', '..', 'www', 'viewer', 'viewer-app.js');

function readViewerApp() {
    return fs.readFileSync(VIEWER_APP, 'utf8');
}

/** Extract a top-level function body from viewer-app.js (brace-balanced). */
function extractFunctionBody(source, name) {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `function ${name} not found`);
    const braceStart = source.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < source.length; i++) {
        if (source[i] === '{') {
            depth++;
        } else if (source[i] === '}') {
            depth--;
            if (depth === 0) {
                return source.slice(braceStart, i + 1);
            }
        }
    }
    throw new Error(`unbalanced braces in ${name}`);
}

describe('viewer-app.js syntax', () => {
    it('parses as an ES module (catches duplicate const in same scope)', () => {
        // Regression: duplicate `const grid` in renderWall() → SyntaxError → black screen.
        const code = readViewerApp();
        assert.doesNotThrow(() => {
            acorn.parse(code, {ecmaVersion: 'latest', sourceType: 'module'});
        });
    });
});

describe('renderWall() regression', () => {
    it('does not declare const grid twice in the same function', () => {
        const body = extractFunctionBody(readViewerApp(), 'renderWall');
        const constGrid = body.match(/\bconst grid\b/g) || [];
        assert.equal(
            constGrid.length,
            0,
            'renderWall must use gridSize and wallGrid, not const grid (duplicate breaks module load)',
        );
        assert.match(body, /\bconst gridSize\b/);
        assert.match(body, /\bconst wallGrid\b/);
        assert.match(body, /wallGrid\.appendChild/);
    });
});

describe('viewer error UI', () => {
    it('index.html has bootstrap error screen', () => {
        const index = fs.readFileSync(
            path.join(__dirname, '..', '..', '..', 'www', 'viewer', 'index.html'),
            'utf8',
        );
        assert.match(index, /id="screen-bootstrap"/);
        assert.match(index, /__viewerShowError/);
    });

    it('viewer-app.js exposes fatal error handling', () => {
        const src = readViewerApp();
        assert.match(src, /function showFatalError/);
        assert.match(src, /function isFetchFailure/);
        assert.match(src, /init\(\)\.catch/);
    });
});

describe('openLayout() grid preset check', () => {
    it('uses a separate grid variable name from renderWall DOM element', () => {
        const openBody = extractFunctionBody(readViewerApp(), 'openLayout');
        assert.match(openBody, /\bconst grid\b/);
        const renderBody = extractFunctionBody(readViewerApp(), 'renderWall');
        assert.doesNotMatch(renderBody, /\bconst grid\b/);
    });
});
