/**
 * Mountain Journey — the living backdrop behind every menu screen: the
 * explorer standing at the end of a camp trail on a cliff, looking out over
 * a river valley and lake toward the snowy summit on the horizon. Built with
 * the same level pipeline as gameplay (MENU_LEVEL). The camera drifts slowly;
 * on the Explorer screen it swings round to frame the character.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buildLevel } from "../engine/builder.js";
import { MENU_LEVEL } from "../data/levels.js";
import { REGIONS } from "../data/regions.js";
import Terrain from "./Terrain.jsx";
import Water from "./Water.jsx";
import Vegetation from "./Vegetation.jsx";
import Props from "./Props.jsx";
import Sky from "./Sky.jsx";
import { ExplorerModel, menuPose } from "./Explorer.jsx";
import { WeatherParticles } from "./Effects.jsx";
import { Lights, makeEnv } from "./GameScene.jsx";
import { windUniforms } from "./materials.js";
import { useCanvasWatchdog, SceneErrorBoundary } from "../utils/canvasGuard.jsx";
import { frameloop, glTest, Sizer, TEST } from "../utils/testHooks.js";

let menuLevel = null;
function getMenuLevel() {
  if (!menuLevel) menuLevel = buildLevel(MENU_LEVEL, REGIONS[0]);
  return menuLevel;
}

function MenuWorld({ L, env, look, mode, settings }) {
  const { camera, scene, gl } = useThree();
  useEffect(() => {
    if (TEST) window.__mj = { ...(window.__mj || {}), menu: { camera, scene, gl, L } };
  }, [camera, scene, gl, L]);
  const N = L.paths[0].nodes;
  const end = N[N.length - 1];
  const prev = N[N.length - 3];
  const h = Math.atan2(end.x - prev.x, end.z - prev.z);
  // stand near the drop edge, facing out over the valley (to the right)
  const rx = -Math.cos(h);
  const rz = Math.sin(h);
  // the menu shot stands at the very end of the trail (open valley on two
  // sides); the Explorer screen stands further back, framed by the forest
  const standAt = (back, side) => {
    const x = end.x + rx * side - Math.sin(h) * back;
    const z = end.z + rz * side - Math.cos(h) * back;
    return { x, z, y: L.terrain.height(x, z) };
  };
  const standMenu = useMemo(() => standAt(1.2, 2.2), [L, end, rx, rz, h]); // eslint-disable-line react-hooks/exhaustive-deps
  const standExp = useMemo(() => standAt(12, 2.6), [L, end, rx, rz, h]); // eslint-disable-line react-hooks/exhaustive-deps
  const stand = mode === "explorer" ? standExp : standMenu;
  const viewYaw = Math.atan2(rx, rz);
  const focusRef = useRef({ x: stand.x, y: stand.y, z: stand.z, cave: 0 });
  const cam = useRef({ init: false, pos: new THREE.Vector3(), tgt: new THREE.Vector3() });
  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const t = clock.elapsedTime;
    windUniforms.uTime.value += dt;
    windUniforms.uWind.value = 0.45;
    const c = cam.current;
    const pos = new THREE.Vector3();
    const tgt = new THREE.Vector3();
    const reduced = settings.reducedMotion;
    const drift = reduced ? 0 : Math.sin(t * 0.07) * 0.22;
    if (mode === "explorer") {
      // in front of the explorer (out over the edge), looking back at them
      // with the trail and forest behind; the subject sits left of the panel
      const a = viewYaw - 0.55 + (reduced ? 0 : Math.sin(t * 0.15) * 0.12);
      pos.set(stand.x + Math.sin(a) * 3.3, stand.y + 1.35, stand.z + Math.cos(a) * 3.3);
      const back = a + Math.PI;
      const rx = -Math.cos(back);
      const rz = Math.sin(back);
      tgt.set(stand.x + rx * 1.15, stand.y + 0.95, stand.z + rz * 1.15);
    } else {
      // over the shoulder, out across the valley toward the summit
      const a = viewYaw + Math.PI - 0.5 + drift;
      pos.set(stand.x + Math.sin(a) * 6.2, stand.y + 2.9 + (reduced ? 0 : Math.sin(t * 0.11) * 0.15), stand.z + Math.cos(a) * 6.8);
      tgt.set(stand.x + Math.sin(viewYaw - 0.32 + drift * 0.3) * 120, stand.y - 22, stand.z + Math.cos(viewYaw - 0.32 + drift * 0.3) * 120);
    }
    if (!c.init) {
      c.pos.copy(pos);
      c.tgt.copy(tgt);
      c.init = true;
    }
    c.pos.lerp(pos, Math.min(1, dt * 1.6));
    c.tgt.lerp(tgt, Math.min(1, dt * 1.6));
    camera.position.copy(c.pos);
    camera.lookAt(c.tgt);
  });
  const place = (g) => {
    g.position.set(stand.x, stand.y, stand.z);
    g.rotation.y = viewYaw;
  };
  const poseFn = (dt, t) => menuPose(t, mode === "explorer" ? "idle" : "overlook");
  const quality = settings.graphics;
  const shadowMode = quality === "low" ? "off" : settings.shadows;
  return (
    <>
      <Sizer />
      <Lights env={env} focusRef={focusRef} shadowMode={shadowMode} />
      <Sky L={L} env={env} reduced={settings.reducedMotion} peakAngle={Math.atan2(Math.cos(viewYaw + 0.3), Math.sin(viewYaw + 0.3))} />
      <Terrain L={L} quality={quality} />
      <Water L={L} env={env} />
      <Vegetation L={L} quality={quality} shadows={shadowMode !== "off"} />
      <Props L={L} />
      <ExplorerModel look={look} poseFn={poseFn} place={place} castShadow={shadowMode !== "off"} />
      <WeatherParticles kind="pollen" quality={quality} reduced={settings.reducedMotion} />
    </>
  );
}

export default function MenuScene({ look, mode, settings }) {
  const L = getMenuLevel();
  const env = useMemo(() => makeEnv(L), [L]);
  const host = useRef(null);
  useCanvasWatchdog(host);
  useEffect(() => undefined, []);
  const quality = settings.graphics;
  const shadowMode = quality === "low" ? "off" : settings.shadows;
  const dpr = quality === "low" ? [0.6, 0.85] : quality === "high" ? [1, 1.6] : [0.85, 1.2];
  return (
    <div className="mj-canvas mj-canvas--menu" ref={host}>
      <SceneErrorBoundary>
        <Canvas
          frameloop={frameloop}
          dpr={dpr}
          shadows={shadowMode !== "off"}
          gl={{ antialias: quality !== "low", powerPreference: "high-performance", ...glTest }}
          camera={{ fov: 50, near: 0.15, far: 4000 }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
          }}
        >
          <MenuWorld L={L} env={env} look={look} mode={mode} settings={settings} />
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}

export function disposeMenuLevel() {
  menuLevel = null;
}
