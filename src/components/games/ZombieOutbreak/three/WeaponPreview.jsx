/** Zombie Outbreak — rotating 3D weapon preview for the Weapon Select screen. */
import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildWeaponModel } from "./weaponModels.js";
import { frameloop, glTest, Sizer } from "../utils/testHooks.js";
import { SceneErrorBoundary, useCanvasWatchdog } from "../utils/canvasGuard.jsx";

function Turntable({ id, locked }) {
  const model = useMemo(() => {
    const m = buildWeaponModel(id);
    m.group.traverse((o) => {
      if (o.userData.hand) o.visible = false;
    });
    // Centre the gun on its bounding box.
    const box = new THREE.Box3().setFromObject(m.group);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const s = 2.1 / Math.max(size.x, size.y, size.z);
    const holder = new THREE.Group();
    m.group.position.sub(c);
    holder.add(m.group);
    holder.scale.setScalar(s);
    return holder;
  }, [id]);
  const ref = useRef();
  useFrame((st, dt) => {
    if (ref.current) {
      ref.current.rotation.y += Math.min(dt, 0.05) * 0.5;
      ref.current.rotation.x = Math.sin(st.clock.elapsedTime * 0.6) * 0.08;
    }
  });
  return (
    <group ref={ref}>
      <primitive object={model} />
    </group>
  );
}

export default function WeaponPreview({ id, locked }) {
  const host = useRef(null);
  useCanvasWatchdog(host);
  return (
    <div className={`zo-preview${locked ? " zo-preview--locked" : ""}`} ref={host}>
      <SceneErrorBoundary>
        <Canvas
          frameloop={frameloop}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true, ...glTest }}
          camera={{ fov: 32, position: [1.9, 0.55, 2.2] }}
          onCreated={({ gl, camera, scene }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.outputColorSpace = THREE.SRGBColorSpace;
            camera.lookAt(0, 0, 0);
            const pmrem = new THREE.PMREMGenerator(gl);
            scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
            scene.environmentIntensity = 0.8;
            pmrem.dispose();
          }}
        >
          <Sizer />
          <hemisphereLight args={["#c8d4ff", "#2a2018", 1.4]} />
          <directionalLight position={[2, 3, 2]} intensity={2.4} color="#ffe2c0" />
          <directionalLight position={[-3, 1, -2]} intensity={1.4} color="#6aa0ff" />
          <pointLight position={[0, -1, 1.5]} intensity={6} color="#ff6a3a" distance={6} />
          <Turntable id={id} locked={locked} />
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
