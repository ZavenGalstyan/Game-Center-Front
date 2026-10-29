/**
 * Last Shelter — illustrations for event cards (one per category) and for
 * the nine endings. Small painted vignettes in SVG (400×200), sharing a
 * palette with the shelter so the cards feel like pages of the same journal.
 */
import { memo } from "react";

const Sky = ({ id, a, b }) => (
  <>
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={a} />
        <stop offset="1" stopColor={b} />
      </linearGradient>
    </defs>
    <rect width="400" height="200" fill={`url(#${id})`} />
  </>
);
const Hatch = ({ x = 200, y = 160, glow }) => (
  <g transform={`translate(${x} ${y})`}>
    <ellipse rx="70" ry="18" fill="#2b2622" />
    <ellipse rx="60" ry="13" fill="#5b6670" stroke="#f2c230" strokeWidth="4" strokeDasharray="12 8" />
    <circle r="6" fill="#f2c230" />
    {glow && <ellipse rx="80" ry="22" fill="#ffd27a" opacity="0.18" />}
  </g>
);
const Stars = () => (
  <g fill="#fff" opacity="0.7">
    {[[30, 20], [80, 40], [140, 18], [260, 30], [330, 14], [370, 50], [210, 50]].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={i % 2 ? 1.2 : 1.8} />
    ))}
  </g>
);

const ART = {
  noises: () => (
    <>
      <Sky id="g-n" a="#1d2433" b="#3b3a48" />
      <Stars />
      <rect y="150" width="400" height="50" fill="#2a2420" />
      <Hatch />
      <g stroke="#d9cdb7" strokeWidth="4" strokeLinecap="round" className="lsh-art-shake">
        <path d="M150,148 l14,-10 M170,150 l16,-12 M232,150 l14,-12 M252,148 l14,-10" />
      </g>
      <g fill="none" stroke="#ffd166" strokeWidth="3" opacity="0.8">
        <path d="M110,90 q-14,10 0,20 M96,80 q-22,20 0,40" />
        <path d="M290,90 q14,10 0,20 M304,80 q22,20 0,40" />
      </g>
      <text x="200" y="100" textAnchor="middle" fill="#ffd166" fontSize="34" fontWeight="900" fontFamily="Georgia, serif" opacity="0.85">
        ?!
      </text>
    </>
  ),
  visitor: () => (
    <>
      <Sky id="g-v" a="#c9785a" b="#4a3040" />
      <circle cx="320" cy="60" r="28" fill="#ffcf8a" opacity="0.7" />
      <rect y="150" width="400" height="50" fill="#2a2420" />
      <g fill="#1a1214">
        <circle cx="200" cy="58" r="16" />
        <path d="M178,76 Q200,68 222,76 L230,150 L170,150Z" />
        <rect x="222" y="90" width="30" height="8" rx="4" transform="rotate(20 222 90)" />
      </g>
      <path d="M248,104 L360,180 L300,190Z" fill="#fff4cc" opacity="0.25" />
      <Hatch y="172" />
    </>
  ),
  equipment: () => (
    <>
      <Sky id="g-e" a="#4a4338" b="#2b2622" />
      <path d="M0,60 L400,60" stroke="#6d6455" strokeWidth="20" />
      <path d="M0,60 L180,60" stroke="#9aa3a8" strokeWidth="14" />
      <path d="M220,60 L400,60" stroke="#9aa3a8" strokeWidth="14" />
      <g stroke="#ffd166" strokeWidth="4" fill="none" className="lsh-spark">
        <path d="M195,60 l10,-18 l-2,14 l14,-10" />
        <path d="M200,64 l-8,22 l10,-8 l-2,16" />
      </g>
      <g transform="translate(200 140)">
        <rect x="-60" y="-34" width="120" height="68" rx="10" fill="#8a6d4b" />
        <circle cx="-26" r="22" fill="#3b2f25" />
        <rect x="8" y="-20" width="40" height="18" rx="3" fill="#555" />
        <path d="M-50,-30 L50,30 M50,-30 L-50,30" stroke="#d9c49a" strokeWidth="7" opacity="0.8" />
      </g>
    </>
  ),
  radio: () => (
    <>
      <Sky id="g-r" a="#20304a" b="#141a26" />
      <Stars />
      <g transform="translate(200 130)">
        <rect x="-80" y="-44" width="160" height="88" rx="14" fill="#8a6d4b" />
        <circle cx="-34" cy="0" r="30" fill="#3b2f25" />
        <rect x="10" y="-28" width="58" height="24" rx="4" fill="#ffe7a1" />
        <path d="M18,-16 L60,-16" stroke="#c45" strokeWidth="2" />
        <path d="M60,-44 L100,-110" stroke="#bbb" strokeWidth="4" />
      </g>
      <g fill="none" stroke="#ffe7a1" strokeWidth="4" opacity="0.8" className="lsh-waves">
        <path d="M312,24 q18,16 0,36" />
        <path d="M326,12 q32,28 0,60" />
        <path d="M340,2 q44,38 0,80" />
      </g>
    </>
  ),
  spoilage: () => (
    <>
      <Sky id="g-s" a="#5a5440" b="#2f2a20" />
      <rect y="150" width="400" height="50" fill="#3e352b" />
      <g transform="translate(200 150)">
        <path d="M-40,0 L-40,-80 Q-46,-104 0,-108 Q46,-104 40,-80 L40,0Z" fill="#c9ced3" />
        <rect x="-41" y="-70" width="82" height="40" fill="#b2402f" />
        <ellipse cy="-108" rx="38" ry="10" fill="#e6e9ec" />
      </g>
      <g fill="#222">
        {[[150, 40], [260, 54], [236, 30]].map(([x, y], i) => (
          <g key={i} className="lsh-fly" style={{ animationDelay: `${i * 0.3}s` }}>
            <ellipse cx={x} cy={y} rx="5" ry="3" />
            <ellipse cx={x - 3} cy={y - 4} rx="4" ry="2" fill="#ccc" opacity="0.6" />
          </g>
        ))}
      </g>
      <path d="M120,70 q8,-6 16,0 t16,0" stroke="#8b9a3a" strokeWidth="3" fill="none" />
    </>
  ),
  illness: () => (
    <>
      <Sky id="g-i" a="#3a4a3f" b="#1f2620" />
      <g transform="translate(200 110) rotate(-24)">
        <rect x="-110" y="-12" width="200" height="24" rx="12" fill="#f1f1f1" />
        <circle cx="96" r="20" fill="#e63946" />
        <rect x="-100" y="-5" width="180" height="10" rx="5" fill="#e63946" />
        {[-80, -50, -20, 10, 40].map((x) => (
          <path key={x} d={`M${x},-12 L${x},-2`} stroke="#666" strokeWidth="2" />
        ))}
      </g>
      <g fill="#8fd3ff" opacity="0.9">
        <path d="M80,40 q-8,14 0,20 q8,-6 0,-20Z" />
        <path d="M330,70 q-8,14 0,20 q8,-6 0,-20Z" />
      </g>
    </>
  ),
  leak: () => (
    <>
      <Sky id="g-l" a="#4a4f52" b="#22272a" />
      <path d="M0,30 L400,30" stroke="#5d666b" strokeWidth="24" />
      <path d="M196,40 l8,0 l-2,16 l-4,0Z" fill="#3b4245" />
      {[0, 1, 2].map((i) => (
        <circle key={i} className="lsh-drip" cx="200" cy="70" r="7" fill="#8fd3ff" style={{ animationDelay: `${i * 0.5}s` }} />
      ))}
      <ellipse cx="200" cy="176" rx="140" ry="18" fill="#5f8fa8" opacity="0.7" />
      <ellipse cx="200" cy="176" rx="40" ry="6" fill="none" stroke="#bfe6ff" strokeWidth="2" className="lsh-ripple" />
    </>
  ),
  discovery: () => (
    <>
      <Sky id="g-d" a="#4b3b2c" b="#21180f" />
      <ellipse cx="200" cy="110" rx="140" ry="70" fill="#ffcf7a" opacity="0.2" />
      <g transform="translate(200 160)">
        <rect x="-80" y="-60" width="160" height="60" rx="6" fill="#a8784e" />
        <path d="M-80,-60 L-60,-110 L100,-100 L80,-60Z" fill="#c69a6a" />
        <rect x="-60" y="-50" width="30" height="40" rx="3" fill="#c9ced3" />
        <rect x="-20" y="-56" width="20" height="46" rx="3" fill="#8fd3ff" />
        <rect x="10" y="-44" width="40" height="30" rx="4" fill="#e04b4b" />
      </g>
      <g fill="#fff4cc">
        {[[120, 50], [280, 40], [320, 90], [90, 100]].map(([x, y], i) => (
          <path key={i} className="lsh-twinkle" style={{ animationDelay: `${i * 0.4}s` }} d={`M${x},${y - 8} L${x + 2},${y - 2} L${x + 8},${y} L${x + 2},${y + 2} L${x},${y + 8} L${x - 2},${y + 2} L${x - 8},${y} L${x - 2},${y - 2}Z`} />
        ))}
      </g>
    </>
  ),
  dilemma: () => (
    <>
      <Sky id="g-dl" a="#3d3449" b="#1d1824" />
      <g transform="translate(200 40)">
        <rect x="-4" y="0" width="8" height="140" fill="#d4af37" />
        <rect x="-110" y="10" width="220" height="8" rx="4" fill="#d4af37" transform="rotate(-8)" />
        <path d="M-120,30 L-90,90 L-150,90Z" fill="none" stroke="#d4af37" strokeWidth="3" transform="rotate(-8)" />
        <path d="M90,4 L120,64 L60,64Z" fill="none" stroke="#d4af37" strokeWidth="3" transform="rotate(-8)" />
        <rect x="-140" y="72" width="40" height="22" rx="4" fill="#8fd3ff" transform="rotate(-8)" />
        <circle cx="90" cy="46" r="12" fill="#ffcf8a" transform="rotate(-8)" />
        <rect x="-40" y="140" width="80" height="12" rx="4" fill="#d4af37" />
      </g>
    </>
  ),
  family: () => (
    <>
      <Sky id="g-f" a="#7a5a3c" b="#3a2a1c" />
      <ellipse cx="200" cy="80" rx="160" ry="80" fill="#ffcf7a" opacity="0.25" />
      <g fill="#2a1d14">
        {[[110, 1.1], [170, 1], [235, 0.85], [285, 0.7]].map(([x, s], i) => (
          <g key={i} transform={`translate(${x} 190) scale(${s})`}>
            <circle cx="0" cy="-118" r="22" />
            <path d="M-28,-92 Q0,-104 28,-92 L32,0 L-32,0Z" />
          </g>
        ))}
      </g>
      <path d="M200,40 l0,40" stroke="#222" strokeWidth="2" />
      <circle cx="200" cy="86" r="8" fill="#fff4cc" />
    </>
  ),
  mystery: () => (
    <>
      <Sky id="g-m" a="#1c1a24" b="#0b0a0e" />
      <path d="M150,200 Q150,70 200,60 Q250,70 250,200Z" fill="#090708" />
      <ellipse cx="200" cy="150" rx="30" ry="40" fill="#ffcf7a" opacity="0.25" className="lsh-pulse" />
      <g stroke="#6d6455" strokeWidth="5" fill="none">
        <path d="M150,110 l-30,-10 l-14,20 l-30,-6" />
        <path d="M250,96 l34,-14 l10,22 l34,-4" />
      </g>
      <g fill="#ffe08a">
        <circle cx="190" cy="120" r="3" className="lsh-blink" />
        <circle cx="210" cy="120" r="3" className="lsh-blink" />
      </g>
    </>
  ),
  rescue: () => (
    <>
      <Sky id="g-rc" a="#0f1e33" b="#283c5a" />
      <Stars />
      <path d="M260,40 L140,200 L330,200Z" fill="#fff8d0" opacity="0.18" />
      <g transform="translate(270 44)">
        <ellipse rx="44" ry="16" fill="#3d4a5a" />
        <rect x="30" y="-4" width="60" height="8" rx="4" fill="#3d4a5a" />
        <path d="M-70,-24 L70,-24" stroke="#9aa3a8" strokeWidth="4" className="lsh-rotor" />
        <circle cx="-14" cy="-2" r="8" fill="#9ad1d4" />
      </g>
      <rect y="170" width="400" height="30" fill="#1d1712" />
      <g transform="translate(140 170)">
        <circle cx="0" cy="-40" r="9" fill="#111" />
        <path d="M-10,-30 L10,-30 L12,0 L-12,0Z" fill="#111" />
        <path d="M8,-30 L40,-70" stroke="#ffd166" strokeWidth="5" />
        <path d="M40,-70 L120,-140" stroke="#fff4cc" strokeWidth="10" opacity="0.4" />
      </g>
    </>
  ),
  expedition: () => (
    <>
      <Sky id="g-x" a="#b9825a" b="#5a4434" />
      <circle cx="80" cy="60" r="26" fill="#ffd9a0" opacity="0.7" />
      <path d="M0,150 Q100,120 200,140 T400,130 L400,200 L0,200Z" fill="#4a3a2c" />
      <path d="M170,200 Q200,150 230,120 Q240,110 260,108" stroke="#c9b28a" strokeWidth="14" fill="none" opacity="0.6" />
      <g fill="#2a1d14">
        <rect x="320" y="70" width="40" height="70" />
        <rect x="290" y="96" width="30" height="44" />
        <path d="M300,96 l10,-14 l10,14Z" />
      </g>
      <g transform="translate(220 160)">
        <rect x="-18" y="-50" width="36" height="46" rx="12" fill="#7a8f3a" />
        <rect x="-12" y="-30" width="24" height="18" rx="6" fill="#5f7030" />
        <path d="M-10,-50 Q0,-66 10,-50" stroke="#3f4a1f" strokeWidth="4" fill="none" />
      </g>
    </>
  ),
  hazard: () => (
    <>
      <Sky id="g-h" a="#a3743c" b="#5a3a1c" />
      <g className="lsh-dust-art" fill="#e6c48a" opacity="0.5">
        {[...Array(18)].map((_, i) => (
          <circle key={i} cx={(i * 47) % 400} cy={20 + ((i * 31) % 150)} r={2 + (i % 4)} />
        ))}
      </g>
      <g transform="translate(200 100)">
        <circle r="44" fill="#f2c230" />
        <circle r="10" fill="#2b2622" />
        {[0, 120, 240].map((a) => (
          <path key={a} d="M0,-14 L-16,-40 A44,44 0 0,1 16,-40Z" fill="#2b2622" transform={`rotate(${a})`} />
        ))}
      </g>
    </>
  ),
};

const ENDING_ART = {
  rescue: ART.rescue,
  garden: () => (
    <>
      <Sky id="g-gd" a="#5c564c" b="#3a342c" />
      <rect x="40" y="30" width="320" height="110" rx="10" fill="#9ad1d4" />
      <circle cx="300" cy="66" r="22" fill="#ffe08a" />
      <path d="M40,140 Q120,96 200,120 T360,110 L360,140 L40,140Z" fill="#81b29a" />
      <rect y="150" width="400" height="50" fill="#6b4a2f" />
      {[60, 110, 160, 210, 260, 310, 350].map((x, i) => (
        <g key={x} transform={`translate(${x} 156)`}>
          <rect x="-3" y={-16 - (i % 2) * 8} width="6" height={16 + (i % 2) * 8} fill="#efe6d2" />
          <ellipse cx="0" cy={-18 - (i % 2) * 8} rx="14" ry="7" fill="#f4ecdc" />
        </g>
      ))}
    </>
  ),
  settlement: () => (
    <>
      <Sky id="g-st" a="#f6c48c" b="#8fb3a3" />
      <circle cx="200" cy="120" r="60" fill="#ffe7b0" opacity="0.6" />
      <path d="M0,150 Q200,110 400,150 L400,200 L0,200Z" fill="#4f7f35" />
      {[[120, 120], [190, 112], [260, 118], [320, 126]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <rect x="-20" y="0" width="40" height="30" fill="#c9ad7f" />
          <path d="M-26,0 L0,-22 L26,0Z" fill="#8c5e3c" />
          <rect x="-6" y="12" width="12" height="18" fill="#ffd27a" />
        </g>
      ))}
      <path d="M60,200 Q120,170 190,148" stroke="#d9c49a" strokeWidth="10" fill="none" />
    </>
  ),
  deep: () => (
    <>
      <Sky id="g-dp" a="#1d1a16" b="#3a2a1c" />
      <rect x="20" y="40" width="360" height="130" fill="#d8cfbd" />
      {[...Array(18)].map((_, i) => (
        <path key={i} d={`M${20 + i * 20},40 L${20 + i * 20},170`} stroke="#bfb5a0" strokeWidth="2" />
      ))}
      <rect x="20" y="96" width="360" height="16" fill="#3a7ca5" />
      <text x="200" y="110" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="800" letterSpacing="5" fontFamily="sans-serif">
        DEEP LINE · RESERVE
      </text>
      <g fill="#fff4cc">
        {[80, 200, 320].map((x) => (
          <ellipse key={x} cx={x} cy="56" rx="26" ry="6" />
        ))}
      </g>
      <rect y="170" width="400" height="30" fill="#4a4338" />
      <rect x="40" y="130" width="200" height="40" rx="12" fill="#e9c46a" />
      {[60, 100, 140, 180].map((x) => (
        <rect key={x} x={x} y="138" width="26" height="16" rx="3" fill="#ffe7a1" />
      ))}
    </>
  ),
  caravan: () => (
    <>
      <Sky id="g-cv" a="#f2a65a" b="#6a4c6b" />
      <circle cx="320" cy="120" r="34" fill="#ffd9a0" />
      <path d="M0,150 L400,150 L400,200 L0,200Z" fill="#4a3a2c" />
      {[[90, 1], [170, 0.9], [240, 0.8]].map(([x, s], i) => (
        <g key={i} transform={`translate(${x} 150) scale(${s})`} fill="#1f1714">
          <rect x="-34" y="-36" width="60" height="30" rx="4" />
          <circle cx="-22" cy="-4" r="9" />
          <circle cx="16" cy="-4" r="9" />
          <circle cx="44" cy="-48" r="8" />
          <path d="M36,-40 L52,-40 L54,0 L34,0Z" />
          <circle cx="-10" cy="-48" r="5" fill="#ffd166" />
        </g>
      ))}
    </>
  ),
  failed: () => (
    <>
      <Sky id="g-fl" a="#ff7a45" b="#5a1d1a" />
      <circle cx="200" cy="200" r="150" fill="#fff1c4" opacity="0.5" />
      <circle cx="200" cy="200" r="90" fill="#fff8e0" opacity="0.8" />
      <g fill="#2a1410">
        <rect x="70" y="110" width="110" height="90" />
        <path d="M60,110 L125,60 L190,110Z" />
        <rect x="250" y="130" width="80" height="70" />
      </g>
    </>
  ),
  collapse: () => (
    <>
      <Sky id="g-cl" a="#3a332c" b="#14100c" />
      <g fill="#6d6455">
        <path d="M0,0 L160,0 L120,60 L60,40 L0,80Z" />
        <path d="M400,0 L240,0 L270,70 L340,50 L400,90Z" />
        <path d="M120,200 L160,120 L230,140 L280,200Z" />
      </g>
      <g fill="#d8cfbd" opacity="0.6" className="lsh-dust-art">
        {[...Array(16)].map((_, i) => (
          <circle key={i} cx={40 + ((i * 53) % 330)} cy={40 + ((i * 29) % 120)} r={2 + (i % 3)} />
        ))}
      </g>
    </>
  ),
  empty: () => (
    <>
      <Sky id="g-em" a="#3e352b" b="#1d1712" />
      {[50, 100, 150].map((y) => (
        <rect key={y} x="80" y={y} width="240" height="8" rx="3" fill="#a8784e" />
      ))}
      <rect x="120" y="164" width="16" height="22" rx="2" fill="#8d9499" transform="rotate(70 128 175)" />
      <path d="M260,40 l0,0" />
      <text x="200" y="40" textAnchor="middle" className="lsh-chalk" fontSize="18">
        day ...
      </text>
    </>
  ),
  lost: () => (
    <>
      <Sky id="g-ls" a="#8a7a6a" b="#3a3028" />
      <path d="M0,120 Q200,100 400,124 L400,200 L0,200Z" fill="#b3a593" />
      {[...Array(9)].map((_, i) => (
        <ellipse key={i} cx={60 + i * 32} cy={186 - i * 7} rx="6" ry="3" fill="#6d6455" transform={`rotate(-20 ${60 + i * 32} ${186 - i * 7})`} />
      ))}
      <circle cx="340" cy="80" r="24" fill="#d8cfbd" opacity="0.5" />
    </>
  ),
};

export const EventArt = memo(function EventArt({ cat, ending, className = "" }) {
  const Art = ending ? ENDING_ART[ending] || ART.mystery : ART[cat] || ART.family;
  return (
    <svg className={`lsh-art ${className}`} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <Art />
      <rect width="400" height="200" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="6" />
    </svg>
  );
});
