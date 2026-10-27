/** Shadow Warriors — compose one frame: arena, hazards, fighters, FX. */
import { drawArenaBack, drawArenaFloor, drawAmbient } from "./arenas.js";
import { drawFighter } from "./fighterArt.js";
import { drawFxWorld, drawHazards } from "./fx.js";

export function drawScene(ctx, v, F, A, fx, settings, dt) {
  drawArenaBack(ctx, A, v);
  drawArenaFloor(ctx, A, v);
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  drawHazards(ctx, v, F, A.P);
  // the attacking fighter is drawn in front
  const [a, b] = F.p2.state === "attack" && F.p1.state !== "attack" ? [F.p1, F.p2] : [F.p2, F.p1];
  for (const f of [a, b]) drawFighter(ctx, v, f, { P: A.P, flash: fx.hitFlash[f.side], trail: settings.effects !== false ? fx.trails[f.side] : null });
  drawFxWorld(ctx, v, fx);
  drawAmbient(ctx, A, v, dt, settings.effects !== false);
  overlay(ctx, v, fx);
}

/** Menu backdrop: arena + idle sparring silhouettes (a demo fight). */
export function drawBackdrop(ctx, v, F, A, fx, dt) {
  drawArenaBack(ctx, A, v);
  drawArenaFloor(ctx, A, v);
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  if (F) {
    for (const f of [F.p2, F.p1]) drawFighter(ctx, v, f, { P: A.P, flash: fx.hitFlash[f.side], trail: fx.trails[f.side] });
    drawFxWorld(ctx, v, fx);
  }
  drawAmbient(ctx, A, v, dt, true);
  overlay(ctx, v, fx);
}

// the vignette is a CSS overlay (.sw-vignette) so the GPU composites it for free
function overlay(ctx, v, fx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const W = v.W * v.dpr;
  const H = v.H * v.dpr;
  if (fx.flash > 0) {
    ctx.globalAlpha = Math.min(0.5, fx.flash);
    ctx.fillStyle = fx.flashColor;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}
