/**
 * Metro Rush — the one 3D world behind every screen.
 *
 * One renderer, one scene per mount. Screens only switch its MODE:
 *   menu   runner posing on the track, a parked train, the city behind
 *   chars  close turntable on the runner (character shop)
 *   boards runner hovering on the selected board (board shop)
 *   game   chase camera over a live run (mirrors engine/run.js each frame)
 *
 * The world never owns game state. Obstacles, coins and pickups are pooled
 * views keyed by sim id; scenery recycles (scenery.js). A fullscreen toggle
 * only resizes. WebGL context loss pauses rendering until it's restored.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { LW, TRAIN_H } from "../engine/config.js";
import { THEME_LEG } from "../engine/run.js";
import { THEMES } from "../data/themes.js";
import { charById, outfitOf } from "../data/characters.js";
import { boardById } from "../data/boards.js";
import { animateRig, buildBarrier, buildBoard, buildOverhead, buildPickup, buildRamp, buildRunner, buildTrain, coinGeometry, createObstacleMaterials, createTrainMaterials, disposeModelGeometry, paintTrain, PICKUP_COLORS } from "./models.js";
import { buildBackdrop, buildSea, buildSky, buildTrack, buildWeather, createScenery, SEG } from "./scenery.js";
import { createEffects } from "./effects.js";
import { disposeMaterials, track } from "./materials.js";

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const MAX_COINS = 520;
const VIEW_AHEAD = 205;
const VIEW_BEHIND = 14;

export function createWorld(host, { quality = "high", onContextLost, onContextRestored } = {}) {
  const lowQ = () => Q === "low";
  let Q = quality;
  const renderer = new THREE.WebGLRenderer({ antialias: Q !== "low", powerPreference: "high-performance", preserveDrawingBuffer: !!host.dataset.preserve });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = Q !== "low";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q === "high" ? 2 : Q === "low" ? 1 : 1.5));
  const canvas = renderer.domElement;
  canvas.className = "mr-canvas";
  host.appendChild(canvas);

  let lost = false;
  const onLost = (e) => {
    e.preventDefault();
    lost = true;
    onContextLost?.();
  };
  const onRestored = () => {
    lost = false;
    // the PMREM environment lives only on the GPU — rebuild it or metals go black
    try {
      const gen = new THREE.PMREMGenerator(renderer);
      const fresh = gen.fromScene(room, 0.04).texture;
      gen.dispose();
      envTex.dispose();
      envTex = fresh;
      scene.environment = envTex;
    } catch (err) {
      console.warn("[MetroRush] environment rebuild failed", err);
    }
    onContextRestored?.();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 900);
  camera.position.set(0, 3.5, 7);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  let envTex = pmrem.fromScene(room, 0.04).texture;
  scene.environment = envTex;
  scene.fog = new THREE.Fog("#cfe6f6", 55, 175);

  /* ------------------------------------------------------------ lights */
  const hemi = new THREE.HemisphereLight("#cfe6ff", "#8b8f86", 1);
  const ambient = new THREE.AmbientLight("#ffffff", 0.2);
  const sun = new THREE.DirectionalLight("#fff1d8", 2.6);
  sun.castShadow = Q !== "low";
  sun.shadow.mapSize.set(Q === "high" ? 2048 : 1024, Q === "high" ? 2048 : 1024);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 30, bottom: -12, near: 1, far: 110 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(hemi, ambient, sun, sun.target);

  /* ------------------------------------------------------------ static parts */
  const sky = buildSky();
  scene.add(sky);
  const trackK = buildTrack();
  scene.add(trackK.group);
  const scenery = createScenery(scene);
  const sea = buildSea();
  sea.material.transparent = true;
  sea.material.opacity = 0;
  sea.visible = false;
  scene.add(sea);
  const weather = buildWeather();
  const weatherRoot = new THREE.Group();
  weatherRoot.add(weather.points, weather.rain);
  scene.add(weatherRoot);
  const backdrops = new Map();
  const backdropRoot = new THREE.Group();
  scene.add(backdropRoot);
  const fx = createEffects(scene);

  /* ------------------------------------------------------------ runner + board */
  let rig = null;
  let runnerKey = "";
  let board = null;
  let boardKey = "";
  const runnerRoot = new THREE.Group();
  scene.add(runnerRoot);
  const boardRoot = new THREE.Group();
  runnerRoot.add(boardRoot);
  const shadowBlob = new THREE.Mesh(track(new THREE.CircleGeometry(0.55, 20)), track(new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.28, depthWrite: false })));
  shadowBlob.rotation.x = -Math.PI / 2;
  shadowBlob.position.y = 0.03;
  scene.add(shadowBlob);

  function setRunner(charId, outfitId) {
    const key = `${charId}|${outfitId}`;
    if (key === runnerKey) return;
    runnerKey = key;
    const ch = charById(charId);
    const nr = buildRunner(ch, outfitOf(ch, outfitId));
    if (rig) {
      nr.cur = { ...rig.cur };
      nr.phase = rig.phase;
      rig.root.removeFromParent();
    }
    rig = nr;
    rig.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    runnerRoot.add(rig.root);
    rig.pop = 1;
  }
  function setBoard(id) {
    if (id === boardKey) return;
    boardKey = id;
    if (board) board.removeFromParent();
    board = buildBoard(boardById(id));
    boardRoot.add(board);
  }

  /* ------------------------------------------------------------ menu props */
  const trainMatSets = new Map();
  function trainMats(th, moving) {
    const key = `${th.id}|${moving ? 1 : 0}`;
    let m = trainMatSets.get(key);
    if (!m) {
      m = createTrainMaterials();
      paintTrain(m, moving ? th.movingTrain : th.train, th.night);
      trainMatSets.set(key, m);
    }
    return m;
  }
  const obMatSets = new Map();
  function obMats(th) {
    let m = obMatSets.get(th.id);
    if (!m) {
      m = createObstacleMaterials(th);
      obMatSets.set(th.id, m);
    }
    return m;
  }
  let menuTrain = null;
  let menuTrainTheme = null;
  function placeMenuTrain(th) {
    if (menuTrainTheme === th.id) return;
    menuTrainTheme = th.id;
    if (menuTrain) menuTrain.removeFromParent();
    menuTrain = buildTrain(3, trainMats(th, false));
    menuTrain.rotation.y = Math.PI;
    menuTrain.position.set(-LW, 0, 2.5);
    for (const g of menuTrain.userData.glows) g.visible = th.night;
    scene.add(menuTrain);
  }

  /* ------------------------------------------------------------ pools */
  const pools = new Map();
  const views = new Map();
  function acquire(key, make) {
    let list = pools.get(key);
    if (!list) pools.set(key, (list = []));
    let v = list.pop();
    if (!v) {
      v = make();
      v.userData.poolKey = key;
      scene.add(v);
    }
    v.visible = true;
    return v;
  }
  function release(v) {
    v.visible = false;
    pools.get(v.userData.poolKey).push(v);
  }
  const coins = new THREE.InstancedMesh(
    coinGeometry(),
    track(new THREE.MeshStandardMaterial({ color: "#ffc531", metalness: 0.9, roughness: 0.22, emissive: "#a86a00", emissiveIntensity: 0.45 })),
    MAX_COINS,
  );
  coins.frustumCulled = false;
  coins.castShadow = false;
  coins.count = 0;
  scene.add(coins);

  /* ------------------------------------------------------------ state */
  let mode = "menu";
  let run = null;
  let themeIdx = 0;
  let fixedTheme = 0;
  let t = 0;
  let shake = 0;
  let turn = 0;
  let turnVel = 0;
  let spinOff = 0;
  const cam = { ang: 2.75, rad: 6.2, h: 1.7, look: 0, fov: 55, x: 0, y: 0 };
  const L = {};
  const tgt = {};
  let menuCheer = 0;

  function lightTargets(th) {
    Object.assign(tgt, {
      top: new THREE.Color(th.sky.top),
      mid: new THREE.Color(th.sky.mid),
      bottom: new THREE.Color(th.sky.bottom),
      fog: new THREE.Color(th.fog.color),
      fogNear: th.fog.near,
      fogFar: th.fog.far,
      sunCol: new THREE.Color(th.sun.color),
      sunInt: th.sun.intensity,
      hemiSky: new THREE.Color(th.hemi.sky),
      hemiGround: new THREE.Color(th.hemi.ground),
      hemiInt: th.hemi.intensity,
      amb: th.ambient,
      exp: th.exposure,
      bed: new THREE.Color(th.bed),
      side: new THREE.Color(th.side),
      rail: new THREE.Color(th.rail),
      sleeper: new THREE.Color(th.sleeper),
      night: th.night ? 1 : 0,
      sea: th.style === "coastal" ? 1 : 0,
      sunDir: new THREE.Vector3(...th.sun.dir).normalize(),
      disc: new THREE.Color(th.sun.disc),
    });
  }
  function applyLight(k, dt) {
    const c = (a, b) => (L[a] ? L[a].lerp(tgt[a], k >= 1 ? 1 : 1 - Math.exp(-k * dt)) : (L[a] = tgt[a].clone()));
    const n = (a) => (L[a] = L[a] === undefined || k >= 1 ? tgt[a] : damp(L[a], tgt[a], k, dt));
    ["top", "mid", "bottom", "fog", "sunCol", "hemiSky", "hemiGround", "bed", "side", "rail", "sleeper", "disc"].forEach((a) => c(a));
    ["fogNear", "fogFar", "sunInt", "hemiInt", "amb", "exp", "night", "sea"].forEach(n);
    if (!L.sunDir || k >= 1) L.sunDir = tgt.sunDir.clone();
    else L.sunDir.lerp(tgt.sunDir, 1 - Math.exp(-k * dt)).normalize();
    const u = sky.material.uniforms;
    u.top.value.copy(L.top);
    u.mid.value.copy(L.mid);
    u.bottom.value.copy(L.bottom);
    u.sunCol.value.copy(L.disc);
    u.sunDir.value.copy(L.sunDir);
    u.night.value = L.night;
    scene.fog.color.copy(L.fog);
    scene.fog.near = L.fogNear;
    scene.fog.far = L.fogFar;
    sun.color.copy(L.sunCol);
    sun.intensity = L.sunInt;
    hemi.color.copy(L.hemiSky);
    hemi.groundColor.copy(L.hemiGround);
    hemi.intensity = L.hemiInt;
    ambient.intensity = L.amb;
    renderer.toneMappingExposure = L.exp;
    trackK.bedMat.color.copy(L.bed).multiplyScalar(1.15);
    trackK.sideMat.color.copy(L.side);
    trackK.railMat.color.copy(L.rail);
    trackK.sleeperMat.color.copy(L.sleeper);
    trackK.bedMat.roughness = 0.95 - L.night * 0.55;
    trackK.bedMat.metalness = L.night * 0.35;
    trackK.sideMat.roughness = 0.95 - L.night * 0.5;
    trackK.sideMat.metalness = L.night * 0.3;
    sea.material.opacity = L.sea;
    sea.visible = L.sea > 0.02;
  }

  function currentTheme() {
    return THEMES[themeIdx];
  }
  function setTheme(i, instant = false) {
    const idx = ((i % THEMES.length) + THEMES.length) % THEMES.length;
    const changed = idx !== themeIdx;
    themeIdx = idx;
    const th = THEMES[idx];
    lightTargets(th);
    scenery.prepare(th, instant);
    if (!backdrops.has(th.id)) {
      const b = buildBackdrop(th);
      b.visible = false;
      backdrops.set(th.id, b);
      backdropRoot.add(b);
    }
    for (const [id, b] of backdrops) b.visible = id === th.id;
    weather.setKind(Q === "low" && th.particles !== "snow" && th.particles !== "rain" ? null : th.particles, th);
    if (th.style === "coastal") sea.material.color.set(th.sea);
    scenery.setNight(th.night);
    if (instant || !L.top) applyLight(1, 0);
    return changed;
  }
  /** theme of the scenery segment k (World Tour changes city every THEME_LEG) */
  function themeFor(k) {
    if (mode !== "game" || !run) return THEMES[fixedTheme];
    if (!run.tour) return THEMES[run.themeStart];
    const leg = Math.floor((k * SEG) / THEME_LEG);
    return THEMES[(((run.themeStart + leg) % 5) + 5) % 5];
  }

  /* ------------------------------------------------------------ obstacles / coins / pickups */
  function obstacleTheme(z) {
    return themeFor(Math.floor(z / SEG));
  }
  function syncObstacles(dt) {
    const dist = run.dist;
    const seen = new Set();
    for (const o of run.obs) {
      if (o.z1 < dist - VIEW_BEHIND || o.z0 > dist + VIEW_AHEAD) continue;
      if (o.moving && !o.active && o.z0 > dist + VIEW_AHEAD - 20) continue;
      seen.add(o.id);
      let v = views.get(o.id);
      if (!v) {
        const th = obstacleTheme(o.z0);
        let obj;
        if (o.kind === "train") {
          obj = acquire(`t${o.cars}|${th.id}|${o.moving ? 1 : 0}`, () => buildTrain(o.cars, trainMats(th, o.moving)));
          for (const g of obj.userData.glows) g.visible = o.moving || th.night;
        } else if (o.kind === "barrier") obj = acquire(`b|${th.id}`, () => buildBarrier(obMats(th)));
        else obj = acquire(`o|${th.id}`, () => buildOverhead(obMats(th)));
        let ramp = null;
        if (o.ramp) ramp = acquire(`r|${th.id}`, () => buildRamp(obMats(th)));
        v = { obj, ramp, dead: false, fade: 1 };
        obj.scale.set(1, 1, 1);
        obj.rotation.set(0, 0, 0);
        views.set(o.id, v);
      }
      if (o.hit && !v.dead) {
        v.dead = true;
        const z = -(o.z0 - dist);
        const th = obstacleTheme(o.z0);
        if (o.kind === "train") fx.smash(o.x, 1.5, z, [th.train.body, th.train.stripe, "#555b66"], 14);
        else fx.smash(o.x, 0.8, z, th.barrier, 9);
        fx.emit(o.x, 1.2, z, 26, "#ffffff", { speed: 6, up: 4, lifeT: 0.5 });
      }
      if (v.dead) {
        v.fade = Math.max(0, v.fade - dt * 6);
        v.obj.scale.setScalar(Math.max(0.001, v.fade));
        if (v.ramp) v.ramp.scale.setScalar(Math.max(0.001, v.fade));
      }
      v.obj.position.set(o.x, 0, -(o.z0 - dist));
      if (v.ramp) v.ramp.position.set(o.x, 0, -(o.z0 - dist));
      if (o.kind === "barrier") {
        const [lamp, sp] = v.obj.userData.blink;
        const on = Math.sin(t * 7 + o.id) > 0;
        lamp.visible = sp.visible = on;
      } else if (o.kind === "train" && o.moving && o.active) {
        const f = 0.8 + 0.4 * Math.abs(Math.sin(t * 9 + o.id));
        for (const g of v.obj.userData.glows) g.scale.set(1.8 * f, 1.8 * f, 1);
      }
    }
    for (const [id, v] of views) {
      if (seen.has(id)) continue;
      release(v.obj);
      if (v.ramp) release(v.ramp);
      views.delete(id);
    }
  }
  const m4 = new THREE.Matrix4();
  const qY = new THREE.Quaternion();
  const vP = new THREE.Vector3();
  const vS = new THREE.Vector3(1, 1, 1);
  const UP = new THREE.Vector3(0, 1, 0);
  function syncCoins() {
    const dist = run.dist;
    let n = 0;
    for (const c of run.coins) {
      if (c.taken) continue;
      const dz = c.z - dist;
      if (dz < -VIEW_BEHIND) continue;
      if (dz > VIEW_AHEAD) break;
      qY.setFromAxisAngle(UP, t * 3.2 + c.z * 0.15);
      vP.set(c.x, c.y + Math.sin(t * 4 + c.z) * 0.06, -dz);
      coins.setMatrixAt(n++, m4.compose(vP, qY, vS));
      if (n >= MAX_COINS) break;
    }
    coins.count = n;
    coins.instanceMatrix.needsUpdate = true;
  }
  const pickupViews = new Map();
  function syncPickups() {
    const dist = run.dist;
    const seen = new Set();
    for (const u of run.pickups) {
      const dz = u.z - dist;
      if (u.taken || dz < -VIEW_BEHIND || dz > VIEW_AHEAD) continue;
      seen.add(u.id);
      let v = pickupViews.get(u.id);
      if (!v) {
        v = acquire(`p|${u.kind}`, () => buildPickup(u.kind));
        pickupViews.set(u.id, v);
      }
      v.position.set(u.x, u.y + 0.25 + Math.sin(t * 3 + u.id) * 0.12, -dz);
      v.userData.inner.rotation.y = t * 2.2;
      v.userData.ring.rotation.set(Math.PI / 2 + Math.sin(t * 2) * 0.3, t * 1.5, 0);
    }
    for (const [id, v] of pickupViews) {
      if (seen.has(id)) continue;
      release(v);
      pickupViews.delete(id);
    }
  }
  function clearViews() {
    for (const v of views.values()) {
      release(v.obj);
      if (v.ramp) release(v.ramp);
    }
    views.clear();
    for (const v of pickupViews.values()) release(v);
    pickupViews.clear();
    coins.count = 0;
    fx.clear();
  }

  /* ------------------------------------------------------------ events → effects */
  function onEvent(e) {
    if (!run || !rig) return;
    const p = run.p;
    if (e.type === "coin") {
      fx.emit(e.x, e.y, -(e.z - run.dist), 5, "#ffd34a", { speed: 2.5, up: 2, lifeT: 0.35, g: 2 });
    } else if (e.type === "land") {
      fx.emit(p.x, p.y + 0.05, 0.1, e.hard ? 14 : 7, "#d9cfc0", { speed: 2.4, up: 0.8, lifeT: 0.45, g: 2 });
      if (e.hard) shake = Math.max(shake, 0.12);
    } else if (e.type === "bump") {
      shake = Math.max(shake, 0.35);
      fx.emit(p.x, 1, -0.3, 12, "#ffffff", { speed: 3, up: 2, lifeT: 0.3 });
    } else if (e.type === "crash") {
      shake = 0.9;
      fx.emit(p.x, 1.1, -0.4, 40, "#ffffff", { speed: 7, up: 5, lifeT: 0.7 });
    } else if (e.type === "power") {
      const col = PICKUP_COLORS[e.kind] || "#ffffff";
      fx.emit(p.x, p.y + 1, 0, 40, col, { speed: 5, up: 3, lifeT: 0.7, g: 1 });
      if (e.kind === "boost") shake = Math.max(shake, 0.25);
    } else if (e.type === "boardBreak") {
      shake = 0.5;
      fx.emit(p.x, p.y + 0.3, 0, 46, boardById(boardKey).glow, { speed: 7, up: 4, lifeT: 0.8 });
    } else if (e.type === "revive") {
      fx.emit(p.x, 1, 0, 60, "#ffe27a", { speed: 6, up: 5, lifeT: 1 });
    }
  }

  /* ------------------------------------------------------------ frame */
  function frame(dt) {
    t += dt;
    const th = currentTheme();
    applyLight(1.2, dt);
    sky.material.uniforms.time.value = t;
    const game = mode === "game" && run;
    const dist = game ? run.dist : 0;
    const p = game ? run.p : null;

    // runner pose
    if (rig) {
      let st;
      if (game) {
        const air = !p.ground;
        const md = run.over ? "crash" : p.slideT > 0 ? "slide" : air ? (p.vy > 0 ? "jump" : "fall") : run.power.board > 0 ? "board" : p.stumbleT > 0 ? "stumble" : "run";
        st = { mode: md, speed: run.speed, lean: p.lean, dt, boost: run.power.boost > 0 };
        runnerRoot.position.set(p.x, p.y + (run.power.board > 0 ? 0.24 : 0), 0);
        runnerRoot.rotation.y = damp(runnerRoot.rotation.y, 0, 10, dt);
      } else {
        const showBoard = mode === "boards";
        const md = menuCheer > 0 ? "cheer" : showBoard ? "board" : "idle";
        menuCheer = Math.max(0, menuCheer - dt);
        st = { mode: md, speed: 0, lean: 0, dt };
        if (mode === "chars" || mode === "boards") {
          // gentle sway that keeps the face towards the camera; drag spins it
          turnVel *= Math.exp(-2.5 * dt);
          spinOff += turnVel * dt;
          if (Math.abs(turnVel) < 0.3) spinOff = damp(spinOff, Math.round(spinOff / (Math.PI * 2)) * Math.PI * 2, 1.5, dt);
          turn = spinOff + 0.45 * Math.sin(t * 0.6);
        } else {
          turn = damp(turn, 0, 4, dt);
          spinOff = 0;
        }
        runnerRoot.position.set(0, showBoard ? 0.35 + Math.sin(t * 2) * 0.06 : 0, 0);
        runnerRoot.rotation.y = -0.35 + turn;
      }
      animateRig(rig, st);
      if (rig.pop > 0) {
        rig.pop = Math.max(0, rig.pop - dt * 3.5);
        const s = 1 + Math.sin(rig.pop * Math.PI) * 0.12;
        rig.root.scale.setScalar((charById(runnerKey.split("|")[0]).build?.h || 1) * s);
      }
      const boardOn = (game && run.power.board > 0) || mode === "boards";
      boardRoot.visible = boardOn;
      if (board && boardOn) {
        board.position.set(0, -0.12 + Math.sin(t * 6) * 0.025, 0);
        board.rotation.set(game ? -0.04 : 0, 0, game ? -p.lean * 0.25 : 0);
        board.userData.halo.material.opacity = 0.5 + 0.3 * Math.sin(t * 8);
        if (game && !run.over && Math.random() < dt * 40) fx.emit(p.x + (Math.random() - 0.5) * 0.3, p.y + 0.12, 0.7, 1, boardById(boardKey).trail, { speed: 0.4, up: 0.3, lifeT: 0.5, g: 0 });
      }
      shadowBlob.position.set(runnerRoot.position.x, 0.03 + (game && p.onRoof ? TRAIN_H : 0), 0);
      shadowBlob.visible = !game || (p.ground || p.y < TRAIN_H + 3);
      const hgt = game ? Math.max(0, p.y - (p.onRoof || p.y > TRAIN_H - 0.1 ? TRAIN_H : 0)) : 0;
      shadowBlob.scale.setScalar(Math.max(0.35, 1 - hgt * 0.25));
      shadowBlob.material.opacity = sun.castShadow ? 0.12 : 0.28;
    }

    // power-up visuals
    if (game) {
      fx.bubble.visible = run.power.shield > 0 && !run.over;
      if (fx.bubble.visible) {
        fx.bubble.position.set(p.x, p.y + 0.9, 0);
        const blink = run.power.shield < 2 ? 0.5 + 0.5 * Math.sin(t * 20) : 1;
        fx.bubble.material.opacity = 0.18 * blink + 0.04;
        fx.bubble.scale.setScalar(1 + Math.sin(t * 5) * 0.03);
      }
      fx.ring.visible = run.power.magnet > 0 && !run.over;
      if (fx.ring.visible) {
        fx.ring.position.set(p.x, p.y + 0.15, 0);
        fx.ring.scale.setScalar(1 + ((t * 1.5) % 1) * 1.6);
        fx.ring.material.opacity = 0.7 * (1 - ((t * 1.5) % 1));
      }
      if (rig) rig.root.visible = !(p.graceT > 0 && Math.sin(t * 40) > 0.3 && !run.over);
      if (run.power.boost > 0 && !run.over && Math.random() < dt * 60) fx.emit(p.x + (Math.random() - 0.5) * 2, 0.3 + Math.random() * 2, -2 - Math.random() * 3, 1, "#ffb35a", { speed: 0.2, up: 0, lifeT: 0.35, g: 0 });
    } else {
      fx.bubble.visible = fx.ring.visible = false;
      if (rig) rig.root.visible = true;
    }

    // world parts
    if (game) {
      syncObstacles(dt);
      syncCoins();
      syncPickups();
    }
    const menuLike = !game;
    trackK.group.position.z = menuLike ? 200 : 0;
    trackK.scroll(dist);
    if (menuLike) scenery.update(0, 280, 60, themeFor);
    else scenery.update(dist, 40, 330, themeFor);
    if (menuTrain) menuTrain.visible = menuLike;
    weatherRoot.rotation.y = menuLike ? Math.PI : 0;
    backdropRoot.rotation.y = menuLike ? Math.PI : 0;
    weather.update(dt, game && !run.over ? run.speed : 0.6, t, Q);
    fx.update(dt, game && !run.over ? run.speed * dt : 0);
    if (sea.visible) sea.userData.tex.offset.y = ((dist + t * 0.6) / 14) % 1;

    // camera
    const vw = host.clientWidth || 16;
    const vh = host.clientHeight || 9;
    const narrow = vw / vh < 1.2;
    let want;
    if (game) want = { ang: 0, rad: narrow ? 8.4 : 7.4, h: (narrow ? 5.0 : 4.6) + p.y * 0.55, look: 1, fov: Math.min(84, (narrow ? 70 : 61) + (run.speed - 14) * 0.33 + (run.power.boost > 0 ? 9 : 0)), x: p.x * 0.72, y: p.y };
    else if (mode === "chars") want = { ang: 2.9, rad: narrow ? 4.6 : 3.7, h: 1.25, look: 0, fov: 46, x: 0.35, y: 0 };
    else if (mode === "boards") want = { ang: 2.75, rad: narrow ? 4.4 : 3.5, h: 1.5, look: 0, fov: 48, x: 0.35, y: 0.2 };
    else want = { ang: 2.62, rad: narrow ? 7.4 : 5.9, h: 1.75, look: 0, fov: 52, x: narrow ? 0 : -1.1, y: 0 };
    if (game && run.over) {
      want.ang = 0.5;
      want.rad = 5.2;
      want.h = 2.4 + p.y * 0.6;
      want.fov = 60;
    }
    const kc = game ? 6 : 3.2;
    cam.ang = damp(cam.ang, want.ang, kc * 0.8, dt);
    cam.rad = damp(cam.rad, want.rad, kc, dt);
    cam.h = damp(cam.h, want.h, game ? 5 : 3, dt);
    cam.look = damp(cam.look, want.look, kc, dt);
    cam.fov = damp(cam.fov, want.fov, 3, dt);
    cam.x = damp(cam.x, want.x, game ? 8 : 3, dt);
    cam.y = damp(cam.y, want.y, 5, dt);
    shake = Math.max(0, shake - dt * 1.8);
    const sh = shake * shake;
    const cx = cam.x + Math.sin(cam.ang) * cam.rad + (Math.random() - 0.5) * sh;
    const cz = Math.cos(cam.ang) * cam.rad;
    camera.position.set(cx, cam.h + (Math.random() - 0.5) * sh, cz);
    const px = game ? p.x : 0;
    const lookAt = new THREE.Vector3(
      px * (0.5 + 0.35 * cam.look) + (1 - cam.look) * (mode === "menu" ? (narrow ? 0 : -1.1) : 0.35),
      (game ? 1.15 + cam.y * 0.7 : 1) * cam.look + (1 - cam.look) * (narrow ? (mode === "menu" ? 0.15 : 0.75) : mode === "boards" ? 1.05 : 1.0),
      -10 * cam.look,
    );
    camera.lookAt(lookAt);
    if (Math.abs(camera.fov - cam.fov) > 0.01) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    sky.position.copy(camera.position);
    backdropRoot.position.set(camera.position.x * 0.3, 0, 0);

    // sun follows the runner so its shadow stays crisp
    const sd = L.sunDir || new THREE.Vector3(0, 1, 0);
    const sx = game ? p.x : 0;
    sun.position.set(sx + sd.x * 45, sd.y * 45, sd.z * 45 - (menuLike ? -6 : 8));
    sun.target.position.set(sx, 0, menuLike ? 6 : -8);

    if (!lost) renderer.render(scene, camera);
  }

  function resize() {
    const w = Math.max(2, host.clientWidth);
    const h = Math.max(2, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  return {
    renderer,
    scene,
    camera,
    canvas,
    get mode() {
      return mode;
    },
    setMode(m) {
      if (m === mode) return;
      const wasGame = mode === "game";
      mode = m;
      if (m !== "game") {
        clearViews();
        if (wasGame) {
          scenery.reset();
          setTheme(fixedTheme, false);
        }
      }
    },
    setRun(r) {
      run = r;
      clearViews();
      scenery.reset();
      if (r) {
        setTheme(r.themeStart, false);
        for (let i = 0; i < 2; i++) scenery.prepare(THEMES[(r.themeStart + i) % 5], i === 0);
      }
    },
    setFixedTheme(i) {
      fixedTheme = i;
      if (mode !== "game") {
        setTheme(i, false);
        scenery.prepare(THEMES[i], true);
        placeMenuTrain(THEMES[i]);
        scenery.reset();
      }
    },
    setTheme,
    prepareTheme: (i) => scenery.prepare(THEMES[i]),
    setRunner,
    setBoard,
    onEvent,
    cheer() {
      menuCheer = 1.6;
    },
    spin(dv) {
      turnVel += dv;
    },
    setQuality(q) {
      Q = q;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === "high" ? 2 : q === "low" ? 1 : 1.5));
      renderer.shadowMap.enabled = q !== "low";
      sun.castShadow = q !== "low";
      setTheme(themeIdx, false);
      resize();
      scene.traverse((o) => {
        if (o.material) o.material.needsUpdate = true;
      });
    },
    get lost() {
      return lost;
    },
    frame,
    resize,
    stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, views: views.size, pools: [...pools.values()].reduce((a, l) => a + l.length, 0), lowQ: lowQ() }),
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      scene.traverse((o) => {
        if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      });
      disposeMaterials();
      disposeModelGeometry();
      envTex.dispose();
      pmrem.dispose();
      room.traverse((o) => o.geometry?.dispose?.());
      renderer.dispose();
      canvas.remove();
    },
  };
}

