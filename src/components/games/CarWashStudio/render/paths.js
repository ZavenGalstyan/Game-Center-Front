/** Car Wash Studio — polygon → Path2D, cached per polygon array. */

const cache = new WeakMap();

export function pathOf(poly) {
  let p = cache.get(poly);
  if (!p) {
    p = new Path2D();
    p.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) p.lineTo(poly[i][0], poly[i][1]);
    p.closePath();
    cache.set(poly, p);
  }
  return p;
}

export function linePath(pts) {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  return p;
}

/** Clip the context to include-polys (intersection) minus exclude-polys. */
export function clipRegion(ctx, region) {
  for (const poly of region.include) ctx.clip(pathOf(poly));
  // one even-odd clip per excluded polygon — excluded shapes may overlap each
  // other, and a single combined even-odd path would re-include the overlap
  if (region.exclude) {
    for (const poly of region.exclude) {
      const ex = new Path2D();
      ex.rect(-1e5, -1e5, 2e5, 2e5);
      ex.addPath(pathOf(poly));
      ctx.clip(ex, "evenodd");
    }
  }
}
