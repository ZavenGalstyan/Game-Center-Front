/**
 * Lumberjack Life — the workshop's 3D character preview: the actual
 * lumberjack holding the selected tool in his ready stance, on a stump-ring
 * platform with a few logs, turning slowly. Small, self-contained canvas.
 */
import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buildLumberjack, setRigTool, poseLumberjack } from "./lumberjack.js";
import { makeLogMesh } from "./logMesh.js";
import { toolById } from "../data/equipment.js";
import { endGrainTexture } from "./textures.js";
import { speciesById } from "../data/species.js";
import { frameloop, glTest, Sizer } from "../utils/testHooks.js";

function Stage({ toolId }) {
  const { scene, camera, gl } = useThree();
  const ref = useRef(null);
  useEffect(() => {
    gl.shadowMap.enabled = true;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    const group = new THREE.Group();
    scene.add(group);
    const disp = [];
    const hemi = new THREE.HemisphereLight("#fff3dc", "#5a4a32", 1.1);
    const sun = new THREE.DirectionalLight("#fff1d6", 2.4);
    sun.position.set(3, 5, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -3;
    sun.shadow.camera.right = 3;
    sun.shadow.camera.top = 3;
    sun.shadow.camera.bottom = -3;
    const rim = new THREE.DirectionalLight("#ffd9a0", 1.2);
    rim.position.set(-3, 2.5, -3);
    group.add(hemi, sun, rim);
    // platform: a giant stump slice
    const sp = speciesById("oak");
    const topMat = new THREE.MeshStandardMaterial({ map: endGrainTexture(sp.wood, sp.bark), roughness: 0.8 });
    const sideMat = new THREE.MeshStandardMaterial({ color: "#5b4636", roughness: 0.95 });
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.3, 40), [sideMat, topMat, sideMat]);
    plat.position.y = -0.15;
    plat.receiveShadow = true;
    group.add(plat);
    disp.push(plat.geometry, topMat, sideMat);
    const logs = [];
    for (const [x, z, yaw] of [[-0.85, -0.55, 0.3], [-0.6, -0.95, 0.2]]) {
      const m = makeLogMesh({ species: "birch", len: 1.1, rA: 0.15, rB: 0.13 });
      m.position.set(x, 0.15, z);
      m.rotation.y = yaw + Math.PI / 2;
      group.add(m);
      logs.push(m);
    }
    const rig = buildLumberjack({ shadows: true });
    group.add(rig.root);
    // frame him right of centre: the stat card sits bottom-left
    camera.position.set(-0.75, 1.35, 3.6);
    camera.lookAt(-0.75, 0.95, 0);
    ref.current = { rig, group, t: 0, disp, logs };
    return () => {
      group.removeFromParent();
      rig.dispose();
      logs.forEach((m) => m.geometry.dispose());
      disp.forEach((d) => d.dispose());
      ref.current = null;
    };
  }, [scene, camera, gl]);
  useFrame((_, dt) => {
    const R = ref.current;
    if (!R) return;
    R.t += dt;
    const tool = toolById(toolId);
    if (R.rig.toolId !== tool.id) setRigTool(R.rig, tool);
    R.rig.root.rotation.y = 0.5 + Math.sin(R.t * 0.35) * 0.55;
    R.rig.root.updateMatrixWorld(true);
    poseLumberjack(R.rig, {
      mode: tool.kind === "chainsaw" ? "saw" : "loco",
      speed: 0,
      phase: 0,
      dt,
      time: R.t,
      ready: 1,
      saw: { state: "IDLE", t: 1, cut: false, target: null },
      ground: () => 0,
    });
  });
  return null;
}

export default function PreviewCanvas({ toolId }) {
  return (
    <Canvas className="ll-preview__canvas" dpr={[1, 1.5]} frameloop={frameloop} gl={{ antialias: true, alpha: true, ...glTest }} camera={{ fov: 32, position: [0, 1.4, 3.6] }}>
      <Sizer />
      <Stage toolId={toolId} />
    </Canvas>
  );
}
