/**
 * Lost Toy — the little illustrated "snapshots" on the Memories screen and in
 * the level journey map. Plain SVG, drawn like a child's storybook: soft
 * shapes, warm colours, one small Pip in every scene.
 */
function Pip({ x, y, s = 1, scarf = "#d9473b" }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="13" rx="7" ry="2" fill="rgba(0,0,0,0.15)" />
      <rect x="-5" y="2" width="10" height="10" rx="4" fill="#4b72b0" />
      <circle cx="0" cy="-4" r="7" fill="#f1dfc3" />
      <circle cx="-6" cy="-9" r="2.5" fill="#f1dfc3" />
      <circle cx="6" cy="-9" r="2.5" fill="#f1dfc3" />
      <circle cx="-2.4" cy="-4.5" r="1.2" fill="#1d2230" />
      <circle cx="2.4" cy="-4.5" r="1.2" fill="#1d2230" />
      <path d="M-2 -1.5 Q0 0 2 -1.5" stroke="#5b3a2a" strokeWidth="0.7" fill="none" />
      <rect x="-5.5" y="1" width="11" height="2.6" rx="1.3" fill={scarf} />
      <rect x="2" y="2" width="2.6" height="6" rx="1" fill={scarf} />
    </g>
  );
}

const SCENES = {
  shelf: (
    <>
      <rect width="160" height="110" fill="#f6dcb6" />
      <rect x="0" y="0" width="160" height="22" fill="#fbe7c9" />
      <rect x="18" y="30" width="124" height="6" rx="2" fill="#c8956a" />
      <rect x="18" y="74" width="124" height="6" rx="2" fill="#c8956a" />
      <rect x="22" y="12" width="7" height="18" fill="#c0504d" />
      <rect x="30" y="14" width="6" height="16" fill="#2f6f8f" />
      <rect x="37" y="11" width="8" height="19" fill="#6a8f3f" />
      <rect x="96" y="48" width="34" height="14" rx="3" fill="#d9473b" />
      <circle cx="104" cy="64" r="4" fill="#2a2a2e" />
      <circle cx="122" cy="64" r="4" fill="#2a2a2e" />
      <rect x="120" y="40" width="10" height="10" fill="#f2c14e" />
      <Pip x={70} y={60} s={1.6} />
      <circle cx="140" cy="16" r="10" fill="#fff3c4" opacity="0.8" />
    </>
  ),
  tea: (
    <>
      <rect width="160" height="110" fill="#fde7e1" />
      <ellipse cx="80" cy="88" rx="62" ry="12" fill="#f4f0e6" />
      <path d="M42 74 h20 v10 a10 6 0 0 1 -20 0z" fill="#ffffff" stroke="#e07a5f" />
      <path d="M98 74 h20 v10 a10 6 0 0 1 -20 0z" fill="#ffffff" stroke="#4fb3a8" />
      <circle cx="130" cy="52" r="16" fill="#c98d5a" />
      <circle cx="130" cy="30" r="12" fill="#c98d5a" />
      <circle cx="121" cy="21" r="5" fill="#c98d5a" />
      <circle cx="139" cy="21" r="5" fill="#c98d5a" />
      <circle cx="126" cy="29" r="1.6" fill="#1d2230" />
      <circle cx="134" cy="29" r="1.6" fill="#1d2230" />
      <path d="M70 70 l10 -14 l10 14z" fill="#f28da0" />
      <circle cx="80" cy="54" r="3" fill="#d9473b" />
      <Pip x={40} y={52} s={1.5} />
    </>
  ),
  rain: (
    <>
      <rect width="160" height="110" fill="#8fa6c9" />
      <rect x="20" y="10" width="120" height="80" rx="4" fill="#bcd0e6" stroke="#fff8ee" strokeWidth="6" />
      <rect x="77" y="10" width="6" height="80" fill="#fff8ee" />
      {[30, 52, 96, 118, 66, 108].map((x, i) => (
        <path key={i} d={`M${x} ${20 + i * 9} q2 6 0 10 q-2 -4 0 -10z`} fill="#eaf4ff" />
      ))}
      <rect x="10" y="88" width="140" height="8" fill="#fff8ee" />
      <Pip x={60} y={74} s={1.3} />
    </>
  ),
  book: (
    <>
      <rect width="160" height="110" fill="#28356a" />
      <path d="M20 86 Q80 70 80 86 Q80 70 140 86 V40 Q80 26 80 40 Q80 26 20 40z" fill="#f7f3ea" />
      <path d="M80 40 V86" stroke="#c9b89a" />
      <circle cx="112" cy="54" r="12" fill="#ffe27a" />
      <circle cx="118" cy="50" r="11" fill="#f7f3ea" />
      <circle cx="40" cy="56" r="2" fill="#ffe27a" />
      <circle cx="52" cy="48" r="1.5" fill="#ffe27a" />
      <Pip x={80} y={22} s={1.2} />
    </>
  ),
  box: (
    <>
      <rect width="160" height="110" fill="#2b2f4a" />
      <path d="M30 50 h100 v50 h-100z" fill="#c79a64" />
      <path d="M30 50 l-14 -18 h100 l14 18z" fill="#d9b98f" />
      <circle cx="60" cy="48" r="9" fill="#c98d5a" />
      <circle cx="96" cy="46" r="8" fill="#4fb3a8" />
      <rect x="106" y="38" width="12" height="12" fill="#f2c14e" />
      <Pip x={78} y={36} s={1.2} />
      <circle cx="132" cy="18" r="6" fill="#ffe27a" />
    </>
  ),
  garden: (
    <>
      <rect width="160" height="110" fill="#bfe0f5" />
      <rect y="70" width="160" height="40" fill="#7fae4f" />
      {[10, 26, 44, 120, 138, 150].map((x, i) => (
        <path key={i} d={`M${x} 110 q4 -${40 + (i % 3) * 14} 8 -${50 + (i % 2) * 12} q-2 ${30} 4 ${60}z`} fill="#5f9b52" />
      ))}
      <circle cx="104" cy="40" r="10" fill="#f28da0" />
      <circle cx="104" cy="40" r="4" fill="#ffd23a" />
      <rect x="103" y="48" width="2" height="30" fill="#5f9b52" />
      <ellipse cx="74" cy="66" rx="6" ry="5" fill="#d9473b" />
      <circle cx="72" cy="64" r="1" fill="#1d2230" />
      <circle cx="76" cy="67" r="1" fill="#1d2230" />
      <Pip x={60} y={84} s={1.3} />
    </>
  ),
  fort: (
    <>
      <rect width="160" height="110" fill="#3b2a3e" />
      <path d="M20 100 L80 30 L140 100z" fill="#6f9bd1" />
      <path d="M80 30 L60 100 h40z" fill="#f4e3b2" />
      <circle cx="80" cy="84" r="16" fill="#ffd27a" opacity="0.55" />
      <Pip x={80} y={82} s={1.2} />
    </>
  ),
  birthday: (
    <>
      <rect width="160" height="110" fill="#fff1d6" />
      <rect x="44" y="60" width="72" height="30" rx="6" fill="#f28da0" />
      <rect x="44" y="56" width="72" height="8" rx="4" fill="#ffffff" />
      {[56, 70, 84, 98].map((x) => (
        <g key={x}>
          <rect x={x} y="42" width="4" height="14" fill="#4fb3a8" />
          <path d={`M${x + 2} 34 q3 4 0 8 q-3 -4 0 -8z`} fill="#ffb43a" />
        </g>
      ))}
      <rect x="120" y="70" width="22" height="20" fill="#3f7fd6" />
      <rect x="129" y="70" width="4" height="20" fill="#f2c14e" />
      <Pip x={28} y={74} s={1.3} />
    </>
  ),
  bedtime: (
    <>
      <rect width="160" height="110" fill="#1e2448" />
      <rect x="18" y="62" width="124" height="34" rx="8" fill="#e7cfa8" />
      <rect x="22" y="56" width="116" height="16" rx="6" fill="#f7f2ea" />
      <rect x="50" y="62" width="88" height="30" rx="6" fill="#6f9bd1" />
      <circle cx="136" cy="30" r="10" fill="#ffe27a" />
      <circle cx="142" cy="26" r="9" fill="#1e2448" />
      <circle cx="24" cy="44" r="8" fill="#ffd27a" opacity="0.7" />
      <Pip x={40} y={58} s={1.1} />
    </>
  ),
  home: (
    <>
      <rect width="160" height="110" fill="#ffd9a6" />
      <rect x="0" y="0" width="160" height="40" fill="#ffe9c9" />
      <rect x="24" y="44" width="112" height="6" rx="2" fill="#c8956a" />
      <rect x="24" y="86" width="112" height="6" rx="2" fill="#c8956a" />
      <circle cx="44" cy="74" r="10" fill="#c98d5a" />
      <rect x="104" y="64" width="20" height="20" fill="#e85d4a" />
      <Pip x={78} y={70} s={1.5} scarf="#e7b53c" />
      <path d="M78 30 l3 6 6 1 -4.5 4 1 6 -5.5 -3 -5.5 3 1 -6 -4.5 -4 6 -1z" fill="#f3c25a" />
    </>
  ),
};

export default function MemoryArt({ scene, locked }) {
  return (
    <svg className={`lt-memart${locked ? " is-locked" : ""}`} viewBox="0 0 160 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {SCENES[scene] || SCENES.shelf}
    </svg>
  );
}

export { Pip };
