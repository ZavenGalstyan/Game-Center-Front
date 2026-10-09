/**
 * Night Corridor — main menu backdrop: a long hospital corridor built from
 * the same kit as the game, a flickering tube overhead, a red emergency
 * light at the far end — and, now and then, something standing under it.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buildLevel, cellX, cellZ } from "../engine/level.js";
import { createLamps } from "../engine/lamps.js";
import Architecture from "./Architecture.jsx";
import Props from "./Props.jsx";
import Lamps from "./Lamps.jsx";
import { Doors } from "./Interactive.jsx";
import Creature from "./Creature.jsx";
import { useCanvasWatchdog, SceneErrorBoundary } from "../utils/canvasGuard.jsx";
import { frameloop, glTest, Sizer } from "../utils/testHooks.js";

const MENU_SECTION = {
  id: 99,
  theme: "hospital",
  map: [
    "#######",
    "###e###",
    "###.###",
    "###.###",
    "##D.###",
    "###x###",
    "###.D##",
    "###c###",
    "###o###",
    "##D.###",
    "###.###",
    "###x###",
    "###.D##",
    "###.###",
    "##Dc###",
    "###.###",
    "###f###",
    "###.###",
    "###@###",
    "#######",
  ],
  marks: {},
  windows: 0,
};

function Backdrop({ audio }) {
  const { camera, scene, gl } = useThree();
  const level = useMemo(() => buildLevel(MENU_SECTION), []);
  const lamps = useMemo(() => createLamps(level, MENU_SECTION), [level]);
  const focus = useRef({ x: cellX(3), z: cellZ(14) });
  const creature = useMemo(() => ({ state: "HIDDEN", x: cellX(3), z: cellZ(2) + 0.6, yaw: Math.PI, anim: "idle", speed: 0, headYaw: 0 }), []);
  const eyes = useRef(0.25);
  const st = useRef({ next: 14 + Math.random() * 10, showT: 0 });

  useEffect(() => {
    scene.background = new THREE.Color("#020203");
    scene.fog = new THREE.FogExp2("#020203", 0.07);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.1;
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, gl]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    lamps.step(dt);
    // slow, uneasy drift
    camera.position.set(cellX(3) + Math.sin(t * 0.13) * 0.18, 1.62 + Math.sin(t * 0.31) * 0.025, cellZ(18) - 0.4 + Math.sin(t * 0.07) * 0.3);
    camera.rotation.set(0.0 + Math.sin(t * 0.21) * 0.012, 0.05 + Math.sin(t * 0.09) * 0.05, 0, "YXZ");
    audio?.setListener(camera.position.x, camera.position.z, camera.rotation.y);
    audio?.menuTick(dt);

    // Every so often: it's there. Then it isn't.
    const s = st.current;
    s.next -= dt;
    if (creature.state === "HIDDEN" && s.next <= 0) {
      creature.state = "IDLE";
      s.showT = 3.2 + Math.random() * 1.5;
      const red = lamps.list.find((l) => l.kind === "emergency");
      if (red) lamps.setMode(red, "flicker", 0.5);
    }
    if (creature.state !== "HIDDEN") {
      s.showT -= dt;
      if (s.showT <= 0) {
        const red = lamps.list.find((l) => l.kind === "emergency");
        if (red) lamps.setMode(red, "blackout", 0.35);
        creature.state = "HIDDEN";
        s.next = 22 + Math.random() * 18;
      }
    }
  });

  return (
    <group>
      <hemisphereLight args={["#1d2a2c", "#0b0807", 0.12]} />
      <Architecture level={level} />
      <Props level={level} />
      <Lamps lamps={lamps} theme={level.theme} quality="medium" poolSize={5} focus={focus} />
      <Doors doors={level.doors} />
      <Creature creature={creature} eyeGlowRef={eyes} />
      <MenuDust />
    </group>
  );
}

function MenuDust() {
  const ref = useRef();
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 160;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = cellX(3) + (Math.random() - 0.5) * 1.8;
      pos[i * 3 + 1] = Math.random() * 3;
      pos[i * 3 + 2] = cellZ(12) + Math.random() * 14;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((_, dt) => {
    const a = geo.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      a[i + 1] -= dt * 0.025;
      a[i] += Math.sin(i + performance.now() * 0.0003) * dt * 0.01;
      if (a[i + 1] < 0) a[i + 1] = 3;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color="#a39a8a" size={0.012} transparent opacity={0.4} depthWrite={false} />
    </points>
  );
}

export default function MenuScene({ audio }) {
  const host = useRef(null);
  useCanvasWatchdog(host);
  return (
    <div className="nc-menu__canvas" ref={host}>
      <SceneErrorBoundary>
        <Canvas frameloop={frameloop} dpr={[0.8, 1.25]} gl={{ antialias: true, ...glTest }} camera={{ fov: 62, near: 0.05, far: 60 }}>
          <Sizer />
          <Backdrop audio={audio} />
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
