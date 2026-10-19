/**
 * Hulk: Open World 3D — canvas HUD layers (imperative, redrawn per frame).
 *
 *  drawOverlay  world-anchored markers projected to the screen: objective
 *               diamonds with distance (clamped to the screen edge with an
 *               arrow when off-screen), enemy health bars, civilian icons,
 *               boss weak-point hint, damage-direction arcs, crosshair,
 *               super-leap charge ring
 *  cityPlan     the city map pre-rendered once (roads, blocks, buildings,
 *               river, districts)
 *  drawMinimap  north-up local map around the hero with markers
 *  drawCityMap  full-screen map: districts, hero, objectives, boss sites,
 *               activities, landmarks
 */
import { PITCH, N, ROAD_HW, RIVER, SIZE, DISTRICTS, blockDistrict, BRIDGES, HIGHWAY } from "../engine/city.js";

const COL = { obj: "#ffd23f", roof: "#3fe0ff", zone: "#ff8a2a", area: "#ffd23f", danger: "#ff3a2a", safe: "#5aff7a", enemy: "#ff4a3a", civ: "#7fd6ff", target: "#ff9a2a", pad: "#ffd23f", line: "#ffffff", ring: "#ffd23f" };

export function drawOverlay(g, sim, world, o) {
  const { w, h, dpr, hits, settings } = o;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const H = sim.hero;
  const info = sim.objective();
  // ---------------------------------------------------------- objective markers
  if (info && info.markers) {
    for (const m of info.markers) {
      if (m.kind === "line") continue;
      const ref = m.ref;
      if (ref && (ref.dead || ref.state === 2 || ref.mode === "gone")) continue;
      const x = ref ? ref.x : m.x;
      const z = ref ? ref.z : m.z;
      const y = m.kind === "enemy" ? (ref ? ref.y + (ref.def ? ref.def.h : 2) + 0.8 : m.y) : m.kind === "civ" ? (ref ? ref.y + 2.4 : m.y) : m.kind === "target" ? m.y : (m.y || sim.city.terrainH(x, z)) + 3;
      const d = Math.hypot(x - H.x, z - H.z);
      if (m.kind === "enemy" && d > 140) continue;
      if (m.kind === "roof" && m.active === false) continue;
      const p = world.project(x, y, z);
      const col = COL[m.kind] || COL.obj;
      let sx;
      let sy;
      let off = false;
      if (p && p.x > 20 && p.x < w - 20 && p.y > 20 && p.y < h - 20) {
        sx = p.x;
        sy = p.y;
      } else {
        if (m.kind === "enemy" || m.kind === "civ") continue;
        // clamp to the screen edge, pointing toward the marker
        const cy = world.camera;
        const ang = Math.atan2(x - cy.position.x, z - cy.position.z);
        const camYaw = Math.atan2(-cy.matrixWorld.elements[8], -cy.matrixWorld.elements[10]);
        const rel = ang - camYaw;
        const r = Math.min(w, h) * 0.42;
        sx = w / 2 - Math.sin(rel) * r;
        sy = h / 2 - Math.cos(rel) * r;
        off = true;
      }
      if (m.kind === "enemy") {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(sx, sy + 7);
        g.lineTo(sx - 6, sy - 3);
        g.lineTo(sx + 6, sy - 3);
        g.closePath();
        g.fill();
        continue;
      }
      if (m.kind === "civ") {
        g.fillStyle = col;
        g.beginPath();
        g.arc(sx, sy, 5, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(0,0,0,0.6)";
        g.stroke();
        continue;
      }
      // diamond + label + distance
      g.save();
      g.translate(sx, sy);
      g.rotate(Math.PI / 4);
      g.fillStyle = col;
      g.globalAlpha = 0.9;
      g.fillRect(-8, -8, 16, 16);
      g.globalAlpha = 1;
      g.strokeStyle = "rgba(0,0,0,0.7)";
      g.lineWidth = 2;
      g.strokeRect(-8, -8, 16, 16);
      g.restore();
      g.font = "700 12px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillStyle = "#fff";
      g.strokeStyle = "rgba(0,0,0,0.75)";
      g.lineWidth = 3;
      const label = `${m.label ? m.label + " · " : ""}${Math.round(d)} m`;
      g.strokeText(label, sx, sy + 24);
      g.fillText(label, sx, sy + 24);
      if (off) {
        const a = Math.atan2(sy - h / 2, sx - w / 2);
        g.save();
        g.translate(sx + Math.cos(a) * 16, sy + Math.sin(a) * 16);
        g.rotate(a);
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(8, 0);
        g.lineTo(-4, -6);
        g.lineTo(-4, 6);
        g.closePath();
        g.fill();
        g.restore();
      }
    }
  }
  // ---------------------------------------------------------- enemy health bars
  for (const e of sim.enemies) {
    if (e.dead || e.sleep) continue;
    const d = Math.hypot(e.x - H.x, e.z - H.z);
    if (d > 70 || (e.hp >= e.maxHp && e.state === "patrol")) continue;
    const p = world.project(e.x, e.y + e.def.h + 0.5, e.z);
    if (!p) continue;
    const bw = e.def.hp >= 600 ? 64 : e.def.hp >= 150 ? 46 : 34;
    const f = Math.max(0, e.hp / e.maxHp);
    g.fillStyle = "rgba(0,0,0,0.6)";
    g.fillRect(p.x - bw / 2 - 1, p.y - 1, bw + 2, 6);
    g.fillStyle = f > 0.5 ? "#ff6a4a" : "#ff2a2a";
    g.fillRect(p.x - bw / 2, p.y, bw * f, 4);
    // windup telegraph: a flashing warning above the bar
    if (e.windup > 0 || e.melee > 0) {
      g.fillStyle = e.def.fire === "rocket" || e.def.fire === "shell" ? "#ffcc33" : "#ff3a2a";
      g.font = "900 14px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText("!", p.x, p.y - 6);
    }
  }
  // boss weak point
  for (const b of sim.bosses) {
    if (b.dead || !(b.vuln > 0 || b.stun > 0)) continue;
    const c = b.parts[1];
    const p = world.project(c.x, c.y, c.z);
    if (!p) continue;
    const t = performance.now() / 1000;
    g.strokeStyle = `rgba(255,220,60,${0.6 + Math.sin(t * 12) * 0.3})`;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(p.x, p.y, 18 + Math.sin(t * 8) * 4, 0, Math.PI * 2);
    g.stroke();
    g.font = "800 12px system-ui, sans-serif";
    g.fillStyle = "#ffe066";
    g.textAlign = "center";
    g.fillText("WEAK POINT", p.x, p.y - 26);
  }
  // ---------------------------------------------------------- damage direction
  const camYaw = Math.atan2(-world.camera.matrixWorld.elements[8], -world.camera.matrixWorld.elements[10]);
  const now = sim.t;
  for (const hit of hits) {
    const age = now - hit.t;
    if (age > 1.2 || hit.ang == null) continue;
    const rel = hit.ang - camYaw;
    const a = 1 - age / 1.2;
    g.strokeStyle = `rgba(255,40,30,${0.75 * a})`;
    g.lineWidth = 7;
    const r = Math.min(w, h) * 0.2;
    g.beginPath();
    g.arc(w / 2, h / 2, r, -Math.PI / 2 - rel - 0.32, -Math.PI / 2 - rel + 0.32);
    g.stroke();
  }
  // ---------------------------------------------------------- crosshair + charge ring
  if (settings.crosshair !== false) {
    const cx = w / 2;
    const cy = h / 2;
    g.strokeStyle = H.carry ? "rgba(255,210,63,0.95)" : "rgba(255,255,255,0.75)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, H.carry ? 9 : 4, 0, Math.PI * 2);
    g.stroke();
    if (H.charging && H.anim.charge > 0) {
      const k = H.anim.charge;
      g.strokeStyle = k >= 1 ? "#7dff5a" : "#ffd23f";
      g.lineWidth = 5;
      g.beginPath();
      g.arc(cx, cy, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      g.stroke();
      g.font = "800 13px system-ui, sans-serif";
      g.fillStyle = "#fff";
      g.textAlign = "center";
      g.fillText(k >= 1 ? "MAX LEAP" : `LEAP ${Math.round(k * 100)}%`, cx, cy + 54);
    }
    if (H.heavyHeld && H.anim.heavy > 0) {
      const k = H.anim.heavy;
      g.strokeStyle = k >= 1 ? (H.cd.ragePunch > 0 ? "#888" : "#ff5a2a") : "#ffb03a";
      g.lineWidth = 5;
      g.beginPath();
      g.arc(cx, cy, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      g.stroke();
      if (k >= 1) {
        g.font = "800 13px system-ui, sans-serif";
        g.fillStyle = "#fff";
        g.textAlign = "center";
        g.fillText(H.cd.ragePunch > 0 ? "RAGE PUNCH COOLING" : "RAGE PUNCH READY", cx, cy + 50);
      }
    }
  }
}

/* ================================================================ maps */
let PLAN = null;
const PLAN_PX = 640;
const M0 = -40;
const M1 = SIZE + 40;
const toPlan = (v) => ((v - M0) / (M1 - M0)) * PLAN_PX;
export function cityPlan(city) {
  if (PLAN) return PLAN;
  const c = document.createElement("canvas");
  c.width = c.height = PLAN_PX;
  const g = c.getContext("2d");
  g.fillStyle = "#3d5230";
  g.fillRect(0, 0, PLAN_PX, PLAN_PX);
  for (let bz = 0; bz < N; bz++) {
    for (let bx = 0; bx < N; bx++) {
      if (bz === 6) continue;
      const d = blockDistrict(bx, bz);
      const col = { downtown: "#4a5a6a", residential: "#4b6a3a", industrial: "#5e574a", military: "#5a5a3a", outskirts: "#55663a" }[d];
      g.fillStyle = col;
      g.fillRect(toPlan(bx * PITCH + ROAD_HW), toPlan(bz * PITCH + ROAD_HW), ((PITCH - 2 * ROAD_HW) / (M1 - M0)) * PLAN_PX, ((PITCH - 2 * ROAD_HW) / (M1 - M0)) * PLAN_PX);
    }
  }
  // river
  g.fillStyle = "#2d5d78";
  g.fillRect(0, toPlan(RIVER.z0 + 12), PLAN_PX, toPlan(RIVER.z1 - 12) - toPlan(RIVER.z0 + 12));
  // roads
  g.fillStyle = "#26282b";
  const rw = Math.max(2, ((2 * ROAD_HW) / (M1 - M0)) * PLAN_PX);
  for (let i = 0; i <= N; i++) {
    const p = toPlan(i * PITCH) - rw / 2;
    g.fillRect(p, toPlan(-ROAD_HW), rw, toPlan(RIVER.z0) - toPlan(-ROAD_HW));
    g.fillRect(p, toPlan(RIVER.z1), rw, toPlan(SIZE + ROAD_HW) - toPlan(RIVER.z1));
    if (BRIDGES.includes(i * PITCH)) g.fillRect(p, toPlan(RIVER.z0), rw, toPlan(RIVER.z1) - toPlan(RIVER.z0));
    g.fillRect(toPlan(-ROAD_HW), p, toPlan(SIZE + ROAD_HW) - toPlan(-ROAD_HW), rw);
  }
  g.fillStyle = "#555a60";
  g.fillRect(toPlan(HIGHWAY.x0 - HIGHWAY.ramp), toPlan(HIGHWAY.z - HIGHWAY.hw), toPlan(HIGHWAY.x1 + HIGHWAY.ramp) - toPlan(HIGHWAY.x0 - HIGHWAY.ramp), toPlan(HIGHWAY.z + HIGHWAY.hw) - toPlan(HIGHWAY.z - HIGHWAY.hw));
  // buildings
  for (const b of city.buildings) {
    const top = b.tiers[b.tiers.length - 1];
    const hgt = top.y1;
    const v = Math.min(1, hgt / 90);
    g.fillStyle = `rgb(${150 + v * 70},${150 + v * 70},${158 + v * 70})`;
    g.fillRect(toPlan(b.x0), toPlan(b.z0), Math.max(1, toPlan(b.x1) - toPlan(b.x0)), Math.max(1, toPlan(b.z1) - toPlan(b.z0)));
  }
  for (const bx of city.boxes) {
    if (bx.kind !== "container" && bx.kind !== "milwall" && bx.kind !== "silo") continue;
    g.fillStyle = bx.kind === "milwall" ? "#8a8a70" : "#8a6a4a";
    g.fillRect(toPlan(bx.x0), toPlan(bx.z0), Math.max(1, toPlan(bx.x1) - toPlan(bx.x0)), Math.max(1, toPlan(bx.z1) - toPlan(bx.z0)));
  }
  PLAN = c;
  return c;
}

export function drawMinimap(g, sim, o) {
  const { size, dpr, camYaw, activities, discovered } = o;
  const plan = cityPlan(sim.city);
  const H = sim.hero;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);
  g.save();
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = "#24331e";
  g.fillRect(0, 0, size, size);
  const range = 150; // metres across the radius
  const k = size / 2 / range;
  const pk = PLAN_PX / (M1 - M0);
  const sx = toPlan(H.x) - range * pk;
  const sz = toPlan(H.z) - range * pk;
  g.drawImage(plan, sx, sz, range * 2 * pk, range * 2 * pk, 0, 0, size, size);
  const P = (x, z) => [size / 2 + (x - H.x) * k, size / 2 + (z - H.z) * k];
  const dot = (x, z, r, col, ring = false) => {
    const [px, py] = P(x, z);
    g.fillStyle = col;
    g.beginPath();
    g.arc(px, py, r, 0, Math.PI * 2);
    g.fill();
    if (ring) {
      g.strokeStyle = "rgba(0,0,0,0.7)";
      g.lineWidth = 1.5;
      g.stroke();
    }
  };
  for (const a of activities || []) {
    const [px, py] = P(a.x, a.z);
    g.fillStyle = "#3fa9ff";
    g.fillRect(px - 4, py - 4, 8, 8);
  }
  for (const l of sim.city.landmarks) dot(l.x, l.z, 3, discovered && discovered.has(l.id) ? "#c9b37a" : "#ffffff");
  for (const c of sim.civilians) if (c.critical && !c.dead) dot(c.x, c.z, 2.5, "#7fd6ff");
  for (const e of sim.enemies) {
    if (e.dead || e.sleep) continue;
    if (e.state === "patrol" && Math.hypot(e.x - H.x, e.z - H.z) > 60) continue;
    dot(e.x, e.z, e.def.hp >= 600 ? 4 : 2.6, e.def.vehicle ? "#ff9a2a" : "#ff3a2a");
  }
  for (const b of sim.bosses) if (!b.dead) dot(b.x, b.z, 7, "#ff2a5a", true);
  const info = sim.objective();
  if (info && info.markers) {
    for (const m of info.markers) {
      if (m.kind === "enemy" || m.kind === "civ" || m.kind === "line") continue;
      if (m.kind === "roof" && m.active === false) continue;
      const x = m.ref ? m.ref.x : m.x;
      const z = m.ref ? m.ref.z : m.z;
      let [px, py] = P(x, z);
      const dx = px - size / 2;
      const dy = py - size / 2;
      const dl = Math.hypot(dx, dy);
      const maxR = size / 2 - 8;
      if (dl > maxR) {
        px = size / 2 + (dx / dl) * maxR;
        py = size / 2 + (dy / dl) * maxR;
      }
      g.save();
      g.translate(px, py);
      g.rotate(Math.PI / 4);
      g.fillStyle = COL[m.kind] || COL.obj;
      g.fillRect(-5, -5, 10, 10);
      g.strokeStyle = "#000";
      g.lineWidth = 1.5;
      g.strokeRect(-5, -5, 10, 10);
      g.restore();
    }
  }
  // camera view cone + hero arrow
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.beginPath();
  g.moveTo(size / 2, size / 2);
  const fwd = Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
  for (const a of [fwd - 0.6, fwd + 0.6]) g.lineTo(size / 2 + Math.sin(a) * size * 0.4, size / 2 + Math.cos(a) * size * 0.4);
  g.closePath();
  g.fill();
  g.save();
  g.translate(size / 2, size / 2);
  g.rotate(-H.heading + Math.PI);
  g.fillStyle = "#7dff5a";
  g.strokeStyle = "#0b2a08";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, -8);
  g.lineTo(6, 6);
  g.lineTo(0, 3);
  g.lineTo(-6, 6);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
  g.restore();
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#fff";
  g.font = "800 11px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText("N", size / 2, 13);
}

/** full city map overlay */
export function drawCityMap(g, sim, o) {
  const { w, h, dpr, activities, discovered, bossSites, missionSite } = o;
  const plan = cityPlan(sim.city);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const S = Math.min(w, h) * 0.86;
  const ox = (w - S) / 2;
  const oy = (h - S) / 2 + 10;
  g.fillStyle = "rgba(8,12,10,0.86)";
  g.fillRect(0, 0, w, h);
  g.drawImage(plan, ox, oy, S, S);
  g.strokeStyle = "rgba(255,255,255,0.3)";
  g.strokeRect(ox, oy, S, S);
  const P = (x, z) => [ox + ((x - M0) / (M1 - M0)) * S, oy + ((z - M0) / (M1 - M0)) * S];
  // district labels
  const labels = [["downtown", 5.0, 2.2], ["residential", 1.3, 1.2], ["industrial", 8.5, 2.6], ["military", 8, 8.4], ["outskirts", 2.6, 8.4]];
  g.textAlign = "center";
  for (const [d, bx, bz] of labels) {
    const [px, py] = P(bx * PITCH, bz * PITCH);
    g.font = `800 ${Math.max(11, S * 0.026)}px system-ui, sans-serif`;
    g.fillStyle = DISTRICTS[d].color;
    g.strokeStyle = "rgba(0,0,0,0.8)";
    g.lineWidth = 4;
    g.strokeText(DISTRICTS[d].name.toUpperCase(), px, py);
    g.fillText(DISTRICTS[d].name.toUpperCase(), px, py);
  }
  g.font = `600 ${Math.max(10, S * 0.018)}px system-ui, sans-serif`;
  for (const l of sim.city.landmarks) {
    const [px, py] = P(l.x, l.z);
    const seen = discovered && discovered.has(l.id);
    g.fillStyle = seen ? "#e8d9a8" : "rgba(255,255,255,0.6)";
    g.beginPath();
    g.arc(px, py, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.fillText(seen ? l.name : "???", px, py - 8);
  }
  for (const a of activities || []) {
    const [px, py] = P(a.x, a.z);
    g.fillStyle = "#3fa9ff";
    g.fillRect(px - 6, py - 6, 12, 12);
    g.strokeStyle = "#062033";
    g.strokeRect(px - 6, py - 6, 12, 12);
    g.fillStyle = "#bfe2ff";
    g.fillText(a.name, px, py + 18);
  }
  for (const b of bossSites || []) {
    const [px, py] = P(b.x, b.z);
    g.fillStyle = b.done ? "#777" : "#ff2a5a";
    g.beginPath();
    g.moveTo(px, py - 9);
    g.lineTo(px + 8, py + 6);
    g.lineTo(px - 8, py + 6);
    g.closePath();
    g.fill();
    g.fillStyle = "#ffd0da";
    g.fillText(b.name, px, py + 20);
  }
  if (missionSite) {
    const [px, py] = P(missionSite.x, missionSite.z);
    g.fillStyle = "#ffd23f";
    g.beginPath();
    g.arc(px, py, 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff4c2";
    g.fillText(missionSite.label, px, py + 20);
  }
  const info = sim.objective();
  if (info && info.markers) {
    for (const m of info.markers) {
      if (m.kind === "enemy" || m.kind === "civ" || m.kind === "line") continue;
      const [px, py] = P(m.ref ? m.ref.x : m.x, m.ref ? m.ref.z : m.z);
      g.save();
      g.translate(px, py);
      g.rotate(Math.PI / 4);
      g.fillStyle = COL[m.kind] || COL.obj;
      g.fillRect(-6, -6, 12, 12);
      g.restore();
    }
  }
  const H = sim.hero;
  const [hx, hy] = P(H.x, H.z);
  g.save();
  g.translate(hx, hy);
  g.rotate(-H.heading + Math.PI);
  g.fillStyle = "#7dff5a";
  g.strokeStyle = "#062006";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -11);
  g.lineTo(8, 8);
  g.lineTo(0, 4);
  g.lineTo(-8, 8);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
  g.font = `800 ${Math.max(14, S * 0.03)}px system-ui, sans-serif`;
  g.fillStyle = "#fff";
  g.fillText("CITY MAP", w / 2, oy - 14);
  g.font = "600 12px system-ui, sans-serif";
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.fillText("You (green) · Objectives (diamonds) · Bosses (red) · Activities (blue) · Landmarks (dots) — press M to close", w / 2, oy + S + 22);
}
