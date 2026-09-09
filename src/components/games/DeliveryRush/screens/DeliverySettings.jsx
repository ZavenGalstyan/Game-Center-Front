/**
 * Delivery Rush — settings.
 *
 * Graphics, traffic density and audio. Graphics changes what the renderer costs
 * (pixel ratio, shadows, prop density, weather particles) and never what the
 * game asks of the player: physics, timers and rewards are identical on Low and
 * High.
 */

import { sfx } from "../utils/sound.js";

function Choice({ label, hint, value, options, onChange, sound }) {
  return (
    <div className="dr-setting">
      <div className="dr-setting__text">
        <p className="dr-setting__label">{label}</p>
        {hint && <p className="dr-setting__hint">{hint}</p>}
      </div>
      <div className="dr-seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`dr-seg__btn${o.value === value ? " is-active" : ""}`}
            aria-pressed={o.value === value}
            onClick={() => {
              sfx.ui(sound);
              onChange(o.value);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, hint, value, onChange, sound }) {
  return (
    <div className="dr-setting">
      <div className="dr-setting__text">
        <p className="dr-setting__label">{label}</p>
        {hint && <p className="dr-setting__hint">{hint}</p>}
      </div>
      <button
        type="button"
        className={`dr-switch${value ? " is-on" : ""}`}
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => {
          sfx.ui(sound || !value);
          onChange(!value);
        }}
      >
        <span />
      </button>
    </div>
  );
}

export default function DeliverySettings({ settings, onChange, onBack, backLabel = "Menu" }) {
  const sound = settings.sound;
  return (
    <div className="dr-screen dr-screen--settings">
      <header className="dr-subhead">
        <button type="button" className="dr-back" onClick={onBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          {backLabel}
        </button>
        <h2 className="dr-subhead__title">Settings</h2>
        <span />
      </header>

      <div className="dr-settings">
        <section className="dr-settings__group">
          <h3 className="dr-settings__title">Graphics</h3>
          <Choice
            label="Quality"
            hint="Shadows, street detail, weather and render resolution. Handling is unaffected."
            value={settings.graphics}
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ]}
            onChange={(v) => onChange({ graphics: v })}
            sound={sound}
          />
          <Toggle
            label="Camera shake"
            hint="Impact kick and road rumble."
            value={settings.cameraShake}
            onChange={(v) => onChange({ cameraShake: v })}
            sound={sound}
          />
          <Toggle
            label="Mini-map"
            hint="Show the district map while driving."
            value={settings.minimap}
            onChange={(v) => onChange({ minimap: v })}
            sound={sound}
          />
        </section>

        <section className="dr-settings__group">
          <h3 className="dr-settings__title">Traffic</h3>
          <Choice
            label="Density"
            hint="How many cars share the streets with you."
            value={settings.trafficDensity}
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ]}
            onChange={(v) => onChange({ trafficDensity: v })}
            sound={sound}
          />
        </section>

        <section className="dr-settings__group">
          <h3 className="dr-settings__title">Audio</h3>
          <Toggle
            label="Sound effects"
            hint="Engine, impacts and delivery cues."
            value={settings.sound}
            onChange={(v) => onChange({ sound: v })}
            sound={sound}
          />
          <Toggle
            label="Ambience"
            hint="Weather bed under the engine."
            value={settings.music}
            onChange={(v) => onChange({ music: v })}
            sound={sound}
          />
        </section>

        <p className="dr-settings__note">
          Progress, coins and vehicles are saved automatically in this browser.
        </p>
      </div>
    </div>
  );
}
