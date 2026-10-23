/**
 * Level generator (offline):  node src/components/games/BlockEscape/tools/generate.mjs
 * (spawns one search worker per tier × seed in parallel; results are merged in
 * seed order, so the output is deterministic regardless of timing.)
 *
 * Deterministic (seeded). For a random set of blocks it explores the whole
 * reachable state space, runs a multi-source BFS back from every solved
 * state, and keeps the start state that is furthest from a solution — a
 * puzzle whose optimum is exactly that distance. Writes ../levels.js.
 */
import { writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as E from "../engine.js";

let seed = 20261022;
const rnd = () => {
  let t = (seed = (seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ri = (n) => Math.floor(rnd() * n);

function randomBoard(count, long = 0.28) {
  const g = Array(36).fill(".");
  const put = (ch, cellsList) => (cellsList.every((c) => g[c] === ".") ? (cellsList.forEach((c) => (g[c] = ch)), true) : false);
  const ax = ri(3);
  put("A", [12 + ax, 13 + ax]);
  const letters = "BCDEFGHIJKLMNOPQ";
  let placed = 0;
  for (let tries = 0; placed < count && tries < 300; tries++) {
    const len = rnd() < 1 - long ? 2 : 3, h = rnd() < 0.5;
    const line = ri(6), p = ri(7 - len);
    if (h && line === E.EXIT_ROW) continue; // a horizontal block on the exit row could never clear
    const c = Array.from({ length: len }, (_, k) => (h ? line * 6 + p + k : (p + k) * 6 + line));
    if (put(letters[placed], c)) placed++;
  }
  return g.join("");
}

/** Best (furthest-from-solved) start for this block set, or null. */
function hardest(str, cap = 120000) {
  const { blocks, pos } = E.parse(str);
  const seen = new Map([[E.key(pos), pos]]);
  const queue = [pos];
  for (let h = 0; h < queue.length; h++) {
    for (const [i, q] of E.moves(blocks, queue[h])) {
      const np = queue[h].slice();
      np[i] = q;
      const k = E.key(np);
      if (!seen.has(k)) {
        if (seen.size > cap) return null;
        seen.set(k, np);
        queue.push(np);
      }
    }
  }
  // multi-source BFS from solved states (moves are reversible)
  const dist = new Map();
  let frontier = queue.filter((p) => E.isSolved(blocks, p));
  if (!frontier.length) return null;
  frontier.forEach((p) => dist.set(E.key(p), 0));
  let d = 0, last = frontier;
  while (frontier.length) {
    last = frontier;
    const next = [];
    d++;
    for (const p of frontier)
      for (const [i, q] of E.moves(blocks, p)) {
        const np = p.slice();
        np[i] = q;
        const k = E.key(np);
        if (!dist.has(k)) dist.set(k, d), next.push(np);
      }
    frontier = next;
  }
  // prefer, among the furthest states, the one with the fewest immediate moves (tighter look)
  const pick = last.reduce((a, b) => (E.moves(blocks, b).length < E.moves(blocks, a).length ? b : a));
  return { str: E.serialize(blocks, pick), par: d - 1, states: seen.size };
}

const TIERS = [
  { name: "easy", count: 35, min: 4, max: 10, blocks: [6, 9], long: 0.28, want: 4 },
  { name: "medium", count: 35, min: 11, max: 19, blocks: [8, 12], long: 0.3, want: 4 },
  { name: "hard", count: 30, min: 20, max: 60, blocks: [10, 13], long: 0.38, want: 1 },
];
const WORKERS = 15;

// worker:  generate.mjs search <tier> <seed>  → JSON array of candidates
if (process.argv[2] === "search") {
  const tier = TIERS.find((t) => t.name === process.argv[3]);
  seed = Number(process.argv[4]);
  const got = [];
  const need = Math.ceil((tier.count * tier.want) / WORKERS) + 1;
  for (let tries = 0; got.length < need && tries < 2000000; tries++) {
    const n = tier.blocks[0] + ri(tier.blocks[1] - tier.blocks[0] + 1);
    const r = hardest(randomBoard(n, tier.long));
    if (r && r.par >= tier.min && r.par <= tier.max) got.push(r);
  }
  process.stdout.write(JSON.stringify(got));
  process.exit(0);
}

const self = fileURLToPath(import.meta.url);
const run = (tier, s) =>
  new Promise((res, rej) => execFile(process.execPath, [self, "search", tier, String(s)], { maxBuffer: 1 << 26 }, (err, out) => (err ? rej(err) : res(JSON.parse(out)))));

const used = new Set();
const out = [];
for (const tier of TIERS) {
  const t0 = Date.now();
  const batches = await Promise.all(Array.from({ length: WORKERS }, (_, k) => run(tier.name, 1000 * (TIERS.indexOf(tier) + 1) + k)));
  const got = batches.flat().filter((r) => !used.has(r.str) && (used.add(r.str), true));
  // spread evenly over the tier's par range, then ascending
  got.sort((a, b) => a.par - b.par);
  const byPar = new Map();
  for (const r of got) (byPar.get(r.par) ?? byPar.set(r.par, []).get(r.par)).push(r);
  const pars = [...byPar.keys()];
  const pick = [];
  for (let round = 0; pick.length < tier.count; round++) {
    let added = false;
    for (const p of pars) if (pick.length < tier.count && byPar.get(p)[round]) pick.push(byPar.get(p)[round]), (added = true);
    if (!added) throw new Error(`not enough ${tier.name} candidates`);
  }
  pick.sort((a, b) => a.par - b.par || a.states - b.states);
  console.log(tier.name, got.length, "candidates in", ((Date.now() - t0) / 1000).toFixed(0), "s; pars", pick.map((r) => r.par).join(","));
  for (const r of pick) out.push([r.str, r.par, tier.name]);
}

writeFileSync(
  new URL("../levels.js", import.meta.url),
  `/** Block Escape levels — generated by tools/generate.mjs and validated by
 *  tools/engineTest.mjs (BFS confirms every optimum). [board, optimal moves, tier] */
export const LEVELS = [
${out.map((l) => `  ${JSON.stringify(l)},`).join("\n")}
];
`,
);
console.log("wrote", out.length, "levels");
