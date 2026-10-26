/**
 * Shadow Runner — physics / engine regression suite.
 *
 *   node src/components/games/ShadowRunner/tools/simTest.mjs
 *
 * Covers jump envelope, coyote time, jump buffer, slide/bonk, vault, mantle,
 * wall jump, springs, timed lasers, crumbling roofs, checkpoint respawn coin
 * rollback, the hunter, clone isolation, mover determinism under interleaved
 * sims (a real bug the browser pilot caught), replay determinism, a
 * random-input collision torture test across all 40 levels, and level-set
 * sanity (ids, districts, par times).
 */
import { level } from "../engine/level.js";
import { createSim, cloneSim, step } from "../engine/sim.js";
import { solve, replay } from "../engine/bot.js";
import { PHYS, DT } from "../engine/constants.js";
import { LEVELS, DISTRICTS } from "../levels/index.js";
import PAR from "../levels/par.js";

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("  FAIL", msg);
  }
};
const section = (name) => console.log("\n" + name);
const run = (s, sec, input = {}) => {
  for (let i = 0; i < Math.round(sec / DT); i++) {
    Object.assign(s.input, input);
    step(s);
  }
};
const flat = (fn, meta = {}) => level({ id: 0, name: "t", chase: false, ...meta }, fn);

// ------------------------------------------------------------------ jump envelope
section("jump envelope");
{
  const L = flat((b) => b.roof(4000).finish(3900), { run: 380 });
  const s = createSim(L, { bot: true });
  run(s, 2);
  ok(Math.abs(s.p.vx - 380) < 0.01, `reaches top speed (${s.p.vx})`);
  const x0 = s.p.x;
  const y0 = s.p.y;
  let apex = 0;
  let n = 0;
  s.input.jump = true;
  do {
    step(s);
    n++;
    apex = Math.max(apex, y0 - s.p.y);
  } while (s.p.mode !== "run" && n < 400);
  const range = s.p.x - x0;
  ok(range > 245 && range < 275, `full jump range ≈260 (${range.toFixed(1)})`);
  ok(apex > 120 && apex < 135, `full jump apex ≈128 (${apex.toFixed(1)})`);
  s.input.jump = false;
  run(s, 0.3);
  const y1 = s.p.y;
  s.input.jump = true;
  step(s);
  s.input.jump = false;
  apex = 0;
  n = 0;
  do {
    step(s);
    n++;
    apex = Math.max(apex, y1 - s.p.y);
  } while (s.p.mode !== "run" && n < 400);
  ok(apex > 30 && apex < 60, `tap jump is lower (${apex.toFixed(1)})`);
}

// ------------------------------------------------------------------ coyote + buffer
section("coyote time + jump buffer");
{
  const mk = () => flat((b) => b.roof(600).gap(400).roof(600).finish(500));
  for (const [late, expect] of [
    [0.06, true],
    [0.16, false],
  ]) {
    const s = createSim(mk(), { bot: true });
    while (s.p.mode !== "air") step(s);
    run(s, late);
    s.input.jump = true;
    step(s);
    ok((s.p.vy < -500) === expect, `jump ${late}s after leaving the edge ${expect ? "works" : "is refused"} (vy ${s.p.vy.toFixed(0)})`);
  }
  // buffer: press shortly before landing
  const L = flat((b) => b.roof(3000).finish(2900));
  const s = createSim(L, { bot: true });
  run(s, 1);
  s.input.jump = true;
  step(s);
  s.input.jump = false;
  while (!(s.p.vy > 0 && s.p.y + s.p.h > L.start.y - 18)) step(s);
  s.input.jump = true; // pressed ~a few frames before touchdown
  step(s);
  s.input.jump = true;
  let jumped = false;
  for (let i = 0; i < 30; i++) {
    step(s);
    if (s.p.vy < -600) jumped = true;
  }
  ok(jumped, "jump pressed just before landing fires on touchdown");
}

// ------------------------------------------------------------------ slide / bonk / vault / mantle
section("slide, bonk, vault, mantle");
{
  const L = flat((b) => b.roof(2000).bar(500, 120).finish(1900));
  const s = createSim(L, { bot: true });
  run(s, 2.4);
  ok(s.p.x < 500 && s.p.mode === "run" && s.p.vx < 10, `running into a duct without sliding stops you (x ${s.p.x.toFixed(0)}, ${s.p.mode})`);
  const s2 = createSim(L, { bot: true });
  while (s2.p.x < 340) step(s2);
  s2.input.down = true;
  step(s2);
  s2.input.down = false;
  run(s2, 1.4);
  ok(s2.p.x > 640, `sliding passes under it (x ${s2.p.x.toFixed(0)})`);
  ok(s2.p.mode === "run" && s2.p.h === PHYS.H, "and stands back up after");

  const V = flat((b) => b.roof(2000).vault(600).finish(1900));
  const sv = createSim(V, { bot: true });
  let vaulted = false;
  let minV = Infinity;
  for (let i = 0; i < 400; i++) {
    step(sv);
    for (const e of sv.events) if (e === "vault") vaulted = true;
    sv.events.length = 0;
    if (sv.p.x > 560 && sv.p.x < 700) minV = Math.min(minV, Math.abs(sv.p.vx));
  }
  ok(vaulted && sv.p.x > 700, "low crate is vaulted automatically");
  ok(minV > 200, `vault keeps momentum (min ${minV.toFixed(0)})`);

  const M = flat((b) => b.roof(2000).wall(600, 80, 200).finish(1900));
  const sm = createSim(M, { bot: true });
  run(sm, 3);
  ok(sm.p.x > 820 && sm.phase === "play", `80u ledge is climbed (x ${sm.p.x.toFixed(0)})`);
  const T = flat((b) => b.roof(2000).wall(600, 160, 200).finish(1900));
  const st = createSim(T, { bot: true });
  run(st, 3);
  ok(st.p.x < 600, "160u wall blocks a runner who doesn't jump");
  ok(solve(T).ok, "160u wall is passable with jump + climb");
}

// ------------------------------------------------------------------ wall jump + spring
section("wall jump, spring");
{
  const shaft = flat((b) => {
    b.roof(860).block(600, 600, 60, 480).wall(790, 420, 70);
    b.roof(800, -420).finish(600);
  });
  const r = solve(shaft);
  ok(r.ok, "420u shaft climbable by wall jumps");
  const s = createSim(shaft, { bot: true });
  let wj = 0;
  for (const a of r.actions)
    for (let i = 0; i < 6; i++) {
      s.input = { jump: a === 1, down: a === 2, brake: a === 3 };
      step(s);
      for (const e of s.events) if (e === "walljump") wj++;
      s.events.length = 0;
    }
  ok(wj >= 2, `route uses wall jumps (${wj})`);
  const noWJ = flat((b) => b.roof(860).wall(790, 420, 70).roof(800, -420).finish(600));
  ok(!solve(noWJ).ok, "single 420u wall with no opposite face is NOT climbable");

  const SP = flat((b) => b.roof(1200).spring(500).finish(1100));
  const ss = createSim(SP, { bot: true });
  let sprung = false;
  for (let i = 0; i < 300; i++) {
    step(ss);
    if (ss.events.includes("spring")) sprung = true;
    ss.events.length = 0;
  }
  ok(sprung, "running over a spring launches you");
}

// ------------------------------------------------------------------ lasers, crumble, respawn
section("lasers, crumbling roofs, checkpoints");
{
  const Lz = flat((b) => b.roof(2000).laser(600, 440, 440, { w: 10, on: 10, off: 0.001 }).finish(1900));
  const s = createSim(Lz, { bot: true });
  run(s, 3);
  ok(s.phase === "dead" && s.deathCause === "laser", "touching an active laser kills");
  const Loff = flat((b) => b.roof(2000).laser(600, 440, 440, { w: 10, on: 0.001, off: 10 }).finish(1900));
  const s2 = createSim(Loff, { bot: true });
  run(s2, 3);
  ok(s2.phase === "play" && s2.p.x > 700, "an inactive laser is harmless");

  const C = flat((b) => b.roof(400).crumble(900, 0, 0.45).roof(400).finish(300));
  const sc = createSim(C, { bot: true });
  run(sc, 1);
  run(sc, 3, { brake: true });
  ok(sc.phase === "dead" && sc.deathCause === "fall", "lingering on a crumbling roof drops you");
  ok(sc.crumble[0] === Infinity, "the roof is gone");

  const R = flat((b) => b.roof(3000).coins(200, 3).cp(700).coins(900, 3).laser(1300, 440, 440, { w: 10 }).finish(2900));
  const sr = createSim(R);
  for (let i = 0; i < 1200 && sr.phase === "play"; i++) step(sr);
  ok(sr.phase === "dead" && sr.coinCount === 6, `collected 6 then died (${sr.coinCount})`);
  run(sr, PHYS.DEAD_T + 0.02);
  ok(sr.phase === "play" && sr.deaths === 1, "respawned automatically");
  ok(sr.coinCount === 3 && Math.abs(sr.p.x - 700) < 20, `coins after the checkpoint roll back, spawn at checkpoint (${sr.coinCount}, x ${sr.p.x.toFixed(0)})`);
  ok(sr.trail.length === 0 || sr.trail[sr.trail.length - 1].x <= 760, "hunter trail truncated to the checkpoint");
}

// ------------------------------------------------------------------ hunter
section("hunter");
{
  const H = level({ id: 0, name: "h", chase: { ratio: 0.9, lead: 260 } }, (b) => b.roof(9000).finish(8900));
  const s = createSim(H, { bot: true });
  run(s, 12);
  ok(s.phase === "play", "a clean run stays ahead");
  ok(s.p.dist - s.chase.h <= 331, `lead is capped (${(s.p.dist - s.chase.h).toFixed(0)})`);
  run(s, 8, { brake: true });
  ok(s.phase === "dead" && s.deathCause === "caught", "braking for long gets you caught");
}

// ------------------------------------------------------------------ clone + determinism
section("clone isolation, mover determinism, replay");
{
  const L = LEVELS.find((l) => l.id === 21);
  const a = createSim(L, { bot: true });
  run(a, 1.5);
  const snap = JSON.stringify([a.p.x, a.p.y, a.p.vx, a.t]);
  const c = cloneSim(a);
  run(c, 2, { jump: true });
  ok(JSON.stringify([a.p.x, a.p.y, a.p.vx, a.t]) === snap, "stepping a clone leaves the original untouched");

  // interleave two sims at different times on a mover level, compare with a solo run
  const solo = createSim(L, { bot: true });
  const x1 = createSim(L, { bot: true });
  const x2 = createSim(L, { bot: true });
  run(x2, 0.77);
  for (let i = 0; i < 900; i++) {
    step(solo);
    step(x1);
    step(x2);
  }
  ok(solo.p.x === x1.p.x && solo.p.y === x1.p.y, "mover carry identical when other sims share the level");

  for (const id of [8, 22, 33]) {
    const Lv = LEVELS.find((l) => l.id === id);
    const r = solve(Lv);
    const f1 = replay(Lv, r.actions);
    const f2 = replay(Lv, r.actions);
    ok(f1.phase === "done" && f2.phase === "done" && f1.time === f2.time && f1.p.x === f2.p.x, `L${id} replay deterministic (${f1.time.toFixed(3)})`);
  }
}

// ------------------------------------------------------------------ torture
section("random-input collision torture (all 40 levels)");
{
  let checks = 0;
  let bad = 0;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const L of LEVELS) {
    for (let runN = 0; runN < 6; runN++) {
      const s = createSim(L);
      let held = { jump: false, down: false, brake: false };
      for (let i = 0; i < 120 * 40 && s.phase !== "done"; i++) {
        if (i % 9 === 0) held = { jump: rnd() < 0.45, down: rnd() < 0.12, brake: rnd() < 0.08 };
        s.input = held;
        step(s);
        const p = s.p;
        checks++;
        if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.vx) || !isFinite(p.vy)) {
          bad++;
          if (bad < 5) console.log("    NaN", L.id, i);
          break;
        }
        if (s.phase === "play" && !p.sc) {
          const inside = L.solids.concat(L.crumbles.filter((c) => s.crumble[c.ci] !== Infinity), L.movers).find(
            (c) => p.x < c.x + c.w - 1 && p.x + p.w > c.x + 1 && p.y < c.y + c.h - 1 && p.y + p.h > c.y + 1
          );
          if (inside) {
            bad++;
            if (bad < 5) console.log(`    L${L.id} step ${i}: player (${p.x.toFixed(1)},${p.y.toFixed(1)},${p.mode}) inside ${inside.kind} at ${inside.x},${inside.y}`);
          }
        }
      }
    }
  }
  ok(bad === 0, `no tunnelling / NaN across ${checks} random steps (${bad} bad)`);
}

// ------------------------------------------------------------------ level set
section("level set");
{
  ok(LEVELS.length === 40, "40 levels");
  ok(new Set(LEVELS.map((l) => l.id)).size === 40 && LEVELS.every((l, i) => l.id === i + 1), "ids 1..40 in order");
  ok(new Set(LEVELS.map((l) => l.name)).size === 40, "unique names");
  ok(DISTRICTS.every((d) => LEVELS.filter((l) => l.district === d.id).length === 10), "10 levels per district");
  ok(LEVELS.every((l) => PAR[l.id] && PAR[l.id] < 100), "every level has a generated par time");
  ok(LEVELS.every((l) => l.checkpoints.length >= 1 || l.id <= 1), "checkpoints present");
  const sig = new Set(LEVELS.map((l) => l.solids.length + ":" + l.lasers.length + ":" + l.length));
  ok(sig.size === 40, "no two levels share a layout signature");
}

console.log(`\n${fail ? "FAILED" : "PASSED"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
