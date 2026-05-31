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

    it('buildPipeline marks 0-byte snapshot as failed when video is not playing', () => {
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
        assert.match(step5.detail, /HTTP 200/);
    });

    it('buildPipeline accepts onvif yaml sources', () => {
        const pipeline = mod.buildPipeline({
            streams: {
                playback: {
                    name: 'ipc55_sub',
                    yamlUrls: ['onvif://admin:pass@192.168.1.55:80?subtype=media_profile2'],
                    producerDetails: [],
                },
            },
            connectTest: {ok: true},
            probe: {ok: false, status: 500},
            player: {
                wsState: 'CLOSED',
                pcConnected: true,
                videoSrcObject: true,
                video: {width: 352, height: 288},
            },
            urls: {wsDecoded: 'ipc55_sub'},
        });
        assert.equal(pipeline.find((s) => s.step.startsWith('2.')).ok, true);
        assert.equal(pipeline.find((s) => s.step.startsWith('5.')).ok, true);
        assert.equal(pipeline.find((s) => s.step.startsWith('6.')).ok, true);
        assert.equal(pipeline.every((s) => s.ok), true);
    });

    it('cameraWebInterfaceUrl extracts http link from rtsp and onvif', () => {
        assert.equal(
            mod.cameraWebInterfaceUrl('rtsp://admin:pass@192.168.1.51:554/ISAPI/Streaming/Channels/102'),
            'http://192.168.1.51',
        );
        assert.equal(
            mod.cameraWebInterfaceUrl('onvif://admin:pass@192.168.1.55:80?subtype=media_profile2'),
            'http://192.168.1.55',
        );
    });
});
