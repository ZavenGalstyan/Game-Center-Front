/**
 * School Life Simulator 3D — the Three.js view.
 *
 * createWorld(canvas) builds the school once from the shared layout:
 * thousands of primitives are written straight into a few merged,
 * vertex-coloured meshes per material and per 52 m chunk (so the static
 * school is ~60 draw calls and still frustum-culls), plus decal atlases,
 * doors on hinges, live wall clocks, characters, speech bubbles, markers and
 * activity props. render(state, dt) syncs everything from the Sim and runs
 * the collision-aware third-person camera.
 */
import * as THREE from "three";
import { getLayout, clamp, lerpAngle } from "./sim.js";
import { BOUNDS, isIndoor } from "./layout.js";
import { buildCharacter, animateRig, lookKey, disposeCharacterCache, charMaterial } from "./models.js";
import { surfaceTextures, buildAtlases, clockTexture, drawBubble } from "./textures.js";

const CHUNK = 52;
const UVS = { tile: 1.2, wood: 2.4, brick: 2.0, grass: 7, paving: 2.6, court: 3, net: 0.6 };
const BRICK = "#b65a3f";
const COLOR_CACHE = new Map();
function lin(hex) {
  let c = COLOR_CACHE.get(hex);
  if (!c) {
    c = new THREE.Color(hex || "#ffffff").convertSRGBToLinear();
    COLOR_CACHE.set(hex, c);
  }
  return c;
}

/* ===================================================================== accumulator */
class Acc {
  constructor(uvScale = 1) {
    this.p = [];
    this.n = [];
    this.c = [];
    this.u = [];
    this.i = [];
    this.v = 0;
    this.s = 1 / uvScale;
  }
  vert(x, y, z, nx, ny, nz, col) {
    this.p.push(x, y, z);
    this.n.push(nx, ny, nz);
    this.c.push(col.r, col.g, col.b);
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    const s = this.s;
    if (ay >= ax && ay >= az) this.u.push(x * s, z * s);
    else if (ax >= az) this.u.push(z * s, y * s);
    else this.u.push(x * s, y * s);
  }
  /** Adds a THREE geometry (already in world space). */
  geo(g, col) {
    const P = g.attributes.position.array;
    const N = g.attributes.normal.array;
    const base = this.v;
    const cnt = g.attributes.position.count;
    for (let k = 0; k < cnt; k++) this.vert(P[k * 3], P[k * 3 + 1], P[k * 3 + 2], N[k * 3], N[k * 3 + 1], N[k * 3 + 2], col);
    if (g.index) {
      const I = g.index.array;
      for (let k = 0; k < I.length; k++) this.i.push(base + I[k]);
    } else for (let k = 0; k < cnt; k++) this.i.push(base + k);
    this.v += cnt;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.v > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
const FACES = [
  { k: "px", n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], a: 0, b: 2, c: 1 },
  { k: "nx", n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], a: 0, b: 2, c: 1 },
  { k: "py", n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], a: 1, b: 0, c: 2 },
  { k: "ny", n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], a: 1, b: 0, c: 2 },
  { k: "pz", n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], a: 2, b: 0, c: 1 },
  { k: "nz", n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], a: 2, b: 0, c: 1 },
];
/** Writes a box face-by-face; route(faceKey) → { acc, col } or null to skip. */
function boxFaces(d, route) {
  const h = [d.sx / 2, d.sy / 2, d.sz / 2];
  const cr = Math.cos(d.ry || 0);
  const sr = Math.sin(d.ry || 0);
  const rot = (x, y, z) => [x * cr + z * sr, y, -x * sr + z * cr];
  for (const f of FACES) {
    const r = route(f.k);
    if (!r) continue;
    const hn = h[f.a];
    const hu = h[f.b];
    const hv = h[f.c];
    const [nx, ny, nz] = rot(...f.n);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const base = r.acc.v;
    for (const [su, sv] of corners) {
      const lx = f.n[0] * hn + f.u[0] * hu * su + f.v[0] * hv * sv;
      const ly = f.n[1] * hn + f.u[1] * hu * su + f.v[1] * hv * sv;
      const lz = f.n[2] * hn + f.u[2] * hu * su + f.v[2] * hv * sv;
      const [wx, wy, wz] = rot(lx, ly, lz);
      r.acc.vert(d.x + wx, d.y + wy, d.z + wz, nx, ny, nz, r.col);
    }
    r.acc.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    r.acc.v += 4;
  }
}

/* ===================================================================== world */
export function createWorld(canvas, { preserve = false, quality = "high" } = {}) {
  const L = getLayout();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== "low", preserveDrawingBuffer: preserve, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = quality !== "low";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const scene = new THREE.Scene();
  const SKY_H = new THREE.Color("#d8ecff");
  scene.fog = new THREE.Fog(SKY_H, 90, 300);
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.06, 900);
  camera.position.set(0, 8, -60);

  /* ---------------------------------------------------------------- lights & sky */
  const hemi = new THREE.HemisphereLight("#d6ecff", "#9a8a68", 0.95);
  scene.add(hemi);
  const amb = new THREE.AmbientLight("#ffffff", 0.18);
  scene.add(amb);
  const sun = new THREE.DirectionalLight("#fff1d8", 2.3);
  sun.castShadow = quality !== "low";
  const shadowSize = quality === "high" ? 2048 : 1024;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  const SH = quality === "high" ? 30 : 24;
  Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const disposables = [];
  {
    const g = new THREE.SphereGeometry(600, 32, 16);
    const col = [];
    const top = new THREE.Color("#4f97e8").convertSRGBToLinear();
    const mid = new THREE.Color("#9fcdf5").convertSRGBToLinear();
    const hor = new THREE.Color("#e8f3ff").convertSRGBToLinear();
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i) / 600;
      const c = y > 0.25 ? mid.clone().lerp(top, Math.min(1, (y - 0.25) / 0.6)) : hor.clone().lerp(mid, Math.max(0, y / 0.25));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    const sky = new THREE.Mesh(g, m);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    scene.add(sky);
    disposables.push(g, m);
    var skyMesh = sky; // eslint-disable-line no-var
  }
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: "#fff6d8", fog: false }));
  scene.add(sunDisc);
  disposables.push(sunDisc.geometry, sunDisc.material);

  /* ---------------------------------------------------------------- materials */
  const T = surfaceTextures(aniso);
  const M = {
    std: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }),
    emit: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    tile: new THREE.MeshStandardMaterial({ vertexColors: true, map: T.tile, roughness: 0.5 }),
    wood: new THREE.MeshStandardMaterial({ vertexColors: true, map: T.wood, roughness: 0.55 }),
    brick: new THREE.MeshStandardMaterial({ vertexColors: true, map: T.brick, roughness: 0.92 }),
    grass: new THREE.MeshStandardMaterial({ vertexColors: true, map: T.grass, roughness: 1 }),
    paving: new THREE.MeshStandardMaterial({ vertexColors: true, map: T.paving, roughness: 0.95 }),
    court: new THREE.MeshStandardMaterial({ vertexColors: true, map: T.court, roughness: 0.8 }),
    glassy: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.6, roughness: 0.08, metalness: 0.25 }),
    net: new THREE.MeshStandardMaterial({ vertexColors: true, map: T.net, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9 }),
    water: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.85, roughness: 0.08, metalness: 0.1, emissive: new THREE.Color("#0b3b5a") }),
    glass: new THREE.MeshStandardMaterial({ color: "#cfe9f7", transparent: true, opacity: 0.24, roughness: 0.05, metalness: 0.2, depthWrite: false }),
  };
  Object.values(M).forEach((m) => disposables.push(m));
  Object.values(T).forEach((t) => disposables.push(t));

  /* ---------------------------------------------------------------- static school */
  const accs = new Map();
  const accFor = (mat, cast, x, z) => {
    const ci = Math.floor((x - BOUNDS.x1) / CHUNK);
    const ck = Math.floor((z - BOUNDS.z1) / CHUNK);
    const key = `${mat}|${cast ? 1 : 0}|${ci},${ck}`;
    let a = accs.get(key);
    if (!a) {
      a = { mat, cast, acc: new Acc(UVS[mat] || 1) };
      accs.set(key, a);
    }
    return a.acc;
  };
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const protoCache = new Map();
  const proto = (key, fn) => {
    let g = protoCache.get(key);
    if (!g) {
      g = fn();
      protoCache.set(key, g);
    }
    return g;
  };
  const addGeo = (g, d, mat) => {
    const acc = accFor(mat, d.cast !== false && mat !== "emit" && mat !== "net", d.x, d.z);
    acc.geo(g, lin(d.c));
  };
  for (const d of L.vis) {
    const mat = d.m || "std";
    if (d.k === "box") {
      if (mat === "brickwall") {
        const accB = accFor("brick", d.cast !== false, d.x, d.z);
        const accS = accFor("std", d.cast !== false, d.x, d.z);
        const white = lin("#ffffff");
        boxFaces(d, (k) => {
          const c = d.fc && d.fc[k];
          if (!d.fc || c === BRICK) return { acc: accB, col: white };
          return { acc: accS, col: lin(c || d.c) };
        });
      } else if (mat === "brick") {
        const acc = accFor("brick", d.cast !== false, d.x, d.z);
        boxFaces(d, () => ({ acc, col: lin("#ffffff") }));
      } else {
        const acc = accFor(mat, d.cast !== false && mat !== "emit" && mat !== "net", d.x, d.z);
        boxFaces(d, (k) => ({ acc, col: lin((d.fc && d.fc[k]) || d.c) }));
      }
      continue;
    }
    let g;
    if (d.k === "cyl") {
      g = proto(`c${d.r}|${d.r2}|${d.seg}`, () => new THREE.CylinderGeometry(d.r, d.r2, 1, d.seg, 1)).clone();
      tmpE.set(d.rx || 0, 0, d.rz || 0);
      tmpQ.setFromEuler(tmpE);
      // scale along the cylinder axis first, then rotate + place
      g.applyMatrix4(new THREE.Matrix4().makeScale(1, d.h, 1));
      tmpM.compose(new THREE.Vector3(d.x, d.y, d.z), tmpQ, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(tmpM);
    } else if (d.k === "sph") {
      g = proto(`s${d.seg}`, () => new THREE.SphereGeometry(1, d.seg, Math.max(5, Math.round(d.seg * 0.7)))).clone();
      g.applyMatrix4(new THREE.Matrix4().makeScale(d.r, d.r * (d.sy || 1), d.r).setPosition(d.x, d.y, d.z));
    } else if (d.k === "cone") {
      g = proto(`k${d.seg}`, () => new THREE.ConeGeometry(1, 1, d.seg)).clone();
      g.applyMatrix4(new THREE.Matrix4().makeScale(d.r, d.h, d.r).setPosition(d.x, d.y, d.z));
    } else if (d.k === "ring") {
      g = new THREE.RingGeometry(d.r1, d.r2, d.seg || 48, 1, d.a0, d.a1);
      g.rotateX(-Math.PI / 2);
      g.translate(d.x, d.y, d.z);
    } else if (d.k === "torus") {
      g = new THREE.TorusGeometry(d.r, d.t, 6, 24);
      g.rotateX(Math.PI / 2);
      g.translate(d.x, d.y, d.z);
    } else continue;
    addGeo(g, d, mat === "brickwall" ? "brick" : mat);
    g.dispose();
  }
  // glass panes
  for (const gl of L.glass) {
    const acc = accFor("glass", false, gl.x, gl.z);
    boxFaces({ ...gl, ry: 0 }, () => ({ acc, col: lin("#ffffff") }));
  }
  protoCache.forEach((g) => g.dispose());
  const staticGroup = new THREE.Group();
  for (const { mat, cast, acc } of accs.values()) {
    if (!acc.v) continue;
    const geo = acc.build();
    const mesh = new THREE.Mesh(geo, M[mat] || M.std);
    mesh.castShadow = cast && quality !== "low";
    mesh.receiveShadow = mat !== "emit" && mat !== "glass";
    mesh.matrixAutoUpdate = false;
    if (mat === "glass") mesh.renderOrder = 2;
    staticGroup.add(mesh);
    disposables.push(geo);
  }
  scene.add(staticGroup);

  /* ---------------------------------------------------------------- scenery beyond the fence */
  {
    const acc = new Acc(1);
    const rng = (() => {
      let a = 1234;
      return () => {
        a = (a * 16807) % 2147483647;
        return a / 2147483647;
      };
    })();
    const houseCols = ["#e9d8c4", "#d8e3ef", "#f2e6c8", "#e7d0d0", "#d9e8d2"];
    const roofCols = ["#7a3b2e", "#4b5563", "#5b3a2a", "#355070"];
    const add = (g, c) => {
      acc.geo(g, lin(c));
      g.dispose();
    };
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2;
      const r = 150 + rng() * 40;
      const x = 10 + Math.cos(a) * r * 1.05;
      const z = 32 + Math.sin(a) * r;
      if (rng() < 0.55) {
        const w = 8 + rng() * 6;
        const h = 5 + rng() * 4;
        const b = new THREE.BoxGeometry(w, h, w * 0.8);
        b.rotateY(-a);
        b.translate(x, h / 2, z);
        add(b, houseCols[i % houseCols.length]);
        const rf = new THREE.ConeGeometry(w * 0.75, 3.5, 4);
        rf.rotateY(Math.PI / 4 - a);
        rf.translate(x, h + 1.75, z);
        add(rf, roofCols[i % roofCols.length]);
      } else {
        for (let k = 0; k < 3; k++) {
          const tx = x + (rng() - 0.5) * 14;
          const tz = z + (rng() - 0.5) * 14;
          const s = 5 + rng() * 5;
          const c = new THREE.ConeGeometry(s * 0.45, s * 1.6, 7);
          c.translate(tx, s * 0.8, tz);
          add(c, ["#2f6e3b", "#3b7a44", "#2b5f36"][k]);
        }
      }
    }
    // clouds
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const r = 200 + rng() * 160;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const cy = 70 + rng() * 50;
      for (let k = 0; k < 5; k++) {
        const s = new THREE.SphereGeometry(10 + rng() * 10, 9, 6);
        s.scale(1.6, 0.55, 1);
        s.translate(cx + (k - 2) * 12 + rng() * 5, cy + rng() * 4, cz + rng() * 8);
        add(s, "#ffffff");
      }
    }
    const geo = acc.build();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.matrixAutoUpdate = false;
    scene.add(m);
    disposables.push(geo, m.material);
  }

  /* ---------------------------------------------------------------- decals */
  const atlases = buildAtlases(L.decals, aniso);
  {
    const groups = new Map();
    for (const d of L.decals) {
      const key = `${d.atlas}|${d.emissive ? 1 : 0}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }
    for (const [key, list] of groups) {
      const [atlas, em] = key.split("|");
      const pos = [];
      const nor = [];
      const uv = [];
      const idx = [];
      let v = 0;
      for (const d of list) {
        const [u0, v0, u1, v1] = atlases[atlas].uv(d.key);
        const hw = d.w / 2;
        const hh = d.h / 2;
        let corners;
        let n;
        if (d.flat) {
          corners = [[-hw, 0, hh], [hw, 0, hh], [hw, 0, -hh], [-hw, 0, -hh]];
          n = [0, 1, 0];
        } else {
          const c = Math.cos(d.ry);
          const s = Math.sin(d.ry);
          // local plane faces +z; rotate around y
          corners = [[-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0]].map(([x, y, z]) => [x * c + z * s, y, -x * s + z * c]);
          n = [s, 0, c];
        }
        for (const [x, y, z] of corners) {
          pos.push(d.x + x, d.y + y, d.z + z);
          nor.push(...n);
        }
        uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
        v += 4;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const mat = em === "1" ? new THREE.MeshBasicMaterial({ map: atlases[atlas].texture, toneMapped: false }) : new THREE.MeshStandardMaterial({ map: atlases[atlas].texture, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, transparent: atlas === "poster", alphaTest: 0.05 });
      const mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
      disposables.push(g, mat);
    }
    Object.values(atlases).forEach((a) => disposables.push(a.texture));
  }

  /* ---------------------------------------------------------------- doors */
  const doorObjs = [];
  {
    const leafCache = new Map();
    const leafGeo = (lw, h, color, glass, dir) => {
      const key = `${lw}|${h}|${color}|${glass}|${dir}`;
      let g = leafCache.get(key);
      if (g) return g;
      const acc = new Acc(1);
      const add = (x0, x1, y0, y1, z0, z1, c) => boxFaces({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, sx: x1 - x0, sy: y1 - y0, sz: z1 - z0 }, () => ({ acc, col: lin(c) }));
      const sx = (a) => a * dir;
      const xs = (a, b) => [Math.min(sx(a), sx(b)), Math.max(sx(a), sx(b))];
      if (glass) {
        const f = 0.07;
        add(...xs(0, f), 0, h, -0.03, 0.03, color);
        add(...xs(lw - f, lw), 0, h, -0.03, 0.03, color);
        add(...xs(0, lw), 0, 0.12, -0.03, 0.03, color);
        add(...xs(0, lw), h - f, h, -0.03, 0.03, color);
        add(...xs(0, lw), 0.95, 1.02, -0.035, 0.035, "#9aa1aa");
      } else {
        add(...xs(0.02, lw - 0.02), 0, h - 0.02, -0.025, 0.025, color);
        // small window
        add(...xs(lw * 0.3, lw * 0.7), h * 0.55, h * 0.85, -0.03, 0.03, "#9cc9e6");
        add(...xs(lw * 0.15, lw * 0.85), 0.15, 0.3, -0.03, 0.03, "#8a8f99");
      }
      // handles on both sides
      add(...xs(lw - 0.16, lw - 0.06), 0.98, 1.02, -0.09, -0.03, "#d9dde2");
      add(...xs(lw - 0.16, lw - 0.06), 0.98, 1.02, 0.03, 0.09, "#d9dde2");
      g = acc.build();
      leafCache.set(key, g);
      disposables.push(g);
      return g;
    };
    const glassPane = new THREE.BoxGeometry(1, 1, 0.02);
    disposables.push(glassPane);
    for (const d of L.doors) {
      const leaves = [];
      const n = d.double ? 2 : 1;
      const lw = d.w / n;
      for (let k = 0; k < n; k++) {
        const pivot = new THREE.Group();
        const sideSign = k === 0 ? 1 : -1;
        if (d.axis === "x") pivot.position.set(d.x - (sideSign * d.w) / 2, d.y, d.z);
        else {
          pivot.position.set(d.x, d.y, d.z - (sideSign * d.w) / 2);
          pivot.rotation.y = -Math.PI / 2;
        }
        const holder = new THREE.Group();
        pivot.add(holder);
        const mesh = new THREE.Mesh(leafGeo(lw, d.h, d.color, d.glass, sideSign), M.std);
        mesh.castShadow = quality !== "low";
        holder.add(mesh);
        if (d.glass) {
          const gp = new THREE.Mesh(glassPane, M.glass);
          gp.scale.set(lw - 0.14, d.h - 0.2, 1);
          gp.position.set((sideSign * lw) / 2, 0.12 + (d.h - 0.2) / 2, 0);
          holder.add(gp);
        }
        scene.add(pivot);
        leaves.push({ holder, sign: sideSign });
      }
      doorObjs.push({ d, leaves });
    }
  }
  const syncDoors = (sim) => {
    for (let i = 0; i < doorObjs.length; i++) {
      const o = doorObjs[i];
      const sd = sim ? sim.doors[i] : null;
      const open = sd ? sd.open : 0;
      const e = 1 - (1 - open) * (1 - open);
      const ang = e * 1.6;
      for (const lf of o.leaves) {
        // axis x: swing toward ±z; axis z: the pivot is pre-rotated so the same rule applies
        lf.holder.rotation.y = -o.d.swing * lf.sign * ang * (o.d.axis === "z" ? -1 : 1);
      }
    }
  };

  /* ---------------------------------------------------------------- clocks */
  const clockTex = clockTexture();
  disposables.push(clockTex);
  const clockFaceG = new THREE.CircleGeometry(1, 32);
  const clockRimG = new THREE.TorusGeometry(1, 0.08, 6, 32);
  const handG = new THREE.BoxGeometry(1, 1, 1);
  handG.translate(0, 0.5, 0);
  const clockFaceM = new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.6 });
  const darkM = new THREE.MeshStandardMaterial({ color: "#20242c", roughness: 0.5 });
  const redM = new THREE.MeshStandardMaterial({ color: "#d23b3b", roughness: 0.5 });
  disposables.push(clockFaceG, clockRimG, handG, clockFaceM, darkM, redM);
  const clocks = L.clocks.map((c) => {
    const g = new THREE.Group();
    g.position.set(c.x, c.y, c.z);
    g.rotation.y = c.ry;
    g.scale.setScalar(c.r);
    const face = new THREE.Mesh(clockFaceG, clockFaceM);
    face.position.z = 0.02;
    const rim = new THREE.Mesh(clockRimG, darkM);
    rim.position.z = 0.03;
    const hr = new THREE.Mesh(handG, darkM);
    hr.scale.set(0.07, 0.5, 0.03);
    hr.position.z = 0.07;
    const mn = new THREE.Mesh(handG, darkM);
    mn.scale.set(0.05, 0.78, 0.03);
    mn.position.z = 0.09;
    const sc = new THREE.Mesh(handG, redM);
    sc.scale.set(0.02, 0.85, 0.02);
    sc.position.z = 0.11;
    g.add(face, rim, hr, mn, sc);
    scene.add(g);
    return { g, hr, mn, sc };
  });
  const syncClocks = (min, t) => {
    const hA = -((min / 60) % 12) / 12 * Math.PI * 2;
    const mA = -((min % 60) / 60) * Math.PI * 2;
    const sA = -((t % 60) / 60) * Math.PI * 2;
    for (const c of clocks) {
      c.hr.rotation.z = hA;
      c.mn.rotation.z = mA;
      c.sc.rotation.z = sA;
    }
  };

  /* ---------------------------------------------------------------- characters */
  const rigs = new Map(); // npc id → rig
  let playerRig = null;
  let playerKey = "";
  const ensurePlayer = (look) => {
    const k = lookKey(look);
    if (playerRig && playerKey === k) return playerRig;
    if (playerRig) playerRig.root.removeFromParent();
    playerRig = buildCharacter(look);
    playerKey = k;
    scene.add(playerRig.root);
    return playerRig;
  };
  const ensureNPCs = (sim) => {
    for (const n of sim.npcs) {
      if (rigs.has(n.id)) continue;
      const rig = buildCharacter(n.look);
      rig.seed = (n.idx || 0) * 1.7 + (n.type === "teacher" ? 11 : n.type === "staff" ? 23 : 0);
      scene.add(rig.root);
      rigs.set(n.id, rig);
    }
  };
  const keeperRig = buildCharacter({ skin: 3, hairStyle: "short", hairColor: "black", eyes: 0, outfit: "athlete", bottom: "shorts", build: 2, acc: { face: "none", head: "none", back: "none", neck: "none", chest: "none" } });
  keeperRig.root.visible = false;
  scene.add(keeperRig.root);
  // tray + food the player carries
  const trayG = new THREE.Group();
  {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.3), new THREE.MeshStandardMaterial({ color: "#e3832b", roughness: 0.6 }));
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.03, 16), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4 }));
    plate.position.set(-0.06, 0.03, 0);
    const food = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: "#e7b25a", roughness: 0.8 }));
    food.scale.y = 0.6;
    food.position.set(-0.06, 0.07, 0);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.1, 10), new THREE.MeshStandardMaterial({ color: "#ff9f1c", roughness: 0.5 }));
    cup.position.set(0.12, 0.06, 0.05);
    trayG.add(tray, plate, food, cup);
    trayG.visible = false;
    scene.add(trayG);
    trayG.traverse((o) => o.isMesh && disposables.push(o.geometry, o.material));
  }
  const notebookMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.36), new THREE.MeshStandardMaterial({ color: "#e0457b", emissive: "#5a0f2a", roughness: 0.6 }));
  notebookMesh.visible = false;
  scene.add(notebookMesh);
  disposables.push(notebookMesh.geometry, notebookMesh.material);

  /* ---------------------------------------------------------------- bubbles */
  const BUB = 6;
  const bubbles = [];
  for (let i = 0; i < BUB + 1; i++) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 200;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.SpriteMaterial({ map: t, depthTest: true, depthWrite: false, transparent: true, fog: false });
    const s = new THREE.Sprite(m);
    s.visible = false;
    s.renderOrder = 5;
    s.center.set(0.5, 0);
    scene.add(s);
    bubbles.push({ c, t, m, s, text: "", kind: "" });
    disposables.push(t, m);
  }
  const setBubble = (b, text, kind, x, y, z, scale = 1) => {
    if (b.text !== text || b.kind !== kind) {
      drawBubble(b.c, text, kind);
      b.t.needsUpdate = true;
      b.text = text;
      b.kind = kind;
    }
    b.s.visible = true;
    b.s.position.set(x, y, z);
    b.s.scale.set(2.4 * scale, (2.4 * scale * b.c.height) / b.c.width, 1);
  };

  /* ---------------------------------------------------------------- markers & props */
  const glowM = (c, op = 0.9) => {
    const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, toneMapped: false, depthWrite: false });
    disposables.push(m);
    return m;
  };
  const objMarker = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshStandardMaterial({ color: "#ffd23f", emissive: "#ffb300", emissiveIntensity: 1.2 }));
  objMarker.scale.y = 1.5;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 40, 8, 1, true), glowM("#ffd23f", 0.22));
  beam.renderOrder = 3;
  scene.add(objMarker, beam);
  disposables.push(objMarker.geometry, objMarker.material, beam.geometry);
  const ringG = new THREE.RingGeometry(0.26, 0.38, 24);
  ringG.rotateX(-Math.PI / 2);
  disposables.push(ringG);
  const seatRings = new THREE.InstancedMesh(ringG, glowM("#4dff88", 0.85), 24);
  seatRings.count = 0;
  seatRings.renderOrder = 3;
  scene.add(seatRings);
  const targetRing = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 28), glowM("#ffffff", 0.6));
  targetRing.geometry.rotateX(-Math.PI / 2);
  targetRing.renderOrder = 3;
  scene.add(targetRing);
  disposables.push(targetRing.geometry);
  const ballMat = new THREE.MeshStandardMaterial({ color: "#e8692a", roughness: 0.7 });
  const fballMat = new THREE.MeshStandardMaterial({ color: "#f7f7f5", roughness: 0.5 });
  const ballG = new THREE.SphereGeometry(0.12, 16, 12);
  const fballG = new THREE.SphereGeometry(0.11, 16, 12);
  const ball = new THREE.Mesh(ballG, ballMat);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(0.121, 0.006, 4, 24), new THREE.MeshBasicMaterial({ color: "#2a1a10" }));
  ball.add(seam);
  const seam2 = seam.clone();
  seam2.rotation.y = Math.PI / 2;
  ball.add(seam2);
  ball.castShadow = true;
  const fball = new THREE.Mesh(fballG, fballMat);
  fball.castShadow = true;
  const patch = new THREE.Mesh(new THREE.IcosahedronGeometry(0.112, 0), new THREE.MeshStandardMaterial({ color: "#222", wireframe: true }));
  fball.add(patch);
  ball.visible = fball.visible = false;
  scene.add(ball, fball);
  disposables.push(ballMat, fballMat, ballG, fballG, seam.geometry, seam.material, patch.geometry, patch.material);
  const cpG = new THREE.TorusGeometry(1.6, 0.09, 8, 36);
  const cpCur = new THREE.Mesh(cpG, glowM("#ffd23f", 0.95));
  const cpNext = new THREE.Mesh(cpG, glowM("#ffffff", 0.35));
  cpCur.visible = cpNext.visible = false;
  scene.add(cpCur, cpNext);
  disposables.push(cpG);
  const tgtG = new THREE.TorusGeometry(0.6, 0.05, 6, 28);
  const tgtRings = [new THREE.Mesh(tgtG, glowM("#ff4d6d", 0.9)), new THREE.Mesh(tgtG, glowM("#ff4d6d", 0.9))];
  tgtRings.forEach((r) => {
    r.visible = false;
    r.rotation.y = Math.PI / 2;
    scene.add(r);
  });
  disposables.push(tgtG);
  const arrowG = new THREE.ConeGeometry(0.18, 0.5, 3);
  arrowG.rotateX(Math.PI / 2);
  const aimArrow = new THREE.Mesh(arrowG, glowM("#ffd23f", 0.85));
  aimArrow.visible = false;
  scene.add(aimArrow);
  disposables.push(arrowG);
  const aimDots = [];
  for (let i = 0; i < 6; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), glowM("#ffd23f", 0.7));
    d.visible = false;
    scene.add(d);
    aimDots.push(d);
    disposables.push(d.geometry);
  }

  /* ---------------------------------------------------------------- confetti */
  const CONF = 220;
  const confG = new THREE.BufferGeometry();
  const confP = new Float32Array(CONF * 3);
  const confC = new Float32Array(CONF * 3);
  const confV = new Float32Array(CONF * 3);
  confG.setAttribute("position", new THREE.BufferAttribute(confP, 3));
  confG.setAttribute("color", new THREE.BufferAttribute(confC, 3));
  const confM = new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, depthWrite: false });
  const confetti = new THREE.Points(confG, confM);
  confetti.frustumCulled = false;
  confetti.visible = false;
  scene.add(confetti);
  disposables.push(confG, confM);
  let confT = 0;
  const burst = (x, y, z, n = CONF) => {
    const cols = ["#ff4d6d", "#ffd23f", "#4dff88", "#4f8cff", "#c86bfa", "#ff9f1c"].map((c) => new THREE.Color(c));
    for (let i = 0; i < CONF; i++) {
      const on = i < n;
      confP[i * 3] = x;
      confP[i * 3 + 1] = on ? y : -999;
      confP[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 3.5;
      confV[i * 3] = Math.cos(a) * s;
      confV[i * 3 + 1] = 3 + Math.random() * 5;
      confV[i * 3 + 2] = Math.sin(a) * s;
      const c = cols[i % cols.length];
      confC[i * 3] = c.r;
      confC[i * 3 + 1] = c.g;
      confC[i * 3 + 2] = c.b;
    }
    confG.attributes.color.needsUpdate = true;
    confT = 2.6;
    confetti.visible = true;
  };
  const stepConfetti = (dt) => {
    if (confT <= 0) return;
    confT -= dt;
    for (let i = 0; i < CONF; i++) {
      confV[i * 3 + 1] -= 9 * dt;
      confV[i * 3] *= 0.985;
      confV[i * 3 + 2] *= 0.985;
      confP[i * 3] += confV[i * 3] * dt;
      confP[i * 3 + 1] += confV[i * 3 + 1] * dt;
      confP[i * 3 + 2] += confV[i * 3 + 2] * dt;
    }
    confG.attributes.position.needsUpdate = true;
    confM.opacity = Math.min(1, confT);
    if (confT <= 0) confetti.visible = false;
  };

  /* ---------------------------------------------------------------- camera */
  const cam = { d: 4, look: new THREE.Vector3(), init: false, shake: 0, indoorK: 0 };
  const head = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const updateCamera = (sim, C, dt) => {
    const p = sim.player;
    const indoor = isIndoor(p.x, p.z);
    head.set(p.x, p.y + (p.seat ? 1.2 : 1.58), p.z);
    const pitch = clamp(C.pitch, -0.45, 1.15);
    const maxD = (indoor ? 3.4 : 4.8) * (C.distMul || 1) * (sim.activity && sim.activity.kind === "football" ? 1.15 : 1);
    const cp = Math.cos(pitch);
    const ox = -Math.sin(C.yaw) * cp;
    const oy = Math.sin(pitch);
    const oz = -Math.cos(C.yaw) * cp;
    desired.set(head.x + ox * maxD, head.y + oy * maxD, head.z + oz * maxD);
    const doors = sim.doorBoxes();
    const t = sim.space.raycast(head.x, head.y, head.z, desired.x, desired.y, desired.z, doors);
    const allowed = Math.max(0.3, maxD * t - 0.22);
    if (!cam.init) {
      cam.d = allowed;
      cam.init = true;
    }
    cam.d = allowed < cam.d ? allowed : cam.d + (allowed - cam.d) * Math.min(1, dt * 3);
    let cy = head.y + oy * cam.d;
    const floorY = p.y + 0.2;
    if (cy < floorY) cy = floorY;
    camera.position.set(head.x + ox * cam.d, cy, head.z + oz * cam.d);
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt * 2);
      camera.position.x += (Math.random() - 0.5) * cam.shake * 0.15;
      camera.position.y += (Math.random() - 0.5) * cam.shake * 0.15;
    }
    camera.lookAt(head.x, head.y + 0.05, head.z);
    if (playerRig) playerRig.root.visible = cam.d > 0.65;
    return indoor;
  };

  /* ---------------------------------------------------------------- sun by time of day */
  const sunDir = new THREE.Vector3();
  const setSun = (min, focus) => {
    const f = clamp((min - 420) / (1020 - 420), 0, 1); // 07:00 → 17:00
    const az = THREE.MathUtils.lerp(-2.2, 2.0, f); // east → west through the south
    const el = 0.35 + Math.sin(f * Math.PI) * 0.62;
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    sun.position.copy(focus).addScaledVector(sunDir, 70);
    sun.target.position.copy(focus);
    sunDisc.position.copy(camera.position).addScaledVector(sunDir, 520);
    sun.color.setHSL(0.1, 0.8, 0.86 + Math.sin(f * Math.PI) * 0.08);
  };

  /* ---------------------------------------------------------------- render */
  const focus = new THREE.Vector3();
  let frame = 0;
  const tmpV = new THREE.Vector3();
  const ANIM_NEAR = quality === "low" ? 22 : 36;
  function render(state, dt) {
    frame++;
    const { sim, mode } = state;
    const t = performance.now() / 1000;
    if (sim) {
      ensureNPCs(sim);
      syncDoors(sim);
    }
    // ---- camera by mode
    let indoor = false;
    if (mode === "menu") {
      const a = t * 0.045;
      camera.position.set(Math.sin(a) * 46, 13 + Math.sin(t * 0.1) * 2, -12 - Math.cos(a) * 44);
      camera.lookAt(0, 3.5, -4);
      focus.set(0, 0, -8);
    } else if (mode === "creator") {
      camera.position.set(-0.5, 1.2, -23.15);
      camera.lookAt(-0.72, 0.92, -21);
      focus.set(0, 0, -21);
    } else if (mode === "wardrobe" && sim) {
      const p = sim.player;
      const fx = Math.sin(p.yaw);
      const fz = Math.cos(p.yaw);
      camera.position.set(p.x + fx * 2.5 + fz * 0.15, p.y + 1.3, p.z + fz * 2.5 - fx * 0.15);
      // look a little to the right of the student so they sit left of the locker panel
      camera.lookAt(p.x + fz * 0.85, p.y + 0.98, p.z - fx * 0.85);
      focus.set(p.x, p.y, p.z);
      indoor = true;
      if (playerRig) playerRig.root.visible = true;
    } else if (sim) {
      indoor = updateCamera(sim, state.cam, dt);
      focus.set(sim.player.x, sim.player.y, sim.player.z);
    }
    skyMesh.position.copy(camera.position);
    cam.indoorK += ((indoor ? 1 : 0) - cam.indoorK) * Math.min(1, dt * 3);
    hemi.intensity = 0.95 + cam.indoorK * 0.55;
    amb.intensity = 0.18 + cam.indoorK * 0.32;
    setSun(sim ? sim.time : 600, focus);
    syncClocks(sim ? sim.time : 600, t);

    // ---- player
    const look = state.look || (sim && sim.save.look);
    if (look) {
      const rig = ensurePlayer(look);
      if (mode === "creator") {
        rig.root.visible = true;
        rig.root.position.set(0, 0, -21);
        rig.root.rotation.y = Math.PI + (state.creatorYaw || 0);
        animateRig(rig, { pose: state.creatorPose || "idle", t, seed: 0, wave: state.creatorWave || 0, celebrate: state.creatorCelebrate || 0 }, dt);
      } else if (mode === "menu") {
        rig.root.visible = false;
      } else if (sim) {
        const p = sim.player;
        if (mode === "wardrobe") rig.root.visible = true;
        rig.root.position.set(p.x, p.y, p.z);
        rig.root.rotation.y = p.yaw;
        const act = sim.activity;
        animateRig(rig, {
          pose: p.seat ? (p.eatT > 0 ? "eat" : sim.seatById.get(p.seat)?.kind === "desk" ? "sitClass" : "sit") : mode === "wardrobe" ? "idle" : "stand",
          listen: true,
          speed: p.onGround ? p.speed : 0,
          phase: p.anim.phase,
          t,
          air: !p.onGround && !p.seat,
          interact: p.anim.interact,
          celebrate: p.anim.celebrate,
          shoot: p.anim.shoot,
          kick: p.anim.kick,
          wave: p.anim.wave,
          raise: p.anim.wave > 0 && !!p.seat,
          charging: act && act.kind === "basketball" && act.charging,
          power: act ? act.power : 0,
        }, dt);
        trayG.visible = !!(p.carry && p.carry.food) && !p.seat;
        if (trayG.visible) {
          trayG.position.set(p.x + Math.sin(p.yaw) * 0.38, p.y + 1.02, p.z + Math.cos(p.yaw) * 0.38);
          trayG.rotation.y = p.yaw;
        } else if (p.carry && p.carry.food && p.seat) {
          const s = sim.seatById.get(p.seat);
          trayG.visible = true;
          trayG.position.set(s.x + Math.sin(s.yaw) * 0.5, s.y + 0.32, s.z + Math.cos(s.yaw) * 0.5);
          trayG.rotation.y = s.yaw;
        }
      }
    }

    // ---- NPCs
    let bi = 0;
    for (const b of bubbles) b.s.visible = false;
    if (!sim || mode === "creator") for (const r of rigs.values()) r.root.visible = false;
    if (sim && mode !== "creator") {
      const cx = camera.position.x;
      const cz = camera.position.z;
      const near = [];
      for (const n of sim.npcs) {
        const rig = rigs.get(n.id);
        if (!rig) continue;
        if (n.hidden) {
          rig.root.visible = false;
          continue;
        }
        const d = Math.hypot(n.x - cx, n.z - cz);
        rig.root.visible = d < 95;
        if (!rig.root.visible) continue;
        // full-detail mesh up close, the light LOD further away (with a little hysteresis)
        rig.setLOD(d < (rig.lod ? 14 : 17) ? 0 : 1);
        rig.root.position.set(n.x, n.y, n.z);
        rig.root.rotation.y = n.yaw;
        if (d < ANIM_NEAR || (frame + (n.idx || 0)) % 4 === 0) {
          animateRig(rig, {
            pose: n.seat ? n.pose || "sit" : n.speed > 0.1 ? "walk" : n.pose,
            speed: n.speed,
            phase: n.anim,
            t: t + rig.seed,
            seed: rig.seed,
            wave: n.wave > 0 ? n.wave : 0,
            mood: n.moodT > 0 ? n.mood : null,
            talking: !!n.bubble || sim.talking === n || (n.state === "chatting" && Math.sin(t * 0.6 + rig.seed * 2.3) > 0.35),
            listen: n.type === "student" && n.pose === "sitClass" && sim.currentClass() && sim.currentClass().status !== "done",
          }, d < ANIM_NEAR ? dt : dt * 4);
        }
        if (d < 18 && (n.bubble || (n.moodT > 0 && n.mood && n.mood !== "neutral"))) near.push([d, n]);
      }
      near.sort((a, b) => a[0] - b[0]);
      for (const [, n] of near) {
        if (bi >= BUB) break;
        const text = n.bubble || { love: "❤️", happy: "😊", sad: "😞", annoyed: "💢", worried: "😬" }[n.mood] || "";
        if (!text) continue;
        const h = (n.seat ? 1.45 : 1.95) * (n.type === "student" ? 0.98 : 1.06);
        setBubble(bubbles[bi++], text, n.bubble ? (n.type === "teacher" ? "teacher" : n.bubbleKind === "friend" ? "friend" : "npc") : "npc", n.x, n.y + h, n.z, n.bubble ? 1 : 0.45);
      }
      // name tag for the interaction target
      const tg = sim.target;
      if (tg && tg.kind === "npc" && !sim.talking) {
        const n = tg.npc;
        const f = sim.save.friends[n.id];
        const tag = n.type === "student" ? `${n.name}  ·  ♥ ${Math.round(f)}` : n.type === "teacher" ? `${n.name}${n.subject ? ` · ${n.subject === "pe" ? "PE" : n.subject === "cs" ? "Comp Sci" : n.subject[0].toUpperCase() + n.subject.slice(1)}` : ""}` : `${n.name} · ${n.role}`;
        const busy = bubbles.slice(0, bi).some((b) => b.s.visible && Math.abs(b.s.position.x - n.x) < 0.01 && Math.abs(b.s.position.z - n.z) < 0.01);
        setBubble(bubbles[BUB], tag, "name", n.x, n.y + (n.seat ? 1.45 : 1.95) + (busy ? 0.85 : 0), n.z, 0.62);
        targetRing.visible = true;
        targetRing.position.set(n.x, n.y + 0.04, n.z);
      } else targetRing.visible = false;
      if (tg && tg.kind === "inter") {
        targetRing.visible = true;
        targetRing.position.set(tg.it.x, tg.it.y - 1 + 0.04, tg.it.z);
      }
    } else targetRing.visible = false;

    // ---- markers
    if (sim && mode === "play") {
      const ob = sim.objective();
      const tgt = ob && ob.target;
      if (tgt && !sim.activity) {
        const p = sim.player;
        const dist = Math.hypot(tgt.x - p.x, tgt.z - p.z);
        const isNpc = sim.npcs.some((n) => n.x === tgt.x && n.z === tgt.z);
        objMarker.visible = dist > 1.8;
        objMarker.position.set(tgt.x, (tgt.y || 0) + (isNpc ? 2.55 : 2.2) + Math.sin(t * 2.5) * 0.12, tgt.z);
        objMarker.rotation.y = t * 1.6;
        beam.visible = dist > 8;
        beam.position.set(tgt.x, (tgt.y || 0) + 20, tgt.z);
      } else objMarker.visible = beam.visible = false;
      // free seats glow when your class is about to start / running
      const nx = sim.nextClass();
      let count = 0;
      const p = sim.player;
      if (nx && nx.cls.room && nx.cls.subject !== "pe" && !p.seat && nx.cls.status !== "done" && nx.block.start - sim.time < 14) {
        const seats = L.classSeats[nx.cls.room] || [];
        const door = L.entries[nx.cls.room]?.outside;
        const inRoom = (p.zone && p.zone.id === nx.cls.room) || (door && Math.hypot(door.x - p.x, door.z - p.z) < 9 && Math.abs(door.y - p.y) < 1.5);
        if (inRoom) {
          const m4 = new THREE.Matrix4();
          for (const s of seats) {
            if (s.occ || (s.reserved && sim.npcById.get(s.reserved) && !sim.npcById.get(s.reserved).hidden)) continue;
            if (count >= 24) break;
            m4.makeTranslation(s.x, s.y - 0.47 + 0.03, s.z);
            seatRings.setMatrixAt(count++, m4);
          }
          seatRings.instanceMatrix.needsUpdate = true;
        }
      }
      seatRings.count = count;
      // notebook item
      const nb = sim.notebookItem;
      notebookMesh.visible = !!(nb && !nb.taken);
      if (notebookMesh.visible) {
        notebookMesh.position.set(nb.x, nb.y + 0.05 + Math.abs(Math.sin(t * 2)) * 0.05, nb.z);
        notebookMesh.rotation.y = t;
      }
    } else {
      objMarker.visible = beam.visible = false;
      seatRings.count = 0;
      notebookMesh.visible = false;
    }

    // ---- activities
    const act = sim && sim.activity;
    ball.visible = fball.visible = keeperRig.root.visible = cpCur.visible = cpNext.visible = aimArrow.visible = false;
    tgtRings.forEach((r) => (r.visible = false));
    aimDots.forEach((d) => (d.visible = false));
    if (act && mode === "play") {
      const p = sim.player;
      if (act.kind === "basketball") {
        ball.visible = true;
        if (act.ball) ball.position.set(act.ball.x, act.ball.y, act.ball.z);
        else {
          const up = act.charging ? 2.0 : 1.15 + Math.abs(Math.sin(t * 7)) * -0.6 + 0.3;
          ball.position.set(p.x + Math.sin(p.yaw) * 0.38, p.y + (act.charging ? up : Math.max(0.15, up)), p.z + Math.cos(p.yaw) * 0.38);
        }
        ball.rotation.x += dt * 6;
        if (act.charging) {
          // dotted arc preview toward the hoop
          const h = act.hoop;
          for (let i = 0; i < aimDots.length; i++) {
            const f = (i + 1) / (aimDots.length + 1);
            aimDots[i].visible = true;
            aimDots[i].position.set(p.x + (h.x - p.x) * f * 0.5, p.y + 2.1 + Math.sin(f * Math.PI * 0.5) * 1.2 * act.power, p.z + (h.z - p.z) * f * 0.5);
          }
        }
      } else if (act.kind === "football") {
        fball.visible = true;
        const b = act.ball && !act.ball.done ? act.ball : act.ball && act.cool > 0 ? act.ball : null;
        if (b) fball.position.set(b.x, b.y, b.z);
        else fball.position.set(act.ballRest.x, act.ballRest.y, act.ballRest.z);
        if (b) fball.rotation.z -= dt * 12;
        keeperRig.root.visible = true;
        const G = act.goal;
        keeperRig.root.position.set(G.x - 0.4, 0, act.keeper.z);
        keeperRig.root.rotation.set(0, -Math.PI / 2, act.keeper.dive > 0 ? clamp((act.keeper.target - act.keeper.z) * 0.4, -0.9, 0.9) : 0);
        animateRig(keeperRig, { pose: "stand", speed: Math.abs(act.keeper.v) * 0.4, phase: t * 6, t, celebrate: act.ball && act.ball.result === "saved" && act.cool > 0 ? 0.5 : 0 }, dt);
        tgtRings[0].visible = tgtRings[1].visible = true;
        tgtRings[0].position.set(G.x - 0.05, 1.9, G.z - 2.85);
        tgtRings[1].position.set(G.x - 0.05, 1.9, G.z + 2.85);
        if (!act.ball || act.ball.done) {
          aimArrow.visible = true;
          const yaw = Math.PI / 2 + act.aim;
          const len = 0.9 + (act.charging ? act.power * 1.6 : 0.6);
          aimArrow.position.set(act.ballRest.x + Math.sin(yaw) * len, 0.06, act.ballRest.z + Math.cos(yaw) * len);
          aimArrow.rotation.set(0, yaw, 0);
          aimArrow.scale.setScalar(act.charging ? 1 + act.power : 1);
        }
      } else if (act.kind === "running" || act.kind === "pe") {
        const c = act.course[act.idx];
        const n2 = act.course[act.idx + 1];
        const r = act.kind === "pe" ? 0.75 : 1;
        if (c) {
          cpCur.visible = true;
          cpCur.position.set(c.x, c.y + 1.6 * r, c.z);
          const prev = act.idx > 0 ? act.course[act.idx - 1] : sim.player;
          cpCur.rotation.y = Math.atan2(c.x - prev.x, c.z - prev.z);
          cpCur.scale.setScalar(r * (1 + Math.sin(t * 5) * 0.04));
          beam.visible = true;
          beam.position.set(c.x, 20, c.z);
        }
        if (n2) {
          cpNext.visible = true;
          cpNext.position.set(n2.x, n2.y + 1.6 * r, n2.z);
          cpNext.rotation.y = Math.atan2(n2.x - c.x, n2.z - c.z);
          cpNext.scale.setScalar(r);
        }
      }
    }
    stepConfetti(dt);
    renderer.render(scene, camera);
  }

  /* ---------------------------------------------------------------- sizing & lifecycle */
  let pr = 1;
  const setQuality = (q) => {
    pr = Math.min(window.devicePixelRatio || 1, q === "high" ? 1.75 : q === "medium" ? 1.25 : 1);
    renderer.setPixelRatio(pr);
    renderer.shadowMap.enabled = q !== "low";
    sun.castShadow = q !== "low";
    staticGroup.children.forEach((m) => {
      if (m.material !== M.emit && m.material !== M.glass && m.material !== M.net) m.castShadow = q !== "low" && m.userData.cast !== false;
    });
    scene.traverse((o) => {
      if (o.material) o.material.needsUpdate = true;
    });
  };
  setQuality(quality);
  const resize = (w, h) => {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const dispose = () => {
    renderer.dispose();
    disposables.forEach((d) => d.dispose && d.dispose());
    ringG.dispose();
    disposeCharacterCache();
    charMaterial().dispose();
    scene.clear();
  };
  return {
    renderer, scene, camera, render, resize, dispose, setQuality, burst,
    shake: (k) => (cam.shake = Math.max(cam.shake, k)),
    resetCam: () => (cam.init = false),
    stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries }),
    project(x, y, z, w, h) {
      tmpV.set(x, y, z).project(camera);
      return { x: (tmpV.x * 0.5 + 0.5) * w, y: (-tmpV.y * 0.5 + 0.5) * h, behind: tmpV.z > 1 };
    },
  };
}
