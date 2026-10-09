/**
 * Pirate Cove — enemy captains. A small, readable state machine:
 *
 *   PATROL → NOTICE → APPROACH → POSITION → FIRE → REPOSITION → POSITION …
 *                                               (SINK when the hull breaks)
 *
 * Fairness rules (same as the player's):
 *   - fires only a side whose reload has finished, only when the target is
 *     inside that side's ±40° arc and in range, and only with a clear line of
 *     fire (no island/rock between) — never backwards, never through land
 *   - turns with the same ship physics; leads a moving target only partly
 *     (`aim`), with a per-volley yaw/range error
 *   - ignores a docked ship (the player is ashore)
 *
 * Safety: decisions run at 5 Hz; a leash keeps every captain near its patrol
 * home and inside the sea; a stuck detector reverses off shoals; the probe
 * steering looks ahead for land before committing to a heading.
 */
import { createShip, forwardOf, rightOf } from "./ship.js";
import { tryBroadside, tryChaser, inArc, gunRange, leadSolution } from "./cannons.js";
import { SHIP_CLASSES, ENEMY_TYPES } from "../data/ships.js";
import { clamp, wrapAngle, mulberry32 } from "./rng.js";
import { SHIP_DRAFT } from "./terrain.js";

export const AI = {
  PATROL: "PATROL",
  NOTICE: "NOTICE",
  APPROACH: "APPROACH",
  POSITION: "POSITION",
  FIRE: "FIRE",
  REPOSITION: "REPOSITION",
  SINK: "SINK",
};

/** Builds an enemy ship from data: spawn = { type, x, z, heading, patrol?, group, aggro? }. */
export function createEnemyShip(spawn, scale = {}, index = 0) {
  const T = ENEMY_TYPES[spawn.type] || ENEMY_TYPES.pirateSloop;
  const base = SHIP_CLASSES[T.cls];
  const hm = (scale.hull || 1) * T.hull;
  const stats = {
    ...base,
    hull: Math.round(base.hull * hm),
    damage: base.damage * T.damage * (scale.damage || 1),
    reload: base.reload * T.reload,
    maxSpeed: base.maxSpeed * T.speed,
    turnRate: base.turnRate * T.turn,
  };
  const s = createShip(stats, {
    id: spawn.id,
    team: "enemy",
    typeId: spawn.type,
    name: T.name,
    boss: !!T.boss,
    look: { sail: T.sail, flag: T.flag, hullColor: T.hullColor, accent: T.accent, tattered: T.tattered, cursed: T.cursed },
    x: spawn.x,
    z: spawn.z,
    heading: spawn.heading ?? 0,
    throttle: 0.35,
    speed: 3,
    group: spawn.group,
    spawnIndex: index,
  });
  s.gold = T.gold;
  s.chaser = T.chaser ? { ...T.chaser, damage: T.chaser.damage * (scale.damage || 1) } : null;
  const rand = mulberry32(index * 977 + Math.round(spawn.x * 13 + spawn.z * 7));
  s.ai = {
    state: AI.PATROL,
    t: 0,
    think: rand() * 0.2,
    home: { x: spawn.x, z: spawn.z },
    patrolR: spawn.patrol ?? 90,
    leash: (spawn.patrol ?? 90) + 320,
    detect: spawn.detect ?? (T.boss ? 260 : 190),
    aggro: !!spawn.aggro,
    wp: null,
    side: rand() < 0.5 ? "left" : "right",
    desired: s.heading,
    throttle: 0.35,
    stuckT: 0,
    unstickT: 0,
    unstickDir: 1,
    repT: 0,
    aimSkill: T.aim,
    rand,
    noticeT: 0,
    noticed: false,
  };
  return s;
}

function clearAhead(terrain, x, z, heading, dist) {
  const f = forwardOf(heading);
  for (let d = 12; d <= dist; d += 12) {
    if (terrain.height(x + f.x * d, z + f.z * d) > SHIP_DRAFT - 1.2) return d;
  }
  return Infinity;
}

/** Picks the heading closest to `want` whose look-ahead is clear of land. */
function steerAround(terrain, s, want, look) {
  const offs = [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.3, -2.3];
  let bestH = want;
  let bestD = -1;
  for (const o of offs) {
    const h = wrapAngle(want + o);
    const d = clearAhead(terrain, s.x, s.z, h, look);
    if (d === Infinity) return { heading: h, blocked: o !== 0 };
    if (d > bestD) {
      bestD = d;
      bestH = h;
    }
  }
  return { heading: bestH, blocked: true };
}

/** Line of fire: samples the straight line for land above the waterline. */
export function lineOfFire(terrain, ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.ceil(d / 6));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (terrain.height(ax + (bx - ax) * t, az + (bz - az) * t) > 0.4) return false;
  }
  return true;
}

/**
 * One AI tick for `s` against `player` (may be docked / absent). Writes the
 * ship's control into the returned object; firing goes through the same
 * tryBroadside() the player uses.
 */
export function thinkShip(s, player, env, dt) {
  const ai = s.ai;
  if (!s.alive) {
    ai.state = AI.SINK;
    return { steer: 0, setThrottle: 0 };
  }
  ai.t += dt;
  ai.think -= dt;
  const T = env.terrain;
  const range = gunRange(s.stats);
  const targetable = player && player.alive && !player.docked && !player.removed && env.playerAtSea;
  const dx = targetable ? player.x - s.x : 0;
  const dz = targetable ? player.z - s.z : 0;
  const dist = targetable ? Math.hypot(dx, dz) : Infinity;
  const fromHome = Math.hypot(s.x - ai.home.x, s.z - ai.home.z);

  if (ai.think <= 0) {
    ai.think = 0.2;
    decide(s, ai, player, env, dist, range, fromHome, targetable);
  }

  // --- stuck detection: pushing throttle but not moving (or grounded) → back off and turn
  if (ai.unstickT > 0) {
    ai.unstickT -= dt;
    return { steer: ai.unstickDir, setThrottle: -0.2 };
  }
  if ((s.grounded > 0.6 || (ai.throttle > 0.35 && Math.abs(s.speed) < 0.8)) && ai.t > 2) ai.stuckT += dt;
  else ai.stuckT = Math.max(0, ai.stuckT - dt * 2);
  if (ai.stuckT > 2.2) {
    ai.stuckT = 0;
    ai.unstickT = 2.6;
    ai.unstickDir = ai.rand() < 0.5 ? -1 : 1;
    return { steer: ai.unstickDir, setThrottle: -0.2 };
  }

  // --- leash / sea edge override
  let want = ai.desired;
  const edge = env.boundary;
  if (edge) {
    const dc = Math.hypot(s.x - (edge.cx || 0), s.z - (edge.cz || 0));
    if (dc > edge.warn - 60) want = Math.atan2((edge.cx || 0) - s.x, (edge.cz || 0) - s.z);
  }
  if (fromHome > ai.leash) want = Math.atan2(ai.home.x - s.x, ai.home.z - s.z);

  const look = 30 + Math.abs(s.speed) * 3.2;
  const sa = steerAround(T, s, want, look);
  let thr = ai.throttle;
  if (sa.blocked) thr = Math.min(thr, 0.45);
  const diff = wrapAngle(sa.heading - s.heading);
  // proportional steering with a dead-band → no endless wiggle or spinning
  const steer = Math.abs(diff) < 0.04 ? 0 : clamp(diff * 2.2, -1, 1);
  return { steer, setThrottle: thr };
}

function decide(s, ai, player, env, dist, range, fromHome, targetable) {
  const time = env.time;
  // Ship-to-ship spacing: steer away from close friendlies.
  const sep = separation(s, env.ships);

  if (!targetable || dist > ai.detect * (ai.state === AI.PATROL ? 1 : 1.7) || fromHome > ai.leash + 40) {
    if (ai.state !== AI.PATROL) ai.state = AI.PATROL;
    patrol(s, ai);
    if (targetable && (dist < ai.detect || ai.aggro) && fromHome < ai.leash) {
      ai.state = AI.NOTICE;
      ai.noticeT = 1.1;
      if (!ai.noticed) {
        ai.noticed = true;
        env.emit({ type: "enemyNotice", ship: s });
      }
    }
    return;
  }

  const bearing = Math.atan2(player.x - s.x, player.z - s.z);
  switch (ai.state) {
    case AI.PATROL:
      ai.state = AI.NOTICE;
      ai.noticeT = 1.1;
      if (!ai.noticed) {
        ai.noticed = true;
        env.emit({ type: "enemyNotice", ship: s });
      }
      break;
    case AI.NOTICE:
      ai.desired = bearing;
      ai.throttle = 0.6;
      ai.noticeT -= 0.2;
      if (ai.noticeT <= 0) ai.state = AI.APPROACH;
      break;
    case AI.APPROACH: {
      // aim for a point abeam of the player at ~60% range
      const pr = rightOf(player.heading);
      const sgn = ai.side === "left" ? 1 : -1;
      const tx = player.x + pr.x * range * 0.6 * sgn;
      const tz = player.z + pr.z * range * 0.6 * sgn;
      ai.desired = Math.atan2(tx - s.x, tz - s.z);
      ai.throttle = 0.95;
      if (dist < range * 0.95) ai.state = AI.POSITION;
      break;
    }
    case AI.POSITION: {
      // choose the side that's ready and needs the smaller turn
      const lt = Math.abs(wrapAngle(bearing - Math.PI / 2 - s.heading));
      const rt = Math.abs(wrapAngle(bearing + Math.PI / 2 - s.heading));
      const lReady = s.reload.left <= time;
      const rReady = s.reload.right <= time;
      if (lReady && !rReady) ai.side = "left";
      else if (rReady && !lReady) ai.side = "right";
      else ai.side = lt < rt ? "left" : "right";
      // player on our left → heading = bearing − 90°, on our right → bearing + 90°
      let h = ai.side === "left" ? bearing - Math.PI / 2 : bearing + Math.PI / 2;
      // range keeping: close in when far, open when close
      const want = range * 0.6;
      const corr = clamp((dist - want) / want, -0.6, 0.6) * 0.7;
      h += ai.side === "left" ? corr : -corr;
      ai.desired = wrapAngle(h + sep);
      ai.throttle = dist < range * 0.3 ? 0.9 : 0.7;
      const arc = inArc(s, ai.side, player.x, player.z);
      const ready = s.reload[ai.side] <= time;
      if (ready && arc.ok && dist < range * 1.02 && lineOfFire(env.terrain, s.x, s.z, player.x, player.z)) ai.state = AI.FIRE;
      // boss bow chaser: player roughly dead ahead
      if (s.chaser) {
        const ahead = Math.abs(wrapAngle(bearing - s.heading)) < 0.18;
        if (ahead && dist < range * 1.15 && lineOfFire(env.terrain, s.x, s.z, player.x, player.z)) {
          if (tryChaser(s, time, dist)) env.emit({ type: "enemyFire", ship: s, side: "bow" });
        }
      }
      if (dist > range * 1.5) ai.state = AI.APPROACH;
      break;
    }
    case AI.FIRE: {
      const arc = inArc(s, ai.side, player.x, player.z);
      if (!arc.ok) {
        ai.state = AI.POSITION;
        break;
      }
      // partial lead (skill-scaled, with per-volley error): never perfect prediction
      const lead = ai.aimSkill * (0.75 + ai.rand() * 0.5);
      const sol = leadSolution(s, ai.side, player, lead);
      const err = (1 - ai.aimSkill) * 0.16;
      const fired = tryBroadside(s, ai.side, time, {
        dist: sol.dist * (0.94 + ai.rand() * 0.12),
        yawError: clamp(sol.yaw, -0.3, 0.3) + (ai.rand() - 0.5) * err,
        rangeErr: 0.12,
      });
      if (fired) env.emit({ type: "enemyFire", ship: s, side: ai.side });
      ai.state = AI.REPOSITION;
      ai.repT = 2.2 + ai.rand() * 1.8;
      // swing away a little so the next pass uses the other side
      ai.desired = wrapAngle(s.heading + (ai.side === "left" ? -0.6 : 0.6));
      ai.throttle = 0.9;
      break;
    }
    case AI.REPOSITION:
      ai.repT -= 0.2;
      ai.desired = wrapAngle(ai.desired + sep * 0.5);
      if (dist < range * 0.25) ai.desired = wrapAngle(bearing + Math.PI);
      if (ai.repT <= 0) ai.state = AI.POSITION;
      break;
    default:
      break;
  }
}

function patrol(s, ai) {
  if (!ai.wp || Math.hypot(ai.wp.x - s.x, ai.wp.z - s.z) < 25) {
    const a = ai.rand() * Math.PI * 2;
    const r = ai.patrolR * (0.4 + ai.rand() * 0.6);
    ai.wp = { x: ai.home.x + Math.cos(a) * r, z: ai.home.z + Math.sin(a) * r };
  }
  ai.desired = Math.atan2(ai.wp.x - s.x, ai.wp.z - s.z);
  ai.throttle = 0.38;
}

function separation(s, ships) {
  if (!ships) return 0;
  let push = 0;
  for (const o of ships) {
    if (o === s || o.removed || !o.alive || o.team !== s.team) continue;
    const dx = o.x - s.x;
    const dz = o.z - s.z;
    const d = Math.hypot(dx, dz);
    if (d > 45 || d < 0.1) continue;
    const rel = wrapAngle(Math.atan2(dx, dz) - s.heading);
    push += (rel > 0 ? -1 : 1) * (1 - d / 45) * 0.6;
  }
  return clamp(push, -0.8, 0.8);
}
