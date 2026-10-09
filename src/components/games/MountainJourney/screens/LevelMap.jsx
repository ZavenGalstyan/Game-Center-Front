/**
 * Mountain Journey — the expedition map. An illustrated mountain (SVG) with
 * the whole journey on it: five regional bands from the valley floor to the
 * snowy summit, a serpentine trail through 30 markers. Completed markers are
 * gold, the current one pulses, locked ones are grey. Selecting a marker
 * shows its card (badges, viewpoint, best time) with Play.
 */
import { useMemo, useState } from "react";
import { LEVELS, TOTAL_LEVELS } from "../data/levels.js";
import { REGIONS, regionOfLevel } from "../data/regions.js";
import { WEATHER } from "../data/weather.js";
import { fmtTime } from "../hud/useTicker.js";
import { mulberry32 } from "../engine/rng.js";

const W = 1000;
const H = 600;

const HALF = [340, 290, 232, 172, 108];
const ROWY = [552, 456, 360, 266, 176];
function nodePos(id) {
  const r = Math.floor((id - 1) / 6);
  const i = (id - 1) % 6;
  const x = 500 + (-1 + (2 * i) / 5) * HALF[r] * (r % 2 === 0 ? 1 : -1);
  const y = ROWY[r] - (i % 2) * 10;
  return { x, y };
}

function trailPath() {
  let d = "";
  for (let id = 1; id <= TOTAL_LEVELS; id++) {
    const p = nodePos(id);
    if (id === 1) d += `M ${p.x} ${p.y}`;
    else {
      const q = nodePos(id - 1);
      const sameRow = Math.floor((id - 1) / 6) === Math.floor((id - 2) / 6);
      if (sameRow) d += ` Q ${(p.x + q.x) / 2} ${(p.y + q.y) / 2 + 16} ${p.x} ${p.y}`;
      else {
        const side = q.x > 500 ? 1 : -1;
        d += ` C ${q.x + side * 70} ${q.y - 10}, ${p.x + side * 70} ${p.y + 10}, ${p.x} ${p.y}`;
      }
    }
  }
  return d;
}

function Scenery() {
  const trees = useMemo(() => {
    const rand = mulberry32(7);
    const out = [];
    for (let i = 0; i < 70; i++) {
      const x = 40 + rand() * 920;
      const y = 470 + rand() * 120;
      out.push({ x, y, s: 0.7 + rand() * 0.8 });
    }
    for (let i = 0; i < 40; i++) {
      const x = 120 + rand() * 760;
      const y = 380 + rand() * 90;
      out.push({ x, y, s: 0.5 + rand() * 0.6 });
    }
    return out.sort((a, b) => a.y - b.y);
  }, []);
  return (
    <g>
      <defs>
        <linearGradient id="mjSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#21345a" />
          <stop offset="0.45" stopColor="#5c7fa8" />
          <stop offset="1" stopColor="#f2c99a" />
        </linearGradient>
        <linearGradient id="mjRock" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6f8fb" />
          <stop offset="0.22" stopColor="#dfe6ee" />
          <stop offset="0.36" stopColor="#8f8d8a" />
          <stop offset="0.55" stopColor="#7c7a6f" />
          <stop offset="0.72" stopColor="#5e7c4c" />
          <stop offset="1" stopColor="#3f6a36" />
        </linearGradient>
        <linearGradient id="mjFar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9d3e3" />
          <stop offset="1" stopColor="#8aa0bd" />
        </linearGradient>
        <radialGradient id="mjSun" cx="0.78" cy="0.2" r="0.35">
          <stop offset="0" stopColor="#fff3cf" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff3cf" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#mjSky)" />
      <rect width={W} height={H} fill="url(#mjSun)" />
      {/* far ranges */}
      <path d="M0 330 L90 250 L160 290 L250 200 L330 260 L420 170 L520 240 L610 160 L700 230 L800 150 L880 220 L1000 180 L1000 600 L0 600Z" fill="url(#mjFar)" opacity="0.55" />
      <path d="M0 400 L120 320 L200 360 L300 290 L380 350 L470 300 L560 360 L660 300 L760 350 L860 290 L1000 340 L1000 600 L0 600Z" fill="#7d94ad" opacity="0.5" />
      {/* the mountain */}
      <path d="M20 600 L130 505 L190 432 L250 348 L322 262 L378 186 L440 112 L500 52 L560 112 L622 186 L678 262 L750 348 L810 432 L870 505 L980 600 Z" fill="url(#mjRock)" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1.5" strokeLinejoin="round" />
      {/* snow streaks + rock shading */}
      <path d="M500 52 L440 112 L452 118 L420 150 L470 134 L480 170 L500 140 L520 172 L532 132 L578 150 L548 116 L560 112 Z" fill="#ffffff" opacity="0.9" />
      <path d="M500 52 L560 112 L622 186 L678 262 L750 348 L810 432 L870 505 L980 600 L760 600 L700 470 L640 360 L580 240 L530 130 Z" fill="#000" opacity="0.07" />
      {/* clouds band */}
      {[
        [150, 205, 1.2],
        [820, 215, 1],
        [300, 235, 0.8],
        [690, 240, 1.1],
      ].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`} opacity="0.85">
          <ellipse cx="0" cy="0" rx="70" ry="16" fill="#fff" />
          <ellipse cx="-30" cy="-10" rx="34" ry="16" fill="#fff" />
          <ellipse cx="22" cy="-14" rx="40" ry="20" fill="#fff" />
        </g>
      ))}
      {/* river in the valley */}
      <path d="M0 560 C 160 540, 260 590, 420 560 S 700 540, 1000 575" stroke="#7fc6e0" strokeWidth="9" fill="none" opacity="0.75" />
      {/* forests */}
      {trees.map((t, i) => (
        <g key={i} transform={`translate(${t.x} ${t.y}) scale(${t.s})`}>
          <path d="M0 -26 L9 -6 L5 -6 L12 6 L-12 6 L-5 -6 L-9 -6Z" fill={i % 3 ? "#2f5d34" : "#3c7040"} />
        </g>
      ))}
      {/* summit flag */}
      <g transform="translate(500 52)">
        <line x1="0" y1="0" x2="0" y2="-30" stroke="#3a2a1c" strokeWidth="2.5" />
        <path d="M0 -30 L22 -24 L0 -17Z" fill="#d9452b" />
      </g>
    </g>
  );
}

export default function LevelMap({ state, onPick, onBack }) {
  const current = Math.min(state.unlocked, TOTAL_LEVELS);
  const [sel, setSel] = useState(Math.min(state.lastLevel || current, current));
  const d = useMemo(trailPath, []);
  const def = LEVELS.find((l) => l.id === sel);
  const region = regionOfLevel(sel);
  const locked = sel > state.unlocked;
  const got = state.badges[sel] || [0, 0, 0];
  const regionUnlocked = (r) => state.unlocked >= r.levels[0];
  return (
    <div className="mj-map">
      <div className="mj-map__art">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label="Expedition map">
          <Scenery />
          <path d={d} stroke="rgba(60,35,15,0.55)" strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d={d} stroke="#f7e7c4" strokeWidth="3" fill="none" strokeDasharray="7 8" strokeLinecap="round" />
          {/* region labels */}
          {REGIONS.map((r, k) => {
            const p = nodePos(r.levels[0]);
            void k;
            // centred above the region's first marker, kept inside the art
            return (
              <g key={r.id} transform={`translate(${Math.max(215, Math.min(785, p.x))} ${p.y - 44})`} opacity={regionUnlocked(r) ? 1 : 0.6}>
                <text textAnchor="middle" className="mj-map__region" fill="#fff">
                  {r.name.toUpperCase()}
                </text>
                <text y="14" textAnchor="middle" className="mj-map__alt" fill="#fff">
                  {r.altitude} m{regionUnlocked(r) ? "" : " · locked"}
                </text>
              </g>
            );
          })}
          {LEVELS.map((l) => {
            const p = nodePos(l.id);
            const done = !!state.completed[l.id];
            const isCur = l.id === current && !done;
            const lock = l.id > state.unlocked;
            const isSel = l.id === sel;
            return (
              <g
                key={l.id}
                className={`mj-map__node${done ? " is-done" : ""}${isCur ? " is-current" : ""}${lock ? " is-locked" : ""}${isSel ? " is-sel" : ""}`}
                transform={`translate(${p.x} ${p.y})`}
                onClick={() => setSel(l.id)}
                role="button"
                tabIndex={0}
                aria-label={`Level ${l.id} ${l.name}${lock ? " (locked)" : done ? " (completed)" : ""}`}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSel(l.id)}
              >
                {isCur && <circle r="22" className="mj-map__pulse" />}
                <circle r="15" className="mj-map__disc" />
                <text y="5" textAnchor="middle" className="mj-map__num">
                  {lock ? "🔒" : l.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <aside className="mj-map__panel" style={{ "--accent": region.accent }}>
        <button type="button" className="mj-btn mj-btn--ghost mj-btn--small mj-map__back" onClick={onBack}>
          ← Menu
        </button>
        <div className="mj-card__kicker">
          {region.name} · Level {sel}
        </div>
        <h2 className="mj-map__name">{def ? def.name : "Uncharted Trail"}</h2>
        <p className="mj-map__obj">{locked ? "Complete the previous trail to unlock." : def?.objective}</p>
        {def && (
          <div className="mj-map__facts">
            <div>
              <span>Weather</span>
              <b>{WEATHER[def.weather]?.name}</b>
            </div>
            <div>
              <span>Badges</span>
              <b>
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`mj-dot${got[i] ? " is-on" : ""}`} />
                ))}
              </b>
            </div>
            <div>
              <span>Viewpoint</span>
              <b>{state.viewpoints[sel] ? "Discovered ◎" : "Undiscovered"}</b>
            </div>
            <div>
              <span>Best time</span>
              <b>{state.bestTime[sel] != null ? fmtTime(state.bestTime[sel]) : "—"}</b>
            </div>
          </div>
        )}
        <p className="mj-map__blurb">{region.blurb}</p>
        <button type="button" className="mj-btn mj-btn--primary mj-btn--block" disabled={locked || !def} onClick={() => onPick(sel)}>
          {locked ? "Locked" : state.completed[sel] ? "Replay Trail" : "Start Trail"}
        </button>
      </aside>
    </div>
  );
}
