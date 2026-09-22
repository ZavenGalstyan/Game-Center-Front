/**
 * Rooftop Sniper — the gameplay scene: sky, rooftop platform, city
 * background, the visible rifle, targets, in-flight bullets and hit
 * effects. Owns the camera rig (mouse-look, scope zoom/FOV, sway, recoil)
 * the same way Supermarket Rush's three/StoreScene.jsx owns its
 * first-person camera — everything continuous lives in refs and is only
 * written in `useFrame`, so React never re-renders for it. Discrete state
 * (ammo, hits, reload…) lives in the mission engine's own store and is read
 * by the HUD, not by this component.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { BREATH_SWAY_MULT } from "../engine/missionEngine.js";
import CityEnvironment from "./CityEnvironment.jsx";
import Rifle from "./Rifle.jsx";
import Target from "./Target.jsx";
import { RooftopPlatform, SkyDome } from "./Environment.jsx";

const PITCH_LIMIT = Math.PI / 2 - 0.05;
const YAW_LIMIT = Math.PI * 0.62; // can't spin around — the rooftop faces the city
const BASE_FOV = 62;
const SCOPE_FOV_K = 50;
const SCOPE_LERP_RATE = 7; // 1/seconds, higher = snappier transition
const RECOIL_KICK = 0.02;
const BULLET_POOL = 6;
const SPARK_POOL = 4;
const PARTICLES_PER_SPARK = 6;
const MAX_FRAME_DT = 1 / 20;

const _dir = new THREE.Vector3();

function fovForZoom(zoom) {
  return SCOPE_FOV_K / zoom;
}

export default function RooftopScene({
  location,
  mission,
  rifle,
  engine,
  input,
  settings,
  paused,
}) {
  const { camera, scene } = useThree();

  const yaw = useRef(0);
  const pitch = useRef(0);
  const scopedT = useRef(0);
  const recoilPitch = useRef(0);
  const swaySeed = useRef(Math.random() * 1000);
  const gunState = useRef({ recoilKick: 0, reloadT: 0, swayX: 0, swayY: 0 }).current;

  const prevHitIds = useRef(new Set());

  const tracerRefs = useRef([]);
  const bulletPool = useMemo(() => new Array(BULLET_POOL).fill(0).map((_, i) => i), []);
  const sparkParticleIndices = useMemo(
    () => new Array(SPARK_POOL * PARTICLES_PER_SPARK).fill(0).map((_, i) => i),
    [],
  );

  const sparkMeshRefs = useRef([]);
  const sparks = useRef(
    new Array(SPARK_POOL).fill(0).map(() => ({
      life: 0,
      maxLife: 0.32,
      particles: new Array(PARTICLES_PER_SPARK).fill(0).map(() => ({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
      })),
    })),
  ).current;
  const nextSparkSlot = useRef(0);
  const spawnSpark = (center) => {
    const slot = sparks[nextSparkSlot.current % SPARK_POOL];
    nextSparkSlot.current += 1;
    slot.life = slot.maxLife;
    for (let p = 0; p < PARTICLES_PER_SPARK; p++) {
      const particle = slot.particles[p];
      particle.pos.copy(center);
      particle.vel.set(
        (Math.random() - 0.5) * 3.2,
        Math.random() * 2.4,
        (Math.random() - 0.5) * 3.2,
      );
    }
  };

  useEffect(() => {
    camera.fov = BASE_FOV;
    camera.near = 0.05;
    camera.far = 500;
    camera.position.set(0, 0, 1.4);
    camera.updateProjectionMatrix();
    // The rifle (three/Rifle.jsx) attaches itself as a child of the camera
    // so it rides in view-space — but three.js only renders what's reachable
    // from `scene`, so the camera itself has to be part of the scene graph
    // or camera.add(...) children never get drawn.
    scene.add(camera);
    return () => scene.remove(camera);
  }, [camera, scene]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, MAX_FRAME_DT);
    const st = engine.getState();
    const scoped = input.locked && !paused && input.scoped && !st.reloading;
    engine.setScoped(scoped);

    // ---- mouse look ----
    const [dx, dy] = input.consumeMouse();
    if (input.locked && !paused) {
      const sensBase = 0.0021 * (settings?.sensitivity ?? 1);
      const scopedSens = 0.0021 * (settings?.scopeSensitivity ?? 0.6) * (2 / st.zoom);
      const sens = scopedT.current > 0.5 ? scopedSens : sensBase;
      const dyEff = settings?.invertY ? -dy : dy;
      yaw.current = Math.max(-YAW_LIMIT, Math.min(YAW_LIMIT, yaw.current - dx * sens));
      pitch.current = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch.current - dyEff * sens));

      // scope zoom cycling
      engine.cycleZoom(input.consumeWheel());
    } else {
      input.consumeWheel();
    }

    // ---- scope transition + FOV ----
    const targetScopedT = scoped ? 1 : 0;
    scopedT.current += (targetScopedT - scopedT.current) * Math.min(1, dt * SCOPE_LERP_RATE);
    const targetFov = THREE.MathUtils.lerp(BASE_FOV, fovForZoom(st.zoom), scopedT.current);
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }

    // ---- sway (scoped only — normal aim stays steady) ----
    const t = performance.now() * 0.001 + swaySeed.current;
    const holding = st.holdingBreath;
    const swayMult = (holding ? BREATH_SWAY_MULT : 1) * scopedT.current;
    const swayAmp = 0.0075 * (1 - rifle.stability) * swayMult;
    const swayX = (Math.sin(t * 1.3) + Math.sin(t * 0.7) * 0.5) * swayAmp;
    const swayY = (Math.cos(t * 1.1) + Math.sin(t * 0.5) * 0.5) * swayAmp;
    gunState.swayX = swayX;
    gunState.swayY = swayY;

    // ---- recoil decay on the camera itself ----
    recoilPitch.current *= Math.max(0, 1 - dt * 9);

    camera.rotation.order = "YXZ";
    camera.rotation.set(pitch.current + swayY - recoilPitch.current, yaw.current + swayX, 0);

    // ---- reload visual progress (0..1, rifle dips down and back up) ----
    gunState.reloadT = engine.getReloadProgress();

    // ---- shoot ----
    if (!paused && input.locked && input.consumeShoot()) {
      camera.getWorldDirection(_dir);
      const origin = camera.getWorldPosition(new THREE.Vector3());
      const fired = engine.tryFire(origin, _dir.clone());
      if (fired) {
        recoilPitch.current = Math.min(0.09, recoilPitch.current + RECOIL_KICK);
        gunState.recoilKick = Math.min(1, gunState.recoilKick + 1);
      }
    }

    // ---- reload ----
    if (!paused && input.locked && input.consumeReload()) {
      engine.tryReload();
    }

    // ---- advance mission engine (ammo/reload/breath/timer/bullets) ----
    if (!paused) {
      camera.getWorldDirection(_dir);
      engine.step(dt, {
        cameraPos: camera.getWorldPosition(new THREE.Vector3()),
        cameraDir: _dir.clone(),
        holdBreath: input.locked && input.holdBreath,
      });
    }

    // ---- bullet tracers (small fixed pool, hidden when unused) ----
    const bullets = engine.bullets;
    for (let i = 0; i < BULLET_POOL; i++) {
      const mesh = tracerRefs.current[i];
      if (!mesh) continue;
      const b = bullets[i];
      if (b) {
        mesh.visible = true;
        mesh.position.copy(b.position);
        const dir = b.velocity.clone().normalize();
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      } else {
        mesh.visible = false;
      }
    }
    // ---- impact sparks (small pooled burst, no per-hit allocation) ----
    for (let s = 0; s < SPARK_POOL; s++) {
      const spark = sparks[s];
      if (spark.life <= 0) continue;
      spark.life -= dt;
      const k = Math.max(0, spark.life / spark.maxLife);
      for (let p = 0; p < PARTICLES_PER_SPARK; p++) {
        const particle = spark.particles[p];
        const mesh = sparkMeshRefs.current[s * PARTICLES_PER_SPARK + p];
        if (!mesh) continue;
        particle.pos.addScaledVector(particle.vel, dt);
        particle.vel.multiplyScalar(0.9);
        mesh.position.copy(particle.pos);
        mesh.scale.setScalar(Math.max(0.001, k));
        mesh.visible = spark.life > 0;
      }
    }

    // ---- impact detection (compare hit-id sets to trigger a spark burst) ----
    if (st.targetsHitIds.length !== prevHitIds.current.size) {
      for (const id of st.targetsHitIds) {
        if (!prevHitIds.current.has(id)) {
          const target = engine.targets.find((tt) => tt.id === id);
          if (target) spawnSpark(target.center);
        }
      }
      prevHitIds.current = new Set(st.targetsHitIds);
    }
  });

  return (
    <>
      <SkyDome location={location} />
      <fog attach="fog" args={[location.fog, location.fogNear, location.fogFar]} />
      <ambientLight color={location.ambient.color} intensity={location.ambient.intensity} />
      <directionalLight
        color={location.sun.color}
        intensity={location.sun.intensity}
        position={location.sun.position}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />

      <RooftopPlatform />
      <CityEnvironment location={location} />

      {engine.targets.map((t) => (
        <Target key={t.id} target={t} />
      ))}

      <Rifle gunState={gunState} />

      <group>
        {bulletPool.map((i) => (
          <mesh key={i} ref={(m) => (tracerRefs.current[i] = m)} visible={false}>
            <cylinderGeometry args={[0.012, 0.012, 0.22, 6]} />
            <meshBasicMaterial color="#fff2c0" toneMapped={false} />
          </mesh>
        ))}
      </group>

      <group>
        {sparkParticleIndices.map((i) => (
          <mesh key={i} ref={(m) => (sparkMeshRefs.current[i] = m)} visible={false}>
            <boxGeometry args={[0.05, 0.05, 0.05]} />
            <meshBasicMaterial color="#ffe9a8" toneMapped={false} />
          </mesh>
        ))}
      </group>
    </>
  );
}

