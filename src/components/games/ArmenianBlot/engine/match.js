/**
 * MatchEngine — the single authoritative game state and its transitions.
 *
 * A match is plain JSON (saved as-is). Every transition is a pure function
 * returning { match } or { error }; randomness (decks) is passed in by the
 * caller. `match.seq` grows with every transition so controllers can drop
 * stale or duplicate actions.
 *
 * Hand phases:  bidding → (redeal | play) → trickEnd → play … → scored
 * Match:        over = null until a side reaches the target with a lead.
 */
import { deal, validDeck, isCard, suitOf } from "./deck.js";
import { makeRules, validRules, isSuitStrain } from "./rules.js";
import { newAuction, applyBid, contractOf } from "./bidding.js";
import { legalMovesWhy, winningIndex, trickPoints, nextSeat, teamOf } from "./play.js";
import { detectDeclarations, resolveDeclarations, beloteHolder, isBeloteCard, declName } from "./declarations.js";
import { scoreHand, matchWinner } from "./scoring.js";
import { LAST_TRICK_BONUS } from "./rules.js";

export const MATCH_VERSION = 1;
export const HUMAN = 0;
export const MODES = ["classic", "quick", "practice"];
export const DIFFICULTIES = ["easy", "medium", "hard"];

/* ------------------------------------------------------------ creation */

export function newMatch({ rules, mode = "classic", difficulty = "medium", target, deck, dealer = 3, id = 1 }) {
  const r = rules && validRules(rules) ? rules : makeRules();
  const m = {
    v: MATCH_VERSION,
    id,
    rules: r,
    mode: MODES.includes(mode) ? mode : "classic",
    difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : "medium",
    target: Number.isFinite(target) && target > 0 ? target : r.targets.standard,
    scores: [0, 0],
    handNo: 0,
    redeals: 0,
    history: [],
    over: null,
    seq: 0,
    hand: null,
  };
  return startHand(m, deck, dealer);
}

function startHand(m, deck, dealer) {
  const hands = deal(deck, dealer, m.rules.dealPattern);
  const auction = newAuction(dealer);
  return {
    ...m,
    seq: m.seq + 1,
    handNo: m.handNo + 1,
    hand: {
      dealer,
      deck: deck.slice(),
      hands,
      phase: "bidding",
      auction,
      turn: auction.turn,
      contract: null,
      leader: null,
      trick: [],
      tricks: [],
      cards: [0, 0],
      won: [0, 0],
      decls: null, // per seat, detected when the contract is set
      announced: [false, false, false, false],
      declResult: null,
      belote: { seat: null, played: 0 },
      events: [],
      evn: 0,
      result: null,
    },
  };
}

const ev = (h, e) => ({ events: h.events.concat([{ n: h.evn + 1, ...e }]).slice(-64), evn: h.evn + 1 });

/* ------------------------------------------------------------ bidding */

export function bid(m, seat, action) {
  const h = m.hand;
  if (m.over) return { error: "match-over" };
  if (h.phase !== "bidding") return { error: "not-bidding" };
  const r = applyBid(h.auction, seat, action, m.rules);
  if (r.error) return r;
  const a = r.auction;
  let nh = { ...h, auction: a, turn: a.turn, ...ev(h, { type: "bid", seat, action }) };
  if (a.result === "redeal") {
    nh = { ...nh, phase: "redeal", turn: null };
  } else if (a.result === "contract") {
    const contract = contractOf(a, m.rules);
    const strain = contract.strain;
    const decls = h.hands.map((hd) => detectDeclarations(hd, strain, m.rules));
    const leader = m.rules.firstLead === "declarer" ? contract.seat : nextSeat(h.dealer);
    nh = {
      ...nh,
      phase: "play",
      contract,
      decls,
      leader,
      turn: leader,
      belote: { seat: beloteHolder(h.hands, strain, m.rules), played: 0 },
      ...ev(nh, { type: "contract", seat: contract.seat, contract }),
    };
  }
  return { match: { ...m, seq: m.seq + 1, hand: nh } };
}

/** After four opening passes: redeal with a fresh deck. */
export function redeal(m, deck) {
  if (m.hand.phase !== "redeal") return { error: "no-redeal" };
  const dealer = m.rules.allPass === "sameDealer" ? m.hand.dealer : nextSeat(m.hand.dealer);
  const n = startHand({ ...m, handNo: m.handNo - 1, redeals: m.redeals + 1 }, deck, dealer);
  return { match: n };
}

/* ------------------------------------------------------------ play */

export function legalFor(m, seat) {
  const h = m.hand;
  if (h.phase !== "play" || h.turn !== seat) return { cards: [], reason: "wait" };
  return legalMovesWhy(h.hands[seat], h.trick, h.contract.strain, seat, m.rules);
}

export function play(m, seat, card) {
  const h = m.hand;
  if (m.over) return { error: "match-over" };
  if (h.phase !== "play") return { error: "not-playing" };
  if (seat !== h.turn) return { error: "not-your-turn" };
  if (!h.hands[seat].includes(card)) return { error: "not-in-hand" };
  if (!legalFor(m, seat).cards.includes(card)) return { error: "illegal-card" };
  const strain = h.contract.strain;
  const hands = h.hands.slice();
  hands[seat] = hands[seat].filter((c) => c !== card);
  const trick = h.trick.concat([{ seat, card }]);
  let nh = { ...h, hands, trick, ...ev(h, { type: "play", seat, card }) };

  // declarations are announced with the first card of the hand
  if (h.tricks.length === 0 && !h.announced[seat]) {
    const announced = h.announced.slice();
    announced[seat] = true;
    nh = { ...nh, announced };
    const ds = h.decls[seat];
    if (ds.length) nh = { ...nh, ...ev(nh, { type: "declare", seat, decls: ds.map((d) => ({ name: declName(d), value: d.value, kind: d.kind, len: d.len })) }) };
  }
  // Belote on the first of trump K/Q played by its holder, Rebelote on the second
  if (h.belote.seat === seat && isBeloteCard(card, strain)) {
    const played = h.belote.played + 1;
    nh = { ...nh, belote: { ...h.belote, played }, ...ev(nh, { type: played === 1 ? "belote" : "rebelote", seat }) };
  }

  if (trick.length === 4) {
    const wi = winningIndex(trick, strain);
    nh = { ...nh, phase: "trickEnd", turn: null, pendingWinner: trick[wi].seat };
  } else {
    nh = { ...nh, turn: nextSeat(seat) };
  }
  return { match: { ...m, seq: m.seq + 1, hand: nh } };
}

/** Resolves the full trick on the table (after the UI has shown it). */
export function collect(m) {
  const h = m.hand;
  if (h.phase !== "trickEnd") return { error: "no-trick" };
  const strain = h.contract.strain;
  const winner = trickWinnerOf(h.trick, strain);
  const t = teamOf(winner);
  const last = h.tricks.length === 7;
  const pts = trickPoints(h.trick, strain) + (last ? LAST_TRICK_BONUS : 0);
  const cards = h.cards.slice();
  cards[t] += pts;
  const won = h.won.slice();
  won[t] += 1;
  const tricks = h.tricks.concat([{ leader: h.trick[0].seat, cards: h.trick, winner, points: pts, last }]);
  let nh = { ...h, cards, won, tricks, trick: [], pendingWinner: undefined, ...ev(h, { type: "trick", seat: winner, points: pts, no: tricks.length }) };
  delete nh.pendingWinner;

  if (tricks.length === 1) {
    const dr = resolveDeclarations(h.decls, strain, h.leader, m.rules);
    nh = { ...nh, declResult: dr };
    if (dr.team != null || dr.tie) nh = { ...nh, ...ev(nh, { type: "declResult", team: dr.team, points: dr.points, tie: dr.tie }) };
  }

  if (!last) {
    return { match: { ...m, seq: m.seq + 1, hand: { ...nh, phase: "play", leader: winner, turn: winner } } };
  }

  const beloteTeam = h.belote.seat != null && h.belote.played >= 2 ? teamOf(h.belote.seat) : null;
  const result = scoreHand({ contract: h.contract, cards, tricks: won, decl: nh.declResult || { team: null, points: [0, 0] }, beloteTeam }, m.rules);
  const scores = [m.scores[0] + result.score[0], m.scores[1] + result.score[1]];
  const record = {
    handNo: m.handNo,
    dealer: h.dealer,
    contract: h.contract,
    made: result.made,
    capotTeam: result.capotTeam,
    raw: result.raw,
    score: result.score,
    tricks: won,
    totals: scores,
  };
  const winnerTeam = matchWinner(scores, m.target);
  nh = { ...nh, phase: "scored", turn: null, result, ...ev(nh, { type: "scored", made: result.made }) };
  return {
    match: {
      ...m,
      seq: m.seq + 1,
      scores,
      history: m.history.concat([record]).slice(-60),
      over: winnerTeam == null ? null : { winner: winnerTeam, scores },
      hand: nh,
    },
  };
}

const trickWinnerOf = (trick, strain) => trick[winningIndex(trick, strain)].seat;

export function nextHand(m, deck) {
  if (m.hand.phase !== "scored") return { error: "hand-not-finished" };
  if (m.over) return { error: "match-over" };
  return { match: startHand(m, deck, nextSeat(m.hand.dealer)) };
}

/* ------------------------------------------------------------ public view (what an AI may know) */

/**
 * Everything `seat` is allowed to know: its own hand plus public facts.
 * Other hands are reduced to their sizes. Declaration cards become public
 * only for the side that won the comparison (they are shown on the table).
 */
export function viewFor(m, seat) {
  const h = m.hand;
  const shown = [[], [], [], []];
  if (h.declResult && h.declResult.team != null) {
    for (let s = 0; s < 4; s++) if (teamOf(s) === h.declResult.team) shown[s] = h.decls[s].flatMap((d) => d.cards);
  }
  const announced = [0, 1, 2, 3].map((s) => (h.announced[s] && h.decls ? h.decls[s].map((d) => ({ kind: d.kind, len: d.len, value: d.value })) : []));
  return {
    seat,
    hand: h.hands[seat].slice(),
    handSizes: h.hands.map((x) => x.length),
    rules: m.rules,
    difficulty: m.difficulty,
    dealer: h.dealer,
    phase: h.phase,
    auction: { history: h.auction.history.slice(), high: h.auction.high, stage: h.auction.stage, mult: h.auction.mult, turn: h.auction.turn, passes: h.auction.passes, askLeft: h.auction.askLeft, contraBy: h.auction.contraBy },
    contract: h.contract,
    leader: h.leader,
    turn: h.turn,
    trick: h.trick.slice(),
    tricks: h.tricks.map((t) => ({ leader: t.leader, cards: t.cards.slice(), winner: t.winner })),
    cards: h.cards.slice(),
    won: h.won.slice(),
    announced,
    shown,
    declResult: h.declResult ? { team: h.declResult.team, points: h.declResult.points.slice(), tie: h.declResult.tie } : null,
    belote: { seat: h.belote.played > 0 ? h.belote.seat : null, played: h.belote.played },
    scores: m.scores.slice(),
    target: m.target,
  };
}

/* ------------------------------------------------------------ save validation */

/** Returns null when the match is internally consistent, else a reason string. */
export function validateMatch(m) {
  try {
    if (!m || typeof m !== "object") return "no-match";
    if (m.v !== MATCH_VERSION) return "version";
    if (!validRules(m.rules)) return "rules";
    if (!MODES.includes(m.mode) || !DIFFICULTIES.includes(m.difficulty)) return "mode";
    if (!Array.isArray(m.scores) || m.scores.length !== 2 || !m.scores.every(Number.isFinite)) return "scores";
    if (!Number.isFinite(m.target) || m.target <= 0) return "target";
    const h = m.hand;
    if (!h || !validDeck(h.deck)) return "deck";
    if (![0, 1, 2, 3].includes(h.dealer)) return "dealer";
    const all = [];
    for (const hd of h.hands) { if (!Array.isArray(hd) || !hd.every(isCard)) return "hands"; all.push(...hd); }
    for (const p of h.trick) all.push(p.card);
    for (const t of h.tricks) { if (t.cards.length !== 4) return "tricks"; for (const p of t.cards) all.push(p.card); }
    if (all.length !== 32 || new Set(all).size !== 32) return "cards";
    const played = h.tricks.length;
    for (let s = 0; s < 4; s++) {
      const inTrick = h.trick.some((p) => p.seat === s) ? 1 : 0;
      if (h.hands[s].length !== 8 - played - inTrick) return "hand-size";
    }
    if (h.tricks.length > 8 || h.trick.length > 4) return "trick-count";
    if (!["bidding", "redeal", "play", "trickEnd", "scored"].includes(h.phase)) return "phase";
    if (h.phase === "bidding" && ![0, 1, 2, 3].includes(h.turn)) return "turn";
    if (h.phase === "play") {
      if (!h.contract || ![0, 1, 2, 3].includes(h.turn)) return "turn";
      if (h.trick.length && h.turn !== (h.trick[h.trick.length - 1].seat + 1) % 4) return "turn-order";
    }
    if (h.phase === "trickEnd" && h.trick.length !== 4) return "trick-end";
    if (h.phase !== "bidding" && h.phase !== "redeal" && h.contract && !(isSuitStrain(h.contract.strain) || h.contract.strain === "NT" || h.contract.strain === "AT")) return "strain";
    const sumCards = h.cards[0] + h.cards[1];
    const expect = h.tricks.reduce((t, x) => t + x.points, 0);
    if (sumCards !== expect) return "points";
    if (h.tricks.some((t) => suitOf(t.cards[0].card) < 0)) return "tricks";
    return null;
  } catch {
    return "exception";
  }
}
