/** Laser Maze — settings (full screen from the menu, compact inside Pause). */
import { Icon } from "../components/icons.jsx";
import { sfx } from "../utils/audio.js";

function Toggle({ label, desc, value, onChange }) {
  return (
    <div className="lm-set">
      <div className="lm-set__text"><b>{label}</b>{desc && <span>{desc}</span>}</div>
      <button type="button" role="switch" aria-checked={value} className={`lm-switch-btn${value ? " is-on" : ""}`}
        onClick={() => onChange(!value)}><i /></button>
    </div>
  );
}

function Segmented({ label, desc, value, options, onChange }) {
  return (
    <div className="lm-set">
      <div className="lm-set__text"><b>{label}</b>{desc && <span>{desc}</span>}</div>
      <div className="lm-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""}
            onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export default function Settings({ settings, muted, onChange, onBack, compact = false }) {
  const set = (k) => (v) => {
    onChange({ [k]: v }); // a patch — merged against the latest saved settings
    sfx.ui();
  };
  return (
    <div className={compact ? "lm-settings lm-settings--compact" : "lm-screen lm-settings"}>
      <header className="lm-screen__head">
        <button type="button" className="lm-back" onClick={onBack}><Icon.back /> Back</button>
        <h2>Settings</h2>
        <span />
      </header>
      {muted && <p className="lm-note">Game Center mute is on — all Laser Maze audio is silenced.</p>}
      <div className="lm-settings__list">
        <Toggle label="Sound" desc="Mirror, target and puzzle effects" value={settings.sound} onChange={set("sound")} />
        <Toggle label="Music" desc="Soft ambient pad" value={settings.music} onChange={set("music")} />
        <Segmented label="Graphics" desc="Visual detail only — puzzles are identical" value={settings.graphics}
          options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} onChange={set("graphics")} />
        <Toggle label="Particles" desc="Beam energy and ambient particles" value={settings.particles} onChange={set("particles")} />
        <Segmented label="Beam glow" value={settings.beamGlow}
          options={[["soft", "Soft"], ["normal", "Normal"], ["intense", "Intense"]]} onChange={set("beamGlow")} />
        <Toggle label="Reduced motion" desc="Instant rotations, no drifting effects" value={settings.reducedMotion} onChange={set("reducedMotion")} />
      </div>
    </div>
  );
}
