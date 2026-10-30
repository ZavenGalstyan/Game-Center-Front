/**
 * Procedural canvas textures (all original, drawn at runtime — no image
 * files). Cached per key; `disposeTextures()` frees them with the world.
 */
import * as THREE from "three";

const cache = new Map();
let seed = 1;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function canvasTex(key, size, draw, { repeat = true, srgb = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  seed = 7 + key.length * 131;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d");
  draw(x, size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}
const speckle = (x, S, n, cols, r0 = 1, r1 = 3) => {
  for (let i = 0; i < n; i++) {
    x.fillStyle = cols[Math.floor(rnd() * cols.length)];
    const r = r0 + rnd() * (r1 - r0);
    x.fillRect(rnd() * S, rnd() * S, r, r);
  }
};

export function surfaceTex(kind, pal) {
  return canvasTex(`surf-${kind}-${pal.join()}`, 128, (x, S) => {
    const [base, dark, light] = pal;
    x.fillStyle = base;
    x.fillRect(0, 0, S, S);
    switch (kind) {
      case "grass":
        speckle(x, S, 420, [dark, light], 1, 3);
        x.globalAlpha = 0.35;
        for (let i = 0; i < 60; i++) {
          x.strokeStyle = light;
          const px = rnd() * S, py = rnd() * S;
          x.beginPath();
          x.moveTo(px, py);
          x.lineTo(px + rnd() * 4 - 2, py - 5);
          x.stroke();
        }
        x.globalAlpha = 1;
        break;
      case "dirt":
        speckle(x, S, 260, [dark, light], 1, 4);
        x.fillStyle = dark;
        for (let y = 20; y < S; y += 34) {
          x.globalAlpha = 0.25;
          x.fillRect(0, y + rnd() * 6, S, 3);
        }
        x.globalAlpha = 1;
        speckle(x, S, 18, ["rgba(255,255,255,0.18)"], 4, 8);
        break;
      case "wood": {
        const h = S / 4;
        for (let i = 0; i < 4; i++) {
          x.fillStyle = i % 2 ? base : light;
          x.fillRect(0, i * h, S, h - 3);
          x.fillStyle = dark;
          x.fillRect(0, i * h + h - 3, S, 3);
          x.globalAlpha = 0.25;
          for (let k = 0; k < 5; k++) x.fillRect(rnd() * S, i * h + 4 + rnd() * (h - 10), 20 + rnd() * 40, 1.5);
          x.globalAlpha = 1;
          x.fillStyle = dark;
          x.beginPath();
          x.arc(10 + (i * 37) % (S - 20), i * h + h / 2, 2.2, 0, 7);
          x.arc(S - 14 - (i * 23) % 30, i * h + h / 2, 2.2, 0, 7);
          x.fill();
        }
        break;
      }
      case "brick":
      case "sand": {
        const rows = kind === "brick" ? 4 : 3;
        const h = S / rows;
        for (let r = 0; r < rows; r++) {
          const off = (r % 2) * (S / 4);
          for (let c = -1; c < 3; c++) {
            const bx = c * (S / 2) + off;
            const v = rnd() * 0.12 - 0.06;
            x.fillStyle = v > 0 ? light : base;
            x.globalAlpha = 0.6 + rnd() * 0.4;
            x.fillRect(bx + 2, r * h + 2, S / 2 - 4, h - 4);
            x.globalAlpha = 1;
          }
          x.fillStyle = dark;
          x.fillRect(0, r * h, S, 2);
          for (let c = -1; c < 3; c++) x.fillRect(c * (S / 2) + off, r * h, 2, h);
        }
        speckle(x, S, 120, [dark], 1, 2);
        if (kind === "sand") {
          x.strokeStyle = dark;
          x.globalAlpha = 0.5;
          x.lineWidth = 2;
          x.strokeRect(S * 0.3, S * 0.42, S * 0.4, S * 0.18);
          x.beginPath();
          x.arc(S / 2, S * 0.51, 6, 0, 7);
          x.stroke();
          x.globalAlpha = 1;
        }
        break;
      }
      case "basalt":
        speckle(x, S, 300, [dark, light], 1, 3);
        x.strokeStyle = "rgba(255,110,30,0.55)";
        x.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
          let px = rnd() * S, py = rnd() * S;
          x.beginPath();
          x.moveTo(px, py);
          for (let k = 0; k < 5; k++) x.lineTo((px += rnd() * 24 - 12), (py += rnd() * 24 - 6));
          x.stroke();
        }
        break;
      case "moss":
        speckle(x, S, 380, [dark, light], 1, 3);
        speckle(x, S, 30, ["rgba(140,255,230,0.35)"], 1, 2);
        break;
      default:
        speckle(x, S, 200, [dark, light], 1, 3);
    }
  });
}

/** wooden crate faces: n normal · b bounce · h heart · s cracked stone wall */
export function crateTex(type) {
  return canvasTex(`crate-${type}`, 128, (x, S) => {
    if (type === "s") {
      x.fillStyle = "#9c8e74";
      x.fillRect(0, 0, S, S);
      speckle(x, S, 200, ["#857760", "#b3a588"], 1, 3);
      x.strokeStyle = "#4a3f30";
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(20, 10);
      x.lineTo(50, 50);
      x.lineTo(40, 80);
      x.lineTo(70, 118);
      x.moveTo(50, 50);
      x.lineTo(96, 40);
      x.lineTo(118, 70);
      x.moveTo(40, 80);
      x.lineTo(90, 90);
      x.stroke();
      x.fillStyle = "rgba(255,230,140,0.85)";
      x.font = "bold 22px sans-serif";
      x.textAlign = "center";
      x.fillText("?", S - 22, 28);
      return;
    }
    const wood = type === "b" ? "#3f9ad6" : type === "h" ? "#e2577a" : "#c98a3f";
    const dark = type === "b" ? "#1f5e8e" : type === "h" ? "#8e2440" : "#7a4a1c";
    const light = type === "b" ? "#7cc3ef" : type === "h" ? "#f18ea6" : "#e0a95f";
    x.fillStyle = wood;
    x.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = i % 2 ? wood : light;
      x.globalAlpha = 0.35;
      x.fillRect(0, i * 32 + 2, S, 28);
    }
    x.globalAlpha = 1;
    x.fillStyle = dark;
    x.fillRect(0, 0, S, 12);
    x.fillRect(0, S - 12, S, 12);
    x.fillRect(0, 0, 12, S);
    x.fillRect(S - 12, 0, 12, S);
    x.lineWidth = 9;
    x.strokeStyle = dark;
    x.beginPath();
    x.moveTo(10, 10);
    x.lineTo(S - 10, S - 10);
    x.stroke();
    x.fillStyle = "#e8d7a8";
    for (const [a, b] of [[6, 6], [S - 6, 6], [6, S - 6], [S - 6, S - 6]]) {
      x.beginPath();
      x.arc(a, b, 3, 0, 7);
      x.fill();
    }
    if (type === "b") {
      x.fillStyle = "#fff";
      x.strokeStyle = "#1f5e8e";
      x.lineWidth = 4;
      for (const yy of [40, 72]) {
        x.beginPath();
        x.moveTo(S / 2, yy - 16);
        x.lineTo(S / 2 + 22, yy + 8);
        x.lineTo(S / 2 - 22, yy + 8);
        x.closePath();
        x.stroke();
        x.fill();
      }
    } else if (type === "h") {
      x.fillStyle = "#fff";
      x.beginPath();
      const cx = S / 2, cy = S / 2 + 4;
      x.moveTo(cx, cy + 24);
      x.bezierCurveTo(cx - 40, cy - 2, cx - 20, cy - 34, cx, cy - 14);
      x.bezierCurveTo(cx + 20, cy - 34, cx + 40, cy - 2, cx, cy + 24);
      x.fill();
    }
  }, { repeat: false });
}

export function radialTex(key, stops) {
  return canvasTex(key, 128, (x, S) => {
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    for (const [o, c] of stops) g.addColorStop(o, c);
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
  }, { repeat: false });
}

export function swirlTex() {
  return canvasTex("swirl", 256, (x, S) => {
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, "#fffbe0");
    g.addColorStop(0.35, "#7ff0c8");
    g.addColorStop(0.75, "#1aa0a0");
    g.addColorStop(1, "rgba(10,60,80,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    x.translate(S / 2, S / 2);
    x.strokeStyle = "rgba(255,255,255,0.55)";
    x.lineWidth = 5;
    for (let a = 0; a < 5; a++) {
      x.rotate((Math.PI * 2) / 5);
      x.beginPath();
      for (let r = 4; r < S / 2 - 8; r += 2) {
        const t = r / 22;
        x.lineTo(Math.cos(t) * r, Math.sin(t) * r);
      }
      x.stroke();
    }
  }, { repeat: false });
}

export function liquidTex(kind) {
  return canvasTex(`liquid-${kind}`, 128, (x, S) => {
    const lava = kind === "lava";
    x.fillStyle = lava ? "#e84a10" : kind === "swamp" ? "#2f5a4a" : kind === "night" ? "#1b2c5a" : "#2a9fd6";
    x.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {
      x.strokeStyle = lava ? (rnd() < 0.5 ? "#ffb02e" : "#9e1e05") : "rgba(255,255,255," + (0.12 + rnd() * 0.3) + ")";
      x.lineWidth = lava ? 3 + rnd() * 4 : 1.5 + rnd() * 2;
      const px = rnd() * S, py = rnd() * S, w = 8 + rnd() * 22;
      x.beginPath();
      x.moveTo(px, py);
      x.quadraticCurveTo(px + w / 2, py - 4, px + w, py);
      x.stroke();
    }
  });
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
