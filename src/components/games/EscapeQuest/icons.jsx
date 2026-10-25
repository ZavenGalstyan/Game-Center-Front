/**
 * Escape Quest — item icons. Every icon draws inside a 0..100 box with the
 * shared cartoon outline; `c` is the main tint from the item table. Used in
 * the inventory, the pickup hotspots in rooms, and the "found it" pop-up.
 */
export const OL = "#2b2033";
const S = { stroke: OL, strokeWidth: 4, strokeLinejoin: "round", strokeLinecap: "round" };

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
export { shade };

const ICONS = {
  key: (c) => (
    <g {...S}>
      <circle cx="30" cy="50" r="18" fill={c} />
      <circle cx="30" cy="50" r="7" fill="#fff8" />
      <path d="M46 46 H88 V54 H82 V64 H74 V54 H66 V62 H58 V54 H46 Z" fill={c} />
      <path d="M22 40 Q28 36 34 38" stroke="#fff" strokeWidth="3" fill="none" />
    </g>
  ),
  card: (c) => (
    <g {...S}>
      <rect x="14" y="26" width="72" height="48" rx="8" fill={c} />
      <rect x="22" y="36" width="18" height="14" rx="3" fill="#f5d36a" />
      <path d="M22 62 H70" stroke="#fff" strokeWidth="5" />
      <circle cx="72" cy="40" r="5" fill="#fff" stroke="none" />
    </g>
  ),
  coin: (c) => (
    <g {...S}>
      <circle cx="50" cy="50" r="30" fill={c} />
      <circle cx="50" cy="50" r="21" fill={shade(c, -0.08)} />
      <text x="50" y="61" textAnchor="middle" fontSize="30" fontWeight="900" fill={shade(c, 0.25)} stroke="none">$</text>
    </g>
  ),
  screwdriver: (c) => (
    <g {...S}>
      <rect x="14" y="40" width="34" height="20" rx="8" fill={c} />
      <path d="M22 44 V56 M30 44 V56 M38 44 V56" stroke={shade(c, -0.25)} strokeWidth="3" />
      <path d="M48 47 H80 L88 50 L80 53 H48 Z" fill="#c9d3dd" />
    </g>
  ),
  battery: (c) => (
    <g {...S}>
      <rect x="18" y="34" width="60" height="32" rx="6" fill={c} />
      <rect x="78" y="42" width="8" height="16" rx="2" fill="#c9d3dd" />
      <rect x="18" y="34" width="20" height="32" rx="6" fill="#3b3f46" />
      <path d="M52 42 V58 M44 50 H60" stroke="#fff" strokeWidth="4" />
    </g>
  ),
  flashlight: (c) => (
    <g {...S}>
      <path d="M14 42 H54 V58 H14 Z" fill="#4a5563" />
      <path d="M54 36 L74 30 V70 L54 64 Z" fill={c} />
      <ellipse cx="74" cy="50" rx="6" ry="20" fill="#fff6c8" />
      <circle cx="30" cy="50" r="4" fill="#e8504f" />
    </g>
  ),
  hammer: (c) => (
    <g {...S}>
      <rect x="44" y="34" width="12" height="54" rx="4" fill={c} />
      <path d="M22 18 H72 Q80 18 80 26 V36 H22 Z" fill="#9aa7b4" />
    </g>
  ),
  crowbar: (c) => (
    <g {...S} fill="none">
      <path d="M26 84 L68 28 Q74 18 84 22 Q90 26 84 32" stroke={OL} strokeWidth="14" />
      <path d="M26 84 L68 28 Q74 18 84 22 Q90 26 84 32" stroke={c} strokeWidth="7" />
    </g>
  ),
  scissors: (c) => (
    <g {...S}>
      <path d="M50 52 L84 22 M50 52 L84 82" stroke={OL} strokeWidth="9" />
      <path d="M50 52 L84 22 M50 52 L84 82" stroke="#c9d3dd" strokeWidth="4" />
      <circle cx="28" cy="34" r="13" fill="none" stroke={c} strokeWidth="7" />
      <circle cx="28" cy="70" r="13" fill="none" stroke={c} strokeWidth="7" />
    </g>
  ),
  matches: (c) => (
    <g {...S}>
      <rect x="20" y="40" width="60" height="36" rx="5" fill={c} />
      <rect x="20" y="40" width="60" height="10" fill={shade(c, -0.2)} />
      <path d="M40 40 V20 M52 40 V24 M62 40 V18" stroke="#e8d9b0" strokeWidth="5" />
      <circle cx="40" cy="18" r="5" fill="#e8504f" />
      <circle cx="52" cy="22" r="5" fill="#e8504f" />
      <circle cx="62" cy="16" r="5" fill="#e8504f" />
    </g>
  ),
  candle: (c) => (
    <g {...S}>
      <rect x="38" y="34" width="24" height="50" rx="4" fill={c} />
      <path d="M50 34 V22" />
      <ellipse cx="50" cy="86" rx="22" ry="6" fill="#c9a14a" />
    </g>
  ),
  candleLit: (c) => (
    <g {...S}>
      <rect x="38" y="38" width="24" height="46" rx="4" fill={c} />
      <path d="M50 12 Q60 26 50 34 Q40 26 50 12 Z" fill="#ffb02e" />
      <path d="M50 20 Q55 28 50 32 Q45 28 50 20 Z" fill="#fff3a0" stroke="none" />
      <ellipse cx="50" cy="86" rx="22" ry="6" fill="#c9a14a" />
    </g>
  ),
  magnet: (c) => (
    <g {...S}>
      <path d="M22 22 H42 V56 Q42 66 50 66 Q58 66 58 56 V22 H78 V56 Q78 86 50 86 Q22 86 22 56 Z" fill={c} />
      <rect x="22" y="22" width="20" height="12" fill="#c9d3dd" />
      <rect x="58" y="22" width="20" height="12" fill="#c9d3dd" />
    </g>
  ),
  rope: (c) => (
    <g {...S} fill="none">
      <ellipse cx="50" cy="52" rx="32" ry="26" stroke={OL} strokeWidth="13" />
      <ellipse cx="50" cy="52" rx="32" ry="26" stroke={c} strokeWidth="7" />
      <ellipse cx="50" cy="52" rx="18" ry="14" stroke={OL} strokeWidth="11" />
      <ellipse cx="50" cy="52" rx="18" ry="14" stroke={shade(c, -0.1)} strokeWidth="5" />
    </g>
  ),
  hook: (c) => (
    <g {...S} fill="none">
      <path d="M56 14 V58 Q56 80 38 80 Q22 80 22 64" stroke={OL} strokeWidth="13" />
      <path d="M56 14 V58 Q56 80 38 80 Q22 80 22 64" stroke={c} strokeWidth="6" />
      <circle cx="56" cy="14" r="7" fill={c} />
    </g>
  ),
  stick: (c) => (
    <g {...S}>
      <path d="M14 82 L84 18" stroke={OL} strokeWidth="14" />
      <path d="M14 82 L84 18" stroke={c} strokeWidth="7" />
    </g>
  ),
  hookStick: (c) => (
    <g {...S} fill="none">
      <path d="M14 86 L70 30" stroke={OL} strokeWidth="13" />
      <path d="M14 86 L70 30" stroke={c} strokeWidth="6" />
      <path d="M70 30 L80 20 Q90 12 90 26 Q90 34 82 34" stroke={OL} strokeWidth="10" />
      <path d="M70 30 L80 20 Q90 12 90 26 Q90 34 82 34" stroke="#9aa7b4" strokeWidth="4" />
    </g>
  ),
  magnetString: (c) => (
    <g {...S}>
      <path d="M50 6 V44" stroke="#e8d9b0" strokeWidth="4" />
      <path d="M30 44 H44 V66 Q44 72 50 72 Q56 72 56 66 V44 H70 V66 Q70 90 50 90 Q30 90 30 66 Z" fill={c} />
    </g>
  ),
  bulb: (c) => (
    <g {...S}>
      <path d="M50 14 Q76 14 76 40 Q76 54 62 64 V72 H38 V64 Q24 54 24 40 Q24 14 50 14 Z" fill={c} />
      <rect x="38" y="72" width="24" height="14" rx="3" fill="#9aa7b4" />
      <path d="M42 50 L50 40 L58 50" fill="none" stroke="#c9a14a" strokeWidth="3" />
    </g>
  ),
  fuse: (c) => (
    <g {...S}>
      <rect x="20" y="38" width="60" height="24" rx="10" fill="#e6f4fa" />
      <rect x="12" y="40" width="14" height="20" rx="3" fill="#c9d3dd" />
      <rect x="74" y="40" width="14" height="20" rx="3" fill="#c9d3dd" />
      <path d="M28 50 H72" stroke={c} strokeWidth="4" />
    </g>
  ),
  gear: (c) => (
    <g {...S}>
      <path
        d="M44 12 H56 L58 24 L68 28 L78 20 L86 28 L78 38 L82 48 L94 50 V56 L82 58 L78 68 L86 78 L78 86 L68 78 L58 82 L56 94 H44 L42 82 L32 78 L22 86 L14 78 L22 68 L18 58 L6 56 V50 L18 48 L22 38 L14 28 L22 20 L32 28 L42 24 Z"
        transform="translate(0 -3)"
        fill={c}
      />
      <circle cx="50" cy="50" r="12" fill="#fff" />
    </g>
  ),
  wrench: (c) => (
    <g {...S}>
      <path d="M22 84 L58 48 L52 42 L16 78 Z" fill={c} />
      <path d="M58 20 Q76 12 86 26 L74 34 L76 44 L86 42 Q84 60 66 58 L56 48 Q48 34 58 20 Z" fill={c} />
    </g>
  ),
  chip: (c) => (
    <g {...S}>
      <path d="M30 22 V12 M42 22 V12 M54 22 V12 M66 22 V12 M30 78 V88 M42 78 V88 M54 78 V88 M66 78 V88" stroke="#c9a14a" />
      <rect x="20" y="22" width="60" height="56" rx="6" fill="#2f3a46" />
      <rect x="34" y="36" width="32" height="28" rx="4" fill={c} />
    </g>
  ),
  tape: (c) => (
    <g {...S}>
      <circle cx="50" cy="50" r="32" fill={c} />
      <circle cx="50" cy="50" r="14" fill="#fff" />
      <path d="M78 64 L90 70 L88 82 L72 74" fill={c} />
    </g>
  ),
  bucket: (c) => (
    <g {...S}>
      <path d="M26 20 Q50 -4 74 20" fill="none" />
      <path d="M20 30 H80 L72 86 H28 Z" fill={c} />
      <ellipse cx="50" cy="30" rx="30" ry="8" fill={shade(c, -0.25)} />
    </g>
  ),
  bucketWater: (c) => (
    <g {...S}>
      <path d="M26 20 Q50 -4 74 20" fill="none" />
      <path d="M20 30 H80 L72 86 H28 Z" fill={c} />
      <ellipse cx="50" cy="30" rx="30" ry="8" fill="#4fb8e8" />
      <path d="M40 30 Q44 26 50 30" stroke="#fff" strokeWidth="3" fill="none" />
    </g>
  ),
  seed: (c) => (
    <g {...S}>
      <path d="M26 30 H74 L80 86 H20 Z" fill="#e8d9b0" />
      <path d="M26 30 L34 18 H66 L74 30" fill="#d9c49a" />
      <ellipse cx="42" cy="58" rx="6" ry="9" fill={c} />
      <ellipse cx="58" cy="64" rx="6" ry="9" fill={c} />
      <path d="M50 40 Q56 30 64 36 Q58 46 50 40 Z" fill="#4fc06a" />
    </g>
  ),
  watering: (c) => (
    <g {...S}>
      <path d="M24 40 H66 V82 H24 Z" fill={c} />
      <path d="M66 50 L90 30 L94 36 L70 64" fill={c} />
      <path d="M30 40 Q44 20 60 40" fill="none" />
    </g>
  ),
  fish: (c) => (
    <g {...S}>
      <path d="M14 50 Q40 20 70 50 Q40 80 14 50 Z" fill={c} />
      <path d="M68 50 L90 32 V68 Z" fill={shade(c, -0.15)} />
      <circle cx="30" cy="46" r="4" fill={OL} />
    </g>
  ),
  bone: (c) => (
    <g {...S}>
      <path d="M30 42 H70 Q72 30 82 32 Q92 36 86 46 Q94 54 84 60 Q74 64 70 56 H30 Q28 66 18 62 Q8 58 14 50 Q8 40 18 36 Q28 34 30 42 Z" fill={c} />
    </g>
  ),
  gem: (c) => (
    <g {...S}>
      <path d="M30 22 H70 L86 42 L50 86 L14 42 Z" fill={c} />
      <path d="M14 42 H86 M30 22 L40 42 L50 86 L60 42 L70 22" fill="none" stroke={shade(c, -0.3)} strokeWidth="3" />
      <path d="M34 28 L40 38" stroke="#fff" strokeWidth="4" />
    </g>
  ),
  star: (c) => (
    <g {...S}>
      <path d="M50 10 L61 37 L90 38 L67 56 L76 85 L50 68 L24 85 L33 56 L10 38 L39 37 Z" fill={c} />
      <path d="M40 40 L46 38" stroke="#fff" strokeWidth="4" />
    </g>
  ),
  shell: (c) => (
    <g {...S}>
      <path d="M50 84 L16 40 Q50 0 84 40 Z" fill={c} />
      <path d="M50 84 L30 32 M50 84 L50 22 M50 84 L70 32" fill="none" stroke={shade(c, -0.2)} strokeWidth="3" />
    </g>
  ),
  lens: (c) => (
    <g {...S}>
      <path d="M62 62 L86 86" stroke={OL} strokeWidth="14" />
      <path d="M62 62 L86 86" stroke="#8a5a3b" strokeWidth="7" />
      <circle cx="42" cy="42" r="28" fill={c} />
      <path d="M28 34 Q32 24 42 22" stroke="#fff" strokeWidth="4" fill="none" />
    </g>
  ),
  glasses: (c) => (
    <g {...S}>
      <path d="M42 50 Q50 44 58 50" fill="none" />
      <circle cx="28" cy="52" r="16" fill={c} fillOpacity="0.75" />
      <circle cx="72" cy="52" r="16" fill={c} fillOpacity="0.75" />
      <path d="M12 46 L4 40 M88 46 L96 40" />
    </g>
  ),
  bottle: (c) => (
    <g {...S}>
      <path d="M42 12 H58 V32 Q76 40 76 60 V84 H24 V60 Q24 40 42 32 Z" fill={c} fillOpacity="0.8" />
      <rect x="40" y="8" width="20" height="8" rx="2" fill="#a8754a" />
    </g>
  ),
  potion: (c) => (
    <g {...S}>
      <path d="M42 14 H58 V34 Q80 44 80 64 Q80 88 50 88 Q20 88 20 64 Q20 44 42 34 Z" fill="#e6f4fa" />
      <path d="M23 62 Q50 54 77 62 Q78 86 50 86 Q22 86 23 62 Z" fill={c} stroke="none" />
      <path d="M42 14 H58 V34 Q80 44 80 64 Q80 88 50 88 Q20 88 20 64 Q20 44 42 34 Z" fill="none" />
      <rect x="38" y="8" width="24" height="9" rx="3" fill="#a8754a" />
      <circle cx="38" cy="70" r="4" fill="#fff8" stroke="none" />
    </g>
  ),
  feather: (c) => (
    <g {...S}>
      <path d="M22 86 Q30 30 82 14 Q78 66 22 86 Z" fill={c} />
      <path d="M22 86 L66 32" fill="none" />
    </g>
  ),
  crown: (c) => (
    <g {...S}>
      <path d="M16 74 L20 30 L36 50 L50 22 L64 50 L80 30 L84 74 Z" fill={c} />
      <rect x="16" y="72" width="68" height="12" rx="3" fill={shade(c, -0.12)} />
      <circle cx="50" cy="56" r="6" fill="#e8504f" />
    </g>
  ),
  ring: (c) => (
    <g {...S}>
      <circle cx="50" cy="60" r="24" fill="none" stroke={OL} strokeWidth="14" />
      <circle cx="50" cy="60" r="24" fill="none" stroke={c} strokeWidth="7" />
      <path d="M40 30 L50 18 L60 30 L50 40 Z" fill="#9fd8f0" />
    </g>
  ),
  apple: (c) => (
    <g {...S}>
      <path d="M50 32 Q74 20 82 46 Q86 80 60 86 Q50 82 40 86 Q14 80 18 46 Q26 20 50 32 Z" fill={c} />
      <path d="M50 32 Q50 20 56 12" fill="none" />
      <path d="M56 22 Q70 12 74 22 Q62 30 56 22 Z" fill="#4fc06a" />
    </g>
  ),
  carrot: (c) => (
    <g {...S}>
      <path d="M30 30 Q46 22 58 34 L28 90 Z" fill={c} transform="rotate(-20 44 56)" />
      <path d="M44 22 L36 6 M48 22 L52 4 M52 24 L66 10" stroke="#4fc06a" strokeWidth="6" />
    </g>
  ),
  cheese: (c) => (
    <g {...S}>
      <path d="M14 70 L84 40 V78 H14 Z" fill={c} />
      <path d="M14 70 L84 40 L66 28 Z" fill={shade(c, 0.15)} />
      <circle cx="40" cy="70" r="5" fill={shade(c, -0.2)} />
      <circle cx="66" cy="62" r="6" fill={shade(c, -0.2)} />
    </g>
  ),
  oil: (c) => (
    <g {...S}>
      <path d="M22 46 H62 V86 H22 Z" fill={c} />
      <path d="M62 56 L90 34 L92 40 L66 66" fill={c} />
      <path d="M30 46 V36 H54 V46" fill="#3b3f46" />
    </g>
  ),
  glove: (c) => (
    <g {...S}>
      <path d="M28 88 V48 Q28 40 34 40 V22 Q34 16 40 16 Q46 16 46 22 V14 Q46 8 52 8 Q58 8 58 14 V20 Q58 14 64 14 Q70 14 70 22 V48 L82 38 Q90 36 88 46 L72 78 V88 Z" fill={c} />
    </g>
  ),
  knife: (c) => (
    <g {...S}>
      <path d="M12 60 Q40 36 70 46 L70 56 Z" fill={c} />
      <rect x="68" y="44" width="24" height="14" rx="6" fill="#8a5a3b" />
    </g>
  ),
  mapPiece: (c) => (
    <g {...S}>
      <path d="M18 22 L62 16 L58 40 L82 44 L78 84 L22 80 Z" fill={c} />
      <path d="M32 40 Q44 50 40 62 T56 70" fill="none" stroke="#a8754a" strokeDasharray="5 5" strokeWidth="3" />
      <path d="M58 64 L66 72 M66 64 L58 72" stroke="#e8504f" strokeWidth="4" />
    </g>
  ),
  map: (c) => (
    <g {...S}>
      <path d="M10 22 L36 14 L64 22 L90 14 V78 L64 86 L36 78 L10 86 Z" fill={c} />
      <path d="M36 14 V78 M64 22 V86" fill="none" stroke={shade(c, -0.2)} strokeWidth="3" />
      <path d="M22 60 Q36 40 50 54 T72 40" fill="none" stroke="#a8754a" strokeDasharray="5 5" strokeWidth="3" />
      <path d="M68 34 L78 44 M78 34 L68 44" stroke="#e8504f" strokeWidth="5" />
    </g>
  ),
  wand: (c) => (
    <g {...S}>
      <path d="M20 84 L66 38" stroke={OL} strokeWidth="12" />
      <path d="M20 84 L66 38" stroke={c} strokeWidth="6" />
      <path d="M74 12 L78 24 L90 26 L80 34 L84 46 L74 38 L64 44 L66 32 L58 24 L70 22 Z" fill="#f5c542" />
    </g>
  ),
  orb: (c) => (
    <g {...S}>
      <path d="M30 80 H70 L76 90 H24 Z" fill="#a8754a" />
      <circle cx="50" cy="48" r="32" fill={c} />
      <path d="M32 40 Q36 26 50 22" stroke="#fff" strokeWidth="5" fill="none" />
    </g>
  ),
  shovel: (c) => (
    <g {...S}>
      <path d="M48 10 H58 V58 H48 Z" fill={c} />
      <path d="M34 54 H72 L70 76 Q53 96 36 76 Z" fill="#9aa7b4" />
      <rect x="40" y="6" width="26" height="8" rx="3" fill={c} />
    </g>
  ),
  leverHandle: (c) => (
    <g {...S}>
      <rect x="44" y="30" width="12" height="60" rx="4" fill="#9aa7b4" />
      <circle cx="50" cy="24" r="15" fill={c} />
    </g>
  ),
  handle: (c) => (
    <g {...S}>
      <rect x="18" y="44" width="58" height="14" rx="7" fill={c} />
      <rect x="66" y="30" width="18" height="42" rx="6" fill={shade(c, -0.15)} />
    </g>
  ),
  note: (c) => (
    <g {...S}>
      <path d="M22 12 H66 L80 26 V88 H22 Z" fill={c} />
      <path d="M66 12 V26 H80" fill="none" />
      <path d="M32 40 H70 M32 52 H70 M32 64 H58" stroke="#8a7a6a" strokeWidth="3" />
    </g>
  ),
  photo: (c) => (
    <g {...S}>
      <rect x="14" y="20" width="72" height="60" rx="4" fill={c} />
      <rect x="22" y="28" width="56" height="40" fill="#8fd0f0" />
      <path d="M22 68 L40 46 L52 58 L62 48 L78 68 Z" fill="#4fc06a" />
      <circle cx="66" cy="38" r="5" fill="#f5c542" />
    </g>
  ),
  ticket: (c) => (
    <g {...S}>
      <path d="M12 30 H88 V44 Q80 50 88 56 V70 H12 V56 Q20 50 12 44 Z" fill={c} />
      <path d="M64 30 V70" strokeDasharray="5 5" strokeWidth="3" />
      <path d="M24 46 H52 M24 56 H44" stroke="#fff" strokeWidth="4" />
    </g>
  ),
  remote: (c) => (
    <g {...S}>
      <rect x="32" y="10" width="36" height="80" rx="10" fill={c} />
      <circle cx="50" cy="26" r="7" fill="#e8504f" />
      <circle cx="42" cy="46" r="4" fill="#c9d3dd" />
      <circle cx="58" cy="46" r="4" fill="#c9d3dd" />
      <circle cx="42" cy="60" r="4" fill="#c9d3dd" />
      <circle cx="58" cy="60" r="4" fill="#c9d3dd" />
    </g>
  ),
  disk: (c) => (
    <g {...S}>
      <rect x="16" y="16" width="68" height="68" rx="6" fill={c} />
      <rect x="30" y="16" width="40" height="24" fill="#c9d3dd" />
      <rect x="26" y="54" width="48" height="30" fill="#fff" />
    </g>
  ),
  fossil: (c) => (
    <g {...S}>
      <circle cx="50" cy="50" r="36" fill={c} />
      <path d="M50 50 m0 -4 a4 4 0 1 1 -4 4 a10 10 0 1 1 10 10 a16 16 0 1 1 -16 -16 a22 22 0 1 1 22 22" fill="none" stroke={shade(c, -0.3)} strokeWidth="4" />
    </g>
  ),
  coconut: (c) => (
    <g {...S}>
      <circle cx="50" cy="54" r="32" fill={c} />
      <circle cx="40" cy="44" r="4" fill={OL} />
      <circle cx="54" cy="40" r="4" fill={OL} />
      <circle cx="50" cy="54" r="4" fill={OL} />
    </g>
  ),
  torch: (c) => (
    <g {...S}>
      <path d="M44 34 H56 L54 90 H46 Z" fill={c} />
      <path d="M38 24 H62 L58 36 H42 Z" fill="#6a6f78" />
    </g>
  ),
  torchLit: (c) => (
    <g {...S}>
      <path d="M44 44 H56 L54 94 H46 Z" fill={c} />
      <path d="M38 36 H62 L58 46 H42 Z" fill="#6a6f78" />
      <path d="M50 4 Q68 22 58 36 H42 Q32 22 50 4 Z" fill="#ff8a2e" />
      <path d="M50 16 Q58 26 54 34 H46 Q42 26 50 16 Z" fill="#ffe36a" stroke="none" />
    </g>
  ),
  plank: (c) => (
    <g {...S}>
      <rect x="8" y="38" width="84" height="24" rx="3" fill={c} />
      <path d="M20 46 Q34 42 46 48 M56 54 Q70 50 82 54" fill="none" stroke={shade(c, -0.25)} strokeWidth="3" />
      <circle cx="16" cy="50" r="3" fill={OL} />
      <circle cx="84" cy="50" r="3" fill={OL} />
    </g>
  ),
  net: (c) => (
    <g {...S}>
      <path d="M50 54 L84 92" stroke={OL} strokeWidth="11" />
      <path d="M50 54 L84 92" stroke="#a8754a" strokeWidth="5" />
      <circle cx="36" cy="36" r="26" fill="#fff4" stroke={c} strokeWidth="6" />
      <path d="M18 26 L54 46 M18 46 L54 26 M36 10 V62 M10 36 H62" stroke={c} strokeWidth="2" />
    </g>
  ),
  ice: (c) => (
    <g {...S}>
      <path d="M22 30 L50 18 L80 30 V70 L50 84 L22 70 Z" fill={c} />
      <path d="M22 30 L50 42 L80 30 M50 42 V84" fill="none" stroke="#fff" strokeWidth="3" />
    </g>
  ),
  cup: (c) => (
    <g {...S}>
      <path d="M22 30 H72 L66 84 H28 Z" fill={c} />
      <path d="M72 42 Q90 44 86 58 Q82 70 68 68" fill="none" />
      <ellipse cx="47" cy="30" rx="25" ry="6" fill={shade(c, -0.12)} />
    </g>
  ),
  pipe: (c) => (
    <g {...S}>
      <path d="M14 40 H56 Q70 40 70 54 V88 H54 V58 Q54 56 52 56 H14 Z" fill={c} />
      <rect x="8" y="36" width="10" height="24" rx="2" fill={shade(c, -0.2)} />
      <rect x="50" y="82" width="24" height="10" rx="2" fill={shade(c, -0.2)} />
    </g>
  ),
  book: (c) => (
    <g {...S}>
      <path d="M20 16 H76 V84 H20 Z" fill={c} />
      <path d="M28 16 V84" stroke={shade(c, -0.3)} />
      <path d="M48 34 L52 44 L62 44 L54 50 L58 60 L48 54 L40 60 L42 50 L34 44 L44 44 Z" fill="#f5c542" strokeWidth="2" />
    </g>
  ),
  scroll: (c) => (
    <g {...S}>
      <rect x="22" y="20" width="56" height="60" fill={c} />
      <rect x="14" y="12" width="72" height="12" rx="6" fill={shade(c, -0.15)} />
      <rect x="14" y="76" width="72" height="12" rx="6" fill={shade(c, -0.15)} />
      <path d="M32 38 H68 M32 50 H68 M32 62 H56" stroke="#a8754a" strokeWidth="3" />
    </g>
  ),
  mushroom: (c) => (
    <g {...S}>
      <path d="M40 56 H60 L62 88 H38 Z" fill="#f3ead6" />
      <path d="M12 58 Q14 16 50 16 Q86 16 88 58 Z" fill={c} />
      <circle cx="34" cy="38" r="6" fill="#fff" />
      <circle cx="60" cy="30" r="7" fill="#fff" />
      <circle cx="70" cy="48" r="4" fill="#fff" />
    </g>
  ),
  egg: (c) => (
    <g {...S}>
      <path d="M50 12 Q80 12 80 56 Q80 88 50 88 Q20 88 20 56 Q20 12 50 12 Z" fill={c} />
      <path d="M32 44 Q36 30 46 24" stroke="#fff" strokeWidth="5" fill="none" />
    </g>
  ),
  box: (c) => (
    <g {...S}>
      <rect x="18" y="30" width="64" height="52" rx="4" fill={c || "#c9925a"} />
    </g>
  ),
};

export function ItemIcon({ icon, c = "#c9925a", size = 100, x = 0, y = 0 }) {
  const draw = ICONS[icon] || ICONS.box;
  return <g transform={`translate(${x} ${y}) scale(${size / 100})`}>{draw(c)}</g>;
}

export function ItemSvg({ icon, c, className }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <ItemIcon icon={icon} c={c} />
    </svg>
  );
}
