import { useState } from "react";
import { OPERATIONS } from "../data/operations.js";
import { isMissionUnlocked, isOperationUnlocked, operationProgress } from "../systems/progressionSystem.js";
import { missionsForOperation } from "../data/missions.js";
import { LockIcon } from "../components/icons.jsx";
import { formatClock } from "../utils/timing.js";
import { missionBest } from "../utils/storage.js";

export default function MissionSelect({ state, onPick, onBack }) {
  const initial = OPERATIONS.find((o) => isOperationUnlocked(state, o) && state.unlockedMission <= o.range[1]) || OPERATIONS[0];
  const [opId, setOpId] = useState(initial.id);
  const op = OPERATIONS.find((o) => o.id === opId) || OPERATIONS[0];
  const missions = missionsForOperation(op.id);

  return (
    <div className="bs-select" style={{ "--bs-accent": op.accent }}>
      <div className="bs-select__header">
        <button type="button" className="bs-icon-btn" onClick={onBack} aria-label="Back to Menu">&#8592;</button>
        <h2 className="bs-select__title">MISSION SELECT</h2>
        <div style={{ width: 32 }} />
      </div>

      <div className="bs-select__operations">
        {OPERATIONS.map((o) => {
          const unlocked = isOperationUnlocked(state, o);
          const progress = operationProgress(state, o);
          return (
            <button
              key={o.id}
              type="button"
              className={`bs-op-card${o.id === opId ? " is-active" : ""}${!unlocked ? " is-locked" : ""}`}
              style={{ "--bs-op-accent": o.accent }}
              onClick={() => unlocked && setOpId(o.id)}
              disabled={!unlocked}
            >
              <span className="bs-op-card__num">OP {o.index + 1}</span>
              <span className="bs-op-card__name">{o.name}</span>
              <span className="bs-op-card__sub">{unlocked ? `${progress.completed}/10 • ${progress.stars}★` : "LOCKED"}</span>
            </button>
          );
        })}
      </div>

      <div className="bs-select__grid" role="list">
        {missions.map((m) => {
          const unlocked = isMissionUnlocked(state, m.id);
          const rec = missionBest(state, m.id);
          return (
            <button
              key={m.id}
              type="button"
              className={`bs-mission-btn${!unlocked ? " is-locked" : ""}${rec.perfect ? " is-perfect" : ""}`}
              disabled={!unlocked}
              onClick={() => onPick(m.id)}
              role="listitem"
            >
              {!unlocked ? (
                <LockIcon />
              ) : (
                <>
                  <span className="bs-mission-btn__num">{m.id}</span>
                  <span className="bs-mission-btn__stars">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className={i < (rec.stars || 0) ? "is-lit" : ""}>&#9733;</span>
                    ))}
                  </span>
                  <span className="bs-mission-btn__time">{rec.completed ? formatClock(rec.bestTimeRemaining) : "--:--"}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
