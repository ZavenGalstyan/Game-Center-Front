/**
 * Trump Masters — pure, deterministic Durak rules engine (36 cards, 6–Ace).
 *
 * The state is plain data; every function returns a new state and never
 * mutates its input. Play is strictly sequential: `actor(s)` names the one
 * seat that may act, `legal(s, seat)` lists its moves and `act(s, seat, move)`
 * applies one (illegal moves return the state unchanged). When a bout ends the
 * table stays visible in phase "end" until the UI calls `finishBout(s)`, which
 * discards / hands over the cards, refills hands, eliminates and rotates.
 *
 * Moves: {type:"attack", card} (lead or throw-in), {type:"defend", card, slot},
 * {type:"transfer", card} (Transfer mode), {type:"take"}, {type:"pass"} (Done).
 */
export const SUITS = ["S", "H", "D", "C"];
export const SUIT_NAME = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };
export const RED = { H: true, D: true };
const FACE = { 11: "J", 12: "Q", 13: "K", 14: "A" };
export const rankLabel = (r) => FACE[r] ?? String(r);
export const MAX_ATTACK = 6;
export const HAND = 6;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeDeck(seed) {
  const d = [];
  for (const s of SUITS) for (let r = 6; r <= 14; r++) d.push({ id: s + r, s, r });
  const rand = rng(seed);
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** Does `d` beat attack card `a`? Higher of the same suit, or a trump on a non-trump. */
export const beats = (a, d, trump) => (d.s === a.s && d.r > a.r) || (d.s === trump && a.s !== trump);

export const nextActive = (s, i) => {
  for (let k = 1; k <= s.n; k++) {
    const j = (i + k) % s.n;
    if (!s.out[j]) return j;
  }
  return -1;
};

/** Attackers in priority order: the main attacker, then clockwise from the defender. */
export const throwOrder = (s) => {
  const o = [s.attacker];
  for (let k = 1; k < s.n; k++) {
    const j = (s.defender + k) % s.n;
    if (j !== s.attacker && j !== s.defender && !s.out[j]) o.push(j);
  }
  return o;
};

export const tableRanks = (s) => new Set(s.table.flatMap((p) => (p.d ? [p.a.r, p.d.r] : [p.a.r])));
const unbeaten = (s) => s.table.some((p) => !p.d);

export function newGame({ players = 2, mode = "classic", seed = (Math.random() * 2 ** 31) | 0 } = {}) {
  const n = Math.max(2, Math.min(4, players));
  const deck = makeDeck(seed);
  const hands = Array.from({ length: n }, () => []);
  for (let k = 0; k < HAND; k++) for (let i = 0; i < n; i++) hands[i].push(deck.pop());
  const trumpCard = deck[0]; // bottom of the pile, face up, drawn last
  const trump = trumpCard.s;
  let first = -1, low = 99;
  hands.forEach((h, i) => h.forEach((c) => {
    if (c.s === trump && c.r < low) [low, first] = [c.r, i];
  }));
  const lead = first >= 0 ? { seat: first, card: { id: trump + low, s: trump, r: low } } : null;
  if (first < 0) first = Math.floor(rng(seed ^ 0x9e3779b9)() * n);
  const s = {
    mode, n, seed, trump, trumpCard, deck, hands,
    out: Array(n).fill(false), finish: [], discard: 0,
    attacker: first, defender: (first + 1) % n, boutAttacker: first,
    table: [], limit: Math.min(MAX_ATTACK, hands[(first + 1) % n].length),
    taking: false, passed: [], phase: "play", end: null, loser: null, bout: 1,
    lead, events: [{ type: "deal", lead }],
  };
  return s;
}

/** The single seat allowed to act now, or null outside phase "play". */
export function actor(s) {
  if (s.phase !== "play") return null;
  if (s.table.length === 0) return s.attacker;
  if (!s.taking && unbeaten(s)) return s.defender;
  return throwOrder(s).find((p) => !s.passed.includes(p)) ?? null;
}

export function transferTarget(s) {
  if (s.mode !== "transfer" || s.taking || s.table.length === 0 || s.table.some((p) => p.d)) return -1;
  const r = s.table[0].a.r;
  if (s.table.some((p) => p.a.r !== r) || s.table.length + 1 > MAX_ATTACK) return -1;
  const nd = nextActive(s, s.defender);
  return nd >= 0 && nd !== s.defender && s.hands[nd].length >= s.table.length + 1 ? nd : -1;
}

export function legal(s, seat) {
  if (actor(s) !== seat) return [];
  const h = s.hands[seat], L = [];
  if (seat === s.defender && s.table.length && !s.taking && unbeaten(s)) {
    for (const c of h) s.table.forEach((p, i) => !p.d && beats(p.a, c, s.trump) && L.push({ type: "defend", card: c.id, slot: i }));
    if (transferTarget(s) >= 0) for (const c of h) if (c.r === s.table[0].a.r) L.push({ type: "transfer", card: c.id });
    L.push({ type: "take" });
    return L;
  }
  if (s.table.length === 0) return h.map((c) => ({ type: "attack", card: c.id }));
  const ranks = tableRanks(s);
  if (s.table.length < s.limit) for (const c of h) if (ranks.has(c.r)) L.push({ type: "attack", card: c.id });
  L.push({ type: "pass" });
  return L;
}

const same = (a, b) => a.type === b.type && a.card === b.card && (a.slot ?? null) === (b.slot ?? null);
export const isLegal = (s, seat, m) => legal(s, seat).some((x) => same(x, m));

const clone = (s) => ({ ...s, hands: s.hands.map((h) => h.slice()), table: s.table.slice(), passed: s.passed.slice(), out: s.out.slice(), finish: s.finish.slice(), deck: s.deck.slice(), events: [] });

export function act(s0, seat, m) {
  if (!m || !isLegal(s0, seat, m)) return s0;
  const s = clone(s0);
  const take = (id) => {
    const h = s.hands[seat], k = h.findIndex((c) => c.id === id);
    return h.splice(k, 1)[0];
  };
  if (m.type === "attack") {
    const card = take(m.card);
    s.table.push({ a: card, d: null, by: seat });
    s.passed = [];
    s.events.push({ type: "attack", seat, card, lead: s.table.length === 1 });
  } else if (m.type === "defend") {
    const card = take(m.card);
    s.table[m.slot] = { ...s.table[m.slot], d: card };
    s.events.push({ type: "defend", seat, card, slot: m.slot });
  } else if (m.type === "transfer") {
    const to = transferTarget(s);
    const card = take(m.card);
    s.table.push({ a: card, d: null, by: seat });
    s.attacker = seat;
    s.defender = to;
    s.limit = Math.min(MAX_ATTACK, s.hands[to].length);
    s.passed = [];
    s.events.push({ type: "transfer", seat, to, card });
  } else if (m.type === "take") {
    s.taking = true;
    s.passed = [];
    s.events.push({ type: "take", seat });
  } else {
    s.passed.push(seat);
    s.events.push({ type: "pass", seat });
  }
  return settle(s);
}

/** Auto-pass attackers who have nothing to add, and close the bout when it's over. */
function settle(s) {
  while (s.phase === "play" && s.table.length) {
    if (!s.taking && unbeaten(s)) return s;
    const p = s.table.length < s.limit ? throwOrder(s).find((x) => !s.passed.includes(x)) : undefined;
    if (p === undefined) {
      s.phase = "end";
      s.end = s.taking ? "take" : "beat";
      s.events.push({ type: "boutEnd", end: s.end, defender: s.defender, cards: s.table.length });
      return s;
    }
    const ranks = tableRanks(s);
    if (s.hands[p].some((c) => ranks.has(c.r))) return s;
    s.passed.push(p);
  }
  return s;
}

/** Refill order: the bout's first attacker, then clockwise, the defender last. */
export function refillOrder(s) {
  const o = [];
  for (let k = 0; k < s.n; k++) {
    const j = (s.boutAttacker + k) % s.n;
    if (j !== s.defender && !s.out[j]) o.push(j);
  }
  o.push(s.defender);
  return o;
}

export function finishBout(s0) {
  if (s0.phase !== "end") return s0;
  const s = clone(s0);
  const def = s.defender;
  const cards = s.table.flatMap((p) => (p.d ? [p.a, p.d] : [p.a]));
  if (s.end === "take") s.hands[def].push(...cards);
  else s.discard += cards.length;
  s.table = [];
  const drawn = [];
  for (const j of refillOrder(s)) {
    let k = 0;
    while (s.hands[j].length < HAND && s.deck.length) {
      s.hands[j].push(s.deck.pop());
      k++;
    }
    if (k) drawn.push({ seat: j, n: k });
  }
  s.events.push({ type: "refill", drawn });
  if (s.deck.length === 0) {
    for (let i = 0; i < s.n; i++) {
      if (!s.out[i] && s.hands[i].length === 0) {
        s.out[i] = true;
        s.finish.push(i);
        s.events.push({ type: "out", seat: i, place: s.finish.length });
      }
    }
  }
  const alive = s.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
  if (alive.length <= 1) {
    s.phase = "over";
    s.loser = alive.length ? alive[0] : null;
    s.events.push({ type: "over", loser: s.loser });
    return s;
  }
  const a = s.end === "take" || s.out[def] ? nextActive(s, def) : def;
  const d = nextActive(s, a);
  Object.assign(s, { attacker: a, defender: d, boutAttacker: a, limit: Math.min(MAX_ATTACK, s.hands[d].length), taking: false, passed: [], phase: "play", end: null, bout: s.bout + 1 });
  s.events.push({ type: "bout", attacker: a, defender: d });
  return s;
}

/* ---------------- AI ---------------- */

const value = (c, trump) => c.r + (c.s === trump ? 20 : 0);
const byId = (h, id) => h.find((c) => c.id === id);

/** Greedy defense plan: hardest attack cards first, each with its cheapest beater. */
export function planDefense(s, seat) {
  const used = new Set(), plan = [];
  const slots = s.table.map((p, i) => [p, i]).filter(([p]) => !p.d).sort((x, y) => value(y[0].a, s.trump) - value(x[0].a, s.trump));
  for (const [p, i] of slots) {
    const c = s.hands[seat].filter((h) => !used.has(h.id) && beats(p.a, h, s.trump)).sort((x, y) => value(x, s.trump) - value(y, s.trump))[0];
    if (!c) return null;
    used.add(c.id);
    plan.push({ slot: i, card: c });
  }
  return plan;
}

/** A lightweight rule-following opponent: always returns a move from legal(). */
export function aiMove(s) {
  const seat = actor(s);
  if (seat == null) return null;
  const L = legal(s, seat), h = s.hands[seat], T = s.trump, deckN = s.deck.length;
  const v = (c) => value(c, T);
  const cheapest = (moves) => moves.slice().sort((x, y) => v(byId(h, x.card)) - v(byId(h, y.card)))[0];

  if (L.some((m) => m.type === "take")) {
    const plan = planDefense(s, seat);
    const tr = L.filter((m) => m.type === "transfer");
    if (tr.length) {
      const t = cheapest(tr), tc = byId(h, t.card);
      const planTrumps = plan ? plan.filter((x) => x.card.s === T).length : 9;
      if (!plan || tc.s !== T || planTrumps > 0 || deckN === 0) return t;
    }
    if (!plan) return { type: "take" };
    const attacks = s.table.filter((p) => !p.d).map((p) => p.a);
    const bigTrumps = plan.filter((x) => x.card.s === T && x.card.r >= 12).length;
    const cheapPile = attacks.length <= 2 && attacks.every((a) => a.s !== T && a.r <= 10);
    if (deckN > 8 && bigTrumps > 0 && cheapPile && h.length <= 7) return { type: "take" };
    return { type: "defend", card: plan[0].card.id, slot: plan[0].slot };
  }

  const atk = L.filter((m) => m.type === "attack");
  if (s.table.length === 0) {
    // lead the lowest card, preferring a rank we hold twice (easy to follow up)
    const count = {};
    for (const c of h) count[c.r] = (count[c.r] || 0) + 1;
    return atk.slice().sort((x, y) => {
      const a = byId(h, x.card), b = byId(h, y.card);
      return v(a) - (count[a.r] > 1 && a.s !== T ? 1.5 : 0) - (v(b) - (count[b.r] > 1 && b.s !== T ? 1.5 : 0));
    })[0];
  }
  const ok = atk.filter((m) => {
    const c = byId(h, m.card);
    if (deckN === 0) return c.s !== T || h.length <= 2 || s.taking;
    if (c.s === T) return false;
    return s.taking ? c.r <= 12 : c.r <= (deckN <= 6 ? 13 : 11);
  });
  return ok.length ? cheapest(ok) : { type: "pass" };
}

/** Plays a whole game with AI everywhere (tests / demos). Returns the final state. */
export function autoplay(s, maxSteps = 5000) {
  for (let k = 0; k < maxSteps && s.phase !== "over"; k++) s = s.phase === "end" ? finishBout(s) : act(s, actor(s), aiMove(s));
  return s;
}
