import { useState } from "react";
import { IconBack } from "../components/uiIcons.jsx";

function Toggle({ label, checked, onChange, disabled = false, note }) {
  return (
    <label className={`nf-settings__row${disabled ? " nf-settings__row--disabled" : ""}`}>
      <div className="nf-settings__row-text">
        <span>{label}</span>
        {note && <span className="nf-settings__row-note">{note}</span>}
      </div>
      <span className={`nf-toggle${checked ? " nf-toggle--on" : ""}`} role="switch" aria-checked={checked}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="nf-toggle__knob" />
      </span>
    </label>
  );
}

export default function Settings({ settings, muted, onChangeSettings, onResetBest, onBack }) {
  const [confirming, setConfirming] = useState(false);
  const set = (patch) => onChangeSettings({ ...settings, ...patch });

  return (
    <div className="nf-screen nf-settings">
      <div className="nf-screen__head">
        <button type="button" className="nf-icon-btn" onClick={onBack}><IconBack /></button>
        <h2>Settings</h2>
      </div>

      <div className="nf-settings__body">
        <section className="nf-settings__section">
          <h3>Audio & Motion</h3>
          <Toggle label="Sound effects" checked={settings.sound} onChange={(v) => set({ sound: v })} disabled={muted} note={muted ? "Muted from the game controls" : undefined} />
          <Toggle label="Reduced motion" checked={settings.reducedMotion} onChange={(v) => set({ reducedMotion: v })} note="Softens tile sliding and merge pop" />
        </section>

        <section className="nf-settings__section nf-settings__section--danger">
          <h3>Reset</h3>
          {!confirming ? (
            <button type="button" className="nf-btn nf-btn--danger" onClick={() => setConfirming(true)}>
              Reset Best Score
            </button>
          ) : (
            <div className="nf-settings__confirm">
              <p><strong>Reset your best score?</strong><br />This won't affect your current game.</p>
              <div className="nf-settings__confirm-actions">
                <button type="button" className="nf-btn nf-btn--ghost" onClick={() => setConfirming(false)}>Cancel</button>
                <button type="button" className="nf-btn nf-btn--danger" onClick={() => { onResetBest(); setConfirming(false); }}>Reset</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
