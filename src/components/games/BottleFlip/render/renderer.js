/**
 * Bottle Flip — frame composer. Reads the session + camera, never mutates
 * gameplay state. Called once per animation frame.
 */
import { setWorld, setScreen } from "./view.js";
import { drawBackdrop, drawPlatformDecor, drawForeground } from "./scene.js";
import { drawPlatform } from "./furniture.js";
import { drawBottle } from "./bottle.js";
import { drawFxWorld, drawFxText } from "./effects.js";
import { moveOffset } from "../physics/solids.js";
import { launchVelocity } from "../physics/bottlePhysics.js";
import { PHYS, BOTTLE } from "../physics/constants.js";
import { platformTop } from "../physics/solids.js";

function drawCollectible(ctx, c, time, i) {
  const bob = Math.sin(time * 2.4 + i) * 1.2;
  const x = c.x;
  const y = c.y + bob;
  const g = ctx.createRadialGradient(x, y, 0, x, y, 11);
  g.addColorStop(0, "rgba(255,226,120,0.55)");
  g.addColorStop(1, "rgba(255,226,120,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, Math.PI * 2);
  ctx.fill();
  const rot = time * 1.4 + i;
  const sc = 0.85 + 0.15 * Math.cos(time * 2.2 + i);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc, 1);
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 2.4 : 5.4;
    const a = Math.PI / 2 + (k * Math.PI) / 5 + Math.sin(rot) * 0.05;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  const sg = ctx.createLinearGradient(0, -5, 0, 5);
  sg.addColorStop(0, "#fff3b0");
  sg.addColorStop(1, "#ffb627");
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.strokeStyle = "rgba(170,100,0,0.6)";
  ctx.lineWidth = 0.4;
  ctx.stroke();
  ctx.restore();
}

/** Highest surface under x at or below y (platform tops, else the floor). */
function surfaceBelow(s, x, y) {
  let best = 0;
  for (const sd of s.solids) {
    if (sd.floor) continue;
    if (x < sd.x0 || x > sd.x1) continue;
    if (sd.y1 <= y + 0.5 && sd.y1 > best) best = sd.y1;
  }
  return best;
}

function drawShadow(ctx, s, respawnK, q) {
  const b = s.body;
  const bottomY = b.y - BOTTLE.com * Math.abs(Math.cos(b.a)) - (BOTTLE.w / 2) * Math.abs(Math.sin(b.a));
  const surf = surfaceBelow(s, b.x, bottomY + 0.5);
  const hgt = Math.max(0, bottomY - surf);
  const k = Math.min(1, hgt / 160);
  const foot = BOTTLE.w * Math.abs(Math.cos(b.a)) + BOTTLE.h * Math.abs(Math.sin(b.a)) * 0.8;
  const rx = (foot * 0.62 + 1.5) * (1 + k * 0.9);
  const ry = 1.6 + k * 1.2;
  const a = (0.42 - 0.32 * k) * respawnK;
  if (q === "low") {
    ctx.fillStyle = `rgba(20,10,0,${a * 0.8})`;
    ctx.beginPath();
    ctx.ellipse(b.x, surf, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.save();
  ctx.translate(b.x, surf);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(20,10,0,${a})`);
  g.addColorStop(0.55 - k * 0.2, `rgba(20,10,0,${a * 0.6})`);
  g.addColorStop(1, "rgba(20,10,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAim(ctx, s, aim, settings, time) {
  const b = s.body;
  const p = s.level.platforms[s.platformIndex];
  const tp = platformTop(p, s.t);
  const cx = b.x;
  const cy = b.y + 2;
  // power ring
  const R = 17;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  if (aim.cancel) {
    ctx.strokeStyle = "rgba(255,120,120,0.8)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 4);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.moveTo(cx - 4, cy + 4);
    ctx.lineTo(cx + 4, cy - 4);
    ctx.stroke();
    ctx.lineCap = "butt";
    return;
  }
  const pw = aim.power;
  const hue = 150 - pw * 130;
  ctx.strokeStyle = `hsl(${hue} 90% 60%)`;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI / 2, Math.PI / 2 - pw * Math.PI * 2, true);
  ctx.stroke();
  // max-power tick
  if (pw >= 0.999) {
    ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(time * 20)})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 1.6, 0, Math.PI * 2);
    ctx.stroke();
  }
  // spin hint arrow (direction of the flip)
  const v = launchVelocity(aim.angle, pw, s.facing);
  const dir = v.w < 0 ? -1 : 1;
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 0.9;
  const a0 = Math.PI / 2 + dir * 0.25;
  const a1 = Math.PI / 2 + dir * 1.05;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 4, Math.min(a0, a1), Math.max(a0, a1));
  ctx.stroke();
  const ex = cx + Math.cos(a1) * (R + 4);
  const ey = cy + Math.sin(a1) * (R + 4);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  const tx = -Math.sin(a1) * dir;
  const ty = Math.cos(a1) * dir;
  ctx.moveTo(ex + tx * 2.2, ey + ty * 2.2);
  ctx.lineTo(ex - ty * 1.4, ey + tx * 1.4);
  ctx.lineTo(ex + ty * 1.4, ey - tx * 1.4);
  ctx.closePath();
  ctx.fill();
  ctx.lineCap = "butt";

  if (!settings.aimGuide) return;
  // short arc: the first ~0.3 s of the throw, not the whole path
  const vx = v.vx + tp.vx;
  const vy = v.vy + Math.max(0, tp.vy);
  const wind = s.wind || 0;
  const n = 11;
  const dt = 0.026;
  for (let i = 2; i <= n; i++) {
    const t = i * dt;
    const x = cx + vx * t + 0.5 * wind * t * t;
    const y = b.y + vy * t - 0.5 * PHYS.g * t * t;
    const f = 1 - (i - 2) / (n + 1);
    ctx.fillStyle = `rgba(30,30,50,${0.35 * f})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.5 * f + 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.95 * f})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.15 * f + 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  // last throw ghost (helps repeat a good flip)
  if (aim.last) {
    const lv = launchVelocity(aim.last.angle, aim.last.power, s.facing);
    const t = n * dt;
    const x = cx + (lv.vx + tp.vx) * t + 0.5 * wind * t * t;
    const y = b.y + (lv.vy + Math.max(0, tp.vy)) * t - 0.5 * PHYS.g * t * t;
    ctx.strokeStyle = aim.last.good ? "rgba(130,240,190,0.7)" : "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * vis: { skin, tilt, slosh, time, respawnK, quality, aim, settings, lastThrow }
 */
export function renderGame(ctx, v, s, fx, vis) {
  const lv = s.level;
  const q = vis.quality;
  // shake offset (screen px) — applied through the view centre
  const sv = fx.shake && vis.settings.shake && !vis.settings.reducedMotion
    ? { ...v, cx: v.cx + Math.sin(vis.time * 71) * fx.shake / v.s, cy: v.cy + Math.cos(vis.time * 57) * fx.shake / v.s }
    : v;

  drawBackdrop(ctx, sv, lv, vis.time, q);

  setWorld(ctx, sv, 1);
  const offs = lv.platforms.map((p) => moveOffset(p, s.t));
  drawPlatformDecor(ctx, lv, offs, vis.time);

  // supports (cabinets under appliances …) sit behind the route
  for (const p of lv.supports || []) {
    const o = moveOffset(p, s.t);
    drawPlatform(ctx, p, o.dx, o.dy, lv.theme || "room", {});
  }
  // platforms
  const last = lv.platforms.length - 1;
  const goal = Math.min(last, Math.max(s.platformIndex, s.progress) + 1);
  lv.platforms.forEach((p, i) => {
    const o = offs[i];
    const isGoal = s.state !== "complete" && (i === goal || i === last) && i > s.progress;
    drawPlatform(ctx, p, o.dx, o.dy, lv.theme || "room", {
      goal: isGoal,
      goalKind: i === last ? "finish" : "next",
      time: vis.time,
    });
  });

  // wind streaks: faint air lines drifting with the wind (visual only)
  if (lv.wind && q !== "low" && !vis.settings.reducedMotion) {
    const dir = Math.sign(lv.wind);
    const speed = 40 + Math.abs(lv.wind) * 0.9;
    const half = sv.W / 2 / sv.s + 40;
    const span = half * 2;
    ctx.lineCap = "round";
    for (let k = 0; k < 14; k++) {
      const h = Math.sin(k * 91.7) * 0.5 + 0.5;
      const y = 20 + ((k * 37.3) % 200);
      const x = sv.cx - half + ((h * span + dir * vis.time * speed * (0.7 + h * 0.6)) % span + span) % span;
      const len = 10 + h * 14;
      const a = 0.12 + 0.12 * Math.sin(vis.time * 2 + k);
      ctx.strokeStyle = lv.theme === "master" ? `rgba(160,240,255,${a})` : `rgba(255,255,255,${a * 1.6})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - dir * len, y);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }

  // collectibles
  (lv.collectibles || []).forEach((c, i) => {
    if (!s.collected.has(i)) drawCollectible(ctx, c, vis.time, i);
  });

  drawShadow(ctx, s, vis.respawnK, q);

  // bottle
  const b = s.body;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.a);
  const rk = vis.respawnK;
  if (rk < 1) {
    const e = 1 - (1 - rk) * (1 - rk);
    ctx.globalAlpha = Math.min(1, rk * 1.5);
    ctx.translate(0, -BOTTLE.com);
    ctx.scale(0.75 + 0.25 * e, 0.75 + 0.25 * e);
    ctx.translate(0, BOTTLE.com);
  }
  ctx.scale(1, -1);
  drawBottle(ctx, vis.skin, { tilt: vis.tilt, slosh: vis.slosh, time: vis.time, quality: q, glow: fx.flash * 0.6 });
  ctx.restore();
  ctx.globalAlpha = 1;

  if (vis.aim && vis.aim.active) {
    setWorld(ctx, sv, 1);
    drawAim(ctx, s, vis.aim, vis.settings, vis.time);
  }

  if (vis.settings.particles) drawFxWorld(ctx, sv, fx);
  drawForeground(ctx, sv, lv, vis.time, q);
  drawFxText(ctx, sv, fx, vis.uiScale || 1);
  setScreen(ctx, v);
}
