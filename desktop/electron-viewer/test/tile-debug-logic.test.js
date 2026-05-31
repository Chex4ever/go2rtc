const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const TILE_DEBUG = path.join(__dirname, '..', '..', '..', 'www', 'viewer', 'viewer-tile-debug.js');

describe('tile-debug logic', async () => {
    const mod = await import(pathToFileURL(TILE_DEBUG).href);

    it('uses let for previewSummary so yaml merge does not throw', () => {
        const src = fs.readFileSync(TILE_DEBUG, 'utf8');
        assert.match(src, /let previewSummary = preview/);
    });

    it('parseYamlStreamSources reads RTSP credentials from yaml', () => {
        const yaml = `
streams:
  kitchen:
    - rtsp://admin:secret@192.168.1.16:554/Channels/101
    - mode:webrtc
  kitchen_sub:
    - rtsp://admin:secret@192.168.1.16:554/Channels/102
`;
        const sources = mod.parseYamlStreamSources(yaml);
        assert.equal(sources.kitchen[0], 'rtsp://admin:secret@192.168.1.16:554/Channels/101');
        assert.equal(sources.kitchen[1], 'mode:webrtc');
        assert.match(sources.kitchen_sub[0], /admin:secret@/);
    });

    it('buildPipeline marks 0-byte snapshot as failed', () => {
        const pipeline = mod.buildPipeline({
            streams: {
                playback: {
                    name: 'cam_sub',
                    yamlUrls: ['rtsp://admin:pass@10.0.0.1/sub'],
                    producerDetails: [
                        {
                            url: 'rtsp://admin:pass@10.0.0.1/sub',
                            bytes_recv: 0,
                            isOption: false,
                        },
                    ],
                },
            },
            connectTest: {ok: true},
            probe: {ok: true, status: 200, bytes: 0},
            player: {wsState: 'OPEN', videoSrcObject: false, video: {width: 0}},
        });
        const step5 = pipeline.find((s) => s.step.startsWith('5.'));
        assert.equal(step5.ok, false);
        assert.match(step5.detail, /0 bytes/);
    });
});
