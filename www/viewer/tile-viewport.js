/** Pan/zoom wrapper around a stream element inside a tile. */
export class TileViewport {
    constructor(container) {
        this.container = container;
        this.inner = document.createElement('div');
        this.inner.className = 'viewport-inner';
        this.scale = 1;
        this.tx = 0;
        this.ty = 0;
        this.fitModes = ['contain', 'cover', 'fill'];
        this.fitIndex = 0;
        this._panning = false;
        this._panStart = null;
        this._onWheel = this._onWheel.bind(this);
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
    }

    mount(streamEl) {
        this.streamEl = streamEl;
        this.container.innerHTML = '';
        this.inner.innerHTML = '';
        this.inner.appendChild(streamEl);
        this.container.appendChild(this.inner);
        this.applyFit();
        this.applyTransform();
        this.container.addEventListener('wheel', this._onWheel, {passive: false});
        this.inner.addEventListener('pointerdown', this._onPointerDown);
    }

    destroy() {
        this.container.removeEventListener('wheel', this._onWheel);
        this.inner.removeEventListener('pointerdown', this._onPointerDown);
        window.removeEventListener('pointermove', this._onPointerMove);
        window.removeEventListener('pointerup', this._onPointerUp);
    }

    get video() {
        return this.streamEl?.querySelector('video') || null;
    }

    applyFit() {
        const fit = this.fitModes[this.fitIndex];
        const video = this.video;
        if (video) {
            video.style.objectFit = fit;
        }
    }

    cycleFit() {
        this.fitIndex = (this.fitIndex + 1) % this.fitModes.length;
        this.applyFit();
        return this.fitModes[this.fitIndex];
    }

    setFit(mode) {
        const i = this.fitModes.indexOf(mode);
        if (i >= 0) {
            this.fitIndex = i;
            this.applyFit();
        }
    }

    applyTransform() {
        this.inner.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
    }

    zoom(delta) {
        const next = Math.min(4, Math.max(1, this.scale + delta));
        this.scale = next;
        if (this.scale === 1) {
            this.tx = 0;
            this.ty = 0;
        }
        this.applyTransform();
    }

    reset() {
        this.scale = 1;
        this.tx = 0;
        this.ty = 0;
        this.fitIndex = 0;
        this.applyFit();
        this.applyTransform();
    }

    _onWheel(e) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.zoom(e.deltaY < 0 ? 0.15 : -0.15);
        }
    }

    _onPointerDown(e) {
        if (e.button !== 0 || this.scale <= 1) {
            return;
        }
        if (e.target.closest('.tile-controls, .tile-bar')) {
            return;
        }
        e.preventDefault();
        this._panning = true;
        this._panStart = {x: e.clientX - this.tx, y: e.clientY - this.ty};
        this.inner.setPointerCapture(e.pointerId);
        window.addEventListener('pointermove', this._onPointerMove);
        window.addEventListener('pointerup', this._onPointerUp);
    }

    _onPointerMove(e) {
        if (!this._panning || !this._panStart) {
            return;
        }
        this.tx = e.clientX - this._panStart.x;
        this.ty = e.clientY - this._panStart.y;
        this.applyTransform();
    }

    _onPointerUp() {
        this._panning = false;
        this._panStart = null;
        window.removeEventListener('pointermove', this._onPointerMove);
        window.removeEventListener('pointerup', this._onPointerUp);
    }

    toJSON() {
        return {
            fit: this.fitModes[this.fitIndex],
            scale: this.scale,
            tx: this.tx,
            ty: this.ty,
        };
    }

    fromJSON(data) {
        if (!data) {
            return;
        }
        if (data.fit) {
            this.setFit(data.fit);
        }
        this.scale = data.scale || 1;
        this.tx = data.tx || 0;
        this.ty = data.ty || 0;
        this.applyTransform();
    }
}

/** Reconnect stream with or without audio; stays muted until user unmutes. */
export function setStreamAudio(viewerStream, src, enable) {
    const video = viewerStream.querySelector('video');
    viewerStream.media = enable ? 'video,audio' : 'video';
    if (video) {
        video.muted = !enable;
    }
    const ws = viewerStream.wsURL || src;
    viewerStream.disconnectedCallback();
    viewerStream.src = ws || src;
}

export function toggleStreamAudio(viewerStream, src) {
    const video = viewerStream.querySelector('video');
    const on = video && !video.muted && viewerStream.media.includes('audio');
    setStreamAudio(viewerStream, src, !on);
    if (!on && video) {
        video.muted = false;
    }
    return !on;
}

export function refreshStream(viewerStream, src) {
    viewerStream.disconnectedCallback();
    viewerStream.src = src;
}
