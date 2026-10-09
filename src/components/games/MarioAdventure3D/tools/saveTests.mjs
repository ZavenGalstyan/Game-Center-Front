/**
 * Mario Adventure 3D — save-system checks (pure, no browser):
 *   node src/components/games/MarioAdventure3D/tools/saveTests.mjs
 * Corrupt / partial / hostile saves must sanitise to something valid; unlocks
 * are derived from completions; stars merge across runs and never decrease.
 */
import { sanitize, defaultProgress, applyRun, addRunStats, isUnlocked, starCount, totalStars, worldProgress, nextUnlockedLevel, SAVE_KEY } from "../utils/storage.js";

let pass = 0;
let fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.log("  FAIL", m)));

ok(SAVE_KEY === "mario-adventure-3d-progress", "save key name");

// garbage in → defaults out
for (const raw of [null, undefined, 42, "x", [], [1, 2], { completedLevels: "nope" }, { settings: null }, { statistics: [1] }]) {
  const p = sanitize(raw);
  ok(p.unlockedLevels.length === 1 && p.unlockedLevels[0] === 1, `garbage ${JSON.stringify(raw)} → only level 1 open`);
  ok(p.settings.graphics === "medium" && p.settings.master === 0.85, `garbage ${JSON.stringify(raw)} → default settings`);
}

// hostile values are clamped / dropped
const evil = sanitize({
  completedLevels: { 1: true, 2: "yes", 99: true, "-3": true, abc: true, 3: true },
  stars: { 1: { clear: true, coins: true, hidden: "true" }, 50: { clear: true }, 3: { hidden: true } },
  bestTimes: { 1: -5, 3: 1e9, 2: NaN, 4: 61.234 },
  bestCoins: { 1: 9999, 2: -4 },
  totalCoins: -100,
  statistics: { jumps: "lots", stomps: Infinity, coins: 12 },
  settings: { master: 7, music: -1, graphics: "ultra", sensitivity: 99, invertY: "true", camDistance: 0 },
  lastLevel: 30,
  unlockedLevels: [1, 2, 3, 4, 5, 30],
});
ok(evil.completedLevels[1] && !evil.completedLevels[2] && !evil.completedLevels[99] && evil.completedLevels[3], "only true + in-range completions kept");
ok(evil.stars[1].clear && evil.stars[1].coins && !evil.stars[1].hidden, "non-boolean star flags dropped");
ok(!evil.stars[50], "out-of-range star ids dropped");
ok(evil.stars[3].clear && evil.stars[3].hidden, "completed level always has its clear star");
ok(!evil.bestTimes[1] && !evil.bestTimes[3] && !evil.bestTimes[2] && evil.bestTimes[4] === 61.23, "bad times dropped, good kept");
ok(evil.bestCoins[1] === 999 && evil.bestCoins[2] === 0, "coin bests clamped");
ok(evil.totalCoins === 0, "negative total coins → 0");
ok(evil.statistics.jumps === 0 && evil.statistics.stomps === 0 && evil.statistics.coins === 12, "bad stats → 0");
ok(evil.settings.master === 1 && evil.settings.music === 0 && evil.settings.graphics === "medium" && evil.settings.sensitivity === 3 && evil.settings.invertY === false && evil.settings.camDistance === 4.6, "settings clamped");
ok(!isUnlocked(evil, 30) && evil.lastLevel === 1, "unlocks derived, not trusted (lastLevel 30 rejected)");
ok(evil.unlockedLevels.join() === "1,2,3,4", "unlocked levels derived from completions");

// progression + star merging
let p = defaultProgress();
ok(nextUnlockedLevel(p) === 1 && !isUnlocked(p, 2), "fresh save: level 1 only");
let r = applyRun(p, { id: 1, stars: { clear: true, coins: false, hidden: true }, coins: 10, time: 80 });
p = r.progress;
ok(r.firstClear && r.unlocked[0] === 2 && isUnlocked(p, 2), "clearing 1-1 unlocks 1-2");
ok(starCount(p, 1) === 2 && r.newStars === 2, "clear + hidden = 2 stars");
r = applyRun(p, { id: 1, stars: { clear: true, coins: true, hidden: false }, coins: 16, time: 95 });
p = r.progress;
ok(starCount(p, 1) === 3 && r.newStars === 1, "stars merge across runs (now 3)");
ok(p.bestTimes[1] === 80 && !r.newBest, "slower run keeps the best time");
ok(p.bestCoins[1] === 16, "best coins updated");
r = applyRun(p, { id: 1, stars: { clear: true, coins: false, hidden: false }, coins: 2, time: 60 });
p = r.progress;
ok(starCount(p, 1) === 3 && r.newBest && p.bestTimes[1] === 60, "stars never decrease; faster time recorded");
ok(p.statistics.completions === 3, "completions counted");
// clear a whole world → next world opens
for (let id = 2; id <= 6; id++) p = applyRun(p, { id, stars: { clear: true }, coins: 5, time: 50, boss: id === 6 }).progress;
ok(worldProgress(p, 1).done === 6 && worldProgress(p, 2).unlocked && !worldProgress(p, 3).unlocked, "world 2 opens after the boss");
ok(p.unlockedWorlds.join() === "1,2", "unlocked worlds derived");
ok(p.statistics.bossesDefeated === 1, "boss counted once");
p = applyRun(p, { id: 6, stars: { clear: true }, coins: 5, time: 40, boss: true }).progress;
ok(p.statistics.bossesDefeated === 1, "re-beating a boss doesn't double count");
ok(totalStars(p) === 3 + 5, "total stars");
// run stats
const q = addRunStats(p, { jumps: 10, coins: 7, distance: 120.5, playTime: 33, deaths: 1, hits: -3, bogus: 99 });
ok(q.statistics.jumps === p.statistics.jumps + 10 && q.totalCoins === p.totalCoins + 7 && q.statistics.deaths === 1 && q.statistics.hits === p.statistics.hits, "run stats added (negatives ignored)");
ok(q.statistics.levelsPlayed === p.statistics.levelsPlayed + 1, "levels played counted");
// round trip
const rt = sanitize(JSON.parse(JSON.stringify(q)));
ok(JSON.stringify(rt) === JSON.stringify(sanitize(q)), "save → load round trip is stable");
// final level clears without unlocking a level 31
let z = defaultProgress();
for (let id = 1; id <= 30; id++) z = applyRun(z, { id, stars: { clear: true, coins: true, hidden: true }, coins: 20, time: 60, boss: id % 6 === 0 }).progress;
ok(z.unlockedLevels.length === 30 && totalStars(z) === 90 && z.statistics.bossesDefeated === 5, "full completion: 30 levels, 90 stars, 5 bosses");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
