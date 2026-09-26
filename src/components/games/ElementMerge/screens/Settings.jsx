import { useState } from "react";
import { IconBack } from "../components/uiIcons.jsx";

function Toggle({ label, checked, onChange, disabled = false, note }) {
  return (
    <label className={`em-settings__row${disabled ? " em-settings__row--disabled" : ""}`}>
      <div className="em-settings__row-text">
        <span>{label}</span>
        {note && <span className="em-settings__row-note">{note}</span>}
      </div>
      <span className={`em-toggle${checked ? " em-toggle--on" : ""}`} role="switch" aria-checked={checked}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="em-toggle__knob" />
      </span>
    </label>
  );
}

export default function Settings({ settings, muted, onChangeSettings, onResetProgress, onBack }) {
  const [confirming, setConfirming] = useState(false);
  const set = (patch) => onChangeSettings({ ...settings, ...patch });

  return (
    <div className="em-screen em-settings">
      <div className="em-screen__head">
        <button type="button" className="em-icon-btn" onClick={onBack}><IconBack /></button>
        <h2>Settings</h2>
      </div>

      <div className="em-settings__body">
        <section className="em-settings__section">
          <h3>Audio</h3>
          <Toggle label="Sound effects" checked={settings.sound} onChange={(v) => set({ sound: v })} disabled={muted} note={muted ? "Muted from the game controls" : undefined} />
          <Toggle label="Music" checked={settings.music} onChange={(v) => set({ music: v })} disabled={muted} note={muted ? "Muted from the game controls" : undefined} />
        </section>

        <section className="em-settings__section">
          <h3>Visuals</h3>
          <Toggle label="Particles" checked={settings.particles} onChange={(v) => set({ particles: v })} />
          <div className="em-settings__row">
            <div className="em-settings__row-text"><span>Graphics quality</span></div>
            <div className="em-settings__segmented">
              {["low", "medium", "high"].map((g) => (
                <button key={g} type="button" className={`em-segmented__opt${settings.graphics === g ? " em-segmented__opt--active" : ""}`} onClick={() => set({ graphics: g })}>
                  {g[0].toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <Toggle label="Reduced motion" checked={settings.reducedMotion} onChange={(v) => set({ reducedMotion: v })} note="Softens token movement and particle bursts" />
          <Toggle label="Discovery animation" checked={settings.discoveryAnimation} onChange={(v) => set({ discoveryAnimation: v })} />
        </section>

        <section className="em-settings__section">
          <h3>Gameplay</h3>
          <Toggle label="Auto-save workspace" checked={settings.autoSaveWorkspace} onChange={(v) => set({ autoSaveWorkspace: v })} />
        </section>

        <section className="em-settings__section em-settings__section--danger">
          <h3>Reset</h3>
          {!confirming ? (
            <button type="button" className="em-btn em-btn--danger" onClick={() => setConfirming(true)}>
              Reset All Progress
            </button>
          ) : (
            <div className="em-settings__confirm">
              <p><strong>Reset all Element Merge progress?</strong><br />This will erase all discoveries and workspace progress.</p>
              <div className="em-settings__confirm-actions">
                <button type="button" className="em-btn em-btn--ghost" onClick={() => setConfirming(false)}>Cancel</button>
                <button type="button" className="em-btn em-btn--danger" onClick={() => { onResetProgress(); setConfirming(false); }}>Reset</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
