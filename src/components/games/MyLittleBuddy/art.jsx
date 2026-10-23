/**
 * My Little Buddy — all original SVG art: the buddy (a round "sprout-mochi"
 * creature), food, hats, glasses, decorations and UI icons. The buddy is drawn
 * in a 200×200 box; rooms in a 1600×900 box (see rooms.jsx).
 */
import { COLORS } from "./data.js";

const INK = "#2d2340";

/* ---------------- food (40×40) ---------------- */
const FOOD_ART = {
  apple: <>
    <path d="M20 13C12 8 4 14 6 24 8 34 16 37 20 34 24 37 32 34 34 24 36 14 28 8 20 13Z" fill="#ff5a5a" />
    <path d="M20 13Q20 7 23 4" stroke="#7a4a2a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <ellipse cx="26" cy="8" rx="5" ry="2.5" fill="#5bc35b" transform="rotate(-30 26 8)" />
    <ellipse cx="12" cy="20" rx="2.5" ry="5" fill="#fff" opacity=".5" />
  </>,
  carrot: <>
    <path d="M27 14Q30 4 34 6M28 15Q36 10 37 14M26 13Q24 5 28 3" stroke="#4caf50" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M7 35Q9 30 24 13Q31 11 29 18Q12 33 7 35Z" fill="#ff9a2e" />
    <path d="M14 26l4 2M19 20l3 2" stroke="#e07a12" strokeWidth="2" strokeLinecap="round" />
  </>,
  cookie: <>
    <circle cx="20" cy="20" r="15" fill="#e2a65b" />
    <circle cx="20" cy="20" r="15" fill="none" stroke="#c98a40" strokeWidth="2" />
    {[[14, 14], [24, 12], [26, 23], [15, 25], [20, 19]].map(([x, y]) => <circle key={x * y} cx={x} cy={y} r="2.4" fill="#6b3e1e" />)}
  </>,
  sandwich: <>
    <rect x="5" y="9" width="30" height="8" rx="4" fill="#f2c46b" />
    <path d="M4 18q3 3 6 0t6 0 6 0 6 0 7 0v3H4z" fill="#6fd36f" />
    <rect x="5" y="21" width="30" height="4" fill="#ff5a5a" />
    <rect x="5" y="25" width="30" height="3" fill="#ffd84a" />
    <rect x="5" y="28" width="30" height="7" rx="3.5" fill="#f2c46b" />
  </>,
  cupcake: <>
    <path d="M10 22H30L27 36H13Z" fill="#ff8fb8" />
    <path d="M15 22l1 14M20 22v14M25 22l-1 14" stroke="#e5689a" strokeWidth="1.5" />
    <path d="M8 23Q8 14 14 14Q16 6 22 9Q30 8 31 16Q34 18 32 23Z" fill="#fff0f6" />
    <circle cx="21" cy="7" r="3.5" fill="#e53950" />
    {[[13, 18, "#7ad3ff"], [24, 15, "#ffd84a"], [19, 20, "#6fd36f"]].map(([x, y, c]) => <rect key={x} x={x} y={y} width="3" height="1.4" rx=".7" fill={c} />)}
  </>,
  pizza: <>
    <path d="M6 9Q20 3 34 9L20 37Z" fill="#ffcf5a" />
    <path d="M6 9Q20 3 34 9" stroke="#d98c3a" strokeWidth="5" fill="none" strokeLinecap="round" />
    {[[15, 14], [24, 15], [20, 24]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.2" fill="#e0473c" />)}
  </>,
  icecream: <>
    <path d="M12 20H28L20 38Z" fill="#e8b166" />
    <path d="M14 23l9 8M18 21l7 6M26 23l-9 8" stroke="#c98a40" strokeWidth="1.2" />
    <circle cx="14.5" cy="17" r="6.5" fill="#ff9ac1" />
    <circle cx="25.5" cy="17" r="6.5" fill="#fff3c4" />
    <circle cx="20" cy="10" r="6.5" fill="#a8e6cf" />
  </>,
  sushi: <>
    <rect x="7" y="17" width="26" height="15" rx="6" fill="#fff" stroke="#e6e6e6" />
    <rect x="16" y="17" width="8" height="15" fill="#2d3a2a" />
    <path d="M6 19Q20 6 34 19Q20 23 6 19Z" fill="#ff8c5a" />
    <path d="M13 15l3 5M20 12l1 8M27 15l-2 5" stroke="#fff" strokeWidth="1.5" opacity=".7" />
  </>,
};
export function FoodArt({ id, className }) {
  return <svg viewBox="0 0 40 40" className={className} aria-hidden="true">{FOOD_ART[id]}</svg>;
}

/* ---------------- hats & glasses (buddy space) ---------------- */
const flower = (x, y, c, k) => (
  <g key={k} transform={`translate(${x} ${y})`}>
    {[0, 72, 144, 216, 288].map((a) => <circle key={a} cx="0" cy="-6" r="5.5" fill={c} transform={`rotate(${a})`} />)}
    <circle r="4" fill="#ffd84a" />
  </g>
);
const HATS = {
  party: <>
    <path d="M100 8L74 62Q100 70 126 62Z" fill="#ff6b9a" />
    {[[96, 30], [108, 46], [88, 52], [103, 18]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.5" fill="#ffe27a" />)}
    <path d="M74 62Q100 70 126 62" stroke="#fff" strokeWidth="4" fill="none" />
    <circle cx="100" cy="8" r="7" fill="#7ad3ff" />
  </>,
  beanie: <>
    <path d="M62 66Q62 22 100 22Q138 22 138 66Z" fill="#5b8def" />
    <path d="M80 30v32M100 24v38M120 30v32" stroke="#4a78d6" strokeWidth="4" />
    <path d="M58 58Q100 70 142 58L142 70Q100 82 58 70Z" fill="#3f6fd0" />
    <circle cx="100" cy="20" r="9" fill="#ff6b6b" />
  </>,
  cap: <>
    <path d="M64 64Q64 28 100 28Q136 28 136 64Z" fill="#ff5a5a" />
    <path d="M100 28v36" stroke="#e04848" strokeWidth="3" />
    <path d="M120 58Q160 54 174 64Q150 74 120 68Z" fill="#d63b3b" />
    <circle cx="100" cy="28" r="4" fill="#d63b3b" />
  </>,
  flowers: <>
    <path d="M58 70Q100 40 142 70" stroke="#5bc35b" strokeWidth="5" fill="none" />
    {[[62, 66, "#ff8fb8"], [78, 55, "#fff"], [94, 50, "#ffd84a"], [110, 50, "#ff8fb8"], [126, 55, "#fff"], [140, 66, "#c6a8ff"]].map(([x, y, c], i) => flower(x, y, c, i))}
  </>,
  tophat: <>
    <rect x="72" y="12" width="56" height="50" rx="5" fill={INK} />
    <rect x="72" y="46" width="56" height="9" fill="#e5486b" />
    <ellipse cx="100" cy="62" rx="46" ry="8" fill={INK} />
    <path d="M80 18v24" stroke="#fff" strokeWidth="3" opacity=".25" strokeLinecap="round" />
  </>,
  crown: <>
    <path d="M64 64V26L82 44L100 16L118 44L136 26V64Z" fill="#ffcf3f" stroke="#e0a800" strokeWidth="3" strokeLinejoin="round" />
    {[[64, 26], [100, 16], [136, 26]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="4.5" fill="#ffe27a" stroke="#e0a800" strokeWidth="2" />)}
    <circle cx="100" cy="50" r="6" fill="#e5486b" />
    <circle cx="79" cy="54" r="4" fill="#4fc3f7" />
    <circle cx="121" cy="54" r="4" fill="#4fc3f7" />
  </>,
};
const heart = (cx, cy) => `M${cx} ${cy + 16}C${cx - 30} ${cy - 2} ${cx - 16} ${cy - 24} ${cx} ${cy - 10}C${cx + 16} ${cy - 24} ${cx + 30} ${cy - 2} ${cx} ${cy + 16}Z`;
const star = (cx, cy, R, r) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2, rad = i % 2 ? r : R;
    return `${(cx + Math.cos(a) * rad).toFixed(1)},${(cy + Math.sin(a) * rad).toFixed(1)}`;
  }).join(" ");
const GLASSES = {
  round: <>
    <circle cx="76" cy="106" r="19" fill="#fff" fillOpacity=".18" stroke={INK} strokeWidth="4" />
    <circle cx="124" cy="106" r="19" fill="#fff" fillOpacity=".18" stroke={INK} strokeWidth="4" />
    <path d="M95 104Q100 99 105 104M57 103L40 96M143 103L160 96" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
  </>,
  hearts: <>
    <path d={heart(76, 106)} fill="#ff5082" fillOpacity=".5" stroke="#e5486b" strokeWidth="3.5" />
    <path d={heart(124, 106)} fill="#ff5082" fillOpacity=".5" stroke="#e5486b" strokeWidth="3.5" />
    <path d="M96 100Q100 96 104 100" stroke="#e5486b" strokeWidth="3.5" fill="none" />
  </>,
  stars: <>
    <polygon points={star(76, 106, 25, 12)} fill="#ffcf3f" fillOpacity=".5" stroke="#f2a900" strokeWidth="3.5" strokeLinejoin="round" />
    <polygon points={star(124, 106, 25, 12)} fill="#ffcf3f" fillOpacity=".5" stroke="#f2a900" strokeWidth="3.5" strokeLinejoin="round" />
    <path d="M98 102H102" stroke="#f2a900" strokeWidth="4" />
  </>,
  shades: <>
    <rect x="53" y="92" width="45" height="28" rx="11" fill="#1f1a2e" />
    <rect x="102" y="92" width="45" height="28" rx="11" fill="#1f1a2e" />
    <path d="M96 100H104M53 100L40 95M147 100L160 95" stroke="#1f1a2e" strokeWidth="4" strokeLinecap="round" />
    <path d="M60 99l10-4M109 99l10-4" stroke="#fff" strokeWidth="3" opacity=".55" strokeLinecap="round" />
  </>,
};

/* ---------------- the buddy ---------------- */
const DIRT = [[70, 150, 9], [134, 152, 8], [116, 76, 7], [52, 116, 6], [150, 112, 7], [96, 170, 8]];
const EYES = [76, 124];

function Eyes({ face }) {
  if (face === "sleep") return <path d="M62 108Q76 118 90 108M110 108Q124 118 138 108" stroke={INK} strokeWidth="4.5" fill="none" strokeLinecap="round" />;
  if (face === "joy" || face === "eat") return <path d="M63 111Q76 94 89 111M111 111Q124 94 137 111" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />;
  const ry = face === "meh" ? 9 : 14;
  return (
    <g className="mlb-eyes">
      <g className="mlb-look">
        {EYES.map((x) => (
          <g key={x}>
            <ellipse cx={x} cy="106" rx="11.5" ry={ry} fill={INK} />
            <circle cx={x - 4} cy={106 - ry * 0.4} r="4.2" fill="#fff" />
            <circle cx={x + 4} cy={106 + ry * 0.35} r="2" fill="#fff" />
          </g>
        ))}
      </g>
      {face === "sad" && <path d="M60 90L86 84M114 84L140 90" stroke={INK} strokeWidth="4" strokeLinecap="round" />}
      {face === "meh" && <path d="M62 94H90M110 94H138" stroke={INK} strokeWidth="3.5" strokeLinecap="round" opacity=".7" />}
    </g>
  );
}

function Mouth({ face }) {
  switch (face) {
    case "joy":
      return <><path d="M86 130Q100 154 114 130Z" fill="#5a2a3a" /><ellipse cx="100" cy="142" rx="6" ry="4" fill="#ff7a90" /></>;
    case "eat":
      return <ellipse className="mlb-chew" cx="100" cy="136" rx="10" ry="8" fill="#5a2a3a" />;
    case "sleep":
      return <ellipse cx="100" cy="136" rx="4" ry="3" fill="#5a2a3a" />;
    case "sad":
      return <path d="M89 141Q100 130 111 141" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
    case "meh":
      return <path d="M91 136Q100 139 109 136" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
    default:
      return <path d="M89 131Q100 143 111 131" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
  }
}

export function Buddy({ color = "mint", face = "happy", hat, glasses, dirt = 0, foam = [], food }) {
  const c = COLORS[color] || COLORS.mint;
  return (
    <svg viewBox="0 0 200 200" className="mlb-buddy-svg" aria-hidden="true">
      <ellipse cx="100" cy="186" rx="58" ry="8" fill="#000" opacity=".16" />
      <g className="mlb-breathe">
        <ellipse cx="72" cy="178" rx="17" ry="9" fill={c.shade} />
        <ellipse cx="128" cy="178" rx="17" ry="9" fill={c.shade} />
        {!hat && (
          <g className="mlb-sprout">
            <path d="M100 54Q97 38 103 26" stroke="#4caf50" strokeWidth="4.5" fill="none" strokeLinecap="round" />
            <path d="M103 27Q117 12 129 22Q117 34 103 27Z" fill="#6fd36f" />
            <path d="M101 33Q87 20 77 30Q90 40 101 33Z" fill="#5bc35b" />
          </g>
        )}
        <ellipse className="mlb-arm mlb-arm--l" cx="38" cy="130" rx="11" ry="17" fill={c.shade} transform="rotate(25 38 130)" />
        <ellipse className="mlb-arm mlb-arm--r" cx="162" cy="130" rx="11" ry="17" fill={c.shade} transform="rotate(-25 162 130)" />
        <path d="M100 50C150 50 168 95 168 130C168 165 140 182 100 182C60 182 32 165 32 130C32 95 50 50 100 50Z" fill={c.body} />
        <path d="M60 78Q76 58 100 56" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" opacity=".45" />
        <ellipse cx="100" cy="152" rx="44" ry="28" fill={c.belly} />
        {DIRT.slice(0, dirt).map(([x, y, r], i) => (
          <path key={i} d={`M${x - r} ${y}q${r * 0.4} ${-r * 1.2} ${r} ${-r * 0.6}q${r * 1.1} ${-r * 0.2} ${r} ${r * 0.8}q${-r * 0.5} ${r} ${-r * 1.3} ${r * 0.5}z`} fill="#8a6a4a" opacity=".6" />
        ))}
        {dirt >= 5 && <path className="mlb-stink" d="M44 64q-6-8 0-14t0-14M156 64q6-8 0-14t0-14" stroke="#9c8a5a" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".6" />}
        <ellipse cx="58" cy="128" rx="11" ry="7" fill="#ff8fa8" opacity=".55" />
        <ellipse cx="142" cy="128" rx="11" ry="7" fill="#ff8fa8" opacity=".55" />
        <Eyes face={face} />
        <Mouth face={face} />
        {food && <g transform="translate(84 116) scale(.8)"><g className="mlb-bite">{FOOD_ART[food]}</g></g>}
        {glasses && GLASSES[glasses]}
        {hat && HATS[hat]}
        {foam.map((f) => (
          <g key={f.id} className="mlb-foam" transform={`translate(${f.x * 200} ${f.y * 200})`}>
            <circle r={f.r} fill="#fff" opacity=".95" />
            <circle cx={f.r * 0.7} cy={-f.r * 0.4} r={f.r * 0.6} fill="#f2f9ff" />
            <circle cx={-f.r * 0.3} cy={-f.r * 0.35} r={f.r * 0.22} fill="#bfe6ff" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Shop thumbnail for a hat / glasses item (buddy-space art, cropped). */
export function WearArt({ item, className }) {
  const box = item.kind === "hat" ? "52 0 128 80" : "36 76 128 60";
  return <svg viewBox={box} className={className} aria-hidden="true">{item.kind === "hat" ? HATS[item.id] : GLASSES[item.id]}</svg>;
}

/* ---------------- decorations (room space) ---------------- */
export const DECOR = {
  fruitbowl: { at: [240, 512], box: "-95 -85 190 100", art: <>
    <circle cx="-34" cy="-36" r="28" fill="#ffa63d" />
    <circle cx="22" cy="-44" r="30" fill="#ff5a5a" />
    {[[52, -30], [64, -40], [58, -18], [70, -24]].map(([x, y]) => <circle key={x * y} cx={x} cy={y} r="11" fill="#9c6ade" />)}
    <path d="M-82 -22Q0 72 82 -22Z" fill="#7ec8e3" />
    <path d="M-60 -8Q0 30 60 -8" stroke="#fff" strokeWidth="6" opacity=".5" fill="none" />
  </> },
  plant: { at: [1115, 650], box: "-105 -175 210 290", art: <>
    {[[-60, -90, -35], [60, -90, 35], [-25, -130, -12], [25, -130, 12], [0, -150, 0]].map(([x, y, a], i) => (
      <ellipse key={i} cx={x} cy={y} rx="26" ry="62" fill={i % 2 ? "#4caf50" : "#6fd36f"} transform={`rotate(${a} ${x} ${y})`} />
    ))}
    <path d="M-52 0L52 0L40 110H-40Z" fill="#e07a5f" />
    <rect x="-58" y="-12" width="116" height="22" rx="8" fill="#c8634a" />
  </> },
  duck: { at: [440, 505], box: "-65 -85 130 95", art: <>
    <ellipse cx="0" cy="-22" rx="52" ry="30" fill="#ffd84a" />
    <circle cx="22" cy="-58" r="24" fill="#ffd84a" />
    <path d="M42 -58l22 6-22 8z" fill="#ff8c2e" />
    <circle cx="28" cy="-64" r="4.5" fill={INK} />
    <path d="M-30 -30q14 14 32 0" stroke="#f2bf3c" strokeWidth="6" fill="none" strokeLinecap="round" />
  </> },
  bathmat: { at: [800, 722], box: "-290 -80 580 160", art: <>
    <rect x="-270" y="-56" width="540" height="112" rx="56" fill="#ff9ac1" />
    <rect x="-240" y="-36" width="480" height="72" rx="36" fill="none" stroke="#fff" strokeWidth="8" strokeDasharray="4 18" strokeLinecap="round" />
  </> },
  starlights: { at: [800, 70], scale: 2.4, box: "-320 -30 640 140", art: <>
    <path d="M-300 0Q0 110 300 0" stroke="#6b5a8a" strokeWidth="3" fill="none" />
    {[-250, -170, -90, -10, 70, 150, 230].map((x, i) => {
      const y = 110 * (1 - ((x + 300) / 600 - 0.5) ** 2 * 4) / 2 + 8;
      return <polygon key={x} className="mlb-twinkle" style={{ animationDelay: `${i * 0.3}s` }} points={star(x, y, 18, 8)} fill={["#ffd84a", "#ff8fb8", "#7ad3ff", "#a8e6cf"][i % 4]} />;
    })}
  </> },
  poster: { at: [1330, 250], box: "-100 -130 200 260", art: <>
    <rect x="-92" y="-122" width="184" height="244" rx="10" fill="#2d2350" stroke="#ffd36b" strokeWidth="10" />
    <path d="M10 -60A55 55 0 1 0 40 40 44 44 0 1 1 10 -60Z" fill="#ffe27a" />
    {[[-50, -80], [50, -20], [-40, 70], [60, 80]].map(([x, y]) => <polygon key={x * y} points={star(x, y, 9, 4)} fill="#fff" />)}
  </> },
  rug: { at: [800, 722], box: "-310 -80 620 160", art: <>
    {["#ff6b6b", "#ffa63d", "#ffd84a", "#6fd36f", "#5b8def", "#c6a8ff"].map((c, i) => <ellipse key={c} rx={300 - i * 40} ry={72 - i * 10} fill={c} />)}
  </> },
  rocket: { at: [1350, 760], box: "-80 -270 160 285", art: <>
    <path d="M-40 -40L-72 0V8L-36 -8ZM40 -40L72 0V8L36 -8Z" fill="#ff5a5a" />
    <path d="M0 -260C46 -210 50 -100 40 -10H-40C-50 -100 -46 -210 0 -260Z" fill="#eef3ff" />
    <path d="M0 -260C20 -238 32 -214 38 -190H-38C-32 -214 -20 -238 0 -260Z" fill="#ff5a5a" />
    <circle cy="-130" r="20" fill="#7ad3ff" stroke="#5b8def" strokeWidth="6" />
    <path d="M-24 -10H24L14 12H-14Z" fill="#8a8fa8" />
  </> },
};
export function DecorInRoom({ id }) {
  const d = DECOR[id];
  return <g transform={`translate(${d.at[0]} ${d.at[1]})${d.scale ? ` scale(${d.scale})` : ""}`}>{d.art}</g>;
}
export function DecorIcon({ id, className }) {
  return <svg viewBox={DECOR[id].box} className={className} aria-hidden="true">{DECOR[id].art}</svg>;
}

/* ---------------- icons (24×24) ---------------- */
const ICONS = {
  hunger: <><path d="M12 7C9 4 3 5 3 12s5 10 9 8c4 2 9-1 9-8s-6-8-9-5Z" /><path d="M12 7c0-2 1-4 3-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  happy: <><circle cx="12" cy="12" r="9.5" /><circle cx="9" cy="10" r="1.4" fill="#fff" /><circle cx="15" cy="10" r="1.4" fill="#fff" /><path d="M8 14q4 4 8 0" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" /></>,
  clean: <path d="M12 2C8 8 5 11 5 15a7 7 0 0 0 14 0c0-4-3-7-7-13Z" />,
  energy: <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />,
  coin: <><circle cx="12" cy="12" r="10" fill="#ffcf3f" /><circle cx="12" cy="12" r="6.5" fill="none" stroke="#e0a800" strokeWidth="2" /><path d="M12 8.5v7" stroke="#e0a800" strokeWidth="2" strokeLinecap="round" /></>,
  gift: <><rect x="3" y="9" width="18" height="12" rx="2" /><rect x="2" y="6" width="20" height="5" rx="1.5" /><path d="M12 6v15" stroke="#fff" strokeWidth="2.4" /><path d="M12 6C10 2 6 2 7 5s5 1 5 1 4 2 5-1-3-3-5 1" fill="none" stroke="currentColor" strokeWidth="1.8" /></>,
  trophy: <><path d="M7 3h10v6a5 5 0 0 1-10 0Z" /><path d="M7 5H3v2a4 4 0 0 0 4 4M17 5h4v2a4 4 0 0 1-4 4" fill="none" stroke="currentColor" strokeWidth="2" /><rect x="10.5" y="13" width="3" height="5" /><rect x="7" y="18" width="10" height="3" rx="1" /></>,
  bag: <><path d="M4 8h16l-1.5 13h-13Z" /><path d="M8 10V6a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  left: <path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />,
  right: <path d="M9 4l8 8-8 8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />,
  close: <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />,
  soap: <><rect x="3" y="10" width="18" height="10" rx="4" /><circle cx="8" cy="6" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="14" cy="4.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.6" /></>,
  shower: <><path d="M4 11a8 8 0 0 1 16 0Z" /><path d="M12 3V1" stroke="currentColor" strokeWidth="2" />{[6, 10, 14, 18].map((x) => <path key={x} d={`M${x} 14l-1 3m1 3-.5 1.5`} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />)}</>,
  bulb: <><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z" /><rect x="8.5" y="18.5" width="7" height="3" rx="1.2" /></>,
  moon: <path d="M15 2a10 10 0 1 0 7 15A8 8 0 0 1 15 2Z" />,
  star: <polygon points={star(12, 12.5, 11, 5)} />,
  cards: <><rect x="2" y="5" width="11" height="15" rx="2" transform="rotate(-10 7 12)" /><rect x="10" y="4" width="11" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="2" transform="rotate(8 15 11)" /></>,
  bubbles: <><circle cx="9" cy="14" r="6" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="17" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="18" cy="17" r="2.5" /></>,
  paw: <><ellipse cx="12" cy="16" rx="5" ry="4.5" /><circle cx="5.5" cy="10" r="2.3" /><circle cx="9.5" cy="6" r="2.3" /><circle cx="14.5" cy="6" r="2.3" /><circle cx="18.5" cy="10" r="2.3" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2.2" /></>,
};
export function Icon({ name, className = "mlb-ico" }) {
  return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">{ICONS[name]}</svg>;
}
