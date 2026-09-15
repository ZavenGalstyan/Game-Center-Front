/**
 * Cozy Cleanup — Statistics. A cozy little scrapbook of lifetime numbers,
 * not a corporate analytics dashboard.
 */
import { sfx } from "../engine/sound.js";

const ROWS = [
  ["roomsCleaned", "Rooms Cleaned"],
  ["trashCollected", "Trash Collected"],
  ["dustCleaned", "Surfaces Dusted"],
  ["floorAreaCleaned", "Floors Cleaned"],
  ["windowsCleaned", "Windows Cleaned"],
  ["itemsOrganized", "Items Organized"],
  ["clothesFolded", "Clothes Folded"],
  ["dishesWashed", "Dishes Washed"],
  ["bedsMade", "Beds Made"],
  ["hintsUsed", "Hints Used"],
];

function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function Statistics({ state, soundEnabled, onBack }) {
  const totalStars = Object.values(state.rooms).reduce((a, r) => a + r.stars, 0);
  return (
    <div className="cc-stats">
      <div className="cc-roomselect__head">
        <button type="button" className="cc-hud__exit" onClick={() => { sfx.back(soundEnabled); onBack(); }} aria-label="Back">‹</button>
        <h2>Statistics</h2>
      </div>
      <div className="cc-stats__scroll">
        <div className="cc-stats__hero">
          <div><b>{totalStars}</b><span>Stars earned</span></div>
          <div><b>{formatTime(state.statistics.totalPlayTimeSec)}</b><span>Time spent</span></div>
        </div>
        <div className="cc-stats__grid">
          {ROWS.map(([key, label]) => (
            <div key={key} className="cc-stats__tile">
              <b>{state.statistics[key] ?? 0}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
