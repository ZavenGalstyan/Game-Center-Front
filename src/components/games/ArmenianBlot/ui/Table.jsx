/**
 * The card table: walnut rail, emerald felt, four seats (you at the
 * bottom, your partner on top, opponents left and right), the hands, the
 * trick in the centre and the dealing deck. Purely presentational — every
 * fact comes from the match state, every action goes back through props.
 */
import { memo } from "react";
import { suitOf, sortHand, SUIT_SYMBOLS } from "../engine/deck.js";
import { strength, isSuitStrain, NT, AT } from "../engine/rules.js";
import { teamOf, winningIndex } from "../engine/play.js";
import { CardFace, CardBackArt, Avatar, Suit, EternityPath, PomegranatePath, STAR8 } from "./art.jsx";

const SEAT_CLASS = ["bottom", "left", "top", "right"];
// where cards come from / go to, relative to the table centre (cqw)
export const SEAT_VEC = [[0, 17], [-34, 0], [0, -17], [34, 0]];

export function StrainIcon({ strain, t, big = false }) {
  if (isSuitStrain(strain)) return <Suit suit={strain} className={big ? "ab-suit--big" : ""} />;
  return <span className={`ab-strain-txt${big ? " is-big" : ""}`}>{strain === NT ? t("noTrumpShort") : t("allTrumpShort")}</span>;
}

export function strainName(strain, t) {
  if (strain === NT) return t("noTrump");
  if (strain === AT) return t("allTrump");
  return t(`suit${strain}`);
}

export function BidLabel({ action, t }) {
  if (!action) return null;
  switch (action.type) {
    case "pass": return <span className="ab-bidlbl is-pass">{t("pass")}</span>;
    case "contra": return <span className="ab-bidlbl is-contra">{t("contra")}</span>;
    case "recontra": return <span className="ab-bidlbl is-contra">{t("recontra")}</span>;
    case "kaput": return <span className="ab-bidlbl">{t("kaput")} <StrainIcon strain={action.strain} t={t} /></span>;
    default: return <span className="ab-bidlbl"><b>{action.level}</b> <StrainIcon strain={action.strain} t={t} /></span>;
  }
}

export function ContractLabel({ c, t }) {
  if (!c) return null;
  return (
    <span className="ab-bidlbl">
      {c.kaput ? t("kaput") : <b>{c.level}</b>} <StrainIcon strain={c.strain} t={t} />
      {c.mult === 2 && <em className="ab-mult">×2</em>}
      {c.mult === 4 && <em className="ab-mult">×4</em>}
    </span>
  );
}

/* ------------------------------------------------------------ felt decoration */

const TableSurface = memo(function TableSurface() {
  return (
    <div className="ab-table" aria-hidden="true">
      <div className="ab-rail">
        <svg className="ab-rail__inlay" viewBox="0 0 1000 540" preserveAspectRatio="none">
          <rect x="16" y="16" width="968" height="508" rx="150" fill="none" stroke="var(--gold)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" opacity=".85" />
          <rect x="24" y="24" width="952" height="492" rx="142" fill="none" stroke="var(--gold)" strokeWidth="1" strokeDasharray="3 7" vectorEffect="non-scaling-stroke" opacity=".55" />
        </svg>
      </div>
      <div className="ab-felt">
        <div className="ab-felt__light" />
        <svg className="ab-felt__border" viewBox="0 0 1000 500" preserveAspectRatio="none">
          <rect x="22" y="22" width="956" height="456" rx="118" fill="none" stroke="var(--felt-line)" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
          <rect x="34" y="34" width="932" height="432" rx="108" fill="none" stroke="var(--felt-line)" strokeWidth="1" strokeDasharray="2 9" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* the centre medallion stays faint so the trick area remains clean */}
        <svg className="ab-felt__medal" viewBox="-60 -60 120 120">
          <circle r="54" fill="none" stroke="var(--felt-line)" strokeWidth=".8" />
          <circle r="47" fill="none" stroke="var(--felt-line)" strokeWidth=".5" strokeDasharray="1 3" />
          <EternityPath r={34} fill="var(--felt-line)" />
        </svg>
      </div>
      {/* small pomegranate ornaments on the rail corners */}
      {["tl", "tr", "bl", "br"].map((k) => (
        <svg key={k} className={`ab-corner ab-corner--${k}`} viewBox="-50 -50 100 100">
          <g transform="scale(.8)"><PomegranatePath fill="var(--gold)" seed="var(--burgundy)" leaf="var(--gold-dk)" /></g>
        </svg>
      ))}
      {["l", "r"].map((k) => (
        <svg key={k} className={`ab-railstar ab-railstar--${k}`} viewBox="-12 -12 24 24">
          <path d={STAR8} fill="var(--gold)" />
        </svg>
      ))}
    </div>
  );
});

/* ------------------------------------------------------------ seats */

function Nameplate({ seat, m, t, thinking, lastBid, bidding }) {
  const h = m.hand;
  const isTurn = h.turn === seat && (h.phase === "bidding" || h.phase === "play");
  const c = h.contract;
  const team = teamOf(seat);
  const role = seat === 0 ? t("teamAFull") : t(`seatRole${seat}`);
  return (
    <div className={`ab-seat ab-seat--${SEAT_CLASS[seat]}${isTurn ? " is-turn" : ""} ab-team--${team ? "b" : "a"}`} data-seat={seat}>
      <div className="ab-avatar">
        <Avatar seat={seat} initial={t(`seat${seat}`).slice(0, 1)} />
        {h.dealer === seat && <span className="ab-dealer" title={t("dealer")}>D</span>}
      </div>
      <div className="ab-seat__txt">
        <b className="ab-seat__name">{t(`seat${seat}`)}</b>
        <small className="ab-seat__role"><i className="ab-teamdot" />{role}</small>
        <small className="ab-seat__meta">
          {t("cardsLeft", { n: h.hands[seat].length })}
          {c && c.seat === seat && <span className="ab-seat__contract"><ContractLabel c={c} t={t} /></span>}
        </small>
      </div>
      {isTurn && thinking && <span className="ab-seat__think">{t("thinking")}</span>}
      {bidding && lastBid && <div className="ab-bubble"><BidLabel action={lastBid} t={t} /></div>}
    </div>
  );
}

function OppHand({ seat, count, back, dealKey, dealing, step }) {
  const cards = [];
  for (let i = 0; i < count; i++) {
    const order = i * 4 + ((seat + 3) % 4);
    cards.push(
      <div key={i} className={`ab-card ab-card--back${dealing ? " is-dealing" : ""}`} style={{ "--i": i, "--n": count, "--d": `${order * step}ms` }}>
        <CardBackArt back={back} />
      </div>,
    );
  }
  return <div key={dealKey} className={`ab-ohand ab-ohand--${SEAT_CLASS[seat]}`} style={{ "--n": count }}>{cards}</div>;
}

function HumanHand({ m, legal, selected, onCard, hintCard, dealKey, dealing, step, canAct }) {
  const h = m.hand;
  const strain = h.contract ? h.contract.strain : NT;
  const hand = sortHand(h.hands[0], (c) => strength(c, strain) + (h.contract && isSuitStrain(strain) && suitOf(c) === strain ? 20 : 0));
  const n = hand.length;
  return (
    <div key={dealKey} className={`ab-hhand${canAct ? " is-active" : ""}`} style={{ "--n": n }} role="group" aria-label="Your cards">
      {hand.map((c, i) => {
        const isLegal = legal ? legal.has(c) : false;
        const cls = ["ab-card", "ab-card--face", "ab-hcard"];
        if (canAct) cls.push(isLegal ? "is-legal" : "is-illegal");
        if (selected === c) cls.push("is-selected");
        if (hintCard === c) cls.push("is-hint");
        if (dealing) cls.push("is-dealing");
        if (h.contract && isSuitStrain(strain) && suitOf(c) === strain) cls.push("is-trump");
        const order = i * 4 + 3;
        return (
          <button
            type="button"
            key={c}
            className={cls.join(" ")}
            style={{ "--i": i, "--n": n, "--d": `${order * step}ms` }}
            disabled={!canAct || !isLegal}
            aria-pressed={selected === c}
            aria-label={cardAria(c)}
            data-card={c}
            onClick={() => onCard(c)}
          >
            <CardFace card={c} />
          </button>
        );
      })}
    </div>
  );
}

const RANK_WORDS = ["7", "8", "9", "10", "Jack", "Queen", "King", "Ace"];
const SUIT_WORDS = ["hearts", "diamonds", "clubs", "spades"];
export const cardAria = (c) => `${RANK_WORDS[c & 7]} of ${SUIT_WORDS[c >> 3]}`;

/* ------------------------------------------------------------ trick */

function Trick({ m, collectMs, holdMs }) {
  const h = m.hand;
  const trick = h.trick;
  if (!trick.length) return null;
  const strain = h.contract.strain;
  const wi = winningIndex(trick, strain);
  const end = h.phase === "trickEnd";
  const winner = trick[wi].seat;
  const [wx, wy] = SEAT_VEC[winner];
  return (
    <div className={`ab-trick${end ? " is-end" : ""}`} style={{ "--hold": `${holdMs}ms`, "--coll": `${collectMs}ms`, "--wx": `${wx * 1.1}cqw`, "--wy": `${wy * 1.25}cqw` }}>
      {trick.map((p, k) => {
        const [fx, fy] = SEAT_VEC[p.seat];
        return (
          <div
            key={p.card}
            className={`ab-card ab-card--face ab-tcard ab-tcard--${SEAT_CLASS[p.seat]}${k === wi ? " is-winning" : ""}`}
            style={{ "--fx": `${fx}cqw`, "--fy": `${fy}cqw`, "--z": k }}
            aria-label={cardAria(p.card)}
          >
            <CardFace card={p.card} />
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ table */

export default function Table({ m, t, back, legal, selected, onCard, hintCard, thinkingSeat, dealing, dealKey, speedK, canAct }) {
  const h = m.hand;
  const step = Math.round(38 * speedK);
  const bidding = h.phase === "bidding" || h.phase === "redeal";
  const lastBid = [null, null, null, null];
  for (const a of h.auction.history) lastBid[a.seat] = a;
  return (
    <div className="ab-tablewrap">
      <TableSurface />
      {dealing && (
        <div className="ab-deck" aria-hidden="true" style={{ "--dx": `${SEAT_VEC[h.dealer][0] * 0.55}cqw`, "--dy": `${SEAT_VEC[h.dealer][1] * 0.55}cqw` }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="ab-card ab-card--back ab-deck__c" style={{ "--k": i }}>
              <CardBackArt back={back} />
            </div>
          ))}
        </div>
      )}
      {[1, 2, 3].map((s) => (
        <OppHand key={s} seat={s} count={h.hands[s].length} back={back} dealKey={dealKey} dealing={dealing} step={step} />
      ))}
      <Trick m={m} collectMs={Math.round(420 * speedK)} holdMs={Math.round(820 * speedK)} />
      {[0, 1, 2, 3].map((s) => (
        <Nameplate key={s} seat={s} m={m} t={t} thinking={thinkingSeat === s} lastBid={lastBid[s]} bidding={bidding} />
      ))}
      <HumanHand m={m} legal={legal} selected={selected} onCard={onCard} hintCard={hintCard} dealKey={dealKey} dealing={dealing} step={step} canAct={canAct} />
    </div>
  );
}

export { SUIT_SYMBOLS };
