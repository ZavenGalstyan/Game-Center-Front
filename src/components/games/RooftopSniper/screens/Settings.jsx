/**
 * Rooftop Sniper — Settings: sound, sensitivity (normal + scoped),
 * graphics quality, invert Y. `muted` (from the shared GamePlayer Mute
 * button) is shown but not editable here — it always overrides sfx.
 */
export default function Settings({ settings, muted, onChange, onBack }) {
  return (
    <div className="rs-select">
      <header className="rs-select__header">
        <button type="button" className="rs-btn rs-btn--icon" onClick={onBack}>&larr;</button>
        <h1>SETTINGS</h1>
        <div />
      </header>
      <div className="rs-settings">
        <label className="rs-settings__row">
          Sound Effects {muted && <span className="rs-settings__muted">(muted)</span>}
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.sfx}
            onChange={(e) => onChange({ sfx: Number(e.target.value) })}
          />
        </label>
        <label className="rs-settings__row">
          Mouse Sensitivity
          <input
            type="range"
            min="0.2"
            max="2"
            step="0.1"
            value={settings.sensitivity}
            onChange={(e) => onChange({ sensitivity: Number(e.target.value) })}
          />
        </label>
        <label className="rs-settings__row">
          Scope Sensitivity
          <input
            type="range"
            min="0.1"
            max="2"
            step="0.1"
            value={settings.scopeSensitivity}
            onChange={(e) => onChange({ scopeSensitivity: Number(e.target.value) })}
          />
        </label>
        <label className="rs-settings__row">
          Graphics
          <select value={settings.graphics} onChange={(e) => onChange({ graphics: e.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="rs-settings__row">
          Invert Y
          <input
            type="checkbox"
            checked={settings.invertY}
            onChange={(e) => onChange({ invertY: e.target.checked })}
          />
        </label>
      </div>
    </div>
  );
}
