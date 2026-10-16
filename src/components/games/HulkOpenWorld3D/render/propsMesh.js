/**
 * Hulk: Open World 3D — instanced rendering of every prop.
 *
 * One InstancedMesh pair (coloured body + fixed-colour details) per prop
 * type; each sim prop owns a slot and its instance matrix / colour is only
 * rewritten when its `ver` changes (moving, carried, damaged, destroyed).
 * Damage states read at a glance: damaged = darker + dented, destroyed =
 * charred wreck (cars) or gone; toppled lamps rotate about their base;
 * thrown props tumble about their centre.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { stripeTex } from "./textures.js";

const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, x = 0, y = 0, z = 0, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s).translate(x, y, z);
const merge = (list) => {
  const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)), false);
  list.forEach((x) => x.dispose());
  return g;
};
const wheel = (x, z, r = 0.38) => new THREE.CylinderGeometry(r, r, 0.28, 12).rotateZ(Math.PI / 2).translate(x, r, z);

function carGeo(kind) {
  if (kind === "van") {
    return {
      body: merge([box(2.25, 1.75, 5.1, 0, 1.25, 0), box(2.2, 0.35, 0.3, 0, 0.55, 2.55)]),
      detail: merge([box(2.1, 0.7, 0.05, 0, 1.75, 2.56), box(2.27, 0.55, 2.0, 0, 1.75, 1.2), wheel(1.05, 1.7), wheel(-1.05, 1.7), wheel(1.05, -1.7), wheel(-1.05, -1.7), box(0.5, 0.18, 0.06, 0.75, 1.0, 2.58), box(0.5, 0.18, 0.06, -0.75, 1.0, 2.58)]),
    };
  }
  const body = merge([box(1.95, 0.62, 4.5, 0, 0.72, 0), box(1.7, 0.55, 2.3, 0, 1.3, -0.25), box(1.9, 0.15, 0.4, 0, 0.5, 2.2), box(1.9, 0.15, 0.4, 0, 0.5, -2.2)]);
  const det = [box(1.6, 0.48, 0.05, 0, 1.3, 0.92), box(1.6, 0.45, 0.05, 0, 1.3, -1.42), box(1.72, 0.42, 2.0, 0, 1.31, -0.25), wheel(0.9, 1.45), wheel(-0.9, 1.45), wheel(0.9, -1.45), wheel(-0.9, -1.45), box(0.4, 0.14, 0.06, 0.65, 0.85, 2.26), box(0.4, 0.14, 0.06, -0.65, 0.85, 2.26)];
  if (kind === "taxi") det.push(box(0.6, 0.22, 0.25, 0, 1.68, -0.2));
  return { body, detail: merge(det) };
}

const SPECS = {
  car: { ...carGeo("car"), bodyColor: null, detailColor: "#1b1f24" },
  taxi: { ...carGeo("taxi"), bodyColor: "#f2c12e", detailColor: "#1b1f24" },
  van: { ...carGeo("van"), bodyColor: null, detailColor: "#1b1f24" },
  barrel: { body: merge([cyl(0.45, 0.45, 1.24, 0, 0.62, 0, 14)]), detail: merge([cyl(0.47, 0.47, 0.07, 0, 0.3, 0, 14), cyl(0.47, 0.47, 0.07, 0, 0.95, 0, 14)]), bodyColor: null, detailColor: "#2a2a2a" },
  crate: { body: box(1.6, 1.6, 1.6, 0, 0.8, 0), detail: merge([box(1.64, 0.14, 1.64, 0, 0.1, 0), box(1.64, 0.14, 1.64, 0, 1.5, 0), box(0.14, 1.64, 1.64, 0, 0.8, 0)]), bodyColor: "#a77a47", detailColor: "#6e4f2c" },
  mcrate: { body: box(2.2, 1.3, 1.5, 0, 0.65, 0), detail: merge([box(2.24, 0.1, 1.54, 0, 1.25, 0), box(0.12, 1.32, 1.54, 0.6, 0.65, 0), box(0.12, 1.32, 1.54, -0.6, 0.65, 0)]), bodyColor: "#4f5a3b", detailColor: "#2e3324" },
  concrete: {
    body: (() => {
      const s = new THREE.Shape();
      s.moveTo(-0.45, 0);
      s.lineTo(0.45, 0);
      s.lineTo(0.2, 0.35);
      s.lineTo(0.14, 1.1);
      s.lineTo(-0.14, 1.1);
      s.lineTo(-0.2, 0.35);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 3.0, bevelEnabled: false });
      g.rotateY(Math.PI / 2);
      g.translate(-1.5, 0, 0);
      return g;
    })(),
    detail: null,
    bodyColor: "#b5b0a6",
  },
  bench: { body: merge([box(2.0, 0.1, 0.5, 0, 0.5, 0), box(2.0, 0.45, 0.08, 0, 0.8, -0.24)]), detail: merge([box(0.08, 0.5, 0.5, 0.85, 0.25, 0), box(0.08, 0.5, 0.5, -0.85, 0.25, 0)]), bodyColor: "#8a5a34", detailColor: "#2b2b2b" },
  bin: { body: cyl(0.33, 0.3, 0.95, 0, 0.48, 0, 10), detail: cyl(0.36, 0.36, 0.08, 0, 0.98, 0, 10), bodyColor: "#2f5a3a", detailColor: "#222" },
  hydrant: { body: merge([cyl(0.18, 0.2, 0.7, 0, 0.35, 0, 10), cyl(0.12, 0.18, 0.2, 0, 0.8, 0, 10), box(0.55, 0.12, 0.12, 0, 0.5, 0)]), detail: null, bodyColor: "#c0302a" },
  lamp: { body: merge([cyl(0.09, 0.14, 6.4, 0, 3.2, 0, 8), box(0.08, 0.08, 1.6, 0, 6.3, 0.75)]), detail: box(0.45, 0.16, 0.7, 0, 6.2, 1.5), bodyColor: "#3a3f45", detailColor: "#fff3c8", detailEmissive: true },
  light: { body: merge([cyl(0.1, 0.12, 5.8, 0, 2.9, 0, 8), box(0.1, 0.1, 3.4, 0, 5.6, 1.7), box(0.45, 1.1, 0.4, 0, 5.1, 3.2)]), detail: merge([box(0.2, 0.2, 0.06, 0, 5.45, 3.42), box(0.2, 0.2, 0.06, 0, 5.1, 3.42), box(0.2, 0.2, 0.06, 0, 4.75, 3.42)]), bodyColor: "#2f3338", detailColor: "#ff5a3a", detailEmissive: true },
  fence: { body: merge([box(4.0, 0.12, 0.08, 0, 0.35, 0), box(4.0, 0.12, 0.08, 0, 0.95, 0), ...Array.from({ length: 9 }, (_, i) => box(0.16, 1.2, 0.06, -1.8 + i * 0.45, 0.6, 0.02))]), detail: null, bodyColor: "#ece6da" },
  barricade: { body: box(5.2, 1.5, 0.9, 0, 0.75, 0), detail: null, bodyColor: "#ffffff", striped: true },
  sandbag: { body: merge(Array.from({ length: 6 }, (_, i) => new THREE.CapsuleGeometry(0.28, 0.7, 3, 8).rotateZ(Math.PI / 2).translate(-0.85 + (i % 3) * 0.85, 0.28 + Math.floor(i / 3) * 0.5, 0))), detail: null, bodyColor: "#a6946a" },
  wallSec: { body: box(10, 6, 1.2, 0, 3, 0), detail: merge([box(10.2, 0.4, 1.3, 0, 6.1, 0), box(0.4, 6, 1.3, -4.9, 3, 0), box(0.4, 6, 1.3, 4.9, 3, 0)]), bodyColor: "#8e939a", detailColor: "#5d6268" },
  generator: { body: box(2.8, 2.0, 2.0, 0, 1.0, 0), detail: merge([box(2.9, 0.3, 2.1, 0, 2.1, 0), cyl(0.18, 0.18, 1.2, 0.8, 2.6, 0.5, 8), box(0.4, 0.8, 0.1, 0, 1.1, 1.02)]), bodyColor: "#d6a72a", detailColor: "#2b2e31" },
  fuelTank: { body: cyl(2.2, 2.2, 4.8, 0, 2.6, 0, 18), detail: merge([cyl(2.25, 2.25, 0.5, 0, 2.6, 0, 18), cyl(1.0, 2.2, 0.6, 0, 5.3, 0, 18), box(0.3, 5.2, 0.3, 2.2, 2.6, 0)]), bodyColor: "#e4e0d6", detailColor: "#b8332a" },
  reactor: { body: merge([cyl(2.4, 2.4, 5.6, 0, 2.8, 0, 20), cyl(1.6, 2.4, 0.8, 0, 6.0, 0, 20)]), detail: merge([cyl(2.45, 2.45, 0.35, 0, 1.5, 0, 20), cyl(2.45, 2.45, 0.35, 0, 3.0, 0, 20), cyl(2.45, 2.45, 0.35, 0, 4.5, 0, 20)]), bodyColor: "#55606b", detailColor: "#5af0ff", detailEmissive: true },
  debris: {
    body: merge(Array.from({ length: 7 }, (_, i) => box(1.2 + (i % 3) * 0.5, 0.6 + (i % 2) * 0.5, 1.0 + (i % 4) * 0.3, -1.2 + (i % 4) * 0.8, 0.4 + (i % 3) * 0.3, -0.7 + (i % 3) * 0.6).rotateY(i * 0.7))),
    detail: merge([box(0.15, 2.6, 0.15, 0.6, 1.0, 0.2).rotateZ(0.6), box(0.15, 2.2, 0.15, -0.8, 0.9, -0.3).rotateZ(-0.7)]),
    bodyColor: "#8c8478",
    detailColor: "#5a3d2a",
  },
  shieldGen: { body: merge([cyl(1.0, 1.3, 2.6, 0, 1.3, 0, 10), box(2.2, 0.5, 2.2, 0, 0.25, 0)]), detail: merge([cyl(0.5, 0.5, 1.0, 0, 3.0, 0, 12), cyl(0.15, 0.15, 1.6, 0, 3.8, 0, 6)]), bodyColor: "#2b3240", detailColor: "#3ff2ff", detailEmissive: true },
  target: { body: box(2.8, 2.8, 0.3, 0, 1.4, 0), detail: null, bodyColor: "#ffffff" },
};
const CAR_COLORS = ["#b8332a", "#2a5fb8", "#e8e6e0", "#1f1f22", "#7d8288", "#2f7a4a", "#d8c25a", "#6b2a7a", "#c46a2a", "#3a4a5a"].map((c) => new THREE.Color(c));

export function createPropRenderer(scene, { shadows = true } = {}) {
  const group = new THREE.Group();
  scene.add(group);
  const types = new Map(); // type → { body, detail, cap, used, free[] }
  const mats = [];
  const stripe = stripeTex();
  stripe.repeat.set(1, 1);
  function makeType(type, cap) {
    const S = SPECS[type];
    const bodyMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: type === "car" || type === "van" || type === "taxi" ? 0.35 : 0.8, metalness: type === "car" || type === "van" || type === "taxi" ? 0.45 : 0.1, map: S.striped ? stripe : null });
    mats.push(bodyMat);
    const body = new THREE.InstancedMesh(S.body, bodyMat, cap);
    body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    body.castShadow = shadows;
    body.receiveShadow = shadows;
    body.count = cap;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) {
      body.setMatrixAt(i, zero);
      body.setColorAt(i, new THREE.Color(S.bodyColor || "#ffffff"));
    }
    group.add(body);
    let detail = null;
    if (S.detail) {
      const dm = new THREE.MeshStandardMaterial({ color: S.detailColor || "#222", roughness: 0.5, metalness: 0.3, emissive: S.detailEmissive ? S.detailColor : "#000", emissiveIntensity: S.detailEmissive ? 1.3 : 0 });
      mats.push(dm);
      detail = new THREE.InstancedMesh(S.detail, dm, cap);
      detail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      detail.castShadow = shadows && type !== "lamp";
      for (let i = 0; i < cap; i++) detail.setMatrixAt(i, zero);
      group.add(detail);
    }
    return { body, detail, cap, next: 0, free: [] };
  }
  function grow(type) {
    const old = types.get(type);
    const t = makeType(type, Math.ceil(old.cap * 1.6) + 32);
    for (let i = 0; i < old.cap; i++) {
      const m = new THREE.Matrix4();
      old.body.getMatrixAt(i, m);
      t.body.setMatrixAt(i, m);
      const c = new THREE.Color();
      old.body.getColorAt(i, c);
      t.body.setColorAt(i, c);
      if (old.detail) {
        old.detail.getMatrixAt(i, m);
        t.detail.setMatrixAt(i, m);
      }
    }
    t.next = old.next;
    t.free = old.free;
    group.remove(old.body);
    old.body.dispose();
    if (old.detail) {
      group.remove(old.detail);
      old.detail.dispose();
    }
    types.set(type, t);
    return t;
  }
  const slots = []; // prop index → {type, i, ver}
  const m4 = new THREE.Matrix4();
  const mT = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  function alloc(type) {
    let t = types.get(type);
    if (!t) {
      t = makeType(type, 64);
      types.set(type, t);
    }
    if (t.free.length) return t.free.pop();
    if (t.next >= t.cap) t = grow(type);
    return t.next++;
  }
  function release(slot) {
    const t = types.get(slot.type);
    t.body.setMatrixAt(slot.i, zero);
    if (t.detail) t.detail.setMatrixAt(slot.i, zero);
    t.body.instanceMatrix.needsUpdate = true;
    if (t.detail) t.detail.instanceMatrix.needsUpdate = true;
    t.free.push(slot.i);
  }

  /** initial bulk allocation sized to the city's prop counts */
  function reserve(props) {
    const counts = {};
    for (const p of props) counts[p.type] = (counts[p.type] || 0) + 1;
    for (const [type, n] of Object.entries(counts)) if (!types.has(type)) types.set(type, makeType(type, n + 48));
  }

  function writeProp(p, slot) {
    const t = types.get(slot.type);
    if (p.mode === "gone") {
      t.body.setMatrixAt(slot.i, zero);
      if (t.detail) t.detail.setMatrixAt(slot.i, zero);
      return t;
    }
    const d = p.def;
    const wreck = p.state === 2;
    // pose: base at (x, y, z), yaw rot; topple (lamps) about the base; tumble about the centre
    if ((p.type === "lamp" || p.type === "light") && p.rx) {
      e.set(0, p.fallYaw || 0, 0);
      q.setFromEuler(e);
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), p.rx);
      q.multiply(tilt);
      const yaw2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot - (p.fallYaw || 0));
      q.multiply(yaw2);
      v.set(p.x, p.y, p.z);
      sc.set(1, 1, 1);
      m4.compose(v, q, sc);
    } else {
      e.set(0, p.rot, 0, "YXZ");
      q.setFromEuler(e);
      if (p.rx) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), p.rx));
      v.set(p.x, p.y + d.hy, p.z);
      sc.set(1, wreck && (p.type === "car" || p.type === "van" || p.type === "taxi") ? 0.72 : 1, 1);
      m4.compose(v, q, sc);
      mT.makeTranslation(0, -d.hy, 0);
      m4.multiply(mT);
    }
    t.body.setMatrixAt(slot.i, m4);
    if (t.detail) t.detail.setMatrixAt(slot.i, m4);
    // colour: palette for cars, darken by damage, charred wrecks
    const S = SPECS[p.type];
    if (S.bodyColor) col.set(S.bodyColor);
    else if (p.type === "barrel") col.set(p.red ? "#b8332a" : "#2a5fb8");
    else if (p.military) col.set("#4f5a3b");
    else col.copy(CAR_COLORS[(p.color >>> 0) % CAR_COLORS.length]);
    if (p.state === 1) col.multiplyScalar(0.72);
    if (wreck) col.set(p.burnt ? "#1a1816" : "#2c2824");
    if (p.inert && p.type === "reactor") col.multiplyScalar(0.9);
    t.body.setColorAt(slot.i, col);
    return t;
  }

  return {
    group,
    reserve,
    /** sync every prop whose version changed */
    sync(props) {
      const dirty = new Set();
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        let slot = slots[i];
        if (slot && slot.type !== p.type) {
          release(slot);
          dirty.add(slot.type);
          slot = slots[i] = null;
        }
        if (!slot) {
          if (p.mode === "gone") continue;
          slot = slots[i] = { type: p.type, i: alloc(p.type), ver: -1 };
        }
        if (slot.ver === p.ver) continue;
        slot.ver = p.ver;
        writeProp(p, slot);
        dirty.add(p.type);
      }
      for (const type of dirty) {
        const t = types.get(type);
        t.body.instanceMatrix.needsUpdate = true;
        if (t.body.instanceColor) t.body.instanceColor.needsUpdate = true;
        if (t.detail) t.detail.instanceMatrix.needsUpdate = true;
        t.body.computeBoundingSphere();
        if (t.detail) t.detail.computeBoundingSphere();
      }
    },
    reset() {
      for (const s of slots) if (s) release(s);
      slots.length = 0;
    },
    dispose() {
      for (const t of types.values()) {
        t.body.dispose();
        if (t.detail) t.detail.dispose();
      }
      for (const m of mats) m.dispose();
      for (const S of Object.values(SPECS)) {
        // shared geometries live for the module; nothing to free per instance
        void S;
      }
      scene.remove(group);
    },
  };
}
