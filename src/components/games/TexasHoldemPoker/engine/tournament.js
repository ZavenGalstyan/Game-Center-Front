/**
 * Single-table tournament manager (six players, equal stacks, rising blinds).
 *
 * Pure helpers around a table: the tournament object only tracks the blind
 * level, hands played and the elimination order; chips always live in the
 * table state. Players who bust in the same hand finish in order of the
 * stack they started that hand with (bigger stack = better place; equal
 * stacks share the order of seats left of the button).
 */

export const BLIND_LEVELS = [
  [10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400],
  [300, 600], [400, 800], [600, 1200], [800, 1600], [1000, 2000], [1500, 3000], [2000, 4000],
  [3000, 6000], [5000, 10000], [8000, 16000], [12000, 24000], [20000, 40000],
];

/** Tournament tiers (unlocked by player level). Entry is paid in play-money chips. */
export const TIERS = {
  bronze:  { id: "bronze", name: "Bronze Cup", level: 1, buyIn: 500, stack: 1500, handsPerLevel: 10, difficulty: "easy", xpMult: 1 },
  silver:  { id: "silver", name: "Silver Series", level: 5, buyIn: 1000, stack: 1500, handsPerLevel: 8, difficulty: "medium", xpMult: 1.4 },
  gold:    { id: "gold", name: "Gold Classic", level: 12, buyIn: 2500, stack: 2000, handsPerLevel: 8, difficulty: "hard", xpMult: 1.9 },
  diamond: { id: "diamond", name: "Diamond Masters", level: 20, buyIn: 5000, stack: 2000, handsPerLevel: 6, difficulty: "hard", xpMult: 2.6 },
};
export const TIER_IDS = Object.keys(TIERS);

/** Prize split of the pool (6 × buy-in) for 1st, 2nd, 3rd. */
export const PAYOUTS = [0.5, 0.3, 0.2];
export const PLACE_XP = [0, 250, 150, 100, 60, 40, 25];

export function newTournament({ tier = "bronze", handsPerLevel, players = 6 } = {}) {
  const t = TIERS[tier] || TIERS.bronze;
  return {
    tier: t.id,
    players,
    level: 0,
    handsPlayed: 0,
    handsPerLevel: handsPerLevel || t.handsPerLevel,
    eliminated: [], // [{ id, name, place, hand }] in bust order
    done: false,
    winner: null,
    prizePool: t.buyIn * players,
  };
}

export const blindsAt = (level) => {
  const [sb, bb] = BLIND_LEVELS[Math.min(level, BLIND_LEVELS.length - 1)];
  return { sb, bb };
};
export const handsToNextLevel = (t) => t.handsPerLevel - (t.handsPlayed % t.handsPerLevel);
export const prizeFor = (t, place) => (place >= 1 && place <= PAYOUTS.length ? Math.floor(t.prizePool * PAYOUTS[place - 1]) : 0);

/**
 * Book-keeping after a completed hand. Returns new { tour, table, events }.
 * Busted players are marked `out` on the table; blinds rise every
 * `handsPerLevel` hands (taking effect from the next hand).
 */
export function afterHand(tour, table) {
  const t = { ...tour, eliminated: tour.eliminated.slice() };
  const tb = { ...table, players: table.players.map((p) => ({ ...p })), blinds: { ...table.blinds } };
  const events = { eliminated: [], levelUp: null, done: false };
  t.handsPlayed += 1;

  const n = tb.players.length;
  const leftOfButton = (i) => (i - tb.dealer - 1 + n) % n;
  const busted = tb.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.out && p.stack === 0)
    .sort((a, b) => b.p.startStack - a.p.startStack || leftOfButton(a.i) - leftOfButton(b.i));
  let remaining = tb.players.filter((p) => !p.out).length;
  // worst finisher gets the lowest place: process from the smallest start stack
  for (const { p } of busted.slice().reverse()) {
    p.out = true;
    const rec = { id: p.id, name: p.name, place: remaining, hand: tb.handNo };
    remaining -= 1;
    t.eliminated.push(rec);
    events.eliminated.push(rec);
  }

  const alive = tb.players.filter((p) => !p.out);
  if (alive.length <= 1) {
    t.done = true;
    t.winner = alive[0] ? { id: alive[0].id, name: alive[0].name, place: 1 } : null;
    events.done = true;
  } else if (t.handsPlayed % t.handsPerLevel === 0 && t.level < BLIND_LEVELS.length - 1) {
    t.level += 1;
    tb.blinds = blindsAt(t.level);
    events.levelUp = { level: t.level, ...tb.blinds };
  }
  return { tour: t, table: tb, events };
}

/** Final standings: 1st … last (winner first, then eliminations newest first). */
export function standings(t, table) {
  const rows = [];
  if (t.winner) rows.push({ ...t.winner });
  else {
    table.players.filter((p) => !p.out).sort((a, b) => b.stack - a.stack).forEach((p) => rows.push({ id: p.id, name: p.name, place: null, stack: p.stack }));
  }
  t.eliminated.slice().sort((a, b) => a.place - b.place).forEach((e) => rows.push(e));
  return rows;
}
