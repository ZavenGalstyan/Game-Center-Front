/**
 * Mini Golf Journey — the Canvas stage.
 *
 * Owns the requestAnimationFrame loop, the GolfEngine instance, pointer input
 * and the particle pool. Physics + rendering live entirely in refs so a moving
 * ball never triggers a React re-render — the parent only hears about
 * meaningful events (a stroke was taken, the ball was holed).
 *
 * Input: press anywhere on the course and drag *away* from the intended
 * direction — the ball fires opposite the drag, power scales with drag length.
 * Shots are ignored while the ball is moving or the game is paused.
 */

import { useCallback, useEffect, useRef } from "react";
import { GolfEngine } from "./engine.js";
import { drawBackdrop, drawCourse } from "./renderer.js";
import { FIELD_W, FIELD_H } from "../data/obstacles.js";
import { sfx } from "../utils/sound.js";

const MAX_DRAG = 78; // logical units for full power

export default function GolfCanvas({
  level,
  world,
  settings,
  paused,
  restartKey,
  onShots,
  onComplete,
  onAim,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const particlesRef = useRef([]);
  const viewRef = useRef({ scale: 1, ox: 0, oy: 0, w: 1, h: 1, dpr: 1 });
  const pointerRef = useRef({ id: null, aiming: false, x: 0, y: 0, dirX: 1, dirY: 0, power: 0 });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const completedRef = useRef(false);

  const spawn = useCallback((parts) => {
    particlesRef.current.push(...parts);
  }, []);

  const handleEvent = useCallback(
    (type, data) => {
      const s = settingsRef.current;
      const eng = engineRef.current;
      if (type === "putt") {
        sfx.putt(s.sound, data.power);
        onShots?.(eng.shotCount);
      } else if (type === "wall") {
        if (data.impact > 40) sfx.wall(s.sound, data.impact);
        if (s.graphics !== "low") {
          spawn(
            Array.from({ length: 3 }, () => ({
              kind: "spray",
              x: data.x,
              y: data.y,
              vx: data.nx * 20 + (Math.random() - 0.5) * 20,
              vy: data.ny * 20 + (Math.random() - 0.5) * 20,
              r: 1.2,
              life: 0.25,
              max: 0.25,
            })),
          );
        }
      } else if (type === "water") {
        sfx.water(s.sound);
        onShots?.(eng.shotCount);
        spawn(
          Array.from({ length: 14 }, (_, i) => ({
            kind: "splash",
            x: data.x,
            y: data.y,
            vx: Math.cos((i / 14) * Math.PI * 2) * (24 + Math.random() * 24),
            vy: -Math.random() * 46 - 10,
            r: 1.6,
            life: 0.5 + Math.random() * 0.2,
            max: 0.7,
            g: 150,
          })),
        );
        spawn([{ kind: "ring", x: data.x, y: data.y, r: 12, life: 0.5, max: 0.5, color: "rgba(150,210,240,0.9)" }]);
      } else if (type === "sand") {
        sfx.sand(s.sound);
      } else if (type === "portal") {
        sfx.portal(s.sound);
        spawn(
          Array.from({ length: 10 }, (_, i) => ({
            kind: "spray",
            x: data.x,
            y: data.y,
            vx: Math.cos((i / 10) * Math.PI * 2) * 30,
            vy: Math.sin((i / 10) * Math.PI * 2) * 30,
            r: 1.4,
            life: 0.4,
            max: 0.4,
            color: `hsl(${data.hue},90%,70%)`,
          })),
        );
      } else if (type === "cup") {
        sfx.cup(s.sound);
        if (!completedRef.current) {
          completedRef.current = true;
          const holeInOne = data.holeInOne;
          if (holeInOne && s.animations !== false) {
            spawn(
              Array.from({ length: 22 }, (_, i) => ({
                kind: "star",
                x: level.hole.x,
                y: level.hole.y,
                vx: Math.cos((i / 22) * Math.PI * 2) * (30 + Math.random() * 40),
                vy: Math.sin((i / 22) * Math.PI * 2) * (30 + Math.random() * 40) - 10,
                r: 2.4,
                rot: Math.random() * 6,
                life: 0.9 + Math.random() * 0.4,
                max: 1.3,
                g: 40,
                color: i % 2 ? "#ffd66b" : "#fff2c0",
              })),
            );
          }
          setTimeout(() => {
            onComplete?.({
              strokes: engineRef.current.shotCount,
              holeInOne,
            });
          }, holeInOne ? 900 : 520);
        }
      }
    },
    [level, onShots, onComplete, spawn],
  );

  // (re)build engine on level / restart
  useEffect(() => {
    completedRef.current = false;
    particlesRef.current = [];
    engineRef.current = new GolfEngine(level, handleEvent);
    onShots?.(0);
    onAim?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, restartKey]);

  // sizing
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const fit = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return; // hidden — keep last good size
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const scale = Math.min(canvas.width / FIELD_W, canvas.height / FIELD_H);
      viewRef.current = {
        scale,
        ox: (canvas.width - FIELD_W * scale) / 2,
        oy: (canvas.height - FIELD_H * scale) / 2,
        w: canvas.width,
        h: canvas.height,
        dpr,
      };
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    window.addEventListener("orientationchange", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", fit);
    };
  }, []);

  // render + physics loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;

      const eng = engineRef.current;
      const canvas = canvasRef.current;
      if (!eng || !canvas) return;
      const ctx = canvas.getContext("2d");
      const v = viewRef.current;
      const s = settingsRef.current;

      if (!pausedRef.current) {
        eng.update(dt);
        const ps = particlesRef.current;
        for (let i = ps.length - 1; i >= 0; i--) {
          const p = ps[i];
          p.life -= dt;
          p.x += (p.vx || 0) * dt;
          p.y += (p.vy || 0) * dt;
          if (p.g) p.vy += p.g * dt;
          if (p.life <= 0) ps.splice(i, 1);
        }
      }

      // aim vector from live pointer
      const pt = pointerRef.current;
      const aim = pt.aiming
        ? { active: true, dirX: pt.dirX, dirY: pt.dirY, power: pt.power }
        : null;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, v.w, v.h);
      drawBackdrop(ctx, world, v.w, v.h, eng.t, s.graphics);
      ctx.setTransform(v.scale, 0, 0, v.scale, v.ox, v.oy);
      ctx.beginPath();
      ctx.rect(0, 0, FIELD_W, FIELD_H);
      ctx.clip();
      drawCourse(ctx, {
        engine: eng,
        level,
        world,
        quality: s.graphics,
        animations: s.animations,
        aimGuide: s.aimGuide,
        aim,
        particles: particlesRef.current,
        time: eng.t,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [level, world]);

  // ---- pointer input ----
  const toLogical = (clientX, clientY) => {
    const canvas = canvasRef.current;
    const v = viewRef.current;
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / rect.width);
    const py = (clientY - rect.top) * (canvas.height / rect.height);
    return { x: (px - v.ox) / v.scale, y: (py - v.oy) / v.scale };
  };

  const updateAim = (clientX, clientY) => {
    const eng = engineRef.current;
    if (!eng) return;
    const p = toLogical(clientX, clientY);
    const b = eng.ball;
    let dx = b.x - p.x;
    let dy = b.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5) {
      dx = 1;
      dy = 0;
    }
    const power = Math.max(0.02, Math.min(1, dist / MAX_DRAG));
    const pt = pointerRef.current;
    pt.dirX = dx;
    pt.dirY = dy;
    pt.power = power;
    onAim?.({ active: true, power });
  };

  const onPointerDown = (e) => {
    const eng = engineRef.current;
    if (!eng || pausedRef.current || eng.status !== "aim") return;
    const pt = pointerRef.current;
    if (pt.id !== null) return;
    pt.id = e.pointerId;
    pt.aiming = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    updateAim(e.clientX, e.clientY);
  };
  const onPointerMove = (e) => {
    const pt = pointerRef.current;
    if (!pt.aiming || e.pointerId !== pt.id) return;
    updateAim(e.clientX, e.clientY);
  };
  const endAim = (e, fire) => {
    const pt = pointerRef.current;
    if (e.pointerId !== pt.id) return;
    const eng = engineRef.current;
    if (fire && pt.aiming && eng && eng.status === "aim") {
      eng.shoot(pt.dirX, pt.dirY, pt.power);
    }
    pt.id = null;
    pt.aiming = false;
    pt.power = 0;
    onAim?.(null);
  };

  return (
    <div className="mgj-canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="mgj-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endAim(e, true)}
        onPointerCancel={(e) => endAim(e, false)}
      />
    </div>
  );
}
