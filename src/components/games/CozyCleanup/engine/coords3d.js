/**
 * Cozy Cleanup — 2D-room-data → 3D-world-space conversion.
 *
 * The 3D renderer deliberately does NOT require a rewrite of data/rooms.js:
 * every room's furniture/trash/dust/floor/glass/stains/organize/bed arrays
 * still use the same percent-of-room (x, y, w, h) coordinates the 2D
 * renderer always used. This module is the one place that turns that into
 * real (x, y, z) world positions, so all 10 existing levels get a 3D scene
 * "for free" — Level 1 also gets a hand-tuned override (see
 * data/rooms3d.js) for the extra polish pass, everything else uses the
 * generic conversion below as-is.
 *
 * Room floor plan: a box `DIMENSIONS.width` wide (X) × `DIMENSIONS.depth`
 * deep (Z) × `DIMENSIONS.height` tall (Y), floor at y=0, back wall at
 * z=-depth/2, left wall at x=-width/2, right wall at x=+width/2.
 *
 * 2D percent x (0-100, left→right) maps to world X the same way.
 * 2D percent y (0-100) was always "how far up the flat illustration", which
 * doubled as a depth cue (small y = near the back wall, large y = near the
 * camera) — so it maps directly to world Z from back wall to front.
 */
export const DIMENSIONS = { width: 11, depth: 7.5, height: 3.4 };

// Furniture types that hang on the back wall rather than standing on the
// floor — their own `y` in the data reflects "near the top of the picture",
// not a usable floor depth, so they get a fixed wall-mounted placement.
const WALL_MOUNTED = new Set(["window", "wallArt", "mirror"]);
const WALL_HEIGHT = { window: 0.54, wallArt: 0.62, mirror: 0.55 };

export function pctToX(xPct, dims = DIMENSIONS) {
  return (xPct / 100 - 0.5) * dims.width;
}
export function pctToZ(yPct, dims = DIMENSIONS) {
  return -dims.depth / 2 + (yPct / 100) * dims.depth;
}
export function pctWToWorld(wPct, dims = DIMENSIONS) {
  return (wPct / 100) * dims.width;
}
export function pctHToWorld(hPct, dims = DIMENSIONS) {
  return (hPct / 100) * dims.depth;
}

/** Center-of-footprint world position for a room.furniture entry. */
export function furniturePosition(f, dims = DIMENSIONS) {
  const cxPct = f.x + (f.w || 0) / 2;
  const cyPct = f.y + (f.h || 0) / 2;
  if (WALL_MOUNTED.has(f.type)) {
    return [pctToX(cxPct, dims), (WALL_HEIGHT[f.type] ?? 0.55) * dims.height, -dims.depth / 2 + 0.04];
  }
  return [pctToX(cxPct, dims), 0, pctToZ(cyPct, dims)];
}

export function isWallMounted(type) {
  return WALL_MOUNTED.has(type);
}

/** A small object's (trash / organize item / pillow) world position, floor-level. */
export function pointPosition(xPct, yPct, dims = DIMENSIONS, y = 0.02) {
  return [pctToX(xPct, dims), y, pctToZ(yPct, dims)];
}

/**
 * A rectangular dirt/floor/glass/stain region → a decal plane's world
 * center + size. `wall: true` builds it as a back-wall-facing vertical
 * plane (used for glass); otherwise it's a horizontal, floor/surface-facing
 * plane at `surfaceY`.
 */
export function regionToPlane(region, { wall = false, surfaceY = 0.015, dims = DIMENSIONS } = {}) {
  const cxPct = region.x + region.w / 2;
  const cyPct = region.y + region.h / 2;
  const worldW = pctWToWorld(region.w, dims);
  const worldD = pctHToWorld(region.h, dims);
  if (wall) {
    return {
      position: [pctToX(cxPct, dims), surfaceY || dims.height * 0.5, -dims.depth / 2 + 0.035],
      size: [worldW, dims.height * 0.62],
    };
  }
  return {
    position: [pctToX(cxPct, dims), surfaceY, pctToZ(cyPct, dims)],
    size: [worldW, worldD],
  };
}

/**
 * Builds the full generic 3D layout for any room from its plain 2D data.
 * Level 1 additionally merges a hand-authored override on top of this (see
 * data/rooms3d.js) for surface heights (desk/shelf dust sits above the
 * floor, not on it) and a couple of rotations — everything else here is
 * deliberately simple and safe for all ten rooms.
 */
export function buildGenericLayout(room, dims = DIMENSIONS) {
  const furniture = (room.furniture || []).map((f) => ({
    ...f,
    position3: furniturePosition(f, dims),
    footprint: [pctWToWorld(f.w, dims), pctHToWorld(f.h, dims)],
    wall: isWallMounted(f.type),
  }));

  const dust = (room.dust || []).map((s) => ({ ...s, plane: regionToPlane(s, { dims, surfaceY: 0.86 }) }));
  const floor = (room.floor || []).map((s) => ({ ...s, plane: regionToPlane(s, { dims, surfaceY: 0.012 }) }));
  const glass = (room.glass || []).map((s) => ({ ...s, plane: regionToPlane(s, { dims, wall: true }) }));
  const stains = (room.stains || []).map((s) => ({ ...s, plane: regionToPlane(s, { dims, surfaceY: 0.014 }) }));
  const dishes = (room.dishes || []).map((s) => ({ ...s, plane: regionToPlane(s, { dims, surfaceY: 0.78 }) }));

  const trash = (room.trash || []).map((t) => ({ ...t, position3: pointPosition(t.x, t.y, dims) }));

  const organize = (room.organize || []).map((o) => ({
    ...o,
    from3: pointPosition(o.from.x, o.from.y, dims, o.fromY ?? 0.05),
    to3: pointPosition(o.to.x, o.to.y, dims, o.toY ?? 0.05),
  }));

  const bed = room.bed
    ? {
        ...room.bed,
        blanket: {
          from3: pointPosition(room.bed.blanket.from.x, room.bed.blanket.from.y, dims, 0.62),
          to3: pointPosition(room.bed.blanket.to.x, room.bed.blanket.to.y, dims, 0.62),
        },
        pillows: room.bed.pillows.map((p) => ({
          ...p,
          from3: pointPosition(p.from.x, p.from.y, dims, 0.64),
          to3: pointPosition(p.to.x, p.to.y, dims, 0.66),
        })),
      }
    : null;

  const bagPos3 = pointPosition(room.bagPos.x, room.bagPos.y, dims, 0.01);

  return { dims, furniture, dust, floor, glass, stains, dishes, trash, organize, bed, bagPos3 };
}
