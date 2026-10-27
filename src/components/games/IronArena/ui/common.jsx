/**
 * Iron Arena — small shared UI pieces: inline SVG icons, coin badge, stat
 * bars, section headers. All styling lives in IronArena.css (scoped .ia).
 */
import { useEffect, useRef, useState } from "react";

const P = {
  play: "M7 4l13 8-13 8z",
  garage: "M3 10l9-6 9 6v10h-4v-6H7v6H3z",
  tanks: "M3 15h18v3H3zM5 11h11l2 4H4zM9 8h6v3H9zM15 9h6v1h-6z",
  map: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14",
  modes: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  settings: "M12 8a4 4 0 100 8 4 4 0 000-8zM10.5 2h3l.5 2.6 2.2 1 2.3-1.4 2.1 2.1-1.4 2.3 1 2.2 2.6.5v3l-2.6.5-1 2.2 1.4 2.3-2.1 2.1-2.3-1.4-2.2 1-.5 2.6h-3l-.5-2.6-2.2-1-2.3 1.4-2.1-2.1 1.4-2.3-1-2.2L2 13.5v-3l2.6-.5 1-2.2-1.4-2.3 2.1-2.1 2.3 1.4 2.2-1z",
  back: "M15 5l-7 7 7 7",
  coin: "M12 3a9 9 0 110 18 9 9 0 010-18zm0 4a5 5 0 100 10 5 5 0 000-10z",
  lock: "M7 11V8a5 5 0 0110 0v3h1v10H6V11zm2 0h6V8a3 3 0 00-6 0z",
  check: "M5 12l5 5 9-10",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  armor: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z",
  speed: "M4 18a8 8 0 1116 0h-2a6 6 0 10-12 0zM12 18l5-7",
  damage: "M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  fire: "M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-7 0 3 1 4 2 4 0-3 0-6 1-9z",
  pause: "M7 5h4v14H7zM13 5h4v14h-4z",
  board: "M4 5h16v3H4zM4 10.5h16v3H4zM4 16h16v3H4z",
  scope: "M12 3a9 9 0 110 18 9 9 0 010-18zm0 2a7 7 0 100 14 7 7 0 000-14zM11 1h2v6h-2zM11 17h2v6h-2zM1 11h6v2H1zM17 11h6v2h-6z",
  flag: "M5 3h2v18H5zM7 4h11l-3 4 3 4H7z",
  skull: "M12 2a8 8 0 018 8c0 3-1.5 5-3 6v3h-2v-2h-2v2h-2v-2H9v2H7v-3c-1.5-1-3-3-3-6a8 8 0 018-8zm-3 7a2 2 0 100 4 2 2 0 000-4zm6 0a2 2 0 100 4 2 2 0 000-4z",
  expand: "M4 4h6v2H6v4H4zM14 4h6v6h-2V6h-4zM4 14h2v4h4v2H4zM18 14h2v6h-6v-2h4z",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  shield: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z",
  wrench: "M21 6a5 5 0 01-7 4.6L6 18.6a2 2 0 11-2.8-2.8l8-8A5 5 0 0118 3l-3 3 1 2 2 1z",
  eye: "M12 5c5 0 9 4 10 7-1 3-5 7-10 7S3 15 2 12c1-3 5-7 10-7zm0 3a4 4 0 100 8 4 4 0 000-8z",
  flame: "M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-7 0 3 1 4 2 4 0-3 0-6 1-9z",
  gear: "M12 8a4 4 0 100 8 4 4 0 000-8z",
  target: "M12 2a10 10 0 110 20 10 10 0 010-20zm0 3a7 7 0 100 14 7 7 0 000-14zm0 4a3 3 0 110 6 3 3 0 010-6z",
  rocket: "M12 2c4 3 5 7 5 11l-2 3H9l-2-3c0-4 1-8 5-11zm-5 14l-3 4h4zm10 0l3 4h-4zM12 7a2 2 0 100 4 2 2 0 000-4z",
  trophy: "M7 3h10v3h3v3a4 4 0 01-4 4 5 5 0 01-3 2v3h3v3H8v-3h3v-3a5 5 0 01-3-2 4 4 0 01-4-4V6h3zm-1 5v1a2 2 0 001 1.7V8zm12 0h-1v2.7A2 2 0 0018 9z",
};
export function Icon({ name, size = "1em", className = "" }) {
  return (
    <svg className={`ia-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={P[name] || P.gear} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
export const ABILITY_ICON = { nitro: "bolt", repair: "wrench", shield: "shield", focus: "target", inferno: "flame", overclock: "fire", cloak: "eye", barrage: "rocket" };

export function Coins({ value, big = false, animate = false }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (!animate) {
      setShown(value);
      from.current = value;
      return undefined;
    }
    const a = from.current;
    const b = value;
    from.current = value;
    if (a === b) return undefined;
    let raf = 0;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 900);
      setShown(Math.round(a + (b - a) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // hidden tabs never run rAF: land on the final value anyway
    const fallback = setTimeout(() => setShown(b), 1100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [value, animate]);
  return (
    <span className={`ia-coins${big ? " ia-coins--big" : ""}`}>
      <Icon name="coin" />
      <b>{shown.toLocaleString()}</b>
    </span>
  );
}

export function StatBar({ label, value, max, suffix = "", extra = 0, icon }) {
  const k = Math.max(0, Math.min(1, value / max));
  const e = Math.max(0, Math.min(1 - k, extra / max));
  return (
    <div className="ia-stat">
      <div className="ia-stat__head">
        <span>
          {icon && <Icon name={icon} />}
          {label}
        </span>
        <b>
          {Math.round(value)}
          {suffix}
          {extra > 0 && <em> +{Math.round(extra)}</em>}
        </b>
      </div>
      <div className="ia-stat__bar">
        <i style={{ width: `${k * 100}%` }} />
        {e > 0 && <i className="ia-stat__extra" style={{ left: `${k * 100}%`, width: `${e * 100}%` }} />}
      </div>
    </div>
  );
}

export function Header({ title, sub, onBack, right }) {
  return (
    <div className="ia-head">
      {onBack && (
        <button className="ia-back" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
      )}
      <div className="ia-head__t">
        <h2>{title}</h2>
        {sub && <span>{sub}</span>}
      </div>
      <div className="ia-head__r">{right}</div>
    </div>
  );
}

export const fmtTime = (s) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
