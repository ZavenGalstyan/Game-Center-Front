/**
 * Boxing Club — fighter painter (Canvas 2D). Draws a pose from rig.js:
 * shaded tapered limbs, a sculpted torso that follows the spine, shorts
 * with waistband and stripe, profile head with hair, laced gloves with
 * cuffs, and boots. Parts are drawn back-to-front by depth, so the far arm
 * is behind the body and the near arm in front of it.
 */
import { GLOVE_R } from "./rig.js";

export const SKIN_TONES = ["#f3cfb1", "#e5b18c", "#c98c5f", "#a86c43", "#7f4b2c", "#5b3521"];

function hexToRgb(h) {
  if (h.startsWith("rgb")) return h.slice(h.indexOf("(") + 1, -1).split(",").slice(0, 3).map(Number);
  const x = h.length === 4 ? h.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3") : h;
  const n = parseInt(x.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const c = (v) => Math.round(v + (t - v) * p);
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

export const DEPTH_Y = 0.5; // how far "toward the camera" drops on screen (elevated view)

/** Local → screen. `cam` = { cx, floorY, S, camX }. */
export function makeProjector(cam, f) {
  return (p) => {
    const sc = 1 + p.z * 0.06;
    return {
      x: cam.cx + (f.x + f.facing * p.x - cam.camX) * cam.S * sc,
      y: cam.floorY - p.y * cam.S * sc + p.z * cam.S * DEPTH_Y,
      z: p.z,
    };
  };
}

/** Capsule path filled either with the current fillStyle (tone null) or a cross-limb gradient. */
function capsule(ctx, a, b, ra, rb, tone) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.arc(b.x, b.y, rb, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.arc(a.x, a.y, ra, ang + Math.PI / 2, ang + (Math.PI * 3) / 2);
  ctx.closePath();
  if (tone) {
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    const g = ctx.createLinearGradient(a.x - nx * ra, a.y - ny * ra, a.x + nx * ra, a.y + ny * ra);
    g.addColorStop(0, shade(tone, 0.2));
    g.addColorStop(0.45, tone);
    g.addColorStop(1, shade(tone, -0.3));
    ctx.fillStyle = g;
  }
  ctx.fill();
}

export function glove(ctx, elbow, g, R, colors, outline, highlight) {
  const ang = Math.atan2(g.y - elbow.y, g.x - elbow.x);
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.rotate(ang);
  // cuff (wrist) — drawn first, behind the mitt
  ctx.beginPath();
  ctx.ellipse(-R * 0.95, 0, R * 0.42, R * 0.62, 0, 0, Math.PI * 2);
  ctx.fillStyle = colors.cuff;
  ctx.fill();
  ctx.lineWidth = R * 0.07;
  ctx.strokeStyle = outline;
  ctx.stroke();
  // mitt
  const gr = ctx.createRadialGradient(-R * 0.25, -R * 0.35, R * 0.1, 0, 0, R * 1.25);
  gr.addColorStop(0, shade(colors.base, 0.35));
  gr.addColorStop(0.55, colors.base);
  gr.addColorStop(1, shade(colors.base, -0.45));
  ctx.beginPath();
  ctx.ellipse(R * 0.05, 0, R * 1.08, R * 0.9, 0, 0, Math.PI * 2);
  ctx.fillStyle = gr;
  ctx.fill();
  ctx.stroke();
  // thumb
  ctx.beginPath();
  ctx.ellipse(-R * 0.15, R * 0.62, R * 0.42, R * 0.26, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = shade(colors.base, -0.12);
  ctx.fill();
  ctx.stroke();
  // trim stripe + laces
  ctx.beginPath();
  ctx.moveTo(-R * 0.55, -R * 0.78);
  ctx.quadraticCurveTo(-R * 0.62, 0, -R * 0.55, R * 0.78);
  ctx.lineWidth = R * 0.18;
  ctx.strokeStyle = colors.trim;
  ctx.stroke();
  if (highlight) {
    ctx.beginPath();
    ctx.ellipse(R * 0.15, -R * 0.42, R * 0.45, R * 0.18, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();
  }
  ctx.restore();
}

function boot(ctx, knee, foot, S, color, facing, outline) {
  const L = 0.27 * S;
  const H = 0.1 * S;
  ctx.save();
  ctx.translate(foot.x, foot.y);
  ctx.scale(facing, 1);
  // high-top boot: shaft up the shin
  ctx.beginPath();
  ctx.moveTo(-L * 0.35, -H * 1.9);
  ctx.lineTo(-L * 0.38, -H * 0.2);
  ctx.quadraticCurveTo(-L * 0.4, H * 0.5, -L * 0.2, H * 0.5);
  ctx.lineTo(L * 0.52, H * 0.5);
  ctx.quadraticCurveTo(L * 0.66, H * 0.45, L * 0.6, 0);
  ctx.quadraticCurveTo(L * 0.4, -H * 0.55, L * 0.05, -H * 0.65);
  ctx.lineTo(L * 0.08, -H * 1.9);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -H * 2, 0, H * 0.5);
  g.addColorStop(0, shade(color, 0.18));
  g.addColorStop(1, shade(color, -0.35));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, S * 0.006);
  ctx.strokeStyle = outline;
  ctx.stroke();
  // sole + laces
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(-L * 0.36, H * 0.32, L * 0.95, H * 0.2);
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = Math.max(1, S * 0.004);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-L * 0.12 + i * L * 0.05, -H * (1.6 - i * 0.35));
    ctx.lineTo(L * 0.05 + i * L * 0.05, -H * (1.45 - i * 0.35));
    ctx.stroke();
  }
  ctx.restore();
}

/** Head in profile, facing +x (mirrored by facing). */
function drawHead(ctx, c, neckTop, S, look, facing, lean, outline) {
  const r = 0.12 * S;
  const skin = look.skin;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(facing, 1);
  ctx.rotate(lean * 0.4);
  // skull + jaw
  const g = ctx.createRadialGradient(r * 0.25, -r * 0.35, r * 0.1, 0, 0, r * 1.25);
  g.addColorStop(0, shade(skin, 0.18));
  g.addColorStop(0.6, skin);
  g.addColorStop(1, shade(skin, -0.3));
  ctx.beginPath();
  ctx.moveTo(-r * 0.95, -r * 0.1);
  ctx.bezierCurveTo(-r * 1.0, -r * 1.05, r * 0.85, -r * 1.2, r * 0.95, -r * 0.2);
  ctx.quadraticCurveTo(r * 1.02, r * 0.05, r * 1.12, r * 0.12); // nose
  ctx.lineTo(r * 0.98, r * 0.28);
  ctx.quadraticCurveTo(r * 1.0, r * 0.62, r * 0.78, r * 0.72); // chin
  ctx.quadraticCurveTo(r * 0.2, r * 1.0, -r * 0.4, r * 0.75); // jaw
  ctx.quadraticCurveTo(-r * 0.95, r * 0.5, -r * 0.95, -r * 0.1);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, S * 0.006);
  ctx.strokeStyle = outline;
  ctx.stroke();
  // ear
  ctx.beginPath();
  ctx.ellipse(-r * 0.18, r * 0.05, r * 0.16, r * 0.24, 0.1, 0, Math.PI * 2);
  ctx.fillStyle = shade(skin, -0.12);
  ctx.fill();
  ctx.stroke();
  // eye + brow
  ctx.beginPath();
  ctx.ellipse(r * 0.6, -r * 0.12, r * 0.12, r * 0.08, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.66, -r * 0.12, r * 0.055, 0, Math.PI * 2);
  ctx.fillStyle = "#1c1c1c";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 0.4, -r * 0.3);
  ctx.quadraticCurveTo(r * 0.62, -r * 0.4, r * 0.86, -r * 0.3);
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = look.hairColor || "#1d1712";
  ctx.lineCap = "round";
  ctx.stroke();
  // mouthguard hint
  ctx.beginPath();
  ctx.moveTo(r * 0.72, r * 0.42);
  ctx.lineTo(r * 0.95, r * 0.4);
  ctx.lineWidth = r * 0.1;
  ctx.strokeStyle = look.mouthguard || "#3a8dde";
  ctx.stroke();
  // hair
  const hc = look.hairColor || "#1d1712";
  ctx.fillStyle = hc;
  ctx.strokeStyle = shade(hc, -0.3);
  ctx.lineWidth = Math.max(1, S * 0.004);
  const style = look.hair || "short";
  if (style !== "bald") {
    ctx.beginPath();
    if (style === "buzz") {
      ctx.moveTo(-r * 0.92, -r * 0.05);
      ctx.bezierCurveTo(-r * 1.0, -r * 1.0, r * 0.8, -r * 1.15, r * 0.9, -r * 0.35);
      ctx.quadraticCurveTo(r * 0.3, -r * 0.78, -r * 0.55, -r * 0.3);
      ctx.closePath();
      ctx.globalAlpha = 0.85;
    } else if (style === "mohawk") {
      ctx.moveTo(-r * 0.8, -r * 0.55);
      ctx.bezierCurveTo(-r * 0.6, -r * 1.55, r * 0.6, -r * 1.55, r * 0.75, -r * 0.7);
      ctx.quadraticCurveTo(r * 0.1, -r * 0.95, -r * 0.8, -r * 0.55);
    } else if (style === "curly") {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (1.05 + i * 0.14);
        ctx.moveTo(Math.cos(a) * r * 0.95 + r * 0.25, Math.sin(a) * r * 0.95);
        ctx.arc(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.95, r * 0.3, 0, Math.PI * 2);
      }
    } else if (style === "long") {
      ctx.moveTo(-r * 1.02, r * 0.55);
      ctx.bezierCurveTo(-r * 1.25, -r * 1.2, r * 0.85, -r * 1.35, r * 0.92, -r * 0.35);
      ctx.quadraticCurveTo(r * 0.2, -r * 0.8, -r * 0.45, -r * 0.35);
      ctx.quadraticCurveTo(-r * 0.7, r * 0.2, -r * 1.02, r * 0.55);
    } else if (style === "braids") {
      ctx.moveTo(-r * 0.95, -r * 0.05);
      ctx.bezierCurveTo(-r * 1.0, -r * 1.05, r * 0.8, -r * 1.2, r * 0.9, -r * 0.35);
      ctx.quadraticCurveTo(r * 0.3, -r * 0.82, -r * 0.55, -r * 0.3);
      ctx.closePath();
    } else {
      ctx.moveTo(-r * 0.97, 0);
      ctx.bezierCurveTo(-r * 1.08, -r * 1.12, r * 0.85, -r * 1.3, r * 0.95, -r * 0.4);
      ctx.quadraticCurveTo(r * 0.55, -r * 0.62, r * 0.25, -r * 0.55);
      ctx.quadraticCurveTo(-r * 0.3, -r * 0.55, -r * 0.6, -r * 0.2);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (style === "braids") {
      ctx.strokeStyle = shade(hc, 0.15);
      ctx.lineWidth = r * 0.08;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(r * (0.6 - i * 0.35), -r * (0.95 - i * 0.05));
        ctx.lineTo(r * (0.3 - i * 0.35), -r * (0.4 - i * 0.1));
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/**
 * Draw one fighter. `look` = appearance, `fx` = { flash: 0..1 (hit flash),
 * exhausted, lowDetail }.
 */
export function drawFighter(ctx, cam, f, pose, look, fx = {}) {
  const S = cam.S;
  const outline = "rgba(18,12,10,0.55)";
  const proj0 = makeProjector(cam, f);
  // knockdown: rotate the whole body back around the rear foot
  let proj = proj0;
  if (pose.down > 0) {
    const th = pose.down * 1.42;
    const px = pose.footR.x;
    const py = 0;
    const c = Math.cos(th);
    const s = Math.sin(th);
    proj = (p) => {
      const dx = p.x - px;
      const dy = p.y - py;
      let y = py + dx * s + dy * c;
      const x = px + dx * c - dy * s;
      y = Math.max(y, 0.03);
      return proj0({ x, y, z: p.z });
    };
  }
  const P = (k) => proj(pose[k]);
  const skin = look.skin;
  const shorts = look.shorts;
  const shortsTrim = look.shortsTrim || "#ffffff";
  const gloveCol = look.gloves;

  const nearIsLead = pose.leadZ > 0;
  const lead = {
    sh: P("leadSh"), el: P("elbowL"), gl: P("gloveL"), hip: P("hipL"), knee: P("kneeL"), foot: P("footL"),
  };
  const rear = {
    sh: P("rearSh"), el: P("elbowR"), gl: P("gloveR"), hip: P("hipR"), knee: P("kneeR"), foot: P("footR"),
  };
  const far = nearIsLead ? rear : lead;
  const near = nearIsLead ? lead : rear;
  const hip = P("hip");
  const chest = P("chest");
  const neck = P("neck");
  const head = P("head");
  const bw = look.build ?? 1;

  const o = Math.max(1.2, S * 0.007); // outline thickness
  const mixP = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  /** A whole limb as one seamless silhouette: outline pass, then fill pass. */
  const group = (segs, tone) => {
    ctx.fillStyle = outline;
    for (const [a, b, ra, rb] of segs) capsule(ctx, a, b, ra + o, rb + o, null);
    for (const [a, b, ra, rb] of segs) capsule(ctx, a, b, ra, rb, tone);
  };

  const legSkin = (L, dim) => {
    const tone = dim ? shade(skin, -0.2) : skin;
    const calf = mixP(L.knee, L.foot, 0.32);
    group([
      [L.hip, L.knee, 0.105 * S * bw, 0.072 * S * bw],
      [L.knee, calf, 0.07 * S * bw, 0.074 * S * bw],
      [calf, L.foot, 0.074 * S * bw, 0.046 * S],
    ], tone);
    boot(ctx, L.knee, L.foot, S, dim ? shade(look.shoes || "#222", -0.15) : look.shoes || "#222", f.facing, outline);
  };

  const arm = (A, dim) => {
    const tone = dim ? shade(skin, -0.22) : skin;
    const bi = mixP(A.sh, A.el, 0.42);
    group([
      [A.sh, bi, 0.085 * S * bw, 0.077 * S * bw],
      [bi, A.el, 0.077 * S * bw, 0.058 * S * bw],
      [A.el, A.gl, 0.064 * S * bw, 0.052 * S],
    ], tone);
    // deltoid highlight (no outline — part of the same silhouette)
    const dg = ctx.createRadialGradient(A.sh.x - 0.02 * S, A.sh.y - 0.03 * S, 0, A.sh.x, A.sh.y, 0.09 * S * bw);
    dg.addColorStop(0, "rgba(255,255,255,0.22)");
    dg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath();
    ctx.ellipse(A.sh.x, A.sh.y, 0.085 * S * bw, 0.075 * S * bw, 0, 0, Math.PI * 2);
    ctx.fillStyle = dg;
    ctx.fill();
    glove(ctx, A.el, A.gl, GLOVE_R * S * (1 + A.gl.z * 0.08), dim ? { ...gloveCol, base: shade(gloveCol.base, -0.2), trim: shade(gloveCol.trim, -0.2), cuff: shade(gloveCol.cuff, -0.2) } : gloveCol, outline, !fx.lowDetail);
  };

  // ---- torso frame (built along the spine)
  const ang = Math.atan2(neck.y - hip.y, neck.x - hip.x);
  // screen-space "front of the chest" direction (perpendicular to the spine, toward the opponent)
  const fwd = { x: Math.cos(ang + (f.facing > 0 ? Math.PI / 2 : -Math.PI / 2)), y: Math.sin(ang + (f.facing > 0 ? Math.PI / 2 : -Math.PI / 2)) };
  const upv = { x: Math.cos(ang), y: Math.sin(ang) };
  const T = (u, v) => ({ x: hip.x + upv.x * u * S + fwd.x * v * S, y: hip.y + upv.y * u * S + fwd.y * v * S });
  const spine = Math.hypot(neck.x - hip.x, neck.y - hip.y) / S;
  const w = bw;

  // ---- back to front
  arm(far, true);
  legSkin(far, true);
  legSkin(near, false);

  ctx.beginPath();
  const p0 = T(0.0, 0.14 * w);
  ctx.moveTo(p0.x, p0.y);
  let c1 = T(spine * 0.3, 0.16 * w);
  let e1 = T(spine * 0.62, 0.19 * w);
  ctx.quadraticCurveTo(c1.x, c1.y, e1.x, e1.y); // belly → chest
  c1 = T(spine * 0.9, 0.22 * w);
  e1 = T(spine * 1.0, 0.09 * w);
  ctx.quadraticCurveTo(c1.x, c1.y, e1.x, e1.y); // pec → collarbone
  c1 = T(spine * 1.08, -0.06 * w);
  e1 = T(spine * 0.92, -0.17 * w);
  ctx.quadraticCurveTo(c1.x, c1.y, e1.x, e1.y); // trapezius → upper back
  c1 = T(spine * 0.45, -0.21 * w);
  e1 = T(0.0, -0.15 * w);
  ctx.quadraticCurveTo(c1.x, c1.y, e1.x, e1.y); // lats → lower back
  ctx.closePath();
  const tg = ctx.createLinearGradient(T(0, 0.2).x, T(0, 0.2).y, T(0, -0.2).x, T(0, -0.2).y);
  tg.addColorStop(0, shade(skin, 0.16));
  tg.addColorStop(0.45, skin);
  tg.addColorStop(1, shade(skin, -0.3));
  ctx.fillStyle = tg;
  ctx.fill();
  ctx.lineWidth = o * 1.4;
  ctx.strokeStyle = outline;
  ctx.stroke();
  if (!fx.lowDetail) {
    // muscle definition: pec line + abs (soft, not drawn-on)
    ctx.strokeStyle = shade(skin, -0.2);
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = Math.max(1, S * 0.005);
    ctx.beginPath();
    let q = T(spine * 0.6, 0.19 * w);
    ctx.moveTo(q.x, q.y);
    q = T(spine * 0.66, 0.04);
    ctx.quadraticCurveTo(T(spine * 0.58, 0.1).x, T(spine * 0.58, 0.1).y, q.x, q.y);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      q = T(spine * (0.2 + i * 0.12), 0.165 * w);
      ctx.moveTo(q.x, q.y);
      q = T(spine * (0.2 + i * 0.12), 0.11 * w);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---- trunks: one garment from the waist over both thighs
  const tr = [];
  const tw = 0.125 * S * bw;
  for (const L of [lead, rear]) {
    const m = mixP(L.hip, L.knee, 0.46);
    const dx = L.knee.x - L.hip.x;
    const dy = L.knee.y - L.hip.y;
    const l = Math.hypot(dx, dy) || 1;
    tr.push({ x: m.x - (dy / l) * tw, y: m.y + (dx / l) * tw }, { x: m.x + (dy / l) * tw, y: m.y - (dx / l) * tw });
  }
  tr.push(T(0.16, 0.175 * w), T(0.16, -0.19 * w), T(-0.06, -0.22 * w), T(-0.04, 0.2 * w));
  const hull = convexHull(tr);
  ctx.beginPath();
  hull.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  const sg = ctx.createLinearGradient(T(0, 0.22).x, T(0, 0.22).y, T(0, -0.22).x, T(0, -0.22).y);
  sg.addColorStop(0, shade(shorts, 0.25));
  sg.addColorStop(0.5, shorts);
  sg.addColorStop(1, shade(shorts, -0.35));
  ctx.fillStyle = sg;
  ctx.lineJoin = "round";
  ctx.fill();
  ctx.lineWidth = o * 1.4;
  ctx.strokeStyle = outline;
  ctx.stroke();
  // fold between the legs + side stripe + waistband
  if (!fx.lowDetail) {
    ctx.strokeStyle = shade(shorts, -0.4);
    ctx.lineWidth = Math.max(1, S * 0.005);
    ctx.beginPath();
    const crotch = T(-0.1, 0.0);
    ctx.moveTo(crotch.x, crotch.y);
    const lm = mixP(near.hip, near.knee, 0.46);
    ctx.lineTo(lm.x, lm.y);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  ctx.beginPath();
  let s0 = T(0.12, 0.02 * w);
  ctx.moveTo(s0.x, s0.y);
  s0 = mixP(near.hip, near.knee, 0.5);
  ctx.lineTo(s0.x, s0.y);
  ctx.lineWidth = 0.024 * S;
  ctx.strokeStyle = shortsTrim;
  ctx.stroke();
  ctx.beginPath();
  s0 = T(0.15, 0.18 * w);
  ctx.moveTo(s0.x, s0.y);
  s0 = T(0.15, -0.19 * w);
  ctx.lineTo(s0.x, s0.y);
  ctx.lineWidth = 0.065 * S;
  ctx.strokeStyle = shortsTrim;
  ctx.stroke();

  // neck + head
  ctx.fillStyle = outline;
  capsule(ctx, neck, { x: head.x, y: head.y + 0.03 * S }, 0.07 * S * bw + o, 0.062 * S + o, null);
  capsule(ctx, neck, { x: head.x, y: head.y + 0.03 * S }, 0.07 * S * bw, 0.062 * S, skin);
  drawHead(ctx, head, neck, S, look, f.facing, pose.lean - (pose.down || 0) * 0.3, outline);

  arm(near, false);
}

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Soft contact shadow on the canvas. */
export function drawShadow(ctx, cam, f, pose, strength = 1) {
  const x = cam.cx + (f.x - cam.camX) * cam.S;
  const y = cam.floorY + 0.02 * cam.S;
  const wide = 0.42 + (pose.down || 0) * 0.55;
  const g = ctx.createRadialGradient(x, y, 0, x, y, wide * cam.S);
  g.addColorStop(0, `rgba(0,0,0,${0.42 * strength})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.translate(x - f.facing * (pose.down || 0) * 0.5 * cam.S, y);
  ctx.scale(1, 0.22);
  ctx.beginPath();
  ctx.arc(0, 0, wide * cam.S, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}
