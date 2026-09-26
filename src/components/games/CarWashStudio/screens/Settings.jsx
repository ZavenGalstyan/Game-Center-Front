/** Car Wash Studio — settings. Changes are merged as patches. */
import { Icon } from "../components/icons.jsx";
import { audio } from "../audio/audio.js";

function Toggle({ label, desc, value, onChange }) {
  return (
    <div className="cws-set">
      <div className="cws-set__text"><b>{label}</b>{desc && <span>{desc}</span>}</div>
      <button type="button" role="switch" aria-checked={value} aria-label={label} className={`cws-switch${value ? " is-on" : ""}`} onClick={() => onChange(!value)}><i /></button>
    </div>
  );
}

function Segmented({ label, desc, value, options, onChange }) {
  return (
    <div className="cws-set">
      <div className="cws-set__text"><b>{label}</b>{desc && <span>{desc}</span>}</div>
      <div className="cws-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export default function Settings({ settings, muted, onChange, onBack }) {
  const set = (k) => (v) => {
    onChange({ [k]: v });
    audio.ui();
  };
  return (
    <div className="cws-screen cws-list">
      <header className="cws-head">
        <button type="button" className="cws-back" onClick={onBack}><Icon.back /> Back</button>
        <h2>Settings</h2>
        <span />
      </header>
      {muted && <p className="cws-note">Game Center mute is on — all Car Wash Studio audio is silenced.</p>}
      <div className="cws-settings">
        <Toggle label="Sound" desc="Water, tools and effects" value={settings.sound} onChange={set("sound")} />
        <Toggle label="Music" desc="Quiet garage ambience" value={settings.music} onChange={set("music")} />
        <Segmented label="Graphics" desc="Resolution, shadows, reflections, particles — cleaning is identical" value={settings.graphics}
          options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} onChange={set("graphics")} />
        <Toggle label="Particles" desc="Water droplets, foam flecks, drips, sparkles" value={settings.particles} onChange={set("particles")} />
        <Toggle label="Cleaning assist" desc="Softly highlights the last spots when a step is nearly done" value={settings.assist} onChange={set("assist")} />
        <Toggle label="Tool smoothing" desc="Tools glide slightly behind the pointer (cleaning stays exact)" value={settings.smoothing} onChange={set("smoothing")} />
        <Toggle label="Reduced motion" desc="Instant camera moves, no sweeps or shake" value={settings.reducedMotion} onChange={set("reducedMotion")} />
      </div>
    </div>
  );
}
