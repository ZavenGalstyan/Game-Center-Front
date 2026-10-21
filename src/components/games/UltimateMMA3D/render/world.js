/**
 * The 3D world: renderer + scene + arena + fighters + referee + camera + FX.
 *
 * The React shell owns the requestAnimationFrame loop and calls
 * `world.frame(realDt)`. When a Match is attached the world advances it at a
 * FIXED timestep (SIM_DT) with an accumulator — gameplay speed never depends
 * on the monitor's refresh rate — calling `beforeStep()` (player input / AI)
 * before every step, and renders fighters interpolated between the last two
 * sim states. React is never updated from here per frame; the shell polls.
 *
 * Quality presets:  low    no shadows, ≤0.75 px ratio, thin crowd
 *                   medium 1024² shadows, ≤1.25 px ratio
 *                   high   2048² soft shadows, ≤2 px ratio, MSAA + subtle bloom
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SIM_DT } from "../engine/constants.js";
import { ARENA_BY_ID } from "../data/arenas.js";
import { loadAssets } from "./assets.js";
import { createRig } from "./rig.js";
import { createAnimator } from "./animator.js";
import { targetsFor, applyLook } from "./fighterView.js";
import { buildArena } from "./arena.js";
import { createDirector } from "./camera.js";
import { createFx } from "./fx.js";
import { loadReferee, createReferee } from "./referee.js";

const PR = { low: 0.75, medium: 1.25, high: 2 };

export function createWorld(host, { quality = "high", test = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "umc-canvas";
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== "low", powerPreference: "high-performance", preserveDrawingBuffer: test });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.05, 220);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.5;
  const director = createDirector(camera);
  const fx = createFx(scene);

  let W = 1280;
  let H = 720;
  let q = quality;
  let composer = null;
  let bloom = null;
  let arena = null;
  let arenaId = null;
  let assets = null;
  let refAssets = null;
  let referee = null;
  const views = []; // [{rig, anim, prev:{x,z,yaw}, side}]
  let match = null;
  let playerSide = 0;
  let acc = 0;
  let evCursor = 0;
  let excite = 0.2;
  let refGesture = { name: null, t: 0, target: null };
  let showcaseView = null;
  let introT = -1;
  let replay = null; // { frames, i, t }
  const record = []; // ring of recent frames for replays
  const listeners = new Set();
  let paused = false;
  let simSpeed = 1;
  let disposed = false;
  let beforeStep = null;

  /* ------------------------------------------------------------ setup */
  const ready = Promise.all([
    loadAssets(),
    loadReferee().catch(() => null), // referee is optional: the fight works without him
  ]).then(([a, r]) => {
    assets = a;
    refAssets = r;
    return true;
  });

  function setupComposer() {
    if (composer) {
      composer.passes.forEach((p) => p.dispose?.());
      composer.dispose();
    }
    composer = null;
    bloom = null;
    if (q !== "high") return;
    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.16, 0.4, 0.97);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PR[q]));
    composer.setSize(W, H);
  }

  function resize(w, h) {
    W = Math.max(2, Math.floor(w));
    H = Math.max(2, Math.floor(h));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PR[q]));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    composer?.setPixelRatio(Math.min(window.devicePixelRatio || 1, PR[q]));
    composer?.setSize(W, H);
    fx.setScale(H);
  }

  function setQuality(nq) {
    q = nq;
    renderer.shadowMap.enabled = q !== "low";
    setupComposer();
    resize(W, H);
    if (arenaId) {
      const id = arenaId;
      arenaId = null;
      setArena(id);
    }
  }

  function setArena(id) {
    if (id === arenaId && arena) return;
    if (arena) {
      scene.remove(arena.group);
      arena.dispose();
    }
    const A = ARENA_BY_ID[id] || ARENA_BY_ID.underground;
    arena = buildArena(A, { quality: q, renderer });
    arenaId = A.id;
    scene.add(arena.group);
    scene.fog = new THREE.Fog(A.fog.color, A.fog.near, A.fog.far);
    scene.background = new THREE.Color(A.sky);
    scene.environmentIntensity = A.env;
    director.setArenaRadius(A.radius);
  }

  /* ------------------------------------------------------------ fighters */
  function clearFighters() {
    for (const v of views) {
      scene.remove(v.rig.root);
      v.anim.dispose();
      v.rig.dispose();
    }
    views.length = 0;
    if (referee) {
      scene.remove(referee.root);
      referee.dispose();
      referee = null;
    }
    if (showcaseView) {
      scene.remove(showcaseView.rig.root);
      showcaseView.anim.dispose();
      showcaseView.rig.dispose();
      showcaseView = null;
    }
  }

  function makeView(data, side) {
    const rig = createRig(assets, data.look);
    const anim = createAnimator(rig.model, assets.clips);
    scene.add(rig.root);
    return { rig, anim, side, prev: { x: 0, z: 0, yaw: 0 } };
  }

  /** Attach a match: rigs for both fighters + referee; camera starts the intro. */
  function attachMatch(m, opts = {}) {
    clearFighters();
    match = m;
    playerSide = opts.playerSide ?? 0;
    beforeStep = opts.beforeStep || null;
    acc = 0;
    evCursor = 0;
    record.length = 0;
    replay = null;
    for (const f of m.f) {
      const v = makeView(f.data, f.side);
      v.prev = { x: f.pos.x, z: f.pos.z, yaw: f.yaw };
      views.push(v);
    }
    if (refAssets) {
      referee = createReferee(refAssets);
      referee.place(0, 2.4);
      scene.add(referee.root);
    }
    introT = opts.intro === false ? -1 : 0;
    director.setMode(introT >= 0 ? "intro" : "fight", true);
  }

  function detachMatch() {
    match = null;
    clearFighters();
    director.setMode("menu");
  }

  /** Fighter-select / menu showcase: one rig in the middle of the cage. */
  function showcase(data, opts = {}) {
    if (match) return;
    if (showcaseView && showcaseView.dataId === data.id && showcaseView.lookKey === JSON.stringify(data.look)) return;
    clearFighters();
    showcaseView = makeView(data, 0);
    showcaseView.dataId = data.id;
    showcaseView.lookKey = JSON.stringify(data.look);
    showcaseView.rig.root.position.set(0, 0, 0);
    showcaseView.rig.root.rotation.y = 0;
    showcaseView.pose = opts.pose || "Walkout";
    director.setMode("showcase");
  }
  function hideShowcase() {
    if (showcaseView) {
      scene.remove(showcaseView.rig.root);
      showcaseView.anim.dispose();
      showcaseView.rig.dispose();
      showcaseView = null;
    }
    if (!match) director.setMode("menu");
  }

  /* ------------------------------------------------------------ events → fx */
  function handleEvents() {
    if (!match) return;
    const [evs, cur] = match.eventsSince(evCursor);
    evCursor = cur;
    for (const e of evs) {
      for (const l of listeners) l(e);
      if (e.type === "hit" && e.pos) {
        const heavy = e.heavy || e.counter;
        fx.burst(e.pos, { n: heavy ? 22 : 10, color: "#dbe8ff", speed: heavy ? 2.8 : 1.8, sz: heavy ? 0.06 : 0.045 });
        if (heavy) director.shake(0.04);
        excite = Math.min(1, excite + (heavy ? 0.25 : 0.08));
      } else if (e.type === "block" && e.pos) {
        fx.burst(e.pos, { n: 5, color: "#ffffff", speed: 1, sz: 0.035 });
      } else if (e.type === "gnp" && e.pos && !e.blocked) {
        fx.burst(e.pos, { n: 8, color: "#dbe8ff", speed: 1.4, sz: 0.04 });
        excite = Math.min(1, excite + 0.06);
      } else if (e.type === "knockdown") {
        director.shake(0.09);
        excite = 1;
        refGesture = { name: "Interact", t: 1.4, target: match.f[e.side].pos };
      } else if (e.type === "takedown") {
        excite = Math.min(1, excite + 0.35);
        director.shake(0.03);
      } else if (e.type === "sub" || e.type === "tdTry") {
        excite = Math.min(1, excite + 0.2);
      } else if (e.type === "finish") {
        excite = 1;
        if (e.method !== "DEC" && e.method !== "DRAW") refGesture = { name: "Wave", t: 3.5, target: match.f[1 - e.winner]?.pos };
      } else if (e.type === "ref" || e.type === "clinchBreak" || e.type === "standup") {
        refGesture = { name: "Interact", t: 1.0, target: null };
      }
    }
  }

  /* ------------------------------------------------------------ per-frame */
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  function stepSim(dt) {
    if (!match || paused || replay) return;
    acc += Math.min(dt, 0.1) * simSpeed;
    let n = 0;
    while (acc >= SIM_DT && n < 8) {
      for (const v of views) {
        const f = match.f[v.side];
        v.prev = { x: f.pos.x, z: f.pos.z, yaw: f.yaw };
      }
      beforeStep?.(SIM_DT);
      match.step(SIM_DT);
      acc -= SIM_DT;
      n++;
    }
    if (n === 8) acc = 0;
  }

  function placeViews(dt) {
    const alpha = replay ? 1 : Math.min(1, acc / SIM_DT);
    for (const v of views) {
      const f = match.f[v.side];
      let yaw = f.yaw;
      let d = yaw - v.prev.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      v.rig.root.position.set(v.prev.x + (f.pos.x - v.prev.x) * alpha, 0, v.prev.z + (f.pos.z - v.prev.z) * alpha);
      v.rig.root.rotation.y = v.prev.yaw + d * alpha;
      if (!replay) {
        const T = targetsFor(f, match, assets.clips);
        v.anim.update(T, dt * (match.slowT > 0 ? match.slowmo : 1) * (match.hitstop > 0 ? 0.3 : 1));
        applyLook(v.rig, f, match);
      }
    }
  }

  function updateReferee(dt) {
    if (!referee || !match) return;
    const a = match.f[0].pos;
    const b = match.f[1].pos;
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L;
    dz /= L;
    // far side from the camera
    let nx = -dz;
    let nz = dx;
    if ((camera.position.x - mid.x) * nx + (camera.position.z - mid.z) * nz > 0) {
      nx = -nx;
      nz = -nz;
    }
    const near = match.ground || match.clinch || match.sub ? 1.5 : 2.3;
    let tx = mid.x + nx * near;
    let tz = mid.z + nz * near;
    let gesture = null;
    if (refGesture.t > 0) {
      refGesture.t -= dt;
      gesture = refGesture.name;
      if (refGesture.target) {
        tx = mid.x + nx * 0.9;
        tz = mid.z + nz * 0.9;
      }
    }
    if (introT >= 0 && introT > 9.6) {
      tx = mid.x + nx * 1.0;
      tz = mid.z + nz * 1.0;
    }
    const r = Math.hypot(tx, tz);
    if (r > 3.7) {
      tx *= 3.7 / r;
      tz *= 3.7 / r;
    }
    referee.update(dt, { x: tx, z: tz }, mid, gesture);
  }

  function recordFrame() {
    if (!match || replay) return;
    if (match.phase !== "fight" && !(match.phase === "stopped" && match.phaseT < 1.2)) return;
    record.push({
      t: match.time,
      f: views.map((v) => ({ x: v.rig.root.position.x, z: v.rig.root.position.z, yaw: v.rig.root.rotation.y, a: v.anim.capture() })),
    });
    while (record.length && record[record.length - 1].t - record[0].t > 5) record.shift();
  }

  /** Start a slow-motion replay of the last `secs` seconds. Returns false if nothing recorded. */
  function startReplay(secs = 3.2) {
    if (record.length < 10) return false;
    const end = record[record.length - 1].t;
    const frames = record.filter((r) => r.t >= end - secs);
    replay = { frames, t: frames[0].t, end, speed: 0.4 };
    if (referee) referee.root.visible = false; // keep the replay camera's view clear
    const loser = match?.result ? match.f[1 - match.result.winner] : null;
    director.setMode("replay", true);
    replay.focus = loser ? new THREE.Vector3(loser.pos.x, 0, loser.pos.z) : new THREE.Vector3();
    return true;
  }
  function stopReplay() {
    replay = null;
    if (referee) referee.root.visible = true;
  }
  function stepReplay(dt) {
    replay.t += dt * replay.speed;
    const fr = replay.frames;
    let i = 0;
    while (i < fr.length - 1 && fr[i + 1].t <= replay.t) i++;
    const F = fr[i];
    F.f.forEach((s, k) => {
      const v = views[k];
      v.rig.root.position.set(s.x, 0, s.z);
      v.rig.root.rotation.y = s.yaw;
      v.anim.restore(s.a);
    });
    if (replay.t >= replay.end) {
      replay = null;
      if (referee) referee.root.visible = true;
      for (const l of listeners) l({ type: "replayEnd" });
    }
  }

  function frame(rdt) {
    if (disposed || !assets) return;
    const dt = Math.min(0.1, Math.max(0, rdt));
    if (introT >= 0 && match) introT += dt;
    if (replay) stepReplay(dt);
    else stepSim(dt);
    handleEvents();
    excite += (0.22 - excite) * Math.min(1, dt * 0.25);
    let ctx = { aspect: W / H };
    if (match) {
      placeViews(dt);
      updateReferee(dt);
      recordFrame();
      const pa = views[0].rig.root.position;
      const pb = views[1].rig.root.position;
      tmpA.copy(pa);
      tmpB.copy(pb);
      ctx = { ...ctx, a: tmpA, b: tmpB, ground: !!(match.ground || match.sub || match.transition), playerSide };
      if (introT >= 0) ctx.intro = { t: introT, a: tmpA, b: tmpB, ya: views[0].rig.root.rotation.y, yb: views[1].rig.root.rotation.y };
      if (replay) ctx.focus = replay.focus;
      if (director.mode === "victory" && match.result) {
        const w = match.f[match.result.winner] || match.f[0];
        ctx.focus = new THREE.Vector3(w.pos.x, 0, w.pos.z);
      }
      fx.update(dt, views.map((v) => {
        const f = match.f[v.side];
        const lying = match.ground || f.act.type === "down" || f.act.type === "ko" || match.sub;
        return { x: v.rig.root.position.x, z: v.rig.root.position.z, sx: lying ? 1.0 : 0.9, sz: lying ? 1.9 : 0.9, yaw: v.rig.root.rotation.y };
      }));
      if (arena) {
        const fA = match.f[0];
        const fB = match.f[1];
        const mm = Math.max(0, Math.floor(match.clock / 60));
        const ss = String(Math.max(0, Math.floor(match.clock % 60))).padStart(2, "0");
        arena.setBoard(`${fA.name.split(" ").pop().toUpperCase()}  vs  ${fB.name.split(" ").pop().toUpperCase()}`, match.cfg.title || "MAIN EVENT", match.result ? "WINNER: " + (match.result.winner >= 0 ? match.f[match.result.winner].name.toUpperCase() : "DRAW") : `ROUND ${match.round}   ${mm}:${ss}`);
      }
    } else if (showcaseView) {
      showcaseView.anim.update([{ clip: showcaseView.pose, w: 1, speed: 1 }], dt);
      ctx.focus = showcaseView.rig.root.position;
      ctx.zoom = W / H < 1.2 ? 3.6 : 2.7;
      fx.update(dt, [{ x: 0, z: 0, sx: 0.9, sz: 0.9 }, { x: 99, z: 99, sx: 0, sz: 0 }]);
    } else fx.update(dt, [{ x: 99, z: 99, sx: 0, sz: 0 }, { x: 99, z: 99, sx: 0, sz: 0 }]);
    // menus put their panels on the left: frame the showcased fighter right of centre
    if (showcaseView && !match && W / H >= 1.2) camera.setViewOffset(W, H, -W * 0.2, 0, W, H);
    else if (camera.view?.enabled) camera.clearViewOffset();
    director.update(dt, ctx);
    arena?.update(dt, { excite });
    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
  }

  setupComposer();
  return {
    ready,
    renderer,
    scene,
    camera,
    director,
    get match() {
      return match;
    },
    get assets() {
      return assets;
    },
    get introT() {
      return introT;
    },
    set introT(v) {
      introT = v;
    },
    get replaying() {
      return !!replay;
    },
    get paused() {
      return paused;
    },
    set paused(v) {
      paused = v;
    },
    set simSpeed(v) {
      simSpeed = v;
    },
    get quality() {
      return q;
    },
    get crowdCount() {
      return arena?.crowdCount || 0;
    },
    views,
    resize,
    setQuality,
    setArena,
    attachMatch,
    detachMatch,
    showcase,
    hideShowcase,
    startReplay,
    stopReplay,
    frame,
    endIntro() {
      introT = -1;
      director.setMode("fight");
    },
    victoryCam() {
      director.setMode("victory");
    },
    onEvent(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      disposed = true;
      clearFighters();
      if (arena) {
        scene.remove(arena.group);
        arena.dispose();
      }
      fx.dispose();
      composer?.passes.forEach((p) => p.dispose?.());
      composer?.dispose?.();
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    },
  };
}
