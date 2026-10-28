/**
 * Original line-art icons (inline SVG, 24×24, currentColor) for spells, items
 * and menus.
 */
const P = {
  wand: "M3 21l1.5-1.5L15 9l-1-1L3.5 18.5 2 20l1 1zm13.5-15.5l1-3 1 3 3 1-3 1-1 3-1-3-3-1 3-1zM19 13l.6-1.4L21 11l-1.4-.6L19 9l-.6 1.4L17 11l1.4.6L19 13z",
  disarm: "M4 20l7-7M9 11l4 4M14 4l6 6M17 3l4 4-3 1-2-2 1-3zM3 21l3-1-2-2-1 3z",
  stun: "M13 2L4 14h6l-1 8 9-12h-6l1-8z",
  fire: "M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z",
  lift: "M12 3l5 5h-3v4h-4V8H7l5-5zM5 15h14v2H5zM8 19h8v2H8z",
  pull: "M12 21l-5-5h3V8h4v8h3l-5 5zM5 3h14v2H5z",
  key: "M7 3a5 5 0 014.9 6H22v4h-2v3h-3v-3h-2v3h-3v-3h-.1A5 5 0 117 3zm0 3a2 2 0 100 4 2 2 0 000-4z",
  mend: "M14.7 3.3a5 5 0 00-6.4 6.4L3 15v6h6l5.3-5.3a5 5 0 006.4-6.4l-3 3-3-1-1-3 3-3z",
  light: "M12 2a7 7 0 014 12.7V17H8v-2.3A7 7 0 0112 2zm-3 17h6v2H9z",
  shield: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z",
  patronus: "M5 20l2-6-3-3 4-1 2-5 2 4 4-3-1 5 4 2-4 2 1 5-4-3-3 3-1-4-3 4z",
  dome: "M2 20a10 10 0 0120 0h-2a8 8 0 00-16 0H2zm4 0a6 6 0 0112 0h-2a4 4 0 00-8 0H6z",
  nova: "M12 2l2 6 6-2-4 5 6 3-7 1 1 7-4-5-4 5 1-7-7-1 6-3-4-5 6 2 2-6z",
  vanish: "M12 3c5 0 9 4 9 9h-2a7 7 0 00-14 0H3c0-5 4-9 9-9zm0 6a3 3 0 013 3h-2a1 1 0 00-2 0H9a3 3 0 013-3zM3 15h18v2H3zm3 4h12v2H6z",
  counter: "M4 7h11l-3-3 1.4-1.4L19 8l-5.6 5.4L12 12l3-3H4V7zm16 10H9l3 3-1.4 1.4L5 16l5.6-5.4L12 12l-3 3h11v2z",
  potion: "M9 2h6v2h-1v4l4 5c2 3 0 9-6 9s-8-6-6-9l4-5V4H9V2zm-1.7 13c-.8 1.8.4 5 4.7 5s5.5-3.2 4.7-5H7.3z",
  robe: "M8 2h8l1 3 4 3-2 3-2-1v12H7V10l-2 1-2-3 4-3 1-3zm2 2l2 3 2-3h-4z",
  charm: "M6 2h2c0 3 1.8 5 4 5s4-2 4-5h2c0 3.6-2 6.4-5 7v1.2a4 4 0 11-2 0V9C8 8.4 6 5.6 6 2zm6 11a2 2 0 100 4 2 2 0 000-4z",
  book: "M4 3h7a3 3 0 013 3v15a3 3 0 00-3-3H4V3zm16 0h-4a3 3 0 00-1 .2V20a3 3 0 012-2h3V3z",
  page: "M6 2h9l5 5v15H6V2zm8 1v5h5M9 11h8v2H9zm0 4h8v2H9z",
  mask: "M4 6c3-2 13-2 16 0 0 7-3 12-8 14-5-2-8-7-8-14zm3 4c1 1 3 1 4 0-1-1-3-1-4 0zm6 0c1 1 3 1 4 0-1-1-3-1-4 0z",
  sigil: "M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6z",
  gem: "M7 3h10l5 6-10 12L2 9l5-6z",
  coin: "M12 3a9 9 0 110 18 9 9 0 010-18zm0 2a7 7 0 100 14 7 7 0 000-14z",
  bag: "M8 6V5a4 4 0 018 0v1h3l1 15H4L5 6h3zm2 0h4V5a2 2 0 00-4 0v1z",
  spellbook: "M5 3h12a2 2 0 012 2v16H7a2 2 0 01-2-2V3zm3 3v2h8V6H8zm4 4l1 2 2 .3-1.5 1.4.4 2.3-1.9-1-1.9 1 .4-2.3L9 12.3l2-.3 1-2z",
  journal: "M6 2h12v20H6a2 2 0 01-2-2V4a2 2 0 012-2zm2 4v2h8V6H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z",
  map: "M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2V5zm6 0v14l6 2V7L9 5z",
  person: "M12 2a5 5 0 110 10 5 5 0 010-10zm-8 20c0-4.4 3.6-8 8-8s8 3.6 8 8H4z",
  pause: "M7 4h4v16H7zm6 0h4v16h-4z",
  close: "M5 6.4L6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12z",
  check: "M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z",
  star: "M12 2l3 6.5 7 .8-5.2 4.8 1.4 6.9L12 17.6 5.8 21l1.4-6.9L2 9.3l7-.8L12 2z",
  heart: "M12 21l-1.4-1.3C5.4 15.1 2 12 2 8.2 2 5.1 4.4 3 7.3 3c1.7 0 3.4.8 4.7 2.1C13.3 3.8 15 3 16.7 3 19.6 3 22 5.1 22 8.2c0 3.8-3.4 6.9-8.6 11.5L12 21z",
  drop: "M12 2c3 5 7 8.5 7 12.5a7 7 0 01-14 0C5 10.5 9 7 12 2z",
  q: "M12 3a8 8 0 016.3 12.9l2.4 2.4-1.4 1.4-2.4-2.4A8 8 0 1112 3zm0 2a6 6 0 100 12 6 6 0 000-12z",
  r: "M6 3h7a5 5 0 012 9.6L19 21h-2.3l-3.7-8H8v8H6V3zm2 2v6h5a3 3 0 000-6H8z",
  lock: "M7 10V7a5 5 0 0110 0v3h2v12H5V10h2zm2 0h6V7a3 3 0 00-6 0v3z",
  sprint: "M13 4a2 2 0 110 4 2 2 0 010-4zM8 21l2-7-3-2 1-5 5 1 3 4h3v2h-4l-2-2-1 3 3 3-1 6h-2l1-5-2-2-1 7H8z",
  dodge: "M4 12a8 8 0 0114-5.3V4h2v6h-6V8h2.5A6 6 0 106 12H4z",
  hand: "M8 11V4a1.5 1.5 0 013 0v6h1V3a1.5 1.5 0 013 0v7h1V5a1.5 1.5 0 013 0v9c0 4.4-3 8-7 8-3 0-5-2-6.5-4.5L3 13l1.5-1 3.5 3V11z",
  swap: "M7 7h11l-3-3 1.4-1.4L22 8l-5.6 5.4L15 12l3-3H7V7zm10 10H6l3 3-1.4 1.4L2 16l5.6-5.4L9 12l-3 3h11v2z",
  crosshair: "M11 2h2v5h-2zm0 15h2v5h-2zM2 11h5v2H2zm15 0h5v2h-5z",
  sound: "M3 9h4l6-5v16l-6-5H3V9zm13 0a4 4 0 010 6l-1.4-1.4a2 2 0 000-3.2L16 9z",
};
export function Icon({ name, size = 20, className = "", title }) {
  const d = P[name] || P.star;
  const stroke = name === "disarm";
  return (
    <svg className={`hwa-ic ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      {stroke ? <path d={d} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /> : <path d={d} fill="currentColor" />}
    </svg>
  );
}
