/**
 * Arena Gladiator — everything inside the fight <Canvas>.
 *
 * Frame order (R3F useFrame priorities):
 *   −3  driver   input → player intent → engine advance (fixed steps) → events
 *   −2  bodies   pose both gladiators from engine state (IK, planted feet)
 *   −1  camera   third-person chase (collision, lock-on) ⇄ first-person eyes,
 *                blended over 250 ms; view model posed from the engine pose
 *    1  render   world, then clear depth, then the first-person view model
 *
 * The engine is the single source of truth. Switching camera changes only
 * how it is looked at: no engine object, AI, listener or render loop is ever
 * recreated by a camera switch, fullscreen, or pointer-lock change.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { advance, drainEvents } from "../engine/fight.js";
import { bladeSegment } from "../engine/pose.js";
import { BODY } from "../engine/constants.js";
import { clamp, wrap, turnToward } from "../engine/math.js";
import Arena, { cameraClip } from "./Arena.jsx";
import { buildGladiator, poseGladiator, setFirstPerson, disposeGladiator } from "./gladiator.js";
import { createViewModel, poseViewModel, viewModelFlash, viewModelImpact, disposeViewModel } from "./fpView.js";
import { createEffects } from "./effects.js";
import { sound } from "../audio/sound.js";

const TP_DIST = 2.65;
const TP_HEIGHT = 1.52;
const SHOULDER = 0.55;
const SWITCH_TIME = 0.25;
const BOB = { off: 0, low: 0.011, normal: 0.024 };

const _tpPos = new THREE.Vector3();
const _fpPos = new THREE.Vector3();
const _tpQ = new THREE.Quaternion();
const _fpQ = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, "YXZ");
const _v = new THREE.Vector3();
const segA = { x: 0, y: 0, z: 0 };
const segB = { x: 0, y: 0, z: 0 };

export default function FightScene({ fight, ctrl, input, live, arena, playerVis, enemyVis, onEvents, hud, excitement }) {
  const { gl, scene, camera } = useThree();

  /* ------------------------------------------------------------ models (once per mount) */
  const pRig = useMemo(() => buildGladiator(playerVis.look, playerVis.equip, { shadows: true }), [playerVis]);
  const oRig = useMemo(() => buildGladiator(enemyVis.look, enemyVis.equip, { shadows: true }), [enemyVis]);
  const vm = useMemo(() => createViewModel(playerVis.look, playerVis.equip), [playerVis]);
  const fxRef = useRef(null);
  useEffect(() => {
    const fx = createEffects(scene);
    fxRef.current = fx;
    return () => {
      fx.dispose();
      fxRef.current = null;
    };
  }, [scene]);
  useEffect(() => () => {
    disposeGladiator(pRig);
    disposeGladiator(oRig);
    disposeViewModel(vm);
  }, [pRig, oRig, vm]);

  // environment reflections for the metal (shared by the world and view model)
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = arena.theme.night ? 0.25 : 0.45;
    vm.scene.environment = env;
    vm.scene.environmentIntensity = 0.45;
    return () => {
      scene.environment = null;
      vm.scene.environment = null;
      env.dispose();
      pm.dispose();
    };
  }, [gl, scene, vm, arena]);

  // view model lighting follows the arena's
  useEffect(() => {
    const T = arena.theme;
    vm.sun.color.set(T.sun);
    vm.sun.intensity = T.night ? 0.8 : 1.5;
    vm.hemi.color.set(T.sky[1]);
    vm.hemi.groundColor.set(T.sandDark);
    vm.hemi.intensity = T.night ? 0.7 : 1.0;
  }, [arena, vm]);

  /* ------------------------------------------------------------ camera state */
  const cam = live.cam;
  useEffect(() => {
    camera.near = 0.04;
    camera.far = 400;
    camera.updateProjectionMatrix();
  }, [camera]);

  const lockEl = hud.lockEl;

  /* ------------------------------------------------------------ driver */
  useFrame((st, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const P = fight.P;
    const O = fight.O;
    const S = live.settings;
    if (live.paused) {
      input.consumeLook();
      return;
    }

    // ---- camera mode / lock-on toggles (instant, no React render)
    if (input.take("camera")) {
      cam.mode = cam.mode === "first" ? "third" : "first";
      if (cam.mode === "first") cam.lockOn = false;
      live.onCamera && live.onCamera(cam.mode);
    }
    if (input.take("lock")) {
      if (cam.mode === "third" && !O.defeated) cam.lockOn = !cam.lockOn;
      else cam.lockOn = false;
      live.onLock && live.onLock(cam.lockOn, cam.mode);
    }
    if (input.take("pause")) live.onPause && live.onPause();
    if (O.defeated || P.defeated) cam.lockOn = false;

    // ---- look
    const [dx, dy] = input.consumeLook();
    const sens = 0.0022 * S.sensitivity;
    const yawToEnemy = Math.atan2(O.x - P.x, O.z - P.z);
    if (cam.lockOn) {
      // aim from the shoulder pivot so the opponent sits beside the player, not behind them
      const px = P.x - Math.cos(cam.lookYaw) * SHOULDER;
      const pz = P.z + Math.sin(cam.lookYaw) * SHOULDER;
      cam.lookYaw = turnToward(cam.lookYaw, Math.atan2(O.x - px, O.z - pz), 9 * dt);
      cam.lookPitch += (0.2 - cam.lookPitch) * Math.min(1, dt * 4);
    } else {
      cam.lookYaw = wrap(cam.lookYaw - dx * sens);
      cam.lookPitch += dy * sens * (S.invertY ? -1 : 1);
    }
    const fp = cam.mode === "first";
    cam.lookPitch = fp ? clamp(cam.lookPitch, -1.15, 1.2) : clamp(cam.lookPitch, -0.35, 0.95);
    // first person: the view can't swing far from a committed body (heavy, physical)
    const committed = P.act && P.act.type !== "blockstun";
    if (fp && committed) {
      const off = wrap(cam.lookYaw - P.yaw);
      const lim = 0.32;
      if (Math.abs(off) > lim) cam.lookYaw = wrap(P.yaw + Math.sign(off) * lim);
    }

    // ---- player intent (camera-relative movement)
    const m = input.move();
    const fx = Math.sin(cam.lookYaw);
    const fz = Math.cos(cam.lookYaw);
    const wx = -fz * m.x + fx * m.y;
    const wz = fx * m.x + fz * m.y;
    ctrl.mx = wx;
    ctrl.mz = wz;
    ctrl.sprint = input.sprint();
    ctrl.block = input.block();
    if (input.take("light")) ctrl.light = true;
    if (input.take("heavy")) ctrl.heavy = true;
    if (input.take("dodge")) ctrl.dodge = true;
    if (input.take("kick")) ctrl.kick = true;
    if (fp) {
      ctrl.yaw = cam.lookYaw;
      ctrl.turn = 40;
    } else if (cam.lockOn) {
      ctrl.yaw = P.sprinting && Math.hypot(wx, wz) > 0.3 ? Math.atan2(wx, wz) : yawToEnemy;
      ctrl.turn = 14;
    } else {
      ctrl.yaw = P.sprinting && Math.hypot(wx, wz) > 0.3 ? Math.atan2(wx, wz) : cam.lookYaw;
      ctrl.turn = 12;
    }

    // ---- simulate (slow motion for the knockout moment)
    const slow = fight.phase === "ko" && fight.phaseT < 1.1 && !S.reducedMotion ? 0.35 : 1;
    advance(fight, dt * slow);
    const events = drainEvents(fight);
    if (events.length) handleEvents(events);
    if (fight.phase === "fight") {
      if (cam.blend > 0.5) live.fpTime += dt;
      else live.tpTime += dt;
    }
  }, -3);

  /* ------------------------------------------------------------ events → feel */
  const handleEvents = (events) => {
    const fx = fxRef.current;
    const S = live.settings;
    const shakeK = S.cameraShake && !S.reducedMotion ? 1 : 0;
    for (const e of events) {
      const byPlayer = e.by === "p";
      const onPlayer = e.id === "p";
      switch (e.type) {
        case "swing":
          sound.swing(e.kind, e.id === "p");
          break;
        case "attackStart":
          if (e.id === "o" && e.kind === "heavy") {
            // readable telegraph: a glint on the blade and an effort grunt
            sound.exert(false);
            if (bladeSegment(fight.O, fight.O.weapon.blades.R ? "R" : "L", segA, segB, true)) fx && fx.burst("block", segB);
          } else if (e.kind === "kick") sound.kick();
          break;
        case "hit": {
          const armored = e.armored || e.part === "head" && (onPlayer ? playerVis.look.helmet : enemyVis.look.helmet) !== "none";
          fx && fx.burst(armored ? "armor" : "hit", e.point);
          if (armored) sound.hitArmor(e.kind === "heavy");
          else sound.hitFlesh(e.kind === "heavy", onPlayer);
          sound.grunt(onPlayer, e.kind === "heavy");
          if (onPlayer) {
            cam.trauma = Math.min(1, cam.trauma + (e.kind === "heavy" ? 0.55 : 0.35) * shakeK);
            cam.impulse += e.kind === "heavy" ? 0.07 : 0.04;
          } else if (byPlayer) {
            cam.trauma = Math.min(1, cam.trauma + (e.kind === "heavy" ? 0.3 : 0.12) * shakeK);
            viewModelImpact(vm, e.kind === "heavy" ? 1 : 0.5);
          }
          if (e.kind === "heavy" || e.counter) {
            sound.cheer(e.counter ? 1.2 : 0.8);
            excitement.current = Math.max(excitement.current, 0.7);
          }
          break;
        }
        case "block":
          fx && fx.burst("block", e.point);
          sound.block(e.kind === "heavy", e.shield);
          if (onPlayer) {
            viewModelFlash(vm, "#ffd9a0");
            cam.trauma = Math.min(1, cam.trauma + 0.15 * shakeK);
          }
          break;
        case "parry":
          fx && fx.burst("parry", e.point);
          sound.parry();
          sound.cheer(1.2);
          excitement.current = 1;
          if (onPlayer) {
            viewModelFlash(vm, "#fff0b0");
            cam.trauma = Math.min(1, cam.trauma + 0.2 * shakeK);
          }
          break;
        case "clash":
          fx && fx.burst("clash", e.point);
          sound.clash();
          cam.trauma = Math.min(1, cam.trauma + 0.2 * shakeK);
          viewModelImpact(vm, 1);
          break;
        case "guardBreak":
          fx && fx.burst("guardBreak", e.point);
          sound.guardBreak();
          sound.cheer(1);
          excitement.current = Math.max(excitement.current, 0.8);
          if (onPlayer) cam.trauma = Math.min(1, cam.trauma + 0.4 * shakeK);
          break;
        case "dodge": {
          const f = e.id === "p" ? fight.P : fight.O;
          fx && fx.burst("dodge", { x: f.x, y: 0, z: f.z });
          sound.dodge();
          break;
        }
        case "denied":
          if (e.id === "p") sound.denied();
          break;
        case "ko": {
          const f = e.id === "p" ? fight.P : fight.O;
          fx && setTimeout(() => fxRef.current && fxRef.current.burst("fall", { x: f.x, y: 0, z: f.z }), 700);
          sound.cheer(2);
          excitement.current = 1;
          break;
        }
        case "fightStart":
          sound.horn();
          sound.cheer(1.2);
          excitement.current = 0.8;
          break;
        default:
      }
    }
    onEvents(events);
  };

  /* ------------------------------------------------------------ bodies */
  const stepSurface = arena.floor === "stone" ? "stone" : "sand";
  const ctxP = useMemo(() => ({ onStep: (spd) => sound.step(stepSurface, Math.min(1, spd / 4), true) }), [stepSurface]);
  const ctxO = useMemo(() => ({
    onStep: (spd) => {
      const d = Math.hypot(fight.O.x - fight.P.x, fight.O.z - fight.P.z);
      sound.step(stepSurface, Math.min(1, spd / 4) * clamp(1.6 - d / 6, 0.2, 1), false);
    },
  }), [stepSurface, fight]);
  useFrame((st, rawDt) => {
    const dt = live.paused ? 0 : Math.min(rawDt, 0.1) * (fight.hitstop > 0 ? 0.15 : 1);
    ctxP.target = fight.O;
    ctxO.target = fight.P;
    poseGladiator(pRig, fight.P, dt, ctxP);
    poseGladiator(oRig, fight.O, dt, ctxO);
    excitement.current = Math.max(0, excitement.current - rawDt * 0.25);
  }, -2);

  /* ------------------------------------------------------------ camera + view model */
  useFrame((st, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const P = fight.P;
    const O = fight.O;
    const S = live.settings;
    const reduced = S.reducedMotion;
    // blend toward the chosen mode over SWITCH_TIME
    const target = cam.mode === "first" ? 1 : 0;
    if (cam.blend !== target) {
      const stepB = reduced ? 1 : dt / SWITCH_TIME;
      cam.blend = target > cam.blend ? Math.min(1, cam.blend + stepB) : Math.max(0, cam.blend - stepB);
    }
    const b = cam.blend * cam.blend * (3 - 2 * cam.blend);

    const yaw = cam.lookYaw;
    const pitch = cam.lookPitch;
    const cp = Math.cos(pitch);
    const dirX = Math.sin(yaw) * cp;
    const dirY = -Math.sin(pitch);
    const dirZ = Math.cos(yaw) * cp;

    // ---------- third person
    const crouch = pRig.gait ? pRig.gait.crouch : 0;
    const baseX = P.x;
    const baseZ = P.z;
    const baseY = TP_HEIGHT - crouch * 0.6;
    // shoulder offset along the camera's right, clipped so it never pokes through a wall
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);
    const colliders = cam.colliders;
    colliders.pillars[colliders.pillars.length - 1].x = O.x; // the opponent's body blocks the camera too
    colliders.pillars[colliders.pillars.length - 1].z = O.z;
    const sh = cameraClip(colliders, baseX, baseZ, rx, rz, SHOULDER, 0.22);
    const pivX = baseX + rx * sh;
    const pivZ = baseZ + rz * sh;
    const want = cam.lockOn ? TP_DIST + 0.35 : TP_DIST;
    let allowed = cameraClip(colliders, pivX, pivZ, -dirX, -dirZ, want, 0.3);
    if (-dirY < 0) allowed = Math.min(allowed, (baseY - 0.25) / dirY); // stay above the sand
    if (allowed < cam.dist) cam.dist = Math.max(0.35, allowed);
    else cam.dist = Math.min(allowed, cam.dist + dt * 3);
    // boom compressed by a wall: lift the camera up and over the head and look
    // down a touch, so it never ends up inside the gladiator's shoulder
    const squeeze = clamp((want - cam.dist) / (want - 0.35), 0, 1);
    cam.squeeze += (squeeze - cam.squeeze) * Math.min(1, dt * 10);
    const lift = cam.squeeze * 0.85;
    _tpPos.set(pivX - dirX * cam.dist, baseY - dirY * cam.dist + lift, pivZ - dirZ * cam.dist);
    _e.set(-pitch - cam.squeeze * 0.32, yaw + Math.PI, 0, "YXZ");
    _tpQ.setFromEuler(_e);

    // ---------- first person
    const fy = P.yaw;
    const gait = pRig.gait;
    const speed = Math.hypot(P.vx, P.vz);
    const bobAmp = reduced ? 0 : BOB[S.headBob] || 0;
    const phase = gait ? gait.phase : 0;
    const bobV = -Math.abs(Math.sin(phase)) * bobAmp * Math.min(speed / 4, 1.3);
    const bobH = Math.sin(phase) * bobAmp * 0.5 * Math.min(speed / 4, 1);
    let roll = 0;
    let push = 0;
    const act = P.act;
    if (act && !reduced) {
      if (act.type === "attack" && act.kind !== "kick") {
        const inA = act.t >= act.startup && act.t <= act.startup + act.active + 0.08;
        const dir = act.atk.id === "slashL" || act.atk.id === "cutL" || act.atk.id === "chopL" ? -1 : 1;
        if (inA) {
          roll = 0.025 * dir * (act.kind === "heavy" ? 1.4 : 1);
          push = act.kind === "heavy" ? 0.08 : 0.05;
        }
      } else if (act.type === "dodge") {
        const p = clamp(act.t / act.dur, 0, 1);
        const lx = act.dx * -Math.cos(fy) + act.dz * Math.sin(fy);
        roll = -lx * 0.07 * Math.sin(p * Math.PI);
      } else if (act.type === "hurt" || act.type === "stagger") {
        roll = 0.03 * Math.sin(clamp(act.t / act.dur, 0, 1) * Math.PI);
      }
    }
    cam.roll += (roll - cam.roll) * Math.min(1, dt * 12);
    cam.push += (push - cam.push) * Math.min(1, dt * 14);
    cam.impulse = Math.max(0, cam.impulse - dt * 0.5);
    cam.impulseV += (cam.impulse - cam.impulseV) * Math.min(1, dt * 20);
    const eyeF = 0.1 + cam.push;
    const eyeY = BODY.eyeY - (gait ? gait.crouch * 0.85 : 0) + bobV;
    _fpPos.set(P.x + Math.sin(fy) * eyeF + -Math.cos(yaw) * bobH, eyeY, P.z + Math.cos(fy) * eyeF + Math.sin(yaw) * bobH);
    if (P.defeated) _fpPos.y = Math.max(0.4, eyeY - (gait ? gait.fall : 0) * 1.0);
    _e.set(-pitch + cam.impulseV, yaw + Math.PI, cam.roll, "YXZ");
    _fpQ.setFromEuler(_e);

    // ---------- blend + shake
    camera.position.lerpVectors(_tpPos, _fpPos, b);
    camera.quaternion.slerpQuaternions(_tpQ, _fpQ, b);
    cam.trauma = Math.max(0, cam.trauma - dt * 1.8);
    if (cam.trauma > 0 && S.cameraShake && !reduced) {
      const t = st.clock.elapsedTime;
      const k = cam.trauma * cam.trauma;
      _e.set(Math.sin(t * 37) * 0.02 * k, Math.sin(t * 41 + 1) * 0.02 * k, Math.sin(t * 29 + 2) * 0.015 * k, "YXZ");
      camera.quaternion.multiply(new THREE.Quaternion().setFromEuler(_e));
    }
    const fov = S.fov * b + Math.max(60, S.fov - 12) * (1 - b);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();

    // own body: head/arms hidden in first person (and when the TP camera is squeezed right up to the head)
    setFirstPerson(pRig, b > 0.5);
    // still too close to the head (wall right behind): hide head + arms, keep the weapons
    const hx = camera.position.x - P.x;
    const hy = camera.position.y - 1.5;
    const hz = camera.position.z - P.z;
    const squeezed = b <= 0.5 && Math.hypot(hx, hy, hz) < 0.62;
    if (!pRig.fp) {
      for (const mesh of pRig.headMeshes) mesh.visible = !squeezed;
      for (const sd of ["R", "L"]) for (const mesh of pRig.arms[sd].meshes) mesh.visible = !squeezed;
    }

    // view model (first person)
    cam.vmVisible = b > 0.5;
    if (cam.vmVisible) {
      poseViewModel(vm, P, camera, live.paused ? 0 : dt, {
        yawOffset: wrap(P.yaw - yaw),
        look: { yaw, pitch },
        bob: bobV,
        reduced,
      });
    }

    // effects
    if (fxRef.current) {
      fxRef.current.setEnabled(S.particles);
      fxRef.current.update(live.paused ? 0 : dt);
    }

    // HUD bars + lock-on marker (direct DOM writes, no React renders)
    hud.write(fight);
    if (lockEl.current) {
      const show = cam.lockOn && b < 0.5 && !O.defeated;
      if (show) {
        _v.set(O.x, 2.05, O.z).project(camera);
        const x = (_v.x * 0.5 + 0.5) * st.size.width;
        const y = (-_v.y * 0.5 + 0.5) * st.size.height;
        lockEl.current.style.display = _v.z < 1 ? "block" : "none";
        lockEl.current.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) rotate(45deg)`;
      } else if (lockEl.current.style.display !== "none") lockEl.current.style.display = "none";
    }
  }, -1);

  /* ------------------------------------------------------------ render: world, then view model on top */
  useFrame(() => {
    gl.autoClear = false;
    gl.clear();
    gl.render(scene, camera);
    if (cam.vmVisible) {
      gl.clearDepth();
      gl.render(vm.scene, camera);
    }
  }, 1);

  return (
    <>
      <Arena arena={arena} quality={live.settings.graphics} excitement={excitement} />
      <primitive object={pRig.root} />
      <primitive object={oRig.root} />
    </>
  );
}
