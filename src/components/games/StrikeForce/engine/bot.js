/**
 * Strike Force — AI soldiers. A brain only writes its combatant's `input`
 * (the same controls the player has), so bots obey every movement, weapon,
 * recoil and line-of-sight rule. Difficulty (config.DIFFICULTY) sets
 * reaction time, turn speed, aim error and how well recoil is controlled.
 *
 * Behaviour, per tick:
 *   perceive  every ~0.2 s: enemies in view cone + range with clear LOS
 *   engage    visible target → aim (with human error), fire in bursts,
 *             strafe, crouch, keep the weapon's preferred range, retreat to
 *             cover when hurt, reload / draw the pistol when dry
 *   search    lost target / heard gunfire / got shot → go look
 *   objective DOM flags (attack / defend roles) or roaming hot spots;
 *             a friendly UAV reveals enemies to hunt
 * Stuck detection re-paths, jumps and side-steps so nobody idles in a wall.
 */
import { WALK } from "./config.js";

const DEG = Math.PI / 180;
const wrap = (a) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};
const IDEAL = { shotgun: [0, 7], smg: [0, 15], pistol: [0, 14], ar: [6, 34], lmg: [8, 40], sniper: [22, 90] };
const MAXR = { shotgun: 20, smg: 42, pistol: 38, ar: 95, lmg: 95, sniper: 140 };

export function createBrain(c, M) {
  const b = {
    role: c.id % 3 === 0 ? "defend" : "attack",
    target: null,
    visible: false,
    reactAt: 0,
    targetSince: 0,
    lastSeen: null,
    lastSeenT: -99,
    seeT: M.rnd() * 0.2,
    goal: null,
    goalKind: "",
    path: null,
    pi: 0,
    repathT: 0,
    strafe: 0,
    strafeT: 0,
    crouchT: 0,
    burstT: 0,
    pauseT: 0,
    tapT: 0,
    errYaw: 0,
    errPitch: 0,
    wobT: 0,
    aimHead: false,
    stuckT: 0,
    stuckX: 0,
    stuckZ: 0,
    stuckN: 0,
    sideT: 0,
    sideDir: 1,
    hurtBy: null,
    hurtT: -99,
    heard: null,
    retreatUntil: 0,
    holdUntil: 0,
    lookYaw: c.yaw,
    extraSpread: 0,
    reset(cc) {
      b.target = null;
      b.visible = false;
      b.goal = null;
      b.path = null;
      b.lastSeen = null;
      b.heard = null;
      b.hurtBy = null;
      b.retreatUntil = 0;
      b.lookYaw = cc.yaw;
      b.stuckN = 0;
      b.stuckT = 0;
      b.stuckX = cc.x;
      b.stuckZ = cc.z;
      Object.assign(cc.input, { mx: 0, mz: 0, fire: false, ads: false, sprint: false, crouch: false, jump: false, reload: false, swap: null });
    },
    onHurt(cc, attacker, MM) {
      b.hurtBy = attacker;
      b.hurtT = MM.clock;
      if (!b.visible) {
        b.lastSeen = { x: attacker.x, y: attacker.y, z: attacker.z };
        b.lastSeenT = MM.clock - 1.5;
      }
    },
    hear(cc, shooter, MM) {
      if (b.visible) return;
      b.heard = { x: shooter.x, z: shooter.z, t: MM.clock };
    },
  };
  return b;
}

/** world-space desired direction → local move input */
function setMove(c, wx, wz, scale = 1) {
  const l = Math.hypot(wx, wz);
  if (l < 1e-4) {
    c.input.mx = 0;
    c.input.mz = 0;
    return;
  }
  wx /= l;
  wz /= l;
  const s = Math.sin(c.input.yaw);
  const co = Math.cos(c.input.yaw);
  c.input.mz = (wx * -s + wz * -co) * scale;
  c.input.mx = (wx * co + wz * -s) * scale;
}

const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

function turnToward(c, yaw, pitch, rate, dt) {
  const dy = wrap(yaw - c.input.yaw);
  const maxStep = rate * DEG * dt;
  // ease-out: proportional but capped
  const step = Math.sign(dy) * Math.min(Math.abs(dy), Math.max(maxStep * 0.25, Math.min(maxStep, Math.abs(dy) * 10 * dt)));
  c.input.yaw = wrap(c.input.yaw + step);
  const dp = pitch - c.input.pitch;
  const pStep = Math.sign(dp) * Math.min(Math.abs(dp), Math.max(maxStep * 0.2, Math.min(maxStep * 0.7, Math.abs(dp) * 9 * dt)));
  c.input.pitch += pStep;
}

function perceive(c, M) {
  const b = c.brain;
  const D = M.diff;
  const eye = M.eye(c);
  let best = null;
  let bestScore = Infinity;
  let curVisible = false;
  const uav = M.mode.teams && M.uav[c.team] > 0;
  for (const o of M.combatants) {
    if (!o.alive || !M.isEnemy(c, o)) continue;
    const dx = o.x - c.x;
    const dz = o.z - c.z;
    const d = Math.hypot(dx, dz);
    const recentlyHurt = b.hurtBy === o && M.clock - b.hurtT < 2.5;
    if (d > D.sight && !recentlyHurt) continue;
    const ang = Math.abs(wrap(yawTo(dx, dz) - c.yaw)) / DEG;
    // crouched, still targets are harder to spot at range
    const stealth = o.crouched && o.speed < 1 && d > 25 ? 0.7 : 1;
    if (!(ang < (D.fov / 2) * stealth || d < 4.5 || recentlyHurt || (o === b.target && M.clock - b.lastSeenT < 1))) continue;
    const oe = M.eye(o);
    const vis = M.col.los(c.x, eye, c.z, o.x, oe, o.z) || M.col.los(c.x, eye, c.z, o.x, oe - 0.55, o.z);
    if (!vis) continue;
    if (o === b.target) curVisible = true;
    const score = d * (1 + ang / 120) * (o === b.target ? 0.6 : 1) * (recentlyHurt ? 0.5 : 1);
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  if (curVisible && b.target) best = b.target;
  if (best) {
    if (best !== b.target || !b.visible) {
      const d = Math.hypot(best.x - c.x, best.z - c.z);
      const known = best === b.target && M.clock - b.lastSeenT < 1.2;
      b.reactAt = M.clock + (known ? 0.08 : M.rnd.range(D.react[0], D.react[1]) * (0.85 + d / 90));
      if (!known) {
        b.targetSince = M.clock;
        const a = M.rnd() * Math.PI * 2;
        b.errYaw = Math.cos(a) * D.err0 * DEG;
        b.errPitch = Math.sin(a) * D.err0 * 0.6 * DEG;
        b.aimHead = M.rnd() < D.headChance;
      }
      b.target = best;
    }
    b.visible = true;
    b.lastSeen = { x: best.x, y: best.y, z: best.z, vx: best.vx, vz: best.vz };
    b.lastSeenT = M.clock;
  } else {
    b.visible = false;
    if (b.target && !b.target.alive) b.target = null;
  }
  // UAV: know roughly where the closest enemy is
  if (!b.visible && uav && (!b.lastSeen || M.clock - b.lastSeenT > 4)) {
    let near = null;
    let nd = Infinity;
    for (const o of M.combatants) {
      if (!o.alive || !M.isEnemy(c, o)) continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      if (d < nd) {
        nd = d;
        near = o;
      }
    }
    if (near && nd < 60) {
      b.lastSeen = { x: near.x, y: near.y, z: near.z };
      b.lastSeenT = M.clock - 2;
    }
  }
}

function setGoal(b, x, z, kind) {
  b.goal = { x, z };
  b.goalKind = kind;
  b.path = null;
  b.repathT = 0;
}

function chooseObjective(c, M) {
  const b = c.brain;
  const rnd = M.rnd;
  if (M.mode.id === "dom") {
    let best = null;
    let bestS = Infinity;
    for (const f of M.flags) {
      const d = Math.hypot(f.x - c.x, f.z - c.z);
      let s = d;
      if (f.owner === c.team) s += b.role === "defend" ? 8 : 55;
      else if (f.owner === -1) s -= 6;
      if (f.capTeam !== -1 && f.capTeam !== c.team && f.owner === c.team) s -= 25; // being taken — defend
      s += rnd() * 14;
      if (s < bestS) {
        bestS = s;
        best = f;
      }
    }
    if (best) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 2.4;
      setGoal(b, best.x + Math.cos(a) * r, best.z + Math.sin(a) * r, "flag:" + best.key);
      return;
    }
  }
  if (b.heard && M.clock - b.heard.t < 6 && rnd() < 0.75) {
    setGoal(b, b.heard.x, b.heard.z, "heard");
    b.heard = null;
    return;
  }
  const hot = M.map.hot;
  if (hot.length && rnd() < 0.65) {
    let tot = 0;
    for (const h of hot) tot += h.w;
    let r = rnd() * tot;
    for (const h of hot) {
      r -= h.w;
      if (r <= 0) {
        setGoal(b, h.x + rnd.range(-3, 3), h.z + rnd.range(-3, 3), "hot");
        return;
      }
    }
  }
  const p = M.nav.posOf(rnd() < 0.4 ? M.nav.randomCover(rnd) : M.nav.randomCell(rnd));
  setGoal(b, p.x, p.z, "roam");
}

/** move along the current path; returns remaining straight-line distance */
function followPath(c, M, dt, speedScale = 1) {
  const b = c.brain;
  if (!b.goal) return 0;
  b.repathT -= dt;
  if (!b.path || b.repathT <= 0) {
    b.path = M.nav.path(c.x, c.z, b.goal.x, b.goal.z);
    b.pi = 0;
    b.repathT = 2.2 + M.rnd() * 1.2;
    if (!b.path) {
      b.goal = null;
      c.input.mx = c.input.mz = 0;
      return 0;
    }
  }
  let next = b.path[b.pi];
  while (next && Math.hypot(next.x - c.x, next.z - c.z) < (b.pi === b.path.length - 1 ? 0.7 : 0.55)) {
    b.pi++;
    next = b.path[b.pi];
  }
  if (!next) {
    c.input.mx = c.input.mz = 0;
    return 0;
  }
  const dx = next.x - c.x;
  const dz = next.z - c.z;
  if (b.sideT > 0) {
    // side-step to get unstuck
    b.sideT -= dt;
    const l = Math.hypot(dx, dz) || 1;
    setMove(c, dx / l - (dz / l) * 1.6 * b.sideDir, dz / l + (dx / l) * 1.6 * b.sideDir, speedScale);
  } else setMove(c, dx, dz, speedScale);
  let rem = Math.hypot(dx, dz);
  for (let k = b.pi + 1; k < b.path.length; k++) rem += Math.hypot(b.path[k].x - b.path[k - 1].x, b.path[k].z - b.path[k - 1].z);
  return rem;
}

function findCover(c, M, threat) {
  const cand = M.nav.coverNear(c.x, c.z, 11, M.rnd, 16);
  const te = M.eye(threat);
  let best = null;
  let bestD = Infinity;
  for (const cell of cand) {
    const p = M.nav.posOf(cell);
    if (M.col.los(threat.x, te, threat.z, p.x, 1.0, p.z)) continue; // still exposed when crouched
    const d = Math.hypot(p.x - c.x, p.z - c.z) + Math.hypot(p.x - threat.x, p.z - threat.z) * -0.15;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function thinkBot(c, M, dt) {
  const b = c.brain;
  const D = M.diff;
  const inp = c.input;
  const ws = c.weapons[c.cur];
  const def = ws.def;
  const rnd = M.rnd;
  inp.jump = false;
  inp.reload = false;
  inp.fire = inp.fire && def.mode === "auto"; // semi weapons need a fresh press
  if (M.state !== "live") {
    inp.mx = inp.mz = 0;
    inp.fire = false;
    return;
  }
  b.seeT -= dt;
  if (b.seeT <= 0) {
    b.seeT = 0.16 + rnd() * 0.1;
    perceive(c, M);
  }
  const t = b.target;
  const engaged = b.visible && t && t.alive;

  // ------------------------------------------------ stuck detection
  b.stuckT += dt;
  if (b.stuckT > 1.1) {
    const moved = Math.hypot(c.x - b.stuckX, c.z - b.stuckZ);
    const wanted = Math.hypot(inp.mx, inp.mz) > 0.3;
    if (wanted && moved < 0.35 && !engaged) {
      b.stuckN++;
      inp.jump = true;
      b.sideT = 0.7;
      b.sideDir = rnd() < 0.5 ? -1 : 1;
      b.path = null;
      if (b.stuckN >= 3) {
        b.goal = null;
        b.stuckN = 0;
      }
    } else if (moved > 1) b.stuckN = 0;
    b.stuckT = 0;
    b.stuckX = c.x;
    b.stuckZ = c.z;
  }

  if (engaged) {
    engage(c, M, dt, t);
    return;
  }

  // ------------------------------------------------ not engaged
  inp.fire = false;
  inp.ads = false;
  b.extraSpread = 0;
  if (c.cur === 1 && c.weapons[0].mag + c.weapons[0].reserve > 0) inp.swap = 0;
  if (ws.mag < def.mag * 0.55 && ws.reserve > 0 && !ws.reloading && M.clock - b.lastSeenT > 1.2) inp.reload = true;

  // search last known / hurt direction
  if (b.lastSeen && M.clock - b.lastSeenT < 6 && b.goalKind !== "search") setGoal(b, b.lastSeen.x, b.lastSeen.z, "search");
  if (b.goalKind === "search" && (!b.lastSeen || M.clock - b.lastSeenT >= 6)) b.goal = null;
  if (M.clock < b.retreatUntil && b.goalKind === "cover") {
    // stay in cover, crouched, until healed
    const rem = followPath(c, M, dt, 1);
    if (rem < 0.8) {
      inp.mx = inp.mz = 0;
      inp.crouch = true;
    }
    if (c.hp > 85) b.retreatUntil = 0;
  } else {
    inp.crouch = false;
    if (!b.goal) chooseObjective(c, M);
    const atFlag = b.goalKind.startsWith("flag:");
    const rem = followPath(c, M, dt, 1);
    if (!b.goal || rem < 0.8) {
      if (atFlag) {
        const f = M.flags.find((x) => "flag:" + x.key === b.goalKind);
        if (f && f.owner !== c.team) {
          // keep capturing: shuffle around inside the radius
          if (!b.holdUntil || M.clock > b.holdUntil) {
            const a = rnd() * Math.PI * 2;
            const r = rnd() * 2.6;
            b.goal = { x: f.x + Math.cos(a) * r, z: f.z + Math.sin(a) * r };
            b.path = null;
            b.holdUntil = M.clock + 1.5 + rnd() * 1.5;
          }
        } else if (!b.holdUntil || M.clock > b.holdUntil + 3 + rnd() * 4) {
          b.goal = null;
          b.holdUntil = 0;
        }
      } else b.goal = null;
    }
    inp.sprint = rem > 7 && b.goalKind !== "search" && !atFlag;
  }

  // look where we're going, glance toward the last threat
  let lookYaw = c.yaw;
  if (b.lastSeen && M.clock - b.lastSeenT < 6) lookYaw = yawTo(b.lastSeen.x - c.x, b.lastSeen.z - c.z);
  else if (b.hurtBy && M.clock - b.hurtT < 3) lookYaw = yawTo(b.hurtBy.x - c.x, b.hurtBy.z - c.z);
  else if (b.path && b.path[b.pi]) {
    const n = b.path[b.pi];
    lookYaw = yawTo(n.x - c.x, n.z - c.z);
  }
  // when moving, keep the body roughly along the path so movement stays forward
  turnToward(c, lookYaw, 0, D.turn * 0.75, dt);
  if (b.path && b.path[b.pi]) {
    const n = b.path[b.pi];
    setMove(c, n.x - c.x, n.z - c.z, Math.hypot(inp.mx, inp.mz) > 0 ? 1 : 0);
    if (b.sideT > 0) {
      const dx = n.x - c.x;
      const dz = n.z - c.z;
      const l = Math.hypot(dx, dz) || 1;
      setMove(c, dx / l - (dz / l) * 1.6 * b.sideDir, dz / l + (dx / l) * 1.6 * b.sideDir, 1);
    }
  }
}

function engage(c, M, dt, t) {
  const b = c.brain;
  const D = M.diff;
  const inp = c.input;
  const rnd = M.rnd;
  let ws = c.weapons[c.cur];
  let def = ws.def;
  const dx = t.x - c.x;
  const dz = t.z - c.z;
  const dist = Math.hypot(dx, dz);
  b.goalKind = b.goalKind === "cover" ? "cover" : "engage";

  // weapon management
  if (ws.mag === 0 && !ws.reloading) {
    if (c.cur === 0 && dist < 22 && c.weapons[1].mag > 0 && rnd() < 0.6 + (D.id === "hard" ? 0.3 : 0)) inp.swap = 1;
    else inp.reload = true;
  }
  ws = c.weapons[c.cur];
  def = ws.def;

  // aim point
  const te = M.eye(t);
  const aimY = b.aimHead ? te + 0.05 : te - 0.42;
  const lead = Math.min(0.25, dist / 600);
  const px = t.x + t.vx * lead;
  const pz = t.z + t.vz * lead;
  const eye = M.eye(c);
  const hd = Math.hypot(px - c.x, pz - c.z);
  const wantYaw = yawTo(px - c.x, pz - c.z);
  const wantPitch = Math.atan2(aimY - eye, hd);
  // aim error: settles over time, grows with movement
  const since = M.clock - b.targetSince;
  const settle = Math.min(1, since / D.settle);
  const errMag = D.err0 + (D.err1 - D.err0) * settle;
  b.wobT -= dt;
  if (b.wobT <= 0) {
    b.wobT = 0.18 + rnd() * 0.25;
    const a = rnd() * Math.PI * 2;
    const moveF = 1 + (c.speed / WALK) * 0.6 + (Math.hypot(t.vx, t.vz) / WALK) * 0.5;
    const m = errMag * moveF * DEG * (0.4 + rnd() * 0.6);
    b.tYaw = Math.cos(a) * m;
    b.tPitch = Math.sin(a) * m * 0.55;
  }
  b.errYaw += ((b.tYaw || 0) - b.errYaw) * Math.min(1, dt * 5);
  b.errPitch += ((b.tPitch || 0) - b.errPitch) * Math.min(1, dt * 5);
  turnToward(c, wantYaw + b.errYaw - c.kickY * D.comp, wantPitch + b.errPitch - c.kickP * D.comp, D.turn, dt);

  // angle between where the gun points and the target
  const vy = c.input.yaw + c.kickY;
  const vp = c.input.pitch + c.kickP;
  const offYaw = Math.abs(wrap(vy - wantYaw));
  const offPitch = Math.abs(vp - wantPitch);
  const off = Math.hypot(offYaw * Math.cos(wantPitch), offPitch);
  const tol = Math.atan(0.5 / Math.max(1, dist)) + (def.pellets > 1 ? 2.5 * DEG : 0.6 * DEG) + errMag * 0.5 * DEG;
  const inRange = dist < MAXR[def.cat];
  const ready = M.clock >= b.reactAt && off < tol * 1.6 && inRange;

  // ADS
  inp.ads = (dist > 9 || def.cat === "sniper") && def.cat !== "shotgun";
  inp.sprint = false;

  // trigger discipline
  if (def.mode === "auto") {
    if (!ready) {
      inp.fire = false;
    } else if (b.burstT > 0) {
      inp.fire = true;
      b.burstT -= dt;
      if (b.burstT <= 0) b.pauseT = rnd.range(D.pause[0], D.pause[1]) * (dist > 30 ? 1.4 : 1);
    } else if (b.pauseT > 0) {
      inp.fire = false;
      b.pauseT -= dt;
    } else {
      b.burstT = rnd.range(D.burst[0], D.burst[1]) * (dist > 30 ? 0.6 : 1) * (def.cat === "lmg" ? 1.6 : 1);
      inp.fire = true;
    }
  } else {
    b.tapT -= dt;
    if (inp.fire) inp.fire = false;
    else if (ready && b.tapT <= 0 && ws.cycleT <= 0) {
      const steady = def.cat !== "sniper" || since > D.settle * 0.8;
      if (steady) {
        inp.fire = true;
        b.tapT = 1 / D.tap + rnd() * 0.12;
      }
    }
  }

  // movement
  const [lo, hi] = IDEAL[def.cat] || [5, 30];
  b.strafeT -= dt;
  if (b.strafeT <= 0) {
    b.strafeT = 0.45 + rnd() * 1.1;
    b.strafe = rnd() < D.strafe ? (rnd() < 0.5 ? -1 : 1) : 0;
    b.crouchT = def.cat !== "shotgun" && dist > 14 && rnd() < 0.28 ? 0.6 + rnd() * 1.2 : 0;
  }
  b.crouchT -= dt;
  inp.crouch = b.crouchT > 0;
  const hurt = c.hp < 45 && def.cat !== "shotgun";
  if (hurt && M.clock > b.retreatUntil + 4) {
    const cover = findCover(c, M, t);
    if (cover) {
      setGoal(b, cover.x, cover.z, "cover");
      b.retreatUntil = M.clock + 4 + rnd() * 2;
    }
  }
  let fwd = 0;
  if (b.goalKind === "cover" && M.clock < b.retreatUntil) {
    // shoot while backing into cover
    const rem = followPath(c, M, dt, 1);
    if (rem < 0.8) {
      inp.mx = inp.mz = 0;
      inp.crouch = true;
    }
    return;
  }
  if (dist > hi) fwd = 1;
  else if (dist < lo) fwd = -0.7;
  // in DOM stay on the flag while fighting if we're capturing
  const s = Math.sin(c.input.yaw);
  const co = Math.cos(c.input.yaw);
  if (fwd > 0 && b.lastSeen) {
    // close in along the nav path toward the target
    if (!b.goal || b.goalKind !== "chase" || b.repathT <= 0) setGoal(b, t.x, t.z, "chase");
    followPath(c, M, dt, 0.85);
    // add strafing on top, in local space
    inp.mx = Math.max(-1, Math.min(1, inp.mx + b.strafe * 0.5));
  } else {
    inp.mz = fwd;
    inp.mx = b.strafe;
    // don't strafe into walls: probe
    const wx = co * inp.mx + -s * inp.mz;
    const wz = -s * inp.mx + -co * inp.mz;
    const probe = M.nav.cellOf(c.x + wx * 0.9, c.z + wz * 0.9);
    if (!M.nav.walkable(probe)) {
      b.strafe = -b.strafe;
      inp.mx = b.strafe;
    }
  }
  b.extraSpread = 0;
}
