/** Bottle Flip — lifetime statistics. */
import { Icon } from "../components/icons.jsx";
import { totalStars } from "../utils/progress.js";
import { TOTAL_LEVELS } from "../levels/levels.js";

function fmtTime(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export default function Statistics({ progress, onBack }) {
  const st = progress.stats;
  const rate = st.flips ? Math.round((st.landings / st.flips) * 100) : 0;
  const rows = [
    ["Levels completed", `${st.levelsCompleted} / ${TOTAL_LEVELS}`],
    ["Total flips", st.flips],
    ["Successful landings", st.landings],
    ["Perfect landings", st.perfects],
    ["Failed landings", st.fails],
    ["Landing rate", `${rate}%`],
    ["Longest streak", st.bestStreak],
    ["Stars collected", `${totalStars(progress)} / ${TOTAL_LEVELS * 3}`],
    ["Total attempts", st.attempts],
    ["Total play time", fmtTime(st.playTimeMs)],
  ];
  return (
    <div className="bf-screen bf-list">
      <header className="bf-head">
        <button type="button" className="bf-back" onClick={onBack}>
          <Icon.back /> Back
        </button>
        <h2>Statistics</h2>
        <span />
      </header>
      <div className="bf-stats">
        {rows.map(([k, v]) => (
          <div key={k} className="bf-stat">
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
