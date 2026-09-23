/**
 * Laser Maze — per-world backdrop: a slice-scaled SVG scene plus a handful
 * of CSS-animated ambient particles. Purely decorative (pointer-events off),
 * memoized per (world, graphics, particles, motion) so gameplay renders
 * never touch it. Particles are plain spans animated by CSS keyframes —
 * no per-frame React work.
 */
import { memo } from "react";

const PARTICLES = { low: 0, medium: 12, high: 26 };

function rand(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function Deco({ world, rich }) {
  const a = world.accent;
  const b = world.accent2;
  const r = rand(world.id * 97 + 3);
  switch (world.deco) {
    case "lab":
      return (
        <g>
          {Array.from({ length: 17 }, (_, i) => <path key={i} d={`M${i * 100} 0V900`} stroke={a} strokeOpacity="0.05" />)}
          {Array.from({ length: 10 }, (_, i) => <path key={`h${i}`} d={`M0 ${i * 100}H1600`} stroke={a} strokeOpacity="0.05" />)}
          <rect x="60" y="120" width="260" height="620" rx="24" fill={a} opacity="0.035" stroke={a} strokeOpacity="0.12" />
          <rect x="1290" y="160" width="250" height="560" rx="24" fill={a} opacity="0.035" stroke={a} strokeOpacity="0.12" />
          <path d="M0 820 H1600" stroke={a} strokeOpacity="0.25" strokeWidth="3" />
          {rich && <rect x="100" y="0" width="6" height="900" fill={b} opacity="0.06" className="lm-scan" />}
        </g>
      );
    case "cave":
      return (
        <g>
          <path d="M0 0 H1600 V60 L1540 170 L1490 70 L1420 210 L1360 60 L1250 130 L1180 50 L1050 90 L960 40 L700 70 L620 150 L560 60 L420 110 L330 40 L240 190 L170 60 L90 140 L0 70 Z" fill="#0b0716" />
          <path d="M0 900 V760 L120 700 L260 780 L420 730 L600 800 L900 770 L1150 820 L1350 720 L1600 780 V900 Z" fill="#0b0716" />
          {[[140, 760, 1], [230, 780, 0.7], [1380, 740, 1.2], [1480, 770, 0.8], [760, 800, 0.6]].map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${s})`} className="lm-glowpulse" style={{ animationDelay: `${i * 0.7}s` }}>
              <path d="M-40 0 L-20 -130 L0 0 Z" fill={a} opacity="0.55" />
              <path d="M-5 0 L20 -170 L45 0 Z" fill={b} opacity="0.45" />
              <path d="M30 0 L55 -90 L75 0 Z" fill={a} opacity="0.4" />
            </g>
          ))}
        </g>
      );
    case "garden":
      return (
        <g>
          <path d="M-20 900 C 100 700, 40 520, 160 380 S 120 120, 240 -20" stroke="#2d8a5a" strokeWidth="10" fill="none" opacity="0.5" />
          <path d="M1620 900 C 1500 720, 1580 520, 1450 400 S 1500 120, 1380 -20" stroke="#2d8a5a" strokeWidth="10" fill="none" opacity="0.5" />
          {Array.from({ length: 16 }, (_, i) => {
            const left = i % 2 === 0;
            const x = left ? 60 + r() * 180 : 1360 + r() * 190;
            const y = 60 + r() * 780;
            return (
              <g key={i} transform={`translate(${x} ${y})`} className="lm-glowpulse" style={{ animationDelay: `${i * 0.4}s` }}>
                <ellipse rx="22" ry="11" fill="#3fbf7a" opacity="0.35" transform={`rotate(${r() * 180})`} />
                {i % 3 === 0 && <circle r="9" fill={i % 2 ? a : "#ffe86b"} opacity="0.75" />}
              </g>
            );
          })}
          <ellipse cx="800" cy="930" rx="900" ry="120" fill="#1f5a3c" opacity="0.5" />
        </g>
      );
    case "temple":
      return (
        <g>
          {[[40, 170], [1430, 170]].map(([x, w], i) => (
            <g key={i}>
              <rect x={x} y="80" width={w - 40} height="820" fill="#2d2010" />
              <rect x={x - 20} y="60" width={w} height="40" fill="#3d2a10" />
              {[0, 1, 2, 3].map((k) => <path key={k} d={`M${x + 20 + k * 30} 110 V880`} stroke="#1a1208" strokeWidth="6" />)}
              <rect x={x - 20} y="860" width={w} height="40" fill="#3d2a10" />
            </g>
          ))}
          <path d="M300 0 L520 0 L980 900 L700 900 Z" fill={b} opacity="0.05" className={rich ? "lm-shaft" : undefined} />
          <path d="M1000 0 L1100 0 L1380 900 L1240 900 Z" fill={b} opacity="0.04" className={rich ? "lm-shaft" : undefined} />
          <path d="M600 900 V520 A200 200 0 0 1 1000 520 V900" fill="none" stroke={a} strokeOpacity="0.08" strokeWidth="18" />
        </g>
      );
    case "palace":
      return (
        <g>
          {[160, 480, 1120, 1440].map((x, i) => (
            <path key={i} d={`M${x - 90} 900 V300 A90 90 0 0 1 ${x + 90} 300 V900`} fill="#fff" fillOpacity="0.025" stroke="#fff" strokeOpacity="0.12" strokeWidth="3" />
          ))}
          <path d="M0 200 L1600 700 L1600 760 L0 260 Z" fill="url(#bgRainbow)" opacity="0.07" />
          <path d="M0 620 L1600 120 L1600 160 L0 660 Z" fill="url(#bgRainbow)" opacity="0.05" />
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d="M0 -14 L10 0 L0 14 L-10 0 Z" fill="#fff" opacity="0.5" transform={`translate(${r() * 1600} ${r() * 900})`} className="lm-twinkle" style={{ animationDelay: `${i * 0.5}s` }} />
          ))}
        </g>
      );
    case "frozen":
      return (
        <g>
          <path d="M0 0 H1600 V30 " fill="none" />
          {Array.from({ length: 26 }, (_, i) => (
            <path key={i} d={`M${i * 64} 0 L${i * 64 + 16} ${40 + (i % 3) * 30 + r() * 30} L${i * 64 + 32} 0 Z`} fill="#dff6ff" opacity="0.45" />
          ))}
          <path d="M0 900 V700 L180 560 L320 690 L520 520 L760 720 L980 580 L1180 700 L1380 540 L1600 690 V900 Z" fill="#16324a" />
          <path d="M180 560 L230 610 L150 600 Z M520 520 L580 580 L470 570 Z M1380 540 L1440 600 L1330 590 Z" fill="#eaf8ff" opacity="0.8" />
          <path d="M0 900 V820 Q400 780 800 830 T1600 810 V900 Z" fill="#dff6ff" opacity="0.18" />
        </g>
      );
    case "neon":
      return (
        <g>
          <g stroke={b} strokeOpacity="0.14" strokeWidth="2" fill="none">
            {Array.from({ length: 12 }, (_, i) => (
              <path key={i} d={`M0 ${80 + i * 70} H${140 + r() * 200} L${220 + r() * 160} ${120 + i * 70 + r() * 60} H${400 + r() * 100}`} />
            ))}
            {Array.from({ length: 12 }, (_, i) => (
              <path key={`r${i}`} d={`M1600 ${80 + i * 70} H${1460 - r() * 200} L${1380 - r() * 160} ${40 + i * 70} H${1200 - r() * 100}`} />
            ))}
          </g>
          <g stroke={a} strokeOpacity="0.2">
            {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M800 620 L${-400 + i * 185} 900`} />)}
            {[650, 700, 770, 860].map((y) => <path key={y} d={`M0 ${y} H1600`} />)}
          </g>
          <path d="M0 620 H1600" stroke={a} strokeWidth="3" strokeOpacity="0.45" />
          {rich && <circle r="5" fill={b} className="lm-circuit-dot"><animateMotion dur="7s" repeatCount="indefinite" path="M0 220 H200 L300 290 H1600" /></circle>}
        </g>
      );
    case "portal":
      return (
        <g>
          {[[200, 220, 120], [1400, 260, 150], [260, 700, 90], [1350, 720, 110], [800, 90, 70]].map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <g className="lm-float" style={{ animationDelay: `${i * 1.3}s` }}>
                <ellipse rx={s} ry={s * 0.36} fill="none" stroke={i % 2 ? b : a} strokeWidth="6" opacity="0.35" />
                <ellipse rx={s * 0.7} ry={s * 0.24} fill={i % 2 ? b : a} opacity="0.08" />
              </g>
            </g>
          ))}
          <path d="M0 900 L300 760 H1300 L1600 900 Z" fill="#0a0518" />
        </g>
      );
    case "clockwork":
      return (
        <g>
          {[[150, 180, 150, 20], [1460, 240, 190, -30], [120, 760, 110, -25], [1480, 780, 130, 40], [800, 950, 220, 60]].map(([x, y, rad, dur], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <g className={rich ? "lm-gearspin" : undefined} style={{ animationDuration: `${Math.abs(dur)}s`, animationDirection: dur < 0 ? "reverse" : "normal" }}>
                <circle r={rad} fill="none" stroke="#8a5e25" strokeWidth={rad * 0.22} strokeDasharray={`${rad * 0.18} ${rad * 0.14}`} opacity="0.35" />
                <circle r={rad * 0.82} fill="#2a1d12" opacity="0.5" />
                <path d={`M${-rad * 0.8} 0 H${rad * 0.8} M0 ${-rad * 0.8} V${rad * 0.8}`} stroke="#8a5e25" strokeWidth={rad * 0.08} opacity="0.4" />
                <circle r={rad * 0.2} fill="#c08a3e" opacity="0.5" />
              </g>
            </g>
          ))}
          <path d="M0 470 H300 Q340 470 340 430 V300" stroke="#8a5e25" strokeWidth="18" fill="none" opacity="0.3" />
          <path d="M1600 450 H1320 Q1280 450 1280 490 V620" stroke="#8a5e25" strokeWidth="18" fill="none" opacity="0.3" />
        </g>
      );
    case "cosmic":
      return (
        <g>
          <ellipse cx="400" cy="300" rx="520" ry="240" fill="url(#bgNebulaA)" />
          <ellipse cx="1250" cy="640" rx="560" ry="260" fill="url(#bgNebulaB)" />
          {Array.from({ length: 90 }, (_, i) => (
            <circle key={i} cx={r() * 1600} cy={r() * 900} r={r() * 1.8 + 0.4} fill="#fff" opacity={0.3 + r() * 0.6}
              className={i % 7 === 0 ? "lm-twinkle" : undefined} style={i % 7 === 0 ? { animationDelay: `${i * 0.13}s` } : undefined} />
          ))}
          <circle cx="1420" cy="160" r="70" fill="#2a1f5c" />
          <ellipse cx="1420" cy="160" rx="120" ry="22" fill="none" stroke={b} strokeOpacity="0.4" strokeWidth="4" transform="rotate(-18 1420 160)" />
        </g>
      );
    default:
      return null;
  }
}

function Backdrop({ world, graphics = "medium", particles = true, reducedMotion = false }) {
  const rich = graphics === "high" && !reducedMotion;
  const n = particles && !reducedMotion ? PARTICLES[graphics] ?? 12 : 0;
  const r = rand(world.id * 31 + 7);
  return (
    <div className={`lm-backdrop lm-backdrop--${world.ambient}`} aria-hidden="true">
      <svg className="lm-backdrop__art" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="bgRainbow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ff3355" />
            <stop offset="0.33" stopColor="#ffd23a" />
            <stop offset="0.66" stopColor="#2bff88" />
            <stop offset="1" stopColor="#3d86ff" />
          </linearGradient>
          <radialGradient id="bgNebulaA">
            <stop offset="0" stopColor="#ff8af0" stopOpacity="0.28" />
            <stop offset="1" stopColor="#ff8af0" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bgNebulaB">
            <stop offset="0" stopColor="#7cf0ff" stopOpacity="0.2" />
            <stop offset="1" stopColor="#3d3d8f" stopOpacity="0" />
          </radialGradient>
        </defs>
        {graphics !== "low" && <Deco world={world} rich={rich} />}
      </svg>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="lm-particle" style={{
          left: `${r() * 100}%`,
          top: `${r() * 100}%`,
          animationDelay: `${-r() * 14}s`,
          animationDuration: `${9 + r() * 10}s`,
          "--s": (0.5 + r()).toFixed(2),
        }} />
      ))}
    </div>
  );
}

export default memo(Backdrop);
