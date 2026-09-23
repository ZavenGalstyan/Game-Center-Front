/**
 * Car Wash Studio — camera fitting + whole-car rendering, shared by gameplay,
 * Before/After snapshots, the main menu and garage thumbnails.
 */
import { buildVehicle } from "../engine/vehicleModel.js";
import { drawVehicleBase, drawVehicleOverlay } from "./carPainter.js";
import { paintLook, hexToRgb } from "./color.js";
import { SurfaceView, drawSurfaces, makePalette } from "./surfaceRender.js";
import { getBackdrop } from "./scene.js";
import { LOCATIONS } from "../data/jobs.js";

export function lookFor(job) {
  return {
    paint: paintLook(job.paint),
    rim: job.rim,
    chrome: job.chrome,
    plate: job.plate,
    glassTint: job.location === 5 ? [16, 22, 30] : [24, 34, 46],
  };
}

export const isExterior = (v) => v === "left" || v === "right" || v === "front" || v === "rear";

/**
 * Camera for a view inside a W x H stage with HUD pads.
 * Exterior cars stand on a fixed floor line so switching sides never makes the
 * wash bay jump; side profiles fill ~75% of the stage width.
 */
export function fitCamera(model, interior, view, W, H, pads = H < 360 ? { top: 40, bottom: 70, side: 8 } : { top: 58, bottom: 96, side: 14 }) {
  const ax = pads.side;
  const ay = pads.top;
  const aw = Math.max(50, W - pads.side * 2);
  const ah = Math.max(50, H - pads.top - pads.bottom);
  const groundY = ay + ah * 0.95;
  if (view.startsWith("wheel:")) {
    const panel = model.panels[view.slice(6)];
    const w = panel.wheel;
    const s = Math.min((ah * 0.86) / (w.r * 2), (aw * 0.6) / (w.r * 2));
    return { s, ox: ax + aw / 2 - w.cx * s, oy: ay + ah / 2 - w.cy * s, groundY, base: panel.primaryView, zoom: true };
  }
  if (isExterior(view)) {
    const b = model.views[view].bbox;
    const side = view === "left" || view === "right";
    // everything stands above the ground line (y = 0), so height = -y0
    const s = Math.min((aw * (side ? 0.8 : 0.58)) / b.w, ((groundY - ay) * 0.9) / -b.y0);
    return { s, ox: ax + aw / 2 - (b.x0 + b.w / 2) * s, oy: groundY, groundY, base: view };
  }
  // interior scene 1000 x 560, kept fully clear of the tool tray / view bar
  const top = pads.top * 0.8;
  const avail = H - top - pads.bottom - 22; // view bar + tray stack is taller than the car pad
  const s = Math.min(aw / 1000, avail / 560);
  return { s, ox: W / 2 - 500 * s, oy: top + (avail - 560 * s) / 2, groundY, base: view, interior: true };
}

export function applyCam(ctx, cam, dpr) {
  ctx.setTransform(cam.s * dpr, 0, 0, cam.s * dpr, cam.ox * dpr, cam.oy * dpr);
}

/** Car with all surface overlays, in view units (camera already applied). */
export function drawCarWithSurfaces(ctx, model, view, look, surfViews, extra = {}) {
  drawVehicleBase(ctx, model, view, look, extra);
  if (surfViews) drawSurfaces(ctx, null, surfViews, model.views[view].regions);
  drawVehicleOverlay(ctx, model, view);
}

/** A finished frame of a session's view (backdrop + car + dirt) → canvas. */
export function snapshot(session, job, view, W, H, dpr = 1) {
  const c = document.createElement("canvas");
  c.width = Math.round(W * dpr);
  c.height = Math.round(H * dpr);
  const ctx = c.getContext("2d");
  const loc = LOCATIONS[job.location - 1];
  const pads = { top: 18, bottom: 14, side: 18 };
  const cam = fitCamera(session.model, null, view, W, H, pads);
  ctx.drawImage(getBackdrop(loc, W, H, cam.groundY, dpr, "medium"), 0, 0, W * dpr, H * dpr);
  const pal = makePalette(job);
  const views = new Map();
  for (const r of session.model.views[view].regions) {
    if (views.has(r.panel)) continue;
    const s = session.surfaces[r.panel];
    s.markAll();
    const sv = new SurfaceView(s);
    sv.update(pal, 1e9);
    views.set(r.panel, sv);
  }
  applyCam(ctx, cam, dpr);
  drawCarWithSurfaces(ctx, session.model, view, lookFor(job), views);
  // the dirty rect lives on the shared Surface; our private compositing just
  // consumed it, so hand it back to the live gameplay compositor
  for (const id of views.keys()) session.surfaces[id].markAll();
  return c;
}

/* ----------------------------------------------------- clean thumbnails */

const thumbCache = new Map();

export function carThumb(job, W = 260, H = 120, view = "left") {
  const key = `${job.id}|${W}|${H}|${view}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const model = buildVehicle(job.vehicle);
  const c = document.createElement("canvas");
  const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  c.width = Math.round(W * dpr);
  c.height = Math.round(H * dpr);
  const ctx = c.getContext("2d");
  const b = model.views[view].bbox;
  const s = Math.min((W * 0.9) / b.w, (H * 0.84) / b.h);
  ctx.setTransform(s * dpr, 0, 0, s * dpr, (W / 2 - (b.x0 + b.w / 2) * s) * dpr, (H * 0.93) * dpr);
  drawVehicleBase(ctx, model, view, lookFor(job));
  drawVehicleOverlay(ctx, model, view);
  const url = c.toDataURL("image/png");
  thumbCache.set(key, url);
  return url;
}

export { hexToRgb };
