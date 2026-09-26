/** Bottle Flip — level select: 5 worlds × 10 levels. */
import { useState } from "react";
import { Icon } from "../components/icons.jsx";
import { WORLDS } from "../levels/worlds.js";
import { levelsOfWorld } from "../levels/levels.js";
import { audio } from "../audio/audio.js";
import { nextLevelId } from "../utils/progress.js";

export default function LevelSelect({ progress, initialWorld, onWorld, onPlay, onBack }) {
  const [world, setWorld] = useState(initialWorld);
  const pick = (w) => {
    audio.ui();
    setWorld(w);
    onWorld(w);
  };
  const levels = levelsOfWorld(world);
  const next = nextLevelId(progress);
  const wmeta = WORLDS[world - 1];
  const stars = levels.reduce((a, l) => a + (progress.levels[l.id]?.stars || 0), 0);
  const cleared = levels.filter((l) => progress.levels[l.id]?.completed).length;
  return (
    <div className="bf-screen bf-list">
      <header className="bf-head">
        <button type="button" className="bf-back" onClick={onBack}>
          <Icon.back /> Back
        </button>
        <h2>Levels</h2>
        <span />
      </header>
      <nav className="bf-worlds" aria-label="Worlds">
        {WORLDS.map((w) => {
          const lv = levelsOfWorld(w.id);
          const open = lv.length > 0 && lv[0].id <= progress.unlocked;
          const st = lv.reduce((a, l) => a + (progress.levels[l.id]?.stars || 0), 0);
          return (
            <button
              key={w.id}
              type="button"
              className={`bf-world${w.id === world ? " is-on" : ""}${open ? "" : " is-locked"}`}
              style={{ "--wc": w.color }}
              onClick={() => pick(w.id)}
              aria-pressed={w.id === world}
            >
              <b>{w.name}</b>
              <span>
                {open ? (
                  <>
                    <Icon.star /> {st}/{lv.length * 3}
                  </>
                ) : (
                  <>
                    <Icon.lock /> Locked
                  </>
                )}
              </span>
            </button>
          );
        })}
      </nav>
      <section className="bf-worldpanel" style={{ "--wc": wmeta.color }}>
        <div className="bf-worldpanel__head">
          <div>
            <h3>{wmeta.name}</h3>
            <p>{wmeta.tag}</p>
          </div>
          <div className="bf-worldpanel__stats">
            <span>
              {cleared}/{levels.length} cleared
            </span>
            <span className="bf-gold">
              <Icon.star /> {stars}/{levels.length * 3}
            </span>
          </div>
        </div>
        <div className="bf-levelgrid">
          {levels.map((l) => {
            const rec = progress.levels[l.id];
            const open = l.id <= progress.unlocked;
            const cur = l.id === next;
            return (
              <button
                key={l.id}
                type="button"
                className={`bf-lvl${open ? "" : " is-locked"}${cur ? " is-current" : ""}${rec?.completed ? " is-done" : ""}`}
                disabled={!open}
                onClick={() => onPlay(l.id)}
                title={open ? `${l.id}. ${l.name}` : "Locked — finish the previous level"}
              >
                <span className="bf-lvl__n">{open ? l.id : <Icon.lock />}</span>
                <span className="bf-lvl__name">{open ? l.name : ""}</span>
                <span className="bf-lvl__stars" aria-label={`${rec?.stars || 0} of 3 stars`}>
                  {[1, 2, 3].map((k) => (
                    <i key={k} className={(rec?.stars || 0) >= k ? "is-on" : ""}>
                      <Icon.star />
                    </i>
                  ))}
                </span>
              </button>
            );
          })}
          {levels.length === 0 && <p className="bf-note">Coming soon.</p>}
        </div>
      </section>
    </div>
  );
}
