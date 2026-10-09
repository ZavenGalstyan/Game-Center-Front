/**
 * Zombie Outbreak — boss controllers.
 *
 * Bosses are zombies (same pool, body, pose, navigation and damage rules)
 * with a scripted attack table instead of a single swing. Every special
 * attack has a visible telegraph (a ground warning circle, a charge line, a
 * crouch/roar) for most of its wind-up, and the big ones end in a recovery
 * window where the boss stands slumped and open. Every timeline is bounded,
 * so a boss can never get stuck mid-attack (and so can never become
 * effectively invincible).
 *
 *   Brute King    slam · charge (stuns itself on walls) · jump shockwave (jump over it)
 *   Infected Beast swipe · dash · leap onto a marked circle — each followed by a recovery
 *   Toxic Giant   heavy slam · toxic glob volley (marked landing spots, puddles) · burst zones
 *   Night Stalker swipe · lunge · retreats to an entrance, then charges back in from it
 *   Outbreak Titan slam · charged rush · summons a few zombies; enraged below 50 %
 */
import { clamp, approachAngle, wrapAngle, yawTo } from "./math.js";

const sinY = Math.sin;
const cosY = Math.cos;

function begin(z, kind, windup, hitAt, end, data = {}) {
  z.state = "ATTACKING";
  z.atkKind = kind;
  z.atkWindup = windup;
  z.atkHitAt = hitAt;
  z.atkEnd = end;
  z.atkDone = false;
  z.anim.atk = 0;
  z.anim.atkKind = kind === "rush" ? "charge" : kind === "volley" ? "spit" : kind === "zones" || kind === "summon" ? "roar" : kind;
  z.bs.data = data;
  z.bs.lastKind = kind;
  z.bs.count++;
}

function enrage(z) {
  return z.bs.phase === 2 ? 0.72 : 1;
}

/**
 * Called while the boss is CHASING. Returns "attack" if it started one,
 * { speed } to chase at a given speed, { away, tx, tz, speed } to move to a
 * point (stalker retreat), or null for a normal chase.
 */
export function bossThink(z, dt, g, dist) {
  const def = z.def;
  const bs = z.bs;
  const p = g.player;
  bs.next -= dt;
  const faceErr = Math.abs(wrapAngle(yawTo(z.x, z.z, p.x, p.z) - z.yaw));
  const R = def.attack;
  const r = g.rng;

  // Titan enrages once below half health.
  if (z.type === "titan" && bs.phase === 1 && z.hp < z.maxHp * 0.5) {
    bs.phase = 2;
    z.speedMul *= 1.25;
    g.emit({ type: "boss_phase", boss: z.type });
    begin(z, "summon", 1.1, 1.1, 1.7);
    return "attack";
  }

  if (z.type === "stalker") return stalkerThink(z, dt, g, dist, faceErr);

  const canSee = dist < 26 && g.world.clearShot(z.x, 1.6 * z.scale, z.z, p.x, p.y + 1.2, p.z);

  if (dist <= R.range && z.atkCd <= 0 && faceErr < 0.8) {
    const kind = z.type === "beast" || z.type === "stalker" ? "swipe" : z.type === "toxicGiant" ? "heavy" : "slam";
    begin(z, kind, R.windup, R.hit, R.hit + R.recover, { cx: 0, cz: 0 });
    // Ground warning where the blow will land.
    if (kind !== "swipe") {
      const cx = z.x + sinY(z.yaw) * R.range * 0.55;
      const cz = z.z + cosY(z.yaw) * R.range * 0.55;
      z.bs.data.cx = cx;
      z.bs.data.cz = cz;
      g.addHazard("warn", cx, cz, 2.3 + z.scale * 0.25, { dur: R.windup, follow: z, ahead: R.range * 0.55 });
    }
    return "attack";
  }

  if (bs.next <= 0 && canSee && z.state === "CHASING") {
    bs.next = r.range(3.2, 4.8) * enrage(z);
    switch (z.type) {
      case "bruteKing": {
        if (dist > 7 && (bs.lastKind !== "charge" || r.chance(0.3))) return startCharge(z, g, 1.0, 11.5, 1.35, 1.8);
        return startShock(z, g);
      }
      case "beast": {
        bs.next = r.range(2.4, 3.4);
        if (dist > 6 && r.chance(0.55)) return startLeap(z, g);
        return startCharge(z, g, 0.55, 15, 0.5, 1.1, "dash");
      }
      case "toxicGiant": {
        if (dist > 6 && bs.lastKind !== "volley") {
          begin(z, "volley", 1.0, 1.0, 1.7);
          g.emit({ type: "roar", x: z.x, z: z.z, boss: z.type, small: true });
          return "attack";
        }
        begin(z, "zones", 0.75, 0.75, 1.5);
        g.emit({ type: "roar", x: z.x, z: z.z, boss: z.type, small: true });
        return "attack";
      }
      case "titan": {
        if (g.minionCount() < 4 && bs.lastKind !== "summon" && bs.count % 3 === 2) {
          begin(z, "summon", 1.2, 1.2, 1.8);
          g.emit({ type: "roar", x: z.x, z: z.z, boss: z.type });
          return "attack";
        }
        if (dist > 6.5) return startCharge(z, g, 1.0, 12, 1.4, 1.6, "rush");
        return startShock(z, g);
      }
      default:
        break;
    }
  }
  return null;
}

function startCharge(z, g, windup, speed, dur, stun, kind = "charge") {
  begin(z, kind, windup, windup, windup + dur, { speed, dur, stun, hitDone: false, dirX: 0, dirZ: 0, locked: false, wall: false });
  g.addHazard("line", z.x, z.z, 1.2 * z.scale * 0.5, { dur: windup, follow: z, len: speed * dur * 0.9 });
  g.emit({ type: "roar", x: z.x, z: z.z, boss: z.type, small: true });
  return "attack";
}

function startShock(z, g) {
  begin(z, "shock", 1.0, 1.0, 1.7, {});
  g.addHazard("warn", z.x, z.z, 3.2, { dur: 1.0, follow: z, ring: true });
  return "attack";
}

function startLeap(z, g) {
  begin(z, "leap", 0.6, 1.45, 1.45, { sx: z.x, sz: z.z, tx: g.player.x, tz: g.player.z, landed: false });
  g.emit({ type: "roar", x: z.x, z: z.z, boss: z.type, small: true });
  return "attack";
}

/* ------------------------------------------------------------------ stalker */

function stalkerThink(z, dt, g, dist, faceErr) {
  const bs = z.bs;
  const p = g.player;
  const R = z.def.attack;
  const d = bs.data;
  bs.mode = bs.mode || "hunt";
  if (bs.mode === "retreat") {
    z.shroud = Math.min(1, (z.shroud || 0) + dt * 1.2);
    const dd = Math.hypot(d.ex - z.x, d.ez - z.z);
    d.t = (d.t || 0) + dt;
    if (dd < 1.6 || d.t > 9) {
      bs.mode = "lurk";
      d.t = 0;
      d.wait = g.rng.range(1.0, 2.0);
    }
    return { away: true, tx: d.ex, tz: d.ez, speed: z.def.run * 1.1 };
  }
  if (bs.mode === "lurk") {
    d.t += dt;
    z.yaw = approachAngle(z.yaw, yawTo(z.x, z.z, p.x, p.z), dt * 3);
    if (d.t >= d.wait) {
      bs.mode = "hunt";
      bs.lunges = 0;
      bs.next = 0.8;
      g.emit({ type: "screech", x: z.x, z: z.z });
    }
    return { speed: 0 };
  }
  // Hunt.
  z.shroud = Math.max(0, (z.shroud || 0) - dt * 2);
  bs.next -= 0; // (already decremented by caller)
  if ((bs.lunges || 0) >= 2 || (bs.hurt || 0) > z.maxHp * 0.14) {
    bs.hurt = 0;
    bs.lunges = 0;
    const e = g.farEntrance(z.cls);
    bs.mode = "retreat";
    bs.data = { ex: e.x, ez: e.z, t: 0 };
    g.emit({ type: "roar", x: z.x, z: z.z, boss: z.type, small: true });
    return { away: true, tx: e.x, tz: e.z, speed: z.def.run };
  }
  if (dist <= R.range && z.atkCd <= 0 && faceErr < 0.8) {
    begin(z, "swipe", R.windup, R.hit, R.hit + R.recover, {});
    return "attack";
  }
  if (bs.next <= 0 && dist < 8 && dist > 2.6 && g.world.clearShot(z.x, 1.5 * z.scale, z.z, p.x, p.y + 1.2, p.z)) {
    bs.next = g.rng.range(1.6, 2.6);
    bs.lunges = (bs.lunges || 0) + 1;
    return startCharge(z, g, 0.5, 13, 0.42, 0.65, "lunge");
  }
  return { speed: z.def.run * z.speedMul };
}

/* ------------------------------------------------------------------ attack timelines */

export function bossAct(z, dt, g, dist) {
  const A = z.anim;
  const bs = z.bs;
  const d = bs.data;
  const p = g.player;
  A.atk += dt;
  const k = A.atk;
  const kind = z.atkKind;
  const def = z.def;
  // Hard bound on every timeline.
  if (k > 6) return endAttack(z, g, 0);

  switch (kind) {
    case "slam":
    case "heavy":
    case "swipe": {
      if (k < z.atkHitAt * 0.6) z.yaw = approachAngle(z.yaw, yawTo(z.x, z.z, p.x, p.z), dt * 2);
      if (!z.atkDone && k >= z.atkHitAt) {
        z.atkDone = true;
        if (kind === "swipe") {
          const inArc = Math.abs(wrapAngle(yawTo(z.x, z.z, p.x, p.z) - z.yaw)) < 1.1;
          if (dist <= def.attack.range + 0.4 && inArc) g.damagePlayer(def.attack.damage * z.dmgMul, z.x, z.z, z.type);
          else g.emit({ type: "zwhiff", x: z.x, z: z.z, ztype: z.type });
        } else {
          const cx = z.x + sinY(z.yaw) * def.attack.range * 0.55;
          const cz = z.z + cosY(z.yaw) * def.attack.range * 0.55;
          const r = 2.3 + z.scale * 0.25;
          if (Math.hypot(p.x - cx, p.z - cz) <= r + p.radius && p.y < 1.2) g.damagePlayer(def.attack.damage * z.dmgMul, z.x, z.z, z.type);
          g.emit({ type: "slam", x: cx, z: cz, r, boss: z.type });
        }
      }
      if (k >= z.atkEnd) endAttack(z, g, def.attack.cooldown * enrage(z));
      break;
    }
    case "charge":
    case "rush":
    case "dash":
    case "lunge": {
      if (k < z.atkWindup) {
        // Aim during the first part of the wind-up, then lock the line.
        if (k < z.atkWindup * 0.65) z.yaw = approachAngle(z.yaw, yawTo(z.x, z.z, p.x, p.z), dt * 5);
        A.charge = clamp(k / z.atkWindup, 0, 1);
        break;
      }
      if (!d.locked) {
        d.locked = true;
        d.dirX = sinY(z.yaw);
        d.dirZ = cosY(z.yaw);
        g.emit({ type: "charge", x: z.x, z: z.z, boss: z.type });
      }
      A.charge = 0;
      const t = k - z.atkWindup;
      if (t < d.dur && !d.wall) {
        const px = z.x;
        const pz = z.z;
        const step = d.speed * dt;
        z.x += d.dirX * step;
        z.z += d.dirZ * step;
        g.world.resolveCircle(z, z.radius);
        const moved = (z.x - px) * d.dirX + (z.z - pz) * d.dirZ;
        A.phase += (step / (1.9 * z.scale)) * Math.PI * 2;
        A.move = 1;
        A.run = 1;
        if (!d.hitDone && Math.hypot(p.x - z.x, p.z - z.z) < z.radius + p.radius + 0.35 && p.y < 1.4) {
          d.hitDone = true;
          g.damagePlayer(def.attack.damage * z.dmgMul, z.x, z.z, z.type);
          g.knockPlayer(d.dirX * 7, d.dirZ * 7);
        }
        if (moved < step * 0.35 && t > 0.12) {
          d.wall = true;
          g.emit({ type: "thud", x: z.x, z: z.z, boss: z.type });
          if (kind === "charge" || kind === "rush") {
            // Slammed into a wall: dazed, wide open.
            endAttack(z, g, def.attack.cooldown, d.stun + 0.6);
            return;
          }
        }
        break;
      }
      endAttack(z, g, def.attack.cooldown * enrage(z), d.stun);
      break;
    }
    case "shock": {
      // Crouch, hop, land: an expanding ring (jump it) plus damage at the impact point.
      const w = z.atkWindup;
      if (k < w * 0.5) A.charge = k / (w * 0.5);
      else if (k < w) {
        const u = (k - w * 0.5) / (w * 0.5);
        z.y = Math.sin(u * Math.PI) * 1.6;
        A.air = 1;
      }
      if (!z.atkDone && k >= w) {
        z.atkDone = true;
        z.y = 0;
        A.air = 0;
        A.charge = 0;
        if (Math.hypot(p.x - z.x, p.z - z.z) <= 3.2 + p.radius && p.y < 1.0) g.damagePlayer(def.attack.damage * 0.8 * z.dmgMul, z.x, z.z, z.type);
        g.addHazard("shock", z.x, z.z, 0.5, { speed: 8.5, maxR: 14, dmg: 18 * z.dmgMul });
        g.emit({ type: "slam", x: z.x, z: z.z, r: 3.2, boss: z.type, shock: true });
      }
      if (k >= z.atkEnd) endAttack(z, g, def.attack.cooldown);
      break;
    }
    case "leap": {
      const w = z.atkWindup;
      if (k < w) {
        z.yaw = approachAngle(z.yaw, yawTo(z.x, z.z, p.x, p.z), dt * 6);
        A.charge = k / w;
        if (k > w * 0.55 && !d.marked) {
          d.marked = true;
          d.tx = p.x;
          d.tz = p.z;
          // Never land inside geometry.
          const pt = { x: d.tx, z: d.tz };
          g.world.resolveCircle(pt, z.radius);
          d.tx = pt.x;
          d.tz = pt.z;
          d.sx = z.x;
          d.sz = z.z;
          g.addHazard("warn", d.tx, d.tz, 2.5, { dur: z.atkHitAt - k });
        }
        break;
      }
      const air = z.atkHitAt - w;
      const u = clamp((k - w) / air, 0, 1);
      A.charge = 0;
      A.air = u < 1 ? 1 : 0;
      z.x = d.sx + (d.tx - d.sx) * u;
      z.z = d.sz + (d.tz - d.sz) * u;
      z.y = Math.sin(u * Math.PI) * 3.4;
      if (u >= 1 && !d.landed) {
        d.landed = true;
        z.y = 0;
        g.world.resolveCircle(z, z.radius);
        if (Math.hypot(p.x - z.x, p.z - z.z) <= 2.5 + p.radius && p.y < 1.0) g.damagePlayer(28 * z.dmgMul, z.x, z.z, z.type);
        g.emit({ type: "slam", x: z.x, z: z.z, r: 2.5, boss: z.type });
        endAttack(z, g, def.attack.cooldown, 1.2);
      }
      break;
    }
    case "volley": {
      if (k < z.atkHitAt) z.yaw = approachAngle(z.yaw, yawTo(z.x, z.z, p.x, p.z), dt * 2.5);
      if (!z.atkDone && k >= z.atkHitAt) {
        z.atkDone = true;
        const sx = z.x + sinY(z.yaw) * 0.6 * z.scale;
        const sz = z.z + cosY(z.yaw) * 0.6 * z.scale;
        const sy = 1.9 * z.scale;
        const px = -cosY(z.yaw);
        const pz = sinY(z.yaw);
        for (const off of [0, -2.6, 2.6]) {
          const tx = p.x + px * off + p.vx * 0.3;
          const tz = p.z + pz * off + p.vz * 0.3;
          g.lobGlob(sx, sy, sz, tx, tz, 1.2 + Math.abs(off) * 0.06, 13 * z.dmgMul);
        }
        g.emit({ type: "spit", x: sx, y: sy, z: sz, big: true });
      }
      if (k >= z.atkEnd) endAttack(z, g, def.attack.cooldown);
      break;
    }
    case "zones": {
      if (!z.atkDone && k >= z.atkHitAt) {
        z.atkDone = true;
        const pts = [[p.x, p.z]];
        for (let i = 0; i < 2; i++) {
          const a = g.rng.range(0, Math.PI * 2);
          const rr = g.rng.range(3.5, 6.5);
          pts.push([p.x + Math.cos(a) * rr, p.z + Math.sin(a) * rr]);
        }
        for (const [x, zz] of pts) g.addHazard("burst", x, zz, 2.3, { dur: 1.5, dmg: 18 * z.dmgMul });
      }
      if (k >= z.atkEnd) endAttack(z, g, def.attack.cooldown);
      break;
    }
    case "summon": {
      if (!z.atkDone && k >= z.atkHitAt) {
        z.atkDone = true;
        const n = z.bs.phase === 2 ? 4 : 3;
        for (let i = 0; i < n; i++) g.spawnMinion(i % 2 === 0 ? "runner" : "walker");
      }
      if (k >= z.atkEnd) endAttack(z, g, 0.5);
      break;
    }
    default:
      endAttack(z, g, 1);
  }
}

function endAttack(z, g, cooldown, stun = 0) {
  const A = z.anim;
  A.atk = -1;
  A.charge = 0;
  A.air = 0;
  z.y = 0;
  z.atkCd = cooldown;
  if (stun > 0) {
    z.state = "STUNNED";
    z.stateT = stun;
    A.stun = 1;
  } else z.state = "CHASING";
}

/** Bookkeeping when a boss takes damage (stalker retreats after enough punishment). */
export function bossHitStun(z, dmg) {
  if (z.type === "stalker") z.bs.hurt = (z.bs.hurt || 0) + dmg;
}
