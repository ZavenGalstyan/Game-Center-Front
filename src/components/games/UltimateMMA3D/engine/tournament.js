/**
 * Eight-man knockout tournament: quarterfinals → semifinals → final.
 * The player occupies slot 0; AI-vs-AI bouts are resolved by actually
 * simulating the fight headlessly (same engine, AI on both sides).
 */
import { FIGHTERS, FIGHTER_BY_ID } from "../data/fighters.js";
import { Match } from "./match.js";
import { createAI } from "./ai.js";
import { SIM_DT, makeRng } from "./constants.js";

export const T_VERSION = 1;
export const ROUND_NAMES = ["Quarterfinals", "Semifinals", "Final"];

export function newTournament(playerId, { difficulty = "normal", arena = "national", roundTime = 120, seed = Date.now() % 1e9 } = {}) {
  const rng = makeRng(seed);
  const others = FIGHTERS.filter((f) => f.id !== playerId).map((f) => f.id);
  const field = [playerId];
  while (field.length < 8) field.push(others.splice(Math.floor(rng() * others.length), 1)[0]);
  // bracket[round] = list of matches {a, b, winner, method, detail}
  const qf = [];
  for (let i = 0; i < 8; i += 2) qf.push({ a: field[i], b: field[i + 1], winner: null });
  return { version: T_VERSION, seed, player: playerId, difficulty, arena, roundTime, round: 0, bracket: [qf, [], []], done: false, champion: null, eliminated: false };
}

/** The player's pending match this round (or null). */
export function playerMatch(t) {
  if (t.done || t.eliminated) return null;
  return t.bracket[t.round].find((m) => (m.a === t.player || m.b === t.player) && !m.winner) || null;
}

/** Headless AI-vs-AI fight; returns {winner, method, detail}. */
export function simulateBout(aId, bId, seed, roundTime = 90) {
  const m = new Match({ fighters: [{ data: FIGHTER_BY_ID[aId] }, { data: FIGHTER_BY_ID[bId] }], seed, rounds: 3, roundTime, restTime: 0.05 });
  const ais = [createAI(m, 0, "hard"), createAI(m, 1, "hard")];
  m.begin();
  for (let i = 0; i < 60 * 60 * 12 && m.phase !== "ended"; i++) {
    for (const a of ais) a.update(SIM_DT);
    m.step(SIM_DT);
  }
  let w = m.result?.winner;
  if (w === undefined || w < 0) w = makeRng(seed)() < 0.5 ? 0 : 1; // tournament needs a winner: judges' tiebreak
  return { winner: w === 0 ? aId : bId, method: m.result?.method === "DRAW" ? "DEC" : m.result?.method || "DEC", detail: m.result?.method === "DRAW" ? "Judges' tiebreak" : m.result?.detail || "Decision" };
}

/** Record the player's result, simulate the rest of the round, build the next. */
export function reportPlayer(t0, won, method, detail) {
  const t = JSON.parse(JSON.stringify(t0));
  const pm = playerMatch(t);
  if (!pm) return t;
  pm.winner = won ? t.player : pm.a === t.player ? pm.b : pm.a;
  pm.method = method;
  pm.detail = detail;
  if (!won) t.eliminated = true;
  return advance(t);
}

/** Simulate every remaining bout of the current round and set up the next one. */
export function advance(t) {
  let waiting = false;
  for (const [i, m] of t.bracket[t.round].entries()) {
    if (m.winner) continue;
    if (!t.eliminated && (m.a === t.player || m.b === t.player)) {
      waiting = true; // the player's bout is fought for real
      continue;
    }
    const r = simulateBout(m.a, m.b, t.seed + t.round * 100 + i, Math.min(90, t.roundTime));
    Object.assign(m, r);
  }
  if (waiting) return t;
  if (t.round === 2) {
    t.done = true;
    t.champion = t.bracket[2][0].winner;
    return t;
  }
  const winners = t.bracket[t.round].map((m) => m.winner);
  const next = [];
  for (let i = 0; i < winners.length; i += 2) next.push({ a: winners[i], b: winners[i + 1], winner: null });
  t.round++;
  t.bracket[t.round] = next;
  if (t.eliminated) return advance(t);
  return t;
}

export function sanitizeTournament(t) {
  if (!t || t.version !== T_VERSION || !FIGHTER_BY_ID[t.player] || !Array.isArray(t.bracket) || t.bracket.length !== 3) return null;
  if (!t.bracket[0].every((m) => FIGHTER_BY_ID[m.a] && FIGHTER_BY_ID[m.b])) return null;
  return t;
}
