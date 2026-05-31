const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const wallJs = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'www', 'viewer', 'viewer-wall.js'),
    'utf8',
);
const wallCss = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'www', 'viewer', 'viewer.css'),
    'utf8',
);

function fnBody(name, args = '') {
    const re = new RegExp(`export function ${name}\\(${args}\\) \\{([\\s\\S]*?)\\n\\}`, 'm');
    return wallJs.match(re)?.[1] || '';
}

describe('viewer-wall focus streams', () => {
    it('keeps grid cells in DOM during focus (preview stays connected)', () => {
        assert.doesNotMatch(wallJs, /focusSlot !== null && focusSlot !== i/);
        assert.match(fnBody('enterFocus', 'slotIndex'), /applyFocusLayout\(\)/);
        assert.doesNotMatch(fnBody('enterFocus', 'slotIndex'), /renderWall\(\)/);
        assert.match(fnBody('exitFocus'), /applyFocusLayout\(\)/);
        assert.doesNotMatch(fnBody('exitFocus'), /renderWall\(\)/);
    });

    it('layers main over preview until main is playing', () => {
        assert.match(wallJs, /attachFocusMainStream/);
        assert.match(wallJs, /stream-main/);
        assert.match(wallJs, /is-playing/);
        assert.match(wallJs, /FOCUS_ANIM_MS = 500/);
        assert.match(wallJs, /flipFocusCell/);
        assert.match(wallCss, /viewer-stream\.stream-main/);
        assert.match(wallCss, /focus-animating/);
    });

    it('double-click exits focus on main channel', () => {
        assert.match(wallJs, /state\.focusSlot === slotIndex[\s\S]*exitFocus\(\)/);
    });
});
