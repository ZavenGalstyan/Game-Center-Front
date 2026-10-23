/**
 * Crazy Cards card art — original inline-SVG suits, pip layouts and court
 * crests. A card is sized by its `--cw` (width); everything inside scales in
 * `em` from that. Eights wear a gold "wild" frame so they read at a glance.
 */
import { memo } from "react";
import { isRed, rankLabel, cardName, SUIT_NAMES } from "./engine.js";

const SUIT_PATH = {
  h: "M50 92C20 69 5 52 5 32 5 17 16 7 29.5 7 39 7 46 12 50 21 54 12 61 7 70.5 7 84 7 95 17 95 32 95 52 80 69 50 92z",
  d: "M50 3Q64 28 88 50 64 72 50 97 36 72 12 50 36 28 50 3z",
  s: "M50 3C38 22 7 36 7 60 7 74 17 82 29 82 37 82 43 78 46 72 45 82 40 90 32 96H68C60 90 55 82 54 72 57 78 63 82 71 82 83 82 93 74 93 60 93 36 62 22 50 3z",
  c: "M50 5C61 5 69 13 69 24 69 29 67 33 64 36 67 35 70 34 73 34 84 34 93 43 93 54 93 65 84 74 73 74 64 74 57 69 54 63 55 77 60 88 68 96H32C40 88 45 77 46 63 43 69 36 74 27 74 16 74 7 65 7 54 7 43 16 34 27 34 30 34 33 35 36 36 33 33 31 29 31 24 31 13 39 5 50 5z",
};

export function Suit({ s, className = "", style }) {
  return (
    <svg className={`kc-suit ${className}`} style={style} viewBox="0 0 100 100" aria-hidden="true">
      <path d={SUIT_PATH[s]} />
    </svg>
  );
}

// pip centres in % of the inner field; pips below the middle are drawn upside-down
const L = 24, R = 76, M = 50;
const PIPS = {
  2: [[M, 10], [M, 90]],
  3: [[M, 10], [M, 50], [M, 90]],
  4: [[L, 10], [R, 10], [L, 90], [R, 90]],
  5: [[L, 10], [R, 10], [M, 50], [L, 90], [R, 90]],
  6: [[L, 10], [R, 10], [L, 50], [R, 50], [L, 90], [R, 90]],
  7: [[L, 10], [R, 10], [M, 30], [L, 50], [R, 50], [L, 90], [R, 90]],
  8: [[L, 10], [R, 10], [M, 30], [L, 50], [R, 50], [M, 70], [L, 90], [R, 90]],
  9: [[L, 10], [R, 10], [L, 37], [R, 37], [M, 50], [L, 63], [R, 63], [L, 90], [R, 90]],
  10: [[L, 10], [R, 10], [M, 23], [L, 37], [R, 37], [L, 63], [R, 63], [M, 77], [L, 90], [R, 90]],
};

// court crests: original line drawings (crown / tiara / plumed cap)
const CREST = {
  13: (
    <>
      <path d="M14 66 8 26 30 44 50 14 70 44 92 26 86 66Z" />
      <rect x="12" y="70" width="76" height="12" rx="3" />
      <circle cx="8" cy="24" r="5" /><circle cx="50" cy="11" r="6" /><circle cx="92" cy="24" r="5" />
    </>
  ),
  12: (
    <>
      <path d="M12 74C14 50 26 38 50 38S86 50 88 74Z" />
      <path d="M50 8 58 26 50 34 42 26Z" />
      <circle cx="24" cy="40" r="5" /><circle cx="76" cy="40" r="5" /><circle cx="50" cy="56" r="7" fill="var(--kc-paper)" />
      <rect x="10" y="78" width="80" height="9" rx="3" />
    </>
  ),
  11: (
    <>
      <path d="M16 72C16 46 30 34 52 34 74 34 84 48 84 72Z" />
      <path d="M58 36C64 18 78 8 94 6 86 16 80 26 76 40Z" />
      <rect x="12" y="76" width="76" height="10" rx="3" />
      <circle cx="40" cy="56" r="5" fill="var(--kc-paper)" />
    </>
  ),
};

export const Card = memo(function Card({ card, className = "", style, ...rest }) {
  const { s, r } = card;
  const label = rankLabel(r);
  return (
    <div className={`kc-card kc-face ${isRed(s) ? "is-red" : "is-black"}${r === 8 ? " is-eight" : ""} ${className}`} style={style} aria-label={cardName(card)} {...rest}>
      <span className="kc-idx kc-idx--tl"><b>{label}</b><Suit s={s} /></span>
      <span className="kc-idx kc-idx--br"><b>{label}</b><Suit s={s} /></span>
      <div className="kc-field">
        {PIPS[r]?.map(([x, y], k) => (
          <Suit key={k} s={s} className={`kc-pip${y > 50 ? " is-flip" : ""}`} style={{ left: `${x}%`, top: `${y}%` }} />
        ))}
        {r === 1 && (
          <div className="kc-ace">
            <Suit s={s} />
          </div>
        )}
        {r > 10 && (
          <div className="kc-court">
            <svg viewBox="0 0 100 100" className="kc-crest" aria-hidden="true">{CREST[r]}</svg>
            <Suit s={s} className="kc-court__suit" />
            <span className="kc-court__letter">{label}</span>
          </div>
        )}
      </div>
      {r === 8 && <span className="kc-wild" aria-hidden="true">WILD</span>}
    </div>
  );
});

/** The suit-indicator token ("current suit: Hearts"). */
export function SuitToken({ suit, className = "" }) {
  return (
    <span className={`kc-token ${isRed(suit) ? "is-red" : "is-black"} ${className}`} aria-label={`Current suit: ${SUIT_NAMES[suit]}`}>
      <Suit s={suit} />
    </span>
  );
}

export function CardBack({ className = "", style }) {
  return (
    <div className={`kc-card kc-back ${className}`} style={style} aria-hidden="true">
      <div className="kc-back__medal">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" />
          <path d="M50 14 58 42 86 50 58 58 50 86 42 58 14 50 42 42Z" />
          <circle cx="50" cy="50" r="9" />
        </svg>
      </div>
    </div>
  );
}
