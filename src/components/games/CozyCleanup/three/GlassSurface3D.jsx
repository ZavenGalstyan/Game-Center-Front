/**
 * Cozy Cleanup 3D — the two-phase window/mirror surface: spray lays down
 * droplets (doesn't clean by itself), then cloth wipes both the droplets
 * and the underlying grime away once enough of the pane has been sprayed.
 * Same two-grid approach as the 2D `GlassSurface`, now painted on a
 * back-wall-facing plane via two stacked canvas textures.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { applyDab, createGrid, gridAverage, lerpPoints } from "../engine/coverage.js";
import { COVERAGE_COMPLETE_THRESHOLD, clampPct } from "../engine/progress.js";
import { sfx } from "../engine/sound.js";

const W = 256, H = 192;
const SPRAY_READY = 32;

export default function GlassSurface3D({ id, position, size, tool, soundEnabled = true, particlesEnabled = true, disabled = false, isNearest = false, onProgress, onComplete, onParticle }) {
  const grimeCanvas = useMemo(() => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; }, []);
  const dropCanvas = useMemo(() => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; }, []);
  const grimeTex = useMemo(() => new THREE.CanvasTexture(grimeCanvas), [grimeCanvas]);
  const dropTex = useMemo(() => new THREE.CanvasTexture(dropCanvas), [dropCanvas]);
  const grimeCtx = useRef(null);
  const dropCtx = useRef(null);
  const sprayGrid = useRef(createGrid(10, 7));
  const wipeGrid = useRef(createGrid(10, 7));
  const activeRef = useRef(false);
  const lastPt = useRef([0.5, 0.5]);
  const completedRef = useRef(false);
  const lastPuff = useRef(0);
  const [sprayReady, setSprayReady] = useState(false);
  const toolRef = useRef(tool);
  toolRef.current = tool;

  useEffect(() => {
    const gctx = grimeCanvas.getContext("2d");
    grimeCtx.current = gctx;
    dropCtx.current = dropCanvas.getContext("2d");
    gctx.fillStyle = "rgba(180,190,175,0.55)";
    gctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) {
      gctx.fillStyle = `rgba(150,160,145,${0.08 + Math.random() * 0.12})`;
      gctx.beginPath();
      gctx.arc(Math.random() * W, Math.random() * H, 8 + Math.random() * 18, 0, Math.PI * 2);
      gctx.fill();
    }
    grimeTex.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushProgress = useCallback(() => {
    const wipePct = clampPct(gridAverage(wipeGrid.current));
    onProgress?.(id, wipePct);
    if (!completedRef.current && wipePct >= COVERAGE_COMPLETE_THRESHOLD) {
      completedRef.current = true;
      grimeCtx.current.clearRect(0, 0, W, H);
      dropCtx.current.clearRect(0, 0, W, H);
      grimeTex.needsUpdate = true; dropTex.needsUpdate = true;
      onProgress?.(id, 100);
      onComplete?.(id);
    }
  }, [id, onProgress, onComplete, grimeTex, dropTex]);

  const doSpray = useCallback((nx, ny) => {
    applyDab(sprayGrid.current, nx, ny, 0.12, 0.24);
    const ctx = dropCtx.current;
    const px = nx * W, py = ny * H;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = "rgba(206,232,235,0.6)";
      ctx.beginPath();
      ctx.arc(px + (Math.random() - 0.5) * 16, py + (Math.random() - 0.5) * 16, 1.6 + Math.random() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    dropTex.needsUpdate = true;
    const ready = gridAverage(sprayGrid.current) >= SPRAY_READY;
    setSprayReady((prev) => (prev !== ready ? ready : prev));
  }, [dropTex]);

  const doWipe = useCallback((nx, ny) => {
    if (gridAverage(sprayGrid.current) < SPRAY_READY) return;
    applyDab(wipeGrid.current, nx, ny, 0.16, 0.17);
    const px = nx * W, py = ny * H;
    const r = 0.16 * Math.min(W, H);
    for (const ctx of [grimeCtx.current, dropCtx.current]) {
      const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, "rgba(0,0,0,0.65)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    grimeTex.needsUpdate = true; dropTex.needsUpdate = true;
  }, [grimeTex, dropTex]);

  const stopStroke = useCallback(() => { activeRef.current = false; pushProgress(); }, [pushProgress]);

  useEffect(() => {
    window.addEventListener("pointerup", stopStroke);
    window.addEventListener("pointercancel", stopStroke);
    window.addEventListener("blur", stopStroke);
    return () => {
      window.removeEventListener("pointerup", stopStroke);
      window.removeEventListener("pointercancel", stopStroke);
      window.removeEventListener("blur", stopStroke);
    };
  }, [stopStroke]);

  const uvToNorm = (e) => [e.uv.x, 1 - e.uv.y];

  const onPointerDown = useCallback((e) => {
    if (disabled || completedRef.current || (tool !== "spray" && tool !== "cloth")) return;
    e.stopPropagation();
    try { e.target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    activeRef.current = true;
    const [nx, ny] = uvToNorm(e);
    lastPt.current = [nx, ny];
    if (tool === "spray") { doSpray(nx, ny); sfx.spray(soundEnabled); }
    else { doWipe(nx, ny); sfx.clothWipe(soundEnabled); }
    pushProgress();
  }, [disabled, tool, doSpray, doWipe, soundEnabled, pushProgress]);

  const onPointerMove = useCallback((e) => {
    if (!activeRef.current || !e.uv) return;
    e.stopPropagation();
    const [nx, ny] = uvToNorm(e);
    const [lx, ly] = lastPt.current;
    const pts = lerpPoints(lx, ly, nx, ny, 0.06);
    const now = performance.now();
    for (const [x, y] of pts) (toolRef.current === "spray" ? doSpray : doWipe)(x, y);
    if (now - lastPuff.current > 130) {
      lastPuff.current = now;
      sfx[toolRef.current === "spray" ? "spray" : "clothWipe"](soundEnabled);
      if (particlesEnabled && onParticle) onParticle(position, "mote");
    }
    lastPt.current = [nx, ny];
    pushProgress();
  }, [doSpray, doWipe, soundEnabled, particlesEnabled, onParticle, position, pushProgress]);

  const isActiveTool = tool === "spray" || tool === "cloth";

  return (
    <group position={position}>
      {isActiveTool && isNearest && (
        <mesh position={[0, 0, -0.006]}>
          <planeGeometry args={[size[0] * 1.16, size[1] * 1.16]} />
          <meshBasicMaterial color="#e53935" transparent opacity={0.16} depthWrite={false} />
        </mesh>
      )}
      <mesh
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopStroke}
        onPointerOut={stopStroke}
      >
        <planeGeometry args={size} />
        <meshStandardMaterial map={grimeTex} transparent depthWrite={false} roughness={0.3} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={size} />
        <meshStandardMaterial map={dropTex} transparent depthWrite={false} roughness={0.15} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
      </mesh>
      {tool === "cloth" && sprayReady && (
        <mesh position={[0, 0, 0.004]}>
          <planeGeometry args={[size[0] * 0.98, size[1] * 0.98]} />
          <meshBasicMaterial color="#8fae86" transparent opacity={0.1} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
