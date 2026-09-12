/**
 * Liquid Sort — Statistics: lifetime counters, all sourced straight from
 * localStorage state. Purely a read-out; nothing here is editable.
 */
import { TOTAL_LEVELS } from "../data/chapters.js";

export default function LiquidStatistics({ state, onBack }) {
  const s = state.statistics;
  const cards = [
    { label: "Levels Completed", value: `${s.levelsCompleted}/${TOTAL_LEVELS}` },
    { label: "Total Stars", value: `${s.totalStars}/${TOTAL_LEVELS * 3}` },
    { label: "Perfect Solves", value: s.perfectSolves },
    { label: "Total Moves", value: s.totalMoves },
    { label: "Total Pours", value: s.totalPours },
    { label: "Hints Used", value: s.hintsUsed },
    { label: "Undoes Used", value: s.undoesUsed },
    { label: "Level 100", value: state.levels[100]?.completed ? "Cleared" : "Locked" },
  ];

  return (
    <div className="ls-sub">
      <div className="ls-topbar">
        <button type="button" className="ls-btn ls-btn--ghost" onClick={onBack}>← Back</button>
        <div className="ls-topbar__title">Statistics</div>
        <span style={{ width: 64 }} />
      </div>
      <div className="ls-stat-grid">
        {cards.map((c) => (
          <div className="ls-panel ls-stat-card" key={c.label}>
            <b>{c.value}</b>
            <span>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
