/**
 * Farm Life — the tilled field: soil tiles + whatever's growing on them,
 * drawn top-down. Each crop has a recognizable per-stage silhouette (spec:
 * "crops must be recognizable, not a cube growing into a taller cube")
 * even reduced to a small top-down icon.
 */
import { FIELD_ORIGIN, TILE_SIZE } from "../engine/terrain.js";
import { ITEM } from "../data/items.js";
import { PALETTE as P } from "./palette.js";

function tileCenter(col, row) {
  return {
    x: FIELD_ORIGIN.x + col * TILE_SIZE + TILE_SIZE / 2,
    z: FIELD_ORIGIN.z + row * TILE_SIZE + TILE_SIZE / 2,
  };
}

function drawWheat(ctx, cx, cz, stage) {
  if (stage === 0) return;
  const h = [0, 0.1, 0.17, 0.24, 0.3][stage];
  const mature = stage === 4;
  ctx.strokeStyle = mature ? "#c99a2e" : "#4f8a3c";
  ctx.lineWidth = 0.035;
  const blades = stage <= 2 ? 3 : 5;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const bx = cx + Math.cos(a) * 0.07;
    const bz = cz + Math.sin(a) * 0.07;
    ctx.beginPath();
    ctx.moveTo(bx, bz + 0.05);
    ctx.lineTo(bx, bz - h);
    ctx.stroke();
    if (mature) {
      ctx.fillStyle = "#e8c752";
      ctx.beginPath();
      ctx.ellipse(bx, bz - h - 0.03, 0.045, 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCarrot(ctx, cx, cz, stage) {
  if (stage === 0) return;
  const leafH = [0, 0.07, 0.11, 0.15, 0.17][stage];
  ctx.fillStyle = "#4f8a3c";
  const leaves = stage <= 1 ? 3 : 6;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * 0.04, cz + Math.sin(a) * 0.04 - leafH / 2, 0.025, leafH / 2, a, 0, Math.PI * 2);
    ctx.fill();
  }
  if (stage === 4) {
    ctx.fillStyle = "#e8752e";
    ctx.beginPath();
    ctx.arc(cx, cz, 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPotato(ctx, cx, cz, stage) {
  if (stage === 0) return;
  const s = [0, 0.4, 0.65, 0.85, 1][stage];
  ctx.fillStyle = "#3f7a34";
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const r = 0.06 * s;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.045 + s * 0.02, 0, Math.PI * 2);
    ctx.fill();
  }
  if (stage === 4) {
    ctx.fillStyle = "#e8d6f2";
    ctx.beginPath();
    ctx.arc(cx + 0.03, cz - 0.03, 0.02, 0, Math.PI * 2);
    ctx.fill();
  }
}

const CROP_DRAWERS = {
  [ITEM.WHEAT]: drawWheat,
  [ITEM.CARROT]: drawCarrot,
  [ITEM.POTATO]: drawPotato,
};

/** Draws every field tile. Called each frame — cheap: ~60 tiles max, plain
 *  fillRect + a couple of strokes/shapes per tile. */
export function drawField(ctx, farmTiles, width) {
  for (let i = 0; i < farmTiles.length; i++) {
    const tile = farmTiles[i];
    const col = i % width;
    const row = Math.floor(i / width);
    const { x, z } = tileCenter(col, row);
    const half = TILE_SIZE / 2 - 0.03;

    const soilColor = tile.tilled ? (tile.watered ? P.soilWet : P.soilTilled) : P.grassBase;
    ctx.fillStyle = soilColor;
    ctx.fillRect(x - half, z - half, half * 2, half * 2);

    if (tile.tilled) {
      ctx.strokeStyle = P.soilFurrow;
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(x - half + 0.08, z);
      ctx.lineTo(x + half - 0.08, z);
      ctx.moveTo(x, z - half + 0.08);
      ctx.lineTo(x, z + half - 0.08);
      ctx.stroke();
    }

    if (tile.cropId) {
      if (tile.stage === 0) {
        ctx.fillStyle = "#6b4a2e";
        ctx.beginPath();
        ctx.arc(x, z, 0.03, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const drawer = CROP_DRAWERS[tile.cropId];
        drawer?.(ctx, x, z, tile.stage);
      }
    }
  }
}

/** Highlights the currently-targeted tile (F prompt is active on it) with a
 *  soft pulsing outline so the player can see exactly what pressing F does. */
export function drawTileHighlight(ctx, col, row, time) {
  const { x, z } = tileCenter(col, row);
  const half = TILE_SIZE / 2 - 0.02;
  const pulse = 0.5 + Math.sin(time * 6) * 0.5;
  ctx.strokeStyle = `rgba(255, 224, 138, ${0.55 + pulse * 0.35})`;
  ctx.lineWidth = 0.06;
  ctx.strokeRect(x - half, z - half, half * 2, half * 2);
}
