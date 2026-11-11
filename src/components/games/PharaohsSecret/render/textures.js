/**
 * Procedural canvas textures (no image files): sandstone masonry with carved
 * hieroglyph bands, floor slabs, painted panels, ceilings, glyph faces for
 * dials / pedestals / floor stones, and soft sprites. Glyphs are drawn from
 * the shared path data in engine/glyphs.js, so carvings match the clues.
 * Nothing here draws text.
 */
import * as THREE from "three";
import { GLYPHS, GLYPH_IDS } from "../engine/glyphs.js";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const canvas = (w, h = w) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
const rgb = ([r, g, b], k = 1) => `rgb(${Math.max(0, Math.min(255, r * k)) | 0},${Math.max(0, Math.min(255, g * k)) | 0},${Math.max(0, Math.min(255, b * k)) | 0})`;
const paths = {};
const glyphPath = (id) => (paths[id] ??= new Path2D(GLYPHS[id].d));

function tex(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Fine grain + blotches on both colour and bump canvases. */
function grain(ctx, bctx, w, h, rand, base, amount = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const bimg = bctx.getImageData(0, 0, w, h);
  const d = img.data,
    b = bimg.data;
  // low-frequency value noise grid
  const G = 16,
    grid = [];
  for (let i = 0; i < (G + 1) * (G + 1); i++) grid.push(rand());
  const at = (x, y) => {
    const gx = (x / w) * G,
      gy = (y / h) * G;
    const ix = Math.floor(gx),
      iy = Math.floor(gy);
    const fx = gx - ix,
      fy = gy - iy;
    const g = (i, j) => grid[(((iy + j) % G) * (G + 1)) + ((ix + i) % G)];
    return (g(0, 0) * (1 - fx) + g(1, 0) * fx) * (1 - fy) + (g(0, 1) * (1 - fx) + g(1, 1) * fx) * fy;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = (rand() - 0.5) * 22 * amount + (at(x, y) - 0.5) * 34 * amount;
      d[i] += n;
      d[i + 1] += n * 0.92;
      d[i + 2] += n * 0.8;
      b[i] = b[i + 1] = b[i + 2] = Math.max(0, Math.min(255, b[i] + n * 1.4));
    }
  }
  ctx.putImageData(img, 0, 0);
  bctx.putImageData(bimg, 0, 0);
}

/** A glyph carved into stone: dark recess, lit lower edge, bump dip. */
function carve(ctx, bctx, id, x, y, size, paint) {
  const s = size / 100;
  for (const [c, dx, dy, k] of [
    [ctx, 1.2, 1.2, "rgba(255,240,210,0.28)"],
    [ctx, -0.8, -0.8, "rgba(20,10,0,0.55)"],
  ]) {
    c.save();
    c.translate(x + dx, y + dy);
    c.scale(s, s);
    c.fillStyle = k;
    c.fill(glyphPath(id), "evenodd");
    c.restore();
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = paint || "rgba(60,36,14,0.42)";
  ctx.fill(glyphPath(id), "evenodd");
  ctx.restore();
  bctx.save();
  bctx.translate(x, y);
  bctx.scale(s, s);
  bctx.fillStyle = "rgba(0,0,0,0.55)";
  bctx.fill(glyphPath(id), "evenodd");
  bctx.restore();
}

/** Masonry wall with hieroglyph bands. 512² covers 4 m × 4.4 m of wall. */
export function wallTextures(zone, seed = 1) {
  const W = 512,
    H = 512;
  const c = canvas(W, H),
    b = canvas(W, H);
  const ctx = c.getContext("2d"),
    bctx = b.getContext("2d");
  const rand = rng(seed * 977 + zone.id * 31);
  ctx.fillStyle = rgb(zone.stone);
  ctx.fillRect(0, 0, W, H);
  bctx.fillStyle = "#808080";
  bctx.fillRect(0, 0, W, H);
  const rows = [0, 70, 150, 236, 326, 420, 512];
  for (let r = 0; r < rows.length - 1; r++) {
    const y0 = rows[r],
      y1 = rows[r + 1];
    let x = r % 2 ? -60 : 0;
    while (x < W) {
      const bw = 110 + rand() * 90;
      const k = 0.86 + rand() * 0.22;
      ctx.fillStyle = rgb(zone.stone, k);
      ctx.fillRect(x, y0, bw, y1 - y0);
      bctx.fillStyle = `rgb(${(118 + rand() * 30) | 0},${(118 + rand() * 30) | 0},${(118 + rand() * 30) | 0})`;
      bctx.fillRect(x, y0, bw, y1 - y0);
      // joint
      ctx.fillStyle = rgb(zone.stone, 0.55);
      ctx.fillRect(x, y0, 3, y1 - y0);
      bctx.fillStyle = "#303030";
      bctx.fillRect(x, y0, 3, y1 - y0);
      x += bw;
    }
    ctx.fillStyle = rgb(zone.stone, 0.5);
    ctx.fillRect(0, y0, W, 3);
    bctx.fillStyle = "#2a2a2a";
    bctx.fillRect(0, y0, W, 3);
  }
  // carved bands
  const bandRows = [1, 3];
  for (const br of bandRows) {
    const y0 = rows[br] + 8,
      y1 = rows[br + 1] - 8;
    const sz = Math.min(64, y1 - y0);
    for (let x = 12; x < W - sz; x += sz + 10) {
      const id = GLYPH_IDS[Math.floor(rand() * GLYPH_IDS.length)];
      const paint = zone.paint && rand() < 0.7 ? zone.paint[Math.floor(rand() * zone.paint.length)] : null;
      carve(ctx, bctx, id, x, y0 + (y1 - y0 - sz) / 2, sz, paint);
    }
    // band rules
    ctx.fillStyle = zone.paint ? zone.paint[0] : rgb(zone.stone, 0.62);
    ctx.globalAlpha = zone.paint ? 0.75 : 1;
    ctx.fillRect(0, rows[br] + 2, W, 4);
    ctx.fillRect(0, rows[br + 1] - 6, W, 4);
    ctx.globalAlpha = 1;
  }
  // cracks
  ctx.strokeStyle = rgb(zone.stone, 0.45);
  bctx.strokeStyle = "#202020";
  for (let i = 0; i < 6; i++) {
    let x = rand() * W,
      y = rand() * H;
    ctx.beginPath();
    bctx.beginPath();
    ctx.moveTo(x, y);
    bctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rand() - 0.5) * 40;
      y += rand() * 30;
      ctx.lineTo(x, y);
      bctx.lineTo(x, y);
    }
    ctx.lineWidth = bctx.lineWidth = 1.2;
    ctx.stroke();
    bctx.stroke();
  }
  grain(ctx, bctx, W, H, rand, zone.stone, zone.id === 3 ? 1.3 : 1);
  // grime toward the floor
  const g = ctx.createLinearGradient(0, H * 0.7, 0, H);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(20,10,0,0.35)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return { map: tex(c, { repeat: true }), bump: tex(b, { repeat: true, srgb: false }) };
}

/** Floor: one 2 m slab grid per 512² (covers 4 m × 4 m). */
export function floorTextures(zone, seed = 2) {
  const W = 512;
  const c = canvas(W),
    b = canvas(W);
  const ctx = c.getContext("2d"),
    bctx = b.getContext("2d");
  const rand = rng(seed * 131 + zone.id * 7);
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const k = 0.88 + rand() * 0.2;
      ctx.fillStyle = rgb(zone.floor, k);
      ctx.fillRect(i * 256, j * 256, 256, 256);
      bctx.fillStyle = `rgb(${(130 + rand() * 20) | 0},128,128)`;
      bctx.fillRect(i * 256, j * 256, 256, 256);
      // sub-split some slabs
      if (rand() < 0.5) {
        ctx.fillStyle = rgb(zone.floor, 0.55);
        ctx.fillRect(i * 256 + 128, j * 256, 3, 256);
        bctx.fillStyle = "#333";
        bctx.fillRect(i * 256 + 128, j * 256, 3, 256);
      }
    }
  }
  ctx.fillStyle = rgb(zone.floor, 0.45);
  bctx.fillStyle = "#222";
  for (const p of [0, 256]) {
    ctx.fillRect(p, 0, 4, W);
    ctx.fillRect(0, p, W, 4);
    bctx.fillRect(p, 0, 4, W);
    bctx.fillRect(0, p, W, 4);
  }
  // sand drifts
  for (let i = 0; i < 18; i++) {
    const x = rand() * W,
      y = rand() * W,
      r = 20 + rand() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${zone.stone[0]},${zone.stone[1]},${zone.stone[2]},0.22)`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  grain(ctx, bctx, W, W, rand, zone.floor, 1.1);
  return { map: tex(c, { repeat: true }), bump: tex(b, { repeat: true, srgb: false }) };
}

export function ceilingTexture(zone) {
  const W = 256;
  const c = canvas(W);
  const ctx = c.getContext("2d");
  const rand = rng(zone.id * 17 + 5);
  if (zone.ceiling === "stars") {
    ctx.fillStyle = zone.id === 4 ? "#0d1430" : "#132a5a";
    ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = "#e8c35a";
    for (let i = 0; i < 22; i++) {
      const x = rand() * W,
        y = rand() * W,
        r = 3 + rand() * 3;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const rr = k % 2 ? r * 0.4 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.fill();
    }
  } else if (zone.ceiling === "beams") {
    ctx.fillStyle = rgb(zone.stone, 0.45);
    ctx.fillRect(0, 0, W, W);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = rgb([92, 60, 34], 0.8 + rand() * 0.3);
      ctx.fillRect(0, i * 64 + 8, W, 40);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, i * 64 + 46, W, 4);
    }
  } else if (zone.ceiling === "open") {
    ctx.fillStyle = rgb(zone.stone, 0.6);
    ctx.fillRect(0, 0, W, W);
    ctx.strokeStyle = "#b8862a";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, 70, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(W / 2 + Math.cos(a) * 80, W / 2 + Math.sin(a) * 80);
      ctx.lineTo(W / 2 + Math.cos(a) * 120, W / 2 + Math.sin(a) * 120);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = rgb(zone.stone, 0.4);
    ctx.fillRect(0, 0, W, W);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.1 + rand() * 0.2})`;
      ctx.beginPath();
      ctx.arc(rand() * W, rand() * W, 6 + rand() * 20, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return tex(c, { repeat: true });
}

/** A single glyph on a disc / tile. style: dial | plate | floor | pedestal | block */
export function glyphTexture(id, style, zone) {
  const S = 128;
  const c = canvas(S);
  const ctx = c.getContext("2d");
  const stone = zone?.stone || [190, 150, 100];
  if (style === "dial") {
    const g = ctx.createRadialGradient(S / 2, S / 2, 8, S / 2, S / 2, S / 2);
    g.addColorStop(0, "#3a2a1a");
    g.addColorStop(1, "#1a120a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = "#c89a3a";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(S * 0.2, S * 0.2);
    ctx.scale((S * 0.6) / 100, (S * 0.6) / 100);
    ctx.fillStyle = "#ffd36a";
    ctx.shadowColor = "#ffae30";
    ctx.shadowBlur = 8;
    ctx.fill(glyphPath(id), "evenodd");
    ctx.restore();
  } else {
    ctx.fillStyle = rgb(stone, style === "floor" ? 0.82 : 0.95);
    ctx.fillRect(0, 0, S, S);
    const rand = rng(id.length * 97 + style.length);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rand() * 0.08})`;
      ctx.fillRect(rand() * S, rand() * S, 2, 2);
    }
    ctx.strokeStyle = rgb(stone, 0.5);
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, S - 8, S - 8);
    const b = canvas(S).getContext("2d");
    const paint = style === "pedestal" ? "#c8962e" : style === "floor" ? "rgba(40,20,5,0.75)" : null;
    carve(ctx, b, id, S * 0.18, S * 0.18, S * 0.64, paint);
  }
  return tex(c);
}

/** Wall painting / inscription panel. */
export function panelTexture(kind, glyphs, zone, seed = 3) {
  const W = 256,
    H = 220;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  const rand = rng(seed * 53 + 11);
  const paint = zone.paint || ["#a8322a", "#1f5e9e", "#d9a52b"];
  if (kind === "painting") {
    ctx.fillStyle = "#d8b67a";
    ctx.fillRect(0, 0, W, H);
    // borders
    const band = [paint[0], "#e8d8a8", paint[1 % paint.length], "#e8d8a8", paint[2 % paint.length] || "#d9a52b"];
    band.forEach((col, i) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.strokeRect(4 + i * 4, 4 + i * 4, W - 8 - i * 8, H - 8 - i * 8);
    });
  } else {
    ctx.fillStyle = rgb(zone.stone, 0.9);
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = rgb(zone.stone, 0.55);
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, W - 12, H - 12);
  }
  const b = canvas(W, H).getContext("2d");
  if (glyphs && glyphs.length) {
    const n = glyphs.length;
    const sz = Math.min(84, (W - 40) / n - 6);
    const total = n * sz + (n - 1) * 8;
    glyphs.forEach((id, i) => {
      const x = (W - total) / 2 + i * (sz + 8);
      carve(ctx, b, id, x, (H - sz) / 2 - 8, sz, kind === "painting" ? paint[i % paint.length] : "rgba(50,28,8,0.7)");
    });
    // small numbering marks under each glyph (dots, not text)
    glyphs.forEach((_, i) => {
      const x = (W - total) / 2 + i * (sz + 8) + sz / 2;
      for (let k = 0; k <= i; k++) {
        ctx.fillStyle = kind === "painting" ? "#3a2410" : "rgba(40,20,5,0.6)";
        ctx.beginPath();
        ctx.arc(x - (i * 7) / 2 + k * 7, H / 2 + sz / 2 + 6, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  } else {
    // a procession of figures (painting) or columns of signs (inscription)
    if (kind === "painting") {
      for (let i = 0; i < 4; i++) {
        const x = 40 + i * 56,
          y = 60;
        ctx.fillStyle = "#7a3a1a";
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1b1b1b";
        ctx.fillRect(x - 12, y - 14, 18, 12);
        ctx.fillStyle = "#7a3a1a";
        ctx.fillRect(x - 6, y + 10, 12, 40);
        ctx.fillStyle = "#f0e8d0";
        ctx.beginPath();
        ctx.moveTo(x - 14, y + 80);
        ctx.lineTo(x + 14, y + 80);
        ctx.lineTo(x + 8, y + 46);
        ctx.lineTo(x - 8, y + 46);
        ctx.fill();
        ctx.fillStyle = "#7a3a1a";
        ctx.fillRect(x - 6, y + 80, 4, 40);
        ctx.fillRect(x + 3, y + 80, 4, 40);
        ctx.fillStyle = paint[i % paint.length];
        ctx.fillRect(x - 13, y + 8, 26, 6);
      }
    } else {
      for (let col = 0; col < 5; col++) {
        for (let row = 0; row < 4; row++) {
          const id = GLYPH_IDS[Math.floor(rand() * GLYPH_IDS.length)];
          carve(ctx, b, id, 24 + col * 44, 18 + row * 46, 36, "rgba(50,28,8,0.6)");
        }
      }
    }
  }
  return tex(c);
}

/** Door slab: carved frame with a large golden emblem. */
export function doorTexture(zone, gold) {
  const W = 256,
    H = 512;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  const base = gold ? [176, 132, 50] : zone.stone.map((v) => v * 0.82);
  ctx.fillStyle = rgb(base);
  ctx.fillRect(0, 0, W, H);
  const rand = rng(zone.id * 7 + (gold ? 3 : 1));
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rand() * 0.07})`;
    ctx.fillRect(rand() * W, rand() * H, 2, 2);
  }
  ctx.strokeStyle = rgb(base, 0.55);
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.strokeStyle = rgb(base, 1.25);
  ctx.lineWidth = 3;
  ctx.strokeRect(26, 26, W - 52, H - 52);
  const b = canvas(W, H).getContext("2d");
  carve(ctx, b, "ankh", W / 2 - 60, 120, 120, gold ? "#7a4a10" : "#c8962e");
  carve(ctx, b, "eye", W / 2 - 40, 300, 80, gold ? "#7a4a10" : "rgba(40,20,5,0.6)");
  carve(ctx, b, "sun", W / 2 - 25, 50, 50, gold ? "#7a4a10" : "rgba(40,20,5,0.6)");
  return tex(c);
}

/** Radial soft sprite (flames, glows, dust, light). */
export function spriteTexture(kind) {
  const S = 128;
  const c = canvas(S);
  const ctx = c.getContext("2d");
  if (kind === "flame") {
    const g = ctx.createRadialGradient(S / 2, S * 0.62, 2, S / 2, S * 0.55, S * 0.45);
    g.addColorStop(0, "rgba(255,250,220,1)");
    g.addColorStop(0.25, "rgba(255,200,90,0.95)");
    g.addColorStop(0.6, "rgba(255,110,20,0.45)");
    g.addColorStop(1, "rgba(255,60,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(S / 2, 4);
    ctx.bezierCurveTo(S * 0.85, S * 0.45, S * 0.95, S * 0.95, S / 2, S - 4);
    ctx.bezierCurveTo(S * 0.05, S * 0.95, S * 0.15, S * 0.45, S / 2, 4);
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(kind === "dust" ? 0.25 : 0.35, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  return tex(c);
}
