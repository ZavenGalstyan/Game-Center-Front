/**
 * Night Corridor — furniture and set dressing.
 *
 * Everything here is built from unit boxes / cylinders / planes that are
 * batched into one InstancedMesh per (shape, material). A fully dressed
 * section — handrails, electrical boxes, vents, pipes, gurneys, shelves,
 * papers, puddles, broken ceiling panels — costs a few dozen draw calls.
 * Signs and windows (unique textures) are the only individual meshes.
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { WALL_H } from "../engine/constants.js";
import { hashStr, mulberry32 } from "../engine/rng.js";
import { getMaterials } from "./materials.js";
import { signTexture } from "./textures.js";

const UNIT = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  cyl: () => new THREE.CylinderGeometry(1, 1, 1, 12),
  cyl6: () => new THREE.CylinderGeometry(1, 1, 1, 6),
  plane: () => new THREE.PlaneGeometry(1, 1),
  sphere: () => new THREE.SphereGeometry(1, 10, 8),
};

class Batch {
  constructor(mats) {
    this.mats = mats;
    this.parts = new Map();
    this.base = new THREE.Matrix4();
    this.tmp = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
  }
  at(x, y, z, yaw = 0) {
    this.e.set(0, yaw, 0);
    this.q.setFromEuler(this.e);
    this.base.compose(this.v.set(x, y, z), this.q, this.s.set(1, 1, 1));
    return this;
  }
  add(shape, mat, [lx, ly, lz], [sx, sy, sz], [rx, ry, rz] = [0, 0, 0], opts = {}) {
    const key = `${shape}|${typeof mat === "string" ? mat : mat.uuid}|${opts.shadow ? 1 : 0}`;
    if (!this.parts.has(key)) this.parts.set(key, { shape, mat: typeof mat === "string" ? this.mats[mat] : mat, list: [], shadow: Boolean(opts.shadow) });
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.tmp.compose(this.v.set(lx, ly, lz), this.q, this.s.set(sx, sy, sz));
    this.parts.get(key).list.push(new THREE.Matrix4().multiplyMatrices(this.base, this.tmp));
  }
  box(mat, p, s, r, o) {
    this.add("box", mat, p, s, r, o);
  }
  cyl(mat, p, radius, h, r, o) {
    this.add("cyl", mat, p, [radius, h, radius], r, o);
  }
  build(shadows) {
    const group = new THREE.Group();
    const geos = {};
    for (const part of this.parts.values()) {
      const geo = (geos[part.shape] ||= UNIT[part.shape]());
      const mesh = new THREE.InstancedMesh(geo, part.mat, part.list.length);
      part.list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = shadows && part.shadow;
      mesh.receiveShadow = shadows;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    return { group, geos: Object.values(geos) };
  }
}

// --------------------------------------------------------------- furniture
function furniture(b, p) {
  const sh = { shadow: true };
  const rand = mulberry32(hashStr(`${p.kind}${p.x.toFixed(2)}${p.z.toFixed(2)}`));
  b.at(p.x, 0, p.z, p.yaw);
  switch (p.kind) {
    case "cabinet": {
      b.box("beigeMetal", [0, 0.95, 0], [0.88, 1.9, 0.48], undefined, sh);
      b.box("darkMetal", [0, 0.95, 0.245], [0.01, 1.8, 0.01]);
      b.box("chrome", [-0.06, 1.0, 0.25], [0.02, 0.14, 0.02]);
      b.box("chrome", [0.06, 1.0, 0.25], [0.02, 0.14, 0.02]);
      if (rand() < 0.5) b.box("cardboard", [0.1, 2.05, 0], [0.5, 0.3, 0.4], [0, 0.3, 0], sh);
      break;
    }
    case "stand": {
      b.box("beigeMetal", [0, 0.44, 0], [0.78, 0.88, 0.44], undefined, sh);
      b.box("darkMetal", [0, 0.6, 0.225], [0.7, 0.01, 0.01]);
      b.box("chrome", [0, 0.72, 0.23], [0.16, 0.02, 0.02]);
      break;
    }
    case "table": {
      b.box("paintedMetal", [0, 0.78, 0], [1.08, 0.04, 0.68], undefined, sh);
      for (const [x, z] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]]) b.cyl("darkMetal", [x, 0.38, z], 0.02, 0.76, undefined, sh);
      break;
    }
    case "shelf": {
      for (const [x, z] of [[-0.78, -0.23], [0.78, -0.23], [-0.78, 0.23], [0.78, 0.23]]) b.box("darkMetal", [x, 1.0, z], [0.04, 2.0, 0.04], undefined, sh);
      for (const y of [0.12, 0.62, 1.12, 1.62]) {
        b.box("paintedMetal", [0, y, 0], [1.6, 0.03, 0.5], undefined, sh);
        let x = -0.7;
        while (x < 0.65) {
          const w = 0.2 + rand() * 0.3;
          if (rand() < 0.75) b.box(rand() < 0.5 ? "cardboard" : "plywood", [x + w / 2, y + 0.02 + 0.13, (rand() - 0.5) * 0.08], [w - 0.03, 0.22 + rand() * 0.12, 0.38], [0, (rand() - 0.5) * 0.2, 0], sh);
          x += w;
        }
      }
      break;
    }
    case "gurney": {
      b.box("mattress", [0, 0.86, 0], [1.85, 0.1, 0.62], [0, 0, 0.02], sh);
      b.box("chrome", [0, 0.78, 0], [1.9, 0.04, 0.66], undefined, sh);
      for (const [x, z] of [[-0.85, -0.28], [0.85, -0.28], [-0.85, 0.28], [0.85, 0.28]]) {
        b.cyl("chrome", [x, 0.42, z], 0.02, 0.72);
        b.cyl("rubber", [x, 0.06, z], 0.06, 0.04, [Math.PI / 2, 0, 0]);
      }
      b.cyl("chrome", [0.95, 1.05, 0], 0.015, 0.6, [Math.PI / 2, 0, 0]);
      b.box("fabric", [-0.3, 0.93, 0.05], [0.9, 0.05, 0.66], [0.05, 0.1, -0.03]);
      break;
    }
    case "wheelchair": {
      b.box("fabric", [0, 0.5, 0], [0.45, 0.05, 0.45], undefined, sh);
      b.box("fabric", [0, 0.78, -0.22], [0.45, 0.5, 0.04], [-0.12, 0, 0], sh);
      for (const s of [-1, 1]) {
        b.cyl("rubber", [s * 0.3, 0.32, -0.05], 0.3, 0.03, [0, 0, Math.PI / 2], sh);
        b.cyl("chrome", [s * 0.3, 0.32, -0.05], 0.27, 0.02, [0, 0, Math.PI / 2]);
        b.cyl("rubber", [s * 0.2, 0.07, 0.3], 0.07, 0.03, [0, 0, Math.PI / 2]);
        b.cyl("chrome", [s * 0.22, 0.7, -0.1], 0.015, 0.5);
      }
      break;
    }
    case "bed": {
      b.box("mattress", [0, 0.6, 0], [1.9, 0.14, 0.9], undefined, sh);
      b.box("paintedMetal", [0, 0.48, 0], [1.95, 0.08, 0.95], undefined, sh);
      b.box("paintedMetal", [-0.97, 0.7, 0], [0.04, 0.6, 0.95], undefined, sh);
      b.box("paintedMetal", [0.97, 0.6, 0], [0.04, 0.4, 0.95], undefined, sh);
      for (const [x, z] of [[-0.9, -0.42], [0.9, -0.42], [-0.9, 0.42], [0.9, 0.42]]) b.cyl("darkMetal", [x, 0.22, z], 0.025, 0.44);
      b.box("fabric", [0.25, 0.7, 0.04], [1.2, 0.06, 0.98], [0, 0.04, -0.05]);
      b.box("mattress", [-0.72, 0.72, 0], [0.35, 0.1, 0.55], undefined, sh);
      break;
    }
    case "desk": {
      b.box("wood", [0, 0.76, 0], [1.4, 0.04, 0.7], undefined, sh);
      b.box("beigeMetal", [-0.5, 0.38, 0], [0.4, 0.74, 0.66], undefined, sh);
      b.box("beigeMetal", [0.68, 0.38, 0], [0.03, 0.74, 0.66], undefined, sh);
      for (const y of [0.18, 0.42, 0.64]) b.box("darkMetal", [-0.5, y, 0.335], [0.36, 0.01, 0.01]);
      b.box("plastic", [0.25, 0.92, -0.12], [0.42, 0.3, 0.3], [0, 0.2, 0], sh);
      b.box("cardboard", [-0.3, 0.8, 0.12], [0.3, 0.03, 0.22], [0, 0.4, 0]);
      break;
    }
    case "filing": {
      for (const x of [-0.22, 0.22]) {
        b.box("greenMetal", [x, 0.67, 0], [0.42, 1.34, 0.52], undefined, sh);
        for (const y of [0.3, 0.62, 0.94, 1.24]) {
          b.box("darkMetal", [x, y, 0.262], [0.36, 0.01, 0.01]);
          b.box("chrome", [x, y - 0.08, 0.27], [0.1, 0.02, 0.02]);
        }
      }
      if (rand() < 0.6) b.box("greenMetal", [0.22, 0.45, 0.4], [0.38, 0.25, 0.3], undefined, sh);
      break;
    }
    case "crates": {
      b.box("plywood", [-0.2, 0.42, 0], [0.85, 0.84, 0.85], [0, 0.1, 0], sh);
      b.box("plywood", [0.4, 0.3, 0.05], [0.5, 0.6, 0.6], [0, -0.2, 0], sh);
      b.box("cardboard", [-0.15, 1.08, 0], [0.55, 0.45, 0.5], [0, 0.4, 0], sh);
      for (const y of [0.1, 0.74]) b.box("wood", [-0.2, y, 0.43], [0.85, 0.06, 0.02], [0, 0.1, 0]);
      break;
    }
    case "barrels": {
      b.cyl(rand() < 0.5 ? "rust" : "greenMetal", [-0.32, 0.45, 0], 0.29, 0.9, undefined, sh);
      b.cyl("rust", [0.33, 0.45, 0.02], 0.29, 0.9, undefined, sh);
      for (const x of [-0.32, 0.33]) for (const y of [0.25, 0.65]) b.cyl("darkMetal", [x, y, 0], 0.3, 0.025);
      break;
    }
    case "cart": {
      for (const y of [0.25, 0.85]) b.box("paintedMetal", [0, y, 0], [1.05, 0.03, 0.55], undefined, sh);
      for (const [x, z] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) {
        b.cyl("chrome", [x, 0.5, z], 0.015, 0.9);
        b.cyl("rubber", [x, 0.05, z], 0.05, 0.03, [Math.PI / 2, 0, 0]);
      }
      b.box("cardboard", [-0.2, 0.42, 0], [0.4, 0.3, 0.4], [0, 0.3, 0], sh);
      b.box("plastic", [0.25, 1.0, 0], [0.35, 0.28, 0.32], [0, -0.2, 0], sh);
      break;
    }
    case "chairs": {
      b.box("darkMetal", [0, 0.3, -0.05], [1.4, 0.04, 0.04]);
      for (let i = -1; i <= 1; i++) {
        const tilt = rand() < 0.3 ? 0.25 : 0;
        b.box("plastic", [i * 0.46, 0.45, 0.02], [0.42, 0.04, 0.42], [tilt, 0, 0], sh);
        b.box("plastic", [i * 0.46, 0.75, -0.2], [0.42, 0.45, 0.04], [-0.1 + tilt, 0, 0], sh);
      }
      for (const x of [-0.6, 0.6]) b.box("darkMetal", [x, 0.15, -0.05], [0.04, 0.3, 0.4]);
      break;
    }
    case "rubble": {
      for (let i = 0; i < 7; i++) {
        const s = 0.2 + rand() * 0.45;
        b.box("concrete", [(rand() - 0.5) * 1.3, s * 0.4, (rand() - 0.5) * 0.6], [s * 1.4, s * 0.8, s], [rand(), rand() * 3, rand()], sh);
      }
      b.box("ceilingPanel", [0.2, 0.45, 0.1], [1.0, 0.02, 0.6], [0.5, 0.3, 0.2], sh);
      for (let i = 0; i < 3; i++) b.cyl("rust", [(rand() - 0.5) * 1.2, 0.5, (rand() - 0.5) * 0.4], 0.012, 1.2, [rand() - 0.5, 0, 0.7 + rand()]);
      break;
    }
    case "generator": {
      b.box("yellow", [0, 0.55, 0], [1.3, 0.9, 0.7], undefined, sh);
      b.box("darkMetal", [0, 0.06, 0], [1.4, 0.12, 0.8], undefined, sh);
      b.box("darkMetal", [0.3, 0.6, 0.355], [0.5, 0.4, 0.01]);
      b.cyl("darkMetal", [-0.45, 1.25, -0.15], 0.06, 0.5);
      break;
    }
    default:
      b.box("cardboard", [0, 0.3, 0], [p.w, 0.6, p.d], undefined, sh);
  }
}

// ------------------------------------------------------------------- decor
function decorItem(b, d, signs) {
  b.at(d.x, d.y ?? 0, d.z, d.yaw ?? 0);
  switch (d.kind) {
    case "rail":
      b.cyl("chrome", [0, 0, 0.075], 0.022, 2.0, [0, 0, Math.PI / 2]);
      for (const x of [-0.7, 0.7]) b.box("chrome", [x, 0, 0.04], [0.02, 0.02, 0.07]);
      break;
    case "ebox":
      b.box(d.v % 2 ? "beigeMetal" : "paintedMetal", [0, 0, 0.075], [0.42, 0.55, 0.15]);
      b.box("darkMetal", [0, 0, 0.152], [0.38, 0.5, 0.005]);
      b.cyl("pipe", [0.12, (WALL_H - (d.y ?? 1.5)) / 2 + 0.14, 0.05], 0.018, WALL_H - (d.y ?? 1.5) - 0.28);
      b.box("yellow", [0, 0.12, 0.156], [0.12, 0.1, 0.005]);
      break;
    case "vent":
      b.box("darkMetal", [0, 0, 0.02], [0.62, 0.32, 0.04]);
      for (let i = -1; i <= 1; i++) b.box("black", [0, i * 0.08, 0.041], [0.54, 0.035, 0.002]);
      break;
    case "board":
      b.box("cork", [0, 0, 0.015], [1.0, 0.7, 0.03]);
      b.box("wood", [0, 0.36, 0.02], [1.04, 0.03, 0.04]);
      b.box("wood", [0, -0.36, 0.02], [1.04, 0.03, 0.04]);
      b.add("plane", "papers", [0.05, 0.02, 0.033], [0.85, 0.6, 1]);
      break;
    case "extinguisher":
      b.cyl("red", [0, 0, 0.12], 0.085, 0.48);
      b.cyl("darkMetal", [0, 0.28, 0.12], 0.03, 0.08);
      b.box("darkMetal", [0, 0.1, 0.03], [0.05, 0.3, 0.05]);
      break;
    case "pipeV":
      b.cyl(d.v % 2 ? "pipeRust" : "pipe", [0.6, 0, 0.12], 0.06, WALL_H);
      for (const y of [-0.8, 0.6]) b.box("darkMetal", [0.6, y, 0.08], [0.16, 0.05, 0.1]);
      break;
    case "cables":
      for (let i = 0; i < 3; i++) b.cyl("rubber", [-0.2 + i * 0.12, 0.35, 0.04 + i * 0.01], 0.012, 0.9 + i * 0.1, [0, 0, 0.12 * (i - 1)]);
      b.box("darkMetal", [-0.08, 0.85, 0.05], [0.4, 0.06, 0.06]);
      break;
    case "stain":
      b.add("plane", getMaterials().stain[d.v % 4], [0, 0, 0.004], [d.s ?? 1, (d.s ?? 1) * 1.2, 1]);
      break;
    case "papers":
      b.at(d.x, 0.004, d.z, d.yaw);
      b.add("plane", "papers", [0, 0, 0], [0.9 * (d.s ?? 1), 0.9 * (d.s ?? 1), 1], [-Math.PI / 2, 0, 0]);
      break;
    case "dirt":
      b.at(d.x, 0.005, d.z, d.yaw);
      b.add("plane", getMaterials().stain[d.v % 4], [0, 0, 0], [1.3 * (d.s ?? 1), 1.3 * (d.s ?? 1), 1], [-Math.PI / 2, 0, 0]);
      break;
    case "puddle":
      b.at(d.x, 0.006, d.z, d.yaw);
      b.add("plane", "puddle", [0, 0, 0], [1.4 * (d.s ?? 1), 1.0 * (d.s ?? 1), 1], [-Math.PI / 2, 0, 0]);
      break;
    case "debris":
      b.at(d.x, 0.007, d.z, d.yaw);
      b.add("plane", "debris", [0, 0, 0], [1.0 * (d.s ?? 1), 1.0 * (d.s ?? 1), 1], [-Math.PI / 2, 0, 0]);
      break;
    case "panelHole":
      b.at(d.x, WALL_H - 0.003, d.z, d.yaw);
      b.add("plane", "black", [0, 0, 0], [0.95, 0.95, 1], [Math.PI / 2, 0, 0]);
      b.box("ceilingPanel", [0.35, -0.38, 0], [0.95, 0.015, 0.95], [0, 0, 0.9 + d.v * 0.1]);
      b.cyl("rubber", [-0.1, -0.5, 0.1], 0.008, 1.0, [0.2, 0, 0.3]);
      break;
    case "cableHang":
      b.at(d.x, WALL_H, d.z, d.yaw);
      b.cyl("rubber", [0, -0.45, 0], 0.01, 0.9, [0.15, 0, 0.1]);
      b.cyl("rubber", [0.08, -0.3, 0.05], 0.008, 0.6, [-0.2, 0, -0.15]);
      break;
    case "pipeRun": {
      const len = d.b - d.a;
      const mid = (d.a + d.b) / 2;
      const px = d.horizontal ? mid : d.across;
      const pz = d.horizontal ? d.across : mid;
      b.at(px, d.y, pz, d.horizontal ? Math.PI / 2 : 0);
      b.cyl("pipe", [0, 0, 0], d.r, len - 0.1, [Math.PI / 2, 0, 0]);
      if (d.double) b.cyl("pipeRust", [0, -0.05, d.side * -0.0 + 0], d.r * 0.6, len - 0.1, [Math.PI / 2, 0, 0]);
      // brackets and elbows into the ceiling at both ends
      for (let s = -len / 2 + 1; s < len / 2; s += 2) b.box("darkMetal", [0, 0.12, s], [0.03, 0.24, 0.05]);
      for (const e of [-len / 2 + 0.06, len / 2 - 0.06]) b.cyl("pipe", [0, 0.12, e], d.r, 0.26);
      break;
    }
    default:
      break;
  }
}

/** Individual meshes for unique-texture decor (signs, windows, graffiti). */
function UniqueDecor({ decor }) {
  const items = decor.filter((d) => d.kind === "sign" || d.kind === "window");
  const mats = getMaterials();
  return (
    <group>
      {items.map((d, i) => {
        if (d.kind === "window") {
          return (
            <group key={i} position={[d.x, d.y, d.z]} rotation={[0, d.yaw, 0]}>
              <mesh position={[0, 0, 0.012]} material={mats.window}>
                <planeGeometry args={[1.2, 1.1]} />
              </mesh>
              {[[0, 0.58, 1.3, 0.07], [0, -0.58, 1.3, 0.1], [-0.62, 0, 0.07, 1.2], [0.62, 0, 0.07, 1.2]].map(([x, y, w, h], k) => (
                <mesh key={k} position={[x, y, 0.03]} material={mats.darkMetal}>
                  <boxGeometry args={[w, h, 0.06]} />
                </mesh>
              ))}
            </group>
          );
        }
        const exit = /EXIT|STAIRS/.test(d.text);
        const danger = /DANGER|KEEP OUT|HIGH VOLTAGE/.test(d.text);
        return (
          <mesh key={i} position={[d.x, d.y, d.z]} rotation={[0, d.yaw, 0]}>
            <boxGeometry args={[0.9, 0.225, 0.02]} />
            <meshStandardMaterial
              map={signTexture(d.text, exit ? "exit" : danger ? "danger" : "plate")}
              emissive={exit ? "#2bd665" : "#000000"}
              emissiveMap={exit ? signTexture(d.text, "exit") : null}
              emissiveIntensity={exit ? 0.9 : 0}
              roughness={0.6}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export default function Props({ level, shadows = false }) {
  const built = useMemo(() => {
    const mats = getMaterials();
    const fb = new Batch(mats);
    for (const p of level.props) furniture(fb, p);
    const db = new Batch(mats);
    for (const d of level.decor) {
      if (d.kind === "sign" || d.kind === "window") continue;
      decorItem(db, d);
    }
    const f = fb.build(shadows);
    const dd = db.build(false);
    const group = new THREE.Group();
    group.add(f.group, dd.group);
    return { group, geos: [...f.geos, ...dd.geos] };
  }, [level, shadows]);

  useEffect(() => () => built.geos.forEach((g) => g.dispose()), [built]);

  return (
    <group>
      <primitive object={built.group} />
      <UniqueDecor decor={level.decor} />
    </group>
  );
}
