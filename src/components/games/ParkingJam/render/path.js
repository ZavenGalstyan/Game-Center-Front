/**
 * Parking Jam — exit route geometry (world units, one cell = 100).
 *
 * The lot is ringed by a one-lane road of width ROAD. A leaving vehicle
 * drives straight out along its direction, swings through a quarter turn
 * onto the ring road's centre line, then heads along the road until it has
 * cleared the nearest lot corner. The path is sampled by arc length so the
 * car moves at a controlled speed with an ease-in.
 */
import { CELL, vehicleGeometry } from "./geometry.js";

export const ROAD = 104; // ring road width
export const TURN_R = ROAD / 2;

/** Center point + angle (deg, 0 = nose up) of a parked vehicle. */
export function parkedPose(v) {
  const w = v.orientation === "horizontal" ? v.length : 1;
  const h = v.orientation === "vertical" ? v.length : 1;
  const angle = { up: 0, right: 90, down: 180, left: 270 }[v.dir];
  return { x: (v.col + w / 2) * CELL, y: (v.row + h / 2) * CELL, angle };
}

/**
 * Build the exit route for vehicle `v` in a `rows`×`cols` lot.
 * Returns { points: [{x,y,a}], length, clearAt } where clearAt is the arc
 * length at which the whole vehicle has left the lot rectangle.
 */
export function exitRoute(v, rows, cols) {
  const W = cols * CELL;
  const H = rows * CELL;
  const start = parkedPose(v);
  const g = vehicleGeometry(v.type, v.length);
  const half = g.L / 2;
  const pts = [];
  const push = (x, y, a) => pts.push({ x, y, a });

  // Direction unit vector, and which way we turn once on the road.
  const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[v.dir];
  const vertical = v.dir === "up" || v.dir === "down";
  // Turn toward the nearer end of the edge (ties turn right-hand).
  let turnSign; // +1 = turn toward +axis (x for vertical exits, y for horizontal)
  if (vertical) turnSign = start.x <= W / 2 ? -1 : 1;
  else turnSign = start.y <= H / 2 ? -1 : 1;

  // 1. straight to the point where the arc begins (lot edge)
  const edgeCoord = v.dir === "up" ? 0 : v.dir === "down" ? H : v.dir === "left" ? 0 : W;
  const roadCenter = edgeCoord + (v.dir === "up" || v.dir === "left" ? -ROAD / 2 : ROAD / 2);
  const arcStart = roadCenter - (vertical ? d[1] : d[0]) * TURN_R;
  const a0 = start.angle;
  const steps = 10;
  if (vertical) {
    push(start.x, start.y, a0);
    push(start.x, arcStart, a0);
  } else {
    push(start.x, start.y, a0);
    push(arcStart, start.y, a0);
  }

  // 2. quarter turn
  // e.g. heading up and turning toward -x is a left (counter-clockwise) turn
  const turnDir = vertical ? (d[1] < 0 ? turnSign : -turnSign) : (d[0] > 0 ? turnSign : -turnSign);
  // turnDir: +1 = clockwise (right-hand turn) in screen space, -1 = counter-clockwise
  const a1 = a0 + 90 * turnDir;
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * (Math.PI / 2);
    let x;
    let y;
    if (vertical) {
      // centre of the turn circle sits beside the arc start
      const cx = start.x + turnSign * TURN_R;
      const cy = arcStart;
      x = cx - turnSign * TURN_R * Math.cos(t);
      y = cy + d[1] * TURN_R * Math.sin(t);
    } else {
      const cx = arcStart;
      const cy = start.y + turnSign * TURN_R;
      x = cx + d[0] * TURN_R * Math.sin(t);
      y = cy - turnSign * TURN_R * Math.cos(t);
    }
    push(x, y, a0 + (a1 - a0) * (i / steps));
  }

  // 3. along the ring road past the lot corner, plus a car length
  const last = pts[pts.length - 1];
  const beyond = 2.2 * CELL + half;
  if (vertical) {
    const endX = turnSign < 0 ? -ROAD - beyond : W + ROAD + beyond;
    push(endX, last.y, a1);
  } else {
    const endY = turnSign < 0 ? -ROAD - beyond : H + ROAD + beyond;
    push(last.x, endY, a1);
  }

  // cumulative lengths
  let length = 0;
  pts[0].s = 0;
  for (let i = 1; i < pts.length; i++) {
    length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    pts[i].s = length;
  }
  // whole car outside the lot once the nose has gone half a length + a bit past the edge
  const toEdge = Math.abs((vertical ? arcStart - start.y : arcStart - start.x));
  const clearAt = Math.min(length, toEdge + half + TURN_R * 0.9);
  return { points: pts, length, clearAt, turnAt: toEdge };
}

/** Pose at arc length s along a route. */
export function poseAt(route, s) {
  const p = route.points;
  if (s <= 0) return p[0];
  for (let i = 1; i < p.length; i++) {
    if (s <= p[i].s) {
      const t = (s - p[i - 1].s) / (p[i].s - p[i - 1].s || 1);
      return {
        x: p[i - 1].x + (p[i].x - p[i - 1].x) * t,
        y: p[i - 1].y + (p[i].y - p[i - 1].y) * t,
        a: p[i - 1].a + (p[i].a - p[i - 1].a) * t,
      };
    }
  }
  return p[p.length - 1];
}

/**
 * Exit timing: ~450–850ms scaled by distance. Speed profile = short
 * ease-in (the car pulls away), then full speed off-screen.
 */
export function exitDuration(route) {
  return Math.max(450, Math.min(850, 330 + route.length * 0.62));
}
const ACC = 0.3;
const K = 1 / (1 - ACC / 2);
export function easeExit(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < ACC ? (K * t * t) / (2 * ACC) : K * (t - ACC / 2);
}
