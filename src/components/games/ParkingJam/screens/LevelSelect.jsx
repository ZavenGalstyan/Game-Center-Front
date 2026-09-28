/**
 * Parking Jam — level select. Five illustrated world cards on the left; the
 * chosen world's 20 levels on the right laid out as two facing rows of
 * parking stalls. Cleared stalls hold a parked car, the next level glows,
 * locked stalls are chained off.
 */
import { memo } from "react";
import { Icon } from "../components/icons.jsx";
import { WORLDS, worldLevelIds, LEVELS_PER_WORLD } from "../data/worlds.js";
import { isWorldUnlocked, worldSummary, summary, nextPlayable } from "../utils/progress.js";
import { getLevel } from "../data/index.js";
import { VehicleTop, VehicleDefs } from "../render/Vehicle.jsx";
import { COLORS } from "../engine/level.js";

/** A tiny illustrated vignette of each location. */
export const WorldArt = memo(function WorldArt({ world }) {
  const sc = world.scene;
  const id = `pjw${world.id}`;
  const cars = [
    { x: 58, y: 44, a: 0, c: COLORS[world.id % 10] },
    { x: 84, y: 44, a: 180, c: COLORS[(world.id + 3) % 10] },
    { x: 110, y: 44, a: 0, c: COLORS[(world.id + 6) % 10] },
    { x: 150, y: 58, a: 90, c: COLORS[(world.id + 1) % 10] },
  ];
  return (
    <svg viewBox="0 0 200 90" className="pj-worldart" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs><VehicleDefs id={id} /></defs>
      <rect width="200" height="90" fill={sc.ground} />
      {world.key === "sunny" && [[14, 16], [186, 74], [180, 14], [18, 76]].map(([x, y], i) => (
        <g key={i}><circle cx={x + 3} cy={y + 4} r="13" fill="rgba(0,0,0,.2)" /><circle cx={x} cy={y} r="13" fill="#3f9a45" /><circle cx={x - 3} cy={y - 4} r="6" fill="#6cc46c" /></g>
      ))}
      {world.key === "garage" && (
        <g>
          <rect x="0" y="0" width="200" height="12" fill="#5d636b" />
          <rect x="0" y="9" width="200" height="4" fill="url(#pjw-haz)" />
          {[20, 180].map((x) => <rect key={x} x={x - 8} y="40" width="16" height="16" fill="#c3c7cc" stroke="#7d838b" />)}
        </g>
      )}
      {world.key === "mall" && (
        <g>
          <rect x="0" y="0" width="200" height="16" fill="#e9e2d6" />
          {Array.from({ length: 10 }, (_, i) => <rect key={i} x={i * 20 + 2} y="16" width="16" height="6" fill={["#e0463b", "#2f7de1", "#3dae5a", "#f28a2e"][i % 4]} />)}
        </g>
      )}
      {world.key === "airport" && (
        <g>
          <rect x="0" y="0" width="200" height="18" fill="#e8eef3" />
          {Array.from({ length: 9 }, (_, i) => <rect key={i} x={i * 22 + 4} y="3" width="18" height="12" fill="#a9d4ee" />)}
          <path d="M150 76 l14 -3 l-3 -8 l6 0 l6 7 l12 -2 l-1 4 l-12 2 l-4 8 l-5 0 l2 -7 l-14 3z" fill="#fff" opacity=".85" />
        </g>
      )}
      {world.key === "night" && (
        <g>
          <rect x="0" y="0" width="200" height="16" fill="#34384a" />
          {Array.from({ length: 16 }, (_, i) => <rect key={i} x={i * 12 + 3} y="4" width="6" height="3" fill={i % 3 ? "#ffe9a8" : "#40e0ff"} opacity=".8" />)}
          <circle cx="24" cy="70" r="26" fill="#ffe9a8" opacity=".14" />
          <circle cx="176" cy="30" r="26" fill="#ffe9a8" opacity=".12" />
        </g>
      )}
      <rect x="36" y="24" width="140" height="56" rx="4" fill={sc.lot} />
      <rect x="36" y="24" width="140" height="56" rx="4" fill="none" stroke={sc.line} strokeWidth="1.2" strokeDasharray="4 3" />
      {[62, 88, 114].map((x) => <path key={x} d={`M${x - 13} 24 v10 M${x - 13} 70 v10`} stroke={sc.line} strokeWidth="1.2" />)}
      {cars.map((c, i) => (
        <g key={i} transform={`translate(${c.x} ${c.y}) rotate(${c.a}) scale(0.22)`}>
          <g transform="translate(4 8)" opacity=".3"><rect x="-34" y="-90" width="68" height="180" rx="26" /></g>
          <VehicleTop type={["sedan", "hatch", "suv", "coupe"][i]} cells={2} color={c.c} defs={id} night={world.night} detail="low" />
        </g>
      ))}
      {world.night && <rect width="200" height="90" fill="rgba(20,14,60,.28)" />}
      <defs>
        <pattern id="pjw-haz" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#f2c230" /><rect width="4" height="8" fill="#26292e" />
        </pattern>
      </defs>
    </svg>
  );
});

function Stall({ id, state, stars, flip, onPlay, world }) {
  const num = ((id - 1) % LEVELS_PER_WORLD) + 1;
  const lv = state === "done" ? getLevel(id) : null;
  const car = lv ? lv.vehicles[0] : null;
  return (
    <button
      type="button"
      className={`pj-stall pj-stall--${state}${flip ? " is-flip" : ""}`}
      onClick={() => state !== "locked" && onPlay(id)}
      disabled={state === "locked"}
      aria-label={`Level ${id}${state === "locked" ? ", locked" : state === "done" ? `, ${stars} stars` : ""}`}
    >
      <span className="pj-stall__num">{num}</span>
      {state === "done" && car && (
        <svg className="pj-stall__car" viewBox="-50 -100 100 200" aria-hidden="true">
          <g transform={`rotate(${flip ? 180 : 0})`}>
            <rect x="-30" y="-84" width="66" height="176" rx="24" fill="rgba(0,0,0,.25)" transform="translate(4 6)" />
            <VehicleTop type={car.type === "bus" || car.type === "shuttle" || car.length > 2 ? "sedan" : car.type} cells={2} color={car.color} defs="pjls" night={world.night} detail="low" />
          </g>
        </svg>
      )}
      {state === "locked" && <span className="pj-stall__lock"><Icon.lock /></span>}
      {state === "next" && <span className="pj-stall__go"><Icon.play /></span>}
      <span className="pj-stall__stars">
        {[0, 1, 2].map((k) => <Icon.star key={k} className={k < stars ? "is-on" : ""} />)}
      </span>
    </button>
  );
}

export default function LevelSelect({ progress, worldId, onWorld, onPlay, onBack }) {
  const world = WORLDS[worldId - 1];
  const unlocked = isWorldUnlocked(progress, worldId);
  const ids = worldLevelIds(worldId);
  const next = nextPlayable(progress);
  const s = summary(progress);
  const stateOf = (id) => {
    if (progress.completedLevels.includes(id)) return "done";
    if (id > progress.unlockedLevel) return "locked";
    return id === next ? "next" : "open";
  };
  return (
    <div className="pj-levels">
      <header className="pj-head">
        <button type="button" className="pj-btn pj-btn--icon" onClick={onBack} aria-label="Back to menu"><Icon.back /></button>
        <h2 className="pj-head__title">Levels</h2>
        <span className="pj-head__meta"><Icon.star className="is-on" /> {s.stars} / {ids.length * WORLDS.length * 3}</span>
      </header>
      <div className="pj-levels__body">
        <nav className="pj-worlds" aria-label="Parking locations">
          {WORLDS.map((w) => {
            const ws = worldSummary(progress, w.id);
            const open = isWorldUnlocked(progress, w.id);
            return (
              <button
                key={w.id}
                type="button"
                className={`pj-worldcard${w.id === worldId ? " is-active" : ""}${open ? "" : " is-locked"}`}
                onClick={() => onWorld(w.id)}
                aria-pressed={w.id === worldId}
              >
                <WorldArt world={w} />
                <span className="pj-worldcard__info">
                  <b>{w.name}</b>
                  {open ? (
                    <small>{ws.completed}/{ws.total} · <Icon.star className="is-on" /> {ws.stars}/{ws.total * 3}</small>
                  ) : (
                    <small><Icon.lock /> Clear level {(w.id - 1) * LEVELS_PER_WORLD}</small>
                  )}
                </span>
                {open && <span className="pj-worldcard__bar"><i style={{ width: `${(ws.completed / ws.total) * 100}%` }} /></span>}
              </button>
            );
          })}
        </nav>
        <section className="pj-lot" aria-label={`${world.name} levels`}>
          <div className="pj-lot__head">
            <b>{world.name}</b>
            <span>{world.blurb}</span>
          </div>
          <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true"><defs><VehicleDefs id="pjls" /></defs></svg>
          <div className="pj-lot__asphalt">
            <div className="pj-lot__row">
              {ids.slice(0, 10).map((id) => (
                <Stall key={id} id={id} state={stateOf(id)} stars={progress.starsByLevel[id] || 0} onPlay={onPlay} world={world} />
              ))}
            </div>
            <div className="pj-lot__lane" aria-hidden="true"><span /></div>
            <div className="pj-lot__row">
              {ids.slice(10).map((id) => (
                <Stall key={id} id={id} state={stateOf(id)} stars={progress.starsByLevel[id] || 0} onPlay={onPlay} flip world={world} />
              ))}
            </div>
            {!unlocked && (
              <div className="pj-lot__closed">
                <Icon.lock />
                <b>Closed</b>
                <span>Clear level {(worldId - 1) * LEVELS_PER_WORLD} to open {world.name}</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
