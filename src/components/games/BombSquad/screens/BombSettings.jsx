/**
 * Bomb Squad — Settings. Sound/Music are shown but disabled-and-explained
 * whenever the shared GamePlayer Mute is active — it always wins, so a
 * second toggle here would lie, matching the other games' settings screens.
 */
export default function BombSettings({ settings, muted, onChange, onBack }) {
  const set = (patch) => onChange({ ...settings, ...patch });

  return (
    <div className="bs-settings">
      <div className="bs-select__header">
        <button type="button" className="bs-icon-btn" onClick={onBack} aria-label="Back">&#8592;</button>
        <h2 className="bs-select__title">SETTINGS</h2>
        <div style={{ width: 32 }} />
      </div>

      <div className="bs-settings__list">
        <Row label="GRAPHICS">
          <Segmented options={["low", "medium", "high"]} value={settings.graphics} onChange={(v) => set({ graphics: v })} />
        </Row>
        <Row label="SOUND" hint={muted ? "Muted by the player controls" : null}>
          <Toggle value={settings.sound} onChange={(v) => set({ sound: v })} disabled={muted} />
        </Row>
        <Row label="MUSIC" hint={muted ? "Muted by the player controls" : null}>
          <Toggle value={settings.music} onChange={(v) => set({ music: v })} disabled={muted} />
        </Row>
        <Row label="SCREEN EFFECTS">
          <Toggle value={settings.screenEffects} onChange={(v) => set({ screenEffects: v })} />
        </Row>
        <Row label="TIMER WARNING">
          <Toggle value={settings.timerWarning} onChange={(v) => set({ timerWarning: v })} />
        </Row>
        <Row label="REDUCED MOTION">
          <Toggle value={settings.reducedMotion} onChange={(v) => set({ reducedMotion: v })} />
        </Row>
      </div>
    </div>
  );
}

function Row({ label, hint, children }) {
  return (
    <div className="bs-settings__row">
      <div className="bs-settings__row-label">
        {label}
        {hint && <span className="bs-settings__hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="bs-segmented">
      {options.map((o) => (
        <button key={o} type="button" className={`bs-segmented__opt${value === o ? " is-active" : ""}`} onClick={() => onChange(o)}>
          {o.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange, disabled }) {
  return (
    <button
      type="button"
      className={`bs-toggle${value ? " is-on" : ""}`}
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      aria-pressed={value}
    >
      <span className="bs-toggle__thumb" />
    </button>
  );
}
