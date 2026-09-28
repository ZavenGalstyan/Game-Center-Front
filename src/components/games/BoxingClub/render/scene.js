/**
 * Boxing Club — one frame of the fight scene.
 * Camera: stable, slightly elevated side view; eases toward the fighters'
 * midpoint, zooms a touch when they close in, and adds brief impulses only
 * for impacts (scaled down / off with Reduced Motion or Camera Shake off).
 */
import { computePose, createAnim, updateAnim } from "./rig.js";
import { drawFighter, drawShadow, makeProjector } from "./fighterArt.js";
import { drawBackdrop, drawRingBack, drawRingFront } from "./arena.js";
import { drawFx, stepFx } from "./fx.js";

export function createView() {
  return { camX: 0, zoom: 1, shakeX: 0, shakeY: 0, excite: 0, flashes: [], t: 0, anims: null, poses: {} };
}

export function camera(view, W, H) {
  const base = Math.min(W / 6.1, H / 3.55);
  const S = base * view.zoom;
  const floorY = H * 0.8;
  return { S, cx: W / 2 + view.shakeX, floorY: floorY + view.shakeY, camX: view.camX };
}

/**
 * Advance view state (camera, anims, crowd) by `dt` ms and draw.
 * `opts` = { detail, particles, shake (bool), reduced, lookP, lookO, arena, frozen (hitstop) }
 */
export function renderFight(ctx, W, H, fight, view, fx, opts, dt) {
  const P = fight.player;
  const O = fight.opponent;
  if (!view.anims) view.anims = { p: createAnim(P), o: createAnim(O) };
  const animDt = opts.frozen ? 0 : dt;
  view.t += animDt / 1000;
  const stepP = updateAnim(view.anims.p, P, animDt, opts.reduced);
  const stepO = updateAnim(view.anims.o, O, animDt, opts.reduced);

  // camera
  const mid = (P.x + O.x) / 2;
  const gap = O.x - P.x;
  view.camX += (Math.max(-1.0, Math.min(1.0, mid)) - view.camX) * Math.min(1, dt / 260);
  const wantZoom = 1 + Math.max(0, Math.min(1, (1.8 - gap) / 1.2)) * (opts.reduced ? 0.02 : 0.05);
  view.zoom += (wantZoom - view.zoom) * Math.min(1, dt / 400);
  const shakeAmt = opts.shake && !opts.reduced ? fight.shake : opts.shake ? fight.shake * 0.3 : 0;
  view.shakeX = shakeAmt > 0.01 ? (Math.random() - 0.5) * shakeAmt * 9 : 0;
  view.shakeY = shakeAmt > 0.01 ? (Math.random() - 0.5) * shakeAmt * 6 : 0;
  view.excite = Math.max(0, view.excite - dt / 1400);
  for (const f of view.flashes) f.t += dt;
  view.flashes = view.flashes.filter((f) => f.t < 140);
  if (opts.arena.flashes && opts.detail !== "low" && Math.random() < dt / (view.excite > 0.3 ? 90 : 420)) {
    view.flashes.push({ x: Math.random() * W, y: H * (0.15 + Math.random() * 0.3), t: 0 });
  }
  stepFx(fx, dt);

  const cam = camera(view, W, H);
  ctx.clearRect(0, 0, W, H);
  drawBackdrop(ctx, cam, W, H, opts.arena, view.t, { excite: view.excite, detail: opts.detail, reduced: opts.reduced, flashes: view.flashes });
  drawRingBack(ctx, cam, opts.arena, { detail: opts.detail });

  const poseP = computePose(P, view.anims.p, gap, view.t, { build: opts.lookP.build, pose: fight.over && fight.result?.winner === "player" && P.state !== "down" ? "win" : fight.over && fight.result?.winner === "opponent" && P.state !== "down" ? "lose" : null });
  const poseO = computePose(O, view.anims.o, gap, view.t, { build: opts.lookO.build, pose: fight.over && fight.result?.winner === "opponent" && O.state !== "down" ? "win" : fight.over && fight.result?.winner === "player" && O.state !== "down" ? "lose" : null });
  view.poses = { p: poseP, o: poseO, cam };

  drawShadow(ctx, cam, P, poseP);
  drawShadow(ctx, cam, O, poseO);
  // the fighter who is throwing draws last so the punch crosses in front
  const pFirst = O.state === "attack" && P.state !== "attack";
  const order = pFirst ? [[P, poseP, opts.lookP], [O, poseO, opts.lookO]] : [[O, poseO, opts.lookO], [P, poseP, opts.lookP]];
  for (const [f, pose, look] of order) drawFighter(ctx, cam, f, pose, look, { lowDetail: opts.detail === "low" });

  drawFx(ctx, fx, cam.S);
  drawRingFront(ctx, cam, opts.arena, W, H, view.t, { detail: opts.detail, excite: view.excite });
  return { stepP, stepO, cam };
}

/** Screen position of a fighter's glove (for anchoring impact effects). */
export function gloveScreen(view, fight, side, hand) {
  const f = side === "player" ? fight.player : fight.opponent;
  const pose = view.poses?.[side === "player" ? "p" : "o"];
  if (!pose || !view.poses.cam) return null;
  const proj = makeProjector(view.poses.cam, f);
  return proj(hand === "lead" ? pose.gloveL : pose.gloveR);
}

export function headScreen(view, fight, side) {
  const f = side === "player" ? fight.player : fight.opponent;
  const pose = view.poses?.[side === "player" ? "p" : "o"];
  if (!pose || !view.poses.cam) return null;
  return makeProjector(view.poses.cam, f)(pose.head);
}
