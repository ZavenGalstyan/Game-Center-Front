/**
 * Liquid Sort — Settings: graphics/sound/music/animations/color-assist, plus
 * bottle style and theme pickers. `muted` (the shared GamePlayer Mute
 * button) is shown as an informational note, never edited here — it always
 * overrides the saved sound/music prefs without touching them.
 */
import GameDefs from "../components/GameDefs.jsx";
import Bottle from "../components/Bottle.jsx";
import { IconLock } from "../components/icons.jsx";
import { BOTTLE_STYLES, THEMES } from "../data/cosmetics.js";

function Toggle({ on, onChange, disabled }) {
  return (
    <button type="button" className={`ls-toggle${on ? " on" : ""}`} onClick={() => onChange(!on)} disabled={disabled} aria-pressed={on}>
      <span className="ls-toggle__knob" />
    </button>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="ls-segmented">
      {options.map((opt) => (
        <button key={opt} type="button" className={value === opt ? "on" : undefined} onClick={() => onChange(opt)}>
          {opt[0].toUpperCase() + opt.slice(1)}
        </button>
      ))}
    </div>
  );
}

export default function LiquidSettings({ settings, cosmetics, levels, muted, onChangeSettings, onChangeCosmetic, onBack }) {
  const set = (key, value) => onChangeSettings({ ...settings, [key]: value });
  const isUnlocked = (requireLevel) => requireLevel === 0 || Boolean(levels[requireLevel]?.completed);

  return (
    <div className="ls-sub">
      <GameDefs />
      <div className="ls-topbar">
        <button type="button" className="ls-btn ls-btn--ghost" onClick={onBack}>← Back</button>
        <div className="ls-topbar__title">Settings</div>
        <span style={{ width: 64 }} />
      </div>

      <div className="ls-sub__body">
        <div className="ls-panel ls-row">
          <div><div className="ls-row__label">Graphics</div><div className="ls-row__desc">Visual quality</div></div>
          <Segmented options={["low", "medium", "high"]} value={settings.graphics} onChange={(v) => set("graphics", v)} />
        </div>

        <div className="ls-sub__grid2">
          <div className="ls-panel ls-row">
            <div>
              <div className="ls-row__label">Sound</div>
              {muted && <div className="ls-row__desc">Muted by the player</div>}
            </div>
            <Toggle on={settings.sound} onChange={(v) => set("sound", v)} />
          </div>

          <div className="ls-panel ls-row">
            <div className="ls-row__label">Music</div>
            <Toggle on={settings.music} onChange={(v) => set("music", v)} />
          </div>

          <div className="ls-panel ls-row">
            <div><div className="ls-row__label">Animations</div><div className="ls-row__desc">Shortens pours, doesn't remove them</div></div>
            <Toggle on={settings.animations} onChange={(v) => set("animations", v)} />
          </div>

          <div className="ls-panel ls-row">
            <div><div className="ls-row__label">Color Assist</div><div className="ls-row__desc">Symbol on every liquid color</div></div>
            <Toggle on={settings.colorAssist} onChange={(v) => set("colorAssist", v)} />
          </div>
        </div>

        <div className="ls-panel">
          <div className="ls-row"><div className="ls-row__label">Bottle Style</div></div>
          <div className="ls-swatchrow">
            {BOTTLE_STYLES.map((s) => {
              const unlocked = isUnlocked(s.unlockLevel);
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`ls-swatch${cosmetics.bottleStyle === s.id ? " on" : ""}`}
                  disabled={!unlocked}
                  onClick={() => unlocked && onChangeCosmetic("bottleStyle", s.id)}
                >
                  <Bottle colors={["ocean", "ocean"]} styleId={s.id} disabled interactive={false} label="" />
                  <span className="ls-swatch__label">{s.name}</span>
                  {!unlocked && <span className="ls-swatch__lock"><IconLock width={11} height={11} /> {s.unlockLevel}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="ls-panel">
          <div className="ls-row"><div className="ls-row__label">Theme</div></div>
          <div className="ls-swatchrow">
            {THEMES.map((t) => {
              const unlocked = isUnlocked(t.unlockLevel);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`ls-swatch${cosmetics.theme === t.id ? " on" : ""}`}
                  disabled={!unlocked}
                  onClick={() => unlocked && onChangeCosmetic("theme", t.id)}
                >
                  <span className="ls-swatch__preview" style={{ background: `linear-gradient(180deg, ${t.bg0}, ${t.bg1})` }} />
                  <span className="ls-swatch__label">{t.name}</span>
                  {!unlocked && <span className="ls-swatch__lock"><IconLock width={11} height={11} /> {t.unlockLevel}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
