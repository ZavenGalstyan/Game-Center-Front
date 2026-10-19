/**
 * Hulk: Open World 3D — ambient life: moving traffic and pedestrians.
 *
 * TRAFFIC  pooled car props that drive the lanes north of the river
 *          (right-hand traffic, lanes 3 m off the centre-line), turning
 *          at intersections through entry / exit waypoints. A driving car
 *          is a normal prop (grab it, smash it, body-slam it); the moment it
 *          is damaged, launched or grabbed it stops being traffic. Cars brake
 *          for the hero and for each other.
 * CIVILIANS walkers on the sidewalks that panic and flee from the hero's
 *          rampages, explosions and gunfire. Mission civilians (protect /
 *          rescue) are made by the mission runtime with `critical: true`.
 */
import { PITCH, ROAD_HW, N } from "./city.js";
import { clamp, dampA } from "./util.js";
import { propBox } from "./props.js";

const LANE = 3;
const MAX_J = 6; // traffic stays north of the river (z ≤ 576)
const TRAFFIC_N = 16;
const CIV_N = 14;

/* ================================================================ traffic */
function laneStart(sim) {
  // a random lane point 70-150 m from the hero, preferably out of view
  const h = sim.hero;
  for (let k = 0; k < 20; k++) {
    const axis = sim.rand() < 0.5 ? "x" : "z";
    const dir = sim.rand() < 0.5 ? 1 : -1;
    if (axis === "x") {
      // road z = j*96, driving along x
      const j = clamp(Math.round(h.z / PITCH) + Math.floor((sim.rand() - 0.5) * 4), 0, MAX_J);
      const x = clamp(h.x + (sim.rand() - 0.5) * 300, 20, N * PITCH - 20);
      const z = j * PITCH + dir * LANE;
      const d = Math.hypot(x - h.x, z - h.z);
      if (d < 70 || d > 170) continue;
      if (Math.abs(x - Math.round(x / PITCH) * PITCH) < 16) continue;
      return { x, z, axis, dir };
    }
    const i = clamp(Math.round(h.x / PITCH) + Math.floor((sim.rand() - 0.5) * 4), 0, N);
    const z = clamp(h.z + (sim.rand() - 0.5) * 300, 20, MAX_J * PITCH - 20);
    const x = i * PITCH - dir * LANE;
    const d = Math.hypot(x - h.x, z - h.z);
    if (d < 70 || d > 170) continue;
    if (Math.abs(z - Math.round(z / PITCH) * PITCH) < 16) continue;
    return { x, z, axis, dir };
  }
  return null;
}
/** next intersection along the lane → entry and exit waypoints */
function planTurn(sim, c) {
  const d = c.drive;
  if (d.axis === "x") {
    const X = d.dir > 0 ? Math.ceil((c.x + 1) / PITCH) * PITCH : Math.floor((c.x - 1) / PITCH) * PITCH;
    const j = Math.round(c.z / PITCH);
    const opts = [];
    if (X > 0 && X < N * PITCH) opts.push("s", "s");
    if (j > 0) opts.push("n");
    if (j < MAX_J) opts.push("so");
    if (!opts.length) opts.push("u");
    const pick = opts[Math.floor(sim.rand() * opts.length)];
    const zc = j * PITCH;
    d.wps = [[X - d.dir * (ROAD_HW + 3), zc + d.dir * LANE]];
    if (pick === "s") d.wps.push([X + d.dir * (ROAD_HW + 3), zc + d.dir * LANE]), (d.next = { axis: "x", dir: d.dir });
    else if (pick === "n") d.wps.push([X + LANE, zc - LANE], [X + LANE, zc - (ROAD_HW + 3)]), (d.next = { axis: "z", dir: -1 });
    else if (pick === "so") d.wps.push([X - LANE, zc + LANE], [X - LANE, zc + ROAD_HW + 3]), (d.next = { axis: "z", dir: 1 });
    else d.wps.push([X, zc], [X - d.dir * (ROAD_HW + 3), zc - d.dir * LANE]), (d.next = { axis: "x", dir: -d.dir });
  } else {
    const Z = d.dir > 0 ? Math.ceil((c.z + 1) / PITCH) * PITCH : Math.floor((c.z - 1) / PITCH) * PITCH;
    const i = Math.round(c.x / PITCH);
    const opts = [];
    if (Z > 0 && Z < MAX_J * PITCH) opts.push("s", "s");
    if (i > 0) opts.push("w");
    if (i < N) opts.push("e");
    if (!opts.length) opts.push("u");
    const pick = opts[Math.floor(sim.rand() * opts.length)];
    const xc = i * PITCH;
    d.wps = [[xc - d.dir * LANE, Z - d.dir * (ROAD_HW + 3)]];
    if (pick === "s") d.wps.push([xc - d.dir * LANE, Z + d.dir * (ROAD_HW + 3)]), (d.next = { axis: "z", dir: d.dir });
    else if (pick === "e") d.wps.push([xc + LANE, Z + LANE], [xc + ROAD_HW + 3, Z + LANE]), (d.next = { axis: "x", dir: 1 });
    else if (pick === "w") d.wps.push([xc - LANE, Z - LANE], [xc - (ROAD_HW + 3), Z - LANE]), (d.next = { axis: "x", dir: -1 });
    else d.wps.push([xc, Z], [xc + d.dir * LANE, Z - d.dir * (ROAD_HW + 3)]), (d.next = { axis: "z", dir: -d.dir });
  }
}

export function updateTraffic(sim, dt) {
  if (!sim.ambientOn) return;
  const h = sim.hero;
  // recycle cars that are far away or no longer driving
  for (const c of sim.traffic) {
    if (!c.drive) continue;
    const d = Math.hypot(c.x - h.x, c.z - h.z);
    if (d > 210) {
      c.drive = null;
      c.mode = "gone";
      c.ver++;
      sim.col.removeProp(c);
    }
  }
  sim.traffic = sim.traffic.filter((c) => c.drive || (c.mode !== "gone" && c.ambient));
  const driving = sim.traffic.filter((c) => c.drive).length;
  if (driving < TRAFFIC_N && sim.rand() < dt * 3) {
    const s = laneStart(sim);
    if (s) {
      const type = sim.rand() < 0.2 ? "taxi" : sim.rand() < 0.2 ? "van" : "car";
      const c = sim.spawnProp(type, s.x, s.z, { rot: s.axis === "x" ? (s.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : s.dir > 0 ? 0 : Math.PI, color: (sim.rand() * 1e6) | 0, pooled: true });
      if (c) {
        c.ambient = true;
        c.drive = { axis: s.axis, dir: s.dir, speed: 9 + sim.rand() * 4, v: 9, wps: null, wi: 0, honk: 0 };
        sim.traffic.push(c);
      }
    }
  }
  for (const c of sim.traffic) {
    const d = c.drive;
    if (!d) continue;
    if (c.mode !== "static" || c.state > 0) {
      c.drive = null;
      continue;
    }
    if (!d.wps) {
      planTurn(sim, c);
      d.wi = 0;
    }
    const wp = d.wps[d.wi];
    const dx = wp[0] - c.x;
    const dz = wp[1] - c.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2.5) {
      d.wi++;
      if (d.wi >= d.wps.length) {
        d.axis = d.next.axis;
        d.dir = d.next.dir;
        d.wps = null;
      }
      continue;
    }
    // brake for the hero / other cars ahead
    const fx = Math.sin(c.rot);
    const fz = Math.cos(c.rot);
    let want = d.speed;
    const ahead = (x, z, r) => {
      const ax = x - c.x;
      const az = z - c.z;
      const along = ax * fx + az * fz;
      const side = Math.abs(ax * fz - az * fx);
      return along > 0 && along < r && side < 2.6;
    };
    if (ahead(h.x, h.z, 14)) {
      want = 0;
      d.honk -= dt;
      if (d.honk <= 0 && Math.hypot(h.x - c.x, h.z - c.z) < 12) {
        d.honk = 4 + sim.rand() * 3;
        sim.events.push({ type: "honk", x: c.x, z: c.z });
      }
    }
    for (const o of sim.traffic) if (o !== c && o.mode !== "gone" && ahead(o.x, o.z, 9)) want = 0;
    for (const e of sim.enemiesNear(c.x, c.z, 12)) if (!e.dead && ahead(e.x, e.z, 10)) want = 0;
    d.v += (want - d.v) * Math.min(1, dt * (want < d.v ? 4 : 1.2));
    const tgt = Math.atan2(dx, dz);
    c.rot = dampA(c.rot, tgt, 5, dt);
    c.x += Math.sin(c.rot) * d.v * dt;
    c.z += Math.cos(c.rot) * d.v * dt;
    propBox(c);
    sim.col.moveProp(c);
    c.ver++;
  }
}

/* ================================================================ civilians */
export function makeCivilian(sim, x, z, o = {}) {
  return {
    id: sim.nextId++,
    x,
    y: sim.col.groundAt(x, z, 2, 1.2, 0.3, false).y,
    z,
    vx: 0,
    vz: 0,
    heading: sim.rand() * Math.PI * 2,
    hp: o.hp || 40,
    maxHp: o.hp || 40,
    dead: false,
    deadT: 0,
    state: o.state || "walk",
    stT: 0,
    goal: null,
    critical: !!o.critical,
    group: o.group ?? null,
    look: (sim.rand() * 1e6) | 0,
    panic: 0,
    flee: null,
    anim: { mode: "walk", t: sim.rand() * 5 },
    safe: false,
    walkAxis: o.walkAxis || null,
  };
}
function sidewalkSpot(sim) {
  const h = sim.hero;
  for (let k = 0; k < 16; k++) {
    const axis = sim.rand() < 0.5 ? "x" : "z";
    const side = sim.rand() < 0.5 ? -1 : 1;
    if (axis === "x") {
      const j = clamp(Math.round(h.z / PITCH) + Math.floor((sim.rand() - 0.5) * 3), 0, MAX_J);
      const x = h.x + (sim.rand() - 0.5) * 160;
      const z = j * PITCH + side * (ROAD_HW + 2);
      const d = Math.hypot(x - h.x, z - h.z);
      if (d < 35 || d > 100 || Math.abs(x - Math.round(x / PITCH) * PITCH) < 14) continue;
      return { x, z, axis };
    }
    const i = clamp(Math.round(h.x / PITCH) + Math.floor((sim.rand() - 0.5) * 3), 0, N);
    const z = h.z + (sim.rand() - 0.5) * 160;
    const x = i * PITCH + side * (ROAD_HW + 2);
    const d = Math.hypot(x - h.x, z - h.z);
    if (d < 35 || d > 100 || z > MAX_J * PITCH || Math.abs(z - Math.round(z / PITCH) * PITCH) < 14) continue;
    return { x, z, axis };
  }
  return null;
}

export function updateCivilians(sim, dt) {
  const h = sim.hero;
  if (sim.ambientOn) {
    const amb = sim.civilians.filter((c) => !c.critical && !c.dead).length;
    if (amb < CIV_N && sim.rand() < dt * 2) {
      const s = sidewalkSpot(sim);
      if (s && !sim.col.groundAt(s.x, s.z, 1, 0.3, 0.3).on) {
        const c = makeCivilian(sim, s.x, s.z, { walkAxis: s.axis });
        c.heading = s.axis === "x" ? (sim.rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : sim.rand() < 0.5 ? 0 : Math.PI;
        sim.civilians.push(c);
      }
    }
  }
  const threatR = 13;
  for (const c of sim.civilians) {
    c.anim.t += dt;
    if (c.dead) {
      c.deadT += dt;
      c.anim.mode = "dead";
      continue;
    }
    c.stT += dt;
    // panic triggers: the hero rampaging nearby, combat noise
    const dH = Math.hypot(h.x - c.x, h.z - c.z);
    if (!c.critical && (dH < threatR * (h.sprinting || h.act ? 1.4 : 0.6) || sim.noise && Math.hypot(sim.noise.x - c.x, sim.noise.z - c.z) < sim.noise.r)) {
      if (c.state !== "flee") {
        c.state = "flee";
        c.stT = 0;
        const sx = sim.noise && dH > threatR ? sim.noise.x : h.x;
        const sz = sim.noise && dH > threatR ? sim.noise.z : h.z;
        const a = Math.atan2(c.x - sx, c.z - sz) + (sim.rand() - 0.5) * 0.8;
        c.flee = [Math.sin(a), Math.cos(a)];
        if (sim.rand() < 0.3) sim.events.push({ type: "scream", x: c.x, z: c.z });
      }
    }
    let speed = 0;
    let mx = 0;
    let mz = 0;
    switch (c.state) {
      case "walk": {
        mx = Math.sin(c.heading);
        mz = Math.cos(c.heading);
        speed = 1.4;
        if (c.stT > 12 + (c.look % 7)) {
          c.heading += Math.PI;
          c.stT = 0;
        }
        break;
      }
      case "flee":
        mx = c.flee[0];
        mz = c.flee[1];
        speed = 5.2;
        if (c.stT > 6) {
          c.state = c.critical ? "cower" : "walk";
          c.stT = 0;
        }
        break;
      case "run": // mission civilians running to the safe zone
        if (c.goal) {
          const dx = c.goal.x - c.x;
          const dz = c.goal.z - c.z;
          const d = Math.hypot(dx, dz);
          if (d < 4) {
            c.state = "safe";
            c.safe = true;
            sim.events.push({ type: "civSafe", civ: c });
          } else {
            const w = civPath(sim, c, dt);
            mx = w ? w[0] : dx / d;
            mz = w ? w[1] : dz / d;
            speed = 4.6;
          }
        }
        break;
      case "cower":
      case "trapped":
      case "safe":
      default:
        break;
    }
    const tv = speed;
    c.vx += (mx * tv - c.vx) * Math.min(1, dt * 6);
    c.vz += (mz * tv - c.vz) * Math.min(1, dt * 6);
    c.x += c.vx * dt;
    c.z += c.vz * dt;
    const hit = sim.col.pushOut(c, 0.35, 1.8, 0.5, true);
    if (hit && c.state === "walk") {
      c.heading += Math.PI * (0.5 + sim.rand());
    }
    if (hit && c.state === "flee") {
      // slide along the wall
      const a = Math.atan2(c.flee[0], c.flee[1]) + (sim.rand() < 0.5 ? 1.2 : -1.2);
      c.flee = [Math.sin(a), Math.cos(a)];
    }
    const g = sim.col.groundAt(c.x, c.z, c.y, 0.8, 0.3);
    c.y = g.y;
    const sp = Math.hypot(c.vx, c.vz);
    if (sp > 0.2) c.heading = dampA(c.heading, Math.atan2(c.vx, c.vz), 8, dt);
    c.anim.mode = c.state === "cower" || c.state === "trapped" ? "cower" : c.state === "safe" ? "cheer" : sp > 3 ? "run" : sp > 0.3 ? "walk" : "idle";
  }
  // forget ambient walkers that wandered far away
  sim.civilians = sim.civilians.filter((c) => c.critical || (Math.hypot(c.x - h.x, c.z - h.z) < 160 && (!c.dead || c.deadT < 8)));
}

function civPath(sim, c, dt) {
  c.repathT = (c.repathT || 0) - dt;
  const nav = sim.nav;
  if (!c.path || c.repathT <= 0) {
    c.repathT = 2.5;
    c.path = nav.findPath(nav.walk, c.x, c.z, c.goal.x, c.goal.z, 2500);
    c.pathI = 0;
  }
  if (!c.path) return null;
  let wp = c.path[c.pathI];
  while (wp && Math.hypot(wp[0] - c.x, wp[1] - c.z) < 1.5 && c.pathI < c.path.length - 1) wp = c.path[++c.pathI];
  if (!wp) return null;
  const dx = wp[0] - c.x;
  const dz = wp[1] - c.z;
  const d = Math.hypot(dx, dz) || 1;
  return [dx / d, dz / d];
}
