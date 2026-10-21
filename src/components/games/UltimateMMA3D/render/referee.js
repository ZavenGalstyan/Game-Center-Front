/**
 * The referee — the CC0 Quaternius "Ultimate Modular Men" casual model that
 * already ships with the Game Center (/models/school-life), dressed in a
 * black officiating shirt and dark trousers, with its own Idle / Walk / Wave /
 * Interact clips. He keeps to the far side of the fighters (never between
 * them and the camera), steps in for breaks and waves fights off.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skClone } from "three/examples/jsm/utils/SkeletonUtils.js";

const DIR = `${import.meta.env?.BASE_URL || "/"}models/school-life/`;
let cache = null;

export function loadReferee() {
  if (!cache) {
    const L = new GLTFLoader();
    cache = Promise.all([L.loadAsync(`${DIR}M_Casual_2.glb`), L.loadAsync(`${DIR}M_anims.glb`)]).catch((e) => {
      cache = null;
      throw e;
    });
  }
  return cache;
}

export function createReferee([model, anims]) {
  const root = new THREE.Group();
  const m = skClone(model.scene);
  root.add(m);
  const mats = [];
  m.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false;
    const src = Array.isArray(o.material) ? o.material : [o.material];
    const out = src.map((mt) => {
      const c = mt.clone();
      const n = mt.name;
      if (n === "LightBrown" || n === "Red_Dark") c.color.set("#0b0b0d"); // shirt / trousers
      else if (n === "White") c.color.set("#cfcfcf");
      else if (n === "LightBlue") c.color.set("#111");
      c.roughness = 0.75;
      mats.push(c);
      return c;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  m.scale.setScalar(1.0);
  const mixer = new THREE.AnimationMixer(m);
  const clip = (n) => anims.animations.find((a) => a.name === n);
  const act = {};
  for (const n of ["Idle", "Walk", "Wave", "Interact"]) {
    const c = clip(n);
    if (!c) continue;
    act[n] = mixer.clipAction(c);
    act[n].play();
    act[n].setEffectiveWeight(n === "Idle" ? 1 : 0);
  }
  const w = { Idle: 1, Walk: 0, Wave: 0, Interact: 0 };
  const pos = new THREE.Vector3(0, 0, 2.6);
  let yaw = Math.PI;
  return {
    root,
    /** Steer toward `target` (x,z) while facing `look`; gesture: null | 'Wave' | 'Interact'. */
    update(dt, target, look, gesture) {
      const d = new THREE.Vector3(target.x - pos.x, 0, target.z - pos.z);
      const dist = d.length();
      const speed = Math.min(2.2, dist * 2.2);
      if (dist > 0.03) pos.addScaledVector(d.normalize(), speed * dt);
      const want = Math.atan2(look.x - pos.x, look.z - pos.z);
      let dy = want - yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      yaw += dy * Math.min(1, dt * 6);
      root.position.copy(pos);
      root.rotation.y = yaw;
      const moving = speed > 0.25 ? Math.min(1, speed / 1.2) : 0;
      const tw = { Idle: 1 - moving, Walk: moving, Wave: 0, Interact: 0 };
      if (gesture && act[gesture]) {
        tw[gesture] = 1;
        tw.Idle = tw.Walk = 0;
      }
      let sum = 0;
      for (const k of Object.keys(w)) {
        w[k] += ((tw[k] || 0) - w[k]) * Math.min(1, dt * 6);
        sum += w[k];
      }
      for (const k of Object.keys(act)) act[k].setEffectiveWeight(w[k] / (sum || 1));
      if (act.Walk) act.Walk.timeScale = 0.6 + moving * 0.8;
      mixer.update(dt);
    },
    place(x, z) {
      pos.set(x, 0, z);
    },
    dispose() {
      mixer.stopAllAction();
      m.traverse((o) => o.isSkinnedMesh && o.skeleton.dispose());
      mats.forEach((x) => x.dispose());
    },
  };
}
