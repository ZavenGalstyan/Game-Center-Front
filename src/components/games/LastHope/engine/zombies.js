/**
 * Last Hope — zombie AI.
 *
 * States: idle → roam ⇄ idle; on sight / sound / damage → chase.
 * chase → windup (telegraphed melee) → recover → chase …
 *        toxic: spitWind → recover; brute: slamWind / chargeWind → charge → stun
 *        blocked by camp structures on the cheapest route → siege (hits it)
 * lost sight for 5 s → search (walk to last known spot, look around) → return
 * (A* home) → idle. Leashed to their home area; bosses to their arena.
 *
 * Fairness: every attack has a windup the renderer telegraphs (ring + raised
 * arms); it only lands if the player is still in reach when the windup ends.
 */
import { ZOMBIES, BOSSES } from "../data/zombies.js";
import { hurtPlayer, emit, damageZombie } from "./damage.js";
import { angDiff, yawOf } from "./util.js";
import { damageStructure } from "./building.js";

export const isNight = (G) => G.clock >= 20 || G.clock < 5.5;

export function spawnZombie(G, t, x, z, o = {}) {
  const def = ZOMBIES[t];
  const bd = o.boss ? BOSSES[o.boss] : null;
  const rng = G.rng;
  const hp = Math.round((bd?.hp ?? def.hp) * G.diff.zhp);
  const sc = bd ? bd.scale : t === "brute" ? 1.45 : 0.93 + rng() * 0.14;
  const zb = {
    id: G.R.nextId++,
    t,
    def,
    boss: o.boss || null,
    x,
    z,
    yaw: rng() * Math.PI * 2,
    hp,
    maxHp: hp,
    state: "idle",
    st: rng() * 3,
    home: { x: o.hx ?? x, z: o.hz ?? z, r: o.r ?? 6 },
    vx: 0,
    vz: 0,
    kx: 0,
    kz: 0,
    atkCd: 0,
    spitCd: 0.4 + rng() * 1.2,
    slamCd: 3,
    chargeCd: 4,
    flash: 0,
    lost: 0,
    losT: rng() * 0.2,
    see: false,
    direct: false,
    lastSeen: null,
    path: null,
    pathI: 0,
    roamTo: null,
    night: !!o.night,
    raid: !!o.raid,
    scale: sc,
    v: Math.floor(rng() * 1e6),
    cls: def.size,
    r: def.radius * (bd ? bd.scale / 1.45 : 1),
    dmgMul: bd?.dmgMul ?? 1,
    speed: 0,
    groanT: 2 + rng() * 6,
    arena: o.arena || null,
    sid: -1,
    spikeT: 0,
    atk: null,
    tele: 0,
  };
  G.R.zombies.push(zb);
  return zb;
}

function inArena(a, x, z) {
  return x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1;
}

function aware(G, z) {
  if (z.state === "chase") return;
  const was = z.state;
  z.state = "chase";
  z.st = 0;
  z.lost = 0;
  z.path = null;
  z.lastSeen = { x: G.P.x, z: G.P.z };
  if (was === "idle" || was === "roam") {
    z.groanT = 0;
    // the pack follows
    for (const o of G.R.zombies) {
      if (o === z || o.state === "dead" || o.boss) continue;
      if ((o.state === "idle" || o.state === "roam") && (o.x - z.x) ** 2 + (o.z - z.z) ** 2 < 7.5 * 7.5) {
        o.state = "chase";
        o.st = 0;
        o.lost = 0;
        o.lastSeen = { x: G.P.x, z: G.P.z };
      }
    }
  }
}

function startAttack(G, z, kind, wind) {
  z.state = kind;
  z.st = wind;
  z.tele = wind;
  z.vx *= 0.3;
  z.vz *= 0.3;
  emit(G, { t: "ztele", id: z.id, kind, wind });
}

export function stepZombies(G, dt) {
  const R = G.R;
  const P = G.P;
  const night = isNight(G);
  // distance fields toward the player (only while someone hunts)
  const need = [false, false];
  for (const z of R.zombies) if (z.state === "chase" || z.state === "siege") need[z.cls] = true;
  for (let c = 0; c < 2; c++) if (need[c]) R.field[c] = R.nav.field(c, P.x, P.z, 48, G.t);

  for (const z of R.zombies) updateZombie(G, z, dt, night);

  // separation
  const Z = R.zombies;
  for (let i = 0; i < Z.length; i++) {
    const a = Z[i];
    if (a.state === "dead") continue;
    for (let j = i + 1; j < Z.length; j++) {
      const b = Z[j];
      if (b.state === "dead") continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const rr = a.r + b.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (rr - d) * 0.5;
        const wa = a.boss ? 0.1 : b.boss ? 0.9 : 0.5;
        a.x -= (dx / d) * push * wa * 2;
        a.z -= (dz / d) * push * wa * 2;
        b.x += (dx / d) * push * (1 - wa) * 2;
        b.z += (dz / d) * push * (1 - wa) * 2;
      }
    }
  }
  // corpses fade; night stragglers leave at dawn
  for (let i = Z.length - 1; i >= 0; i--) {
    const z = Z[i];
    if (z.state === "dead" && z.st > 9) Z.splice(i, 1);
    else if (z.night && !night && (z.state === "idle" || z.state === "roam") && (z.x - P.x) ** 2 + (z.z - P.z) ** 2 > 32 * 32) Z.splice(i, 1);
  }
}

function updateZombie(G, z, dt, night) {
  const P = G.P;
  const R = G.R;
  const d = z.def;
  z.flash = Math.max(0, z.flash - dt * 4);
  z.atkCd -= dt;
  z.spitCd -= dt;
  z.slamCd -= dt;
  z.chargeCd -= dt;
  if (z.state === "dead") {
    z.st += dt;
    z.speed = 0;
    return;
  }
  const dx = P.x - z.x;
  const dz = P.z - z.z;
  const dP = Math.hypot(dx, dz);
  const toP = yawOf(dx, dz);

  // ---------------------------------------------------------------- perception
  z.losT -= dt;
  if (z.losT <= 0) {
    z.losT = 0.16 + G.rng() * 0.1;
    if (P.dead) z.see = false;
    else {
      const rad = d.detect * (P.sprinting ? 1.35 : 1) * (night ? 0.85 : 1) * (P.sneak ? 0.65 : 1);
      z.see = dP < rad && R.col.raycast(z.x, z.z, P.x, P.z, true) >= 0.999;
      if (!z.see && dP < 1.6) z.see = true;
      z.direct = z.see && dP < 30 && R.nav.clear(z.cls, z.x, z.z, P.x, P.z);
    }
    for (const n of R.noise)
      if (!P.dead && (z.state === "idle" || z.state === "roam" || z.state === "search" || z.state === "return") && (n.x - z.x) ** 2 + (n.z - z.z) ** 2 < n.r * n.r) {
        z.state = "search";
        z.lastSeen = { x: n.x, z: n.z };
        z.st = 0;
        z.path = null;
      }
  }
  const passive = z.state === "idle" || z.state === "roam" || z.state === "return" || z.state === "search";
  if (z.see && passive && !(z.arena && !inArena(z.arena, P.x, P.z))) aware(G, z);

  // groans
  z.groanT -= dt;
  if (z.groanT <= 0) {
    z.groanT = z.state === "chase" ? 2.5 + G.rng() * 3 : 5 + G.rng() * 7;
    if (dP < 24) emit(G, { t: "groan", id: z.id, type: z.t, x: z.x, z: z.z, chase: z.state === "chase", boss: !!z.boss });
  }

  let dirX = 0;
  let dirZ = 0;
  let speed = 0;
  let face = null;

  switch (z.state) {
    case "idle": {
      z.st -= dt;
      if (z.st <= 0) {
        for (let k = 0; k < 6; k++) {
          const a = G.rng() * Math.PI * 2;
          const r = Math.sqrt(G.rng()) * z.home.r;
          const tx = z.home.x + Math.cos(a) * r;
          const tz = z.home.z + Math.sin(a) * r;
          if (!R.nav.isBlocked(z.cls, tx, tz) && R.nav.clear(z.cls, z.x, z.z, tx, tz)) {
            z.roamTo = { x: tx, z: tz };
            z.state = "roam";
            z.st = 0;
            break;
          }
        }
        if (z.state === "idle") z.st = 1 + G.rng() * 2;
      }
      break;
    }
    case "roam": {
      z.st += dt;
      const tx = z.roamTo.x - z.x;
      const tz = z.roamTo.z - z.z;
      const l = Math.hypot(tx, tz);
      if (l < 0.6 || z.st > 9) {
        z.state = "idle";
        z.st = 2 + G.rng() * 5;
      } else {
        dirX = tx / l;
        dirZ = tz / l;
        speed = d.roam;
      }
      break;
    }
    case "search": {
      z.st += dt;
      const ls = z.lastSeen || z.home;
      const tx = ls.x - z.x;
      const tz = ls.z - z.z;
      const l = Math.hypot(tx, tz);
      if (z.st > 14) {
        toReturn(G, z);
        break;
      }
      if (l > 1) {
        if (R.nav.clear(z.cls, z.x, z.z, ls.x, ls.z)) {
          dirX = tx / l;
          dirZ = tz / l;
        } else {
          if (!z.path) {
            z.path = R.nav.path(z.cls, z.x, z.z, ls.x, ls.z, 5000) || [];
            z.pathI = 0;
          }
          const wp = z.path[z.pathI];
          if (wp) {
            const wx = wp[0] - z.x;
            const wz = wp[1] - z.z;
            const wl = Math.hypot(wx, wz);
            if (wl < 0.6) z.pathI++;
            else {
              dirX = wx / wl;
              dirZ = wz / wl;
            }
          } else z.st = 99;
        }
        speed = (d.roam + d.chase) * 0.5;
      } else {
        // arrived: look around, then give up
        z.look = (z.look || 0) + dt;
        face = z.yaw + Math.sin(z.look * 2.2) * 0.9 * dt * 4;
        if (z.look > 2.6) {
          z.look = 0;
          toReturn(G, z);
        }
      }
      break;
    }
    case "return": {
      const tx = z.home.x - z.x;
      const tz = z.home.z - z.z;
      const l = Math.hypot(tx, tz);
      if (l < 1.2) {
        z.state = "idle";
        z.st = 1 + G.rng() * 3;
        z.path = null;
        if (z.boss) z.hp = Math.min(z.maxHp, z.hp + z.maxHp * 0.25);
        break;
      }
      if (!z.path) {
        z.path = R.nav.clear(z.cls, z.x, z.z, z.home.x, z.home.z) ? [[z.home.x, z.home.z]] : R.nav.path(z.cls, z.x, z.z, z.home.x, z.home.z) || [[z.home.x, z.home.z]];
        z.pathI = 0;
      }
      const wp = z.path[Math.min(z.pathI, z.path.length - 1)];
      const wx = wp[0] - z.x;
      const wz = wp[1] - z.z;
      const wl = Math.hypot(wx, wz);
      if (wl < 0.6 && z.pathI < z.path.length - 1) z.pathI++;
      dirX = wx / (wl || 1);
      dirZ = wz / (wl || 1);
      speed = d.roam * 1.3;
      break;
    }
    case "chase": {
      if (P.dead) {
        toReturn(G, z);
        break;
      }
      // raiders know where you are; so does anyone whose route runs into your walls
      const besieging = z.raid || (z.sid >= 0 && dP < 26);
      if (z.see || besieging) {
        z.lastSeen = { x: P.x, z: P.z };
        z.lost = 0;
      } else {
        z.lost += dt;
        if (z.lost > 5) {
          z.state = "search";
          z.st = 0;
          z.path = null;
          break;
        }
      }
      if (z.arena ? !inArena(z.arena, P.x, P.z) && dP > 6 : (z.x - z.home.x) ** 2 + (z.z - z.home.z) ** 2 > (z.raid ? 120 : 62) ** 2 && !z.see) {
        toReturn(G, z);
        break;
      }
      // attacks
      const reach = d.reach + 0.25;
      if (d.boss) {
        if (z.slamCd <= 0 && dP < d.slam.r * 0.8) {
          z.atk = { kind: "slam", x: z.x + Math.sin(z.yaw) * 0.6, z: z.z + Math.cos(z.yaw) * 0.6 };
          startAttack(G, z, "slamWind", d.slam.windup);
          z.slamCd = d.slam.cd;
          break;
        }
        if (z.chargeCd <= 0 && dP > d.charge.min && dP < d.charge.max && z.direct) {
          startAttack(G, z, "chargeWind", d.charge.windup);
          z.chargeCd = d.charge.cd;
          break;
        }
      }
      if (d.spit && z.spitCd <= 0 && z.see && dP > d.spit.min && dP < d.spit.range) {
        startAttack(G, z, "spitWind", d.spit.windup);
        z.spitCd = d.spit.cd;
        break;
      }
      if (dP < reach && z.atkCd <= 0 && R.col.raycast(z.x, z.z, P.x, P.z, true) >= 0.999) {
        startAttack(G, z, "windup", d.windup * (z.boss ? 1 : 1));
        z.atkCd = d.cd;
        break;
      }
      speed = d.chase * (night ? 1.08 : 1);
      // spitters hold at mid range while the spit comes off cooldown
      if (d.spit && z.see && z.spitCd < 1.4 && dP > d.spit.min + 0.8 && dP < d.spit.range - 1) {
        speed = 0;
        face = toP;
        break;
      }
      if (dP < reach * 0.8) {
        speed = 0;
        face = toP;
        break;
      }
      if (z.direct) {
        dirX = dx / dP;
        dirZ = dz / dP;
        z.sid = -1;
      } else {
        const F = R.field[z.cls];
        const s = F && R.nav.step(z.cls, F, z.x, z.z);
        if (s && (s.dx || s.dz) && Number.isFinite(s.d)) {
          dirX = s.dx;
          dirZ = s.dz;
          z.sid = s.sid;
          if (s.sid >= 0) {
            const st = G.structById?.(s.sid);
            if (st && nearShape(st.shape, z.x, z.z, z.r + 0.75)) {
              z.state = "siege";
              z.st = 0;
              z.atkCd = Math.max(z.atkCd, 0.2);
              break;
            }
          }
        } else if (z.lastSeen) {
          const tx = z.lastSeen.x - z.x;
          const tz = z.lastSeen.z - z.z;
          const l = Math.hypot(tx, tz) || 1;
          dirX = tx / l;
          dirZ = tz / l;
          if (l < 0.8) z.lost = Math.max(z.lost, 4);
        }
      }
      break;
    }
    case "siege": {
      const st = G.structById?.(z.sid);
      if (!st || P.dead || z.direct) {
        z.state = "chase";
        z.sid = -1;
        break;
      }
      face = yawOf(st.x - z.x, st.z - z.z);
      if (!nearShape(st.shape, z.x, z.z, z.r + 0.95)) {
        const l = Math.hypot(st.x - z.x, st.z - z.z) || 1;
        dirX = (st.x - z.x) / l;
        dirZ = (st.z - z.z) / l;
        speed = d.chase * 0.6;
      } else if (z.atkCd <= 0) {
        z.atk = { kind: "struct", sid: z.sid };
        startAttack(G, z, "windup", d.windup);
        z.atkCd = d.cd;
      }
      break;
    }
    case "windup":
    case "spitWind":
    case "slamWind":
    case "chargeWind": {
      z.st -= dt;
      const frac = 1 - z.st / (z.tele || 1);
      if (z.state !== "slamWind" && frac < (z.state === "chargeWind" ? 0.75 : 0.65)) {
        const tgt = z.atk?.kind === "struct" ? G.structById?.(z.atk.sid) : null;
        face = tgt ? yawOf(tgt.x - z.x, tgt.z - z.z) : toP;
      }
      if (z.st <= 0) resolveAttack(G, z, dP, toP);
      break;
    }
    case "charge": {
      z.st -= dt;
      dirX = Math.sin(z.yaw);
      dirZ = Math.cos(z.yaw);
      speed = d.charge.speed;
      face = z.yaw;
      if (dP < z.r + 0.75 && !P.dead) {
        hurtPlayer(G, d.charge.dmg * z.dmgMul, z, { knock: 1.6, kind: "charge" });
        z.state = "recover";
        z.st = 1.0;
        emit(G, { t: "shake", k: 0.8 });
      } else if (z.st <= 0) {
        z.state = "recover";
        z.st = 0.6;
      }
      break;
    }
    case "stun":
    case "recover":
    case "hurt": {
      z.st -= dt;
      if (z.state === "recover" && z.st > 0.15) face = toP;
      if (z.st <= 0) {
        if (z.state === "hurt" && passive) z.state = "chase";
        else z.state = "chase";
      }
      break;
    }
  }

  // ---------------------------------------------------------------- integrate
  const tvx = dirX * speed;
  const tvz = dirZ * speed;
  const acc = Math.min(1, dt * (z.state === "charge" ? 12 : 7));
  z.vx += (tvx - z.vx) * acc;
  z.vz += (tvz - z.vz) * acc;
  z.x += (z.vx + z.kx) * dt;
  z.z += (z.vz + z.kz) * dt;
  const kd = Math.exp(-7 * dt);
  z.kx *= kd;
  z.kz *= kd;
  const res = R.col.resolve(z.x, z.z, z.r, R.skipOpen);
  if (z.state === "charge" && res.hit && res.solid && !res.solid.door && Math.hypot(res.x - z.x, res.z - z.z) > 0.02) {
    z.state = "stun";
    z.st = 1.8;
    emit(G, { t: "zstun", id: z.id, x: z.x, z: z.z });
    emit(G, { t: "shake", k: 0.6 });
  }
  z.x = res.x;
  z.z = res.z;
  if (res.hit && res.solid?.spikes) {
    z.spikeT -= dt;
    if (z.spikeT <= 0) {
      z.spikeT = 0.6;
      damageZombie(G, z, res.solid.spikes * 0.6, { kind: "spike", stagger: 0.1 });
      damageStructure(G, res.solid.sid, 4);
    }
  }
  // the player is heavier
  if (!P.dead) {
    const px = z.x - P.x;
    const pz = z.z - P.z;
    const rr = z.r + P.r;
    const d2 = px * px + pz * pz;
    if (d2 < rr * rr && d2 > 1e-6) {
      const l = Math.sqrt(d2);
      const push = rr - l;
      const wz = z.boss ? 0.2 : 0.85;
      z.x += (px / l) * push * wz;
      z.z += (pz / l) * push * wz;
      P.x -= (px / l) * push * (1 - wz);
      P.z -= (pz / l) * push * (1 - wz);
    }
  }
  z.speed = Math.hypot(z.vx, z.vz);
  const wantYaw = face != null ? face : z.speed > 0.15 ? yawOf(z.vx, z.vz) : null;
  if (wantYaw != null) {
    const turn = (z.boss ? 3.2 : 6.5) * dt;
    const da = angDiff(z.yaw, wantYaw);
    z.yaw += Math.max(-turn, Math.min(turn, da));
  }
}

function toReturn(G, z) {
  z.state = "return";
  z.path = null;
  z.st = 0;
  z.sid = -1;
}

function resolveAttack(G, z, dP, toP) {
  const P = G.P;
  const d = z.def;
  const kind = z.state;
  z.state = "recover";
  z.st = 0.45;
  if (kind === "windup") {
    if (z.atk?.kind === "struct") {
      damageStructure(G, z.atk.sid, d.dmg * 1.2 * z.dmgMul);
      emit(G, { t: "zstruct", id: z.id, sid: z.atk.sid });
      z.atk = null;
      z.state = "siege";
      return;
    }
    if (!P.dead && dP <= d.reach + 0.45 && Math.abs(angDiff(z.yaw, toP)) < 1.25 && G.R.col.raycast(z.x, z.z, P.x, P.z, true) >= 0.999) {
      hurtPlayer(G, d.dmg * z.dmgMul, z, { poison: d.poison || 0, knock: z.boss ? 0.9 : 0.35 });
      emit(G, { t: "zstrike", id: z.id, hit: true });
    } else emit(G, { t: "zstrike", id: z.id, hit: false });
  } else if (kind === "spitWind") {
    const s = d.spit;
    // lead the target a little
    const lead = Math.min(0.5, dP / s.speed) * 0.6;
    const tx = P.x + P.vx * lead - z.x;
    const tz = P.z + P.vz * lead - z.z;
    const l = Math.hypot(tx, tz) || 1;
    G.R.proj.push({ id: G.R.nextId++, owner: "z", kind: "spit", x: z.x + (tx / l) * 0.5, z: z.z + (tz / l) * 0.5, y: 1.4, vx: (tx / l) * s.speed, vz: (tz / l) * s.speed, dmg: s.dmg, poison: d.poison, life: s.range / s.speed + 0.25, pierce: 0 });
    emit(G, { t: "spit", id: z.id, x: z.x, z: z.z });
    z.state = "recover";
    z.st = 0.6;
  } else if (kind === "slamWind") {
    const a = z.atk || { x: z.x, z: z.z };
    const r = d.slam.r;
    if (!P.dead && (P.x - a.x) ** 2 + (P.z - a.z) ** 2 < r * r) hurtPlayer(G, d.slam.dmg * z.dmgMul, a, { knock: 1.3, kind: "slam" });
    emit(G, { t: "slam", id: z.id, x: a.x, z: a.z, r });
    emit(G, { t: "shake", k: 1 });
    z.state = "recover";
    z.st = 0.9;
  } else if (kind === "chargeWind") {
    z.state = "charge";
    z.st = 1.45;
    emit(G, { t: "charge", id: z.id });
  }
}

function nearShape(s, x, z, r) {
  if (!s) return false;
  if (s.k === "c") return (x - s.x) ** 2 + (z - s.z) ** 2 < (r + s.r) ** 2;
  const c = Math.cos(s.a || 0);
  const sn = Math.sin(s.a || 0);
  const dx = x - s.x;
  const dz = z - s.z;
  const lx = Math.abs(c * dx - sn * dz) - s.hw;
  const lz = Math.abs(sn * dx + c * dz) - s.hd;
  return Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) < r;
}
