/**
 * Dungeon Knight — Settings and Controls panels (used from the main menu and
 * from the pause menu).
 */
import { Icon } from "./icons.jsx";

function Seg({ label, value, options, onChange, hint }) {
  return (
    <div className="dk-set">
      <span className="dk-set__label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <div className="dk-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, t]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
function Slider({ label, value, min = 0, max = 1, step = 0.05, onChange, fmt }) {
  return (
    <label className="dk-set">
      <span className="dk-set__label">{label}</span>
      <span className="dk-slider">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <output>{fmt ? fmt(value) : `${Math.round(value * 100)}%`}</output>
      </span>
    </label>
  );
}
function Toggle({ label, value, onChange }) {
  return (
    <div className="dk-set">
      <span className="dk-set__label">{label}</span>
      <button type="button" role="switch" aria-checked={value} className={`dk-toggle${value ? " is-on" : ""}`} onClick={() => onChange(!value)}>
        <i />
      </button>
    </div>
  );
}

export function SettingsPanel({ settings: s, muted, onChange, onBack, inGame }) {
  const set = (k) => (v) => onChange({ [k]: v });
  return (
    <div className="dk-panel dk-panel--settings" role="dialog" aria-label="Settings">
      <div className="dk-panel__head">
        <button type="button" className="dk-iconbtn" onClick={onBack} aria-label="Back">
          <Icon.back size={18} />
        </button>
        <h2>Settings</h2>
      </div>
      <div className="dk-panel__body dk-panel__cols">
        <section>
          <h3>Sound</h3>
          {muted && <p className="dk-note">The Game Center mute is on — every Dungeon Knight sound is silent until you unmute.</p>}
          <Slider label="Master" value={s.master} onChange={set("master")} />
          <Slider label="Music" value={s.music} onChange={set("music")} />
          <Slider label="Effects" value={s.sfx} onChange={set("sfx")} />
          <h3>Camera</h3>
          <Slider label="Mouse sensitivity" value={s.mouseSensitivity} min={0.3} max={2.5} step={0.05} onChange={set("mouseSensitivity")} fmt={(v) => `${v.toFixed(2)}×`} />
          <Seg label="Distance" value={s.cameraDistance} options={[["near", "Near"], ["normal", "Normal"], ["far", "Far"]]} onChange={set("cameraDistance")} />
          <Seg label="Camera shake" value={s.cameraShake} options={[["off", "Off"], ["low", "Low"], ["normal", "Normal"]]} onChange={set("cameraShake")} />
          <Toggle label="Invert vertical look" value={s.invertY} onChange={set("invertY")} />
        </section>
        <section>
          <h3>Graphics</h3>
          <Seg label="Quality" value={s.graphics} options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} onChange={set("graphics")} hint={inGame ? "applies on the next dungeon" : null} />
          <Seg label="Shadows" value={s.shadows} options={[["off", "Off"], ["low", "Low"], ["high", "High"]]} onChange={set("shadows")} hint={inGame ? "applies on the next dungeon" : null} />
          <Seg label="Particles" value={s.particles} options={[["low", "Low"], ["normal", "Normal"]]} onChange={set("particles")} hint={inGame ? "applies on the next dungeon" : null} />
          <h3>Interface</h3>
          <Toggle label="Reduced motion" value={s.reducedMotion} onChange={set("reducedMotion")} />
          <Toggle label="Control help" value={s.controlHelp} onChange={set("controlHelp")} />
          <Toggle label="Damage numbers" value={s.damageNumbers} onChange={set("damageNumbers")} />
        </section>
      </div>
    </div>
  );
}

const ROWS = [
  ["W A S D", "Move"],
  ["Mouse", "Turn the camera (← → ↑ ↓ also work)"],
  ["Left click", "Light attack — click again for the combo"],
  ["R", "Heavy attack — slow, strong, breaks shields"],
  ["Right click (hold)", "Raise your shield (front only)"],
  ["Space", "Dodge roll (with a direction) / step back"],
  ["Shift", "Sprint"],
  ["E", "Open chests · drink at shrines · use doors"],
  ["Q", "Drink a potion"],
  ["Esc / P", "Pause"],
];
const TOUCH_ROWS = [
  ["Left stick", "Move — push to the edge to sprint"],
  ["Drag (right side)", "Turn the camera"],
  ["Sword", "Light attack (tap again for the combo)"],
  ["Hammer", "Heavy attack"],
  ["Shield (hold)", "Block"],
  ["Arrow", "Dodge roll"],
  ["Hand · Flask", "Use · potion"],
];

export function ControlsHelp({ touch, onBack }) {
  const rows = touch ? TOUCH_ROWS : ROWS;
  return (
    <div className="dk-panel dk-panel--controls" role="dialog" aria-label="Controls">
      <div className="dk-panel__head">
        <button type="button" className="dk-iconbtn" onClick={onBack} aria-label="Back">
          <Icon.back size={18} />
        </button>
        <h2>Controls</h2>
      </div>
      <div className="dk-panel__body">
        <dl className="dk-keys">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt><kbd>{k}</kbd></dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="dk-note">
          Enemies flash and wind up before they strike — the red shape on the floor shows where. Block with your shield
          facing them, roll through the attack, then punish the recovery. Stamina limits swings, rolls and blocks; it refills
          when you ease off.
        </p>
      </div>
    </div>
  );
}
