/**
 * Tower Defense Mini — DEV-ONLY automation hooks (compiled out of production builds).
 * With `?tdtest=1` the canvas uses frameloop="never" and frames are stepped by
 * window.__tdAdvance(frames, ms) — automated/background tabs get no rAF.
 */
import { advance, useFrame, useThree } from "@react-three/fiber";

export const TEST =
  (import.meta.env.DEV || import.meta.env.VITE_TD_TEST === "1") && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tdtest") === "1";

if (TEST) {
  let t = 0;
  window.__tdAdvance = (frames = 1, ms = 1000 / 60) => {
    window.dispatchEvent(new Event("resize"));
    for (let i = 0; i < frames; i++) {
      t += ms / 1000;
      advance(t, true);
    }
    return frames;
  };
}

export const frameloop = TEST ? "never" : "always";
export const glTest = TEST ? { preserveDrawingBuffer: true } : {};

function TestSizer() {
  const setSize = useThree((st) => st.setSize);
  const gl = useThree((st) => st.gl);
  useFrame((st) => {
    const el = gl.domElement.parentElement && gl.domElement.parentElement.parentElement;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (Math.abs(r.width - st.size.width) > 1 || Math.abs(r.height - st.size.height) > 1)) setSize(r.width, r.height, true, r.top, r.left); // updateStyle must be boolean true (three checks === true)
  }, -100);
  return null;
}
export const Sizer = TEST ? TestSizer : () => null;
