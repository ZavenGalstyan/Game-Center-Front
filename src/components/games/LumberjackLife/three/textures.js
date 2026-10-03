/**
 * Lumberjack Life — procedural canvas textures (no image assets). Cached by
 * key; `disposeTextures()` frees them when the game unmounts.
 *
 * bark (birch / furrow / plate / smooth), end grain with growth rings,
 * plank faces, plaid flannel, denim-ish canvas, ground detail, conveyor belt,
 * corrugated roof, wooden boards, hazard stripes, paper notes, soft sprite.
 */
import * as THREE from "three";
import { createRng } from "../engine/math.js";

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

function finish(key, c, { repeat = null, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

const hexA = (hex, a) => {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
};
const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
};

/* ------------------------------------------------------------ bark */
export function barkTexture(bark) {
  const key = `bark:${bark.pattern}:${bark.base}`;
  if (cache.has(key)) return cache.get(key);
  const W = 256;
  const H = 512;
  const [c, g] = canvas(W, H);
  const rng = createRng(W + bark.base.length * 13 + bark.pattern.length);
  g.fillStyle = bark.base;
  g.fillRect(0, 0, W, H);
  // fine grain noise
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng() - 0.5) * 22;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  if (bark.pattern === "birch") {
    // horizontal lenticels + dark patches
    for (let i = 0; i < 110; i++) {
      const y = rng() * H;
      const x = rng() * W;
      const w = 6 + rng() * 34;
      g.fillStyle = hexA(bark.dark, 0.55 + rng() * 0.4);
      g.fillRect(x, y, w, 1.5 + rng() * 2.5);
      if (x + w > W) g.fillRect(x - W, y, w, 2);
    }
    for (let i = 0; i < 16; i++) {
      const y = rng() * H;
      const x = rng() * W;
      g.fillStyle = hexA(bark.dark, 0.85);
      g.beginPath();
      g.ellipse(x, y, 6 + rng() * 16, 4 + rng() * 9, 0, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = hexA(bark.light, 0.5);
      g.fillRect(rng() * W, rng() * H, 10 + rng() * 30, 1);
    }
  } else if (bark.pattern === "furrow") {
    // deep vertical ridges that wander and merge
    for (let k = 0; k < 26; k++) {
      let x = rng() * W;
      const wdt = 3 + rng() * 6;
      g.strokeStyle = hexA(bark.dark, 0.7 + rng() * 0.3);
      g.lineWidth = wdt;
      g.beginPath();
      g.moveTo(x, -10);
      for (let y = 0; y <= H + 20; y += 20) {
        x += (rng() - 0.5) * 9;
        g.lineTo(x, y);
      }
      g.stroke();
      g.strokeStyle = hexA(bark.light, 0.35);
      g.lineWidth = 1.5;
      g.stroke();
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = hexA(rng() < 0.5 ? bark.dark : bark.light, 0.2);
      g.fillRect(rng() * W, rng() * H, 2 + rng() * 5, 4 + rng() * 14);
    }
  } else if (bark.pattern === "plate") {
    // flaky plates separated by dark cracks (pine / spruce)
    for (let y = 0; y < H; y += 26 + rng() * 18) {
      for (let x = -20; x < W; x += 28 + rng() * 24) {
        const w = 22 + rng() * 26;
        const h = 18 + rng() * 26;
        g.fillStyle = hexA(rng() < 0.5 ? bark.light : shade(bark.base, 0.92 + rng() * 0.2), 0.75);
        g.beginPath();
        g.moveTo(x + rng() * 4, y + rng() * 4);
        g.lineTo(x + w, y + rng() * 6);
        g.lineTo(x + w - rng() * 5, y + h);
        g.lineTo(x + rng() * 5, y + h - rng() * 5);
        g.closePath();
        g.fill();
        g.strokeStyle = hexA(bark.dark, 0.85);
        g.lineWidth = 2.5;
        g.stroke();
      }
    }
  } else {
    // smooth (beech): faint blotches + horizontal rings
    for (let i = 0; i < 70; i++) {
      g.fillStyle = hexA(rng() < 0.5 ? bark.dark : bark.light, 0.12 + rng() * 0.12);
      g.beginPath();
      g.ellipse(rng() * W, rng() * H, 10 + rng() * 30, 6 + rng() * 22, 0, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 26; i++) {
      g.fillStyle = hexA(bark.dark, 0.25);
      g.fillRect(rng() * W, rng() * H, 14 + rng() * 40, 1.2);
    }
  }
  return finish(key, c);
}

/* ------------------------------------------------------------ end grain (log faces, stumps) */
export function endGrainTexture(wood, bark) {
  const key = `end:${wood.ring}:${bark.base}`;
  if (cache.has(key)) return cache.get(key);
  const S = 256;
  const [c, g] = canvas(S, S);
  const rng = createRng(S + wood.ring.length);
  g.fillStyle = bark.dark;
  g.fillRect(0, 0, S, S);
  const cx = S / 2 + (rng() - 0.5) * 8;
  const cy = S / 2 + (rng() - 0.5) * 8;
  // bark rim
  g.fillStyle = bark.base;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  g.fill();
  // wood
  const grd = g.createRadialGradient(cx, cy, 2, cx, cy, S * 0.46);
  grd.addColorStop(0, wood.core);
  grd.addColorStop(0.7, wood.ring);
  grd.addColorStop(1, wood.fresh);
  g.fillStyle = grd;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.455, 0, Math.PI * 2);
  g.fill();
  // growth rings
  for (let r = 6; r < S * 0.45; r += 4 + rng() * 5) {
    g.strokeStyle = hexA(shade(wood.core, 0.78), 0.22 + rng() * 0.25);
    g.lineWidth = 0.8 + rng() * 1.2;
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.15) {
      const rr = r + Math.sin(a * 3 + r) * 0.9;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (a === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // radial checks (drying cracks)
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2;
    g.strokeStyle = hexA(shade(wood.core, 0.55), 0.5);
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8);
    g.lineTo(cx + Math.cos(a) * S * 0.3, cy + Math.sin(a) * S * 0.3);
    g.stroke();
  }
  // saw marks
  for (let i = 0; i < 18; i++) {
    g.strokeStyle = hexA("#ffffff", 0.05);
    g.lineWidth = 2;
    g.beginPath();
    const y = rng() * S;
    g.moveTo(0, y);
    g.lineTo(S, y + (rng() - 0.5) * 20);
    g.stroke();
  }
  return finish(key, c, { aniso: 2 });
}

/* ------------------------------------------------------------ planks */
export function plankTexture(wood) {
  const key = `plank:${wood.ring}`;
  if (cache.has(key)) return cache.get(key);
  const W = 128;
  const H = 512;
  const [c, g] = canvas(W, H);
  const rng = createRng(wood.ring.charCodeAt(2) * 31);
  g.fillStyle = wood.fresh;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 46; i++) {
    let x = rng() * W;
    g.strokeStyle = hexA(rng() < 0.6 ? wood.core : wood.ring, 0.25 + rng() * 0.35);
    g.lineWidth = 0.6 + rng() * 1.6;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= H; y += 16) {
      x += (rng() - 0.5) * 2.4;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // a knot or two
  for (let i = 0; i < 2; i++) {
    const x = 20 + rng() * (W - 40);
    const y = 40 + rng() * (H - 80);
    g.fillStyle = hexA(shade(wood.core, 0.65), 0.75);
    g.beginPath();
    g.ellipse(x, y, 5 + rng() * 4, 8 + rng() * 6, 0, 0, Math.PI * 2);
    g.fill();
  }
  return finish(key, c);
}

/* ------------------------------------------------------------ clothing */
export function plaidTexture(a = "#b3312a", b = "#2a1b1a", line = "#d9b04a") {
  const key = `plaid:${a}:${b}`;
  if (cache.has(key)) return cache.get(key);
  const S = 128;
  const [c, g] = canvas(S, S);
  g.fillStyle = a;
  g.fillRect(0, 0, S, S);
  g.fillStyle = hexA(b, 0.82);
  g.fillRect(0, 0, S, S * 0.38);
  g.fillRect(0, 0, S * 0.38, S);
  g.fillStyle = hexA(b, 0.55);
  g.fillRect(S * 0.55, 0, S * 0.1, S);
  g.fillRect(0, S * 0.55, S, S * 0.1);
  g.fillStyle = hexA(line, 0.7);
  g.fillRect(S * 0.78, 0, 2, S);
  g.fillRect(0, S * 0.78, S, 2);
  // weave
  const img = g.getImageData(0, 0, S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const k = (x + y) % 3 === 0 ? 0.88 : 1;
    img.data[i] *= k;
    img.data[i + 1] *= k;
    img.data[i + 2] *= k;
  }
  g.putImageData(img, 0, 0);
  return finish(key, c, { repeat: [3, 3] });
}

export function canvasClothTexture(base) {
  const key = `cloth:${base}`;
  if (cache.has(key)) return cache.get(key);
  const S = 128;
  const [c, g] = canvas(S, S);
  const rng = createRng(77);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const n = ((x * 7 + y * 3) % 5 === 0 ? -10 : 0) + (rng() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return finish(key, c, { repeat: [2, 2] });
}

/* ------------------------------------------------------------ ground / props */
export function groundDetailTexture() {
  const key = "ground";
  if (cache.has(key)) return cache.get(key);
  const S = 256;
  const [c, g] = canvas(S, S);
  const rng = createRng(4242);
  g.fillStyle = "#e4e4e4";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const v = 175 + rng() * 75;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    const x = rng() * S;
    const y = rng() * S;
    g.fillRect(x, y, 1 + rng() * 2, 2 + rng() * 5);
  }
  for (let i = 0; i < 60; i++) {
    const v = 165 + rng() * 50;
    g.fillStyle = `rgba(${v},${v},${v},0.25)`;
    g.beginPath();
    g.ellipse(rng() * S, rng() * S, 6 + rng() * 18, 4 + rng() * 12, rng() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return finish(key, c, { srgb: false, aniso: 8 });
}

export function boardsTexture(base = "#9c7a55", vertical = true) {
  const key = `boards:${base}:${vertical}`;
  if (cache.has(key)) return cache.get(key);
  const S = 256;
  const [c, g] = canvas(S, S);
  const rng = createRng(base.charCodeAt(1) * 7 + (vertical ? 1 : 2));
  const n = 8;
  for (let i = 0; i < n; i++) {
    const k = 0.86 + rng() * 0.24;
    g.fillStyle = shade(base, k);
    if (vertical) g.fillRect((i * S) / n, 0, S / n, S);
    else g.fillRect(0, (i * S) / n, S, S / n);
    for (let j = 0; j < 14; j++) {
      g.strokeStyle = hexA(shade(base, 0.7), 0.25);
      g.lineWidth = 1;
      g.beginPath();
      if (vertical) {
        const x = (i * S) / n + rng() * (S / n);
        g.moveTo(x, 0);
        g.lineTo(x + (rng() - 0.5) * 4, S);
      } else {
        const y = (i * S) / n + rng() * (S / n);
        g.moveTo(0, y);
        g.lineTo(S, y + (rng() - 0.5) * 4);
      }
      g.stroke();
    }
    g.fillStyle = hexA(shade(base, 0.45), 0.9);
    if (vertical) g.fillRect((i * S) / n, 0, 2, S);
    else g.fillRect(0, (i * S) / n, S, 2);
    // nails
    g.fillStyle = "rgba(40,40,40,0.7)";
    if (vertical) {
      g.fillRect((i * S) / n + S / n / 2, 20, 3, 3);
      g.fillRect((i * S) / n + S / n / 2, S - 24, 3, 3);
    }
  }
  return finish(key, c);
}

export function roofTexture(base = "#8d3b2a") {
  const key = `roof:${base}`;
  if (cache.has(key)) return cache.get(key);
  const S = 256;
  const [c, g] = canvas(S, S);
  for (let x = 0; x < S; x++) {
    const k = 0.78 + 0.32 * (0.5 + 0.5 * Math.sin((x / S) * Math.PI * 2 * 10));
    g.fillStyle = shade(base, k);
    g.fillRect(x, 0, 1, S);
  }
  const rng = createRng(9);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(60,40,30,${0.06 + rng() * 0.1})`;
    g.beginPath();
    g.ellipse(rng() * S, rng() * S, 10 + rng() * 30, 4 + rng() * 10, 0, 0, Math.PI * 2);
    g.fill();
  }
  return finish(key, c);
}

export function beltTexture() {
  const key = "belt";
  if (cache.has(key)) return cache.get(key);
  const W = 64;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = "#2b2b2b";
  g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 16) {
    g.fillStyle = "#3a3a3a";
    g.fillRect(0, y, W, 6);
    g.fillStyle = "#1c1c1c";
    g.fillRect(0, y + 6, W, 2);
  }
  return finish(key, c);
}

export function hazardTexture() {
  const key = "hazard";
  if (cache.has(key)) return cache.get(key);
  const S = 128;
  const [c, g] = canvas(S, S);
  g.fillStyle = "#e3b232";
  g.fillRect(0, 0, S, S);
  g.fillStyle = "#222";
  for (let i = -S; i < S * 2; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 16, 0);
    g.lineTo(i + 16 - S, S);
    g.lineTo(i - S, S);
    g.closePath();
    g.fill();
  }
  return finish(key, c);
}

export function signTexture(text, { bg = "#5a3d24", fg = "#f3e3c2", w = 512, h = 128, font = "bold 64px Georgia, serif" } = {}) {
  const key = `sign:${text}:${bg}`;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = hexA(fg, 0.6);
  g.lineWidth = 6;
  g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 4);
  return finish(key, c);
}

export function notesTexture() {
  const key = "notes";
  if (cache.has(key)) return cache.get(key);
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = "#6e4c2e";
  g.fillRect(0, 0, S, S);
  const rng = createRng(31);
  const papers = [[18, 20, 100, 120, -0.06], [130, 30, 104, 90, 0.05], [40, 150, 90, 86, 0.04], [146, 136, 92, 100, -0.05]];
  for (const [x, y, w, h, r] of papers) {
    g.save();
    g.translate(x + w / 2, y + h / 2);
    g.rotate(r);
    g.fillStyle = "#f1e8d2";
    g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = "#c7362a";
    g.beginPath();
    g.arc(0, -h / 2 + 8, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(60,50,40,0.6)";
    for (let l = 0; l < 6; l++) g.fillRect(-w / 2 + 10, -h / 2 + 20 + l * 13, (w - 20) * (0.5 + rng() * 0.5), 3);
    g.restore();
  }
  return finish(key, c);
}

export function spriteTexture() {
  const key = "sprite";
  if (cache.has(key)) return cache.get(key);
  const S = 64;
  const [c, g] = canvas(S, S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.45, "rgba(255,255,255,0.6)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return finish(key, c, { srgb: false });
}

export function metalTexture(base = "#8a9097") {
  const key = `metal:${base}`;
  if (cache.has(key)) return cache.get(key);
  const S = 128;
  const [c, g] = canvas(S, S);
  const rng = createRng(5);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 200; i++) {
    g.fillStyle = `rgba(255,255,255,${rng() * 0.05})`;
    g.fillRect(0, rng() * S, S, 1);
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(90,60,40,${rng() * 0.12})`;
    g.beginPath();
    g.ellipse(rng() * S, rng() * S, 3 + rng() * 10, 2 + rng() * 6, 0, 0, Math.PI * 2);
    g.fill();
  }
  return finish(key, c);
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
