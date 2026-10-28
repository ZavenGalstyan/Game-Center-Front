/**
 * Actors driven by AI: enemies, allies (companions, siege troops), NPCs and
 * wildlife.
 *
 * Enemy FSM
 *   idle / patrol ─ sees (fov cone + LOS, distance-scaled awareness) or hears
 *   (sprinting, combat noise) ─▶ suspicious ─▶ chase (direct steer when the nav
 *   line is clear, A* path otherwise) ─▶ engage (circle / strafe at their
 *   spacing, waiting for one of the limited attack tokens) ─▶ attack
 *   (windup = telegraph ▶ strike ▶ recover = your opening) … stagger, flee at
 *   low health, return home past the leash (healing), die.
 * Ranged enemies hold `prefer` spacing and back off when crowded; wolves
 * circle as a pack and hit-and-run; uniques add leaps, waves, eruptions,
 * summons; Garrick yields.
 */
import { ENEMIES, killXp } from "../data/enemies.js";
import { wrapAngle, approachAngle, clamp } from "./math.js";
import { applyDamage, meleeSweep, spawnProjectile, spawnZone, foesOf, stepStatus } from "./combat.js";
import { integrate } from "./player.js";

const TOKENS = 2;

/* ================================================================ creation */
export function createEnemy(G, type, x, z, o = {}) {
  const def = ENEMIES[type];
  const R = G.rand;
  const y = G.ground(x, z, o.interior ? 1 : 1e9);
  const lvl = o.level || def.level;
  const k = 1 + 0.1 * (lvl - def.level);
  const e = {
    id: G.nextId++,
    kind: "enemy",
    type,
    def,
    name: def.name,
    team: "hostile",
    boss: !!def.boss,
    unique: def.unique ? type : null,
    tag: o.tag || null,
    group: o.group || null,
    x,
    y,
    z,
    yaw: o.yaw ?? R() * Math.PI * 2,
    vx: 0,
    vz: 0,
    vy: 0,
    kx: 0,
    kz: 0,
    r: def.creature === "wolf" ? 0.55 * (def.scale || 1) : 0.42 * (def.look?.scale || 1),
    h: def.creature === "wolf" ? 1.0 * (def.scale || 1) : 1.8 * (def.look?.scale || 1),
    onGround: true,
    airT: 0,
    interior: o.interior || null,
    level: lvl,
    hp: Math.round(def.hp * k),
    maxHp: Math.round(def.hp * k),
    dmg: def.dmg * k,
    armor: def.armor,
    poise: def.poise,
    poiseMax: def.poise,
    blockChance: def.blockChance || 0,
    status: {},
    state: o.guard ? "guard" : o.patrol ? "patrol" : "idle",
    t: 0,
    home: { x, z, yaw: o.yaw ?? 0 },
    patrol: o.patrol || null,
    pi: 0,
    target: null,
    aware: 0,
    lastSeen: null,
    path: null,
    pathT: 0,
    atk: null,
    atkCd: 1 + R(),
    cds: {},
    strafe: R() < 0.5 ? 1 : -1,
    hitFlash: 0,
    dead: false,
    deadT: 0,
    combatT: 0,
    mat: def.look?.undead ? "bone" : def.look?.armor?.chest === "dark" || def.look?.armor?.chest === "plate" ? "metal" : "flesh",
    look: o.look || (def.looks ? def.looks[Math.floor(R() * def.looks.length)] : null),
    weapon: def.weapons ? def.weapons[Math.floor(R() * def.weapons.length)] : null,
    snow: !!o.snow,
    speed: 0,
  };
  if (def.shield && R() < 0.6) e.shield = def.shield;
  if (def.look?.undead) e.weakTo = "fire";
  e.stagger = (t, why) => {
    if (e.dead || e.state === "yield") return;
    if (e.boss && why === "fear") return;
    e.state = "stagger";
    e.t = 0;
    e.staggerDur = t;
    e.staggerWhy = why;
    if (e.atk) releaseToken(G, e);
    e.atk = null;
    G.emit({ type: "stagger", id: e.id, why });
  };
  e.flinch = () => {
    e.flinchT = 0.25;
  };
  e.knock = (kx, kz) => {
    const m = e.boss ? 0.25 : def.creature === "wolf" ? 1.2 : 1;
    e.kx += kx * m;
    e.kz += kz * m;
  };
  e.alert = (src) => alertEnemy(G, e, src);
  e.loseTarget = () => {
    if (e.target === G.player) {
      e.target = null;
      e.aware = 0;
      e.state = "suspicious";
      e.t = 0;
      e.lastSeen = { x: G.player.x + (G.rand() - 0.5) * 8, z: G.player.z + (G.rand() - 0.5) * 8 };
    }
  };
  e.onLethal = () => {
    if (def.yields && !G.P.flags.garrickYield) {
      e.hp = 1;
      enterYield(G, e);
      return true;
    }
    if (def.reassemble && !e.reassembled && !e.lastFire && G.rand() < 0.55) {
      e.reassembled = true;
      e.hp = 1;
      e.state = "collapsed";
      e.t = 0;
      if (e.atk) releaseToken(G, e);
      e.atk = null;
      G.emit({ type: "collapse", id: e.id, x: e.x, y: e.y, z: e.z });
      return true;
    }
    return false;
  };
  e.die = (src) => killEnemy(G, e, src);
  return e;
}

/* ================================================================ perception */
function canSee(G, e, t) {
  if (!t || t.dead) return false;
  if (t.interior !== e.interior) return false;
  const dx = t.x - e.x;
  const dz = t.z - e.z;
  const d = Math.hypot(dx, dz);
  let sight = e.def.sight * (G.isNight() && !e.interior ? 0.7 : 1);
  if (t === G.player && t.buffs.vanish > 0) sight = 2.2;
  if (d > sight) return false;
  const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - e.yaw));
  if (d > 4 && ang > e.def.fov / 2 && e.state !== "chase" && e.state !== "engage" && e.state !== "attack") return false;
  return G.W.col.los(e.x, e.y + e.h * 0.85, e.z, t.x, t.y + 1.4, t.z);
}
function alertEnemy(G, e, src) {
  if (e.dead || e.state === "yield" || e.state === "collapsed") return;
  const tgt = src && src.team === "player" ? src : G.player;
  if (tgt === G.player && G.player.buffs.vanish > 0 && Math.hypot(tgt.x - e.x, tgt.z - e.z) > 3) return;
  const was = e.target;
  e.target = tgt;
  e.aware = 1;
  e.lastSeen = { x: tgt.x, z: tgt.z };
  if (e.state === "idle" || e.state === "patrol" || e.state === "guard" || e.state === "suspicious" || e.state === "return") {
    e.state = "chase";
    e.t = 0;
  }
  if (!was) {
    G.emit({ type: "alert", id: e.id, x: e.x, y: e.y + e.h + 0.4, z: e.z, beast: e.def.creature === "wolf", boss: e.boss });
    // the group hears the shout
    for (const o of G.enemies) if (o !== e && !o.dead && !o.target && o.interior === e.interior && Math.hypot(o.x - e.x, o.z - e.z) < 18) {
      o.target = tgt;
      o.aware = 1;
      o.lastSeen = { x: tgt.x, z: tgt.z };
      if (["idle", "patrol", "guard", "suspicious"].includes(o.state)) {
        o.state = "chase";
        o.t = G.rand() * 0.4;
      }
    }
    if (e.boss) G.emit({ type: "bossAggro", id: e.id, name: e.name, etype: e.type });
  }
}
function enterYield(G, e) {
  e.state = "yield";
  e.t = 0;
  if (e.atk) releaseToken(G, e);
  e.atk = null;
  G.setFlag("garrickYield", true);
  G.emit({ type: "yield", id: e.id });
  for (const o of G.enemies) if (o !== e && !o.dead && o.def.faction === "redhand" && Math.hypot(o.x - e.x, o.z - e.z) < 70) {
    o.state = "flee";
    o.t = 0;
    o.surrender = true;
  }
  G.forceDialogue("garrick", e);
}

/* ================================================================ tokens */
function takeToken(G, e) {
  if (e.boss || e.tokenHeld) return true;
  const max = e.def.creature === "wolf" ? 3 : TOKENS;
  const n = G.enemies.reduce((s, o) => s + (o.tokenHeld && o.target === e.target ? 1 : 0), 0);
  if (n >= max) return false;
  e.tokenHeld = true;
  return true;
}
function releaseToken(G, e) {
  e.tokenHeld = false;
}

/* ================================================================ movement */
function steerTo(G, e, tx, tz, speed, dt, face = true) {
  let gx = tx;
  let gz = tz;
  // path if the straight line is blocked
  e.pathT -= dt;
  const nav = G.W.nav;
  const direct = nav.clear(e.x, e.z, tx, tz);
  if (!direct) {
    if (!e.path || e.pathT <= 0 || (e.pathGoal && Math.hypot(e.pathGoal.x - tx, e.pathGoal.z - tz) > 3)) {
      e.path = nav.path(e.x, e.z, tx, tz, 2600);
      e.pathT = 0.8 + G.rand() * 0.4;
      e.pathGoal = { x: tx, z: tz };
    }
    if (e.path && e.path.length) {
      while (e.path.length > 1 && Math.hypot(e.path[0][0] - e.x, e.path[0][1] - e.z) < 1.2) e.path.shift();
      gx = e.path[0][0];
      gz = e.path[0][1];
    }
  } else e.path = null;
  const dx = gx - e.x;
  const dz = gz - e.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) {
    e.vx *= 0.7;
    e.vz *= 0.7;
    return d;
  }
  const s = e.status.root > 0 ? 0 : speed * (e.status.slow > 0 ? 0.6 : 1) * (e.status.fear > 0 ? 0.5 : 1);
  const want = Math.atan2(dx, dz);
  if (face) e.yaw = approachAngle(e.yaw, want, 7 * dt);
  const acc = 18 * dt;
  e.vx += clamp((dx / d) * s - e.vx, -acc, acc);
  e.vz += clamp((dz / d) * s - e.vz, -acc, acc);
  return d;
}
function stop(e, k = 0.75) {
  e.vx *= k;
  e.vz *= k;
}

/* ================================================================ attacks */
function chooseAttack(G, e, dist) {
  const opts = e.def.attacks.filter((a) => {
    if ((e.cds[a.id] || 0) > 0) return false;
    if (a.kind === "howl") return !e.howls && e.hp < e.maxHp * 0.6;
    if (a.kind === "summon") return e.hp < e.maxHp * (e.summons ? 0.25 : 0.55) && (e.summons || 0) < 2;
    if (a.leap) return dist > 5 && dist < a.range;
    if (a.kind === "wave" || a.kind === "eruption") return dist > 5;
    return dist <= a.range + 0.3;
  });
  if (!opts.length) return null;
  // specials first when available
  const special = opts.find((a) => a.kind === "summon" || a.kind === "howl");
  if (special) return special;
  let sum = opts.reduce((s, a) => s + (a.weight || 1), 0);
  let r = G.rand() * sum;
  for (const a of opts) {
    r -= a.weight || 1;
    if (r <= 0) return a;
  }
  return opts[0];
}
function beginAttack(G, e, a) {
  const t = e.target;
  e.state = "attack";
  e.t = 0;
  e.atk = { def: a, phase: "windup", t: 0, hitDone: false, chainLeft: a.chain || 0, tx: t.x, tz: t.z };
  e.yaw = Math.atan2(t.x - e.x, t.z - e.z);
  const wind = a.windup * (e.enraged ? 0.8 : 1);
  e.atk.windup = wind;
  if (a.tele) {
    const L = a.kind === "lunge" ? a.lunge + 1 : a.range;
    if (a.tele === "circle") {
      const cx = a.leap ? t.x : e.x + Math.sin(e.yaw) * Math.min(a.range, 2);
      const cz = a.leap ? t.z : e.z + Math.cos(e.yaw) * Math.min(a.range, 2);
      e.atk.cx = cx;
      e.atk.cz = cz;
      e.atk.tele = G.emitTele({ shape: "circle", x: cx, z: cz, y: e.y, r: a.radius || a.range, dur: wind, interior: !!e.interior, frost: a.frost });
    } else if (a.tele === "cone") e.atk.tele = G.emitTele({ shape: "cone", x: e.x, z: e.z, y: e.y, r: a.range + 0.5, yaw: e.yaw, half: a.arc / 2, dur: wind, interior: !!e.interior });
    else e.atk.tele = G.emitTele({ shape: "line", x: e.x, z: e.z, y: e.y, r: a.kind === "wave" ? 1.6 : 0.9, len: L, yaw: e.yaw, dur: wind, interior: !!e.interior });
  }
  G.emit({ type: "enemyWindup", id: e.id, atk: a.id, heavy: !!a.heavy, x: e.x, y: e.y, z: e.z, fire: !!a.fire });
}
function strike(G, e) {
  const A = e.atk.def;
  const dmg = e.dmg * A.mult * (0.92 + G.rand() * 0.16);
  const fire = !!A.fire;
  const frost = !!A.frost;
  switch (A.kind) {
    case "melee":
    case "cleave": {
      for (const t of meleeSweep(G, e, { range: A.range, arc: A.arc })) applyDamage(G, e, t, dmg, { kind: "melee", fire, frost, stagger: A.heavy ? 50 : 20, knock: A.knock || (A.heavy ? 4 : 1), heavy: A.heavy, burnChance: 0.25 });
      G.emit({ type: "enemySwing", id: e.id, heavy: !!A.heavy, x: e.x, y: e.y, z: e.z });
      break;
    }
    case "lunge":
      e.lungeT = 0.24;
      e.lungeV = A.lunge / 0.24;
      e.lungeHit = false;
      G.emit({ type: "wolfLunge", id: e.id, x: e.x, y: e.y, z: e.z });
      break;
    case "shoot": {
      const t = e.target;
      const o = { x: e.x + Math.sin(e.yaw) * 0.5, y: e.y + e.h * 0.8, z: e.z + Math.cos(e.yaw) * 0.5 };
      // lead the target a little, with a little scatter
      const tt = Math.hypot(t.x - o.x, t.z - o.z) / A.speed;
      const ax = t.x + t.vx * tt * 0.6 + (G.rand() - 0.5) * 0.8;
      const az = t.z + t.vz * tt * 0.6 + (G.rand() - 0.5) * 0.8;
      const ay = t.y + 1.2 + 0.5 * 4 * tt * tt;
      const dx = ax - o.x;
      const dy = ay - o.y;
      const dz = az - o.z;
      const L = Math.hypot(dx, dy, dz);
      spawnProjectile(G, { kind: A.proj === "firebolt" ? "emberbolt" : "enemyArrow", ...o, dx: dx / L, dy: dy / L, dz: dz / L, speed: A.speed, team: "hostile", dmg, src: e, gravity: A.proj === "firebolt" ? 0 : 4, life: 3, fire, stagger: 15, r: A.proj === "firebolt" ? 0.22 : 0.12 });
      break;
    }
    case "slam": {
      const cx = e.atk.cx ?? e.x + Math.sin(e.yaw) * 2;
      const cz = e.atk.cz ?? e.z + Math.cos(e.yaw) * 2;
      if (A.leap) {
        e.x = cx - Math.sin(e.yaw) * 1.2;
        e.z = cz - Math.cos(e.yaw) * 1.2;
        G.settle(e);
      }
      spawnZone(G, { kind: frost ? "frostslam" : "slam", x: cx, z: cz, y: e.y, r: A.radius || 3, dur: 0.05, tick: 0.01, once: true, dmg, team: "hostile", src: e, fire, frost, knock: 6, stagger: 60, heavy: true, tele: false, interior: e.interior });
      G.shake(0.6);
      break;
    }
    case "wave": {
      spawnZone(G, { kind: "wave", x: e.x, z: e.z, y: e.y, r: 1.6, shape: "line", len: A.range, yaw: e.yaw, dur: 0.05, tick: 0.01, once: true, dmg, team: "hostile", src: e, fire: true, knock: 5, stagger: 40, tele: false, interior: e.interior });
      break;
    }
    case "eruption": {
      const t = e.target;
      for (let k = 0; k < 5; k++) {
        const a = G.rand() * Math.PI * 2;
        const r = k === 0 ? 0 : 2 + G.rand() * 5;
        spawnZone(G, { kind: "eruption", x: t.x + Math.cos(a) * r, z: t.z + Math.sin(a) * r, y: t.y, r: A.radius, delay: 0.9 + k * 0.25, dur: 0.05, tick: 0.01, once: true, dmg, team: "hostile", src: e, fire: true, knock: 4, stagger: 30, interior: e.interior });
      }
      break;
    }
    case "summon": {
      e.summons = (e.summons || 0) + 1;
      G.emit({ type: "summon", id: e.id, x: e.x, y: e.y, z: e.z });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + G.rand();
        G.spawnEnemy("undead", e.x + Math.cos(a) * 5, e.z + Math.sin(a) * 5, { interior: e.interior, group: e.group, summoned: true }).alert(G.player);
      }
      break;
    }
    case "howl": {
      G.emit({ type: "howl", id: e.id, x: e.x, y: e.y, z: e.z });
      for (const o of G.enemies) if (!o.dead && o.def.creature === "wolf" && Math.hypot(o.x - e.x, o.z - e.z) < 30) {
        o.buffT = 10;
        o.alert(G.player);
      }
      if (!e.howls) {
        e.howls = 1;
        G.spawnEnemy("wolf", e.x + (G.rand() - 0.5) * 16, e.z + (G.rand() - 0.5) * 16, { group: e.group, summoned: true }).alert(G.player);
      }
      break;
    }
  }
}

/* ================================================================ step */
export function stepEnemy(G, e, dt) {
  const def = e.def;
  e.hitFlash = Math.max(0, e.hitFlash - dt);
  e.flinchT = Math.max(0, (e.flinchT || 0) - dt);
  e.combatT = Math.max(0, e.combatT - dt);
  e.buffT = Math.max(0, (e.buffT || 0) - dt);
  for (const k of Object.keys(e.cds)) e.cds[k] = Math.max(0, e.cds[k] - dt);
  e.atkCd = Math.max(0, e.atkCd - dt);
  e.lastFire = !!e.status.burn;
  if (e.dead) {
    e.deadT += dt;
    stop(e, 0.9);
    return;
  }
  stepStatus(G, e, dt);
  if (e.dead) return;
  e.kx *= Math.exp(-5 * dt);
  e.kz *= Math.exp(-5 * dt);
  e.t += dt;
  const P = G.player;
  e.enraged = e.boss && e.hp < e.maxHp * 0.4;
  e.dmgMult = (e.buffT > 0 ? 1.25 : 1) * (e.enraged ? 1.15 : 1);
  // ------------------------------------------------- perception
  if (!e.target && !["yield", "collapsed", "stagger", "return", "flee"].includes(e.state)) {
    const vis = canSee(G, e, P);
    if (vis) {
      const d = Math.hypot(P.x - e.x, P.z - e.z);
      const rate = (1.6 - d / def.sight) * (P.sprinting ? 1.6 : 1) * (G.isNight() ? 0.75 : 1);
      e.aware += Math.max(0.25, rate) * dt * 1.4;
      if (e.state !== "suspicious" && e.aware > 0.35) {
        e.state = "suspicious";
        e.t = 0;
        G.emit({ type: "suspicious", id: e.id, x: e.x, y: e.y + e.h + 0.4, z: e.z });
      }
      e.lastSeen = { x: P.x, z: P.z };
      if (e.aware >= 1 || d < 3.5) alertEnemy(G, e, P);
    } else {
      e.aware = Math.max(0, e.aware - dt * 0.15);
      // hearing
      const d = Math.hypot(P.x - e.x, P.z - e.z);
      if (P.interior === e.interior && P.buffs.vanish <= 0 && ((P.sprinting && d < def.hear) || (G.noiseT > 0 && Math.hypot(G.noise.x - e.x, G.noise.z - e.z) < def.hear * 1.4))) {
        if (e.state !== "suspicious") G.emit({ type: "suspicious", id: e.id, x: e.x, y: e.y + e.h + 0.4, z: e.z });
        e.state = "suspicious";
        e.t = 0;
        e.lastSeen = G.noiseT > 0 ? { x: G.noise.x, z: G.noise.z } : { x: P.x, z: P.z };
        e.aware = Math.max(e.aware, 0.5);
      }
    }
  }
  // allies can draw aggro too
  if (e.target && e.target !== P && (e.target.dead || e.target.downed)) e.target = P.dead ? null : P;
  if (e.target === P && P.dead) {
    e.target = null;
    e.state = "return";
  }
  // ------------------------------------------------- states
  const runSpd = def.run * (e.buffT > 0 ? 1.2 : 1) * (e.enraged ? 1.15 : 1);
  switch (e.state) {
    case "idle":
    case "guard":
      stop(e);
      if (e.state === "idle" && e.t > 4 + (e.id % 5)) {
        e.t = 0;
        e.yaw += (G.rand() - 0.5) * 1.6;
      }
      if (e.state === "guard") e.yaw = approachAngle(e.yaw, e.home.yaw ?? e.yaw, dt * 2);
      break;
    case "patrol": {
      const pt = e.patrol[e.pi];
      if (steerTo(G, e, pt[0], pt[1], def.walk, dt) < 1) {
        e.pi = (e.pi + 1) % e.patrol.length;
        e.state = "idle";
        e.t = 1;
        e.resumePatrol = true;
      }
      break;
    }
    case "suspicious": {
      const ls = e.lastSeen;
      if (ls && steerTo(G, e, ls.x, ls.z, def.walk * 1.4, dt) > 1.5 && e.t < 8) break;
      stop(e);
      if (e.t > 6) {
        e.aware = 0;
        e.state = "return";
        e.t = 0;
      }
      break;
    }
    case "chase": {
      const t = e.target;
      if (!t || t.dead) {
        e.state = "return";
        break;
      }
      const d = Math.hypot(t.x - e.x, t.z - e.z);
      const seen = canSee(G, e, t) || d < 6;
      if (seen) {
        e.lastSeen = { x: t.x, z: t.z };
        e.lostT = 0;
      } else e.lostT = (e.lostT || 0) + dt;
      const fromHome = Math.hypot(e.x - e.home.x, e.z - e.home.z);
      if (fromHome > def.leash && !e.boss || e.lostT > 7 || (e.boss && fromHome > def.leash)) {
        e.target = null;
        e.state = "return";
        e.t = 0;
        releaseToken(G, e);
        break;
      }
      const engage = def.prefer ? def.prefer[1] : def.creature === "wolf" ? 6 : 4.2;
      if (d <= engage && seen) {
        e.state = "engage";
        e.t = 0;
        break;
      }
      const goal = seen ? t : e.lastSeen;
      steerTo(G, e, goal.x, goal.z, runSpd, dt);
      break;
    }
    case "engage": {
      const t = e.target;
      if (!t || t.dead) {
        e.state = "return";
        break;
      }
      const dx = t.x - e.x;
      const dz = t.z - e.z;
      const d = Math.hypot(dx, dz);
      e.yaw = approachAngle(e.yaw, Math.atan2(dx, dz), 8 * dt);
      const melee = !def.prefer;
      const want = def.prefer ? (def.prefer[0] + def.prefer[1]) / 2 : def.creature === "wolf" ? 5 : 3.4;
      if (d > (def.prefer ? def.prefer[1] + 4 : 7)) {
        e.state = "chase";
        break;
      }
      // pick an attack when ready and a token is free
      if (e.atkCd <= 0 && !e.flinchT) {
        const a = chooseAttack(G, e, d - (t.r || 0.4));
        if (a && (a.kind !== "melee" && a.kind !== "cleave" && a.kind !== "lunge" ? true : takeToken(G, e)) && G.W.col.los(e.x, e.y + 1.2, e.z, t.x, t.y + 1.2, t.z)) {
          beginAttack(G, e, a);
          break;
        }
      }
      // spacing: approach to strike range, circle, or back off (ranged)
      let mvx = 0;
      let mvz = 0;
      const tx = dx / (d || 1);
      const tz = dz / (d || 1);
      if (melee) {
        const strikeRange = Math.min(...def.attacks.filter((a) => a.kind !== "howl" && a.kind !== "summon").map((a) => a.range)) * 0.9;
        const close = e.tokenHeld || e.boss ? strikeRange : want;
        if (d > close + 0.4) {
          mvx += tx;
          mvz += tz;
        } else if (d < close - 0.8) {
          mvx -= tx * 0.6;
          mvz -= tz * 0.6;
        }
      } else {
        if (d < def.prefer[0]) {
          mvx -= tx;
          mvz -= tz;
        } else if (d > def.prefer[1]) {
          mvx += tx;
          mvz += tz;
        }
      }
      // circle (wolves orbit, people strafe now and then)
      if (e.t > 2.5 + (e.id % 3)) {
        e.t = 0;
        e.strafe = -e.strafe;
      }
      const circle = def.creature === "wolf" ? 1 : e.tokenHeld ? 0.2 : 0.55;
      mvx += tz * e.strafe * circle;
      mvz += -tx * e.strafe * circle;
      const ml = Math.hypot(mvx, mvz);
      if (ml > 0.05) {
        const spd = (def.creature === "wolf" ? def.run * 0.6 : def.walk * 1.3) * (e.status.slow > 0 ? 0.6 : 1) * (e.status.root > 0 ? 0 : 1);
        const acc = 14 * dt;
        e.vx += clamp((mvx / ml) * spd - e.vx, -acc, acc);
        e.vz += clamp((mvz / ml) * spd - e.vz, -acc, acc);
      } else stop(e);
      break;
    }
    case "attack": {
      const at = e.atk;
      const A = at.def;
      at.t += dt;
      if (at.phase === "windup") {
        if (e.target && !A.leap && A.kind !== "slam" && at.t < at.windup * 0.6) e.yaw = approachAngle(e.yaw, Math.atan2(e.target.x - e.x, e.target.z - e.z), 5 * dt);
        if (A.leap) {
          // arc toward the marked circle
          const k = at.t / at.windup;
          const sx = at.sx ?? (at.sx = e.x);
          const sz = at.sz ?? (at.sz = e.z);
          const ex = at.cx - Math.sin(e.yaw) * 1.2;
          const ez = at.cz - Math.cos(e.yaw) * 1.2;
          if (k > 0.35) {
            const u = Math.min(1, (k - 0.35) / 0.65);
            e.x = sx + (ex - sx) * u;
            e.z = sz + (ez - sz) * u;
            e.leapY = Math.sin(u * Math.PI) * 3.5;
          }
          e.vx = e.vz = 0;
        } else stop(e, 0.7);
        if (at.t >= at.windup) {
          at.phase = "strike";
          at.t = 0;
          e.leapY = 0;
          strike(G, e);
        }
      } else if (at.phase === "strike") {
        if (A.kind === "lunge" && e.lungeT > 0) {
          e.lungeT -= dt;
          e.vx = Math.sin(e.yaw) * e.lungeV;
          e.vz = Math.cos(e.yaw) * e.lungeV;
          if (!e.lungeHit) {
            const hits = meleeSweep(G, e, { range: 1.3 * (def.scale || 1), arc: A.arc });
            if (hits.length) {
              e.lungeHit = true;
              for (const t of hits) applyDamage(G, e, t, e.dmg * A.mult, { kind: "melee", stagger: 30, knock: 2 });
              G.emit({ type: "bite", id: e.id, x: e.x, y: e.y, z: e.z });
            }
          }
          break;
        }
        stop(e, 0.6);
        if (at.chainLeft > 0 && at.t > 0.15) {
          at.chainLeft--;
          at.phase = "windup";
          at.t = 0;
          at.windup = A.windup * 0.7;
          if (e.target) e.yaw = Math.atan2(e.target.x - e.x, e.target.z - e.z);
          G.emit({ type: "enemyWindup", id: e.id, atk: A.id, chain: true, x: e.x, y: e.y, z: e.z });
          break;
        }
        at.phase = "recover";
        at.t = 0;
      } else {
        stop(e, 0.7);
        if (at.t >= A.recover * (e.enraged ? 0.75 : 1)) {
          releaseToken(G, e);
          e.cds[A.id] = A.cd || 0;
          e.atk = null;
          e.atkCd = (def.creature === "wolf" ? 0.6 : 0.9) + G.rand() * (e.boss ? 0.5 : 1.4);
          // wolves dart back out after a bite
          e.state = def.creature === "wolf" ? "regroup" : "engage";
          e.t = 0;
        }
      }
      break;
    }
    case "regroup": {
      const t = e.target;
      if (!t) {
        e.state = "return";
        break;
      }
      const dx = e.x - t.x;
      const dz = e.z - t.z;
      const d = Math.hypot(dx, dz) || 1;
      steerTo(G, e, t.x + (dx / d) * 7 + (dz / d) * 3 * e.strafe, t.z + (dz / d) * 7 - (dx / d) * 3 * e.strafe, def.run * 0.8, dt);
      if (e.t > 1.0) {
        e.state = "engage";
        e.t = 0;
      }
      break;
    }
    case "stagger":
      stop(e, 0.8);
      if (e.t >= e.staggerDur) {
        e.state = e.target ? "engage" : "chase";
        e.t = 0;
        e.atkCd = Math.max(e.atkCd, 0.4);
      }
      break;
    case "flee": {
      const t = e.target || P;
      const dx = e.x - t.x;
      const dz = e.z - t.z;
      const d = Math.hypot(dx, dz) || 1;
      steerTo(G, e, e.x + (dx / d) * 10, e.z + (dz / d) * 10, def.run, dt);
      if (e.surrender && e.t > 6) {
        e.dead = true;
        e.deadT = 99;
        e.despawn = true;
      } else if (!e.surrender && (e.t > 5 || d > 30)) {
        e.state = "return";
        e.t = 0;
      }
      break;
    }
    case "return": {
      e.target = null;
      releaseToken(G, e);
      const d = steerTo(G, e, e.home.x, e.home.z, def.walk * 1.6, dt);
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.15 * dt);
      if (d < 1.2 || e.t > 25) {
        e.state = e.patrol ? "patrol" : e.home.guard ? "guard" : "idle";
        e.t = 0;
        e.aware = 0;
        if (e.boss) e.hp = e.maxHp;
      }
      break;
    }
    case "yield":
      stop(e, 0.6);
      if (P && !P.dead) e.yaw = approachAngle(e.yaw, Math.atan2(P.x - e.x, P.z - e.z), dt * 3);
      break;
    case "collapsed":
      stop(e, 0.6);
      if (e.t > 4) {
        e.hp = e.maxHp * 0.4;
        e.state = "chase";
        e.t = 0;
        G.emit({ type: "reassemble", id: e.id, x: e.x, y: e.y, z: e.z });
      }
      break;
    default:
      break;
  }
  if (e.resumePatrol && e.state === "idle" && e.t > 2.5) {
    e.resumePatrol = false;
    e.state = "patrol";
  }
  // fleeing at low health (bandits and beasts lose heart; the disciplined don't)
  if (def.flee && !e.fled && e.hp < e.maxHp * def.flee && e.state !== "attack" && e.target && G.rand() < 0.5 * dt * 10) {
    e.fled = true;
    e.state = "flee";
    e.t = 0;
    releaseToken(G, e);
    G.emit({ type: "flee", id: e.id });
  }
  integrate(G, e, dt);
  e.yOff = e.leapY || 0;
  e.speed = Math.hypot(e.vx, e.vz);
}

/* ================================================================ death & loot */
function killEnemy(G, e, src) {
  if (e.dead) return;
  e.dead = true;
  e.deadT = 0;
  e.state = "dead";
  releaseToken(G, e);
  const P = G.P;
  P.stats.kills++;
  if (e.unique) P.world.dead[e.unique] = true;
  if (!e.summoned || G.rand() < 0.5) G.dropLoot(e);
  if (src === G.player || src?.team === "player" || !src) {
    const xp = killXp(e.def, e.level, P.level) * (e.summoned ? 0.4 : 1);
    G.addXp(Math.round(xp), e);
  }
  G.quests.onKill(e);
  G.emit({ type: "death", id: e.id, x: e.x, y: e.y, z: e.z, boss: e.boss, name: e.name, creature: e.def.creature, etype: e.type });
  G.groupMemberDied(e);
}

/* ================================================================ allies */
export function createAlly(G, o) {
  const a = {
    id: G.nextId++,
    kind: "ally",
    team: "player",
    name: o.name,
    companion: o.companion || null,
    x: o.x,
    y: G.ground(o.x, o.z, 1e9),
    z: o.z,
    yaw: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    kx: 0,
    kz: 0,
    r: 0.42,
    h: 1.8,
    interior: o.interior || null,
    onGround: true,
    airT: 0,
    hp: o.hp,
    maxHp: o.hp,
    armor: o.armor || 20,
    dmg: o.dmg,
    poise: 40,
    poiseMax: 40,
    status: {},
    state: "follow",
    t: 0,
    target: null,
    atkCd: 0,
    ranged: !!o.ranged,
    look: o.look,
    weapon: o.weapon,
    hitFlash: 0,
    downed: false,
    downT: 0,
    dead: false,
    mat: "flesh",
    anchor: o.anchor || null,
    speed: 0,
  };
  a.stagger = (t) => {
    a.state = "stagger";
    a.t = 0;
    a.staggerDur = t * 0.6;
  };
  a.knock = (kx, kz) => {
    a.kx += kx * 0.6;
    a.kz += kz * 0.6;
  };
  a.alert = () => {};
  a.onLethal = () => {
    a.downed = true;
    a.downT = 14;
    a.hp = 1;
    a.state = "downed";
    G.emit({ type: "allyDown", name: a.name, x: a.x, y: a.y, z: a.z });
    return true;
  };
  return a;
}

export function stepAlly(G, a, dt) {
  a.hitFlash = Math.max(0, a.hitFlash - dt);
  a.atkCd = Math.max(0, a.atkCd - dt);
  a.kx *= Math.exp(-5 * dt);
  a.kz *= Math.exp(-5 * dt);
  a.t += dt;
  stepStatus(G, a, dt);
  const P = G.player;
  if (a.downed) {
    a.downT -= dt;
    stop(a, 0.6);
    if (a.downT <= 0) {
      a.downed = false;
      a.hp = a.maxHp * 0.5;
      a.state = "follow";
      G.emit({ type: "allyUp", name: a.name });
    }
    integrate(G, a, dt);
    return;
  }
  if (a.interior !== P.interior && a.companion) {
    // companions follow you through doors
    a.interior = P.interior;
    a.x = P.x - Math.sin(P.yaw) * 2;
    a.z = P.z - Math.cos(P.yaw) * 2;
    G.settle(a);
  }
  if (a.state === "stagger") {
    stop(a, 0.8);
    if (a.t > a.staggerDur) a.state = "follow";
    integrate(G, a, dt);
    return;
  }
  // target the nearest foe that is fighting near the player (or the anchor point)
  const centre = a.anchor || P;
  if (!a.target || a.target.dead || a.target.state === "return" || Math.hypot(a.target.x - centre.x, a.target.z - centre.z) > 26) {
    a.target = null;
    let bd = 22;
    for (const e of G.enemies) {
      if (e.dead || e.interior !== a.interior || e.state === "yield" || e.state === "collapsed") continue;
      if (!e.target && !a.anchor) continue;
      const d = Math.hypot(e.x - a.x, e.z - a.z);
      if (d < bd) {
        bd = d;
        a.target = e;
      }
    }
    if (!a.target && G.dragon && !G.dragon.dead && G.dragon.hittable() && a.ranged && Math.hypot(G.dragon.x - a.x, G.dragon.z - a.z) < 40) a.target = G.dragon;
  }
  const t = a.target;
  if (t) {
    const dx = t.x - a.x;
    const dz = t.z - a.z;
    const d = Math.hypot(dx, dz) - (t.r || 0.5);
    a.yaw = approachAngle(a.yaw, Math.atan2(dx, dz), 8 * dt);
    if (a.ranged) {
      if (d < 7) steerTo(G, a, a.x - dx, a.z - dz, 4, dt, false);
      else if (d > 22) steerTo(G, a, t.x, t.z, 5, dt);
      else stop(a);
      if (a.atkCd <= 0 && d < 30 && G.W.col.los(a.x, a.y + 1.5, a.z, t.x, t.y + 1, t.z)) {
        a.atkCd = 1.5 + G.rand() * 0.6;
        a.shootT = 0.45;
        const o = { x: a.x, y: a.y + 1.5, z: a.z };
        const ty = (t.hitboxes ? t.y : t.y + 1.1) + 0.3;
        const L = Math.hypot(t.x - o.x, ty - o.y, t.z - o.z);
        spawnProjectile(G, { kind: "arrow", ...o, dx: (t.x - o.x) / L, dy: (ty - o.y) / L, dz: (t.z - o.z) / L, speed: 55, team: "player", dmg: a.dmg, src: a, gravity: 2, life: 3, stagger: 10 });
      }
    } else {
      if (d > 1.8) steerTo(G, a, t.x, t.z, 5.2, dt);
      else stop(a);
      if (a.atkCd <= 0 && d < 2.2) {
        a.atkCd = 1.1 + G.rand() * 0.6;
        a.swingT = 0.5;
        a.swingHit = false;
      }
      if (a.swingT > 0) {
        a.swingT -= dt;
        if (!a.swingHit && a.swingT < 0.28) {
          a.swingHit = true;
          for (const h of meleeSweep(G, a, { range: 2.4, arc: 1.8 })) applyDamage(G, a, h, a.dmg, { kind: "melee", stagger: 18, knock: 1 });
          G.emit({ type: "swing", ally: true, x: a.x, y: a.y, z: a.z });
        }
      }
    }
  } else {
    // follow (behind-right of the player) or hold the anchor
    if (a.anchor) {
      if (steerTo(G, a, a.anchor.x, a.anchor.z, 4, dt) < 2) stop(a);
    } else {
      const fx = P.x - Math.sin(P.yaw) * 2.6 - Math.cos(P.yaw) * 1.6;
      const fz = P.z - Math.cos(P.yaw) * 2.6 + Math.sin(P.yaw) * 1.6;
      const d = Math.hypot(fx - a.x, fz - a.z);
      if (d > 45) {
        a.x = fx;
        a.z = fz;
        G.settle(a);
      } else if (d > 1.5) steerTo(G, a, fx, fz, d > 8 ? 7.5 : Math.max(2, P.speed * 1.05), dt);
      else {
        stop(a);
        a.yaw = approachAngle(a.yaw, P.yaw, 3 * dt);
      }
    }
  }
  if (a.shootT > 0) a.shootT -= dt;
  integrate(G, a, dt);
  a.speed = Math.hypot(a.vx, a.vz);
}

/* ================================================================ NPCs & villagers */
export function stepNpc(G, n, dt) {
  n.t += dt;
  const P = G.player;
  const d = Math.hypot(P.x - n.x, P.z - n.z);
  n.near = d < 5 && P.interior === n.interior;
  if (n.path && !n.talking) {
    const pt = n.path[n.pi];
    if (n.waitT > 0) {
      n.waitT -= dt;
      stop(n);
    } else {
      const dx = pt[0] - n.x;
      const dz = pt[1] - n.z;
      const dd = Math.hypot(dx, dz);
      if (dd < 0.8) {
        n.pi = (n.pi + 1) % n.path.length;
        n.waitT = 2 + G.rand() * 5;
      } else {
        n.yaw = approachAngle(n.yaw, Math.atan2(dx, dz), 4 * dt);
        n.vx = (dx / dd) * 1.3;
        n.vz = (dz / dd) * 1.3;
      }
    }
    if (n.near && d < 2.5) stop(n, 0.5);
    integrate(G, n, dt);
  } else {
    n.vx = n.vz = 0;
    if (n.talking || (n.near && d < 3.5)) n.yaw = approachAngle(n.yaw, Math.atan2(P.x - n.x, P.z - n.z), 4 * dt);
    else n.yaw = approachAngle(n.yaw, n.homeYaw, 1.5 * dt);
  }
  n.speed = Math.hypot(n.vx || 0, n.vz || 0);
}

/* ================================================================ wildlife */
export function createWild(G, kind, x, z) {
  const w = {
    id: G.nextId++,
    kind: "wildlife",
    creature: kind,
    team: "neutral",
    name: "Red Deer",
    x,
    y: G.ground(x, z, 1e9),
    z,
    yaw: G.rand() * 6.28,
    vx: 0,
    vz: 0,
    vy: 0,
    kx: 0,
    kz: 0,
    r: 0.5,
    h: 1.4,
    hp: 30,
    maxHp: 30,
    armor: 0,
    home: { x, z },
    state: "graze",
    t: G.rand() * 5,
    onGround: true,
    airT: 0,
    interior: null,
    status: {},
    dead: false,
    deadT: 0,
    hitFlash: 0,
    mat: "flesh",
    speed: 0,
  };
  w.alert = () => {
    w.state = "flee";
    w.t = 0;
  };
  w.knock = (kx, kz) => {
    w.kx += kx;
    w.kz += kz;
  };
  w.die = () => {
    w.dead = true;
    w.deadT = 0;
    G.emit({ type: "death", id: w.id, x: w.x, y: w.y, z: w.z, creature: "deer" });
    G.dropLoot(w, "m_hide");
  };
  return w;
}
export function stepWild(G, w, dt) {
  w.hitFlash = Math.max(0, w.hitFlash - dt);
  w.kx *= Math.exp(-5 * dt);
  w.kz *= Math.exp(-5 * dt);
  if (w.dead) {
    w.deadT += dt;
    return;
  }
  w.t += dt;
  const P = G.player;
  const d = Math.hypot(P.x - w.x, P.z - w.z);
  if (w.state !== "flee" && (d < (P.sprinting ? 22 : 13) || G.enemies.some((e) => !e.dead && e.def.creature === "wolf" && Math.hypot(e.x - w.x, e.z - w.z) < 14))) {
    w.state = "flee";
    w.t = 0;
  }
  if (w.state === "flee") {
    const dx = w.x - P.x;
    const dz = w.z - P.z;
    const L = Math.hypot(dx, dz) || 1;
    steerTo(G, w, w.x + (dx / L) * 12, w.z + (dz / L) * 12, 9, dt);
    if (w.t > 5 && d > 30) {
      w.state = "graze";
      w.t = 0;
      w.home = { x: w.x, z: w.z };
    }
  } else if (w.state === "graze") {
    stop(w);
    if (w.t > 4 + (w.id % 4)) {
      w.state = "wander";
      w.t = 0;
      const a = G.rand() * Math.PI * 2;
      w.goal = { x: w.home.x + Math.cos(a) * 10, z: w.home.z + Math.sin(a) * 10 };
    }
  } else if (w.state === "wander") {
    if (steerTo(G, w, w.goal.x, w.goal.z, 1.4, dt) < 1 || w.t > 8) {
      w.state = "graze";
      w.t = 0;
    }
  }
  integrate(G, w, dt);
  w.speed = Math.hypot(w.vx, w.vz);
}

export { foesOf };
