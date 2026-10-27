/**
 * Oceanbound — overlay panels: inventory + crafting (Tab), storage chest,
 * build menu (B) and the logbook reader. Slots support drag & drop
 * (pointer events, mouse or touch), click to inspect and Shift-click /
 * double-tap to quick-move.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ITEMS, RECIPES, RECIPE_CATS, PIECES, PIECE_ORDER, PLACEABLE, itemName } from "../data/items.js";
import { OBJECTIVES, LOG_PAGES } from "../data/objectives.js";
import { countItem, hasCost, moveSlot, quickMove, HOTBAR } from "../sim/inventory.js";
import { Icon } from "./icons.jsx";

const UNLOCKED_BY = {};
for (const o of OBJECTIVES) for (const u of o.unlock || []) UNLOCKED_BY[u] = o.title;

function Slot({ s, i, where, sel, hot, onDown, picked, eq }) {
  const it = s && ITEMS[s.id];
  const dur = s && it?.tool?.dur ? s.dur / it.tool.dur : null;
  return (
    <div
      className={`ob-slot${hot ? " is-hot" : ""}${sel ? " is-pick" : ""}${eq ? " is-sel" : ""}${picked ? " is-drag" : ""}`}
      data-slot={`${where}:${i}`}
      onPointerDown={(e) => onDown(e, where, i)}
      role="button"
      tabIndex={-1}
      aria-label={s ? `${itemName(s.id)} ×${s.n}` : "Empty slot"}
    >
      {hot && <span className="ob-slot__key">{i + 1}</span>}
      {s && <Icon id={s.id} size={30} />}
      {s && s.n > 1 && <span className="ob-slot__n">{s.n}</span>}
      {dur != null && (
        <span className="ob-slot__dur">
          <i style={{ width: `${dur * 100}%`, background: dur < 0.25 ? "#ff6a5a" : dur < 0.5 ? "#ffc65a" : "#7fe08a" }} />
        </span>
      )}
    </div>
  );
}

/** shared drag & drop between the bag and an optional second inventory */
function useDrag(G, invs, bump) {
  const [drag, setDrag] = useState(null);
  const [pick, setPick] = useState(null);
  const ghost = useRef(null);
  const lastTap = useRef({ k: "", t: 0 });
  const onDown = (e, where, i) => {
    e.preventDefault();
    e.stopPropagation();
    const inv = invs[where];
    const s = inv.slots[i];
    const key = `${where}:${i}`;
    const tNow = performance.now();
    const dbl = lastTap.current.k === key && tNow - lastTap.current.t < 320;
    lastTap.current = { k: key, t: tNow };
    if (s && (e.shiftKey || dbl)) {
      // quick move
      const other = where === "bag" ? (invs.chest ? "chest" : null) : "bag";
      if (other) quickMove(inv, i, invs[other]);
      else if (where === "bag") {
        // bag ↔ hotbar
        const target = i < HOTBAR ? { slots: inv.slots.slice(HOTBAR) } : { slots: inv.slots.slice(0, HOTBAR) };
        const empty = target.slots.findIndex((x) => !x);
        if (empty >= 0) moveSlot(inv, i, inv, i < HOTBAR ? HOTBAR + empty : empty);
      }
      G.invVersion++;
      bump();
      return;
    }
    setPick({ where, i });
    if (!s) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      moved = true;
      setDrag({ where, i, id: s.id });
      if (ghost.current) ghost.current.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDrag(null);
      if (!moved) return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.("[data-slot]");
      if (!el) return;
      const [w2, j] = el.dataset.slot.split(":");
      if (!invs[w2]) return;
      moveSlot(inv, i, invs[w2], +j);
      G.invVersion++;
      setPick({ where: w2, i: +j });
      bump();
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const ghostEl = drag ? (
    <div className="ob-dragghost" ref={ghost}>
      <Icon id={drag.id} size={34} />
    </div>
  ) : null;
  return { drag, pick, setPick, onDown, ghostEl };
}

function BagGrid({ G, onDown, pick, drag }) {
  const slots = G.inv.slots;
  return (
    <div className="ob-bag">
      <div className="ob-sub">Hotbar</div>
      <div className="ob-grid ob-grid--hot">
        {slots.slice(0, HOTBAR).map((s, i) => (
          <Slot key={i} s={s} i={i} where="bag" hot sel={pick?.where === "bag" && pick.i === i} eq={G.sel === i} onDown={onDown} picked={drag?.where === "bag" && drag.i === i} />
        ))}
      </div>
      <div className="ob-sub">Backpack</div>
      <div className="ob-grid">
        {slots.slice(HOTBAR).map((s, k) => {
          const i = k + HOTBAR;
          return <Slot key={i} s={s} i={i} where="bag" sel={pick?.where === "bag" && pick.i === i} onDown={onDown} picked={drag?.where === "bag" && drag.i === i} />;
        })}
      </div>
    </div>
  );
}

function ItemInfo({ G, pick, invs, actions, bump }) {
  const s = pick ? invs[pick.where]?.slots[pick.i] : null;
  if (!s) return <div className="ob-info ob-info--empty">Select an item to see what it does. Drag to move, Shift-click (or double-tap) to quick-move.</div>;
  const it = ITEMS[s.id];
  const canUse = pick.where === "bag" && ((it.kind === "food") || s.id === "cup_fresh");
  return (
    <div className="ob-info">
      <div className="ob-info__head">
        <Icon id={s.id} size={40} />
        <div>
          <b>{it.name}</b>
          <small>
            {it.kind === "tool" ? "Tool" : it.kind === "place" ? "Placeable — build with the hammer (B)" : it.kind === "food" ? "Food" : it.kind === "water" ? "Water" : "Material"}
            {s.n > 1 ? ` · ×${s.n}` : ""}
            {s.dur != null ? ` · ${s.dur}/${it.tool.dur} uses` : ""}
          </small>
        </div>
      </div>
      <p>{it.desc}</p>
      {it.food && (
        <div className="ob-info__food">
          {it.food.hunger ? <span className={it.food.hunger > 0 ? "is-up" : "is-down"}>Hunger {it.food.hunger > 0 ? "+" : ""}{it.food.hunger}</span> : null}
          {it.food.thirst ? <span className={it.food.thirst > 0 ? "is-up" : "is-down"}>Thirst {it.food.thirst > 0 ? "+" : ""}{it.food.thirst}</span> : null}
          {it.food.health ? <span className={it.food.health > 0 ? "is-up" : "is-down"}>Health {it.food.health > 0 ? "+" : ""}{it.food.health}</span> : null}
        </div>
      )}
      <div className="ob-info__acts">
        {canUse && (
          <button type="button" className="ob-btn ob-btn--sm" onClick={() => (actions.consume(pick.i), bump())}>
            {s.id === "cup_fresh" ? "Drink" : it.verb || "Eat"}
          </button>
        )}
        {pick.where === "bag" && pick.i >= HOTBAR && (
          <button
            type="button"
            className="ob-btn ob-btn--sm ob-btn--ghost"
            onClick={() => {
              moveSlot(G.inv, pick.i, G.inv, G.sel);
              G.invVersion++;
              bump();
            }}
          >
            Put in hand (slot {G.sel + 1})
          </button>
        )}
        {it.kind === "place" && (
          <button type="button" className="ob-btn ob-btn--sm ob-btn--ghost" onClick={() => actions.selectPiece(s.id)}>
            Place it
          </button>
        )}
      </div>
    </div>
  );
}

function Crafting({ G, actions, bump }) {
  const [cat, setCat] = useState("tools");
  const [selId, setSel] = useState(null);
  const list = RECIPES.filter((r) => r.cat === cat);
  const r = list.find((x) => x.id === selId) || list[0];
  const unlocked = (id) => G.unlocked.has(id);
  const can = (rc) => unlocked(rc.id) && hasCost(G.inv, rc.cost);
  const [msg, setMsg] = useState(null);
  const craftIt = (times) => {
    const res = actions.craft(r.id, times);
    setMsg(res.ok ? { ok: true, t: `Crafted ${itemName(r.out)}${res.made > 1 ? ` ×${res.made}` : ""}` } : { ok: false, t: res.reason });
    bump();
  };
  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(null), 1800);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <div className="ob-craft">
      <div className="ob-tabs">
        {RECIPE_CATS.map((c) => {
          const n = RECIPES.filter((x) => x.cat === c.id && can(x)).length;
          return (
            <button type="button" key={c.id} className={`ob-tab${c.id === cat ? " is-on" : ""}`} onClick={() => (setCat(c.id), setSel(null))}>
              {c.name}
              {n > 0 && <i>{n}</i>}
            </button>
          );
        })}
      </div>
      <div className="ob-craft__body">
        <div className="ob-recipes" data-scroll>
          {list.map((rc) => (
            <button type="button" key={rc.id} className={`ob-recipe${rc === r ? " is-on" : ""}${!unlocked(rc.id) ? " is-locked" : can(rc) ? " is-can" : ""}`} onClick={() => setSel(rc.id)}>
              <Icon id={rc.out} size={30} />
              <span>{itemName(rc.out)}</span>
              {!unlocked(rc.id) && (
                <em>
                  <Icon id="lock" size={12} />
                </em>
              )}
            </button>
          ))}
        </div>
        {r && (
          <div className="ob-rdetail">
            <div className="ob-info__head">
              <Icon id={r.out} size={44} />
              <div>
                <b>
                  {itemName(r.out)}
                  {r.n > 1 ? ` ×${r.n}` : ""}
                </b>
                <small>{RECIPE_CATS.find((c) => c.id === r.cat)?.name}</small>
              </div>
            </div>
            <p>{ITEMS[r.out].desc}</p>
            {!unlocked(r.id) ? (
              <div className="ob-locked">
                <Icon id="lock" size={16} /> Unlocked by the objective “{UNLOCKED_BY[r.id] || "?"}”
              </div>
            ) : (
              <>
                <div className="ob-cost">
                  {Object.entries(r.cost).map(([id, n]) => {
                    const have = countItem(G.inv, id);
                    return (
                      <div key={id} className={`ob-cost__row${have >= n ? " is-ok" : " is-miss"}`}>
                        <Icon id={id} size={22} />
                        <span>{itemName(id)}</span>
                        <b>
                          {have}/{n}
                        </b>
                      </div>
                    );
                  })}
                </div>
                <div className="ob-info__acts">
                  <button type="button" className="ob-btn" disabled={!can(r)} onClick={() => craftIt(1)}>
                    Craft
                  </button>
                  {ITEMS[r.out].stack > 1 && (
                    <button type="button" className="ob-btn ob-btn--ghost" disabled={!can(r)} onClick={() => craftIt(5)}>
                      ×5
                    </button>
                  )}
                </div>
              </>
            )}
            {msg && <div className={`ob-craftmsg${msg.ok ? " is-ok" : ""}`}>{msg.t}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export function InventoryPanel({ G, chest, actions, onClose, touch }) {
  const [, setV] = useState(0);
  const bump = () => setV((v) => v + 1);
  const invs = useMemo(() => ({ bag: G.inv, ...(chest ? { chest: { slots: chest.state.slots } } : {}) }), [G, chest]);
  // keep the chest reference live (its slots array is mutated in place)
  if (chest) invs.chest.slots = chest.state.slots;
  const { drag, pick, onDown, ghostEl } = useDrag(G, invs, bump);
  useEffect(() => {
    const id = setInterval(bump, 400);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="ob-panel-wrap" data-ui onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`ob-panel ob-panel--inv${touch ? " is-touch" : ""}`}>
        <div className="ob-panel__head">
          <h2>
            <Icon id="bag" size={22} /> {chest ? "Storage Chest" : "Inventory & Crafting"}
          </h2>
          <button type="button" className="ob-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="ob-panel__body" data-scroll>
          <div className="ob-col">
            <BagGrid G={G} onDown={onDown} pick={pick} drag={drag} />
            <ItemInfo G={G} pick={pick} invs={invs} actions={actions} bump={bump} />
          </div>
          <div className="ob-col">
            {chest ? (
              <div className="ob-bag">
                <div className="ob-sub">Chest — Shift-click to move stacks</div>
                <div className="ob-grid">
                  {chest.state.slots.map((s, i) => (
                    <Slot key={i} s={s} i={i} where="chest" sel={pick?.where === "chest" && pick.i === i} onDown={onDown} picked={drag?.where === "chest" && drag.i === i} />
                  ))}
                </div>
                <div className="ob-info__acts">
                  <button
                    type="button"
                    className="ob-btn ob-btn--sm ob-btn--ghost"
                    onClick={() => {
                      for (let i = HOTBAR; i < G.inv.slots.length; i++) if (G.inv.slots[i]) quickMove(G.inv, i, invs.chest);
                      G.invVersion++;
                      bump();
                    }}
                  >
                    Store backpack
                  </button>
                  <button
                    type="button"
                    className="ob-btn ob-btn--sm ob-btn--ghost"
                    onClick={() => {
                      for (let i = 0; i < invs.chest.slots.length; i++) if (invs.chest.slots[i]) quickMove(invs.chest, i, G.inv);
                      G.invVersion++;
                      bump();
                    }}
                  >
                    Take all
                  </button>
                </div>
              </div>
            ) : (
              <Crafting G={G} actions={actions} bump={bump} />
            )}
          </div>
        </div>
        {!touch && <div className="ob-panel__foot">Tab / Esc to close · drag items between slots · 1–8 select hotbar in game</div>}
      </div>
      {ghostEl}
    </div>
  );
}

export function BuildMenu({ G, actions, onClose }) {
  const placeables = Object.keys(PLACEABLE).filter((k) => countItem(G.inv, k) > 0);
  const hasHammer = countItem(G.inv, "hammer") > 0;
  return (
    <div className="ob-panel-wrap" data-ui onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ob-panel ob-panel--build">
        <div className="ob-panel__head">
          <h2>
            <Icon id="hammer" size={22} /> Build
          </h2>
          <button type="button" className="ob-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {!hasHammer && <div className="ob-locked">Craft a Building Hammer (Tab → Tools) to build. It needs 4 planks and 1 rope.</div>}
        <div className="ob-panel__body ob-panel__body--col" data-scroll>
          <div className="ob-sub">Structures</div>
          <div className="ob-pieces">
            {PIECE_ORDER.map((k) => {
              const P = PIECES[k];
              const un = G.unlocked.has(k);
              const ok = un && hasCost(G.inv, P.cost);
              return (
                <button type="button" key={k} disabled={!hasHammer || !un} className={`ob-piece${G.build.piece === k ? " is-on" : ""}${ok ? " is-can" : ""}${!un ? " is-locked" : ""}`} onClick={() => actions.selectPiece(k)}>
                  <Icon id={k} size={36} />
                  <b>{P.name}</b>
                  <span className="ob-piece__cost">
                    {Object.entries(P.cost).map(([id, n]) => (
                      <span key={id} className={countItem(G.inv, id) >= n ? "is-ok" : "is-miss"}>
                        <Icon id={id} size={14} />
                        {n}
                      </span>
                    ))}
                  </span>
                  {!un && <em>Unlock: {UNLOCKED_BY[k]}</em>}
                  <small>{P.desc}</small>
                </button>
              );
            })}
          </div>
          <div className="ob-sub">Your stations & gear</div>
          {placeables.length === 0 ? (
            <div className="ob-info--empty ob-info">Craft stations (purifier, grill, chest, sail…) in the inventory, then place them here.</div>
          ) : (
            <div className="ob-pieces">
              {placeables.map((k) => (
                <button type="button" key={k} disabled={!hasHammer} className={`ob-piece is-can${G.build.piece === k ? " is-on" : ""}`} onClick={() => actions.selectPiece(k)}>
                  <Icon id={k} size={36} />
                  <b>{itemName(k)}</b>
                  <span className="ob-piece__cost">×{countItem(G.inv, k)}</span>
                  <small>{PLACEABLE[k].slot === "edge" ? "Goes on an outer raft edge" : "Goes on a foundation"}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ob-panel__foot">LMB place · R rotate · RMB / X remove (full refund) · E with hammer repairs damaged foundations</div>
      </div>
    </div>
  );
}

export function LogReader({ G, index, onClose }) {
  const [i, setI] = useState(index ?? 0);
  const found = G.pages;
  const pg = LOG_PAGES[found[Math.min(i, found.length - 1)]];
  if (!pg) return null;
  return (
    <div className="ob-panel-wrap" data-ui onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ob-log">
        <div className="ob-log__paper">
          <small>Castaway's logbook · page {found[i] + 1} of {LOG_PAGES.length}</small>
          <h3>{pg.title}</h3>
          <p>{pg.text}</p>
        </div>
        <div className="ob-log__nav">
          <button type="button" className="ob-btn ob-btn--ghost ob-btn--sm" disabled={i <= 0} onClick={() => setI(i - 1)}>
            ‹ Prev
          </button>
          <span>
            {found.length}/{LOG_PAGES.length} found
          </span>
          <button type="button" className="ob-btn ob-btn--ghost ob-btn--sm" disabled={i >= found.length - 1} onClick={() => setI(i + 1)}>
            Next ›
          </button>
          <button type="button" className="ob-btn ob-btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
