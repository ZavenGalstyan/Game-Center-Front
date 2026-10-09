/**
 * Pirate Cove — showcase scenes for the menus, built from the same parts as
 * the game (terrain, ocean shader, ship models, vegetation, props):
 *
 *   <MenuScene>     your ship moored at a palm-covered island with a dock,
 *                   a distant sail crossing the horizon, gulls, warm sunlight;
 *                   slow cinematic orbit
 *   <ShipPreview>   the selected ship alone on the water, slow turntable
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { buildWorld } from "../engine/world.js";
import { waveHeight } from "../engine/waves.js";
import { createOceanGeometry, createOceanMaterial, bakeDepthTexture, applyWaterColors } from "./ocean.js";
import { SkyDome, Lighting } from "./Sky.jsx";
import ShipModel from "./ShipModel.jsx";
import { buildIslandGeometry } from "./islandGeo.js";
import Vegetation from "./Vegetation.jsx";
import { PropMesh } from "./Props.jsx";
import { Gulls } from "./SeaObjects.jsx";
import { ATMOS } from "../data/atmos.js";
import { SHIP_CLASSES } from "../data/ships.js";
import { detailNoise } from "./textures.js";
import { frameloop, glTest, Sizer } from "../utils/testHooks.js";

const SHOW_REGION = {
  id: 0,
  radius: 600,
  wave: 0.8,
  islands: [
    {
      id: "show",
      name: "Pirate Cove",
      x: 0,
      z: 0,
      radius: 46,
      peak: 9,
      beach: 11,
      seed: 17,
      biome: "tropic",
      dock: { a: -90 },
      hills: [[8, 14, 16, 7]],
      cliffs: [{ a: 60, w: 70, h: 12 }],
      props: [
        { t: "hut", p: [-60, 0.5], rot: "dock" },
        { t: "hut", p: [-125, 0.52], rot: "dock" },
        { t: "lighthouse", p: [30, 0.55] },
        { t: "barrels", p: [-80, 0.78] },
        { t: "crates", p: [-100, 0.78] },
        { t: "lantern", p: [-84, 0.88] },
        { t: "lantern", p: [-96, 0.88] },
        { t: "campfire", p: [-150, 0.42] },
        { t: "flag", p: [-30, 0.4] },
        { t: "skullRock", p: [170, 0.62], rot: "out" },
      ],
    },
  ],
  rocks: [
    { x: 60, z: -90, r: 6, h: 6 },
    { x: -80, z: -120, r: 5, h: 4 },
    { x: 120, z: 40, r: 8, h: 9 },
  ],
  wrecks: [],
};

function ShowOcean({ terrain, atmos, timeRef, amp = 0.8 }) {
  const ref = useRef();
  const { geo, mat, depth } = useMemo(() => {
    const depth = bakeDepthTexture(terrain || { height: () => -14 }, 500, terrain ? 384 : 4);
    const geo = createOceanGeometry(150, 1500);
    const mat = createOceanMaterial(depth);
    applyWaterColors(mat, atmos);
    return { geo, mat, depth };
  }, [terrain, atmos]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
      depth.dispose();
    },
    [geo, mat, depth],
  );
  useFrame(({ camera, clock }) => {
    const s = geo.userData.snap;
    if (ref.current) ref.current.position.set(Math.round(camera.position.x / s) * s, 0, Math.round(camera.position.z / s) * s);
    mat.uniforms.uTime.value = clock.elapsedTime;
    mat.uniforms.uAmp.value = amp;
    if (timeRef) timeRef.current = clock.elapsedTime;
  });
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}

/** A ship that bobs on the analytic swell (no engine needed). */
function FloatingShip({ clsId, look, x, z, heading, amp = 0.8, speed = 0, throttle = 0.4 }) {
  const ref = useRef();
  const pos = useRef({ x, z });
  const L = SHIP_CLASSES[clsId].length;
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const g = ref.current;
    if (!g) return;
    pos.current.x += Math.sin(heading) * speed * dt;
    pos.current.z += Math.cos(heading) * speed * dt;
    if (speed && Math.abs(pos.current.x) > 700) pos.current.x = -Math.sign(pos.current.x) * 700;
    const px = pos.current.x;
    const pz = pos.current.z;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const hb = waveHeight(px + fx * L * 0.4, pz + fz * L * 0.4, t, amp);
    const hs = waveHeight(px - fx * L * 0.4, pz - fz * L * 0.4, t, amp);
    const hc = waveHeight(px, pz, t, amp);
    g.position.set(px, hc, pz);
    g.rotation.set(0, heading, 0);
    g.children[0].rotation.x = -Math.atan2(hb - hs, L * 0.8) * 0.8;
    g.children[0].rotation.z = Math.sin(t * 0.6 + px) * 0.03;
  });
  return (
    <group ref={ref}>
      <group>
        <ShipModel clsId={clsId} look={look} preview={{ throttle }} />
      </group>
    </group>
  );
}

function Orbit({ center, radius, height, speed = 0.04, look = [0, 4, 0], start = 0 }) {
  useFrame(({ camera, clock }) => {
    const a = start + clock.elapsedTime * speed;
    camera.position.set(center[0] + Math.sin(a) * radius, height + Math.sin(clock.elapsedTime * 0.2) * 1.2, center[2] + Math.cos(a) * radius);
    camera.lookAt(look[0], look[1], look[2]);
  });
  return null;
}

function MenuWorld({ shipId, look }) {
  const world = useMemo(() => buildWorld(SHOW_REGION, { beam: SHIP_CLASSES[shipId].beam }), [shipId]);
  const isl = world.islands[0];
  const geo = useMemo(() => buildIslandGeometry(isl), [isl]);
  const terrainMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, map: detailNoise(), roughness: 0.96 }), []);
  useEffect(
    () => () => {
      geo.dispose();
      terrainMat.dispose();
    },
    [geo, terrainMat],
  );
  const atmos = ATMOS.afternoon;
  const focus = useRef({ x: isl.dock.berth.x, y: 0, z: isl.dock.berth.z });
  const b = isl.dock.berth;
  const d = isl.dock;
  const len = Math.hypot(d.end.x - d.land.x, d.end.z - d.land.z);
  return (
    <>
      <Orbit center={[b.x, 0, b.z]} radius={46} height={13} look={[b.x * 0.7, 5, b.z * 0.7]} speed={0.035} start={2.3} />
      <Lighting atmos={atmos} focus={focus} shadows="medium" />
      <SkyDome atmos={atmos} />
      <ShowOcean terrain={world.terrain} atmos={atmos} />
      <mesh geometry={geo} material={terrainMat} receiveShadow />
      {isl.props.map((p) => (
        <PropMesh key={p.key} p={p} />
      ))}
      <Vegetation isl={isl} shadows="medium" />
      <group position={[(d.land.x + d.end.x) / 2, 0, (d.land.z + d.end.z) / 2]} rotation={[0, Math.atan2(d.dir.x, d.dir.z), 0]}>
        <mesh position={[0, d.deckY - 0.12, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.2, 0.24, len]} />
          <meshStandardMaterial color="#a07a52" roughness={0.9} />
        </mesh>
        {Array.from({ length: Math.floor(len / 4) }).map((_, i) => (
          <group key={i}>
            {[-1.5, 1.5].map((x) => (
              <mesh key={x} position={[x, d.deckY - 2, -len / 2 + 2 + i * 4]}>
                <cylinderGeometry args={[0.16, 0.18, 4.6, 7]} />
                <meshStandardMaterial color="#5a4028" />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      <FloatingShip clsId={shipId} look={look} x={b.x} z={b.z} heading={b.heading} throttle={0.35} />
      <FloatingShip clsId="brig" look={{ sail: "#2b2420", hullColor: "#3a2a22", accent: "#8e2b22", flag: "skull" }} x={-400} z={-260} heading={Math.PI / 2} speed={6} throttle={0.9} />
      {world.terrain.rocks.map((r, i) => (
        <mesh key={i} position={[r.x, 0, r.z]} castShadow>
          <dodecahedronGeometry args={[r.r, 1]} />
          <meshStandardMaterial color="#8c867b" flatShading roughness={0.95} />
        </mesh>
      ))}
      <Gulls focus={focus} count={7} />
    </>
  );
}

export function MenuScene({ shipId = "sloop", look }) {
  return (
    <Canvas
      frameloop={frameloop}
      dpr={[0.85, 1.4]}
      shadows
      gl={{ antialias: true, ...glTest }}
      camera={{ fov: 48, near: 0.3, far: 2600, position: [0, 14, 60] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <Sizer />
      <MenuWorld shipId={shipId} look={look} />
    </Canvas>
  );
}

function PreviewWorld({ shipId, look }) {
  const atmos = ATMOS.day;
  const focus = useRef({ x: 0, y: 0, z: 0 });
  const L = SHIP_CLASSES[shipId].length;
  return (
    <>
      <Orbit center={[0, 0, 0]} radius={L * 1.55 + 8} height={L * 0.45 + 4} look={[0, L * 0.32, 0]} speed={0.12} start={0.9} />
      <Lighting atmos={atmos} focus={focus} shadows="medium" />
      <SkyDome atmos={atmos} />
      <ShowOcean terrain={null} atmos={atmos} amp={0.6} />
      <FloatingShip clsId={shipId} look={look} x={0} z={0} heading={0} amp={0.6} throttle={0.85} />
    </>
  );
}

export function ShipPreview({ shipId, look }) {
  return (
    <Canvas
      frameloop={frameloop}
      dpr={[0.85, 1.4]}
      shadows
      gl={{ antialias: true, ...glTest }}
      camera={{ fov: 42, near: 0.3, far: 2600, position: [20, 8, 20] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <Sizer />
      <PreviewWorld key={shipId} shipId={shipId} look={look} />
    </Canvas>
  );
}
