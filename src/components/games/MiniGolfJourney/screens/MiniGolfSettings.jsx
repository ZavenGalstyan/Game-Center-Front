/**
 * Mini Golf Journey — Settings. Graphics quality, sound, animations, aim guide.
 * Graphics + animations + aim-guide are visual only and NEVER change physics.
 * Persisted to localStorage by the shell.
 */
import { IconChevronLeft, IconGear, IconBolt, IconTarget, IconStar } from "../components/Icons.jsx";

const GRAPHICS = [
  { id: "low", label: "Low", hint: "Minimal effects — best on older devices." },
  { id: "medium", label: "Medium", hint: "A calm subset of the scenery and particles." },
  { id: "high", label: "High", hint: "Every layer: clouds, textures, reflections, particles." },
];

export default function MiniGolfSettings({ settings, onChange, onBack, backLabel = "Menu" }) {
  return (
    <div className="mgj-screen mgj-settings">
      <header className="mgj-screen__head">
        <button type="button" className="mgj-btn mgj-btn--ghost mgj-btn--sm" onClick={onBack}>
          <IconChevronLeft /> {backLabel}
        </button>
        <h2 className="mgj-screen__title">Settings</h2>
        <span className="mgj-screen__count" />
      </header>

      <div className="mgj-screen__body">
        <section className="mgj-setcard">
          <div className="mgj-setcard__head">
            <span className="mgj-setcard__icon">
              <IconGear />
            </span>
            <div>
              <h3>Graphics</h3>
              <p>How much scenery and texture is drawn. Visual only.</p>
            </div>
          </div>
          <div className="mgj-segment" role="group" aria-label="Graphics quality">
            {GRAPHICS.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`mgj-segment__btn ${settings.graphics === g.id ? "is-active" : ""}`}
                aria-pressed={settings.graphics === g.id}
                onClick={() => onChange({ graphics: g.id })}
              >
                {g.label}
              </button>
            ))}
          </div>
          <p className="mgj-setcard__hint">{GRAPHICS.find((g) => g.id === settings.graphics)?.hint}</p>
        </section>

        <Toggle
          icon={<IconStar />}
          title="Sound"
          desc="Short effects for putts, walls, water and the cup."
          on={settings.sound}
          onToggle={() => onChange({ sound: !settings.sound })}
        />
        <Toggle
          icon={<IconBolt />}
          title="Animations"
          desc="Clouds, flag wave, celebrations and screen transitions."
          on={settings.animations}
          onToggle={() => onChange({ animations: !settings.animations })}
        />
        <Toggle
          icon={<IconTarget />}
          title="Aim Guide"
          desc="The dotted aim line. The power ring always stays on."
          on={settings.aimGuide}
          onToggle={() => onChange({ aimGuide: !settings.aimGuide })}
        />
      </div>
    </div>
  );
}

function Toggle({ icon, title, desc, on, onToggle }) {
  return (
    <section className="mgj-setcard">
      <div className="mgj-setcard__head">
        <span className="mgj-setcard__icon">{icon}</span>
        <div>
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={title}
          className={`mgj-toggle ${on ? "is-on" : ""}`}
          onClick={onToggle}
        >
          <span className="mgj-toggle__track">
            <span className="mgj-toggle__knob" />
          </span>
          <span className="mgj-toggle__txt">{on ? "On" : "Off"}</span>
        </button>
      </div>
    </section>
  );
}
