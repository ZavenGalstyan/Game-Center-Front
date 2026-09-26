/** Bottle Flip — settings. Changes are merged as patches; physics never changes. */
import { Icon } from "../components/icons.jsx";
import { audio } from "../audio/audio.js";

function Toggle({ label, desc, value, onChange }) {
  return (
    <div className="bf-set">
      <div className="bf-set__text">
        <b>{label}</b>
        {desc && <span>{desc}</span>}
      </div>
      <button type="button" role="switch" aria-checked={value} aria-label={label} className={`bf-switch${value ? " is-on" : ""}`} onClick={() => onChange(!value)}>
        <i />
      </button>
    </div>
  );
}

function Segmented({ label, desc, value, options, onChange }) {
  return (
    <div className="bf-set">
      <div className="bf-set__text">
        <b>{label}</b>
        {desc && <span>{desc}</span>}
      </div>
      <div className="bf-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Settings({ settings, muted, onChange, onBack, overlay = false }) {
  const set = (k) => (v) => {
    onChange({ [k]: v });
    audio.ui();
  };
  return (
    <div className={`bf-screen bf-list${overlay ? " bf-screen--overlay" : ""}`}>
      <header className="bf-head">
        <button type="button" className="bf-back" onClick={onBack}>
          <Icon.back /> Back
        </button>
        <h2>Settings</h2>
        <span />
      </header>
      {muted && <p className="bf-note">Game Center mute is on — all Bottle Flip audio is silenced.</p>}
      <div className="bf-settings">
        <Toggle label="Sound" desc="Throws, landings and effects" value={settings.sound} onChange={set("sound")} />
        <Toggle label="Music" desc="Soft background loop" value={settings.music} onChange={set("music")} />
        <Segmented
          label="Graphics"
          desc="Resolution, shadows, reflections, details — flips are identical"
          value={settings.graphics}
          options={[
            ["low", "Low"],
            ["medium", "Medium"],
            ["high", "High"],
          ]}
          onChange={set("graphics")}
        />
        <Toggle label="Particles" desc="Sparkles, dust and splashes" value={settings.particles} onChange={set("particles")} />
        <Toggle label="Camera shake" desc="A small bump when the bottle falls" value={settings.shake} onChange={set("shake")} />
        <Toggle label="Aim guide" desc="Short dotted arc while you drag" value={settings.aimGuide} onChange={set("aimGuide")} />
        <Toggle label="Reduced motion" desc="No shake, calmer menus and animations" value={settings.reducedMotion} onChange={set("reducedMotion")} />
      </div>
    </div>
  );
}
