/**
 * Car Wash Studio — procedural vehicle painter (Canvas 2D).
 *
 * Draws the CLEAN car for one view, in view units (the caller sets the camera
 * transform). Dirt / water / foam / polish are separate per-panel composites
 * drawn on top (render/surfaceRender.js), clipped to the exact same polygons,
 * then `drawVehicleOverlay` adds the panel gaps that sit above the grime.
 *
 * Nothing here is a flat fill: paint gets a multi-stop body ramp (sky-lit top,
 * crisp shoulder highlight, horizon break, darker turned-under lower body),
 * end shading, soft studio-light reflections and a clearcoat line; glass gets
 * tint + sky reflection + interior hints; wheels get tire, sidewall, rim lip,
 * barrel, brake disc, caliper, spokes, lug nuts and a center cap.
 */
import { pathOf, linePath } from "./paths.js";
import { rgb, lighten, darken, mix } from "./color.js";
import { bbox } from "../engine/geom.js";

const TAU = Math.PI * 2;

/* ------------------------------------------------------------ helpers */

function groundShadow(ctx, x0, x1, y, ry, alpha = 0.55) {
  const cx = (x0 + x1) / 2;
  const rx = (x1 - x0) / 2;
  ctx.save();
  ctx.translate(cx, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(0.7, `rgba(0,0,0,${alpha * 0.45})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

function stop(g, t, c) {
  g.addColorStop(Math.max(0, Math.min(1, t)), c);
}

/* -------------------------------------------------------------- wheels */

const RIM_COLORS = {
  silver: [201, 206, 214],
  gunmetal: [92, 98, 106],
  black: [38, 41, 46],
  bronze: [160, 124, 76],
  chrome: [228, 234, 240],
  white: [226, 228, 230],
  gold: [196, 160, 88],
};

function spokePoly(a, rh, ro, wh, wo, bend = 0) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const px = -s;
  const py = c;
  const ab = a + bend;
  const cb = Math.cos(ab);
  const sb = Math.sin(ab);
  const qx = -sb; // perpendicular at the (possibly bent) outer end
  const qy = cb;
  return [
    [c * rh - px * wh, s * rh - py * wh],
    [cb * ro - qx * wo, sb * ro - qy * wo],
    [cb * ro + qx * wo, sb * ro + qy * wo],
    [c * rh + px * wh, s * rh + py * wh],
  ];
}

export function drawWheel(ctx, cx, cy, r, rimR, rim = {}, opts = {}) {
  const style = rim.style || "five";
  const base = RIM_COLORS[rim.color] || RIM_COLORS.silver;
  const rot = opts.angle || 0;
  ctx.save();
  ctx.translate(cx, cy);

  // tire
  const tg = ctx.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.3, 0, 0, r);
  tg.addColorStop(0, "#2a2c30");
  tg.addColorStop(0.75, "#17181b");
  tg.addColorStop(1, "#0b0c0e");
  ctx.fillStyle = tg;
  circle(ctx, 0, 0, r);
  ctx.fill();
  // sidewall bulge + highlight
  ctx.lineWidth = (r - rimR) * 0.5;
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  circle(ctx, 0, 0, rimR + (r - rimR) * 0.52);
  ctx.stroke();
  ctx.lineWidth = Math.max(0.6, r * 0.018);
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.93, Math.PI * 1.08, Math.PI * 1.62);
  ctx.stroke();
  // subtle sidewall lettering ring (generic, no brand)
  ctx.lineWidth = Math.max(0.4, r * 0.012);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.setLineDash([r * 0.08, r * 0.05]);
  circle(ctx, 0, 0, rimR + (r - rimR) * 0.45);
  ctx.stroke();
  ctx.setLineDash([]);

  // rim lip
  const lip = ctx.createLinearGradient(-rimR, -rimR, rimR, rimR);
  lip.addColorStop(0, rgb(lighten(base, 0.55)));
  lip.addColorStop(0.45, rgb(base));
  lip.addColorStop(1, rgb(darken(base, 0.55)));
  ctx.fillStyle = lip;
  circle(ctx, 0, 0, rimR);
  ctx.fill();
  // barrel (dark inside the rim)
  const bar = ctx.createRadialGradient(0, 0, rimR * 0.2, 0, 0, rimR * 0.93);
  bar.addColorStop(0, "#3a3e44");
  bar.addColorStop(1, "#15171a");
  ctx.fillStyle = bar;
  circle(ctx, 0, 0, rimR * 0.92);
  ctx.fill();

  // brake disc + caliper
  if (style !== "steel") {
    const dg = ctx.createRadialGradient(-rimR * 0.2, -rimR * 0.2, rimR * 0.1, 0, 0, rimR * 0.76);
    dg.addColorStop(0, "#a4a8ae");
    dg.addColorStop(1, "#5c6066");
    ctx.fillStyle = dg;
    circle(ctx, 0, 0, rimR * 0.76);
    ctx.fill();
    ctx.strokeStyle = "rgba(40,42,46,0.35)";
    ctx.lineWidth = rimR * 0.02;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rimR * 0.46, Math.sin(a) * rimR * 0.46);
      ctx.lineTo(Math.cos(a + 0.25) * rimR * 0.7, Math.sin(a + 0.25) * rimR * 0.7);
      ctx.stroke();
    }
    ctx.fillStyle = "#3b3f45";
    circle(ctx, 0, 0, rimR * 0.36);
    ctx.fill();
    const cal = rim.caliper || [70, 74, 80];
    ctx.save();
    ctx.rotate(-0.7);
    const cg = ctx.createLinearGradient(rimR * 0.5, -rimR * 0.2, rimR * 0.85, rimR * 0.2);
    cg.addColorStop(0, rgb(lighten(cal, 0.3)));
    cg.addColorStop(1, rgb(darken(cal, 0.35)));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, 0, rimR * 0.84, -0.42, 0.42);
    ctx.arc(0, 0, rimR * 0.56, 0.38, -0.38, true);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // spokes
  ctx.save();
  ctx.rotate(rot);
  const sg = ctx.createLinearGradient(-rimR, -rimR, rimR, rimR);
  sg.addColorStop(0, rgb(lighten(base, 0.45)));
  sg.addColorStop(0.5, rgb(base));
  sg.addColorStop(1, rgb(darken(base, 0.45)));
  ctx.fillStyle = sg;
  ctx.strokeStyle = rgb(darken(base, 0.6), 0.7);
  ctx.lineWidth = Math.max(0.3, rimR * 0.018);
  const spokes = [];
  if (style === "five") {
    for (let i = 0; i < 5; i++) spokes.push(spokePoly((i / 5) * TAU, rimR * 0.22, rimR * 0.9, rimR * 0.13, rimR * 0.2));
  } else if (style === "split") {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      spokes.push(spokePoly(a - 0.09, rimR * 0.24, rimR * 0.9, rimR * 0.055, rimR * 0.075, -0.12));
      spokes.push(spokePoly(a + 0.09, rimR * 0.24, rimR * 0.9, rimR * 0.055, rimR * 0.075, 0.12));
    }
  } else if (style === "multi") {
    for (let i = 0; i < 7; i++) spokes.push(spokePoly((i / 7) * TAU, rimR * 0.22, rimR * 0.9, rimR * 0.06, rimR * 0.09));
  } else if (style === "mesh") {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      spokes.push(spokePoly(a, rimR * 0.22, rimR * 0.9, rimR * 0.04, rimR * 0.05, 0.3));
      spokes.push(spokePoly(a, rimR * 0.22, rimR * 0.9, rimR * 0.04, rimR * 0.05, -0.3));
    }
  } else if (style === "turbine") {
    for (let i = 0; i < 12; i++) spokes.push(spokePoly((i / 12) * TAU, rimR * 0.22, rimR * 0.9, rimR * 0.05, rimR * 0.1, 0.35));
  } else if (style === "six") {
    for (let i = 0; i < 6; i++) spokes.push(spokePoly((i / 6) * TAU, rimR * 0.22, rimR * 0.9, rimR * 0.1, rimR * 0.15));
  }
  if (style === "steel") {
    const dish = ctx.createRadialGradient(-rimR * 0.3, -rimR * 0.3, rimR * 0.1, 0, 0, rimR * 0.92);
    dish.addColorStop(0, rgb(lighten(base, 0.3)));
    dish.addColorStop(1, rgb(darken(base, 0.35)));
    ctx.fillStyle = dish;
    circle(ctx, 0, 0, rimR * 0.9);
    ctx.fill();
    ctx.fillStyle = "#1c1e21";
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(rimR * 0.6, 0, rimR * 0.13, rimR * 0.08, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  } else {
    for (const sp of spokes) {
      ctx.beginPath();
      ctx.moveTo(sp[0][0], sp[0][1]);
      for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i][0], sp[i][1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // spoke face highlight
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (let k = 0; k < spokes.length; k++) {
      const sp = spokes[k];
      ctx.beginPath();
      ctx.moveTo(sp[0][0], sp[0][1]);
      ctx.lineTo(sp[1][0], sp[1][1]);
      ctx.lineTo((sp[1][0] + sp[2][0]) / 2, (sp[1][1] + sp[2][1]) / 2);
      ctx.lineTo((sp[0][0] + sp[3][0]) / 2, (sp[0][1] + sp[3][1]) / 2);
      ctx.closePath();
      ctx.fill();
    }
  }
  // hub + lug nuts
  const hub = ctx.createRadialGradient(-rimR * 0.08, -rimR * 0.08, 0, 0, 0, rimR * 0.3);
  hub.addColorStop(0, rgb(lighten(base, 0.35)));
  hub.addColorStop(1, rgb(darken(base, 0.3)));
  ctx.fillStyle = hub;
  circle(ctx, 0, 0, rimR * 0.28);
  ctx.fill();
  ctx.fillStyle = rgb(darken(base, 0.5));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    circle(ctx, Math.cos(a) * rimR * 0.19, Math.sin(a) * rimR * 0.19, rimR * 0.035);
    ctx.fill();
  }
  ctx.restore();
  // center cap: plain, unbranded
  ctx.fillStyle = "#1e2024";
  circle(ctx, 0, 0, rimR * 0.12);
  ctx.fill();
  ctx.strokeStyle = rgb(lighten(base, 0.2), 0.8);
  ctx.lineWidth = rimR * 0.022;
  circle(ctx, 0, 0, rimR * 0.085);
  ctx.stroke();

  // rim lip inner shadow + outer bright edge
  ctx.lineWidth = rimR * 0.05;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  circle(ctx, 0, 0, rimR * 0.9);
  ctx.stroke();
  ctx.lineWidth = rimR * 0.03;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(0, 0, rimR * 0.975, Math.PI * 1.05, Math.PI * 1.7);
  ctx.stroke();

  // moving shine (main menu) — a single soft glint sweeping around the lip
  if (opts.shine != null) {
    ctx.save();
    ctx.rotate(opts.shine);
    const g = ctx.createRadialGradient(rimR * 0.9, 0, 0, rimR * 0.9, 0, rimR * 0.35);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    circle(ctx, rimR * 0.9, 0, rimR * 0.35);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- glass */

function glassFill(ctx, poly, look, box) {
  const b = box || bbox(poly);
  const tint = look.glassTint || [24, 34, 46];
  const g = ctx.createLinearGradient(0, b.y0, 0, b.y1);
  g.addColorStop(0, rgb(lighten(tint, 0.18)));
  g.addColorStop(0.45, rgb(tint));
  g.addColorStop(1, rgb(darken(tint, 0.35)));
  ctx.fillStyle = g;
  ctx.fill(pathOf(poly));
}

function glassReflect(ctx, poly, box, strength = 1) {
  const b = box || bbox(poly);
  ctx.save();
  ctx.clip(pathOf(poly));
  // sky band
  const sky = ctx.createLinearGradient(0, b.y0, 0, b.y0 + b.h * 0.55);
  sky.addColorStop(0, `rgba(190,215,240,${0.22 * strength})`);
  sky.addColorStop(1, "rgba(190,215,240,0)");
  ctx.fillStyle = sky;
  ctx.fillRect(b.x0, b.y0, b.w, b.h);
  // two diagonal streaks
  ctx.fillStyle = `rgba(255,255,255,${0.1 * strength})`;
  const s = b.h;
  for (const [off, w] of [[0.22, 0.14], [0.47, 0.05]]) {
    const x = b.x0 + b.w * off;
    ctx.beginPath();
    ctx.moveTo(x, b.y1);
    ctx.lineTo(x + w * b.w, b.y1);
    ctx.lineTo(x + w * b.w + s * 0.6, b.y0);
    ctx.lineTo(x + s * 0.6, b.y0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------ side view */

function topYAt(outline, x) {
  let best = Infinity;
  for (const p of outline) if (Math.abs(p[0] - x) < 6 && p[1] < best) best = p[1];
  return best;
}

function sidePaintGradient(ctx, sv, P) {
  const y0 = sv.bbox.y0;
  const belt = bbox(sv.dlo).y1;
  const charY = sv.character.reduce((s, p) => s + p[1], 0) / sv.character.length;
  const T = (y) => (y - y0) / (0 - y0);
  const g = ctx.createLinearGradient(0, y0, 0, 0);
  stop(g, 0, rgb(P.top));
  stop(g, T(belt) - 0.05, rgb(mix(P.top, P.mid, 0.45)));
  stop(g, T(belt) + 0.004, rgb(P.shoulder));
  stop(g, T(belt) + 0.06, rgb(mix(P.shoulder, P.mid, 0.7)));
  stop(g, T(charY) - 0.01, rgb(lighten(P.mid, 0.04)));
  stop(g, T(charY) + 0.035, rgb(P.low));
  stop(g, T(sv.sill) - 0.02, rgb(P.bottom));
  stop(g, 1, rgb(mix(P.bottom, P.low, 0.5)));
  return g;
}

export function drawSideBase(ctx, sv, look, opts = {}) {
  const P = look.paint;
  const bb = sv.bbox;
  const L = bb.w;
  const body = pathOf(sv.outline);
  const dloBox = bbox(sv.dlo);
  const belt = dloBox.y1;

  groundShadow(ctx, bb.x0 - L * 0.02, bb.x1 + L * 0.02, 0, L * 0.035, 0.6);

  // open-top seats peek above the doors
  if (sv.headrests) {
    for (const [hx, hy] of sv.headrests) {
      ctx.fillStyle = "#1d1f23";
      ctx.beginPath();
      ctx.ellipse(hx, hy - 16, 9, 14, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#2b2e33";
      ctx.beginPath();
      ctx.ellipse(hx - (sv.mirrored ? -8 : 8), hy - 30, 7, 7, 0, 0, TAU);
      ctx.fill();
    }
  }

  // arch liners (dark wells behind the wheels)
  for (const w of sv.wheels) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(w.cx - w.arch * 1.2, w.acy - w.arch * 1.2, w.arch * 2.4, w.arch * 1.2 + (sv.sill - w.acy) + 1);
    ctx.clip();
    const lg = ctx.createRadialGradient(w.cx, w.acy, w.r * 0.9, w.cx, w.acy, w.arch);
    lg.addColorStop(0, "#050506");
    lg.addColorStop(1, "#1a1b1e");
    ctx.fillStyle = lg;
    circle(ctx, w.cx, w.acy, w.arch);
    ctx.fill();
    ctx.restore();
  }
  for (const w of sv.wheels) {
    groundShadow(ctx, w.cx - w.r * 1.1, w.cx + w.r * 1.1, 0, w.r * 0.14, 0.75);
    drawWheel(ctx, w.cx, w.cy, w.r, w.rimR, look.rim, { angle: w.pos === "F" ? 0.35 : 1.2, shine: opts.wheelShine });
  }

  // body paint
  ctx.fillStyle = sidePaintGradient(ctx, sv, P);
  ctx.fill(body);

  ctx.save();
  ctx.clip(body);
  // ends turn away from the viewer
  const eg = ctx.createLinearGradient(bb.x0, 0, bb.x1, 0);
  eg.addColorStop(0, "rgba(0,0,0,0.32)");
  eg.addColorStop(0.07, "rgba(0,0,0,0)");
  eg.addColorStop(0.93, "rgba(0,0,0,0)");
  eg.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = eg;
  ctx.fillRect(bb.x0, bb.y0, bb.w, bb.h + 5);

  // soft studio-light reflections on the doors
  for (const [f, wf] of [[0.3, 0.1], [0.64, 0.07]]) {
    const x = bb.x0 + L * f;
    const rg = ctx.createRadialGradient(x, belt + 16, 2, x, belt + 16, L * wf);
    rg.addColorStop(0, `rgba(255,255,255,${P.lum > 0.7 ? 0.1 : 0.13})`);
    rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save();
    ctx.translate(x, belt + 16);
    ctx.scale(1, 0.45);
    ctx.translate(-x, -(belt + 16));
    ctx.fillStyle = rg;
    ctx.fillRect(x - L * wf, belt + 16 - L * wf, L * wf * 2, L * wf * 2);
    ctx.restore();
  }

  // clearcoat line just under the belt
  const cl = ctx.createLinearGradient(bb.x0, 0, bb.x1, 0);
  cl.addColorStop(0, "rgba(255,255,255,0)");
  cl.addColorStop(0.2, `rgba(255,255,255,${P.lum > 0.7 ? 0.5 : 0.38})`);
  cl.addColorStop(0.8, `rgba(255,255,255,${P.lum > 0.7 ? 0.5 : 0.3})`);
  cl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.strokeStyle = cl;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(bb.x0 + L * 0.08, belt + 3.5);
  ctx.lineTo(bb.x1 - L * 0.08, belt + 2.5);
  ctx.stroke();

  // character crease: light above, shadow below
  const ch = linePath(sv.character);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.stroke(ch);
  ctx.save();
  ctx.translate(0, 1.6);
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 1.8;
  ctx.stroke(ch);
  ctx.restore();

  // lower lips: front splitter / rear diffuser area
  const w0 = sv.wheels[0];
  const w1 = sv.wheels[1];
  const frontX = sv.mirrored ? Math.max(w0.cx, w1.cx) : Math.min(w0.cx, w1.cx);
  const rearX = sv.mirrored ? Math.min(w0.cx, w1.cx) : Math.max(w0.cx, w1.cx);
  const lipY = sv.sill - 6;
  ctx.fillStyle = "#16181b";
  if (!sv.mirrored) {
    ctx.fillRect(bb.x0 - 2, lipY, frontX - w0.arch - bb.x0 + 2, 20);
    ctx.fillRect(rearX + w1.arch, lipY + 2, bb.x1 - rearX - w1.arch + 2, 20);
  } else {
    ctx.fillRect(frontX + w0.arch, lipY, bb.x1 - frontX - w0.arch + 2, 20);
    ctx.fillRect(bb.x0 - 2, lipY + 2, rearX - w1.arch - bb.x0 + 2, 20);
  }

  // rocker / cladding
  ctx.fillStyle = sv.cladding ? "#24262a" : rgb(darken(P.bottom, 0.25));
  ctx.fill(pathOf(sv.rocker));
  if (sv.cladding) {
    ctx.strokeStyle = "#26282c";
    ctx.lineWidth = 7;
    for (const w of sv.wheels) {
      ctx.beginPath();
      ctx.arc(w.cx, w.acy, w.arch + 3, Math.PI * 1.02, Math.PI * 1.98);
      ctx.stroke();
    }
  }
  // arch lip shading
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2.2;
  for (const w of sv.wheels) {
    ctx.beginPath();
    ctx.arc(w.cx, w.acy, w.arch + 1, Math.PI * 1.02, Math.PI * 1.98);
    ctx.stroke();
  }
  ctx.restore();

  // headlight sliver
  const hl = pathOf(sv.headlight);
  const hb = bbox(sv.headlight);
  const hg = ctx.createLinearGradient(0, hb.y0, 0, hb.y1);
  hg.addColorStop(0, "#e8eef4");
  hg.addColorStop(0.5, "#9aa6b2");
  hg.addColorStop(1, "#3f4852");
  ctx.fillStyle = hg;
  ctx.fill(hl);
  ctx.save();
  ctx.clip(hl);
  ctx.fillStyle = "rgba(20,24,30,0.55)";
  ctx.fillRect(hb.x0 + hb.w * (sv.mirrored ? 0.1 : 0.45), hb.y0 + hb.h * 0.35, hb.w * 0.45, hb.h);
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(hb.x0 + hb.w * 0.1, hb.y0 + hb.h * 0.35);
  ctx.lineTo(hb.x1 - hb.w * 0.1, hb.y0 + hb.h * 0.2);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 0.8;
  ctx.stroke(hl);

  // taillight
  const tl = pathOf(sv.taillight);
  const tb = bbox(sv.taillight);
  const tg2 = ctx.createLinearGradient(0, tb.y0, 0, tb.y1);
  tg2.addColorStop(0, "#ff5a55");
  tg2.addColorStop(0.5, "#b3161b");
  tg2.addColorStop(1, "#5b0a0e");
  ctx.fillStyle = tg2;
  ctx.fill(tl);
  ctx.strokeStyle = "rgba(255,190,190,0.7)";
  ctx.lineWidth = 1;
  ctx.save();
  ctx.clip(tl);
  ctx.beginPath();
  ctx.moveTo(tb.x0, tb.y0 + tb.h * 0.4);
  ctx.lineTo(tb.x1, tb.y0 + tb.h * 0.3);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 0.8;
  ctx.stroke(tl);

  // glass
  glassFill(ctx, sv.dlo, look, dloBox);
  if (!sv.noSideGlass) {
    ctx.save();
    ctx.clip(pathOf(sv.dlo));
    // interior hints: headrests + a door-top line seen through the glass
    ctx.fillStyle = "rgba(6,8,10,0.45)";
    const hx = [0.37, 0.72].map((f) => dloBox.x0 + dloBox.w * (sv.mirrored ? 1 - f : f));
    for (const x of hx) {
      ctx.beginPath();
      ctx.ellipse(x, dloBox.y0 + dloBox.h * 0.55, dloBox.h * 0.16, dloBox.h * 0.24, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(dloBox.x0, dloBox.y1 - dloBox.h * 0.16, dloBox.w, dloBox.h * 0.16);
    ctx.restore();
  }
  glassReflect(ctx, sv.dlo, dloBox, 1);
  // pillars
  ctx.save();
  ctx.clip(pathOf(sv.dlo));
  for (const p of sv.pillars) {
    const pb = bbox(p);
    const pg = ctx.createLinearGradient(pb.x0, 0, pb.x1, 0);
    pg.addColorStop(0, "#15181c");
    pg.addColorStop(0.5, "#2a2f36");
    pg.addColorStop(1, "#0f1114");
    ctx.fillStyle = pg;
    ctx.fill(pathOf(p));
  }
  ctx.restore();
  // window seal
  ctx.strokeStyle = look.chrome ? "rgba(225,230,236,0.9)" : "#0c0d0f";
  ctx.lineWidth = look.chrome ? 1.6 : 2;
  ctx.stroke(pathOf(sv.dlo));

  // roof rails
  if (sv.roofRails) {
    const [ra, rb] = sv.roofRails;
    const xa = Math.min(ra, rb);
    const xb = Math.max(ra, rb);
    const ya = topYAt(sv.outline, xa);
    const yb2 = topYAt(sv.outline, xb);
    ctx.strokeStyle = "#1a1c20";
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(xa, ya - 4);
    ctx.lineTo(xb, yb2 - 4);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    for (const x of [xa + 4, xb - 4]) {
      ctx.beginPath();
      ctx.moveTo(x, topYAt(sv.outline, x) - 4);
      ctx.lineTo(x, topYAt(sv.outline, x) + 0.5);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }
  // hatch spoiler
  if (sv.spoiler) {
    const ro = sv.outline.reduce((best, p) => (p[1] < -sv.H * 0.9 && (sv.mirrored ? p[0] < best[0] : p[0] > best[0]) ? p : best), [sv.mirrored ? 1e4 : -1e4, 0]);
    const dir = sv.mirrored ? -1 : 1;
    ctx.fillStyle = "#15171a";
    ctx.beginPath();
    ctx.moveTo(ro[0] - dir * 22, ro[1] - 0.5);
    ctx.lineTo(ro[0] + dir * 5, ro[1] - 2.5);
    ctx.lineTo(ro[0] + dir * 4, ro[1] + 2.5);
    ctx.lineTo(ro[0] - dir * 20, ro[1] + 1.2);
    ctx.closePath();
    ctx.fill();
  }
  // pickup bed rail cap
  if (sv.bed) {
    ctx.fillStyle = "#1b1d21";
    ctx.fillRect(sv.bed.x0 + 1, sv.bed.y - 1, sv.bed.x1 - sv.bed.x0 - 3, 3.2);
  }
  // van slide track
  if (sv.slideTrack) {
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(sv.slideTrack[0], sv.slideTrack[2]);
    ctx.lineTo(sv.slideTrack[1], sv.slideTrack[2]);
    ctx.stroke();
  }

  // mirror
  const mp = pathOf(sv.mirror);
  const mb = bbox(sv.mirror);
  const mg = ctx.createLinearGradient(0, mb.y0, 0, mb.y1);
  mg.addColorStop(0, rgb(P.top));
  mg.addColorStop(0.6, rgb(P.mid));
  mg.addColorStop(1, rgb(P.low));
  ctx.fillStyle = mg;
  ctx.fill(mp);
  ctx.fillStyle = "#121417";
  ctx.beginPath();
  const mx0 = sv.mirrored ? mb.x1 : mb.x0;
  const md = sv.mirrored ? -1 : 1;
  ctx.moveTo(mx0 + md * 2, mb.y1 - 1);
  ctx.lineTo(mx0 + md * mb.w * 0.45, mb.y1 - 1);
  ctx.lineTo(mx0 + md * mb.w * 0.3, mb.y1 + 4);
  ctx.lineTo(mx0 + md * 3, mb.y1 + 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 0.8;
  ctx.stroke(mp);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(mb.x0 + mb.w * 0.2, mb.y0 + 1.5);
  ctx.lineTo(mb.x1 - mb.w * 0.25, mb.y0 + 1.2);
  ctx.stroke();

  // handles (recessed)
  for (const [hx, hy] of sv.handles) {
    const w = 17;
    const h = 3.6;
    ctx.fillStyle = look.chrome ? "#d9dee4" : rgb(darken(P.mid, 0.28));
    ctx.beginPath();
    ctx.roundRect(hx - w / 2, hy - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(hx - w / 2 + 2, hy - h / 2 + 0.6);
    ctx.lineTo(hx + w / 2 - 2, hy - h / 2 + 0.6);
    ctx.stroke();
  }
  if (sv.fuel) {
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(sv.fuel[0] - 7, sv.fuel[1] - 6, 14, 12, 3);
    ctx.stroke();
  }
}

export function drawSideOverlay(ctx, sv) {
  ctx.save();
  ctx.clip(pathOf(sv.outline));
  const ex = new Path2D();
  ex.rect(-1e5, -1e5, 2e5, 2e5);
  ex.addPath(pathOf(sv.dlo));
  ctx.clip(ex, "evenodd");
  for (const w of sv.wheels) {
    const ew = new Path2D();
    ew.rect(-1e5, -1e5, 2e5, 2e5);
    ew.arc(w.cx, w.acy, w.arch, 0, TAU);
    ctx.clip(ew, "evenodd");
  }
  const lines = [...sv.doorLines];
  if (sv.trunkLine) lines.push(sv.trunkLine);
  for (const l of lines) {
    const p = linePath(l);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1.3;
    ctx.stroke(p);
    ctx.save();
    ctx.translate(1, 0);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 0.7;
    ctx.stroke(p);
    ctx.restore();
  }
  ctx.restore();
}

/* ----------------------------------------------------------- front view */

function faceGradient(ctx, y0, y1, P) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgb(P.shoulder));
  g.addColorStop(0.12, rgb(mix(P.shoulder, P.mid, 0.6)));
  g.addColorStop(0.55, rgb(P.mid));
  g.addColorStop(1, rgb(P.bottom));
  return g;
}

function sideShade(ctx, box, a = 0.35) {
  const g = ctx.createLinearGradient(box.x0, 0, box.x1, 0);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(0.14, "rgba(0,0,0,0)");
  g.addColorStop(0.86, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(box.x0, box.y0, box.w, box.h);
}

function drawTires(ctx, tires) {
  for (const t of tires) {
    const b = bbox(t);
    const g = ctx.createLinearGradient(b.x0, 0, b.x1, 0);
    g.addColorStop(0, "#0b0c0e");
    g.addColorStop(0.45, "#26282c");
    g.addColorStop(1, "#0b0c0e");
    ctx.fillStyle = g;
    ctx.fill(pathOf(t));
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 0.8;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(b.x0 + (b.w * i) / 4, b.y0 + 2);
      ctx.lineTo(b.x0 + (b.w * i) / 4, b.y1 - 1);
      ctx.stroke();
    }
  }
}

function drawPlate(ctx, poly, text) {
  const b = bbox(poly);
  ctx.fillStyle = "#e9ecef";
  ctx.fill(pathOf(poly));
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 0.8;
  ctx.stroke(pathOf(poly));
  ctx.fillStyle = "#2a3140";
  ctx.font = `700 ${b.h * 0.62}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, b.x0 + b.w / 2, b.y0 + b.h * 0.54);
}

function mirrorsFront(ctx, mirrors, P) {
  for (const m of mirrors) {
    const b = bbox(m);
    const g = ctx.createLinearGradient(0, b.y0, 0, b.y1);
    g.addColorStop(0, rgb(P.top));
    g.addColorStop(1, rgb(P.low));
    ctx.fillStyle = g;
    ctx.fill(pathOf(m));
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 0.8;
    ctx.stroke(pathOf(m));
  }
}

export function drawFrontBase(ctx, fv, look) {
  const P = look.paint;
  const hw = fv.hw;
  groundShadow(ctx, -hw * 1.2, hw * 1.2, 0, 12, 0.65);
  // underbody gap
  ctx.fillStyle = "rgba(6,7,8,0.8)";
  ctx.fillRect(-hw * 0.84, fv.yb - 4, hw * 1.68, -fv.yb + 1);
  drawTires(ctx, fv.tires);

  // roof + pillars
  if (fv.roof) {
    const rb = bbox(fv.roof);
    const g = ctx.createLinearGradient(0, rb.y0, 0, rb.y1);
    g.addColorStop(0, rgb(lighten(P.top, 0.1)));
    g.addColorStop(0.5, rgb(P.top));
    g.addColorStop(1, rgb(P.mid));
    ctx.fillStyle = g;
    ctx.fill(pathOf(fv.roof));
    ctx.save();
    ctx.clip(pathOf(fv.roof));
    sideShade(ctx, rb, 0.3);
    ctx.restore();
  }
  // windshield
  const wb = bbox(fv.windshield);
  if (fv.open) {
    // cockpit seen over the dash
    ctx.fillStyle = "#15171a";
    ctx.fill(pathOf(fv.cockpit));
    ctx.fillStyle = "#24272c";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * hw * 0.3, fv.yA - 10, hw * 0.16, 11, 0, 0, TAU);
      ctx.fill();
    }
  }
  glassFill(ctx, fv.windshield, look, wb);
  ctx.save();
  ctx.clip(pathOf(fv.windshield));
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(wb.x0, wb.y1 - wb.h * 0.18, wb.w, wb.h * 0.18);
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(-hw * 0.34, wb.y1 - wb.h * 0.12, wb.h * 0.2, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * hw * 0.33, wb.y0 + wb.h * 0.42, hw * 0.13, wb.h * 0.2, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  glassReflect(ctx, fv.windshield, wb, 1.1);
  if (fv.open) {
    ctx.strokeStyle = "#16181b";
    ctx.lineWidth = 3;
    ctx.stroke(pathOf(fv.windshield));
  }

  // hood
  const hb = bbox(fv.hood);
  const hg = ctx.createLinearGradient(0, hb.y1, 0, hb.y0);
  hg.addColorStop(0, rgb(mix(P.mid, P.shoulder, 0.4)));
  hg.addColorStop(0.6, rgb(P.top));
  hg.addColorStop(1, rgb(lighten(P.top, 0.12)));
  ctx.fillStyle = hg;
  ctx.fill(pathOf(fv.hood));
  ctx.save();
  ctx.clip(pathOf(fv.hood));
  sideShade(ctx, hb, 0.28);
  const bulge = ctx.createRadialGradient(0, hb.y0 + hb.h * 0.55, 2, 0, hb.y0 + hb.h * 0.55, hw * 0.55);
  bulge.addColorStop(0, "rgba(255,255,255,0.14)");
  bulge.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = bulge;
  ctx.fillRect(hb.x0, hb.y0, hb.w, hb.h);
  ctx.lineWidth = 1;
  for (const s of [-1, 1]) {
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(s * hw * 0.52, hb.y1);
    ctx.lineTo(s * hw * 0.44, hb.y0);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.moveTo(s * hw * 0.54, hb.y1);
    ctx.lineTo(s * hw * 0.46, hb.y0);
    ctx.stroke();
  }
  ctx.restore();

  // face
  const fb = bbox(fv.face);
  ctx.fillStyle = faceGradient(ctx, fb.y0, fb.y1, P);
  ctx.fill(pathOf(fv.face));
  ctx.save();
  ctx.clip(pathOf(fv.face));
  sideShade(ctx, fb, 0.38);
  // lower lip
  ctx.fillStyle = "#15171a";
  ctx.fillRect(fb.x0, fv.yb - 5, fb.w, 6);
  ctx.restore();

  // intakes
  for (const it of fv.intakes) {
    ctx.fillStyle = "#101214";
    ctx.fill(pathOf(it));
    const ib = bbox(it);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 0.6;
    for (let y = ib.y0 + 2; y < ib.y1; y += 2.5) {
      ctx.beginPath();
      ctx.moveTo(ib.x0 + 1, y);
      ctx.lineTo(ib.x1 - 1, y);
      ctx.stroke();
    }
  }
  // grille
  const gb = bbox(fv.grille);
  ctx.fillStyle = "#0e1012";
  ctx.fill(pathOf(fv.grille));
  ctx.save();
  ctx.clip(pathOf(fv.grille));
  if (fv.grilleStyle === "mesh") {
    ctx.fillStyle = "rgba(120,126,134,0.28)";
    for (let y = gb.y0 + 2, row = 0; y < gb.y1; y += 3.4, row++) {
      for (let x = gb.x0 + (row % 2) * 2.4; x < gb.x1; x += 4.8) {
        ctx.beginPath();
        ctx.ellipse(x, y, 1.5, 1, 0, 0, TAU);
        ctx.fill();
      }
    }
  } else {
    const step = fv.grilleStyle === "wide" ? 3 : 4.5;
    for (let y = gb.y0 + step * 0.6; y < gb.y1; y += step) {
      ctx.fillStyle = look.chrome ? "rgba(220,226,232,0.7)" : "rgba(90,96,104,0.55)";
      ctx.fillRect(gb.x0, y, gb.w, fv.grilleStyle === "wide" ? 0.8 : 1.4);
    }
  }
  ctx.restore();
  ctx.strokeStyle = look.chrome ? "#dfe4ea" : "#2a2d31";
  ctx.lineWidth = look.chrome ? 1.8 : 1.4;
  ctx.stroke(pathOf(fv.grille));
  ctx.fillStyle = "#121417";
  ctx.fill(pathOf(fv.slot));

  // headlights
  for (let i = 0; i < 2; i++) {
    const h = fv.headlights[i];
    const b = bbox(h);
    const g = ctx.createLinearGradient(0, b.y0, 0, b.y1);
    g.addColorStop(0, "#eef3f7");
    g.addColorStop(0.5, "#8d98a4");
    g.addColorStop(1, "#353c44");
    ctx.fillStyle = g;
    ctx.fill(pathOf(h));
    ctx.save();
    ctx.clip(pathOf(h));
    const s = i === 0 ? 1 : -1;
    for (const f of [0.35, 0.68]) {
      const cx = b.x0 + b.w * (s === 1 ? f : 1 - f);
      const rg = ctx.createRadialGradient(cx, b.y0 + b.h * 0.55, 0.5, cx, b.y0 + b.h * 0.55, b.h * 0.34);
      rg.addColorStop(0, "#ffffff");
      rg.addColorStop(0.5, "#b9c3cd");
      rg.addColorStop(1, "#4a525c");
      ctx.fillStyle = rg;
      circle(ctx, cx, b.y0 + b.h * 0.55, b.h * 0.3);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(b.x0 + 1.5, b.y0 + b.h * 0.22);
    ctx.lineTo(b.x1 - 1.5, b.y0 + b.h * 0.18);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 0.8;
    ctx.stroke(pathOf(h));
  }
  drawPlate(ctx, fv.plate, look.plate || "CW 01");
  mirrorsFront(ctx, fv.mirrors, P);
}

export function drawFrontOverlay(ctx, fv) {
  // wiper blades sit on the glass above any grime
  ctx.strokeStyle = "#0d0e10";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  const wb = bbox(fv.windshield);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * fv.hw * 0.08 - fv.hw * 0.1, wb.y1 - 2);
    ctx.lineTo(s * fv.hw * 0.08 + fv.hw * 0.42 - fv.hw * 0.1, wb.y1 - 5);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  // hood / face seam
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 1.2;
  const hb = bbox(fv.hood);
  ctx.beginPath();
  ctx.moveTo(hb.x0 + 3, fv.yF);
  ctx.lineTo(hb.x1 - 3, fv.yF);
  ctx.stroke();
}

/* ------------------------------------------------------------ rear view */

export function drawRearBase(ctx, rv, look) {
  const P = look.paint;
  const hw = rv.hw;
  groundShadow(ctx, -hw * 1.2, hw * 1.2, 0, 12, 0.65);
  ctx.fillStyle = "rgba(6,7,8,0.8)";
  ctx.fillRect(-hw * 0.84, rv.yb - 4, hw * 1.68, -rv.yb + 1);
  drawTires(ctx, rv.tires);

  if (rv.open) {
    // cockpit behind the deck: headrests + windshield frame
    ctx.fillStyle = "#15171a";
    ctx.beginPath();
    ctx.moveTo(-hw * 0.78, rv.yGB);
    ctx.lineTo(hw * 0.78, rv.yGB);
    ctx.lineTo(hw * 0.62, rv.frontFrameY + 8);
    ctx.lineTo(-hw * 0.62, rv.frontFrameY + 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#1e2024";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.64, rv.frontFrameY + 12);
    ctx.lineTo(-hw * 0.58, rv.frontFrameY);
    ctx.lineTo(hw * 0.58, rv.frontFrameY);
    ctx.lineTo(hw * 0.64, rv.frontFrameY + 12);
    ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.fillStyle = "#2a2d32";
      ctx.beginPath();
      ctx.ellipse(s * hw * 0.3, rv.yGB - 14, hw * 0.15, 13, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#34383e";
      ctx.beginPath();
      ctx.ellipse(s * hw * 0.3, rv.yGB - 30, hw * 0.1, 8, 0, 0, TAU);
      ctx.fill();
    }
  }
  if (rv.roof) {
    const rb = bbox(rv.roof);
    const g = ctx.createLinearGradient(0, rb.y0, 0, rb.y1);
    g.addColorStop(0, rgb(lighten(P.top, 0.1)));
    g.addColorStop(1, rgb(P.mid));
    ctx.fillStyle = g;
    ctx.fill(pathOf(rv.roof));
    ctx.save();
    ctx.clip(pathOf(rv.roof));
    sideShade(ctx, rb, 0.3);
    ctx.restore();
  }
  if (rv.bedArea) {
    const bb2 = bbox(rv.bedArea);
    ctx.fillStyle = "#1a1c1f";
    ctx.fill(pathOf(rv.bedArea));
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1.2;
    for (let i = 1; i < 7; i++) {
      const x = bb2.x0 + (bb2.w * i) / 7;
      ctx.beginPath();
      ctx.moveTo(x, bb2.y1);
      ctx.lineTo(x * 0.92, bb2.y0);
      ctx.stroke();
    }
    ctx.fillStyle = "#23262a";
    ctx.fillRect(bb2.x0, bb2.y0 - 2, bb2.w, 3);
  }
  if (rv.glass) {
    const gb = bbox(rv.glass);
    glassFill(ctx, rv.glass, look, gb);
    ctx.save();
    ctx.clip(pathOf(rv.glass));
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * hw * 0.32, gb.y1 - gb.h * 0.25, hw * 0.12, gb.h * 0.22, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    glassReflect(ctx, rv.glass, gb, 1);
    // defroster lines
    ctx.save();
    ctx.clip(pathOf(rv.glass));
    ctx.strokeStyle = "rgba(160,110,80,0.18)";
    ctx.lineWidth = 0.5;
    for (let y = gb.y0 + gb.h * 0.2; y < gb.y1 - 3; y += gb.h * 0.09) {
      ctx.beginPath();
      ctx.moveTo(gb.x0 + gb.w * 0.12, y);
      ctx.lineTo(gb.x1 - gb.w * 0.12, y);
      ctx.stroke();
    }
    if (rv.barn) {
      ctx.strokeStyle = "#16181b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, gb.y0);
      ctx.lineTo(0, gb.y1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // face (tailgate / bumper / deck)
  const fb = bbox(rv.face);
  ctx.fillStyle = faceGradient(ctx, fb.y0, fb.y1, P);
  ctx.fill(pathOf(rv.face));
  ctx.save();
  ctx.clip(pathOf(rv.face));
  sideShade(ctx, fb, 0.36);
  if (rv.deck) {
    const dg = ctx.createLinearGradient(0, rv.yGB, 0, rv.yT);
    dg.addColorStop(0, rgb(lighten(P.top, 0.1), 0.9));
    dg.addColorStop(1, rgb(P.top, 0.2));
    ctx.fillStyle = dg;
    ctx.fillRect(fb.x0, rv.yGB, fb.w, rv.yT - rv.yGB);
  }
  // bumper crease + diffuser
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fb.x0, rv.bumperLine);
  ctx.lineTo(fb.x1, rv.bumperLine);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.moveTo(fb.x0, rv.bumperLine + 1.5);
  ctx.lineTo(fb.x1, rv.bumperLine + 1.5);
  ctx.stroke();
  ctx.fillStyle = "#15171a";
  ctx.fillRect(fb.x0, rv.yb - 7, fb.w, 8);
  ctx.restore();

  for (const t of rv.taillights) {
    const b = bbox(t);
    const g = ctx.createLinearGradient(0, b.y0, 0, b.y1);
    g.addColorStop(0, "#ff6a63");
    g.addColorStop(0.55, "#b8141a");
    g.addColorStop(1, "#5e080d");
    ctx.fillStyle = g;
    ctx.fill(pathOf(t));
    ctx.save();
    ctx.clip(pathOf(t));
    ctx.strokeStyle = "rgba(255,210,205,0.85)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(b.x0 + 1, b.y0 + b.h * 0.35);
    ctx.lineTo(b.x1 - 1, b.y0 + b.h * 0.3);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 0.8;
    ctx.stroke(pathOf(t));
  }
  drawPlate(ctx, rv.plate, look.plate || "CW 01");
  // exhaust tip
  const eb = bbox(rv.exhaust);
  const eg = ctx.createRadialGradient(eb.x0 + eb.w * 0.4, eb.y0 + eb.h * 0.35, 0.5, eb.x0 + eb.w / 2, eb.y0 + eb.h / 2, eb.w * 0.6);
  eg.addColorStop(0, "#f2f4f6");
  eg.addColorStop(0.6, "#9aa0a8");
  eg.addColorStop(1, "#4a4f56");
  ctx.fillStyle = eg;
  ctx.fill(pathOf(rv.exhaust));
  ctx.fillStyle = "#0b0c0d";
  ctx.beginPath();
  ctx.ellipse(eb.x0 + eb.w / 2, eb.y0 + eb.h / 2 + 0.3, eb.w * 0.34, eb.h * 0.3, 0, 0, TAU);
  ctx.fill();
}

export function drawRearOverlay(ctx, rv) {
  if (rv.glass && rv.wiper) {
    const gb = bbox(rv.glass);
    ctx.strokeStyle = "#0d0e10";
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, gb.y1 - 2);
    ctx.lineTo(-gb.w * 0.3, gb.y1 - gb.h * 0.35);
    ctx.stroke();
    ctx.lineCap = "butt";
  }
  // tailgate / deck seam
  const fb = bbox(rv.face);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(fb.x0 + fb.w * 0.1, rv.bumperLine - 3);
  ctx.lineTo(fb.x1 - fb.w * 0.1, rv.bumperLine - 3);
  ctx.stroke();
}

/* ------------------------------------------------------------ dispatch */

export function drawVehicleBase(ctx, model, view, look, opts) {
  const v = model.views[view];
  if (view === "left" || view === "right") drawSideBase(ctx, v, look, opts);
  else if (view === "front") drawFrontBase(ctx, v, look);
  else if (view === "rear") drawRearBase(ctx, v, look);
}

export function drawVehicleOverlay(ctx, model, view) {
  const v = model.views[view];
  if (view === "left" || view === "right") drawSideOverlay(ctx, v);
  else if (view === "front") drawFrontOverlay(ctx, v);
  else if (view === "rear") drawRearOverlay(ctx, v);
}
