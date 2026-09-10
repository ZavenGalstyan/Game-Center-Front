/**
 * Cake Designer — order / collection select.
 * Five collection cards (each with a procedurally-rendered showcase cake),
 * then the 10 orders of the chosen collection.
 */

import { useMemo, useState } from "react";
import CakePreview from "../components/CakePreview.jsx";
import CustomerAvatar from "../components/CustomerAvatar.jsx";
import { Stars, LockIcon } from "../components/bits.jsx";
import { COLLECTIONS } from "../data/collections.js";
import { ordersForCollection } from "../data/orders.js";
import { cakeFromPreview } from "../editor/cakeState.js";
import { customer } from "../data/customers.js";

export default function OrderSelect({ state, settings, onPlay, onBack }) {
  const firstOpen = useMemo(() => {
    const open = COLLECTIONS.filter((c) => state.unlockedLevel >= c.range[0]);
    return (open[open.length - 1] || COLLECTIONS[0]).id;
  }, [state.unlockedLevel]);
  const [sel, setSel] = useState(firstOpen);

  const collection = COLLECTIONS.find((c) => c.id === sel);
  const orders = ordersForCollection(sel);

  return (
    <div className="cd-select" style={{ "--cd-accent": collection.theme.accent }}>
      <div className="cd-select__top">
        <button className="cd-btn cd-btn--ghost" onClick={onBack}>Menu</button>
        <h2>Choose an Order</h2>
        <span />
      </div>

      <div className="cd-collections">
        {COLLECTIONS.map((c) => {
          const locked = state.unlockedLevel < c.range[0];
          const done = ordersForCollection(c.id).filter((o) => state.levels[o.id]?.completed).length;
          const cake = cakeFromPreview(c.preview);
          return (
            <button key={c.id}
              className={`cd-col-card${sel === c.id ? " is-sel" : ""}${locked ? " is-locked" : ""}`}
              style={{ "--cd-accent": c.theme.accent, "--cd-accent2": c.theme.accent2, "--cd-panel": c.theme.panel }}
              onClick={() => !locked && setSel(c.id)}
              disabled={locked}>
              <div className="cd-col-card__cake">
                <CakePreview cake={cake} quality="low" animate={false} showStand={false} />
              </div>
              <span className="cd-col-card__name">{c.name}</span>
              <span className="cd-col-card__meta">
                {locked ? <><LockIcon /> Complete Order {String(c.unlockAfter).padStart(2, "0")}</> : `${done}/10 orders`}
              </span>
            </button>
          );
        })}
      </div>

      <div className="cd-orders">
        <h3>{collection.name}</h3>
        <p className="cd-orders__tag">{collection.tagline}</p>
        <div className="cd-orders__grid">
          {orders.map((o) => {
            const rec = state.levels[o.id];
            const locked = o.id > state.unlockedLevel;
            const cust = customer(o.customer);
            return (
              <button key={o.id}
                className={`cd-order-tile${locked ? " is-locked" : ""}${rec?.completed ? " is-done" : ""}`}
                onClick={() => !locked && onPlay(o.id)}
                disabled={locked}>
                <span className="cd-order-tile__no">Order {String(o.id).padStart(2, "0")}</span>
                {locked ? (
                  <span className="cd-order-tile__lock"><LockIcon size={20} /></span>
                ) : (
                  <CustomerAvatar id={o.customer} data={cust} size={46} />
                )}
                <span className="cd-order-tile__name">{cust.name}</span>
                <span className="cd-order-tile__occ">{o.occasion}</span>
                <span className="cd-order-tile__foot">
                  <Stars value={rec?.stars || 0} size={13} />
                  {rec?.bestScore ? <b>{rec.bestScore}%</b> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
