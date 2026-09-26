import { totalStars, totalCrystals, worldsCompleted } from "../engine/storage.js";

function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

export default function Statistics({ progress, onBack }) {
  const s = progress.stats;
  const tiles = [
    ["Levels Completed", s.levelsCompleted],
    ["Worlds Completed", worldsCompleted(progress)],
    ["Crystals Collected", totalCrystals(progress)],
    ["Total Stars", totalStars(progress)],
    ["Total Falls", s.totalFalls],
    ["Total Jumps", s.totalJumps],
    ["Checkpoints Activated", s.checkpointsActivated],
    ["Play Time", formatTime(s.totalPlayTimeSec)],
    ["Distance Rolled", `${Math.round(s.distanceRolled)} m`],
  ];
  return (
    <div className="ba3d-screen">
      <div className="ba3d-screen__header">
        <button className="ba3d-btn ba3d-btn--small" onClick={onBack}>&larr; MENU</button>
        <h2>STATISTICS</h2>
        <span />
      </div>
      <div className="ba3d-stats">
        {tiles.map(([label, value]) => (
          <div key={label} className="ba3d-stat-tile">
            <span className="ba3d-stat-tile__value">{value}</span>
            <span className="ba3d-stat-tile__label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
