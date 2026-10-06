/**
 * Lost Toy — small shared UI pieces: buttons, Memory Button pips, toggles,
 * sliders, segmented choices. All sound feedback goes through the shared
 * synth (so the Game Center Mute covers UI clicks too).
 */
import { sound } from "../audio/sound.js";

export function Btn({ children, kind = "", onClick, disabled, title, className = "", type = "button" }) {
  return (
    <button
      type={type}
      className={`lt-btn${kind ? kind.split(" ").map((k) => ` lt-btn--${k}`).join("") : ""} ${className}`}
      onClick={(e) => {
        if (disabled) return;
        sound.uiClick();
        onClick && onClick(e);
      }}
      onMouseEnter={() => !disabled && sound.uiHover()}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

/** three little sewing buttons: found = warm gold, missing = an empty stitched ring */
export function ButtonPips({ got = [], size = "sm" }) {
  return (
    <span className={`lt-pips lt-pips--${size}`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`lt-pip${got[i] ? " on" : ""}`}>
          <i />
          <i />
          <i />
          <i />
        </span>
      ))}
    </span>
  );
}

export function Toggle({ label, value, onChange, hint }) {
  return (
    <label className="lt-set lt-set--toggle">
      <span className="lt-set__label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button
        type="button"
        className={`lt-toggle${value ? " on" : ""}`}
        role="switch"
        aria-checked={value}
        onClick={() => {
          sound.uiClick();
          onChange(!value);
        }}
      >
        <i />
      </button>
    </label>
  );
}

export function Slider({ label, value, min = 0, max = 1, step = 0.05, onChange, fmt }) {
  return (
    <label className="lt-set">
      <span className="lt-set__label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="lt-set__val">{fmt ? fmt(value) : `${Math.round(value * 100)}%`}</span>
    </label>
  );
}

export function Segmented({ label, value, options, onChange }) {
  return (
    <div className="lt-set">
      <span className="lt-set__label">{label}</span>
      <div className="lt-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            className={value === v ? "on" : ""}
            onClick={() => {
              sound.uiClick();
              onChange(v);
            }}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
