/** Headless rules tests: `node src/components/games/MemoryCards/tools/engineTest.mjs` */
import { LEVELS, newGame, reduce, timeOf, formatTime, totalPairs } from "../engine.js";

let fails = 0;
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails++;
};
const pairOf = (s, i) => s.cards.findIndex((c, k) => k !== i && c.face === s.cards[i].face);
const missOf = (s, i) => s.cards.findIndex((c, k) => k !== i && !c.matched && c.face !== s.cards[i].face);

// --- deck sizes and pairs
for (const [id, l] of Object.entries(LEVELS)) {
  const s = newGame(id);
  const counts = {};
  for (const c of s.cards) counts[c.face] = (counts[c.face] || 0) + 1;
  check(`${id}: ${l.cols}x${l.rows} = ${s.cards.length} cards`, s.cards.length === l.cols * l.rows);
  check(`${id}: ${totalPairs(s)} pairs, each face exactly twice`, Object.keys(counts).length === totalPairs(s) && Object.values(counts).every((n) => n === 2));
}
check("easy 6 / medium 8 / hard 12 pairs", [6, 8, 12].every((n, k) => totalPairs(newGame(["easy", "medium", "hard"][k])) === n));

// --- shuffling
const orders = new Set(Array.from({ length: 30 }, () => newGame("hard").cards.map((c) => c.face).join(",")));
check("30 hard deals are (nearly) all different", orders.size >= 29);

// --- match
let s = newGame("easy");
s = reduce(s, { type: "flip", index: 0, now: 1000 });
check("first flip opens a card and starts the clock", s.open.length === 1 && s.since === 1000 && s.moves === 0);
check("re-clicking the open card is ignored", reduce(s, { type: "flip", index: 0, now: 1100 }) === s);
const p = pairOf(s, 0);
s = reduce(s, { type: "flip", index: p, now: 2000 });
check("match keeps both face up, counts move + pair", s.cards[0].matched && s.cards[p].matched && s.open.length === 0 && s.moves === 1 && s.pairs === 1);
check("clicking a matched card is ignored", reduce(s, { type: "flip", index: 0, now: 2100 }) === s);

// --- mismatch + lock
const a = s.cards.findIndex((c) => !c.matched);
s = reduce(s, { type: "flip", index: a, now: 3000 });
const b = missOf(s, a);
s = reduce(s, { type: "flip", index: b, now: 3100 });
check("mismatch leaves two open, counts a move, no pair", s.open.length === 2 && s.moves === 2 && s.pairs === 1);
const third = s.cards.findIndex((c, k) => !c.matched && k !== a && k !== b);
check("third flip while two are open is locked", reduce(s, { type: "flip", index: third, now: 3200 }) === s);
s = reduce(s, { type: "hide" });
check("hide flips the mismatch back", s.open.length === 0 && !s.cards[a].matched && !s.cards[b].matched);
check("hide with nothing open is a no-op", reduce(s, { type: "hide" }) === s);

// --- timer + pause
check("clock runs from first flip", timeOf(s, 6000) === 5000);
s = reduce(s, { type: "pause", now: 6000 });
check("pause freezes time", s.paused && timeOf(s, 60000) === 5000);
check("flips are ignored while paused", reduce(s, { type: "flip", index: third, now: 7000 }) === s);
s = reduce(s, { type: "resume", now: 10000 });
check("resume restarts the clock without counting paused time", !s.paused && timeOf(s, 11000) === 6000);
let fresh = reduce(newGame("easy"), { type: "pause", now: 5 });
fresh = reduce(fresh, { type: "resume", now: 50 });
check("pause/resume before first flip keeps the clock stopped", fresh.since === null && timeOf(fresh, 999) === 0);

// --- victory
let t = 12000;
while (!s.won) {
  const i = s.cards.findIndex((c) => !c.matched);
  s = reduce(s, { type: "flip", index: i, now: (t += 100) });
  s = reduce(s, { type: "flip", index: pairOf(s, i), now: (t += 100) });
}
check("all pairs -> won, clock stopped", s.won && s.pairs === 6 && s.since === null && s.cards.every((c) => c.matched));
check("final time excludes the pause", s.elapsed === t - 1000 - 4000);
check("no flips/pause after victory", reduce(s, { type: "pause", now: t }) === s);

// --- restart / difficulty change
const r = reduce(s, { type: "new" });
check("restart keeps difficulty and resets counters", r.level === "easy" && r.moves === 0 && r.pairs === 0 && !r.won && r.elapsed === 0 && r.since === null);
const h = reduce(s, { type: "new", level: "hard" });
check("difficulty change deals a fresh hard board", h.level === "hard" && h.cards.length === 24 && h.moves === 0);

check("formatTime", formatTime(0) === "00:00" && formatTime(65999) === "01:05" && formatTime(600000) === "10:00");

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
