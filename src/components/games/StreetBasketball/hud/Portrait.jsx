/**
 * Street Basketball — a stylized SVG head-and-shoulders portrait generated
 * from the same look data the 3D character uses (skin, hair style/colour,
 * beard, headband, jersey colours, number). Cheap enough for 25 cards.
 */
export default function Portrait({ look, size = 96, mirror = false, className = "" }) {
  const L = look;
  const skin = L.skin || "#c68a62";
  const hair = L.hairColor || "#1b1410";
  const jersey = L.jersey || "#e8a33a";
  const trim = L.jerseyTrim || "#ffffff";
  const shade = "rgba(0,0,0,0.18)";
  const style = L.hair || "short";
  return (
    <svg
      className={`sb-portrait ${className}`}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={mirror ? { transform: "scaleX(-1)" } : undefined}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`bg-${jersey.slice(1)}`} cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#bg-${jersey.slice(1)})`} />
      {/* shoulders + jersey */}
      <path d="M8 100 C 10 78, 28 70, 38 68 L 62 68 C 72 70, 90 78, 92 100 Z" fill={skin} />
      <path d="M20 100 C 22 82, 30 74, 38 71 C 44 80, 56 80, 62 71 C 70 74, 78 82, 80 100 Z" fill={jersey} />
      <path d="M38 71 C 44 80, 56 80, 62 71" fill="none" stroke={trim} strokeWidth="2.4" />
      <path d="M20 100 C 22 82, 30 74, 38 71" fill="none" stroke={trim} strokeWidth="2" />
      <path d="M80 100 C 78 82, 70 74, 62 71" fill="none" stroke={trim} strokeWidth="2" />
      <text x="50" y="96" textAnchor="middle" fontSize="13" fontWeight="900" fill={trim} fontFamily="Arial Black, Impact, sans-serif">{L.number ?? ""}</text>
      {/* neck */}
      <path d="M42 58 L 42 72 C 46 76, 54 76, 58 72 L 58 58 Z" fill={skin} />
      <path d="M42 66 C 46 70, 54 70, 58 66 L 58 72 C 54 76, 46 76, 42 72 Z" fill={shade} />
      {/* back hair */}
      {(style === "ponytail" || style === "braids") && <path d="M30 40 C 26 60, 30 74, 36 76 L 64 76 C 70 74, 74 60, 70 40 Z" fill={hair} />}
      {/* ears */}
      <ellipse cx="29" cy="43" rx="4" ry="6" fill={skin} />
      <ellipse cx="71" cy="43" rx="4" ry="6" fill={skin} />
      {/* head */}
      <path d="M30 38 C 30 20, 70 20, 70 38 L 70 46 C 70 58, 60 64, 50 64 C 40 64, 30 58, 30 46 Z" fill={skin} />
      {/* beard */}
      {L.beard && <path d="M32 46 C 34 58, 42 64, 50 64 C 58 64, 66 58, 68 46 C 64 54, 58 57, 50 57 C 42 57, 36 54, 32 46 Z" fill={hair} opacity="0.9" />}
      {/* face */}
      <ellipse cx="41.5" cy="42" rx="2.4" ry="2.2" fill="#1a1411" />
      <ellipse cx="58.5" cy="42" rx="2.4" ry="2.2" fill="#1a1411" />
      <path d="M37 37.5 L 45 36.5" stroke={hair} strokeWidth="2" strokeLinecap="round" />
      <path d="M55 36.5 L 63 37.5" stroke={hair} strokeWidth="2" strokeLinecap="round" />
      <path d="M50 44 C 49 48, 48 50, 50 51" stroke={shade} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M45 55 C 48 56.5, 52 56.5, 55 55" stroke="#6d3b2e" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* hair styles */}
      <Hair style={style} color={hair} />
      {L.headband && <path d="M29 31 C 40 26, 60 26, 71 31 L 71 36 C 60 31, 40 31, 29 36 Z" fill={L.headband} />}
    </svg>
  );
}

function Hair({ style, color }) {
  switch (style) {
    case "bald":
      return null;
    case "buzz":
      return <path d="M30 36 C 30 20, 70 20, 70 36 C 64 29, 36 29, 30 36 Z" fill={color} opacity="0.85" />;
    case "fade":
      return (
        <g fill={color}>
          <path d="M31 34 C 31 17, 69 17, 69 34 C 63 27, 37 27, 31 34 Z" />
          <path d="M30 36 L 30 44 C 31 40, 31 38, 33 36 Z M70 36 L 70 44 C 69 40, 69 38, 67 36 Z" opacity="0.5" />
        </g>
      );
    case "curly":
      return (
        <g fill={color}>
          {[30, 36, 42, 48, 54, 60, 66, 70].map((x, i) => <circle key={i} cx={x} cy={24 + (i % 2) * 4} r="7" />)}
          <path d="M28 36 C 28 22, 72 22, 72 36 C 64 30, 36 30, 28 36 Z" />
        </g>
      );
    case "twists":
      return (
        <g fill={color}>
          <path d="M29 36 C 29 20, 71 20, 71 36 C 64 29, 36 29, 29 36 Z" />
          {[30, 37, 44, 51, 58, 65, 70].map((x, i) => <rect key={i} x={x - 2.5} y={12 + (i % 2) * 3} width="5" height="14" rx="2.5" transform={`rotate(${(x - 50) * 0.8} ${x} 26)`} />)}
        </g>
      );
    case "bun":
      return (
        <g fill={color}>
          <circle cx="50" cy="15" r="8" />
          <path d="M30 36 C 30 20, 70 20, 70 36 C 64 29, 36 29, 30 36 Z" />
        </g>
      );
    case "ponytail":
    case "braids":
      return <path d="M29 38 C 29 19, 71 19, 71 38 C 64 29, 36 29, 29 38 Z" fill={color} />;
    case "swept":
      return <path d="M30 36 C 28 18, 60 12, 72 30 C 62 24, 48 26, 42 30 C 38 30, 33 32, 30 36 Z" fill={color} />;
    default:
      return <path d="M30 35 C 30 18, 70 18, 70 35 C 64 28, 36 28, 30 35 Z" fill={color} />;
  }
}
