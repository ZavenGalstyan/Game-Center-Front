/** Jump Ball — settings. Graphics quality never changes physics. */
import { Icon } from "./icons.jsx";

function Switch({ label, hint, on, onChange }) {
  return (
    <li className="jb-set">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button type="button" role="switch" aria-checked={on} className={`jb-switch${on ? " is-on" : ""}`} onClick={() => onChange(!on)}>
        <i />
      </button>
    </li>
  );
}

export default function Settings({ settings, onChange, onBack }) {
  return (
    <div className="jb-screen">
      <div className="jb-panel jb-sheet jb-sheet--narrow">
        <header className="jb-sheet__head">
          <button type="button" className="jb-iconbtn" aria-label="Back" onClick={onBack}>
            <Icon name="back" />
          </button>
          <h2>SETTINGS</h2>
        </header>
        <ul className="jb-settings">
          <Switch label="SOUND" on={settings.sound} onChange={(v) => onChange({ sound: v })} />
          <Switch label="MUSIC" on={settings.music} onChange={(v) => onChange({ music: v })} />
          <li className="jb-set">
            <span>
              GRAPHICS<small>Visual detail only — physics is identical</small>
            </span>
            <div className="jb-seg" role="radiogroup" aria-label="Graphics quality">
              {["low", "medium", "high"].map((g) => (
                <button key={g} type="button" role="radio" aria-checked={settings.graphics === g} className={settings.graphics === g ? "is-on" : ""} onClick={() => onChange({ graphics: g })}>
                  {g.toUpperCase()}
                </button>
              ))}
            </div>
          </li>
          <Switch label="PARTICLES" on={settings.particles} onChange={(v) => onChange({ particles: v })} />
          <Switch label="CAMERA MOTION" hint="Smooth follow + impact shake" on={settings.cameraMotion} onChange={(v) => onChange({ cameraMotion: v })} />
          <Switch label="CONTROL HELP" hint="Show controls at the start of each level" on={settings.controlHelp} onChange={(v) => onChange({ controlHelp: v })} />
          <Switch label="REDUCED MOTION" hint="Calmer squash, shake and background" on={settings.reducedMotion} onChange={(v) => onChange({ reducedMotion: v })} />
        </ul>
      </div>
    </div>
  );
}
