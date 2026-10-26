/**
 * Metro Rush — headless tests (no browser).
 *   node src/components/games/MetroRush/tools/simTest.mjs [core|fair|bot|save|all]
 *
 * core  physics + collision rules on hand-placed obstacles
 * fair  generator: every chunk survivable from every lane (also shifted /
 *       across its speed range), no overlapping obstacles, moving-train
 *       sweeps clear, no impossible jump/slide sequences
 * bot   route bot plays long sessions through the real physics (incl. late
 *       input and power-ups) — it must never crash
 * save  sanitising, missions (run / total scope, set completion), daily
 *       challenges + streak, purchases, revive cost
 */
import { createRun, stepRun, reviveRun, activateBoard, surfaceAt } from "../engine/run.js";
import { makeChunk } from "../engine/generator.js";
import { validate, movingMeet } from "../engine/validator.js";
import { BARRIER_L, CAR_L, CELL, LW, MOVING_ACT, OVERHEAD_L, POWER_T, RAMP_L, TRAIN_H, laneX, speedAt } from "../engine/config.js";
import { createBot } from "./bot.mjs";
import * as P from "../progress.js";
import { MISSION_SETS, ALL_MISSIONS, DAILY_POOL } from "../data/missions.js";

let pass = 0;
let fail = 0;
const ok = (cond, name, info = "") => {
  if (cond) pass++;
  else {
    fail++;
    console.log("  FAIL", name, info);
  }
};
const suite = process.argv[2] || "all";
const want = (s) => suite === "all" || suite === s;

/* ------------------------------------------------------------------ helpers */
function bare(seed = 1) {
  const run = createRun({ seed, noPower: true });
  run.obs = [];
  run.coins = [];
  run.pickups = [];
  run.chunks = [];
  run.frontier = 1e9;
  run.t = 0;
  return run;
}
let nid = 1e6;
function put(run, kind, lane, z, extra = {}) {
  const o = { id: nid++, kind, lane, x: laneX(lane), z0: z, z1: z + (kind === "barrier" ? BARRIER_L : kind === "overhead" ? OVERHEAD_L : (extra.cars || 1) * CAR_L), ramp: false, moving: false, u: 0, cars: 1, active: false, hit: false, passed: false, ...extra };
  if (o.moving) o.trig = o.z0 - MOVING_ACT;
  run.obs.push(o);
  return o;
}
/** step until dist >= z (or crash) pressing `acts` at given distances */
function go(run, z, plan = []) {
  const pending = plan.slice().sort((a, b) => a[0] - b[0]);
  let guard = 0;
  while (!run.over && run.dist < z && guard++ < 200000) {
    const acts = [];
    while (pending.length && run.dist >= pending[0][0]) acts.push(pending.shift()[1]);
    stepRun(run, 1 / 120, acts);
  }
  return run;
}
const ev = (run, type) => run.events.filter((e) => e.type === type).length;

/* ================================================================== core */
if (want("core")) {
  console.log("core");
  // barrier: run into it → trip; jump → clear
  {
    const r = bare();
    put(r, "barrier", 1, 30);
    go(r, 40);
    ok(r.over && r.crash.kind === "barrier" && r.crash.how === "trip", "barrier crash when running");
    const r2 = bare();
    put(r2, "barrier", 1, 30);
    go(r2, 45, [[30 - 4.5, "up"]]);
    ok(!r2.over, "jump clears barrier");
    ok(r2.stats.barriersJumped === 1 && r2.stats.jumps === 1, "barrier jump counted", JSON.stringify(r2.stats));
    const r3 = bare();
    put(r3, "barrier", 1, 30);
    go(r3, 45, [[30 - 4.5, "down"]]);
    ok(r3.over, "sliding into a barrier crashes");
  }
  // overhead: run → head; slide → pass; jump → crash
  {
    const r = bare();
    put(r, "overhead", 0, 30);
    r.p.lane = r.p.tlane = 0;
    r.p.x = laneX(0);
    go(r, 40);
    ok(r.over && r.crash.how === "head", "overhead crash standing");
    const r2 = bare();
    put(r2, "overhead", 1, 30);
    go(r2, 45, [[30 - 3, "down"]]);
    ok(!r2.over && r2.stats.overheadsSlid === 1, "slide under overhead", JSON.stringify(r2.crash));
    const r3 = bare();
    put(r3, "overhead", 1, 30);
    go(r3, 45, [[30 - 3, "up"]]);
    ok(r3.over, "jumping into overhead crashes");
  }
  // train head-on vs lane change
  {
    const r = bare();
    put(r, "train", 1, 40, { cars: 2 });
    go(r, 50);
    ok(r.over && r.crash.kind === "train" && r.crash.how === "front", "train head-on crash");
    const r2 = bare();
    put(r2, "train", 1, 40, { cars: 2 });
    go(r2, 70, [[25, "left"]]);
    ok(!r2.over && r2.p.tlane === 0, "lane change dodges train");
    ok(r2.stats.trainsPassed === 1, "train pass counted", r2.stats.trainsPassed);
    // jumping can't clear a train
    const r3 = bare();
    put(r3, "train", 1, 40);
    go(r3, 50, [[36, "up"]]);
    ok(r3.over, "jump into train crashes");
  }
  // ramp → roof → fall off the end
  {
    const r = bare();
    put(r, "train", 1, 40, { cars: 2, ramp: true });
    let roof = false;
    let g = 0;
    while (!r.over && r.dist < 40 + 2 * CAR_L + 20 && g++ < 1e5) {
      stepRun(r, 1 / 120, []);
      if (r.p.y >= TRAIN_H - 0.01 && r.p.ground) roof = true;
    }
    ok(!r.over, "ramp run survives", JSON.stringify(r.crash));
    ok(roof && r.stats.ramps === 1, "reached the roof via ramp");
    ok(r.stats.roofDist > 2 * CAR_L - 2, "roof distance counted", r.stats.roofDist);
    ok(r.p.y === 0 && r.p.ground, "dropped back to the rails");
    ok(Math.abs(surfaceAt(r, 0, 40 - RAMP_L / 2) - TRAIN_H / 2) < 0.01, "ramp surface mid-height");
  }
  // roof-to-roof lane change keeps height
  {
    const r = bare();
    put(r, "train", 1, 30, { cars: 2, ramp: true });
    put(r, "train", 0, 32, { cars: 3 });
    go(r, 45);
    ok(r.p.y >= TRAIN_H - 0.01, "on roof before switching");
    go(r, 60, [[45, "left"]]);
    ok(!r.over && r.p.tlane === 0 && r.p.y >= TRAIN_H - 0.01, "roof-to-roof lane change", JSON.stringify({ over: r.over, y: r.p.y, l: r.p.tlane }));
  }
  // side bump: switching into a train alongside bounces back, no crash
  {
    const r = bare();
    put(r, "train", 2, 10, { cars: 3 });
    go(r, 20);
    go(r, 30, [[20, "right"]]);
    ok(!r.over && r.p.tlane === 1 && r.stats.stumbles === 1, "side bump bounces back", JSON.stringify({ over: r.over, l: r.p.tlane, s: r.stats.stumbles }));
    const sx = r.p.x;
    go(r, 32);
    ok(Math.abs(sx) < 0.01 || Math.abs(r.p.x) < 0.01, "back in lane after bump", r.p.x);
  }
  // moving train: stay → crash; dodge → counted
  {
    const r = bare();
    put(r, "train", 1, 260, { cars: 2, moving: true, u: 12 });
    go(r, 400);
    ok(r.over && r.crash.moving, "moving train head-on crash");
    const v = 14;
    const [a] = movingMeet({ z0: 260, z1: 260 + 2 * CAR_L, u: 12 }, v);
    ok(Math.abs(r.dist - a) < 6, "crash where the validator predicts", `${r.dist.toFixed(1)} vs ${a.toFixed(1)}`);
    const r2 = bare();
    put(r2, "train", 1, 260, { cars: 2, moving: true, u: 12 });
    go(r2, 200, [[a - 25, "right"]]);
    ok(!r2.over && r2.stats.trainsDodged === 1, "moving train dodged", JSON.stringify(r2.stats.trainsDodged));
    ok(ev(r2, "horn") === 1, "horn when it departs");
  }
  // hoverboard absorbs one crash
  {
    const r = bare();
    r.boardsLeft = 1;
    ok(activateBoard(r), "board activates");
    ok(!activateBoard(r), "only one board at a time");
    put(r, "barrier", 1, 30);
    put(r, "barrier", 1, 60);
    go(r, 40);
    ok(!r.over && r.power.board === 0 && ev(r, "boardBreak") === 1, "board breaks instead of crash");
    go(r, 70);
    ok(r.over, "second hit (after grace) crashes");
    const r2 = bare();
    r2.boardsLeft = 0;
    ok(!activateBoard(r2), "no board without charges");
  }
  // shield smashes through anything
  {
    const r = bare();
    r.pickups.push({ id: 1, kind: "shield", x: 0, y: 1, z: 10, taken: false });
    put(r, "barrier", 1, 30);
    put(r, "overhead", 1, 50);
    put(r, "train", 1, 70, { cars: 1 });
    go(r, 95);
    ok(!r.over && r.stats.smashed === 3 && r.stats.shields === 1, "shield smashes obstacles", JSON.stringify({ over: r.over, s: r.stats.smashed }));
    ok(Math.abs(r.power.shield - (POWER_T.shield - (r.t - 0.8))) < 1.5, "shield timer runs");
  }
  // magnet pulls coins from other lanes
  {
    const r = bare();
    for (let z = 30; z < 60; z += 3) r.coins.push({ id: nid++, x: laneX(0), y: 1, z, taken: false, fly: 0 }, { id: nid++, x: laneX(2), y: 1, z, taken: false, fly: 0 });
    r.coins.sort((a, b) => a.z - b.z);
    go(r, 70);
    ok(r.stats.coins === 0, "no coins from other lanes without magnet", r.stats.coins);
    const r2 = bare();
    for (let z = 30; z < 60; z += 3) r2.coins.push({ id: nid++, x: laneX(0), y: 1, z, taken: false, fly: 0 }, { id: nid++, x: laneX(2), y: 1, z, taken: false, fly: 0 });
    r2.coins.sort((a, b) => a.z - b.z);
    r2.power.magnet = 30;
    go(r2, 75);
    ok(r2.stats.coins === 20, "magnet collects both lanes", r2.stats.coins);
  }
  // multiplier doubles score gain
  {
    const r = bare();
    go(r, 100);
    const s1 = r.scoreF;
    const r2 = bare();
    r2.power.mult = 60;
    go(r2, 100);
    ok(Math.abs(r2.scoreF - 2 * s1) < 1, "score ×2", `${s1} ${r2.scoreF}`);
  }
  // rocket dash: clears the stretch ahead, fast + invulnerable, grace after
  {
    const r = createRun({ seed: 77, noPower: true });
    const bot = createBot();
    while (!r.over && r.dist < 600) stepRun(r, 1 / 120, bot(r));
    r.events.length = 0;
    r.pickups.push({ id: 2, kind: "boost", x: r.p.x, y: r.p.y + 1, z: r.dist + 3, taken: false });
    const z0 = r.dist;
    go(r, z0 + 10);
    ok(r.power.boost > 0 && r.stats.boosts === 1, "boost picked up");
    const keep = z0 + 3 + 70;
    const dashEnd = z0 + POWER_T.boost * speedAt(r.t) * 1.75;
    const inDash = r.obs.filter((o) => o.z0 > keep + 1 && o.z0 < dashEnd && !o.active);
    ok(inDash.length === 0, "the dash stretch is obstacle-free", JSON.stringify(inDash.map((o) => [o.kind, (o.z0 - keep) | 0])));
    let g = 0;
    while (r.power.boost > 0 && g++ < 2000) stepRun(r, 1 / 60, []);
    ok(!r.over && r.p.graceT > 0, "survives the dash and gets grace", JSON.stringify({ over: r.over, g: r.p.graceT }));
    ok(r.speed < speedAt(r.t) * 1.05, "speed back to normal");
    const ahead = r.obs.filter((o) => o.z0 > r.dist && o.z0 < r.dist + r.speed * 1.8 && !o.hit);
    ok(ahead.length === 0, "clear track right after the dash", JSON.stringify(ahead.map((o) => [o.kind, o.moving, (o.z0 - r.dist) | 0, o.active])));
  }
  // revive clears the area
  {
    const r = bare();
    put(r, "barrier", 1, 30);
    put(r, "barrier", 1, 40);
    go(r, 35);
    ok(r.over, "crashed");
    reviveRun(r);
    ok(!r.over && r.stats.revives === 1 && r.p.graceT > 0, "revived");
    go(r, 60);
    ok(!r.over, "nearby obstacles cleared after revive");
  }
  // input buffer, fast fall, edges, lane queue
  {
    const r = bare();
    stepRun(r, 1 / 120, ["up"]);
    go(r, r.dist + 7.4);
    ok(!r.p.ground, "still airborne before the buffered press");
    stepRun(r, 1 / 120, ["up"]);
    let g = 0;
    const jumps = r.stats.jumps;
    while (r.stats.jumps === jumps && g++ < 600) stepRun(r, 1 / 120, []);
    ok(r.stats.jumps === jumps + 1 && !r.p.ground && g < 40, "jump pressed in the air fires on landing (buffer)", `${jumps} ${r.stats.jumps}`);
    const r2 = bare();
    stepRun(r2, 1 / 120, ["up"]);
    for (let i = 0; i < 20; i++) stepRun(r2, 1 / 120, []);
    stepRun(r2, 1 / 120, ["down"]);
    ok(r2.p.vy <= -29, "down in the air dives");
    g = 0;
    while (!r2.p.ground && g++ < 600) stepRun(r2, 1 / 120, []);
    ok(r2.p.slideT > 0, "dive turns into a slide on landing");
    const r3 = bare();
    stepRun(r3, 1 / 120, ["left", "left", "left"]);
    ok(r3.p.tlane === 0 && r3.stats.lanes === 1 && ev(r3, "edge") === 2, "lane edge clamps");
    const r4 = bare();
    stepRun(r4, 1 / 120, ["right"]);
    stepRun(r4, 1 / 120, ["left"]);
    go(r4, r4.dist + 10);
    ok(r4.p.tlane === 1 && Math.abs(r4.p.x) < 1e-3, "quick reverse lands back in lane");
  }
  // determinism
  {
    const a = createRun({ seed: 99 });
    const b = createRun({ seed: 99 });
    go(a, 1500);
    go(b, 1500);
    ok(JSON.stringify(a.obs.map((o) => [o.kind, o.lane, o.z0.toFixed(2)])) === JSON.stringify(b.obs.map((o) => [o.kind, o.lane, o.z0.toFixed(2)])), "same seed, same track");
  }
}

/* ================================================================== fair */
if (want("fair")) {
  console.log("fair");
  let chunks = 0;
  let falls = 0;
  let overlaps = 0;
  let sweepBad = 0;
  let unfair = 0;
  for (let s = 0; s < 60; s++) {
    for (const d of [0, 0.25, 0.5, 0.75, 1]) {
      const st = { s: s * 7919 + Math.round(d * 100) };
      const v = speedAt(d * 260);
      for (let k = 0; k < 6; k++) {
        const c = makeChunk(st, v, v * 1.06, d, k % 3);
        chunks++;
        if (c.fallback) falls++;
        for (const vv of [v, v * 1.03, v * 1.06]) {
          const r = validate(c.items, c.len, vv);
          if (!r.ok) unfair++;
        }
        // same-lane overlaps (ramps included, 1 m clearance)
        for (let l = 0; l < 3; l++) {
          const spans = c.items
            .filter((it) => it.lane === l)
            .map((it) => {
              if (it.kind === "train" && it.moving) {
                const [a] = movingMeet(it, v);
                return [a - 12, it.z1, "M"];
              }
              return [it.z0 - (it.ramp ? RAMP_L : 0), it.z1, it.kind];
            })
            .sort((a, b) => a[0] - b[0]);
          for (let i = 1; i < spans.length; i++) if (spans[i][0] < spans[i - 1][1] + 0.5) (spans[i][2] === "M" || spans[i - 1][2] === "M" ? sweepBad++ : overlaps++);
        }
      }
    }
  }
  ok(unfair === 0, "every chunk survivable from every lane at v, +3 %, +6 %", unfair);
  ok(overlaps === 0, "no overlapping obstacles in a lane", overlaps);
  ok(sweepBad === 0, "moving-train sweep lanes are clear", sweepBad);
  ok(falls / chunks < 0.02, "fallback chunks are rare", `${falls}/${chunks}`);
  console.log(`  ${chunks} chunks, fallback ${falls}`);
  // run-level: chunk boundaries line up and the start is calm
  const run = createRun({ seed: 5 });
  go(run, 4000);
  ok(run.chunks.every((c, i, a) => i === 0 || Math.abs(c.z0 - (a[i - 1].z0 + a[i - 1].len)) < 1e-6 || a[i - 1].boost || c.boost), "chunks tile the track");
  const first = createRun({ seed: 6 });
  ok(!first.obs.some((o) => o.z0 < 40), "opening runway is obstacle-free");
  // every validated route really exists: replay validator plans on the grid
  let bad = 0;
  for (let s = 0; s < 30; s++) {
    const st = { s: 1000 + s };
    const c = makeChunk(st, 20, 21, 0.7, 1);
    const res = validate(c.items, c.len, 20);
    for (let l = 0; l < 3; l++) {
      const p = res.plan(l);
      if (!p || p[p.length - 1].to.i < res.raster.N - 1) bad++;
    }
  }
  ok(bad === 0, "a route exists from each lane", bad);
  ok(CELL === 0.5 && LW > 2, "grid constants sane");
}

/* ================================================================== bot */
if (want("bot")) {
  console.log("bot");
  const runBot = (seed, maxDist, opts = {}) => {
    const run = createRun({ seed, noPower: !opts.power });
    const bot = createBot({ late: opts.late || 0 });
    let g = 0;
    while (!run.over && run.dist < maxDist && g++ < 3e6) {
      stepRun(run, 1 / 120, bot(run));
      run.events.length = 0;
    }
    return run;
  };
  let crashes = [];
  let meters = 0;
  for (let s = 0; s < 12; s++) {
    const r = runBot(2000 + s, 12000);
    meters += r.dist;
    if (r.over) crashes.push(`${2000 + s}@${r.dist | 0}:${r.crash.kind}`);
  }
  ok(crashes.length === 0, "12 × 12 km without crashing", crashes.join(" "));
  const crashLate = [];
  for (let s = 0; s < 10; s++) {
    const r = runBot(3000 + s, 6000, { late: 0.8 });
    meters += r.dist;
    if (r.over) crashLate.push(`${3000 + s}@${r.dist | 0}`);
  }
  ok(crashLate.length === 0, "late input (0.8 m) still survives", crashLate.join(" "));
  const crashP = [];
  let powers = 0;
  for (let s = 0; s < 10; s++) {
    const r = runBot(4000 + s, 8000, { power: true });
    meters += r.dist;
    powers += r.stats.powerups;
    if (r.over) crashP.push(`${4000 + s}@${r.dist | 0}:${r.crash.kind}`);
  }
  ok(crashP.length === 0, "with power-ups (boost, shield, …) survives", crashP.join(" "));
  ok(powers > 30, "power-ups appear regularly", powers);
  console.log(`  bot ran ${(meters / 1000).toFixed(0)} km`);
}

/* ================================================================== save */
if (want("save")) {
  console.log("save");
  ok(ALL_MISSIONS.length >= 30 && new Set(ALL_MISSIONS.map((m) => m.id)).size === ALL_MISSIONS.length, "≥30 unique missions", ALL_MISSIONS.length);
  const statKeys = Object.keys(createRun({ seed: 1 }).stats).concat(["runs"]);
  ok(ALL_MISSIONS.every((m) => statKeys.includes(m.stat)), "every mission tracks a real stat");
  ok(DAILY_POOL.every((m) => statKeys.includes(m.stat)), "every daily tracks a real stat");
  const junk = P.sanitize({ coins: "abc", chars: { kai: ["nope"], zzz: ["classic"], luna: "x" }, char: "zzz", boards: ["fake", "lava"], board: "fake", upgrades: { magnet: 99 }, mult: -4, settings: { music: 7, quality: "ultra", theme: "mars" }, daily: { date: 5 } });
  ok(junk.coins === 0 && junk.char === "kai" && !junk.chars.zzz && junk.chars.kai[0] === "classic", "sanitize characters");
  ok(junk.boards.includes("breeze") && junk.boards.includes("lava") && !junk.boards.includes("fake") && junk.board === "breeze", "sanitize boards");
  ok(junk.upgrades.magnet === 5 && junk.mult === 1 && junk.settings.music === 1 && junk.settings.quality === "auto" && junk.settings.theme === "metro" && junk.daily === null, "sanitize numbers + settings");
  ok(JSON.stringify(P.sanitize(JSON.parse(JSON.stringify(P.defaultSave())))) === JSON.stringify(P.defaultSave()), "default round-trips");
  // missions: set 1 = coins 100 (run), jumps 15 (total), dist 500 (run)
  let s = P.ensureDaily(P.defaultSave(), new Date(2026, 9, 26));
  const D26 = { now: new Date(2026, 9, 26) };
  let out = P.commitRun(s, { coins: 60, jumps: 10, dist: 400, score: 900 }, D26);
  s = out.save;
  ok(s.coins === 60 && out.report.missions.length === 0, "no mission yet", JSON.stringify(out.report.missions));
  ok(s.mprog[0] === 60 && s.mprog[1] === 10 && s.mprog[2] === 400, "progress stored", s.mprog.join());
  out = P.commitRun(s, { coins: 70, jumps: 6, dist: 300, score: 900 }, D26);
  s = out.save;
  ok(s.mprog[0] === 70 && s.mdone[1] && !s.mdone[0] && !s.mdone[2], "run-scope keeps best, total-scope accumulates", JSON.stringify([s.mprog, s.mdone]));
  ok(out.report.missionCoins === MISSION_SETS[0][1].reward, "reward paid", out.report.missionCoins);
  const before = s.coins;
  out = P.commitRun(s, { coins: 120, jumps: 1, dist: 600, score: 900 }, D26);
  s = out.save;
  ok(out.report.setDone && s.mset === 1 && s.mult === 2 && s.mdone.every((x) => !x), "set complete → multiplier up, next set", JSON.stringify(out.report.setDone));
  ok(s.coins === before + 120 + MISSION_SETS[0][0].reward + MISSION_SETS[0][2].reward + out.report.setDone.bonus + out.report.daily.reduce((a, d) => a + d.reward, 0) + out.report.dailyBonus, "coins add up");
  ok(s.best === 900 && s.bestDist === 600 && s.runs === 3, "best + runs");
  // live missions mirror commit
  const live = P.liveMissions(s, { overheadsSlid: 12 });
  ok(live[0].done && !live[1].done, "live mission progress", JSON.stringify(live.map((m) => m.value)));
  // daily: deterministic per date, rollover + streak
  const d1 = P.makeDaily("2026-10-26");
  ok(JSON.stringify(d1) === JSON.stringify(P.makeDaily("2026-10-26")) && JSON.stringify(d1.ids) !== JSON.stringify(P.makeDaily("2026-10-27").ids), "daily picks depend on the date");
  let ds = P.ensureDaily(P.defaultSave(), new Date(2026, 9, 26));
  const big = { coins: 1e5, dist: 1e6, jumps: 1e4, slides: 1e4, powerups: 1e3, trainsDodged: 1e3, roofDist: 1e5, ramps: 1e3, closeCalls: 1e3, score: 1 };
  const d26 = { now: new Date(2026, 9, 26) };
  out = P.commitRun(ds, big, d26);
  for (let i = 0; i < 6 && !out.save.daily.bonus; i++) out = P.commitRun(out.save, big, d26);
  ok(out.save.daily.done.every(Boolean) && out.save.daily.streak === 1 && out.save.daily.bonus, "daily complete → streak 1");
  ds = P.ensureDaily(out.save, new Date(2026, 9, 27));
  ok(ds.daily.date === "2026-10-27" && ds.daily.streak === 1 && !ds.daily.done.some(Boolean), "rolls over keeping streak");
  // "play N runs" dailies need several commits
  for (let i = 0; i < 7; i++) (out = P.commitRun(ds, big, { now: new Date(2026, 9, 27) })), (ds = out.save);
  ok(out.save.daily.streak === 2 && out.save.daily.done.every(Boolean), "streak 2 next day", JSON.stringify(out.save.daily));
  ds = P.ensureDaily(out.save, new Date(2026, 9, 30));
  ok(ds.daily.streak === 0, "streak resets after a missed day");
  // purchases
  let ps = { ...P.defaultSave(), coins: 1000 };
  ok(P.buyCharacter(ps, "rex") === null, "can't afford Rex");
  ps = P.buyCharacter(ps, "luna");
  ok(ps && ps.coins === 100 && ps.char === "luna" && ps.chars.luna, "buy Luna");
  ok(P.buyCharacter(ps, "luna") === null, "can't buy twice");
  ok(P.buyOutfit(ps, "luna", "sunset") === null, "outfit too pricey");
  ok(P.selectCharacter(ps, "rex") === null && P.selectCharacter(ps, "kai").char === "kai", "select owned only");
  ps = { ...ps, coins: 5000 };
  ps = P.buyBoard(ps, "lava");
  ok(ps.board === "lava" && ps.coins === 2800, "buy board");
  ps = P.buyPack(ps, "three");
  ok(ps.charges === 6 && ps.coins === 2050, "buy charges");
  ps = P.buyUpgrade(ps, "magnet");
  ok(ps.upgrades.magnet === 1 && ps.coins === 1650 && Math.abs(P.powerTimes(ps).magnet - POWER_T.magnet * 1.15) < 1e-9, "upgrade magnet");
  ok(P.reviveCost(0) === 150 && P.reviveCost(1) === 300, "revive cost doubles");
  out = P.commitRun({ ...P.defaultSave(), coins: 100 }, { coins: 200 }, { spentRevives: 150 });
  ok(out.save.coins >= 150, "revive spend deducted at commit", out.save.coins);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
