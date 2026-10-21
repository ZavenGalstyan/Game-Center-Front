/**
 * DEV character viewer (not shipped): /src/components/games/NeonMercenary/tools/viewer.html?set=enemies|npcs|bosses|player&clip=Idle&yaw=0
 * window.__view(specs, opts) re-renders a custom lineup; window.__ready resolves when drawn.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadAssets } from "../render/assets.js";
import { createCharacter } from "../render/characters.js";
import { ENEMIES } from "../data/enemies.js";
import { NPCS, CIVILIANS } from "../data/npcs.js";
import { BOSSES } from "../engine/bosses.js";

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#141420");
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
scene.add(new THREE.HemisphereLight(0x8090c0, 0x101018, 1.2));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(3, 6, 6);
key.castShadow = true;
scene.add(key);
const rim = new THREE.DirectionalLight(0xff4fd8, 1.6);
rim.position.set(-4, 3, -5);
scene.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: "#1a1a24", roughness: 0.4, metalness: 0.2 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
let chars = [];
const assets = await loadAssets();

const sets = {
  enemies: () => Object.entries(ENEMIES).filter(([, e]) => !e.flyer).map(([k, e]) => ({ label: k, look: e.look, weapon: e.look.weapon })),
  npcs: () => Object.entries(NPCS).map(([k, n]) => ({ label: k, look: n.look })),
  civs: () => CIVILIANS.map((l, i) => ({ label: `civ${i}`, look: l })),
  bosses: () => Object.entries(BOSSES).map(([k, b]) => ({ label: k, look: b.look, weapon: b.look.weapon === "minigun" ? null : b.look.weapon })),
  player: () => ["jacket", "kevlar", "tactical", "weave", "aegis"].map((a, i) => ({ label: a, look: { body: i % 2 ? "f" : "m", hair: i % 2 ? "Hair_Long" : "Hair_SimpleParted", skin: i === 3 ? "dark" : "light", suit: "#2a2d38", coat: ["#4a2a56", "#3e4a3a", "#3c4450", "#3a1c3a", "#4a505c"][i], trim: "#19f0ff", gear: "player", bodyArmor: a, headArmor: ["visor", "helmet", "smartVisor", "kitsune", "halo"][i] }, weapon: "pistol" })),
};

window.__view = async (specs, opts = {}) => {
  for (const c of chars) {
    scene.remove(c.root);
    c.dispose();
  }
  chars = [];
  const n = specs.length;
  const gap = opts.gap || 1.15;
  specs.forEach((sp, i) => {
    const c = createCharacter(assets, sp.look);
    c.root.position.set((i - (n - 1) / 2) * gap, 0, 0);
    c.root.rotation.y = opts.yaw ?? 0;
    if (sp.weapon) c.setWeapon(sp.weapon, sp.look.trim);
    c.anim.set("lower", opts.clip || "Idle");
    c.anim.set("upper", opts.upper || (sp.weapon && !opts.clip ? "GunIdle" : opts.clip || "Idle"));
    c.anim.set("full", opts.full || null, opts.fullTime != null ? { time: opts.fullTime } : {});
    for (let k = 0; k < 40; k++) c.anim.update(1 / 30);
    if (opts.aim) c.aim(opts.aim);
    scene.add(c.root);
    chars.push(c);
  });
  document.getElementById("lbl").innerHTML = specs.map((s) => `<span>${s.label}</span>`).join("");
  const w = n * gap + 1;
  const dist = opts.dist || Math.max(4, w * 1.7);
  camera.position.set(opts.cx || 0, opts.cy || 1.1, dist);
  camera.lookAt(opts.cx || 0, opts.ly || 0.95, 0);
  renderer.render(scene, camera);
  return true;
};
window.__sets = sets;
window.__ready = window.__view(sets[q.get("set") || "enemies"](), { clip: q.get("clip") || undefined, yaw: +(q.get("yaw") || 0) });
