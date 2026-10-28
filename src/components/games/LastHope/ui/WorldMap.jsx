/**
 * Last Hope — the world map: an illustrated region with roads between the
 * five locations, their danger, resources and lock state; travel from here
 * when standing at a location's exit.
 */
import { useState } from "react";
import { Icon } from "./icons.jsx";
import { LOCATIONS, LOCATION_ORDER, ROUTES } from "../data/locations/index.js";
import { ITEMS } from "../data/items.js";

const GLYPH = { camp: "b_campfire", forest: "wood", suburb: "canned_food", industrial: "parts", bunker: "bunker_card" };

export default function WorldMap({ G, canTravel, onTravel, onClose }) {
  const [sel, setSel] = useState(G.loc === "camp" ? "forest" : G.loc);
  const L = LOCATIONS[sel];
  const unlocked = G.unlocked.includes(sel);
  const here = G.loc === sel;
  const bag = (id) => !!G.locs[id]?.bag;
  return (
    <div className="lh-panel lh-panel--map" data-ui onPointerDown={(e) => e.stopPropagation()}>
      <div className="lh-panel__head">
        <div className="lh-title">World Map</div>
        <button className="lh-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="lh-map">
        <div className="lh-map__art">
          <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="lhm-bg" cx="0.5" cy="0.45" r="0.75">
                <stop offset="0" stopColor="#d9c9a0" />
                <stop offset="1" stopColor="#9a8660" />
              </radialGradient>
              <pattern id="lhm-trees" width="4" height="4" patternUnits="userSpaceOnUse">
                <path d="M2 0.6 L3.2 3 H0.8 Z" fill="#4a6a3a" opacity="0.55" />
              </pattern>
              <filter id="lhm-rough">
                <feTurbulence baseFrequency="0.9" numOctaves="2" seed="4" />
                <feColorMatrix values="0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 0 0.15  0 0 0 0.12 0" />
                <feComposite in2="SourceGraphic" operator="in" />
              </filter>
            </defs>
            <rect width="100" height="100" fill="url(#lhm-bg)" />
            <rect width="100" height="100" fill="#000" filter="url(#lhm-rough)" />
            {/* forests */}
            <path d="M5 35 Q15 15 40 18 Q55 24 48 42 Q40 56 22 52 Q8 50 5 35 Z" fill="url(#lhm-trees)" />
            <path d="M2 70 Q10 58 26 62 Q34 72 26 86 Q12 92 4 84 Z" fill="url(#lhm-trees)" />
            <path d="M70 80 Q80 72 96 78 L96 96 L72 96 Z" fill="url(#lhm-trees)" />
            {/* river + lake */}
            <path d="M0 52 Q20 46 34 50 Q50 56 56 72 Q60 86 74 100" fill="none" stroke="#6a9ab0" strokeWidth="2.2" opacity="0.8" />
            <ellipse cx="44" cy="30" rx="4" ry="2.6" fill="#6a9ab0" opacity="0.85" />
            {/* hills */}
            <path d="M70 18 l6 -8 l6 8 M80 22 l5 -7 l5 7" fill="none" stroke="#7a6a48" strokeWidth="0.8" />
            {/* roads */}
            {ROUTES.map(([a, b]) => {
              const A = LOCATIONS[a].map;
              const B = LOCATIONS[b].map;
              const open = G.unlocked.includes(a) && G.unlocked.includes(b);
              const mx = (A[0] + B[0]) / 2 + (A[1] - B[1]) * 0.12;
              const my = (A[1] + B[1]) / 2 + (B[0] - A[0]) * 0.12;
              return <path key={a + b} d={`M${A[0]} ${A[1]} Q${mx} ${my} ${B[0]} ${B[1]}`} fill="none" stroke={open ? "#6a3a22" : "#8a7a5a"} strokeWidth={open ? 1.1 : 0.7} strokeDasharray={open ? "2 1" : "1 1.5"} opacity={open ? 0.9 : 0.6} />;
            })}
            {/* compass */}
            <g transform="translate(90 12)">
              <circle r="5" fill="none" stroke="#5a4a32" strokeWidth="0.5" />
              <path d="M0 -6 L1.4 0 L0 6 L-1.4 0 Z" fill="#5a4a32" />
              <text y="-7" fontSize="3" textAnchor="middle" fill="#5a4a32">
                N
              </text>
            </g>
          </svg>
          {LOCATION_ORDER.map((id) => {
            const l = LOCATIONS[id];
            const open = G.unlocked.includes(id);
            return (
              <button key={id} className={`lh-mnode${sel === id ? " is-sel" : ""}${open ? "" : " is-locked"}${G.loc === id ? " is-here" : ""}`} style={{ left: `${l.map[0]}%`, top: `${l.map[1]}%` }} onClick={() => setSel(id)}>
                <span className="lh-mnode__pin">
                  <Icon id={open ? GLYPH[id] : "lock"} size={26} />
                </span>
                <b>{l.short}</b>
                {G.loc === id && <em>You are here</em>}
                {bag(id) && <i title="Your dropped backpack">◆</i>}
              </button>
            );
          })}
        </div>
        <div className="lh-map__info">
          <h3>{L.name}</h3>
          <div className="lh-danger">
            {L.danger === 0 ? (
              <span className="safe">Safe by day</span>
            ) : (
              Array.from({ length: 4 }, (_, i) => <Icon key={i} id="skull" size={18} className={i < L.danger ? "on" : "off"} />)
            )}
          </div>
          <p>{L.desc}</p>
          <div className="lh-sec">
            <span>Resources</span>
          </div>
          <div className="lh-res">
            {L.resources.map((r) => (
              <span key={r} title={ITEMS[r]?.name}>
                <Icon id={r} size={26} />
              </span>
            ))}
          </div>
          <div className="lh-sec">
            <span>Threats</span>
          </div>
          <p className="lh-threats">{L.threats.join(" · ")}</p>
          {G.visited.includes(sel) ? <p className="lh-vis">Visited</p> : <p className="lh-vis lh-vis--new">Unexplored</p>}
          {!unlocked && (
            <p className="lh-lockmsg">
              <Icon id="lock" size={18} /> {L.unlock}
            </p>
          )}
          <button className="lh-btn-primary lh-gobtn" disabled={!unlocked || here || !canTravel} onClick={() => onTravel(sel)}>
            {here ? "You are here" : !unlocked ? "Locked" : canTravel ? `Travel to ${L.short}` : "Reach an exit to travel"}
          </button>
          {canTravel && !here && unlocked && <p className="lh-tip">The journey takes an hour and costs a little food and water.</p>}
        </div>
      </div>
    </div>
  );
}
