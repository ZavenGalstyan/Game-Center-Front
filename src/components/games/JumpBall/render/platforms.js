/**
 * Jump Ball — platform painter. Screen-space, pixels.
 *
 * The drawn TOP EDGE of every platform is exactly its collision line and the
 * drawn width is exactly its collision width — decoration hangs below or
 * inside, never above or beyond (the footprint forgiveness lives in the ball,
 * not in invisible platform edges).
 *
 * g = { x (left px), y (top px), w (px), h (px, thickness), s (px per unit) }
 */

const TAU = Math.PI * 2;

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function dropShadow(ctx, g, q, alpha = 1) {
  // cast onto the far background: offset down/right, soft (layered, no blur filter)
  const off = g.h * 0.9;
  const layers = q === "low" ? 1 : 3;
  for (let i = 0; i < layers; i++) {
    const grow = (i + 1) * g.h * 0.28;
    ctx.fillStyle = `rgba(15,20,45,${(0.12 / layers) * (layers === 1 ? 1.4 : 1) * alpha})`;
    rr(ctx, g.x - grow * 0.4 + off * 0.35, g.y + off - grow * 0.2, g.w + grow * 0.8, g.h + grow * 0.6, g.h);
    ctx.fill();
  }
}

/** The shared slab: body + lit top cap + lip + end shading. */
function slab(ctx, g, c, q) {
  const { x, y, w, h } = g;
  const rad = Math.min(h * 0.5, w * 0.2);
  const body = ctx.createLinearGradient(0, y, 0, y + h);
  body.addColorStop(0, c.body[0]);
  body.addColorStop(1, c.body[1]);
  ctx.fillStyle = body;
  rr(ctx, x, y, w, h, rad);
  ctx.fill();

  // lit top cap
  const capH = h * 0.4;
  ctx.fillStyle = c.top;
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad * 0.8);
  ctx.lineTo(x + w, y + capH);
  ctx.quadraticCurveTo(x + w / 2, y + capH + h * 0.08, x, y + capH);
  ctx.lineTo(x, y + rad * 0.8);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
  ctx.fill();

  // bevel lip + top specular
  ctx.strokeStyle = c.lip;
  ctx.lineWidth = Math.max(1, h * 0.1);
  ctx.beginPath();
  ctx.moveTo(x + rad * 0.9, y + ctx.lineWidth * 0.6);
  ctx.lineTo(x + w - rad * 0.9, y + ctx.lineWidth * 0.6);
  ctx.stroke();

  if (q !== "low") {
    // light from upper-left: left end brighter, right end falls off
    const side = ctx.createLinearGradient(x, 0, x + w, 0);
    side.addColorStop(0, "rgba(255,255,255,0.14)");
    side.addColorStop(0.35, "rgba(255,255,255,0)");
    side.addColorStop(0.8, "rgba(0,0,20,0)");
    side.addColorStop(1, "rgba(0,0,20,0.22)");
    ctx.fillStyle = side;
    rr(ctx, x, y, w, h, rad);
    ctx.fill();
  }
  // crisp silhouette so the platform reads against any sky
  ctx.strokeStyle = "rgba(20,12,40,0.38)";
  ctx.lineWidth = Math.max(1, h * 0.06);
  rr(ctx, x, y, w, h, rad);
  ctx.stroke();
  // underside edge
  ctx.strokeStyle = c.edge;
  ctx.globalAlpha *= 0.55;
  ctx.lineWidth = Math.max(1, h * 0.08);
  ctx.beginPath();
  ctx.moveTo(x + rad, y + h - ctx.lineWidth / 2);
  ctx.lineTo(x + w - rad, y + h - ctx.lineWidth / 2);
  ctx.stroke();
  ctx.globalAlpha /= 0.55;
}

function centerTick(ctx, g, color) {
  ctx.fillStyle = color;
  ctx.globalAlpha *= 0.55;
  const tw = Math.max(3, g.s * 10);
  rr(ctx, g.x + g.w / 2 - tw / 2, g.y + g.h * 0.12, tw, Math.max(1.5, g.h * 0.14), 2);
  ctx.fill();
  ctx.globalAlpha /= 0.55;
}

/* ------------------------------------------------------ world dressings */

function dressWorld(ctx, g, world, q, seed) {
  const { x, y, w, h, s } = g;
  const c = world.plat;
  if (q === "low") return;
  switch (world.key) {
    case "sunny": {
      // grass tufts drooping over the front face
      ctx.fillStyle = c.detail;
      const n = Math.max(3, Math.floor(w / (s * 18)));
      for (let i = 0; i < n; i++) {
        const tx = x + ((i + 0.5) / n) * w + Math.sin(seed + i * 2.3) * s * 3;
        const tl = h * (0.22 + 0.18 * (0.5 + 0.5 * Math.sin(seed * 1.7 + i)));
        ctx.beginPath();
        ctx.moveTo(tx - s * 4, y + h * 0.36);
        ctx.quadraticCurveTo(tx, y + h * 0.36 + tl * 1.4, tx + s * 4, y + h * 0.36);
        ctx.fill();
      }
      if (q === "high" && w > s * 70) {
        const fx = x + w * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(seed * 3.1)));
        ctx.fillStyle = "#fff4a8";
        ctx.beginPath();
        ctx.arc(fx, y + h * 0.16, s * 2.4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#ff8fb1";
        ctx.beginPath();
        ctx.arc(fx + s * 9, y + h * 0.18, s * 2, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case "sunset": {
      // rooftop: mortar courses + warm window glints
      ctx.strokeStyle = "rgba(40,10,30,0.28)";
      ctx.lineWidth = Math.max(1, s * 1.2);
      ctx.beginPath();
      ctx.moveTo(x + h * 0.3, y + h * 0.7);
      ctx.lineTo(x + w - h * 0.3, y + h * 0.7);
      ctx.stroke();
      const n = Math.floor(w / (s * 26));
      ctx.fillStyle = c.detail;
      ctx.globalAlpha *= 0.55;
      for (let i = 1; i < n; i++) {
        if ((Math.floor(seed * 7) + i) % 3 === 0) continue;
        ctx.fillRect(x + (i / n) * w - s * 3, y + h * 0.5, s * 6, h * 0.14);
      }
      ctx.globalAlpha /= 0.55;
      break;
    }
    case "frozen": {
      // snow cap bumps + tiny icicles
      ctx.fillStyle = "#ffffff";
      const n = Math.max(3, Math.floor(w / (s * 22)));
      for (let i = 0; i < n; i++) {
        const bx = x + ((i + 0.5) / n) * w;
        ctx.beginPath();
        ctx.ellipse(bx, y + h * 0.38, (w / n) * 0.55, h * (0.14 + 0.08 * (0.5 + 0.5 * Math.sin(seed + i * 1.9))), 0, 0, Math.PI);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(210,236,255,0.9)";
      for (let i = 0; i < n; i++) {
        const ix = x + ((i + 0.3) / n) * w;
        const il = h * (0.35 + 0.35 * (0.5 + 0.5 * Math.sin(seed * 2.3 + i * 1.3)));
        ctx.beginPath();
        ctx.moveTo(ix - s * 2.2, y + h - 1);
        ctx.lineTo(ix, y + h + il);
        ctx.lineTo(ix + s * 2.2, y + h - 1);
        ctx.fill();
      }
      break;
    }
    case "cloud": {
      // carved marble: gold trim + fluting
      ctx.fillStyle = c.detail;
      ctx.fillRect(x + h * 0.4, y + h * 0.42, w - h * 0.8, Math.max(1, h * 0.1));
      ctx.strokeStyle = "rgba(120,90,40,0.25)";
      ctx.lineWidth = Math.max(1, s);
      const n = Math.floor(w / (s * 14));
      ctx.beginPath();
      for (let i = 1; i < n; i++) {
        const fx = x + (i / n) * w;
        ctx.moveTo(fx, y + h * 0.58);
        ctx.lineTo(fx, y + h * 0.9);
      }
      ctx.stroke();
      break;
    }
    case "neon": {
      // neon lip + underside light strip
      ctx.save();
      if (q === "high") {
        ctx.shadowColor = c.lip;
        ctx.shadowBlur = s * 10;
      }
      ctx.strokeStyle = c.lip;
      ctx.lineWidth = Math.max(1.5, s * 2);
      ctx.beginPath();
      ctx.moveTo(x + h * 0.4, y + ctx.lineWidth / 2);
      ctx.lineTo(x + w - h * 0.4, y + ctx.lineWidth / 2);
      ctx.stroke();
      ctx.strokeStyle = c.detail;
      ctx.globalAlpha *= 0.8;
      ctx.lineWidth = Math.max(1, s * 1.4);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.25, y + h * 0.78);
      ctx.lineTo(x + w * 0.75, y + h * 0.78);
      ctx.stroke();
      ctx.restore();
      break;
    }
    default:
      break;
  }
}

/* -------------------------------------------------------- special types */

const MOVING = { top: "#dfeaf8", lip: "#ffffff", body: ["#7d95ba", "#445a7d"], edge: "#253450" };
const BREAKING = { top: "#f3cf95", lip: "#fff0cc", body: ["#d69a5c", "#96602e"], edge: "#5c3614" };
const ICE = { top: "#f4fcff", lip: "#ffffff", body: ["#b5e6ff", "#5ea9d8"], edge: "#2f6f9c" };
const FINISH = { top: "#fff3b0", lip: "#ffffff", body: ["#ffcf4d", "#d98a14"], edge: "#8a4f00" };
const SPIKES = { top: "#6b7187", lip: "#aab1c8", body: ["#4a4f63", "#262a38"], edge: "#11131c" };

function chevrons(ctx, g, color) {
  const { x, y, w, h, s } = g;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.4, s * 2.2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const cy = y + h * 0.66;
  const a = h * 0.2;
  const m = Math.min(w * 0.18, s * 16);
  ctx.beginPath();
  ctx.moveTo(x + m + a, cy - a);
  ctx.lineTo(x + m, cy);
  ctx.lineTo(x + m + a, cy + a);
  ctx.moveTo(x + w - m - a, cy - a);
  ctx.lineTo(x + w - m, cy);
  ctx.lineTo(x + w - m - a, cy + a);
  ctx.stroke();
}

function cracks(ctx, g, amount) {
  const { x, y, w, h, s } = g;
  ctx.strokeStyle = "rgba(70,35,10,0.7)";
  ctx.lineWidth = Math.max(1, s * 1.3);
  ctx.lineJoin = "round";
  ctx.beginPath();
  const pts = [0.28, 0.56, 0.8];
  for (const f of pts) {
    const cx = x + w * f;
    ctx.moveTo(cx, y);
    ctx.lineTo(cx - s * 3, y + h * 0.35);
    ctx.lineTo(cx + s * 2, y + h * 0.62);
    ctx.lineTo(cx - s * 1, y + h);
  }
  if (amount > 0) {
    ctx.moveTo(x + w * 0.5, y);
    ctx.lineTo(x + w * 0.46, y + h * 0.5);
    ctx.lineTo(x + w * 0.53, y + h);
  }
  ctx.stroke();
}

function icicles(ctx, g) {
  const { x, y, w, h, s } = g;
  ctx.fillStyle = "rgba(220,244,255,0.95)";
  const n = Math.max(3, Math.floor(w / (s * 16)));
  for (let i = 0; i < n; i++) {
    const ix = x + ((i + 0.5) / n) * w;
    const il = h * (0.5 + 0.5 * ((i * 7) % 3) / 2);
    ctx.beginPath();
    ctx.moveTo(ix - s * 2.6, y + h - 1);
    ctx.lineTo(ix, y + h + il);
    ctx.lineTo(ix + s * 2.6, y + h - 1);
    ctx.fill();
  }
}

function gloss(ctx, g) {
  const { x, y, w, h } = g;
  ctx.save();
  rr(ctx, x, y, w, h, h * 0.5);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.18, y);
  ctx.lineTo(x + w * 0.28, y);
  ctx.lineTo(x + w * 0.2, y + h);
  ctx.lineTo(x + w * 0.1, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.33, y);
  ctx.lineTo(x + w * 0.36, y);
  ctx.lineTo(x + w * 0.28, y + h);
  ctx.lineTo(x + w * 0.25, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function spring(ctx, g, comp, world, q) {
  // comp: 0 rest .. 1 fully compressed. The pad top at rest IS the collision top.
  const { x, y, w, h, s } = g;
  const baseY = y + h * 0.55;
  const baseH = h * 0.75;
  slab(ctx, { ...g, y: baseY, h: baseH }, world.plat, q);
  const padDrop = comp * h * 0.42;
  const padY = y + padDrop;
  const padH = h * 0.36;
  // coil between pad and base
  const cx0 = x + w * 0.22;
  const cx1 = x + w * 0.78;
  ctx.strokeStyle = "#c9d3e6";
  ctx.lineWidth = Math.max(1.4, s * 2.2);
  ctx.lineJoin = "round";
  const coilTop = padY + padH * 0.8;
  const coilBot = baseY + baseH * 0.15;
  const turns = 3;
  for (const cx of [cx0, (cx0 + cx1) / 2, cx1]) {
    ctx.beginPath();
    for (let i = 0; i <= turns * 2; i++) {
      const yy = coilTop + ((coilBot - coilTop) * i) / (turns * 2);
      ctx.lineTo(cx + (i % 2 ? s * 5 : -s * 5), yy);
    }
    ctx.stroke();
  }
  // pad
  const pad = ctx.createLinearGradient(0, padY, 0, padY + padH);
  pad.addColorStop(0, "#ff9aa9");
  pad.addColorStop(1, "#e2334f");
  ctx.fillStyle = pad;
  rr(ctx, x + w * 0.04, padY, w * 0.92, padH, padH / 2);
  ctx.fill();
  ctx.fillStyle = "#ffe36b";
  rr(ctx, x + w * 0.3, padY + padH * 0.18, w * 0.4, padH * 0.4, padH * 0.2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = Math.max(1, s * 1.2);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.1, padY + 1);
  ctx.lineTo(x + w * 0.9, padY + 1);
  ctx.stroke();
}

function spikeRow(ctx, x, w, yBase, dir, s, color) {
  const n = Math.max(2, Math.round(w / (s * 14)));
  const sw = w / n;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const sx = x + i * sw;
    ctx.moveTo(sx, yBase);
    ctx.lineTo(sx + sw / 2, yBase + dir * sw * 0.95);
    ctx.lineTo(sx + sw, yBase);
  }
  ctx.fill();
  // lit faces
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const sx = x + i * sw;
    ctx.moveTo(sx, yBase);
    ctx.lineTo(sx + sw / 2, yBase + dir * sw * 0.95);
    ctx.lineTo(sx + sw * 0.5, yBase);
  }
  ctx.fill();
}

function flag(ctx, g, t) {
  const { x, y, w, s } = g;
  const px = x + w - s * 16;
  const top = y - s * 74;
  ctx.strokeStyle = "#e9edf5";
  ctx.lineWidth = Math.max(1.5, s * 2.6);
  ctx.beginPath();
  ctx.moveTo(px, y);
  ctx.lineTo(px, top);
  ctx.stroke();
  ctx.fillStyle = "#ffd76a";
  ctx.beginPath();
  ctx.arc(px, top, s * 3.2, 0, TAU);
  ctx.fill();
  // waving checkered flag
  const fw = s * 34;
  const fh = s * 22;
  const cols = 4;
  const rows = 3;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const u0 = i / cols;
      const u1 = (i + 1) / cols;
      const wave = (u) => Math.sin(t * 5 - u * 5) * s * 3.2 * u;
      ctx.fillStyle = (i + j) % 2 ? "#1d2238" : "#ffffff";
      ctx.beginPath();
      ctx.moveTo(px - fw * u0, top + s * 3 + (j / rows) * fh + wave(u0));
      ctx.lineTo(px - fw * u1, top + s * 3 + (j / rows) * fh + wave(u1));
      ctx.lineTo(px - fw * u1, top + s * 3 + ((j + 1) / rows) * fh + wave(u1));
      ctx.lineTo(px - fw * u0, top + s * 3 + ((j + 1) / rows) * fh + wave(u0));
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** Glowing goal ring hovering over the finish pad (drawn behind the ball). */
export function drawGoalAura(ctx, g, t, q) {
  const { x, y, w, s } = g;
  const cx = x + w / 2;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  // light beam
  const bh = s * 170;
  const beam = ctx.createLinearGradient(0, y - bh, 0, y);
  beam.addColorStop(0, "rgba(255,230,140,0)");
  beam.addColorStop(1, `rgba(255,225,130,${0.28 + 0.12 * pulse})`);
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.2, y);
  ctx.lineTo(x + w * 0.8, y);
  ctx.lineTo(x + w * 0.66, y - bh);
  ctx.lineTo(x + w * 0.34, y - bh);
  ctx.closePath();
  ctx.fill();
  // ring
  ctx.save();
  if (q === "high") {
    ctx.shadowColor = "#ffd76a";
    ctx.shadowBlur = s * 14;
  }
  ctx.strokeStyle = `rgba(255,236,160,${0.75 + 0.25 * pulse})`;
  ctx.lineWidth = Math.max(2, s * 4);
  ctx.beginPath();
  ctx.ellipse(cx, y - s * 56, w * 0.26, s * 12, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw one platform.
 * st = { t (sim time), dip (px), comp (spring 0..1), vis ({phase,k} for vanish),
 *        breakK (0..1 progress of a broken platform's fall), world, q, seed }
 */
export function drawPlatform(ctx, p, g0, st) {
  const { world, q, t } = st;
  const g = { ...g0, y: g0.y + (st.dip || 0) };
  ctx.save();

  if (p.type === "vanish") {
    const v = st.vis;
    let a = 1;
    if (v.phase === "warn") a = 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(v.k * Math.PI * 2 * (3 + v.k * 5)));
    else if (v.phase === "off") a = 0;
    else if (v.phase === "back") a = v.k * 0.5; // visibly NOT solid until it snaps back to full
    // ghost outline always shows where it will return
    ctx.setLineDash([Math.max(3, g.s * 6), Math.max(3, g.s * 5)]);
    ctx.strokeStyle = `rgba(220,200,255,${v.phase === "on" ? 0 : 0.55})`;
    ctx.lineWidth = Math.max(1, g.s * 1.6);
    rr(ctx, g.x, g.y, g.w, g.h, g.h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (a > 0.01) {
      ctx.globalAlpha = a;
      if (q !== "low") dropShadow(ctx, g, q, 0.6);
      const c = ctx.createLinearGradient(g.x, g.y, g.x + g.w, g.y + g.h);
      c.addColorStop(0, "rgba(214,190,255,0.95)");
      c.addColorStop(0.5, "rgba(150,120,255,0.88)");
      c.addColorStop(1, "rgba(110,200,255,0.9)");
      ctx.fillStyle = c;
      rr(ctx, g.x, g.y, g.w, g.h, g.h / 2);
      ctx.fill();
      // facets
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = Math.max(1, g.s);
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        const fx = g.x + (i / 4) * g.w;
        ctx.moveTo(fx - g.s * 6, g.y + g.h);
        ctx.lineTo(fx + g.s * 4, g.y);
      }
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(g.x + g.h * 0.5, g.y + 1, g.w - g.h, Math.max(1, g.h * 0.12));
      centerTick(ctx, g, "#ffffff");
    }
    ctx.restore();
    return;
  }

  if (p.type === "breaking" && p.broken) {
    // two halves drop and tumble away
    const k = st.breakK;
    const shake = k < 0.12 ? Math.sin(k * 260) * g.s * 2.5 : 0;
    const fall = k < 0.12 ? 0 : Math.pow((k - 0.12) / 0.88, 2) * g.s * 380;
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.45) / 0.55);
    for (const side of [-1, 1]) {
      ctx.save();
      const half = g.w / 2;
      const hx = side < 0 ? g.x : g.x + half;
      ctx.translate(hx + half / 2 + shake + side * fall * 0.12, g.y + g.h / 2 + fall);
      ctx.rotate(side * fall * 0.004);
      const hg = { x: -half / 2, y: -g.h / 2, w: half - g.s * 1.5, h: g.h, s: g.s };
      slab(ctx, hg, BREAKING, q);
      cracks(ctx, hg, 1);
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  if (q !== "low" || p.type !== "spikes") dropShadow(ctx, g, q);

  switch (p.type) {
    case "moving":
      slab(ctx, g, MOVING, q);
      chevrons(ctx, g, "rgba(255,255,255,0.85)");
      centerTick(ctx, g, "#ffffff");
      break;
    case "breaking":
      slab(ctx, g, BREAKING, q);
      cracks(ctx, g, 0);
      centerTick(ctx, g, "#fff6dd");
      break;
    case "spring":
      spring(ctx, g, st.comp || 0, world, q);
      break;
    case "ice":
      slab(ctx, g, ICE, q);
      gloss(ctx, g);
      icicles(ctx, g);
      centerTick(ctx, g, "#7fc8f0");
      break;
    case "spikes": {
      const body = { ...g, y: g.y + g.h * 0.35, h: g.h * 0.45 };
      spikeRow(ctx, g.x + g.s * 2, g.w - g.s * 4, body.y + 1, -1, g.s, "#c7cedf");
      spikeRow(ctx, g.x + g.s * 2, g.w - g.s * 4, body.y + body.h - 1, 1, g.s, "#9aa2b8");
      slab(ctx, body, SPIKES, q);
      ctx.fillStyle = "#ff4d5e";
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(body.x + body.w * (0.2 + i * 0.3) - g.s * 3, body.y + body.h * 0.35, g.s * 6, body.h * 0.3);
      }
      break;
    }
    case "finish":
      slab(ctx, g, FINISH, q);
      // checker strip
      {
        const n = Math.floor(g.w / (g.s * 10));
        const cw = g.w / n;
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = i % 2 ? "rgba(40,30,10,0.55)" : "rgba(255,255,255,0.7)";
          ctx.fillRect(g.x + i * cw, g.y + g.h * 0.55, cw, g.h * 0.2);
        }
      }
      flag(ctx, g, t);
      break;
    default: {
      slab(ctx, g, world.plat, q);
      dressWorld(ctx, g, world, q, st.seed || 0);
      centerTick(ctx, g, world.plat.lip);
      break;
    }
  }
  ctx.restore();
}

/** Faint track showing a horizontal mover's full range (read the pattern). */
export function drawTrack(ctx, x0, x1, y, s, color = "rgba(255,255,255,0.35)") {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s * 2);
  ctx.setLineDash([Math.max(2, s * 4), Math.max(3, s * 7)]);
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  for (const x of [x0, x1]) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, s * 3.5), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export function drawStar(ctx, x, y, r, t, taken = 0) {
  // collectible: faceted gold star with a gentle bob and halo
  const bob = Math.sin(t * 3 + x * 0.01) * r * 0.12;
  const a = 1 - taken;
  if (a <= 0) return;
  ctx.save();
  ctx.translate(x, y + bob - taken * r * 1.4);
  ctx.scale(1 + taken * 0.6, 1 + taken * 0.6);
  ctx.globalAlpha = a;
  const halo = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.9);
  halo.addColorStop(0, "rgba(255,230,120,0.55)");
  halo.addColorStop(1, "rgba(255,230,120,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.9, 0, TAU);
  ctx.fill();
  ctx.rotate(Math.sin(t * 2 + x) * 0.15);
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.45 : r;
    pts.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
  }
  ctx.fillStyle = "#e89a12";
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
  // faceted: light upper-left facets
  for (let i = 0; i < 10; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % 10];
    const light = i >= 6 || i <= 0 ? "#fff1a8" : i <= 2 ? "#ffd84a" : "#f5b324";
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(140,70,0,0.45)";
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}
