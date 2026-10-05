/**
 * Lumberjack Life — procedural trees.
 *
 * Every tree is: a STUMP (ground → felling cut, root flare + buttress roots)
 * and an UPPER group pivoting at the cut (main trunk, crown trunk, branches,
 * foliage). The upper group is posed from the engine's trunk axis, so the
 * rendered fall is exactly the simulated one.
 *
 * - Trunks are per tree (exact height/radius) and carry an `aCut` attribute:
 *   the felling notch is a real geometry change — vertices around the cut on
 *   the chopping side are pulled in and recoloured to fresh wood as cut
 *   progress grows.
 * - Crowns (branches + foliage) come from a per-species variant cache
 *   (4 variants each), scaled and rotated per tree, with a per-tree colour
 *   tint, so a stand never looks cloned.
 * - Foliage sways with a shared wind uniform (shaders.js).
 */
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { speciesById } from "../data/species.js";
import { leafColors } from "../data/regions.js";
import { CUT_HEIGHT } from "../engine/constants.js";
import { radiusAt, trunkLen, TS, trunkPose } from "../engine/trees.js";
import { createRng, fbm } from "../engine/math.js";
import { barkTexture, endGrainTexture } from "./textures.js";
import { windPatch, cutPatch } from "./shaders.js";
import { logGeometry, logMaterials } from "./logMesh.js";

const VARIANTS = 4;
const RADIAL = 12;

/* ------------------------------------------------------------ materials */
const matCache = new Map();
function speciesMats(region, spId) {
  const key = `${region.id}:${spId}`;
  if (matCache.has(key)) return matCache.get(key);
  const sp = speciesById(spId);
  const barkMap = barkTexture(sp.bark);
  const trunk = cutPatch(new THREE.MeshStandardMaterial({ map: barkMap, roughness: 0.93 }), sp.wood.fresh);
  const branch = new THREE.MeshStandardMaterial({ map: barkMap, roughness: 0.95 });
  const end = new THREE.MeshStandardMaterial({ map: endGrainTexture(sp.wood, sp.bark), roughness: 0.85 });
  const conifer = sp.form === "fir" || sp.form === "spruce";
  const leaf = windPatch(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, map: leafTexture() }),
    { heightRef: 10, amp: conifer ? 0.06 : 0.11, base: 2 },
  );
  const m = { trunk, branch, end, leaf, colors: leafColors(region, sp).map((c) => new THREE.Color(c)) };
  matCache.set(key, m);
  return m;
}

let leafTex = null;
function leafTexture() {
  if (leafTex) return leafTex;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = "#c8c8c8";
  g.fillRect(0, 0, S, S);
  const rng = createRng(99);
  for (let i = 0; i < 900; i++) {
    const v = 150 + rng() * 105;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.save();
    g.translate(rng() * S, rng() * S);
    g.rotate(rng() * Math.PI);
    g.beginPath();
    g.ellipse(0, 0, 3 + rng() * 5, 1.5 + rng() * 2.5, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  leafTex = new THREE.CanvasTexture(c);
  leafTex.wrapS = leafTex.wrapT = THREE.RepeatWrapping;
  leafTex.repeat.set(3, 3);
  return leafTex;
}

/* ------------------------------------------------------------ trunk geometry */
/**
 * Rings along local +Y. `radius(y)` gives the radius; vertices use
 * (r·sinφ, y, r·cosφ) so φ matches the engine's yaw convention (notch math).
 */
function ringGeometry(ys, radius, vScale = 1.4, wobbleSeed = 0) {
  const n = RADIAL;
  const pos = [];
  const uv = [];
  const cut = [];
  const base = [];
  for (let j = 0; j < ys.length; j++) {
    const y = ys[j];
    const r = radius(y);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = 1 + 0.035 * Math.sin(a * 3 + y * 1.7 + wobbleSeed) + 0.02 * Math.sin(a * 7 + y * 3.1);
      pos.push(Math.sin(a) * r * wob, y, Math.cos(a) * r * wob);
      base.push(r * wob);
      uv.push((i / n) * 2, y / vScale);
      cut.push(0);
    }
  }
  const idx = [];
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + n + 1;
      // CCW seen from outside (vertex angle grows with i, rings grow up)
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aCut", new THREE.Float32BufferAttribute(cut, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.baseR = base;
  g.userData.ys = ys;
  return g;
}

const flare = (yGround) => 1 + 0.42 * Math.exp(-(Math.max(-0.4, yGround) + 0.1) * 3.4);

/* ------------------------------------------------------------ crown variants */
function puff(rng, r, flatten = 1) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const seed = Math.floor(rng() * 1000);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = fbm(x * 1.7 + seed, z * 1.7 + y * 1.3, seed, 2);
    const k = r * (1 + n * 0.22);
    p.setXYZ(i, x * k, y * k * flatten, z * k);
  }
  const m = mergeVertices(g, 1e-4);
  g.dispose();
  m.computeVertexNormals();
  return m;
}

function colorize(g, cols, rng, { top = 1.18, bottom = 0.62, yMin, yMax }) {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  const pick = cols[Math.floor(rng() * cols.length) % cols.length].clone();
  pick.offsetHSL((rng() - 0.5) * 0.03, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.06);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = (y - yMin) / Math.max(0.01, yMax - yMin);
    const shadeK = bottom + (top - bottom) * Math.min(1, Math.max(0, k));
    c[i * 3] = pick.r * shadeK;
    c[i * 3 + 1] = pick.g * shadeK;
    c[i * 3 + 2] = pick.b * shadeK;
  }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
}

function limb(from, to, r0, r1) {
  const d = new THREE.Vector3().subVectors(to, from);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  g.translate(from.x, from.y, from.z);
  return g;
}

/** a tier of conifer branches: a jagged, drooping skirt (closed underneath) */
function skirt(rng, yTop, yRim, R, droop) {
  const n = 16;
  const pos = [];
  const idx = [];
  pos.push(0, yTop, 0); // 0: tip
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + rng() * 0.05;
    const rr = (i % 2 === 0 ? R : R * 0.72) * (0.9 + rng() * 0.2);
    pos.push(Math.sin(a) * rr, yRim - (i % 2 === 0 ? droop : droop * 0.4) + (rng() - 0.5) * 0.12, Math.cos(a) * rr);
  }
  const inner = pos.length / 3;
  pos.push(0, yRim + 0.15, 0); // underside centre
  const m = n * 2;
  for (let i = 0; i < m; i++) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % m);
    idx.push(0, a, b);
    idx.push(inner, b, a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  // spherical-ish uv for the leaf texture
  const uv = [];
  for (let i = 0; i < pos.length / 3; i++) uv.push(pos[i * 3] * 0.5, pos[i * 3 + 2] * 0.5 + pos[i * 3 + 1] * 0.2);
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const ni = g.toNonIndexed();
  g.dispose();
  ni.computeVertexNormals();
  return ni;
}

const crownCache = new Map();
/**
 * Build (once) the branch + foliage geometry for a species variant at a
 * nominal size, in the UPPER group's frame (y = 0 at the felling cut).
 */
function crownVariant(region, spId, v) {
  const key = `${region.id}:${spId}:${v}`;
  if (crownCache.has(key)) return crownCache.get(key);
  const sp = speciesById(spId);
  const rng = createRng(spId.length * 1000 + v * 7919 + region.id.length * 13);
  const H = (sp.height[0] + sp.height[1]) / 2;
  const R = (sp.radius[0] + sp.radius[1]) / 2;
  const cols = leafColors(region, sp).map((c) => new THREE.Color(c));
  const branches = [];
  const leaves = [];
  const yc = (yg) => yg - CUT_HEIGHT; // ground height → upper-local
  const V = THREE.Vector3;
  const addPuff = (x, y, z, r, flat = 0.85) => {
    const g = puff(rng, r, flat);
    g.translate(x, y, z);
    leaves.push(g);
  };
  const form = sp.form;
  if (form === "broad" || form === "oak" || form === "birch") {
    const oak = form === "oak";
    const birch = form === "birch";
    const nLimbs = birch ? 7 : oak ? 6 : 5;
    const crownW = H * (oak ? 0.36 : birch ? 0.2 : 0.28);
    for (let i = 0; i < nLimbs; i++) {
      const a = (i / nLimbs) * Math.PI * 2 + rng() * 0.6;
      const hb = H * (birch ? 0.38 + 0.45 * (i / nLimbs) : oak ? 0.36 + 0.2 * rng() : 0.45 + 0.22 * rng());
      const out = crownW * (0.65 + rng() * 0.4);
      const up = H * (birch ? 0.18 : oak ? 0.1 : 0.16) * (0.8 + rng() * 0.5);
      const from = new V(0, yc(hb), 0);
      const mid = new V(Math.sin(a) * out * 0.55, yc(hb) + up * 0.6, Math.cos(a) * out * 0.55);
      const to = new V(Math.sin(a) * out, yc(hb) + up, Math.cos(a) * out);
      const rb = R * (birch ? 0.35 : 0.5);
      branches.push(limb(from, mid, rb, rb * 0.65), limb(mid, to, rb * 0.65, rb * 0.25));
      // a twig off the limb
      const ta = a + (rng() - 0.5) * 1.4;
      const tw = new V(mid.x + Math.sin(ta) * out * 0.35, mid.y + up * 0.35, mid.z + Math.cos(ta) * out * 0.35);
      branches.push(limb(mid, tw, rb * 0.4, rb * 0.12));
      const pr = birch ? 0.75 + rng() * 0.3 : oak ? 1.5 + rng() * 0.5 : 1.25 + rng() * 0.45;
      addPuff(to.x, to.y + pr * 0.25, to.z, pr, birch ? 1.05 : 0.8);
      addPuff(tw.x, tw.y + pr * 0.2, tw.z, pr * 0.85, birch ? 1.05 : 0.8);
      if (!birch) addPuff((mid.x + to.x) / 2, mid.y + up * 0.55 + pr * 0.4, (mid.z + to.z) / 2, pr * 0.9, 0.8);
    }
    // crown top + filler
    const top = H * (birch ? 0.93 : oak ? 0.82 : 0.86);
    const nTop = birch ? 12 : oak ? 9 : 8;
    for (let i = 0; i < nTop; i++) {
      const a = rng() * Math.PI * 2;
      const rr = rng() * crownW * (birch ? 0.55 : 0.6);
      const y = yc(top - H * (birch ? 0.32 : 0.2) * rng());
      const pr = birch ? 0.7 + rng() * 0.35 : oak ? 1.45 + rng() * 0.55 : 1.3 + rng() * 0.45;
      addPuff(Math.sin(a) * rr, y, Math.cos(a) * rr, pr, birch ? 1.1 : 0.82);
    }
    if (birch) {
      // drooping lower clusters along the slender trunk
      for (let i = 0; i < 6; i++) {
        const a = rng() * Math.PI * 2;
        const y = yc(H * (0.45 + rng() * 0.3));
        addPuff(Math.sin(a) * 0.9, y, Math.cos(a) * 0.9, 0.55 + rng() * 0.2, 1.2);
      }
    }
  } else if (form === "pine") {
    // tall bare bole, flat irregular clusters high up, a few dead stubs low
    for (let i = 0; i < 5; i++) {
      const a = rng() * Math.PI * 2;
      const hb = H * (0.2 + rng() * 0.3);
      const from = new V(0, yc(hb), 0);
      const to = new V(Math.sin(a) * 0.6, yc(hb) - 0.15, Math.cos(a) * 0.6);
      branches.push(limb(from, to, R * 0.18, R * 0.05));
    }
    const nC = 11;
    for (let i = 0; i < nC; i++) {
      const a = (i / nC) * Math.PI * 2 * 1.618 + rng() * 0.5;
      const k = i / nC;
      const hb = H * (0.58 + 0.34 * k);
      const out = H * (0.12 + 0.1 * (1 - k)) * (0.8 + rng() * 0.4);
      const from = new V(0, yc(hb), 0);
      const to = new V(Math.sin(a) * out, yc(hb) + 0.5 + rng() * 0.5, Math.cos(a) * out);
      branches.push(limb(from, to, R * 0.3, R * 0.08));
      addPuff(to.x, to.y + 0.25, to.z, 1.0 + rng() * 0.45, 0.5);
    }
    addPuff(0, yc(H * 0.97), 0, 1.05, 0.65);
  } else {
    // fir / spruce: stacked jagged skirts down most of the trunk
    const spruce = form === "spruce";
    const tiers = spruce ? 13 : 11;
    const y0 = H * (spruce ? 0.14 : 0.18);
    const y1 = H * 1.0;
    const maxR = H * (spruce ? 0.2 : 0.25);
    for (let i = 0; i < tiers; i++) {
      const k = i / (tiers - 1);
      const yRim = yc(y0 + (y1 - y0) * k * 0.94);
      const rr = maxR * (1 - k * 0.92) * (0.9 + rng() * 0.18);
      const yTop = yRim + rr * (spruce ? 0.95 : 0.8) + 0.4;
      const g = skirt(rng, yTop, yRim, rr, spruce ? 0.55 * (1 - k * 0.6) : 0.3);
      g.rotateY(rng() * Math.PI);
      leaves.push(g);
    }
  }
  // per-puff colours (bright tops, dark undersides = cheap ambient occlusion)
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const g of leaves) {
    g.computeBoundingBox();
    yMin = Math.min(yMin, g.boundingBox.min.y);
    yMax = Math.max(yMax, g.boundingBox.max.y);
  }
  for (const g of leaves) {
    colorize(g, cols, rng, { yMin, yMax, top: 1.25, bottom: 0.55 });
    if (!g.attributes.uv) {
      const p = g.attributes.position;
      const uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        uv[i * 2] = p.getX(i) * 0.4 + p.getZ(i) * 0.2;
        uv[i * 2 + 1] = p.getY(i) * 0.4;
      }
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    }
  }
  const strip = (g) => {
    const out = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(out.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) out.deleteAttribute(k);
    return out;
  };
  const foliage = mergeGeometries(leaves.map(strip), false);
  leaves.forEach((g) => g.dispose());
  let branchGeo = null;
  if (branches.length) {
    branchGeo = mergeGeometries(branches.map((g) => strip(g)), false);
    branches.forEach((g) => g.dispose());
  }
  foliage.computeBoundingSphere();
  const res = { foliage, branchGeo, H };
  crownCache.set(key, res);
  return res;
}

/* ------------------------------------------------------------ build one tree */
export function buildTree(tree, region, { shadows = true } = {}) {
  const sp = speciesById(tree.species);
  const M = speciesMats(region, sp.id);
  const L = trunkLen(tree);
  const conifer = sp.form === "fir" || sp.form === "spruce" || sp.form === "pine";
  const Lu = Math.min(L * 0.9, tree.nLogs * tree.logLen);
  const topY = L * (conifer || sp.form === "birch" ? 0.97 : 0.8);

  const root = new THREE.Group();
  root.position.set(tree.x, tree.y, tree.z);

  // stump: ground → cut, with notch rings just under the cut
  const stumpYs = [-0.4, -0.05, 0.12, 0.3, CUT_HEIGHT - 0.12, CUT_HEIGHT - 0.05, CUT_HEIGHT];
  const r0 = radiusAt(tree, 0);
  const stumpGeo = ringGeometry(stumpYs, (y) => r0 * flare(y), 1.4, tree.variant % 7);
  const stump = new THREE.Mesh(stumpGeo, M.trunk);
  stump.castShadow = shadows;
  stump.receiveShadow = true;
  root.add(stump);
  // stump top: end grain (visible once the tree is down)
  const capGeo = new THREE.CircleGeometry(r0 * flare(CUT_HEIGHT) * 1.0, RADIAL);
  capGeo.rotateX(-Math.PI / 2);
  const cap = new THREE.Mesh(capGeo, M.end);
  cap.position.y = CUT_HEIGHT - 0.005;
  cap.receiveShadow = true;
  root.add(cap);
  // buttress roots
  const rootsRng = createRng(tree.variant);
  const rootGeos = [];
  const nR = sp.form === "birch" ? 3 : 5;
  for (let i = 0; i < nR; i++) {
    const a = (i / nR) * Math.PI * 2 + rootsRng() * 0.6;
    const g = new THREE.SphereGeometry(1, 8, 6);
    g.scale(r0 * 0.5, r0 * 0.55, r0 * 1.5);
    g.translate(0, 0, r0 * 1.0);
    g.rotateY(a);
    g.translate(0, -0.02, 0);
    rootGeos.push(g);
  }
  const rootsGeo = mergeGeometries(rootGeos.map((g) => {
    const n = g.toNonIndexed();
    g.dispose();
    return n;
  }));
  const roots = new THREE.Mesh(rootsGeo, M.branch);
  roots.castShadow = false;
  roots.receiveShadow = true;
  root.add(roots);

  // upper group: pivots at the cut
  const upper = new THREE.Group();
  upper.position.y = CUT_HEIGHT;
  root.add(upper);
  const mainYs = [0, 0.05, 0.12, 0.25];
  for (let y = 0.7; y < Lu - 0.05; y += 0.75) mainYs.push(y);
  mainYs.push(Lu);
  const flareUp = (s) => flare(s + CUT_HEIGHT);
  const trunkGeo = ringGeometry(mainYs, (s) => radiusAt(tree, s) * flareUp(s), 1.4, tree.variant % 7);
  const trunk = new THREE.Mesh(trunkGeo, M.trunk);
  trunk.castShadow = shadows;
  trunk.receiveShadow = true;
  upper.add(trunk);
  const crownYs = [];
  for (let y = Lu; y < topY; y += 0.8) crownYs.push(y);
  crownYs.push(topY);
  const crownTrunkGeo = ringGeometry(crownYs, (s) => Math.max(0.02, radiusAt(tree, s) * (s > topY - 1 ? (topY - s) / 1 + 0.15 : 1)), 1.4, tree.variant % 7);
  const crownTrunk = new THREE.Mesh(crownTrunkGeo, M.branch);
  crownTrunk.castShadow = shadows;
  upper.add(crownTrunk);

  // crown (variant), scaled to this tree, rotated, tinted
  const cv = crownVariant(region, sp.id, tree.variant % VARIANTS);
  const crown = new THREE.Group();
  const s = tree.height / cv.H;
  crown.scale.set(s * (0.92 + (tree.variant % 13) / 13 * 0.16), s, s * (0.92 + (tree.variant % 11) / 11 * 0.16));
  crown.rotation.y = tree.rot;
  upper.add(crown);
  const leafMat = M.leaf.clone();
  leafMat.onBeforeCompile = M.leaf.onBeforeCompile;
  leafMat.customProgramCacheKey = M.leaf.customProgramCacheKey;
  const tint = new THREE.Color(1, 1, 1).offsetHSL(((tree.variant % 17) / 17 - 0.5) * 0.03, 0, ((tree.variant % 23) / 23 - 0.5) * 0.12);
  leafMat.color = tint;
  const foliage = new THREE.Mesh(cv.foliage, leafMat);
  foliage.castShadow = shadows;
  foliage.receiveShadow = true;
  crown.add(foliage);
  if (cv.branchGeo) {
    const br = new THREE.Mesh(cv.branchGeo, M.branch);
    br.castShadow = shadows;
    crown.add(br);
  }

  const vis = {
    tree,
    variant: tree.variant,
    species: tree.species,
    root,
    stump,
    cap,
    upper,
    trunk,
    crownTrunk,
    crown,
    crownScale: crown.scale.clone(),
    foliage,
    leafMat,
    stumpGeo,
    trunkGeo,
    Lu,
    lastCut: -1,
    lastNotch: null,
    fallen: false,
    crownFade: 0,
    sections: null,
    sectionGroup: null,
    marks: null,
    disposables: [stumpGeo, capGeo, rootsGeo, trunkGeo, crownTrunkGeo, leafMat],
  };
  updateNotch(vis);
  return vis;
}

/** pull trunk vertices in around the cut on the notch side + mark fresh wood */
function deformNotch(geo, notchYaw, prog, cutY, r, side) {
  const p = geo.attributes.position;
  const c = geo.attributes.aCut;
  const base = geo.userData.baseR;
  const ys = geo.userData.ys;
  const n = RADIAL;
  for (let j = 0; j < ys.length; j++) {
    const dy = Math.abs(ys[j] - cutY);
    // wedge profile: full depth at the cut, tapering over ±0.13 m (more open above)
    const reach = side > 0 ? 0.14 : 0.13;
    const prof = dy > reach ? 0 : 1 - dy / reach;
    for (let i = 0; i <= n; i++) {
      const vi = j * (n + 1) + i;
      const a = (i / n) * Math.PI * 2;
      const w = Math.max(0, Math.cos(a - notchYaw));
      const depth = prog * r * 0.92 * Math.pow(w, 0.55) * prof;
      const rr = Math.max(r * 0.06, base[vi] - depth);
      p.setX(vi, Math.sin(a) * rr);
      p.setZ(vi, Math.cos(a) * rr);
      c.setX(vi, depth > 0.012 ? Math.min(1, depth / (r * 0.15) + 0.35) : 0);
    }
  }
  p.needsUpdate = true;
  c.needsUpdate = true;
  geo.computeVertexNormals();
}

export function updateNotch(vis) {
  const t = vis.tree;
  if (t.notchYaw == null) return;
  const prog = Math.round(t.cutProgress * 50) / 50;
  if (prog === vis.lastCut && t.notchYaw === vis.lastNotch) return;
  vis.lastCut = prog;
  vis.lastNotch = t.notchYaw;
  const r = radiusAt(t, 0);
  deformNotch(vis.stumpGeo, t.notchYaw, prog, CUT_HEIGHT, r * flare(CUT_HEIGHT), -1);
  deformNotch(vis.trunkGeo, t.notchYaw, prog, 0, r * flare(CUT_HEIGHT), 1);
}

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qs = new THREE.Quaternion();
const _e = new THREE.Euler();

/** per-frame: pose the upper group from the engine, shake, fade the crown, sections */
export function poseTree(vis, time, dt, ctx) {
  const t = vis.tree;
  const g = t.grow;
  vis.root.scale.setScalar(Math.max(0.05, g));
  if (t.notchYaw != null) updateNotch(vis);
  const p = trunkPose(t);
  vis.upper.position.set(p.bx - t.x, p.by - t.y, p.bz - t.z);
  _dir.set(p.dx, p.dy, p.dz);
  _q.setFromUnitVectors(_up, _dir);
  if (t.shake > 0 && t.state !== TS.FALLEN) {
    const k = t.shake / 0.22;
    const amp = 0.012 * k * (ctx.reducedMotion ? 0.4 : 1);
    _e.set(Math.sin(time * 71) * amp, 0, Math.cos(time * 63) * amp);
    _qs.setFromEuler(_e);
    _q.multiply(_qs);
  }
  vis.upper.quaternion.copy(_q);

  const down = t.state === TS.FALLEN || t.state === TS.SECTIONED;
  if (!down) vis.seenUp = true;
  if (down && !vis.fallen) {
    vis.fallen = true;
    // restored from a save already down → no crown-fade replay
    vis.crownFade = vis.seenUp ? 0 : 1;
    buildSections(vis, ctx);
  }
  if (vis.fallen) {
    vis.crownFade = Math.min(1, vis.crownFade + dt / 1.6);
    const k = 1 - vis.crownFade;
    const sc = Math.max(0.001, k * k);
    vis.crown.visible = sc > 0.01;
    vis.crownTrunk.visible = sc > 0.01;
    if (vis.crown.visible) {
      vis.crown.scale.copy(vis.crownScale).multiplyScalar(sc);
      vis.crownTrunk.scale.set(sc, sc, sc);
    }
    vis.trunk.visible = false;
    if (vis.sections) {
      for (let i = 0; i < vis.sections.length; i++) vis.sections[i].visible = !t.sections[i] || !t.sections[i].freed;
      for (let k2 = 0; k2 < vis.marks.length; k2++) {
        const c = t.cuts[k2];
        const mk = vis.marks[k2];
        mk.group.visible = !!c && !c.done;
        if (c && !c.done) {
          const pr = 1 - c.hp / c.maxHp;
          mk.notch.visible = pr > 0.01;
          mk.notch.scale.set(1, Math.max(0.05, pr), 1);
          const sh = c.shake > 0 ? Math.sin(time * 80) * 0.01 * (c.shake / 0.18) : 0;
          mk.group.position.y = mk.baseY + sh;
        }
      }
    }
  }
}

/** split the fallen trunk into section meshes + cut marks along the lie */
function buildSections(vis, ctx) {
  const t = vis.tree;
  if (!t.sections.length || vis.sections) return;
  const sp = speciesById(t.species);
  const lm = logMaterials(sp.id);
  const grp = new THREE.Group();
  vis.root.add(grp);
  const L = t.lie;
  const yaw = Math.atan2(L.dx, L.dz);
  const pitch = Math.asin(Math.max(-1, Math.min(1, L.dy)));
  vis.sections = t.sections.map((s) => {
    const len = s.s1 - s.s0;
    const geo = logGeometry(len, radiusAt(t, s.s0), radiusAt(t, s.s1), 14, s.s0);
    const m = new THREE.Mesh(geo, lm.list);
    const mid = (s.s0 + s.s1) / 2;
    m.position.set(L.bx + L.dx * mid - t.x, L.by + L.dy * mid - t.y, L.bz + L.dz * mid - t.z);
    m.rotation.set(0, 0, 0);
    m.rotateY(yaw);
    m.rotateX(-pitch);
    m.castShadow = ctx.shadows;
    m.receiveShadow = true;
    grp.add(m);
    vis.disposables.push(geo);
    return m;
  });
  const markMat = new THREE.MeshStandardMaterial({ color: "#3a2a1c", roughness: 0.9 });
  const notchMat = new THREE.MeshStandardMaterial({ color: sp.wood.fresh, roughness: 0.75 });
  vis.disposables.push(markMat, notchMat);
  vis.marks = t.cuts.map((c) => {
    const r = radiusAt(t, c.s);
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, 0.012, 4, 20), markMat);
    g.add(band);
    // V-notch on top, grows with cut progress (scale.y)
    const shape = new THREE.Shape();
    shape.moveTo(-0.09, 0);
    shape.lineTo(0.09, 0);
    shape.lineTo(0, -1);
    shape.closePath();
    const ng = new THREE.ExtrudeGeometry(shape, { depth: r * 1.5, bevelEnabled: false });
    ng.translate(0, 0, -r * 0.75);
    ng.rotateY(Math.PI / 2);
    const notch = new THREE.Mesh(ng, notchMat);
    notch.position.y = r * 1.02;
    notch.scale.set(1, 0.05, 1);
    const pivot = new THREE.Group();
    pivot.add(notch);
    notch.scale.y = 0.05;
    // notch depth spans up to the radius
    notch.geometry.scale(1, r * 0.95, 1);
    g.add(pivot);
    vis.disposables.push(band.geometry, ng);
    const pos = { x: L.bx + L.dx * c.s - t.x, y: L.by + L.dy * c.s - t.y, z: L.bz + L.dz * c.s - t.z };
    g.position.set(pos.x, pos.y, pos.z);
    g.rotateY(yaw);
    g.rotateX(-pitch);
    grp.add(g);
    return { group: g, notch, baseY: pos.y };
  });
  vis.sectionGroup = grp;
}

export function disposeTree(vis) {
  vis.root.removeFromParent();
  for (const d of vis.disposables) d.dispose();
}

export function disposeTreeCaches() {
  for (const v of crownCache.values()) {
    v.foliage.dispose();
    if (v.branchGeo) v.branchGeo.dispose();
  }
  crownCache.clear();
  for (const m of matCache.values()) {
    m.trunk.dispose();
    m.branch.dispose();
    m.end.dispose();
    m.leaf.dispose();
  }
  matCache.clear();
  if (leafTex) {
    leafTex.dispose();
    leafTex = null;
  }
}

/** a non-interactive distant tree (instanced backdrop) */
export function backdropTreeGeometry(conifer) {
  const rng = createRng(conifer ? 3 : 4);
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.2, 2.4, 5);
  trunk.translate(0, 1.2, 0);
  parts.push(trunk);
  if (conifer) {
    for (let i = 0; i < 3; i++) {
      const c = new THREE.ConeGeometry(2.2 - i * 0.6, 3.2 - i * 0.5, 7);
      c.translate(0, 3 + i * 1.9, 0);
      parts.push(c);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.IcosahedronGeometry(1.6 + rng() * 0.6, 0);
      s.translate((rng() - 0.5) * 2, 4.2 + rng() * 1.6, (rng() - 0.5) * 2);
      parts.push(s);
    }
  }
  const g = mergeGeometries(parts.map((p) => {
    const n = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(n.attributes)) if (!["position", "normal"].includes(k)) n.deleteAttribute(k);
    return n;
  }));
  parts.forEach((p) => p.dispose());
  return g;
}
