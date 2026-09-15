/**
 * Cozy Cleanup 3D — a wipeable dirt surface in world space: floor dust,
 * carpet grime, desk/shelf dust, stains. Same coverage math as the old 2D
 * `CleaningCanvas` (engine/coverage.js, untouched) — the dirt texture is
 * now a `THREE.CanvasTexture` painted on an offscreen <canvas> and mapped
 * onto a plane mesh instead of a DOM <canvas>, and pointer strokes come
 * from React Three Fiber's raycast pointer events (`event.uv`) instead of
 * `getBoundingClientRect()`, but the actual "erase a soft circle, nudge a
 * normalized coverage grid, complete at ~92%" logic is identical.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { applyDab, createGrid, gridAverage, lerpPoints } from "../engine/coverage.js";
import { COVERAGE_COMPLETE_THRESHOLD, clampPct } from "../engine/progress.js";
import { sfx, Loop } from "../engine/sound.js";

const TEX_W = 256, TEX_H = 192;

export default function DirtPlane3D({
  id, label, tool, requiredTool, orientation = "floor", // 'floor' | 'wall'
  position, size, radius = 0.18, dabAmount = 0.16, eraseAlpha = 0.7,
  gridCols = 12, gridRows = 8, loopKind = null, puff = "dustPuff",
  soundEnabled = true, particlesEnabled = true, disabled = false, isNearest = false,
  drawDirt, onProgress, onComplete, onParticle,
}) {
  const meshRef = useRef(null);
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = TEX_W; c.height = TEX_H;
    return c;
  }, []);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);
  const ctxRef = useRef(null);
  const gridRef = useRef(createGrid(gridCols, gridRows));
  const activeRef = useRef(false);
  const lastPtRef = useRef([0.5, 0.5]);
  const completedRef = useRef(false);
  const loopRef = useRef(loopKind ? new Loop(loopKind) : null);
  const lastPuffRef = useRef(0);
  const lastPushRef = useRef(0);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const accepts = useMemo(() => (Array.isArray(requiredTool) ? requiredTool : [requiredTool]), [requiredTool]);

  useEffect(() => {
    const ctx = canvas.getContext("2d");
    ctxRef.current = ctx;
    ctx.clearRect(0, 0, TEX_W, TEX_H);
    drawDirt?.(ctx, TEX_W, TEX_H);
    texture.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopLoopSound = useCallback(() => loopRef.current?.stop(), []);
  useEffect(() => () => stopLoopSound(), [stopLoopSound]);
  useEffect(() => { if (!soundEnabled) stopLoopSound(); }, [soundEnabled, stopLoopSound]);

  const pushProgress = useCallback((force) => {
    const now = performance.now();
    if (!force && now - lastPushRef.current < 90) return;
    lastPushRef.current = now;
    const pct = clampPct(gridAverage(gridRef.current));
    onProgress?.(id, pct);
    if (!completedRef.current && pct >= COVERAGE_COMPLETE_THRESHOLD) {
      completedRef.current = true;
      ctxRef.current?.clearRect(0, 0, TEX_W, TEX_H);
      texture.needsUpdate = true;
      stopLoopSound();
      onProgress?.(id, 100);
      onComplete?.(id);
    }
  }, [id, onProgress, onComplete, stopLoopSound, texture]);

  const doDab = useCallback((nx, ny) => {
    const ctx = ctxRef.current;
    if (!ctx || completedRef.current) return;
    applyDab(gridRef.current, nx, ny, radius, dabAmount);
    const px = nx * TEX_W, py = ny * TEX_H;
    const r = radius * Math.min(TEX_W, TEX_H);
    const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, `rgba(0,0,0,${eraseAlpha})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    texture.needsUpdate = true;
  }, [radius, dabAmount, eraseAlpha, texture]);

  const maybePuff = useCallback((nx, ny) => {
    const now = performance.now();
    if (now - lastPuffRef.current < 130) return;
    lastPuffRef.current = now;
    sfx[puff]?.(soundRef.current);
    if (particlesEnabled && onParticle) onParticle(position, "mote");
  }, [puff, particlesEnabled, onParticle, position, orientation]);

  const stopStroke = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    stopLoopSound();
    pushProgress(true);
  }, [pushProgress, stopLoopSound]);

  // Global safety net — mirrors the 2D surface's window-level listeners so a
  // pointerup/blur that happens off this mesh still ends the stroke.
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
    if (disabled || completedRef.current || !accepts.includes(tool)) return;
    e.stopPropagation();
    try { e.target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const [nx, ny] = uvToNorm(e);
    lastPtRef.current = [nx, ny];
    activeRef.current = true;
    doDab(nx, ny);
    pushProgress(false);
    if (loopKind) loopRef.current?.start(soundRef.current);
    else maybePuff(nx, ny);
  }, [disabled, accepts, tool, doDab, pushProgress, loopKind, maybePuff]);

  const onPointerMove = useCallback((e) => {
    if (!activeRef.current) return;
    if (!accepts.includes(toolRef.current)) { stopStroke(); return; }
    if (!e.uv) return; // captured pointer moved off the plane's own geometry
    e.stopPropagation();
    const [nx, ny] = uvToNorm(e);
    const [lx, ly] = lastPtRef.current;
    const pts = lerpPoints(lx, ly, nx, ny, radius * 0.4);
    for (const [x, y] of pts) doDab(x, y);
    lastPtRef.current = [nx, ny];
    pushProgress(false);
    if (!loopKind) maybePuff(nx, ny);
  }, [accepts, radius, doDab, pushProgress, loopKind, maybePuff, stopStroke]);

  const rotation = orientation === "wall" ? [0, 0, 0] : [-Math.PI / 2, 0, 0];
  const isActiveTool = accepts.includes(tool) && !disabled && !completedRef.current;

  return (
    <group position={position}>
      {isActiveTool && isNearest && (
        <mesh rotation={rotation} position={[0, orientation === "wall" ? 0 : -0.002, orientation === "wall" ? -0.004 : 0]}>
          <planeGeometry args={[size[0] * 1.18, size[1] * 1.18]} />
          <meshBasicMaterial color="#e53935" transparent opacity={0.16} depthWrite={false} />
        </mesh>
      )}
      <mesh
        ref={meshRef}
        rotation={rotation}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopStroke}
        onPointerOut={stopStroke}
        castShadow={false}
        receiveShadow={orientation !== "wall"}
      >
        <planeGeometry args={size} />
        <meshStandardMaterial
          map={texture} transparent depthWrite={false} roughness={0.9}
          polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1}
        />
      </mesh>
      {isActiveTool && (
        <mesh rotation={rotation} position={[0, orientation === "wall" ? 0 : 0.001, orientation === "wall" ? 0.002 : 0]}>
          <planeGeometry args={[size[0] * 1.04, size[1] * 1.04]} />
          <meshBasicMaterial color={isNearest ? "#e53935" : "#ffffff"} transparent opacity={isNearest ? 0.35 : 0.12} wireframe />
        </mesh>
      )}
    </group>
  );
}

export { TEX_W, TEX_H };
