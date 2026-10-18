/**
 * Vice Streets 3D — map drawing (2-D canvas).
 *
 * The static map (water, sand, district lots, buildings, roads, labels) is
 * rendered once into an offscreen image and re-used by:
 *   drawMinimap   rotating radar in the HUD (heading-up), GPS route, blips
 *   drawMap       the full city map (north-up) with legend-coloured blips,
 *                 the GPS route and a click-to-set waypoint
 * Blip positions are the same world coordinates the sim uses, so markers on
 * the maps match the 3-D world exactly.
 */
import { DISTRICTS, COLS, ROWS, ROAD_HALF, BOUNDS, WATER, ICOLS, ISLAND } from "../engine/city.js";

export const MAP = { x0: BOUNDS.x0 - 10, x1: ISLAND.x1 + 30, z0: BOUNDS.z0 - 10, z1: WATER.south + 30, ppm: 1.6 };
const W = Math.round((MAP.x1 - MAP.x0) * MAP.ppm);
const H = Math.round((MAP.z1 - MAP.z0) * MAP.ppm);
const mx = (x) => (x - MAP.x0) * MAP.ppm;
const mz = (z) => (z - MAP.z0) * MAP.ppm;

const IMGS = {};
/** the static map; `labels` adds district names (the full map — the rotating radar has none) */
export function mapImage(city, open, labels = true) {
  const key = open.join(",") + (labels ? "+L" : "");
  const slot = labels ? "L" : "N";
  if (IMGS[slot] && IMGS[slot].key === key) return IMGS[slot].c;
  const c = IMGS[slot]?.c || document.createElement("canvas");
  IMGS[slot] = { c, key };
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#1e6f93";
  g.fillRect(0, 0, W, H);
  // land
  g.fillStyle = "#3f6b3a";
  g.fillRect(mx(BOUNDS.x0), mz(BOUNDS.z0), mx(WATER.east) - mx(BOUNDS.x0), mz(WATER.south) - mz(BOUNDS.z0));
  // sand
  g.fillStyle = "#d9c48f";
  g.fillRect(mx(286), mz(-191), mx(WATER.east) - mx(286), mz(WATER.south) - mz(-191));
  // Coral Key: sandy shore and grass
  g.fillStyle = "#d9c48f";
  g.fillRect(mx(ISLAND.x0 - 6), mz(ISLAND.z0 - 6), (ISLAND.x1 - ISLAND.x0 + 12) * MAP.ppm, (ISLAND.z1 - ISLAND.z0 + 12) * MAP.ppm);
  g.fillStyle = "#3f6b3a";
  g.fillRect(mx(ICOLS[0] - 10), mz(ROWS[0] - 10), (ICOLS[3] - ICOLS[0] + 20) * MAP.ppm, (ROWS[4] - ROWS[0] + 20) * MAP.ppm);
  // district lots
  const LOT = { downtown: "#8b8577", haven: "#57824a", beach: "#c9b78f", docks: "#6d7072", hills: "#4f7d45", key: "#6f9f5c" };
  for (let i = 0; i < ICOLS.length - 1; i++) {
    for (let j = 0; j < 4; j++) {
      g.fillStyle = LOT.key;
      g.fillRect(mx(ICOLS[i] + ROAD_HALF), mz(ROWS[j] + ROAD_HALF), (ICOLS[i + 1] - ICOLS[i] - ROAD_HALF * 2) * MAP.ppm, (ROWS[j + 1] - ROWS[j] - ROAD_HALF * 2) * MAP.ppm);
    }
  }
  for (let i = 0; i < COLS.length - 1; i++) {
    for (let j = 0; j < ROWS.length - 1; j++) {
      const cx = (COLS[i] + COLS[i + 1]) / 2;
      const cz = (ROWS[j] + ROWS[j + 1]) / 2;
      g.fillStyle = LOT[city.districtAt(cx, cz)];
      g.fillRect(mx(COLS[i] + ROAD_HALF), mz(ROWS[j] + ROAD_HALF), (COLS[i + 1] - COLS[i] - ROAD_HALF * 2) * MAP.ppm, (ROWS[j + 1] - ROWS[j] - ROAD_HALF * 2) * MAP.ppm);
    }
  }
  for (const zn of city.zones) {
    if (zn.kind === "park" || zn.kind === "plaza") {
      g.fillStyle = zn.kind === "park" ? "#5f9a4f" : "#b9ad93";
      g.fillRect(mx(zn.x0), mz(zn.z0), (zn.x1 - zn.x0) * MAP.ppm, (zn.z1 - zn.z0) * MAP.ppm);
    }
  }
  // buildings
  for (const b of city.buildings) {
    g.fillStyle = b.style === "warehouse" ? "#9aa1a7" : b.style === "house" || b.style === "mansion" ? "#d9cbb7" : "#c8ccd2";
    g.fillRect(mx(b.x0), mz(b.z0), (b.x1 - b.x0) * MAP.ppm, (b.z1 - b.z0) * MAP.ppm);
  }
  // roads
  g.lineCap = "round";
  for (const pass of [0, 1]) {
    for (const e of city.edges) {
      const A = city.nodes[e.a];
      const B = city.nodes[e.b];
      g.strokeStyle = pass ? "#e9e6df" : "#3a3c40";
      g.lineWidth = (e.half * 2 + (pass ? -3 : 1.5)) * MAP.ppm;
      g.beginPath();
      g.moveTo(mx(A.x), mz(A.z));
      g.lineTo(mx(B.x), mz(B.z));
      g.stroke();
    }
  }
  // locked districts: hatched
  const lockRect = { docks: [BOUNDS.x0, 100, 172, WATER.south], hills: [BOUNDS.x0, BOUNDS.z0, 300, -191] };
  for (const d of ["docks", "hills"]) {
    if (open.includes(d)) continue;
    const [x0, z0, x1, z1] = lockRect[d];
    g.save();
    g.beginPath();
    g.rect(mx(x0), mz(z0), mx(x1) - mx(x0), mz(z1) - mz(z0));
    g.clip();
    g.fillStyle = "rgba(10,12,20,0.45)";
    g.fillRect(mx(x0), mz(z0), mx(x1) - mx(x0), mz(z1) - mz(z0));
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.lineWidth = 6;
    for (let k = -H; k < W + H; k += 26) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + H, H);
      g.stroke();
    }
    g.restore();
  }
  if (!labels) return c;
  // district labels
  const LABEL = { beach: [310, -40], downtown: [45, -100], haven: [-225, -120], docks: [-100, 200], hills: [-60, -320], key: [565, -205] };
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const [id, [x, z]] of Object.entries(LABEL)) {
    g.font = "bold 22px Inter, Arial";
    g.lineWidth = 5;
    g.strokeStyle = "rgba(0,0,0,0.55)";
    const name = DISTRICTS[id].name.toUpperCase() + (open.includes(id) ? "" : " · LOCKED");
    g.strokeText(name, mx(x), mz(z));
    g.fillStyle = DISTRICTS[id].color;
    g.fillText(name, mx(x), mz(z));
  }
  return c;
}

/* ------------------------------------------------------------------ blips */
const ICON = { garage: "🔧", dealer: "🚗", clothes: "👕", cafe: "☕", hospital: "✚", police: "★", taxi: "🚕", delivery: "📦", race: "🏁", parking: "P", trial: "⏱", mission: "M", view: "👁" };
export function blips(sim) {
  const out = [];
  const P = sim.city.places;
  const svc = [
    ["garage", "garage", "#ffb347"],
    ["dealer", "dealer", "#7dd3ff"],
    ["clothes", "clothes", "#ff8fd8"],
    ["cafe", "cafe", "#ffd166"],
    ["hospital", "hospital", "#ff5a5a"],
    ["police", "police", "#6ea8ff"],
  ];
  for (const [id, icon, color] of svc) if (P[id]) out.push({ x: P[id].x, z: P[id].z, icon: ICON[icon], color, label: P[id].name, kind: "service" });
  if (sim.districtOpen("hills")) out.push({ x: P.hillGarage.x, z: P.hillGarage.z, icon: ICON.garage, color: "#ffb347", label: "Hillside Garage", kind: "service" });
  for (const o of sim.offers) out.push({ x: o.x, z: o.z, icon: o.kind === "mission" ? "M" : ICON[o.icon] || "A", color: o.kind === "mission" ? "#ff5fa8" : "#5fb8ff", label: o.label.replace(/^Start /, ""), kind: o.kind });
  return out;
}

function drawBlip(g, x, y, b, size = 18) {
  g.beginPath();
  g.arc(x, y, size / 2, 0, Math.PI * 2);
  g.fillStyle = "rgba(10,12,20,0.85)";
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = b.color;
  g.stroke();
  g.fillStyle = b.color;
  g.font = `bold ${Math.round(size * 0.62)}px Inter, Arial`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(b.icon, x, y + 1);
}

/** heading-up radar */
export function drawMinimap(g, w, h, sim, yaw, route, extra = {}) {
  const img = mapImage(sim.city, sim.prog.districts, false);
  const F = sim.focus();
  const scale = (extra.zoom || 1.15) / MAP.ppm; // screen px per map px
  g.save();
  g.clearRect(0, 0, w, h);
  g.beginPath();
  g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = "#1e6f93";
  g.fillRect(0, 0, w, h);
  g.translate(w / 2, h / 2);
  // camera forward (-sin yaw, -cos yaw) points up
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rot = -Math.PI / 2 - Math.atan2(fz, fx);
  g.rotate(rot);
  g.scale(scale, scale);
  g.drawImage(img, -mx(F.x), -mz(F.z));
  // GPS route
  if (route && route.length > 1) {
    g.strokeStyle = "#ff5fa8";
    g.lineWidth = 5 / scale;
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(mx(route[0].x) - mx(F.x), mz(route[0].z) - mz(F.z));
    for (const p of route) g.lineTo(mx(p.x) - mx(F.x), mz(p.z) - mz(F.z));
    g.stroke();
  }
  g.restore();
  // blips (kept upright, clamped to the rim)
  const toScreen = (x, z) => {
    const dx = (x - F.x) * MAP.ppm * scale;
    const dz = (z - F.z) * MAP.ppm * scale;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return [dx * c - dz * s, dx * s + dz * c];
  };
  const R = w / 2 - 12;
  const put = (x, z, b, size = 16, clampRim = true) => {
    let [sx, sy] = toScreen(x, z);
    const d = Math.hypot(sx, sy);
    if (d > R) {
      if (!clampRim) return;
      sx = (sx / d) * R;
      sy = (sy / d) * R;
    }
    drawBlip(g, w / 2 + sx, h / 2 + sy, b, size);
  };
  for (const b of blips(sim)) put(b.x, b.z, b, 15, b.kind !== "service");
  // police
  const flash = Math.floor(sim.t * 4) % 2;
  for (const u of sim.police.units) {
    if (u.wrecked) continue;
    const [sx, sy] = toScreen(u.x, u.z);
    if (Math.hypot(sx, sy) > R) continue;
    g.beginPath();
    g.arc(w / 2 + sx, h / 2 + sy, 4.5, 0, Math.PI * 2);
    g.fillStyle = sim.police.wanted ? (flash ? "#ff3b3b" : "#3b7bff") : "#6ea8ff";
    g.fill();
  }
  // mission marker / target
  if (extra.marker) {
    const m = extra.marker;
    const list = m.multi || [m];
    for (const q of list) put(q.x, q.z, { icon: m.kind === "target" ? "!" : "●", color: m.kind === "target" ? "#ff4a4a" : m.kind === "foot" || m.kind === "npc" ? "#3fe0ff" : "#ffd23f" }, 16, true);
  }
  if (extra.waypoint) put(extra.waypoint.x, extra.waypoint.z, { icon: "⚑", color: "#ff5fa8" }, 16, true);
  // the player arrow (always at the centre, pointing its real heading)
  const pl = sim.player;
  const ph = pl.mode === "car" && pl.car ? pl.car.h : pl.h;
  const [ax, ay] = [Math.sin(ph), Math.cos(ph)];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const dirx = ax * c - ay * s;
  const diry = ax * s + ay * c;
  const ang = Math.atan2(diry, dirx);
  g.save();
  g.translate(w / 2, h / 2);
  g.rotate(ang + Math.PI / 2);
  g.beginPath();
  g.moveTo(0, -9);
  g.lineTo(7, 7);
  g.lineTo(0, 3);
  g.lineTo(-7, 7);
  g.closePath();
  g.fillStyle = "#ffffff";
  g.strokeStyle = "#111";
  g.lineWidth = 2;
  g.fill();
  g.stroke();
  g.restore();
  // north tick
  const [nx, ny] = toScreen(F.x, F.z - 1000);
  const nd = Math.hypot(nx, ny) || 1;
  g.fillStyle = "#fff";
  g.font = "bold 12px Inter, Arial";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("N", w / 2 + (nx / nd) * (R + 3), h / 2 + (ny / nd) * (R + 3));
  // rim
  g.beginPath();
  g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
  g.strokeStyle = sim.police.wanted ? (flash ? "#ff3b3b" : "#3b7bff") : "rgba(255,255,255,0.75)";
  g.lineWidth = 3;
  g.stroke();
}

/** full map, north-up, fitted to the canvas; returns the transform for clicks */
export function drawMap(g, w, h, sim, route, waypoint, marker) {
  const img = mapImage(sim.city, sim.prog.districts);
  const s = Math.min(w / W, h / H) * 0.96;
  const ox = (w - W * s) / 2;
  const oy = (h - H * s) / 2;
  g.clearRect(0, 0, w, h);
  g.fillStyle = "#0e3f55";
  g.fillRect(0, 0, w, h);
  g.drawImage(img, ox, oy, W * s, H * s);
  const X = (x) => ox + mx(x) * s;
  const Z = (z) => oy + mz(z) * s;
  if (route && route.length > 1) {
    g.strokeStyle = "#ff5fa8";
    g.lineWidth = 4;
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(X(route[0].x), Z(route[0].z));
    for (const p of route) g.lineTo(X(p.x), Z(p.z));
    g.stroke();
  }
  const bsz = Math.max(16, Math.min(24, w / 50));
  for (const b of blips(sim)) drawBlip(g, X(b.x), Z(b.z), b, bsz);
  for (const l of sim.city.landmarks) {
    if (!sim.prog.discovered.includes(l.id)) continue;
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.font = `600 ${Math.round(bsz * 0.55)}px Inter, Arial`;
    g.textAlign = "center";
    g.fillText(`◆ ${l.name}`, X(l.x), Z(l.z) - bsz);
  }
  if (marker) for (const q of marker.multi || [marker]) drawBlip(g, X(q.x), Z(q.z), { icon: marker.kind === "target" ? "!" : "●", color: marker.kind === "target" ? "#ff4a4a" : "#ffd23f" }, bsz);
  if (waypoint) drawBlip(g, X(waypoint.x), Z(waypoint.z), { icon: "⚑", color: "#ff5fa8" }, bsz);
  for (const u of sim.police.units) {
    if (u.wrecked) continue;
    g.beginPath();
    g.arc(X(u.x), Z(u.z), 4, 0, Math.PI * 2);
    g.fillStyle = sim.police.wanted ? "#ff3b3b" : "#6ea8ff";
    g.fill();
  }
  // owned car that isn't being driven
  for (const v of sim.vehicles) if (v.owner === "player" && v !== sim.player.car) drawBlip(g, X(v.x), Z(v.z), { icon: "🚘", color: "#7dff7a" }, bsz * 0.9);
  // the player
  const F = sim.focus();
  const ph = sim.player.mode === "car" && sim.player.car ? sim.player.car.h : sim.player.h;
  g.save();
  g.translate(X(F.x), Z(F.z));
  g.rotate(Math.atan2(Math.cos(ph), Math.sin(ph)) + Math.PI / 2);
  g.beginPath();
  g.moveTo(0, -11);
  g.lineTo(8, 8);
  g.lineTo(0, 4);
  g.lineTo(-8, 8);
  g.closePath();
  g.fillStyle = "#ffffff";
  g.strokeStyle = "#111";
  g.lineWidth = 2;
  g.fill();
  g.stroke();
  g.restore();
  return { toWorld: (px, py) => ({ x: (px - ox) / s / MAP.ppm + MAP.x0, z: (py - oy) / s / MAP.ppm + MAP.z0 }) };
}
