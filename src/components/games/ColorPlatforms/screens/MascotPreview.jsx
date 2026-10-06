/**
 * Small static canvas showing the mascot in all three gameplay colors for a
 * cosmetic (Colors screen). Drawn once per prop change — no loop.
 */
import { useEffect, useRef } from "react";
import { drawPlayer } from "../render/actors.js";
import { hexRgb } from "../render/palette.js";
import { BLUE, RED, YELLOW } from "../engine/constants.js";

const SYM = { [BLUE]: "circle", [RED]: "triangle", [YELLOW]: "diamond" };

export default function MascotPreview({ cosmetic, assist, locked }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = 132;
    const H = 58;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    [BLUE, RED, YELLOW].forEach((col, i) => {
      ctx.save();
      ctx.translate(26 + i * 40, 50);
      ctx.fillStyle = "rgba(5,8,25,0.3)";
      ctx.beginPath();
      ctx.ellipse(0, 1, 12, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.scale(0.95, 0.95);
      drawPlayer(ctx, {
        x: 0,
        y: 0,
        rgb: hexRgb(locked ? ["#7d86a3", "#8a8fa6", "#9a9cab"][i] : cosmetic.palette[col]),
        sx: 1,
        sy: 1,
        tilt: (i - 1) * 0.06,
        look: (i - 1) * 0.5,
        lookY: 0,
        blink: 1,
        mood: locked ? "idle" : i === 1 ? "happy" : "idle",
        foot: 0,
        run: false,
        alpha: locked ? 0.6 : 1,
        sym: assist ? SYM[col] : null,
        cos: cosmetic,
        time: i,
      });
      ctx.restore();
    });
  }, [cosmetic, assist, locked]);
  return <canvas ref={ref} className="cp-preview" style={{ width: 132, height: 58 }} aria-hidden="true" />;
}
