/** Car Wash Studio — statistics, laid out like a garage logbook board. */
import { Icon, ToolIcon } from "../components/icons.jsx";
import { completedCount, totalStars } from "../utils/progress.js";
import { TOTAL_JOBS } from "../data/jobs.js";

const fmt = (n, d = 0) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });

function time(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

export default function Statistics({ progress, onBack }) {
  const s = progress.stats;
  const rows = [
    ["hand", "Jobs completed", fmt(s.jobsCompleted)],
    ["polisher", "Cars cleaned", `${completedCount(progress)} / ${TOTAL_JOBS}`],
    ["hose", "Water used", `${fmt(s.water)} L`],
    ["foam", "Foam applied", `${fmt(s.foam, 1)} L`],
    ["sponge", "Panels scrubbed", fmt(s.panelsScrubbed)],
    ["wheelBrush", "Wheels cleaned", fmt(s.wheelsCleaned)],
    ["cloth", "Windows cleaned", fmt(s.windowsCleaned)],
    ["detailBrush", "Interiors detailed", fmt(s.interiorsDetailed)],
    ["hand", "Trash removed", fmt(s.trashRemoved)],
    ["vacuum", "Area vacuumed", `${fmt(s.vacuumed, 1)} m²`],
    ["polisher", "Cars polished", fmt(s.carsPolished)],
    ["towel", "Perfect jobs", fmt(s.perfectJobs)],
    ["spray", "Hints used", fmt(s.hintsUsed)],
    ["pressure", "Total play time", time(s.playTimeMs)],
  ];
  return (
    <div className="cws-screen cws-list">
      <header className="cws-head">
        <button type="button" className="cws-back" onClick={onBack}><Icon.back /> Back</button>
        <h2>Statistics</h2>
        <span className="cws-head__meta"><Icon.star on /> {totalStars(progress)}</span>
      </header>
      <div className="cws-board">
        {rows.map(([icon, label, value]) => (
          <div key={label} className="cws-board__cell">
            <span className="cws-board__icon"><ToolIcon tool={icon} tint="#e0b86a" size={30} /></span>
            <span className="cws-board__label">{label}</span>
            <b className="cws-board__value">{value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
