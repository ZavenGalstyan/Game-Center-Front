/**
 * Crazy Cards rules engine — Crazy Eights with a standard 52-card deck. Pure
 * functions over a plain state object, so the same code drives the UI, the AI
 * and the headless tests (tools/engineTest.mjs).
 *
 * Rules (shown on the Rules screen):
 *  - 2–4 players. 7 cards each with 2 players, 5 each with 3–4. The first
 *    discard is never an eight (an eight is buried back in the stock).
 *  - Play a card matching the current suit or rank. Any eight is wild: the
 *    player names the next suit.
 *  - Draw only when you can't play: draw one; if it fits you may play it,
 *    otherwise you pass. When the stock runs out, the discard pile (except its
 *    top card) is reshuffled into it.
 *  - If the stock can't be refilled and a player can't play, they pass. When
 *    every player passes in a row the round is blocked: the lowest hand wins.
 *  - Scoring: eight 50, K/Q/J 10, ace 1, others face value. The player who
 *    goes out scores the total left in every other hand; in a blocked round
 *    the lowest hand scores the difference to each other hand (a tie for
 *    lowest scores nobody).
 */
export const SUITS = ["s", "h", "d", "c"];
export const SUIT_NAMES = { s: "Spades", h: "Hearts", d: "Diamonds", c: "Clubs" };
export const SUIT_SYMBOL = { s: "♠", h: "♥", d: "♦", c: "♣" };
export const RANK_LABEL = { 1: "A", 11: "J", 12: "Q", 13: "K" };
export const RANK_NAMES = { 1: "Ace", 11: "Jack", 12: "Queen", 13: "King" };
export const isRed = (suit) => suit === "h" || suit === "d";
export const rankLabel = (r) => RANK_LABEL[r] ?? String(r);
export const cardName = (c) => `${RANK_NAMES[c.r] ?? c.r} of ${SUIT_NAMES[c.s]}`;
/** Hard stop against (theoretical) endless reshuffle loops: the round is scored as blocked. */
export const TURN_CAP = 600;

/* ---------- rng (seeded, kept in the state) ---------- */
export function rand(s) {
  let t = (s.seed = (s.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(s, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------- cards ---------- */
export function buildDeck() {
  const deck = [];
  let id = 0;
  for (const s of SUITS) for (let r = 1; r <= 13; r++) deck.push({ id: id++, s, r });
  return deck;
}
export const isEight = (c) => c.r === 8;
export const cardPoints = (c) => (c.r === 8 ? 50 : c.r >= 11 ? 10 : c.r);
export const handPoints = (hand) => hand.reduce((sum, c) => sum + cardPoints(c), 0);
export const top = (s) => s.discard[s.discard.length - 1];
export const handSize = (players) => (players === 2 ? 7 : 5);

export const canPlay = (s, card) => isEight(card) || card.s === s.suit || card.r === top(s).r;
export const legalPlays = (s, seat) => s.players[seat].hand.filter((c) => canPlay(s, c));
/** Can the stock supply a card (directly or after reshuffling the discards)? */
export const canDraw = (s) => s.stock.length > 0 || s.discard.length > 1;
export const nextSeat = (s, from) => (from + 1) % s.players.length;

const clone = (s) => ({
  ...s,
  players: s.players.map((p) => ({ ...p, hand: p.hand.slice(), voids: p.voids.slice() })),
  stock: s.stock.slice(),
  discard: s.discard.slice(),
  events: [],
});
const emit = (s, type, data = {}) => s.events.push({ id: ++s.evId, type, ...data });

/**
 * New round. `players`: [{ name, ai }]; seat 0 is the human, play runs
 * clockwise and starts left of the dealer. `deck` (tests) is dealt from the
 * END of the array, unshuffled.
 */
export function newRound({ players, dealer = 0, seed = (Math.random() * 2 ** 31) | 0, difficulty = "normal", deck }) {
  const s = {
    seed,
    difficulty,
    players: players.map((p) => ({ name: p.name, ai: !!p.ai, hand: [], voids: [] })),
    stock: deck ? deck.slice() : null,
    discard: [],
    suit: null,
    dealer,
    turn: 0,
    turns: 0,
    phase: "play", // play | drawn | over
    drawnId: null,
    passes: 0, // consecutive passes without drawing (blocked detection)
    winner: null,
    points: 0,
    blocked: false,
    events: [],
    evId: 0,
  };
  if (!s.stock) s.stock = shuffle(s, buildDeck());
  const n = s.players.length;
  for (let k = 0; k < handSize(n); k++) for (let i = 1; i <= n; i++) s.players[(dealer + i) % n].hand.push(s.stock.pop());
  let first = s.stock.pop();
  while (isEight(first)) {
    s.stock.splice(Math.floor(rand(s) * s.stock.length), 0, first); // bury it and turn the next
    first = s.stock.pop();
  }
  s.discard.push(first);
  s.suit = first.s;
  s.turn = (dealer + 1) % n;
  emit(s, "deal", { dealer });
  return s;
}

const isTurn = (s, seat) => s.turn === seat && s.phase !== "over";

function advance(s) {
  s.phase = "play";
  s.drawnId = null;
  s.turn = nextSeat(s, s.turn);
  s.turns++;
  if (s.turns >= TURN_CAP) endRound(s, null);
}

/* ---------- actions (each returns a NEW state, or the same one if illegal) ---------- */
export function play(state, seat, cardId, chosen) {
  if (!isTurn(state, seat)) return state;
  if (state.phase === "drawn" && cardId !== state.drawnId) return state;
  const card = state.players[seat].hand.find((c) => c.id === cardId);
  if (!card || !canPlay(state, card)) return state;
  if (isEight(card) && !SUITS.includes(chosen)) return state;
  const s = clone(state);
  const p = s.players[seat];
  p.hand = p.hand.filter((c) => c.id !== cardId);
  p.voids = p.voids.filter((v) => v !== card.s);
  s.discard.push(card);
  s.suit = isEight(card) ? chosen : card.s;
  s.passes = 0;
  emit(s, "play", { seat, card, suit: s.suit });
  if (isEight(card)) emit(s, "suit", { seat, suit: s.suit });
  if (!p.hand.length) return endRound(s, seat);
  if (p.hand.length === 1) emit(s, "last", { seat });
  advance(s);
  return s;
}

/** Draw one card (only when nothing in hand can be played). An unplayable draw passes at once. */
export function draw(state, seat) {
  if (!isTurn(state, seat) || state.phase !== "play" || legalPlays(state, seat).length || !canDraw(state)) return state;
  const s = clone(state);
  if (!s.stock.length) {
    const keep = s.discard.pop();
    s.stock = shuffle(s, s.discard);
    s.discard = [keep];
    emit(s, "reshuffle", { count: s.stock.length });
  }
  const card = s.stock.pop();
  const p = s.players[seat];
  if (!p.voids.includes(s.suit)) p.voids.push(s.suit); // public info: they couldn't follow this suit
  p.hand.push(card);
  s.passes = 0;
  emit(s, "draw", { seat, card });
  if (canPlay(s, card)) {
    s.phase = "drawn";
    s.drawnId = card.id;
  } else {
    emit(s, "pass", { seat, drew: true });
    advance(s);
  }
  return s;
}

/** Pass: after drawing a playable card you choose to keep, or when you can neither play nor draw. */
export function pass(state, seat) {
  if (!isTurn(state, seat)) return state;
  const stuck = state.phase === "play" && !legalPlays(state, seat).length && !canDraw(state);
  if (state.phase !== "drawn" && !stuck) return state;
  const s = clone(state);
  emit(s, "pass", { seat, drew: !stuck });
  if (stuck) {
    s.passes++;
    if (s.passes >= s.players.length) return endRound(s, null);
  }
  advance(s);
  return s;
}

/** Scores a finished round: `winner` went out, or null for a blocked round. */
function endRound(s, winner) {
  s.phase = "over";
  s.drawnId = null;
  const totals = s.players.map((p) => handPoints(p.hand));
  if (winner != null) {
    s.winner = winner;
    s.points = totals.reduce((a, v, i) => (i === winner ? a : a + v), 0);
    emit(s, "win", { seat: winner, points: s.points });
    return s;
  }
  s.blocked = true;
  const low = Math.min(...totals);
  const lows = totals.filter((v) => v === low).length;
  s.winner = lows === 1 ? totals.indexOf(low) : null;
  s.points = s.winner == null ? 0 : totals.reduce((a, v) => a + v - low, 0);
  emit(s, "blocked", { seat: s.winner, points: s.points });
  return s;
}

/* ---------- AI ---------- */
function suitCounts(hand) {
  const n = { s: 0, h: 0, d: 0, c: 0 };
  for (const c of hand) if (!isEight(c)) n[c.s] += 1 + cardPoints(c) / 40;
  return n;
}

/** Suit to name after playing an eight: the one we hold most of; hard AI also steers into the next player's known voids. */
export function chooseSuit(s, seat, playedId) {
  const hand = s.players[seat].hand.filter((c) => c.id !== playedId);
  const counts = suitCounts(hand);
  const next = s.players[nextSeat(s, seat)];
  if (s.difficulty === "easy") {
    const held = SUITS.filter((x) => counts[x] > 0);
    return held.length ? held[Math.floor(rand(s) * held.length)] : SUITS[Math.floor(rand(s) * 4)];
  }
  let best = SUITS[0], bestScore = -Infinity;
  for (const x of SUITS) {
    let score = counts[x] + rand(s) * 0.1;
    if (s.difficulty === "hard" && next.voids.includes(x)) score += next.hand.length <= 2 ? 3 : 1.2;
    if (score > bestScore) (best = x), (bestScore = score);
  }
  return best;
}

/** Cards of each suit / rank not visible to `seat` (not in its hand, not in the discard pile). */
function unseen(s, seat) {
  const suit = { s: 13, h: 13, d: 13, c: 13 }, rank = Array(14).fill(4);
  for (const c of [...s.players[seat].hand, ...s.discard]) suit[c.s]--, rank[c.r]--;
  return { suit, rank };
}

/**
 * Pick a card to play (or null). Easy plays any legal card. Normal and hard
 * save eights and prefer cards that leave a follow-up in hand; hard also
 * counts cards and steers into suits the next player has shown they lack.
 */
export function chooseCard(s, seat) {
  const legal = s.phase === "drawn" ? legalPlays(s, seat).filter((c) => c.id === s.drawnId) : legalPlays(s, seat);
  if (!legal.length) return null;
  if (s.difficulty === "easy") return legal[Math.floor(rand(s) * legal.length)];
  const plain = legal.filter((c) => !isEight(c));
  if (!plain.length) return legal[0];
  const hand = s.players[seat].hand;
  const next = s.players[nextSeat(s, seat)];
  const danger = s.players.some((p, i) => i !== seat && p.hand.length <= 2);
  const seen = s.difficulty === "hard" && unseen(s, seat);
  let best = plain[0], bestScore = -Infinity;
  for (const c of plain) {
    const rest = hand.filter((x) => x.id !== c.id && !isEight(x));
    // how many of our cards could follow this one next turn
    let score = rest.filter((x) => x.s === c.s || x.r === c.r).length * 2 + cardPoints(c) / (danger ? 4 : 12) + rand(s) * 0.3;
    if (seen) {
      score -= (seen.suit[c.s] + seen.rank[c.r]) * 0.8; // fewer unseen matches → opponents are likelier to be stuck
      if (next.voids.includes(c.s)) score += next.hand.length <= 2 ? 5 : 2;
    }
    if (score > bestScore) (best = c), (bestScore = score);
  }
  return best;
}

/** One AI step for whoever's turn it is: play, draw, or pass. */
export function aiAct(state) {
  if (state.phase === "over") return state;
  const seat = state.turn;
  const card = chooseCard(state, seat);
  if (card) return play(state, seat, card.id, isEight(card) ? chooseSuit(state, seat, card.id) : undefined);
  if (state.phase === "play" && canDraw(state)) return draw(state, seat);
  return pass(state, seat);
}
