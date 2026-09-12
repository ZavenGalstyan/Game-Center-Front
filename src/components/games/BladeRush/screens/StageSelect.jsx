import { useState } from "react";
import { WORLDS, worldForStage } from "../data/worlds.js";
import { isStageUnlocked, isBossStage, isMiniBossStage, worldStars, worldCompletedCount, isWorldUnlocked } from "../utils/progression.js";
import { LockIcon, BossIcon } from "../game/icons.jsx";

export default function StageSelect({ state, onPick, onBack }) {
  const initial = worldForStage(state.unlockedStage);
  const [worldId, setWorldId] = useState(initial.id);
  const world = WORLDS.find((w) => w.id === worldId) || WORLDS[0];

  return (
    <div className="br-select" style={{ "--br-accent": world.accent }}>
      <div className="br-select__header">
        <button type="button" className="br-icon-btn" onClick={onBack} aria-label="Back to Menu">&#8592;</button>
        <h2 className="br-select__title">STAGE SELECT</h2>
        <div style={{ width: 32 }} />
      </div>

      <div className="br-select__worlds">
        {WORLDS.map((w) => {
          const unlocked = isWorldUnlocked(state, w);
          const done = worldCompletedCount(state, w);
          const stars = worldStars(state, w);
          return (
            <button
              key={w.id}
              type="button"
              className={`br-world-card${w.id === worldId ? " is-active" : ""}${!unlocked ? " is-locked" : ""}`}
              style={{ "--br-w-accent": w.accent }}
              onClick={() => unlocked && setWorldId(w.id)}
              disabled={!unlocked}
            >
              <span className="br-world-card__name">{w.name}</span>
              <span className="br-world-card__sub">{unlocked ? `${done}/20 • ${stars}★` : "LOCKED"}</span>
            </button>
          );
        })}
      </div>

      <div className="br-select__grid" role="list">
        {Array.from({ length: 20 }, (_, i) => world.range[0] + i).map((id) => {
          const unlocked = isStageUnlocked(state, id);
          const rec = state.stages[id];
          const boss = isBossStage(id);
          const mini = isMiniBossStage(id);
          return (
            <button
              key={id}
              type="button"
              className={`br-stage-btn${boss ? " is-boss" : ""}${mini ? " is-miniboss" : ""}${!unlocked ? " is-locked" : ""}`}
              disabled={!unlocked}
              onClick={() => onPick(id)}
              role="listitem"
            >
              {!unlocked ? (
                <LockIcon />
              ) : (
                <>
                  {boss && <span className="br-stage-btn__boss-icon"><BossIcon /></span>}
                  <span className="br-stage-btn__num">{id}</span>
                  <span className="br-stage-btn__stars">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className={i < (rec?.stars || 0) ? "is-lit" : ""}>&#9733;</span>
                    ))}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
