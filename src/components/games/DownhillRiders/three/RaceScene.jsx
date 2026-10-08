/**
 * Downhill Riders — one race's 3D scene and its frame loop.
 *
 * The loop (priority −1, so R3F keeps auto-rendering and it runs before the
 * camera / effects) steps the race with the shared input, drains its events
 * and fans them out: audio, particle bursts, camera dips / shakes and the
 * React HUD (onEvents). The sun's shadow box follows the player so one
 * modest shadow map stays crisp; every rider also gets a soft blob shadow on
 * the ground, which is what makes jumps readable.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buildWorld } from "./world.js";
import { createRider } from "./rider.js";
import CameraRig from "./CameraRig.jsx";
import Sky, { sunDir } from "./Sky.jsx";
import { Particles, Weather, SunShafts } from "./Effects.jsx";
import { windUniforms } from "./geo.js";
import { shadowTex } from "./textures.js";
import { RSTATE } from "../engine/race.js";
import { Sizer, TEST } from "../utils/testHooks.js";

export function Lights({ region, focus, shadows }) {
  const sun = useRef();
  const { scene } = useThree();
  const sky = region.sky;
  const dir = useMemo(() => sunDir(sky), [sky]);
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
    sun.current.position.set(f.x + dir.x * 70, f.y + dir.y * 70, f.z + dir.z * 70);
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
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={5}
        shadow-camera-far={160}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      />
      <hemisphereLight args={[sky.hemiSky, sky.hemiGround, sky.ambient]} />
    </>
  );
}

function nameTag(name, color) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(10,14,24,0.65)";
  g.beginPath();
  g.roundRect(8, 10, 240, 44, 22);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc(34, 32, 9, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff";
  g.font = "700 26px 'Segoe UI', Arial, sans-serif";
  g.textBaseline = "middle";
  g.fillText(name, 52, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One rider: model + blob shadow (+ name tag for rivals), driven from the sim. */
function RaceRider({ racer, race, G, shadows }) {
  const built = useMemo(() => {
    const r = createRider(racer.colors, { shadows: shadows && racer.isPlayer, blobTex: shadowTex(), bothArms: true });
    let tag = null;
    if (!racer.isPlayer) {
      const tex = nameTag(racer.name.split(" ")[0], racer.colors.jersey);
      tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
      tag.scale.set(2.2, 0.55, 1);
      tag.renderOrder = 5;
    }
    return { r, tag };
  }, [racer, shadows]);
  useEffect(
    () => () => {
      built.r.dispose();
      if (built.tag) {
        built.tag.material.map.dispose();
        built.tag.material.dispose();
      }
    },
    [built],
  );
  const st = useRef({ spin: 0, pitch: 0 });
  const { camera } = useThree();
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const B = racer.bike;
    const { r, tag } = built;
    const S = st.current;
    S.spin += (B.crash ? B.vF * 0.5 : B.vF) * dt / 0.36;
    const pitchT = B.crash ? 0 : -Math.atan2(B.vy, Math.max(2, B.vF)) * (B.air ? 0.75 : 1);
    S.pitch += (pitchT - S.pitch) * Math.min(1, dt * (B.air ? 3 : 12));
    r.root.position.set(B.x, B.y, B.z);
    r.root.rotation.set(0, B.h, 0);
    const tr = B.trick ? { kind: B.trick.kind, p: B.trick.t / B.trick.dur, dir: B.trick.dir } : null;
    const won = race.state === RSTATE.FINISHED && racer.finished && racer.place === 1;
    r.update(
      {
        speed: B.vF,
        pedal: B.pedal,
        pedaling: B.pedaling || B.boostT > 0,
        braking: B.braking,
        steer: B.steerVis,
        lean: B.lean,
        pitch: S.pitch,
        air: B.air,
        compress: B.compress,
        trick: tr,
        crash: B.crash,
        victory: won || (racer.isPlayer && race.state === RSTATE.FINISHED && race.results && race.results.place <= 3) ? 1 : 0,
        wheelSpin: S.spin,
      },
      dt,
    );
    // blob shadow on the ground under the bike
    if (r.blob) {
      const gy = B.gnd ? (B.gnd.fall || B.gnd.gap ? (G ? G.heightAt(B.x, B.z) : B.gnd.y) : B.gnd.y) : B.y;
      const above = Math.max(0, B.y - gy);
      r.blob.position.set(B.x, gy + 0.06, B.z);
      r.blob.rotation.set(-Math.PI / 2, 0, B.h);
      const k = Math.max(0.15, 1 - above / 8);
      r.blob.scale.set(k + above * 0.05, k + above * 0.05, 1);
      r.blob.material.opacity = k * (B.crash ? 0.5 : 1);
    }
    if (tag) {
      tag.position.set(B.x, B.y + 2.45, B.z);
      const d = camera.position.distanceTo(tag.position);
      tag.visible = d < 70 && d > 7.5 && !B.crash && race.state !== RSTATE.COUNTDOWN;
      tag.material.opacity = Math.min(1, (70 - d) / 20);
    }
  });
  return (
    <>
      <primitive object={built.r.root} />
      {built.r.blob && <primitive object={built.r.blob} />}
      {built.tag && <primitive object={built.tag} />}
    </>
  );
}

export function WorldMesh({ T, G, region, quality, race }) {
  const world = useMemo(() => buildWorld(T, G, region, quality), [T, G, region, quality]);
  useEffect(() => () => world.dispose(), [world]);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    windUniforms.uTime.value = t.current;
    world.update(t.current, race);
  });
  return <primitive object={world.group} />;
}

export default function RaceScene({ race, G, region, input, audio, settings, paused, onEvents }) {
  const T = race.T;
  const bus = useRef([]);
  const camBus = useRef([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const shadows = settings.graphics !== "low" && settings.shadows !== false;
  const reduced = !!settings.reducedMotion;
  const three = useThree();
  useEffect(() => {
    if (TEST) window.__dr = { ...(window.__dr || {}), gl: three.gl, scene: three.scene, camera: three.camera };
  }, [three.gl, three.scene, three.camera]);
  useEffect(() => {
    windUniforms.uWind.value = reduced ? 0.3 : 1;
  }, [reduced]);

  useFrame((_, dtRaw) => {
    if (bus.current.length > 60) bus.current.length = 0;
    if (pausedRef.current) return;
    race.tick(Math.min(dtRaw, 0.1), input);
    const events = race.drain();
    if (events.length) {
      const B = race.player.bike;
      for (const e of events) {
        if (e.type === "land") {
          if (e.airT > 0.25) bus.current.push({ x: B.x, y: B.y, z: B.z, color: "#c9b291", n: 10 + Math.round(e.hard * 16), speed: 2.5 + e.hard * 3, up: 1.2 });
          camBus.current.push({ kind: "land", a: Math.min(1, e.hard + (e.airT > 0.6 ? 0.3 : 0)) });
        } else if (e.type === "crash") {
          bus.current.push({ x: B.x, y: B.y, z: B.z, color: "#b59a7a", n: 26, speed: 4, up: 2 });
          camBus.current.push({ kind: "shake", a: 1 });
        } else if (e.type === "hit" || e.type === "wall" || e.type === "bump") {
          camBus.current.push({ kind: "shake", a: 0.3 + (e.hard || 0.5) * 0.6 });
          if (e.type === "hit") bus.current.push({ x: B.x, y: B.y, z: B.z, color: "#a89a88", n: 8, speed: 2.5 });
        } else if (e.type === "orb") bus.current.push({ x: B.x, y: B.y + 1, z: B.z, color: "#7fe0ff", n: 18, speed: 3, life: 0.6 });
        else if (e.type === "trickLanded") bus.current.push({ x: B.x, y: B.y + 0.5, z: B.z, color: "#ffd84a", n: 14 + e.combo * 6, speed: 3.5, life: 0.7 });
        else if (e.type === "boost") bus.current.push({ x: B.x, y: B.y + 0.4, z: B.z, color: "#7fe0ff", n: 14, speed: 3, life: 0.5 });
      }
      audio?.onEvents(events, race);
      onEvents?.(events);
    }
    audio?.update(race);
  }, -1);

  const focus = () => race.player.bike;
  return (
    <>
      <Sizer />
      <Sky region={region} seed={T.def.seed} />
      <Lights region={region} focus={focus} shadows={shadows} />
      <WorldMesh T={T} G={G} region={region} quality={settings.graphics} race={race} />
      {race.racers.map((r) => (
        <RaceRider key={r.id} racer={r} race={race} G={G} shadows={shadows} />
      ))}
      {settings.effects !== false && <Particles race={race} bus={bus} quality={settings.graphics} reduced={reduced} />}
      {settings.effects !== false && <Weather region={region} quality={settings.graphics} reduced={reduced} />}
      {settings.effects !== false && <SunShafts region={region} reduced={reduced} />}
      <CameraRig race={race} G={G} shake={settings.shake ?? 1} reduced={reduced} camBus={camBus} />
    </>
  );
}

