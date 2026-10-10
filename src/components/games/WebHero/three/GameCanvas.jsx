/**
 * Web Hero — the R3F canvas around one renderer. The renderer is created
 * once per world and disposed on unmount. A fullscreen toggle only resizes
 * the canvas — the scene, loop, listeners and audio stay as they are.
 */
import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { createGameRenderer } from "./gameRenderer.js";
import { frameloop, glTest, Sizer, TEST } from "../utils/testHooks.js";
import { useCanvasWatchdog } from "../utils/canvasGuard.jsx";

function Driver({ W, district, settingsRef, suit, input, mode, onEvent, onReady }) {
  const { scene, camera, gl } = useThree();
  const ref = useRef(null);
  const evRef = useRef(onEvent);
  evRef.current = onEvent;
  useEffect(() => {
    const r = createGameRenderer({ scene, camera, gl, W, district, settingsRef, suit, mode, input, onEvent: (e) => evRef.current && evRef.current(e) });
    ref.current = r;
    if (TEST) {
      window.__wh = window.__wh || {};
      window.__wh[mode === "menu" ? "menuR" : "renderer"] = r;
      if (mode === "game") Object.assign(window.__wh, { scene, camera, gl, W });
    }
    if (onReady) onReady(r);
    return () => {
      ref.current = null;
      r.dispose();
      if (onReady) onReady(null);
    };
    // bound to this world for its whole life
  }, [W]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ref.current) ref.current.setSuit(suit);
  }, [suit]);
  useFrame((_, dt) => {
    const r = ref.current;
    if (r) r.frame(dt);
  });
  return null;
}

export default function GameCanvas(props) {
  const hostRef = useRef(null);
  useCanvasWatchdog(hostRef);
  const q = props.settingsRef.current.graphics;
  const dpr = q === "high" ? [1, 2] : q === "low" ? [0.7, 1] : [1, 1.5];
  return (
    <div ref={hostRef} className={props.className || "wh-canvas"}>
      <Canvas dpr={dpr} frameloop={frameloop} shadows={q !== "low"} gl={{ antialias: q !== "low", powerPreference: "high-performance", ...glTest }} camera={{ fov: 62, near: 0.1, far: 1800, position: [0, 30, -20] }}>
        <Sizer />
        <Driver {...props} />
      </Canvas>
    </div>
  );
}
