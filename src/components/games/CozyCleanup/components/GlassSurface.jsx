/**
 * Cozy Cleanup — the two-phase glass surface: spray, then cloth. Spraying
 * lays down droplet marks and doesn't clean anything by itself; only once
 * enough of the pane has been sprayed does wiping with the cloth start
 * clearing the grime (and the droplets with it), revealing the window art
 * underneath. Finishing sweeps in a small sparkle.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { applyDab, createGrid, gridAverage, lerpPoints } from "../engine/coverage.js";
import { COVERAGE_COMPLETE_THRESHOLD, clampPct } from "../engine/progress.js";
import { sfx } from "../engine/sound.js";

const W = 480, H = 300;
const SPRAY_READY = 32;

export default function GlassSurface({ id, tool, soundEnabled = true, particlesEnabled = true, disabled = false, isNearest = false, onProgress, onComplete, onParticle, style }) {
  const grimeRef = useRef(null);
  const dropRef = useRef(null);
  const grimeCtx = useRef(null);
  const dropCtx = useRef(null);
  const sprayGrid = useRef(createGrid(12, 8));
  const wipeGrid = useRef(createGrid(12, 8));
  const activeRef = useRef(false);
  const lastPt = useRef([0.5, 0.5]);
  const completedRef = useRef(false);
  const lastPuff = useRef(0);
  const [sprayReady, setSprayReady] = useState(false);

  useEffect(() => {
    const g = grimeRef.current, d = dropRef.current;
    g.width = W; g.height = H; d.width = W; d.height = H;
    const gctx = g.getContext("2d");
    grimeCtx.current = gctx;
    dropCtx.current = d.getContext("2d");
    gctx.fillStyle = "rgba(180,190,175,0.5)";
    gctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      gctx.fillStyle = `rgba(150,160,145,${0.06 + Math.random() * 0.1})`;
      const r = 10 + Math.random() * 26;
      gctx.beginPath();
      gctx.arc(Math.random() * W, Math.random() * H, r, 0, Math.PI * 2);
      gctx.fill();
    }
  }, []);

  const getNorm = useCallback((canvas, e) => {
    const rect = canvas.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))];
  }, []);

  const pushProgress = useCallback(() => {
    const wipePct = clampPct(gridAverage(wipeGrid.current));
    onProgress?.(id, wipePct);
    if (!completedRef.current && wipePct >= COVERAGE_COMPLETE_THRESHOLD) {
      completedRef.current = true;
      grimeCtx.current.clearRect(0, 0, W, H);
      dropCtx.current.clearRect(0, 0, W, H);
      onProgress?.(id, 100);
      onComplete?.(id);
    }
  }, [id, onProgress, onComplete]);

  const doSpray = useCallback((nx, ny) => {
    applyDab(sprayGrid.current, nx, ny, 0.1, 0.22);
    const ctx = dropCtx.current;
    const px = nx * W, py = ny * H;
    for (let i = 0; i < 3; i++) {
      const ox = (Math.random() - 0.5) * 28, oy = (Math.random() - 0.5) * 28;
      ctx.fillStyle = "rgba(206,232,235,0.55)";
      ctx.beginPath();
      ctx.arc(px + ox, py + oy, 2.4 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const ready = gridAverage(sprayGrid.current) >= SPRAY_READY;
    setSprayReady((prev) => (prev !== ready ? ready : prev));
  }, []);

  const doWipe = useCallback((nx, ny) => {
    if (gridAverage(sprayGrid.current) < SPRAY_READY) return;
    applyDab(wipeGrid.current, nx, ny, 0.15, 0.16);
    const px = nx * W, py = ny * H;
    const r = 0.15 * Math.min(W, H);
    for (const ctx of [grimeCtx.current, dropCtx.current]) {
      const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, "rgba(0,0,0,0.6)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }, []);

  const stopStroke = useCallback(() => { activeRef.current = false; pushProgress(); }, [pushProgress]);

  const onPointerDown = useCallback((e) => {
    if (disabled || completedRef.current || (tool !== "spray" && tool !== "cloth")) return;
    e.preventDefault();
    try { e.target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    activeRef.current = true;
    const [nx, ny] = getNorm(e.target, e);
    lastPt.current = [nx, ny];
    if (tool === "spray") { doSpray(nx, ny); sfx.spray(soundEnabled); }
    else { doWipe(nx, ny); sfx.clothWipe(soundEnabled); }
    pushProgress();
  }, [disabled, tool, getNorm, doSpray, doWipe, soundEnabled, pushProgress]);

  const onPointerMove = useCallback((e) => {
    if (!activeRef.current) return;
    e.preventDefault();
    const [nx, ny] = getNorm(e.target, e);
    const [lx, ly] = lastPt.current;
    const pts = lerpPoints(lx, ly, nx, ny, 0.05);
    const now = performance.now();
    for (const [x, y] of pts) (tool === "spray" ? doSpray : doWipe)(x, y);
    if (now - lastPuff.current > 130) {
      lastPuff.current = now;
      sfx[tool === "spray" ? "spray" : "clothWipe"](soundEnabled);
      if (particlesEnabled && onParticle && Math.random() < 0.5) onParticle(nx * 100, ny * 100, "mote");
    }
    lastPt.current = [nx, ny];
    pushProgress();
  }, [tool, getNorm, doSpray, doWipe, soundEnabled, particlesEnabled, onParticle, pushProgress]);

  useEffect(() => {
    const onUp = () => stopStroke();
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onUp);
    };
  }, [stopStroke]);

  const isActiveTool = tool === "spray" || tool === "cloth";
  return (
    <div className={`cc-surface cc-surface--glass${isActiveTool ? " cc-surface--active" : ""}${isActiveTool && isNearest ? " cc-surface--nearest" : ""}`} style={style}>
      {isActiveTool && isNearest && <span className="cc-target-dot" aria-hidden="true" />}
      <canvas ref={grimeRef} className="cc-surface__canvas" style={{ touchAction: "none" }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopStroke} onPointerCancel={stopStroke} onPointerLeave={stopStroke} />
      <canvas ref={dropRef} className="cc-surface__canvas cc-surface__canvas--top" style={{ touchAction: "none", pointerEvents: "none" }} />
      {sprayReady && tool === "cloth" && <div className="cc-glass-ready" aria-hidden="true" />}
    </div>
  );
}
