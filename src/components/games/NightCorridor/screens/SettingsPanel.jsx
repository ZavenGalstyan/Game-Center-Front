/**
 * Night Corridor — settings controls (used by the Settings screen and the
 * pause menu). Volumes are relative to the Game Center Mute, never a
 * replacement for it.
 */
function Slider({ label, value, onChange, min = 0, max = 1, step = 0.05, format }) {
  return (
    <label className="nc-set__row">
      <span className="nc-set__label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="nc-set__val">{format ? format(value) : `${Math.round(value * 100)}%`}</span>
    </label>
  );
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="nc-set__row">
      <span className="nc-set__label">{label}</span>
      <div className="nc-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPanel({ settings, onChange, muted, compact }) {
  const set = (k) => (v) => onChange({ [k]: v });
  return (
    <div className={`nc-set${compact ? " nc-set--compact" : ""}`}>
      {muted && <div className="nc-set__note">Sound is muted by the Game Center Mute button.</div>}
      <div className="nc-set__group">
        <div className="nc-set__heading">Sound</div>
        <Slider label="Master" value={settings.master} onChange={set("master")} />
        <Slider label="Music" value={settings.music} onChange={set("music")} />
        <Slider label="Effects" value={settings.sfx} onChange={set("sfx")} />
      </div>
      <div className="nc-set__group">
        <div className="nc-set__heading">Controls</div>
        <Slider label="Mouse Sensitivity" value={settings.sensitivity} min={0.3} max={2.5} step={0.05} onChange={set("sensitivity")} format={(v) => `${v.toFixed(2)}×`} />
        <Slider label="Camera Bob" value={settings.cameraBob} onChange={set("cameraBob")} />
        <Segmented label="Reduced Motion" value={settings.reducedMotion} options={[[false, "Off"], [true, "On"]]} onChange={set("reducedMotion")} />
      </div>
      <div className="nc-set__group">
        <div className="nc-set__heading">Graphics</div>
        <Segmented label="Quality" value={settings.graphics} options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} onChange={set("graphics")} />
        <Segmented label="Shadows" value={settings.shadows} options={[["off", "Off"], ["medium", "Medium"], ["high", "High"]]} onChange={set("shadows")} />
        <Segmented label="Flashlight" value={settings.flashlight} options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} onChange={set("flashlight")} />
      </div>
    </div>
  );
}
