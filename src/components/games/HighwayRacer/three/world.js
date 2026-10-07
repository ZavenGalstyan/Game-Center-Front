/**
 * Highway Racer — the one 3D world behind every screen.
 *
 * One renderer, one scene, created once per mount. Screens only switch its
 * MODE:  menu (car parked on the shoulder, distant traffic) · garage
 * (showroom turntable) · game (chase camera on a live run). Changing theme or
 * car rebuilds just that part. A fullscreen toggle only resizes.
 *
 * The world never owns game state: in game mode it mirrors the run object
 * (engine/run.js) every frame — traffic slots map onto pooled vehicle views,
 * pickups onto instanced coins, events onto effects.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createScenery } from "./scenery.js";
import { createEffects } from "./effects.js";
import { buildPlayerCar, buildTraffic, disposeVehicleGeometry } from "./carModel.js";
import { disposeAll, glowMat } from "./materials.js";
import { envById } from "../data/environments.js";
import { carById } from "../data/cars.js";
import { COUNTDOWN, LANES, MAX_BOOST_PICKUPS, MAX_COINS, RAIL_X, SPEED, clamp } from "../engine/config.js";

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e3 = new THREE.Euler();
const s3 = new THREE.Vector3();
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export function createWorld({ scene, camera, gl, settings }) {
  let S = { ...settings };
  let mode = "menu";
  let env = envById("sunset");
  let carDef = carById();
  let run = null;
  let time = 0;
  let scenery = null;
  let player = null;
  let garageYaw = 0.6;
  let garageSpin = 0;
  let shake = 0;
  let lastSpeed = 0;
  let pitch = 0;
  const camPos = new THREE.Vector3(0, 3, 7);
  const camLook = new THREE.Vector3(0, 1, -12);

  /* --------------------------------------------------------------- renderer */
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  const pmrem = new THREE.PMREMGenerator(gl);
  const room = new RoomEnvironment();
  const envTex = pmrem.fromScene(room, 0.04).texture;
  room.dispose?.();
  scene.environment = envTex;

  /* --------------------------------------------------------------- lights */
  const hemi = new THREE.HemisphereLight("#cfe2ff", "#8a6a4a", 0.8);
  const ambient = new THREE.AmbientLight("#ffffff", 0.15);
  const sun = new THREE.DirectionalLight("#ffd2a0", 2.4);
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(hemi, ambient, sun, sun.target);
  const headlight = new THREE.SpotLight("#fff1d6", 0, 70, 0.42, 0.55, 1.2);
  scene.add(headlight, headlight.target);

  /* --------------------------------------------------------------- effects */
  const fx = createEffects(scene);

  /* --------------------------------------------------------------- traffic views */
  const trafficRoot = new THREE.Group();
  scene.add(trafficRoot);
  const freeViews = {};
  const slotViews = [];
  const TAIL_Y = { sedan: 0.9, hatch: 0.98, suv: 1.14, van: 1.1, truck: 1.05 };
  function acquire(type) {
    const list = freeViews[type] || (freeViews[type] = []);
    let v = list.pop();
    if (!v) {
      v = buildTraffic(type);
      // tail-light glow (strong at night, a hint by day)
      v.glows = [];
      const W = type === "truck" ? 2.36 : 1.85;
      const L = type === "truck" ? 9.2 : { sedan: 4.4, hatch: 3.8, suv: 4.7, van: 5.1 }[type];
      for (const sx of [-1, 1]) {
        const g = new THREE.Mesh(glowGeo, glowMat("#ff3a2a", 0.9));
        g.position.set(sx * W * 0.34, TAIL_Y[type], L / 2 + 0.08);
        g.renderOrder = 3;
        v.group.add(g);
        v.glows.push(g);
      }
      trafficRoot.add(v.group);
    }
    v.group.visible = true;
    for (const g of v.glows) g.visible = env.night;
    return v;
  }
  function release(v) {
    v.group.visible = false;
    freeViews[v.type].push(v);
  }
  const glowGeo = new THREE.PlaneGeometry(0.9, 0.55);

  /* --------------------------------------------------------------- pickups */
  const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 24);
  coinGeo.rotateX(Math.PI / 2);
  const coinMat = new THREE.MeshStandardMaterial({ color: "#ffc531", metalness: 0.85, roughness: 0.25, emissive: "#8a5200", emissiveIntensity: 0.55 });
  const coins = new THREE.InstancedMesh(coinGeo, coinMat, MAX_COINS + MAX_BOOST_PICKUPS);
  coins.frustumCulled = false;
  coins.castShadow = true;
  const haloGeo = new THREE.PlaneGeometry(1.5, 1.5);
  const halos = new THREE.InstancedMesh(haloGeo, glowMat("#ffcf4a", 0.45), MAX_COINS + MAX_BOOST_PICKUPS);
  halos.frustumCulled = false;
  scene.add(coins, halos);
  const boosts = [];
  {
    const shape = new THREE.Shape();
    // lightning bolt
    [[0.1, 0.55], [-0.28, 0.0], [-0.02, 0.0], [-0.12, -0.55], [0.28, 0.08], [0.02, 0.08], [0.1, 0.55]].forEach(([x, y], i) =>
      i ? shape.lineTo(x, y) : shape.moveTo(x, y),
    );
    const bolt = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
    bolt.translate(0, 0, -0.06);
    const boltMat = new THREE.MeshStandardMaterial({ color: "#7fe8ff", emissive: "#2bbcff", emissiveIntensity: 1.6, roughness: 0.3 });
    const ring = new THREE.TorusGeometry(0.62, 0.05, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: "#8fe6ff", transparent: true, opacity: 0.85 });
    for (let i = 0; i < MAX_BOOST_PICKUPS; i++) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(bolt, boltMat);
      const r = new THREE.Mesh(ring, ringMat);
      const h = new THREE.Mesh(haloGeo, glowMat("#49c8ff", 0.6));
      h.scale.setScalar(1.6);
      g.add(b, r, h);
      g.visible = false;
      scene.add(g);
      boosts.push({ g, b, r });
    }
    boosts.geoms = [bolt, ring];
    boosts.mats = [boltMat, ringMat];
  }

  /* --------------------------------------------------------------- garage */
  const garage = new THREE.Group();
  {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: "#0d1016", roughness: 0.55, metalness: 0.4 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.55, 0.16, 64), new THREE.MeshStandardMaterial({ color: "#1b2029", roughness: 0.35, metalness: 0.6 }));
    plat.position.y = 0.08;
    plat.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.48, 0.035, 8, 96), new THREE.MeshBasicMaterial({ color: "#ff9a3c" }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.17;
    const back = new THREE.Mesh(
      new THREE.CylinderGeometry(26, 26, 18, 48, 1, true),
      new THREE.MeshBasicMaterial({ color: "#151a24", side: THREE.BackSide, fog: false }),
    );
    back.position.y = 8;
    const strip = new THREE.Mesh(new THREE.CylinderGeometry(25.8, 25.8, 0.25, 48, 1, true), new THREE.MeshBasicMaterial({ color: "#ff8a3a", side: THREE.BackSide, fog: false }));
    strip.position.y = 3.2;
    garage.add(floor, plat, ring, back, strip);
    garage.visible = false;
    scene.add(garage);
  }
  const garageLight = new THREE.SpotLight("#ffffff", 0, 30, 0.6, 0.6, 1);
  garageLight.position.set(2, 9, 4);
  scene.add(garageLight, garageLight.target);

  /* --------------------------------------------------------------- menu traffic */
  const menuCars = [];
  let menuTimer = 0.5;
  let menuSeq = 0;

  /* --------------------------------------------------------------- builders */
  function applyEnv() {
    if (scenery) scenery.dispose();
    scenery = createScenery({ scene, gl, env, quality: S.graphics });
    scenery.setVisible(mode !== "garage");
    const L = env.light;
    hemi.color.set(L.hemiSky);
    hemi.groundColor.set(L.hemiGround);
    hemi.intensity = L.hemi;
    ambient.intensity = L.ambient;
    sun.color.set(L.sun);
    sun.intensity = L.sunI;
    scene.fog = new THREE.Fog(env.fog.color, env.fog.near, env.fog.far);
    scene.background = new THREE.Color(env.fog.color);
    scene.environmentIntensity = env.night ? 0.35 : 0.9;
    headlight.intensity = env.night ? 60 : 0;
    for (const list of Object.values(freeViews)) for (const v of list) for (const g of v.glows) g.visible = env.night;
    for (const sv of slotViews) if (sv) for (const g of sv.view.glows) g.visible = env.night;
    applyMode();
  }

  function applyCar() {
    if (player) {
      player.group.parent && player.group.parent.remove(player.group);
      player.dispose();
    }
    player = buildPlayerCar(carDef, S.graphics);
    (mode === "garage" ? garage : scene).add(player.group);
    const glows = [];
    for (const sx of [-1, 1]) {
      const g = new THREE.Mesh(glowGeo, glowMat("#ff3a2a", 0.9));
      g.position.set(sx * player.dims.W * 0.33, 0.8, player.dims.rearZ + 0.08);
      g.visible = env.night;
      g.renderOrder = 3;
      player.body.add(g);
      glows.push(g);
    }
    player.glows = glows;
  }

  function applyShadows() {
    const on = S.shadows !== "off" && S.graphics !== "low";
    sun.castShadow = on;
    const size = S.shadows === "high" && S.graphics === "high" ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    fx.setLevel(S.particles);
  }

  function applyMode() {
    const inGarage = mode === "garage";
    garage.visible = inGarage;
    if (scenery) scenery.setVisible(!inGarage);
    trafficRoot.visible = !inGarage;
    coins.visible = halos.visible = mode === "game";
    garageLight.intensity = inGarage ? 120 : 0;
    if (inGarage) {
      scene.fog = new THREE.Fog("#0b0d12", 18, 60);
      scene.background = new THREE.Color("#0b0d12");
      hemi.intensity = 0.55;
      sun.intensity = 1.4;
      headlight.intensity = 0;
      scene.environmentIntensity = 1;
    } else if (scene.fog && scene.fog.color.getHexString() === "0b0d12") {
      scene.fog = new THREE.Fog(env.fog.color, env.fog.near, env.fog.far);
      scene.background = new THREE.Color(env.fog.color);
      hemi.intensity = env.light.hemi;
      sun.intensity = env.light.sunI;
      headlight.intensity = env.night ? 60 : 0;
      scene.environmentIntensity = env.night ? 0.35 : 0.9;
    }
    if (player) {
      const parent = inGarage ? garage : scene;
      if (player.group.parent !== parent) parent.add(player.group);
      for (const g of player.glows || []) g.visible = env.night && !inGarage;
    }
    if (mode !== "game") {
      for (let i = 0; i < slotViews.length; i++) {
        if (slotViews[i]) release(slotViews[i].view);
        slotViews[i] = null;
      }
      for (const b of boosts) b.g.visible = false;
      fx.clear();
    }
    if (mode !== "menu") {
      for (const c of menuCars) release(c.view);
      menuCars.length = 0;
    }
  }

  applyShadows();
  applyEnv();
  applyCar();

  /* --------------------------------------------------------------- per-frame */
  function placePlayer(x, z, yaw, dt, v) {
    const g = player.group;
    g.position.set(x, 0, z);
    g.rotation.set(0, yaw, 0);
    for (const w of player.wheels) w.spin.rotation.x -= (v * dt) / player.dims.r;
  }

  function syncGame(dt) {
    const R = run;
    const p = R.player;
    const v = R.speed;
    scenery.update(R.distance, camera);

    /* player */
    placePlayer(p.x, 0, p.yaw + p.spin, dt, v);
    const accel = dt > 0 ? (v - lastSpeed) / dt : 0;
    lastSpeed = v;
    pitch = damp(pitch, clamp(accel * 0.0035, -0.03, 0.025), 6, dt);
    player.body.rotation.set(pitch, 0, -p.lean * 0.55);
    player.body.position.y = p.bounce * 0.25 + (R.phase === "countdown" ? Math.sin(time * 38) * 0.004 : 0);
    for (const w of player.wheels) if (w.front) w.pivot.rotation.y = -p.steer;
    const crashed = R.phase === "crashed" || R.phase === "result";
    player.tailMat.emissiveIntensity = crashed ? 2.6 : R.phase === "countdown" ? 1.8 : 1.1;
    const boosting = R.boostTime > 0;
    for (const f of player.flames) {
      f.visible = boosting;
      if (boosting) {
        f.material.opacity = 0.55 + Math.random() * 0.35;
        f.scale.set(1, 1, 0.8 + Math.random() * 0.6);
      }
    }
    headlight.position.set(p.x, 0.9, -1.8);
    headlight.target.position.set(p.x, 0, -24);

    /* traffic */
    const T = R.traffic;
    for (let i = 0; i < T.length; i++) {
      const c = T[i];
      let sv = slotViews[i];
      if (!c.active) {
        if (sv) {
          release(sv.view);
          slotViews[i] = null;
        }
        continue;
      }
      if (!sv || sv.id !== c.id) {
        if (sv) release(sv.view);
        sv = slotViews[i] = { id: c.id, view: acquire(c.type) };
        sv.view.setPaint(c.paint);
        sv.wob = 0;
      }
      const g = sv.view.group;
      g.position.set(c.x, 0, c.z);
      // the car we hit gets shoved: a short wobble
      g.rotation.y = c.bump > 0 ? Math.sin(c.bump * 16) * 0.12 * c.bump : 0;
      g.rotation.z = c.bump > 0 ? Math.sin(c.bump * 11) * 0.05 * c.bump : 0;
    }

    /* pickups */
    let n = 0;
    for (const b of boosts) b.g.visible = false;
    let bi = 0;
    for (const k of R.pickups) {
      if (!k.active) continue;
      if (k.kind === "coin") {
        e3.set(0, time * 3 + k.id * 0.7, 0);
        q.setFromEuler(e3);
        s3.setScalar(1);
        tmpV.set(k.x, 0.9 + Math.sin(time * 4 + k.id) * 0.06, k.z);
        m4.compose(tmpV, q, s3);
        coins.setMatrixAt(n, m4);
        q.identity();
        m4.compose(tmpV, q, s3);
        halos.setMatrixAt(n, m4);
        n++;
      } else if (bi < boosts.length) {
        const B = boosts[bi++];
        B.g.visible = true;
        B.g.position.set(k.x, 1.05 + Math.sin(time * 3 + k.id) * 0.12, k.z);
        B.b.rotation.y = time * 2.4;
        B.r.rotation.z = time * 1.2;
      }
    }
    coins.count = n;
    halos.count = n;
    coins.instanceMatrix.needsUpdate = true;
    halos.instanceMatrix.needsUpdate = true;

    /* camera */
    const motion = !S.reducedMotion;
    const speedK = clamp((v - SPEED.start) / 30, 0, 1);
    const chase = tmpV.set(p.x * 0.62, 3.15, 7.1);
    const look = tmpV2.set(p.x * 0.85, 0.9, -14);
    let fov = 60;
    if (motion && S.speedEffects) fov += speedK * 6 + (boosting ? 5 : 0);
    if (R.phase === "countdown" && motion) {
      // swing from a front-quarter view round to the chase position
      const k = clamp(1 - R.countdown / (COUNTDOWN * 0.88), 0, 1);
      const ease = 1 - Math.pow(1 - k, 3);
      const phi = 2.15 * (1 - ease);
      const R0 = 6.6 + ease * 0.6;
      tmpV.set(p.x + Math.sin(phi) * R0 * 0.95, 1.5 + ease * 1.65, Math.cos(phi) * R0);
      look.set(p.x * (0.4 + ease * 0.45), 0.75 + ease * 0.15, -14 * ease);
      camPos.copy(tmpV);
      camLook.copy(look);
    } else {
      camPos.x = damp(camPos.x, chase.x, 7, dt);
      camPos.y = damp(camPos.y, chase.y, 5, dt);
      camPos.z = damp(camPos.z, chase.z, 5, dt);
      camLook.x = damp(camLook.x, look.x, 8, dt);
      camLook.y = damp(camLook.y, look.y, 5, dt);
      camLook.z = damp(camLook.z, look.z, 5, dt);
    }
    camera.position.copy(camPos);
    if (shake > 0) {
      const amp = (S.cameraShake === "low" ? 0.08 : S.cameraShake === "normal" ? 0.2 : 0) * shake * (motion ? 1 : 0.3);
      camera.position.x += (Math.random() - 0.5) * amp;
      camera.position.y += (Math.random() - 0.5) * amp;
      shake = Math.max(0, shake - dt * 2.2);
    }
    camera.lookAt(camLook);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = damp(camera.fov, fov, 4, dt);
      camera.updateProjectionMatrix();
    }

    /* effects */
    const streak = motion && S.speedEffects ? clamp((v - 44) / 30, 0, 0.7) + (boosting ? 0.6 : 0) : 0;
    fx.update(dt, v, R.phase === "playing" ? streak : 0, camera.position);
  }

  function syncMenu(dt) {
    scenery.update(0, camera);
    scenery.drift(dt);
    const px = RAIL_X - 1.45;
    placePlayer(px, 0, 0.0, dt, 0);
    player.body.position.y = Math.sin(time * 34) * 0.0035 + Math.sin(time * 1.3) * 0.002;
    player.body.rotation.set(0, 0, 0);
    for (const w of player.wheels) if (w.front) w.pivot.rotation.y = -0.22;
    player.tailMat.emissiveIntensity = 0.9;
    for (const f of player.flames) f.visible = false;
    headlight.position.set(px, 0.9, -1.8);
    headlight.target.position.set(px - 2, 0, -24);
    // occasional distant traffic heading off toward the horizon
    menuTimer -= dt;
    if (menuTimer <= 0 && menuCars.length < 4) {
      menuTimer = 3.5 + Math.random() * 3;
      const type = ["sedan", "hatch", "suv", "sedan", "van"][menuSeq++ % 5];
      const view = acquire(type);
      view.setPaint(menuSeq * 3);
      menuCars.push({ view, x: LANES[menuSeq % 2], z: 30, v: 24 + Math.random() * 6 });
    }
    for (let i = menuCars.length - 1; i >= 0; i--) {
      const c = menuCars[i];
      c.z -= c.v * dt;
      c.view.group.position.set(c.x, 0, c.z);
      c.view.group.rotation.set(0, 0, 0);
      if (c.z < -420) {
        release(c.view);
        menuCars.splice(i, 1);
      }
    }
    const drift = S.reducedMotion ? 0 : Math.sin(time * 0.18);
    camera.position.set(0.6 + drift * 0.5, 1.45 + drift * 0.08, 6.6);
    camLook.set(px - 1.4, 0.95, -6);
    camera.lookAt(camLook);
    if (camera.fov !== 52) {
      camera.fov = 52;
      camera.updateProjectionMatrix();
    }
    fx.update(dt, 0, 0, camera.position);
  }

  function syncGarage(dt) {
    if (!S.reducedMotion) garageYaw += dt * 0.35 * (1 - garageSpin);
    garageSpin = Math.max(0, garageSpin - dt * 0.6);
    player.group.position.set(0, 0.16, 0);
    player.group.rotation.set(0, garageYaw, 0);
    player.body.rotation.set(0, 0, 0);
    player.body.position.y = 0;
    for (const w of player.wheels) w.pivot.rotation.y = 0;
    player.tailMat.emissiveIntensity = 1.1;
    for (const f of player.flames) f.visible = false;
    garageLight.target.position.set(0, 0, 0);
    sun.position.set(-6, 10, 6);
    sun.target.position.set(0, 0, 0);
    // car framed left of centre, clear of the stats card on the right
    camera.position.set(2.3, 2.3, 9.8);
    camera.lookAt(2.3, 0.45, 0);
    if (camera.fov !== 42) {
      camera.fov = 42;
      camera.updateProjectionMatrix();
    }
  }

  return {
    get mode() {
      return mode;
    },
    setMode(m) {
      if (m === mode) return;
      mode = m;
      applyMode();
    },
    setEnvironment(id) {
      const next = envById(id);
      if (next.id === env.id) return;
      env = next;
      applyEnv();
    },
    setCar(id) {
      const next = carById(id);
      if (next.id === carDef.id && player) return;
      carDef = next;
      applyCar();
      applyMode();
    },
    setSettings(next) {
      const rebuildScenery = next.graphics !== S.graphics;
      const rebuildCar = next.graphics !== S.graphics;
      S = { ...next };
      applyShadows();
      if (rebuildScenery) applyEnv();
      if (rebuildCar) applyCar();
      applyMode();
    },
    setRun(R) {
      run = R;
      lastSpeed = 0;
      shake = 0;
      fx.clear();
      for (let i = 0; i < slotViews.length; i++) {
        if (slotViews[i]) release(slotViews[i].view);
        slotViews[i] = null;
      }
    },
    /** run events → effects */
    event(ev) {
      if (!run) return;
      const p = run.player;
      if (ev.type === "crash") {
        shake = 1;
        fx.crash(ev.x, 0.6, ev.z, Math.sign(p.vx) || 1);
      } else if (ev.type === "coin") fx.coin(ev.x, 0.9, ev.z);
      else if (ev.type === "boostPickup") fx.boostPickup(ev.x, 1, ev.z);
    },
    garageRotate(dx) {
      garageYaw += dx;
      garageSpin = 1;
    },
    frame(dt) {
      time += dt;
      // the sun (and its shadow box) follows the player
      const px = player ? player.group.position.x : 0;
      if (mode !== "garage") {
        const L = env.light.sunPos;
        sun.position.set(px + L[0] * 0.5, L[1], L[2] * 0.25 + 6);
        sun.target.position.set(px, 0, -6);
      }
      if (mode === "game" && run) syncGame(dt);
      else if (mode === "garage") syncGarage(dt);
      else syncMenu(dt);
    },
    resize() {},
    stats() {
      let views = 0;
      for (const list of Object.values(freeViews)) views += list.length;
      return {
        trafficViews: views + slotViews.filter(Boolean).length + menuCars.length,
        activeViews: slotViews.filter(Boolean).length,
        sceneChildren: scene.children.length,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
      };
    },
    dispose() {
      if (scenery) scenery.dispose();
      if (player) player.dispose();
      fx.dispose();
      scene.remove(trafficRoot, coins, halos, garage, hemi, ambient, sun, sun.target, headlight, headlight.target, garageLight, garageLight.target);
      for (const b of boosts) scene.remove(b.g);
      for (const g of boosts.geoms) g.dispose();
      for (const m of boosts.mats) m.dispose();
      coinGeo.dispose();
      coinMat.dispose();
      haloGeo.dispose();
      glowGeo.dispose();
      coins.dispose();
      halos.dispose();
      garage.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
      if (sun.shadow.map) sun.shadow.map.dispose();
      envTex.dispose();
      pmrem.dispose();
      disposeVehicleGeometry();
      disposeAll();
      scene.environment = null;
      scene.fog = null;
    },
  };
}
