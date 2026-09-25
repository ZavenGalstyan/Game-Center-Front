/**
 * Bottle Flip — the living backdrop of the main menu: one bottle on a table
 * in the cozy room that occasionally does a demonstration flip (a real throw
 * through the real physics — power 0.56 straight up is a known perfect).
 * Reduced motion: the bottle just stands there.
 */
import { useEffect, useRef } from "react";
import { finalize } from "../levels/levels.js";
import { createSession, update, launch, drainEvents } from "../game/session.js";
import { renderGame } from "../render/renderer.js";
import { createFx, updateFx, spawn } from "../render/effects.js";
import { PHYS, wrap } from "../physics/constants.js";

const DEMO = finalize({
  id: 0,
  platforms: [{ kind: "table", x: -45, w: 90, top: 70, decor: [{ kind: "plant", at: 0.12 }, { kind: "mug", at: 0.8, color: "#4f86c6" }] }],
  spawnX: 45,
  bedX: 190,
  props: [{ kind: "rug", x: -90, w: 170, color: "#d98f7a" }, { kind: "plant", x: 110, s: 1.6 }],
  bounds: { x0: -400, x1: 400 },
});

export default function MenuScene({ skin, settings }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const skinRef = useRef(skin);
  skinRef.current = skin;
  const setRef = useRef(settings);
  setRef.current = settings;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapEl = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const s = createSession(DEMO);
    const fx = createFx();
    const vis = { tilt: 0, tiltV: 0, slosh: 0, time: 0 };
    let W = 1;
    let H = 1;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();
    let nextFlip = 2.6;
    const resize = () => {
      W = Math.max(1, wrapEl.clientWidth);
      H = Math.max(1, wrapEl.clientHeight);
      dpr = Math.min(window.devicePixelRatio || 1, setRef.current.graphics === "low" ? 1 : 1.5);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapEl);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      // belt and braces next to the ResizeObserver (fullscreen, rotation)
      if (Math.max(1, wrapEl.clientWidth) !== W || Math.max(1, wrapEl.clientHeight) !== H) resize();
      const dt = Math.min(PHYS.maxFrame, Math.max(0, (now - last) / 1000));
      last = now;
      if (document.hidden) return;
      vis.time += dt;
      const reduced = setRef.current.reducedMotion;
      if (!reduced && s.state === "idle") {
        nextFlip -= dt;
        if (nextFlip <= 0) {
          launch(s, Math.PI / 2, 0.56);
          nextFlip = 6.5;
        }
      }
      update(s, dt);
      // the demo table is its own "finish" — keep it replayable
      if (s.state === "complete") {
        s.state = "idle";
        s.completeFired = false;
      }
      for (const e of drainEvents(s)) {
        if (e.type === "impact") {
          vis.slosh = Math.min(1, vis.slosh + e.speed / 600);
          vis.tiltV += 4;
        }
        if (e.type === "land") s.localX = 45; // never wander off the table
        if (e.type === "land" && e.perfect && setRef.current.particles) {
          spawn(fx, "spark", e.x, e.y + 4, 6, { a0: Math.PI * 0.1, spread: Math.PI * 0.8, speed: 60, life: 0.7, size: 1.6, color: "#ffe27a" });
        }
      }
      const b = s.body;
      const target = s.state === "flight" ? Math.max(-0.5, Math.min(0.5, -b.w * 0.03)) : -wrap(b.a) * 0.8;
      vis.tiltV += ((target - vis.tilt) * 70 - vis.tiltV * 7) * dt;
      vis.tilt = Math.max(-0.7, Math.min(0.7, vis.tilt + vis.tiltV * dt));
      vis.slosh *= Math.exp(-2.6 * dt);
      updateFx(fx, dt);
      // bottle sits right of centre; menu buttons live on the left
      const sc = Math.min(H / 150, W / 230);
      const v = { cx: -W * 0.16 / sc, cy: 58, s: sc, W, H, dpr };
      renderGame(ctx, v, s, fx, {
        skin: skinRef.current,
        tilt: vis.tilt,
        slosh: vis.slosh,
        time: vis.time,
        respawnK: 1,
        quality: setRef.current.graphics,
        settings: { ...setRef.current, shake: false },
        aim: null,
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} className="bf-menu__scene" aria-hidden="true">
      <canvas ref={canvasRef} className="bf-canvas" />
    </div>
  );
}
