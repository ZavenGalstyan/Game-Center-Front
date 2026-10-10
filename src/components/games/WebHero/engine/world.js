/**
 * Web Hero — one mission session. Pure JS (no DOM / three) so the headless
 * tests and the bot can play every mission.
 *
 *   createWorld(spec, { upgrades })   fresh session (city is cached per district)
 *   advance(W, inp, dt)               accumulates real time into fixed STEPs
 *   step(W, inp, dt)                  one fixed step
 *   restartWorld(W)                   full restart in place
 *
 * W.state: play → complete | failed. W.events is drained by the renderer.
 */
import { STEP, MAX_STEPS, ENERGY_MAX, H } from "./config.js";
import { floorAt } from "./collide.js";
import { buildCity } from "./city.js";
import { createHero, stepHero } from "./hero.js";
import { stepCombat, stepWebs, stepZip, stepStorm } from "./combat.js";
import { stepEnemies, threatTime } from "./enemies.js";
import { stepBoss } from "./bosses.js";
import { startMission, stepMission, stepRunners, waypoints } from "./missions.js";
import { createCamera } from "./camera.js";

const cities = new Map();
export function cityFor(key) {
  if (!cities.has(key)) cities.set(key, buildCity(key, 1));
  return cities.get(key);
}

export function createWorld(spec, opts = {}) {
  const W = { spec, opts };
  reset(W);
  return W;
}

function reset(W) {
  const spec = W.spec;
  const up = W.opts.upgrades || {};
  W.city = cityFor(spec.district);
  W.geo = W.city.geo;
  W.hero = createHero(spec.spawn, up);
  W.enemies = [];
  W.civilians = [];
  W.devices = [];
  W.intel = [];
  W.webs = [];
  W.shots = [];
  W.heals = (spec.heals || []).map((p) => ({ ...p, got: false }));
  W.tokens = (spec.tokens || []).map((p, i) => ({ ...p, idx: i, got: false }));
  W.events = [];
  W.boss = null;
  W.protect = null;
  W.prompt = null;
  W.t = 0;
  W.acc = 0;
  W.time = 0;
  W.state = "play";
  W.stateT = 0;
  W.hitStop = 0;
  W.energy = 0;
  W.combo = 0;
  W.comboT = 0;
  W.score = 0;
  W.xp = 0;
  W.cool = { shot: 0, trap: 0, pull: 0, strike: 0, shield: 0, burst: 0 };
  W.storm = null;
  W.dmgScale = spec.dmgScale || 1;
  W.hpScale = spec.hpScale || 1;
  W.stats = { defeated: 0, damage: 0, damageTaken: 0, hits: 0, rescues: 0, swings: 0, webs: 0, dodges: 0, perfect: 0, abilities: 0, storms: 0, maxCombo: 0, tokens: 0, heals: 0, distance: 0 };
  W.seed = 12345;
  W.rand = () => {
    W.seed = (W.seed * 16807) % 2147483647;
    return (W.seed - 1) / 2147483646;
  };
  W.gainEnergy = (n) => {
    W.energy = Math.min(ENERGY_MAX, W.energy + n);
  };
  W.threatWithin = (win) => threatTime(W) <= win;
  W.damageHero = (dmg, fx, fz, kind, ignoreI, enemy) => damageHero(W, dmg, fx, fz, kind, ignoreI, enemy);
  W.onEnemyDefeated = (e) => {
    // fighters sometimes drop a health orb
    if (!e.boss && W.rand() < 0.3) W.heals.push({ x: e.x, y: e.y + 0.6, z: e.z, got: false, drop: true });
  };
  W.cam = W.cam || createCamera();
  W.cam.snap = true;
  W.cam.yaw = spec.spawn.h || 0;
  W.hero.chain = [];
  startMission(W, spec);
  // start facing the first objective (camera behind the hero, looking at it)
  const wp = waypoints(W)[0];
  if (wp && Math.hypot(wp.x - W.hero.x, wp.z - W.hero.z) > 3) {
    const yaw = Math.atan2(wp.x - W.hero.x, wp.z - W.hero.z);
    W.hero.facing = yaw;
    W.cam.yaw = yaw;
  }
}

export function restartWorld(W) {
  reset(W);
  W.events.push({ type: "restart" });
}

/* ------------------------------------------------------------------ stepping */

export function advance(W, inp, dt) {
  W.acc = Math.min(W.acc + dt, STEP * MAX_STEPS);
  let first = true;
  while (W.acc >= STEP) {
    W.acc -= STEP;
    step(W, first ? inp : { ...inp, jump: false, light: false, heavy: false, web: false, dodge: false, special: false, ab1: false, ab2: false, ab3: false, ab4: false, ab5: false, interact: false }, STEP);
    first = false;
  }
}

export function step(W, inp, dt) {
  W.t += dt;
  W.stateT += dt;
  W.lastInput = inp;
  if (W.state !== "play") {
    // keep the hero settling (victory pose / defeat) but nothing else
    if (W.state === "complete" && W.hero.action !== "victory") {
      W.hero.action = "victory";
      W.hero.actT = 0;
    }
    stepHero(W, { mx: 0, my: 0, camYaw: inp.camYaw }, dt);
    return;
  }
  W.time += dt;
  // hit-stop freezes the action for a few frames (impact feel)
  if (W.hitStop > 0) {
    W.hitStop -= dt;
    return;
  }
  const h = W.hero;
  let hin = inp;
  if (W.forceRelease) {
    hin = { ...inp, swing: false };
    W.forceRelease = false;
  }
  h.webPose = Math.max(0, (h.webPose || 0) - dt);
  const ox = h.x;
  const oz = h.z;
  if (!stepZip(W, dt)) stepHero(W, hin, dt);
  stepCombat(W, hin, dt);
  stepWebs(W, dt);
  stepStorm(W, dt);
  stepRunners(W, dt);
  stepEnemies(W, dt);
  stepBoss(W, dt);
  pickups(W, dt);
  civilians(W, dt);
  stepMission(W, dt, hin);
  W.stats.distance += Math.hypot(h.x - ox, h.z - oz);
  const M = W.mission;
  if (M.done && W.state === "play") {
    W.state = "complete";
    W.stateT = 0;
    h.action = "victory";
    h.actT = 0;
    W.xp += W.spec.xp || 150;
    W.events.push({ type: "victory" });
  } else if (M.failed && W.state === "play") {
    W.state = "failed";
    W.stateT = 0;
  }
  if (h.action === "defeated" && h.actT > 1.6 && W.state === "play") {
    W.mission.failed = "You were defeated!";
    W.state = "failed";
  }
}

/* ------------------------------------------------------------------ damage */

function damageHero(W, dmg, fx, fz, kind, ignoreI, enemy) {
  const h = W.hero;
  if (h.action === "defeated" || W.state !== "play") return false;
  if (h.shieldT > 0 && kind !== "fall") {
    W.events.push({ type: "shieldBlock", x: h.x, y: h.y + 1, z: h.z });
    if (enemy && !enemy.boss) {
      enemy.state = "stunned";
      enemy.t = 0;
      enemy.stun = 1.2;
    }
    return false;
  }
  if (!ignoreI && (h.iframes > 0 || h.action === "dodge" || h.zip || h.mode === "ledge")) {
    if (h.action === "dodge") W.events.push({ type: "dodged", x: h.x, y: h.y + 1, z: h.z });
    return false;
  }
  h.hp = Math.max(0, h.hp - dmg);
  W.stats.damageTaken += dmg;
  W.stats.hits++;
  h.iframes = H.hitIframes;
  W.combo = 0;
  if (h.mode === "climb" || h.mode === "wallrun" || h.mode === "swing") {
    h.mode = "air";
    h.swing = null;
    h.wall = null;
  }
  const dx = h.x - fx;
  const dz = h.z - fz;
  const l = Math.hypot(dx, dz) || 1;
  if (h.hp <= 0) {
    h.action = "defeated";
    h.actT = 0;
    h.vx = (dx / l) * 4;
    h.vz = (dz / l) * 4;
    W.events.push({ type: "heroDefeated" });
    return true;
  }
  if (kind === "heavy") {
    h.action = "knockdown";
    h.vx = (dx / l) * 9;
    h.vz = (dz / l) * 9;
    h.vy = 6;
    h.grounded = false;
  } else if (kind !== "fall") {
    h.action = "hurt";
    h.vx = (dx / l) * 4;
    h.vz = (dz / l) * 4;
  }
  h.actT = 0;
  h.atk = null;
  W.events.push({ type: "heroHurt", x: h.x, y: h.y + 1.2, z: h.z, dmg, kind });
  return true;
}

/* ------------------------------------------------------------------ pickups + civilians */

function pickups(W) {
  const h = W.hero;
  for (const p of W.heals) {
    if (p.got) continue;
    if (Math.hypot(h.x - p.x, h.y + 1 - p.y, h.z - p.z) < 1.8) {
      p.got = true;
      h.hp = Math.min(h.maxHp, h.hp + 25);
      W.stats.heals++;
      W.events.push({ type: "heal", x: p.x, y: p.y, z: p.z });
    }
  }
  for (const t of W.tokens) {
    if (t.got) continue;
    if (Math.hypot(h.x - t.x, h.y + 1 - t.y, h.z - t.z) < 2) {
      t.got = true;
      W.stats.tokens++;
      W.xp += 60;
      W.score += 500;
      W.events.push({ type: "token", x: t.x, y: t.y, z: t.z, n: W.tokens.filter((k) => k.got).length });
    }
  }
}

const civFl = {};
function civilians(W, dt) {
  for (const c of W.civilians) {
    c.t += dt;
    if (c.state === "rescued" && c.t > 0.8) {
      // walk off to safety
      c.state = "safe";
    }
    if (c.state === "safe" && c.t < 7) {
      // walk off to safety — only where there is floor at the same height
      const nx = c.x + Math.sin(c.id * 2.1) * 2.2 * dt;
      const nz = c.z + Math.cos(c.id * 2.1) * 2.2 * dt;
      if (floorAt(W.geo, nx, nz, c.y + 0.4, c.y - 0.4, civFl) && Math.abs(civFl.y - c.y) < 0.4) {
        c.x = nx;
        c.z = nz;
      }
    }
  }
}

/* ------------------------------------------------------------------ results */

export function runSummary(W) {
  const s = W.stats;
  const par = W.spec.par || 180;
  const timeK = Math.max(0, Math.min(1, 1 - (W.time - par) / par));
  const base = W.score + Math.round(timeK * 3000) + s.maxCombo * 40 - Math.round(s.damageTaken * 6);
  const score = Math.max(0, base);
  const k = 0.4 * timeK + 0.25 * Math.max(0, 1 - s.damageTaken / 120) + 0.15 * Math.min(1, s.maxCombo / 12) + 0.2 * (W.tokens.length ? W.tokens.filter((t) => t.got).length / W.tokens.length : 1);
  const grade = k >= 0.78 ? "S" : k >= 0.6 ? "A" : k >= 0.42 ? "B" : "C";
  return {
    time: W.time,
    par,
    defeated: s.defeated,
    rescues: s.rescues,
    damageTaken: Math.round(s.damageTaken),
    maxCombo: s.maxCombo,
    perfect: s.perfect,
    swings: s.swings,
    tokens: W.tokens.map((t) => t.got),
    xp: W.xp,
    score,
    grade,
  };
}
