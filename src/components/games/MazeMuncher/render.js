/**
 * Maze Muncher canvas renderer. The maze (walls + neon edges) is cached to an
 * offscreen canvas per level / tile size; dots use a pre-rendered glow sprite,
 * so only the five actors pay for shadowBlur each frame.
 */
import { pos, EXTRA_LIFE_AT } from "./engine.js";

const HUD = 1.7; // HUD band height above the maze, in tiles
const SIDE = 3.4; // or: HUD columns beside the maze (wide stages), in tiles
const TAU = Math.PI * 2;

export function createView(canvas) {
  const ctx = canvas.getContext("2d");
  const v = { ctx, w: 0, h: 0, dpr: 1, ts: 0, ox: 0, oy: 0, maze: null, mazeKey: "", dot: null, fx: [], pops: [], shake: 0 };

  v.resize = (w, h, dpr) => {
    Object.assign(v, { w, h, dpr });
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    v.mazeKey = "";
  };

  function layout(m) {
    const top = Math.min(v.w / m.w, v.h / (m.h + HUD)), side = Math.min(v.w / (m.w + SIDE * 2), v.h / m.h);
    v.side = side > top;
    v.ts = Math.max(4, Math.max(top, side));
    v.ox = (v.w - m.w * v.ts) / 2;
    v.oy = v.side ? (v.h - m.h * v.ts) / 2 : (v.h - (m.h + HUD) * v.ts) / 2 + HUD * v.ts;
  }

  function buildMaze(g) {
    const { m, L } = g, ts = v.ts, d = v.dpr;
    const c = document.createElement("canvas");
    c.width = Math.ceil(m.w * ts * d);
    c.height = Math.ceil(m.h * ts * d);
    const x = c.getContext("2d");
    x.scale(d, d);
    const wall = (tx, ty) => tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || m.grid[ty * m.w + tx] === 1;
    // wall bodies
    x.fillStyle = `hsl(${L.hue} 60% 9%)`;
    for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) if (wall(tx, ty)) x.fillRect(tx * ts, ty * ts, ts + 0.5, ts + 0.5);
    // neon edges: one segment per wall side facing a path, joined at corners
    const inset = 0.22;
    const path = new Path2D();
    for (let ty = 0; ty < m.h; ty++)
      for (let tx = 0; tx < m.w; tx++) {
        if (!wall(tx, ty)) continue;
        for (const [nx, ny] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          if (wall(tx + nx, ty + ny)) continue;
          const [px, py] = [-ny, nx]; // tangent
          const end = (s) => {
            const side = wall(tx + px * s, ty + py * s), diag = wall(tx + px * s + nx, ty + py * s + ny);
            return !side ? 0.5 - inset : diag ? 0.5 + inset : 0.5;
          };
          const cx = tx + 0.5 + nx * (0.5 - inset), cy = ty + 0.5 + ny * (0.5 - inset);
          path.moveTo((cx - px * end(-1)) * ts, (cy - py * end(-1)) * ts);
          path.lineTo((cx + px * end(1)) * ts, (cy + py * end(1)) * ts);
        }
      }
    x.lineCap = "round";
    x.lineJoin = "round";
    x.strokeStyle = `hsl(${L.hue} 100% 55%)`;
    x.shadowColor = `hsl(${L.hue} 100% 60%)`;
    x.shadowBlur = ts * 0.6;
    x.lineWidth = Math.max(2, ts * 0.16);
    x.stroke(path);
    x.shadowBlur = 0;
    x.strokeStyle = `hsl(${L.hue} 100% 88%)`;
    x.lineWidth = Math.max(1, ts * 0.05);
    x.stroke(path);
    // enemy gate
    for (let i = 0; i < m.grid.length; i++)
      if (m.grid[i] === 2) {
        const gx = (i % m.w) * ts, gy = ((i / m.w) | 0) * ts;
        x.fillStyle = "#ff7ad9";
        x.shadowColor = "#ff7ad9";
        x.shadowBlur = ts * 0.4;
        x.fillRect(gx - ts * 0.3, gy + ts * 0.42, ts * 1.6, ts * 0.16);
        x.shadowBlur = 0;
      }
    v.maze = c;
    // dot sprite
    const s = document.createElement("canvas");
    const r = Math.ceil(ts * 0.5 * d);
    s.width = s.height = r * 2;
    const sx = s.getContext("2d");
    const grad = sx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, "#fffbe0");
    grad.addColorStop(0.18, "#ffe27a");
    grad.addColorStop(0.32, "rgba(255,200,80,.35)");
    grad.addColorStop(1, "rgba(255,180,60,0)");
    sx.fillStyle = grad;
    sx.fillRect(0, 0, r * 2, r * 2);
    v.dot = s;
  }

  /* ---------- effects fed by engine events ---------- */
  v.burst = (x, y, color, n = 10, speed = 4) => {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, s = speed * (0.4 + Math.random());
      v.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, max: 0.8, color, size: 0.06 + Math.random() * 0.08 });
    }
  };
  v.pop = (x, y, text, color = "#fff") => v.pops.push({ x, y: Math.max(0.3, y), text, color, life: 1 });

  function tick(dt) {
    for (const p of v.fx) (p.x += p.vx * dt), (p.y += p.vy * dt), (p.vx *= 0.92), (p.vy *= 0.92), (p.life -= dt);
    v.fx = v.fx.filter((p) => p.life > 0);
    for (const p of v.pops) (p.y -= dt * 0.9), (p.life -= dt * 0.8);
    v.pops = v.pops.filter((p) => p.life > 0);
    v.shake = Math.max(0, v.shake - dt * 2.5);
  }

  /* ---------- actors ---------- */
  function drawPlayer(x, y, g, t) {
    const p = g.player, ts = v.ts, r = ts * 0.42;
    let scale = 1, spin = 0;
    if (g.phase === "dying") {
      const k = 1 - g.timer / 1.5;
      scale = Math.max(0, 1 - k * 1.1);
      spin = k * 10;
    }
    if (scale <= 0) return;
    const [fx, fy] = p.face;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin + (fy ? fy * Math.PI / 2 : 0));
    if (fx < 0) ctx.scale(-1, 1);
    ctx.scale(scale, scale);
    // antennae
    const bob = Math.sin(t * 8) * r * 0.08;
    ctx.strokeStyle = "#9dfc7a";
    ctx.lineWidth = r * 0.12;
    ctx.lineCap = "round";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, -r * 0.6);
      ctx.quadraticCurveTo(-r * 0.4, -r * 1.05, -r * (0.35 - s * 0.25), -r * 1.15 + bob * s);
      ctx.stroke();
    }
    ctx.shadowColor = "#7dff9a";
    ctx.shadowBlur = ts * 0.5;
    for (const s of [-1, 1]) {
      ctx.fillStyle = "#fff36b";
      ctx.beginPath();
      ctx.arc(-r * (0.35 - s * 0.25), -r * 1.15 + bob * s, r * 0.14, 0, TAU);
      ctx.fill();
    }
    // body
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    grad.addColorStop(0, "#f2ffb0");
    grad.addColorStop(0.45, "#9cf04a");
    grad.addColorStop(1, "#14b88a");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    // mouth: a front-facing oval that opens and closes
    const open = p.moving || g.phase !== "play" ? 0.15 + Math.abs(Math.sin(p.mouth)) * 0.45 : 0.18;
    ctx.fillStyle = "#123b2a";
    ctx.beginPath();
    ctx.ellipse(r * 0.5, r * 0.22, r * 0.34, r * open, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#fff";
    if (open > 0.25) for (const s of [-1, 1]) ctx.fillRect(r * (0.42 + s * 0.12), r * (0.22 - open) + 1, r * 0.1, r * 0.14);
    // eye
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(r * 0.28, -r * 0.3, r * 0.2, r * 0.24, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#0b1f33";
    ctx.beginPath();
    ctx.arc(r * 0.35, -r * 0.28, r * 0.1, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(e, x, y, g, t) {
    const ts = v.ts, r = ts * 0.4;
    const fright = e.mode === "fright";
    const flash = fright && g.fright < 2 && Math.floor(t * 6) % 2 === 0;
    const col = fright ? (flash ? "#e8f0ff" : "#2f5bff") : e.def.color;
    ctx.save();
    ctx.translate(x, y + (e.mode === "home" ? Math.sin(e.bob) * ts * 0.12 : 0));
    if (e.mode !== "eyes") {
      // spiky urchin body
      ctx.shadowColor = col;
      ctx.shadowBlur = ts * 0.55;
      ctx.fillStyle = col;
      ctx.beginPath();
      const spikes = 9, rot = t * (fright ? 1 : 2.2) + e.i;
      for (let k = 0; k <= spikes * 2; k++) {
        const a = rot + (k / (spikes * 2)) * TAU;
        const rr = k % 2 ? r * 0.78 : r * (1.02 + Math.sin(t * 9 + k) * 0.05);
        ctx[k ? "lineTo" : "moveTo"](Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      const shine = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r * 0.8);
      shine.addColorStop(0, "rgba(255,255,255,.55)");
      shine.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = shine;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.78, 0, TAU);
      ctx.fill();
    }
    if (fright) {
      // dizzy face: two small eyes + wavy mouth
      ctx.fillStyle = flash ? "#ff3b5c" : "#fff";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(s * r * 0.28, -r * 0.15, r * 0.11, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = r * 0.09;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) ctx[k ? "lineTo" : "moveTo"](-r * 0.42 + k * r * 0.14, r * 0.3 + (k % 2 ? -1 : 1) * r * 0.08);
      ctx.stroke();
    } else {
      // one big eye looking where it goes
      const [dx, dy] = e.dir || [0, 0];
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, -r * 0.05, r * 0.42, 0, TAU);
      ctx.fill();
      ctx.fillStyle = e.mode === "eyes" ? e.def.color : "#121a33";
      ctx.beginPath();
      ctx.arc(dx * r * 0.18, -r * 0.05 + dy * r * 0.18, r * 0.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(dx * r * 0.18 - r * 0.07, -r * 0.12 + dy * r * 0.18, r * 0.06, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGem(x, y, t, hue, life) {
    if (life < 2 && Math.floor(t * 8) % 2) return;
    const s = v.ts * 0.42;
    ctx.save();
    ctx.translate(x, y + Math.sin(t * 3) * v.ts * 0.06);
    ctx.scale(Math.cos(t * 2.4), 1);
    ctx.shadowColor = `hsl(${hue} 100% 65%)`;
    ctx.shadowBlur = v.ts * 0.7;
    ctx.fillStyle = `hsl(${hue} 100% 62%)`;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.8, -s * 0.25);
    ctx.lineTo(0, s);
    ctx.lineTo(-s * 0.8, -s * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.3, -s * 0.25);
    ctx.lineTo(0, s * 0.2);
    ctx.lineTo(-s * 0.3, -s * 0.25);
    ctx.fill();
    ctx.restore();
  }

  /** Draw a frame. `high` is the best score so far; `dt` advances effects. */
  v.draw = (g, { high = 0, dt = 0, t = 0 } = {}) => {
    const { m } = g;
    layout(m);
    const key = `${g.level}:${v.ts}:${v.dpr}`;
    if (key !== v.mazeKey) (buildMaze(g), (v.mazeKey = key));
    tick(dt);
    const ts = v.ts;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.clearRect(0, 0, v.w, v.h);
    const sx = v.shake ? (Math.random() - 0.5) * v.shake * ts * 0.4 : 0;
    ctx.save();
    ctx.translate(v.ox + sx, v.oy);
    // maze (flashes when cleared)
    const flash = g.phase === "clear" && Math.floor(t * 8) % 2 === 0;
    ctx.globalAlpha = 1;
    if (flash) ctx.filter = "brightness(2.2) saturate(0.3)";
    ctx.drawImage(v.maze, 0, 0, m.w * ts, m.h * ts);
    ctx.filter = "none";
    ctx.beginPath();
    ctx.rect(0, 0, m.w * ts, m.h * ts);
    ctx.clip();
    // dots + orbs
    const ds = ts;
    for (let i = 0; i < m.dots.length; i++) {
      const d = m.dots[i];
      if (!d) continue;
      const cx = ((i % m.w) + 0.5) * ts, cy = (((i / m.w) | 0) + 0.5) * ts;
      if (d === 1) ctx.drawImage(v.dot, cx - ds * 0.5, cy - ds * 0.5, ds, ds);
      else {
        const pulse = 0.85 + Math.sin(t * 6) * 0.15;
        ctx.shadowColor = "#7af7ff";
        ctx.shadowBlur = ts * 0.8;
        ctx.fillStyle = "#c9fbff";
        ctx.beginPath();
        ctx.arc(cx, cy, ts * 0.26 * pulse, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(122,247,255,${0.6 - (t % 1) * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, ts * (0.28 + (t % 1) * 0.3), 0, TAU);
        ctx.stroke();
      }
    }
    if (g.bonus) drawGem((g.bonus.x + 0.5) * ts, (g.bonus.y + 0.5) * ts, t, g.L.hue + 160, g.bonus.t);
    // actors (drawn twice near a wrap tunnel)
    const at = (e, fn) => {
      const p = pos(e);
      for (const wx of [0, -m.w, m.w]) {
        const x = (p.x + wx + 0.5) * ts;
        if (x > -ts && x < (m.w + 1) * ts) fn(x, (p.y + 0.5) * ts);
      }
    };
    if (g.phase !== "clear" && g.phase !== "cleared") for (const e of g.enemies) if (g.phase !== "dying" || g.timer > 1.1) at(e, (x, y) => drawEnemy(e, x, y, g, t));
    if (g.phase !== "over") at(g.player, (x, y) => drawPlayer(x, y, g, t));
    // particles + popups
    for (const p of v.fx) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect((p.x + 0.5) * ts - (p.size * ts) / 2, (p.y + 0.5) * ts - (p.size * ts) / 2, p.size * ts, p.size * ts);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of v.pops) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.font = `900 ${ts * 0.62}px Nunito, system-ui, sans-serif`;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = ts * 0.3;
      const half = ctx.measureText(p.text).width / 2 / ts;
      ctx.fillText(p.text, (Math.min(m.w - half, Math.max(half, p.x + 0.5))) * ts, (p.y + 0.5) * ts);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    if (g.phase === "ready") {
      ctx.font = `900 ${ts * 0.9}px Nunito, system-ui, sans-serif`;
      ctx.fillStyle = "#fff36b";
      ctx.shadowColor = "#ffb800";
      ctx.shadowBlur = ts * 0.5;
      ctx.fillText(g.timer > 0.9 ? `LEVEL ${g.level + 1}` : "READY!", (m.door.x + 0.5) * ts, (m.door.y + 4.5) * ts);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    drawHud(g, high, t);
  };

  function drawHud(g, high, t) {
    const ts = v.ts, m = g.m;
    const small = Math.max(9, ts * 0.42), big = Math.max(13, ts * 0.66);
    const col = v.side ? v.ox - ts * 0.9 : undefined; // side-column width: text shrinks to fit
    const stat = (label, value, x, y, align, color = "#fff", labelColor = "rgba(200,220,255,.7)") => {
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.font = `800 ${small}px Nunito, system-ui, sans-serif`;
      ctx.fillStyle = labelColor;
      ctx.fillText(label, x, y, col);
      if (value == null) return;
      ctx.font = `900 ${big}px Nunito, system-ui, sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(value, x, y + (small + big) * 0.62, col);
    };
    const lives = (x, y, align) => {
      const n = Math.min(g.lives, 6);
      const r = Math.min(Math.max(5, ts * 0.28), col ? col / (n * 3) : Infinity), gap = r * 3;
      for (let k = 0; k < n; k++) {
        const cx = align === "right" ? x - r - k * gap : x + r + k * gap;
        ctx.fillStyle = "#9cf04a";
        ctx.beginPath();
        ctx.arc(cx, y, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#123b2a";
        ctx.beginPath();
        ctx.ellipse(cx + r * 0.35, y + r * 0.2, r * 0.4, r * 0.25, 0, 0, TAU);
        ctx.fill();
      }
    };
    const combo = g.combo >= 5 && t - g.lastDot < 0.5 ? `COMBO ×${g.combo}` : !g.extra && g.score > EXTRA_LIFE_AT * 0.8 ? "1UP SOON" : "";
    const levelColor = `hsl(${g.L.hue} 100% 70%)`;
    if (v.side) {
      // columns beside the maze
      const lx = v.ox - ts * 0.6, rx = v.ox + m.w * ts + ts * 0.6, y0 = v.oy + ts * 0.6;
      const step = (small + big) * 1.9;
      stat("SCORE", String(g.score), lx, y0, "right");
      stat("HIGH", String(Math.max(high, g.score)), lx, y0 + step, "right", "#ffd95a");
      if (combo) stat(combo, null, lx, y0 + step * 2.1, "right", null, "#7af7ff");
      const ry = v.oy + m.h * ts - ts * 0.6 - step * 1.2;
      stat("LEVEL", `${g.level + 1}/10`, rx, ry, "left", levelColor);
      stat("LIVES", null, rx, ry + step * 0.8, "left");
      lives(rx, ry + step * 0.8 + (small + big) * 0.62, "left");
      return;
    }
    const y = v.oy - HUD * ts * 0.62, left = v.ox + ts * 0.2, right = v.ox + m.w * ts - ts * 0.2;
    stat("SCORE", String(g.score), left, y, "left");
    stat("HIGH", String(Math.max(high, g.score)), left + Math.max(ts * 5, big * 4.5), y, "left", "#ffd95a");
    stat(`LEVEL ${g.level + 1}/10`, combo || null, (left + right) / 2, y, "center", "#7af7ff", levelColor);
    stat("LIVES", null, right, y, "right");
    lives(right, y + (small + big) * 0.62, "right");
  }

  return v;
}
