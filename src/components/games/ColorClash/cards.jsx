/**
 * Color Clash card art — original CSS + inline-SVG faces. A card is sized by
 * its `--cw` (width); everything inside scales in `em` from that. Each colour
 * also carries its own emblem (flame / sun / leaf / drop), so colours stay
 * distinguishable without relying on hue alone.
 */
import { memo } from "react";
import { COLOR_NAMES } from "./engine.js";

const EMBLEM = {
  r: <path d="M12 1.5c.8 4.2 6.5 6.2 6.5 12.6a6.5 6.5 0 0 1-13 0c0-3.4 1.9-5.4 3.2-6.6.1 2.3 1.1 3.6 2.4 3.9-.4-4.1.1-6.6.9-9.9z" />,
  y: (
    <>
      <circle cx="12" cy="12" r="4.6" />
      <path d="M12 1.8v3.4M12 18.8v3.4M1.8 12h3.4M18.8 12h3.4M4.8 4.8l2.4 2.4M16.8 16.8l2.4 2.4M4.8 19.2l2.4-2.4M16.8 7.2l2.4-2.4" strokeWidth="2.4" strokeLinecap="round" stroke="currentColor" />
    </>
  ),
  g: <path d="M20.5 3C10.5 3 3.5 8 3.5 15.6c0 2.3.9 4.6.9 4.6s2.3-6.4 9.6-9.8c-5.4 4.3-7.3 7.4-7.6 9.6 8.6.4 14.1-6.3 14.1-17z" />,
  b: <path d="M12 1.8C8.2 7.6 4.8 11 4.8 15.4a7.2 7.2 0 0 0 14.4 0c0-4.4-3.4-7.8-7.2-13.6z" />,
};

export function Emblem({ c, className = "" }) {
  return (
    <svg className={`cc-emblem ${className}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {EMBLEM[c]}
    </svg>
  );
}

const ICON = {
  skip: (
    <g fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
      <circle cx="12" cy="12" r="8.2" />
      <path d="M6.4 17.6 17.6 6.4" />
    </g>
  ),
  rev: (
    <g fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 9.5h13.5M14 5.5l4 4-4 4" />
      <path d="M19.5 14.5H6M10 10.5l-4 4 4 4" />
    </g>
  ),
};

/** The four-colour wild star used on Wild cards (and the colour picker). */
export function WildMark({ size = "100%" }) {
  return (
    <svg className="cc-wildmark" viewBox="-12 -12 24 24" style={{ width: size, height: size }} aria-hidden="true">
      {["r", "y", "g", "b"].map((c, k) => (
        <path key={c} className={`cc-fill-${c}`} transform={`rotate(${k * 90})`} d="M0 0 L0 -10.5 Q6 -6 10.5 0 Z" />
      ))}
      <circle r="3.2" fill="#fff" />
    </svg>
  );
}

const LABEL = { skip: "Skip", rev: "Reverse", d2: "Draw Two", wild: "Wild", wd4: "Wild Draw Four" };
export const cardName = (card) => (card.c === "w" ? LABEL[card.v] : `${COLOR_NAMES[card.c]} ${LABEL[card.v] ?? card.v}`);

function Glyph({ v }) {
  if (ICON[v]) return <svg className="cc-glyph" viewBox="0 0 24 24" aria-hidden="true">{ICON[v]}</svg>;
  if (v === "d2" || v === "wd4") return <span className="cc-num cc-num--plus">{v === "d2" ? "+2" : "+4"}</span>;
  if (v === "wild") return <WildMark size="1em" />;
  return <span className={`cc-num${v === "6" || v === "9" ? " is-under" : ""}`}>{v}</span>;
}

export const Card = memo(function Card({ card, className = "", style, ...rest }) {
  const wild = card.c === "w";
  return (
    <div className={`cc-card cc-face cc-c-${card.c} ${className}`} style={style} {...rest}>
      <span className="cc-corner cc-corner--tl"><Glyph v={card.v} /></span>
      <span className="cc-corner cc-corner--br"><Glyph v={card.v} /></span>
      {!wild && <Emblem c={card.c} className="cc-face__emblem" />}
      <div className="cc-gem">
        {wild ? (
          <>
            <WildMark />
            {card.v === "wd4" && <span className="cc-num cc-num--plus cc-gem__plus">+4</span>}
          </>
        ) : (
          <Glyph v={card.v} />
        )}
      </div>
    </div>
  );
});

export function CardBack({ className = "", style }) {
  return (
    <div className={`cc-card cc-back ${className}`} style={style} aria-hidden="true">
      <div className="cc-back__mark">
        <span className="cc-fill-r" />
        <span className="cc-fill-y" />
        <span className="cc-fill-g" />
        <span className="cc-fill-b" />
        <b>CC</b>
      </div>
    </div>
  );
}
