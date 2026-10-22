// Headless rules checks: node src/components/games/SpiderRoyale/tools/engineTest.mjs
import * as E from "../engine.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => (cond ? pass++ : (fail++, console.log("FAIL:", msg)));
const idOf = (s, suit, r, used = new Set()) => { const i = s.deck.findIndex((c, k) => c.s === suit && c.r === r && !used.has(k)); used.add(i); return i; };

// --- decks + initial deal for every difficulty ---
for (const [d, def] of Object.entries(E.DIFFICULTIES)) {
  const s = E.newGame({ difficulty: d, seed: 7 });
  const counts = {};
  for (const c of s.deck) counts[c.s + c.r] = (counts[c.s + c.r] || 0) + 1;
  ok(s.deck.length === 104, `${d}: 104 cards`);
  ok(new Set(s.deck.map((c) => c.s)).size === def.suits, `${d}: ${def.suits} suits`);
  ok(Object.values(counts).every((n) => n === 8 / def.suits) && Object.keys(counts).length === 13 * def.suits, `${d}: each card ×${8 / def.suits}`);
  ok(s.cols.map((c) => c.length).join() === "6,6,6,6,5,5,5,5,5,5", `${d}: 54-card layout`);
  ok(s.down.every((n, c) => n === s.cols[c].length - 1), `${d}: only top cards face-up`);
  ok(s.stock.length === 50, `${d}: 50 in stock (5 deals)`);
  ok(new Set([...s.cols.flat(), ...s.stock]).size === 104, `${d}: every card dealt once`);
  ok(JSON.stringify(E.newGame({ difficulty: d, seed: 7 }).cols) === JSON.stringify(s.cols), `${d}: seeded deal reproducible`);
}

// --- hand-built position helper ---
function rig(colsSpec, { difficulty = "hard", downs } = {}) {
  const s = E.newGame({ difficulty, seed: 1 });
  const used = new Set();
  const cols = colsSpec.map((col) => col.map(([suit, r]) => idOf(s, suit, r, used)));
  const rest = s.deck.map((_, i) => i).filter((i) => !used.has(i));
  return { ...s, cols, down: downs || cols.map(() => 0), stock: rest.slice(0, 50 - 0), done: [] };
}

// legal / illegal single moves
let s = rig([[["S", 9]], [["H", 10]], [["S", 8]], [["D", 10]], [["C", 5]], [["S", 2]], [["S", 3]], [["H", 4]], [["C", 13]], [["D", 1]]]);
ok(E.canDrop(s, 0, 0, 1), "9 onto any-suit 10");
ok(E.canDrop(s, 0, 0, 3), "9 onto other 10");
ok(!E.canDrop(s, 0, 0, 2), "9 onto 8 rejected");
ok(!E.canDrop(s, 4, 0, 8), "5 onto K rejected");
ok(!E.canDrop(s, 0, 0, 0), "drop on own column rejected");
let t = E.move(s, 0, 0, 1);
ok(t && t.cols[0].length === 0 && t.cols[1].length === 2 && t.moves === 1 && t.score === 499, "move applied, move/score counted");
ok(E.move(s, 4, 0, 8) === null, "illegal move returns null");

// sequence movement: same-suit only
s = rig([[["S", 9], ["S", 8], ["S", 7]], [["H", 10]], [["H", 9], ["S", 8]], [["C", 10]], [["D", 9]], [["S", 1]], [["S", 2]], [["S", 3]], [["S", 4]], [["S", 5]]]);
ok(E.movable(s, 0, 0) && E.canDrop(s, 0, 0, 1), "same-suit run moves together");
ok(!E.movable(s, 2, 0), "mixed-suit run cannot move together");
ok(E.movable(s, 2, 1) && E.canDrop(s, 2, 1, 4), "top of mixed run still moves alone");
t = E.move(s, 0, 0, 1);
ok(t.cols[1].length === 4 && t.cols[0].length === 0, "whole run moved");
ok(E.runStart(s, 0) === 0 && E.runStart(s, 2) === 1, "runStart");
s = rig([[["S", 9], ["S", 8], ["S", 7]], [["H", 9]], [], [], [], [], [], [], [], []], { downs: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
ok(!E.movable(s, 0, 0) && E.movable(s, 0, 1), "face-down cards never move");
t = E.move(s, 0, 1, 1);
ok(t.down[0] === 0 && t.last.flipped.length === 1, "exposed face-down card flips");
const un = E.undo(t);
ok(JSON.stringify([un.cols, un.down, un.stock, un.done]) === JSON.stringify([s.cols, s.down, s.stock, s.done]) && un.score === s.score - 1 && un.moves === 2, "undo restores board exactly (incl. face-down)");

// empty-column moves + deal restriction
ok(E.canDrop(s, 0, 1, 5), "any run may move to an empty column");
ok(E.dealBlock(s) && E.deal(s) === null, "deal blocked with empty column");
// complete sequence removal
const kToA = (suit) => Array.from({ length: 13 }, (_, k) => [suit, 13 - k]);
s = rig([[["H", 5], ...kToA("S").slice(0, 12)], [["S", 1]], [["H", 2]], [["H", 3]], [["H", 4]], [["D", 5]], [["D", 6]], [["D", 7]], [["D", 8]], [["D", 9]]], { downs: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
t = E.move(s, 1, 0, 0);
ok(t && t.done.length === 1 && t.done[0] === "S" && t.cols[0].length === 1 && t.down[0] === 0, "K→A removed, face-down card flipped");
ok(t.score === 500 - 1 + 100 && t.last.removed[0].ids.length === 13, "+100 for a sequence");
const u2 = E.undo(t);
ok(u2.done.length === 0 && u2.cols[0].length === 13 && u2.cols[1].length === 1 && u2.down[0] === 1, "undo restores a removed sequence");
s = rig([[["H", 13], ...kToA("S").slice(1, 12)], [["S", 1]], [["H", 2]], [["H", 3]], [["H", 4]], [["D", 5]], [["D", 6]], [["D", 7]], [["D", 8]], [["D", 9]]]);
ok(E.move(s, 1, 0, 0).done.length === 0, "mixed-suit K→A not removed");

// stock dealing
s = E.newGame({ difficulty: "easy", seed: 3 });
let d = s;
for (let k = 0; k < 5; k++) {
  const n = E.deal(d);
  ok(n && n.cols.every((c, i) => c.length === d.cols[i].length + 1 - (n.last.removed.find((r) => r.col === i) ? 13 : 0)) && n.stock.length === d.stock.length - 10, `deal ${k + 1} adds one card per column`);
  ok(n.down.every((x, i) => x === d.down[i] || n.last.removed.length), `deal ${k + 1} cards face-up`);
  d = n;
}
ok(E.deal(d) === null && E.dealBlock(d) === "The stock is empty.", "no 6th deal");
ok(E.undo(d).stock.length === 10, "undo a deal returns cards to stock");

// win detection: 7 done, last run one move away
s = rig([kToA("S").slice(0, 12), [["S", 1]], [], [], [], [], [], [], [], []], { difficulty: "easy" });
s = { ...s, done: Array(7).fill("S"), stock: [] };
t = E.move(s, 1, 0, 0);
ok(t.won && t.done.length === 8, "win after 8 sequences");
ok(E.move(t, 0, 0, 1) === null && E.undo(t) === null, "no moves after win");
const tw = E.stop({ ...t, mode: "timed", elapsed: 60000 });
ok(tw.timeBonus === Math.floor((E.limitOf(t) - 60000) / 1000) * 2, "timed win bonus");
ok(E.expire({ ...s, mode: "timed", elapsed: 1e9 }).lost, "timed expiry");

// hints: legal only, useful first, deal at the end
for (const diff of ["easy", "medium", "hard"]) {
  for (let seed = 0; seed < 40; seed++) {
    let g = E.newGame({ difficulty: diff, seed });
    for (let step = 0; step < 400 && !g.won; step++) {
      const h = E.hints(g);
      const legal = E.allMoves(g);
      if (!h.every((m) => m.deal ? !E.dealBlock(g) : legal.some((l) => l.from === m.from && l.i === m.i && l.to === m.to))) { ok(false, "hint not legal"); break; }
      const m = h[step % 7 === 6 ? h.length - 1 : 0];
      if (!m) break;
      const n = m.deal ? E.deal(g) : E.move(g, m.from, m.i, m.to);
      const cards = n.cols.flat().length + n.stock.length + 13 * n.done.length;
      if (cards !== 104) { ok(false, "card count conserved"); break; }
      g = n;
    }
    if (diff === "easy" && g.won) pass++;
    ok(E.validSave(JSON.parse(JSON.stringify(g))) || g.won, "game state survives save/validate");
  }
}
ok(!E.validSave({ ...E.newGame(), cols: [] }), "bad save rejected");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
