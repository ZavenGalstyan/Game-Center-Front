/**
 * Kart Legends — one race's 3D scene and its frame loop.
 *
 * The loop (priority −1, so R3F keeps auto-rendering and it runs before the
 * camera / effects) steps the race with the shared input, drains its events
 * and fans them out: audio, particle bursts, camera shake and the React HUD
 * (onEvents). The sun's shadow box follows the player so one modest shadow
 * map stays crisp.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import TrackMesh from "./TrackMesh.jsx";
import Environment from "./Environment.jsx";
import RaceKart from "./KartModel.jsx";
import CameraRig from "./CameraRig.jsx";
import { Particles, SkidMarks } from "./Effects.jsx";
import { Sizer, TEST } from "../utils/testHooks.js";

export function Lights({ world, focus, shadows }) {
  const sun = useRef();
  const { scene } = useThree();
  const sky = world.sky;
  const dir = useMemo(() => new THREE.Vector3(Math.cos(sky.sunElev) * Math.sin(sky.sunAz), Math.sin(sky.sunElev), Math.cos(sky.sunElev) * Math.cos(sky.sunAz)).normalize(), [sky]);
  useEffect(() => {
    scene.fog = new THREE.Fog(sky.fog, sky.fogNear, sky.fogFar);
    scene.background = new THREE.Color(sky.horizon);
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, sky]);
  useFrame(() => {
    const f = focus();
    if (!sun.current) return;
    sun.current.position.set(f.x + dir.x * 80, f.y + dir.y * 80, f.z + dir.z * 80);
    sun.current.target.position.set(f.x, f.y, f.z);
    sun.current.target.updateMatrixWorld();
  });
  return (
    <>
      <directionalLight
        ref={sun}
        color={sky.sun}
        intensity={sky.light}
        castShadow={shadows}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
        shadow-camera-near={5}
        shadow-camera-far={200}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <hemisphereLight args={[sky.hemiSky, sky.hemiGround, sky.ambient]} />
    </>
  );
}

export default function RaceScene({ race, world, input, audio, settings, paused, onEvents }) {
  const T = race.T;
  const bus = useRef([]);
  const shakeBus = useRef([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const shadows = settings.graphics !== "low" && settings.shadows !== false;
  const three = useThree();
  useEffect(() => {
    if (TEST) window.__kl = { ...(window.__kl || {}), gl: three.gl, scene: three.scene, camera: three.camera };
  }, [three.gl, three.scene, three.camera]);

  useFrame((_, dtRaw) => {
    if (bus.current.length > 80) bus.current.length = 0;
    if (pausedRef.current) return;
    race.tick(Math.min(dtRaw, 0.1), input);
    const events = race.drain();
    if (events.length) {
      const K = race.player.kart;
      for (const e of events) {
        if (e.type === "pad") bus.current.push({ x: K.x, y: K.y, z: K.z, add: true, color: "#ffb21a", n: 22, speed: 5 });
        else if (e.type === "pickup") bus.current.push({ x: K.x, y: K.y + 0.4, z: K.z, add: true, color: "#5ad8ff", n: 18, speed: 3 });
        else if (e.type === "miniTurbo") bus.current.push({ x: K.x - Math.sin(K.h), y: K.y, z: K.z - Math.cos(K.h), add: true, color: ["#7fd4ff", "#ffa531", "#d76bff"][e.tier - 1], n: 10 + e.tier * 6, speed: 4 });
        else if (e.type === "wall") {
          bus.current.push({ x: K.x, y: K.y, z: K.z, color: "#d8d2c8", n: 8, speed: 3 });
          shakeBus.current.push(Math.min(1, (e.hard || 0.5) + 0.2));
        } else if (e.type === "bump") shakeBus.current.push(0.4 + e.hard * 0.6);
      }
      audio?.onEvents(events);
      onEvents?.(events);
    }
    audio?.update(race);
  }, -1);

  const focus = () => race.player.kart;
  return (
    <>
      <Sizer />
      <Lights world={world} focus={focus} shadows={shadows} />
      <Environment T={T} world={world} quality={settings.graphics} shadows={shadows} />
      <TrackMesh T={T} world={world} race={race} />
      {race.racers.map((r) => (
        <RaceKart key={r.id} racer={r} shadows={shadows} />
      ))}
      {settings.effects !== false && <Particles race={race} world={world} bus={bus} quality={settings.graphics} />}
      <SkidMarks race={race} world={world} />
      <CameraRig race={race} shake={settings.shake ?? 1} shakeBus={shakeBus} />
    </>
  );
}
