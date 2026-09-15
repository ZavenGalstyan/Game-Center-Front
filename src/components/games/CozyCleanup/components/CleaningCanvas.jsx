/**
 * Cozy Cleanup — the generic wipeable surface. Powers dust, mop/vacuum
 * floor patches and stain scrubbing (glass has its own two-phase
 * GlassSurface, which reuses the same coverage grid underneath).
 *
 * The player's pointer stroke does two things every dab:
 *   1. paints a soft `destination-out` circle into the dirt canvas — real,
 *      immediate visual erasing, not a fake progress bar;
 *   2. nudges a small normalized coverage grid (engine/coverage.js) that
 *      the room's progress tracker reads — cheap enough to update on every
 *      pointer move without a single React re-render mid-stroke.
 *
 * Coverage completes at a forgiving threshold (COVERAGE_COMPLETE_THRESHOLD,
 * ~92%) and then sweeps the rest of the dirt away automatically — the
 * player is never stuck chasing a stray pixel in a corner.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { applyDab, createGrid, gridAverage, lerpPoints, dirtiestCells } from "../engine/coverage.js";
import { COVERAGE_COMPLETE_THRESHOLD, clampPct } from "../engine/progress.js";
import { sfx, Loop } from "../engine/sound.js";

const CANVAS_W = 480;
const CANVAS_H = 300;

export default function CleaningCanvas({
  id,
  label,
  tool,
  requiredTool,
  radius = 0.16,
  dabAmount = 0.16,
  eraseAlpha = 0.55,
  gridCols = 14,
  gridRows = 9,
  loopKind = null, // 'vacuum' | 'mop' | null
  puff = "dustPuff", // sfx key used when there's no loop sound
  soundEnabled = true,
  particlesEnabled = true,
  assist = true,
  disabled = false,
  isNearest = false,
  drawDirt,
  onProgress,
  onComplete,
  onParticle,
  style,
}) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const gridRef = useRef(null);
  if (!gridRef.current) gridRef.current = createGrid(gridCols, gridRows);
  const activeRef = useRef(false);
  const lastPtRef = useRef([0.5, 0.5]);
  const completedRef = useRef(false);
  const loopRef = useRef(null);
  if (loopKind && !loopRef.current) loopRef.current = new Loop(loopKind);
  const lastPuffRef = useRef(0);
  const lastPushRef = useRef(0);
  const rafRef = useRef(null);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const accepts = useMemo(() => (Array.isArray(requiredTool) ? requiredTool : [requiredTool]), [requiredTool]);

  // Paint the initial dirt texture once.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    ctxRef.current = ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (drawDirt) drawDirt(ctx, CANVAS_W, CANVAS_H);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopLoopSound = useCallback(() => {
    loopRef.current?.stop();
  }, []);

  useEffect(() => () => stopLoopSound(), [stopLoopSound]);
  // Mute mid-stroke must kill an in-progress loop sound immediately.
  useEffect(() => { if (!soundEnabled) stopLoopSound(); }, [soundEnabled, stopLoopSound]);

  const pushProgress = useCallback((force) => {
    const now = performance.now();
    if (!force && now - lastPushRef.current < 90) return;
    lastPushRef.current = now;
    const pct = clampPct(gridAverage(gridRef.current));
    onProgress?.(id, pct);
    if (!completedRef.current && pct >= COVERAGE_COMPLETE_THRESHOLD) {
      completedRef.current = true;
      const ctx = ctxRef.current;
      if (ctx) ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      stopLoopSound();
      onProgress?.(id, 100);
      onComplete?.(id);
    }
  }, [id, onProgress, onComplete, stopLoopSound]);

  const doDab = useCallback((nx, ny) => {
    const ctx = ctxRef.current;
    if (!ctx || completedRef.current) return;
    applyDab(gridRef.current, nx, ny, radius, dabAmount);
    const px = nx * CANVAS_W, py = ny * CANVAS_H;
    const r = radius * Math.min(CANVAS_W, CANVAS_H);
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
  }, [radius, dabAmount, eraseAlpha]);

  const getNorm = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    return [Math.max(0, Math.min(1, nx)), Math.max(0, Math.min(1, ny))];
  }, []);

  const maybePuff = useCallback((nx, ny) => {
    const now = performance.now();
    if (now - lastPuffRef.current < 130) return;
    lastPuffRef.current = now;
    sfx[puff]?.(soundRef.current);
    if (particlesEnabled && onParticle && Math.random() < 0.6) onParticle(nx * 100, ny * 100, "mote");
  }, [puff, particlesEnabled, onParticle]);

  const stopStroke = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    stopLoopSound();
    pushProgress(true);
  }, [pushProgress, stopLoopSound]);

  const onPointerDown = useCallback((e) => {
    if (disabled || completedRef.current) return;
    if (!accepts.includes(tool)) return;
    e.preventDefault();
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    activeRef.current = true;
    const [nx, ny] = getNorm(e);
    lastPtRef.current = [nx, ny];
    doDab(nx, ny);
    pushProgress(false);
    if (loopKind) loopRef.current.start(soundRef.current);
    else maybePuff(nx, ny);
  }, [disabled, accepts, tool, getNorm, doDab, pushProgress, loopKind, maybePuff]);

  const onPointerMove = useCallback((e) => {
    if (!activeRef.current) return;
    if (!accepts.includes(toolRef.current)) { stopStroke(); return; }
    e.preventDefault();
    const [nx, ny] = getNorm(e);
    const [lx, ly] = lastPtRef.current;
    const pts = lerpPoints(lx, ly, nx, ny, radius * 0.4);
    for (const [x, y] of pts) doDab(x, y);
    lastPtRef.current = [nx, ny];
    pushProgress(false);
    if (!loopKind) maybePuff(nx, ny);
  }, [accepts, getNorm, radius, doDab, pushProgress, loopKind, maybePuff, stopStroke]);

  useEffect(() => {
    const onUp = () => stopStroke();
    const onBlur = () => stopStroke();
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onBlur);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [stopStroke]);

  const isActiveTool = accepts.includes(tool) && !disabled && !completedRef.current;

  return (
    <div
      className={`cc-surface${isActiveTool ? " cc-surface--active" : ""}${completedRef.current ? " cc-surface--done" : ""}${isActiveTool && isNearest ? " cc-surface--nearest" : ""}`}
      style={style}
      title={label}
    >
      {isActiveTool && isNearest && <span className="cc-target-dot" aria-hidden="true" />}
      <canvas
        ref={canvasRef}
        className="cc-surface__canvas"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopStroke}
        onPointerCancel={stopStroke}
        onPointerLeave={stopStroke}
      />
    </div>
  );
}

export { CANVAS_W, CANVAS_H };
export function dirtiestSpots(gridLike) {
  return dirtiestCells(gridLike);
}
