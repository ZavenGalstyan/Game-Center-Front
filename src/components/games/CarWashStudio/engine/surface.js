/**
 * Car Wash Studio — surface state (pure JS, Node-importable).
 *
 * ONE Surface per panel. Its typed-array layers are the single source of
 * truth for that panel: the renderer composites them, brushes write them,
 * progress / completion / hints read them. Nothing else stores dirt.
 *
 * Layers (0..255 per mask pixel):
 *   D   dust            ML  loose mud        MS  stuck mud
 *   G   road grime      S   spots / stains   SM  glass smudge
 *   W   wetness         R   rinse exposure   F   foam
 *   FD  loosened dirt suspended in foam / slurry
 *   C   cleaner (wheel cleaner, spray bottle)
 *   P   polish          TS  tire shine
 * Static per-pixel textures: nz grain, bub foam bubbles, stk water streaks,
 * gl gloss band, lm foam lumps — they only change how state LOOKS, never the state itself.
 */
import { pointInPoly } from "./geom.js";

export const LAYERS = ["D", "ML", "MS", "G", "S", "SM", "W", "R", "F", "FD", "C", "P", "TS"];
export const STATIC = ["nz", "bub", "stk", "gl", "lm"];
/** layers that count as "dirt" for mass-based progress */
export const DIRT = ["D", "ML", "MS", "G", "S", "SM"];

/** Row crossings of a polygon with the horizontal line y (sorted). */
function crossings(poly, y, out) {
  out.length = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][1];
    const yj = poly[j][1];
    if (yi > y !== yj > y) out.push(poly[i][0] + ((y - yi) * (poly[j][0] - poly[i][0])) / (yj - yi));
  }
  out.sort((a, b) => a - b);
  return out;
}

/**
 * Rasterise a region into a per-pixel membership mask in the panel's pixel
 * space: inside every include polygon and outside every exclude polygon.
 * Region affines never rotate (scale + optional flips), so each mask row maps
 * to one view-space y and a scanline fill is exact and fast.
 */
export function rasterRegion(region, w, h) {
  const m = region.aff;
  const mask = new Uint8Array(w * h);
  const row = new Uint8Array(w);
  const xs = [];
  const fillRow = (poly, y, val) => {
    crossings(poly, y, xs);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // x = a*u + e  →  u = (x - e) / a  (pixel centers at u + 0.5)
      let u0 = (xs[k] - m.e) / m.a - 0.5;
      let u1 = (xs[k + 1] - m.e) / m.a - 0.5;
      if (u0 > u1) [u0, u1] = [u1, u0];
      const a = Math.max(0, Math.ceil(u0));
      const b = Math.min(w - 1, Math.floor(u1));
      for (let u = a; u <= b; u++) row[u] = val;
    }
  };
  const inc = new Uint8Array(w);
  for (let v = 0; v < h; v++) {
    const y = m.d * (v + 0.5) + m.f;
    inc.fill(1);
    for (const poly of region.include) {
      row.fill(0);
      fillRow(poly, y, 1);
      for (let u = 0; u < w; u++) inc[u] &= row[u];
    }
    for (const poly of region.exclude) {
      row.fill(0);
      fillRow(poly, y, 1);
      for (let u = 0; u < w; u++) if (row[u]) inc[u] = 0;
    }
    mask.set(inc, v * w);
  }
  return mask;
}

export class Surface {
  constructor(panel) {
    this.id = panel.id;
    this.panel = panel;
    this.material = panel.material;
    this.w = panel.w;
    this.h = panel.h;
    const n = (this.n = panel.w * panel.h);
    for (const k of LAYERS) this[k] = new Uint8Array(n);
    for (const k of STATIC) this[k] = new Uint8Array(n);
    this.valid = new Uint8Array(n);
    this.validCount = 0;
    this.regionMasks = new Map();
    for (const r of panel.regions) {
      const mask = rasterRegion(r, this.w, this.h);
      this.regionMasks.set(r, mask);
      for (let i = 0; i < n; i++) if (mask[i]) this.valid[i] = 1;
    }
    for (let i = 0; i < n; i++) this.validCount += this.valid[i];
    // view-space position of each pixel in the PRIMARY region (for noise)
    this.primary = panel.regions.find((r) => r.primary) || panel.regions[0];
    this.dirty = { x0: 0, y0: 0, x1: this.w, y1: this.h }; // whole panel needs compositing
    this.version = 1; // bumps on every change → metric caches know to rescan
    this.dirt0 = 0; // initial dirt mass, set by the generator
    this.stuck0 = 0;
  }

  /** view-space (primary) position of pixel center */
  posOf(u, v) {
    const m = this.primary.aff;
    return [m.a * (u + 0.5) + m.c * (v + 0.5) + m.e, m.b * (u + 0.5) + m.d * (v + 0.5) + m.f];
  }

  markDirty(x0, y0, x1, y1) {
    const d = this.dirty;
    if (!d) this.dirty = { x0, y0, x1, y1 };
    else {
      if (x0 < d.x0) d.x0 = x0;
      if (y0 < d.y0) d.y0 = y0;
      if (x1 > d.x1) d.x1 = x1;
      if (y1 > d.y1) d.y1 = y1;
    }
    this.version++;
  }

  markAll() {
    this.dirty = { x0: 0, y0: 0, x1: this.w, y1: this.h };
    this.version++;
  }
}

/** Is the view-space point inside the region shape (same rule as the raster)? */
export function regionHit(region, x, y) {
  for (const p of region.include) if (!pointInPoly(x, y, p)) return false;
  for (const p of region.exclude) if (pointInPoly(x, y, p)) return false;
  return true;
}
