/**
 * Mario Adventure 3D — headless physics / gameplay checks.
 *   node src/components/games/MarioAdventure3D/tools/simTest.mjs [core|levels]
 *
 * core    controller numbers (jump arcs, coyote, buffer, walls, slopes,
 *         moving / rotating / falling / spring / blink platforms, stomps,
 *         damage, pits, checkpoints, goal)
 * levels  every built level: spawn grounded, entities sane, goal + star +
 *         checkpoints on solid ground, plus the reachability check
 *         (tools/reach.mjs)
 */
import { build } from "../data/kit.js";
import { createWorld, advance, step, restartWorld, continueFromCheckpoint } from "../engine/world.js";
import { STEP, P } from "../engine/config.js";

let fails = 0;
let passes = 0;
function ok(cond, msg, extra = "") {
  if (cond) passes++;
  else {
    fails++;
    console.log(`  FAIL ${msg} ${extra}`);
  }
}

const IDLE = { ax: 0, ay: 0, sprint: false, jumpHeld: false };
function run(W, inp, secs, each) {
  const n = Math.round(secs / STEP);
  for (let i = 0; i < n; i++) {
    step(W, { camYaw: W.cam.yaw, ...inp, jump: inp.jump && i === 0, interact: inp.interact && i === 0 }, STEP);
    if (each) each(W, i);
  }
}

function flat(extra) {
  const L = build({ id: 99, world: 1, num: 1, name: "test", theme: "green", sea: { kind: "void", y: -30 }, killY: -20 });
  L.island(0, 0, 60, 60, 0, { wob: 0 });
  L.spawn(0, 0, 0);
  if (extra) extra(L);
  return createWorld(L.done());
}

function core() {
  console.log("core: controller");
  {
    // jump height + double jump height
    const W = flat();
    run(W, IDLE, 0.2);
    let peak = 0;
    run(W, { ...IDLE, jump: true, jumpHeld: true }, 1.2, (w) => (peak = Math.max(peak, w.player.y)));
    ok(peak > 2.5 && peak < 3.0, "single jump height ~2.7", peak.toFixed(2));
    ok(W.player.grounded, "lands after single jump");
    // short hop
    let hop = 0;
    run(W, { ...IDLE, jump: true, jumpHeld: false }, 1.0, (w) => (hop = Math.max(hop, w.player.y)));
    ok(hop > 0.6 && hop < 1.8, "tap = short hop", hop.toFixed(2));
    // double
    let dpeak = 0;
    run(W, { ...IDLE, jump: true, jumpHeld: true }, 0.33);
    run(W, { ...IDLE, jump: true, jumpHeld: true }, 1.5, (w) => (dpeak = Math.max(dpeak, w.player.y)));
    ok(dpeak > 4.4 && dpeak < 5.6, "double jump total ~4.9", dpeak.toFixed(2));
    // no triple jump
    run(W, { ...IDLE, jump: true, jumpHeld: true }, 0.3);
    run(W, { ...IDLE, jump: true, jumpHeld: true }, 0.25);
    const vy = W.player.vy;
    run(W, { ...IDLE, jump: true, jumpHeld: true }, 0.02);
    ok(W.player.vy <= vy + 0.01 || W.player.grounded, "no third jump in the air");
  }
  {
    // horizontal distances
    const W = flat();
    run(W, { ...IDLE, ay: 1 }, 1.0);
    const z0 = W.player.z;
    let land = null;
    run(W, { ...IDLE, ay: 1, jump: true, jumpHeld: true }, 1.2, (w) => {
      if (land == null && w.player.grounded && w.player.z > z0 + 0.5) land = w.player.z;
    });
    const walkJump = land - z0;
    ok(walkJump > 4.2 && walkJump < 6.5, "walk jump distance ~5", walkJump.toFixed(2));
    const W2 = flat();
    run(W2, { ...IDLE, ay: 1, sprint: true }, 1.2);
    const z1 = W2.player.z;
    let land2 = null;
    run(W2, { ...IDLE, ay: 1, sprint: true, jump: true, jumpHeld: true }, 1.2, (w) => {
      if (land2 == null && w.player.grounded && w.player.z > z1 + 0.5) land2 = w.player.z;
    });
    ok(land2 - z1 > 6.5 && land2 - z1 < 9.5, "sprint jump distance ~8", (land2 - z1).toFixed(2));
    ok(Math.abs(W2.player.speed - P.RUN) < 0.5, "sprint top speed", W2.player.speed.toFixed(2));
  }
  {
    // camera-relative steering: camera yaw 90° → W goes +x
    const W = flat();
    W.cam.yaw = Math.PI / 2;
    run(W, { ...IDLE, ay: 1 }, 0.6);
    ok(W.player.x > 2 && Math.abs(W.player.z) < 0.2, "W moves along camera forward", `${W.player.x.toFixed(2)},${W.player.z.toFixed(2)}`);
    W.player.x = 0;
    run(W, { ...IDLE, ax: 1 }, 0.6);
    ok(W.player.z > 2, "D moves camera-right", W.player.z.toFixed(2));
  }
  {
    // coyote time + buffer, off a platform edge
    const W = flat((L) => L.plat(0, 3, 0, 4, 4, { style: "stone" }).spawn(0, 0, 0, 3));
    ok(W.player.y === 3, "spawn on platform top");
    run(W, IDLE, 0.1);
    ok(W.player.grounded && Math.abs(W.player.y - 3) < 1e-6, "stands on platform");
    run(W, { ...IDLE, ay: 1 }, 0.42);
    // just walked off? keep walking until airborne then jump within coyote
    let t = 0;
    while (W.player.grounded && t < 2) {
      run(W, { ...IDLE, ay: 1 }, STEP);
      t += STEP;
    }
    run(W, { ...IDLE, ay: 1 }, 0.06);
    run(W, { ...IDLE, ay: 1, jump: true, jumpHeld: true }, STEP);
    ok(W.player.vy > 10 && W.player.jumps === 1, "coyote jump after leaving edge", `vy=${W.player.vy.toFixed(1)} j=${W.player.jumps}`);
    // buffer: press jump shortly before landing
    run(W, { ...IDLE, jumpHeld: true }, 0.25);
    let tt = 0;
    while (!W.player.grounded && tt < 3) {
      const nearGround = W.player.y < 0.6 && W.player.vy < 0;
      run(W, { ...IDLE, jump: nearGround && tt >= 0, jumpHeld: nearGround }, STEP);
      if (nearGround) break;
      tt += STEP;
    }
    let jumped = false;
    run(W, { ...IDLE, jumpHeld: true }, 0.2, (w) => {
      if (w.player.vy > 8) jumped = true;
    });
    ok(jumped, "buffered jump fires on landing");
  }
  {
    // walls: run into a box, slide along it; never tunnel
    const W = flat((L) => L.wall(0, 0, 6, 4, 2, 0.5, { style: "stone" }));
    run(W, { ...IDLE, ay: 1, sprint: true }, 2);
    ok(W.player.z < 6 - 0.5 - P.RADIUS + 0.02, "wall stops Mario", W.player.z.toFixed(3));
    run(W, { ...IDLE, ay: 1, ax: 1, sprint: true }, 1.2);
    ok(W.player.x < -3, "slides along wall", W.player.x.toFixed(2));
    // rotated wall
    const W2 = flat((L) => L.wall(0, 0, 6, 4, 2, 0.4, { yaw: 0.6 }));
    run(W2, { ...IDLE, ay: 1, sprint: true }, 2);
    const s = W2.solids.list.find((b) => Math.abs(b.yaw - 0.6) < 1e-6);
    const lx = (W2.player.x - s.x) * s.c + (W2.player.z - s.z) * s.s;
    const lz = -(W2.player.x - s.x) * s.s + (W2.player.z - s.z) * s.c;
    ok(Math.abs(lz) > s.hz || Math.abs(lx) > s.hx, "rotated wall blocks");
  }
  {
    // high-speed fall onto a thin platform never falls through
    const W = flat((L) => L.plat(0, 2, 0, 3, 3, { h: 0.3 }).spawn(0, 0, 0, 60));
    run(W, IDLE, 3);
    ok(Math.abs(W.player.y - 2) < 1e-6 && W.player.grounded, "lands on thin platform from 58 m", W.player.y.toFixed(3));
  }
  {
    // ceilings: jump into a block from below → bonk + coin
    const W = flat((L) => L.qblock(0, 2.6, 0, "coin"));
    run(W, IDLE, 0.1);
    run(W, { ...IDLE, jump: true, jumpHeld: true }, 1.2);
    ok(W.coinCount === 1 && W.blocks[0].used, "? block gives a coin from below", `coins=${W.coinCount}`);
    ok(W.player.grounded && W.player.y < 0.01, "bonked back down");
  }
  {
    // hidden block: invisible, revealed by a head bonk, then solid
    const W = flat((L) => L.qblock(0, 2.6, 0, "coin", { hidden: true }));
    ok(!W.blocks[0].solid.active, "hidden block starts intangible");
    run(W, IDLE, 0.1);
    run(W, { ...IDLE, jump: true, jumpHeld: true }, 1.2);
    ok(!W.blocks[0].hidden && W.blocks[0].solid.active && W.coinCount === 1, "bonk reveals hidden block");
    restartWorld(W);
    ok(W.blocks[0].hidden && !W.blocks[0].solid.active, "restart hides it again");
  }
  {
    // slopes: gentle hill walkable, steep mesa blocks, terrace step blocks
    const W = flat((L) => {
      L.hill(0, 10, 8, 3);
      L.hill(20, 0, 3, 6, { flat: 0.6 });
    });
    let air = 0;
    run(W, { ...IDLE, ay: 1 }, 3, (w) => {
      if (!w.player.grounded) air++;
    });
    ok(W.player.z > 14, "walks over a gentle hill", W.player.z.toFixed(2));
    ok(air === 0, "stays grounded walking up AND down a hill", `airborne steps ${air}`);
    const W2 = flat((L) => L.hill(0, 6, 3, 6, { flat: 0.7 }));
    run(W2, { ...IDLE, ay: 1 }, 2);
    ok(W2.player.y < 1.6, "steep mesa flank blocks", W2.player.y.toFixed(2));
    const W3 = flat((L) => L.island(0, 10, 10, 4, 3, { wob: 0 }));
    run(W3, { ...IDLE, ay: 1 }, 2);
    ok(W3.player.z < 6.05 && W3.player.y < 0.01, "3 m island cliff is a wall", W3.player.z.toFixed(2));
    run(W3, { ...IDLE, ay: 1, jump: true, jumpHeld: true }, 1);
    ok(W3.player.y > 2.9, "can jump onto the cliff", W3.player.y.toFixed(2));
    const W4 = flat((L) => L.island(0, 10, 10, 4, 0.38, { wob: 0 }));
    run(W4, { ...IDLE, ay: 1 }, 2);
    ok(W4.player.z > 8 && Math.abs(W4.player.y - 0.38) < 0.01, "walks up a low island step", `${W4.player.z.toFixed(2)},${W4.player.y.toFixed(2)}`);
  }
  {
    // moving platform carries Mario; rotating disc carries + turns
    const W = flat((L) => L.mover(0, 2, 0, 3, 3, [10, 2, 0], 4).spawn(0, 0, 0, 2));
    run(W, IDLE, 2);
    ok(W.player.grounded && Math.abs(W.player.x - 10) < 0.3 && Math.abs(W.player.y - 2) < 0.01, "rides the lift", W.player.x.toFixed(2));
    const W2 = flat((L) => L.disc(0, 1, 0, 3, 1).spawn(2, 0, 0, 1));
    run(W2, IDLE, Math.PI);
    ok(W2.player.grounded && Math.abs(W2.player.x + 2) < 0.2 && Math.abs(W2.player.z) < 0.2, "rotating disc carries", `${W2.player.x.toFixed(2)},${W2.player.z.toFixed(2)}`);
    // rising lift
    const W3 = flat((L) => L.mover(0, 1, 0, 3, 3, [0, 7, 0], 4).spawn(0, 0, 0, 1));
    run(W3, IDLE, 2);
    ok(W3.player.grounded && Math.abs(W3.player.y - 7) < 0.1, "rides a rising lift", W3.player.y.toFixed(2));
    run(W3, IDLE, 2);
    ok(W3.player.grounded && Math.abs(W3.player.y - 1) < 0.1, "and back down without bouncing", W3.player.y.toFixed(2));
  }
  {
    // falling platform: shakes, drops, respawns
    const W = flat((L) => L.faller(0, 4, 0, 3, 3).plat(0, 1, 6, 3, 3).spawn(0, 0, 0, 4));
    run(W, IDLE, 0.3);
    ok(W.platforms[0].state === "shake", "faller shakes when stood on");
    run(W, IDLE, 1.2);
    ok(W.player.y < 3.9, "faller drops Mario", W.player.y.toFixed(2));
    run(W, IDLE, 6);
    ok(W.platforms[0].state === "idle" && W.platforms[0].solid.active, "faller respawns");
  }
  {
    // spring
    const W = flat((L) => L.spring(0, 4));
    let peak = 0;
    run(W, { ...IDLE, ay: 1 }, 0.8);
    run(W, IDLE, 2, (w) => (peak = Math.max(peak, w.player.y)));
    ok(peak > 7, "spring launches high", peak.toFixed(2));
  }
  {
    // blink platform switches off and on
    const W = flat((L) => L.blinker(0, 3, 6, 3, 3, 2, 0, { on: 0.5 }));
    const s = W.platforms[0].solid;
    const a = s.active;
    run(W, IDLE, 1.2);
    const b = s.active;
    run(W, IDLE, 1.0);
    ok(a && !b && s.active, "blink platform cycles");
  }
  {
    // stomp vs side hit
    const W = flat((L) => L.enemy("walker", 0, 2.2, { still: true }));
    const e = W.enemies[0];
    e.st = -100; // don't notice Mario
    W.player.y = 4;
    W.player.z = 2.2;
    W.player.grounded = false;
    run(W, IDLE, 0.6);
    ok(!e.alive && W.hearts === 3, "stomp defeats walker, no damage", `alive=${e.alive} hearts=${W.hearts}`);
    const W2 = flat((L) => L.enemy("walker", 0, 3, { still: true }));
    W2.enemies[0].st = -100;
    run(W2, { ...IDLE, ay: 1 }, 1);
    ok(W2.hearts === 2 && W2.enemies[0].alive, "side contact hurts", `hearts=${W2.hearts}`);
    ok(W2.player.invuln > 0, "invulnerable after a hit");
    run(W2, { ...IDLE, ay: 1 }, 0.6);
    ok(W2.hearts === 2, "no damage while invulnerable");
    // armored: two stomps
    const W3 = flat((L) => L.enemy("armored", 0, 0, { still: true }));
    const a = W3.enemies[0];
    a.st = -100;
    W3.player.y = 4;
    W3.player.grounded = false;
    run(W3, IDLE, 0.4);
    ok(a.alive && a.state === "stunned", "armored: first stomp → shell");
    W3.player.x = 0;
    W3.player.z = 0;
    run(W3, IDLE, 1.6);
    ok(!a.alive, "armored: second stomp defeats");
  }
  {
    // three hits → game over; continue from checkpoint
    const W = flat((L) => L.checkpoint(0, 5));
    run(W, { ...IDLE, ay: 1 }, 1);
    ok(W.checkpoint.idx === 0, "checkpoint activates");
    for (let i = 0; i < 3; i++) {
      W.player.invuln = 0;
      W.hurt(W.player.x + 1, W.player.z, "test");
      run(W, IDLE, 0.3);
    }
    ok(W.state === "dying", "0 hearts → dying");
    run(W, IDLE, 3);
    ok(W.state === "gameover", "→ game over");
    continueFromCheckpoint(W);
    ok(W.hearts === 3 && Math.abs(W.player.z - 5) < 0.01 && W.state === "play", "continue at checkpoint with full hearts");
  }
  {
    // pit: lose a heart, respawn at checkpoint
    const W = flat((L) => L.island(0, 30, 4, 4, 0, { wob: 0 }));
    W.player.x = 0;
    W.player.z = 59; // near edge of the 60-island
    run(W, { ...IDLE, ay: 1 }, 4);
    ok(W.hearts === 2 && W.state === "play" && W.stats.falls === 1, "pit costs a heart and respawns", `h=${W.hearts} z=${W.player.z.toFixed(1)} ${W.state}`);
  }
  {
    // power-ups
    const W = flat((L) => L.pickupG("speed", 0, 2).pickupG("jump", 0, 4).pickupG("magnet", 0, 6).coinG(6, 10));
    run(W, { ...IDLE, ay: 1 }, 1.4);
    ok(W.power.speed > 0 && W.power.jump > 0 && W.power.magnet > 0, "power-ups collected");
    run(W, IDLE, 1);
    ok(W.coinCount === 1, "magnet pulls a coin from 6 m away", `coins=${W.coinCount}`);
    W.player.x = W.player.z = 0;
    W.player.vx = W.player.vz = 0;
    run(W, IDLE, 0.1);
    let peak = 0;
    run(W, { ...IDLE, jump: true, jumpHeld: true }, 1.4, (w) => (peak = Math.max(peak, w.player.y)));
    ok(peak > 3.6, "higher jump", peak.toFixed(2));
  }
  {
    // goal sequence
    const W = flat((L) => L.goal(0, 4));
    run(W, { ...IDLE, ay: 1 }, 1.2);
    ok(W.state === "goal", "touching the pole starts the goal", W.state);
    run(W, IDLE, 4);
    ok(W.state === "complete", "→ complete");
    restartWorld(W);
    ok(W.state === "play" && W.player.z === 0, "restart resets the run");
  }
  {
    // frame-rate independence: 30 / 60 / 144 fps give the same jump
    const peaks = [30, 60, 144].map((fps) => {
      const W = flat();
      let pk = 0;
      for (let i = 0; i < fps * 1.5; i++) {
        advance(W, { ...IDLE, jump: i === 0, jumpHeld: true }, 1 / fps);
        pk = Math.max(pk, W.player.y);
      }
      return pk;
    });
    ok(Math.max(...peaks) - Math.min(...peaks) < 0.08, "jump height independent of fps", peaks.map((v) => v.toFixed(2)).join("/"));
  }
}

const mode = process.argv[2] || "core";
if (mode === "core" || mode === "all") core();
if (mode === "levels" || mode === "all") {
  const { levelsCheck } = await import("./levelCheck.mjs");
  const r = levelsCheck(process.argv.slice(3).map(Number).filter(Boolean));
  passes += r.passes;
  fails += r.fails;
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
