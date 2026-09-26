/**
 * Cozy Cleanup — Settings. Sound/Music here are separate from the shared
 * GamePlayer Mute button — Mute always wins (it overrides both without
 * changing what's saved), same convention as Bomb Squad.
 */
import { sfx } from "../engine/sound.js";

const TOGGLES = [
  { key: "sound", label: "Sound" },
  { key: "music", label: "Music" },
  { key: "particles", label: "Particles" },
  { key: "cleaningAssist", label: "Cleaning Assist" },
  { key: "toolSmoothing", label: "Tool Smoothing" },
  { key: "reducedMotion", label: "Reduced Motion" },
];

export default function Settings({ settings, muted, onChange, onBack }) {
  const soundEnabled = settings.sound && !muted;
  return (
    <div className="cc-settings">
      <div className="cc-roomselect__head">
        <button type="button" className="cc-hud__exit" onClick={() => { sfx.back(soundEnabled); onBack(); }} aria-label="Back">‹</button>
        <h2>Settings</h2>
      </div>
      <div className="cc-settings__scroll">
        {muted && <p className="cc-settings__note">The GamePlayer Mute button is on and overrides Sound/Music right now.</p>}
        {TOGGLES.map((t) => (
          <label key={t.key} className="cc-settings__toggle">
            <span>{t.label}</span>
            <input
              type="checkbox"
              checked={Boolean(settings[t.key])}
              onChange={(e) => { sfx.ui(soundEnabled); onChange({ [t.key]: e.target.checked }); }}
            />
          </label>
        ))}
        <div className="cc-settings__toggle cc-settings__toggle--select">
          <span>Graphics</span>
          <div className="cc-settings__segmented">
            {["low", "medium", "high"].map((g) => (
              <button
                key={g}
                type="button"
                className={settings.graphics === g ? "cc-settings__seg cc-settings__seg--active" : "cc-settings__seg"}
                onClick={() => { sfx.ui(soundEnabled); onChange({ graphics: g }); }}
              >
                {g[0].toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
