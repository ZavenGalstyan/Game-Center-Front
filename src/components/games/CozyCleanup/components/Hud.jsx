/**
 * Cozy Cleanup — top HUD: room name, overall cleanliness, a small
 * per-category readout, and the Hint button. Deliberately compact — the
 * room scene is the star, not the interface around it.
 */
const CATEGORY_LABEL = {
  trash: "Trash", dust: "Dust", floor: "Floor", glass: "Windows",
  stains: "Stains", organize: "Organize", bed: "Bed", laundry: "Laundry", dishes: "Dishes",
};

export default function Hud({ roomName, overallPct, categories, onHint, hintDisabled, onExit }) {
  return (
    <div className="cc-hud">
      <button type="button" className="cc-hud__exit" onClick={onExit} aria-label="Back to rooms">‹</button>
      <div className="cc-hud__info">
        <div className="cc-hud__title-row">
          <span className="cc-hud__room">{roomName}</span>
          <span className="cc-hud__pct">{Math.round(overallPct)}% clean</span>
        </div>
        <div className="cc-hud__bar">
          <div className="cc-hud__bar-fill" style={{ width: `${Math.min(100, overallPct)}%` }} />
        </div>
        <div className="cc-hud__cats">
          {Object.entries(categories).map(([k, v]) => (
            <span key={k} className={`cc-hud__cat${v >= 92 ? " cc-hud__cat--done" : ""}`}>
              {CATEGORY_LABEL[k] || k}
              {v >= 92 ? " ✓" : ` ${Math.round(v)}%`}
            </span>
          ))}
        </div>
      </div>
      <button type="button" className="cc-hud__hint" onClick={onHint} disabled={hintDisabled} title="Hint">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4.9 1 .9 1.7V16h5.2v-.4c0-.7.3-1.3.9-1.7A6 6 0 0 0 12 3Z" />
        </svg>
        Hint
      </button>
    </div>
  );
}
