import { useEffect, useRef, useState } from "react";

/**
 * Samples a value from the (mutable) game at ~12 Hz and re-renders only when
 * it changes — the HUD never re-renders at frame rate.
 */
export function useSample(fn, deps = [], hz = 12) {
  const [v, setV] = useState(fn);
  const ref = useRef(v);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    const id = setInterval(() => {
      if (!alive) return;
      const n = fnRef.current();
      if (JSON.stringify(n) !== JSON.stringify(ref.current)) {
        ref.current = n;
        setV(n);
      }
    }, 1000 / hz);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

export function fmtTime(sec) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
