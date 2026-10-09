/**
 * Pirate Cove — the treasure map: an aged parchment drawn from the REAL island
 * (outline from the terrain's shoreline function, hills, the dock, landmark
 * props, a scattering of palms) with a red X where the engine's dig spot is.
 * North (+z) is up; it matches the HUD compass.
 */
import { useMemo } from "react";
import { radiusAt } from "../engine/terrain.js";

const S = 360;

function icon(t, x, y, k) {
  switch (t) {
    case "skullRock":
      return (
        <g key={k} transform={`translate(${x},${y})`}>
          <circle r="7" fill="none" stroke="#3b2a1a" strokeWidth="1.6" />
          <circle cx="-2.5" cy="-1" r="1.6" fill="#3b2a1a" />
          <circle cx="2.5" cy="-1" r="1.6" fill="#3b2a1a" />
          <path d="M-3 4h6" stroke="#3b2a1a" strokeWidth="1.2" />
        </g>
      );
    case "tent":
    case "hut":
      return <path key={k} d={`M${x - 7},${y + 5} L${x},${y - 7} L${x + 7},${y + 5} Z`} fill="none" stroke="#3b2a1a" strokeWidth="1.6" />;
    case "caveMouth":
      return <path key={k} d={`M${x - 8},${y + 5} Q${x},${y - 12} ${x + 8},${y + 5} Z`} fill="#3b2a1a" opacity="0.75" />;
    case "lighthouse":
      return <path key={k} d={`M${x - 3},${y + 8} L${x - 2},${y - 8} L${x + 2},${y - 8} L${x + 3},${y + 8} Z M${x - 5},${y - 9} h10`} fill="none" stroke="#3b2a1a" strokeWidth="1.5" />;
    case "stoneRing":
      return <circle key={k} cx={x} cy={y} r="9" fill="none" stroke="#3b2a1a" strokeWidth="1.4" strokeDasharray="3 3" />;
    case "idol":
    case "statue":
    case "column":
      return <rect key={k} x={x - 3} y={y - 6} width="6" height="12" fill="none" stroke="#3b2a1a" strokeWidth="1.4" />;
    case "campfire":
      return <path key={k} d={`M${x},${y - 6} Q${x + 5},${y} ${x},${y + 4} Q${x - 5},${y} ${x},${y - 6}`} fill="#7a2a1a" opacity="0.8" />;
    case "ruinWall":
    case "fortWall":
      return null;
    default:
      return null;
  }
}

export default function TreasureMap({ world, map, onClose, current }) {
  const isl = world.byId.get(map.island);
  const draw = useMemo(() => {
    if (!isl) return null;
    const I = isl.I;
    const scale = (S * 0.36) / I.maxR;
    const cx = S / 2;
    const cy = S / 2 + 6;
    const P = (wx, wz) => [cx - (wx - I.x) * scale, cy - (wz - I.z) * scale];
    const pts = [];
    for (let i = 0; i < 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      const r = radiusAt(I, a) * 0.98;
      pts.push(P(I.x + Math.cos(a) * r, I.z + Math.sin(a) * r));
    }
    const outline = `M${pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" L")} Z`;
    const hills = I.hills.map(([hx, hz, r]) => ({ c: P(I.x + hx, I.z + hz), r: r * scale * 0.8 }));
    const palms = isl.veg.palms.filter((_, i) => i % 5 === 0).slice(0, 40).map((p) => P(p.x, p.z));
    const props = isl.props.map((p) => ({ t: p.t, at: P(p.x, p.z) }));
    const d = isl.dock;
    const dock = [P(d.land.x, d.land.z), P(d.end.x, d.end.z)];
    let mark = null;
    if (map.mark) {
      const spec = map.mark;
      const pos = world.resolve(spec, map.island);
      mark = P(pos.x, pos.z);
    }
    const walls = isl.props.filter((p) => p.t === "ruinWall" || p.t === "fortWall");
    return { outline, hills, palms, props, dock, mark, walls, P, scale };
  }, [isl, map, world]);
  if (!draw) return null;
  const [mx, my] = draw.mark || [0, 0];

  return (
    <div className="pc-map" role="dialog" aria-label="Treasure map" onClick={onClose}>
      <div className="pc-map__sheet" onClick={(e) => e.stopPropagation()}>
        <svg viewBox={`0 0 ${S} ${S + 70}`} className="pc-map__svg">
          <defs>
            <filter id="pcRough">
              <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="4" />
              <feDisplacementMap in="SourceGraphic" scale="9" />
            </filter>
            <filter id="pcInk">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="2" />
              <feDisplacementMap in="SourceGraphic" scale="1.6" />
            </filter>
            <radialGradient id="pcAge" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stopColor="#f3e2b8" />
              <stop offset="70%" stopColor="#e2c58c" />
              <stop offset="100%" stopColor="#b98a4e" />
            </radialGradient>
            <pattern id="pcWaves" width="22" height="12" patternUnits="userSpaceOnUse">
              <path d="M0 8 Q5.5 3 11 8 T22 8" fill="none" stroke="#7a5a32" strokeWidth="0.8" opacity="0.35" />
            </pattern>
          </defs>
          <rect x="6" y="6" width={S - 12} height={S + 58} rx="6" fill="url(#pcAge)" filter="url(#pcRough)" />
          <rect x="6" y="6" width={S - 12} height={S + 58} fill="url(#pcWaves)" filter="url(#pcRough)" />
          <circle cx={S * 0.78} cy={S * 0.82} r="26" fill="#8a5a2a" opacity="0.12" />
          <circle cx={S * 0.2} cy={S * 0.25} r="18" fill="#8a5a2a" opacity="0.1" />
          <text x={S / 2} y="40" textAnchor="middle" className="pc-map__title">
            {map.title || isl.name}
          </text>
          <g filter="url(#pcInk)">
            <path d={draw.outline} fill="#e9d29a" stroke="#3b2a1a" strokeWidth="2.2" />
            <path d={draw.outline} fill="none" stroke="#3b2a1a" strokeWidth="0.8" opacity="0.4" transform={`translate(${S / 2},${S / 2 + 6}) scale(1.06) translate(${-S / 2},${-S / 2 - 6})`} />
            {draw.hills.map((h, i) => (
              <g key={i}>
                <path d={`M${h.c[0] - h.r},${h.c[1] + h.r * 0.3} Q${h.c[0]},${h.c[1] - h.r * 0.9} ${h.c[0] + h.r},${h.c[1] + h.r * 0.3}`} fill="none" stroke="#5a3e22" strokeWidth="1.5" />
                <path d={`M${h.c[0] - h.r * 0.5},${h.c[1] + h.r * 0.25} Q${h.c[0]},${h.c[1] - h.r * 0.4} ${h.c[0] + h.r * 0.5},${h.c[1] + h.r * 0.25}`} fill="none" stroke="#5a3e22" strokeWidth="1.1" />
              </g>
            ))}
            {draw.palms.map(([x, y], i) => (
              <g key={i} transform={`translate(${x},${y})`} opacity="0.7">
                <path d="M0 5 L0 -2 M0 -2 Q-4 -5 -6 -2 M0 -2 Q4 -5 6 -2 M0 -2 Q-1 -6 -3 -7 M0 -2 Q1 -6 3 -7" fill="none" stroke="#3e5a22" strokeWidth="1.1" />
              </g>
            ))}
            {draw.walls.map((w, i) => {
              const len = (w.len || 8) * draw.scale;
              const [x, y] = draw.P(w.x, w.z);
              const ang = (-w.rot * 180) / Math.PI;
              return <rect key={i} x={x - len / 2} y={y - 1.5} width={len} height="3" fill="#3b2a1a" transform={`rotate(${ang} ${x} ${y})`} />;
            })}
            {draw.props.map((p, i) => icon(p.t, p.at[0], p.at[1], i))}
            <line x1={draw.dock[0][0]} y1={draw.dock[0][1]} x2={draw.dock[1][0]} y2={draw.dock[1][1]} stroke="#3b2a1a" strokeWidth="4" />
            <text x={draw.dock[1][0]} y={draw.dock[1][1] + 14} textAnchor="middle" className="pc-map__small">
              dock
            </text>
            {draw.mark && (
              <g transform={`translate(${mx},${my})`}>
                <path d="M-9 -9 L9 9 M9 -9 L-9 9" stroke="#a3201a" strokeWidth="4.5" strokeLinecap="round" />
                <circle r="15" fill="none" stroke="#a3201a" strokeWidth="1.2" strokeDasharray="3 3" />
              </g>
            )}
            {current && <path d={`M${draw.dock[0][0]},${draw.dock[0][1]} Q${(draw.dock[0][0] + mx) / 2 + 20},${(draw.dock[0][1] + my) / 2} ${mx},${my}`} fill="none" stroke="#a3201a" strokeWidth="1.4" strokeDasharray="5 5" opacity="0.7" />}
          </g>
          {/* compass rose */}
          <g transform={`translate(${S - 52},${S - 22})`}>
            <circle r="22" fill="none" stroke="#3b2a1a" strokeWidth="1" />
            <path d="M0 -26 L5 0 L0 26 L-5 0 Z" fill="#3b2a1a" />
            <path d="M-26 0 L0 4 L26 0 L0 -4 Z" fill="#3b2a1a" opacity="0.6" />
            <text y="-30" textAnchor="middle" className="pc-map__small">
              N
            </text>
          </g>
          <text x={S / 2} y={S + 44} textAnchor="middle" className="pc-map__hint">
            {map.hint}
          </text>
        </svg>
        <button type="button" className="pc-btn pc-map__close" onClick={onClose}>
          CLOSE MAP
        </button>
      </div>
    </div>
  );
}
