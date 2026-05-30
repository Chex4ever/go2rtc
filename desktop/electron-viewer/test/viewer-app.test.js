const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const VIEWER_DIR = path.join(__dirname, '..', '..', '..', 'www', 'viewer');
const VIEWER_APP = path.join(VIEWER_DIR, 'viewer-app.js');
const VIEWER_WALL = path.join(VIEWER_DIR, 'viewer-wall.js');

function readViewerApp() {
    return fs.readFileSync(VIEWER_APP, 'utf8');
}

function readViewerWall() {
    return fs.readFileSync(VIEWER_WALL, 'utf8');
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

    it('imports isFetchFailure for login network errors', () => {
        const code = readViewerApp();
        assert.match(code, /import \{[^}]*isFetchFailure[^}]*\} from '\.\/viewer-api\.js'/);
        assert.match(code, /isFetchFailure\(e\)/);
    });
});

describe('renderWall() regression', () => {
    it('does not declare const grid twice in the same function', () => {
        const body = extractFunctionBody(readViewerWall(), 'renderWall');
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

    it('viewer modules expose error and morning-start handling', () => {
        const app = readViewerApp();
        const ui = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'www', 'viewer', 'viewer-ui.js'), 'utf8');
        const api = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'www', 'viewer', 'viewer-api.js'), 'utf8');
        assert.match(ui, /function showFatalError/);
        assert.match(api, /function isFetchFailure/);
        assert.match(app, /init\(\)\.catch/);
        assert.match(app, /enterAfterAuth/);
        assert.match(app, /morning-start\.js/);
        assert.match(app, /planMorningStart/);
    });
});

describe('openLayout() grid preset check', () => {
    it('uses a separate grid variable name from renderWall DOM element', () => {
        const openBody = extractFunctionBody(readViewerApp(), 'openLayout');
        assert.match(openBody, /\bconst grid\b/);
        const renderBody = extractFunctionBody(readViewerWall(), 'renderWall');
        assert.doesNotMatch(renderBody, /\bconst grid\b/);
    });
});
