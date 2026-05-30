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
        this._debugEvents = [];
    }

    _logDebug(type, detail = '') {
        this._debugEvents.push({t: Date.now(), type, detail: String(detail || '')});
        if (this._debugEvents.length > 40) {
            this._debugEvents.shift();
        }
    }

    getDebugSnapshot() {
        return {
            connectAgeMs: this.connectTS ? Date.now() - this.connectTS : 0,
            events: [...this._debugEvents],
        };
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
                const err = this.video.error;
                this._logDebug('video-error', err?.message || err?.code || 'unknown');
                if (this._suppressVideoError) {
                    ev.stopImmediatePropagation();
                }
            },
            true,
        );
    }

    onconnect() {
        this._logDebug('connect', this.wsURL || this.src || '');
        return super.onconnect();
    }

    onopen() {
        this._logDebug('ws-open');
        super.onopen();
    }

    onclose() {
        this._logDebug('ws-close');
        super.onclose();
    }

    ondisconnect() {
        this._logDebug('disconnect');
        super.ondisconnect();
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
