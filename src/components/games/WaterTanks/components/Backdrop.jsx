/**
 * Water Tanks — the lab behind everything: back-wall panels, overhead pipes
 * with a slow light pulse, two pressure gauges, blurred distant glassware and
 * a handful of rising bubbles. Decorative only (aria-hidden, no pointer
 * events), CSS-animated with transforms/opacity, and stripped down on
 * graphics "low" and reduced motion.
 */
import { memo } from "react";

function Backdrop({ variant = "lab", graphics = "high" }) {
  const rich = graphics !== "low";
  return (
    <div className={`wt-backdrop wt-backdrop--${variant}`} aria-hidden="true">
      <svg className="wt-backdrop__svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="wtb-pipe" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b5873" />
            <stop offset="0.45" stopColor="#1d3349" />
            <stop offset="1" stopColor="#0d1a2a" />
          </linearGradient>
          <linearGradient id="wtb-pipe-v" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0d1a2a" />
            <stop offset="0.5" stopColor="#2d4862" />
            <stop offset="1" stopColor="#0d1a2a" />
          </linearGradient>
          <radialGradient id="wtb-gauge" cx="0.5" cy="0.45" r="0.6">
            <stop offset="0" stopColor="#14283b" />
            <stop offset="1" stopColor="#081421" />
          </radialGradient>
          <radialGradient id="wtb-light" cx="0.5" cy="0" r="0.7">
            <stop offset="0" stopColor="#5fe1ff" stopOpacity="0.2" />
            <stop offset="1" stopColor="#5fe1ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="wtb-flask" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5fd8ff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#1a6bb0" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        {/* back wall panels */}
        <g className="wt-bd-panels">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <rect key={i} x={i * 200 + 6} y={-10} width={188} height={700} rx={10} />
          ))}
        </g>
        <rect x="0" y="0" width="1600" height="620" fill="url(#wtb-light)" />

        {/* overhead pipes */}
        <g className="wt-bd-pipes">
          <rect x="-10" y="62" width="1620" height="26" rx="13" fill="url(#wtb-pipe)" />
          <rect x="-10" y="112" width="1620" height="14" rx="7" fill="url(#wtb-pipe)" opacity="0.8" />
          {[140, 520, 980, 1420].map((x) => (
            <g key={x}>
              <rect x={x - 12} y="56" width="24" height="38" rx="4" className="wt-bd-joint" />
              <circle cx={x - 6} cy="62" r="2" className="wt-bd-bolt" />
              <circle cx={x + 6} cy="62" r="2" className="wt-bd-bolt" />
            </g>
          ))}
          <rect x="300" y="88" width="20" height="240" fill="url(#wtb-pipe-v)" />
          <rect x="1270" y="88" width="20" height="180" fill="url(#wtb-pipe-v)" />
          <rect x="292" y="320" width="36" height="14" rx="4" className="wt-bd-joint" />
          <rect x="1262" y="262" width="36" height="14" rx="4" className="wt-bd-joint" />
          {rich && <path className="wt-bd-pulse" d="M-10,75 H1610" />}
          {rich && <path className="wt-bd-pulse wt-bd-pulse--b" d="M-10,119 H1610" />}
        </g>

        {/* gauges */}
        {[{ x: 150, y: 250, r: 54, d: "0s" }, { x: 1460, y: 300, r: 44, d: "-3s" }].map((g, k) => (
          <g key={k} className="wt-bd-gauge" transform={`translate(${g.x} ${g.y})`}>
            <circle r={g.r + 7} className="wt-bd-gauge__ring" />
            <circle r={g.r} fill="url(#wtb-gauge)" />
            {Array.from({ length: 9 }, (_, i) => {
              const a = (-210 + i * 30) * (Math.PI / 180);
              return <line key={i} x1={Math.cos(a) * g.r * 0.72} y1={Math.sin(a) * g.r * 0.72} x2={Math.cos(a) * g.r * 0.86} y2={Math.sin(a) * g.r * 0.86} className="wt-bd-gauge__tick" />;
            })}
            <path d={`M${-g.r * 0.6},${g.r * 0.35} A${g.r * 0.7},${g.r * 0.7} 0 0 1 ${g.r * 0.6},${g.r * 0.35}`} className="wt-bd-gauge__arc" transform="rotate(180)" />
            <g className="wt-bd-gauge__needle" style={{ animationDelay: g.d }}>
              <line x1="0" y1="0" x2={g.r * 0.66} y2="0" />
            </g>
            <circle r="5" className="wt-bd-gauge__hub" />
          </g>
        ))}

        {/* distant glassware on a back shelf */}
        <g className="wt-bd-shelf">
          <rect x="0" y="600" width="1600" height="10" className="wt-bd-shelf__board" />
          {rich && (
            <g className="wt-bd-glassware">
              <path d="M420,600 v-60 h-14 v-10 h52 v10 h-14 v60 Z" />
              <path d="M470,600 q-28,0 -28,-30 q0,-24 18,-36 v-34 h20 v34 q18,12 18,36 q0,30 -28,30 Z" />
              <path d="M1100,600 v-90 h-10 v-8 h44 v8 h-10 v90 Z" />
              <path d="M1180,600 q-36,0 -36,-26 l22,-50 v-30 h28 v30 l22,50 q0,26 -36,26 Z" />
              <rect x="408" y="560" width="24" height="40" fill="url(#wtb-flask)" />
              <rect x="1092" y="548" width="28" height="52" fill="url(#wtb-flask)" />
            </g>
          )}
        </g>
      </svg>

      {rich && (
        <div className="wt-bubbles">
          {[8, 21, 37, 63, 78, 91].map((x, i) => (
            <span key={i} style={{ left: `${x}%`, animationDelay: `${-i * 2.3}s`, animationDuration: `${11 + (i % 3) * 3}s`, "--s": `${0.6 + (i % 3) * 0.3}` }} />
          ))}
        </div>
      )}
      <div className="wt-backdrop__vignette" />
    </div>
  );
}

export default memo(Backdrop);
