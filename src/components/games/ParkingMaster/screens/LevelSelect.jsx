/**
 * Parking Master — level select. First the five environments, then the ten
 * levels inside the chosen one. Locked worlds/levels show what unlocks them.
 */

import { useState } from "react";
import { ENVIRONMENTS } from "../data/environments.js";
import { levelsForWorld } from "../data/levels.js";
import { formatTime } from "../utils/scoring.js";

function Stars({ n }) {
  return (
    <span className="pm-stars" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <StarIcon key={i} filled={i < n} />
      ))}
    </span>
  );
}

export default function LevelSelect({ state, initialWorld, onPlay, onBack }) {
  const [worldId, setWorldId] = useState(initialWorld || null);

  const worldStatus = (env, idx) => {
    if (idx === 0) return { locked: false };
    const prev = ENVIRONMENTS[idx - 1];
    const prevLevels = levelsForWorld(prev.id);
    const doneCount = prevLevels.filter((l) => state.levels[l.id]?.completed).length;
    return { locked: doneCount < prevLevels.length, need: prevLevels.length - doneCount, prevName: prev.name };
  };

  if (!worldId) {
    return (
      <div className="pm-screen pm-select">
        <header className="pm-select__head">
          <button type="button" className="pm-btn pm-btn--ghost" onClick={onBack}>Back</button>
          <h2>Choose a Location</h2>
          <span />
        </header>
        <div className="pm-worlds">
          {ENVIRONMENTS.map((env, idx) => {
            const st = worldStatus(env, idx);
            const levels = levelsForWorld(env.id);
            const stars = levels.reduce((s, l) => s + (state.levels[l.id]?.stars || 0), 0);
            const done = levels.filter((l) => state.levels[l.id]?.completed).length;
            return (
              <button
                key={env.id}
                type="button"
                className={`pm-world pm-world--${env.id}${st.locked ? " is-locked" : ""}`}
                style={{ "--accent": env.accent }}
                disabled={st.locked}
                onClick={() => setWorldId(env.id)}
              >
                <span className="pm-world__name">{env.name}</span>
                <span className="pm-world__tag">{env.tagline}</span>
                {st.locked ? (
                  <span className="pm-world__lock">
                    <LockIcon /> Finish {st.need} more in {st.prevName}
                  </span>
                ) : (
                  <span className="pm-world__progress">
                    {done}/{levels.length} levels · {stars}★
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const levels = levelsForWorld(worldId);
  const env = ENVIRONMENTS.find((e) => e.id === worldId);

  return (
    <div className="pm-screen pm-select">
      <header className="pm-select__head">
        <button type="button" className="pm-btn pm-btn--ghost" onClick={() => setWorldId(null)}>Back</button>
        <h2>{env.name}</h2>
        <span />
      </header>
      <div className="pm-levels">
        {levels.map((l) => {
          const rec = state.levels[l.id];
          const locked = l.id > state.unlockedLevel;
          return (
            <button
              key={l.id}
              type="button"
              className={`pm-level${locked ? " is-locked" : ""}${rec?.completed ? " is-done" : ""}`}
              disabled={locked}
              onClick={() => onPlay(l.id)}
            >
              <span className="pm-level__num">{String(l.index).padStart(2, "0")}</span>
              <span className="pm-level__name">{l.name}</span>
              {locked ? (
                <span className="pm-level__meta"><LockIcon /></span>
              ) : rec?.completed ? (
                <span className="pm-level__meta">
                  <Stars n={rec.stars} />
                  <span className="pm-level__best">Best {formatTime(rec.bestTime)} · {rec.bestPrecision}%</span>
                </span>
              ) : (
                <span className="pm-level__meta pm-level__meta--new">Not completed</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StarIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" className={filled ? "is-filled" : ""} aria-hidden>
      <path d="M12 2l3 6.5 7 .9-5 4.9 1.2 7L12 18l-6.4 3.3L6.9 14.3 2 9.4l7-.9z" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
