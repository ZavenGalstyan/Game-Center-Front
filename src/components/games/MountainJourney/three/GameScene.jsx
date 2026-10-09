/**
 * Mountain Journey — one level's 3D scene and its frame loop.
 *
 * The loop (priority −1, so R3F keeps auto-rendering) steps the engine with
 * the shared input object, drains engine events and fans them out: audio,
 * particle bursts and the React HUD (onEvents). Lighting follows the
 * explorer: the sun's shadow box is centred on them (so one modest shadow
 * map stays crisp), and caves dim the sun and pull the fog in.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import Terrain from "./Terrain.jsx";
import Water from "./Water.jsx";
import Vegetation from "./Vegetation.jsx";
import Props, { collectLights } from "./Props.jsx";
import Explorer from "./Explorer.jsx";
import Sky from "./Sky.jsx";
import CameraRig from "./CameraRig.jsx";
import { WeatherParticles, Bursts, LightPool } from "./Effects.jsx";
import { windUniforms } from "./materials.js";
import { WEATHER } from "../data/weather.js";
import { Sizer, TEST } from "../utils/testHooks.js";

/** Lighting / colour environment for a level (weather preset + region). */
export function makeEnv(L) {
  const W = WEATHER[L.def.weather] || WEATHER.sunnyMorning;
  const el = W.sunElev;
  const az = W.sunAzim + (L.def.sunTurn || 0);
  const sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
  const rid = L.region.id;
  return {
    ...W,
    sunDir,
    deep: rid >= 5 ? "#3d6f8a" : rid >= 3 ? "#2f6475" : "#2a6a6c",
    shallow: rid >= 5 ? "#8fc4d6" : "#5fa8a0",
    sky: W.skyHorizon,
  };
}

export function Lights({ env, focusRef, shadowMode }) {
  const sun = useRef();
  const hemi = useRef();
  const amb = useRef();
  const { scene } = useThree();
  const fogBase = useMemo(() => ({ color: new THREE.Color(env.fog), cave: new THREE.Color("#1d1f22"), near: env.fogNear, far: env.fogFar }), [env]);
  useEffect(() => {
    scene.fog = new THREE.Fog(env.fog, env.fogNear, env.fogFar);
    scene.background = new THREE.Color(env.skyHorizon);
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, env]);
  const tmp = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const f = focusRef.current;
    const cave = f.cave || 0;
    if (sun.current) {
      sun.current.position.set(f.x + env.sunDir.x * 90, f.y + env.sunDir.y * 90, f.z + env.sunDir.z * 90);
      sun.current.target.position.set(f.x, f.y, f.z);
      sun.current.target.updateMatrixWorld();
      sun.current.intensity = env.sun * (1 - cave * 0.85);
    }
    if (hemi.current) hemi.current.intensity = env.ambient * 1.1 * (1 - cave * 0.6);
    if (amb.current) amb.current.intensity = 0.12 + cave * 0.18;
    if (scene.fog) {
      tmp.copy(fogBase.color).lerp(fogBase.cave, cave * 0.8);
      scene.fog.color.copy(tmp);
      scene.fog.near = fogBase.near * (1 - cave * 0.7);
      scene.fog.far = fogBase.far * (1 - cave * 0.75);
    }
  });
  const mapSize = shadowMode === "high" ? 2048 : 1024;
  const box = shadowMode === "high" ? 36 : 28;
  return (
    <>
      <directionalLight
        ref={sun}
        color={env.sunColor}
        intensity={env.sun}
        castShadow={shadowMode !== "off"}
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-camera-left={-box}
        shadow-camera-right={box}
        shadow-camera-top={box}
        shadow-camera-bottom={-box}
        shadow-camera-near={5}
        shadow-camera-far={200}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <hemisphereLight ref={hemi} args={[env.hemiSky, env.hemiGround, env.ambient]} />
      <ambientLight ref={amb} intensity={0.12} />
    </>
  );
}

export default function GameScene({ game, input, audio, settings, paused, onEvents, look }) {
  const L = game.L;
  const env = useMemo(() => makeEnv(L), [L]);
  const focusRef = useRef({ x: game.player.x, y: game.player.y, z: game.player.z, cave: 0 });
  const bus = useRef([]);
  const lights = useMemo(() => collectLights(L), [L]);
  const quality = settings.graphics;
  const shadowMode = quality === "low" ? "off" : settings.shadows;
  const shadows = shadowMode !== "off";
  const baseWind = L.region.ambience.wind;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const three = useThree();
  useEffect(() => {
    if (TEST) window.__mj = { ...(window.__mj || {}), gl: three.gl, scene: three.scene };
  }, [three.gl, three.scene]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    windUniforms.uTime.value += dt;
    const ws = game.windStrength();
    windUniforms.uWind.value += (0.25 + baseWind * 0.45 + ws * 0.25 - windUniforms.uWind.value) * Math.min(1, dt * 2);
    if (pausedRef.current) return;
    game.tick(dt, input);
    const events = game.drain();
    if (events.length) {
      for (const e of events) {
        const P = game.player;
        if (e.type === "land" && e.hard > 0.15) bus.current.push({ kind: "dust", x: P.x, y: P.y, z: P.z, color: e.surf === "snow" ? "#f2f6fa" : undefined });
        else if (e.type === "splash") bus.current.push({ kind: "splash", x: e.x, y: e.y, z: e.z });
        else if (e.type === "badge") bus.current.push({ kind: "sparkle", x: e.x, y: e.y + 0.2, z: e.z });
        else if (e.type === "checkpoint") bus.current.push({ kind: "glow", x: P.x, y: P.y, z: P.z });
        else if (e.type === "step" && P.wade > 0.15) bus.current.push({ kind: "splash", x: P.x, y: P.y + P.wade - 0.15, z: P.z });
      }
      audio?.onEvents(events, game);
      onEvents?.(events);
    }
    audio?.update(dt, game);
  }, -1);

  const particles = env.particles;
  return (
    <>
      <Sizer />
      <Lights env={env} focusRef={focusRef} shadowMode={shadowMode} />
      <Sky L={L} env={env} reduced={settings.reducedMotion} />
      <Terrain L={L} quality={quality} />
      <Water L={L} env={env} />
      <Vegetation L={L} quality={quality} shadows={shadows} />
      <Props L={L} game={game} />
      <Explorer game={game} look={look} shadows={shadows} />
      {particles && <WeatherParticles kind={particles} quality={quality} game={game} reduced={settings.reducedMotion} />}
      {(L.region.id >= 4 || game.L.wind.length > 0) && particles !== "wind" && <WeatherParticles kind="wind" quality={quality} game={game} reduced={settings.reducedMotion} />}
      <Bursts bus={bus} />
      <LightPool sources={lights} game={game} focusRef={focusRef} enabled />
      <CameraRig game={game} settings={settings} focusRef={focusRef} />
    </>
  );
}
