/**
 * Lumberjack Life — tool models. Each tool in data/equipment.js has its own
 * look (handle wood, grip wrap, head steel/paint, size; chainsaw body colour,
 * bar length) so upgrades are visible, not just numbers.
 *
 * Axe frame:      origin = bottom of the handle (where the right hand grips),
 *                 handle along +Y, cutting edge facing +Z.
 *                 AXE_EDGE is the local point that touches the wood.
 * Chainsaw frame: origin = rear handle grip, bar along +Z, top of body +Y.
 */
import * as THREE from "three";
import { metalTexture } from "./textures.js";

export const AXE_LEN = 0.78; // handle length (grip end → head top)
export const AXE_HEAD_Y = 0.7;
export const AXE_EDGE = new THREE.Vector3(0, AXE_HEAD_Y - 0.02, 0.15);

const std = (color, rough = 0.6, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

export function buildAxe(look, { shadows = true } = {}) {
  const g = new THREE.Group();
  const disp = [];
  const mk = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadows;
    disp.push(geo);
    g.add(m);
    return m;
  };
  const handleMat = std(look.handle, look.pro ? 0.4 : 0.7, 0);
  const gripMat = std(look.grip, 0.85);
  const headMat = std(look.head, look.rust ? 0.75 : 0.35, look.rust ? 0.35 : 0.8, { map: metalTexture(look.head) });
  const edgeMat = std(look.edge, 0.25, 0.95);
  disp.push(handleMat, gripMat, headMat, edgeMat);
  // handle: slightly S-curved, swelling toward the knob
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = 0.017 + 0.006 * Math.sin(t * Math.PI) + (t < 0.06 ? 0.008 : 0);
    pts.push(new THREE.Vector2(r, t * AXE_LEN));
  }
  const hg = new THREE.LatheGeometry(pts, 8);
  const p = hg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / AXE_LEN;
    p.setZ(i, p.getZ(i) + Math.sin(y * Math.PI * 1.6) * 0.012);
  }
  hg.computeVertexNormals();
  mk(hg, handleMat);
  // knob + grip wrap
  const knob = new THREE.SphereGeometry(0.026, 10, 8);
  knob.scale(1, 0.7, 1.25);
  mk(knob, handleMat);
  const wrap = new THREE.CylinderGeometry(0.0225, 0.0235, 0.2, 10);
  wrap.translate(0, 0.13, 0.002);
  mk(wrap, gripMat);
  // head: extruded profile (poll at −Z, curved bit at +Z)
  const s = look.headSize || 1;
  const shape = new THREE.Shape();
  shape.moveTo(-0.045 * s, -0.035 * s);
  shape.lineTo(-0.045 * s, 0.035 * s);
  shape.lineTo(0.03 * s, 0.03 * s);
  shape.quadraticCurveTo(0.09 * s, 0.045 * s, 0.13 * s, 0.075 * s);
  shape.quadraticCurveTo(0.155 * s, 0.0, 0.13 * s, -0.075 * s);
  shape.quadraticCurveTo(0.09 * s, -0.045 * s, 0.03 * s, -0.03 * s);
  shape.closePath();
  const head = new THREE.ExtrudeGeometry(shape, { depth: 0.032 * s, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 10 });
  head.translate(0, 0, -0.016 * s);
  // shape is in XY with the bit along +X → rotate so the bit faces +Z and the head is vertical
  head.rotateY(-Math.PI / 2);
  head.rotateZ(0);
  // after rotateY(−90°): +X→+Z ; shape Y stays Y; extrusion (Z) → X
  head.translate(0, AXE_HEAD_Y, 0.01);
  mk(head, headMat);
  // bright honed edge
  const edgeShape = new THREE.Shape();
  edgeShape.moveTo(0.118 * s, 0.07 * s);
  edgeShape.quadraticCurveTo(0.158 * s, 0.0, 0.118 * s, -0.07 * s);
  edgeShape.quadraticCurveTo(0.142 * s, 0.0, 0.118 * s, 0.07 * s);
  const edge = new THREE.ExtrudeGeometry(edgeShape, { depth: 0.036 * s, bevelEnabled: false, curveSegments: 8 });
  edge.translate(0, 0, -0.018 * s);
  edge.rotateY(-Math.PI / 2);
  edge.translate(0, AXE_HEAD_Y, 0.01);
  mk(edge, edgeMat);
  if (look.pro) {
    const band = new THREE.CylinderGeometry(0.024, 0.024, 0.05, 10);
    band.translate(0, AXE_HEAD_Y - 0.075, 0);
    mk(band, std("#c7362a", 0.4, 0.3));
  }
  g.userData.dispose = () => disp.forEach((d) => d.dispose());
  return g;
}

export const SAW_FRONT_GRIP = new THREE.Vector3(0.0, 0.17, 0.2);

export function buildChainsaw(look, bar, { shadows = true } = {}) {
  const g = new THREE.Group();
  const disp = [];
  const s = look.size || 1;
  const mk = (geo, mat, parent = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadows;
    disp.push(geo);
    parent.add(m);
    return m;
  };
  const body = std(look.body, 0.45, 0.1);
  const dark = std(look.accent, 0.6, 0.2);
  const steel = std(look.bar, 0.3, 0.9, { map: metalTexture(look.bar) });
  disp.push(body, dark, steel);
  // engine housing
  const hb = new THREE.BoxGeometry(0.13 * s, 0.17 * s, 0.3 * s, 2, 2, 2);
  const hp = hb.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    // round the box a bit
    const x = hp.getX(i);
    const y = hp.getY(i);
    const z = hp.getZ(i);
    const k = 1 - 0.18 * (Math.abs(x) / (0.065 * s)) * (Math.abs(y) / (0.085 * s));
    hp.setXYZ(i, x * k, y, z);
  }
  hb.computeVertexNormals();
  hb.translate(0, 0.06 * s, 0.12 * s);
  mk(hb, body);
  // top cover + air filter
  const top = new THREE.BoxGeometry(0.11 * s, 0.04 * s, 0.2 * s);
  top.translate(0, 0.16 * s, 0.1 * s);
  mk(top, dark);
  // rear handle (loop)
  const rear = new THREE.TorusGeometry(0.07 * s, 0.014 * s, 6, 14, Math.PI * 1.1);
  rear.rotateY(Math.PI / 2);
  rear.rotateX(Math.PI / 2 + 0.3);
  rear.translate(0, 0.03 * s, -0.04 * s);
  mk(rear, dark);
  const grip = new THREE.CylinderGeometry(0.017 * s, 0.017 * s, 0.12 * s, 8);
  grip.rotateX(Math.PI / 2);
  grip.translate(0, 0.0, -0.02 * s);
  mk(grip, dark);
  // front wrap handle
  const front = new THREE.TorusGeometry(0.11 * s, 0.013 * s, 6, 16, Math.PI * 1.15);
  front.rotateZ(-0.1);
  front.translate(0, 0.08 * s, 0.2 * s);
  mk(front, dark);
  // chain brake guard
  const guard = new THREE.BoxGeometry(0.1 * s, 0.09 * s, 0.012 * s);
  guard.translate(0, 0.17 * s, 0.27 * s);
  mk(guard, dark);
  // bar
  const L = bar;
  const barShape = new THREE.Shape();
  barShape.moveTo(0, -0.032);
  barShape.lineTo(L - 0.03, -0.026);
  barShape.absarc(L - 0.03, 0, 0.026, -Math.PI / 2, Math.PI / 2, false);
  barShape.lineTo(0, 0.032);
  barShape.closePath();
  const barG = new THREE.ExtrudeGeometry(barShape, { depth: 0.008, bevelEnabled: false, curveSegments: 10 });
  barG.translate(0, 0, -0.004);
  barG.rotateY(-Math.PI / 2);
  barG.translate(0, 0.02 * s, 0.25 * s);
  mk(barG, steel);
  // chain: a dark loop slightly bigger than the bar; its texture scrolls while cutting
  const chainTex = chainTexture();
  const chainMat = new THREE.MeshStandardMaterial({ map: chainTex, roughness: 0.5, metalness: 0.7, color: "#999" });
  disp.push(chainMat);
  const outer = new THREE.Shape();
  outer.moveTo(-0.01, -0.04);
  outer.lineTo(L - 0.03, -0.034);
  outer.absarc(L - 0.03, 0, 0.034, -Math.PI / 2, Math.PI / 2, false);
  outer.lineTo(-0.01, 0.04);
  outer.lineTo(-0.01, 0.032);
  outer.lineTo(L - 0.03, 0.026);
  outer.absarc(L - 0.03, 0, 0.026, Math.PI / 2, -Math.PI / 2, true);
  outer.lineTo(-0.01, -0.032);
  outer.closePath();
  const chainG = new THREE.ExtrudeGeometry(outer, { depth: 0.011, bevelEnabled: false, curveSegments: 12 });
  chainG.translate(0, 0, -0.0055);
  chainG.rotateY(-Math.PI / 2);
  chainG.translate(0, 0.02 * s, 0.25 * s);
  // planar UVs along the bar so the texture can scroll
  const cp = chainG.attributes.position;
  const cuv = chainG.attributes.uv;
  for (let i = 0; i < cp.count; i++) cuv.setXY(i, cp.getZ(i) * 12, cp.getY(i) * 12);
  const chain = mk(chainG, chainMat);
  // pull-start handle
  const pull = new THREE.CylinderGeometry(0.009, 0.009, 0.05, 6);
  pull.rotateX(Math.PI / 2);
  pull.translate(-0.075 * s, 0.13 * s, 0.05 * s);
  mk(pull, dark);
  g.userData.chainTex = chainTex;
  g.userData.dispose = () => disp.forEach((d) => d.dispose());
  return g;
}

let chainTexCache = null;
function chainTexture() {
  if (chainTexCache) return chainTexCache;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 16;
  const x = c.getContext("2d");
  x.fillStyle = "#3a3a3a";
  x.fillRect(0, 0, 64, 16);
  for (let i = 0; i < 64; i += 8) {
    x.fillStyle = "#b8bcc0";
    x.fillRect(i, 2, 4, 12);
    x.fillStyle = "#222";
    x.fillRect(i + 4, 5, 3, 6);
  }
  chainTexCache = new THREE.CanvasTexture(c);
  chainTexCache.wrapS = chainTexCache.wrapT = THREE.RepeatWrapping;
  return chainTexCache;
}

export function disposeToolCaches() {
  if (chainTexCache) {
    chainTexCache.dispose();
    chainTexCache = null;
  }
}
