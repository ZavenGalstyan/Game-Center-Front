/**
 * Zombie Outbreak — an autoplay "survivor" used to validate stages headlessly
 * (tools/simTest.mjs) and to drive the real game in browser QA (?zotest=1).
 *
 * It plays like a decent, imperfect human: limited turn speed, a wandering
 * aim error, a reaction delay when switching targets, it only shoots what it
 * can see, reloads in quiet moments, kites away from crowds, steps out of
 * telegraphed attacks, jumps shockwaves and walks to pickups when hurt or low.
 * It writes into a normal input object, so it exercises exactly the code a
 * player does (weapons, reloads, pickups, collisions).
 */
import { createInput } from "./input.js";
import { isLiving } from "./zombies.js";
import { EYE } from "./game.js";
import { wrapAngle, clamp } from "./math.js";

export function createBot(g, opts = {}) {
  const input = opts.input || createInput();
  const skill = {
    turn: opts.turn ?? 7,
    noise: opts.noise ?? 0.02,
    react: opts.react ?? 0.22,
    ...opts,
  };
  const st = {
    target: null,
    reactT: 0,
    noiseX: 0,
    noiseY: 0,
    noiseT: 0,
    moveX: 0,
    moveZ: 0,
    vis: new Map(),
    reloadWait: 0,
    semiT: 0,
    switchT: 0,
    jumpT: 0,
  };

  function visible(z) {
    const c = st.vis.get(z.id);
    if (c && g.time - c.t < 0.15) return c.v;
    const p = g.player;
    const h = z.hit[2] || z.hit[0];
    const v = g.world.clearShot(p.x, p.y + EYE, p.z, h[0], h[1], h[2]);
    st.vis.set(z.id, { t: g.time, v });
    return v;
  }

  function chooseWeapon(nearD, farD) {
    const a = g.arsenal;
    if (a.state === "lower" || a.state === "raise") return;
    if (st.switchT > 0) return;
    let best = a.cur;
    let bestS = -1;
    a.slots.forEach((s, i) => {
      const ammo = s.mag + s.reserve;
      if (ammo <= 0) return;
      const d = s.def;
      let sc = (d.damage * d.pellets * d.rpm) / 60 / 100;
      if (d.id === "shotgun") sc *= nearD < 7 ? 2.2 : 0.3;
      if (d.id === "marksman") sc *= farD > 12 && nearD > 8 ? 1.8 : 0.6;
      if (d.id === "blaster") sc *= nearD > 3.5 ? 1.6 : 0.4;
      if (s.mag === 0) sc *= 0.5;
      if (i === a.cur) sc *= 1.25; // hysteresis
      if (sc > bestS) {
        bestS = sc;
        best = i;
      }
    });
    if (best !== a.cur) {
      input.queueSlot(best);
      st.switchT = 1.2;
    }
  }

  function think(dt) {
    const p = g.player;
    input.fire = false;
    input.ads = false;
    input.moveX = 0;
    input.moveY = 0;
    input.forward = input.back = input.left = input.right = input.sprint = false;
    if (!p.alive) return;
    st.switchT -= dt;
    st.semiT -= dt;
    st.jumpT -= dt;

    // ------------------------------------------------ threats
    let nearD = Infinity;
    let farD = 0;
    let target = null;
    let tScore = -Infinity;
    const zs = [];
    for (const z of g.zombies) {
      if (!isLiving(z)) continue;
      const d = Math.hypot(z.x - p.x, z.z - p.z);
      zs.push([z, d]);
      if (z.anim.spawn < 0.6) continue;
      nearD = Math.min(nearD, d);
      farD = Math.max(farD, d);
      if (!visible(z)) continue;
      let s = 30 - d;
      if (z.type === "bomber") s += d > 4.5 ? 14 : -10;
      if (z.type === "runner") s += 4;
      if (z.boss) s += 6;
      if (z === st.target) s += 5;
      if (s > tScore) {
        tScore = s;
        target = z;
      }
    }
    if (target !== st.target) {
      st.target = target;
      st.reactT = skill.react;
    }
    st.reactT -= dt;

    chooseWeapon(nearD, farD);
    const a = g.arsenal;

    // ------------------------------------------------ aim + fire
    st.noiseT -= dt;
    if (st.noiseT <= 0) {
      st.noiseT = 0.35;
      st.noiseX = (g.rng.next() * 2 - 1) * skill.noise;
      st.noiseY = (g.rng.next() * 2 - 1) * skill.noise;
    }
    if (target) {
      const d = Math.hypot(target.x - p.x, target.z - p.z);
      const head = d < 16 && !target.boss && target.type !== "bomber";
      const h = head ? target.hit[0] : target.hit[2];
      const ex = p.x;
      const ey = p.y + EYE;
      const ez = p.z;
      const dx = h[0] - ex;
      const dy = h[1] - ey;
      const dz = h[2] - ez;
      const hd = Math.hypot(dx, dz);
      const wantYaw = Math.atan2(-dx, -dz) + st.noiseX;
      const wantPitch = Math.atan2(dy, hd) + st.noiseY;
      const ey2 = wrapAngle(wantYaw - p.yaw);
      const ep = wantPitch - p.pitch;
      const mt = skill.turn * dt;
      p.yaw += clamp(ey2, -mt, mt);
      p.pitch = clamp(p.pitch + clamp(ep, -mt, mt), -1.4, 1.4);
      const err = Math.hypot(wrapAngle(wantYaw - p.yaw), wantPitch - p.pitch);
      const tol = Math.max(0.02, Math.atan2(h[3] * 0.9, Math.max(1, hd)));
      const inRange = d < a.def.range * 0.9;
      input.ads = d > 11 && nearD > 6;
      if (st.reactT <= 0 && err < tol + 0.01 && inRange && a.slot.mag > 0) {
        if (a.def.mode === "auto") input.fire = true;
        else if (st.semiT <= 0) {
          input.press("fire");
          st.semiT = 60 / a.def.rpm + 0.05;
        }
      }
    }
    // Reload in the gaps.
    if (a.state === "ready") {
      const s = a.slot;
      if (s.reserve > 0 && (s.mag === 0 || (s.mag < s.def.mag * 0.4 && nearD > 9) || (s.mag < s.def.mag && nearD > 18))) input.press("reload");
    }

    // ------------------------------------------------ movement
    if (skill.still) return;
    let wantPick = null;
    {
      let bd = Infinity;
      const needHp = p.hp < 65;
      const needAmmo = (a.slot.reserve + a.slot.mag) < a.def.mag * 2.5;
      for (const pk of g.pickups) {
        if (!pk.active) continue;
        const ok = (pk.type === "health" && needHp) || (pk.type === "ammo" && needAmmo) || (pk.type === "armor" && p.armor < 40) || pk.type === "boost";
        if (!ok) continue;
        const d = Math.hypot(pk.x - p.x, pk.z - p.z);
        if (d < bd) {
          bd = d;
          wantPick = pk;
        }
      }
    }
    let bestX = 0;
    let bestZ = 0;
    let bestS = -Infinity;
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      const ux = Math.cos(ang);
      const uz = Math.sin(ang);
      const x1 = p.x + ux * 1.3;
      const z1 = p.z + uz * 1.3;
      const x2 = p.x + ux * 2.8;
      const z2 = p.z + uz * 2.8;
      if (g.world.isBlocked(0, x1, z1)) continue;
      let s = 0;
      if (g.world.isBlocked(0, x2, z2)) s -= 4;
      for (const [z, d0] of zs) {
        if (d0 > 16) continue;
        const d1 = Math.hypot(z.x - x2, z.z - z2);
        const w = z.boss ? 3 : z.type === "bomber" ? 2.5 : z.type === "brute" ? 1.8 : 1;
        s += clamp(d1 - d0, -3, 3) * w * (d0 < 6 ? 2.2 : 1) / Math.max(1, d0 * 0.25);
      }
      // Hazards.
      for (const hz of g.hazards) {
        if (!hz.active) continue;
        if (hz.kind === "line") {
          // Distance from the charge line.
          const lx = Math.sin(hz.yaw);
          const lz = Math.cos(hz.yaw);
          const rx = x2 - hz.x;
          const rz = z2 - hz.z;
          const along = rx * lx + rz * lz;
          const perp = Math.abs(rx * lz - rz * lx);
          if (along > -1 && along < hz.len + 2 && perp < 2.6) s -= 12;
        } else if (hz.kind !== "shock") {
          const d1 = Math.hypot(x2 - hz.x, z2 - hz.z);
          if (d1 < hz.r + 0.9) s -= 10;
        }
      }
      // Spit in flight: step off its line.
      for (const pr of g.projectiles) {
        if (!pr.active || pr.kind !== "spit") continue;
        const vx = pr.vx;
        const vz = pr.vz;
        const vl = Math.hypot(vx, vz) || 1;
        const rx = x2 - pr.x;
        const rz = z2 - pr.z;
        const along = (rx * vx + rz * vz) / vl;
        if (along < 0 || along > 14) continue;
        const perp = Math.abs(rx * vz - rz * vx) / vl;
        if (perp < 1.6) s -= 9 * (1.6 - perp);
      }
      if (wantPick) {
        const d0 = Math.hypot(wantPick.x - p.x, wantPick.z - p.z);
        const d1 = Math.hypot(wantPick.x - x2, wantPick.z - z2);
        s += (d0 - d1) * (p.hp < 40 ? 2.5 : 1.4);
      }
      // Drift back toward the open middle when nothing is going on.
      const cx = (g.arena.bounds.minX + g.arena.bounds.maxX) / 2;
      const cz = (g.arena.bounds.minZ + g.arena.bounds.maxZ) / 2;
      s += (Math.hypot(p.x - cx, p.z - cz) - Math.hypot(x2 - cx, z2 - cz)) * 0.12;
      s += (ux * st.moveX + uz * st.moveZ) * 0.8; // inertia
      if (s > bestS) {
        bestS = s;
        bestX = ux;
        bestZ = uz;
      }
    }
    const calm = nearD > 14 && !wantPick;
    if (bestS > -Infinity && !(calm && bestS < 1)) {
      st.moveX = bestX;
      st.moveZ = bestZ;
      // World direction → local stick (forward = -Z at yaw 0).
      const fx = -Math.sin(p.yaw);
      const fz = -Math.cos(p.yaw);
      const rx = Math.cos(p.yaw);
      const rz = -Math.sin(p.yaw);
      input.moveY = bestX * fx + bestZ * fz;
      input.moveX = bestX * rx + bestZ * rz;
    }
    // Jump shockwave rings.
    for (const hz of g.hazards) {
      if (!hz.active || hz.kind !== "shock") continue;
      const d = Math.hypot(p.x - hz.x, p.z - hz.z);
      if (d > hz.r && d - hz.r < 1.6 && st.jumpT <= 0 && p.grounded) {
        input.press("jump");
        st.jumpT = 0.5;
      }
    }
  }

  return { input, think, state: st };
}
