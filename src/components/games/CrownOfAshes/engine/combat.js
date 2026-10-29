/**
 * Combat: the damage pipeline, melee sweeps, projectiles and ground zones.
 *
 * Damage pipeline (applyDamage):
 *   invulnerable? → block / parry / ward (frontal arc) → crit & backstab →
 *   armour mitigation → buffs, marks, executes, fire resistance → health,
 *   poise (stagger), knockback, burn / bleed / frost → death or yield.
 *
 * Every actor has: team ('player' | 'hostile' | 'neutral'), x y z yaw, r
 * (radius), h (height), hp/maxHp, armor, poise/poiseMax, status {} and
 * optionally hitboxes() for big creatures (the dragon).
 */
import { wrapAngle, clamp } from "./math.js";

const v3 = () => ({ x: 0, y: 0, z: 0 });

/** Enemies of `team` currently alive (and in the same space). */
export function foesOf(G, team, interior = G.player.interior) {
  const out = [];
  if (team === "player") {
    for (const e of G.enemies) if (!e.dead && e.interior === interior && e.state !== "yield" && !e.inert) out.push(e);
    if (G.dragon && !G.dragon.dead && !interior && G.dragon.hittable()) out.push(G.dragon);
    for (const w of G.wildlife) if (!w.dead && !interior) out.push(w);
    for (const o of G.objects) if (!o.dead && !interior) out.push(o);
  } else {
    const p = G.player;
    if (!p.dead && p.interior === interior) out.push(p);
    for (const a of G.allies) if (!a.dead && !a.downed && a.interior === interior) out.push(a);
  }
  return out;
}

/** Hit volumes: [{x,y,z,r,h,part}] — capsules (vertical) for people, spheres for dragon parts. */
export function hitVolumes(a) {
  if (a.hitboxes) return a.hitboxes();
  return [{ x: a.x, y: a.y, z: a.z, r: a.r, h: a.h, part: "body", cap: true }];
}

/** Distance from point to an actor's nearest hit volume surface (xz + y overlap). */
function nearestVolume(a, x, y, z) {
  let best = null;
  let bd = Infinity;
  for (const v of hitVolumes(a)) {
    let d;
    if (v.cap) {
      const dy = y < v.y ? v.y - y : y > v.y + v.h ? y - (v.y + v.h) : 0;
      d = Math.hypot(Math.hypot(x - v.x, z - v.z), dy) - v.r;
    } else d = Math.hypot(x - v.x, y - v.y, z - v.z) - v.r;
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return { d: bd, v: best };
}

/**
 * Melee sweep from `src` along its facing: hits every foe whose body is in
 * range and inside the arc. Returns hit list.
 */
export function meleeSweep(G, src, move, o = {}) {
  const hits = [];
  const yaw = o.yaw ?? src.yaw;
  const range = move.range * (o.rangeMult || 1);
  const arc = move.arc;
  const cy = src.y + (src.h || 1.8) * 0.55;
  for (const t of foesOf(G, src.team, src.interior)) {
    if (o.exclude?.has(t)) continue;
    let ok = false;
    for (const v of hitVolumes(t)) {
      const vx = v.x - src.x;
      const vz = v.z - src.z;
      const d = Math.hypot(vx, vz) - v.r;
      if (d > range) continue;
      const vy = v.cap ? Math.max(v.y, Math.min(v.y + v.h, cy)) : v.y;
      if (Math.abs(vy - cy) > (v.cap ? 1.4 : v.r + 1.6)) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(vx, vz) - yaw));
      const slack = Math.atan2(v.r, Math.max(0.3, d + v.r));
      if (arc >= 6 || ang <= arc / 2 + slack || d < 0.25) {
        ok = true;
        o.part = v.part;
        break;
      }
    }
    if (!ok) continue;
    if (G.col && !losOk(G, src, t)) continue;
    hits.push(t);
  }
  return hits;
}
function losOk(G, a, b) {
  // big creatures and destructible props carry their own colliders — never block themselves
  if (b.hitboxes || b.kind === "object") return true;
  return G.W.col.los(a.x, a.y + 1.2, a.z, b.x, b.y + 1.0, b.z);
}

/** Is `src` behind `t` (for backstabs)? */
export function isBehind(src, t) {
  const ang = Math.abs(wrapAngle(Math.atan2(src.x - t.x, src.z - t.z) - t.yaw));
  return ang > 1.9;
}

/**
 * Apply damage. o: { kind: 'melee'|'ranged'|'magic', fire, frost, bleed,
 * crit (forced), critChance, critMult, stagger, knock, unblockable, part,
 * backstab (allowed), dirX/dirZ (hit direction), noXp }
 */
export function applyDamage(G, src, t, amount, o = {}) {
  if (!t || t.dead) return null;
  if (t.invuln > 0 || t.iframes > 0 || t.state === "yield" || t.godmode) {
    if (t.iframes > 0 && t === G.player) G.emit({ type: "dodged", x: t.x, y: t.y + 1.2, z: t.z });
    return null;
  }
  const res = { dealt: 0, blocked: false, parried: false, crit: false, killed: false };
  const dirX = o.dirX ?? t.x - (src?.x ?? t.x);
  const dirZ = o.dirZ ?? t.z - (src?.z ?? t.z);
  // ------------------------------------------------- block / parry / ward
  if (t.blocking && !o.unblockable && src) {
    const fromYaw = Math.atan2(-dirX, -dirZ);
    const ang = Math.abs(wrapAngle(fromYaw - t.yaw));
    const B = t.blockDef;
    if (B && ang < B.arc / 2) {
      if (B.parry && t.blockT < B.parry + (t.parryBonus || 0) && o.kind === "melee" && src.stagger) {
        res.parried = true;
        src.stagger(1.4, "parry");
        G.emit({ type: "parry", x: t.x, y: t.y + 1.3, z: t.z });
        t.onParry?.();
        return res;
      }
      if (B.kind === "ward") {
        const cost = amount * B.manaPer * (t.wardEff || 1);
        if (t.res >= cost) {
          t.res -= cost;
          amount *= 1 - B.reduce;
          res.blocked = true;
          G.emit({ type: "ward", x: t.x, y: t.y + 1.2, z: t.z });
        } else {
          t.res = 0;
          t.blocking = false;
          G.emit({ type: "guardBreak", x: t.x, y: t.y + 1.2, z: t.z });
        }
      } else {
        const cost = amount * B.stPer * (t.blockStMult || 1);
        if (t.st >= cost) {
          t.st -= cost;
          amount *= 1 - B.reduce;
          res.blocked = true;
          t.stDelay = 0.8;
          G.emit({ type: "block", x: t.x, y: t.y + 1.3, z: t.z, shield: B.kind === "shield" });
          t.onBlock?.();
        } else {
          t.st = 0;
          t.blocking = false;
          t.stagger?.(0.9, "guardBreak");
          G.emit({ type: "guardBreak", x: t.x, y: t.y + 1.2, z: t.z });
        }
      }
    }
  } else if (t.blockChance && !o.unblockable && t.state !== "attack" && t.state !== "stagger" && G.rand() < t.blockChance) {
    amount *= 0.3;
    res.blocked = true;
    G.emit({ type: "block", x: t.x, y: t.y + 1.3, z: t.z, shield: true, enemy: true });
  }
  // ------------------------------------------------- crit & backstab
  let crit = !!o.crit;
  if (!crit && o.critChance) crit = G.rand() < o.critChance;
  let mult = 1;
  if (crit) mult *= o.critMult || 1.6;
  if (o.backstab && src && (isBehind(src, t) || !t.aware || t.state === "idle" || t.state === "patrol")) {
    mult *= o.backstab;
    res.backstab = true;
  }
  // ------------------------------------------------- mitigation & modifiers
  const armor = Math.max(0, (t.armor || 0) * (o.armorPierce ? 1 - o.armorPierce : 1));
  let dmg = amount * mult * (100 / (100 + armor));
  if (t.status?.mark > 0) dmg *= 1.15;
  if (t.dmgTakenMult) dmg *= t.dmgTakenMult;
  if (src?.dmgMult) dmg *= src.dmgMult;
  if (o.execute && t.hp / t.maxHp < 0.3) dmg *= 1 + o.execute;
  if (o.fire && t.resistFire) dmg *= 1 - t.resistFire;
  if (o.part === "head") dmg *= 1.5;
  if (t.weakTo === "fire" && o.fire) dmg *= 1.35;
  dmg = Math.max(1, Math.round(dmg));
  res.crit = crit;
  res.dealt = dmg;
  t.hp -= dmg;
  t.hitFlash = 0.18;
  t.lastHitBy = src;
  t.combatT = 6;
  if (src && t.alert) t.alert(src);
  // ------------------------------------------------- poise / stagger / knock
  if (!res.blocked && o.stagger && t.poiseMax) {
    t.poise -= o.stagger * (crit ? 1.5 : 1);
    if (t.poise <= 0) {
      t.poise = t.poiseMax;
      t.stagger?.(o.heavy ? 1.1 : 0.55, "poise");
    } else if (t.flinch) t.flinch();
  }
  if (o.stun && t.stagger) t.stagger(o.stun, "stun");
  if (o.knock && !res.blocked && t.knock) {
    const L = Math.hypot(dirX, dirZ) || 1;
    t.knock((dirX / L) * o.knock, (dirZ / L) * o.knock);
  }
  // ------------------------------------------------- statuses
  if (t.status && !res.blocked) {
    if (o.fire && (o.burnChance ?? 0.35) > G.rand()) t.status.burn = Math.max(t.status.burn || 0, 3);
    if (o.bleed) t.status.bleed = 4;
    if (o.frost) t.status.slow = Math.max(t.status.slow || 0, 2.5);
    if (o.mark) t.status.mark = 6;
    if (o.burnPower) t.status.burnPower = o.burnPower;
    if (o.bleed) t.status.bleedDps = (amount * 0.4) / 4;
  }
  G.emit({ type: "dmg", x: t.x, y: t.y + (t.h || 1.8) + 0.2, z: t.z, n: dmg, crit, blocked: res.blocked, toPlayer: t === G.player, toAlly: t.team === "player" && t !== G.player, fire: !!o.fire, kind: o.kind, mat: t.mat || "flesh", backstab: !!res.backstab });
  // ------------------------------------------------- death / yield
  if (t.hp <= 0) {
    if (t.onLethal && t.onLethal()) {
      res.dealt = dmg;
      return res;
    }
    t.hp = 0;
    res.killed = true;
    t.die?.(src);
  }
  return res;
}

/* ================================================================ projectiles */
/**
 * kind: arrow · firebolt · fireball · knife · ballista · enemyArrow · emberbolt · dragonfire
 * o: {x,y,z, dx,dy,dz (unit), speed, team, dmg, src, gravity, r, life, pierce, splash, fire, crit…}
 */
export function spawnProjectile(G, o) {
  const p = {
    id: G.nextId++,
    kind: o.kind,
    x: o.x,
    y: o.y,
    z: o.z,
    vx: o.dx * o.speed,
    vy: o.dy * o.speed,
    vz: o.dz * o.speed,
    team: o.team,
    dmg: o.dmg,
    src: o.src,
    g: o.gravity ?? 0,
    r: o.r ?? 0.12,
    life: o.life ?? 4,
    pierce: o.pierce || 0,
    splash: o.splash || 0,
    o,
    hit: new Set(),
    interior: o.src?.interior ?? null,
    dead: false,
  };
  G.projectiles.push(p);
  G.emit({ type: "shoot", kind: p.kind, x: p.x, y: p.y, z: p.z, team: p.team });
  return p;
}

export function stepProjectiles(G, dt) {
  const col = G.W.col;
  for (const p of G.projectiles) {
    if (p.dead) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.dead = true;
      if (p.splash) explode(G, p, p.x, p.y, p.z);
      continue;
    }
    p.vy -= p.g * dt;
    const sx = p.vx * dt;
    const sy = p.vy * dt;
    const sz = p.vz * dt;
    const L = Math.hypot(sx, sy, sz);
    if (L < 1e-6) continue;
    // world hit along the segment
    let tWorld = col.raycast(p.x, p.y, p.z, sx / L, sy / L, sz / L, L, { skipLow: false });
    const nx = p.x + sx;
    const ny = p.y + sy;
    const nz = p.z + sz;
    if (p.interior == null) {
      const g = col.ground(nx, nz, ny + 0.5);
      if (ny < g) tWorld = Math.min(tWorld, L * 0.98);
    } else if (ny < 0.05 || ny > 6.4) tWorld = Math.min(tWorld, L * 0.98);
    // actor hits (sample a few points along the step)
    let hitActor = null;
    let hitT = Infinity;
    const foes = foesOf(G, p.team, p.interior);
    for (const a of foes) {
      if (p.hit.has(a)) continue;
      for (let k = 1; k <= 3; k++) {
        const f = k / 3;
        const tt = L * f;
        if (tt > tWorld + 0.01) break;
        const r = nearestVolume(a, p.x + sx * f, p.y + sy * f, p.z + sz * f);
        if (r.d < p.r + 0.08 && tt < hitT) {
          hitT = tt;
          hitActor = a;
          p.part = r.v.part;
          break;
        }
      }
    }
    if (hitActor && hitT <= tWorld) {
      const k = hitT / L;
      p.x += sx * k;
      p.y += sy * k;
      p.z += sz * k;
      p.hit.add(hitActor);
      const o = p.o;
      const r = applyDamage(G, p.src, hitActor, p.dmg, { kind: p.team === "player" && p.kind === "fireball" ? "magic" : "ranged", fire: o.fire, frost: o.frost, crit: o.crit, critChance: o.critChance, critMult: o.critMult, stagger: o.stagger ?? 8, knock: o.knock, part: p.part, mark: o.mark, dirX: p.vx, dirZ: p.vz, backstab: o.backstab, bleed: o.bleed, burnPower: o.burnPower });
      if (r && p.src === G.player && !r.blocked) G.emit({ type: "hitConfirm", crit: r.crit, kill: r.killed });
      if (p.splash) {
        explode(G, p, p.x, p.y, p.z, hitActor);
        p.dead = true;
      } else if (p.pierce > 0) {
        p.pierce--;
        p.dmg *= 0.85;
      } else {
        p.dead = true;
        G.emit({ type: "projHit", kind: p.kind, x: p.x, y: p.y, z: p.z, actor: true, mat: hitActor.mat || "flesh" });
      }
      if (!p.dead) {
        p.x += sx * (1 - k);
        p.y += sy * (1 - k);
        p.z += sz * (1 - k);
      }
      continue;
    }
    if (tWorld < L) {
      const k = tWorld / L;
      p.x += sx * k;
      p.y += sy * k;
      p.z += sz * k;
      p.dead = true;
      if (p.splash) explode(G, p, p.x, p.y, p.z);
      else G.emit({ type: "projHit", kind: p.kind, x: p.x, y: p.y, z: p.z, dx: sx / L, dy: sy / L, dz: sz / L, stick: p.kind === "arrow" || p.kind === "enemyArrow" || p.kind === "ballista" || p.kind === "knife" });
      // ballista bolts against the dragon's anchors etc. handled by the boss
      continue;
    }
    p.x = nx;
    p.y = ny;
    p.z = nz;
  }
  if (G.projectiles.length > 80 || G.projectiles.some((p) => p.dead)) G.projectiles = G.projectiles.filter((p) => !p.dead);
}

function explode(G, p, x, y, z, direct = null) {
  const o = p.o;
  G.emit({ type: "explode", kind: p.kind, x, y, z, r: p.splash, fire: !!o.fire });
  for (const a of foesOf(G, p.team, p.interior)) {
    if (a === direct) continue;
    const r = nearestVolume(a, x, y, z);
    if (r.d > p.splash) continue;
    const fall = 1 - clamp(r.d / p.splash, 0, 1) * 0.5;
    applyDamage(G, p.src, a, p.dmg * (o.splashMult ?? 0.7) * fall, { kind: "magic", fire: o.fire, stagger: o.stagger ?? 20, knock: o.knock ?? 3, dirX: a.x - x, dirZ: a.z - z, burnPower: o.burnPower });
  }
  if (o.groundFire) spawnZone(G, { kind: "burn", x, z, y, r: p.splash * 0.7, dur: 3, tick: 0.5, dmg: p.dmg * 0.12, team: p.team, src: p.src, fire: true, interior: p.interior });
  if (p.team !== "player" && o.selfHarm === false) return;
}

/* ================================================================ zones */
/**
 * Ground effects with an optional delay (telegraph). kind: trap · burn ·
 * volley · meteor · nova · eruption · breath · frostslam · slam · wave
 * o: {x,z,y, r, shape ('circle'|'cone'|'line'), yaw, half, len, delay, dur,
 *     tick, dmg, team, src, fire, frost, stun, knock, once (single hit)}
 */
export function spawnZone(G, o) {
  const z = { id: G.nextId++, t: 0, hitOnce: new Set(), acc: 0, ...o, interior: o.interior ?? o.src?.interior ?? null };
  z.delay = o.delay || 0;
  z.dur = o.dur ?? 0.05;
  G.zones.push(z);
  if (z.delay > 0 && o.tele !== false) G.emit({ type: "telegraph", id: z.id, shape: o.shape || "circle", x: o.x, z: o.z, y: o.y, r: o.r, yaw: o.yaw || 0, half: o.half, len: o.len, dur: z.delay, color: o.team === "player" ? "#ffb040" : o.frost ? "#7fd8ff" : "#ff4a1a", interior: z.interior != null });
  return z;
}

function inZone(z, x, y, zz) {
  const dx = x - z.x;
  const dz = zz - z.z;
  const d = Math.hypot(dx, dz);
  if (z.shape === "cone") {
    if (d > z.r) return false;
    const a = Math.abs(wrapAngle(Math.atan2(dx, dz) - z.yaw));
    return a <= (z.half || 0.5) + Math.atan2(0.5, Math.max(0.5, d));
  }
  if (z.shape === "line") {
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    return along >= -0.5 && along <= (z.len || z.r) && side <= z.r;
  }
  return d <= z.r;
}

export function stepZones(G, dt) {
  for (const z of G.zones) {
    if (z.dead) continue;
    z.t += dt;
    if (z.t < z.delay) continue;
    if (!z.fired) {
      z.fired = true;
      G.emit({ type: "zone", kind: z.kind, x: z.x, y: z.y, z: z.z, r: z.r, yaw: z.yaw, shape: z.shape, len: z.len, fire: !!z.fire, frost: !!z.frost, team: z.team });
    }
    const active = z.t - z.delay;
    if (z.kind === "trap") {
      // armed until something walks in
      for (const a of foesOf(G, z.team, z.interior)) {
        if (a.flying) continue;
        if (Math.hypot(a.x - z.x, a.z - z.z) < z.r + a.r) {
          applyDamage(G, z.src, a, z.dmg, { kind: "ranged", stagger: 30 });
          if (a.status) a.status.root = Math.max(a.status.root || 0, z.root || 3);
          G.emit({ type: "trapSnap", x: z.x, y: z.y, z: z.z });
          z.dead = true;
          break;
        }
      }
      if (active > z.dur) z.dead = true;
      continue;
    }
    z.acc -= dt;
    if (z.acc <= 0) {
      z.acc = z.tick || 1e9;
      const targets = z.team === "any" ? [G.player, ...G.enemies] : foesOf(G, z.team, z.interior);
      for (const a of targets) {
        if (!a || a.dead) continue;
        if (z.once && z.hitOnce.has(a)) continue;
        let inside = false;
        for (const v of hitVolumes(a)) {
          const vy = v.cap ? v.y : v.y - v.r;
          if (z.y != null && (vy > z.y + (z.height ?? 3) || vy + (v.h || v.r * 2) < z.y - 1.5)) continue;
          if (inZone(z, v.x, vy, v.z) || (v.r > 1 && Math.hypot(v.x - z.x, v.z - z.z) < z.r + v.r * 0.8 && z.shape !== "line")) {
            inside = true;
            break;
          }
        }
        if (!inside) continue;
        z.hitOnce.add(a);
        applyDamage(G, z.src, a, z.dmg, { kind: z.fire ? "magic" : "melee", fire: z.fire, frost: z.frost, stagger: z.stagger ?? 0, stun: z.stun, knock: z.knock, dirX: a.x - z.x, dirZ: a.z - z.z, unblockable: z.unblockable, burnChance: z.burnChance, heavy: z.heavy });
      }
    }
    if (active >= z.dur) z.dead = true;
  }
  if (G.zones.some((z) => z.dead)) G.zones = G.zones.filter((z) => !z.dead);
}

/* ================================================================ statuses */
export function stepStatus(G, a, dt) {
  const s = a.status;
  if (!s) return;
  if (s.burn > 0) {
    s.burn -= dt;
    s.burnAcc = (s.burnAcc || 0) - dt;
    if (s.burnAcc <= 0) {
      s.burnAcc = 0.5;
      const dps = (a.maxHp || 100) * 0.012 * (s.burnPower || 1) + 2;
      a.hp -= dps * 0.5;
      a.hitFlash = 0.08;
      G.emit({ type: "dmg", x: a.x, y: a.y + (a.h || 1.8) + 0.2, z: a.z, n: Math.round(dps * 0.5), dot: "burn", toPlayer: a === G.player });
      if (a.hp <= 0 && !a.dead) {
        if (!(a.onLethal && a.onLethal())) {
          a.hp = 0;
          a.die?.(a.lastHitBy || null);
        }
      }
    }
  }
  if (s.bleed > 0) {
    s.bleed -= dt;
    s.bleedAcc = (s.bleedAcc || 0) - dt;
    if (s.bleedAcc <= 0) {
      s.bleedAcc = 0.5;
      const d = (s.bleedDps || 4) * 0.5;
      a.hp -= d;
      G.emit({ type: "dmg", x: a.x, y: a.y + (a.h || 1.8) + 0.2, z: a.z, n: Math.round(d), dot: "bleed", toPlayer: a === G.player });
      if (a.hp <= 0 && !a.dead && !(a.onLethal && a.onLethal())) {
        a.hp = 0;
        a.die?.(a.lastHitBy || null);
      }
    }
  }
  for (const k of ["slow", "root", "mark", "fear"]) if (s[k] > 0) s[k] = Math.max(0, s[k] - dt);
}

export { v3 };
