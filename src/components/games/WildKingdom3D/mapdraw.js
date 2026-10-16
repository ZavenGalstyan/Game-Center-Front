/**
 * Wild Kingdom 3D — world map and compass (2D canvas). The map base image is
 * rendered once from the real terrain (biome colours, hill shading, water,
 * biome boundaries); overlays use actual world coordinates.
 */
import { getTerrain, biomeAt, biomeWeights, HALF, LANDMARKS, CAVES, LAKES } from "./terrain.js";
import { TERRITORIES, SPECIES, BIOME_NAMES } from "./data.js";

const RES = 360;
let base = null;
const BCOL = { forest: [58, 92, 44], grass: [104, 146, 64], meadow: [126, 168, 74], savanna: [196, 164, 92], mountain: [128, 124, 116] };

/** Build (once) the map base image. */
export function mapBase() {
  if (base) return base;
  if (typeof document === "undefined") return null;
  const T = getTerrain();
  const c = document.createElement("canvas");
  c.width = RES;
  c.height = RES;
  const g = c.getContext("2d");
  const img = g.createImageData(RES, RES);
  const bio = new Array(RES * RES);
  const w = {};
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const x = -HALF + ((i + 0.5) / RES) * HALF * 2;
      const z = -HALF + ((j + 0.5) / RES) * HALF * 2;
      const h = T.height(x, z);
      const k = (j * RES + i) * 4;
      if (h < -0.15) {
        const d = Math.min(1, -h / 4);
        img.data[k] = 60 - d * 25;
        img.data[k + 1] = 130 - d * 30;
        img.data[k + 2] = 170 - d * 20;
        img.data[k + 3] = 255;
        bio[j * RES + i] = "water";
        continue;
      }
      biomeWeights(x, z, w);
      let r = 0;
      let gg = 0;
      let b = 0;
      for (const key in BCOL) {
        r += BCOL[key][0] * (w[key] || 0);
        gg += BCOL[key][1] * (w[key] || 0);
        b += BCOL[key][2] * (w[key] || 0);
      }
      if (h > 150) {
        const s = Math.min(1, (h - 150) / 30);
        r += (238 - r) * s;
        gg += (242 - gg) * s;
        b += (245 - b) * s;
      }
      // hill shade from the north-west
      const sh = (T.height(x - 4, z - 4) - T.height(x + 4, z + 4)) * 0.09;
      const shade = Math.max(0.55, Math.min(1.35, 1 + sh));
      img.data[k] = Math.min(255, r * shade);
      img.data[k + 1] = Math.min(255, gg * shade);
      img.data[k + 2] = Math.min(255, b * shade);
      img.data[k + 3] = 255;
      bio[j * RES + i] = biomeAt(x, z);
    }
  }
  // biome boundaries (thin dark lines)
  for (let j = 1; j < RES - 1; j++) {
    for (let i = 1; i < RES - 1; i++) {
      const b = bio[j * RES + i];
      if (b === "water") continue;
      const n = bio[j * RES + i + 1];
      const s = bio[(j + 1) * RES + i];
      if ((n !== b && n !== "water") || (s !== b && s !== "water")) {
        const k = (j * RES + i) * 4;
        img.data[k] *= 0.55;
        img.data[k + 1] *= 0.55;
        img.data[k + 2] *= 0.55;
      }
    }
  }
  g.putImageData(img, 0, 0);
  base = c;
  return base;
}

const toMap = (x, z, S) => [((x + HALF) / (HALF * 2)) * S, ((z + HALF) / (HALF * 2)) * S];

/** Draw the full world map. o: { sim, size, scale (dpr), time, hover } */
export function drawMap(g, o) {
  const { sim } = o;
  const S = o.size;
  const k = o.scale || 1;
  g.save();
  g.setTransform(k, 0, 0, k, 0, 0);
  g.clearRect(0, 0, S, S);
  const b = mapBase();
  if (b) {
    g.imageSmoothingEnabled = true;
    g.drawImage(b, 0, 0, S, S);
  }
  const A = sim.A;
  const p = sim.player;
  const sc = S / (HALF * 2);
  // biome labels
  g.font = `600 ${Math.max(9, S * 0.022)}px Inter, system-ui, sans-serif`;
  g.textAlign = "center";
  g.fillStyle = "rgba(255,255,255,0.55)";
  for (const [label, x, z] of [[BIOME_NAMES.mountain, 0, -520], [BIOME_NAMES.forest, -470, 330], [BIOME_NAMES.savanna, 470, 30], [BIOME_NAMES.grass, 60, 0]]) {
    const [mx, my] = toMap(x, z, S);
    g.fillText(label.toUpperCase(), mx, my);
  }
  for (const L of LAKES) {
    const [mx, my] = toMap(L.x, L.z, S);
    g.fillStyle = "rgba(220,240,255,0.8)";
    g.font = `500 ${Math.max(8, S * 0.019)}px Inter, system-ui, sans-serif`;
    g.fillText(L.name, mx, my + 3);
  }
  // territories (discovered only)
  for (const t of TERRITORIES) {
    if (!A.found.includes(t.id)) continue;
    const [mx, my] = toMap(t.x, t.z, S);
    const owned = A.owned.includes(t.id);
    const claimable = t.species.includes(sim.species);
    g.beginPath();
    g.arc(mx, my, t.r * sc, 0, Math.PI * 2);
    g.fillStyle = owned ? "rgba(125,255,154,0.22)" : claimable ? "rgba(255,210,90,0.14)" : "rgba(255,255,255,0.08)";
    g.fill();
    g.lineWidth = owned ? 2.2 : 1.4;
    g.setLineDash(owned ? [] : [4, 3]);
    g.strokeStyle = owned ? "#7dff9a" : claimable ? "#ffd25a" : "rgba(255,255,255,0.45)";
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#fff";
    g.font = `700 ${Math.max(8, S * 0.02)}px Inter, system-ui, sans-serif`;
    g.fillText(t.name, mx, my - t.r * sc - 4);
    if (claimable && !owned) {
      g.font = `600 ${Math.max(7, S * 0.017)}px Inter, system-ui, sans-serif`;
      g.fillStyle = A.rivalsBeaten.includes(t.id) ? "#ffd25a" : "#ff8a6a";
      g.fillText(A.rivalsBeaten.includes(t.id) ? "claim it!" : "rival alpha", mx, my + 4);
    }
  }
  // landmarks
  for (const L of LANDMARKS) {
    const seen = A.stats.landmarksSeen.includes(L.id);
    const [mx, my] = toMap(L.x, L.z, S);
    g.fillStyle = seen ? "#fff3c4" : "rgba(255,255,255,0.35)";
    g.beginPath();
    g.moveTo(mx, my - 5);
    g.lineTo(mx + 4.5, my + 3);
    g.lineTo(mx - 4.5, my + 3);
    g.closePath();
    g.fill();
    if (seen) {
      g.font = `500 ${Math.max(7, S * 0.018)}px Inter, system-ui, sans-serif`;
      g.fillText(L.name, mx, my + 13);
    }
  }
  for (const c of CAVES) {
    const [mx, my] = toMap(c.x, c.z, S);
    g.fillStyle = "#2a2622";
    g.beginPath();
    g.arc(mx, my, 3.2, Math.PI, 0);
    g.fill();
  }
  // nest
  if (A.nest) {
    const t = TERRITORIES.find((x) => x.id === A.nest.t);
    const [mx, my] = toMap(t.x, t.z, S);
    g.fillStyle = "#c8945a";
    g.beginPath();
    g.arc(mx, my, 4, 0, Math.PI * 2);
    g.fill();
  }
  // active objective
  const ob = sim.objective();
  if (ob && ob.loc) {
    const [mx, my] = toMap(ob.loc.x, ob.loc.z, S);
    const pulse = 6 + Math.sin((o.time || 0) * 4) * 2;
    g.strokeStyle = "#ffd25a";
    g.lineWidth = 2.4;
    g.beginPath();
    g.arc(mx, my, pulse, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#ffd25a";
    g.beginPath();
    g.arc(mx, my, 2.5, 0, Math.PI * 2);
    g.fill();
  }
  // recruit
  if (sim.recruit && !sim.recruit.dead) {
    const [mx, my] = toMap(sim.recruit.x, sim.recruit.z, S);
    g.fillStyle = "#ff5a8a";
    g.font = `700 ${Math.max(10, S * 0.03)}px Inter, system-ui, sans-serif`;
    g.fillText("♥", mx, my + 4);
  }
  // player arrow
  const [px, py] = toMap(p.x, p.z, S);
  g.save();
  g.translate(px, py);
  // map up = north (−Z); facing vector (sin yaw, cos yaw) → screen (x, y)
  g.rotate(Math.atan2(Math.cos(p.yaw), Math.sin(p.yaw)) - Math.PI / 2);
  g.fillStyle = SPECIES[sim.species].accent;
  g.strokeStyle = "#111";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, 9);
  g.lineTo(6, -6);
  g.lineTo(0, -3);
  g.lineTo(-6, -6);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
  // compass rose
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.beginPath();
  g.arc(S - 22, 22, 14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff";
  g.font = `800 ${11}px Inter, system-ui, sans-serif`;
  g.fillText("N", S - 22, 26);
  g.restore();
}

/**
 * Compass strip. heading: camera yaw. marks: [{x, z, color, label}] in world coords.
 */
export function drawCompass(g, o) {
  const { w, h, scale: k = 1, yaw, px, pz, marks = [] } = o;
  g.save();
  g.setTransform(k, 0, 0, k, 0, 0);
  g.clearRect(0, 0, w, h);
  const heading = Math.atan2(Math.sin(yaw), -Math.cos(yaw)); // 0 = north
  const span = Math.PI * 0.9;
  const X = (bearing) => {
    let rel = bearing - heading;
    rel = ((rel + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return { x: w / 2 + (rel / span) * w, rel };
  };
  g.textAlign = "center";
  for (let deg = 0; deg < 360; deg += 15) {
    const b = (deg * Math.PI) / 180;
    const { x, rel } = X(b);
    if (Math.abs(rel) > span / 2) continue;
    const fade = 1 - Math.abs(rel) / (span / 2);
    const card = deg % 90 === 0;
    g.globalAlpha = 0.3 + 0.7 * fade;
    g.fillStyle = card ? "#fff" : "rgba(255,255,255,0.7)";
    if (card || deg % 45 === 0) {
      g.font = `${card ? 800 : 600} ${card ? 13 : 10}px Inter, system-ui, sans-serif`;
      g.fillText(["N", "NE", "E", "SE", "S", "SW", "W", "NW"][deg / 45], x, h * 0.62);
    } else g.fillRect(x - 0.5, h * 0.35, 1, h * 0.22);
  }
  g.globalAlpha = 1;
  for (const m of marks) {
    const b = Math.atan2(m.x - px, -(m.z - pz));
    const { x, rel } = X(b);
    const cl = Math.max(-span / 2, Math.min(span / 2, rel));
    const xx = w / 2 + (cl / span) * w;
    g.fillStyle = m.color;
    g.beginPath();
    g.moveTo(xx, h - 2);
    g.lineTo(xx - 5, h - 10);
    g.lineTo(xx + 5, h - 10);
    g.closePath();
    g.fill();
    if (m.label) {
      g.font = "700 9px Inter, system-ui, sans-serif";
      g.fillText(m.label, xx, 9);
    }
    void x;
  }
  g.fillStyle = "#ffd25a";
  g.fillRect(w / 2 - 1, 0, 2, 5);
  g.restore();
}
