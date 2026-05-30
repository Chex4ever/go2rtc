const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function loadSessionBoot() {
    const modPath = path.join(__dirname, '..', '..', '..', 'www', 'viewer', 'viewer-session-boot.js');
    return import(pathToFileURL(modPath).href);
}

describe('shouldShowLoginScreen — bootstrap regression', () => {
    it('shows login on 401 when no fatal error text', async () => {
        const {shouldShowLoginScreen} = await loadSessionBoot();
        assert.equal(shouldShowLoginScreen(false, ''), true);
        assert.equal(shouldShowLoginScreen(false, '   '), true);
    });

    it('does not show login when session restored', async () => {
        const {shouldShowLoginScreen} = await loadSessionBoot();
        assert.equal(shouldShowLoginScreen(true, ''), false);
    });

    it('does not show login when fatal error already shown', async () => {
        const {shouldShowLoginScreen} = await loadSessionBoot();
        assert.equal(shouldShowLoginScreen(false, 'Request timed out'), false);
    });
});

describe('isSessionProbeFatalError', () => {
    it('treats network and timeout as fatal', async () => {
        const {isSessionProbeFatalError} = await loadSessionBoot();
        assert.equal(isSessionProbeFatalError(new TypeError('Failed to fetch')), true);
        assert.equal(isSessionProbeFatalError(new Error('Request timed out — is go2rtc running?')), true);
    });

    it('does not treat 401 Unauthorized as fatal', async () => {
        const {isSessionProbeFatalError} = await loadSessionBoot();
        assert.equal(isSessionProbeFatalError(new Error('Unauthorized')), false);
    });
});
