import {VideoRTC} from '../video-rtc.js';

/**
 * Camera tile player: video only, muted by default, lazy connect when visible.
 */
class ViewerStream extends VideoRTC {
    constructor() {
        super();
        this.media = 'video';
        this.mode = 'webrtc,mse,hls,mjpeg';
        this.background = false;
        this.visibilityThreshold = 0.05;
        this.visibilityCheck = true;
    }

    oninit() {
        super.oninit();
        this.video.muted = true;
        this.video.controls = false;
        this.video.autoplay = true;
        this.video.style.objectFit = 'contain';
        this.video.style.background = '#000';
    }
}

customElements.define('viewer-stream', ViewerStream);
