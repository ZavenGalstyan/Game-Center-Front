/**
 * Mini Golf Journey — obstacle & hazard vocabulary.
 *
 * These helpers normalise the terse level authoring format (arrays / small
 * objects in levels.js) into the shapes the engine consumes. Keeping the
 * normalisation here means levels.js stays readable and the engine never has
 * to guess at defaults.
 *
 * Logical play field is 320 × 180 units. The engine adds the four perimeter
 * walls itself from PLAY_BOUNDS — levels only describe what's inside.
 */

export const FIELD_W = 320;
export const FIELD_H = 180;

// inner face of the perimeter frame
export const PLAY_BOUNDS = { x: 14, y: 14, w: 292, h: 152 };

export const BALL_RADIUS = 3.15;
export const CUP_RADIUS = 5.4;

export const TERRAIN = {
  grass: { friction: 1.7, label: "Grass" },
  sand: { friction: 7.4, label: "Sand" },
  ice: { friction: 0.42, label: "Ice" },
  snow: { friction: 10.5, label: "Snow" },
  fairway: { friction: 1.7, label: "Fairway" },
};

export function normHazard(h) {
  // ['sand', x, y, w, h]           → rectangle
  // ['water', cx, cy, r]           → circle  (4 entries)
  if (Array.isArray(h)) {
    if (h.length === 4) {
      return { kind: h[0], shape: "circle", cx: h[1], cy: h[2], r: h[3] };
    }
    return { kind: h[0], shape: "rect", x: h[1], y: h[2], w: h[3], h: h[4], round: 6 };
  }
  return { shape: "rect", round: 6, ...h };
}

export function normObstacle(o) {
  const base = { w: 5, ...o };
  switch (o.o) {
    case "box":
      return { type: "box", x: o.x, y: o.y, w: o.w, h: o.h, a: o.a || 0 };
    case "spinner":
      return {
        type: "spinner",
        x: o.x,
        y: o.y,
        len: o.len,
        w: o.w || 5,
        speed: o.speed ?? 1.6, // rad / s
        phase: o.phase || 0,
      };
    case "gate":
    case "barrier":
      return {
        type: "gate",
        x: o.x,
        y: o.y,
        len: o.len,
        w: o.w || 5,
        axis: o.axis || "y",
        travel: o.travel ?? 60,
        period: o.period ?? 3,
        phase: o.phase || 0,
      };
    case "conveyor":
      return {
        type: "conveyor",
        x: o.x,
        y: o.y,
        w: o.w,
        h: o.h,
        dx: o.dx || 0,
        dy: o.dy || 0,
        force: o.force ?? 150,
      };
    default:
      return { type: "box", x: o.x, y: o.y, w: o.w || 10, h: o.h || 10, a: 0 };
  }
}
