/**
 * Highway Racer — the single R3F canvas behind every screen. The world is
 * created once per mount and disposed on unmount; screens only switch its
 * mode. A fullscreen toggle only resizes this canvas — it never recreates
 * the scene, the loop, the listeners or the audio.
 */
import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { createWorld } from "./world.js";
import { frameloop, glTest, Sizer, TEST } from "../utils/testHooks.js";
import { useCanvasWatchdog } from "../utils/canvasGuard.jsx";

function Driver({ settingsRef, tickRef, onReady }) {
  const { scene, camera, gl } = useThree();
  const ref = useRef(null);
  useEffect(() => {
    const w = createWorld({ scene, camera, gl, settings: settingsRef.current });
    ref.current = w;
    if (TEST) {
      window.__hr = window.__hr || {};
      Object.assign(window.__hr, { scene, camera, gl, world: w });
    }
    onReady(w);
    return () => {
      ref.current = null;
      onReady(null);
      w.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, rawDt) => {
    const w = ref.current;
    if (!w) return;
    // clamp: tab switches / stalls never arrive as one giant step
    const dt = Math.min(Math.max(rawDt, 0), 0.05);
    if (tickRef.current) tickRef.current(dt);
    w.frame(dt);
  });
  return null;
}

export default function Stage({ settingsRef, tickRef, onReady, onPointerDown }) {
  const hostRef = useRef(null);
  useCanvasWatchdog(hostRef);
  const q = settingsRef.current.graphics;
  const dpr = q === "high" ? [1, 2] : q === "low" ? [0.7, 1] : [1, 1.5];
  return (
    <div ref={hostRef} className="hr-canvas" onPointerDown={onPointerDown}>
      <Canvas
        dpr={dpr}
        frameloop={frameloop}
        gl={{ antialias: true, powerPreference: "high-performance", ...glTest }}
        camera={{ fov: 60, near: 0.1, far: 1300, position: [0, 3, 7] }}
      >
        <Sizer />
        <Driver settingsRef={settingsRef} tickRef={tickRef} onReady={onReady} />
      </Canvas>
    </div>
  );
}
