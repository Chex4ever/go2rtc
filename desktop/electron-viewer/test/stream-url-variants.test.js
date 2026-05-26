const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const lib = require(path.join(__dirname, '..', '..', '..', 'www', 'stream-url-variants-lib.js'));

describe('hikvisionDvrSubUrlVariants', () => {
    it('maps Channels/101 to 102', () => {
        const main = 'rtsp://admin:pass@192.168.1.50:554/Streaming/Channels/101';
        const subs = lib.hikvisionDvrSubUrlVariants(main);
        assert.ok(subs.some((u) => u.endsWith('/Channels/102')));
    });

    it('maps Channels/201 to 202', () => {
        const main = 'rtsp://admin:pass@192.168.1.50:554/Streaming/Channels/201';
        const subs = lib.hikvisionDvrSubUrlVariants(main);
        assert.ok(subs.some((u) => u.endsWith('/Channels/202')));
    });
});

describe('rtspQuerySubUrlVariants', () => {
    it('flips subtype query', () => {
        const main = 'rtsp://cam/stream?subtype=0';
        const subs = lib.rtspQuerySubUrlVariants(main);
        assert.ok(subs.some((u) => u.includes('subtype=1')));
    });
});

describe('subStreamUrlVariants', () => {
    it('deduplicates and excludes main url', () => {
        const main = 'rtsp://x/Streaming/Channels/101';
        const all = lib.subStreamUrlVariants(main);
        assert.ok(all.length >= 1);
        assert.ok(!all.includes(main));
        assert.equal(new Set(all).size, all.length);
    });
});
