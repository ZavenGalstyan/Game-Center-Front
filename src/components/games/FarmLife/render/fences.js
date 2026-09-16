/**
 * Farm Life — wooden fence lines around the field and the chicken pen, each
 * with a real gate gap. Flat (ground-level), so drawn before the Y-sorted
 * layer rather than as part of it.
 */
import { FIELD_FENCE, COOP_PEN } from "../engine/terrain.js";
import { PALETTE as P } from "./palette.js";

function edgesForRect(rect, gate) {
  return [
    [rect.minX, rect.minZ, rect.maxX, rect.minZ],
    [rect.minX, rect.minZ, rect.minX, rect.maxZ],
    [rect.maxX, rect.minZ, rect.maxX, rect.maxZ],
    [rect.minX, rect.maxZ, gate.from, rect.maxZ],
    [gate.to, rect.maxZ, rect.maxX, rect.maxZ],
  ];
}

function drawSegment(ctx, x1, z1, x2, z2) {
  const length = Math.hypot(x2 - x1, z2 - z1);
  if (length < 0.05) return;
  ctx.strokeStyle = P.fenceWood;
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(x1, z1);
  ctx.lineTo(x2, z2);
  ctx.stroke();

  const postCount = Math.max(2, Math.round(length / 0.95) + 1);
  ctx.fillStyle = P.fencePost;
  for (let i = 0; i < postCount; i++) {
    const t = i / (postCount - 1);
    const px = x1 + (x2 - x1) * t;
    const pz = z1 + (z2 - z1) * t;
    ctx.beginPath();
    ctx.arc(px, pz, 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawFences(ctx) {
  for (const [x1, z1, x2, z2] of edgesForRect(FIELD_FENCE, FIELD_FENCE.gate)) drawSegment(ctx, x1, z1, x2, z2);
  for (const [x1, z1, x2, z2] of edgesForRect(COOP_PEN, { from: COOP_PEN.gateX[0], to: COOP_PEN.gateX[1] })) drawSegment(ctx, x1, z1, x2, z2);
}
