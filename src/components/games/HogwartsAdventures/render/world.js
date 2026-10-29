/**
 * The renderer: one WebGL scene holding the castle, the outdoors, actors,
 * interactive objects, spells and particles; a light rig (sun with a
 * player-following shadow box, hemisphere fill, ambient) blended per region
 * from render/sky.js presets; glow sprites for candles and lanterns; and
 * camera handling for play, the main menu fly-over and hero selection.
 *
 * createWorld(host, { quality }) → { ready, resize, frame, onEvents, setQuality, dispose }
 */
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { buildCastle } from "./castle.js";
import { buildOutdoors } from "./outdoors.js";
import { createSky } from "./sky.js";
import { createFx } from "./fx.js";
import { createActors, wizardLook } from "./actors.js";
import { createSpellFx } from "./spellfx.js";
import { createObjectViews } from "./objects3d.js";
import { createCharacter } from "./characters.js";
import { glowTex, disposeTextures } from "./textures.js";
import { TORCHES } from "../data/layout.js";
import { HEROES, HERO_IDS } from "../data/heroes.js";
import { createCollision } from "../engine/collide.js";

const QUALITY = {
  low: { pixel: 0.75, shadow: 0, aa: false },
  medium: { pixel: 1, shadow: 1024, aa: true },
  high: { pixel: 1.5, shadow: 2048, aa: true },
};
const rgbOf = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

export function createWorld(host, opts = {}) {
  let quality = opts.quality === "auto" || !opts.quality ? autoQuality() : opts.quality;
  const Q = () => QUALITY[quality];
  const renderer = new THREE.WebGLRenderer({ antialias: Q().aa, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.test });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q().pixel));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = Q().shadow > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2("#d8c8b0", 0.004);
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1400);
  camera.position.set(0, 30, 80);

  // lights
  const hemi = new THREE.HemisphereLight("#a8c0e0", "#6a5a40", 0.7);
  scene.add(hemi);
  const amb = new THREE.AmbientLight("#ffffff", 0.15);
  scene.add(amb);
  const sun = new THREE.DirectionalLight("#ffd8a0", 2.6);
  sun.castShadow = Q().shadow > 0;
  sun.shadow.mapSize.set(Q().shadow || 512, Q().shadow || 512);
  const SB = 34;
  Object.assign(sun.shadow.camera, { left: -SB, right: SB, top: SB, bottom: -SB, near: 1, far: 260 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const sky = createSky(scene);
  const shared = { pointScale: { value: 600 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0.004 }, time: { value: 0 }, camPos: { value: new THREE.Vector3() } };
  const col = createCollision();
  const fx = createFx(scene, { col }, shared, quality);
  const castle = buildCastle(scene, quality);
  const outdoors = buildOutdoors(scene, quality);

  // glow sprites for candles / lanterns (one Points batch)
  const glowPts = [...castle.lights, ...outdoors.lights];
  const gGeo = new THREE.BufferGeometry();
  const gPos = new Float32Array(glowPts.length * 3);
  const gCol = new Float32Array(glowPts.length * 3);
  const gSize = new Float32Array(glowPts.length);
  glowPts.forEach((l, i) => {
    gPos.set([l.x, l.y, l.z], i * 3);
    gCol.set(l.c, i * 3);
    gSize[i] = l.s;
  });
  gGeo.setAttribute("position", new THREE.BufferAttribute(gPos, 3));
  gGeo.setAttribute("aCol", new THREE.BufferAttribute(gCol, 3));
  gGeo.setAttribute("aSize", new THREE.BufferAttribute(gSize, 1));
  const gMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: glowTex() }, uScale: shared.pointScale, uTime: shared.time },
    vertexShader: `attribute vec3 aCol; attribute float aSize; varying vec3 vC; uniform float uScale; uniform float uTime;
      void main(){ vC = aCol * (0.85 + 0.15 * sin(uTime * 9.0 + position.x * 3.0 + position.z)); vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(0.5, -mv.z); }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC * 1.8 * t.rgb, t.a); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glowMesh = new THREE.Points(gGeo, gMat);
  glowMesh.frustumCulled = false;
  scene.add(glowMesh);
  // candle flame tips also need to bob
  const candleIdx = glowPts.map((l, i) => (l.bob ? i : -1)).filter((i) => i >= 0);

  // world fires (torches, hearths, braziers, campfire)
  const fires = TORCHES.map((t) => ({ ...t, kind: t.kind === "hearth" || t.kind === "campfire" ? "campfire" : t.kind || "torch", s: t.s || (t.kind === "darkfire" ? 1 : 0.6), ember: false, lit: true }));
  // torch brackets
  {
    const bracket = new THREE.CylinderGeometry(0.06, 0.1, 0.5, 6);
    bracket.translate(0, -0.25, 0);
    const im = new THREE.InstancedMesh(bracket, new THREE.MeshStandardMaterial({ color: "#2a2420", metalness: 0.6, roughness: 0.5 }), fires.length);
    const m = new THREE.Matrix4();
    let n = 0;
    for (const f of fires) if (f.kind === "torch") im.setMatrixAt(n++, m.makeTranslation(f.x, f.y, f.z));
    im.count = n;
    scene.add(im);
  }

  let actors = null;
  let objViews = null;
  let spellFx = null;
  let G = null;
  let assets = null;
  // menu / hero-select display characters
  const display = { chars: new Map(), group: new THREE.Group() };
  scene.add(display.group);

  const ready = loadAssets(opts.onProgress).then((a) => {
    assets = a;
    actors = createActors(scene, a);
    return true;
  });

  let W = 1280;
  let H = 720;
  let t = 0;
  let atmos = "menu";
  let shake = 0;
  const camPos = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const hitLight = new THREE.PointLight("#ffffff", 0, 10, 2);
  scene.add(hitLight);
  let hitLightT = 0;

  function bindGame(g) {
    if (G === g) return;
    G = g;
    objViews?.dispose();
    spellFx?.dispose();
    objViews = g ? createObjectViews(scene, g, fx) : null;
    spellFx = g ? createSpellFx(scene, fx) : null;
    fx.clear();
    fx.setSources([...fires, ...(objViews?.fires || [])], [{ x: -46, y: 8.4, z: 67.1 }]);
  }

  /* ---------------------------------------------------------- events → effects */
  function onEvents(g, evs) {
    if (!spellFx) return;
    const P = g.player;
    for (const e of evs) {
      switch (e.type) {
        case "cast": {
          const tip = actors?.wandTip(actors.player);
          if (tip) {
            spellFx.flash(tip.x, tip.y, tip.z, e.color, 1);
            fx.sparkle(tip.x, tip.y, tip.z, rgbOf(e.color), 8, 2, 0.14);
          }
          break;
        }
        case "bolt":
          if (e.team === "player") {
            const tip = actors?.wandTip(actors.player);
            if (tip) {
              const b = g.projectiles.find((x) => x.id === e.id);
              if (b) {
                b.x = tip.x;
                b.y = tip.y;
                b.z = tip.z;
              }
            }
          }
          break;
        case "beam": {
          const tip = actors?.wandTip(actors.player);
          const x0 = tip ? tip.x : e.x0;
          const y0 = tip ? tip.y : e.y0;
          const z0 = tip ? tip.z : e.z0;
          spellFx.beam(x0, y0, z0, e.x, e.y, e.z, e.color, e.fail);
          break;
        }
        case "impact": {
          const c = rgbOf(e.color || "#ffffff");
          fx.sparkle(e.x, e.y, e.z, c, e.big ? 40 : 18, e.big ? 6 : 4);
          fx.burst("magic", e.x, e.y, e.z, { n: 8, color: c, speed: 3, size: 0.6 });
          if (e.spell === "incendio") fx.burst("fire", e.x, e.y - 0.5, e.z, { n: 10, size: 1.2 });
          hitLight.position.set(e.x, e.y, e.z);
          hitLight.color.set(e.color || "#ffffff");
          hitLight.intensity = 14;
          hitLightT = 0.15;
          break;
        }
        case "fireSplash":
          fx.burst("fire", e.x, e.y - 0.6, e.z, { n: 18, size: 1.4, speed: 4 });
          fx.burst("smoke", e.x, e.y, e.z, { n: 4, size: 1 });
          break;
        case "blocked":
        case "reflect":
          fx.sparkle(e.x, e.y, e.z, rgbOf(e.type === "reflect" ? "#b8ecff" : e.color || "#7fd0ff"), e.type === "reflect" ? 30 : 16, 5);
          break;
        case "shieldBreak":
          fx.sparkle(e.x, e.y, e.z, [0.5, 0.8, 1], 30, 6);
          break;
        case "disarm":
          fx.sparkle(e.x, e.y, e.z, [1, 0.3, 0.3], 14, 4);
          break;
        case "dmg":
          break;
        case "death":
          fx.burst(e.etype === "dementor" ? "shadow" : "smoke", e.x, (e.y || 0) + 0.8, e.z, { n: 14, size: 1.2 });
          if (e.etype === "dementor") fx.sparkle(e.x, (e.y || 0) + 1.5, e.z, [0.8, 0.9, 1], 30, 4);
          break;
        case "apparate":
          fx.burst("shadow", e.x0, (e.y || 0) + 1, e.z0, { n: 22, speed: 3 });
          fx.burst("shadow", e.x, (e.y || 0) + 1, e.z, { n: 22, speed: 3 });
          break;
        case "blink":
          fx.burst("shadow", e.x0, e.y + 1, e.z0, { n: 16 });
          fx.sparkle(e.x0, e.y + 1, e.z0, [0.3, 1, 0.6], 18, 4);
          fx.burst("shadow", e.x, e.y + 1, e.z, { n: 12 });
          break;
        case "slam":
          fx.burst("dust", e.x, 0.1, e.z, { n: 30, speed: 7 });
          fx.sparkle(e.x, 0.6, e.z, rgbOf(e.color), 40, 7);
          shake = Math.max(shake, 0.4);
          break;
        case "wave":
          for (let i = 0; i < 30; i++) {
            const a = (e.yaw || 0) + (Math.random() - 0.5) * (e.cone ? 1.1 : 6.28);
            const d = Math.random() * 10;
            fx.spell(e.x + Math.sin(a) * d, 0.5 + Math.random(), e.z + Math.cos(a) * d, rgbOf(e.color), 0.6, 0.6, 0.4);
          }
          break;
        case "aoe": {
          const c = rgbOf(e.color || "#ff7a2a");
          if (e.kind === "fire") fx.burst("fire", e.x, 0.1, e.z, { n: 26, size: 1.8, speed: 5 });
          else if (e.shape === "line") {
            for (let k = 0; k < 40; k++) {
              const d = (k / 40) * e.len;
              fx.spell(e.x + Math.sin(e.yaw) * d, 1.2, e.z + Math.cos(e.yaw) * d, c, 1.1, 0.5, 0.6);
            }
          } else {
            for (let k = 0; k < 36; k++) {
              const a = (k / 36) * Math.PI * 2;
              fx.spell(e.x + Math.sin(a) * e.r, 0.4, e.z + Math.cos(a) * e.r, c, 0.9, 0.6, 0.5);
            }
            fx.burst("dust", e.x, 0.1, e.z, { n: 20, speed: 6 });
          }
          shake = Math.max(shake, 0.35);
          break;
        }
        case "telegraph":
          fx.telegraph({ shape: e.shape, x: e.x, z: e.z, r: e.r, yaw: e.yaw, half: e.half, len: e.len, dur: e.dur, color: e.color, interior: true, y: g.flag("arena") ? 0 : 0 });
          break;
        case "windup":
          if (!e.melee) fx.sparkle(e.x, e.y, e.z, rgbOf(e.color || "#a35cff"), 6, 1.5, 0.18);
          break;
        case "hurt":
          shake = Math.max(shake, Math.min(0.5, e.n / 40));
          break;
        case "reveal":
          fx.sparkle(e.x, e.y + 0.3, e.z, [1, 0.9, 0.6], 24, 2.5);
          break;
        case "unlock":
        case "lift":
        case "summoned":
          fx.sparkle(e.x, e.y, e.z, [1, 0.95, 0.7], 20, 3);
          break;
        case "repair":
          fx.sparkle(e.x, e.y + 0.5, e.z, [1, 0.75, 0.3], e.big ? 70 : 40, 4, 0.3);
          break;
        case "burn":
          fx.burst("fire", e.x, 0.5, e.z, { n: 40, size: 2.2, speed: 4 });
          fx.burst("smoke", e.x, 2, e.z, { n: 10, size: 2 });
          break;
        case "brazierLit":
          fx.burst("magic", e.x, e.y + 0.4, e.z, { n: 20, color: [0.4, 0.7, 1], speed: 3 });
          break;
        case "brazierOut":
          for (const f of objViews.fires) fx.burst("smoke", f.x, f.y + 0.5, f.z, { n: 6, size: 0.8 });
          break;
        case "secretOpen":
        case "wallOpen":
        case "ancientOpen":
          fx.burst("dust", e.x, 0.5, e.z, { n: 40, speed: 4 });
          shake = Math.max(shake, 0.3);
          break;
        case "chestOpen":
          fx.sparkle(e.x, e.y + 0.6, e.z, [1, 0.85, 0.4], 36, 3.5);
          break;
        case "levelUp":
          fx.burst("level", P.x, P.y, P.z, { n: 60 });
          break;
        case "potion":
          fx.burst("heal", P.x, P.y, P.z, { n: 30 });
          break;
        case "teleport":
          fx.sparkle(P.x, P.y + 1, P.z, [0.6, 0.9, 1], 60, 6);
          break;
        case "bossDefeated":
          fx.burst("shadow", e.x, 1, e.z, { n: 60, speed: 5 });
          fx.sparkle(e.x, 1.5, e.z, [1, 0.9, 0.6], 80, 7);
          shake = 0.8;
          break;
        case "obeliskDown":
          fx.burst("magic", e.x, 4, e.z, { n: 40, color: [0.2, 1, 0.5], speed: 6 });
          fx.burst("dust", e.x, 0.5, e.z, { n: 20, speed: 4 });
          break;
        case "artifact":
          fx.sparkle(e.x, e.y + 0.6, e.z, [0.6, 0.9, 1], 60, 4);
          break;
        default:
          break;
      }
    }
  }

  /* ---------------------------------------------------------- per frame */
  function frame(dt, ctx) {
    t += dt;
    shared.time.value = t;
    const mode = ctx.mode;
    let targetAtmos = "menu";
    if (mode === "play" && ctx.G) {
      bindGame(ctx.G);
      const g = ctx.G;
      const c = g.cam;
      camPos.set(c.x, c.y, c.z);
      if (shake > 0 && ctx.shake !== false) {
        camPos.x += (Math.random() - 0.5) * shake * 0.3;
        camPos.y += (Math.random() - 0.5) * shake * 0.3;
        shake = Math.max(0, shake - dt * 2.5);
      }
      camera.position.copy(camPos);
      camera.fov += (c.fov - camera.fov) * Math.min(1, dt * 8);
      camera.updateProjectionMatrix();
      camera.lookAt(c.x + c.fx * 10, c.y + c.fy * 10, c.z + c.fz * 10);
      // cinematic intro framing in the arena
      if (g.cinematic > 0 && g.boss) {
        const e = g.boss.e;
        const k = Math.min(1, g.cinematic / 2);
        tmp.set(e.x + 6, 3.2, e.z + 9);
        camera.position.lerp(tmp, k);
        camera.lookAt(e.x, e.y + 1.7, e.z);
      }
      targetAtmos = g.region?.atmos || "grounds";
      actors?.update(g, dt);
      objViews?.update(dt);
      const tip = actors?.wandTip(actors.player);
      spellFx?.update(g, dt, camera, tip ? tip.clone() : null, actors);
      display.group.visible = false;
      // dementor chill: drift some mist around them
      for (const e of g.enemies) if (e.type === "dementor" && !e.dead && Math.random() < 0.3) fx.burst("shadow", e.x, e.y + 0.5, e.z, { n: 1, speed: 0.6 });
      // forest mist
      if (targetAtmos === "forest" && Math.random() < 0.25) fx.mist(g.player.x + (Math.random() - 0.5) * 40, 0.6, g.player.z + (Math.random() - 0.5) * 40, [0.45, 0.55, 0.5], 6, 6);
      if (targetAtmos === "hidden" && Math.random() < 0.06) fx.mist(g.player.x + (Math.random() - 0.5) * 16, 0.3, g.player.z + (Math.random() - 0.5) * 16, [0.3, 0.32, 0.4], 3, 5);
    } else {
      bindGame(null);
      // menu: a slow orbit around the courtyard at dusk; hero select: the four heroes in the courtyard
      if (mode === "select") {
        targetAtmos = "courtyard";
        camera.fov = 40;
        camera.updateProjectionMatrix();
        camera.position.set(0, 1.7, 10.5);
        camera.lookAt(0, 1.15, 2);
        showDisplay(ctx.hero);
      } else {
        targetAtmos = "menu";
        const a = t * 0.04 + 0.6;
        camera.fov = 55;
        camera.updateProjectionMatrix();
        camera.position.set(Math.sin(a) * 70, 22 + Math.sin(t * 0.1) * 3, 60 + Math.cos(a) * 50);
        camera.lookAt(0, 9, -12);
        showDisplay(null);
      }
      actors?.live && actors.player && (actors.player.root.visible = false);
    }
    // atmosphere
    atmos = targetAtmos;
    const A = sky.update(dt, atmos, camera.position, t);
    hemi.color.copy(A.hemiSky);
    hemi.groundColor.copy(A.hemiGround);
    hemi.intensity = A.hemiI + A.flash * 1.5;
    amb.intensity = A.amb;
    amb.color.copy(A.hemiSky);
    sun.color.copy(A.sun);
    sun.intensity = A.sunI + A.flash * 2;
    scene.fog.color.copy(A.fog);
    scene.fog.density = A.fogD;
    shared.fogColor.value.copy(A.fog);
    shared.fogDensity.value = A.fogD;
    renderer.toneMappingExposure = A.exposure;
    // sun shadow box follows the camera focus
    const focus = mode === "play" && ctx.G ? ctx.G.player : { x: 0, y: 0, z: 0 };
    const sd = sky.sunDir;
    sun.position.set(focus.x + sd.x * 120, focus.y + sd.y * 120 + 20, focus.z + sd.z * 120);
    sun.target.position.set(focus.x, focus.y, focus.z);
    sun.target.updateMatrixWorld();
    // candle glows bob with their candles
    for (const i of candleIdx) {
      const b = glowPts[i].bob;
      if (b.by != null) gPos[i * 3 + 1] = b.by + 0.22;
    }
    gGeo.attributes.position.needsUpdate = true;
    // fires & particles
    shared.camPos.value.copy(camera.position);
    if (hitLightT > 0) {
      hitLightT -= dt;
      hitLight.intensity = Math.max(0, hitLight.intensity - dt * 90);
    } else hitLight.intensity = 0;
    fx.update(dt, camera.position, { interior: A.indoor > 0.5, night: atmos === "arena" || atmos === "forest" || atmos === "hidden" ? 1 : 0.3, windX: 0.3, weather: atmos === "arena" ? "ash" : null, weatherAmt: atmos === "arena" ? 0.5 : 0 });
    castle.update(dt, t, { nearHall: mode === "play" && ctx.G && ctx.G.player.z < -15 && Math.abs(ctx.G.player.x) < 30 });
    outdoors.update(dt, t);
    if (castle.fountain.userData.water) castle.fountain.userData.water.opacity = 0.8 + Math.sin(t * 2) * 0.05;
    if (mode !== "play") for (let i = 0; i < 2; i++) fx.spell((Math.random() - 0.5) * 1.2, 3.6 + Math.random() * 0.2, (Math.random() - 0.5) * 1.2, [0.6, 0.8, 1], 0.25, 0.8, 0.3);
    renderer.render(scene, camera);
    return A;
  }

  /** Menu/hero-select: show the four heroes side by side. */
  function showDisplay(hero) {
    if (!assets) return;
    display.group.visible = hero != null;
    if (hero == null) return;
    if (!display.chars.size)
      HERO_IDS.forEach((h, i) => {
        const c = createCharacter(assets, wizardLook(HEROES[h].look));
        c.setWeapon("wand");
        c.root.position.set((i - 1.5) * 1.6, 0, 3.5);
        c.root.rotation.y = 0;
        display.group.add(c.root);
        display.chars.set(h, c);
      });
    let i = 0;
    for (const [h, c] of display.chars) {
      const sel = h === hero;
      const x = (i - 1.5) * 1.6;
      c.root.position.x += (x - c.root.position.x) * 0.2;
      c.root.position.z += ((sel ? 4.6 : 3.4) - c.root.position.z) * 0.15;
      c.anim.set("lower", "Idle");
      c.anim.set("upper", sel ? "CastIdle" : "Idle");
      c.anim.set("full", null);
      c.anim.update(1 / 60);
      c.capeUpdate(1 / 60, 0, 0);
      c.setHit(0);
      i++;
    }
  }

  return {
    ready,
    renderer,
    camera,
    scene,
    resize(w, h) {
      W = Math.max(1, w);
      H = Math.max(1, h);
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      shared.pointScale.value = (H / 2) / Math.tan((camera.fov * Math.PI) / 360) * 0.9;
    },
    frame,
    onEvents,
    get quality() {
      return quality;
    },
    setQuality(q) {
      quality = q === "auto" ? autoQuality() : q;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q().pixel));
      renderer.shadowMap.enabled = Q().shadow > 0;
      sun.castShadow = Q().shadow > 0;
      if (Q().shadow) {
        sun.shadow.mapSize.set(Q().shadow, Q().shadow);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
      renderer.setSize(W, H, false);
      scene.traverse((o) => {
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
      });
    },
    /** Project a world point to stage pixels (null when behind the camera). */
    project(x, y, z) {
      tmp.set(x, y, z).project(camera);
      if (tmp.z > 1) return null;
      return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H };
    },
    dispose() {
      bindGame(null);
      actors?.dispose();
      for (const c of display.chars.values()) c.dispose();
      castle.dispose();
      outdoors.dispose();
      sky.dispose();
      fx.dispose();
      gGeo.dispose();
      gMat.dispose();
      disposeTextures();
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    },
  };
}

function autoQuality() {
  if (typeof navigator === "undefined") return "medium";
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && !matchMedia?.("(hover: hover)")?.matches);
  if (mobile) return "low";
  return (navigator.hardwareConcurrency || 4) >= 8 ? "high" : "medium";
}
