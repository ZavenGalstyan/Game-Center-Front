/** Inline SVG icons (intent, statuses, UI). currentColor-driven. */
const P = {
  attack: "M3 21l4-4M6.5 17.5L17 7l1-4-4 1L3.5 14.5M14 4l6 6M9 15l-3-3",
  defend: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z",
  buff: "M12 3l3 6h-2v5h-2V9H9zM5 21h14M7 17h10",
  debuff: "M12 21l-3-6h2v-5h2v5h2zM5 3h14M7 7h10",
  heal: "M12 21s-7-4.5-9-9.5C1.6 7.6 4 4 7.5 4c2 0 3.6 1.1 4.5 2.6C12.9 5.1 14.5 4 16.5 4 20 4 22.4 7.6 21 11.5 19 16.5 12 21 12 21z",
  energy: "M13 2L4 14h7l-1 8 9-12h-7z",
  skull: "M12 2C7 2 4 5.6 4 10c0 2.6 1.2 4.4 3 5.4V19a1 1 0 001 1h1v-2h2v2h2v-2h2v2h1a1 1 0 001-1v-3.6c1.8-1 3-2.8 3-5.4 0-4.4-3-8-8-8zm-3.5 11A1.8 1.8 0 1110.3 11 1.8 1.8 0 018.5 13zm7 0a1.8 1.8 0 111.8-1.8 1.8 1.8 0 01-1.8 1.8z",
  str: "M7 3l-2 9h4l-2 9 10-12h-5l3-6z",
  weak: "M4 4l16 16M12 3a9 9 0 100 18 9 9 0 000-18z",
  vuln: "M12 2l3 7 7 .6-5.3 4.6 1.6 7-6.3-3.8-6.3 3.8 1.6-7L2 9.6 9 9z",
  bleed: "M12 2C9 7 6 10.5 6 14a6 6 0 0012 0c0-3.5-3-7-6-12z",
  thorns: "M12 2l2 6 6-2-4 5 5 4-6 .5L14 22l-2-5-2 5-1-6.5-6-.5 5-4-4-5 6 2z",
  ritual: "M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z",
  regen: "M4 12a8 8 0 0114-5.3V4h2v6h-6V8h2.6A6 6 0 106 12z",
  deck: "M5 4h11a2 2 0 012 2v14H7a2 2 0 01-2-2zM8 2h11a2 2 0 012 2v14",
  discard: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  pause: "M7 4h3v16H7zM14 4h3v16h-3z",
  gear: "M12 8a4 4 0 100 8 4 4 0 000-8zm9 4l-2.2.8a7 7 0 01-.7 1.7l1 2.1-1.5 1.5-2.1-1a7 7 0 01-1.7.7L13 22h-2l-.8-2.2a7 7 0 01-1.7-.7l-2.1 1-1.5-1.5 1-2.1a7 7 0 01-.7-1.7L3 13v-2l2.2-.8a7 7 0 01.7-1.7l-1-2.1 1.5-1.5 2.1 1a7 7 0 011.7-.7L11 2h2l.8 2.2a7 7 0 011.7.7l2.1-1 1.5 1.5-1 2.1a7 7 0 01.7 1.7L21 11z",
  star: "M12 2l3 7 7 .6-5.3 4.6 1.6 7-6.3-3.8-6.3 3.8 1.6-7L2 9.6 9 9z",
  lock: "M7 10V7a5 5 0 0110 0v3h1a1 1 0 011 1v10H5V11a1 1 0 011-1zm2 0h6V7a3 3 0 00-6 0z",
  crown: "M3 18l-1-11 6 4 4-7 4 7 6-4-1 11zM3 20h18",
  shard: "M12 2l6 7-6 13-6-13z",
  up: "M12 4l7 8h-4v8H9v-8H5z",
  close: "M5 5l14 14M19 5L5 19",
  check: "M4 12l5 5L20 6",
  back: "M15 4l-8 8 8 8",
  book: "M4 4h7a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8z",
  dread: "M12 3a7 7 0 00-7 7v9l2-1.5L9 19l1.5-1.5L12 19l1.5-1.5L15 19l2-1.5L19 19v-9a7 7 0 00-7-7zm-2.5 8a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z",
  sword: "M14.5 3H21v6.5L10 20.5 7 21l.5-3zM5 15l4 4M3 21l3-3",
};

export function Icon({ name, size = "1em", className = "", title = null }) {
  const d = P[name] || P.skull;
  const filled = ["defend", "heal", "energy", "skull", "str", "vuln", "bleed", "thorns", "ritual", "star", "lock", "crown", "shard", "up", "dread", "deck", "book"].includes(name);
  return (
    <svg className={`dos-ic ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <path d={d} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0.6 : 2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Ornamental card corner flourish. */
export function Flourish({ className = "" }) {
  return (
    <svg className={`dos-flourish ${className}`} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M2 38V14C2 7 7 2 14 2h24M6 38V16c0-5 4-10 10-10h22M10 30c0-8 4-12 12-12" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="14" cy="14" r="2.2" fill="currentColor" />
    </svg>
  );
}
