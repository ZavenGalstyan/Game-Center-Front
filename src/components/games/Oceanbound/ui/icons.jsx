/**
 * Oceanbound — original SVG item / UI icons (48×48 viewBox).
 */
const W = ({ children, size, title }) => (
  <svg className="ob-ico" viewBox="0 0 48 48" width={size} height={size} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
    {title && <title>{title}</title>}
    {children}
  </svg>
);
const wood = "#c79a63";
const woodD = "#8a6238";
const cupBody = (water, extra) => (
  <>
    <path d="M13 12h22l-3 28a3 3 0 0 1-3 2.6H19A3 3 0 0 1 16 40z" fill="#eef3f5" stroke="#9fb1ba" strokeWidth="2" />
    {water && <path d="M14.6 19h18.8l-2.2 20.4a2 2 0 0 1-2 1.6h-10.4a2 2 0 0 1-2-1.6z" fill={water} opacity="0.9" />}
    <path d="M17 15h3l-1.4 22" stroke="#fff" strokeWidth="2" opacity="0.7" fill="none" />
    {extra}
  </>
);

const ICONS = {
  plank: (
    <g transform="rotate(-30 24 24)">
      <rect x="4" y="18" width="40" height="12" rx="2" fill={wood} stroke={woodD} strokeWidth="2" />
      <path d="M8 22h14M26 26h14M12 26h8" stroke={woodD} strokeWidth="1.5" opacity="0.7" />
      <circle cx="7.5" cy="24" r="1.3" fill="#5a4a3a" />
      <circle cx="40.5" cy="24" r="1.3" fill="#5a4a3a" />
    </g>
  ),
  plastic: (
    <g>
      <path d="M20 6h8v5c5 2 7 6 7 10v19a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3V21c0-4 2-8 7-10z" fill="#a9dcef" stroke="#5aa3c4" strokeWidth="2" />
      <rect x="19" y="3" width="10" height="5" rx="1.5" fill="#3b82c4" />
      <path d="M17 24h14" stroke="#fff" strokeWidth="3" opacity="0.6" />
    </g>
  ),
  leaf: (
    <g>
      <path d="M8 40C14 22 26 10 42 6 38 22 26 36 8 40z" fill="#6aa83a" stroke="#3f6e22" strokeWidth="2" />
      <path d="M8 40L40 8" stroke="#3f6e22" strokeWidth="2" />
      <path d="M16 32l-3-8M22 26l-2-9M28 20l-1-8M18 30l8 2M24 24l8 2M30 18l7 1" stroke="#3f6e22" strokeWidth="1.4" />
    </g>
  ),
  scrap: (
    <g>
      <path d="M6 18l14-8 8 4 14-2-4 14 4 10-16 4-8-6-10 2z" fill="#9a6a4a" stroke="#5a3a28" strokeWidth="2" />
      <path d="M14 22l20 6" stroke="#c48a5e" strokeWidth="2" />
      <circle cx="18" cy="30" r="2.4" fill="#4a4540" />
      <circle cx="32" cy="18" r="2" fill="#4a4540" />
    </g>
  ),
  rope: (
    <g fill="none" strokeLinecap="round">
      <circle cx="24" cy="24" r="15" stroke="#d6c08c" strokeWidth="5" />
      <circle cx="24" cy="24" r="8" stroke="#c2a96e" strokeWidth="5" />
      <path d="M36 32l8 8" stroke="#d6c08c" strokeWidth="5" />
      <circle cx="24" cy="24" r="15" stroke="#8a7445" strokeWidth="1" strokeDasharray="2 3" />
    </g>
  ),
  stone: <path d="M8 30c0-10 8-18 18-18s14 8 14 14-6 12-16 12S8 36 8 30z" fill="#9e9a92" stroke="#62605a" strokeWidth="2" />,
  palmwood: (
    <g>
      <rect x="6" y="16" width="32" height="16" rx="3" fill="#a9824f" stroke={woodD} strokeWidth="2" />
      <ellipse cx="38" cy="24" rx="6" ry="8" fill="#e2c592" stroke={woodD} strokeWidth="2" />
      <ellipse cx="38" cy="24" rx="3" ry="4" fill="none" stroke={woodD} strokeWidth="1.3" />
      <path d="M10 20h10M14 28h12" stroke={woodD} strokeWidth="1.5" />
    </g>
  ),
  clay: (
    <g>
      <path d="M6 34c2-8 8-12 14-12 3-6 10-8 15-4 6 2 8 8 6 14-2 5-34 6-35 2z" fill="#9a928a" stroke="#625a52" strokeWidth="2" />
      <path d="M16 30c4-2 8-2 12 0" stroke="#bdb5ac" strokeWidth="2" fill="none" />
    </g>
  ),
  metal_ore: (
    <g>
      <path d="M6 32l6-16 14-6 14 8 2 14-12 8H14z" fill="#7d776e" stroke="#4e4a44" strokeWidth="2" />
      <path d="M14 20l8 6 6-10M20 34l6-8 8 4" stroke="#d77a3a" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
  ),
  ingot: (
    <g>
      <path d="M6 32l8-14h20l8 14z" fill="#b8c0c6" stroke="#6b7378" strokeWidth="2" />
      <path d="M14 18l-2 6h24l-2-6z" fill="#dfe5e8" />
      <path d="M6 32h36v4H6z" fill="#8d959a" />
    </g>
  ),
  vine: (
    <g fill="none" stroke="#3f7a24" strokeWidth="3" strokeLinecap="round">
      <path d="M10 6c10 6-6 12 4 18s-6 12 6 18" />
      <path d="M26 6c8 8-4 12 6 20" stroke="#5a9a30" />
      <path d="M16 14l6-2M14 26l-6 2M18 34l6 1" stroke="#7ab83e" strokeWidth="4" />
    </g>
  ),
  bamboo: (
    <g>
      <rect x="18" y="4" width="10" height="40" rx="3" fill="#9cc25a" stroke="#5a7a2a" strokeWidth="2" />
      <path d="M18 16h10M18 30h10" stroke="#5a7a2a" strokeWidth="2.5" />
      <path d="M28 14c6-4 10-2 12 0-4 2-8 2-12 0z" fill="#6aa83a" />
    </g>
  ),
  coconut: (
    <g>
      <circle cx="24" cy="25" r="16" fill="#7a5530" stroke="#4e341a" strokeWidth="2" />
      <path d="M12 20c6-4 18-4 24 0" stroke="#9a7044" strokeWidth="2" fill="none" />
      <circle cx="20" cy="18" r="2" fill="#3a2410" />
      <circle cx="28" cy="18" r="2" fill="#3a2410" />
      <circle cx="24" cy="23" r="2" fill="#3a2410" />
    </g>
  ),
  mango: (
    <g>
      <path d="M24 10c10 0 16 8 16 18s-8 14-16 14S8 36 10 26 16 10 24 10z" fill="#f2a530" stroke="#b86a1a" strokeWidth="2" />
      <path d="M14 22c2-6 6-8 10-8" stroke="#ffd27a" strokeWidth="3" fill="none" />
      <path d="M24 10c2-4 6-6 10-5-2 4-6 6-10 5z" fill="#5a9a30" />
    </g>
  ),
  fish_raw: (
    <g>
      <path d="M6 24c8-10 22-10 30 0-8 10-22 10-30 0z" fill="#a9c2da" stroke="#5d7c9a" strokeWidth="2" />
      <path d="M36 24l8-8v16z" fill="#8aa8c6" stroke="#5d7c9a" strokeWidth="2" />
      <circle cx="13" cy="22" r="2" fill="#1d2a36" />
      <path d="M20 18c2 4 2 8 0 12" stroke="#5d7c9a" strokeWidth="1.5" fill="none" />
    </g>
  ),
  fish_cooked: (
    <g>
      <path d="M6 24c8-10 22-10 30 0-8 10-22 10-30 0z" fill="#b36e34" stroke="#6e3e18" strokeWidth="2" />
      <path d="M36 24l8-8v16z" fill="#9a5a28" stroke="#6e3e18" strokeWidth="2" />
      <path d="M16 18l4 12M22 17l4 14M28 18l3 11" stroke="#5a2e10" strokeWidth="2" />
    </g>
  ),
  shark_raw: (
    <g>
      <path d="M8 18c6-6 26-8 32 0 4 8-2 18-16 18S4 28 8 18z" fill="#d96a6a" stroke="#8a3434" strokeWidth="2" />
      <path d="M14 20c6 4 14 4 20 0" stroke="#f2b0b0" strokeWidth="3" fill="none" />
    </g>
  ),
  shark_cooked: (
    <g>
      <path d="M8 18c6-6 26-8 32 0 4 8-2 18-16 18S4 28 8 18z" fill="#9a5a2e" stroke="#5a2e12" strokeWidth="2" />
      <path d="M14 16l6 18M22 14l6 20M30 16l4 14" stroke="#4a220a" strokeWidth="2.4" />
    </g>
  ),
  bandage: (
    <g>
      <rect x="8" y="14" width="32" height="20" rx="8" fill="#9bb062" stroke="#5a6e2a" strokeWidth="2" />
      <path d="M24 18v12M18 24h12" stroke="#f4f0dc" strokeWidth="4" strokeLinecap="round" />
    </g>
  ),
  cup_empty: cupBody(null),
  cup_salt: cupBody("#4e9fa8", <path d="M20 26l2 2M27 24l2 2M24 32l2 2" stroke="#e8f4f4" strokeWidth="2" />),
  cup_fresh: cupBody("#5cc4f2", <path d="M24 24c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8z" fill="#e8f8ff" />),
  hook: (
    <g fill="none" strokeLinecap="round">
      <path d="M8 40L26 22" stroke="#2b7fd0" strokeWidth="5" />
      <circle cx="12" cy="36" r="6" stroke="#d6c08c" strokeWidth="3" />
      <path d="M26 22l6-6" stroke="#9aa0a6" strokeWidth="3" />
      <path d="M32 16c4-4 10-2 10 2s-4 4-6 2M32 16c-2-6 2-10 6-8M32 16c6 0 8 6 4 8" stroke="#c4cad0" strokeWidth="2.6" />
    </g>
  ),
  hammer: (
    <g>
      <path d="M12 42L28 18" stroke="#8a6440" strokeWidth="5" strokeLinecap="round" />
      <path d="M20 12l14 -4 6 10-14 4z" fill="#8b8780" stroke="#55524c" strokeWidth="2" />
      <path d="M24 20l4-1" stroke="#d6c08c" strokeWidth="3" />
    </g>
  ),
  axe: (
    <g>
      <path d="M14 42L30 10" stroke="#8a6440" strokeWidth="5" strokeLinecap="round" />
      <path d="M26 10c6-4 14-2 16 6-6 2-12 4-16 2z" fill="#8f8b84" stroke="#55524c" strokeWidth="2" />
      <path d="M27 14l4 2" stroke="#d6c08c" strokeWidth="3" />
    </g>
  ),
  rod: (
    <g fill="none" strokeLinecap="round">
      <path d="M8 42L40 6" stroke="#9a7a4e" strokeWidth="3.5" />
      <circle cx="14" cy="34" r="4" fill="#e0e3e6" stroke="#7a8288" strokeWidth="2" />
      <path d="M40 6c2 10 0 22-6 30" stroke="#e8e8e8" strokeWidth="1.5" />
      <circle cx="34" cy="38" r="3" fill="#e63b2e" />
    </g>
  ),
  spear: (
    <g strokeLinecap="round">
      <path d="M8 42L34 14" stroke="#a07c50" strokeWidth="4.5" />
      <path d="M32 10l10-4-4 10-6 2z" fill="#b8bec2" stroke="#6b7378" strokeWidth="2" />
      <path d="M30 18l4-4" stroke="#d6c08c" strokeWidth="4" />
    </g>
  ),
  chest: (
    <g>
      <rect x="6" y="18" width="36" height="22" rx="2" fill="#a9824f" stroke="#5e4224" strokeWidth="2" />
      <path d="M6 18c0-6 4-10 10-10h16c6 0 10 4 10 10z" fill="#8f6a3c" stroke="#5e4224" strokeWidth="2" />
      <rect x="21" y="20" width="6" height="7" rx="1" fill="#e2b84a" stroke="#7a5a1a" strokeWidth="1.5" />
      <path d="M12 10v30M36 10v30" stroke="#4e4a45" strokeWidth="2.5" />
    </g>
  ),
  purifier: (
    <g>
      <path d="M10 18h28l-4 14H14z" fill="#d9e6ea" stroke="#7a9aa4" strokeWidth="2" />
      <path d="M10 18L24 8l14 10" fill="#bfe6f2" stroke="#7a9aa4" strokeWidth="2" />
      <path d="M14 40c2-4 4-6 4-8M24 40c2-4 2-6 0-8M34 40c-2-4-4-6-4-8" stroke="#ff8a2a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M24 22c2 3 3 4 3 5a3 3 0 0 1-6 0c0-1 1-2 3-5z" fill="#5cc4f2" />
    </g>
  ),
  purifier2: (
    <g>
      <rect x="10" y="14" width="18" height="24" rx="4" fill="#aab3b8" stroke="#5f686d" strokeWidth="2" />
      <path d="M28 18h8v10" stroke="#b0b85a" strokeWidth="3.5" fill="none" />
      <rect x="32" y="28" width="8" height="12" rx="2" fill="#cfe9f3" stroke="#6a9aa8" strokeWidth="2" />
      <path d="M14 24h10" stroke="#e8eef0" strokeWidth="2" />
    </g>
  ),
  grill: (
    <g>
      <ellipse cx="24" cy="30" rx="18" ry="8" fill="#827e76" stroke="#4e4a44" strokeWidth="2" />
      <path d="M8 24h32M10 20h28" stroke="#3e3a36" strokeWidth="2.5" />
      <path d="M16 30c2-6 4-6 4-10M26 30c0-4 4-6 2-10" stroke="#ff8a2a" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
  ),
  grill2: (
    <g>
      <rect x="6" y="22" width="36" height="18" rx="2" fill="#8b857c" stroke="#4e4a44" strokeWidth="2" />
      <rect x="9" y="16" width="30" height="7" fill="#4a4643" />
      <path d="M12 19h24" stroke="#2f2c2a" strokeWidth="2" />
      <rect x="34" y="4" width="5" height="12" fill="#3e3a36" />
      <path d="M18 32c2-4 3-5 3-8M28 32c1-3 3-5 1-8" stroke="#ff8a2a" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
  ),
  smelter: (
    <g>
      <path d="M8 40c0-16 6-26 16-26s16 10 16 26z" fill="#a8826a" stroke="#5e4433" strokeWidth="2" />
      <rect x="20" y="6" width="8" height="10" fill="#7a6656" stroke="#5e4433" strokeWidth="2" />
      <path d="M18 40v-8a6 6 0 0 1 12 0v8z" fill="#1a0e08" />
      <path d="M22 38c1-3 2-4 2-6 1 2 2 3 2 6z" fill="#ff8a2a" />
    </g>
  ),
  net: (
    <g>
      <path d="M8 8v32M40 8v32" stroke="#7a6042" strokeWidth="4" />
      <path d="M8 10h32" stroke="#7a6042" strokeWidth="3" />
      <path d="M10 12l28 26M38 12L10 38M10 24l14 14 14-14M10 24l14-12 14 12" stroke="#e1d7b4" strokeWidth="1.8" fill="none" />
    </g>
  ),
  trap: (
    <g>
      <rect x="8" y="12" width="32" height="26" rx="3" fill="none" stroke="#7a6042" strokeWidth="3.5" />
      <path d="M14 12v26M20 12v26M26 12v26M32 12v26M8 22h32M8 30h32" stroke="#e1d7b4" strokeWidth="1.3" />
      <path d="M16 26c4-4 10-4 14 0-4 4-10 4-14 0z" fill="#a9c2da" />
    </g>
  ),
  sail: (
    <g>
      <path d="M24 4v40" stroke="#8a6a46" strokeWidth="3.5" />
      <path d="M8 10h32" stroke="#8a6a46" strokeWidth="3" />
      <path d="M10 12h28c2 10 0 20-4 24H14c-4-4-6-14-4-24z" fill="#efe3c6" stroke="#a89470" strokeWidth="2" />
      <path d="M16 18h8v8h-8z" fill="#c9b48d" />
    </g>
  ),
  anchor: (
    <g fill="none" strokeLinecap="round">
      <circle cx="24" cy="9" r="4" stroke="#55524c" strokeWidth="3" />
      <path d="M24 13v28M16 20h16" stroke="#6b6862" strokeWidth="4" />
      <path d="M8 30c2 8 10 12 16 12s14-4 16-12" stroke="#6b6862" strokeWidth="4" />
      <path d="M8 30l-2 4M40 30l2 4" stroke="#6b6862" strokeWidth="4" />
    </g>
  ),
  foundation: (
    <g>
      <path d="M4 26l20-10 20 10-20 10z" fill={wood} stroke={woodD} strokeWidth="2" />
      <path d="M9 23.5l20 10M14 21l20 10M19 18.5l20 10" stroke={woodD} strokeWidth="1.3" />
      <path d="M4 26v6l20 10v-6zM44 26v6L24 42v-6z" fill="#3b82c4" />
    </g>
  ),
  wall: (
    <g>
      <rect x="8" y="6" width="32" height="36" fill="#e9d6b2" stroke={woodD} strokeWidth="2" />
      <path d="M14 6v36M20 6v36M26 6v36M32 6v36" stroke={woodD} strokeWidth="1.4" />
      <path d="M8 16h32M8 32h32" stroke="#8a7050" strokeWidth="3" />
    </g>
  ),
  railing: (
    <g stroke={woodD} strokeWidth="3" strokeLinecap="round">
      <path d="M8 18v24M24 18v24M40 18v24" />
      <path d="M6 18h36M6 30h36" stroke="#c79a63" strokeWidth="4" />
    </g>
  ),
  window: (
    <g>
      <rect x="8" y="6" width="32" height="36" fill="#e9d6b2" stroke={woodD} strokeWidth="2" />
      <rect x="13" y="14" width="22" height="13" fill="#9fd6f0" stroke="#8a7050" strokeWidth="2.5" />
      <path d="M24 14v13" stroke="#8a7050" strokeWidth="2" />
    </g>
  ),
  door: (
    <g>
      <rect x="8" y="6" width="32" height="36" fill="#e9d6b2" stroke={woodD} strokeWidth="2" />
      <rect x="15" y="12" width="18" height="30" fill="#c79a63" stroke="#7a6042" strokeWidth="2" />
      <circle cx="29" cy="28" r="1.8" fill="#4a4540" />
    </g>
  ),
  stairs: <path d="M6 42h36V10h-8v8h-7v8h-7v8h-7v8z" fill="#e2c592" stroke={woodD} strokeWidth="2" strokeLinejoin="round" />,
  roof: (
    <g>
      <path d="M4 26L24 10l20 16z" fill="#b8a050" stroke="#7a6a2a" strokeWidth="2" />
      <path d="M10 22l4-3M16 22l5-4M24 22l3-4M30 22l2-3" stroke="#7a6a2a" strokeWidth="1.5" />
      <path d="M8 26v14M40 26v14" stroke={woodD} strokeWidth="3" />
    </g>
  ),
  /* UI */
  heart: <path d="M24 41S6 30 6 17a9 9 0 0 1 18-3 9 9 0 0 1 18 3c0 13-18 24-18 24z" fill="currentColor" />,
  hunger: (
    <g fill="currentColor">
      <path d="M30 6c6 0 12 6 12 12 0 8-8 12-14 10l-8 8a4 4 0 1 1-6 2 4 4 0 1 1 2-6l8-8c-2-6 0-18 6-18z" />
    </g>
  ),
  thirst: <path d="M24 5c8 11 13 18 13 25a13 13 0 0 1-26 0c0-7 5-14 13-25z" fill="currentColor" />,
  stamina: <path d="M27 4L10 27h12l-3 17 19-25H26z" fill="currentColor" />,
  oxygen: (
    <g fill="none" stroke="currentColor" strokeWidth="3.5">
      <circle cx="18" cy="30" r="9" />
      <circle cx="33" cy="16" r="6" />
      <circle cx="35" cy="34" r="3.5" />
    </g>
  ),
  fin: <path d="M6 38c10-2 16-12 18-30 6 10 12 22 18 30z" fill="currentColor" />,
  palmI: (
    <g fill="currentColor">
      <path d="M24 44c0-12 2-20 2-26" stroke="currentColor" strokeWidth="3.5" fill="none" />
      <path d="M26 18c-6-6-14-6-20-2 6 0 12 2 20 2zM26 18c4-8 12-10 18-8-6 2-12 6-18 8zM26 18c-2-6-6-10-12-12 4 4 8 8 12 12zM26 18c6 2 12 6 14 12-4-4-10-8-14-12z" />
    </g>
  ),
  rockyI: <path d="M4 40l10-18 6 6 8-18 16 30z" fill="currentColor" />,
  jungleI: (
    <g fill="currentColor">
      <circle cx="16" cy="20" r="10" />
      <circle cx="30" cy="16" r="11" />
      <circle cx="34" cy="28" r="8" />
      <rect x="21" y="26" width="5" height="18" />
    </g>
  ),
  raftI: (
    <g fill="currentColor">
      <path d="M4 30h40l-4 8H8z" />
      <path d="M24 4v24M24 6l14 16H24z" stroke="currentColor" strokeWidth="2.5" />
    </g>
  ),
  satchelI: (
    <g fill="currentColor">
      <rect x="8" y="16" width="32" height="24" rx="5" />
      <path d="M16 16a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="3.5" fill="none" />
    </g>
  ),
  sun: (
    <g fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <circle cx="24" cy="24" r="8" />
      <path d="M24 4v6M24 38v6M4 24h6M38 24h6M10 10l4 4M34 34l4 4M10 38l4-4M34 14l4-4" />
    </g>
  ),
  moon: <path d="M30 6a18 18 0 1 0 12 30A15 15 0 0 1 30 6z" fill="currentColor" />,
  book: (
    <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
      <path d="M6 10c6-2 12-2 18 2v28c-6-4-12-4-18-2zM42 10c-6-2-12-2-18 2v28c6-4 12-4 18-2z" />
    </g>
  ),
  check: <path d="M8 26l10 10L40 12" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />,
  lock: (
    <g fill="currentColor">
      <rect x="10" y="22" width="28" height="20" rx="4" />
      <path d="M16 22v-6a8 8 0 0 1 16 0v6" fill="none" stroke="currentColor" strokeWidth="4" />
    </g>
  ),
  craftI: (
    <g fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
      <path d="M10 38l16-16M22 10l16 16M30 6l12 12-6 6-12-12z" />
    </g>
  ),
  bag: (
    <g fill="currentColor">
      <path d="M10 18h28l-2 24H12z" />
      <path d="M17 18v-4a7 7 0 0 1 14 0v4" fill="none" stroke="currentColor" strokeWidth="3.5" />
    </g>
  ),
};

export function Icon({ id, size = 28, title }) {
  const g = ICONS[id];
  if (!g) return <W size={size} title={title}><circle cx="24" cy="24" r="14" fill="#8aa" /></W>;
  return <W size={size} title={title}>{g}</W>;
}
export const hasIcon = (id) => !!ICONS[id];
