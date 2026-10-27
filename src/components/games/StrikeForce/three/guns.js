/**
 * Strike Force — procedural models for the 12 original weapons.
 *
 * Local space: metres, +y up, the muzzle points along -z, the trigger sits
 * near the origin. Parts are merged per material; moving parts (magazine,
 * bolt / slide / pump / cylinder) are separate groups so the viewmodel can
 * animate them. Anchors (Object3D under the root):
 *   muzzle  flash origin        eject  shell ejection port
 *   grip    right hand          fore   left hand
 *   sight   point on the sight line the eye looks through (ADS alignment)
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const shared = { mats: null };
export function gunMaterials() {
  if (shared.mats) return shared.mats;
  const mk = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  shared.mats = {
    metal: mk({ color: "#ffffff", roughness: 0.36, metalness: 0.85, side: THREE.DoubleSide }),
    poly: mk({ color: "#ffffff", roughness: 0.62, metalness: 0.05 }),
    wood: mk({ color: "#ffffff", roughness: 0.5, metalness: 0 }),
    glass: new THREE.MeshStandardMaterial({ color: "#9fd0e6", roughness: 0.03, metalness: 0.2, transparent: true, opacity: 0.16, envMapIntensity: 1.2, depthWrite: false, side: THREE.DoubleSide }),
    lens: new THREE.MeshStandardMaterial({ color: "#0d1a22", roughness: 0.02, metalness: 0.9, envMapIntensity: 2.4 }),
    glowRed: new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff2a1e").multiplyScalar(3), toneMapped: false }),
    glowGreen: new THREE.MeshBasicMaterial({ color: new THREE.Color("#39ff6a").multiplyScalar(2.6), toneMapped: false }),
    brass: new THREE.MeshStandardMaterial({ color: "#c9a14a", roughness: 0.3, metalness: 1 }),
  };
  return shared.mats;
}
export function disposeGunMaterials() {
  if (!shared.mats) return;
  for (const m of Object.values(shared.mats)) m.dispose();
  shared.mats = null;
}

const COL = {
  black: "#232427",
  gun: "#2d3034",
  steel: "#80868c",
  dark: "#141516",
  tan: "#a68e66",
  od: "#58603f",
  grey: "#585d63",
  wood: "#6e4526",
  woodL: "#8a5a33",
  white: "#d9dadb",
};

/** collects geometries per material for one part group */
function kit() {
  const lists = {};
  const push = (mat, g, color) => {
    if (color) {
      const c = new THREE.Color(color);
      const n = g.attributes.position.count;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        a[i * 3] = c.r;
        a[i * 3 + 1] = c.g;
        a[i * 3 + 2] = c.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    }
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (!["position", "normal", "color"].includes(k)) ng.deleteAttribute(k);
    if (!ng.attributes.color) {
      const a = new Float32Array(ng.attributes.position.count * 3).fill(1);
      ng.setAttribute("color", new THREE.BufferAttribute(a, 3));
    }
    (lists[mat] ||= []).push(ng);
  };
  const K = {
    box(mat, color, x0, y0, z0, x1, y1, z1) {
      const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      push(mat, g, color);
    },
    /** side profile [z, y] extruded along x by width w (centred at x) */
    prof(mat, color, pts, w, x = 0, bevel = 0.002) {
      const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, w - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
      g.translate(0, 0, -w / 2 + bevel);
      g.rotateY(-Math.PI / 2);
      g.translate(x, 0, 0);
      push(mat, g, color);
    },
    /** cylinder along z from z0 to z1 */
    cyl(mat, color, r, z0, z1, y = 0, x = 0, seg = 14, r2 = r, open = false) {
      const g = new THREE.CylinderGeometry(r2, r, Math.abs(z1 - z0), seg, 1, open);
      g.rotateX(Math.PI / 2);
      g.translate(x, y, (z0 + z1) / 2);
      push(mat, g, color);
    },
    /** cylinder along y */
    cylY(mat, color, r, y0, y1, z = 0, x = 0, seg = 12) {
      const g = new THREE.CylinderGeometry(r, r, Math.abs(y1 - y0), seg);
      g.translate(x, (y0 + y1) / 2, z);
      push(mat, g, color);
    },
    /** cylinder along x */
    cylX(mat, color, r, x0, x1, y = 0, z = 0, seg = 10) {
      const g = new THREE.CylinderGeometry(r, r, Math.abs(x1 - x0), seg);
      g.rotateZ(Math.PI / 2);
      g.translate((x0 + x1) / 2, y, z);
      push(mat, g, color);
    },
    /** picatinny rail on top: z0 → z1 at height y */
    rail(color, z0, z1, y, w = 0.022) {
      K.box("metal", color, -w / 2, y, z0, w / 2, y + 0.006, z1);
      const n = Math.floor(Math.abs(z1 - z0) / 0.01);
      for (let k = 0; k < n; k += 1) {
        const z = Math.min(z0, z1) + k * 0.01 + 0.002;
        K.box("metal", color, -w / 2 - 0.001, y + 0.006, z, w / 2 + 0.001, y + 0.01, z + 0.005);
      }
    },
    torus(mat, color, r, t, z, y, axis = "z") {
      const g = new THREE.TorusGeometry(r, t, 6, 16);
      if (axis === "x") g.rotateY(Math.PI / 2);
      g.translate(0, y, z);
      push(mat, g, color);
    },
    lists,
  };
  return K;
}

function meshesFrom(K, mats, shadow) {
  const group = new THREE.Group();
  for (const [mat, list] of Object.entries(K.lists)) {
    if (!list.length) continue;
    const g = mergeGeometries(list, false);
    for (const x of list) x.dispose();
    const m = new THREE.Mesh(g, mats[mat]);
    m.castShadow = shadow;
    m.receiveShadow = false;
    group.add(m);
  }
  return group;
}

/* ------------------------------------------------------------------ shared sub-assemblies */
function holoSight(K, z, y) {
  K.box("metal", COL.black, -0.017, y, z - 0.07, 0.017, y + 0.012, z + 0.03);
  for (const s of [-1, 1]) K.box("metal", COL.black, s * 0.02 - 0.003, y + 0.012, z - 0.075, s * 0.02 + 0.003, y + 0.06, z + 0.0);
  K.box("metal", COL.black, -0.023, y + 0.056, z - 0.075, 0.023, y + 0.063, z - 0.0);
  K.box("metal", COL.black, -0.012, y + 0.012, z - 0.004, 0.012, y + 0.022, z + 0.025);
  K.box("glass", null, -0.017, y + 0.015, z - 0.068, 0.017, y + 0.054, z - 0.066);
  K.reticleZ = z - 0.0695;
  return y + 0.036; // sight line
}
function redDot(K, z, y, r = 0.016) {
  K.box("metal", COL.black, -0.012, y, z - 0.03, 0.012, y + 0.014, z + 0.02);
  K.cyl("metal", COL.black, r + 0.004, z - 0.045, z + 0.02, y + 0.018 + r, 0, 18, r + 0.004, true);
  K.cyl("metal", COL.black, r + 0.002, z - 0.045, z + 0.02, y + 0.018 + r, 0, 18, r + 0.002, true);
  K.torus("metal", COL.black, r + 0.003, 0.0015, z - 0.045, y + 0.018 + r, "z");
  K.torus("metal", COL.black, r + 0.003, 0.0015, z + 0.02, y + 0.018 + r, "z");
  K.cyl("glass", null, r, z - 0.0455, z - 0.044, y + 0.018 + r, 0, 18);
  K.box("metal", COL.black, 0.016, y + 0.02 + r, z - 0.02, 0.026, y + 0.032 + r, z - 0.005);
  K.reticleZ = z - 0.047;
  return y + 0.018 + r;
}
function scope(K, z, y, len = 0.3, r = 0.022, bell = 0.03, clear = false) {
  // rings
  for (const dz of [z - len * 0.25, z + len * 0.2]) {
    K.box("metal", COL.black, -0.012, y, dz - 0.012, 0.012, y + 0.02, dz + 0.012);
    K.torus("metal", COL.black, r + 0.004, 0.005, dz, y + 0.02 + r, "z");
  }
  const cy = y + 0.02 + r;
  K.cyl("metal", COL.black, r, z - len * 0.35, z + len * 0.3, cy, 0, 20, r, clear);
  K.cyl("metal", COL.black, bell, z - len * 0.62, z - len * 0.38, cy, 0, 22, r, clear);
  K.cyl("metal", COL.black, bell, z - len * 0.65, z - len * 0.62, cy, 0, 22, bell, clear);
  K.cyl("metal", COL.black, r + 0.006, z + len * 0.3, z + len * 0.48, cy, 0, 20, r, clear);
  K.cyl("metal", COL.black, r + 0.006, z + len * 0.48, z + len * 0.52, cy, 0, 20, r + 0.006, clear);
  K.cyl(clear ? "glass" : "lens", null, bell - 0.004, z - len * 0.652, z - len * 0.645, cy, 0, 22);
  if (!clear) K.cyl("lens", null, r + 0.002, z + len * 0.515, z + len * 0.522, cy, 0, 20);
  K.reticleZ = z - len * 0.3;
  // turrets
  K.cylY("metal", COL.black, 0.009, cy + r, cy + r + 0.018, z - len * 0.05, 0, 12);
  K.cylX("metal", COL.black, 0.009, r, r + 0.018, cy, z - len * 0.05, 12);
  return cy;
}
function stockTube(K, z0, z1, y, color = COL.black) {
  K.cyl("metal", color, 0.014, z0, z1, y, 0, 12);
}
function arGrip(K, color, z = 0.0) {
  K.prof(
    "poly",
    color,
    [
      [z + 0.0, -0.025],
      [z + 0.03, -0.025],
      [z + 0.062, -0.125],
      [z + 0.06, -0.135],
      [z + 0.03, -0.138],
      [z + 0.008, -0.05],
    ],
    0.03,
  );
}
function triggerGuard(K, z0 = -0.05, z1 = 0.0, y = -0.03) {
  K.box("metal", COL.black, -0.004, y - 0.042, z0, 0.004, y - 0.036, z1);
  K.box("metal", COL.black, -0.004, y - 0.04, z0 - 0.004, 0.004, y, z0);
  K.box("metal", COL.steel, -0.003, y - 0.03, z0 + 0.026, 0.003, y, z0 + 0.032);
}
function curvedMag(K, color, z, top, len = 0.19, curve = 0.06, w = 0.026, d = 0.065) {
  const pts = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([z - d / 2 - curve * t * t, top - len * t]);
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    pts.push([z + d / 2 - curve * t * t * 0.8, top - len * t + (i === n ? 0.012 : 0)]);
  }
  K.prof("poly", color, pts, w);
  K.prof("poly", COL.dark, [[z - d / 2 - curve - 0.004, top - len - 0.004], [z + d / 2 - curve * 0.8 + 0.004, top - len + 0.008], [z + d / 2 - curve * 0.8 + 0.004, top - len + 0.018], [z - d / 2 - curve - 0.004, top - len + 0.01]], w + 0.004);
}

/* ------------------------------------------------------------------ the 12 */
const BUILD = {
  vx9(P) {
    const { body: K, mag, bolt } = P;
    // upper + lower receiver
    K.prof("metal", COL.gun, [[-0.2, -0.004], [0.11, -0.004], [0.11, 0.05], [-0.2, 0.05]], 0.05);
    K.prof("metal", COL.gun, [[-0.12, -0.03], [0.1, -0.03], [0.11, -0.004], [-0.12, -0.004]], 0.046);
    K.prof("metal", COL.gun, [[-0.12, -0.055], [-0.05, -0.055], [-0.05, -0.03], [-0.12, -0.03]], 0.04);
    K.rail(COL.black, -0.2, 0.1, 0.05);
    K.box("metal", COL.dark, 0.0255, 0.004, -0.07, 0.027, 0.032, 0.0);
    K.box("metal", COL.black, -0.012, 0.035, 0.1, 0.012, 0.045, 0.125);
    // handguard (octagonal)
    K.cyl("poly", COL.black, 0.033, -0.2, -0.52, 0.022, 0, 8);
    for (let z = -0.25; z > -0.5; z -= 0.06) for (const s of [-1, 1]) K.box("poly", COL.dark, s * 0.031 - 0.003, 0.015, z - 0.025, s * 0.031 + 0.003, 0.03, z);
    K.rail(COL.black, -0.22, -0.5, 0.055);
    // barrel + flash hider + gas block
    K.cyl("metal", COL.gun, 0.009, -0.52, -0.6, 0.022);
    K.cyl("metal", COL.black, 0.014, -0.6, -0.65, 0.022, 0, 10);
    K.box("metal", COL.black, -0.01, 0.03, -0.53, 0.01, 0.05, -0.51);
    // stock
    stockTube(K, 0.11, 0.3, 0.025);
    K.prof("poly", COL.tan, [[0.17, 0.045], [0.3, 0.05], [0.33, 0.042], [0.335, -0.075], [0.31, -0.085], [0.24, -0.03], [0.17, -0.01]], 0.042);
    K.box("poly", COL.dark, -0.023, -0.085, 0.31, 0.023, 0.05, 0.338);
    arGrip(K, COL.tan);
    triggerGuard(K);
    const sightY = holoSight(K, -0.05, 0.06);
    curvedMag(mag, COL.black, -0.085, -0.03, 0.19, 0.055);
    bolt.box("metal", COL.steel, 0.026, 0.006, -0.065, 0.03, 0.03, -0.005);
    return { sightY, sightZ: 0.07, muzzle: [0, 0.022, -0.66], eject: [0.03, 0.02, -0.035], grip: [0, -0.06, 0.035], fore: [0, -0.012, -0.38], magPos: [0, -0.1, -0.09], reticle: "holo" };
  },
  k7(P) {
    const { body: K, mag, bolt } = P;
    K.prof("metal", COL.gun, [[-0.22, -0.01], [0.09, -0.01], [0.09, 0.048], [-0.04, 0.055], [-0.22, 0.05]], 0.054);
    K.prof("metal", COL.gun, [[-0.13, -0.04], [0.08, -0.04], [0.09, -0.01], [-0.13, -0.01]], 0.05);
    K.rail(COL.black, -0.2, 0.06, 0.055);
    // wooden handguard + stock
    K.prof("wood", COL.wood, [[-0.22, -0.035], [-0.5, -0.025], [-0.52, 0.0], [-0.52, 0.045], [-0.22, 0.048]], 0.058, 0, 0.005);
    for (let z = -0.27; z > -0.48; z -= 0.045) for (const s of [-1, 1]) K.box("wood", "#3f2715", s * 0.029 - 0.003, 0.006, z - 0.022, s * 0.029 + 0.003, 0.03, z);
    K.cyl("metal", COL.gun, 0.011, -0.52, -0.66, 0.022);
    K.cyl("metal", COL.black, 0.018, -0.66, -0.72, 0.022, 0, 8);
    for (let z = -0.67; z > -0.715; z -= 0.016) for (const s of [-1, 1]) K.box("metal", COL.dark, s * 0.016 - 0.004, 0.014, z - 0.007, s * 0.016 + 0.004, 0.03, z);
    K.box("metal", COL.black, -0.004, 0.04, -0.64, 0.004, 0.07, -0.63);
    K.prof("wood", COL.woodL, [[0.09, 0.045], [0.36, 0.035], [0.37, 0.02], [0.37, -0.1], [0.34, -0.11], [0.2, -0.06], [0.09, -0.04]], 0.046, 0, 0.004);
    K.box("poly", COL.dark, -0.024, -0.11, 0.355, 0.024, 0.037, 0.375);
    K.prof("wood", COL.wood, [[0.0, -0.035], [0.035, -0.035], [0.07, -0.135], [0.04, -0.145], [0.01, -0.06]], 0.032, 0, 0.003);
    triggerGuard(K, -0.06, -0.005, -0.04);
    K.box("metal", COL.black, 0.027, 0.03, -0.05, 0.06, 0.038, -0.04);
    const sightY = redDot(K, -0.08, 0.065);
    mag.prof("metal", COL.black, [[-0.115, -0.04], [-0.05, -0.04], [-0.06, -0.2], [-0.13, -0.205]], 0.03);
    mag.box("metal", COL.dark, -0.017, -0.21, -0.14, 0.017, -0.198, -0.055);
    bolt.box("metal", COL.steel, 0.028, 0.0, -0.08, 0.031, 0.032, -0.02);
    return { sightY, sightZ: 0.15, muzzle: [0, 0.022, -0.73], eject: [0.032, 0.015, -0.05], grip: [0, -0.07, 0.03], fore: [0, -0.03, -0.37], magPos: [0, -0.12, -0.09], reticle: "dot" };
  },
  m12(P) {
    const { body: K, mag, bolt } = P;
    // bullpup: long body, grip forward, mag behind grip
    K.prof("poly", COL.od, [[-0.32, -0.04], [0.28, -0.05], [0.31, -0.03], [0.31, 0.04], [0.15, 0.055], [-0.32, 0.05]], 0.06, 0, 0.006);
    K.prof("poly", COL.od, [[0.15, -0.05], [0.29, -0.06], [0.3, -0.13], [0.26, -0.135], [0.2, -0.06]], 0.05, 0, 0.004);
    K.box("poly", COL.dark, -0.032, -0.01, -0.3, 0.032, 0.035, -0.05);
    K.box("poly", COL.black, -0.03, 0.04, 0.12, 0.03, 0.065, 0.28);
    K.cyl("metal", COL.gun, 0.012, -0.32, -0.5, 0.012);
    K.cyl("metal", COL.black, 0.017, -0.5, -0.56, 0.012, 0, 6);
    K.prof("poly", COL.black, [[-0.32, -0.04], [-0.26, -0.04], [-0.26, -0.03], [-0.32, -0.02]], 0.064);
    // forward grip
    K.prof("poly", COL.od, [[-0.03, -0.04], [0.0, -0.04], [0.035, -0.14], [0.01, -0.15], [-0.02, -0.06]], 0.03, 0, 0.003);
    triggerGuard(K, -0.06, -0.01, -0.04);
    K.rail(COL.black, -0.2, 0.08, 0.05);
    const sightY = scope(K, -0.05, 0.056, 0.17, 0.018, 0.024, true);
    mag.prof("poly", COL.black, [[0.08, -0.04], [0.14, -0.04], [0.15, -0.2], [0.09, -0.2]], 0.026);
    mag.box("poly", COL.dark, -0.016, -0.212, 0.085, 0.016, -0.2, 0.155);
    bolt.box("metal", COL.steel, 0.032, 0.0, 0.08, 0.035, 0.026, 0.13);
    return { sightY, sightZ: 0.15, muzzle: [0, 0.012, -0.565], eject: [0.034, 0.012, 0.1], grip: [0, -0.07, 0.0], fore: [0, -0.04, -0.2], magPos: [0, -0.12, 0.115], reticle: "optic", optic: 1.9 };
  },
  wasp(P) {
    const { body: K, mag, bolt } = P;
    K.prof("metal", COL.black, [[-0.2, -0.035], [0.08, -0.035], [0.08, 0.04], [-0.2, 0.04]], 0.05, 0, 0.004);
    K.rail(COL.black, -0.19, 0.07, 0.04);
    K.box("poly", COL.tan, -0.027, -0.03, -0.2, 0.027, 0.03, -0.1);
    K.cyl("metal", COL.gun, 0.009, -0.2, -0.27, 0.01);
    K.cyl("metal", COL.black, 0.018, -0.27, -0.32, 0.01, 0, 6);
    for (let z = -0.275; z > -0.315; z -= 0.012) K.box("metal", COL.dark, -0.006, 0.022, z - 0.006, 0.006, 0.03, z);
    // vertical foregrip
    K.prof("poly", COL.tan, [[-0.17, -0.035], [-0.14, -0.035], [-0.145, -0.13], [-0.165, -0.135]], 0.028, 0, 0.003);
    // folding wire stock
    for (const s of [-1, 1]) K.box("metal", COL.black, s * 0.02 - 0.004, -0.02, 0.08, s * 0.02 + 0.004, -0.012, 0.29);
    K.box("metal", COL.black, -0.024, -0.08, 0.28, 0.024, -0.012, 0.295);
    K.box("poly", COL.dark, -0.026, -0.085, 0.29, 0.026, -0.005, 0.305);
    arGrip(K, COL.black, 0.0);
    triggerGuard(K, -0.055, 0, -0.035);
    K.box("metal", COL.black, -0.004, 0.04, 0.05, 0.004, 0.065, 0.065);
    K.box("metal", COL.black, -0.004, 0.04, -0.17, 0.004, 0.062, -0.16);
    mag.prof("metal", COL.black, [[-0.085, -0.035], [-0.05, -0.035], [-0.05, -0.27], [-0.085, -0.27]], 0.022);
    bolt.box("metal", COL.steel, -0.008, 0.04, -0.03, 0.008, 0.05, 0.01);
    return { sightY: 0.063, sightZ: 0.16, muzzle: [0, 0.01, -0.325], eject: [0.03, 0.01, -0.03], grip: [0, -0.06, 0.035], fore: [0, -0.08, -0.155], magPos: [0, -0.14, -0.068], reticle: "iron" };
  },
  viper(P) {
    const { body: K, mag, bolt } = P;
    K.prof("metal", COL.grey, [[-0.16, -0.03], [0.09, -0.03], [0.09, 0.035], [-0.16, 0.035]], 0.046, 0, 0.004);
    K.rail(COL.black, -0.15, 0.08, 0.035);
    // integral suppressor
    K.cyl("metal", COL.black, 0.028, -0.16, -0.48, 0.005, 0, 18);
    for (let z = -0.2; z > -0.46; z -= 0.035) K.torus("metal", COL.dark, 0.0285, 0.002, z, 0.005, "z");
    K.cyl("metal", COL.dark, 0.022, -0.48, -0.486, 0.005, 0, 18);
    // skeleton stock
    K.prof("poly", COL.black, [[0.09, 0.03], [0.3, 0.025], [0.31, -0.075], [0.29, -0.08], [0.27, -0.01], [0.12, 0.0], [0.09, -0.01]], 0.02);
    K.prof("poly", COL.black, [[0.12, -0.02], [0.27, -0.03], [0.27, -0.04], [0.13, -0.035]], 0.016);
    arGrip(K, COL.black);
    triggerGuard(K, -0.055, 0, -0.03);
    const sightY = redDot(K, -0.03, 0.045, 0.014);
    mag.prof("metal", COL.black, [[-0.09, -0.03], [-0.055, -0.03], [-0.065, -0.22], [-0.1, -0.22]], 0.024);
    bolt.box("metal", COL.steel, 0.024, 0.0, -0.06, 0.027, 0.025, -0.02);
    return { sightY, sightZ: 0.17, muzzle: [0, 0.005, -0.49], eject: [0.028, 0.012, -0.04], grip: [0, -0.055, 0.035], fore: [0, -0.024, -0.3], magPos: [0, -0.12, -0.075], reticle: "dot" };
  },
  longbow(P) {
    const { body: K, mag, bolt } = P;
    // chassis
    K.prof("metal", COL.od, [[-0.32, -0.03], [0.1, -0.035], [0.1, 0.032], [-0.32, 0.032]], 0.056, 0, 0.004);
    K.prof("poly", COL.od, [[-0.32, -0.04], [-0.62, -0.03], [-0.63, 0.0], [-0.63, 0.03], [-0.32, 0.034]], 0.062, 0, 0.005);
    for (let z = -0.36; z > -0.6; z -= 0.05) for (const s of [-1, 1]) K.box("poly", COL.dark, s * 0.031 - 0.003, -0.01, z - 0.03, s * 0.031 + 0.003, 0.016, z);
    // fluted heavy barrel + big brake
    K.cyl("metal", COL.gun, 0.016, -0.63, -0.98, 0.012, 0, 12);
    K.prof("metal", COL.black, [[-0.98, -0.012], [-1.07, -0.012], [-1.07, 0.04], [-0.98, 0.04]], 0.05, 0, 0.003);
    for (const z of [-1.0, -1.025, -1.05]) for (const s of [-1, 1]) K.box("metal", COL.dark, s * 0.025 - 0.003, -0.005, z - 0.012, s * 0.025 + 0.003, 0.033, z);
    // bipod (folded)
    for (const s of [-1, 1]) K.box("metal", COL.black, s * 0.018 - 0.005, -0.06, -0.6, s * 0.018 + 0.005, -0.045, -0.36);
    K.box("metal", COL.black, -0.025, -0.05, -0.62, 0.025, -0.03, -0.59);
    // stock with cheek riser + monopod
    K.prof("poly", COL.od, [[0.1, 0.03], [0.42, 0.025], [0.44, 0.0], [0.44, -0.12], [0.4, -0.13], [0.36, -0.05], [0.17, -0.045], [0.1, -0.04]], 0.05, 0, 0.004);
    K.box("poly", COL.black, -0.022, 0.03, 0.2, 0.022, 0.06, 0.36);
    K.box("poly", COL.dark, -0.028, -0.135, 0.425, 0.028, 0.03, 0.445);
    K.prof("poly", COL.black, [[0.0, -0.035], [0.04, -0.035], [0.075, -0.14], [0.05, -0.15], [0.015, -0.06]], 0.032, 0, 0.003);
    triggerGuard(K, -0.06, -0.005, -0.035);
    K.rail(COL.black, -0.25, 0.08, 0.032);
    const sightY = scope(K, -0.08, 0.04, 0.36, 0.024, 0.034);
    mag.prof("metal", COL.black, [[-0.13, -0.035], [-0.05, -0.035], [-0.05, -0.12], [-0.13, -0.12]], 0.034);
    // bolt with handle (rotates/slides)
    bolt.cyl("metal", COL.steel, 0.012, -0.08, 0.06, 0.018, 0.0, 10);
    bolt.box("metal", COL.steel, 0.0, 0.012, 0.035, 0.07, 0.022, 0.045);
    bolt.cylY("metal", COL.black, 0.012, 0.0, 0.025, 0.04, 0.075, 10);
    return { sightY, sightZ: 0.14, muzzle: [0, 0.014, -1.08], eject: [0.032, 0.02, -0.04], grip: [0, -0.07, 0.045], fore: [0, -0.04, -0.4], magPos: [0, -0.08, -0.09], reticle: "scope", boltHandle: true };
  },
  hawkeye(P) {
    const { body: K, mag, bolt } = P;
    K.prof("metal", COL.grey, [[-0.22, -0.006], [0.12, -0.006], [0.12, 0.05], [-0.22, 0.05]], 0.052);
    K.prof("metal", COL.grey, [[-0.13, -0.04], [0.11, -0.04], [0.12, -0.006], [-0.13, -0.006]], 0.048);
    K.cyl("metal", COL.black, 0.034, -0.22, -0.6, 0.022, 0, 10);
    for (let z = -0.26; z > -0.58; z -= 0.05) for (const s of [-1, 1]) K.box("metal", COL.dark, s * 0.032 - 0.003, 0.012, z - 0.03, s * 0.032 + 0.003, 0.032, z);
    K.cyl("metal", COL.gun, 0.011, -0.6, -0.76, 0.022);
    K.cyl("metal", COL.black, 0.016, -0.76, -0.81, 0.022, 0, 8);
    K.prof("poly", COL.black, [[0.12, 0.045], [0.38, 0.042], [0.39, 0.02], [0.39, -0.1], [0.36, -0.11], [0.25, -0.05], [0.12, -0.03]], 0.044, 0, 0.004);
    K.box("poly", COL.dark, -0.022, 0.044, 0.18, 0.022, 0.07, 0.32);
    arGrip(K, COL.black);
    triggerGuard(K, -0.06, -0.005, -0.04);
    K.rail(COL.black, -0.22, 0.11, 0.05);
    const sightY = scope(K, -0.05, 0.056, 0.28, 0.02, 0.028);
    mag.prof("metal", COL.black, [[-0.11, -0.04], [-0.05, -0.04], [-0.055, -0.14], [-0.115, -0.14]], 0.03);
    bolt.box("metal", COL.steel, 0.026, 0.006, -0.08, 0.03, 0.034, -0.015);
    return { sightY, sightZ: 0.13, muzzle: [0, 0.022, -0.82], eject: [0.03, 0.022, -0.05], grip: [0, -0.06, 0.035], fore: [0, -0.012, -0.38], magPos: [0, -0.09, -0.083], reticle: "scope" };
  },
  breacher(P) {
    const { body: K, mag, bolt, pump } = P;
    K.prof("metal", COL.gun, [[-0.18, -0.03], [0.08, -0.03], [0.08, 0.045], [-0.18, 0.045]], 0.052, 0, 0.004);
    K.cyl("metal", COL.gun, 0.017, -0.18, -0.72, 0.03, 0, 14);
    K.cyl("metal", COL.black, 0.016, -0.18, -0.68, -0.008, 0, 14);
    K.cyl("metal", COL.black, 0.019, -0.68, -0.7, -0.008, 0, 12);
    K.box("metal", COL.steel, -0.004, 0.047, -0.71, 0.004, 0.055, -0.7);
    for (const sx of [-1, 1]) K.box("metal", COL.black, sx * 0.011 - 0.004, 0.045, 0.03, sx * 0.011 + 0.004, 0.064, 0.05);
    K.box("metal", COL.black, -0.015, 0.045, 0.03, 0.015, 0.05, 0.05);
    K.box("metal", COL.dark, -0.014, 0.0, 0.0, 0.014, 0.03, 0.04);
    // polymer stock with pistol grip
    K.prof("poly", COL.black, [[0.08, 0.04], [0.37, 0.025], [0.38, 0.0], [0.38, -0.11], [0.35, -0.12], [0.22, -0.06], [0.14, -0.11], [0.11, -0.12], [0.08, -0.03]], 0.046, 0, 0.004);
    K.box("poly", COL.dark, -0.025, -0.12, 0.365, 0.025, 0.028, 0.39);
    triggerGuard(K, -0.03, 0.04, -0.03);
    // pump forend
    pump.prof("poly", COL.tan, [[-0.3, -0.045], [-0.48, -0.045], [-0.49, -0.025], [-0.49, 0.025], [-0.3, 0.025], [-0.29, -0.02]], 0.05, 0, 0.005);
    for (let z = -0.32; z > -0.47; z -= 0.022) pump.box("poly", "#7d6a4b", -0.0255, -0.04, z - 0.008, 0.0255, 0.02, z);
    mag.cyl("brass", null, 0.011, -0.012, 0.012, 0.0, 0, 10);
    mag.cyl("poly", "#b8321f", 0.0115, 0.012, 0.06, 0.0, 0, 10);
    bolt.box("metal", COL.steel, 0.027, 0.0, -0.1, 0.03, 0.035, -0.03);
    return { sightY: 0.055, sightZ: 0.2, muzzle: [0, 0.03, -0.73], eject: [0.03, 0.02, -0.06], grip: [0, -0.07, 0.11], fore: [0, -0.04, -0.4], magPos: [0, -0.04, -0.1], reticle: "bead", shell: true };
  },
  tempest(P) {
    const { body: K, mag, bolt } = P;
    K.prof("metal", COL.black, [[-0.28, -0.04], [0.12, -0.04], [0.12, 0.05], [-0.28, 0.05]], 0.066, 0, 0.006);
    K.box("metal", COL.black, -0.012, 0.05, -0.2, 0.012, 0.09, -0.17);
    K.box("metal", COL.black, -0.012, 0.05, 0.05, 0.012, 0.09, 0.08);
    K.box("metal", COL.black, -0.012, 0.085, -0.2, 0.012, 0.095, 0.08);
    K.cyl("metal", COL.gun, 0.02, -0.28, -0.6, 0.015, 0, 12);
    K.cyl("metal", COL.black, 0.026, -0.6, -0.66, 0.015, 0, 8);
    K.cyl("metal", COL.dark, 0.029, -0.3, -0.45, 0.015, 0, 8);
    K.prof("poly", COL.od, [[0.12, 0.045], [0.38, 0.035], [0.39, -0.11], [0.35, -0.12], [0.24, -0.05], [0.12, -0.04]], 0.05, 0, 0.004);
    K.prof("poly", COL.od, [[-0.2, -0.04], [-0.17, -0.04], [-0.18, -0.13], [-0.2, -0.135]], 0.03, 0, 0.003);
    arGrip(K, COL.od, 0.03);
    triggerGuard(K, -0.03, 0.03, -0.04);
    const sightY = redDot(K, -0.05, 0.095, 0.015);
    // drum
    const dg = (m, c, r, t, z, y) => {
      m.cylX("poly", c, r, -t / 2, t / 2, y, z, 24);
    };
    dg(mag, COL.black, 0.085, 0.07, -0.08, -0.12);
    dg(mag, COL.dark, 0.06, 0.074, -0.08, -0.12);
    mag.box("poly", COL.black, -0.025, -0.06, -0.12, 0.025, -0.035, -0.04);
    bolt.box("metal", COL.steel, 0.034, 0.0, -0.1, 0.037, 0.035, -0.03);
    return { sightY, sightZ: 0.16, muzzle: [0, 0.015, -0.67], eject: [0.036, 0.02, -0.06], grip: [0, -0.07, 0.065], fore: [0, -0.09, -0.185], magPos: [0, -0.12, -0.08], reticle: "dot" };
  },
  bulwark(P) {
    const { body: K, mag, bolt } = P;
    K.prof("metal", COL.gun, [[-0.26, -0.045], [0.14, -0.045], [0.14, 0.055], [0.02, 0.07], [-0.26, 0.06]], 0.07, 0, 0.005);
    // feed cover
    K.prof("metal", COL.black, [[-0.16, 0.06], [0.08, 0.068], [0.08, 0.085], [-0.16, 0.08]], 0.074);
    // ventilated heat shield + heavy barrel
    K.cyl("metal", COL.black, 0.03, -0.26, -0.7, 0.012, 0, 12);
    for (let z = -0.3; z > -0.68; z -= 0.045) for (const s of [-1, 1]) K.box("metal", COL.dark, s * 0.029 - 0.003, 0.0, z - 0.025, s * 0.029 + 0.003, 0.028, z);
    K.cyl("metal", COL.gun, 0.014, -0.7, -0.85, 0.012);
    K.cyl("metal", COL.black, 0.02, -0.85, -0.9, 0.012, 0, 8);
    // carry handle
    K.box("metal", COL.black, -0.008, 0.06, -0.35, 0.008, 0.11, -0.33);
    K.box("metal", COL.black, -0.008, 0.06, -0.2, 0.008, 0.11, -0.18);
    K.box("poly", COL.black, -0.012, 0.105, -0.36, 0.012, 0.125, -0.17);
    // bipod
    for (const s of [-1, 1]) K.box("metal", COL.black, s * 0.02 - 0.005, -0.06, -0.8, s * 0.02 + 0.005, -0.04, -0.52);
    // stock
    K.prof("poly", COL.black, [[0.14, 0.05], [0.42, 0.035], [0.43, -0.1], [0.4, -0.11], [0.28, -0.06], [0.14, -0.045]], 0.054, 0, 0.004);
    arGrip(K, COL.black, 0.02);
    triggerGuard(K, -0.04, 0.02, -0.045);
    K.rail(COL.black, -0.12, 0.06, 0.085);
    const sightY = redDot(K, -0.03, 0.091, 0.015);
    // ammo box + belt
    mag.box("poly", COL.od, -0.06, -0.2, -0.13, 0.06, -0.045, -0.02);
    mag.box("poly", COL.dark, -0.062, -0.07, -0.135, 0.062, -0.06, -0.015);
    for (let k = 0; k < 6; k++) mag.cyl("brass", null, 0.006, -0.06 + k * 0.008, -0.04 + k * 0.008, -0.03 + k * 0.012, 0.045, 6);
    bolt.box("metal", COL.steel, 0.036, -0.01, -0.12, 0.04, 0.02, -0.06);
    return { sightY, sightZ: 0.17, muzzle: [0, 0.012, -0.91], eject: [0.04, 0.0, -0.08], grip: [0, -0.07, 0.055], fore: [0, -0.02, -0.4], magPos: [0, -0.12, -0.075], reticle: "dot" };
  },
  p9(P) {
    const { body: K, mag, slide } = P;
    // frame + grip
    K.prof("poly", COL.black, [[-0.13, -0.005], [0.03, -0.005], [0.035, -0.02], [0.065, -0.115], [0.035, -0.125], [0.0, -0.11], [-0.01, -0.03], [-0.13, -0.025]], 0.03, 0, 0.003);
    K.box("poly", COL.black, -0.012, -0.025, -0.13, 0.012, -0.015, -0.06);
    triggerGuard(K, -0.06, -0.01, -0.01);
    // slide
    slide.prof("metal", COL.gun, [[-0.15, -0.005], [0.04, -0.005], [0.045, 0.03], [-0.145, 0.03]], 0.028, 0, 0.003);
    for (let z = 0.0; z < 0.035; z += 0.006) slide.box("metal", COL.dark, -0.0145, 0.002, z, 0.0145, 0.026, z + 0.003);
    slide.box("metal", COL.black, -0.0018, 0.03, -0.14, 0.0018, 0.0365, -0.133);
    slide.box("metal", COL.black, -0.009, 0.03, 0.03, 0.009, 0.033, 0.04);
    for (const sx of [-1, 1]) slide.box("metal", COL.black, sx * 0.0065 - 0.0025, 0.033, 0.03, sx * 0.0065 + 0.0025, 0.0395, 0.04);
    slide.box("metal", COL.white, -0.001, 0.034, -0.137, 0.001, 0.0365, -0.135);
    slide.box("metal", COL.white, -0.0075, 0.034, 0.029, -0.005, 0.0365, 0.031);
    slide.box("metal", COL.white, 0.005, 0.034, 0.029, 0.0075, 0.0365, 0.031);
    K.cyl("metal", COL.steel, 0.006, -0.15, -0.153, 0.012);
    mag.prof("metal", COL.black, [[0.004, -0.03], [0.034, -0.03], [0.058, -0.125], [0.028, -0.128]], 0.024);
    return { sightY: 0.036, sightZ: 0.36, muzzle: [0, 0.012, -0.155], eject: [0.016, 0.02, -0.03], grip: [0, -0.07, 0.03], fore: [0, -0.075, 0.025], magPos: [0, -0.08, 0.03], reticle: "iron", pistol: true };
  },
  rhino(P) {
    const { body: K, mag, slide } = P;
    // frame
    K.prof("metal", COL.steel, [[-0.06, -0.02], [0.03, -0.02], [0.04, 0.04], [-0.06, 0.04]], 0.03, 0, 0.003);
    // barrel with full lug + top rib
    K.prof("metal", COL.steel, [[-0.06, 0.0], [-0.24, 0.005], [-0.24, 0.045], [-0.06, 0.045]], 0.026, 0, 0.003);
    K.box("metal", COL.dark, -0.006, 0.045, -0.24, 0.006, 0.054, -0.06);
    K.box("metal", COL.black, -0.003, 0.054, -0.235, 0.003, 0.066, -0.225);
    for (let z = -0.22; z < -0.08; z += 0.025) K.box("metal", COL.dark, -0.0062, 0.054, z, 0.0062, 0.0565, z + 0.012);
    K.cyl("metal", COL.dark, 0.006, -0.06, 0.02, -0.015);
    // hammer + trigger guard
    K.prof("metal", COL.steel, [[0.03, 0.03], [0.055, 0.045], [0.06, 0.06], [0.045, 0.06], [0.025, 0.04]], 0.012);
    triggerGuard(K, -0.025, 0.02, -0.02);
    // wooden grip
    K.prof("wood", COL.woodL, [[0.025, -0.02], [0.045, -0.02], [0.085, -0.115], [0.07, -0.13], [0.04, -0.125], [0.015, -0.04]], 0.034, 0, 0.004);
    // cylinder (rotates; reload swings it out)
    slide.cyl("metal", COL.steel, 0.026, -0.06, 0.012, 0.0, 0, 6);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      slide.box("metal", COL.dark, Math.cos(a) * 0.026 - 0.003, Math.sin(a) * 0.026 - 0.006, -0.055, Math.cos(a) * 0.026 + 0.003, Math.sin(a) * 0.026 + 0.006, 0.005);
    }
    mag.cyl("brass", null, 0.0075, 0.012, 0.016, 0.0, 0.0, 8);
    return { sightY: 0.064, sightZ: 0.36, muzzle: [0, 0.025, -0.245], eject: [0.0, 0.0, 0.0], grip: [0, -0.07, 0.045], fore: [0, -0.07, 0.04], magPos: [0, 0.0, -0.022], reticle: "iron", pistol: true, revolver: true };
  },
};

/** build a weapon model; returns { root, parts, anchors, meta } */
export function buildGun(id, { shadow = false } = {}) {
  const mats = gunMaterials();
  const P = { body: kit(), mag: kit(), bolt: kit(), slide: kit(), pump: kit() };
  const meta = (BUILD[id] || BUILD.vx9)(P);
  if (P.body.reticleZ !== undefined) meta.reticleZ = P.body.reticleZ;
  const root = new THREE.Group();
  root.name = "gun:" + id;
  const parts = {};
  for (const key of ["body", "mag", "bolt", "slide", "pump"]) {
    if (!Object.keys(P[key].lists).length) continue;
    const g = meshesFrom(P[key], mats, shadow);
    g.name = key;
    root.add(g);
    parts[key] = g;
  }
  // reticles
  if (meta.reticle === "holo" || meta.reticle === "dot") {
    const ring = new THREE.Mesh(new THREE.RingGeometry(meta.reticle === "holo" ? 0.0035 : 0.0001, meta.reticle === "holo" ? 0.0042 : 0.0015, 24), mats.glowRed);
    ring.position.set(0, meta.sightY, meta.reticleZ ?? -0.12);
    if (meta.reticle === "holo") {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0007, 10), mats.glowRed);
      dot.position.copy(ring.position);
      root.add(dot);
    }
    ring.name = "reticle";
    root.add(ring);
  }
  if (meta.reticle === "optic") {
    const chev = new THREE.Mesh(new THREE.ConeGeometry(0.0016, 0.003, 3), mats.glowRed);
    chev.position.set(0, meta.sightY - 0.0016, meta.reticleZ ?? -0.06);
    chev.rotation.x = Math.PI / 2;
    chev.rotation.z = Math.PI;
    root.add(chev);
  }
  const anchor = (name, p) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(p[0], p[1], p[2]);
    root.add(o);
    return o;
  };
  const anchors = {
    muzzle: anchor("muzzle", meta.muzzle),
    eject: anchor("eject", meta.eject),
    grip: anchor("grip", meta.grip),
    fore: anchor("fore", meta.fore),
    sight: anchor("sight", [0, meta.sightY, meta.sightZ]),
    mag: anchor("magAnchor", meta.magPos),
  };
  if (parts.bolt) parts.bolt.userData.rest = parts.bolt.position.clone();
  return { root, parts, anchors, meta, id };
}

export function disposeGun(g) {
  g.root.traverse((o) => {
    if (o.isMesh) o.geometry.dispose();
  });
}
