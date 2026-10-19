/**
 * Hulk: Open World 3D — the renderer (plain Three.js, one WebGLRenderer).
 *
 * Owns the scene, lights, the static city, props, effects, the hero model,
 * enemy / civilian / boss models (created when they come within range,
 * hidden when far, disposed when gone) and the third-person CAMERA:
 *   mouse orbit (yaw / pitch) around a smoothed pivot above the hero,
 *   distance grows when sprinting, airborne, carrying or framing a boss,
 *   pulled in by a ray against the city so it never clips through walls,
 *   shake from sim impulses, slow vertical catch-up after big landings.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildCityMesh } from "./cityMesh.js";
import { createPropRenderer } from "./propsMesh.js";
import { createFx } from "./fx.js";
import { createHeroModel } from "./heroModel.js";
import { createHuman, createRobot, createAPC, createTurret, createBoss, disposeActorCache } from "./actors.js";
import { disposeRigCache } from "./rig.js";
import { disposeTextures } from "./textures.js";
import { HERO } from "../engine/config.js";
import { clamp } from "../engine/util.js";

const QUAL = {
  low: { dpr: 1, shadows: false, map: 0, far: 380 },
  medium: { dpr: 1.25, shadows: true, map: 1024, far: 520 },
  high: { dpr: 1.5, shadows: true, map: 2048, far: 640 },
};

export function createWorld(canvas, { city, quality = "high" } = {}) {
  const Q = QUAL[quality] || QUAL.high;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== "low", powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = Q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#b9cfe0", 140, Q.far);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.3, 4000);
  // soft image-based lighting so metals (robots, bosses, cars, glass) read instead of going black
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight("#cfe2ff", "#5d5240", 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff0d6", 2.6);
  const SUN_DIR = new THREE.Vector3(0.5, 0.42, -0.75).normalize();
  sun.castShadow = Q.shadows;
  if (Q.shadows) {
    sun.shadow.mapSize.set(Q.map, Q.map);
    const s = 46;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 400;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
  }
  scene.add(sun, sun.target);

  const cityMesh = buildCityMesh(city, { shadows: Q.shadows, quality });
  scene.add(cityMesh.group);
  const props = createPropRenderer(scene, { shadows: Q.shadows });
  props.reserve(city.props);
  const fx = createFx(scene, city, { quality });
  const hero = createHeroModel({ shadows: Q.shadows });
  scene.add(hero.group);

  const actors = new Map(); // enemy/civilian id → model
  const bossModels = new Map();
  const size = { w: 1, h: 1 };
  const cam = {
    pivot: new THREE.Vector3(),
    pos: new THREE.Vector3(),
    dist: 10,
    fov: 70,
    shake: 0,
    shakeT: 0,
    lastY: 0,
    first: true,
  };
  const _ray = new THREE.Vector3();
  let time = 0;

  function resize(w, h) {
    size.w = Math.max(1, w);
    size.h = Math.max(1, h);
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  }

  function modelFor(e) {
    let m = actors.get(e.id);
    if (m) return m;
    if (e.type === "robot") m = createRobot(false, { shadows: false });
    else if (e.type === "heavyRobot") m = createRobot(true, { shadows: Q.shadows });
    else if (e.type === "apc") m = createAPC({ shadows: Q.shadows });
    else if (e.type === "turret") m = createTurret({ shadows: false });
    else if (e.type === "civ") m = createHuman("civ", e.look || e.id * 2654435761, { shadows: false });
    else m = createHuman(e.type === "heavy" ? "heavy" : "soldier", e.id * 2654435761, { shadows: false });
    actors.set(e.id, m);
    scene.add(m.group);
    return m;
  }
  function dropActor(id) {
    const m = actors.get(id);
    if (!m) return;
    scene.remove(m.group);
    m.dispose();
    actors.delete(id);
  }

  /* ---------------------------------------------------------------- camera */
  function updateCamera(sim, c, dt, settings) {
    const h = sim.hero;
    // pivot follows the hero; vertical catches up a bit slower after big drops
    const target = new THREE.Vector3(h.x, h.y + HERO.pivot, h.z);
    if (cam.first) {
      cam.pivot.copy(target);
      cam.first = false;
    }
    const kx = 1 - Math.exp(-14 * dt);
    const ky = 1 - Math.exp(-(h.grounded ? 9 : 16) * dt);
    cam.pivot.x += (target.x - cam.pivot.x) * kx;
    cam.pivot.z += (target.z - cam.pivot.z) * kx;
    cam.pivot.y += (target.y - cam.pivot.y) * ky;
    // dynamic distance
    let want = 10.5;
    if (h.sprinting) want += 2.5;
    if (!h.grounded && h.y - h.groundY > 6) want += 3.5;
    if (h.carry) want += 2.5;
    if (h.charging) want += 1.5 * h.anim.charge;
    const boss = sim.bosses.find((b) => !b.dead && Math.hypot(b.x - h.x, b.z - h.z) < 70);
    if (boss) want += boss.def.h * 0.55;
    else if (sim.enemies.some((e) => !e.dead && !e.sleep && Math.hypot(e.x - h.x, e.z - h.z) < 18)) want += 1.5;
    cam.dist += (want - cam.dist) * (1 - Math.exp(-(want > cam.dist ? 2 : 5) * dt));
    // orbit
    const cp = Math.cos(c.pitch);
    const dx = -Math.sin(c.yaw) * cp;
    const dz = -Math.cos(c.yaw) * cp;
    const dy = -Math.sin(c.pitch);
    // over-the-shoulder offset (to the right of the view)
    const rx = Math.cos(c.yaw);
    const rz = -Math.sin(c.yaw);
    const side = 1.1;
    const px = cam.pivot.x + rx * side;
    const pz = cam.pivot.z + rz * side;
    const py = cam.pivot.y;
    // camera collision: ray from the pivot back toward the desired spot
    let d = cam.dist;
    const hit = sim.col.raycast(px, py, pz, -dx, -dy, -dz, d + 0.6, { terrain: true });
    if (hit) d = Math.max(1.8, hit.t - 0.6);
    cam.pos.set(px - dx * d, py - dy * d, pz - dz * d);
    // never under the ground
    const gy = sim.city.terrainH(cam.pos.x, cam.pos.z) + 0.4;
    if (cam.pos.y < gy) cam.pos.y = gy;
    // shake
    const nowT = sim.t;
    for (const s of sim.shakes) {
      const dd = Math.hypot(s.x - h.x, s.z - h.z);
      const a = s.amp * Math.max(0, 1 - dd / s.range);
      if (a > cam.shake) cam.shake = a;
    }
    sim.shakes.length = 0;
    void nowT;
    cam.shake = Math.max(0, cam.shake - dt * 2.2);
    let sx = 0;
    let sy = 0;
    if (settings.shake && cam.shake > 0.01) {
      cam.shakeT += dt * 40;
      const k = cam.shake * cam.shake * 0.55;
      sx = (Math.sin(cam.shakeT * 1.3) + Math.sin(cam.shakeT * 2.9) * 0.5) * k;
      sy = (Math.cos(cam.shakeT * 1.7) + Math.sin(cam.shakeT * 3.3) * 0.5) * k;
    }
    camera.position.set(cam.pos.x + rx * sx, cam.pos.y + sy, cam.pos.z + rz * sx);
    camera.lookAt(px + dx * 20, py + dy * 20, pz + dz * 20);
    // FOV kick: sprint, rage, leap
    const fovWant = settings.fov + (h.sprinting ? 9 : 0) + (h.raging ? 4 : 0) + (!h.grounded && h.vy > 15 ? 6 : 0);
    cam.fov += (fovWant - cam.fov) * (1 - Math.exp(-4 * dt));
    if (Math.abs(camera.fov - cam.fov) > 0.01) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
  }
  function resetCamera() {
    cam.first = true;
    cam.shake = 0;
  }

  /* ---------------------------------------------------------------- sync + draw */
  const tmpV = new THREE.Vector3();
  function render(sim, dt, c, settings) {
    time += dt;
    updateCamera(sim, c, dt, settings);
    const h = sim.hero;
    // sun shadow box follows the hero (snapped to texels to avoid shimmer)
    const snap = (v) => Math.round(v / 2) * 2;
    sun.target.position.set(snap(h.x), h.y, snap(h.z));
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 160);
    // hero
    hero.group.position.set(h.x, h.y, h.z);
    hero.group.rotation.y = h.heading;
    hero.update(h, dt, time);
    // props
    props.sync(sim.props);
    // enemies
    const seen = new Set();
    for (const e of sim.enemies) {
      if (e.removed || (e.dead && e.deadT > 6)) continue;
      const d = Math.hypot(e.x - camera.position.x, e.z - camera.position.z);
      if (d > 260 && !actors.has(e.id)) continue;
      const m = modelFor(e);
      seen.add(e.id);
      m.group.visible = d < 300;
      if (!m.group.visible) continue;
      m.group.position.set(e.x, e.y, e.z);
      m.group.rotation.y = e.heading;
      if (e.anim.mode === "aim" || e.anim.mode === "fire") e.recoil = e.burst > 0 && e.burstT > (e.def.burstGap || 0.1) * 0.6 ? 1 : e.recoil;
      m.update(e, dt, time);
      if (e.flash > 0 && m.group.children.length) m.group.scale.setScalar(1 + e.flash * 0.15);
      else m.group.scale.setScalar(1);
    }
    for (const c2 of sim.civilians) {
      if (c2.dead && c2.deadT > 8) continue;
      const key = `c${c2.id}`;
      let m = actors.get(key);
      if (!m) {
        m = createHuman("civ", c2.look, { shadows: false });
        actors.set(key, m);
        scene.add(m.group);
      }
      seen.add(key);
      m.group.position.set(c2.x, c2.y, c2.z);
      m.group.rotation.y = c2.heading;
      m.update(c2, dt, time);
    }
    for (const id of [...actors.keys()]) if (!seen.has(id)) dropActor(id);
    // bosses
    for (const b of sim.bosses) {
      let m = bossModels.get(b);
      if (!m) {
        m = createBoss(b.kind, { shadows: Q.shadows });
        bossModels.set(b, m);
        scene.add(m.group);
      }
      m.group.visible = !(b.dead && b.deadT > 9);
      m.group.position.set(b.x, b.y, b.z);
      m.group.rotation.y = b.heading;
      m.update(b, dt, time);
    }
    for (const [b, m] of bossModels) {
      if (!sim.bosses.includes(b)) {
        scene.remove(m.group);
        m.dispose();
        bossModels.delete(b);
      }
    }
    fx.update(sim, dt, camera.position, time);
    cityMesh.cull(camera.position, Q.far + 120);
    cityMesh.update(dt);
    renderer.render(scene, camera);
  }

  /** slow cinematic orbit for menus (hero idling in the plaza) */
  function renderMenu(sim, dt, focus) {
    time += dt;
    const h = sim.hero;
    // hero showcase: he faces the camera on the right third (menu panel is on the left)
    const a = 0.55 + Math.sin(time * 0.12) * 0.22;
    const f = focus || { x: h.x, z: h.z };
    const r = 9.5;
    const cx = f.x + Math.sin(a) * r;
    const cz = f.z + Math.cos(a) * r;
    camera.position.set(cx, h.y + 2.6 + Math.sin(time * 0.3) * 0.25, cz);
    const vx = f.x - cx;
    const vz = f.z - cz;
    const vl = Math.hypot(vx, vz) || 1;
    // shift the look target to camera-left so the hero sits right of centre
    const lx = -vz / vl;
    const lz = vx / vl;
    camera.lookAt(f.x - lx * 3.4, h.y + 2.1, f.z - lz * 3.4);
    h.heading = Math.atan2(cx - h.x, cz - h.z) - 0.25;
    if (Math.abs(camera.fov - 55) > 0.01) {
      camera.fov = 55;
      camera.updateProjectionMatrix();
    }
    sun.target.position.set(Math.round(h.x), h.y, Math.round(h.z));
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 160);
    hero.group.position.set(h.x, h.y, h.z);
    hero.group.rotation.y = h.heading;
    hero.update(h, dt, time);
    props.sync(sim.props);
    fx.update(sim, dt, camera.position, time);
    cityMesh.cull(camera.position, Q.far + 120);
    cityMesh.update(dt);
    renderer.render(scene, camera);
  }

  /** world → screen (CSS px); null when behind the camera */
  function project(x, y, z) {
    tmpV.set(x, y, z).project(camera);
    if (tmpV.z > 1) return null;
    return { x: (tmpV.x * 0.5 + 0.5) * size.w, y: (-tmpV.y * 0.5 + 0.5) * size.h, behind: false };
  }
  /** camera forward (unit) — throws and leaps aim along it */
  function aimDir() {
    const d = new THREE.Vector3();
    camera.getWorldDirection(d);
    return { x: d.x, y: d.y, z: d.z };
  }

  return {
    renderer,
    scene,
    camera,
    size,
    resize,
    render,
    renderMenu,
    resetCamera,
    project,
    aimDir,
    reset() {
      for (const id of [...actors.keys()]) dropActor(id);
      for (const [, m] of bossModels) {
        scene.remove(m.group);
        m.dispose();
      }
      bossModels.clear();
      props.reset();
      fx.clear();
      resetCamera();
    },
    info() {
      return renderer.info;
    },
    dispose() {
      for (const id of [...actors.keys()]) dropActor(id);
      for (const [, m] of bossModels) m.dispose();
      bossModels.clear();
      props.dispose();
      fx.dispose();
      hero.dispose();
      cityMesh.dispose();
      disposeActorCache();
      disposeRigCache();
      disposeTextures();
      envRT.dispose();
      renderer.dispose();
    },
  };
}
export { clamp };
