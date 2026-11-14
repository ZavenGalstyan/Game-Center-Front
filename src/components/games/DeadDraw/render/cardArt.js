/**
 * Card illustrations, rendered once per session as small photographic
 * still-lifes of the same scanned CC0 props that furnish the bunker (jerrycan,
 * ration tins, radio, generator, gas mask, medical case…) on a concrete
 * backdrop under a hard torch key light and a coloured rim. A short-lived
 * offscreen WebGLRenderer writes data URLs the DOM cards use as artwork.
 * No text is drawn into the images, so they work in every language.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadProp, loadPart, fitProp, pbr } from "./assets.js";

const W = 320;
const H = 240;
const cache = new Map();
let pending = null;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* art key → props (name | [name, part]), sizes, key/rim colours, camera */
const ART = {
  supplies: { props: [["long_life_food", 0.55, [0, 0, 0], 0.2]], rim: 0xffb060 },
  water: { props: [["metal_jerrycan", 0.5, [-0.12, 0, 0], 0.5], ["plastic_bottle_gallon", 0.3, [0.24, 0, 0.12], -0.3]], rim: 0x5fb0ff },
  rations: { props: [["russian_food_cans_01", 0.5, [0, 0, 0], 0.3, "x"]], rim: 0xffa040 },
  salvage: { props: [["pipe_wrench", 0.42, [-0.08, 0, 0], 0, "y", [Math.PI / 2, 0, 0.6]], ["crowbar_01", 0.6, [0.08, 0.02, 0.05], 0, "y", [Math.PI / 2, 0, -0.5]]], rim: 0xff7a3a },
  battery: { props: [["pastic_torch_6v", 0.32, [0, 0, 0], 0.7]], rim: 0x9cff7a },
  barricade: { props: [["cement_bag", 0.5, [0, 0, 0], 0.4, "x"], ["cement_bag", 0.5, [0.02, 0.17, 0.02], 0.2, "x"]], rim: 0x8fb3ff },
  security: { props: [["security_camera_01", 0.5, [0, 0.1, 0], -0.8, "z"]], rim: 0xff3030 },
  reinforce: { props: [["metal_toolbox", 0.45, [0, 0, 0], 0.6, "x"]], rim: 0x7fb0ff },
  lockdown: { props: [["security_light", 0.45, [0, 0, 0], 0.3]], rim: 0xff2010, glow: 0xff2a10 },
  corridor: { props: [["vintage_flashlight", 0.42, [0, 0, 0], 0.9, "z"]], rim: 0xffe0a0 },
  storage: { props: [["cardboard_box_01", 0.45, [-0.1, 0, 0], 0.4], ["can_rusted", 0.16, [0.26, 0, 0.18], 0]], rim: 0xc9a070 },
  noise: { props: [["street_rat", 0.42, [0, 0, 0], 0.9, "z"]], rim: 0xa0ffd0 },
  sealed: { props: [["ammo_box", 0.42, [0, 0, 0], 1.2, "z"]], rim: 0xffc060 },
  medkit: { props: [["medical_box", 0.5, [0, 0, 0], 0.4, "x"]], rim: 0xff5050 },
  rest: { props: [["metal_stool_01", 0.6, [0, 0, 0], 0.5]], rim: 0x6080ff },
  purify: { props: [["plastic_bottle_gallon", 0.4, [0, 0, 0], 0.4]], rim: 0x60e0ff },
  generator: { props: [["portable_generator", 0.62, [0, 0, 0], 0.6, "x"]], rim: 0xffd040 },
  signal: { props: [["vintage_radio_transceiver", 0.62, [0, 0, 0], 0.35, "x"]], rim: 0x40ff90, glow: 0xffa040 },
  footsteps: { props: [["old_gas_mask", 0.55, [0, 0.05, 0], 0.3]], rim: 0x90a0ff },
  package: { props: [["cardboard_box_01", 0.42, [0, 0, 0], 0.9]], rim: 0xc070ff },
  forbidden: { props: [["old_gas_mask", 0.5, [0, 0.05, 0], -0.4]], rim: 0xff1a1a, glow: 0xff1a1a },
};

async function vignette(renderer, key) {
  const A = ART[key];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);
  const pm = new THREE.PMREMGenerator(renderer);
  const envRT = pm.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.15;
  // concrete floor + wall corner
  const floorMat = pbr("concrete_floor_worn_001", { repeat: [1.2, 1.2], color: 0x9a958c });
  const wallMat = pbr("concrete_wall_008", { repeat: [1.2, 1.2], color: 0x8c877e });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), wallMat);
  wall.position.set(0, 1, -0.6);
  wall.receiveShadow = true;
  scene.add(floor, wall);
  const group = new THREE.Group();
  for (const [name, size, pos, rotY, axis = "y", rot = null] of A.props) {
    const p = Array.isArray(name) ? await loadPart(name[0], name[1]) : await loadProp(name);
    if (rot) p.rotation.set(rot[0], rot[1], rot[2]);
    const w = fitProp(p, size, axis);
    w.position.set(pos[0], pos[1], pos[2]);
    w.rotation.y = rotY;
    w.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    group.add(w);
  }
  scene.add(group);
  group.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(group);
  const c = bb.getCenter(V());
  const r = bb.getSize(V()).length() * 0.5;
  // lights: hard torch key from the front-left, coloured rim from behind, dim fill
  const keyL = new THREE.SpotLight(0xfff0d8, 48, 6, 0.45, 0.5, 1.6);
  keyL.position.set(c.x - 0.9, c.y + 1.1, c.z + 1.1);
  keyL.target.position.copy(c);
  keyL.castShadow = true;
  keyL.shadow.mapSize.set(512, 512);
  keyL.shadow.bias = -0.0005;
  const rim = new THREE.PointLight(A.rim, 6, 3, 2);
  rim.position.set(c.x + 0.6, c.y + 0.5, c.z - 0.5);
  scene.add(keyL, keyL.target, rim, new THREE.HemisphereLight(0x404850, 0x050505, 0.4));
  if (A.glow) {
    const g = new THREE.PointLight(A.glow, 3, 1.5, 2);
    g.position.set(c.x, c.y + 0.1, c.z + 0.25);
    scene.add(g);
  }
  scene.fog = new THREE.FogExp2(0x050505, 0.35);
  const cam = new THREE.PerspectiveCamera(32, W / H, 0.02, 20);
  const dist = r / Math.tan((32 * Math.PI) / 360) * 0.95 + 0.1;
  cam.position.set(c.x + dist * 0.18, c.y + dist * 0.42, c.z + dist * 0.9);
  cam.lookAt(c.x, c.y - r * 0.05, c.z);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL("image/jpeg", 0.86);
  envRT.dispose();
  pm.dispose();
  floor.geometry.dispose();
  wall.geometry.dispose();
  floorMat.dispose();
  wallMat.dispose();
  return url;
}

/** Render every art key once (sequentially); onEach(key) after each finishes. */
export function generateCardArt(keys, onEach) {
  if (pending) return pending;
  pending = (async () => {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(W, H, false);
      renderer.setPixelRatio(1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      for (const k of keys) {
        if (cache.has(k) || !ART[k]) continue;
        try {
          cache.set(k, await vignette(renderer, k));
        } catch (e) {
          if (import.meta.env?.DEV) console.warn("[DeadDraw] card art failed", k, e);
        }
        onEach?.(k);
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      renderer?.dispose();
      renderer?.forceContextLoss?.();
      pending = null;
    }
  })();
  return pending;
}

export const cardArtUrl = (key) => cache.get(key) || null;
export const ART_KEYS = Object.keys(ART);
