/**
 * Cozy Cleanup — resolution-independent coverage grid used by every wipeable
 * surface (dust, mop, stain, glass). Coordinates are normalized [0,1] across
 * the surface so the same grid works whatever pixel size the canvas ends up
 * being rendered at. Pure math, no DOM — cheap enough to update on every
 * pointer move without touching React state.
 */
export function createGrid(cols, rows) {
  return { cols, rows, cells: new Float32Array(cols * rows) };
}

/** Adds `amount` (falling off with distance) to every cell within `radius` (normalized) of (nx, ny). */
export function applyDab(grid, nx, ny, radius, amount) {
  const { cols, rows, cells } = grid;
  const rx = radius * cols;
  const ry = radius * rows;
  const gx = nx * cols;
  const gy = ny * rows;
  const minX = Math.max(0, Math.floor(gx - rx));
  const maxX = Math.min(cols - 1, Math.ceil(gx + rx));
  const minY = Math.max(0, Math.floor(gy - ry));
  const maxY = Math.min(rows - 1, Math.ceil(gy + ry));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = (x + 0.5 - gx) / rx;
      const dy = (y + 0.5 - gy) / ry;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const falloff = 1 - Math.sqrt(d2);
      const idx = y * cols + x;
      cells[idx] = Math.min(1, cells[idx] + amount * falloff);
    }
  }
}

export function gridAverage(grid) {
  let sum = 0;
  for (let i = 0; i < grid.cells.length; i++) sum += grid.cells[i];
  return grid.cells.length ? (sum / grid.cells.length) * 100 : 100;
}

/** Cell centers still below `below` coverage — used for the gentle assist highlight. */
export function dirtiestCells(grid, below = 0.45, max = 4) {
  const { cols, rows, cells } = grid;
  const out = [];
  for (let y = 0; y < rows && out.length < max * 3; y++) {
    for (let x = 0; x < cols && out.length < max * 3; x++) {
      const v = cells[y * cols + x];
      if (v < below) out.push({ nx: (x + 0.5) / cols, ny: (y + 0.5) / rows, v });
    }
  }
  out.sort((a, b) => a.v - b.v);
  return out.slice(0, max);
}

/** Interpolated points between two normalized coords, spaced ~`step` apart, for gap-free fast strokes. */
export function lerpPoints(x0, y0, x1, y1, step) {
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const n = Math.max(1, Math.ceil(dist / step));
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    pts.push([x0 + dx * t, y0 + dy * t]);
  }
  return pts;
}
