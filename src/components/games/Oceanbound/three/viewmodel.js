/**
 * Oceanbound — first-person arm and held item.
 *
 * Rendered in its own small scene after the world (depth cleared) so tools
 * never clip into walls. Poses are layered: equip raise, walk/swim bob,
 * look sway, then the action (hook charge + throw + reel, rod cast + bite
 * twitch, axe chop arc, spear thrust, hammer taps, eat/drink to the mouth,
 * cup dip). The held tool tip's world position feeds the hook / fishing line.
 */
import * as THREE from "three";
import { ITEMS, PLACEABLE } from "../data/items.js";
import { geoParts, MATS } from "./models.js";

const MODEL_FOR = {
  hook: ["t_hook", 1],
  axe: ["t_axe", 1],
  rod: ["t_rod", 1],
  spear: ["t_spear", 1],
  hammer: ["t_hammer", 1],
  cup_empty: ["t_cup", 1],
  cup_salt: ["t_cup", 1],
  cup_fresh: ["t_cup", 1],
  fish_raw: ["f_fish_raw", 0.8],
  fish_cooked: ["f_fish_cooked", 0.8],
  coconut: ["f_coconut", 1],
  mango: ["f_mango", 1],
  shark_raw: ["f_shark_raw", 1],
  shark_cooked: ["f_shark_cooked", 1],
  bandage: ["f_bandage", 1],
  plank: ["d_plank", 0.32],
  plastic: ["d_plastic", 0.8],
  leaf: ["d_leaf", 0.4],
  scrap: ["d_scrap", 0.5],
  stone: ["stone", 0.8],
  clay: ["clay", 0.4],
  palmwood: ["driftwood", 0.32],
};
for (const k in PLACEABLE) MODEL_FOR[k] = [k === "sail" ? "sail" : k, k === "sail" ? 0.06 : 0.2];

export function createViewmodel() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
  const hemi = new THREE.HemisphereLight("#cfe8ff", "#6a7a6a", 1.1);
  const sun = new THREE.DirectionalLight("#ffffff", 1.4);
  sun.position.set(0.4, 1, 0.3);
  scene.add(hemi, sun, camera);
  const vmMats = new Map();
  const vmMat = (k) => {
    if (vmMats.has(k)) return vmMats.get(k);
    const src = MATS[k];
    const m = src.isMeshStandardMaterial ? new THREE.MeshStandardMaterial({ map: src.map, vertexColors: src.vertexColors, roughness: src.roughness, metalness: src.metalness * 0.6, alphaTest: src.alphaTest, side: src.side, transparent: src.transparent }) : src;
    vmMats.set(k, m);
    return m;
  };
  const build = (key, scale = 1) => {
    const g = new THREE.Group();
    for (const [geo, k] of geoParts(key) || []) g.add(new THREE.Mesh(geo, vmMat(k)));
    g.scale.setScalar(scale);
    return g;
  };
  const rig = new THREE.Group(); // whole hand
  camera.add(rig);
  const armM = build("arm");
  // forearm runs back toward the lower-right corner, out of view
  armM.rotation.set(0.35, 0.3, 0);
  rig.add(armM);
  const holder = new THREE.Group();
  holder.position.set(0, 0.01, -0.07);
  rig.add(holder);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.055, 14), new THREE.MeshStandardMaterial({ color: "#3a9ec8", transparent: true, opacity: 0.85, roughness: 0.1 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.07, -0.05);
  const tip = new THREE.Object3D();
  holder.add(tip);
  const cache = new Map();
  let cur = null;
  let curKey = null;
  let equipT = 1;
  let lastEq = undefined;
  const sway = { x: 0, y: 0 };
  let lastYaw = 0;
  let lastPitch = 0;
  const base = new THREE.Vector3(0.27, -0.25, -0.56);
  const tipLocal = { hook: [0, 0, -0.38], rod: [0, 0, -1.42], spear: [0, 0, -1.5] };

  function setItem(id) {
    const def = id ? MODEL_FOR[id] : null;
    const key = def ? def[0] + ":" + def[1] : null;
    if (key === curKey) return;
    curKey = key;
    if (cur) holder.remove(cur);
    cur = null;
    if (!def) return;
    if (!cache.has(key)) {
      const m = build(def[0], def[1]);
      if (PLACEABLE[id]) m.position.set(0, -0.02, -0.08);
      if (["plank", "plastic", "leaf", "scrap", "stone", "clay", "palmwood"].includes(id)) m.position.set(0, 0, -0.08);
      cache.set(key, m);
    }
    cur = cache.get(key);
    holder.add(cur);
  }

  return {
    scene,
    camera,
    tip,
    /** returns the tool tip in main-camera-local coordinates */
    update(G, dt, time, mainCam, settings) {
      const P = G.player;
      const eq = G.inv.slots[G.sel];
      const id = eq ? eq.id : null;
      if (id !== lastEq) {
        if (lastEq !== undefined) equipT = 0;
        lastEq = id;
      }
      equipT = Math.min(1, equipT + dt * 3.2);
      if (equipT > 0.45 || lastEq === undefined) setItem(id);
      camera.aspect = mainCam.aspect;
      camera.updateProjectionMatrix();
      // water in the cup
      if (id && id.startsWith("cup_")) {
        if (water.parent !== holder) holder.add(water);
        water.visible = id !== "cup_empty";
        water.material.color.set(id === "cup_salt" ? "#4e9fa8" : "#6fc8f0");
      } else if (water.parent) water.parent.remove(water);
      // sway from look motion
      let dy = P.yaw - lastYaw;
      let dp = P.pitch - lastPitch;
      if (Math.abs(dy) > 1) dy = 0;
      lastYaw = P.yaw;
      lastPitch = P.pitch;
      sway.x += (dy * 0.6 - sway.x) * Math.min(1, dt * 8);
      sway.y += (-dp * 0.6 - sway.y) * Math.min(1, dt * 8);
      const bobOn = settings?.bob !== false;
      const sp = Math.hypot(P.vx - (P.onRaftFrame ? G.raft.vx : 0), P.vz - (P.onRaftFrame ? G.raft.vz : 0));
      const bk = bobOn ? Math.min(1, sp / 4) : 0;
      const bx = Math.sin(P.bob * 3.1) * 0.018 * bk;
      const by = -Math.abs(Math.cos(P.bob * 3.1)) * 0.02 * bk;
      const breathe = Math.sin(time * 1.6) * 0.004;
      let px = base.x + bx + sway.x * 0.4;
      let py = base.y + by + breathe + sway.y * 0.3 - (1 - equipT) * 0.35;
      let pz = base.z;
      let rx = 0;
      let ry = sway.x * 0.6;
      let rz = 0;
      const kind = id ? ITEMS[id]?.tool?.type : null;
      // tool-specific idle pose
      if (kind === "spear") {
        rx = 0.08;
        py += 0.03;
      } else if (kind === "rod") {
        rx = 0.35;
      } else if (kind === "axe" || kind === "hammer") {
        rx = 0.25;
        rz = -0.15;
      }
      // actions
      const H = G.hook;
      const Rd = G.rod;
      if (kind === "hook") {
        if (H.state === "charge") {
          pz += H.charge * 0.12;
          py += H.charge * 0.06;
          rx += H.charge * 0.7;
        } else if (G.use.kind === "throw") {
          const t = Math.min(1, G.use.t / 0.35);
          rx -= Math.sin(t * Math.PI) * 0.9;
          pz -= Math.sin(t * Math.PI) * 0.1;
        } else if (H.state === "water" && H.reeling) {
          rx += Math.sin(time * 14) * 0.08;
          rz += Math.cos(time * 14) * 0.08;
          pz += 0.03;
        }
      }
      if (kind === "rod") {
        if (Rd.state === "charge") rx += Rd.charge * 0.8;
        else if (G.use.kind === "cast") {
          const t = Math.min(1, G.use.t / 0.4);
          rx -= Math.sin(t * Math.PI) * 0.9;
        } else if (Rd.state === "bite") {
          rx -= 0.15 + Math.sin(time * 40) * 0.06;
          rz += Math.sin(time * 33) * 0.05;
        } else if (Rd.state === "wait") rx -= 0.1;
      }
      if (G.swing) {
        const S = G.swing;
        const t = S.t / S.dur;
        if (S.kind === "axe") {
          // wind up, chop, recover
          if (t < 0.4) {
            const k = t / 0.4;
            rx += k * 1.1;
            py += k * 0.1;
            px -= k * 0.05;
          } else if (t < 0.58) {
            const k = (t - 0.4) / 0.18;
            rx += 1.1 - k * 2.2;
            py += 0.1 - k * 0.2;
            pz -= k * 0.12;
          } else {
            const k = (t - 0.58) / 0.42;
            rx += -1.1 * (1 - k);
            py += -0.1 * (1 - k);
            pz -= 0.12 * (1 - k);
          }
        } else {
          const k = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
          pz -= k * 0.38;
          px -= k * 0.08;
          py += k * 0.04;
        }
      }
      if (G.use.kind === "hammer") {
        const t = G.use.t / 0.7;
        rx += Math.sin(Math.min(1, t * 2) * Math.PI) * -0.9;
      }
      if (G.use.kind === "eat" || G.use.kind === "drink") {
        const t = Math.sin(Math.min(1, G.use.t / 0.7) * Math.PI);
        px -= t * 0.2;
        py += t * 0.16;
        pz += t * 0.14;
        rx -= t * (G.use.kind === "drink" ? 1.1 : 0.5);
      }
      if (G.use.kind === "fill") {
        const t = Math.sin(Math.min(1, G.use.t / 0.6) * Math.PI);
        py -= t * 0.15;
        rx += t * 0.6;
      }
      if (P.mode === "swim" && !G.swing && H.state !== "charge" && Rd.state !== "charge") {
        // breaststroke drift
        const st = Math.sin(time * 3.2);
        px += st * 0.05;
        py -= 0.06 + Math.abs(st) * 0.03;
        rz += st * 0.2;
      }
      if (G.dead) py -= 1;
      rig.position.set(px, py, pz);
      rig.rotation.set(rx, ry, rz, "YXZ");
      // tip of rope / line tools
      const tl = tipLocal[kind] || [0, 0, -0.2];
      tip.position.set(tl[0], tl[1], tl[2]);
      // sync lighting to the world
      return tip;
    },
    setLight(sunCol, sunI, skyCol, groundCol, amb) {
      sun.color.copy(sunCol);
      sun.intensity = 0.4 + sunI * 1.3;
      hemi.color.copy(skyCol);
      hemi.groundColor.copy(groundCol);
      hemi.intensity = 0.5 + amb * 0.9;
    },
    tipWorld(mainCam, out) {
      // map the vm tip (vm camera space) into the main camera's space
      tip.updateWorldMatrix(true, false);
      out.setFromMatrixPosition(tip.matrixWorld);
      // vm camera sits at the origin with identity rotation
      return mainCam.localToWorld(out);
    },
    dispose() {
      for (const m of vmMats.values()) if (m !== MATS.glow) m.dispose?.();
      water.geometry.dispose();
      water.material.dispose();
    },
  };
}
