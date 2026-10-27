/**
 * Strike Force — soldier models + procedural animation.
 *
 * Body parts are modelled in bone-local space, merged and rigidly skinned
 * to a 13-bone skeleton: two SkinnedMeshes per soldier (camo cloth, gear)
 * share one skeleton, plus a glowing visor strip and the carried weapon.
 * Geometry is cached per palette, so twelve soldiers cost ~12 geometries.
 *
 * Arms are solved with two-bone IK onto the weapon's grip / fore anchors,
 * so every gun is held correctly. Animation is driven from the simulated
 * combatant (velocity, crouch, pitch, sprint, reload, shots, death).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getTextureSet } from "./textures.js";
import { buildGun } from "./guns.js";

const BONES = ["root", "hips", "spine", "chest", "head", "uarmR", "farmR", "uarmL", "farmL", "thighR", "shinR", "thighL", "shinL"];
const PARENT = [-1, 0, 1, 2, 3, 3, 5, 3, 7, 1, 9, 1, 11];
const BIND = [
  [0, 0, 0],
  [0, 0.98, 0],
  [0, 0.12, 0],
  [0, 0.2, 0],
  [0, 0.27, 0],
  [0.2, 0.16, 0],
  [0, -0.29, 0],
  [-0.2, 0.16, 0],
  [0, -0.29, 0],
  [0.1, -0.05, 0],
  [0, -0.45, 0],
  [-0.1, -0.05, 0],
  [0, -0.45, 0],
];
const UARM = 0.29;
const FARM = 0.3;
const bindWorld = BIND.map((_, i) => {
  const p = [0, 0, 0];
  for (let k = i; k >= 0; k = PARENT[k]) {
    p[0] += BIND[k][0];
    p[1] += BIND[k][1];
    p[2] += BIND[k][2];
  }
  return p;
});

export const PALETTES = {
  vanguard: { shirt: "#8f8264", pants: "#7b7258", vest: "#6e6246", pouch: "#7f7150", helmet: "#867b5b", glove: "#2a2a28", boot: "#3a3026", mask: "#3d3c33", strap: "#4d4535", visor: "#46d6ff", camo: 1 },
  obsidian: { shirt: "#41444a", pants: "#35383d", vest: "#1f2124", pouch: "#2a2c30", helmet: "#25272b", glove: "#151515", boot: "#1b1b1b", mask: "#18191b", strap: "#2b2d31", visor: "#ff3b2e", camo: 2 },
};

const geoCache = new Map();
let mats = null;
function soldierMats() {
  if (mats) return mats;
  const camo = getTextureSet("camo", 256, { seed: 3 });
  mats = {
    cloth: new THREE.MeshStandardMaterial({ map: camo.map, normalMap: camo.normalMap, vertexColors: true, roughness: 0.88, metalness: 0.02 }),
    gear: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12 }),
  };
  return mats;
}
export function disposeSoldierCache() {
  for (const g of geoCache.values()) {
    g.cloth.dispose();
    g.gear.dispose();
  }
  geoCache.clear();
  if (mats) {
    mats.cloth.dispose();
    mats.gear.dispose();
    mats = null;
  }
}

/* ------------------------------------------------------------------ geometry */
function partsFor(pal) {
  const cloth = [];
  const gear = [];
  const put = (list, bone, g, color, scaleUV = 4) => {
    const w = bindWorld[bone];
    g.translate(w[0], w[1], w[2]);
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const ng = g.index ? g.toNonIndexed() : g;
    // uv: simple cylindrical projection scaled for camo
    const p = ng.attributes.position;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = (Math.atan2(p.getX(i), p.getZ(i)) / Math.PI) * 0.5 * scaleUV * 0.3;
      uv[i * 2 + 1] = p.getY(i) * scaleUV * 0.6;
    }
    ng.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    for (const k of Object.keys(ng.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) ng.deleteAttribute(k);
    const si = new Uint16Array(p.count * 4);
    const sw = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) {
      si[i * 4] = bone;
      sw[i * 4] = 1;
    }
    ng.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4));
    ng.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
    list.push(ng);
  };
  const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const rbox = (w, h, d, x = 0, y = 0, z = 0, r = 0.03) => {
    // rounded box via capsule-ish sphere scaled
    const g = new THREE.SphereGeometry(0.5, 12, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let px = p.getX(i) * 2;
      let py = p.getY(i) * 2;
      let pz = p.getZ(i) * 2;
      // squash sphere toward a box (superellipsoid-ish)
      const k = 0.55;
      px = Math.sign(px) * Math.abs(px) ** k;
      py = Math.sign(py) * Math.abs(py) ** k;
      pz = Math.sign(pz) * Math.abs(pz) ** k;
      p.setXYZ(i, (px * w) / 2, (py * h) / 2, (pz * d) / 2);
    }
    g.computeVertexNormals();
    void r;
    return g.translate(x, y, z);
  };
  const cap = (r, len, x = 0, y = 0, z = 0, seg = 10) => new THREE.CapsuleGeometry(r, len, 4, seg).translate(x, y, z);
  const C = pal;
  // hips / belt
  put(cloth, 1, rbox(0.33, 0.2, 0.22, 0, -0.02, 0), C.pants);
  put(gear, 1, box(0.35, 0.055, 0.24, 0, 0.06, 0), C.strap);
  put(gear, 1, box(0.08, 0.1, 0.07, 0.16, 0.0, -0.02), C.pouch);
  put(gear, 1, box(0.07, 0.09, 0.07, -0.16, 0.0, 0.03), C.pouch);
  put(gear, 1, box(0.06, 0.06, 0.04, 0.0, 0.05, -0.125), "#5b5b55");
  // spine (abdomen)
  put(cloth, 2, rbox(0.31, 0.24, 0.2, 0, 0.1, 0), C.shirt);
  // chest + plate carrier
  put(cloth, 3, rbox(0.4, 0.3, 0.23, 0, 0.1, 0), C.shirt);
  put(gear, 3, rbox(0.36, 0.3, 0.075, 0, 0.08, -0.11), C.vest);
  put(gear, 3, rbox(0.36, 0.32, 0.07, 0, 0.09, 0.11), C.vest);
  for (const x of [-0.085, 0, 0.085]) put(gear, 3, box(0.075, 0.12, 0.05, x, -0.0, -0.16), C.pouch);
  put(gear, 3, box(0.1, 0.07, 0.04, -0.1, 0.17, -0.155), C.pouch);
  put(gear, 3, box(0.06, 0.12, 0.05, 0.15, 0.12, -0.145), "#2a2c2e");
  put(gear, 3, box(0.06, 0.26, 0.05, 0.12, 0.12, 0.0).rotateZ(0.0), C.strap);
  put(gear, 3, box(0.06, 0.26, 0.05, -0.12, 0.12, 0.0), C.strap);
  // pack + antenna
  put(gear, 3, rbox(0.28, 0.32, 0.12, 0, 0.06, 0.2), C.pouch);
  put(gear, 3, new THREE.CylinderGeometry(0.006, 0.006, 0.42, 4).translate(-0.1, 0.38, 0.22), "#111111");
  // collar / neck
  put(cloth, 3, new THREE.CylinderGeometry(0.075, 0.09, 0.08, 10).translate(0, 0.26, 0), C.shirt);
  // shoulder pads
  for (const s of [-1, 1]) put(gear, 3, rbox(0.1, 0.06, 0.12, s * 0.2, 0.2, 0), C.vest);
  // head
  put(gear, 4, new THREE.SphereGeometry(0.105, 14, 10).scale(1, 1.12, 1.05).translate(0, 0.1, -0.005), C.mask);
  const helmet = new THREE.SphereGeometry(0.128, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 0.92, 1.08).translate(0, 0.13, 0.005);
  put(gear, 4, helmet, C.helmet);
  put(gear, 4, new THREE.TorusGeometry(0.124, 0.012, 6, 22).rotateX(Math.PI / 2).scale(1, 1, 1.08).translate(0, 0.115, 0.005), C.helmet);
  put(gear, 4, box(0.05, 0.035, 0.03, 0, 0.17, -0.13), "#202020");
  for (const s of [-1, 1]) put(gear, 4, box(0.015, 0.03, 0.1, s * 0.122, 0.13, 0.0), "#2a2a2a");
  put(gear, 4, box(0.19, 0.035, 0.03, 0, 0.115, -0.105), "#1a1a1a"); // goggle band front
  put(gear, 4, box(0.04, 0.025, 0.02, 0, 0.215, 0.03), "#333333");
  // ears / comms
  for (const s of [-1, 1]) put(gear, 4, new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10).rotateZ(Math.PI / 2).translate(s * 0.11, 0.095, 0.01), "#2c2c2c");
  // arms (bind pose hanging along -y)
  for (const [u, f, s] of [
    [5, 6, 1],
    [7, 8, -1],
  ]) {
    put(cloth, u, cap(0.056, UARM - 0.06, 0, -UARM / 2, 0), C.shirt);
    put(gear, u, box(0.04, 0.05, 0.075, s * 0.05, -0.12, 0), C.strap);
    put(cloth, f, cap(0.049, FARM - 0.08, 0, -FARM / 2 + 0.01, 0), C.shirt);
    put(gear, f, cap(0.052, 0.06, 0, -FARM + 0.07, 0), C.glove);
    put(gear, f, rbox(0.075, 0.1, 0.05, 0, -FARM - 0.02, 0), C.glove);
  }
  // legs
  for (const [t, sh, s] of [
    [9, 10, 1],
    [11, 12, -1],
  ]) {
    put(cloth, t, cap(0.083, 0.3, 0, -0.22, 0), C.pants);
    put(gear, t, box(0.08, 0.12, 0.06, s * 0.08, -0.2, -0.02), C.pouch);
    put(cloth, sh, cap(0.066, 0.3, 0, -0.2, 0), C.pants);
    put(gear, sh, rbox(0.1, 0.1, 0.06, 0, -0.02, -0.07), C.vest); // knee pad
    put(gear, sh, rbox(0.11, 0.12, 0.13, 0, -0.39, -0.01), C.boot);
    put(gear, sh, rbox(0.11, 0.07, 0.26, 0, -0.44, -0.05), C.boot);
  }
  return { cloth, gear };
}

function geometryFor(key, pal) {
  if (geoCache.has(key)) return geoCache.get(key);
  const { cloth, gear } = partsFor(pal);
  const g = { cloth: mergeGeometries(cloth, false), gear: mergeGeometries(gear, false) };
  for (const x of [...cloth, ...gear]) x.dispose();
  g.cloth.computeBoundingSphere();
  g.gear.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

/* ------------------------------------------------------------------ IK helpers */
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);
const _m = new THREE.Matrix4();

/** solve upper/fore bones (children of chest) so the wrist lands on target (chest space) */
const _w = new THREE.Vector3();
function solveArm(upper, fore, shoulder, target, poleDir) {
  _d.subVectors(target, shoulder);
  let dist = _d.length();
  const maxR = UARM + FARM - 0.005;
  if (dist > maxR) {
    _d.multiplyScalar(maxR / dist);
    dist = maxR;
  }
  if (dist < 0.08) {
    _d.setLength(0.08);
    dist = 0.08;
  }
  _a.copy(_d).normalize();
  const cosA = (UARM * UARM + dist * dist - FARM * FARM) / (2 * UARM * dist);
  const angA = Math.acos(Math.max(-1, Math.min(1, cosA)));
  _pole.copy(poleDir).addScaledVector(_a, -poleDir.dot(_a)).normalize();
  _e.copy(shoulder).addScaledVector(_a, Math.cos(angA) * UARM).addScaledVector(_pole, Math.sin(angA) * UARM);
  _w.copy(shoulder).add(_d);
  _b.subVectors(_e, shoulder).normalize();
  _q.setFromUnitVectors(DOWN, _b);
  upper.quaternion.copy(_q);
  _b.subVectors(_w, _e).normalize();
  _q2.setFromUnitVectors(DOWN, _b);
  fore.quaternion.copy(_q.invert()).multiply(_q2);
}

/* ------------------------------------------------------------------ soldier */
export function createSoldier({ palette = "vanguard", accent = null, weapon = "vx9", shadow = true } = {}) {
  const pal = { ...(PALETTES[palette] || PALETTES.vanguard) };
  if (accent) {
    pal.visor = accent;
    pal.strap = accent;
  }
  const key = palette + "|" + (accent || "");
  const geo = geometryFor(key, pal);
  const M = soldierMats();

  const bones = BONES.map((n) => {
    const b = new THREE.Bone();
    b.name = n;
    return b;
  });
  bones.forEach((b, i) => {
    b.position.set(...BIND[i]);
    if (PARENT[i] >= 0) bones[PARENT[i]].add(b);
  });
  const root = new THREE.Group();
  root.add(bones[0]);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const mk = (g, m) => {
    const s = new THREE.SkinnedMesh(g, m);
    s.bind(skeleton);
    s.castShadow = shadow;
    s.frustumCulled = false; // bounds follow the root group; culled manually below
    root.add(s);
    return s;
  };
  const clothMesh = mk(geo.cloth, M.cloth);
  const gearMesh = mk(geo.gear, M.gear);
  const B = Object.fromEntries(bones.map((b) => [b.name, b]));

  // visor strip (glows team colour)
  const visorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.visor).multiplyScalar(2.2), toneMapped: false });
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.022, 0.012), visorMat);
  visor.position.set(0, 0.115, -0.122);
  B.head.add(visor);
  const strobe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.02), visorMat);
  strobe.position.set(0, 0.235, 0.04);
  B.head.add(strobe);

  // weapon on a mount in chest space
  const mount = new THREE.Group();
  B.chest.add(mount);
  let gun = null;
  function setWeapon(id) {
    if (gun && gun.id === id) return;
    if (gun) {
      mount.remove(gun.root);
      gun.root.traverse((o) => o.isMesh && o.geometry.dispose());
    }
    gun = buildGun(id, { shadow });
    mount.add(gun.root);
  }
  setWeapon(weapon);

  const st = {
    phase: Math.random() * 6,
    bodyYaw: 0,
    hipYaw: 0,
    crouch: 0,
    sprint: 0,
    ads: 0,
    flinch: 0,
    kick: 0,
    reload: 0,
    reloadDur: 1,
    deadT: -1,
    down: false, // the death pose is applied to the rig
    fallDir: 1,
    fallSide: 0,
    swap: 0,
    lean: 0,
    air: 0,
    visible: true,
  };

  const shoulderR = new THREE.Vector3(...BIND[5]);
  const shoulderL = new THREE.Vector3(...BIND[7]);
  const tgtR = new THREE.Vector3();
  const tgtL = new THREE.Vector3();
  const poleR = new THREE.Vector3(0.6, -0.8, 0.2);
  const poleL = new THREE.Vector3(-0.8, -0.6, 0.1);

  /**
   * c: combatant snapshot { x, y, z, yaw, pitch, vx, vz, crouch, sprinting,
   * grounded, ads, alive, reloading, reloadT, reloadTotal }
   */
  function update(c, dt, t) {
    root.position.set(c.x, c.y, c.z);
    const damp = (a, b, k) => a + (b - a) * (1 - Math.exp(-k * dt));
    if (!c.alive) {
      if (st.deadT < 0) st.deadT = 0;
      st.down = true;
      st.deadT += dt;
      const k = Math.min(1, st.deadT / 0.75);
      const ease = 1 - (1 - k) ** 3;
      const bounce = k >= 1 ? 0 : Math.sin(k * Math.PI) * 0.05;
      B.root.rotation.x = st.fallDir * (Math.PI / 2 - 0.12) * ease;
      B.root.rotation.z = st.fallSide * 0.25 * ease;
      B.root.position.y = 0.12 * ease + bounce - (st.deadT > 3 ? (st.deadT - 3) * 0.25 : 0);
      B.root.position.z = st.fallDir * 0.3 * ease;
      B.thighR.rotation.x = 0.35 * ease * st.fallDir;
      B.thighL.rotation.x = -0.15 * ease;
      B.shinR.rotation.x = -0.6 * ease;
      B.shinL.rotation.x = -0.25 * ease;
      B.chest.rotation.x = -0.15 * ease;
      B.head.rotation.x = 0.3 * ease * st.fallDir;
      mount.position.set(0.25 * ease, -0.1, -0.2);
      mount.rotation.set(-0.4 * ease, 1.1 * ease, 0.6 * ease);
      solveArms(true);
      root.visible = st.deadT < 4.2;
      return;
    }
    if (st.down || st.deadT >= 0) {
      // stand back up — keyed on `down`, so it runs even if deadT was cleared elsewhere
      st.down = false;
      st.deadT = -1;
      B.root.rotation.set(0, 0, 0);
      B.root.position.set(0, 0, 0);
      root.visible = true;
    }
    // heading + locomotion frame
    st.bodyYaw = c.yaw;
    root.rotation.y = c.yaw;
    const sy = Math.sin(c.yaw);
    const cy = Math.cos(c.yaw);
    const fwd = c.vx * -sy + c.vz * -cy;
    const right = c.vx * cy + c.vz * -sy;
    const speed = Math.hypot(c.vx, c.vz);
    const moving = Math.min(1, speed / 4.5);
    let legYaw = 0;
    let dirSign = 1;
    if (speed > 0.4) {
      dirSign = fwd < -0.25 ? -1 : 1;
      legYaw = Math.atan2(-right * dirSign, Math.abs(fwd) + 0.001) * dirSign;
      legYaw = Math.max(-0.9, Math.min(0.9, legYaw));
      if (dirSign < 0) legYaw = -legYaw;
    }
    st.hipYaw = damp(st.hipYaw, legYaw, 8);
    st.crouch = damp(st.crouch, c.crouch, 14);
    st.sprint = damp(st.sprint, c.sprinting ? 1 : 0, 8);
    st.ads = damp(st.ads, c.ads, 10);
    st.air = damp(st.air, c.grounded ? 0 : 1, 10);
    const stride = c.sprinting ? 2.4 : c.crouch > 0.5 ? 1.4 : 1.8;
    st.phase += (speed / stride) * Math.PI * dt * dirSign;
    const ph = st.phase;
    const amp = moving * (0.55 + st.sprint * 0.35) * (1 - st.crouch * 0.45);
    // hips
    const bob = Math.abs(Math.sin(ph)) * 0.04 * moving;
    B.hips.position.y = 0.98 - st.crouch * 0.33 + bob - st.air * 0.04;
    B.hips.rotation.y = st.hipYaw;
    B.hips.rotation.z = Math.sin(ph) * 0.04 * moving;
    B.spine.rotation.y = -st.hipYaw * 0.55;
    B.spine.rotation.x = 0.1 * st.sprint + st.crouch * 0.22;
    // legs
    const swing = Math.sin(ph) * amp;
    B.thighR.rotation.x = swing + st.crouch * 1.3 + st.air * 0.6;
    B.thighL.rotation.x = -swing + st.crouch * 1.05 + st.air * 0.2;
    B.shinR.rotation.x = -Math.max(0, -Math.sin(ph + 0.9)) * amp * 1.4 - st.crouch * 2.05 - st.air * 0.9;
    B.shinL.rotation.x = -Math.max(0, Math.sin(ph + 0.9)) * amp * 1.4 - st.crouch * 1.75 - st.air * 0.5;
    B.thighR.rotation.z = st.crouch * 0.12;
    B.thighL.rotation.z = -st.crouch * 0.2;
    // upper body: aim pitch, flinch, recoil
    st.flinch = damp(st.flinch, 0, 9);
    st.kick = damp(st.kick, 0, 16);
    const pitch = Math.max(-0.9, Math.min(0.9, c.pitch));
    B.chest.rotation.x = pitch * 0.6 * (1 - st.sprint) - st.flinch * 0.3;
    B.chest.rotation.y = -st.hipYaw * 0.45 + 0.28 * (1 - st.sprint);
    B.head.rotation.x = pitch * 0.35;
    B.head.rotation.y = -0.28 * (1 - st.sprint);
    // weapon pose
    const pistol = gun.meta.pistol;
    const reloadK = c.reloading ? Math.sin(Math.min(1, 1 - c.reloadT / Math.max(0.1, c.reloadTotal)) * Math.PI) : 0;
    st.reload = damp(st.reload, reloadK, 10);
    if (pistol) mount.position.set(0.02, 0.2, -0.42 + st.kick * 0.04);
    else mount.position.set(0.075, 0.17 - st.sprint * 0.08, -0.2 + st.kick * 0.05);
    mount.rotation.set(-st.sprint * 0.7 + st.kick * 0.12 - st.reload * 0.4, -0.28 + st.sprint * 0.7, st.reload * 0.5 + st.sprint * 0.2);
    if (gun.parts.mag) gun.parts.mag.position.y = -st.reload * 0.12;
    solveArms(false);
    void t;
  }

  function solveArms(dead) {
    mount.updateMatrix();
    gun.root.updateMatrix();
    _m.copy(mount.matrix).multiply(gun.root.matrix);
    tgtR.copy(gun.anchors.grip.position).applyMatrix4(_m);
    if (dead) {
      tgtL.set(-0.35, -0.35, -0.1);
    } else {
      tgtL.copy(st.reload > 0.2 ? gun.anchors.mag.position : gun.anchors.fore.position).applyMatrix4(_m);
      if (st.reload > 0.2) tgtL.y -= st.reload * 0.12;
    }
    solveArm(B.uarmR, B.farmR, shoulderR, tgtR, poleR);
    solveArm(B.uarmL, B.farmL, shoulderL, tgtL, poleL);
  }

  function onDeath(fromX, fromZ) {
    // fall away from the shooter
    const sy = Math.sin(st.bodyYaw);
    const cy = Math.cos(st.bodyYaw);
    const fwd = fromX * -sy + fromZ * -cy;
    const side = fromX * cy + fromZ * -sy;
    st.fallDir = fwd >= 0 ? 1 : -1;
    st.fallSide = Math.sign(side) * 0.6;
    st.deadT = 0;
  }
  const flinch = () => (st.flinch = 1);
  const fire = () => (st.kick = 1);

  function muzzleWorld(out) {
    return gun.anchors.muzzle.getWorldPosition(out);
  }

  function dispose() {
    visor.geometry.dispose();
    strobe.geometry.dispose();
    visorMat.dispose();
    if (gun) gun.root.traverse((o) => o.isMesh && o.geometry.dispose());
    skeleton.dispose();
  }

  return { root, bones: B, update, setWeapon, onDeath, flinch, fire, muzzleWorld, dispose, state: st, meshes: [clothMesh, gearMesh], get gun() { return gun; } };
}
