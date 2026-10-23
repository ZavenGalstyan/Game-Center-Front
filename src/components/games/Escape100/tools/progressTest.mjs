/**
 * Save-system checks: node src/components/games/Escape100/tools/progressTest.mjs
 */
import * as P from "../progress.js";
import { LEVELS } from "../levels/index.js";

let fails = 0, n = 0;
const ok = (c, m) => (n++, c || (fails++, console.log("  ✗ " + m)));

ok(LEVELS.length === 100 && LEVELS.every((L, i) => L.id === i + 1), "exactly 100 levels, ids 1..100 in order");
ok(new Set(LEVELS.map((L) => L.name)).size === 100, "every level has a unique name");

let p = P.normalize(null);
ok(p.unlocked === 1 && p.current === 1 && P.completedCount(p) === 0, "fresh save starts at room 1");
ok(p.settings.quality === "medium" && p.settings.master === 0.8 && !p.settings.muted, "default settings");

p = P.recordEscape(p, 1, { hints: 2, moves: 10, time: 50 });
ok(p.unlocked === 2 && p.current === 2 && p.done[1].hints === 2, "escaping room 1 unlocks room 2");
p = P.recordEscape(p, 1, { hints: 3, moves: 5, time: 20 });
ok(p.done[1].hints === 2, "a worse run (more hints) keeps the best record");
p = P.recordEscape(p, 1, { hints: 0, moves: 9, time: 90 });
ok(p.done[1].hints === 0, "a run with fewer hints replaces the record");
ok(p.unlocked === 2, "replaying an old room doesn't lose the unlock");

// play through all 100
let q = P.normalize(null);
for (let i = 1; i <= 100; i++) q = P.recordEscape(q, i, { hints: 0, moves: 5, time: 10 });
ok(P.completedCount(q) === 100 && q.unlocked === 100 && q.finished, "all 100 escaped → finished");

// corrupted / hostile data
const junk = P.normalize({ unlocked: 5000, current: -4, done: { 0: {}, 3: { hints: "x", time: -5 }, 101: { hints: 1 }, abc: 1, 7: null }, settings: { quality: "ultra", master: 9, sfx: "loud", muted: "yes", sens: 0 } });
ok(junk.unlocked === 4, "unlocked is derived from escaped rooms, not a stored number");
ok(!junk.done[0] && !junk.done[101] && !junk.done[7] && junk.done[3]?.hints === 0 && junk.done[3]?.time === 0, "bad entries dropped, bad fields defaulted");
ok(P.normalize({ unlocked: 99 }).unlocked === 1, "a bare unlocked number can't skip ahead");
ok(junk.current >= 1 && junk.current <= junk.unlocked, "current room is valid");
ok(junk.settings.quality === "medium" && junk.settings.master === 1 && junk.settings.sfx === 0.9 && junk.settings.muted === false && junk.settings.sens === 0.4, "settings sanitized");
ok(P.normalize("garbage").unlocked === 1 && P.normalize([1, 2]).unlocked === 1 && P.normalize(42).current === 1, "non-object saves reset safely");
ok(P.normalize({ done: { 1: { hints: 0 }, 3: { hints: 0 } } }).current === 2, "current picks the first unescaped room");
ok(P.normalize({ unlocked: 3, done: { 1: { hints: 0 }, 2: { hints: 0 } } }).current === 3, "current skips escaped rooms");
ok(JSON.stringify(P.normalize(JSON.parse(JSON.stringify(q)))) === JSON.stringify(q), "save round-trips through JSON");

console.log(fails ? `\n${fails}/${n} failed` : `\nall ${n} progress checks passed`);
process.exit(fails ? 1 : 0);
