/**
 * Cozy Cleanup — Collection screen: cosmetic tool skins earned through
 * play (stars, rooms cleaned, laundry folded, items organized). Purely
 * visual — never changes cleaning power. Nothing here costs anything.
 */
import { sfx } from "../engine/sound.js";

const SLOTS = [
  { slot: "vacuum", label: "Vacuum", options: [
    { id: "cream", label: "Cream", color: "#d8ae63" },
    { id: "sage", label: "Sage", color: "#7fa66f", need: "3 total stars" },
    { id: "pink", label: "Pink", color: "#e08a9c", need: "8 total stars" },
    { id: "lavender", label: "Lavender", color: "#a98fd2", need: "15 total stars" },
  ] },
  { slot: "mop", label: "Mop", options: [
    { id: "classic", label: "Classic", color: "#8a6142" },
    { id: "flower", label: "Flower", color: "#e08a9c", need: "2 rooms cleaned" },
    { id: "modern", label: "Modern", color: "#5c6670", need: "5 rooms cleaned" },
  ] },
  { slot: "cloth", label: "Cloth", options: [
    { id: "plain", label: "Plain", color: "#7fb0c2" },
    { id: "dots", label: "Dots", color: "#7a9cc9", need: "4 clothes folded" },
    { id: "floral", label: "Floral", color: "#e08a9c", need: "20 items organized" },
  ] },
];

export default function Collection({ state, soundEnabled, onEquip, onBack }) {
  return (
    <div className="cc-collection">
      <div className="cc-roomselect__head">
        <button type="button" className="cc-hud__exit" onClick={() => { sfx.back(soundEnabled); onBack(); }} aria-label="Back">‹</button>
        <h2>Collection</h2>
      </div>
      <div className="cc-collection__scroll">
        {SLOTS.map(({ slot, label, options }) => (
          <section key={slot} className="cc-cosmetic-row">
            <h3>{label}</h3>
            <div className="cc-cosmetic-row__options">
              {options.map((o) => {
                const unlocked = state.cosmetics.unlocked[slot]?.includes(o.id);
                const equipped = state.cosmetics[slot] === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    className={`cc-cosmetic${equipped ? " cc-cosmetic--equipped" : ""}${unlocked ? "" : " cc-cosmetic--locked"}`}
                    disabled={!unlocked}
                    onClick={() => { sfx.ui(soundEnabled); onEquip(slot, o.id); }}
                    title={unlocked ? o.label : `Unlock: ${o.need}`}
                  >
                    <span className="cc-cosmetic__swatch" style={{ background: o.color }} />
                    <span className="cc-cosmetic__label">{unlocked ? o.label : o.need}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
