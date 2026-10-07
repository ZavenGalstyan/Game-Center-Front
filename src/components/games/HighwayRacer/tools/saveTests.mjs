/**
 * Highway Racer — save sanitising checks (no browser needed).
 *   node src/components/games/HighwayRacer/tools/saveTests.mjs
 */
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
};
const { loadProgress, saveProgress, sanitize, applyRun, STORAGE_KEY, defaultProgress } = await import("../utils/storage.js");

let fails = 0;
let n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("  FAIL", m);
  }
};
const set = (v) => store.set(STORAGE_KEY, typeof v === "string" ? v : JSON.stringify(v));

store.clear();
ok(JSON.stringify(loadProgress()) === JSON.stringify(defaultProgress()), "missing save → defaults");
set("{not json");
ok(loadProgress().coins === 0, "corrupt JSON → defaults");
set("null");
ok(loadProgress().selectedCar === "street-one", "null → defaults");
set({ version: 0, coins: -50, bestDistance: -3, selectedCar: "lambo", unlockedCars: ["lambo", "vortex-r", "vortex-r"], statistics: { runs: "x", nearMisses: -4, bestCombo: 99 } });
let p = loadProgress();
ok(p.coins === 0, "negative coins → 0");
ok(p.bestDistance === 0, "negative best → 0");
ok(p.selectedCar === "street-one", "unknown selected car → starter");
ok(p.unlockedCars.join() === "street-one,vortex-r", `unknown/duplicate cars dropped, starter kept (${p.unlockedCars})`);
ok(p.statistics.runs === 0 && p.statistics.nearMisses === 0 && p.statistics.bestCombo === 4, "junk statistics clamped");
set({ selectedEnvironment: "night", bestDistance: 100 });
ok(loadProgress().selectedEnvironment === "sunset", "locked theme can't be selected via save");
set({ selectedEnvironment: "night", bestDistance: 7000 });
ok(loadProgress().selectedEnvironment === "night", "unlocked theme kept");
set({ settings: { graphics: "ultra", sound: 7, shadows: "high", speedEffects: "yes" } });
p = loadProgress();
ok(p.settings.graphics === "medium" && p.settings.sound === 1 && p.settings.shadows === "high" && p.settings.speedEffects === true, "settings sanitised");
store.set("other-game-progress", "keep");
saveProgress({ ...defaultProgress(), coins: 12 });
ok(store.get("other-game-progress") === "keep", "other keys untouched");
ok(JSON.parse(store.get(STORAGE_KEY)).version === 1, "version written");
// applyRun
const base = defaultProgress();
const r1 = applyRun(base, { distance: 1200, score: 3000, coins: 20, nearMisses: 3, bestCombo: 2, passed: 30, boostsUsed: 1, topSpeedKmh: 150, time: 40 });
ok(r1.next.coins === 20 && r1.next.bestDistance === 1200 && r1.next.statistics.runs === 1, "run folds in");
ok(!r1.records.distance, "no NEW BEST on the very first run");
const r2 = applyRun(r1.next, { distance: 1500, score: 2000, coins: 5, nearMisses: 0, bestCombo: 0, passed: 10, boostsUsed: 0, topSpeedKmh: 140, time: 50 });
ok(r2.records.distance && !r2.records.score, "distance record flagged, score not");
ok(r2.next.bestScore === 3000 && r2.next.coins === 25 && r2.next.statistics.bestCombo === 2, "bests keep max, coins add");
ok(JSON.stringify(sanitize(JSON.parse(JSON.stringify(r2.next)))) === JSON.stringify(sanitize(r2.next)), "round-trip stable");
console.log(`${n - fails}/${n} save checks passed${fails ? ` — ${fails} FAILED` : ""}`);
process.exit(fails ? 1 : 0);
