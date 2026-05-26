import {VideoRTC} from '../video-rtc.js';

/**
 * Camera tile player: video only, muted by default.
 * visibilityThreshold=0 — wall shows many tiles at once; lazy IO disconnect breaks Electron grids.
 */
class ViewerStream extends VideoRTC {
    constructor() {
        super();
        this.media = 'video';
        this.mode = 'webrtc,mse,hls,mjpeg';
        this.background = false;
        this.visibilityThreshold = 0;
        this.visibilityCheck = true;
        this._suppressVideoError = false;
    }

    oninit() {
        super.oninit();
        this.video.muted = true;
        this.video.controls = false;
        this.video.autoplay = true;
        this.video.style.objectFit = 'contain';
        this.video.style.background = '#000';
        this.video.addEventListener(
            'error',
            (ev) => {
                if (this._suppressVideoError) {
                    ev.stopImmediatePropagation();
                }
            },
            true,
        );
    }

    /** Close WebSocket/WebRTC immediately (renderWall must not leave 5s delayed teardown). */
    forceDisconnect() {
        if (this.disconnectTID) {
            clearTimeout(this.disconnectTID);
            this.disconnectTID = 0;
        }
        if (this.reconnectTID) {
            clearTimeout(this.reconnectTID);
            this.reconnectTID = 0;
        }
        this._suppressVideoError = true;
        try {
            this.ondisconnect();
        } finally {
            this._suppressVideoError = false;
        }
    }
}

customElements.define('viewer-stream', ViewerStream);
