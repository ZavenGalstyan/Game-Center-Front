/**
 * Mountain Journey — Explorer customization. The 3D menu camera swings in to
 * frame the explorer; this panel picks jacket, backpack and hat (style and
 * colour). Options unlock through progression; locked ones show how.
 */
import { COSMETICS, isUnlocked, reqText } from "../data/cosmetics.js";
import { progressOf } from "../engine/storage.js";

const SLOTS = [
  ["jacket", "Jacket"],
  ["pack", "Backpack"],
  ["hat", "Hat"],
  ["hatColor", "Hat Colour"],
];

export default function ExplorerScreen({ state, onLook, onBack }) {
  const prog = progressOf(state);
  return (
    <div className="mj-explorer">
      <div className="mj-panel mj-panel--side">
        <div className="mj-panel__head">
          <div>
            <div className="mj-card__kicker">Customize</div>
            <h2 className="mj-panel__title">Explorer</h2>
          </div>
          <button type="button" className="mj-btn mj-btn--ghost mj-btn--small" onClick={onBack}>
            ← Back
          </button>
        </div>
        <div className="mj-panel__body">
          {SLOTS.map(([slot, label]) => (
            <div key={slot} className="mj-cos">
              <div className="mj-cos__label">{label}</div>
              <div className="mj-cos__opts">
                {COSMETICS[slot].map((c) => {
                  const open = isUnlocked(c.req, prog);
                  const on = state.look[slot] === c.id;
                  const swatch = slot === "hat" ? null : c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`mj-cos__opt${on ? " is-on" : ""}${open ? "" : " is-locked"}${swatch ? " mj-cos__opt--swatch" : ""}`}
                      style={swatch ? { "--sw": swatch } : undefined}
                      disabled={!open}
                      onClick={() => onLook({ [slot]: c.id })}
                      title={open ? c.name : `${c.name} — ${reqText(c.req)}`}
                      aria-pressed={on}
                    >
                      {swatch ? <span className="mj-cos__sw" /> : <span>{c.name}</span>}
                      {!open && <span className="mj-cos__lock">🔒</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="mj-note">
            Progress: {prog.levels} trails · {prog.badges} badges. New styles unlock as you climb.
          </p>
        </div>
      </div>
    </div>
  );
}
