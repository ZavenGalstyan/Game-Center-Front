import { useEffect, useRef, useState } from "react";

/**
 * Samples a value from the (mutable) run at `hz` and re-renders only when it
 * changes — the HUD never re-renders at frame rate.
 */
export function useSample(fn, deps = [], hz = 15) {
  const [v, setV] = useState(fn);
  const ref = useRef(JSON.stringify(v));
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    const id = setInterval(() => {
      const n = fnRef.current();
      const k = JSON.stringify(n);
      if (k !== ref.current) {
        ref.current = k;
        setV(n);
      }
    }, 1000 / hz);
    return () => clearInterval(id);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

/** 1:23.4 (or 1:23.45 with `hundredths`). */
export function fmtTime(sec, hundredths = false) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  const d = hundredths ? 2 : 1;
  return `${m}:${s.toFixed(d).padStart(3 + d, "0")}`;
}

/** 12.3 km / 870 m */
export function fmtDist(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

/** 1 h 05 m / 12 m 30 s */
export function fmtDuration(sec) {
  const s = Math.round(sec || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h} h ${String(m).padStart(2, "0")} m`;
  return `${m} m ${String(s % 60).padStart(2, "0")} s`;
}
