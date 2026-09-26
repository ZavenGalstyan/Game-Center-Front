import { getLevel, levelExists } from "../data/levels/index.js";

function formatTime(sec) {
  if (sec == null) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function LevelSelect({ world, progress, onPlayLevel, onBack }) {
  const ids = [];
  for (let id = world.levelStart; id <= world.levelEnd; id++) ids.push(id);

  return (
    <div className="ba3d-screen">
      <div className="ba3d-screen__header">
        <button className="ba3d-btn ba3d-btn--small" onClick={onBack}>&larr; WORLDS</button>
        <h2>{world.name}</h2>
        <span />
      </div>
      <div className="ba3d-levelgrid">
        {ids.map((id) => {
          const exists = levelExists(id);
          const rec = progress.levels[id];
          const unlocked = exists && id <= progress.highestUnlockedLevel;
          const level = exists ? getLevel(id) : null;
          return (
            <button
              key={id}
              className={`ba3d-leveltile${unlocked ? "" : " is-locked"}${!exists ? " is-unbuilt" : ""}`}
              onClick={() => unlocked && onPlayLevel(id)}
              disabled={!unlocked}
            >
              <span className="ba3d-leveltile__num">{id - world.levelStart + 1}</span>
              {exists ? (
                <>
                  <span className="ba3d-leveltile__name">{level.name}</span>
                  <span className="ba3d-leveltile__stars">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className={i < (rec?.stars || 0) ? "is-on" : ""}>&#9733;</span>
                    ))}
                  </span>
                  <span className="ba3d-leveltile__time">{formatTime(rec?.bestTime)}</span>
                </>
              ) : (
                <span className="ba3d-leveltile__name">Coming Soon</span>
              )}
              {!unlocked && exists && <span className="ba3d-leveltile__lock">&#128274;</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
