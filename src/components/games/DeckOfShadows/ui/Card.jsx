/**
 * A dark-fantasy card: rarity-specific metal frame, cost gem, rendered 3D
 * illustration (render/cardArt.js), name plate, type line and rules text.
 * Pointer tilt is written to CSS variables (no React re-render per move).
 */
import { memo, useRef } from "react";
import { cardStats, cardLines, KIND_LABEL, RARITY_LABEL } from "../engine/cards.js";
import { Flourish, Icon } from "./Icons.jsx";

function CardInner({ refId, art, playable = true, short = false, onClick, onEnter, onLeave, className = "", style, size = "", tiltable = true, flipped = false, badge = null }) {
  const el = useRef(null);
  const c = cardStats(refId);
  if (!c) return null;
  const lines = cardLines(c);
  // translated text runs ~30% longer than English: size the rules box by length
  const len = lines.join(" ").length + c.name.length * 0.3;
  const fit = len > 62 ? "fit-xs" : len > 42 ? "fit-s" : "";
  const move = (e) => {
    if (!tiltable || !el.current) return;
    const r = el.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.current.style.setProperty("--rx", `${(-y * 14).toFixed(2)}deg`);
    el.current.style.setProperty("--ry", `${(x * 16).toFixed(2)}deg`);
    el.current.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`);
    el.current.style.setProperty("--gy", `${((y + 0.5) * 100).toFixed(1)}%`);
  };
  const leave = (e) => {
    if (el.current) {
      el.current.style.setProperty("--rx", "0deg");
      el.current.style.setProperty("--ry", "0deg");
    }
    onLeave?.(e);
  };
  return (
    <div
      ref={el}
      className={`dos-card r-${c.rarity} k-${c.kind} ${fit} ${c.upgraded ? "is-up" : ""} ${playable ? "" : "is-dim"} ${short ? "is-short" : ""} ${size} ${flipped ? "is-back" : ""} ${className}`}
      style={style}
      onPointerMove={move}
      onPointerEnter={onEnter}
      onPointerLeave={leave}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick(e) : undefined}
      aria-label={c.name}
    >
      <div className="dos-card__body">
        <div className="dos-card__frame">
          <div className="dos-card__art" style={art ? { backgroundImage: `url(${art})` } : undefined}>
            {!art && <div className="dos-card__artfallback" />}
            <div className="dos-card__artvig" />
          </div>
          <div className="dos-card__name">
            <span>{c.name}</span>
            {c.upgraded && <span className="dos-card__plus">+</span>}
          </div>
          <div className="dos-card__type">
            <span>{KIND_LABEL[c.kind]}</span>
            <i aria-hidden="true">◆</i>
            <span>{RARITY_LABEL[c.rarity]}</span>
          </div>
          <div className="dos-card__text">
            {lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
          <Flourish className="tl" />
          <Flourish className="tr" />
          <Flourish className="bl" />
          <Flourish className="br" />
        </div>
        <div className="dos-card__cost">
          <span>{c.cost}</span>
        </div>
        {c.kind !== "curse" && (
          <div className="dos-card__kind" aria-hidden="true">
            <Icon name={c.kind === "attack" ? "sword" : c.kind === "power" ? "crown" : c.block ? "defend" : c.heal ? "heal" : "debuff"} />
          </div>
        )}
        {badge}
        <div className="dos-card__shine" />
      </div>
      <div className="dos-card__back" aria-hidden="true">
        <div className="dos-card__backsigil" />
      </div>
    </div>
  );
}

export const Card = memo(CardInner);
