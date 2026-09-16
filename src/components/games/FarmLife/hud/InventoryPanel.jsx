/**
 * Farm Life — full inventory (9 hotbar + 27 backpack). Drag-and-drop between
 * any two slots via HTML5 DnD (simple, no pointer-lock conflicts since the
 * cursor is always free in this game). Toggle with I or the panel's close
 * button.
 */
import { useState } from "react";
import ItemIcon from "./ItemIcon.jsx";
import { getItem } from "../data/items.js";

function Slot({ area, index, slot, onDrop, onHover }) {
  const [over, setOver] = useState(false);
  const def = slot ? getItem(slot.itemId) : null;
  return (
    <div
      className={`fl-slot${over ? " fl-slot--over" : ""}`}
      draggable={Boolean(slot)}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ area, index }))}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        try {
          const from = JSON.parse(e.dataTransfer.getData("text/plain"));
          onDrop(from, { area, index });
        } catch { /* ignore malformed drag payload */ }
      }}
      onMouseEnter={() => onHover?.(def)}
      onMouseLeave={() => onHover?.(null)}
    >
      {def && <ItemIcon itemId={def.id} size={34} />}
      {slot && slot.qty > 1 && <span className="fl-slot__qty">{slot.qty}</span>}
    </div>
  );
}

export default function InventoryPanel({ inventory, onMove, onClose }) {
  const [hover, setHover] = useState(null);

  return (
    <div className="fl-panel-backdrop" onClick={onClose}>
      <div className="fl-panel fl-inventory" onClick={(e) => e.stopPropagation()}>
        <div className="fl-panel__header">
          <h3>Inventory</h3>
          <button type="button" className="fl-panel__close" onClick={onClose} aria-label="Close inventory">×</button>
        </div>

        <div className="fl-inventory__grid">
          {inventory.backpack.map((slot, i) => (
            <Slot key={`b${i}`} area="backpack" index={i} slot={slot} onDrop={onMove} onHover={setHover} />
          ))}
        </div>

        <div className="fl-inventory__divider">Hotbar</div>
        <div className="fl-inventory__grid fl-inventory__grid--hotbar">
          {inventory.hotbar.map((slot, i) => (
            <Slot key={`h${i}`} area="hotbar" index={i} slot={slot} onDrop={onMove} onHover={setHover} />
          ))}
        </div>

        <div className="fl-inventory__tooltip">
          {hover ? (
            <>
              <strong>{hover.name}</strong>
              <span>{hover.description || (hover.sellPrice ? `Sells for ${hover.sellPrice} coins` : "")}</span>
            </>
          ) : (
            <span className="fl-inventory__hint">Drag items to rearrange. Press I to close.</span>
          )}
        </div>
      </div>
    </div>
  );
}
