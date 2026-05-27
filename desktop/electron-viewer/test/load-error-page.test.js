const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {buildLoadErrorPage} = require('../load-error-page');

describe('buildLoadErrorPage', () => {
    it('includes server URL and retry target', () => {
        const html = buildLoadErrorPage({
            serverUrl: 'http://127.0.0.1:1984',
            viewerUrl: 'http://127.0.0.1:1984/viewer/',
            errorCode: -102,
            errorDescription: 'Connection refused',
            validatedURL: 'http://127.0.0.1:1984/viewer/',
            branding: {productName: 'Test Wall', accentColor: '#1565c0'},
        });
        assert.match(html, /Cannot open camera wall/);
        assert.match(html, /Connection refused/);
        assert.match(html, /http:\/\/127\.0\.0\.1:1984\/viewer\//);
        assert.match(html, /Error code: -102/);
        assert.match(html, /id="load-error-retry"/);
        assert.match(html, /id="load-error-open-server"/);
        assert.doesNotMatch(html, /onclick=/i);
        assert.doesNotMatch(html, /<script/i);
    });

    it('escapes HTML in error text', () => {
        const html = buildLoadErrorPage({
            serverUrl: 'http://x',
            viewerUrl: 'http://x/viewer/',
            errorDescription: '<img onerror=alert(1)>',
            branding: {},
        });
        assert.doesNotMatch(html, /<img onerror/);
        assert.match(html, /&lt;img/);
    });
});
