/** Guess a preview/sub stream name for a main camera stream. */
export function suggestPreviewStream(main, streams) {
    if (!main || !streams?.length) {
        return null;
    }
    const names = new Set(streams);
    const exact = [
        `${main}_sub`,
        `${main}_substream`,
        `${main}_preview`,
        `${main}_low`,
        `${main}_substream1`,
        `${main}2`,
        `${main}_2`,
        `${main}-sub`,
        `${main}_chn2`,
        `${main}_channel2`,
        `${main}02`,
        `${main}_102`,
    ];
    for (const c of exact) {
        if (names.has(c)) {
            return c;
        }
    }
    const mainLower = main.toLowerCase();
    for (const s of streams) {
        if (s === main) {
            continue;
        }
        const lower = s.toLowerCase();
        if (!lower.startsWith(mainLower)) {
            continue;
        }
        const tail = lower.slice(mainLower.length);
        if (/^[_-]?(sub|preview|low|minor|chn2|channel2|stream2|102|02|2)/.test(tail)) {
            return s;
        }
    }
    return null;
}

export function buildPreviewMap(cameras, streams, existing = {}) {
    const preview = {...existing};
    for (const cam of cameras) {
        if (preview[cam] && preview[cam] !== cam) {
            continue;
        }
        const guess = suggestPreviewStream(cam, streams);
        if (guess) {
            preview[cam] = guess;
        } else {
            delete preview[cam];
        }
    }
    for (const key of Object.keys(preview)) {
        if (!cameras.includes(key)) {
            delete preview[key];
        }
    }
    return preview;
}
