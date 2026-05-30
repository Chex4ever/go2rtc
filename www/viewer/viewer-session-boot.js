import {isFetchFailure} from './viewer-api.js';

/**
 * After GET /api/viewer/me: show login unless a fatal bootstrap error is already visible.
 * @param {boolean} sessionOk
 * @param {string} bootstrapErrorText
 */
export function shouldShowLoginScreen(sessionOk, bootstrapErrorText) {
    if (sessionOk) {
        return false;
    }
    return !String(bootstrapErrorText || '').trim();
}

/** True when session probe failed because go2rtc is unreachable (not a normal 401). */
export function isSessionProbeFatalError(err) {
    if (isFetchFailure(err)) {
        return true;
    }
    return /timed out|is go2rtc running/i.test(String(err?.message || err || ''));
}
