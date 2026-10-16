/**
 * Hulk: Open World 3D — enemy AI (framework-free).
 *
 * Types (config.ENEMY): soldier · heavy · robot · heavyRobot · apc · turret.
 * FSM states:
 *   patrol      walk a loop around home (or idle at a post)
 *   alert       just detected the hero: brief reaction delay, call nearby allies
 *   approach    path (A* on the nav grid) toward a firing spot / the hero
 *   attack      in range with line of sight: aim (telegraph) → fire burst / melee
 *   cover       ranged units that are hurt find a spot the hero can't see
 *   reposition  strafe to a new firing spot every few seconds
 *   retreat     ranged units back off when the hero gets too close
 *   search      lost sight: go to the last known position, then give up
 *   defeated    knocked out (ragdoll fling, then removed)
 * Decisions are throttled by distance; units far from the hero sleep.
 * Movement uses the same cylinder-vs-box collision as the hero, so nobody
 * walks through buildings, plus separation so squads don't stack.
 */
import { ENEMY, GRAVITY, PROJ } from "./config.js";
import { clamp, wrapA, dampA } from "./util.js";
import { getNav } from "./nav.js";

let NEXT_ID = 1;
export function makeEnemy(sim, type, x, z, o = {}) {
  const def = ENEMY[type];
  const hpMul = sim.diff.enemyHp * (o.hpMul || 1);
  const e = {
    id: NEXT_ID++,
    type,
    def,
    x,
    y: o.y != null ? o.y : groundY(sim, x, z, 2),
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: o.heading != null ? o.heading : sim.rand() * Math.PI * 2,
    aimYaw: 0,
    hp: def.hp * hpMul,
    maxHp: def.hp * hpMul,
    dead: false,
    deadT: 0,
    state: "patrol",
    stT: 0,
    alertT: 0,
    lastSeen: null,
    seesHero: false,
    unseenT: 0,
    path: null,
    pathI: 0,
    repathT: 0,
    goal: null,
    cd: 0.5 + sim.rand() * def.cd,
    burst: 0,
    burstT: 0,
    windup: 0,
    melee: 0,
    air: false,
    stagger: 0,
    home: { x, z },
    patrol: o.patrol || null,
    patrolI: 0,
    fixed: !!(o.fixed || def.fixed),
    tag: o.tag || null,
    group: o.group || null,
    target: o.target || null, // "hero" (default) | a civilian / objective record
    aggro: !!o.aggro,
    think: sim.rand() * 0.3,
    flash: 0,
    lastHitBy: null,
    anim: { mode: "idle", t: sim.rand() * 10 },
    route: o.route || null, // convoy vehicles: fixed waypoint list
    routeI: 0,
    escaped: false,
    elite: !!o.elite,
    sleep: false,
  };
  if (e.aggro) {
    e.state = "approach";
    e.lastSeen = { x: sim.hero.x, z: sim.hero.z, t: sim.t };
  }
  return e;
}
function groundY(sim, x, z, from) {
  return sim.col.groundAt(x, z, from, 1.2, 0.3, false).y;
}

/** apply damage + knockback to an enemy; returns true if it died */
export function hitEnemy(sim, e, dmg, o) {
  if (e.dead) return false;
  const real = dmg * (1 - e.def.armor);
  e.hp -= real;
  e.flash = 0.15;
  e.lastHitBy = o.kind;
  // getting hit by the hero always reveals him
  if (o.byPlayer) {
    e.lastSeen = { x: sim.hero.x, z: sim.hero.z, t: sim.t };
    if (e.state === "patrol" || e.state === "search") setState(e, "approach");
  }
  const m = Math.sqrt(e.def.mass);
  if (o.knock && !e.fixed) {
    e.vx += ((o.dx || 0) * o.knock) / m;
    e.vz += ((o.dz || 0) * o.knock) / m;
    const lift = (o.lift || 0) / m;
    if (lift > 2.5 && !e.def.vehicle) {
      e.vy = Math.max(e.vy, lift);
      e.air = true;
    }
    e.stagger = Math.max(e.stagger, Math.min(1.2, (real / e.maxHp) * 3 + 0.25));
    e.windup = 0;
    e.melee = 0;
    e.burst = 0;
  }
  if (e.hp <= 0) {
    e.hp = 0;
    e.dead = true;
    e.deadT = 0;
    e.state = "defeated";
    if (!e.def.vehicle && !e.fixed) {
      e.air = true;
      e.vy = Math.max(e.vy, 5);
    }
    return true;
  }
  return false;
}

function setState(e, s) {
  if (e.state === s) return;
  e.state = s;
  e.stT = 0;
  e.path = null;
  e.repathT = 0;
}

export function updateEnemies(sim, dt) {
  const h = sim.hero;
  const list = sim.enemies;
  for (const e of list) {
    e.anim.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    if (e.dead) {
      e.deadT += dt;
      if (e.air || Math.abs(e.vx) + Math.abs(e.vz) > 0.1) bodyPhysics(sim, e, dt, true);
      e.anim.mode = "dead";
      continue;
    }
    const dH = Math.hypot(h.x - e.x, h.z - e.z);
    // far away and not scripted: sleep (no AI, no physics)
    e.sleep = dH > 240 && !e.route && !e.aggro;
    if (e.sleep) continue;
    e.stT += dt;
    e.cd -= dt;
    if (e.stagger > 0) e.stagger -= dt;

    if (e.air) {
      bodyPhysics(sim, e, dt, false);
      e.anim.mode = "knocked";
      continue;
    }
    // throttled thinking
    e.think -= dt;
    if (e.think <= 0) {
      e.think = dH < 70 ? 0.18 : dH < 150 ? 0.45 : 0.9;
      perceive(sim, e, dH);
      decide(sim, e, dH);
    }
    if (e.stagger > 0) {
      e.vx *= 1 - Math.min(1, dt * 6);
      e.vz *= 1 - Math.min(1, dt * 6);
      bodyPhysics(sim, e, dt, false);
      e.anim.mode = "stagger";
      continue;
    }
    act(sim, e, dt, dH);
    bodyPhysics(sim, e, dt, false);
  }
  // separation (cheap n² over awake, alive units)
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead || a.sleep || a.fixed) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead || b.sleep) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const r = a.def.r + b.def.r + 0.3;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (r - d) * 0.5;
      const wa = b.fixed ? 1 : b.def.mass / (a.def.mass + b.def.mass);
      a.x -= (dx / d) * push * 2 * wa;
      a.z -= (dz / d) * push * 2 * wa;
      if (!b.fixed) {
        b.x += (dx / d) * push * 2 * (1 - wa);
        b.z += (dz / d) * push * 2 * (1 - wa);
      }
      // never shove a squad mate into a wall
      sim.col.pushOut(a, a.def.r, a.def.h, 0.5, false);
      if (!b.fixed) sim.col.pushOut(b, b.def.r, b.def.h, 0.5, false);
    }
  }
}

/* ---------------------------------------------------------------- perception */
function targetOf(sim, e) {
  const t = e.target;
  if (t && t !== "hero" && !t.dead && t.hp > 0) return t;
  return null;
}
function perceive(sim, e, dH) {
  const h = sim.hero;
  const eyeY = e.y + e.def.h * 0.85;
  let sees = false;
  if (h.alive && dH < e.def.view * (e.state === "patrol" ? 1 : 1.5)) {
    // field of view only matters while unaware
    const ang = Math.abs(wrapA(Math.atan2(h.x - e.x, h.z - e.z) - e.heading));
    const inFov = e.state !== "patrol" || ang < 1.3 || dH < 14 || h.sprinting && dH < 30;
    if (inFov) sees = sim.col.losClear(e.x, eyeY, e.z, h.x, h.y + 2.2, h.z);
  }
  e.seesHero = sees;
  if (sees) {
    e.lastSeen = { x: h.x, y: h.y, z: h.z, t: sim.t };
    e.unseenT = 0;
    if (e.state === "patrol" || e.state === "search") {
      setState(e, "alert");
      e.alertT = 0.35 + sim.rand() * 0.35;
      sim.events.push({ type: "spotted", enemy: e });
      // shout to nearby squad mates
      for (const o of sim.enemiesNear(e.x, e.z, 35)) {
        if (o !== e && !o.dead && (o.state === "patrol" || o.state === "search")) {
          o.lastSeen = { x: h.x, y: h.y, z: h.z, t: sim.t };
          setState(o, "approach");
        }
      }
    }
  } else if (e.lastSeen) {
    e.unseenT += e.think || 0.2;
  }
}

/* ---------------------------------------------------------------- decisions */
function decide(sim, e, dH) {
  const h = sim.hero;
  const D = e.def;
  const civ = targetOf(sim, e);
  if (e.route) return; // convoys follow their route
  if (e.fixed) {
    if (e.seesHero || (civ && sim.col.losClear(e.x, e.y + 1.5, e.z, civ.x, civ.y + 1, civ.z))) setState(e, "attack");
    else setState(e, e.lastSeen ? "search" : "patrol");
    return;
  }
  // protect-mission attackers go for their objective unless the hero is in their face
  if (civ && !(e.seesHero && dH < 16)) {
    const dc = Math.hypot(civ.x - e.x, civ.z - e.z);
    const reach = D.melee && !D.fire ? D.meleeRange : D.range * 0.7;
    if (dc < reach && (D.melee && dc < D.meleeRange + 1 || sim.col.losClear(e.x, e.y + 1.5, e.z, civ.x, civ.y + 1, civ.z))) setState(e, "attack");
    else {
      setState(e, "approach");
      e.goal = { x: civ.x, z: civ.z };
    }
    return;
  }
  switch (e.state) {
    case "patrol":
      if (e.aggro) setState(e, "approach");
      return;
    case "alert":
      return; // act() counts the reaction delay down
    case "search":
      if (e.unseenT > 14) {
        e.lastSeen = null;
        setState(e, "patrol");
        sim.events.push({ type: "lostTrack", enemy: e });
      }
      return;
    default:
  }
  if (!e.lastSeen) {
    setState(e, "patrol");
    return;
  }
  if (!e.seesHero) {
    if (e.unseenT > 7 && !e.aggro) setState(e, "search");
    else if (e.state !== "approach") setState(e, "approach");
    e.goal = { x: e.lastSeen.x, z: e.lastSeen.z };
    return;
  }
  const hurt = e.hp < e.maxHp * 0.4;
  const ranged = !D.melee || D.fire;
  const heroHigh = h.y - e.y > 5;
  // melee units close in; robots shoot when they can't reach
  if (D.melee) {
    if (dH < D.meleeRange + 1.2 && !heroHigh) {
      setState(e, "attack");
      e.mode = "melee";
    } else if (dH < D.range && (heroHigh || e.cd <= 0 && sim.rand() < 0.6)) {
      setState(e, "attack");
      e.mode = "ranged";
    } else {
      setState(e, "approach");
      e.goal = { x: h.x, z: h.z };
    }
    return;
  }
  if (ranged) {
    if (dH < D.minRange && e.state !== "retreat" && !D.vehicle) {
      setState(e, "retreat");
      return;
    }
    if (hurt && e.type === "soldier" && e.state !== "cover" && e.stT > 1 && sim.rand() < 0.5) {
      const c = findCover(sim, e);
      if (c) {
        setState(e, "cover");
        e.goal = c;
        return;
      }
    }
    if (e.state === "cover" && e.stT < 4) return;
    if (dH > D.range * 0.92) {
      setState(e, "approach");
      e.goal = { x: h.x, z: h.z };
      return;
    }
    if (e.state === "attack" && e.stT > 3.5 + sim.rand() * 3 && !D.vehicle) {
      // strafe to a fresh spot (harder to pin down, looks alive)
      const side = sim.rand() < 0.5 ? -1 : 1;
      const a = Math.atan2(e.x - h.x, e.z - h.z) + side * (0.5 + sim.rand() * 0.5);
      const r = clamp(dH + (sim.rand() - 0.5) * 8, D.minRange + 2, D.range * 0.85);
      setState(e, "reposition");
      e.goal = { x: h.x + Math.sin(a) * r, z: h.z + Math.cos(a) * r };
      return;
    }
    if (e.state === "reposition" && e.stT < 2.5) return;
    if (e.state !== "attack") setState(e, "attack");
  }
}

/** a nearby spot where a building blocks the hero's line of sight */
function findCover(sim, e) {
  const h = sim.hero;
  const nav = getNav(sim.city);
  let best = null;
  let bd = Infinity;
  for (let k = 0; k < 10; k++) {
    const a = sim.rand() * Math.PI * 2;
    const r = 6 + sim.rand() * 14;
    const x = e.x + Math.sin(a) * r;
    const z = e.z + Math.cos(a) * r;
    const c = nav.cellOf(x, z);
    if (nav.blocked(nav.walk, c[0], c[1])) continue;
    if (sim.col.losClear(x, e.y + 1.4, z, h.x, h.y + 2, h.z)) continue;
    const d = Math.hypot(x - e.x, z - e.z) - Math.hypot(x - h.x, z - h.z) * 0.3;
    if (d < bd) {
      bd = d;
      best = { x, z };
    }
  }
  return best;
}

/* ---------------------------------------------------------------- acting */
function act(sim, e, dt, dH) {
  const h = sim.hero;
  const D = e.def;
  const civ = targetOf(sim, e);
  let tx = h.x;
  let ty = h.y + 1.8;
  let tz = h.z;
  if (civ && !(e.seesHero && dH < 16)) {
    tx = civ.x;
    ty = civ.y + 1.0;
    tz = civ.z;
  }
  let speed = 0;
  let mx = 0;
  let mz = 0;
  if (e.route) {
    // convoy: drive the route, shoot back if the hero is close
    const wp = e.route[e.routeI];
    if (wp) {
      const dx = wp[0] - e.x;
      const dz = wp[1] - e.z;
      const d = Math.hypot(dx, dz);
      if (d < 4) e.routeI++;
      mx = dx / (d || 1);
      mz = dz / (d || 1);
      speed = D.speed * (e.routeSpeed || 1);
    } else if (!e.escaped) {
      e.escaped = true;
      sim.events.push({ type: "escaped", enemy: e });
    }
    if (dH < D.range && e.seesHero) tryFire(sim, e, dt, tx, ty, tz, dH);
    else e.windup = 0;
    move(sim, e, mx, mz, speed, dt);
    e.anim.mode = "drive";
    return;
  }
  switch (e.state) {
    case "patrol": {
      if (e.patrol && e.patrol.length) {
        const wp = e.patrol[e.patrolI % e.patrol.length];
        const dx = wp[0] - e.x;
        const dz = wp[1] - e.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.5) e.patrolI++;
        else {
          mx = dx / d;
          mz = dz / d;
          speed = D.speed * 0.35;
        }
      } else if (!e.fixed && e.stT > 3 + (e.id % 5)) {
        // wander near home
        const a = sim.rand() * Math.PI * 2;
        e.patrol = [[e.home.x + Math.sin(a) * 8, e.home.z + Math.cos(a) * 8], [e.home.x, e.home.z]];
      }
      break;
    }
    case "alert":
      e.alertT -= dt;
      faceTo(e, h.x, h.z, dt, 8);
      if (e.alertT <= 0) setState(e, e.def.fire && dH < D.range ? "attack" : "approach");
      break;
    case "approach":
    case "search":
    case "reposition":
    case "cover":
    case "retreat": {
      let goal = e.goal || (e.lastSeen ? { x: e.lastSeen.x, z: e.lastSeen.z } : null);
      if (e.state === "retreat") {
        const dx = e.x - h.x;
        const dz = e.z - h.z;
        const d = Math.hypot(dx, dz) || 1;
        goal = { x: e.x + (dx / d) * 14, z: e.z + (dz / d) * 14 };
        if (dH > D.minRange + 6 || e.stT > 3) setState(e, "attack");
      }
      if (!goal || e.fixed) break;
      const w = steerPath(sim, e, goal, dt);
      if (w) {
        mx = w[0];
        mz = w[1];
        speed = D.speed * (e.state === "search" ? 0.6 : e.state === "retreat" ? 1.1 : 1);
      } else if (e.state === "search" && e.stT > 2) {
        // reached the last known spot: look around
        e.heading += dt * 1.5;
      }
      // shooting on the move (soldiers / robots), never while sprinting away
      if (e.seesHero && D.fire && e.state !== "retreat" && dH < D.range && e.type !== "heavy") tryFire(sim, e, dt, tx, ty, tz, dH, true);
      break;
    }
    case "attack": {
      const dT = Math.hypot(tx - e.x, tz - e.z);
      faceTo(e, tx, tz, dt, D.vehicle ? 2.5 : 7);
      if (D.melee && (e.mode === "melee" || !D.fire || dT < D.meleeRange + 0.5)) {
        if (dT > D.meleeRange + 0.4 && e.melee <= 0) {
          mx = (tx - e.x) / (dT || 1);
          mz = (tz - e.z) / (dT || 1);
          speed = D.speed;
        }
        tryMelee(sim, e, dt, tx, tz, civ);
      } else if (D.fire) {
        // armoured vehicles keep rolling to hold their range
        if (D.vehicle && dH < D.minRange) {
          mx = (e.x - h.x) / (dH || 1);
          mz = (e.z - h.z) / (dH || 1);
          speed = D.speed * 0.8;
        }
        const ok = civ ? true : e.seesHero;
        if (ok) tryFire(sim, e, dt, tx, ty, tz, dT);
        else if (e.windup > 0) e.windup = 0;
      }
      break;
    }
    default:
  }
  move(sim, e, mx, mz, speed, dt);
  if (speed > 0.3 && e.state !== "attack") faceTo(e, e.x + mx, e.z + mz, dt, 8);
  const sp = Math.hypot(e.vx, e.vz);
  e.anim.mode = e.windup > 0 ? (e.melee > 0 ? "melee" : "aim") : e.melee > 0 ? "melee" : sp > D.speed * 0.7 ? "run" : sp > 0.4 ? "walk" : e.state === "attack" ? "aim" : "idle";
}

function faceTo(e, x, z, dt, rate) {
  e.heading = dampA(e.heading, Math.atan2(x - e.x, z - e.z), rate, dt);
}

/** follow (and refresh) an A* path toward goal; returns a unit direction or null when arrived */
function steerPath(sim, e, goal, dt) {
  const dg = Math.hypot(goal.x - e.x, goal.z - e.z);
  if (dg < 2.2) return null;
  e.repathT -= dt;
  const nav = getNav(sim.city);
  const grid = e.def.r > 1 ? nav.big : nav.walk;
  if (!e.path || e.repathT <= 0 || (e.goalAt && Math.hypot(e.goalAt.x - goal.x, e.goalAt.z - goal.z) > 8)) {
    e.repathT = 1.2 + sim.rand() * 0.8;
    e.goalAt = { x: goal.x, z: goal.z };
    if (sim.navBudget > 0) {
      sim.navBudget--;
      e.path = nav.findPath(grid, e.x, e.z, goal.x, goal.z, 2200) || [[goal.x, goal.z]];
      e.pathI = 0;
    } else if (!e.path) e.path = [[goal.x, goal.z]];
  }
  let wp = e.path[e.pathI];
  while (wp && Math.hypot(wp[0] - e.x, wp[1] - e.z) < 1.6 && e.pathI < e.path.length - 1) wp = e.path[++e.pathI];
  if (!wp) return null;
  const dx = wp[0] - e.x;
  const dz = wp[1] - e.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.8) return null;
  return [dx / d, dz / d];
}

function move(sim, e, mx, mz, speed, dt) {
  if (e.fixed) {
    e.vx = e.vz = 0;
    return;
  }
  const tx = mx * speed;
  const tz = mz * speed;
  const k = 1 - Math.exp(-(e.def.vehicle ? 2.5 : 8) * dt);
  e.vx += (tx - e.vx) * k;
  e.vz += (tz - e.vz) * k;
}

/** integrate + collide (shared by live, knocked-back and dead bodies) */
function bodyPhysics(sim, e, dt, dead) {
  if (e.fixed) return;
  const ox = e.x;
  const oz = e.z;
  e.x += e.vx * dt;
  e.z += e.vz * dt;
  const c = sim.col.pushOut(e, e.def.r, e.def.h, e.def.vehicle ? 0.6 : 0.5, true);
  if (c) {
    const vn = e.vx * c.nx + e.vz * c.nz;
    if (vn < 0) {
      // slammed into a wall while flying: extra damage
      if (e.air && vn < -12 && !dead) {
        hitEnemy(sim, e, -vn * 3, { kind: "wall" });
        sim.fx.push({ type: "dust", x: e.x, y: e.y + 1, z: e.z, r: 1.5 });
        sim.events.push({ type: "wallSlam", enemy: e });
        if (e.dead) sim.enemyKilled(e, true);
      }
      e.vx -= vn * c.nx * (e.air ? 1.4 : 1);
      e.vz -= vn * c.nz * (e.air ? 1.4 : 1);
    }
  }
  if (e.x < -20 || e.z < -20 || e.x > sim.city.size + 20 || e.z > sim.city.size + 20) {
    e.x = ox;
    e.z = oz;
  }
  const g = sim.col.groundAt(e.x, e.z, e.y, 0.9, e.def.r);
  if (e.air) {
    e.vy -= GRAVITY * dt;
    e.y += e.vy * dt;
    if (e.y <= g.y) {
      e.y = g.y;
      if (e.vy < -14 && !dead) {
        hitEnemy(sim, e, -e.vy * 1.5, { kind: "fall" });
        if (e.dead) sim.enemyKilled(e, true);
      }
      e.vy = 0;
      e.air = false;
      e.vx *= 0.4;
      e.vz *= 0.4;
      if (!dead) e.stagger = Math.max(e.stagger, 0.6);
    }
  } else {
    // stay on the ground (walk down curbs, fall off ledges)
    if (e.y - g.y > 1.0) {
      e.air = true;
      e.vy = 0;
    } else e.y = g.y;
    if (dead) {
      e.vx *= 1 - Math.min(1, dt * 4);
      e.vz *= 1 - Math.min(1, dt * 4);
    }
  }
}

/* ---------------------------------------------------------------- attacks */
function tryFire(sim, e, dt, tx, ty, tz, d, moving = false) {
  const D = e.def;
  if (d > D.range * 1.05) {
    e.windup = 0;
    return;
  }
  if (e.burst > 0) {
    e.burstT -= dt;
    if (e.burstT <= 0) {
      e.burst--;
      e.burstT = D.burstGap;
      fire(sim, e, tx, ty, tz, d);
      if (e.burst <= 0) e.cd = D.cd * (0.8 + sim.rand() * 0.5) * (moving ? 1.4 : 1);
    }
    return;
  }
  if (e.cd > 0) return;
  if (e.windup <= 0) {
    e.windup = D.windup * (moving ? 1.2 : 1);
    e.aimAt = { x: tx, y: ty, z: tz };
    sim.events.push({ type: "telegraph", enemy: e, kind: D.fire });
    return;
  }
  e.windup -= dt;
  e.aimAt = { x: tx, y: ty, z: tz };
  if (e.windup <= 0) {
    e.windup = 0;
    e.burst = D.burst;
    e.burstT = 0;
  }
}
function muzzle(e) {
  const f = [Math.sin(e.heading), Math.cos(e.heading)];
  const D = e.def;
  const up = e.type === "apc" ? 2.4 : e.type === "turret" ? 1.7 : e.type === "heavyRobot" ? 3.4 : D.h * 0.75;
  const fwd = e.type === "apc" ? 2.8 : D.r + 0.4;
  return [e.x + f[0] * fwd, e.y + up, e.z + f[1] * fwd];
}
function fire(sim, e, tx, ty, tz) {
  const D = e.def;
  const P = PROJ[D.fire === "blast3" ? "blast3" : D.fire];
  const [mx, my, mz] = muzzle(e);
  const n = D.fire === "blast3" ? 3 : 1;
  // slight aim error that grows with distance; projectiles are dodgeable
  const err = P.spread / sim.diff.aim;
  for (let k = 0; k < n; k++) {
    let dx = tx - mx;
    let dy = ty - my;
    let dz = tz - mz;
    const L = Math.hypot(dx, dy, dz) || 1;
    dx /= L;
    dy /= L;
    dz /= L;
    const sa = (k - (n - 1) / 2) * 0.12;
    const c = Math.cos(sa);
    const s = Math.sin(sa);
    const rx = dx * c - dz * s;
    const rz = dx * s + dz * c;
    dx = rx + (sim.rand() - 0.5) * err * 2;
    dz = rz + (sim.rand() - 0.5) * err * 2;
    dy += (sim.rand() - 0.5) * err * 1.2;
    sim.spawnProjectile(D.fire === "blast3" ? "blast3" : D.fire, mx, my, mz, dx, dy, dz, { owner: e });
  }
  sim.events.push({ type: "enemyFire", enemy: e, kind: D.fire, x: mx, y: my, z: mz });
  sim.fx.push({ type: "muzzle", x: mx, y: my, z: mz, kind: D.fire });
}
function tryMelee(sim, e, dt, tx, tz, civ) {
  const D = e.def;
  if (e.melee > 0) {
    e.melee -= dt;
    if (e.melee <= 0) {
      // strike: arc in front of the unit, hero must still be there
      const f = [Math.sin(e.heading), Math.cos(e.heading)];
      const cx = e.x + f[0] * D.meleeRange * 0.6;
      const cz = e.z + f[1] * D.meleeRange * 0.6;
      const h = sim.hero;
      const r = D.meleeRange * 0.75 + 0.9;
      if (Math.hypot(h.x - cx, h.z - cz) < r && Math.abs(h.y - e.y) < 3) {
        sim.damageHero(D.melee * (e.elite ? 1.3 : 1), { x: e.x, z: e.z, kind: "melee", knock: e.type === "heavyRobot" ? 12 : 6, lift: e.type === "heavyRobot" ? 6 : 0 });
      }
      if (civ && Math.hypot(civ.x - cx, civ.z - cz) < r) sim.hurtCivilian(civ, D.melee, e.x, e.z);
      if (e.type === "heavyRobot") {
        sim.fx.push({ type: "shockwave", x: cx, y: e.y + 0.1, z: cz, r: 4, soft: true });
        sim.shake(cx, cz, 0.5, 40);
      }
      sim.events.push({ type: "enemyMelee", enemy: e });
      e.cd = D.cd * 0.6;
    }
    return;
  }
  if (e.cd > 0) return;
  e.melee = e.type === "heavyRobot" ? 0.85 : 0.5;
  sim.events.push({ type: "telegraph", enemy: e, kind: "melee" });
  void tx;
  void tz;
}

export { setState };
