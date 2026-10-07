/**
 * Night Corridor — the one creature.
 *
 * Deliberately simple, explicit states:
 *
 *   HIDDEN       not in the world
 *   SCRIPTED     non-hostile staging — a glimpse at the end of a hall, a
 *                shape crossing a junction. Leaves by walking into the dark
 *                and only vanishes when the player isn't looking at it.
 *   PATROL       walks a waypoint loop, looking and listening
 *   INVESTIGATE  heard something — walks to it, looks around
 *   CHASE        runs at the player (grid A*, direct steer when in sight),
 *                bangs on shut doors before bursting through
 *   SEARCH       lost the player — checks the last known spot
 *   RETURN       walks off into the darkness, then HIDDEN
 *   CATCH        reached the player; the game owns what happens next
 *
 * Scripted chases spawn it at a known point, chase through a controlled
 * route, and end deterministically when the player enters the safe room.
 * Nothing here ever moves it through walls, locked doors or safe rooms.
 */
import {
  CREATURE_R, CREATURE_WALK, CREATURE_INVESTIGATE, CREATURE_CHASE, CATCH_DIST,
  DOOR_BANG_TIME, DOOR_SLAM_SPEED,
} from "./constants.js";
import { moveBody, lineOfSight, pointBlocked } from "./collision.js";
import { findPath } from "./nav.js";
import { toCell, cellX, cellZ, T_SOLID, T_DOOR } from "./level.js";

export const CS = {
  HIDDEN: "HIDDEN",
  SCRIPTED: "SCRIPTED",
  PATROL: "PATROL",
  INVESTIGATE: "INVESTIGATE",
  CHASE: "CHASE",
  SEARCH: "SEARCH",
  RETURN: "RETURN",
  CATCH: "CATCH",
};

export function createCreature() {
  return {
    state: CS.HIDDEN,
    x: -100,
    z: -100,
    yaw: 0,
    headYaw: 0,
    speed: 0,
    anim: "idle",
    animT: 0,
    path: null,
    pathI: 0,
    pathGoal: -1,
    repath: 0,
    timer: 0,
    stuckT: 0,
    lastX: 0,
    lastZ: 0,
    script: null,
    patrol: null,
    chase: null,
    lastSeen: null,
    seenT: 0,
    lostT: 0,
    sawHide: null,
    bang: null,
    voiceT: 2,
    stepAcc: 0,
    noise: null,
    lookT: 0,
  };
}

const angleTo = (fromX, fromZ, toX, toZ) => Math.atan2(-(toX - fromX), -(toZ - fromZ));
const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

function placeAt(c, x, z, yaw) {
  c.x = x;
  c.z = z;
  c.lastX = x;
  c.lastZ = z;
  c.yaw = yaw ?? c.yaw;
  c.path = null;
  c.pathGoal = -1;
  c.speed = 0;
  c.stuckT = 0;
  c.bang = null;
}

export function hideCreature(c) {
  c.state = CS.HIDDEN;
  c.x = -100;
  c.z = -100;
  c.path = null;
  c.script = null;
  c.chase = null;
  c.bang = null;
  c.sawHide = null;
  c.speed = 0;
  c.anim = "idle";
}

/** Non-hostile staging. points: [{x,z}], hold: seconds standing before leaving. */
export function startScripted(c, opts) {
  const first = opts.points[0];
  placeAt(c, first.x, first.z, opts.yaw);
  c.state = CS.SCRIPTED;
  c.script = { ...opts, i: opts.hold != null ? 0 : 1, holdT: opts.hold ?? 0, seenT: 0, total: 0, arrived: false, waitT: 0 };
  c.anim = "idle";
}

export function startPatrol(c, opts, spawn) {
  if (spawn) placeAt(c, spawn.x, spawn.z, spawn.yaw);
  c.state = CS.PATROL;
  c.patrol = { ...opts, i: 0, waitT: 0 };
  c.chase = null;
}

export function startChase(c, config, spawn) {
  if (spawn) placeAt(c, spawn.x, spawn.z, spawn.yaw);
  c.state = CS.CHASE;
  c.chase = config;
  c.chaseStartT = c.animT;
  c.lostT = 0;
  c.sawHide = null;
  c.voiceT = 0.4;
}

export function endChase(c) {
  c.chase = null;
  c.sawHide = null;
  c.bang = null;
  c.state = CS.RETURN;
  c.path = null;
  c.timer = 0;
}

/** Creature-side passability: no walls, locked doors or safe rooms. */
function makePassable(level, nav, allowSafe) {
  return (cc, rr) => {
    if (!level.inside(cc, rr)) return false;
    const k = level.idx(cc, rr);
    const t = level.type[k];
    if (t === T_SOLID) return false;
    if (nav.blocked.has(k)) return false;
    if (!allowSafe && level.safeCells.has(k)) return false;
    if (t === T_DOOR) {
      const d = level.doorAtCell.get(k);
      if (d.locked && d.open < 0.6) return false;
    }
    return true;
  };
}

/** Builds the per-level navigation helper (cells whose centre is furniture-blocked). */
export function buildNav(level) {
  const blocked = new Set();
  for (const f of level.floors) {
    const list = level.cellSolids.get(level.idx(f.c, f.r));
    if (!list) continue;
    for (const b of list) {
      const qx = Math.max(b.minX, Math.min(f.x, b.maxX));
      const qz = Math.max(b.minZ, Math.min(f.z, b.maxZ));
      if (Math.hypot(f.x - qx, f.z - qz) < CREATURE_R + 0.05) {
        blocked.add(level.idx(f.c, f.r));
        break;
      }
    }
  }
  const nav = { blocked };
  nav.passable = makePassable(level, nav, false);
  nav.passableAny = makePassable(level, nav, true);
  return nav;
}

/**
 * Walks toward (tx, tz). Uses A* through the grid, steering straight when
 * the target is in clear sight. Handles shut doors on the way.
 * Returns "arrived" | "moving" | "blocked" | "door".
 */
function travel(c, tx, tz, speed, dt, ctx, opts = {}) {
  const { level, nav } = ctx;
  const passable = opts.allowSafe ? nav.passableAny : nav.passable;
  const dist = Math.hypot(tx - c.x, tz - c.z);
  if (dist < (opts.arrive ?? 0.35)) return "arrived";

  // Shut door in the way?
  if (c.bang) return "door";

  const goalC = toCell(tx);
  const goalR = toCell(tz);
  const goalK = level.inside(goalC, goalR) ? level.idx(goalC, goalR) : -1;
  c.repath -= dt;
  const direct = dist < 9 && lineOfSight(level, c.x, c.z, tx, tz) && passable(goalC, goalR);
  let wx = tx;
  let wz = tz;
  if (!direct) {
    if (!c.path || c.pathGoal !== goalK || c.repath <= 0) {
      const sc = toCell(c.x);
      const sr = toCell(c.z);
      let p = findPath(level, sc, sr, goalC, goalR, passable);
      if (!p) {
        // Target cell itself is off-limits (e.g. player stands in a doorway) — aim for any open neighbour.
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (passable(goalC + dc, goalR + dr)) {
            p = findPath(level, sc, sr, goalC + dc, goalR + dr, passable);
            if (p) break;
          }
        }
      }
      c.path = p;
      c.pathI = 0;
      c.pathGoal = goalK;
      c.repath = opts.repath ?? 0.3;
      if (!p) return "blocked";
    }
    // Skip waypoints we've reached (or that we can already see past).
    while (c.pathI < c.path.length - 1) {
      const wp = c.path[c.pathI];
      if (Math.hypot(wp.x - c.x, wp.z - c.z) < 0.45) c.pathI++;
      else break;
    }
    const wp = c.path[Math.min(c.pathI, c.path.length - 1)];
    if (!wp) return "blocked";
    wx = wp.x;
    wz = wp.z;
    if (c.pathI >= c.path.length - 1) {
      wx = tx;
      wz = tz;
    }
    // Door on the next waypoint that is shut?
    const wk = level.idx(wp.c, wp.r);
    if (level.type[wk] === T_DOOR) {
      const door = level.doorAtCell.get(wk);
      if (door.open < 0.6 && Math.hypot(wp.x - c.x, wp.z - c.z) < 1.55) {
        c.bang = { door, t: opts.forceDoors ? DOOR_BANG_TIME : 0.55, hits: 0, gentle: !opts.forceDoors };
        c.speed = 0;
        return "door";
      }
    }
  } else {
    c.path = null;
  }

  const want = angleTo(c.x, c.z, wx, wz);
  const turn = wrap(want - c.yaw);
  const maxTurn = (opts.turnRate ?? 6) * dt;
  c.yaw = wrap(c.yaw + Math.max(-maxTurn, Math.min(maxTurn, turn)));
  // Slow down for sharp turns so it doesn't skate round corners.
  const align = Math.max(0.35, Math.cos(Math.min(Math.abs(turn), Math.PI / 2)));
  const accel = opts.accel ?? 4;
  const tgt = speed * align;
  c.speed += Math.max(-accel * 2 * dt, Math.min(accel * dt, tgt - c.speed));
  const step = Math.min(c.speed * dt, dist);
  const dirX = (wx - c.x) / (Math.hypot(wx - c.x, wz - c.z) || 1);
  const dirZ = (wz - c.z) / (Math.hypot(wx - c.x, wz - c.z) || 1);
  const ox = c.x;
  const oz = c.z;
  moveBody(level, c, CREATURE_R, dirX * step, dirZ * step);
  // Never cross into a safe room unless the script allows it.
  if (!opts.allowSafe) {
    const k = level.idx(toCell(c.x), toCell(c.z));
    if (level.safeCells.has(k)) {
      c.x = ox;
      c.z = oz;
    }
  }
  const moved = Math.hypot(c.x - ox, c.z - oz);
  c.stepAcc += moved;
  // Stuck guard: no progress for a while → force a repath; long stall → snap to the cell centre.
  if (moved < c.speed * dt * 0.2 && c.speed > 0.3) {
    c.stuckT += dt;
    if (c.stuckT > 0.6) c.repath = 0;
    if (c.stuckT > 2.5) {
      const cc = toCell(c.x);
      const rr = toCell(c.z);
      if (passable(cc, rr) && !pointBlocked(level, cellX(cc), cellZ(rr), CREATURE_R)) {
        c.x = cellX(cc);
        c.z = cellZ(rr);
      }
      c.stuckT = 0;
    }
  } else c.stuckT = Math.max(0, c.stuckT - dt);
  return "moving";
}

/** Can the creature see the player right now? */
function seesPlayer(c, ctx) {
  const p = ctx.player;
  if (ctx.hiding || ctx.playerSafe) return false;
  const dx = p.x - c.x;
  const dz = p.z - c.z;
  const d = Math.hypot(dx, dz);
  let range = 9;
  if (p.flashlight) range += 5;
  if (p.crouching) range -= 3.5;
  if (ctx.playerLit) range += 3;
  if (d > range) return false;
  if (d > 2.6) {
    const fx = -Math.sin(c.yaw);
    const fz = -Math.cos(c.yaw);
    if ((dx * fx + dz * fz) / d < 0.42) return false;
  }
  return lineOfSight(ctx.level, c.x, c.z, p.x, p.z);
}

function emitStep(c, stride, ctx, heavy) {
  if (c.stepAcc >= stride) {
    c.stepAcc -= stride;
    ctx.emit({ type: "step", who: "creature", x: c.x, z: c.z, run: heavy });
  }
}

function lookAround(c, dt) {
  c.lookT += dt;
  c.headYaw = Math.sin(c.lookT * 1.3) * 0.9;
  c.anim = "look";
  c.speed = Math.max(0, c.speed - dt * 6);
}

/** One fixed step. ctx: { level, nav, player, hiding, hideLocker, playerSafe, playerLit, emit, sees(x,z), onCatch(), noise } */
export function stepCreature(c, dt, ctx) {
  c.animT += dt;
  if (c.state === CS.HIDDEN || c.state === CS.CATCH) return;
  c.headYaw *= 0.94;

  // ---------------------------------------------------- door bang / open
  if (c.bang) {
    const b = c.bang;
    c.anim = b.gentle ? "idle" : "bang";
    c.speed = 0;
    c.yaw = angleTo(c.x, c.z, b.door.x, b.door.z);
    b.t -= dt;
    if (!b.gentle) {
      b.beat = (b.beat ?? 0.15) - dt;
      if (b.beat <= 0) {
        b.beat = 0.5 + ctx.rand() * 0.2;
        b.hits++;
        b.door.shake = 1;
        ctx.emit({ type: "door", action: "bang", x: b.door.x, z: b.door.z });
      }
    }
    if (b.door.open >= 0.6 || b.door.locked) {
      c.bang = null;
    } else if (b.t <= 0) {
      if (!b.gentle) {
        b.door.target = 1;
        b.door.slam = DOOR_SLAM_SPEED;
        b.door.swing = b.door.axis === "z" ? (c.z < b.door.z ? 1 : -1) : (c.x < b.door.x ? 1 : -1);
        b.door.broken = true;
        ctx.emit({ type: "door", action: "burst", x: b.door.x, z: b.door.z });
      } else {
        b.door.target = 1;
        b.door.swing = b.door.axis === "z" ? (c.z < b.door.z ? 1 : -1) : (c.x < b.door.x ? 1 : -1);
        ctx.emit({ type: "door", action: "open", x: b.door.x, z: b.door.z, slow: true });
      }
      b.t = 99;
    }
    return;
  }

  const p = ctx.player;
  const distP = Math.hypot(p.x - c.x, p.z - c.z);

  switch (c.state) {
    case CS.SCRIPTED: {
      const s = c.script;
      s.total += dt;
      const visible = ctx.sees(c.x, c.z);
      if (s.i === 0) {
        // Standing still, facing the player, until seen long enough / approached / timed out.
        c.anim = "idle";
        c.yaw += wrap(angleTo(c.x, c.z, p.x, p.z) - c.yaw) * Math.min(1, dt * 1.5);
        if (visible) s.seenT += dt;
        if (s.seenT >= (s.seenHold ?? 1.4) || distP < (s.near ?? 9) || s.total >= (s.hold || 0) + (s.timeout ?? 20)) {
          s.i = 1;
          if (visible) ctx.emit({ type: "stinger", kind: "glimpse" });
        }
        break;
      }
      if (s.i < s.points.length) {
        const wp = s.points[s.i];
        const r = travel(c, wp.x, wp.z, s.speed ?? 1.4, dt, ctx, { allowSafe: true, accel: 3, turnRate: 4 });
        c.anim = (s.speed ?? 1.4) > 2.5 ? "run" : "walk";
        emitStep(c, (s.speed ?? 1.4) > 2.5 ? 1.9 : 1.15, ctx, (s.speed ?? 1.4) > 2.5);
        if (r === "arrived" || r === "blocked") s.i++;
        if (distP < 3.2) s.i = s.points.length; // too close — leave now (masked by the game)
        break;
      }
      // At the exit: vanish once unseen (or forced; the game masks it with a blackout).
      c.anim = "idle";
      c.speed = 0;
      s.waitT += dt;
      if (!visible || s.waitT > (s.forceAfter ?? 8) || distP < 3.2) {
        ctx.emit({ type: "creature", action: "vanish", masked: visible, x: c.x, z: c.z, then: s.then || null });
        hideCreature(c);
      }
      break;
    }

    case CS.PATROL: {
      const pt = c.patrol;
      if (seesPlayer(c, ctx)) {
        c.state = CS.CHASE;
        c.chase = { speed: pt.chaseSpeed ?? CREATURE_CHASE * 0.95, loseTime: pt.loseTime ?? 6, patrolChase: true };
        c.lostT = 0;
        c.chaseStartT = c.animT;
        ctx.emit({ type: "creature", action: "spotted", x: c.x, z: c.z });
        break;
      }
      if (ctx.noise && Math.hypot(ctx.noise.x - c.x, ctx.noise.z - c.z) < ctx.noise.r) {
        c.state = CS.INVESTIGATE;
        c.noise = { x: ctx.noise.x, z: ctx.noise.z };
        c.timer = 0;
        c.lookT = 0;
        ctx.emit({ type: "creature", action: "alert", x: c.x, z: c.z });
        break;
      }
      if (pt.waitT > 0) {
        pt.waitT -= dt;
        lookAround(c, dt);
        break;
      }
      const wp = pt.points[pt.i % pt.points.length];
      const r = travel(c, wp.x, wp.z, pt.speed ?? CREATURE_WALK, dt, ctx, { accel: 2 });
      c.anim = "walk";
      emitStep(c, 1.15, ctx, false);
      if (r === "arrived" || r === "blocked") {
        if (pt.once && pt.i >= pt.points.length - 1) {
          // A one-way walk-through: it's done, it leaves.
          c.patrol = null;
          c.home = { x: wp.x, z: wp.z };
          c.state = CS.RETURN;
          c.timer = 0;
          break;
        }
        pt.i = (pt.i + 1) % pt.points.length;
        pt.waitT = r === "arrived" ? 0.8 + ctx.rand() * 1.8 : 0.3;
        c.lookT = 0;
      }
      break;
    }

    case CS.INVESTIGATE:
    case CS.SEARCH: {
      if (seesPlayer(c, ctx)) {
        c.state = CS.CHASE;
        c.chase = c.chase || { speed: c.patrol?.chaseSpeed ?? CREATURE_CHASE * 0.95, loseTime: c.patrol?.loseTime ?? 6, patrolChase: true };
        c.lostT = 0;
        c.chaseStartT = c.animT;
        ctx.emit({ type: "creature", action: "spotted", x: c.x, z: c.z });
        break;
      }
      const goal = c.state === CS.SEARCH ? c.lastSeen : c.noise;
      if (ctx.noise && c.state === CS.SEARCH) c.noise = { x: ctx.noise.x, z: ctx.noise.z };
      if (!goal) {
        c.state = c.patrol ? CS.PATROL : CS.RETURN;
        break;
      }
      if (c.timer <= 0) {
        const r = travel(c, goal.x, goal.z, c.state === CS.SEARCH ? CREATURE_INVESTIGATE * 0.85 : CREATURE_INVESTIGATE, dt, ctx, { arrive: 0.8, accel: 3 });
        c.anim = "walk";
        emitStep(c, 1.2, ctx, false);
        if (r === "arrived" || r === "blocked") {
          c.timer = c.state === CS.SEARCH ? 4.5 : 3;
          c.lookT = 0;
        }
      } else {
        lookAround(c, dt);
        c.timer -= dt;
        if (c.timer <= 0) {
          c.timer = 0;
          c.noise = null;
          c.lastSeen = null;
          c.state = c.patrol ? CS.PATROL : CS.RETURN;
          c.path = null;
          if (c.patrol) c.patrol.waitT = 0;
        }
      }
      break;
    }

    case CS.CHASE: {
      const ch = c.chase || { speed: CREATURE_CHASE };
      c.voiceT -= dt;
      if (c.voiceT <= 0) {
        c.voiceT = 1.6 + ctx.rand() * 1.8;
        ctx.emit({ type: "voice", kind: "growl", x: c.x, z: c.z });
      }
      if (ctx.playerSafe) {
        ctx.onChaseLost?.("safe");
        break;
      }
      // Player hid?
      if (ctx.hiding) {
        if (c.sawHide) {
          const L = c.sawHide;
          const r = travel(c, L.outX, L.outZ, ch.speed * 0.8, dt, ctx, { arrive: 0.55, forceDoors: true });
          c.anim = "run";
          emitStep(c, 1.9, ctx, true);
          if (r === "arrived" || Math.hypot(L.outX - c.x, L.outZ - c.z) < 0.7) {
            c.state = CS.CATCH;
            ctx.onCatch({ locker: L });
          }
          break;
        }
        c.state = CS.SEARCH;
        c.lastSeen = c.lastSeen || { x: p.x, z: p.z };
        c.timer = 0;
        c.path = null;
        ctx.emit({ type: "creature", action: "lost", x: c.x, z: c.z });
        break;
      }
      const sees = lineOfSight(ctx.level, c.x, c.z, p.x, p.z);
      if (sees) {
        c.lostT = 0;
        c.lastSeen = { x: p.x, z: p.z };
      } else {
        c.lostT += dt;
        if (ch.loseTime && c.lostT > ch.loseTime && distP > 9) {
          c.state = CS.SEARCH;
          c.timer = 0;
          c.path = null;
          ctx.emit({ type: "creature", action: "lost", x: c.x, z: c.z });
          break;
        }
      }
      // Gentle rubber band: a little faster when far behind, never faster than a sprinting player.
      const ramp = Math.min(1, (c.animT - (c.chaseStartT ?? 0)) / 1.2);
      let speed = ch.speed * (distP > 14 ? 1.1 : 1);
      speed *= 0.55 + 0.45 * ramp;
      const r = travel(c, p.x, p.z, speed, dt, ctx, { arrive: 0.2, forceDoors: true, repath: 0.22, accel: 6, turnRate: 7 });
      c.anim = "run";
      emitStep(c, 1.9, ctx, true);
      if (r === "blocked") {
        c.lostT += dt;
      }
      if (distP < CATCH_DIST && !ctx.playerSafe) {
        c.state = CS.CATCH;
        c.speed = 0;
        ctx.onCatch({});
      }
      break;
    }

    case CS.RETURN: {
      const home = c.home || null;
      c.timer += dt;
      const visible = ctx.sees(c.x, c.z);
      if (home) {
        const r = travel(c, home.x, home.z, 1.7, dt, ctx, { accel: 2 });
        c.anim = "walk";
        emitStep(c, 1.15, ctx, false);
        if ((r === "arrived" || r === "blocked") && !visible) hideCreature(c);
        else if (!visible && distP > 14 && c.timer > 2) hideCreature(c);
      } else if (!visible || c.timer > 12) {
        hideCreature(c);
      } else {
        c.anim = "idle";
      }
      if (c.timer > 25) hideCreature(c);
      break;
    }
    default:
      break;
  }

  // Low breathing / growls when it's near and not chasing.
  if (c.state === CS.PATROL || c.state === CS.SEARCH || c.state === CS.INVESTIGATE) {
    c.voiceT -= dt;
    if (c.voiceT <= 0) {
      c.voiceT = 3.5 + ctx.rand() * 4;
      ctx.emit({ type: "voice", kind: "breath", x: c.x, z: c.z });
    }
  }
}

/** Places the creature for a chase without it ever appearing on top of / in view of the player. */
export function chooseSpawn(level, nav, player, candidates, sees, minDist) {
  const ok = [];
  for (const m of candidates) {
    if (!m) continue;
    const d = Math.hypot(m.x - player.x, m.z - player.z);
    if (d < minDist) continue;
    if (pointBlocked(level, m.x, m.z, CREATURE_R)) continue;
    const path = findPath(level, toCell(m.x), toCell(m.z), toCell(player.x), toCell(player.z), nav.passable);
    if (!path) continue;
    ok.push({ ...m, visible: sees(m.x, m.z), d });
  }
  const hidden = ok.find((s) => !s.visible);
  if (hidden) return hidden;
  if (ok.length) return ok[0];
  // Fallback: a reachable cell 9–16 m away that the player can't see.
  let best = null;
  for (const f of level.floors) {
    const d = Math.hypot(f.x - player.x, f.z - player.z);
    if (d < 9 || d > 18) continue;
    if (!nav.passable(f.c, f.r) || sees(f.x, f.z)) continue;
    if (!best || Math.abs(d - 12) < Math.abs(best.d - 12)) best = { x: f.x, z: f.z, d };
  }
  return best;
}
