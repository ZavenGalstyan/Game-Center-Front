function Toggle({ label, hint, on, onChange }) {
  return (
    <div className="st-set">
      <span className="st-set__label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={`st-switch${on ? " is-on" : ""}`} onClick={() => onChange(!on)}>
        <i />
      </button>
    </div>
  );
}

/** Stack Tower — settings. Every option is cosmetic; gameplay timing never changes. */
export default function Settings({ settings: s, onChange, onBack }) {
  return (
    <div className="st-screen">
      <div className="st-panel st-sheet st-sheet--narrow">
        <header className="st-sheet__head">
          <button type="button" className="st-iconbtn" onClick={onBack} aria-label="Back">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2>SETTINGS</h2>
        </header>
        <div className="st-sets">
          <Toggle label="SOUND" on={s.sound} onChange={(v) => onChange({ sound: v })} />
          <Toggle label="MUSIC" on={s.music} onChange={(v) => onChange({ music: v })} />
          <div className="st-set">
            <span className="st-set__label">GRAPHICS</span>
            <div className="st-seg" role="radiogroup" aria-label="Graphics quality">
              {["low", "medium", "high"].map((g) => (
                <button type="button" key={g} role="radio" aria-checked={s.graphics === g} className={s.graphics === g ? "is-on" : ""} onClick={() => onChange({ graphics: g })}>
                  {g.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <Toggle label="PARTICLES" on={s.particles} onChange={(v) => onChange({ particles: v })} />
          <Toggle label="CAMERA MOTION" hint="Settle & pulse" on={s.cameraMotion} onChange={(v) => onChange({ cameraMotion: v })} />
          <Toggle label="REDUCED MOTION" hint="Calmer effects" on={s.reducedMotion} onChange={(v) => onChange({ reducedMotion: v })} />
        </div>
      </div>
    </div>
  );
}
