/**
 * Blade Rush — the Blades screen: a large preview of the selected skin on
 * top, a 5x2 (responsive) grid of all 10 below. Cosmetic only — no shop, no
 * pricing, unlocking is progression only (see data/blades.js).
 */
import BladePreview from "../game/BladePreview.jsx";
import BladeSwatch from "../game/BladeSwatch.jsx";
import { LockIcon, CheckIcon } from "../game/icons.jsx";
import { BLADES, bladeById, isBladeUnlocked, unlockRequirementText } from "../data/blades.js";

export default function BladeCollection({ state, onSelect, onBack }) {
  const selected = bladeById(state.selectedBlade);

  return (
    <div className="br-blades">
      <div className="br-select__header">
        <button type="button" className="br-icon-btn" onClick={onBack} aria-label="Back to Menu">&#8592;</button>
        <h2 className="br-select__title">BLADES</h2>
        <div style={{ width: 32 }} />
      </div>

      <div className="br-blades__preview">
        <BladePreview skin={selected} />
        <p className="br-blades__preview-name">{selected.name}</p>
        <p className="br-blades__preview-state">SELECTED</p>
      </div>

      <div className="br-blades__grid">
        {BLADES.map((b) => {
          const unlocked = isBladeUnlocked(b, state);
          const active = b.id === state.selectedBlade;
          const stateLabel = active ? "SELECTED" : "AVAILABLE";
          return (
            <button
              key={b.id}
              type="button"
              className={`br-blade-card${active ? " is-active" : ""}${!unlocked ? " is-locked" : ""}`}
              onClick={() => unlocked && onSelect(b.id)}
              disabled={!unlocked}
              aria-pressed={active}
            >
              {active && <span className="br-blade-card__check"><CheckIcon /></span>}
              <span className="br-blade-card__art">
                <BladeSwatch skin={b} locked={!unlocked} />
                {!unlocked && <span className="br-blade-card__lock"><LockIcon /></span>}
              </span>
              <span className="br-blade-card__name">{b.name}</span>
              <span className="br-blade-card__req">{unlocked ? stateLabel : unlockRequirementText(b)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
