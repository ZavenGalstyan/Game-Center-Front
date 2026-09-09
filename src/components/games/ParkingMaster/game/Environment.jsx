/**
 * Parking Master — the environment shell around a level.
 *
 * Sky gradient, fog, the lighting rig and the decoration set for the five
 * worlds. The floor is one plane carrying the procedural ground texture; every
 * collidable thing (walls, columns, barriers, parked cars, cones) is rendered
 * by <ParkingScene> from the same data the collision world uses, so this file
 * is purely atmosphere and set-dressing placed OUTSIDE the playable arena.
 */

import { useMemo } from "react";
import * as THREE from "three";
import {
  Tree, Bush, StreetLamp, Building, ParkingSign, RoofVent, CurbRing,
} from "./props.jsx";
import Rain from "./Rain.jsx";
import { makeGroundTexture } from "./groundTexture.js";

function makeSkyTexture(env) {
  const cv = document.createElement("canvas");
  cv.width = 8;
  cv.height = 256;
  const ctx = cv.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, env.sky.top);
  grad.addColorStop(1, env.sky.bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* deterministic tiny RNG so decor is stable per level */
function rng(seed) {
  let n = seed * 2246822519 + 3266489917;
  return () => {
    n = (n * 1664525 + 1013904223) % 4294967296;
    return n / 4294967296;
  };
}

export default function Environment({ level, env, quality = "high" }) {
  const { w, l } = level.arena;

  const groundTex = useMemo(() => makeGroundTexture(level, env), [level.id]);
  const skyTex = useMemo(() => makeSkyTexture(env), [env.id]);

  const decor = useMemo(
    () => buildDecor(level, env, quality),
    [level.id, env.id, quality],
  );

  const shadows = quality !== "low";
  const sun = env.sun;

  return (
    <group>
      {/* sky dome (fog + background colour are set at scene root by ParkingWorld) */}
      <mesh scale={[-1, 1, 1]}>
        <sphereGeometry args={[220, 24, 16]} />
        <meshBasicMaterial map={skyTex} side={THREE.BackSide} fog={false} depthWrite={false} />
      </mesh>

      {/* lighting */}
      <ambientLight intensity={env.ambient.intensity} color={env.ambient.color} />
      <hemisphereLight
        color={env.hemi.sky}
        groundColor={env.hemi.ground}
        intensity={env.hemi.intensity}
      />
      <directionalLight
        position={sun.position}
        intensity={sun.intensity}
        color={sun.color}
        castShadow={shadows}
        shadow-mapSize-width={quality === "high" ? 2048 : 1024}
        shadow-mapSize-height={quality === "high" ? 2048 : 1024}
        shadow-camera-left={-w / 1.5}
        shadow-camera-right={w / 1.5}
        shadow-camera-top={l / 1.5}
        shadow-camera-bottom={-l / 1.5}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-bias={-0.0004}
      />

      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, l]} />
        <meshStandardMaterial
          map={groundTex}
          roughness={env.ground.roughness}
          metalness={env.ground.wet ? 0.25 : 0.02}
        />
      </mesh>

      {/* ground skirt so there is never a visible edge */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[w + 220, l + 220]} />
        <meshStandardMaterial color={env.ground.color} roughness={0.98} />
      </mesh>

      {env.decor === "lot" && <CurbRing w={w} l={l} />}

      {/* garage shell */}
      {env.indoor && <GarageShell w={w} l={l} quality={quality} />}

      {/* decoration */}
      {decor}

      {/* rain */}
      {env.rain && <Rain quality={quality} area={Math.max(w, l) + 12} />}
    </group>
  );
}

/* --------------------------------------------------------------- garage box */

function GarageShell({ w, l, quality }) {
  const strips = [];
  for (let z = -l / 2 + 4; z < l / 2; z += 6) {
    strips.push(z);
  }
  return (
    <group>
      <mesh position={[0, 3.4, 0]} receiveShadow>
        <boxGeometry args={[w + 2, 0.4, l + 2]} />
        <meshStandardMaterial color="#42474d" roughness={0.95} side={THREE.BackSide} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (w + 1)) / 2, 1.7, 0]}>
          <boxGeometry args={[0.4, 3.4, l + 2]} />
          <meshStandardMaterial color="#5a5f65" roughness={0.95} />
        </mesh>
      ))}
      {strips.map((z, i) => (
        <group key={i} position={[0, 3.15, z]}>
          <mesh>
            <boxGeometry args={[w * 0.5, 0.08, 0.5]} />
            <meshStandardMaterial color="#f2f4ea" emissive="#eef3ff" emissiveIntensity={1.2} />
          </mesh>
          {quality !== "low" && i % 2 === 0 && (
            <pointLight position={[0, -0.4, 0]} distance={13} intensity={7} color="#dfe8f5" />
          )}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ decor */

function buildDecor(level, env, quality) {
  const { w, l } = level.arena;
  const out = [];
  const r = rng(level.id * 131 + 7);
  const dense = quality === "high";
  const edgeX = w / 2 + 2;
  const edgeZ = l / 2 + 2;

  const push = (node) => out.push(<group key={out.length}>{node}</group>);

  if (env.decor === "lot") {
    // trees + bushes along the two long edges, small shop behind the row
    for (let z = -edgeZ + 3; z < edgeZ; z += dense ? 4.5 : 8) {
      push(<Tree position={[-edgeX - 1.5, z + r() * 1.5]} scale={0.9 + r() * 0.4} />);
      push(<Tree position={[edgeX + 1.5, z + r() * 1.5]} scale={0.9 + r() * 0.4} />);
      if (dense) push(<Bush position={[-edgeX + 0.4, z + 2]} scale={0.8 + r() * 0.4} />);
    }
    push(<Building position={[0, edgeZ + 7]} size={[w * 0.7, 6.5, 8]} color="#c8ccc2" seed={level.id} />);
    push(<Building position={[-w * 0.32, -edgeZ - 6]} size={[10, 5, 7]} color="#d5cdbd" seed={level.id + 3} />);
    push(<ParkingSign position={[level.zone.pos[0] - 3, level.zone.pos[1] + 3.4]} heading={Math.PI} />);
    push(<StreetLamp position={[edgeX - 0.5, -edgeZ + 4]} />);
    push(<StreetLamp position={[-edgeX + 0.5, edgeZ - 4]} />);
  }

  if (env.decor === "city") {
    for (let z = -edgeZ - 6; z < edgeZ + 6; z += 12) {
      push(<Building position={[-edgeX - 6, z]} size={[10, 12 + r() * 12, 10]} color={`hsl(${210 + r() * 30},10%,${55 + r() * 12}%)`} seed={level.id + z} lit={false} />);
      push(<Building position={[edgeX + 6, z + 4]} size={[10, 12 + r() * 14, 10]} color={`hsl(${200 + r() * 30},9%,${52 + r() * 14}%)`} seed={level.id + z + 1} lit={false} />);
    }
    for (let z = -edgeZ + 4; z < edgeZ; z += 10) {
      push(<StreetLamp position={[level.zone.pos[0] > 0 ? edgeX - 1 : -edgeX + 1, z]} />);
      if (dense) push(<Tree position={[level.zone.pos[0] > 0 ? edgeX - 1.8 : -edgeX + 1.8, z + 5]} scale={0.8} />);
    }
    // sidewalk slab on the kerb side
    push(
      <mesh position={[level.zone.pos[0] > 0 ? w / 2 - 1 : -w / 2 + 1, 0.06, 0]} receiveShadow>
        <boxGeometry args={[2, 0.12, l]} />
        <meshStandardMaterial color="#9aa0a6" roughness={0.95} />
      </mesh>,
    );
  }

  if (env.decor === "garage") {
    // painted lane arrows + numbered bay signs are in the texture; add pipes
    for (let z = -edgeZ + 4; z < edgeZ; z += 7) {
      push(
        <mesh position={[-w / 2 + 0.5, 3.0, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.09, 0.09, 6, 8]} />
          <meshStandardMaterial color="#8a5a3a" roughness={0.7} metalness={0.3} />
        </mesh>,
      );
    }
    push(
      <mesh position={[w / 2 - 0.3, 1.4, 0]}>
        <boxGeometry args={[0.1, 2.8, l]} />
        <meshStandardMaterial color="#d8b437" roughness={0.7} />
      </mesh>,
    );
  }

  if (env.decor === "rooftop") {
    // parapet + skyline + vents + puddle sheens
    push(
      <group>
        {[[0, edgeZ, w + 4, 0], [0, -edgeZ, w + 4, 0], [edgeX, 0, l + 4, Math.PI / 2], [-edgeX, 0, l + 4, Math.PI / 2]].map(
          ([x, z, len, rot], i) => (
            <mesh key={i} position={[x, 0.55, z]} rotation={[0, rot, 0]} castShadow>
              <boxGeometry args={[len, 1.1, 0.5]} />
              <meshStandardMaterial color="#4c525a" roughness={0.9} />
            </mesh>
          ),
        )}
      </group>,
    );
    for (let i = 0; i < (dense ? 14 : 8); i++) {
      const ang = (i / 14) * Math.PI * 2;
      const rad = 60 + r() * 40;
      push(
        <Building
          position={[Math.cos(ang) * rad, Math.sin(ang) * rad]}
          size={[12 + r() * 8, 20 + r() * 40, 12 + r() * 8]}
          color={`hsl(${210 + r() * 20},12%,${34 + r() * 10}%)`}
          seed={i * 7 + level.id}
          lit
        />,
      );
    }
    push(<RoofVent position={[-w / 2 + 2, -l / 2 + 2]} />);
    push(<RoofVent position={[w / 2 - 2.5, l / 2 - 3]} size={[2.2, 1.6, 1.8]} />);
    push(<StreetLamp position={[-edgeX + 1, -edgeZ + 3]} on />);
  }

  if (env.decor === "night") {
    for (let i = 0; i < (dense ? 18 : 10); i++) {
      const ang = (i / 18) * Math.PI * 2 + 0.3;
      const rad = 55 + r() * 45;
      push(
        <Building
          position={[Math.cos(ang) * rad, Math.sin(ang) * rad]}
          size={[12 + r() * 10, 24 + r() * 55, 12 + r() * 10]}
          color={`hsl(${220 + r() * 20},16%,${16 + r() * 8}%)`}
          seed={i * 13 + level.id}
          lit
        />,
      );
    }
    for (let z = -edgeZ + 4; z < edgeZ; z += 9) {
      push(<StreetLamp position={[edgeX - 1, z]} on />);
      push(<StreetLamp position={[-edgeX + 1, z + 4]} on />);
    }
    push(<ParkingSign position={[level.zone.pos[0] - 3, level.zone.pos[1] + 3.4]} heading={Math.PI} />);
  }

  return out;
}
