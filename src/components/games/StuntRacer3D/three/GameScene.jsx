/**
 * Stunt Racer 3D — one level's 3D scene and its frame loop.
 *
 * The loop (priority −1, so R3F keeps auto-rendering and it runs before the
 * camera / effects) steps the run with the shared input, drains its events
 * and fans them out: audio, particle bursts, camera dips / shakes and the
 * React HUD (onEvents). The sun's shadow box follows the car so one modest
 * shadow map stays crisp; the car also gets a soft blob shadow projected on
 * the road under it — in the air that blob shows where you will land.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buildTrackMesh } from "./trackMesh.js";
import { buildSky, buildScenery, envMap, sunDir, groundLevel } from "./environment.js";
import { buildCar } from "./carModel.js";
import CameraRig from "./CameraRig.jsx";
import { Particles } from "./Effects.jsx";
import { shadowTex } from "./textures.js";
import { roadAt } from "../engine/track.js";
import { Sizer, TEST } from "../utils/testHooks.js";

export function WorldLights({ world, focus, shadows }) {
  const sun = useRef();
  const { scene, gl } = useThree();
  const sky = world.sky;
  const dir = useMemo(() => sunDir(world), [world]);
  useEffect(() => {
    scene.fog = new THREE.Fog(sky.fog, sky.fogNear, sky.fogFar);
    const env = envMap(world, gl);
    scene.environment = env.texture;
    return () => {
      scene.fog = null;
      scene.environment = null;
      env.dispose();
    };
  }, [scene, gl, world, sky]);
  useFrame(() => {
    const f = focus();
    if (!sun.current || !f) return;
    const k = Math.max(0.25, dir.y);
    sun.current.position.set(f.x + (dir.x / k) * 40, f.y + 40, f.z + (dir.z / k) * 40);
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
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={2}
        shadow-camera-far={140}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
      />
      <hemisphereLight args={[sky.hemiSky, sky.hemiGround, sky.ambient]} />
    </>
  );
}

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, "YXZ");

/** Poses the car model from the simulation every frame. */
export function poseCar(group, car) {
  if (car.mode === "ground") {
    _z.set(car.F.x, car.F.y, car.F.z);
    _y.set(car.U.x, car.U.y, car.U.z);
    _x.crossVectors(_y, _z).normalize();
    _z.crossVectors(_x, _y).normalize();
    _m.makeBasis(_x, _y, _z);
    group.quaternion.setFromRotationMatrix(_m);
  } else {
    const tb = car.mode === "fall" ? car.tumble : null;
    _e.set(-car.pitch + (tb ? tb.x : 0), car.h + (tb ? tb.y : 0), car.roll + (tb ? tb.z : 0), "YXZ");
    _q.setFromEuler(_e);
    group.quaternion.slerp(_q, car.mode === "fall" ? 1 : 0.35);
  }
  group.position.set(car.x, car.y, car.z);
}

function CarView({ run, carDef, quality, shadows, night }) {
  const built = useMemo(() => buildCar(carDef, quality), [carDef, quality]);
  const blob = useMemo(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.0), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -4 }));
    m.renderOrder = 1;
    return m;
  }, []);
  useEffect(() => {
    built.group.traverse((o) => {
      if (o.isMesh) o.castShadow = shadows && o.castShadow;
    });
  }, [built, shadows]);
  useEffect(
    () => () => {
      built.dispose();
      blob.geometry.dispose();
      blob.material.dispose();
    },
    [built, blob],
  );
  const T = run.T;
  const st = useRef({ acc: 0, lastV: 0 });
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const car = run.car;
    poseCar(built.group, car);
    const v = car.fwd;
    const a = (v - st.current.lastV) / Math.max(dt, 1e-3);
    st.current.lastV = v;
    st.current.acc += (Math.max(-30, Math.min(30, a)) - st.current.acc) * Math.min(1, dt * 6);
    built.update(
      {
        wheelSpin: car.wheelSpin,
        steer: car.steerVis,
        compress: car.compress,
        lean: car.mode === "ground" ? car.steerVis * Math.min(1, Math.abs(v) / 18) * (car.handbrake ? 1.4 : 1) : 0,
        pitchA: car.mode === "ground" ? -st.current.acc / 10 : 0,
        braking: car.braking || (car.handbrake && Math.abs(v) > 2),
        nitro: car.nitroOn,
        boost: car.boostT > 0,
        air: car.mode !== "ground",
        headlights: night,
      },
      dt,
    );
    // blob shadow on the road below (shows the landing spot in the air)
    const s = car.s;
    const fr = T.frameAt(s);
    const above = car.mode === "ground" ? 0 : (car.x - fr.x) * fr.ux + (car.y - fr.y) * fr.uy + (car.z - fr.z) * fr.uz;
    const show = car.mode !== "fall" && roadAt(T, s, car.lat) && above > -0.5 && above < 60;
    blob.visible = show;
    if (show) {
      const lat = car.lat;
      blob.position.set(fr.x + fr.nx * lat + fr.ux * 0.06, fr.y + fr.ny * lat + fr.uy * 0.06, fr.z + fr.nz * lat + fr.uz * 0.06);
      _y.set(fr.ux, fr.uy, fr.uz);
      _z.set(car.F.x, car.F.y, car.F.z);
      _x.crossVectors(_z, _y).normalize(); // right = F × U
      _z.crossVectors(_y, _x).normalize(); // forward, re-orthogonalised
      _m.makeBasis(_x, _z, _y); // right-handed: the plane's +Z normal on the road normal
      blob.quaternion.setFromRotationMatrix(_m);
      const k = Math.max(0.3, 1 - above / 25);
      blob.scale.set(k + above * 0.02, k + above * 0.02, 1);
      blob.material.opacity = 0.8 * k;
    }
  });
  return (
    <>
      <primitive object={built.group} />
      <primitive object={blob} />
    </>
  );
}

function World({ run, world, quality, seed }) {
  const T = run.T;
  const { camera } = useThree();
  const sky = useMemo(() => buildSky(world, seed), [world, seed]);
  const scenery = useMemo(() => buildScenery(T, world, quality, seed), [T, world, quality, seed]);
  const track = useMemo(() => buildTrackMesh(T, world, quality, { obstacles: run.obstacles, tiles: run.tiles, groundY: groundLevel(T, world) }), [T, world, quality, run]);
  useEffect(() => () => sky.dispose(), [sky]);
  useEffect(() => () => scenery.dispose(), [scenery]);
  useEffect(() => () => track.dispose(), [track]);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    sky.follow(camera);
    scenery.update(t.current);
    track.update(run, Math.min(dt, 0.05), t.current);
  });
  return (
    <>
      <primitive object={sky.group} />
      <primitive object={scenery.group} />
      <primitive object={track.group} />
    </>
  );
}

export default function GameScene({ run, world, carDef, input, audio, settings, onEvents, fxRef, fadeRef }) {
  const bus = useRef([]);
  const camBus = useRef([]);
  const quality = settings.graphics;
  const shadows = quality !== "low" && settings.shadows !== false;
  const reduced = !!settings.reducedMotion;
  const three = useThree();
  useEffect(() => {
    if (TEST) window.__sr = { ...(window.__sr || {}), gl: three.gl, scene: three.scene, camera: three.camera };
  }, [three.gl, three.scene, three.camera]);
  const dust = world.theme === "desert" ? "#e2b07a" : world.theme === "neon" ? "#b89aff" : "#e8eef6";

  useFrame((_, dtRaw) => {
    if (bus.current.length > 60) bus.current.length = 0;
    if (run.paused) return;
    run.tick(Math.min(dtRaw, 0.1), input);
    const events = run.drain();
    if (events.length) {
      const c = run.car;
      for (const e of events) {
        if (e.type === "land" && !e.tiny) {
          if (e.airT > 0.25) bus.current.push({ x: c.x, y: c.y, z: c.z, color: dust, n: 12 + Math.round(e.hard * 18), speed: 3 + e.hard * 3, up: 1.4, spread: 2 });
          camBus.current.push({ kind: "land", a: Math.min(1, e.hard + (e.airT > 0.8 ? 0.3 : 0)) });
          if (e.hard > 0.5) bus.current.push({ x: c.x, y: c.y + 0.2, z: c.z, color: "#ffc46a", n: 10, speed: 5, up: 2, life: 0.4, grav: 12 });
        } else if (e.type === "hit" || e.type === "wall") {
          camBus.current.push({ kind: "shake", a: 0.3 + (e.hard || 0.5) * 0.6 });
          bus.current.push({ x: c.x + c.F.x * 1.5, y: c.y + 0.6, z: c.z + c.F.z * 1.5, color: "#ffb347", n: 10 + Math.round((e.hard || 0.5) * 14), speed: 5, up: 2.5, life: 0.45, grav: 14 });
        } else if (e.type === "crash") camBus.current.push({ kind: "shake", a: 0.6 });
        else if (e.type === "star") {
          const st = run.T.stars[e.i];
          bus.current.push({ x: st.pos.x, y: st.pos.y, z: st.pos.z, color: "#ffd84a", n: 30, speed: 5, up: 3, life: 0.8, grav: 2 });
        } else if (e.type === "nitro") bus.current.push({ x: c.x, y: c.y + 1, z: c.z, color: "#5ac8ff", n: 22, speed: 4, up: 2.5, life: 0.6, grav: 2 });
        else if (e.type === "boost") bus.current.push({ x: c.x, y: c.y + 0.3, z: c.z, color: "#38e8ff", n: 18, speed: 3, up: 1.5, life: 0.5, grav: 2 });
        else if (e.type === "checkpoint") bus.current.push({ x: c.x, y: c.y + 3, z: c.z, color: "#3ddc6a", n: 24, speed: 6, up: 2, life: 0.7, grav: 3 });
      }
      audio?.onEvents(events, run);
      onEvents?.(events);
    }
    audio?.update(run);
    const fe = fadeRef?.current;
    if (fe) {
      const o = run.fade.toFixed(2);
      if (fe.style.opacity !== o) fe.style.opacity = o;
    }
  }, -1);

  const focus = () => run.car;
  const onFov = (vn, nitro) => {
    const el = fxRef?.current;
    if (!el) return;
    const k = reduced ? 0 : Math.max(0, (vn - 0.8) * 2.2) * 0.5 + (nitro ? 0.55 : 0);
    const o = Math.min(0.85, k).toFixed(2);
    if (el.style.opacity !== o) el.style.opacity = o;
  };
  return (
    <>
      <Sizer />
      <WorldLights world={world} focus={focus} shadows={shadows} />
      <World run={run} world={world} quality={quality} seed={run.def.id} />
      <CarView run={run} carDef={carDef} quality={quality} shadows={shadows} night={!!world.sky.night} />
      <Particles run={run} bus={bus} quality={quality} reduced={reduced} />
      <CameraRig run={run} shake={settings.shake ?? 1} reduced={reduced} camBus={camBus} onFov={onFov} />
    </>
  );
}
