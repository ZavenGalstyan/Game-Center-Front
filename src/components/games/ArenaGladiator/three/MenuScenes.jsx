/**
 * Arena Gladiator — 3D scenes behind the menus.
 *
 *  <TunnelScene>   main menu: the player's gladiator waiting in the stone
 *                  corridor, the arena blazing at the end of the tunnel.
 *  <PreviewScene>  equipment / fighter: turntable on a sand disc, rebuilt
 *                  whenever the equipment changes (drag to rotate).
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildGladiator, poseGladiator, disposeGladiator } from "./gladiator.js";
import { stoneTexture, woodTexture, bannerTexture, glowTexture, sandTexture } from "./textures.js";
import { buildWeaponMesh, buildShieldMesh, matOf } from "./weapons3d.js";
import { weaponById } from "../data/weapons.js";
import { frameloop, glTest, Sizer } from "../utils/testHooks.js";

/** A stand-in engine fighter for posing a model outside a fight. */
export function idleFighter(weaponId, extra = {}) {
  return {
    x: 0, z: 0, yaw: 0, vx: 0, vz: 0, act: null, weapon: weaponById(weaponId), guardBlend: 0, sprintBlend: 0,
    blocking: false, defeated: false, sprinting: false, ...extra,
  };
}

function Env({ intensity = 0.5 }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      env.dispose();
      pm.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
}

function useGladiator(look, equip) {
  const rig = useMemo(() => buildGladiator(look, equip, { shadows: true }), [look, equip]);
  useEffect(() => () => disposeGladiator(rig), [rig]);
  return rig;
}

/* ================================================================== tunnel */
function Tunnel({ look, equip, reduced }) {
  const rig = useGladiator(look, equip);
  const fighter = useMemo(() => idleFighter(equip.weapon.id, { yaw: 0 }), [equip]);
  const stone = useMemo(() => {
    const t = stoneTexture("#8d7d68", 512, 256, 5).clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 1.4);
    t.needsUpdate = true;
    return t;
  }, []);
  const floorTex = useMemo(() => {
    const t = stoneTexture("#6d604f", 512, 256, 8).clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 6);
    t.needsUpdate = true;
    return t;
  }, []);
  useEffect(() => () => {
    stone.dispose();
    floorTex.dispose();
  }, [stone, floorTex]);
  const glow = useMemo(() => glowTexture("rgba(255,236,190,1)", "rgba(255,200,120,0)"), []);
  const flame = useMemo(() => glowTexture("rgba(255,210,120,1)", "rgba(255,90,20,0)"), []);
  const wood = useMemo(() => woodTexture("#5a3d24", 5, 3), []);
  const banner = useMemo(() => bannerTexture("#8c2f23", "#d2a64a", 0), []);
  const rack = useMemo(() => {
    const g = new THREE.Group();
    ["gladius", "spear", "axe", "longsword"].forEach((m, i) => {
      const w = buildWeaponMesh(m);
      w.position.set(0, 0.35, -0.9 + i * 0.5);
      w.rotation.set(0.1, 0, 0);
      g.add(w);
    });
    const sh = buildShieldMesh("round", "#3d5a2a", "#d8c27a", 1);
    sh.position.set(0.05, 1.2, 1.2);
    sh.rotation.y = -Math.PI / 2;
    g.add(sh);
    return g;
  }, []);
  const dust = useRef();
  const dustData = useMemo(() => {
    const n = 260;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * 3.4;
      p[i * 3 + 1] = Math.random() * 3.6;
      p[i * 3 + 2] = 2 + Math.random() * 12;
    }
    return p;
  }, []);
  const flames = useRef([]);
  const lights = useRef([]);
  const { camera } = useThree();
  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    // subtle idle: weight shift, occasional guard check
    fighter.guardBlend = Math.max(0, Math.sin(t * 0.35) * 1.4 - 0.9);
    fighter.x = -0.7 + Math.sin(t * 0.5) * 0.01;
    fighter.yaw = 0.1;
    poseGladiator(rig, fighter, Math.min(dt, 0.05), { target: { x: 0, z: 10 } });
    if (!reduced) {
      camera.position.set(0.45 + Math.sin(t * 0.12) * 0.12, 1.5 + Math.sin(t * 0.17) * 0.04, -2.9 + Math.sin(t * 0.09) * 0.1);
    } else camera.position.set(0.45, 1.5, -2.9);
    camera.lookAt(0.15, 1.25, 3.2);
    if (dust.current) {
      const a = dust.current.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        a.array[i * 3 + 1] += Math.sin(t + i) * 0.0015;
        a.array[i * 3] += 0.0012;
        if (a.array[i * 3] > 1.7) a.array[i * 3] = -1.7;
      }
      a.needsUpdate = true;
    }
    flames.current.forEach((f, i) => {
      if (f) {
        const k = 0.85 + Math.sin(t * 12 + i * 2) * 0.1;
        f.scale.set(0.45 * k, 0.55 * (1.2 - k * 0.2), 1);
      }
    });
    lights.current.forEach((l, i) => {
      if (l) l.intensity = 3 * (0.85 + Math.sin(t * 10 + i * 2) * 0.12);
    });
  });
  const W = 3.4;
  const H = 3.6;
  const L = 16;
  return (
    <group>
      <color attach="background" args={["#0c0907"]} />
      <fog attach="fog" args={["#1a120c", 6, 22]} />
      <ambientLight intensity={0.18} color="#8a7058" />
      {/* arena light pouring in from the far end */}
      <directionalLight position={[1.5, 6, 14]} intensity={3.2} color="#ffe2b0" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={5} shadow-camera-bottom={-2} />
      <pointLight position={[0, 2.2, 10]} intensity={14} distance={18} color="#ffd9a0" decay={1.4} />
      {/* corridor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, L / 2 - 3]} receiveShadow>
        <planeGeometry args={[W, L]} />
        <meshStandardMaterial map={floorTex} roughness={0.95} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * W) / 2, H / 2, L / 2 - 3]} rotation={[0, -s * Math.PI / 2, 0]} receiveShadow>
          <planeGeometry args={[L, H]} />
          <meshStandardMaterial map={stone} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, H, L / 2 - 3]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W, L]} />
        <meshStandardMaterial map={stone} roughness={0.95} color="#8a7a66" />
      </mesh>
      {/* ribs / arches along the corridor */}
      {[0, 3, 6, 9].map((z) => (
        <group key={z} position={[0, 0, z]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (W / 2 - 0.15), H / 2, 0]} castShadow receiveShadow material={matOf("#7d6d58", 0.9)}>
              <boxGeometry args={[0.3, H, 0.5]} />
            </mesh>
          ))}
          <mesh position={[0, H - 0.2, 0]} material={matOf("#7d6d58", 0.9)} castShadow>
            <boxGeometry args={[W, 0.4, 0.5]} />
          </mesh>
        </group>
      ))}
      {/* the bright arena gate at the end */}
      <mesh position={[0, 1.7, 12.8]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[W - 0.6, 3.2]} />
        <meshBasicMaterial color={[3, 2.7, 2.1]} fog={false} toneMapped={false} />
      </mesh>
      <sprite position={[0, 1.8, 12.4]} scale={[9, 7, 1]}>
        <spriteMaterial map={glow} blending={THREE.AdditiveBlending} depthWrite={false} opacity={0.55} transparent fog={false} />
      </sprite>
      {/* portcullis half raised */}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={i} position={[-1.2 + i * 0.34, 3.0, 12.6]} material={matOf("#2b2a28", 0.5, 0.7)}>
          <boxGeometry args={[0.05, 1.3, 0.05]} />
        </mesh>
      ))}
      {/* banner + torches + weapon rack */}
      <mesh position={[W / 2 - 0.02, 2.2, 4.5]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[0.9, 1.9]} />
        <meshStandardMaterial map={banner} transparent alphaTest={0.4} side={THREE.DoubleSide} />
      </mesh>
      <group position={[-W / 2 + 0.1, 0, 3.5]}>
        <primitive object={rack} />
        <mesh position={[0.02, 0.9, 0]} material={matOf("#4a3322", 0.8)}>
          <boxGeometry args={[0.06, 0.08, 2.6]} />
        </mesh>
      </group>
      <mesh position={[W / 2 - 0.4, 0.4, 7.5]} castShadow>
        <cylinderGeometry args={[0.3, 0.27, 0.8, 12]} />
        <meshStandardMaterial map={wood} />
      </mesh>
      <mesh position={[W / 2 - 0.45, 0.3, 8.3]} rotation={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial map={wood} />
      </mesh>
      {[[-W / 2 + 0.12, 1.2], [W / 2 - 0.12, 1.2], [-W / 2 + 0.12, 7.2]].map(([x, z], i) => (
        <group key={i} position={[x, 2.2, z]}>
          <mesh material={matOf("#2b2a28", 0.5, 0.7)} rotation={[0, 0, x < 0 ? -0.4 : 0.4]}>
            <cylinderGeometry args={[0.035, 0.03, 0.45, 6]} />
          </mesh>
          <sprite ref={(m) => (flames.current[i] = m)} position={[x < 0 ? 0.1 : -0.1, 0.35, 0]} scale={[0.45, 0.55, 1]}>
            <spriteMaterial map={flame} blending={THREE.AdditiveBlending} depthWrite={false} transparent />
          </sprite>
          <pointLight ref={(l) => (lights.current[i] = l)} position={[x < 0 ? 0.4 : -0.4, 0.4, 0]} color="#ff9a4a" intensity={3} distance={6} decay={1.6} />
        </group>
      ))}
      <points ref={dust}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={dustData.length / 3} array={dustData} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial map={glow} size={0.04} transparent opacity={0.6} depthWrite={false} color="#ffe6b8" />
      </points>
      <primitive object={rig.root} />
    </group>
  );
}

export function TunnelScene({ look, equip, reduced }) {
  return (
    <Canvas className="ag-canvas" frameloop={frameloop} gl={glTest} shadows dpr={[1, 1.5]} camera={{ fov: 50, position: [-1.2, 1.45, -2.3], near: 0.05, far: 60 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0;
      }}
    >
      <Sizer />
      <Env intensity={0.35} />
      <Tunnel look={look} equip={equip} reduced={reduced} />
    </Canvas>
  );
}

/* ================================================================== preview */
function Turntable({ look, equip, spin, guard }) {
  const rig = useGladiator(look, equip);
  const fighter = useMemo(() => idleFighter(equip.weapon.id), [equip]);
  const holder = useRef();
  const sand = useMemo(() => sandTexture("#c8a46a", "#a07d48", 512, "sand"), []);
  const { camera } = useThree();
  useFrame((st, dt) => {
    // orbit the camera (the fighter's feet are planted in world space, so the model itself stays put)
    if (!spin.dragging) spin.current += dt * 0.35;
    const a = spin.current;
    camera.position.set(Math.sin(a) * 4.6, 1.35, Math.cos(a) * 4.6);
    fighter.guardBlend = guard ? 1 : 0;
    fighter.sprintBlend = guard ? 0 : 0.9; // relaxed: weapon and shield lowered so the armour shows
    poseGladiator(rig, fighter, Math.min(dt, 0.05), { target: { x: 0, z: 5 } });
    camera.lookAt(0, 1.05, 0);
  });
  return (
    <group>
      <color attach="background" args={["#15100c"]} />
      <hemisphereLight args={["#ffe9c8", "#3a2a1c", 0.8]} />
      <directionalLight position={[3, 6, 4]} intensity={2.4} color="#ffe6c0" castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-3, 2.5, -2]} intensity={6} color="#ff9a4a" distance={10} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1.6, 48]} />
        <meshStandardMaterial map={sand} roughness={0.95} />
      </mesh>
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[1.65, 1.75, 0.12, 48]} />
        <meshStandardMaterial color="#6d604f" roughness={0.9} />
      </mesh>
      <group ref={holder}>
        <primitive object={rig.root} />
      </group>
    </group>
  );
}

export function PreviewScene({ look, equip, guard = false }) {
  const spin = useRef(0.5);
  const drag = useRef(null);
  const onDown = (e) => {
    drag.current = e.clientX;
    spin.dragging = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (drag.current == null) return;
    spin.current -= (e.clientX - drag.current) * 0.012;
    drag.current = e.clientX;
  };
  const onUp = () => {
    drag.current = null;
    spin.dragging = false;
  };
  return (
    <div className="ag-preview" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <Canvas className="ag-canvas" frameloop={frameloop} gl={glTest} shadows dpr={[1, 1.5]} camera={{ fov: 32, position: [0, 1.35, 4.6], near: 0.05, far: 40 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
        }}
      >
        <Sizer />
        <Env intensity={0.55} />
        <Turntable look={look} equip={equip} spin={spin} guard={guard} />
      </Canvas>
      <div className="ag-preview__hint">drag to rotate</div>
    </div>
  );
}
