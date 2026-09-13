/**
 * Stonewild — Settings. One shared component: a full screen from the Main
 * Menu, or an overlay card when opened from the in-game Pause menu (so
 * changing render distance mid-game doesn't tear down the world).
 *
 * Only controls with an observable effect at this stage of development are
 * wired up (render distance, graphics/shadow quality, FOV, mouse
 * sensitivity). The full settings list from the spec (music/sound toggles,
 * screen shake, crosshair size, tutorial) grows in here as those systems
 * land — see Stonewild.jsx's phase notes.
 */

const RENDER_DISTANCE_OPTIONS = ["low", "medium", "high"];
const GRAPHICS_OPTIONS = ["low", "medium", "high"];

export default function SettingsScreen({ settings, onChange, onBack, overlay = false }) {
  return (
    <div className={overlay ? "sw-overlay sw-settings-overlay" : "sw-screen sw-panelscreen"}>
      <div className="sw-panel sw-panel--narrow">
        <div className="sw-panel__header">
          <h2 className="sw-panel__title">Settings</h2>
          <button type="button" className="sw-btn" onClick={onBack}>Back</button>
        </div>

        <label className="sw-field">
          <span className="sw-field__label">Render Distance</span>
          <div className="sw-segmented">
            {RENDER_DISTANCE_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`sw-segmented__btn${settings.renderDistance === opt ? " is-active" : ""}`}
                onClick={() => onChange({ renderDistance: opt })}
              >
                {opt[0].toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        </label>

        <label className="sw-field">
          <span className="sw-field__label">Graphics</span>
          <div className="sw-segmented">
            {GRAPHICS_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`sw-segmented__btn${settings.graphics === opt ? " is-active" : ""}`}
                onClick={() => onChange({ graphics: opt })}
              >
                {opt[0].toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        </label>

        <label className="sw-field">
          <span className="sw-field__label">Field of View — {settings.fov}&deg;</span>
          <input
            type="range"
            min={60}
            max={100}
            step={1}
            value={settings.fov}
            onChange={(e) => onChange({ fov: Number(e.target.value) })}
            className="sw-slider"
          />
        </label>

        <label className="sw-field">
          <span className="sw-field__label">Mouse Sensitivity — {settings.sensitivity.toFixed(1)}x</span>
          <input
            type="range"
            min={0.2}
            max={3}
            step={0.1}
            value={settings.sensitivity}
            onChange={(e) => onChange({ sensitivity: Number(e.target.value) })}
            className="sw-slider"
          />
        </label>
      </div>
    </div>
  );
}
