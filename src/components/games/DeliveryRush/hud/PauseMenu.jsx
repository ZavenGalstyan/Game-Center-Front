/**
 * Delivery Rush — pause overlay.
 *
 * Pausing freezes the whole simulation: physics, traffic and the delivery clock
 * all stop, because `paused` short-circuits the loop rather than hiding it. The
 * scene keeps rendering behind the overlay so the district stays visible.
 */

export default function PauseMenu({
  mission,
  zone,
  onResume,
  onRestart,
  onSettings,
  onMissionSelect,
  onMainMenu,
}) {
  return (
    <div className="dr-overlay dr-overlay--pause">
      <div className="dr-panel dr-panel--pause">
        <p className="dr-panel__eyebrow">{zone.name}</p>
        <h2 className="dr-panel__title">Paused</h2>
        <p className="dr-panel__sub">
          Mission {String(mission.index).padStart(2, "0")} · {mission.typeLabel}
        </p>

        <div className="dr-panel__actions">
          <button type="button" className="dr-btn dr-btn--primary" onClick={onResume}>
            Resume
          </button>
          <button type="button" className="dr-btn" onClick={onRestart}>
            Restart mission
          </button>
          <button type="button" className="dr-btn" onClick={onSettings}>
            Settings
          </button>
          <button type="button" className="dr-btn" onClick={onMissionSelect}>
            Mission select
          </button>
          <button type="button" className="dr-btn dr-btn--ghost" onClick={onMainMenu}>
            Main menu
          </button>
        </div>

        <ul className="dr-keys">
          <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>Drive</span></li>
          <li><kbd>Space</kbd><span>Handbrake</span></li>
          <li><kbd>C</kbd><span>Camera</span></li>
          <li><kbd>R</kbd><span>Reset vehicle</span></li>
          <li><kbd>Esc</kbd><span>Pause</span></li>
        </ul>
      </div>
    </div>
  );
}
