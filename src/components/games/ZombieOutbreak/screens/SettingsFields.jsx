/** Zombie Outbreak — settings controls (shared by the Settings screen and the pause menu). */

function Slider({ label, value, min, max, step, onChange, fmt }) {
  return (
    <label className="zo-field">
      <span className="zo-field__label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="zo-field__val">{fmt ? fmt(value) : value}</span>
    </label>
  );
}

function Choice({ label, value, options, onChange }) {
  return (
    <div className="zo-field">
      <span className="zo-field__label">{label}</span>
      <div className="zo-seg">
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" className={`zo-seg__btn${value === v ? " zo-seg__btn--on" : ""}`} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

const pct = (v) => `${Math.round(v * 100)}%`;

export function SettingsFields({ settings: s, onChange, muted, compact = false }) {
  const set = (k) => (v) => onChange({ [k]: v });
  return (
    <div className={`zo-settings${compact ? " zo-settings--compact" : ""}`}>
      <div className="zo-settings__group">
        <div className="zo-settings__head">AUDIO {muted && <em>(muted by Game Center)</em>}</div>
        <Slider label="Master volume" value={s.master} min={0} max={1} step={0.05} onChange={set("master")} fmt={pct} />
        <Slider label="Music volume" value={s.music} min={0} max={1} step={0.05} onChange={set("music")} fmt={pct} />
        <Slider label="SFX volume" value={s.sfx} min={0} max={1} step={0.05} onChange={set("sfx")} fmt={pct} />
      </div>
      <div className="zo-settings__group">
        <div className="zo-settings__head">CONTROLS</div>
        <Slider label="Mouse sensitivity" value={s.sensitivity} min={0.2} max={3} step={0.05} onChange={set("sensitivity")} fmt={(v) => v.toFixed(2)} />
        <Slider label="Field of view" value={s.fov} min={60} max={95} step={1} onChange={set("fov")} fmt={(v) => `${v}°`} />
        <Choice label="Invert Y" value={s.invertY} options={[[false, "Off"], [true, "On"]]} onChange={set("invertY")} />
      </div>
      {!compact && (
        <div className="zo-settings__group">
          <div className="zo-settings__head">GRAPHICS</div>
          <Choice label="Graphics quality" value={s.graphics} options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} onChange={set("graphics")} />
          <Choice label="Shadow quality" value={s.shadows} options={[["off", "Off"], ["medium", "Medium"], ["high", "High"]]} onChange={set("shadows")} />
        </div>
      )}
      <div className="zo-settings__group">
        <div className="zo-settings__head">COMFORT</div>
        <Slider label="Camera bob" value={s.cameraBob} min={0} max={1} step={0.05} onChange={set("cameraBob")} fmt={pct} />
        <Slider label="Camera shake" value={s.cameraShake} min={0} max={1} step={0.05} onChange={set("cameraShake")} fmt={pct} />
        <Choice label="Reduced motion" value={s.reducedMotion} options={[[false, "Off"], [true, "On"]]} onChange={set("reducedMotion")} />
      </div>
    </div>
  );
}
