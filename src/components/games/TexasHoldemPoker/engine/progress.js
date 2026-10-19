/**
 * Player progression: XP / levels 1–30, cosmetic unlocks, statistics and
 * achievements. Everything here is cosmetic or bookkeeping — nothing feeds
 * back into dealing or the AI, so progress can never change card odds.
 *
 * recordHand / recordTournament are pure: (profile, facts) → { profile, events }.
 * They only ever see facts taken from a completed engine hand.
 */
import { evaluate, categoryOf, CAT, isRoyal } from "./evaluator.js";
import { chen } from "./ai.js";

export const MAX_LEVEL = 30;
/** XP to go from level k to k+1. */
export const xpToNext = (k) => 60 + 30 * (k - 1);
export function levelInfo(xp) {
  let level = 1, need = xpToNext(1), into = Math.max(0, Math.floor(xp) || 0);
  while (level < MAX_LEVEL && into >= need) { into -= need; level++; need = xpToNext(level); }
  return { level, into: level >= MAX_LEVEL ? need : into, need, max: level >= MAX_LEVEL };
}

export const THEMES = [
  { id: "green", name: "Classic Green", level: 1 },
  { id: "blue", name: "Royal Blue", level: 3 },
  { id: "black", name: "Midnight Black", level: 6 },
  { id: "gold", name: "Luxury Gold", level: 10 },
  { id: "neon", name: "Neon Purple", level: 15 },
];
export const CARD_BACKS = [
  { id: "crimson", name: "Crimson Lattice", level: 1 },
  { id: "navy", name: "Navy Diamond", level: 2 },
  { id: "emerald", name: "Emerald Weave", level: 5 },
  { id: "filigree", name: "Gold Filigree", level: 12 },
  { id: "neon", name: "Neon Grid", level: 20 },
];
export const CHIP_SETS = [
  { id: "classic", name: "Classic Clay", level: 1 },
  { id: "casino", name: "Casino Inlay", level: 4 },
  { id: "jewel", name: "Jewel Tone", level: 9 },
  { id: "neon", name: "Neon Glow", level: 18 },
];
export const FRAMES = [
  { id: "bronze", name: "Bronze", level: 1 },
  { id: "silver", name: "Silver", level: 7 },
  { id: "gold", name: "Gold", level: 14 },
  { id: "platinum", name: "Platinum", level: 22 },
  { id: "diamond", name: "Diamond", level: 30 },
];
export const COSMETICS = { theme: THEMES, cardBack: CARD_BACKS, chips: CHIP_SETS, frame: FRAMES };

export const ACHIEVEMENTS = [
  { id: "first_win", name: "First Win", desc: "Win your first hand.", xp: 25 },
  { id: "full_house", name: "Full House", desc: "Win a pot with a full house.", xp: 40 },
  { id: "flush_master", name: "Flush Master", desc: "Win a pot with a flush.", xp: 40 },
  { id: "straight_king", name: "Straight King", desc: "Win a pot with a straight.", xp: 40 },
  { id: "quads", name: "Four of a Kind", desc: "Win a pot with four of a kind.", xp: 80 },
  { id: "straight_flush", name: "Straight Flush", desc: "Make a straight flush.", xp: 120 },
  { id: "royal_legend", name: "Royal Legend", desc: "Make a royal flush.", xp: 300 },
  { id: "allin_hero", name: "All-In Hero", desc: "Win a showdown after going all-in.", xp: 50 },
  { id: "bluff_master", name: "Bluff Master", desc: "Bet with a weak hand and make everyone fold.", xp: 50 },
  { id: "hot_streak", name: "Hot Streak", desc: "Win three hands in a row.", xp: 60 },
  { id: "high_roller", name: "High Roller", desc: "Win a single pot of 5,000 chips or more.", xp: 80 },
  { id: "regular", name: "Table Regular", desc: "Play 100 hands.", xp: 100 },
  { id: "final_table", name: "In the Money", desc: "Finish a tournament in the top three.", xp: 60 },
  { id: "champion", name: "Poker Champion", desc: "Win a tournament.", xp: 150 },
  { id: "grinder", name: "Tournament Grinder", desc: "Enter five tournaments.", xp: 60 },
];
export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);

export const DEFAULT_SETTINGS = {
  timer: 30,          // seconds per human decision; 0 = off
  speed: "normal",    // slow | normal | fast
  reducedMotion: false,
  ambient: true,
  autoNext: false,
  fourColor: false,
  hints: true,        // hand-strength label for your own hand
};
const SETTING_CHOICES = { timer: [0, 15, 30, 60], speed: ["slow", "normal", "fast"] };

export const STARTING_BANKROLL = 10000;
export const REFILL_AMOUNT = 5000;

export function defaultProfile() {
  return {
    xp: 0,
    bankroll: STARTING_BANKROLL,
    stats: {
      handsPlayed: 0, handsWon: 0, showdownsWon: 0, tournamentsEntered: 0, tournamentsWon: 0,
      biggestPot: 0, chipsEarned: 0, bestHand: null, streak: 0, bestStreak: 0,
    },
    achievements: {}, // id → unlock timestamp
    cosmetics: { theme: "green", cardBack: "crimson", chips: "classic", frame: "bronze" },
    settings: { ...DEFAULT_SETTINGS },
    name: "You",
  };
}

const num = (x, d = 0) => (Number.isFinite(x) && x >= 0 ? Math.floor(x) : d);

/** Rebuilds a profile from untrusted saved data, field by field. */
export function sanitizeProfile(raw) {
  const p = defaultProfile();
  if (!raw || typeof raw !== "object") return p;
  p.xp = num(raw.xp);
  p.bankroll = Math.min(num(raw.bankroll, STARTING_BANKROLL), 1e12);
  const st = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
  for (const k of Object.keys(p.stats)) if (k !== "bestHand") p.stats[k] = num(st[k]);
  const bh = st.bestHand;
  if (bh && Number.isFinite(bh.score) && Array.isArray(bh.cards) && bh.cards.every((c) => Number.isInteger(c) && c >= 0 && c < 52)) {
    p.stats.bestHand = { score: bh.score, desc: String(bh.desc || ""), cards: bh.cards.slice(0, 5) };
  }
  if (raw.achievements && typeof raw.achievements === "object") {
    for (const id of ACHIEVEMENT_IDS) if (Number.isFinite(raw.achievements[id])) p.achievements[id] = raw.achievements[id];
  }
  const lvl = levelInfo(p.xp).level;
  const c = raw.cosmetics || {};
  for (const [slot, list] of Object.entries(COSMETICS)) {
    const item = list.find((x) => x.id === c[slot]);
    if (item && item.level <= lvl) p.cosmetics[slot] = item.id;
  }
  const s = raw.settings || {};
  if (SETTING_CHOICES.timer.includes(s.timer)) p.settings.timer = s.timer;
  if (SETTING_CHOICES.speed.includes(s.speed)) p.settings.speed = s.speed;
  for (const k of ["reducedMotion", "ambient", "autoNext", "fourColor", "hints"]) if (typeof s[k] === "boolean") p.settings[k] = s[k];
  return p;
}

export const isUnlocked = (profile, item) => levelInfo(profile.xp).level >= item.level;

function addXp(profile, amount, events, reason) {
  if (amount <= 0) return;
  const before = levelInfo(profile.xp).level;
  profile.xp += Math.round(amount);
  events.xp += Math.round(amount);
  if (reason) events.reasons.push(`${reason} +${Math.round(amount)} XP`);
  const after = levelInfo(profile.xp).level;
  if (after > before) {
    events.levelUp = after;
    for (const [slot, list] of Object.entries(COSMETICS)) {
      for (const it of list) if (it.level > before && it.level <= after) events.unlocks.push({ slot, ...it });
    }
  }
}

function unlock(profile, id, events) {
  if (profile.achievements[id]) return;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return;
  profile.achievements[id] = Date.now();
  events.achievements.push(a);
  addXp(profile, a.xp, events, a.name);
}

const blankEvents = () => ({ xp: 0, reasons: [], achievements: [], levelUp: null, unlocks: [] });
const copy = (p) => JSON.parse(JSON.stringify(p));

/**
 * Facts about the human's (seat `seat`) result in a completed hand.
 * Pure function of the engine state, shared with tests.
 */
export function handFacts(table, seat = 0) {
  const me = table.players[seat];
  const res = table.result;
  const won = res ? res.awards[seat] || 0 : 0;
  const winner = !!res && res.winners.includes(seat);
  const committed = me.total;
  const net = me.stack - me.startStack;
  const sawRiver = !me.folded && table.board.length === 5;
  const ev = sawRiver ? evaluate([...me.hole, ...table.board]) : null;
  const allInAction = table.actions.some((a) => a.seat === seat && a.type === "allin");
  const shownHand = res && res.hands[seat];
  let bluff = false;
  if (winner && res && !res.showdown) {
    const myAggr = [...table.actions].reverse().find((a) => a.seat === seat && (a.type === "bet" || a.type === "raise" || a.type === "allin"));
    if (myAggr) {
      const boardAt = myAggr.street === "preflop" ? [] : table.board.slice(0, myAggr.street === "flop" ? 3 : myAggr.street === "turn" ? 4 : 5);
      bluff = boardAt.length >= 3
        ? categoryOf(evaluate([...me.hole, ...boardAt]).score) === CAT.HIGH
        : chen(me.hole) < 5;
    }
  }
  const potSize = res ? res.pots.reduce((a, p) => a + p.amount, 0) : 0;
  return {
    dealt: me.inHand, won, winner, net, committed, potSize,
    showdown: !!(res && res.showdown && !me.folded),
    showdownWin: !!(res && res.showdown && winner),
    category: shownHand ? shownHand.category : null,
    madeHand: ev, allIn: allInAction, bluff, bb: table.blinds.bb,
  };
}

/** Applies a completed hand to the profile (quick play / tournament only). */
export function recordHand(profileIn, facts) {
  const profile = copy(profileIn);
  const events = blankEvents();
  if (!facts.dealt) return { profile, events };
  const st = profile.stats;
  st.handsPlayed++;
  addXp(profile, 2, events);
  if (facts.winner) {
    st.handsWon++;
    st.streak++;
    st.bestStreak = Math.max(st.bestStreak, st.streak);
    if (facts.showdownWin) st.showdownsWon++;
    st.biggestPot = Math.max(st.biggestPot, facts.won);
    addXp(profile, 6 + Math.min(24, Math.floor(facts.potSize / (facts.bb * 5))), events, "Pot won");
  } else {
    st.streak = 0;
  }
  if (facts.net > 0) st.chipsEarned += facts.net;
  if (facts.madeHand && (!st.bestHand || facts.madeHand.score > st.bestHand.score)) {
    st.bestHand = { score: facts.madeHand.score, desc: facts.madeHand.desc, cards: facts.madeHand.best };
  }

  if (facts.winner) unlock(profile, "first_win", events);
  if (facts.showdownWin) {
    if (facts.category === CAT.FULL_HOUSE) unlock(profile, "full_house", events);
    if (facts.category === CAT.FLUSH) unlock(profile, "flush_master", events);
    if (facts.category === CAT.STRAIGHT) unlock(profile, "straight_king", events);
    if (facts.category === CAT.QUADS) unlock(profile, "quads", events);
    if (facts.allIn) unlock(profile, "allin_hero", events);
  }
  if (facts.madeHand && categoryOf(facts.madeHand.score) === CAT.STRAIGHT_FLUSH) {
    unlock(profile, "straight_flush", events);
    if (isRoyal(facts.madeHand.score)) unlock(profile, "royal_legend", events);
  }
  if (facts.bluff) unlock(profile, "bluff_master", events);
  if (st.streak >= 3) unlock(profile, "hot_streak", events);
  if (facts.winner && facts.won >= 5000) unlock(profile, "high_roller", events);
  if (st.handsPlayed >= 100) unlock(profile, "regular", events);
  return { profile, events };
}

export function recordTournamentEntry(profileIn) {
  const profile = copy(profileIn);
  const events = blankEvents();
  profile.stats.tournamentsEntered++;
  if (profile.stats.tournamentsEntered >= 5) unlock(profile, "grinder", events);
  return { profile, events };
}

/** Final tournament result: place XP × tier multiplier, achievements. Prize chips are added by the caller. */
export function recordTournament(profileIn, { place, xpMult = 1, placeXp }) {
  const profile = copy(profileIn);
  const events = blankEvents();
  addXp(profile, (placeXp[place] || 0) * xpMult, events, `Finished #${place}`);
  if (place === 1) {
    profile.stats.tournamentsWon++;
    unlock(profile, "champion", events);
  }
  if (place <= 3) unlock(profile, "final_table", events);
  return { profile, events };
}
