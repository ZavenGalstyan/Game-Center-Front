export default function Settings({ settings, onChange, onBack }) {
  return (
    <div className="ba3d-screen">
      <div className="ba3d-screen__header">
        <button className="ba3d-btn ba3d-btn--small" onClick={onBack}>&larr; BACK</button>
        <h2>SETTINGS</h2>
        <span />
      </div>

      <div className="ba3d-settings">
        <label className="ba3d-settings__row">
          <span>Sound</span>
          <input type="checkbox" checked={settings.sound} onChange={(e) => onChange({ sound: e.target.checked })} />
        </label>
        <label className="ba3d-settings__row">
          <span>Music</span>
          <input type="checkbox" checked={settings.music} onChange={(e) => onChange({ music: e.target.checked })} />
        </label>
        <label className="ba3d-settings__row">
          <span>Graphics</span>
          <select value={settings.graphics} onChange={(e) => onChange({ graphics: e.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="ba3d-settings__row">
          <span>Camera Turn Speed</span>
          <span className="ba3d-settings__control">
            <input type="range" min="0.15" max="1.8" step="0.05" value={settings.camSensitivity} onChange={(e) => onChange({ camSensitivity: Number(e.target.value) })} />
            <span className="ba3d-settings__value">{settings.camSensitivity.toFixed(2)}</span>
          </span>
        </label>
        <label className="ba3d-settings__row">
          <span>Camera Distance</span>
          <span className="ba3d-settings__control">
            <input type="range" min="0.6" max="1.5" step="0.05" value={settings.camDistance} onChange={(e) => onChange({ camDistance: Number(e.target.value) })} />
            <span className="ba3d-settings__value">{settings.camDistance.toFixed(2)}</span>
          </span>
        </label>
        <label className="ba3d-settings__row">
          <span>Screen Shake</span>
          <input type="checkbox" checked={settings.screenShake} onChange={(e) => onChange({ screenShake: e.target.checked })} />
        </label>
        <label className="ba3d-settings__row">
          <span>Particles</span>
          <input type="checkbox" checked={settings.particles} onChange={(e) => onChange({ particles: e.target.checked })} />
        </label>
        <label className="ba3d-settings__row">
          <span>Reduced Motion</span>
          <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => onChange({ reducedMotion: e.target.checked })} />
        </label>
      </div>
    </div>
  );
}
