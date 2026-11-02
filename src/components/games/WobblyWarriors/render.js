/**
 * Wobbly Warriors drawing — arenas, the two blob fighters, fx and the HUD.
 * Everything is plain Canvas 2D shapes in 960x540 world units.
 */
import { W, H, FLOOR, WALL_L, WALL_R, PUNCH_DUR, WINS_NEEDED, TUNING, countdownNumber } from "./engine.js";

const INK = "#2b2140";
const TAU = Math.PI * 2;

// ------------------------------------------------------------ arenas ----

function cloud(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.arc(x + r * 0.9, y + r * 0.2, r * 0.75, 0, TAU);
  ctx.arc(x - r * 0.9, y + r * 0.25, r * 0.7, 0, TAU);
  ctx.fill();
}

function drawBackyard(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, FLOOR);
  g.addColorStop(0, "#6cc7ff");
  g.addColorStop(1, "#c9f0ff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffe066";
  ctx.beginPath();
  ctx.arc(800, 90, 46, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (let k = 0; k < 4; k++) cloud(ctx, ((k * 290 + t * (12 + k * 4)) % (W + 240)) - 120, 70 + k * 38, 26 + k * 4);
  ctx.fillStyle = "#7fd36b";
  ctx.beginPath();
  ctx.ellipse(180, FLOOR + 20, 300, 130, 0, Math.PI, TAU);
  ctx.ellipse(720, FLOOR + 30, 360, 150, 0, Math.PI, TAU);
  ctx.fill();
  // picket fence
  ctx.fillStyle = "#fff4e0";
  ctx.strokeStyle = "#c9a77a";
  ctx.lineWidth = 2;
  ctx.fillRect(0, FLOOR - 92, W, 10);
  ctx.fillRect(0, FLOOR - 52, W, 10);
  for (let x = 6; x < W; x += 34) {
    ctx.beginPath();
    ctx.moveTo(x, FLOOR);
    ctx.lineTo(x, FLOOR - 104);
    ctx.lineTo(x + 11, FLOOR - 116);
    ctx.lineTo(x + 22, FLOOR - 104);
    ctx.lineTo(x + 22, FLOOR);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = "#5bbd4a";
  ctx.fillRect(0, FLOOR, W, H - FLOOR);
  ctx.fillStyle = "#4aa83b";
  for (let x = 0; x < W; x += 24) ctx.fillRect(x, FLOOR, 12, H - FLOOR);
  ctx.fillStyle = "#6fd25c";
  ctx.fillRect(0, FLOOR, W, 6);
  // corner posts mark the walls
  for (const x of [WALL_L, WALL_R]) post(ctx, x, "#b5793f", "#ffd23f");
}

function drawCandy(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, FLOOR);
  g.addColorStop(0, "#3a1258");
  g.addColorStop(1, "#a43c8a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // spotlights
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let k = 0; k < 3; k++) {
    const sx = 200 + k * 280 + Math.sin(t * 0.7 + k * 2) * 80;
    const gr = ctx.createLinearGradient(0, 0, 0, FLOOR);
    gr.addColorStop(0, "rgba(255,220,255,0.35)");
    gr.addColorStop(1, "rgba(255,220,255,0)");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(sx - 20, 0);
    ctx.lineTo(sx + 20, 0);
    ctx.lineTo(sx + 130, FLOOR);
    ctx.lineTo(sx - 130, FLOOR);
    ctx.fill();
  }
  ctx.restore();
  // bobbing crowd
  const cols = ["#ff9ad5", "#ffd36b", "#8fe3ff", "#b8ff8a", "#ffb07a"];
  for (let row = 0; row < 2; row++) {
    for (let k = 0; k < 26; k++) {
      const x = k * 38 + (row ? 19 : 0);
      const y = FLOOR - 150 + row * 34 + Math.abs(Math.sin(t * 4 + k * 1.7 + row)) * -8;
      ctx.fillStyle = row ? "#2a0d40" : "#45185f";
      ctx.beginPath();
      ctx.arc(x, y + 30, 22, Math.PI, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, TAU);
      ctx.fill();
      if ((k + row) % 4 === 0) {
        ctx.fillStyle = cols[(k + row) % cols.length];
        ctx.fillRect(x - 4, y - 34, 8, 18);
      }
    }
  }
  // ring apron + mat
  ctx.fillStyle = "#ff5fa8";
  ctx.fillRect(0, FLOOR, W, H - FLOOR);
  ctx.fillStyle = "#ff8cc4";
  ctx.fillRect(0, FLOOR, W, 10);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let x = 0; x < W; x += 60) ctx.fillRect(x, FLOOR + 22, 30, 6);
  // ropes
  for (const [y, c] of [[FLOOR - 40, "#fff"], [FLOOR - 80, "#7ff0ff"], [FLOOR - 120, "#fff"]]) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(WALL_L, y);
    ctx.quadraticCurveTo(W / 2, y + 6, WALL_R, y);
    ctx.stroke();
  }
  for (const x of [WALL_L, WALL_R]) post(ctx, x, "#ffffff", "#ff3d8b");
}

function drawDock(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, FLOOR);
  g.addColorStop(0, "#0b1440");
  g.addColorStop(1, "#2b4a8a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 50; k++) {
    const x = (k * 197) % W;
    const y = (k * 89) % 260;
    ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + k));
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#fff6c8";
  ctx.beginPath();
  ctx.arc(170, 110, 50, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#e9dca0";
  ctx.beginPath();
  ctx.arc(185, 100, 9, 0, TAU);
  ctx.arc(155, 125, 6, 0, TAU);
  ctx.fill();
  // far shore
  ctx.fillStyle = "#101a3d";
  ctx.beginPath();
  ctx.moveTo(0, FLOOR - 70);
  for (let x = 0; x <= W; x += 60) ctx.lineTo(x, FLOOR - 70 - ((x * 37) % 50));
  ctx.lineTo(W, FLOOR - 40);
  ctx.lineTo(0, FLOOR - 40);
  ctx.fill();
  // water
  ctx.fillStyle = "#1d3a78";
  ctx.fillRect(0, FLOOR - 42, W, 50);
  ctx.strokeStyle = "rgba(160,200,255,0.5)";
  ctx.lineWidth = 2;
  for (let row = 0; row < 3; row++) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 10) {
      const y = FLOOR - 32 + row * 12 + Math.sin(x * 0.03 + t * 2 + row) * 3;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // moon reflection
  ctx.fillStyle = "rgba(255,246,200,0.35)";
  for (let k = 0; k < 4; k++) ctx.fillRect(140 + Math.sin(t * 2 + k) * 8, FLOOR - 36 + k * 9, 60 - k * 10, 3);
  // planks
  ctx.fillStyle = "#8a5a32";
  ctx.fillRect(0, FLOOR, W, H - FLOOR);
  ctx.strokeStyle = "#5e3b1f";
  ctx.lineWidth = 3;
  for (let x = 0; x < W; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, FLOOR);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.fillStyle = "#a8703f";
  ctx.fillRect(0, FLOOR, W, 7);
  // lantern posts
  for (const x of [WALL_L, WALL_R]) {
    post(ctx, x, "#6b4423", "#ffcf5a");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const gr = ctx.createRadialGradient(x, FLOOR - 150, 4, x, FLOOR - 150, 90);
    gr.addColorStop(0, `rgba(255,200,90,${0.45 + Math.sin(t * 5 + x) * 0.05})`);
    gr.addColorStop(1, "rgba(255,200,90,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(x - 90, FLOOR - 240, 180, 180);
    ctx.restore();
  }
}

function post(ctx, x, wood, cap) {
  ctx.fillStyle = wood;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.fillRect(x - 9, FLOOR - 140, 18, 140);
  ctx.strokeRect(x - 9, FLOOR - 140, 18, 140);
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.arc(x, FLOOR - 146, 13, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

const ARENA_DRAW = [drawBackyard, drawCandy, drawDock];

// ----------------------------------------------------------- fighter ----

function limb(ctx, x1, y1, x2, y2, color, w) {
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = w + 6;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

function blob(ctx, x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

/** 0..1 how far the punching arm is extended. */
function punchExt(f) {
  if (f.punchT < 0) return 0;
  const [a, b] = TUNING.PUNCH_ACTIVE;
  if (f.punchT < a) return f.punchT / a;
  if (f.punchT < b) return 1;
  return Math.max(0, 1 - (f.punchT - b) / (PUNCH_DUR - b));
}

function drawFighter(ctx, f, t) {
  // ground shadow (not tilted)
  const air = Math.min(1, (FLOOR - f.y) / 200);
  ctx.fillStyle = `rgba(0,0,0,${0.25 - air * 0.12})`;
  ctx.beginPath();
  ctx.ellipse(f.x, FLOOR + 4, 34 * (1 - air * 0.4), 8, 0, 0, TAU);
  ctx.fill();

  ctx.save();
  // pivot is the feet, so lift the body as it tips over or it sinks into the floor
  ctx.translate(f.x, f.y - Math.abs(Math.sin(f.tilt)) * 30);
  ctx.rotate(f.tilt);
  ctx.scale(1 + f.squash * 0.6, 1 - f.squash);
  ctx.scale(f.facing, 1);

  const sw = f.onGround ? Math.sin(f.walk) * 12 : 6;
  const ext = punchExt(f);
  const bob = f.onGround && !f.ko ? Math.abs(Math.sin(f.walk)) * -3 : 0;

  // legs
  limb(ctx, -9, -40, -9 + sw, f.onGround ? -2 : -12, f.dark, 11);
  limb(ctx, 9, -40, 9 - sw, f.onGround ? -2 : -8, f.dark, 11);
  blob(ctx, -9 + sw + 4, f.onGround ? -2 : -12, 7, INK);
  blob(ctx, 9 - sw + 4, f.onGround ? -2 : -8, 7, INK);

  ctx.translate(0, bob);
  // back arm (idle swing)
  const swing = Math.sin(t * 4 + f.i) * 4 + (f.ko ? 20 : 0);
  limb(ctx, -12, -76, -28, -52 + swing, f.dark, 10);
  blob(ctx, -28, -52 + swing, 10, "#f4f4f4");

  // torso
  ctx.fillStyle = f.body;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(0, -66, 29, 32, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = f.belly;
  ctx.beginPath();
  ctx.ellipse(5, -60, 16, 19, 0, 0, TAU);
  ctx.fill();

  // head wobbles a little against the body tilt
  ctx.save();
  ctx.translate(0, -100);
  ctx.rotate(-f.tilt * 0.6 + Math.sin(t * 6 + f.i * 3) * 0.04);
  blob(ctx, 0, 0, 23, f.body);
  // headband
  ctx.fillStyle = f.band;
  ctx.fillRect(-23, -14, 46, 8);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(-23, -14, 46, 8);
  limb(ctx, -22, -10, -36, -4 + Math.sin(t * 9 + f.i) * 4, f.band, 4);
  // face
  if (f.ko) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    for (const ex of [3, 15]) {
      ctx.beginPath();
      ctx.moveTo(ex - 4, -4);
      ctx.lineTo(ex + 4, 4);
      ctx.moveTo(ex + 4, -4);
      ctx.lineTo(ex - 4, 4);
      ctx.stroke();
    }
    // dizzy stars
    for (let k = 0; k < 3; k++) {
      const a = t * 5 + (k * TAU) / 3;
      ctx.fillStyle = "#ffe14d";
      star(ctx, Math.cos(a) * 26, -30 + Math.sin(a) * 7, 6);
    }
  } else {
    for (const ex of [3, 16]) {
      blob(ctx, ex, -1, 7, "#fff");
      // googly pupils jiggle with the wobble
      const px = ex + 2 + Math.sin(t * 7 + ex) * 1.2 + f.tiltV * 0.3;
      const py = Math.cos(t * 5 + ex) * 1.2 + f.vy * 0.003;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(Math.max(ex - 3, Math.min(ex + 4, px)), Math.max(-5, Math.min(4, py)), 3.2, 0, TAU);
      ctx.fill();
    }
  }
  ctx.fillStyle = INK;
  ctx.beginPath();
  if (f.stun > 0 || f.ko) ctx.ellipse(11, 12, 4, 5, 0, 0, TAU);
  else ctx.arc(11, 9, 6, 0.1, Math.PI - 0.1);
  ctx.fill();
  ctx.restore();

  // front (punching) arm — reach matches engine REACH
  const hx = 22 + ext * 58;
  const hy = -74 + (1 - ext) * 20;
  limb(ctx, 10, -76, hx, hy, f.dark, 11);
  blob(ctx, hx, hy, ext > 0.9 ? 13 : 11, "#ffffff");
  if (ext > 0.9) {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 3;
    for (const dy of [-8, 0, 8]) {
      ctx.beginPath();
      ctx.moveTo(hx - 24, hy + dy);
      ctx.lineTo(hx - 40, hy + dy);
      ctx.stroke();
    }
  }

  // hit flash
  if (f.flash > 0) {
    ctx.globalAlpha = Math.min(1, f.flash / 0.14) * 0.7;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(0, -66, 31, 34, 0, 0, TAU);
    ctx.arc(0, -100, 25, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k * Math.PI) / 5 - Math.PI / 2;
    const rr = k % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

// --------------------------------------------------------------- HUD ----

function text(ctx, str, x, y, size, fill, align = "center", stroke = INK) {
  ctx.font = `900 ${size}px "Nunito", "Segoe UI Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, size * 0.16);
  ctx.strokeStyle = stroke;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
}

function healthBar(ctx, f, x, flip) {
  const w = 330;
  const h = 24;
  const y = 30;
  ctx.fillStyle = INK;
  roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 10);
  ctx.fill();
  ctx.fillStyle = "#4b3a66";
  roundRect(ctx, x, y, w, h, 7);
  ctx.fill();
  const drawPart = (frac, color) => {
    const pw = Math.max(0, Math.min(1, frac)) * w;
    if (pw <= 0) return;
    ctx.fillStyle = color;
    roundRect(ctx, flip ? x + w - pw : x, y, pw, h, 7);
    ctx.fill();
  };
  drawPart(f.shownHp / 100, "#ffffff");
  const hp = f.hp / 100;
  drawPart(hp, hp > 0.5 ? "#58e06a" : hp > 0.25 ? "#ffd23f" : "#ff4d4d");
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(x + 6, y + 4, w - 12, 4);
  return { y, w, h };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

function drawHud(ctx, s, names) {
  const [a, b] = s.fighters;
  healthBar(ctx, a, 40, false);
  healthBar(ctx, b, W - 40 - 330, true);
  text(ctx, names[0], 44, 76, 22, a.body, "left");
  text(ctx, names[1], W - 44, 76, 22, b.body, "right");
  // round win pips
  for (let k = 0; k < WINS_NEEDED; k++) {
    for (const [f, x] of [[a, 362 - k * 24], [b, W - 362 + k * 24]]) {
      ctx.fillStyle = k < f.wins ? "#ffd23f" : "rgba(255,255,255,0.3)";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, 78, 8, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }
  // timer
  ctx.fillStyle = INK;
  roundRect(ctx, W / 2 - 40, 18, 80, 56, 14);
  ctx.fill();
  const secs = Math.ceil(s.timer);
  text(ctx, String(secs), W / 2, 44, 34, secs <= 10 && s.phase === "fight" ? "#ff6b6b" : "#fff");
  text(ctx, `ROUND ${s.round}`, W / 2, 92, 16, "#fff");
}

function drawBanner(ctx, s, names) {
  const t = s.phaseT;
  if (s.phase === "countdown") {
    const n = countdownNumber(s);
    if (!n) text(ctx, `ROUND ${s.round}`, W / 2, H * 0.38, 64, "#fff");
    else text(ctx, String(n), W / 2, H * 0.4, 110 * (1 + 0.3 * Math.abs(Math.sin(t * 7.8))), "#ffd23f");
  } else if (s.phase === "fight" && t < 0.7) {
    text(ctx, "FIGHT!", W / 2, H * 0.4, 100 * (1 + Math.max(0, 0.25 - t)), "#ff6b3d");
  } else if (s.phase === "ko" || (s.phase === "paused" && s.pausedFrom === "ko")) {
    const sc = 1 + Math.max(0, 0.3 - t) * 2;
    text(ctx, "K.O.!", W / 2, H * 0.38, 120 * sc, "#ff4d4d");
  } else if (s.phase === "roundOver" || (s.phase === "paused" && s.pausedFrom === "roundOver")) {
    const w = s.roundWinner;
    text(ctx, w < 0 ? "DRAW!" : `${names[w].toUpperCase()} WINS THE ROUND!`, W / 2, H * 0.36, 48, w < 0 ? "#fff" : s.fighters[w].body);
    text(ctx, `${s.fighters[0].wins} - ${s.fighters[1].wins}`, W / 2, H * 0.36 + 60, 44, "#fff");
  }
}

function drawFx(ctx, s) {
  for (const p of s.fx) {
    const k = p.life / p.max;
    ctx.globalAlpha = Math.min(1, k * 2);
    if (p.kind === "dot") {
      ctx.fillStyle = p.color;
      star(ctx, p.x, p.y, p.r * (0.5 + k));
    } else {
      text(ctx, p.text, p.x, p.y, 30 + (1 - k) * 10, p.color);
    }
  }
  ctx.globalAlpha = 1;
}

/** Draw a full frame in world units (the caller sets up the transform). */
export function draw(ctx, s, names) {
  ctx.save();
  if (s.shake > 0) {
    const m = s.shake * 30;
    ctx.translate(Math.sin(s.time * 91) * m, Math.cos(s.time * 77) * m);
  }
  ARENA_DRAW[s.arena]?.(ctx, s.time);
  // the one being hit is drawn on top so the punch reads clearly
  const [a, b] = s.fighters;
  const order = b.flash > 0 || b.ko ? [a, b] : [b, a];
  for (const f of order) drawFighter(ctx, f, s.time);
  drawFx(ctx, s);
  ctx.restore();
  drawHud(ctx, s, names);
  drawBanner(ctx, s, names);
}

/** Just the arena, behind the menus. */
export function drawArenaPreview(ctx, arena, t = 2) {
  ARENA_DRAW[arena]?.(ctx, t);
}
