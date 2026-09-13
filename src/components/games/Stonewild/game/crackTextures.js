/**
 * Stonewild — procedural break-progress crack textures.
 *
 * Five canvas-drawn stages (more/heavier jagged lines as progress rises),
 * generated once and cached. Nearest-filter, no mipmaps — crisp pixel
 * cracks, never blurry (spec requirement).
 */

import * as THREE from "three";

const STAGES = 5;
const SIZE = 32;

function drawStage(ctx, stage, seed) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  const lines = stage + 1;
  let rand = seed;
  const next = () => {
    rand = (rand * 1103515245 + 12345) & 0x7fffffff;
    return (rand % 1000) / 1000;
  };
  ctx.strokeStyle = "rgba(10,8,6,0.85)";
  ctx.lineWidth = 1 + stage * 0.4;
  for (let i = 0; i < lines * 2; i++) {
    let x = next() * SIZE;
    let y = next() * SIZE;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segments = 2 + Math.floor(next() * 2);
    for (let s = 0; s < segments; s++) {
      x += (next() - 0.5) * 12;
      y += (next() - 0.5) * 12;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

let cached = null;
export function getCrackTextures() {
  if (cached) return cached;
  cached = [];
  for (let stage = 0; stage < STAGES; stage++) {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    drawStage(ctx, stage, 42 + stage * 977);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    cached.push(tex);
  }
  return cached;
}

export function stageForProgress(progress) {
  return Math.min(STAGES - 1, Math.max(0, Math.floor(progress * STAGES)));
}
