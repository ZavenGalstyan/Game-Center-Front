/**
 * Web Hero — one procedural humanoid rig shared by the hero, every enemy
 * archetype, civilians and the bosses (they differ by physique, outfit and
 * materials, never by skeleton).
 *
 * The body is SCULPTED, not assembled from capsules: every segment is a
 * loft — smooth superellipse cross-sections along the bone — shaped like
 * real anatomy (V-taper torso with pecs, lats and glutes, a sloping
 * trapezius, biceps / triceps, forearm taper, quads, knee caps, calves),
 * with articulated fingers (they clench into fists in combat), shaped shoes
 * and a real head: jaw, cheekbones, brow, eyes with irises, nose, ears,
 * mouth, hair and an optional beard. Clothing materials get a procedural
 * fabric-weave normal map; skin gets a soft sheen.
 *
 * Skeleton (feet at the origin, facing +Z, metres):
 *
 *   root ─ body (at hip height: bob / lean / flips / rolls rotate about the hips)
 *          ├─ pelvis
 *          ├─ hipL / hipR ─ thigh ─ kneeL/R ─ shin ─ ankleL/R ─ shoe
 *          └─ spine ─ abdomen ─ chest ─ torso
 *                     ├─ neck ─ head (+ face, hair, beard)
 *                     └─ shL / shR ─ upper arm ─ elL/R ─ forearm ─ wristL/R ─ hand + fingers
 *
 * A pose is a flat object of joint angles (see POSE_KEYS). blendPose()
 * damps the current pose toward a target every frame (frame-rate
 * independent), applyPose() writes it to the joints. Angle conventions:
 *   + hip/shoulder X swings the limb BACK, − swings it forward
 *   + knee bends the shin back, − elbow bends the forearm forward
 *   + lShZ / − rShZ raise the arms out to the sides
 *   lGrip / rGrip: 0 relaxed … 1 tight fist (−0.3 open palm)
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const POSE_KEYS = [
  "bodyY", "bodyX", "bodyZ", "bodyRX", "bodyRY", "bodyRZ",
  "spineRX", "spineRY", "spineRZ", "chestRX", "chestRY", "headRX", "headRY",
  "lShX", "lShY", "lShZ", "lEl", "lWr", "rShX", "rShY", "rShZ", "rEl", "rWr",
  "lHipX", "lHipZ", "lKnee", "lAnk", "rHipX", "rHipZ", "rKnee", "rAnk",
  "lGrip", "rGrip",
];
export const zeroPose = () => Object.fromEntries(POSE_KEYS.map((k) => [k, 0]));

const geoCache = new Map();
const cached = (k, make) => {
  if (!geoCache.has(k)) geoCache.set(k, make());
  return geoCache.get(k);
};
function capsule(r, len, rs = 12) {
  return cached(`c${r.toFixed(4)}:${len.toFixed(4)}:${rs}`, () => new THREE.CapsuleGeometry(r, len, 4, rs));
}
function sphere(r, ws = 18, hs = 14) {
  return cached(`s${r.toFixed(4)}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
}
function box(w, h, d) {
  return cached(`b${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}`, () => new THREE.BoxGeometry(w, h, d));
}
export { capsule, sphere, box };

/**
 * Loft: a smooth closed surface through cross-section rings stacked along
 * +Y (rings must be ordered by increasing y). ring = { y, rx, rz, ox?, oz?,
 * p? } — superellipse power p (2 = ellipse), +Z is the front. Midpoints are
 * Catmull-Rom interpolated so the silhouette stays smooth.
 */
export function loft(rings, segs = 22, { capTop = true, capBottom = true } = {}) {
  const key = `L${segs}:${capTop ? 1 : 0}${capBottom ? 1 : 0}:` + rings.map((r) => [r.y, r.rx, r.rz, r.ox || 0, r.oz || 0, r.p || 2].map((v) => v.toFixed(4)).join(",")).join("|");
  return cached(key, () => {
    const F = ["y", "rx", "rz", "ox", "oz", "p"];
    const norm = rings.map((r) => ({ y: r.y, rx: r.rx, rz: r.rz, ox: r.ox || 0, oz: r.oz || 0, p: r.p || 2 }));
    const R = [];
    for (let i = 0; i < norm.length; i++) {
      R.push(norm[i]);
      if (i === norm.length - 1) continue;
      const a = norm[Math.max(0, i - 1)];
      const b = norm[i];
      const c = norm[i + 1];
      const d = norm[Math.min(norm.length - 1, i + 2)];
      const mid = {};
      for (const k of F) mid[k] = k === "y" ? 0.5 * (b.y + c.y) : 0.5 * (b[k] + c[k]) + 0.0625 * (b[k] - a[k] + c[k] - d[k]);
      R.push(mid);
    }
    const pos = [];
    const uv = [];
    const idx = [];
    const vs = [0];
    let len = 0;
    for (let i = 1; i < R.length; i++) vs.push((len += Math.abs(R[i].y - R[i - 1].y) + 1e-6));
    for (let i = 0; i < R.length; i++) {
      const r = R[i];
      for (let k = 0; k <= segs; k++) {
        const t = (k / segs) * Math.PI * 2;
        const c = Math.cos(t);
        const s = Math.sin(t);
        const ex = 2 / r.p;
        pos.push(r.ox + r.rx * Math.sign(c) * Math.pow(Math.abs(c), ex), r.y, r.oz + r.rz * Math.sign(s) * Math.pow(Math.abs(s), ex));
        uv.push(k / segs, vs[i] / (len || 1));
      }
    }
    const row = segs + 1;
    for (let i = 0; i < R.length - 1; i++) {
      for (let k = 0; k < segs; k++) {
        const a = i * row + k;
        const b = a + row;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const cap = (i, up) => {
      const r = R[i];
      const c = pos.length / 3;
      pos.push(r.ox, r.y, r.oz);
      uv.push(0.5, up ? 1 : 0);
      for (let k = 0; k < segs; k++) {
        const a = i * row + k;
        if (up) idx.push(c, a + 1, a);
        else idx.push(c, a, a + 1);
      }
    };
    if (capTop) cap(R.length - 1, true);
    if (capBottom) cap(0, false);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}
/** scale a ring list: y by sy, radii by kx / kz, offsets follow */
const scl = (rings, sy, kx, kz = kx, ko = 1) => rings.map((r) => ({ y: r.y * sy, rx: r.rx * kx, rz: r.rz * kz, ox: (r.ox || 0) * ko, oz: (r.oz || 0) * ko, p: r.p || 2 }));

/* ------------------------------------------------------------------ procedural cloth / skin */
const texCache = new Map();
/** fabric weave normal map (tiling) */
export function fabricNormal() {
  if (texCache.has("fabric")) return texCache.get("fabric");
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const img = g.createImageData(128, 128);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const wx = Math.sin((x / 128) * Math.PI * 32) * (Math.floor(y / 4) % 2 ? 1 : -1);
      const wy = Math.sin((y / 128) * Math.PI * 32) * (Math.floor(x / 4) % 2 ? 1 : -1);
      const n = (rnd() - 0.5) * 0.3;
      const i = (y * 128 + x) * 4;
      img.data[i] = 128 + (wx * 0.6 + n) * 60;
      img.data[i + 1] = 128 + (wy * 0.6 + n) * 60;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  texCache.set("fabric", t);
  return t;
}
/** denim twill colour map */
export function denimMap(hex = "#2f3d5c") {
  const k = `denim:${hex}`;
  if (texCache.has(k)) return texCache.get(k);
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = hex;
  g.fillRect(0, 0, 128, 128);
  for (let i = -128; i < 256; i += 3) {
    g.strokeStyle = `rgba(255,255,255,${0.04 + (i % 7) * 0.008})`;
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 128, 128);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  texCache.set(k, t);
  return t;
}
/** realistic clothing material (fabric weave normal map) */
export function clothMat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, normalMap: fabricNormal(), normalScale: new THREE.Vector2(0.35, 0.35), ...o });
}
/** skin: soft sheen with a warm edge */
export function skinMat(color) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, metalness: 0, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color("#ff9a8a"), clearcoat: 0.06, clearcoatRoughness: 0.6 });
}
export function disposeHumanTextures() {
  for (const t of texCache.values()) t.dispose();
  texCache.clear();
}

/* ------------------------------------------------------------------ anatomy (1.8 m reference body) */
// torso pieces: pelvis (body-local), abdomen (spine-local), chest (chest-local)
const PELVIS = [
  { y: -0.13, rx: 0.07, rz: 0.06 },
  { y: -0.08, rx: 0.135, rz: 0.098, oz: -0.008, p: 2.2 },
  { y: -0.02, rx: 0.158, rz: 0.108, oz: -0.012, p: 2.3 },
  { y: 0.05, rx: 0.155, rz: 0.1, oz: -0.004, p: 2.3 },
  { y: 0.13, rx: 0.142, rz: 0.094, oz: 0.002, p: 2.3 },
];
const ABDOMEN = [
  { y: -0.06, rx: 0.145, rz: 0.095, oz: 0.002, p: 2.3 },
  { y: 0.04, rx: 0.138, rz: 0.092, oz: 0.006, p: 2.4 },
  { y: 0.13, rx: 0.147, rz: 0.095, oz: 0.008, p: 2.4 },
  { y: 0.21, rx: 0.16, rz: 0.1, oz: 0.008, p: 2.4 },
  { y: 0.27, rx: 0.152, rz: 0.094, oz: 0.008, p: 2.4 },
];
const CHEST = [
  { y: -0.06, rx: 0.13, rz: 0.08, oz: 0.004, p: 2.4 },
  { y: 0.04, rx: 0.17, rz: 0.106, oz: 0.012, p: 2.5 },
  { y: 0.12, rx: 0.184, rz: 0.112, oz: 0.016, p: 2.5 },
  { y: 0.19, rx: 0.19, rz: 0.106, oz: 0.008, p: 2.5 },
  { y: 0.235, rx: 0.18, rz: 0.094, oz: -0.004, p: 2.4 },
  { y: 0.28, rx: 0.125, rz: 0.075, oz: -0.012, p: 2.2 },
  { y: 0.33, rx: 0.062, rz: 0.058, oz: -0.004 },
];
const NECK = [
  { y: -0.01, rx: 0.07, rz: 0.064 },
  { y: 0.04, rx: 0.06, rz: 0.058, oz: 0.004 },
  { y: 0.09, rx: 0.058, rz: 0.058, oz: 0.01 },
];
// head / hair / beard in units of the head radius
const HEAD = [
  { y: 0.0, rx: 0.3, rz: 0.28, oz: 0.42 },
  { y: 0.12, rx: 0.5, rz: 0.52, oz: 0.25 },
  { y: 0.3, rx: 0.66, rz: 0.72, oz: 0.12 },
  { y: 0.55, rx: 0.76, rz: 0.86, oz: 0.05 },
  { y: 0.85, rx: 0.84, rz: 0.94, oz: 0.0 },
  { y: 1.15, rx: 0.88, rz: 0.99, oz: -0.03 },
  { y: 1.45, rx: 0.82, rz: 0.94, oz: -0.06 },
  { y: 1.7, rx: 0.6, rz: 0.72, oz: -0.07 },
  { y: 1.86, rx: 0.22, rz: 0.28, oz: -0.06 },
];
const HAIR = [
  { y: 0.95, rx: 0.9, rz: 1.0, oz: -0.06 },
  { y: 1.2, rx: 0.93, rz: 1.04, oz: -0.05 },
  { y: 1.48, rx: 0.87, rz: 0.99, oz: -0.07 },
  { y: 1.74, rx: 0.64, rz: 0.77, oz: -0.08 },
  { y: 1.92, rx: 0.2, rz: 0.26, oz: -0.07 },
];
// jaw-line beard: chin and jaw only, the mouth stays visible (moustache added separately)
const BEARD = [
  { y: -0.05, rx: 0.31, rz: 0.29, oz: 0.45 },
  { y: 0.1, rx: 0.52, rz: 0.54, oz: 0.27 },
  { y: 0.26, rx: 0.68, rz: 0.72, oz: 0.14 },
  { y: 0.38, rx: 0.76, rz: 0.82, oz: 0.07 },
];
// limbs hang down from the joint: y in bone lengths (−1 = next joint), radii in metres (1.8 m body)
const THIGH = [
  { y: -1.03, rx: 0.055, rz: 0.057 },
  { y: -0.9, rx: 0.06, rz: 0.062, oz: 0.004 },
  { y: -0.65, rx: 0.078, rz: 0.08, oz: 0.008 },
  { y: -0.35, rx: 0.092, rz: 0.096, oz: 0.012 },
  { y: -0.08, rx: 0.1, rz: 0.104, oz: 0.008 },
  { y: 0.04, rx: 0.088, rz: 0.088 },
];
const SHIN = [
  { y: -1.02, rx: 0.036, rz: 0.04 },
  { y: -0.92, rx: 0.036, rz: 0.04 },
  { y: -0.62, rx: 0.044, rz: 0.048, oz: -0.004 },
  { y: -0.32, rx: 0.058, rz: 0.069, oz: -0.014 },
  { y: -0.14, rx: 0.06, rz: 0.07, oz: -0.012 },
  { y: 0.02, rx: 0.056, rz: 0.058 },
];
// upper arm with the deltoid sculpted in (rounded dome over the shoulder joint)
const UPPER = [
  { y: -1.03, rx: 0.042, rz: 0.044 },
  { y: -0.75, rx: 0.048, rz: 0.052, oz: -0.004 },
  { y: -0.45, rx: 0.056, rz: 0.062, oz: 0.008 },
  { y: -0.2, rx: 0.064, rz: 0.068, oz: 0.004 },
  { y: 0.0, rx: 0.066, rz: 0.07 },
  { y: 0.05, rx: 0.063, rz: 0.067, ox: -0.004 },
  { y: 0.1, rx: 0.052, rz: 0.057, ox: -0.01 },
  { y: 0.14, rx: 0.032, rz: 0.036, ox: -0.016 },
  { y: 0.16, rx: 0.01, rz: 0.012, ox: -0.018 },
];
const FORE = [
  { y: -1.0, rx: 0.031, rz: 0.025 },
  { y: -0.85, rx: 0.033, rz: 0.027 },
  { y: -0.5, rx: 0.042, rz: 0.037 },
  { y: -0.18, rx: 0.051, rz: 0.047, oz: 0.003 },
  { y: 0.03, rx: 0.043, rz: 0.045 },
];
// shoe, heel → toe (built along y, rotated onto +Z)
const SHOE = [
  { y: -0.075, rx: 0.042, rz: 0.04, p: 2.6 },
  { y: -0.04, rx: 0.05, rz: 0.048, p: 2.8 },
  { y: 0.04, rx: 0.052, rz: 0.044, p: 2.8 },
  { y: 0.12, rx: 0.055, rz: 0.035, p: 2.6 },
  { y: 0.17, rx: 0.04, rz: 0.026, p: 2.2 },
  { y: 0.19, rx: 0.02, rz: 0.015 },
];

function mesh(geo, mat, shadows) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = !!shadows;
  m.receiveShadow = false;
  return m;
}

/**
 * opts: { height, bulk, shoulder, hip, limb, headR, shadows,
 *   mats: { skin, top, bottom, shoes, sole?, hands, head, neck?, arms?, fore?, hair? },
 *   face (eyes / brows / nose / ears / mouth), eyeColor, hair: "short"|"buzz"|"long"|"bald",
 *   beard, fit: { top, legs } (clothing looseness, 1 = skin-tight) }
 * returns rig { root, body, joints{}, parts{}, fingers, size }
 */
export function buildHumanoid(opts = {}) {
  const H = opts.height || 1.8;
  const s = H / 1.8;
  const bulk = opts.bulk || 1;
  const limb = opts.limb || 1;
  const M = opts.mats;
  const sh = !!opts.shadows;
  const topFit = (opts.fit && opts.fit.top) || 1;
  const legFit = (opts.fit && opts.fit.legs) || 1;
  const thighL = 0.45 * s;
  const shinL = 0.44 * s;
  const hipY = thighL + shinL + 0.07 * s;
  const shoulderK = (opts.shoulder || 0.205) / 0.205;
  const hipK = (opts.hip || 0.095) / 0.095;
  const shoulder = (opts.shoulder || 0.205) * s * bulk;
  const hipW = (opts.hip || 0.095) * s * bulk;
  const upperL = 0.29 * s;
  const foreL = 0.27 * s;
  const hr = (opts.headR || 0.112) * s;
  const legR = s * bulk * limb * legFit;
  const armR = s * bulk * limb * topFit;

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = hipY;
  root.add(body);
  const J = { body };
  const P = {};

  // pelvis / hips / glutes
  P.pelvis = mesh(loft(scl(PELVIS, s, s * bulk * hipK * Math.max(1, legFit), s * bulk * Math.max(1, legFit), s)), M.bottom, sh);
  body.add(P.pelvis);

  // legs
  for (const side of ["L", "R"]) {
    const sx = side === "L" ? 1 : -1;
    const hip = new THREE.Group();
    hip.position.set(sx * hipW, -0.02 * s, 0);
    body.add(hip);
    const thigh = mesh(loft(scl(THIGH, thighL, legR, legR, s)), M.bottom, sh);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -thighL;
    hip.add(knee);
    const kneeCap = mesh(sphere(0.05 * legR, 14, 10), M.bottom, sh);
    kneeCap.position.z = 0.012 * s;
    knee.add(kneeCap);
    const shin = mesh(loft(scl(SHIN, shinL, legR, legR, s)), M.bottom, sh);
    knee.add(shin);
    const ankle = new THREE.Group();
    ankle.position.y = -shinL;
    knee.add(ankle);
    const shoeGeo = cached(`shoe:${s.toFixed(4)}:${bulk.toFixed(4)}`, () => {
      const g = loft(scl(SHOE, s * 1.05, s * bulk, s), 18).clone();
      g.rotateX(Math.PI / 2);
      g.translate(0, -0.045 * s, 0);
      return g;
    });
    const foot = mesh(shoeGeo, M.shoes, sh);
    ankle.add(foot);
    if (M.sole) {
      const sole = mesh(box(0.1 * s * bulk, 0.018 * s, 0.27 * s), M.sole, sh);
      sole.position.set(0, -0.078 * s, 0.055 * s);
      ankle.add(sole);
    }
    J[`hip${side}`] = hip;
    J[`knee${side}`] = knee;
    J[`ankle${side}`] = ankle;
    P[`thigh${side}`] = thigh;
    P[`shin${side}`] = shin;
    P[`foot${side}`] = foot;
  }

  // torso
  const spine = new THREE.Group();
  spine.position.y = 0.05 * s;
  body.add(spine);
  P.abdomen = mesh(loft(scl(ABDOMEN, s, s * bulk * topFit, s * bulk * topFit, s)), M.top, sh);
  spine.add(P.abdomen);
  const chest = new THREE.Group();
  chest.position.y = 0.2 * s;
  spine.add(chest);
  const chestRings = CHEST.map((r, i) => (i >= 2 && i <= 4 ? { ...r, rx: r.rx * shoulderK } : r));
  P.torso = mesh(loft(scl(chestRings, s, s * bulk * topFit, s * bulk * topFit, s)), M.top, sh);
  chest.add(P.torso);
  const neck = new THREE.Group();
  neck.position.y = 0.3 * s;
  chest.add(neck);
  P.neck = mesh(loft(scl(NECK, s, s * Math.sqrt(bulk), s * Math.sqrt(bulk), s)), M.neck || M.head || M.skin, sh);
  neck.add(P.neck);
  const head = new THREE.Group();
  head.position.y = 0.075 * s;
  neck.add(head);
  P.head = mesh(loft(scl(HEAD, hr, hr, hr, hr), 26), M.head || M.skin, sh);
  P.head.position.y = -0.02 * s;
  head.add(P.head);
  J.spine = spine;
  J.chest = chest;
  J.neck = neck;
  J.head = head;

  // face
  if (opts.face) {
    const fz = hr * 0.93;
    const fl = -0.02 * s;
    const white = (M.eyeWhite = M.eyeWhite || new THREE.MeshStandardMaterial({ color: "#efe9df", roughness: 0.25 }));
    const iris = (M.iris = M.iris || new THREE.MeshStandardMaterial({ color: opts.eyeColor || "#3a2a1c", roughness: 0.15 }));
    const lips = (M.lips = M.lips || new THREE.MeshStandardMaterial({ color: "#8a4a40", roughness: 0.6 }));
    for (const sx of [1, -1]) {
      const eye = mesh(sphere(hr * 0.13, 12, 10), white, false);
      eye.position.set(sx * hr * 0.33, fl + hr * 0.98, fz - hr * 0.15);
      eye.scale.set(1, 0.7, 0.6);
      head.add(eye);
      const ir = mesh(sphere(hr * 0.062, 10, 8), iris, false);
      ir.position.set(sx * hr * 0.33, fl + hr * 0.98, fz - hr * 0.08);
      head.add(ir);
      const brow = mesh(box(hr * 0.34, hr * 0.065, hr * 0.1), M.hair || iris, false);
      brow.position.set(sx * hr * 0.33, fl + hr * 1.16, fz - hr * 0.09);
      brow.rotation.z = sx * -0.12;
      head.add(brow);
      const ear = mesh(sphere(hr * 0.21, 10, 8), M.head || M.skin, sh);
      ear.scale.set(0.32, 1, 0.68);
      ear.position.set(sx * hr * 0.86, fl + hr * 0.92, -hr * 0.06);
      head.add(ear);
    }
    const nose = mesh(cached(`nose:${hr.toFixed(4)}`, () => new THREE.ConeGeometry(hr * 0.13, hr * 0.4, 4)), M.head || M.skin, false);
    nose.position.set(0, fl + hr * 0.74, fz - hr * 0.01);
    nose.rotation.set(-0.32, Math.PI / 4, 0);
    nose.scale.set(1, 1, 0.75);
    head.add(nose);
    const mouth = mesh(box(hr * 0.36, hr * 0.05, hr * 0.08), lips, false);
    mouth.position.set(0, fl + hr * 0.46, fz - hr * 0.08);
    head.add(mouth);
  }
  if (opts.hair && opts.hair !== "bald") {
    const k = opts.hair === "buzz" ? 0.985 : opts.hair === "long" ? 1.07 : 1.04;
    const rings = scl(HAIR, hr, hr * k, hr * k, hr);
    if (opts.hair === "long") rings.unshift({ y: 0.25 * hr, rx: 0.86 * hr, rz: 0.82 * hr, ox: 0, oz: -0.22 * hr, p: 2 });
    const hair = mesh(loft(rings, 24, { capBottom: false }), M.hair, sh);
    hair.position.y = -0.02 * s;
    hair.rotation.x = opts.hair === "long" ? -0.05 : -0.12; // hairline back, face clear
    head.add(hair);
    P.hair = hair;
  }
  if (opts.beard) {
    const b = mesh(loft(scl(BEARD, hr, hr * 1.03, hr * 1.03, hr), 22, { capTop: false }), M.hair, sh);
    b.position.y = -0.02 * s;
    head.add(b);
    const tache = mesh(box(hr * 0.42, hr * 0.07, hr * 0.08), M.hair, false);
    tache.position.set(0, -0.02 * s + hr * 0.55, hr * 0.86);
    head.add(tache);
  }

  // arms + hands
  const fingers = { L: [], R: [] };
  for (const side of ["L", "R"]) {
    const sx = side === "L" ? 1 : -1;
    const shg = new THREE.Group();
    shg.position.set(sx * shoulder, 0.226 * s, -0.005 * s);
    chest.add(shg);
    const upper = mesh(loft(scl(UPPER.map((r) => ({ ...r, ox: (r.ox || 0) * sx })), upperL, armR, armR, s)), M.arms || M.top, sh);
    const delt = upper;
    shg.add(upper);
    const el = new THREE.Group();
    el.position.y = -upperL;
    shg.add(el);
    const elbow = mesh(sphere(0.04 * armR, 12, 10), M.arms || M.top, sh);
    elbow.position.z = -0.008 * s;
    el.add(elbow);
    const fore = mesh(loft(scl(FORE, foreL, armR, armR, s)), M.fore || M.arms || M.top, sh);
    el.add(fore);
    const wr = new THREE.Group();
    wr.position.y = -foreL;
    el.add(wr);
    const hs = s * Math.sqrt(bulk);
    const handMat = M.hands || M.skin;
    const palm = mesh(
      cached(`palm:${hs.toFixed(4)}`, () => {
        const g = new THREE.BoxGeometry(0.078 * hs, 0.085 * hs, 0.032 * hs, 2, 2, 1);
        g.translate(0, -0.045 * hs, 0);
        return g;
      }),
      handMat,
      sh,
    );
    wr.add(palm);
    for (let f = 0; f < 4; f++) {
      const fx = (0.026 - f * 0.0173) * hs * sx;
      const len = [0.028, 0.031, 0.03, 0.024][f] * hs;
      const base = new THREE.Group();
      base.position.set(fx, -0.088 * hs, 0.004 * hs);
      wr.add(base);
      const p1 = mesh(capsule(0.0092 * hs, len * 0.8, 6), handMat, false);
      p1.position.y = -len / 2;
      base.add(p1);
      const mid = new THREE.Group();
      mid.position.y = -len;
      base.add(mid);
      const p2 = mesh(capsule(0.0084 * hs, len * 0.75, 6), handMat, false);
      p2.position.y = -len * 0.45;
      mid.add(p2);
      fingers[side].push({ base, mid });
      if (opts.staticHands) {
        const k = 0.35 + (opts.staticGrip ?? 0.55);
        base.rotation.x = -k * 1.25;
        mid.rotation.x = -k * 1.45;
      }
    }
    const thumb = new THREE.Group();
    thumb.position.set(-0.04 * hs * sx, -0.03 * hs, 0.012 * hs);
    thumb.rotation.set(0.5, 0, -sx * 0.7);
    wr.add(thumb);
    const t1 = mesh(capsule(0.0095 * hs, 0.032 * hs, 6), handMat, false);
    t1.position.y = -0.022 * hs;
    thumb.add(t1);
    fingers[side].thumb = thumb;
    if (opts.staticHands) {
      thumb.rotation.x = 0.5 + (0.35 + (opts.staticGrip ?? 0.55)) * 0.6;
      fingers[side].length = 0;
      delete fingers[side].thumb;
    } else {
      for (const f of fingers[side]) f.base.userData.joint = f.mid.userData.joint = true;
      thumb.userData.joint = true;
    }
    J[`sh${side}`] = shg;
    J[`el${side}`] = el;
    J[`wr${side}`] = wr;
    P[`delt${side}`] = delt;
    P[`upper${side}`] = upper;
    P[`fore${side}`] = fore;
    P[`hand${side}`] = palm;
  }

  for (const j of Object.values(J)) j.userData.joint = true;
  return { root, body, joints: J, parts: P, fingers, size: { H, s, hipY, thighL, shinL, upperL, foreL, shoulder, hr }, cur: zeroPose(), bulk, dims: { s, bulk, topFit, shoulderK, legFit, hipK } };
}

/**
 * A fitted layer over part of the torso (vests, plate carriers, armour):
 * the body's own cross-sections, scaled out by k and squared off by p,
 * between ring indices [from, to] — so it hugs the anatomy it covers.
 *   part: "chest" | "abdomen" | "pelvis"
 */
export function shell(rig, part, mat, { k = 1.08, p = 2.6, from = 0, to = 99, shadows = false } = {}) {
  const d = rig.dims;
  const src = part === "chest" ? CHEST : part === "abdomen" ? ABDOMEN : PELVIS;
  const rings = src.slice(from, to + 1).map((r, i) => ({ ...r, rx: r.rx * (part === "chest" && i + from >= 2 && i + from <= 4 ? d.shoulderK : 1), p }));
  const kx = d.s * d.bulk * (part === "pelvis" ? d.hipK : d.topFit) * k;
  const m = mesh(loft(scl(rings, d.s, kx, d.s * d.bulk * d.topFit * k, d.s), 24), mat, shadows);
  (part === "chest" ? rig.joints.chest : part === "abdomen" ? rig.joints.spine : rig.joints.body).add(m);
  return m;
}

/** damp the rig's current pose toward `target` (rate per second) */
export function blendPose(rig, target, rate, dt) {
  const k = 1 - Math.exp(-rate * dt);
  const c = rig.cur;
  for (const key of POSE_KEYS) {
    const t = target[key] || 0;
    c[key] += (t - c[key]) * k;
  }
}

/** write rig.cur to the joints */
export function applyPose(rig) {
  const c = rig.cur;
  const J = rig.joints;
  const hy = rig.size.hipY;
  J.body.position.set(c.bodyX, hy + c.bodyY, c.bodyZ);
  J.body.rotation.set(c.bodyRX, c.bodyRY, c.bodyRZ, "YXZ");
  J.spine.rotation.set(c.spineRX, c.spineRY, c.spineRZ);
  J.chest.rotation.set(c.chestRX, c.chestRY, 0);
  J.head.rotation.set(c.headRX, c.headRY, 0);
  J.shL.rotation.set(c.lShX, c.lShY, c.lShZ, "ZXY");
  J.shR.rotation.set(c.rShX, c.rShY, c.rShZ, "ZXY");
  J.elL.rotation.set(c.lEl, 0, 0);
  J.elR.rotation.set(c.rEl, 0, 0);
  J.wrL.rotation.set(c.lWr, 0, 0);
  J.wrR.rotation.set(c.rWr, 0, 0);
  J.hipL.rotation.set(c.lHipX, 0, c.lHipZ, "ZXY");
  J.hipR.rotation.set(c.rHipX, 0, c.rHipZ, "ZXY");
  J.kneeL.rotation.set(c.lKnee, 0, 0);
  J.kneeR.rotation.set(c.rKnee, 0, 0);
  J.ankleL.rotation.set(c.lAnk, 0, 0);
  J.ankleR.rotation.set(c.rAnk, 0, 0);
  // fingers: relaxed curl by default, a fist at grip 1, open palm below 0
  if (rig.fingers) {
    for (const [side, g] of [["L", c.lGrip], ["R", c.rGrip]]) {
      const F = rig.fingers[side];
      const k = 0.35 + g;
      for (let i = 0; i < F.length; i++) {
        F[i].base.rotation.x = -Math.max(-0.1, k * 1.25 + i * 0.03);
        F[i].mid.rotation.x = -Math.max(0, k * 1.45);
      }
      if (F.thumb) F.thumb.rotation.x = 0.5 + Math.max(0, k) * 0.6;
    }
  }
}

/* ------------------------------------------------------------------ shared pose library */

const ease = (u) => (u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u));

/** relaxed standing; `guard` raises fists into a fighting stance */
export function poseIdle(p, t, guard = 0, breathe = 1) {
  const b = Math.sin(t * 1.9) * 0.012 * breathe;
  p.bodyY = b - guard * 0.06;
  p.spineRX = 0.03 + guard * 0.08;
  p.chestRX = -0.04 - b * 2;
  p.headRX = -guard * 0.06;
  p.lShZ = 0.12 + guard * 0.05;
  p.rShZ = -0.12 - guard * 0.05;
  p.lShX = 0.05 - guard * 0.55;
  p.rShX = 0.05 - guard * 0.7;
  p.lEl = -0.2 - guard * 1.75;
  p.rEl = -0.2 - guard * 1.8;
  p.lHipX = -0.04 - guard * 0.2;
  p.rHipX = 0.04 + guard * 0.12;
  p.lKnee = 0.06 + guard * 0.35;
  p.rKnee = 0.06 + guard * 0.3;
  p.lAnk = guard * 0.1;
  p.lHipZ = 0.05 + guard * 0.06;
  p.rHipZ = -0.05 - guard * 0.06;
  p.chestRY = guard * 0.25;
  p.lGrip = guard * 0.65;
  p.rGrip = guard * 0.65;
  return p;
}

/** walk / run / sprint cycle; ph is the gait phase (rad), k 0 walk … 1 run … 1.6 sprint */
export function poseRun(p, ph, k, lean = 0) {
  const sw = Math.sin(ph);
  const cs = Math.cos(ph);
  const amp = 0.45 + k * 0.5;
  p.bodyY = -Math.abs(cs) * (0.02 + k * 0.05) + 0.015 * k;
  p.spineRX = 0.08 + k * 0.18 + lean;
  p.chestRY = sw * (0.1 + k * 0.12);
  p.chestRX = -0.05;
  p.headRX = -0.1 - k * 0.12 - lean * 0.5;
  p.lHipX = sw * amp;
  p.rHipX = -sw * amp;
  p.lKnee = Math.max(0.05, -cs * (0.5 + k * 0.7) + 0.35 + k * 0.25);
  p.rKnee = Math.max(0.05, cs * (0.5 + k * 0.7) + 0.35 + k * 0.25);
  p.lAnk = sw * 0.2;
  p.rAnk = -sw * 0.2;
  p.lHipZ = 0.04;
  p.rHipZ = -0.04;
  const arm = 0.4 + k * 0.55;
  p.lShX = -sw * arm;
  p.rShX = sw * arm;
  p.lShZ = 0.12 + k * 0.05;
  p.rShZ = -0.12 - k * 0.05;
  p.lEl = -0.45 - k * 0.75;
  p.rEl = -0.45 - k * 0.75;
  p.lGrip = 0.2 + k * 0.3;
  p.rGrip = 0.2 + k * 0.3;
  return p;
}

/** generic airborne pose: rising tuck → falling spread */
export function poseAir(p, vy, t) {
  const fall = ease((-vy + 2) / 14);
  p.spineRX = 0.1 - fall * 0.15;
  p.chestRX = -0.1;
  p.headRX = -0.15 + fall * 0.1;
  p.lHipX = -0.9 + fall * 0.5;
  p.rHipX = -0.2 + fall * 0.4;
  p.lKnee = 1.4 - fall * 0.6;
  p.rKnee = 0.5 + fall * 0.4;
  p.lShX = -0.5 + fall * 0.3 + Math.sin(t * 7) * 0.1 * fall;
  p.rShX = 0.2 - fall * 0.2 - Math.sin(t * 7) * 0.1 * fall;
  p.lShZ = 0.4 + fall * 0.8;
  p.rShZ = -0.4 - fall * 0.8;
  p.lEl = -0.6 + fall * 0.3;
  p.rEl = -0.6 + fall * 0.3;
  p.lHipZ = 0.1 + fall * 0.1;
  p.rHipZ = -0.1 - fall * 0.1;
  return p;
}

export { ease };

/**
 * Draw-call optimiser: every static mesh hanging off the same bone (through
 * non-animated groups) is merged per material into ONE mesh on that bone.
 * Call after all outfit / gear meshes are attached. Meshes with children,
 * or flagged userData.keep (things that toggle / fade on their own), stay.
 * Returns the merged geometries (dispose them with the model).
 */
export function optimizeRig(rig) {
  const merged = [];
  const _m = new THREE.Matrix4();
  rig.root.updateMatrixWorld(true);
  const bones = [rig.root];
  rig.root.traverse((o) => o.userData && o.userData.joint && bones.push(o));
  for (const bone of bones) {
    const inv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
    const byMat = new Map();
    const walk = (node) => {
      for (const c of node.children) {
        if (c.userData.joint) continue;
        if (c.isMesh && !c.userData.keep && !c.children.length && !Array.isArray(c.material)) {
          if (!byMat.has(c.material)) byMat.set(c.material, []);
          byMat.get(c.material).push(c);
        } else if (!c.isMesh) walk(c);
      }
    };
    walk(bone);
    for (const [mat, list] of byMat) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        _m.multiplyMatrices(inv, m.matrixWorld);
        let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
        if (!g.attributes.normal) g.computeVertexNormals();
        g.clearGroups();
        g.applyMatrix4(_m);
        return g;
      });
      const geo = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!geo) continue;
      const mm = new THREE.Mesh(geo, mat);
      mm.castShadow = list.some((m) => m.castShadow);
      bone.add(mm);
      for (const m of list) m.parent.remove(m);
      merged.push(geo);
    }
  }
  return merged;
}
