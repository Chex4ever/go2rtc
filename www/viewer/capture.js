/** Snapshot and in-browser recording helpers for camera tiles. */

export function captureFilename(streamName, ext) {
    const safe = String(streamName).replace(/[^\w.-]+/g, '_');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `${safe}_${ts}.${ext}`;
}

export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function snapshotFromVideo(video, streamName) {
    if (!video || video.readyState < 2 || !video.videoWidth) {
        throw new Error('Video not ready');
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/jpeg', 0.92);
    });
    downloadBlob(blob, captureFilename(streamName, 'jpg'));
}

export async function snapshotFromServer(apiUrlFn, streamName) {
    const src = encodeURIComponent(streamName);
    const tries = [
        ['frame.jpeg', 'jpg'],
        ['frame.mp4', 'mp4'],
    ];
    for (const [path, ext] of tries) {
        const r = await fetch(apiUrlFn(`/api/${path}?src=${src}`), {credentials: 'include'});
        if (r.ok) {
            downloadBlob(await r.blob(), captureFilename(streamName, ext));
            return;
        }
    }
    throw new Error('Server snapshot failed');
}

/** Prefer live frame from the player; fall back to go2rtc frame API. */
export async function takeSnapshot({video, streamName, apiUrlFn}) {
    try {
        await snapshotFromVideo(video, streamName);
    } catch {
        await snapshotFromServer(apiUrlFn, streamName);
    }
}

export class TileRecorder {
    constructor(video) {
        this.video = video;
        this.recorder = null;
        this.chunks = [];
    }

    get recording() {
        return this.recorder?.state === 'recording';
    }

    start() {
        if (this.recording) {
            return;
        }
        if (!this.video || typeof this.video.captureStream !== 'function') {
            throw new Error('Recording not supported in this browser');
        }
        const stream = this.video.captureStream();
        if (!stream.getVideoTracks().length) {
            throw new Error('No video track available');
        }
        let mime = 'video/webm';
        for (const c of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
            if (MediaRecorder.isTypeSupported(c)) {
                mime = c;
                break;
            }
        }
        this.chunks = [];
        this.recorder = new MediaRecorder(stream, {mimeType: mime});
        this.recorder.ondataavailable = (e) => {
            if (e.data?.size > 0) {
                this.chunks.push(e.data);
            }
        };
        this.recorder.start(1000);
    }

    stop(streamName) {
        return new Promise((resolve, reject) => {
            if (!this.recorder || this.recorder.state === 'inactive') {
                reject(new Error('Not recording'));
                return;
            }
            this.recorder.onstop = () => {
                const blob = new Blob(this.chunks, {type: this.recorder.mimeType || 'video/webm'});
                const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
                downloadBlob(blob, captureFilename(streamName, ext));
                this.recorder = null;
                this.chunks = [];
                resolve();
            };
            this.recorder.onerror = () => reject(new Error('Recording failed'));
            this.recorder.stop();
        });
    }
}
