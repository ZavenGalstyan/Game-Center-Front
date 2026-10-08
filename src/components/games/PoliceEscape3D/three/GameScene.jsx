/**
 * Police Escape 3D — one mission's 3D scene and its frame loop.
 *
 * The loop (priority −1, so R3F keeps auto-rendering) steps the mission with
 * the shared input, drains its events and fans them out to audio, particles,
 * the camera and the React HUD. Lighting is a night setup: hemisphere +
 * moonlight (one modest shadow map that follows the player), the player's
 * headlights (one spot light) and one red / blue point light riding the
 * nearest police car; everything else glows through emissive materials and
 * additive sprites. A small PMREM of neon panels gives paint and wet roads
 * something to reflect.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buildCityMesh } from "./cityMesh.js";
import { buildCar } from "./carModel.js";
import CameraRig from "./CameraRig.jsx";
import { Particles, Rain } from "./Effects.jsx";
import { shadowTex, softDot, labelTex } from "./textures.js";
import { PSTATE } from "../engine/police.js";
import { Sizer, TEST } from "../utils/testHooks.js";

export const POLICE_CAR = { id: "police", body: "sedan", colors: { body: "#eef1f5", accent: "#0c0d10", trim: "#16171b", glass: "#101722", rim: "#9aa3b2", light: "#e9f2ff", glow: "#3a8bff" } };
const TRAFFIC_COLORS = ["#c8ccd4", "#2a2d34", "#8a1c22", "#1f4a8a", "#e3e5e8", "#556270", "#2f6a4a", "#b88a2a"];

/** Night environment for reflections: dark room with glowing neon panels. */
export function cityEnv(gl, pal) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#05060a");
  const geo = new THREE.PlaneGeometry(1, 1);
  const panels = [];
  const r = (k) => (Math.sin(k * 91.7) * 43758.5453) % 1;
  for (let i = 0; i < 18; i++) {
    const m = new THREE.MeshBasicMaterial({ color: i % 3 ? pal.windows[i % pal.windows.length] : pal.neon[i % pal.neon.length], side: THREE.DoubleSide });
    const p = new THREE.Mesh(geo, m);
    const a = (i / 18) * Math.PI * 2;
    p.position.set(Math.sin(a) * 12, 1 + Math.abs(r(i)) * 6, Math.cos(a) * 12);
    p.lookAt(0, 2, 0);
    p.scale.set(2 + Math.abs(r(i + 3)) * 4, 1 + Math.abs(r(i + 7)) * 3, 1);
    scene.add(p);
    panels.push(m);
  }
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: "#20283a", side: THREE.DoubleSide }));
  sky.rotation.x = Math.PI / 2;
  sky.position.y = 14;
  scene.add(sky);
  const pm = new THREE.PMREMGenerator(gl);
  const rt = pm.fromScene(scene, 0.03);
  pm.dispose();
  geo.dispose();
  panels.forEach((m) => m.dispose());
  sky.geometry.dispose();
  sky.material.dispose();
  return rt;
}

export function NightLights({ world, focus, shadowSize }) {
  const moon = useRef();
  const { scene, gl } = useThree();
  const sky = world.sky;
  useEffect(() => {
    scene.fog = new THREE.Fog(sky.fog, sky.fogNear, sky.fogFar);
    scene.background = new THREE.Color(sky.top);
    const env = cityEnv(gl, world.palette);
    scene.environment = env.texture;
    return () => {
      scene.fog = null;
      scene.background = null;
      scene.environment = null;
      env.dispose();
    };
  }, [scene, gl, world, sky]);
  useFrame(() => {
    const f = focus();
    if (!moon.current || !f) return;
    moon.current.position.set(f.x + 30, 60, f.z + 20);
    moon.current.target.position.set(f.x, 0, f.z);
    moon.current.target.updateMatrixWorld();
  });
  return (
    <>
      <directionalLight
        ref={moon}
        color={sky.moon}
        intensity={sky.light}
        castShadow={shadowSize > 0}
        shadow-mapSize-width={shadowSize || 512}
        shadow-mapSize-height={shadowSize || 512}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-near={5}
        shadow-camera-far={140}
        shadow-bias={-0.0006}
      />
      <hemisphereLight args={[sky.hemiSky, sky.hemiGround, sky.ambient]} />
    </>
  );
}

/** Sky dome: a vertical gradient with a moon glow (follows the camera). */
function Sky({ world }) {
  const { camera } = useThree();
  const built = useMemo(() => {
    const g = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color(world.sky.top) }, horizon: { value: new THREE.Color(world.sky.horizon) } },
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
        void main(){ float h = max(vDir.y, 0.0); vec3 c = mix(horizon, top, pow(h, 0.45)); gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
        }`,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2400, 24, 12), mat);
    dome.renderOrder = -10;
    g.add(dome);
    const moonMat = new THREE.SpriteMaterial({ map: softDot(), color: world.sky.moon, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0.85 });
    const moon = new THREE.Sprite(moonMat);
    moon.position.set(900, 700, -1400);
    moon.scale.setScalar(180);
    g.add(moon);
    // stars
    const n = 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = 0.15 + Math.random() * 1.3;
      pos.set([Math.cos(a) * Math.cos(e) * 2200, Math.sin(e) * 2200, Math.sin(a) * Math.cos(e) * 2200], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const sm = new THREE.PointsMaterial({ color: "#ffffff", size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: world.sky.rain ? 0 : 0.7 });
    g.add(new THREE.Points(sg, sm));
    return { g, dispose: () => g.traverse((o) => (o.geometry?.dispose(), o.material?.dispose())) };
  }, [world]);
  useEffect(() => () => built.dispose(), [built]);
  useFrame(() => built.g.position.set(camera.position.x, 0, camera.position.z));
  return <primitive object={built.g} />;
}

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

function useBlob() {
  return useMemo(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.2), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4 }));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 1;
    return m;
  }, []);
}

/** Player car: model + headlights + blob shadow, posed from the sim. */
function PlayerCar({ run, carDef, quality, shadows }) {
  const built = useMemo(() => buildCar(carDef, quality), [carDef, quality]);
  const blob = useBlob();
  // a soft cool light riding above the car so a dark paint job still reads at night
  const fill = useMemo(() => {
    const l = new THREE.PointLight("#c8d8ff", 14, 9, 1.4);
    l.position.set(0, 3.2, -1.6);
    return l;
  }, []);
  const head = useMemo(() => {
    const l = new THREE.SpotLight("#e8f0ff", 60, 70, 0.55, 0.5, 1.4);
    l.position.set(0, 1, 1.6);
    l.target.position.set(0, 0, 14);
    return l;
  }, []);
  useEffect(() => {
    built.group.add(head, head.target, fill);
    built.group.traverse((o) => o.isMesh && (o.castShadow = shadows && o.castShadow !== false));
    return () => {
      built.group.remove(head, head.target, fill);
      built.dispose();
    };
  }, [built, head, shadows]);
  useEffect(
    () => () => {
      blob.geometry.dispose();
      blob.material.dispose();
      head.dispose();
    },
    [blob, head],
  );
  const st = useRef({ lastV: 0, acc: 0 });
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const c = run.player;
    void dt;
    built.group.position.set(c.x, 0, c.z);
    _q.setFromAxisAngle(_up, c.h);
    built.group.quaternion.copy(_q);
    blob.position.set(c.x, 0.06, c.z);
    blob.rotation.z = c.h;
    const a = (c.fwd - st.current.lastV) / Math.max(dt, 1e-3);
    st.current.lastV = c.fwd;
    st.current.acc += (Math.max(-30, Math.min(30, a)) - st.current.acc) * Math.min(1, dt * 6);
    built.update(
      {
        wheelSpin: c.wheelSpin,
        steer: c.steerVis,
        compress: c.bump * 0.3,
        lean: c.steerVis * Math.min(1, Math.abs(c.fwd) / 16) * (c.handbrake ? 1.5 : 1),
        pitchA: -st.current.acc / 10,
        braking: c.braking || (c.handbrake && Math.abs(c.fwd) > 2),
        nitro: c.nitroOn,
        boost: false,
        air: false,
        headlights: true,
      },
      dt,
    );
    // collision jolt
    built.body.position.x = (Math.random() - 0.5) * c.bump * 0.08;
  });
  return (
    <>
      <primitive object={built.group} />
      <primitive object={blob} />
    </>
  );
}

/** One police car (built once per pursuit slot), with siren lights. */
function PoliceCar({ cop, quality, decal }) {
  const built = useMemo(() => buildCar(POLICE_CAR, quality === "high" ? "medium" : quality, { police: true, glowTex: softDot(), decal }), [quality, decal]);
  const blob = useBlob();
  useEffect(
    () => () => {
      built.dispose();
      blob.geometry.dispose();
      blob.material.dispose();
    },
    [built, blob],
  );
  const t = useRef(cop.id * 0.37);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    t.current += dt;
    const c = cop.car;
    const vis = cop.state !== PSTATE.LOST;
    built.group.visible = vis;
    blob.visible = vis;
    if (!vis) return;
    built.group.position.set(c.x, 0, c.z);
    built.group.rotation.y = c.h;
    blob.position.set(c.x, 0.06, c.z);
    blob.rotation.z = c.h;
    built.update({ wheelSpin: c.wheelSpin, steer: c.steerVis, compress: 0, lean: c.steerVis * Math.min(1, Math.abs(c.fwd) / 16), pitchA: 0, braking: c.braking, nitro: false, boost: false, air: false, headlights: true, siren: cop.state === PSTATE.DISABLED ? null : t.current }, dt);
  });
  return (
    <>
      <primitive object={built.group} />
      <primitive object={blob} />
    </>
  );
}

/** One pooled traffic car. */
function TrafficCar({ car, quality }) {
  const def = useMemo(() => {
    const body = car.style === "taxi" ? "sedan" : car.style;
    const col = car.style === "taxi" ? "#f2c21a" : TRAFFIC_COLORS[car.color % TRAFFIC_COLORS.length];
    return { id: `t${car.id}`, body, colors: { body: col, accent: col, trim: "#16171b", glass: "#121925", rim: "#a0a6b0", light: "#fff2d6", glow: "#ffffff" } };
  }, [car]);
  const built = useMemo(() => buildCar(def, quality === "low" ? "low" : "low", { taxi: car.style === "taxi" }), [def, quality, car.style]);
  const blob = useBlob();
  useEffect(
    () => () => {
      built.dispose();
      blob.geometry.dispose();
      blob.material.dispose();
    },
    [built, blob],
  );
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    built.group.visible = car.active;
    blob.visible = car.active;
    if (!car.active) return;
    built.group.position.set(car.x, 0, car.z);
    built.group.rotation.y = car.h;
    blob.position.set(car.x, 0.06, car.z);
    blob.rotation.z = car.h;
    built.update({ wheelSpin: car.wheelSpin, steer: 0, compress: 0, lean: 0, pitchA: 0, braking: car.braking, nitro: false, boost: false, air: false, headlights: true }, dt);
  });
  return (
    <>
      <primitive object={built.group} />
      <primitive object={blob} />
    </>
  );
}

/** A red / blue light that rides the nearest active police car. */
function SirenLight({ run }) {
  const light = useRef();
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    const L = light.current;
    if (!L) return;
    let best = null;
    for (const c of run.police) {
      if (c.state === PSTATE.LOST || c.state === PSTATE.DISABLED) continue;
      if (!best || c.distToPlayer < best.distToPlayer) best = c;
    }
    if (!best || best.distToPlayer > 120) {
      L.intensity = 0;
      return;
    }
    L.position.set(best.car.x, 2.2, best.car.z);
    const ph = t.current % 0.8;
    const red = ph < 0.25;
    L.color.set(red ? "#ff1a3a" : "#2a5aff");
    L.intensity = (ph % 0.4) < 0.25 ? 120 : 20;
  });
  return <pointLight ref={light} distance={30} decay={1.6} intensity={0} />;
}

function City({ run, world, quality, decal }) {
  const city = useMemo(() => buildCityMesh(run.city, world, quality, { seed: run.def.world, policeDef: POLICE_CAR, decal }), [run.city, world, quality, run.def.world, decal]);
  useEffect(() => () => city.dispose(), [city]);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    city.update(run, Math.min(dt, 0.05), t.current);
  });
  return <primitive object={city.group} />;
}

export default function GameScene({ run, world, carDef, input, audio, settings, onEvents, speedRef }) {
  const bus = useRef([]);
  const camBus = useRef([]);
  const [, setCops] = useState(0);
  const quality = settings.graphics;
  const shadowSize = { off: 0, low: 1024, medium: 2048, high: 4096 }[settings.shadows] ?? 2048;
  const reduced = !!settings.reducedMotion;
  const three = useThree();
  const decal = useMemo(() => new THREE.MeshBasicMaterial({ map: labelTex("POLICE", { bg: "#0c0d10", fg: "#ffffff", accent: "#0c0d10", w: 512, h: 112, font: 80 }), transparent: false }), []);
  useEffect(() => () => decal.dispose(), [decal]);
  useEffect(() => {
    if (TEST) window.__pe = { ...(window.__pe || {}), gl: three.gl, scene: three.scene, camera: three.camera };
  }, [three.gl, three.scene, three.camera]);

  useFrame((_, dtRaw) => {
    if (bus.current.length > 60) bus.current.length = 0;
    if (run.paused) return;
    run.tick(Math.min(dtRaw, 0.1), input);
    const events = run.drain();
    if (events.length) {
      for (const e of events) {
        if (e.type === "hit") {
          const k = Math.min(1, e.vn / 20);
          bus.current.push({ x: e.x, y: 0.8, z: e.z, color: "#ffb347", n: 8 + Math.round(k * 22), speed: 4 + k * 4, up: 2.5, life: 0.45, grav: 14 });
          if (e.vn > 5) camBus.current.push({ a: 0.25 + k * 0.75 });
        } else if (e.type === "copDisabled") bus.current.push({ x: e.x, y: 1, z: e.z, color: "#ffd27a", n: 26, speed: 6, up: 3, life: 0.6, grav: 12 });
        else if (e.type === "nitro") bus.current.push({ x: run.player.x, y: 1.2, z: run.player.z, color: "#5ac8ff", n: 24, speed: 4, up: 2.5, life: 0.6, grav: 2 });
        else if (e.type === "checkpoint") bus.current.push({ x: run.player.x, y: 2.5, z: run.player.z, color: "#ffc21a", n: 30, speed: 6, up: 2.5, life: 0.8, grav: 3 });
        else if (e.type === "copSpawn") setCops((n) => n + 1);
        else if (e.type === "nearMiss") bus.current.push({ x: run.player.x, y: 1, z: run.player.z, color: "#9fe8ff", n: 8, speed: 3, up: 1, life: 0.35, grav: 0 });
      }
      audio?.onEvents(events, run);
      onEvents?.(events);
    }
    audio?.update(run);
  }, -1);

  const focus = () => run.player;
  const onSpeed = (vn, nitro) => {
    const el = speedRef?.current;
    if (!el) return;
    const k = reduced ? 0 : Math.max(0, (vn - 0.78) * 2.4) * 0.45 + (nitro ? 0.55 : 0);
    const o = Math.min(0.85, k).toFixed(2);
    if (el.style.opacity !== o) el.style.opacity = o;
  };
  return (
    <>
      <Sizer />
      <Sky world={world} />
      <NightLights world={world} focus={focus} shadowSize={quality === "low" ? 0 : shadowSize} />
      <City run={run} world={world} quality={quality} decal={decal} />
      <PlayerCar run={run} carDef={carDef} quality={quality} shadows={shadowSize > 0 && quality !== "low"} />
      {run.police.map((cop) => (
        <PoliceCar key={cop.id} cop={cop} quality={quality} decal={decal} />
      ))}
      {run.traffic.cars.map((t) => (
        <TrafficCar key={t.id} car={t} quality={quality} />
      ))}
      <SirenLight run={run} />
      <Particles run={run} bus={bus} quality={quality} reduced={reduced} />
      {world.sky.rain && <Rain quality={quality} reduced={reduced} />}
      <CameraRig run={run} shake={settings.shake ?? 1} reduced={reduced} camBus={camBus} onSpeed={onSpeed} />
    </>
  );
}
