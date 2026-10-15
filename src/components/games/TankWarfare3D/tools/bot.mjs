/**
 * Tank Warfare 3D — test pilot. Produces the same input object the live
 * component builds from the keyboard/mouse ({throttle, steer, boost, aim,
 * fire, ammo, repair}), so a bot run exercises the real control path.
 * Used by tools/simTest.mjs (Node) and tools/harness.mjs (browser).
 *
 * It knows where everything is (it's a test tool) but can only hit what its
 * shells can reach: it still needs line of sight, ballistic aim and reloads.
 */
import { AMMO } from "../data.js";

const TAU = Math.PI * 2;
const wrapPi = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createBot(sim, o = {}) {
  const st = { noShot: 0, path: null, pi: 0, goal: null, replan: 0, stuck: 0, back: 0, backSteer: 1, lastAmmo: "ap", repairCd: 0, smokeT: 0, strafe: 0 };
  return function botStep(dt = 1 / 60) {
    const p = sim.player;
    const inp = { throttle: 0, steer: 0, boost: false, aim: null, fire: false, ammo: null, repair: false };
    if (!p.alive || sim.result) return inp;
    const nav = sim.map.nav;
    const stage = sim.stage;
    const def = stage?.def || {};
    const ey = p.y + p.L.ty * p.scale + 0.2;

    // ------------------------------------------------ choose what to shoot
    const enemies = sim.tanks.filter((t) => t.alive && t.side === "enemy");
    let shoot = null;
    let shootD = Infinity;
    for (const e of enemies) {
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d > 190) continue;
      const vis = sim.los(p.x, ey, p.z, e.x, e.y + e.L.top * e.scale * 0.6, e.z);
      if (!vis) continue;
      let score = d;
      if (e.type === "truck") score *= 0.4;
      if (def.type === "escort" && stage.convoy.some((c) => c.alive && Math.hypot(c.x - e.x, c.z - e.z) < 60)) score *= 0.6;
      if (score < shootD) {
        shoot = e;
        shootD = score;
      }
    }
    // structures
    let struct = null;
    const structs = (stage?.targets || []).filter((s) => s.alive);
    if (!shoot && structs.length) {
      let bd = Infinity;
      for (const s of structs) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < bd) {
          bd = d;
          struct = s;
        }
      }
    }

    // ------------------------------------------------ where to drive
    let goal = null;
    let stopNear = 0;
    const nearestEnemy = () => {
      let best = null;
      let bd = Infinity;
      for (const e of enemies) {
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      return best;
    };
    if (sim.mode === "training") {
      if (def.id === "drive") {
        const g = def.gates[stage.gate];
        goal = g;
      } else if (def.id === "smoke") {
        inp.ammo = "smoke";
        const a = { x: p.x + Math.sin(p.heading) * 60, y: p.y, z: p.z + Math.cos(p.heading) * 60 };
        inp.aim = a;
        if (p.loaded === "smoke" && p.reload <= 0) inp.fire = true;
        return inp;
      } else {
        const alive = stage.units.filter((u) => u.alive);
        if (def.id === "he") inp.ammo = "he";
        if (alive.length) {
          const u = alive[0];
          goal = [u.x, u.z];
          stopNear = 45;
          if (!shoot) shoot = u;
        }
      }
    } else if (def.type === "reach") goal = def.point;
    else if (def.type === "capture") {
      goal = def.zone;
      stopNear = 4;
      const ne = nearestEnemy();
      // clear the defenders first, then sit in the zone
      if (ne && Math.hypot(ne.x - def.zone[0], ne.z - def.zone[1]) < def.r + 45) {
        goal = [ne.x, ne.z];
        stopNear = shoot === ne ? 55 : 12;
      }
    } else if (def.type === "defendZone") {
      goal = [def.zone[0], def.zone[1] + 10];
      stopNear = 8;
      const ne = nearestEnemy();
      if (ne && Math.hypot(ne.x - def.zone[0], ne.z - def.zone[1]) < 70 && !shoot) {
        goal = [ne.x, ne.z];
        stopNear = 40;
      }
    } else if (def.type === "defendHQ") {
      // stay between the HQ and the nearest attacker
      const hq = stage.hq;
      let ne = null;
      let bd = Infinity;
      for (const e of enemies) {
        const d = Math.hypot(e.x - hq.x, e.z - hq.z);
        if (d < bd) {
          bd = d;
          ne = e;
        }
      }
      if (ne && bd < 140) {
        goal = [ne.x, ne.z];
        stopNear = shoot ? 55 : 20;
      } else {
        goal = [hq.x, hq.z + 22];
        stopNear = 6;
      }
    } else if (def.type === "escort") {
      const lead = stage.convoy.filter((u) => u.alive && !u.arrived).sort((a, b) => (b.brain.progress || 0) - (a.brain.progress || 0))[0];
      const ne = nearestEnemy();
      if (ne && lead && Math.hypot(ne.x - lead.x, ne.z - lead.z) < 90) {
        goal = [ne.x, ne.z];
        stopNear = 45;
      } else if (lead) {
        // scout ahead of the convoy along its route
        const r = lead.brain.route;
        const q = r[Math.min(lead.brain.ri + 1, r.length - 1)];
        goal = [lead.x + (q[0] - lead.x) * 0.5, lead.z + (q[1] - lead.z) * 0.5];
        stopNear = 10;
      }
    } else if (def.type === "targets" && struct) {
      goal = [struct.x, struct.z];
      stopNear = 40;
    } else {
      const ne = (def.type === "intercept" ? enemies.filter((e) => e.type === "truck").sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0] : null) || nearestEnemy();
      if (ne) {
        goal = [ne.x, ne.z];
        stopNear = shoot === ne ? 55 : 8;
      } else if (def.type === "survival" || def.type === "survive") goal = null;
    }
    if (shoot && def.type !== "escort" && def.type !== "capture" && def.type !== "defendZone" && def.type !== "defendHQ" && sim.mode !== "training" && def.type !== "reach") {
      goal = [shoot.x, shoot.z];
      stopNear = 60;
    }
    if (def.type === "reach" && shoot && Math.hypot(shoot.x - p.x, shoot.z - p.z) < 60) stopNear = 0;
    // no clean shell path for a while (tree, hill crest, wall) → side-step to a new
    // firing position at the same range; after repeated failures close in
    if (st.noShot > 2.5 && (shoot || struct)) {
      const q = shoot || struct;
      if (!st.flank || Math.hypot(st.flank[0] - p.x, st.flank[1] - p.z) < 4) {
        st.flankN = (st.flankN || 0) + 1;
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        const ux = (q.z - p.z) / Math.max(1, d);
        const uz = -(q.x - p.x) / Math.max(1, d);
        const side = st.flankN % 2 ? 1 : -1;
        const k = st.flankN > 3 ? 0.5 : 0;
        st.flank = nav.nearestFree(p.x + ux * side * 16 + (q.x - p.x) * k, p.z + uz * side * 16 + (q.z - p.z) * k, 8);
      }
      goal = st.flank;
      stopNear = 3;
    } else st.flank = null;
    if (inp.fire) st.flankN = 0;
    let tooClose = false;
    if (struct && !shoot && Math.hypot(struct.x - p.x, struct.z - p.z) < 16) tooClose = true;
    let backFrom = struct;
    if (shoot && Math.hypot(shoot.x - p.x, shoot.z - p.z) < 14) {
      tooClose = true;
      backFrom = shoot;
    }

    // ------------------------------------------------ drive
    if (tooClose) {
      const diff = wrapPi(Math.atan2(backFrom.x - p.x, backFrom.z - p.z) - p.heading);
      inp.throttle = -0.8;
      inp.steer = clamp(-diff * 1.2, -1, 1);
    } else if (st.back > 0) {
      st.back -= dt;
      inp.throttle = -0.8;
      inp.steer = st.backSteer;
    } else if (goal) {
      const d = Math.hypot(goal[0] - p.x, goal[1] - p.z);
      if (d > stopNear) {
        st.replan -= dt;
        if (!st.path || st.replan <= 0 || !st.goal || Math.hypot(st.goal[0] - goal[0], st.goal[1] - goal[1]) > 8) {
          st.path = nav.findPath(p.x, p.z, goal[0], goal[1]) || [goal];
          st.pi = 0;
          st.goal = goal;
          st.replan = 1.5;
        }
        while (st.pi < st.path.length - 1 && Math.hypot(st.path[st.pi][0] - p.x, st.path[st.pi][1] - p.z) < 5) st.pi++;
        const wp = st.path[st.pi];
        const diff = wrapPi(Math.atan2(wp[0] - p.x, wp[1] - p.z) - p.heading);
        inp.steer = clamp(-diff * 2.4, -1, 1);
        inp.throttle = Math.abs(diff) > 1.1 ? 0.1 : clamp(1.15 - Math.abs(diff), 0.2, 1);
        if (d > 80 && Math.abs(diff) < 0.3) inp.boost = true;
        // avoid ramming other tanks
        for (const t of sim.tanks) {
          if (t === p || !t.alive) continue;
          const ox = t.x - p.x;
          const oz = t.z - p.z;
          const dd = Math.hypot(ox, oz);
          if (dd > 12) continue;
          const ahead = (ox * Math.sin(p.heading) + oz * Math.cos(p.heading)) / dd;
          if (ahead > 0.4) {
            const cross = Math.sin(p.heading) * oz - Math.cos(p.heading) * ox;
            inp.steer = clamp(inp.steer + (cross < 0 ? 1 : -1) * 0.9, -1, 1);
            if (dd < 7) inp.throttle = Math.min(inp.throttle, 0.2);
          }
        }
        if (inp.throttle > 0.3 && Math.abs(p.speed) < 0.5) {
          st.stuck += dt;
          if (st.stuck > 1.2) {
            st.stuck = 0;
            st.back = 1.1;
            st.backSteer = Math.random() < 0.5 ? -1 : 1;
            st.path = null;
          }
        } else st.stuck = Math.max(0, st.stuck - dt * 0.5);
      } else if (shoot) {
        // in range: angle the hull at the target and strafe a little
        const diff = wrapPi(Math.atan2(shoot.x - p.x, shoot.z - p.z) - p.heading);
        inp.steer = Math.abs(diff) > 0.4 ? clamp(-diff * 1.5, -1, 1) : 0;
      }
    }

    // ------------------------------------------------ aim & fire
    if (inp.ammo == null) {
      let want = "ap";
      if (struct && !shoot) want = p.ammo.he > 0 ? "he" : "ap";
      if (shoot && shoot.type === "truck") want = "ap";
      if (shoot && shoot.type === "dummy" && def.id === "he") want = "he";
      if (want !== p.ammoSel) inp.ammo = want;
    }
    const tgt = shoot || struct;
    if (tgt) {
      const m = sim.muzzle(p, {});
      const d = Math.hypot(tgt.x - m.x, tgt.z - m.z);
      const v = AMMO[p.loaded].speed * (p.st.shellSpeed || 1);
      const tf = d / v;
      let ty;
      if (tgt.L) ty = tgt.y + tgt.L.top * tgt.scale * 0.55;
      else ty = (tgt.y0 + tgt.y1) / 2;
      inp.aim = { x: tgt.x + (tgt.vx || 0) * tf, y: ty, z: tgt.z + (tgt.vz || 0) * tf };
      const yawErr = Math.abs(wrapPi(p.aimYaw - (p.heading + p.tLocal)));
      const elErr = Math.abs(p.aimElev - p.elev);
      const losOk = tgt.L ? sim.los(p.x, ey, p.z, tgt.x, ty, tgt.z) : true;
      if (yawErr < 0.012 && elErr < 0.012 && p.reload <= 0 && losOk && d < 200) {
        // check the predicted impact actually reaches the target
        const pr = sim.predictImpact(p);
        const hitsIt = pr.ref === tgt || Math.hypot(pr.x - tgt.x, pr.z - tgt.z) < (tgt.L ? 6 : tgt.r + 4);
        if (hitsIt || (p.loaded === "he" && Math.hypot(pr.x - tgt.x, pr.z - tgt.z) < 12)) inp.fire = true;
      }
      if (p.reload <= 0 && !inp.fire) st.noShot += dt;
      else if (inp.fire) st.noShot = 0;
    } else {
      const a = goal ? Math.atan2(goal[0] - p.x, goal[1] - p.z) : p.heading;
      inp.aim = { x: p.x + Math.sin(a) * 80, y: p.y + 2, z: p.z + Math.cos(a) * 80 };
    }
    // ------------------------------------------------ repair / smoke
    st.repairCd -= dt;
    const hpF = p.hp / p.maxHp;
    if ((hpF < 0.45 || (p.comp.tracks > 0 && hpF < 0.8)) && p.kits > 0 && st.repairCd <= 0) {
      inp.repair = true;
      st.repairCd = 3;
    }
    return inp;
  };
}
