/**
 * Cards, deck and shuffling.
 *
 * A card is an integer 0..51: rank = (c >> 2) + 2 (2..14, ace = 14) and
 * suit = c & 3 (0 clubs, 1 diamonds, 2 hearts, 3 spades). Integers keep the
 * evaluator fast and make the whole table state plain JSON for saving.
 */

export const SUITS = ["c", "d", "h", "s"];
export const SUIT_NAMES = ["Clubs", "Diamonds", "Hearts", "Spades"];
export const SUIT_SYMBOLS = ["♣", "♦", "♥", "♠"];
export const RANK_CHARS = "23456789TJQKA";
export const RANK_LABELS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_WORDS = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace"];
const RANK_PLURALS = ["Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines", "Tens", "Jacks", "Queens", "Kings", "Aces"];

export const rankOf = (c) => (c >> 2) + 2;
export const suitOf = (c) => c & 3;
export const makeCard = (rank, suit) => ((rank - 2) << 2) | suit;
export const rankWord = (r) => RANK_WORDS[r - 2];
export const rankPlural = (r) => RANK_PLURALS[r - 2];
export const isCard = (c) => Number.isInteger(c) && c >= 0 && c < 52;

/** "Ah" / "Td" / "10d" → card int. Throws on bad input (tests use it). */
export function parseCard(str) {
  const s = String(str).trim();
  const suit = SUITS.indexOf(s.slice(-1).toLowerCase());
  let r = s.slice(0, -1).toUpperCase();
  if (r === "10") r = "T";
  const rank = RANK_CHARS.indexOf(r) + 2;
  if (suit < 0 || rank < 2 || r.length !== 1) throw new Error(`Bad card "${str}"`);
  return makeCard(rank, suit);
}
export const parseCards = (str) => (str.trim() ? str.trim().split(/\s+/).map(parseCard) : []);
export const cardStr = (c) => RANK_CHARS[rankOf(c) - 2] + SUITS[suitOf(c)];
export const cardLabel = (c) => `${RANK_LABELS[rankOf(c) - 2]}${SUIT_SYMBOLS[suitOf(c)]}`;

export const freshDeck = () => Array.from({ length: 52 }, (_, i) => i);

/**
 * Uniform integer in [0, n). Uses crypto.getRandomValues with rejection
 * sampling (no modulo bias) when available; Math.random otherwise.
 */
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

/** Seeded PRNG (mulberry32) → float in [0,1). Used by tests and the AI. */
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

/**
 * Unbiased Fisher–Yates shuffle (in place, returns the array).
 * `randInt(n)` must return a uniform integer in [0, n); defaults to secureInt.
 */
export function shuffle(arr, randInt = secureInt) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** randInt from a float generator (e.g. seeded()). */
export const intFrom = (rand) => (n) => Math.floor(rand() * n);

export const shuffledDeck = (randInt) => shuffle(freshDeck(), randInt);
