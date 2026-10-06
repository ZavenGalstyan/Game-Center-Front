/**
 * Rooftop Dash — per-scene orchestrator. Owns every Three object for one
 * mounted canvas and drives, each frame:
 *
 *   input → engine (fixed step, clamped dt) → events (audio / particles /
 *   camera impulses / UI) → camera rig → runner pose → level + city + fx
 *
 * React never re-renders per frame: the HUD timer and the fall fade are
 * written straight to DOM nodes (`dom.timer`, `dom.fade`); everything else
 * the UI needs is polled from `live` at a low rate.
 *
 * mode: "game" (play a level) | "menu" (cinematic idle scene, no stepping)
 */
import * as THREE from "three";
import { stepWorld, drainEvents } from "../engine/world.js";
import { createCamera, updateCamera, snapCamera, addImpulse } from "../engine/camera.js";
import { groundBelow } from "../engine/collision.js";
import { STATES as S } from "../engine/config.js";
import { buildRunner, updateRunner } from "./runner.js";
import { buildLevelMeshes } from "./levelMeshes.js";
import { buildEnvironment } from "./environment.js";
import { createEffects } from "./effects.js";
import { sound } from "../audio/sound.js";

const fmt = (t) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(2)}`;
};
export const formatTime = fmt;

export function createGameRenderer({ scene, camera, gl, W, theme, settingsRef, outfit, trail, touch, mode = "game", onEvent, dom = {} }) {
  const settings = settingsRef.current;
  const quality = settings.graphics;
  const shadows = quality !== "low";
  gl.shadowMap.enabled = shadows;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = theme.exposure || 1;
  gl.outputColorSpace = THREE.SRGBColorSpace;

  const env = buildEnvironment(scene, W.level, theme, quality, {});
  const level = buildLevelMeshes(scene, W, theme, quality, { shadows });
  const runner = buildRunner(outfit, { shadows });
  scene.add(runner.root);
  // night districts: a soft key light that follows the runner so it never becomes a silhouette
  const keyLight = theme.night >= 0.3 ? new THREE.PointLight(theme.key === "neon" ? "#c9d6ff" : "#ffd9b8", 5 + theme.night * 6, 9, 1.4) : null;
  if (keyLight) scene.add(keyLight);
  const placeKey = () => {
    if (!keyLight) return;
    const p = runner.root.position;
    keyLight.position.set(p.x + (camera.position.x - p.x) * 0.4, p.y + 2.3, p.z + (camera.position.z - p.z) * 0.4);
  };
  const fx = createEffects(scene, { quality, trail, motion: settings.motion && !settings.reducedMotion });

  const cam = createCamera(W.player, W.level.spawn.yaw || 0);
  cam.fov = settings.fov;
  snapCamera(cam, W, W.level.spawn.yaw || 0);
  camera.near = 0.08;
  camera.far = 1200;

  const live = { paused: false, finished: false, finishT: 0, time: 0 };
  let finishCam = 0;
  let menuT = 0;
  let menuView = "wide";
  let viewK = 0;
  const lerp = (a, b, t) => a + (b - a) * t;
  let wasDashReady = true;
  let slideOn = false;
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const hip = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  let timerShown = "";

  function handleEvents(events) {
    const s = settingsRef.current;
    for (const e of events) {
      switch (e.type) {
        case "step":
          sound.step(e.mat, e.sprint, e.wall);
          if (e.wall && W.player.wall) fx.grit(W.player.x - W.player.wall.nx * 0.35, W.player.y + 0.2, W.player.z - W.player.wall.nz * 0.35, W.player.wall.nx, W.player.wall.nz, 2);
          else if (e.sprint) fx.dust(W.player.x, W.player.y, W.player.z, 1, theme.night ? "#8a8fa8" : "#d9c9b3", 0.4);
          break;
        case "jump":
          sound.jump(e.sprint);
          fx.dust(e.x, e.y, e.z, 5, theme.night ? "#8a8fa8" : "#d9c9b3", 0.6);
          break;
        case "land":
          sound.land(e.hard, e.mat);
          fx.dust(e.x, e.y, e.z, e.hard ? 16 : 7, theme.night ? "#8a8fa8" : "#d9c9b3", e.hard ? 1.5 : 0.8);
          if (e.hard) addImpulse(cam, "land", 0.9, s);
          else if (e.impact > 9) addImpulse(cam, "land", 0.25, s);
          break;
        case "vault":
          sound.vault(e.low);
          break;
        case "slide":
          sound.slide(true);
          slideOn = true;
          break;
        case "wallrun":
          sound.wallrun();
          break;
        case "walljump":
          sound.walljump();
          fx.dust(e.x, e.y + 0.8, e.z, 6, "#e8dccb", 0.7);
          break;
        case "dash":
          sound.dash();
          addImpulse(cam, "dash", 1, s);
          fx.dust(e.x, e.y + 0.6, e.z, 4, theme.night ? "#9aa3c8" : "#e9dccb", 0.5);
          break;
        case "ledge":
          sound.ledge();
          break;
        case "climb":
          sound.climb();
          break;
        case "stumble":
          sound.stumble();
          break;
        case "hazard":
          sound.hazard(e.kind);
          if (e.kind === "zap") fx.spark(e.x, e.y + 1, e.z, "#9fe8ff", 12);
          break;
        case "crumbleStart":
          sound.crumble();
          break;
        case "star":
          sound.star(e.count);
          fx.burst(e.x, e.y, e.z, "#ffd166", 30);
          break;
        case "checkpoint":
          sound.checkpoint();
          fx.burst(e.x, e.y + 1.2, e.z, "#4cff9a", 18);
          break;
        case "finish":
          sound.finish();
          level.onFinish();
          live.finished = true;
          live.finishT = 0;
          fx.confetti(W.player.x, W.player.y, W.player.z, 120);
          break;
        case "fall":
          sound.fall();
          break;
        case "respawn":
        case "restart":
          if (e.type === "respawn") sound.respawn();
          snapCamera(cam, W, e.yaw || 0);
          fx.clear();
          finishCam = 0;
          live.finished = W.finished;
          updateRunner(runner, W.player, 0, { snap: true });
          break;
        case "flow":
          sound.flow(["GOOD", "GREAT", "SMOOTH", "PERFECT FLOW"].indexOf(e.label) + 1);
          break;
        default:
      }
      if (onEvent) onEvent(e);
    }
  }

  function frame(dt, input, extraRaw) {
    const s = settingsRef.current;
    const P = W.player;
    dt = Math.min(dt, 0.1);

    if (mode === "menu") {
      menuT += dt;
      updateRunner(runner, P, dt, { menu: true });
      // slow cinematic orbit around the runner on the roof edge ("runner" view: close-up)
      const close = menuView === "runner";
      viewK += ((close ? 1 : 0) - viewK) * (1 - Math.exp(-3 * dt));
      const ly = W.level.spawn.yaw || 0;
      const hx = Math.sin(ly);
      const hz = Math.cos(ly);
      const lx = hz; // runner's left
      const lz = -hx;
      // wide: over the runner's shoulder, out across the skyline (runner right of centre)
      const a = ly + Math.PI - 0.62 - Math.sin(menuT * 0.07) * 0.22;
      const d = 6.2 + Math.sin(menuT * 0.11) * 0.5;
      const wx = P.x + Math.sin(a) * d;
      const wy = P.y + 1.75 + Math.sin(menuT * 0.09) * 0.22;
      const wz = P.z + Math.cos(a) * d;
      const tx = P.x + hx * 3.5 + lx * 2.6;
      const ty = P.y + 1.9;
      const tz = P.z + hz * 3.5 + lz * 2.6;
      // runner close-up: in front of the runner, a touch to its left, framed right of centre
      const sway = Math.sin(menuT * 0.3) * 0.25;
      const rx = P.x + hx * 3.3 + lx * (0.9 + sway);
      const ry = P.y + 1.2;
      const rz = P.z + hz * 3.3 + lz * (0.9 + sway);
      const qx = P.x - lx * 1.15 + hx * 0.2;
      const qy = P.y + 1.0;
      const qz = P.z - lz * 1.15 + hz * 0.2;
      camera.position.set(lerp(wx, rx, viewK), lerp(wy, ry, viewK), lerp(wz, rz, viewK));
      lookAt.set(lerp(tx, qx, viewK), lerp(ty, qy, viewK), lerp(tz, qz, viewK));
      camera.lookAt(lookAt);
      camera.fov = lerp(52, 40, viewK);
      camera.updateProjectionMatrix();
      level.update(dt, { W, clock: menuT, fx, cam: camera.position, groundY: P.y });
      env.update(dt, P);
      placeKey();
      fx.update(dt, { camera, pxScale: pxScale(), hip: null, trail: false, speedK: 0, fwd, right });
      return;
    }

    if (!live.paused) {
      const raw = extraRaw || input.frame();
      const [ldx, ldy] = input.consumeLook();
      // camera yaw from last frame drives this frame's movement direction
      stepWorld(W, raw, dt);
      handleEvents(drainEvents(W));
      if (live.finished) {
        live.finishT += dt;
        finishCam = Math.min(1, finishCam + dt * 0.7);
        // swing round to the front of the celebrating runner
        const want = P.yaw + Math.PI;
        let dyaw = want - cam.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        if (live.finishT > 0.6) cam.yaw += dyaw * (1 - Math.exp(-1.6 * dt));
        updateCamera(cam, W, 0, 0, dt, { ...s, touch });
      } else updateCamera(cam, W, ldx, ldy, dt, { ...s, touch });
    } else {
      input.consumeLook();
    }

    // runner + world visuals
    updateRunner(runner, P, live.paused ? 0 : dt, {});
    const gb = groundBelow(W.C, P.x, P.y + 0.05, P.z, 0.15, 60, 0.05);
    level.update(live.paused ? 0 : dt, { W, clock: W.clock, fx, cam: camera.position, groundY: gb ? gb.max[1] : null });
    env.update(dt, P);

    // camera apply
    camera.position.set(cam.x, cam.y, cam.z);
    lookAt.set(cam.px, cam.py + (live.finished ? -0.2 * finishCam : 0), cam.pz);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookAt);
    if (cam.roll) camera.rotateZ(cam.roll);
    if (Math.abs(camera.fov - cam.fov) > 0.01) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, camera.up).normalize();
    placeKey();

    // trail + streaks + particles
    runner.body.getWorldPosition(hip);
    const sp = Math.hypot(P.vx, P.vz);
    const motion = s.motion && !s.reducedMotion;
    fx.update(live.paused ? 0 : dt, {
      camera,
      pxScale: pxScale(),
      hip,
      trail: P.state === S.DASH || (P.sprinting && sp > 9.4) || (P.state === S.WALLRUN && motion),
      speedK: motion ? Math.max(0, Math.min(1, (sp - 8.5) / 6)) * (P.state === S.DASH ? 1.4 : 1) : 0,
      fwd,
      right,
    });
    if (P.state === S.SLIDE && !live.paused && Math.random() < 0.6) fx.dust(P.x, P.y, P.z, 1, theme.night ? "#8a8fa8" : "#d9c9b3", 0.3);
    if (slideOn && P.state !== S.SLIDE) {
      sound.slide(false);
      slideOn = false;
    }

    // continuous audio
    if (!live.paused) sound.wind(Math.min(1, sp / 14 + (P.grounded ? 0 : Math.min(0.6, -P.vy / 30))), !P.grounded);
    const dashReady = P.grounded ? P.dashCooldown <= 0 : P.airDash;
    if (dashReady && !wasDashReady && !live.paused) sound.dashReady();
    wasDashReady = dashReady;

    // DOM fast-path: timer + fade + dash pip
    live.time = W.finished ? W.finishTime : W.time;
    const txt = fmt(live.time);
    if (dom.timer && txt !== timerShown) {
      dom.timer.textContent = txt;
      timerShown = txt;
    }
    if (dom.fade) {
      let a = 0;
      if (P.state === S.FALLING_OUT) a = Math.min(1, W.fadeT / W.T.FALL_FADE_TIME);
      else if (P.state === S.RESPAWN) a = 1 - Math.min(1, W.respawnT / W.T.RESPAWN_TIME);
      dom.fade.style.opacity = a.toFixed(3);
    }
    if (dom.dash) {
      const cls = dashReady ? "rd-dash rd-dash--ready" : "rd-dash";
      if (dom.dash.className !== cls) dom.dash.className = cls;
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
      slideOn = false;
    }
  }

  function setOutfit(id) {
    scene.remove(runner.root);
    runner.dispose();
    const nr = buildRunner(id, { shadows });
    Object.assign(runner, nr);
    scene.add(runner.root);
  }

  function dispose() {
    sound.stopLoops();
    if (keyLight) {
      scene.remove(keyLight);
      keyLight.dispose();
    }
    scene.remove(runner.root);
    runner.dispose();
    level.dispose();
    env.dispose();
    fx.dispose();
  }

  return {
    frame,
    dispose,
    setPaused,
    live,
    cam,
    runner,
    setOutfit,
    setTrail: (id) => fx.setTrail(id),
    setMenuView: (v) => {
      menuView = v;
    },
  };
}
