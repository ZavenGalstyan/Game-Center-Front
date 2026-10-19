/**
 * DeckEngine · ShuffleEngine · DealEngine.
 *
 * A card is an integer 0..31: suit = card >> 3 (0 hearts, 1 diamonds,
 * 2 clubs, 3 spades) and rank = card & 7 (index into RANKS: 7 8 9 10 J Q K A).
 * Integers keep every state plain JSON, so a save restores the exact cards.
 */

export const SUITS = ["H", "D", "C", "S"];
export const SUIT_SYMBOLS = ["♥", "♦", "♣", "♠"];
export const RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"];
export const R7 = 0, R8 = 1, R9 = 2, R10 = 3, RJ = 4, RQ = 5, RK = 6, RA = 7;
export const RED = [true, true, false, false];

export const suitOf = (c) => c >> 3;
export const rankOf = (c) => c & 7;
export const makeCard = (rank, suit) => (suit << 3) | rank;
export const isCard = (c) => Number.isInteger(c) && c >= 0 && c < 32;
export const cardId = (c) => `${RANKS[rankOf(c)]}${SUITS[suitOf(c)]}`;
export const cardLabel = (c) => `${RANKS[rankOf(c)]}${SUIT_SYMBOLS[suitOf(c)]}`;

/** "JH" / "10s" / "As" → card. Throws on bad input (tests and fixtures use it). */
export function parseCard(str) {
  const s = String(str).trim().toUpperCase();
  const suit = SUITS.indexOf(s.slice(-1));
  const rank = RANKS.indexOf(s.slice(0, -1) === "T" ? "10" : s.slice(0, -1));
  if (suit < 0 || rank < 0) throw new Error(`Bad card "${str}"`);
  return makeCard(rank, suit);
}
export const parseCards = (str) => (str.trim() ? str.trim().split(/\s+/).map(parseCard) : []);

export const freshDeck = () => Array.from({ length: 32 }, (_, i) => i);

/** Uniform integer in [0, n): crypto.getRandomValues with rejection sampling, Math.random fallback. */
export function secureInt(n) {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : null;
  if (c && c.getRandomValues) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / n) * n;
    for (;;) {
      c.getRandomValues(buf);
      if (buf[0] < limit) return buf[0] % n;
    }
  }
  return Math.floor(Math.random() * n);
}

/** Seeded PRNG (mulberry32) → float in [0,1). Deterministic fixtures and AI tests. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const intFrom = (rand) => (n) => Math.floor(rand() * n);

/** Unbiased Fisher–Yates (in place). `randInt(n)` → uniform int in [0, n). */
export function shuffle(arr, randInt = secureInt) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}
export const shuffledDeck = (randInt) => shuffle(freshDeck(), randInt);

/**
 * Deals a 32-card deck in packets, clockwise, starting with the player to the
 * dealer's left. `pattern` is the packet sizes per round (e.g. [3, 2, 3]) and
 * must add up to 8. Returns four hands (seat-indexed).
 */
export function deal(deck, dealer, pattern = [3, 2, 3]) {
  if (!validDeck(deck)) throw new Error("deal: the deck must hold the 32 distinct cards");
  if (pattern.reduce((a, b) => a + b, 0) !== 8) throw new Error("deal: packets must total 8 cards");
  const hands = [[], [], [], []];
  let k = 0;
  for (const n of pattern) {
    for (let i = 1; i <= 4; i++) {
      const seat = (dealer + i) % 4;
      for (let j = 0; j < n; j++) hands[seat].push(deck[k++]);
    }
  }
  return hands;
}

export function validDeck(deck) {
  if (!Array.isArray(deck) || deck.length !== 32) return false;
  const seen = new Set(deck);
  return seen.size === 32 && deck.every(isCard);
}

/** Display order for a hand: suits alternate colour, ranks by strength in the given strain. */
export function sortHand(hand, strengthOf) {
  const present = [0, 1, 2, 3].filter((s) => hand.some((c) => suitOf(c) === s));
  // alternate red/black where possible: ♥ ♣ ♦ ♠
  const pref = [0, 2, 1, 3].filter((s) => present.includes(s));
  return hand.slice().sort((a, b) => {
    const sa = pref.indexOf(suitOf(a)), sb = pref.indexOf(suitOf(b));
    if (sa !== sb) return sa - sb;
    return strengthOf(b) - strengthOf(a);
  });
}
