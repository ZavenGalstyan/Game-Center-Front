/**
 * Crowd Rush — one stylised runner, drawn as 6 InstancedMeshes (two legs, two
 * arms, torso, head) plus an instanced contact-shadow disc. Every runner in a
 * crowd is one instance in each mesh; the limbs are animated by writing per-
 * instance matrices each frame from a shared gait phase. No skinning, no per-
 * runner React subtree — this is what lets 300+ runners stay smooth.
 *
 * `makeCrowdModel(cap, hex, opts)` returns { group, sync }. Call `sync(entries)`
 * once per frame with `[{ x, y, z, phase, scale, lean, punch }]`; extra capacity
 * is parked at the origin with zero scale.
 */

import * as THREE from "three";

// shared geometries — created once, reused by every crowd (player + all enemies)
const G = {};
function geoms() {
  if (G.head) return G;
  G.head = new THREE.SphereGeometry(0.15, 8, 6);
  G.head.translate(0, 0.075, 0);

  G.torso = new THREE.CapsuleGeometry(0.145, 0.24, 3, 6);
  G.torso.translate(0, -0.02, 0); // pivot roughly at chest

  G.arm = new THREE.CapsuleGeometry(0.052, 0.26, 2, 5);
  G.arm.translate(0, -0.15, 0); // pivot at shoulder

  G.leg = new THREE.CapsuleGeometry(0.066, 0.30, 2, 5);
  G.leg.translate(0, -0.17, 0); // pivot at hip

  G.shadow = new THREE.CircleGeometry(0.28, 12);
  G.shadow.rotateX(-Math.PI / 2);
  return G;
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return c;
}

export function makeCrowdModel(cap, hex, opts = {}) {
  const { skin = "#f0c9a8", darkLimb = true, flat = false } = opts;
  geoms();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: hex,
    roughness: flat ? 0.9 : 0.55,
    metalness: 0,
    emissive: new THREE.Color(hex).multiplyScalar(flat ? 0 : 0.06),
  });
  const limbMat = new THREE.MeshStandardMaterial({
    color: darkLimb ? shade(hex, -0.14) : hex,
    roughness: 0.7,
  });
  const headMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
  const shadowMat = new THREE.MeshBasicMaterial({
    color: "#000",
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });

  const mk = (geo, mat) => {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
  };

  const meshes = {
    shadow: mk(G.shadow, shadowMat),
    legL: mk(G.leg, limbMat),
    legR: mk(G.leg, limbMat),
    torso: mk(G.torso, bodyMat),
    armL: mk(G.arm, limbMat),
    armR: mk(G.arm, limbMat),
    head: mk(G.head, headMat),
  };

  const group = new THREE.Group();
  Object.values(meshes).forEach((m) => group.add(m));

  const d = new THREE.Object3D(); // scratch
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  function place(mesh, i, px, py, pz, rx, s, sy) {
    d.position.set(px, py, pz);
    e.set(rx, 0, 0);
    q.setFromEuler(e);
    d.quaternion.copy(q);
    d.scale.set(s, sy ?? s, s);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  }

  function sync(entries) {
    const n = Math.min(entries.length, cap);
    for (let i = 0; i < cap; i++) {
      if (i >= n) {
        place(meshes.shadow, i, 0, -50, 0, 0, 0.0001);
        place(meshes.legL, i, 0, -50, 0, 0, 0.0001);
        place(meshes.legR, i, 0, -50, 0, 0, 0.0001);
        place(meshes.torso, i, 0, -50, 0, 0, 0.0001);
        place(meshes.armL, i, 0, -50, 0, 0, 0.0001);
        place(meshes.armR, i, 0, -50, 0, 0, 0.0001);
        place(meshes.head, i, 0, -50, 0, 0, 0.0001);
        continue;
      }
      const en = entries[i];
      const s = en.scale ?? 1;
      const p = en.phase;
      const lean = en.lean ?? 0.14;
      const punch = en.punch ?? 0;
      const swing = Math.sin(p);
      const bob = Math.abs(Math.cos(p)) * 0.045 * s;
      const y = en.y + bob;

      // shadow shrinks as the runner is knocked up on death (scale carries it)
      place(meshes.shadow, i, en.x, 0.02, en.z, 0, Math.max(0.0001, s) * (0.9 + swing * 0.05));

      // legs pivot at hip y≈0.5*s
      const hipY = y + 0.52 * s;
      place(meshes.legL, i, en.x - 0.075 * s, hipY, en.z, swing * 0.95, s);
      place(meshes.legR, i, en.x + 0.075 * s, hipY, en.z, -swing * 0.95, s);

      // torso centre ≈ 0.72*s, leans forward with run, compresses on punch
      place(meshes.torso, i, en.x, y + 0.74 * s, en.z, lean + punch * 0.25, s, s * (1 - punch * 0.12));

      // arms pivot at shoulder ≈ 0.92*s
      const shY = y + 0.92 * s;
      const armSwing = 0.7 - punch * 0.4;
      place(meshes.armL, i, en.x - 0.17 * s, shY, en.z, -swing * armSwing - punch * 0.8, s);
      place(meshes.armR, i, en.x + 0.17 * s, shY, en.z, swing * armSwing - punch * 0.8, s);

      // head ≈ 1.02*s
      place(meshes.head, i, en.x, y + 1.03 * s, en.z, lean * 0.6, s);
    }
    for (const m of Object.values(meshes)) {
      m.count = cap;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  function dispose() {
    for (const m of Object.values(meshes)) m.dispose();
    bodyMat.dispose();
    limbMat.dispose();
    headMat.dispose();
    shadowMat.dispose();
  }

  return { group, sync, meshes, dispose };
}
