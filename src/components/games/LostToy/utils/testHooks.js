/**
 * Lost Toy — DEV-ONLY automation hooks (compiled out of production:
 * `import.meta.env.DEV` is false there, so TEST is a constant false).
 *
 * Automated browser tabs are often hidden, so requestAnimationFrame never
 * fires. With `?lttest=1` the canvas runs frameloop="never" and frames are
 * stepped explicitly via window.__ltAdvance(frames, ms); the hidden-tab
 * pause is bypassed and pointer lock is skipped. window.__lt exposes the live
 * world / renderer for inspection, and drive() feeds raw input through the
 * normal input path.
 */
import { advance, useFrame, useThree } from "@react-three/fiber";

export const TEST =
  import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("lttest") === "1";

if (TEST) {
  let t = 0;
  window.__lt = window.__lt || {};
  window.__ltAdvance = (frames = 1, ms = 1000 / 60) => {
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
    if (r.width > 0 && (Math.abs(r.width - st.size.width) > 1 || Math.abs(r.height - st.size.height) > 1)) setSize(r.width, r.height, r.top, r.left);
  }, -100);
  return null;
}
export const Sizer = TEST ? TestSizer : () => null;
