/**
 * Tank Warfare 3D — renderer (plain Three.js).
 *
 * createWorld(canvas) owns the WebGLRenderer, the battlefield scene (built
 * from env.js per world and cached), the tank views that mirror sim tanks,
 * the pooled effects (fx.js), the camera rig and a separate garage scene.
 *
 *   updateCamera(sim, cam, dt) — chase / gunner / cinematic camera with
 *                                smoothing, zoom, collision avoidance, shake
 *   aimPoint(sim)              — where the screen centre ray hits the world
 *   render(sim, dt, opts)      — sync views + effects and draw
 *   renderMenu / renderGarage  — background scenes for the menus
 *
 * Each tank view is root (heading/pitch/roll) → body (suspension + engine
 * vibration) → turret (independent yaw) → gun (elevation) → recoil (slide).
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { design, designGeometries, makeTextures, makeMaterials, paintMaterial, wheelGeo, Parts, boxGeo, cylGeo } from "./models.js";
import { buildEnv, makeEnvTextures, makeEnvMaterials, PALETTE } from "./env.js";
import { Particles, Tracers, Debris, Decals, Flashes, fxTextures } from "./fx.js";
import { buildMap } from "./map.js";
import { ELEV_MIN } from "./sim.js";
import { AMMO } from "./data.js";

const V = () => new THREE.Vector3();
const tv = V();
const tv2 = V();
const tm = new THREE.Matrix4();
const tq = new THREE.Quaternion();
const te = new THREE.Euler();
const ts = V();
const UP = new THREE.Vector3(0, 1, 0);

export function createWorld(canvas, { quality = "high", preserve = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== "low", powerPreference: "high-performance", preserveDrawingBuffer: preserve });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = quality !== "low";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  let q = quality;
  const setDpr = () => renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === "high" ? 1.5 : q === "medium" ? 1.2 : 1));
  setDpr();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.2, 1500);
  const size = { w: 1, h: 1 };
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.45;

  // lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.castShadow = renderer.shadowMap.enabled;
  sun.shadow.mapSize.set(q === "high" ? 2048 : 1024, q === "high" ? 2048 : 1024);
  const SC = 70;
  Object.assign(sun.shadow.camera, { left: -SC, right: SC, top: SC, bottom: -SC, near: 1, far: 400 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);

  // shared resources
  const vt = makeTextures();
  const VM = makeMaterials(vt);
  const ET = makeEnvTextures();
  const EM = makeEnvMaterials(ET, vt);
  const FT = fxTextures();
  const wheelGeos = { road: wheelGeo("road"), sprocket: wheelGeo("sprocket"), tyre: wheelGeo("tyre") };
  const MAXW = 900;
  const wheelIMs = {};
  for (const k of Object.keys(wheelGeos)) {
    const im = new THREE.InstancedMesh(wheelGeos[k], VM.wheel, MAXW);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    im.frustumCulled = false;
    im.castShadow = true;
    scene.add(im);
    wheelIMs[k] = im;
  }
  const smoke = new Particles(2600, FT.puff, false);
  const fire = new Particles(1400, FT.glow, true);
  const tracers = new Tracers(80);
  const debrisMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.1 });
  const debris = new Debris(220, debrisMat);
  const decals = new Decals(60, FT.scorch);
  const flashes = new Flashes(scene, 3);
  scene.add(smoke.mesh, fire.mesh, tracers.mesh, debris.mesh, decals.mesh);

  /* ------------------------------------------------------------ environments (cached per world) */
  const envs = new Map();
  let env = null;
  function useWorld(worldId) {
    if (env && env.worldId === worldId) return env;
    if (env) scene.remove(env.group);
    if (!envs.has(worldId)) envs.set(worldId, buildEnv(buildMap(worldId), worldId, { T: ET, M: EM, vt, quality: q }));
    env = envs.get(worldId);
    scene.add(env.group);
    const P = env.palette;
    scene.fog = new THREE.Fog(P.fog, P.fogNear, P.fogFar);
    for (const p of [smoke, fire]) {
      p.mat.uniforms.fogColor.value.setHex(P.fog);
      p.mat.uniforms.fogNear.value = P.fogNear;
      p.mat.uniforms.fogFar.value = P.fogFar;
    }
    hemi.color.setHex(P.hemiSky);
    hemi.groundColor.setHex(P.hemiGround);
    hemi.intensity = P.hemiI;
    sun.color.setHex(P.sun);
    sun.intensity = P.sunI;
    renderer.toneMappingExposure = P.exposure;
    clearFx();
    return env;
  }

  /* ------------------------------------------------------------ tank views */
  const views = new Map(); // sim tank id → view
  let viewSim = null;

  function makeView(look, opts = {}) {
    const d = design(look);
    const S = d.S;
    const root = new THREE.Group();
    root.rotation.order = "YXZ";
    const body = new THREE.Group();
    root.add(body);
    const paint = paintMaterial(vt, opts.paint ?? S.paint, !!S.camo);
    const accent = new THREE.MeshStandardMaterial({ color: S.accent, roughness: 0.6, metalness: 0.2, emissive: S.sensor ? S.accent : 0x000000, emissiveIntensity: S.sensor ? 0.6 : 0 });
    const mats = { ...VM, paint, accent };
    const meshes = [];
    const addGeos = (geos, parent) => {
      for (const [k, g] of Object.entries(geos)) {
        const m = new THREE.Mesh(g, mats[k] || VM.dark);
        m.castShadow = true;
        m.receiveShadow = true;
        m.userData.key = k;
        parent.add(m);
        meshes.push(m);
      }
    };
    addGeos(d.hull, body);
    let turret = null;
    let gun = null;
    let recoil = null;
    let antenna = null;
    const turretMeshes = [];
    if (d.turret) {
      turret = new THREE.Group();
      turret.position.set(...d.turretPos);
      body.add(turret);
      const before = meshes.length;
      addGeos(d.turret, turret);
      turretMeshes.push(...meshes.slice(before));
      gun = new THREE.Group();
      gun.position.set(...d.trunnion);
      turret.add(gun);
      recoil = new THREE.Group();
      gun.add(recoil);
      addGeos(d.gun, recoil);
      // antenna whip (bends with acceleration)
      const ag = cylGeo(0.012, 0.025, d.antennaLen, 4);
      ag.translate(0, d.antennaLen / 2, 0);
      antenna = new THREE.Mesh(ag, VM.dark);
      antenna.position.set(...d.antenna);
      turret.add(antenna);
    }
    let tracks = [];
    if (d.track) {
      for (const sx of [-1, 1]) {
        const tmat = new THREE.MeshStandardMaterial({ map: vt.tread.clone(), roughness: 0.85, metalness: 0.35 });
        tmat.map.needsUpdate = true;
        tmat.map.repeat.set(1, 1);
        const m = new THREE.Mesh(d.track, tmat);
        m.position.set(sx * d.trackX, 0.03, 0);
        m.castShadow = true;
        body.add(m);
        tracks.push({ m, mat: tmat, side: sx });
      }
    }
    if (opts.scale && opts.scale !== 1) root.scale.setScalar(opts.scale);
    return {
      d, root, body, turret, gun, recoil, antenna, tracks, meshes, turretMeshes, paint, accent,
      baseColor: new THREE.Color(opts.paint ?? S.paint),
      spin: { L: 0, R: 0 },
      sus: { p: 0, pv: 0, r: 0, rv: 0, y: 0, yv: 0 },
      recoilX: 0, recoilV: 0,
      ant: 0, antV: 0,
      dead: false, burnT: 0, pop: null,
      exhaustT: 0, dustT: 0, smokeT: 0,
      hidden: false,
    };
  }
  function disposeView(v) {
    v.root.removeFromParent();
    v.paint.dispose();
    v.accent.dispose();
    for (const t of v.tracks) {
      t.mat.map.dispose();
      t.mat.dispose();
    }
    if (v.antenna) v.antenna.geometry.dispose();
  }
  function clearViews() {
    for (const v of views.values()) disposeView(v);
    views.clear();
    for (const s of structViews.values()) disposeStruct(s);
    structViews.clear();
  }

  function burnView(v) {
    v.dead = true;
    for (const m of v.meshes) m.material = VM.burnt;
    for (const t of v.tracks) t.m.material = VM.burnt;
    if (v.antenna) v.antenna.visible = false;
    // the turret is blown off: it flies up, spins, lands askew
    if (v.turret) v.pop = { y: 0, vy: 6 + Math.random() * 4, rx: 0, rz: 0, wx: (Math.random() - 0.5) * 3, wz: (Math.random() - 0.5) * 3, landed: false };
  }

  /** Per-frame animation of one tank view from its sim state. */
  function animateView(v, t, dt, sim) {
    const d = v.d;
    v.root.position.set(t.x, t.y, t.z);
    v.root.rotation.set(-t.pitch, t.heading, -t.roll);
    if (!t.alive) {
      if (!v.dead) burnView(v);
      if (v.pop) {
        const P = v.pop;
        if (!P.landed) {
          P.vy -= 18 * dt;
          P.y += P.vy * dt;
          P.rx += P.wx * dt;
          P.rz += P.wz * dt;
          if (P.y < -0.1 && P.vy < 0) {
            P.y = -0.15;
            P.landed = true;
          }
        }
        v.turret.position.y = d.turretPos[1] + Math.max(-0.15, P.y);
        v.turret.rotation.x = P.rx * 0.25;
        v.turret.rotation.z = P.rz * 0.25;
      }
      // burning wreck
      v.burnT += dt;
      v.smokeT -= dt;
      if (v.smokeT <= 0 && t.deadT < 40) {
        v.smokeT = t.deadT < 18 ? 0.09 : 0.3;
        const k = t.deadT < 18 ? 1 : 0.5;
        smoke.spawn(t.x + (Math.random() - 0.5), t.y + 2.2, t.z + (Math.random() - 0.5), (Math.random() - 0.5) * 0.6, 2.4 + Math.random(), (Math.random() - 0.5) * 0.6, 4 + Math.random() * 3, 1.6 * k, 6 * k, 0.12, 0.11, 0.1, 0.65 * k, { drag: 0.2, r1: 0.3, g1: 0.29, b1: 0.28 });
        if (t.deadT < 14) fire.spawn(t.x + (Math.random() - 0.5) * 1.5, t.y + 1.6, t.z + (Math.random() - 0.5) * 1.5, 0, 2.2, 0, 0.6 + Math.random() * 0.4, 1.4, 0.4, 1, 0.55, 0.2, 0.9, { r1: 0.8, g1: 0.2, b1: 0.05 });
      }
      writeWheels(v, t, 0, dt);
      return;
    }
    // suspension: accelerating squats the rear, braking dives the nose, turning rolls outwards
    const S = v.sus;
    const kSp = 70;
    const kD = 9;
    const shot = (t.shots || 0) !== (v.lastShots ?? (t.shots || 0));
    v.lastShots = t.shots || 0;
    if (shot) {
      // firing rocks the hull back against the gun direction and kicks the barrel
      const kick = 0.9 * (t.L.barrel / 4.6);
      S.pv -= kick * Math.cos(t.tLocal);
      S.rv += kick * 0.6 * Math.sin(t.tLocal);
      v.recoilV = -9 * (t.L.barrel / 4.6);
    }
    const pitchF = -t.accel * 0.0045;
    const rollF = t.angVel * t.speed * 0.0025;
    S.pv += (-kSp * S.p - kD * S.pv) * dt;
    S.p += S.pv * dt;
    S.rv += (-kSp * S.r - kD * S.rv) * dt;
    S.r += S.rv * dt;
    const targetP = pitchF * 2;
    const targetR = rollF;
    S.p += (targetP - S.p) * Math.min(1, dt * 3);
    S.r += (targetR - S.r) * Math.min(1, dt * 3);
    // engine vibration
    const sp = Math.abs(t.speed);
    const vib = 0.006 + Math.min(1, sp / 10) * 0.012;
    const tt = sim ? sim.t : performance.now() / 1000;
    v.body.position.y = Math.sin(tt * 47 + t.id) * vib + Math.sin(tt * 13.7) * vib * 0.5;
    v.body.rotation.x = S.p + Math.sin(tt * 31 + t.id) * vib * 0.15;
    v.body.rotation.z = -S.r;
    // turret yaw + gun elevation relative to the hull
    if (v.turret) {
      v.turret.rotation.y = t.tLocal;
      const along = t.pitch * Math.cos(t.tLocal) - t.roll * Math.sin(t.tLocal);
      v.gun.rotation.x = -(t.elev - along);
      // recoil slide + return
      v.recoilV += (-140 * v.recoilX - 16 * v.recoilV) * dt;
      v.recoilX += v.recoilV * dt;
      v.recoilX = Math.max(-0.65, Math.min(0.02, v.recoilX));
      v.recoil.position.z = v.recoilX;
      // antenna whip
      v.antV += (-60 * v.ant - 3 * v.antV + t.accel * 0.4) * dt;
      v.ant += v.antV * dt;
      v.antenna.rotation.x = v.ant * 0.05 + S.p;
      v.antenna.rotation.z = Math.sin(tt * 2.1 + t.id) * 0.02;
    }
    // tracks scroll (u = arc length × 2)
    for (const tr of v.tracks) {
      const dist = tr.side > 0 ? t.trackL : t.trackR;
      tr.mat.map.offset.x = -dist * 2;
    }
    // damage tint
    const hpF = Math.max(0, t.hp / t.maxHp);
    const dk = (1 - hpF) * 0.5;
    v.paint.color.copy(v.baseColor).multiplyScalar(1 - dk);
    if (t.hitT < 0.08) v.paint.emissive.setRGB(0.22, 0.08, 0.03);
    else v.paint.emissive.setRGB(0, 0, 0);
    writeWheels(v, t, sp, dt);
    // exhaust, dust, damage smoke
    const m = v.root.matrixWorld;
    v.root.updateMatrixWorld();
    v.exhaustT -= dt;
    if (v.exhaustT <= 0 && d.exhausts.length) {
      const busy = Math.min(1, Math.abs(t.accel) / 4 + sp / 12);
      v.exhaustT = 0.12 - busy * 0.06;
      for (const e of d.exhausts) {
        tv.set(...e).applyMatrix4(m);
        const back = tv2.set(0, 0.6, -1).transformDirection(m);
        smoke.spawn(tv.x, tv.y, tv.z, back.x * 2, back.y * 2 + 0.6, back.z * 2, 1.2 + busy, 0.35, 1.5 + busy, 0.16, 0.15, 0.14, 0.32 + busy * 0.25, { drag: 1.2, r1: 0.4, g1: 0.39, b1: 0.37 });
      }
    }
    if (sp > 2.2) {
      v.dustT -= dt;
      if (v.dustT <= 0) {
        const world = sim?.world || "desert";
        const dusty = world === "desert" ? 1 : world === "forest" ? 0.45 : 0.55;
        v.dustT = 0.06 / dusty;
        const col = world === "desert" ? [0.78, 0.66, 0.48] : world === "forest" ? [0.42, 0.37, 0.28] : [0.55, 0.53, 0.5];
        for (const sx of [-1, 1]) {
          tv.set(sx * t.L.hx * 0.9, 0.2, -t.L.hz * Math.sign(t.speed || 1) * 0.9).applyMatrix4(m);
          smoke.spawn(tv.x, tv.y, tv.z, (Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5, 1.4 + Math.random() * 1.2 * dusty, 0.8, 3 + sp * 0.18 * dusty, col[0], col[1], col[2], 0.28 * dusty + 0.08, { drag: 1.4, fadeIn: 0.15 });
        }
      }
    }
    if (hpF < 0.5) {
      v.smokeT -= dt;
      if (v.smokeT <= 0) {
        v.smokeT = hpF < 0.25 ? 0.07 : 0.16;
        tv.set((Math.random() - 0.5) * t.L.hx, t.L.top + 0.2, -t.L.hz * 0.5).applyMatrix4(m);
        const dark = hpF < 0.25 ? 0.08 : 0.32;
        smoke.spawn(tv.x, tv.y, tv.z, (Math.random() - 0.5) * 0.4, 1.8, (Math.random() - 0.5) * 0.4, 2.2, 0.6, 2.6, dark, dark, dark, 0.5, { drag: 0.5 });
        if (hpF < 0.25 && Math.random() < 0.5) fire.spawn(tv.x, tv.y, tv.z, 0, 1.4, 0, 0.4, 0.8, 0.3, 1, 0.5, 0.18, 0.8);
      }
    }
  }

  // global instanced wheels: written every frame for every view
  const wheelCount = { road: 0, sprocket: 0, tyre: 0 };
  function writeWheels(v, t, sp, dt) {
    const d = v.d;
    if (!d.wheels.length) return;
    v.root.updateMatrixWorld();
    const base = v.body.matrixWorld;
    for (const w of d.wheels) {
      const dist = w.side > 0 ? t.trackL : t.trackR;
      const ang = dist / w.r;
      const im = wheelIMs[w.kind];
      const idx = wheelCount[w.kind]++;
      if (idx >= MAXW) continue;
      // left wheels are turned around so the hub faces outward
      te.set(w.side > 0 ? ang : -ang, w.side > 0 ? 0 : Math.PI, 0, "YXZ");
      tq.setFromEuler(te);
      tm.compose(tv.set(w.x, w.y, w.z), tq, ts.set(w.w, w.r, w.r));
      tm.premultiply(base);
      im.setMatrixAt(idx, tm);
    }
  }

  /* ------------------------------------------------------------ structures */
  const structViews = new Map();
  function buildStruct(s) {
    const P = new Parts();
    const b = 0;
    switch (s.kind) {
      case "depot":
        for (const dx of [-1.6, 1.6]) {
          P.add("tank", cylGeo(1.2, 1.2, 6, 14), dx, b + 1.3, 0, Math.PI / 2, 0, 0);
          P.add("dark", boxGeo(0.4, 1.0, 0.4), dx, b + 0.4, -2, 0, 0, 0);
          P.add("dark", boxGeo(0.4, 1.0, 0.4), dx, b + 0.4, 2, 0, 0, 0);
        }
        P.add("dark", cylGeo(0.12, 0.12, 4, 6), 0, b + 2.6, 0, 0, 0, Math.PI / 2);
        P.add("warn", boxGeo(3.6, 0.3, 0.05), 0, b + 2.4, 3.05);
        break;
      case "bunker":
        P.add("concrete", boxGeo(s.hx * 2, 3, s.hz * 2), 0, b + 1.5, 0);
        P.add("dark", boxGeo(s.hx * 1.3, 0.4, 0.1), 0, b + 2.1, s.hz + 0.01);
        break;
      case "aa":
        P.add("concrete", cylGeo(2.4, 2.6, 0.8, 14), 0, b + 0.4, 0);
        P.add("dark", boxGeo(1.6, 1.0, 1.8), 0, b + 1.3, 0);
        for (const sx of [-0.35, 0.35]) P.add("metal", cylGeo(0.09, 0.11, 3.2, 8), sx, b + 2.2, 1.2, -0.9, 0, 0);
        P.add("warn", boxGeo(1.62, 0.15, 1.82), 0, b + 1.85, 0);
        break;
      case "comms":
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.add("metal", boxGeo(0.14, 14, 0.14), sx * 1.1, b + 7, sz * 1.1, sz * 0.03, 0, -sx * 0.03);
        for (let y = 1.5; y < 14; y += 2.2) {
          P.add("metal", boxGeo(2.2, 0.08, 0.08), 0, b + y, 1.1);
          P.add("metal", boxGeo(2.2, 0.08, 0.08), 0, b + y, -1.1);
          P.add("metal", boxGeo(0.08, 0.08, 2.2), 1.1, b + y, 0);
          P.add("metal", boxGeo(0.08, 0.08, 2.2), -1.1, b + y, 0);
        }
        P.add("dark", new THREE.CylinderGeometry(1.0, 0.3, 0.4, 14), 0.9, b + 12, 0.9, 0.6, 0.7, 0);
        P.add("warn", boxGeo(0.4, 0.6, 0.4), 0, b + 14.2, 0);
        P.add("concrete", boxGeo(3, 2.2, 3), 2.4, b + 1.1, -2.4);
        break;
      case "checkpoint":
        P.add("concrete", boxGeo(s.hx * 2, 2.2, s.hz * 2), 0, b + 1.1, 0);
        for (let k = -2; k <= 2; k++) P.add(k % 2 ? "warn" : "white", boxGeo(1.9, 0.5, 0.05), k * 1.95, b + 1.6, s.hz + 0.02);
        P.add("metal", boxGeo(0.3, 3.4, 0.3), s.hx - 0.4, b + 1.7, 0);
        break;
      case "hq":
        P.add("concrete", boxGeo(s.hx * 2, 5.5, s.hz * 2), 0, b + 2.75, 0);
        P.add("dark", boxGeo(s.hx * 2 + 0.4, 0.4, s.hz * 2 + 0.4), 0, b + 5.7, 0);
        P.add("ally", boxGeo(s.hx * 1.2, 0.8, 0.05), 0, b + 4.4, s.hz + 0.02);
        P.add("metal", cylGeo(0.06, 0.06, 7, 6), s.hx - 1, b + 9.4, -s.hz + 1);
        P.add("ally", boxGeo(1.6, 1.0, 0.04), s.hx - 0.2, b + 12.2, -s.hz + 1);
        for (let k = -3; k <= 3; k++) P.add("sandbag", new THREE.SphereGeometry(0.6, 8, 5), k * 1.6, b + 0.35, s.hz + 1.4, 0, 0, 0, 1, 0.5, 0.7);
        break;
      default:
        P.add("concrete", boxGeo(s.hx * 2, 2, s.hz * 2), 0, b + 1, 0);
    }
    const geos = P.build();
    const grp = new THREE.Group();
    const mats = {
      concrete: EM.concrete,
      dark: VM.dark,
      metal: VM.metal,
      sandbag: EM.sandbag,
      tank: new THREE.MeshStandardMaterial({ color: 0x9d9a90, roughness: 0.5, metalness: 0.5, map: vt.grime }),
      warn: new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.7 }),
      white: new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.7 }),
      ally: new THREE.MeshStandardMaterial({ color: 0x2e5fa8, roughness: 0.7, emissive: 0x0a1e40 }),
    };
    const own = [mats.tank, mats.warn, mats.white, mats.ally];
    for (const [k, g] of Object.entries(geos)) {
      const m = new THREE.Mesh(g, mats[k]);
      m.castShadow = m.receiveShadow = true;
      grp.add(m);
    }
    grp.position.set(s.x, s.base - 0.05, s.z);
    grp.rotation.y = s.a || 0;
    scene.add(grp);
    return { grp, geos, own, dead: false, kind: s.kind, smokeT: 0 };
  }
  function disposeStruct(v) {
    v.grp.removeFromParent();
    for (const g of Object.values(v.geos)) g.dispose();
    for (const m of v.own) m.dispose();
  }

  /* ------------------------------------------------------------ effects from sim.fx */
  const groundAt = (x, z) => (viewSim ? viewSim.map.groundAt(x, z) : env ? env.map.groundAt(x, z) : 0);
  const normalOut = { x: 0, y: 1, z: 0 };
  let shake = 0;
  function playerDist(x, y, z) {
    return camera.position.distanceTo(tv.set(x, y, z));
  }
  function spawnFx(f, sim) {
    const R = Math.random;
    const s = f.s || 1;
    switch (f.type) {
      case "muzzle": {
        const dx = f.dx;
        const dy = f.dy;
        const dz = f.dz;
        fire.spawn(f.x + dx * 0.6, f.y + dy * 0.6, f.z + dz * 0.6, dx * 4, dy * 4, dz * 4, 0.09, 2.4 * s, 3.2 * s, 1, 0.85, 0.5, 1, { r1: 1, g1: 0.5, b1: 0.15 });
        fire.spawn(f.x, f.y, f.z, 0, 0, 0, 0.06, 4.2 * s, 2 * s, 1, 0.75, 0.4, 0.8);
        for (let k = 0; k < 4; k++) fire.spawn(f.x, f.y, f.z, dx * 14 + (R() - 0.5) * 6, dy * 14 + (R() - 0.5) * 6, dz * 14 + (R() - 0.5) * 6, 0.1, 1.2 * s, 0.6, 1, 0.65, 0.3, 0.9);
        for (let k = 0; k < 10; k++) {
          const sp = 3 + R() * 9;
          smoke.spawn(f.x + dx, f.y + dy, f.z + dz, dx * sp + (R() - 0.5) * 3, dy * sp + R() * 1.5, dz * sp + (R() - 0.5) * 3, 1.6 + R() * 1.6, 0.8 * s, 3.4 * s, 0.72, 0.7, 0.66, 0.42, { drag: 2.2 });
        }
        // blast dust kicked up under the muzzle
        const g = groundAt(f.x, f.z);
        if (f.y - g < 3.2) for (let k = 0; k < 6; k++) smoke.spawn(f.x + (R() - 0.5) * 2, g + 0.3, f.z + (R() - 0.5) * 2, (R() - 0.5) * 6, 0.8, (R() - 0.5) * 6, 1.2, 1, 3.5, 0.7, 0.62, 0.5, 0.3, { drag: 2 });
        flashes.fire(f.x + dx * 1.5, f.y + dy * 1.5, f.z + dz * 1.5, 40 * s, 0.09, 0xffc070, 26);
        const pd = playerDist(f.x, f.y, f.z);
        shake = Math.max(shake, pd < 12 ? 0.5 : Math.max(0, 0.25 - pd / 300));
        break;
      }
      case "explosion":
      case "bigExplosion":
      case "tankDestroyed": {
        const big = f.type !== "explosion";
        const k = s * (big ? 1.6 : 1);
        for (let i = 0; i < (big ? 16 : 9); i++) {
          const a = R() * 6.28;
          const sp = (2 + R() * 6) * k;
          fire.spawn(f.x, f.y + 0.5, f.z, Math.cos(a) * sp, 2 + R() * 6 * k, Math.sin(a) * sp, 0.35 + R() * 0.35, 1.8 * k, 4 * k, 1, 0.75, 0.35, 1, { r1: 0.9, g1: 0.25, b1: 0.06, drag: 3 });
        }
        fire.spawn(f.x, f.y + 1, f.z, 0, 1, 0, 0.18, 6 * k, 9 * k, 1, 0.9, 0.6, 1);
        for (let i = 0; i < (big ? 24 : 12); i++) {
          const a = R() * 6.28;
          const sp = (1 + R() * 5) * k;
          const dark = 0.12 + R() * 0.12;
          smoke.spawn(f.x, f.y + 0.6, f.z, Math.cos(a) * sp, 1.5 + R() * 4 * k, Math.sin(a) * sp, 2.5 + R() * 3, 2 * k, 7 * k, dark, dark * 0.95, dark * 0.9, 0.8, { drag: 1.6, r1: 0.42, g1: 0.4, b1: 0.38 });
        }
        for (let i = 0; i < (big ? 18 : 10); i++) {
          const a = R() * 6.28;
          const up = R();
          fire.spawn(f.x, f.y + 0.5, f.z, Math.cos(a) * 18 * (1 - up * 0.5), 4 + up * 16, Math.sin(a) * 18 * (1 - up * 0.5), 0.6 + R() * 0.6, 0.35, 0.15, 1, 0.7, 0.3, 1, { grav: -14, drag: 0.4 });
        }
        if (big) debris.spawn(f.x, f.y + 1, f.z, f.type === "tankDestroyed" ? 14 : 10, 0x2a2724, 1.2, 10);
        const g = groundAt(f.x, f.z);
        if (f.y - g < 3) {
          sim?.map.normalAt(f.x, f.z, normalOut);
          decals.add(f.x, g, f.z, (big ? 3.2 : 2.2) * s, normalOut);
          for (let i = 0; i < 8; i++) {
            const a = R() * 6.28;
            smoke.spawn(f.x, g + 0.3, f.z, Math.cos(a) * 9, 0.5, Math.sin(a) * 9, 1.5, 1.4, 4.5 * k, 0.6, 0.55, 0.47, 0.4, { drag: 2.5 });
          }
        }
        flashes.fire(f.x, f.y + 1.5, f.z, big ? 160 : 70, big ? 0.5 : 0.25, 0xff9040, big ? 60 : 36);
        const pd = playerDist(f.x, f.y, f.z);
        shake = Math.max(shake, Math.max(0, (big ? 1.1 : 0.6) - pd / (big ? 120 : 70)));
        break;
      }
      case "hitMetal":
      case "sparks": {
        for (let i = 0; i < 14; i++) {
          const a = R() * 6.28;
          const sp = 6 + R() * 12;
          fire.spawn(f.x, f.y, f.z, (f.dirx || 0) * sp * 0.6 + Math.cos(a) * sp * 0.6, (f.diry || 0) * sp * 0.4 + R() * 7, (f.dirz || 0) * sp * 0.6 + Math.sin(a) * sp * 0.6, 0.25 + R() * 0.35, 0.22, 0.08, 1, 0.8, 0.45, 1, { grav: -16, drag: 0.6 });
        }
        fire.spawn(f.x, f.y, f.z, 0, 0, 0, 0.08, 2.2, 1.2, 1, 0.8, 0.5, 1);
        for (let i = 0; i < 5; i++) smoke.spawn(f.x, f.y, f.z, (R() - 0.5) * 2, 1 + R(), (R() - 0.5) * 2, 1.2, 0.5, 2, 0.35, 0.34, 0.32, 0.5);
        flashes.fire(f.x, f.y, f.z, 18, 0.08, 0xffd090, 14);
        break;
      }
      case "hitDirt":
      case "hitStone":
      case "hitWood":
      case "dust": {
        const desert = sim?.world === "desert";
        const col = f.type === "hitStone" ? [0.62, 0.6, 0.56] : f.type === "hitWood" ? [0.5, 0.38, 0.24] : desert ? [0.8, 0.68, 0.5] : sim?.world === "forest" ? [0.4, 0.33, 0.24] : [0.55, 0.52, 0.48];
        const n = f.type === "dust" ? 4 : 12;
        for (let i = 0; i < n; i++) {
          const a = R() * 6.28;
          const sp = (1 + R() * 4) * s;
          smoke.spawn(f.x, f.y + 0.2, f.z, Math.cos(a) * sp + (f.dirx || 0) * 2, 2 + R() * 5 * s, Math.sin(a) * sp + (f.dirz || 0) * 2, 1.2 + R() * 1.4, 0.8 * s, 3.6 * s, col[0], col[1], col[2], 0.55, { drag: 1.8, grav: -2 });
        }
        if (f.type !== "dust") {
          debris.spawn(f.x, f.y + 0.2, f.z, 5, f.type === "hitStone" ? 0x8a867e : f.type === "hitWood" ? 0x6b4c2c : desert ? 0xb79a6c : 0x5d4c38, 0.35, 7);
          fire.spawn(f.x, f.y, f.z, 0, 0, 0, 0.07, 1.6, 0.8, 1, 0.75, 0.4, 0.7);
        }
        break;
      }
      case "splash":
        for (let i = 0; i < 22; i++) {
          const a = R() * 6.28;
          const sp = R() * 3;
          smoke.spawn(f.x, f.y + 0.1, f.z, Math.cos(a) * sp, 5 + R() * 9 * s, Math.sin(a) * sp, 1 + R() * 0.8, 0.6, 2.4, 0.86, 0.92, 0.94, 0.75, { grav: -14, drag: 0.6 });
        }
        break;
      case "smokePop":
        for (let i = 0; i < 20; i++) {
          const a = R() * 6.28;
          smoke.spawn(f.x, f.y, f.z, Math.cos(a) * 6, 1 + R() * 3, Math.sin(a) * 6, 1.5, 1.5, 5, 0.85, 0.85, 0.82, 0.7, { drag: 2.2 });
        }
        break;
      case "debris":
        debris.spawn(f.x, f.y, f.z, f.n * 2, f.color, f.kind === "tower" ? 1 : 0.6, f.kind === "tower" ? 6 : 7);
        for (let i = 0; i < 8; i++) smoke.spawn(f.x, f.y, f.z, (R() - 0.5) * 4, 1 + R() * 2, (R() - 0.5) * 4, 1.4, 1, 3.5, 0.55, 0.5, 0.42, 0.45, { drag: 1.6 });
        break;
      default:
    }
  }

  // smoke screens: keep a cloud of persistent puffs alive for each sim smoke
  const smokeSeen = new Map();
  function feedSmoke(sim, dt) {
    for (const c of sim.smokes) {
      let st = smokeSeen.get(c.id);
      if (!st) {
        st = { t: 0 };
        smokeSeen.set(c.id, st);
      }
      st.t -= dt;
      if (st.t <= 0 && c.life > 1.2) {
        st.t = 0.035;
        // a dense, slowly churning wall of white smoke filling the cloud volume
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * 6.28;
          const r = Math.sqrt(Math.random()) * c.r * 0.85;
          const life = Math.min(c.life, 3.5 + Math.random() * 2.5);
          const v = 0.8 + Math.random() * 0.12;
          smoke.spawn(c.x + Math.cos(a) * r, c.y - 2 + Math.random() * c.r * 0.7, c.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.8, 0.2, (Math.random() - 0.5) * 0.8, life, c.r * 0.9, c.r * 1.5, v, v, v * 0.98, 0.85, { drag: 0.4, fadeIn: 0.2 });
        }
      }
    }
    if (smokeSeen.size > 40) smokeSeen.clear();
  }

  function clearFx() {
    smoke.clear();
    fire.clear();
    debris.clear();
    decals.clear();
    tracers.set([]);
    smokeSeen.clear();
  }

  /* ------------------------------------------------------------ camera rig */
  const cam = { pos: V(), fov: 60, inited: false, mode: "chase", look: V(), dir: V(0, 0, 1) };
  const shakeOff = V();
  /**
   * c: { mode, yaw, pitch, zoom } — yaw uses the sim heading convention
   * (forward = (sin yaw, cos yaw)).
   */
  function updateCamera(sim, c, dt) {
    const p = sim.player;
    const s = p.scale;
    const dir = cam.dir.set(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
    let want;
    let fov;
    let follow;
    if (c.mode === "gunner") {
      const yaw = p.heading + p.tLocal;
      const px = p.x + Math.sin(p.heading) * p.L.tz * s;
      const pz = p.z + Math.cos(p.heading) * p.L.tz * s;
      // sight sits on the turret roof, slightly to the right of the gun
      want = tv.set(px - Math.cos(yaw) * 0.35 * s, p.y + (p.L.ty + p.L.th * 0.6 + 0.45) * s, pz + Math.sin(yaw) * 0.35 * s);
      fov = c.zoom ? 14 : 48;
      follow = 1;
    } else if (c.mode === "cinematic") {
      const fx = Math.sin(c.yaw);
      const fz = Math.cos(c.yaw);
      want = tv.set(p.x - fx * 26 * s, p.y + 18 * s, p.z - fz * 26 * s);
      fov = c.zoom ? 28 : 50;
      follow = 1 - Math.exp(-dt * 3.5);
    } else {
      const dist = (c.zoom ? 7.5 : 12.5) * s;
      const pivot = tv2.set(p.x, p.y + (c.zoom ? 3.0 : 2.7) * s, p.z);
      want = tv.copy(pivot).addScaledVector(dir, -dist);
      want.y += 1.1 * s;
      // collision: pull the camera in front of anything between it and the tank
      const hit = sim.segCast(pivot.x, pivot.y, pivot.z, want.x, want.y, want.z, { tanks: false });
      if (hit) want.set(pivot.x + (want.x - pivot.x) * hit.t * 0.88, pivot.y + (want.y - pivot.y) * hit.t * 0.88, pivot.z + (want.z - pivot.z) * hit.t * 0.88);
      fov = c.zoom ? 30 : 60;
      follow = 1 - Math.exp(-dt * 16);
    }
    const g = sim.map.groundAt(want.x, want.z) + 0.7;
    if (want.y < g) want.y = g;
    if (!cam.inited || cam.mode !== c.mode) {
      if (!cam.inited) cam.pos.copy(want);
      cam.inited = true;
      cam.mode = c.mode;
      cam.blend = 0.35;
    }
    if (cam.blend > 0) {
      // smooth transition between camera modes
      cam.blend = Math.max(0, cam.blend - dt);
      cam.pos.lerp(want, 1 - Math.exp(-dt * 9));
    } else if (follow >= 1) cam.pos.copy(want);
    else cam.pos.lerp(want, follow);
    cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 10));
    camera.position.copy(cam.pos);
    if (c.mode === "cinematic") {
      const fx = Math.sin(c.yaw);
      const fz = Math.cos(c.yaw);
      const ahead = 22 + c.pitch * 70;
      cam.look.set(p.x + fx * ahead, p.y + 1, p.z + fz * ahead);
      camera.lookAt(cam.look);
    } else camera.lookAt(tv.copy(cam.pos).add(dir));
    // shake
    if (c.shake !== false && shake > 0.001) {
      shakeOff.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      camera.position.addScaledVector(shakeOff, 0.25);
      camera.rotation.z += (Math.random() - 0.5) * shake * 0.01;
    }
    shake = Math.max(0, shake - dt * 2.2);
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  function resetCamera() {
    cam.inited = false;
  }
  /** Screen-centre ray → world point (ignoring the player's own tank). */
  const rayDir = V();
  function aimPoint(sim) {
    camera.getWorldDirection(rayDir);
    const o = camera.position;
    const h = sim.raycast(o.x, o.y, o.z, rayDir.x, rayDir.y, rayDir.z, 650, sim.player);
    if (h) return { x: h.x, y: h.y, z: h.z, dist: h.dist, ref: h.ref, kind: h.kind };
    return { x: o.x + rayDir.x * 650, y: o.y + rayDir.y * 650, z: o.z + rayDir.z * 650, dist: 650, kind: "sky" };
  }
  const projV = V();
  /** World → CSS pixel coords {x, y, behind}. */
  function project(x, y, z) {
    projV.set(x, y, z).project(camera);
    return { x: (projV.x * 0.5 + 0.5) * size.w, y: (-projV.y * 0.5 + 0.5) * size.h, behind: projV.z > 1 };
  }

  /* ------------------------------------------------------------ main render */
  let lastAlive = null;
  function syncSim(sim) {
    if (viewSim !== sim) {
      clearViews();
      clearFx();
      viewSim = sim;
      useWorld(sim.world);
      // restore destructibles for the new run
      for (const o of sim.map.obstacles) if (o.destruct) env.setAlive(o.i, true);
      lastAlive = new Uint8Array(sim.obAlive);
      resetCamera();
    }
    // destructibles changed?
    for (let i = 0; i < sim.obAlive.length; i++) {
      if (sim.obAlive[i] !== lastAlive[i]) {
        env.setAlive(i, !!sim.obAlive[i]);
        lastAlive[i] = sim.obAlive[i];
        if (!sim.obAlive[i] && sim.map.obstacles[i].destruct === "barrel") {
          const o = sim.map.obstacles[i];
          sim.map.normalAt(o.x, o.z, normalOut);
          decals.add(o.x, o.base, o.z, 2.6, normalOut);
        }
      }
    }
  }

  function render(sim, dt, opts = {}) {
    syncSim(sim);
    if (menuView) menuView.root.visible = false;
    for (const k of Object.keys(wheelCount)) wheelCount[k] = 0;
    // tanks
    const seen = new Set();
    for (const t of sim.tanks) {
      if (t.escaped) continue;
      seen.add(t.id);
      let v = views.get(t.id);
      if (!v) {
        v = makeView(t.look, { scale: t.scale });
        scene.add(v.root);
        views.set(t.id, v);
      }
      animateView(v, t, dt, sim);
      const hideTurret = t === sim.player && opts.cam?.mode === "gunner";
      for (const m of v.turretMeshes) m.visible = !hideTurret;
      if (v.antenna) v.antenna.visible = !hideTurret && !v.dead;
    }
    for (const [id, v] of views) if (!seen.has(id)) {
      disposeView(v);
      views.delete(id);
    }
    for (const k of Object.keys(wheelIMs)) {
      wheelIMs[k].count = Math.min(MAXW, wheelCount[k]);
      wheelIMs[k].instanceMatrix.needsUpdate = true;
    }
    // structures
    for (const s of sim.structs) {
      let v = structViews.get(s.id);
      if (!v) {
        v = buildStruct(s);
        structViews.set(s.id, v);
      }
      if (!s.alive && !v.dead) {
        v.dead = true;
        v.grp.traverse((o) => {
          if (o.isMesh) o.material = VM.burnt;
        });
        v.grp.scale.y = 0.45;
        v.grp.rotation.z = 0.08;
      }
      if (v.dead) {
        v.smokeT -= dt;
        if (v.smokeT <= 0) {
          v.smokeT = 0.15;
          smoke.spawn(s.x + (Math.random() - 0.5) * 2, s.base + 2, s.z + (Math.random() - 0.5) * 2, 0, 2.2, 0, 4, 1.5, 6, 0.12, 0.11, 0.1, 0.55, { drag: 0.2 });
          if (Math.random() < 0.5) fire.spawn(s.x + (Math.random() - 0.5) * 3, s.base + 1, s.z + (Math.random() - 0.5) * 3, 0, 2, 0, 0.6, 1.6, 0.5, 1, 0.5, 0.15, 0.85);
        }
      } else if (s.hitT !== undefined) s.hitT += dt;
    }
    // effects
    for (const f of sim.fx) spawnFx(f, sim);
    sim.fx.length = 0;
    feedSmoke(sim, dt);
    // shells → tracers (+ HE smoke trail)
    const tl = [];
    for (const s of sim.shells) {
      const sp = Math.hypot(s.vx, s.vy, s.vz) || 1;
      const len = Math.min(sp * 0.035, 9);
      const A = AMMO[s.ammo];
      const col = new THREE.Color(A.color);
      tl.push({ a: [s.x - (s.vx / sp) * len, s.y - (s.vy / sp) * len, s.z - (s.vz / sp) * len], b: [s.x, s.y, s.z], c: [col.r * 3, col.g * 2.6, col.b * 2.2, 1], w: s.ammo === "ap" ? 0.22 : 0.32 });
      if (s.ammo !== "ap" && Math.random() < 0.7) smoke.spawn(s.x, s.y, s.z, 0, 0.3, 0, 0.9, 0.35, 1.2, 0.7, 0.68, 0.65, 0.35);
    }
    tracers.set(tl);
    ambient(sim, dt);
    const ground = (x, z) => sim.map.groundAt(x, z);
    debris.update(dt, ground);
    smoke.update(dt);
    fire.update(dt);
    flashes.update(dt);
    if (env.water) env.water.material.normalMap.offset.set(sim.t * 0.01, sim.t * 0.006);
    // sun + shadow camera follow the player
    const p = sim.player;
    const sd = PALETTE[sim.world].sunDir;
    sun.position.set(p.x + sd[0] * 160, p.y + sd[1] * 160, p.z + sd[2] * 160);
    sun.target.position.set(p.x, p.y, p.z);
    sun.target.updateMatrixWorld();
    env.sky.position.copy(camera.position);
    renderer.render(scene, camera);
  }

  // ambient atmosphere: drifting dust (desert), mist (forest), smoke columns (city)
  let ambT = 0;
  function ambient(sim, dt) {
    ambT -= dt;
    if (ambT > 0) return;
    ambT = 0.12;
    const c = camera.position;
    const R = Math.random;
    if (sim.world === "desert") {
      const x = c.x + (R() - 0.5) * 120;
      const z = c.z + (R() - 0.5) * 120;
      smoke.spawn(x, sim.map.groundAt(x, z) + 0.5, z, 3 + R() * 2, 0.2, 1 + R(), 5, 2, 7, 0.86, 0.75, 0.58, 0.12, { drag: 0, fadeIn: 0.3 });
    } else if (sim.world === "forest") {
      const x = c.x + (R() - 0.5) * 140;
      const z = c.z + (R() - 0.5) * 140;
      smoke.spawn(x, sim.map.groundAt(x, z) + 1 + R() * 2, z, 0.6, 0, 0.3, 7, 6, 12, 0.8, 0.84, 0.82, 0.08, { drag: 0, fadeIn: 0.4 });
    } else {
      for (const e of env.extra) {
        if (e.type !== "stack") continue;
        smoke.spawn(e.x, e.y, e.z, 0.8, 2.5, 0.3, 9, 2, 9, 0.2, 0.19, 0.18, 0.45, { drag: 0.1 });
      }
      const x = c.x + (R() - 0.5) * 100;
      const z = c.z + (R() - 0.5) * 100;
      if (R() < 0.4) fire.spawn(x, sim.map.groundAt(x, z) + 2 + R() * 6, z, 0.4, 1.2, 0.2, 3, 0.12, 0.08, 1, 0.5, 0.2, 0.7, { drag: 0 });
    }
  }

  /* ------------------------------------------------------------ menu backdrop */
  // a parked tank on the battlefield with an orbiting camera
  let menuView = null;
  let menuLook = null;
  const menuState = { t: 0, world: null };
  function renderMenu(dt, { world = "desert", look = "fox", focus = null } = {}) {
    if (viewSim) {
      clearViews();
      viewSim = null;
    }
    useWorld(world);
    menuState.t += dt;
    const map = env.map;
    const [fx, fz] = focus || map.sites.start || [0, -160];
    if (!menuView || menuLook !== look || menuState.world !== world) {
      if (menuView) disposeView(menuView);
      menuView = makeView(look);
      menuLook = look;
      menuState.world = world;
      scene.add(menuView.root);
    }
    menuView.root.visible = true;
    const t = { x: fx, z: fz, y: map.groundAt(fx, fz), heading: 0.6, pitch: 0, roll: 0, tLocal: -0.5 + Math.sin(menuState.t * 0.3) * 0.4, elev: 0.04, alive: true, hp: 1, maxHp: 1, accel: 0, angVel: 0, speed: 0, fireT: 9, hitT: 9, trackL: 0, trackR: 0, L: menuView.d.L, id: 1, reload: 0, deadT: 0 };
    for (const k of Object.keys(wheelCount)) wheelCount[k] = 0;
    animateView(menuView, t, dt, null);
    for (const k of Object.keys(wheelIMs)) {
      wheelIMs[k].count = wheelCount[k];
      wheelIMs[k].instanceMatrix.needsUpdate = true;
    }
    const a = menuState.t * 0.07 + 2.2;
    const r = 13;
    camera.position.set(fx + Math.sin(a) * r, t.y + 3.4 + Math.sin(menuState.t * 0.2) * 0.6, fz + Math.cos(a) * r);
    camera.lookAt(fx, t.y + 1.4, fz);
    camera.fov = 50;
    camera.updateProjectionMatrix();
    const g = map.groundAt(camera.position.x, camera.position.z) + 1;
    if (camera.position.y < g) camera.position.y = g;
    const sd = PALETTE[world].sunDir;
    sun.position.set(fx + sd[0] * 160, t.y + sd[1] * 160, fz + sd[2] * 160);
    sun.target.position.set(fx, t.y, fz);
    sun.target.updateMatrixWorld();
    env.sky.position.copy(camera.position);
    ambient({ world, map, t: menuState.t }, dt);
    smoke.update(dt);
    fire.update(dt);
    debris.update(dt, (x, z) => map.groundAt(x, z));
    flashes.update(dt);
    tracers.set([]);
    renderer.render(scene, camera);
  }

  /* ------------------------------------------------------------ garage */
  const garage = buildGarage();
  function buildGarage() {
    const gs = new THREE.Scene();
    gs.background = new THREE.Color(0x15181b);
    gs.fog = new THREE.Fog(0x15181b, 30, 70);
    gs.environment = envTex;
    gs.environmentIntensity = 0.6;
    const P = new Parts();
    P.add("floor", boxGeo(60, 0.2, 60), 0, -0.1, 0);
    P.add("wall", boxGeo(60, 18, 0.4), 0, 9, -22);
    P.add("wall", boxGeo(0.4, 18, 60), -24, 9, 0);
    P.add("wall", boxGeo(0.4, 18, 60), 24, 9, 0);
    for (let x = -22; x <= 22; x += 4) P.add("beam", boxGeo(0.4, 18, 0.6), x, 9, -21.6);
    for (let z = -20; z <= 20; z += 6) {
      P.add("beam", boxGeo(48, 0.6, 0.5), 0, 16, z);
    }
    P.add("plate", cylGeo(5.4, 5.6, 0.25, 48), 0, 0.12, 0);
    P.add("stripe", cylGeo(5.65, 5.65, 0.05, 48), 0, 0.02, 0);
    for (let i = 0; i < 6; i++) P.add("crate", boxGeo(1.5, 1.4, 1.5), -14 + (i % 3) * 1.6, 0.7 + Math.floor(i / 3) * 1.4, -16 + (i % 2) * 0.3);
    for (let i = 0; i < 4; i++) P.add("barrel", cylGeo(0.45, 0.45, 1.25, 12), 13 + (i % 2) * 1.0, 0.62, -15 + Math.floor(i / 2) * 1.0);
    P.add("bench", boxGeo(4, 1, 1.4), 14, 0.5, -10);
    P.add("beam", boxGeo(0.2, 6, 0.2), -10, 3, -12);
    P.add("beam", boxGeo(0.2, 6, 0.2), 10, 3, -12);
    const geos = P.build();
    const mats = {
      floor: new THREE.MeshStandardMaterial({ color: 0x55585a, roughness: 0.55, metalness: 0.2, map: ET.concrete }),
      wall: new THREE.MeshStandardMaterial({ color: 0x3b4146, roughness: 0.7, metalness: 0.5, map: ET.corrugated }),
      beam: new THREE.MeshStandardMaterial({ color: 0x2a2e31, roughness: 0.6, metalness: 0.6 }),
      plate: new THREE.MeshStandardMaterial({ color: 0x3e4245, roughness: 0.35, metalness: 0.8, map: vt.metal }),
      stripe: new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.6, emissive: 0x3a2800 }),
      crate: EM.crate,
      barrel: new THREE.MeshStandardMaterial({ color: 0x9a3a26, roughness: 0.5, metalness: 0.4 }),
      bench: new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 0.8 }),
    };
    const grp = new THREE.Group();
    for (const [k, g] of Object.entries(geos)) {
      const m = new THREE.Mesh(g, mats[k]);
      m.receiveShadow = true;
      m.castShadow = k !== "floor" && k !== "wall";
      grp.add(m);
    }
    gs.add(grp);
    gs.add(new THREE.HemisphereLight(0xb8c6d4, 0x2a2622, 0.7));
    const key = new THREE.SpotLight(0xfff0dc, 420, 50, 0.55, 0.5, 1.6);
    key.position.set(8, 14, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    gs.add(key);
    gs.add(key.target);
    const rim = new THREE.SpotLight(0x88b8ff, 260, 50, 0.6, 0.6, 1.6);
    rim.position.set(-10, 10, -8);
    gs.add(rim);
    gs.add(rim.target);
    const fill = new THREE.PointLight(0xffc890, 60, 30, 2);
    fill.position.set(0, 6, 8);
    gs.add(fill);
    // ceiling light strips
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
    const stripGeo = new THREE.BoxGeometry(10, 0.12, 0.5);
    for (const z of [-12, -2, 8]) for (const x of [-10, 10]) {
      const m = new THREE.Mesh(stripGeo, stripMat);
      m.position.set(x, 15.6, z);
      gs.add(m);
    }
    const turntable = new THREE.Group();
    gs.add(turntable);
    return { scene: gs, turntable, view: null, look: null, angle: 0.5, geos, mats, stripGeo, stripMat };
  }
  function renderGarage(dt, { look = "fox", drag = 0, locked = false } = {}) {
    const G = garage;
    if (G.look !== look) {
      if (G.view) disposeView(G.view);
      G.view = makeView(look);
      G.look = look;
      G.turntable.add(G.view.root);
    }
    G.angle += dt * 0.25 + drag;
    G.turntable.rotation.y = G.angle;
    const t = { x: 0, z: 0, y: 0.25, heading: 0, pitch: 0, roll: 0, tLocal: Math.sin(performance.now() / 2600) * 0.35, elev: 0.05 + Math.sin(performance.now() / 1900) * 0.04, alive: true, hp: 1, maxHp: 1, accel: 0, angVel: 0, speed: 0, fireT: 9, hitT: 9, trackL: 0, trackR: 0, L: G.view.d.L, id: 2, reload: 0, deadT: 0 };
    for (const k of Object.keys(wheelCount)) wheelCount[k] = 0;
    animateView(G.view, t, dt, null);
    G.view.paint.color.copy(G.view.baseColor).multiplyScalar(locked ? 0.35 : 1);
    // garage wheels live in the garage scene: temporarily move the instanced meshes
    for (const k of Object.keys(wheelIMs)) {
      wheelIMs[k].count = wheelCount[k];
      wheelIMs[k].instanceMatrix.needsUpdate = true;
      G.scene.add(wheelIMs[k]);
    }
    camera.position.set(8.5, 3.6, 9.5);
    camera.lookAt(0, 1.3, 0);
    camera.fov = 42;
    camera.updateProjectionMatrix();
    renderer.render(G.scene, camera);
    for (const k of Object.keys(wheelIMs)) scene.add(wheelIMs[k]);
  }

  /* ------------------------------------------------------------ misc */
  function resize(w, h) {
    size.w = Math.max(1, w);
    size.h = Math.max(1, h);
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  }
  function setQuality(nq) {
    if (nq === q) return;
    q = nq;
    setDpr();
    renderer.shadowMap.enabled = q !== "low";
    sun.castShadow = q !== "low";
    resize(size.w, size.h);
  }
  function minimapFor(worldId) {
    useWorld(worldId);
    return env.minimap;
  }
  function dispose() {
    clearViews();
    if (menuView) disposeView(menuView);
    if (garage.view) disposeView(garage.view);
    for (const e of envs.values()) for (const d of e.disposables) d.dispose?.();
    envs.clear();
    for (const g of Object.values(garage.geos)) g.dispose();
    for (const m of Object.values(garage.mats)) if (m !== EM.crate) m.dispose();
    garage.stripGeo.dispose();
    garage.stripMat.dispose();
    smoke.dispose();
    fire.dispose();
    tracers.dispose();
    debris.dispose();
    debrisMat.dispose();
    decals.dispose();
    flashes.dispose(scene);
    for (const g of Object.values(wheelGeos)) g.dispose();
    for (const im of Object.values(wheelIMs)) im.dispose();
    for (const m of Object.values(VM)) m.dispose();
    for (const m of Object.values(EM)) m.dispose();
    for (const t of [...Object.values(vt), ...Object.values(ET), ...Object.values(FT)]) t.dispose();
    for (const d of designGeometries(true)) d.dispose();
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
  }

  return { renderer, camera, size, render, renderMenu, renderGarage, updateCamera, resetCamera, aimPoint, project, resize, setQuality, minimapFor, dispose, get shake() { return shake; }, addShake: (s) => (shake = Math.max(shake, s)), elevMin: ELEV_MIN };
}

