/**
 * DEV rig viewer: /src/components/games/UltimateMMA3D/tools/viewer.html
 *   window.__view([{clip:'Jab', t:0.2, look:{...}}, ...], {yaw, dist, y, fov})
 * lines fighters up left→right and renders one frame (no rAF needed).
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadAssets } from "../render/assets.js";
import { createRig } from "../render/rig.js";
import { GROUND_LAYOUT } from "../render/clips.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#202228");
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight("#cfd8ff", "#3a2a20", 0.6));
const key = new THREE.DirectionalLight("#fff3e0", 2.2);
key.position.set(3, 6, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 4, bottom: -2 });
scene.add(key);
const rim = new THREE.DirectionalLight("#9fc4ff", 1.2);
rim.position.set(-4, 3, -5);
scene.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: "#d9d6cf", roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 100);

let assets = null;
let rigs = [];
window.__ready = loadAssets().then((a) => {
  assets = a;
  window.__clips = Object.keys(a.clips);
  return true;
});

window.__view = (specs, cam = {}) => {
  rigs.forEach((r) => {
    scene.remove(r.root);
    r.dispose();
  });
  rigs = [];
  const gap = cam.gap ?? 1.0;
  specs.forEach((s, i) => {
    const r = createRig(assets, s.look || { hair: "Hair_Buzzed", beard: true });
    r.root.position.set(s.x ?? (i - (specs.length - 1) / 2) * gap, 0, s.z || 0);
    r.root.rotation.y = s.rot ?? 0;
    if (s.layout) {
      // top fighter of a ground pair: placed relative to the previous (bottom) rig
      const b = rigs[rigs.length - 1].root;
      const L = GROUND_LAYOUT[s.layout];
      const off = new THREE.Vector3(...L.off).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.rotation.y);
      r.root.position.copy(b.position).add(off);
      r.root.rotation.y = b.rotation.y + L.yaw;
    }
    const mixer = new THREE.AnimationMixer(r.model);
    if (s.clip) {
      const a = mixer.clipAction(assets.clips[s.clip]);
      a.play();
      mixer.setTime(0);
      a.time = Math.min(s.t || 0, assets.clips[s.clip].duration);
      mixer.update(0);
    }
    if (s.sweat) r.setSweat(s.sweat);
    if (s.bruise) r.setBruise(s.bruise);
    scene.add(r.root);
    rigs.push(r);
  });
  const yaw = cam.yaw ?? 0.5;
  const dist = cam.dist ?? 3 + specs.length * 0.9;
  const y = cam.y ?? 1.1;
  camera.fov = cam.fov ?? 35;
  camera.position.set(Math.sin(yaw) * dist + (cam.x || 0), y + (cam.up ?? 0.3), Math.cos(yaw) * dist);
  camera.lookAt(cam.x || 0, y, 0);
  camera.updateProjectionMatrix();
  scene.updateMatrixWorld(true);
  renderer.render(scene, camera);
  document.getElementById("lbl").innerHTML = specs.map((s) => `<span>${s.clip || "rest"} ${s.t ?? ""}</span>`).join("");
  return renderer.info.render.triangles;
};
