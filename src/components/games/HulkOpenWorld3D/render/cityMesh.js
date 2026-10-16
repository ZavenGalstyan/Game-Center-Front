/**
 * Hulk: Open World 3D — static city geometry.
 *
 * Built once from the generated city (engine/city.js) and split into 192 m
 * CHUNKS: every chunk merges its buildings per facade skin (+ one roof /
 * concrete mesh), so the whole city is ~100 draw calls, and chunks beyond
 * the fog are hidden each frame (streaming-style distance culling).
 * Facades use world-space UVs (windows line up floor by floor); the ground
 * is one terrain mesh (hills, river channel) painted with the city plan and
 * a world-space detail grain; trees and containers are instanced; road
 * markings and crosswalks are merged quads.
 */
import * as THREE from "three";
import { PITCH, N, ROAD_HW, LOT, RIVER, BRIDGES, SIZE, HIGHWAY, blockDistrict } from "../engine/city.js";
import { facade, FACADE, roofTex, gableTex, detailTex, containerTex, groundMap, billboardTex, stripeTex } from "./textures.js";

const CHUNK = 192;

class Acc {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.idx = [];
    this.col = null;
  }
  quad(a, b, c, d, n, ua, ub, uc, ud) {
    const o = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    for (let i = 0; i < 4; i++) this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(...ua, ...ub, ...uc, ...ud);
    this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  tri(a, b, c, n, ua, ub, uc) {
    const o = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(...ua, ...ub, ...uc);
    this.idx.push(o, o + 1, o + 2);
  }
  geo() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
/** box sides (+ optional top) with world UVs: u = metres along the face / tw, v = height / th */
function boxSides(A, x0, y0, z0, x1, y1, z1, tw, th, { top = false, sides = true, uo = 0 } = {}) {
  if (sides) {
    // +Z
    A.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [(x0 + uo) / tw, y0 / th], [(x1 + uo) / tw, y0 / th], [(x1 + uo) / tw, y1 / th], [(x0 + uo) / tw, y1 / th]);
    // -Z
    A.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [(-x1 + uo) / tw, y0 / th], [(-x0 + uo) / tw, y0 / th], [(-x0 + uo) / tw, y1 / th], [(-x1 + uo) / tw, y1 / th]);
    // +X
    A.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [(-z1 + uo) / tw, y0 / th], [(-z0 + uo) / tw, y0 / th], [(-z0 + uo) / tw, y1 / th], [(-z1 + uo) / tw, y1 / th]);
    // -X
    A.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [(z0 + uo) / tw, y0 / th], [(z1 + uo) / tw, y0 / th], [(z1 + uo) / tw, y1 / th], [(z0 + uo) / tw, y1 / th]);
  }
  if (top) A.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [x0 / 8, z1 / 8], [x1 / 8, z1 / 8], [x1 / 8, z0 / 8], [x0 / 8, z0 / 8]);
}
const fullBox = (A, x0, y0, z0, x1, y1, z1, s = 4) => boxSides(A, x0, y0, z0, x1, y1, z1, s, s, { top: true });

/** world-space detail grain multiplied over a material (ground, concrete) */
function withDetail(material, scale = 0.25, strength = 1) {
  const dt = detailTex();
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: dt };
    sh.uniforms.uDScale = { value: scale };
    sh.uniforms.uDStr = { value: strength };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWPos;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uDetail;\nuniform float uDScale;\nuniform float uDStr;")
      .replace(
        "#include <map_fragment>",
        "#include <map_fragment>\nvec3 dn = abs(normalize(cross(dFdx(vWPos), dFdy(vWPos))));\nvec2 duv = dn.y > 0.6 ? vWPos.xz : (dn.x > dn.z ? vWPos.zy : vWPos.xy);\nfloat dd = texture2D(uDetail, duv * uDScale).r * 0.75 + texture2D(uDetail, duv * uDScale * 0.13).r * 0.5;\ndiffuseColor.rgb *= mix(1.0, dd * 1.65, uDStr);",
      );
  };
  material.customProgramCacheKey = () => `detail${scale}${strength}`;
  return material;
}

export function buildCityMesh(C, { shadows = true, quality = "high" } = {}) {
  const root = new THREE.Group();
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  const chunks = new Map(); // key → { group, cx, cz }
  const chunkOf = (x, z) => {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const key = `${cx},${cz}`;
    if (!chunks.has(key)) chunks.set(key, { key, cx, cz, accs: new Map(), group: new THREE.Group() });
    return chunks.get(key);
  };
  const accOf = (ch, k) => {
    if (!ch.accs.has(k)) ch.accs.set(k, new Acc());
    return ch.accs.get(k);
  };

  /* ---------------------------------------------------------------- materials */
  const M = {};
  for (const skin of Object.keys(FACADE)) {
    const f = facade(skin);
    const glassy = FACADE[skin].curtain;
    M[skin] = keep(new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: "#ffd9a0", emissiveIntensity: 0.16, roughness: glassy ? 0.28 : 0.82, metalness: glassy ? 0.35 : 0.02 }));
  }
  M.roof = keep(new THREE.MeshStandardMaterial({ map: roofTex(), roughness: 0.95 }));
  M.gable = keep(new THREE.MeshStandardMaterial({ map: gableTex(), roughness: 0.85 }));
  M.vault = keep(new THREE.MeshStandardMaterial({ color: "#7d8578", roughness: 0.55, metalness: 0.5 }));
  M.concrete = keep(withDetail(new THREE.MeshStandardMaterial({ color: "#a29d93", roughness: 0.9 }), 0.35, 0.9));
  M.darkConcrete = keep(withDetail(new THREE.MeshStandardMaterial({ color: "#6e6b65", roughness: 0.9 }), 0.35, 0.9));
  M.metalDark = keep(new THREE.MeshStandardMaterial({ color: "#3a3f45", roughness: 0.55, metalness: 0.6 }));
  M.rust = keep(new THREE.MeshStandardMaterial({ color: "#8b5a3a", roughness: 0.85, metalness: 0.3 }));
  M.white = keep(new THREE.MeshStandardMaterial({ color: "#e9e6dc", roughness: 0.6 }));
  M.red = keep(new THREE.MeshStandardMaterial({ color: "#b8332a", roughness: 0.6 }));
  M.bridge = keep(new THREE.MeshStandardMaterial({ color: "#a33b2c", roughness: 0.55, metalness: 0.4 }));
  M.trim = keep(new THREE.MeshStandardMaterial({ color: "#d8d3c8", roughness: 0.75 }));

  /* ---------------------------------------------------------------- buildings */
  for (const b of C.buildings) {
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const ch = chunkOf(cx, cz);
    const skin = FACADE[b.skin] ? b.skin : "concrete";
    const F = FACADE[skin];
    const A = accOf(ch, skin);
    const roofA = accOf(ch, "roof");
    const trimA = accOf(ch, "trim");
    const uo = (b.seed % 7) * 1.7;
    if (b.roof === "hall") {
      for (const t of b.tiers) boxSides(A, t.x0, t.y0, t.z0, t.x1, t.y1, t.z1, F.w, F.h, { top: true, uo });
      continue;
    }
    for (let i = 0; i < b.tiers.length; i++) {
      const t = b.tiers[i];
      boxSides(A, t.x0, t.y0, t.z0, t.x1, t.y1, t.z1, F.w, F.h, { uo });
      if (b.roof === "flat" || i < b.tiers.length - 1) {
        // roof deck + parapet
        roofA.quad([t.x0, t.y1, t.z1], [t.x1, t.y1, t.z1], [t.x1, t.y1, t.z0], [t.x0, t.y1, t.z0], [0, 1, 0], [t.x0 / 10, t.z1 / 10], [t.x1 / 10, t.z1 / 10], [t.x1 / 10, t.z0 / 10], [t.x0 / 10, t.z0 / 10]);
        const p = 0.35;
        const ph = b.kind === "house" || b.kind === "barn" ? 0 : 0.9;
        if (ph > 0) {
          boxSides(trimA, t.x0, t.y1, t.z0, t.x1, t.y1 + ph, t.z0 + p, 4, 4, { top: true });
          boxSides(trimA, t.x0, t.y1, t.z1 - p, t.x1, t.y1 + ph, t.z1, 4, 4, { top: true });
          boxSides(trimA, t.x0, t.y1, t.z0, t.x0 + p, t.y1 + ph, t.z1, 4, 4, { top: true });
          boxSides(trimA, t.x1 - p, t.y1, t.z0, t.x1, t.y1 + ph, t.z1, 4, 4, { top: true });
        }
        // tower crowns: a lit band
        if (b.kind === "tower" || b.kind === "apex") boxSides(accOf(ch, "crown"), t.x0 + 0.2, t.y1 - 1.2, t.z0 + 0.2, t.x1 - 0.2, t.y1 - 0.4, t.z1 - 0.2, 4, 4);
      }
    }
    if (b.roof === "gable" || b.roof === "hip") {
      const t = b.tiers[b.tiers.length - 1];
      const G = accOf(ch, "gable");
      const y = t.y1;
      const rh = b.roofH || 2.4;
      const o = 0.5; // eaves overhang
      if (b.ridge === "x") {
        const zm = (t.z0 + t.z1) / 2;
        const x0 = t.x0 - o;
        const x1 = t.x1 + o;
        const hip = b.roof === "hip" ? (t.z1 - t.z0) * 0.4 : 0;
        // two slopes
        G.quad([x0, y, t.z1 + o], [x1, y, t.z1 + o], [x1 - hip, y + rh, zm], [x0 + hip, y + rh, zm], [0, 0.7, 0.7], [0, 0], [(x1 - x0) / 3, 0], [(x1 - x0) / 3, 2], [0, 2]);
        G.quad([x1, y, t.z0 - o], [x0, y, t.z0 - o], [x0 + hip, y + rh, zm], [x1 - hip, y + rh, zm], [0, 0.7, -0.7], [0, 0], [(x1 - x0) / 3, 0], [(x1 - x0) / 3, 2], [0, 2]);
        if (hip) {
          G.tri([x0, y, t.z0 - o], [x0, y, t.z1 + o], [x0 + hip, y + rh, zm], [-0.7, 0.7, 0], [0, 0], [3, 0], [1.5, 2]);
          G.tri([x1, y, t.z1 + o], [x1, y, t.z0 - o], [x1 - hip, y + rh, zm], [0.7, 0.7, 0], [0, 0], [3, 0], [1.5, 2]);
        } else {
          A.tri([t.x0, y, t.z0], [t.x0, y, t.z1], [t.x0, y + rh, zm], [-1, 0, 0], [t.z0 / F.w, y / F.h], [t.z1 / F.w, y / F.h], [zm / F.w, (y + rh) / F.h]);
          A.tri([t.x1, y, t.z1], [t.x1, y, t.z0], [t.x1, y + rh, zm], [1, 0, 0], [-t.z1 / F.w, y / F.h], [-t.z0 / F.w, y / F.h], [-zm / F.w, (y + rh) / F.h]);
        }
      } else {
        const xm = (t.x0 + t.x1) / 2;
        const z0 = t.z0 - o;
        const z1 = t.z1 + o;
        const hip = b.roof === "hip" ? (t.x1 - t.x0) * 0.4 : 0;
        G.quad([t.x1 + o, y, z1], [t.x1 + o, y, z0], [xm, y + rh, z0 + hip], [xm, y + rh, z1 - hip], [0.7, 0.7, 0], [0, 0], [(z1 - z0) / 3, 0], [(z1 - z0) / 3, 2], [0, 2]);
        G.quad([t.x0 - o, y, z0], [t.x0 - o, y, z1], [xm, y + rh, z1 - hip], [xm, y + rh, z0 + hip], [-0.7, 0.7, 0], [0, 0], [(z1 - z0) / 3, 0], [(z1 - z0) / 3, 2], [0, 2]);
        if (hip) {
          G.tri([t.x0 - o, y, z1], [t.x1 + o, y, z1], [xm, y + rh, z1 - hip], [0, 0.7, 0.7], [0, 0], [3, 0], [1.5, 2]);
          G.tri([t.x1 + o, y, z0], [t.x0 - o, y, z0], [xm, y + rh, z0 + hip], [0, 0.7, -0.7], [0, 0], [3, 0], [1.5, 2]);
        } else {
          A.tri([t.x0, y, t.z1], [t.x1, y, t.z1], [xm, y + rh, t.z1], [0, 0, 1], [t.x0 / F.w, y / F.h], [t.x1 / F.w, y / F.h], [xm / F.w, (y + rh) / F.h]);
          A.tri([t.x1, y, t.z0], [t.x0, y, t.z0], [xm, y + rh, t.z0], [0, 0, -1], [-t.x1 / F.w, y / F.h], [-t.x0 / F.w, y / F.h], [-xm / F.w, (y + rh) / F.h]);
        }
      }
    }
    if (b.roof === "vault") {
      const t = b.tiers[b.tiers.length - 1];
      const V = accOf(ch, "vault");
      const rh = b.roofH || 4;
      const segs = 10;
      const w = t.x1 - t.x0;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI;
        const a1 = ((i + 1) / segs) * Math.PI;
        const xa = t.x0 + w / 2 - Math.cos(a0) * w / 2;
        const xb = t.x0 + w / 2 - Math.cos(a1) * w / 2;
        const ya = t.y1 + Math.sin(a0) * rh;
        const yb = t.y1 + Math.sin(a1) * rh;
        const nx = -Math.cos((a0 + a1) / 2);
        const ny = Math.sin((a0 + a1) / 2);
        V.quad([xa, ya, t.z1], [xb, yb, t.z1], [xb, yb, t.z0], [xa, ya, t.z0], [nx, ny, 0], [i, 0], [i + 1, 0], [i + 1, 4], [i, 4]);
        // gable ends
        A.tri([t.x0 + w / 2, t.y1, t.z1], [xb, yb, t.z1], [xa, ya, t.z1], [0, 0, 1], [0, 0], [0, 0], [0, 0]);
        A.tri([t.x0 + w / 2, t.y1, t.z0], [xa, ya, t.z0], [xb, yb, t.z0], [0, 0, -1], [0, 0], [0, 0], [0, 0]);
      }
    }
    // rooftop clutter: AC units / water tanks
    if (b.clutter) {
      const MA = accOf(ch, "metal");
      for (const c of b.clutter) {
        if (c.t === "ac") fullBox(MA, c.x - c.w / 2, c.y, c.z - c.d / 2, c.x + c.w / 2, c.y + c.h, c.z + c.d / 2);
        else {
          fullBox(MA, c.x - c.r * 0.9, c.y, c.z - c.r * 0.9, c.x + c.r * 0.9, c.y + c.h, c.z + c.r * 0.9);
          fullBox(MA, c.x - c.r, c.y + c.h - 0.4, c.z - c.r, c.x + c.r, c.y + c.h, c.z + c.r);
        }
      }
    }
  }
  // Apex Tower spire
  {
    const apex = C.buildings.find((b) => b.kind === "apex");
    if (apex) {
      const t = apex.tiers[apex.tiers.length - 1];
      const cx = (t.x0 + t.x1) / 2;
      const cz = (t.z0 + t.z1) / 2;
      const ch = chunkOf(cx, cz);
      const MA = accOf(ch, "metal");
      fullBox(MA, cx - 1, t.y1, cz - 1, cx + 1, t.y1 + 34, cz + 1);
      fullBox(accOf(ch, "crown"), cx - 0.4, t.y1 + 34, cz - 0.4, cx + 0.4, t.y1 + 36, cz + 0.4);
    }
  }

  /* ---------------------------------------------------------------- other static colliders */
  const containers = [];
  for (const b of C.boxes) {
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const ch = chunkOf(cx, cz);
    switch (b.kind) {
      case "container":
        containers.push(b);
        break;
      case "deck":
        if (b.highway) {
          fullBox(accOf(ch, "concrete"), b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
          // lane paint on top handled by markings
        } else {
          const A = accOf(ch, "concrete");
          fullBox(A, b.x0, b.y0, b.z0, b.x1, b.y1 - 0.02, b.z1);
          fullBox(accOf(ch, "bridge"), b.x0 - 0.3, b.y0 - 0.9, b.z0, b.x0 + 0.5, b.y0, b.z1);
          fullBox(accOf(ch, "bridge"), b.x1 - 0.5, b.y0 - 0.9, b.z0, b.x1 + 0.3, b.y0, b.z1);
        }
        break;
      case "ramp": {
        const A = accOf(ch, "concrete");
        const r = b.ramp;
        const xa = r.a;
        const xb = r.b;
        A.quad([xa, r.h0, b.z1], [xb, r.h1, b.z1], [xb, r.h1, b.z0], [xa, r.h0, b.z0], [0, 1, 0], [xa / 6, b.z1 / 6], [xb / 6, b.z1 / 6], [xb / 6, b.z0 / 6], [xa / 6, b.z0 / 6]);
        for (const [z, nz] of [[b.z1, 1], [b.z0, -1]]) {
          const lo = -0.2;
          if (nz > 0) A.quad([xa, lo, z], [xb, lo, z], [xb, r.h1, z], [xa, r.h0, z], [0, 0, 1], [0, 0], [6, 0], [6, 1], [0, 1]);
          else A.quad([xb, lo, z], [xa, lo, z], [xa, r.h0, z], [xb, r.h1, z], [0, 0, -1], [0, 0], [6, 0], [6, 1], [0, 1]);
        }
        const high = r.h1 > r.h0 ? xb : xa;
        const top = Math.max(r.h0, r.h1);
        A.quad([high, -0.2, b.z0], [high, -0.2, b.z1], [high, top, b.z1], [high, top, b.z0], [high === xb ? 1 : -1, 0, 0], [0, 0], [6, 0], [6, 1], [0, 1]);
        break;
      }
      case "rail":
        fullBox(accOf(ch, b.y0 > 5 ? "trim" : "bridge"), b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
        break;
      case "pylon": {
        fullBox(accOf(ch, "bridge"), b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
        fullBox(accOf(ch, "bridge"), b.x0 - 0.3, b.y1 - 2, b.z0 - 0.3, b.x1 + 0.3, b.y1, b.z1 + 0.3);
        break;
      }
      case "pier":
      case "pillar":
      case "post":
        fullBox(accOf(ch, "concrete"), b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
        break;
      case "milwall": {
        fullBox(accOf(ch, "darkConcrete"), b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
        fullBox(accOf(ch, "metal"), b.x0, b.y1, (b.z0 + b.z1) / 2 - 0.05, b.x1, b.y1 + 0.6, (b.z0 + b.z1) / 2 + 0.05);
        break;
      }
      case "silo":
      case "chimney":
      case "mast":
      case "watch":
      case "canopy":
      case "fountain":
      case "plinth":
        break; // decor below
      case "roofprop":
      case "tree":
      case "bld":
      case "roof":
      default:
    }
  }

  /* ---------------------------------------------------------------- decor (round things) */
  const roundA = new Map();
  const cyl = (ch, kind, x, y, z, r, h, segs = 16, cap = true) => {
    const A = accOf(ch, kind);
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const p0 = [x + Math.cos(a0) * r, z + Math.sin(a0) * r];
      const p1 = [x + Math.cos(a1) * r, z + Math.sin(a1) * r];
      const nm = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
      A.quad([p1[0], y, p1[1]], [p0[0], y, p0[1]], [p0[0], y + h, p0[1]], [p1[0], y + h, p1[1]], nm, [(i + 1) / segs * 4, 0], [i / segs * 4, 0], [i / segs * 4, h / 4], [(i + 1) / segs * 4, h / 4]);
      if (cap) A.tri([x, y + h, z], [p1[0], y + h, p1[1]], [p0[0], y + h, p0[1]], [0, 1, 0], [0.5, 0.5], [0, 0], [1, 0]);
    }
  };
  void roundA;
  for (const d of C.decor) {
    const ch = chunkOf(d.x, d.z);
    switch (d.type) {
      case "silo":
        cyl(ch, "white", d.x, 0, d.z, d.r, d.h, 20);
        cyl(ch, "metal", d.x, d.h, d.z, d.r * 0.3, 1.2, 10);
        for (let k = 1; k < 4; k++) cyl(ch, "metal", d.x, (d.h * k) / 4, d.z, d.r + 0.08, 0.3, 20, false);
        break;
      case "farmsilo":
        cyl(ch, "metal", d.x, 0, d.z, d.r, d.h, 16);
        cyl(ch, "red", d.x, d.h, d.z, d.r * 0.7, 1.2, 16);
        break;
      case "chimney":
        cyl(ch, "darkConcrete", d.x, d.y, d.z, d.r, d.h, 14);
        for (let k = 0; k < 3; k++) cyl(ch, k % 2 ? "white" : "red", d.x, d.y + d.h - 2 - k * 2, d.z, d.r + 0.06, 2, 14, false);
        break;
      case "mast": {
        const A = accOf(ch, "red");
        const h = d.h;
        for (const [ox, oz] of [[-1.2, -1.2], [1.2, -1.2], [0, 1.2]]) fullBox(A, d.x + ox - 0.15, d.y, d.z + oz - 0.15, d.x + ox + 0.15, d.y + h, d.z + oz + 0.15);
        for (let y = 4; y < h; y += 6) fullBox(accOf(ch, "white"), d.x - 1.4, d.y + y, d.z - 1.4, d.x + 1.4, d.y + y + 0.3, d.z + 1.4);
        break;
      }
      case "watch": {
        const A = accOf(ch, "metal");
        for (const [ox, oz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) fullBox(A, d.x + ox - 0.15, 0, d.z + oz - 0.15, d.x + ox + 0.15, d.h - 3, d.z + oz + 0.15);
        fullBox(accOf(ch, "military"), d.x - 2, d.h - 3, d.z - 2, d.x + 2, d.h - 0.6, d.z + 2);
        fullBox(accOf(ch, "metal"), d.x - 2.3, d.h - 0.6, d.z - 2.3, d.x + 2.3, d.h, d.z + 2.3);
        break;
      }
      case "canopy":
        fullBox(accOf(ch, "white"), d.x - d.w / 2, d.y, d.z - d.d / 2, d.x + d.w / 2, d.y + 0.7, d.z + d.d / 2);
        fullBox(accOf(ch, "red"), d.x - d.w / 2 - 0.05, d.y + 0.2, d.z - d.d / 2 - 0.05, d.x + d.w / 2 + 0.05, d.y + 0.5, d.z + d.d / 2 + 0.05);
        break;
      case "fountain": {
        cyl(ch, "concrete", d.x, 0, d.z, 6, 0.9, 24, false);
        cyl(ch, "concrete", d.x, 0, d.z, 5.6, 0.5, 24);
        cyl(ch, "concrete", d.x, 0.9, d.z, 1.2, 2.2, 12);
        cyl(ch, "concrete", d.x, 3.1, d.z, 2.2, 0.35, 16);
        break;
      }
      case "statue": {
        const A = accOf(ch, "bronze");
        fullBox(accOf(ch, "concrete"), d.x - 3, 0, d.z - 3, d.x + 3, d.y, d.z + 3);
        // a heroic figure: legs, torso, raised arm (stylised)
        fullBox(A, d.x - 0.7, d.y, d.z - 0.4, d.x - 0.15, d.y + 2.2, d.z + 0.4);
        fullBox(A, d.x + 0.15, d.y, d.z - 0.4, d.x + 0.7, d.y + 2.2, d.z + 0.4);
        fullBox(A, d.x - 0.9, d.y + 2.2, d.z - 0.55, d.x + 0.9, d.y + 4.2, d.z + 0.55);
        fullBox(A, d.x - 0.35, d.y + 4.2, d.z - 0.35, d.x + 0.35, d.y + 4.9, d.z + 0.35);
        fullBox(A, d.x + 0.9, d.y + 3.6, d.z - 0.25, d.x + 1.35, d.y + 6.2, d.z + 0.25);
        fullBox(A, d.x - 1.35, d.y + 2.2, d.z - 0.25, d.x - 0.9, d.y + 4.1, d.z + 0.25);
        break;
      }
      case "pond":
        break;
      case "billboard": {
        const A = accOf(ch, "metal");
        fullBox(A, d.x - 4, 0, d.z - 0.2, d.x - 3.6, 8, d.z + 0.2);
        fullBox(A, d.x + 3.6, 0, d.z - 0.2, d.x + 4, 8, d.z + 0.2);
        const bb = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), keep(new THREE.MeshStandardMaterial({ map: billboardTex(d.i), roughness: 0.7, side: THREE.DoubleSide })));
        bb.position.set(d.x, 8.5, d.z);
        keep(bb.geometry);
        ch.group.add(bb);
        break;
      }
      default:
    }
  }
  M.bronze = keep(new THREE.MeshStandardMaterial({ color: "#3f6b55", roughness: 0.45, metalness: 0.6 }));
  M.metal = keep(new THREE.MeshStandardMaterial({ color: "#7f868c", roughness: 0.5, metalness: 0.55 }));
  M.crown = keep(new THREE.MeshStandardMaterial({ color: "#ffe2a8", emissive: "#ffd27a", emissiveIntensity: 1.4 }));
  M.military = M.military || keep(new THREE.MeshStandardMaterial({ color: "#6b7253" }));

  /* ---------------------------------------------------------------- road markings */
  const marks = new Acc();
  const yellow = new Acc();
  const Y = 0.025;
  const flatQuad = (A, x0, z0, x1, z1, y = Y) => A.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j < N; j++) {
      const c = i * PITCH;
      const a0 = j * PITCH + ROAD_HW + 1;
      const a1 = (j + 1) * PITCH - ROAD_HW - 1;
      for (const axis of ["x", "z"]) {
        if (axis === "x" && j === 6 && !BRIDGES.includes(c)) continue;
        const yy = axis === "x" && j === 6 ? Y : Y;
        // double yellow centre line
        for (const o of [-0.18, 0.18]) {
          if (axis === "x") flatQuad(yellow, c + o - 0.07, a0, c + o + 0.07, a1, yy);
          else flatQuad(yellow, a0, c + o - 0.07, a1, c + o + 0.07, yy);
        }
        // dashed lane separators
        for (const o of [-3.6, 3.6]) {
          for (let a = a0; a < a1 - 3; a += 7) {
            if (axis === "x") flatQuad(marks, c + o - 0.08, a, c + o + 0.08, a + 3, yy);
            else flatQuad(marks, a, c + o - 0.08, a + 3, c + o + 0.08, yy);
          }
        }
      }
    }
  }
  // crosswalks at city intersections
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= 6; j++) {
      const x = i * PITCH;
      const z = j * PITCH;
      const d = blockDistrict(Math.min(N - 1, i), Math.min(N - 1, j));
      if (d === "outskirts" || d === "military") continue;
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        for (let s = -ROAD_HW + 1; s < ROAD_HW - 1; s += 1.2) {
          if (dz) flatQuad(marks, x + s, z + dz * (ROAD_HW + 0.6) - 1.4, x + s + 0.6, z + dz * (ROAD_HW + 0.6) + 1.4);
          else flatQuad(marks, x + dx * (ROAD_HW + 0.6) - 1.4, z + s, x + dx * (ROAD_HW + 0.6) + 1.4, z + s + 0.6);
        }
      }
    }
  }
  // highway lanes
  for (let x = HIGHWAY.x0; x < HIGHWAY.x1; x += 8) for (const o of [-3.5, 0, 3.5]) flatQuad(o === 0 ? yellow : marks, x, HIGHWAY.z + o - 0.1, x + (o === 0 ? 8 : 4), HIGHWAY.z + o + 0.1, HIGHWAY.top + 0.02);
  const markMat = keep(new THREE.MeshStandardMaterial({ color: "#e8e6df", roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
  const yelMat = keep(new THREE.MeshStandardMaterial({ color: "#e0b43a", roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
  const mm = new THREE.Mesh(keep(marks.geo()), markMat);
  mm.receiveShadow = shadows;
  root.add(mm);
  const ym = new THREE.Mesh(keep(yellow.geo()), yelMat);
  ym.receiveShadow = shadows;
  root.add(ym);

  /* ---------------------------------------------------------------- terrain */
  const gm = groundMap(C);
  {
    const step = 4;
    const n = Math.round((gm.M1 - gm.M0) / step);
    const g = new THREE.PlaneGeometry(gm.M1 - gm.M0, gm.M1 - gm.M0, n, n);
    g.rotateX(-Math.PI / 2);
    g.translate((gm.M0 + gm.M1) / 2, 0, (gm.M0 + gm.M1) / 2);
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setY(i, C.terrainH(x, z));
      uv.setXY(i, (x - gm.M0) / (gm.M1 - gm.M0), 1 - (z - gm.M0) / (gm.M1 - gm.M0));
    }
    gm.tex.flipY = true;
    g.computeVertexNormals();
    keep(g);
    const gmat = keep(withDetail(new THREE.MeshStandardMaterial({ map: gm.tex, roughness: 0.95 }), 0.22, 1));
    const ground = new THREE.Mesh(g, gmat);
    ground.receiveShadow = shadows;
    root.add(ground);
    // far apron: plain grass out to the horizon
    const ap = new THREE.RingGeometry(700, 2600, 48, 1);
    ap.rotateX(-Math.PI / 2);
    ap.translate(SIZE / 2, -0.2, SIZE / 2);
    keep(ap);
    const apron = new THREE.Mesh(ap, keep(new THREE.MeshStandardMaterial({ color: "#5d7a39", roughness: 1 })));
    root.add(apron);
    // fill the corners between the terrain square and the apron ring
    const fill = new THREE.PlaneGeometry(1500, 1500);
    fill.rotateX(-Math.PI / 2);
    fill.translate(SIZE / 2, -0.3, SIZE / 2);
    keep(fill);
    root.add(new THREE.Mesh(fill, apron.material));
  }
  /* ---------------------------------------------------------------- water */
  const waterTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const img = g.createImageData(128, 128);
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const i = (y * 128 + x) * 4;
        const a = Math.sin((x / 128) * Math.PI * 8 + Math.sin((y / 128) * Math.PI * 6) * 1.5);
        const b = Math.cos((y / 128) * Math.PI * 10 + Math.sin((x / 128) * Math.PI * 4));
        img.data[i] = 128 + a * 40;
        img.data[i + 1] = 128 + b * 40;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(60, 4);
    return keep(t);
  })();
  const waterMat = keep(new THREE.MeshStandardMaterial({ color: "#3b6f7d", roughness: 0.12, metalness: 0.45, normalMap: waterTex, normalScale: new THREE.Vector2(0.5, 0.5), transparent: true, opacity: 0.9 }));
  {
    const w = new THREE.PlaneGeometry(SIZE + 1400, RIVER.z1 - RIVER.z0 - 14);
    w.rotateX(-Math.PI / 2);
    w.translate(SIZE / 2, RIVER.water, (RIVER.z0 + RIVER.z1) / 2);
    keep(w);
    const wm = new THREE.Mesh(w, waterMat);
    wm.receiveShadow = shadows;
    root.add(wm);
    const pond = C.decor.find((d) => d.type === "pond");
    if (pond) {
      const pg = new THREE.CircleGeometry(pond.r, 28);
      pg.rotateX(-Math.PI / 2);
      pg.translate(pond.x, 0.06, pond.z);
      keep(pg);
      root.add(new THREE.Mesh(pg, waterMat));
    }
    const fnt = C.decor.find((d) => d.type === "fountain");
    if (fnt) {
      const fg = new THREE.CircleGeometry(5.6, 24);
      fg.rotateX(-Math.PI / 2);
      fg.translate(fnt.x, 0.75, fnt.z);
      keep(fg);
      root.add(new THREE.Mesh(fg, waterMat));
    }
  }

  /* ---------------------------------------------------------------- containers (instanced) */
  if (containers.length) {
    const cg = keep(new THREE.BoxGeometry(1, 1, 1));
    const cm = keep(new THREE.MeshStandardMaterial({ map: containerTex(), roughness: 0.65, metalness: 0.35 }));
    const im = new THREE.InstancedMesh(cg, cm, containers.length);
    const COLS = ["#b0392b", "#2b6cb0", "#2f8a4f", "#c48a2b", "#6b6f75", "#8a3b8a"].map((h) => new THREE.Color(h));
    const m4 = new THREE.Matrix4();
    containers.forEach((b, i) => {
      m4.makeScale(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
      m4.setPosition((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
      im.setMatrixAt(i, m4);
      im.setColorAt(i, COLS[b.color % COLS.length]);
    });
    im.castShadow = shadows;
    im.receiveShadow = shadows;
    root.add(im);
  }

  /* ---------------------------------------------------------------- trees (instanced) */
  {
    const round = C.trees.filter((t) => t.kind !== "pine");
    const pine = C.trees.filter((t) => t.kind === "pine");
    const trunkG = keep(new THREE.CylinderGeometry(0.22, 0.32, 3.2, 7).translate(0, 1.6, 0));
    const crownG = keep((() => {
      const a = new THREE.IcosahedronGeometry(2.4, 1).translate(0, 4.8, 0);
      return a;
    })());
    const pineG = keep(new THREE.ConeGeometry(2.2, 6.5, 8).translate(0, 5.2, 0));
    const trunkM = keep(new THREE.MeshStandardMaterial({ color: "#5a4030", roughness: 0.9 }));
    const leafM = keep(new THREE.MeshStandardMaterial({ color: "#4f7a33", roughness: 0.85, flatShading: true }));
    const pineM = keep(new THREE.MeshStandardMaterial({ color: "#2f5a35", roughness: 0.85, flatShading: true }));
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const v = new THREE.Vector3();
    const all = C.trees;
    const trunks = new THREE.InstancedMesh(trunkG, trunkM, all.length);
    all.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 2.39) % 6.28);
      s.set(t.s, t.s, t.s);
      v.set(t.x, C.terrainH(t.x, t.z) - 0.1, t.z);
      m4.compose(v, q, s);
      trunks.setMatrixAt(i, m4);
    });
    trunks.castShadow = shadows;
    root.add(trunks);
    const crowns = new THREE.InstancedMesh(crownG, leafM, Math.max(1, round.length));
    const tint = new THREE.Color();
    round.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 1.7) % 6.28);
      s.set(t.s * (0.9 + (i % 5) * 0.06), t.s * (0.85 + (i % 3) * 0.1), t.s * (0.9 + (i % 4) * 0.05));
      v.set(t.x, C.terrainH(t.x, t.z) - 0.1, t.z);
      m4.compose(v, q, s);
      crowns.setMatrixAt(i, m4);
      tint.setHSL(0.24 + (i % 7) * 0.012, 0.45, 0.32 + (i % 5) * 0.025);
      crowns.setColorAt(i, tint);
    });
    crowns.castShadow = shadows;
    root.add(crowns);
    const pines = new THREE.InstancedMesh(pineG, pineM, Math.max(1, pine.length));
    pine.forEach((t, i) => {
      s.set(t.s, t.s, t.s);
      v.set(t.x, C.terrainH(t.x, t.z) - 0.1, t.z);
      q.identity();
      m4.compose(v, q, s);
      pines.setMatrixAt(i, m4);
    });
    pines.castShadow = shadows;
    root.add(pines);
  }

  /* ---------------------------------------------------------------- finalize chunks */
  const MATS = { ...M };
  for (const ch of chunks.values()) {
    for (const [k, A] of ch.accs) {
      const g = A.geo();
      if (!g) continue;
      keep(g);
      const m = new THREE.Mesh(g, MATS[k] || M.concrete);
      m.castShadow = shadows && k !== "roof";
      m.receiveShadow = shadows;
      ch.group.add(m);
    }
    ch.accs = null;
    root.add(ch.group);
  }

  /* ---------------------------------------------------------------- sky + horizon */
  const skyGeo = keep(new THREE.SphereGeometry(3000, 32, 16));
  const skyMat = keep(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color("#4f86c6") }, mid: { value: new THREE.Color("#a9c8e4") }, bot: { value: new THREE.Color("#e9d9bf") }, sun: { value: new THREE.Vector3(0.5, 0.42, -0.75).normalize() } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sun; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.55, h)) : bot; c = mix(bot, c, smoothstep(-0.02, 0.12, h)); float s = max(0.0, dot(vP, sun)); c += vec3(1.0,0.85,0.6) * pow(s, 300.0) * 2.0 + vec3(1.0,0.8,0.55) * pow(s, 8.0) * 0.25; gl_FragColor = vec4(c, 1.0); }",
  }));
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  root.add(sky);
  // distant mountain ring
  {
    const segs = 96;
    const R0 = 1900;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const h = 90 + Math.sin(a * 5) * 60 + Math.sin(a * 13 + 1) * 35 + Math.sin(a * 29) * 15;
      pos.push(SIZE / 2 + Math.cos(a) * R0, -5, SIZE / 2 + Math.sin(a) * R0);
      pos.push(SIZE / 2 + Math.cos(a) * R0, h, SIZE / 2 + Math.sin(a) * R0);
      if (i < segs) {
        const o = i * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    mg.setIndex(idx);
    mg.computeVertexNormals();
    keep(mg);
    const mt = keep(new THREE.MeshBasicMaterial({ color: "#7d93a8", side: THREE.DoubleSide, fog: false }));
    root.add(new THREE.Mesh(mg, mt));
  }

  const chunkList = [...chunks.values()];
  return {
    group: root,
    sky,
    waterTex,
    /** hide chunks the fog would swallow anyway */
    cull(cam, far) {
      for (const ch of chunkList) {
        const x = (ch.cx + 0.5) * CHUNK;
        const z = (ch.cz + 0.5) * CHUNK;
        const d = Math.hypot(cam.x - x, cam.z - z) - CHUNK * 0.71;
        ch.group.visible = d < far;
      }
      sky.position.set(cam.x, 0, cam.z);
    },
    update(dt) {
      waterTex.offset.x += dt * 0.01;
      waterTex.offset.y += dt * 0.004;
    },
    dispose() {
      for (const d of disposables) d.dispose && d.dispose();
    },
    chunkCount: chunkList.length,
  };
}

export { LOT, RIVER, PITCH };
