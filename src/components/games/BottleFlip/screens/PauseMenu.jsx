/** Bottle Flip — pause overlay (physics is frozen while it is open). */
import { Icon } from "../components/icons.jsx";

export default function PauseMenu({ level, onResume, onRestart, onLevels, onMenu, onSettings }) {
  return (
    <div className="bf-overlay" role="dialog" aria-label="Paused">
      <div className="bf-card bf-pause">
        <p className="bf-complete__kicker">
          LEVEL {level.id} · {level.name}
        </p>
        <h2>PAUSED</h2>
        <button type="button" className="bf-btn bf-btn--primary bf-btn--wide" onClick={onResume} autoFocus>
          <Icon.play /> RESUME
        </button>
        <button type="button" className="bf-btn bf-btn--wide" onClick={onRestart}>
          <Icon.restart /> RESTART LEVEL
        </button>
        <div className="bf-pause__row">
          <button type="button" className="bf-btn" onClick={onLevels}>
            <Icon.grid /> LEVELS
          </button>
          <button type="button" className="bf-btn" onClick={onSettings}>
            <Icon.gear /> SETTINGS
          </button>
          <button type="button" className="bf-btn" onClick={onMenu}>
            <Icon.home /> MENU
          </button>
        </div>
        <p className="bf-note">Tip: press R mid-flip to retry from your last landing.</p>
      </div>
    </div>
  );
}
