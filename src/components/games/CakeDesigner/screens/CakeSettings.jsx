/**
 * Cake Designer — settings. Persisted by the parent; the GamePlayer Mute
 * button still overrides sound/music live without changing what's saved here.
 */

import { Segmented } from "../components/bits.jsx";

export default function CakeSettings({ settings, onChange, onBack, muted }) {
  const set = (patch) => onChange({ ...settings, ...patch });
  return (
    <div className="cd-settings">
      <div className="cd-settings__top">
        <button className="cd-btn cd-btn--ghost" onClick={onBack}>Back</button>
        <h2>Settings</h2>
        <span />
      </div>

      <div className="cd-settings__list">
        <Row label="Graphics" hint="Particle density, background detail, shadows.">
          <Segmented
            options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]}
            value={settings.graphics} onChange={(v) => set({ graphics: v })} />
        </Row>
        <Toggle label="Sound effects" value={settings.sound} onChange={(v) => set({ sound: v })} />
        <Toggle label="Music" value={settings.music} onChange={(v) => set({ music: v })} />
        <Toggle label="Animations" value={settings.animations} onChange={(v) => set({ animations: v })} />
        {muted && <p className="cd-settings__note">Muted from the game bar — sound &amp; music are silenced until you unmute there.</p>}
      </div>
    </div>
  );
}

function Row({ label, hint, children }) {
  return (
    <div className="cd-setting-row">
      <div><span className="cd-setting-row__label">{label}</span>{hint && <span className="cd-setting-row__hint">{hint}</span>}</div>
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <div className="cd-setting-row">
      <span className="cd-setting-row__label">{label}</span>
      <button className={`cd-switch${value ? " is-on" : ""}`} onClick={() => onChange(!value)}
        role="switch" aria-checked={value}>
        <span />
      </button>
    </div>
  );
}
