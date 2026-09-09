/**
 * Parking Master — settings + a small car customiser (free colours + body).
 * Physics never changes with any of these; only presentation and input feel.
 */

import { CAR_COLORS, CAR_BODIES } from "../utils/storage.js";

const SEG = {
  graphics: [["low", "Low"], ["medium", "Medium"], ["high", "High"]],
  camera: [["default", "Default"], ["high", "High"]],
  steeringSensitivity: [["low", "Low"], ["medium", "Medium"], ["high", "High"]],
};

export default function ParkingSettings({
  settings,
  selectedColor,
  selectedBody,
  onChange,
  onColor,
  onBody,
  onBack,
  backLabel = "Back",
}) {
  return (
    <div className="pm-screen pm-settings">
      <header className="pm-select__head">
        <button type="button" className="pm-btn pm-btn--ghost" onClick={onBack}>{backLabel}</button>
        <h2>Settings</h2>
        <span />
      </header>

      <div className="pm-settings__body">
        <Segment label="Graphics" value={settings.graphics} options={SEG.graphics}
          onChange={(v) => onChange({ graphics: v })} />
        <Toggle label="Sound Effects" value={settings.sound} onChange={(v) => onChange({ sound: v })} />
        <Toggle label="Music" value={settings.music} onChange={(v) => onChange({ music: v })} />
        <Segment label="Camera Height" value={settings.camera} options={SEG.camera}
          onChange={(v) => onChange({ camera: v })} />
        <Segment label="Steering Sensitivity" value={settings.steeringSensitivity} options={SEG.steeringSensitivity}
          onChange={(v) => onChange({ steeringSensitivity: v })} />

        <div className="pm-set-row pm-set-row--col">
          <span className="pm-set-row__label">Car Colour</span>
          <div className="pm-swatches">
            {CAR_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`pm-swatch${selectedColor === c.id ? " is-on" : ""}`}
                style={{ background: c.hex }}
                title={c.name}
                aria-label={c.name}
                onClick={() => onColor(c.id)}
              />
            ))}
          </div>
        </div>

        <div className="pm-set-row pm-set-row--col">
          <span className="pm-set-row__label">Vehicle</span>
          <div className="pm-seg">
            {CAR_BODIES.map((b) => (
              <button
                key={b.id}
                type="button"
                className={selectedBody === b.id ? "is-on" : ""}
                onClick={() => onBody(b.id)}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Segment({ label, value, options, onChange }) {
  return (
    <div className="pm-set-row">
      <span className="pm-set-row__label">{label}</span>
      <div className="pm-seg">
        {options.map(([v, txt]) => (
          <button key={v} type="button" className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>
            {txt}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <div className="pm-set-row">
      <span className="pm-set-row__label">{label}</span>
      <button
        type="button"
        className={`pm-toggle${value ? " is-on" : ""}`}
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
      >
        <span />
      </button>
    </div>
  );
}
