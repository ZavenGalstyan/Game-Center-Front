/**
 * DEV character viewer (not shipped):
 *   /src/components/games/CrownOfAshes/tools/chars.html
 * window.__view(specs, opts) renders a lineup; specs: [{label, look, weapon, offhand, shield}]
 * opts: {full, fullTime, upper, lower, yaw, dist, cy, ly, bow}
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadAssets } from "../render/assets.js";
import { createCharacter } from "../render/characters.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#2a2a30");
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
scene.add(new THREE.HemisphereLight(0xc0d0ff, 0x302820, 1.1));
const key = new THREE.DirectionalLight(0xfff0dd, 2.4);
key.position.set(3, 6, 6);
key.castShadow = true;
scene.add(key);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: "#4a4438", roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
let chars = [];
const assets = await loadAssets();
window.__view = (specs, opts = {}) => {
  for (const c of chars) {
    scene.remove(c.root);
    c.dispose();
  }
  chars = [];
  const n = specs.length;
  const gap = opts.gap || 1.3;
  specs.forEach((sp, i) => {
    const c = createCharacter(assets, sp.look);
    c.root.position.set((i - (n - 1) / 2) * gap, 0, 0);
    c.root.rotation.y = opts.yaw ?? 0;
    if (sp.weapon) c.setWeapon(sp.weapon);
    if (sp.offhand) c.setOffhand(sp.offhand);
    if (sp.shield) c.setShield(sp.shield, sp.sigil || "wardens", sp.sigilColor || "#2b4a7a");
    c.anim.set("lower", opts.lower || "Idle");
    c.anim.set("upper", sp.upper || opts.upper || "Idle");
    const full = sp.full || opts.full || null;
    c.anim.set("full", full, (sp.fullTime ?? opts.fullTime) != null ? { time: sp.fullTime ?? opts.fullTime } : {});
    for (let k = 0; k < 40; k++) c.anim.update(1 / 30);
    if (opts.bow || sp.bow) c.bowPose(opts.bow || sp.bow);
    c.capeUpdate(0.1, 0, 0);
    scene.add(c.root);
    chars.push(c);
  });
  document.getElementById("lbl").innerHTML = specs.map((s) => `<span>${s.label || ""}</span>`).join("");
  const w = n * gap + 1;
  const dist = opts.dist || Math.max(4, w * 1.7);
  camera.position.set(opts.cx || 0, opts.cy || 1.2, dist);
  camera.lookAt(opts.cx || 0, opts.ly || 0.95, 0);
  renderer.render(scene, camera);
  return true;
};
window.__ready = true;
