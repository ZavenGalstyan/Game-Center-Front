/**
 * Vice Streets 3D — the renderer (plain Three.js, one WebGLRenderer).
 *
 * Owns the scene, sky + day/night lighting, the static city, every vehicle
 * and person model (created on first sight, recycled when gone), mission and
 * activity markers, simple effects (smoke, sparks, headlight pools) and the
 * two camera rigs:
 *   on foot   mouse-orbit third person around a smoothed pivot, pulled in by
 *             a ray against the city so it never ends up inside a wall
 *   driving   chase camera behind the car; distance grows with speed, mouse
 *             free-look swings back behind after a moment, C toggles near/far
 * Camera position, pivot, distance and FOV are all smoothed, so switching
 * between rigs (entering / leaving a car) never teleports the view.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildCityMesh } from "./cityMesh.js";
import { benchSeat } from "../engine/peds.js";
import { createCarModel, disposeCarCache } from "./cars.js";
import { buildCharacter, animateRig, disposeRig, disposeCharacterCache, charMaterial, loadCharacterAssets } from "./people.js";
import { disposeTextures } from "./textures.js";
import { clamp, damp, dampA, lerp, wrapA } from "../engine/util.js";

const QUAL = {
  low: { dpr: 1, shadows: false, map: 0, far: 420, aa: false },
  medium: { dpr: 1.25, shadows: true, map: 1024, far: 560, aa: true },
  high: { dpr: 1.5, shadows: true, map: 2048, far: 700, aa: true },
};

/* sky keyframes: hour → colours / light */
const SKY = [
  { h: 0, top: "#070b22", hor: "#1a2350", fog: "#151b3a", sun: "#8ea6ff", si: 0.35, hemi: 0.55, hs: "#4a5a9a", hg: "#1d2030" },
  { h: 5, top: "#0d1433", hor: "#2c2f5c", fog: "#232a4a", sun: "#8ea6ff", si: 0.3, hemi: 0.55, hs: "#55609a", hg: "#202430" },
  { h: 6.2, top: "#3a4f8f", hor: "#ff9f7a", fog: "#d99a8a", sun: "#ffb27a", si: 1.0, hemi: 0.75, hs: "#ffc7a8", hg: "#5d5240" },
  { h: 8, top: "#5aa6ff", hor: "#ffe2c2", fog: "#d9e3ea", sun: "#ffe7c2", si: 2.3, hemi: 1.0, hs: "#cfe2ff", hg: "#6b5f48" },
  { h: 12, top: "#3d96ff", hor: "#c6e6ff", fog: "#c9dceb", sun: "#fff7ea", si: 2.9, hemi: 1.05, hs: "#d6e8ff", hg: "#6b5f48" },
  { h: 16.5, top: "#4a9bf2", hor: "#ffe2b8", fog: "#e2dccf", sun: "#ffe8c8", si: 2.6, hemi: 1.0, hs: "#d6e2ff", hg: "#6b5a44" },
  { h: 18.6, top: "#5b4ea8", hor: "#ff7b4f", fog: "#e08a74", sun: "#ff8a4a", si: 1.6, hemi: 0.8, hs: "#ffb48f", hg: "#5a4438" },
  { h: 19.8, top: "#1f2560", hor: "#8a4a8f", fog: "#4d3a66", sun: "#c17aff", si: 0.6, hemi: 0.62, hs: "#7a6ab0", hg: "#2b2434" },
  { h: 21, top: "#090d28", hor: "#1d2552", fog: "#171d3d", sun: "#8ea6ff", si: 0.35, hemi: 0.55, hs: "#4a5a9a", hg: "#1d2030" },
  { h: 24, top: "#070b22", hor: "#1a2350", fog: "#151b3a", sun: "#8ea6ff", si: 0.35, hemi: 0.55, hs: "#4a5a9a", hg: "#1d2030" },
];
const _ca = new THREE.Color();
const _cb = new THREE.Color();
function skyAt(h) {
  let i = 0;
  while (i < SKY.length - 2 && SKY[i + 1].h <= h) i++;
  const A = SKY[i];
  const B = SKY[i + 1];
  const k = clamp((h - A.h) / (B.h - A.h), 0, 1);
  const mix = (a, b) => _ca.set(a).lerp(_cb.set(b), k).clone();
  return { top: mix(A.top, B.top), hor: mix(A.hor, B.hor), fog: mix(A.fog, B.fog), sun: mix(A.sun, B.sun), si: lerp(A.si, B.si, k), hemi: lerp(A.hemi, B.hemi, k), hs: mix(A.hs, B.hs), hg: mix(A.hg, B.hg) };
}
export const nightFactor = (h) => {
  // 1 = deep night, 0 = day; smooth around dusk and dawn
  if (h >= 7 && h <= 18.3) return 0;
  if (h > 18.3 && h < 20.3) return (h - 18.3) / 2;
  if (h > 5.2 && h < 7) return 1 - (h - 5.2) / 1.8;
  return 1;
};

export function createWorld(canvas, { city, quality = "high", ambient = false } = {}) {
  const Q = QUAL[quality] || QUAL.high;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = Q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#c9dceb", 160, Q.far);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.25, 3000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();

  // sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader:
      "uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; varying vec3 vP;" +
      "float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }" +
      "void main(){ float y = max(vP.y, 0.0); vec3 c = mix(hor, top, pow(y, 0.55));" +
      " float s = max(dot(vP, normalize(sunDir)), 0.0); c += sunCol * (pow(s, 64.0) * 1.4 + pow(s, 6.0) * 0.25) * (1.0 - night * 0.6);" +
      " vec3 q = floor(vP * 260.0); float st = step(0.9965, hash(q)) * night * smoothstep(0.05, 0.4, vP.y); c += vec3(st);" +
      " if (vP.y < 0.0) c = hor * 0.85; gl_FragColor = vec4(c, 1.0); }",
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight("#cfe2ff", "#5d5240", 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff0d6", 2.6);
  sun.castShadow = Q.shadows;
  if (Q.shadows) {
    sun.shadow.mapSize.set(Q.map, Q.map);
    const s = 55;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 5, far: 400 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.5;
  }
  scene.add(sun, sun.target);
  // the player's headlights at night
  const head = new THREE.SpotLight("#fff1d0", 0, 55, 0.55, 0.55, 1.2);
  scene.add(head, head.target);

  const cityMesh = buildCityMesh(city, { shadows: Q.shadows, quality });
  scene.add(cityMesh.group);
  loadCharacterAssets();

  /* ------------------------------------------------------------ models */
  const cars = new Map(); // vehicle id → model
  const people = new Map(); // person id → rig
  const markers = createMarkers(scene);
  const fx = createFx(scene, cityMesh.breakables);
  const size = { w: 1, h: 1 };
  const cam = { pivot: new THREE.Vector3(), pos: new THREE.Vector3(), dist: 4.5, fov: 62, shake: 0, first: true, yawCar: 0, freeT: 0, mode: "foot" };
  let time = 0;

  function resize(w, h) {
    size.w = Math.max(1, w);
    size.h = Math.max(1, h);
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  }

  function carModel(v) {
    let m = cars.get(v.id);
    if (!m) {
      m = createCarModel(v, { shadows: Q.shadows });
      m.dummy = makeDriverDummy();
      m.seat.add(m.dummy);
      scene.add(m.group);
      cars.set(v.id, m);
    }
    return m;
  }
  function dropCar(id) {
    const m = cars.get(id);
    if (!m) return;
    scene.remove(m.group);
    m.dispose();
    cars.delete(id);
  }
  function rigFor(p) {
    let r = people.get(p.id);
    if (!r) {
      r = buildCharacter(p.look);
      r.seed = (p.id * 0.37) % 6.28;
      scene.add(r.root);
      people.set(p.id, r);
    }
    return r;
  }
  function dropRig(id) {
    const r = people.get(id);
    if (!r) return;
    disposeRig(r);
    people.delete(id);
  }

  /* ------------------------------------------------------------ sync */
  const seen = new Set();
  const _v = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  /**
   * Jumping out of a car: the body turns about its own centre (local 0.6 m up)
   * by the roll angle a (positive = forward roll, 2π = upright again), tucked
   * while airborne / rolling, flat while lying, so a roll ends on the feet.
   */
  const _qa = new THREE.Quaternion();
  const _qb = new THREE.Quaternion();
  const _ax = new THREE.Vector3();
  function poseBail(r, pl, q, dt) {
    const B = pl.bail;
    const P = pl._prev;
    const a = P && alpha < 1 ? (P.a ?? B.a) + (B.a - (P.a ?? B.a)) * alpha : B.a;
    const lying = B.phase === "lie" || B.phase === "rise" || B.phase === "slide";
    const tuck = B.phase === "out" ? 0.4 : lying ? (B.phase === "rise" ? 0.35 : 0) : B.phase === "stumble" || B.phase === "up" ? 0.2 : 1;
    const up = Math.max(0, Math.cos(a));
    const g = city.surfaceAt(q.x, q.z);
    const cy = B.phase === "out" || B.phase === "air" ? q.y + 0.6 : g + 0.6 * up + (1 - up) * (0.18 + 0.24 * tuck);
    _qa.setFromAxisAngle(_ax.set(0, 1, 0), q.h);
    _qb.setFromAxisAngle(_ax.set(1, 0, 0), a);
    r.root.quaternion.multiplyQuaternions(_qa, _qb);
    _v.set(0, 0.6, 0).applyQuaternion(r.root.quaternion);
    r.root.position.set(q.x - _v.x, cy - _v.y, q.z - _v.z);
    r.fall = 0;
    animateRig(r, { pose: "stand", t: time, seed: r.seed, tuck, limp: B.phase === "lie" || B.phase === "slide" ? 0.6 : 0, hurt: B.phase === "lie" || B.phase === "slide" ? 1 : 0, air: B.phase === "air", snap: false }, dt);
  }
  /** a moving thing's transform between its last two physics steps */
  let alpha = 1;
  const IP = { x: 0, y: 0, z: 0, h: 0 };
  function ip(o) {
    const P = o._prev;
    if (!P || alpha >= 1) {
      IP.x = o.x;
      IP.y = o.y;
      IP.z = o.z;
      IP.h = o.h;
      return IP;
    }
    IP.x = P.x + (o.x - P.x) * alpha;
    IP.y = P.y + (o.y - P.y) * alpha;
    IP.z = P.z + (o.z - P.z) * alpha;
    IP.h = P.h + Math.atan2(Math.sin(o.h - P.h), Math.cos(o.h - P.h)) * alpha;
    return IP;
  }
  function syncCars(sim, dt, night) {
    seen.clear();
    const F = sim.focus();
    for (const v of sim.vehicles) {
      const d = Math.hypot(v.x - F.x, v.z - F.z);
      if (d > 300) continue;
      seen.add(v.id);
      const m = carModel(v);
      m.update(v, time, night > 0.5, dt, alpha);
      m.setDetail(d < 70 ? 0 : 1);
      m.dummy.visible = v.driver === "ai" && !(v.role === "police" && v.copOut);
      // damage smoke / fire
      if (v.wrecked || v.hp < v.st.hp * 0.35) fx.smoke(v, dt, v.wrecked);
    }
    for (const id of [...cars.keys()]) if (!seen.has(id)) dropCar(id);
  }
  const ground = (x, z) => city.surfaceAt(x, z);
  const _e = new THREE.Euler(0, 0, 0, "YXZ");
  /**
   * Place a standing / falling / lying person: a knock-down tips the body over
   * from the feet (backwards, away from the hit) instead of snapping flat, and
   * getting up reverses it.
   */
  function poseBody(r, q, A, step) {
    const target = A.down || A.dead ? 1 : 0;
    r.fall = r.fall ?? target;
    r.fall += Math.sign(target - r.fall) * Math.min(Math.abs(target - r.fall), step * (target ? 3.6 : 1.8));
    const f = r.fall * r.fall * (3 - 2 * r.fall);
    _e.set(-Math.PI / 2 * f, q.h, 0, "YXZ");
    r.root.quaternion.setFromEuler(_e);
    r.root.position.set(q.x, q.y + 0.14 * f, q.z);
    return f;
  }
  function syncPeople(sim, dt) {
    seen.clear();
    const F = sim.focus();
    const list = [];
    for (const p of sim.peds.list) list.push(p);
    for (const p of sim.npcs) if (!p.hidden) list.push(p);
    for (const p of sim.police.foot) list.push(p);
    for (const p of list) {
      const d = Math.hypot(p.x - F.x, p.z - F.z);
      if (d > 120) continue;
      seen.add(p.id);
      const r = rigFor(p);
      // far people animate less often
      r.acc = (r.acc || 0) + dt;
      if (d > 45 && r.acc < 0.05) continue;
      const step = r.acc;
      r.acc = 0;
      r.setLOD(d > 30 ? 1 : 0);
      const A = p.anim;
      if (p.inCar) {
        const m = cars.get(p.inCar.id);
        if (!m) {
          r.root.visible = false;
          continue;
        }
        r.root.visible = true;
        m.passenger.updateWorldMatrix(true, false);
        m.passenger.getWorldPosition(_v);
        m.passenger.getWorldQuaternion(_q);
        r.root.position.set(_v.x, _v.y - 0.47 * (r.scale || 1), _v.z);
        r.root.quaternion.copy(_q);
        animateRig(r, { pose: "sit", t: time, seed: r.seed, talking: A.talk > 0 }, step);
        continue;
      }
      r.root.visible = true;
      // on a bench: pelvis on the seat anchor (seat top − hip height), facing out,
      // blended from standing by the sit-down / stand-up progress
      if (p.bench && A.sitK > 0 && !p.dead && p.mode !== "down") {
        const S = benchSeat(p.bench);
        const q = ip(p);
        const gy = ground(q.x, q.z);
        const k = A.sitK;
        r.root.position.set(q.x, gy + (S.y - 0.47 * (r.scale || 1) - gy) * k, q.z);
        r.root.quaternion.setFromAxisAngle(_v.set(0, 1, 0), q.h);
        r.fall = 0;
        animateRig(r, { pose: k > 0.45 ? "sit" : "stand", t: time, seed: r.seed, talking: A.talk > 0, interact: A.interact, speed: 0 }, step);
        continue;
      }
      const f = poseBody(r, ip(p), A, step);
      if (f > 0.02) {
        animateRig(r, { pose: "stand", t: time, seed: r.seed, hurt: 1, limp: A.dead ? 1 : f }, step);
        continue;
      }
      const pose = A.sit ? "sit" : A.talk > 0 && (p.speed || 0) < 0.2 ? "talk" : "stand";
      animateRig(r, { pose, speed: p.speed || A.speed || 0, t: time, seed: r.seed, wave: A.wave, interact: A.interact, talking: A.talk > 0, ground, celebrate: A.celebrate, surrender: A.surrender, stagger: A.stagger > 0 ? Math.min(1, A.stagger * 3) : 0, punch: A.punch, cower: A.cower, fight: A.fight, block: A.block, dodge: A.dodge, hitSide: A.hitSide, hitKind: A.hitKind }, step);
    }
    // the player
    const pl = sim.player;
    if (!pl.hidden) {
      seen.add("player");
      let r = people.get("player");
      if (r && r.outfit !== pl.outfit) {
        dropRig("player");
        r = null;
      }
      if (!r) {
        r = buildCharacter(pl.look);
        r.outfit = pl.outfit;
        r.seed = 1.3;
        scene.add(r.root);
        people.set("player", r);
      }
      r.root.visible = true;
      const A = pl.anim;
      const car = pl.trans?.v || pl.car;
      const m = car ? cars.get(car.id) : null;
      const q = ip(pl);
      if (pl.mode === "bail" && pl.bail) {
        poseBail(r, pl, q, dt);
      } else if (m && (pl.mode === "car" || pl.mode === "enter" || pl.mode === "exit")) {
        m.seat.updateWorldMatrix(true, false);
        m.seat.getWorldPosition(_v);
        m.seat.getWorldQuaternion(_q);
        const sy = _v.y - 0.47 * (r.scale || 1);
        const k = pl.mode === "car" ? 1 : clamp(A.enter || 0, 0, 1);
        r.root.position.set(lerp(q.x, _v.x, k), lerp(q.y, sy, k), lerp(q.z, _v.z, k));
        if (pl.mode === "car") r.root.quaternion.copy(_q);
        else r.root.quaternion.setFromAxisAngle(_v.set(0, 1, 0), q.h);
        r.fall = 0;
        animateRig(r, { pose: k > 0.45 ? "drive" : "stand", steer: car.wheelSteer / 0.6, speed: pl.mode === "enter" && A.speed ? A.speed : 0, t: time, seed: r.seed, snap: false }, dt);
      } else {
        const f = poseBody(r, q, A, dt);
        if (f > 0.02) animateRig(r, { pose: "stand", t: time, seed: r.seed, hurt: 1, limp: f }, dt);
        else animateRig(r, { pose: "stand", speed: pl.speed, air: A.air, t: time, seed: r.seed, interact: A.interact, celebrate: A.celebrate, hurt: A.hurt, surrender: A.surrender, ground, punch: A.punch, stagger: A.stagger > 0 ? Math.min(1, A.stagger * 3) : 0, fight: pl.atk || sim.t - (pl.chainT ?? -9) < 2.5 || sim.peds.fighters() > 0 ? 1 : 0 }, dt);
      }
    }
    for (const id of [...people.keys()]) if (!seen.has(id)) dropRig(id);
  }

  /* ------------------------------------------------------------ camera */
  const _piv = new THREE.Vector3();
  const _des = new THREE.Vector3();
  function updateCamera(sim, c, dt, settings) {
    const pl = sim.player;
    const inCar = pl.mode === "car" && pl.car;
    const car = inCar ? pl.car : null;
    // pivot
    // the pivot follows the interpolated body (never the bouncing suspension)
    if (car) {
      const q = ip(car);
      _piv.set(q.x, q.y + car.st.hgt * 0.75 + 0.55, q.z);
    } else {
      const q = ip(pl);
      _piv.set(q.x, q.y + (pl.mode === "bail" ? 1.0 : 1.55), q.z);
    }
    if (cam.first) {
      cam.pivot.copy(_piv);
      cam.yawCar = car ? car.h + Math.PI : c.yaw;
    }
    // the pivot sits exactly on the interpolated target across the ground: a
    // positional lerp lags by an amount that depends on each frame's dt, which
    // shows up as the car shuddering on screen when frame times are uneven.
    // Only the height is eased (kerbs, jumps).
    cam.pivot.x = _piv.x;
    cam.pivot.z = _piv.z;
    cam.pivot.y += (_piv.y - cam.pivot.y) * (1 - Math.exp(-(car ? 10 : 14) * dt));
    let yaw = c.yaw;
    let pitch = c.pitch;
    let dist;
    if (car) {
      const sp = Math.hypot(car.vx, car.vz);
      // free look returns behind the car shortly after the mouse stops
      c.freeT = Math.max(0, (c.freeT || 0) - dt);
      const behind = car.h + Math.PI;
      if (c.freeT <= 0) {
        c.yaw = dampA(c.yaw, behind, sp > 2 ? 4 : 1.5, dt);
        c.pitch = damp(c.pitch, c.near ? 0.16 : 0.2, 3, dt);
      }
      yaw = c.yaw;
      pitch = c.pitch;
      const base = (c.near ? 4.3 : 6.4) * Math.sqrt(car.st.len / 4.7) * (car.st.hgt > 2 ? 1.25 : 1);
      dist = base + clamp(sp * 0.07, 0, 2.6);
      cam.fov = damp(cam.fov, 62 + clamp(sp - 12, 0, 40) * 0.35, 3, dt);
    } else {
      dist = 4.4 * (settings.camDist || 1) + (pl.sprint ? 0.4 : 0);
      cam.fov = damp(cam.fov, 62, 3, dt);
    }
    cam.dist = damp(cam.dist, dist, 5, dt);
    const cp = Math.cos(pitch);
    _des.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).multiplyScalar(cam.dist).add(cam.pivot);
    // pull in against walls: the boom length is eased (in fast, out slowly),
    // the camera itself stays rigidly on the boom
    const hit = sim.col.segHit(cam.pivot.x, cam.pivot.z, cam.pivot.y, _des.x, _des.z, _des.y, true);
    const want = hit < 1 ? Math.max(0.12, hit - 0.06) : 1;
    if (cam.first || cam.pull == null) cam.pull = want;
    else cam.pull += (want - cam.pull) * (1 - Math.exp(-(want < cam.pull ? 30 : 6) * dt));
    _des.sub(cam.pivot).multiplyScalar(cam.pull).add(cam.pivot);
    // keep above the ground
    const gy = city.groundAt(_des.x, _des.z) + 0.6;
    if (_des.y < gy) _des.y = gy;
    cam.pos.copy(_des);
    cam.first = false;
    camera.position.copy(cam.pos);
    if (cam.shake > 0 && settings.shake !== false) {
      cam.shake = Math.max(0, cam.shake - dt * 2.2);
      const s = cam.shake * 0.25;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
    }
    camera.lookAt(cam.pivot.x, cam.pivot.y + (car ? 0.2 : 0.05), cam.pivot.z);
    if (Math.abs(camera.fov - cam.fov) > 0.05) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
  }
  /** ambient menu camera: slow orbit over a focus point */
  function menuCamera(t, focus) {
    const a = t * 0.05;
    camera.position.set(focus.x + Math.sin(a) * 70, 34, focus.z + Math.cos(a) * 70);
    camera.lookAt(focus.x, 6, focus.z);
    if (camera.fov !== 55) {
      camera.fov = 55;
      camera.updateProjectionMatrix();
    }
  }

  /* ------------------------------------------------------------ lighting */
  let lastSkyH = -1;
  function updateLighting(sim) {
    const h = sim.clock;
    const night = nightFactor(h);
    if (Math.abs(h - lastSkyH) > 0.01) {
      lastSkyH = h;
      const S = skyAt(h);
      skyMat.uniforms.top.value.copy(S.top);
      skyMat.uniforms.hor.value.copy(S.hor);
      skyMat.uniforms.sunCol.value.copy(S.sun);
      skyMat.uniforms.night.value = night;
      scene.fog.color.copy(S.fog);
      scene.fog.near = 160 - night * 60;
      scene.fog.far = Q.far - night * 120;
      hemi.color.copy(S.hs);
      hemi.groundColor.copy(S.hg);
      hemi.intensity = S.hemi;
      sun.color.copy(S.sun);
      sun.intensity = S.si;
      scene.environmentIntensity = 0.5 - night * 0.25;
      renderer.toneMappingExposure = 1.0 + night * 0.35;
    }
    // sun path: east (+x) at 6, overhead at 12, west at 18; the moon takes the night
    const day = (h - 6) / 12;
    const ang = day * Math.PI;
    let dir;
    if (h >= 5.6 && h <= 18.6) dir = _v.set(Math.cos(ang) * 0.8, Math.max(0.12, Math.sin(ang)), -0.45).normalize();
    else dir = _v.set(-0.3, 0.7, 0.5).normalize();
    skyMat.uniforms.sunDir.value.copy(dir);
    const F = sim.focus();
    sun.position.set(F.x + dir.x * 120, F.y + dir.y * 120, F.z + dir.z * 120);
    sun.target.position.set(F.x, F.y, F.z);
    sun.target.updateMatrixWorld();
    sky.position.copy(camera.position);
    // the player's headlights
    const car = sim.player.mode === "car" ? sim.player.car : null;
    if (car && car.lights) {
      head.intensity = 60 * Math.max(0.35, night);
      head.position.set(car.x + Math.sin(car.h) * 2.2, car.y + 0.8, car.z + Math.cos(car.h) * 2.2);
      head.target.position.set(car.x + Math.sin(car.h) * 22, car.y, car.z + Math.cos(car.h) * 22);
      head.target.updateMatrixWorld();
    } else head.intensity = 0;
    return night;
  }

  /* ------------------------------------------------------------ cash pickups */
  // a small bundle of banknotes: pops out of the body, lands, then spins slowly
  const cashGeo = (() => {
    const note = new THREE.BoxGeometry(0.26, 0.05, 0.13);
    const band = new THREE.BoxGeometry(0.06, 0.056, 0.136);
    return { note, band };
  })();
  const cashMat = new THREE.MeshStandardMaterial({ color: "#5fbf6a", emissive: "#2f9b3f", emissiveIntensity: 0.55, roughness: 0.6 });
  const bandMat = new THREE.MeshStandardMaterial({ color: "#f2e6b8", roughness: 0.6 });
  const cash = new Map();
  function syncCash(sim) {
    const live = new Set();
    for (const pk of sim.pickups || []) {
      live.add(pk.id);
      let g = cash.get(pk.id);
      if (!g) {
        g = new THREE.Group();
        const a = new THREE.Mesh(cashGeo.note, cashMat);
        const b = new THREE.Mesh(cashGeo.note, cashMat);
        b.position.set(0.02, 0.05, 0.01);
        b.rotation.y = 0.25;
        const c = new THREE.Mesh(cashGeo.band, bandMat);
        c.position.y = 0.025;
        g.add(a, b, c);
        scene.add(g);
        cash.set(pk.id, g);
      }
      const age = sim.t - pk.t;
      if (age < 0.55) {
        // short arc from the body to where it lands
        const k = age / 0.55;
        g.position.set(pk.from.x + (pk.x - pk.from.x) * k, pk.from.y + (pk.y + 0.04 - pk.from.y) * k + Math.sin(k * Math.PI) * 0.5, pk.from.z + (pk.z - pk.from.z) * k);
        g.rotation.set(k * 6, k * 4, 0);
      } else {
        g.position.set(pk.x, pk.y + 0.06 + Math.sin(time * 3 + pk.id) * 0.03, pk.z);
        g.rotation.set(0, time * 1.6 + pk.id, 0);
      }
    }
    for (const [id, g] of cash) {
      if (!live.has(id)) {
        scene.remove(g);
        cash.delete(id);
      }
    }
  }

  /* ------------------------------------------------------------ frame */
  function render(sim, c, dt, settings = {}, a = 1) {
    alpha = clamp(a, 0, 1);
    time += dt;
    const night = updateLighting(sim);
    cityMesh.update(sim.t, night, sim);
    syncCars(sim, dt, night);
    syncPeople(sim, dt);
    markers.update(sim, time, dt);
    syncCash(sim);
    fx.update(dt, sim, cars);
    for (const e of sim.frameEvents || sim.events) {
      // shake only for real impacts: scrapes and kerbs never wobble the view
      if (e.type === "crash" && e.player && e.impact > 6) cam.shake = Math.min(1, cam.shake + (e.impact - 6) / 20);
      if (e.type === "crash" && e.impact > 5) fx.sparks(e.x, city.groundAt(e.x, e.z) + 0.6, e.z, Math.min(30, e.impact * 1.5));
      fx.event(e, sim, cam);
    }
    if (sim.ambient && c.menu) menuCamera(time, c.menu);
    else updateCamera(sim, c, dt, settings);
    renderer.render(scene, camera);
  }
  function reset() {
    cam.first = true;
    for (const id of [...cars.keys()]) dropCar(id);
    for (const id of [...people.keys()]) dropRig(id);
    for (const g of cash.values()) scene.remove(g);
    cash.clear();
    fx.clear();
  }
  function dispose() {
    reset();
    cityMesh.dispose();
    markers.dispose();
    fx.dispose();
    cashGeo.note.dispose();
    cashGeo.band.dispose();
    cashMat.dispose();
    bandMat.dispose();
    disposeCarCache();
    disposeCharacterCache();
    charMaterial().dispose();
    disposeTextures();
    sky.geometry.dispose();
    skyMat.dispose();
    envRT.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
  }
  void ambient;
  return { renderer, scene, camera, resize, render, reset, dispose, cam, debug: { people, cars }, project: (x, y, z) => _v.set(x, y, z).project(camera) };
}

/* ====================================================================== driver dummy */
let DUMMY = null;
function makeDriverDummy() {
  if (!DUMMY) {
    DUMMY = {
      head: new THREE.SphereGeometry(0.11, 10, 8),
      torso: new THREE.BoxGeometry(0.36, 0.5, 0.22),
      skin: new THREE.MeshStandardMaterial({ color: "#c98d63", roughness: 0.7 }),
      shirt: new THREE.MeshStandardMaterial({ color: "#3d5a80", roughness: 0.8 }),
    };
  }
  const g = new THREE.Group();
  const t = new THREE.Mesh(DUMMY.torso, DUMMY.shirt);
  t.position.set(0, 0.3, -0.1);
  const h = new THREE.Mesh(DUMMY.head, DUMMY.skin);
  h.position.set(0, 0.68, -0.08);
  g.add(t, h);
  return g;
}

/* ====================================================================== markers */
function createMarkers(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const beamTex = (() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(0.7, "rgba(255,255,255,0.25)");
    grd.addColorStop(1, "rgba(255,255,255,0.7)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 64);
    return new THREE.CanvasTexture(c);
  })();
  const COLORS = { drive: "#ffd23f", check: "#ffd23f", foot: "#3fe0ff", npc: "#3fe0ff", vehicle: "#7dff7a", target: "#ff4a4a", pickup: "#7dff7a", park: "#7dff7a", offer: "#ff5fa8", activity: "#5fb8ff" };
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
  beamGeo.translate(0, 0.5, 0);
  const ringGeo = new THREE.RingGeometry(0.85, 1, 40);
  ringGeo.rotateX(-Math.PI / 2);
  const arrowGeo = new THREE.ConeGeometry(0.45, 0.9, 4);
  arrowGeo.rotateX(Math.PI);
  const pool = [];
  const mats = new Map();
  const matFor = (hex, kind) => {
    const k = hex + kind;
    if (!mats.has(k)) {
      mats.set(
        k,
        kind === "beam"
          ? new THREE.MeshBasicMaterial({ color: hex, map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.45, fog: false })
          : new THREE.MeshBasicMaterial({ color: hex, transparent: true, depthWrite: false, opacity: 0.85, side: THREE.DoubleSide, fog: false }),
      );
    }
    return mats.get(k);
  };
  function get(i) {
    if (!pool[i]) {
      const g = new THREE.Group();
      const beam = new THREE.Mesh(beamGeo, matFor("#ffffff", "beam"));
      const ring = new THREE.Mesh(ringGeo, matFor("#ffffff", "ring"));
      const arrow = new THREE.Mesh(arrowGeo, matFor("#ffffff", "ring"));
      g.add(beam, ring, arrow);
      group.add(g);
      pool[i] = { g, beam, ring, arrow };
    }
    return pool[i];
  }
  // parking bay outline
  const bayMat = new THREE.LineBasicMaterial({ color: "#7dff7a" });
  const bay = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), bayMat);
  bay.frustumCulled = false;
  group.add(bay);
  function place(i, m, t, city, scale = 1, F = null) {
    const P = get(i);
    const hex = COLORS[m.kind] || "#ffd23f";
    P.g.visible = true;
    const y = city.groundAt(m.x, m.z) + 0.15;
    P.g.position.set(m.x, y, m.z);
    const big = m.kind === "drive" || m.kind === "check" || m.kind === "offer" || m.kind === "activity" || m.kind === "pickup" || m.kind === "park";
    const r = (m.r || 2.5) * (m.kind === "check" ? 0.85 : 0.6) * scale;
    P.beam.material = matFor(hex, "beam");
    P.ring.material = matFor(hex, "ring");
    P.arrow.material = matFor(hex, "ring");
    P.beam.visible = m.kind !== "vehicle" && m.kind !== "target" && m.kind !== "npc";
    // standing inside a beam: hide it so it does not wash out the view
    if (F && Math.hypot(F.x - m.x, F.z - m.z) < (m.r || 2.5) * 0.9) P.beam.visible = false;
    P.beam.scale.set(r, big ? 40 : 3, r);
    P.ring.scale.setScalar(r * (1 + Math.sin(t * 4) * 0.05));
    P.ring.visible = P.beam.visible;
    P.arrow.visible = !P.beam.visible || m.kind === "offer" || m.kind === "activity";
    P.arrow.position.y = (m.kind === "vehicle" || m.kind === "target" ? 2.6 : 2.9) + Math.sin(t * 3) * 0.2;
    if (m.kind === "npc") P.arrow.position.y = 2.5 + Math.sin(t * 3) * 0.15;
    P.arrow.rotation.y = t * 2;
  }
  return {
    update(sim, t) {
      let i = 0;
      const city = sim.city;
      const m = sim.run && !sim.run.result ? sim.run.marker() : null;
      const F = sim.focus();
      bay.visible = false;
      if (m) {
        if (m.multi) for (const q of m.multi) place(i++, { ...m, x: q.x, z: q.z }, t, city, 0.8, F);
        else place(i++, m, t, city, 1, F);
        if (m.next) place(i++, { ...m, x: m.next.x, z: m.next.z, kind: "check" }, t, city, 0.6);
        if (m.rect) {
          const R = m.rect;
          const y = city.surfaceAt((R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2) + 0.06;
          const P = bay.geometry.attributes.position;
          P.setXYZ(0, R.x0, y, R.z0);
          P.setXYZ(1, R.x1, y, R.z0);
          P.setXYZ(2, R.x1, y, R.z1);
          P.setXYZ(3, R.x0, y, R.z1);
          P.needsUpdate = true;
          bay.visible = true;
        }
      }
      if (!sim.run) for (const o of sim.offers) place(i++, { x: o.x, z: o.z, kind: o.kind === "mission" ? "offer" : "activity", r: 4 }, t, city, 0.9, F);
      for (; i < pool.length; i++) pool[i].g.visible = false;
    },
    dispose() {
      scene.remove(group);
      beamGeo.dispose();
      ringGeo.dispose();
      arrowGeo.dispose();
      beamTex.dispose();
      for (const m of mats.values()) m.dispose();
      bay.geometry.dispose();
      bayMat.dispose();
    },
  };
}

/* ====================================================================== effects */
function createFx(scene, breakables) {
  const tex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const N = 160;
  const smokeMat = new THREE.SpriteMaterial({ map: tex, color: "#555", transparent: true, depthWrite: false, opacity: 0.5 });
  const fireMat = new THREE.SpriteMaterial({ map: tex, color: "#ff8a2a", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparkMat = new THREE.SpriteMaterial({ map: tex, color: "#ffd27a", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  // stylised, non-graphic hit feedback: dark-red droplets, pale impact puffs,
  // wood chips and street dust
  const bloodMat = new THREE.SpriteMaterial({ map: tex, color: "#8a1018", transparent: true, depthWrite: false, opacity: 0.95 });
  const puffMat = new THREE.SpriteMaterial({ map: tex, color: "#f4efe6", transparent: true, depthWrite: false, opacity: 0.55 });
  const chipMat = new THREE.SpriteMaterial({ map: tex, color: "#8a6238", transparent: true, depthWrite: false });
  const dustMat = new THREE.SpriteMaterial({ map: tex, color: "#b9ab92", transparent: true, depthWrite: false, opacity: 0.4 });
  const FALL = new Set([sparkMat, bloodMat, chipMat]);
  const parts = [];
  for (let i = 0; i < N; i++) {
    const s = new THREE.Sprite(smokeMat);
    s.visible = false;
    scene.add(s);
    parts.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 0 });
  }
  let next = 0;
  const emit = (mat, x, y, z, vx, vy, vz, life, size, grow = 0) => {
    const p = parts[next];
    next = (next + 1) % N;
    p.s.material = mat;
    p.s.position.set(x, y, z);
    p.s.scale.setScalar(size);
    p.s.visible = true;
    Object.assign(p, { life, max: life, vx, vy, vz, grow, size });
  };
  const acc = new Map();

  /* blood pools under bodies: flat fading decals */
  const poolTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 4, 32, 32, 31);
    grd.addColorStop(0, "rgba(110,10,16,0.92)");
    grd.addColorStop(0.7, "rgba(95,8,14,0.8)");
    grd.addColorStop(1, "rgba(80,6,12,0)");
    g.fillStyle = grd;
    g.beginPath();
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const r = 26 + Math.sin(k * 2.7) * 4;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const poolGeo = new THREE.PlaneGeometry(1, 1);
  poolGeo.rotateX(-Math.PI / 2);
  const pools = [];
  const addPool = (x, y, z, id) => {
    if (pools.some((q) => q.id === id)) return;
    if (pools.length >= 14) dropPool(pools[0]);
    const mat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.9 });
    const m = new THREE.Mesh(poolGeo, mat);
    m.position.set(x, y + 0.03, z);
    m.rotation.y = Math.random() * 6.28;
    m.scale.setScalar(0.01);
    m.renderOrder = 1;
    scene.add(m);
    pools.push({ m, id, age: 0, r: 1.1 + Math.random() * 0.5 });
  };
  const dropPool = (q) => {
    scene.remove(q.m);
    q.m.material.dispose();
    pools.splice(pools.indexOf(q), 1);
  };

  /* knocked-down street furniture: a falling copy of the prop */
  const debris = [];
  const _q1 = new THREE.Quaternion();
  const _q2 = new THREE.Quaternion();
  const _v = new THREE.Vector3();
  const TALL = { lamp: 6.2, signal: 5, sign: 2.6 };
  const dropDebris = (d) => {
    scene.remove(d.m);
    debris.splice(debris.indexOf(d), 1);
  };
  const addDebris = (e, sim) => {
    const p = e.prop;
    const src = breakables && breakables.debris(p);
    if (!src) return;
    if (debris.length >= 30) dropDebris(debris[0]);
    const m = new THREE.Mesh(src.geo, src.mat);
    const L = Math.hypot(e.dx, e.dz) || 1;
    const dx = e.dx / L;
    const dz = e.dz / L;
    const yaw = p.type === "signal" ? p.face : p.rot || 0;
    const H = TALL[p.type];
    const d = { m, p, age: 0, yaw, dx, dz, x: p.x, y: p.y, z: p.z };
    if (H) {
      // a pole snaps at the base and topples the way it was hit
      Object.assign(d, { tall: H, th: 0.04, w: Math.min(2.6, 0.5 + e.speed * 0.09), bvx: dx * Math.min(9, e.speed * 0.45), bvz: dz * Math.min(9, e.speed * 0.45) });
    } else {
      // light stuff is flung and tumbles
      const sp = Math.min(13, e.speed * 0.85);
      const sx = -dz * (Math.random() - 0.5) * 2;
      const sz = dx * (Math.random() - 0.5) * 2;
      Object.assign(d, { vx: dx * sp + sx, vy: 2 + e.speed * 0.18, vz: dz * sp + sz, q: new THREE.Quaternion().setFromAxisAngle(_v.set(0, 1, 0), yaw), wx: dz * sp * 0.9 + (Math.random() - 0.5) * 3, wy: (Math.random() - 0.5) * 4, wz: -dx * sp * 0.9 + (Math.random() - 0.5) * 3, y: p.y + 0.02 });
    }
    d.ground = (x, z) => sim.city.surfaceAt(x, z);
    scene.add(m);
    debris.push(d);
    placeDebris(d);
  };
  const placeDebris = (d) => {
    if (d.tall) {
      _q1.setFromAxisAngle(_v.set(0, 1, 0), d.yaw);
      _q2.setFromAxisAngle(_v.set(d.dz, 0, -d.dx).normalize(), d.th);
      d.m.quaternion.multiplyQuaternions(_q2, _q1);
      d.m.position.set(d.x, d.y, d.z);
    } else {
      d.m.quaternion.copy(d.q);
      d.m.position.set(d.x, d.y, d.z);
    }
  };
  const stepDebris = (d, dt) => {
    d.age += dt;
    if (d.tall) {
      // falling pole: θ'' = 3g/(2L)·sinθ about the base; stops on the ground
      if (d.th < Math.PI / 2 - 0.06 || Math.abs(d.w) > 0.05) {
        d.w += ((3 * 9.8) / (2 * d.tall)) * Math.sin(d.th) * dt;
        d.th += d.w * dt;
        if (d.th >= Math.PI / 2 - 0.06) {
          d.th = Math.PI / 2 - 0.06;
          d.w = d.w > 1.2 ? -d.w * 0.18 : 0;
          if (!d.landed) {
            d.landed = true;
            fxApi.dust(d.x + d.dx * d.tall * 0.7, d.y, d.z + d.dz * d.tall * 0.7, 10);
          }
        }
      }
      const k = Math.exp(-3 * dt);
      d.bvx *= k;
      d.bvz *= k;
      d.x += d.bvx * dt;
      d.z += d.bvz * dt;
      d.y = d.ground(d.x, d.z);
    } else {
      d.vy -= 9.8 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      const g = d.ground(d.x, d.z);
      const wl = Math.hypot(d.wx, d.wy, d.wz);
      if (wl > 1e-3) d.q.premultiply(_q1.setFromAxisAngle(_v.set(d.wx / wl, d.wy / wl, d.wz / wl), wl * dt));
      if (d.y <= g) {
        d.y = g;
        if (d.vy < -1.5) d.vy = -d.vy * 0.3;
        else d.vy = 0;
        d.vx *= 0.65;
        d.vz *= 0.65;
        d.wx *= 0.6;
        d.wy *= 0.6;
        d.wz *= 0.6;
        // settle flat-ish on the ground once it stops
        if (Math.hypot(d.vx, d.vz) < 0.3 && d.vy === 0) {
          d.wx = d.wy = d.wz = 0;
        }
      }
    }
    placeDebris(d);
  };

  const fxApi = {
    dust(x, y, z, n) {
      for (let i = 0; i < n; i++) emit(dustMat, x + (Math.random() - 0.5) * 0.8, y + 0.2 + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 2.2, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 2.2, 0.9 + Math.random() * 0.7, 0.5, 1.6);
    },
    blood(x, y, z, dx, dz, n, force = 1) {
      for (let i = 0; i < n; i++) {
        const s = (1.2 + Math.random() * 2.2) * force;
        emit(bloodMat, x + (Math.random() - 0.5) * 0.15, y + (Math.random() - 0.5) * 0.25, z + (Math.random() - 0.5) * 0.15, dx * s + (Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 2, dz * s + (Math.random() - 0.5) * 1.6, 0.45 + Math.random() * 0.35, 0.06 + Math.random() * 0.07, -0.05);
      }
    },
    puff(x, y, z, n, size = 0.22) {
      for (let i = 0; i < n; i++) emit(puffMat, x, y, z, (Math.random() - 0.5) * 2.4, (Math.random() - 0.2) * 1.6, (Math.random() - 0.5) * 2.4, 0.18 + Math.random() * 0.12, size, 1.8);
    },
    chips(x, y, z, n, mat = chipMat) {
      for (let i = 0; i < n; i++) emit(mat, x, y, z, (Math.random() - 0.5) * 6, 1 + Math.random() * 4, (Math.random() - 0.5) * 6, 0.6 + Math.random() * 0.5, 0.09, -0.04);
    },
  };
  /** game events → effects (and a small camera kick on the big ones) */
  function event(e, sim, cam) {
    switch (e.type) {
      case "punchHit": {
        const h = (e.y || 0) + 1.38;
        const dx = e.dx || 0;
        const dz = e.dz || 0;
        fxApi.puff(e.x - dx * 0.25, h, e.z - dz * 0.25, e.heavy ? 6 : 3, e.heavy ? 0.3 : 0.2);
        fxApi.blood(e.x, h, e.z, dx, dz, e.onPlayer ? 2 : e.heavy || e.result === "dead" ? 12 : e.combo === 2 ? 7 : 4, e.heavy ? 1.3 : 0.9);
        if (e.player && e.heavy) cam.shake = Math.min(1, cam.shake + 0.22);
        else if (e.player && e.result === "down") cam.shake = Math.min(1, cam.shake + 0.1);
        else if (e.onPlayer) cam.shake = Math.min(1, cam.shake + 0.08);
        break;
      }
      case "pedHit": {
        const sp = e.speed || 4;
        fxApi.puff(e.x, (e.y || 0) + 1, e.z, 4, 0.35);
        if (sp >= 4) fxApi.blood(e.x, (e.y || 0) + 1.1, e.z, 0, 0, Math.min(18, Math.round(sp * 0.9)), Math.min(1.8, sp / 8));
        if (e.player && sp >= 10) cam.shake = Math.min(1, cam.shake + 0.12);
        break;
      }
      case "pedDeath":
        addPool(e.x, sim.city.surfaceAt(e.x, e.z), e.z, e.id);
        break;
      case "propBreak": {
        addDebris(e, sim);
        const t = e.prop.type;
        const y = sim.city.surfaceAt(e.x, e.z);
        fxApi.dust(e.x, y, e.z, t === "lamp" || t === "signal" ? 10 : 6);
        if (t === "lamp" || t === "signal" || t === "sign") fxApi.chips(e.x, y + 0.8, e.z, 14, sparkMat);
        else if (t === "picket" || t === "barrier") fxApi.chips(e.x, y + 0.6, e.z, 16);
        else fxApi.chips(e.x, y + 0.5, e.z, 8, dustMat);
        if (e.player && e.speed > 14 && (t === "lamp" || t === "signal")) cam.shake = Math.min(1, cam.shake + Math.min(0.2, (e.speed - 14) / 40));
        break;
      }
      case "propWobble":
        if (breakables) breakables.wobble(e.prop, e.k, e.dx, e.dz, sim.t);
        break;
      default:
    }
  }
  return {
    event,
    smoke(v, dt, burning) {
      const a = (acc.get(v.id) || 0) + dt;
      if (a < (burning ? 0.06 : 0.14)) {
        acc.set(v.id, a);
        return;
      }
      acc.set(v.id, 0);
      const fx = Math.sin(v.h) * v.st.len * 0.38;
      const fz = Math.cos(v.h) * v.st.len * 0.38;
      emit(smokeMat, v.x + fx, v.y + v.st.hgt * 0.7, v.z + fz, (Math.random() - 0.5) * 0.4, 1.4, (Math.random() - 0.5) * 0.4, 2.2, 0.8, 1.4);
      if (burning) emit(fireMat, v.x + fx, v.y + v.st.hgt * 0.6, v.z + fz, 0, 1.6, 0, 0.5, 0.9, 0.6);
    },
    sparks(x, y, z, n) {
      for (let i = 0; i < n; i++) emit(sparkMat, x, y, z, (Math.random() - 0.5) * 7, Math.random() * 4, (Math.random() - 0.5) * 7, 0.35 + Math.random() * 0.3, 0.18, -0.2);
    },
    update(dt, sim) {
      for (let k = debris.length - 1; k >= 0; k--) {
        const d = debris[k];
        stepDebris(d, Math.min(dt, 0.05));
        if (d.age > 24) dropDebris(d);
      }
      for (let k = pools.length - 1; k >= 0; k--) {
        const q = pools[k];
        q.age += dt;
        q.m.scale.setScalar(q.r * Math.min(1, Math.max(0.01, (q.age - 0.4) / 2.2)));
        // the body is cleaned up after ~30 s: the pool fades with it
        const gone = q.age > 30 || (sim && q.age > 1 && !sim.peds.list.some((p) => p.id === q.id));
        if (gone) q.fade = (q.fade || 0) + dt;
        q.m.material.opacity = 0.9 * (1 - Math.min(1, (q.fade || 0) / 2));
        if ((q.fade || 0) > 2) dropPool(q);
      }
      for (const p of parts) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.s.visible = false;
          continue;
        }
        if (FALL.has(p.s.material)) p.vy -= 9 * dt;
        p.s.position.x += p.vx * dt;
        p.s.position.y += p.vy * dt;
        p.s.position.z += p.vz * dt;
        p.s.scale.setScalar(Math.max(0.05, p.s.scale.x + p.grow * dt));
        if (p.s.material === smokeMat) p.s.material.opacity = 0.45 * (p.life / p.max);
      }
    },
    clear() {
      for (const p of parts) {
        p.life = 0;
        p.s.visible = false;
      }
      while (debris.length) dropDebris(debris[0]);
      while (pools.length) dropPool(pools[0]);
    },
    dispose() {
      for (const p of parts) scene.remove(p.s);
      tex.dispose();
      smokeMat.dispose();
      fireMat.dispose();
      sparkMat.dispose();
      bloodMat.dispose();
      puffMat.dispose();
      chipMat.dispose();
      dustMat.dispose();
      poolTex.dispose();
      poolGeo.dispose();
    },
  };
}
export { wrapA };
