/**
 * The 3D battle stage: renderer, post-processing, camera director, the
 * current location + monster + effects, and the choreography the React layer
 * calls while it replays combat events (card cast → impact → reaction,
 * monster windup → strike → recoil, boss phase, death).
 *
 * Quality presets (High/Medium/Low, plus Auto which steps down when frames
 * run long) set pixel ratio, MSAA, shadow maps, bloom, light/particle budgets
 * and fur shells. Plain Three.js, own rAF loop, everything disposed on unmount.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { loadEnvironment, loadRigs, setAnisotropy, disposeAssets } from "./assets.js";
import { buildEnvironment, disposeEnvShared } from "./environments.js";
import { buildMonster } from "./monsters.js";
import { createFx } from "./fx.js";
import { disposeSharedTextures } from "./materials.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export const QUALITY = {
  high: { pr: 2, scale: 1, msaa: 4, shadows: true, shadowSize: 2048, bloom: true, particles: 1400, lights: 4, fxLights: 3, fxScale: 1, aniso: 8 },
  medium: { pr: 1.25, scale: 0.85, msaa: 2, shadows: true, shadowSize: 1024, bloom: true, particles: 800, lights: 3, fxLights: 2, fxScale: 0.7, aniso: 4 },
  low: { pr: 1, scale: 0.7, msaa: 0, shadows: false, shadowSize: 512, bloom: false, particles: 350, lights: 2, fxLights: 1, fxScale: 0.4, aniso: 2 },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFlash: { value: new THREE.Vector4(0, 0, 0, 0) },
    uVig: { value: 0.42 },
    uSat: { value: 0.88 },
    uLift: { value: new THREE.Vector3(0.004, 0.003, 0.008) },
    uGain: { value: new THREE.Vector3(1.0, 0.98, 1.02) },
    uBox: { value: 0 },
    uGrain: { value: 0.016 },
    uBright: { value: 1 },
    uDesat: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uVig, uSat, uBox, uGrain, uBright, uDesat; uniform vec4 uFlash;
    uniform vec3 uLift, uGain; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      // very slight chromatic fringe toward the edges
      vec2 dc = (uv - 0.5) * 0.0016;
      vec3 c = vec3(texture2D(tDiffuse, uv + dc).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dc).b);
      c *= uBright;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat * (1.0 - uDesat));
      c = c * uGain + uLift * (1.0 - c);
      // split toning: cool shadows, warm highlights
      c += vec3(-0.004, 0.0, 0.012) * (1.0 - smoothstep(0.0, 0.35, l)) + vec3(0.012, 0.005, -0.008) * smoothstep(0.5, 1.0, l);
      float d = length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0));
      c *= 1.0 - uVig * smoothstep(0.35, 1.05, d);
      c = mix(c, uFlash.rgb, uFlash.a * (0.35 + 0.65 * smoothstep(0.2, 0.9, d)));
      c += (h(uv * uRes + fract(uTime) * 91.7) - 0.5) * uGrain;
      float bar = step(uv.y, uBox * 0.11) + step(1.0 - uBox * 0.11, uv.y);
      c = mix(c, vec3(0.0), bar);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

let acquireCount = 0;
let releaseTimer = null;

export function createWorld(container, opts = {}) {
  acquireCount++;
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  const manual = !!opts.manual;
  let qualityName = opts.quality === "auto" || !opts.quality ? "high" : opts.quality;
  let autoQuality = opts.quality === "auto" || !opts.quality;
  let Q = QUALITY[qualityName];
  const canvas = document.createElement("canvas");
  canvas.className = "dos-canvas";
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.preserve, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = Q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  setAnisotropy(Math.min(Q.aniso, renderer.capabilities.getMaxAnisotropy()));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020203);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 160);
  camera.position.set(0, 1.6, 4.8);

  let W = 2;
  let H = 2;
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: Q.msaa });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 0.86);
  const grade = new ShaderPass(GradeShader);
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(grade);
  composer.addPass(output);
  bloom.enabled = Q.bloom;
  // ACES in the OutputPass; grade works in linear HDR before it
  const G = grade.uniforms;

  let fx = createFx(scene, camera, { particles: Q.particles, lights: Q.fxLights, scale: Q.fxScale });
  let env = null;
  let monster = null;
  let rigs = null;
  let envMap = null;
  let disposed = false;
  let loadSeq = 0;
  let shake = opts.shake ?? true;
  let brightness = opts.brightness ?? 1;
  const listeners = { quality: opts.onQuality || (() => {}) };

  /* ---------------------------------------------------------------- camera director */
  const cam = {
    base: V(0, 1.6, 4.8),
    target: V(0, 1.3, 0),
    look: V(0, 1.3, 0),
    pos: V(0, 1.6, 4.8),
    push: 0,
    pushV: 0,
    shakeT: 0,
    shakeA: 0,
    shot: null, // scripted shot { t, dur, from, to, fromL, toL, res }
    orbit: 0,
    menu: false,
  };
  function frameMonster() {
    const h = monster?.height || 1.8;
    const k = Math.max(1, h / 1.9);
    cam.base.set(0.12, 0.8 + h * 0.3, 2.7 + h * 0.92);
    cam.target.set(0, h * 0.42, 0);
    if (cam.menu) {
      cam.base.set(-0.2, 1.3 + h * 0.12, 3.1 + h * 0.6);
      cam.target.set(-1.15, h * 0.52, 0);
    }
    void k;
  }
  function kick(amount) {
    if (!shake) return;
    cam.shakeA = Math.min(0.06, cam.shakeA + amount);
  }
  function pushIn(amount) {
    cam.pushV += amount;
  }

  function shot(from, to, fromL, toL, dur) {
    return new Promise((res) => {
      cam.shot = { t: 0, dur, from, to, fromL, toL, res };
    });
  }

  /* ---------------------------------------------------------------- loading */
  async function ensureCore() {
    if (!envMap) {
      envMap = await loadEnvironment(renderer);
      scene.environment = envMap;
      scene.environmentIntensity = 0.32;
    }
    if (!rigs) rigs = await loadRigs();
  }

  async function load(envKind, monsterKey, { menu = false, onProgress } = {}) {
    const seq = ++loadSeq;
    onProgress?.(0.05);
    await ensureCore();
    if (disposed || seq !== loadSeq) return false;
    onProgress?.(0.3);
    const [newEnv, newMon] = await Promise.all([
      buildEnvironment(envKind, { quality: qualityName, shadows: Q.shadows, shadowSize: Q.shadowSize, lightBudget: Q.lights, fxScale: Q.fxScale }).then((e) => {
        onProgress?.(0.65);
        return e;
      }),
      buildMonster(monsterKey, { rigs, quality: qualityName }),
    ]);
    if (disposed || seq !== loadSeq) {
      newEnv.dispose();
      newMon.dispose();
      return false;
    }
    onProgress?.(0.9);
    if (env) env.dispose();
    if (monster) monster.dispose();
    fx.clear();
    env = newEnv;
    monster = newMon;
    scene.add(env.group);
    scene.add(monster.root);
    scene.fog = env.fog;
    scene.background = env.background || new THREE.Color(0x000000);
    if (env.keyLight) env.keyLight.target.position.set(0, monster.height * 0.55, 0);
    if (env.rimLight) env.rimLight.target.position.set(0, monster.height * 0.6, 0);
    cam.menu = menu;
    frameMonster();
    cam.pos.copy(cam.base);
    cam.look.copy(cam.target);
    cam.shot = null;
    G.uDesat.value = 0;
    G.uBox.value = 0;
    // compile shaders now so the first frames of the fight don't hitch
    try {
      renderer.compile(scene, camera);
    } catch {
      /* some drivers reject compile() before first render — harmless */
    }
    onProgress?.(1);
    return true;
  }

  /* ---------------------------------------------------------------- effects choreography */
  const chest = () => (monster ? monster.chestPos(V()) : V(0, 1.3, 0));
  const head = () => (monster ? monster.headPos(V()) : V(0, 1.6, 0));
  const feet = () => V(0, 0.02, 0);
  const COLORS = {
    shadow: [0x8a4aff, 0x2a0a4a],
    blood: [0xff1a2a, 0x6a0008],
    crush: [0xf0e0c0, 0x8a7050],
    stake: [0xe8f0ff, 0x9ab0d0],
    drain: [0xff2a4a, 0x8a0020],
    blades: [0x9ad8ff, 0x4a7aff],
    fire: [0xff7a1a, 0xffd04a],
    doom: [0xa040ff, 0x1a0030],
    hex: [0xb050ff, 0x40108a],
    barrier: [0x7a9aff, 0x3a4aff],
    heal: [0x8aff9a, 0xffe08a],
    bone: [0xf0e8d0, 0xa09070],
    rage: [0xff3a1a, 0xffa040],
    pact: [0x9a3aff, 0x200030],
    eclipse: [0xb08aff, 0x3a1a6a],
  };

  /** Card leaves the hand: travel to the monster. Resolves at contact. */
  async function cast(kind, i = 0) {
    if (!monster) return;
    const [c1, c2] = COLORS[kind] || COLORS.shadow;
    const from = fx.fromPlayer(0, -0.3, -0.8);
    const to = chest();
    switch (kind) {
      case "shadow":
        return fx.bolt(from, to, c1, { dur: 0.42, arc: 0.5, size: 0.45, smokeTrail: 1, color2: c2 });
      case "stake":
        return fx.bolt(from, to, c1, { dur: 0.24, arc: 0.1, size: 0.28, trail: 2 });
      case "crush":
        return fx.bolt(from, to.clone().add(V(0, 0.15, 0)), c1, { dur: 0.32, arc: 0.9, size: 0.4, color2: c2 });
      case "drain":
        return fx.bolt(from, to, c1, { dur: 0.4, arc: 0.4, size: 0.38, color2: c2 });
      case "blades":
        return fx.bolt(fx.fromPlayer((i - 1) * 0.5, -0.1, -0.8), to.clone().add(V((i - 1) * 0.15, (i - 1) * 0.12, 0)), c1, { dur: 0.26, arc: 0.3, size: 0.3, color2: c2 });
      case "fire":
        return fx.bolt(from, to, c1, { dur: 0.5, arc: 0.6, size: 0.6, trail: 4, smokeTrail: 1, color2: c2 });
      case "doom": {
        fx.sigil(feet(), c1, { radius: 1.6, life: 2.6 });
        fx.sparks(feet().add(V(0, 0.1, 0)), 60, { color: c1, color2: 0x000000, speed: [0.2, 0.8], up: 1.2, life: [0.8, 1.6], size: [0.05, 0.12], drag: 1, jitter: 1.2 });
        await wait(0.85);
        fx.pillar(feet(), c1, { height: 9, radius: 1.1, life: 1.4 });
        return wait(0.18);
      }
      case "blood":
        return wait(0.08);
      default:
        return wait(0.05);
    }
  }

  /** The blow lands on the monster. power ≈ damage / 10. */
  function impact(kind, dmg, { blocked = 0, execute = false } = {}) {
    if (!monster) return;
    const [c1, c2] = COLORS[kind] || COLORS.shadow;
    const at = chest();
    const power = Math.min(2.4, 0.5 + dmg / 11);
    const toCam = camera.position.clone().sub(at).normalize();
    switch (kind) {
      case "blood":
        fx.slash(at, c1, { size: 1.1, tilt: 0.9, facing: camera.position, width: 0.28 });
        fx.slash(at.clone().add(V(0, -0.15, 0)), c2, { size: 1.0, tilt: 0.7, facing: camera.position, width: 0.12, life: 0.4 });
        fx.puff(at, 10, { color: 0x5a0006, speed: [0.3, 1.0], life: [0.6, 1.2], size: [0.25, 0.5], grow: 2.2, alpha: 0.55, drag: 2.5 });
        fx.sparks(at, 34, { color: 0xb0000c, color2: 0xff2030, speed: [1.2, 3.2], dir: toCam, cone: 0.9, grav: 6, life: [0.4, 0.9], size: [0.03, 0.07], drag: 0.8, floor: 0.02 });
        break;
      case "crush":
      case "execute":
        fx.puff(at, 16, { color: 0x4a3e30, speed: [0.6, 1.6], life: [0.8, 1.6], size: [0.35, 0.6], grow: 2.5, alpha: 0.55, drag: 2 });
        fx.sparks(at, 40, { color: 0xf0e4c8, color2: 0x9a8a70, speed: [2, 5], grav: 9, life: [0.6, 1.2], size: [0.04, 0.08], drag: 0.6, floor: 0.02 });
        fx.ring(feet().add(V(0, 0.03, 0)), 0xd8c0a0, 3.2, 0.6, { additive: false, opacity: 0.35 });
        fx.ring(at, 0xffffff, 1.6, 0.25, { up: toCam, opacity: 0.6 });
        fx.puff(feet(), 14, { color: 0x3a3228, speed: [1, 2.2], life: [0.9, 1.6], size: [0.4, 0.7], grow: 2, alpha: 0.5, drag: 2.5, dir: V(0, 0.2, 0), cone: 2 });
        kick(0.035);
        break;
      case "stake":
        fx.sparks(at, 46, { color: 0xffffff, color2: 0x9ac0ff, speed: [2, 6], dir: toCam.clone().negate(), cone: 1.2, life: [0.15, 0.45], size: [0.02, 0.05], drag: 2 });
        fx.ring(at, 0xcfe0ff, 1.0, 0.2, { up: toCam, opacity: 0.8 });
        break;
      case "fire":
        fx.sparks(at, 60, { color: 0xffa040, color2: 0xff3a10, speed: [1, 4], up: 0.8, life: [0.4, 1.2], size: [0.06, 0.16], drag: 1.6, jitter: 0.1 });
        fx.puff(at, 14, { color: 0x1a0a04, speed: [0.3, 1.0], up: 0.6, life: [1, 2], size: [0.4, 0.7], grow: 2.4, alpha: 0.6, drag: 1.6 });
        fx.ring(at, 0xff8a2a, 2.2, 0.4, { up: toCam });
        break;
      case "doom":
        fx.sparks(at, 120, { color: 0xc080ff, color2: 0xffffff, speed: [2, 7], life: [0.5, 1.4], size: [0.04, 0.12], drag: 1.2 });
        fx.puff(at, 26, { color: 0x10041a, speed: [0.8, 2.6], life: [1.2, 2.2], size: [0.6, 1.1], grow: 2.2, alpha: 0.7, drag: 1.4 });
        fx.ring(feet().add(V(0, 0.05, 0)), 0xa060ff, 6, 0.9);
        flash(0xc0a0ff, 0.55, 0.5);
        kick(0.05);
        break;
      default: {
        // shadow / drain / blades / bone & co
        fx.puff(at, 12, { color: kind === "drain" ? 0x2a0006 : 0x0a0412, speed: [0.4, 1.4], life: [0.6, 1.3], size: [0.35, 0.6], grow: 2.2, alpha: 0.7, drag: 2.2 });
        fx.sparks(at, 46, { color: c1, color2: c2, speed: [1.2, 4], life: [0.3, 0.8], size: [0.04, 0.1], drag: 2 });
        fx.ring(at, c1, 1.5, 0.35, { up: toCam });
      }
    }
    fx.flashLight(at.clone().add(toCam.clone().multiplyScalar(0.6)), c1, 22 * power, 0.3);
    monster.hit(blocked >= dmg ? 0.4 : power, Math.random() < 0.5 ? 1 : -1);
    if (blocked > 0) fx.sparks(at.clone().add(toCam.clone().multiplyScalar(0.3)), 20, { color: 0x9ad0ff, speed: [1, 3], life: [0.2, 0.4], size: [0.02, 0.05], drag: 3 });
    pushIn(-0.6 * power);
    if (execute) flash(0xff2030, 0.35, 0.4);
  }

  /** Effects that happen on the player's side (block, heal, buffs) or on the monster (debuffs). */
  function selfFx(kind) {
    const [c1, c2] = COLORS[kind] || COLORS.barrier;
    const p = fx.fromPlayer(0, -0.25, -1.1);
    switch (kind) {
      case "barrier":
        fx.barrier(c1, 1.4);
        fx.sparks(p, 30, { color: c1, color2: 0xffffff, speed: [0.3, 1.2], life: [0.5, 1.0], size: [0.02, 0.05], drag: 2, jitter: 0.6 });
        break;
      case "heal":
        for (let i = 0; i < 3; i++) fx.sparks(fx.fromPlayer((i - 1) * 0.6, -0.7, -1.4), 24, { color: c1, color2: c2, speed: [0.05, 0.25], up: 0.9, life: [0.9, 1.6], size: [0.03, 0.07], drag: 0.6, jitter: 0.35, fadeIn: 0.3 });
        flash(0x9affb0, 0.18, 0.7);
        break;
      case "bone":
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          fx.sparks(fx.fromPlayer(Math.cos(a) * 0.7, Math.sin(a) * 0.35 - 0.1, -1.3), 4, { color: 0xf0e8d0, speed: [0.05, 0.2], life: [0.7, 1.2], size: [0.04, 0.08], drag: 2 });
        }
        fx.barrier(0xd8ccb0, 1.0);
        break;
      case "rage":
        fx.sparks(p, 50, { color: c1, color2: c2, speed: [0.2, 1.2], up: 0.6, life: [0.6, 1.2], size: [0.03, 0.08], jitter: 0.8, drag: 1.4 });
        flash(0xff2a10, 0.3, 0.6);
        break;
      case "pact":
        fx.puff(p, 18, { color: 0x0a0010, speed: [0.2, 0.8], life: [0.8, 1.6], size: [0.4, 0.8], grow: 2, alpha: 0.7, drag: 2, jitter: 0.5 });
        fx.sparks(p, 30, { color: c1, speed: [0.3, 1.0], life: [0.6, 1.2], size: [0.03, 0.06], drag: 2, jitter: 0.6 });
        flash(0x6a20c0, 0.3, 0.5);
        break;
      case "eclipse":
        fx.ring(fx.fromPlayer(0, 0, -2.2), c1, 2.2, 0.9, { up: camera.getWorldDirection(V()).negate() });
        flash(0x1a0a3a, 0.45, 0.8);
        break;
      case "hex": {
        fx.sigil(feet(), c1, { radius: 1.2, life: 1.6, spin: 1.2 });
        const at = chest();
        for (let i = 0; i < 2; i++) fx.sparks(at, 30, { color: c1, color2: c2, speed: [0.3, 0.8], life: [0.6, 1.2], size: [0.03, 0.07], jitter: 0.6, drag: 1, up: 0.3 });
        monster?.hit(0.3, 1);
        break;
      }
      default:
    }
  }

  /** Monster ability. Returns { impact, done } promises. */
  function enemyAct(move) {
    if (!monster) return { impact: Promise.resolve(), done: Promise.resolve() };
    const r = monster.act(move.anim);
    pushIn(0.35);
    r.impact.then(() => enemyFx(move.fx, move));
    return r;
  }

  function enemyFx(kind, move) {
    if (!monster) return;
    const from = monster.handPos ? monster.handPos("r", V()) : chest();
    const near = fx.fromPlayer(0, 0, -1.2);
    switch (kind) {
      case "slash":
      case "scythe":
        fx.slash(near, kind === "scythe" ? 0xa0c8ff : 0xe8e8f0, { size: 1.4, tilt: -0.8 + Math.random() * 0.4, facing: camera.position.clone().add(camera.getWorldDirection(V()).multiplyScalar(-1)), width: 0.2, flip: Math.random() < 0.5 ? 1 : -1 });
        kick(0.025);
        break;
      case "claw":
        for (let i = 0; i < 3; i++) fx.slash(near.clone().add(V((i - 1) * 0.14, 0, 0)), 0xff3a3a, { size: 0.9, tilt: -1.2, width: 0.06, facing: camera.position.clone().add(camera.getWorldDirection(V()).multiplyScalar(-1)), life: 0.28 });
        kick(0.02);
        break;
      case "quake":
        fx.ring(feet().add(V(0, 0.04, 0)), 0xc8b090, 7, 0.9, { additive: false, opacity: 0.4 });
        fx.puff(feet(), 26, { color: 0x3a3026, speed: [1.5, 3.5], life: [1, 2], size: [0.5, 0.9], grow: 2, alpha: 0.5, drag: 1.8, dir: V(0, 0.15, 1), cone: 1.6 });
        fx.sparks(feet(), 40, { color: 0xd8c8a8, speed: [2, 5], grav: 9, up: 2, life: [0.6, 1.2], size: [0.03, 0.07], floor: 0.02 });
        kick(0.06);
        break;
      case "bolt":
      case "fire":
      case "drain":
      case "shadow":
      case "doom": {
        const c = kind === "fire" ? 0xff6a1a : kind === "drain" ? 0xff1a3a : kind === "bolt" && monster.key === "witch" ? 0xff1a3a : 0x9a5aff;
        fx.bolt(from, near, c, { dur: 0.32, arc: 0.3, size: kind === "fire" ? 0.7 : 0.45, trail: 3, smokeTrail: kind === "fire" || kind === "shadow" ? 1 : 0 }).then(() => {
          fx.sparks(near, 30, { color: c, speed: [0.5, 2], life: [0.2, 0.5], size: [0.03, 0.07], drag: 2 });
          if (kind === "drain") fx.bolt(near, chest(), 0xff2a4a, { dur: 0.5, arc: 0.2, size: 0.3 });
        });
        kick(0.02);
        break;
      }
      case "hex":
        fx.sparks(head(), 40, { color: 0xb050ff, color2: 0x30106a, speed: [0.5, 1.5], life: [0.6, 1.2], size: [0.03, 0.07], drag: 1 });
        fx.sigil(feet(), 0xb050ff, { radius: 1.3, life: 1.6, spin: -1.2 });
        break;
      case "shield":
        fx.ring(chest(), 0x8ad0ff, 1.6, 0.6, { up: camera.position.clone().sub(chest()).normalize() });
        fx.sparks(chest(), 30, { color: 0x8ad0ff, speed: [0.2, 0.8], life: [0.5, 1], size: [0.02, 0.05], jitter: 0.6, drag: 1.5 });
        break;
      case "howl":
      case "roar":
        fx.ring(head(), monster.key === "demon" ? 0xff6a2a : 0x9aa8c8, 3.2, 0.8, { up: camera.position.clone().sub(head()).normalize(), additive: true, opacity: 0.4 });
        kick(0.03);
        break;
      case "blood":
        fx.sparks(head(), 30, { color: 0x8a0010, speed: [0.3, 1.2], grav: 5, life: [0.6, 1.1], size: [0.03, 0.06], floor: 0.02 });
        break;
      case "dust":
        fx.puff(chest(), 10, { color: 0x6a5e50, speed: [0.3, 0.8], life: [0.8, 1.4], size: [0.3, 0.5], grow: 2, alpha: 0.4, drag: 2 });
        break;
      default:
    }
    void move;
  }

  function flash(color, amount = 0.4, dur = 0.4) {
    flashState.color.set(color);
    flashState.a = Math.max(flashState.a, amount);
    flashState.decay = amount / Math.max(0.05, dur);
  }
  const flashState = { color: new THREE.Color(), a: 0, decay: 1 };

  async function bossIntro() {
    if (!monster) return;
    const h = monster.height;
    G.uBox.value = 1;
    await shot(V(-1.6, 0.35, 2.2), V(-0.6, h * 0.55, 1.9 + h * 0.4), V(0, h * 0.3, 0), V(0, h * 0.82, 0), 2.6);
    await shot(V(-0.6, h * 0.55, 1.9 + h * 0.4), cam.base.clone(), V(0, h * 0.82, 0), cam.target.clone(), 1.0);
    G.uBox.value = 0;
  }

  async function stageShot(n) {
    if (!monster) return;
    monster.setStage(n);
    const h = monster.height;
    flash(monster.key === "demon" ? 0xff4a1a : monster.key === "guardian" ? 0x3ad8ff : 0x8a4aff, 0.35, 0.9);
    kick(0.03);
    G.uBox.value = 1;
    await shot(cam.pos.clone(), V(0.5, h * 0.75, 1.6 + h * 0.35), cam.look.clone(), V(0, h * 0.85, 0), 0.9);
    await wait(0.9);
    await shot(V(0.5, h * 0.75, 1.6 + h * 0.35), cam.base.clone(), V(0, h * 0.85, 0), cam.target.clone(), 0.9);
    G.uBox.value = 0;
  }

  async function monsterDie() {
    if (!monster) return;
    const p = monster.die();
    pushIn(0.4);
    await wait(0.4);
    fx.puff(feet().add(V(0, 0.3, 0)), 20, { color: 0x15100c, speed: [0.5, 1.6], life: [1.2, 2.2], size: [0.6, 1.0], grow: 2, alpha: 0.5, drag: 2, dir: V(0, 0.2, 1), cone: 2 });
    await p;
  }

  function playerHurt(dmg) {
    kick(Math.min(0.05, 0.01 + dmg * 0.002));
  }

  /* ---------------------------------------------------------------- frame */
  const clock = { t: 0, last: performance.now() };
  const perf = { acc: 0, n: 0, since: 0, cooldown: 4 };
  let raf = 0;
  let running = true;

  function step(dt) {
    clock.t += dt;
    const t = clock.t;
    // camera
    if (cam.shot) {
      const S = cam.shot;
      S.t += dt;
      const k = Math.min(1, S.t / S.dur);
      const e = k * k * (3 - 2 * k);
      cam.pos.lerpVectors(S.from, S.to, e);
      cam.look.lerpVectors(S.fromL, S.toL, e);
      if (k >= 1) {
        cam.shot = null;
        S.res();
      }
    } else {
      cam.pushV += (-cam.push * 30 - cam.pushV * 8) * dt;
      cam.push += cam.pushV * dt;
      const orbit = cam.menu ? Math.sin(t * 0.08) * 0.6 : 0;
      const sway = V(Math.sin(t * 0.31) * 0.05 + orbit, Math.sin(t * 0.47) * 0.03, Math.sin(t * 0.23) * 0.04);
      const dir = cam.target.clone().sub(cam.base).normalize();
      const want = cam.base.clone().add(sway).addScaledVector(dir, cam.push);
      cam.pos.lerp(want, Math.min(1, dt * 4));
      cam.look.lerp(cam.target, Math.min(1, dt * 4));
    }
    camera.position.copy(cam.pos);
    if (cam.shakeA > 0.0005) {
      camera.position.x += (Math.random() - 0.5) * cam.shakeA;
      camera.position.y += (Math.random() - 0.5) * cam.shakeA;
      cam.shakeA *= Math.exp(-dt * 9);
    }
    camera.lookAt(cam.look);
    if (monster) monster.update(dt, camera.position);
    env?.update(dt, t, camera);
    fx.update(dt);
    // flash
    flashState.a = Math.max(0, flashState.a - flashState.decay * dt);
    G.uFlash.value.set(flashState.color.r, flashState.color.g, flashState.color.b, flashState.a);
    G.uTime.value = t;
    G.uBright.value = brightness;
  }

  function render() {
    composer.render();
  }

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0, (now - clock.last) / 1000));
    clock.last = now;
    if (document.hidden) return;
    const t0 = performance.now();
    step(dt);
    render();
    // auto quality: average real frame interval while a battle is shown
    if (autoQuality && monster && !cam.menu) {
      perf.acc += dt;
      perf.n++;
      perf.since += dt;
      if (perf.since > perf.cooldown && perf.n > 60) {
        const avg = perf.acc / perf.n;
        perf.acc = 0;
        perf.n = 0;
        perf.since = 0;
        perf.cooldown = 4;
        if (avg > 0.031 && qualityName !== "low") {
          applyQuality(qualityName === "high" ? "medium" : "low");
          listeners.quality(qualityName);
        }
      }
    }
    void t0;
  }
  if (!manual) raf = requestAnimationFrame(loop);

  function applyQuality(name) {
    qualityName = name;
    Q = QUALITY[name];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr) * Q.scale);
    bloom.enabled = Q.bloom;
    rt.samples = Q.msaa;
    composer.renderTarget1.samples = Q.msaa;
    composer.renderTarget2.samples = Q.msaa;
    if (renderer.shadowMap.enabled !== Q.shadows) {
      renderer.shadowMap.enabled = Q.shadows;
      scene.traverse((o) => {
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
      });
    }
    resize(W, H);
  }

  function resize(w, h) {
    W = Math.max(2, w | 0);
    H = Math.max(2, h | 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr) * Q.scale);
    renderer.setSize(W, H, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(W, H);
    bloom.resolution.set(W / 2, H / 2);
    camera.aspect = W / H;
    // keep the monster framed on tall/narrow screens: widen the vertical FOV
    camera.fov = W / H < 1 ? 36 + (1 - W / H) * 26 : 36;
    camera.updateProjectionMatrix();
    G.uRes.value.set(W, H);
    fx.setScale(H * renderer.getPixelRatio());
  }

  function project(p) {
    const v = p.clone().project(camera);
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, behind: v.z > 1 };
  }

  function dispose() {
    disposed = true;
    running = false;
    cancelAnimationFrame(raf);
    fx.dispose();
    env?.dispose();
    monster?.dispose();
    env = null;
    monster = null;
    composer.dispose?.();
    bloom.dispose();
    rt.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    canvas.remove();
    acquireCount--;
    if (acquireCount <= 0) {
      // StrictMode remounts immediately — keep caches for a moment
      releaseTimer = setTimeout(() => {
        if (acquireCount <= 0) {
          disposeAssets();
          disposeEnvShared();
          disposeSharedTextures();
        }
      }, 1500);
    }
  }

  const api = {
    renderer,
    scene,
    camera,
    load,
    cast,
    impact,
    selfFx,
    enemyAct,
    enemyFx,
    bossIntro,
    stageShot,
    monsterDie,
    playerHurt,
    flash,
    kick,
    project,
    resize,
    dispose,
    step,
    render,
    advance(frames = 1, dt = 1 / 60) {
      for (let i = 0; i < frames; i++) step(dt);
      render();
    },
    setQuality(q) {
      autoQuality = q === "auto";
      applyQuality(q === "auto" ? qualityName : q);
    },
    quality: () => qualityName,
    setShake(v) {
      shake = v;
    },
    setBrightness(v) {
      brightness = v;
    },
    setDesat(v) {
      G.uDesat.value = v;
    },
    monster: () => monster,
    env: () => env,
    fx: () => fx,
    anchor(which = "head") {
      if (!monster) return null;
      const p = which === "head" ? head().add(V(0, 0.24 * (monster.height / 1.8), 0)) : which === "headCenter" ? head() : which === "feet" ? V(0, 0, 0) : chest();
      return project(p);
    },
  };
  applyQuality(qualityName);
  return api;
}

function wait(s) {
  return new Promise((r) => setTimeout(r, s * 1000));
}
