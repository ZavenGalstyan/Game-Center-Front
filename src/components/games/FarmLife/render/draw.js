/**
 * Farm Life — top-down draw primitives. Every function receives a 2D
 * context already transformed so 1 unit == 1 world unit (GameCanvas sets
 * `ctx.setTransform(scale,0,0,scale,tx,ty)` once per frame) — so these just
 * draw in the same small numbers terrain.js already uses, no pixel math.
 */
import { PALETTE as P } from "./palette.js";

function shadow(ctx, cx, cz, rx, rz) {
  ctx.fillStyle = P.shadow;
  ctx.beginPath();
  ctx.ellipse(cx, cz + rz * 0.15, rx, rz, 0, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function building(ctx, rect, { roof, ridge, wall, door = true, chimney = false, window: hasWindow = true }) {
  const w = rect.maxX - rect.minX;
  const h = rect.maxZ - rect.minZ;
  const cx = (rect.minX + rect.maxX) / 2;
  shadow(ctx, cx, rect.maxZ, w / 2 + 0.15, 0.35);

  // Wall sliver peeking from under the roof on the south edge.
  ctx.fillStyle = wall;
  roundRect(ctx, rect.minX + 0.1, rect.maxZ - 0.22, w - 0.2, 0.3, 0.06);
  ctx.fill();

  ctx.fillStyle = roof;
  roundRect(ctx, rect.minX, rect.minZ, w, h, 0.18);
  ctx.fill();

  ctx.strokeStyle = ridge;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(cx, rect.minZ + 0.1);
  ctx.lineTo(cx, rect.maxZ - 0.1);
  ctx.stroke();

  if (door) {
    ctx.fillStyle = P.doorBrown;
    roundRect(ctx, cx - 0.16, rect.maxZ - 0.16, 0.32, 0.22, 0.04);
    ctx.fill();
  }
  if (hasWindow) {
    ctx.fillStyle = P.windowGlow;
    ctx.fillRect(rect.minX + w * 0.22, rect.minZ + h * 0.3, 0.18, 0.18);
    if (w > 2.5) ctx.fillRect(rect.maxX - w * 0.22 - 0.18, rect.minZ + h * 0.3, 0.18, 0.18);
  }
  if (chimney) {
    ctx.fillStyle = "#8a6f5c";
    ctx.fillRect(rect.minX + w * 0.72, rect.minZ + h * 0.15, 0.22, 0.22);
  }
}

export function drawFarmhouse(ctx, rect) {
  building(ctx, rect, { roof: P.roofDark, ridge: "#5a2a20", wall: P.wallCream, chimney: true });
}
export function drawShed(ctx, rect) {
  building(ctx, rect, { roof: "#5a3226", ridge: "#3f2419", wall: "#7a6a52", door: true, window: false });
}
export function drawBarn(ctx, rect) {
  building(ctx, rect, { roof: P.roofRed, ridge: "#6b2e24", wall: P.roofRed, door: true, window: true });
}
export function drawCoopBuilding(ctx, rect) {
  building(ctx, rect, { roof: P.coopRoof, ridge: "#6b2e24", wall: P.coopWall, door: true, window: false });
}

export function drawWell(ctx, well) {
  shadow(ctx, well.x, well.z, well.r + 0.15, well.r * 0.6);
  ctx.fillStyle = P.stoneGray;
  ctx.beginPath();
  ctx.arc(well.x, well.z, well.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#274a5c";
  ctx.beginPath();
  ctx.arc(well.x, well.z, well.r - 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#6b4526";
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(well.x - well.r - 0.1, well.z);
  ctx.lineTo(well.x + well.r + 0.1, well.z);
  ctx.stroke();
}

export function drawMailbox(ctx, m) {
  shadow(ctx, m.x, m.z, 0.18, 0.12);
  ctx.fillStyle = "#6b4a2e";
  ctx.fillRect(m.x - 0.04, m.z - 0.04, 0.08, 0.08);
  ctx.fillStyle = "#c94f3c";
  ctx.beginPath();
  ctx.ellipse(m.x, m.z - 0.1, 0.13, 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSignpost(ctx, s) {
  shadow(ctx, s.x, s.z, 0.15, 0.1);
  ctx.strokeStyle = "#7a5a38";
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(s.x, s.z + 0.15);
  ctx.lineTo(s.x, s.z - 0.25);
  ctx.stroke();
  ctx.fillStyle = "#c9a877";
  ctx.fillRect(s.x - 0.02, s.z - 0.32, 0.32, 0.14);
  ctx.fillRect(s.x - 0.3, s.z - 0.16, 0.28, 0.12);
}

export function drawWindmill(ctx, wm, time) {
  shadow(ctx, wm.x, wm.z, 0.9, 0.5);
  ctx.fillStyle = "#c9beac";
  ctx.beginPath();
  ctx.arc(wm.x, wm.z, 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(wm.x, wm.z);
  ctx.rotate(time * 0.6);
  ctx.fillStyle = "#e6ddc8";
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 2);
    ctx.fillRect(-0.06, 0, 0.12, 1.0);
    ctx.restore();
  }
  ctx.restore();
}

export function drawSeedStand(ctx, s) {
  shadow(ctx, s.x, s.z, 0.5, 0.35);
  ctx.fillStyle = "#8a6238";
  roundRect(ctx, s.x - 0.45, s.z - 0.32, 0.9, 0.64, 0.08);
  ctx.fill();
  ["#d4a94a", "#e07a3a", "#c9a877"].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(s.x - 0.24 + i * 0.24, s.z - 0.02, 0.09, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function drawShippingBox(ctx, s) {
  shadow(ctx, s.x, s.z, 0.5, 0.35);
  ctx.fillStyle = "#a9804c";
  roundRect(ctx, s.x - 0.45, s.z - 0.35, 0.9, 0.7, 0.1);
  ctx.fill();
  ctx.fillStyle = "#f2c94c";
  ctx.beginPath();
  ctx.arc(s.x, s.z, 0.12, 0, Math.PI * 2);
  ctx.fill();
}

const TREE_COLORS = [
  { canopy: P.treeOak, canopy2: P.treeOakLight },
  { canopy: P.treeBirch, canopy2: "#8fc767" },
  { canopy: P.treePine, canopy2: "#3f7a49" },
];

export function drawTree(ctx, t) {
  const c = TREE_COLORS[t.variant % 3];
  const s = t.scale;
  shadow(ctx, t.x, t.z, 0.45 * s, 0.28 * s);
  ctx.fillStyle = P.treeTrunk;
  ctx.beginPath();
  ctx.arc(t.x, t.z, 0.08 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.canopy;
  ctx.beginPath();
  ctx.arc(t.x, t.z - 0.1 * s, t.r * 1.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.canopy2;
  ctx.beginPath();
  ctx.arc(t.x - 0.15 * s, t.z - 0.22 * s, t.r * 0.65, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBush(ctx, b) {
  shadow(ctx, b.x, b.z, 0.32 * b.scale, 0.2 * b.scale);
  ctx.fillStyle = P.bushGreen;
  ctx.beginPath();
  ctx.arc(b.x, b.z, 0.28 * b.scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4a8a3d";
  ctx.beginPath();
  ctx.arc(b.x + 0.12 * b.scale, b.z - 0.08 * b.scale, 0.16 * b.scale, 0, Math.PI * 2);
  ctx.fill();
}

export function drawRock(ctx, r) {
  ctx.save();
  ctx.translate(r.x, r.z);
  ctx.rotate(r.rot);
  ctx.fillStyle = P.rockGray;
  ctx.beginPath();
  ctx.ellipse(0, 0.03, 0.22 * r.scale, 0.16 * r.scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b0ada3";
  ctx.beginPath();
  ctx.ellipse(-0.04 * r.scale, -0.03 * r.scale, 0.1 * r.scale, 0.07 * r.scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const FLOWER_COLORS = ["#f2e94e", "#f28fb0", "#f2f2f2", "#c98fe0"];
export function drawFlower(ctx, f) {
  ctx.fillStyle = FLOWER_COLORS[Math.floor(f.hue * FLOWER_COLORS.length) % FLOWER_COLORS.length];
  ctx.beginPath();
  ctx.arc(f.x, f.z, 0.05 * f.scale, 0, Math.PI * 2);
  ctx.fill();
}

export function drawGrassTuft(ctx, g) {
  ctx.save();
  ctx.translate(g.x, g.z);
  ctx.rotate(g.r);
  ctx.strokeStyle = P.grassDark;
  ctx.lineWidth = 0.03 * g.s;
  ctx.beginPath();
  ctx.moveTo(0, 0.06 * g.s);
  ctx.lineTo(0, -0.12 * g.s);
  ctx.moveTo(-0.05 * g.s, 0.06 * g.s);
  ctx.lineTo(-0.03 * g.s, -0.08 * g.s);
  ctx.moveTo(0.05 * g.s, 0.06 * g.s);
  ctx.lineTo(0.03 * g.s, -0.08 * g.s);
  ctx.stroke();
  ctx.restore();
}

export function drawNestBox(ctx, n) {
  shadow(ctx, n.x, n.z, 0.28, 0.2);
  ctx.fillStyle = "#c9a877";
  roundRect(ctx, n.x - 0.25, n.z - 0.18, 0.5, 0.36, 0.06);
  ctx.fill();
  ctx.strokeStyle = "#8a6238";
  ctx.lineWidth = 0.03;
  ctx.strokeRect(n.x - 0.25, n.z - 0.18, 0.5, 0.36);
}

export function drawFeeder(ctx, f) {
  shadow(ctx, f.x, f.z, 0.16, 0.1);
  ctx.fillStyle = "#8a6238";
  ctx.beginPath();
  ctx.arc(f.x, f.z, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d4b877";
  ctx.beginPath();
  ctx.arc(f.x, f.z, 0.09, 0, Math.PI * 2);
  ctx.fill();
}

export function drawPond(ctx, pond, time) {
  ctx.fillStyle = P.sand;
  ctx.beginPath();
  ctx.arc(pond.x, pond.z, pond.r + 0.35, 0, Math.PI * 2);
  ctx.fill();
  const wobble = Math.sin(time * 1.4) * 0.03;
  ctx.fillStyle = P.waterDeep;
  ctx.beginPath();
  ctx.arc(pond.x, pond.z, pond.r + wobble, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = P.waterShallow;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(pond.x - pond.r * 0.25, pond.z - pond.r * 0.25, pond.r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#5f9c46";
  ctx.lineWidth = 0.03;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rx = pond.x + Math.cos(a) * (pond.r + 0.15);
    const rz = pond.z + Math.sin(a) * (pond.r + 0.15);
    ctx.beginPath();
    ctx.moveTo(rx, rz);
    ctx.lineTo(rx, rz - 0.16);
    ctx.stroke();
  }
}
