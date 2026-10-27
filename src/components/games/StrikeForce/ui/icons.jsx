/** Strike Force — inline SVG icons and map card art (all original). */

const S = (p) => ({ width: p.size || 22, height: p.size || 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, className: p.className });

export const Icon = {
  play: (p) => (
    <svg {...S(p)}>
      <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />
    </svg>
  ),
  modes: (p) => (
    <svg {...S(p)}>
      <path d="M4 20 15 9M9 4l11 11M14 4h6v6" />
      <path d="m4 4 5 5M20 20l-4-4" />
    </svg>
  ),
  map: (p) => (
    <svg {...S(p)}>
      <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  ),
  loadout: (p) => (
    <svg {...S(p)}>
      <path d="M2 10h14l2-2h4v4h-3l-1 2H9l-1 4H5l1-4H2z" />
    </svg>
  ),
  settings: (p) => (
    <svg {...S(p)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  stats: (p) => (
    <svg {...S(p)}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  back: (p) => (
    <svg {...S(p)}>
      <path d="M15 18 9 12l6-6" />
    </svg>
  ),
  tdm: (p) => (
    <svg {...S(p)}>
      <path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" />
      <path d="M12 3v18" />
    </svg>
  ),
  ffa: (p) => (
    <svg {...S(p)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v5M12 18v5M1 12h5M18 12h5" />
    </svg>
  ),
  dom: (p) => (
    <svg {...S(p)}>
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </svg>
  ),
  pause: (p) => (
    <svg {...S(p)}>
      <path d="M8 5v14M16 5v14" strokeWidth="3" />
    </svg>
  ),
  board: (p) => (
    <svg {...S(p)}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  reload: (p) => (
    <svg {...S(p)}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
    </svg>
  ),
  jump: (p) => (
    <svg {...S(p)}>
      <path d="m6 14 6-6 6 6M6 20l6-6 6 6" />
    </svg>
  ),
  crouch: (p) => (
    <svg {...S(p)}>
      <path d="m6 10 6 6 6-6M6 4l6 6 6-6" />
    </svg>
  ),
  ads: (p) => (
    <svg {...S(p)}>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
    </svg>
  ),
  fire: (p) => (
    <svg {...S(p)}>
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  ),
  swap: (p) => (
    <svg {...S(p)}>
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </svg>
  ),
  sprint: (p) => (
    <svg {...S(p)}>
      <path d="M13 4a2 2 0 1 0 0 .1M9 20l3-6 3 2v5M7 12l3-4 4 1 3 3 3-1" />
    </svg>
  ),
  fullscreen: (p) => (
    <svg {...S(p)}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  ),
  skull: (p) => (
    <svg {...S(p)}>
      <path d="M12 3a7 7 0 0 0-7 7c0 2.4 1.2 4.1 3 5v3h8v-3c1.8-.9 3-2.6 3-5a7 7 0 0 0-7-7z" />
      <circle cx="9.5" cy="10.5" r="1.2" fill="currentColor" />
      <circle cx="14.5" cy="10.5" r="1.2" fill="currentColor" />
    </svg>
  ),
  head: (p) => (
    <svg {...S(p)}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  ),
  uav: (p) => (
    <svg {...S(p)}>
      <path d="M2 12h20M12 8v8M6 10v4M18 10v4" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  bolt: (p) => (
    <svg {...S(p)}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  ),
  shield: (p) => (
    <svg {...S(p)}>
      <path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" />
    </svg>
  ),
  check: (p) => (
    <svg {...S(p)}>
      <path d="m5 12 5 5 9-10" />
    </svg>
  ),
  lock: (p) => (
    <svg {...S(p)}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
};

/* map card art: layered silhouettes over a themed sky */
export function MapArt({ id }) {
  const common = { viewBox: "0 0 320 140", preserveAspectRatio: "xMidYMax slice", className: "sf-mapart__svg", "aria-hidden": true };
  if (id === "harbor")
    return (
      <svg {...common}>
        <defs>
          <linearGradient id="h-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4b5d7a" />
            <stop offset="0.65" stopColor="#e39a62" />
            <stop offset="1" stopColor="#f2c48c" />
          </linearGradient>
        </defs>
        <rect width="320" height="140" fill="url(#h-sky)" />
        <circle cx="236" cy="96" r="16" fill="#ffd9a2" opacity="0.85" />
        <path d="M0 112h320v28H0z" fill="#1c2d38" />
        <path d="M40 112V40h6v72M40 40h70v6H40M100 46v24M96 70h8v10h-8z" stroke="#1d1a1f" strokeWidth="3" fill="none" />
        <path d="M190 112V30h5v82M220 112V30h5v82M186 30h60v8h-60zM240 38l30 30" stroke="#24202a" strokeWidth="3" fill="none" />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={120 + i * 13} y={98 - (i % 2) * 12} width="12" height={14 + (i % 2) * 12} fill={["#a6402e", "#2e6f9e", "#c9822b", "#3f7a4b", "#6d4a8c"][i]} />
        ))}
        <path d="M0 118h320v4H0z" fill="#e2b324" opacity="0.6" />
      </svg>
    );
  if (id === "desert")
    return (
      <svg {...common}>
        <defs>
          <linearGradient id="d-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5d9bd6" />
            <stop offset="1" stopColor="#f3dfb8" />
          </linearGradient>
        </defs>
        <rect width="320" height="140" fill="url(#d-sky)" />
        <circle cx="70" cy="34" r="14" fill="#fff6dc" />
        <path d="M0 108q60-14 120 0t120 0 80-6v38H0z" fill="#c9a877" />
        <path d="M30 108V60h30v48M26 60h38l-4-8H30zM36 72h6v8h-6zM48 72h6v8h-6z" fill="#8a6f4e" />
        <path d="M150 108V80h60v28zM160 88h8v8h-8zM176 88h8v8h-8zM192 88h8v8h-8z" fill="#9b8462" />
        <path d="M262 108l4-30 4 30M258 78h16M270 50v28M262 50q8-6 16 0" stroke="#6b5a3c" strokeWidth="3" fill="none" />
        <path d="M0 120h320v20H0z" fill="#b89768" />
      </svg>
    );
  if (id === "neon")
    return (
      <svg {...common}>
        <defs>
          <linearGradient id="n-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#090c1d" />
            <stop offset="1" stopColor="#3a1f55" />
          </linearGradient>
        </defs>
        <rect width="320" height="140" fill="url(#n-sky)" />
        {[
          [10, 40, 40],
          [55, 20, 30],
          [90, 55, 36],
          [132, 10, 44],
          [182, 35, 34],
          [222, 25, 40],
          [268, 45, 50],
        ].map(([x, y, w], i) => (
          <g key={i}>
            <rect x={x} y={y} width={w} height={140 - y} fill="#11152a" />
            {Array.from({ length: 6 }).map((_, k) => (
              <rect key={k} x={x + 5 + (k % 3) * (w / 3.2)} y={y + 10 + Math.floor(k / 3) * 22} width="5" height="7" fill={k % 2 ? "#ffc46a" : "#4fd6ff"} opacity="0.6" />
            ))}
          </g>
        ))}
        <rect x="96" y="66" width="24" height="8" fill="#ff3fa8" />
        <rect x="190" y="58" width="18" height="18" fill="none" stroke="#3fe9ff" strokeWidth="2.5" />
        <path d="M0 118h320v22H0z" fill="#121424" />
        <path d="M0 122h320" stroke="#ff3fa8" strokeWidth="1.5" opacity="0.5" />
      </svg>
    );
  if (id === "forest")
    return (
      <svg {...common}>
        <defs>
          <linearGradient id="f-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8fb6cf" />
            <stop offset="1" stopColor="#d9e2c9" />
          </linearGradient>
        </defs>
        <rect width="320" height="140" fill="url(#f-sky)" />
        {Array.from({ length: 14 }).map((_, i) => {
          const x = i * 24 + (i % 2) * 8;
          const h = 46 + ((i * 37) % 30);
          return <path key={i} d={`M${x} 120 L${x + 12} ${120 - h} L${x + 24} 120 z`} fill={i % 2 ? "#2f4a2c" : "#3d5b35"} />;
        })}
        <path d="M120 120V92h44v28zM114 92l28-16 28 16z" fill="#6b4c32" />
        <rect x="134" y="102" width="10" height="18" fill="#3a2a1d" />
        <path d="M0 118h320v22H0z" fill="#4a5a2e" />
      </svg>
    );
  return (
    <svg {...common}>
      <defs>
        <linearGradient id="s-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8aa6c4" />
          <stop offset="1" stopColor="#e6edf4" />
        </linearGradient>
      </defs>
      <rect width="320" height="140" fill="url(#s-sky)" />
      <path d="M0 100 60 40l40 34 50-50 60 60 40-30 70 46v40H0z" fill="#b8c6d6" />
      <path d="M60 40l14 12-8 4-6-6-6 6-8-4zM150 24l18 18-10 4-8-8-8 8-10-4z" fill="#ffffff" />
      <path d="M40 120V96h70v24zM120 120v-18h60v18z" fill="#5d6a77" />
      <path d="M230 120V84M222 84q8-14 22-4" stroke="#4a5562" strokeWidth="3" fill="none" />
      <circle cx="244" cy="80" r="10" fill="none" stroke="#4a5562" strokeWidth="3" />
      <path d="M0 118h320v22H0z" fill="#eef3f7" />
    </svg>
  );
}
