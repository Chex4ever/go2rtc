const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {buildLoadErrorPage, connectionErrorHints, isLocalhostServer} = require('../load-error-page');

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
        assert.match(html, /id="load-error-open-settings"/);
        assert.match(html, /Sign in \(login and password\)/);
        assert.match(html, /Start go2rtc here/);
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

describe('connectionErrorHints', () => {
    it('explains localhost connection refused vs login', () => {
        const hints = connectionErrorHints(-102, 'http://127.0.0.1:1984');
        assert.equal(hints.length, 2);
        assert.match(hints[0], /Nothing is answering on this PC/);
        assert.match(hints[1], /Sign in/);
    });

    it('detects localhost server URLs', () => {
        assert.equal(isLocalhostServer('http://127.0.0.1:1984'), true);
        assert.equal(isLocalhostServer('http://192.168.1.5:1984'), false);
    });
});
