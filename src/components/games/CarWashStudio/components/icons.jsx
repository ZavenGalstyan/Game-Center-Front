/**
 * Car Wash Studio — original SVG icons (no emoji, no brand marks).
 * Tool icons use a shared 48x48 grid with gradients for material and depth;
 * `tint` is the cosmetic tool color.
 */
import { useId } from "react";

function Defs({ id, tint }) {
  return (
    <defs>
      <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f4f7fa" />
        <stop offset="1" stopColor="#8e969f" />
      </linearGradient>
      <linearGradient id={`${id}d`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4a4f57" />
        <stop offset="1" stopColor="#1c1e22" />
      </linearGradient>
      <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={tint} stopOpacity="1" />
        <stop offset="1" stopColor={tint} stopOpacity="0.62" />
      </linearGradient>
      <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#dff3ff" />
        <stop offset="1" stopColor="#6fc3f0" />
      </linearGradient>
    </defs>
  );
}

const GLYPHS = {
  hose: (id) => (
    <>
      <path d="M8 34c6 8 18 8 22 2" fill="none" stroke="#2e8b57" strokeWidth="4.5" strokeLinecap="round" />
      <rect x="20" y="15" width="16" height="9" rx="3" fill={`url(#${id}t)`} />
      <rect x="31" y="17" width="12" height="5" rx="1.5" fill={`url(#${id}m)`} />
      <rect x="24" y="22" width="6" height="13" rx="2.5" fill={`url(#${id}d)`} />
      <path d="M44 14l3-2M44 19.5h3.5M44 25l3 2" stroke={`url(#${id}w)`} strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  foam: (id) => (
    <>
      <rect x="10" y="18" width="16" height="20" rx="5" fill="#eef4f9" stroke="#b9c6d2" />
      <rect x="12" y="25" width="12" height="7" rx="2" fill={`url(#${id}t)`} />
      <rect x="26" y="20" width="12" height="8" rx="2" fill={`url(#${id}d)`} />
      <rect x="15" y="12" width="6" height="7" rx="1.5" fill={`url(#${id}d)`} />
      <circle cx="42" cy="18" r="3.2" fill="#fff" stroke="#cfd8e0" />
      <circle cx="44.5" cy="24" r="2.4" fill="#fff" stroke="#cfd8e0" />
      <circle cx="40" cy="28" r="1.8" fill="#fff" stroke="#cfd8e0" />
    </>
  ),
  sponge: (id) => (
    <>
      <rect x="8" y="14" width="32" height="22" rx="8" fill="#f2c253" />
      <rect x="8" y="14" width="32" height="12" rx="7" fill="#ffe08a" />
      <rect x="8" y="30" width="32" height="6" rx="3" fill={`url(#${id}t)`} />
      {[[14, 19], [21, 22], [28, 18], [34, 22], [17, 26], [31, 26]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="1.4" fill="#c98a23" opacity="0.6" />
      ))}
    </>
  ),
  pressure: (id) => (
    <>
      <rect x="4" y="21" width="24" height="4" rx="1.5" fill={`url(#${id}m)`} />
      <rect x="26" y="17" width="14" height="10" rx="3" fill={`url(#${id}t)`} />
      <rect x="31" y="26" width="5" height="12" rx="2" fill={`url(#${id}d)`} />
      <rect x="39" y="20" width="6" height="4" rx="1" fill={`url(#${id}d)`} />
      <path d="M3 23H0" stroke="#fff" strokeWidth="2" />
      <path d="M3 21l-3-3M3 25l-3 3" stroke={`url(#${id}w)`} strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  wheelCleaner: (id) => (
    <>
      <rect x="15" y="18" width="18" height="24" rx="5" fill="#a64fc0" />
      <rect x="18" y="26" width="12" height="8" rx="2" fill="#f4eaf8" />
      <rect x="17" y="10" width="12" height="8" rx="2" fill={`url(#${id}t)`} />
      <rect x="27" y="11" width="9" height="4" rx="1" fill={`url(#${id}d)`} />
      <circle cx="40" cy="12" r="1.6" fill="#d9a7ea" />
      <circle cx="43" cy="16" r="1.2" fill="#d9a7ea" />
    </>
  ),
  wheelBrush: (id) => (
    <>
      <rect x="18" y="20" width="26" height="7" rx="3.5" fill={`url(#${id}t)`} transform="rotate(-18 31 23)" />
      <rect x="8" y="16" width="12" height="15" rx="3" fill={`url(#${id}d)`} transform="rotate(-18 14 23)" />
      {[0, 3, 6, 9, 12].map((k) => (
        <path key={k} d={`M${8 + k * 0.3} ${17 + k}l-6 ${1 + k * 0.2}`} stroke="#2a2c30" strokeWidth="1.6" strokeLinecap="round" />
      ))}
    </>
  ),
  tireShine: () => (
    <>
      <circle cx="22" cy="24" r="15" fill="#1b1c1f" />
      <circle cx="22" cy="24" r="8" fill="#6d737b" />
      <path d="M11 17a13 13 0 0 1 9-7" stroke="#fff" strokeWidth="2" opacity="0.5" fill="none" strokeLinecap="round" />
      <rect x="30" y="26" width="14" height="10" rx="4" fill="#3b3e44" />
      <rect x="30" y="26" width="14" height="4" rx="2" fill="#5a5e66" />
    </>
  ),
  spray: (id) => (
    <>
      <rect x="15" y="18" width="18" height="24" rx="5" fill={`url(#${id}w)`} />
      <rect x="18" y="26" width="12" height="8" rx="2" fill="#f4fbff" />
      <rect x="17" y="10" width="12" height="8" rx="2" fill={`url(#${id}t)`} />
      <rect x="27" y="11" width="9" height="4" rx="1" fill={`url(#${id}d)`} />
      <circle cx="40" cy="12" r="1.6" fill="#bfe6ff" />
      <circle cx="43" cy="16" r="1.2" fill="#bfe6ff" />
    </>
  ),
  cloth: (id) => (
    <>
      <path d="M8 16l26-5 6 24-26 5z" fill={`url(#${id}t)`} />
      <path d="M8 16l26-5 2 8-26 5z" fill="#fff" opacity="0.25" />
      <path d="M14 20l3 13M20 19l3 13M26 18l3 13" stroke="#fff" strokeOpacity="0.35" />
    </>
  ),
  towel: (id) => (
    <>
      <rect x="6" y="12" width="36" height="26" rx="6" fill={`url(#${id}t)`} />
      <rect x="6" y="12" width="36" height="8" rx="4" fill="#fff" opacity="0.3" />
      <path d="M10 26h28M10 31h28" stroke="#fff" strokeOpacity="0.35" strokeDasharray="2 2" />
      <circle cx="37" cy="36" r="2" fill="#bfe6ff" />
    </>
  ),
  polisher: (id) => (
    <>
      <circle cx="18" cy="26" r="13" fill={`url(#${id}t)`} />
      <circle cx="18" cy="26" r="13" fill="none" stroke="#000" strokeOpacity="0.15" />
      <path d="M10 22a9 9 0 0 1 6-5" stroke="#fff" strokeWidth="2" opacity="0.7" fill="none" strokeLinecap="round" />
      <circle cx="18" cy="26" r="5" fill={`url(#${id}d)`} />
      <rect x="22" y="22" width="22" height="8" rx="4" fill={`url(#${id}d)`} />
    </>
  ),
  vacuum: (id) => (
    <>
      <path d="M10 34l6-6h8l6 6z" fill={`url(#${id}d)`} />
      <rect x="9" y="33" width="22" height="4" rx="1" fill="#101113" />
      <rect x="18" y="8" width="6" height="21" rx="2" fill={`url(#${id}t)`} transform="rotate(20 21 18)" />
      {[[36, 30], [40, 26], [38, 36]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="1.5" fill="#b89668" />
      ))}
    </>
  ),
  detailBrush: (id) => (
    <>
      <rect x="18" y="21" width="26" height="5" rx="2.5" fill={`url(#${id}t)`} transform="rotate(-25 31 23)" />
      <rect x="10" y="17" width="10" height="11" rx="2" fill={`url(#${id}m)`} transform="rotate(-25 15 22)" />
      <path d="M9 20l-5 3M10 24l-5 3M12 27l-4 4" stroke="#e5cf9d" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  hand: () => (
    <>
      <path d="M16 36V20a2.5 2.5 0 0 1 5 0v8-12a2.5 2.5 0 0 1 5 0v12-10a2.5 2.5 0 0 1 5 0v10-6a2.5 2.5 0 0 1 5 0v11c0 6-4 10-10 10h-3c-4 0-6-2-8-5l-5-7a2.3 2.3 0 0 1 3.6-2.8z" fill="#f3d9c2" stroke="#b98d6c" strokeWidth="1.2" />
    </>
  ),
};

export function ToolIcon({ tool, tint = "#f1e6cf", size = 40 }) {
  const id = useId().replace(/:/g, "");
  const g = GLYPHS[tool];
  return (
    <svg className="cws-toolicon" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <Defs id={id} tint={tint} />
      {g ? g(id) : null}
    </svg>
  );
}

/* ------------------------------------------------------------ UI glyphs */

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

export const Icon = {
  back: () => <svg viewBox="0 0 24 24" width="18" height="18" {...S}><path d="M15 18l-6-6 6-6" /></svg>,
  menu: () => <svg viewBox="0 0 24 24" width="18" height="18" {...S}><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  hint: () => <svg viewBox="0 0 24 24" width="18" height="18" {...S}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></svg>,
  check: () => <svg viewBox="0 0 24 24" width="14" height="14" {...S} strokeWidth="3"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  lock: () => <svg viewBox="0 0 24 24" width="16" height="16" {...S}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  play: () => <svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5l11 7-11 7z" fill="currentColor" /></svg>,
  star: ({ on }) => (
    <svg viewBox="0 0 24 24" width="18" height="18" className={on ? "cws-star is-on" : "cws-star"}>
      <path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.3l-5.6 2.9 1.1-6.3L2.9 9.5l6.3-.9z" fill="currentColor" />
    </svg>
  ),
  car: () => <svg viewBox="0 0 24 24" width="18" height="18" {...S}><path d="M3 15l2-5c.4-1 1.2-1.5 2.2-1.5h9.6c1 0 1.8.5 2.2 1.5l2 5v3h-3M6 18H3v-3M6 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0zm8 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM10 18h4" /></svg>,
  wrench: () => <svg viewBox="0 0 24 24" width="18" height="18" {...S}><path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 1-2-2zM14.5 6.5l3-3" /></svg>,
  gear: () => <svg viewBox="0 0 24 24" width="18" height="18" {...S}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>,
  chart: () => <svg viewBox="0 0 24 24" width="18" height="18" {...S}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  list: () => <svg viewBox="0 0 24 24" width="18" height="18" {...S}><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>,
  drop: () => <svg viewBox="0 0 24 24" width="16" height="16" {...S}><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" /></svg>,
  sparkle: () => <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 2l2 7 7 3-7 2-2 8-2-8-7-2 7-3z" fill="currentColor" /></svg>,
  seat: () => <svg viewBox="0 0 24 24" width="16" height="16" {...S}><path d="M7 3h6a2 2 0 0 1 2 2v9H7zM5 14h12l1 4H6zM8 18v3M16 18v3" /></svg>,
  wheel: () => <svg viewBox="0 0 24 24" width="16" height="16" {...S}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M12 3v6M12 15v6M3 12h6M15 12h6" /></svg>,
};
