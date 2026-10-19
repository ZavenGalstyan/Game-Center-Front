/**
 * No-Limit Texas Hold'em table — the single authoritative game state and its
 * explicit transitions. Every function here is pure: it takes a state and
 * returns a new one (plain JSON, so it saves to localStorage as-is).
 *
 * Phases (state.phase):
 *   waiting     no hand in progress (before the first hand)
 *   betting     a betting round is open; state.toAct is the seat to act
 *   street-end  the round is closed; advance() collects bets, returns any
 *               uncalled bet, then deals the next street / goes to showdown /
 *               awards an uncontested pot. During an all-in run-out the
 *               table stays here street after street (state.runout = true).
 *   showdown    live hands are revealed; advance() awards the pots
 *   complete    the hand is over, state.result describes it
 *
 * Posting blinds and dealing hole cards happen inside startHand(); the UI
 * animates them from the resulting state. The engine never waits on the UI:
 * the UI only decides WHEN to call advance(), never WHAT happens.
 *
 * Positions: the button moves one active seat clockwise each hand (players
 * with no chips are skipped). Heads-up, the button posts the small blind and
 * acts first preflop; the big blind acts first after the flop. With three or
 * more players the seat left of the big blind opens preflop and the first
 * active seat left of the button opens every later street.
 *
 * Bets are expressed as "raise to" amounts (the player's total bet for the
 * street). A raise is "full" when its increment is at least the last full
 * bet/raise (minimum bet = big blind). An all-in that raises by less is a
 * short raise: others must still call it, but a player who already acted may
 * only re-raise if the total increase since their last action is at least a
 * full raise (TDA rule) — so a short all-in does not reopen the betting.
 */
import { buildPots, distribute } from "./pots.js";
import { evaluate, scoreHand } from "./evaluator.js";
import { isCard } from "./cards.js";

export const STREETS = ["preflop", "flop", "turn", "river"];
const clone = (s) => JSON.parse(JSON.stringify(s));

/**
 * @param {{players: {id,name,stack,ai?,profile?}[], blinds: {sb,bb}}} cfg
 */
export function createTable({ players, blinds }) {
  return {
    v: 1,
    seq: 0,
    handNo: 0,
    blinds: { sb: blinds.sb, bb: blinds.bb },
    players: players.map((p) => ({
      id: p.id, name: p.name, ai: !!p.ai, profile: p.profile ?? null, diff: p.diff ?? null,
      stack: Math.floor(p.stack), out: !!p.out,
      hole: [], inHand: false, folded: false, allIn: false, revealed: false,
      bet: 0, total: 0, acted: false, actedAt: 0, lastAction: null, startStack: Math.floor(p.stack),
    })),
    dealer: -1, sbSeat: -1, bbSeat: -1,
    deck: [], deckPos: 0, board: [], burned: [],
    street: null, phase: "waiting", toAct: -1,
    currentBet: 0, minRaise: 0, lastAggressor: -1, runout: false,
    actions: [], result: null,
  };
}

/* ------------------------------------------------------------ helpers */

export const live = (s) => s.players.map((p, i) => i).filter((i) => s.players[i].inHand && !s.players[i].folded);
export const potTotal = (s) => s.players.reduce((a, p) => a + p.total, 0);
/** Chips already gathered in the middle (excludes this street's open bets). */
export const potCollected = (s) => s.players.reduce((a, p) => a + p.total - p.bet, 0);
/** Every chip at the table: stacks + chips committed to an unfinished hand. */
export const chipsAtTable = (s) => s.players.reduce((a, p) => a + p.stack + (s.phase === "complete" || s.phase === "waiting" ? 0 : p.total), 0);

function nextSeat(s, from, pred) {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (((from + k) % n) + n) % n;
    if (pred(s.players[i], i)) return i;
  }
  return -1;
}

export function needsToAct(s, i) {
  const p = s.players[i];
  return p.inHand && !p.folded && !p.allIn && (!p.acted || p.bet < s.currentBet);
}

/** True when no further betting decision exists this street. */
export function bettingClosed(s) {
  const l = live(s);
  if (l.length <= 1) return true;
  const canAct = l.filter((i) => !s.players[i].allIn);
  if (canAct.length === 0) return true;
  if (canAct.length === 1 && s.players[canAct[0]].bet >= s.currentBet) return true;
  return !s.players.some((_, i) => needsToAct(s, i));
}

function put(p, amount) {
  const a = Math.min(amount, p.stack);
  p.stack -= a;
  p.bet += a;
  p.total += a;
  if (p.stack === 0) p.allIn = true;
  return a;
}

/* ------------------------------------------------------------ hand start */

/** Seats that can be dealt in (not eliminated, have chips). */
export const activeSeats = (s) => s.players.map((p, i) => i).filter((i) => !s.players[i].out && s.players[i].stack > 0);

/**
 * Starts a new hand: moves the button, posts blinds, deals two cards each
 * (one at a time, starting left of the button) and opens preflop betting.
 * @param deck  a shuffled 52-card array (the caller owns randomness)
 * @param opts  { dealer } — explicit button seat for the first hand
 */
export function startHand(state, deck, opts = {}) {
  const s = clone(state);
  if (s.phase !== "waiting" && s.phase !== "complete") return { state, error: "Hand in progress" };
  if (!Array.isArray(deck) || deck.length !== 52 || new Set(deck).size !== 52 || !deck.every(isCard)) {
    return { state, error: "Invalid deck" };
  }
  const active = activeSeats(s);
  if (active.length < 2) return { state, error: "Not enough players" };

  s.players.forEach((p) => {
    Object.assign(p, {
      hole: [], inHand: false, folded: false, allIn: false, revealed: false,
      bet: 0, total: 0, acted: false, actedAt: 0, lastAction: null, startStack: p.stack,
    });
  });
  active.forEach((i) => { s.players[i].inHand = true; });

  const isActive = (p) => p.inHand;
  if (opts.dealer != null && s.players[opts.dealer]?.inHand) s.dealer = opts.dealer;
  else s.dealer = nextSeat(s, s.dealer < 0 ? -1 : s.dealer, isActive);
  if (active.length === 2) {
    s.sbSeat = s.dealer;
    s.bbSeat = nextSeat(s, s.dealer, isActive);
  } else {
    s.sbSeat = nextSeat(s, s.dealer, isActive);
    s.bbSeat = nextSeat(s, s.sbSeat, isActive);
  }

  s.handNo += 1;
  s.deck = deck.slice();
  s.deckPos = 0;
  s.board = [];
  s.burned = [];
  s.street = "preflop";
  s.runout = false;
  s.actions = [];
  s.result = null;
  s.lastAggressor = -1;

  const { sb, bb } = s.blinds;
  const sbP = s.players[s.sbSeat], bbP = s.players[s.bbSeat];
  sbP.lastAction = { type: "sb", amount: put(sbP, sb) };
  bbP.lastAction = { type: "bb", amount: put(bbP, bb) };
  s.actions.push({ seat: s.sbSeat, type: "sb", amount: sbP.bet, street: "preflop" });
  s.actions.push({ seat: s.bbSeat, type: "bb", amount: bbP.bet, street: "preflop" });
  s.currentBet = bb;
  s.minRaise = bb;

  // two passes, one card at a time, starting left of the button
  const order = [];
  for (let k = 1; k <= s.players.length; k++) {
    const i = (s.dealer + k) % s.players.length;
    if (s.players[i].inHand) order.push(i);
  }
  for (let pass = 0; pass < 2; pass++) for (const i of order) s.players[i].hole.push(s.deck[s.deckPos++]);

  s.phase = "betting";
  s.seq += 1;
  return { state: openRound(s, s.bbSeat), error: null };
}

/** Sets toAct to the first seat after `after` that must act, or closes the round. */
function openRound(s, after) {
  if (bettingClosed(s)) {
    s.phase = "street-end";
    s.toAct = -1;
    const l = live(s);
    // no more decisions possible this hand → hands are tabled and the board runs out
    if (l.length > 1 && l.filter((i) => !s.players[i].allIn).length <= 1) {
      s.runout = true;
      l.forEach((i) => { s.players[i].revealed = true; });
    }
  } else {
    s.phase = "betting";
    s.toAct = nextSeat(s, after, (_, i) => needsToAct(s, i));
  }
  return s;
}

/* ------------------------------------------------------------ actions */

/**
 * What seat i may do right now (null when it is not their turn).
 * Amounts for bet/raise are "raise to" totals for the street.
 */
export function legalActions(s, i) {
  if (s.phase !== "betting" || s.toAct !== i) return null;
  const p = s.players[i];
  const toCall = Math.min(Math.max(0, s.currentBet - p.bet), p.stack);
  const canCheck = p.bet >= s.currentBet;
  const maxTo = p.bet + p.stack;
  const reopened = !p.acted || s.currentBet - p.actedAt >= s.minRaise;
  const othersCanAct = live(s).some((j) => j !== i && !s.players[j].allIn);
  const canRaiseAny = reopened && othersCanAct && maxTo > s.currentBet;
  const opening = s.currentBet === 0;
  const minTo = Math.min(opening ? s.blinds.bb : s.currentBet + s.minRaise, maxTo);
  return {
    seat: i,
    toCall,
    canFold: true,
    canCheck,
    canCall: !canCheck && p.stack > 0,
    callIsAllIn: !canCheck && toCall >= p.stack,
    canBet: opening && canRaiseAny,
    canRaise: !opening && canRaiseAny,
    minTo,
    maxTo,
    canAllIn: p.stack > 0 && (maxTo <= s.currentBet || canRaiseAny),
    currentBet: s.currentBet,
    bet: p.bet,
    stack: p.stack,
    pot: potTotal(s),
  };
}

/**
 * Applies a player action. Returns { state, error } — on error the state is
 * returned unchanged. action = { type: fold|check|call|bet|raise|allin, amount? }
 * (amount = raise-to total for bet/raise).
 */
export function applyAction(state, i, action) {
  const la = legalActions(state, i);
  if (!la) return { state, error: "Not this player's turn" };
  const type = action && action.type;
  const s = clone(state);
  const p = s.players[i];
  let rec;

  const raiseTo = (to) => {
    const inc = to - s.currentBet;
    const wasOpening = s.currentBet === 0;
    put(p, to - p.bet);
    if (inc >= s.minRaise || (wasOpening && to >= s.blinds.bb)) s.minRaise = Math.max(inc, s.blinds.bb);
    s.currentBet = to;
    s.lastAggressor = i;
  };

  switch (type) {
    case "fold":
      p.folded = true;
      rec = { type: "fold", amount: 0 };
      break;
    case "check":
      if (!la.canCheck) return { state, error: "Cannot check — there is a bet to call" };
      rec = { type: "check", amount: 0 };
      break;
    case "call": {
      if (!la.canCall) return { state, error: "Nothing to call" };
      const a = put(p, la.toCall);
      rec = { type: p.allIn ? "allin" : "call", amount: a, to: p.bet };
      break;
    }
    case "bet":
    case "raise": {
      const ok = type === "bet" ? la.canBet : la.canRaise;
      if (!ok) return { state, error: type === "bet" ? "Cannot bet now" : "Cannot raise now" };
      const to = Number(action.amount);
      if (!Number.isFinite(to) || !Number.isInteger(to)) return { state, error: "Invalid amount" };
      if (to > la.maxTo) return { state, error: "Not enough chips" };
      if (to < la.minTo) return { state, error: `Minimum ${type} is ${la.minTo}` };
      if (to <= s.currentBet) return { state, error: "Raise must exceed the current bet" };
      raiseTo(to);
      rec = { type: p.allIn ? "allin" : type, amount: to - la.bet, to };
      break;
    }
    case "allin": {
      if (!la.canAllIn) return { state, error: "Cannot go all-in now" };
      if (la.maxTo <= s.currentBet) put(p, p.stack);
      else raiseTo(la.maxTo);
      rec = { type: "allin", amount: la.stack, to: p.bet };
      break;
    }
    default:
      return { state, error: "Unknown action" };
  }

  p.acted = true;
  p.actedAt = s.currentBet;
  p.lastAction = rec;
  s.actions.push({ seat: i, street: s.street, ...rec });
  s.seq += 1;
  return { state: openRound(s, i), error: null };
}

/** The action taken when a player's turn timer runs out. */
export const timeoutAction = (s, i) => {
  const la = legalActions(s, i);
  return la && la.canCheck ? { type: "check" } : { type: "fold" };
};

/* ------------------------------------------------------------ streets */

function returnUncalled(s) {
  let top = -1;
  s.players.forEach((p, i) => { if (p.bet > 0 && (top < 0 || p.bet > s.players[top].bet)) top = i; });
  if (top < 0) return 0;
  const second = Math.max(0, ...s.players.filter((_, i) => i !== top).map((p) => p.bet));
  const diff = s.players[top].bet - second;
  if (diff <= 0) return 0;
  const p = s.players[top];
  p.stack += diff;
  p.bet -= diff;
  p.total -= diff;
  if (p.stack > 0) p.allIn = false;
  s.actions.push({ seat: top, street: s.street, type: "return", amount: diff });
  return diff;
}

function deal(s, n) {
  s.burned.push(s.deck[s.deckPos++]);
  for (let k = 0; k < n; k++) s.board.push(s.deck[s.deckPos++]);
}

/**
 * Moves a closed round forward by exactly one step:
 *   street-end → (uncontested award → complete) | next street | showdown
 *   showdown   → complete (pots awarded)
 */
export function advance(state) {
  if (state.phase !== "street-end" && state.phase !== "showdown") return { state, error: "Nothing to advance" };
  const s = clone(state);
  s.seq += 1;

  if (s.phase === "showdown") return { state: settle(s, true), error: null };

  const returned = returnUncalled(s);
  s.lastReturned = returned ? { seat: s.actions[s.actions.length - 1].seat, amount: returned } : null;
  s.players.forEach((p) => {
    p.bet = 0;
    p.acted = false;
    p.actedAt = 0;
    if (p.lastAction && p.lastAction.type !== "fold" && !p.allIn) p.lastAction = null;
  });
  s.currentBet = 0;
  s.minRaise = s.blinds.bb;
  s.lastAggressor = -1;

  const l = live(s);
  if (l.length <= 1) return { state: settle(s, false), error: null };
  if (s.street === "river") {
    s.phase = "showdown";
    s.toAct = -1;
    l.forEach((i) => { s.players[i].revealed = true; });
    return { state: s, error: null };
  }

  const next = STREETS[STREETS.indexOf(s.street) + 1];
  s.street = next;
  deal(s, next === "flop" ? 3 : 1);
  openRound(s, s.dealer);
  return { state: s, error: null };
}

/** Awards every pot and completes the hand. */
function settle(s, showdown) {
  const l = live(s);
  const hands = {};
  const scores = {};
  if (showdown) {
    for (const i of l) {
      const ev = evaluate([...s.players[i].hole, ...s.board]);
      hands[i] = ev;
      scores[i] = ev.score;
    }
  }
  const pots = buildPots(s.players);
  const { pots: awarded, awards } = distribute(pots, scores, s.players.length, s.dealer);
  awards.forEach((a, i) => { s.players[i].stack += a; });
  s.players.forEach((p, i) => { p.allIn = false; p.won = awards[i]; });
  s.phase = "complete";
  s.toAct = -1;
  s.result = {
    showdown,
    pots: awarded,
    awards,
    hands,
    winners: [...new Set(awarded.flatMap((p) => p.winners))],
    net: s.players.map((p) => p.stack - p.startStack),
    board: s.board.slice(),
  };
  return s;
}

/* ------------------------------------------------------------ views */

/**
 * What seat `seat` is allowed to know: no deck, no burn cards, and no other
 * player's hole cards unless they were turned face up (showdown / all-in
 * run-out). The AI only ever receives this view.
 */
export function viewFor(s, seat) {
  return {
    seat,
    handNo: s.handNo,
    blinds: { ...s.blinds },
    dealer: s.dealer, sbSeat: s.sbSeat, bbSeat: s.bbSeat,
    street: s.street, phase: s.phase, toAct: s.toAct,
    currentBet: s.currentBet, minRaise: s.minRaise, lastAggressor: s.lastAggressor,
    board: s.board.slice(),
    actions: s.actions.map((a) => ({ ...a })),
    players: s.players.map((p, i) => ({
      id: p.id, name: p.name, stack: p.stack, inHand: p.inHand, folded: p.folded, allIn: p.allIn,
      bet: p.bet, total: p.total, acted: p.acted, actedAt: p.actedAt, out: p.out,
      hole: i === seat || p.revealed ? p.hole.slice() : [],
    })),
  };
}

/** Score of seat i's current best hand (own cards + board), for hints/stats. */
export const currentScore = (s, i) => (s.board.length >= 3 ? scoreHand([...s.players[i].hole, ...s.board]) : null);

/* ------------------------------------------------------------ validation */

/**
 * Structural + invariant check used when loading a saved table. Returns an
 * error string or null. `bank` (optional) = expected total chips at the table.
 */
export function validateTable(s, bank) {
  try {
    if (!s || typeof s !== "object" || s.v !== 1) return "bad version";
    if (!Array.isArray(s.players) || s.players.length < 2 || s.players.length > 6) return "bad players";
    const phases = ["waiting", "betting", "street-end", "showdown", "complete"];
    if (!phases.includes(s.phase)) return "bad phase";
    const int = (x) => Number.isInteger(x) && x >= 0;
    if (!int(s.blinds?.sb) || !int(s.blinds?.bb) || s.blinds.bb <= 0) return "bad blinds";
    for (const p of s.players) {
      if (!int(p.stack) || !int(p.bet) || !int(p.total) || p.bet > p.total) return "bad chips";
      if (!Array.isArray(p.hole) || !p.hole.every(isCard)) return "bad hole";
      if (typeof p.name !== "string") return "bad name";
    }
    if (s.phase !== "waiting") {
      if (!Array.isArray(s.deck) || s.deck.length !== 52 || new Set(s.deck).size !== 52 || !s.deck.every(isCard)) return "bad deck";
      if (!int(s.deckPos) || s.deckPos > 52) return "bad deck position";
      const seen = [...s.board, ...s.burned, ...s.players.flatMap((p) => p.hole)];
      if (new Set(seen).size !== seen.length) return "duplicate cards";
      if (!seen.every((c) => s.deck.slice(0, s.deckPos).includes(c))) return "cards not from deck";
      if (s.board.length > 5 || ![0, 3, 4, 5].includes(s.board.length)) return "bad board";
    }
    if (s.phase === "betting") {
      if (!int(s.toAct) || s.toAct >= s.players.length || !needsToAct(s, s.toAct)) return "bad turn";
    }
    // chips are conserved inside a hand: what the players brought in is still there
    if (s.phase !== "waiting" && chipsAtTable(s) !== s.players.reduce((a, p) => a + (p.inHand ? p.startStack : p.stack), 0)) return "hand chip mismatch";
    if (bank != null && chipsAtTable(s) !== bank) return "chip total mismatch";
    return null;
  } catch {
    return "corrupt";
  }
}
