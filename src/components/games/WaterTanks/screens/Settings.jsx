/**
 * Water Tanks — settings. Saved in this game's own progress record. The
 * Game Center Mute button is separate and is never written here: while it
 * is on, everything stays silent whatever these switches say.
 */
import ScreenHead from "../components/ScreenHead.jsx";

const ROWS = [
  { key: "sound", label: "Sound", opts: [[true, "On"], [false, "Off"]] },
  { key: "music", label: "Music", opts: [[true, "On"], [false, "Off"]] },
  { key: "pourSpeed", label: "Pour animation", opts: [["normal", "Normal"], ["fast", "Fast"]] },
  { key: "graphics", label: "Graphics", opts: [["low", "Low"], ["medium", "Medium"], ["high", "High"]] },
  { key: "waterEffects", label: "Water effects", opts: [[true, "On"], [false, "Off"]] },
  { key: "particles", label: "Particles", opts: [[true, "On"], [false, "Off"]] },
  { key: "reducedMotion", label: "Reduced motion", opts: [[true, "On"], [false, "Off"]] },
  { key: "measureLabels", label: "Measurement labels", opts: [[true, "On"], [false, "Off"]] },
  { key: "controlHelp", label: "Control help", opts: [[true, "On"], [false, "Off"]] },
];

export default function Settings({ settings, muted, onChange, onBack }) {
  return (
    <div className="wt-page">
      <ScreenHead kicker="Water Tanks" title="Settings" onBack={onBack} />
      {muted && <p className="wt-page__note is-warn">Game Center mute is on — all Water Tanks audio is silent.</p>}
      <div className="wt-settings">
        {ROWS.map((r) => (
          <div key={r.key} className="wt-setting" role="group" aria-label={r.label}>
            <span>{r.label}</span>
            <div className="wt-seg">
              {r.opts.map(([v, l]) => (
                <button key={String(v)} type="button" className={settings[r.key] === v ? "is-on" : ""} aria-pressed={settings[r.key] === v} onClick={() => onChange({ [r.key]: v })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="wt-page__note">Keyboard: 1–6 select tanks · Esc cancels · U undo · H hint.</p>
    </div>
  );
}
