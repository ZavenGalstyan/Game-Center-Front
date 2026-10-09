/**
 * Mario Adventure 3D — one level's simulation (pure JS, no THREE, no React;
 * tools/simTest.mjs drives it headlessly).
 *
 *   createWorld(level)      build terrain, solids and every entity
 *   advance(W, raw, dt)     run fixed steps for one rendered frame
 *   restartWorld(W)         same level from the start (Retry / Restart)
 *   continueFromCheckpoint  after Game Over: full hearts at the last flag
 *
 * Renderer and HUD read W directly and drain W.events (sounds, particles,
 * HUD refresh). Health: three hearts; damage → knockback + invulnerability;
 * a pit costs a heart and respawns at the latest checkpoint.
 */
import { STEP, MAX_STEPS, P, POWER, MAGNET_R, clamp } from "./config.js";
import { createTerrain } from "./terrain.js";
import { createSolids, addSolid, groundAt } from "./collision.js";
import { createPlayer, resetPlayer, stepPlayer, stompBounce } from "./player.js";
import { createPlatform, stepPlatform, standOnPlatform, resetPlatform } from "./platforms.js";
import { createEnemy, stepEnemy, stompable, stompEnemy, defeat, resetEnemy } from "./enemies.js";
import { createHazard, stepHazard, resetHazard, stepShots, stepRings } from "./hazards.js";
import { createBoss, stepBoss, resetBoss } from "./bosses.js";
import { createCamera, snapCamera } from "./camera.js";

export function createWorld(level, opts = {}) {
  const W = {
    level,
    opts,
    terrain: createTerrain(level),
    solids: createSolids(),
    events: [],
    clock: 0,
    acc: 0,
    killY: level.killY ?? -12,
    sea: level.sea || { y: -30, kind: "void" },
    groundSurf: level.surf || "grass",
    power: { speed: 0, jump: 0, star: 0, magnet: 0 },
    shots: [],
    rings: [],
    shotSeq: 1,
    lastShotClean: 0,
    pending: { jump: false, interact: false },
  };
  // deterministic per level: the same inputs always replay the same run
  let seed = ((level.id || 1) * 2654435761) % 2147483647 || 1;
  W.rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  W.reseed = () => {
    seed = ((level.id || 1) * 2654435761) % 2147483647 || 1;
  };
  W.emit = (type, data) => {
    if (W.events.length < 200) W.events.push({ type, ...(data || {}) });
  };
  W.hurt = (fx, fz, kind) => hurt(W, fx, fz, kind);
  W.standOn = (solid) => {
    if (solid.owner && solid.owner.kind) standOnPlatform(W, solid.owner);
  };
  W.stompShot = (s) => {
    stompBounce(W.player, W.lastInput.jumpHeld);
    W.stats.stomps++;
    W.emit("stomp", { x: s.x, y: s.y, z: s.z, shot: true });
  };
  W.lastInput = { jumpHeld: false };

  /* static level geometry */
  W.platforms = (level.platforms || []).map((d) => createPlatform(W, d));
  W.blocks = (level.blocks || []).map((b, i) => {
    const solid = addSolid(W.solids, { x: b.x, y: b.y, z: b.z, hx: 0.55, hy: 0.55, hz: 0.55, surf: "stone" });
    const blk = { idx: i, kind: b.kind || "q", item: b.item || "coin", left: b.count || 1, used: false, bumpT: 0, solid, x: b.x, y: b.y, z: b.z, hidden: !!b.hidden };
    if (blk.hidden) {
      solid.active = false; // invisible block: appears when bonked from below
      solid.reveal = true;
    }
    solid.owner = { kind: "block", blk };
    return blk;
  });
  W.pipes = (level.pipes || []).map((d, i) => {
    const solid = addSolid(W.solids, { shape: "cyl", x: d.x, y: d.y + (d.h ?? 2) / 2, z: d.z, r: d.r ?? 1.05, hy: (d.h ?? 2) / 2, surf: "metal" });
    const pipe = { idx: i, x: d.x, z: d.z, base: d.y, top: d.y + (d.h ?? 2), h: d.h ?? 2, r: d.r ?? 1.05, to: d.to, solid, secret: !!d.secret };
    solid.owner = { kind: "pipe", pipe };
    return pipe;
  });
  for (const s of level.solids || []) addSolid(W.solids, s);
  W.hazards = (level.hazards || []).map((d, i) => createHazard(W, d, i));

  W.coins = (level.coins || []).map((c, i) => ({ id: i, x: c[0], y: c[1], z: c[2], hx: c[0], hy: c[1], hz: c[2], taken: false, mag: false }));
  W.coinTotal = W.coins.length + W.blocks.reduce((n, b) => n + (b.item === "coin" ? b.left : 0), 0);
  W.coinGoal = level.coinGoal ?? Math.max(1, Math.round(W.coinTotal * 0.7));
  W.pickups = (level.pickups || []).map((d, i) => ({ idx: i, type: d.type, x: d.x, y: d.y, z: d.z, taken: false, rise: 0, fromBlock: false }));
  W.checkpoints = (level.checkpoints || []).map((c, i) => ({ idx: i, x: c[0], y: c[1], z: c[2], yaw: c[3] ?? 0, active: false, t: 0 }));
  W.star = level.star ? { x: level.star[0], y: level.star[1], z: level.star[2], taken: false } : null;
  W.goal = level.goal ? { x: level.goal[0], y: level.goal[1], z: level.goal[2], h: level.goal[3] ?? 7, hidden: !!level.boss } : null;
  W.signs = (level.signs || []).map((s, i) => ({ idx: i, ...s }));
  W.enemies = (level.enemies || []).map((d, i) => createEnemy(d, W, i));
  W.boss = level.boss ? createBoss(W, level.boss) : null;

  const [sx, sy, sz] = level.spawn;
  W.player = createPlayer(sx, sy, sz, level.spawnYaw ?? 0);
  W.cam = createCamera(W.player, level.spawnYaw ?? 0);
  startRun(W);
  return W;
}

function startRun(W) {
  const level = W.level;
  const [sx, sy, sz] = level.spawn;
  resetPlayer(W.player, sx, sy, sz, level.spawnYaw ?? 0);
  W.hearts = P.HEARTS;
  W.coinCount = 0;
  W.starFound = false;
  W.state = "play"; // play | falling | dying | gameover | goal | complete
  W.stateT = 0;
  W.checkpoint = { x: sx, y: sy, z: sz, yaw: level.spawnYaw ?? 0, idx: -1 };
  W.time = 0;
  W.prompt = null;
  W.message = null;
  W.goalT = 0;
  W.power.speed = W.power.jump = W.power.star = W.power.magnet = 0;
  W.stats = { jumps: 0, stomps: 0, enemies: 0, hits: 0, falls: 0, coins: 0, blocks: 0, powerups: 0, secrets: 0, distance: 0 };
  W.shots = [];
  W.rings = [];
  W.acc = 0;
  W.pending.jump = W.pending.interact = false;
  snapCamera(W.cam, W, level.spawnYaw ?? 0);
}

export function restartWorld(W) {
  W.reseed();
  for (const pl of W.platforms) resetPlatform(pl);
  for (const b of W.blocks) {
    b.used = false;
    b.left = W.level.blocks[b.idx].count || 1;
    b.bumpT = 0;
    b.hidden = !!W.level.blocks[b.idx].hidden;
    b.solid.active = !b.hidden;
    b.solid.reveal = b.hidden;
  }
  W.coins = W.coins.filter((c) => !c.bonus);
  for (const c of W.coins) {
    c.taken = false;
    c.mag = false;
    c.x = c.hx;
    c.y = c.hy;
    c.z = c.hz;
  }
  W.pickups = W.pickups.filter((p) => !p.fromBlock);
  for (const p of W.pickups) p.taken = false;
  for (const c of W.checkpoints) c.active = false;
  if (W.star) W.star.taken = false;
  if (W.goal) W.goal.hidden = !!W.level.boss;
  for (const e of W.enemies) resetEnemy(e);
  for (const h of W.hazards) resetHazard(W, h);
  if (W.boss) resetBoss(W, W.boss);
  startRun(W);
  W.emit("restart");
}

/** Game Over → Continue: full hearts at the latest checkpoint, collected things stay collected */
export function continueFromCheckpoint(W) {
  W.hearts = P.HEARTS;
  W.state = "play";
  W.stateT = 0;
  if (W.boss) resetBoss(W, W.boss);
  W.shots = [];
  W.rings = [];
  respawn(W);
}

function respawn(W) {
  const c = W.checkpoint;
  const p = W.player;
  resetPlayer(p, c.x, c.y, c.z, c.yaw);
  p.invuln = 1.2;
  W.power.star = 0;
  snapCamera(W.cam, W, c.yaw);
  W.emit("respawn");
}

/* ------------------------------------------------------------------ damage */
function hurt(W, fx, fz, kind) {
  const p = W.player;
  if (p.dead || p.victory || p.pipe || W.state !== "play") return false;
  if (p.invuln > 0 || W.power.star > 0 || W.opts.menu) return false;
  W.hearts -= 1;
  W.stats.hits++;
  p.invuln = P.INVULN;
  p.hurtT = P.HURT_TIME;
  let dx = p.x - fx;
  let dz = p.z - fz;
  const L = Math.hypot(dx, dz);
  if (L < 1e-3) {
    dx = -Math.sin(p.yaw);
    dz = -Math.cos(p.yaw);
  } else {
    dx /= L;
    dz /= L;
  }
  p.vx = dx * 7;
  p.vz = dz * 7;
  p.vy = 8.5;
  p.grounded = false;
  p.ground = null;
  p.jumps = 1;
  W.emit("hurt", { kind });
  if (W.hearts <= 0) die(W, kind);
  return true;
}

function die(W, kind) {
  const p = W.player;
  W.hearts = 0;
  p.dead = true;
  p.deadT = 0;
  p.vx = p.vz = 0;
  p.vy = 13;
  W.state = "dying";
  W.stateT = 0;
  W.emit("die", { kind });
}

function fellOut(W) {
  const p = W.player;
  W.stats.falls++;
  W.hearts -= 1;
  W.emit("fall");
  if (W.hearts <= 0) {
    W.hearts = 0;
    p.dead = true;
    W.state = "dying";
    W.stateT = 0.8;
    W.emit("die", { kind: "fall" });
    return;
  }
  W.state = "falling";
  W.stateT = 0;
}

/* ------------------------------------------------------------------ blocks */
function bonk(W, solid) {
  const o = solid.owner;
  if (!o || o.kind !== "block") {
    W.emit("headBonk");
    return;
  }
  const b = o.blk;
  b.bumpT = 0.22;
  if (b.used) {
    W.emit("blockBump", { b, empty: true });
    return;
  }
  if (b.hidden) {
    b.hidden = false;
    b.solid.active = true;
    b.solid.reveal = false;
    W.stats.secrets++;
    W.emit("secret", { x: b.x, y: b.y, z: b.z });
  }
  if (b.item === "none") {
    W.emit("blockBump", { b, empty: true, brick: true });
    return;
  }
  W.stats.blocks++;
  if (b.item === "coin") {
    b.left -= 1;
    W.coinCount++;
    W.stats.coins++;
    W.emit("coin", { x: b.x, y: b.y + 0.9, z: b.z, fromBlock: true });
  } else {
    b.left = 0;
    // the item pops up, then hops down on Mario's side of the block
    const p = W.player;
    let dx = p.x - b.x;
    let dz = p.z - b.z;
    const L = Math.hypot(dx, dz);
    if (L < 0.2) {
      dx = -Math.sin(p.yaw);
      dz = -Math.cos(p.yaw);
    } else {
      dx /= L;
      dz /= L;
    }
    let tx = b.x + dx * 1.7;
    let tz = b.z + dz * 1.7;
    let gy = landingY(W, tx, tz, b.y);
    if (!Number.isFinite(gy)) {
      tx = b.x;
      tz = b.z;
      gy = b.y + 0.55;
    }
    const pk = { idx: W.pickups.length, type: b.item, x: b.x, y: b.y + 1.15, z: b.z, taken: false, rise: 0.0001, drop: 0, sx: b.x, sy: b.y + 1.15, sz: b.z, tx, ty: gy + 0.9, tz, fromBlock: true };
    W.pickups.push(pk);
    W.emit("itemSprout", { b, type: b.item });
  }
  // knock enemies standing on the block
  for (const e of W.enemies) {
    if (e.alive && Math.abs(e.x - b.x) < 0.9 && Math.abs(e.z - b.z) < 0.9 && Math.abs(e.y - (b.y + 0.55)) < 0.3) defeat(W, e, "bump");
  }
  if (b.left <= 0) b.used = true;
  W.emit("blockBump", { b, empty: false });
}

/** highest ground (terrain or solid top) under a point, at most a little above `fromY` */
function landingY(W, x, z, fromY) {
  const t = W.terrain.height(x, z);
  const g = groundAt(W.solids, x, z, 0.2, -1e9, fromY + 0.6);
  let y = Number.isFinite(t) && t <= fromY + 0.6 ? t : -Infinity;
  if (g > y) y = g;
  return y > W.killY ? y : -Infinity;
}

/* ------------------------------------------------------------------ the step */
export function advance(W, raw, frameDt) {
  if (raw.jump) W.pending.jump = true;
  if (raw.interact) W.pending.interact = true;
  W.acc = Math.min(W.acc + Math.min(frameDt, 0.1), STEP * MAX_STEPS);
  let n = 0;
  while (W.acc >= STEP && n < MAX_STEPS) {
    const inp = {
      ax: raw.ax,
      ay: raw.ay,
      sprint: raw.sprint,
      jumpHeld: raw.jumpHeld,
      camYaw: W.cam.yaw,
      jump: W.pending.jump,
      interact: W.pending.interact,
    };
    W.pending.jump = W.pending.interact = false;
    step(W, inp, STEP);
    W.acc -= STEP;
    n++;
  }
  return n;
}

const PICK_R2 = 1.1 * 1.1;

export function step(W, inp, dt) {
  W.clock += dt;
  W.stateT += dt;
  W.lastInput = inp;
  const p = W.player;
  const pw = W.power;
  const playing = W.state === "play";
  if (playing) W.time += dt;

  for (const pl of W.platforms) stepPlatform(W, pl, dt);
  for (const h of W.hazards) stepHazard(W, h, dt);

  const px0 = p.x;
  const pz0 = p.z;
  const pyPrev = p.y;
  // the player is frozen while warping / during the goal pose
  const pin = playing ? inp : { ax: 0, ay: 0, camYaw: inp.camYaw, jumpHeld: false };
  if (!p.pipe) {
    stepPlayer(W, pin, dt);
  }
  W.stats.distance += Math.hypot(p.x - px0, p.z - pz0);

  // events raised by the controller that the world resolves right away
  for (let i = 0; i < W.events.length; i++) {
    const ev = W.events[i];
    if (ev.done) continue;
    if (ev.type === "bonk") {
      ev.done = true;
      bonk(W, ev.solid);
    } else if (ev.type === "jump") {
      ev.done = true;
      W.stats.jumps++;
    }
  }

  for (const k of ["speed", "jump", "star", "magnet"]) {
    if (pw[k] > 0) {
      pw[k] -= dt;
      if (pw[k] <= 0) {
        pw[k] = 0;
        W.emit("powerEnd", { power: k });
      }
    }
  }
  for (const b of W.blocks) if (b.bumpT > 0) b.bumpT -= dt;

  /* coins */
  const cy = p.y + 0.75;
  for (const c of W.coins) {
    if (c.taken) continue;
    const dx = p.x - c.x;
    const dy = cy - c.y;
    const dz = p.z - c.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (pw.magnet > 0 && d2 < MAGNET_R * MAGNET_R) c.mag = true;
    if (c.mag) {
      const L = Math.sqrt(d2) || 1;
      const sp = Math.min(L / dt, 16 + (MAGNET_R - L) * 2);
      c.x += (dx / L) * sp * dt;
      c.y += (dy / L) * sp * dt;
      c.z += (dz / L) * sp * dt;
    }
    if (d2 < PICK_R2 && !p.dead) {
      c.taken = true;
      W.coinCount++;
      W.stats.coins++;
      W.emit("coin", { x: c.x, y: c.y, z: c.z, id: c.id });
      if (W.coinCount === W.coinGoal) W.emit("coinGoal");
    }
  }

  /* pickups (power-ups and hearts) */
  for (const k of W.pickups) {
    if (k.taken) continue;
    if (k.rise > 0 && k.rise < 1) {
      k.rise = Math.min(1, k.rise + dt * 2.2);
      continue;
    }
    if (k.fromBlock && k.drop < 1) {
      k.drop = Math.min(1, k.drop + dt * 2.4);
      const u = k.drop;
      k.x = k.sx + (k.tx - k.sx) * u;
      k.z = k.sz + (k.tz - k.sz) * u;
      k.y = k.sy + (k.ty - k.sy) * u + Math.sin(u * Math.PI) * 1.1;
    }
    const dx = p.x - k.x;
    const dy = cy - k.y;
    const dz = p.z - k.z;
    if (dx * dx + dy * dy + dz * dz < 1.25 * 1.25 && !p.dead) {
      k.taken = true;
      if (k.type === "heart") {
        W.hearts = Math.min(P.HEARTS, W.hearts + 1);
        W.emit("heart", { x: k.x, y: k.y, z: k.z });
      } else if (POWER[k.type]) {
        pw[k.type] = POWER[k.type].dur;
        W.stats.powerups++;
        W.emit("powerup", { power: k.type, x: k.x, y: k.y, z: k.z });
      }
    }
  }

  /* enemies */
  for (const e of W.enemies) {
    stepEnemy(W, e, dt);
    if (!e.alive || p.dead || W.state !== "play" || p.pipe) continue;
    const c = e.cfg;
    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const R = P.RADIUS + c.r * 0.92;
    if (dx * dx + dz * dz > R * R) continue;
    if (p.y > e.y + c.h || p.y + P.HEIGHT < e.y) continue;
    if (pw.star > 0) {
      defeat(W, e, "star");
      W.stats.enemies++;
      continue;
    }
    const falling = p.vy < 0 || (p.y < pyPrev && !p.grounded);
    if (falling && pyPrev >= e.y + c.h * 0.45 && stompable(e)) {
      const killed = stompEnemy(W, e);
      if (killed) W.stats.enemies++;
      W.stats.stomps++;
      stompBounce(p, inp.jumpHeld);
      p.y = Math.max(p.y, e.y + c.h * 0.6);
      W.emit("stomp", { x: e.x, y: e.y + c.h, z: e.z, e, killed });
      continue;
    }
    // harmless while helpless: shells and dizzy boars just nudge you
    if (e.state === "stunned") {
      const L = Math.sqrt(dx * dx + dz * dz) || 1;
      p.x = e.x + (dx / L) * R;
      p.z = e.z + (dz / L) * R;
      continue;
    }
    hurt(W, e.x, e.z, "enemy");
  }

  stepShots(W, dt);
  stepRings(W, dt);
  if (W.boss) stepBoss(W, W.boss, dt, inp);

  if (W.state === "play" && !p.pipe) {
    /* checkpoints */
    for (const c of W.checkpoints) {
      if (c.active) continue;
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      if (dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(p.y - c.y) < 2.5) {
        for (const o of W.checkpoints) o.active = o === c ? true : o.active;
        c.active = true;
        c.t = 0;
        W.checkpoint = { x: c.x, y: c.y + 0.05, z: c.z, yaw: p.yaw, idx: c.idx };
        W.emit("checkpoint", { x: c.x, y: c.y, z: c.z });
      }
    }
    /* hidden star */
    const s = W.star;
    if (s && !s.taken) {
      const dx = p.x - s.x;
      const dy = cy - s.y;
      const dz = p.z - s.z;
      if (dx * dx + dy * dy + dz * dz < 1.4 * 1.4) {
        s.taken = true;
        W.starFound = true;
        W.stats.secrets++;
        W.emit("hiddenStar", { x: s.x, y: s.y, z: s.z });
      }
    }
    /* goal */
    const g = W.goal;
    if (g && !g.hidden) {
      const dx = p.x - g.x;
      const dz = p.z - g.z;
      if (dx * dx + dz * dz < 1.0 * 1.0 && p.y > g.y - 0.5 && p.y < g.y + g.h + 0.3) startGoal(W);
    }
  }

  /* prompts + interaction (pipes, signs) */
  updatePrompt(W, inp);
  if (p.pipe) stepPipe(W, dt);

  /* pits, sea, lava */
  if (W.state === "play" && !p.pipe) {
    const sea = W.sea;
    if (sea.kind === "lava" && p.y < sea.y + 0.15) {
      const was = W.hearts;
      hurt(W, p.x + p.vx, p.z + p.vz, "lava");
      if (W.state === "play") {
        p.vy = 19;
        p.grounded = false;
        p.ground = null;
        p.jumps = 1;
        p.y = Math.max(p.y, sea.y + 0.16);
        W.emit("lavaBurn", { lost: W.hearts < was });
      }
    } else if (p.y < W.killY || (sea.kind === "water" && p.y < sea.y - 1.6)) {
      if (sea.kind === "water") W.emit("splash", { x: p.x, y: sea.y, z: p.z });
      fellOut(W);
    }
  }

  /* run state machine */
  if (W.state === "falling" && W.stateT > 0.75) {
    W.state = "play";
    respawn(W);
  } else if (W.state === "dying" && W.stateT > 2.4) {
    W.state = "gameover";
    W.emit("gameover");
  } else if (W.state === "goal") {
    stepGoal(W, dt);
  }
}

/* ------------------------------------------------------------------ goal sequence */
function startGoal(W) {
  const p = W.player;
  const g = W.goal;
  W.state = "goal";
  W.stateT = 0;
  W.goalT = 0;
  W.goalTurned = false;
  W.goalGrab = clamp((p.y - g.y) / g.h, 0, 1);
  p.victory = true;
  p.vx = p.vy = p.vz = 0;
  // hang on the pole, facing it
  const dx = p.x - g.x;
  const dz = p.z - g.z;
  const L = Math.hypot(dx, dz) || 1;
  p.x = g.x + (dx / L) * 0.55;
  p.z = g.z + (dz / L) * 0.55;
  p.yaw = Math.atan2(-dx, -dz);
  p.anim = "pole";
  p.grounded = false;
  W.power.star = 0;
  W.cam.mode = "goal";
  W.emit("goal", { grab: W.goalGrab });
}

function stepGoal(W, dt) {
  const p = W.player;
  const g = W.goal;
  W.goalT += dt;
  if (W.goalT < 1.1) {
    // slide down the pole
    p.anim = "pole";
    const floor = g.y;
    p.y = Math.max(floor, p.y - dt * 7.5);
  } else {
    if (!W.goalTurned) {
      W.goalTurned = true;
      p.y = g.y;
      // step off the pole's base block before the victory pose
      const dx = p.x - g.x;
      const dz = p.z - g.z;
      const L = Math.hypot(dx, dz) || 1;
      p.x = g.x + (dx / L) * 1.05;
      p.z = g.z + (dz / L) * 1.05;
      p.yaw += Math.PI; // turn to face the camera
      W.emit("victory");
    }
    p.anim = "victory";
    p.grounded = true;
  }
  if (W.goalT > 3.4 && W.state === "goal") {
    W.state = "complete";
    W.emit("complete");
  }
}

/** stars this run: clear + coin goal + hidden star (each independent) */
export function runStars(W) {
  return { clear: W.state === "complete" || W.state === "goal", coins: W.coinCount >= W.coinGoal, hidden: !!W.starFound };
}

/* ------------------------------------------------------------------ pipes & signs */
function updatePrompt(W, inp) {
  const p = W.player;
  W.prompt = null;
  if (W.state !== "play" || p.pipe || p.dead) return;
  // standing on a warp pipe
  if (p.grounded && p.ground && p.ground.owner && p.ground.owner.kind === "pipe") {
    const pipe = p.ground.owner.pipe;
    if (pipe.to != null) {
      W.prompt = { kind: "pipe", label: "Enter pipe" };
      if (inp.interact) {
        p.pipe = { from: pipe, to: W.pipes[pipe.to], t: 0, phase: "down" };
        p.vx = p.vy = p.vz = 0;
        p.x = pipe.x;
        p.z = pipe.z;
        W.emit("pipe", { pipe });
      }
      return;
    }
  }
  for (const s of W.signs) {
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    if (dx * dx + dz * dz < 2.4 * 2.4 && Math.abs(p.y - s.y) < 2) {
      W.prompt = { kind: "sign", label: "Read sign" };
      if (inp.interact) {
        W.message = { text: s.text, t: W.clock };
        W.emit("sign", { text: s.text });
      }
      return;
    }
  }
}

function stepPipe(W, dt) {
  const p = W.player;
  const w = p.pipe;
  w.t += dt;
  if (w.phase === "down") {
    p.y = w.from.top - Math.min(1.7, w.t * 2.8);
    if (w.t > 0.65) {
      w.phase = "up";
      w.t = 0;
      p.x = w.to.x;
      p.z = w.to.z;
      p.y = w.to.top - 1.7;
      W.cam.px = p.x;
      W.cam.pz = p.z;
      W.cam.py = w.to.top + 1;
      if (w.to.secret) W.emit("secretArea");
      W.emit("pipeOut", { pipe: w.to });
    }
  } else {
    p.y = w.to.top - 1.7 + Math.min(1.7, w.t * 2.8);
    if (w.t > 0.62) {
      p.y = w.to.top;
      p.pipe = null;
      p.grounded = true;
      p.ground = w.to.solid;
      p.vy = 0;
      p.invuln = Math.max(p.invuln, 0.4);
    }
  }
}

/** drain events (renderer + screen each keep their own cursor — see GameScreen) */
export function takeEvents(W) {
  const ev = W.events;
  W.events = [];
  return ev;
}
