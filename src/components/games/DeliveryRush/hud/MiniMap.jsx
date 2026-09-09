/**
 * Delivery Rush — mini-map.
 *
 * North-up, whole-district, 2D canvas. The road network never changes, so it is
 * rendered once into an offscreen canvas when the district loads; each frame
 * only blits that image and draws the moving things on top. No second 3D scene,
 * no per-frame path building.
 *
 * It runs its own ~20 Hz loop reading the same mutable `live` object the game
 * loop writes to, so the mini-map costs zero React renders.
 */

import { useEffect, useRef } from "react";

const RATE = 1 / 20;

export default function MiniMap({ layout, live, theme, className = "" }) {
  const canvasRef = useRef(null);
  const baseRef = useRef(null);

  // static layer: roads, blocks, water
  useEffect(() => {
    const b = layout.playBounds;
    const w = b.maxX - b.minX;
    const h = b.maxZ - b.minZ;
    const S = 512;
    const scale = S / Math.max(w, h);
    const off = document.createElement("canvas");
    off.width = S;
    off.height = S;
    const g = off.getContext("2d");
    const px = (x) => (x - b.minX) * scale + (S - w * scale) / 2;
    const pz = (z) => (z - b.minZ) * scale + (S - h * scale) / 2;

    g.fillStyle = theme.night ? "#0d1220" : "#1a2620";
    g.fillRect(0, 0, S, S);

    // blocks first so roads read as gaps between them
    g.fillStyle = theme.night ? "#1b2438" : "#2b3a33";
    for (const wk of layout.walks) {
      g.fillRect(px(wk.x0), pz(wk.z0), (wk.x1 - wk.x0) * scale, (wk.z1 - wk.z0) * scale);
    }
    g.fillStyle = theme.night ? "#12314a" : "#1d4f6b";
    for (const s of layout.surfaces) {
      if (s.kind !== "water") continue;
      g.fillRect(px(s.x0), pz(s.z0), (s.x1 - s.x0) * scale, (s.z1 - s.z0) * scale);
    }

    g.lineCap = "round";
    for (const r of layout.roads) {
      g.strokeStyle =
        r.type === "main" ? "#7fd8c0" : r.type === "alley" ? "#41564e" : "#54756a";
      g.lineWidth = Math.max(1.6, r.w * scale * 0.85);
      g.beginPath();
      g.moveTo(px(r.ax), pz(r.az));
      g.lineTo(px(r.bx), pz(r.bz));
      g.stroke();
    }

    baseRef.current = { canvas: off, scale, px, pz, S };
  }, [layout, theme]);

  // live layer
  useEffect(() => {
    let raf = 0;
    let acc = 0;
    let last = performance.now();

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      acc += dt;
      if (acc < RATE) return;
      acc = 0;

      const cv = canvasRef.current;
      const base = baseRef.current;
      if (!cv || !base) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = cv.getBoundingClientRect();
      if (!rect.width) return;
      const w = Math.round(rect.width * dpr);
      if (cv.width !== w) {
        cv.width = w;
        cv.height = w;
      }
      const g = cv.getContext("2d");
      const k = cv.width / base.S;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(base.canvas, 0, 0, cv.width, cv.height);

      const P = (x) => base.px(x) * k;
      const Z = (z) => base.pz(z) * k;

      // traffic
      g.fillStyle = "rgba(220,230,240,0.55)";
      const cars = live.traffic || [];
      for (const c of cars) {
        g.fillRect(P(c.x) - 1.5 * k, Z(c.z) - 1.5 * k, 3 * k, 3 * k);
      }

      // target marker + guide line
      if (live.targetX != null) {
        const tx = P(live.targetX);
        const tz = Z(live.targetZ);
        g.strokeStyle = live.stage === "pickup" ? "rgba(255,181,46,0.55)" : "rgba(46,224,138,0.55)";
        g.lineWidth = 1.6 * k;
        g.setLineDash([5 * k, 4 * k]);
        g.beginPath();
        g.moveTo(P(live.x), Z(live.z));
        g.lineTo(tx, tz);
        g.stroke();
        g.setLineDash([]);

        g.fillStyle = live.stage === "pickup" ? "#ffb52e" : "#2ee08a";
        g.beginPath();
        g.arc(tx, tz, 4.4 * k, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(0,0,0,0.5)";
        g.lineWidth = 1.2 * k;
        g.stroke();
      }

      // player arrow
      const x = P(live.x);
      const z = Z(live.z);
      g.save();
      g.translate(x, z);
      g.rotate(-live.yaw + Math.PI);
      g.fillStyle = "#ffffff";
      g.strokeStyle = "rgba(0,0,0,0.55)";
      g.lineWidth = 1.2 * k;
      g.beginPath();
      g.moveTo(0, -6 * k);
      g.lineTo(4.4 * k, 5 * k);
      g.lineTo(0, 2.6 * k);
      g.lineTo(-4.4 * k, 5 * k);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [live]);

  return (
    <div className={`dr-minimap ${className}`}>
      <canvas ref={canvasRef} />
      <span className="dr-minimap__n">N</span>
    </div>
  );
}
