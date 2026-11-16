/**
 * The 3D stage of Wild West: Card Showdown.
 *
 * Renderer + post (filmic tone mapping, bloom on lamps, warm colour grade,
 * vignette, film grain, depth of field during cinematics on High), the saloon
 * of the current stage, the poker table with cards/chips/button, the seated
 * rivals, background patrons and the bartender, dust in the sunbeams and a
 * camera director (menu drift, intro sweep with rival close-ups, the player's
 * seated view with gentle look-around, showdown push-in, victory orbit).
 *
 * The React layer drives the table through a small async API (deal, action,
 * street, showdown, sync …) that animates FROM the engine's states; the
 * engine never waits on the renderer.
 *
 * Quality presets: High (2× pixel ratio cap, MSAA, two shadow casters with
 * soft 2k maps, bloom, DOF, dust 1400, patrons) · Medium (1×, one 1k shadow,
 * bloom, fewer patrons) · Low (0.75×, no shadows / post / patrons / beams,
 * lite props, 30 fps cap). Auto steps down when frames run long.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { loadSkyEnv, loadSkyBackdrop, setAnisotropy, setPropSet, disposeAssets, SKIES, loadProp, fitProp, tintProp } from "./assets.js";
import { buildSaloon, propsFor } from "./saloon.js";
import { buildTable, seatDirs, seatAnchors, Cards, Chips, dealerButton, POT_POS, BOARD_POS, TABLE_Y, CARD_WIDTH } from "./table3d.js";
import { setCardResolution, setCardAnisotropy, disposeCardTextures } from "./cardFaces.js";
import { loadRigs, disposeAssets as disposeRigAssets } from "../../DeckOfShadows/render/assets.js";
import { softSprite, disposeSharedTextures } from "../../DeckOfShadows/render/materials.js";
import { buildCowboy } from "./cowboy.js";
import { RIVALS, PATRONS, BARTENDER, ARCHETYPES } from "../engine/rivals.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** The Sit clip places the pelvis this far behind the character root (local -Z). */
const SIT_BACK = 0.343;

export const QUALITY = {
  high: { pr: 2, msaa: 4, shadows: true, shadowSize: 2048, sunShadow: true, bloom: true, dof: true, dust: 1400, patrons: 4, beams: true, aniso: 8, post: true, cards: "high", fps: 0, props: "props" },
  medium: { pr: 1, msaa: 0, shadows: true, shadowSize: 1024, sunShadow: false, bloom: true, dof: false, dust: 500, patrons: 2, beams: true, aniso: 4, post: true, cards: "medium", fps: 0, props: "props" },
  low: { pr: 0.75, msaa: 0, shadows: false, shadowSize: 512, sunShadow: false, bloom: false, dof: false, dust: 0, patrons: 0, beams: false, aniso: 2, post: false, cards: "low", fps: 30, props: "props-lite" },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVig: { value: 0.42 },
    uGrain: { value: 0.025 },
    uWarm: { value: 1 },
    uFade: { value: 0 },
    uFlash: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain, uWarm, uFade, uFlash; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 dc = (uv - 0.5) * 0.0016;
      vec3 c = vec3(texture2D(tDiffuse, uv + dc).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dc).b);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // warm, slightly desaturated western grade: amber highlights, umber shadows
      c = mix(vec3(l), c, 0.9);
      c += uWarm * (vec3(0.022, 0.008, -0.018) * smoothstep(0.35, 1.0, l) + vec3(0.008, 0.002, -0.004) * (1.0 - smoothstep(0.0, 0.25, l)));
      c = pow(max(c, 0.0), vec3(0.98, 1.0, 1.04));
      float d = length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0));
      c *= 1.0 - uVig * smoothstep(0.35, 1.15, d);
      c += (h(uv * uRes + fract(uTime) * 91.7) - 0.5) * uGrain;
      c = mix(c, vec3(1.0, 0.93, 0.8), uFlash);
      c *= 1.0 - uFade;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function createWorld(container, opts = {}) {
  let autoQuality = !opts.quality || opts.quality === "auto";
  let qualityName = autoQuality ? "medium" : opts.quality;
  let Q = QUALITY[qualityName];
  const canvas = document.createElement("canvas");
  canvas.className = "wws-canvas";
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.preserve });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = Q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  setAnisotropy(Math.min(Q.aniso, maxAniso));
  setCardAnisotropy(Math.min(8, maxAniso));
  setCardResolution(Q.cards);
  setPropSet(Q.props);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0907);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.03, 140);
  camera.position.set(0, 1.6, 4);

  let W = 2, H = 2;
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: Q.msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: 1.5, aperture: 0.0025, maxblur: 0.006 });
  bokeh.enabled = false;
  composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.28, 0.5, 1.05);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  const G = grade.uniforms;

  let disposed = false;
  let stage = null; // current stage object
  let S = null; // saloon handles
  let table = null;
  let cards = null;
  let chips = null;
  let button = null;
  let deck = null;
  let rigs = null;
  let darkMaps = null;
  const cowboys = []; // per seat (index = table seat; seat 0 = null)
  const extras = []; // patrons + bartender
  const chairs = [];
  let anchors = [];
  let nSeats = 0;
  let dust = null;
  let loadToken = 0;
  const owned = new Set();

  /* ---------------------------------------------------------------- quality */
  function applyShadows() {
    renderer.shadowMap.enabled = Q.shadows;
    if (S) {
      const k = S.lights.key;
      k.castShadow = Q.shadows;
      k.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
      k.shadow.bias = -0.0003;
      k.shadow.normalBias = 0.02;
      k.shadow.radius = 5;
      k.shadow.camera.near = 0.5;
      k.shadow.camera.far = 6;
      const s = S.lights.sun;
      s.castShadow = Q.sunShadow && stage?.env.sky !== "night";
      s.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
      for (const l of [k, s])
        if (l.shadow.map) {
          l.shadow.map.dispose();
          l.shadow.map = null;
        }
      for (const L of S.lights.lamps) L.light.visible = qualityName !== "low" || S.lights.lamps.indexOf(L) < 2;
      for (const b of S.beams) b.mesh.visible = Q.beams;
    }
    bloom.enabled = Q.bloom;
    scene.traverse((o) => {
      if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
    });
  }

  /* ---------------------------------------------------------------- dust */
  function buildDust() {
    if (dust) {
      dust.geometry.dispose();
      dust.material.dispose();
      dust.removeFromParent();
      dust = null;
    }
    if (!Q.dust || !S) return;
    const n = Q.dust;
    const R = S.room;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // half of the motes live near the window beams
      const inBeam = i % 2 === 0 && S.beams.length;
      if (inBeam) {
        const b = S.beams[i % S.beams.length];
        const t = Math.random() * 5;
        const q = b.origin.clone().add(S.lights.sunDir.clone().multiplyScalar(t)).add(V((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.4));
        p.set([q.x, Math.max(0.05, q.y), q.z], i * 3);
      } else p.set([R.xL + Math.random() * R.w, Math.random() * R.H * 0.9, R.zB + Math.random() * (R.zF - R.zB)], i * 3);
      s[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("seed", new THREE.BufferAttribute(s, 1));
    const beams = S.beams.slice(0, 3);
    const uB = beams.map((b) => b.origin);
    while (uB.length < 3) uB.push(V(999, 999, 999));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uMap: { value: softSprite() }, uScale: { value: 1 }, uB: { value: uB }, uDir: { value: S.lights.sunDir.clone() }, uSun: { value: stage.env.sky === "night" ? 0 : 1 }, uCol: { value: new THREE.Color(stage.env.sky === "sunset" ? 0xffc890 : 0xfff0d8) } },
      vertexShader: /* glsl */ `attribute float seed; uniform float uTime, uScale, uSun; uniform vec3 uB[3]; uniform vec3 uDir; varying float vA;
        float beam(vec3 p, vec3 o){ vec3 d = p - o; float t = max(0.0, dot(d, uDir)); vec3 c = o + uDir * t; return exp(-dot(p - c, p - c) * 2.2) * step(0.0, dot(d, uDir)); }
        void main(){ vec3 p = position;
          p.x += sin(uTime * 0.11 + seed * 40.0) * 0.22; p.y += sin(uTime * 0.07 + seed * 17.0) * 0.16; p.z += cos(uTime * 0.09 + seed * 23.0) * 0.22;
          float lit = 0.12 + uSun * (beam(p, uB[0]) + beam(p, uB[1]) + beam(p, uB[2])) * 1.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uScale * (5.0 + seed * 9.0) / -mv.z; vA = lit * (0.3 + 0.7 * fract(seed * 7.3));
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform sampler2D uMap; uniform vec3 uCol; varying float vA;
        void main(){ float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(uCol * a * vA * 0.16, 1.0); }`,
    });
    dust = new THREE.Points(g, m);
    dust.frustumCulled = false;
    scene.add(dust);
  }

  /* ---------------------------------------------------------------- stage build */
  function clearStage() {
    for (const c of cowboys) c?.dispose();
    cowboys.length = 0;
    for (const c of extras) c.dispose();
    extras.length = 0;
    for (const c of chairs) c.removeFromParent();
    chairs.length = 0;
    cards?.dispose();
    chips?.dispose();
    cards = chips = null;
    button?.removeFromParent();
    deck?.removeFromParent();
    table?.root.removeFromParent();
    table = null;
    S?.dispose();
    S = null;
    if (dust) {
      dust.geometry.dispose();
      dust.material.dispose();
      dust.removeFromParent();
      dust = null;
    }
  }

  /**
   * Builds the saloon for `stg` with its rivals seated. onProgress(0..1).
   * Resolves false when superseded or disposed.
   */
  async function loadStage(stg, onProgress) {
    const tok = ++loadToken;
    const live = () => !disposed && tok === loadToken;
    onProgress?.(0.02);
    const sky = stg.env.sky;
    const envP = loadSkyEnv(renderer, sky);
    const bgP = loadSkyBackdrop(sky);
    const rigsP = rigs ? Promise.resolve(rigs) : loadRigs();
    const darkP = darkMaps
      ? Promise.resolve(darkMaps)
      : Promise.all(
          ["m_dark.jpg", "f_dark.jpg"].map((f) =>
            new THREE.TextureLoader().loadAsync(`${import.meta.env?.BASE_URL || "/"}models/neon-mercenary/${f}`).then((t) => {
              t.colorSpace = THREE.SRGBColorSpace;
              t.flipY = false;
              owned.add(t);
              return t;
            }),
          ),
        ).then(([m, f]) => ({ m, f }));
    // warm the prop cache in parallel with the room build
    Promise.all(propsFor(stg.env).map((p) => loadProp(p).catch(() => null)));
    const saloonP = buildSaloon(stg, { quality: qualityName, onProgress: (p) => live() && onProgress?.(0.1 + p * 0.8) });
    const [env, bg, sal, rg, dm] = await Promise.all([envP, bgP, saloonP, rigsP, darkP]);
    if (!live()) {
      sal.dispose();
      return false;
    }
    rigs = rg;
    darkMaps = dm;
    clearStage();
    stage = stg;
    S = sal;
    scene.add(S.root);
    scene.environment = env;
    scene.environmentIntensity = SKIES[sky].envI * 0.7;
    scene.background = bg;
    scene.backgroundIntensity = sky === "night" ? 0.6 : sky === "sunset" ? 1.0 : 1.05;
    scene.backgroundBlurriness = 0.0;
    scene.fog = new THREE.Fog(SKIES[sky].fog, 26, 90);
    renderer.toneMappingExposure = SKIES[sky].exposure;

    // table + seats
    table = buildTable({ felt: stg.env.felt, fancy: !!stg.env.fancy });
    scene.add(table.root);
    nSeats = stg.rivals.length + 1;
    const dirs = seatDirs(nSeats);
    anchors = dirs.map((d) => seatAnchors(d));
    cards = new Cards(scene, { shadows: Q.shadows });
    chips = new Chips(scene, { shadows: Q.shadows });
    anchors.forEach((a, i) => {
      chips.pile(`s${i}`, a.stack, { yaw: a.face, kind: "stack" });
      chips.pile(`b${i}`, a.bet, { yaw: a.face, kind: "bet" });
    });
    chips.pile("pot", POT_POS, { kind: "pot" });
    button = dealerButton();
    button.position.copy(anchors[0].button).add(V(0, 0.0045, 0));
    scene.add(button);
    // the deck, squared up by the button
    deck = new THREE.Mesh(new THREE.BoxGeometry(CARD_WIDTH, 0.016, CARD_WIDTH * 1.4), [cards.edgeMat, cards.edgeMat, cards.backMat, cards.edgeMat, cards.edgeMat, cards.edgeMat]);
    owned.add(deck.geometry);
    deck.castShadow = true;
    scene.add(deck);
    // chairs + rivals
    const chairTint = stg.env.fancy ? 0x5a3a2a : 0x7a5a42;
    for (let i = 0; i < nSeats; i++) {
      const a = anchors[i];
      try {
        if (i === 0) continue; // the player's own chair is never in view
        const ch = fitProp(await loadProp("painted_wooden_chair_02"), 0.92);
        tintProp(ch, chairTint);
        ch.position.copy(a.chair).add(a.dir.clone().multiplyScalar(0.02));
        ch.rotation.y = a.face;
        scene.add(ch);
        chairs.push(ch);
      } catch {
        /* a missing chair is only cosmetic */
      }
      if (!live()) return false;
    }
    onProgress?.(0.93);
    cowboys.length = 0;
    cowboys.push(null);
    stg.rivals.forEach((rid, k) => {
      const i = k + 1;
      const c = buildCowboy(rigs, RIVALS[rid], { darkMaps, shadows: Q.shadows });
      const a = anchors[i];
      // pelvis over the chair seat
      c.root.position.copy(a.chair).sub(a.dir.clone().multiplyScalar(SIT_BACK - 0.04));
      c.root.rotation.y = a.face;
      scene.add(c.root);
      c.seat.setAnchors({
        cards: a.cards.clone().add(V(0, 0.01, 0)),
        stack: a.stack,
        bet: a.bet,
        muck: a.muck,
        pot: POT_POS,
        rest: a.rest,
        chin: () => c.headPos(V()).add(a.dir.clone().multiplyScalar(-0.07)).add(V(0, -0.12, 0)),
      });
      cowboys.push(c);
    });
    // patrons + bartender
    const nPat = Math.min(Q.patrons, S.bgSeats.length);
    const seats = S.bgSeats.filter((_, i) => i % 3 !== 2).slice(0, nPat);
    seats.forEach((st, i) => {
      const p = PATRONS[(i + stg.id) % PATRONS.length];
      const c = buildCowboy(rigs, p, { darkMaps, shadows: false });
      // like the rivals: a little in front of the chair's centre, facing the table
      c.root.position.copy(st.pos).add(V(Math.sin(st.face), 0, Math.cos(st.face)).multiplyScalar(SIT_BACK + 0.04));
      c.root.rotation.y = st.face;
      scene.add(c.root);
      extras.push(c);
    });
    {
      const c = buildCowboy(rigs, BARTENDER, { darkMaps, shadows: false, stand: true });
      c.root.position.set(S.bar.x + 1.2, 0, S.bar.back + 0.75);
      c.root.rotation.y = 0;
      scene.add(c.root);
      c.bartender = true;
      extras.push(c);
    }
    applyShadows();
    buildDust();
    onProgress?.(1);
    // compile now so the first deal doesn't hitch
    renderer.compile(scene, camera);
    return true;
  }

  /* ---------------------------------------------------------------- camera director */
  const cam = {
    mode: "menu",
    pos: V(0, 1.6, 4),
    look: V(0, 1, 0),
    from: null,
    to: null,
    t: 1,
    dur: 1,
    path: null,
    px: 0,
    py: 0,
    tx: 0,
    ty: 0,
    fov: 50,
    orbit: 0,
    focusDist: 2,
  };
  const seatEye = () => V(0, 1.36, 1.2);
  const seatLook = () => V(0, 0.93, -0.6);
  function shot(pos, look, dur = 1.4, fov = null) {
    cam.from = { pos: cam.pos.clone(), look: cam.look.clone(), fov: cam.fov };
    cam.to = { pos: pos.clone(), look: look.clone(), fov: fov ?? cam.fov };
    cam.t = dur <= 0 ? 1 : 0;
    cam.dur = Math.max(0.001, dur);
    if (dur <= 0) {
      cam.pos.copy(pos);
      cam.look.copy(look);
      if (fov) cam.fov = fov;
    }
  }
  function setMode(mode, dur = 1.6) {
    cam.mode = mode;
    if (mode === "seat") shot(seatEye(), seatLook(), dur, 50);
    if (mode === "showdown") shot(V(0, 1.2, 0.98), V(0, 0.8, -0.2), dur, 46);
    bokeh.enabled = false;
  }
  /** Close-up framing of rival seat i (for intros, eliminations, victory). */
  function faceShot(i, dist = 0.95, dur = 1.6) {
    const c = cowboys[i];
    if (!c) return;
    const hp = c.headPos(V());
    const a = anchors[i];
    const pos = hp.clone().add(a.dir.clone().multiplyScalar(-dist)).add(a.side.clone().multiplyScalar(0.18)).add(V(0, 0.02, 0));
    shot(pos, hp.clone().add(V(0, -0.03, 0)), dur, 34);
    cam.focusDist = dist;
  }

  /** Cinematic intro: through the doors, across the room, each rival in turn. */
  async function intro(onRival) {
    if (!S) return;
    const tok = ++cineToken;
    const R = S.room;
    cam.mode = "cine";
    S.swingDoors(1.6);
    shot(V(R.xR + 2.6, 1.7, R.doorZ + 0.4), V(0, 1.2, -0.5), 0);
    shot(V(R.xR - 1.3, 1.65, R.doorZ + 0.9), V(0, 1.0, -0.3), 2.6, 52);
    bokeh.enabled = Q.dof;
    cam.focusDist = 4;
    if (!(await waitCine(2400, tok))) return;
    for (let i = 1; i < cowboys.length; i++) {
      faceShot(i, 1.0, 1.5);
      cowboys[i].seat.lookAt(cam.to.pos, 2.4);
      setTimeout(() => cowboys[i]?.seat.nod(), 700);
      onRival?.(i);
      if (!(await waitCine(2300, tok))) return;
    }
    onRival?.(-1);
    setMode("seat", 1.8);
    await waitCine(1700, tok);
  }
  let cineToken = 0;
  const waitCine = (ms, tok) => new Promise((r) => setTimeout(() => r(tok === cineToken && !disposed), ms));
  function skipCine() {
    cineToken++;
    setMode("seat", 0.6);
  }
  /** Victory: a slow orbit around the table. */
  function victory() {
    cineToken++;
    cam.mode = "orbit";
    cam.orbit = 0;
    bokeh.enabled = Q.dof;
    cam.focusDist = 2.2;
  }
  function defeat(winnerSeat) {
    cineToken++;
    if (winnerSeat > 0) {
      cam.mode = "cine";
      faceShot(winnerSeat, 1.1, 2.2);
      bokeh.enabled = Q.dof;
    } else setMode("seat", 1.2);
  }
  function menu() {
    cineToken++;
    cam.mode = "menu";
    cam.orbit = 0.4;
    bokeh.enabled = false;
  }

  /* ---------------------------------------------------------------- table director */
  const holeKey = (seat, k) => `h${seat}.${k}`;
  const boardKey = (k) => `b${k}`;
  function holePose(seat, k, up) {
    const a = anchors[seat];
    if (seat === 0) {
      // the player's own cards: near the rail, leaning back toward the eye
      return { pos: V(-0.048 + k * 0.094, TABLE_Y + 0.004, 0.4 - k * 0.006), yaw: k ? -0.06 : 0.06, up: true, tilt: 0.3, z: k };
    }
    const p = a.cards.clone().add(a.side.clone().multiplyScalar((k - 0.5) * 0.03)).add(a.dir.clone().multiplyScalar(k * 0.008));
    return { pos: p, yaw: a.face + (k - 0.5) * 0.16, up, z: k };
  }
  function boardPose(k) {
    return { pos: BOARD_POS.clone().add(V((k - 2) * CARD_WIDTH * 1.14, 0, 0)), yaw: 0, up: true };
  }
  const dealFrom = () => {
    const a = anchors[lastDealer >= 0 ? lastDealer : 0];
    return { pos: a.button.clone().add(a.dir.clone().multiplyScalar(-0.12)).add(V(0, 0.02, 0)), yaw: a.face, up: false };
  };
  let lastDealer = 0;
  let speed = 1;
  const D = (s) => s / speed;

  function placeButton(dealer, animate = true) {
    lastDealer = dealer;
    const a = anchors[dealer];
    if (!a || !button) return;
    const to = a.button.clone().add(V(0, 0.0045, 0));
    if (!animate) {
      button.position.copy(to);
      deck.position.copy(a.button).add(a.dir.clone().multiplyScalar(-0.12)).add(a.side.clone().multiplyScalar(0.1)).add(V(0, 0.008, 0));
      deck.rotation.y = a.face;
      return;
    }
    buttonAnim = { from: button.position.clone(), to, t: 0 };
    deck.position.copy(a.button).add(a.dir.clone().multiplyScalar(-0.12)).add(a.side.clone().multiplyScalar(0.1)).add(V(0, 0.008, 0));
    deck.rotation.y = a.face;
  }
  let buttonAnim = null;

  /** Instantly mirror a table state (resume / after window resize / skips). */
  function syncTable(s, { hideOpp = true } = {}) {
    if (!cards) return;
    cards.clear();
    placeButton(Math.max(0, s.dealer), false);
    s.players.forEach((p, i) => {
      chips.set(`s${i}`, p.stack);
      chips.set(`b${i}`, s.phase === "complete" ? 0 : p.bet);
      if (p.inHand && !p.folded && p.hole.length === 2 && s.phase !== "waiting") {
        for (let k = 0; k < 2; k++) {
          const up = i === 0 || p.revealed || !hideOpp;
          cards.place(holeKey(i, k), up ? p.hole[k] : -1, holePose(i, k, up));
        }
      }
    });
    s.board.forEach((c, k) => cards.place(boardKey(k), c, boardPose(k)));
    const collected = s.phase === "complete" ? 0 : s.players.reduce((a, p) => a + p.total - p.bet, 0);
    chips.set("pot", collected);
    for (let i = 1; i < cowboys.length; i++) {
      const p = s.players[i];
      if (p?.out || p?.folded) cowboys[i]?.seat.upper("FoldArms", { fade: 0.1 });
    }
  }

  /** A new hand was dealt (state after startHand). */
  async function dealHand(s, prev) {
    if (!cards) return;
    cards.clear();
    chips.set("pot", 0);
    s.players.forEach((p, i) => {
      chips.set(`b${i}`, 0);
      chips.set(`s${i}`, p.stack + p.bet); // before blinds
      cowboys[i]?.seat.newHand();
    });
    placeButton(s.dealer, !!prev);
    opts.audio?.shuffle();
    await sleep(D(650));
    // blinds
    const sbP = s.players[s.sbSeat], bbP = s.players[s.bbSeat];
    cowboys[s.sbSeat]?.seat.chips();
    cowboys[s.bbSeat]?.seat.chips();
    chips.transfer(`s${s.sbSeat}`, `b${s.sbSeat}`, sbP.bet, { dur: D(0.45) });
    chips.transfer(`s${s.bbSeat}`, `b${s.bbSeat}`, bbP.bet, { delay: D(0.15), dur: D(0.45) });
    opts.audio?.chips(2);
    await sleep(D(350));
    // two passes from the left of the button
    const order = [];
    for (let k = 1; k <= s.players.length; k++) {
      const i = (s.dealer + k) % s.players.length;
      if (s.players[i].inHand) order.push(i);
    }
    const from = dealFrom();
    const jobs = [];
    let n = 0;
    for (let pass = 0; pass < 2; pass++)
      for (const i of order) {
        const delay = D(n++ * 0.13);
        jobs.push(cards.move(holeKey(i, pass), i === 0 ? s.players[0].hole[pass] : -1, holePose(i, pass, i === 0), { from, dur: D(0.42), delay, arc: 0.05, spin: 1.2 }));
        setTimeout(() => opts.audio?.deal(), delay * 1000);
      }
    await Promise.all(jobs);
    // rivals glance at their cards
    order.forEach((i, j) => {
      if (i === 0) return;
      setTimeout(() => {
        cowboys[i]?.seat.peek();
        setTimeout(() => {
          cards.peek(holeKey(i, 0), 0.9);
          cards.peek(holeKey(i, 1), 0.9);
        }, 450);
      }, j * 260 + Math.random() * 300);
    });
    chips.set(`s${s.sbSeat}`, sbP.stack);
    chips.set(`s${s.bbSeat}`, bbP.stack);
  }

  /** Seat `seat` took `action` (prev → next states). */
  async function action(seat, act, prev, next) {
    if (!cards) return;
    const p0 = prev.players[seat], p1 = next.players[seat];
    const put = p1.bet - p0.bet;
    const c = cowboys[seat];
    if (act.type === "fold") {
      opts.audio?.fold();
      c?.seat.fold();
      const delay = c ? 0.45 : 0;
      for (let k = 0; k < 2; k++) {
        const key = holeKey(seat, k);
        const a = anchors[seat];
        const dst = { pos: a.muck.clone().add(V((Math.random() - 0.5) * 0.06, 0.002 + k * 0.001, (Math.random() - 0.5) * 0.06)), yaw: Math.random() * 6, up: false };
        cards.move(key, seat === 0 ? -1 : -1, dst, { dur: D(0.45), delay: D(delay + k * 0.05), arc: 0.03 });
      }
      await sleep(D(600));
      return;
    }
    if (put > 0) {
      if (c) {
        c.seat.chips();
        await sleep(D(550));
      }
      opts.audio?.chips(Math.min(6, 1 + Math.round(Math.log10(put + 1))));
      await chips.transfer(`s${seat}`, `b${seat}`, put, { dur: D(0.45) });
      if (act.type === "allin" && c) setTimeout(() => c.seat.lookAt(cam.pos.clone(), 1.5), 200);
    } else if (act.type === "check") {
      c?.seat.check();
      opts.audio?.knock();
      await sleep(D(420));
    }
  }

  /** Close a street: return uncalled bets, gather bets into the pot, deal the board. */
  async function street(prev, next) {
    if (!cards) return;
    const n = prev.players.length;
    // returned (uncalled) chips
    if (next.lastReturned && next.lastReturned.amount > 0) {
      const { seat, amount } = next.lastReturned;
      await chips.transfer(`b${seat}`, `s${seat}`, amount, { dur: D(0.35) });
    }
    const jobs = [];
    for (let i = 0; i < n; i++) {
      const amt = chips.piles.get(`b${i}`).amount;
      if (amt > 0) jobs.push(chips.transfer(`b${i}`, "pot", amt, { dur: D(0.55), delay: D(i * 0.05) }));
    }
    if (jobs.length) {
      opts.audio?.sweep();
      await Promise.all(jobs);
    }
    // board cards
    const from = dealFrom();
    const newCards = next.board.slice(prev.board.length);
    if (newCards.length) {
      opts.audio?.burn();
      await sleep(D(220));
      const base = prev.board.length;
      const js = newCards.map((c, k) => {
        const idx = base + k;
        const pose = boardPose(idx);
        // deal face down, then turn over (flop turned together)
        return cards.move(boardKey(idx), c, { ...pose, up: false }, { from, dur: D(0.4), delay: D(k * 0.12), arc: 0.04, spin: 0.8 }).then(() => {
          opts.audio?.deal();
        });
      });
      await Promise.all(js);
      await sleep(D(120));
      await Promise.all(newCards.map((_, k) => cards.flip(boardKey(base + k), true, { dur: D(0.32), delay: D(k * 0.08) })));
      opts.audio?.flip();
    }
  }

  /** Reveal hands at showdown / all-in (cards turned face up). */
  async function reveal(s) {
    if (!cards) return;
    const js = [];
    s.players.forEach((p, i) => {
      if (i === 0 || !p.revealed || !p.inHand || p.folded) return;
      for (let k = 0; k < 2; k++) {
        const key = holeKey(i, k);
        const c = cards.active.get(key);
        if (!c) continue;
        cards.setFace(c, p.hole[k]);
        // turned over and slid slightly toward the centre for everyone to read
        const pose = holePose(i, k, true);
        pose.pos.add(anchors[i].dir.clone().multiplyScalar(-0.1));
        js.push(cards.move(key, p.hole[k], pose, { dur: D(0.45), delay: D(k * 0.07), arc: 0.05 }));
      }
    });
    if (js.length) opts.audio?.flip();
    await Promise.all(js);
  }

  /** Award pots (after settle). Highlights each winner's five cards. */
  async function award(s, { highlight = true } = {}) {
    if (!cards) return;
    const res = s.result;
    // any bets left on the table go to the pot first
    for (let i = 0; i < s.players.length; i++) {
      const amt = chips.piles.get(`b${i}`).amount;
      if (amt > 0) chips.transfer(`b${i}`, "pot", amt, { dur: D(0.4) });
    }
    await sleep(D(450));
    if (highlight && res.showdown) {
      const best = new Set();
      for (const w of res.winners) for (const c of res.hands[w]?.best || []) best.add(c);
      for (const [key, c] of cards.active) cards.highlight(key, best.has(c.card));
    }
    const jobs = [];
    res.pots.forEach((pot, pi) => {
      for (const [seat, share] of Object.entries(pot.shares)) {
        jobs.push(chips.transfer("pot", `s${seat}`, share, { dur: D(0.75), delay: D(0.6 + pi * 0.5) }));
      }
    });
    setTimeout(() => opts.audio?.rake(), D(600));
    for (const w of res.winners) cowboys[w]?.seat.win(res.awards[w] > 0 && s.players[w].stack > (s.players[w].startStack || 0) * 1.5);
    await Promise.all(jobs);
    chips.set("pot", 0);
    s.players.forEach((p, i) => chips.set(`s${i}`, p.stack));
  }

  function clearHighlights() {
    if (!cards) return;
    for (const k of cards.active.keys()) cards.highlight(k, false);
  }
  /** Gather every card back to the deck at the end of a hand. */
  async function collect() {
    if (!cards) return;
    clearHighlights();
    const from = dealFrom();
    const js = [];
    let k = 0;
    for (const [key, c] of [...cards.active]) {
      js.push(cards.move(key, c.card, { ...from, up: false }, { dur: D(0.38), delay: D(k++ * 0.03), arc: 0.04 }).then(() => cards.release(key)));
    }
    await Promise.all(js);
  }

  /** Mark whose turn it is: rivals think, the camera favours them a little. */
  let turnSeat = -1;
  function turn(seat) {
    turnSeat = seat;
    const c = cowboys[seat];
    if (c && Math.random() < 0.55) c.seat.think(0.9 + Math.random() * 0.8);
  }
  function react(seat, kind) {
    const c = cowboys[seat];
    if (!c) return;
    if (kind === "busted") c.seat.lose(true);
    else if (kind === "lose") c.seat.lose(false);
    else if (kind === "talk") c.seat.talk();
    else if (kind === "drink") c.seat.drink();
    else if (kind === "nod") c.seat.nod();
  }

  /* ---------------------------------------------------------------- HUD anchoring */
  const hudEls = { seats: [], pot: null, board: null };
  function bindHud(els) {
    Object.assign(hudEls, els);
  }
  const tmp = V();
  function project(p) {
    tmp.copy(p).project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H, vis: tmp.z < 1 && tmp.x > -1.2 && tmp.x < 1.2 };
  }
  function updateHud() {
    for (let i = 0; i < hudEls.seats.length; i++) {
      const el = hudEls.seats[i];
      if (!el) continue;
      let p;
      if (i === 0) p = { x: W * 0.5, y: H, vis: false };
      else if (cowboys[i] && anchors[i]) {
        // on the rail in front of the rival: never over a face, always near their chips
        p = project(anchors[i].plate);
        p.x = Math.min(W - 80, Math.max(80, p.x));
        p.y = Math.min(H * 0.7, Math.max(H * 0.2, p.y));
      } else continue;
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      el.style.visibility = p.vis && (cam.mode === "seat" || cam.mode === "showdown") ? "visible" : "hidden";
    }
    if (hudEls.pot) {
      const p = project(POT_POS.clone().add(V(0, 0.09, 0)));
      hudEls.pot.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      hudEls.pot.style.visibility = p.vis && (cam.mode === "seat" || cam.mode === "showdown") ? "visible" : "hidden";
    }
    if (hudEls.bets) {
      for (let i = 0; i < hudEls.bets.length; i++) {
        const el = hudEls.bets[i];
        if (!el || !anchors[i]) continue;
        const p = project(anchors[i].bet.clone().add(V(0, 0.06, 0)));
        el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
        el.style.visibility = p.vis && (cam.mode === "seat" || cam.mode === "showdown") ? "visible" : "hidden";
      }
    }
  }

  /* ---------------------------------------------------------------- loop */
  const clock = new THREE.Clock();
  let raf = 0;
  let slow = 0;
  let lastDraw = 0;
  let simT = 0;
  const lookTargets = [];
  function step(dt) {
    simT += dt;
    // camera
    if (cam.t < 1) {
      cam.t = Math.min(1, cam.t + dt / cam.dur);
      const e = ease(cam.t);
      cam.pos.lerpVectors(cam.from.pos, cam.to.pos, e);
      cam.look.lerpVectors(cam.from.look, cam.to.look, e);
      cam.fov = cam.from.fov + (cam.to.fov - cam.from.fov) * e;
    }
    if (cam.mode === "menu") {
      cam.orbit += dt * 0.035;
      const r = 3.4;
      const target = V(Math.sin(cam.orbit) * r, 1.75 + Math.sin(simT * 0.2) * 0.08, Math.cos(cam.orbit) * r * 0.9 + 0.6);
      cam.pos.lerp(target, Math.min(1, dt * 1.5));
      cam.look.lerp(V(0, 0.95, -1.0), Math.min(1, dt * 1.5));
      cam.fov += (48 - cam.fov) * Math.min(1, dt);
    } else if (cam.mode === "orbit") {
      cam.orbit += dt * 0.12;
      const r = 2.25;
      cam.pos.lerp(V(Math.sin(cam.orbit) * r, 1.55, Math.cos(cam.orbit) * r), Math.min(1, dt * 1.2));
      cam.look.lerp(V(0, 0.95, 0), Math.min(1, dt * 1.5));
      cam.fov += (44 - cam.fov) * Math.min(1, dt);
    }
    // gentle look-around + breathing in the seat
    cam.px += (cam.tx - cam.px) * Math.min(1, dt * 2.5);
    cam.py += (cam.ty - cam.py) * Math.min(1, dt * 2.5);
    camera.position.copy(cam.pos);
    if (cam.mode === "seat" || cam.mode === "showdown") {
      const motion = opts.motion !== false ? 1 : 0;
      camera.position.y += Math.sin(simT * 1.4) * 0.004 * motion;
      camera.position.x += Math.sin(simT * 0.37) * 0.006 * motion;
    }
    const look = cam.look.clone();
    if (cam.mode === "seat" || cam.mode === "showdown") look.add(V(cam.px * 0.55, cam.py * 0.25, 0));
    camera.lookAt(look);
    if (Math.abs(camera.fov - cam.fov) > 0.01) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    // world
    if (S) {
      S.update(dt);
      lookTargets.length = 0;
      lookTargets.push(camera.position, POT_POS);
      for (let i = 1; i < cowboys.length; i++) {
        const c = cowboys[i];
        if (!c) continue;
        if (i !== turnSeat || Math.random() < 0.01) c.seat.lookTarget = null;
        c.update(dt, { lookTargets, idle: true, fidget: ARCHETYPES[c.rival.archetype]?.fidget ?? 0.6 });
      }
      for (const c of extras) {
        if (!c.lt) c.lt = [S.room ? V(0, 1.1, 0) : V(), V(Math.random() * 4 - 2, 1.2, Math.random() * 4 - 2)];
        c.update(dt, { lookTargets: c.lt, idle: true, fidget: 1.2 });
      }
    }
    cards?.update(dt);
    chips?.update(dt);
    if (buttonAnim) {
      buttonAnim.t = Math.min(1, buttonAnim.t + dt / 0.6);
      const e = ease(buttonAnim.t);
      button.position.lerpVectors(buttonAnim.from, buttonAnim.to, e);
      button.position.y += Math.sin(Math.PI * e) * 0.04;
      if (buttonAnim.t >= 1) buttonAnim = null;
    }
    if (dust) {
      dust.material.uniforms.uTime.value = simT;
      dust.material.uniforms.uScale.value = H * Math.min(window.devicePixelRatio || 1, Q.pr) * 0.0018;
    }
    G.uTime.value = simT;
    G.uFlash.value = Math.max(0, G.uFlash.value - dt * 1.5);
    if (bokeh.enabled) {
      bokeh.uniforms.focus.value += (cam.focusDist - bokeh.uniforms.focus.value) * Math.min(1, dt * 3);
    }
  }
  function render() {
    if (Q.post) composer.render();
    else renderer.render(scene, camera);
    updateHud();
  }
  function tick() {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    if (Q.fps && now - lastDraw < 1000 / Q.fps - 2) return;
    const ft = now - lastDraw;
    lastDraw = now;
    // slow machines: animations keep (almost) real time instead of turning into slow motion
    const dt = Math.min(opts.maxDt || 0.1, clock.getDelta());
    if (autoQuality && S && document.visibilityState === "visible") {
      if (ft > 42) slow++;
      else slow = Math.max(0, slow - 0.5);
      if (slow > 50 && qualityName !== "low") {
        slow = 0;
        setQualityInternal(qualityName === "high" ? "medium" : "low");
        opts.onQuality?.(qualityName);
      }
    }
    step(dt);
    render();
  }
  if (!opts.manual) raf = requestAnimationFrame(tick);

  /* ---------------------------------------------------------------- public */
  function resize(w, h) {
    W = Math.max(2, w | 0);
    H = Math.max(2, h | 0);
    const pr = Math.min(window.devicePixelRatio || 1, Q.pr);
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    composer.setPixelRatio(pr);
    composer.setSize(W, H);
    bloom.resolution.set(W * pr * 0.5, H * pr * 0.5);
    camera.aspect = W / H;
    // narrow / tall stages: widen the view so the rivals stay in frame
    const aspectFov = W / H < 1.15 ? 64 : W / H < 1.45 ? 56 : 50;
    if (cam.mode === "seat") cam.fov = aspectFov;
    seatFov = aspectFov;
    camera.updateProjectionMatrix();
    G.uRes.value.set(W, H);
  }
  let seatFov = 50;
  function setQualityInternal(name) {
    qualityName = name;
    Q = QUALITY[name];
    rt.samples = Q.msaa;
    rt.dispose();
    setAnisotropy(Math.min(Q.aniso, maxAniso));
    applyShadows();
    buildDust();
    resize(W, H);
  }
  function setQuality(q) {
    autoQuality = q === "auto";
    const name = autoQuality ? qualityName : q;
    if (QUALITY[name]) setQualityInternal(name);
  }

  const api = {
    loadStage,
    resize,
    setQuality,
    quality: () => qualityName,
    setMode: (m, dur) => {
      setMode(m, dur);
      if (m === "seat" && cam.to) cam.to.fov = seatFov;
    },
    menu,
    intro,
    skipCine,
    victory,
    defeat,
    faceShot,
    syncTable,
    dealHand,
    action,
    street,
    reveal,
    award,
    collect,
    turn,
    react,
    bindHud,
    flash: (a = 0.5) => (G.uFlash.value = a),
    setSpeed: (s) => (speed = s),
    setMotion: (m) => (opts.motion = m),
    swingDoors: () => S?.swingDoors(1.5),
    pointer: (x, y) => {
      cam.tx = Math.max(-1, Math.min(1, x));
      cam.ty = Math.max(-1, Math.min(1, y));
    },
    project,
    seatCount: () => nSeats,
    renderer,
    /** Tests / manual mode: advance sec of animation then draw one frame. */
    advance(sec, dt = 1 / 30) {
      const n = Math.max(1, Math.round(sec / dt));
      for (let i = 0; i < n; i++) step(dt);
      render();
    },
    get debug() {
      return { scene, camera, S, cowboys, extras, cards, chips, cam, anchors, Q, bokeh };
    },
    dispose() {
      disposed = true;
      cineToken++;
      loadToken++;
      cancelAnimationFrame(raf);
      clearStage();
      for (const o of owned) o.dispose?.();
      composer.dispose?.();
      rt.dispose();
      bloom.dispose?.();
      bokeh.dispose?.();
      disposeCardTextures();
      disposeAssets();
      disposeRigAssets();
      disposeSharedTextures();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    },
  };
  api.setMode("menu");
  return api;
}
