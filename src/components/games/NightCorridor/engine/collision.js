/**
 * Night Corridor — collision and line of sight on the cell grid.
 *
 * Bodies (player, creature) are circles on the X/Z plane. Each step gathers
 * the boxes in the 3x3 cells around the body — wall cells, furniture, door
 * jambs and any door panel that isn't open — and pushes the circle out of
 * each one. Circle-vs-box gives smooth sliding along walls and round
 * corners instead of the sticky per-axis clamp.
 */
import { CELL } from "./constants.js";
import { toCell, T_SOLID, T_DOOR } from "./level.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Panel box of a door that is (mostly) shut, or null when it is open enough to pass. */
export function doorPanelBox(door) {
  if (door.open > 0.6) return null;
  const t = 0.07;
  const h = CELL / 2 - 0.5;
  return door.axis === "z"
    ? { minX: door.x - h, maxX: door.x + h, minZ: door.z - t, maxZ: door.z + t }
    : { minX: door.x - t, maxX: door.x + t, minZ: door.z - h, maxZ: door.z + h };
}

/** True when the door cell's walkway is clear of a circle (used before closing). */
export function bodyInDoorway(door, x, z, r) {
  const h = CELL / 2;
  if (door.axis === "z") return Math.abs(x - door.x) < 0.5 + r && Math.abs(z - door.z) < h + r * 0.3;
  return Math.abs(z - door.z) < 0.5 + r && Math.abs(x - door.x) < h + r * 0.3;
}

export function gatherSolids(level, x, z, out) {
  out.length = 0;
  const c0 = toCell(x);
  const r0 = toCell(z);
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    for (let c = c0 - 1; c <= c0 + 1; c++) {
      if (!level.inside(c, r) || level.type[level.idx(c, r)] === T_SOLID) {
        out.push({ minX: c * CELL, maxX: (c + 1) * CELL, minZ: r * CELL, maxZ: (r + 1) * CELL });
        continue;
      }
      const k = level.idx(c, r);
      const list = level.cellSolids.get(k);
      if (list) for (const b of list) out.push(b);
      if (level.type[k] === T_DOOR) {
        const pb = doorPanelBox(level.doorAtCell.get(k));
        if (pb) out.push(pb);
      }
    }
  }
  return out;
}

/** Pushes `pos` ({x,z}) out of every box. Returns true if anything was hit. */
export function resolveCircle(pos, radius, boxes) {
  let hit = false;
  for (let iter = 0; iter < 3; iter++) {
    let any = false;
    for (const b of boxes) {
      const qx = clamp(pos.x, b.minX, b.maxX);
      const qz = clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - qx;
      const dz = pos.z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      any = true;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        const push = radius - d + 1e-4;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      } else {
        // Centre inside the box: leave by the shallowest face.
        const left = pos.x - b.minX;
        const right = b.maxX - pos.x;
        const top = pos.z - b.minZ;
        const bottom = b.maxZ - pos.z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = b.minX - radius;
        else if (m === right) pos.x = b.maxX + radius;
        else if (m === top) pos.z = b.minZ - radius;
        else pos.z = b.maxZ + radius;
      }
    }
    if (!any) break;
    hit = true;
  }
  return hit;
}

const scratch = [];
/** Moves a circle body by (dx, dz) with collision; sub-steps long moves. */
export function moveBody(level, body, radius, dx, dz) {
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / (radius * 0.5)));
  let hit = false;
  for (let i = 0; i < steps; i++) {
    body.x += dx / steps;
    body.z += dz / steps;
    gatherSolids(level, body.x, body.z, scratch);
    if (resolveCircle(body, radius, scratch)) hit = true;
  }
  return hit;
}

/** Cells along a segment are open (walls and shut doors block sight). */
export function lineOfSight(level, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(len / 0.3));
  for (let i = 1; i < n; i++) {
    const x = x1 + (dx * i) / n;
    const z = z1 + (dz * i) / n;
    const c = toCell(x);
    const r = toCell(z);
    if (!level.inside(c, r)) return false;
    const k = level.idx(c, r);
    const t = level.type[k];
    if (t === T_SOLID) return false;
    if (level.opaque && level.opaque.has(k)) return false;
    if (t === T_DOOR) {
      const d = level.doorAtCell.get(k);
      if (d.open < 0.5) return false;
    }
  }
  return true;
}

export function pointBlocked(level, x, z, radius) {
  gatherSolids(level, x, z, scratch);
  for (const b of scratch) {
    const qx = clamp(x, b.minX, b.maxX);
    const qz = clamp(z, b.minZ, b.maxZ);
    if ((x - qx) ** 2 + (z - qz) ** 2 < radius * radius) return true;
  }
  return false;
}
