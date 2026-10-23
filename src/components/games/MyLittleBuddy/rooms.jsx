/**
 * My Little Buddy — the four room backdrops (1600×900, sliced to fill the
 * stage). The buddy stands in the middle (x≈620–980), so props stay at the sides.
 */
import { DecorInRoom, DECOR } from "./art.jsx";

const FLOOR = 640;

function Kitchen() {
  return <>
    <defs>
      <pattern id="mlb-ktile" width="80" height="80" patternUnits="userSpaceOnUse">
        <rect width="80" height="80" fill="#fff6e8" /><rect x="2" y="2" width="76" height="76" rx="6" fill="#fff" stroke="#f3dcbc" strokeWidth="3" />
      </pattern>
      <pattern id="mlb-kfloor" width="160" height="160" patternUnits="userSpaceOnUse">
        <rect width="160" height="160" fill="#f4c27e" /><rect width="80" height="80" fill="#e9ad62" /><rect x="80" y="80" width="80" height="80" fill="#e9ad62" />
      </pattern>
    </defs>
    <rect width="1600" height={FLOOR} fill="#ffe2bd" />
    <rect y="360" width="1600" height={FLOOR - 360} fill="url(#mlb-ktile)" />
    <rect y={FLOOR} width="1600" height="260" fill="url(#mlb-kfloor)" />
    <rect y={FLOOR - 8} width="1600" height="16" fill="#d58f4a" />
    {/* window */}
    <rect x="130" y="90" width="300" height="230" rx="18" fill="#fff" />
    <rect x="148" y="108" width="264" height="194" rx="10" fill="#9be3ff" />
    <circle cx="350" cy="160" r="30" fill="#fff59d" />
    <path d="M160 270q40-40 80 0t80 0 80 0v32H160Z" fill="#a8e6a0" />
    <path d="M280 108v194M148 205h264" stroke="#fff" strokeWidth="10" />
    <path d="M120 84h320" stroke="#ff8fb8" strokeWidth="16" strokeLinecap="round" />
    <path d="M128 92q40 90 0 160M432 92q-40 90 0 160" stroke="#ff8fb8" strokeWidth="26" fill="none" strokeLinecap="round" />
    {/* counter */}
    <rect y="520" width="460" height="380" fill="#e59b5c" />
    <rect x="20" y="560" width="190" height="300" rx="14" fill="#f0ae72" /><rect x="240" y="560" width="190" height="300" rx="14" fill="#f0ae72" />
    <circle cx="190" cy="700" r="10" fill="#b36a2e" /><circle cx="260" cy="700" r="10" fill="#b36a2e" />
    <rect y="496" width="480" height="34" rx="10" fill="#fff" />
    {/* jars shelf */}
    <rect x="40" y="380" width="380" height="16" rx="6" fill="#d58f4a" />
    {[[70, "#ff8fb8"], [150, "#7ad3ff"], [230, "#ffd84a"], [310, "#a8e6cf"]].map(([x, c]) => (
      <g key={x}><rect x={x} y="320" width="56" height="60" rx="12" fill={c} opacity=".85" /><rect x={x + 6} y="310" width="44" height="14" rx="5" fill="#fff" /></g>
    ))}
    {/* fridge */}
    <rect x="1230" y="210" width="260" height="590" rx="30" fill="#eef7ff" stroke="#bcd6ea" strokeWidth="8" />
    <path d="M1234 420h252" stroke="#bcd6ea" strokeWidth="8" />
    <rect x="1262" y="300" width="16" height="80" rx="8" fill="#9ab6cc" /><rect x="1262" y="460" width="16" height="110" rx="8" fill="#9ab6cc" />
    <circle cx="1400" cy="290" r="18" fill="#ff6b6b" /><rect x="1380" y="330" width="44" height="30" rx="6" fill="#ffd84a" transform="rotate(8 1400 345)" />
  </>;
}

function Bath() {
  return <>
    <defs>
      <pattern id="mlb-btile" width="70" height="70" patternUnits="userSpaceOnUse">
        <rect width="70" height="70" fill="#d7f1ff" /><rect x="2" y="2" width="66" height="66" rx="8" fill="#e9f8ff" />
      </pattern>
      <pattern id="mlb-bfloor" width="120" height="120" patternUnits="userSpaceOnUse">
        <rect width="120" height="120" fill="#8fd0e6" /><rect x="3" y="3" width="114" height="114" rx="10" fill="#a6dcee" />
      </pattern>
    </defs>
    <rect width="1600" height={FLOOR} fill="url(#mlb-btile)" />
    <rect y={FLOOR} width="1600" height="260" fill="url(#mlb-bfloor)" />
    <rect y={FLOOR - 8} width="1600" height="16" fill="#6bb8d6" />
    {/* tub */}
    <path d="M140 470V300q0-50 50-50t50 50" stroke="#b9c7d3" strokeWidth="16" fill="none" strokeLinecap="round" />
    <circle cx="240" cy="310" r="18" fill="#b9c7d3" />
    {[[90, 515, 26], [150, 500, 34], [230, 512, 24], [300, 498, 30], [370, 510, 22]].map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} fill="#fff" stroke="#d6eefa" strokeWidth="3" />)}
    <rect x="40" y="510" width="500" height="200" rx="60" fill="#fff" stroke="#cfe6f5" strokeWidth="8" />
    <path d="M90 560h400" stroke="#e5f3fb" strokeWidth="14" strokeLinecap="round" />
    <circle cx="110" cy="725" r="18" fill="#b9c7d3" /><circle cx="470" cy="725" r="18" fill="#b9c7d3" />
    {/* mirror + sink */}
    <ellipse cx="1290" cy="250" rx="120" ry="140" fill="#effcff" stroke="#9fd2ee" strokeWidth="14" />
    <path d="M1230 200l40-40M1250 240l60-60" stroke="#fff" strokeWidth="12" strokeLinecap="round" />
    <rect x="1250" y="470" width="80" height="200" rx="18" fill="#fff" stroke="#cfe6f5" strokeWidth="6" />
    <rect x="1170" y="430" width="240" height="56" rx="28" fill="#fff" stroke="#cfe6f5" strokeWidth="6" />
    <path d="M1290 430v-30h26" stroke="#b9c7d3" strokeWidth="12" fill="none" strokeLinecap="round" />
    {/* towel */}
    <path d="M1460 150h120" stroke="#b9c7d3" strokeWidth="10" strokeLinecap="round" />
    <rect x="1475" y="150" width="90" height="230" rx="14" fill="#ff9ac1" />
    <path d="M1475 330h90M1475 345h90" stroke="#fff" strokeWidth="6" />
  </>;
}

function Bed() {
  return <>
    <defs>
      <pattern id="mlb-bedwall" width="120" height="120" patternUnits="userSpaceOnUse">
        <rect width="120" height="120" fill="#d6c4ff" /><circle cx="30" cy="30" r="7" fill="#e6dbff" /><circle cx="90" cy="90" r="7" fill="#e6dbff" />
      </pattern>
    </defs>
    <rect width="1600" height={FLOOR} fill="url(#mlb-bedwall)" />
    <rect y={FLOOR} width="1600" height="260" fill="#b98a6a" />
    {[700, 760, 830].map((y) => <path key={y} d={`M0 ${y}H1600`} stroke="#a77856" strokeWidth="5" />)}
    <rect y={FLOOR - 8} width="1600" height="16" fill="#8d6448" />
    {/* night window */}
    <rect x="130" y="100" width="300" height="250" rx="140" fill="#fff" />
    <rect x="148" y="118" width="264" height="214" rx="124" fill="#2d2a6e" />
    <path d="M300 160a40 40 0 1 0 40 56 32 32 0 1 1-40-56Z" fill="#fff6b0" />
    {[[200, 170], [240, 260], [370, 280], [190, 230]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="4" fill="#fff" />)}
    <path d="M280 118v214" stroke="#fff" strokeWidth="9" />
    {/* nightstand + lamp */}
    <rect x="430" y="560" width="150" height="130" rx="14" fill="#b48ae0" />
    <rect x="450" y="600" width="110" height="10" rx="5" fill="#9c6ade" />
    <rect x="497" y="470" width="16" height="92" fill="#8d6448" />
    <path d="M455 480l25-80h50l25 80Z" fill="#ffd36b" />
    <ellipse className="mlb-lamp-glow" cx="505" cy="470" rx="150" ry="120" fill="#ffe9a0" opacity=".35" />
    {/* bed */}
    <rect x="1110" y="390" width="440" height="240" rx="50" fill="#8f6ad6" />
    <rect x="1090" y="560" width="490" height="150" rx="34" fill="#fff" />
    <rect x="1090" y="600" width="490" height="130" rx="30" fill="#7aa8ff" />
    <path d="M1120 640h430M1120 680h430" stroke="#9cc0ff" strokeWidth="8" />
    <ellipse cx="1220" cy="565" rx="86" ry="38" fill="#fff" stroke="#e5e0f7" strokeWidth="5" />
    <rect x="1110" y="720" width="26" height="70" rx="8" fill="#6b4ab0" /><rect x="1534" y="720" width="26" height="70" rx="8" fill="#6b4ab0" />
  </>;
}

function Play() {
  return <>
    <defs>
      <pattern id="mlb-pwall" width="140" height="140" patternUnits="userSpaceOnUse">
        <rect width="140" height="140" fill="#c6f2c2" /><circle cx="35" cy="35" r="14" fill="#dbf8d8" /><circle cx="105" cy="105" r="14" fill="#dbf8d8" />
      </pattern>
      <pattern id="mlb-pfloor" width="200" height="200" patternUnits="userSpaceOnUse">
        <rect width="100" height="100" fill="#ffd88a" /><rect x="100" width="100" height="100" fill="#ffb3c7" />
        <rect y="100" width="100" height="100" fill="#a6dcf5" /><rect x="100" y="100" width="100" height="100" fill="#c9f0a8" />
      </pattern>
    </defs>
    <rect width="1600" height={FLOOR} fill="url(#mlb-pwall)" />
    <rect y={FLOOR} width="1600" height="260" fill="url(#mlb-pfloor)" />
    <rect y={FLOOR - 8} width="1600" height="16" fill="#6fc26a" />
    {/* bunting */}
    <path d="M0 40Q800 150 1600 40" stroke="#fff" strokeWidth="5" fill="none" />
    {Array.from({ length: 13 }, (_, i) => {
      const x = 60 + i * 123, y = 40 + 110 * (1 - ((x / 1600 - 0.5) * 2) ** 2) / 2 * 0.98;
      return <path key={i} d={`M${x - 34} ${y}h68l-34 56Z`} fill={["#ff6b6b", "#ffd84a", "#5b8def", "#6fd36f", "#c6a8ff"][i % 5]} />;
    })}
    {/* shelves */}
    {[300, 470].map((y) => <rect key={y} x="60" y={y} width="380" height="18" rx="6" fill="#e59b5c" />)}
    <rect x="90" y="240" width="60" height="60" rx="8" fill="#ff6b6b" /><rect x="160" y="250" width="50" height="50" rx="8" fill="#5b8def" />
    <circle cx="270" cy="265" r="35" fill="#ffd84a" /><path d="M236 260q34 16 68 0" stroke="#ff8c2e" strokeWidth="8" fill="none" />
    <rect x="340" y="225" width="60" height="75" rx="10" fill="#c6a8ff" />
    {[[100, "#6fd36f"], [170, "#ffa63d"], [240, "#7ad3ff"], [310, "#ff8fb8"]].map(([x, c]) => <rect key={x} x={x} y="400" width="56" height="70" rx="10" fill={c} />)}
    {/* toys on the floor */}
    <circle cx="1150" cy="745" r="56" fill="#ff6b6b" /><path d="M1096 735q54 30 108 0" stroke="#fff" strokeWidth="14" fill="none" /><circle cx="1130" cy="720" r="10" fill="#fff" opacity=".6" />
    {[[1440, 760, "#5b8def"], [1520, 760, "#ffd84a"], [1480, 690, "#6fd36f"]].map(([x, y, c]) => <rect key={x + y} x={x - 36} y={y - 36} width="72" height="72" rx="10" fill={c} />)}
  </>;
}

const ROOM_ART = { kitchen: Kitchen, bath: Bath, bed: Bed, play: Play };

export function RoomScene({ id, decor }) {
  const Art = ROOM_ART[id];
  return (
    <svg className="mlb-room-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <Art />
      {decor.filter((d) => DECOR[d]).map((d) => <DecorInRoom key={d} id={d} />)}
    </svg>
  );
}

/** A second copy of the star lights above the dark overlay, so they glow with the lights off. */
export function GlowLayer({ on }) {
  if (!on) return null;
  return (
    <svg className="mlb-room-svg mlb-glow" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <DecorInRoom id="starlights" />
    </svg>
  );
}

/** Which decorations live in a room. */
export const roomDecor = (decor, itemsById, roomId) => decor.filter((d) => itemsById[d]?.room === roomId);
