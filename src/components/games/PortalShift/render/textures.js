/**
 * Portal Shift — procedural canvas textures (no image files, no text).
 * One texture covers one 2 m cell face.
 */
import * as THREE from "three";

function canvas(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")];
}

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

function noise(ctx, size, amount, seed, dark = false) {
  const img = ctx.getImageData(0, 0, size, size);
  const r = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount;
    const v = dark ? n * 0.6 : n;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + v));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + v));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + v));
  }
  ctx.putImageData(img, 0, 0);
}

function finish(c, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Bright portal-friendly panels: 2×2 tiles with soft seams. */
export function whitePanelTexture() {
  const S = 256;
  const [c, x] = canvas(S);
  x.fillStyle = "#e6ebf0";
  x.fillRect(0, 0, S, S);
  const r = rng(7);
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      const l = 228 + Math.floor(r() * 18);
      x.fillStyle = `rgb(${l},${l + 3},${l + 7})`;
      x.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
      const g = x.createLinearGradient(0, j * 128, 0, j * 128 + 128);
      g.addColorStop(0, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(120,130,150,0.12)");
      x.fillStyle = g;
      x.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
    }
  x.strokeStyle = "rgba(70,80,95,0.55)";
  x.lineWidth = 3;
  for (let k = 0; k <= 2; k++) {
    x.beginPath();
    x.moveTo(k * 128, 0);
    x.lineTo(k * 128, S);
    x.moveTo(0, k * 128);
    x.lineTo(S, k * 128);
    x.stroke();
  }
  noise(x, S, 10, 11);
  return finish(c);
}

/** Dark gunmetal panels with horizontal seams, rivets and a little wear. */
export function metalPanelTexture() {
  const S = 256;
  const [c, x] = canvas(S);
  const g = x.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, "#3a4049");
  g.addColorStop(1, "#2a2f37");
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  const r = rng(3);
  for (let i = 0; i < 4; i++) {
    const y = i * 64;
    x.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.03})`;
    x.fillRect(0, y + 2, S, 60);
    x.fillStyle = "rgba(0,0,0,0.55)";
    x.fillRect(0, y, S, 2);
    x.fillStyle = "rgba(255,255,255,0.08)";
    x.fillRect(0, y + 2, S, 1);
    for (const px of [10, S - 12]) {
      x.fillStyle = "rgba(0,0,0,0.5)";
      x.beginPath();
      x.arc(px, y + 12, 3, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = "rgba(255,255,255,0.18)";
      x.beginPath();
      x.arc(px - 1, y + 11, 1.4, 0, Math.PI * 2);
      x.fill();
    }
  }
  x.fillStyle = "rgba(0,0,0,0.45)";
  x.fillRect(S / 2 - 1, 0, 2, S);
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = `rgba(255,255,255,${r() * 0.05})`;
    x.lineWidth = 1;
    const y = r() * S;
    x.beginPath();
    x.moveTo(r() * S, y);
    x.lineTo(r() * S, y + (r() - 0.5) * 4);
    x.stroke();
  }
  noise(x, S, 16, 5, true);
  return finish(c);
}

/** Dark floor grating plates. */
export function floorTexture() {
  const S = 256;
  const [c, x] = canvas(S);
  x.fillStyle = "#23282f";
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      const ox = i * 128, oy = j * 128;
      x.fillStyle = "#2c323a";
      x.fillRect(ox + 4, oy + 4, 120, 120);
      x.strokeStyle = "rgba(0,0,0,0.45)";
      x.lineWidth = 2;
      for (let k = 1; k < 8; k++) {
        x.beginPath();
        x.moveTo(ox + 8, oy + k * 15 + 4);
        x.lineTo(ox + 120, oy + k * 15 + 4);
        x.stroke();
      }
      x.strokeStyle = "rgba(255,255,255,0.05)";
      for (let k = 1; k < 8; k++) {
        x.beginPath();
        x.moveTo(ox + 8, oy + k * 15 + 6);
        x.lineTo(ox + 120, oy + k * 15 + 6);
        x.stroke();
      }
    }
  noise(x, S, 14, 9, true);
  return finish(c);
}

/** Light portal-friendly floor tiles. */
export function whiteFloorTexture() {
  const S = 256;
  const [c, x] = canvas(S);
  x.fillStyle = "#cfd6de";
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const l = 205 + ((i + j) % 2) * 10;
      x.fillStyle = `rgb(${l},${l + 4},${l + 10})`;
      x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
    }
  x.strokeStyle = "rgba(60,70,85,0.5)";
  x.lineWidth = 2;
  x.strokeRect(1, 1, S - 2, S - 2);
  noise(x, S, 10, 13);
  return finish(c);
}

/** Ceiling: dark coffers. */
export function ceilingTexture() {
  const S = 128;
  const [c, x] = canvas(S);
  x.fillStyle = "#1c2027";
  x.fillRect(0, 0, S, S);
  x.fillStyle = "#252a32";
  x.fillRect(8, 8, S - 16, S - 16);
  x.strokeStyle = "rgba(0,0,0,0.6)";
  x.lineWidth = 3;
  x.strokeRect(8, 8, S - 16, S - 16);
  noise(x, S, 12, 21, true);
  return finish(c);
}

/** Cube faces: framed metal with a glowing core cross (emissive map separately). */
export function cubeTextures(kind) {
  const S = 128;
  const [c, x] = canvas(S);
  x.fillStyle = kind === "reflector" ? "#4b4f5a" : "#5a6070";
  x.fillRect(0, 0, S, S);
  x.fillStyle = "#2a2e36";
  x.fillRect(14, 14, S - 28, S - 28);
  x.fillStyle = "#8a92a2";
  for (const [a, b] of [[0, 0], [S - 22, 0], [0, S - 22], [S - 22, S - 22]]) x.fillRect(a, b, 22, 22);
  x.strokeStyle = "rgba(0,0,0,0.6)";
  x.lineWidth = 2;
  x.strokeRect(14, 14, S - 28, S - 28);
  noise(x, S, 14, 31);
  const [e, y] = canvas(S);
  y.fillStyle = "#000";
  y.fillRect(0, 0, S, S);
  y.fillStyle = "#fff";
  if (kind === "reflector") {
    y.beginPath();
    y.arc(S / 2, S / 2, 20, 0, Math.PI * 2);
    y.lineWidth = 6;
    y.strokeStyle = "#fff";
    y.stroke();
  } else {
    y.fillRect(S / 2 - 4, 26, 8, S - 52);
    y.fillRect(26, S / 2 - 4, S - 52, 8);
    y.beginPath();
    y.arc(S / 2, S / 2, 12, 0, Math.PI * 2);
    y.fill();
  }
  return { map: finish(c), emissive: finish(e, false) };
}

/** Soft round glow for sprites/particles. */
export function glowTexture() {
  const S = 64;
  const [c, x] = canvas(S);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return finish(c, false);
}

/** Hazard stripes for the rim of goo pits and door frames. */
export function stripeTexture() {
  const S = 64;
  const [c, x] = canvas(S);
  x.fillStyle = "#1b1d22";
  x.fillRect(0, 0, S, S);
  x.fillStyle = "#c9a227";
  for (let i = -S; i < S * 2; i += 16) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + 8, 0);
    x.lineTo(i + 8 - S, S);
    x.lineTo(i - S, S);
    x.closePath();
    x.fill();
  }
  return finish(c, true, true);
}
