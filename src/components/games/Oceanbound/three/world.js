/**
 * Oceanbound — the WebGL world. One renderer / canvas for the whole game;
 * it never owns game state, it mirrors a sim G every frame.
 *
 * Modes: "menu" (slow cinematic orbit around the raft) and "play" (first
 * person). Quality (low | medium | high) sets pixel ratio, MSAA, shadows,
 * ocean / terrain density, particle budgets, fog distance and the sky-lit
 * environment map.
 */
import * as THREE from "three";
import { createSky, palette } from "./sky.js";
import { createOcean, WU } from "./water.js";
import { createMaterials, disposeMaterials, geoParts, getModel, MATS, sharkParts, fishGeo, gullParts, meshes } from "./models.js";
import { createIslandsView } from "./islandView.js";
import { createRaftView } from "./raftView.js";
import { createFx } from "./fx.js";
import { createViewmodel } from "./viewmodel.js";
import { disposeTextures, setAnisotropy } from "./textures.js";
import { waveHeight, waveSlope } from "../sim/waves.js";
import { EYE } from "../sim/player.js";
import { patchWet } from "./water.js";
import { islandsNear } from "../sim/islands.js";

const QUAL = {
  low: { pr: 1, aa: false, shadow: 0, fog: 640, env: false },
  medium: { pr: 1.5, aa: true, shadow: 1024, fog: 880, env: true },
  high: { pr: 2, aa: true, shadow: 2048, fog: 1050, env: true },
};
const DEBRIS_KINDS = ["plank", "plastic", "leaf", "scrap", "barrel", "cargo"];
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export function createWorld(host, { quality = "medium", onContextLost, onContextRestored, preserve = false } = {}) {
  let Q = QUAL[quality] ? quality : "medium";
  let cfg = QUAL[Q];
  const canvas = document.createElement("canvas");
  canvas.className = "ob-canvas";
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: cfg.aa, powerPreference: "high-performance", preserveDrawingBuffer: preserve });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = cfg.shadow > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const lost = (e) => {
    e.preventDefault();
    onContextLost?.();
  };
  const restored = () => onContextRestored?.();
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);

  createMaterials(Q);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#b5e0f5", 120, cfg.fog);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 5200);
  camera.rotation.order = "YXZ";
  scene.add(camera);

  const hemi = new THREE.HemisphereLight("#bfe3ff", "#3d6a7a", 0.8);
  const sun = new THREE.DirectionalLight("#ffffff", 2.2);
  sun.castShadow = cfg.shadow > 0;
  sun.shadow.mapSize.set(cfg.shadow || 512, cfg.shadow || 512);
  const sc = sun.shadow.camera;
  sc.left = -22;
  sc.right = 22;
  sc.top = 22;
  sc.bottom = -22;
  sc.near = 1;
  sc.far = 120;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);

  const sky = createSky();
  scene.add(sky.mesh);
  let ocean = createOcean(Q);
  scene.add(ocean.mesh);
  let fx = createFx(scene, Q);
  const raftView = createRaftView(scene);
  let islands = null;
  const vm = createViewmodel();

  // env map from the sky (refreshed as the day turns)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(sky.mesh.geometry, sky.mat);
  envScene.add(envSky);
  let envRT = null;
  let envClock = -99;
  const refreshEnv = (clock) => {
    if (!cfg.env) {
      if (envRT) {
        envRT.dispose();
        envRT = null;
      }
      scene.environment = null;
      return;
    }
    if (Math.abs(clock - envClock) < 0.35 && envRT) return;
    envClock = clock;
    const prev = envRT;
    envRT = pmrem.fromScene(envScene, 0, 1, 4500);
    scene.environment = envRT.texture;
    prev?.dispose();
  };

  /* ---------------- debris */
  const debrisIM = {};
  for (const k of DEBRIS_KINDS) {
    debrisIM[k] = geoParts(`d_${k}`).map(([g, mk]) => {
      const im = new THREE.InstancedMesh(g, MATS[mk], 90);
      im.count = 0;
      im.castShadow = true;
      im.frustumCulled = false;
      scene.add(im);
      return im;
    });
  }
  /* ---------------- satchel */
  const satchel = getModel("crate");
  satchel.scale.setScalar(0.7);
  const satGlow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), MATS.glow);
  satchel.add(satGlow);
  satchel.visible = false;
  scene.add(satchel);

  /* ---------------- shark */
  const sharkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
  patchWet(sharkMat);
  const wetCompile = sharkMat.onBeforeCompile;
  const sharkU = { uSwim: { value: 0 }, uAmp: { value: 0.25 } };
  sharkMat.onBeforeCompile = (sh) => {
    wetCompile(sh);
    Object.assign(sh.uniforms, sharkU);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uSwim; uniform float uAmp;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
float sw = smoothstep(1.1, -1.7, position.z);
transformed.x += sin(position.z * 1.9 - uSwim) * uAmp * sw * sw;`,
    );
  };
  sharkMat.customProgramCacheKey = () => "obshark";
  const shark = new THREE.Group();
  for (const [g] of sharkParts()) {
    const m = new THREE.Mesh(g, sharkMat);
    m.castShadow = true;
    shark.add(m);
  }
  shark.scale.setScalar(1.05);
  scene.add(shark);
  let sharkPhase = 0;

  /* ---------------- fish schools */
  const fishMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 });
  patchWet(fishMat);
  const fishCompile = fishMat.onBeforeCompile;
  const fishU = { uFT: { value: 0 } };
  fishMat.onBeforeCompile = (sh) => {
    fishCompile(sh);
    Object.assign(sh.uniforms, fishU);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uFT;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
float fw = smoothstep(0.08, -0.2, position.z);
transformed.x += sin(position.z * 14.0 + uFT * 13.0 + float(gl_InstanceID) * 1.7) * 0.035 * fw;`,
    );
  };
  fishMat.customProgramCacheKey = () => "obfish";
  const SCHOOLS = 4;
  const PER = 16;
  const fishIM = new THREE.InstancedMesh(fishGeo()[0][0], fishMat, SCHOOLS * PER);
  fishIM.frustumCulled = false;
  const fishCols = ["#9fb8d8", "#f2d36b", "#ff9a6a", "#8fe0d0"];
  for (let i = 0; i < SCHOOLS * PER; i++) fishIM.setColorAt(i, _c.set(fishCols[Math.floor(i / PER)]));
  scene.add(fishIM);
  const schools = [];
  for (let s = 0; s < SCHOOLS; s++) schools.push({ ph: s * 1.7, r: 9 + s * 5, depth: -2.4 - s * 0.9, cx: 0, cz: 0, y: -3, flee: 0, fish: Array.from({ length: PER }, (_, k) => ({ o: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 3), ph: Math.random() * 6, x: 0, y: 0, z: 0, yaw: 0, k })) });

  /* ---------------- gulls */
  const gp = gullParts();
  const gulls = [];
  for (let i = 0; i < 5; i++) {
    const g = meshes(gp.body, { shadow: true, receive: false });
    const wl = new THREE.Group();
    const wr = new THREE.Group();
    wl.add(meshes(gp.wing, { shadow: true, receive: false }));
    const rw = meshes(gp.wing, { shadow: true, receive: false });
    rw.scale.x = -1;
    wr.add(rw);
    g.add(wl, wr);
    scene.add(g);
    gulls.push({ g, wl, wr, ph: Math.random() * 6, r: 12 + Math.random() * 16, h: 9 + Math.random() * 8, sp: 0.25 + Math.random() * 0.15, dir: Math.random() < 0.5 ? 1 : -1, flap: 0, cx: 0, cz: 0 });
  }

  /* ---------------- hook + rope, bobber + line */
  const hook = getModel("t_hook");
  hook.scale.setScalar(1.6);
  scene.add(hook);
  const ropeN = 20;
  const ropeGeo = new THREE.BufferGeometry();
  ropeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ropeN * 3), 3));
  const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: "#d9c79a" }));
  rope.frustumCulled = false;
  scene.add(rope);
  const bobber = new THREE.Group();
  bobber.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#e63b2e", roughness: 0.4 })));
  const bb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#f4f4f0", roughness: 0.4 }));
  bobber.add(bb);
  scene.add(bobber);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ropeN * 3), 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: "#eeeeee", transparent: true, opacity: 0.7 }));
  line.frustumCulled = false;
  scene.add(line);
  const setCurve = (geo, a, b, sag) => {
    const p = geo.attributes.position;
    for (let i = 0; i < ropeN; i++) {
      const t = i / (ropeN - 1);
      p.setXYZ(i, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * sag, a.z + (b.z - a.z) * t);
    }
    p.needsUpdate = true;
  };

  /* ---------------- state */
  let width = 1;
  let height = 1;
  let fov = 72;
  let shake = 0;
  let camBob = 0;
  let landDip = 0;
  let hurtT = 0;
  let menuA = 0;
  let wasUnder = false;
  let bubbleAcc = 0;
  let lastHook = "idle";
  const tipW = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const st = { underwater: false, frame: 0 };

  function resize() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    width = w;
    height = h;
    const pr = Math.min(window.devicePixelRatio || 1, cfg.pr);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  /* ---------------- events → effects */
  function onEvents(G) {
    for (const e of G.events) {
      switch (e.t) {
        case "splash":
          fx.splash(e.x, e.y, e.z, e.s || 1);
          break;
        case "hooked":
        case "netCatch":
          fx.splash(e.x, e.y ?? waveHeight(e.x, e.z, G.t), e.z, 0.25);
          break;
        case "fill":
          if (e.x != null) fx.splash(e.x, e.y ?? 0, e.z, 0.2);
          break;
        case "bite":
        case "catch":
          fx.splash(e.x, e.y, e.z, 0.35);
          break;
        case "chop":
          fx.emit("chip", e.x, e.y, e.z, 10, { speed: 0.8 });
          fx.emit("leaf", e.x, e.y + 2.5, e.z, 4, { speed: 0.4, spread: 3 });
          shake = Math.max(shake, 0.12);
          break;
        case "mine":
          fx.emit("dust", e.x, e.y - 0.6, e.z, 8, { speed: 0.5 });
          fx.emit("spark", e.x, e.y - 0.6, e.z, 6, { speed: 1.1 });
          shake = Math.max(shake, 0.14);
          break;
        case "treeFall":
          fx.emit("leaf", e.x, e.y + 5, e.z, 26, { speed: 0.8, spread: 4 });
          break;
        case "rockBreak":
          fx.emit("dust", e.x, e.y + 0.5, e.z, 26, { speed: 1, spread: 2 });
          break;
        case "place":
        case "remove":
          fx.emit("dust", e.x, e.y + 0.2, e.z, 10, { speed: 0.6, spread: 2 });
          fx.emit("chip", e.x, e.y + 0.3, e.z, 6, { speed: 0.6 });
          break;
        case "hammer":
          fx.emit("chip", e.x, e.y + 0.1, e.z, 8, { speed: 0.7 });
          break;
        case "sharkChomp":
          fx.emit("spray", e.x, e.y, e.z, 14, { speed: 1.2 });
          fx.ring(e.x, e.z, 0.8);
          fx.emit("chip", e.x, e.y + 0.2, e.z, 4, { speed: 0.8 });
          break;
        case "sharkHurt":
          fx.emit("blood", e.x, e.y, e.z, 6, { spread: 1.5 });
          fx.emit("spray", e.x, waveHeight(e.x, e.z, G.t), e.z, 12);
          break;
        case "sharkDie":
          fx.emit("blood", e.x, e.y, e.z, 14, { spread: 3 });
          fx.splash(e.x, waveHeight(e.x, e.z, G.t), e.z, 1.4);
          break;
        case "sharkHitPlayer":
          fx.emit("blood", e.x, e.y, e.z, 8, { spread: 1.5 });
          shake = 0.6;
          hurtT = 1;
          break;
        case "foundationLost":
          fx.splash(e.x, e.y, e.z, 1.6);
          fx.emit("chip", e.x, e.y + 0.3, e.z, 20, { speed: 1.4 });
          shake = 0.4;
          break;
        case "hurt":
          hurtT = Math.min(1, hurtT + (e.slow ? 0.25 : 0.5));
          if (!e.slow) shake = Math.max(shake, 0.18);
          break;
        case "purified":
          fx.emit("steam", e.x, e.y + 0.6, e.z, 8);
          break;
        case "cooked":
          fx.emit("smoke", e.x, e.y + 0.4, e.z, 6);
          break;
        case "smelted":
          fx.emit("spark", e.x, e.y + 0.4, e.z, 12, { speed: 0.8 });
          break;
        case "crate":
        case "pickup":
          if (e.x != null) fx.emit("glint", e.x, (e.y || 0) + 0.3, e.z, 4, { speed: 0.3 });
          break;
        case "land":
          landDip = Math.max(landDip, e.s * 0.2);
          break;
        case "enterWater":
          fx.splash(G.player.x, waveHeight(G.player.x, G.player.z, G.t), G.player.z, 0.9);
          break;
        case "stroke":
          if (e.under) fx.emit("bubble", camPos.x, camPos.y - 0.2, camPos.z, 4);
          break;
      }
      islands?.event(e, G);
    }
  }

  /* ---------------- per-frame mirrors */
  function syncDebris(G) {
    const counts = {};
    for (const k of DEBRIS_KINDS) counts[k] = 0;
    for (const d of G.debris) {
      const list = debrisIM[d.kind];
      if (!list) continue;
      const n = counts[d.kind];
      if (n >= 90) continue;
      const y = waveHeight(d.x, d.z, G.t);
      const [sx, sz] = waveSlope(d.x, d.z, G.t);
      _e.set(-sz * 0.8 + Math.sin(G.t * 1.3 + d.ph) * 0.05, d.rot, sx * 0.8, "YXZ");
      _q.setFromEuler(_e);
      _v.set(d.x, y + (d.kind === "barrel" || d.kind === "cargo" ? -0.05 : 0.0) + Math.sin(G.t * 2 + d.ph) * 0.02, d.z);
      _s.set(1, 1, 1);
      _m.compose(_v, _q, _s);
      for (const im of list) im.setMatrixAt(n, _m);
      counts[d.kind] = n + 1;
    }
    for (const k of DEBRIS_KINDS)
      for (const im of debrisIM[k]) {
        im.count = counts[k];
        im.instanceMatrix.needsUpdate = true;
      }
  }
  function syncShark(G, dt) {
    const S = G.shark;
    shark.visible = S.state !== "dead" || S.y > -11;
    const speedK = S.state === "bite" ? 2.6 : S.state === "lunge" ? 2.2 : S.speed / 3;
    sharkPhase += dt * (3 + speedK * 3);
    sharkU.uSwim.value = sharkPhase;
    sharkU.uAmp.value = (S.state === "bite" ? 0.32 : 0.2) + S.thrash * 0.3;
    shark.position.set(S.x, S.y, S.z);
    const roll = S.state === "dead" ? Math.min(Math.PI, (shark.rotation.z || 0) + dt * 1.5) : Math.sin(sharkPhase * 0.5) * 0.06 + (S.state === "bite" ? Math.sin(G.t * 9) * 0.35 : 0);
    shark.rotation.set(S.state === "bite" ? -0.35 : 0, S.yaw, roll, "YXZ");
    sharkMat.emissive.setRGB(S.hitFlash * 0.6, 0, 0);
    // fin wake on the surface
    const w = waveHeight(S.x, S.z, G.t);
    if (S.y > w - 1.4 && S.state !== "dead" && Math.random() < dt * 14) {
      _v.set(0, 0.35, 0.25).applyEuler(shark.rotation).add(shark.position);
      fx.emit("wake", _v.x, w, _v.z, 1);
    }
  }
  function syncFish(G, dt, time) {
    const R = G.raft;
    const P = G.player;
    fishU.uFT.value = time;
    let i = 0;
    const isl = islandsNear(G.world, R.x, R.z, 120)[0];
    for (const s of schools) {
      const a = time * (0.08 + s.r * 0.002) + s.ph;
      const cx0 = isl && s.ph > 3 ? isl.x : R.x;
      const cz0 = isl && s.ph > 3 ? isl.z : R.z;
      const rr = isl && s.ph > 3 ? isl.r * 1.35 + s.r * 0.3 : s.r;
      let tx = cx0 + Math.cos(a) * rr;
      let tz = cz0 + Math.sin(a * 1.3) * rr;
      const dx = s.cx - P.x;
      const dz = s.cz - P.z;
      const d = Math.hypot(dx, dz);
      if (P.headUnder && d < 6) s.flee = 1;
      s.flee = Math.max(0, s.flee - dt * 0.3);
      if (s.flee > 0 && d > 0.1) {
        tx += (dx / d) * 8 * s.flee;
        tz += (dz / d) * 8 * s.flee;
      }
      const vx = (tx - s.cx) * Math.min(1, dt * 0.6);
      const vz = (tz - s.cz) * Math.min(1, dt * 0.6);
      if (s.cx === 0 && s.cz === 0) {
        s.cx = tx;
        s.cz = tz;
      } else {
        s.cx += vx;
        s.cz += vz;
      }
      const yaw = Math.atan2(vx, vz);
      for (const f of s.fish) {
        const fx_ = s.cx + f.o.x + Math.sin(time * 0.7 + f.ph) * 0.6;
        const fy = s.depth + f.o.y + Math.sin(time * 0.9 + f.ph * 2) * 0.25;
        const fz = s.cz + f.o.z + Math.cos(time * 0.6 + f.ph) * 0.6;
        f.yaw += ((yaw + Math.sin(time + f.ph) * 0.3) - f.yaw) * Math.min(1, dt * 3);
        _e.set(0, f.yaw, 0);
        _q.setFromEuler(_e);
        _v.set(fx_, fy, fz);
        _s.set(1, 1, 1);
        _m.compose(_v, _q, _s);
        fishIM.setMatrixAt(i++, _m);
      }
    }
    fishIM.instanceMatrix.needsUpdate = true;
  }
  function syncGulls(G, dt, time) {
    const R = G.raft;
    const near = islandsNear(G.world, R.x, R.z, 200)[0];
    gulls.forEach((g, k) => {
      const useIsl = near && k % 2 === 0;
      const cx = useIsl ? near.x : R.x;
      const cz = useIsl ? near.z : R.z;
      g.cx += (cx - g.cx) * Math.min(1, dt * 0.2);
      g.cz += (cz - g.cz) * Math.min(1, dt * 0.2);
      if (!g.init) {
        g.cx = cx;
        g.cz = cz;
        g.init = true;
      }
      g.ph += dt * g.sp * g.dir;
      const r = g.r + Math.sin(time * 0.2 + k) * 3;
      const x = g.cx + Math.cos(g.ph) * r;
      const z = g.cz + Math.sin(g.ph) * r;
      const y = g.h + Math.sin(time * 0.5 + k * 2) * 1.5 + (useIsl ? 6 : 0);
      g.g.position.set(x, y, z);
      g.g.rotation.set(0, Math.atan2(-Math.sin(g.ph) * g.dir, Math.cos(g.ph) * g.dir), -0.25 * g.dir, "YXZ");
      // flap in bursts, then glide
      const cyc = (time * 0.3 + k * 0.37) % 1;
      const flapping = cyc < 0.35;
      g.flap += dt * (flapping ? 12 : 0);
      const wing = flapping ? Math.sin(g.flap) * 0.7 : 0.08;
      g.wl.rotation.z = wing;
      g.wr.rotation.z = -wing;
    });
  }
  function syncTools(G) {
    const H = G.hook;
    const eq = G.inv.slots[G.sel];
    const holdHook = eq && eq.id === "hook";
    vm.tipWorld(camera, tipW);
    if (H.state === "fly" || H.state === "water" || H.state === "retract") {
      hook.visible = true;
      hook.position.set(H.x, H.y + 0.05, H.z);
      hook.lookAt(tipW);
      rope.visible = true;
      _v2.set(H.x, H.y, H.z);
      const dist = tipW.distanceTo(_v2);
      setCurve(ropeGeo, tipW, _v2, H.state === "water" ? Math.min(1.2, dist * 0.06) : dist * 0.02);
      if (H.state === "water" && lastHook !== "water") fx.ring(H.x, H.z, 0.4);
    } else {
      hook.visible = false;
      rope.visible = false;
    }
    lastHook = H.state;
    void holdHook;
    const Rd = G.rod;
    if (Rd.state === "fly" || Rd.state === "wait" || Rd.state === "bite") {
      bobber.visible = true;
      line.visible = true;
      const dip = Rd.state === "bite" ? -0.1 + Math.sin(G.t * 30) * 0.05 : 0;
      bobber.position.set(Rd.x, Rd.y + dip, Rd.z);
      _v2.set(Rd.x, Rd.y + dip + 0.05, Rd.z);
      setCurve(lineGeo, tipW, _v2, tipW.distanceTo(_v2) * 0.04);
      if (Rd.state === "bite" && Math.random() < 0.3) fx.emit("spray", Rd.x, Rd.y, Rd.z, 1, { speed: 0.3 });
    } else {
      bobber.visible = false;
      line.visible = false;
    }
  }

  /* ---------------- camera */
  function placeCamera(G, dt, mode, settings) {
    const P = G.player;
    const R = G.raft;
    if (mode === "menu") {
      menuA += dt * 0.05;
      const r = 9.5;
      camera.position.set(R.x + Math.cos(menuA) * r, R.y + 3.2 + Math.sin(menuA * 0.7) * 0.4, R.z + Math.sin(menuA) * r);
      camera.lookAt(R.x, R.y + 0.8, R.z);
      camera.fov = 60;
      camera.updateProjectionMatrix();
      return;
    }
    const sp = Math.hypot(P.vx - (P.onRaftFrame ? R.vx : 0), P.vz - (P.onRaftFrame ? R.vz : 0));
    const bobOn = settings?.bob !== false;
    const bk = bobOn && P.mode === "walk" && P.grounded ? Math.min(1, sp / 4) : 0;
    camBob += (bk - camBob) * Math.min(1, dt * 6);
    const by = Math.abs(Math.sin(P.bob * 3.1)) * 0.05 * camBob - 0.025 * camBob;
    const bx = Math.sin(P.bob * 3.1) * 0.025 * camBob;
    landDip *= Math.exp(-dt * 7);
    shake *= Math.exp(-dt * 5);
    hurtT *= Math.exp(-dt * 2);
    let ey = P.y + EYE + by - landDip;
    if (P.mode === "swim") ey += Math.sin(G.t * 1.7) * 0.04;
    if (G.dead) ey = P.y + 0.4 + Math.sin(G.t) * 0.1;
    camera.position.set(P.x + Math.cos(P.yaw) * bx, ey, P.z - Math.sin(P.yaw) * bx);
    if (shake > 0.001) camera.position.add(_v.set((Math.random() - 0.5) * shake * 0.2, (Math.random() - 0.5) * shake * 0.2, (Math.random() - 0.5) * shake * 0.2));
    // feel the raft rock under your feet
    const onR = P.onRaftFrame ? 1 : 0;
    camera.rotation.set(P.pitch + (R.pitch || 0) * 0.35 * onR * Math.cos(P.yaw), P.yaw, (R.roll || 0) * 0.35 * onR + bx * 0.3 + (G.dead ? 0.8 : 0));
    const sprintK = P.mode === "walk" && sp > 5 ? 1 : 0;
    const want = fov + sprintK * 6;
    camera.fov += (want - camera.fov) * Math.min(1, dt * 6);
    camera.updateProjectionMatrix();
  }

  /* ---------------- frame */
  function render(G, dt, { mode = "play", settings = {} } = {}) {
    st.frame++;
    if (!islands) islands = createIslandsView(G, scene, Q);
    const time = G.t;
    WU.uTime.value = time;
    // time of day
    const P = palette(G.clock);
    WU.uSunDir.value.copy(P.dir.y > -0.1 ? P.dir : P.moon);
    WU.uSunCol.value.copy(P.sun);
    WU.uSunI.value = P.sunI;
    WU.uZenith.value.copy(P.zenith);
    WU.uHorizon.value.copy(P.horizon);
    placeCamera(G, dt, mode, settings);
    camPos.copy(camera.position);
    WU.uCamPos.value.copy(camPos);
    const under = camPos.y < waveHeight(camPos.x, camPos.z, time) - 0.02;
    st.underwater = under;
    WU.uCamUnder.value = under ? 1 : 0;
    const deep = _c.set("#0b3d5e").multiplyScalar(0.35 + 0.65 * P.sunI);
    if (under) {
      scene.fog.color.copy(deep).lerp(WU.uShallow.value, 0.25 * P.sunI);
      scene.fog.near = 0.5;
      scene.fog.far = 34;
      renderer.setClearColor(scene.fog.color);
    } else {
      scene.fog.color.copy(P.horizon);
      scene.fog.near = 110;
      scene.fog.far = cfg.fog;
    }
    WU.uFogCol.value.copy(scene.fog.color);
    WU.uFogNear.value = scene.fog.near;
    WU.uFogFar.value = scene.fog.far;
    WU.uDeep.value.set("#0a3a5c");
    WU.uShallow.value.set("#21b2b0");
    // lights
    sun.color.copy(P.sun);
    sun.intensity = P.sunI * 2.4;
    hemi.color.copy(P.zenith).lerp(P.horizon, 0.5);
    hemi.groundColor.set("#2c5a68").multiplyScalar(0.4 + P.amb * 0.6);
    hemi.intensity = (cfg.env ? 0.35 : 0.85) * (0.4 + P.amb);
    scene.environmentIntensity = 0.25 + P.amb * 0.55;
    const tgt = mode === "menu" ? G.raft : G.player;
    sun.position.set(tgt.x + P.light.x * 60, (tgt.y || 0) + P.light.y * 60, tgt.z + P.light.z * 60);
    sun.target.position.set(tgt.x, tgt.y || 0, tgt.z);
    sun.target.updateMatrixWorld();
    if (st.frame % 30 === 1) refreshEnv(G.clock);
    vm.setLight(P.sun, P.sunI, hemi.color, hemi.groundColor, P.amb);

    sky.update(camPos, P, time);
    ocean.update(camPos);
    islands.update(G, camPos, dt, time);
    raftView.update(G, dt, time, fx);
    raftView.setGhost(mode === "play" ? G.build.ghost : null, G.raft);
    syncDebris(G);
    syncShark(G, dt);
    syncFish(G, dt, time);
    syncGulls(G, dt, time);
    // satchel
    if (G.satchel) {
      const S = G.satchel;
      satchel.visible = true;
      satchel.position.set(S.x, S.float ? waveHeight(S.x, S.z, time) - 0.1 : S.y, S.z);
      satchel.rotation.y = time * 0.3;
      satGlow.scale.setScalar(1 + Math.sin(time * 3) * 0.15);
    } else satchel.visible = false;
    if (mode === "play") onEvents(G);
    // underwater ambience
    if (under) {
      if (Math.random() < dt * 30) fx.emit("snow", camPos.x + (Math.random() - 0.5) * 12, camPos.y + (Math.random() - 0.5) * 6, camPos.z + (Math.random() - 0.5) * 12, 1);
      bubbleAcc += dt;
      if (bubbleAcc > 1.4) {
        bubbleAcc = 0;
        fx.emit("bubble", camPos.x + Math.sin(G.player.yaw) * -0.3, camPos.y - 0.15, camPos.z + Math.cos(G.player.yaw) * -0.3, 5);
      }
    }
    if (under !== wasUnder && mode === "play") fx.emit("bubble", camPos.x, camPos.y - 0.2, camPos.z, 12);
    wasUnder = under;
    fx.update(dt, time, height, renderer.getPixelRatio());

    // first person
    const showVM = mode === "play" && !G.dead;
    if (showVM) vm.update(G, dt, time, camera, settings);
    syncTools(G);
    if (mode !== "play") {
      hook.visible = rope.visible = bobber.visible = line.visible = false;
    }

    renderer.autoClear = true;
    if (!under) renderer.setClearColor(P.horizon);
    renderer.render(scene, camera);
    if (showVM) {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(vm.scene, vm.camera);
      renderer.autoClear = true;
    }
    return st;
  }

  return {
    renderer,
    scene,
    camera,
    canvas,
    render,
    resize,
    state: st,
    hurt: () => hurtT,
    setFov(f) {
      fov = f;
    },
    setQuality(nq) {
      if (!QUAL[nq] || nq === Q) return;
      Q = nq;
      cfg = QUAL[Q];
      renderer.shadowMap.enabled = cfg.shadow > 0;
      sun.castShadow = cfg.shadow > 0;
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
      sun.shadow.mapSize.set(cfg.shadow || 512, cfg.shadow || 512);
      scene.remove(ocean.mesh);
      ocean.dispose();
      ocean = createOcean(Q);
      scene.add(ocean.mesh);
      fx.dispose();
      fx = createFx(scene, Q);
      islands?.setQuality(Q);
      envClock = -99;
      scene.traverse((o) => {
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
      });
      resize();
    },
    /** drop the island views (new game / load) */
    reset() {
      if (islands) {
        islands.dispose();
        islands = null;
      }
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      islands?.dispose();
      raftView.dispose();
      fx.dispose();
      ocean.dispose();
      sky.dispose();
      vm.dispose();
      envRT?.dispose();
      pmrem.dispose();
      for (const k of DEBRIS_KINDS) for (const im of debrisIM[k]) im.dispose();
      fishIM.dispose();
      sharkMat.dispose();
      fishMat.dispose();
      ropeGeo.dispose();
      lineGeo.dispose();
      disposeMaterials();
      disposeTextures();
      renderer.dispose();
      canvas.remove();
    },
  };
}
