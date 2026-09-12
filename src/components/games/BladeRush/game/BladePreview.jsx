/**
 * Blade Rush — a single large static blade preview (Blades screen). A slow
 * shimmer along the edge is the only motion — no rotation, no throwing.
 */
import { useEffect, useRef } from "react";
import { drawBlade } from "./bladeRender.js";

export default function BladePreview({ skin }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let size = { w: 200, h: 200, dpr: 1 };

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

    const frame = (t) => {
      const { w, h, dpr } = size;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const len = Math.min(w, h) * 0.7;
      const width = len * 0.16;
      const cx = w / 2, cy = h / 2;
      const glow = Math.sin(t / 500) * 0.5 + 0.5;
      drawBlade(ctx, {
        tipX: cx, tipY: cy - len * 0.42,
        handleX: cx, handleY: cy + len * 0.58,
        width, skin, quality: "high", glow,
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [skin]);

  return (
    <div ref={wrapRef} className="br-blade-preview">
      <canvas ref={canvasRef} className="br-blade-preview__canvas" />
    </div>
  );
}
