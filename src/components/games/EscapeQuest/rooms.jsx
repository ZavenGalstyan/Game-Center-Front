/**
 * Escape Quest — room backgrounds. A theme is pure data (wall/floor colours
 * and patterns); <Room> paints it into the 1000×560 scene. Props and
 * hotspots are drawn on top by the scene component.
 */
import { shade } from "./icons.jsx";

export const W = 1000;
export const H = 560;

const T = (wall, pattern, floor, ftype, extra = {}) => ({ wall, pattern, floor, ftype, floorY: 400, trim: "#f6efe2", ...extra });

export const THEMES = {
  study: T(["#f3c9a0", "#ebb98c"], "stripes", ["#b9804f", "#a46f42"], "planks"),
  kitchen: T(["#bfe6d8", "#aedccb"], "tiles", ["#f2e6cf", "#e3d2b4"], "checker"),
  bedroom: T(["#c9c4f2", "#b9b2ea"], "dots", ["#a46f42", "#93613a"], "planks"),
  living: T(["#f7d9a8", "#f0ca90"], "diamonds", ["#c98a54", "#b77a46"], "planks", { rug: true }),
  bathroom: T(["#bfe2f5", "#a8d6f0"], "tiles", ["#f6f6f6", "#dfe6ec"], "checker"),
  attic: T(["#d8b48a", "#c9a276"], "boards", ["#9d6c40", "#8c5e36"], "planks", { roof: true }),
  garage: T(["#c9cfd6", "#b8bfc8"], "bricks", ["#8a9099", "#7b8189"], "concrete"),
  kids: T(["#ffd2e3", "#ffc2d8"], "stars", ["#7fcfa8", "#6cc097"], "carpet"),
  garden: T(["#9fdcf5", "#c8ecfa"], "sky", ["#6cc46e", "#5ab35c"], "grass", { outdoor: true, floorY: 380 }),
  library: T(["#a8564a", "#9a4a40"], "diamonds", ["#7a4a2c", "#6a3f25"], "planks", { trim: "#d9a54a" }),

  gallery: T(["#f4eee2", "#ebe3d2"], "plain", ["#b9804f", "#a46f42"], "parquet", { trim: "#c9a14a" }),
  dino: T(["#cfe3c0", "#bcd6aa"], "plain", ["#d9c49a", "#c9b285"], "stone"),
  egypt: T(["#e8c98a", "#d9b874"], "blocks", ["#d9b06a", "#c99e58"], "sand", { trim: "#3f8ef0" }),
  spacehall: T(["#2b2f5a", "#232750"], "starsDark", ["#3b4070", "#333866"], "metal"),
  studio: T(["#fff4d6", "#fbe9bf"], "splats", ["#c9a27a", "#b8916a"], "planks"),
  vault: T(["#6f7f92", "#62728a"], "panels", ["#4a5563", "#3f4955"], "metal", { trim: "#f5c542" }),
  clocktower: T(["#b8a48a", "#a8947a"], "blocks", ["#7a5a3c", "#6a4c30"], "planks", { trim: "#d9a54a" }),
  observatory: T(["#283070", "#222a64"], "starsDark", ["#5a4a7a", "#4f416c"], "parquet", { trim: "#d9a54a" }),
  music: T(["#e86b6b", "#d95c5c"], "stripes", ["#7a4a2c", "#6a3f25"], "planks", { trim: "#f5c542" }),
  archive: T(["#cdbb9a", "#c0ad8a"], "boards", ["#8c6a48", "#7d5d3e"], "planks"),

  beach: T(["#8fd8ff", "#c8f0ff"], "sky", ["#f6dc9a", "#eccb80"], "sand", { outdoor: true, sea: true, floorY: 390 }),
  hut: T(["#d9b46a", "#c9a45a"], "bamboo", ["#c9925a", "#b8814a"], "planks"),
  cabin: T(["#9a6a40", "#8a5c36"], "boards", ["#7a5030", "#6a4428"], "planks", { porthole: true }),
  cave: T(["#6a6f8a", "#5c6180"], "rock", ["#4f5470", "#454a64"], "stone", { dark: true }),
  temple: T(["#9ab88a", "#8aa87a"], "blocks", ["#7a8a6a", "#6c7c5c"], "stone", { vines: true }),
  lighthouse: T(["#f6f0e6", "#ebe2d2"], "stripesRed", ["#9aa7b4", "#8a97a4"], "stone", { trim: "#ec4f4f" }),
  tiki: T(["#f59a3a", "#e88a2a"], "bamboo", ["#a8714a", "#98613a"], "planks", { vines: true }),
  captain: T(["#2f5a8a", "#284e7a"], "boards", ["#7a5030", "#6a4428"], "planks", { porthole: true, trim: "#d9a54a" }),
  jungle: T(["#9be0a6", "#b8ecc0"], "sky", ["#5ab35c", "#4aa04c"], "grass", { outdoor: true, floorY: 390, vines: true }),
  volcano: T(["#7a3a3a", "#6a3030"], "rock", ["#4a2a2a", "#3f2424"], "stone", { dark: true, lava: true }),

  lab: T(["#e6f4fa", "#d8eef8"], "tiles", ["#cfd8e0", "#c0cad3"], "checker", { trim: "#3fd0e0" }),
  greenhouse: T(["#c8f0d4", "#b8e8c6"], "glass", ["#a8714a", "#98613a"], "planks", { vines: true }),
  workshop: T(["#9aa7b4", "#8a97a4"], "panels", ["#5d6b7a", "#525f6d"], "metal", { trim: "#f7d23e" }),
  control: T(["#2f3a4a", "#283240"], "panels", ["#3b4655", "#343e4c"], "metal", { trim: "#3fd0e0", dark: true }),
  server: T(["#1f2a3a", "#1a2432"], "grid", ["#2b3646", "#253040"], "metal", { trim: "#39e08a", dark: true }),
  station: T(["#cdd6e0", "#bfc9d4"], "panels", ["#7b8794", "#6f7b88"], "metal", { trim: "#f59a3a", porthole: true }),
  hangar: T(["#8a97a4", "#7b8794"], "panels", ["#5d6b7a", "#525f6d"], "metal", { trim: "#f7d23e" }),
  cryo: T(["#bfe8f5", "#aee0f0"], "panels", ["#e6f4fa", "#d8eef8"], "metal", { trim: "#3f8ef0" }),
  reactor: T(["#3a4a3a", "#324032"], "grid", ["#2b362b", "#253025"], "metal", { trim: "#39e08a", dark: true }),
  moonbase: T(["#1b1640", "#241e52"], "starsDark", ["#b8bcc8", "#a8acb8"], "moon", { outdoor: true, floorY: 390 }),

  potion: T(["#7a6a9a", "#6c5c8c"], "blocks", ["#5a4a6a", "#4f405e"], "stone", { trim: "#a364e8" }),
  throne: T(["#b84a5a", "#a8404f"], "diamonds", ["#e6dcc8", "#d6ccb8"], "checker", { trim: "#f5c542" }),
  dungeon: T(["#5a5a6a", "#50505e"], "blocks", ["#3f3f4a", "#383842"], "stone", { dark: true }),
  tower: T(["#4a5a9a", "#40508a"], "starsDark", ["#7a5a3c", "#6a4c30"], "planks", { trim: "#a364e8" }),
  spellbook: T(["#5a3a6a", "#50325e"], "diamonds", ["#6a4a2c", "#5a3f25"], "planks", { trim: "#f5c542" }),
  castlekitchen: T(["#c9b89a", "#bcab8a"], "blocks", ["#8a7a6a", "#7a6a5a"], "stone"),
  dragon: T(["#8a3a2a", "#7a3022"], "rock", ["#5a2a1a", "#4f2416"], "stone", { dark: true, lava: true }),
  enchanted: T(["#2a2a6a", "#3a3a8a"], "skyNight", ["#3a7a5a", "#326c4f"], "grass", { outdoor: true, floorY: 390 }),
  crystal: T(["#5a4a9a", "#4f408a"], "rock", ["#40357a", "#382e6c"], "stone", { crystals: true }),
  portal: T(["#3a2a5a", "#30224e"], "starsDark", ["#5a4a7a", "#4f416c"], "checker", { trim: "#3fd0e0" }),
};

function WallPattern({ t, view }) {
  const [a, b] = t.wall;
  const fy = t.floorY;
  const items = [];
  const off = view * 37;
  switch (t.pattern) {
    case "stripes":
    case "stripesRed":
      for (let x = -off % 80; x < W; x += 80) items.push(<rect key={x} x={x} y="0" width="40" height={fy} fill={t.pattern === "stripesRed" ? "#f6c2c2" : b} />);
      break;
    case "dots":
      for (let y = 30; y < fy; y += 60) for (let x = ((y / 60) % 2) * 30 + 20; x < W; x += 60) items.push(<circle key={`${x}-${y}`} cx={x} cy={y} r="7" fill={b} />);
      break;
    case "diamonds":
      for (let y = 0; y < fy; y += 70) for (let x = ((y / 70) % 2) * 45; x < W + 45; x += 90) items.push(<path key={`${x}-${y}`} d={`M${x} ${y} l22 35 l-22 35 l-22 -35 Z`} fill={b} />);
      break;
    case "tiles":
      for (let y = 0; y < fy; y += 50) items.push(<path key={`h${y}`} d={`M0 ${y} H${W}`} stroke={b} strokeWidth="4" />);
      for (let x = 0; x < W; x += 50) items.push(<path key={`v${x}`} d={`M${x} 0 V${fy}`} stroke={b} strokeWidth="4" />);
      break;
    case "boards":
      for (let x = -off % 70; x < W; x += 70) items.push(<g key={x}><path d={`M${x} 0 V${fy}`} stroke={shade(a, -0.15)} strokeWidth="4" /><circle cx={x + 35} cy={60 + ((x * 7) % 200)} r="4" fill={shade(a, -0.18)} /></g>);
      break;
    case "bricks":
    case "blocks": {
      const bh = t.pattern === "bricks" ? 32 : 60;
      const bw = t.pattern === "bricks" ? 70 : 120;
      for (let r = 0, y = 0; y < fy; y += bh, r++)
        for (let x = (r % 2) * (bw / 2) - bw; x < W; x += bw) items.push(<rect key={`${x}-${y}`} x={x + 2} y={y + 2} width={bw - 4} height={bh - 4} rx="4" fill={(r * 3 + x) % 7 === 0 ? b : shade(a, 0.03)} stroke={shade(a, -0.12)} strokeWidth="2" />);
      break;
    }
    case "panels":
      for (let x = 0; x < W; x += 125)
        for (let y = 0; y < fy; y += 135) items.push(<g key={`${x}-${y}`}><rect x={x + 5} y={y + 5} width="115" height="125" rx="6" fill={b} stroke={shade(a, -0.18)} strokeWidth="3" /><circle cx={x + 14} cy={y + 14} r="3" fill={shade(a, -0.25)} /><circle cx={x + 111} cy={y + 14} r="3" fill={shade(a, -0.25)} /></g>);
      break;
    case "grid":
      for (let y = 0; y < fy; y += 40) items.push(<path key={`h${y}`} d={`M0 ${y} H${W}`} stroke={shade(a, 0.08)} strokeWidth="2" />);
      for (let x = 0; x < W; x += 40) items.push(<path key={`v${x}`} d={`M${x} 0 V${fy}`} stroke={shade(a, 0.08)} strokeWidth="2" />);
      break;
    case "stars":
      for (let y = 40; y < fy; y += 80) for (let x = ((y / 80) % 2) * 50 + 30; x < W; x += 100) items.push(<path key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(0.35)`} d="M0 -40 L11 -13 L40 -12 L17 6 L25 36 L0 19 L-25 36 L-17 6 L-40 -12 L-11 -13 Z" fill={b} />);
      break;
    case "starsDark":
      for (let i = 0; i < 70; i++) items.push(<circle key={i} cx={(i * 137 + off) % W} cy={(i * 71) % fy} r={1 + (i % 3)} fill="#fff" opacity={0.3 + (i % 4) * 0.15} />);
      break;
    case "splats":
      ["#ec4f4f", "#3f8ef0", "#47c06a", "#f7d23e", "#a364e8"].forEach((c, i) => items.push(<circle key={i} cx={120 + i * 190} cy={60 + (i % 2) * 260} r={20 + (i % 3) * 8} fill={c} opacity="0.25" />));
      break;
    case "bamboo":
      for (let x = -off % 46; x < W; x += 46) items.push(<g key={x}><rect x={x} y="0" width="42" height={fy} fill={(x / 46) % 2 ? a : b} stroke={shade(a, -0.2)} strokeWidth="2" />{[90, 220, 330].map((y) => <path key={y} d={`M${x} ${y + (x % 30)} h42`} stroke={shade(a, -0.25)} strokeWidth="4" />)}</g>);
      break;
    case "rock":
      for (let i = 0; i < 26; i++) items.push(<ellipse key={i} cx={(i * 173 + off) % W} cy={(i * 97) % fy} rx={40 + (i % 4) * 14} ry={22 + (i % 3) * 10} fill={i % 2 ? b : shade(a, -0.06)} />);
      break;
    case "glass":
      for (let x = 0; x < W; x += 125) items.push(<g key={x}><rect x={x + 4} y="4" width="117" height={fy - 8} fill="#e8fff0" opacity="0.6" stroke="#fff" strokeWidth="6" /><path d={`M${x + 20} 40 l40 -30 M${x + 20} 80 l70 -55`} stroke="#fff" strokeWidth="5" opacity="0.7" /></g>);
      break;
    case "sky":
    case "skyNight":
      items.push(<rect key="sky" width={W} height={fy} fill={`url(#eq-sky-${t.pattern})`} />);
      if (t.pattern === "sky") {
        items.push(<circle key="sun" cx={860 - off} cy="80" r="44" fill="#ffe36a" />);
        [[150, 90], [480, 60], [700, 130]].forEach(([x, y], i) => items.push(<g key={`c${i}`} fill="#fff"><ellipse cx={x + off} cy={y} rx="56" ry="20" /><ellipse cx={x + 26 + off} cy={y - 14} rx="30" ry="20" /></g>));
      } else {
        items.push(<circle key="moon" cx="840" cy="90" r="38" fill="#f7e9a0" />);
        for (let i = 0; i < 50; i++) items.push(<circle key={i} cx={(i * 137) % W} cy={(i * 53) % (fy - 60)} r={1 + (i % 2)} fill="#fff" opacity="0.8" />);
      }
      break;
    default:
  }
  return <g>{items}</g>;
}

function Floor({ t }) {
  const [a, b] = t.floor;
  const fy = t.floorY;
  const items = [];
  const fh = H - fy;
  switch (t.ftype) {
    case "planks":
    case "parquet":
      for (let i = 0; i < 4; i++) {
        const y = fy + (fh * (i * i + i)) / 20;
        items.push(<path key={`r${i}`} d={`M0 ${y} H${W}`} stroke={b} strokeWidth="3" />);
      }
      for (let x = -400; x < W + 400; x += 90) items.push(<path key={x} d={`M${W / 2 + (x - W / 2) * 0.55} ${fy} L${x} ${H}`} stroke={b} strokeWidth="3" />);
      break;
    case "checker": {
      const rows = 5;
      for (let r = 0; r < rows; r++) {
        const y0 = fy + (fh * r) / rows;
        const y1 = fy + (fh * (r + 1)) / rows;
        const s0 = 0.55 + (0.45 * r) / rows;
        const s1 = 0.55 + (0.45 * (r + 1)) / rows;
        for (let c = -8; c < 8; c++) {
          if ((r + c) % 2 === 0) continue;
          const x = (cx, s) => W / 2 + cx * 80 * s * 1.6;
          items.push(<path key={`${r}-${c}`} d={`M${x(c, s0)} ${y0} L${x(c + 1, s0)} ${y0} L${x(c + 1, s1)} ${y1} L${x(c, s1)} ${y1} Z`} fill={b} />);
        }
      }
      break;
    }
    case "carpet":
      for (let i = 0; i < 40; i++) items.push(<circle key={i} cx={(i * 113) % W} cy={fy + 10 + ((i * 37) % (fh - 10))} r="3" fill={b} />);
      break;
    case "sand":
      for (let i = 0; i < 30; i++) items.push(<path key={i} d={`M${(i * 131) % W} ${fy + 14 + ((i * 41) % (fh - 20))} q10 -6 20 0`} stroke={b} strokeWidth="3" fill="none" />);
      break;
    case "grass":
      for (let i = 0; i < 60; i++) {
        const x = (i * 97) % W;
        const y = fy + 8 + ((i * 29) % (fh - 8));
        items.push(<path key={i} d={`M${x} ${y} l-4 -12 M${x} ${y} l2 -14 M${x} ${y} l7 -10`} stroke={b} strokeWidth="3" strokeLinecap="round" />);
      }
      break;
    case "stone":
      for (let r = 0, y = fy; y < H; y += 40, r++) for (let x = (r % 2) * 50 - 100; x < W; x += 100) items.push(<rect key={`${x}-${y}`} x={x + 3} y={y + 3} width="94" height="34" rx="8" fill={(x + r) % 3 ? a : b} stroke={shade(a, -0.15)} strokeWidth="2" />);
      break;
    case "metal":
      for (let x = 0; x < W; x += 60) items.push(<path key={x} d={`M${W / 2 + (x - W / 2) * 0.6} ${fy} L${x} ${H}`} stroke={b} strokeWidth="3" />);
      for (let y = fy + 30; y < H; y += 40) items.push(<path key={`y${y}`} d={`M0 ${y} H${W}`} stroke={b} strokeWidth="3" />);
      break;
    case "concrete":
      for (let i = 0; i < 18; i++) items.push(<circle key={i} cx={(i * 157) % W} cy={fy + 20 + ((i * 53) % (fh - 30))} r={2 + (i % 3)} fill={b} />);
      break;
    case "moon":
      for (let i = 0; i < 10; i++) items.push(<ellipse key={i} cx={(i * 211) % W} cy={fy + 30 + ((i * 47) % (fh - 50))} rx={30 + (i % 3) * 10} ry={8 + (i % 2) * 4} fill={b} stroke={shade(b, -0.1)} strokeWidth="2" />);
      break;
    default:
  }
  return (
    <g>
      <rect y={fy} width={W} height={fh} fill={a} />
      {items}
    </g>
  );
}

export function SceneDefs() {
  return (
    <defs>
      <radialGradient id="eq-doorglow" cx="50%" cy="60%" r="60%">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.6" stopColor="#fff3b0" />
        <stop offset="1" stopColor="#ffd36a" />
      </radialGradient>
      <radialGradient id="eq-lampglow">
        <stop offset="0" stopColor="#fff3a0" stopOpacity="0.55" />
        <stop offset="1" stopColor="#fff3a0" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="eq-sky-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#6cc8f5" />
        <stop offset="1" stopColor="#d6f3ff" />
      </linearGradient>
      <linearGradient id="eq-sky-skyNight" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#141a4a" />
        <stop offset="1" stopColor="#4a3a8a" />
      </linearGradient>
      <radialGradient id="eq-vignette" cx="50%" cy="45%" r="75%">
        <stop offset="0.6" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.35" />
      </radialGradient>
      <radialGradient id="eq-portal">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.4" stopColor="#9fe8ff" />
        <stop offset="1" stopColor="#a364e8" />
      </radialGradient>
      <filter id="eq-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="5" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

export function Room({ theme, view = 0 }) {
  const t = THEMES[theme] || THEMES.study;
  const fy = t.floorY;
  return (
    <g>
      <rect width={W} height={fy} fill={t.wall[0]} />
      <WallPattern t={t} view={view} />
      {t.roof && (
        <g>
          <path d={`M0 0 L240 0 L0 200 Z`} fill={shade(t.wall[0], -0.25)} />
          <path d={`M${W} 0 L${W - 240} 0 L${W} 200 Z`} fill={shade(t.wall[0], -0.25)} />
          <path d="M0 200 L240 0 M1000 200 L760 0" stroke={shade(t.wall[0], -0.4)} strokeWidth="12" />
        </g>
      )}
      {t.sea && (
        <g>
          <rect y={fy - 70} width={W} height="70" fill="#3f9ef0" />
          <path d={`M0 ${fy - 70} Q125 ${fy - 82} 250 ${fy - 70} T500 ${fy - 70} T750 ${fy - 70} T1000 ${fy - 70}`} fill="#7fc8ff" />
          {[120, 420, 780].map((x) => (
            <path key={x} d={`M${x} ${fy - 40} q12 -8 24 0`} stroke="#fff" strokeWidth="3" fill="none" />
          ))}
        </g>
      )}
      {t.vines &&
        [80, 330, 620, 900].map((x, i) => (
          <g key={x}>
            <path d={`M${x} 0 Q${x + 20} 60 ${x - 10} ${110 + i * 15} Q${x + 15} ${150 + i * 10} ${x + 5} ${190 + i * 12}`} stroke="#2f8a40" strokeWidth="6" fill="none" />
            {[40, 90, 150].map((y) => (
              <ellipse key={y} cx={x + (y % 20) - 4} cy={y + i * 8} rx="12" ry="7" fill="#47c06a" stroke="#2b2033" strokeWidth="2" transform={`rotate(${y % 60 - 30} ${x} ${y})`} />
            ))}
          </g>
        ))}
      {t.crystals &&
        [[60, 120], [920, 80], [480, 30], [250, 300], [780, 300]].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y + 50} L${x - 14} ${y + 10} L${x} ${y - 20} L${x + 14} ${y + 10} Z`} fill={["#9fd8f0", "#d8b8ff", "#f27ab8"][i % 3]} stroke="#2b2033" strokeWidth="3" opacity="0.85" />
        ))}
      <Floor t={t} />
      {t.lava && <path d={`M0 ${H} V${H - 30} Q200 ${H - 50} 400 ${H - 28} T800 ${H - 34} T1000 ${H - 26} V${H} Z`} fill="#ff7a2e" opacity="0.85" />}
      {!t.outdoor && (
        <g>
          <rect y={fy - 14} width={W} height="16" fill={t.trim} stroke="#2b2033" strokeWidth="3" />
          <rect y="0" width={W} height="12" fill={t.trim} stroke="#2b2033" strokeWidth="3" />
        </g>
      )}
      {t.outdoor && <path d={`M0 ${fy} Q250 ${fy - 14} 500 ${fy} T1000 ${fy}`} fill="none" stroke={shade(t.floor[0], -0.15)} strokeWidth="5" />}
    </g>
  );
}

export function RoomShade({ theme }) {
  const t = THEMES[theme] || THEMES.study;
  return (
    <g pointerEvents="none">
      <rect width={W} height={H} fill="url(#eq-vignette)" />
      {t.dark && <rect width={W} height={H} fill="#0a0820" opacity="0.18" />}
    </g>
  );
}
