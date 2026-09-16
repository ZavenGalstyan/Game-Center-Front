/**
 * Farm Life — ground, dirt paths and the world-edge vignette. Drawn fresh
 * every frame in world-space (cheap: one fill, a handful of path strokes,
 * one radial gradient) — everything else (buildings, trees, field, entities)
 * layers on top via render/draw.js and render/field.js.
 */
import { PALETTE as P } from "./palette.js";
import {
  WORLD_CENTER, BOUNDARY_RADIUS_X, BOUNDARY_RADIUS_Z,
  FARMHOUSE, BARN, COOP, FIELD_FENCE, SEED_STAND, SHIPPING_BOX, MAILBOX, SIGNPOST, WELL,
} from "../engine/terrain.js";

const GROUND_EXTENT_X = BOUNDARY_RADIUS_X + 10;
const GROUND_EXTENT_Z = BOUNDARY_RADIUS_Z + 10;

const PATH_ROUTES = [
  [[SIGNPOST.x, SIGNPOST.z + 0.5], [MAILBOX.x, MAILBOX.z + 0.5], [SEED_STAND.x, SEED_STAND.z + 1], [SEED_STAND.x, SEED_STAND.z - 1]],
  [[SEED_STAND.x, SEED_STAND.z - 1], [FARMHOUSE.doorX, FARMHOUSE.doorZ + 0.2]],
  [[FARMHOUSE.doorX, FARMHOUSE.doorZ + 0.2], [SHIPPING_BOX.x, SHIPPING_BOX.z]],
  [[SHIPPING_BOX.x, SHIPPING_BOX.z], [WELL.x, WELL.z]],
  [[WELL.x, WELL.z], [(FIELD_FENCE.gate.from + FIELD_FENCE.gate.to) / 2, FIELD_FENCE.maxZ + 1]],
  [[(FIELD_FENCE.gate.from + FIELD_FENCE.gate.to) / 2, FIELD_FENCE.maxZ + 1], [(FIELD_FENCE.gate.from + FIELD_FENCE.gate.to) / 2, FIELD_FENCE.maxZ]],
  [[WELL.x, WELL.z], [COOP.minX - 0.5, COOP.maxZ + 0.8], [COOP.minX - 0.5, BARN.maxZ]],
];

function strokePath(ctx, points, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach(([x, z], i) => (i === 0 ? ctx.moveTo(x, z) : ctx.lineTo(x, z)));
  ctx.stroke();
}

export function drawGround(ctx) {
  ctx.fillStyle = P.grassBase;
  ctx.fillRect(WORLD_CENTER.x - GROUND_EXTENT_X, WORLD_CENTER.z - GROUND_EXTENT_Z, GROUND_EXTENT_X * 2, GROUND_EXTENT_Z * 2);

  for (const pts of PATH_ROUTES) {
    strokePath(ctx, pts, 1.15, P.dirtPathEdge);
    strokePath(ctx, pts, 0.85, P.dirtPath);
  }
}

/** Soft darker tint beyond the boundary treeline — reads as "the rest of the
 *  countryside, not yours to walk yet" rather than the world just stopping. */
export function drawEdgeVignette(ctx) {
  const grad = ctx.createRadialGradient(
    WORLD_CENTER.x, WORLD_CENTER.z, Math.max(BOUNDARY_RADIUS_X, BOUNDARY_RADIUS_Z) * 0.75,
    WORLD_CENTER.x, WORLD_CENTER.z, Math.max(BOUNDARY_RADIUS_X, BOUNDARY_RADIUS_Z) * 1.5,
  );
  grad.addColorStop(0, "rgba(30,50,20,0)");
  grad.addColorStop(1, "rgba(20,35,15,0.45)");
  ctx.fillStyle = grad;
  ctx.fillRect(WORLD_CENTER.x - GROUND_EXTENT_X, WORLD_CENTER.z - GROUND_EXTENT_Z, GROUND_EXTENT_X * 2, GROUND_EXTENT_Z * 2);
}

export function drawSkyBackdrop(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, P.skyTop);
  grad.addColorStop(1, P.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}
