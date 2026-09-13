/**
 * Stonewild — the real gameplay HUD: crosshair (rendered by Gameplay
 * directly, it never changes), health/hunger pips, the 9-slot hotbar, an
 * item-name flash, pickup/craft toasts, an optional survival-guide line,
 * and the F3 debug readout (hidden by default — spec requirement).
 */

import { useSyncExternalStore } from "react";
import Slot from "./Slot.jsx";
import { MAX_HEALTH, MAX_HUNGER } from "../game/constants.js";

const OBJECTIVES = [
  "Gather Wildwood logs",
  "Craft Planks",
  "Craft a Workbench",
  "Craft a Wood Pickaxe",
  "Mine Stone",
  "Craft Stone Tools",
];

export default function Hud({ store, debugOn, onSelectSlot, onMoveSlot }) {
  const s = useSyncExternalStore(store.subscribe, store.get);
  const healthPips = Math.ceil((s.health / MAX_HEALTH) * 10);
  const hungerPips = Math.ceil((s.hunger / MAX_HUNGER) * 10);
  const objective = OBJECTIVES[s.objectiveIndex];

  return (
    <>
      {objective && (
        <div className="sw-objective">
          <span className="sw-objective__label">Survival Guide</span>
          <span className="sw-objective__text">{objective}</span>
        </div>
      )}

      <div className="sw-vitals">
        <div className="sw-vitals__row" title={`Health ${Math.round(s.health)}/${MAX_HEALTH}`}>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={`sw-pip sw-pip--health${i < healthPips ? " is-full" : ""}`} />
          ))}
        </div>
        <div className="sw-vitals__row" title={`Hunger ${Math.round(s.hunger)}/${MAX_HUNGER}`}>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={`sw-pip sw-pip--hunger${i < hungerPips ? " is-full" : ""}`} />
          ))}
        </div>
      </div>

      {s.selectedName && <div className="sw-itemflash">{s.selectedName.text}</div>}
      {s.toast && <div className="sw-toast">{s.toast.text}</div>}

      <div className="sw-hotbar">
        {s.inventory.hotbar.map((slot, i) => (
          <div key={i} className="sw-hotbar__cell" onClick={() => onSelectSlot(i)}>
            <Slot slot={slot} selected={s.inventory.selected === i} section="hotbar" index={i} onDrop={onMoveSlot} size={48} />
            <span className="sw-hotbar__num">{i + 1}</span>
          </div>
        ))}
      </div>

      {debugOn && (
        <div className="sw-debughud">
          <span>x {s.x.toFixed(1)} / y {s.y.toFixed(1)} / z {s.z.toFixed(1)}</span>
          <span>{s.onGround ? "grounded" : "airborne"}{s.sprinting ? " · sprinting" : ""}</span>
          <span>{s.chunks} chunks loaded</span>
        </div>
      )}
    </>
  );
}
