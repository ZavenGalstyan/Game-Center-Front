/**
 * Last Hope — the player's attacks, projectiles, explosive drums and toxic
 * clouds.
 *
 * A melee swing resolves at its `hit` moment: every zombie / animal / drum in
 * the cone (max 3) takes damage; a swing that connects with nothing alive
 * gathers from the resource node in front instead. Ranged weapons spend ammo
 * and fire pooled projectiles that are swept as segments each tick.
 */
import { ITEMS } from "../data/items.js";
import { NODES, FIST_GATHER } from "./nodes.js";
import { count, remove } from "./inventory.js";
import { emit, damageZombie, damageAnimal, hurtPlayer, giveXp, dropItems } from "./damage.js";
import { angDiff, yawOf, segDist2 } from "./util.js";
import { giveItem } from "./items.js";

export const FISTS = { kind: "melee", dmg: 7, cd: 0.52, hit: 0.2, range: 1.45, arc: 80, stam: 3, stagger: 0.18, gather: FIST_GATHER, anim: "punch", blunt: true };
const BLUNT = new Set(["wooden_club", "crowbar"]);

export function weaponOf(G) {
  const h = G.equip.hand;
  if (!h) return FISTS;
  const w = ITEMS[h.id]?.w;
  return w || FISTS;
}

export function noise(G, x, z, r) {
  G.R.noise.push({ x, z, r, life: 0.35 });
}

/** Yaw to swing / shoot at: the aim direction, nudged onto a nearby target. */
export function aimYaw(G, I, w) {
  const P = G.P;
  let yaw = P.yaw;
  const explicit = I && I.aim;
  if (explicit) yaw = yawOf(I.aim.x - P.x, I.aim.z - P.z);
  else if (I && (I.mx || I.mz)) yaw = yawOf(I.mx, I.mz);
  const range = w.kind === "melee" ? w.range + 1.6 : Math.min(w.range, 22);
  const cone = explicit ? 0.5 : I?.touch ? 1.7 : 1.1;
  let best = null;
  let bs = 1e9;
  for (const z of G.R.zombies) {
    if (z.state === "dead") continue;
    const dx = z.x - P.x;
    const dz = z.z - P.z;
    const d = Math.hypot(dx, dz);
    if (d > range + z.r) continue;
    const a = Math.abs(angDiff(yaw, yawOf(dx, dz)));
    const close = d < 2.6 && !explicit;
    if (a > cone && !close) continue;
    if (G.R.col.raycast(P.x, P.z, z.x, z.z, true) < 0.999) continue;
    const s = d + a * 3;
    if (s < bs) {
      bs = s;
      best = z;
    }
  }
  if (!best && w.kind === "melee")
    for (const a of G.R.animals) {
      if (a.dead) continue;
      const d = Math.hypot(a.x - P.x, a.z - P.z);
      if (d < w.range + 1.2 && Math.abs(angDiff(yaw, yawOf(a.x - P.x, a.z - P.z))) < cone) {
        best = a;
        break;
      }
    }
  if (best) yaw = yawOf(best.x - P.x, best.z - P.z);
  return yaw;
}

/** Begin an attack with the equipped weapon. Returns true if it started. */
export function startAttack(G, I, forcedYaw = null) {
  const P = G.P;
  if (P.dead || P.act || P.cd > 0) return false;
  const w = weaponOf(G);
  if (P.stam < w.stam * 0.5 && w.stam > 0) {
    if (!P.tiredMsg || G.t - P.tiredMsg > 2) {
      P.tiredMsg = G.t;
      emit(G, { t: "toast", text: "Too tired — catch your breath", kind: "warn" });
    }
    return false;
  }
  if (w.ammo && count(G.inv, w.ammo) <= 0) {
    if (!P.ammoMsg || G.t - P.ammoMsg > 2) {
      P.ammoMsg = G.t;
      emit(G, { t: "toast", text: `No ${ITEMS[w.ammo].name}`, kind: "warn" });
      emit(G, { t: "dry" });
    }
    P.cd = 0.4;
    return false;
  }
  const yaw = forcedYaw != null ? forcedYaw : aimYaw(G, I, w);
  P.combo = (P.combo + 1) % 3;
  P.act = { k: w.kind === "melee" ? "melee" : "shoot", t: 0, dur: Math.max(w.cd * 0.85, w.hit + 0.18), hit: w.hit, done: false, w, id: G.equip.hand?.id || null, yaw, combo: P.combo, anim: w.anim };
  P.cd = w.cd;
  P.stam = Math.max(0, P.stam - w.stam);
  P.stamT = 0;
  P.yaw = yaw;
  P.faceT = 0.6;
  emit(G, { t: "swing", anim: w.anim, id: P.act.id, combo: P.combo });
  return true;
}

function wear(G, n = 1) {
  const h = G.equip.hand;
  if (!h || h.d == null) return;
  h.d -= n;
  if (h.d <= 0) {
    emit(G, { t: "broke", id: h.id });
    emit(G, { t: "toast", text: `Your ${ITEMS[h.id].name} broke!`, kind: "bad" });
    G.equip.hand = null;
    G.invVersion++;
  }
}

export function resolveMelee(G, act) {
  const P = G.P;
  const w = act.w;
  const R = G.R;
  const half = (w.arc * Math.PI) / 360;
  const lvl = 1 + (P.level - 1) * 0.025;
  const hits = [];
  for (const z of R.zombies) {
    if (z.state === "dead") continue;
    const dx = z.x - P.x;
    const dz = z.z - P.z;
    const d = Math.hypot(dx, dz);
    if (d > w.range + z.r) continue;
    const a = Math.abs(angDiff(act.yaw, yawOf(dx, dz)));
    if (a > half && d > z.r + 0.45) continue;
    if (R.col.raycast(P.x, P.z, z.x, z.z, true) < 0.999) continue;
    hits.push([d, z]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  let any = false;
  const blunt = w.blunt || BLUNT.has(act.id);
  for (const [, z] of hits.slice(0, 3)) {
    const crit = G.rng() < 0.1;
    damageZombie(G, z, w.dmg * lvl, { blunt, crit, stagger: w.stagger, src: P, kind: "melee" });
    any = true;
  }
  for (const a of R.animals) {
    if (a.dead) continue;
    const d = Math.hypot(a.x - P.x, a.z - P.z);
    if (d > w.range + a.r) continue;
    if (Math.abs(angDiff(act.yaw, yawOf(a.x - P.x, a.z - P.z))) > half && d > 0.8) continue;
    damageAnimal(G, a, w.dmg * lvl, { crit: G.rng() < 0.1 });
    any = true;
  }
  for (const h of R.hazards) {
    if (!h.alive) continue;
    const d = Math.hypot(h.x - P.x, h.z - P.z);
    if (d > w.range + h.r) continue;
    if (Math.abs(angDiff(act.yaw, yawOf(h.x - P.x, h.z - P.z))) > half) continue;
    hitDrum(G, h, w.dmg);
    any = true;
  }
  if (any) {
    wear(G);
    noise(G, P.x, P.z, 6);
    emit(G, { t: "connect", id: act.id });
    return;
  }
  // nothing alive in reach: work the node in front
  const node = nodeInFront(G, act.yaw, w.range + 0.4);
  if (node) {
    gatherHit(G, node, w);
    return;
  }
  emit(G, { t: "whiff", id: act.id });
}

/** The best swing-node in front of the player. */
export function nodeInFront(G, yaw, reach) {
  const P = G.P;
  let best = null;
  let bs = 1e9;
  for (const n of G.R.nodes) {
    if (!n.alive || n.def.pick) continue;
    const sr = (n.solidR || 0) + 0.2;
    const dx = n.x - P.x;
    const dz = n.z - P.z;
    const d = Math.hypot(dx, dz) - sr;
    if (d > reach) continue;
    const a = Math.abs(angDiff(yaw, yawOf(dx, dz)));
    if (a > 1.0 && d > 0.5) continue;
    const s = d + a;
    if (s < bs) {
      bs = s;
      best = n;
    }
  }
  return best;
}

export function gatherHit(G, n, w) {
  const def = n.def;
  const power = w.gather?.[def.kind] ?? FIST_GATHER[def.kind] ?? 0.3;
  n.shake = 1;
  if (def.min && power < def.min) {
    emit(G, { t: "toast", text: def.need || "You need a better tool", kind: "warn" });
    emit(G, { t: "gatherFail", node: n.id, x: n.x, z: n.z, kind: def.kind });
    return;
  }
  n.acc += power;
  const got = {};
  while (n.acc >= 1 && n.left > 0) {
    n.acc -= 1;
    n.left--;
    got[def.item] = (got[def.item] || 0) + 1;
    for (const [id, ch] of def.bonus || []) if (G.rng() < ch) got[id] = (got[id] || 0) + 1;
  }
  emit(G, { t: "gather", node: n.id, x: n.x, z: n.z, kind: def.kind, t2: n.t, any: Object.keys(got).length > 0 });
  for (const [id, k] of Object.entries(got)) {
    giveItem(G, id, k, { gathered: true, x: n.x, z: n.z });
    giveXp(G, k);
  }
  if (G.equip.hand) wear(G);
  noise(G, G.P.x, G.P.z, 5);
  if (n.left <= 0) depleteNode(G, n);
}

export function depleteNode(G, n) {
  n.alive = false;
  n.respawnAt = G.t + n.def.resp;
  G.locs[G.loc].nodes[n.id] = n.respawnAt;
  emit(G, { t: "deplete", node: n.id, x: n.x, z: n.z, kind: n.def.kind, t2: n.t });
}

/** Fire the equipped ranged weapon (called at the act's hit moment). */
export function fire(G, act) {
  const P = G.P;
  const w = act.w;
  if (remove(G.inv, w.ammo, 1) < 1) return;
  G.invVersion++;
  const sx = Math.sin(act.yaw);
  const sz = Math.cos(act.yaw);
  const spread = w.kind === "gun" ? (G.rng() - 0.5) * 0.04 : (G.rng() - 0.5) * 0.02;
  const yaw = act.yaw + spread;
  G.R.proj.push({
    id: G.R.nextId++,
    owner: "p",
    kind: w.kind === "bow" ? "arrow" : "bullet",
    x: P.x + sx * 0.55,
    z: P.z + sz * 0.55,
    y: 1.3,
    vx: Math.sin(yaw) * w.speed,
    vz: Math.cos(yaw) * w.speed,
    dmg: w.dmg * (1 + (P.level - 1) * 0.02),
    stagger: w.stagger,
    life: w.range / w.speed,
    pierce: w.pierce || 0,
    hit: new Set(),
  });
  emit(G, { t: "shot", kind: w.kind, id: act.id, x: P.x + sx * 0.7, z: P.z + sz * 0.7, yaw });
  if (w.noise) noise(G, P.x, P.z, w.noise);
  wear(G);
}

export function stepProjectiles(G, dt) {
  const R = G.R;
  const P = G.P;
  for (let i = R.proj.length - 1; i >= 0; i--) {
    const p = R.proj[i];
    p.life -= dt;
    const ax = p.x;
    const az = p.z;
    const bx = p.x + p.vx * dt;
    const bz = p.z + p.vz * dt;
    let end = false;
    // walls
    const tw = R.col.raycast(ax, az, bx, bz, false, (s) => !s.op && !s.door && !s.sid && s.k === "c" && s.r < 0.5);
    const hx = ax + (bx - ax) * tw;
    const hz = az + (bz - az) * tw;
    if (p.owner === "p") {
      // zombies along the swept segment
      for (const z of R.zombies) {
        if (z.state === "dead" || p.hit.has(z.id)) continue;
        if (segDist2(z.x, z.z, ax, az, hx, hz) < (z.r + 0.15) ** 2) {
          p.hit.add(z.id);
          damageZombie(G, z, p.dmg, { stagger: p.stagger, src: { x: ax, z: az }, kind: p.kind, crit: G.rng() < 0.12 });
          if (p.pierce-- <= 0) {
            end = true;
            break;
          }
        }
      }
      if (!end)
        for (const a of R.animals) {
          if (a.dead) continue;
          if (segDist2(a.x, a.z, ax, az, hx, hz) < (a.r + 0.15) ** 2) {
            damageAnimal(G, a, p.dmg);
            end = true;
            break;
          }
        }
      if (!end)
        for (const h of R.hazards) {
          if (!h.alive) continue;
          if (segDist2(h.x, h.z, ax, az, hx, hz) < (h.r + 0.1) ** 2) {
            hitDrum(G, h, p.dmg);
            end = true;
            break;
          }
        }
    } else if (!P.dead && segDist2(P.x, P.z, ax, az, hx, hz) < (P.r + 0.2) ** 2) {
      hurtPlayer(G, p.dmg, { x: ax, z: az }, { poison: p.poison || 0, knock: 0.15, kind: "spit" });
      emit(G, { t: "splat", x: P.x, z: P.z });
      end = true;
    }
    if (!end && tw < 1) {
      end = true;
      emit(G, { t: "impact", kind: p.kind, x: hx, z: hz });
      if (p.kind === "arrow" && G.rng() < 0.45) dropItems(G, hx - p.vx * 0.01, hz - p.vz * 0.01, [{ id: "arrow", n: 1 }]);
      if (p.kind === "spit") R.clouds.push({ x: hx, z: hz, r: 1.3, t: 3, life: 3, dps: 3, small: true });
    }
    if (!end && p.life <= 0) {
      end = true;
      if (p.kind === "arrow" && G.rng() < 0.5) dropItems(G, bx, bz, [{ id: "arrow", n: 1 }]);
      if (p.kind === "spit") R.clouds.push({ x: bx, z: bz, r: 1.3, t: 3, life: 3, dps: 3, small: true });
    }
    if (end) R.proj.splice(i, 1);
    else {
      p.x = bx;
      p.z = bz;
    }
  }
}

export function hitDrum(G, h, dmg) {
  h.hp -= dmg;
  emit(G, { t: "drumhit", id: h.id, x: h.x, z: h.z });
  if (h.hp <= 0) explode(G, h);
}

function explode(G, h) {
  if (!h.alive) return;
  h.alive = false;
  const R = G.R;
  const P = G.P;
  const r = 4.6;
  emit(G, { t: "explode", x: h.x, z: h.z, r });
  emit(G, { t: "shake", k: 1.2 });
  noise(G, h.x, h.z, 30);
  // the drum's collider goes away
  R.col.statics.forEach((s) => {
    if (s.k === "c" && Math.abs(s.x - h.x) < 0.01 && Math.abs(s.z - h.z) < 0.01) s.r = 0.001;
  });
  for (const z of R.zombies) {
    if (z.state === "dead") continue;
    const d = Math.hypot(z.x - h.x, z.z - h.z);
    if (d < r) damageZombie(G, z, 85 * (1 - d / r) + 15, { stagger: 2, src: h, kind: "blast" });
  }
  for (const a of R.animals) if (!a.dead && Math.hypot(a.x - h.x, a.z - h.z) < r) damageAnimal(G, a, 60);
  const dp = Math.hypot(P.x - h.x, P.z - h.z);
  if (dp < r) hurtPlayer(G, 40 * (1 - dp / r) + 6, h, { knock: 1.4, kind: "blast", cause: "explosion" });
  for (const o of R.hazards) if (o.alive && o !== h && Math.hypot(o.x - h.x, o.z - h.z) < r * 0.9) o.chainT = 0.25;
}

export function stepHazards(G, dt) {
  for (const h of G.R.hazards)
    if (h.alive && h.chainT != null) {
      h.chainT -= dt;
      if (h.chainT <= 0) {
        h.chainT = null;
        explode(G, h);
      }
    }
  // toxic clouds
  const P = G.P;
  const R = G.R;
  for (let i = R.clouds.length - 1; i >= 0; i--) {
    const c = R.clouds[i];
    c.t -= dt;
    if (c.t <= 0) {
      R.clouds.splice(i, 1);
      continue;
    }
    if (!P.dead && (P.x - c.x) ** 2 + (P.z - c.z) ** 2 < c.r * c.r) {
      P.poison = Math.max(P.poison, 2.5);
      P.cloudT = (P.cloudT || 0) + dt;
      if (P.cloudT > 0.5) {
        P.cloudT = 0;
        hurtPlayer(G, c.dps * 0.5, null, { dot: true, ignoreIframes: true, kind: "toxic", cause: "toxic" });
      }
    }
  }
}
