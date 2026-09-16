import { WORLDS } from "../data/worlds.js";
import { levelsForWorld } from "../data/levels/index.js";

export default function WorldSelect({ progress, totalStars, onOpenWorld, onBack }) {
  return (
    <div className="ba3d-screen">
      <div className="ba3d-screen__header">
        <button className="ba3d-btn ba3d-btn--small" onClick={onBack}>&larr; MENU</button>
        <h2>WORLDS</h2>
        <span className="ba3d-screen__stars">&#9733; {totalStars}</span>
      </div>
      <div className="ba3d-worldgrid">
        {WORLDS.map((w) => {
          const levels = levelsForWorld(w);
          const done = levels.filter((l) => progress.levels[l.id]?.completed).length;
          const stars = levels.reduce((s, l) => s + (progress.levels[l.id]?.stars || 0), 0);
          const unlocked = w.built && totalStars >= w.unlockStars;
          const clickable = unlocked;
          return (
            <button
              key={w.id}
              className={`ba3d-worldcard${clickable ? "" : " is-locked"}`}
              style={{ background: `linear-gradient(160deg, ${w.sky[1]}, ${w.sky[0]})`, borderColor: w.accent }}
              onClick={() => clickable && onOpenWorld(w)}
              disabled={!clickable}
            >
              <span className="ba3d-worldcard__num">{w.index}</span>
              <span className="ba3d-worldcard__name">{w.name}</span>
              <span className="ba3d-worldcard__mechanic">{w.mechanic}</span>
              {w.built ? (
                <>
                  <span className="ba3d-worldcard__progress">{done}/10 levels</span>
                  <span className="ba3d-worldcard__stars">&#9733; {stars}/30</span>
                </>
              ) : (
                <span className="ba3d-worldcard__soon">Coming Soon</span>
              )}
              {!unlocked && w.built && <span className="ba3d-worldcard__lock">Need {w.unlockStars} &#9733;</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
