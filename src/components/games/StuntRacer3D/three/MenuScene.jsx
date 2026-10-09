/**
 * Stunt Racer 3D — the 3D backdrops behind the menus (one canvas, kept alive
 * while you move between menu screens):
 *
 *   menu    the selected car on a sunset sky platform; behind it a giant
 *           ramp, a gap, a loop and a curving sky road over a sea of clouds;
 *           a slow cinematic camera drift
 *   garage  a premium racing workshop: glossy floor, neon-ringed turntable,
 *           light strips, tyre stacks, tool cabinets; the car turns slowly
 *           and can be spun by dragging
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildTrack } from "../engine/track.js";
import { buildTrackMesh } from "./trackMesh.js";
import { buildSky, buildScenery, groundLevel } from "./environment.js";
import { buildCar } from "./carModel.js";
import { WorldLights } from "./GameScene.jsx";
import { WORLDS } from "../data/worlds.js";
import { labelTex, shadowTex } from "./textures.js";
import { useCanvasWatchdog, SceneErrorBoundary } from "../utils/canvasGuard.jsx";
import { frameloop, glTest, Sizer, TEST } from "../utils/testHooks.js";

const MENU_WORLD = WORLDS[4];
const SHOWCASE = {
  id: 0,
  name: "showcase",
  world: 5,
  width: 16,
  y0: 120,
  pieces: [
    { t: "S", len: 30 },
    { t: "C", len: 70, ang: -60 },
    { t: "S", len: 40 },
    { t: "loop", R: 15, side: -1 },
    { t: "S", len: 40 },
    { t: "ramp", len: 26, rise: 7 },
    { t: "gap", len: 34, drop: 5 },
    { t: "land", len: 30, drop: 4 },
    { t: "S", len: 26, start: true },
    { t: "S", len: 50 },
  ],
};
let showcaseTrack = null;
const getShowcase = () => (showcaseTrack = showcaseTrack || buildTrack(SHOWCASE));

function placeStatic(group, f, lat, yaw) {
  const m = new THREE.Matrix4();
  m.makeBasis(new THREE.Vector3(f.nx, f.ny, f.nz), new THREE.Vector3(f.ux, f.uy, f.uz), new THREE.Vector3(f.tx, f.ty, f.tz));
  group.quaternion.setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
  group.position.set(f.x + f.nx * lat, f.y + f.ny * lat, f.z + f.nz * lat);
}

function MenuWorld({ carDef, quality }) {
  const T = getShowcase();
  const { camera } = useThree();
  const sky = useMemo(() => buildSky(MENU_WORLD, 9), []);
  const scenery = useMemo(() => buildScenery(T, MENU_WORLD, quality === "high" ? "medium" : quality, 9), [T, quality]);
  const track = useMemo(() => buildTrackMesh(T, MENU_WORLD, quality, { groundY: groundLevel(T, MENU_WORLD), gates: "start" }), [T, quality]);
  const car = useMemo(() => buildCar(carDef, quality), [carDef, quality]);
  useEffect(() => () => sky.dispose(), [sky]);
  useEffect(() => () => scenery.dispose(), [scenery]);
  useEffect(() => () => track.dispose(), [track]);
  useEffect(() => () => car.dispose(), [car]);
  const spot = T.start + 17;
  const f = T.frameAt(spot);
  useEffect(() => {
    // the car turned three-quarters towards the camera, ramps and loop behind
    placeStatic(car.group, f, 0, Math.PI * 0.82);
  }, [car, f]);
  const t = useRef(0);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    const k = t.current;
    // camera ahead of the car, low, drifting gently from side to side
    const fwd = new THREE.Vector3(f.tx, 0, f.tz).normalize();
    const left = new THREE.Vector3(f.nx, 0, f.nz).normalize();
    const sway = Math.sin(k * 0.12) * 0.22;
    const cx = f.x + fwd.x * 9.5 + left.x * (2.6 + sway * 6);
    const cz = f.z + fwd.z * 9.5 + left.z * (2.6 + sway * 6);
    camera.position.set(cx, f.y + 1.7 + Math.sin(k * 0.2) * 0.2, cz);
    // looking back up the track (ramp, loop behind the car); aim to the
    // track's right = screen left, so the car sits right of the menu column
    look.set(f.x - left.x * 3.6 - fwd.x * 8, f.y + 2.4, f.z - left.z * 3.6 - fwd.z * 8);
    camera.lookAt(look);
    if (camera.fov !== 50) {
      camera.fov = 50;
      camera.updateProjectionMatrix();
    }
    sky.follow(camera);
    scenery.update(k);
    track.update(null, Math.min(dt, 0.05), k);
    car.update({ wheelSpin: 0, steer: Math.sin(k * 0.5) * 0.3, compress: 0, lean: 0, pitchA: 0, braking: false, nitro: false, boost: false, air: false, headlights: true }, Math.min(dt, 0.05));
  });
  const focus = () => ({ x: f.x, y: f.y, z: f.z });
  return (
    <>
      <WorldLights world={MENU_WORLD} focus={focus} shadows={quality !== "low"} />
      <primitive object={sky.group} />
      <primitive object={scenery.group} />
      <primitive object={track.group} />
      <primitive object={car.group} />
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
    const floor = new THREE.Mesh(k(new THREE.CircleGeometry(40, 48)), km(new THREE.MeshStandardMaterial({ color: "#16181f", roughness: 0.22, metalness: 0.6 })));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);
    // floor grid lines
    const lineM = km(new THREE.MeshBasicMaterial({ color: "#2a2f3c" }));
    for (let i = -8; i <= 8; i++) {
      const a = new THREE.Mesh(k(new THREE.PlaneGeometry(0.04, 60)), lineM);
      a.rotation.x = -Math.PI / 2;
      a.position.set(i * 3, 0.005, 0);
      g.add(a);
      const b = new THREE.Mesh(k(new THREE.PlaneGeometry(60, 0.04)), lineM);
      b.rotation.x = -Math.PI / 2;
      b.position.set(0, 0.005, i * 3);
      g.add(b);
    }
    // turntable
    const tt = new THREE.Mesh(k(new THREE.CylinderGeometry(4.2, 4.4, 0.25, 64)), km(new THREE.MeshStandardMaterial({ color: "#23262f", roughness: 0.35, metalness: 0.7 })));
    tt.position.y = 0.125;
    tt.receiveShadow = true;
    g.add(tt);
    const ringM = km(new THREE.MeshBasicMaterial({ color: carDef.colors.glow, toneMapped: false }));
    const ring = new THREE.Mesh(k(new THREE.TorusGeometry(4.3, 0.06, 8, 96)), ringM);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.26;
    g.add(ring);
    // back walls with light strips
    const wallM = km(new THREE.MeshStandardMaterial({ color: "#1d212b", roughness: 0.8, metalness: 0.2, side: THREE.DoubleSide }));
    const stripM = km(new THREE.MeshBasicMaterial({ color: "#fff4e0", toneMapped: false }));
    const accentM = km(new THREE.MeshBasicMaterial({ color: "#ff3a2f", toneMapped: false }));
    const wall = new THREE.Mesh(k(new THREE.CylinderGeometry(22, 22, 12, 48, 1, true, Math.PI * 0.55, Math.PI * 0.9)), wallM);
    wall.position.y = 6;
    g.add(wall);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.6 + (i / 8) * Math.PI * 0.8;
      const s = new THREE.Mesh(k(new THREE.BoxGeometry(0.25, 8, 0.1)), i % 2 ? stripM : accentM);
      s.position.set(Math.sin(a) * 21.8, 5, Math.cos(a) * 21.8);
      s.rotation.y = a;
      g.add(s);
    }
    // overhead light panels
    for (let i = -1; i <= 1; i++) {
      const p = new THREE.Mesh(k(new THREE.BoxGeometry(7, 0.12, 1.1)), stripM);
      p.position.set(i * 3.2, 9, 0);
      g.add(p);
    }
    // tyre stacks + cabinets
    const tyreM = km(new THREE.MeshStandardMaterial({ color: "#121214", roughness: 0.9 }));
    const tyreG = k(new THREE.TorusGeometry(0.42, 0.2, 10, 20));
    [
      [-9, -12],
      [-11, -9],
      [10, -11],
    ].forEach(([x, z]) => {
      for (let j = 0; j < 5; j++) {
        const t = new THREE.Mesh(tyreG, tyreM);
        t.rotation.x = -Math.PI / 2;
        t.position.set(x, 0.2 + j * 0.4, z);
        g.add(t);
      }
    });
    const cabM = km(new THREE.MeshStandardMaterial({ color: "#c8202a", roughness: 0.45, metalness: 0.5 }));
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(k(new THREE.BoxGeometry(1.6, 1.1, 0.7)), cabM);
      const a = Math.PI * 0.82 + i * 0.12;
      c.position.set(Math.sin(a) * 19, 0.55, Math.cos(a) * 19);
      c.rotation.y = a;
      g.add(c);
    }
    // sign
    const signM = km(new THREE.MeshBasicMaterial({ map: labelTex("STUNT RACER GARAGE", { bg: "#0d0f15", fg: "#ffffff", accent: "#ff3a2f", w: 1024, h: 160, font: 84 }), toneMapped: false }));
    const sign = new THREE.Mesh(k(new THREE.PlaneGeometry(12, 1.9)), signM);
    sign.position.set(0, 8.4, -20.5);
    g.add(sign);
    return {
      g,
      ringM,
      dispose: () => {
        geos.forEach((x) => x.dispose());
        mats.forEach((x) => x.dispose());
      },
    };
  }, [carDef]);
  useEffect(() => () => room.dispose(), [room]);
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04);
    pm.dispose();
    scene.environment = env.texture;
    scene.background = new THREE.Color("#0b0d12");
    scene.fog = new THREE.Fog("#0b0d12", 18, 46);
    return () => {
      scene.environment = null;
      scene.background = null;
      scene.fog = null;
      env.dispose();
    };
  }, [scene, gl]);
  const car = useMemo(() => buildCar(carDef, quality === "low" ? "medium" : quality), [carDef, quality]);
  const blob = useMemo(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 5.4), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, opacity: 0.9 }));
    m.rotation.x = -Math.PI / 2;
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
  const t = useRef(0);
  useEffect(() => {
    if (TEST) window.__sr = { ...(window.__sr || {}), garage: { scene, car, camera, gl } };
  }, [scene, car, camera, gl]);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    t.current += dt;
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
      <ambientLight intensity={0.25} />
      <spotLight position={[0, 11, 4]} angle={0.6} penumbra={0.6} intensity={180} distance={30} castShadow={quality !== "low"} shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight position={[-7, 4, 6]} intensity={30} color="#ffd9b0" distance={25} />
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
    gl.toneMappingExposure = 1.0;
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
    <div className={`sr-canvas sr-canvas--${garage ? "garage" : "menu"}`} ref={host} {...handlers}>
      <SceneErrorBoundary>
        <Canvas frameloop={frameloop} dpr={dpr} shadows={quality !== "low"} gl={{ antialias: true, ...glTest }} camera={{ fov: 50, near: 0.2, far: 6000, position: [0, 3, 10] }} onCreated={onCreated}>
          <Sizer />
          {garage ? <GarageWorld carDef={carDef} quality={quality} spinRef={spin} /> : <MenuWorld carDef={carDef} quality={quality} />}
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
