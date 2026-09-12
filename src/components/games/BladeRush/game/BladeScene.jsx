/**
 * Blade Rush — the one game loop. A single requestAnimationFrame drives
 * BladeEngine.update(dt) and then draws everything to one canvas. React
 * state is touched only through `onHud` (fired on discrete engine events,
 * never per frame) and `onEvent` (sound/stats hooks) — the 60fps path never
 * calls setState.
 */
import { useEffect, useRef } from "react";
import { BladeEngine } from "../systems/engine.js";
import { worldAngleOf, IMPACT_WORLD_ANGLE } from "../systems/collisionSystem.js";
import { drawTarget } from "./targetRender.js";
import { drawBlade, bladeGeometry, HANDLE_STICK_RATIO } from "./bladeRender.js";
import { drawParticles, drawFragments, drawShard } from "./fxRender.js";
import { targetById } from "../data/targets.js";
import { NEUTRAL_BLADE } from "../data/blades.js";

function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

const HUD_TOP_CLEARANCE = 64; // keep the target (+ its handle-stick blades) clear of the top HUD row
const MAX_VISUAL_EXTENT = 1 + HANDLE_STICK_RATIO; // rim + longest blade handle, as a multiple of radius

function layoutFor(width, height, scale) {
  const cx = width * 0.5;
  const cy = height * 0.4;
  const baseRadius = Math.max(36, Math.min(width * 0.44, height * 0.34)) * scale;
  // Boss targets scale up to 1.34x, and an embedded blade's handle now sticks
  // out much farther past the rim (longer knives) — never let that
  // combination push under the stage/phase HUD at the top.
  const radius = Math.min(baseRadius, Math.max(26, (cy - HUD_TOP_CLEARANCE) / MAX_VISUAL_EXTENT));
  const homeX = cx;
  const homeY = height * 0.87;
  return { cx, cy, radius, homeX, homeY };
}

export default function BladeScene({ stage, skin, settings, runNonce, onHud, onEvent }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const engineRef = useRef(null);
  const sizeRef = useRef({ w: 300, h: 300, dpr: 1 });
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const pausedRef = useRef(false);
  const flashRef = useRef(0);

  const target = targetById(stage.target);

  /* -------------------------------------------------------------- engine */
  useEffect(() => {
    const engine = new BladeEngine(stage, {
      onEvent: (type, payload) => {
        onEvent?.(type, payload);
        onHud?.(snapshot(engine));
      },
    });
    engineRef.current = engine;
    onHud?.(snapshot(engine));
    flashRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.id, runNonce]);

  /* --------------------------------------------------------------- input */
  useEffect(() => {
    const throwBlade = () => {
      const engine = engineRef.current;
      if (engine?.throw()) onEvent?.("throw-input", {});
    };
    const onKey = (e) => {
      if (e.code === "Space") { e.preventDefault(); throwBlade(); }
    };
    const onPointer = (e) => { e.preventDefault(); throwBlade(); };
    const el = wrapRef.current;
    window.addEventListener("keydown", onKey);
    el?.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      el?.removeEventListener("pointerdown", onPointer);
    };
  }, [onEvent]);

  /* ------------------------------------------------------------- resize */
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      sizeRef.current = { w, h, dpr };
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  /* ---------------------------------------------------------- visibility */
  useEffect(() => {
    const onVis = () => {
      pausedRef.current = document.hidden;
      if (!document.hidden) lastRef.current = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  /* ------------------------------------------------------------ the loop */
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    lastRef.current = performance.now();

    const frame = (t) => {
      const dt = Math.min(0.05, Math.max(0, (t - lastRef.current) / 1000));
      lastRef.current = t;
      const engine = engineRef.current;
      if (engine && !pausedRef.current) {
        const prevStatus = engine.status;
        engine.update(dt);
        if (prevStatus === "breaking" && engine.breakT < 0.12) flashRef.current = 1;
      }
      flashRef.current = Math.max(0, flashRef.current - dt * 3.2);
      draw(ctx, engine, sizeRef.current, target, skin, settings, flashRef.current);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, skin, settings]);

  return (
    <div ref={wrapRef} className="br-scene" aria-label="Blade Rush gameplay area" role="button" tabIndex={-1}>
      <canvas ref={canvasRef} className="br-scene__canvas" />
    </div>
  );
}

function snapshot(engine) {
  return {
    status: engine.status,
    phase: engine.phase,
    phaseCount: engine.phaseCount,
    thrownInPhase: engine.thrownInPhase,
    requiredBlades: engine.requiredBlades,
    totalThrown: engine.totalThrown,
    totalRequired: engine.totalRequired,
    shardsCollected: engine.shardsCollected,
    shardsTotal: engine.shardsTotal,
    streak: engine.streak,
    score: engine.score,
    isBoss: engine.isBoss,
  };
}

function draw(ctx, engine, size, target, skin, settings, flash) {
  const { w, h, dpr } = size;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!engine) { ctx.restore(); return; }

  const quality = settings.graphics;
  const shakeOn = settings.screenShake;
  const { cx, cy, radius, homeX, homeY } = layoutFor(w, h, target.scale || 1);
  const geo = bladeGeometry(radius);

  const shakeMag = engine.shake * (shakeOn ? 1 : 0);
  const sx = shakeMag > 0 ? (Math.random() - 0.5) * shakeMag * 14 : 0;
  const sy = shakeMag > 0 ? (Math.random() - 0.5) * shakeMag * 10 : 0;
  ctx.save();
  ctx.translate(sx, sy);

  const glowPulse = Math.sin(engine.elapsed * 3) * 0.5 + 0.5;
  const damage = engine.totalRequired > 0 ? engine.totalThrown / engine.totalRequired : 0;
  const showTarget = engine.status !== "complete";

  if (showTarget) {
    drawTarget(ctx, {
      x: cx, y: cy, radius, rotation: engine.rotState.rotation,
      target, damage, glowPulse, hitPulse: engine.pulse, quality,
    });

    // golden shards, still attached to the target
    for (const s of engine.shards) {
      const a = worldAngleOf(s.angle, engine.rotState.rotation);
      const px = cx + Math.cos(a) * radius * 0.86;
      const py = cy + Math.sin(a) * radius * 0.86;
      drawShard(ctx, px, py, engine.elapsed, s.collected, target.glow || "#ffd76a");
    }

    // embedded blades rotate WITH the target — angle stored once, world pos derived every frame.
    // Blades the stage started with render in a neutral obstacle steel, never the
    // player's cosmetic, so "mine" vs "already there" reads at a glance.
    for (const b of engine.embedded) {
      const a = worldAngleOf(b.angle, engine.rotState.rotation);
      const tipX = cx + Math.cos(a) * (radius - geo.insertDepth);
      const tipY = cy + Math.sin(a) * (radius - geo.insertDepth);
      const handleX = cx + Math.cos(a) * (radius + geo.handleStick);
      const handleY = cy + Math.sin(a) * (radius + geo.handleStick);
      const bladeSkin = b.preExisting ? NEUTRAL_BLADE : skin;
      drawBlade(ctx, { tipX, tipY, handleX, handleY, width: geo.width, skin: bladeSkin, quality });
    }
  }

  // fragments (post-break)
  if (engine.fragments.length) drawFragments(ctx, engine.fragments, cx, cy, radius, target);

  // impact/deflect particles
  if (engine.particles.length) {
    const pMax = settings.particles === "low" ? Math.min(engine.particles.length, 10) : engine.particles.length;
    drawParticles(ctx, engine.particles.slice(0, pMax), cx, cy, engine.stage.material, settings.particles);
  }

  // waiting blade
  if (engine.status === "ready") {
    const totalLen = geo.insertDepth + geo.handleStick;
    drawBlade(ctx, { tipX: homeX, tipY: homeY - totalLen * 0.15, handleX: homeX, handleY: homeY + totalLen * 0.85, width: geo.width, skin, quality });
  }

  // flying / deflecting blade
  if (engine.status === "throwing" || engine.status === "fail-anim") {
    const tb = engine.thrownBlade;
    const totalLen = geo.insertDepth + geo.handleStick;
    let tipX, tipY, angle;
    if (engine.status === "throwing") {
      const p = easeOutQuad(Math.min(1, tb.t / tb.duration));
      const impactX = cx + Math.cos(IMPACT_WORLD_ANGLE) * radius;
      const impactY = cy + Math.sin(IMPACT_WORLD_ANGLE) * radius;
      tipX = homeX + (impactX - homeX) * p;
      tipY = homeY + (impactY - homeY) * p;
      angle = -Math.PI / 2;
    } else {
      const p = Math.min(1, engine.failT / 0.55);
      const a = tb.failWorldAngle;
      const startX = cx + Math.cos(IMPACT_WORLD_ANGLE) * radius;
      const startY = cy + Math.sin(IMPACT_WORLD_ANGLE) * radius;
      const deflectX = Math.cos(a) * (60 + p * 140);
      const deflectY = Math.sin(a) * 30 + p * 220;
      tipX = startX + deflectX * p;
      tipY = startY + deflectY;
      angle = -Math.PI / 2 + p * 2.4;
    }
    const dx = Math.cos(angle), dy = Math.sin(angle);
    drawBlade(ctx, {
      tipX: tipX - dx * totalLen * 0.15, tipY: tipY - dy * totalLen * 0.15,
      handleX: tipX + dx * totalLen * 0.85, handleY: tipY + dy * totalLen * 0.85,
      width: geo.width, skin, quality,
    });
  }

  ctx.restore(); // shake

  if (flash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.55, flash * 0.55);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  ctx.restore();
}
