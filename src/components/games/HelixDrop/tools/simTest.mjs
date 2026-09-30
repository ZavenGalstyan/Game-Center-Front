/**
 * Helix Drop — headless test suite against the REAL engine/sim.js.
 *   node src/components/games/HelixDrop/tools/simTest.mjs
 * Every printed number is measured. Exits non-zero on failure.
 */
import { Sim, classify, makeLayer } from "../engine/sim.js";
import { PHYS, TAU, BALL_ANG, norm, deg } from "../engine/constants.js";

let failures = 0;
const ok = (c, m) => {
  if (!c) failures++;
  console.log((c ? "  ok   " : "  FAIL ") + m);
};
const near = (a, b, e) => Math.abs(a - b) <= e;
const ring = (segs, extra = {}) => ({ segs, ...extra });
const FIN = { finish: true, segs: [["safe", 360]] };

/** Run until an event of one of `types` (or n steps); returns the event. */
function until(sim, types, n = 20000) {
  for (let i = 0; i < n; i++) {
    sim.step();
    const e = sim.events.find((x) => types.includes(x.type));
    sim.events.length = 0;
    if (e) return e;
  }
  return null;
}
/** rotate tower so tower-local angle `a` (radians) is under the ball, instantly */
const aimAt = (sim, a) => {
  const r = a - PHYS.BALL_ANGLE;
  sim.rot = sim.target = sim.prevRot = r;
};

/* ------------------------------------------------------------ 1 */
console.log("\n[1] Milestone 1: one column, one ring, one gap, one ball");
{
  // gap at local 0..60°; the ball starts at local 90° (rot 0) → over safe
  const sim = new Sim({ layers: [ring([["gap", 60], ["safe", 300]]), FIN] });
  const e = until(sim, ["bounce", "pass"]);
  ok(e?.type === "bounce", "ball falls and BOUNCES on the safe ring");
  aimAt(sim, deg(30)); // rotate the gap under the ball
  const e2 = until(sim, ["bounce", "pass"]);
  ok(e2?.type === "pass" && e2.layer === 0, "rotating the gap under the ball → it FALLS THROUGH");
  const e3 = until(sim, ["finish"]);
  ok(!!e3 && sim.status === "finished", "reaches the finish platform below");
}

/* ------------------------------------------------------------ 2 */
console.log("\n[2] 1000-bounce stability on a safe ring");
{
  const sim = new Sim({ layers: [ring([["safe", 360]]), FIN] });
  let apex = -Infinity;
  const apexes = [];
  const bottoms = [];
  let bounces = 0;
  let doubles = 0;
  while (bounces < 1001) {
    sim.step();
    apex = Math.max(apex, sim.ball.y);
    const n = sim.events.filter((e) => e.type === "bounce").length;
    if (n > 1) doubles++;
    if (n) {
      bounces++;
      bottoms.push(sim.ball.y - PHYS.BALL_R - sim.layers[0].y);
      if (bounces > 1) apexes.push(apex);
      apex = -Infinity;
    }
    sim.events.length = 0;
  }
  const mn = Math.min(...apexes);
  const mx = Math.max(...apexes);
  console.log(`       apex above platform: ${(mn - PHYS.BALL_R).toFixed(4)} … ${(mx - PHYS.BALL_R).toFixed(4)}`);
  ok(apexes.length === 1000, "1000 bounces recorded");
  ok(mx - mn < 1e-9, "apex identical every bounce (no energy drift)");
  ok(bottoms.every((b) => Math.abs(b) < 1e-12), "ball snapped exactly onto the top every time (no sinking)");
  ok(doubles === 0, "never two bounces in one step");
  const aboveTop = mx + PHYS.BALL_R - sim.layers[0].y;
  ok(aboveTop < PHYS.FLOOR_SPACING - PHYS.PLATFORM_H - 0.1, `ball top at apex (${aboveTop.toFixed(2)}u) never reaches the layer above (${(PHYS.FLOOR_SPACING - PHYS.PLATFORM_H).toFixed(2)}u)`);
}

/* ------------------------------------------------------------ 3 */
console.log("\n[3] Angle collision table (single safe sector 90°..180°, rest gap)");
{
  const L = makeLayer({ segs: [["gap", 90], ["safe", 90], ["gap", 180]] }, 0);
  const m = PHYS.EDGE * BALL_ANG;
  const cases = [0, 1, 45, 89, 90, 179, 180, 269, 270, 359].map((d) => [d, classify(L, deg(d), 0)]);
  console.log("       " + cases.map(([d, k]) => `${d}°:${k}`).join("  "));
  const exp = { 0: "gap", 1: "gap", 45: "gap", 89: "safe", 90: "safe", 179: "safe", 180: "safe", 269: "gap", 270: "gap", 359: "gap" };
  ok(cases.every(([d, k]) => k === exp[d]), "0/1/45/89/90/179/180/269/270/359 classify as expected (89° & 180° are inside the edge forgiveness)");
  ok(classify(L, deg(90) - m * 0.99, 0) === "safe", "just outside the start, inside forgiveness → safe");
  ok(classify(L, deg(90) - m * 1.01, 0) === "gap", "just beyond forgiveness → gap");
  ok(classify(L, deg(180) + m * 0.99, 0) === "safe" && classify(L, deg(180) + m * 1.01, 0) === "gap", "end boundary behaves the same");
  // danger: forgiveness never extends danger outward
  const D = makeLayer({ segs: [["safe", 90], ["danger", 90], ["gap", 180]] }, 0);
  ok(classify(D, deg(135), 0) === "danger", "danger centre → danger");
  ok(classify(D, deg(90) + m * 0.9, 0) === "safe", "danger edge next to safe → safe (lenient)");
  ok(classify(D, deg(180) - m * 0.9, 0) === "gap", "danger edge next to gap → gap (lenient)");
  ok(classify(D, deg(185), 0) === "gap", "just past danger into the gap → gap (never extended)");
  // wrap-around: authored with an offset so the danger sector straddles 0°/360°
  const W = makeLayer({ off: 330, segs: [["danger", 60], ["safe", 300]] }, 0); // danger covers 330°..30°
  const w = [350, 359, 0, 1, 10, 25].map((d) => classify(W, deg(d), 0));
  ok(w.every((k) => k === "danger"), `wrap-around danger 330°→30° holds at 350/359/0/1/10/25 (${w.join(",")})`);
  ok(classify(W, deg(40), 0) === "safe" && classify(W, deg(320), 0) === "safe", "outside the wrapped sector → safe");
  ok(classify(W, deg(360 + 10), 0) === "danger" && classify(W, deg(-350), 0) === "danger", "angles beyond ±360° normalise correctly");
}

/* ------------------------------------------------------------ 4 */
console.log("\n[4] Fast multi-layer crossings (forced velocities)");
{
  const saveMax = PHYS.MAX_FALL;
  for (const floors of [1, 2, 3, 5, 10]) {
    // 12 layers: all gap at the ball except layer index `floors`, which is safe
    const layers = [];
    for (let i = 0; i < 12; i++) layers.push(i === floors ? ring([["safe", 360]]) : ring([["gap", 360]]));
    layers.push(FIN);
    const sim = new Sim({ layers });
    const seen = [];
    PHYS.MAX_FALL = 1e6;
    sim.ball.y = sim.layers[0].y + PHYS.BALL_R + 0.01;
    // one step crosses everything down to below the target layer
    sim.ball.vy = -((floors + 0.6) * PHYS.FLOOR_SPACING) / PHYS.DT;
    sim.step();
    for (const e of sim.events) seen.push(`${e.type}:${e.layer}`);
    sim.events.length = 0;
    PHYS.MAX_FALL = saveMax;
    const passes = seen.filter((s) => s.startsWith("pass")).map((s) => +s.split(":")[1]);
    const inOrder = passes.every((v, i) => v === i);
    if (floors < PHYS.SMASH_STREAK) ok(seen.includes(`bounce:${floors}`) && passes.length === floors && inOrder, `${floors} floor(s) crossed in ONE step: passes [${passes}] in order, then lands on layer ${floors}`);
    else ok(seen.includes(`smashOn:${PHYS.SMASH_STREAK - 1}`) && seen.includes(`smash:${floors}`) && inOrder && seen.indexOf(`smash:${floors}`) > seen.indexOf(`pass:${floors - 1}`), `${floors} floors in ONE step: passes in order [${passes}], SMASH arms after ${PHYS.SMASH_STREAK} and crashes layer ${floors} — nothing skipped, nothing out of order`);
  }
  // high speed onto a thin safe layer at the real terminal velocity
  const sim = new Sim({ layers: [ring([["gap", 360]]), ring([["gap", 360]]), ring([["safe", 360]]), FIN] });
  sim.ball.vy = -PHYS.MAX_FALL;
  const e = until(sim, ["bounce"]);
  ok(e?.layer === 2 && near(sim.ball.y - PHYS.BALL_R, sim.layers[2].y, 1e-9), "terminal-velocity drop lands exactly on the first safe floor (no tunnelling)");
}

/* ------------------------------------------------------------ 5 */
console.log("\n[5] One-way collision, danger, duplicates");
{
  const sim = new Sim({ layers: [ring([["safe", 360]]), FIN] });
  sim.ball.y = sim.layers[0].y - 0.5; // below the layer
  sim.ball.vy = 12; // rising through it
  let hit = false;
  for (let i = 0; i < 20; i++) {
    sim.step();
    if (sim.events.some((e) => e.type === "bounce" && sim.ball.vy > 0 && i < 5)) hit = true;
    sim.events.length = 0;
  }
  ok(!hit, "rising from below never lands on the underside");
  const d = new Sim({ layers: [ring([["danger", 360]], {}), FIN] });
  // a full-danger ring is invalid content, but the sim must still kill exactly once
  let deaths = 0;
  for (let i = 0; i < 2000; i++) {
    d.step();
    deaths += d.events.filter((e) => e.type === "death").length;
    d.events.length = 0;
  }
  ok(deaths === 1 && d.status === "dead", "danger contact fails the run exactly once");
  ok(near(d.ball.y - PHYS.BALL_R, d.layers[0].y, 1e-9), "dead ball rests on the slab (no sinking through)");
  const f = new Sim({ layers: [ring([["gap", 360]]), FIN] });
  let fins = 0;
  for (let i = 0; i < 3000; i++) {
    f.step();
    fins += f.events.filter((e) => e.type === "finish").length;
    f.events.length = 0;
  }
  ok(fins === 1 && f.ball.rest, "finish fires exactly once, ball settles");
}

/* ------------------------------------------------------------ 6 */
console.log("\n[6] Drop streak + SMASH");
{
  const mk = (typeAt4) => {
    const layers = [ring([["safe", 360]])];
    for (let i = 1; i < 4; i++) layers.push(ring([["gap", 360]]));
    layers.push(ring([[typeAt4, 360]]));
    layers.push(ring([["safe", 360]]));
    layers.push(FIN);
    // start already dropping: remove the top ring
    layers[0] = ring([["gap", 360]]);
    return new Sim({ layers });
  };
  for (const t of ["safe", "danger", "break"]) {
    const sim = mk(t);
    const ev = [];
    for (let i = 0; i < 3000 && ev.filter((e) => e.type === "bounce").length === 0 && sim.status === "play"; i++) {
      sim.step();
      ev.push(...sim.events);
      sim.events.length = 0;
    }
    const on = ev.filter((e) => e.type === "smashOn");
    const sm = ev.filter((e) => e.type === "smash");
    const b = ev.find((e) => e.type === "bounce");
    ok(on.length === 1 && on[0].layer === 2, `${t}: SMASH arms once, after the 3rd floor passed`);
    ok(sm.length === 1 && sm[0].layer === 4 && sim.layers[4].destroyed, `${t}: layer 4 (${t}) is smashed and destroyed`);
    ok(sim.status === "play" && b?.layer === 5, `${t}: ball survives, keeps falling, lands normally on layer 5`);
    ok(!sim.ball.smash && sim.ball.streak === 0, `${t}: smash state fully reset after landing`);
  }
  // destroyed layer never collides again, even in a later pass
  const sim = mk("safe");
  until(sim, ["bounce"]);
  const L4 = sim.layers[4];
  ok(L4.destroyed && classify(L4, sim.phi(), sim.t) === "safe", "destroyed layer keeps its sector data (for debris)…");
  let hitAgain = false;
  sim.ball.y = L4.y + 2;
  sim.ball.vy = -5;
  for (let i = 0; i < 40; i++) {
    sim.step();
    if (sim.events.some((e) => e.type === "bounce" && e.layer === 4)) hitAgain = true;
    sim.events.length = 0;
  }
  ok(!hitAgain, "…but is skipped by collision (no ghost platform)");
}

/* ------------------------------------------------------------ 7 */
console.log("\n[7] Rotation: cap, no drift, 1000 revolutions, torture");
{
  const sim = new Sim({ layers: [ring([["safe", 360]]), FIN] });
  sim.dragBy(10);
  const v = [];
  for (let i = 0; i < 30; i++) {
    const r0 = sim.rot;
    sim.step();
    v.push((sim.rot - r0) / PHYS.DT);
  }
  ok(Math.max(...v) <= PHYS.ROT_MAX_SPEED + 1e-9, `angular speed capped at ${PHYS.ROT_MAX_SPEED} rad/s (max seen ${Math.max(...v).toFixed(2)})`);
  for (let i = 0; i < 600; i++) sim.step();
  ok(sim.rot === sim.target, "tower settles exactly on the drag target (no spinning after release)");
  sim.settle();
  const r = sim.rot;
  for (let i = 0; i < 200; i++) sim.step();
  ok(sim.rot === r, "after settle(): zero residual motion");

  // 1000 full revolutions in each direction: collision angle must stay exact
  const L = makeLayer({ segs: [["gap", 40], ["safe", 320]] }, 0);
  const s2 = new Sim({ layers: [ring([["safe", 360]]), FIN] });
  let bad = 0;
  for (let k = 0; k < 2000; k++) {
    s2.dragBy((k % 2 ? -1 : 1) * TAU * 1000 + 0.37);
    for (let i = 0; i < 2; i++) s2.step();
    s2.rot = s2.target; // jump there (we test precision, not speed)
    if (s2.rot > 64 * TAU || s2.rot < -64 * TAU) s2.step();
    const exact = norm(PHYS.BALL_ANGLE + (0.37 * (k + 1)));
    const got = s2.phi();
    const d = Math.abs(((got - exact + Math.PI) % TAU + TAU) % TAU - Math.PI);
    if (d > 1e-6) bad++;
    if (classify(L, got, 0) !== classify(L, exact, 0)) bad++;
  }
  ok(bad === 0, `2000 × 1000-revolution drags: collision angle exact to 1e-6 rad, no desync (${bad} errors), |rot| kept ${Math.abs(s2.rot).toFixed(1)}`);

  // torture: random left/right drags while bouncing/falling through a tower;
  // every classification must match an independent recomputation at the crossing
  let mism = 0;
  let checks = 0;
  const layers = [];
  for (let i = 0; i < 40; i++) layers.push({ off: (i * 47) % 360, segs: [["gap", 50], ["safe", 250], ["danger", 60]] });
  layers.push(FIN);
  let s3 = new Sim({ layers });
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const origClassify = classify;
  for (let i = 0; i < 400000 && checks < 3000; i++) {
    if (s3.status !== "play") s3 = new Sim({ layers });
    if (i % 3 === 0) s3.dragBy((rnd() - 0.5) * 0.8);
    const r0 = s3.rot;
    const t0 = s3.t;
    s3.step();
    const r1 = s3.rot;
    for (const e of s3.events) {
      if (!["bounce", "pass", "death", "smash"].includes(e.type)) continue;
      if (e.f === undefined) continue;
      if (e.type === "pass" && s3.layers[e.layer].destroyed) continue; // the smash event covers it
      checks++;
      // independent recomputation from the rotation before/after the step
      const phi = norm(PHYS.BALL_ANGLE + r0 + (r1 - r0) * e.f);
      const k = origClassify(s3.layers[e.layer], phi, t0 + PHYS.DT * e.f);
      const expected = e.type === "pass" ? "gap" : e.type === "death" ? "danger" : e.kind;
      const good = e.type === "smash" ? k !== "gap" : k === expected; // a smash must have hit something solid
      if (!good || Math.abs(phi - e.phi) > 1e-9) mism++;
    }
    s3.events.length = 0;
  }
  console.log(`       ${checks} contacts during random drag torture`);
  ok(checks >= 3000, "torture produced 3000 contacts (restarting the tower after each fail/finish)");
  ok(mism === 0, `every contact matches an independent recomputation from before/after rotation (${mism} mismatches)`);
}

/* ------------------------------------------------------------ 8 */
console.log("\n[8] Frame-rate independence (accumulator) + stall clamp");
{
  const build = () => {
    const layers = [];
    for (let i = 0; i < 20; i++) layers.push({ off: (i * 73) % 360, segs: [["gap", 70], ["safe", 290]] });
    layers.push(FIN);
    return new Sim({ layers });
  };
  // input as a function of SIM time (like a player's hand, independent of frames)
  const drive = (sim) => {
    const want = Math.floor(sim.t / 0.5) * 0.9;
    sim.target = want;
  };
  const run = (hz, stall = false) => {
    const sim = build();
    let acc = 0;
    let f = 0;
    while (sim.t < 8 && sim.status === "play") {
      let dt = 1 / hz;
      if (stall && f === 40) dt = 5;
      acc += Math.min(dt, PHYS.MAX_FRAME);
      let n = 0;
      while (acc >= PHYS.DT && n < PHYS.MAX_STEPS) {
        drive(sim);
        sim.step();
        sim.events.length = 0;
        acc -= PHYS.DT;
        n++;
      }
      if (n === PHYS.MAX_STEPS) acc = 0;
      f++;
    }
    return `${sim.passedCount}/${sim.stats.bounces}/${sim.lastLayer}`;
  };
  const ref = run(120);
  for (const hz of [30, 60, 144, 240]) ok(run(hz) === ref, `${hz}Hz gives the same floors/bounces/landing layer as 120Hz (${ref})`);
  ok(run(60, true) === ref, "a 5-second stall is clamped — identical outcome, no fall-through");
}

/* ------------------------------------------------------------ 9 */
console.log("\n[9] Long drop: 120-floor development tower");
{
  const layers = [];
  for (let i = 0; i < 120; i++) layers.push({ off: (i * 29) % 360, segs: i % 7 === 6 ? [["gap", 60], ["safe", 300]] : [["gap", 360]] });
  layers.push(FIN);
  const sim = new Sim({ layers });
  let maxY = -Infinity;
  let focusUp = 0;
  let lastFocus = sim.focus;
  let p = 0;
  let pBad = 0;
  for (let i = 0; i < 200000 && sim.status === "play"; i++) {
    // always put the current layer's gap under the ball
    const L = sim.layers.find((l) => !l.passed && !l.finish);
    if (L) sim.target = -PHYS.BALL_ANGLE + L.off + deg(30);
    sim.step();
    sim.events.length = 0;
    if (sim.focus > lastFocus + 1e-9) focusUp++;
    lastFocus = sim.focus;
    const pr = sim.progress;
    if (pr < p - 1e-12 || pr < 0 || pr > 1) pBad++;
    p = pr;
    maxY = Math.max(maxY, sim.ball.y);
    if (sim.ball.y < sim.focus - 3.5) pBad++; // camera must never lose the ball
  }
  ok(sim.status === "finished", `reached the finish of a 120-floor tower (t=${sim.t.toFixed(1)}s, ${sim.stats.floors} floors passed, ${sim.stats.smashes} smashes)`);
  ok(pBad === 0, "progress monotonic in [0,1] and the ball never left the camera focus band");
  ok(focusUp === 0, "camera focus only ever moved down");
  ok(sim.progress === 1, "progress reads exactly 100% at the finish");
}

/* ------------------------------------------------------------ 10 */
console.log("\n[10] Endless generator: structure of 3000 rings + a slow bot descends 600 floors (real Sim)");
{
  const { EndlessGen } = await import("../engine/endless.js");
  const { Bot } = await import("../engine/bot.js");
  // structural sweep
  let bad = 0;
  for (const seed of [1, 2, 3]) {
    const g = new EndlessGen(seed);
    const rings = [...g.initial(), ...g.next(1000)];
    for (const l of rings) {
      const sum = l.segs.reduce((a, [, d]) => a + d, 0);
      const gaps = l.segs.filter(([t]) => t === "gap");
      const danger = l.segs.filter(([t]) => t === "danger").reduce((a, [, d]) => a + d, 0);
      if (sum !== 360 || !gaps.length || danger >= 360 || danger > 170) bad++;
    }
  }
  ok(bad === 0, `3000 generated rings: all sum to 360°, all have a gap, danger capped (${bad} violations)`);
  const runs = [];
  for (const seed of [11, 22, 33]) {
    const gen = new EndlessGen(seed);
    const sim = new Sim({ layers: gen.initial() }, { rotCap: 0.45 });
    const bot = new Bot({ mode: "safe", react: 0.14 });
    let maxLayers = 0;
    while (sim.status === "play" && sim.stats.floors < 600 && sim.t < 1500) {
      while (gen.bottomY > sim.focus - 40) sim.addLayers(gen.next(4));
      sim.prune(14);
      maxLayers = Math.max(maxLayers, sim.layers.length);
      bot.drive(sim);
      sim.step();
      sim.events.length = 0;
    }
    runs.push({ seed, floors: sim.stats.floors, status: sim.status, t: sim.t, maxLayers });
  }
  for (const r of runs) {
    console.log(`       seed ${r.seed}: ${r.floors} floors in ${r.t.toFixed(0)}s (${r.status}), live rings max ${r.maxLayers}`);
    ok(r.floors >= 600, `seed ${r.seed}: bot at 45% turn speed descends 600 generated floors`);
    ok(r.maxLayers < 40, `seed ${r.seed}: old rings are pruned (max ${r.maxLayers} alive)`);
  }
}

/* ------------------------------------------------------------ 11 */
console.log("\n[11] Menu demo: 60 s of the attract-mode tower");
{
  const { Engine } = await import("../engine/engine.js");
  const e = new Engine();
  let deaths = 0;
  let resets = 0;
  let lastSim = e.sim;
  for (let i = 0; i < 60 * 60; i++) {
    e.tick(1 / 60);
    if (e.sim !== lastSim) {
      resets++;
      lastSim = e.sim;
    }
    if (e.sim.status === "dead" && !e._counted) {
      deaths++;
      e._counted = true;
    }
    if (e.sim.status !== "dead") e._counted = false;
  }
  console.log(`       ${resets} demo loops, ${deaths} deaths`);
  ok(deaths === 0, "the demo ball never dies (it teaches the game, not failure)");
  ok(resets > 0, "the demo loops back to the top after the finish");
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
