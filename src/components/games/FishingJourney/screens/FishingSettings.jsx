/**
 * Fishing Journey — Settings. Graphics quality, sound, and animations.
 * Persisted to localStorage (`gc_fishing_settings`) by the parent.
 */
import ScreenHeader from "../components/ScreenHeader.jsx";
import { IconSliders, IconSound, IconSparkle, IconWave } from "../components/Icons.jsx";

const GRAPHICS = [
  { id: "low", label: "Low", hint: "Minimal water & background effects — best on older devices." },
  { id: "medium", label: "Medium", hint: "A calm subset of the scenery effects." },
  { id: "high", label: "High", hint: "Every layer: clouds, reflections, drifting fish." },
];

export default function FishingSettings({ progress, settings, onBack, onChange }) {
  return (
    <div className="fj-screen fj-settings">
      <ScreenHeader
        title="Settings"
        subtitle="Tune the look and feel."
        coins={progress.coins}
        onBack={onBack}
        icon={<IconSliders />}
      />

      <div className="fj-screen__body">
        <div className="fj-setlist">
          <section className="fj-setcard">
            <div className="fj-setcard__head">
              <span className="fj-setcard__icon" aria-hidden="true">
                <IconWave />
              </span>
              <div>
                <h3>Graphics</h3>
                <p>How many background &amp; water effects are drawn.</p>
              </div>
            </div>
            <div className="fj-segment" role="group" aria-label="Graphics quality">
              {GRAPHICS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`fj-segment__btn ${
                    settings.graphics === g.id ? "fj-segment__btn--active" : ""
                  }`}
                  aria-pressed={settings.graphics === g.id}
                  onClick={() => onChange({ graphics: g.id })}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <p className="fj-setcard__hint">
              {GRAPHICS.find((g) => g.id === settings.graphics)?.hint}
            </p>
          </section>

          <section className="fj-setcard">
            <div className="fj-setcard__head">
              <span className="fj-setcard__icon" aria-hidden="true">
                <IconSound />
              </span>
              <div>
                <h3>Sound</h3>
                <p>Short effects for casts, bites and catches.</p>
              </div>
              <Toggle
                on={settings.sound}
                label="Sound"
                onToggle={() => onChange({ sound: !settings.sound })}
              />
            </div>
          </section>

          <section className="fj-setcard">
            <div className="fj-setcard__head">
              <span className="fj-setcard__icon" aria-hidden="true">
                <IconSparkle />
              </span>
              <div>
                <h3>Animations</h3>
                <p>Water drift, clouds, bobber motion and transitions.</p>
              </div>
              <Toggle
                on={settings.animations}
                label="Animations"
                onToggle={() => onChange({ animations: !settings.animations })}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, label, onToggle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`fj-toggle ${on ? "fj-toggle--on" : ""}`}
      onClick={onToggle}
    >
      <span className="fj-toggle__track">
        <span className="fj-toggle__knob" />
      </span>
      <span className="fj-toggle__label">{on ? "On" : "Off"}</span>
    </button>
  );
}
