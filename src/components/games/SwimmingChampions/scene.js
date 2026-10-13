/**
 * Swimming Champions — imperative Three.js view of a Race (engine.js).
 *
 * Builds an indoor Olympic pool (tiled tank, animated water shader, lane
 * ropes, blocks, backstroke flags, stands with an instanced crowd), six
 * jointed swimmers, a pooled splash particle system and a scripted camera.
 * `render(race, dt, mode)` poses everything from the race state; nothing here
 * changes the simulation. `dispose()` frees every GPU resource.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { POOL, LANES, LANE_W, laneX, PLAYER_LANE, TUNE } from "./engine.js";

const HALF_W = (LANES * LANE_W) / 2 + 0.5; // pool half width (8 m)
const DEPTH = 2;
const DECK = 0.25;
const TAU = Math.PI * 2;

const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const dampAngle = (a, b, rate, dt) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * (1 - Math.exp(-rate * dt));
};

/* ------------------------------------------------------------ textures */
function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function tiles(ctx, w, h, n, base, grout) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = grout;
  ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    const p = (i / n) * w;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, h);
    ctx.moveTo(0, p);
    ctx.lineTo(w, p);
    ctx.stroke();
  }
}

function poolFloorTex() {
  const PX = 20; // px per metre
  const W = HALF_W * 2 * PX;
  const H = POOL * PX;
  return canvasTex(W, H, (ctx) => {
    ctx.fillStyle = "#bdeefa";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(60,150,190,0.35)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += PX / 2) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += PX / 2) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#0b2f6b";
    for (let l = 0; l < LANES; l++) {
      const cx = (laneX(l) + HALF_W) * PX;
      ctx.fillRect(cx - 0.13 * PX, 2 * PX, 0.26 * PX, H - 4 * PX);
      ctx.fillRect(cx - 0.5 * PX, 2 * PX, PX, 0.26 * PX);
      ctx.fillRect(cx - 0.5 * PX, H - 2.26 * PX, PX, 0.26 * PX);
    }
  });
}

function endWallTex() {
  const PX = 40;
  const W = HALF_W * 2 * PX;
  const H = (DEPTH + DECK) * PX;
  return canvasTex(W, H, (ctx) => {
    tiles(ctx, W, H, 64, "#d3f3fb", "rgba(70,150,190,0.4)");
    for (let l = 0; l < LANES; l++) {
      const cx = (laneX(l) + HALF_W) * PX;
      // touch pad
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(cx - 0.9 * PX, 0.05 * PX, 1.8 * PX, 0.95 * PX);
      ctx.fillStyle = "#0b2f6b";
      ctx.fillRect(cx - 0.9 * PX, 0.98 * PX, 1.8 * PX, 0.06 * PX);
      // target cross
      ctx.fillRect(cx - 0.13 * PX, 1.1 * PX, 0.26 * PX, H - 1.2 * PX);
      ctx.fillRect(cx - 0.5 * PX, 1.4 * PX, PX, 0.26 * PX);
    }
  });
}

function boardTex(text, sub) {
  return canvasTex(1024, 384, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#06204a");
    g.addColorStop(1, "#021025");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#22e3ff";
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 78px system-ui, sans-serif";
    ctx.fillText(text, w / 2, 170);
    ctx.fillStyle = "#ffd23f";
    ctx.font = "800 54px system-ui, sans-serif";
    ctx.fillText(sub, w / 2, 280);
  });
}

function ledTex() {
  return canvasTex(1024, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#0a4fa8");
    g.addColorStop(0.5, "#0b8fd0");
    g.addColorStop(1, "#0a4fa8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 38px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("SWIMMING CHAMPIONS", 30, h / 2);
    ctx.fillStyle = "#ffd23f";
    ctx.fillText("DIVE • SWIM • WIN", 560, h / 2);
  }, [6, 1]);
}

function blockNumTex(n, color) {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#f4f8fb";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, 22);
    ctx.fillStyle = "#0b2f6b";
    ctx.font = "900 86px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(n), w / 2, h / 2 + 10);
  });
}

function dotTex() {
  const t = canvasTex(64, 64, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,0.75)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/* ------------------------------------------------------------ water */
const WATER_VS = /* glsl */ `
uniform float uTime;
uniform vec3 uSw[6];
varying vec3 vW;
varying float vH;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec2 p = w.xz;
  float h = 0.03 * sin(p.x * 0.9 + uTime * 1.3)
          + 0.025 * sin(p.y * 0.7 - uTime * 1.1 + p.x * 0.3)
          + 0.012 * sin((p.x + p.y) * 2.3 + uTime * 2.4);
  for (int i = 0; i < 6; i++) {
    vec2 d = (p - uSw[i].xy) * vec2(1.0, 0.55);
    float r = length(d);
    h += uSw[i].z * 0.055 * exp(-r * r * 0.7) * sin(r * 7.0 - uTime * 9.0);
  }
  w.y += h;
  vW = w.xyz;
  vH = h;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const WATER_FS = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFogColor;
uniform vec2 uFog;
varying vec3 vW;
varying float vH;
void main() {
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  if (n.y < 0.0) n = -n;
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 L = normalize(vec3(0.25, 1.0, 0.35));
  float spec = pow(max(dot(n, normalize(L + V)), 0.0), 140.0);
  vec2 p = vW.xz * 1.25;
  float c = sin(p.x * 1.7 + sin(p.y * 1.3 + uTime * 0.9) * 1.6 + uTime * 0.7)
          * sin(p.y * 1.9 + sin(p.x * 1.1 - uTime * 0.8) * 1.6 - uTime * 0.6);
  c = smoothstep(0.55, 1.0, c);
  vec3 col = mix(uShallow, uDeep, 0.3 + 0.4 * fres);
  col += vec3(0.8, 0.97, 1.0) * c * 0.16;
  col = mix(col, vec3(0.86, 0.96, 1.0), fres * 0.5);
  col += vec3(1.0) * spec * 0.9;
  col += vec3(0.9, 1.0, 1.0) * smoothstep(0.035, 0.085, vH) * 0.45;
  float a = clamp(0.6 + fres * 0.35 + spec, 0.0, 0.97);
  float f = smoothstep(uFog.x, uFog.y, length(cameraPosition - vW));
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, a);
}
`;

/* ------------------------------------------------------------ human geometry */
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
/** Bake a transform into `geo` (position, euler rotation, scale). */
function put(geo, [x = 0, y = 0, z = 0] = [], [rx = 0, ry = 0, rz = 0] = [], [sx = 1, sy = 1, sz = 1] = []) {
  _m4.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  return geo.applyMatrix4(_m4);
}
/** Vertex colour for a part, multiplied with the material / instance colour. */
function tint(geo, r = 1, g = r, b = r) {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = r;
    a[i * 3 + 1] = g;
    a[i * 3 + 2] = b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return geo;
}
/** Muscle-shaped limb: a lathe along +z (dir 1) or -z (dir -1) of length `len`. */
function limb(len, radii, seg = 12, dir = 1) {
  const pts = [new THREE.Vector2(0, 0)];
  radii.forEach((r, i) => pts.push(new THREE.Vector2(r, len * (0.02 + (0.96 * i) / (radii.length - 1)))));
  pts.push(new THREE.Vector2(0, len)); // bottom → top keeps normals outward
  return new THREE.LatheGeometry(pts, seg).rotateX((dir * Math.PI) / 2);
}
const merge = (parts) => {
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return g;
};
const LIP = [0.72, 0.42, 0.42];

/* ------------------------------------------------------------ swimmers */
function buildSwimmerGeo() {
  const sphere = (r, w = 16, h = 12, ...rest) => new THREE.SphereGeometry(r, w, h, ...rest);
  const forearm = (side) =>
    merge([
      tint(limb(0.27, [0.043, 0.047, 0.046, 0.04, 0.034, 0.03], 10)),
      tint(put(sphere(0.042, 10, 8), [], [], [1, 1, 1.4])), // elbow
      tint(put(new THREE.BoxGeometry(0.078, 0.026, 0.09, 2, 1, 2), [0, -0.004, 0.315])), // palm
      tint(put(new THREE.BoxGeometry(0.07, 0.02, 0.078, 2, 1, 2), [0, -0.012, 0.395], [0.2, 0, 0])), // fingers
      tint(put(new THREE.CapsuleGeometry(0.012, 0.035, 3, 6), [-side * 0.046, -0.012, 0.32], [Math.PI / 2 - 0.4, 0, side * 0.5])), // thumb
    ]);
  return {
    torso: merge([
      tint(put(limb(0.66, [0.15, 0.152, 0.14, 0.132, 0.148, 0.168, 0.178, 0.172, 0.14], 18), [0, 0, -0.06], [], [1.12, 0.72, 1])),
      // deltoids: long ovals that blend the shoulder into the upper arm
      tint(put(sphere(0.07, 14, 10), [0.185, 0.012, 0.535], [0, 0.25, 0], [0.95, 0.85, 1.45])),
      tint(put(sphere(0.07, 14, 10), [-0.185, 0.012, 0.535], [0, -0.25, 0], [0.95, 0.85, 1.45])),
      // pecs + trapezius, kept flat so they shape rather than bulge
      tint(put(sphere(0.1, 14, 10), [0.07, -0.045, 0.46], [], [1.05, 0.42, 0.8])),
      tint(put(sphere(0.1, 14, 10), [-0.07, -0.045, 0.46], [], [1.05, 0.42, 0.8])),
      tint(put(sphere(0.11, 14, 10), [0, 0.05, 0.57], [], [1.35, 0.4, 0.6])),
      tint(put(new THREE.CylinderGeometry(0.05, 0.058, 0.14, 12), [0, 0.005, 0.65], [Math.PI / 2, 0, 0])), // neck
    ]),
    trunks: put(limb(0.24, [0.16, 0.164, 0.158, 0.148], 18), [0, 0, -0.09], [], [1.13, 0.77, 1]),
    head: merge([
      tint(put(sphere(0.104, 20, 16), [], [], [0.9, 1, 1.12])), // cranium
      tint(put(sphere(0.08, 16, 12), [0, -0.03, -0.058], [], [0.95, 0.92, 0.85])), // jaw + chin
      tint(put(new THREE.ConeGeometry(0.017, 0.044, 8), [0, -0.111, -0.018], [Math.PI + 0.25, 0, 0])), // nose
      tint(put(sphere(0.026, 8, 6), [0.094, 0.01, -0.012], [], [0.45, 0.75, 1])), // ears
      tint(put(sphere(0.026, 8, 6), [-0.094, 0.01, -0.012], [], [0.45, 0.75, 1])),
      tint(put(new THREE.BoxGeometry(0.044, 0.012, 0.011), [0, -0.1, -0.07]), ...LIP), // lips
      tint(put(sphere(0.012, 8, 6), [0.032, -0.098, 0.04], [], [1.4, 0.5, 0.6]), 0.55, 0.45, 0.4), // brows
      tint(put(sphere(0.012, 8, 6), [-0.032, -0.098, 0.04], [], [1.4, 0.5, 0.6]), 0.55, 0.45, 0.4),
    ]),
    goggles: merge([
      put(new THREE.CylinderGeometry(0.027, 0.025, 0.022, 16), [0.041, -0.1, 0.012], [0, 0, -0.32]),
      put(new THREE.CylinderGeometry(0.027, 0.025, 0.022, 16), [-0.041, -0.1, 0.012], [0, 0, 0.32]),
      put(new THREE.BoxGeometry(0.026, 0.008, 0.008), [0, -0.113, 0.012]),
      put(new THREE.TorusGeometry(0.11, 0.0055, 4, 32), [0, 0, 0.012], [], [0.93, 1.02, 1]),
    ]),
    // tilted back so the brow and goggles stay clear, nape covered
    cap: put(sphere(0.109, 22, 10, 0, TAU, 0, Math.PI * 0.55).rotateX(Math.PI / 2), [], [-0.38, 0, 0], [0.92, 1.02, 1.13]),
    upper: tint(limb(0.31, [0.05, 0.056, 0.059, 0.053, 0.046, 0.042], 10)),
    foreL: forearm(1),
    foreR: forearm(-1),
    thigh: limb(0.43, [0.094, 0.096, 0.088, 0.078, 0.066, 0.058], 12, -1),
    shin: merge([
      tint(limb(0.41, [0.054, 0.063, 0.06, 0.048, 0.038, 0.033, 0.031], 10, -1)),
      tint(put(sphere(0.054, 10, 8), [], [], [1, 1, 1.5])), // knee
      tint(put(sphere(0.036, 8, 6), [0, 0.008, -0.41])), // heel
      tint(put(new THREE.BoxGeometry(0.08, 0.04, 0.17, 1, 1, 2), [0, -0.012, -0.5], [0.1, 0, 0])), // foot
      tint(put(sphere(0.042, 10, 6), [0, -0.016, -0.585], [], [1, 0.5, 1])), // toes
    ]),
  };
}

const BUILD = [1.02, 0.97, 1, 1.04, 0.99, 1.01];

function buildSwimmer(G, s, skinMats, darkMat) {
  const capMat = new THREE.MeshPhongMaterial({ color: s.cap, shininess: 110, specular: 0x777777 });
  const suitMat = new THREE.MeshPhongMaterial({ color: s.suit, shininess: 60, specular: 0x333333 });
  const skin = skinMats(s.skin);
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  };
  const root = new THREE.Group();
  root.scale.setScalar(BUILD[s.lane] || 1);
  const body = new THREE.Group();
  root.add(body);
  body.add(mesh(G.torso, skin));
  body.add(mesh(G.trunks, suitMat));
  const head = new THREE.Group();
  head.position.set(0, -0.012, 0.8);
  head.scale.setScalar(1.12);
  head.add(mesh(G.head, skin));
  head.add(mesh(G.cap, capMat));
  head.add(mesh(G.goggles, darkMat));
  body.add(head);

  const arm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.22 * side, 0.02, 0.56);
    const out = new THREE.Group();
    pivot.add(out);
    out.add(mesh(G.upper, skin));
    const elbow = new THREE.Group();
    elbow.position.z = 0.32;
    elbow.add(mesh(side > 0 ? G.foreL : G.foreR, skin));
    out.add(elbow);
    body.add(pivot);
    return { pivot, out, elbow };
  };
  const leg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(0.088 * side, -0.01, -0.04);
    hip.add(mesh(G.thigh, suitMat));
    const knee = new THREE.Group();
    knee.position.z = -0.43;
    knee.add(mesh(G.shin, skin));
    hip.add(knee);
    body.add(hip);
    return { hip, knee };
  };
  const view = {
    s,
    root,
    body,
    head,
    armL: arm(1), // left arm sits on +x when facing +z
    armR: arm(-1),
    legL: leg(1),
    legR: leg(-1),
    mats: [capMat, suitMat],
    // damped pose
    p: { y: 1.5, pitch: -Math.PI / 2, roll: 0, yaw: 0, aL: Math.PI, aR: Math.PI, oL: 0, oR: 0, eL: 0, eR: 0, hL: 0, hR: 0, kL: 0, kR: 0, head: 0 },
    off: 0,
    lastDir: 1,
    lastK: 0,
    sprayAcc: 0,
  };
  return view;
}

/* ------------------------------------------------------------ spectators */
/**
 * Seated fans as five instanced meshes (trousers, shirt, skin+face, hair,
 * arms). Faces use vertex colours for eyes, brows and mouth, so one
 * instanced skin tone covers the whole head. Built facing +x with the seat at
 * the origin; `animate` bounces bodies and swings the arms.
 */
function buildCrowd(fans) {
  const N = fans.length;
  const cap = (r, len, segs = 5) => new THREE.CapsuleGeometry(r, len, 2, segs);
  const legs = (z) => [
    put(cap(0.074, 0.3), [0.2, 0.075, z], [0, 0, Math.PI / 2]), // thigh
    put(cap(0.06, 0.3), [0.4, -0.15, z]), // shin
    put(new THREE.BoxGeometry(0.22, 0.08, 0.11), [0.45, -0.37, z]), // shoe
  ];
  const geo = {
    pants: merge([...legs(0.1), ...legs(-0.1), put(cap(0.15, 0.08, 6), [0, 0.06, 0], [Math.PI / 2, 0, 0], [0.75, 1, 1])]),
    shirt: merge([
      put(new THREE.CylinderGeometry(0.2, 0.16, 0.48, 8), [0, 0.36, 0], [], [0.62, 1, 1]),
      put(new THREE.SphereGeometry(0.2, 8, 4), [0, 0.6, 0], [], [0.62, 0.42, 1]),
      put(new THREE.SphereGeometry(0.068, 6, 4), [0, 0.57, 0.2]),
      put(new THREE.SphereGeometry(0.068, 6, 4), [0, 0.57, -0.2]),
    ]),
    face: merge([
      tint(put(new THREE.CylinderGeometry(0.048, 0.055, 0.1, 6, 1, true), [0, 0.68, 0])),
      tint(put(new THREE.SphereGeometry(0.105, 10, 8), [0.008, 0.82, 0], [], [0.92, 1.1, 0.88])),
      tint(put(new THREE.ConeGeometry(0.017, 0.04, 4), [0.103, 0.808, 0], [0, 0, -Math.PI / 2 + 0.3])), // nose
      tint(put(new THREE.SphereGeometry(0.024, 4, 3), [0, 0.82, 0.094], [], [0.8, 1, 0.45])), // ears
      tint(put(new THREE.SphereGeometry(0.024, 4, 3), [0, 0.82, -0.094], [], [0.8, 1, 0.45])),
      tint(put(new THREE.SphereGeometry(0.012, 4, 3), [0.088, 0.843, 0.034], [], [0.7, 1, 1]), 0.05), // eyes
      tint(put(new THREE.SphereGeometry(0.012, 4, 3), [0.088, 0.843, -0.034], [], [0.7, 1, 1]), 0.05),
      tint(put(new THREE.BoxGeometry(0.01, 0.007, 0.032), [0.092, 0.868, 0.035], [0.3, 0, 0]), 0.25), // brows
      tint(put(new THREE.BoxGeometry(0.01, 0.007, 0.032), [0.092, 0.868, -0.035], [-0.3, 0, 0]), 0.25),
      tint(put(new THREE.BoxGeometry(0.012, 0.01, 0.04), [0.091, 0.768, 0]), ...LIP), // mouth
    ]),
    hair: merge([
      put(new THREE.SphereGeometry(0.113, 10, 5, 0, TAU, 0, Math.PI * 0.52), [0.0, 0.835, 0], [0, 0, 0.42], [0.95, 1.1, 0.93]),
      put(new THREE.BoxGeometry(0.05, 0.12, 0.18), [-0.075, 0.79, 0]),
    ]),
    // pivot at the shoulder line; rotating about z swings both arms forward/up
    arms: merge(
      [0.205, -0.205].flatMap((z) => [
        tint(put(cap(0.042, 0.4), [0, -0.25, z])),
        tint(put(new THREE.SphereGeometry(0.046, 5, 4), [0, -0.5, z], [], [1, 1.2, 0.8])),
      ])
    ),
  };
  const lambert = (vc = false) => new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: vc });
  const mk = (g, vc) => {
    const m = new THREE.InstancedMesh(g, lambert(vc), N);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
  };
  const pants = mk(geo.pants);
  const shirt = mk(geo.shirt);
  const face = mk(geo.face, true);
  const hair = mk(geo.hair);
  const arms = mk(geo.arms, true);
  const bodies = [pants, shirt, face, hair];

  const SHIRTS = [0xff5a5a, 0xffd23f, 0x22e3ff, 0xffffff, 0x3ddc84, 0xff8a2a, 0x9b6bff, 0x1565c0, 0xf06292, 0x0b3d91, 0xe63946, 0x2ec4b6];
  const PANTS = [0x2b3f66, 0x1d2a44, 0x3b5b8c, 0x222222, 0x6b6257, 0x4a4f57, 0xc9b38a];
  const SKINS = [0xf1c7a1, 0xd9a27a, 0x8d5a3b, 0xc68a5e, 0xf6d2b8, 0x6b4128, 0xe8b48c];
  const HAIR = [0x1b1410, 0x3b2416, 0x5a3a22, 0x8a6a3a, 0xd8b56a, 0x9a3b1c, 0x8c8c8c, 0x101010];
  const c = new THREE.Color();
  const m = new THREE.Matrix4();
  const rest = new Float32Array(N); // resting arm angle (hands on lap / folded)
  const phase = new Float32Array(N);
  const keen = new Float32Array(N); // how wild this fan gets
  fans.forEach(([x, y, z, face1, k], i) => {
    const h = (i * 2654435761) >>> 0;
    const pick = (arr, sh) => arr[(h >>> sh) % arr.length];
    m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, face1 > 0 ? 0 : Math.PI, 0)), _s.set(k, k, k));
    for (const b of bodies) b.setMatrixAt(i, m);
    if ((h >>> 9) % 11 === 0) {
      m.makeScale(0, 0, 0); // a few bald heads
      hair.setMatrixAt(i, m);
    }
    shirt.setColorAt(i, c.setHex(pick(SHIRTS, 3)));
    pants.setColorAt(i, c.setHex(pick(PANTS, 7)));
    const skin = pick(SKINS, 13);
    face.setColorAt(i, c.setHex(skin));
    arms.setColorAt(i, c.setHex(skin));
    hair.setColorAt(i, c.setHex(pick(HAIR, 17)));
    rest[i] = 0.45 + ((h >>> 21) % 5) * 0.06;
    phase[i] = ((h >>> 5) % 628) / 100;
    keen[i] = (h >>> 24) % 4 === 0 ? 0.35 : 1;
  });

  const ys = fans.map((f) => f[1]);
  const writeArms = (i, a, j) => {
    const [x, y, z, face1, k] = fans[i];
    const e = arms.instanceMatrix.array;
    const o = i * 16;
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    // T · Ry(0|π) · Rz(a) · S(k), written out
    e[o] = k * face1 * cs;
    e[o + 1] = k * sn;
    e[o + 2] = 0;
    e[o + 3] = 0;
    e[o + 4] = -k * face1 * sn;
    e[o + 5] = k * cs;
    e[o + 6] = 0;
    e[o + 7] = 0;
    e[o + 8] = 0;
    e[o + 9] = 0;
    e[o + 10] = k * face1;
    e[o + 11] = 0;
    e[o + 12] = x;
    e[o + 13] = y + 0.57 * k + j;
    e[o + 14] = z;
    e[o + 15] = 1;
  };
  for (let i = 0; i < N; i++) writeArms(i, rest[i], 0);

  let calm = true;
  function animate(t, excite) {
    if (excite < 0.01) {
      if (calm) return;
      calm = true;
    } else calm = false;
    for (let i = 0; i < N; i++) {
      const w = excite * keen[i];
      const ph = t * (5 + (i % 4)) + phase[i];
      const j = Math.max(0, Math.sin(ph)) * 0.22 * w;
      for (const b of bodies) b.instanceMatrix.array[i * 16 + 13] = ys[i] + j;
      const wave = 0.5 + 0.5 * Math.sin(ph * 1.3);
      writeArms(i, rest[i] + w * (1.9 + 0.6 * wave), j);
    }
    for (const b of bodies) b.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
  }

  return { meshes: [pants, shirt, face, hair, arms], animate };
}

/* ------------------------------------------------------------ world */
export function createWorld(canvas, { preserve = false } = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 1.5, powerPreference: "high-performance", preserveDrawingBuffer: preserve });
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x0a1f3d);

  const scene = new THREE.Scene();
  const FOG = new THREE.Color(0x163c63);
  scene.fog = new THREE.Fog(FOG, 70, 150);
  scene.background = new THREE.Color(0x0a1f3d);
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 260);
  camera.position.set(22, 16, 62);

  scene.add(new THREE.HemisphereLight(0xe8f8ff, 0x2a6f8f, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(12, 30, 18);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbfe9ff, 0.6);
  fill.position.set(-14, 18, -20);
  scene.add(fill);

  const lambert = (o) => new THREE.MeshLambertMaterial(o);
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  };

  /* pool tank */
  const floor = add(new THREE.PlaneGeometry(HALF_W * 2, POOL), lambert({ map: poolFloorTex() }), 0, -DEPTH, POOL / 2);
  floor.rotation.x = -Math.PI / 2;
  const wallTex = canvasTex(256, 256, (ctx, w, h) => tiles(ctx, w, h, 16, "#c9eff9", "rgba(70,150,190,0.45)"), [POOL / 2, (DEPTH + DECK) / 2]);
  const sideMat = lambert({ map: wallTex });
  const wallH = DEPTH + DECK;
  for (const sx of [-1, 1]) {
    const w = add(new THREE.PlaneGeometry(POOL, wallH), sideMat, sx * HALF_W, -DEPTH + wallH / 2, POOL / 2);
    w.rotation.y = -sx * Math.PI / 2;
  }
  const endMat = lambert({ map: endWallTex() });
  for (const z of [0, POOL]) {
    const w = add(new THREE.PlaneGeometry(HALF_W * 2, wallH), endMat, 0, -DEPTH + wallH / 2, z);
    if (z > 0) w.rotation.y = Math.PI;
  }

  /* deck + coping */
  const deckTex = canvasTex(256, 256, (ctx, w, h) => tiles(ctx, w, h, 8, "#eef7fb", "rgba(120,160,185,0.4)"), [1, 1]);
  const deckPlane = (w, d, x, z) => {
    const t = deckTex.clone();
    t.needsUpdate = true;
    t.repeat.set(w / 2, d / 2);
    const m = add(new THREE.PlaneGeometry(w, d), lambert({ map: t }), x, DECK, z);
    m.rotation.x = -Math.PI / 2;
  };
  deckPlane(12, 90, -(HALF_W + 6), POOL / 2);
  deckPlane(12, 90, HALF_W + 6, POOL / 2);
  deckPlane(HALF_W * 2, 20, 0, -10);
  deckPlane(HALF_W * 2, 20, 0, POOL + 10);
  const copeMat = lambert({ color: 0xffffff });
  const yellowMat = lambert({ color: 0xffd23f });
  add(new THREE.BoxGeometry(0.4, 0.08, POOL + 0.8), copeMat, -HALF_W - 0.2, DECK + 0.04, POOL / 2);
  add(new THREE.BoxGeometry(0.4, 0.08, POOL + 0.8), copeMat, HALF_W + 0.2, DECK + 0.04, POOL / 2);
  add(new THREE.BoxGeometry(HALF_W * 2, 0.08, 0.4), yellowMat, 0, DECK + 0.04, -0.2);
  add(new THREE.BoxGeometry(HALF_W * 2, 0.08, 0.4), yellowMat, 0, DECK + 0.04, POOL + 0.2);

  /* water */
  const waterU = {
    uTime: { value: 0 },
    uSw: { value: Array.from({ length: 6 }, () => new THREE.Vector3(0, -99, 0)) },
    uDeep: { value: new THREE.Color(0x0a5fae) },
    uShallow: { value: new THREE.Color(0x27c9e6) },
    uFogColor: { value: FOG },
    uFog: { value: new THREE.Vector2(70, 150) },
  };
  const water = add(
    new THREE.PlaneGeometry(HALF_W * 2, POOL, 64, 200),
    new THREE.ShaderMaterial({ uniforms: waterU, vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, depthWrite: false }),
    0,
    0,
    POOL / 2
  );
  water.rotation.x = -Math.PI / 2;
  water.renderOrder = 2;

  /* lane ropes (instanced floats) */
  const ropeXs = Array.from({ length: LANES + 1 }, (_, k) => -LANES * LANE_W / 2 + k * LANE_W);
  const FLOAT_GAP = 0.22;
  const perRope = Math.floor((POOL - 0.4) / FLOAT_GAP);
  const floatGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.17, 8, 1).rotateX(Math.PI / 2);
  const ropes = new THREE.InstancedMesh(floatGeo, lambert({ color: 0xffffff }), ropeXs.length * perRope);
  const ropeBase = new Float32Array(ropes.count * 3);
  {
    const c = new THREE.Color();
    const m = new THREE.Matrix4();
    let i = 0;
    for (let k = 0; k < ropeXs.length; k++) {
      for (let j = 0; j < perRope; j++, i++) {
        const z = 0.2 + j * FLOAT_GAP + FLOAT_GAP / 2;
        const fromWall = Math.min(z, POOL - z);
        if (fromWall < 5) c.setHex(0xe63946);
        else if (Math.abs(fromWall - 15) < 0.5 || Math.abs(z - 25) < 0.5) c.setHex(0xffd23f);
        else c.setHex(Math.floor(z) % 2 ? 0x1565c0 : 0xf4fbff);
        ropes.setColorAt(i, c);
        ropeBase[i * 3] = ropeXs[k];
        ropeBase[i * 3 + 1] = k;
        ropeBase[i * 3 + 2] = z;
        m.makeTranslation(ropeXs[k], 0.03, z);
        ropes.setMatrixAt(i, m);
      }
    }
  }
  ropes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ropes.frustumCulled = false;
  scene.add(ropes);

  /* backstroke flags */
  const flagMat = lambert({ color: 0xffffff, side: THREE.DoubleSide });
  const flagShape = new THREE.Shape([new THREE.Vector2(-0.17, 0), new THREE.Vector2(0.17, 0), new THREE.Vector2(0, -0.36)]);
  const flagGeo = new THREE.ShapeGeometry(flagShape);
  const flagsPer = Math.floor((HALF_W * 2 + 1) / 0.42);
  const flags = new THREE.InstancedMesh(flagGeo, flagMat, flagsPer * 2);
  const poleMat = lambert({ color: 0xdfe8ee });
  const lineGeo = new THREE.CylinderGeometry(0.012, 0.012, HALF_W * 2 + 3, 4).rotateZ(Math.PI / 2);
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6);
  {
    const palette = [0xffd23f, 0x1565c0, 0xffffff, 0xe63946];
    const c = new THREE.Color();
    const m = new THREE.Matrix4();
    let i = 0;
    for (const z of [5, POOL - 5]) {
      add(lineGeo, poleMat, 0, 2.1, z);
      add(poleGeo, poleMat, -HALF_W - 1.5, DECK + 1.05, z);
      add(poleGeo, poleMat, HALF_W + 1.5, DECK + 1.05, z);
      for (let j = 0; j < flagsPer; j++, i++) {
        m.makeTranslation(-HALF_W - 0.4 + 0.21 + j * 0.42, 2.1, z);
        flags.setMatrixAt(i, m);
        flags.setColorAt(i, c.setHex(palette[j % 4]));
      }
    }
  }
  scene.add(flags);

  /* starting blocks */
  const blockGeo = new THREE.BoxGeometry(0.6, 0.5, 0.6);
  const blockTop = new THREE.BoxGeometry(0.62, 0.06, 0.7);
  const blockSideMat = lambert({ color: 0xf4f8fb });
  const blockTopMat = lambert({ color: 0x1f3d63 });
  for (let l = 0; l < LANES; l++) {
    const front = lambert({ map: blockNumTex(l + 1, "#" + new THREE.Color(0x22e3ff).getHexString()) });
    const mats = [blockSideMat, blockSideMat, blockSideMat, blockSideMat, front, blockSideMat];
    add(blockGeo, mats, laneX(l), DECK + 0.25, -0.35); // +z face (index 4) shows the number
    const top = add(blockTop, blockTopMat, laneX(l), DECK + 0.52, -0.3);
    top.rotation.x = 0.12;
  }

  /* arena: stands, crowd, walls, roof, lights */
  const ROWS = 10;
  const seatMats = [lambert({ color: 0x0f4c8a }), lambert({ color: 0x1677c4 })];
  // seated spectators facing the pool: [x, seatY, z, facing(+1 → +x), scale]
  const fans = [];
  for (const sx of [-1, 1]) {
    for (let r = 0; r < ROWS; r++) {
      const h = 0.9 + r * 0.55;
      const x = sx * (13.2 + r * 1.2) + sx * 0.25;
      add(new THREE.BoxGeometry(1.2, h, 64), seatMats[r % 2], x - sx * 0.25, h / 2, POOL / 2);
      for (let z = -6; z <= POOL + 6; z += 0.72) {
        const n = Math.abs((Math.sin(z * 12.9898 + r * 78.233 + sx * 3.1) * 43758.5453) % 1);
        if (n > 0.7) continue;
        fans.push([x, h, z + (n - 0.35) * 0.2, -sx, 0.9 + n * 0.22]);
      }
    }
  }
  const crowd = buildCrowd(fans);
  crowd.meshes.forEach((m) => scene.add(m));

  const led = new THREE.MeshBasicMaterial({ map: ledTex() });
  for (const sx of [-1, 1]) {
    const b = add(new THREE.PlaneGeometry(64, 0.7), led, sx * 12.5, DECK + 0.35, POOL / 2);
    b.rotation.y = -sx * Math.PI / 2;
  }
  const hallMat = lambert({ color: 0x0c2b52 });
  for (const sx of [-1, 1]) {
    const w = add(new THREE.PlaneGeometry(90, 26), hallMat, sx * 26.5, 13, POOL / 2);
    w.rotation.y = -sx * Math.PI / 2;
    // hanging banners
    const banner = new THREE.PlaneGeometry(2.2, 7);
    for (let i = 0; i < 6; i++) {
      const b = add(banner, new THREE.MeshBasicMaterial({ color: [0x22e3ff, 0xffd23f, 0x1677c4][i % 3] }), sx * 26.4, 15, -4 + i * 11.6);
      b.rotation.y = -sx * Math.PI / 2;
    }
  }
  for (const [z, ry] of [[-18, 0], [POOL + 18, Math.PI]]) {
    const w = add(new THREE.PlaneGeometry(56, 26), hallMat, 0, 13, z);
    w.rotation.y = ry;
    const board = add(new THREE.PlaneGeometry(16, 6), new THREE.MeshBasicMaterial({ map: boardTex("SWIMMING CHAMPIONS", "DIVE • SWIM • WIN") }), 0, 10, z + (ry ? -0.1 : 0.1));
    board.rotation.y = ry;
  }
  const roof = add(new THREE.PlaneGeometry(56, 90), lambert({ color: 0x081a33 }), 0, 24, POOL / 2);
  roof.rotation.x = Math.PI / 2;
  const lampGeo = new THREE.BoxGeometry(2.6, 0.25, 1.1);
  const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xf5fbff }), 4 * 7);
  {
    const m = new THREE.Matrix4();
    let i = 0;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 7; b++, i++) {
      m.makeTranslation(-15 + a * 10, 23.6, -6 + b * 10.3);
      lamps.setMatrixAt(i, m);
    }
  }
  scene.add(lamps);

  /* player marker */
  const marker = add(new THREE.ConeGeometry(0.22, 0.45, 12).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0x22e3ff }), laneX(PLAYER_LANE), 2.6, -0.3);

  /* swimmers */
  const G = buildSwimmerGeo();
  const skinCache = new Map();
  const skinMats = (hex) => {
    // a little specular reads as wet skin; vertex colours carry lips/brows
    if (!skinCache.has(hex)) skinCache.set(hex, new THREE.MeshPhongMaterial({ color: hex, vertexColors: true, shininess: 38, specular: 0x2c2c2c }));
    return skinCache.get(hex);
  };
  const darkMat = new THREE.MeshPhongMaterial({ color: 0x0b1626, specular: 0x9fe8ff, shininess: 140 });
  let views = [];

  /* splashes */
  const NP = 520;
  const pPos = new Float32Array(NP * 3).fill(-50);
  const pCol = new Float32Array(NP * 3);
  const pVel = new Float32Array(NP * 3);
  const pLife = new Float32Array(NP);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
  const dot = dotTex();
  const particles = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({ size: 0.16, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  particles.frustumCulled = false;
  particles.renderOrder = 3;
  scene.add(particles);
  let pNext = 0;
  const splash = (x, y, z, n, power = 1, dirZ = 0) => {
    for (let k = 0; k < n; k++) {
      const i = pNext;
      pNext = (pNext + 1) % NP;
      const a = Math.random() * TAU;
      const sp = (0.4 + Math.random()) * power;
      pPos[i * 3] = x + Math.cos(a) * 0.12;
      pPos[i * 3 + 1] = y;
      pPos[i * 3 + 2] = z + Math.sin(a) * 0.12;
      pVel[i * 3] = Math.cos(a) * sp * 0.8;
      pVel[i * 3 + 1] = (1.6 + Math.random() * 1.8) * power;
      pVel[i * 3 + 2] = Math.sin(a) * sp * 0.8 + dirZ;
      pLife[i] = 1;
    }
  };
  const stepParticles = (dt) => {
    for (let i = 0; i < NP; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt * 1.4;
      pVel[i * 3 + 1] -= 9 * dt;
      pPos[i * 3] += pVel[i * 3] * dt;
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      if (pPos[i * 3 + 1] < -0.05 || pLife[i] <= 0) {
        pLife[i] = 0;
        pPos[i * 3 + 1] = -50;
      }
      const v = Math.max(0, pLife[i]) * 0.85;
      pCol[i * 3] = v * 0.9;
      pCol[i * 3 + 1] = v;
      pCol[i * 3 + 2] = v;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  };

  /* ------------------------------------------------------------ race binding */
  let boundRace = null;
  function bind(race) {
    for (const v of views) {
      scene.remove(v.root);
      v.mats.forEach((m) => m.dispose());
    }
    views = race.swimmers.map((s) => {
      const v = buildSwimmer(G, s, skinMats, darkMat);
      scene.add(v.root);
      return v;
    });
    boundRace = race;
    for (const v of views) pose(v, race, 1, 0); // snap
    cam.t = 0;
  }

  /* ------------------------------------------------------------ posing */
  const tp = {};
  function pose(v, race, dt, t) {
    const s = v.s;
    const P = v.p;
    const snap = dt >= 1;
    const R = snap ? 1e6 : 14;
    if (s.dir !== v.lastDir) {
      v.off = -v.off;
      v.lastDir = s.dir;
      // Flip turn: the engine reverses mid-somersault. Re-express the same
      // orientation with the new heading (Ry(π)·Rx(π−p)·Rz(r−π) ≡ Rx(p)·Rz(r))
      // so nothing visibly jumps.
      if (s.turnKind === "flip") {
        P.yaw += Math.PI;
        P.pitch = Math.PI - P.pitch;
        P.roll -= Math.PI;
      }
    }
    const yawBase = s.dir > 0 ? 0 : Math.PI;
    let offTarget = -1.3;
    let offFree = false;
    let wake = 0;
    Object.assign(tp, { y: -0.1, pitch: 0, roll: 0, yaw: yawBase, aL: 0, aR: 0, oL: 0, oR: 0, eL: 0, eR: 0, hL: 0, hR: 0, kL: 0, kR: 0, head: 0 });

    if (race.phase === "intro" || race.phase === "countdown" || s.phase === "block") {
      const c = race.phase === "intro" ? 0 : s.crouch;
      const p = lerp(-Math.PI / 2 + 0.05, 0.4, c);
      tp.pitch = p;
      tp.y = DECK + 0.58 + 0.8 - c * 0.22;
      tp.aL = tp.aR = Math.PI / 2 - p;
      tp.oL = 0.12 * (1 - c);
      tp.oR = -0.12 * (1 - c);
      tp.hL = tp.hR = -(Math.PI / 2 + p) * c;
      tp.kL = tp.kR = 0.55 * c;
      v.off = 0;
      offFree = true;
      // idle sway on the block
      if (race.phase === "intro") {
        tp.roll = Math.sin(t * 1.3 + s.lane) * 0.04;
        const sw = Math.sin(t * 2.4 + s.lane * 1.7) * 0.22;
        tp.aL += sw;
        tp.aR -= sw;
        tp.head = Math.sin(t * 0.9 + s.lane) * 0.25;
      }
      v.zFix = -0.3 + 0.12 * c;
    } else if (s.phase === "dive") {
      const u = Math.min(1, s.diveT / 0.55);
      tp.pitch = lerp(-0.3, 0.6, u);
      tp.y = lerp(DECK + 1.25, -0.25, u) + 1.1 * u * (1 - u);
      tp.aL = tp.aR = -0.05;
      tp.oL = tp.oR = 0;
      v.off = -1.3 * u;
      offFree = true;
      v.zFix = -0.3 * (1 - u);
    } else if (s.phase === "turn" && s.turnKind === "flip" && !s.flipped) {
      const u = Math.min(1, s.turnT / TUNE.flipTime);
      tp.pitch = Math.PI * ease(u);
      tp.y = -0.12 - 0.45 * Math.sin(Math.PI * u);
      tp.aL = tp.aR = Math.PI * Math.sin(Math.PI * u * 0.5);
      tp.hL = tp.hR = -1.3 * Math.sin(Math.PI * u);
      tp.kL = tp.kR = 1.7 * Math.sin(Math.PI * u);
      v.off = lerp(-1.3, -0.9, u);
      offFree = true;
      v.zFix = 0;
    } else if (s.phase === "turn" && s.turnKind === "flip") {
      const u = Math.min(1, (s.turnT - TUNE.flipTime) / TUNE.glideTime);
      tp.pitch = 0;
      tp.roll = -Math.PI * (1 - ease(u)); // half twist back onto the front
      tp.y = -0.55 + 0.35 * u;
      tp.aL = tp.aR = 0;
      tp.hL = 0.25 * Math.sin(s.kick);
      tp.hR = -tp.hL;
      v.zFix = 0;
    } else if (s.phase === "turn") {
      // open turn: grab the wall, spin round, push off
      const u = Math.min(1, s.turnT / TUNE.openTurnTime);
      tp.pitch = -1.1 * Math.sin(Math.PI * u);
      tp.y = -0.25 - 0.15 * u;
      tp.yaw = yawBase + Math.PI * ease(u);
      tp.aL = 0.4;
      tp.aR = 1.4;
      tp.kL = tp.kR = 1.0 * Math.sin(Math.PI * u);
      offTarget = -0.6;
      v.zFix = 0;
    } else if (s.phase === "finish") {
      const p = -1.2;
      tp.pitch = p;
      tp.y = -0.42 + Math.sin(t * 2 + s.lane) * 0.03;
      tp.yaw = yawBase + Math.PI;
      const celebrate = s.isPlayer ? s.place <= 3 : s.place === 1;
      if (celebrate) {
        const w = Math.sin(t * 7 + s.lane) * 0.25;
        tp.aL = -Math.PI / 2 - p + 0.25 + w;
        tp.aR = -Math.PI / 2 - p + 0.25 - w;
        tp.oL = 0.35;
        tp.oR = -0.35;
      } else {
        tp.aL = tp.aR = Math.PI / 2 - p + 0.5;
        tp.oL = 0.25;
        tp.oR = -0.25;
      }
      tp.hL = 0.3 * Math.sin(t * 3);
      tp.hR = -tp.hL;
      tp.kL = tp.kR = 0.4;
      offTarget = s.isPlayer ? -0.7 : -0.6;
      v.zFix = 0;
    } else {
      // freestyle
      const under = s.underwater;
      const cyc = s.stroke;
      const aL = TAU * cyc;
      const aR = aL + Math.PI;
      const streamline = under > 0.35;
      tp.y = -0.1 - 0.5 * under;
      tp.pitch = 0.1 * under;
      tp.roll = streamline ? 0 : 0.45 * Math.sin(aL);
      const arm = (a) => {
        const m = ((a % TAU) + TAU) % TAU;
        return m < Math.PI ? 0.55 * Math.sin(m) : 1.2 * Math.sin(m - Math.PI);
      };
      const out = (a) => {
        const m = ((a % TAU) + TAU) % TAU;
        return m > Math.PI ? 0.35 * Math.sin(m - Math.PI) : 0;
      };
      tp.aL = streamline ? 0 : aL;
      tp.aR = streamline ? 0 : aR;
      tp.eL = streamline ? 0 : arm(aL);
      tp.eR = streamline ? 0 : arm(aR);
      tp.oL = streamline ? 0 : out(aL);
      tp.oR = streamline ? 0 : -out(aR);
      const breathe = Math.floor(cyc) % 2 === 0 && Math.sin(aL) < 0 ? -Math.sin(aL) * 1.0 : 0;
      tp.head = streamline ? 0 : -breathe;
      tp.hL = 0.3 * Math.sin(s.kick);
      tp.hR = -tp.hL;
      tp.kL = 0.22 + 0.22 * Math.sin(s.kick + 1.2);
      tp.kR = 0.22 - 0.22 * Math.sin(s.kick + 1.2);
      wake = Math.min(1, s.v / 4) * (1 - under);
      v.zFix = 0;
      // hand entry splashes + kick spray
      const k = Math.floor(cyc * 2);
      if (!snap && k !== v.lastK && !streamline) {
        const side = k % 2 ? -1 : 1;
        const hx = laneX(s.lane) + side * 0.25 * (s.dir > 0 ? 1 : -1);
        splash(hx, 0.02, s.pos - s.dir * 0.05, s.isPlayer ? 7 : 4, 0.7);
        if (s.isPlayer) events.push("handEntry");
      }
      v.lastK = k;
      if (!snap && s.v > 1.2 && !streamline) {
        v.sprayAcc += dt * 16 * Math.min(1, s.v / 3.5);
        while (v.sprayAcc > 1) {
          v.sprayAcc -= 1;
          splash(laneX(s.lane) + (Math.random() - 0.5) * 0.2, 0.02, s.pos + s.dir * (v.off - 1.0), 1, 0.45, -s.dir * 0.4);
        }
      }
    }
    if (!offFree) {
      const maxStep = (snap ? 99 : 1.4) * Math.max(dt, 0);
      v.off += Math.max(-maxStep, Math.min(maxStep, offTarget - v.off));
    }
    for (const key in tp) {
      if (key === "yaw" || key.length === 2 && key[0] === "a") P[key] = dampAngle(P[key], tp[key], R, dt);
      else P[key] = damp(P[key], tp[key], key === "y" ? 10 : R, dt);
    }
    v.root.position.set(laneX(s.lane), P.y, s.pos + s.dir * v.off + (v.zFix || 0));
    v.root.rotation.y = P.yaw;
    v.body.rotation.set(P.pitch, 0, P.roll);
    v.head.rotation.z = P.head;
    v.armL.pivot.rotation.x = P.aL;
    v.armR.pivot.rotation.x = P.aR;
    v.armL.out.rotation.y = P.oL;
    v.armR.out.rotation.y = P.oR;
    v.armL.elbow.rotation.x = P.eL;
    v.armR.elbow.rotation.x = P.eR;
    v.legL.hip.rotation.x = P.hL;
    v.legR.hip.rotation.x = P.hR;
    v.legL.knee.rotation.x = P.kL;
    v.legR.knee.rotation.x = P.kR;
    const w = waterU.uSw.value[s.lane];
    w.set(laneX(s.lane), v.root.position.z, wake);
  }

  /* ------------------------------------------------------------ camera */
  const cam = { t: 0, pos: new THREE.Vector3(22, 16, 62), look: new THREE.Vector3(0, 0, 25), mode: "menu", finishT: 0 };
  const tmpP = new THREE.Vector3();
  // intro fly-over: the whole pool, then low past the blocks (faces), then
  // up and over to the start-camera spot behind lane 3
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const introPos = new THREE.CatmullRomCurve3([V(20, 16, 58), V(11, 5, 16), V(7.5, 1.9, 4.2), V(-1, 1.75, 3.6), V(-7.5, 2.2, 4.2), V(-4, 4.4, -1.5), V(4, 3.2, -6.5)]);
  const introLook = new THREE.CatmullRomCurve3([V(0, 0, 25), V(2, 0.8, 4), V(4.5, 1.5, -0.3), V(-1, 1.45, -0.3), V(-6, 1.5, -0.3), V(-2, 1.1, 3), V(laneX(PLAYER_LANE) * 0.5, 0.9, 8)]);
  const tmpL = new THREE.Vector3();
  function updateCamera(race, dt, mode, time) {
    if (mode !== cam.mode) {
      cam.mode = mode;
      cam.t = 0;
    }
    cam.t += dt;
    let rate = 3;
    if (mode === "menu" || !race) {
      const a = time * 0.06 + 0.6;
      tmpP.set(Math.sin(a) * 30, 15 + Math.sin(time * 0.1) * 2, POOL / 2 + Math.cos(a) * 40);
      tmpL.set(0, 0, POOL / 2);
      rate = 1.5;
    } else if (race.phase === "intro") {
      const u = ease(Math.min(1, race.phaseT / TUNE.introTime));
      introPos.getPoint(u, tmpP);
      introLook.getPoint(u, tmpL);
      rate = 6;
    } else if (race.phase === "countdown") {
      const u = ease(Math.min(1, race.phaseT / 3));
      tmpP.set(lerp(4, 2.2, u), lerp(3.2, 2.9, u), lerp(-6.5, -5.2, u));
      tmpL.set(laneX(PLAYER_LANE) * 0.6, 0.6, 8);
    } else if (mode === "finish" || mode === "results") {
      const v = views[PLAYER_LANE];
      const pz = v ? v.root.position.z : POOL;
      const inward = pz > POOL / 2 ? -1 : 1;
      if (mode === "finish") {
        const a = -0.9 + Math.min(1, cam.t / 3.2) * 1.6;
        // stays inside the 5 m backstroke flags and below their line
        tmpP.set(laneX(PLAYER_LANE) + Math.sin(a) * 4.2, 1.15 + cam.t * 0.06, pz + inward * (0.4 + Math.cos(a) * 3.8));
        tmpL.set(laneX(PLAYER_LANE), 0.35, pz);
        rate = 2.5;
      } else {
        const a = time * 0.05;
        tmpP.set(Math.sin(a) * 8, 9, pz + inward * 16);
        tmpL.set(0, 0, pz + inward * 2);
        rate = 1.2;
      }
    } else {
      const p = race.player;
      const v = views[PLAYER_LANE];
      const z = v ? v.root.position.z : p.pos;
      const d = p.dir;
      tmpP.set(laneX(PLAYER_LANE) * 0.55 + 1.2, 4.0, z - d * 7.2);
      tmpL.set(laneX(PLAYER_LANE) * 0.7, 0, z + d * 7);
      // keep inside the hall at both ends
      tmpP.z = Math.max(-9, Math.min(POOL + 9, tmpP.z));
      rate = 2.6;
    }
    if (cam.t < dt * 1.5 && mode === "menu" && !race) rate = 1e6;
    cam.pos.x = damp(cam.pos.x, tmpP.x, rate, dt);
    cam.pos.y = damp(cam.pos.y, tmpP.y, rate, dt);
    cam.pos.z = damp(cam.pos.z, tmpP.z, rate, dt);
    cam.look.x = damp(cam.look.x, tmpL.x, rate, dt);
    cam.look.y = damp(cam.look.y, tmpL.y, rate, dt);
    cam.look.z = damp(cam.look.z, tmpL.z, rate, dt);
    camera.position.copy(cam.pos);
    camera.position.y = Math.max(camera.position.y, 0.9);
    camera.lookAt(cam.look);
  }

  /* ------------------------------------------------------------ frame */
  let time = 0;
  let excite = 0;
  const events = [];
  function render(race, dt, mode = "race") {
    time += dt;
    events.length = 0;
    waterU.uTime.value = time;
    if (race && race !== boundRace) bind(race);
    if (race) for (const v of views) pose(v, race, dt, time);
    else for (const w of waterU.uSw.value) w.set(0, -99, 0);

    // marker over the player until the gun
    marker.visible = !!race && (race.phase === "intro" || race.phase === "countdown");
    if (marker.visible) marker.position.y = DECK + 2.95 + Math.sin(time * 4) * 0.12;

    // lane ropes bob (cheap translation-only matrices)
    const arr = ropes.instanceMatrix.array;
    for (let i = 0; i < ropes.count; i++) {
      const z = ropeBase[i * 3 + 2];
      arr[i * 16 + 13] = 0.03 + 0.022 * Math.sin(z * 0.9 + time * 2.1 + ropeBase[i * 3 + 1] * 1.7);
    }
    ropes.instanceMatrix.needsUpdate = true;

    // the crowd bounces and throws its arms up while racing / at the finish
    const target = mode === "finish" || mode === "results" ? 1 : race && race.phase === "race" ? 0.3 : 0;
    excite = damp(excite, target, 2, dt);
    crowd.animate(time, excite);

    stepParticles(dt);
    updateCamera(race, dt, race ? mode : "menu", time);
    renderer.render(scene, camera);
    return events;
  }

  function resize(w, h) {
    if (w < 2 || h < 2) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 72 : w / h < 1.4 ? 62 : 55;
    camera.updateProjectionMatrix();
  }

  /** Big splash at a swimmer's current spot (dive entry, turns, finish). */
  function burst(lane, n = 26, power = 1.2) {
    const v = views[lane];
    if (!v) return;
    const s = v.s;
    splash(laneX(lane), 0.05, s.pos, n, power);
  }

  function dispose() {
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose();
        m.dispose();
      }
    });
    Object.values(G).forEach((g) => g.dispose());
    deckTex.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
  }

  return { renderer, scene, camera, render, resize, burst, dispose, views: () => views };
}
