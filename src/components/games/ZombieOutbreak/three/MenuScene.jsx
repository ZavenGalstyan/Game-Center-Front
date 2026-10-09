/**
 * Zombie Outbreak — the main menu backdrop: the Abandoned City street at
 * dusk, a lone survivor seen from behind, rifle lowered, while zombies
 * shamble out of the fog toward them. Reuses the real arena builder and the
 * real zombie rig/pose code, so the menu shows exactly what the game looks like.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CITY } from "../data/arenas/city.js";
import { buildArena, animateDynamics } from "./environment.js";
import { applyMood } from "./moods.js";
import { createRig, configureRig, applyPose, disposeRig } from "./zombieRig.js";
import { buildWeaponModel } from "./weaponModels.js";
import { spawnZombie, createZombiePool } from "../engine/zombies.js";
import { computePose } from "../engine/pose.js";
import { createRng } from "../engine/math.js";
import { useCanvasWatchdog, SceneErrorBoundary } from "../utils/canvasGuard.jsx";
import { frameloop, glTest, Sizer } from "../utils/testHooks.js";

function buildSurvivor() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: "#3d3f33", roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: "#23262b", roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: "#8a6a55", roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.8 });
  const pack = new THREE.MeshStandardMaterial({ color: "#4a3d2c", roughness: 0.95 });
  const cap = new THREE.CapsuleGeometry(0.5, 1, 4, 10);
  const sph = new THREE.SphereGeometry(1, 16, 12);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const m = (geo, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    o.rotation.set(rx, ry, rz);
    g.add(o);
    return o;
  };
  // Legs (slightly apart), torso, head with hood, backpack.
  m(cap, pants, -0.12, 0.47, 0, 0.18, 0.62, 0.18, 0, 0, 0.05);
  m(cap, pants, 0.12, 0.47, 0.04, 0.18, 0.62, 0.18, -0.08, 0, -0.05);
  m(box, dark, -0.13, 0.05, -0.03, 0.14, 0.09, 0.28);
  m(box, dark, 0.13, 0.05, 0.01, 0.14, 0.09, 0.28);
  m(sph, jacket, 0, 1.2, 0, 0.27, 0.36, 0.19);
  m(sph, jacket, 0, 0.98, 0, 0.24, 0.2, 0.17);
  m(sph, skin, 0, 1.67, 0.02, 0.11, 0.13, 0.12);
  m(sph, jacket, 0, 1.7, 0.04, 0.13, 0.13, 0.13);
  m(box, pack, 0, 1.2, 0.22, 0.36, 0.46, 0.18);
  m(box, pack, 0, 0.98, 0.3, 0.3, 0.14, 0.12);
  m(cap, pack, 0, 1.47, 0.22, 0.14, 0.32, 0.14, 0, 0, Math.PI / 2);
  // Arms holding a lowered rifle in front.
  m(cap, jacket, -0.3, 1.18, -0.1, 0.13, 0.34, 0.13, 0.6, 0, 0.2);
  m(cap, jacket, 0.3, 1.18, -0.1, 0.13, 0.34, 0.13, 0.7, 0, -0.25);
  const rifle = buildWeaponModel("rifle");
  rifle.group.traverse((o) => {
    if (o.userData.hand) o.visible = false;
  });
  rifle.group.scale.setScalar(1.25);
  rifle.group.position.set(0.05, 1.0, -0.32);
  rifle.group.rotation.set(-0.55, -0.45, 0.15);
  g.add(rifle.group);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

function Backdrop() {
  const { scene, camera, gl } = useThree();
  const theme = useMemo(() => applyMood(CITY.theme, "dusk", false), []);
  const env = useMemo(() => buildArena(CITY, theme, { shadows: true }), [theme]);
  const survivor = useMemo(() => buildSurvivor(), []);
  // Zombies on a loop toward the survivor.
  const crowd = useMemo(() => {
    const fakeGame = { rng: createRng(7), player: { x: 1, z: 20 }, nextId: 1, emit() {} };
    const pool = createZombiePool(7);
    const types = ["walker", "walker", "runner", "walker", "brute", "walker", "spitter"];
    pool.forEach((z, i) => {
      spawnZombie(z, types[i], -5 + i * 1.7, 4 - (i % 3) * 5 - i * 1.2, fakeGame);
      z.anim.spawn = 1;
      z.state = "CHASING";
      z.speed0 = types[i] === "runner" ? 0.9 : types[i] === "brute" ? 0.5 : 0.55;
    });
    const rigs = pool.map(() => createRig());
    return { pool, rigs };
  }, []);
  const group = useMemo(() => {
    const g = new THREE.Group();
    g.add(env.root, survivor);
    for (const r of crowd.rigs) g.add(r.root);
    return g;
  }, [env, survivor, crowd]);

  useEffect(() => {
    scene.background = new THREE.Color(theme.fog);
    scene.fog = new THREE.Fog(theme.fog, 10, 58);
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      scene.fog = null;
      scene.background = null;
      crowd.rigs.forEach(disposeRig);
      env.root.traverse((o) => {
        if (o.isMesh && o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
      });
    };
  }, [scene, gl, theme, crowd, env]);

  survivor.position.set(1.25, 0, 22.4);
  survivor.rotation.y = 0.12;

  const dirRef = useRef();
  useEffect(() => {
    const l = dirRef.current;
    if (!l) return undefined;
    scene.add(l.target);
    l.target.position.set(0, 0, 0);
    l.target.updateMatrixWorld();
    gl.shadowMap.needsUpdate = true;
    return () => scene.remove(l.target);
  }, [scene, gl]);

  const lightRef = useRef();
  useFrame((state, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const t = state.clock.elapsedTime;
    // Slow cinematic drift.
    camera.position.set(-1.0 + Math.sin(t * 0.12) * 0.35, 1.6 + Math.sin(t * 0.21) * 0.06, 27.6 + Math.sin(t * 0.09) * 0.4);
    camera.lookAt(1.2 + Math.sin(t * 0.1) * 0.5, 1.75, 8);
    crowd.pool.forEach((z, i) => {
      z.anim.time += dt;
      const sp = z.speed0;
      z.z += sp * dt;
      z.x += Math.sin(t * 0.3 + i) * 0.05 * dt;
      z.yaw = Math.sin(t * 0.4 + i) * 0.15;
      z.anim.phase += ((sp * dt) / (1.35 * z.scale)) * Math.PI * 2 * (z.type === "runner" ? 1.4 : 1);
      z.anim.move = 1;
      z.anim.run = z.type === "runner" ? 0.4 : 0;
      if (z.z > 15) {
        z.z = -6 - Math.random() * 6;
        z.x = -6 + Math.random() * 10;
      }
      computePose(z);
      const r = crowd.rigs[i];
      if (r.gen !== z.gen) configureRig(r, z);
      r.root.visible = true;
      applyPose(r, z, t);
    });
    animateDynamics(env.dynamics, t, dt, lightRef.current ? [lightRef.current] : null);
  });

  return (
    <>
      <hemisphereLight args={[theme.hemiSky, theme.hemiGround, theme.hemi]} />
      <directionalLight
        ref={dirRef}
        position={[-30, 50, 25]}
        intensity={theme.moonInt * 1.2}
        color={theme.moon}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0006}
      />
      <pointLight position={[2.8, 1.2, 24.5]} color="#ff8a3a" intensity={30} distance={12} decay={1.6} />
      <pointLight ref={lightRef} position={[6.6, 5.3, 12]} color="#ffc884" intensity={34} distance={22} decay={1.6} />
      <pointLight position={[-6.6, 5.3, 0]} color="#ffc884" intensity={30} distance={22} decay={1.6} />
      <pointLight position={[-2.2, 1.5, -8]} color="#ff3030" intensity={14} distance={10} decay={1.6} />
      <pointLight position={[1.6, 2.6, 19.5]} color="#8fb0ff" intensity={18} distance={7} decay={1.6} />
      <primitive object={group} />
    </>
  );
}

export default function MenuScene() {
  const host = useRef(null);
  useCanvasWatchdog(host);
  return (
    <div className="zo-menu__canvas" ref={host}>
      <SceneErrorBoundary>
        <Canvas
          frameloop={frameloop}
          dpr={[0.8, 1.25]}
          shadows
          gl={{ antialias: true, powerPreference: "high-performance", ...glTest }}
          camera={{ fov: 52, near: 0.1, far: 320, position: [-1, 1.6, 27.6] }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
          }}
        >
          <Sizer />
          <Backdrop />
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
