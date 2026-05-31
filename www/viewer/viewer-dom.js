export const $ = (sel) => document.querySelector(sel);
/** How long top chrome stays visible after the pointer leaves the reveal zone. */
/** Delay before hiding wall chrome after showing it (grid mode). */
export const CHROME_HIDE_MS = 4000;
/** Top header / brand bar auto-hide after pointer leaves the reveal strip. */
export const TOP_CHROME_AUTO_HIDE_MS = 2000;
/** Tile bar / controls fade duration (pointer-events disabled while animating). */
export const TILE_CHROME_FADE_MS = 250;
/** Hide tile chrome this long after pointer leaves the tile or tile chrome. */
export const TILE_CHROME_HIDE_DELAY_MS = 2000;
