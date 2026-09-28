/**
 * Boxing Club — a fighter drawn with the real rig + painter, outside a
 * fight (menus, posters, the Fighter screen). `animate` runs a light idle
 * loop (bounce, breathing, occasional shadow-boxing jab); otherwise it paints
 * once. The canvas follows its box size; the loop stops on unmount.
 */
import { memo, useEffect, useRef } from "react";
import { createFighter } from "../engine/fighter.js";
import { ATTACKS } from "../engine/attacks.js";
import { computePose, createAnim, updateAnim } from "../render/rig.js";
import { drawFighter, drawShadow } from "../render/fighterArt.js";

function FighterCanvas({ look, facing = 1, animate = false, crop = "full", pose = null, className = "", shadow = true, punches = false }) {
  const ref = useRef(null);
  const lookRef = useRef(look);
  lookRef.current = look;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const f = createFighter({ id: "v", side: "player", name: "", x: 0, facing });
    const anim = createAnim(f);
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let nextJab = 1800;
    let alive = true;
    const draw = (dt) => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.max(1, Math.round(r.width));
      const H = Math.max(1, Math.round(r.height));
      if (canvas.width !== Math.round(W * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // shadow-boxing: a jab/cross now and then (just the animation)
      if (punches && animate) {
        nextJab -= dt;
        if (nextJab <= 0 && f.state === "neutral") {
          const id = Math.random() < 0.6 ? "jab" : "cross";
          const def = ATTACKS[id];
          f.state = "attack";
          f.attack = { id, def, t: 0, su: def.startup, ac: def.active, rc: def.recovery, extra: 0, resolved: true, hit: false, blocked: false, whiff: true };
          nextJab = 1400 + Math.random() * 2200;
        }
        if (f.state === "attack") {
          f.attack.t += dt;
          if (f.attack.t > f.attack.su + f.attack.ac + f.attack.rc) {
            f.state = "neutral";
            f.attack = null;
          }
        }
      }
      f.breath += dt / 1000;
      t += dt / 1000;
      updateAnim(anim, f, dt, false);
      const bust = crop === "bust";
      const S = bust ? H / 0.95 : H / 2.25;
      const cam = { S, cx: W / 2 + (bust ? -0.12 * S * facing : 0), floorY: bust ? H + 1.02 * S : H - 0.12 * S, camX: 0 };
      const ps = computePose(f, anim, 1.6, animate ? t : 0.4, { build: lookRef.current.build, pose });
      if (shadow && !bust) drawShadow(ctx, cam, f, ps, 0.8);
      drawFighter(ctx, cam, f, ps, lookRef.current, { lowDetail: false });
    };
    const loop = (now) => {
      if (!alive) return;
      const dt = Math.min(50, now - last);
      last = now;
      draw(dt);
      raf = requestAnimationFrame(loop);
    };
    if (animate) raf = requestAnimationFrame(loop);
    else draw(16);
    const ro = animate ? null : new ResizeObserver(() => draw(0));
    ro?.observe(canvas);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
    // repaint when the look changes (static canvases)
  }, [facing, animate, crop, pose, punches, animate ? null : JSON.stringify(look)]);
  return <canvas ref={ref} className={`bc-figure ${className}`} aria-hidden="true" />;
}

export default memo(FighterCanvas);
