/**
 * Crowd Rush — settings: graphics / sound / music / vibration / control
 * sensitivity, the cosmetic crowd colour, and the optional coin trail shop.
 * Graphics only changes render quality — the simulation is identical.
 */

import { CROWD_COLORS, TRAILS, sanitizeSettings } from "../utils/storage.js";
import { sfx } from "../utils/sound.js";

function Seg({ label, value, options, onChange }) {
  return (
    <div className="cr-set__row">
      <span className="cr-set__label">{label}</span>
      <div className="cr-seg">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={value === o.value ? "is-on" : ""}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CrowdSettings({ state, setState, muted, onBack }) {
  const s = state.settings;
  const set = (patch) =>
    setState((st) => ({ ...st, settings: sanitizeSettings({ ...st.settings, ...patch }) }));
  const toggle = (k) => {
    sfx.ui(!s[k] && !muted);
    set({ [k]: !s[k] });
  };

  const buyTrail = (t) => {
    setState((st) => {
      if (st.ownedTrails.includes(t.id) || st.coins < t.cost) return st;
      sfx.coin(st.settings.sound && !muted);
      return { ...st, coins: st.coins - t.cost, ownedTrails: [...st.ownedTrails, t.id], selectedTrail: t.id };
    });
  };

  return (
    <div className="cr-screen cr-set">
      <header className="cr-levels__head">
        <button type="button" className="cr-btn cr-btn--ghost" onClick={onBack}>‹ Back</button>
        <h2>Settings</h2>
        <span className="cr-set__coins">◈ {state.coins}</span>
      </header>

      <div className="cr-set__body">
        <Seg
          label="Graphics"
          value={s.graphics}
          onChange={(v) => set({ graphics: v })}
          options={[
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
          ]}
        />
        <Seg
          label="Control Sensitivity"
          value={s.sensitivity}
          onChange={(v) => set({ sensitivity: v })}
          options={[
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
          ]}
        />
        <div className="cr-set__row">
          <span className="cr-set__label">Sound Effects</span>
          <button type="button" className={`cr-toggle ${s.sound ? "is-on" : ""}`} onClick={() => toggle("sound")}>
            {s.sound ? "On" : "Off"}
          </button>
        </div>
        <div className="cr-set__row">
          <span className="cr-set__label">Music</span>
          <button type="button" className={`cr-toggle ${s.music ? "is-on" : ""}`} onClick={() => toggle("music")}>
            {s.music ? "On" : "Off"}
          </button>
        </div>
        <div className="cr-set__row">
          <span className="cr-set__label">Vibration</span>
          <button type="button" className={`cr-toggle ${s.vibration ? "is-on" : ""}`} onClick={() => toggle("vibration")}>
            {s.vibration ? "On" : "Off"}
          </button>
        </div>
        {muted && <p className="cr-set__note">The GamePlayer Mute button is currently overriding audio.</p>}

        <h3 className="cr-set__h3">Crowd Colour</h3>
        <div className="cr-set__swatches">
          {CROWD_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`cr-swatch cr-swatch--lg ${state.selectedColor === c.id ? "is-active" : ""}`}
              style={{ background: c.hex }}
              title={c.name}
              onClick={() => {
                sfx.ui(s.sound && !muted);
                setState((st) => ({ ...st, selectedColor: c.id }));
              }}
            />
          ))}
        </div>

        <h3 className="cr-set__h3">Trails <span className="cr-set__h3-note">cosmetic</span></h3>
        <div className="cr-set__trails">
          {TRAILS.map((t) => {
            const owned = state.ownedTrails.includes(t.id);
            const active = state.selectedTrail === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className={`cr-trail ${active ? "is-active" : ""} ${owned ? "" : "is-locked"}`}
                onClick={() =>
                  owned
                    ? setState((st) => ({ ...st, selectedTrail: t.id }))
                    : buyTrail(t)
                }
              >
                <span>{t.name}</span>
                <span className="cr-trail__tag">{owned ? (active ? "Equipped" : "Equip") : `◈ ${t.cost}`}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
