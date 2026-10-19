/**
 * BiddingEngine — the numerical auction ("8 hearts", "10 no trump", …).
 *
 * Armenian Classic auction:
 *  - the player to the dealer's left speaks first, then clockwise;
 *  - a bid is a level (minBid..maxBid, = tens of points the side promises)
 *    plus a strain; suits are equal, so a new bid must raise the level by at
 *    least bidStep (the strain may change, the partner may raise too);
 *  - Kaput (all eight tricks) outranks every numbered bid; after it only
 *    pass / contra are possible;
 *  - a player who passed may bid again later;
 *  - an opponent of the highest bidder may say Contra (×2), which closes the
 *    bidding; the contract side may then answer Recontra (×4);
 *  - three passes after a bid end the auction; four opening passes mean a
 *    redeal.
 * Contra is turn-based here (a player says it on their turn) — the out-of-
 * turn table habit is not modelled, which keeps every action ordered.
 *
 * Actions: { type: "pass" } | { type: "bid", level, strain } |
 *          { type: "kaput", strain } | { type: "contra" } | { type: "recontra" }
 */
import { nextSeat, teamOf } from "./play.js";
import { strainsFor } from "./rules.js";

export function newAuction(dealer) {
  return {
    turn: nextSeat(dealer),
    high: null, // { seat, level, strain, kaput }
    passes: 0, // consecutive passes
    history: [], // { seat, type, level?, strain? }
    stage: "open", // open | contra | done
    mult: 1,
    contraBy: null,
    recontraBy: null,
    askLeft: 0, // contract-side players still to answer a contra
    result: null, // null | "contract" | "redeal"
  };
}

/** Everything `seat` may say now. */
export function legalBids(a, seat, rules) {
  const out = { pass: false, bids: [], kaput: [], contra: false, recontra: false };
  if (a.stage === "done" || a.turn !== seat) return out;
  out.pass = true;
  if (a.stage === "contra") {
    out.recontra = rules.allowRecontra && !!a.high && teamOf(a.high.seat) === teamOf(seat);
    return out;
  }
  const strains = strainsFor(rules);
  if (!a.high || !a.high.kaput) {
    const from = a.high ? a.high.level + rules.bidStep : rules.minBid;
    for (let lv = from; lv <= rules.maxBid; lv += rules.bidStep) for (const s of strains) out.bids.push({ level: lv, strain: s });
    if (rules.allowKaput) out.kaput = strains.slice();
  }
  out.contra = rules.allowContra && !!a.high && teamOf(a.high.seat) !== teamOf(seat);
  return out;
}

export function isLegalBid(a, seat, action, rules) {
  const lb = legalBids(a, seat, rules);
  if (!action || typeof action !== "object") return false;
  switch (action.type) {
    case "pass": return lb.pass;
    case "bid": return lb.bids.some((b) => b.level === action.level && b.strain === action.strain);
    case "kaput": return lb.kaput.includes(action.strain);
    case "contra": return lb.contra;
    case "recontra": return lb.recontra;
    default: return false;
  }
}

/** Next seat (clockwise from `from`) on the contract side. */
const nextOfTeam = (from, team) => { let s = nextSeat(from); while (teamOf(s) !== team) s = nextSeat(s); return s; };

/**
 * Applies one action. Returns { auction } or { error }. When the auction is
 * over, auction.result is "contract" (see contractOf) or "redeal".
 */
export function applyBid(a, seat, action, rules) {
  if (a.stage === "done") return { error: "auction-over" };
  if (seat !== a.turn) return { error: "not-your-turn" };
  if (!isLegalBid(a, seat, action, rules)) return { error: "illegal-bid" };
  const n = { ...a, history: a.history.concat([{ seat, ...action }]) };
  if (a.stage === "contra") {
    if (action.type === "recontra") {
      return { auction: { ...n, mult: rules.recontraMult, recontraBy: seat, stage: "done", result: "contract", turn: null } };
    }
    // pass: the other contract-side player may still answer
    const left = a.askLeft - 1;
    if (left <= 0) return { auction: { ...n, stage: "done", result: "contract", turn: null, askLeft: 0 } };
    return { auction: { ...n, askLeft: left, turn: nextOfTeam(seat, teamOf(a.high.seat)) } };
  }
  switch (action.type) {
    case "pass": {
      const passes = a.passes + 1;
      if (!a.high && passes >= 4) return { auction: { ...n, passes, stage: "done", result: "redeal", turn: null } };
      if (a.high && passes >= 3) return { auction: { ...n, passes, stage: "done", result: "contract", turn: null } };
      return { auction: { ...n, passes, turn: nextSeat(seat) } };
    }
    case "bid":
      return { auction: { ...n, passes: 0, high: { seat, level: action.level, strain: action.strain, kaput: false }, turn: nextSeat(seat) } };
    case "kaput":
      return { auction: { ...n, passes: 0, high: { seat, level: rules.maxBid + 1, strain: action.strain, kaput: true }, turn: nextSeat(seat) } };
    case "contra": {
      const team = teamOf(a.high.seat);
      if (!rules.allowRecontra) return { auction: { ...n, mult: rules.contraMult, contraBy: seat, stage: "done", result: "contract", turn: null } };
      return { auction: { ...n, mult: rules.contraMult, contraBy: seat, stage: "contra", askLeft: 2, turn: nextOfTeam(seat, team) } };
    }
    default:
      return { error: "illegal-bid" };
  }
}

/** The contract decided by a finished auction. */
export function contractOf(a, rules) {
  if (a.result !== "contract" || !a.high) return null;
  const h = a.high;
  return {
    seat: h.seat,
    team: teamOf(h.seat),
    level: h.kaput ? null : h.level,
    kaput: h.kaput,
    strain: h.strain,
    mult: a.mult,
    target: h.kaput ? null : h.level * 10, // raw points the contract side must reach
    value: h.kaput ? rules.kaputBid : h.level, // contract value in small points
  };
}
