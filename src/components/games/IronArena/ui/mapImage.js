/**
 * Iron Arena — stylized top-down map images drawn from engine data (terrain
 * shading, water, roads, structures, bases). Used for the map cards and as
 * the static layer of the in-game minimap. Cached per (map, size, style).
 */
import { getMap } from "../engine/maps/index.js";
import { getArena } from "../engine/arena.js";

const PALETTE = {
  desert: { lo: [196, 160, 104], hi: [236, 206, 150], road: "#9a7a52", water: "#3a6a7a", struct: "#5a4a3a", rock: "#7a5a44" },
  neon: { lo: [26, 24, 38], hi: [40, 36, 58], road: "#3a3550", water: "#1a2a40", struct: "#5a3a7a", rock: "#4a4060" },
  forest: { lo: [58, 92, 44], hi: [110, 150, 72], road: "#8a6a44", water: "#2f6a7a", struct: "#5a4632", rock: "#6a6a62" },
  snow: { lo: [170, 186, 204], hi: [238, 244, 250], road: "#9aa6b4", water: "#8ac6e0", struct: "#4a5664", rock: "#6a7480" },
  harbor: { lo: [120, 118, 112], hi: [160, 156, 148], road: "#55585e", water: "#2a5a70", struct: "#3e4a56", rock: "#6a6660" },
};
const cache = new Map();

export function mapImage(mapId, size = 256, style = "card") {
  const key = mapId + size + style;
  if (cache.has(key)) return cache.get(key);
  if (typeof document === "undefined") return null;
  const map = getMap(mapId);
  const A = getArena(map);
  const pal = PALETTE[map.theme] || PALETTE.desert;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const H = map.H;
  const k = size / (2 * H);
  // north (+z) up; seen from above with +z up, screen-right is −x
  const toPx = (x, z) => [(H - x) * k, (H - z) * k];
  // terrain shading (height + hillshade)
  const img = g.createImageData(size, size);
  let hmin = Infinity;
  let hmax = -Infinity;
  const hs = new Float32Array(size * size);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const x = H - (i + 0.5) / k;
      const z = H - (j + 0.5) / k;
      const h = A.groundAt(x, z);
      hs[j * size + i] = h;
      if (h < hmin) hmin = h;
      if (h > hmax) hmax = h;
    }
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const h = hs[j * size + i];
      const t = (h - hmin) / Math.max(1, hmax - hmin);
      const hl = hs[j * size + Math.max(0, i - 1)];
      const hu = hs[Math.max(0, j - 1) * size + i];
      const shade = Math.max(-0.35, Math.min(0.35, ((h - hl) + (h - hu)) * 0.45));
      let col = [0, 1, 2].map((c2) => pal.lo[c2] + (pal.hi[c2] - pal.lo[c2]) * Math.min(1, t * 1.2));
      if (map.water && h < map.water.level - 0.3) col = [42, 96, 118];
      const o = (j * size + i) * 4;
      img.data[o] = Math.max(0, Math.min(255, col[0] * (1 + shade)));
      img.data[o + 1] = Math.max(0, Math.min(255, col[1] * (1 + shade)));
      img.data[o + 2] = Math.max(0, Math.min(255, col[2] * (1 + shade)));
      img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  // roads
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const p of map.paths) {
    if (p.kind === "plaza") continue;
    g.strokeStyle = pal.road;
    g.globalAlpha = 0.75;
    g.lineWidth = Math.max(1.5, p.width * k);
    g.beginPath();
    p.points.forEach(([x, z], i) => {
      const [px, py] = toPx(x, z);
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    });
    g.stroke();
  }
  g.globalAlpha = 1;
  // structures
  for (const col of map.colliders) {
    if (col.kind === "quay" || col.kind === "rail") continue;
    if (col.type === "cyl") {
      const [px, py] = toPx(col.x, col.z);
      g.fillStyle = col.kind === "tree" ? "rgba(30,60,30,0.55)" : col.kind === "rock" ? pal.rock : pal.struct;
      if (map.theme === "snow" && col.kind === "tree") g.fillStyle = "rgba(40,70,60,0.6)";
      g.beginPath();
      g.arc(px, py, Math.max(1, col.r * k), 0, Math.PI * 2);
      g.fill();
      continue;
    }
    const [px, py] = toPx(col.x, col.z);
    g.save();
    g.translate(px, py);
    g.rotate(-(col.rot || 0));
    g.fillStyle = col.type === "deck" ? "rgba(200,200,210,0.55)" : col.kind === "container" || col.kind === "stack" ? "#a0563a" : pal.struct;
    if (map.theme === "neon" && col.kind === "tower") g.fillStyle = "#2c2440";
    g.fillRect(-col.hw * k, -col.hd * k, col.hw * 2 * k, col.hd * 2 * k);
    if (map.theme === "neon" && col.kind === "tower") {
      g.strokeStyle = "rgba(255,74,216,0.6)";
      g.lineWidth = 1;
      g.strokeRect(-col.hw * k, -col.hd * k, col.hw * 2 * k, col.hd * 2 * k);
    }
    g.restore();
  }
  if (style === "card") {
    // bases
    map.flags.forEach((f, team) => {
      const [px, py] = toPx(f.x, f.z);
      g.fillStyle = team ? "rgba(255,82,69,0.85)" : "rgba(63,169,255,0.85)";
      g.beginPath();
      g.arc(px, py, Math.max(3, 6 * k * 1.4), 0, Math.PI * 2);
      g.fill();
    });
    // vignette
    const v = g.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = v;
    g.fillRect(0, 0, size, size);
  }
  const out = { canvas: c, url: style === "card" ? c.toDataURL("image/jpeg", 0.85) : null, H, k, toPx };
  cache.set(key, out);
  return out;
}
