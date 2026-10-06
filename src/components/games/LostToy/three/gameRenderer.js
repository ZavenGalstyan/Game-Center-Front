/**
 * Lost Toy — per-scene orchestrator. Owns every Three object for one mounted
 * canvas and drives, each frame:
 *
 *   input → engine (fixed step, clamped dt) → events (audio / particles /
 *   toy reactions / camera impulses / UI) → camera rig → toy pose → level,
 *   room and effects
 *
 * React never re-renders per frame: the optional timer, the fall fade and the
 * contextual "E" prompt are written straight to DOM nodes (dom.*); the UI
 * polls `live` / the world at a low rate for everything else.
 *
 * mode: "game" (play a level) | "menu" (cinematic idle scene, no input)
 */
import * as THREE from "three";
import { stepWorld, drainEvents } from "../engine/world.js";
import { createCamera, updateCamera, snapCamera, addImpulse, CAM } from "../engine/camera.js";
import { groundBelow } from "../engine/collision.js";
import { STATES as S } from "../engine/config.js";
import { buildToy, updateToy, toyEvent } from "./toy.js";
import { buildLevelMeshes } from "./levelMeshes.js";
import { buildRoom } from "./room.js";
import { createEffects } from "./effects.js";
import { sound } from "../audio/sound.js";

export const formatTime = (t) => {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
};

const DUST = { wood: "#e9d8c0", paper: "#f6efe0", fabric: "#f1e6d8", cardboard: "#d9b98f", grass: "#b9d98a", stone: "#d8d5cf", tile: "#f4f4f4", metal: "#e4e6ea", plastic: "#f4f0e6", ceramic: "#f7f3ea", rubber: "#d9d9d9", soil: "#a88a6a", wall: "#efe6d2", water: "#cfeaff" };

export function createGameRenderer({ scene, camera, gl, W, theme, settingsRef, cosmetic, touch, mode = "game", onEvent, dom = {} }) {
  const settings = settingsRef.current;
  const quality = settings.graphics;
  const shadows = quality !== "low";
  gl.shadowMap.enabled = shadows;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = theme.exposure || 1;
  gl.outputColorSpace = THREE.SRGBColorSpace;

  scene.background = new THREE.Color(theme.background);
  scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);

  /* ---------------- lights */
  const lights = new THREE.Group();
  scene.add(lights);
  const hemi = new THREE.HemisphereLight(theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity);
  lights.add(hemi);
  const room = W.level.room || { x0: -30, x1: 30, z0: -30, z1: 30, h: 26 };
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;
  const span = Math.hypot(room.x1 - room.x0, room.z1 - room.z0) / 2 + 6;
  const sunDir = new THREE.Vector3(...theme.sun.pos).normalize();
  const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.intensity);
  sun.position.set(cx + sunDir.x * 120, sunDir.y * 120, cz + sunDir.z * 120);
  sun.target.position.set(cx, 0, cz);
  lights.add(sun);
  lights.add(sun.target);
  if (shadows) {
    sun.castShadow = true;
    const size = quality === "high" ? 4096 : 2048;
    sun.shadow.mapSize.set(size, size);
    const sc = sun.shadow.camera;
    sc.left = -span;
    sc.right = span;
    sc.top = span;
    sc.bottom = -span;
    sc.near = 20;
    sc.far = 260;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = quality === "high" ? 4 : 3;
    sc.updateProjectionMatrix();
  }
  // soft bounce light from the room side opposite the sun (never pitch-black corners)
  const fill = new THREE.DirectionalLight(theme.fill.color, theme.fill.intensity);
  fill.position.set(cx - sunDir.x * 80, 40, cz - sunDir.z * 80);
  fill.target.position.set(cx, 0, cz);
  lights.add(fill);
  lights.add(fill.target);
  // lamps / night lights from the level (count capped by quality)
  const cap = quality === "high" ? 6 : quality === "medium" ? 3 : 1;
  const pointLights = [];
  for (const L of (W.level.lights || []).slice(0, cap)) {
    const p = new THREE.PointLight(L.color, L.intensity * (theme.night ? 1.6 : 1), L.distance, 1.6);
    p.position.set(L.x, L.y, L.z);
    lights.add(p);
    pointLights.push({ p, base: p.intensity, kind: L.kind });
  }

  /* ---------------- world */
  const shell = buildRoom(scene, W.level, theme, quality, { shadows });
  const level = buildLevelMeshes(scene, W, theme, quality, { shadows });
  const toy = buildToy(cosmetic, { shadows });
  scene.add(toy.root);
  scene.add(toy.blob);
  const fx = createEffects(scene, { quality, motion: !settings.reducedMotion });

  const cam = createCamera(W.player, W.level.spawn.yaw || 0);
  snapCamera(cam, W, W.level.spawn.yaw || 0);
  camera.near = 0.04;
  camera.far = 520;
  camera.fov = CAM.FOV;
  camera.updateProjectionMatrix();

  const live = { paused: false, finished: false, finishT: 0, time: 0, prompt: null };
  let finishCam = 0;
  let menuT = 0;
  let menuView = "wide";
  let viewK = 0;
  const lookAt = new THREE.Vector3();
  let timerShown = "";
  let promptShown = null;
  let pushSound = false;

  const ctxBase = { motion: !settings.reducedMotion, camera, clock: 0 };

  function handleEvents(events) {
    const s = settingsRef.current;
    const P = W.player;
    for (const e of events) {
      toyEvent(toy, e);
      level.onEvent(e);
      switch (e.type) {
        case "step":
          sound.step(e.mat, e.sprint, P.inShallow);
          if (P.inShallow) fx.splash(e.x, e.y, e.z, 2);
          else if (e.sprint || e.mat === "fabric" || e.mat === "grass" || e.mat === "soil") fx.puff(e.x, e.y, e.z, e.sprint ? 2 : 1, DUST[e.mat] || DUST.wood, 0.3);
          break;
        case "jump":
          sound.jump(e.soft);
          fx.puff(e.x, e.y, e.z, 3, DUST[P.groundMat] || DUST.wood, 0.4);
          break;
        case "land":
          sound.land(e.hard, e.mat);
          fx.puff(e.x, e.y, e.z, e.hard ? 10 : 4, DUST[e.mat] || DUST.wood, e.hard ? 0.9 : 0.5);
          if (e.hard) addImpulse(cam, 0.55, s);
          else if (e.impact > 7) addImpulse(cam, 0.15, s);
          break;
        case "bounce":
          sound.bounce(e.strength);
          fx.fluff(e.x, e.y, e.z, 9, e.mat === "fabric" ? "#fffaf0" : "#ffffff");
          addImpulse(cam, 0.2, s);
          break;
        case "ledge":
          sound.ledge();
          break;
        case "pullup":
          sound.pullup();
          break;
        case "climbStart":
          sound.climb(e.mat);
          break;
        case "pushStart":
          break;
        case "pushLand":
          sound.pushLand(e.mat);
          fx.puff(e.x, e.y, e.z, 14, DUST.wood, 1.2);
          addImpulse(cam, 0.35, s);
          break;
        case "stumble":
          sound.stumble();
          fx.puff(P.x, P.y, P.z, 5, DUST.wood, 0.6);
          break;
        case "hurt":
          sound.hurt();
          fx.sparkle(e.x, e.y + 0.6, e.z, 10, "#ffffff", 1.2);
          break;
        case "hazard":
          sound.hazard(e.kind);
          if (e.kind === "drip" || e.kind === "sprinkler") fx.splash(e.x, e.y + 0.6, e.z, 10);
          break;
        case "button":
          sound.button(e.count);
          fx.sparkle(e.x, e.y, e.z, 26, "#ffd36e", 1.6);
          break;
        case "checkpoint":
          sound.checkpoint();
          fx.sparkle(e.x, e.y + 1.4, e.z, 16, "#ffcf6e", 1.0);
          break;
        case "interact":
          sound.interact(e.kind);
          fx.sparkle(e.x, e.y + 1, e.z, 8, "#ffffff", 0.8);
          break;
        case "ride":
          sound.ride();
          break;
        case "petWarn":
          if (e.pet === "dog") sound.bark(e.dist);
          else sound.meow(e.dist);
          break;
        case "petMeet":
          if (e.pet === "dog") sound.sniff();
          else sound.purr();
          break;
        case "petBump":
          sound.stumble();
          break;
        case "finish":
          sound.finish();
          live.finished = true;
          live.finishT = 0;
          fx.confetti(P.x, P.y, P.z, 90);
          break;
        case "fall":
          sound.fall(e.reason);
          if (e.reason === "water") fx.splash(e.x, e.y + 0.2, e.z, 24);
          break;
        case "respawn":
        case "restart":
          if (e.type === "respawn") sound.respawn();
          snapCamera(cam, W, e.yaw || 0);
          fx.clear();
          fx.sparkle(e.x, e.y + 0.5, e.z, 14, "#ffe9b0", 0.9);
          finishCam = 0;
          live.finished = W.finished;
          updateToy(toy, W.player, 0, { snap: true, W });
          break;
        default:
      }
      if (onEvent) onEvent(e);
    }
  }

  function groundY(P) {
    const g = groundBelow(W.C, P.x, P.y + 0.05, P.z, 0.12, 40, 0.05);
    return g ? g.max[1] : null;
  }

  function ambientAudio(P) {
    // continuous sounds by proximity (no sound for things far across the room)
    let vac = 0;
    let fan = 0;
    let water = 0;
    for (const h of W.hazards) {
      const d = Math.hypot(P.x - h.x, P.z - h.z);
      if (h.type === "vacuum" && h.on) vac = Math.max(vac, 1 - d / 22);
      if (h.type === "wind" && h.on && h.look === "fan") fan = Math.max(fan, 1 - d / 14);
      if (h.type === "water" || h.type === "sprinkler") water = Math.max(water, (h.type === "sprinkler" && !h.on ? 0.3 : 1) * (1 - d / 14));
    }
    let motor = 0;
    for (const M of W.movers) {
      if (!M.active || (M.kind !== "car" && M.kind !== "vacuum" && M.kind !== "train")) continue;
      const b = M.box;
      const d = Math.hypot(P.x - (b.min[0] + b.max[0]) / 2, P.z - (b.min[2] + b.max[2]) / 2);
      motor = Math.max(motor, 1 - d / 12);
    }
    for (const pet of W.pets) if (pet.cur.speed > 0.4) sound.petStep(pet.dist);
    sound.vacuum(Math.max(0, vac));
    sound.fan(Math.max(0, fan));
    sound.water(Math.max(0, water));
    sound.motor(Math.max(0, motor));
    const pushing = P.state === S.PUSH && Math.hypot(P.vx, P.vz) > 0.2;
    if (pushing !== pushSound) {
      sound.push(pushing);
      pushSound = pushing;
    }
  }

  function frame(dt, input, extraRaw) {
    const s = settingsRef.current;
    const P = W.player;
    dt = Math.min(dt, 0.1);
    ctxBase.motion = !s.reducedMotion;
    ctxBase.clock = W.clock;

    if (mode === "menu") {
      menuT += dt;
      stepWorld(W, { ax: 0, ay: 0, edges: {} }, dt); // movers / pets keep living
      drainEvents(W);
      const close = menuView === "toy";
      viewK += ((close ? 1 : 0) - viewK) * (1 - Math.exp(-2.6 * dt));
      const ly = W.level.spawn.yaw || 0;
      const fx0 = Math.sin(ly);
      const fz0 = Math.cos(ly);
      const lx = fz0;
      const lz = -fx0;
      // wide: low on the floor, a little behind and beside the toy, looking up into the giant room
      const a = Math.sin(menuT * 0.06) * 0.18;
      const wx = P.x - fx0 * 3.2 + lx * (2.6 + a);
      const wy = P.y + 0.55 + Math.sin(menuT * 0.11) * 0.08;
      const wz = P.z - fz0 * 3.2 + lz * (2.6 + a);
      const tx = P.x + fx0 * 10 - lx * 3;
      const ty = P.y + 2.2 + Math.sin(menuT * 0.07) * 0.3;
      const tz = P.z + fz0 * 10 - lz * 3;
      // close-up on the toy (customisation)
      const rx = P.x + fx0 * 1.9 + lx * 0.55;
      const ry = P.y + 0.75;
      const rz = P.z + fz0 * 1.9 + lz * 0.55;
      const qx = P.x - lx * 0.45;
      const qy = P.y + 0.55;
      const qz = P.z - lz * 0.45;
      camera.position.set(lerp(wx, rx, viewK), lerp(wy, ry, viewK), lerp(wz, rz, viewK));
      // Pip turns three-quarters toward the camera, gazing past it into the room
      P.yaw = Math.atan2(wx - P.x, wz - P.z) + 0.75 * (1 - viewK) + 0.35 * viewK;
      updateToy(toy, P, dt, { menu: true, W, groundY: groundY(P) });
      lookAt.set(lerp(tx, qx, viewK), lerp(ty, qy, viewK), lerp(tz, qz, viewK));
      camera.lookAt(lookAt);
      camera.fov = lerp(58, 34, viewK);
      camera.updateProjectionMatrix();
      // passing cloud shadows: the sun breathes a little
      sun.intensity = theme.sun.intensity * (s.reducedMotion ? 1 : 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(menuT * 0.23) * Math.sin(menuT * 0.11 + 1)));
      ctxBase.clock = menuT;
      level.update(dt, ctxBase);
      shell.update(dt, ctxBase);
      fx.update(dt, camera, pxScale());
      return;
    }

    if (!live.paused) {
      const raw = extraRaw || (live.bot ? live.bot(dt) : input.frame());
      if (live.bot) cam.yaw = raw.yaw;
      const [ldx, ldy] = input.consumeLook();
      stepWorld(W, raw, dt);
      handleEvents(drainEvents(W));
      if (live.finished) {
        live.finishT += dt;
        finishCam = Math.min(1, finishCam + dt * 0.8);
        // swing round to the front of the celebrating toy
        const want = P.yaw + Math.PI;
        let dyaw = want - cam.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        if (live.finishT > 0.4) cam.yaw += dyaw * (1 - Math.exp(-1.8 * dt));
        cam.pitch += (0.12 - cam.pitch) * (1 - Math.exp(-2 * dt));
        updateCamera(cam, W, 0, 0, dt, { ...s, touch });
      } else updateCamera(cam, W, ldx, ldy, dt, { ...s, touch });
      ambientAudio(P);
    } else {
      input.consumeLook();
    }

    ctxBase.clock = W.clock;
    updateToy(toy, P, live.paused ? 0 : dt, { W, groundY: groundY(P) });
    level.update(live.paused ? 0 : dt, ctxBase);
    shell.update(live.paused ? 0 : dt, ctxBase);

    camera.position.set(cam.x, cam.y, cam.z);
    lookAt.set(cam.px, cam.py + cam.aimY - (live.finished ? 0.15 * finishCam : 0), cam.pz);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookAt);
    if (cam.roll) camera.rotateZ(cam.roll);
    if (Math.abs(camera.fov - cam.fov) > 0.01) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    // a camera squeezed right behind the toy fades it so the way ahead stays visible
    const hd = Math.hypot(camera.position.x - P.x, camera.position.y - (P.y + 0.6), camera.position.z - P.z);
    toy.setFade(live.finished ? 1 : Math.min(1, Math.max(0.6, (hd - 0.4) / 0.6)));
    for (const L of pointLights) if (L.kind === "night") L.p.intensity = L.base * (s.reducedMotion ? 1 : 0.92 + Math.sin(W.clock * 1.7) * 0.08);
    fx.update(live.paused ? 0 : dt, camera, pxScale());
    if (P.state === S.PUSH && !live.paused && Math.random() < 0.25) {
      const pu = P.push;
      if (pu) fx.puff(P.x - pu.nx * 0.4, P.y, P.z - pu.nz * 0.4, 1, DUST.wood, 0.3);
    }

    // DOM fast-path: timer + fade + contextual prompt
    live.time = W.finished ? W.finishTime : W.time;
    if (dom.timer) {
      const txt = formatTime(live.time);
      if (txt !== timerShown) {
        dom.timer.textContent = txt;
        timerShown = txt;
      }
    }
    if (dom.fade) {
      let a = 0;
      if (P.state === S.FALLING_OUT) a = Math.min(1, W.fadeT / W.T.FALL_FADE_TIME);
      else if (P.state === S.RESPAWN) a = 1 - Math.min(1, W.respawnT / W.T.RESPAWN_TIME);
      dom.fade.style.opacity = a.toFixed(3);
    }
    const near = !live.paused && !W.finished ? W.nearInteract : null;
    const pr = near ? near.label || "Interact" : null;
    if (dom.prompt && pr !== promptShown) {
      promptShown = pr;
      dom.prompt.className = pr ? "lt-prompt is-on" : "lt-prompt";
      const t = dom.prompt.querySelector("[data-label]");
      if (t && pr) t.textContent = pr;
    }
  }

  function pxScale() {
    const h = gl.domElement.clientHeight || 600;
    return (h * Math.min(2, gl.getPixelRatio())) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }

  function setPaused(p) {
    live.paused = p;
    if (p) {
      sound.stopLoops();
      pushSound = false;
    }
  }

  function setCosmetic(id) {
    scene.remove(toy.root);
    scene.remove(toy.blob);
    toy.dispose();
    const nt = buildToy(id, { shadows });
    Object.assign(toy, nt);
    scene.add(toy.root);
    scene.add(toy.blob);
  }

  function dispose() {
    sound.stopLoops();
    scene.remove(lights);
    for (const L of pointLights) L.p.dispose();
    sun.dispose();
    fill.dispose();
    hemi.dispose();
    if (sun.shadow && sun.shadow.map) sun.shadow.map.dispose();
    scene.remove(toy.root);
    scene.remove(toy.blob);
    toy.dispose();
    level.dispose();
    shell.dispose();
    fx.dispose();
    scene.fog = null;
    scene.background = null;
  }

  return {
    frame,
    dispose,
    setPaused,
    live,
    cam,
    toy,
    setCosmetic,
    setMenuView: (v) => {
      menuView = v;
    },
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
