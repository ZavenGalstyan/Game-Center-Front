/**
 * Boxing Club — the dim gym behind the menus: brick wall, windows, posters
 * and heavy bags (from the arena renderer), a plank floor and the corner of
 * a ring. Painted once per size / venue (it's static), so menus cost nothing.
 */
import { memo, useEffect, useRef } from "react";
import { drawBackdrop, worldToScreen, RING } from "../render/arena.js";
import { arenaById } from "../data/arenas.js";

function GymBackdrop({ venue = "gym", detail = "medium", ring = true }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const arena = arenaById(venue);
    const paint = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.max(1, Math.round(r.width));
      const H = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const S = H / 3.4;
      const cam = { S, cx: W / 2, floorY: H * 0.78, camX: 0 };
      drawBackdrop(ctx, cam, W, H, arena, 0, { excite: 0, detail, reduced: true, flashes: [] });
      // plank floor
      const fy = H * 0.66;
      const g = ctx.createLinearGradient(0, fy, 0, H);
      g.addColorStop(0, "#4a2f1e");
      g.addColorStop(1, "#1f140d");
      ctx.fillStyle = g;
      ctx.fillRect(0, fy, W, H - fy);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        const y = fy + (H - fy) * ((i + 1) / 9) ** 1.4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      // corner of the ring on the right
      if (ring) {
        const c2 = { ...cam, cx: W * 1.02, camX: 0 };
        ctx.save();
        const p = worldToScreen(c2, -RING.edge, 0, 0.4);
        const t = worldToScreen(c2, -RING.edge, RING.postH, 0.4);
        ctx.fillStyle = "#b9bec4";
        ctx.fillRect(p.x - 5, t.y, 10, p.y - t.y);
        ctx.fillStyle = arena.cornerRed;
        ctx.fillRect(p.x - 12, t.y + 10, 24, (p.y - t.y) * 0.62);
        ctx.strokeStyle = arena.rope;
        ctx.lineWidth = 5;
        for (const h of RING.ropes) {
          const a = worldToScreen(c2, -RING.edge, h, 0.4);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(a.x + 120, a.y + 10, W + 10, a.y - 30);
          ctx.stroke();
        }
        ctx.restore();
      }
      // vignette + warm light pool
      const v = ctx.createRadialGradient(W * 0.3, H * 0.55, H * 0.1, W * 0.3, H * 0.55, W * 0.8);
      v.addColorStop(0, "rgba(255,200,130,0.12)");
      v.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [venue, detail, ring]);
  return <canvas ref={ref} className="bc-backdrop" aria-hidden="true" />;
}

export default memo(GymBackdrop);
