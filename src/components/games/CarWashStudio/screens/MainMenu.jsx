/**
 * Car Wash Studio — main menu. A spotless car in a premium detailing bay with
 * a few quiet touches: one slow reflection sweep, a rotating rim glint, the
 * occasional water drip and a gently breathing ceiling light.
 */
import { useEffect, useRef } from "react";
import { Icon } from "../components/icons.jsx";
import { getJob, LOCATIONS, TOTAL_JOBS } from "../data/jobs.js";
import { buildVehicle } from "../engine/vehicleModel.js";
import { getBackdrop } from "../render/scene.js";
import { drawVehicleBase, drawVehicleOverlay } from "../render/carPainter.js";
import { lookFor } from "../render/viewRender.js";
import { pathOf } from "../render/paths.js";
import { totalStars, completedCount, highestCompleted } from "../utils/progress.js";

function MenuScene({ job, reduced, graphics }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const model = buildVehicle(job.vehicle);
    const look = lookFor(job);
    const sv = model.views.left;
    const loc = LOCATIONS[4];
    let raf = 0;
    let W = 0;
    let H = 0;
    let dpr = 1;
    const drips = [];
    let lastDrip = 0;
    const start = performance.now();
    let lastFrame = 0;
    const resize = () => {
      const r = canvas.parentElement.getBoundingClientRect();
      dpr = Math.min(graphics === "low" ? 1 : 1.5, window.devicePixelRatio || 1);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (now - lastFrame < 33) return; // ~30 fps is plenty for ambience
      lastFrame = now;
      const t = (now - start) / 1000;
      const groundY = H * 0.86;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(getBackdrop(loc, W, H, groundY, dpr, graphics), 0, 0, canvas.width, canvas.height);
      // breathing light
      if (!reduced) {
        const g = ctx.createRadialGradient(W * 0.62 * dpr, 0, 0, W * 0.62 * dpr, 0, W * 0.5 * dpr);
        g.addColorStop(0, `rgba(255,236,200,${0.06 + 0.03 * Math.sin(t * 0.6)})`);
        g.addColorStop(1, "rgba(255,236,200,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      const b = sv.bbox;
      const s = Math.min((W * 0.5) / b.w, (H * 0.46) / -b.y0);
      const ox = W * 0.69 - (b.x0 + b.w / 2) * s;
      ctx.setTransform(s * dpr, 0, 0, s * dpr, ox * dpr, groundY * dpr);
      // floor reflection
      ctx.save();
      ctx.scale(1, -0.35);
      ctx.globalAlpha = 0.18;
      drawVehicleBase(ctx, model, "left", look);
      ctx.restore();
      drawVehicleBase(ctx, model, "left", look, { wheelShine: reduced ? null : t * 0.7 });
      drawVehicleOverlay(ctx, model, "left");
      // slow reflection sweep across the paint
      if (!reduced) {
        const k = ((t * 0.12) % 1.4) - 0.2;
        ctx.save();
        ctx.clip(pathOf(sv.outline));
        const x = b.x0 + b.w * k;
        const g = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.5, "rgba(255,255,255,0.16)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(b.x0, b.y0, b.w, b.h);
        ctx.restore();
      }
      // occasional drip from the sill
      if (!reduced && now - lastDrip > 1800) {
        lastDrip = now;
        drips.push({ x: b.x0 + b.w * (0.25 + Math.random() * 0.5), y: sv.sill - 2, v: 0, a: 1 });
      }
      for (const d of drips) {
        d.v += 0.6;
        d.y += d.v * 0.4;
        if (d.y > -2) d.a -= 0.08;
        ctx.fillStyle = `rgba(210,232,255,${0.7 * Math.max(0, d.a)})`;
        ctx.beginPath();
        ctx.ellipse(d.x, Math.min(d.y, -1), 1.2, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      while (drips.length && drips[0].a <= 0) drips.shift();
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [job, reduced, graphics]);
  return <canvas ref={ref} className="cws-menu__scene" aria-hidden="true" />;
}

export default function MainMenu({ progress, settings, onPlay, onJobs, onGarage, onTools, onStats, onSettings }) {
  const hc = highestCompleted(progress);
  const showcase = getJob(hc > 0 ? hc : 1);
  const cur = progress.current;
  const nextId = cur ? cur.jobId : Math.min(progress.unlocked, TOTAL_JOBS);
  const next = getJob(nextId);
  return (
    <div className="cws-screen cws-menu">
      <MenuScene job={showcase} reduced={settings.reducedMotion} graphics={settings.graphics} />
      <div className="cws-menu__panel">
        <h1 className="cws-title">
          <span>CAR WASH</span>
          <b>STUDIO</b>
        </h1>
        <p className="cws-subtitle">WASH • DETAIL • SHINE</p>
        <button type="button" className="cws-btn cws-btn--primary cws-btn--big" onClick={onPlay}>
          <Icon.play /> {cur ? "CONTINUE" : "PLAY"}
        </button>
        <p className="cws-menu__next">
          {cur ? "Resume" : "Next"}: Job {String(next.id).padStart(2, "0")} · {next.name}
        </p>
        <div className="cws-menu__grid">
          <button type="button" className="cws-btn" onClick={onJobs}><Icon.list /> JOBS</button>
          <button type="button" className="cws-btn" onClick={onGarage}><Icon.car /> GARAGE</button>
          <button type="button" className="cws-btn" onClick={onTools}><Icon.wrench /> TOOLS</button>
          <button type="button" className="cws-btn" onClick={onStats}><Icon.chart /> STATISTICS</button>
          <button type="button" className="cws-btn cws-btn--wide" onClick={onSettings}><Icon.gear /> SETTINGS</button>
        </div>
        <div className="cws-menu__meta">
          <span><Icon.star on /> {totalStars(progress)} / {TOTAL_JOBS * 3}</span>
          <span><Icon.car /> {completedCount(progress)} / {TOTAL_JOBS} cars</span>
        </div>
      </div>
    </div>
  );
}
