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

    it('flips Dahua subtype=0 to subtype=1', () => {
        const main =
            'rtsp://admin:pass@192.168.1.48:554/cam/realmonitor?channel=1&subtype=0&unicast=true&proto=Onvif';
        const subs = lib.subStreamUrlVariants(main);
        assert.ok(subs.some((u) => u.includes('subtype=1') && !u.includes('subtype=0')));
    });
});

describe('preferPreviewUrl', () => {
    const main =
        'rtsp://admin:pass@192.168.1.48:554/cam/realmonitor?channel=1&subtype=0&unicast=true&proto=Onvif';

    it('falls back when ONVIF returns the same stream as main', () => {
        const preview = lib.preferPreviewUrl(main, main);
        assert.ok(preview.includes('subtype=1'));
        assert.ok(!lib.rtspStreamsEquivalent(main, preview));
    });

    it('falls back when candidate repeats main stream key', () => {
        const onvifMain =
            'rtsp://192.168.1.48:554/cam/realmonitor?channel=1&subtype=0&unicast=true&proto=Onvif';
        const preview = lib.preferPreviewUrl(main, onvifMain);
        assert.ok(preview.includes('subtype=1'));
    });

    it('keeps a distinct resolved profile URL from ONVIF', () => {
        const onvifSub =
            'rtsp://192.168.1.48:554/cam/realmonitor?channel=1&subtype=2&unicast=true&proto=Onvif';
        const preview = lib.preferPreviewUrl(main, onvifSub);
        assert.equal(preview, onvifSub);
    });
});

describe('isDahuaRealmonitorUrl', () => {
    it('detects Dahua realmonitor paths', () => {
        assert.ok(
            lib.isDahuaRealmonitorUrl(
                'rtsp://x/cam/realmonitor?channel=1&subtype=0',
            ),
        );
        assert.ok(!lib.isDahuaRealmonitorUrl('rtsp://x/Streaming/Channels/101'));
    });
});

describe('mergeRtspCredentials', () => {
    it('copies auth from main stream onto ONVIF profile url', () => {
        const main =
            'rtsp://admin:!Q2w3e4r5t@192.168.1.48:554/cam/realmonitor?channel=1&subtype=0';
        const profile = 'rtsp://192.168.1.48:554/cam/realmonitor?channel=1&subtype=1';
        const merged = lib.mergeRtspCredentials(main, profile);
        assert.ok(merged.includes('admin:!Q2w3e4r5t@'));
        assert.ok(merged.includes('subtype=1'));
    });
});
