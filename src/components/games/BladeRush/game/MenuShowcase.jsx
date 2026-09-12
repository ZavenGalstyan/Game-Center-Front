/**
 * Blade Rush — the slow-spinning showcase target on the Main Menu. Its own
 * tiny rAF loop (not the gameplay engine — there's no throwing here), kept
 * deliberately subtle: slow constant rotation, a handful of fixed embedded
 * blades, an occasional highlight sweep. Never auto-throws.
 */
import { useEffect, useRef } from "react";
import { drawTarget } from "./targetRender.js";
import { drawBlade, bladeGeometry, HANDLE_STICK_RATIO } from "./bladeRender.js";
import { targetById } from "../data/targets.js";

const SHOWCASE_ANGLES = [0.4, 1.7, 3.1, 4.4, 5.4];
// Long handles stick out ~HANDLE_STICK_RATIO past the rim — size the target so
// the full knife silhouette stays inside the showcase, never clipped.
const SHOWCASE_RADIUS_FRACTION = 0.46 / (1 + HANDLE_STICK_RATIO);

export default function MenuShowcase({ targetId, skin }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let rotation = 0;
    let last = performance.now();
    let size = { w: 300, h: 300, dpr: 1 };

    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      size = { w, h, dpr };
    });
    ro.observe(wrap);

    const target = targetById(targetId);

    const frame = (t) => {
      const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
      last = t;
      rotation += dt * 0.6;

      const { w, h, dpr } = size;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const radius = Math.min(w, h) * SHOWCASE_RADIUS_FRACTION;
      const geo = bladeGeometry(radius);
      const glowPulse = Math.sin(t / 900) * 0.5 + 0.5;

      drawTarget(ctx, { x: cx, y: cy, radius, rotation, target, damage: 0.25, glowPulse, quality: "high" });
      for (const a0 of SHOWCASE_ANGLES) {
        const a = rotation + a0;
        const tipX = cx + Math.cos(a) * (radius - geo.insertDepth);
        const tipY = cy + Math.sin(a) * (radius - geo.insertDepth);
        const handleX = cx + Math.cos(a) * (radius + geo.handleStick);
        const handleY = cy + Math.sin(a) * (radius + geo.handleStick);
        drawBlade(ctx, { tipX, tipY, handleX, handleY, width: geo.width, skin, quality: "high" });
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [targetId, skin]);

  return (
    <div ref={wrapRef} className="br-showcase">
      <canvas ref={canvasRef} className="br-showcase__canvas" />
    </div>
  );
}
