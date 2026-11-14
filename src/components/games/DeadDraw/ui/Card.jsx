/**
 * A physical survival card: worn paper stock, category band and symbol, cost
 * chips, a photographic illustration (render/cardArt.js), name, effect text
 * and a risk gauge. Pure presentation; the parent decides what a click does.
 */
import { memo } from "react";
import { CARDS, CATEGORIES, RISK_LABEL } from "../engine/cards.js";
import { Icon } from "./Icons.jsx";

const RISK_LEVEL = { none: 0, low: 1, medium: 2, high: 3, extreme: 4 };
export const RES_NAME = { hp: "Health", food: "Food", water: "Water", power: "Power", scrap: "Scrap", threat: "Danger", defense: "Defense" };

export function CostChips({ cost, have }) {
  const entries = Object.entries(cost || {});
  if (!entries.length) return <span className="dds-cost free">Free</span>;
  return entries.map(([k, v]) => (
    <span key={k} className={`dds-cost ${have && have[k] < v ? "short" : ""}`} title={RES_NAME[k]}>
      <Icon name={k} />
      <b>{v}</b>
    </span>
  ));
}

function CardView({ id, art, playable = true, selected = false, onClick, onHover, style, className = "", have, deal = -1 }) {
  const C = CARDS[id];
  if (!C) return null;
  const cat = CATEGORIES[C.cat];
  const lvl = RISK_LEVEL[C.risk];
  return (
    <button
      type="button"
      className={`dds-card cat-${C.cat} ${playable ? "" : "off"} ${selected ? "sel" : ""} ${deal >= 0 ? "deal" : ""} ${className}`}
      style={{ ...style, "--cat": cat.color, "--deal": deal }}
      onClick={onClick}
      onMouseEnter={onHover ? () => onHover(id) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      aria-label={C.name}
    >
      <span className="dds-card-face">
        <span className="dds-card-band">
          <span className="dds-card-cat">
            <Icon name={C.cat} />
            <span>{cat.name}</span>
          </span>
          <span className="dds-card-costs">
            <CostChips cost={C.cost} have={have} />
          </span>
        </span>
        <span className="dds-card-art">{art ? <img src={art} alt="" draggable="false" /> : <span className="dds-card-art-ph" />}</span>
        <span className="dds-card-name">{C.name}</span>
        <span className="dds-card-desc">{C.desc}</span>
        <span className="dds-card-foot">
          <span className={`dds-risk r${lvl}`} title={RISK_LABEL[C.risk]}>
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className={i < lvl ? "on" : ""} />
            ))}
            <span>{RISK_LABEL[C.risk]}</span>
          </span>
          {C.exhaust && <span className="dds-once">Single use</span>}
        </span>
      </span>
    </button>
  );
}

export const Card = memo(CardView);
