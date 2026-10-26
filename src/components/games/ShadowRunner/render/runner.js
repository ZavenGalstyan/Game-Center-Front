/**
 * Shadow Runner — the silhouette rig. A 2-bone-per-limb stick body whose
 * joint angles come from the sim state (mode, speed, air time, scripted
 * vault/mantle progress). Angles are measured from "straight down",
 * positive = toward the facing direction. Drawn twice: an accent-coloured
 * copy nudged toward the light for a rim, then the black body on top.
 */
const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;

const POSE_KEYS = ["lean", "hip", "t1", "s1", "t2", "s2", "u1", "f1", "u2", "f2", "rot"];

function blend(a, b, k) {
  const o = {};
  for (const key of POSE_KEYS) o[key] = lerp(a[key] || 0, b[key] || 0, k);
  return o;
}

/**
 * Build a pose from a sim-ish snapshot:
 *   { m(mode), vx, vy, st(stride), jk(jump kind), at(air time), sc(script kind), k(script progress), landT, wallDir }
 */
export function poseFor(q, t) {
  const m = q.m;
  const speed = Math.abs(q.vx || 0);
  const ph = ((q.st || 0) * TAU) / 92;
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const run = {
    lean: 0.18 + Math.min(0.22, speed / 1800),
    hip: -29 + Math.abs(c) * 2.2,
    t1: 0.95 * s,
    s1: -(0.25 + 1.25 * Math.max(0, -Math.cos(ph - 0.6))),
    t2: -0.95 * s,
    s2: -(0.25 + 1.25 * Math.max(0, Math.cos(ph - 0.6))),
    u1: -0.85 * s,
    f1: 1.35,
    u2: 0.85 * s,
    f2: 1.35,
  };
  if (m === "run" && speed < 30) {
    // idle-ish: breathing stance
    const b = Math.sin(t * 3) * 0.04;
    return { lean: 0.05 + b, hip: -30, t1: 0.15, s1: -0.1, t2: -0.1, s2: -0.15, u1: 0.15, f1: 0.5, u2: -0.15, f2: 0.4 };
  }
  if (m === "run") {
    if (q.landT > 0) {
      const k = Math.min(1, q.landT / 0.12);
      return blend(run, { lean: 0.55, hip: -22, t1: 0.9, s1: -1.5, t2: -0.1, s2: -0.9, u1: 0.9, f1: 0.8, u2: -0.6, f2: 0.9 }, k);
    }
    return run;
  }
  if (m === "slide") {
    return { lean: -1.05, hip: -11, t1: 1.5, s1: -0.05, t2: 1.05, s2: -1.9, u1: -2.0, f1: 0.25, u2: 1.2, f2: 0.6 };
  }
  if (m === "stun") {
    const w = Math.sin(t * 22) * 0.25;
    return { lean: -0.45, hip: -28, t1: 0.3, s1: -0.4, t2: -0.35, s2: -0.3, u1: 2.4 + w, f1: 0.5, u2: 2.0 - w, f2: 0.6 };
  }
  if (m === "vault") {
    return { lean: 0.95, hip: -30, t1: 1.6, s1: -0.5, t2: 1.25, s2: -1.0, u1: 0.25, f1: 0, u2: 1.9, f2: 0.4 };
  }
  if (m === "mantle") {
    const k = q.k ?? 0.5;
    return blend(
      { lean: 0.15, hip: -27, t1: 0.4, s1: -0.3, t2: -0.1, s2: -0.2, u1: 2.9, f1: 0.1, u2: 2.8, f2: 0.15 },
      { lean: 0.85, hip: -24, t1: 1.6, s1: -1.9, t2: 0.4, s2: -1.0, u1: 1.0, f1: 0.2, u2: 0.8, f2: 0.4 },
      k
    );
  }
  if (m === "wall") {
    return { lean: 0.12, hip: -29, t1: 0.95, s1: -1.2, t2: 0.55, s2: -0.9, u1: 2.6, f1: 0.2, u2: 1.4, f2: 0.6 };
  }
  // airborne
  const vy = q.vy || 0;
  const rise = { lean: 0.2, hip: -29, t1: 1.15, s1: -1.6, t2: -0.35, s2: -0.6, u1: 2.3, f1: 0.5, u2: -0.9, f2: 0.8 };
  const fall = { lean: 0.1, hip: -29, t1: 0.65, s1: -0.35, t2: 0.1, s2: -0.5, u1: 1.6, f1: 0.4, u2: 1.1, f2: 0.6 };
  const k = Math.max(0, Math.min(1, (vy + 300) / 700));
  const p = blend(rise, fall, k);
  const at = q.at || 0;
  if (q.jk === 2 && at < 0.42) {
    // double jump: front flip in a tight tuck
    const f = at / 0.42;
    const tuck = Math.sin(f * Math.PI);
    p.rot = f * TAU;
    p.t1 = lerp(p.t1, 1.9, tuck);
    p.t2 = lerp(p.t2, 1.7, tuck);
    p.s1 = lerp(p.s1, -2.2, tuck);
    p.s2 = lerp(p.s2, -2.2, tuck);
    p.u1 = lerp(p.u1, 1.2, tuck);
    p.u2 = lerp(p.u2, 1.0, tuck);
    p.hip = -24;
  } else if (q.jk === 3 && at < 0.3) {
    // wall jump: push-off spread
    const f = 1 - at / 0.3;
    p.t1 = lerp(p.t1, 0.9, f);
    p.t2 = lerp(p.t2, -1.0, f);
    p.s1 = lerp(p.s1, -0.5, f);
    p.s2 = lerp(p.s2, -0.2, f);
    p.u1 = lerp(p.u1, 2.7, f);
    p.u2 = lerp(p.u2, -1.8, f);
  } else if (q.jk === 4 && at < 0.5) {
    // spring: star jump
    const f = Math.sin(Math.min(1, at / 0.5) * Math.PI);
    p.u1 = lerp(p.u1, 2.7, f);
    p.u2 = lerp(p.u2, -2.6, f);
    p.t1 = lerp(p.t1, 0.5, f);
    p.t2 = lerp(p.t2, -0.5, f);
    p.s1 = lerp(p.s1, -0.2, f);
    p.s2 = lerp(p.s2, -0.2, f);
  }
  return p;
}

function limb(ctx, x, y, a1, l1, a2rel, l2) {
  const kx = x + Math.sin(a1) * l1;
  const ky = y + Math.cos(a1) * l1;
  const a2 = a1 + a2rel;
  const ex = kx + Math.sin(a2) * l2;
  const ey = ky + Math.cos(a2) * l2;
  ctx.moveTo(x, y);
  ctx.lineTo(kx, ky);
  ctx.lineTo(ex, ey);
}

/**
 * Draw a figure with feet-centre at (x, feetY) facing dir.
 * style: { body, far, rim, bulk, visor, coat, alpha }
 */
export function drawFigure(ctx, x, feetY, dir, pose, style) {
  ctx.save();
  ctx.translate(x, feetY);
  ctx.scale(dir, 1);
  if (pose.rot) {
    ctx.translate(0, -28);
    ctx.rotate(pose.rot);
    ctx.translate(0, 28);
  }
  if (style.alpha != null) ctx.globalAlpha *= style.alpha;
  const bulk = style.bulk || 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const hipY = pose.hip;
  const lean = pose.lean;
  const nx = Math.sin(lean) * 18;
  const ny = hipY - Math.cos(lean) * 18;
  const hx = nx + Math.sin(lean) * 9;
  const hy = ny - Math.cos(lean) * 9;
  const sx = nx - Math.sin(lean) * 2;
  const sy = ny + Math.cos(lean) * 2;

  const pass = (dx, dy, near, far, headCol) => {
    ctx.save();
    ctx.translate(dx, dy);
    // far limbs
    ctx.strokeStyle = far;
    ctx.lineWidth = 6.2 * bulk;
    ctx.beginPath();
    limb(ctx, 0, hipY, pose.t2, 15, pose.s2, 15.5);
    ctx.stroke();
    ctx.lineWidth = 5 * bulk;
    ctx.beginPath();
    limb(ctx, sx, sy, pose.u2, 11, pose.f2, 11);
    ctx.stroke();
    // coat tail (hunter)
    if (style.coat) {
      ctx.fillStyle = near;
      ctx.beginPath();
      ctx.moveTo(sx - 4, sy);
      ctx.lineTo(Math.sin(lean) * 3 - 10 - Math.abs(pose.t1) * 3, hipY + 9);
      ctx.lineTo(Math.sin(lean) * 3 + 6, hipY + 7);
      ctx.closePath();
      ctx.fill();
    }
    // torso
    ctx.strokeStyle = near;
    ctx.lineWidth = 10 * bulk;
    ctx.beginPath();
    ctx.moveTo(0, hipY);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    // head
    ctx.fillStyle = headCol;
    ctx.beginPath();
    ctx.arc(hx, hy, 6.6 * Math.sqrt(bulk), 0, TAU);
    ctx.fill();
    // near limbs
    ctx.lineWidth = 6.6 * bulk;
    ctx.beginPath();
    limb(ctx, 0, hipY, pose.t1, 15, pose.s1, 15.5);
    ctx.stroke();
    ctx.lineWidth = 5.2 * bulk;
    ctx.beginPath();
    limb(ctx, sx, sy, pose.u1, 11, pose.f1, 11);
    ctx.stroke();
    ctx.restore();
  };

  if (style.rim) pass(-1.3, -1.3, style.rim, style.rim, style.rim);
  pass(0, 0, style.body, style.far, style.body);

  // scarf / visor accents
  if (style.scarf) {
    ctx.strokeStyle = style.scarf;
    ctx.lineWidth = 2.6;
    const wave = Math.sin((pose.wave || 0) + feetY * 0.02);
    ctx.beginPath();
    ctx.moveTo(nx, ny + 1);
    ctx.quadraticCurveTo(nx - 10, ny + 1 + wave * 3, nx - 20, ny + 4 + wave * 5);
    ctx.stroke();
  }
  if (style.visor) {
    ctx.strokeStyle = style.visor;
    ctx.lineWidth = 2.4;
    ctx.globalAlpha *= 0.95;
    ctx.beginPath();
    ctx.moveTo(hx + 0.5, hy - 1.5);
    ctx.lineTo(hx + 6.5, hy - 0.5);
    ctx.stroke();
    ctx.globalAlpha *= 0.3;
    ctx.lineWidth = 7;
    ctx.stroke();
  }
  ctx.restore();
}
