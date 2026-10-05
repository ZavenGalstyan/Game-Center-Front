/**
 * Train Commander — the moving world (train-frame streaming).
 *
 * The train never moves; the world slides by. Scenery is cut into TILE-long
 * slices along X. Slice k covers world distance [k·TILE, (k+1)·TILE) and is
 * drawn at x = k·TILE − d. A fixed pool of slice objects covers the visible
 * window; a slice that scrolls off the back is re-assigned to the next index
 * ahead (far beyond the fog line, so nothing visibly pops). Everything in a
 * slice — its terrain heights, colours, props — is a pure function of
 * (route seed, k), so the same distance always shows the same scenery and
 * long journeys never accumulate drift (positions stay within ±250 units).
 *
 * Terrain heights come from one continuous function h(X, z) of WORLD
 * distance X, so neighbouring slices always meet seamlessly. Bridges carve a
 * gorge, tunnels raise a ridge — both via that function, over spans the
 * engine committed (tile-aligned).
 *
 * The track (ballast, rails, sleepers) is a fixed strip; sleepers shift by
 * −(d mod spacing) so they visibly stream past under the wheels.
 */
import * as THREE from "three";
import { T, paint, merge, box, cyl, cylX, cone, dome, prism, torus, rng, cached, vcMat, stdMat, basicMat, disposeTree } from "./geo.js";
import { groundTexture, ballastTexture, skyTexture, signTexture, blobTexture } from "./textures.js";
import { regionProps, windmillBlades } from "./props.js";
import { TILE, BOSS_RAIL_Z, RAIL_Y } from "../engine/constants.js";

export { RAIL_Y };
const SLEEPER_GAP = 0.9;
const BEHIND = 140; // streamed window behind the train centre
const AHEAD = 200; // …and ahead
const SLICE_COUNT = Math.ceil((AHEAD + BEHIND) / TILE) + 1;
const GZ0 = -120;
const GZ1 = 70;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (k, s) => {
  let x = (k * 374761393 + s * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/** continuous terrain; X is world distance along the line */
function terrainFactory(R, features) {
  const desert = R.key === "desert";
  const frozen = R.key === "frozen";
  return (X, z) => {
    const n1 = Math.sin(X * 0.021 + Math.sin(z * 0.05) * 1.3) * 0.5 + Math.sin(X * 0.0071 - z * 0.013 + 2) * 0.5;
    const n2 = Math.sin(X * 0.11 + z * 0.17) * Math.sin(X * 0.043 - z * 0.09);
    let h = n2 * 0.08;
    // far side: hills / canyon walls
    if (z < -24) {
      const far = smooth(-26, desert ? -44 : -70, z);
      h += far * ((desert ? 9 : frozen ? 7 : 5) + (n1 + 1) * (desert ? 4 : 6));
      if (z < -80) h += smooth(-80, -120, z) * (frozen ? 18 : 10) * (0.6 + 0.4 * n1);
    }
    // near (camera) side: always gentle so it never blocks the view
    if (z > 22) h += smooth(22, 70, z) * (1.2 + n1 * 0.8);
    // bridges carve a gorge, tunnels raise a ridge
    for (const f of features) {
      if (X < f.start - 2 || X > f.end + 2) continue;
      const u = (X - f.start) / (f.end - f.start);
      const bump = smooth(0, 0.16, u) * smooth(1, 0.84, u);
      if (f.kind === "bridge") h -= 9 * bump * smooth(0, 1.5, Math.abs(z) + 0.5);
      else {
        const side = z < 0 ? 11 : 3.2;
        h += bump * side * smooth(3.0, 6.5, Math.abs(z)) + bump * 1.2 * smooth(6, 14, Math.abs(z));
      }
    }
    return h;
  };
}

/* ================================================================ track */
function buildTrack(R, z0, twin) {
  const g = new THREE.Group();
  const len = AHEAD + BEHIND + 40;
  const cx = (AHEAD - BEHIND) / 2;
  // ballast embankment: trapezoid prism along X
  const bal = prism([[-2.0, 0], [2.0, 0], [1.25, 0.24], [-1.25, 0.24]], len);
  bal.rotateY(Math.PI / 2);
  // world-scale UVs for the ballast texture (scrolled by offset)
  const pos = bal.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / 3;
    uv[i * 2 + 1] = pos.getZ(i) / 3;
  }
  bal.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const btex = ballastTexture().clone();
  btex.needsUpdate = true;
  const balMat = new THREE.MeshStandardMaterial({ color: R.ballast, map: btex, roughness: 0.95 });
  const ballast = new THREE.Mesh(bal, balMat);
  ballast.position.set(cx, 0, z0);
  ballast.receiveShadow = true;
  g.add(ballast);
  // rails (static: a rail looks identical as it slides)
  const railGeo = merge([-0.75, 0.75].flatMap((z) => [paint(T(box(len, 0.1, 0.08), 0, RAIL_Y - 0.05, z), "#8f9399"), paint(T(box(len, 0.06, 0.16), 0, RAIL_Y - 0.13, z), "#5d5f63")]));
  const rails = new THREE.Mesh(railGeo, vcMat("tc-rail", { roughness: 0.35, metalness: 0.75, flatShading: false }));
  rails.position.set(cx, 0, z0);
  rails.receiveShadow = true;
  g.add(rails);
  // sleepers: one instanced strip, shifted by −(d mod gap)
  const n = Math.ceil(len / SLEEPER_GAP);
  const slGeo = cached(`sleeper-${R.key}`, () => merge([paint(T(box(0.26, 0.12, 2.3), 0, 0.29, 0), R.key === "iron" ? "#4a4644" : "#5a4632", 0.12), paint(T(box(0.1, 0.03, 0.12), 0, 0.36, -0.75), "#3a3a3d"), paint(T(box(0.1, 0.03, 0.12), 0, 0.36, 0.75), "#3a3a3d")]));
  const sleepers = new THREE.InstancedMesh(slGeo, vcMat("tc-sleeper", { roughness: 0.9 }), n);
  const o = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    o.position.set(-len / 2 + i * SLEEPER_GAP, 0, 0);
    o.rotation.y = (hash(i, 3) - 0.5) * 0.04;
    o.updateMatrix();
    sleepers.setMatrixAt(i, o.matrix);
  }
  sleepers.receiveShadow = true;
  sleepers.frustumCulled = false;
  const sg = new THREE.Group();
  sg.position.set(cx, 0, z0);
  sg.add(sleepers);
  g.add(sg);
  return { group: g, sleepers: sg, btex, cx, twin };
}

/* ================================================================ set pieces */
function bridgeObject(R, len) {
  const g = new THREE.Group();
  const P = [];
  const add = (geo, c, j = 0.06) => P.push(paint(geo, c, j, P.length + 1));
  const style = R.key === "valley" ? "stone" : R.key === "desert" ? "trestle" : "truss";
  const deckY = 0.02;
  // deck under the ballast
  add(T(box(len, 0.5, 4.2), 0, deckY - 0.25, 0), style === "stone" ? "#9a9184" : "#4a4644");
  const span = style === "stone" ? 10 : 8;
  const piers = Math.max(1, Math.round(len / span));
  for (let i = 0; i <= piers; i++) {
    const x = -len / 2 + (i * len) / piers;
    if (style === "stone") {
      add(T(box(1.6, 10, 4.0), x, -5, 0), "#a39a8c", 0.08);
      add(T(box(2.0, 0.6, 4.4), x, -10, 0), "#8a8276");
    } else if (style === "trestle") {
      for (const z of [-1.6, -0.6, 0.6, 1.6]) add(T(box(0.25, 10, 0.25), x, -5, z, z * 0.03), "#7a5a3a", 0.1);
      for (let k = 0; k < 4; k++) add(T(box(0.12, 0.12, 4.0), x, -1.5 - k * 2.4, 0), "#6b4a2e");
      for (let k = 0; k < 3; k++) add(T(box(0.1, 3.4, 0.1), x, -3 - k * 2.4, 1.6, 0, 0, 0.6 * (k % 2 ? 1 : -1)), "#6b4a2e");
    } else {
      add(T(box(1.0, 10, 3.2), x, -5, 0), R.key === "iron" ? "#55504d" : "#5a5666", 0.06);
    }
  }
  if (style === "stone") {
    // arches between piers
    for (let i = 0; i < piers; i++) {
      const x = -len / 2 + ((i + 0.5) * len) / piers;
      // spandrel: the wall above an elliptical arch between two piers
      const w = len / piers - 1.6;
      const s = new THREE.Shape();
      s.moveTo(-w / 2, 0);
      s.lineTo(w / 2, 0);
      s.lineTo(w / 2, -3);
      s.absellipse(0, -3, w / 2, 2.5, 0, Math.PI, false);
      s.lineTo(-w / 2, 0);
      const a = new THREE.ExtrudeGeometry(s, { depth: 0.6, bevelEnabled: false, curveSegments: 12 });
      for (const z of [-1.7, 1.7]) add(T(a.clone(), x, 0, z - 0.3), "#b0a796", 0.06);
      a.dispose();
    }
    for (const z of [-2.0, 2.0]) add(T(box(len, 0.55, 0.3), 0, 0.3, z), "#b8ae9c", 0.05);
  } else {
    // pony trusses either side (no overhead bracing, the view stays open)
    const col = R.key === "desert" ? "#7a5a3a" : R.key === "frozen" ? "#4f6a80" : R.key === "shadow" ? "#3e3a48" : "#7a3a28";
    for (const z of [-2.15, 2.15]) {
      add(T(box(len, 0.22, 0.22), 0, 2.2, z), col);
      add(T(box(len, 0.22, 0.26), 0, 0.15, z), col);
      const n = Math.round(len / 3);
      for (let k = 0; k <= n; k++) {
        const x = -len / 2 + (k * len) / n;
        add(T(box(0.16, 2.1, 0.18), x, 1.2, z), col);
        if (k < n) add(T(box(0.12, 2.9, 0.14), x + len / n / 2, 1.2, z, 0, 0, (k % 2 ? 1 : -1) * 0.78), col);
      }
    }
  }
  const mesh = new THREE.Mesh(merge(P), vcMat("tc-bridge", { roughness: 0.8, metalness: 0.15 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  // river / ice / dry bed at the gorge floor
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(len + 30, 240),
    new THREE.MeshStandardMaterial({ color: R.key === "frozen" ? "#cdeaf5" : R.key === "desert" ? "#c08a58" : R.key === "shadow" ? "#3b5566" : R.water, roughness: R.key === "frozen" ? 0.25 : 0.15, metalness: 0.1, transparent: false })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -7.4, -40);
  water.receiveShadow = true;
  g.add(water);
  return g;
}

function tunnelObject(R, len) {
  const g = new THREE.Group();
  const rockCol = R.key === "frozen" ? "#8d98a4" : R.key === "desert" ? "#b86a3e" : R.key === "shadow" ? "#4a4452" : R.key === "iron" ? "#5c5864" : "#8f8a80";
  // portals (stone frames with a keystone) at both ends
  const portal = cached(`portal-${R.key}`, () => {
    // arch frame; the outer edge starts below ground so the opening is a
    // proper hole (a hole touching the outline would not triangulate)
    const s = new THREE.Shape();
    s.moveTo(-4, -1);
    s.lineTo(4, -1);
    s.lineTo(4, 6.0);
    s.lineTo(-4, 6.0);
    s.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-2.2, -0.5);
    hole.lineTo(2.2, -0.5);
    hole.lineTo(2.2, 3.0);
    hole.absarc(0, 3.0, 2.2, 0, Math.PI, false);
    hole.lineTo(-2.2, -0.5);
    s.holes.push(hole);
    const e = new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: false, curveSegments: 12 });
    e.translate(0, 0, -0.6);
    e.rotateY(Math.PI / 2);
    return merge([paint(e, rockCol === "#8f8a80" ? "#a59e92" : rockCol, 0.08), paint(T(box(1.3, 0.9, 1.0), 0, 5.3, 0), "#c9c0b0"), paint(T(box(1.4, 0.3, 8.2), 0, 6.1, 0), "#77716a")]);
  });
  const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, transparent: true, opacity: 1 });
  for (const x of [-len / 2, len / 2]) {
    const m = new THREE.Mesh(portal, pm);
    m.position.set(x, 0, 0);
    m.castShadow = true;
    g.add(m);
  }
  // roof shell (fades out while the train is inside so the view stays clear)
  const roofGeo = new THREE.CylinderGeometry(3.1, 3.1, len, 18, 1, true, 0, Math.PI);
  roofGeo.rotateZ(Math.PI / 2);
  const roofMat = new THREE.MeshStandardMaterial({ color: rockCol, roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 1, flatShading: true });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 3.3;
  roof.scale.set(1, 1.15, 1.2);
  g.add(roof);
  // tunnel lamps along the inside
  const lampMat = stdMat("tc-tlamp", { color: "#553300", emissive: "#ffb347", emissiveIntensity: 2.2 });
  const lamps = new THREE.Mesh(
    merge(Array.from({ length: Math.max(2, Math.round(len / 12)) }, (_, i) => paint(T(box(0.25, 0.18, 0.25), -len / 2 + 6 + i * 12, 4.9, -2.4), "#ffffff"))),
    lampMat
  );
  g.add(lamps);
  return { group: g, roofMat, portalMat: pm, lamps };
}

function stationObject(R, name, kind) {
  const g = new THREE.Group();
  const big = kind === "destination";
  const P = [];
  const add = (geo, c, j = 0.05) => P.push(paint(geo, c, j, P.length + 1));
  const L = big ? 44 : 30;
  // platform on the far side
  add(T(box(L, 0.42, 4.2), 0, 0.21, -4.0), "#b8ae9c");
  add(T(box(L, 0.06, 0.3), 0, 0.44, -2.05), "#e8c35a");
  // canopy with posts
  const cw = big ? 24 : 14;
  add(T(box(cw, 0.18, 3.6), 0, 3.6, -4.4), big ? "#3d5a74" : "#7a4a36");
  for (let i = 0; i <= 4; i++) add(T(cyl(0.08, 0.08, 3.2, 6), -cw / 2 + 0.5 + (i * (cw - 1)) / 4, 2.0, -5.4), "#3d3a38");
  // station building
  const bw = big ? 16 : 9;
  const bh = big ? 5.5 : 3.6;
  add(T(box(bw, bh, 5), 0, bh / 2, -10), big ? "#d9cbb0" : "#e6d6b6", 0.04);
  const roofG = prism([[-3, 0], [3, 0], [0, 2.2]], bw + 0.8);
  roofG.rotateY(Math.PI / 2);
  add(T(roofG, 0, bh, -10), big ? "#3d5a74" : "#8c4a36", 0.06);
  for (let i = 0; i < (big ? 6 : 3); i++) add(T(box(1.0, 1.5, 0.06), -bw / 2 + 1.6 + i * ((bw - 3.2) / Math.max(1, big ? 5 : 2)), bh * 0.5, -7.47), "#ffd58a");
  add(T(box(1.4, 2.2, 0.06), bw / 2 - 1.5, 1.1, -7.47), "#5a3d28");
  if (big) {
    // clock tower + flags
    add(T(box(2.6, 9, 2.6), -bw / 2 - 1.4, 4.5, -9), "#d9cbb0");
    add(T(cone(2.1, 2.6, 4), -bw / 2 - 1.4, 10.3, -9, 0, Math.PI / 4), "#3d5a74");
    add(T(cyl(0.9, 0.9, 0.1, 18), -bw / 2 - 1.4, 7.4, -7.65, Math.PI / 2), "#f2ead8");
    for (const x of [-8, 8]) {
      add(T(cyl(0.06, 0.06, 7, 6), x, 3.5, -2.9), "#3d3a38");
      add(T(box(0.04, 1.2, 1.8), x, 6.3, -2.0), "#e9c25a");
    }
  }
  // lamp posts
  for (let i = 0; i < 4; i++) {
    const x = -L / 2 + 3 + i * ((L - 6) / 3);
    add(T(cyl(0.06, 0.08, 3.2, 6), x, 1.6, -2.6), "#2b2f35");
    add(T(box(0.3, 0.36, 0.3), x, 3.3, -2.6), "#2b2f35");
  }
  // crates, benches
  add(T(box(0.9, 0.7, 0.9), 6, 0.77, -5.3), "#6b5236", 0.1);
  add(T(box(0.7, 0.55, 0.7), 6.9, 0.7, -5.0), "#7a5e3e", 0.1);
  add(T(box(2.0, 0.12, 0.5), -5, 0.85, -5.6), "#6b4a2e");
  const mesh = new THREE.Mesh(merge(P), vcMat("tc-station", { roughness: 0.85 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  // lamp glow heads
  const lm = new THREE.Mesh(merge(Array.from({ length: 4 }, (_, i) => paint(T(box(0.22, 0.22, 0.22), -L / 2 + 3 + i * ((L - 6) / 3), 3.25, -2.6), "#ffffff"))), stdMat("tc-slamp", { color: "#553300", emissive: "#ffd27a", emissiveIntensity: 1.6 }));
  g.add(lm);
  // name sign above the building door
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(big ? 9 : 6, big ? 1.6 : 1.1), new THREE.MeshBasicMaterial({ map: signTexture(name), toneMapped: false }));
  sign.position.set(0, bh + (big ? 0.6 : 0.4), -7.4);
  g.add(sign);
  return g;
}

/* ================================================================ slices */
class Slice {
  constructor(env) {
    this.env = env;
    this.k = null;
    this.group = new THREE.Group();
    const geo = new THREE.PlaneGeometry(TILE, GZ1 - GZ0, 10, 38);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, (GZ0 + GZ1) / 2);
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.base = Float32Array.from(geo.attributes.position.array);
    this.ground = new THREE.Mesh(geo, env.groundMat);
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
    this.inst = {};
    for (const [key, p] of Object.entries(env.props)) {
      const cap = key === "tuft" ? 70 : key === "flowers" ? 26 : 14;
      const mat = env.propMat(key);
      const m = new THREE.InstancedMesh(p.geo, mat, cap);
      m.count = 0;
      m.castShadow = p.shadow && env.quality !== "low";
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
      this.inst[key] = m;
    }
    this.blades = [];
  }

  assign(k) {
    this.k = k;
    const env = this.env;
    const X0 = k * TILE;
    const h = env.h;
    // terrain
    const pos = this.ground.geometry.attributes.position;
    const col = this.ground.geometry.attributes.color;
    const R = env.R;
    const cg = new THREE.Color(R.ground);
    const cg2 = new THREE.Color(R.ground2);
    const cd = new THREE.Color(R.dirt);
    const cr = new THREE.Color(R.rock);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const lx = this.base[i * 3];
      const lz = this.base[i * 3 + 2];
      const X = X0 + TILE / 2 + lx;
      const y = h(X, lz);
      pos.setY(i, y);
      const n = Math.sin(X * 0.09 + lz * 0.13) * 0.5 + Math.sin(X * 0.031 - lz * 0.07) * 0.5;
      c.copy(cg).lerp(cg2, 0.5 + n * 0.5);
      const az = Math.abs(lz);
      if (az < 3.6) c.lerp(cd, smooth(3.6, 2.2, az) * 0.85);
      if (y > 6) c.lerp(cr, smooth(6, 14, y) * 0.7);
      if (y < -1) c.lerp(cd, smooth(-1, -5, y) * 0.8);
      if (R.key === "frozen" && y > 10) c.lerp(new THREE.Color("#ffffff"), 0.6);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.ground.geometry.computeVertexNormals();
    // uv: world-continuous ground texture
    const uv = this.ground.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, ((X0 + TILE / 2 + this.base[i * 3]) / 9) % 4096, this.base[i * 3 + 2] / 9);
    }
    uv.needsUpdate = true;
    // props
    for (const m of Object.values(this.inst)) m.count = 0;
    for (const b of this.blades) b.visible = false;
    const items = env.layout(k);
    const o = new THREE.Object3D();
    let blades = 0;
    for (const it of items) {
      const m = this.inst[it.key];
      if (!m || m.count >= m.instanceMatrix.count) continue;
      const y = h(X0 + TILE / 2 + it.x, it.z) + (it.y || 0);
      o.position.set(it.x, y - (it.sink ?? 0.05), it.z);
      o.rotation.set(0, it.ry || 0, 0);
      o.scale.setScalar(it.s || 1);
      o.updateMatrix();
      m.setMatrixAt(m.count++, o.matrix);
      if (it.key === "windmill") {
        let bl = this.blades[blades];
        if (!bl) {
          bl = new THREE.Mesh(windmillBlades(), env.propMat("blades"));
          bl.castShadow = env.quality !== "low";
          this.group.add(bl);
          this.blades.push(bl);
        }
        bl.visible = true;
        bl.position.set(it.x + Math.cos(it.ry || 0) * 1.5 * (it.s || 1), y + 6.2 * (it.s || 1), it.z - Math.sin(it.ry || 0) * 1.5 * (it.s || 1));
        bl.rotation.set(0, (it.ry || 0) + Math.PI / 2, 0);
        bl.scale.setScalar(it.s || 1);
        blades++;
      }
    }
    for (const m of Object.values(this.inst)) {
      m.instanceMatrix.needsUpdate = true;
      m.visible = m.count > 0;
    }
  }
}

/* ================================================================ layout */
const KINDS_CORRIDOR = {
  valley: ["tuft", "tuft", "tuft", "flowers", "rock", "bush"],
  desert: ["tuft", "dry", "rock", "cactus", "tuft"],
  frozen: ["rock", "ice", "tuft", "drift"],
  shadow: ["tuft", "rock", "crystal", "dead"],
  iron: ["tuft", "rock", "rock", "tuft"], // no rust-red scrap near the action: it reads like raiders
};

export class Environment {
  /**
   * R: region · quality: low|medium|high · seed: route id (scenery identity)
   * opts.weather / opts.time drive lighting and particles (Scene reads them)
   */
  constructor(R, quality, seed, opts = {}) {
    this.R = R;
    this.quality = quality;
    this.seed = seed || 1;
    this.features = [];
    this.h = terrainFactory(R, this.features);
    this.group = new THREE.Group();
    this.density = quality === "low" ? 0.55 : quality === "high" ? 1.25 : 1;
    this.mats = new Map();
    const gtex = groundTexture();
    this.groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: gtex, roughness: 0.96, metalness: 0 });
    this.props = regionProps(R);
    // sky dome + sun
    const A = opts.atmo || { skyTop: R.skyTop, sky: R.sky, horizon: R.horizon, sun: R.sun, time: "day", weather: "clear" };
    this.A = A;
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture(A.skyTop, A.sky, A.horizon, `${R.key}-${A.time}-${A.weather}`), side: THREE.BackSide, fog: false, depthWrite: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(520, 24, 16), skyMat);
    this.sky.renderOrder = -10;
    this.group.add(this.sky);
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: blobTexture(), color: A.sun, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: A.time === "night" ? 0.55 : 0.9 }));
    const low = A.time === "sunset" || A.time === "morning";
    this.sun.scale.setScalar(A.time === "night" ? 34 : low ? 110 : 70);
    this.sun.position.set(-160, low ? 40 : A.time === "night" ? 120 : 150, -380);
    this.group.add(this.sun);
    // distant mountains (true parallax: they ride the ground, far away)
    this.mountains = this._mountains();
    this.group.add(this.mountains.group);
    this.clouds = this._clouds();
    this.group.add(this.clouds.group);
    // track(s)
    this.track = buildTrack(R, 0);
    this.group.add(this.track.group);
    this.twin = R.twinTrack || opts.twinTrack ? buildTrack(R, BOSS_RAIL_Z, true) : null;
    if (this.twin) this.group.add(this.twin.group);
    // slices
    this.slices = [];
    for (let i = 0; i < SLICE_COUNT; i++) {
      const s = new Slice(this);
      this.slices.push(s);
      this.group.add(s.group);
    }
    this.byK = new Map();
    this.setPieces = new Map(); // feature id / station key → object
    this.tunnelFactor = 0;
    this.lastD = null;
  }

  propMat(key) {
    let m = this.mats.get(key);
    if (!m) {
      if (key.startsWith("crystal")) m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.3, emissive: "#5a3fb0", emissiveIntensity: 0.9 });
      else if (key === "pond") m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.15 });
      else m = vcMat("tc-prop", { roughness: 0.88, flatShading: true });
      this.mats.set(key, m);
    }
    return m;
  }

  _mountains() {
    const R = this.R;
    const g = new THREE.Group();
    const r = rng(this.seed * 13 + 7);
    const geo = cached(`mtn-${R.key}`, () => {
      const P = [];
      const peak = (x, z, s, h) => {
        P.push(paint(T(cone(s, h, 7), x, h / 2 - 2, z, 0, x, 0), R.mountain, 0.1, Math.abs(x) + 1));
        P.push(paint(T(cone(s * 0.34, h * 0.34, 7), x, h - h * 0.17 - 2, z, 0, x, 0), R.mountainSnow, 0.05, Math.abs(x) + 2));
      };
      peak(0, 0, 38, 60);
      peak(-34, 12, 28, 42);
      peak(30, 8, 30, 46);
      peak(60, -10, 24, 34);
      return merge(P);
    });
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    // tint toward the horizon (aerial perspective) via a colour multiply
    mat.color.set(this.A.horizon).lerp(new THREE.Color("#ffffff"), this.A.time === "night" ? 0 : 0.55);
    if (this.A.time === "night") mat.color.multiplyScalar(0.45);
    const list = [];
    const SPAN = 760;
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.userData.x0 = -SPAN / 2 + (i * SPAN) / 8 + r() * 30;
      m.position.set(m.userData.x0, -3, -260 - r() * 60);
      m.scale.setScalar(0.8 + r() * 0.6);
      g.add(m);
      list.push(m);
    }
    return { group: g, list, SPAN };
  }

  _clouds() {
    const g = new THREE.Group();
    const r = rng(this.seed * 31 + 5);
    const list = [];
    const A = this.A;
    const grey = A.weather === "rain" || A.weather === "storm";
    const col = A.time === "night" ? "#3a4560" : A.time === "sunset" ? "#ffc4a0" : grey ? "#9aa2ac" : "#ffffff";
    const mat = new THREE.SpriteMaterial({ map: blobTexture(), color: col, transparent: true, depthWrite: false, fog: false, opacity: this.R.key === "shadow" ? 0.35 : grey ? 0.9 : 0.8 });
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(mat);
      s.userData.x0 = -400 + r() * 800;
      s.position.set(s.userData.x0, 70 + r() * 60, -150 - r() * 200);
      s.scale.set(90 + r() * 80, 26 + r() * 18, 1);
      g.add(s);
      list.push(s);
    }
    return { group: g, list };
  }

  /** which scenery a slice shows (deterministic) */
  kindAt(k) {
    const X = k * TILE;
    for (const f of this.features) if (X >= f.start - TILE && X < f.end + TILE) return f.kind === "bridge" ? "bridge" : "tunnel";
    for (const s of this.stations || []) if (Math.abs(X + TILE / 2 - s.at) < 40) return "station";
    const tiles = this.R.tiles;
    let tot = 0;
    for (const [, w] of tiles) tot += w;
    // pick in runs of 2–3 slices so areas read as places, not noise
    const run = Math.floor(k / 3);
    let x = hash(run, this.seed) * tot;
    for (const [kind, w] of tiles) {
      x -= w;
      if (x <= 0) return kind;
    }
    return tiles[0][0];
  }

  layout(k) {
    const kind = this.kindAt(k);
    const r = rng(k * 7919 + this.seed * 104729 + 13);
    const D = this.density;
    const items = [];
    const R = this.R;
    const P = this.props;
    const has = (key) => !!P[key];
    const put = (key, x, z, s = 1, extra) => has(key) && items.push({ key, x, z, ry: r() * Math.PI * 2, s, ...extra });
    const rx = () => (r() - 0.5) * (TILE - 2);
    // corridor clutter (low only): grass, flowers, pebbles
    const corr = KINDS_CORRIDOR[R.key];
    const nc = Math.round((kind === "station" ? 10 : 28) * D);
    for (let i = 0; i < nc; i++) {
      const side = r() < 0.55 ? -1 : 1;
      const z = side * (3.8 + r() * 20);
      const key = corr[Math.floor(r() * corr.length)];
      if (kind === "station" && z < 0 && z > -14) continue;
      if (key === "drift" || key === "dead") {
        if (Math.abs(z) > 12) put(key, rx(), z, 0.5 + r() * 0.4);
        continue;
      }
      put(key, rx(), z, 0.7 + r() * 0.6);
    }
    if (kind === "bridge") return items.filter((it) => Math.abs(it.z) > 40);
    const far = (n, keys, z0 = -30, z1 = -95, s0 = 0.8, s1 = 1.4) => {
      for (let i = 0; i < Math.round(n * D); i++) put(keys[Math.floor(r() * keys.length)], rx(), z0 + (z1 - z0) * r(), s0 + (s1 - s0) * r());
    };
    const nearLow = (n, keys) => {
      for (let i = 0; i < Math.round(n * D); i++) put(keys[Math.floor(r() * keys.length)], rx(), 9 + r() * 40, 0.8 + r() * 0.4);
    };
    // the visible far band: a loose line of mid-size scenery behind the action
    const band = { valley: ["bush", "treeA", "treeB", "rock", "bush", "pine"], desert: ["cactus", "cactus2", "rockBig", "dry", "rock"], frozen: ["pine", "pine2", "ice", "rock", "pineBare"], shadow: ["dead", "dead2", "crystal", "rock"], iron: ["scrap", "scrap2", "pylon", "dead", "rock"] }[R.key];
    if (kind !== "station" && kind !== "tunnel") for (let i = 0; i < Math.round(4 * D); i++) put(band[Math.floor(r() * band.length)], rx(), -27 - r() * 12, 0.7 + r() * 0.5);
    switch (kind) {
      case "station":
        far(4, R.key === "valley" ? ["treeA", "treeB"] : R.key === "desert" ? ["cactus", "rockBig"] : R.key === "frozen" ? ["pine", "pine2"] : R.key === "shadow" ? ["dead", "ruin"] : ["tank", "pylon"], -22, -60);
        break;
      case "tunnel":
        far(5, R.key === "valley" ? ["pine", "rockBig"] : R.key === "desert" ? ["rockBig"] : R.key === "frozen" ? ["pine", "pine2"] : R.key === "shadow" ? ["dead", "crystal"] : ["rockBig", "dead"], -16, -40);
        break;
      /* ------------- valley */
      case "meadow":
        far(5, ["treeA", "treeB", "rockBig", "bush"]);
        nearLow(4, ["bush", "flowers", "hay"]);
        if (r() < 0.4) put("pond", rx(), -30 - r() * 12, 0.8 + r() * 0.5, { sink: 0.02 });
        break;
      case "forest":
        far(14, ["treeA", "treeB", "pine", "pine"], -26, -90);
        nearLow(3, ["bush"]);
        break;
      case "farm":
        put(r() < 0.5 ? "cropA" : "cropB", rx() * 0.4, 34 + r() * 8, 1, { ry: 0 });
        put(r() < 0.5 ? "cropB" : "cropA", rx() * 0.4, -36 - r() * 6, 1, { ry: 0 });
        if (r() < 0.6) put("barn", rx() * 0.5, -52, 1, { ry: (r() - 0.5) * 0.6 });
        else put("windmill", rx() * 0.5, -46, 1.1, { ry: Math.PI / 2 + (r() - 0.5) * 0.6 });
        for (let i = 0; i < 4; i++) put("fence", -16 + i * 4, 28, 1, { ry: 0 });
        far(3, ["treeA", "hay"], -30, -70);
        break;
      case "village":
        for (let i = 0; i < Math.round(3 * D) + 1; i++) put(r() < 0.5 ? "house" : "house2", rx(), -32 - r() * 22, 0.9 + r() * 0.3, { ry: Math.PI / 2 + Math.round(r() * 2) * Math.PI / 2 });
        far(3, ["treeA", "treeB"]);
        nearLow(3, ["fence", "hay", "bush"]);
        break;
      case "hills":
        far(5, ["rockBig", "pine", "treeA"], -30, -80);
        nearLow(3, ["rock", "bush"]);
        break;
      /* ------------- desert */
      case "dunes":
        far(4, ["dune", "rockBig", "cactus2"], -28, -80, 1, 2);
        nearLow(4, ["dune", "dry"]);
        break;
      case "canyon":
        far(2, ["mesa", "mesa2"], -60, -100, 0.9, 1.3);
        far(4, ["rockBig", "cactus", "cactus2"], -28, -50);
        nearLow(2, ["rock", "dry"]);
        break;
      case "mesa":
        put("arch", rx() * 0.5, -40, 1.2, { ry: (r() - 0.5) * 0.4 });
        far(2, ["mesa", "mesa2"], -70, -105, 0.9, 1.2);
        nearLow(3, ["dry", "dune"]);
        break;
      case "settlement":
        for (let i = 0; i < Math.round(3 * D) + 1; i++) put(r() < 0.5 ? "adobe" : "adobe2", rx(), -30 - r() * 18, 1, { ry: Math.round(r() * 3) * Math.PI / 2 });
        put("tower", rx(), -28, 1);
        nearLow(3, ["fence", "cactus"]);
        break;
      /* ------------- frozen */
      case "pines":
        far(14, ["pine", "pine2", "pineBare"], -26, -90);
        nearLow(4, ["pine", "drift"]);
        break;
      case "snowfield":
        far(5, ["ice", "rockBig", "drift"], -28, -70);
        nearLow(4, ["drift", "ice"]);
        break;
      case "lake":
        put("pond", rx() * 0.3, -40, 2.2, { sink: 0.02 });
        far(5, ["pine", "pine2"], -58, -90);
        nearLow(3, ["drift"]);
        break;
      case "cabins":
        for (let i = 0; i < 2; i++) put(i ? "cabin2" : "cabin", rx(), -32 - r() * 16, 1, { ry: Math.PI / 2 });
        far(6, ["pine", "pine2"]);
        nearLow(2, ["fence"]);
        break;
      /* ------------- shadow */
      case "deadwood":
        far(12, ["dead", "dead2"], -26, -90, 1, 1.8);
        nearLow(3, ["dead2", "ash"]);
        break;
      case "ruins":
        far(3, ["ruin", "ruin2"], -30, -60);
        far(4, ["dead", "crystal"]);
        break;
      case "crystals":
        far(8, ["crystal", "crystal2"], -26, -80, 1.2, 2.6);
        nearLow(3, ["crystal2", "ash"]);
        break;
      case "ashfield":
        far(5, ["ash", "dead2", "rockBig"], -28, -80, 1, 1.6);
        nearLow(3, ["ash"]);
        break;
      /* ------------- iron */
      case "foundry":
        far(2, ["factory", "factory2"], -34, -60);
        far(3, ["pylon", "tank"], -24, -40);
        nearLow(4, ["rock", "rock"]);
        break;
      case "fortress":
        put("fort", rx() * 0.3, -46, 1.1, { ry: 0 });
        far(3, ["pylon", "dead"], -28, -36);
        nearLow(3, ["rock"]);
        break;
      case "yard":
        far(4, ["tank", "tank", "scrap", "pylon"], -26, -60);
        nearLow(3, ["rock"]);
        break;
      default:
        far(6, ["scrap", "scrap2", "dead", "rockBig"], -28, -80);
        nearLow(3, ["rock"]);
    }
    return items;
  }

  /** sync committed bridges/tunnels and stations from the engine */
  _syncSetPieces(engine) {
    // features
    for (const f of engine.features || []) {
      if (!this.features.some((x) => x.id === f.id)) {
        this.features.push({ id: f.id, kind: f.kind, start: f.start, end: f.end });
        // re-assign any slice already showing this stretch (only happens far ahead)
        for (const s of this.slices) if (s.k != null && s.k * TILE >= f.start - 2 * TILE && s.k * TILE < f.end + TILE) s.assign(s.k);
      }
    }
    this.stations = engine.stations || [];
    const want = new Set();
    const d = engine.d;
    for (const f of this.features) {
      const key = `f${f.id}`;
      if (f.end - d < -BEHIND - 40 || f.start - d > AHEAD + 40) continue;
      want.add(key);
      let sp = this.setPieces.get(key);
      if (!sp) {
        const len = f.end - f.start;
        if (f.kind === "bridge") sp = { group: bridgeObject(this.R, len), f };
        else sp = { ...tunnelObject(this.R, len), f };
        this.group.add(sp.group);
        this.setPieces.set(key, sp);
      }
      sp.group.position.x = (f.start + f.end) / 2 - d;
    }
    for (const s of this.stations) {
      const key = `s${s.kind}${Math.round(s.at)}`;
      if (s.at - d < -BEHIND || s.at - d > AHEAD) continue;
      want.add(key);
      let sp = this.setPieces.get(key);
      if (!sp) {
        sp = { group: stationObject(this.R, s.name, s.kind) };
        this.group.add(sp.group);
        this.setPieces.set(key, sp);
      }
      sp.group.position.x = s.at - d;
    }
    for (const [key, sp] of this.setPieces) {
      if (want.has(key)) continue;
      this.group.remove(sp.group);
      disposeTree(sp.group);
      this.setPieces.delete(key);
    }
  }

  /** per frame: stream slices, scroll track, place set pieces */
  update(engine, dt, t, trainExtent) {
    const d = engine.d;
    if (engine.loadId !== this.loadId) {
      // a new route (or restart): forget everything that belonged to the old one
      this.loadId = engine.loadId;
      this.features.length = 0;
      for (const [, sp] of this.setPieces) {
        this.group.remove(sp.group);
        disposeTree(sp.group);
      }
      this.setPieces.clear();
      this.byK.clear();
      for (const s of this.slices) s.k = null;
    }
    this._syncSetPieces(engine);
    // slices: window of k covering [d − BEHIND, d + AHEAD]
    const k0 = Math.floor((d - BEHIND) / TILE);
    const k1 = k0 + SLICE_COUNT - 1;
    const free = [];
    for (const s of this.slices) {
      if (s.k == null || s.k < k0 || s.k > k1) {
        if (s.k != null) this.byK.delete(s.k);
        s.k = null;
        free.push(s);
      }
    }
    for (let k = k0; k <= k1; k++) {
      if (this.byK.has(k)) continue;
      const s = free.pop();
      if (!s) break;
      s.assign(k);
      this.byK.set(k, s);
    }
    for (const s of this.slices) {
      if (s.k == null) {
        s.group.visible = false;
        continue;
      }
      s.group.visible = true;
      s.group.position.x = s.k * TILE + TILE / 2 - d;
      for (const b of s.blades) if (b.visible) b.rotation.z += dt * 0.9;
    }
    // track: sleepers + ballast texture stream past
    const sh = -(((d % SLEEPER_GAP) + SLEEPER_GAP) % SLEEPER_GAP);
    for (const tr of [this.track, this.twin]) {
      if (!tr) continue;
      tr.sleepers.position.x = tr.cx + sh;
      tr.btex.offset.x = ((d / 3) % 1 + 1) % 1;
    }
    // mountains + clouds: ride the ground (wrap far outside the view)
    const M = this.mountains;
    for (const m of M.list) {
      let x = m.userData.x0 - d * 0.35;
      x = ((((x + M.SPAN / 2) % M.SPAN) + M.SPAN) % M.SPAN) - M.SPAN / 2;
      m.position.x = x;
    }
    for (const c of this.clouds.list) {
      let x = c.userData.x0 - d * 0.12 - t * 0.6;
      x = ((((x + 400) % 800) + 800) % 800) - 400;
      c.position.x = x;
    }
    // tunnels: roof fades while it overlaps the train; atmosphere darkens
    let tf = 0;
    const [rear, front] = trainExtent;
    for (const sp of this.setPieces.values()) {
      if (!sp.roofMat) continue;
      const s = sp.f.start - d;
      const e = sp.f.end - d;
      const overlap = Math.max(0, Math.min(front + 6, e) - Math.max(rear - 6, s));
      const k = Math.min(1, overlap / Math.max(1, Math.min(front - rear + 12, e - s)));
      const near = Math.max(0, Math.min(1, 1 - (Math.max(s - front, rear - e) - 4) / 14));
      sp.roofMat.opacity = 1 - 0.88 * Math.max(near, k);
      sp.roofMat.depthWrite = sp.roofMat.opacity > 0.95;
      sp.portalMat.opacity = 1 - 0.6 * Math.max(near, k);
      sp.portalMat.depthWrite = sp.portalMat.opacity > 0.95;
      tf = Math.max(tf, k);
    }
    this.tunnelFactor += (tf - this.tunnelFactor) * (1 - Math.exp(-3 * dt));
  }

  dispose() {
    for (const [, sp] of this.setPieces) disposeTree(sp.group);
    for (const s of this.slices) s.ground.geometry.dispose();
    this.track.group.traverse((o) => o.geometry && !o.geometry.userData?.shared && o.geometry.dispose());
    if (this.twin) this.twin.group.traverse((o) => o.geometry && !o.geometry.userData?.shared && o.geometry.dispose());
    this.groundMat.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    for (const [k, m] of this.mats) if (!m.userData?.shared) m.dispose();
    this.track.btex.dispose();
    if (this.twin) this.twin.btex.dispose();
  }
}
