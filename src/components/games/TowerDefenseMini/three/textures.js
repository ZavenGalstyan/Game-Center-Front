/**
 * Tower Defense Mini — canvas-painted textures (no image assets).
 *
 * groundTexture paints the whole battlefield once per level: grass noise,
 * shores, the dirt road (edges, ruts, pebbles) and soft dark rings under the
 * build pads. Everything is seeded, so a level always looks the same.
 */
import * as THREE from "three";

export const GROUND = { minX: -24, maxX: 24, minZ: -15, maxZ: 15 };

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

export function groundTexture(level, world, paths, quality) {
  const ppu = quality === "low" ? 22 : quality === "high" ? 44 : 34;
  const W = Math.round((GROUND.maxX - GROUND.minX) * ppu);
  const H = Math.round((GROUND.maxZ - GROUND.minZ) * ppu);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d");
  const R = rng(level.id * 131 + 7);
  const X = (x) => (x - GROUND.minX) * ppu;
  const Z = (z) => (z - GROUND.minZ) * ppu;
  const [g0, g1, g2, g3] = world.grass;

  g.fillStyle = g0;
  g.fillRect(0, 0, W, H);
  // big soft colour patches
  for (let i = 0; i < 160; i++) {
    const x = R() * W;
    const y = R() * H;
    const r = (1.2 + R() * 3.5) * ppu;
    const col = [g1, g2, g3][i % 3];
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, hexA(col.length === 7 ? col : "#000000", 0.55));
    grd.addColorStop(1, hexA(col.length === 7 ? col : "#000000", 0));
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fine blades / speckles
  const blades = quality === "low" ? 5000 : quality === "high" ? 26000 : 14000;
  for (let i = 0; i < blades; i++) {
    const x = R() * W;
    const y = R() * H;
    g.strokeStyle = hexA(i % 2 ? g3 : g2, 0.5 + R() * 0.3);
    g.lineWidth = Math.max(1, ppu * 0.035);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (R() - 0.5) * ppu * 0.12, y - ppu * (0.06 + R() * 0.1));
    g.stroke();
  }
  if (world.id === 3) {
    // snow sparkle
    for (let i = 0; i < blades / 4; i++) {
      g.fillStyle = `rgba(255,255,255,${0.4 + R() * 0.5})`;
      g.fillRect(R() * W, R() * H, 1.5, 1.5);
    }
  }
  if (world.id === 5) {
    // glowing cracks in the rock
    g.lineCap = "round";
    for (let i = 0; i < 26; i++) {
      let x = R() * W;
      let y = R() * H;
      g.strokeStyle = `rgba(255,${90 + R() * 60},20,0.75)`;
      g.lineWidth = Math.max(1.5, ppu * 0.06);
      g.shadowColor = "#ff5a10";
      g.shadowBlur = ppu * 0.3;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (R() - 0.5) * ppu * 1.6;
        y += (R() - 0.5) * ppu * 1.6;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.shadowBlur = 0;
  }

  // shores
  for (const [wx, wz, rx, rz] of level.water) {
    g.fillStyle = world.waterKind === "lava" ? "#2a1a16" : world.waterKind === "ice" ? "#c9dbe8" : shade(world.road, 0.8);
    g.beginPath();
    g.ellipse(X(wx), Z(wz), (rx + 0.32) * ppu, (rz + 0.3) * ppu, 0, 0, Math.PI * 2);
    g.fill();
    if (world.waterKind === "lava") {
      g.strokeStyle = "rgba(255,110,30,0.5)";
      g.lineWidth = ppu * 0.12;
      g.stroke();
    }
  }

  // roads: edge band, surface, ruts, pebbles
  const stroke = (pts, width, style, dash) => {
    g.strokeStyle = style;
    g.lineWidth = width * ppu;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.setLineDash(dash || []);
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
    g.stroke();
    g.setLineDash([]);
  };
  for (const p of paths) stroke(p.dense, 2.05, hexA(world.grass[3], 0.55));
  for (const p of paths) stroke(p.dense, 1.78, world.roadEdge);
  for (const p of paths) stroke(p.dense, 1.5, world.road);
  for (const p of paths) {
    // ruts: offset copies of the centreline
    for (const off of [-0.36, 0.36]) {
      const pts = [];
      for (let i = 0; i <= p.n; i += 6) {
        const a = Math.max(0, i - 3);
        const b = Math.min(p.n, i + 3);
        let tx = p.xs[b] - p.xs[a];
        let tz = p.zs[b] - p.zs[a];
        const l = Math.hypot(tx, tz) || 1;
        tx /= l;
        tz /= l;
        pts.push([p.xs[i] - tz * off, p.zs[i] + tx * off]);
      }
      stroke(pts, 0.14, hexA(world.roadEdge, 0.45));
    }
    const dots = quality === "low" ? 120 : 360;
    for (let i = 0; i < dots; i++) {
      const k = Math.floor(R() * p.n);
      const ox = (R() - 0.5) * 1.3;
      const oz = (R() - 0.5) * 1.3;
      g.fillStyle = hexA(i % 3 ? world.roadDots : world.roadEdge, 0.7);
      g.beginPath();
      g.arc(X(p.xs[k] + ox), Z(p.zs[k] + oz), ppu * (0.03 + R() * 0.05), 0, Math.PI * 2);
      g.fill();
    }
  }
  // base courtyard
  const end = level.paths[0][level.paths[0].length - 1];
  const grd = g.createRadialGradient(X(end[0]), Z(end[1]), 0, X(end[0]), Z(end[1]), 2.6 * ppu);
  grd.addColorStop(0, hexA(world.roadEdge, 0.9));
  grd.addColorStop(0.7, hexA(world.roadEdge, 0.5));
  grd.addColorStop(1, hexA(world.roadEdge, 0));
  g.fillStyle = grd;
  g.fillRect(X(end[0]) - 3 * ppu, Z(end[1]) - 3 * ppu, 6 * ppu, 6 * ppu);
  // soft contact shadow under each pad
  for (const [x, z] of level.spots) {
    const r = 1.15 * ppu;
    const sh = g.createRadialGradient(X(x), Z(z), r * 0.5, X(x), Z(z), r);
    sh.addColorStop(0, "rgba(0,0,0,0.28)");
    sh.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sh;
    g.fillRect(X(x) - r, Z(z) - r, r * 2, r * 2);
  }
  // fade the borders into the plain outer ground colour (no seam)
  const fw = 3 * ppu;
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
    [0, 0, fw, 0, 0, 0, fw, H],
    [W, 0, W - fw, 0, W - fw, 0, fw, H],
    [0, 0, 0, fw, 0, 0, W, fw],
    [0, H, 0, H - fw, 0, H - fw, W, fw],
  ]) {
    const lg = g.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0, hexA(g0, 1));
    lg.addColorStop(1, hexA(g0, 0));
    g.fillStyle = lg;
    g.fillRect(rx, ry, rw, rh);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

let padTex = null;
/** Dashed "build here" ring with a plus in the middle (tinted by material colour). */
export function padMarkTexture() {
  if (padTex) return padTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const g = cv.getContext("2d");
  g.strokeStyle = "#fff";
  g.lineWidth = 7;
  g.lineCap = "round";
  g.setLineDash([14, 12]);
  g.beginPath();
  g.arc(64, 64, 54, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(64, 46);
  g.lineTo(64, 82);
  g.moveTo(46, 64);
  g.lineTo(82, 64);
  g.stroke();
  padTex = new THREE.CanvasTexture(cv);
  return padTex;
}

let rippleTex = null;
export function rippleTexture() {
  if (rippleTex) return rippleTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d");
  const R = rng(99);
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(255,255,255,0.55)";
  g.lineCap = "round";
  for (let i = 0; i < 46; i++) {
    const x = R() * 256;
    const y = R() * 256;
    const w = 10 + R() * 30;
    g.lineWidth = 1.5 + R() * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + w / 2, y - 4, x + w, y);
    g.stroke();
  }
  rippleTex = new THREE.CanvasTexture(cv);
  rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping;
  return rippleTex;
}

let lavaTex = null;
export function lavaTexture() {
  if (lavaTex) return lavaTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d");
  const R = rng(7);
  g.fillStyle = "#d43a10";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const x = R() * 256;
    const y = R() * 256;
    const r = 8 + R() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, i % 3 ? "rgba(255,200,60,0.9)" : "rgba(255,120,30,0.9)");
    grd.addColorStop(1, "rgba(255,120,30,0)");
    g.fillStyle = grd;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) g.fillRect(x - r + ox, y - r + oy, r * 2, r * 2);
  }
  g.strokeStyle = "rgba(60,15,5,0.55)";
  g.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    let x = R() * 256;
    let y = R() * 256;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (R() - 0.5) * 60;
      y += (R() - 0.5) * 60;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  lavaTex = new THREE.CanvasTexture(cv);
  lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
  lavaTex.colorSpace = THREE.SRGBColorSpace;
  return lavaTex;
}

let dotTex = null;
/** Soft round sprite for particles and halos. */
export function dotTexture() {
  if (dotTex) return dotTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.75)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(cv);
  return dotTex;
}

let blobTex = null;
export function blobTexture() {
  if (blobTex) return blobTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,0.45)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(cv);
  return blobTex;
}
