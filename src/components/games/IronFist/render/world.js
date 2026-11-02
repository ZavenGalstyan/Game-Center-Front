/**
 * The 3D world: renderer + scene + arena + fighters + camera + FX.
 *
 * Owns its own requestAnimationFrame loop (none in test mode — the harness
 * calls `advance()`). With a match attached it advances the simulation at a
 * FIXED timestep (SIM_DT) from an accumulator, asking the session for both
 * input frames before every step, and renders fighters interpolated between
 * the last two sim states. React is never updated from here per frame: the
 * shell registers `onFrame` (direct DOM writes for the HUD) and `onEvent`.
 *
 * Quality presets:  low    no shadows, 0.75 px ratio, no post
 *                   medium 1024² soft shadows, ≤1.25 px ratio, no post
 *                   high   2048² soft shadows, ≤1.75 px ratio, bloom + grade + MSAA
 * A watchdog drops high → medium if the fight runs below ~40 fps.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SIM_DT, ARENA_HALF } from "../engine/constants.js";
import { step } from "../engine/fight.js";
import { FIGHTER_BY_ID } from "../engine/fighters.js";
import { loadAssets } from "./assets.js";
import { createFighterView } from "./fighterView.js";
import { buildArena } from "./arenas.js";
import { createFx } from "./fx.js";
import { disposeTextures } from "./textures.js";
import { audio } from "../audio.js";

const PR = { low: 0.75, medium: 1.25, high: 1.75 };
const SHADOW = { low: 0, medium: 1024, high: 2048 };

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 }, uSat: { value: 1.08 }, uFlash: { value: 0 }, uFlashC: { value: new THREE.Color(1, 1, 1) } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig; uniform float uSat; uniform float uFlash; uniform vec3 uFlashC; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVig * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      c.rgb = mix(c.rgb, uFlashC * 2.0, uFlash);
      gl_FragColor = c;
    }`,
};

export function createWorld(host, { quality = "high", test = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "ifa-canvas";
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: test });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.05, 320);
  camera.position.set(0, 1.5, 6);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;

  /* ------------------------------------------------------------ light rig */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.5);
  const key = new THREE.DirectionalLight(0xffffff, 3);
  key.castShadow = true;
  key.shadow.camera.left = -7.5;
  key.shadow.camera.right = 7.5;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -3;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 3;
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  const rim = new THREE.DirectionalLight(0xffffff, 2);
  key.target.position.set(0, 1, 0);
  fill.target.position.set(0, 1, 0);
  rim.target.position.set(0, 1.2, 0);
  scene.add(hemi, key, key.target, fill, fill.target, rim, rim.target);
  const fx = createFx(scene);

  let W = 1280;
  let H = 720;
  let q = quality;
  let composer = null;
  let bloom = null;
  let grade = null;
  let arena = null;
  let arenaId = null;
  let assets = null;
  let disposed = false;
  let raf = 0;
  let last = 0;
  let clock = 0;

  /* ------------------------------------------------------------ fighters */
  const viewCache = new Map();
  function viewFor(id, alt = false, boss = false) {
    if (!assets) throw new Error("Iron Fist assets not loaded");
    const k = `${id}|${alt ? 1 : 0}|${boss ? 1 : 0}`;
    let v = viewCache.get(k);
    if (!v) {
      v = createFighterView(assets, FIGHTER_BY_ID[id], { alt, boss });
      viewCache.set(k, v);
    }
    return v;
  }
  let active = []; // views in the scene
  function setViews(vs) {
    for (const v of active) if (!vs.includes(v)) scene.remove(v.root);
    for (const v of vs) if (!active.includes(v)) scene.add(v.root);
    active = vs;
  }

  /* ------------------------------------------------------------ match state */
  let match = null;
  let session = null;
  let views = [];
  let prev = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  let acc = 0;
  let paused = false;
  let slow = { t: 0, scale: 1 };
  let shakeA = 0;
  let flashA = 0;
  const flashC = new THREE.Color(1, 1, 1);
  const listeners = new Set();
  const frameListeners = new Set();
  let showcase = null;
  let fpsWin = { t: 0, n: 0, low: 0 };
  const special = [
    { mt: 0, seq: -1 },
    { mt: 0, seq: -1 },
  ];

  /* ------------------------------------------------------------ setup */
  const ready = loadAssets().then((a) => {
    assets = a;
    return true;
  });

  function setupComposer() {
    if (composer) {
      composer.passes.forEach((p) => p.dispose?.());
      composer.renderTarget1?.dispose();
      composer.renderTarget2?.dispose();
    }
    composer = null;
    bloom = null;
    grade = null;
    if (q !== "high") return;
    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.4, 0.5, 0.96);
    composer.addPass(bloom);
    grade = new ShaderPass(GradeShader);
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PR[q]));
    composer.setSize(W, H);
    if (arena) bloom.strength = arena.mood.bloom ?? 0.4;
  }

  function resize(w, h) {
    W = Math.max(2, Math.floor(w));
    H = Math.max(2, Math.floor(h));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PR[q]));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // keep the fight framed on narrow (portrait) screens
    camera.fov = W / H < 1.2 ? 48 : W / H < 1.55 ? 40 : 34;
    camera.updateProjectionMatrix();
    composer?.setPixelRatio(Math.min(window.devicePixelRatio || 1, PR[q]));
    composer?.setSize(W, H);
    fx.setScale(H * Math.min(window.devicePixelRatio || 1, PR[q]));
  }

  function setQuality(nq) {
    if (!PR[nq]) return;
    q = nq;
    renderer.shadowMap.enabled = SHADOW[q] > 0;
    key.castShadow = SHADOW[q] > 0;
    if (SHADOW[q]) {
      key.shadow.mapSize.set(SHADOW[q], SHADOW[q]);
      key.shadow.map?.dispose();
      key.shadow.map = null;
    }
    // shadow toggles change shader defines → force recompiles
    scene.traverse((o) => {
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
    });
    setupComposer();
    resize(W, H);
  }

  function applyMood(md) {
    renderer.toneMappingExposure = md.exposure ?? 1;
    scene.environmentIntensity = md.env ?? 0.4;
    scene.fog = new THREE.Fog(md.fog[0], md.fog[1], md.fog[2]);
    scene.background = new THREE.Color(md.fog[0]);
    hemi.color.set(md.hemi[0]);
    hemi.groundColor.set(md.hemi[1]);
    hemi.intensity = md.hemi[2];
    key.color.set(md.key[0]);
    key.intensity = md.key[1];
    key.position.set(...md.key[2]);
    fill.color.set(md.fill[0]);
    fill.intensity = md.fill[1];
    fill.position.set(...md.fill[2]);
    rim.color.set(md.rim[0]);
    rim.intensity = md.rim[1];
    rim.position.set(...md.rim[2]);
    if (bloom) bloom.strength = md.bloom ?? 0.4;
  }

  function setArena(id) {
    if (id === arenaId && arena) return;
    if (arena) {
      scene.remove(arena.group);
      arena.dispose();
    }
    arena = buildArena(id);
    arenaId = id;
    scene.add(arena.group);
    applyMood(arena.mood);
    audio.crowd(id === "temple" ? 0.15 : id === "rooftop" ? 0.08 : id === "underground" ? 0.8 : 1);
  }

  /* ------------------------------------------------------------ camera director */
  const cam = { pos: new THREE.Vector3(0, 1.5, 6), look: new THREE.Vector3(0, 1.05, 0), mode: "fight", t: 0, focus: 0 };
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();
  function directCamera(dt) {
    cam.t += dt;
    if (showcase) {
      const s = showcase;
      const a = s.orbit ? Math.sin(cam.t * 0.12) * s.orbit : 0;
      const d = s.dist;
      wantLook.set(s.look[0], s.look[1], s.look[2]);
      wantPos.set(s.look[0] + Math.sin(s.yaw + a) * d, s.height, s.look[2] + Math.cos(s.yaw + a) * d);
    } else if (match && views.length === 2) {
      const [a, b] = match.f;
      const mid = THREE.MathUtils.clamp((a.x + b.x) / 2, -(ARENA_HALF - 1.4), ARENA_HALF - 1.4);
      const sep = Math.abs(a.x - b.x);
      const asp = Math.max(0.6, camera.aspect);
      let dist = THREE.MathUtils.clamp(3.3 + sep * 0.95, 4.1, 7.6) * (asp < 1.4 ? 1.25 : 1);
      let h = 1.32 + sep * 0.07;
      let yawOff = 0;
      let lx = mid;
      let ly = 1.05;
      if (match.phase === "intro" && match.phaseT < 1.6) {
        const k = 1 - match.phaseT / 1.6;
        const e = k * k * (3 - 2 * k);
        yawOff = (match.round === 1 ? 0.95 : 0.4) * e;
        dist += e * 0.8;
        h += e * 0.6;
      } else if (match.phase === "roundEnd" || match.phase === "matchOver") {
        const loser = match.roundWinner >= 0 ? match.f[1 - match.roundWinner] : null;
        const winner = match.roundWinner >= 0 ? match.f[match.roundWinner] : null;
        if (match.phase === "matchOver" && winner) {
          // full-body hero shot, winner left of centre (the result card sits on the right)
          const k = Math.min(1, match.phaseT / 1.5);
          yawOff = (Math.sin(match.phaseT * 0.3) * 0.35 + 0.35 * -winner.facing) * k;
          dist = THREE.MathUtils.lerp(dist, 4.6, k);
          h = THREE.MathUtils.lerp(h, 1.25, k);
          ly = THREE.MathUtils.lerp(1.05, 1.0, k);
          const right = new THREE.Vector3(Math.cos(yawOff), 0, -Math.sin(yawOff));
          lx = winner.x + right.x * 0.95 * k;
        } else if (loser && match.phaseT < 2.2) {
          const k = Math.min(1, match.phaseT / 0.8);
          lx = THREE.MathUtils.lerp(mid, loser.x, k * 0.7);
          ly = THREE.MathUtils.lerp(1.05, 0.7, k);
          dist = THREE.MathUtils.lerp(dist, 3.6, k);
          h = THREE.MathUtils.lerp(h, 1.1, k);
          yawOff = 0.25 * k * -loser.facing;
        }
      }
      wantLook.set(lx, ly, 0);
      wantPos.set(lx + Math.sin(yawOff) * dist, h, Math.cos(yawOff) * dist);
    } else return;
    const k = 1 - Math.exp(-dt * (showcase ? 2.2 : 5.5));
    cam.pos.lerp(wantPos, k);
    cam.look.lerp(wantLook, k);
    camera.position.copy(cam.pos);
    if (shakeA > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shakeA * 0.22;
      camera.position.y += (Math.random() - 0.5) * shakeA * 0.16;
      shakeA *= Math.exp(-dt * 9);
    }
    camera.lookAt(cam.look);
  }
  const shake = (a) => (shakeA = Math.max(shakeA, a));
  const screenFlash = (a, c = "#ffffff") => {
    flashA = Math.max(flashA, a);
    flashC.set(c);
  };

  /* ------------------------------------------------------------ events → fx / audio */
  const SPECIAL_COL = (side) => FIGHTER_BY_ID[match.f[side].id].look.glow || "#ffffff";
  function handle(e) {
    const m = match;
    switch (e.type) {
      case "swing":
        audio.whoosh(e.kind === "kick" ? "kick" : "punch");
        break;
      case "hit": {
        const sp = e.kind === "special";
        const c = sp ? SPECIAL_COL(e.side) : e.heavy ? "#ffb347" : "#fff2c8";
        const z = 0.15;
        fx.flash(e.x, e.y, z, c, sp ? 1.6 : e.heavy ? 1.15 : 0.75, sp ? 0.24 : 0.15);
        fx.burst(e.x, e.y, z, c, sp ? 46 : e.heavy ? 30 : 16, sp ? 6 : e.heavy ? 5 : 3.6, 0.42, sp ? 0.09 : 0.06);
        fx.light(e.x, e.y, z, c, sp ? 18 : e.heavy ? 11 : 6);
        shake(sp ? 0.9 : e.heavy ? 0.6 : 0.22);
        if (sp || e.heavy) screenFlash(sp ? 0.1 : 0.05, c);
        audio.hit(e.heavy, sp);
        if (e.heavy || e.combo >= 3) {
          audio.swell(sp ? 1.4 : 0.8);
          arena?.hype(0.8);
        }
        break;
      }
      case "block":
        fx.flash(e.x, e.y, 0.15, "#9fd0ff", e.special ? 1.0 : 0.6, 0.12);
        fx.burst(e.x, e.y, 0.15, "#bfe0ff", e.special ? 22 : 9, 3, 0.3, 0.05);
        shake(e.special ? 0.35 : 0.1);
        audio.block();
        break;
      case "special": {
        audio.special(e.move);
        const F = m.f[e.side];
        if (e.move === "quakeSlam") fx.puff(F.x, 0.1, 0, "#8a7a6a", 3, 0.6, 0.8, 0.3);
        break;
      }
      case "boltMark":
        fx.telegraph(e.x, SPECIAL_COL(e.side), 0.42);
        break;
      case "bolt":
        fx.bolt(e.x, SPECIAL_COL(e.side));
        shake(1.0);
        screenFlash(0.25, "#cfe8ff");
        audio.thunder();
        arena?.hype(1);
        break;
      case "teleport":
        fx.puff(e.from, 1.0, 0, "#2a2238", 7, 0.7, 0.9, 0.55, 0.7);
        fx.puff(e.to, 1.0, 0, "#2a2238", 6, 0.6, 0.8, 0.5, 0.6);
        fx.burst(e.to, 1.1, 0, "#7b5cff", 24, 3, 0.4, 0.06, 0);
        audio.teleport();
        break;
      case "projectile":
        fx.flash(e.x, e.y, 0.1, SPECIAL_COL(e.side), 1.1, 0.2);
        break;
      case "clash":
        fx.flash(e.x, e.y, 0.1, "#ffffff", 2.2, 0.3);
        fx.burst(e.x, e.y, 0.1, "#bfe0ff", 60, 6, 0.6, 0.08, -3);
        shake(0.7);
        audio.clash();
        break;
      case "armor":
        fx.flash(e.x, e.y, 0.15, "#ffd36a", 1.0, 0.16);
        audio.block();
        break;
      case "dodge":
        audio.dodge();
        break;
      case "jump":
        audio.jump();
        break;
      case "land": {
        const F = m.f[e.side];
        fx.puff(F.x, 0.05, 0, arenaId === "temple" ? "#b8a088" : "#8a8a92", e.hard ? 6 : 2, e.hard ? 0.8 : 0.35, e.hard ? 0.9 : 0.4, e.hard ? 0.4 : 0.22);
        if (e.hard) {
          fx.ring(F.x, 0, "#ffffff", 1.4, 0.4);
          shake(0.35);
        }
        audio.land(e.hard);
        break;
      }
      case "ko":
        slow = { t: 1.15, scale: 0.28 };
        screenFlash(0.35, "#ffffff");
        shake(1.0);
        audio.ko();
        audio.swell(2);
        arena?.hype(1);
        break;
      case "round":
        audio.bell(1);
        break;
      case "fight":
        audio.bell(1);
        break;
      case "matchOver":
        audio.bell(3);
        break;
      default:
        break;
    }
    for (const l of listeners) l(e, m);
  }

  /** Continuous special-move effects driven from the fighters' states. */
  function specialFx(dt) {
    const v = new THREE.Vector3();
    for (let s = 0; s < 2; s++) {
      const F = match.f[s];
      const V = views[s];
      if (F.state !== "attack" || F.move?.kind !== "special") continue;
      const mv = F.move;
      const T = F.stats.tempo;
      const t = F.mt / T;
      const col = FIGHTER_BY_ID[F.id].look.glow;
      const n = Math.max(1, Math.round(dt * 120));
      if (mv.id === "dragonWave" && t < mv.startup) {
        V.bonePos("hand_l", v);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * 6.28;
          const r = 0.4 + Math.random() * 0.3;
          fx.emit(v.x + Math.cos(a) * r, v.y + Math.sin(a) * r, v.z, -Math.cos(a) * r * 3, -Math.sin(a) * r * 3, 0, col, 0.3, 0.07);
        }
      } else if (mv.id === "infernoKick" && t > mv.startup * 0.3 && t < mv.startup + mv.active) {
        V.bonePos("foot_r", v);
        for (let i = 0; i < n * 2; i++) fx.emit(v.x, v.y, v.z, (Math.random() - 0.5) * 1.5, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 0.6, i % 2 ? "#ff7a1a" : "#ffd23c", 0.4, 0.13, 1.5, 1);
      } else if (mv.id === "lightningRush" && t < mv.startup + mv.active) {
        V.bonePos("spine_02", v);
        for (let i = 0; i < n * 2; i++) fx.emit(v.x + (Math.random() - 0.5) * 0.5, v.y + (Math.random() - 0.5) * 1.1, v.z + (Math.random() - 0.5) * 0.3, -F.facing * 2, (Math.random() - 0.5) * 2, 0, col, 0.25, 0.06);
      } else if (mv.id === "shadowStep" && t < mv.startup) {
        V.bonePos("spine_02", v);
        if (Math.random() < 0.5) fx.puff(F.x, 0.9, 0, "#1e1828", 1, 0.5, 0.5, 0.35, 0.5);
      } else if (mv.id === "thunderStrike" && t < mv.startup + 0.1) {
        V.bonePos("hand_r", v);
        for (let i = 0; i < n; i++) fx.emit(v.x, v.y, v.z, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1, col, 0.18, 0.05);
      } else if (mv.id === "quakeSlam") {
        const sk = special[s];
        if (sk.seq !== F.moveSeq) {
          sk.seq = F.moveSeq;
          sk.done = false;
        }
        if (!sk.done && t >= mv.startup) {
          sk.done = true;
          const x = F.x + F.facing * 0.55;
          fx.ring(x, 0, "#ffd36a", 2.8, 0.55);
          fx.ring(x, 0, "#ffffff", 1.6, 0.35);
          fx.puff(x, 0.1, 0, "#9a8a74", 9, 1.6, 1.1, 0.45, 1.1);
          fx.burst(x, 0.1, 0, "#d8c8a8", 40, 4, 0.7, 0.06, -12, 0.6);
          shake(1.0);
        }
      }
    }
  }

  /* ------------------------------------------------------------ frame */
  function advanceSim(dt) {
    if (!match || paused) return 0;
    let scale = 1;
    if (slow.t > 0) {
      slow.t -= dt;
      scale = slow.t > 0.3 ? slow.scale : THREE.MathUtils.lerp(1, slow.scale, Math.max(0, slow.t) / 0.3);
    }
    acc += dt * scale;
    let n = 0;
    while (acc >= SIM_DT && n < 6) {
      prev = match.f.map((F) => ({ x: F.x, y: F.y }));
      const before = match.round;
      step(match, session.inputs(match, SIM_DT));
      for (const e of match.events) handle(e);
      match.events.length = 0;
      if (match.round !== before) {
        fx.clear();
        for (let i = 0; i < 2; i++) views[i].reset(match.f[i]);
        prev = match.f.map((F) => ({ x: F.x, y: F.y }));
      }
      acc -= SIM_DT;
      n++;
    }
    if (n === 6) acc = 0;
    return scale;
  }

  function render(dt) {
    let scale = 1;
    if (match && !showcase) {
      scale = advanceSim(dt);
      const alpha = Math.min(1, acc / SIM_DT);
      const pdt = paused ? 0 : dt * scale;
      for (let i = 0; i < 2; i++) views[i].update(match.f[i], match, pdt, prev[i], alpha);
      if (!paused) {
        fx.syncOrbs(match.projectiles, match.projectiles[0] ? SPECIAL_COL(match.projectiles[0].owner) : "#fff", pdt);
        specialFx(pdt);
      }
    } else if (showcase) {
      for (const s of showcase.slots) {
        s.F.st += dt;
        s.view.update(s.F, showcase.stub, dt, null, 1);
      }
    }
    if (!paused) fx.update(dt * scale);
    clock += dt;
    arena?.update(clock, dt);
    directCamera(dt);
    flashA = Math.max(0, flashA - dt * 3.5);
    if (grade) {
      grade.uniforms.uFlash.value = flashA;
      grade.uniforms.uFlashC.value.copy(flashC);
    }
    for (const l of frameListeners) l(match, dt);
    if (composer) composer.render();
    else renderer.render(scene, camera);
    // performance watchdog (fights only)
    if (match && !paused && q === "high" && !test) {
      fpsWin.t += dt;
      fpsWin.n++;
      if (fpsWin.t >= 3) {
        const fps = fpsWin.n / fpsWin.t;
        fpsWin = { t: 0, n: 0, low: fps < 40 ? fpsWin.low + 1 : 0 };
        if (fpsWin.low >= 2) {
          setQuality("medium");
          for (const l of listeners) l({ type: "quality", quality: "medium" }, match);
        }
      }
    }
  }

  function loop(t) {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 1 / 60;
    last = t;
    render(dt);
  }
  if (!test) raf = requestAnimationFrame(loop);

  /* ------------------------------------------------------------ showcase (menus) */
  function fakeFighter(id, x, facing, state = "idle") {
    const d = FIGHTER_BY_ID[id];
    return { id, x, y: 0, vx: 0, facing, state, st: Math.random() * 2, hitSeq: 0, stats: d.stats, move: null, lastHit: null };
  }
  /**
   * spec: { arena, fighters: [{ id, alt?, boss?, x, facing, state? }], look:[x,y,z], dist, height, yaw, orbit }
   */
  function setShowcase(spec) {
    if (!assets) return;
    if (!spec) {
      showcase = null;
      return;
    }
    if (spec.arena) setArena(spec.arena);
    const slots = spec.fighters.map((f) => {
      const view = viewFor(f.id, f.alt, f.boss);
      const prevSlot = showcase?.slots.find((s) => s.view === view);
      const F = prevSlot && prevSlot.F.state === (f.state || "idle") ? prevSlot.F : fakeFighter(f.id, f.x, f.facing, f.state);
      F.x = f.x;
      F.facing = f.facing;
      if (!prevSlot) view.reset(F);
      return { view, F };
    });
    setViews(slots.map((s) => s.view));
    match = null;
    session = null;
    views = [];
    fx.clear();
    const first = !showcase;
    showcase = { slots, stub: { round: 2, phaseT: 9 }, look: spec.look || [0, 1.1, 0], dist: spec.dist ?? 5, height: spec.height ?? 1.5, yaw: spec.yaw ?? 0, orbit: spec.orbit ?? 0 };
    if (first) {
      cam.t = 0;
    }
  }

  /* ------------------------------------------------------------ match control */
  function startMatch(m, sess, { boss = [false, false] } = {}) {
    if (!assets || disposed) return false; // not loaded yet (e.g. a hot remount) — never build rigs from null
    showcase = null;
    setArena(m.cfg.arena);
    const alt = m.cfg.alt || [false, false];
    views = m.f.map((F, i) => viewFor(F.id, alt[i], boss[i]));
    if (views[0] === views[1]) views[1] = viewFor(m.f[1].id, !alt[1], boss[1]);
    setViews(views);
    match = m;
    session = sess;
    acc = 0;
    paused = false;
    slow = { t: 0, scale: 1 };
    fx.clear();
    for (let i = 0; i < 2; i++) views[i].reset(m.f[i]);
    prev = m.f.map((F) => ({ x: F.x, y: F.y }));
    cam.pos.set(0, 2.2, 8.5);
    cam.look.set(0, 1.1, 0);
    // compile every material now — incl. pooled (hidden) FX — so the first hit doesn't hitch
    fx.setAllVisible(true);
    try {
      // with post-processing the scene renders into a linear HDR target: compile those
      // shader variants (output colour space / tone mapping depend on the target)
      if (composer) renderer.setRenderTarget(composer.readBuffer);
      renderer.compile(scene, camera);
    } catch {
      /* compile is an optimisation */
    } finally {
      renderer.setRenderTarget(null);
    }
    fx.setAllVisible(false);
    fx.clear();
  }
  function stopMatch() {
    match = null;
    session = null;
    views = [];
    fx.clear();
  }

  /* ------------------------------------------------------------ portraits */
  /** Head-and-shoulders portraits for the select cards (offscreen renderer, then freed). */
  async function portraits(ids, { w = 240, h = 280 } = {}) {
    await ready;
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    r.setSize(w, h, false);
    r.setPixelRatio(1);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const s = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    const env = pm.fromScene(new RoomEnvironment(), 0.04);
    s.environment = env.texture;
    s.environmentIntensity = 0.7;
    const k = new THREE.DirectionalLight("#fff4e8", 3.2);
    k.position.set(-1.5, 2.4, 2.5);
    const rl = new THREE.DirectionalLight("#9fc8ff", 3);
    rl.position.set(2, 2.2, -2);
    s.add(k, rl, new THREE.HemisphereLight("#9aa0c0", "#202020", 0.6));
    const c = new THREE.PerspectiveCamera(24, w / h, 0.05, 20);
    const out = {};
    for (const id of ids) {
      const v = createFighterView(assets, FIGHTER_BY_ID[id], {});
      const F = { id, x: 0, y: 0, vx: 0, facing: 1, state: "idle", st: 0.4, hitSeq: 0, stats: FIGHTER_BY_ID[id].stats, move: null };
      v.reset(F);
      v.update(F, { round: 2, phaseT: 9 }, 0.016, null, 1);
      v.root.rotation.set(0, 0.32, 0);
      v.root.scale.set(1, 1, 1);
      s.add(v.root);
      v.root.updateMatrixWorld(true);
      const head = v.bonePos("Head", new THREE.Vector3());
      c.position.set(head.x + 0.32, head.y - 0.02, head.z + 1.55);
      c.lookAt(head.x + 0.02, head.y - 0.12, head.z);
      r.render(s, c);
      out[id] = r.domElement.toDataURL("image/png");
      s.remove(v.root);
      v.dispose();
    }
    env.dispose();
    pm.dispose();
    r.dispose();
    r.forceContextLoss();
    return out;
  }

  /**
   * Shader warm-up (loading screen): every fighter's materials + every pooled
   * effect are compiled for the real render path and awaited, so the GPU driver
   * never stalls the first hit / special of a fight. All arenas use the same
   * light count, so these programs are valid everywhere.
   */
  async function warmup() {
    await ready;
    const stage = new THREE.Group();
    for (const f of Object.keys(FIGHTER_BY_ID)) {
      const v = viewFor(f, false, false);
      if (!active.includes(v)) stage.add(v.root);
    }
    const parked = [...stage.children];
    scene.add(stage);
    fx.setAllVisible(true);
    try {
      if (composer) renderer.setRenderTarget(composer.readBuffer);
      if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
      else renderer.compile(scene, camera);
    } catch {
      /* warm-up is an optimisation */
    } finally {
      renderer.setRenderTarget(null);
      fx.setAllVisible(false);
      for (const r of parked) stage.remove(r);
      scene.remove(stage);
    }
  }

  return {
    ready,
    warmup,
    renderer,
    scene,
    camera,
    fx,
    resize,
    setQuality,
    get quality() {
      return q;
    },
    setArena,
    setShowcase,
    startMatch,
    stopMatch,
    portraits,
    setPaused(v) {
      paused = !!v;
    },
    get paused() {
      return paused;
    },
    get match() {
      return match;
    },
    get views() {
      return views;
    },
    onEvent(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onFrame(fn) {
      frameListeners.add(fn);
      return () => frameListeners.delete(fn);
    },
    /** Test hook: run the real rAF loop (fps measurement in test mode). */
    startLoop() {
      if (!raf && !disposed) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    },
    /** Test hook: render n frames of dt (no rAF in test mode). */
    advance(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) render(dt);
    },
    info() {
      return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, programs: renderer.info.programs?.length };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      listeners.clear();
      frameListeners.clear();
      for (const v of viewCache.values()) v.dispose();
      viewCache.clear();
      if (arena) arena.dispose();
      fx.dispose();
      composer?.passes.forEach((p) => p.dispose?.());
      envRT.dispose();
      pmrem.dispose();
      disposeTextures();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    },
  };
}
