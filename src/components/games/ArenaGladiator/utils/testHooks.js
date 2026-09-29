/**
 * Arena Gladiator — DEV-ONLY automation hooks (compiled out of production:
 * `import.meta.env.DEV` is false there, so TEST is a constant false).
 *
 * Automated browser tabs are often "hidden": requestAnimationFrame never
 * fires and the game would pause itself. With `?agtest=1` in the URL the
 * canvases run with frameloop="never" and frames are stepped explicitly via
 * window.__agAdvance(frames, ms), and the hidden-tab pause is bypassed.
 */
import { advance, useFrame, useThree } from "@react-three/fiber";

export const TEST =
  import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("agtest") === "1";

if (TEST) {
  let t = 0; // seconds — frameloop="never" takes the clock from advance()
  window.__agAdvance = (frames = 1, ms = 1000 / 60) => {
    // R3F measures its container with ResizeObserver/resize events; hidden tabs
    // never deliver the observer, so nudge a resize event for newly mounted canvases.
    window.dispatchEvent(new Event("resize"));
    for (let i = 0; i < frames; i++) {
      t += ms / 1000;
      advance(t, true);
    }
    return frames;
  };
}

export const frameloop = TEST ? "never" : "always";

/** Keep the drawing buffer in test mode so screenshots / toDataURL see the frame. */
export const glTest = TEST ? { preserveDrawingBuffer: true } : {};

/**
 * Hidden tabs never deliver ResizeObserver callbacks, so R3F would stay at
 * 300×150. In test mode, size the canvas from its container each frame.
 */
export function TestSizer() {
  const setSize = useThree((st) => st.setSize);
  const gl = useThree((st) => st.gl);
  useFrame((st) => {
    const el = gl.domElement.parentElement && gl.domElement.parentElement.parentElement;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (Math.abs(r.width - st.size.width) > 1 || Math.abs(r.height - st.size.height) > 1)) setSize(r.width, r.height, r.top, r.left);
  }, -100);
  return null;
}
export const Sizer = TEST ? TestSizer : () => null;
