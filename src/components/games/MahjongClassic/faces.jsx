/**
 * Original tile artwork for Mahjong Classic, drawn in a 60x80 SVG box:
 * dots (d1-d9), bamboo (b1-b9), symbols (s1-s9), winds (wE/wS/wW/wN),
 * dragons (rR/rG/rW), flowers (f1-f4) and seasons (x1-x4).
 */
import { memo } from "react";

const BLUE = "#1d5aa6", GREEN = "#24804a", RED = "#b8322a", INK = "#1d2a44";

// pip positions shared by dots and bamboo
const PIPS = {
  1: [[30, 40]],
  2: [[30, 22], [30, 58]],
  3: [[16, 18], [30, 40], [44, 62]],
  4: [[18, 22], [42, 22], [18, 58], [42, 58]],
  5: [[17, 18], [43, 18], [30, 40], [17, 62], [43, 62]],
  6: [[18, 16], [42, 16], [18, 40], [42, 40], [18, 64], [42, 64]],
  7: [[14, 13], [30, 21], [46, 29], [18, 50], [42, 50], [18, 68], [42, 68]],
  8: [[18, 12], [42, 12], [18, 31], [42, 31], [18, 49], [42, 49], [18, 68], [42, 68]],
  9: [[14, 16], [30, 16], [46, 16], [14, 40], [30, 40], [46, 40], [14, 64], [30, 64], [46, 64]],
};
const SIZE = { 1: 15, 2: 10, 3: 9, 4: 9.5, 5: 8.5, 6: 8.5, 7: 7, 8: 7.5, 9: 7 };
const PIP_COLORS = [BLUE, GREEN, RED];

function Dots({ n }) {
  const r = SIZE[n];
  return PIPS[n].map(([x, y], k) => {
    const c = n === 1 ? RED : PIP_COLORS[(k + n) % 3];
    return (
      <g key={k}>
        <circle cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth={r * 0.28} />
        <circle cx={x} cy={y} r={r * 0.5} fill={c} />
        <circle cx={x} cy={y} r={r * 0.18} fill="#fff8e6" />
        {n === 1 && [0, 45, 90, 135].map((a) => <line key={a} x1={x} y1={y - r * 0.95} x2={x} y2={y - r * 0.7} stroke={BLUE} strokeWidth="2" transform={`rotate(${a * 2} ${x} ${y})`} />)}
      </g>
    );
  });
}

function Stalk({ x, y, h, c }) {
  const w = h * 0.36;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={w / 2} fill={c} />
      <rect x={x - w / 2 - 0.8} y={y - 1.1} width={w + 1.6} height="2.2" rx="1" fill="#fff8e6" opacity=".85" />
      <line x1={x} y1={y - h / 2 + 2} x2={x} y2={y + h / 2 - 2} stroke="#fff8e6" strokeOpacity=".45" strokeWidth="1" />
    </g>
  );
}

function Bamboo({ n }) {
  if (n === 1) {
    // a single tall stalk with two leaves and a red bud
    return (
      <g>
        <Stalk x={30} y={44} h={50} c={GREEN} />
        <path d="M30 34C40 24 48 24 52 18 44 34 38 34 30 38Z" fill={GREEN} />
        <path d="M30 50C20 42 12 44 8 38 14 54 22 54 30 54Z" fill="#3a9a5c" />
        <circle cx="30" cy="14" r="6" fill={RED} />
        <circle cx="30" cy="14" r="2.2" fill="#fff8e6" />
      </g>
    );
  }
  const h = n <= 4 ? 26 : n <= 6 ? 21 : 17;
  return PIPS[n].map(([x, y], k) => <Stalk key={k} x={x} y={y} h={h} c={(n === 5 || n === 9) && k === Math.floor(n / 2) ? RED : k % 3 === 2 ? BLUE : GREEN} />);
}

function Symbols({ n }) {
  return (
    <g>
      <text x="30" y="36" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="34" fill={INK}>{n}</text>
      {/* red knot seal */}
      <g transform="translate(30 58)">
        <rect x="-11" y="-11" width="22" height="22" rx="3" transform="rotate(45)" fill="none" stroke={RED} strokeWidth="3" />
        <rect x="-5" y="-5" width="10" height="10" rx="1.5" transform="rotate(45)" fill={RED} />
        {[0, 90, 180, 270].map((a) => <circle key={a} cx="0" cy="-17" r="2" fill={RED} transform={`rotate(${a})`} />)}
      </g>
    </g>
  );
}

const WIND_ANGLE = { E: 90, S: 180, W: 270, N: 0 };
function Wind({ d }) {
  return (
    <g>
      <circle cx="30" cy="40" r="23" fill="none" stroke={INK} strokeOpacity=".22" strokeWidth="1.5" />
      <path d="M30 13 34 22H26Z" fill={RED} transform={`rotate(${WIND_ANGLE[d]} 30 40)`} />
      <text x="30" y="52" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="32" fill={INK}>{d}</text>
    </g>
  );
}

function Dragon({ c }) {
  if (c === "R")
    return (
      <g fill="none" stroke={RED} strokeLinecap="round">
        <path d="M30 14C46 14 50 32 40 40 30 48 16 42 20 32 24 24 34 28 32 34" strokeWidth="5" />
        <path d="M30 66C14 66 10 48 20 40" strokeWidth="5" />
        <circle cx="30" cy="40" r="25" strokeWidth="2" strokeOpacity=".5" />
      </g>
    );
  if (c === "G")
    return (
      <g>
        <path d="M30 12C48 26 48 50 30 68 12 50 12 26 30 12Z" fill={GREEN} />
        <path d="M30 18V64M30 32 40 24M30 44 20 36M30 54 40 46" stroke="#fff8e6" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    );
  return (
    <g fill="none" stroke={BLUE}>
      <rect x="10" y="12" width="40" height="56" rx="4" strokeWidth="4" />
      <rect x="17" y="19" width="26" height="42" rx="2" strokeWidth="1.6" strokeDasharray="4 3" />
    </g>
  );
}

const FLOWER_COLORS = ["#d94f70", "#8a5cc4", "#e08a1e", "#2f8fb0"];
function Flower({ n }) {
  const c = FLOWER_COLORS[n - 1];
  return (
    <g>
      <path d="M30 70C30 58 28 50 30 42" stroke={GREEN} strokeWidth="2.5" fill="none" />
      <path d="M30 60C22 56 18 58 14 54 20 50 26 52 30 58Z" fill={GREEN} />
      <g transform="translate(30 32)">
        {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="0" cy="-10" rx="7" ry="11" fill={c} opacity=".9" transform={`rotate(${a + n * 9})`} />)}
        <circle r="5" fill="#f3c33d" />
      </g>
      <text x="51" y="74" textAnchor="middle" fontFamily="Georgia, serif" fontSize="11" fontWeight="700" fill={c}>{n}</text>
    </g>
  );
}

function Season({ n }) {
  const art = [
    // spring: sprout
    <g key="1"><path d="M30 66V40" stroke={GREEN} strokeWidth="3" /><path d="M30 44C18 44 12 34 12 26 24 26 30 34 30 44ZM30 40C30 28 38 20 50 20 50 32 42 40 30 40Z" fill={GREEN} /></g>,
    // summer: sun
    <g key="2" transform="translate(30 40)"><circle r="11" fill="#e8a317" />{[...Array(8)].map((_, k) => <path key={k} d="M0 -16 3 -22H-3Z" fill="#e8a317" transform={`rotate(${k * 45})`} />)}</g>,
    // autumn: leaf
    <g key="3"><path d="M30 12 36 26 48 22 42 36 52 42 38 46 40 60 30 52 20 60 22 46 8 42 18 36 12 22 24 26Z" fill="#c4521f" /><path d="M30 28V70" stroke="#7a3412" strokeWidth="2" /></g>,
    // winter: snowflake
    <g key="4" transform="translate(30 40)" stroke={BLUE} strokeWidth="2.6" strokeLinecap="round">{[0, 60, 120].map((a) => <g key={a} transform={`rotate(${a})`}><path d="M0 -22V22" /><path d="M0 -14 -6 -20M0 -14 6 -20M0 14 -6 20M0 14 6 20" /></g>)}</g>,
  ][n - 1];
  return (
    <g>
      {art}
      <text x="51" y="74" textAnchor="middle" fontFamily="Georgia, serif" fontSize="11" fontWeight="700" fill={INK}>{n}</text>
    </g>
  );
}

export const faceName = (f) => {
  const n = f.slice(1);
  return { d: `${n} of Circles`, b: `${n} of Bamboo`, s: `${n} of Symbols`, w: `${{ E: "East", S: "South", W: "West", N: "North" }[n]} Wind`, r: `${{ R: "Red", G: "Green", W: "White" }[n]} Dragon`, f: `Flower ${n}`, x: `Season ${n}` }[f[0]];
};

export const TileFace = memo(function TileFace({ face }) {
  const k = face[0], v = face.slice(1), n = Number(v);
  return (
    <svg viewBox="0 0 60 80" className="mj-art" aria-hidden="true">
      {k === "d" && <Dots n={n} />}
      {k === "b" && <Bamboo n={n} />}
      {k === "s" && <Symbols n={n} />}
      {k === "w" && <Wind d={v} />}
      {k === "r" && <Dragon c={v} />}
      {k === "f" && <Flower n={n} />}
      {k === "x" && <Season n={n} />}
    </svg>
  );
});
