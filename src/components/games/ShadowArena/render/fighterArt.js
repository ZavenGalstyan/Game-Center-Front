/**
 * Procedural cartoon fighters. Each fighter is a small skeleton (hip, torso,
 * head, two-bone arms and legs solved with IK) posed from its sim state, then
 * painted with thick outlined strokes in its palette plus a few signature
 * details (flame hair, ninja mask and scarf, monk beads, assassin hood, rock
 * body, ponytail). Local space: x points the way the fighter faces, y down,
 * origin at the feet on the ground.
 */
const LEN = { thigh: 31, shin: 31, torso: 44, upper: 24, fore: 23, neck: 5, head: 14 };
const OUTLINE = "#140f1c";

const GUARD = { hx: 0, hy: -58, lean: 0.12, ff: [17, 0], bf: [-20, 0], fh: [16, -10], bh: [8, 2], head: 0 };

const P = (o) => ({ ...GUARD, ...o });
const POSES = {
  punchW: P({ fh: [4, 4], lean: 0.04 }),
  punchE: P({ hx: 6, lean: 0.3, ff: [27, 0], bf: [-22, 0], fh: [46, -6], bh: [2, 6] }),
  kickW: P({ hy: -60, lean: -0.08, ff: [12, -34], fh: [10, -8], bh: [-8, 0] }),
  kickE: P({ hx: -4, hy: -60, lean: -0.34, ff: [66, -62], bf: [-16, 0], fh: [4, -8], bh: [-26, -2] }),
  block: P({ hy: -54, lean: -0.04, ff: [18, 0], bf: [-22, 0], fh: [19, -22], bh: [21, -10] }),
  blockstun: P({ hx: -3, hy: -53, lean: -0.16, ff: [16, 0], bf: [-24, 0], fh: [17, -22], bh: [19, -10] }),
  hit: P({ hx: -6, hy: -56, lean: -0.42, ff: [12, 0], bf: [-22, 0], fh: [-8, -24], bh: [-20, -8], head: -0.35 }),
  land: P({ hy: -50, lean: 0.2, ff: [18, 0], bf: [-22, 0], fh: [18, 0], bh: [6, 8] }),
  jumpUp: P({ hy: -64, lean: 0.05, ff: [12, -26], bf: [-12, -18], fh: [14, -22], bh: [-6, -8] }),
  jumpDown: P({ hy: -62, lean: 0.08, ff: [14, -10], bf: [-12, -6], fh: [18, -14], bh: [-4, -2] }),
  win: P({ lean: 0, ff: [12, 0], bf: [-14, 0], fh: [8, -46], bh: [8, 10] }),
  ko: P({ hy: -56, lean: -0.2, ff: [22, 0], bf: [-8, 0], fh: [-26, -6], bh: [-12, -26], head: -0.5 }),
  castW: P({ lean: -0.12, fh: [-12, 20], bh: [-16, 18] }),
  castE: P({ hx: 4, lean: 0.24, ff: [25, 0], bf: [-24, 0], fh: [44, -2], bh: [40, 6] }),
  boltW: P({ lean: -0.18, fh: [6, -45], bh: [-4, -44], head: -0.25 }),
  boltE: P({ hx: 4, hy: -50, lean: 0.42, ff: [24, 0], bf: [-26, 0], fh: [40, 16], bh: [36, 20] }),
  dashW: P({ hy: -50, lean: 0.32, fh: [-10, 10], bh: [-20, 6] }),
  dashE: P({ hy: -48, lean: 0.72, ff: [30, -6], bf: [-44, -2], fh: [46, 6], bh: [-36, 12] }),
  heavyW: P({ hx: -6, lean: -0.26, fh: [-36, 8], bh: [12, -6], ff: [20, 0], bf: [-24, 0] }),
  heavyE: P({ hx: 10, lean: 0.5, ff: [34, 0], bf: [-26, 0], fh: [48, -2], bh: [-22, 8] }),
  spinE: P({ hx: 0, hy: -66, lean: -0.2, ff: [64, -66], bf: [-10, -8], fh: [-6, -14], bh: [-28, -6] }),
};

const mixN = (a, b, k) => a + (b - a) * k;
const mixV = (a, b, k) => [mixN(a[0], b[0], k), mixN(a[1], b[1], k)];
function mix(a, b, k) {
  k = Math.max(0, Math.min(1, k));
  return { hx: mixN(a.hx, b.hx, k), hy: mixN(a.hy, b.hy, k), lean: mixN(a.lean, b.lean, k), head: mixN(a.head, b.head, k), ff: mixV(a.ff, b.ff, k), bf: mixV(a.bf, b.bf, k), fh: mixV(a.fh, b.fh, k), bh: mixV(a.bh, b.bh, k) };
}
const ease = (k) => 1 - (1 - k) * (1 - k);

const SPECIAL_POSES = { fire: ["castW", "castE"], ice: ["castW", "castE"], bolt: ["boltW", "boltE"], shadow: ["dashW", "dashE"], rock: ["heavyW", "heavyE"], wind: ["kickW", "spinE"] };

/** pose for a fighter state; also returns whole-body rotation / x-scale */
export function poseOf(f, time) {
  const extra = { rot: 0, sx: 1, lift: 0 };
  const breathe = Math.sin(time * 2.6 + f.side * 1.3);
  switch (f.state) {
    case "walk": {
      const ph = f.t * 0.2 * (f.def.speed / 3.3);
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      return [P({ hy: -58 + Math.abs(s) * 1.6, ff: [17 + s * 13, -Math.max(0, c) * 6], bf: [-20 - s * 13, -Math.max(0, -c) * 6], fh: [16 + s * 3, -10], bh: [8 - s * 3, 2] }), extra];
    }
    case "jump":
      return [f.vy > 2 ? POSES.jumpUp : mix(POSES.jumpUp, POSES.jumpDown, Math.min(1, (2 - f.vy) / 8)), extra];
    case "block":
      return [POSES.block, extra];
    case "blockstun":
      return [POSES.blockstun, extra];
    case "hit":
      return [mix(POSES.hit, GUARD, f.t > 8 ? (f.t - 8) / 14 : 0), extra];
    case "land":
      return [POSES.land, extra];
    case "ko": {
      const k = Math.min(1, f.t / 26);
      extra.rot = -ease(k) * 1.52;
      extra.lift = ease(k) * 12;
      return [POSES.ko, extra];
    }
    case "win":
      return [P({ ...POSES.win, hy: -58 + Math.abs(Math.sin(f.t * 0.12)) * -6 }), extra];
    case "attack": {
      const a = f.atk;
      const mv = a.move;
      const [wK, eK] = a.name === "special" ? SPECIAL_POSES[mv.fx] : a.name === "kick" ? ["kickW", "kickE"] : ["punchW", "punchE"];
      let W = POSES[wK];
      let E = POSES[eK];
      if (a.air) {
        // air attacks keep the legs tucked
        W = { ...W, ff: POSES.jumpUp.ff, bf: POSES.jumpUp.bf, hy: -64 };
        E = a.name === "kick" ? { ...E, bf: [-12, -22] } : { ...E, ff: [14, -18], bf: [-12, -16], hy: -64 };
      }
      const S = mv.startup;
      const A = mv.active;
      let pose;
      if (a.t <= S) pose = mix(a.t < S * 0.5 ? GUARD : W, a.t < S * 0.5 ? W : E, a.t < S * 0.5 ? a.t / (S * 0.5) : Math.pow((a.t - S * 0.5) / (S * 0.5), 3) * 0.4);
      else if (a.t <= S + A) pose = E;
      else pose = mix(E, GUARD, (a.t - S - A) / mv.recovery);
      if (mv.kind === "spin" && a.t > S && a.t <= S + A + 4) extra.sx = Math.cos(((a.t - S) / A) * Math.PI * 4);
      return [pose, extra];
    }
    default:
      return [P({ hy: -58 + breathe * 1.2, fh: [16, -10 + breathe * 1.5], bh: [8, 2 + breathe] }), extra];
  }
}

/* -------------------------------------------------------------- geometry */

/** 2-bone IK: root → target with lengths a, b; bend > 0 puts the joint forward/down */
function ik(px, py, tx, ty, a, b, bendFwd) {
  let dx = tx - px;
  let dy = ty - py;
  let d = Math.hypot(dx, dy) || 0.001;
  const maxD = a + b - 0.01;
  if (d > maxD) {
    dx *= maxD / d;
    dy *= maxD / d;
    d = maxD;
  }
  const minD = Math.abs(a - b) + 0.5;
  if (d < minD) d = minD;
  const base = Math.atan2(dy, dx);
  const off = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  // two candidate joints; pick by preferred bend direction
  const j1 = [px + a * Math.cos(base + off), py + a * Math.sin(base + off)];
  const j2 = [px + a * Math.cos(base - off), py + a * Math.sin(base - off)];
  const pick = bendFwd ? (j1[0] > j2[0] ? j1 : j2) : j1[1] > j2[1] ? j1 : j2;
  return [pick, [px + dx, py + dy]];
}

export function skeleton(pose) {
  const hip = [pose.hx, pose.hy];
  const sh = [hip[0] + Math.sin(pose.lean) * LEN.torso, hip[1] - Math.cos(pose.lean) * LEN.torso];
  const hl = pose.lean + pose.head;
  const head = [sh[0] + Math.sin(hl) * (LEN.neck + LEN.head), sh[1] - Math.cos(hl) * (LEN.neck + LEN.head)];
  const [fk, ffoot] = ik(hip[0] + 3, hip[1], pose.ff[0], pose.ff[1], LEN.thigh, LEN.shin, true);
  const [bk, bfoot] = ik(hip[0] - 3, hip[1], pose.bf[0], pose.bf[1], LEN.thigh, LEN.shin, true);
  const fsh = [sh[0] + 4, sh[1] + 3];
  const bsh = [sh[0] - 4, sh[1] + 3];
  const [fe, fhand] = ik(fsh[0], fsh[1], fsh[0] + pose.fh[0], fsh[1] + pose.fh[1], LEN.upper, LEN.fore, false);
  const [be, bhand] = ik(bsh[0], bsh[1], bsh[0] + pose.bh[0], bsh[1] + pose.bh[1], LEN.upper, LEN.fore, false);
  return { hip, sh, head, fk, ffoot, bk, bfoot, fsh, bsh, fe, fhand, be, bhand, lean: pose.lean, headTilt: hl };
}

/* -------------------------------------------------------------- painting */

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`;
}

function stroke(ctx, pts, w, color) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineWidth = w + 5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function dot(ctx, p, r, color) {
  ctx.beginPath();
  ctx.arc(p[0], p[1], r + 2.5, 0, Math.PI * 2);
  ctx.fillStyle = OUTLINE;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

const LOOK = {
  flame: { sleeve: "skin", fist: 7.5, bulk: 1 },
  frost: { sleeve: "top", fist: 7, bulk: 0.95 },
  thunder: { sleeve: "skin", fist: 7.5, bulk: 1.05 },
  shadow: { sleeve: "top", fist: 7, bulk: 0.92 },
  stone: { sleeve: "skin", fist: 10, bulk: 1.25 },
  wind: { sleeve: "skin", fist: 7, bulk: 0.95 },
};

function leg(ctx, hip, knee, foot, pal, k, bulk) {
  stroke(ctx, [hip, knee, foot], 13 * bulk, shade(pal.pants, k));
  // boot
  ctx.save();
  ctx.translate(foot[0], foot[1]);
  const ang = Math.atan2(foot[1] - knee[1], foot[0] - knee[0]) - Math.PI / 2;
  ctx.rotate(ang * 0.5);
  ctx.beginPath();
  ctx.ellipse(4, -2, 10 * bulk, 5.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = OUTLINE;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(4, -2.5, 8 * bulk, 3.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = shade(pal.boot, k);
  ctx.fill();
  ctx.restore();
}

function arm(ctx, sh, el, hand, pal, k, look) {
  const c = look.sleeve === "top" ? pal.top : pal.skin;
  stroke(ctx, [sh, el], 11 * look.bulk, shade(c, k));
  stroke(ctx, [el, hand], 10 * look.bulk, shade(look.sleeve === "top" ? pal.top2 : pal.skin, k));
  dot(ctx, hand, look.fist, shade(pal.glove, k));
}

function torso(ctx, s, pal, look) {
  const { hip, sh, lean } = s;
  const nx = Math.cos(lean);
  const ny = Math.sin(lean);
  const wS = 17 * look.bulk;
  const wH = 12 * look.bulk;
  const quad = [
    [sh[0] - nx * wS, sh[1] - ny * wS],
    [sh[0] + nx * wS, sh[1] + ny * wS],
    [hip[0] + nx * wH, hip[1] + ny * wH],
    [hip[0] - nx * wH, hip[1] - ny * wH],
  ];
  ctx.beginPath();
  ctx.moveTo(quad[0][0], quad[0][1]);
  for (const q of quad.slice(1)) ctx.lineTo(q[0], q[1]);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = 9;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = pal.top;
  ctx.stroke();
  ctx.fillStyle = pal.top;
  ctx.fill();
  // belt
  const bx = hip[0] + Math.sin(lean) * 6;
  const by = hip[1] - Math.cos(lean) * 6;
  stroke(ctx, [[bx - nx * (wH + 1), by - ny * (wH + 1)], [bx + nx * (wH + 1), by + ny * (wH + 1)]], 5, pal.belt);
  return { quad, nx, ny, bx, by };
}

/* signature details ----------------------------------------------------- */

function details(ctx, id, s, pal, time, f, tq) {
  const h = s.head;
  const r = LEN.head;
  const tl = s.headTilt;
  const up = [Math.sin(tl), -Math.cos(tl)];
  const fw = [Math.cos(tl), Math.sin(tl)];
  const at = (u, v) => [h[0] + fw[0] * u + up[0] * v, h[1] + fw[1] * u + up[1] * v];
  const eye = (u, v, w, hgt, col) => {
    const p = at(u, v);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(p[0], p[1], w, hgt, tl, 0, Math.PI * 2);
    ctx.fill();
  };
  const ko = f.state === "ko";
  const hurt = f.state === "hit" || ko;
  switch (id) {
    case "flame": {
      // flaming spiky hair
      const fl = (i) => Math.sin(time * 14 + i * 1.7) * 2.5;
      const spikes = [[-12, 4], [-14, 16 + fl(1)], [-6, 10], [-4, 24 + fl(2)], [2, 12], [8, 22 + fl(3)], [10, 8], [15, 12 + fl(4)], [12, 0]];
      ctx.beginPath();
      const p0 = at(-13, -2);
      ctx.moveTo(p0[0], p0[1]);
      for (const [u, v] of spikes) {
        const p = at(u, v);
        ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath();
      ctx.lineWidth = 5;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.fillStyle = pal.hair;
      ctx.fill();
      ctx.fillStyle = pal.hair2;
      for (const [u, v] of [[-4, 18], [8, 16], [-13, 11]]) {
        const p = at(u, v + fl(u));
        ctx.beginPath();
        ctx.arc(p[0], p[1], 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      eye(7, 1, 2.2, hurt ? 0.8 : 2.6, pal.eye);
      // angry brow
      stroke(ctx, [at(2, 6), at(11, 4)], 1.5, pal.eye);
      break;
    }
    case "frost": {
      // full mask with an eye slit
      ctx.fillStyle = pal.hair;
      ctx.beginPath();
      ctx.arc(h[0], h[1], r, 0, Math.PI * 2);
      ctx.fill();
      const a = at(-2, 4);
      const b = at(14, 4);
      const c = at(14, -3);
      const d = at(-2, -3);
      ctx.fillStyle = pal.skin;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.fill();
      eye(8, 0.5, 2.6, hurt ? 0.7 : 1.6, pal.eye);
      eye(8, 0.5, 1.2, hurt ? 0.4 : 0.9, "#1b5fa8");
      // forehead plate
      stroke(ctx, [at(-6, 9), at(10, 9)], 3, pal.accent);
      // scarf tails flowing behind the neck
      const n0 = [s.sh[0] - 2, s.sh[1] - 4];
      const wave = Math.sin(time * 7 + f.side) * 4;
      stroke(ctx, [n0, [n0[0] - 16, n0[1] + 4 + wave], [n0[0] - 32, n0[1] + 10 - wave]], 5, pal.accent);
      stroke(ctx, [n0, [n0[0] - 14, n0[1] + 10 - wave], [n0[0] - 26, n0[1] + 20 + wave]], 4, shade(pal.accent, 0.8));
      break;
    }
    case "thunder": {
      // bald head shine, calm eyes, ear
      eye(-1, -1, 3, 4, shade(pal.skin, 0.8));
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      const sh = at(-2, 8);
      ctx.beginPath();
      ctx.ellipse(sh[0], sh[1], 5, 2.5, tl - 0.4, 0, Math.PI * 2);
      ctx.fill();
      if (hurt) eye(7, 1, 2.4, 0.8, pal.eye);
      else stroke(ctx, [at(4, 1), at(10, 1.5)], 1, pal.eye);
      // forehead dot
      eye(9, 7, 1.8, 1.8, pal.accent);
      // prayer beads across the chest
      const { sh: S, hip: H } = s;
      for (let i = 0; i < 6; i++) {
        const k = i / 5;
        const p = [S[0] - 10 + (H[0] + 10 - S[0] + 10) * k * 0.8 + 8 * k, S[1] + 4 + (H[1] - S[1]) * k * 0.75];
        dot(ctx, p, 2.4, i % 2 ? "#5a2a12" : "#8a4a22");
      }
      break;
    }
    case "shadow": {
      // hood with a pointed tip, dark face, glowing eyes
      const tip = at(-14, 18);
      const p1 = at(-r - 2, -4);
      const p2 = at(r + 3, 4);
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.quadraticCurveTo(tip[0], tip[1], tip[0] + 2, tip[1]);
      ctx.quadraticCurveTo(at(10, 20)[0], at(10, 20)[1], p2[0], p2[1]);
      ctx.quadraticCurveTo(at(4, -16)[0], at(4, -16)[1], p1[0], p1[1]);
      ctx.lineWidth = 5;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.fillStyle = pal.hair;
      ctx.fill();
      const fc = at(6, -1);
      ctx.fillStyle = "#0b0610";
      ctx.beginPath();
      ctx.ellipse(fc[0], fc[1], 8, 9, tl, 0, Math.PI * 2);
      ctx.fill();
      const glow = hurt ? 0.4 : 0.8 + Math.sin(time * 5) * 0.2;
      ctx.globalAlpha *= glow;
      eye(9, 1, 3.2, 1.3, pal.eye);
      eye(4, 1, 2, 1.1, pal.eye);
      ctx.globalAlpha /= glow;
      // sash tail
      const wave = Math.sin(time * 8 + 1) * 5;
      const sb = [tq.bx - tq.nx * 8, tq.by - tq.ny * 8];
      stroke(ctx, [sb, [sb[0] - 14, sb[1] + 8 + wave], [sb[0] - 26, sb[1] + 16 - wave]], 4, pal.accent);
      break;
    }
    case "stone": {
      // heavy brow, glowing eyes, mossy shoulder and cracks
      stroke(ctx, [at(-2, 6), at(13, 5)], 4, shade(pal.skin, 0.7));
      eye(9, 1, 2.4, hurt ? 0.8 : 1.6, pal.eye);
      eye(9, 1, 1, 0.7, "#fff1c2");
      stroke(ctx, [at(-8, 4), at(-4, -2), at(-9, -7)], 1.5, shade(pal.skin, 0.6));
      const { sh: S, hip: H } = s;
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = shade(pal.top, 0.6);
      ctx.beginPath();
      ctx.moveTo(S[0] - 6, S[1] + 8);
      ctx.lineTo(S[0] + 2, S[1] + 18);
      ctx.lineTo(S[0] - 3, S[1] + 26);
      ctx.moveTo(H[0] + 6, H[1] - 10);
      ctx.lineTo(H[0] + 12, H[1] - 18);
      ctx.stroke();
      ctx.fillStyle = pal.hair2;
      ctx.beginPath();
      ctx.ellipse(S[0] + 3, S[1] + 2, 13, 6, s.lean, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "wind": {
      // hair cap, headband with tails, swinging ponytail
      ctx.fillStyle = pal.hair;
      ctx.beginPath();
      const hc = at(-2, 3);
      ctx.ellipse(hc[0], hc[1], r - 1, r - 3, tl, Math.PI * 0.95, Math.PI * 2.05);
      ctx.fill();
      const swing = Math.sin(time * 5 + f.side) * 4 + (f.state === "walk" ? Math.sin(f.t * 0.2) * 4 : 0);
      const pt = at(-12, 8);
      stroke(ctx, [pt, [pt[0] - 12, pt[1] + 8 + swing], [pt[0] - 16, pt[1] + 24 + swing]], 6, pal.hair);
      stroke(ctx, [at(-13, 4), at(13, 6)], 3.5, pal.glove);
      const kt = at(-12, 5);
      stroke(ctx, [kt, [kt[0] - 12, kt[1] + 4 - swing], [kt[0] - 22, kt[1] + 2 - swing * 0.6]], 2.5, pal.glove);
      eye(8, 0, 2.2, hurt ? 0.8 : 2.4, pal.eye);
      break;
    }
    default:
  }
}

/** draw a fighter; `ghost` = { alpha, dx } for afterimages */
export function drawFighter(ctx, f, groundY, time, ghost = null) {
  const [pose, extra] = poseOf(f, time);
  const s = skeleton(pose);
  const look = LOOK[f.def.id];
  const pal = f.pal;
  const sc = f.def.scale;
  ctx.save();
  ctx.translate(f.x + (ghost ? ghost.dx : 0), groundY - f.y - extra.lift);
  if (ghost) ctx.globalAlpha *= ghost.alpha;
  else if (f.inv > 0 && f.state !== "hit" && f.state !== "ko" && Math.floor(f.inv / 3) % 2) ctx.globalAlpha *= 0.55;
  ctx.scale(f.face * sc * extra.sx, sc);
  if (extra.rot) ctx.rotate(extra.rot);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (ghost) {
    ctx.globalCompositeOperation = "lighter";
  }
  // back limbs (darker), torso, front leg, head, front arm
  arm(ctx, s.bsh, s.be, s.bhand, pal, 0.72, look);
  leg(ctx, s.hip, s.bk, s.bfoot, pal, 0.72, look.bulk);
  const tq = torso(ctx, s, pal, look);
  leg(ctx, s.hip, s.fk, s.ffoot, pal, 1, look.bulk);
  // neck + head
  stroke(ctx, [s.sh, [s.sh[0] + Math.sin(s.headTilt) * 6, s.sh[1] - Math.cos(s.headTilt) * 6]], 9 * look.bulk, pal.skin);
  dot(ctx, s.head, LEN.head * (f.def.id === "stone" ? 1.05 : 1), pal.skin);
  details(ctx, f.def.id, s, pal, time, f, tq);
  arm(ctx, s.fsh, s.fe, s.fhand, pal, 1, look);
  // frozen: icy shell
  if (f.frozen > 0 && !ghost) {
    ctx.globalAlpha *= Math.min(1, f.frozen / 10) * 0.55;
    ctx.fillStyle = "#bfeaff";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-30, 2);
    ctx.lineTo(-34, -70);
    ctx.lineTo(-18, -138);
    ctx.lineTo(16, -142);
    ctx.lineTo(34, -80);
    ctx.lineTo(30, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  return s;
}

/** world position of the front hand (for special effects) */
export function frontHand(f, time) {
  const [pose, extra] = poseOf(f, time);
  const s = skeleton(pose);
  const sc = f.def.scale;
  return { x: f.x + s.fhand[0] * sc * f.face * extra.sx, y: f.y + extra.lift - s.fhand[1] * sc };
}
