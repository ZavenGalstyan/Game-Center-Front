/**
 * Procedural canvas textures (no image files): riveted hull plating with trim
 * stripes and water stains, diamond-plate floors, ceiling panels with light
 * strips, bulkhead doors, terminal screens, seven-segment gauge faces,
 * pictogram signs, research notes, crates, the deep ocean seen through the
 * windows, water caustics, the containment-field shimmer and soft sprites.
 * Nothing here draws text (digits are drawn as seven-segment shapes), so the
 * textures never need translating.
 */
import * as THREE from "three";

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
const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;

function tex(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Fine grain on colour + bump canvases. */
function grain(ctx, bctx, w, h, rand, amount = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const bimg = bctx.getImageData(0, 0, w, h);
  const d = img.data,
    b = bimg.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 14 * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
    b[i] = b[i + 1] = b[i + 2] = Math.max(0, Math.min(255, b[i] + n));
  }
  ctx.putImageData(img, 0, 0);
  bctx.putImageData(bimg, 0, 0);
}
function rivets(ctx, bctx, x0, y0, x1, y1, step, color) {
  for (let x = x0; x <= x1; x += step) {
    for (const y of [y0, y1]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.arc(x - 0.8, y - 0.8, 1.1, 0, Math.PI * 2);
      ctx.fill();
      bctx.fillStyle = "#e0e0e0";
      bctx.beginPath();
      bctx.arc(x, y, 2.6, 0, Math.PI * 2);
      bctx.fill();
    }
  }
}

/** Hull plating: two rows of riveted plates, a coloured trim stripe, a vent and stains. 512² covers 4 m × 4.4 m. */
export function wallTextures(zone, seed = 1) {
  const W = 512,
    H = 512;
  const c = canvas(W, H),
    b = canvas(W, H);
  const ctx = c.getContext("2d"),
    bctx = b.getContext("2d");
  const rand = rng(seed * 977 + zone.id * 31);
  ctx.fillStyle = rgb(zone.wall);
  ctx.fillRect(0, 0, W, H);
  bctx.fillStyle = "#808080";
  bctx.fillRect(0, 0, W, H);
  // plates
  const rows = [0, 150, 330, 512];
  for (let r = 0; r < rows.length - 1; r++) {
    const y0 = rows[r],
      y1 = rows[r + 1];
    for (let x = 0; x < W; x += 128) {
      const k = 0.9 + rand() * 0.14;
      const gr = ctx.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, rgb(zone.wall, k * 1.08));
      gr.addColorStop(1, rgb(zone.wall, k * 0.86));
      ctx.fillStyle = gr;
      ctx.fillRect(x + 2, y0 + 2, 124, y1 - y0 - 4);
      bctx.fillStyle = "#909090";
      bctx.fillRect(x + 4, y0 + 4, 120, y1 - y0 - 8);
      ctx.strokeStyle = rgb(zone.wall, 0.45);
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y0 + 1.5, 125, y1 - y0 - 3);
      bctx.strokeStyle = "#202020";
      bctx.lineWidth = 3;
      bctx.strokeRect(x + 1.5, y0 + 1.5, 125, y1 - y0 - 3);
      rivets(ctx, bctx, x + 10, y0 + 10, x + 118, y1 - 10, 27, rgb(zone.wall, 0.7));
    }
  }
  // trim stripe at hand height
  const ty = 330;
  ctx.fillStyle = rgb(zone.trim, 0.95);
  ctx.fillRect(0, ty - 22, W, 16);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, ty - 6, W, 3);
  bctx.fillStyle = "#b0b0b0";
  bctx.fillRect(0, ty - 22, W, 16);
  // hazard band near the floor
  for (let x = -20; x < W; x += 40) {
    ctx.fillStyle = "#e8b81a";
    ctx.beginPath();
    ctx.moveTo(x, 512);
    ctx.lineTo(x + 20, 492);
    ctx.lineTo(x + 40, 492);
    ctx.lineTo(x + 20, 512);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(20,20,20,0.85)";
  ctx.globalCompositeOperation = "destination-over";
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 490, W, 2);
  // vent grille on one plate
  const vx = 128 * Math.floor(rand() * 4) + 24;
  ctx.fillStyle = rgb(zone.wall, 0.35);
  ctx.fillRect(vx, 190, 80, 90);
  for (let y = 196; y < 276; y += 10) {
    ctx.fillStyle = rgb(zone.wall, 1.05);
    ctx.fillRect(vx + 4, y, 72, 4);
    bctx.fillStyle = "#c0c0c0";
    bctx.fillRect(vx + 4, y, 72, 4);
  }
  // pipes along the top
  for (const [py, pr] of [
    [40, 9],
    [64, 6],
  ]) {
    const gp = ctx.createLinearGradient(0, py - pr, 0, py + pr);
    gp.addColorStop(0, rgb(zone.wall, 0.6));
    gp.addColorStop(0.4, rgb(zone.wall, 1.25));
    gp.addColorStop(1, rgb(zone.wall, 0.45));
    ctx.fillStyle = gp;
    ctx.fillRect(0, py - pr, W, pr * 2);
    bctx.fillStyle = "#d0d0d0";
    bctx.fillRect(0, py - pr, W, pr * 2);
    for (let x = 60; x < W; x += 170) {
      ctx.fillStyle = rgb(zone.wall, 0.55);
      ctx.fillRect(x, py - pr - 2, 10, pr * 2 + 4);
    }
  }
  grain(ctx, bctx, W, H, rand, 1);
  // water stains running down from the joints
  for (let i = 0; i < 10; i++) {
    const x = rand() * W,
      y = 150 + rand() * 200;
    const g = ctx.createLinearGradient(x, y, x, y + 120 + rand() * 120);
    g.addColorStop(0, "rgba(40,60,50,0.35)");
    g.addColorStop(1, "rgba(40,60,50,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 4 + rand() * 10, 240);
  }
  if (zone.emergency) {
    for (let i = 0; i < 6; i++) {
      const x = rand() * W,
        y = rand() * H;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 40 + rand() * 40);
      g.addColorStop(0, "rgba(90,50,30,0.35)");
      g.addColorStop(1, "rgba(90,50,30,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }
  return { map: tex(c, { repeat: true }), bump: tex(b, { repeat: true, srgb: false }) };
}

/** Diamond-plate floor with panel seams and a drain grate. 512² covers 4 m × 4 m. */
export function floorTextures(zone, seed = 2) {
  const W = 512;
  const c = canvas(W),
    b = canvas(W);
  const ctx = c.getContext("2d"),
    bctx = b.getContext("2d");
  const rand = rng(seed * 131 + zone.id * 7);
  ctx.fillStyle = rgb(zone.floor);
  ctx.fillRect(0, 0, W, W);
  bctx.fillStyle = "#808080";
  bctx.fillRect(0, 0, W, W);
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const k = 0.92 + rand() * 0.12;
      ctx.fillStyle = rgb(zone.floor, k);
      ctx.fillRect(i * 256 + 3, j * 256 + 3, 250, 250);
    }
  }
  // diamond tread
  for (let y = 8; y < W; y += 16) {
    for (let x = (y / 16) % 2 ? 8 : 16; x < W; x += 16) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((x + y) / 16) % 2 ? 0.7 : -0.7);
      ctx.fillStyle = rgb(zone.floor, 1.25);
      ctx.fillRect(-5, -1.5, 10, 3);
      ctx.restore();
      bctx.save();
      bctx.translate(x, y);
      bctx.rotate(((x + y) / 16) % 2 ? 0.7 : -0.7);
      bctx.fillStyle = "#d0d0d0";
      bctx.fillRect(-5, -1.5, 10, 3);
      bctx.restore();
    }
  }
  ctx.strokeStyle = rgb(zone.floor, 0.4);
  ctx.lineWidth = 4;
  bctx.strokeStyle = "#202020";
  bctx.lineWidth = 4;
  for (const v of [0, 256, 512]) {
    ctx.beginPath();
    ctx.moveTo(v, 0);
    ctx.lineTo(v, W);
    ctx.moveTo(0, v);
    ctx.lineTo(W, v);
    ctx.stroke();
    bctx.beginPath();
    bctx.moveTo(v, 0);
    bctx.lineTo(v, W);
    bctx.moveTo(0, v);
    bctx.lineTo(W, v);
    bctx.stroke();
  }
  // drain grate
  ctx.fillStyle = "rgba(10,12,14,0.85)";
  ctx.fillRect(300, 300, 90, 90);
  for (let x = 306; x < 386; x += 12) {
    ctx.fillStyle = rgb(zone.floor, 0.9);
    ctx.fillRect(x, 304, 6, 82);
  }
  grain(ctx, bctx, W, W, rand, 1.2);
  // damp patches
  for (let i = 0; i < 5; i++) {
    const x = rand() * W,
      y = rand() * W;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 50 + rand() * 50);
    g.addColorStop(0, "rgba(10,25,30,0.35)");
    g.addColorStop(1, "rgba(10,25,30,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, W);
  }
  return { map: tex(c, { repeat: true }), bump: tex(b, { repeat: true, srgb: false }) };
}

/** Ceiling: dark panels, a cable tray and a light strip. */
export function ceilingTexture(zone) {
  const W = 256;
  const c = canvas(W);
  const ctx = c.getContext("2d");
  const rand = rng(zone.id * 17 + 3);
  ctx.fillStyle = rgb(zone.wall, 0.42);
  ctx.fillRect(0, 0, W, W);
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = rgb(zone.wall, 0.5 + rand() * 0.08);
      ctx.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
      ctx.fillStyle = rgb(zone.wall, 0.3);
      for (let k = 0; k < 6; k++) ctx.fillRect(i * 128 + 20 + k * 16, j * 128 + 20, 6, 88);
    }
  ctx.fillStyle = rgb(zone.wall, 0.25);
  ctx.fillRect(0, 120, W, 16);
  return tex(c, { repeat: true });
}

/** Bulkhead / security door face: plating, hazard chevrons and a pressure wheel. */
export function doorTexture(zone, kind = "hatch") {
  const W = 256,
    H = 512;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  const base = kind === "blast" ? [92, 98, 108] : kind === "security" ? [70, 80, 96] : zone.wall.map((v) => v * 0.8);
  ctx.fillStyle = rgb(base);
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, "rgba(0,0,0,0.35)");
  g.addColorStop(0.15, "rgba(255,255,255,0.06)");
  g.addColorStop(0.85, "rgba(255,255,255,0.04)");
  g.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // chevrons
  for (const y0 of [40, H - 90]) {
    for (let x = -40; x < W + 40; x += 36) {
      ctx.fillStyle = "#e8b81a";
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x + 18, y0);
      ctx.lineTo(x + 38, y0 + 50);
      ctx.lineTo(x + 20, y0 + 50);
      ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.moveTo(x + 18, y0);
      ctx.lineTo(x + 36, y0);
      ctx.lineTo(x + 56, y0 + 50);
      ctx.lineTo(x + 38, y0 + 50);
      ctx.fill();
    }
  }
  // centre seam + wheel
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(W / 2 - 2, 0, 4, H);
  ctx.strokeStyle = rgb(base, 1.6);
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 58, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 4; k++) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate((k * Math.PI) / 2 + 0.4);
    ctx.fillStyle = rgb(base, 1.5);
    ctx.fillRect(-4, -58, 8, 116);
    ctx.restore();
  }
  ctx.fillStyle = rgb(base, 0.5);
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 16, 0, Math.PI * 2);
  ctx.fill();
  // rivet rows
  for (let y = 110; y < H - 110; y += 24) {
    for (const x of [14, W - 14]) {
      ctx.fillStyle = rgb(base, 0.6);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (kind === "security") {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(30, 120, W - 60, 60);
  }
  return tex(c);
}

/** A glowing terminal screen (graphs, bars, waveforms — no text). */
export function screenTexture(kind = "graph", tint = "#3affd0", seed = 1) {
  const W = 256,
    H = 192;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  const rand = rng(seed * 53 + 7);
  ctx.fillStyle = "#04121a";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = tint;
  ctx.fillStyle = tint;
  ctx.globalAlpha = 0.18;
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  if (kind === "graph") {
    ctx.beginPath();
    let y = H / 2;
    for (let x = 12; x < W - 12; x += 6) {
      y = Math.max(30, Math.min(H - 30, y + (rand() - 0.5) * 30));
      x === 12 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      ctx.globalAlpha = 0.7;
      ctx.fillRect(16 + i * 28, H - 26, 18, 10);
    }
  } else if (kind === "bars") {
    for (let i = 0; i < 9; i++) {
      const h = 20 + rand() * (H - 60);
      ctx.globalAlpha = 0.5 + rand() * 0.5;
      ctx.fillRect(18 + i * 25, H - 20 - h, 16, h);
    }
  } else if (kind === "wave") {
    ctx.beginPath();
    for (let x = 12; x < W - 12; x++) {
      const y = H / 2 + Math.sin(x * 0.08) * 30 * Math.sin(x * 0.013 + seed);
      x === 12 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(W - 50, 46, 26, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === "map") {
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 7; i++) ctx.strokeRect(20 + rand() * 150, 20 + rand() * 100, 30 + rand() * 60, 20 + rand() * 40);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(60 + rand() * 120, 50 + rand() * 80, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "lines") {
    for (let y = 22; y < H - 20; y += 14) {
      ctx.globalAlpha = 0.6;
      ctx.fillRect(16, y, 30 + rand() * (W - 70), 5);
    }
  }
  ctx.globalAlpha = 1;
  const v = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  return tex(c);
}

/* -------------------------------------------------------------- seven segments */
const SEG = {
  0: "abcdef",
  1: "bc",
  2: "abdeg",
  3: "abcdg",
  4: "bcfg",
  5: "acdfg",
  6: "acdefg",
  7: "abc",
  8: "abcdefg",
  9: "abcdfg",
};
/** Draw one seven-segment digit with its top-left at (x, y). */
export function drawDigit(ctx, d, x, y, w, h, on = "#ff5a3a", off = "rgba(255,255,255,0.06)") {
  const t = w * 0.18;
  const segs = {
    a: [x + t, y, w - 2 * t, t],
    b: [x + w - t, y + t, t, h / 2 - 1.5 * t],
    c: [x + w - t, y + h / 2 + t / 2, t, h / 2 - 1.5 * t],
    d: [x + t, y + h - t, w - 2 * t, t],
    e: [x, y + h / 2 + t / 2, t, h / 2 - 1.5 * t],
    f: [x, y + t, t, h / 2 - 1.5 * t],
    g: [x + t, y + h / 2 - t / 2, w - 2 * t, t],
  };
  const lit = SEG[d] || "";
  for (const [k, r] of Object.entries(segs)) {
    ctx.fillStyle = lit.includes(k) ? on : off;
    ctx.fillRect(...r);
  }
}

/** Pressure gauge face: a dial whose needle points at `value` (1–5) plus a seven-segment readout. */
export function gaugeTexture(value, color = "#ffcf3a") {
  const S = 256;
  const c = canvas(S);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#14181c";
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = "#e8ecef";
  ctx.beginPath();
  ctx.arc(S / 2, S * 0.46, S * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#6a7480";
  ctx.lineWidth = 10;
  ctx.stroke();
  // coloured zones
  const a0 = Math.PI * 0.8,
    a1 = Math.PI * 2.2;
  const zone = (from, to, col) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(S / 2, S * 0.46, S * 0.3, a0 + (a1 - a0) * from, a0 + (a1 - a0) * to);
    ctx.stroke();
  };
  zone(0, 0.6, "#3ac070");
  zone(0.6, 0.85, "#e8b81a");
  zone(0.85, 1, "#e04030");
  for (let i = 1; i <= 5; i++) {
    const a = a0 + ((a1 - a0) * (i - 1)) / 4;
    ctx.strokeStyle = "#1a1e22";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(S / 2 + Math.cos(a) * S * 0.2, S * 0.46 + Math.sin(a) * S * 0.2);
    ctx.lineTo(S / 2 + Math.cos(a) * S * 0.34, S * 0.46 + Math.sin(a) * S * 0.34);
    ctx.stroke();
    // pips: i dots by each tick so values read without numbers
    for (let k = 0; k < i; k++) {
      const r = S * 0.13,
        aa = a + (k - (i - 1) / 2) * 0.09;
      ctx.fillStyle = "#1a1e22";
      ctx.beginPath();
      ctx.arc(S / 2 + Math.cos(aa) * r, S * 0.46 + Math.sin(aa) * r, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const a = a0 + ((a1 - a0) * (value - 1)) / 4;
  ctx.strokeStyle = "#d02020";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(S / 2, S * 0.46);
  ctx.lineTo(S / 2 + Math.cos(a) * S * 0.31, S * 0.46 + Math.sin(a) * S * 0.31);
  ctx.stroke();
  ctx.fillStyle = "#30363c";
  ctx.beginPath();
  ctx.arc(S / 2, S * 0.46, 12, 0, Math.PI * 2);
  ctx.fill();
  // readout
  ctx.fillStyle = "#050607";
  ctx.fillRect(S / 2 - 30, S - 62, 60, 54);
  drawDigit(ctx, value, S / 2 - 16, S - 56, 32, 42, color);
  return tex(c);
}

/** Keypad face: a 3×4 grid of keys and a dark display. */
export function keypadTexture(lit = "#3affd0") {
  const W = 128,
    H = 192;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#1c2228";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#04121a";
  ctx.fillRect(12, 12, W - 24, 34);
  for (let i = 0; i < 4; i++) drawDigit(ctx, 8, 20 + i * 24, 17, 16, 24, "rgba(58,255,208,0.12)", "rgba(58,255,208,0.04)");
  for (let r = 0; r < 4; r++)
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = "#3a444e";
      ctx.fillRect(14 + k * 36, 58 + r * 32, 28, 24);
      ctx.fillStyle = "#56626e";
      ctx.fillRect(14 + k * 36, 58 + r * 32, 28, 4);
      const n = r === 3 ? (k === 1 ? 0 : -1) : r * 3 + k + 1;
      if (n >= 0) drawDigit(ctx, n, 22 + k * 36, 62 + r * 32, 11, 16, "#c8d0d8", "rgba(0,0,0,0)");
      else {
        ctx.fillStyle = k === 0 ? "#e04030" : "#3ac070";
        ctx.fillRect(22 + k * 36, 66 + r * 32, 12, 8);
      }
    }
  ctx.fillStyle = lit;
  ctx.fillRect(W / 2 - 10, H - 10, 20, 4);
  return tex(c);
}

/** Pictogram safety signs and wall logs (no words): warning triangle, water, bolt, biohazard, schematic. */
export function signTexture(kind, seed = 1) {
  const W = 256,
    H = 192;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  const rand = rng(seed * 11 + 5);
  if (kind === "note" || kind === "board" || kind === "log") {
    ctx.fillStyle = kind === "board" ? "#3a4652" : "#e8ecef";
    ctx.fillRect(0, 0, W, H);
    const papers = kind === "board" ? 4 : 1;
    for (let p = 0; p < papers; p++) {
      const x = kind === "board" ? 14 + (p % 2) * 118 : 10,
        y = kind === "board" ? 12 + Math.floor(p / 2) * 88 : 10,
        w = kind === "board" ? 108 : W - 20,
        h = kind === "board" ? 76 : H - 20;
      ctx.fillStyle = kind === "board" ? ["#f4f0d8", "#d8f0ff", "#ffe0d0", "#f4f4f4"][p] : "#f6f4ec";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "rgba(30,40,60,0.55)";
      for (let ly = y + 12; ly < y + h - 8; ly += 9) ctx.fillRect(x + 8, ly, 10 + rand() * (w - 24), 2.5);
      if (kind === "board") {
        ctx.fillStyle = "#d03030";
        ctx.beginPath();
        ctx.arc(x + w / 2, y + 4, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (kind === "log") {
      ctx.fillStyle = "#e8b81a";
      ctx.fillRect(0, 0, W, 14);
    }
    return tex(c);
  }
  if (kind === "diagram") {
    ctx.fillStyle = "#0e2a4a";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(160,210,255,0.25)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#cfe6ff";
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) ctx.strokeRect(20 + rand() * 160, 20 + rand() * 100, 30 + rand() * 50, 20 + rand() * 40);
    ctx.beginPath();
    ctx.moveTo(30, 150);
    for (let i = 0; i < 6; i++) ctx.lineTo(40 + i * 36, 40 + rand() * 110);
    ctx.stroke();
    return tex(c);
  }
  // safety sign: yellow triangle with a pictogram
  ctx.fillStyle = "#1a1e22";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8b81a";
  ctx.beginPath();
  ctx.moveTo(W / 2, 14);
  ctx.lineTo(W / 2 + 92, H - 16);
  ctx.lineTo(W / 2 - 92, H - 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.fillStyle = "#111";
  ctx.strokeStyle = "#111";
  if (kind === "water") {
    for (let k = 0; k < 3; k++) {
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (let x = -40; x <= 40; x += 4) {
        const y = 110 + k * 18 + Math.sin(x * 0.2) * 5;
        x === -40 ? ctx.moveTo(W / 2 + x, y) : ctx.lineTo(W / 2 + x, y);
      }
      ctx.stroke();
    }
  } else if (kind === "bolt") {
    ctx.beginPath();
    ctx.moveTo(W / 2 + 8, 66);
    ctx.lineTo(W / 2 - 22, 122);
    ctx.lineTo(W / 2, 122);
    ctx.lineTo(W / 2 - 10, 160);
    ctx.lineTo(W / 2 + 24, 104);
    ctx.lineTo(W / 2 + 2, 104);
    ctx.closePath();
    ctx.fill();
  } else {
    // biohazard-like trefoil
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(W / 2 + Math.cos(a) * 18, 118 + Math.sin(a) * 18, 18, 0, Math.PI * 2);
      ctx.lineWidth = 7;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(W / 2, 118, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  return tex(c);
}

/** The deep ocean seen through windows: dark gradient, light shafts, marine snow (tileable horizontally). */
export function oceanTexture(zone, seed = 4) {
  const W = 512,
    H = 512;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  const rand = rng(seed * 19 + zone.id);
  const top = new THREE.Color(zone.water).multiplyScalar(1.6);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `#${top.getHexString()}`);
  g.addColorStop(0.5, hex(zone.water));
  g.addColorStop(1, "#01060a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 5; i++) {
    const x = rand() * W;
    const gr = ctx.createLinearGradient(x, 0, x + 60, H);
    gr.addColorStop(0, "rgba(180,240,255,0.16)");
    gr.addColorStop(1, "rgba(180,240,255,0)");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 30 + rand() * 30, 0);
    ctx.lineTo(x + 120 + rand() * 60, H);
    ctx.lineTo(x + 40, H);
    ctx.fill();
  }
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(220,240,255,${0.15 + rand() * 0.4})`;
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }
  // distant sea floor ridges
  ctx.fillStyle = "rgba(0,8,12,0.85)";
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) ctx.lineTo(x, H - 50 - Math.sin(x * 0.02 + seed) * 25 - rand() * 12);
  ctx.lineTo(W, H);
  ctx.fill();
  const t = tex(c, { repeat: true });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Tileable caustic light pattern for water surfaces and pool floors (greyscale, used as alpha/emissive). */
export function causticTexture(seed = 9) {
  const S = 256;
  const c = canvas(S);
  const ctx = c.getContext("2d");
  const rand = rng(seed);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineCap = "round";
  for (let i = 0; i < 70; i++) {
    const x = rand() * S,
      y = rand() * S,
      r = 10 + rand() * 26;
    ctx.lineWidth = 1 + rand() * 2.4;
    for (const [ox, oy] of [
      [0, 0],
      [S, 0],
      [-S, 0],
      [0, S],
      [0, -S],
    ]) {
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy, r, r * (0.6 + rand() * 0.4), rand() * 3, 0, Math.PI * (1 + rand()));
      ctx.stroke();
    }
  }
  return tex(c, { repeat: true, srgb: false });
}

/** Hexagonal shimmer of a hydrostatic containment field. */
export function fieldTexture() {
  const S = 256;
  const c = canvas(S);
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, S, S);
  const r = 16;
  const h = Math.sqrt(3) * r;
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1.5;
  for (let row = -1; row < S / h + 1; row++) {
    for (let col = -1; col < S / (r * 1.5) + 1; col++) {
      const x = col * r * 1.5,
        y = row * h + (col % 2 ? h / 2 : 0);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        k ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  return tex(c, { repeat: true, srgb: false });
}

/** Supply crate: painted panels with stencil stripes. */
export function crateTexture(seed = 5, color = "#4a6a7a") {
  const S = 256;
  const c = canvas(S);
  const ctx = c.getContext("2d");
  const rand = rng(seed);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, S - 12, S - 12);
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(12, 12);
  ctx.lineTo(S - 12, S - 12);
  ctx.moveTo(S - 12, 12);
  ctx.lineTo(12, S - 12);
  ctx.stroke();
  ctx.fillStyle = "#e8b81a";
  ctx.fillRect(30, S / 2 - 14, S - 60, 28);
  for (let x = 30; x < S - 30; x += 28) {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(x + 10, S / 2 - 14, 10, 28);
  }
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rand() * 0.15})`;
    ctx.fillRect(rand() * S, rand() * S, 2, 2);
  }
  return tex(c);
}

/** Soft sprites: glow · smoke · spark · flash (star burst) · bubble · dust · ring · flame (steam jet). */
export function spriteTexture(kind) {
  const S = 128;
  const c = canvas(S);
  const ctx = c.getContext("2d");
  if (kind === "flame") {
    const g = ctx.createRadialGradient(S / 2, S * 0.62, 2, S / 2, S * 0.55, S * 0.45);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.7)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(S / 2, 4);
    ctx.bezierCurveTo(S * 0.85, S * 0.45, S * 0.95, S * 0.95, S / 2, S - 4);
    ctx.bezierCurveTo(S * 0.05, S * 0.95, S * 0.15, S * 0.45, S / 2, 4);
    ctx.fill();
  } else if (kind === "flash") {
    ctx.translate(S / 2, S / 2);
    for (let k = 0; k < 8; k++) {
      ctx.rotate(Math.PI / 4);
      const g = ctx.createLinearGradient(0, 0, S / 2, 0);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(S / 2, 0);
      ctx.lineTo(0, 5);
      ctx.fill();
    }
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, S * 0.3);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-S / 2, -S / 2, S, S);
  } else if (kind === "smoke") {
    const rand = rng(77);
    for (let i = 0; i < 14; i++) {
      const x = S / 2 + (rand() - 0.5) * S * 0.4,
        y = S / 2 + (rand() - 0.5) * S * 0.4,
        r = S * (0.15 + rand() * 0.2);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }
  } else if (kind === "bubble") {
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.42);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(255,255,255,0.35)");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.ellipse(S * 0.38, S * 0.36, 9, 6, -0.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "ring") {
    ctx.strokeStyle = "rgba(255,255,255,1)";
    ctx.lineWidth = 10;
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.38, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === "fish") {
    // a distant fish silhouette (drawn dark)
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.beginPath();
    ctx.ellipse(S * 0.45, S / 2, S * 0.3, S * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(S * 0.72, S / 2);
    ctx.lineTo(S * 0.92, S * 0.36);
    ctx.lineTo(S * 0.92, S * 0.64);
    ctx.closePath();
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(kind === "spark" ? 0.18 : kind === "dust" ? 0.25 : 0.35, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  return tex(c);
}

/** Puddle / slime decal (alpha). */
export function splatTexture(color = "40,80,90", seed = 3) {
  const S = 128;
  const c = canvas(S);
  const ctx = c.getContext("2d");
  const rand = rng(seed);
  for (let i = 0; i < 9; i++) {
    const x = S / 2 + (rand() - 0.5) * S * 0.5,
      y = S / 2 + (rand() - 0.5) * S * 0.5,
      r = 10 + rand() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},0.6)`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  return tex(c);
}
