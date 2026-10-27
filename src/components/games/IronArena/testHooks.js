/**
 * Iron Arena — DEV-ONLY automation switches (constant false in production:
 * `import.meta.env.DEV` is false there).
 *
 * `?iatest=1` stops the requestAnimationFrame loop (automation tabs are often
 * hidden, so rAF never fires), fakes pointer lock, keeps the drawing buffer
 * for screenshots and exposes window.__ia plus window.__iaAdvance(frames, dt).
 * `&iatouch=1` forces the touch UI; `&nosave=1` skips localStorage writes.
 */
const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
export const TEST = !!(import.meta.env && import.meta.env.DEV) && !!params && params.get("iatest") === "1";
export const TEST_TOUCH = TEST && params.get("iatouch") === "1";
export const NO_SAVE = TEST && params.get("nosave") === "1";
