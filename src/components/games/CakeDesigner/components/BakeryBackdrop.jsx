/**
 * Cake Designer — the bakery-workstation backdrop (SVG, no images).
 * A warm counter, shelves with pastry silhouettes, hanging lights and a
 * couple of plants. `theme` tints it per collection; it never leaves the
 * game — the global Game Center theme is untouched.
 */

export default function BakeryBackdrop({ theme, quality = "high" }) {
  const t = theme;
  const rich = quality !== "low";
  return (
    <svg className="cd-backdrop" viewBox="0 0 1200 675" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="cd-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.bg1} />
          <stop offset="1" stopColor={t.bg0} />
        </linearGradient>
        <radialGradient id="cd-lamp" cx="0.5" cy="0.2" r="0.75">
          <stop offset="0" stopColor={t.accent} stopOpacity="0.5" />
          <stop offset="1" stopColor={t.accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cd-counter" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(t.panel, "#ffffff", 0.16)} />
          <stop offset="1" stopColor={t.panel} />
        </linearGradient>
      </defs>

      <rect width="1200" height="675" fill="url(#cd-wall)" />
      <rect width="1200" height="675" fill="url(#cd-lamp)" />

      {/* shelves */}
      {rich && [140, 250].map((y, si) => (
        <g key={si}>
          <rect x="80" y={y} width="1040" height="10" rx="3" fill={mix(t.panel, "#000", 0.15)} />
          {Array.from({ length: 12 }).map((_, i) => {
            const x = 110 + i * 84;
            const kind = (i + si) % 3;
            return (
              <g key={i} transform={`translate(${x} ${y})`} opacity="0.55">
                {kind === 0 && <path d="M-14 0 C -14 -18 14 -18 14 0 Z" fill={t.accent2} />}
                {kind === 1 && <rect x="-12" y="-20" width="24" height="20" rx="4" fill={t.accent} />}
                {kind === 2 && <circle cx="0" cy="-11" r="12" fill={mix(t.accent, t.accent2, 0.5)} />}
              </g>
            );
          })}
        </g>
      ))}

      {/* hanging lights */}
      {[300, 600, 900].map((x, i) => (
        <g key={i}>
          <line x1={x} y1="0" x2={x} y2="70" stroke={mix(t.line, "#000", 0.2)} strokeWidth="3" />
          <path d={`M${x - 26} 70 h52 l-10 34 h-32 z`} fill={mix(t.panel, "#fff", 0.1)} />
          <ellipse cx={x} cy="108" rx="20" ry="9" fill={t.accent} opacity="0.85" />
          {rich && <ellipse cx={x} cy="150" rx="90" ry="120" fill="url(#cd-lamp)" />}
        </g>
      ))}

      {/* plants */}
      {rich && [70, 1130].map((x, i) => (
        <g key={i} transform={`translate(${x} 470)`}>
          <path d="M-16 40 h32 l-5 -34 h-22 z" fill={mix(t.panel, "#000", 0.1)} />
          {[-1, 0, 1].map((k) => (
            <path key={k} d={`M0 6 q ${k * 26} -34 ${k * 12} -66`} stroke={mix(t.accent2, "#3a7d4a", 0.6)}
              strokeWidth="6" fill="none" strokeLinecap="round" />
          ))}
        </g>
      ))}

      {/* counter */}
      <path d="M0 520 L1200 520 L1200 675 L0 675 Z" fill="url(#cd-counter)" />
      <rect x="0" y="512" width="1200" height="16" rx="4" fill={mix(t.panel, "#fff", 0.22)} />
      <rect x="0" y="512" width="1200" height="5" fill={t.accent} opacity="0.4" />
    </svg>
  );
}

function mix(a, b, t) {
  const pa = hx(a);
  const pb = hx(b);
  if (!pa || !pb) return a;
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function hx(h) {
  const s = (h || "").replace("#", "");
  if (s.length !== 6) return null;
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
