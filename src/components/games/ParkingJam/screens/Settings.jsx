/**
 * Parking Jam — settings. Saved immediately on change. The shared GamePlayer
 * Mute overrides Sound/Music without changing them (noted inline).
 */
import { Icon } from "../components/icons.jsx";

function Toggle({ label, desc, value, onChange }) {
  return (
    <div className="pj-setting">
      <span className="pj-setting__text"><b>{label}</b><small>{desc}</small></span>
      <button type="button" role="switch" aria-checked={value} aria-label={label} className={`pj-switch${value ? " is-on" : ""}`} onClick={() => onChange(!value)}>
        <i />
      </button>
    </div>
  );
}

function Choice({ label, desc, value, options, onChange }) {
  return (
    <div className="pj-setting">
      <span className="pj-setting__text"><b>{label}</b><small>{desc}</small></span>
      <span className="pj-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>{l}</button>
        ))}
      </span>
    </div>
  );
}

export default function Settings({ settings, muted, onChange, onBack }) {
  return (
    <div className="pj-settings">
      <header className="pj-head">
        <button type="button" className="pj-btn pj-btn--icon" onClick={onBack} aria-label="Back"><Icon.back /></button>
        <h2 className="pj-head__title">Settings</h2>
        {muted ? <span className="pj-head__meta">Muted by player</span> : <span />}
      </header>
      <div className="pj-settings__board">
        <Toggle label="Sound" desc="Engines, bumps and chimes" value={settings.sound} onChange={(v) => onChange({ sound: v })} />
        <Toggle label="Music" desc="Relaxed music and lot ambience" value={settings.music} onChange={(v) => onChange({ music: v })} />
        <Choice label="Graphics" desc="Shadows, textures and scenery detail" value={settings.graphics}
          options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} onChange={(v) => onChange({ graphics: v })} />
        <Toggle label="Particles" desc="Exhaust puffs and sparkles" value={settings.particles} onChange={(v) => onChange({ particles: v })} />
        <Toggle label="Move assist" desc="After a pause, softly mark cars that can leave, and show blockers" value={settings.moveAssist} onChange={(v) => onChange({ moveAssist: v })} />
        <Toggle label="Reduced motion" desc="Faster, calmer animations" value={settings.reducedMotion} onChange={(v) => onChange({ reducedMotion: v })} />
      </div>
    </div>
  );
}
