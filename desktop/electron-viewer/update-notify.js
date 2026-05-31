const {compareSemver} = require('./updater-core');

/** @type {(event: object) => void} */
let sendToRenderer = () => {};

/** @type {object} */
let state = {
    status: 'idle',
    version: '',
    progress: 0,
    message: '',
    error: '',
};

function setUpdateEventSender(fn) {
    sendToRenderer = typeof fn === 'function' ? fn : sendToRenderer;
}

function getUpdateState() {
    return {...state};
}

function patchUpdateState(patch) {
    state = {...state, ...patch};
    sendToRenderer({kind: 'state', ...state});
}

function emitUpdateEvent(event) {
    if (event?.kind && event.kind !== 'state') {
        if (event.kind === 'downloading') {
            patchUpdateState({
                status: 'downloading',
                version: event.version || state.version,
                progress: event.progress ?? state.progress,
                message: event.message || state.message,
                error: '',
            });
        } else if (event.kind === 'ready') {
            patchUpdateState({
                status: 'ready',
                version: event.version || state.version,
                progress: 100,
                message: event.message || '',
                error: '',
            });
        } else if (event.kind === 'available') {
            patchUpdateState({
                status: 'available',
                version: event.version || '',
                progress: 0,
                message: event.message || '',
                error: '',
            });
        } else if (event.kind === 'installing') {
            patchUpdateState({
                status: 'installing',
                version: event.version || state.version,
                message: event.message || 'Installing update…',
                error: '',
            });
        } else if (event.kind === 'installed') {
            patchUpdateState({
                status: 'installed',
                version: event.version || '',
                progress: 100,
                message: event.message || '',
                error: '',
            });
        } else if (event.kind === 'error') {
            patchUpdateState({
                status: 'error',
                error: event.message || 'Update failed',
            });
        }
    }
    sendToRenderer(event);
}

function shouldNotifyVersionUpgrade(lastSeen, current) {
    if (!lastSeen || !current) {
        return false;
    }
    return compareSemver(current, lastSeen) > 0;
}

module.exports = {
    setUpdateEventSender,
    getUpdateState,
    patchUpdateState,
    emitUpdateEvent,
    shouldNotifyVersionUpgrade,
};
