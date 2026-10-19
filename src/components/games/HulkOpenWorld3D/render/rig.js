/**
 * Hulk: Open World 3D — procedural SKINNED humanoid (one continuous mesh).
 *
 * Unlike rigid-segment mannequins, the body is a single SkinnedMesh: torso,
 * arms and legs are sculpted lofts (dense cross-section rings whose radius
 * follows anatomy — pecs, abs, lats, traps, deltoids, biceps, quads, calves
 * — as angular "muscle bumps"), and every vertex is weight-blended between
 * neighbouring bones so shoulders, elbows, hips and knees bend smoothly.
 * Hands (articulated fingers) and the head are rigid groups on their bones.
 *
 * Bones (model faces +Z, +X is the character's LEFT, feet at y = 0):
 *   root ─ hips ─ spine ─ chest ─ neck ─ head
 *                            └─ clavL/R ─ armL/R ─ foreL/R ─ handL/R
 *          hips ─ thighL/R ─ shinL/R ─ footL/R
 *
 * Builds: "hulk" (3.3 m giant) · "man" (1.8 m: soldiers, civilians).
 */
import * as THREE from "three";

/* ================================================================ proportions */
export const BUILDS = {
  hulk: { hipY: 1.66, thighOff: [0.28, -0.07], thigh: 0.76, shin: 0.7, spine: 0.25, chest: 0.47, neck: 0.62, head: 0.1, clav: [0.6, 0.42], armOff: 0.25, upper: 0.62, fore: 0.58, armRest: 0.3, scale: 1 },
  man: { hipY: 0.94, thighOff: [0.095, -0.03], thigh: 0.44, shin: 0.43, spine: 0.11, chest: 0.22, neck: 0.31, head: 0.08, clav: [0.07, 0.24], armOff: 0.115, upper: 0.29, fore: 0.27, armRest: 0.12, scale: 1 },
};

/* ================================================================ loft */
const win = (y, a, b, soft = 0.06) => {
  // smooth window: 1 inside [a,b], easing to 0 over `soft`
  const s1 = Math.min(1, Math.max(0, (y - a + soft) / soft));
  const s2 = Math.min(1, Math.max(0, (b + soft - y) / soft));
  const e = (u) => u * u * (3 - 2 * u);
  return e(s1) * e(s2);
};
const norm = (k) => ({ y: k.y, rx: k.rx, rz: k.rz, ox: k.ox || 0, oz: k.oz || 0, p: k.p || 2.2 });
function interpKeys(keys, y) {
  if (y <= keys[0].y) return norm(keys[0]);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (y <= b.y) {
      const u = (y - a.y) / (b.y - a.y);
      const s = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
      const o = { y };
      for (const k of ["rx", "rz", "ox", "oz", "p"]) o[k] = (a[k] ?? (k === "p" ? 2.2 : 0)) * (1 - s) + (b[k] ?? (k === "p" ? 2.2 : 0)) * s;
      return o;
    }
  }
  return norm(keys[keys.length - 1]);
}
/**
 * Build a loft surface. ys: ring heights (increasing). ring(y) → {rx, rz, ox, oz, p}.
 * bumps(y, θ) → relative radius change (θ: 0 = +X, π/2 = +Z front).
 * Returns { pos[], nrm? , uv[], col[], idx[] } in local space.
 */
function loftArrays(ys, ring, bumps, segs, { capTop = true, capBottom = true, jag = null } = {}) {
  const pos = [];
  const uv = [];
  const col = [];
  const idx = [];
  let vacc = 0;
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i];
    const r = ring(y);
    const p = r.p || 2.2;
    if (i > 0) vacc += Math.abs(ys[i] - ys[i - 1]);
    for (let k = 0; k <= segs; k++) {
      const th = (k / segs) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const ex = 2 / p;
      const b = bumps ? bumps(y, th) : 0;
      const m = 1 + b;
      let yy = y;
      if (jag && i === 0) yy += jag(k);
      pos.push(r.ox + r.rx * m * Math.sign(c) * Math.pow(Math.abs(c), ex), yy, r.oz + r.rz * m * Math.sign(s) * Math.pow(Math.abs(s), ex));
      uv.push(k / segs, vacc);
      const shade = Math.max(0.62, Math.min(1.25, 1 + b * 2.4));
      col.push(shade, shade, shade);
    }
  }
  const row = segs + 1;
  for (let i = 0; i < ys.length - 1; i++) {
    for (let k = 0; k < segs; k++) {
      const a = i * row + k;
      const b = a + row;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const cap = (i, up) => {
    const y = ys[i];
    const r = ring(y);
    const c = pos.length / 3;
    pos.push(r.ox, y + (up ? 0.004 : -0.004), r.oz);
    uv.push(0.5, up ? vacc : 0);
    col.push(0.9, 0.9, 0.9);
    for (let k = 0; k < segs; k++) {
      const a = i * row + k;
      if (up) idx.push(c, a + 1, a);
      else idx.push(c, a, a + 1);
    }
  };
  if (capTop) cap(ys.length - 1, true);
  if (capBottom) cap(0, false);
  return { pos, uv, col, idx };
}
const range = (a, b, step) => {
  const out = [];
  for (let y = a; y < b - 1e-6; y += step) out.push(y);
  out.push(b);
  return out;
};
/** angular gaussian bump */
const g = (th, at, w) => {
  let d = th - at;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return Math.exp(-(d * d) / (w * w));
};
const FRONT = Math.PI / 2;
const BACK = -Math.PI / 2;

/* ================================================================ anatomy */
function torsoSpec(build) {
  if (build === "hulk") {
    const K = [
      { y: -0.33, rx: 0.26, rz: 0.24, oz: -0.02 },
      { y: -0.2, rx: 0.42, rz: 0.34, oz: -0.03 },
      { y: -0.05, rx: 0.47, rz: 0.37, oz: -0.02 },
      { y: 0.12, rx: 0.46, rz: 0.37, oz: 0.02 },
      { y: 0.3, rx: 0.44, rz: 0.38, oz: 0.05 },
      { y: 0.46, rx: 0.47, rz: 0.4, oz: 0.06 },
      { y: 0.62, rx: 0.56, rz: 0.44, oz: 0.07 },
      { y: 0.78, rx: 0.68, rz: 0.49, oz: 0.08 },
      { y: 0.92, rx: 0.76, rz: 0.53, oz: 0.09 },
      { y: 1.04, rx: 0.79, rz: 0.54, oz: 0.08 },
      { y: 1.14, rx: 0.78, rz: 0.5, oz: 0.04 },
      { y: 1.24, rx: 0.68, rz: 0.44, oz: -0.01 },
      { y: 1.32, rx: 0.5, rz: 0.37, oz: -0.04 },
      { y: 1.4, rx: 0.32, rz: 0.29, oz: -0.03 },
      { y: 1.48, rx: 0.205, rz: 0.2, oz: 0.01 },
      { y: 1.6, rx: 0.18, rz: 0.19, oz: 0.03 },
    ];
    const bumps = (y, th) => {
      let b = 0;
      // pectorals + sternum groove
      const pw = win(y, 0.86, 1.12, 0.08);
      b += 0.11 * pw * (g(th, FRONT + 0.44, 0.36) + g(th, FRONT - 0.44, 0.36));
      b -= 0.04 * win(y, 0.62, 1.12) * g(th, FRONT, 0.07);
      // pec lower edge shadow
      b -= 0.03 * win(y, 0.8, 0.86, 0.03) * (g(th, FRONT + 0.45, 0.4) + g(th, FRONT - 0.45, 0.4));
      // six-pack: columns × rows
      const aw = win(y, 0.16, 0.74, 0.05);
      const row = 0.55 + 0.45 * Math.cos(((y - 0.16) / 0.19) * Math.PI * 2);
      b += 0.055 * aw * row * (g(th, FRONT + 0.15, 0.11) + g(th, FRONT - 0.15, 0.11));
      b -= 0.03 * aw * g(th, FRONT, 0.045);
      // obliques + serratus ridges
      b += 0.05 * win(y, 0.12, 0.56) * (g(th, FRONT + 0.95, 0.3) + g(th, FRONT - 0.95, 0.3));
      const sr = win(y, 0.62, 0.9, 0.04) * (0.5 + 0.5 * Math.cos(((y - 0.62) / 0.09) * Math.PI * 2));
      b += 0.025 * sr * (g(th, FRONT + 1.3, 0.14) + g(th, FRONT - 1.3, 0.14));
      // lats (V-taper) and spine groove
      b += 0.09 * win(y, 0.56, 1.1, 0.1) * (g(th, BACK + 0.75, 0.45) + g(th, BACK - 0.75, 0.45));
      b -= 0.055 * win(y, 0.15, 1.28) * g(th, BACK, 0.11);
      // traps
      b += 0.14 * win(y, 1.16, 1.42, 0.06) * (g(th, BACK + 0.55, 0.55) + g(th, BACK - 0.55, 0.55));
      // glutes
      b += 0.1 * win(y, -0.3, 0.02, 0.08) * (g(th, BACK + 0.48, 0.42) + g(th, BACK - 0.48, 0.42));
      // neck: sternocleidomastoid
      b += 0.06 * win(y, 1.44, 1.6, 0.04) * (g(th, FRONT + 0.6, 0.35) + g(th, FRONT - 0.6, 0.35));
      return b;
    };
    return { keys: K, bumps, y0: -0.33, y1: 1.6, step: 0.03, segs: 48 };
  }
  const K = [
    { y: -0.16, rx: 0.1, rz: 0.09 },
    { y: -0.09, rx: 0.15, rz: 0.11, oz: -0.01 },
    { y: 0.0, rx: 0.165, rz: 0.115 },
    { y: 0.1, rx: 0.15, rz: 0.11, oz: 0.01 },
    { y: 0.2, rx: 0.148, rz: 0.105, oz: 0.01 },
    { y: 0.3, rx: 0.16, rz: 0.11, oz: 0.012 },
    { y: 0.4, rx: 0.18, rz: 0.12, oz: 0.016 },
    { y: 0.48, rx: 0.19, rz: 0.12, oz: 0.012 },
    { y: 0.55, rx: 0.17, rz: 0.1, oz: 0 },
    { y: 0.6, rx: 0.12, rz: 0.08, oz: -0.01 },
    { y: 0.65, rx: 0.062, rz: 0.06, oz: 0.004 },
    { y: 0.74, rx: 0.058, rz: 0.058, oz: 0.01 },
  ];
  const bumps = (y, th) => {
    let b = 0;
    b += 0.05 * win(y, 0.36, 0.5) * (g(th, FRONT + 0.45, 0.4) + g(th, FRONT - 0.45, 0.4));
    b += 0.05 * win(y, 0.3, 0.5) * (g(th, BACK + 0.7, 0.45) + g(th, BACK - 0.7, 0.45));
    b += 0.06 * win(y, -0.14, 0.02) * (g(th, BACK + 0.5, 0.4) + g(th, BACK - 0.5, 0.4));
    b -= 0.03 * win(y, 0.05, 0.56) * g(th, BACK, 0.1);
    return b;
  };
  return { keys: K, bumps, y0: -0.16, y1: 0.74, step: 0.025, segs: 28 };
}
function armSpec(build) {
  if (build === "hulk") {
    const K = [
      { y: -1.2, rx: 0.115, rz: 0.1 },
      { y: -1.1, rx: 0.135, rz: 0.115 },
      { y: -0.95, rx: 0.175, rz: 0.15 },
      { y: -0.8, rx: 0.205, rz: 0.185 },
      { y: -0.68, rx: 0.19, rz: 0.17 },
      { y: -0.6, rx: 0.165, rz: 0.165 },
      { y: -0.5, rx: 0.2, rz: 0.22 },
      { y: -0.36, rx: 0.225, rz: 0.25 },
      { y: -0.2, rx: 0.24, rz: 0.26 },
      { y: -0.05, rx: 0.27, rz: 0.28, ox: 0.01 },
      { y: 0.08, rx: 0.27, rz: 0.27, ox: 0.02 },
      { y: 0.17, rx: 0.2, rz: 0.21, ox: 0.0 },
      { y: 0.24, rx: 0.08, rz: 0.1, ox: -0.03 },
    ];
    const bumps = (y, th) => {
      let b = 0;
      b += 0.14 * win(y, -0.5, -0.22, 0.08) * g(th, FRONT, 0.55); // biceps
      b += 0.1 * win(y, -0.45, -0.08, 0.08) * g(th, BACK, 0.7); // triceps
      b += 0.08 * win(y, -0.95, -0.7, 0.06) * g(th, FRONT + 0.7, 0.5); // brachioradialis
      b += 0.05 * win(y, -0.1, 0.12) * (g(th, FRONT + 0.6, 0.6) + g(th, BACK - 0.6, 0.6)); // deltoid heads
      // veins on the forearm
      b += 0.018 * win(y, -1.05, -0.7, 0.04) * g(th, FRONT - 0.3, 0.06);
      return b;
    };
    return { keys: K, bumps, y0: -1.2, y1: 0.24, step: 0.035, segs: 30 };
  }
  const K = [
    { y: -0.56, rx: 0.028, rz: 0.024 },
    { y: -0.48, rx: 0.036, rz: 0.03 },
    { y: -0.36, rx: 0.044, rz: 0.04 },
    { y: -0.29, rx: 0.038, rz: 0.038 },
    { y: -0.22, rx: 0.044, rz: 0.048 },
    { y: -0.08, rx: 0.052, rz: 0.058 },
    { y: 0.01, rx: 0.058, rz: 0.06 },
    { y: 0.045, rx: 0.045, rz: 0.048 },
    { y: 0.065, rx: 0.02, rz: 0.022 },
  ];
  return { keys: K, bumps: null, y0: -0.56, y1: 0.065, step: 0.03, segs: 16 };
}
function legSpec(build) {
  if (build === "hulk") {
    const K = [
      { y: -1.3, rx: 0.115, rz: 0.12 },
      { y: -1.2, rx: 0.13, rz: 0.135 },
      { y: -1.04, rx: 0.18, rz: 0.2, oz: -0.02 },
      { y: -0.9, rx: 0.22, rz: 0.25, oz: -0.04 },
      { y: -0.76, rx: 0.2, rz: 0.21, oz: -0.01 },
      { y: -0.68, rx: 0.19, rz: 0.2 },
      { y: -0.58, rx: 0.22, rz: 0.23, oz: 0.01 },
      { y: -0.42, rx: 0.28, rz: 0.3, oz: 0.02 },
      { y: -0.22, rx: 0.32, rz: 0.33, oz: 0.02 },
      { y: -0.02, rx: 0.33, rz: 0.33 },
      { y: 0.14, rx: 0.3, rz: 0.29 },
      { y: 0.22, rx: 0.22, rz: 0.22 },
    ];
    const bumps = (y, th) => {
      let b = 0;
      b += 0.09 * win(y, -0.45, -0.05, 0.1) * g(th, FRONT, 0.6); // quads
      b += 0.08 * win(y, -0.64, -0.44, 0.06) * g(th, FRONT + (th > 0 ? 0.9 : -0.9), 0.35); // teardrop
      b += 0.13 * win(y, -1.02, -0.78, 0.07) * g(th, BACK, 0.75); // calf
      b += 0.04 * win(y, -0.7, -0.62, 0.03) * g(th, FRONT, 0.4); // kneecap
      return b;
    };
    const sc = 1.46 / 1.3;
    for (const k of K) if (k.y < 0) k.y *= sc;
    K[0].y -= 0.05;
    return { keys: K, bumps: (y, th) => bumps(y / (y < 0 ? sc : 1), th), y0: K[0].y, y1: 0.22, step: 0.035, segs: 30 };
  }
  const K = [
    { y: -0.86, rx: 0.036, rz: 0.04 },
    { y: -0.76, rx: 0.04, rz: 0.045 },
    { y: -0.6, rx: 0.052, rz: 0.062, oz: -0.012 },
    { y: -0.46, rx: 0.046, rz: 0.05 },
    { y: -0.42, rx: 0.05, rz: 0.052 },
    { y: -0.3, rx: 0.068, rz: 0.072 },
    { y: -0.1, rx: 0.088, rz: 0.09 },
    { y: 0.04, rx: 0.09, rz: 0.088 },
    { y: 0.1, rx: 0.07, rz: 0.07 },
  ];
  return { keys: K, bumps: null, y0: -0.86, y1: 0.1, step: 0.04, segs: 16 };
}

/* ================================================================ materials */
const TEX = new Map();
function canvasTex(key, w, h, draw, { srgb = true, repeat = [1, 1] } = {}) {
  if (TEX.has(key)) return TEX.get(key);
  const c = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (!c) return null;
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  TEX.set(key, t);
  return t;
}
/** soft skin-pore / vein normal map */
export function skinNormal() {
  return canvasTex(
    "skinN",
    256,
    256,
    (g2, w, h) => {
      const img = g2.createImageData(w, h);
      let seed = 3;
      const R = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      const hf = new Float32Array(w * h);
      for (let i = 0; i < 2600; i++) {
        const x = R() * w;
        const y = R() * h;
        const r = 1 + R() * 2.5;
        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            const px = (Math.floor(x + dx) + w) % w;
            const py = (Math.floor(y + dy) + h) % h;
            const d = Math.hypot(dx, dy);
            if (d < r) hf[py * w + px] -= (1 - d / r) * 0.6;
          }
        }
      }
      // meandering veins
      for (let v = 0; v < 7; v++) {
        let x = R() * w;
        let y = R() * h;
        let a = R() * Math.PI * 2;
        for (let s = 0; s < 160; s++) {
          a += (R() - 0.5) * 0.5;
          x += Math.cos(a) * 1.2;
          y += Math.sin(a) * 1.2;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const px = (Math.floor(x + dx) + w * 4) % w;
              const py = (Math.floor(y + dy) + h * 4) % h;
              hf[py * w + px] += Math.max(0, 1 - Math.hypot(dx, dy) / 2.2) * 0.9;
            }
          }
        }
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const l = hf[y * w + ((x + w - 1) % w)];
          const r2 = hf[y * w + ((x + 1) % w)];
          const u = hf[((y + h - 1) % h) * w + x];
          const d = hf[((y + 1) % h) * w + x];
          const i = (y * w + x) * 4;
          img.data[i] = 128 + (l - r2) * 60;
          img.data[i + 1] = 128 + (u - d) * 60;
          img.data[i + 2] = 255;
          img.data[i + 3] = 255;
        }
      }
      g2.putImageData(img, 0, 0);
    },
    { srgb: false, repeat: [4, 6] },
  );
}
/** torn denim for the purple pants */
export function denim(hex) {
  return canvasTex(`denim:${hex}`, 128, 128, (g2, w, h) => {
    g2.fillStyle = hex;
    g2.fillRect(0, 0, w, h);
    for (let i = -w; i < w * 2; i += 3) {
      g2.strokeStyle = `rgba(255,255,255,${0.035 + (i % 7) * 0.006})`;
      g2.beginPath();
      g2.moveTo(i, 0);
      g2.lineTo(i + w, h);
      g2.stroke();
    }
    for (let i = 0; i < 300; i++) {
      g2.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
      g2.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, { repeat: [3, 2] });
}
export function disposeRigTextures() {
  for (const t of TEX.values()) t.dispose();
  TEX.clear();
}

/* ================================================================ builder */
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

/**
 * spec: { build, mats: { skin, top?, bottom?, shoes?, hair? }, outfit: "hulk"|"soldier"|"civ", shadows }
 * returns rig { root, mesh, bones, P, attach:{ handL, handR, head, chest, hips }, fingers }
 */
export function buildRig(spec) {
  const P = BUILDS[spec.build];
  const isHulk = spec.build === "hulk";
  const root = new THREE.Group();
  const bones = {};
  const mk = (name, parent, x, y, z, rot) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    if (rot) b.rotation.set(rot[0], rot[1], rot[2]);
    b.userData.restQ = b.quaternion.clone();
    b.userData.restP = b.position.clone();
    if (parent) parent.add(b);
    bones[name] = b;
    return b;
  };
  const rootB = mk("root", null, 0, 0, 0);
  const hips = mk("hips", rootB, 0, P.hipY, 0);
  const spine = mk("spine", hips, 0, P.spine, 0);
  const chest = mk("chest", spine, 0, P.chest, 0);
  const neck = mk("neck", chest, 0, P.neck, isHulk ? 0.03 : 0.005);
  mk("head", neck, 0, P.head, isHulk ? 0.03 : 0.01);
  for (const [s, sx] of [["L", 1], ["R", -1]]) {
    const clav = mk(`clav${s}`, chest, sx * P.clav[0], P.clav[1], 0);
    const arm = mk(`arm${s}`, clav, sx * P.armOff, 0.0, 0, [0, 0, sx * P.armRest]);
    const fore = mk(`fore${s}`, arm, 0, -P.upper, 0);
    mk(`hand${s}`, fore, 0, -P.fore, 0);
    const thigh = mk(`thigh${s}`, hips, sx * P.thighOff[0], P.thighOff[1], 0);
    const shin = mk(`shin${s}`, thigh, 0, -P.thigh, 0);
    mk(`foot${s}`, shin, 0, -P.shin, 0);
    void arm;
    void fore;
  }
  root.add(rootB);
  root.updateMatrixWorld(true);
  const rig0 = { toes: [] };
  const order = Object.keys(bones);
  const bi = Object.fromEntries(order.map((n, i) => [n, i]));

  // ---------------------------------------------------------------- geometry parts
  const parts = []; // {pos, uv, col, idx, sw:[i0,i1,i2,i3,w0..w3 per vertex], mat}
  const addPart = (arrays, boneName, weightFn, matIndex) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(arrays.pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(arrays.uv, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(arrays.col, 3));
    geo.setIndex(arrays.idx);
    geo.computeVertexNormals();
    // weights from LOCAL positions, then move into model space
    const n = arrays.pos.length / 3;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const w = weightFn(arrays.pos[i * 3], arrays.pos[i * 3 + 1], arrays.pos[i * 3 + 2]);
      let k = 0;
      for (const [name, val] of w) {
        if (k >= 4) break;
        si[i * 4 + k] = bi[name];
        sw[i * 4 + k] = val;
        k++;
      }
      let tot = 0;
      for (let j = 0; j < 4; j++) tot += sw[i * 4 + j];
      for (let j = 0; j < 4; j++) sw[i * 4 + j] /= tot || 1;
    }
    geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
    geo.applyMatrix4(_m.copy(bones[boneName].matrixWorld));
    parts.push({ geo, mat: matIndex });
  };
  const blend = (t, a, b) => {
    t = Math.min(1, Math.max(0, t));
    const s = t * t * (3 - 2 * t);
    return s <= 0.001 ? [[a, 1]] : s >= 0.999 ? [[b, 1]] : [[a, 1 - s], [b, s]];
  };

  // torso (hips space)
  const T = torsoSpec(spec.build);
  const tys = range(T.y0, T.y1, T.step);
  const torsoArr = loftArrays(tys, (y) => interpKeys(T.keys, y), T.bumps, T.segs, { capTop: false });
  const ySpine = P.spine;
  const yChest = P.spine + P.chest;
  const yNeck = yChest + P.neck;
  addPart(
    torsoArr,
    "hips",
    (x, y) => {
      if (y < ySpine * 0.4) return [["hips", 1]];
      if (y < ySpine + 0.1 * P.chest / 0.47) return blend((y - ySpine * 0.4) / (ySpine * 0.6 + 0.1), "hips", "spine");
      if (y < yChest + 0.05) return blend((y - ySpine - 0.1) / (yChest - ySpine - 0.05), "spine", "chest");
      if (y < yNeck - 0.12 * (isHulk ? 1 : 0.5)) return [["chest", 1]];
      return blend((y - (yNeck - 0.12)) / 0.12, "chest", "neck");
    },
    0,
  );
  // arms (arm-bone space)
  const A = armSpec(spec.build);
  const ays = range(A.y0, A.y1, A.step);
  for (const s of ["L", "R"]) {
    const sx = s === "L" ? 1 : -1;
    const arr = loftArrays(ays, (y) => {
      const r = interpKeys(A.keys, y);
      return { ...r, ox: (r.ox || 0) * sx };
    }, A.bumps ? (y, th) => A.bumps(y, sx > 0 ? th : Math.PI - th) : null, A.segs, { capBottom: true, capTop: true });
    const e = -P.upper;
    const wr = -P.upper - P.fore;
    addPart(
      arr,
      `arm${s}`,
      (x, y) => {
        if (y > 0.06) return blend((y - 0.06) / 0.16, `arm${s}`, `clav${s}`).map(([n, v]) => [n, n === `clav${s}` ? v * 0.6 : v + (n === `arm${s}` ? 0 : 0)]);
        if (y > e + 0.12) return [[`arm${s}`, 1]];
        if (y > e - 0.1) return blend((e + 0.12 - y) / 0.22, `arm${s}`, `fore${s}`);
        if (y > wr + 0.06) return [[`fore${s}`, 1]];
        return blend((wr + 0.06 - y) / 0.1, `fore${s}`, `hand${s}`);
      },
      0,
    );
  }
  // legs (thigh space)
  const L = legSpec(spec.build);
  const lys = range(L.y0, L.y1, L.step);
  for (const s of ["L", "R"]) {
    const sx = s === "L" ? 1 : -1;
    const arr = loftArrays(lys, (y) => interpKeys(L.keys, y), L.bumps ? (y, th) => L.bumps(y, sx > 0 ? th : Math.PI - th) : null, L.segs, { capTop: true });
    const k = -P.thigh;
    addPart(
      arr,
      `thigh${s}`,
      (x, y) => {
        if (y > 0.02) return blend((y - 0.02) / 0.18, `thigh${s}`, "hips").map(([n, v]) => [n, n === "hips" ? v * 0.7 : v]);
        if (y > k + 0.12) return [[`thigh${s}`, 1]];
        if (y > k - 0.1) return blend((k + 0.12 - y) / 0.22, `thigh${s}`, `shin${s}`);
        if (y > k - P.shin + 0.05) return [[`shin${s}`, 1]];
        return blend((k - P.shin + 0.05 - y) / 0.08, `shin${s}`, `foot${s}`);
      },
      0,
    );
    // foot: heel → toes along +Z (foot space)
    const fl = isHulk ? 0.5 : 0.26;
    const fw = isHulk ? 0.165 : 0.05;
    const fh = isHulk ? 0.17 : 0.07;
    const ah = P.hipY + P.thighOff[1] - P.thigh - P.shin; // ankle height above the ground
    const FK = [
      { y: -0.14 * fl, rx: fw * 0.62, rz: ah * 0.75 },
      { y: -0.04 * fl, rx: fw * 0.78, rz: ah * 1.05 },
      { y: 0.12 * fl, rx: fw * 0.85, rz: ah * 1.25 },
      { y: 0.42 * fl, rx: fw * 0.95, rz: ah * 0.95 },
      { y: 0.72 * fl, rx: fw * 1.05, rz: ah * 0.62 },
      { y: 0.9 * fl, rx: fw * 0.95, rz: ah * 0.48 },
      { y: 1.0 * fl, rx: fw * 0.55, rz: ah * 0.32 },
    ].map((k) => ({ ...k, oz: ah - k.rz }));
    const farr = loftArrays(range(FK[0].y, FK[FK.length - 1].y, fl / 16), (y) => interpKeys(FK, y), null, isHulk ? 22 : 12);
    // rotate +90° about X: the loft runs along +Z (toes forward), flat sole on the ground
    for (let i = 0; i < farr.pos.length; i += 3) {
      const ly = farr.pos[i + 1];
      const lz = farr.pos[i + 2];
      farr.pos[i + 1] = -lz;
      farr.pos[i + 2] = ly;
    }
    addPart(farr, `foot${s}`, () => [[`foot${s}`, 1]], spec.outfit === "hulk" ? 0 : 3);
    if (isHulk) rig0.toes.push([s, fl, fw, fh]);
  }
  // pants: shorts body + leg tubes with a torn hem (hulk) / full trousers (man)
  if (spec.mats.bottom) {
    const pk = isHulk ? 1.05 : 1.08;
    const PT = T.keys.filter((k) => k.y <= (isHulk ? 0.24 : 0.1));
    const pys = range(T.y0, isHulk ? 0.2 : 0.08, T.step);
    const parr = loftArrays(pys, (y) => {
      const r = interpKeys(PT, y);
      return { ...r, rx: r.rx * pk + 0.01, rz: r.rz * pk + 0.01 };
    }, isHulk ? (y, th) => T.bumps(y, th) * 0.6 : null, T.segs, { capTop: false, capBottom: true });
    addPart(parr, "hips", (x, y) => (y < ySpine * 0.4 ? [["hips", 1]] : blend((y - ySpine * 0.4) / (ySpine * 0.6), "hips", "spine")), 1);
    for (const s of ["L", "R"]) {
      const sx = s === "L" ? 1 : -1;
      const hemY = isHulk ? -0.5 : -P.thigh - P.shin + 0.06;
      const lys2 = range(hemY, L.y1, L.step);
      const R = mulberry(s === "L" ? 11 : 23);
      const jag = isHulk ? (() => {
        const arr = [];
        for (let k = 0; k <= L.segs; k++) arr.push((R() - 0.3) * 0.13 + Math.sin(k * 1.7) * 0.03);
        arr[L.segs] = arr[0];
        return (k) => arr[k];
      })() : null;
      const larr = loftArrays(lys2, (y) => {
        const r = interpKeys(L.keys, y);
        const flare = isHulk ? 1 + Math.max(0, (-0.3 - y) / 0.2) * 0.05 : 1;
        return { ...r, rx: r.rx * pk * flare + 0.012, rz: r.rz * pk * flare + 0.012 };
      }, L.bumps ? (y, th) => L.bumps(y, sx > 0 ? th : Math.PI - th) * 0.5 : null, L.segs, { capTop: false, capBottom: false, jag });
      const k = -P.thigh;
      addPart(
        larr,
        `thigh${s}`,
        (x, y) => {
          if (y > 0.02) return blend((y - 0.02) / 0.18, `thigh${s}`, "hips").map(([n, v]) => [n, n === "hips" ? v * 0.7 : v]);
          if (y > k + 0.12) return [[`thigh${s}`, 1]];
          if (y > k - 0.1) return blend((k + 0.12 - y) / 0.22, `thigh${s}`, `shin${s}`);
          return [[`shin${s}`, 1]];
        },
        1,
      );
    }
  }
  // torso shell (shirt / uniform) for clothed builds
  if (spec.mats.top && !isHulk) {
    const top = T.keys.filter((k) => k.y >= 0.0);
    const ys2 = range(0.0, 0.66, T.step);
    const arr = loftArrays(ys2, (y) => {
      const r = interpKeys(top, y);
      return { ...r, rx: r.rx * 1.07 + 0.006, rz: r.rz * 1.1 + 0.006 };
    }, T.bumps ? (y, th) => T.bumps(y, th) * 0.5 : null, T.segs, { capTop: true, capBottom: false });
    addPart(arr, "hips", (x, y) => {
      if (y < ySpine + 0.04) return blend((y - ySpine * 0.4) / (ySpine * 0.6 + 0.04), "hips", "spine");
      if (y < yChest + 0.04) return blend((y - ySpine - 0.04) / (yChest - ySpine), "spine", "chest");
      return [["chest", 1]];
    }, 2);
    // sleeves
    for (const s of ["L", "R"]) {
      const sx = s === "L" ? 1 : -1;
      const ys3 = range(spec.longSleeve ? -0.5 : -0.16, A.y1 - (isHulk ? 0.07 : 0.01), A.step);
      const sarr = loftArrays(ys3, (y) => {
        const r = interpKeys(A.keys, y);
        return { ...r, rx: r.rx * 1.1 + 0.005, rz: r.rz * 1.1 + 0.005, ox: (r.ox || 0) * sx };
      }, null, A.segs, { capTop: true, capBottom: false });
      const e = -P.upper;
      addPart(sarr, `arm${s}`, (x, y) => {
        if (y > 0.06) return blend((y - 0.06) / 0.16, `arm${s}`, `clav${s}`);
        if (y > e + 0.06) return [[`arm${s}`, 1]];
        return blend((e + 0.06 - y) / 0.12, `arm${s}`, `fore${s}`);
      }, 2);
    }
  }

  // merge parts → one skinned mesh with material groups
  parts.sort((a, b) => a.mat - b.mat);
  const geo = mergeSkinned(parts);
  const mats = [spec.mats.skin, spec.mats.bottom || spec.mats.skin, spec.mats.top || spec.mats.skin, spec.mats.shoes || spec.mats.skin];
  const mesh = new THREE.SkinnedMesh(geo, mats);
  mesh.castShadow = !!spec.shadows;
  mesh.frustumCulled = false;
  const skeleton = new THREE.Skeleton(order.map((n) => bones[n]));
  mesh.add(rootB);
  mesh.bind(skeleton);
  root.add(mesh);

  const rig = { root, mesh, bones, P, build: spec.build, fingers: { L: [], R: [] }, geos: [geo], extraMeshes: [] };
  for (const [s, fl, fw, fh] of rig0.toes) {
    const foot = bones[`foot${s}`];
    const sx = s === "L" ? 1 : -1;
    for (let i = 0; i < 5; i++) {
      const big = i === 0;
      const t = new THREE.Mesh(cached(`toe${big}`, () => new THREE.SphereGeometry(big ? 0.06 : 0.045, 8, 6)), spec.mats.plain || spec.mats.skin);
      const x = -sx * (0.075 - i * 0.04) * (fw / 0.165);
      const ah = P.hipY + P.thighOff[1] - P.thigh - P.shin;
      t.position.set(x * 1.05, -ah + (big ? 0.05 : 0.04), fl * (0.97 - i * 0.03 - (i > 2 ? 0.02 : 0)));
      t.scale.set(1, 0.8, 1.25);
      foot.add(t);
    }
  }
  buildHands(rig, spec);
  buildHead(rig, spec);
  return rig;
}

function mergeSkinned(parts) {
  let nv = 0;
  let ni = 0;
  for (const p of parts) {
    nv += p.geo.attributes.position.count;
    ni += p.geo.index.count;
  }
  const pos = new Float32Array(nv * 3);
  const nrm = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const col = new Float32Array(nv * 3);
  const si = new Uint16Array(nv * 4);
  const sw = new Float32Array(nv * 4);
  const idx = new Uint32Array(ni);
  const geo = new THREE.BufferGeometry();
  let vo = 0;
  let io = 0;
  let gStart = 0;
  let gMat = parts.length ? parts[0].mat : 0;
  for (const p of parts) {
    const a = p.geo.attributes;
    const n = a.position.count;
    pos.set(a.position.array, vo * 3);
    nrm.set(a.normal.array, vo * 3);
    uv.set(a.uv.array, vo * 2);
    col.set(a.color.array, vo * 3);
    si.set(a.skinIndex.array, vo * 4);
    sw.set(a.skinWeight.array, vo * 4);
    if (p.mat !== gMat) {
      geo.addGroup(gStart, io - gStart, gMat);
      gStart = io;
      gMat = p.mat;
    }
    const ix = p.geo.index.array;
    for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i] + vo;
    io += ix.length;
    vo += n;
    p.geo.dispose();
  }
  geo.addGroup(gStart, io - gStart, gMat);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------- hands */
const GEO = new Map();
const cached = (k, f) => (GEO.has(k) ? GEO.get(k) : (GEO.set(k, f()), GEO.get(k)));
function buildHands(rig, spec) {
  const isHulk = rig.build === "hulk";
  const k = isHulk ? 1 : 0.34;
  const mat = spec.mats.hands || spec.mats.plain || spec.mats.skin;
  for (const [s, sx] of [["L", 1], ["R", -1]]) {
    const hand = rig.bones[`hand${s}`];
    const palm = new THREE.Mesh(
      cached(`palm${k}`, () => {
        const g2 = new THREE.SphereGeometry(1, 14, 10);
        g2.scale(0.15 * k, 0.15 * k, 0.085 * k);
        g2.translate(0, -0.11 * k, 0.005 * k);
        return g2;
      }),
      mat,
    );
    palm.castShadow = !!spec.shadows;
    hand.add(palm);
    for (let f = 0; f < 4; f++) {
      const base = new THREE.Group();
      base.position.set(sx * (0.09 - f * 0.06) * k, -0.22 * k, 0.02 * k);
      hand.add(base);
      const len = [0.1, 0.11, 0.105, 0.085][f] * k;
      const seg1 = new THREE.Mesh(cached(`f1${f}${k}`, () => new THREE.CapsuleGeometry(0.034 * k, len * 0.75, 3, 8).translate(0, -len / 2, 0)), mat);
      base.add(seg1);
      const mid = new THREE.Group();
      mid.position.y = -len;
      base.add(mid);
      const seg2 = new THREE.Mesh(cached(`f2${f}${k}`, () => new THREE.CapsuleGeometry(0.031 * k, len * 0.7, 3, 8).translate(0, -len * 0.45, 0)), mat);
      mid.add(seg2);
      seg1.castShadow = seg2.castShadow = !!spec.shadows && isHulk;
      rig.fingers[s].push({ base, mid });
    }
    const thumb = new THREE.Group();
    thumb.position.set(sx * 0.12 * k, -0.08 * k, 0.05 * k);
    thumb.rotation.set(0.6, 0, sx * 0.6);
    hand.add(thumb);
    thumb.add(new THREE.Mesh(cached(`th${k}`, () => new THREE.CapsuleGeometry(0.04 * k, 0.1 * k, 3, 8).translate(0, -0.07 * k, 0)), mat));
    rig.fingers[s].thumb = thumb;
  }
}

/* ---------------------------------------------------------------- head */
function buildHead(rig, spec) {
  const isHulk = rig.build === "hulk";
  const head = rig.bones.head;
  const M = spec.mats;
  const r = isHulk ? 0.235 : 0.112;
  const grp = new THREE.Group();
  head.add(grp);
  rig.headGroup = grp;
  // skull: lofted, heavy jaw + brow on the giant
  const HK = isHulk
    ? [
        { y: -0.02, rx: 0.45, rz: 0.4, oz: 0.42 },
        { y: 0.12, rx: 0.8, rz: 0.62, oz: 0.3 },
        { y: 0.3, rx: 0.93, rz: 0.82, oz: 0.16 },
        { y: 0.55, rx: 0.9, rz: 0.92, oz: 0.07 },
        { y: 0.85, rx: 0.9, rz: 0.98, oz: 0.02 },
        { y: 1.12, rx: 0.93, rz: 1.02, oz: 0.0 },
        { y: 1.4, rx: 0.86, rz: 0.96, oz: -0.05 },
        { y: 1.66, rx: 0.62, rz: 0.74, oz: -0.07 },
        { y: 1.82, rx: 0.24, rz: 0.3, oz: -0.06 },
      ]
    : [
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
  const key = `skull${isHulk}`;
  const skullGeo = cached(key, () => {
    const keys = HK.map((k2) => ({ y: k2.y * r, rx: k2.rx * r, rz: k2.rz * r, ox: 0, oz: k2.oz * r, p: 2.1 }));
    const bumps = isHulk
      ? (y, th) => {
          let b = 0;
          b += 0.09 * win(y, 1.02 * r, 1.14 * r, 0.04 * r) * g(th, FRONT, 0.9); // brow ridge
          b -= 0.06 * win(y, 0.86 * r, 0.98 * r, 0.03 * r) * (g(th, FRONT + 0.35, 0.18) + g(th, FRONT - 0.35, 0.18)); // eye sockets
          b += 0.06 * win(y, 0.62 * r, 0.82 * r, 0.05 * r) * (g(th, FRONT + 0.75, 0.3) + g(th, FRONT - 0.75, 0.3)); // cheekbones
          b += 0.05 * win(y, 0.05 * r, 0.3 * r, 0.06 * r) * (g(th, FRONT + 0.9, 0.4) + g(th, FRONT - 0.9, 0.4)); // jaw muscle
          return b;
        }
      : null;
    const arr = loftArrays(range(keys[0].y, keys[keys.length - 1].y, r * 0.06), (y) => interpKeys(keys, y), bumps, 30);
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute("position", new THREE.Float32BufferAttribute(arr.pos, 3));
    g2.setAttribute("uv", new THREE.Float32BufferAttribute(arr.uv, 2));
    g2.setAttribute("color", new THREE.Float32BufferAttribute(arr.col, 3));
    g2.setIndex(arr.idx);
    g2.computeVertexNormals();
    return g2;
  });
  const skull = new THREE.Mesh(skullGeo, M.head || M.skin);
  skull.position.y = isHulk ? -0.04 : -0.02;
  skull.castShadow = !!spec.shadows;
  grp.add(skull);
  const fy = skull.position.y;
  const fz = r * (isHulk ? 1.0 : 0.93);
  const eyeW = (M._eyeW = M._eyeW || new THREE.MeshStandardMaterial({ color: "#f1ecdf", roughness: 0.3 }));
  const iris = (M._iris = M._iris || new THREE.MeshStandardMaterial({ color: spec.eye || (isHulk ? "#3cff6a" : "#3a2a1c"), roughness: 0.2, emissive: isHulk ? "#1a7a2a" : "#000", emissiveIntensity: isHulk ? 0.6 : 0 }));
  rig.irisMat = iris;
  const browMat = M.hair || M.skin;
  const ez = isHulk ? 0.86 : 0.8;
  for (const sx of [1, -1]) {
    const eye = new THREE.Mesh(cached(`eye${isHulk}`, () => new THREE.SphereGeometry(r * 0.13, 12, 10)), eyeW);
    eye.position.set(sx * r * 0.32, fy + r * 0.92, r * ez);
    eye.scale.set(1, isHulk ? 0.62 : 0.72, 0.62);
    grp.add(eye);
    const ir = new THREE.Mesh(cached(`iris${isHulk}`, () => new THREE.SphereGeometry(r * 0.058, 10, 8)), iris);
    ir.position.set(sx * r * 0.31, fy + r * 0.92, r * (ez + 0.07));
    ir.scale.set(1, 1, 0.5);
    grp.add(ir);
    // heavy, angry brows (inner ends pulled down)
    const brow = new THREE.Mesh(cached(`brow${isHulk}`, () => new THREE.BoxGeometry(r * 0.46, r * (isHulk ? 0.12 : 0.06), r * 0.2)), isHulk ? M.skinDark || M.plain || M.skin : browMat);
    brow.position.set(sx * r * 0.3, fy + r * (isHulk ? 1.06 : 1.12), r * (isHulk ? 0.9 : 0.86));
    brow.rotation.z = sx * (isHulk ? 0.32 : -0.06);
    brow.rotation.x = -0.25;
    grp.add(brow);
    if (isHulk) {
      const hb = new THREE.Mesh(cached("hbrow", () => new THREE.BoxGeometry(r * 0.4, r * 0.055, r * 0.08)), M.hair);
      hb.position.set(sx * r * 0.3, fy + r * 1.12, r * 0.98);
      hb.rotation.z = sx * 0.34;
      grp.add(hb);
      // cheek mass under the eyes
      const ck = new THREE.Mesh(cached("cheek", () => new THREE.SphereGeometry(r * 0.2, 10, 8)), M.plain || M.skin);
      ck.scale.set(1, 0.7, 0.6);
      ck.position.set(sx * r * 0.42, fy + r * 0.66, r * 0.78);
      grp.add(ck);
    }
    const ear = new THREE.Mesh(cached(`ear${isHulk}`, () => new THREE.SphereGeometry(r * 0.2, 8, 6)), M.plain || M.head || M.skin);
    ear.scale.set(0.35, 1, 0.65);
    ear.position.set(sx * r * (isHulk ? 0.9 : 0.86), fy + r * 0.88, -r * 0.08);
    grp.add(ear);
  }
  // nose: bridge + broad bulb + nostril wings
  const nmat = M.plain || M.head || M.skin;
  const bridge = new THREE.Mesh(cached(`nbr${isHulk}`, () => new THREE.BoxGeometry(r * 0.13, r * 0.3, r * 0.12)), nmat);
  bridge.position.set(0, fy + r * 0.86, r * 0.95);
  bridge.rotation.x = -0.25;
  grp.add(bridge);
  const bulb = new THREE.Mesh(cached(`nbu${isHulk}`, () => new THREE.SphereGeometry(r * 0.13, 10, 8)), nmat);
  bulb.scale.set(isHulk ? 1.35 : 1, 0.95, 0.95);
  bulb.position.set(0, fy + r * 0.7, r * 1.02);
  grp.add(bulb);
  if (isHulk) {
    for (const sx of [1, -1]) {
      const wing = new THREE.Mesh(cached("nwing", () => new THREE.SphereGeometry(r * 0.08, 8, 6)), nmat);
      wing.position.set(sx * r * 0.13, fy + r * 0.66, r * 0.96);
      grp.add(wing);
    }
  }
  // mouth: snarl with teeth on the giant
  if (isHulk) {
    const mouthMat = (M._mouth = M._mouth || new THREE.MeshStandardMaterial({ color: "#2a0d0d", roughness: 0.8 }));
    const teeth = (M._teeth = M._teeth || new THREE.MeshStandardMaterial({ color: "#e9e2c8", roughness: 0.35 }));
    const lipM = M.skinDark || nmat;
    const mouth = new THREE.Mesh(cached("mouthH", () => new THREE.BoxGeometry(r * 0.5, r * 0.19, r * 0.1)), mouthMat);
    mouth.position.set(0, fy + r * 0.44, r * 0.97);
    grp.add(mouth);
    const t1 = new THREE.Mesh(cached("teethU", () => new THREE.BoxGeometry(r * 0.42, r * 0.055, r * 0.05)), teeth);
    t1.position.set(0, fy + r * 0.5, r * 1.0);
    grp.add(t1);
    const t2 = new THREE.Mesh(cached("teethL", () => new THREE.BoxGeometry(r * 0.38, r * 0.05, r * 0.05)), teeth);
    t2.position.set(0, fy + r * 0.385, r * 0.99);
    grp.add(t2);
    const ul = new THREE.Mesh(cached("lipU", () => new THREE.CapsuleGeometry(r * 0.045, r * 0.46, 3, 8).rotateZ(Math.PI / 2)), lipM);
    ul.position.set(0, fy + r * 0.555, r * 1.02);
    grp.add(ul);
    const ll = new THREE.Mesh(cached("lipL", () => new THREE.CapsuleGeometry(r * 0.05, r * 0.4, 3, 8).rotateZ(Math.PI / 2)), lipM);
    ll.position.set(0, fy + r * 0.335, r * 1.0);
    grp.add(ll);
    t2.userData.lip = ll;
    rig.jaw = t2;
    rig.lipL = ll;
    // short dark messy hair
    const hairGeo = cached("hairH", () => {
      const keys = [
        { y: 0.95 * r, rx: 0.97 * r, rz: 1.06 * r, oz: -0.02 * r },
        { y: 1.2 * r, rx: 0.99 * r, rz: 1.08 * r, oz: -0.02 * r },
        { y: 1.48 * r, rx: 0.92 * r, rz: 1.02 * r, oz: -0.05 * r },
        { y: 1.72 * r, rx: 0.68 * r, rz: 0.8 * r, oz: -0.07 * r },
        { y: 1.9 * r, rx: 0.24 * r, rz: 0.3 * r, oz: -0.06 * r },
      ];
      const arr = loftArrays(range(keys[0].y, keys[keys.length - 1].y, r * 0.06), (y) => interpKeys(keys, y), (y, th) => 0.07 * Math.max(0, Math.sin(th * 9 + y * 40)) * win(y, 1.2 * r, 1.9 * r, 0.1 * r), 30, { capBottom: false });
      // raise the hairline at the front (forehead), keep it low at the back
      const y0 = keys[0].y;
      const y1 = keys[keys.length - 1].y;
      for (let i = 0; i < arr.pos.length; i += 3) {
        const th = Math.atan2(arr.pos[i + 2], arr.pos[i]);
        const u = Math.min(1, Math.max(0, (arr.pos[i + 1] - y0) / (y1 - y0)));
        const front = Math.max(0, Math.sin(th));
        arr.pos[i + 1] += 0.36 * r * Math.pow(front, 1.4) * Math.pow(1 - u, 1.1) - 0.12 * r * Math.max(0, -Math.sin(th)) * (1 - u);
      }
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute("position", new THREE.Float32BufferAttribute(arr.pos, 3));
      g2.setIndex(arr.idx);
      g2.computeVertexNormals();
      return g2;
    });
    const hair = new THREE.Mesh(hairGeo, M.hair);
    hair.position.y = fy;
    hair.position.z = -0.01 * r;
    hair.castShadow = !!spec.shadows;
    grp.add(hair);
    // messy spiky clumps: a ring along the hairline + a crown tuft
    const HR = mulberry(77);
    for (let i = 0; i < 26; i++) {
      const ring = i < 16;
      const a = ring ? (i / 16) * Math.PI * 2 : HR() * Math.PI * 2;
      const rr = ring ? 0.98 : 0.2 + HR() * 0.5;
      const front = Math.max(0, Math.cos(a));
      const y = ring ? 1.38 + front * 0.1 - Math.max(0, -Math.cos(a)) * 0.3 : 1.82 + HR() * 0.1;
      const c = new THREE.Mesh(cached("clump", () => new THREE.ConeGeometry(r * 0.12, r * 0.36, 5)), M.hair);
      c.position.set(Math.sin(a) * r * rr, fy + r * y, Math.cos(a) * r * rr * 1.05);
      const tilt = ring ? 1.1 + HR() * 0.4 : 0.3 + HR() * 0.5;
      c.rotation.set(Math.cos(a) * tilt, HR() * 3, -Math.sin(a) * tilt);
      c.scale.setScalar(0.8 + HR() * 0.5);
      grp.add(c);
    }
  } else {
    const lips = (M._lips = M._lips || new THREE.MeshStandardMaterial({ color: "#8a4a40", roughness: 0.6 }));
    const mouth = new THREE.Mesh(cached("mouthM", () => new THREE.BoxGeometry(r * 0.36, r * 0.05, r * 0.08)), lips);
    mouth.position.set(0, fy + r * 0.46, fz - r * 0.08);
    grp.add(mouth);
    if (M.hair && !spec.helmet) {
      const hair = new THREE.Mesh(cached("hairM", () => {
        const keys = [
          { y: 0.95 * r, rx: 0.9 * r, rz: 1.0 * r, oz: -0.06 * r },
          { y: 1.2 * r, rx: 0.93 * r, rz: 1.04 * r, oz: -0.05 * r },
          { y: 1.48 * r, rx: 0.87 * r, rz: 0.99 * r, oz: -0.07 * r },
          { y: 1.74 * r, rx: 0.64 * r, rz: 0.77 * r, oz: -0.08 * r },
          { y: 1.92 * r, rx: 0.2 * r, rz: 0.26 * r, oz: -0.07 * r },
        ];
        const arr = loftArrays(range(keys[0].y, keys[keys.length - 1].y, r * 0.08), (y) => interpKeys(keys, y), null, 18, { capBottom: false });
        const g2 = new THREE.BufferGeometry();
        g2.setAttribute("position", new THREE.Float32BufferAttribute(arr.pos, 3));
        g2.setIndex(arr.idx);
        g2.computeVertexNormals();
        return g2;
      }), M.hair);
      hair.position.y = fy;
      hair.rotation.x = -0.12;
      grp.add(hair);
    }
  }
}

/* ================================================================ posing */
export const POSE = [
  "rootY", "rootX", "rootZ", "rootRX", "rootRY", "rootRZ",
  "hipRX", "hipRY", "hipRZ", "spRX", "spRY", "spRZ", "chRX", "chRY", "chRZ", "nkRX", "hdRX", "hdRY",
  "lClY", "lClZ", "lArX", "lArY", "lArZ", "lFoX", "lFoY", "lHaX", "lHaZ", "lGrip",
  "rClY", "rClZ", "rArX", "rArY", "rArZ", "rFoX", "rFoY", "rHaX", "rHaZ", "rGrip",
  "lThX", "lThY", "lThZ", "lShX", "lFtX", "rThX", "rThY", "rThZ", "rShX", "rFtX", "jaw",
];
export const zeroPose = () => Object.fromEntries(POSE.map((k) => [k, 0]));
export function blendPose(cur, target, rate, dt) {
  const k = 1 - Math.exp(-rate * dt);
  for (const key of POSE) cur[key] += ((target[key] || 0) - cur[key]) * k;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
function setRot(b, x, y, z, order = "XYZ") {
  _e.set(x, y, z, order);
  _q.setFromEuler(_e);
  b.quaternion.copy(b.userData.restQ).multiply(_q);
}
/**
 * Angle conventions (both sides mirrored so +ArZ always raises the arm OUT):
 *   ArX  + swings the arm BACK, − forward     FoX  − bends the elbow (forearm forward)
 *   ThX  − lifts the thigh forward            ShX  + bends the knee
 *   Grip 0 relaxed … 1 fist, < 0 open palm
 */
export function applyPose(rig, c) {
  const B = rig.bones;
  const P = rig.P;
  B.root.position.set(c.rootX, c.rootY, c.rootZ);
  setRot(B.root, c.rootRX, c.rootRY, c.rootRZ, "YXZ");
  setRot(B.hips, c.hipRX, c.hipRY, c.hipRZ);
  setRot(B.spine, c.spRX, c.spRY, c.spRZ);
  setRot(B.chest, c.chRX, c.chRY, c.chRZ);
  setRot(B.neck, c.nkRX, 0, 0);
  setRot(B.head, c.hdRX, c.hdRY, 0);
  for (const [s, sx] of [["l", 1], ["r", -1]]) {
    const S = s === "l" ? "L" : "R";
    setRot(B[`clav${S}`], 0, c[`${s}ClY`] * sx, c[`${s}ClZ`] * sx);
    setRot(B[`arm${S}`], c[`${s}ArX`], c[`${s}ArY`] * sx, c[`${s}ArZ`] * sx, "ZXY");
    setRot(B[`fore${S}`], c[`${s}FoX`], c[`${s}FoY`] * sx, 0);
    setRot(B[`hand${S}`], c[`${s}HaX`], 0, c[`${s}HaZ`] * sx);
    setRot(B[`thigh${S}`], c[`${s}ThX`], c[`${s}ThY`] * sx, c[`${s}ThZ`] * sx, "ZXY");
    setRot(B[`shin${S}`], c[`${s}ShX`], 0, 0);
    setRot(B[`foot${S}`], c[`${s}FtX`], 0, 0);
    const F = rig.fingers[S];
    const k = 0.35 + c[`${s}Grip`];
    for (let i = 0; i < F.length; i++) {
      F[i].base.rotation.x = Math.min(0.15, -(k * 1.3 + i * 0.03));
      F[i].mid.rotation.x = Math.min(0, -k * 1.5);
    }
    if (F.thumb) F.thumb.rotation.x = 0.6 + Math.max(0, k) * 0.7;
  }
  if (rig.jaw) {
    if (rig.jaw.userData.y0 == null) rig.jaw.userData.y0 = rig.jaw.position.y;
    rig.jaw.position.y = rig.jaw.userData.y0 - c.jaw * 0.05;
    if (rig.lipL) {
      if (rig.lipL.userData.y0 == null) rig.lipL.userData.y0 = rig.lipL.position.y;
      rig.lipL.position.y = rig.lipL.userData.y0 - c.jaw * 0.06;
    }
  }
  void P;
}

export function disposeRig(rig) {
  for (const g2 of rig.geos) g2.dispose();
}
export function disposeRigCache() {
  for (const g2 of GEO.values()) g2.dispose();
  GEO.clear();
  disposeRigTextures();
}
export { _v };
