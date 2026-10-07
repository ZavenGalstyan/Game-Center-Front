/**
 * Pirate Cove — island enemies: Pirate Grunt, Pirate Captain, Skeleton.
 *
 *   IDLE / PATROL → NOTICE → CHASE → ATTACK (windup → strike → recover) → CHASE …
 *                         HIT (stagger) ↺           DEFEATED (once)
 *
 * Every blow is telegraphed by a windup; a strike can hurt the pirate once.
 * At most two foes swing at a time (an attack token), the rest circle.
 * Foes never enter water, never leave their area, and lose interest and walk
 * home when the pirate gets far away.
 */
import { moveBody, groundAt } from "./onfoot.js";
import { clamp, wrapAngle, mulberry32 } from "./rng.js";

export const FOE_TYPES = {
  grunt: { name: "Pirate Grunt", hp: 44, dmg: 11, speed: 3.6, windup: 0.55, strike: 0.14, recover: 0.6, reach: 1.9, r: 0.45, gold: 15, scale: 1 },
  captain: { name: "Pirate Captain", hp: 110, dmg: 18, speed: 3.3, windup: 0.72, strike: 0.16, recover: 0.7, reach: 2.2, r: 0.5, gold: 45, scale: 1.12 },
  skeleton: { name: "Skeleton Pirate", hp: 36, dmg: 10, speed: 4.1, windup: 0.45, strike: 0.12, recover: 0.55, reach: 1.9, r: 0.42, gold: 12, scale: 1 },
  guardian: { name: "Cursed Guardian", hp: 170, dmg: 20, speed: 3.4, windup: 0.75, strike: 0.18, recover: 0.75, reach: 2.4, r: 0.6, gold: 80, scale: 1.3 },
};

export const FOE = { IDLE: "IDLE", PATROL: "PATROL", NOTICE: "NOTICE", CHASE: "CHASE", ATTACK: "ATTACK", HIT: "HIT", DEFEATED: "DEFEATED", RETURN: "RETURN" };

export function createFoe(def, pos, index, scale = 1) {
  const T = FOE_TYPES[def.type] || FOE_TYPES.grunt;
  const rand = mulberry32(index * 131 + 7);
  return {
    id: def.id,
    type: def.type,
    T,
    group: def.group || null,
    area: def.area || "out",
    x: pos.x,
    z: pos.z,
    y: 0,
    yaw: def.yaw ?? rand() * Math.PI * 2,
    home: { x: pos.x, z: pos.z },
    hp: Math.round(T.hp * scale),
    maxHp: Math.round(T.hp * scale),
    dmgScale: scale,
    state: def.patrol ? FOE.PATROL : FOE.IDLE,
    stateT: rand() * 2,
    patrolR: def.patrol ?? 0,
    wp: null,
    alive: true,
    deadT: 0,
    hitBy: -1,
    struck: false,
    vx: 0,
    vz: 0,
    grounded: true,
    hasToken: false,
    rand,
    flash: 0,
    walk: 0,
    noticed: false,
    drop: def.drop || null,
    dropped: false,
  };
}

/**
 * Steps every foe in `area`. ctx = { land, pirate, time, emit, tokens:{n} }.
 * Damage to the pirate is reported via emit({type:"foeStrike", foe}) — the
 * game applies it (block / dodge rules live in onfoot.hurtPirate).
 */
export function stepFoes(foes, ctx, dt) {
  const P = ctx.pirate;
  let tokens = 0;
  for (const f of foes) if (f.alive && f.hasToken) tokens++;
  for (const f of foes) {
    if (f.area !== ctx.area) continue;
    if (!f.alive) {
      f.deadT += dt;
      continue;
    }
    f.stateT += dt;
    if (f.flash > 0) f.flash -= dt * 4;
    const T = f.T;
    const pdx = P ? P.x - f.x : 0;
    const pdz = P ? P.z - f.z : 0;
    const pd = P ? Math.hypot(pdx, pdz) : Infinity;
    const pAlive = P && P.state !== "dead";
    const bearing = Math.atan2(pdx, pdz);
    let tvx = 0;
    let tvz = 0;
    let face = null;

    switch (f.state) {
      case FOE.IDLE:
        if (f.stateT > 3) {
          f.stateT = 0;
          face = f.yaw + (f.rand() - 0.5) * 2;
          f.yaw = face;
        }
        if (pAlive && pd < 13) notice(f, ctx);
        break;
      case FOE.PATROL: {
        if (!f.wp || Math.hypot(f.wp.x - f.x, f.wp.z - f.z) < 0.8 || f.stateT > 7) {
          const a = f.rand() * Math.PI * 2;
          const r = f.patrolR * (0.3 + f.rand() * 0.7);
          f.wp = { x: f.home.x + Math.cos(a) * r, z: f.home.z + Math.sin(a) * r };
          f.stateT = 0;
        }
        const dx = f.wp.x - f.x;
        const dz = f.wp.z - f.z;
        const d = Math.hypot(dx, dz) || 1;
        tvx = (dx / d) * 1.4;
        tvz = (dz / d) * 1.4;
        face = Math.atan2(dx, dz);
        if (pAlive && pd < 13) notice(f, ctx);
        break;
      }
      case FOE.NOTICE:
        face = bearing;
        if (f.stateT > 0.55) setState(f, FOE.CHASE);
        break;
      case FOE.CHASE: {
        if (!pAlive || pd > 26 || Math.hypot(f.x - f.home.x, f.z - f.home.z) > 38) {
          setState(f, FOE.RETURN);
          break;
        }
        face = bearing;
        const wantAttack = pd < T.reach + 0.25;
        if (wantAttack && (f.hasToken || tokens < 2)) {
          if (!f.hasToken) {
            f.hasToken = true;
            tokens++;
          }
          setState(f, FOE.ATTACK);
          f.struck = false;
          ctx.emit({ type: "foeWindup", foe: f });
          break;
        }
        // without a token: hover at a respectful distance and circle
        const holdOff = f.hasToken || tokens < 2 ? 0 : 3.4;
        const sp = T.speed;
        if (pd > T.reach * 0.85 + holdOff) {
          tvx = (pdx / pd) * sp;
          tvz = (pdz / pd) * sp;
        } else if (holdOff) {
          const side = f.id.length % 2 ? 1 : -1;
          tvx = (-pdz / pd) * 1.6 * side;
          tvz = (pdx / pd) * 1.6 * side;
        }
        break;
      }
      case FOE.ATTACK: {
        const wind = T.windup;
        if (f.stateT < wind) {
          face = bearing; // tracks you during the windup only
        } else if (f.stateT < wind + T.strike) {
          // lunge
          tvx = Math.sin(f.yaw) * 3;
          tvz = Math.cos(f.yaw) * 3;
          if (!f.struck && pAlive) {
            const toP = Math.atan2(P.x - f.x, P.z - f.z);
            if (pd < T.reach + 0.35 && Math.abs(wrapAngle(toP - f.yaw)) < 1.0) {
              f.struck = true;
              ctx.emit({ type: "foeStrike", foe: f, dmg: T.dmg * f.dmgScale });
            }
          }
        } else if (f.stateT > wind + T.strike + T.recover) {
          f.hasToken = false;
          setState(f, FOE.CHASE);
        }
        break;
      }
      case FOE.HIT:
        if (f.stateT > 0.38) setState(f, pAlive ? FOE.CHASE : FOE.RETURN);
        break;
      case FOE.RETURN: {
        const dx = f.home.x - f.x;
        const dz = f.home.z - f.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.2) {
          setState(f, f.patrolR ? FOE.PATROL : FOE.IDLE);
          f.noticed = false;
          break;
        }
        tvx = (dx / d) * 2.6;
        tvz = (dz / d) * 2.6;
        face = Math.atan2(dx, dz);
        if (pAlive && pd < 9) notice(f, ctx);
        if (f.stateT > 14) {
          // never wander forever
          f.x = f.home.x;
          f.z = f.home.z;
        }
        break;
      }
      default:
        break;
    }

    if (face != null) {
      const d = wrapAngle(face - f.yaw);
      f.yaw = wrapAngle(f.yaw + clamp(d, -dt * 9, dt * 9));
    }
    const k = Math.min(1, dt * 10);
    f.vx += (tvx - f.vx) * k;
    f.vz += (tvz - f.vz) * k;
    // foes push off each other
    for (const o of foes) {
      if (o === f || !o.alive || o.area !== f.area) continue;
      const dx = f.x - o.x;
      const dz = f.z - o.z;
      const d = Math.hypot(dx, dz);
      const m = f.T.r + o.T.r + 0.2;
      if (d < m && d > 1e-4) {
        f.vx += (dx / d) * (m - d) * 6;
        f.vz += (dz / d) * (m - d) * 6;
      }
    }
    // and off the pirate
    if (P && pd < f.T.r + 0.45 && pd > 1e-4) {
      f.vx -= (pdx / pd) * 3;
      f.vz -= (pdz / pd) * 3;
    }
    const ox = f.x;
    const oz = f.z;
    f.y = f.y || groundAt(ctx.land, f.area, f.x, f.z, 50).h;
    f.grounded = true;
    const g = moveBody(ctx.land, f.area, f, f.x + f.vx * dt, f.z + f.vz * dt, f.T.r);
    f.y += (g.h - f.y) * Math.min(1, dt * 14);
    f.walk += Math.hypot(f.x - ox, f.z - oz);
  }
}

function setState(f, s) {
  f.state = s;
  f.stateT = 0;
  if (s !== FOE.ATTACK) f.hasToken = false;
}

function notice(f, ctx) {
  setState(f, FOE.NOTICE);
  if (!f.noticed) {
    f.noticed = true;
    ctx.emit({ type: "foeNotice", foe: f });
  }
}

/** Sword hit: applies once per swing id. Returns "defeated" once, "hit", or null. */
export function hitFoe(f, dmg, swingId, fromX, fromZ) {
  if (!f.alive || f.hitBy === swingId) return null;
  f.hitBy = swingId;
  f.hp = Math.max(0, f.hp - dmg);
  f.flash = 1;
  const dx = f.x - fromX;
  const dz = f.z - fromZ;
  const d = Math.hypot(dx, dz) || 1;
  f.vx = (dx / d) * 6;
  f.vz = (dz / d) * 6;
  if (f.hp <= 0) {
    f.alive = false;
    f.state = FOE.DEFEATED;
    f.stateT = 0;
    f.hasToken = false;
    return "defeated";
  }
  // a captain/guardian mid-swing shrugs off the stagger (heavier foes feel heavier)
  const heavy = f.type === "captain" || f.type === "guardian";
  if (!(heavy && f.state === FOE.ATTACK && f.stateT > f.T.windup * 0.5)) {
    f.state = FOE.HIT;
    f.stateT = 0;
    f.hasToken = false;
  }
  if (!f.noticed) f.noticed = true;
  return "hit";
}
