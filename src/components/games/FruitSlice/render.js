/**
 * Fruit Slice canvas renderer — draws one frame of engine state in world
 * units (the caller sets the world→pixel transform). All art is procedural:
 * each fruit has a skin drawer and a cut-face drawer used for the halves.
 */
import { H, FRUITS, multiplier } from "./engine.js";

const TAU = Math.PI * 2;

// ---------- background (cached per size) ----------
let bg = null;
function background(ctx, W) {
  const key = `${Math.round(W)}`;
  if (!bg || bg.key !== key) {
    const c = document.createElement("canvas");
    c.width = Math.ceil(W / 2);
    c.height = H / 2;
    const g = c.getContext("2d");
    g.scale(0.5, 0.5);
    const plank = 120;
    for (let x = 0, i = 0; x < W; x += plank, i++) {
      const grad = g.createLinearGradient(x, 0, x + plank, 0);
      const base = [ "#4a2e1c", "#53341f", "#462b1a", "#4f311d" ][i % 4];
      grad.addColorStop(0, "#2c1a0f");
      grad.addColorStop(0.04, base);
      grad.addColorStop(0.96, base);
      grad.addColorStop(1, "#24150c");
      g.fillStyle = grad;
      g.fillRect(x, 0, plank, H);
      g.strokeStyle = "rgba(0,0,0,0.18)";
      g.lineWidth = 2;
      for (let k = 0; k < 7; k++) {
        const gx = x + 12 + ((i * 37 + k * 23) % (plank - 24));
        g.beginPath();
        g.moveTo(gx, 0);
        for (let y = 0; y <= H; y += 40) g.lineTo(gx + Math.sin((y + k * 50 + i * 90) * 0.012) * 6, y);
        g.stroke();
      }
      g.fillStyle = "rgba(20,10,4,0.45)";
      g.beginPath();
      g.ellipse(x + 30 + ((i * 53) % 60), 140 + ((i * 211) % 420), 9, 14, 0, 0, TAU);
      g.fill();
    }
    const v = g.createRadialGradient(W / 2, H * 0.45, H * 0.2, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.6)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
    bg = { key, c };
  }
  ctx.drawImage(bg.c, 0, 0, W, H);
}

// ---------- fruit art ----------
function shine(ctx, r) {
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.28, r * 0.16, -0.6, 0, TAU);
  ctx.fill();
}
function ball(ctx, r, c1, c2) {
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
}
function leaf(ctx, x, y, a, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = "#3fae3a";
  ctx.beginPath();
  ctx.ellipse(8 * s, 0, 9 * s, 4.5 * s, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

const SKIN = {
  watermelon(ctx, r) {
    ctx.save();
    ctx.scale(1.12, 0.92);
    ball(ctx, r, "#5fd068", "#1f6e2c");
    ctx.strokeStyle = "rgba(14,70,24,0.75)";
    ctx.lineWidth = r * 0.13;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.abs(i) * r * 0.32 + 2, r * 0.97, 0, -Math.PI / 2, Math.PI / 2, i < 0);
      ctx.stroke();
    }
    shine(ctx, r);
    ctx.restore();
  },
  orange(ctx, r) {
    ball(ctx, r, "#ffc35a", "#f07800");
    ctx.fillStyle = "rgba(190,90,0,0.25)";
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.6 * ((i % 3) / 3 + 0.4), Math.sin(a) * r * 0.6 * ((i % 3) / 3 + 0.4), 1.6, 0, TAU);
      ctx.fill();
    }
    leaf(ctx, 2, -r * 0.92, -0.4);
    shine(ctx, r);
  },
  apple(ctx, r) {
    ball(ctx, r, "#ff6b6b", "#b3001b");
    ctx.fillStyle = "rgba(90,0,10,0.5)";
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.82, r * 0.22, r * 0.1, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#5b3418";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.8);
    ctx.quadraticCurveTo(2, -r * 1.1, 6, -r * 1.25);
    ctx.stroke();
    leaf(ctx, 5, -r * 1.1, -0.5);
    shine(ctx, r);
  },
  strawberry(ctx, r) {
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.2, 2, 0, 0, r * 1.2);
    g.addColorStop(0, "#ff7a8f");
    g.addColorStop(1, "#c4002b");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, r * 1.1);
    ctx.bezierCurveTo(-r * 1.3, r * 0.2, -r * 1.05, -r * 0.95, 0, -r * 0.7);
    ctx.bezierCurveTo(r * 1.05, -r * 0.95, r * 1.3, r * 0.2, 0, r * 1.1);
    ctx.fill();
    ctx.fillStyle = "#ffe36b";
    for (let i = 0; i < 12; i++) {
      const sx = ((i % 4) - 1.5) * r * 0.38;
      const sy = (Math.floor(i / 4) - 0.6) * r * 0.45;
      ctx.beginPath();
      ctx.ellipse(sx * (1 - sy / (r * 2)), sy, 1.6, 2.6, 0, 0, TAU);
      ctx.fill();
    }
    for (let i = 0; i < 5; i++) leaf(ctx, 0, -r * 0.72, -Math.PI / 2 + (i - 2) * 0.62, 0.9);
    shine(ctx, r * 0.9);
  },
  kiwi(ctx, r) {
    ctx.save();
    ctx.scale(1.12, 0.94);
    ball(ctx, r, "#b07a45", "#5e3a1a");
    ctx.strokeStyle = "rgba(60,35,12,0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const a = i * 0.9;
      const d = r * (0.25 + (i % 5) * 0.15);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
      ctx.lineTo(Math.cos(a) * d + 3, Math.sin(a) * d + 2);
      ctx.stroke();
    }
    ctx.restore();
  },
};

// cut faces, drawn as a squashed disc in the half's local frame
const FACE = {
  watermelon(ctx, r) {
    disc(ctx, r * 1.05, "#2f9e44");
    disc(ctx, r * 0.95, "#f5ffe8");
    disc(ctx, r * 0.86, "#ff3b5c");
    seeds(ctx, r * 0.55, 9, "#1b1b1b");
  },
  orange(ctx, r) {
    disc(ctx, r, "#ff9419");
    disc(ctx, r * 0.88, "#fff0c2");
    disc(ctx, r * 0.82, "#ffb02e");
    ctx.strokeStyle = "rgba(255,240,200,0.9)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos((i * TAU) / 10) * r * 0.8, Math.sin((i * TAU) / 10) * r * 0.8 * 0.5);
      ctx.stroke();
    }
  },
  apple(ctx, r) {
    disc(ctx, r, "#d0102a");
    disc(ctx, r * 0.9, "#fff1c9");
    seeds(ctx, r * 0.22, 5, "#5b3418");
  },
  strawberry(ctx, r) {
    disc(ctx, r * 0.95, "#e8193f");
    disc(ctx, r * 0.72, "#ff6d86");
    disc(ctx, r * 0.35, "#ffd6de");
  },
  kiwi(ctx, r) {
    disc(ctx, r * 1.05, "#6b4423");
    disc(ctx, r * 0.95, "#8fd14f");
    disc(ctx, r * 0.35, "#f3f8d8");
    seeds(ctx, r * 0.48, 14, "#1d1d10");
  },
};
function disc(ctx, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.5, 0, 0, TAU);
  ctx.fill();
}
function seeds(ctx, d, n, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = (i * TAU) / n;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d * 0.5, 2.6, 1.6, a, 0, TAU);
    ctx.fill();
  }
}

function bomb(ctx, it, time) {
  const r = it.r;
  const pulse = 0.5 + Math.sin(time * 10) * 0.5;
  const aura = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.7);
  aura.addColorStop(0, `rgba(255,40,40,${0.35 + pulse * 0.25})`);
  aura.addColorStop(1, "rgba(255,40,40,0)");
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.7, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.rotate(it.rot);
  ball(ctx, r, "#5b6478", "#0d1018");
  ctx.fillStyle = "#9aa3b5";
  ctx.fillRect(-r * 0.3, -r * 1.12, r * 0.6, r * 0.3);
  ctx.strokeStyle = "#c9a26b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.12);
  ctx.quadraticCurveTo(r * 0.3, -r * 1.5, r * 0.55, -r * 1.45);
  ctx.stroke();
  // spark
  ctx.fillStyle = `rgba(255,${200 + pulse * 55},120,1)`;
  ctx.beginPath();
  ctx.arc(r * 0.58, -r * 1.46, 4 + pulse * 4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(r * 0.58, -r * 1.46, 2.2, 0, TAU);
  ctx.fill();
  // skull mark
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(0, -r * 0.05, r * 0.32, 0, TAU);
  ctx.fill();
  ctx.fillRect(-r * 0.18, r * 0.15, r * 0.36, r * 0.2);
  ctx.fillStyle = "#0d1018";
  ctx.beginPath();
  ctx.arc(-r * 0.12, -r * 0.08, r * 0.09, 0, TAU);
  ctx.arc(r * 0.12, -r * 0.08, r * 0.09, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function perkRing(ctx, it, time) {
  const color = it.perk === "bonus" ? "255,210,63" : "92,225,255";
  const r = it.r * (1.35 + Math.sin(time * 8) * 0.06);
  const g = ctx.createRadialGradient(0, 0, it.r * 0.9, 0, 0, r);
  g.addColorStop(0, `rgba(${color},0.55)`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
}

function text(ctx, str, x, y, size, color, align = "center") {
  ctx.font = `900 ${size}px "Nunito", "Segoe UI Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = size * 0.18;
  ctx.strokeStyle = "rgba(30,12,4,0.85)";
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function hud(ctx, s) {
  text(ctx, String(s.score), 28, 52, 54, "#ffd23f", "left");
  text(ctx, `BEST ${Math.max(s.best, s.score)}`, 30, 96, 20, "#f4e3c8", "left");
  const m = multiplier(s);
  if (m > 1) text(ctx, `x${m}`, 30, 132, 28, "#5ce1ff", "left");
  if (s.mode === "classic") {
    for (let i = 0; i < 3; i++) {
      const on = i < s.misses;
      text(ctx, "✕", s.W / 2 - 44 + i * 44, 44, on ? 40 : 32, on ? "#ff4d4d" : "rgba(255,255,255,0.28)");
    }
  } else {
    const t = Math.ceil(s.timeLeft);
    const low = s.timeLeft <= 10;
    const k = low ? 1 + Math.max(0, Math.sin(s.time * 12)) * 0.08 : 1;
    ctx.save();
    ctx.translate(s.W / 2, 48);
    ctx.scale(k, k);
    text(ctx, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`, 0, 0, 44, low ? "#ff5a5a" : "#fff");
    ctx.restore();
  }
}

export function draw(ctx, s) {
  const W = s.W;
  ctx.save();
  if (s.shake > 0) ctx.translate((Math.random() - 0.5) * 18 * s.shake, (Math.random() - 0.5) * 18 * s.shake);
  background(ctx, W);

  for (const p of s.splats) {
    ctx.globalAlpha = 0.45 * (1 - p.age / 3);
    ctx.fillStyle = p.color;
    for (let i = 0; i < 6; i++) {
      const a = p.seed + i * 1.7;
      const d = i ? p.r * (0.5 + ((i * 37) % 10) / 20) : 0;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, i ? p.r * 0.22 : p.r * 0.7, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  for (const h of s.halves) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.rot);
    ctx.beginPath();
    ctx.rect(-h.r * 1.6, h.side > 0 ? 0 : -h.r * 1.6, h.r * 3.2, h.r * 1.6);
    ctx.clip();
    ctx.save();
    ctx.rotate(h.skin);
    SKIN[h.type](ctx, h.r);
    ctx.restore();
    FACE[h.type](ctx, h.r);
    ctx.restore();
  }

  for (const it of s.items) {
    ctx.save();
    ctx.translate(it.x, it.y);
    if (it.kind === "bomb") bomb(ctx, it, s.time);
    else {
      if (it.perk) perkRing(ctx, it, s.time);
      ctx.rotate(it.rot);
      SKIN[it.type](ctx, it.r);
    }
    ctx.restore();
  }

  for (const p of s.parts) {
    ctx.globalAlpha = 1 - p.age / p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1 - (p.age / p.life) * 0.5), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // blade trail: tapered glow + white core
  const tr = s.trail;
  if (tr.length > 1) {
    ctx.lineCap = "round";
    for (const [w, color] of [[16, "rgba(92,225,255,0.25)"], [7, "rgba(190,245,255,0.8)"], [3, "#fff"]]) {
      ctx.strokeStyle = color;
      for (let i = 1; i < tr.length; i++) {
        const k = i / tr.length;
        ctx.lineWidth = w * k;
        ctx.beginPath();
        ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
        ctx.lineTo(tr[i].x, tr[i].y);
        ctx.stroke();
      }
    }
  }

  for (const p of s.pops) {
    ctx.globalAlpha = Math.min(1, (0.9 - p.t) * 3);
    text(ctx, p.text, p.x, p.y - p.t * 60, p.size * (1 + Math.max(0, 0.15 - p.t)), p.color);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (!s.demo) hud(ctx, s);
  if (s.flash > 0) {
    ctx.fillStyle = `rgba(255,245,225,${Math.min(1, s.flash) * 0.85})`;
    ctx.fillRect(0, 0, W, H);
  }
}
