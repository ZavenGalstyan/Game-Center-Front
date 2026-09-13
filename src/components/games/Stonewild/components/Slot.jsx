/**
 * Stonewild — one inventory/hotbar slot. Shared by the hotbar, the
 * Inventory screen and the Workbench screen so drag/drop and the hover
 * tooltip behave identically everywhere. Native HTML5 drag-and-drop — no
 * extra library.
 */

import ItemIcon from "./ItemIcon.jsx";
import { getItem, kindLabel } from "../game/items.js";

export default function Slot({ slot, section, index, onDrop, selected = false, size = 46, onClick }) {
  const def = slot ? getItem(slot.itemId) : null;
  const durPct =
    slot && slot.durability != null && slot.maxDurability ? slot.durability / slot.maxDurability : null;

  return (
    <div
      className={`sw-slot${selected ? " is-selected" : ""}${slot ? "" : " is-empty"}`}
      style={{ width: size, height: size }}
      draggable={Boolean(slot)}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-stonewild-slot", JSON.stringify({ section, index }));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const raw = e.dataTransfer.getData("application/x-stonewild-slot");
        if (!raw) return;
        try {
          const from = JSON.parse(raw);
          onDrop?.(from, { section, index });
        } catch {
          /* malformed drag payload — ignore */
        }
      }}
      onClick={onClick}
    >
      {def && <ItemIcon itemId={slot.itemId} size={size - 10} />}
      {slot && slot.count > 1 && <span className="sw-slot__count">{slot.count}</span>}
      {durPct != null && (
        <div className="sw-slot__dur">
          <div
            className="sw-slot__dur-fill"
            style={{ width: `${durPct * 100}%`, background: durPct > 0.5 ? "#6ba24a" : durPct > 0.2 ? "#e7a23c" : "#d9573f" }}
          />
        </div>
      )}
      {def && (
        <div className="sw-tooltip">
          <span className="sw-tooltip__name">{def.name}</span>
          <span className="sw-tooltip__kind">{kindLabel(def)}</span>
          {durPct != null && (
            <span className="sw-tooltip__dur">
              Durability: {slot.durability} / {slot.maxDurability}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
