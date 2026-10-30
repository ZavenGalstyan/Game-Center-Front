/**
 * The four arena backdrops, painted procedurally. `bakeArena` renders the
 * static part once per arena/resolution into an offscreen canvas; `ambient`
 * adds the cheap animated bits (torch flames, neon flicker, drifting sand,
 * falling ice motes) every frame. Backgrounds only — combat physics are the
 * same everywhere.
 */
import { VIEW_W, VIEW_H, GROUND } from "../engine/data.js";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const grad = (ctx, y0, y1, stops) => {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
};

function ridge(ctx, base, amp, step, color, r, sharp = false) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, VIEW_H);
  ctx.lineTo(0, base);
  for (let x = 0; x <= VIEW_W + step; x += step) {
    const y = base - r() * amp;
    if (sharp) ctx.lineTo(x, y);
    else ctx.quadraticCurveTo(x - step / 2, base - r() * amp, x, y);
  }
  ctx.lineTo(VIEW_W, VIEW_H);
  ctx.closePath();
  ctx.fill();
}

function floor(ctx, top, bottom, lines, tileColor) {
  ctx.fillStyle = grad(ctx, GROUND, VIEW_H, [[0, top], [1, bottom]]);
  ctx.fillRect(0, GROUND, VIEW_W, VIEW_H - GROUND);
  ctx.strokeStyle = lines;
  ctx.lineWidth = 1.5;
  // perspective tiles
  for (let i = -12; i <= 12; i++) {
    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2 + i * 60, GROUND);
    ctx.lineTo(VIEW_W / 2 + i * 120, VIEW_H);
    ctx.stroke();
  }
  for (const y of [GROUND + 14, GROUND + 34, GROUND + 60]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    ctx.stroke();
  }
  if (tileColor) {
    ctx.fillStyle = tileColor;
    ctx.fillRect(0, GROUND - 2, VIEW_W, 4);
  }
}

/* ---------------------------------------------------------------- temple */
function temple(ctx) {
  const r = rng(11);
  ctx.fillStyle = grad(ctx, 0, GROUND, [[0, "#2a1440"], [0.45, "#a33a5a"], [0.75, "#ff7b54"], [1, "#ffc27a"]]);
  ctx.fillRect(0, 0, VIEW_W, GROUND);
  // sun
  const sg = ctx.createRadialGradient(480, 300, 10, 480, 300, 160);
  sg.addColorStop(0, "rgba(255,240,180,1)");
  sg.addColorStop(0.35, "rgba(255,200,120,0.85)");
  sg.addColorStop(1, "rgba(255,140,90,0)");
  ctx.fillStyle = sg;
  ctx.fillRect(300, 120, 360, 360);
  ridge(ctx, 360, 90, 80, "#6b2c4f", r, true);
  ridge(ctx, 400, 50, 60, "#4a1f3c", r);
  // temple: steps + tiered roofs
  ctx.fillStyle = "#3a1830";
  ctx.fillRect(330, 330, 300, 90);
  for (let i = 0; i < 5; i++) ctx.fillRect(300 - i * 14, 410 + i * 12, 360 + i * 28, 12);
  const roof = (y, w, h) => {
    ctx.beginPath();
    ctx.moveTo(480 - w / 2 - 26, y + h);
    ctx.quadraticCurveTo(480 - w / 2, y + h - 4, 480 - w / 2 + 20, y);
    ctx.lineTo(480 + w / 2 - 20, y);
    ctx.quadraticCurveTo(480 + w / 2, y + h - 4, 480 + w / 2 + 26, y + h);
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = "#2b1024";
  roof(304, 340, 30);
  ctx.fillRect(360, 250, 240, 56);
  roof(226, 270, 28);
  ctx.fillRect(400, 186, 160, 42);
  roof(160, 200, 28);
  ctx.fillStyle = "#ffb15c";
  for (let i = 0; i < 4; i++) ctx.fillRect(386 + i * 52, 264, 20, 30);
  ctx.fillRect(470, 344, 20, 40);
  // pillars with banners
  for (const x of [70, 860]) {
    ctx.fillStyle = grad(ctx, 0, GROUND, [[0, "#7a4a3a"], [1, "#4a261e"]]);
    ctx.fillRect(x - 22, 90, 44, GROUND - 90);
    ctx.fillStyle = "#3a1a14";
    ctx.fillRect(x - 30, 80, 60, 18);
    ctx.fillRect(x - 30, GROUND - 16, 60, 16);
    ctx.fillStyle = "#c62828";
    ctx.beginPath();
    ctx.moveTo(x - 14, 110);
    ctx.lineTo(x + 14, 110);
    ctx.lineTo(x + 14, 250);
    ctx.lineTo(x, 236);
    ctx.lineTo(x - 14, 250);
    ctx.fill();
    ctx.strokeStyle = "#ffc93c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, 150, 8, 0, Math.PI * 2);
    ctx.stroke();
    // torch bowl
    ctx.fillStyle = "#2a1a14";
    ctx.fillRect(x - 12, 280, 24, 10);
  }
  floor(ctx, "#8a5a44", "#4a2c22", "rgba(40,18,12,0.45)", "#c98a5c");
}

/* ---------------------------------------------------------------- rooftop */
function rooftop(ctx) {
  const r = rng(23);
  ctx.fillStyle = grad(ctx, 0, GROUND, [[0, "#070b24"], [0.6, "#24164a"], [1, "#5a2a6a"]]);
  ctx.fillRect(0, 0, VIEW_W, GROUND);
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 90; i++) {
    ctx.globalAlpha = 0.3 + r() * 0.7;
    ctx.fillRect(r() * VIEW_W, r() * 260, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;
  // moon
  ctx.fillStyle = "#fff4d6";
  ctx.beginPath();
  ctx.arc(780, 90, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#24164a";
  ctx.beginPath();
  ctx.arc(796, 82, 30, 0, Math.PI * 2);
  ctx.fill();
  // skyline layers with lit windows
  const layer = (base, minH, maxH, col, win, seed) => {
    const q = rng(seed);
    let x = -10;
    while (x < VIEW_W) {
      const w = 40 + q() * 70;
      const h = minH + q() * (maxH - minH);
      ctx.fillStyle = col;
      ctx.fillRect(x, base - h, w, h + 200);
      if (q() < 0.3) ctx.fillRect(x + w / 2 - 2, base - h - 26, 4, 26);
      ctx.fillStyle = win;
      for (let wy = base - h + 10; wy < base - 8; wy += 14)
        for (let wx = x + 6; wx < x + w - 8; wx += 12) if (q() < 0.35) ctx.fillRect(wx, wy, 5, 7);
      x += w + 4;
    }
  };
  layer(400, 80, 230, "#1a1338", "rgba(255,220,140,0.55)", 5);
  layer(430, 50, 160, "#120c28", "rgba(140,220,255,0.6)", 9);
  // water tower + AC units + railing
  ctx.fillStyle = "#0c0818";
  ctx.fillRect(120, 300, 90, 70);
  ctx.beginPath();
  ctx.moveTo(110, 300);
  ctx.lineTo(165, 270);
  ctx.lineTo(220, 300);
  ctx.fill();
  for (const lx of [126, 160, 196]) ctx.fillRect(lx, 370, 6, 70);
  ctx.fillRect(700, 400, 110, 50);
  ctx.fillRect(820, 414, 70, 36);
  ctx.strokeStyle = "#2a2148";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 420);
  ctx.lineTo(VIEW_W, 420);
  ctx.stroke();
  ctx.lineWidth = 3;
  for (let x = 10; x < VIEW_W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 420);
    ctx.lineTo(x, GROUND);
    ctx.stroke();
  }
  // neon sign frame (lit in ambient)
  ctx.fillStyle = "#0c0818";
  ctx.fillRect(560, 240, 150, 70);
  for (let x = 580; x < 700; x += 40) ctx.fillRect(x, 310, 4, 110);
  floor(ctx, "#3a3450", "#1a1628", "rgba(255,255,255,0.06)", "#5a4a8a");
}

/* ---------------------------------------------------------------- desert */
function desert(ctx) {
  const r = rng(37);
  ctx.fillStyle = grad(ctx, 0, GROUND, [[0, "#3f9de0"], [0.55, "#9fd4f0"], [1, "#ffe0a3"]]);
  ctx.fillRect(0, 0, VIEW_W, GROUND);
  const sg = ctx.createRadialGradient(200, 110, 10, 200, 110, 110);
  sg.addColorStop(0, "rgba(255,255,230,1)");
  sg.addColorStop(0.3, "rgba(255,240,170,0.9)");
  sg.addColorStop(1, "rgba(255,230,150,0)");
  ctx.fillStyle = sg;
  ctx.fillRect(80, 0, 240, 230);
  ridge(ctx, 380, 70, 120, "#e0b070", r);
  ridge(ctx, 420, 40, 90, "#d09858", r);
  // ruins: arch + broken pillars
  ctx.fillStyle = "#b8865a";
  ctx.fillRect(600, 250, 34, 180);
  ctx.fillRect(740, 250, 34, 180);
  ctx.beginPath();
  ctx.moveTo(600, 250);
  ctx.quadraticCurveTo(687, 160, 774, 250);
  ctx.lineTo(774, 270);
  ctx.quadraticCurveTo(687, 196, 600, 270);
  ctx.fill();
  ctx.fillStyle = "#a5764e";
  ctx.fillRect(300, 330, 28, 100);
  ctx.fillRect(360, 360, 28, 70);
  ctx.beginPath();
  ctx.moveTo(300, 330);
  ctx.lineTo(312, 318);
  ctx.lineTo(328, 334);
  ctx.fill();
  // cacti
  const cactus = (x, h) => {
    ctx.fillStyle = "#4f8a4a";
    ctx.fillRect(x - 7, GROUND - 40 - h, 14, h + 40);
    ctx.fillRect(x - 24, GROUND - 30 - h * 0.6, 10, h * 0.4);
    ctx.fillRect(x - 24, GROUND - 30 - h * 0.25, 20, 9);
    ctx.fillRect(x + 14, GROUND - 40 - h * 0.8, 10, h * 0.45);
    ctx.fillRect(x + 4, GROUND - 40 - h * 0.4, 20, 9);
  };
  cactus(90, 60);
  cactus(890, 40);
  floor(ctx, "#e8c088", "#c08850", "rgba(150,100,50,0.25)", "#f2d29a");
}

/* ---------------------------------------------------------------- cave */
function cave(ctx) {
  const r = rng(51);
  ctx.fillStyle = grad(ctx, 0, GROUND, [[0, "#04101e"], [0.5, "#0e2a48"], [1, "#2a5a80"]]);
  ctx.fillRect(0, 0, VIEW_W, GROUND);
  // frozen waterfall
  ctx.fillStyle = grad(ctx, 60, GROUND, [[0, "rgba(160,220,255,0.15)"], [1, "rgba(200,240,255,0.5)"]]);
  ctx.beginPath();
  ctx.moveTo(400, 40);
  ctx.quadraticCurveTo(380, 250, 360, GROUND);
  ctx.lineTo(600, GROUND);
  ctx.quadraticCurveTo(580, 250, 560, 40);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const x = 410 + i * 20;
    ctx.beginPath();
    ctx.moveTo(x, 60);
    ctx.quadraticCurveTo(x - 10, 260, x - 20 + r() * 10, GROUND);
    ctx.stroke();
  }
  // walls
  ridge(ctx, 420, 120, 70, "#0a1e34", r, true);
  // stalactites
  ctx.fillStyle = "#0a1a2e";
  ctx.fillRect(0, 0, VIEW_W, 26);
  for (let x = 0; x < VIEW_W; x += 26 + r() * 30) {
    const h = 30 + r() * 90;
    ctx.fillStyle = r() < 0.5 ? "#9ad8ff" : "#6ab8e8";
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x + 10, 20 + h);
    ctx.lineTo(x + 20, 20);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.moveTo(x + 4, 20);
    ctx.lineTo(x + 10, 20 + h * 0.8);
    ctx.lineTo(x + 8, 20);
    ctx.fill();
  }
  // crystal clusters
  const crystal = (x, y, s) => {
    for (const [dx, h, a] of [[0, 70, 0], [-14, 46, -0.35], [14, 52, 0.3], [-24, 30, -0.6]]) {
      ctx.save();
      ctx.translate(x + dx * s, y);
      ctx.rotate(a);
      ctx.fillStyle = "#5fd0ff";
      ctx.beginPath();
      ctx.moveTo(-8 * s, 0);
      ctx.lineTo(-8 * s, -h * s * 0.75);
      ctx.lineTo(0, -h * s);
      ctx.lineTo(8 * s, -h * s * 0.75);
      ctx.lineTo(8 * s, 0);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(-3 * s, -h * s * 0.7, 3 * s, h * s * 0.6);
      ctx.restore();
    }
  };
  crystal(90, GROUND, 1.1);
  crystal(870, GROUND, 0.9);
  crystal(250, 430, 0.6);
  floor(ctx, "#a9dcf5", "#5a9cc4", "rgba(255,255,255,0.35)", "#e4f6ff");
}

const PAINT = { temple, rooftop, desert, cave };

export function bakeArena(id, scale) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(VIEW_W * scale));
  c.height = Math.max(1, Math.round(VIEW_H * scale));
  const ctx = c.getContext("2d");
  ctx.scale(scale, scale);
  (PAINT[id] || temple)(ctx);
  return c;
}

/** per-frame animated details on top of the baked backdrop */
export function ambient(ctx, id, time) {
  switch (id) {
    case "temple":
      for (const x of [70, 860]) {
        const fl = Math.sin(time * 13 + x) * 3 + Math.sin(time * 21 + x * 2) * 2;
        const g = ctx.createRadialGradient(x, 266, 2, x, 266, 46);
        g.addColorStop(0, "rgba(255,210,120,0.55)");
        g.addColorStop(1, "rgba(255,140,60,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 50, 216, 100, 100);
        ctx.fillStyle = "#ff8f3a";
        ctx.beginPath();
        ctx.moveTo(x - 10, 282);
        ctx.quadraticCurveTo(x - 8, 266, x + fl * 0.6, 252 + fl);
        ctx.quadraticCurveTo(x + 8, 266, x + 10, 282);
        ctx.fill();
        ctx.fillStyle = "#ffe08a";
        ctx.beginPath();
        ctx.moveTo(x - 5, 282);
        ctx.quadraticCurveTo(x, 268, x + fl * 0.3, 264 + fl * 0.5);
        ctx.quadraticCurveTo(x + 4, 270, x + 5, 282);
        ctx.fill();
      }
      // drifting petals
      ctx.fillStyle = "rgba(255,170,190,0.8)";
      for (let i = 0; i < 12; i++) {
        const x = (i * 97 + time * (30 + (i % 4) * 8)) % (VIEW_W + 40) - 20;
        const y = 80 + ((i * 53) % 300) + Math.sin(time * 1.5 + i) * 18;
        ctx.beginPath();
        ctx.ellipse(x, y, 3.5, 2, time * 2 + i, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "rooftop": {
      const on = Math.sin(time * 9) > -0.85 && Math.sin(time * 1.7) > -0.95;
      ctx.save();
      ctx.shadowColor = "#ff4fd0";
      ctx.shadowBlur = on ? 16 : 0;
      ctx.strokeStyle = on ? "#ff7ae0" : "#5a2a52";
      ctx.lineWidth = 4;
      ctx.strokeRect(572, 252, 126, 46);
      ctx.fillStyle = on ? "#ffd0f4" : "#5a2a52";
      ctx.font = "900 italic 30px 'Trebuchet MS', 'Arial Black', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("FIGHT", 635, 276);
      ctx.restore();
      ctx.fillStyle = Math.sin(time * 3) > 0.6 ? "#ff3b3b" : "#4a1010";
      ctx.beginPath();
      ctx.arc(165, 266, 4, 0, Math.PI * 2);
      ctx.fill();
      // light rain
      ctx.strokeStyle = "rgba(170,190,255,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 40; i++) {
        const x = (i * 131 + time * 90) % VIEW_W;
        const y = (i * 71 + time * 520) % GROUND;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y + 12);
      }
      ctx.stroke();
      break;
    }
    case "desert":
      ctx.fillStyle = "rgba(255,230,180,0.55)";
      for (let i = 0; i < 26; i++) {
        const x = (i * 83 + time * (60 + (i % 5) * 20)) % (VIEW_W + 20) - 10;
        const y = GROUND - 8 - ((i * 37) % 120) + Math.sin(time * 3 + i) * 4;
        ctx.fillRect(x, y, 2.4, 1.4);
      }
      break;
    case "cave": {
      ctx.fillStyle = "rgba(230,248,255,0.85)";
      for (let i = 0; i < 34; i++) {
        const x = (i * 59 + Math.sin(time * 0.8 + i) * 20 + 960) % VIEW_W;
        const y = (i * 41 + time * (22 + (i % 6) * 6)) % GROUND;
        ctx.beginPath();
        ctx.arc(x, y, 1.2 + (i % 3) * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      const pulse = 0.18 + Math.sin(time * 2) * 0.08;
      for (const [x, y] of [[90, 440], [870, 440], [250, 410]]) {
        const g = ctx.createRadialGradient(x, y, 4, x, y, 70);
        g.addColorStop(0, `rgba(120,220,255,${pulse + 0.1})`);
        g.addColorStop(1, "rgba(120,220,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 70, y - 70, 140, 140);
      }
      break;
    }
    default:
  }
}
