/**
 * Zoo Simulator 3D — the Three.js renderer.
 *
 * Static scenery (ground, paths, trees, buildings, props) is merged into a few
 * vertex-coloured batches so the whole park costs a handful of draw calls.
 * Anything that changes with progression (fences, plots, barriers, upgrades)
 * lives in a "layout" group rebuilt whenever `zoo.layoutVersion` changes.
 * Animals, visitors, staff, droppings, trough/basin levels and gates are
 * synced from the sim every frame. Nothing here mutates the sim.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Kit, mesh, createAnimal, createPerson, createHands } from "./models.js";
import {
  BOUNDS, FOREST_BLOCK, ZONES, HEDGES, PATHS, PLAZAS, FOUNTAIN, POND, SPECIES, ENCLOSURES, gatePoints, BUILDINGS,
  STORAGE, TAPS, BENCHES, FLOWER_BEDS, EYE, DAY_LENGTH, STAFF, scenery, inRect, rng,
} from "./data.js";

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Collects transformed, vertex-coloured copies of geometries and merges them. */
class Batch {
  constructor() {
    this.list = [];
  }
  add(geo, color, p, s = 1, r = null) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (g.attributes.uv) g.deleteAttribute("uv");
    _e.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0);
    _q.setFromEuler(_e);
    _p.set(p[0], p[1], p[2]);
    if (typeof s === "number") _s.setScalar(s);
    else _s.set(s[0], s[1], s[2]);
    g.applyMatrix4(_m.compose(_p, _q, _s));
    _c.set(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = _c.r;
      arr[i * 3 + 1] = _c.g;
      arr[i * 3 + 2] = _c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    this.list.push(g);
  }
  build(material, cast = true, receive = true) {
    if (!this.list.length) return null;
    const g = mergeGeometries(this.list);
    for (const d of this.list) d.dispose();
    this.list = [];
    const m = new THREE.Mesh(g, material);
    m.castShadow = cast;
    m.receiveShadow = receive;
    m.userData.ownGeo = true;
    return m;
  }
}

const jit = (hex, R, amt = 0.08) => {
  _c.set(hex);
  const k = 1 + (R() - 0.5) * 2 * amt;
  return new THREE.Color(_c.r * k, _c.g * k, _c.b * k).getHex();
};

/* ------------------------------------------------------------------ labels */
function label(kit, key, lines, o = {}) {
  const w = o.w || 512;
  const h = o.h || 192;
  return kit.canvasTex("lbl:" + key, w, h, (g) => {
    const r = 26;
    g.fillStyle = o.border || "#5a3b1f";
    g.beginPath();
    g.roundRect(0, 0, w, h, r);
    g.fill();
    g.fillStyle = o.bg || "#f6e7c8";
    g.beginPath();
    g.roundRect(10, 10, w - 20, h - 20, r - 8);
    g.fill();
    if (o.band) {
      g.fillStyle = o.band;
      g.fillRect(10, 10, w - 20, 16);
    }
    g.textAlign = "center";
    g.textBaseline = "middle";
    const n = lines.length;
    lines.forEach((ln, i) => {
      const big = i === 0;
      g.fillStyle = big ? o.fg || "#3a2614" : o.fg2 || "#6b4a2a";
      g.font = `${big ? 800 : 700} ${big ? o.size || 64 : o.size2 || 38}px "Inter", system-ui, sans-serif`;
      const y = n === 1 ? h / 2 + 4 : h * (0.18 + (0.68 * (i + 0.5)) / n) + (big ? 6 : 0);
      g.fillText(ln, w / 2, y);
    });
  });
}

function signBoard(kit, key, lines, o = {}) {
  const tex = label(kit, key, lines, o);
  const g = new THREE.Group();
  const W = o.width || 1.6;
  const H = (W * (o.h || 192)) / (o.w || 512);
  const board = new THREE.Mesh(kit.geo("plane", () => new THREE.PlaneGeometry(1, 1)), kit.mat(0xffffff, { map: tex }));
  board.scale.set(W, H, 1);
  board.position.z = 0.04;
  g.add(board);
  const back = new THREE.Mesh(kit.box(), kit.mat(0x6b4a2c));
  back.scale.set(W + 0.06, H + 0.06, 0.06);
  back.castShadow = true;
  g.add(back);
  if (o.posts !== false) {
    for (const sx of o.twoPosts ? [-1, 1] : [0]) {
      const post = new THREE.Mesh(kit.box(), kit.mat(0x6b4a2c));
      const ph = (o.y || 1.4) + H / 2;
      post.scale.set(0.09, ph, 0.09);
      post.position.set(sx * (W / 2 - 0.1), -ph / 2 + H / 2 - 0.02, -0.05);
      post.castShadow = true;
      g.add(post);
    }
  }
  g.position.y = o.y || 1.4;
  return g;
}

/* ------------------------------------------------------------------ world */
export function createWorld(canvas, { preserve = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: preserve, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const kit = new Kit();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 460);
  camera.rotation.order = "YXZ";
  scene.add(camera);
  const own = []; // geometries/materials created here (not via kit)

  /* ---------------- lights & sky */
  const hemi = new THREE.HemisphereLight(0xd6ecff, 0x5f7d3c, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -42;
  sc.right = 42;
  sc.top = 42;
  sc.bottom = -42;
  sc.near = 1;
  sc.far = 180;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  const fog = new THREE.Fog(0xcfe6f5, 70, 240);
  scene.fog = fog;

  const skyU = {
    top: { value: new THREE.Color(0x4f9be6) },
    horizon: { value: new THREE.Color(0xd8ecf7) },
    bottom: { value: new THREE.Color(0x9fb98a) },
    sunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() },
    sunCol: { value: new THREE.Color(0xfff2d0) },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyU,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, min(1.0, -h * 5.0));
  float s = max(dot(d, sunDir), 0.0);
  c += sunCol * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.18);
  gl_FragColor = vec4(c, 1.0);
#include <colorspace_fragment>
}`,
  });
  const skyGeo = new THREE.SphereGeometry(420, 32, 16);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);
  own.push(skyMat, skyGeo);

  const R = rng(21);
  const stdV = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, ...o });
  const solidMat = stdV();
  const flatMat = stdV({ flatShading: true });
  const leafMat = stdV({ flatShading: true, roughness: 0.78 });
  const glowMat = stdV({ emissive: 0xffe2a0, emissiveIntensity: 0 });
  own.push(solidMat, flatMat, leafMat, glowMat);
  // wind: merged foliage is in world space, so sway grows with height above 1.3 m
  const windU = { value: 0 };
  leafMat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windU;
    sh.vertexShader = "uniform float uWind;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
  float swayH = max(0.0, transformed.y - 1.3);
  transformed.x += sin(uWind * 1.7 + transformed.x * 0.31 + transformed.z * 0.23) * 0.035 * swayH;
  transformed.z += cos(uWind * 1.3 + transformed.x * 0.27) * 0.025 * swayH;`);
  };

  /* ---------------- image-based lighting from the sky (soft, natural shading) */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(skyGeo, skyMat));
  const envGroundGeo = new THREE.CircleGeometry(400, 24).rotateX(-Math.PI / 2);
  const envGroundMat = new THREE.MeshBasicMaterial({ color: 0x46702f });
  const envGround = new THREE.Mesh(envGroundGeo, envGroundMat);
  envGround.position.y = -4;
  envScene.add(envGround);
  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.65;
  own.push(envGroundGeo, envGroundMat, envRT, pmrem);

  /* ---------------- procedural textures */
  const grassTex = kit.canvasTex("grass", 512, 512, (g, w, h) => {
    g.fillStyle = "#e9f3dd";
    g.fillRect(0, 0, w, h);
    const RR = rng(5);
    for (let i = 0; i < 2600; i++) {
      const x = RR() * w;
      const y = RR() * h;
      const l = 4 + RR() * 9;
      const a = -Math.PI / 2 + (RR() - 0.5) * 0.9;
      g.strokeStyle = ["#c7dfae", "#b3d294", "#f4fbe9", "#a9c98a", "#d9ebc5"][Math.floor(RR() * 5)];
      g.lineWidth = 1 + RR() * 1.6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    for (let i = 0; i < 140; i++) {
      g.fillStyle = RR() < 0.5 ? "rgba(150,190,110,0.35)" : "rgba(255,255,240,0.3)";
      g.beginPath();
      g.arc(RR() * w, RR() * h, 6 + RR() * 18, 0, Math.PI * 2);
      g.fill();
    }
  }, [70, 62]);
  const paverTex = kit.canvasTex("pavers", 256, 256, (g, w, h) => {
    g.fillStyle = "#a8957a";
    g.fillRect(0, 0, w, h);
    const RR = rng(9);
    const rows = 6;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const cols = 4;
      const cw = w / cols;
      const off = (r % 2) * cw * 0.5;
      for (let c = -1; c < cols; c++) {
        const x = c * cw + off + 2;
        const y = r * rh + 2;
        const tone = 205 + Math.floor(RR() * 30);
        g.fillStyle = `rgb(${tone + 12},${tone},${tone - 30})`;
        g.beginPath();
        g.roundRect(x, y, cw - 4, rh - 4, 5);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.18)";
        g.fillRect(x + 3, y + 2, cw - 12, 3);
        for (let k = 0; k < 10; k++) {
          g.fillStyle = `rgba(90,70,40,${0.06 + RR() * 0.08})`;
          g.fillRect(x + RR() * (cw - 8), y + RR() * (rh - 8), 2, 2);
        }
      }
    }
  }, [1, 1]);
  const pathMat = new THREE.MeshStandardMaterial({ map: paverTex, roughness: 0.93 });
  own.push(pathMat);
  const uvScale = (geo, sx, sz) => {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sz);
    return geo;
  };

  /* ---------------- ground */
  {
    const W = 330;
    const D = 290;
    const g = new THREE.PlaneGeometry(W, D, 110, 96);
    g.rotateX(-Math.PI / 2);
    g.translate(19, 0, -20);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const a = new THREE.Color(0x6db047);
    const b = new THREE.Color(0x4e8f33);
    const out = new THREE.Color(0x4a7f35);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const n = Math.sin(x * 0.11) * Math.cos(z * 0.13) * 0.5 + Math.sin(x * 0.031 + z * 0.047) * 0.5;
      _c.copy(a).lerp(b, 0.5 + n * 0.5);
      const inside = inRect(BOUNDS, x, z, 4) && !inRect(FOREST_BLOCK, x, z, -2);
      if (!inside) {
        _c.lerp(out, 0.6);
        // rolling terrain outside the fence
        const hgt = Math.max(0, (Math.sin(x * 0.05) + Math.cos(z * 0.06)) * 1.6 + 1.2);
        const dist = Math.min(Math.abs(x - BOUNDS.x0), Math.abs(x - BOUNDS.x1), Math.abs(z - BOUNDS.z0), Math.abs(z - BOUNDS.z1));
        pos.setY(i, hgt * Math.min(1, dist / 18));
      }
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTex, roughness: 0.96 });
    const ground = new THREE.Mesh(g, groundMat);
    ground.receiveShadow = true;
    scene.add(ground);
    own.push(g, groundMat);
  }

  /* ---------------- static scenery batches */
  const solid = new Batch();
  const flat = new Batch();
  const leaves = new Batch();
  const glow = new Batch();
  const BOX = kit.box();
  const CYL = kit.geo("cyl8", () => new THREE.CylinderGeometry(1, 1, 1, 10));
  const CYL16 = kit.geo("cyl16", () => new THREE.CylinderGeometry(1, 1, 1, 20));
  const CONE = kit.geo("cone7", () => new THREE.ConeGeometry(1, 1, 7));
  const ICO = kit.geo("ico0", () => new THREE.IcosahedronGeometry(1, 0));
  const ICO1 = kit.geo("ico1", () => new THREE.IcosahedronGeometry(1, 1));
  const DODE = kit.geo("dode", () => new THREE.DodecahedronGeometry(1, 0));
  const SPH = kit.sphere(12, 8);
  const PLANE = kit.geo("hplane", () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const DISC = kit.geo("disc", () => new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2));

  const rectPlane = (b, r, color, y, m = 0) => b.add(PLANE, color, [(r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2], [r.x1 - r.x0 + m * 2, 1, r.z1 - r.z0 + m * 2]);
  // stone-paved paths and plazas (textured, UVs scaled so one tile set ≈ 2.4 m)
  const TILE = 2.4;
  const paved = (geo, x, y, z) => {
    const m = new THREE.Mesh(geo, pathMat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
    own.push(geo);
  };
  const ground = new Batch();
  for (const p of PATHS) {
    rectPlane(ground, p, 0x8f7d63, 0.012, 0.3);
    const w = p.x1 - p.x0;
    const d = p.z1 - p.z0;
    paved(uvScale(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), w / TILE, d / TILE), (p.x0 + p.x1) / 2, 0.022, (p.z0 + p.z1) / 2);
  }
  for (const p of PLAZAS) {
    ground.add(DISC, 0x8f7d63, [p.x, 0.016, p.z], [p.r + 0.35, 1, p.r + 0.35]);
    paved(uvScale(new THREE.CircleGeometry(p.r, 48).rotateX(-Math.PI / 2), (p.r * 2) / TILE, (p.r * 2) / TILE), p.x, 0.028, p.z);
    ground.add(DISC, 0xcbb48c, [p.x, 0.034, p.z], [p.r * 0.55, 1, p.r * 0.55]);
    ground.add(DISC, 0xe8dcc0, [p.x, 0.037, p.z], [p.r * 0.5, 1, p.r * 0.5]);
  }
  // road outside the gate
  rectPlane(ground, { x0: -6, x1: 6, z0: 37.2, z1: 80 }, 0x5f5d5a, 0.02);
  for (let z = 40; z < 80; z += 4) rectPlane(ground, { x0: -0.1, x1: 0.1, z0: z, z1: z + 2 }, 0xf0e6c8, 0.03);
  const groundMesh = ground.build(solidMat, false, true);
  scene.add(groundMesh);

  // perimeter fence
  const fenceLine = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.6));
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      solid.add(BOX, 0x7a5434, [x0 + (x1 - x0) * t, 0.75, z0 + (z1 - z0) * t], [0.16, 1.5, 0.16]);
    }
    for (const y of [0.55, 1.15]) solid.add(BOX, 0x93693f, [(x0 + x1) / 2, y, (z0 + z1) / 2], [0.07, 0.12, len], [0, yaw, 0]);
  };
  const B = BOUNDS;
  fenceLine(B.x0 - 0.3, B.z0 - 0.3, B.x0 - 0.3, B.z1 + 0.3);
  fenceLine(B.x0 - 0.3, B.z0 - 0.3, FOREST_BLOCK.x0, B.z0 - 0.3);
  fenceLine(FOREST_BLOCK.x0, B.z0 - 0.3, FOREST_BLOCK.x0, FOREST_BLOCK.z1);
  fenceLine(FOREST_BLOCK.x0, FOREST_BLOCK.z1, B.x1 + 0.3, FOREST_BLOCK.z1);
  fenceLine(B.x1 + 0.3, FOREST_BLOCK.z1, B.x1 + 0.3, B.z1 + 0.3);
  fenceLine(B.x0 - 0.3, B.z1 + 0.3, -4.9, B.z1 + 0.3);
  fenceLine(4.9, B.z1 + 0.3, B.x1 + 0.3, B.z1 + 0.3);

  // hedges with bushy tops
  for (const h of HEDGES) {
    const w = h.x1 - h.x0;
    const d = h.z1 - h.z0;
    flat.add(BOX, 0x3f7a32, [(h.x0 + h.x1) / 2, 0.75, (h.z0 + h.z1) / 2], [w, 1.5, d]);
    const len = Math.max(w, d);
    for (let t = 0.6; t < len; t += 1.3) {
      const x = w > d ? h.x0 + t : (h.x0 + h.x1) / 2;
      const z = w > d ? (h.z0 + h.z1) / 2 : h.z0 + t;
      leaves.add(ICO, jit(0x4a8a3a, R, 0.12), [x, 1.5, z], [0.75, 0.45 + R() * 0.2, 0.75], [R(), R(), R()]);
    }
  }

  // trees
  const { trees, forest } = scenery();
  const tree = (t, big = 1) => {
    const s = t.s * big;
    const trunk = jit(0x7a5230, R, 0.1);
    if (t.kind === 1) {
      solid.add(CYL, trunk, [t.x, 0.9 * s, t.z], [0.18 * s, 1.8 * s, 0.18 * s]);
      const g = jit(0x2f6b3a, R, 0.12);
      for (let i = 0; i < 3; i++) leaves.add(CONE, g, [t.x, (1.6 + i * 1.05) * s, t.z], [(1.55 - i * 0.38) * s, 1.7 * s, (1.55 - i * 0.38) * s], [0, t.rot + i, 0]);
    } else if (t.kind === 3) {
      solid.add(CYL, trunk, [t.x, 1.4 * s, t.z], [0.16 * s, 2.8 * s, 0.16 * s], [0, 0, 0.08]);
      solid.add(CYL, trunk, [t.x + 0.4 * s, 2.6 * s, t.z], [0.09 * s, 1.2 * s, 0.09 * s], [0, 0, -0.6]);
      leaves.add(CYL, jit(0x7d9a3e, R, 0.1), [t.x + 0.1 * s, 3.2 * s, t.z], [2.4 * s, 0.45 * s, 2.0 * s], [0, t.rot, 0]);
      leaves.add(CYL, jit(0x8aa64a, R, 0.1), [t.x + 0.5 * s, 3.5 * s, t.z + 0.3 * s], [1.4 * s, 0.35 * s, 1.2 * s], [0, t.rot, 0]);
    } else {
      solid.add(CYL, trunk, [t.x, 1.1 * s, t.z], [0.2 * s, 2.2 * s, 0.2 * s]);
      const g = jit(t.kind === 2 ? 0x4c8c3a : 0x5a9a3e, R, 0.14);
      if (t.kind === 2) leaves.add(ICO1, g, [t.x, 3.0 * s, t.z], [1.7 * s, 1.5 * s, 1.7 * s], [t.rot, t.rot, 0]);
      else {
        leaves.add(ICO, g, [t.x, 2.9 * s, t.z], 1.5 * s, [t.rot, t.rot, 0]);
        leaves.add(ICO, jit(g, R, 0.1), [t.x + 0.7 * s, 2.5 * s, t.z + 0.3 * s], 1.0 * s, [t.rot, 0, t.rot]);
        leaves.add(ICO, jit(g, R, 0.1), [t.x - 0.5 * s, 3.5 * s, t.z - 0.4 * s], 1.0 * s, [0, t.rot, t.rot]);
      }
    }
  };
  for (const t of trees) tree(t);
  for (const t of forest) tree(t, 1.25);
  // distant hills
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    flat.add(ICO1, jit(0x5d8a45, R, 0.1), [19 + Math.cos(a) * 190, -18, -20 + Math.sin(a) * 175], [40 + R() * 30, 34 + R() * 16, 40 + R() * 30]);
  }
  // bushes along paths and the inner fence line
  for (let i = 0; i < 70; i++) {
    const x = BOUNDS.x0 + 1 + R() * (BOUNDS.x1 - BOUNDS.x0 - 2);
    const z = BOUNDS.z0 + 1 + R() * (BOUNDS.z1 - BOUNDS.z0 - 2);
    if (inRect(FOREST_BLOCK, x, z, 1) || PATHS.some((p) => inRect(p, x, z, 0.8)) || ENCLOSURES.some((e) => inRect(e.rect, x, z, 1.2))) continue;
    if (BUILDINGS.some((b) => inRect(b.rect, x, z, 1.5)) || PLAZAS.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + 1) ** 2)) continue;
    if (BENCHES.some((b) => (x - b.x) ** 2 + (z - b.z) ** 2 < 4) || (x - POND.x) ** 2 + (z - POND.z) ** 2 < (POND.r + 1) ** 2) continue;
    if (inRect({ x0: -12, x1: 12, z0: 26, z1: 40 }, x, z)) continue;
    leaves.add(ICO, jit(0x4f9440, R, 0.15), [x, 0.35, z], [0.7 + R() * 0.5, 0.55 + R() * 0.3, 0.7 + R() * 0.5], [R(), R(), R()]);
  }
  // perimeter bushes
  for (let x = BOUNDS.x0; x < BOUNDS.x1; x += 2.2) {
    if (Math.abs(x) > 7) leaves.add(ICO, jit(0x467f38, R, 0.15), [x, 0.5, BOUNDS.z1 + 1.4], [1.1, 0.9, 1.0], [R(), R(), 0]);
  }

  /* ---------------- buildings */
  const roofPrism = kit.geo("roof", () => {
    const s = new THREE.Shape();
    s.moveTo(-0.5, 0);
    s.lineTo(0.5, 0);
    s.lineTo(0, 1);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  });
  const signs = [];
  const addSign = (g, x, y, z, yaw) => {
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    scene.add(g);
    signs.push(g);
  };
  const faceYaw = { E: Math.PI / 2, W: -Math.PI / 2, N: Math.PI, S: 0 };
  for (const b of BUILDINGS) {
    if (b.upgrade) continue;
    const r = b.rect;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const yaw = faceYaw[b.face];
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const halfFace = b.face === "E" || b.face === "W" ? w / 2 : d / 2;
    const doorX = cx + fx * (halfFace + 0.02);
    const doorZ = cz + fz * (halfFace + 0.02);
    const along = b.face === "E" || b.face === "W" ? [0, 1] : [1, 0];
    if (b.kind === "barn") {
      solid.add(BOX, 0xb2412f, [cx, 2.2, cz], [w, 4.4, d]);
      solid.add(BOX, 0xf3ece0, [cx, 0.15, cz], [w + 0.1, 0.3, d + 0.1]);
      solid.add(roofPrism, 0x4c4f55, [cx, 4.4, cz], [w + 0.8, 2.6, d + 0.8], [0, 0, 0]);
      solid.add(BOX, 0x7d2b20, [doorX, 1.6, doorZ], [0.1 + along[0] * 3.2, 3.2, 0.1 + along[1] * 3.2]);
      for (const k of [-1, 1]) solid.add(BOX, 0xf3ece0, [doorX + along[0] * k * 0.8, 1.6, doorZ + along[1] * k * 0.8], [0.14 + along[0] * 0.08, 3.2, 0.14 + along[1] * 0.08], [0, 0, 0]);
      solid.add(BOX, 0xf3ece0, [doorX, 3.25, doorZ], [0.14 + along[0] * 3.3, 0.14, 0.14 + along[1] * 3.3]);
      // hay bales by the door
      for (let i = 0; i < 3; i++) solid.add(CYL, 0xd9b45a, [doorX + fx * 1.2 + along[0] * 2.6, 0.45 + (i === 2 ? 0.8 : 0), doorZ + along[1] * (2.6 + (i % 2) * 0.95 - (i === 2 ? 0.45 : 0))], [0.45, 0.9, 0.45], [0, 0, Math.PI / 2]);
    } else if (b.kind === "shop") {
      solid.add(BOX, 0xf3d9a4, [cx, 1.8, cz], [w, 3.6, d]);
      solid.add(BOX, 0xd9634a, [cx, 3.75, cz], [w + 0.4, 0.3, d + 0.4]);
      solid.add(BOX, 0xf7f1e4, [cx, 0.12, cz], [w + 0.08, 0.24, d + 0.08]);
      solid.add(BOX, 0x7d4b2a, [doorX, 1.15, doorZ], [0.1 + along[0] * 1.6, 2.3, 0.1 + along[1] * 1.6]);
      for (const k of [-1, 1]) glow.add(BOX, 0x9fd6f2, [doorX + along[0] * k * 2.4, 1.6, doorZ + along[1] * k * 2.4], [0.08 + along[0] * 1.6, 1.3, 0.08 + along[1] * 1.6]);
      // striped awning
      for (let i = 0; i < 8; i++) {
        const t = (i - 3.5) * 0.9;
        solid.add(BOX, i % 2 ? 0xffffff : 0xe24f3d, [doorX + fx * 0.75 + along[0] * t, 2.45, doorZ + fz * 0.75 + along[1] * t], [0.04 + along[0] * 0.9 + along[1] * 1.6, 0.06, 0.04 + along[1] * 0.9 + along[0] * 1.6], [b.face === "E" ? 0 : 0, 0, b.face === "E" ? -0.35 : 0]);
      }
      // souvenir display out front
      solid.add(BOX, 0x8a5a33, [doorX + fx * 1.0 + along[0] * -2.4, 0.5, doorZ + along[1] * 2.6], [0.6, 1, 0.9]);
      for (let i = 0; i < 4; i++) solid.add(SPH, [0xf2b632, 0x8f5a2a, 0xe85d4a, 0x7fbf5a][i], [doorX + fx * 1.0, 1.1, doorZ + along[1] * (2.3 + i * 0.22)], 0.12);
    } else if (b.kind === "office") {
      solid.add(BOX, 0xdfe7ee, [cx, 1.7, cz], [w, 3.4, d]);
      solid.add(roofPrism, 0x3f7a4a, [cx, 3.4, cz], [d + 0.6, 1.6, w + 0.6], [0, Math.PI / 2, 0]);
      solid.add(BOX, 0x355e8c, [doorX, 1.1, doorZ], [0.1 + along[0] * 1.3, 2.2, 0.1 + along[1] * 1.3]);
      for (const k of [-1, 1]) glow.add(BOX, 0xa9d8f5, [doorX + along[0] * k * 2, 1.7, doorZ + along[1] * k * 2], [0.08 + along[0] * 1.2, 1.1, 0.08 + along[1] * 1.2]);
      solid.add(BOX, 0x8a8f96, [doorX + fx * 0.6, 0.06, doorZ], [1.0, 0.12, 1.6]);
    } else if (b.kind === "booth") {
      solid.add(BOX, 0x3d7cc9, [cx, 0.6, cz], [w, 1.2, d]);
      solid.add(BOX, 0xf4efe6, [cx, 1.75, cz], [w, 1.1, d]);
      glow.add(BOX, 0xbfe6ff, [doorX, 1.75, doorZ], [1.8, 0.8, 0.06]);
      solid.add(BOX, 0xe24f3d, [cx, 2.5, cz], [w + 0.7, 0.18, d + 0.7]);
      solid.add(roofPrism, 0xe24f3d, [cx, 2.55, cz], [w + 0.6, 0.7, d + 0.6]);
      solid.add(BOX, 0xd8c7a8, [doorX + 0, 1.25, doorZ - 0.15], [1.9, 0.08, 0.35]);
    }
    const lbl = b.label;
    addSign(signBoard(kit, b.id, [lbl], { width: b.kind === "booth" ? 1.5 : 2.6, posts: false, bg: b.kind === "barn" ? "#fff3dc" : "#ffffff", band: b.kind === "shop" ? "#e24f3d" : b.kind === "office" ? "#3f7a4a" : b.kind === "booth" ? "#3d7cc9" : "#b2412f" }),
      doorX + fx * 0.08, b.kind === "barn" ? 3.85 : b.kind === "booth" ? 2.15 : b.kind === "shop" ? 3.2 : 2.95, doorZ + fz * 0.08, yaw);
  }

  // entrance arch
  for (const sx of [-1, 1]) {
    solid.add(BOX, 0xa38d6d, [sx * 4.2, 2.4, 37.4], [1.2, 4.8, 1.2]);
    solid.add(BOX, 0x8a7558, [sx * 4.2, 4.9, 37.4], [1.45, 0.25, 1.45]);
    leaves.add(ICO, 0x4f9440, [sx * 4.2, 5.4, 37.4], [0.8, 0.6, 0.8]);
    // turnstiles
    solid.add(BOX, 0x9aa3ab, [sx * 1.6, 0.5, 38.4], [0.25, 1, 0.8]);
  }
  solid.add(BOX, 0x6b4a2c, [0, 4.4, 37.4], [9.6, 0.3, 0.5]);
  const arch = signBoard(kit, "arch", ["ZOO SIMULATOR 3D", "WILDLIFE PARK"], { width: 6.2, posts: false, w: 1024, h: 220, size: 96, size2: 44, bg: "#fff7e8", band: "#3f7a32" });
  addSign(arch, 0, 5.15, 37.4, Math.PI);
  const arch2 = arch.clone();
  addSign(arch2, 0, 5.15, 37.4, 0);

  // fountain
  solid.add(CYL16, 0xbfb4a3, [FOUNTAIN.x, 0.3, FOUNTAIN.z], [FOUNTAIN.r, 0.6, FOUNTAIN.r]);
  solid.add(CYL16, 0x8fc6e0, [FOUNTAIN.x, 0.5, FOUNTAIN.z], [FOUNTAIN.r - 0.25, 0.2, FOUNTAIN.r - 0.25]);
  solid.add(CYL, 0xbfb4a3, [FOUNTAIN.x, 1.1, FOUNTAIN.z], [0.25, 1.4, 0.25]);
  solid.add(CYL16, 0xbfb4a3, [FOUNTAIN.x, 1.75, FOUNTAIN.z], [0.9, 0.2, 0.9]);
  // rippling, sky-reflecting water: a procedural normal map scrolled every frame
  const rippleTex = kit.canvasTex("ripple", 256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    const H = (x, y) => {
      const u = (x / w) * Math.PI * 2;
      const v = (y / h) * Math.PI * 2;
      return Math.sin(u * 3 + Math.sin(v * 2) * 1.5) + Math.sin(v * 4 + u) * 0.6 + Math.sin((u + v) * 7) * 0.25 + Math.cos(u * 9 - v * 5) * 0.15;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = H(x + 1, y) - H(x - 1, y);
        const dy = H(x, y + 1) - H(x, y - 1);
        const len = Math.hypot(dx, dy, 0.35);
        const i = (y * w + x) * 4;
        img.data[i] = (-dx / len * 0.5 + 0.5) * 255;
        img.data[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
        img.data[i + 2] = (0.35 / len * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }, [3, 3]);
  rippleTex.colorSpace = THREE.NoColorSpace;
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2f8fc4, roughness: 0.06, metalness: 0.2, normalMap: rippleTex, normalScale: new THREE.Vector2(0.45, 0.45),
    transparent: true, opacity: 0.9, envMapIntensity: 1.4,
  });
  own.push(waterMat);
  const fountainWater = new THREE.Mesh(DISC, waterMat);
  fountainWater.scale.set(FOUNTAIN.r - 0.28, 1, FOUNTAIN.r - 0.28);
  fountainWater.position.set(FOUNTAIN.x, 0.62, FOUNTAIN.z);
  scene.add(fountainWater);
  const spray = new THREE.Group();
  const sprayMat = kit.mat(0xdff4ff, { opacity: 0.55 });
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(kit.geo("sprayC", () => new THREE.ConeGeometry(0.08, 1, 6, 1, true).translate(0, 0.5, 0)), sprayMat);
    s.rotation.z = 0.5;
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 6) * Math.PI * 2;
    pivot.add(s);
    spray.add(pivot);
  }
  spray.position.set(FOUNTAIN.x, 1.85, FOUNTAIN.z);
  scene.add(spray);

  // pond
  {
    const pw = new THREE.Mesh(DISC, waterMat);
    pw.scale.set(POND.r, 1, POND.r * 0.8);
    pw.position.set(POND.x, 0.05, POND.z);
    scene.add(pw);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      flat.add(DODE, jit(0x9a9289, R, 0.1), [POND.x + Math.cos(a) * POND.r, 0.15, POND.z + Math.sin(a) * POND.r * 0.8], [0.45 + R() * 0.3, 0.3 + R() * 0.2, 0.45], [R(), R(), R()]);
    }
    for (let i = 0; i < 6; i++) solid.add(DISC, 0x4f9a46, [POND.x + (R() - 0.5) * 6, 0.07, POND.z + (R() - 0.5) * 5], 0.35);
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2;
      solid.add(CYL, 0x5d8a3a, [POND.x + Math.cos(a) * (POND.r - 0.3), 0.5, POND.z + Math.sin(a) * (POND.r - 0.3) * 0.8], [0.03, 1 + R() * 0.5, 0.03]);
    }
  }

  // benches, bins, lamps
  const bench = (b, batch = solid) => {
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    const P = (lx, y, lz) => [b.x + lx * c + lz * s, y, b.z - lx * s + lz * c];
    batch.add(BOX, 0x9b6a3c, P(0, 0.45, 0), [1.6, 0.08, 0.5], [0, b.yaw, 0]);
    batch.add(BOX, 0x9b6a3c, P(0, 0.78, -0.24), [1.6, 0.4, 0.06], [0.15, b.yaw, 0]);
    for (const lx of [-0.65, 0.65]) batch.add(BOX, 0x3b3b3b, P(lx, 0.22, -0.02), [0.08, 0.44, 0.48], [0, b.yaw, 0]);
    batch.add(CYL, 0x3f7a4a, P(1.15, 0.42, 0), [0.24, 0.84, 0.24]);
    batch.add(CYL, 0x2f5a37, P(1.15, 0.86, 0), [0.26, 0.06, 0.26]);
  };
  for (const b of BENCHES) if (!b.extra) bench(b);
  const lamps = [];
  for (let z = -16; z < 34; z += 11) lamps.push([z % 2 ? 2.9 : -2.9, z]);
  for (let x = -36; x < 42; x += 12) if (Math.abs(x) > 8) lamps.push([x, 9.0]);
  for (let z = -62; z < -24; z += 12) lamps.push([-2.9, z]);
  for (let x = 48; x < 80; x += 12) lamps.push([x, 3.0]);
  for (const [x, z] of lamps) {
    solid.add(CYL, 0x2f3338, [x, 1.6, z], [0.07, 3.2, 0.07]);
    solid.add(CYL, 0x2f3338, [x, 0.15, z], [0.18, 0.3, 0.18]);
    glow.add(SPH, 0xfff4d6, [x, 3.3, z], [0.22, 0.26, 0.22]);
    solid.add(CONE, 0x2f3338, [x, 3.6, z], [0.3, 0.25, 0.3]);
  }

  // water taps
  for (const t of TAPS) {
    solid.add(BOX, 0x6f8796, [t.x, 0.6, t.z], [0.22, 1.2, 0.22]);
    solid.add(CYL, 0xc0c6cc, [t.x - 0.12, 1.05, t.z], [0.04, 0.24, 0.04], [0, 0, Math.PI / 2]);
    solid.add(CYL, 0x2f6fb8, [t.x, 1.25, t.z], [0.1, 0.06, 0.1]);
    solid.add(CYL16, 0x9a9a9a, [t.x - 0.35, 0.2, t.z], [0.35, 0.4, 0.35]);
    solid.add(CYL16, 0x7cc4ea, [t.x - 0.35, 0.41, t.z], [0.3, 0.02, 0.3]);
  }
  addSign(signBoard(kit, "tap", ["WATER"], { width: 0.7, posts: false, bg: "#e8f5ff", fg: "#1f5f9a", band: "#2f6fb8" }), TAPS[0].x + 0.13, 1.6, TAPS[0].z, Math.PI / 2);

  // storage: feed sacks + cleaning cart
  {
    const f = STORAGE.food;
    solid.add(BOX, 0x9b7a4c, [f.x, 0.08, f.z], [1.3, 0.16, 1.3]);
    for (let i = 0; i < 6; i++) {
      const lx = (i % 2) * 0.6 - 0.3;
      const lz = (Math.floor(i / 2) % 2) * 0.55 - 0.27;
      const ly = i < 4 ? 0.32 : 0.62;
      solid.add(SPH, 0xe3d2a8, [f.x + lx * (i < 4 ? 1 : 0.6), ly, f.z + (i < 4 ? lz : (i - 4.5) * 0.5)], [0.3, 0.16, 0.24]);
    }
    solid.add(CYL, 0xc8a24a, [f.x + 0.75, 0.35, f.z + 0.7], [0.3, 0.7, 0.3]);
    addSign(signBoard(kit, "food", ["ANIMAL FOOD", "free — press E"], { width: 1.1, bg: "#fff3dc", band: "#c8a24a", size: 58 }), f.x - 0.4, 1.35, f.z, -Math.PI / 2);
    const s = STORAGE.supplies;
    solid.add(BOX, 0x2f6fb8, [s.x, 0.55, s.z], [0.7, 0.5, 1.0]);
    for (const dz of [-0.4, 0.4]) solid.add(CYL, 0x222222, [s.x, 0.2, s.z + dz], [0.18, 0.08, 0.18], [0, 0, Math.PI / 2]);
    for (let i = 0; i < 4; i++) solid.add(CYL, [0xe85d4a, 0xf2b632, 0x55b06a, 0xffffff][i], [s.x + (i % 2) * 0.24 - 0.12, 0.95, s.z + (i - 1.5) * 0.2], [0.07, 0.3, 0.07]);
    solid.add(CYL, 0xa77b4a, [s.x + 0.32, 1.0, s.z - 0.45], [0.025, 1.6, 0.025], [0.2, 0, 0]);
    addSign(signBoard(kit, "supplies", ["CLEANING", "CART"], { width: 1.0, bg: "#e8f2ff", band: "#2f6fb8", size: 54 }), s.x - 0.4, 1.45, s.z, -Math.PI / 2);
  }

  // signpost at the central plaza
  {
    const x = 6.4;
    const z = 12.4;
    solid.add(CYL, 0x6b4a2c, [x, 1.4, z], [0.07, 2.8, 0.07]);
    const arrows = [
      ["key-n", "↑ SAVANNA  ·  STORAGE", Math.PI, 2.5],
      ["key-e", "→ ELEPHANT VALLEY", Math.PI / 2, 2.05],
      ["key-s", "↓ ENTRANCE  ·  SHOP  ·  STAFF", 0, 1.6],
    ];
    for (const [k, t, yaw, y] of arrows) addSign(signBoard(kit, k, [t], { width: 1.8, posts: false, w: 768, h: 120, size: 54, bg: "#f6e7c8" }), x, y, z, yaw);
  }

  // soft billboard clouds drifting across the sky
  const cloudTex = kit.canvasTex("cloud", 256, 128, (g, w, h) => {
    const RR = rng(3);
    for (let i = 0; i < 14; i++) {
      const x = w * (0.2 + RR() * 0.6);
      const y = h * (0.45 + RR() * 0.25);
      const r = 22 + RR() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,0.9)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
  });
  const clouds = new THREE.Group();
  for (let i = 0; i < 22; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.75 + R() * 0.2 }));
    own.push(m.material);
    const sc = 40 + R() * 45;
    m.scale.set(sc, sc * 0.5, 1);
    m.position.set(-150 + R() * 330, 75 + R() * 40, -190 + R() * 300);
    m.userData.v = 0.6 + R() * 0.8;
    clouds.add(m);
  }
  scene.add(clouds);

  const staticSolid = solid.build(solidMat);
  const staticFlat = flat.build(flatMat);
  const staticLeaves = leaves.build(leafMat);
  const staticGlow = glow.build(glowMat, false, true);
  for (const m of [staticSolid, staticFlat, staticLeaves, staticGlow]) if (m) scene.add(m);

  /* ---------------- grass tufts (instanced, no shadows) */
  {
    const blade = mergeGeometries([0, 1, 2].map((i) => {
      const c = new THREE.ConeGeometry(0.05, 0.38, 3).toNonIndexed();
      c.translate(0, 0.19, 0);
      c.rotateZ((i - 1) * 0.35);
      c.rotateY(i * 2.1);
      c.deleteAttribute("uv");
      return c;
    }));
    const n = 5200;
    const grassMat = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
    grassMat.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = windU;
      sh.vertexShader = "uniform float uWind;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
  #ifdef USE_INSTANCING
  vec2 ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
  transformed.x += sin(uWind * 2.2 + ip.x * 0.45 + ip.y * 0.3) * 0.14 * transformed.y;
  transformed.z += cos(uWind * 1.8 + ip.x * 0.3) * 0.09 * transformed.y;
  #endif`);
    };
    const tuft = new THREE.InstancedMesh(blade, grassMat, n);
    own.push(blade, grassMat);
    let k = 0;
    const dummy = new THREE.Object3D();
    const meadow = ENCLOSURES.filter((e) => e.ground === "meadow").map((e) => e.rect);
    const bare = ENCLOSURES.filter((e) => e.ground !== "meadow").map((e) => e.rect);
    for (let i = 0; i < n * 3 && k < n; i++) {
      const x = BOUNDS.x0 + R() * (BOUNDS.x1 - BOUNDS.x0);
      const z = BOUNDS.z0 + R() * (BOUNDS.z1 - BOUNDS.z0);
      if (inRect(FOREST_BLOCK, x, z)) continue;
      if (PATHS.some((p) => inRect(p, x, z, 0.4)) || PLAZAS.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + 0.4) ** 2)) continue;
      if (bare.some((r) => inRect(r, x, z, 0.3)) || BUILDINGS.some((b) => inRect(b.rect, x, z, 0.3))) continue;
      if ((x - POND.x) ** 2 + (z - POND.z) ** 2 < POND.r ** 2) continue;
      if (inRect({ x0: -9.5, x1: 9.5, z0: 27, z1: 40 }, x, z)) continue;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, R() * 6.28, 0);
      dummy.scale.setScalar(0.7 + R() * 0.8 + (meadow.some((r) => inRect(r, x, z)) ? 0.3 : 0));
      dummy.updateMatrix();
      tuft.setMatrixAt(k, dummy.matrix);
      tuft.setColorAt(k, _c.set(jit(R() < 0.15 ? 0x8fbf4a : 0x5d9e3e, R, 0.18)));
      k++;
    }
    tuft.count = k;
    tuft.receiveShadow = true;
    scene.add(tuft);
    // wild flowers
    const fl = new THREE.InstancedMesh(kit.sphere(6, 4), kit.mat(0xffffff), 500);
    let f = 0;
    for (let i = 0; i < 1500 && f < 500; i++) {
      const x = BOUNDS.x0 + R() * (BOUNDS.x1 - BOUNDS.x0);
      const z = BOUNDS.z0 + R() * (BOUNDS.z1 - BOUNDS.z0);
      if (inRect(FOREST_BLOCK, x, z) || PATHS.some((p) => inRect(p, x, z, 0.5)) || ENCLOSURES.some((e) => inRect(e.rect, x, z, 0.5))) continue;
      if (PLAZAS.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + 0.5) ** 2) || BUILDINGS.some((b) => inRect(b.rect, x, z, 0.5))) continue;
      dummy.position.set(x, 0.2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.05 + R() * 0.03);
      dummy.updateMatrix();
      fl.setMatrixAt(f, dummy.matrix);
      fl.setColorAt(f, _c.set([0xffffff, 0xffd84a, 0xff7fa8, 0xb48cff, 0xff6a4a][Math.floor(R() * 5)]));
      f++;
    }
    fl.count = f;
    scene.add(fl);
  }

  /* ---------------- dynamic layout (rebuilt on progression) */
  const layout = new THREE.Group();
  scene.add(layout);
  let layoutVer = -1;
  const encViews = {}; // id → { door, doorOpen, fill, water, gate }
  const lumpGeo = kit.geo("lump", () => {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
      g.deleteAttribute("uv");
      g.scale(0.16 - i * 0.02, 0.09, 0.14 - i * 0.015);
      g.translate((i % 2 ? 0.1 : -0.08) * (i > 1 ? -1 : 1), 0.05 + i * 0.02, (i > 1 ? 0.08 : -0.06));
      parts.push(g);
    }
    return mergeGeometries(parts);
  });
  const lumpMat = kit.mat(0x5b3f22, { flat: true });

  function clearLayout() {
    for (const c of [...layout.children]) {
      layout.remove(c);
      c.traverse((o) => {
        if (o.userData.ownGeo) o.geometry.dispose();
      });
    }
  }

  function buildLayout(zoo) {
    clearLayout();
    const sb = new Batch();
    const fb = new Batch();
    const groundB = new Batch();
    for (const k of Object.keys(encViews)) delete encViews[k];
    for (const e of ENCLOSURES) {
      const st = zoo.enc[e.id];
      const r = e.rect;
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      const gp = gatePoints(e);
      const zoneOpen = zoo.zones[e.zone];
      if (!st.built) {
        // construction plot
        groundB.add(PLANE, 0x8d9a5a, [cx, 0.01, cz], [w, 1, d]);
        for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) {
          sb.add(BOX, 0xc49a5c, [x, 0.45, z], [0.1, 0.9, 0.1]);
          sb.add(BOX, 0xff7a1a, [x, 0.85, z], [0.18, 0.14, 0.02]);
        }
        const tape = (x0, z0, x1, z1) => {
          const len = Math.hypot(x1 - x0, z1 - z0);
          const segs = Math.floor(len / 0.8);
          const yaw = Math.atan2(x1 - x0, z1 - z0);
          for (let i = 0; i < segs; i++) {
            const t = (i + 0.5) / segs;
            sb.add(BOX, i % 2 ? 0xffffff : 0xe03a2a, [x0 + (x1 - x0) * t, 0.7, z0 + (z1 - z0) * t], [0.02, 0.06, len / segs], [0, yaw, 0]);
          }
        };
        tape(r.x0, r.z0, r.x1, r.z0);
        tape(r.x1, r.z0, r.x1, r.z1);
        tape(r.x1, r.z1, r.x0, r.z1);
        tape(r.x0, r.z1, r.x0, r.z0);
        // lumber + cones
        for (let i = 0; i < 4; i++) sb.add(BOX, 0xc49a5c, [cx + 1, 0.1 + i * 0.16, cz + (i % 2) * 0.1], [3, 0.14, 0.3], [0, 0.4 + i * 0.05, 0]);
        for (let i = 0; i < 3; i++) sb.add(CONE, 0xff7a1a, [gp.inside.x + (i - 1) * 0.8 * Math.abs(gp.normal.z), 0.3, gp.inside.z + (i - 1) * 0.8 * Math.abs(gp.normal.x)], [0.22, 0.6, 0.22]);
        const sp = SPECIES[e.id];
        const g = signBoard(kit, "plot" + e.id + (zoneOpen ? 1 : 0), [`${sp.name.toUpperCase()} HABITAT`, zoneOpen ? `Build: $${e.buildCost.toLocaleString("en-US")}` : "Unlock zone first"], { width: 1.9, twoPosts: true, bg: "#fff3d6", band: "#ff7a1a", size: 58, size2: 46 });
        g.position.set(e.sign.x, 1.35, e.sign.z);
        g.rotation.y = Math.atan2(gp.normal.x, gp.normal.z) || 0;
        if (e.id === "elephant") g.rotation.y = 0;
        layout.add(g);
        continue;
      }
      // habitat ground
      const gcol = { meadow: 0x79b24f, dry: 0xc5b077, sand: 0xd8c08a, mud: 0x9c8462 }[e.ground];
      groundB.add(PLANE, gcol, [cx, 0.01, cz], [w - 0.2, 1, d - 0.2]);
      const RR = rng(e.id.length * 31 + 7);
      for (let i = 0; i < 40; i++) groundB.add(PLANE, jit(gcol, RR, 0.12), [r.x0 + 1 + RR() * (w - 2), 0.015, r.z0 + 1 + RR() * (d - 2)], [0.8 + RR() * 1.6, 1, 0.6 + RR() * 1.2], [0, RR() * 3, 0]);
      // fence
      const style = e.fence;
      const H = { wood: 1.15, tall: 1.6, steel: 2.4, stone: 1.2 }[style];
      const postC = { wood: 0x8a5a33, tall: 0x8a5a33, steel: 0x3a3f45, stone: 0x8f8a80 }[style];
      const railC = { wood: 0xa8763f, tall: 0xa8763f, steel: 0x4a5058, stone: 0x8a5a33 }[style];
      const gap = 1.0;
      const side = (sideId, ax0, az0, ax1, az1) => {
        const horiz = az0 === az1;
        const a0 = horiz ? ax0 : az0;
        const a1 = horiz ? ax1 : az1;
        const segs = e.gate.side === sideId ? [[a0, e.gate.at - gap], [e.gate.at + gap, a1]] : [[a0, a1]];
        for (const [s0, s1] of segs) {
          const len = s1 - s0;
          if (len <= 0.05) continue;
          const mid = (s0 + s1) / 2;
          const P = (a, y) => (horiz ? [a, y, az0] : [ax0, y, a]);
          const sz = (l, h, t) => (horiz ? [l, h, t] : [t, h, l]);
          if (style === "stone") {
            sb.add(BOX, 0x9c968c, P(mid, 0.45), sz(len, 0.9, 0.5));
            sb.add(BOX, 0x857f76, P(mid, 0.93), sz(len + 0.05, 0.08, 0.6));
          }
          const n = Math.max(1, Math.round(len / (style === "steel" ? 2.5 : 2)));
          for (let i = 0; i <= n; i++) {
            const a = s0 + (len * i) / n;
            sb.add(BOX, postC, P(a, H / 2 + (style === "stone" ? 0.45 : 0)), sz(0.14, H, 0.14));
          }
          if (style === "steel") {
            // one diamond ≈ 0.25 m, whatever the panel length
            const pg = uvScale(new THREE.PlaneGeometry(len, H - 0.1), len / 1.0, (H - 0.1) / 1.0);
            const panel = new THREE.Mesh(pg, kit.mat(0xb8bec4, { map: chainTex(), side: THREE.DoubleSide, rough: 0.4, metal: 0.6 }));
            panel.material.alphaTest = 0.35;
            panel.userData.ownGeo = true;
            panel.position.set(...P(mid, H / 2));
            panel.rotation.y = horiz ? 0 : Math.PI / 2;
            layout.add(panel);
            for (const y of [0.1, H - 0.05]) sb.add(BOX, railC, P(mid, y), sz(len, 0.08, 0.08));
          } else {
            const rails = style === "tall" ? [0.45, 0.95, 1.45] : style === "stone" ? [1.45] : [0.4, 0.95];
            for (const y of rails) sb.add(BOX, railC, P(mid, y), sz(len, 0.12, 0.07));
          }
        }
      };
      side("N", r.x0, r.z0, r.x1, r.z0);
      side("S", r.x0, r.z1, r.x1, r.z1);
      side("W", r.x0, r.z0, r.x0, r.z1);
      side("E", r.x1, r.z0, r.x1, r.z1);
      // gate door (hinged at one side of the gap)
      const along = e.gate.side === "E" || e.gate.side === "W" ? { x: 0, z: 1 } : { x: 1, z: 0 };
      const hinge = new THREE.Group();
      hinge.position.set(gp.center.x - along.x * gap, 0, gp.center.z - along.z * gap);
      const door = new THREE.Group();
      hinge.add(door);
      const dh = Math.min(H, 1.6);
      for (const y of [0.25, dh - 0.1]) door.add(mesh(BOX, kit.mat(style === "steel" ? 0x4a5058 : 0x6b4a2c), [along.x, y, along.z], [along.x * 2 + 0.06, 0.1, along.z * 2 + 0.06]));
      for (let i = 0; i <= 5; i++) door.add(mesh(BOX, kit.mat(style === "steel" ? 0x3a3f45 : 0x8a5a33), [along.x * (0.1 + i * 0.36), dh / 2 + 0.05, along.z * (0.1 + i * 0.36)], [0.06, dh - 0.1, 0.06]));
      door.add(mesh(BOX, kit.mat(0xf2b632), [along.x * 1.85, dh * 0.6, along.z * 1.85], [0.12, 0.12, 0.12]));
      layout.add(hinge);
      // trough (giraffes get a raised hay rack) + basin
      const tr = e.trough;
      const raised = e.id === "giraffe" ? 1.7 : 0;
      if (raised) {
        for (const k of [-1, 1]) sb.add(BOX, 0x6b4a2c, [tr.x + along.x * k * 0.7, raised / 2 + 0.2, tr.z + along.z * k * 0.7], [0.12, raised + 0.4, 0.12]);
      }
      sb.add(BOX, 0x7a5230, [tr.x, raised + 0.22, tr.z], [0.2 + along.x * 1.4 + along.z * 0.7, 0.44, 0.2 + along.z * 1.4 + along.x * 0.7]);
      const fill = mesh(BOX, kit.mat(e.id === "lion" ? 0xa8433a : 0xc9a647, { flat: true }), [tr.x, raised + 0.3, tr.z], [along.x * 1.3 + along.z * 0.6 + 0.1, 0.3, along.z * 1.3 + along.x * 0.6 + 0.1], null, false);
      layout.add(fill);
      const bs = e.basin;
      const big = e.id === "elephant" ? 1.6 : 1;
      sb.add(CYL16, 0x9a958c, [bs.x, 0.22, bs.z], [0.75 * big, 0.44, 0.6 * big]);
      const water = new THREE.Mesh(DISC, waterMat);
      water.scale.set(0.64 * big, 1, 0.5 * big);
      water.position.set(bs.x, 0.4, bs.z);
      layout.add(water);
      // decorations
      if (e.id === "rabbit") {
        sb.add(BOX, 0xa8763f, [-16.5, 0.45, 15], [1.8, 0.9, 1.2]);
        sb.add(roofPrism, 0xb2412f, [-16.5, 0.9, 15], [1.4, 0.6, 2.1], [0, Math.PI / 2, 0]);
        sb.add(BOX, 0x2a1d14, [-16.5, 0.3, 15.61], [0.5, 0.5, 0.02]);
        for (let i = 0; i < 3; i++) sb.add(CYL, 0x8a5a33, [-11 - i * 0.2, 0.18 + i * 0.3, 21 + (i === 2 ? 0.2 : i * 0.38)], [0.18, 1.6, 0.18], [0, 0, Math.PI / 2]);
        for (let i = 0; i < 8; i++) groundB.add(PLANE, 0x9fcf6a, [r.x0 + 2 + RR() * (w - 4), 0.02, r.z0 + 2 + RR() * (d - 4)], [0.5, 1, 0.5]);
      } else if (e.id === "deer") {
        for (let i = 0; i < 4; i++) fb.add(DODE, jit(0x8a857c, RR, 0.1), [8 + RR() * 12, 0.25, 14 + RR() * 10], [0.6, 0.4, 0.5], [RR(), RR(), RR()]);
        sb.add(BOX, 0x6b4a2c, [19.5, 1.2, 24.5], [3, 0.12, 2.4]);
        for (const [dx, dz] of [[-1.3, -1], [1.3, -1], [-1.3, 1], [1.3, 1]]) sb.add(BOX, 0x6b4a2c, [19.5 + dx, 0.6, 24.5 + dz], [0.12, 1.2, 0.12]);
      } else if (e.id === "zebra") {
        for (let i = 0; i < 5; i++) fb.add(DODE, jit(0xa89a80, RR, 0.1), [-24 + RR() * 16, 0.3, -17 + RR() * 14], [0.8 + RR() * 0.6, 0.5, 0.7], [RR(), RR(), RR()]);
      } else if (e.id === "giraffe") {
        sb.add(BOX, 0xa8763f, [-30, 2.5, -56], [4, 0.2, 3]);
        for (const [dx, dz] of [[-1.8, -1.3], [1.8, -1.3], [-1.8, 1.3], [1.8, 1.3]]) sb.add(CYL, 0x6b4a2c, [-30 + dx, 1.25, -56 + dz], [0.1, 2.5, 0.1]);
      } else if (e.id === "lion") {
        fb.add(DODE, 0x9c8f7e, [24, 0.8, -48], [3.4, 1.4, 2.4], [0.2, 0.5, 0]);
        fb.add(DODE, 0xa89a88, [27, 0.5, -45], [1.6, 0.9, 1.4], [0.4, 0.2, 0.3]);
        fb.add(DODE, 0x958877, [12, 0.5, -40], [1.4, 0.8, 1.2], [0.1, 0.9, 0.2]);
      } else if (e.id === "elephant") {
        const pond = new THREE.Mesh(DISC, waterMat);
        pond.scale.set(5, 1, 3.5);
        pond.position.set(70, 0.06, -15);
        layout.add(pond);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          fb.add(DODE, jit(0x8f877c, RR, 0.1), [70 + Math.cos(a) * 5, 0.15, -15 + Math.sin(a) * 3.5], [0.5, 0.3, 0.5], [RR(), RR(), RR()]);
        }
        for (let i = 0; i < 4; i++) sb.add(CYL, 0x7a5230, [56 + i * 0.6, 0.3, -9], [0.3, 2, 0.3], [0, 0.2 * i, Math.PI / 2]);
      }
      // info sign
      const sp = SPECIES[e.id];
      const g = signBoard(kit, "info" + e.id, [sp.plural.toUpperCase(), "Press E for info"], { width: 1.5, bg: "#f6e7c8", band: "#3f7a32", size: 64, size2: 36 });
      g.position.set(e.sign.x, 1.35, e.sign.z);
      g.rotation.y = e.gate.side === "S" ? 0 : e.sign.x < 0 ? Math.PI / 2 : -Math.PI / 2;
      layout.add(g);
      encViews[e.id] = { hinge, door, open: 0, fill, water, gate: gp, raised, base: { fill: fill.scale.y } };
    }
    // locked zone barriers
    for (const [id, z] of Object.entries(ZONES)) {
      if (!z.barrier || zoo.zones[id]) continue;
      const b = z.barrier;
      const horiz = b.x1 - b.x0 > b.z1 - b.z0;
      const len = horiz ? b.x1 - b.x0 : b.z1 - b.z0;
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      for (let i = 0; i < 6; i++) {
        const t = (i + 0.5) / 6 - 0.5;
        const px = horiz ? cx + t * len : cx;
        const pz = horiz ? cz : cz + t * len;
        sb.add(BOX, i % 2 ? 0xffffff : 0xe03a2a, [px, 0.85, pz], horiz ? [len / 6, 0.32, 0.08] : [0.08, 0.32, len / 6]);
        sb.add(BOX, i % 2 ? 0xe03a2a : 0xffffff, [px, 0.4, pz], horiz ? [len / 6, 0.22, 0.08] : [0.08, 0.22, len / 6]);
      }
      for (const k of [-1, 1]) {
        const px = horiz ? cx + k * len * 0.48 : cx;
        const pz = horiz ? cz : cz + k * len * 0.48;
        sb.add(BOX, 0x3a3a3a, [px, 0.55, pz], [0.12, 1.1, 0.12]);
        sb.add(CONE, 0xff7a1a, [px + (horiz ? 0 : -0.7), 0.3, pz + (horiz ? 0.7 : 0)], [0.22, 0.6, 0.22]);
      }
      const g = signBoard(kit, "zone" + id, [z.name.toUpperCase(), `Unlock: $${z.cost.toLocaleString("en-US")}`, "Press E"], { width: 2.0, twoPosts: true, h: 256, bg: "#fff3d6", band: "#ff7a1a", size: 64, size2: 42 });
      g.position.set(z.sign.x, 1.45, z.sign.z);
      g.rotation.y = id === "savanna" ? 0 : -Math.PI / 2;
      layout.add(g);
    }
    // upgrades
    if (zoo.upgrades.benches) for (const b of BENCHES) if (b.extra) bench(b, sb);
    if (zoo.upgrades.flowers) {
      for (const f of FLOWER_BEDS) {
        sb.add(CYL16, 0x8a6a4a, [f.x, 0.12, f.z], [f.r, 0.24, f.r]);
        sb.add(CYL16, 0x5a3d26, [f.x, 0.25, f.z], [f.r - 0.1, 0.02, f.r - 0.1]);
        const RR = rng(Math.round(f.x * 13 + f.z * 7));
        for (let i = 0; i < 22; i++) {
          const a = RR() * Math.PI * 2;
          const rr = Math.sqrt(RR()) * (f.r - 0.2);
          sb.add(CYL, 0x3f7a32, [f.x + Math.cos(a) * rr, 0.38, f.z + Math.sin(a) * rr], [0.02, 0.28, 0.02]);
          sb.add(SPH, [0xff5a7a, 0xffd23f, 0xb47cff, 0xff8a3a, 0xffffff][i % 5], [f.x + Math.cos(a) * rr, 0.55, f.z + Math.sin(a) * rr], 0.09);
        }
      }
    }
    if (zoo.upgrades.kiosk) {
      const k = BUILDINGS.find((b) => b.id === "kiosk");
      const r = k.rect;
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      sb.add(BOX, 0xf7f1e4, [cx, 1.0, cz], [r.x1 - r.x0, 2, r.z1 - r.z0]);
      sb.add(BOX, 0xff8fb0, [cx, 0.5, cz + 1.42], [3.4, 1.0, 0.04]);
      sb.add(CYL16, 0xff6f9c, [cx, 2.5, cz], [2.6, 0.12, 2.0]);
      sb.add(CONE, 0xffffff, [cx, 2.55, cz], [2.4, 0.6, 1.9]);
      for (let i = 0; i < 3; i++) sb.add(SPH, [0xfff1c9, 0xff9fbf, 0x8a5a33][i], [cx - 0.8 + i * 0.8, 2.2, cz + 1.5], 0.18);
      const g = signBoard(kit, "kiosk", ["SNACKS & ICE CREAM"], { width: 2.4, posts: false, w: 768, h: 140, size: 60, bg: "#fff", band: "#ff6f9c" });
      g.position.set(cx, 1.65, cz + 1.46);
      layout.add(g);
      // a couple of parasol tables
      for (const dx of [-3.4, 3.4]) {
        sb.add(CYL, 0xffffff, [cx + dx, 0.38, cz + 2.4], [0.5, 0.06, 0.5]);
        sb.add(CYL, 0x777777, [cx + dx, 0.19, cz + 2.4], [0.05, 0.38, 0.05]);
      }
    }
    const lm = [sb.build(solidMat), fb.build(flatMat), groundB.build(solidMat, false, true)];
    for (const m of lm) if (m) layout.add(m);
  }

  function chainTex() {
    return kit.canvasTex("chain2", 64, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = "rgba(255,255,255,1)";
      g.lineWidth = 1.6;
      for (let i = -64; i <= 128; i += 16) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + 64, 64);
        g.stroke();
        g.beginPath();
        g.moveTo(i + 64, 0);
        g.lineTo(i, 64);
        g.stroke();
      }
    }, [1, 1]);
  }

  /* ---------------- entities */
  const animals = new Map();
  const people = new Map();
  const npcs = new Map();
  const dirt = new Map();
  const ents = new THREE.Group();
  scene.add(ents);

  function syncEntities(zoo, dt) {
    // animals
    const seen = new Set();
    for (const a of zoo.animals) {
      seen.add(a.id);
      let v = animals.get(a.id);
      if (!v) {
        v = createAnimal(kit, a);
        ents.add(v.root);
        animals.set(a.id, v);
      }
      v.root.position.set(a.x, 0, a.z);
      v.root.rotation.y = a.rot;
      v.update(a, dt);
    }
    for (const [id, v] of animals) if (!seen.has(id)) {
      ents.remove(v.root);
      animals.delete(id);
    }
    // visitors
    seen.clear();
    for (const w of zoo.visitors) {
      seen.add(w.id);
      let v = people.get(w.id);
      if (!v) {
        v = createPerson(kit, { seed: w.seed, kid: w.kid });
        ents.add(v.root);
        people.set(w.id, v);
      }
      v.root.position.set(w.x, 0, w.z);
      v.root.rotation.y = w.rot;
      v.update(w, dt);
    }
    for (const [id, v] of people) if (!seen.has(id)) {
      ents.remove(v.root);
      people.delete(id);
    }
    // staff
    for (const role of Object.keys(STAFF)) {
      const n = zoo.npcs[role];
      let v = npcs.get(role);
      if (n && !v) {
        v = createPerson(kit, { seed: 77 + role.length, uniform: STAFF[role].color, hat: STAFF[role].color, carry: role === "keeper" ? "bucket" : role === "cleaner" ? "broom" : null });
        ents.add(v.root);
        npcs.set(role, v);
      } else if (!n && v) {
        ents.remove(v.root);
        npcs.delete(role);
        v = null;
      }
      if (v) {
        v.root.position.set(n.x, 0, n.z);
        v.root.rotation.y = n.rot;
        v.update(n, dt);
      }
    }
    // droppings
    seen.clear();
    for (const e of ENCLOSURES) {
      for (const d of zoo.enc[e.id].dirt) {
        seen.add(d.id);
        let m = dirt.get(d.id);
        if (!m) {
          m = new THREE.Mesh(lumpGeo, lumpMat);
          m.position.set(d.x, 0.01, d.z);
          m.rotation.y = d.id * 1.7;
          m.scale.setScalar(d.s * 1.6);
          m.castShadow = true;
          ents.add(m);
          dirt.set(d.id, m);
        }
      }
    }
    for (const [id, m] of dirt) if (!seen.has(id)) {
      ents.remove(m);
      dirt.delete(id);
    }
    // troughs, basins, gates
    const p = zoo.player;
    for (const [id, v] of Object.entries(encViews)) {
      const st = zoo.enc[id];
      v.fill.visible = st.trough > 0.01;
      v.fill.scale.y = 0.3 * Math.max(0.05, st.trough);
      v.fill.position.y = v.raised + 0.08 + v.fill.scale.y / 2;
      v.water.visible = st.basin > 0.01;
      v.water.position.y = 0.12 + 0.3 * st.basin;
      let near = Math.hypot(p.x - v.gate.center.x, p.z - v.gate.center.z) < 2.6;
      for (const n of Object.values(zoo.npcs)) if (Math.hypot(n.x - v.gate.center.x, n.z - v.gate.center.z) < 2.2) near = true;
      v.open += ((near ? 1 : 0) - v.open) * Math.min(1, dt * 5);
      // swing inward, into the habitat
      v.hinge.rotation.y = -v.open * 1.6 * (v.gate.normal.x !== 0 ? v.gate.normal.x : -v.gate.normal.z);
    }
  }

  /* ---------------- interaction marker + particles */
  const marker = new THREE.Mesh(kit.geo("oct", () => new THREE.OctahedronGeometry(0.12, 0)), kit.mat(0xffd23f, { emissive: 0xffb800, ei: 0.8 }));
  marker.visible = false;
  scene.add(marker);
  let markerT = 0;
  const parts = [];
  const partGeo = kit.geo("part", () => new THREE.IcosahedronGeometry(0.05, 0));
  for (let i = 0; i < 70; i++) {
    const m = new THREE.Mesh(partGeo, kit.mat(0xffffff));
    m.visible = false;
    scene.add(m);
    parts.push({ m, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  const PART_COLORS = { feed: [0xc9a647, 0x9c6b2f], water: [0x7cc4ea, 0xdff4ff], clean: [0xf4f1e6, 0xb8a27a], cash: [0xffd23f, 0x55b06a], build: [0xff7a1a, 0xffd23f, 0x55b06a] };
  function burst(kind, x, y, z, n = 14) {
    const cols = PART_COLORS[kind] || [0xffffff];
    let k = 0;
    for (const p of parts) {
      if (p.life > 0) continue;
      p.life = 0.7 + Math.random() * 0.5;
      p.m.material = kit.mat(cols[k % cols.length]);
      p.m.position.set(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4);
      p.vx = (Math.random() - 0.5) * 2.4;
      p.vy = 1.5 + Math.random() * 2.2;
      p.vz = (Math.random() - 0.5) * 2.4;
      p.m.visible = true;
      if (++k >= n) break;
    }
  }

  /* ---------------- first-person hands + flashlight */
  const hands = createHands(kit);
  camera.add(hands.group);
  const flash = new THREE.SpotLight(0xfff2d8, 0, 34, 0.5, 0.55, 1.2);
  flash.position.set(0, 0.05, -0.6);
  flash.target.position.set(0, -0.2, -5);
  camera.add(flash, flash.target);

  /* ---------------- wildlife: butterflies around the paths, birds overhead */
  const wingGeo = kit.geo("wing", () => new THREE.CircleGeometry(0.075, 7).translate(0.07, 0, 0).rotateX(-Math.PI / 2));
  const flyers = [];
  const BCOL = [0xffb020, 0xff6fa8, 0x7fc8ff, 0xffffff, 0xffe14d, 0xb88cff];
  for (let i = 0; i < 22; i++) {
    const g = new THREE.Group();
    const m = kit.mat(BCOL[i % BCOL.length], { side: THREE.DoubleSide });
    const wl = new THREE.Mesh(wingGeo, m);
    const wr = new THREE.Mesh(wingGeo, m);
    wr.scale.x = -1;
    g.add(wl, wr, mesh(kit.sphere(5, 4), kit.mat(0x2a2a2a), [0, 0, 0], [0.012, 0.012, 0.06], null, false));
    const a = i < 12 ? PLAZAS[i % 2] : null;
    const cx = a ? a.x + (R() - 0.5) * 10 : -36 + R() * 80;
    const cz = a ? a.z + (R() - 0.5) * 10 : -60 + R() * 90;
    g.userData = { cx, cz, ph: R() * 10, rad: 1.5 + R() * 2.5, sp: 0.4 + R() * 0.4, wl, wr };
    scene.add(g);
    flyers.push(g);
  }
  const birds = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    const bm = kit.mat(0x2b2f36, { side: THREE.DoubleSide });
    const l = new THREE.Mesh(BOX, bm);
    const r = new THREE.Mesh(BOX, bm);
    l.scale.set(0.7, 0.03, 0.18);
    r.scale.set(0.7, 0.03, 0.18);
    l.position.x = -0.35;
    r.position.x = 0.35;
    const lp = new THREE.Group();
    const rp = new THREE.Group();
    lp.add(l);
    rp.add(r);
    g.add(lp, rp, mesh(kit.sphere(6, 4), bm, [0, 0, 0], [0.1, 0.08, 0.3], null, false));
    g.userData = { lp, rp, ph: R() * 6.28, rad: 35 + R() * 35, y: 26 + R() * 14, sp: 0.07 + R() * 0.05, cx: 10 + (R() - 0.5) * 40, cz: -15 + (R() - 0.5) * 40 };
    scene.add(g);
    birds.push(g);
  }

  /* ---------------- objective beacon: light pillar + bobbing arrow + ground ring */
  const beacon = new THREE.Group();
  const beamTex = kit.canvasTex("beam", 8, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.7, "rgba(255,255,255,0.55)");
    gr.addColorStop(1, "rgba(255,255,255,0.95)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, map: beamTex, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beamGeo = new THREE.CylinderGeometry(0.32, 0.32, 24, 20, 1, true).translate(0, 12, 0);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
  const ringGeo = new THREE.RingGeometry(0.55, 0.72, 48).rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.06;
  const arrow = new THREE.Group();
  const gold = kit.mat(0xffc81a, { emissive: 0xffa000, ei: 0.9 });
  arrow.add(mesh(kit.geo("arrowHead", () => new THREE.ConeGeometry(0.3, 0.45, 4).rotateX(Math.PI)), gold, [0, 0, 0], 1, null, false));
  arrow.add(mesh(BOX, gold, [0, 0.4, 0], [0.14, 0.45, 0.14], null, false));
  beacon.add(beam, ring, arrow);
  beacon.visible = false;
  scene.add(beacon);
  own.push(beamMat, beamGeo, ringMat, ringGeo);
  let guide = null;

  /* ---------------- per-frame */
  const dayCol = {
    top: new THREE.Color(0x4f9be6), hor: new THREE.Color(0xd8ecf7), duskTop: new THREE.Color(0x2c3e75), duskHor: new THREE.Color(0xf4a46a),
    sun: new THREE.Color(0xfff0d6), duskSun: new THREE.Color(0xffa060), fog: new THREE.Color(0xcfe6f5), duskFog: new THREE.Color(0xc7a28a),
  };
  const sunDir = new THREE.Vector3();
  let menuT = 0;
  let bobT = 0;
  let size = { w: 1, h: 1 };

  function lighting(zoo, focus) {
    const f = zoo ? zoo.dayT / DAY_LENGTH : 0.35;
    const elev = Math.sin(Math.PI * (0.1 + 0.86 * f)); // high at midday, low at dusk
    const az = -0.6 + f * 2.2;
    const dir = sunDir.set(Math.cos(az) * 0.8, 0.25 + elev * 0.9, Math.sin(az) * 0.8 - 0.3).normalize();
    const dusk = THREE.MathUtils.smoothstep(f, 0.78, 1);
    sun.intensity = 0.6 + 2.2 * Math.max(0, elev) * (1 - dusk * 0.55);
    sun.color.copy(dayCol.sun).lerp(dayCol.duskSun, dusk * 0.8 + (1 - elev) * 0.2);
    hemi.intensity = 0.75 - dusk * 0.3;
    scene.environmentIntensity = 0.65 - dusk * 0.35;
    skyU.top.value.copy(dayCol.top).lerp(dayCol.duskTop, dusk);
    skyU.horizon.value.copy(dayCol.hor).lerp(dayCol.duskHor, dusk * 0.85);
    skyU.sunDir.value.copy(dir);
    fog.color.copy(dayCol.fog).lerp(dayCol.duskFog, dusk * 0.7);
    glowMat.emissiveIntensity = dusk * 1.4;
    sun.position.set(focus.x + dir.x * 80, dir.y * 80, focus.z + dir.z * 80);
    sun.target.position.set(focus.x, 0, focus.z);
    return dusk;
  }

  let curZoo = null;
  function resetEntities() {
    for (const m of [animals, people, npcs, dirt]) {
      for (const v of m.values()) ents.remove(v.root || v);
      m.clear();
    }
  }

  function render(zoo, dt, mode) {
    if (zoo !== curZoo) {
      // switching between the menu showcase zoo and the player's zoo
      curZoo = zoo;
      resetEntities();
      layoutVer = -1;
    }
    if (zoo && zoo.layoutVersion !== layoutVer) {
      layoutVer = zoo.layoutVersion;
      buildLayout(zoo);
    }
    if (zoo) syncEntities(zoo, dt);
    const p = zoo?.player;
    if (mode === "play" && p) {
      bobT += dt * (p.moving > 0.3 ? (p.sprinting ? 13 : 9.5) : 0);
      const bob = Math.sin(bobT) * 0.045 * Math.min(1, p.moving / 4);
      camera.position.set(p.x, EYE + bob, p.z);
      camera.rotation.set(p.pitch, p.yaw, 0);
      hands.group.visible = true;
      hands.update(dt, { tool: p.tool, food: p.food, water: p.water, foodCap: zoo.foodCap, waterCap: zoo.waterCap, moving: p.moving, sprint: p.sprinting });
      flash.intensity = p.flashlight ? 30 : 0;
    } else {
      menuT += dt;
      const a = menuT * 0.05 + 0.6;
      camera.position.set(8 + Math.cos(a) * 58, 30, -8 + Math.sin(a) * 58);
      camera.lookAt(6, 0, -6);
      hands.group.visible = false;
      flash.intensity = 0;
    }
    lighting(zoo, mode === "play" && p ? p : { x: 8, z: -8 });
    sky.position.copy(camera.position);
    const t = performance.now() * 0.001;
    windU.value = t;
    rippleTex.offset.set((t * 0.018) % 1, (t * 0.011) % 1);
    for (const c of clouds.children) {
      c.position.x += c.userData.v * dt;
      if (c.position.x > 190) c.position.x = -160;
    }
    for (const f of flyers) {
      const u = f.userData;
      const k = t * u.sp + u.ph;
      const nx = u.cx + Math.sin(k) * u.rad + Math.sin(k * 2.3) * 0.6;
      const nz = u.cz + Math.cos(k * 0.8) * u.rad;
      f.rotation.y = Math.atan2(nx - f.position.x, nz - f.position.z);
      f.position.set(nx, 0.9 + Math.sin(k * 3.1) * 0.35 + Math.sin(t * 9 + u.ph) * 0.05, nz);
      const flap = Math.sin(t * 22 + u.ph) * 1.1;
      u.wl.rotation.z = flap;
      u.wr.rotation.z = -flap;
    }
    for (const b of birds) {
      const u = b.userData;
      const k = t * u.sp + u.ph;
      b.position.set(u.cx + Math.cos(k) * u.rad, u.y + Math.sin(k * 3) * 2, u.cz + Math.sin(k) * u.rad);
      b.rotation.y = -k;
      const flap = Math.sin(t * 7 + u.ph) * 0.5;
      u.lp.rotation.z = flap;
      u.rp.rotation.z = -flap;
    }
    if (guide && mode === "play" && p) {
      beacon.visible = true;
      beacon.position.set(guide.x, 0, guide.z);
      const d = Math.hypot(guide.x - p.x, guide.z - p.z);
      beamMat.opacity = Math.min(0.5, Math.max(0.06, (d - 3) / 14));
      arrow.position.y = (guide.y || 1) + 0.9 + Math.sin(t * 3) * 0.15;
      arrow.rotation.y = t * 1.6;
      const pulse = (t * 0.8) % 1;
      ring.scale.setScalar(0.8 + pulse * 1.4);
      ringMat.opacity = 0.85 * (1 - pulse);
    } else beacon.visible = false;
    // fountain spray
    spray.children.forEach((pv, i) => {
      const s = pv.children[0];
      s.scale.set(1, 0.9 + Math.sin(t * 5 + i) * 0.12, 1);
    });
    // marker
    markerT += dt;
    if (marker.visible) {
      marker.rotation.y += dt * 2.5;
      marker.position.y = marker.userData.y + Math.sin(markerT * 4) * 0.06;
    }
    for (const q of parts) {
      if (q.life <= 0) continue;
      q.life -= dt;
      q.vy -= 9 * dt;
      q.m.position.x += q.vx * dt;
      q.m.position.y = Math.max(0.03, q.m.position.y + q.vy * dt);
      q.m.position.z += q.vz * dt;
      q.m.scale.setScalar(Math.max(0.1, q.life * 1.4));
      if (q.life <= 0) q.m.visible = false;
    }
    renderer.render(scene, camera);
  }

  function setGuide(g) {
    guide = g;
  }

  function setTarget(it) {
    if (!it) {
      marker.visible = false;
      return;
    }
    marker.visible = true;
    marker.userData.y = it.y + it.r * (it.kind === "animal" ? 0.9 : 0.6) + 0.35;
    marker.position.set(it.x, marker.userData.y, it.z);
  }

  function resize(w, h) {
    size = { w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(h)) };
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    clearLayout();
    scene.traverse((o) => {
      if (o.userData?.ownGeo) o.geometry.dispose();
    });
    if (groundMesh) groundMesh.geometry.dispose();
    for (const x of own) x.dispose();
    kit.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return {
    renderer, scene, camera, kit, render, resize, setTarget, setGuide, burst, dispose,
    useTool: () => hands.use(),
    /** Camera eye + forward direction for crosshair picking. */
    look() {
      const d = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
      return { eye: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, dir: { x: d.x, y: d.y, z: d.z } };
    },
    stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, animals: animals.size, people: people.size }),
  };
}
