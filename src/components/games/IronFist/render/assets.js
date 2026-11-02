/**
 * Fighter assets: the CC0 Quaternius male / female bodies already bundled in
 * /public/models/neon-mercenary (see LICENSE-Quaternius-CC0.txt there) plus
 * their dark-skin albedo textures. Every fighting clip is authored in code
 * (clips.js) and baked once per body. Loading is memoised; rigs are cloned.
 *
 * Body landmarks (shoulder / elbow / wrist / neck / pelvis / knee / ankle in
 * the T-pose bind space) and torso / head cross-sections are measured here so
 * costumes adapt to either body.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildClips } from "./clips.js";

const DIR = `${import.meta.env?.BASE_URL || "/"}models/neon-mercenary/`;
let promise = null;

function landmarks(scene) {
  scene.updateMatrixWorld(true);
  const P = {};
  scene.traverse((o) => {
    if (o.isBone) P[o.name] = o.getWorldPosition(new THREE.Vector3());
  });
  const body = [];
  scene.traverse((o) => o.isSkinnedMesh && /superhero/i.test(o.name) && body.push(o));
  const geo = body[0].geometry;
  let eye = { y: P.Head.y + 0.095, z: 0.08 };
  scene.traverse((o) => {
    if (o.isMesh && o.name === "Eyes") {
      const bb = o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox);
      eye = { y: (bb.min.y + bb.max.y) / 2, z: bb.max.z };
    }
  });
  const pos = geo.attributes.position;
  /** Ellipse of the torso/head cross-section at height y (|x| < xMax). */
  const section = (y, xMax = 0.3, band = 0.012) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const vy = pos.getY(i);
      const vx = pos.getX(i);
      if (Math.abs(vy - y) > band || Math.abs(vx) > xMax) continue;
      const vz = pos.getZ(i);
      if (vx < x0) x0 = vx;
      if (vx > x1) x1 = vx;
      if (vz < z0) z0 = vz;
      if (vz > z1) z1 = vz;
    }
    if (!Number.isFinite(x0)) return { cx: 0, cz: 0, rx: 0.1, rz: 0.1 };
    return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2 };
  };
  /** Cross-section of an arm (T-pose, along X) at distance x from the centre. */
  const armSection = (x, band = 0.012) => {
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      if (Math.abs(vx - x) > band) continue;
      const vy = pos.getY(i);
      if (vy < 1.2 || vy > 1.7) continue;
      const vz = pos.getZ(i);
      if (vy < y0) y0 = vy;
      if (vy > y1) y1 = vy;
      if (vz < z0) z0 = vz;
      if (vz > z1) z1 = vz;
    }
    return { cy: (y0 + y1) / 2, cz: (z0 + z1) / 2, ry: (y1 - y0) / 2, rz: (z1 - z0) / 2 };
  };
  /** Cross-section of the left leg at height y. */
  const legSection = (y, band = 0.012) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const vy = pos.getY(i);
      const vx = pos.getX(i);
      if (Math.abs(vy - y) > band || vx < 0.0 || vx > 0.3) continue;
      const vz = pos.getZ(i);
      if (vx < x0) x0 = vx;
      if (vx > x1) x1 = vx;
      if (vz < z0) z0 = vz;
      if (vz > z1) z1 = vz;
    }
    return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2 };
  };
  return {
    neck: P.neck_01.y,
    head: P.Head.y,
    shoulder: P.upperarm_l.x,
    elbow: P.lowerarm_l.x,
    wrist: P.hand_l.x,
    armY: P.hand_l.y,
    pelvis: P.pelvis.y,
    knee: P.calf_l.y,
    ankle: P.foot_l.y,
    hipX: P.thigh_l.x,
    eye,
    top: geo.boundingBox ? geo.boundingBox.max.y : 1.8,
    bones: P,
    section,
    armSection,
    legSection,
  };
}

export function loadAssets(onProgress) {
  if (promise) return promise;
  const loader = new GLTFLoader();
  const parts = { m: 0, f: 0 };
  const report = () => onProgress?.((parts.m + parts.f) / 2);
  const track = (k) => (e) => {
    if (e.total) parts[k] = e.loaded / e.total;
    report();
  };
  const tex = (n) =>
    new THREE.TextureLoader().loadAsync(`${DIR}${n}`).then((t) => {
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
  promise = Promise.all([loader.loadAsync(`${DIR}male.glb`, track("m")), loader.loadAsync(`${DIR}female.glb`, track("f")), tex("m_dark.jpg"), tex("f_dark.jpg")])
    .then(([male, female, mDark, fDark]) => {
      parts.m = parts.f = 1;
      report();
      const out = { bodies: { m: male, f: female }, dark: { m: mDark, f: fDark }, clips: {}, land: {} };
      for (const [k, g] of Object.entries(out.bodies)) {
        g.scene.traverse((o) => o.isMesh && o.geometry.computeBoundingBox());
        out.land[k] = landmarks(g.scene);
        out.clips[k] = buildClips(g.scene);
      }
      return out;
    })
    .catch((err) => {
      promise = null; // allow a retry
      throw err;
    });
  return promise;
}

export { landmarks };
