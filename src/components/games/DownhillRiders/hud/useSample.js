import { useEffect, useRef, useState } from "react";

/**
 * Samples a value from the (mutable) race at `hz` and re-renders only when
 * it changes — the HUD never re-renders at frame rate.
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

/** 1:23.45 */
export function fmtRace(sec) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

export const ordinal = (n) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

/** km/h (or mph) for the HUD. */
export const speedOf = (B, units) => {
  const kmh = Math.max(0, B.vF) * 3.6;
  return units === "mph" ? Math.round(kmh * 0.621) : Math.round(kmh);
};

/** Distance for the HUD: metres / km, or feet / miles. */
export function distOf(m, units) {
  if (units === "mph") {
    const ft = m * 3.281;
    return ft >= 2640 ? `${(ft / 5280).toFixed(2)} mi` : `${Math.round(ft)} ft`;
  }
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}
