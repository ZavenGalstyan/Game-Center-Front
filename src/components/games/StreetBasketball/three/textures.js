/**
 * Street Basketball — procedural canvas textures (no image files).
 *
 * The court texture maps world metres to pixels, so the painted lines sit
 * exactly where the engine's constants say they are (arc radius, key, rim).
 */
import * as THREE from "three";
import { ARC_R, KEY_HALF_W, KEY_LEN, BASELINE_Z, COURT_HALF_W, COURT_FAR_Z } from "../engine/constants.js";

/** World extents covered by the court texture (metres). */
export const COURT_TEX = { x0: -9.5, x1: 9.5, z0: -4.5, z1: 14.5 };

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function finish(c, { repeat = false, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.needsUpdate = true;
  return t;
}

/**
 * The court: asphalt grain, cracks, patches, stains, faded/worn paint lines
 * and a filled key. `size` 2048 (high) / 1536 (medium) / 1024 (low).
 */
export function courtTexture(court, size = 1536) {
  const c = canvas(size, size);
  const g = c.getContext("2d");
  const W = COURT_TEX.x1 - COURT_TEX.x0;
  const H = COURT_TEX.z1 - COURT_TEX.z0;
  const px = (x) => ((x - COURT_TEX.x0) / W) * size;
  const pz = (z) => ((z - COURT_TEX.z0) / H) * size;
  const m = size / W; // pixels per metre
  const r = rng(court.id.length * 977 + 13);

  // --- surround (sidewalk / concrete apron) then asphalt slab
  g.fillStyle = court.id === "beach" ? "#b9ab8e" : court.id === "rooftop" ? "#6e6a70" : court.id === "arena" ? "#1b1b20" : "#8a8680";
  g.fillRect(0, 0, size, size);
  const slab = { x0: px(-COURT_HALF_W - 0.9), z0: pz(BASELINE_Z - 1.6), x1: px(COURT_HALF_W + 0.9), z1: pz(COURT_FAR_Z + 1.2) };
  g.fillStyle = court.asphalt;
  g.fillRect(slab.x0, slab.z0, slab.x1 - slab.x0, slab.z1 - slab.z0);

  // --- asphalt grain (pixel noise), cheap blotches and aggregate speckle
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  const [ar, ag, ab] = hexToRgb(court.asphalt);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inSlab = x >= slab.x0 && x < slab.x1 && y >= slab.z0 && y < slab.z1;
      const n = (r() - 0.5) * (inSlab ? 26 : 18);
      const speck = inSlab && r() < 0.012 ? (r() < 0.5 ? 28 : -22) : 0;
      d[i] = Math.max(0, Math.min(255, (inSlab ? ar : d[i]) + n + speck));
      d[i + 1] = Math.max(0, Math.min(255, (inSlab ? ag : d[i + 1]) + n + speck));
      d[i + 2] = Math.max(0, Math.min(255, (inSlab ? ab : d[i + 2]) + n + speck * 0.9));
    }
  }
  g.putImageData(img, 0, 0);

  // large soft tonal variation (sun-bleached vs darker patches)
  for (let k = 0; k < 26; k++) {
    const x = slab.x0 + r() * (slab.x1 - slab.x0);
    const y = slab.z0 + r() * (slab.z1 - slab.z0);
    const rad = (1 + r() * 3.5) * m;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const light = r() < 0.5;
    grd.addColorStop(0, light ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // resurfaced patches: soft, irregular, barely darker
  for (let k = 0; k < 6; k++) {
    const cx = slab.x0 + r() * (slab.x1 - slab.x0);
    const cy = slab.z0 + r() * (slab.z1 - slab.z0);
    g.fillStyle = "rgba(15,15,18,0.07)";
    g.beginPath();
    const n = 9;
    const rad = (0.5 + r() * 0.9) * m;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = rad * (0.7 + r() * 0.5);
      g.lineTo(cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr);
    }
    g.fill();
  }

  // --- paint: key fill first (faded)
  g.save();
  g.globalAlpha = 0.78;
  g.fillStyle = court.keyFill;
  g.fillRect(px(-KEY_HALF_W), pz(BASELINE_Z), KEY_HALF_W * 2 * m, (KEY_LEN) * m);
  // centre circle fill
  g.beginPath();
  g.arc(px(0), pz(COURT_FAR_Z), 1.8 * m, Math.PI, 0);
  g.fill();
  g.restore();

  // --- lines
  const lw = 0.06 * m;
  g.strokeStyle = court.paint;
  g.lineWidth = lw;
  g.lineCap = "butt";
  // boundary
  g.strokeRect(px(-COURT_HALF_W), pz(BASELINE_Z), COURT_HALF_W * 2 * m, (COURT_FAR_Z - BASELINE_Z) * m);
  // key
  g.strokeRect(px(-KEY_HALF_W), pz(BASELINE_Z), KEY_HALF_W * 2 * m, KEY_LEN * m);
  // free-throw circle (top half solid, bottom dashed)
  const ftz = BASELINE_Z + KEY_LEN;
  g.beginPath();
  g.arc(px(0), pz(ftz), 1.8 * m, 0, Math.PI);
  g.stroke();
  g.setLineDash([0.35 * m, 0.3 * m]);
  g.beginPath();
  g.arc(px(0), pz(ftz), 1.8 * m, Math.PI, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  // restricted arc under the rim
  g.beginPath();
  g.arc(px(0), pz(0), 1.25 * m, 0, Math.PI);
  g.stroke();
  // scoring arc (2 points outside) — full circle clipped to the court
  g.save();
  g.beginPath();
  g.rect(px(-COURT_HALF_W), pz(BASELINE_Z), COURT_HALF_W * 2 * m, (COURT_FAR_Z - BASELINE_Z) * m);
  g.clip();
  g.lineWidth = lw * 1.1;
  g.beginPath();
  g.arc(px(0), pz(0), ARC_R * m, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  // half-court line + centre circle
  g.beginPath();
  g.moveTo(px(-COURT_HALF_W), pz(COURT_FAR_Z));
  g.lineTo(px(COURT_HALF_W), pz(COURT_FAR_Z));
  g.stroke();
  g.beginPath();
  g.arc(px(0), pz(COURT_FAR_Z), 1.8 * m, Math.PI, 0);
  g.stroke();
  // lane hash marks
  for (const zz of [1.2, 2.1, 3.0]) {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(px(s * KEY_HALF_W), pz(BASELINE_Z + zz));
      g.lineTo(px(s * (KEY_HALF_W + 0.25)), pz(BASELINE_Z + zz));
      g.stroke();
    }
  }
  // original court emblem in the centre circle (a simple crown + ball)
  g.save();
  g.translate(px(0), pz(COURT_FAR_Z - 0.9));
  g.globalAlpha = 0.55;
  g.fillStyle = court.accent;
  g.beginPath();
  const cw = 0.9 * m;
  g.moveTo(-cw, 0.2 * m);
  g.lineTo(-cw, -0.3 * m);
  g.lineTo(-cw * 0.5, 0.0);
  g.lineTo(0, -0.45 * m);
  g.lineTo(cw * 0.5, 0.0);
  g.lineTo(cw, -0.3 * m);
  g.lineTo(cw, 0.2 * m);
  g.closePath();
  g.fill();
  g.restore();

  // --- wear: erase paint in noisy patches + scuffs, then cracks
  g.save();
  g.globalCompositeOperation = "destination-out";
  for (let k = 0; k < 900; k++) {
    const x = slab.x0 + r() * (slab.x1 - slab.x0);
    const y = slab.z0 + r() * (slab.z1 - slab.z0);
    g.globalAlpha = 0.08 + r() * 0.25;
    g.beginPath();
    g.arc(x, y, (0.02 + r() * 0.12) * m, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  // repaint asphalt under erased paint (destination-out left holes → fill behind)
  g.save();
  g.globalCompositeOperation = "destination-over";
  g.fillStyle = court.asphalt;
  g.fillRect(0, 0, size, size);
  g.restore();

  // tyre / shoe scuffs
  for (let k = 0; k < 60; k++) {
    const x = px((r() - 0.5) * 12);
    const y = pz(r() * 10);
    g.strokeStyle = `rgba(10,10,12,${0.06 + r() * 0.08})`;
    g.lineWidth = (0.03 + r() * 0.05) * m;
    g.beginPath();
    g.arc(x, y, (0.2 + r() * 0.6) * m, r() * 6, r() * 6 + 0.8);
    g.stroke();
  }
  // cracks (random walks)
  for (let k = 0; k < 16; k++) {
    let x = slab.x0 + r() * (slab.x1 - slab.x0);
    let y = slab.z0 + r() * (slab.z1 - slab.z0);
    let a = r() * Math.PI * 2;
    g.strokeStyle = `rgba(12,12,14,${0.35 + r() * 0.25})`;
    g.lineWidth = Math.max(1, (0.008 + r() * 0.012) * m);
    g.beginPath();
    g.moveTo(x, y);
    const n = 8 + Math.floor(r() * 18);
    for (let s = 0; s < n; s++) {
      a += (r() - 0.5) * 1.1;
      x += Math.cos(a) * (0.12 + r() * 0.2) * m;
      y += Math.sin(a) * (0.12 + r() * 0.2) * m;
      g.lineTo(x, y);
      if (r() < 0.12) {
        // branch
        g.moveTo(x, y);
      }
    }
    g.stroke();
  }
  // stains / gum spots / leaves
  for (let k = 0; k < 140; k++) {
    const x = slab.x0 + r() * (slab.x1 - slab.x0);
    const y = slab.z0 + r() * (slab.z1 - slab.z0);
    g.fillStyle = r() < 0.7 ? `rgba(0,0,0,${0.08 + r() * 0.12})` : `rgba(255,255,255,${0.05 + r() * 0.08})`;
    g.beginPath();
    g.ellipse(x, y, (0.02 + r() * 0.06) * m, (0.02 + r() * 0.05) * m, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // weeds along the slab edge on the neighbourhood court
  if (court.id === "neighborhood") {
    for (let k = 0; k < 90; k++) {
      const edge = r() < 0.5;
      const x = edge ? (r() < 0.5 ? slab.x0 : slab.x1) + (r() - 0.5) * 8 : slab.x0 + r() * (slab.x1 - slab.x0);
      const y = edge ? slab.z0 + r() * (slab.z1 - slab.z0) : (r() < 0.5 ? slab.z0 : slab.z1) + (r() - 0.5) * 8;
      g.fillStyle = `rgba(70,${100 + r() * 50},40,${0.4 + r() * 0.3})`;
      g.beginPath();
      g.arc(x, y, (0.03 + r() * 0.05) * m, 0, Math.PI * 2);
      g.fill();
    }
  }
  return finish(c, { aniso: 8 });
}

/** Asphalt / ground bump (grayscale noise, tiling). */
export function noiseTexture(size = 256, seed = 7, contrast = 60) {
  const c = canvas(size, size);
  const g = c.getContext("2d");
  const img = g.createImageData(size, size);
  const r = rng(seed);
  for (let i = 0; i < size * size; i++) {
    const v = 128 + (r() - 0.5) * contrast;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return finish(c, { repeat: true, srgb: false });
}

/**
 * Basketball: pebbled leather + 8-panel seam layout (equator, one full
 * meridian ring and two curved side seams) in equirectangular UVs.
 */
export function ballTexture(skin, size = 1024) {
  const c = canvas(size, size / 2);
  const g = c.getContext("2d");
  const W = size;
  const H = size / 2;
  const r = rng(skin.id.length * 31 + 5);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, skin.base);
  grd.addColorStop(0.5, skin.base2 || skin.base);
  grd.addColorStop(1, skin.base);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // pebbles
  for (let k = 0; k < 26000; k++) {
    const x = r() * W;
    const y = r() * H;
    g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.05)";
    g.fillRect(x, y, 1.6, 1.6);
  }
  // secondary panel tint (two-tone skins)
  if (skin.panel) {
    g.save();
    g.globalAlpha = 0.9;
    g.fillStyle = skin.panel;
    for (const u0 of [0, 0.5]) {
      g.beginPath();
      for (let y = 0; y <= H; y += 4) {
        const v = y / H;
        const u = u0 + 0.25 + 0.085 * Math.sin(Math.PI * v) * (v < 0.5 ? 1 : 1);
        g.lineTo(u * W, y);
      }
      for (let y = H; y >= 0; y -= 4) {
        const v = y / H;
        g.lineTo((u0 + 0.25 - 0.085 * Math.sin(Math.PI * v)) * W, y);
      }
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  g.strokeStyle = skin.seam;
  g.lineWidth = size * 0.011;
  g.lineCap = "round";
  // equator
  g.beginPath();
  g.moveTo(0, H / 2);
  g.lineTo(W, H / 2);
  g.stroke();
  // meridian ring (u = 0 / 0.5)
  for (const u of [0.0, 0.5, 1.0]) {
    g.beginPath();
    g.moveTo(u * W, 0);
    g.lineTo(u * W, H);
    g.stroke();
  }
  // curved side seams
  for (const u0 of [0.25, 0.75]) {
    for (const s of [-1, 1]) {
      g.beginPath();
      for (let y = 0; y <= H; y += 3) {
        const v = y / H;
        const u = u0 + s * 0.085 * Math.sin(Math.PI * v);
        if (y === 0) g.moveTo(u * W, y);
        else g.lineTo(u * W, y);
      }
      g.stroke();
    }
  }
  // tiny original stamp text
  g.save();
  g.translate(W * 0.37, H * 0.36);
  g.fillStyle = skin.seam;
  g.globalAlpha = 0.55;
  g.font = `bold ${Math.round(size * 0.026)}px Arial`;
  g.fillText("STREET • 7", 0, 0);
  g.restore();
  return finish(c, { aniso: 4 });
}

/** Net: a diamond mesh with alpha, mapped around an open cone. */
export function netTexture() {
  const c = canvas(256, 128);
  const g = c.getContext("2d");
  g.clearRect(0, 0, 256, 128);
  g.strokeStyle = "rgba(250,250,245,0.95)";
  g.lineWidth = 3.2;
  const cols = 12;
  const rows = 4;
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = (i / cols) * 256;
      const y0 = (j / rows) * 128;
      const y1 = ((j + 1) / rows) * 128;
      const dx = 256 / cols / 2;
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x + dx, y1);
      g.moveTo(x, y0);
      g.lineTo(x - dx, y1);
      g.stroke();
    }
  }
  const t = finish(c, { repeat: true, srgb: true, aniso: 4 });
  return t;
}

/** Chain-link fence (alpha). */
export function chainLinkTexture() {
  const c = canvas(128, 128);
  const g = c.getContext("2d");
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(190,196,200,0.9)";
  g.lineWidth = 3;
  const s = 32;
  for (let i = -4; i < 8; i++) {
    g.beginPath();
    g.moveTo(i * s, 0);
    g.lineTo(i * s + 128, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(i * s + 128, 0);
    g.lineTo(i * s, 128);
    g.stroke();
  }
  return finish(c, { repeat: true, aniso: 4 });
}

/** Soft round contact shadow. */
export function blobTexture() {
  const c = canvas(128, 128);
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(0,0,0,0.62)");
  grd.addColorStop(0.45, "rgba(0,0,0,0.35)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return finish(c, { srgb: false });
}

/** Light cone / glow. */
export function glowTexture(color = "#ffffff") {
  const c = canvas(128, 128);
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, color);
  grd.addColorStop(0.3, color + "88");
  grd.addColorStop(1, color + "00");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return finish(c);
}

/** Backboard face: off-white acrylic, frame line, shooter's square, grime. */
export function backboardTexture(accent = "#d9432f") {
  const c = canvas(512, 300);
  const g = c.getContext("2d");
  g.fillStyle = "#eef0ee";
  g.fillRect(0, 0, 512, 300);
  const r = rng(99);
  for (let k = 0; k < 2200; k++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.04})`;
    g.fillRect(r() * 512, r() * 300, 2, 2);
  }
  // rain streaks
  for (let k = 0; k < 40; k++) {
    const x = r() * 512;
    g.strokeStyle = "rgba(90,80,60,0.08)";
    g.lineWidth = 2 + r() * 3;
    g.beginPath();
    g.moveTo(x, 240 + r() * 50);
    g.lineTo(x + (r() - 0.5) * 6, 300);
    g.stroke();
  }
  g.strokeStyle = accent;
  g.lineWidth = 12;
  g.strokeRect(10, 10, 492, 280);
  // shooter's square: 59 x 45 cm on a 180 x 105 board
  const sw = (0.59 / 1.8) * 512;
  const sh = (0.45 / 1.05) * 300;
  g.lineWidth = 9;
  g.strokeRect(256 - sw / 2, 300 - 20 - sh, sw, sh);
  // ball marks
  for (let k = 0; k < 14; k++) {
    g.fillStyle = "rgba(120,90,60,0.06)";
    g.beginPath();
    g.arc(256 + (r() - 0.5) * 220, 150 + (r() - 0.5) * 120, 14 + r() * 10, 0, Math.PI * 2);
    g.fill();
  }
  return finish(c, { aniso: 4 });
}

/** Windows grid for buildings. Night = lit windows. */
export function windowsTexture(night = false, seed = 3, base = "#8d7766") {
  const c = canvas(256, 512);
  const g = c.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 512);
  const r = rng(seed);
  for (let y = 16; y < 512; y += 36) {
    for (let x = 14; x < 256; x += 30) {
      const lit = night ? r() < 0.55 : false;
      if (night) g.fillStyle = lit ? (r() < 0.7 ? "#ffd89a" : "#bfe4ff") : "#1a1c24";
      else g.fillStyle = r() < 0.2 ? "#6f8aa0" : "#aab8c4";
      g.fillRect(x, y, 18, 22);
      if (!night) {
        g.fillStyle = "rgba(255,255,255,0.25)";
        g.fillRect(x, y, 18, 4);
      }
    }
  }
  return finish(c, { repeat: true });
}

/** Original graffiti-style mural (abstract shapes + a made-up tag). */
export function muralTexture(palette, word = "HOOP DREAMS", seed = 11) {
  const c = canvas(1024, 384);
  const g = c.getContext("2d");
  const r = rng(seed);
  g.fillStyle = palette[0];
  g.fillRect(0, 0, 1024, 384);
  // brick hint
  g.strokeStyle = "rgba(0,0,0,0.12)";
  g.lineWidth = 2;
  for (let y = 0; y < 384; y += 24) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(1024, y);
    g.stroke();
    for (let x = (y / 24) % 2 ? 0 : 30; x < 1024; x += 60) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + 24);
      g.stroke();
    }
  }
  // paint blobs
  for (let k = 0; k < 18; k++) {
    g.fillStyle = palette[1 + Math.floor(r() * (palette.length - 1))];
    g.globalAlpha = 0.85;
    g.beginPath();
    const x = r() * 1024;
    const y = r() * 384;
    g.ellipse(x, y, 40 + r() * 140, 30 + r() * 90, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  // drips
  for (let k = 0; k < 30; k++) {
    g.fillStyle = palette[1 + Math.floor(r() * (palette.length - 1))];
    const x = r() * 1024;
    const y = 120 + r() * 160;
    g.fillRect(x, y, 4, 20 + r() * 60);
  }
  // the tag: chunky outlined letters, slightly rotated
  g.save();
  g.translate(512, 205);
  g.rotate(-0.06);
  g.font = "900 118px Impact, 'Arial Black', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 26;
  g.strokeStyle = "#111";
  g.strokeText(word, 0, 0);
  g.lineWidth = 12;
  g.strokeStyle = "#fff";
  g.strokeText(word, 0, 0);
  const tg = g.createLinearGradient(0, -60, 0, 60);
  tg.addColorStop(0, palette[2] || "#ffcc00");
  tg.addColorStop(1, palette[3] || "#ff4d6d");
  g.fillStyle = tg;
  g.fillText(word, 0, 0);
  g.restore();
  // stars / sparkles
  g.fillStyle = "#fff";
  for (let k = 0; k < 12; k++) {
    const x = r() * 1024;
    const y = r() * 384;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = i % 2 ? 4 : 12;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.fill();
  }
  return finish(c);
}

/** LED sign (emissive): bold text on dark. */
export function ledTexture(text, color = "#ffd23f", w = 1024, h = 160) {
  const c = canvas(w, h);
  const g = c.getContext("2d");
  g.fillStyle = "#07070b";
  g.fillRect(0, 0, w, h);
  g.font = `900 ${Math.round(h * 0.62)}px Impact, 'Arial Black', sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = color;
  g.shadowBlur = 24;
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2 + 4);
  // dot-matrix mask
  g.shadowBlur = 0;
  g.fillStyle = "rgba(0,0,0,0.35)";
  for (let y = 0; y < h; y += 5) g.fillRect(0, y, w, 1.5);
  for (let x = 0; x < w; x += 5) g.fillRect(x, 0, 1.5, h);
  return finish(c);
}

/** Jersey print: number on front + back, trim stripe (lathe UVs: u around, v up). */
export function jerseyTexture(base, trim, number = "7") {
  const c = canvas(512, 256);
  const g = c.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 256);
  // fabric weave
  const r = rng(number.charCodeAt(0));
  for (let k = 0; k < 5000; k++) {
    g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.035)" : "rgba(255,255,255,0.035)";
    g.fillRect(r() * 512, r() * 256, 2, 1);
  }
  // side panels
  g.fillStyle = trim;
  g.globalAlpha = 0.9;
  g.fillRect(122, 0, 12, 256);
  g.fillRect(378, 0, 12, 256);
  g.globalAlpha = 1;
  // hem stripe
  g.fillRect(0, 238, 512, 8);
  // numbers: the torso lathe puts the chest at u = 0.25 and the back at u = 0.75;
  // (verified in the browser: drawn normally, it reads correctly on both sides)
  g.font = "900 96px 'Arial Black', Impact, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 8;
  g.strokeStyle = trim;
  g.fillStyle = "#ffffff";
  for (const u of [0.25, 0.75]) {
    g.save();
    g.translate(u * 512, 118);
    g.strokeText(number, 0, 0);
    g.fillText(number, 0, 0);
    g.restore();
  }
  return finish(c, { aniso: 4 });
}

/** Sky dome gradient. */
export function skyTexture(sky) {
  const c = canvas(16, 512);
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, sky.top);
  grd.addColorStop(0.55, sky.mid);
  grd.addColorStop(0.8, sky.bottom);
  grd.addColorStop(1, sky.bottom);
  g.fillStyle = grd;
  g.fillRect(0, 0, 16, 512);
  return finish(c, { aniso: 1 });
}

/** Wood planks (boardwalk / benches). */
export function woodTexture(seed = 5, base = "#8a6440") {
  const c = canvas(256, 256);
  const g = c.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let y = 0; y < 256; y += 32) {
    g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.1})`;
    g.fillRect(0, y, 256, 32);
    g.fillStyle = "rgba(0,0,0,0.45)";
    g.fillRect(0, y, 256, 2);
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(40,20,5,${r() * 0.15})`;
      g.fillRect(r() * 256, y + r() * 30, 20 + r() * 60, 1);
    }
  }
  return finish(c, { repeat: true });
}

/** Sand / grass ground tile. */
export function groundTexture(kind, seed = 4) {
  const c = canvas(256, 256);
  const g = c.getContext("2d");
  const base = kind === "sand" ? "#dcc596" : kind === "grass" ? "#5f7f3e" : kind === "roof" ? "#6e6a70" : "#1a1a20";
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  const n = kind === "grass" ? 9000 : 6000;
  for (let k = 0; k < n; k++) {
    if (kind === "grass") g.fillStyle = r() < 0.5 ? `rgba(30,60,20,${r() * 0.4})` : `rgba(150,170,80,${r() * 0.3})`;
    else g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.12})` : `rgba(255,255,255,${r() * 0.12})`;
    g.fillRect(r() * 256, r() * 256, kind === "grass" ? 1 : 2, kind === "grass" ? 3 : 2);
  }
  return finish(c, { repeat: true });
}
