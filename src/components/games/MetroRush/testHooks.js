/**
 * Metro Rush — DEV-ONLY automation switches (constant false in production:
 * `import.meta.env.DEV` is false there).
 *
 * `?mrtest=1` stops the requestAnimationFrame loop (automation tabs are
 * often hidden, so rAF never fires) and exposes window.__mr plus
 * window.__mrAdvance(frames, dt) to step the game explicitly; the canvas
 * keeps its drawing buffer for screenshots. `&mrtouch=1` forces the touch UI.
 */
const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
export const TEST = !!(import.meta.env && import.meta.env.DEV) && !!params && params.get("mrtest") === "1";
export const TEST_TOUCH = TEST && params.get("mrtouch") === "1";
