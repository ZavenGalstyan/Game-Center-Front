/**
 * Night Corridor — the gameplay scene.
 *
 * One useFrame owns the loop: apply look, step the engine (unless paused),
 * route its events to audio / effects / HUD, then place the camera and the
 * flashlight. Rendering components only read engine state.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MODE } from "../engine/game.js";
import Architecture from "./Architecture.jsx";
import Props from "./Props.jsx";
import Lamps from "./Lamps.jsx";
import { Doors, Lockers, Items } from "./Interactive.jsx";
import Creature from "./Creature.jsx";
import Effects from "./Effects.jsx";
import { flashlightCookie } from "./textures.js";
import { TEST } from "../utils/testHooks.js";

const tmpV = new THREE.Vector3();

export default function GameScene({ game, input, audio, settings, paused, onEvents, fxRef, quality }) {
  const { camera, scene, gl } = useThree();
  const level = game.level;
  const theme = level.theme;
  const shadows = settings.shadows !== "off" && quality !== "low";
  const spot = useRef();
  const spotTarget = useRef();
  const fill = useRef();
  const focusRef = useRef({ x: game.player.x, z: game.player.z });
  const eyeGlow = useRef(0.3);
  const effectsRef = useRef();
  const st = useRef({ bobT: 0, bobAmp: 0, lagYaw: game.player.yaw, lagPitch: game.player.pitch, shake: 0, flick: 0, flickT: 0, black: 0, caughtYaw: null, landed: 0, beam: 1, exposure: theme.exposure, impact: 0 });

  // Scene atmosphere.
  useEffect(() => {
    scene.background = new THREE.Color(theme.fog);
    scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity);
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, theme]);

  useEffect(() => {
    if (spot.current && spotTarget.current) spot.current.target = spotTarget.current;
  }, []);

  useEffect(() => {
    audio?.setLevel(level, level.section.theme);
  }, [audio, level]);

  useEffect(() => {
    if (TEST) window.__nc = { ...(window.__nc || {}), scene, camera, gl };
  }, [scene, camera, gl]);

  const cookie = useMemo(() => flashlightCookie(), []);
  const shadowSize = settings.shadows === "high" ? 1024 : 512;

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = st.current;
    const p = game.player;

    if (!paused) {
      const [dx, dy] = input.consumeLook();
      game.look(dx, dy, settings.sensitivity ?? 1);
      game.update(dt, input);
      const events = game.drain();
      if (events.length) {
        audio?.handle(events);
        effectsRef.current?.handle(events);
        for (const e of events) {
          if (e.type === "caught") s.caughtYaw = null;
          if (e.type === "door" && (e.action === "slam" || e.action === "burst") && Math.hypot(e.x - p.x, e.z - p.z) < 6) s.impact = Math.max(s.impact, 0.5);
          if (e.type === "door" && e.action === "bang" && Math.hypot(e.x - p.x, e.z - p.z) < 8) s.impact = Math.max(s.impact, 0.25);
          if (e.type === "flashlight" && e.flicker) s.flickT = 0.6;
          if (e.type === "hide") game.lockerAnim = { ...(game.lockerAnim || {}), [game.lockers.find((l) => Math.hypot(l.x - e.x, l.z - e.z) < 0.1)?.id ?? -1]: game.time };
          if (e.type === "fall" && Math.hypot(e.x - p.x, e.z - p.z) < 8) s.impact = Math.max(s.impact, 0.35);
        }
        onEvents?.(events);
      }
      audio?.update(dt, game);
    } else {
      input.consumeLook();
    }
    focusRef.current.x = p.x;
    focusRef.current.z = p.z;

    // ---------------------------------------------------------------- camera
    const reduced = settings.reducedMotion;
    const bobK = reduced ? 0 : settings.cameraBob ?? 1;
    const moving = game.mode === MODE.PLAYING && p.speed > 0.3;
    const wantAmp = moving ? (p.sprinting ? 1 : p.crouching ? 0.35 : 0.6) : 0;
    s.bobAmp += (wantAmp - s.bobAmp) * Math.min(1, dt * 6);
    const ph = p.bobPhase;
    const bobY = Math.abs(Math.sin(ph)) * 0.045 * s.bobAmp * bobK;
    const bobX = Math.cos(ph) * 0.025 * s.bobAmp * bobK;
    const heat = game.chaseHeat || 0;
    s.impact = Math.max(0, s.impact - dt * 1.6);
    const shakeAmt = reduced ? 0 : (game.shake * 0.06 + s.impact * 0.05 + (game.chase && p.sprinting ? 0.006 : 0)) * (paused ? 0 : 1);
    const t = state.clock.elapsedTime;
    const sx = (Math.sin(t * 37) + Math.sin(t * 23.3)) * shakeAmt;
    const sy = (Math.sin(t * 41.7) + Math.sin(t * 19.1)) * shakeAmt;

    let yaw = p.yaw;
    let pitch = p.pitch;
    let cx = p.x;
    let cz = p.z;
    let cy = game.eyeHeight() + bobY;
    let roll = reduced ? 0 : Math.sin(ph * 0.5) * 0.004 * s.bobAmp * bobK;

    if (game.hiding) {
      const h = game.hiding;
      const L = h.locker;
      const k = Math.min(1, h.t / 0.45);
      const e = k * k * (3 - 2 * k);
      const outYaw = L.yaw + Math.PI;
      // From where you stood into the locker, turning to look out through the slats.
      cx = h.from.x + (L.x + Math.sin(L.yaw) * 0.08 - h.from.x) * e;
      cz = h.from.z + (L.z + Math.cos(L.yaw) * 0.08 - h.from.z) * e;
      const dyaw = Math.atan2(Math.sin(outYaw - h.from.yaw), Math.cos(outYaw - h.from.yaw));
      yaw = h.from.yaw + dyaw * e + h.lookYaw * e;
      pitch = p.pitch * (1 - e) + h.lookPitch * e;
      cy = 1.58 + Math.sin(t * 1.4) * 0.006;
      roll = 0;
    } else if (game.mode === MODE.CAUGHT) {
      const c = game.creature;
      const hx = c.x - p.x;
      const hz = c.z - p.z;
      const want = Math.atan2(-hx, -hz);
      if (s.caughtYaw == null) s.caughtYaw = p.yaw;
      const d = Math.atan2(Math.sin(want - s.caughtYaw), Math.cos(want - s.caughtYaw));
      s.caughtYaw += d * Math.min(1, dt * 14);
      yaw = s.caughtYaw;
      pitch += (0.32 - pitch) * Math.min(1, game.caught.t * 6);
      cy -= Math.min(0.25, game.caught.t * 0.4);
      roll = Math.sin(game.caught.t * 30) * 0.02 * Math.max(0, 1 - game.caught.t);
    }

    camera.position.set(cx + Math.cos(yaw) * bobX + sx, cy + sy, cz - Math.sin(yaw) * bobX);
    camera.rotation.set(pitch, yaw, roll, "YXZ");
    if (camera.fov !== (game.chase && p.sprinting && !reduced ? 72 : 68)) {
      const want = game.chase && p.sprinting && !reduced ? 72 : 68;
      camera.fov += (want - camera.fov) * Math.min(1, dt * 3);
      if (Math.abs(camera.fov - want) < 0.05) camera.fov = want;
      camera.updateProjectionMatrix();
    }
    audio?.setListener(cx, cz, yaw);

    // ------------------------------------------------------------ flashlight
    const L = spot.current;
    if (L) {
      // The beam lags the view a touch and sways with your steps.
      const lagK = Math.min(1, dt * (p.sprinting ? 9 : 14));
      const dyaw = Math.atan2(Math.sin(yaw - s.lagYaw), Math.cos(yaw - s.lagYaw));
      s.lagYaw += dyaw * lagK;
      s.lagPitch += (pitch - s.lagPitch) * lagK;
      const swayY = reduced ? 0 : Math.sin(ph) * 0.012 * s.bobAmp * bobK;
      const swayX = reduced ? 0 : Math.cos(ph * 0.5) * 0.02 * s.bobAmp * bobK;
      const ly = s.lagYaw + swayX;
      const lp = s.lagPitch + swayY - 0.02;
      tmpV.set(0.16, -0.18, -0.1).applyEuler(camera.rotation);
      L.position.set(camera.position.x + tmpV.x, camera.position.y + tmpV.y, camera.position.z + tmpV.z);
      const cp = Math.cos(lp);
      spotTarget.current.position.set(L.position.x - Math.sin(ly) * cp * 6, L.position.y + Math.sin(lp) * 6, L.position.z - Math.cos(ly) * cp * 6);
      spotTarget.current.updateMatrixWorld();

      // Battery: dims below 25 %, stutters below 15 %; scripted flickers too.
      s.flickT = Math.max(0, s.flickT - dt);
      let beam = p.flashlight && !game.hiding ? 1 : 0;
      if (beam) {
        const b = p.battery;
        if (b < 0.25) beam *= 0.45 + b * 2.2;
        if (b < 0.18 && Math.random() < dt * 3) s.flick = 0.12;
      }
      if (s.flickT > 0) beam *= Math.random() < 0.5 ? 0.05 : 1;
      if (s.flick > 0) {
        s.flick -= dt;
        beam *= 0.15;
      }
      s.beam += (beam - s.beam) * Math.min(1, dt * 30);
      const q = settings.flashlight === "high" ? 1.15 : settings.flashlight === "low" ? 0.85 : 1;
      L.intensity = 58 * s.beam * q;
      L.distance = 19 * q;
      if (fill.current) {
        fill.current.position.copy(camera.position);
        fill.current.intensity = 0.55 * s.beam;
      }
      // Its eyes catch the light.
      const c = game.creature;
      if (c.state !== "HIDDEN") {
        const vx = c.x - camera.position.x;
        const vz = c.z - camera.position.z;
        const d = Math.hypot(vx, vz) || 1;
        const dot = (vx * -Math.sin(ly) + vz * -Math.cos(ly)) / d;
        const inBeam = s.beam > 0.3 && dot > 0.93 && d < 18 ? 1 : 0;
        eyeGlow.current += ((inBeam ? 1.4 : 0.32) - eyeGlow.current) * Math.min(1, dt * 8);
      }
    }

    // ------------------------------------------------------- post / overlay
    const fx = fxRef?.current;
    if (fx) {
      let black = 0;
      if (game.mode === MODE.CAUGHT) black = game.caught.t > 0.85 ? Math.min(1, (game.caught.t - 0.85) / 0.25) : 0;
      if (game.mode === MODE.COMPLETE) black = Math.min(1, game.complete.t / 1.1);
      if (game.respawnT != null && game.time - game.respawnT < 1.2) black = Math.max(black, 1 - (game.time - game.respawnT) / 1.2);
      s.black += (black - s.black) * Math.min(1, dt * 20);
      if (fx.black) fx.black.style.opacity = String(s.black);
      if (fx.vignette) fx.vignette.style.opacity = String(0.55 + heat * 0.4);
      if (fx.pulse) {
        const pulse = game.chase && game.chase.phase === "run" ? (0.5 + 0.5 * Math.sin(t * (6 + heat * 4))) * heat * 0.55 : 0;
        fx.pulse.style.opacity = String(reduced ? Math.min(0.2, pulse) : pulse);
      }
      if (fx.slats) fx.slats.style.opacity = game.hiding ? String(Math.min(1, game.hiding.t / 0.4)) : "0";
      if (fx.flash) fx.flash.style.opacity = game.mode === MODE.CAUGHT && game.caught.t < 0.12 ? "0.5" : "0";
    }
    // Exposure dips a little in the dark and in a chase.
    const exposure = theme.exposure * (1 - heat * 0.08);
    s.exposure += (exposure - s.exposure) * Math.min(1, dt * 2);
    gl.toneMappingExposure = s.exposure;
  });

  return (
    <group>
      <hemisphereLight args={[theme.hemiSky, theme.hemiGround, theme.hemiIntensity]} />
      <Architecture level={level} shadows={shadows} />
      <Props level={level} shadows={shadows} />
      <Lamps lamps={game.lamps} theme={theme} quality={quality} poolSize={quality === "low" ? 5 : 7} focus={focusRef} />
      <Doors doors={game.doors} shadows={shadows} />
      <Lockers game={game} shadows={shadows} />
      <Items items={game.items} />
      <Creature creature={game.creature} player={game.player} shadows={shadows} eyeGlowRef={eyeGlow} paused={paused} />
      <Effects ref={effectsRef} paused={paused} quality={quality} />
      <spotLight
        ref={spot}
        angle={0.46}
        penumbra={0.62}
        distance={17}
        decay={1.6}
        intensity={30}
        color="#fff3dc"
        castShadow={shadows}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
        shadow-camera-near={0.2}
        shadow-camera-far={18}
        map={shadows ? cookie : null}
      />
      <object3D ref={spotTarget} />
      <pointLight ref={fill} intensity={0.5} distance={3.2} decay={2} color="#fff0d8" />
    </group>
  );
}
