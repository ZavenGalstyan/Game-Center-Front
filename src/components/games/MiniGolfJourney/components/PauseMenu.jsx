/**
 * Mini Golf Journey — in-game pause overlay. No browser navigation: every
 * option routes through the internal screen state machine.
 */
import { IconPlay, IconRestart, IconGear, IconGrid, IconHome } from "./Icons.jsx";

export default function PauseMenu({ onResume, onRestart, onSettings, onLevelSelect, onMainMenu }) {
  return (
    <div className="mgj-pause">
      <div className="mgj-pause__card">
        <h3 className="mgj-pause__title">Paused</h3>
        <div className="mgj-pause__list">
          <button type="button" className="mgj-btn mgj-btn--primary" onClick={onResume}>
            <IconPlay /> Resume
          </button>
          <button type="button" className="mgj-btn" onClick={onRestart}>
            <IconRestart /> Restart level
          </button>
          <button type="button" className="mgj-btn" onClick={onSettings}>
            <IconGear /> Settings
          </button>
          <button type="button" className="mgj-btn" onClick={onLevelSelect}>
            <IconGrid /> Level select
          </button>
          <button type="button" className="mgj-btn" onClick={onMainMenu}>
            <IconHome /> Main menu
          </button>
        </div>
      </div>
    </div>
  );
}
