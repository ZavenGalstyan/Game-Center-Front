/**
 * Blade Rush — a small STATIC blade render for grid cards (Blades screen).
 * Deliberately not animated (no rAF loop) — ten live canvases don't need to
 * be ten little animation loops; it draws once and again only on resize.
 */
import { useEffect, useRef } from "react";
import { drawBlade } from "./bladeRender.js";

export default function BladeSwatch({ skin, locked = false }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");

    const render = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const len = Math.min(w, h) * 0.72;
      const width = len * 0.15;
      const cx = w / 2, cy = h / 2;
      if (locked) ctx.globalAlpha = 0.45;
      drawBlade(ctx, {
        tipX: cx - Math.cos(-Math.PI / 5) * len * 0.42, tipY: cy - Math.sin(-Math.PI / 5) * len * 0.42,
        handleX: cx + Math.cos(-Math.PI / 5) * len * 0.58, handleY: cy + Math.sin(-Math.PI / 5) * len * 0.58,
        width, skin, quality: "medium",
      });
      ctx.globalAlpha = 1;
    };

    const ro = new ResizeObserver(render);
    ro.observe(wrap);
    render();
    return () => ro.disconnect();
  }, [skin, locked]);

  return (
    <div ref={wrapRef} className="br-blade-swatch">
      <canvas ref={canvasRef} className="br-blade-swatch__canvas" />
    </div>
  );
}
