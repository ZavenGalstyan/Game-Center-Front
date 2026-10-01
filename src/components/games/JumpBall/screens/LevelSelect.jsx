/**
 * Jump Ball — level select. One world at a time, drawn as a vertical climb:
 * ten platform-shaped level pads zig-zag upward over that world's live
 * backdrop (the engine paints it), joined by a dotted bounce path.
 */
import { useEffect } from "react";
import { Icon } from "./icons.jsx";
import { WORLDS } from "../data/worlds.js";
import { levelsOfWorld } from "../data/levels.js";
import { isUnlocked } from "../utils/storage.js";

// pad positions (percent of the path box), bottom → top
const SPOTS = [
  [22, 92],
  [52, 83],
  [78, 72],
  [50, 62],
  [22, 52],
  [48, 42],
  [78, 32],
  [52, 22],
  [24, 12],
  [55, 3],
];

export default function LevelSelect({ progress, world, onWorld, onPick, onBack, engine }) {
  const W = WORLDS[world - 1];
  const levels = levelsOfWorld(world);
  const worldOpen = levels.length > 0 && isUnlocked(progress, levels[0].id);
  const got = levels.reduce((a, L) => a + (progress.levels[L.id]?.stars || 0), 0);

  useEffect(() => {
    engine.current?.setBackdrop(world, false);
    return () => engine.current?.setBackdrop(1, true);
  }, [world, engine]);

  return (
    <div className="jb-levels" style={{ "--jb-w": W.accent }}>
      <div className="jb-levels__side">
        <button type="button" className="jb-btn jb-btn--ghost jb-back" onClick={onBack}>
          <Icon name="back" /> BACK
        </button>
        <div className="jb-worlds" role="tablist" aria-label="Worlds">
          {WORLDS.slice()
            .reverse()
            .map((w) => {
              const ls = levelsOfWorld(w.id);
              const open = ls.length > 0 && isUnlocked(progress, ls[0].id);
              const s = ls.reduce((a, L) => a + (progress.levels[L.id]?.stars || 0), 0);
              return (
                <button
                  key={w.id}
                  type="button"
                  role="tab"
                  aria-selected={w.id === world}
                  className={`jb-world${w.id === world ? " is-on" : ""}${open ? "" : " is-locked"}`}
                  style={{ "--c": w.accent }}
                  onClick={() => onWorld(w.id)}
                >
                  <i>{w.id}</i>
                  <span>{w.name}</span>
                  {open ? (
                    <small>
                      <Icon name="star" /> {s}/{ls.length * 3}
                    </small>
                  ) : (
                    <small>
                      <Icon name="lock" />
                    </small>
                  )}
                </button>
              );
            })}
        </div>
      </div>

      <div className="jb-levels__main">
        <header className="jb-levels__head">
          <span>WORLD {W.id}</span>
          <h2>{W.name}</h2>
          <p>
            {W.blurb}
            {worldOpen && (
              <b>
                <Icon name="star" /> {got}/{levels.length * 3}
              </b>
            )}
          </p>
        </header>
        <div className="jb-path">
          <svg className="jb-path__line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={SPOTS.slice(0, levels.length).map(([x, y]) => `${x},${y + 4}`).join(" ")} />
          </svg>
          {levels.map((L, i) => {
            const open = isUnlocked(progress, L.id);
            const rec = progress.levels[L.id];
            const [x, y] = SPOTS[i];
            return (
              <button
                key={L.id}
                type="button"
                className={`jb-pad-btn${open ? "" : " is-locked"}${rec ? " is-done" : ""}${open && !rec ? " is-next" : ""}`}
                style={{ left: `${x}%`, top: `${y}%` }}
                onClick={() => open && onPick(L.id)}
                disabled={!open}
                aria-label={`Level ${L.id} ${L.name}${open ? "" : " locked"}`}
                title={L.name}
              >
                <span className="jb-pad-btn__slab">{open ? L.id : <Icon name="lock" />}</span>
                {rec && (
                  <span className="jb-pad-btn__stars">
                    {[0, 1, 2].map((k) => (
                      <Icon key={k} name="star" className={k < rec.stars ? "is-on" : ""} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
          {levels.length === 0 && <p className="jb-path__empty">COMING SOON</p>}
        </div>
      </div>
    </div>
  );
}
