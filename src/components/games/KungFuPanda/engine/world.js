/**
 * Static world queries: colliders built from level props, circle push-out,
 * bounds, a grid flow-field for navigation and the camera clearance test.
 * Pure functions — no Three.js, runs in Node.
 */

export function buildColliders(level) {
  const circles = [];
  const boxes = [];
  for (const p of level.props) {
    switch (p.t) {
      case "building":
      case "rack":
        boxes.push({ x0: p.x - p.w / 2, z0: p.z - p.d / 2, x1: p.x + p.w / 2, z1: p.z + p.d / 2, h: p.h });
        break;
      case "river": {
        // split around bridges so they stay walkable
        const bridges = level.props.filter((b) => b.t === "bridge").map((b) => [b.x - b.w / 2, b.x + b.w / 2]).sort((a, b) => a[0] - b[0]);
        let x = p.x0;
        for (const [bx0, bx1] of bridges) {
          if (bx0 > x) boxes.push({ x0: x, z0: p.z0, x1: bx0, z1: p.z1, h: 0 });
          x = Math.max(x, bx1);
        }
        if (x < p.x1) boxes.push({ x0: x, z0: p.z0, x1: p.x1, z1: p.z1, h: 0 });
        break;
      }
      case "pillar":
        circles.push({ x: p.x, z: p.z, r: p.r, h: p.h });
        break;
      case "tree":
        circles.push({ x: p.x, z: p.z, r: 0.42 * p.s, h: 4 * p.s });
        break;
      case "bamboo":
        circles.push({ x: p.x, z: p.z, r: p.r, h: 6 });
        break;
      case "rock":
        circles.push({ x: p.x, z: p.z, r: p.r * 0.92, h: p.r * 1.2 });
        break;
      case "lantern":
        circles.push({ x: p.x, z: p.z, r: 0.3, h: 2.4 });
        break;
      case "gong":
        circles.push({ x: p.x, z: p.z, r: 0.9, h: 2.6 });
        break;
      case "pond":
        circles.push({ x: p.x, z: p.z, r: p.r, h: 0 });
        break;
      case "shrine":
        boxes.push({ x0: p.x - 1.3, z0: p.z - 1, x1: p.x + 1.3, z1: p.z + 1, h: 3 });
        break;
      default:
        break;
    }
  }
  return { circles, boxes, bounds: level.bounds };
}

/** Push circle actor `a` ({x,z,r}) out of every collider and back inside bounds. */
export function resolveActor(col, a) {
  for (let iter = 0; iter < 2; iter++) {
    for (const c of col.circles) {
      const dx = a.x - c.x, dz = a.z - c.z;
      const min = c.r + a.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-5) {
        a.x = c.x + min;
        continue;
      }
      a.x = c.x + (dx / d) * min;
      a.z = c.z + (dz / d) * min;
    }
    for (const b of col.boxes) {
      const cx = Math.max(b.x0, Math.min(b.x1, a.x));
      const cz = Math.max(b.z0, Math.min(b.z1, a.z));
      const dx = a.x - cx, dz = a.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= a.r * a.r) continue;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        a.x = cx + (dx / d) * a.r;
        a.z = cz + (dz / d) * a.r;
      } else {
        // centre inside the box → leave through the nearest face
        const pen = [a.x - b.x0, b.x1 - a.x, a.z - b.z0, b.z1 - a.z];
        const i = pen.indexOf(Math.min(...pen));
        if (i === 0) a.x = b.x0 - a.r;
        else if (i === 1) a.x = b.x1 + a.r;
        else if (i === 2) a.z = b.z0 - a.r;
        else a.z = b.z1 + a.r;
      }
    }
    clampBounds(col.bounds, a, a.r);
  }
}

export function clampBounds(B, a, r) {
  if (B.type === "rect") {
    a.x = Math.max(B.x0 + r, Math.min(B.x1 - r, a.x));
    a.z = Math.max(B.z0 + r, Math.min(B.z1 - r, a.z));
  } else {
    const d = Math.hypot(a.x, a.z);
    const max = B.r - r;
    if (d > max) {
      a.x *= max / d;
      a.z *= max / d;
    }
  }
}

/** Is a point (with clearance pad) blocked? `minH` ignores colliders lower than it. */
export function blockedAt(col, x, z, pad = 0, minH = -1) {
  for (const c of col.circles) if (c.h > minH && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return true;
  for (const b of col.boxes) if (b.h > minH && x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
  const B = col.bounds;
  if (B.type === "rect") return x < B.x0 + pad || x > B.x1 - pad || z < B.z0 + pad || z > B.z1 - pad;
  return Math.hypot(x, z) > B.r - pad;
}

/* ---------------------------------------------------------------- navigation */
const CELL = 0.8;
export function buildNav(col, pad = 0.55) {
  const B = col.bounds;
  const x0 = B.type === "rect" ? B.x0 : -B.r;
  const z0 = B.type === "rect" ? B.z0 : -B.r;
  const x1 = B.type === "rect" ? B.x1 : B.r;
  const z1 = B.type === "rect" ? B.z1 : B.r;
  const W = Math.ceil((x1 - x0) / CELL);
  const H = Math.ceil((z1 - z0) / CELL);
  const blocked = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) blocked[j * W + i] = blockedAt(col, x0 + (i + 0.5) * CELL, z0 + (j + 0.5) * CELL, pad) ? 1 : 0;
  return { x0, z0, W, H, blocked, col, pad, fields: new Map() };
}
const cellOf = (nav, x, z) => {
  const i = Math.max(0, Math.min(nav.W - 1, Math.floor((x - nav.x0) / CELL)));
  const j = Math.max(0, Math.min(nav.H - 1, Math.floor((z - nav.z0) / CELL)));
  return j * nav.W + i;
};
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

/** Distance field (in cells) toward the goal; cached per goal cell. */
export function flowField(nav, gx, gz) {
  let goal = cellOf(nav, gx, gz);
  if (nav.blocked[goal]) goal = nearestOpen(nav, goal);
  const hit = nav.fields.get(goal);
  if (hit) return hit;
  const { W, H, blocked } = nav;
  const dist = new Float32Array(W * H).fill(Infinity);
  dist[goal] = 0;
  // label-correcting BFS: a cell is re-queued whenever it gets shorter
  const queue = [goal];
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi];
    const ci = c % W, cj = (c / W) | 0;
    for (const [di, dj, w] of NB) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const n = nj * W + ni;
      if (blocked[n]) continue;
      if (di && dj && (blocked[cj * W + ni] || blocked[nj * W + ci])) continue;
      const nd = dist[c] + w;
      if (nd < dist[n] - 1e-6) {
        dist[n] = nd;
        queue.push(n);
      }
    }
  }
  const f = { goal, dist };
  if (nav.fields.size > 48) nav.fields.clear();
  nav.fields.set(goal, f);
  return f;
}
function nearestOpen(nav, c) {
  const ci = c % nav.W, cj = (c / nav.W) | 0;
  for (let r = 1; r < 8; r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= nav.W || j >= nav.H) continue;
        if (!nav.blocked[j * nav.W + i]) return j * nav.W + i;
      }
  return c;
}

/** Straight-line walkability between two points (sampled). */
export function clearLine(nav, ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.ceil(d / 0.35);
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (blockedAt(nav.col, ax + (bx - ax) * t, az + (bz - az) * t, nav.pad * 0.85, -1)) return false;
  }
  return true;
}

/** Unit direction to walk from (x,z) toward the goal, or null when there. */
export function navDir(nav, x, z, gx, gz) {
  const dx = gx - x, dz = gz - z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return null;
  if (clearLine(nav, x, z, gx, gz)) return { x: dx / d, z: dz / d };
  const f = flowField(nav, gx, gz);
  const c = cellOf(nav, x, z);
  const ci = c % nav.W, cj = (c / nav.W) | 0;
  let best = -1, bd = nav.blocked[c] ? Infinity : f.dist[c];
  for (const [di, dj] of NB) {
    const ni = ci + di, nj = cj + dj;
    if (ni < 0 || nj < 0 || ni >= nav.W || nj >= nav.H) continue;
    const n = nj * nav.W + ni;
    if (nav.blocked[n]) continue;
    if (di && dj && (nav.blocked[cj * nav.W + ni] || nav.blocked[nj * nav.W + ci])) continue;
    if (f.dist[n] < bd) {
      bd = f.dist[n];
      best = n;
    }
  }
  if (best < 0) return { x: dx / d, z: dz / d };
  const tx = nav.x0 + ((best % nav.W) + 0.5) * CELL - x;
  const tz = nav.z0 + (((best / nav.W) | 0) + 0.5) * CELL - z;
  const td = Math.hypot(tx, tz) || 1;
  return { x: tx / td, z: tz / td };
}

/** Path length (m) between two points over the nav grid, Infinity if unreachable. */
export function navDistance(nav, ax, az, bx, bz) {
  const f = flowField(nav, bx, bz);
  let c = cellOf(nav, ax, az);
  if (nav.blocked[c]) c = nearestOpen(nav, c);
  return f.dist[c] * CELL;
}

/* ---------------------------------------------------------------- camera */
/**
 * How far back the camera may sit along -forward from the target before it
 * would enter a tall collider or leave the walled bounds.
 */
export function cameraClear(col, tx, ty, tz, fx, fy, fz, want) {
  const step = 0.2;
  for (let s = 0.4; s <= want; s += step) {
    const x = tx - fx * s, y = ty - fy * s, z = tz - fz * s;
    if (y < 0.35) return Math.max(0.4, s - step);
    if (col.bounds.wallH && y < col.bounds.wallH + 0.6 && blockedAt({ circles: [], boxes: [], bounds: col.bounds }, x, z, 0.35)) return Math.max(0.4, s - step);
    for (const c of col.circles) if (c.h > 0.5 && y < c.h + 0.3 && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.3) ** 2) return Math.max(0.4, s - step);
    // buildings get a wider margin: their roofs overhang the collider
    for (const b of col.boxes) if (b.h > 0.5 && y < b.h + 0.6 && x > b.x0 - 0.85 && x < b.x1 + 0.85 && z > b.z0 - 0.85 && z < b.z1 + 0.85) return Math.max(0.4, s - step);
  }
  return want;
}
