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
        assert.match(wallJs, /connectStreamSrc/);
        assert.match(wallJs, /FOCUS_ANIM_MS = 500/);
        assert.match(wallJs, /flipFocusCell/);
        assert.match(wallJs, /streamWsKey/);
        assert.match(wallCss, /viewer-stream\.stream-main/);
        assert.match(wallCss, /stream-preview/);
        assert.match(wallCss, /stream-main\.is-playing\)[\s\S]*stream-preview/);
        assert.match(wallCss, /focus-animating/);
    });

    it('does not reconnect when main and preview are the same stream', () => {
        const attachBody = wallJs.match(/function attachFocusMainStream\([\s\S]*?\n\}/)?.[0] || '';
        const sameStreamBranch =
            attachBody.match(/if \(!previewName \|\| previewName === logicalName\) \{[\s\S]*?\n    \}/)?.[0] ||
            '';
        assert.match(sameStreamBranch, /detachFocusMainStream\(slotIndex\)/);
        assert.doesNotMatch(sameStreamBranch, /forceDisconnect/);
        assert.doesNotMatch(sameStreamBranch, /connectStreamSrc/);
    });

    it('double-click exits focus on main channel', () => {
        assert.match(wallJs, /state\.focusSlot === si[\s\S]*exitFocus\(\)/);
    });

    it('swaps tiles in place without renderWall reconnect', () => {
        const body = wallJs.match(/function swapSlots\(a, b\) \{([\s\S]*?)\n\}/)?.[1] || '';
        assert.doesNotMatch(body, /renderWall\(\)/);
        assert.match(body, /swapMapEntry/);
        assert.match(wallJs, /slotIndexOfTile/);
    });
});
