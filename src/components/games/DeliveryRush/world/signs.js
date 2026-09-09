/**
 * Delivery Rush — shopfront sign atlas.
 *
 * Readable street signage is what stops a stylised city from reading as
 * "coloured boxes", but a font file per district is not worth the download. So
 * every fictional business name is drawn once into a single 1024px canvas
 * atlas with the browser's own fonts, and every sign in the city is a textured
 * quad pointing at one cell of it — one texture, one draw call, real words.
 *
 * All names are invented; nothing here references a real brand.
 */

import * as THREE from "three";
import { MeshAcc } from "./geom.js";

export const BUSINESSES = [
  { name: "CITY CAFE", kind: "cafe", bg: "#2f5d4a", fg: "#ffe9c2" },
  { name: "FRESH MART", kind: "market", bg: "#2f6f9e", fg: "#eaf6ff" },
  { name: "QUICK BITES", kind: "food", bg: "#c8452f", fg: "#ffe9c2" },
  { name: "URBAN SHOP", kind: "shop", bg: "#4a4358", fg: "#f0e6ff" },
  { name: "METRO MARKET", kind: "market", bg: "#1f6b52", fg: "#e6fff2" },
  { name: "GOLDEN NOODLE", kind: "food", bg: "#b8801f", fg: "#fff6dd" },
  { name: "BLUE DOOR BOOKS", kind: "shop", bg: "#26507f", fg: "#e8f0ff" },
  { name: "DAILY BREAD", kind: "bakery", bg: "#9a5b2c", fg: "#fff2dd" },
  { name: "NORTH SIDE DELI", kind: "food", bg: "#6a2f3f", fg: "#ffe4e8" },
  { name: "PIXEL GAMES", kind: "shop", bg: "#3a2f6a", fg: "#d8ccff" },
  { name: "GREEN LEAF", kind: "market", bg: "#3f7a3a", fg: "#eaffe6" },
  { name: "THE CORNER BAR", kind: "bar", bg: "#2a2a33", fg: "#ffcf7a" },
  { name: "SUNSET DINER", kind: "food", bg: "#c2603a", fg: "#fff0d8" },
  { name: "HARBOR SUPPLY", kind: "depot", bg: "#3d5a66", fg: "#e0f2f7" },
  { name: "RAPID PARTS", kind: "depot", bg: "#5a5f66", fg: "#ffe08a" },
  { name: "NIGHT OWL", kind: "bar", bg: "#1c2340", fg: "#7ae8ff" },
];

const COLS = 4;
const ROWS = 4;
let _texture = null;

/** Build (once) the canvas atlas holding all 16 sign faces. */
export function signAtlas() {
  if (_texture) return _texture;
  const S = 1024;
  const cw = S / COLS;
  const ch = S / ROWS;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, S, S);

  BUSINESSES.forEach((b, i) => {
    const cx = (i % COLS) * cw;
    const cy = Math.floor(i / COLS) * ch;
    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = b.bg;
    ctx.fillRect(0, 0, cw, ch);
    // inner border so the sign reads as a physical panel
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 6;
    ctx.strokeRect(9, 9, cw - 18, ch - 18);

    const words = b.name.split(" ");
    const lines = words.length > 2 ? [words.slice(0, -1).join(" "), words[words.length - 1]] : [b.name];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = b.fg;
    const size = lines.length > 1 ? 46 : 58;
    ctx.font = `800 ${size}px "Inter", "Segoe UI", system-ui, sans-serif`;
    lines.forEach((line, li) => {
      const y = ch / 2 + (li - (lines.length - 1) / 2) * (size + 8);
      // squeeze long names rather than letting them clip the panel
      const w = ctx.measureText(line).width;
      const max = cw - 40;
      if (w > max) {
        ctx.save();
        ctx.translate(cw / 2, y);
        ctx.scale(max / w, 1);
        ctx.fillText(line, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(line, cw / 2, y);
      }
    });
    ctx.restore();
  });

  _texture = new THREE.CanvasTexture(canvas);
  _texture.colorSpace = THREE.SRGBColorSpace;
  _texture.anisotropy = 4;
  _texture.generateMipmaps = true;
  _texture.minFilter = THREE.LinearMipmapLinearFilter;
  return _texture;
}

export function signUV(index) {
  const i = ((index % BUSINESSES.length) + BUSINESSES.length) % BUSINESSES.length;
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const pad = 0.004;
  return {
    u0: col / COLS + pad,
    v0: 1 - (row + 1) / ROWS + pad,
    u1: (col + 1) / COLS - pad,
    v1: 1 - row / ROWS - pad,
  };
}

/**
 * Accumulator for textured sign quads. Kept separate from MeshAcc because it
 * is the only channel that needs UVs — everything else is vertex-coloured.
 */
export class SignAcc {
  constructor() {
    this.acc = new MeshAcc(512);
    this.uv = [];
  }

  get empty() {
    return this.acc.empty;
  }

  /**
   * A sign panel centred at (x, y, z), `w` x `h`, facing `yaw` (0 = +Z).
   * `tint` is the linear RGB the texture is multiplied by, so night districts
   * can push their signage to full brightness.
   */
  panel(x, y, z, w, h, yaw, index, tint = [1, 1, 1]) {
    this.acc.add("quad", [x, y, z], [w, h, 1], tint, yaw);
    const { u0, v0, u1, v1 } = signUV(index);
    // PlaneGeometry non-indexed vertex order: (0,1)(1,1)(0,0) / (1,1)(1,0)(0,0)
    this.uv.push(u0, v1, u1, v1, u0, v0, u1, v1, u1, v0, u0, v0);
    return this;
  }

  build() {
    const g = this.acc.build();
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    return g;
  }
}
