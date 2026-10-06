/**
 * Rooftop Dash — the R3F canvas around one game renderer. The renderer is
 * created once per mounted world and disposed on unmount. A fullscreen
 * toggle only resizes the canvas — it never recreates the scene, the loop,
 * the listeners or the audio (no second render loop).
 */
import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { createGameRenderer } from "./gameRenderer.js";
import { frameloop, glTest, Sizer, TEST } from "../utils/testHooks.js";
import { useCanvasWatchdog } from "../utils/canvasGuard.jsx";

function Driver({ W, theme, settingsRef, outfit, trail, touch, input, mode, onEvent, onReady, dom, botRef }) {
  const { scene, camera, gl } = useThree();
  const ref = useRef(null);
  const evRef = useRef(onEvent);
  evRef.current = onEvent;
  useEffect(() => {
    const r = createGameRenderer({ scene, camera, gl, W, theme, settingsRef, outfit, trail, touch, mode, dom, onEvent: (e) => evRef.current && evRef.current(e) });
    ref.current = r;
    if (TEST && mode === "game") {
      window.__rd = window.__rd || {};
      window.__rd.scene = scene;
      window.__rd.camera = camera;
      window.__rd.THREE_gl = gl;
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
    if (!r) return;
    const bot = botRef && botRef.current;
    r.frame(dt, input, bot ? bot(dt) : null);
  });
  return null;
}

export default function GameCanvas(props) {
  const hostRef = useRef(null);
  useCanvasWatchdog(hostRef);
  const q = props.settingsRef.current.graphics;
  const dpr = q === "high" ? [1, 2] : q === "low" ? [0.7, 1] : [1, 1.5];
  return (
    <div ref={hostRef} className={props.className || "rd-canvas"}>
      <Canvas
        dpr={dpr}
        frameloop={frameloop}
        shadows={q !== "low"}
        gl={{ antialias: q !== "low", powerPreference: "high-performance", ...glTest }}
        camera={{ fov: 72, near: 0.08, far: 1200, position: [0, 3, -5] }}
      >
        <Sizer />
        <Driver {...props} />
      </Canvas>
    </div>
  );
}
