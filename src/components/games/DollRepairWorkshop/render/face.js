/**
 * The doll's face texture: a 1024×512 canvas wrapped on the head sphere.
 * It draws the skin (porcelain blush, wood grain or cloth weave), the
 * original painted features — at full strength, or faded when the order has
 * faded paint — then the player's paint layer from the session's paint grid,
 * and, while the paint tool is out, dashed guides around the targets.
 */
import * as THREE from "three";
import { canvas, woodTex, fabricTex } from "./textures.js";
import { FACE, featureMask, cellToAE, aeToUV, FADED_ALPHA } from "../engine/plan.js";
import { PAINT_TARGETS } from "../data/dolls.js";

const W = 1024;
const H = 512;

const px = (az, el) => {
  const { u, v } = aeToUV(az, el);
  return [u * W, (1 - v) * H];
};

export function createFace(plan, skinHex, { painted = [], paintColors = [] } = {}) {
  const c = canvas(W, H);
  if (!c) return null;
  const g = c.getContext("2d");
  const small = canvas(FACE.W, FACE.H);
  const sg = small.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // Feature masks rasterised once at a finer resolution for crisp base paint.
  const MW = FACE.W * 2;
  const MH = FACE.H * 2;
  const maskCanvas = {};
  const kinds = ["lips", "brows", "cheeks"];
  for (const f of kinds) {
    const mc = canvas(MW, MH);
    const mg = mc.getContext("2d");
    const img = mg.createImageData(MW, MH);
    const col = hexRgb(PAINT_TARGETS[f].color);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const { az, el } = cellToAE((x + 0.5) / 2, (y + 0.5) / 2);
      let m = featureMask(f, plan, az, el);
      if (f === "cheeks") m *= 0.55;
      const i = (y * MW + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = m * 255;
    }
    mg.putImageData(img, 0, 0);
    maskCanvas[f] = mc;
  }
  const [fx0, fy0] = px(FACE.az0, FACE.el1);
  const [fx1, fy1] = px(FACE.az1, FACE.el0);

  const state = { faded: new Set(), guides: null, grid: null, colors: paintColors, broken: false, crackless: true };

  function drawSkin() {
    if (plan.kind === "puppet") {
      const wt = woodTex("light");
      g.fillStyle = skinHex;
      g.fillRect(0, 0, W, H);
      if (wt) {
        g.globalAlpha = 0.55;
        const img = wt.image;
        for (let x = 0; x < W; x += img.width) for (let y = 0; y < H; y += img.height) g.drawImage(img, x, y);
        g.globalAlpha = 1;
      }
      return;
    }
    g.fillStyle = skinHex;
    g.fillRect(0, 0, W, H);
    if (plan.kind === "cloth") {
      const ft = fabricTex("cotton");
      if (ft) {
        g.globalAlpha = 0.35;
        const img = ft.image;
        for (let x = 0; x < W; x += 128) for (let y = 0; y < H; y += 128) g.drawImage(img, x, y, 128, 128);
        g.globalAlpha = 1;
      }
      // seam down the back of the head
      g.strokeStyle = "rgba(120,80,60,0.6)";
      g.setLineDash([6, 5]);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0.75 * W, 0);
      g.lineTo(0.75 * W, H);
      g.stroke();
      g.setLineDash([]);
      return;
    }
    // soft porcelain/vinyl shading: warmer around the face
    const [cx, cy] = px(0, plan.eyeEl - 0.15);
    const grd = g.createRadialGradient(cx, cy, 10, cx, cy, 260);
    grd.addColorStop(0, "rgba(255,240,235,0.25)");
    grd.addColorStop(1, "rgba(220,170,150,0.08)");
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  }

  function drawEyesPainted() {
    // painted eyes (wooden puppet)
    for (const s of [-1, 1]) {
      const [x, y] = px(s * plan.eyeAz, plan.eyeEl);
      g.fillStyle = "#fbf7ee";
      g.beginPath();
      g.ellipse(x, y, 17, 13, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#3f7fd0";
      g.beginPath();
      g.arc(x + s * -1, y + 1, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#151215";
      g.beginPath();
      g.arc(x + s * -1, y + 1, 4.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(x - 3, y - 3, 2.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#2a1d18";
      g.lineWidth = 2.5;
      g.beginPath();
      g.ellipse(x, y, 17, 13, 0, Math.PI * 1.08, Math.PI * 1.92);
      g.stroke();
    }
  }

  function drawSocketShade() {
    if (plan.kind === "puppet" || plan.kind === "cloth" || plan.kind === "teddy") return;
    for (const s of [-1, 1]) {
      const [x, y] = px(s * plan.eyeAz, plan.eyeEl);
      const grd = g.createRadialGradient(x, y, 6, x, y, 34);
      grd.addColorStop(0, "rgba(150,90,80,0.35)");
      grd.addColorStop(1, "rgba(150,90,80,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, 34, 0, Math.PI * 2);
      g.fill();
    }
    // nostrils
    if (plan.kind !== "baby") {
      for (const s of [-1, 1]) {
        const [x, y] = px(s * 0.035, plan.eyeEl - 0.24);
        g.fillStyle = "rgba(170,100,90,0.45)";
        g.beginPath();
        g.ellipse(x, y, 2.4, 1.6, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  function drawFeatures() {
    g.imageSmoothingEnabled = true;
    for (const f of kinds) {
      if (!plan.paintable.includes(f)) continue;
      g.globalAlpha = state.faded.has(f) ? FADED_ALPHA : 1;
      g.drawImage(maskCanvas[f], fx0, fy0, fx1 - fx0, fy1 - fy0);
    }
    g.globalAlpha = 1;
    if (plan.kind === "cloth" && plan.paintable.includes("lips") && !state.faded.has("lips")) {
      // embroidery stitches across the smile
      g.strokeStyle = "rgba(120,20,40,0.6)";
      g.lineWidth = 1.5;
      for (let k = -6; k <= 6; k++) {
        const az = k * 0.03;
        const [x, y] = px(az, plan.eyeEl - 0.42 + 0.06 * (az / 0.2) ** 2);
        g.beginPath();
        g.moveTo(x - 3, y - 5);
        g.lineTo(x + 3, y + 5);
        g.stroke();
      }
    }
  }

  function drawPaint() {
    if (!state.grid) return;
    const { alpha, color } = state.grid;
    const img = sg.createImageData(FACE.W, FACE.H);
    for (let i = 0; i < alpha.length; i++) {
      const a = alpha[i];
      if (a <= 0) continue;
      const rgb = state.colors[color[i]] || [200, 80, 100];
      img.data[i * 4] = rgb[0];
      img.data[i * 4 + 1] = rgb[1];
      img.data[i * 4 + 2] = rgb[2];
      img.data[i * 4 + 3] = Math.min(255, a * 255);
    }
    sg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(small, fx0, fy0, fx1 - fx0, fy1 - fy0);
  }

  function drawGuides() {
    if (!state.guides) return;
    g.save();
    g.setLineDash([5, 4]);
    g.lineWidth = 1.6;
    g.strokeStyle = "rgba(255,255,255,0.95)";
    g.shadowColor = "rgba(90,40,80,0.8)";
    g.shadowBlur = 3;
    for (const f of state.guides) {
      // contour: march the mask grid and stroke edge cells
      const step = 1;
      for (let y = 0; y < FACE.H; y += step) for (let x = 0; x < FACE.W; x += step) {
        const a = cellToAE(x + 0.5, y + 0.5);
        const m = featureMask(f, plan, a.az, a.el) > 0.5;
        if (!m) continue;
        const r = cellToAE(x + 1.5, y + 0.5);
        const d = cellToAE(x + 0.5, y + 1.5);
        const l = cellToAE(x - 0.5, y + 0.5);
        const u = cellToAE(x + 0.5, y - 0.5);
        const edge = featureMask(f, plan, r.az, r.el) <= 0.5 || featureMask(f, plan, d.az, d.el) <= 0.5 || featureMask(f, plan, l.az, l.el) <= 0.5 || featureMask(f, plan, u.az, u.el) <= 0.5;
        if (!edge) continue;
        if ((x + y) % 3 === 0) continue;
        const [X, Y] = px(a.az, a.el);
        g.fillStyle = "rgba(255,255,255,0.95)";
        g.fillRect(X - 1, Y - 1, 2.2, 2.2);
      }
    }
    g.restore();
  }

  function redraw() {
    drawSkin();
    drawSocketShade();
    if (plan.kind === "puppet") drawEyesPainted();
    drawFeatures();
    drawPaint();
    drawGuides();
    tex.needsUpdate = true;
  }

  return {
    canvas: c,
    texture: tex,
    state,
    setFaded(list) {
      state.faded = new Set(list);
      redraw();
    },
    setGrid(grid, colors) {
      state.grid = grid;
      if (colors) state.colors = colors;
      redraw();
    },
    setGuides(list) {
      state.guides = list && list.length ? list : null;
      redraw();
    },
    redraw,
    /** Small JPEG of the face region for the gallery. */
    snapshot() {
      return c.toDataURL("image/jpeg", 0.7);
    },
    dispose() {
      tex.dispose();
    },
  };
}

export function hexRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
