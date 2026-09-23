/** Laser Maze — the ten levels of one world. */
import { Icon, Stars } from "../components/icons.jsx";
import { WORLDS, worldLevelIds } from "../data/worlds.js";
import { getLevel } from "../data/index.js";
import { isWorldUnlocked, worldSummary, nextPlayable } from "../utils/progress.js";

export default function LevelSelect({ progress, worldId, onPlay, onWorld, onBack }) {
  const world = WORLDS[worldId - 1];
  const sum = worldSummary(progress, worldId);
  const next = nextPlayable(progress);
  const prevOpen = worldId > 1;
  const nextOpen = worldId < WORLDS.length && isWorldUnlocked(progress, worldId + 1);
  return (
    <div className="lm-screen lm-levels">
      <header className="lm-screen__head">
        <button type="button" className="lm-back" onClick={onBack}><Icon.back /> Worlds</button>
        <div className="lm-levels__title">
          <button type="button" className="lm-arrow" disabled={!prevOpen} onClick={() => onWorld(worldId - 1)} aria-label="Previous world"><Icon.back /></button>
          <div>
            <span className="lm-levels__eyebrow">World {world.id} · {world.mechanic}</span>
            <h2>{world.name}</h2>
          </div>
          <button type="button" className="lm-arrow" disabled={!nextOpen} onClick={() => onWorld(worldId + 1)} aria-label="Next world"><Icon.next /></button>
        </div>
        <span className="lm-screen__meta">★ {sum.stars}/30</span>
      </header>
      <p className="lm-levels__sub">{world.subtitle}</p>
      <div className="lm-levels__grid">
        {worldLevelIds(worldId).map((id, i) => {
          const level = getLevel(id);
          const rec = progress.levels[id];
          const open = level && id <= progress.unlocked;
          const current = open && id === next;
          return (
            <button key={id} type="button" disabled={!open} onClick={() => onPlay(id)}
              className={`lm-ltile${open ? "" : " is-locked"}${rec?.completed ? " is-done" : ""}${current ? " is-current" : ""}`}
              aria-label={`Level ${world.id}-${i + 1}${open ? "" : " locked"}`}>
              <span className="lm-ltile__num">{i + 1}</span>
              {open ? (
                <>
                  <span className="lm-ltile__name">{level.name}</span>
                  <Stars n={rec?.stars || 0} size={14} />
                  <span className="lm-ltile__best">{rec?.bestMoves != null ? `best ${rec.bestMoves} · par ${level.par}` : `par ${level.par}`}</span>
                </>
              ) : (
                <span className="lm-ltile__lock"><Icon.lock /></span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
