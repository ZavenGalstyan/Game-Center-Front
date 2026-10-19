/** Small inline SVG icons (tools, UI, doll types). Stroke 1.8, currentColor. */
const P = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

const PATHS = {
  magnifier: <><circle cx="10" cy="10" r="6" /><path d="M14.5 14.5 20 20" /></>,
  hand: <><path d="M8 13V6a1.5 1.5 0 0 1 3 0v6" /><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11" /><path d="M14 11V6a1.5 1.5 0 0 1 3 0v7" /><path d="M8 12.5 6.6 11a1.5 1.5 0 0 0-2.2 2l3.4 4.4A6 6 0 0 0 12.5 20h.5a5 5 0 0 0 5-5v-2" /></>,
  brush: <><path d="M14 4h4v6h-4z" /><path d="M13 10h6l-1 4h-4z" /><path d="M15 14v6" /><path d="M17 14v6" /></>,
  cloth: <><path d="M5 7c3-2 5 2 8 0s4-2 6 0v10c-2-2-3-2-6 0s-5-2-8 0z" /></>,
  sponge: <><rect x="4" y="8" width="16" height="9" rx="2.5" /><circle cx="8" cy="12" r=".8" /><circle cx="12" cy="14" r=".8" /><circle cx="16" cy="11" r=".8" /></>,
  spray: <><path d="M9 9h5v11H9z" /><path d="M10 9V6h3l3-2" /><path d="M17 7h1M18 5h1M18 9h1" /></>,
  polish: <><circle cx="12" cy="15" r="5" /><path d="M12 10V4" /><path d="M9.5 14.5c1-1 2-1.2 3-.8" /></>,
  glue: <><path d="M9 20h6V9l-3-2-3 2z" /><path d="M12 7V3" /><path d="M10 13h4" /></>,
  pliers: <><path d="M9 3c-1 3 0 6 2 8" /><path d="M15 3c1 3 0 6-2 8" /><path d="M11 11l-4 9M13 11l4 9" /><circle cx="12" cy="11" r="1.2" /></>,
  comb: <><path d="M4 9h16v3H4z" /><path d="M6 12v6M9 12v6M12 12v6M15 12v6M18 12v6" /></>,
  shampoo: <><path d="M8 9h8v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z" /><path d="M10 9V6h4v3" /><path d="M12 6V3h3" /></>,
  dryer: <><path d="M4 9a5 5 0 0 1 5-5h6v8H9a5 5 0 0 1-5-3z" /><path d="M11 12l1.5 8h2.5L13.5 12" /><path d="M17 6h3M17 9h3" /></>,
  reroot: <><path d="M12 3v9" /><path d="M10 12h4l-1 9h-2z" /><path d="M7 5l2 2M17 5l-2 2" /></>,
  paint: <><path d="M14 3l7 7-8 8-4-4z" /><path d="M9 14l-4 4a2 2 0 0 0 2 2l4-4" /></>,
  needle: <><path d="M5 19 19 5" /><circle cx="18" cy="6" r="1.4" /><path d="M5 19c3-1 6 1 8-2" /></>,
  rotL: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8" /><path d="M4 3v5h5" /></>,
  rotR: <><path d="M20 12a8 8 0 1 1-2.3-5.7L20 8" /><path d="M20 3v5h-5" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <><path d="M5 12h14" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  eraser: <><path d="M3 17l8-8 6 6-4 4H7z" /><path d="M14 6l3-3 4 4-3 3" /></>,
  check: <><path d="M5 12l5 5L20 7" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  coin: <><circle cx="12" cy="12" r="8" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v1.5M12 16v1.5" /></>,
  star: <><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  heart: <><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></>,
  shop: <><path d="M4 9l1-5h14l1 5" /><path d="M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" /><path d="M5 11v9h14v-9" /><path d="M10 20v-5h4v5" /></>,
  gallery: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 15l3-3 3 3 2-2 3 3" /><circle cx="9" cy="9" r="1.3" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="5" cy="6" r="1" /><circle cx="5" cy="12" r="1" /><circle cx="5" cy="18" r="1" /></>,
  play: <><path d="M8 5v14l11-7z" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14" /><path d="M12 17h.01" /></>,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  box: <><path d="M3 8l9-5 9 5v8l-9 5-9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  sparkle: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.8 2.2 2.2.8-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></>,
  split: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></>,
  side: <><rect x="3" y="5" width="7" height="14" rx="1.5" /><rect x="14" y="5" width="7" height="14" rx="1.5" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" /><path d="M10 15h4M9 20h6M12 13v7" /></>,
  wardrobe: <><path d="M12 4a2 2 0 0 1 2 2c0 1-1 1.5-2 2v1" /><path d="M12 9 3 15h18z" /></>,
};

export function Icon({ name, size = null, className = "" }) {
  return (
    <svg {...P} className={`drw-icon ${className}`} style={size ? { width: size, height: size } : undefined}>
      {PATHS[name] || PATHS.sparkle}
    </svg>
  );
}

/** Simple portrait for customers (skin, hair colour/style, top colour). */
export function Avatar({ c, size = 64 }) {
  if (!c) return null;
  const long = ["long", "wavy", "pigtails", "twintails", "ponytail"].includes(c.style);
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="drw-avatar" aria-hidden="true">
      <defs>
        <radialGradient id={`bg-${c.name.length}`} cx="50%" cy="40%" r="70%">
          <stop offset="0" stopColor="#fff7f0" />
          <stop offset="1" stopColor="#f6dbe4" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill={`url(#bg-${c.name.length})`} />
      {long && <path d="M16 30c0-12 7-18 16-18s16 6 16 18v20H16z" fill={c.hair} />}
      <path d="M14 64c2-11 9-15 18-15s16 4 18 15z" fill={c.top} />
      <rect x="28" y="40" width="8" height="8" rx="3" fill={c.skin} />
      <ellipse cx="32" cy="30" rx={c.age === "child" ? 13 : 12} ry={c.age === "child" ? 13 : 14} fill={c.skin} />
      <path d={c.style === "bun" ? "M19 27c0-9 6-13 13-13s13 4 13 13c-3-5-8-6-13-6s-10 1-13 6z" : "M19 28c0-9 6-14 13-14s13 5 13 14c-4-6-8-7-13-7s-9 2-13 7z"} fill={c.hair} />
      {c.style === "bun" && <circle cx="32" cy="12" r="6" fill={c.hair} />}
      {(c.style === "pigtails" || c.style === "twintails") && <><circle cx="16" cy="26" r="5" fill={c.hair} /><circle cx="48" cy="26" r="5" fill={c.hair} /></>}
      <circle cx="27" cy="31" r="1.6" fill="#2c2226" />
      <circle cx="37" cy="31" r="1.6" fill="#2c2226" />
      <circle cx="24.5" cy="35" r="2.2" fill="#f39aa6" opacity=".45" />
      <circle cx="39.5" cy="35" r="2.2" fill="#f39aa6" opacity=".45" />
      <path d="M28.5 37c2 1.8 5 1.8 7 0" stroke="#a24b5a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {c.age === "senior" && <><circle cx="27" cy="31" r="3.4" stroke="#6b5b5b" strokeWidth="1" fill="none" /><circle cx="37" cy="31" r="3.4" stroke="#6b5b5b" strokeWidth="1" fill="none" /><path d="M30.4 31h3.2" stroke="#6b5b5b" strokeWidth="1" /></>}
    </svg>
  );
}

/** Doll-type badge silhouette coloured by its look. */
export function DollBadge({ type, color = "#f39ac0", hair = "#7a4a2c", size = 40 }) {
  const teddy = type === "teddy";
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className="drw-dollbadge" aria-hidden="true">
      {teddy ? (
        <>
          <circle cx="12" cy="9" r="4" fill="#b98a5e" />
          <circle cx="28" cy="9" r="4" fill="#b98a5e" />
          <circle cx="20" cy="14" r="8" fill="#b98a5e" />
          <ellipse cx="20" cy="29" rx="10" ry="9" fill="#b98a5e" />
          <ellipse cx="20" cy="17" rx="3.5" ry="2.5" fill="#e3c39a" />
          <circle cx="17" cy="12.5" r="1.2" fill="#2b1d17" />
          <circle cx="23" cy="12.5" r="1.2" fill="#2b1d17" />
          <path d="M15 22l5 1.5 5-1.5-5 2.5z" fill={color} />
        </>
      ) : (
        <>
          <path d="M11 13c0-6 4-9 9-9s9 3 9 9v9H11z" fill={hair} />
          <circle cx="20" cy="12" r="6.5" fill="#f6e3d8" />
          <path d="M13 11c1-4 4-6 7-6s6 2 7 6c-2-2-4-3-7-3s-5 1-7 3z" fill={hair} />
          <path d="M14 20h12l4 16H10z" fill={color} />
          <circle cx="17.8" cy="12.5" r="1" fill="#3f7fd0" />
          <circle cx="22.2" cy="12.5" r="1" fill="#3f7fd0" />
        </>
      )}
    </svg>
  );
}
