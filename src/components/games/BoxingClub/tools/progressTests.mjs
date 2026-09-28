/**
 * Boxing Club — save / progression checks (node, with a localStorage shim).
 *   node src/components/games/BoxingClub/tools/progressTests.mjs
 */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = { matchMedia: () => ({ matches: false }) };

const P = await import("../utils/progress.js");
const { OPPONENTS } = await import("../data/opponents.js");

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("FAIL", msg);
  }
};

const side = (o = {}) => ({ thrown: 40, landed: 20, jab: 10, cross: 6, hook: 3, body: 1, blocks: 5, evades: 3, perfect: 1, counters: 2, knockdowns: 0, ...o });
const fightRes = (winner, method, token, opponentId = OPPONENTS[0].id) => ({
  token,
  opponentId,
  mode: "career",
  result: { winner, method, rounds: [{ result: winner === "player" ? "won" : "lost" }] },
  stats: { player: side(winner === "player" ? { knockdowns: method === "KO" ? 1 : 0 } : {}), opponent: side() },
  timeMs: 120000,
});

// fresh save
let p = P.loadProgress();
ok(p.career.defeated.length === 0 && p.fighter.tp === 0, "fresh progress");
ok(P.gloveUnlocks(p).length === 1, "one starter glove");

// loss: no unlock, no TP, stats counted
let r = P.applyFightResult(p, fightRes("opponent", "DECISION", "t1"));
ok(r.progress.career.defeated.length === 0 && r.progress.fighter.tp === 0, "loss unlocks nothing");
ok(r.progress.statistics.losses === 1 && r.progress.statistics.fights === 1, "loss recorded");
p = r.progress;

// duplicate token is a no-op
r = P.applyFightResult(p, fightRes("opponent", "DECISION", "t1"));
ok(r.progress === p && r.rewards === null, "duplicate token ignored");

// KO win on the next opponent: +4 TP and next unlocked
r = P.applyFightResult(p, fightRes("player", "KO", "t2"));
ok(r.progress.career.defeated[0] === OPPONENTS[0].id, "career advanced");
ok(r.progress.fighter.tp === 4, `KO win gives 4 TP (got ${r.progress.fighter.tp})`);
ok(r.rewards.lines.some((l) => l.includes(OPPONENTS[1].name)), "next opponent announced");
p = r.progress;

// rematch of a beaten opponent: 1 TP, no double unlock
r = P.applyFightResult(p, fightRes("player", "DECISION", "t3"));
ok(r.progress.career.defeated.length === 1 && r.progress.fighter.tp === 5, "rematch gives 1 TP only");
p = r.progress;

// can't skip ahead: beating a locked opponent doesn't unlock
r = P.applyFightResult(p, fightRes("player", "DECISION", "t4", OPPONENTS[5].id));
ok(r.progress.career.defeated.length === 1, "skipping ahead does not advance career");

// upgrades: cost = level, capped at 10, can't overspend
let q = P.upgradeStat(p, "power");
ok(q.fighter.stats.power === 2 && q.fighter.tp === 4, "upgrade costs 1 at level 1");
q = { ...q, fighter: { ...q.fighter, tp: 0 } };
ok(P.upgradeStat(q, "power") === q, "no TP, no upgrade");
q = { ...q, fighter: { ...q.fighter, tp: 999, stats: { ...q.fighter.stats, speed: 10 } } };
ok(P.upgradeStat(q, "speed") === q, "level 10 is max");
ok(P.upgradeStat(q, "hax") === q, "unknown stat rejected");

// training: TP per new medal level only
let t = P.applyTraining(p, "heavy", 1200, 2);
ok(t.gained === 2 && t.progress.training.heavy.best === 1200, "silver first time = 2 TP");
t = P.applyTraining(t.progress, "heavy", 900, 1);
ok(t.gained === 0 && t.progress.training.heavy.best === 1200 && t.progress.training.heavy.medal === 2, "worse run keeps best, no TP");
p = t.progress;

// save → load round trip
P.saveProgress(p);
const back = P.loadProgress();
ok(JSON.stringify(back.career) === JSON.stringify(p.career), "career survives reload");
ok(back.fighter.tp === p.fighter.tp && back.training.heavy.medal === 2, "TP + medals survive reload");
ok(back.statistics.wins === p.statistics.wins, "stats survive reload");

// corrupted / hostile saves
localStorage.setItem("boxing-club-progress", "{not json");
ok(P.loadProgress().career.defeated.length === 0, "corrupt JSON → fresh save");
localStorage.setItem("boxing-club-progress", JSON.stringify({ ...p, career: { defeated: [OPPONENTS[0].id, OPPONENTS[4].id] }, fighter: { ...p.fighter, tp: -50, stats: { power: 99 } }, gloves: { selected: "nope", unlocked: ["champion"] } }));
const bad = P.loadProgress();
ok(bad.career.defeated.length === 1, "non-contiguous career trimmed");
ok(bad.fighter.tp >= 0 && bad.fighter.stats.power <= 10, "stats/TP sanitized");
ok(!P.gloveUnlocks(bad).includes("champion"), "gloves derived, not trusted");

// champion
const all = { ...P.defaultProgress(), career: { defeated: OPPONENTS.slice(0, -1).map((o) => o.id) } };
r = P.applyFightResult(all, fightRes("player", "DECISION", "final", OPPONENTS[OPPONENTS.length - 1].id));
ok(r.progress.champion && r.progress.statistics.championships === 1, "beating the final opponent crowns champion");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
