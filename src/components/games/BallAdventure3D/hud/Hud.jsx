function formatTime(sec) {
  if (sec == null) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Minimal gameplay HUD — the world dominates the screen, not the UI. */
export default function Hud({ worldIndex, levelIndexInWorld, levelName, crystals, timeSec, bestTime }) {
  const collected = crystals.filter(Boolean).length;
  return (
    <div className="ba3d-hud">
      <div className="ba3d-hud__top-left">
        <span className="ba3d-hud__world">World {worldIndex}-{levelIndexInWorld}</span>
        <span className="ba3d-hud__level-name">{levelName}</span>
      </div>
      <div className="ba3d-hud__top-right">
        <div className="ba3d-hud__crystals">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`ba3d-hud__gem${i < collected ? " is-on" : ""}`} />
          ))}
        </div>
        <div className="ba3d-hud__time">{formatTime(timeSec)}</div>
        {bestTime != null && <div className="ba3d-hud__best">Best {formatTime(bestTime)}</div>}
      </div>
    </div>
  );
}
