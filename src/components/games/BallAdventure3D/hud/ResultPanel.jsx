function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(2);
  return `${String(m).padStart(2, "0")}:${s.padStart(5, "0")}`;
}

export default function ResultPanel({ levelName, timeSec, bestTime, crystals, stars, hasNext, onNext, onReplay, onLevelSelect }) {
  return (
    <div className="ba3d-result">
      <div className="ba3d-result__card">
        <h2>LEVEL COMPLETE</h2>
        <p className="ba3d-result__level">{levelName}</p>

        <div className="ba3d-result__stars">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`ba3d-star${i < stars ? " is-on" : ""}`}>★</span>
          ))}
        </div>

        <div className="ba3d-result__stats">
          <div><span>Time</span><strong>{formatTime(timeSec)}</strong></div>
          <div><span>Best</span><strong>{bestTime != null ? formatTime(bestTime) : formatTime(timeSec)}</strong></div>
          <div><span>Crystals</span><strong>{crystals} / 3</strong></div>
        </div>

        <div className="ba3d-result__actions">
          {hasNext && <button className="ba3d-btn ba3d-btn--primary" onClick={onNext}>NEXT LEVEL</button>}
          <button className="ba3d-btn" onClick={onReplay}>REPLAY</button>
          <button className="ba3d-btn" onClick={onLevelSelect}>LEVEL SELECT</button>
        </div>
      </div>
    </div>
  );
}
