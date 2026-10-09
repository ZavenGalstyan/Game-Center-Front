/**
 * Kart Legends — the animated 3D backdrop behind the menus.
 *
 *   menu    Palm Circuit at golden morning light: the selected kart and the
 *           three rivals parked on the grid, engines idling; a slow camera
 *           drift around the start line
 *   garage  a turntable podium in a studio with the chosen kart rotating
 *           (drag to spin it by hand)
 * Purely presentational: no race is simulated.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buildTrack } from "../engine/track.js";
import { getTrack } from "../data/tracks.js";
import { WORLDS } from "../data/worlds.js";
import { RIVALS } from "../data/karts.js";
import TrackMesh from "./TrackMesh.jsx";
import Environment from "./Environment.jsx";
import { KartModel } from "./KartModel.jsx";
import { Lights } from "./RaceScene.jsx";
import { useCanvasWatchdog, SceneErrorBoundary } from "../utils/canvasGuard.jsx";
import { Sizer, frameloop, glTest } from "../utils/testHooks.js";

let menuTrack = null;
function getMenuTrack() {
  if (!menuTrack) menuTrack = buildTrack(getTrack(1));
  return menuTrack;
}
export function disposeMenuTrack() {
  menuTrack = null;
}

// a static "race" for the gantry / gems: lights off, gems shown
const STILL_RACE = { state: "COUNTDOWN", countdown: 9, pickups: [] };

function idleState(t0) {
  return () => {
    const t = performance.now() / 1000 + t0;
    return { vF: 0, vS: 0, yawRate: 0, steerVis: Math.sin(t * 0.7) * 0.25, wheelSpin: 0, hop: 0, bump: 0, boostT: 0, drift: { on: false }, revving: true, p: { maxSpeed: 28 } };
  };
}

function ParkedKart({ slot, colors, shape }) {
  const getState = useMemo(() => idleState(slot.s), [slot]);
  const place = (g) => {
    g.position.set(slot.x, slot.y, slot.z);
    g.rotation.y = slot.h;
  };
  return <KartModel colors={colors} shape={shape} getState={getState} place={place} />;
}

function MenuCamera({ T }) {
  const { camera } = useThree();
  const g = T.grid[0];
  const t0 = useRef(0);
  useFrame((_, dt) => {
    t0.current += Math.min(dt, 0.05);
    const a = g.h + Math.PI * 0.8 + Math.sin(t0.current * 0.12) * 0.45;
    const cx = (T.grid[0].x + T.grid[3].x) / 2;
    const cz = (T.grid[0].z + T.grid[3].z) / 2;
    camera.position.set(cx + Math.sin(a) * 11, 3.2 + Math.sin(t0.current * 0.2) * 0.4, cz + Math.cos(a) * 11);
    // aim slightly left of the grid so the menu panel (left) doesn't cover the karts
    const l = 2.6;
    camera.lookAt(cx + Math.cos(a) * -l, 0.8, cz - Math.sin(a) * -l);
  });
  return null;
}

function MenuWorld({ kart }) {
  const T = getMenuTrack();
  const world = WORLDS[0];
  const settings = { graphics: "medium", shadows: true };
  return (
    <>
      <Sizer />
      <Lights world={world} focus={() => T.grid[0]} shadows={settings.shadows} />
      <Environment T={T} world={world} quality="medium" shadows />
      <TrackMesh T={T} world={world} race={STILL_RACE} />
      <ParkedKart slot={T.grid[3]} colors={kart.colors} shape={kart.shape} />
      {[0, 1, 2].map((i) => (
        <ParkedKart key={i} slot={T.grid[i]} colors={RIVALS[i].colors} shape={RIVALS[i].shape} />
      ))}
      <MenuCamera T={T} />
    </>
  );
}

// --- garage -----------------------------------------------------------------------------
function Turntable({ kart, spin }) {
  const grp = useRef();
  const getState = useMemo(() => idleState(0), []);
  useFrame((_, dt) => {
    const S = spin.current;
    if (!S.dragging) S.vel += (0.45 - S.vel) * Math.min(1, dt * 1.5);
    S.angle += S.vel * Math.min(dt, 0.05);
    if (grp.current) grp.current.rotation.y = S.angle;
  });
  const place = (g) => {
    g.position.set(0, 0.42, 0);
    g.rotation.y = 0;
  };
  return (
    <group ref={grp}>
      <mesh position={[0, 0.2, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[2.6, 2.75, 0.4, 48]} />
        <meshStandardMaterial color="#2a2f3a" metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.41, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.35, 2.5, 64]} />
        <meshStandardMaterial color="#ffcf3a" emissive="#ffb21a" emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
      <KartModel key={kart.id} colors={kart.colors} shape={kart.shape} getState={getState} place={place} />
    </group>
  );
}

function GarageCamera() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(-1.6, 2.2, 5.6);
    camera.lookAt(-1.3, 0.8, 0);
  }, [camera]);
  return null;
}

function GarageWorld({ kart, spin }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = new THREE.Color("#141824");
    scene.fog = new THREE.Fog("#141824", 12, 30);
    return () => {
      scene.background = null;
      scene.fog = null;
    };
  }, [scene]);
  return (
    <>
      <Sizer />
      <GarageCamera />
      <spotLight position={[3, 8, 4]} angle={0.5} penumbra={0.6} intensity={120} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <spotLight position={[-5, 5, -3]} angle={0.6} penumbra={0.8} intensity={60} color="#7fb8ff" />
      <hemisphereLight args={["#a8c4ff", "#2a2018", 0.6]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[30, 48]} />
        <meshStandardMaterial color="#1c212d" roughness={0.6} metalness={0.2} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 6, 2.5, -6]}>
          <boxGeometry args={[0.15, 5, 0.15]} />
          <meshStandardMaterial color="#ff3c5a" emissive="#ff3c5a" emissiveIntensity={2} toneMapped={false} />
        </mesh>
      ))}
      <Turntable kart={kart} spin={spin} />
    </>
  );
}

export default function MenuScene({ mode = "menu", kart }) {
  const host = useRef(null);
  useCanvasWatchdog(host);
  const spin = useRef({ angle: 0.6, vel: 0.45, dragging: false, lastX: 0 });
  const onCreated = ({ gl }) => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  };
  const drag =
    mode === "garage"
      ? {
          onPointerDown: (e) => {
            spin.current.dragging = true;
            spin.current.lastX = e.clientX;
          },
          onPointerMove: (e) => {
            const S = spin.current;
            if (!S.dragging) return;
            const dx = e.clientX - S.lastX;
            S.lastX = e.clientX;
            S.angle += dx * 0.01;
            S.vel = dx * 0.6;
          },
          onPointerUp: () => (spin.current.dragging = false),
          onPointerLeave: () => (spin.current.dragging = false),
        }
      : {};
  return (
    <div className="kl-canvas kl-canvas--menu" ref={host} {...drag}>
      <SceneErrorBoundary>
        <Canvas key={mode} frameloop={frameloop} dpr={[0.85, 1.25]} shadows gl={{ antialias: true, ...glTest }} camera={{ fov: 50, near: 0.2, far: 3000, position: [0, 4, 10] }} onCreated={onCreated}>
          {mode === "garage" ? <GarageWorld kart={kart} spin={spin} /> : <MenuWorld kart={kart} />}
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
