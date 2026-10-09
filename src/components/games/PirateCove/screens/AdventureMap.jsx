/**
 * Pirate Cove — Adventure Select as a pirate sea chart. Each region is drawn
 * from its real island layout (shapes from the terrain functions); the 25
 * adventures are numbered nodes on a dashed red route, placed at the island
 * where each adventure's main action happens. Locked waters are fogged.
 */
import { useMemo, useState } from "react";
import { ADVENTURES } from "../data/adventures.js";
import { REGIONS } from "../data/regions.js";
import { prepareIsland, radiusAt } from "../engine/terrain.js";
import { SHIP_CLASSES } from "../data/ships.js";

const W = 1000;
const H = 600;
const ZONES = {
  1: { x: 150, y: 430, r: 118 },
  2: { x: 335, y: 205, r: 118 },
  3: { x: 515, y: 425, r: 118 },
  4: { x: 690, y: 200, r: 118 },
  5: { x: 865, y: 415, r: 118 },
};

function anchorFor(adv, region) {
  const isls = new Map(region.islands.map((i) => [i.id, i]));
  let id = null;
  for (const s of adv.steps) if ((s.k === "dock" || s.k === "enter" || (s.k === "reach" && s.island)) && isls.has(s.island)) id = s.island;
  if (!id && adv.start?.dock) id = adv.start.dock;
  if (id) return { x: isls.get(id).x, z: isls.get(id).z, island: id };
  const m = adv.markers?.length ? adv.markers[adv.markers.length - 1] : { x: 0, z: 0 };
  return { x: m.x, z: m.z };
}

export default function AdventureMap({ state, onPick, onBack, onShips }) {
  const [sel, setSel] = useState(() => Math.min(state.unlocked, ADVENTURES.length));
  const chart = useMemo(() => {
    const regions = REGIONS.map((R) => {
      const Z = ZONES[R.id];
      const k = Z.r / R.radius;
      const P = (x, z) => [Z.x - x * k, Z.y - z * k];
      const islands = R.islands.map((d) => {
        const I = prepareIsland(d);
        const pts = [];
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          const r = radiusAt(I, a);
          pts.push(P(I.x + Math.cos(a) * r, I.z + Math.sin(a) * r));
        }
        return { id: d.id, name: d.name, safe: d.safe, path: `M${pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" L")} Z`, c: P(I.x, I.z) };
      });
      return { R, Z, P, islands };
    });
    const used = new Map();
    const nodes = ADVENTURES.map((a) => {
      const reg = regions[a.region - 1];
      const an = anchorFor(a, reg.R);
      const key = `${a.region}:${an.island || `${Math.round(an.x)},${Math.round(an.z)}`}`;
      const n = used.get(key) || 0;
      used.set(key, n + 1);
      const [x, y] = reg.P(an.x, an.z);
      const ang = n * 2.1 + 0.6;
      return { a, x: x + (n ? Math.cos(ang) * 17 : 0), y: y + (n ? Math.sin(ang) * 17 : 0) - 14 };
    });
    let route = `M${nodes[0].x},${nodes[0].y}`;
    for (let i = 1; i < nodes.length; i++) {
      const p = nodes[i - 1];
      const q = nodes[i];
      const mx = (p.x + q.x) / 2 + (i % 2 ? 14 : -14);
      const my = (p.y + q.y) / 2 + (i % 2 ? -10 : 10);
      route += ` Q${mx.toFixed(1)},${my.toFixed(1)} ${q.x.toFixed(1)},${q.y.toFixed(1)}`;
    }
    return { regions, nodes, route };
  }, []);

  const A = ADVENTURES.find((a) => a.id === sel) || ADVENTURES[0];
  const region = REGIONS[A.region - 1];
  const unlocked = A.id <= state.unlocked;
  const done = !!state.completed[A.id];
  const best = state.bestTime[A.id];

  return (
    <div className="pc-chart">
      <div className="pc-chart__map">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="pcPaper" cx="50%" cy="50%" r="75%">
              <stop offset="0%" stopColor="#f1dfb2" />
              <stop offset="75%" stopColor="#dfc086" />
              <stop offset="100%" stopColor="#a9763e" />
            </radialGradient>
            <filter id="pcEdge">
              <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="9" />
              <feDisplacementMap in="SourceGraphic" scale="14" />
            </filter>
            <pattern id="pcSea" width="30" height="16" patternUnits="userSpaceOnUse">
              <path d="M0 10 Q7.5 4 15 10 T30 10" fill="none" stroke="#6a4a26" strokeWidth="0.9" opacity="0.25" />
            </pattern>
            <filter id="pcFog">
              <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="3" />
              <feColorMatrix values="0 0 0 0 0.85  0 0 0 0 0.8  0 0 0 0 0.7  0 0 0 0.9 0" />
              <feComposite in2="SourceGraphic" operator="in" />
            </filter>
          </defs>
          <rect x="8" y="8" width={W - 16} height={H - 16} rx="10" fill="url(#pcPaper)" filter="url(#pcEdge)" />
          <rect x="8" y="8" width={W - 16} height={H - 16} fill="url(#pcSea)" filter="url(#pcEdge)" />
          {chart.regions.map(({ R, Z, islands }) => {
            const locked = !ADVENTURES.some((a) => a.region === R.id && a.id <= state.unlocked);
            return (
              <g key={R.id} opacity={locked ? 0.55 : 1}>
                <circle cx={Z.x} cy={Z.y} r={Z.r + 14} fill="none" stroke="#6a4a26" strokeWidth="1" strokeDasharray="2 6" opacity="0.6" />
                {islands.map((i) => (
                  <g key={i.id}>
                    <path d={i.path} fill={R.id === 5 ? "#cdb888" : "#e8cf92"} stroke="#3b2a1a" strokeWidth="1.6" />
                    {i.safe && (
                      <text x={i.c[0]} y={i.c[1] + 4} textAnchor="middle" className="pc-chart__anchor">
                        ⚓
                      </text>
                    )}
                  </g>
                ))}
                <text x={Z.x} y={Z.y + Z.r + 34} textAnchor="middle" className="pc-chart__region">
                  {R.name}
                </text>
                {locked && <circle cx={Z.x} cy={Z.y} r={Z.r + 18} fill="#e8dcc0" filter="url(#pcFog)" opacity="0.85" />}
                {locked && (
                  <text x={Z.x} y={Z.y + 6} textAnchor="middle" className="pc-chart__locked">
                    UNCHARTED
                  </text>
                )}
              </g>
            );
          })}
          <path d={chart.route} fill="none" stroke="#9a2a1e" strokeWidth="2.2" strokeDasharray="7 7" opacity="0.75" />
          {chart.nodes.map(({ a, x, y }) => {
            const isDone = !!state.completed[a.id];
            const isOpen = a.id <= state.unlocked;
            const current = a.id === Math.min(state.unlocked, ADVENTURES.length) && !isDone;
            const boss = a.kind === "Boss Ship" || a.kind === "Final Treasure";
            return (
              <g
                key={a.id}
                className={`pc-node${isOpen ? "" : " pc-node--locked"}${sel === a.id ? " pc-node--sel" : ""}${current ? " pc-node--current" : ""}`}
                transform={`translate(${x},${y})`}
                onClick={() => setSel(a.id)}
              >
                {current && <circle r="20" className="pc-node__pulse" />}
                <circle r={boss ? 14 : 12} className="pc-node__dot" fill={isDone ? "#2f6a3a" : isOpen ? "#a3281e" : "#7a6a52"} />
                <text y="4.5" textAnchor="middle" className="pc-node__num">
                  {isDone ? "✓" : isOpen ? a.id : "🔒"}
                </text>
                {boss && <path d="M-7 -16 L-7 -22 L-3.5 -19 L0 -24 L3.5 -19 L7 -22 L7 -16 Z" fill="#c99a3c" stroke="#3b2a1a" strokeWidth="0.8" />}
              </g>
            );
          })}
          <g transform={`translate(${W - 70},${70})`}>
            <circle r="34" fill="none" stroke="#3b2a1a" strokeWidth="1" />
            <path d="M0 -40 L7 0 L0 40 L-7 0 Z" fill="#3b2a1a" />
            <path d="M-40 0 L0 6 L40 0 L0 -6 Z" fill="#3b2a1a" opacity="0.55" />
            <text y="-46" textAnchor="middle" className="pc-chart__n">
              N
            </text>
          </g>
          <text x="40" y="58" className="pc-chart__title">
            The Archipelago
          </text>
        </svg>
      </div>
      <aside className="pc-chart__side">
        <button type="button" className="pc-back" onClick={onBack}>
          ← BACK
        </button>
        <div className="pc-chart__kicker">
          {region.name} · Adventure {A.id}/25
        </div>
        <h2 className="pc-chart__name">{A.name}</h2>
        <div className="pc-chart__kind">{A.kind}</div>
        <p className="pc-chart__blurb">{unlocked ? A.blurb : "Complete the previous adventure to chart these waters."}</p>
        <div className="pc-chart__meta">
          <span className={done ? "ok" : ""}>{done ? "✓ Completed" : unlocked ? "Available" : "Locked"}</span>
          {best != null && <span>Best {Math.floor(best / 60)}:{String(Math.floor(best % 60)).padStart(2, "0")}</span>}
          {!done && A.reward?.gold ? <span>Bonus {A.reward.gold} gold</span> : null}
          {A.unlockShip && <span className="pc-chart__ship">Reward: {SHIP_CLASSES[A.unlockShip].name}</span>}
        </div>
        <button type="button" className="pc-chip" onClick={onShips}>
          ⛵ {SHIP_CLASSES[state.ship].name} — change ship
        </button>
        <button type="button" className="pc-btn pc-btn--primary pc-chart__go" disabled={!unlocked} onClick={() => onPick(A.id)}>
          {done ? "SAIL AGAIN" : "SET SAIL"}
        </button>
      </aside>
    </div>
  );
}
