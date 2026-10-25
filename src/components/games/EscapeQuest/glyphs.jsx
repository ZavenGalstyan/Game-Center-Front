/**
 * Escape Quest — the shared symbol alphabet. The same glyphs appear painted
 * on room props (clues), in the clue reader and on puzzle dials, so a player
 * can always match what they saw to what they enter.
 */
export const COLORS = {
  red: "#ec4f4f",
  orange: "#f59a3a",
  yellow: "#f7d23e",
  green: "#47c06a",
  blue: "#3f8ef0",
  purple: "#a364e8",
  pink: "#f27ab8",
  cyan: "#3fd0e0",
  white: "#f6f3ea",
  black: "#2b2033",
  brown: "#a8714a",
};

export const COLOR_NAMES = {
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
  pink: "Pink",
  cyan: "Cyan",
  white: "White",
  black: "Black",
  brown: "Brown",
};

const P = {
  star: "M0 -40 L11 -13 L40 -12 L17 6 L25 36 L0 19 L-25 36 L-17 6 L-40 -12 L-11 -13 Z",
  heart: "M0 34 L-32 2 Q-44 -14 -32 -28 Q-16 -40 0 -22 Q16 -40 32 -28 Q44 -14 32 2 Z",
  moon: "M10 -38 Q-34 -32 -34 2 Q-30 38 12 38 Q-16 22 -16 0 Q-16 -24 10 -38 Z",
  triangle: "M0 -36 L38 32 H-38 Z",
  diamond: "M0 -40 L32 0 L0 40 L-32 0 Z",
  square: "M-30 -30 H30 V30 H-30 Z",
  drop: "M0 -40 Q30 0 28 14 Q24 38 0 38 Q-24 38 -28 14 Q-30 0 0 -40 Z",
  leaf: "M-30 30 Q-34 -26 30 -32 Q36 28 -30 30 Z",
  bolt: "M8 -40 L-24 6 H-2 L-10 40 L24 -8 H2 Z",
  cross: "M-12 -36 H12 V-12 H36 V12 H12 V36 H-12 V12 H-36 V-12 H-12 Z",
  crown: "M-36 26 L-32 -24 L-16 0 L0 -32 L16 0 L32 -24 L36 26 Z",
  spiral: "",
  sun: "",
  circle: "",
  flower: "",
  eye: "",
  anchor: "",
  note: "",
  fish: "M-36 0 Q-10 -30 18 0 Q-10 30 -36 0 Z M16 0 L38 -18 V18 Z",
  key: "",
  wave: "",
  tree: "M0 -40 L30 6 H12 L32 30 H-32 L-12 6 H-30 Z",
  house: "M0 -36 L36 -4 H26 V34 H-26 V-4 H-36 Z",
  bell: "M0 -36 Q26 -36 26 6 L34 22 H-34 L-26 6 Q-26 -36 0 -36 Z",
};

export const GLYPHS = Object.keys(P);

/** One glyph centred on (x,y), `size` = full width. */
export function Glyph({ name, x = 0, y = 0, size = 40, c = "#2b2033", stroke = "#2b2033", sw = 0 }) {
  const k = size / 80;
  const common = { fill: c, stroke, strokeWidth: sw ? sw / k : 0, strokeLinejoin: "round", strokeLinecap: "round" };
  let body;
  switch (name) {
    case "circle":
      body = <circle r="34" {...common} />;
      break;
    case "sun":
      body = (
        <g {...common}>
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x="-5" y="-40" width="10" height="16" rx="4" transform={`rotate(${i * 45})`} />
          ))}
          <circle r="20" />
        </g>
      );
      break;
    case "spiral":
      body = (
        <path
          d="M0 0 m0 -4 a4 4 0 1 1 -4 4 a10 10 0 1 1 10 10 a16 16 0 1 1 -16 -16 a24 24 0 1 1 24 24"
          fill="none"
          stroke={c}
          strokeWidth={8}
          strokeLinecap="round"
        />
      );
      break;
    case "flower":
      body = (
        <g {...common}>
          {Array.from({ length: 5 }, (_, i) => (
            <ellipse key={i} cx="0" cy="-20" rx="13" ry="18" transform={`rotate(${i * 72})`} />
          ))}
          <circle r="11" fill="#f7d23e" />
        </g>
      );
      break;
    case "eye":
      body = (
        <g>
          <path d="M-40 0 Q0 -36 40 0 Q0 36 -40 0 Z" {...common} />
          <circle r="13" fill="#fff" />
          <circle r="6" fill="#2b2033" />
        </g>
      );
      break;
    case "anchor":
      body = (
        <g fill="none" stroke={c} strokeWidth="8" strokeLinecap="round">
          <circle cy="-28" r="8" />
          <path d="M0 -20 V34 M-16 -8 H16 M-30 10 Q-26 34 0 34 Q26 34 30 10" />
        </g>
      );
      break;
    case "note":
      body = (
        <g {...common}>
          <ellipse cx="-12" cy="24" rx="14" ry="10" transform="rotate(-20 -12 24)" />
          <rect x="-2" y="-36" width="7" height="60" />
          <path d="M2 -36 Q30 -28 24 -6 Q20 -20 2 -20 Z" />
        </g>
      );
      break;
    case "key":
      body = (
        <g {...common}>
          <circle cx="-20" cy="0" r="16" />
          <circle cx="-20" cy="0" r="6" fill="#fff" />
          <path d="M-6 -5 H36 V5 H30 V16 H22 V5 H14 V14 H6 V5 H-6 Z" />
        </g>
      );
      break;
    case "wave":
      body = <path d="M-40 6 Q-30 -14 -20 6 T0 6 T20 6 T40 6" fill="none" stroke={c} strokeWidth="9" strokeLinecap="round" />;
      break;
    default:
      body = <path d={P[name] || P.star} {...common} />;
  }
  return <g transform={`translate(${x} ${y}) scale(${k})`}>{body}</g>;
}

const ARROW = "M0 -34 L30 0 H12 V32 H-12 V0 H-30 Z";
const ROT = { U: 0, R: 90, D: 180, L: 270 };
export function Arrow({ dir, x = 0, y = 0, size = 40, c = "#2b2033" }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 80}) rotate(${ROT[dir] ?? 0})`}>
      <path d={ARROW} fill={c} stroke="#2b2033" strokeWidth="4" strokeLinejoin="round" />
    </g>
  );
}
