/**
 * Spellcasting and damage.
 *
 *   cast(G, id)        validate (known, cooldown, magic, target) → effect
 *   special(G, 'q'|'r') the hero's signature spells
 *   stepProjectiles    bolts fly, hit walls / objects / foes / the hero;
 *                      Protego blocks, a well-timed Protego reflects
 *   hurtEnemy / hurtPlayer   resistances, combos, crits, shields, death
 *   stepZones          domes, telegraphed area attacks
 *
 * Target spells (Levioso, Accio, Alohomora, Reparo) need a valid target near
 * the crosshair — they never fire into nothing.
 */
import { SPELLS } from "../data/spells.js";
import { ITEMS } from "../data/items.js";
import { HEROES } from "../data/heroes.js";
import { clamp } from "./math.js";

export const rank = (G, id) => G.P.spells[id] || 0;
const R = (G, id, n) => rank(G, id) >= n;

/* ================================================================ aiming */
/** Wand-tip position of the hero (approximate right hand, forward). */
export function wandPos(G, out = {}) {
  const p = G.player;
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  out.x = p.x + fx * 0.5 - fz * 0.28;
  out.y = p.y + 1.42;
  out.z = p.z + fz * 0.5 + fx * 0.28;
  return out;
}
/** Angle (rad) between the camera ray and a point, and its distance along the ray. */
function rayAngle(G, x, y, z) {
  const c = G.cam;
  const dx = x - c.x;
  const dy = y - c.y;
  const dz = z - c.z;
  const L = Math.hypot(dx, dy, dz) || 1;
  const dot = (dx * c.fx + dy * c.fy + dz * c.fz) / L;
  return { a: Math.acos(clamp(dot, -1, 1)), along: dot * L, L };
}
/** Best enemy near the crosshair (aim assist / targeting). */
export function pickEnemy(G, maxAngle, range, filter) {
  const p = G.player;
  let best = null;
  let bs = Infinity;
  for (const e of G.enemies) {
    if (e.dead || e.untargetable || (filter && !filter(e))) continue;
    const ey = e.y + e.def.height * 0.6;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d > range) continue;
    const { a, along } = rayAngle(G, e.x, ey, e.z);
    if (along < 0) continue;
    // a little extra tolerance for big targets and close ones
    const tol = maxAngle + Math.atan2(e.def.radius, Math.max(1, d)) * 0.8;
    if (a > tol) continue;
    if (!G.col.los(p.x, p.y + 1.5, p.z, e.x, ey, e.z)) continue;
    const s = a / tol + d / range * 0.35;
    if (s < bs) {
      bs = s;
      best = e;
    }
  }
  return best;
}
/** Best object near the crosshair that `spell` can affect. Returns {o, why}. */
export function pickObject(G, spell, maxAngle, range) {
  const p = G.player;
  let best = null;
  let bs = Infinity;
  let blocked = null;
  for (const o of G.objects.list) {
    if (o.gone) continue;
    const tags = o.def.tags || [];
    if (!tags.includes(spell)) continue;
    const why = G.objects.invalid(o, spell);
    if (why === "hidden" || why === "no") continue;
    const d = Math.hypot(o.tp.x - p.x, o.tp.z - p.z, (o.tp.y - p.y - 1.4) * 0.6);
    if (d > range) continue;
    const { a, along } = rayAngle(G, o.tp.x, o.tp.y, o.tp.z);
    if (along < 0) continue;
    const tol = maxAngle + Math.atan2(o.radius, Math.max(1, d));
    if (a > tol) continue;
    // line of sight from the wand, ignoring the object's own collider
    if (!G.col.los(p.x, p.y + 1.5, p.z, o.tp.x, o.tp.y, o.tp.z, { skip: (s) => s.id === o.id })) continue;
    const s = a / tol + d / range * 0.3;
    if (s < bs) {
      bs = s;
      best = o;
      blocked = why;
    }
  }
  return { o: best, why: blocked };
}
/** Where the crosshair points (first wall along the camera ray, ≤ 60 m). */
export function aimPoint(G) {
  const c = G.cam;
  const t = G.col.raycast(c.x, c.y, c.z, c.fx, c.fy, c.fz, 60, { noTrees: false, noGround: false });
  return { x: c.x + c.fx * t, y: c.y + c.fy * t, z: c.z + c.fz * t };
}

/* ================================================================ casting */
const costOf = (G, id) => {
  const S = SPELLS[id];
  if (id === "alohomora" && R(G, id, 3)) return 0;
  if (id === "reparo" && R(G, id, 3)) return 0;
  return Math.round(S.cost * G.stats.costMul);
};
export function cdOf(G, id) {
  let cd = SPELLS[id].cd;
  if (id === "levioso" && R(G, id, 3)) cd -= 1;
  if (id === "accio" && R(G, id, 3)) cd -= 1;
  if (id === "patronum" && R(G, id, 2)) cd -= 2;
  return cd * G.stats.cdMul;
}
export function spellRange(G, id) {
  const S = SPELLS[id];
  let r = S.range || 20;
  if (id === "accio" && R(G, id, 2)) r += 6;
  if (id === "alohomora" && R(G, id, 2)) r += 4;
  return r;
}

export function cast(G, id) {
  const p = G.player;
  const S = SPELLS[id];
  if (!S || !G.P.spells[id]) return deny(G, "You haven't learned that spell yet.");
  if (p.dead || p.stunT > 0) return false;
  if (p.dodgeT > 0) return false;
  if ((p.cds[id] || 0) > 0) return false;
  if (id === "lumos") {
    p.lumos = !p.lumos;
    p.cds.lumos = S.cd;
    G.emit({ type: "lumos", on: p.lumos });
    return true;
  }
  if (id === "protego") return shield(G);
  const cost = costOf(G, id);
  if (p.mana < cost) return deny(G, "Not enough magic.", "mana");
  if (S.kind === "bolt") {
    const w = wandPos(G);
    let target = pickEnemy(G, p.aiming ? 0.07 : 0.17, S.range);
    let tx;
    let ty;
    let tz;
    let objTarget = null;
    if (target) {
      tx = target.x;
      ty = target.y + target.def.height * 0.55;
      tz = target.z;
    } else {
      // assist toward valid objects for fire (braziers, webs)
      const { o, why } = id === "incendio" ? pickObject(G, "incendio", 0.12, S.range) : { o: null };
      if (o && !why) {
        objTarget = o;
        tx = o.tp.x;
        ty = o.tp.y;
        tz = o.tp.z;
      } else {
        const a = aimPoint(G);
        tx = a.x;
        ty = a.y;
        tz = a.z;
      }
    }
    const dx = tx - w.x;
    const dy = ty - w.y;
    const dz = tz - w.z;
    const L = Math.hypot(dx, dy, dz) || 1;
    let speed = S.speed;
    if (id === "expelliarmus" && R(G, id, 4)) speed *= 1.2;
    spawnBolt(G, {
      team: "player",
      spell: id,
      x: w.x,
      y: w.y,
      z: w.z,
      dx: dx / L,
      dy: dy / L,
      dz: dz / L,
      speed,
      range: S.range + 4,
      target,
      objTarget,
      dmg: S.dmg,
      big: S.big,
      radius: id === "patronum" ? (R(G, id, 3) ? 1.6 : 1.1) : 0.28,
      pierce: S.pierce,
      color: S.color,
    });
    faceAim(G, tx, tz);
  } else {
    // instant target spells
    const range = spellRange(G, id);
    const { o, why } = pickObject(G, id, p.aiming ? 0.1 : 0.2, range);
    let e = null;
    if (!o && (id === "levioso" || id === "accio")) e = pickEnemy(G, p.aiming ? 0.08 : 0.16, range);
    if (!o && !e) {
      const any = G.objects.list.some((x) => (x.def.tags || []).includes(id) && G.objects.visible(x) && !G.objects.invalid(x, id) && Math.hypot(x.x - p.x, x.z - p.z) < range * 2.2);
      return deny(G, any ? `${S.name}: aim at the target (it's highlighted when you're close enough).` : `${S.name}: no valid target in sight.`);
    }
    if (o && why && why !== "done") return deny(G, why);
    if (o && why === "done") return deny(G, `${S.name}: nothing more to do there.`);
    if (e && e.def.heavy) {
      p.mana -= Math.round(cost * 0.5);
      p.cds[id] = 1;
      G.emit({ type: "beam", spell: id, color: S.color, x: e.x, y: e.y + e.def.height * 0.6, z: e.z, fail: true });
      return deny(G, `${e.def.name} is far too heavy for ${S.name}.`);
    }
    const w = wandPos(G);
    if (o) {
      const r = G.objects.apply(o, id);
      if (!r.ok) return deny(G, r.msg || "Nothing happens.");
      if (r.msg) G.emit({ type: "notice", text: r.msg, kind: "good" });
      G.emit({ type: "beam", spell: id, color: S.color, x0: w.x, y0: w.y, z0: w.z, x: o.tp.x, y: o.tp.y, z: o.tp.z });
      if (id === "reparo" && R(G, id, 2)) heal(G, G.stats.maxHp * 0.1);
      faceAim(G, o.tp.x, o.tp.z);
    } else {
      G.emit({ type: "beam", spell: id, color: S.color, x0: w.x, y0: w.y, z0: w.z, x: e.x, y: e.y + e.def.height * 0.6, z: e.z });
      if (id === "levioso") liftEnemy(G, e, S.lift + (R(G, id, 2) ? 1 : 0));
      else pullEnemy(G, e, R(G, id, 4) ? 1.8 : 0.9);
      e.aggro = true;
      faceAim(G, e.x, e.z);
    }
  }
  p.mana -= cost;
  p.cds[id] = cdOf(G, id);
  p.castT = 0.42;
  p.castSpell = id;
  p.combatT = Math.max(p.combatT, 0);
  G.P.stats.casts++;
  G.emit({ type: "cast", spell: id, color: S.color });
  return true;
}
function faceAim(G, x, z) {
  const p = G.player;
  p.faceT = 0.6;
  p.faceYaw = Math.atan2(x - p.x, z - p.z);
}
function deny(G, text, kind) {
  G.emit({ type: "deny", text, kind });
  return false;
}

export function shield(G) {
  const p = G.player;
  if ((p.cds.protego || 0) > 0) return false;
  const cost = Math.round(SPELLS.protego.cost * G.stats.costMul);
  if (p.mana < cost) return deny(G, "Not enough magic for Protego.", "mana");
  p.mana -= cost;
  p.shieldT = (SPELLS.protego.dur + (R(G, "protego", 2) ? 0.4 : 0)) * G.stats.shieldMul;
  p.shieldAge = 0;
  p.cds.protego = SPELLS.protego.cd * G.stats.cdMul;
  G.emit({ type: "shieldUp" });
  return true;
}
const perfectWindow = (G) => (R(G, "protego", 3) ? 0.45 : SPELLS.protego.perfect);

/* ================================================================ hero specials */
export function special(G, slot) {
  const p = G.player;
  const H = HEROES[G.P.hero];
  const A = H[slot];
  const S = G.stats;
  if (p.dead || p.stunT > 0) return false;
  if ((p.cds[slot] || 0) > 0) return false;
  const cost = Math.round(A.cost * S.costMul);
  if (p.mana < cost) return deny(G, `Not enough magic for ${A.name}.`, "mana");
  const mul = slot === "q" ? S.qMul : S.rMul;
  const fx = Math.sin(G.camYaw);
  const fz = Math.cos(G.camYaw);
  switch (A.id) {
    case "volley":
      for (let i = 0; i < 3; i++) G.later(i * 0.17, () => castFree(G, "stupefy", { dmg: 14 * mul, stun: 1.5 }));
      break;
    case "maxima":
      G.zones.push({ kind: "dome", follow: true, x: p.x, z: p.z, r: 3.4, t: 0, dur: 4 * mul, reflect: true, team: "player" });
      break;
    case "liftwave": {
      let n = 0;
      for (const e of G.enemies) {
        if (e.dead) continue;
        const dx = e.x - p.x;
        const dz = e.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 12 || (dx * fx + dz * fz) / (d || 1) < 0.5) continue;
        if (e.def.heavy) stagger(G, e, 0.8);
        else liftEnemy(G, e, 3 * mul);
        n++;
      }
      G.emit({ type: "wave", color: SPELLS.levioso.color, x: p.x, z: p.z, yaw: G.camYaw, cone: true, n });
      break;
    }
    case "gather": {
      const cx = p.x + fx * 4;
      const cz = p.z + fz * 4;
      for (const e of G.enemies) {
        if (e.dead || Math.hypot(e.x - p.x, e.z - p.z) > 14) continue;
        if (!e.def.heavy) {
          e.knock = { vx: (cx - e.x) * 2.6, vz: (cz - e.z) * 2.6, t: 0.38 };
        }
        stun(G, e, 1.5 * mul);
        hurtEnemy(G, e, 10 * mul, "accio");
      }
      G.emit({ type: "wave", color: SPELLS.accio.color, x: cx, z: cz, implode: true });
      break;
    }
    case "slam":
      for (const e of G.enemies) {
        if (e.dead || Math.hypot(e.x - p.x, e.z - p.z) > 5 + e.def.radius) continue;
        hurtEnemy(G, e, 18 * mul, "stupefy");
        stun(G, e, 2);
      }
      G.emit({ type: "slam", x: p.x, z: p.z, r: 5, color: SPELLS.stupefy.color });
      p.castT = 0.6;
      break;
    case "totalum":
      G.zones.push({ kind: "dome", x: p.x, z: p.z, r: 4.6, t: 0, dur: 6 * mul, block: true, heal: 0.04, team: "player" });
      break;
    case "shadowstep": {
      let mx = p.moveX;
      let mz = p.moveZ;
      const L = Math.hypot(mx, mz);
      if (L < 0.1) {
        mx = fx;
        mz = fz;
      } else {
        mx /= L;
        mz /= L;
      }
      const ox = p.x;
      const oz = p.z;
      const e = { x: p.x, z: p.z, y: p.y };
      for (let i = 0; i < 14; i++) {
        e.x += mx * 0.5;
        e.z += mz * 0.5;
        G.col.resolve(e, 0.4);
        if (G.col.ground(e.x, e.z, p.y + 0.5) < p.y - 1.5) {
          e.x -= mx * 0.5;
          e.z -= mz * 0.5;
          break;
        }
      }
      p.x = e.x;
      p.z = e.z;
      p.iframe = Math.max(p.iframe, 0.4);
      for (const en of G.enemies) {
        if (en.dead || Math.hypot(en.x - ox, en.z - oz) > 3 + en.def.radius) continue;
        hurtEnemy(G, en, 12 * mul, "stupefy");
        stun(G, en, 1.5);
      }
      G.emit({ type: "blink", x0: ox, z0: oz, x: p.x, z: p.z, y: p.y });
      break;
    }
    case "counter":
      p.counterT = 1.2 * mul;
      break;
    default:
      return false;
  }
  p.mana -= cost;
  p.cds[slot] = slot === "q" ? S.qCd : S.rCd;
  p.castT = Math.max(p.castT, 0.45);
  p.castSpell = A.id;
  G.emit({ type: "special", id: A.id, slot, hero: G.P.hero });
  return true;
}
/** A free extra bolt (volley) toward the current target. */
function castFree(G, id, o) {
  const p = G.player;
  if (p.dead) return;
  const S = SPELLS[id];
  const w = wandPos(G);
  const target = pickEnemy(G, 0.22, S.range);
  const a = target ? { x: target.x, y: target.y + target.def.height * 0.55, z: target.z } : aimPoint(G);
  const dx = a.x - w.x;
  const dy = a.y - w.y;
  const dz = a.z - w.z;
  const L = Math.hypot(dx, dy, dz) || 1;
  spawnBolt(G, { team: "player", spell: id, x: w.x, y: w.y, z: w.z, dx: dx / L, dy: dy / L, dz: dz / L, speed: S.speed, range: S.range, target, dmg: o.dmg, stun: o.stun, radius: 0.28, color: S.color });
  G.emit({ type: "cast", spell: id, color: S.color, free: true });
}

/* ================================================================ projectiles */
export function spawnBolt(G, b) {
  const pr = {
    team: b.team,
    spell: b.spell || null,
    kind: b.kind || b.spell,
    x: b.x,
    y: b.y,
    z: b.z,
    vx: b.dx * b.speed,
    vy: b.dy * b.speed,
    vz: b.dz * b.speed,
    speed: b.speed,
    life: (b.range || 30) / b.speed,
    dmg: b.dmg || 0,
    src: b.src || null,
    target: b.target || null,
    objTarget: b.objTarget || null,
    radius: b.radius || 0.3,
    pierce: !!b.pierce,
    hits: new Set(),
    color: b.color,
    big: !!b.big,
    stun: b.stun,
    slow: b.slow,
    reflected: !!b.reflected,
    id: ++G.uid,
    homing: b.homing ?? (b.team === "player" ? 2.2 : 0.6),
  };
  G.projectiles.push(pr);
  G.emit({ type: "bolt", id: pr.id, team: pr.team, spell: pr.kind, color: pr.color, x: pr.x, y: pr.y, z: pr.z });
  return pr;
}

export function stepProjectiles(G, dt) {
  const p = G.player;
  const col = G.col;
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const b = G.projectiles[i];
    if (!b) continue; // the list was cleared mid-loop (boss defeated)
    b.life -= dt;
    // gentle homing toward the assigned target
    const tgt = b.team === "player" ? b.target : b.target || null;
    if (tgt && !tgt.dead && b.homing > 0) {
      const ty = (tgt.y || 0) + (tgt.def ? tgt.def.height * 0.55 : 1.1);
      const dx = tgt.x - b.x;
      const dy = ty - b.y;
      const dz = tgt.z - b.z;
      const L = Math.hypot(dx, dy, dz) || 1;
      const k = Math.min(1, b.homing * dt);
      b.vx += ((dx / L) * b.speed - b.vx) * k;
      b.vy += ((dy / L) * b.speed - b.vy) * k;
      b.vz += ((dz / L) * b.speed - b.vz) * k;
      const sp = Math.hypot(b.vx, b.vy, b.vz) || 1;
      b.vx *= b.speed / sp;
      b.vy *= b.speed / sp;
      b.vz *= b.speed / sp;
    }
    const stepLen = b.speed * dt;
    const L = stepLen;
    const ux = b.vx / b.speed;
    const uy = b.vy / b.speed;
    const uz = b.vz / b.speed;
    let end = false;
    // walls
    const wall = col.raycast(b.x, b.y, b.z, ux, uy, uz, L, { noTrees: b.big, skip: (s) => s.kind === "thicket" && b.spell === "incendio" && false });
    let travel = wall;
    // entities along the segment
    if (b.team === "player") {
      for (const e of G.enemies) {
        if (e.dead || b.hits.has(e) || e.untargetable) continue;
        const t = segCapsule(b.x, b.y, b.z, ux, uy, uz, travel, e.x, e.y, e.z, e.def.radius + b.radius, e.def.height);
        if (t >= 0) {
          b.hits.add(e);
          boltHitsEnemy(G, b, e);
          if (!b.pierce) {
            travel = t;
            end = true;
            break;
          }
        }
      }
      // objects that bolts affect (webs, braziers) and boss obelisks
      if (!end && b.spell) {
        for (const o of G.objects.list) {
          if (!(o.def.tags || []).includes(b.spell) || o.gone || b.hits.has(o)) continue;
          const t = segSphere(b.x, b.y, b.z, ux, uy, uz, travel, o.tp.x, o.tp.y, o.tp.z, o.radius + b.radius);
          if (t < 0) continue;
          b.hits.add(o);
          const r = G.objects.apply(o, b.spell);
          if (r.ok && r.msg) G.emit({ type: "notice", text: r.msg, kind: "good" });
          travel = t;
          end = true;
          break;
        }
        if (!end) for (const ob of G.obelisks || []) {
          if (ob.dead) continue;
          const t = segSphere(b.x, b.y, b.z, ux, uy, uz, travel, ob.x, 2.2, ob.z, 1.3 + b.radius);
          if (t < 0) continue;
          G.hurtObelisk(ob, b.dmg * G.stats.dmgMul * (b.spell === "incendio" ? 1.6 : 1));
          travel = t;
          end = true;
          break;
        }
      }
    } else {
      // enemy bolt → domes, hero, protected ally
      for (const z of G.zones) {
        if (z.kind !== "dome" || z.team !== "player") continue;
        const zx = z.follow ? p.x : z.x;
        const zz = z.follow ? p.z : z.z;
        const t = segSphereShell(b.x, b.y, b.z, ux, uy, uz, travel, zx, p.y + 0.8, zz, z.r);
        if (t >= 0) {
          travel = t;
          if (z.reflect) reflect(G, b, 1.5);
          else {
            G.emit({ type: "blocked", x: b.x + ux * t, y: b.y + uy * t, z: b.z + uz * t, color: b.color });
            end = true;
          }
          break;
        }
      }
      if (!end && b.team === "enemy") {
        const t = !p.dead ? segCapsule(b.x, b.y, b.z, ux, uy, uz, travel, p.x, p.y, p.z, 0.42 + b.radius, 1.8) : -1;
        if (t >= 0 && b.team === "enemy") {
          travel = t;
          end = boltHitsPlayer(G, b);
        }
        if (!end && G.protect && !G.protect.down) {
          const a = G.protect;
          const t2 = segCapsule(b.x, b.y, b.z, ux, uy, uz, travel, a.x, a.y, a.z, 0.45 + b.radius, 1.8);
          if (t2 >= 0) {
            G.hurtAlly(a, b.dmg);
            G.emit({ type: "impact", x: a.x, y: a.y + 1.2, z: a.z, color: b.color, spell: b.kind });
            end = true;
          }
        }
      }
    }
    if (!end && wall < L) {
      travel = wall;
      end = true;
      if (b.spell === "incendio") splash(G, b, b.x + ux * travel, b.y + uy * travel, b.z + uz * travel);
      G.emit({ type: "impact", x: b.x + ux * travel, y: b.y + uy * travel, z: b.z + uz * travel, color: b.color, spell: b.kind, wall: true });
    }
    b.x += ux * Math.min(travel, L);
    b.y += uy * Math.min(travel, L);
    b.z += uz * Math.min(travel, L);
    if ((end || b.life <= 0) && G.projectiles[i] === b) {
      G.projectiles.splice(i, 1);
      G.emit({ type: "boltEnd", id: b.id });
    }
  }
}

function boltHitsEnemy(G, b, e) {
  const S = SPELLS[b.spell];
  if (b.reflected && !S) {
    // a reflected enemy curse
    hurtEnemy(G, e, b.dmg, "reflect");
    if (b.counter) stun(G, e, 2);
    G.emit({ type: "impact", x: e.x, y: e.y + e.def.height * 0.6, z: e.z, color: b.color, spell: b.kind });
    return;
  }
  if (!S) return;
  let dmg = b.dmg;
  if (b.spell === "expelliarmus") dmg *= 1 + (R(G, "expelliarmus", 2) ? 0.2 : 0) + (R(G, "expelliarmus", 4) ? 0.2 : 0) + (G.stats.passive === "disarmer" ? 0.3 : 0);
  if (b.spell === "stupefy" && R(G, "stupefy", 3)) dmg *= 1.25;
  if (b.spell === "incendio" && R(G, "incendio", 2)) dmg *= 1.25;
  const pre = { lifted: e.liftT > 0, stunned: e.stunT > 0, disarmed: e.disarmT > 0 };
  const res = hurtEnemy(G, e, dmg, b.spell, { pre });
  G.emit({ type: "impact", x: e.x, y: e.y + e.def.height * 0.6, z: e.z, color: b.color, spell: b.spell, big: b.big });
  if (res === "shielded") return;
  if (e.dead) return;
  switch (b.spell) {
    case "expelliarmus": {
      if (e.def.ai === "caster" || e.def.ai === "boss") {
        const dur = (G.stats.passive === "disarmer" ? 5 : 3.5) * (R(G, "expelliarmus", 3) ? 1.5 : 1);
        disarm(G, e, e.def.ai === "boss" ? 1.2 : dur);
      } else stagger(G, e, 0.5);
      break;
    }
    case "stupefy": {
      let st = b.stun ?? S.stun + (R(G, "stupefy", 2) ? 0.6 : 0);
      if (pre.disarmed) {
        st *= 1.5;
        combo(G, e, "Pinned!");
      }
      stun(G, e, st);
      if (R(G, "stupefy", 4)) {
        const o = G.enemies.find((x) => x !== e && !x.dead && Math.hypot(x.x - e.x, x.z - e.z) < 5);
        if (o) {
          stun(G, o, st * 0.6);
          G.emit({ type: "beam", spell: "stupefy", color: S.color, x0: e.x, y0: e.y + 1.2, z0: e.z, x: o.x, y: o.y + 1.2, z: o.z });
        }
      }
      break;
    }
    case "incendio":
      burn(G, e, R(G, "incendio", 3) ? 6 : 3);
      splash(G, b, e.x, e.y + 1, e.z, e);
      break;
    case "patronum":
      if (R(G, "patronum", 4)) heal(G, G.stats.maxHp * 0.05);
      if (e.type !== "dementor") e.knock = { vx: b.vx * 0.4, vz: b.vz * 0.4, t: 0.3 };
      break;
    default:
      break;
  }
}
function splash(G, b, x, y, z, skip) {
  const r = R(G, "incendio", 4) ? 3.6 : SPELLS.incendio.splash;
  for (const e of G.enemies) {
    if (e.dead || e === skip) continue;
    if (Math.hypot(e.x - x, e.z - z) > r + e.def.radius) continue;
    hurtEnemy(G, e, b.dmg * 0.45, "incendio");
    burn(G, e, 2);
  }
  G.emit({ type: "fireSplash", x, y, z, r });
}

function boltHitsPlayer(G, b) {
  const p = G.player;
  if (p.iframe > 0 || p.dodgeT > 0.08) {
    G.emit({ type: "dodged", x: p.x, y: p.y + 1, z: p.z });
    return false; // it flies past
  }
  if (p.counterT > 0) {
    p.counterT = 0;
    reflect(G, b, 2, true);
    G.emit({ type: "counter", x: p.x, y: p.y + 1.2, z: p.z });
    return false;
  }
  if (p.shieldT > 0) {
    G.setFlag("duelBlock");
    if (p.shieldAge <= perfectWindow(G) && b.kind !== "web" && b.kind !== "beam") {
      reflect(G, b, R(G, "protego", 4) ? 2 : 1.5);
      G.emit({ type: "reflect", x: p.x, y: p.y + 1.2, z: p.z, color: b.color });
      return false;
    }
    G.emit({ type: "blocked", x: p.x, y: p.y + 1.2, z: p.z, color: b.color, shield: true });
    p.mana = Math.max(0, p.mana - 2);
    return true;
  }
  hurtPlayer(G, b.dmg, { src: b.src, kind: b.kind, color: b.color, dirX: b.vx / b.speed, dirZ: b.vz / b.speed });
  if (b.slow) p.slowT = Math.max(p.slowT, b.slow);
  return true;
}
function reflect(G, b, mul, counter = false) {
  const src = b.src;
  b.team = "player";
  b.reflected = true;
  b.counter = counter;
  b.dmg *= mul;
  b.hits = new Set();
  b.life = 3;
  b.target = src && !src.dead ? src : null;
  b.homing = 10;
  let dx;
  let dy;
  let dz;
  if (b.target) {
    dx = src.x - b.x;
    dy = src.y + 1.2 - b.y;
    dz = src.z - b.z;
  } else {
    dx = -b.vx;
    dy = -b.vy;
    dz = -b.vz;
  }
  const L = Math.hypot(dx, dy, dz) || 1;
  b.speed *= 1.3;
  b.vx = (dx / L) * b.speed;
  b.vy = (dy / L) * b.speed;
  b.vz = (dz / L) * b.speed;
  b.color = "#9fe0ff";
  G.emit({ type: "reflected", id: b.id });
}

/* ================================================================ status effects */
export function stun(G, e, t) {
  if (e.dead || e.def.noStun || e.resolute) return;
  const k = e.def.stunMul ?? 1;
  e.stunT = Math.max(e.stunT, t * k);
  if (t * k > 0.3) G.emit({ type: "status", id: e.id, status: "stun", x: e.x, y: e.y + e.def.height + 0.3, z: e.z });
}
export function stagger(G, e, t) {
  if (e.dead) return;
  e.staggerT = Math.max(e.staggerT || 0, t * (e.def.boss ? 0.4 : 1));
  e.windT = 0;
  e.wind = null;
}
function liftEnemy(G, e, t) {
  if (e.dead || e.def.heavy || e.resolute) return;
  e.liftT = t;
  e.stunT = 0;
  e.wind = null;
  G.emit({ type: "status", id: e.id, status: "lift", x: e.x, y: e.y + 1.8, z: e.z });
}
function pullEnemy(G, e, stunT) {
  const p = G.player;
  const dx = p.x - e.x;
  const dz = p.z - e.z;
  const d = Math.hypot(dx, dz) || 1;
  const want = Math.max(0, d - 2.6);
  e.knock = { vx: (dx / d) * want * 3, vz: (dz / d) * want * 3, t: 0.33 };
  e.wind = null;
  stun(G, e, stunT);
  hurtEnemy(G, e, 6, "accio");
}
function disarm(G, e, t) {
  if (e.resolute) return;
  e.disarmT = Math.max(e.disarmT || 0, t);
  e.wind = null;
  e.windT = 0;
  e.shieldT = 0;
  G.emit({ type: "disarm", id: e.id, x: e.x, y: e.y + 1.4, z: e.z });
}
function burn(G, e, t) {
  e.burnT = Math.max(e.burnT || 0, t);
}
function combo(G, e, label) {
  G.emit({ type: "combo", label, x: e.x, y: e.y + e.def.height + 0.6, z: e.z });
}
export function heal(G, n) {
  const p = G.player;
  if (p.dead) return;
  p.hp = Math.min(G.stats.maxHp, p.hp + n);
}

/* ================================================================ damage */
/**
 * Damage an enemy. Returns "shielded" | "dead" | "hit".
 */
export function hurtEnemy(G, e, amount, spell, o = {}) {
  if (e.bossCtl && e.state === "finish" && !e.dead) {
    if (e.bossCtl.onHit(spell)) return "dead";
    if (spell !== "dot") G.emit({ type: "immune", x: e.x, y: e.y + e.def.height + 0.4, z: e.z, hint: "Expelliarmus!" });
    return "shielded";
  }
  if (e.dead || e.invuln) {
    if (e.invuln && amount > 0) G.emit({ type: "immune", x: e.x, y: e.y + e.def.height + 0.4, z: e.z });
    return "shielded";
  }
  const pre = o.pre || { lifted: e.liftT > 0, stunned: e.stunT > 0, disarmed: e.disarmT > 0 };
  if (e.shieldT > 0 && spell !== "dot") {
    if (spell === "expelliarmus" || spell === "patronum") {
      e.shieldT = 0;
      G.emit({ type: "shieldBreak", id: e.id, x: e.x, y: e.y + 1.2, z: e.z });
      combo(G, e, "Shield broken!");
    } else {
      G.emit({ type: "blocked", x: e.x, y: e.y + 1.2, z: e.z, color: "#7fd0ff", enemyShield: true });
      return "shielded";
    }
  }
  const S = G.stats;
  let dmg = amount * (spell === "dot" ? 1 : S.dmgMul);
  const res = e.def.resist || {};
  dmg *= res[spell] ?? res.all ?? 1;
  if (spell === "patronum" && res.patronum) dmg = amount * res.patronum * S.dmgMul;
  let label = null;
  if (pre.lifted && spell !== "dot" && spell !== "accio") {
    dmg *= R(G, "levioso", 4) ? 3 : 2;
    label = "Airborne!";
  } else if (pre.stunned && spell === "incendio") {
    dmg *= 1.5;
    label = "Blaze!";
  }
  let crit = false;
  if (S.crit && spell !== "dot" && G.rand() < S.crit) {
    dmg *= 1.6;
    crit = true;
  }
  // chain bonus: consecutive hits within 2.5 s
  if (spell !== "dot") {
    const c = G.chain;
    c.n = c.t > 0 ? c.n + 1 : 1;
    c.t = 2.5;
    dmg *= 1 + Math.min(0.3, (c.n - 1) * 0.03);
  }
  dmg = Math.max(1, Math.round(dmg));
  e.hp -= dmg;
  e.hitT = 0.15;
  e.aggro = true;
  e.lastHitT = 0;
  if (label) combo(G, e, label);
  G.emit({ type: "dmg", id: e.id, n: dmg, crit, x: e.x, y: e.y + e.def.height + 0.25, z: e.z, dot: spell === "dot", spell });
  if (e.def.yields && e.hp <= e.maxHp * e.def.yields && e.group === "duel" && !G.flag("duelBlock")) {
    // the lesson is the shield: no winning until you've blocked once
    e.hp = Math.ceil(e.maxHp * e.def.yields) + 1;
    // he shrugs off control effects and attacks at once so there is something to block
    e.resolute = true;
    e.stunT = e.disarmT = e.liftT = 0;
    e.castCd = Math.min(e.castCd, 0.8);
    if (!e.toldBlock) {
      e.toldBlock = true;
      G.emit({ type: "say", who: "Professor Snape", text: "Not yet. Show me a Protego first — F, as the spell arrives." });
    }
    return "hit";
  }
  if (e.def.yields && e.hp <= e.maxHp * e.def.yields) {
    e.hp = Math.max(1, e.hp);
    G.enemyYield(e);
    return "dead";
  }
  if (e.hp <= 0) {
    G.killEnemy(e);
    return "dead";
  }
  if (e.def.ai !== "boss" && dmg > e.maxHp * 0.12 && e.stunT <= 0 && e.liftT <= 0) stagger(G, e, 0.25);
  return "hit";
}

export function hurtPlayer(G, amount, o = {}) {
  const p = G.player;
  if (p.dead || G.godMode) return false;
  if (p.iframe > 0) return false;
  let dmg = amount;
  if (p.buffs.edurus > 0) dmg *= 0.65;
  dmg *= 1 - (G.stats.armor || 0);
  for (const z of G.zones) if (z.kind === "dome" && z.block && Math.hypot(p.x - z.x, p.z - z.z) < z.r && o.kind !== "aoe") dmg *= 0.5;
  dmg = Math.max(1, Math.round(dmg));
  p.hp -= dmg;
  p.hitT = 0.35;
  p.combatT = 6;
  if (dmg > 12 && !o.noStagger) {
    p.hurtT = 0.32;
    if (o.dirX != null) p.knock = { vx: o.dirX * 4, vz: o.dirZ * 4, t: 0.18 };
  }
  G.emit({ type: "hurt", n: dmg, kind: o.kind, color: o.color, x: p.x, y: p.y + 1.9, z: p.z });
  if (p.hp <= 0) {
    p.hp = 0;
    G.playerDie();
  }
  return true;
}

/* ================================================================ zones */
/** Domes, area telegraphs ({kind:'warn'}), lingering effects. */
export function stepZones(G, dt) {
  const p = G.player;
  for (let i = G.zones.length - 1; i >= 0; i--) {
    const z = G.zones[i];
    z.t += dt;
    if (z.follow) {
      z.x = p.x;
      z.z = p.z;
    }
    if (z.kind === "dome" && z.heal && Math.hypot(p.x - z.x, p.z - z.z) < z.r) heal(G, G.stats.maxHp * z.heal * dt);
    if (z.kind === "dome" && z.heal && G.protect && !G.protect.down && Math.hypot(G.protect.x - z.x, G.protect.z - z.z) < z.r) G.protect.hp = Math.min(G.protect.maxHp, G.protect.hp + G.protect.maxHp * z.heal * dt);
    if (z.kind === "warn" && !z.fired && z.t >= z.delay) {
      z.fired = true;
      let inside = false;
      if (z.shape === "line") {
        const dx = p.x - z.x;
        const dz = p.z - z.z;
        const fx = Math.sin(z.yaw);
        const fz = Math.cos(z.yaw);
        const along = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        inside = along > 0 && along < z.len && side < z.r + 0.4;
      } else if (z.shape === "ring") {
        const d = Math.hypot(p.x - z.x, p.z - z.z);
        inside = d > z.r0 && d < z.r;
      } else if (z.shape === "cone") {
        const dx = p.x - z.x;
        const dz = p.z - z.z;
        const d = Math.hypot(dx, dz);
        const a = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - z.yaw), Math.cos(Math.atan2(dx, dz) - z.yaw)));
        inside = d < z.r + 0.4 && a < z.half;
      } else inside = Math.hypot(p.x - z.x, p.z - z.z) < z.r + 0.35;
      if (inside && p.y < (z.y ?? 0) + 2.5) hurtPlayer(G, z.dmg, { kind: "aoe", color: z.color });
      if (z.allyDmg && G.protect && !G.protect.down && Math.hypot(G.protect.x - z.x, G.protect.z - z.z) < z.r) G.hurtAlly(G.protect, z.dmg);
      G.emit({ type: "aoe", x: z.x, z: z.z, r: z.r, shape: z.shape, color: z.color, yaw: z.yaw, len: z.len, kind: z.fx });
      z.after?.();
    }
    if (z.t >= (z.dur ?? (z.delay ?? 0) + 0.3)) G.zones.splice(i, 1);
  }
}

/* ================================================================ potions */
export function drinkPotion(G, id) {
  const p = G.player;
  if (p.dead) return { ok: false };
  if (!G.count(id)) return { ok: false, msg: `No ${ITEMS[id].name} left.` };
  if (id === "wiggenweld") {
    if (p.hp >= G.stats.maxHp) return { ok: false, msg: "You're already at full health." };
    heal(G, G.stats.maxHp * 0.5);
  } else if (id === "invigoration") {
    if (p.mana >= G.stats.maxMana) return { ok: false, msg: "Your magic is already full." };
    p.mana = G.stats.maxMana;
  } else if (id === "edurus") p.buffs.edurus = 25;
  G.take(id, 1);
  G.emit({ type: "potion", id });
  return { ok: true, msg: `${ITEMS[id].name}.` };
}

/* ================================================================ geometry */
/** Segment (origin o, unit dir u, length L) vs vertical capsule ≈ cylinder of radius r from y to y+h. */
export function segCapsule(ox, oy, oz, ux, uy, uz, L, cx, cy, cz, r, h) {
  // closest approach in xz, then check height at that t
  const dx = ox - cx;
  const dz = oz - cz;
  const a = ux * ux + uz * uz;
  let t;
  if (a < 1e-8) t = 0;
  else t = clamp(-(dx * ux + dz * uz) / a, 0, L);
  const px = dx + ux * t;
  const pz = dz + uz * t;
  if (px * px + pz * pz > r * r) return -1;
  // back up to the entry point
  if (a > 1e-8) {
    const b = 2 * (dx * ux + dz * uz);
    const c = dx * dx + dz * dz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const t0 = (-b - Math.sqrt(disc)) / (2 * a);
      if (t0 >= 0 && t0 <= L) t = t0;
    }
  }
  const y = oy + uy * t;
  if (y < cy - 0.1 || y > cy + h + 0.2) return -1;
  return t;
}
export function segSphere(ox, oy, oz, ux, uy, uz, L, cx, cy, cz, r) {
  const dx = ox - cx;
  const dy = oy - cy;
  const dz = oz - cz;
  const b = dx * ux + dy * uy + dz * uz;
  const c = dx * dx + dy * dy + dz * dz - r * r;
  if (c <= 0) return 0;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 && t <= L ? t : -1;
}
/** Entering a sphere from outside (domes block bolts coming in, not ones fired from inside). */
function segSphereShell(ox, oy, oz, ux, uy, uz, L, cx, cy, cz, r) {
  const dx = ox - cx;
  const dy = (oy - cy) * 0.6;
  const dz = oz - cz;
  if (dx * dx + dy * dy + dz * dz < r * r) return -1;
  return segSphere(ox, oy, oz, ux, uy, uz, L, cx, cy, cz, r);
}
