/**
 * Police Escape 3D — 3D backdrops behind the menus (one canvas, kept alive
 * while you move between menu screens):
 *
 *   menu    the selected car on a wet, neon-lit downtown street at night;
 *           two police cruisers with flashing lightbars behind it, towers,
 *           distant traffic crossing an intersection; slow camera drift
 *   garage  a dark premium garage: glossy reflective floor, soft spotlights,
 *           neon ringed turntable; the car turns slowly and can be dragged
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildCity } from "../engine/city.js";
import { buildCityMesh } from "./cityMesh.js";
import { buildCar } from "./carModel.js";
import { NightLights, POLICE_CAR } from "./GameScene.jsx";
import { WORLDS } from "../data/worlds.js";
import { labelTex, shadowTex, softDot } from "./textures.js";
import { useCanvasWatchdog, SceneErrorBoundary } from "../utils/canvasGuard.jsx";
import { frameloop, glTest, Sizer, TEST } from "../utils/testHooks.js";

const MENU_WORLD = { ...WORLDS[0], sky: { ...WORLDS[0].sky, rain: true, fogNear: 50, fogFar: 420 } };
let menuCity = null;
const getMenuCity = () =>
  (menuCity =
    menuCity ||
    buildCity({
      cols: [70, 60, 80, 64, 70],
      rows: [60, 70, 60],
      avenues: { x: [2], z: [1] },
      blocks: {},
      alleys: [],
      closed: [],
    }));

function blobOf(len = 5.2) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, len), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  return m;
}

function MenuStreet({ carDef, quality }) {
  const city = getMenuCity();
  const { camera } = useThree();
  const cityMesh = useMemo(() => buildCityMesh(city, MENU_WORLD, quality === "high" ? "medium" : quality, { seed: 3 }), [city, quality]);
  const decal = useMemo(() => new THREE.MeshBasicMaterial({ map: labelTex("POLICE", { bg: "#0c0d10", fg: "#ffffff", accent: "#0c0d10", w: 512, h: 112, font: 80 }) }), []);
  const car = useMemo(() => buildCar(carDef, quality), [carDef, quality]);
  const cops = useMemo(() => [0, 1].map(() => buildCar(POLICE_CAR, quality === "high" ? "medium" : "low", { police: true, glowTex: softDot(), decal })), [quality, decal]);
  const traffic = useMemo(
    () =>
      ["#8a1c22", "#c8ccd4", "#1f4a8a"].map((c, i) =>
        buildCar({ id: `m${i}`, body: ["sedan", "suv", "compact"][i], colors: { body: c, accent: c, trim: "#16171b", glass: "#121925", rim: "#a0a6b0", light: "#fff2d6", glow: "#fff" } }, "low"),
      ),
    [],
  );
  const blobs = useMemo(() => [blobOf(), blobOf(), blobOf()], []);
  useEffect(() => () => cityMesh.dispose(), [cityMesh]);
  useEffect(() => () => car.dispose(), [car]);
  useEffect(
    () => () => {
      cops.forEach((c) => c.dispose());
      decal.dispose();
    },
    [cops, decal],
  );
  useEffect(() => () => traffic.forEach((c) => c.dispose()), [traffic]);
  useEffect(() => () => blobs.forEach((b) => (b.geometry.dispose(), b.material.dispose())), [blobs]);
  // the scene: the avenue along z (column line 2), the car facing the camera
  const ax = city.X[2];
  const az = city.Z[1] + 46;
  useEffect(() => {
    car.group.position.set(ax + 2.5, 0, az);
    car.group.rotation.y = Math.PI * 0.86;
    blobs[0].position.set(ax + 2.5, 0.06, az);
    blobs[0].rotation.z = Math.PI * 0.86;
    cops[0].group.position.set(ax - 3.4, 0, az + 13);
    cops[0].group.rotation.y = Math.PI * 1.08;
    cops[1].group.position.set(ax + 4.6, 0, az + 19);
    cops[1].group.rotation.y = Math.PI * 0.93;
    blobs[1].position.copy(cops[0].group.position).setY(0.06);
    blobs[1].rotation.z = cops[0].group.rotation.y;
    blobs[2].position.copy(cops[1].group.position).setY(0.06);
    blobs[2].rotation.z = cops[1].group.rotation.y;
  }, [car, cops, blobs, ax, az]);
  const red = useRef();
  const blue = useRef();
  const t = useRef(0);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    t.current += dt;
    const k = t.current;
    const sway = Math.sin(k * 0.13) * 1.6;
    // looking up the avenue (+z): the car sits right of the menu column,
    // the police cruisers behind it
    camera.position.set(ax + 7.5 + sway, 1.5 + Math.sin(k * 0.21) * 0.12, az - 9);
    look.set(ax + 3.2, 1.9, az + 8);
    camera.lookAt(look);
    if (camera.fov !== 48) {
      camera.fov = 48;
      camera.updateProjectionMatrix();
    }
    cityMesh.update(null, dt, k);
    car.update({ wheelSpin: 0, steer: -0.3, compress: 0, lean: 0, pitchA: 0, braking: false, nitro: false, boost: false, air: false, headlights: true }, dt);
    cops.forEach((c, i) => c.update({ wheelSpin: 0, steer: 0, compress: 0, lean: 0, pitchA: 0, braking: true, nitro: false, boost: false, air: false, headlights: true, siren: k + i * 0.4 }, dt));
    // distant cross traffic on the far road
    traffic.forEach((c, i) => {
      const lane = i % 2 ? 1 : -1;
      const sp = 9 + i * 2;
      const span = 520;
      const x = ((((k * sp + i * 170) % span) + span) % span) - 120;
      c.group.position.set(lane > 0 ? x : span - 240 - x, 0, city.Z[2] + lane * 3.4);
      c.group.rotation.y = lane > 0 ? Math.PI / 2 : -Math.PI / 2;
      c.update({ wheelSpin: k * sp * 3, steer: 0, compress: 0, lean: 0, pitchA: 0, braking: false, nitro: false, boost: false, air: false, headlights: true }, dt);
    });
    const ph = k % 0.8;
    if (red.current) red.current.intensity = ph < 0.25 ? 140 : 15;
    if (blue.current) blue.current.intensity = ph > 0.4 && ph < 0.65 ? 140 : 15;
  });
  const focus = () => ({ x: ax, z: az });
  return (
    <>
      <NightLights world={MENU_WORLD} focus={focus} shadowSize={quality === "low" ? 0 : 1024} />
      <primitive object={cityMesh.group} />
      <primitive object={car.group} />
      {cops.map((c, i) => (
        <primitive key={i} object={c.group} />
      ))}
      {traffic.map((c, i) => (
        <primitive key={`t${i}`} object={c.group} />
      ))}
      {blobs.map((b, i) => (
        <primitive key={`b${i}`} object={b} />
      ))}
      <pointLight ref={red} color="#ff1a3a" position={[ax - 3.4, 2.4, az + 13]} distance={34} decay={1.6} intensity={0} />
      <pointLight ref={blue} color="#2a5aff" position={[ax + 4.6, 2.4, az + 19]} distance={34} decay={1.6} intensity={0} />
      <pointLight position={[ax + 1, 6, az - 5]} intensity={60} distance={28} decay={1.5} color="#dfe8ff" />
    </>
  );
}

function GarageWorld({ carDef, quality, spinRef }) {
  const { scene, gl, camera } = useThree();
  const room = useMemo(() => {
    const g = new THREE.Group();
    const geos = [];
    const mats = [];
    const k = (x) => (geos.push(x), x);
    const km = (x) => (mats.push(x), x);
    const floor = new THREE.Mesh(k(new THREE.CircleGeometry(40, 48)), km(new THREE.MeshStandardMaterial({ color: "#0e1016", roughness: 0.12, metalness: 0.75 })));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);
    const lineM = km(new THREE.MeshBasicMaterial({ color: "#1c2130" }));
    for (let i = -8; i <= 8; i++) {
      const a = new THREE.Mesh(k(new THREE.PlaneGeometry(0.04, 60)), lineM);
      a.rotation.x = -Math.PI / 2;
      a.position.set(i * 3, 0.005, 0);
      g.add(a);
    }
    const tt = new THREE.Mesh(k(new THREE.CylinderGeometry(4.2, 4.4, 0.25, 64)), km(new THREE.MeshStandardMaterial({ color: "#1c1f27", roughness: 0.25, metalness: 0.8 })));
    tt.position.y = 0.125;
    tt.receiveShadow = true;
    g.add(tt);
    const ringM = km(new THREE.MeshBasicMaterial({ color: carDef.colors.glow, toneMapped: false }));
    const ring = new THREE.Mesh(k(new THREE.TorusGeometry(4.3, 0.06, 8, 96)), ringM);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.26;
    g.add(ring);
    const wallM = km(new THREE.MeshStandardMaterial({ color: "#15181f", roughness: 0.85, metalness: 0.2, side: THREE.DoubleSide }));
    const stripM = km(new THREE.MeshBasicMaterial({ color: "#f2f4ff", toneMapped: false }));
    const blueM = km(new THREE.MeshBasicMaterial({ color: "#2a6aff", toneMapped: false }));
    const redM = km(new THREE.MeshBasicMaterial({ color: "#ff2a3a", toneMapped: false }));
    const wall = new THREE.Mesh(k(new THREE.CylinderGeometry(22, 22, 12, 48, 1, true, Math.PI * 0.55, Math.PI * 0.9)), wallM);
    wall.position.y = 6;
    g.add(wall);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.6 + (i / 8) * Math.PI * 0.8;
      const s = new THREE.Mesh(k(new THREE.BoxGeometry(0.22, 8, 0.1)), i % 3 === 0 ? blueM : i % 3 === 1 ? stripM : redM);
      s.position.set(Math.sin(a) * 21.8, 5, Math.cos(a) * 21.8);
      s.rotation.y = a;
      g.add(s);
    }
    for (let i = -1; i <= 1; i++) {
      const p = new THREE.Mesh(k(new THREE.BoxGeometry(7, 0.12, 1.1)), stripM);
      p.position.set(i * 3.2, 9, 0);
      g.add(p);
    }
    const signM = km(new THREE.MeshBasicMaterial({ map: labelTex("GETAWAY GARAGE", { bg: "#0b0d12", fg: "#ffffff", accent: "#2a6aff", w: 1024, h: 160, font: 88 }), toneMapped: false }));
    const sign = new THREE.Mesh(k(new THREE.PlaneGeometry(12, 1.9)), signM);
    sign.position.set(0, 5.6, -20.5);
    g.add(sign);
    return { g, ringM, dispose: () => (geos.forEach((x) => x.dispose()), mats.forEach((x) => x.dispose())) };
  }, [carDef]);
  useEffect(() => () => room.dispose(), [room]);
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04);
    pm.dispose();
    scene.environment = env.texture;
    scene.background = new THREE.Color("#07080c");
    scene.fog = new THREE.Fog("#07080c", 18, 46);
    return () => {
      scene.environment = null;
      scene.background = null;
      scene.fog = null;
      env.dispose();
    };
  }, [scene, gl]);
  const car = useMemo(() => buildCar(carDef, quality === "low" ? "medium" : quality), [carDef, quality]);
  const blob = useMemo(() => {
    const m = blobOf(5.4);
    m.position.y = 0.26;
    return m;
  }, []);
  useEffect(
    () => () => {
      car.dispose();
      blob.geometry.dispose();
      blob.material.dispose();
    },
    [car, blob],
  );
  const holderRef = useRef(null);
  car.group.position.y = 0.25;
  useEffect(() => {
    if (TEST) window.__pe = { ...(window.__pe || {}), garage: { scene, car, camera, gl } };
  }, [scene, car, camera, gl]);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const S = spinRef.current;
    if (!S.drag) S.vel += (0.35 - S.vel) * Math.min(1, dt * 1.5);
    S.angle += S.vel * dt;
    if (holderRef.current) holderRef.current.rotation.y = S.angle;
    camera.position.set(0, 2.5, 9.6);
    camera.lookAt(0, 0.9, 0);
    if (camera.fov !== 42) {
      camera.fov = 42;
      camera.updateProjectionMatrix();
    }
    car.update({ wheelSpin: 0, steer: 0.25, compress: 0, lean: 0, pitchA: 0, braking: false, nitro: false, boost: false, air: false, headlights: true }, dt);
    room.ringM.color.set(carDef.colors.glow);
  });
  return (
    <>
      <ambientLight intensity={0.2} />
      <spotLight position={[0, 11, 4]} angle={0.55} penumbra={0.7} intensity={190} distance={30} castShadow={quality !== "low"} shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <spotLight position={[-6, 6, 7]} angle={0.5} penumbra={0.8} intensity={60} distance={25} color="#bcd0ff" />
      <pointLight position={[7, 3, -4]} intensity={24} color={carDef.colors.glow} distance={20} />
      <primitive object={room.g} />
      <group ref={holderRef}>
        <primitive object={car.group} />
        <primitive object={blob} />
      </group>
    </>
  );
}

export default function MenuScene({ mode, carDef, quality }) {
  const host = useRef(null);
  useCanvasWatchdog(host);
  const spin = useRef({ angle: -0.6, vel: 0.35, drag: false, lastX: 0 });
  const onCreated = ({ gl }) => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.1;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  };
  const garage = mode === "garage";
  const handlers = garage
    ? {
        onPointerDown: (e) => {
          spin.current.drag = true;
          spin.current.lastX = e.clientX;
          spin.current.vel = 0;
        },
        onPointerMove: (e) => {
          const S = spin.current;
          if (!S.drag) return;
          const dx = e.clientX - S.lastX;
          S.lastX = e.clientX;
          S.angle += dx * 0.01;
          S.vel = dx * 0.6;
        },
        onPointerUp: () => (spin.current.drag = false),
        onPointerLeave: () => (spin.current.drag = false),
      }
    : {};
  const dpr = quality === "low" ? [0.6, 0.9] : quality === "high" ? [1, 1.75] : [0.85, 1.3];
  return (
    <div className={`pe-canvas pe-canvas--${garage ? "garage" : "menu"}`} ref={host} {...handlers}>
      <SceneErrorBoundary>
        <Canvas frameloop={frameloop} dpr={dpr} shadows={quality !== "low"} gl={{ antialias: true, ...glTest }} camera={{ fov: 48, near: 0.2, far: 3000, position: [0, 3, 10] }} onCreated={onCreated}>
          <Sizer />
          {garage ? <GarageWorld carDef={carDef} quality={quality} spinRef={spin} /> : <MenuStreet carDef={carDef} quality={quality} />}
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
