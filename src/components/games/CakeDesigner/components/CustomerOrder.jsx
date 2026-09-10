/**
 * Cake Designer — the customer order card shown in the editor's left panel.
 * Illustrative avatar + request text + a friendly checklist of what they asked
 * for. Live ticks update as the player's cake starts to match.
 */

import CustomerAvatar from "./CustomerAvatar.jsx";
import { customer } from "../data/customers.js";
import {
  SHAPE_BY_ID, FROSTING_BY_ID, COLOR_BY_ID, DRIP_BY_ID,
  TOPPING_BY_ID, DECORATION_BY_ID, FINAL_BY_ID,
} from "../data/items.js";

function reqLines(req) {
  const out = [];
  if (req.shape) out.push({ key: "shape", text: `${SHAPE_BY_ID[req.shape]?.name || req.shape} shape` });
  if (req.layers) out.push({ key: "layers", text: `${req.layers} ${req.layers === 1 ? "layer" : "tiers"}` });
  if (req.frosting) out.push({ key: "frosting", text: `${FROSTING_BY_ID[req.frosting]?.name || req.frosting} frosting` });
  if (req.colors) {
    const names = req.colors.map((c) => COLOR_BY_ID[c]?.name || c);
    out.push({ key: "color", text: names.length === 1 ? `${names[0]}` : names.join(" · ") });
  }
  if (req.drip) out.push({ key: "drip", text: `${DRIP_BY_ID[req.drip]?.name || req.drip}` });
  (req.toppings || []).forEach((t) =>
    out.push({ key: `top-${t.id}`, text: `${t.count > 1 ? t.count + " " : ""}${TOPPING_BY_ID[t.id]?.name || t.id}${t.count > 1 ? "s" : ""}` }),
  );
  if (req.scatter) out.push({ key: "scatter", text: `${DECORATION_BY_ID[req.scatter]?.name || req.scatter}` });
  (req.decorations || []).forEach((d) =>
    out.push({ key: `dec-${d.id}`, text: `${d.count > 1 ? d.count + " " : ""}${DECORATION_BY_ID[d.id]?.name || d.id}` }),
  );
  if (req.special?.candles) out.push({ key: "candles", text: `${req.special.candles} candles` });
  if (req.special?.number != null) out.push({ key: "number", text: `Number ${req.special.number} candle` });
  if (req.special?.message) out.push({ key: "message", text: `"${req.special.message}"` });
  if (req.finalTouch) out.push({ key: "final", text: `${FINAL_BY_ID[req.finalTouch]?.name || req.finalTouch}` });
  return out;
}

export default function CustomerOrder({ order, checks = {}, compact = false }) {
  const cust = customer(order.customer);
  const lines = reqLines(order.requirements);
  return (
    <div className={`cd-order${compact ? " cd-order--compact" : ""}`}>
      <div className="cd-order__head">
        <CustomerAvatar id={order.customer} data={cust} size={compact ? 44 : 60} />
        <div className="cd-order__who">
          <span className="cd-order__name">{cust.name}</span>
          <span className="cd-order__occasion">{order.occasion}</span>
        </div>
        <span className="cd-order__num">#{String(order.id).padStart(2, "0")}</span>
      </div>

      <p className="cd-order__request">{order.request}</p>

      <div className="cd-order__list">
        <span className="cd-order__list-title">Requested</span>
        <ul>
          {lines.map((l) => (
            <li key={l.key} className={checks[l.key] ? "is-met" : ""}>
              <span className="cd-order__check" aria-hidden="true">
                {checks[l.key] ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                ) : (
                  <i />
                )}
              </span>
              {l.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export { reqLines };
