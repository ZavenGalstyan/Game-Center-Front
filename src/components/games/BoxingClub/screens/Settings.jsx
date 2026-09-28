/**
 * Boxing Club — settings (saved on change). The shared GamePlayer Mute
 * overrides Sound/Music without changing them.
 */
import { Icon } from "../components/icons.jsx";

function Toggle({ label, desc, value, onChange }) {
  return (
    <div className="bc-setting">
      <span className="bc-setting__text"><b>{label}</b><small>{desc}</small></span>
      <button type="button" role="switch" aria-checked={value} aria-label={label} className={`bc-switch${value ? " is-on" : ""}`} onClick={() => onChange(!value)}><i /></button>
    </div>
  );
}

export default function Settings({ settings, muted, onChange, onBack }) {
  return (
    <div className="bc-settings">
      <header className="bc-head">
        <button type="button" className="bc-btn bc-btn--icon" onClick={onBack} aria-label="Back"><Icon.back /></button>
        <h2 className="bc-head__title">Settings</h2>
        {muted ? <span className="bc-head__meta">Muted by player</span> : <span />}
      </header>
      <div className="bc-settings__board">
        <Toggle label="Sound" desc="Punches, bell and crowd" value={settings.sound} onChange={(v) => onChange({ sound: v })} />
        <Toggle label="Music" desc="Gym and fight-night beats" value={settings.music} onChange={(v) => onChange({ music: v })} />
        <div className="bc-setting">
          <span className="bc-setting__text"><b>Graphics</b><small>Crowd, lighting, shadows and particles</small></span>
          <span className="bc-seg" role="radiogroup" aria-label="Graphics">
            {[["low", "Low"], ["medium", "Medium"], ["high", "High"]].map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={settings.graphics === v} className={settings.graphics === v ? "is-on" : ""} onClick={() => onChange({ graphics: v })}>{l}</button>
            ))}
          </span>
        </div>
        <Toggle label="Particles" desc="Sweat and impact sparks" value={settings.particles} onChange={(v) => onChange({ particles: v })} />
        <Toggle label="Camera shake" desc="Small impulses on heavy hits" value={settings.cameraShake} onChange={(v) => onChange({ cameraShake: v })} />
        <Toggle label="Control help" desc="Show the controls strip before fights" value={settings.controlHelp} onChange={(v) => onChange({ controlHelp: v })} />
        <Toggle label="Reduced motion" desc="Less shake, zoom and light movement" value={settings.reducedMotion} onChange={(v) => onChange({ reducedMotion: v })} />
      </div>
    </div>
  );
}
