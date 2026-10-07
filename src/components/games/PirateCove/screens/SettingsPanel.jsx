/** Pirate Cove — settings controls (used by the Settings screen and the pause menu). */

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.05, disabled, fmt }) {
  return (
    <label className={`pc-set${disabled ? " pc-set--off" : ""}`}>
      <span className="pc-set__label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="pc-set__val">{fmt ? fmt(value) : `${Math.round(value * 100)}%`}</span>
    </label>
  );
}

function Choice({ label, value, options, onChange }) {
  return (
    <div className="pc-set">
      <span className="pc-set__label">{label}</span>
      <div className="pc-seg">
        {options.map(([v, l]) => (
          <button key={v} type="button" className={value === v ? "on" : ""} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

const LMH = [
  ["low", "Low"],
  ["medium", "Med"],
  ["high", "High"],
];

export function SettingsPanel({ settings: s, onChange, muted, compact }) {
  return (
    <div className={`pc-settings${compact ? " pc-settings--compact" : ""}`}>
      {muted && <div className="pc-set__note">Sound is muted from the Game Center controls.</div>}
      <div className="pc-settings__col">
        <div className="pc-settings__head">Sound</div>
        <Slider label="Master" value={s.master} onChange={(v) => onChange({ master: v })} disabled={muted} />
        <Slider label="Music" value={s.music} onChange={(v) => onChange({ music: v })} disabled={muted} />
        <Slider label="Effects" value={s.sfx} onChange={(v) => onChange({ sfx: v })} disabled={muted} />
        <div className="pc-settings__head">Camera</div>
        <Slider label="Sensitivity" value={s.sensitivity} min={0.3} max={2} step={0.05} onChange={(v) => onChange({ sensitivity: v })} fmt={(v) => `${v.toFixed(2)}×`} />
        <Slider label="Camera shake" value={s.cameraShake} onChange={(v) => onChange({ cameraShake: v })} />
        <Choice
          label="Reduced motion"
          value={s.reducedMotion ? "on" : "off"}
          options={[
            ["off", "Off"],
            ["on", "On"],
          ]}
          onChange={(v) => onChange({ reducedMotion: v === "on" })}
        />
      </div>
      <div className="pc-settings__col">
        <div className="pc-settings__head">Graphics</div>
        <Choice label="Quality" value={s.graphics} options={LMH} onChange={(v) => onChange({ graphics: v })} />
        <Choice
          label="Shadows"
          value={s.shadows}
          options={[
            ["off", "Off"],
            ["medium", "Med"],
            ["high", "High"],
          ]}
          onChange={(v) => onChange({ shadows: v })}
        />
        <Choice label="Water" value={s.water} options={LMH} onChange={(v) => onChange({ water: v })} />
        <Choice label="Particles" value={s.particles} options={LMH} onChange={(v) => onChange({ particles: v })} />
      </div>
    </div>
  );
}

export default SettingsPanel;
