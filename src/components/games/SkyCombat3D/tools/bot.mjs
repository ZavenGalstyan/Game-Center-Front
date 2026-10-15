/**
 * Sky Combat 3D — test pilot. Produces the same input object the component
 * builds from keyboard + mouse (aim direction for the assisted steering,
 * fire/missile/bomb/flare/lock edges), so a bot run exercises the real
 * player controls. Used by simTest.mjs and the browser harness.
 */
import * as THREE from "three";

const v = () => new THREE.Vector3();

export function createBot(sim, { skill = 1 } = {}) {
  const aim = v();
  const tmp = v();
  const st = { mode: "attack", t: 0, extend: 0, extendDir: v(), lockCd: 0, prevStage: -1, flareCd: 0, strafing: false };
  const ag = (x, z) => sim.hf.ground(x, z);

  function nearest(list, from) {
    let best = null;
    let bd = Infinity;
    for (const e of list) {
      const d = e.pos.distanceTo(from);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  return function frame(dt) {
    const p = sim.player;
    const inp = { aim, assist: true, throttle: 0.9 };
    if (!p.alive || sim.result) return inp;
    st.t += dt;
    st.lockCd -= dt;
    st.flareCd -= dt;
    const stage = sim.stage?.def;
    const hostAir = sim.air.filter((a) => a.alive && a.side === "enemy");
    let goal = null; // {pos, kind:'air'|'ground'|'point', ent}
    if (stage) {
      if (stage.type === "destroy") {
        const tg = [...sim.air, ...sim.ground].filter((e) => e.alive && e.tag === stage.tag);
        const e = nearest(tg, p.pos);
        if (e) goal = { pos: e.pos, kind: e.cat === "air" ? "air" : "ground", ent: e };
      } else if (stage.type === "reach") goal = { pos: tmp.set(...stage.at).clone(), kind: "point" };
      else if (stage.type === "checkpoints") {
        const q = stage.points[sim.stage.cp];
        if (q) goal = { pos: new THREE.Vector3(q[0], q[1], q[2]), kind: "point", gate: true };
      } else if (stage.type === "escort") {
        const f = sim.air.find((a) => a.alive && a.tag === stage.tag);
        const near = f && nearest(hostAir.filter((e) => e.pos.distanceTo(f.pos) < 3500), f.pos);
        if (near) goal = { pos: near.pos, kind: "air", ent: near };
        else if (f) goal = { pos: f.pos.clone().addScaledVector(f.dir, 300).setY(f.pos.y + 150), kind: "point", follow: true };
      }
      // protecting something: kill whoever chases it first
      for (const fl of sim.def.fails || []) {
        if (fl.type !== "protect" || goal?.kind === "air") continue;
        const fr = [...sim.air, ...sim.ground].filter((e) => e.alive && e.tag === fl.tag);
        const thr = hostAir.filter((e) => e.ai.target && fr.includes(e.ai.target));
        const e = nearest(thr, p.pos);
        if (e) goal = { pos: e.pos, kind: "air", ent: e };
      }
      if (!goal || stage.type === "survive" || stage.type === "kills") {
        const keep = st.focus && st.focus.alive && st.focus.side === "enemy" && st.focusT > 0 ? st.focus : null;
        const e = keep || nearest(hostAir, p.pos);
        if (e !== st.focus) {
          st.focus = e;
          st.focusT = 6;
        }
        st.focusT -= dt;
        if (e && (!goal || goal.kind !== "air")) goal = { pos: e.pos, kind: "air", ent: e };
      }
    }
    if (!goal) {
      goal = { pos: new THREE.Vector3(0, 1200, 0), kind: "point" };
    }
    // a fighter attacking us comes before ground work (an invulnerable test run just works the objective)
    if (goal.kind !== "air" && !goal.gate && !sim.god) {
      const att = nearest(hostAir.filter((e) => e.ai.target === p && e.pos.distanceTo(p.pos) < 1600 && e.def.role !== "bomber"), p.pos);
      if (att) goal = { pos: att.pos, kind: "air", ent: att };
    }
    // out of ordnance with ground targets left → rearm over home base
    const hb = sim.homeBase();
    if (goal.kind === "ground" && p.ammo.bombs === 0 && p.ammo.missiles === 0 && (p.ammo.gun < 150 || goal.ent.def.armor < 0.4)) st.rearm = true;
    if (st.rearm) {
      if (p.ammo.bombs > 0 || p.ammo.missiles > 0) st.rearm = false;
      else {
        const hd = Math.hypot(hb.x - p.pos.x, hb.z - p.pos.z);
        goal = { pos: new THREE.Vector3(hb.x, hb.h + (hd < 1500 ? 220 : 600), hb.z), kind: "point" };
        inp.throttle = hd < 2500 ? 0.25 : 0.9;
      }
    }
    // ----- aim
    const to = tmp.copy(goal.pos).sub(p.pos);
    const dist = to.length();
    if (goal.kind === "air") {
      const t = dist / 1100;
      aim.copy(goal.pos).addScaledVector(goal.ent.vel, t).sub(p.pos).normalize();
    } else if (goal.kind === "ground") {
      const e = goal.ent;
      const hd = Math.hypot(to.x, to.z);
      const agl = p.agl;
      if (st.extend > 0) {
        st.extend -= dt;
        aim.copy(st.extendDir);
        if (agl > 1100) aim.setY(0).normalize();
      } else if (hd > 3200) {
        // approach at a safe height above the target
        aim.set(to.x, e.pos.y + 900 - p.pos.y, to.z).normalize();
      } else {
        aim.copy(e.pos).setY(e.pos.y + e.radius * 0.3).sub(p.pos).normalize();
        if (agl < 260 || hd < 330) {
          st.extend = 7;
          st.extendDir.set(to.x, 0, to.z).normalize().addScaledVector(new THREE.Vector3(0, 1, 0), 0.3).normalize();
        }
      }
    } else {
      aim.copy(to).normalize();
    }
    // ----- terrain safety (look ahead along the velocity)
    const look = v().copy(p.pos).addScaledVector(p.vel, goal.gate ? 1.2 : 3);
    const look2 = v().copy(p.pos).addScaledVector(p.vel, goal.gate ? 0.6 : 1.5);
    const minAgl = goal.gate ? 70 : 170;
    if (look.y < ag(look.x, look.z) + minAgl || look2.y < ag(look2.x, look2.z) + minAgl || p.agl < minAgl) {
      // escape toward the lowest ground ahead (out of canyons, not into the wall)
      let best = 0;
      let bestH = Infinity;
      const hd = Math.atan2(p.dir.x, -p.dir.z);
      for (const off of [-1.2, -0.6, 0, 0.6, 1.2]) {
        let h = 0;
        for (const r of [400, 800]) h = Math.max(h, ag(p.pos.x + Math.sin(hd + off) * r, p.pos.z - Math.cos(hd + off) * r));
        if (h + Math.abs(off) * 40 < bestH) { bestH = h + Math.abs(off) * 40; best = off; }
      }
      const climb = bestH + minAgl > p.pos.y ? 0.6 : 0.3;
      aim.set(Math.sin(hd + best), 0, -Math.cos(hd + best)).multiplyScalar(Math.sqrt(1 - climb * climb)).setY(climb);
    }
    if (Math.hypot(p.pos.x, p.pos.z) > 5900) {
      aim.lerp(v().set(-p.pos.x, 0, -p.pos.z).normalize(), 0.6).normalize();
    }
    // ----- weapons
    const ang = Math.acos(Math.max(-1, Math.min(1, aim.dot(p.dir))));
    if (goal.ent) {
      const range = goal.kind === "air" ? 850 : 1300;
      inp.fire = dist < range && ang < (goal.kind === "air" ? 0.07 : 0.06) && st.extend <= 0;
      // don't ram: pass beside a target that's too close
      if (goal.kind === "air" && dist < 160) {
        aim.addScaledVector(v().crossVectors(p.dir, new THREE.Vector3(0, 1, 0)).normalize(), 0.6).normalize();
      }
      if (p.lock.target !== goal.ent && st.lockCd <= 0 && ang < 0.4) {
        inp.lock = true;
        st.lockCd = 1;
      }
      if (p.lock.locked && p.lock.target === goal.ent && dist < 2600 && dist > 400 && p.cd.missile <= 0 && (goal.kind === "ground" || goal.ent.hp > 30)) inp.missile = true;
      if (goal.kind === "ground" && p.ccip && Math.hypot(p.ccip.x - goal.ent.pos.x, p.ccip.z - goal.ent.pos.z) < goal.ent.radius * 0.7 + 12) inp.bomb = true;
    }
    // ----- defence: a gunner on our six → break turn (what a human would do)
    const six = hostAir.find((e) => e.token && e.pos.distanceTo(p.pos) < 700 && v().copy(p.pos).sub(e.pos).normalize().dot(e.dir) > 0.93 && v().copy(e.pos).sub(p.pos).normalize().dot(p.dir) < -0.3);
    if (six && skill > 0.5 && p.hitT > sim.t - 0.5 && !(st.breakT > -3)) {
      st.breakT = 1.6;
      st.breakDir = v().crossVectors(p.dir, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar((st.side = -(st.side || 1))).addScaledVector(p.dir, 0.2).normalize();
    }
    st.breakT = (st.breakT ?? -9) - dt;
    if (st.breakT > 0) {
      aim.copy(st.breakDir);
      if (p.agl < 400) aim.y = Math.max(aim.y, 0.3);
      aim.normalize();
    }
    // ----- threats
    if (p.threats.length) {
      const m = nearest(p.threats, p.pos);
      const md = m.pos.distanceTo(p.pos);
      if (md < 1400 && st.flareCd <= 0) {
        inp.flare = true;
        st.flareCd = 2;
      }
      if (md < 1800 && skill > 0.5) {
        // break perpendicular to the missile
        const away = v().copy(p.pos).sub(m.pos).normalize();
        const side = v().crossVectors(away, new THREE.Vector3(0, 1, 0)).normalize();
        aim.copy(side).addScaledVector(p.dir, 0.3).normalize();
        if (p.agl < 400) aim.y = Math.max(aim.y, 0.3);
        aim.normalize();
      }
    }
    // gates: slow a bit for accuracy
    if (goal.gate) {
      inp.throttle = 0.25;
      // stay under the radar ceiling
      if (stage.ceiling && p.pos.y > stage.ceiling - 120) {
        aim.y = Math.min(aim.y, -0.1);
        aim.normalize();
      }
    }
    if (p.speed < 120) inp.throttle = 1;
    return inp;
  };
}
