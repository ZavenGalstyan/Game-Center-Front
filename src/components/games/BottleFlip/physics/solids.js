/**
 * Bottle Flip — platform collision geometry.
 *
 * A platform is data ({ id, kind, x, w, top, base?, move? }). Its kind maps to
 * a SHAPE that turns it into axis-aligned rectangles. The renderer draws every
 * kind from these same numbers (see render/furniture.js), so what you see is
 * what the bottle collides with — the landing plane is the middle of the
 * visible top face.
 *
 * Only a rect flagged `landable` can hold a successful landing, and only on
 * its TOP face.
 */

export const SHAPE_OF = {
  desk: "table",
  table: "table",
  gardenTable: "table",
  officeDesk: "table",
  bench: "table",
  bedside: "block",
  dresser: "block",
  cabinet: "block",
  books: "block",
  box: "block",
  counter: "block",
  board: "block",
  appliance: "block",
  filing: "block",
  printer: "block",
  crate: "block",
  cooler: "block",
  pedestal: "block",
  drawer: "block",
  vacuum: "block",
  cushion: "block",
  shelf: "shelf",
  ledge: "shelf",
  glass: "shelf",
  stool: "stool",
  chair: "chair",
  officeChair: "stool",
  cart: "cart",
  lift: "shelf",
};

export const SLAB = { table: 4, shelf: 3, stool: 4, chair: 4, cart: 4 };

/** Rects relative to the platform's own frame (x from p.x, y absolute). */
export function shapeRects(p) {
  const shape = SHAPE_OF[p.kind] || "block";
  const base = p.base ?? 0;
  const { x, w, top } = p;
  const r = (x0, x1, y0, y1, landable = false) => ({ x0, x1, y0, y1, landable });
  switch (shape) {
    case "table": {
      const s = SLAB.table;
      const lw = p.kind === "bench" ? 4 : 3;
      const inset = Math.min(4, w * 0.06);
      return [
        r(x, x + w, top - s, top, true),
        r(x + inset, x + inset + lw, base, top - s),
        r(x + w - inset - lw, x + w - inset, base, top - s),
      ];
    }
    case "shelf":
      return [r(x, x + w, top - SLAB.shelf, top, true)];
    case "stool": {
      const s = SLAB.stool;
      const cx = x + w / 2;
      return [r(x, x + w, top - s, top, true), r(cx - 2.5, cx + 2.5, base, top - s)];
    }
    case "chair": {
      const s = SLAB.chair;
      const back = p.back ?? "left";
      const bx = back === "left" ? x : x + w - 3;
      return [
        r(x, x + w, top - s, top, true),
        r(x + 2, x + 5, base, top - s),
        r(x + w - 5, x + w - 2, base, top - s),
        r(bx, bx + 3, top, top + (p.backH ?? 34)),
      ];
    }
    case "cart": {
      const s = SLAB.cart;
      return [
        r(x, x + w, top - s, top, true),
        r(x + 1, x + 3.5, base + 6, top - s),
        r(x + w - 3.5, x + w - 1, base + 6, top - s),
      ];
    }
    default:
      return [r(x, x + w, base, top, true)];
  }
}

/** Offset of a moving platform at time t (deterministic sine motion). */
export function moveOffset(p, t) {
  const m = p.move;
  if (!m) return { dx: 0, dy: 0, vx: 0, vy: 0 };
  const k = (Math.PI * 2) / m.period;
  const ph = k * t + (m.phase || 0) * Math.PI * 2;
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const d = m.range * s;
  const v = m.range * k * c;
  return m.axis === "y" ? { dx: 0, dy: d, vx: 0, vy: v } : { dx: d, dy: 0, vx: v, vy: 0 };
}

/**
 * Build the world's collision set once. Static rects are fixed; rects of a
 * moving platform are re-positioned every step by `placeSolids`.
 */
export function buildSolids(level) {
  const out = [];
  const all = [...level.platforms.map((p, i) => [p, i]), ...(level.supports || []).map((p) => [p, -1])];
  all.forEach(([p, index]) => {
    for (const rc of shapeRects(p)) {
      if (index < 0) rc.landable = false; // supports hold things up, never a goal
      out.push({
        ...rc,
        bx0: rc.x0,
        bx1: rc.x1,
        by0: rc.y0,
        by1: rc.y1,
        px0: rc.x0,
        px1: rc.x1,
        py0: rc.y0,
        py1: rc.y1,
        vx: 0,
        vy: 0,
        pid: p.id,
        pIndex: index,
        platform: p,
        surface: p.surface || "wood",
        moving: Boolean(p.move),
      });
    }
  });
  return out;
}

/** Position moving rects for time t, remembering where they were. */
export function placeSolids(solids, t) {
  for (const s of solids) {
    s.px0 = s.x0;
    s.px1 = s.x1;
    s.py0 = s.y0;
    s.py1 = s.y1;
    if (!s.moving) continue;
    const o = moveOffset(s.platform, t);
    s.x0 = s.bx0 + o.dx;
    s.x1 = s.bx1 + o.dx;
    s.y0 = s.by0 + o.dy;
    s.y1 = s.by1 + o.dy;
    s.vx = o.vx;
    s.vy = o.vy;
  }
}

/** Current landing top of a platform (id) at time t. */
export function platformTop(p, t) {
  const o = moveOffset(p, t);
  return { x0: p.x + o.dx, x1: p.x + p.w + o.dx, top: p.top + o.dy, vx: o.vx, vy: o.vy };
}
