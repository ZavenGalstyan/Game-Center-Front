/**
 * Trump Masters card art — original SVG suit glyphs, pip layouts and court
 * monograms, drawn in DOM/CSS so cards stay crisp at any size.
 */
import { RED, rankLabel } from "./engine.js";

const SUIT_PATH = {
  H: "M50 90C22 68 6 50 6 31 6 16 18 6 31 6c9 0 15 5 19 12 4-7 10-12 19-12 13 0 25 10 25 25 0 19-16 37-44 59z",
  D: "M50 4C61 22 74 37 90 50 74 63 61 78 50 96 39 78 26 63 10 50 26 37 39 22 50 4z",
  S: "M50 4C36 24 8 38 8 60c0 13 10 22 22 22 7 0 13-3 17-9-1 9-5 16-12 22h30c-7-6-11-13-12-22 4 6 10 9 17 9 12 0 22-9 22-22 0-22-28-36-42-56z",
  C: "M50 6a19 19 0 0 1 17 28 19 19 0 1 1 1 36c-6 0-11-3-15-7 1 11 5 19 12 27H35c7-8 11-16 12-27-4 4-9 7-15 7a19 19 0 1 1 1-36A19 19 0 0 1 50 6z",
};

export function Suit({ s, className = "" }) {
  return (
    <svg className={`tm-suit ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <path d={SUIT_PATH[s]} />
    </svg>
  );
}

// pip centres in % of the inner field; y > 50 pips are drawn upside-down
const L = 22, R = 78, M = 50;
const PIPS = {
  6: [[L, 12], [R, 12], [L, 50], [R, 50], [L, 88], [R, 88]],
  7: [[L, 12], [R, 12], [M, 31], [L, 50], [R, 50], [L, 88], [R, 88]],
  8: [[L, 12], [R, 12], [M, 31], [L, 50], [R, 50], [M, 69], [L, 88], [R, 88]],
  9: [[L, 12], [R, 12], [L, 37], [R, 37], [M, 50], [L, 63], [R, 63], [L, 88], [R, 88]],
  10: [[L, 12], [R, 12], [M, 25], [L, 37], [R, 37], [L, 63], [R, 63], [M, 75], [L, 88], [R, 88]],
};
const COURT = { 11: "Knight", 12: "Queen", 13: "King" };

function Crown({ r }) {
  // three simple original ornaments: J = plume, Q = tiara, K = crown
  const d = r === 13
    ? "M8 40 4 12l16 14L32 4l12 22L60 12l-4 28z"
    : r === 12
      ? "M6 40C10 26 14 18 20 14c2 8 6 12 12 12s10-4 12-12c6 4 10 12 14 26z"
      : "M18 40c0-14 4-26 14-36 2 10 10 14 10 24 0 6-2 10-4 12z";
  return (
    <svg className="tm-crown" viewBox="0 0 64 44" aria-hidden="true">
      <path d={d} />
      <rect x="6" y="38" width="52" height="5" rx="2" />
    </svg>
  );
}

export const cardName = (c) => `${rankLabel(c.r)} of ${{ S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" }[c.s]}`;

export function Card({ card, className = "", style, onClick, ...rest }) {
  const label = rankLabel(card.r);
  const tone = RED[card.s] ? "is-red" : "is-black";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={`tm-card ${tone} ${className}`} style={style} onClick={onClick} aria-label={cardName(card)} {...rest}>
      <span className="tm-idx">
        <b>{label}</b>
        <Suit s={card.s} />
      </span>
      <span className="tm-idx tm-idx--br">
        <b>{label}</b>
        <Suit s={card.s} />
      </span>
      <span className="tm-field">
        {PIPS[card.r]?.map(([x, y], k) => (
          <span key={k} className={`tm-pip${y > 50 ? " is-flip" : ""}`} style={{ left: `${x}%`, top: `${y}%` }}>
            <Suit s={card.s} />
          </span>
        ))}
        {card.r === 14 && (
          <span className="tm-ace">
            <Suit s={card.s} />
          </span>
        )}
        {COURT[card.r] && (
          <span className="tm-court">
            <Crown r={card.r} />
            <b>{label}</b>
            <Suit s={card.s} />
          </span>
        )}
      </span>
    </Tag>
  );
}

export function CardBack({ className = "", style }) {
  return (
    <div className={`tm-card tm-back ${className}`} style={style} aria-hidden="true">
      <span className="tm-back__emblem">
        <Suit s="S" />
      </span>
    </div>
  );
}
