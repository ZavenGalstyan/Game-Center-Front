/**
 * Color Clash rules engine — pure functions over a plain state object, so the
 * same code drives the UI, the AI and the headless tests (tools/engineTest.mjs).
 *
 * House rules (shown on the Rules screen):
 *  - 108 cards: per colour one 0, two each of 1–9, Skip, Reverse, Draw Two;
 *    plus 4 Wild and 4 Wild Draw Four. Seven cards each.
 *  - Match the top card by colour, number or symbol; Wilds go on anything.
 *  - Wild Draw Four may be played any time, but if the player still held a
 *    card of the active colour it is a bluff: the victim may challenge.
 *    Guilty → the bluffer draws 4 and the victim plays on; innocent → the
 *    challenger draws 6 and loses the turn. No challenge → victim draws 4.
 *  - No playable card (or by choice): draw one. A playable drawn card may be
 *    played at once or kept; that ends the turn either way. One draw per turn.
 *  - Draw penalties never stack.
 *  - Going down to one card requires a LAST CARD call (before or just after
 *    playing). If the next turn starts first, the player draws 2.
 *  - Starting card: Wilds are reshuffled; Skip / Reverse / Draw Two apply to
 *    the first player.
 *  - Round winner scores the cards left in the other hands: number = face
 *    value, Skip / Reverse / Draw Two = 20, Wild / Wild Draw Four = 50.
 */
export const COLORS = ["r", "y", "g", "b"];
export const COLOR_NAMES = { r: "Ruby", y: "Amber", g: "Jade", b: "Azure" };
export const ACTIONS = ["skip", "rev", "d2"];
export const HAND_SIZE = 7;

/* ---------- rng (seeded, stored in the state so rounds replay) ---------- */
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
  for (const c of COLORS) {
    deck.push({ id: id++, c, v: "0" });
    for (let k = 0; k < 2; k++) {
      for (let n = 1; n <= 9; n++) deck.push({ id: id++, c, v: String(n) });
      for (const v of ACTIONS) deck.push({ id: id++, c, v });
    }
  }
  for (let k = 0; k < 4; k++) deck.push({ id: id++, c: "w", v: "wild" }, { id: id++, c: "w", v: "wd4" });
  return deck;
}
export const isWild = (card) => card.c === "w";
export const cardPoints = (card) => (isWild(card) ? 50 : ACTIONS.includes(card.v) ? 20 : Number(card.v));
export const handPoints = (hand) => hand.reduce((sum, c) => sum + cardPoints(c), 0);
export const top = (s) => s.discard[s.discard.length - 1];

/** Can `card` legally go on the pile? (WD4 counts as playable — it may be a bluff.) */
export function canPlay(s, card) {
  if (isWild(card)) return true;
  const t = top(s);
  return card.c === s.color || card.v === t.v;
}
/** WD4 is "honest" when the hand holds no other card of the active colour. */
export const honestWD4 = (hand, color, exceptId) => !hand.some((c) => c.id !== exceptId && c.c === color);

/** Moves the AI (and the hint highlight) treat as legal: no WD4 bluffs. */
export function legalPlays(s, seat) {
  const hand = s.players[seat].hand;
  return hand.filter((c) => canPlay(s, c) && (c.v !== "wd4" || honestWD4(hand, s.color, c.id)));
}

/* ---------- state ---------- */
export const nextSeat = (s, from, steps = 1) => {
  const n = s.players.length;
  return (((from + s.dir * steps) % n) + n) % n;
};
const clone = (s) => ({
  ...s,
  players: s.players.map((p) => ({ ...p, hand: p.hand.slice() })),
  drawPile: s.drawPile.slice(),
  discard: s.discard.slice(),
  events: [],
});
function emit(s, type, data = {}) {
  s.events.push({ id: ++s.evId, type, ...data });
}

/**
 * New round. `players`: [{ name, ai }]; seat 0 is the human at the bottom and
 * play runs clockwise (bottom → left → top → right) unless reversed.
 */
export function newRound({ players, dealer = 0, seed = (Math.random() * 2 ** 31) | 0, difficulty = "normal", deck }) {
  const s = {
    seed,
    difficulty,
    players: players.map((p) => ({ name: p.name, ai: !!p.ai, hand: [], said: false })),
    drawPile: deck ? deck.slice() : null,
    discard: [],
    color: null,
    dir: 1,
    dealer,
    turn: 0,
    phase: "play",
    drawnId: null,
    wd4: null,
    pendingLast: null,
    winner: null,
    points: 0,
    events: [],
    evId: 0,
  };
  // `deck` (tests) is dealt top-first from the END of the array, unshuffled
  if (!s.drawPile) s.drawPile = shuffle(s, buildDeck());
  for (let k = 0; k < HAND_SIZE; k++)
    for (let i = 1; i <= s.players.length; i++) s.players[(dealer + i) % s.players.length].hand.push(s.drawPile.pop());
  let first = s.drawPile.pop();
  while (isWild(first)) {
    s.drawPile.unshift(first);
    shuffle(s, s.drawPile);
    first = s.drawPile.pop();
  }
  s.discard.push(first);
  s.color = first.c;
  s.turn = nextSeat(s, dealer);
  emit(s, "deal", { dealer });
  if (first.v === "skip") {
    emit(s, "skip", { seat: s.turn });
    s.turn = nextSeat(s, s.turn);
  } else if (first.v === "rev") {
    s.dir = -1;
    emit(s, "reverse", { dir: -1 });
    s.turn = s.players.length === 2 ? nextSeat(s, dealer, 2) : dealer;
  } else if (first.v === "d2") {
    give(s, s.turn, 2, "d2");
    emit(s, "skip", { seat: s.turn });
    s.turn = nextSeat(s, s.turn);
  }
  return s;
}

/** Draw `n` cards for `seat`, reshuffling the discard pile when the deck runs out. */
function give(s, seat, n, reason) {
  let got = 0;
  for (let k = 0; k < n; k++) {
    if (!s.drawPile.length) {
      if (s.discard.length <= 1) break; // every card is in someone's hand
      const keep = s.discard.pop();
      s.drawPile = shuffle(s, s.discard);
      s.discard = [keep];
      emit(s, "reshuffle", { count: s.drawPile.length });
    }
    s.players[seat].hand.push(s.drawPile.pop());
    got++;
  }
  if (s.players[seat].hand.length > 1) s.players[seat].said = false;
  if (got) emit(s, "draw", { seat, n: got, reason });
  return got;
}

/** A pending LAST CARD miss is caught as soon as anyone else acts. */
function settleLast(s) {
  const seat = s.pendingLast;
  if (seat == null) return;
  s.pendingLast = null;
  if (s.players[seat].hand.length === 1) {
    emit(s, "lastPenalty", { seat });
    give(s, seat, 2, "last");
  }
}

const myTurn = (s, seat, phase) => s.phase === phase && s.turn === seat;

/* ---------- actions (all return a NEW state, or the same one if illegal) ---------- */
export function play(state, seat, cardId, chosen) {
  if (!(myTurn(state, seat, "play") || myTurn(state, seat, "drawn"))) return state;
  if (state.phase === "drawn" && cardId !== state.drawnId) return state;
  const card = state.players[seat].hand.find((c) => c.id === cardId);
  if (!card || !canPlay(state, card)) return state;
  if (isWild(card) && !COLORS.includes(chosen)) return state;
  const s = clone(state);
  settleLast(s);
  const p = s.players[seat];
  const prevColor = s.color;
  p.hand = p.hand.filter((c) => c.id !== cardId);
  s.discard.push(card);
  s.color = isWild(card) ? chosen : card.c;
  s.phase = "play";
  s.drawnId = null;
  emit(s, "play", { seat, card, color: s.color });
  if (isWild(card)) emit(s, "color", { seat, color: s.color });

  if (p.hand.length === 0) return endRound(s, seat, card);
  if (p.hand.length === 1) {
    if (p.said) emit(s, "lastCall", { seat });
    else s.pendingLast = seat;
  }
  p.said = false;

  const victim = nextSeat(s, seat);
  if (card.v === "skip") {
    emit(s, "skip", { seat: victim });
    s.turn = nextSeat(s, seat, 2);
  } else if (card.v === "rev") {
    s.dir *= -1;
    emit(s, "reverse", { dir: s.dir });
    s.turn = nextSeat(s, seat, s.players.length === 2 ? 2 : 1);
  } else if (card.v === "d2") {
    give(s, victim, 2, "d2");
    emit(s, "skip", { seat: victim });
    s.turn = nextSeat(s, seat, 2);
  } else if (card.v === "wd4") {
    s.phase = "challenge";
    s.wd4 = { by: seat, victim, prevColor };
    s.turn = victim;
  } else {
    s.turn = victim;
  }
  return s;
}

function endRound(s, seat, card) {
  // a final Draw Two / Wild Draw Four still hits (those cards count for points)
  const victim = nextSeat(s, seat);
  if (card.v === "d2") give(s, victim, 2, "d2");
  if (card.v === "wd4") give(s, victim, 4, "wd4");
  s.phase = "over";
  s.pendingLast = null;
  s.winner = seat;
  s.points = s.players.reduce((sum, p, i) => (i === seat ? sum : sum + handPoints(p.hand)), 0);
  emit(s, "win", { seat, points: s.points });
  return s;
}

export function draw(state, seat) {
  if (!myTurn(state, seat, "play")) return state;
  const s = clone(state);
  settleLast(s);
  const got = give(s, seat, 1, "turn");
  const card = got ? s.players[seat].hand[s.players[seat].hand.length - 1] : null;
  if (card && canPlay(s, card)) {
    s.phase = "drawn";
    s.drawnId = card.id;
  } else {
    if (!got) emit(s, "pass", { seat });
    s.turn = nextSeat(s, seat);
  }
  return s;
}

/** Keep the playable card just drawn; the turn passes. */
export function keep(state, seat) {
  if (!myTurn(state, seat, "drawn")) return state;
  const s = clone(state);
  settleLast(s);
  s.phase = "play";
  s.drawnId = null;
  emit(s, "pass", { seat });
  s.turn = nextSeat(s, seat);
  return s;
}

/** Call LAST CARD: on your turn holding 2 cards, or right after dropping to 1. */
export function canDeclare(s, seat) {
  const p = s.players[seat];
  if (s.phase === "over" || p.said) return false;
  if (s.pendingLast === seat) return true;
  return s.turn === seat && (s.phase === "play" || s.phase === "drawn") && p.hand.length === 2;
}
export function declareLast(state, seat) {
  if (!canDeclare(state, seat)) return state;
  const s = clone(state);
  if (s.pendingLast === seat) {
    s.pendingLast = null;
    emit(s, "lastCall", { seat });
  } else {
    s.players[seat].said = true;
    emit(s, "lastReady", { seat });
  }
  return s;
}
/** Timer-driven: the grace window ran out before anyone acted. */
export function catchLast(state) {
  if (state.pendingLast == null) return state;
  const s = clone(state);
  settleLast(s);
  return s;
}

export function resolveChallenge(state, seat, challenge) {
  if (!myTurn(state, seat, "challenge")) return state;
  const s = clone(state);
  settleLast(s);
  const { by, victim, prevColor } = s.wd4;
  s.wd4 = null;
  s.phase = "play";
  if (!challenge) {
    give(s, victim, 4, "wd4");
    emit(s, "skip", { seat: victim });
    s.turn = nextSeat(s, victim);
  } else if (!honestWD4(s.players[by].hand, prevColor)) {
    emit(s, "challenge", { seat: victim, by, guilty: true });
    give(s, by, 4, "bluff");
    s.turn = victim;
  } else {
    emit(s, "challenge", { seat: victim, by, guilty: false });
    give(s, victim, 6, "challenge");
    emit(s, "skip", { seat: victim });
    s.turn = nextSeat(s, victim);
  }
  return s;
}

/** Whose input the game is waiting for (null when the round is over). */
export const actor = (s) => (s.phase === "over" ? null : s.turn);

/* ---------- AI ---------- */
const FORGET = { easy: 0.25, normal: 0.1, hard: 0.03 };
const CHALLENGE = { easy: 0.1, normal: 0.2, hard: 0.3 };

/** The colour the AI names for a Wild: its most-held colour (by count, then points). */
export function bestColor(s, hand) {
  const score = { r: 0, y: 0, g: 0, b: 0 };
  for (const c of hand) if (!isWild(c)) score[c.c] += 10 + cardPoints(c) / 10;
  const best = Math.max(...Object.values(score));
  if (best === 0) return COLORS[Math.floor(rand(s) * 4)];
  return COLORS.find((c) => score[c] === best);
}

/** Pick a move for `seat`: { type: "play", id, color } or { type: "draw" }. */
export function aiChoose(s, seat) {
  const hand = s.players[seat].hand;
  const legal = legalPlays(s, seat);
  if (!legal.length) return { type: "draw" };
  const level = s.difficulty;
  let pick;
  if (level === "easy") {
    const plain = legal.filter((c) => !isWild(c));
    const pool = plain.length && rand(s) < 0.85 ? plain : legal;
    pick = pool[Math.floor(rand(s) * pool.length)];
  } else {
    const count = { r: 0, y: 0, g: 0, b: 0, w: 0 };
    for (const c of hand) count[c.c]++;
    const next = s.players[nextSeat(s, seat)].hand.length;
    const minOpp = Math.min(...s.players.filter((_, i) => i !== seat).map((p) => p.hand.length));
    const threat = next <= 2 || (level === "hard" && minOpp <= 1);
    const value = (c) => {
      let v;
      if (c.v === "wd4") v = threat ? 60 : 2;
      else if (c.v === "wild") v = 4;
      else {
        v = 12 + count[c.c] * 3 + cardPoints(c) * 0.4;
        if (c.c !== s.color) v += count[c.c] > count[s.color] ? 4 : -4; // steer toward our strong colour
        if (threat && c.v === "d2") v += 40;
        if (threat && c.v === "skip") v += 30;
        if (threat && c.v === "rev") v += 25;
        // hard: keep action cards for when they hurt, unless the hand is nearly out
        if (level === "hard" && !threat && c.v !== "0" && ACTIONS.includes(c.v) && hand.length > 3) v -= 6;
      }
      return v + rand(s) * 2;
    };
    pick = legal.reduce((a, b) => (value(b) > value(a) ? b : a));
  }
  const rest = hand.filter((c) => c.id !== pick.id);
  return { type: "play", id: pick.id, color: isWild(pick) ? bestColor(s, rest) : undefined };
}

/** One AI decision for whoever is to act. Returns the next state. */
export function aiAct(state) {
  const seat = actor(state);
  if (seat == null) return state;
  const s = { ...state }; // the rng advances on this copy; every action clones it again
  if (s.phase === "challenge") {
    const by = s.players[s.wd4.by];
    const odds = CHALLENGE[s.difficulty] + (by.hand.length >= 5 ? 0.1 : 0);
    // AI opponents never bluff, so AIs only consider challenging the human
    const tryIt = !by.ai && rand(s) < odds;
    return resolveChallenge(s, seat, tryIt);
  }
  if (s.phase === "drawn") {
    const card = s.players[seat].hand.find((c) => c.id === s.drawnId);
    const ok = card.v !== "wd4" || honestWD4(s.players[seat].hand, s.color, card.id);
    if (!ok) return keep(s, seat);
    return withCall(s, seat, (t) => play(t, seat, card.id, isWild(card) ? bestColor(t, t.players[seat].hand.filter((c) => c.id !== card.id)) : undefined));
  }
  const move = aiChoose(s, seat);
  if (move.type === "draw") return draw(s, seat);
  return withCall(s, seat, (t) => play(t, seat, move.id, move.color));
}

/** AI going down to one card calls LAST CARD — unless it "forgets". */
function withCall(s, seat, act) {
  if (s.players[seat].hand.length === 2) {
    if (rand(s) >= FORGET[s.difficulty]) {
      const called = declareLast(s, seat);
      const after = act(called);
      after.events = [...called.events, ...after.events];
      return after;
    }
  }
  return act(s);
}
