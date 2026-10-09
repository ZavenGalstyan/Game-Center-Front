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

/** 1:23.456 */
export function fmtRace(sec) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

export const ordinal = (n) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

export const speedOf = (K, units) => {
  const kmh = Math.abs(K.vF) * 4.2;
  return units === "mph" ? Math.round(kmh * 0.621) : Math.round(kmh);
};
