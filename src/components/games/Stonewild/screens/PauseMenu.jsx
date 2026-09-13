/**
 * Stonewild — the pause/"click to play" overlay. Same overlay serves both
 * moments: before the first pointer lock it reads as an intro card with
 * controls; after Esc releases the lock it reads as a pause menu. Per the
 * spec ("click game viewport: lock mouse"), a click ANYWHERE on this
 * overlay — backdrop or card body alike — re-requests pointer lock; only
 * Settings and Save & Quit stop propagation so picking them doesn't also
 * fire onResume.
 */

export default function PauseMenu({ started, worldName, onResume, onSettings, onSaveQuit }) {
  return (
    <div className="sw-overlay sw-pause" onClick={onResume}>
      <div className="sw-card">
        <p className="sw-card__eyebrow">{worldName}</p>
        <h2 className="sw-card__title">{started ? "Paused" : "Click to Play"}</h2>
        {!started && (
          <p className="sw-card__line">
            WASD move &middot; Mouse look &middot; Space jump &middot; Shift sprint &middot; Esc pause
          </p>
        )}
        <div className="sw-card__actions">
          <button type="button" className="sw-btn sw-btn--primary" onClick={onResume}>
            {started ? "Resume" : "Click to Play"}
          </button>
          {started && (
            <>
              <button type="button" className="sw-btn" onClick={(e) => { e.stopPropagation(); onSettings(); }}>
                Settings
              </button>
              <button type="button" className="sw-btn" onClick={(e) => { e.stopPropagation(); onSaveQuit(); }}>
                Save &amp; Quit
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
