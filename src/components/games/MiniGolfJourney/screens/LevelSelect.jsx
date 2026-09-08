/**
 * Mini Golf Journey — Level Select.
 *
 * First the five world tiles (a game map, not a table). Pick one and its ten
 * level nodes slide in. All completed levels stay replayable; locked nodes
 * show a clear lock.
 */
import { useState } from "react";
import { WORLDS } from "../data/worlds.js";
import { levelsForWorld } from "../data/levels.js";
import WorldCard from "../components/WorldCard.jsx";
import LevelCard from "../components/LevelCard.jsx";
import { IconChevronLeft } from "../components/Icons.jsx";

export default function LevelSelect({ state, onBack, onPlayLevel }) {
  const [openWorld, setOpenWorld] = useState(null);

  const worldStats = (w) => {
    const ls = levelsForWorld(w.id);
    let completed = 0;
    let stars = 0;
    for (const l of ls) {
      const r = state.results[l.id];
      if (r?.completed) completed += 1;
      stars += r?.stars || 0;
    }
    return { completed, total: ls.length, stars, maxStars: ls.length * 3 };
  };

  if (openWorld == null) {
    return (
      <div className="mgj-screen mgj-select">
        <header className="mgj-screen__head">
          <button type="button" className="mgj-btn mgj-btn--ghost mgj-btn--sm" onClick={onBack}>
            <IconChevronLeft /> Menu
          </button>
          <h2 className="mgj-screen__title">Choose a World</h2>
          <span className="mgj-screen__count">
            {state.stats.levelsCompleted}/50
          </span>
        </header>

        <div className="mgj-screen__body">
          <div className="mgj-worlds">
            {WORLDS.map((w) => {
              const s = worldStats(w);
              return (
                <WorldCard
                  key={w.id}
                  world={w}
                  locked={!state.unlockedWorlds.includes(w.id)}
                  completed={s.completed}
                  total={s.total}
                  stars={s.stars}
                  maxStars={s.maxStars}
                  onClick={() => setOpenWorld(w.id)}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const world = WORLDS.find((w) => w.id === openWorld);
  const levels = levelsForWorld(openWorld);
  const s = worldStats(world);

  return (
    <div className="mgj-screen mgj-select" style={{ "--w-accent": world.palette.accent }}>
      <header className="mgj-screen__head">
        <button type="button" className="mgj-btn mgj-btn--ghost mgj-btn--sm" onClick={() => setOpenWorld(null)}>
          <IconChevronLeft /> Worlds
        </button>
        <h2 className="mgj-screen__title">{world.name}</h2>
        <span className="mgj-screen__count">
          {s.completed}/10 · {s.stars}★
        </span>
      </header>

      <div className="mgj-screen__body">
        <p className="mgj-select__blurb">{world.blurb}</p>
        <div className="mgj-levels">
          {levels.map((l) => (
            <LevelCard
              key={l.id}
              level={l}
              locked={!state.unlockedLevels.includes(l.id)}
              result={state.results[l.id]}
              onClick={() => onPlayLevel(l.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
