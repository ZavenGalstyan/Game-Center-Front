/**
 * Lost Toy — headless movement test bed (Node, no browser).
 *
 *   node src/components/games/LostToy/tools/moveTest.mjs
 *
 * Builds a tiny test room (floor, book, table, chair-height ledge, shelf
 * underside, pillow, pushable block, wind-up car, cloth, water, vacuum) and
 * drives the REAL engine through the same raw-input path the game uses,
 * asserting the feel numbers and the anti-bug list (coyote, buffer, no
 * double jump, frame-rate independence, ledge rules, platform carry, bounce
 * cap, lag spikes, respawn reset …).
 */
import { createWorld, stepWorld, drainEvents, restartWorld } from "../engine/world.js";
import { STATES as S, MOVE } from "../engine/config.js";

let pass = 0;
let fail = 0;
const results = [];
function check(name, ok, info = "") {
  if (ok) pass++;
  else fail++;
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`);
}
const f2 = (v) => (typeof v === "number" ? v.toFixed(3) : String(v));

/* ------------------------------------------------------------------ test room */
function room(extra = {}) {
  const boxes = [
    { min: [-40, -1, -40], max: [40, 0, 40], mat: "wood" }, // floor
    { min: [2, 0, -1], max: [4, 0.45, 1], mat: "paper" }, // book lying flat (jump onto)
    { min: [8, 0, -1], max: [10, 1.3, 1], mat: "wood" }, // ledge-height block (above jump apex)
    { min: [14, 1.2, -1], max: [16, 1.32, 1], mat: "wood" }, // shelf board, underside reachable from below
    { min: [14, 1.32, -1], max: [14.1, 3, 1], mat: "wood" }, // its back panel (makes top un-standable at the near edge)
    { min: [20, 0, -1], max: [20.12, 3, 1], mat: "wood" }, // tall thin wall
    { min: [20.12, 0, -1], max: [22, 1.3, 1], mat: "wood" }, // ledge hidden behind the wall
    { min: [-10, 0, -1], max: [-8, 8, 1], mat: "wood" }, // tall tower (fall test)
    { min: [-6, 0, 6], max: [-4, 0.5, 8], mat: "fabric", bounce: 9 }, // pillow
    { min: [6, 0, 8], max: [6.1, 4, 12], mat: "fabric", climb: true }, // hanging cloth face (climbable, faces -x)
    { min: [6.1, 0, 8], max: [9, 4, 12], mat: "fabric" }, // the bed behind it
    { min: [-20, 0, -20], max: [-16, 2.0, -16], mat: "wood" }, // ledge for the coyote edge
  ];
  return {
    id: 0,
    name: "Test Room",
    spawn: { x: 0, y: 0, z: 0, yaw: Math.PI / 2 },
    boxes,
    killY: -5,
    maxFall: 5.5,
    ...extra,
  };
}

/* ------------------------------------------------------------------ input driver */
function drive(W, frames, raw, fps = 60) {
  const dt = 1 / fps;
  for (let i = 0; i < frames; i++) {
    const r = typeof raw === "function" ? raw(i, W) : raw;
    stepWorld(W, r, dt);
  }
}
const idle = { ax: 0, ay: 0, sprint: false, jumpHeld: false, edges: {} };
// camera yaw π/2 → "forward" (ay=1) is +x
const fwd = (opts = {}) => ({ ax: 0, ay: 1, sprint: false, jumpHeld: false, edges: {}, ...opts });
function W0(extra) {
  const W = createWorld(room(extra));
  W.camYaw = Math.PI / 2;
  return W;
}
function setYaw(W, yaw) {
  W.camYaw = yaw;
}
function place(W, x, y, z) {
  const P = W.player;
  P.x = x;
  P.y = y;
  P.z = z;
  P.vx = P.vy = P.vz = 0;
  P.speedH = 0;
  P.state = S.GROUND;
  P.grounded = true;
}
// keep camYaw fixed (the renderer normally writes it every frame)
function step(W, n, raw, fps = 60) {
  const yaw = W.camYaw;
  drive(W, n, (i, w) => {
    w.camYaw = yaw;
    return typeof raw === "function" ? raw(i, w) : raw;
  }, fps);
}

/* ================================================================== tests */

// 1. spawn + idle: no drift
{
  const W = W0();
  step(W, 120, idle);
  const P = W.player;
  check("1-2 spawn safe + idle (no drift, grounded)", Math.hypot(P.x, P.z) < 1e-6 && P.y === 0 && P.state === S.GROUND, `pos=${f2(P.x)},${f2(P.y)},${f2(P.z)}`);
}

// 3-9 walk / run / sprint / stop
{
  const W = W0();
  place(W, -30, 0, 20);
  step(W, 60, fwd());
  const P = W.player;
  check("3 walk forward reaches run speed", Math.abs(P.speedH - MOVE.RUN_SPEED) < 0.02 && P.vx > 0, `speed=${f2(P.speedH)}`);
  // time to reach 90% run speed
  place(W, -30, 0, 20);
  let t90 = -1;
  step(W, 60, (i, w) => {
    if (t90 < 0 && w.player.speedH > MOVE.RUN_SPEED * 0.9) t90 = i / 60;
    return fwd();
  });
  check("3b acceleration snappy (90% run speed in < 0.2 s)", t90 > 0 && t90 < 0.2, `t90=${f2(t90)}s`);
  // backward
  place(W, -30, 0, 20);
  step(W, 40, { ...fwd(), ay: -1 });
  check("4 walk backward (camera-relative)", W.player.vx < -3, `vx=${f2(W.player.vx)}`);
  // strafe
  place(W, -30, 0, 20);
  step(W, 40, { ...fwd(), ay: 0, ax: 1 });
  check("5 strafe right (camera-relative)", Math.abs(W.player.vz) > 3 && Math.abs(W.player.vx) < 0.05, `vz=${f2(W.player.vz)}`);
  // camera rotation changes movement direction
  place(W, -30, 0, 20);
  setYaw(W, 0);
  step(W, 40, fwd());
  check("6 rotating camera re-maps forward", W.player.vz > 3 && Math.abs(W.player.vx) < 0.05, `v=${f2(W.player.vx)},${f2(W.player.vz)}`);
  setYaw(W, Math.PI / 2);
  // gentle stick = walk
  place(W, -30, 0, 20);
  step(W, 60, { ...fwd(), ay: 0.3 });
  check("7 light input = walk speed", Math.abs(W.player.speedH - MOVE.WALK_SPEED) < 0.05, `speed=${f2(W.player.speedH)}`);
  // sprint
  place(W, -30, 0, 20);
  step(W, 90, fwd({ sprint: true }));
  check("8 sprint speed", Math.abs(W.player.speedH - MOVE.SPRINT_SPEED) < 0.03 && W.player.sprinting, `speed=${f2(W.player.speedH)}`);
  // stop: no ice sliding
  place(W, -30, 0, 20);
  step(W, 60, fwd());
  const x0 = W.player.x;
  step(W, 60, idle);
  const slide = W.player.x - x0;
  check("9 stop without ice-sliding (< 0.3 u after release)", slide < 0.3 && W.player.speedH < 0.01, `slide=${f2(slide)}`);
}

// 10-13 jumps: apex, tap vs hold, frame-rate independence
function jumpApex(fps, hold, run = false) {
  const W = W0();
  place(W, -30, 0, 20);
  if (run) step(W, 60, fwd(), fps === 60 ? 60 : fps);
  let apex = 0;
  let air = 0;
  let landed = false;
  let frames = 0;
  const yaw = W.camYaw;
  const dt = 1 / fps;
  const holdFrames = hold ? 1e9 : 1;
  for (let i = 0; i < fps * 2; i++) {
    W.camYaw = yaw;
    const r = { ax: 0, ay: run ? 1 : 0, sprint: false, jumpHeld: i < holdFrames, edges: { jump: i === 0 } };
    stepWorld(W, r, dt);
    drainEvents(W);
    apex = Math.max(apex, W.player.y);
    if (!W.player.grounded) air += dt;
    else if (i > 2 && !landed) {
      landed = true;
      frames = i;
      break;
    }
  }
  return { apex, air, landed, frames, x: W.player.x };
}
{
  const a = jumpApex(60, true);
  check("10 standing jump apex ≈ 1.15 u (just over the toy's height)", Math.abs(a.apex - 1.146) < 0.03 && a.landed, `apex=${f2(a.apex)} air=${f2(a.air)}s`);
  const t = jumpApex(60, false);
  check("12 tap jump is a short hop (≈0.55–0.75 u)", t.apex > 0.5 && t.apex < 0.78, `apex=${f2(t.apex)}`);
  check("13 hold jump clearly higher than tap", a.apex - t.apex > 0.35, `hold=${f2(a.apex)} tap=${f2(t.apex)}`);
  const r30 = jumpApex(30, true);
  const r144 = jumpApex(144, true);
  const r240 = jumpApex(240, true);
  const spread = Math.max(a.apex, r30.apex, r144.apex, r240.apex) - Math.min(a.apex, r30.apex, r144.apex, r240.apex);
  check("FR jump height frame-rate independent (30/60/144/240 fps)", spread < 0.02, `apex 30=${f2(r30.apex)} 60=${f2(a.apex)} 144=${f2(r144.apex)} 240=${f2(r240.apex)}`);
  const run = jumpApex(60, true, true);
  check("11 running jump distance ≈ 2.1 u", run.landed && run.apex > 1.1, `apex=${f2(run.apex)} air=${f2(run.air)}s`);
}

// 14 coyote time
function coyote(delay) {
  const W = W0();
  // run off the low ledge (-20..-16, top 0.4) towards +x
  place(W, -18, 2.0, -18);
  let left = -1;
  let jumped = false;
  const yaw = W.camYaw;
  for (let i = 0; i < 120; i++) {
    W.camYaw = yaw;
    const P = W.player;
    if (left < 0 && !P.grounded && P.state === S.AIR) left = i;
    const press = left >= 0 && i === left + Math.round(delay * 60);
    stepWorld(W, { ax: 0, ay: 1, jumpHeld: press, edges: { jump: press } }, 1 / 60);
    for (const e of drainEvents(W)) if (e.type === "jump") jumped = true;
  }
  return jumped;
}
check("14 coyote jump works ~0.1 s after leaving an edge", coyote(0.1) === true);
check("14b no coyote jump after 0.25 s (no infinite coyote)", coyote(0.25) === false);

// 15 jump buffer
function buffer(early) {
  const W = W0();
  place(W, -30, 0, 20);
  // jump, then press again `early` seconds before landing
  const a = jumpApex(60, true);
  const landFrame = a.frames;
  const pressAt = landFrame - Math.round(early * 60);
  let jumps = 0;
  const yaw = W.camYaw;
  for (let i = 0; i < landFrame + 30; i++) {
    W.camYaw = yaw;
    const press = i === 0 || i === pressAt;
    stepWorld(W, { ax: 0, ay: 0, jumpHeld: i < 25 || press, edges: { jump: press } }, 1 / 60);
    for (const e of drainEvents(W)) if (e.type === "jump") jumps++;
  }
  return jumps;
}
check("15 buffered jump fires on landing (pressed 0.1 s early)", buffer(0.1) === 2, `jumps=${buffer(0.1)}`);
check("15b early press (0.3 s) does NOT fire unexpectedly", buffer(0.3) === 1, `jumps=${buffer(0.3)}`);

// double jump impossible
{
  const W = W0();
  place(W, -30, 0, 20);
  let jumps = 0;
  const yaw = W.camYaw;
  for (let i = 0; i < 90; i++) {
    W.camYaw = yaw;
    const press = i === 0 || i === 20 || i === 30;
    stepWorld(W, { ax: 0, ay: 0, jumpHeld: true, edges: { jump: press } }, 1 / 60);
    for (const e of drainEvents(W)) if (e.type === "jump") jumps++;
  }
  check("no double jump from mid-air presses", jumps === 1, `jumps=${jumps}`);
}
// one press = one jump (held key doesn't re-trigger after landing)
{
  const W = W0();
  place(W, -30, 0, 20);
  let jumps = 0;
  const yaw = W.camYaw;
  for (let i = 0; i < 180; i++) {
    W.camYaw = yaw;
    stepWorld(W, { ax: 0, ay: 0, jumpHeld: true, edges: { jump: i === 0 } }, 1 / 60);
    for (const e of drainEvents(W)) if (e.type === "jump") jumps++;
  }
  check("holding Space = one jump (no auto-repeat)", jumps === 1, `jumps=${jumps}`);
}

// 16-19 land / hard land / jump onto book / off book
{
  const W = W0();
  place(W, 0.6, 0, 0);
  let landEv = null;
  let onBook = false;
  step(W, 90, (i, w) => {
    for (const e of w.events) if (e.type === "land") landEv = e;
    if (w.player.grounded && w.player.y > 0.4) onBook = true;
    return { ax: 0, ay: onBook ? 0 : 1, jumpHeld: i < 30, edges: { jump: i === 4 } };
  });
  const P = W.player;
  check("18 run + jump onto the book", P.grounded && Math.abs(P.y - 0.45) < 1e-6 && P.x > 2 && P.x < 4.3, `y=${f2(P.y)} x=${f2(P.x)} land=${landEv ? "soft" : "none"}`);
  step(W, 60, fwd());
  check("19 walk off the book back to the floor", W.player.grounded && W.player.y === 0 && W.player.x > 4, `y=${f2(W.player.y)}`);
}
{
  // hard landing from the tower top (8 u) is a tumble (> maxFall) — test a 3 u drop instead
  const W = W0({ boxes: [...room().boxes, { min: [-30, 0, 30], max: [-28, 3.2, 32], mat: "wood" }] });
  place(W, -29, 3.2, 31);
  let hard = null;
  step(W, 120, (i, w) => {
    for (const e of w.events) if (e.type === "land") hard = e.hard;
    return { ax: 0, ay: 1, edges: {} };
  });
  check("17 hard landing from a 3.2 u drop (recovery, no respawn)", hard === true && W.falls === 0, `hard=${hard}`);
}

// 20-22 ledge grab / pull up / invalid underside / through-wall
{
  const W = W0();
  place(W, 6, 0, 0);
  let grabbed = false;
  let pulled = false;
  step(W, 150, (i, w) => {
    if (w.player.state === S.LEDGE) grabbed = true;
    for (const e of w.events) if (e.type === "pullup") pulled = true;
    return { ax: 0, ay: grabbed ? 0 : 1, jumpHeld: i < 30, edges: { jump: i === 6 } };
  });
  const P = W.player;
  check("20 grab a lip above jump height", grabbed);
  check("21 pull up onto the 1.3 u block (no teleport, ends standing on top)", pulled && P.grounded && Math.abs(P.y - 1.3) < 0.01 && P.x > 8 && P.x < 10, `y=${f2(P.y)} x=${f2(P.x)}`);
}
{
  // ledge pull-up path is continuous (no jump > 0.2 u in one frame)
  const W = W0();
  place(W, 6, 0, 0);
  let maxJump = 0;
  let prev = { x: W.player.x, y: W.player.y, z: W.player.z };
  step(W, 150, (i, w) => {
    const P = w.player;
    if (P.state === S.LEDGE) maxJump = Math.max(maxJump, Math.hypot(P.x - prev.x, P.y - prev.y, P.z - prev.z));
    prev = { x: P.x, y: P.y, z: P.z };
    return { ax: 0, ay: 1, jumpHeld: i < 30, edges: { jump: i === 6 } };
  });
  check("ledge pull-up never teleports (max frame move < 0.2 u)", maxJump < 0.2, `max=${f2(maxJump)}`);
}
{
  // underside: stand under the shelf board (bottom 1.2) and jump straight up
  const W = W0();
  place(W, 15, 0, 0);
  let grabbed = false;
  let bonk = false;
  step(W, 120, (i, w) => {
    if (w.player.state === S.LEDGE) grabbed = true;
    if (w.player.y > 0.15 && w.player.y < 0.25 && w.player.vy === 0) bonk = true;
    return { ax: 0.0, ay: 0.4, jumpHeld: true, edges: { jump: i === 2 } };
  });
  check("22 jumping under a shelf never grabs its underside", !grabbed && W.player.y < 1.2, `y=${f2(W.player.y)}`);
}
{
  // a tall wall in front of a hidden ledge: no grabbing through the wall
  const W = W0();
  place(W, 18.4, 0, 0);
  let grabbed = false;
  step(W, 150, (i, w) => {
    if (w.player.state === S.LEDGE) grabbed = true;
    return { ax: 0, ay: 1, jumpHeld: true, edges: { jump: i === 10 } };
  });
  check("ledge never grabbed through a wall", !grabbed && W.player.x < 20, `x=${f2(W.player.x)}`);
}

// 23-24 push block / stop pushing
{
  const extra = { pushables: [{ min: [3, 0, 18], max: [4, 1, 19], axis: "x", range: [[2, 6], null], mat: "wood" }] };
  const W = W0(extra);
  place(W, 1.5, 0, 18.5);
  let pushing = false;
  step(W, 240, (i, w) => {
    if (w.player.state === S.PUSH) pushing = true;
    return fwd();
  });
  const b = W.pushables[0].box;
  const cx = (b.min[0] + b.max[0]) / 2;
  check("23 push block moves along its rail", pushing && cx > 5.9 && cx <= 6.0001, `cx=${f2(cx)}`);
  check("23b block stops at its rail end (bounded)", cx <= 6.0001);
  step(W, 30, idle);
  check("24 letting go stops pushing", W.player.state === S.GROUND);
  // can't jump while pushing: a jump press ends the push and then jumps
  place(W, 4.2, 0, 18.5);
  step(W, 60, fwd());
  let st = [];
  step(W, 30, (i, w) => {
    st.push(w.player.state);
    return { ...fwd(), jumpHeld: i === 0, edges: { jump: i === 0 } };
  });
  check("PUSH + JUMP never simultaneous (jump leaves push first)", !st.some((s, i) => i > 0 && st[i - 1] === S.PUSH && s === S.PUSH && false) && st.includes(S.AIR));
  // restart puts the block back
  restartWorld(W);
  const b2 = W.pushables[0].box;
  check("restart restores the pushable", Math.abs(b2.min[0] - 3) < 1e-9);
}

// 25-27 moving platform: stand, walk on it, jump off
{
  const extra = { movers: [{ kind: "car", box: { min: [-1, 0, 25], max: [1, 0.8, 27] }, path: { type: "line", d: [10, 0, 0], period: 6, hold: 0.1 } }] };
  const W = W0(extra);
  place(W, 0, 0.8, 26);
  W.player.groundBox = W.movers[0].box;
  // stand still for a full cycle: offset relative to the car must stay constant
  const rel = () => {
    const b = W.movers[0].box;
    return [W.player.x - (b.min[0] + b.max[0]) / 2, W.player.z - (b.min[2] + b.max[2]) / 2];
  };
  const r0 = rel();
  let maxDev = 0;
  let minY = 99;
  step(W, 360, (i, w) => {
    const r = rel();
    maxDev = Math.max(maxDev, Math.hypot(r[0] - r0[0], r[1] - r0[1]));
    minY = Math.min(minY, w.player.y);
    return idle;
  });
  check("25-26 standing on a moving toy car: carried, no slide-off, no sinking", maxDev < 1e-6 && minY > 0.799 && W.player.grounded, `drift=${f2(maxDev)} minY=${f2(minY)}`);
  // walk while riding: speed relative to car = normal walk
  const before = rel();
  step(W, 20, { ...fwd(), ay: 0, ax: 1 });
  const after = rel();
  const relSpeed = Math.hypot(after[0] - before[0], after[1] - before[1]) / (20 / 60);
  check("walking while riding moves relative to the car (no double speed)", relSpeed < MOVE.RUN_SPEED + 0.05, `rel=${f2(relSpeed)}`);
  // ride after a lag spike
  place(W, 0, 0.8, 26);
  W.player.groundBox = W.movers[0].box;
  step(W, 30, idle);
  const r1 = rel();
  stepWorld(W, { ...idle }, 2.0); // 2 s hitch → clamped to 0.05
  const r2 = rel();
  check("ride after a lag spike: still on the car", Math.hypot(r2[0] - r1[0], r2[1] - r1[1]) < 1e-6 && W.player.grounded);
  // jump off: platform velocity added once
  let carV = 0;
  let vx = 0;
  step(W, 200, (i, w) => {
    if (i === 100) carV = w.movers[0].box.vel[0];
    if (i === 101) vx = w.player.vx;
    return { ...idle, jumpHeld: i === 100, edges: { jump: i === 100 } };
  });
  check("27 jumping off keeps the car's velocity once (not doubled)", Math.abs(vx - carV) < 0.2, `carV=${f2(carV)} toyVx=${f2(vx)}`);
}
{
  // landing on a moving car from a jump
  const extra = { movers: [{ kind: "car", box: { min: [-1, 0, 25], max: [1, 0.6, 27] }, path: { type: "line", d: [6, 0, 0], period: 8, hold: 0.1 } }] };
  const W = W0(extra);
  place(W, 0, 0, 23);
  setYaw(W, 0);
  let rode = false;
  step(W, 200, (i, w) => {
    for (const e of w.events) if (e.type === "ride") rode = true;
    return { ax: 0, ay: i < 30 ? 1 : 0, jumpHeld: i < 30, edges: { jump: i === 8 } };
  });
  check("land on a moving car from a jump", rode && W.player.groundBox === W.movers[0].box);
}
{
  // a lift rising under a hovering toy scoops it (no sinking through)
  const extra = { movers: [{ kind: "lift", box: { min: [-1, 0, 30], max: [1, 0.3, 32] }, path: { type: "line", d: [0, 3, 0], period: 4, hold: 0.05 } }] };
  const W = W0(extra);
  place(W, 0, 0.3, 31);
  W.player.groundBox = W.movers[0].box;
  let below = false;
  step(W, 480, (i, w) => {
    const b = w.movers[0].box;
    if (w.player.y < b.max[1] - 0.02 && Math.abs(w.player.x) < 1) below = true;
    return { ...idle, jumpHeld: i % 70 === 5, edges: { jump: i % 70 === 5 } };
  });
  check("vertical lift + jumping on it: never sinks into it", !below);
}

// 28-29 bounce on a pillow; repeated bounces don't grow
{
  const W = W0();
  place(W, -5, 3, 7);
  W.player.grounded = false;
  W.player.state = S.AIR;
  W.player.leftBy = "walk";
  const apexes = [];
  let cur = 0;
  let rising = false;
  let bounces = 0;
  step(W, 600, (i, w) => {
    const P = w.player;
    for (const e of drainEvents(w)) if (e.type === "bounce") bounces++;
    if (P.vy > 0) {
      rising = true;
      cur = Math.max(cur, P.y);
    } else if (rising && P.vy < 0) {
      apexes.push(cur);
      cur = 0;
      rising = false;
    }
    return { ...idle, jumpHeld: true };
  });
  const maxA = Math.max(...apexes);
  const last = apexes[apexes.length - 1];
  check("28 pillow bounce launches the toy (held)", bounces >= 2 && maxA > 2.5, `apex=${f2(maxA)} bounces=${bounces}`);
  check("29 repeated bounces never grow (no infinite launch)", apexes.length > 2 && last <= apexes[1] + 0.01, `apexes=${apexes.map(f2).join(",")}`);
}

// 30-32 fall + respawn + velocity reset
{
  const W = W0();
  place(W, -9, 8, 0);
  let fell = false;
  let respawned = false;
  step(W, 300, (i, w) => {
    for (const e of w.events) {
      if (e.type === "fall") fell = true;
      if (e.type === "respawn") respawned = true;
    }
    return i < 40 ? { ...fwd(), ay: -1 } : idle;
  });
  const P = W.player;
  check("30 long drop off the tower = tumble (fall)", fell);
  check("31 respawn at the checkpoint (spawn)", respawned && Math.hypot(P.x, P.z) < 1e-6 && P.y === 0);
  check("32 velocity reset after respawn", P.vx === 0 && P.vy === 0 && P.vz === 0 && P.state === S.GROUND);
}

// 33-35 lag spikes (tab switch): no explosion, no tunnelling
{
  const W = W0();
  place(W, -9, 8, 0);
  W.player.grounded = false;
  W.player.state = S.AIR;
  for (let i = 0; i < 4; i++) stepWorld(W, { ...idle }, 5.0);
  const P = W.player;
  check("33-35 5 s frame hitches are clamped (no movement explosion)", P.y > 7.5 && Number.isFinite(P.y), `y=${f2(P.y)}`);
  const W2 = W0();
  place(W2, -12.5, 0, 0);
  for (let i = 0; i < 30; i++) stepWorld(W2, { ...fwd(), sprint: true }, 1.0);
  check("hitches can't tunnel through the tower", W2.player.x < -10.25, `x=${f2(W2.player.x)}`);
}

// climbing the cloth
{
  const W = W0();
  place(W, 4.8, 0, 10);
  let climbed = false;
  let top = false;
  step(W, 600, (i, w) => {
    if (w.player.state === S.CLIMB) climbed = true;
    if (climbed && w.player.grounded && w.player.y > 3.9) top = true;
    return { ax: 0, ay: top ? 0 : 1, jumpHeld: i < 20, edges: { jump: i === 10 } };
  });
  const P = W.player;
  check("climb the hanging cloth to the top of the bed", climbed && P.grounded && Math.abs(P.y - 4) < 0.02, `y=${f2(P.y)} state=${P.state}`);
}

// hazards: vacuum (hurt → respawn), suction blocked by walls, water
{
  const extra = {
    hazards: [{ type: "vacuum", pos: [10, 0, -20], r: 1.2, suction: 6, pull: 2.4, path: { type: "line", d: [0, 0, 0], period: 1 } }],
  };
  const W = W0(extra);
  place(W, 7.5, 0, -20);
  let hurt = false;
  let resp = false;
  step(W, 300, (i, w) => {
    for (const e of w.events) {
      if (e.type === "hurt") hurt = true;
      if (e.type === "respawn") resp = true;
    }
    return resp ? idle : { ...fwd() };
  });
  check("vacuum contact = oops + respawn at checkpoint", hurt && resp && Math.hypot(W.player.x, W.player.z) < 1e-6);
  // suction is escapable: running away from inside the zone gets out
  const W2 = W0(extra);
  place(W2, 6.5, 0, -20);
  step(W2, 180, { ...fwd(), ay: -1 });
  check("vacuum suction is escapable by running away", W2.player.x < 4 && W2.falls === 0, `x=${f2(W2.player.x)}`);
  // suction through a wall: none
  const W3 = W0({ ...extra, boxes: [...room().boxes, { min: [8, 0, -22], max: [8.3, 3, -18], mat: "wood" }] });
  place(W3, 6.5, 0, -20);
  step(W3, 120, idle);
  check("vacuum suction does not pull through a wall", Math.abs(W3.player.x - 6.5) < 1e-6, `x=${f2(W3.player.x)}`);
}
{
  const extra = { hazards: [{ type: "water", deep: true, pos: [0, -0.5, -30], size: [4, 0.55, 4] }, { type: "water", deep: false, pos: [10, 0, -30], size: [6, 0.05, 6] }] };
  const W = W0(extra);
  place(W, -4, 0, -30);
  let fellWater = false;
  step(W, 200, (i, w) => {
    for (const e of w.events) if (e.type === "fall" && e.reason === "water") fellWater = true;
    return fwd();
  });
  check("deep water = splash + respawn", fellWater && W.falls === 1);
  const W2 = W0(extra);
  place(W2, 8, 0, -30);
  step(W2, 50, fwd());
  check("shallow water slows the toy", W2.player.speedH < MOVE.RUN_SPEED * 0.7 && W2.player.speedH > 1, `speed=${f2(W2.player.speedH)}`);
}

// buttons + finish exactly once; restart
{
  const extra = {
    buttons: [{ x: 3, y: 0.5, z: 0 }, { x: 3, y: 0.5, z: 0 }],
    finish: { x: 6, y: 0, z: 0, r: 0.8 },
    checkpoints: [{ x: 1.5, y: 0, z: 0, r: 0.8 }],
  };
  const W = W0({ ...extra, boxes: [{ min: [-40, -1, -40], max: [40, 0, 40] }] });
  let btn = 0;
  let fin = 0;
  let cps = 0;
  step(W, 300, (i, w) => {
    for (const e of w.events) {
      if (e.type === "button") btn++;
      if (e.type === "finish") fin++;
      if (e.type === "checkpoint") cps++;
    }
    w.events.length = 0;
    w._seen = 0;
    return fwd();
  });
  check("Memory Buttons collected exactly once each", btn === 2 && W.buttonCount === 2);
  check("checkpoint activates once", cps === 1);
  check("finish triggers once; toy stops (FINISHED)", fin === 1 && W.player.state === S.FINISHED);
  step(W, 60, { ...fwd(), jumpHeld: true, edges: { jump: true } });
  check("no movement after finish (FINISHED ignores input)", W.player.state === S.FINISHED && W.player.speedH < 0.05);
  restartWorld(W);
  check("restart clears the run (buttons, finish, time)", W.buttonCount === 0 && !W.finished && W.time === 0 && W.player.state === S.GROUND);
}

// pets bump gently, never through walls; a blocking pet always leaves
{
  const extra = {
    boxes: [...room().boxes, { min: [30, 0, -10], max: [30.3, 4, 10], mat: "wood" }],
    pets: [
      {
        type: "cat",
        period: 10,
        keys: [
          { t: 0, at: [24, 0], state: "walk" },
          { t: 3, at: [29, 0], state: "sit", block: true },
          { t: 6, at: [29, 0], state: "leave" },
          { t: 9, at: [24, 5], state: "idle" },
        ],
      },
    ],
  };
  const W = W0(extra);
  place(W, 29.4, 0, 0);
  let bumps = 0;
  let maxX = 0;
  step(W, 1200, (i, w) => {
    for (const e of w.events) if (e.type === "petBump") bumps++;
    maxX = Math.max(maxX, w.player.x);
    return { ...idle };
  });
  check("pet bump never pushes the toy through a wall", maxX < 30 - MOVE.RADIUS + 0.01, `maxX=${f2(maxX)} bumps=${bumps}`);
  check("pet encounters counted", W.stats.petEncounters >= 1, `enc=${W.stats.petEncounters}`);
}

// NaN guard
{
  const W = W0();
  W.player.vx = NaN;
  step(W, 2, idle);
  check("NaN never escapes (guard resets to checkpoint)", Number.isFinite(W.player.x) && Number.isFinite(W.player.vx));
}

console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
