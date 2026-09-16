/**
 * Farm Life — the 9-slot hotbar. Click to select (mouse stays free, no
 * pointer lock) or press 1-9. Shows icon + stack quantity; the selected
 * slot gets a warm highlight ring.
 */
import ItemIcon from "./ItemIcon.jsx";
import { getItem } from "../data/items.js";

export default function Hotbar({ hotbar, selected, onSelect }) {
  return (
    <div className="fl-hotbar" role="toolbar" aria-label="Hotbar">
      {hotbar.map((slot, i) => {
        const def = slot ? getItem(slot.itemId) : null;
        return (
          <button
            key={i}
            type="button"
            className={`fl-hotbar__slot${i === selected ? " fl-hotbar__slot--active" : ""}`}
            onClick={() => onSelect(i)}
            title={def?.name || ""}
          >
            <span className="fl-hotbar__key">{i + 1}</span>
            {def && <ItemIcon itemId={def.id} size={30} />}
            {slot && slot.qty > 1 && <span className="fl-hotbar__qty">{slot.qty}</span>}
          </button>
        );
      })}
    </div>
  );
}
