/**
 * AI self-play statistics (balance check, not a pass/fail test).
 *   node src/components/games/TexasHoldemPoker/tools/aiSim.mjs [hands]
 * Prints VPIP / PFR / aggression / showdown rate per profile, and the chip
 * result of hard vs easy opponents at mixed tables.
 */
import { createTable, startHand } from "../engine/table.js";
import { PROFILES, observeHand, readTendency } from "../engine/ai.js";
import { playHand } from "../engine/simulate.js";
import { seeded, intFrom, shuffledDeck } from "../engine/cards.js";

const HANDS = Number(process.argv[2]) || 1500;
const rand = seeded(2024), ri = intFrom(rand);
const ids = Object.keys(PROFILES);

function run(diffOf) {
  let memory = {};
  const net = {};
  let s = createTable({ players: ids.map((id, i) => ({ id, name: id, stack: 2000, ai: true, profile: id, diff: diffOf(i) })), blinds: { sb: 10, bb: 20 } });
  let showdowns = 0, hands = 0;
  for (let h = 0; h < HANDS; h++) {
    // keep stacks topped up to 100bb so every hand is comparable
    s = { ...s, players: s.players.map((p) => { net[p.id] = (net[p.id] || 0) + (p.stack - 2000); return { ...p, stack: 2000 }; }) };
    const r = startHand(s, shuffledDeck(ri));
    s = playHand(r.state, { rand, memory, sims: 120 });
    memory = observeHand(memory, s);
    hands++;
    if (s.result.showdown) showdowns++;
  }
  s.players.forEach((p) => { net[p.id] += p.stack - 2000; });
  return { memory, net, showdowns, hands };
}

const t0 = Date.now();
const a = run(() => "medium");
console.log(`\nAll medium, ${HANDS} hands (${((Date.now() - t0) / HANDS).toFixed(1)} ms/hand), showdown rate ${(a.showdowns / a.hands * 100).toFixed(0)}%`);
console.log("profile   VPIP  PFR  AGG  fold-to-bet   net chips (bb/100)");
for (const id of ids) {
  const r = readTendency(a.memory[id]);
  console.log(`${id.padEnd(8)} ${(r.vpip * 100).toFixed(0).padStart(4)}% ${(r.pfr * 100).toFixed(0).padStart(3)}% ${(r.aggression * 100).toFixed(0).padStart(3)}%   ${(r.foldToBet * 100).toFixed(0).padStart(4)}%        ${(a.net[id] / 20 / HANDS * 100).toFixed(1)}`);
}
const b = run((i) => (i % 2 ? "hard" : "easy"));
let easy = 0, hard = 0;
ids.forEach((id, i) => { if (i % 2) hard += b.net[id]; else easy += b.net[id]; });
console.log(`\nMixed table: hard seats ${(hard / 20 / HANDS * 100).toFixed(1)} bb/100, easy seats ${(easy / 20 / HANDS * 100).toFixed(1)} bb/100`);
