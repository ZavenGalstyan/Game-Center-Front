/** Stack Tower — main menu. The live demo tower on the canvas is the backdrop. */
export default function MainMenu({ best, onPlay, onThemes, onStats, onSettings }) {
  return (
    <div className="st-menu">
      <div className="st-menu__head">
        <h1 className="st-title">
          <span>STACK</span>
          <span>TOWER</span>
        </h1>
        <p className="st-sub">STACK • BALANCE • REACH THE SKY</p>
      </div>
      <div className="st-menu__actions">
        <button type="button" className="st-btn st-btn--primary st-btn--play" onClick={onPlay}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
          </svg>
          PLAY
        </button>
        <div className="st-menu__row">
          <button type="button" className="st-btn" onClick={onThemes}>
            THEMES
          </button>
          <button type="button" className="st-btn" onClick={onStats}>
            STATISTICS
          </button>
          <button type="button" className="st-btn" onClick={onSettings}>
            SETTINGS
          </button>
        </div>
        {best > 0 && (
          <p className="st-menu__best">
            BEST <b>{best}</b>
          </p>
        )}
      </div>
    </div>
  );
}
