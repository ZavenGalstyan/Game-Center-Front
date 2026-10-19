/**
 * Visual primitives: SVG suits, playing cards (CSS 3D flip), chip stacks and
 * avatars. Purely presentational — amounts and cards come from engine state.
 */
import { rankOf, suitOf, RANK_LABELS, SUIT_NAMES } from "../engine/cards.js";

const SUIT_PATHS = {
  2: <path d="M50 90C22 68 6 51 6 32 6 17 17 7 30 7c9 0 16 5 20 13C54 12 61 7 70 7c13 0 24 10 24 25 0 19-16 36-44 58z" />,
  1: <path d="M50 4 88 50 50 96 12 50z" />,
  3: <path d="M50 5C36 25 8 39 8 60c0 13 10 22 22 22 7 0 13-3 16-8-1 10-5 16-13 21h34c-8-5-12-11-13-21 3 5 9 8 16 8 12 0 22-9 22-22C92 39 64 25 50 5z" />,
  0: (
    <>
      <circle cx="50" cy="28" r="19" />
      <circle cx="27" cy="58" r="19" />
      <circle cx="73" cy="58" r="19" />
      <path d="M45 50h10c0 22 4 33 15 45H30c11-12 15-23 15-45z" />
    </>
  ),
};

export function Suit({ suit, className = "" }) {
  return (
    <svg className={`thp-suit ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      {SUIT_PATHS[suit]}
    </svg>
  );
}

const FACE_TITLES = { 11: "J", 12: "Q", 13: "K" };

function Face({ card }) {
  const r = rankOf(card), s = suitOf(card);
  const label = RANK_LABELS[r - 2];
  return (
    <>
      <span className="thp-card__corner">
        <b>{label}</b>
        <Suit suit={s} />
      </span>
      <span className="thp-card__corner thp-card__corner--br" aria-hidden="true">
        <b>{label}</b>
        <Suit suit={s} />
      </span>
      {FACE_TITLES[r] ? (
        <span className="thp-card__court">
          <i className="thp-card__crown" aria-hidden="true" />
          <b>{FACE_TITLES[r]}</b>
          <Suit suit={s} />
        </span>
      ) : (
        <Suit suit={s} className={`thp-card__pip${r === 14 ? " thp-card__pip--ace" : ""}`} />
      )}
    </>
  );
}

/**
 * @param card    card int (null → blank back)
 * @param faceUp  shows the face (flip animates via CSS transition)
 * @param size    sm | md | lg | xs
 * @param anim    "deal" | "flip" | null — entry animation
 */
export function PlayingCard({ card, faceUp = true, size = "md", back = "crimson", className = "", style, anim = null, win = false, dim = false }) {
  const s = card != null ? suitOf(card) : 0;
  const up = faceUp && card != null;
  return (
    <div
      className={`thp-card thp-card--${size} thp-card--s${s}${up ? " is-up" : ""}${anim ? ` thp-anim-${anim}` : ""}${win ? " is-win" : ""}${dim ? " is-dim" : ""} ${className}`}
      style={style}
      role="img"
      aria-label={up ? `${RANK_LABELS[rankOf(card) - 2]} of ${SUIT_NAMES[s]}` : "Face-down card"}
    >
      <div className="thp-card__inner">
        <div className="thp-card__face thp-card__front">{up && <Face card={card} />}</div>
        <div className={`thp-card__face thp-card__back thp-back--${back}`}>
          <span />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ chips */

export const DENOMS = [1000, 500, 100, 25, 5, 1];

/** Greedy break-down of an amount into chip denominations. */
export function chipBreakdown(amount, max = 9) {
  const out = [];
  let left = Math.max(0, Math.floor(amount));
  for (const d of DENOMS) {
    while (left >= d && out.length < max) { out.push(d); left -= d; }
  }
  return out;
}

export const fmt = (n) => Math.round(n).toLocaleString("en-US");
export const fmtShort = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 10000 ? `${(n / 1000).toFixed(n >= 1e5 ? 0 : 1)}K` : fmt(n));

export function Chip({ denom, className = "", style }) {
  return (
    <span className={`thp-chip thp-chip--${denom} ${className}`} style={style}>
      <i />
    </span>
  );
}

/** Stack(s) of chips for an amount, with an optional label. */
export function ChipStack({ amount, label = true, className = "", style, columns = 2 }) {
  const chips = chipBreakdown(amount, 10).reverse(); // small on top
  const cols = Array.from({ length: Math.min(columns, Math.ceil(chips.length / 5) || 1) }, () => []);
  chips.forEach((c, i) => cols[Math.min(cols.length - 1, Math.floor(i / 5))].push(c));
  return (
    <div className={`thp-stack ${className}`} style={style}>
      <div className="thp-stack__chips">
        {cols.map((col, k) => (
          <span className="thp-stack__col" key={k}>
            {col.map((d, i) => <Chip key={i} denom={d} style={{ "--i": i }} />)}
          </span>
        ))}
      </div>
      {label && <span className="thp-stack__label">{fmt(amount)}</span>}
    </div>
  );
}

/* ------------------------------------------------------------ avatar */

export function Avatar({ name, color = "#888", frame = null, human = false, children }) {
  const initials = name.slice(0, 1).toUpperCase();
  return (
    <span className={`thp-avatar${human ? " is-human" : ""}${frame ? ` thp-frame--${frame}` : ""}`} style={{ "--av": color }}>
      <span className="thp-avatar__disc">
        {human ? (
          <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="15" r="7.5" /><path d="M6 36c1.5-8 7-12 14-12s12.5 4 14 12z" /></svg>
        ) : (
          <b>{initials}</b>
        )}
      </span>
      {children}
    </span>
  );
}
