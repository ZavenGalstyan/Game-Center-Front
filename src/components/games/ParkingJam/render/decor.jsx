/**
 * Parking Jam — decorative props, drawn top-down to match the vehicles.
 * All purely visual: nothing here is ever read by the rules. Each prop is
 * placed at (x, y) in world units (one grid cell = 100).
 */
import { shade } from "./color.js";

const SH = "rgba(0, 0, 0, 0.22)";

export function Tree({ x, y, r = 44, tone = "#3f9a45", night = false }) {
  const dark = shade(tone, -0.28);
  const light = shade(tone, 0.22);
  const lobes = [[-0.42, -0.1], [0.38, -0.28], [0.3, 0.38], [-0.28, 0.42], [0.02, -0.5]];
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={r * 0.3} cy={r * 0.42} rx={r * 1.02} ry={r * 0.9} fill={SH} />
      <circle r={r * 0.92} fill={dark} />
      {lobes.map(([lx, ly], i) => (
        <circle key={i} cx={lx * r} cy={ly * r} r={r * 0.56} fill={i % 2 ? tone : shade(tone, -0.1)} />
      ))}
      <circle cx={-r * 0.2} cy={-r * 0.24} r={r * 0.5} fill={tone} />
      <circle cx={-r * 0.3} cy={-r * 0.34} r={r * 0.26} fill={light} opacity={night ? 0.4 : 0.85} />
    </g>
  );
}

export function Bush({ x, y, r = 20, tone = "#4caf50", flowers = null }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={r * 0.3} cy={r * 0.4} rx={r * 1.1} ry={r * 0.85} fill={SH} />
      <circle cx={-r * 0.45} cy={0} r={r * 0.62} fill={shade(tone, -0.18)} />
      <circle cx={r * 0.45} cy={r * 0.1} r={r * 0.66} fill={shade(tone, -0.08)} />
      <circle cx={0} cy={-r * 0.3} r={r * 0.7} fill={tone} />
      <circle cx={-r * 0.2} cy={-r * 0.5} r={r * 0.3} fill={shade(tone, 0.25)} opacity="0.8" />
      {flowers && [[-0.4, -0.2], [0.35, -0.1], [0.05, 0.3], [0.5, 0.35], [-0.1, -0.55]].map(([fx, fy], i) => (
        <circle key={i} cx={fx * r} cy={fy * r} r={r * 0.13} fill={flowers[i % flowers.length]} />
      ))}
    </g>
  );
}

export function Lamp({ x, y, angle = 0, night = false }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      {night && <circle r={120} fill="url(#pj-lamp-glow)" />}
      <circle r={7} fill="#3c4148" />
      <circle r={4} fill="#6d747d" />
      <path d="M 0 0 L 0 -26" stroke="#4a5058" strokeWidth="4" strokeLinecap="round" />
      <rect x={-9} y={-38} width={18} height={14} rx={4} fill="#5b626b" stroke="#2e3238" strokeWidth="1.2" />
      <rect x={-6} y={-35} width={12} height={8} rx={2} fill={night ? "#fff3c2" : "#e6ecf0"} />
    </g>
  );
}

export function Bollard({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={3} cy={4} rx={8} ry={7} fill={SH} />
      <circle r={7} fill="#3b4047" />
      <circle r={5} fill="#f2c230" />
      <circle r={2.4} fill="#3b4047" />
    </g>
  );
}

export function Bench({ x, y, angle = 0, tone = "#9a6b3f" }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <rect x={-30} y={-7} width={64} height={20} rx={4} fill={SH} />
      <rect x={-32} y={-10} width={64} height={20} rx={3} fill="#40454c" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={-30} y={-8 + i * 4.5} width={60} height={3.4} rx={1} fill={i % 2 ? tone : shade(tone, 0.12)} />
      ))}
    </g>
  );
}

export function ParkingSign({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={6} cy={6} rx={16} ry={10} fill={SH} />
      <circle r={3} fill="#555c64" />
      <rect x={-15} y={-34} width={30} height={30} rx={5} fill="#1f63c9" stroke="#fff" strokeWidth="2.5" />
      <text x={0} y={-12} textAnchor="middle" fontSize="22" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">P</text>
    </g>
  );
}

export function Hydrant({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx={2} cy={3} r={8} fill={SH} />
      <circle r={7} fill="#c9302c" />
      <circle r={3.5} fill="#e8605b" />
      <rect x={-11} y={-2} width={22} height={4} rx={2} fill="#a52622" />
    </g>
  );
}

export function Bin({ x, y, tone = "#2f6b4a" }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx={3} cy={4} r={10} fill={SH} />
      <circle r={10} fill={tone} />
      <circle r={7} fill={shade(tone, -0.35)} />
    </g>
  );
}

/** Raised planter box with shrubs — decorative version of the obstacle. */
export function PlanterBox({ x, y, w = 90, h = 40, tone = "#3c9a4c", stone = "#c8c0b0" }) {
  const n = Math.max(1, Math.round(w / 34));
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2 + 5} y={-h / 2 + 7} width={w} height={h} rx={7} fill={SH} />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={7} fill={stone} stroke={shade(stone, -0.3)} strokeWidth="1.5" />
      <rect x={-w / 2 + 5} y={-h / 2 + 5} width={w - 10} height={h - 10} rx={4} fill="#5b4330" />
      {Array.from({ length: n }, (_, i) => (
        <Bush key={i} x={-w / 2 + (w / n) * (i + 0.5)} y={0} r={Math.min(16, h * 0.36)} tone={tone} />
      ))}
    </g>
  );
}

export function CartCorral({ x, y, n = 4 }) {
  const w = 34 + n * 14;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2 + 4} y={-16} width={w} height={36} rx={4} fill={SH} />
      <rect x={-w / 2} y={-18} width={w} height={34} rx={4} fill="none" stroke="#9aa3ad" strokeWidth="3" />
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`translate(${-w / 2 + 12 + i * 14} -12)`}>
          <rect width={18} height={24} rx={2} fill="#c9d0d8" stroke="#7d8690" strokeWidth="1.2" />
          <path d="M 3 4 H 15 M 3 9 H 15 M 3 14 H 15 M 3 19 H 15" stroke="#8d96a0" strokeWidth="1" />
          <rect x={2} y={-3} width={14} height={4} rx={2} fill="#e0463b" />
        </g>
      ))}
    </g>
  );
}

export function LuggageCart({ x, y, angle = 0 }) {
  const bags = ["#3c6fd1", "#e0463b", "#2b2f36", "#f2b33d"];
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <rect x={-20} y={-12} width={46} height={28} rx={4} fill={SH} />
      <rect x={-24} y={-15} width={46} height={28} rx={3} fill="#b9c2cb" stroke="#6e7780" strokeWidth="1.4" />
      {bags.map((c, i) => (
        <rect key={i} x={-21 + i * 10.5} y={-12 + (i % 2) * 3} width={9} height={18} rx={2.5} fill={c} />
      ))}
      <path d="M 22 -12 L 30 -12 L 30 10 L 22 10" stroke="#6e7780" strokeWidth="2.5" fill="none" />
    </g>
  );
}

export function Cone({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx={3} cy={4} r={9} fill={SH} />
      <rect x={-9} y={-9} width={18} height={18} rx={3} fill="#2f3237" />
      <circle r={7} fill="#f26b1d" />
      <circle r={4.4} fill="#fff" />
      <circle r={2.4} fill="#f26b1d" />
    </g>
  );
}

export function Drain({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity="0.75">
      <rect x={-12} y={-8} width={24} height={16} rx={2} fill="#3a3d42" stroke="#6b7077" strokeWidth="1.5" />
      {[-7, -2.5, 2, 6.5].map((gx) => <rect key={gx} x={gx} y={-5} width={2} height={10} fill="#1d1f22" />)}
    </g>
  );
}

/* ----------------------------------------------------------- buildings */

const windowGlow = ["#ffe9a8", "#ffd27a", "#bfe6ff", "#ffc6f0"];

/**
 * A flat-roofed building seen from above. `style` changes the roof
 * furniture: house (gabled), store, office, terminal, tower.
 */
export function Building({ x, y, w, h, style = "office", seed = 1, night = false, accent = "#ff6fae" }) {
  const r = mulberry(seed);
  if (style === "house") {
    const roof = ["#b5523b", "#8c5a3c", "#5e6b7d", "#a0463a", "#6d5d4b"][Math.floor(r() * 5)];
    const horizontal = w >= h;
    return (
      <g transform={`translate(${x} ${y})`}>
        <rect x={8} y={12} width={w} height={h} rx={3} fill="rgba(0,0,0,0.25)" />
        <rect width={w} height={h} rx={3} fill={shade(roof, -0.12)} />
        {horizontal ? (
          <>
            <path d={`M 0 0 H ${w} L ${w - h * 0.2} ${h / 2} H ${h * 0.2} Z`} fill={shade(roof, 0.12)} />
            <path d={`M 0 ${h} H ${w} L ${w - h * 0.2} ${h / 2} H ${h * 0.2} Z`} fill={shade(roof, -0.18)} />
            <path d={`M ${h * 0.2} ${h / 2} H ${w - h * 0.2}`} stroke={shade(roof, -0.4)} strokeWidth="2" />
          </>
        ) : (
          <>
            <path d={`M 0 0 V ${h} L ${w / 2} ${h - w * 0.2} V ${w * 0.2} Z`} fill={shade(roof, 0.12)} />
            <path d={`M ${w} 0 V ${h} L ${w / 2} ${h - w * 0.2} V ${w * 0.2} Z`} fill={shade(roof, -0.18)} />
          </>
        )}
        <rect x={w * 0.68} y={h * 0.14} width={10} height={10} fill="#7b4a3a" />
      </g>
    );
  }
  const base = {
    store: "#e9e2d6", office: night ? "#34384a" : "#c7ccd3", terminal: "#e8eef3", tower: night ? "#2a2d3d" : "#aeb5bf", city: "#8f959d",
  }[style] || "#c7ccd3";
  const edge = shade(base, -0.3);
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={10} y={14} width={w} height={h} fill="rgba(0,0,0,0.28)" />
      <rect width={w} height={h} fill={base} stroke={edge} strokeWidth="2" />
      <rect x={6} y={6} width={w - 12} height={h - 12} fill="none" stroke={shade(base, -0.12)} strokeWidth="3" />
      {style === "terminal" && (
        <g>
          {Array.from({ length: Math.floor((w - 20) / 40) }, (_, i) => (
            <rect key={i} x={14 + i * 40} y={14} width={32} height={h - 28} rx={3} fill={night ? "#3a5a7a" : "#a9d4ee"} opacity="0.85" />
          ))}
          <path d={`M 10 ${h / 2} H ${w - 10}`} stroke="#fff" strokeWidth="3" />
        </g>
      )}
      {(style === "office" || style === "tower" || style === "city" || style === "store") && (
        <g>
          {Array.from({ length: Math.max(1, Math.floor(w / 90)) }, (_, i) => {
            const ax = 18 + i * 90 + r() * 30;
            const ay = 16 + r() * Math.max(1, h - 60);
            if (ax + 34 > w - 10 || ay + 26 > h - 10) return null;
            return (
              <g key={i}>
                <rect x={ax + 3} y={ay + 4} width={34} height={24} fill="rgba(0,0,0,0.2)" />
                <rect x={ax} y={ay} width={34} height={24} rx={2} fill="#dfe3e8" stroke="#8d949c" strokeWidth="1.2" />
                <circle cx={ax + 17} cy={ay + 12} r={8} fill="#b8bec6" stroke="#8d949c" strokeWidth="1" />
              </g>
            );
          })}
        </g>
      )}
      {night && style !== "terminal" && (
        <g>
          {Array.from({ length: Math.floor(w / 22) }, (_, i) =>
            r() > 0.45 ? <rect key={i} x={6 + i * 22} y={1} width={12} height={4} fill={windowGlow[Math.floor(r() * 4)]} opacity={0.75} /> : null)}
          {Array.from({ length: Math.floor(h / 22) }, (_, i) =>
            r() > 0.5 ? <rect key={`s${i}`} x={w - 5} y={6 + i * 22} width={4} height={12} fill={windowGlow[Math.floor(r() * 4)]} opacity={0.7} /> : null)}
          {r() > 0.35 && (
            <g>
              <rect x={w * 0.2} y={h - 16} width={w * 0.45} height={8} rx={4} fill={accent} opacity="0.95" />
              <rect x={w * 0.2 - 10} y={h - 26} width={w * 0.45 + 20} height={28} rx={14} fill={accent} opacity="0.2" />
            </g>
          )}
        </g>
      )}
    </g>
  );
}

/** Striped shop awnings along one edge of a store. */
export function Awnings({ x, y, w, colors }) {
  const n = Math.max(1, Math.floor(w / 70));
  const aw = w / n;
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: n }, (_, i) => {
        const c = colors[i % colors.length];
        return (
          <g key={i} transform={`translate(${i * aw + 4} 0)`}>
            <rect x={3} y={5} width={aw - 8} height={24} fill="rgba(0,0,0,0.2)" />
            <rect width={aw - 8} height={24} rx={2} fill="#fff" />
            {Array.from({ length: Math.floor((aw - 8) / 10) }, (_, k) => (
              <rect key={k} x={k * 10} width={5} height={24} fill={c} />
            ))}
            <path d={`M 0 24 H ${aw - 8}`} stroke={shade(c, -0.3)} strokeWidth="2" />
          </g>
        );
      })}
    </g>
  );
}

/** Small deterministic PRNG for decor (independent of level compile RNG). */
export function mulberry(a) {
  let s = a >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
