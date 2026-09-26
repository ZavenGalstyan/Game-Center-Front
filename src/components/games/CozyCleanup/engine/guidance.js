/**
 * Cozy Cleanup — pure math for the guidance-arrow system. No React, no DOM:
 * given two points it returns a gently-arced quadratic path plus a few
 * sample points/tangent angles along it, so <GuidanceArrow> can place an
 * arrowhead and a couple of "flowing" chevrons without recomputing geometry
 * itself.
 */

/** A control point offset perpendicular to the line, for a soft arc instead of a straight rod. */
export function arcControlPoint(x1, y1, x2, y2, bendPx = null) {
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist, ny = dx / dist;
  const bend = bendPx != null ? bendPx : Math.min(70, dist * 0.28);
  return { cx: (x1 + x2) / 2 + nx * bend, cy: (y1 + y2) / 2 + ny * bend };
}

export function quadPoint(x1, y1, cx, cy, x2, y2, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
    y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2,
  };
}

export function quadTangentDeg(x1, y1, cx, cy, x2, y2, t) {
  const mt = 1 - t;
  const dx = 2 * mt * (cx - x1) + 2 * t * (x2 - cx);
  const dy = 2 * mt * (cy - y1) + 2 * t * (y2 - cy);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * Builds everything <GuidanceArrow> needs to render: the SVG path 'd',
 * the arrowhead position/angle, and a few chevron points spaced along the
 * curve (skipping the very ends so they don't crowd the tool/target).
 */
export function buildArrowGeometry(x1, y1, x2, y2, { bendPx, chevronCount = 3 } = {}) {
  const { cx, cy } = arcControlPoint(x1, y1, x2, y2, bendPx);
  const d = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  const head = { ...quadPoint(x1, y1, cx, cy, x2, y2, 0.97), angle: quadTangentDeg(x1, y1, cx, cy, x2, y2, 0.97) };
  const chevrons = [];
  for (let i = 0; i < chevronCount; i++) {
    const t = 0.22 + (i / Math.max(1, chevronCount - 1)) * 0.5;
    chevrons.push({ ...quadPoint(x1, y1, cx, cy, x2, y2, t), angle: quadTangentDeg(x1, y1, cx, cy, x2, y2, t), delay: i * 0.22 });
  }
  return { d, head, chevrons, cx, cy };
}
