/**
 * Island Conquest — balance probe: a bot plays the PLAYER side of every
 * level (several bot strengths, several seeds) against the level's real AI.
 *   node tools/balance.mjs [fromId] [toId]
 * Prints win/loss + battle time; used to set star times and tune maps.
 */
import { Engine } from "../engine/engine.js";
import { createAI } from "../engine/ai.js";
import { STEP, PLAYER } from "../engine/constants.js";
import { LEVELS } from "../data/levels.js";

export function play(L, bot, seed = 1, maxT = 900) {
  const e = new Engine();
  e.load({ ...L, seed: (L.seed ?? L.id * 7919) + seed * 101 });
  let s = seed * 7;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  e.ais.push(createAI(PLAYER, { level: bot, delay: 0.5 }, rand));
  let res = null;
  e.cb.over = (x) => (res = x);
  for (let t = 0; t < maxT / STEP && !e.ended; t++) {
    e.step(STEP);
    e.events.length = 0;
  }
  return res || { result: "timeout", time: maxT };
}

if ((process.argv[1] || "").endsWith("balance.mjs")) {
  const from = +(process.argv[2] || 1);
  const to = +(process.argv[3] || 50);
  for (const L of LEVELS.filter((l) => l.id >= from && l.id <= to)) {
    const row = [];
    for (const bot of ["expert", "hard", "normal"]) {
      const rs = [1, 2, 3].map((sd) => play(L, bot, sd));
      const wins = rs.filter((r) => r.result === "won");
      const avg = wins.length ? Math.round(wins.reduce((a, r) => a + r.time, 0) / wins.length) : "-";
      row.push(`${bot}:${wins.length}/3 ${String(avg).padStart(4)}s`);
    }
    console.log(`${String(L.id).padStart(2)} ${L.name.padEnd(24)} ${row.join("  ")}`);
  }
}
