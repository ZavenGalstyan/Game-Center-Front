/**
 * Lost Toy — the R3F canvas around one game renderer. The renderer is created
 * once per mounted world and disposed on unmount. A fullscreen toggle only
 * resizes the canvas — it never recreates the scene, the loop, the listeners
 * or the audio (no second render loop).
 */
import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { createGameRenderer } from "./gameRenderer.js";
import { frameloop, glTest, Sizer, TEST } from "../utils/testHooks.js";
import { useCanvasWatchdog } from "../utils/canvasGuard.jsx";

function Driver({ W, theme, settingsRef, cosmetic, touch, input, mode, onEvent, onReady, dom }) {
  const { scene, camera, gl } = useThree();
  const ref = useRef(null);
  const evRef = useRef(onEvent);
  evRef.current = onEvent;
  useEffect(() => {
    const r = createGameRenderer({ scene, camera, gl, W, theme, settingsRef, cosmetic, touch, mode, dom, onEvent: (e) => evRef.current && evRef.current(e) });
    ref.current = r;
    if (TEST && mode === "game") {
      window.__lt = window.__lt || {};
      window.__lt.scene = scene;
      window.__lt.camera = camera;
      window.__lt.gl = gl;
    }
    if (onReady) onReady(r);
    return () => {
      ref.current = null;
      r.dispose();
      if (onReady) onReady(null);
    };
    // bound to this world for its whole life
  }, [W]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => {
    const r = ref.current;
    if (r) r.frame(dt, input);
  });
  return null;
}

export default function GameCanvas(props) {
  const hostRef = useRef(null);
  useCanvasWatchdog(hostRef);
  const q = props.settingsRef.current.graphics;
  const dpr = q === "high" ? [1, 2] : q === "low" ? [0.7, 1] : [1, 1.5];
  return (
    <div ref={hostRef} className={props.className || "lt-canvas"}>
      <Canvas
        dpr={dpr}
        frameloop={frameloop}
        shadows={q !== "low"}
        gl={{ antialias: q !== "low", powerPreference: "high-performance", ...glTest }}
        camera={{ fov: 62, near: 0.04, far: 520, position: [0, 2, -4] }}
      >
        <Sizer />
        <Driver {...props} />
      </Canvas>
    </div>
  );
}
