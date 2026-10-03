/**
 * Lumberjack Life — the R3F canvas around a world renderer. The renderer is
 * created once per mounted world (session) and disposed on unmount; a
 * fullscreen toggle only resizes the canvas, it never recreates the scene,
 * the loop, the listeners or the audio.
 */
import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { createWorldRenderer } from "./worldRenderer.js";
import { frameloop, glTest, Sizer } from "../utils/testHooks.js";
import { useCanvasWatchdog } from "../utils/canvasGuard.jsx";

function Driver({ world, input, live, settings, progress, showcase, onEvents, onReady }) {
  const { scene, camera, gl, size } = useThree();
  const ref = useRef(null);
  const evRef = useRef(onEvents);
  evRef.current = onEvents;
  useEffect(() => {
    const r = createWorldRenderer({ scene, camera, gl, world, settings, progress, showcase, onEvents: (e) => evRef.current && evRef.current(e) });
    ref.current = r;
    if (onReady) onReady(r);
    return () => {
      ref.current = null;
      r.dispose();
      if (onReady) onReady(null);
    };
    // the renderer is bound to this world for its whole life
  }, [world]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ref.current) ref.current.setPixelScale(size.height * Math.min(2, gl.getPixelRatio()));
  }, [size.height, gl]);
  useFrame((_, dt) => {
    if (ref.current) ref.current.frame(dt, input, live);
  });
  return null;
}

export default function WorldCanvas({ world, input, live, settings, progress, showcase = false, onEvents, onReady, className = "ll-canvas" }) {
  const hostRef = useRef(null);
  useCanvasWatchdog(hostRef);
  const dpr = settings.graphics === "high" ? [1, 2] : settings.graphics === "low" ? [0.75, 1] : [1, 1.5];
  return (
    <div ref={hostRef} className={className}>
      <Canvas
        dpr={dpr}
        frameloop={frameloop}
        gl={{ antialias: settings.graphics !== "low", powerPreference: "high-performance", ...glTest }}
        camera={{ fov: 55, near: 0.08, far: 900, position: [0, 5, -6] }}
      >
        <Sizer />
        <Driver world={world} input={input} live={live} settings={settings} progress={progress} showcase={showcase} onEvents={onEvents} onReady={onReady} />
      </Canvas>
    </div>
  );
}
