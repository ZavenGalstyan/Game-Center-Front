/**
 * Jump Ball — headless physics test suite. Runs the REAL engine/sim.js.
 *
 *   node src/components/games/JumpBall/tools/simTest.mjs
 *
 * Exits non-zero on any failure. Every number printed here is measured, not
 * assumed.
 */
import { Sim } from "../engine/sim.js";
import { PHYS } from "../engine/constants.js";

let failures = 0;
const ok = (cond, msg) => {
  if (!cond) {
    failures++;
    console.log("  FAIL " + msg);
  } else console.log("  ok   " + msg);
};
const near = (a, b, eps) => Math.abs(a - b) <= eps;

const lvl = (platforms, extra = {}) => ({
  width: 600,
  platforms: [{ id: "s", type: "start", x: 300, y: 0, w: 240 }, ...platforms],
  stars: [],
  ...extra,
});

/** Step until n "land" events (or a death/finish), collecting per-bounce data. */
function bounces(sim, n, maxSteps = 1e7) {
  const out = [];
  let apex = -Infinity;
  for (let i = 0; i < maxSteps && out.length < n && sim.status === "play"; i++) {
    sim.step();
    apex = Math.max(apex, sim.ball.y);
    for (const e of sim.events) if (e.type === "land") {
      out.push({ ...e, apex, t: sim.t, bottom: sim.ball.y - PHYS.R });
      apex = -Infinity;
    }
    sim.events.length = 0;
  }
  return out;
}

/* ------------------------------------------------------------------ 1 */
console.log("\n[1] 1000-bounce stability — no input, safe start platform");
{
  const sim = new Sim(lvl([]));
  const b = bounces(sim, 1001);
  const tail = b.slice(1); // bounce 0 lands from the smaller intro hop
  const apexes = tail.map((x) => x.apex);
  const periods = tail.slice(1).map((x, i) => x.t - tail[i].t);
  const bottoms = tail.map((x) => x.bottom);
  const minA = Math.min(...apexes);
  const maxA = Math.max(...apexes);
  console.log(`       bounces=${tail.length}  apex min/max=${minA.toFixed(4)}/${maxA.toFixed(4)}  period=${periods[0].toFixed(4)}s`);
  ok(tail.length === 1000, "1000 landings recorded");
  ok(maxA - minA < 1e-6, "apex identical on every bounce (no drift / growth / shrink)");
  ok(bottoms.every((y) => near(y, 0, 1e-9)), "ball bottom snapped exactly onto top every landing (no sinking)");
  ok(periods.every((p) => near(p, periods[0], 1e-6)), "bounce period constant");
  ok(sim.status === "play" && sim.ball.x === 300, "never moved horizontally, still alive");
  ok(sim.events.length === 0, "event queue drained (no accumulation)");
  const expect = (PHYS.BOUNCE * PHYS.BOUNCE) / (2 * PHYS.G);
  ok(near(minA - PHYS.R, expect, 8), `apex ≈ analytic ${expect.toFixed(1)}u (got ${(minA - PHYS.R).toFixed(1)})`);
}

/* ------------------------------------------------------------------ 2 */
console.log("\n[2] Hold RIGHT — acceleration, cap, landing");
{
  const sim = new Sim(lvl([{ id: "b", type: "normal", x: 520, y: 0, w: 140 }]));
  bounces(sim, 1); // land once from the intro hop
  sim.setInput(1);
  const vs = [];
  for (let i = 0; i < 30; i++) {
    sim.step();
    vs.push(sim.ball.vx);
  }
  const steps = vs.findIndex((v) => v >= PHYS.MAX_VX - 1e-9);
  console.log(`       vx after 1 step=${vs[0].toFixed(1)}  reached cap ${PHYS.MAX_VX} after ${steps} steps (${(steps * PHYS.DT * 1000).toFixed(0)}ms)`);
  ok(vs[0] > 0 && vs[0] < PHYS.MAX_VX * 0.2, "no instant max speed");
  ok(vs.every((v, i) => i === 0 || v >= vs[i - 1] - 1e-9), "velocity rises monotonically");
  ok(steps > 12 && steps < 40, "reaches cap in a 0.1–0.33s window");
  let maxV = 0;
  for (let i = 0; i < 2000 && sim.status === "play"; i++) {
    sim.step();
    maxV = Math.max(maxV, Math.abs(sim.ball.vx));
  }
  ok(maxV <= PHYS.MAX_VX + 1e-9, `horizontal speed never exceeds cap (max ${maxV.toFixed(2)})`);
  ok(sim.ball.x <= 600 - PHYS.R + 1e-9, "hard right wall holds");
}

/* ------------------------------------------------------------------ 3 */
console.log("\n[3] Right then LEFT mid-air — controlled reversal");
{
  const sim = new Sim(lvl([]));
  bounces(sim, 1);
  sim.setInput(1);
  for (let i = 0; i < 40; i++) sim.step();
  const v0 = sim.ball.vx;
  sim.setInput(-1);
  const trace = [];
  for (let i = 0; i < 60; i++) {
    sim.step();
    trace.push(sim.ball.vx);
  }
  const zero = trace.findIndex((v) => v <= 0);
  const full = trace.findIndex((v) => v <= -PHYS.MAX_VX + 1e-9);
  const maxJump = Math.max(...trace.map((v, i) => Math.abs(v - (i ? trace[i - 1] : v0))));
  console.log(`       from +${v0.toFixed(0)}: through 0 after ${(zero * PHYS.DT * 1000).toFixed(0)}ms, full left after ${(full * PHYS.DT * 1000).toFixed(0)}ms, max Δv/step=${maxJump.toFixed(1)}`);
  ok(zero > 5, "decelerates before reversing (not instant)");
  ok(full > zero + 5, "then accelerates left gradually");
  ok(maxJump < 60, "no teleport-like velocity jump");
  ok(zero * PHYS.DT < 0.15, "reversal still responsive (<150ms to stop)");
}

/* ------------------------------------------------------------------ 4 */
console.log("\n[4] Collision torture");
{
  // drop the ball from height h over a platform at offset dx; returns the landing event or null
  const drop = (plat, dx, h = 300, vy = 0) => {
    const sim = new Sim(lvl([{ id: "t", type: "normal", x: 300, y: -2000, w: 10 }, { id: "p", ...plat }]));
    sim.platforms = sim.platforms.filter((p) => p.id === "p");
    sim.anchor = -5000;
    sim._camFloor = -Infinity;
    sim.ball.x = plat.x + dx;
    sim.ball.y = plat.y + PHYS.R + h;
    sim.ball.vy = vy;
    sim.ball.vx = 0;
    for (let i = 0; i < 3000 && sim.status !== "dead"; i++) {
      sim.step();
      const e = sim.events.find((x) => x.type === "land" || x.type === "finish");
      sim.events.length = 0;
      if (e) return { e, sim };
      if (sim.ball.y < plat.y - 600) return null;
    }
    return null;
  };
  const P = { type: "normal", x: 300, y: 0, w: 120 };
  const foot = PHYS.R * PHYS.FOOT;
  ok(!!drop(P, 0), "center landing");
  ok(drop(P, 0)?.e.perfect === true, "center landing is PERFECT");
  ok(!!drop(P, -60 - foot + 0.5), "left edge landing (0.5u footprint overlap)");
  ok(!!drop(P, 60 + foot - 0.5), "right edge landing (0.5u footprint overlap)");
  ok(!drop(P, 60 + foot + 0.5), "0.5u outside footprint misses");
  ok(!drop(P, -60 - foot - 0.5), "0.5u outside footprint misses (left)");
  // high speed: start at terminal velocity 5 units above — one step moves ~15.8u
  const fast = drop(P, 0, 5, -PHYS.MAX_FALL);
  ok(!!fast && near(fast.sim.ball.y - PHYS.R, 0, 1e-9), "terminal-velocity fall lands exactly on top (no tunneling)");
  // thin platform at huge speed
  const thin = drop({ ...P, w: 40 }, 0, 700);
  ok(!!thin, "long fall onto a narrow platform lands");
  // exactly one land event per landing
  {
    const sim = new Sim(lvl([]));
    let lands = 0;
    let stepsWithTwo = 0;
    for (let i = 0; i < 12000; i++) {
      sim.step();
      const n = sim.events.filter((e) => e.type === "land").length;
      if (n > 1) stepsWithTwo++;
      lands += n;
      sim.events.length = 0;
    }
    ok(stepsWithTwo === 0, `never two landings in one step (${lands} landings over ${12000} steps)`);
  }
  // rising through from below does not land
  {
    const sim = new Sim(lvl([{ id: "a", type: "normal", x: 300, y: 120, w: 200 }]));
    sim.ball.y = PHYS.R + 1;
    sim.ball.vy = PHYS.BOUNCE;
    let landedWhileRising = false;
    let passed = false;
    for (let i = 0; i < 400; i++) {
      const vyBefore = sim.ball.vy;
      sim.step();
      if (sim.ball.y - PHYS.R > 120) passed = true;
      for (const e of sim.events) if (e.type === "land" && vyBefore > 0) landedWhileRising = true;
      sim.events.length = 0;
    }
    ok(passed, "ball passes upward through a one-way platform");
    ok(!landedWhileRising, "no landing while rising");
  }
  // overlap-but-below: ball centre already under the top (came from below) must not snap up
  {
    const r = drop({ type: "normal", x: 300, y: 0, w: 120 }, 0, -10, -10);
    ok(!r || r.e.platform !== "p", "ball starting below a top never snaps up onto it");
  }

  // moving platform: land where it IS, not where it was authored
  {
    const mv = { type: "moving", x: 300, y: 0, w: 110, move: { axis: "x", amp: 150, period: 3 } };
    let hits = 0;
    let wrong = 0;
    for (let k = 0; k < 40; k++) {
      const sim = new Sim(lvl([{ id: "m", ...mv }]));
      sim.platforms = sim.platforms.filter((p) => p.id === "m");
      sim.anchor = -5000;
      sim._camFloor = -Infinity;
      sim.t = k * 0.075;
      const px = 300 + 150 * Math.sin((2 * Math.PI * (sim.t + 0.2)) / 3);
      sim.ball.x = px;
      sim.ball.y = PHYS.R + 30;
      sim.ball.vy = -60;
      for (let i = 0; i < 200 && sim.status === "play"; i++) {
        sim.step();
        const e = sim.events.find((x) => x.type === "land");
        sim.events.length = 0;
        if (e) {
          hits++;
          if (Math.abs(e.x - (300 + 150 * Math.sin((2 * Math.PI * e.t) / 3))) > 55 + 20) wrong++;
          break;
        }
      }
    }
    ok(hits >= 36, `moving platform: ${hits}/40 aimed drops land`);
    ok(wrong === 0, "moving platform: every landing is within the platform's CURRENT extent");
  }
  // authored position with the platform moved away → must miss
  {
    const r = drop({ type: "moving", x: 300, y: 0, w: 80, move: { axis: "x", amp: 200, period: 4, phase: 0.25 } }, 0, 20);
    // phase .25 → platform sits at x=500 at t≈0; ball at authored x=300 must fall through
    ok(!r, "ball over the AUTHORED x of a moved platform falls through (no ghost collision)");
  }

  // spring
  {
    const r = drop({ type: "spring", x: 300, y: 0, w: 90 }, 0, 100);
    ok(!!r && r.sim.ball.vy === PHYS.SPRING, "spring gives exactly SPRING take-off");
    // no double boost: next steps must not re-land while rising
    let extra = 0;
    for (let i = 0; i < 30; i++) {
      r.sim.step();
      extra += r.sim.events.filter((e) => e.type === "land").length;
      r.sim.events.length = 0;
    }
    ok(extra === 0, "spring: no second boost on the following steps");
  }
  // breaking
  {
    const r = drop({ type: "breaking", x: 300, y: 0, w: 110 }, 0, 100);
    ok(!!r && r.sim.ball.vy === PHYS.BOUNCE, "breaking: full normal bounce is delivered");
    ok(r && r.sim.platforms[0].broken, "breaking: breaks only AFTER delivering the bounce");
    ok(r && r.sim.status === "play", "breaking: does not damage the ball");
    // falls straight back down → passes through the broken platform
    let relanded = false;
    for (let i = 0; i < 400 && r.sim.status === "play"; i++) {
      r.sim.step();
      if (r.sim.events.some((e) => e.type === "land")) relanded = true;
      r.sim.events.length = 0;
    }
    ok(!relanded, "breaking: broken platform no longer collides");
  }
  // ice
  {
    const r = drop({ type: "ice", x: 300, y: 0, w: 140 }, 0, 100);
    ok(r && r.sim.ball.ice > 0, "ice: effect applied on landing");
    const sim = r.sim;
    sim.setInput(1);
    for (let i = 0; i < 20; i++) sim.step();
    sim.setInput(0);
    const v1 = sim.ball.vx;
    for (let i = 0; i < 12; i++) sim.step();
    const iceDecay = v1 - sim.ball.vx;
    ok(iceDecay < PHYS.DRAG * 0.1 * 0.3, `ice: low drag while active (lost ${iceDecay.toFixed(1)} u/s in 0.1s)`);
    for (let i = 0; i < 200; i++) sim.step();
    ok(sim.ball.ice === 0, "ice: effect clears on its own (timer)");
    // and clears on a normal landing
    const r2 = drop({ type: "ice", x: 300, y: 0, w: 140 }, 0, 100);
    r2.sim.platforms[0].type = "normal";
    for (let i = 0; i < 400; i++) {
      r2.sim.step();
      if (r2.sim.events.some((e) => e.type === "land")) break;
    }
    ok(r2.sim.ball.ice === 0, "ice: normal landing clears the effect immediately");
  }
  // vanish: invisible (off) → no collision; on → collision
  {
    const cyc = { on: 1, warn: 0.5, off: 1, back: 0.5, offset: 0 };
    const mk = (t0) => {
      const sim = new Sim(lvl([{ id: "v", type: "vanish", x: 300, y: 0, w: 120, cycle: cyc }]));
      sim.platforms = sim.platforms.filter((p) => p.id === "v");
      sim.anchor = -5000;
      sim._camFloor = -Infinity;
      sim.t = t0;
      sim.ball.x = 300;
      sim.ball.y = PHYS.R + 2;
      sim.ball.vy = -100;
      for (let i = 0; i < 10; i++) {
        sim.step();
        if (sim.events.some((e) => e.type === "land")) return true;
      }
      return false;
    };
    ok(mk(0.3) === true, "vanish: solid while visible");
    ok(mk(1.2) === true, "vanish: still solid while blinking (warn)");
    ok(mk(1.9) === false, "vanish: NOT solid while gone");
    ok(mk(2.7) === false, "vanish: NOT solid while fading back in");
  }
  // spikes kill, finish finishes once
  {
    const sim = new Sim(lvl([{ id: "k", type: "spikes", x: 300, y: 0, w: 120, h: 24 }]));
    sim.platforms = sim.platforms.filter((p) => p.id === "k");
    sim.anchor = -5000;
    sim._camFloor = -Infinity;
    sim.ball.y = 80;
    sim.ball.vy = 0;
    for (let i = 0; i < 100; i++) sim.step();
    ok(sim.status === "dead" && sim.deathCause === "spikes", "spikes: touching them fails the attempt");
  }
  {
    const r = drop({ type: "finish", x: 300, y: 0, w: 140 }, 0, 100);
    let finishes = r.e ? 0 : 0;
    const sim = r.sim;
    finishes = sim.status === "finished" ? 1 : 0;
    for (let i = 0; i < 1200; i++) {
      sim.step();
      finishes += sim.events.filter((e) => e.type === "finish").length;
      sim.events.length = 0;
    }
    ok(finishes === 1, "finish: fires exactly once");
    ok(sim.ball.rest === true && near(sim.ball.y - PHYS.R, 0, 1e-6), "finish: ball settles onto the goal");
  }
}

/* ------------------------------------------------------------------ 5 */
console.log("\n[5] Frame-rate independence (accumulator at 30/60/120/144/240 Hz + stalls)");
{
  // scripted input as a function of SIM time → any frame rate must give the same trajectory
  const script = (t) => (t < 0.4 ? 0 : t < 1.1 ? 1 : t < 1.5 ? -1 : t < 2.3 ? 0 : 1);
  const runAt = (hz, stall = false) => {
    const sim = new Sim(lvl([{ id: "a", type: "normal", x: 470, y: 130, w: 120 }, { id: "b", type: "normal", x: 250, y: 260, w: 120 }]));
    let acc = 0;
    let frames = 0;
    while (sim.t < 4 && sim.status === "play") {
      let dt = 1 / hz;
      if (stall && frames === 50) dt = 3; // tab-restore spike
      dt = Math.min(dt, PHYS.MAX_FRAME);
      acc += dt;
      let n = 0;
      while (acc >= PHYS.DT && n < PHYS.MAX_STEPS) {
        sim.setInput(script(sim.t));
        sim.step();
        acc -= PHYS.DT;
        n++;
      }
      if (n === PHYS.MAX_STEPS) acc = 0;
      frames++;
    }
    return { x: sim.ball.x, y: sim.ball.y, t: sim.t, lands: sim.stats.bounces, anchor: sim.anchor };
  };
  const ref = runAt(120);
  for (const hz of [30, 60, 144, 240]) {
    const r = runAt(hz);
    // compare at equal sim time: re-run reference to r.t
    ok(r.lands === ref.lands && r.anchor === ref.anchor, `${hz}Hz: same landings (${r.lands}) and same highest platform as 120Hz`);
  }
  const st = runAt(60, true);
  ok(st.lands === ref.lands && st.anchor === ref.anchor, "3s stall is clamped: no teleport, same platform sequence");
}

/* ------------------------------------------------------------------ 6 */
console.log("\n[6] Endless generator — bot climbs the generated main path with the REAL sim");
{
  const { EndlessGen, reach } = await import("../engine/endless.js");
  const { runBounce, fallTime } = await import("../engine/bot.js");
  const { platSolid } = await import("../engine/sim.js");
  const TARGET = 600;
  for (const seed of [1, 7, 4242]) {
    const gen = new EndlessGen(seed);
    const first = gen.initial();
    const sim = new Sim({ width: PHYS.WIDTH, platforms: first.platforms, stars: first.stars, endless: true }, { ctrl: 0.85 });
    const feed = () => {
      while (gen.topY < sim.camBottom + PHYS.VIEW_H * 2.2) {
        const c = gen.next();
        sim.addPlatforms(c.platforms);
        sim.addStars(c.stars);
      }
      sim.prune(900);
    };
    feed();
    let path = 0;
    let generated = 0;
    let maxPlatforms = 0;
    let fail = null;
    let geomBad = 0;
    // independent geometric check of every generated path transition
    {
      const g2 = new EndlessGen(seed);
      let prev = g2.initial().platforms[0];
      for (let i = 0; i < TARGET + 20; i++) {
        const ch = g2.next();
        const p = ch.platforms.find((q) => q.path !== undefined);
        const dy = p.y - prev.y;
        const launch = prev.type === "spring" ? PHYS.SPRING : PHYS.BOUNCE;
        const apex = (launch * launch) / (2 * PHYS.G);
        const amp = p.move ? p.move.amp : 0;
        const dx = Math.abs(p.x - prev.x) + amp;
        if (dy > apex * 0.75 || dx > reach(dy, launch) * 0.8 + p.w / 2) geomBad++;
        if (p.x - p.w / 2 - amp < 0 || p.x + p.w / 2 + amp > PHYS.WIDTH) geomBad++;
        prev = p;
      }
    }
    let bounces = 0;
    while (path < TARGET && bounces < TARGET * 8) {
      const next = sim.platforms.find((p) => p.path === path + 1);
      if (!next) {
        fail = `path ${path + 1} missing`;
        break;
      }
      // like a player: if a vanisher would be gone on arrival, bounce in place once
      const cur = sim.lastPlat;
      const launch = cur && cur.type === "spring" ? PHYS.SPRING : PHYS.BOUNCE;
      const T = fallTime(0, launch, next.y - (cur ? cur.y : 0)) ?? 0.8;
      const gone = next.type === "vanish" && ![-0.15, 0, 0.15].every((d) => platSolid(next, sim.t + T + d));
      const canWait = cur && !cur.broken && cur.type !== "breaking" && platSolid(cur, sim.t + 0.9);
      const r = runBounce(sim, gone && canWait ? { plat: cur } : { plat: next });
      bounces++;
      if (r.kind === "dead") {
        fail = `died going ${path}→${path + 1} (${sim.deathCause}) at y=${Math.round(sim.ball.y)}`;
        break;
      }
      const lp = sim.lastPlat;
      if (lp && lp.path !== undefined && lp.path > path) path = lp.path;
      feed();
      maxPlatforms = Math.max(maxPlatforms, sim.platforms.length);
      generated = gen.n;
    }
    if (!fail && path < TARGET) fail = `stalled at path ${path} after ${bounces} bounces`;
    console.log(`       seed ${seed}: climbed ${path} path platforms (${generated} generated), height ${Math.round(sim.anchor / 10)} m, live platforms max ${maxPlatforms}`);
    ok(!fail && path >= TARGET, `seed ${seed}: bot (85% control) climbs ${TARGET} generated platforms ${fail ? "— " + fail : ""}`);
    ok(geomBad === 0, `seed ${seed}: every transition inside physics reach limits (${geomBad} violations)`);
    ok(maxPlatforms < 60, `seed ${seed}: offscreen platforms are pruned (never more than ${maxPlatforms} alive)`);
  }
}

/* ------------------------------------------------------------------ 7 */
console.log("\n[7] Holding a direction from frame one never drops the ball off a start pad");
{
  const { LEVELS } = await import("../data/levels.js");
  let bad = 0;
  for (const L of LEVELS)
    for (const dir of [-1, 1]) {
      const sim = new Sim(L);
      sim.setInput(dir);
      let landed = false;
      for (let i = 0; i < 200 && !landed && sim.status === "play"; i++) {
        sim.step();
        landed = sim.events.some((e) => e.type === "land");
        sim.events.length = 0;
      }
      if (!landed) bad++;
    }
  ok(bad === 0, `all ${LEVELS.length * 2} level-start cases land on the start pad first (${bad} failures)`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
