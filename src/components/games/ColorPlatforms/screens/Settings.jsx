/** Color Platforms — settings. Graphics options never change collision or physics. */
import { Icon } from "./icons.jsx";
import { ui } from "./ui.js";

function Switch({ label, hint, on, onChange }) {
  return (
    <li className="cp-set">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={`cp-switch${on ? " is-on" : ""}`} onClick={() => onChange(!on)}>
        <i />
      </button>
    </li>
  );
}

function Seg({ label, hint, value, options, onChange }) {
  return (
    <li className="cp-set">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <div className="cp-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </li>
  );
}

export default function Settings({ settings, onChange, onBack }) {
  return (
    <div className="cp-screen">
      <div className="cp-panel cp-sheet cp-sheet--narrow">
        <header className="cp-sheet__head">
          <button type="button" className="cp-iconbtn" aria-label="Back" onClick={onBack} {...ui}>
            <Icon name="back" />
          </button>
          <h2>SETTINGS</h2>
        </header>
        <ul className="cp-settings">
          <li className="cp-set">
            <span>MASTER SOUND</span>
            <div className="cp-range">
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={Math.round(settings.master * 100)}
                aria-label="Master sound"
                onChange={(e) => onChange({ master: Number(e.target.value) / 100 }, true)}
              />
              <output>{Math.round(settings.master * 100)}</output>
            </div>
          </li>
          <Switch label="MUSIC" on={settings.music} onChange={(v) => onChange({ music: v })} />
          <Switch label="SFX" on={settings.sfx} onChange={(v) => onChange({ sfx: v })} />
          <Seg
            label="GRAPHICS"
            hint="Visual detail only"
            value={settings.graphics}
            options={[
              ["low", "LOW"],
              ["medium", "MEDIUM"],
              ["high", "HIGH"],
            ]}
            onChange={(v) => onChange({ graphics: v })}
          />
          <Seg
            label="PARTICLES"
            value={settings.particles}
            options={[
              ["low", "LOW"],
              ["normal", "NORMAL"],
            ]}
            onChange={(v) => onChange({ particles: v })}
          />
          <Seg
            label="SCREEN SHAKE"
            value={settings.shake}
            options={[
              ["off", "OFF"],
              ["low", "LOW"],
            ]}
            onChange={(v) => onChange({ shake: v })}
          />
          <Switch label="COLOR ASSIST" hint="Symbols on platforms: ○ blue · △ red · ◇ yellow" on={settings.assist} onChange={(v) => onChange({ assist: v })} />
          <Switch label="CONTROL HELP" hint="Key labels and control hints" on={settings.controlHelp} onChange={(v) => onChange({ controlHelp: v })} />
          <Switch label="REDUCED MOTION" hint="Calmer squash, sway and background" on={settings.reducedMotion} onChange={(v) => onChange({ reducedMotion: v })} />
        </ul>
      </div>
    </div>
  );
}
