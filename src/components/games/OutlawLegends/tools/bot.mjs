/**
 * Mission-playing bot: produces the same input object the keyboard/mouse
 * layer produces, so it drives the real sim (used by levelTest.mjs and the
 * browser harness). Human-ish limits: turn rate, reaction delay, aim error.
 *
 *   const bot = createBot({ skill: "human" });
 *   const input = bot(S, dt);
 */
import { findPath, segmentBlocked, faceAngle, angDiff, clamp } from "../engine/geom.js";
import { objectiveMarkers, interactTarget, muzzle } from "../engine/sim.js";
import { WEAPON_ORDER } from "../engine/data.js";

const SKILL = {
  human: { turn: 7, react: 0.28, err: 0.012, duelReact: 0.42 },
  sharp: { turn: 12, react: 0.12, err: 0.004, duelReact: 0.3 },
};

export function createBot({ skill = "human", seed = 1 } = {}) {
  const K = SKILL[skill] || SKILL.human;
  let r = seed >>> 0 || 1;
  const rand = () => {
    r = (r * 1664525 + 1013904223) >>> 0;
    return r / 4294967296;
  };
  const B = { path: null, pathT: 0, pathGoal: null, target: null, seenT: 0, errY: 0, errP: 0, stuck: 0, lastX: 0, lastZ: 0, holdE: false, roam: null, crouchWant: false };

  /** Aim height on e that both the camera and the gun can see, or null. */
  function visible(S, e) {
    const C = S.cam, P = S.P;
    const ys = e.def.mounted ? [2.0, 2.55] : e.crouch ? [0.9, 1.22] : e.state === "down" ? [0.35] : [1.25, 1.66, 0.8];
    for (const ty of ys) {
      if (segmentBlocked(C.pos[0], C.pos[1], C.pos[2], e.x, ty, e.z, S.obs) >= 0) continue;
      const m = muzzle(S);
      if (segmentBlocked(m[0], m[1], m[2], e.x, ty, e.z, S.obs) < 0) return ty;
    }
    return null;
  }

  function aimAt(S, x, y, z, dt, inp) {
    const C = S.cam;
    const dx = x - C.pos[0], dy = y - C.pos[1], dz = z - C.pos[2];
    const yaw = faceAngle(dx, dz) + B.errY;
    const pitch = Math.atan2(dy, Math.hypot(dx, dz)) + B.errP;
    const t = K.turn * dt;
    const dyaw = angDiff(C.yaw, yaw), dp = pitch - C.pitch;
    inp.dYaw = clamp(dyaw, -t, t);
    inp.dPitch = clamp(dp, -t, t);
    return Math.hypot(dyaw, dp);
  }

  function goTo(S, x, z, dt, inp, near = 0.8) {
    const P = S.P;
    const d = Math.hypot(x - P.x, z - P.z);
    if (d < near) return true;
    B.pathT -= dt;
    if (!B.path || B.pathT <= 0 || !B.pathGoal || Math.hypot(B.pathGoal[0] - x, B.pathGoal[1] - z) > 1.5) {
      B.path = findPath(S.grid, P.x, P.z, x, z) || [[x, z]];
      B.pathGoal = [x, z];
      B.pathT = 0.8;
    }
    while (B.path.length > 1 && Math.hypot(B.path[0][0] - P.x, B.path[0][1] - P.z) < 0.6) B.path.shift();
    const [wx, wz] = B.path[0];
    // move relative to the camera
    const C = S.cam;
    const fx = -Math.sin(C.yaw), fz = -Math.cos(C.yaw);
    const rx = Math.cos(C.yaw), rz = -Math.sin(C.yaw);
    const mx = wx - P.x, mz = wz - P.z, l = Math.hypot(mx, mz) || 1;
    inp.mz = (mx * fx + mz * fz) / l;
    inp.mx = (mx * rx + mz * rz) / l;
    return false;
  }

  function pickWeapon(S, e, d) {
    const P = S.P;
    if (S.step?.fists) return 0;
    let want = "revolver";
    if (P.owned.includes("dual")) want = "dual";
    if (d < 7 && P.owned.includes("shotgun")) want = "shotgun";
    if (d > 26 && P.owned.includes("rifle")) want = "rifle";
    const a = P.ammo[want];
    if (a.mag + a.res === 0) want = P.owned.find((w) => P.ammo[w].mag + P.ammo[w].res > 0) || "revolver";
    return want === P.w ? 0 : WEAPON_ORDER.indexOf(want) + 1;
  }

  return function bot(S, dt) {
    const P = S.P;
    const inp = { mx: 0, mz: 0, dYaw: 0, dPitch: 0, fire: false, fireP: false, aim: false, reload: false, jump: false, sprint: false, dodge: false, melee: false, kick: false, block: false, crouch: false, interact: false, interactHeld: false, weapon: 0, wheel: 0, deadEye: false };
    if (S.status !== "play" || !P.alive) return inp;

    // ---------------- duel
    if (S.duel) {
      const D = S.duel;
      if (D.phase === "draw") {
        const f = D.foe;
        if (D.t > K.duelReact * 0.5) {
          const err = aimAt(S, f.x, 1.25, f.z, dt, inp);
          if (D.t > K.duelReact && err < 0.02) inp.fireP = inp.fire = true;
        }
      }
      return inp;
    }

    const st = S.step;
    const fists = !!st?.fists;

    // ---------------- threats: dynamite & boss telegraphs
    for (const p of S.projectiles) {
      if (Math.hypot(p.x - P.x, p.z - P.z) < 4.5 && p.fuse < 1.6) {
        const C = S.cam;
        const ax = P.x - p.x, az = P.z - p.z, l = Math.hypot(ax, az) || 1;
        const fx = -Math.sin(C.yaw), fz = -Math.cos(C.yaw), rx = Math.cos(C.yaw), rz = -Math.sin(C.yaw);
        inp.mz = (ax * fx + az * fz) / l;
        inp.mx = (ax * rx + az * rz) / l;
        inp.sprint = inp.mz > 0.2;
        if (p.fuse < 0.5 && P.st > 25) inp.dodge = true;
        return inp;
      }
    }

    // ---------------- choose an enemy to fight
    let best = null, bd = Infinity;
    const groups = st?.type === "kill" ? st.groups : null;
    for (const e of S.enemies) {
      if (!e.alive || e.duel || e.state === "takendown") continue;
      const d = Math.hypot(e.x - P.x, e.z - P.z);
      if (d > 60) continue;
      if (visible(S, e) == null && !(fists && d < 3)) continue;
      // a sleeping enemy outside the objective can be left alone
      if (!e.alert && groups && !groups.includes(e.group) && d > 10) continue;
      const score = d + (e.alert ? 0 : 15) + (groups && !groups.includes(e.group) ? 8 : 0);
      if (score < bd) {
        bd = score;
        best = e;
      }
    }

    // hysteresis: keep fighting a target that just slipped out of view for a moment
    if (best) B.keepT = 0.6;
    else if (B.target && B.target.alive && (B.keepT -= dt) > 0 && Math.hypot(B.target.x - P.x, B.target.z - P.z) < 40) best = B.target;

    // takedown prompt → use it
    const it = S.prompt || interactTarget(S);
    if (it?.kind === "takedown" && (fists || !best || best === it.e || Math.hypot(best.x - P.x, best.z - P.z) > 6)) {
      inp.interact = true;
      return inp;
    }

    // dry: fetch ammo, or brawl
    const ammoLeft = P.owned.reduce((n, id) => n + P.ammo[id].mag + P.ammo[id].res, 0);
    if (!fists && ammoLeft === 0) {
      const box = S.pickups.filter((k) => k.kind === "ammo").sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
      if (box) {
        goTo(S, box.x, box.z, dt, inp, 0.4);
        return inp;
      }
      if (best && Math.hypot(best.x - P.x, best.z - P.z) < 2) {
        aimAt(S, best.x, 1.2, best.z, dt, inp);
        inp.melee = P.st > 15;
        return inp;
      }
    }
    if (best) {
      if (best !== B.target) {
        B.target = best;
        B.seenT = 0;
        B.errY = (rand() - 0.5) * 2 * K.err;
        B.errP = (rand() - 0.5) * 2 * K.err;
      }
      B.seenT += dt;
      const d = Math.hypot(best.x - P.x, best.z - P.z);
      if (fists) {
        // fist fight: walk in, punch, block wind-ups
        aimAt(S, best.x, 1.2, best.z, dt, inp);
        if (best.atk && best.atk.t < best.atk.wind && d < 2.4) inp.block = true;
        else if (d > 1.5) goTo(S, best.x, best.z, dt, inp, 1.2);
        else if (P.st > 20) {
          if (rand() < 0.15) inp.kick = true;
          else inp.melee = true;
        }
        return inp;
      }
      inp.weapon = pickWeapon(S, best, d);
      const ty = visible(S, best) ?? 1.25;
      // lead fast riders
      const lead = best.def.mounted ? 0.25 : 0;
      const lx = best.x - Math.sin(best.rot) * best.speed * lead, lz = best.z - Math.cos(best.rot) * best.speed * lead;
      const err = aimAt(S, lx, ty, lz, dt, inp);
      inp.aim = d > 6;
      const a = P.ammo[P.w];
      if (B.seenT > K.react && err < (P.w === "shotgun" ? 0.08 : 0.025) && a.mag > 0 && (!inp.aim || S.cam.aim > 0.6)) {
        inp.fire = true;
        inp.fireP = P.fireCd <= 0;
      }
      if (a.mag === 0) inp.reload = true;
      // close-range melee when the enemy is in our face
      if (d < 1.6 && best.def.meleeOnly) {
        if (best.atk && best.atk.t < best.atk.wind) inp.dodge = P.st > 25;
        else if (a.mag === 0) inp.melee = true;
      }
      // keep useful distance from melee brutes / bosses
      if ((best.def.meleeOnly || best.charge || best.tele?.kind === "charge") && d < 4) {
        const C = S.cam;
        const fx = -Math.sin(C.yaw), fz = -Math.cos(C.yaw), rx = Math.cos(C.yaw), rz = -Math.sin(C.yaw);
        const ax = P.x - best.x, az = P.z - best.z, l = Math.hypot(ax, az) || 1;
        inp.mz = (ax * fx + az * fz) / l;
        inp.mx = (ax * rx + az * rz) / l + (best.tele?.kind === "charge" ? 1 : 0);
        if (best.tele?.kind === "charge" && best.tele.t > 0.55) inp.dodge = true;
        if (best.atk && best.atk.kind === "slam" && best.atk.t > 0.3) inp.dodge = true;
      } else if (d > (P.w === "shotgun" ? 6 : 24) && !(S.step?.type === "defend" || S.step?.type === "survive")) {
        goTo(S, best.x, best.z, dt, inp, 3);
      } else if (best.boss || best.tele?.kind === "fan" || (P.hp < P.maxHp * 0.3 && rand() < 0.02)) {
        inp.mx = Math.sin(S.t * 3) > 0 ? 1 : -1;
      }
      return inp;
    }
    B.target = null;

    // reload between fights
    if (!fists && P.ammo[P.w].mag < (P.w === "rifle" ? 4 : 3) && P.ammo[P.w].res > 0) inp.reload = true;

    // grab nearby healing / ammo
    for (const k of S.pickups) {
      const d = Math.hypot(k.x - P.x, k.z - P.z);
      if (d < 10 && ((k.kind === "tonic" && P.hp < P.maxHp * 0.7) || k.kind === "ammo" || k.kind === "cash")) {
        goTo(S, k.x, k.z, dt, inp, 0.5);
        return inp;
      }
    }

    // ---------------- objective
    if (!st) return inp;
    if (st.type === "talk") {
      const n = S.npcs.find((q) => q.id === st.npc);
      if (goTo(S, n.x, n.z, dt, inp, 2.0)) inp.interact = true;
      return inp;
    }
    if (st.type === "interact") {
      const o = st.ids.map((id) => S.objects.get(id)).filter((q) => q && !q.done).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
      if (!o) return inp;
      const px = o.kind === "poster" ? o.x - 0.8 : o.x, pz = o.z;
      if (goTo(S, px, pz, dt, inp, o.kind === "poster" ? 0.9 : 1.5)) inp.interactHeld = true;
      return inp;
    }
    if (st.type === "targets") {
      const o = st.ids.map((id) => S.objects.get(id)).find((q) => q && !q.done);
      if (!o) return inp;
      const d = Math.hypot(o.x - P.x, o.z - P.z);
      if (d > 12) {
        goTo(S, o.x, o.z + 9, dt, inp, 1);
        return inp;
      }
      inp.aim = true;
      if (B.obj !== o) {
        B.obj = o;
        B.objT = 0;
      }
      B.objT += dt;
      const err = aimAt(S, o.x, o.y + 0.15, o.z, dt, inp);
      if (err < 0.006 && S.cam.aim > 0.9 && B.objT > 0.4 && P.fireCd <= 0) inp.fire = inp.fireP = true;
      if (P.ammo[P.w].mag === 0) inp.reload = true;
      return inp;
    }
    const marks = objectiveMarkers(S);
    if (st.type === "defend" || st.type === "survive") {
      // stay near the objective but hunt enemies within reach
      let near = null, nd = 32;
      for (const e of S.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - P.x, e.z - P.z);
        if (d < nd) {
          nd = d;
          near = e;
        }
      }
      if (near) goTo(S, near.x, near.z, dt, inp, 4);
      else if (marks.length) goTo(S, marks[0][0] + 4, marks[0][1] + 4, dt, inp, 3);
      lookAround(S, dt, inp);
      return inp;
    }
    if (!marks.length) return inp;
    let tgt = marks[0], td = Infinity;
    for (const m of marks) {
      const d = Math.hypot(m[0] - P.x, m[1] - P.z);
      if (d < td) {
        td = d;
        tgt = m;
      }
    }
    goTo(S, tgt[0], tgt[1], dt, inp, st.type === "kill" ? 1.0 : 0.8);
    // face where we walk (so enemies come into view)
    const C = S.cam;
    if (B.path?.length) {
      const [wx, wz] = B.path[0];
      const yaw = faceAngle(wx - P.x, wz - P.z);
      inp.dYaw = clamp(angDiff(C.yaw, yaw), -K.turn * dt, K.turn * dt);
      inp.dPitch = clamp(-0.05 - C.pitch, -0.05, 0.05);
      // re-express movement after turning
      const fx = -Math.sin(C.yaw), fz = -Math.cos(C.yaw), rx = Math.cos(C.yaw), rz = -Math.sin(C.yaw);
      const mx = wx - P.x, mz = wz - P.z, l = Math.hypot(mx, mz) || 1;
      inp.mz = (mx * fx + mz * fz) / l;
      inp.mx = (mx * rx + mz * rz) / l;
    }
    // slow-progress detection (oscillating in place)
    B.win = B.win || { t: 0, x: P.x, z: P.z };
    B.win.t += dt;
    if (B.win.t > 3) {
      if (Math.hypot(P.x - B.win.x, P.z - B.win.z) < 0.8 && (inp.mx || inp.mz)) {
        B.path = null;
        B.wiggle = 1;
        B.wiggleDir = rand() < 0.5 ? 1 : -1;
      }
      B.win = { t: 0, x: P.x, z: P.z };
    }
    // stuck detection
    if (Math.hypot(P.x - B.lastX, P.z - B.lastZ) < 0.02 && (inp.mx || inp.mz)) {
      B.stuck += dt;
      if (B.stuck > 1) {
        B.path = null;
        inp.jump = true;
        B.stuck = 0;
        B.wiggle = 0.6;
        B.wiggleDir = rand() < 0.5 ? 1 : -1;
      }
    } else B.stuck = 0;
    B.lastX = P.x;
    B.lastZ = P.z;
    if (B.wiggle > 0) {
      B.wiggle -= dt;
      inp.mx = B.wiggleDir;
      inp.mz = -0.3;
    }
    return inp;
  };

  function lookAround(S, dt, inp) {
    if (inp.dYaw) return;
    inp.dYaw = dt * 1.4;
    inp.dPitch = clamp(-0.05 - S.cam.pitch, -0.05, 0.05);
  }
}
