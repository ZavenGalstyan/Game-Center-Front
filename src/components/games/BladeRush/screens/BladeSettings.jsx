/**
 * Blade Rush — Settings. Sound/Music are shown but disabled-and-explained
 * whenever the shared GamePlayer Mute is active, exactly like the other
 * games' settings screens: it always wins, so a second toggle here would lie.
 */
export default function BladeSettings({ settings, muted, onChange, onBack }) {
  const set = (patch) => onChange({ ...settings, ...patch });

  return (
    <div className="br-settings">
      <div className="br-select__header">
        <button type="button" className="br-icon-btn" onClick={onBack} aria-label="Back">&#8592;</button>
        <h2 className="br-select__title">SETTINGS</h2>
        <div style={{ width: 32 }} />
      </div>

      <div className="br-settings__list">
        <Row label="GRAPHICS">
          <Segmented options={["low", "medium", "high"]} value={settings.graphics} onChange={(v) => set({ graphics: v })} />
        </Row>
        <Row label="PARTICLES">
          <Segmented options={["low", "high"]} value={settings.particles} onChange={(v) => set({ particles: v })} />
        </Row>
        <Row label="SCREEN SHAKE">
          <Toggle value={settings.screenShake} onChange={(v) => set({ screenShake: v })} />
        </Row>
        <Row label="SOUND" hint={muted ? "Muted by the player controls" : null}>
          <Toggle value={settings.sound} onChange={(v) => set({ sound: v })} disabled={muted} />
        </Row>
        <Row label="MUSIC" hint={muted ? "Muted by the player controls" : null}>
          <Toggle value={settings.music} onChange={(v) => set({ music: v })} disabled={muted} />
        </Row>
      </div>
    </div>
  );
}

function Row({ label, hint, children }) {
  return (
    <div className="br-settings__row">
      <div className="br-settings__row-label">
        {label}
        {hint && <span className="br-settings__hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="br-segmented">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`br-segmented__opt${value === o ? " is-active" : ""}`}
          onClick={() => onChange(o)}
        >
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
      className={`br-toggle${value ? " is-on" : ""}`}
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      aria-pressed={value}
    >
      <span className="br-toggle__thumb" />
    </button>
  );
}
