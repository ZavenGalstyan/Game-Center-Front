/**
 * Supermarket Rush — settings screen (also reachable in-shift via the
 * pause menu, which uses the same fields but a compact inline layout).
 */
export default function Settings({ settings, muted, onChange, onBack }) {
  return (
    <div className="sr-screen sr-settings">
      <header className="sr-screen__header">
        <button type="button" className="sr-btn sr-btn--icon" onClick={onBack}>‹</button>
        <h1>Settings</h1>
      </header>
      <div className="sr-settings__card">
        <label className="sr-pause__row">
          Graphics
          <select value={settings.graphics} onChange={(e) => onChange({ graphics: e.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="sr-pause__row">
          Shadows
          <input type="checkbox" checked={settings.shadows} onChange={(e) => onChange({ shadows: e.target.checked })} />
        </label>
        <label className="sr-pause__row">
          Music
          <input type="range" min="0" max="1" step="0.05" value={settings.music} onChange={(e) => onChange({ music: Number(e.target.value) })} />
        </label>
        <label className="sr-pause__row">
          Sound Effects
          <input type="range" min="0" max="1" step="0.05" value={settings.sfx} onChange={(e) => onChange({ sfx: Number(e.target.value) })} />
        </label>
        <label className="sr-pause__row">
          Mouse Sensitivity
          <input type="range" min="0.4" max="2" step="0.1" value={settings.sensitivity} onChange={(e) => onChange({ sensitivity: Number(e.target.value) })} />
        </label>
        {muted && <p className="sr-settings__note">Game Center mute is active — sound is off regardless of these settings.</p>}
      </div>
    </div>
  );
}
