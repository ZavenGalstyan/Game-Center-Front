/**
 * Rooftop Dash — headless movement test suite (runs the REAL engine in Node).
 *
 *   node src/components/games/RooftopDash/tools/simTest.mjs [movement|torture|levels|all]
 *
 * movement: the "first movement test" list — jump heights, variable jump,
 *           coyote, buffer, landing, sprint, dash (+ refresh), slide, ceiling
 *           crouch, vaults (valid / invalid), wall runs L/R, wall jump,
 *           infinite-climb guard, ledge grab/climb, fall/respawn, delta
 *           spike, tunnelling, frame-rate independence, moving platforms.
 * torture:  thousands of random mixed inputs over a test course; asserts no
 *           NaN, never embedded in geometry, state machine sane.
 * levels:   every level is completed by the route bot (see levelBot.mjs).
 */
import { createWorld, stepWorld, drainEvents } from "../engine/world.js";
import { MOVE, STATES as S } from "../engine/config.js";
import { cylinderBlocked } from "../engine/collision.js";

const which = process.argv[2] || "all";
let pass = 0;
let fail = 0;
const fails = [];
function check(name, ok, detail = "") {
  if (ok) pass++;
  else {
    fail++;
    fails.push(`${name} ${detail}`);
  }
  if (process.env.VERBOSE || !ok) console.log(`${ok ? "  ok " : "  FAIL"} ${name} ${detail}`);
}
const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);

/* ------------------------------------------------------------ helpers */
const box = (x0, y0, z0, x1, y1, z1, extra = {}) => ({ min: [x0, y0, z0], max: [x1, y1, z1], ...extra });
function level(boxes, more = {}) {
  return { id: "test", name: "Test", boxes, spawn: { x: 0, y: 0, z: 0, yaw: 0 }, killY: -12, streetY: -40, stars: [], checkpoints: [], finish: null, ...more };
}
/** big flat roof from z=-10..z1 */
const roof = (z0 = -10, z1 = 40, w = 8, y = 0, extra = {}) => box(-w, y - 20, z0, w, y, z1, extra);

function mk(lv, opts) {
  const W = createWorld(lv, opts);
  W.camYaw = 0;
  return W;
}
/** run `frames` at `fps`; fn(frameIndex, W) returns raw input */
function run(W, frames, fn, fps = 60, onFrame) {
  const all = [];
  for (let i = 0; i < frames; i++) {
    const raw = fn ? fn(i, W) || {} : {};
    W.camYaw = raw.yaw ?? W.camYaw;
    stepWorld(W, { ax: 0, ay: 0, ...raw, edges: raw.edges || {} }, 1 / fps);
    const ev = drainEvents(W);
    for (const e of ev) all.push({ ...e, frame: i });
    if (onFrame) onFrame(i, W, ev);
  }
  return all;
}
const has = (evs, t) => evs.some((e) => e.type === t);
/** most wall runs in a single airtime (between landings / respawns) */
const maxPerLife = (evs) => {
  let n = 0;
  let best = 0;
  for (const e of evs) {
    if (e.type === "land" || e.type === "respawn") n = 0;
    else if (e.type === "wallrun") best = Math.max(best, ++n);
  }
  return best;
};
const count = (evs, t) => evs.filter((e) => e.type === t).length;

/* ======================================================================== movement */
function movement() {
  console.log("movement");
  // 1-2 spawn + stand still
  {
    const W = mk(level([roof()]));
    run(W, 120);
    const P = W.player;
    check("spawn stands still", P.state === S.GROUND && Math.abs(P.y) < 1e-6 && Math.hypot(P.x, P.z) < 1e-6);
  }
  // 3-6 walk / run / back / strafe
  {
    const W = mk(level([roof(-40, 40, 40)]));
    run(W, 60, () => ({ ay: 1 }));
    const P = W.player;
    check("run reaches RUN_SPEED", Math.abs(P.speedH - MOVE.RUN_SPEED) < 0.05, f2(P.speedH));
    check("run goes +Z at camera yaw 0", P.z > 4 && Math.abs(P.x) < 0.01, `z=${f2(P.z)}`);
    let t0 = 0;
    const W2 = mk(level([roof(-40, 40, 40)]));
    run(W2, 60, (i, w) => {
      if (w.player.speedH > MOVE.RUN_SPEED - 0.05 && !t0) t0 = i;
      return { ay: 1 };
    });
    check("run accel snappy (<0.25 s to full)", t0 > 0 && t0 / 60 < 0.25, `${f2(t0 / 60)}s`);
    // stop
    let stopF = 0;
    run(W2, 60, (i, w) => {
      if (!stopF && w.player.speedH < 0.05) stopF = i + 1;
      return {};
    });
    check("stops quickly (<0.25 s)", stopF > 0 && stopF / 60 < 0.25, `${f2(stopF / 60)}s`);
    const W3 = mk(level([roof(-40, 40, 40)]));
    run(W3, 30, () => ({ ay: 0.3 }));
    check("light input = walk speed", Math.abs(W3.player.speedH - MOVE.WALK_SPEED) < 0.4, f2(W3.player.speedH));
    const W4 = mk(level([roof(-40, 40, 40)]));
    run(W4, 30, () => ({ ay: -1 }));
    check("walk backward goes -Z", W4.player.z < -1.5);
    const W5 = mk(level([roof(-40, 40, 40)]));
    run(W5, 30, () => ({ ax: 1 }));
    check("strafe right goes camera-right (-X at yaw 0)", W5.player.x < -1.5 && Math.abs(W5.player.z) < 0.05);
    const W6 = mk(level([roof(-40, 40, 40)]));
    run(W6, 30, () => ({ ay: 1, yaw: Math.PI / 2 }));
    check("camera-relative: yaw 90° forward → +X", W6.player.x > 1.5 && Math.abs(W6.player.z) < 0.05);
    const W7 = mk(level([roof(-40, 40, 40)]));
    run(W7, 30, () => ({ ay: 1, ax: 1 }));
    check("diagonal not faster than run", W7.player.speedH <= MOVE.RUN_SPEED + 0.01);
    // facing rotates smoothly toward travel (not instant)
    const W8 = mk(level([roof(-40, 40, 40)]));
    let yaw1 = null;
    run(W8, 2, () => ({ ax: -1 }), 60, (i, w) => {
      if (i === 0) yaw1 = w.player.yaw;
    });
    check("facing turns smoothly (not a snap)", Math.abs(yaw1) > 0.05 && Math.abs(yaw1) < Math.PI / 2 - 0.05, f2(yaw1));
  }
  // 9-13 jumps
  {
    const W = mk(level([roof(-40, 40, 40)]));
    let peak = 0;
    let land = null;
    const ev = run(W, 90, (i) => ({ jumpHeld: i < 40, edges: { jump: i === 0 } }), 60, (i, w, e) => {
      peak = Math.max(peak, w.player.y);
      if (!land && e.some((x) => x.type === "land")) land = i;
    });
    check("standing full jump ≈1.45 m", Math.abs(peak - 1.47) < 0.08, f2(peak));
    check("jump lands back (no bounce)", land != null && W.player.state === S.GROUND && Math.abs(W.player.y) < 1e-6, `land f${land}`);
    check("exactly one jump + one land", count(ev, "jump") === 1 && count(ev, "land") === 1);
    const airtime = land / 60;
    check("airtime ≈0.6 s (not floaty)", airtime > 0.5 && airtime < 0.7, f2(airtime));

    const Wt = mk(level([roof(-40, 40, 40)]));
    let peakT = 0;
    run(Wt, 90, (i) => ({ jumpHeld: i < 4, edges: { jump: i === 0 } }), 60, (i, w) => (peakT = Math.max(peakT, w.player.y)));
    check("tap jump lower than held (variable jump)", peakT < peak - 0.25 && peakT > 0.8, `${f2(peakT)} vs ${f2(peak)}`);

    // jump while running / sprinting — horizontal distance
    const dist = (sprint) => {
      const w = mk(level([roof(-40, 80, 40)]));
      run(w, 90, () => ({ ay: 1, sprint }));
      const z0 = w.player.z;
      let z1 = null;
      run(w, 120, (i) => ({ ay: 1, sprint, jumpHeld: true, edges: { jump: i === 0 } }), 60, (i, ww, e) => {
        if (z1 == null && e.some((x) => x.type === "land")) z1 = ww.player.z;
      });
      return z1 - z0;
    };
    const dr = dist(false);
    const ds = dist(true);
    check("running jump ≈4.3 m", dr > 3.9 && dr < 4.8, f2(dr));
    check("sprint jump ≈6.1 m", ds > 5.6 && ds < 6.7, f2(ds));
    check("no double jump", (() => {
      const w = mk(level([roof(-40, 40, 40)]));
      const e = run(w, 60, (i) => ({ jumpHeld: true, edges: { jump: i === 0 || i === 12 || i === 20 } }));
      return count(e, "jump") === 1;
    })());
    check("held jump key does not auto-repeat", (() => {
      const w = mk(level([roof(-40, 40, 40)]));
      const e = run(w, 200, (i) => ({ jumpHeld: true, edges: { jump: i === 0 } }));
      return count(e, "jump") === 1;
    })());
  }
  // 14-16 edge, coyote, buffer
  {
    const lv = () => level([box(-4, -20, -10, 4, 0, 2), box(-4, -20, 7, 4, 0, 30)]);
    // walk off edge — falls, not instant respawn
    const W = mk(lv());
    let leftF = null;
    run(W, 40, () => ({ ay: 1 }), 60, (i, w) => {
      if (leftF == null && w.player.state === S.AIR) leftF = i;
    });
    check("walking off an edge falls", leftF != null && W.player.y < -0.5);
    // coyote: jump 5 frames (83 ms) after leaving the edge
    const coy = (delayFrames) => {
      const w = mk(lv());
      let lf = null;
      const e = run(w, 120, (i, ww) => {
        if (lf == null && ww.player.state === S.AIR) lf = i;
        const press = lf != null && i === lf + delayFrames;
        return { ay: 1, jumpHeld: true, edges: { jump: press } };
      });
      return { jumped: count(e, "jump") === 1, coy: has(e, "coyote"), landedFar: w.player.z > 7 && w.player.y > -0.1 };
    };
    const c1 = coy(5);
    check("coyote jump 80 ms after edge works", c1.jumped && c1.coy && c1.landedFar, JSON.stringify(c1));
    const c2 = coy(14);
    check("no coyote after 230 ms", !c2.jumped, JSON.stringify(c2));
    // jump buffer: press 0.1 s before landing
    const w = mk(level([roof(-40, 40, 40)]));
    let landF = null;
    let pressF = null;
    // first jump, then press again ~6 frames before the predicted landing (airtime 36 frames)
    const e = run(w, 120, (i, ww) => {
      const p = ww.player;
      let press = i === 0;
      if (pressF == null && i > 10 && p.vy < 0 && p.y < 0.55) {
        pressF = i;
        press = true;
      }
      return { jumpHeld: true, edges: { jump: press } };
    }, 60, (i, ww, ev) => {
      if (landF == null && ev.some((x) => x.type === "land")) landF = i;
    });
    check("jump buffer: early press jumps on touchdown", count(e, "jump") === 2 && landF != null && landF - pressF <= 10, `jumps=${count(e, "jump")} press f${pressF} land f${landF}`);
    // stale buffer: press long before landing does nothing
    const w2 = mk(level([roof(-40, 40, 40)]));
    const e2 = run(w2, 120, (i, ww) => ({ jumpHeld: false, edges: { jump: i === 0 || i === 14 } }));
    check("stale jump press (≫buffer) ignored", count(e2, "jump") === 1);
  }
  // 17-18 landings
  {
    const W = mk(level([roof(-10, 2, 8, 0), box(-8, -20, 2, 8, -6, 40)], { killY: -30 }));
    W.player.y = 0;
    const e = run(W, 120, () => ({ ay: 1 }));
    const lands = e.filter((x) => x.type === "land");
    check("high drop = hard landing", lands.length >= 1 && lands[0].hard, JSON.stringify(lands[0] || {}));
    const W2 = mk(level([roof(-40, 40, 40)]));
    const e2 = run(W2, 60, (i) => ({ jumpHeld: true, edges: { jump: i === 0 } }));
    const l2 = e2.find((x) => x.type === "land");
    check("normal jump = soft landing", l2 && !l2.hard);
    // hard landing recovery short
    let back = null;
    run(W, 60, (i, w) => {
      if (back == null && w.player.speedH > MOVE.RUN_SPEED - 0.1) back = i;
      return { ay: 1 };
    });
    check("hard landing recovery is short", back != null && back < 30, `f${back}`);
  }
  // 19-20 sprint
  {
    const W = mk(level([roof(-40, 80, 40)]));
    run(W, 90, () => ({ ay: 1, sprint: true }));
    check("sprint reaches SPRINT_SPEED", Math.abs(W.player.speedH - MOVE.SPRINT_SPEED) < 0.05, f2(W.player.speedH));
    check("sprinting flag on", W.player.sprinting);
    run(W, 60, () => ({ ay: 1, sprint: false }));
    check("release sprint → back to run", Math.abs(W.player.speedH - MOVE.RUN_SPEED) < 0.05 && !W.player.sprinting, f2(W.player.speedH));
  }
  // 21-24 dash
  {
    const W = mk(level([roof(-40, 80, 40)]));
    const z0 = W.player.z;
    const e = run(W, 30, (i) => ({ ay: 1, edges: { dash: i === 0 } }));
    check("grounded dash fires", count(e, "dash") === 1);
    check("dash travels ~3.5 m+ in 0.5 s", W.player.z - z0 > 5, f2(W.player.z - z0));
    const e2 = run(W, 4, (i) => ({ ay: 1, edges: { dash: i === 0 } }));
    check("ground dash has a cooldown", count(e2, "dash") === 0 || W.player.dashCooldown > 0);
    // air dash + second air dash rejected + refresh on land
    const A = mk(level([roof(-40, 80, 40)]));
    const ea = run(A, 120, (i) => ({ ay: 1, jumpHeld: true, edges: { jump: i === 0, dash: i === 10 || i === 25 } }));
    check("one air dash per airtime", count(ea, "dash") === 1, `dashes=${count(ea, "dash")}`);
    check("air dash refresh on landing", A.player.airDash === true && A.player.state === S.GROUND);
    const eb = run(A, 60, (i) => ({ ay: 1, jumpHeld: true, edges: { jump: i === 0, dash: i === 10 } }));
    check("air dash available again after landing", count(eb, "dash") === 1);
    // every dash is a full burst, not just the first one
    const bursts = [];
    const B2 = mk(level([roof(-40, 200, 40)]));
    for (let k = 0; k < 3; k++) {
      run(B2, 60, () => ({ ay: 1 }));
      const z0 = B2.player.z;
      let peak = 0;
      run(B2, 14, (i) => ({ ay: 1, edges: { dash: i === 0 } }), 60, (i, w) => (peak = Math.max(peak, w.player.speedH)));
      bursts.push([B2.player.z - z0, peak]);
    }
    check("repeated dashes are all full bursts", bursts.every(([d, pk]) => d > 3.2 && pk > 17), JSON.stringify(bursts.map(([d, p]) => [f2(d), f2(p)])));
    // dash extends a jump: sprint jump + dash clears ≥ 8 m
    const D = mk(level([roof(-40, 120, 40)]));
    run(D, 90, () => ({ ay: 1, sprint: true }));
    const zs = D.player.z;
    let zl = null;
    run(D, 120, (i) => ({ ay: 1, sprint: true, jumpHeld: true, edges: { jump: i === 0, dash: i === 14 } }), 60, (i, w, e3) => {
      if (zl == null && e3.some((x) => x.type === "land")) zl = w.player.z;
    });
    check("sprint jump + air dash ≈8–10 m", zl - zs > 8 && zl - zs < 11, f2(zl - zs));
    // dash never infinite: holding dash key every frame in air
    const N = mk(level([roof(-40, 120, 40)]));
    const en = run(N, 80, (i) => ({ ay: 1, jumpHeld: true, edges: { jump: i === 0, dash: i > 2 } }));
    check("spamming dash in the air = 1 dash", en.filter((x) => x.type === "dash" && x.air).length === 1);
  }
  // 25-27 slide + low ceiling
  {
    // overhead pipe across the lane at y 1.15..1.5
    const pipe = box(-6, 1.15, 10, 6, 1.5, 10.5);
    const W = mk(level([roof(-10, 60, 8), pipe]));
    let blockedZ = 0;
    run(W, 120, () => ({ ay: 1 }), 60, (i, w) => (blockedZ = w.player.z));
    check("standing runner is blocked by low pipe", blockedZ < 10 && blockedZ > 9, f2(blockedZ));
    const W2 = mk(level([roof(-10, 60, 8), pipe]));
    let slid = false;
    const e = run(W2, 120, (i, w) => {
      const near = w.player.z > 6.5 && !slid;
      if (near) slid = true;
      return { ay: 1, slideHeld: w.player.z > 6.5 && w.player.z < 11.5, edges: { slide: near } };
    });
    check("slide passes under pipe", W2.player.z > 12 && count(e, "slide") === 1, f2(W2.player.z));
    check("stands up after the pipe", W2.player.height === MOVE.HEIGHT && W2.player.state === S.GROUND);
    // long low tunnel: slide ends inside → crouch, never standing into the ceiling
    const tunnel = box(-6, 1.15, 10, 6, 1.6, 16);
    const W3 = mk(level([roof(-10, 60, 8), tunnel]));
    let embedded = false;
    let crouched = false;
    run(W3, 300, (i, w) => {
      const P = w.player;
      if (P.state === S.CROUCH) crouched = true;
      if (cylinderBlocked(w.C, P.x, P.y, P.z, MOVE.RADIUS, P.height, null, 0.02)) embedded = true;
      const go = !w._slid;
      if (P.state === S.SLIDE) w._slid = true;
      return { ay: go ? 1 : 0, slideHeld: false, edges: { slide: go && P.z > 7 } };
    });
    check("slide stopping under ceiling → crouch", crouched, W3.player.state);
    check("never stands up inside ceiling", !embedded);
    run(W3, 300, () => ({ ay: 1 }));
    check("crouch-walks out and stands", W3.player.z > 16 && W3.player.height === MOVE.HEIGHT, `${f2(W3.player.z)} ${W3.player.state}`);
    check("slide requires speed", (() => {
      const w = mk(level([roof()]));
      const ev = run(w, 10, (i) => ({ edges: { slide: i === 2 } }));
      return count(ev, "slide") === 0;
    })());
  }
  // 28-30 vaults
  {
    const vaultRun = (h, depth = 0.6, extraBoxes = [], speed = 1, sprint = false) => {
      const ob = box(-1.5, 0, 8, 1.5, h, 8 + depth);
      const W = mk(level([roof(-10, 60, 8), ob, ...extraBoxes]));
      let embedded = false;
      const e = run(W, 150, (i, w) => {
        const P = w.player;
        if (P.state !== S.VAULT && cylinderBlocked(w.C, P.x, P.y, P.z, MOVE.RADIUS, P.height, null, 0.03)) embedded = true;
        return { ay: speed, sprint };
      });
      return { W, e, embedded };
    };
    const lo = vaultRun(0.8);
    const vl = lo.e.find((x) => x.type === "vault");
    check("low vault triggers", vl && vl.low, JSON.stringify(vl || {}));
    check("low vault lands beyond, keeps momentum", lo.W.player.z > 15 && lo.W.player.speedH > 6, `${f2(lo.W.player.z)} ${f2(lo.W.player.speedH)}`);
    check("no embedding during low vault", !lo.embedded);
    const hi = vaultRun(1.2);
    const vh = hi.e.find((x) => x.type === "vault");
    check("high vault triggers", vh && !vh.low);
    check("high vault lands beyond", hi.W.player.z > 15);
    const tall = vaultRun(2.6);
    check("tall wall: no vault", !has(tall.e, "vault") && tall.W.player.z < 8);
    const deep = vaultRun(0.8, 3.0);
    check("deep box: no vault (it's a step-up/climb, not a vault)", !has(deep.e, "vault"));
    // blocked landing: wall right behind obstacle
    const blocked = vaultRun(0.8, 0.6, [box(-3, 0, 8.6, 3, 3, 9.2)]);
    check("vault into blocked space refused", !has(blocked.e, "vault"));
    // overhead pipe right over obstacle
    const capped = vaultRun(0.8, 0.6, [box(-3, 1.5, 7.5, 3, 2, 9.5)]);
    check("vault under a low ceiling refused", !has(capped.e, "vault"));
    const slow = vaultRun(0.8, 0.6, [], 0.2);
    check("walking slowly into box: no vault", !has(slow.e, "vault"));
    // vault over parapet into a gap refused
    const gapW = mk(level([box(-8, -20, -10, 8, 0, 8.6), box(-1.5, 0, 8, 1.5, 0.8, 8.6)]));
    const ge = run(gapW, 100, () => ({ ay: 1 }));
    check("vault with no landing below refused", !has(ge, "vault"));
  }
  // 31-35 wall run
  {
    // gap z 4..16 between roofs; runnable wall on the runner's left (+X side) along the gap
    const wallBoxes = (side) => {
      const wx = side === "left" ? [1.6, 2.6] : [-2.6, -1.6];
      return [box(-6, -20, -10, 6, 0, 4), box(-6, -20, 16, 6, 0, 40), box(wx[0], -20, 2, wx[1], 6, 18, { wr: true })];
    };
    for (const side of ["left", "right"]) {
      const W = mk(level(wallBoxes(side)));
      const sx = side === "left" ? -0.35 : 0.35;
      let maxRun = 0;
      let t = 0;
      const e = run(W, 200, (i, w) => {
        const P = w.player;
        if (P.state === S.WALLRUN) t += 1 / 60;
        else t = 0;
        maxRun = Math.max(maxRun, t);
        // run up the middle, jump near the gap, steer toward the wall
        return { ay: 1, ax: P.z > 2.5 && P.z < 16 ? sx : 0, sprint: true, jumpHeld: true, edges: { jump: P.z > 3.3 && P.z < 3.5 } };
      });
      const wr = e.find((x) => x.type === "wallrun");
      // in this engine "right" of +Z travel is -X
      check(`wall run ${side} triggers`, wr && wr.side === side, JSON.stringify(wr || {}));
      check(`wall run ${side} crosses 12 m gap`, W.player.z > 16 && W.player.y > -0.1 && W.player.state === S.GROUND, `${f2(W.player.z)} y${f2(W.player.y)}`);
      check(`wall run ${side} limited (≤ ${MOVE.WALLRUN_TIME}s)`, maxRun <= MOVE.WALLRUN_TIME + 0.02, f2(maxRun));
    }
    // wall run ends when the wall ends
    {
      const W = mk(level([box(-6, -20, -10, 6, 0, 4), box(-6, -20, 22, 6, 0, 40), box(1.6, -20, 2, 2.6, 6, 9, { wr: true })], { killY: -10 }));
      const e = run(W, 200, (i, w) => ({ ay: 1, ax: w.player.z > 2.5 ? -0.35 : 0, sprint: true, jumpHeld: true, edges: { jump: w.player.z > 3.3 && w.player.z < 3.5 } }));
      const end = e.find((x) => x.type === "wallrunEnd");
      check("wall run ends at the end of the wall", end && end.reason === "end", JSON.stringify(end || {}));
    }
    // no wall run on the floor / beside a wall while grounded
    {
      const W = mk(level([roof(-10, 60, 8), box(1.0, 0, 0, 2, 4, 30, { wr: true })]));
      const e = run(W, 120, () => ({ ay: 1, ax: -0.4, sprint: true }));
      check("no wall run while grounded beside a wall", !has(e, "wallrun"));
      const e2 = run(W, 60, (i) => ({ ay: 1, ax: -0.4, sprint: true, jumpHeld: false, edges: { jump: i === 0 } }));
      check("small hop beside a wall (ground close) doesn't wall-run", !has(e2, "wallrun"));
    }
    // non-flagged wall / tiny prop: no wall run
    {
      const W = mk(level([box(-6, -20, -10, 6, 0, 4), box(-6, -20, 16, 6, 0, 40), box(1.6, -20, 2, 2.6, 6, 18)]));
      const e = run(W, 200, (i, w) => ({ ay: 1, ax: w.player.z > 2.5 ? -0.35 : 0, sprint: true, jumpHeld: true, edges: { jump: w.player.z > 3.3 && w.player.z < 3.5 } }));
      check("unmarked wall: no wall run", !has(e, "wallrun"));
      const W2 = mk(level([box(-6, -20, -10, 6, 0, 4), box(-6, -20, 16, 6, 0, 40), box(1.6, 0, 5, 2.6, 0.9, 6.0, { wr: true })]));
      const e2 = run(W2, 200, (i, w) => ({ ay: 1, ax: w.player.z > 2.5 ? -0.35 : 0, sprint: true, jumpHeld: true, edges: { jump: w.player.z > 3.3 && w.player.z < 3.5 } }));
      check("tiny wr-prop: no wall run", !has(e2, "wallrun"));
    }
    // wall jump + infinite climb guard (single tall wall, spam jump)
    {
      const W = mk(level([box(-6, -20, -10, 6, 0, 4), box(1.6, -20, 2, 2.6, 30, 60, { wr: true })], { killY: -14 }));
      let maxY = 0;
      const e = run(W, 400, (i, w) => {
        maxY = Math.max(maxY, w.player.y);
        return { ay: 1, ax: -0.5, sprint: true, jumpHeld: true, edges: { jump: (w.player.z > 3.3 && w.player.z < 3.5) || (i % 7 === 0 && w.player.z > 4) } };
      });
      check("wall jump happens", has(e, "walljump"));
      check("same wall can't be re-run after wall jump (no infinite climb)", maxPerLife(e) <= 1 && maxY < 3.5, `runs/life=${maxPerLife(e)} maxY=${f2(maxY)}`);
    }
    // corridor between two walls: chain limited
    {
      const W = mk(level([box(-6, -20, -10, 6, 0, 4), box(1.6, -20, 2, 2.6, 30, 80, { wr: true }), box(-2.6, -20, 2, -1.6, 30, 80, { wr: true })], { killY: -14 }));
      let maxY = 0;
      let side = 1;
      const e = run(W, 600, (i, w) => {
        const P = w.player;
        maxY = Math.max(maxY, P.y);
        // after touching one wall, steer toward the opposite one
        if (P.state === S.WALLRUN && P.stateT > 0.25) side = P.wall.side === "left" ? -1 : 1;
        return { ay: 1, ax: -0.6 * side, sprint: true, jumpHeld: true, edges: { jump: (P.z > 3.3 && P.z < 3.5) || (P.state === S.WALLRUN && P.stateT > 0.25) } };
      });
      check("two-wall corridor: wall runs capped per airtime", maxPerLife(e) <= MOVE.WALLRUN_MAX_PER_AIR && maxPerLife(e) >= 2, `runs/life=${maxPerLife(e)} maxY=${f2(maxY)}`);
      check("two-wall corridor: no runaway height", maxY < 6, f2(maxY));
    }
    // wall-run -> wall-jump -> dash -> land on far roof
    {
      const W = mk(level([box(-6, -20, -10, 6, 0, 4), box(-24, -20, 17, -2, 0, 50), box(1.6, -20, 2, 2.6, 6, 12, { wr: true })], { killY: -12 }));
      const e = run(W, 240, (i, w) => {
        const P = w.player;
        const wj = P.state === S.WALLRUN && P.stateT > 0.45;
        const dash = P.prevState === S.WALLRUN && P.state === S.AIR && P.stateT > 0.18 && P.stateT < 0.2;
        return { ay: 1, ax: P.z < 10 ? (P.z > 2.5 ? -0.35 : 0) : 0.7, sprint: true, jumpHeld: true, edges: { jump: (P.z > 3.3 && P.z < 3.5) || wj, dash } };
      });
      check("wallrun → walljump → dash → land", has(e, "walljump") && has(e, "dash") && W.player.state === S.GROUND && W.player.z > 17, `${f2(W.player.x)},${f2(W.player.z)} ${W.player.state}`);
    }
  }
  // 36-37 ledge grab / climb
  {
    // gap then a higher roof (top 1.0 above): a short jump that would miss the lip → ledge grab
    const W = mk(level([box(-6, -20, -10, 6, 0, 3), box(-6, -20, 6.5, 6, 1.6, 30)]));
    const e = run(W, 200, (i, w) => ({ ay: 1, jumpHeld: i < 4, edges: { jump: w.player.z > 2.4 && w.player.z < 2.6 } }));
    check("ledge grab on near-miss", has(e, "ledge"), e.filter((x) => ["jump", "land", "ledge"].includes(x.type)).map((x) => x.type).join(","));
    check("ledge climb ends on top", has(e, "climb") && Math.abs(W.player.y - 1.6) < 1e-3 && W.player.state === S.GROUND, `y=${f2(W.player.y)} ${W.player.state}`);
    // wall too tall: no ledge
    const W2 = mk(level([box(-6, -20, -10, 6, 0, 3), box(-6, -20, 4.5, 6, 4.3, 30)]));
    const e2 = run(W2, 120, (i, w) => ({ ay: 1, jumpHeld: true, edges: { jump: w.player.z > 2.4 && w.player.z < 2.6 } }));
    check("too-high wall: no ledge grab", !has(e2, "ledge"));
    // overhang above the lip: no grab
    const W3 = mk(level([box(-6, -20, -10, 6, 0, 3), box(-6, -20, 6.5, 6, 1.6, 30), box(-6, 2.0, 5.5, 6, 4, 30)]));
    const e3 = run(W3, 120, (i, w) => ({ ay: 1, jumpHeld: i < 4, edges: { jump: w.player.z > 2.4 && w.player.z < 2.6 } }));
    check("ledge with blocked top: no grab", !has(e3, "ledge"));
    // ledge-grab from underneath a slab (underside) impossible
    // standing UNDER a slab and jumping into it: bonk, never snap up through it
    const W4 = mk(level([roof(-10, 30, 8), box(-6, 2.2, 4, 6, 2.6, 30)]));
    W4.player.z = 8;
    let maxY4 = 0;
    const e4 = run(W4, 120, (i, w) => {
      maxY4 = Math.max(maxY4, w.player.y);
      return { ay: i % 40 < 20 ? 1 : -1, jumpHeld: true, edges: { jump: i % 30 === 0 } };
    });
    check("no ledge grab on underside geometry", !has(e4, "ledge") && maxY4 < 2.2 - 1.78 + 0.01, f2(maxY4));
  }
  // 38-41 fall / respawn
  {
    const W = mk(level([box(-6, -20, -10, 6, 0, 3)], { killY: -8, checkpoints: [] }));
    let fallF = null;
    let respF = null;
    const e = run(W, 240, (i, w) => ({ ay: i < 60 ? 1 : 0 }), 60, (i, w, ev) => {
      if (fallF == null && ev.some((x) => x.type === "fall")) fallF = i;
      if (respF == null && ev.some((x) => x.type === "respawn")) respF = i;
    });
    check("falls off route → fall event", fallF != null);
    check("doesn't respawn the moment feet leave the roof", fallF != null && fallF > 30);
    check("respawn after short fade", respF != null && respF - fallF < 40, `fade ${respF - fallF}f`);
    const P = W.player;
    check("respawn resets velocity + state", P.vx === 0 && P.vz === 0 && P.vy === 0 && P.state === S.GROUND && Math.abs(P.y) < 1e-6, `${P.state} ${f2(P.vx)} ${f2(P.vy)}`);
    check("respawn adds time penalty", W.time >= MOVE.RESPAWN_PENALTY);
    check("falls counted once", W.falls === 1 && count(e, "fall") === 1);
  }
  // 42-44 delta spikes / frame-rate independence / tunnelling
  {
    const W = mk(level([roof(-40, 80, 40)]));
    run(W, 30, () => ({ ay: 1, sprint: true }));
    const z0 = W.player.z;
    stepWorld(W, { ay: 1, sprint: true, edges: {} }, 2.0);
    check("2 s frame clamped (moves ≤ 0.6 m)", W.player.z - z0 < 0.6, f2(W.player.z - z0));
    // tunnelling: dash into a 5 cm wall
    const T = mk(level([roof(-10, 60, 8), box(-6, 0, 6, 6, 4, 6.05)]));
    run(T, 120, (i) => ({ ay: 1, sprint: true, edges: { dash: i === 20 || i === 60 } }));
    check("dash can't tunnel a 5 cm wall", T.player.z < 6, f2(T.player.z));
    const T2 = mk(level([roof(-10, 60, 8), box(-6, 0, 6, 6, 4, 6.05)]));
    for (let i = 0; i < 60; i++) stepWorld(T2, { ay: 1, sprint: true, edges: { dash: i === 10 } }, 0.05);
    check("dash at 20 fps can't tunnel either", T2.player.z < 6);
    // falling fast onto a thin slab
    const F = mk(level([box(-6, -0.05, -6, 6, 0, 6)], { killY: -80 }));
    F.player.y = 30;
    F.player.state = S.AIR;
    F.player.grounded = false;
    run(F, 240, () => ({}), 30);
    check("terminal-velocity fall lands on a 5 cm slab", Math.abs(F.player.y) < 1e-6 && F.player.state === S.GROUND, f2(F.player.y));
    // frame-rate independence of jump distance
    const jd = (fps) => {
      const w = mk(level([roof(-40, 80, 40)]));
      run(w, fps * 1.5, () => ({ ay: 1, sprint: true }), fps);
      const zz = w.player.z;
      let zl = null;
      run(w, fps * 2, (i) => ({ ay: 1, sprint: true, jumpHeld: true, edges: { jump: i === 0 } }), fps, (i, ww, ev) => {
        if (zl == null && ev.some((x) => x.type === "land")) zl = ww.player.z;
      });
      return zl - zz;
    };
    const a = jd(30);
    const b = jd(60);
    const c = jd(144);
    check("jump distance frame-rate independent (30/60/144)", Math.abs(a - b) < 0.2 && Math.abs(c - b) < 0.2, `${f2(a)} ${f2(b)} ${f2(c)}`);
  }
  // moving platforms
  {
    const lv = level([box(-4, -20, -10, 4, 0, 2), box(-4, -20, 20, 4, 0, 40)], {
      movers: [{ box: { min: [-1.5, -0.4, 4], max: [1.5, 0, 7] }, path: { type: "line", d: [0, 0, 8], period: 6 } }],
    });
    const W = mk(lv);
    // ride: get on at the start, stand still for 8 s
    W.player.x = 0;
    W.player.z = 5.5;
    W.player.y = 0;
    let maxDev = 0;
    let lost = false;
    run(W, 480, () => ({}), 60, (i, w) => {
      const m = w.movers[0];
      const P = w.player;
      const cz = 5.5 + m.off[2];
      maxDev = Math.max(maxDev, Math.abs(P.z - cz), Math.abs(P.y - m.box.max[1]));
      if (P.state !== S.GROUND) lost = true;
    });
    check("rides a moving platform without drifting/sinking", !lost && maxDev < 0.02, `dev=${f2(maxDev)} lost=${lost}`);
    // lift
    const L = mk(level([box(-4, -20, -10, 4, 0, 2), box(-4, -20, 8, 4, 6, 40)], { movers: [{ box: { min: [-1.5, -0.4, 3], max: [1.5, 0, 6] }, path: { type: "lift", d: [0, 6, 0], period: 7 } }] }));
    L.player.z = 4.5;
    let ok = true;
    run(L, 420, () => ({}), 60, (i, w) => {
      if (Math.abs(w.player.y - w.movers[0].box.max[1]) > 0.02) ok = false;
    });
    check("lift carries the runner up and down", ok);
    // swing (crane load) — level slab
    const SW = mk(level([box(-4, -20, -10, 4, 0, 2)], { movers: [{ box: { min: [-1.5, -0.4, 3], max: [1.5, 0, 6] }, path: { type: "swing", axis: "x", amp: 0.5, len: 8, period: 4 } }] }));
    SW.player.z = 4.5;
    let okS = true;
    run(SW, 480, () => ({}), 60, (i, w) => {
      const b = w.movers[0].box;
      const P = w.player;
      if (Math.abs(P.y - b.max[1]) > 0.02 || P.x < b.min[0] - 0.01 || P.x > b.max[0] + 0.01) okS = false;
    });
    check("swinging platform carries the runner", okS);
    // jump from a moving platform keeps its velocity (no yank back)
    const J = mk(lv);
    J.player.x = 0;
    J.player.z = 5.5;
    run(J, 90, () => ({}));
    const m = J.movers[0];
    const vz = m.box.vel[2];
    run(J, 1, () => ({ jumpHeld: true, edges: { jump: true } }));
    check("jump off mover inherits its velocity", Math.abs(J.player.vz - vz) < 0.6, `${f2(J.player.vz)} vs ${f2(vz)}`);
    // mover pushes a bystander instead of passing through
    const PU = mk(level([roof(-10, 40, 8)], { movers: [{ box: { min: [-1, 0, 2], max: [1, 1.5, 3] }, path: { type: "line", d: [0, 0, 6], period: 4 } }] }));
    PU.player.z = 5;
    let inside = false;
    run(PU, 240, () => ({}), 60, (i, w) => {
      const b = w.movers[0].box;
      const P = w.player;
      if (Math.abs(P.x) < 1 + MOVE.RADIUS - 0.08 && P.z > b.min[2] - MOVE.RADIUS + 0.08 && P.z < b.max[2] + MOVE.RADIUS - 0.08 && P.y < 1.4) inside = true;
    });
    check("moving block pushes the runner (no overlap)", !inside);
  }
  // crumble
  {
    const W = mk(level([box(-4, -20, -10, 4, 0, 2), box(-4, -20, 12, 4, 0, 30)], { killY: -8, crumbles: [{ min: [-1.5, -0.4, 3], max: [1.5, 0, 6], delay: 0.5, respawn: 2 }] }));
    W.player.z = 4.5;
    const e = run(W, 200, () => ({}));
    check("crumbling slab drops the runner", has(e, "crumbleFall") && has(e, "fall"));
    run(W, 200, () => ({}));
    check("crumbling slab comes back", W.crumbles[0].state === "solid");
  }
  // finish exactly once + timer
  {
    const lv = level([roof(-10, 60, 8)], { finish: { x: 0, y: 0, z: 10, r: 2 } });
    const W = mk(lv);
    const e = run(W, 400, () => ({ ay: 1 }));
    check("finish fires exactly once", count(e, "finish") === 1);
    check("timer stops at finish", W.time === W.finishTime && W.time > 1 && W.time < 3, f2(W.time));
    check("no control after finish", W.player.speedH < 0.5);
    // fall after finish doesn't count
    const W2 = mk(level([box(-4, -20, -10, 4, 0, 10.5)], { finish: { x: 0, y: 0, z: 10, r: 1.5 }, killY: -6 }));
    const e2 = run(W2, 300, () => ({ ay: 1, sprint: true }));
    check("finish then fall: no fall/respawn", count(e2, "finish") === 1 && !has(e2, "fall") && !has(e2, "respawn"));
    // timer doesn't start before input
    const W3 = mk(lv);
    run(W3, 120, () => ({}));
    check("timer waits for first input", W3.time === 0 && !W3.started);
  }
  // stars + checkpoints once
  {
    const W = mk(level([roof(-10, 60, 8)], { stars: [{ x: 0, y: 1, z: 6 }], checkpoints: [{ x: 0, y: 0, z: 9, r: 1.6 }], killY: -6 }));
    const e = run(W, 200, (i) => ({ ay: i < 100 ? 1 : -1 }));
    check("star collected once", count(e, "star") === 1 && W.starCount === 1);
    check("checkpoint activates once", count(e, "checkpoint") === 1);
  }
}

/* ======================================================================== torture */
const tortureTotals = {};
function torture() {
  for (const seed of [12345, 777, 4242, 990011]) tortureRun(seed);
  check("torture: every move exercised (all seeds)", ["jump", "vault", "slide", "wallrun", "walljump", "dash", "ledge", "land", "stumble"].every((t) => tortureTotals[t] > 0), JSON.stringify(tortureTotals));
}
function tortureRun(seed0) {
  console.log("torture");
  // a busy test course: gaps, vault boxes, pipes, wr walls, ledges, movers, crumbles
  const boxes = [
    box(-6, -20, -10, 6, 0, 10),
    box(-1, 0, 6, 1, 0.8, 6.6),
    box(-6, 1.15, 8, 6, 1.5, 8.5),
    box(-6, -20, 14, 6, 0, 30),
    box(5, -20, 10, 6, 7, 34, { wr: true }),
    box(-6, -20, 10, -5, 7, 34, { wr: true }),
    box(-2, 0, 18, 2, 1.2, 18.8),
    box(-6, -20, 34, 6, 1.6, 50),
    box(-6, 1.2, 40, 6, 2.0, 46),
    box(-3, -20, 54, 3, 0.5, 70),
    box(2.5, 0.5, 58, 3, 3, 64, { wr: true }),
    box(-6, -20, 76, 6, 3, 90),
  ];
  const lv = level(boxes, {
    killY: -10,
    checkpoints: [{ x: 0, y: 0, z: 20 }, { x: 0, y: 1.6, z: 38 }],
    movers: [
      { box: { min: [-1.5, -0.3, 49], max: [1.5, 0.2, 52] }, path: { type: "line", d: [0, 0, 3], period: 4 } },
      { box: { min: [-1.5, -0.3, 70], max: [1.5, 0, 73] }, path: { type: "lift", d: [0, 3, 0], period: 5 } },
    ],
    crumbles: [{ min: [-1.5, -0.4, 30.5], max: [1.5, 0, 33.5] }],
    hazards: [{ type: "steam", pos: [3, 0, 24], r: 0.8, h: 2.5, period: 3 }, { type: "hook", pos: [0, 6, 60], len: 4.5, amp: 0.9, axis: "x", period: 3.2, r: 0.6 }],
  });
  let seed = seed0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const W = mk(lv);
  const counts = {};
  let nan = false;
  let embedded = 0;
  let embedWhere = "";
  let badState = false;
  let actions = 0;
  let ax = 0;
  let ay = 1;
  let sprint = false;
  let hold = 0;
  const N = 60 * 60 * 4; // 4 minutes of random play per seed
  for (let i = 0; i < N; i++) {
    if (--hold <= 0) {
      hold = 5 + Math.floor(rnd() * 50);
      ay = rnd() < 0.8 ? 1 : rnd() * 2 - 1;
      ax = rnd() < 0.5 ? 0 : rnd() * 2 - 1;
      sprint = rnd() < 0.6;
    }
    const edges = { jump: rnd() < 0.06, dash: rnd() < 0.025, slide: rnd() < 0.03 };
    const yaw = W.camYaw + (rnd() < 0.02 ? (rnd() - 0.5) * 0.6 : 0);
    const dt = rnd() < 0.01 ? 0.2 : rnd() < 0.3 ? 1 / 30 : 1 / (60 + rnd() * 90);
    W.camYaw = yaw;
    stepWorld(W, { ax, ay, sprint, jumpHeld: rnd() < 0.7, slideHeld: rnd() < 0.5, edges }, dt);
    for (const e of drainEvents(W)) {
      counts[e.type] = (counts[e.type] || 0) + 1;
      if (["jump", "vault", "slide", "wallrun", "walljump", "dash", "ledge", "land"].includes(e.type)) actions++;
    }
    const P = W.player;
    if (!Number.isFinite(P.x + P.y + P.z + P.vx + P.vy + P.vz + P.yaw)) nan = true;
    if (P.state !== S.VAULT && P.state !== S.LEDGE && P.state !== S.FALLING_OUT && P.state !== S.RESPAWN) {
      // the bottom 0.13 m is the deliberate step / landable-edge tolerance (STEP_UP, AIR_EDGE)
      const b = cylinderBlocked(W.C, P.x, P.y + 0.13, P.z, MOVE.RADIUS, P.height - 0.13, null, 0.06);
      if (b) {
        embedded++;
        if (!embedWhere) embedWhere = `${P.state} @${f2(P.x)},${f2(P.y)},${f2(P.z)} box ${b.min.map(f2)}..${b.max.map(f2)} ${b.dynamic ? "dyn" : ""}`;
      }
    }
    if (P.state === S.SLIDE && P.wall) badState = true;
    if (P.state === S.WALLRUN && (P.grounded || !P.wall)) badState = true;
    if (P.state === S.VAULT && !P.vault) badState = true;
    if (P.state === S.LEDGE && (!P.ledge || P.grounded)) badState = true;
    if (P.state !== S.DASH && P.state !== S.FINISHED && Math.hypot(P.vx, P.vz) > 40) badState = true;
    if (W.finished) break;
  }
  console.log("   events:", JSON.stringify(counts));
  check("torture: ≥100 mixed parkour actions", actions >= 100, `${actions}`);
  check("torture: no NaN transforms", !nan);
  check("torture: never embedded in geometry", embedded === 0, `${embedded} frames; first: ${embedWhere}`);
  check("torture: no conflicting states", !badState);
  for (const [k, v] of Object.entries(counts)) tortureTotals[k] = (tortureTotals[k] || 0) + v;
}

/* ======================================================================== save */
async function saves() {
  console.log("save");
  const st = await import("../utils/storage.js");
  const mem = new Map();
  globalThis.window = globalThis.window || {};
  window.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const d = st.loadProgress();
  check("missing save → defaults", d.version === st.SAVE_VERSION && st.completedCount(d) === 0 && d.settings.graphics === "medium");
  mem.set(st.SAVE_KEY, "{not json");
  check("corrupt JSON → defaults, no throw", st.loadProgress().version === st.SAVE_VERSION);
  mem.set(st.SAVE_KEY, JSON.stringify([1, 2, 3]));
  check("wrong shape → defaults", st.completedCount(st.loadProgress()) === 0);
  mem.set(st.SAVE_KEY, JSON.stringify({ version: 1, completed: { 1: true, 2: "yes", 99: true, abc: true }, best: { 1: NaN, 2: -5, 3: 12.3456, 4: "fast", 5: 1e9 }, stars: { 1: [true, "x", true, true], 2: "bad" }, settings: { graphics: "ultra", fov: 400, master: -3, invertY: "no" }, stats: { jumps: -9, falls: "x", distance: 1e20 }, cosmetics: { outfit: "crimson", trail: "nope" } }));
  const p = st.loadProgress();
  check("hostile values sanitised", p.completed[1] === true && !p.completed[2] && !p.completed[99] && !("abc" in p.completed));
  check("bad best times dropped (NaN / negative / absurd)", p.best[3] === 12.346 && !(1 in p.best) && !(2 in p.best) && !(4 in p.best) && !(5 in p.best), JSON.stringify(p.best));
  check("stars normalised to 3 booleans", JSON.stringify(p.stars[1]) === "[true,false,true]" && !p.stars[2]);
  check("settings clamped / defaulted", p.settings.graphics === "medium" && p.settings.fov === 86 && p.settings.master === 0 && p.settings.invertY === false);
  check("stats clamped", p.stats.jumps === 0 && p.stats.falls === 0 && p.stats.distance === 1e12);
  check("locked cosmetic can't be selected by editing the save", p.cosmetics.outfit === "street" && p.cosmetics.trail === "wind");
  mem.set(st.SAVE_KEY, JSON.stringify({ bestTimes: { 1: 40 }, starsByLevel: { 1: 2 }, completedLevels: [1, 2] }));
  const m = st.loadProgress();
  check("v0 save migrated", m.version === st.SAVE_VERSION && m.best[1] === 40 && m.stars[1][1] === true && m.stars[1][2] === false && m.completed[2] === true);
  mem.set(st.SAVE_KEY, JSON.stringify({ version: 1, completed: { 1: true } }));
  const part = st.loadProgress();
  check("partial save fills defaults", part.completed[1] && part.settings.fov === 72 && part.stats.runs === 0 && st.isUnlocked(part, 2) && !st.isUnlocked(part, 3));
  // runs
  let q = st.defaultProgress();
  let r = st.applyRun(q, { id: 1, time: 30, stars: [true, false, false], falls: 1, targetBeaten: false, flowBest: 4 });
  check("first clear unlocks next level, sets best", r.progress.best[1] === 30 && r.unlocked[0] === 2 && st.isUnlocked(r.progress, 2) && !r.newBest);
  r = st.applyRun(r.progress, { id: 1, time: 35, stars: [false, true, false], falls: 0, targetBeaten: false, flowBest: 2 });
  check("slower run keeps best, merges stars", r.progress.best[1] === 30 && !r.newBest && JSON.stringify(r.progress.stars[1]) === "[true,true,false]");
  r = st.applyRun(r.progress, { id: 1, time: 21, stars: [true, true, true], falls: 0, targetBeaten: true, flowBest: 9 });
  check("faster perfect run: new best, perfect, flow", r.newBest && r.progress.best[1] === 21 && r.progress.perfect[1] && r.progress.stats.perfectLevels === 1 && r.progress.stats.longestFlow === 9);
  r = st.applyRun(r.progress, { id: 1, time: NaN, stars: [false, false, false], falls: 0, targetBeaten: false });
  check("NaN time can't corrupt best", r.progress.best[1] === 21);
  check("save round-trips", JSON.stringify(st.sanitize(JSON.parse(JSON.stringify(r.progress))).best) === JSON.stringify(r.progress.best));
}

/* ======================================================================== main */
if (which === "save" || which === "all") await saves();
if (which === "movement" || which === "all") movement();
if (which === "torture" || which === "all") torture();
if (which === "levels" || which === "all") {
  const { runLevelBots } = await import("./levelBot.mjs");
  const r = await runLevelBots({ verbose: !!process.env.VERBOSE });
  for (const x of r) check(`level ${x.id} ${x.name}`, x.ok, x.detail);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log(fails.join("\n"));
  process.exit(1);
}
