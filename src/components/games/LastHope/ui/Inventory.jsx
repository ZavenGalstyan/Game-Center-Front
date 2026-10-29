/**
 * Last Hope — inventory / equipment / crafting / storage transfer.
 *
 * Slots support click (select → details + actions), double-click (use,
 * equip, or move to the open container), shift-click (quick transfer) and
 * pointer drag-and-drop (mouse and touch) between the backpack, the
 * equipment slots and an open container, chest or dropped bag.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { ITEMS, EQUIP_SLOTS, SLOT_NAMES, equipSlotOf, isUsable, rarityOf, itemName } from "../data/items.js";
import { CRAFT_TABS, RECIPES, STATION_NAMES } from "../data/recipes.js";
import { count } from "../engine/inventory.js";

const CAT_NAMES = { resource: "Resource", food: "Food & Drink", medical: "Medical", tool: "Tool", weapon: "Weapon", ammo: "Ammunition", armor: "Armor", key: "Key Item", misc: "Misc" };

function Slot({ it, sel, onPointerDown, onDoubleClick, onClick, inv, idx, label, dim }) {
  const r = it ? rarityOf(it.id) : null;
  const max = it ? ITEMS[it.id]?.dur : 0;
  return (
    <button
      className={`lh-slot${it ? ` lh-slot--${r}` : ""}${sel ? " is-sel" : ""}${dim ? " is-dim" : ""}`}
      data-inv={inv}
      data-idx={idx}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      title={it ? itemName(it.id) : label || ""}
    >
      {it ? <Icon id={it.id} size={38} /> : label ? <span className="lh-slot__lbl">{label}</span> : null}
      {it && it.n > 1 && <b>{it.n}</b>}
      {it && max > 0 && it.d != null && (
        <i className="lh-slot__dur">
          <em style={{ width: `${Math.max(0, (it.d / max) * 100)}%`, background: it.d / max < 0.25 ? "#e8484a" : undefined }} />
        </i>
      )}
    </button>
  );
}

function ItemDetails({ it, where, actions, G, quickIdx }) {
  if (!it) return <div className="lh-det lh-det--empty">Select an item to see its details.</div>;
  const d = ITEMS[it.id];
  const w = d.w;
  return (
    <div className={`lh-det lh-det--${rarityOf(it.id)}`}>
      <div className="lh-det__h">
        <Icon id={it.id} size={56} />
        <div>
          <b>{d.name}</b>
          <span>{CAT_NAMES[d.cat]}</span>
        </div>
      </div>
      <p>{d.desc}</p>
      <ul className="lh-det__stats">
        {w && w.kind === "melee" && <li>Damage {w.dmg} · {(1 / w.cd).toFixed(1)} hits/s · reach {w.range} m</li>}
        {w && w.kind !== "melee" && <li>Damage {w.dmg} · range {w.range} m · uses {ITEMS[w.ammo].name}</li>}
        {w?.gather && <li>Chop ×{w.gather.tree} · Mine ×{w.gather.rock} · Salvage ×{w.gather.scrap}</li>}
        {d.def && <li>Armor +{d.def}</li>}
        {d.slots && <li>+{d.slots} inventory slots</li>}
        {d.food && <li>Hunger +{d.food}</li>}
        {d.water && <li>Thirst +{d.water}</li>}
        {d.heal && <li>Health +{d.heal}</li>}
        {d.hp < 0 && <li className="bad">Health {d.hp}</li>}
        {d.cure && <li>Cures poison</li>}
        {d.dur > 0 && it.d != null && (
          <li>
            Durability {Math.round(it.d)} / {d.dur}
          </li>
        )}
      </ul>
      <div className="lh-det__act">
        {where === "inv" && isUsable(it.id) && <button onClick={actions.use}>{d.cat === "medical" ? "Use" : d.water && !d.food ? "Drink" : "Eat"}</button>}
        {where === "inv" && equipSlotOf(it.id) && <button onClick={actions.equip}>Equip</button>}
        {where === "equip" && <button onClick={actions.unequip}>Unequip</button>}
        {where === "inv" && it.n > 1 && <button onClick={actions.split}>Split</button>}
        {where === "inv" && <button onClick={actions.drop}>Drop</button>}
        {where === "other" && <button onClick={actions.take}>Take</button>}
        {where === "inv" && actions.store && <button onClick={actions.store}>Store</button>}
      </div>
      {where === "inv" && (d.w || isUsable(it.id)) && (
        <div className="lh-det__quick">
          <span>Quick slot</span>
          {G.quick.map((q, i) => (
            <button key={i} className={q === it.id ? "is-on" : ""} onClick={() => actions.quick(i)}>
              {i + 1}
            </button>
          ))}
          {quickIdx >= 0 && <em>bound to {quickIdx + 1}</em>}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- crafting */
function Crafting({ G, actions, station, version }) {
  const [tab, setTab] = useState(station === "campfire" ? "food" : "tools");
  const [sel, setSel] = useState(null);
  const list = useMemo(() => actions.recipes(), [actions, version]);
  const shown = list.filter((x) => x.r.cat === tab);
  const cur = shown.find((x) => x.r.id === sel) || shown[0];
  useEffect(() => {
    if (station === "campfire") setTab("food");
  }, [station]);
  return (
    <div className="lh-craft">
      <div className="lh-tabs lh-tabs--sub">
        {CRAFT_TABS.map(([k, n]) => {
          const ready = list.some((x) => x.r.cat === k && x.s.ok);
          return (
            <button key={k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>
              {n}
              {ready && <i className="lh-dotr" />}
            </button>
          );
        })}
      </div>
      <div className="lh-craft__body">
        <div className="lh-craft__list" data-scroll>
          {shown.map(({ r, s }) => (
            <button key={r.id} className={`lh-rec${cur?.r.id === r.id ? " is-sel" : ""}${s.ok ? " is-ok" : ""}${s.locked ? " is-locked" : ""}`} onClick={() => setSel(r.id)}>
              <Icon id={r.out} size={34} />
              <span>
                <b>{r.label || ITEMS[r.out].name}</b>
                <em>{s.locked ? s.reason : r.station ? STATION_NAMES[r.station] : "Hand-crafted"}</em>
              </span>
              {r.n > 1 && <i>×{r.n}</i>}
            </button>
          ))}
        </div>
        {cur && (
          <div className="lh-craft__det">
            <div className="lh-det__h">
              <Icon id={cur.r.out} size={56} />
              <div>
                <b>{cur.r.label || ITEMS[cur.r.out].name}</b>
                <span>
                  {cur.r.n > 1 ? `Makes ${cur.r.n} · ` : ""}
                  {cur.r.station ? `Needs ${STATION_NAMES[cur.r.station]}` : "Craft anywhere"} · Level {cur.r.level}
                </span>
              </div>
            </div>
            <p>{ITEMS[cur.r.out].desc}</p>
            <div className="lh-cost">
              {Object.entries(cur.r.cost).map(([id, n]) => {
                const have = count(G.inv, id);
                return (
                  <div key={id} className={have >= n ? "ok" : "no"}>
                    <Icon id={id} size={28} />
                    <span>{ITEMS[id].name}</span>
                    <b>
                      {have}/{n}
                    </b>
                  </div>
                );
              })}
            </div>
            {!cur.s.ok && <div className="lh-why">{cur.s.reason}</div>}
            <div className="lh-det__act">
              <button className="lh-btn-primary" disabled={!cur.s.ok} onClick={() => actions.craft(cur.r.id, 1)}>
                Craft
              </button>
              <button disabled={!cur.s.ok} onClick={() => actions.craft(cur.r.id, 5)}>
                Craft ×5
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- panel */
export default function InventoryPanel({ G, other, otherTitle, actions, onClose, initialTab = "bag", station, version, touch }) {
  const [tab, setTab] = useState(other ? "bag" : initialTab);
  const [sel, setSel] = useState(null); // {inv, idx}
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  useEffect(() => setTab(other ? "bag" : initialTab), [initialTab, other]);

  const slotOf = useCallback(
    (inv, idx) => {
      if (inv === "inv") return G.inv.slots[idx] || null;
      if (inv === "equip") return G.equip[idx] || null;
      if (inv === "other") return other?.slots[idx] || null;
      return null;
    },
    [G, other, version],
  );
  const selIt = sel ? slotOf(sel.inv, sel.idx) : null;

  // pointer drag & drop
  const startDrag = (inv, idx) => (e) => {
    if (e.button && e.button !== 0) return;
    const it = slotOf(inv, idx);
    if (!it) return;
    dragRef.current = { inv, idx, x0: e.clientX, y0: e.clientY, on: false, id: it.id };
  };
  useEffect(() => {
    const mv = (e) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.on && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 7) d.on = true;
      if (d.on) setDrag({ id: d.id, x: e.clientX, y: e.clientY });
    };
    const up = (e) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d || !d.on) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-inv]");
      if (!el) return;
      const to = el.getAttribute("data-inv");
      const ti = el.getAttribute("data-idx");
      actions.move(d.inv, d.inv === "equip" ? d.idx : +d.idx, to, to === "equip" ? ti : +ti);
      setSel(null);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    };
  }, [actions]);

  const quickTransfer = (inv, idx) => {
    if (inv === "inv" && other) actions.move("inv", idx, "other", -1);
    else if (inv === "other") actions.move("other", idx, "inv", -1);
  };
  const dbl = (inv, idx) => () => {
    const it = slotOf(inv, idx);
    if (!it) return;
    if (other && (inv === "inv" || inv === "other")) quickTransfer(inv, idx);
    else if (inv === "inv" && isUsable(it.id)) actions.use(idx);
    else if (inv === "inv" && equipSlotOf(it.id)) actions.equip(idx);
    else if (inv === "equip") actions.unequip(idx);
    setSel(null);
  };
  const click = (inv, idx) => (e) => {
    if (e.shiftKey) {
      quickTransfer(inv, idx);
      return;
    }
    const it = slotOf(inv, idx);
    if (!it) {
      if (sel && slotOf(sel.inv, sel.idx)) {
        // click-to-move (touch friendly)
        actions.move(sel.inv, sel.idx, inv, idx);
        setSel(null);
      }
      return;
    }
    setSel(sel && sel.inv === inv && sel.idx === idx ? null : { inv, idx });
  };
  const det = selIt
    ? {
        use: () => (actions.use(sel.idx), setSel(null)),
        equip: () => (actions.equip(sel.idx), setSel(null)),
        unequip: () => (actions.unequip(sel.idx), setSel(null)),
        drop: () => (actions.drop(sel.idx), setSel(null)),
        split: () => actions.split(sel.idx),
        take: () => (actions.move("other", sel.idx, "inv", -1), setSel(null)),
        store: other ? () => (actions.move("inv", sel.idx, "other", -1), setSel(null)) : null,
        quick: (q) => actions.quick(q, selIt.id),
      }
    : {};
  const used = G.inv.slots.filter(Boolean).length;
  const def = ["head", "body", "legs", "feet"].reduce((a, k) => a + (G.equip[k] ? ITEMS[G.equip[k].id].def || 0 : 0), 0);

  return (
    <div className="lh-panel lh-panel--inv" data-ui onPointerDown={(e) => e.stopPropagation()}>
      <div className="lh-panel__head">
        <div className="lh-tabs">
          <button className={tab === "bag" ? "is-on" : ""} onClick={() => setTab("bag")}>
            <Icon id="bag" size={22} /> Backpack
          </button>
          {!other && (
            <button className={tab === "craft" ? "is-on" : ""} onClick={() => setTab("craft")}>
              <Icon id="craft" size={22} /> Crafting{station ? ` · ${STATION_NAMES[station]}` : ""}
            </button>
          )}
        </div>
        <button className="lh-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      {tab === "craft" && !other ? (
        <Crafting G={G} actions={actions} station={station} version={version} />
      ) : (
        <div className="lh-inv">
          <div className="lh-inv__col">
            <div className="lh-sec">
              <span>Equipment</span>
              <em>Armor {def}</em>
            </div>
            <div className="lh-equip">
              {EQUIP_SLOTS.map((k) => (
                <Slot key={k} it={G.equip[k]} inv="equip" idx={k} label={SLOT_NAMES[k]} sel={sel?.inv === "equip" && sel.idx === k} onPointerDown={startDrag("equip", k)} onDoubleClick={dbl("equip", k)} onClick={click("equip", k)} />
              ))}
            </div>
            <ItemDetails it={selIt} where={sel?.inv} actions={det} G={G} quickIdx={selIt ? G.quick.indexOf(selIt.id) : -1} />
          </div>
          <div className="lh-inv__col lh-inv__col--grid">
            <div className="lh-sec">
              <span>Backpack</span>
              <em>
                {used} / {G.inv.slots.length}
              </em>
              <button className="lh-mini" onClick={actions.sort}>
                Sort
              </button>
            </div>
            <div className="lh-grid" data-scroll>
              {G.inv.slots.map((s, i) => (
                <Slot key={i} it={s} inv="inv" idx={i} sel={sel?.inv === "inv" && sel.idx === i} onPointerDown={startDrag("inv", i)} onDoubleClick={dbl("inv", i)} onClick={click("inv", i)} />
              ))}
            </div>
            {!touch && <div className="lh-tip">Drag to move · Double-click to use / equip{other ? " / transfer" : ""} · Shift-click to transfer</div>}
          </div>
          {other && (
            <div className="lh-inv__col lh-inv__col--grid lh-inv__col--other">
              <div className="lh-sec">
                <span>{otherTitle}</span>
                <button className="lh-mini lh-mini--hi" onClick={actions.takeAll}>
                  Take all
                </button>
              </div>
              <div className="lh-grid" data-scroll>
                {other.slots.map((s, i) => (
                  <Slot key={i} it={s} inv="other" idx={i} sel={sel?.inv === "other" && sel.idx === i} onPointerDown={startDrag("other", i)} onDoubleClick={dbl("other", i)} onClick={click("other", i)} />
                ))}
              </div>
              {!other.slots.some(Boolean) && <div className="lh-tip">Empty.</div>}
            </div>
          )}
        </div>
      )}
      {drag && (
        <div className="lh-drag" style={{ transform: `translate(${drag.x - 22}px, ${drag.y - 22}px)` }}>
          <Icon id={drag.id} size={44} />
        </div>
      )}
    </div>
  );
}
void RECIPES;
