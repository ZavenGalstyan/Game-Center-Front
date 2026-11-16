/**
 * A tournament stage in play: the table (shared Hold'em state machine), the
 * blind level, hands played, eliminations, the AI's opponent memory and the
 * result. Pure functions over plain JSON (saved to localStorage as-is).
 *
 * Seat 0 is always the human. Rivals sit in seats 1..n in stage order.
 */
import {
  createTable, startHand, applyAction, advance, viewFor, decide, observeHand, validateTable, shuffledDeck, legalActions,
} from "./poker.js";
import { stageById, blindLevels } from "./stages.js";
import { RIVALS, profileFor } from "./rivals.js";

export const HUMAN = 0;
export const MATCH_VERSION = 1;

export function createMatch(stageId, { playerName = "You" } = {}) {
  const st = stageById(stageId);
  if (!st) throw new Error(`no stage ${stageId}`);
  const levels = blindLevels(st.bb);
  const players = [
    { id: "you", name: playerName, stack: st.stack, ai: false },
    ...st.rivals.map((rid) => ({ id: rid, name: RIVALS[rid].name, stack: st.stack, ai: true, profile: rid, diff: st.diff })),
  ];
  return {
    v: MATCH_VERSION,
    stageId,
    level: 0,
    handsPlayed: 0,
    eliminated: [], // { id, place, hand }
    done: false,
    result: null, // { won, place, reason: 'busted-all' | 'sundown' | 'busted' }
    memory: {},
    table: createTable({ players, blinds: levels[0] }),
  };
}

export const bankOf = (m) => stageById(m.stageId).stack * m.table.players.length;
export const levelsOf = (m) => blindLevels(stageById(m.stageId).bb);
export const handsToNextLevel = (m) => {
  const st = stageById(m.stageId);
  return st.handsPerLevel - (m.handsPlayed % st.handsPerLevel);
};
export const handsLeft = (m) => Math.max(0, stageById(m.stageId).sundown - m.handsPlayed);

/** Deals the next hand. `deck` = a shuffled 52-card array (caller owns randomness). */
export function dealNext(m, deck = shuffledDeck()) {
  if (m.done) return { match: m, error: "Match over" };
  const r = startHand(m.table, deck);
  if (r.error) return { match: m, error: r.error };
  return { match: { ...m, table: r.state }, error: null };
}

export function act(m, seat, action) {
  const r = applyAction(m.table, seat, action);
  if (r.error) return { match: m, error: r.error };
  return { match: { ...m, table: r.state }, error: null };
}

export function step(m) {
  const r = advance(m.table);
  if (r.error) return { match: m, error: r.error };
  return { match: { ...m, table: r.state }, error: null };
}

/** The AI's move for the seat to act (sees only viewFor(seat)). */
export function aiMove(m, rand = Math.random, sims) {
  const s = m.table;
  if (s.phase !== "betting") return null;
  const seat = s.toAct;
  const p = s.players[seat];
  if (!p.ai) return null;
  return decide(viewFor(s, seat), { profile: profileFor(p.profile), difficulty: p.diff || "medium", rand, memory: m.memory, tournament: true, sims });
}

/**
 * Book-keeping after a completed hand: memory, busts (bigger starting stack
 * finishes higher), blind level, sundown and the stage result.
 * Returns { match, events: { eliminated: [], levelUp, done } }.
 */
export function afterHand(mIn) {
  if (mIn.table.phase !== "complete") return { match: mIn, events: null };
  const st = stageById(mIn.stageId);
  const m = { ...mIn, eliminated: mIn.eliminated.slice(), memory: observeHand(mIn.memory, mIn.table) };
  const tb = { ...m.table, players: m.table.players.map((p) => ({ ...p })), blinds: { ...m.table.blinds } };
  const events = { eliminated: [], levelUp: null, done: false };
  m.handsPlayed += 1;

  const n = tb.players.length;
  const leftOfButton = (i) => (i - tb.dealer - 1 + n) % n;
  const busted = tb.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.out && p.stack === 0)
    .sort((a, b) => b.p.startStack - a.p.startStack || leftOfButton(a.i) - leftOfButton(b.i));
  let remaining = tb.players.filter((p) => !p.out).length;
  for (const { p, i } of busted.slice().reverse()) {
    p.out = true;
    const rec = { id: p.id, seat: i, place: remaining, hand: tb.handNo };
    remaining -= 1;
    m.eliminated.push(rec);
    events.eliminated.push(rec);
  }

  const alive = tb.players.map((p, i) => i).filter((i) => !tb.players[i].out);
  const human = tb.players[HUMAN];
  if (human.out) {
    m.done = true;
    m.result = { won: false, place: m.eliminated.find((e) => e.seat === HUMAN).place, reason: "busted" };
  } else if (alive.length === 1) {
    m.done = true;
    m.result = { won: true, place: 1, reason: "busted-all" };
  } else if (m.handsPlayed >= st.sundown) {
    // sundown: the biggest stack takes the stage (a tie for the lead is not a win)
    const order = alive.slice().sort((a, b) => tb.players[b].stack - tb.players[a].stack);
    const top = tb.players[order[0]].stack;
    const leaders = order.filter((i) => tb.players[i].stack === top);
    const won = leaders.length === 1 && leaders[0] === HUMAN;
    m.done = true;
    m.result = { won, place: order.indexOf(HUMAN) + 1, reason: "sundown", leader: order[0] };
  } else if (m.handsPlayed % st.handsPerLevel === 0) {
    const levels = blindLevels(st.bb);
    if (m.level < levels.length - 1) {
      m.level += 1;
      tb.blinds = { ...levels[m.level] };
      events.levelUp = { level: m.level, ...tb.blinds };
    }
  }
  events.done = m.done;
  m.table = tb;
  return { match: m, events };
}

/** Error string or null; checks the saved match is playable and chips add up. */
export function validateMatch(m) {
  try {
    if (!m || m.v !== MATCH_VERSION) return "bad version";
    const st = stageById(m.stageId);
    if (!st) return "bad stage";
    if (!Number.isInteger(m.handsPlayed) || m.handsPlayed < 0 || !Number.isInteger(m.level) || m.level < 0) return "bad counters";
    if (!Array.isArray(m.eliminated) || typeof m.memory !== "object" || !m.memory) return "bad meta";
    const t = m.table;
    if (!t || !Array.isArray(t.players) || t.players.length !== st.rivals.length + 1) return "bad seats";
    if (t.players[HUMAN].ai !== false || t.players.slice(1).some((p, i) => p.id !== st.rivals[i] || !p.ai)) return "bad lineup";
    return validateTable(t, bankOf(m));
  } catch {
    return "corrupt";
  }
}

/** Is it the human's decision right now? Returns legalActions or null. */
export const humanTurn = (m) => (m && !m.done ? legalActions(m.table, HUMAN) : null);

/* ------------------------------------------------------------ headless play */

/** Plays the current hand out; `human(view, table)` decides for seat 0 (defaults to the AI with a balanced profile). */
export function playOutHand(mIn, { rand = Math.random, human, sims } = {}) {
  let m = mIn;
  let guard = 0;
  while (m.table.phase !== "complete") {
    if (++guard > 600) throw new Error("hand did not finish");
    if (m.table.phase === "betting") {
      const seat = m.table.toAct;
      const a = seat === HUMAN
        ? (human ? human(viewFor(m.table, HUMAN), m.table) : decide(viewFor(m.table, HUMAN), { profile: { loose: 0, aggr: 0.6, bluff: 0.12, call: 0.5, sizing: 0.65, risk: 0.55, mix: 0.08 }, difficulty: "medium", rand, memory: m.memory, tournament: true, sims }))
        : aiMove(m, rand, sims);
      const r = act(m, seat, a);
      if (r.error) throw new Error(`illegal action ${JSON.stringify(a)} for seat ${seat}: ${r.error}`);
      m = r.match;
    } else {
      m = step(m).match;
    }
  }
  return m;
}
