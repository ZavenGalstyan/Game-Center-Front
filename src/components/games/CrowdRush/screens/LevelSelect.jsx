/**
 * Crowd Rush — world + level selection. First the five worlds as visual cards
 * (locked worlds show a lock); picking one opens its 10-level grid with stars
 * and lock state. Completed levels stay replayable.
 */

import { useState } from "react";
import { WORLDS } from "../data/worlds.js";
import { levelsForWorld } from "../data/levels.js";
import { isLevelUnlocked, isWorldUnlocked, worldProgress } from "../utils/progression.js";

function Stars({ n }) {
  return (
    <span className="cr-stars">
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < n ? "is-on" : ""}>★</span>
      ))}
    </span>
  );
}

function WorldCard({ world, state, onOpen }) {
  const prog = worldProgress(state, world.id);
  const locked = !isWorldUnlocked(state, world.id);
  return (
    <button
      type="button"
      className={`cr-world ${locked ? "is-locked" : ""}`}
      onClick={() => !locked && onOpen(world.id)}
      disabled={locked}
      style={{
        "--w-a": world.sky[0],
        "--w-b": world.ground.color,
        "--w-accent": world.accent,
      }}
    >
      <span className="cr-world__scene" aria-hidden="true">
        <span className="cr-world__sky" />
        <span className="cr-world__road" />
        <span className="cr-world__gate" />
      </span>
      <span className="cr-world__meta">
        <span className="cr-world__name">{world.name}</span>
        <span className="cr-world__sub">
          {locked ? `Reach Level ${world.range[0]}` : `${prog.done}/${prog.total} · ${prog.stars}★`}
        </span>
      </span>
      {locked && <span className="cr-world__lock">🔒</span>}
    </button>
  );
}

export default function LevelSelect({ state, onPick, onBack }) {
  const [worldId, setWorldId] = useState(null);
  const world = WORLDS.find((w) => w.id === worldId);

  return (
    <div className="cr-screen cr-levels">
      <header className="cr-levels__head">
        <button type="button" className="cr-btn cr-btn--ghost" onClick={worldId ? () => setWorldId(null) : onBack}>
          ‹ {worldId ? "Worlds" : "Menu"}
        </button>
        <h2>{world ? world.name : "Choose a World"}</h2>
        <span />
      </header>

      {!world && (
        <div className="cr-levels__worlds">
          {WORLDS.map((w) => (
            <WorldCard key={w.id} world={w} state={state} onOpen={setWorldId} />
          ))}
        </div>
      )}

      {world && (
        <>
          <p className="cr-levels__tag">{world.tagline}</p>
          <div className="cr-levels__grid">
            {levelsForWorld(world.id).map((lvl) => {
              const rec = state.levels[lvl.id];
              const unlocked = isLevelUnlocked(state, lvl.id);
              return (
                <button
                  key={lvl.id}
                  type="button"
                  className={`cr-lvl ${unlocked ? "" : "is-locked"} ${rec?.completed ? "is-done" : ""}`}
                  onClick={() => unlocked && onPick(lvl.id)}
                  disabled={!unlocked}
                >
                  <span className="cr-lvl__n">{unlocked ? String(lvl.id).padStart(2, "0") : "🔒"}</span>
                  {unlocked && <Stars n={rec?.stars || 0} />}
                  {lvl.finish.type === "boss" && <span className="cr-lvl__boss">BOSS</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
