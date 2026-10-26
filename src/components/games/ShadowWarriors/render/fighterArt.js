/**
 * Shadow Warriors — fighter drawing. Silhouettes are drawn straight from the
 * solved skeleton joints (the same joints the hitboxes use), in three passes:
 * aura (buffs / telegraphs), rim light (edge facing the arena light), body.
 */
import { sx, sy } from "./view.js";
import { fade, mix } from "./arenas.js";

const RAD = Math.PI / 180;
const BODY = "#07060a";

function P2(v, p) {
  return [sx(v, p.x), sy(v, p.y)];
}

function seg(ctx, a, b, w) {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

function torsoPath(ctx, H, N, f, s) {
  const dx = N[0] - H[0];
  const dy = N[1] - H[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  // perpendicular, pointing to the fighter's front
  let nx = -uy;
  let ny = ux;
  if (Math.sign(nx || 1) !== f) {
    nx = -nx;
    ny = -ny;
  }
  const at = (t, w) => [H[0] + dx * t + nx * w * s, H[1] + dy * t + ny * w * s];
  const p = [at(-0.04, 10), at(0.35, 9), at(0.72, 15), at(0.95, 12), at(1.03, 5), at(1.03, -8), at(0.86, -14), at(0.45, -9), at(-0.04, -11)];
  ctx.beginPath();
  ctx.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length; i++) {
    const q = p[i];
    const m = p[i - 1];
    ctx.quadraticCurveTo(m[0], m[1], (m[0] + q[0]) / 2, (m[1] + q[1]) / 2);
  }
  ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
  ctx.closePath();
}

/** One silhouette pass. `grow` thickens everything (aura/rim passes). */
function bodyPass(ctx, v, f, J, color, grow, dx, dy, look) {
  const s = v.s;
  const off = (p) => [sx(v, p.x) + dx, sy(v, p.y) + dy];
  const H = off(J.hip);
  const N = off(J.neck);
  const Hd = off(J.head);
  const S = off(J.sh);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const g = grow * s;
  // back limbs
  seg(ctx, S, off(J.elB), 11 * s + g);
  seg(ctx, off(J.elB), off(J.haB), 9 * s + g);
  seg(ctx, H, off(J.knB), 16 * s + g);
  seg(ctx, off(J.knB), off(J.ftB), 11.5 * s + g);
  foot(ctx, off(J.ftB), off(J.knB), f.f, s, g);
  // torso, neck, head
  torsoPath(ctx, H, N, f, s);
  if (g) {
    ctx.lineWidth = g;
    ctx.stroke();
  }
  ctx.fill();
  seg(ctx, N, Hd, 9 * s + g);
  ctx.beginPath();
  ctx.arc(Hd[0], Hd[1], 13 * s + g / 2, 0, Math.PI * 2);
  ctx.fill();
  hat(ctx, Hd, s, (f.pose.t + f.pose.h + f.pose.rot) * RAD, look, g, color, f);
  // front limbs
  seg(ctx, H, off(J.knF), 16 * s + g);
  seg(ctx, off(J.knF), off(J.ftF), 11.5 * s + g);
  foot(ctx, off(J.ftF), off(J.knF), f.f, s, g);
  seg(ctx, S, off(J.elF), 11 * s + g);
  seg(ctx, off(J.elF), off(J.haF), 9 * s + g);
  ctx.beginPath();
  const hf = off(J.haF);
  ctx.arc(hf[0], hf[1], 6 * s + g / 2, 0, Math.PI * 2);
  const hb = off(J.haB);
  ctx.moveTo(hb[0] + 6 * s, hb[1]);
  ctx.arc(hb[0], hb[1], 6 * s + g / 2, 0, Math.PI * 2);
  ctx.fill();
}

function foot(ctx, A, K, facing, s, g) {
  // foot points forward, roughly perpendicular to the shin
  const dx = A[0] - K[0];
  const dy = A[1] - K[1];
  const L = Math.hypot(dx, dy) || 1;
  let px = -dy / L;
  let py = dx / L;
  if (Math.sign(px || facing) !== facing) {
    px = -px;
    py = -py;
  }
  ctx.lineWidth = 9 * s + g;
  ctx.beginPath();
  ctx.moveTo(A[0] - px * 3 * s, A[1] - py * 3 * s);
  ctx.lineTo(A[0] + px * 13 * s, A[1] + py * 13 * s);
  ctx.stroke();
}

// ------------------------------------------------------------------ hats & accessories
function hat(ctx, Hd, s, ang, look, g, color, f) {
  const kind = look?.hat;
  if (!kind || kind === "bald") return;
  ctx.save();
  ctx.translate(Hd[0], Hd[1]);
  ctx.scale(f.f, 1);
  ctx.rotate(ang * 1);
  ctx.scale(s, s);
  const G = g / s;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const tri = (pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    if (G) {
      ctx.lineWidth = G;
      ctx.stroke();
    }
    ctx.fill();
  };
  const t = f.clock * 0.18;
  const sway = Math.sin(t) * 3 - Math.min(14, Math.abs(f.vx) * 0.02);
  switch (kind) {
    case "headband":
    case "bandana": {
      ctx.lineWidth = 4 + G;
      ctx.lineCap = "round";
      const long = kind === "headband" ? 1 : 0.55;
      ctx.beginPath();
      ctx.moveTo(-12, -5);
      ctx.quadraticCurveTo(-24 * long, 0 + sway * 0.4, -38 * long, 6 + sway);
      ctx.moveTo(-12, -4);
      ctx.quadraticCurveTo(-22 * long, 5 + sway * 0.3, -32 * long, 14 + sway * 0.8);
      ctx.stroke();
      break;
    }
    case "topknot":
      ctx.beginPath();
      ctx.arc(-4, -15, 4.5 + G / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3 + G;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-6, -16);
      ctx.quadraticCurveTo(-14, -14 + sway * 0.3, -18, -6 + sway * 0.5);
      ctx.stroke();
      break;
    case "bun":
      ctx.beginPath();
      ctx.arc(-7, -13, 6 + G / 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "spiky":
      tri([-12, -6, -20, -16, -8, -11, -10, -22, -2, -13, 2, -21, 6, -12, 12, -8]);
      break;
    case "straw":
      tri([-28, -3, -2, -22, 26, -3, 0, -7]);
      break;
    case "hood":
      tri([-16, 12, -18, -6, -6, -18, 8, -16, 15, -6, 10, 2, -2, -10, -12, 14]);
      break;
    case "helmet":
      ctx.beginPath();
      ctx.arc(0, -3, 15 + G / 2, Math.PI, 0);
      ctx.fill();
      tri([-17, -3, -22, 4, 17, -3]);
      ctx.lineWidth = 2.5 + G;
      ctx.beginPath();
      ctx.moveTo(2, -16);
      ctx.quadraticCurveTo(10, -30, 4, -34);
      ctx.moveTo(-2, -16);
      ctx.quadraticCurveTo(-10, -30, -4, -34);
      ctx.stroke();
      break;
    case "ears":
      tri([-8, -9, -12, -25, -1, -12]);
      tri([1, -11, 2, -27, 9, -10]);
      break;
    case "antlers":
      ctx.lineWidth = 2.6 + G;
      ctx.beginPath();
      ctx.moveTo(-4, -12);
      ctx.lineTo(-10, -34);
      ctx.moveTo(-8, -26);
      ctx.lineTo(-18, -32);
      ctx.moveTo(-9, -31);
      ctx.lineTo(-4, -40);
      ctx.moveTo(4, -12);
      ctx.lineTo(8, -32);
      ctx.moveTo(7, -25);
      ctx.lineTo(16, -30);
      ctx.stroke();
      break;
    case "witch":
      tri([-24, -6, 22, -6, 8, -10, -6, -42, -16, -50, -4, -38, -4, -10]);
      break;
    case "mask":
      tri([-13, -10, 14, -10, 14, -2, -13, -2]);
      ctx.lineWidth = 3 + G;
      ctx.beginPath();
      ctx.moveTo(-13, -6);
      ctx.quadraticCurveTo(-26, -2 + sway * 0.4, -34, 4 + sway);
      ctx.stroke();
      break;
    case "turban":
      ctx.beginPath();
      ctx.ellipse(-1, -9, 16 + G / 2, 11 + G / 2, -0.15, 0, Math.PI * 2);
      ctx.fill();
      tri([0, -18, 3, -26, 6, -17]);
      break;
    case "veil":
      tri([-14, -10, 4, -16, 14, -8, -6, -6, -18, 20 + sway * 0.6, -26, 14 + sway]);
      break;
    case "crown":
      tri([-12, -10, -14, -26, -6, -16, 0, -30, 6, -16, 14, -26, 12, -10]);
      break;
    case "horns":
      ctx.lineWidth = 5 + G;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-6, -10);
      ctx.quadraticCurveTo(-20, -26, -8, -38);
      ctx.moveTo(6, -10);
      ctx.quadraticCurveTo(22, -24, 14, -38);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

function eyes(ctx, v, f, J, look) {
  const s = v.s;
  const [hx, hy] = P2(v, J.head);
  const ang = (f.pose.t + f.pose.h + f.pose.rot) * RAD;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(f.f, 1);
  ctx.rotate(ang);
  ctx.scale(s, s);
  const c = look?.eye || "#dff4ff";
  const hurt = f.state === "hit" || f.state === "fall" || f.state === "down" || f.state === "ko";
  ctx.fillStyle = fade(c, 0.35);
  ctx.fillRect(2, -4.5, 11, 4.5);
  ctx.fillStyle = c;
  if (hurt) ctx.fillRect(4, -2.6, 8, 1.2);
  else ctx.fillRect(4, -3.4, 8, 2.4);
  ctx.restore();
}

// ------------------------------------------------------------------ armor & cloth
function armorBits(ctx, v, f, J, armor, base) {
  if (!armor || armor.id === "gi") {
    // cloth belt
    belt(ctx, v, J, "#2a2a32", f);
    return;
  }
  const s = v.s;
  const accent = armor.color;
  if (armor.id === "leather" || armor.id === "silk") belt(ctx, v, J, accent, f, armor.id === "silk");
  if (armor.id === "lamellar" || armor.id === "iron" || armor.id === "dragon") {
    // shoulder pad (a plate over the upper arm) + skirt plates, edged in the armor colour
    const S = P2(v, J.sh);
    const E = P2(v, J.elF);
    const ang = Math.atan2(E[1] - S[1], E[0] - S[0]);
    ctx.save();
    ctx.translate(S[0] + (E[0] - S[0]) * 0.3, S[1] + (E[1] - S[1]) * 0.3);
    ctx.rotate(ang);
    ctx.fillStyle = base;
    ctx.strokeStyle = fade(accent, 0.55);
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(-9 * s, -9 * s);
    ctx.quadraticCurveTo(6 * s, -12 * s, 10 * s, -2 * s);
    ctx.lineTo(9 * s, 8 * s);
    ctx.quadraticCurveTo(0, 11 * s, -9 * s, 7 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (armor.id === "dragon") {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(-6 * s, -9 * s);
      ctx.lineTo(-2 * s, -18 * s);
      ctx.lineTo(2 * s, -9 * s);
      ctx.fill();
    }
    ctx.restore();
    const H = P2(v, J.hip);
    ctx.fillStyle = base;
    ctx.strokeStyle = fade(accent, 0.5);
    ctx.lineWidth = 1 * s;
    for (const kn of [J.knB, J.knF]) {
      const K = P2(v, kn);
      const kx = H[0] + (K[0] - H[0]) * 0.5;
      const ky = H[1] + (K[1] - H[1]) * 0.5;
      ctx.beginPath();
      ctx.moveTo(H[0] - 7 * s, H[1] - 1 * s);
      ctx.lineTo(H[0] + 7 * s, H[1] - 1 * s);
      ctx.lineTo(kx + 5 * s, ky);
      ctx.lineTo(kx - 5 * s, ky);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    belt(ctx, v, J, accent, f);
    // chest plate edge
    const N = P2(v, J.neck);
    ctx.strokeStyle = fade(accent, 0.45);
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(H[0] + (N[0] - H[0]) * 0.3 + f.f * 10 * s, H[1] + (N[1] - H[1]) * 0.3);
    ctx.lineTo(H[0] + (N[0] - H[0]) * 0.85 + f.f * 11 * s, H[1] + (N[1] - H[1]) * 0.85);
    ctx.stroke();
  }
}

function belt(ctx, v, J, color, f, tails = false) {
  const s = v.s;
  const H = P2(v, J.hip);
  const N = P2(v, J.neck);
  const bx = H[0] + (N[0] - H[0]) * 0.12;
  const by = H[1] + (N[1] - H[1]) * 0.12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4 * s;
  ctx.lineCap = "round";
  const ux = N[0] - H[0];
  const uy = N[1] - H[1];
  const L = Math.hypot(ux, uy) || 1;
  const px = (-uy / L) * 13 * s;
  const py = (ux / L) * 13 * s;
  ctx.beginPath();
  ctx.moveTo(bx - px, by - py);
  ctx.lineTo(bx + px, by + py);
  ctx.stroke();
  // sash tails behind
  const sway = Math.sin(f.clock * 0.16) * 3 * s - Math.min(12, Math.abs(f.vx) * 0.02) * s;
  const back = -f.f;
  ctx.lineWidth = (tails ? 4 : 3) * s;
  ctx.beginPath();
  ctx.moveTo(bx + back * 11 * s, by);
  ctx.quadraticCurveTo(bx + back * 18 * s, by + 10 * s, bx + back * (22 * s - sway), by + (tails ? 34 : 20) * s);
  ctx.stroke();
}

function cape(ctx, v, f, J, color) {
  const s = v.s;
  const S = P2(v, J.sh);
  const K = P2(v, J.knB);
  const back = -f.f;
  const wave = Math.sin(f.clock * 0.12) * 6 * s + Math.min(20, Math.abs(f.vx) * 0.03) * s;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(S[0] - back * 4 * s, S[1] - 2 * s);
  ctx.quadraticCurveTo(S[0] + back * (30 * s + wave), S[1] + 40 * s, K[0] + back * (26 * s + wave * 1.6), K[1] + 14 * s);
  ctx.lineTo(K[0] + back * 2 * s, K[1] + 6 * s);
  ctx.quadraticCurveTo(S[0] + back * 6 * s, S[1] + 40 * s, S[0] + back * 6 * s, S[1]);
  ctx.closePath();
  ctx.fill();
}

function scarf(ctx, v, f, J, color) {
  const s = v.s;
  const N = P2(v, J.neck);
  const back = -f.f;
  const sway = Math.sin(f.clock * 0.2) * 5 * s;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = 6 * s;
  ctx.beginPath();
  ctx.moveTo(N[0], N[1] + 2 * s);
  ctx.bezierCurveTo(N[0] + back * 22 * s, N[1] + 6 * s + sway, N[0] + back * 40 * s, N[1] - 4 * s - sway, N[0] + back * 62 * s, N[1] + 8 * s + sway);
  ctx.stroke();
}

// ------------------------------------------------------------------ weapons
export function drawWeapon(ctx, v, f, J, which, edge) {
  const w = f.w;
  const fam = w.family;
  if (fam === "fists") return;
  const s = v.s;
  const H = which === "B" ? J.haB : J.haF;
  const T = which === "B" ? J.tipB : J.tipF;
  const B = which === "B" ? J.butB : J.butF;
  if (which === "B" && !w.dual) return;
  const h = P2(v, H);
  const t = P2(v, T);
  const b = P2(v, B);
  const dx = t[0] - h[0];
  const dy = t[1] - h[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const nx = -uy;
  const ny = ux;
  ctx.lineCap = "round";
  const steel = w.color;
  if (fam === "blade" || fam === "dual") {
    // grip
    ctx.strokeStyle = BODY;
    ctx.lineWidth = 4.5 * s;
    ctx.beginPath();
    ctx.moveTo(b[0], b[1]);
    ctx.lineTo(h[0] + ux * 4 * s, h[1] + uy * 4 * s);
    ctx.stroke();
    // guard
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(h[0] + ux * 5 * s + nx * 5 * s, h[1] + uy * 5 * s + ny * 5 * s);
    ctx.lineTo(h[0] + ux * 5 * s - nx * 5 * s, h[1] + uy * 5 * s - ny * 5 * s);
    ctx.stroke();
    // curved blade
    const curve = (fam === "blade" ? 0.07 : 0.12) * L * (f.f > 0 ? 1 : -1);
    const s0 = [h[0] + ux * 7 * s, h[1] + uy * 7 * s];
    const cx = (s0[0] + t[0]) / 2 + nx * curve;
    const cy = (s0[1] + t[1]) / 2 + ny * curve;
    const bw = (fam === "blade" ? 4.2 : 4.8) * s;
    ctx.fillStyle = mix(steel, "#0a0a12", 0.45);
    ctx.beginPath();
    ctx.moveTo(s0[0] + nx * bw * 0.5, s0[1] + ny * bw * 0.5);
    ctx.quadraticCurveTo(cx + nx * bw, cy + ny * bw, t[0], t[1]);
    ctx.quadraticCurveTo(cx - nx * bw * 0.2, cy - ny * bw * 0.2, s0[0] - nx * bw * 0.5, s0[1] - ny * bw * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = fade(steel, edge ? 1 : 0.8);
    ctx.lineWidth = 1.3 * s;
    ctx.beginPath();
    ctx.moveTo(s0[0] - nx * bw * 0.4, s0[1] - ny * bw * 0.4);
    ctx.quadraticCurveTo(cx - nx * bw * 0.15, cy - ny * bw * 0.15, t[0], t[1]);
    ctx.stroke();
    return;
  }
  if (fam === "pole") {
    ctx.strokeStyle = mix("#2a1c12", BODY, 0.4);
    ctx.lineWidth = 5.2 * s;
    ctx.beginPath();
    ctx.moveTo(b[0], b[1]);
    ctx.lineTo(t[0], t[1]);
    ctx.stroke();
    ctx.strokeStyle = fade(w.color, 0.55);
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(b[0] + nx * 2 * s, b[1] + ny * 2 * s);
    ctx.lineTo(t[0] + nx * 2 * s, t[1] + ny * 2 * s);
    ctx.stroke();
    if (w.id === "spear") {
      // leaf blade + tassel
      ctx.fillStyle = mix(steel, "#0a0a12", 0.35);
      ctx.beginPath();
      ctx.moveTo(t[0] + ux * 24 * s, t[1] + uy * 24 * s);
      ctx.lineTo(t[0] + nx * 5 * s, t[1] + ny * 5 * s);
      ctx.lineTo(t[0] - ux * 4 * s, t[1] - uy * 4 * s);
      ctx.lineTo(t[0] - nx * 5 * s, t[1] - ny * 5 * s);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = fade(steel, 0.9);
      ctx.lineWidth = 1 * s;
      ctx.stroke();
      ctx.strokeStyle = "#c0303a";
      ctx.lineWidth = 3 * s;
      const sway = Math.sin(f.clock * 0.25) * 4 * s;
      ctx.beginPath();
      ctx.moveTo(t[0] - ux * 4 * s, t[1] - uy * 4 * s);
      ctx.quadraticCurveTo(t[0] - ux * 12 * s + sway, t[1] - uy * 12 * s + 8 * s, t[0] - ux * 14 * s + sway, t[1] - uy * 14 * s + 16 * s);
      ctx.stroke();
    } else {
      // staff caps
      ctx.fillStyle = fade(w.color, 0.8);
      for (const p of [t, b]) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 3 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }
  if (fam === "heavy") {
    ctx.strokeStyle = mix("#2a1c12", BODY, 0.5);
    ctx.lineWidth = 6 * s;
    ctx.beginPath();
    ctx.moveTo(b[0], b[1]);
    ctx.lineTo(t[0], t[1]);
    ctx.stroke();
    // head
    ctx.save();
    ctx.translate(t[0], t[1]);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.fillStyle = mix(steel, BODY, 0.6);
    ctx.fillRect(-12 * s, -19 * s, 26 * s, 38 * s);
    ctx.strokeStyle = fade(steel, 0.9);
    ctx.lineWidth = 1.5 * s;
    ctx.strokeRect(-12 * s, -19 * s, 26 * s, 38 * s);
    ctx.fillStyle = fade(steel, 0.5);
    ctx.fillRect(-12 * s, -4 * s, 26 * s, 3 * s);
    ctx.restore();
    return;
  }
  if (fam === "chain") {
    // handle + chain + sickle
    ctx.strokeStyle = BODY;
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(h[0] - ux * 8 * s, h[1] - uy * 8 * s);
    ctx.lineTo(h[0] + ux * 6 * s, h[1] + uy * 6 * s);
    ctx.stroke();
    const ext = Math.min(1, (f.pose.wl ?? 1));
    const sag = (1 - ext) * 0.9 * L + 6 * s;
    const mx = (h[0] + t[0]) / 2;
    const my = (h[1] + t[1]) / 2 + sag;
    ctx.fillStyle = fade(steel, 0.95);
    const n = Math.max(4, Math.round(L / (6 * s)));
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      const x = (1 - k) * (1 - k) * h[0] + 2 * (1 - k) * k * mx + k * k * t[0];
      const y = (1 - k) * (1 - k) * h[1] + 2 * (1 - k) * k * my + k * k * t[1];
      ctx.fillRect(x - 1.4 * s, y - 1.4 * s, 2.8 * s, 2.8 * s);
    }
    // sickle at the tip
    ctx.save();
    ctx.translate(t[0], t[1]);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.scale(1, f.f);
    ctx.fillStyle = mix(steel, BODY, 0.4);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(14 * s, -2 * s, 18 * s, -16 * s);
    ctx.quadraticCurveTo(10 * s, -6 * s, 0, -4 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = fade(steel, 0.9);
    ctx.lineWidth = 1 * s;
    ctx.stroke();
    ctx.restore();
  }
}

// ------------------------------------------------------------------ public
/**
 * opts = { P (arena palette), flash (0..1 white hit flash), trail (array of
 * [hx,hy,tx,ty] world points) }
 */
export function drawFighter(ctx, v, f, opts) {
  const J = f.J;
  const P = opts.P;
  const look = f.cfg.look || {};
  const armor = f.cfg.armor;
  if (f.alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = f.alpha;
  const s = v.s;

  // ground shadow
  const gy = sy(v, 0);
  const shW = Math.max(14, 46 - f.y * 0.15) * s;
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(sx(v, f.x), gy + 2 * s, shW, 6 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // emperor frost aura
  if (f.boss?.id === "emperor" && f.boss.phase >= 2) {
    ctx.strokeStyle = "rgba(160,225,255,0.22)";
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.ellipse(sx(v, f.x), gy + 2 * s, 170 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // weapon trail
  if (opts.trail && opts.trail.length > 1) {
    ctx.fillStyle = fade(P.rim, 0.22);
    ctx.beginPath();
    const tr = opts.trail;
    ctx.moveTo(sx(v, tr[0][2]), sy(v, tr[0][3]));
    for (const q of tr) ctx.lineTo(sx(v, q[2]), sy(v, q[3]));
    for (let i = tr.length - 1; i >= 0; i--) ctx.lineTo(sx(v, tr[i][0]), sy(v, tr[i][1]));
    ctx.closePath();
    ctx.fill();
  }

  if (look.cape) cape(ctx, v, f, J, mix(BODY, look.eye, 0.18));
  if (look.scarf) scarf(ctx, v, f, J, mix(BODY, look.eye, 0.25));

  // auras
  const pulse = 0.5 + 0.5 * Math.sin(f.clock * 0.35);
  let aura = null;
  const tele = f.state === "attack" && f.move?.telegraph && f.mf < f.move.s;
  if (tele) aura = f.move.effect === "eclipse" ? (f.boss?.nextLow ? "#4ab0ff" : "#ff3a4a") : look.eye || "#ff6a3a";
  else if (f.buffs.armor > 0) aura = "#ffa040";
  else if (f.buffs.iron > 0) aura = "#ffd75a";
  else if (f.buffs.vamp > 0 && !f.boss) aura = "#ff2a4a";
  else if (f.state === "attack" && f.move?.kind === "special") aura = "#a070ff";
  if (aura) {
    ctx.globalAlpha = f.alpha * (tele ? 0.35 + 0.45 * pulse : 0.3 + 0.2 * pulse);
    bodyPass(ctx, v, f, J, aura, 7, 0, 0, look);
    ctx.globalAlpha = f.alpha;
  }
  // rim light (light comes from the upper right of the screen)
  ctx.globalAlpha = f.alpha * 0.85;
  bodyPass(ctx, v, f, J, fade(P.rim, 0.7), 1.6, 1.1 * s, -1.1 * s, look);
  ctx.globalAlpha = f.alpha;

  // back weapon goes behind the body
  drawWeapon(ctx, v, f, J, "B", false);
  const flash = opts.flash || 0;
  const body = flash > 0 ? mix(BODY, "#ffffff", 0.55 * flash) : BODY;
  bodyPass(ctx, v, f, J, body, 0, 0, 0, look);
  armorBits(ctx, v, f, J, armor, body);
  if (look.beads) {
    const N = P2(v, J.neck);
    ctx.fillStyle = "#c08a3a";
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(N[0] + Math.cos(i) * 8 * s, N[1] + 4 * s + Math.sin(i) * 3 * s, 2 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const active = f.state === "attack" && f.mf >= f.move.s && f.mf < f.move.s + f.move.a;
  drawWeapon(ctx, v, f, J, "F", active);
  eyes(ctx, v, f, J, look);

  // telegraph marker
  if (tele) {
    const [hx, hy] = P2(v, J.head);
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(hx, hy - 34 * s, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#08060a";
    ctx.font = `900 ${Math.round(13 * s)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", hx, hy - 33.5 * s);
  }
  ctx.restore();
}
