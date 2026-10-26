/**
 * Strike Force — DEV-ONLY automation switches (constant false in production:
 * `import.meta.env.DEV` is false there).
 *
 * `?sftest=1` stops the requestAnimationFrame loop (automation tabs are often
 * hidden, so rAF never fires), fakes pointer lock, keeps the drawing buffer
 * for screenshots and exposes window.__sf plus window.__sfAdvance(frames, dt).
 * `&sftouch=1` forces the touch UI.
 */
const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
export const TEST = !!(import.meta.env && import.meta.env.DEV) && !!params && params.get("sftest") === "1";
export const TEST_TOUCH = TEST && params.get("sftouch") === "1";
