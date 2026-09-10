/**
 * Cake Designer — the topping & decoration sprite library.
 *
 * Each sprite is drawn inside roughly a -14..14 box, centred on the origin, so
 * the caller positions it with a single translate() and scales uniformly.
 * Gradients and filters live in <CakeDefs> (rendered once per <CakePreview>),
 * referenced here by id — that keeps a cake with 20 strawberries cheap.
 *
 * `animate` gates the only continuously-moving parts (candle flames); it is
 * driven by the player's Animations setting.
 */

/* ------------------------------------------------------------- toppings --- */

function Strawberry() {
  return (
    <g>
      <ellipse cx="0" cy="10" rx="7" ry="3" fill="rgba(60,20,30,0.28)" />
      <path d="M0 -9 C 8 -9 11 -2 9 5 C 7 11 -7 11 -9 5 C -11 -2 -8 -9 0 -9 Z" fill="url(#cd-berry)" />
      <path d="M-6 -4 q 6 -3 12 0" stroke="rgba(255,255,255,0.5)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {[[-4, -1], [2, 1], [-1, 4], [5, 3], [-5, 5], [0, -4]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.9" fill="#ffe9b0" />
      ))}
      <path d="M-5 -8 L -1 -11 L 0 -8 L 1 -11 L 5 -8 C 3 -6 -3 -6 -5 -8 Z" fill="url(#cd-leaf)" />
    </g>
  );
}

function Berry({ grad, r = 5.5 }) {
  return (
    <g>
      <ellipse cx="0" cy={r + 2} rx={r} ry="2.4" fill="rgba(40,20,50,0.25)" />
      <circle cx="0" cy="0" r={r} fill={`url(#${grad})`} />
      <circle cx={-r * 0.35} cy={-r * 0.35} r={r * 0.3} fill="rgba(255,255,255,0.55)" />
    </g>
  );
}

function Raspberry() {
  return (
    <g>
      <ellipse cx="0" cy="8" rx="6" ry="2.4" fill="rgba(60,10,30,0.25)" />
      {[[-3, -2], [3, -2], [0, -4], [-4, 2], [4, 2], [-2, 4], [2, 4], [0, 1]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" fill="url(#cd-rasp)" />
      ))}
      {[[-3, -2], [3, -2], [0, -4]].map(([x, y], i) => (
        <circle key={i} cx={x - 0.7} cy={y - 0.7} r="0.8" fill="rgba(255,255,255,0.5)" />
      ))}
    </g>
  );
}

function Cherry() {
  return (
    <g>
      <ellipse cx="1" cy="9" rx="6" ry="2.4" fill="rgba(50,10,20,0.28)" />
      <path d="M2 -8 q 6 -4 9 -9" stroke="#6b8f3a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="1" cy="1" r="6" fill="url(#cd-cherry)" />
      <circle cx="-1.2" cy="-1.4" r="1.8" fill="rgba(255,255,255,0.6)" />
    </g>
  );
}

function CitrusSlice({ grad, rind }) {
  return (
    <g>
      <ellipse cx="0" cy="7" rx="8" ry="2.6" fill="rgba(50,35,0,0.2)" />
      <circle cx="0" cy="0" r="8.5" fill={rind} />
      <circle cx="0" cy="0" r="7" fill={`url(#${grad})`} />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <path key={i} d={`M0 0 L ${Math.cos(a) * 6.4} ${Math.sin(a) * 6.4} L ${Math.cos(a + 0.5) * 6.4} ${Math.sin(a + 0.5) * 6.4} Z`}
            fill="rgba(255,255,255,0.4)" stroke="rgba(255,255,255,0.55)" strokeWidth="0.5" />
        );
      })}
      <circle cx="-2.5" cy="-2.5" r="2" fill="rgba(255,255,255,0.4)" />
    </g>
  );
}

function KiwiSlice() {
  return (
    <g>
      <ellipse cx="0" cy="7" rx="8" ry="2.6" fill="rgba(20,40,10,0.2)" />
      <circle cx="0" cy="0" r="8.5" fill="#7d5a2e" />
      <circle cx="0" cy="0" r="7.4" fill="url(#cd-kiwi)" />
      <circle cx="0" cy="0" r="2.4" fill="#f4f0d8" />
      {Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return <ellipse key={i} cx={Math.cos(a) * 4.6} cy={Math.sin(a) * 4.6} rx="0.7" ry="1.3" fill="#20301a" transform={`rotate(${(a * 180) / Math.PI} ${Math.cos(a) * 4.6} ${Math.sin(a) * 4.6})`} />;
      })}
    </g>
  );
}

function Fig() {
  return (
    <g>
      <ellipse cx="0" cy="9" rx="7" ry="2.6" fill="rgba(40,10,40,0.28)" />
      <path d="M0 -10 C 8 -10 9 6 0 10 C -9 6 -8 -10 0 -10 Z" fill="url(#cd-fig)" />
      <path d="M0 -6 C 5 -6 5 5 0 7 C -5 5 -5 -6 0 -6 Z" fill="#c65b7a" />
      {[[-1.5, 0], [1.5, 1], [0, 3], [-1, -2], [1.5, -2]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.7" fill="#ffd9c0" />
      ))}
    </g>
  );
}

function ChocPiece() {
  return (
    <g>
      <ellipse cx="0" cy="6" rx="7" ry="2.2" fill="rgba(30,15,5,0.3)" />
      <path d="M-7 4 L -4 -6 L 6 -4 L 4 6 Z" fill="url(#cd-choc)" />
      <path d="M-7 4 L -4 -6 L 6 -4 L 4 6 Z" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
      <path d="M-4 -6 L 6 -4 L 4 0 L -6 -1 Z" fill="rgba(255,255,255,0.14)" />
    </g>
  );
}

function ChocBall() {
  return (
    <g>
      <ellipse cx="0" cy="6" rx="6" ry="2.2" fill="rgba(30,15,5,0.3)" />
      <circle cx="0" cy="0" r="6" fill="url(#cd-choc)" />
      <circle cx="-2" cy="-2" r="1.8" fill="rgba(255,255,255,0.28)" />
      <ellipse cx="0" cy="0" rx="6" ry="6" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="0.6" />
    </g>
  );
}

function ChocCurl() {
  return (
    <g>
      <ellipse cx="0" cy="8" rx="7" ry="2.2" fill="rgba(30,15,5,0.28)" />
      <path d="M-8 8 C -10 -2 -2 -10 8 -9 C 2 -6 -3 -1 -1 6 C 3 2 6 0 9 1 C 4 6 -3 12 -8 8 Z" fill="url(#cd-choc)" />
      <path d="M-8 8 C -10 -2 -2 -10 8 -9" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeLinecap="round" />
    </g>
  );
}

function ChocSquare() {
  return (
    <g>
      <rect x="-7" y="-7" width="14" height="14" rx="1.4" fill="rgba(20,10,4,0.3)" transform="translate(1.5 3)" />
      <rect x="-7" y="-7" width="14" height="14" rx="1.4" fill="url(#cd-choc)" />
      <rect x="-7" y="-7" width="14" height="6" rx="1.4" fill="rgba(255,255,255,0.16)" />
      <path d="M-4 4 q 4 -2 8 0" stroke="#e8c46b" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Macaron({ i = 0 }) {
  const shells = ["#f7b8cf", "#b6e3cd", "#f7db8a", "#c9b8ec", "#f7c9a8"];
  const c = shells[i % shells.length];
  return (
    <g>
      <ellipse cx="0" cy="7" rx="8" ry="2.4" fill="rgba(60,40,50,0.24)" />
      <path d="M-8 -1 a 8 5 0 0 1 16 0 Z" fill={c} />
      <path d="M-8 -1 a 8 3 0 0 0 16 0 l -0.5 3 a 8 3 0 0 1 -15 0 Z" fill="#f4efe0" />
      <path d="M-8 3 a 8 4 0 0 0 16 0 a 8 5 0 0 1 -16 0 Z" fill={c} />
      <path d="M-6 -3 q 6 -3 12 0" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Cookie() {
  return (
    <g>
      <ellipse cx="0" cy="7" rx="8" ry="2.4" fill="rgba(40,25,10,0.26)" />
      <circle cx="0" cy="0" r="8" fill="url(#cd-cookie)" />
      {[[-3, -2], [3, -1], [0, 3], [-2, 3], [3, 3], [-4, 1], [1, -3]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.3" fill="#3a2110" />
      ))}
      <circle cx="-3" cy="-3" r="2" fill="rgba(255,255,255,0.18)" />
    </g>
  );
}

function Marshmallow() {
  return (
    <g>
      <ellipse cx="0" cy="7" rx="6" ry="2.2" fill="rgba(60,40,60,0.2)" />
      <rect x="-5.5" y="-6" width="11" height="12" rx="3.5" fill="url(#cd-cream)" />
      <rect x="-5.5" y="-6" width="11" height="5" rx="3.5" fill="rgba(255,255,255,0.6)" />
    </g>
  );
}

function Candy({ i = 0 }) {
  const cols = ["#e0524f", "#7fa8e6", "#8fce8f", "#f7db8a", "#f7b8cf"];
  const c = cols[i % cols.length];
  return (
    <g>
      <ellipse cx="0" cy="5" rx="6" ry="2" fill="rgba(40,30,40,0.24)" />
      <circle cx="0" cy="0" r="4.5" fill={c} />
      <path d="M-4.5 0 l -4 -3 l 0 6 Z" fill={c} />
      <path d="M4.5 0 l 4 -3 l 0 6 Z" fill={c} />
      <circle cx="-1.4" cy="-1.4" r="1.4" fill="rgba(255,255,255,0.6)" />
    </g>
  );
}

function Meringue() {
  return (
    <g>
      <ellipse cx="0" cy="8" rx="6" ry="2.2" fill="rgba(60,50,60,0.2)" />
      <path d="M-6 8 C -6 0 -3 2 -2 -3 C -1 2 1 2 2 -4 C 3 2 5 1 6 8 Z" fill="url(#cd-cream)" />
      <path d="M0 -8 C 2 -6 2 -3 0 -2 C -2 -3 -2 -6 0 -8 Z" fill="#fff" />
    </g>
  );
}

function WaferRoll() {
  return (
    <g>
      <ellipse cx="0" cy="9" rx="4" ry="2" fill="rgba(60,40,20,0.26)" />
      <rect x="-3.5" y="-11" width="7" height="22" rx="3.5" fill="url(#cd-cookie)" />
      <path d="M-2 -11 q 0 22 0 22" stroke="rgba(255,255,255,0.25)" strokeWidth="1" fill="none" />
      <path d="M2 -11 q 0 22 0 22" stroke="rgba(0,0,0,0.15)" strokeWidth="1" fill="none" />
    </g>
  );
}

/* ---------------------------------------------------------- decorations --- */

function Flame({ animate }) {
  return (
    <g className={animate ? "cd-flame" : ""}>
      <ellipse cx="0" cy="0" rx="3.4" ry="5.5" fill="url(#cd-flame)" />
      <ellipse cx="0" cy="1" rx="1.6" ry="3" fill="#fff3c0" />
      <ellipse cx="0" cy="6" rx="5" ry="3" fill="rgba(255,190,90,0.35)" />
    </g>
  );
}

function CandleClassic({ animate, color = "#f7b8cf" }) {
  return (
    <g>
      <ellipse cx="0" cy="16" rx="5" ry="2" fill="rgba(40,20,40,0.22)" />
      <rect x="-3" y="-6" width="6" height="22" rx="1.6" fill={color} />
      <rect x="-3" y="-6" width="2.2" height="22" rx="1.2" fill="rgba(255,255,255,0.4)" />
      <path d="M-3 -1 h 6 M-3 5 h 6" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      <rect x="-0.6" y="-9" width="1.2" height="4" fill="#3a2a1a" />
      <g transform="translate(0 -13)"><Flame animate={animate} /></g>
    </g>
  );
}

function CandleSpiral({ animate }) {
  return (
    <g>
      <ellipse cx="0" cy="16" rx="5" ry="2" fill="rgba(40,20,40,0.22)" />
      <rect x="-3" y="-6" width="6" height="22" rx="1.6" fill="#fff" />
      <path d="M-3 -4 l 6 3 M-3 2 l 6 3 M-3 8 l 6 3 M-3 14 l 6 2" stroke="#e0524f" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="-0.6" y="-9" width="1.2" height="4" fill="#3a2a1a" />
      <g transform="translate(0 -13)"><Flame animate={animate} /></g>
    </g>
  );
}

function NumberCandle({ animate, number = 0 }) {
  const text = String(number ?? 0).slice(0, 2);
  const two = text.length > 1;
  return (
    <g>
      <ellipse cx="0" cy="18" rx={two ? 12 : 8} ry="2.6" fill="rgba(40,20,40,0.25)" />
      <text x="0" y="12" textAnchor="middle" fontSize="34" fontWeight="800"
        fontFamily="'Baloo 2','Trebuchet MS',system-ui,sans-serif"
        fill="#fff" stroke="#f2a6c4" strokeWidth="3.4" paintOrder="stroke"
        style={{ filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.28))" }}>{text}</text>
      <text x="0" y="12" textAnchor="middle" fontSize="34" fontWeight="800"
        fontFamily="'Baloo 2','Trebuchet MS',system-ui,sans-serif" fill="url(#cd-gold)"
        opacity="0.35">{text}</text>
      <g transform={`translate(${two ? -9 : 0} -18)`}><Flame animate={animate} /></g>
      {two && <g transform="translate(9 -18)"><Flame animate={animate} /></g>}
    </g>
  );
}

function Rose({ fill = "url(#cd-rose)" }) {
  return (
    <g>
      <ellipse cx="0" cy="8" rx="8" ry="2.6" fill="rgba(60,20,40,0.2)" />
      {[10, 8.5, 7, 5.5, 4].map((r, i) => (
        <circle key={i} cx={i % 2 ? 1 : -1} cy={i * -0.6} r={r} fill={fill}
          opacity={0.55 + i * 0.1} />
      ))}
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return <path key={i} d={`M0 0 Q ${Math.cos(a) * 5} ${Math.sin(a) * 5} ${Math.cos(a) * 9} ${Math.sin(a) * 9} Q ${Math.cos(a + 0.5) * 5} ${Math.sin(a + 0.5) * 5} 0 0 Z`} fill={fill} opacity="0.9" />;
      })}
      <circle cx="0" cy="0" r="2.4" fill="rgba(255,255,255,0.35)" />
    </g>
  );
}

function Daisy() {
  return (
    <g>
      <ellipse cx="0" cy="7" rx="8" ry="2.4" fill="rgba(60,50,20,0.18)" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <ellipse key={i} cx={Math.cos(a) * 6} cy={Math.sin(a) * 6} rx="3.6" ry="2"
          fill="#fff" stroke="rgba(0,0,0,0.05)" strokeWidth="0.5"
          transform={`rotate(${(a * 180) / Math.PI} ${Math.cos(a) * 6} ${Math.sin(a) * 6})`} />;
      })}
      <circle cx="0" cy="0" r="3.4" fill="url(#cd-gold)" />
    </g>
  );
}

function Blossom({ fill = "#f7b8cf" }) {
  return (
    <g>
      {Array.from({ length: 5 }).map((_, i) => {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        return <circle key={i} cx={Math.cos(a) * 4} cy={Math.sin(a) * 4} r="3.4" fill={fill} />;
      })}
      <circle cx="0" cy="0" r="2" fill="#fff3c0" />
    </g>
  );
}

function MiniBalloon({ i = 0 }) {
  const cols = ["#e0524f", "#7fa8e6", "#f7db8a", "#8fce8f", "#f7b8cf"];
  const c = cols[i % cols.length];
  return (
    <g>
      <path d="M0 6 q -3 6 0 12" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" fill="none" />
      <path d="M0 -12 C 8 -12 8 2 0 6 C -8 2 -8 -12 0 -12 Z" fill={c} />
      <path d="M0 6 l -2 3 l 4 0 Z" fill={c} />
      <ellipse cx="-2.5" cy="-6" rx="2" ry="3.5" fill="rgba(255,255,255,0.45)" />
    </g>
  );
}

function Ribbon() {
  return (
    <g>
      <path d="M0 0 L -12 -6 L -12 6 Z" fill="#e7d8b8" />
      <path d="M0 0 L 12 -6 L 12 6 Z" fill="#e7d8b8" />
      <path d="M0 0 L -12 -6 L -12 6 Z" fill="none" stroke="rgba(0,0,0,0.08)" />
      <circle cx="0" cy="0" r="3.5" fill="#d8c49a" />
    </g>
  );
}

function TopperHeart() {
  return (
    <g>
      <rect x="-1" y="0" width="2" height="16" fill="#c99f3f" />
      <path d="M0 -2 C -6 -10 -14 -2 0 8 C 14 -2 6 -10 0 -2 Z" fill="url(#cd-gold)" stroke="#b98f2e" strokeWidth="0.8" />
    </g>
  );
}

function TopperText({ text = "Mr & Mrs" }) {
  return (
    <g>
      <rect x="-1" y="2" width="2" height="14" fill="#8a8a90" />
      <text x="0" y="-2" textAnchor="middle" fontSize="9" fontWeight="700"
        fontFamily="'Pinyon Script','Segoe Script','Brush Script MT',cursive" fill="url(#cd-gold)"
        stroke="#b98f2e" strokeWidth="0.4" paintOrder="stroke">{text}</text>
    </g>
  );
}

function GoldDrizzle() {
  return (
    <g opacity="0.9">
      <path d="M-14 -2 q 4 6 8 0 q 4 -6 8 0 q 4 6 8 0" stroke="url(#cd-gold)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M-12 4 q 5 5 10 0 q 5 -5 10 0" stroke="url(#cd-gold)" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.8" />
    </g>
  );
}

function TopperElegant() {
  return (
    <g>
      <rect x="-1" y="0" width="2" height="15" fill="#c99f3f" />
      <path d="M0 -12 L 3 -3 L 12 -3 L 5 3 L 8 12 L 0 6 L -8 12 L -5 3 L -12 -3 L -3 -3 Z"
        fill="url(#cd-gold)" stroke="#b98f2e" strokeWidth="0.7" />
    </g>
  );
}

function Rainbow() {
  const bands = ["#e0524f", "#f0a05a", "#f7db8a", "#8fce8f", "#7fa8e6", "#9d7fd1"];
  return (
    <g>
      {bands.map((c, i) => (
        <path key={i} d={`M ${-16 + i * 1.6} 8 A ${16 - i * 1.6} ${16 - i * 1.6} 0 0 1 ${16 - i * 1.6} 8`}
          stroke={c} strokeWidth="1.7" fill="none" strokeLinecap="round" />
      ))}
      <ellipse cx="-15" cy="9" rx="4" ry="2.6" fill="#fff" opacity="0.9" />
      <ellipse cx="15" cy="9" rx="4" ry="2.6" fill="#fff" opacity="0.9" />
    </g>
  );
}

function Cloud() {
  return (
    <g>
      <ellipse cx="-5" cy="2" rx="6" ry="5" fill="#fff" />
      <ellipse cx="4" cy="2" rx="7" ry="6" fill="#fff" />
      <ellipse cx="0" cy="-2" rx="6" ry="5.5" fill="#fff" />
      <ellipse cx="0" cy="5" rx="12" ry="4" fill="#eef3ff" />
    </g>
  );
}

function Moon() {
  return (
    <g>
      <circle cx="0" cy="0" r="9" fill="url(#cd-gold)" />
      <circle cx="4" cy="-2" r="8" fill="url(#cd-galaxy)" />
      <circle cx="-3" cy="1" r="1.2" fill="#fff6d8" opacity="0.7" />
    </g>
  );
}

function Star3D({ fill = "url(#cd-gold)" }) {
  return (
    <g>
      <path d="M0 -11 L 3.2 -3.4 L 11 -3 L 5 2.4 L 7 10 L 0 5.6 L -7 10 L -5 2.4 L -11 -3 L -3.2 -3.4 Z"
        fill={fill} stroke="rgba(0,0,0,0.12)" strokeWidth="0.5" />
      <path d="M0 -11 L 3.2 -3.4 L 0 -1 Z" fill="rgba(255,255,255,0.4)" />
    </g>
  );
}

function Butterfly({ i = 0 }) {
  const cols = ["#f7b8cf", "#8be0ff", "#c9b8ec", "#f7db8a"];
  const c = cols[i % cols.length];
  return (
    <g className={i % 2 ? "cd-flutter" : "cd-flutter cd-flutter--b"}>
      <path d="M0 0 C -12 -12 -14 6 0 4 Z" fill={c} />
      <path d="M0 0 C 12 -12 14 6 0 4 Z" fill={c} />
      <path d="M0 0 C -10 4 -8 12 0 8 Z" fill={c} opacity="0.8" />
      <path d="M0 0 C 10 4 8 12 0 8 Z" fill={c} opacity="0.8" />
      <rect x="-0.7" y="-3" width="1.4" height="12" rx="0.7" fill="#3a2a1a" />
    </g>
  );
}

function UnicornHorn() {
  return (
    <g>
      <ellipse cx="0" cy="12" rx="5" ry="2" fill="rgba(60,40,80,0.2)" />
      <path d="M0 -14 L 4 12 L -4 12 Z" fill="url(#cd-gold)" />
      <path d="M-3 8 L 3 6 M-3 3 L 3 1 M-2.4 -1 L 2.4 -3 M-2 -5 L 2 -7 M-1.4 -9 L 1.4 -11"
        stroke="#fff" strokeWidth="1.2" opacity="0.7" />
    </g>
  );
}

/* --------------------------------------------------------------- switch --- */

export default function Sprite({ id, animate = true, seed = 0, number, color }) {
  switch (id) {
    case "strawberry": return <Strawberry />;
    case "blueberry": return <Berry grad="cd-blue" r={5} />;
    case "blackberry": return <Berry grad="cd-black" r={5.5} />;
    case "raspberry": return <Raspberry />;
    case "cherry": return <Cherry />;
    case "lemon-slice": return <CitrusSlice grad="cd-lemon" rind="#e9c14b" />;
    case "orange-slice": return <CitrusSlice grad="cd-orange" rind="#d98a3a" />;
    case "kiwi-slice": return <KiwiSlice />;
    case "fig": return <Fig />;
    case "choc-piece": return <ChocPiece />;
    case "choc-ball": return <ChocBall />;
    case "choc-curl": return <ChocCurl />;
    case "choc-square": return <ChocSquare />;
    case "macaron": return <Macaron i={seed} />;
    case "cookie": return <Cookie />;
    case "marshmallow": return <Marshmallow />;
    case "candy": return <Candy i={seed} />;
    case "meringue": return <Meringue />;
    case "wafer-roll": return <WaferRoll />;

    case "candle-classic": return <CandleClassic animate={animate} color={color} />;
    case "candle-spiral": return <CandleSpiral animate={animate} />;
    case "candle-number": return <NumberCandle animate={animate} number={number} />;
    case "rose": return <Rose />;
    case "white-rose": return <Rose fill="#fbf7f2" />;
    case "daisy": return <Daisy />;
    case "blossom": return <Blossom fill={color || "#f7b8cf"} />;
    case "mini-balloon": return <MiniBalloon i={seed} />;
    case "ribbon": return <Ribbon />;
    case "topper-heart": return <TopperHeart />;
    case "topper-mr-mrs": return <TopperText text="Mr & Mrs" />;
    case "gold-drizzle": return <GoldDrizzle />;
    case "topper-elegant": return <TopperElegant />;
    case "rainbow": return <Rainbow />;
    case "cloud": return <Cloud />;
    case "moon": return <Moon />;
    case "star-3d": return <Star3D />;
    case "butterfly": return <Butterfly i={seed} />;
    case "unicorn-horn": return <UnicornHorn />;
    default: return <circle r="5" fill="#f7b8cf" />;
  }
}

/** approximate on-cake footprint so hit-testing / spacing looks right */
export const SPRITE_SIZE = {
  "candle-number": 30, "topper-elegant": 30, "topper-heart": 26, "topper-mr-mrs": 30,
  rainbow: 34, cloud: 26, moon: 22, "unicorn-horn": 28, ribbon: 26, "wafer-roll": 24,
  "gold-drizzle": 30,
};
export const spriteSize = (id) => SPRITE_SIZE[id] || 22;
