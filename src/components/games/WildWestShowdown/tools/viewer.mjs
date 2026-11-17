// DEV-only: see viewer.html. Lines up cowboys (seated on stools) under a key light.
import * as THREE from "three";
import { loadRigs } from "../../DeckOfShadows/render/assets.js";
import { buildCowboy } from "../render/cowboy.js";
import { RIVALS } from "../engine/rivals.js";
import { loadSkyEnv } from "../render/assets.js";

const P = new URLSearchParams(location.search);
const el = document.getElementById("s");
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(el.clientWidth, el.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
el.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1612);
const cam = new THREE.PerspectiveCamera(+(P.get("fov") || 30), el.clientWidth / el.clientHeight, 0.05, 50);
const key = new THREE.SpotLight(0xffd9a8, 40, 12, 0.7, 0.6, 1.5);
key.position.set(0.8, 3.2, 2.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key, key.target, new THREE.HemisphereLight(0xb8c4d8, 0x2a2018, 0.6));
const fill = new THREE.DirectionalLight(0xa8b8d8, 0.6);
fill.position.set(-3, 2, 1);
scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const ids = (P.get("ids") || "tate,holloway,prowse,donovan").split(",");
const seatY = +(P.get("seat") || 0.46);
window.__v = { scene, cam, renderer, cows: [] };
window.__v.ready = (async () => {
  scene.environment = await loadSkyEnv(renderer, P.get("sky") || "day");
  scene.environmentIntensity = 0.4;
  const rigs = await loadRigs();
  const tl = new THREE.TextureLoader();
  const darkMaps = {};
  for (const [k, f] of [["m", "m_dark.jpg"], ["f", "f_dark.jpg"]]) {
    const t = await tl.loadAsync(`/models/neon-mercenary/${f}`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
    darkMaps[k] = t;
  }
  ids.forEach((id, i) => {
    const c = buildCowboy(rigs, RIVALS[id], { darkMaps });
    const x = (i - (ids.length - 1) / 2) * 0.85;
    c.root.position.set(x, 0, 0);
    scene.add(c.root);
    const stool = new THREE.Mesh(new THREE.BoxGeometry(0.45, seatY, 0.42), new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.7 }));
    stool.position.set(x, seatY / 2, -0.05);
    stool.castShadow = stool.receiveShadow = true;
    scene.add(stool);
    window.__v.cows.push(c);
    if (P.get("ik")) {
      const y = 0.79, z = 0.62;
      c.seat.setAnchors({ cards: new THREE.Vector3(x, y, z - 0.1), stack: new THREE.Vector3(x - 0.2, y, z - 0.1), bet: new THREE.Vector3(x, y, z - 0.3), muck: new THREE.Vector3(x, y, z - 0.4), pot: new THREE.Vector3(x, y, z - 0.6), rest: { l: new THREE.Vector3(x + 0.19, y, z), r: new THREE.Vector3(x - 0.19, y, z) }, chin: () => c.headPos(new THREE.Vector3()).add(new THREE.Vector3(0, -0.12, 0.07)) });
    }
  });
  const view = P.get("view") || "front";
  if (view === "front") { cam.position.set(0, 1.25, 3.6); cam.lookAt(0, 0.95, 0); }
  else if (view === "face") { cam.position.set(0, 1.42, 1.3); cam.lookAt(0, 1.38, 0); }
  else if (view === "side") { cam.position.set(3.2, 1.1, 0.4); cam.lookAt(0, 0.8, 0); }
  window.__v.advance(+(P.get("t") || 0.6));
  return true;
})();
window.__v.advance = (sec, steps = 20) => {
  for (let i = 0; i < steps; i++) for (const c of window.__v.cows) c.update(sec / steps, { lookTargets: [] , idle: false});
  renderer.render(scene, cam);
};
window.__v.render = () => renderer.render(scene, cam);
