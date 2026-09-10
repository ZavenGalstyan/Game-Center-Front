/**
 * Cake Designer — a small layered-SVG portrait for a fictional customer.
 * Tokens come from data/customers.js. No photos, no real people.
 */

export default function CustomerAvatar({ id, data, size = 64 }) {
  const c = data;
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" className="cd-avatar" aria-hidden="true">
      <defs>
        <clipPath id={`av-${id}`}><circle cx="32" cy="32" r="31" /></clipPath>
        <linearGradient id={`av-bg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={lighten(c.top, 0.5)} />
          <stop offset="1" stopColor={c.top} />
        </linearGradient>
      </defs>
      <g clipPath={`url(#av-${id})`}>
        <rect width="64" height="64" fill={`url(#av-bg-${id})`} />
        {/* shoulders / top */}
        <path d="M8 64 C 10 46 22 40 32 40 C 42 40 54 46 56 64 Z" fill={c.top} />
        <path d="M8 64 C 10 46 22 40 32 40 C 42 40 54 46 56 64 Z" fill="rgba(255,255,255,0.12)" />
        {/* hair back */}
        {c.style !== "bob" && <ellipse cx="32" cy="30" rx="18" ry="19" fill={c.hair} />}
        {/* face */}
        <ellipse cx="32" cy="29" rx="13" ry="14.5" fill={c.skin} />
        <ellipse cx="32" cy="24" rx="12" ry="10" fill={lighten(c.skin, 0.12)} opacity="0.5" />
        {/* cheeks */}
        <circle cx="25" cy="31" r="2.4" fill="#f2a0a8" opacity="0.5" />
        <circle cx="39" cy="31" r="2.4" fill="#f2a0a8" opacity="0.5" />
        {/* eyes + smile */}
        <circle cx="27" cy="28" r="1.7" fill="#3a2a28" />
        <circle cx="37" cy="28" r="1.7" fill="#3a2a28" />
        <path d="M28 34 q 4 4 8 0" stroke="#b56b62" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        {/* hair front by style */}
        <HairFront style={c.style} hair={c.hair} />
        {/* accessory */}
        <Accessory kind={c.accent} />
      </g>
      <circle cx="32" cy="32" r="31" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" />
    </svg>
  );
}

function HairFront({ style, hair }) {
  switch (style) {
    case "long":
      return <path d="M14 22 C 16 10 48 10 50 22 L 50 40 C 46 26 44 20 32 19 C 20 20 18 26 14 40 Z" fill={hair} />;
    case "wavy":
      return <path d="M15 24 C 15 10 49 10 49 24 C 46 20 44 18 32 18 C 20 18 18 20 15 24 Z M15 24 q 3 8 -1 16 M49 24 q -3 8 1 16" fill={hair} stroke={hair} strokeWidth="3" strokeLinecap="round" />;
    case "curly":
      return (
        <g fill={hair}>
          {[[16, 18], [24, 13], [32, 12], [40, 13], [48, 18], [16, 28], [48, 28]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="6" />
          ))}
        </g>
      );
    case "bun":
      return (
        <g fill={hair}>
          <circle cx="32" cy="10" r="6" />
          <path d="M17 24 C 17 12 47 12 47 24 C 44 19 40 17 32 17 C 24 17 20 19 17 24 Z" />
        </g>
      );
    case "pony":
      return (
        <g fill={hair}>
          <path d="M16 24 C 16 12 48 12 48 24 C 44 18 40 16 32 16 C 24 16 20 18 16 24 Z" />
          <path d="M46 20 q 10 8 4 24 q -6 -4 -8 -20 Z" />
        </g>
      );
    case "beret":
    case "bob":
    default:
      return <path d="M15 26 C 15 12 49 12 49 26 C 49 30 47 34 46 36 C 44 24 42 18 32 18 C 22 18 20 24 18 36 C 17 34 15 30 15 26 Z" fill={hair} />;
  }
}

function Accessory({ kind }) {
  switch (kind) {
    case "bow":
      return (
        <g transform="translate(44 14)">
          <path d="M0 0 L -7 -4 L -7 4 Z" fill="#ff5d8f" />
          <path d="M0 0 L 7 -4 L 7 4 Z" fill="#ff5d8f" />
          <circle r="2" fill="#e03b6f" />
        </g>
      );
    case "glasses":
      return (
        <g stroke="#3a2a28" strokeWidth="1.4" fill="none">
          <circle cx="27" cy="28" r="4" />
          <circle cx="37" cy="28" r="4" />
          <path d="M31 28 h2" />
        </g>
      );
    case "hoops":
      return (
        <g stroke="#e8c46b" strokeWidth="1.6" fill="none">
          <circle cx="19.5" cy="33" r="2.4" />
          <circle cx="44.5" cy="33" r="2.4" />
        </g>
      );
    case "flower":
      return (
        <g transform="translate(43 15)">
          {Array.from({ length: 5 }).map((_, i) => {
            const a = (i / 5) * Math.PI * 2;
            return <circle key={i} cx={Math.cos(a) * 3} cy={Math.sin(a) * 3} r="2.4" fill="#fff" />;
          })}
          <circle r="1.6" fill="#f7db8a" />
        </g>
      );
    case "beret":
      return <path d="M18 16 C 20 8 42 8 46 16 C 40 14 24 14 18 16 Z" fill="#e0524f" />;
    case "pearls":
      return (
        <g fill="#f3ede2">
          {Array.from({ length: 7 }).map((_, i) => (
            <circle key={i} cx={22 + i * 3.3} cy={40 + Math.sin(i) * 1.5} r="1.5" />
          ))}
        </g>
      );
    case "star":
      return <path transform="translate(43 15)" d="M0 -4 L1 -1 L4 -1 L1.6 1 L2.5 4 L0 2 L-2.5 4 L-1.6 1 L-4 -1 L-1 -1 Z" fill="#fff" />;
    default:
      return null;
  }
}

function lighten(hex, amt) {
  const h = (hex || "#cccccc").replace("#", "");
  if (h.length !== 6) return hex;
  const r = Math.round(parseInt(h.slice(0, 2), 16) + (255 - parseInt(h.slice(0, 2), 16)) * amt);
  const g = Math.round(parseInt(h.slice(2, 4), 16) + (255 - parseInt(h.slice(2, 4), 16)) * amt);
  const b = Math.round(parseInt(h.slice(4, 6), 16) + (255 - parseInt(h.slice(4, 6), 16)) * amt);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
