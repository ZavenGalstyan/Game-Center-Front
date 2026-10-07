/**
 * Dungeon Knight — the R3F canvas around the game renderer. The renderer is
 * created once per mounted play session and disposed on unmount; rooms are
 * swapped inside it. A fullscreen toggle only resizes the canvas — it never
 * recreates the scene, the loop, the listeners or the audio.
 */
import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { createGameRenderer } from "./gameRenderer.js";
import { frameloop, glTest, Sizer, TEST } from "../utils/testHooks.js";
import { useCanvasWatchdog } from "../utils/canvasGuard.jsx";

function Driver({ settingsRef, input, hooksRef, onReady }) {
  const { scene, camera, gl, size } = useThree();
  const ref = useRef(null);
  useEffect(() => {
    const r = createGameRenderer({
      scene,
      camera,
      gl,
      settingsRef,
      hooks: {
        onEvent: (e) => hooksRef.current.onEvent && hooksRef.current.onEvent(e),
        onFrame: (W, cam, camera3) => hooksRef.current.onFrame && hooksRef.current.onFrame(W, cam, camera3),
      },
    });
    ref.current = r;
    if (TEST) {
      window.__dk = window.__dk || {};
      Object.assign(window.__dk, { scene, camera, gl, renderer: r });
    }
    onReady(r);
    return () => {
      ref.current = null;
      onReady(null);
      r.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ref.current) ref.current.resize(size.width, size.height);
  }, [size.width, size.height]);
  useFrame((_, dt) => {
    const r = ref.current;
    if (r) r.frame(dt, input);
  });
  return null;
}

export default function GameCanvas({ settingsRef, input, hooksRef, onReady, className }) {
  const hostRef = useRef(null);
  useCanvasWatchdog(hostRef);
  const q = settingsRef.current.graphics;
  const dpr = q === "high" ? [1, 2] : q === "low" ? [0.65, 1] : [1, 1.5];
  return (
    <div ref={hostRef} className={className || "dk-canvas"}>
      <Canvas
        dpr={dpr}
        frameloop={frameloop}
        shadows={q !== "low" && settingsRef.current.shadows !== "off"}
        gl={{ antialias: q !== "low", powerPreference: "high-performance", ...glTest }}
        camera={{ fov: 58, near: 0.08, far: 80, position: [0, 2, -4] }}
      >
        <Sizer />
        <Driver settingsRef={settingsRef} input={input} hooksRef={hooksRef} onReady={onReady} />
      </Canvas>
    </div>
  );
}
