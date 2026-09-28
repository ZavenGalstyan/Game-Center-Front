/**
 * Boxing Club — light-weight hit effects (Canvas 2D): impact arcs, sweat
 * spray, block sparks, canvas dust and small floating words (COUNTER,
 * PERFECT, 2 HIT). No blood, nothing graphic. Capped particle count.
 */
const MAX = 160;

export function createFx() {
  return { parts: [], words: [], rings: [] };
}

export function clearFx(fx) {
  fx.parts.length = 0;
  fx.words.length = 0;
  fx.rings.length = 0;
}

function push(fx, p) {
  if (fx.parts.length >= MAX) fx.parts.shift();
  fx.parts.push(p);
}

/** Clean hit: flash ring + impact arc + sweat droplets thrown away from the puncher. */
export function impact(fx, x, y, dir, strength, S, opts = {}) {
  const many = opts.particles === false ? 0 : Math.round((opts.detail === "high" ? 12 : opts.detail === "low" ? 3 : 7) * strength);
  fx.rings.push({ x, y, t: 0, dur: 180 + strength * 90, r0: 0.05 * S, r1: (0.22 + strength * 0.2) * S, color: opts.color || "255,255,255", arc: dir });
  for (let i = 0; i < many; i++) {
    const a = (Math.random() - 0.5) * 1.6 + (dir > 0 ? 0 : Math.PI) - 0.35;
    const sp = (1.2 + Math.random() * 2.2) * S * (0.6 + strength * 0.5);
    push(fx, {
      kind: "sweat", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - S * 0.8, t: 0,
      dur: 380 + Math.random() * 260, r: (0.008 + Math.random() * 0.012) * S,
    });
  }
}

export function blockSpark(fx, x, y, dir, S, opts = {}) {
  fx.rings.push({ x, y, t: 0, dur: 150, r0: 0.04 * S, r1: 0.16 * S, color: "180,220,255", arc: dir, thin: true });
  const n = opts.particles === false ? 0 : 4;
  for (let i = 0; i < n; i++) {
    const a = (Math.random() - 0.5) * 2.2 + (dir > 0 ? 0 : Math.PI);
    push(fx, { kind: "spark", x, y, vx: Math.cos(a) * S * 1.6, vy: Math.sin(a) * S * 1.6, t: 0, dur: 180, r: 0.01 * S });
  }
}

export function dust(fx, x, y, S, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = Math.PI + Math.random() * Math.PI;
    push(fx, { kind: "dust", x: x + (Math.random() - 0.5) * S * 0.8, y, vx: Math.cos(a) * S * 0.6, vy: Math.sin(a) * S * 0.25, t: 0, dur: 700 + Math.random() * 400, r: (0.05 + Math.random() * 0.06) * S });
  }
}

export function word(fx, text, x, y, color, size = 1) {
  fx.words.push({ text, x, y, t: 0, dur: 820, color, size });
  if (fx.words.length > 5) fx.words.shift();
}

export function stepFx(fx, dt) {
  const s = dt / 1000;
  for (const p of fx.parts) {
    p.t += dt;
    p.x += p.vx * s;
    p.y += p.vy * s;
    if (p.kind === "sweat") p.vy += 900 * s * (p.r > 0 ? 1 : 0);
    if (p.kind === "dust") {
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
  }
  fx.parts = fx.parts.filter((p) => p.t < p.dur);
  for (const r of fx.rings) r.t += dt;
  fx.rings = fx.rings.filter((r) => r.t < r.dur);
  for (const w of fx.words) w.t += dt;
  fx.words = fx.words.filter((w) => w.t < w.dur);
}

export function drawFx(ctx, fx, S) {
  for (const r of fx.rings) {
    const k = r.t / r.dur;
    const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k));
    ctx.strokeStyle = `rgba(${r.color},${(1 - k) * 0.9})`;
    ctx.lineWidth = (r.thin ? 0.012 : 0.028) * S * (1 - k * 0.6);
    ctx.beginPath();
    // impact arc opening away from the puncher
    const base = r.arc > 0 ? 0 : Math.PI;
    ctx.arc(r.x, r.y, rad, base - 1.1, base + 1.1);
    ctx.stroke();
    if (!r.thin && k < 0.35) {
      const g = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, rad);
      g.addColorStop(0, `rgba(255,255,240,${0.55 * (1 - k / 0.35)})`);
      g.addColorStop(1, "rgba(255,255,240,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const p of fx.parts) {
    const k = p.t / p.dur;
    if (p.kind === "sweat") {
      ctx.fillStyle = `rgba(210,235,255,${0.85 * (1 - k)})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r, p.r * 1.5, Math.atan2(p.vy, p.vx) + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "spark") {
      ctx.strokeStyle = `rgba(220,240,255,${1 - k})`;
      ctx.lineWidth = p.r;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(210,200,180,${0.35 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 + k), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const w of fx.words) {
    const k = w.t / w.dur;
    const a = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `900 ${Math.round(0.16 * S * w.size)}px Impact, "Arial Black", sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 0.03 * S;
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    const y = w.y - k * 0.3 * S;
    ctx.strokeText(w.text, w.x, y);
    ctx.fillStyle = w.color;
    ctx.fillText(w.text, w.x, y);
    ctx.restore();
  }
}
