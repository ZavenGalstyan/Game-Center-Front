/**
 * RulesConfig — card ranking/points per contract type and the rule presets.
 *
 * Strains (contract types): 0..3 = that suit is trump, "NT" = no trump,
 * "AT" = all trump. Every rule that differs between Armenian tables is an
 * explicit field of a rules object, so the engine never mixes conventions;
 * `makeRules(presetId, overrides)` builds one. RULES.md documents them.
 */
import { suitOf, rankOf, RJ, R9, RA, R10, RK, RQ, R8, R7 } from "./deck.js";

export const NT = "NT";
export const AT = "AT";
export const isSuitStrain = (strain) => Number.isInteger(strain) && strain >= 0 && strain < 4;

/* ------------------------------------------------------------ ranking */
// strength value per rank index (7 8 9 10 J Q K A); higher wins
const TRUMP_STRENGTH = [0, 1, 6, 4, 7, 2, 3, 5]; // J > 9 > A > 10 > K > Q > 8 > 7
const PLAIN_STRENGTH = [0, 1, 2, 6, 3, 4, 5, 7]; // A > 10 > K > Q > J > 9 > 8 > 7

/* ------------------------------------------------------------ points */
const TRUMP_POINTS = [0, 0, 14, 10, 20, 3, 4, 11]; // 62 per suit
const PLAIN_POINTS = [0, 0, 0, 10, 2, 3, 4, 11]; // 30 per suit
const NT_POINTS = [0, 0, 0, 10, 2, 3, 4, 19]; // 38 per suit → 152 (ace counts 19)
const AT_POINTS = [0, 0, 9, 5, 14, 2, 3, 6]; // 39 per suit → 156

export const LAST_TRICK_BONUS = 10;

/** Is this card a trump under the strain? (All Trump: every card; No Trump: none.) */
export function isTrump(card, strain) {
  if (strain === AT) return true;
  if (strain === NT) return false;
  return suitOf(card) === strain;
}

/** Rank strength of a card inside its own suit (used for comparing cards of one suit). */
export function strength(card, strain) {
  return isTrump(card, strain) ? TRUMP_STRENGTH[rankOf(card)] : PLAIN_STRENGTH[rankOf(card)];
}

export function cardPoints(card, strain) {
  const r = rankOf(card);
  if (strain === NT) return NT_POINTS[r];
  if (strain === AT) return AT_POINTS[r];
  return suitOf(card) === strain ? TRUMP_POINTS[r] : PLAIN_POINTS[r];
}

/** Total card points of a full deck under a strain (152 for every strain but All Trump's 156). */
export function deckPoints(strain) {
  let t = 0;
  for (let c = 0; c < 32; c++) t += cardPoints(c, strain);
  return t;
}

export const RANK_ORDER_TRUMP = [RJ, R9, RA, R10, RK, RQ, R8, R7];
export const RANK_ORDER_PLAIN = [RA, R10, RK, RQ, RJ, R9, R8, R7];

/* ------------------------------------------------------------ presets */

const BASE = {
  // dealing
  dealPattern: [3, 2, 3],
  // auction
  minBid: 8,
  maxBid: 16,
  bidStep: 1,
  allowNoTrump: true,
  allowAllTrump: false,
  allowKaput: true,
  allowContra: true,
  allowRecontra: true,
  allPass: "nextDealer", // nextDealer | sameDealer — who redeals after four opening passes
  // play
  firstLead: "leftOfDealer", // leftOfDealer | declarer
  mustTrump: true, // void in the led suit → must trump (unless the partner exception applies)
  mustOvertrump: true, // when an opponent's trump is winning, a trump played must beat it if possible
  undertrumpRequired: false, // can't beat the opponent's trump → still obliged to play a lower trump?
  partnerException: true, // partner winning the trick → void player may play any card
  overtrumpOnTrumpLead: true, // trump led: must play a higher trump if able, even over the partner
  allTrumpMustBeat: true, // All Trump: must beat the highest card of the led suit if able
  // declarations
  declarations: true,
  seqValues: { 3: 20, 4: 50, 5: 100 }, // 5 or more cards = 100
  quadValues: { [RJ]: 200, [R9]: 150, [RA]: 100, [R10]: 100, [RK]: 100, [RQ]: 100 },
  quadNinesInNoTrump: false, // four nines do not count in a No Trump contract
  declInNoTrump: true,
  declTie: "cancel", // cancel | eldest — equal best declarations (after the trump tie-break)
  // belote / rebelote
  belote: true,
  beloteValue: 20,
  beloteAward: "holder", // holder | contractOnly — counts only when the holder's team owns the contract
  // scoring (match scores are "small points": raw card points / 10)
  scoring: "bazaar", // bazaar | points
  handValue: 16, // 162 raw = 16 small points
  capotValue: 25, // a hand where one team takes all 8 tricks is worth 25 instead of 16
  kaputBid: 25, // contract value of a Kaput bid
  failedDecl: "allToDefenders", // allToDefenders | keepOwn
  multiplyDecl: false, // contra/recontra multiply declarations too?
  mustBeatDefenders: false, // contract also needs strictly more raw points than the defenders
  contraMult: 2,
  recontraMult: 4,
  // match
  targets: { quick: 101, standard: 201, long: 301 },
};

export const PRESETS = {
  armenianClassic: {
    id: "armenianClassic",
    ...BASE,
  },
  /** French-style point scoring on the same auction: each side keeps what it took when the contract is made. */
  classicPoints: {
    id: "classicPoints",
    ...BASE,
    allowNoTrump: true,
    allowAllTrump: true,
    scoring: "points",
    undertrumpRequired: true,
    declTie: "cancel",
    beloteAward: "holder",
    mustBeatDefenders: true,
    allPass: "nextDealer",
  },
};
export const PRESET_IDS = Object.keys(PRESETS);

/** Option keys the Settings screen may override, with their allowed values. */
export const VARIANT_OPTIONS = {
  allowNoTrump: [true, false],
  allowAllTrump: [true, false],
  allowKaput: [true, false],
  allowContra: [true, false],
  partnerException: [true, false],
  undertrumpRequired: [true, false],
  overtrumpOnTrumpLead: [true, false],
  declTie: ["cancel", "eldest"],
  failedDecl: ["allToDefenders", "keepOwn"],
  beloteAward: ["holder", "contractOnly"],
  allPass: ["nextDealer", "sameDealer"],
  firstLead: ["leftOfDealer", "declarer"],
};

export function makeRules(presetId = "armenianClassic", overrides = {}) {
  const base = PRESETS[presetId] || PRESETS.armenianClassic;
  const out = { ...base, seqValues: { ...base.seqValues }, quadValues: { ...base.quadValues }, targets: { ...base.targets }, dealPattern: base.dealPattern.slice() };
  for (const [k, v] of Object.entries(overrides || {})) {
    if (VARIANT_OPTIONS[k] && VARIANT_OPTIONS[k].includes(v)) out[k] = v;
  }
  return out;
}

/** Strains a player may bid under these rules, in display order. */
export function strainsFor(rules) {
  const s = [0, 1, 2, 3];
  if (rules.allowNoTrump) s.push(NT);
  if (rules.allowAllTrump) s.push(AT);
  return s;
}

/** Sanity check for a rules object restored from a save. */
export function validRules(r) {
  if (!r || typeof r !== "object" || !PRESETS[r.id]) return false;
  const p = PRESETS[r.id];
  for (const k of Object.keys(p)) {
    if (!(k in r)) return false;
    if (typeof p[k] !== typeof r[k]) return false;
  }
  return r.minBid >= 1 && r.maxBid >= r.minBid && r.bidStep >= 1;
}
