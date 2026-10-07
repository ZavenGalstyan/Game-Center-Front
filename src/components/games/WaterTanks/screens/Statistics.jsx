/** Water Tanks — local statistics (this browser only). */
import ScreenHead from "../components/ScreenHead.jsx";
import { CHAPTERS } from "../data/chapters.js";
import { TOTAL_LEVELS } from "../data/index.js";
import { chapterSummary, summary } from "../utils/progress.js";

function fmtTime(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export default function Statistics({ progress, onBack }) {
  const s = summary(progress);
  const st = progress.statistics;
  const best = CHAPTERS.reduce((acc, c) => {
    const cs = chapterSummary(progress, c.id);
    return cs.completed > 0 ? `${c.name} ${cs.completed}/${cs.total}` : acc;
  }, "—");
  const tiles = [
    ["Levels completed", `${s.completed} / ${TOTAL_LEVELS}`],
    ["Total stars", `${s.stars} / ${TOTAL_LEVELS * 3}`],
    ["Puzzles solved", st.puzzlesSolved],
    ["Optimal solves", st.optimalSolves],
    ["Perfect levels", s.perfect],
    ["Total moves", st.totalMoves],
    ["Pours", st.totalPours],
    ["Litres poured", `${st.litersTransferred} L`],
    ["Fills · Drains", `${st.totalFills} · ${st.totalDrains}`],
    ["Hints used", st.hintsUsed],
    ["Undo uses", st.undoUses],
    ["Restarts", st.restarts],
    ["Blocked pours", st.invalidActions],
    ["Play time", fmtTime(st.playTimeMs)],
    ["Best chapter progress", best],
  ];
  return (
    <div className="wt-page">
      <ScreenHead kicker="This device" title="Statistics" onBack={onBack} />
      <div className="wt-stats">
        {tiles.map(([k, v]) => (
          <div key={k} className="wt-stat">
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <div className="wt-chapter-bars">
        {CHAPTERS.map((c) => {
          const cs = chapterSummary(progress, c.id);
          return (
            <div key={c.id} className="wt-meter">
              <span className="wt-meter__label">{c.name} <b>{cs.completed}/{cs.total}</b></span>
              <span className="wt-meter__bar"><i style={{ width: `${(cs.completed / cs.total) * 100}%` }} /></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
