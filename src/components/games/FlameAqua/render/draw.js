/**
 * Canvas renderer. Static stone is baked once per level into an offscreen
 * canvas; everything that moves (liquids, mechanisms, heroes, particles) is
 * drawn each frame with plain 2D paths — no images, no filters.
 */
import { T, COLS, ROWS, VIEW_W, VIEW_H, TILE, chOn, mirrorOrient } from "../engine/sim.js";

export const THEMES = [
  { // Forest
    sky: ["#16301f", "#0d1f16"], back: "#21402b", backLine: "#2b5236",
    stone: "#5d6b4a", stoneHi: "#7d8c62", stoneLo: "#3d4731", edge: "#8fca5a", edgeLo: "#4f8a33", glow: "rgba(150,230,120,0.07)",
  },
  { // Crystal
    sky: ["#14223d", "#0b1428"], back: "#1d3152", backLine: "#29426b",
    stone: "#4f5f80", stoneHi: "#7083ab", stoneLo: "#343f59", edge: "#9fe6ff", edgeLo: "#4aa3d0", glow: "rgba(140,220,255,0.08)",
  },
  { // Shadow
    sky: ["#1b1430", "#0d0a1b"], back: "#261c3f", backLine: "#33264f",
    stone: "#4a4060", stoneHi: "#665a82", stoneLo: "#2f2840", edge: "#b48cff", edgeLo: "#6e4fb0", glow: "rgba(180,140,255,0.07)",
  },
  { // Light
    sky: ["#3a2a17", "#1f160c"], back: "#4a3820", backLine: "#5d4828",
    stone: "#8a7552", stoneHi: "#b59c6c", stoneLo: "#5f4f36", edge: "#ffe08a", edgeLo: "#c99a3a", glow: "rgba(255,220,130,0.08)",
  },
];

export const CH_COLORS = { a: "#ffd23f", b: "#c77dff", c: "#3ee0c5", d: "#ff7aa8", e: "#f4f4f4", f: "#ff9f43" };
const chColor = (spec) => CH_COLORS[(spec || "a").split("+")[0]] || "#ffd23f";

const LIQ = {
  [TILE.FIRE]: { top: "#ffd25a", mid: "#ff7a1a", bot: "#d43a12", glow: "rgba(255,120,30,0.35)" },
  [TILE.WATER]: { top: "#bdf3ff", mid: "#38b6ff", bot: "#1a5fd1", glow: "rgba(60,170,255,0.3)" },
  [TILE.TOXIC]: { top: "#d9ff7a", mid: "#6fdc2a", bot: "#2f8f1c", glow: "rgba(120,230,60,0.3)" },
};

function rand(seed) {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10000) / 10000;
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ------------------------------------------------------------ static layer */

export function bakeStatic(s, world, scale) {
  const th = THEMES[world] || THEMES[0];
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");
  c.width = Math.max(1, Math.round(VIEW_W * scale));
  c.height = Math.max(1, Math.round(VIEW_H * scale));
  const ctx = c.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const R = rand(s.id * 7919 + 13);

  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, th.sky[0]);
  g.addColorStop(1, th.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // back wall: large faint bricks + world motif
  ctx.strokeStyle = th.backLine;
  ctx.lineWidth = 1.5;
  for (let y = 0; y < VIEW_H; y += 45) {
    const off = (y / 45) % 2 ? 45 : 0;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    ctx.stroke();
    for (let x = off; x < VIEW_W; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 45);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 14; i++) {
    const x = R() * VIEW_W;
    const y = R() * VIEW_H;
    ctx.fillStyle = th.back;
    if (world === 0) {
      // hanging leaves
      ctx.beginPath();
      ctx.ellipse(x, y, 18 + R() * 20, 6 + R() * 6, R() * 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (world === 1) {
      ctx.beginPath();
      ctx.moveTo(x, y - 30);
      ctx.lineTo(x + 12, y);
      ctx.lineTo(x, y + 30);
      ctx.lineTo(x - 12, y);
      ctx.closePath();
      ctx.fill();
    } else if (world === 2) {
      ctx.beginPath();
      ctx.arc(x, y, 14 + R() * 18, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(R());
      ctx.fillRect(-3, -26, 6, 52);
      ctx.fillRect(-26, -3, 52, 6);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  const glow = ctx.createRadialGradient(VIEW_W / 2, VIEW_H * 0.3, 40, VIEW_W / 2, VIEW_H * 0.3, VIEW_W * 0.7);
  glow.addColorStop(0, th.glow);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // stone blocks
  const solid = (x, y) => x < 0 || y < 0 || x >= COLS || y >= ROWS || s.tiles[y * COLS + x] !== TILE.EMPTY;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const t = s.tiles[y * COLS + x];
      if (t === TILE.EMPTY) continue;
      const px = x * T;
      const py = y * T;
      ctx.fillStyle = th.stone;
      ctx.fillRect(px, py, T, T);
      // brick seams, offset per row
      ctx.fillStyle = th.stoneLo;
      ctx.fillRect(px, py + T - 2, T, 2);
      const seam = (y % 2 ? 0 : 15) + (x % 2 ? 0 : 0);
      if ((x + y) % 2 === 0) ctx.fillRect(px + seam, py, 2, T);
      ctx.fillStyle = th.stoneHi;
      if (!solid(x, y - 1)) ctx.fillRect(px, py, T, 3);
      if (!solid(x - 1, y)) ctx.fillRect(px, py, 2, T);
      ctx.fillStyle = th.stoneLo;
      if (!solid(x + 1, y)) ctx.fillRect(px + T - 3, py, 3, T);
      if (!solid(x, y + 1)) ctx.fillRect(px, py + T - 4, T, 4);
      if (R() < 0.18) {
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(px + 4 + R() * 16, py + 6 + R() * 14, 5, 3);
      }
      // world trim on exposed top edges
      if (!solid(x, y - 1) && t === TILE.SOLID) {
        ctx.fillStyle = th.edge;
        if (world === 0) {
          ctx.fillRect(px, py - 2, T, 5);
          ctx.fillStyle = th.edgeLo;
          for (let k = 0; k < 3; k++) {
            const gx = px + 3 + R() * 24;
            ctx.beginPath();
            ctx.moveTo(gx, py);
            ctx.lineTo(gx + 2, py - 5 - R() * 4);
            ctx.lineTo(gx + 4, py);
            ctx.fill();
          }
        } else if (world === 1) {
          ctx.fillRect(px, py, T, 2);
          if (R() < 0.3) {
            ctx.fillStyle = th.edge;
            const gx = px + 6 + R() * 18;
            ctx.beginPath();
            ctx.moveTo(gx - 4, py);
            ctx.lineTo(gx, py - 9 - R() * 6);
            ctx.lineTo(gx + 4, py);
            ctx.fill();
          }
        } else {
          ctx.globalAlpha = 0.7;
          ctx.fillRect(px, py, T, 2);
          ctx.globalAlpha = 1;
        }
      }
      // vines hanging from ceilings in the forest
      if (world === 0 && !solid(x, y + 1) && t === TILE.SOLID && R() < 0.22) {
        ctx.strokeStyle = th.edgeLo;
        ctx.lineWidth = 2;
        const len = 10 + R() * 26;
        ctx.beginPath();
        ctx.moveTo(px + 15, py + T);
        ctx.quadraticCurveTo(px + 8 + R() * 14, py + T + len / 2, px + 15, py + T + len);
        ctx.stroke();
      }
    }
  return c;
}

/* ------------------------------------------------------------ dynamic layer */

function drawLiquids(ctx, s, t) {
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const k = s.tiles[y * COLS + x];
      const L = LIQ[k];
      if (!L) continue;
      const px = x * T;
      const py = y * T;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(px, py, T, T);
      const g = ctx.createLinearGradient(0, py, 0, py + T);
      g.addColorStop(0, L.mid);
      g.addColorStop(1, L.bot);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(px, py + T);
      for (let i = 0; i <= 6; i++) {
        const wx = px + (i / 6) * T;
        ctx.lineTo(wx, py + 3 + Math.sin(t * 3 + (wx / T) * 2.2 + k) * 2);
      }
      ctx.lineTo(px + T, py + T);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = L.top;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const wx = px + (i / 6) * T;
        const wy = py + 3 + Math.sin(t * 3 + (wx / T) * 2.2 + k) * 2;
        if (i) ctx.lineTo(wx, wy);
        else ctx.moveTo(wx, wy);
      }
      ctx.stroke();
      // glow + bubbles
      ctx.fillStyle = L.glow;
      ctx.fillRect(px, py - 8, T, 8);
      const bub = (t * 0.7 + x * 0.37) % 1;
      ctx.fillStyle = L.top;
      ctx.globalAlpha = 1 - bub;
      ctx.beginPath();
      ctx.arc(px + 8 + ((x * 13) % 14), py + T - 4 - bub * 20, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
}

function drawExit(ctx, e, t, won) {
  const fire = e.el === "fire";
  const x = e.x;
  const y = e.floor - 46;
  const col = fire ? "#ff6a3d" : "#3aa8ff";
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(ctx, x - 3, y - 3, T + 6, 49, 14);
  ctx.fill();
  ctx.fillStyle = fire ? "#5a1f12" : "#11335a";
  roundRect(ctx, x, y, T, 46, 12);
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = 3;
  roundRect(ctx, x + 1.5, y + 1.5, T - 3, 44, 11);
  ctx.stroke();
  // inner light when the right hero stands in it
  const glow = e.active ? 0.75 + Math.sin(t * 8) * 0.15 : 0.18;
  const gr = ctx.createLinearGradient(0, y, 0, y + 46);
  gr.addColorStop(0, `rgba(${fire ? "255,170,90" : "120,210,255"},${glow})`);
  gr.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gr;
  roundRect(ctx, x + 4, y + 4, T - 8, 40, 9);
  ctx.fill();
  // symbol
  ctx.save();
  ctx.translate(x + T / 2, y + 16);
  ctx.fillStyle = col;
  ctx.beginPath();
  if (fire) {
    ctx.moveTo(0, -8);
    ctx.quadraticCurveTo(7, 0, 4, 6);
    ctx.quadraticCurveTo(0, 9, -4, 6);
    ctx.quadraticCurveTo(-7, 0, 0, -8);
  } else {
    ctx.moveTo(0, -8);
    ctx.quadraticCurveTo(7, 2, 0, 7);
    ctx.quadraticCurveTo(-7, 2, 0, -8);
  }
  ctx.fill();
  ctx.restore();
  if (won && e.active) {
    ctx.strokeStyle = `rgba(255,255,255,${0.4 + Math.sin(t * 10) * 0.3})`;
    ctx.lineWidth = 2;
    roundRect(ctx, x - 5, y - 5, T + 10, 53, 16);
    ctx.stroke();
  }
}

function drawGem(ctx, g, t) {
  if (g.taken) return;
  const fire = g.el === "fire";
  const bob = Math.sin(t * 3 + g.x * 0.05) * 2.5;
  const x = g.x;
  const y = g.y + bob;
  const halo = ctx.createRadialGradient(x, y, 2, x, y, 16);
  halo.addColorStop(0, fire ? "rgba(255,90,60,0.55)" : "rgba(70,170,255,0.55)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(x - 16, y - 16, 32, 32);
  ctx.fillStyle = fire ? "#ff3b30" : "#1e90ff";
  ctx.beginPath();
  ctx.moveTo(x, y - 9);
  ctx.lineTo(x + 8, y - 2);
  ctx.lineTo(x, y + 9);
  ctx.lineTo(x - 8, y - 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = fire ? "#ffb3a6" : "#bfe3ff";
  ctx.beginPath();
  ctx.moveTo(x, y - 9);
  ctx.lineTo(x + 8, y - 2);
  ctx.lineTo(x, y - 1);
  ctx.lineTo(x - 8, y - 2);
  ctx.closePath();
  ctx.fill();
  const tw = (t * 1.3 + g.x * 0.01) % 2.4;
  if (tw < 0.4) {
    ctx.fillStyle = `rgba(255,255,255,${1 - tw / 0.4})`;
    ctx.fillRect(x - 4, y - 6, 2, 2);
  }
}

function drawPlate(ctx, pl) {
  const c = chColor(pl.ch);
  const z = pl.zone;
  const h = pl.down ? 3 : 6;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(z.x - 2, pl.floor - 3, z.w + 4, 3);
  ctx.fillStyle = c;
  roundRect(ctx, z.x, pl.floor - h - 1, z.w, h + 1, 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillRect(z.x + 2, pl.floor - h - 1, z.w - 4, 1.5);
  if (pl.hold && pl.timer > 0) drawTimer(ctx, z.x + z.w / 2, pl.floor - 20, pl.timer / pl.hold, c);
}

function drawTimer(ctx, x, y, k, c) {
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = c;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
  ctx.stroke();
}

function drawLever(ctx, lv) {
  const c = chColor(lv.ch);
  const x = lv.zone.x + lv.zone.w / 2;
  const y = lv.zone.y + T;
  ctx.fillStyle = "#3b3326";
  roundRect(ctx, x - 9, y - 7, 18, 7, 3);
  ctx.fill();
  const a = (lv.on ? 0.65 : -0.65) * lv.dir;
  ctx.strokeStyle = "#d8c9a5";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x + Math.sin(a) * 18, y - 5 - Math.cos(a) * 18);
  ctx.stroke();
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x + Math.sin(a) * 18, y - 5 - Math.cos(a) * 18, 4.5, 0, Math.PI * 2);
  ctx.fill();
  if (lv.hold && lv.timer > 0 && !lv.on) drawTimer(ctx, x, y - 34, lv.timer / lv.hold, c);
}

function drawDoor(ctx, d, s) {
  const c = chColor(d.ch);
  const r = d.solid;
  // frame stubs show where the door lives even when open
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(d.x, d.y, d.w, d.h);
  if (r && r.w > 0.5 && r.h > 0.5) {
    ctx.fillStyle = "#3c3a44";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = c;
    if (d.slide === "side") {
      for (let x = r.x + 4; x < r.x + r.w - 2; x += 10) ctx.fillRect(x, r.y + 3, 3, r.h - 6);
      ctx.fillRect(r.x + r.w - 4, r.y, 4, r.h);
    } else {
      for (let y = r.y + 4; y < r.y + r.h - 2; y += 10) ctx.fillRect(r.x + 3, y, r.w - 6, 3);
      ctx.fillRect(r.x, r.y + r.h - 4, r.w, 4);
    }
  }
  ctx.strokeStyle = c;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(d.x + 0.75, d.y + 0.75, d.w - 1.5, d.h - 1.5);
  ctx.globalAlpha = 1;
  // channel pips for doors that need several signals
  const chs = (d.ch || "").split("+");
  if (chs.length > 1) {
    chs.forEach((k, i) => {
      ctx.fillStyle = s.ch[k] ? CH_COLORS[k] : "rgba(0,0,0,0.6)";
      ctx.strokeStyle = CH_COLORS[k];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(d.x + d.w / 2 + (i - (chs.length - 1) / 2) * 11, d.y - 7, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
}

function drawPlatform(ctx, p) {
  const c = p.ch ? chColor(p.ch) : "#cfcfcf";
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(p.x + 3, p.y + p.h, p.w - 6, 3);
  ctx.fillStyle = "#6b6878";
  roundRect(ctx, p.x, p.y, p.w, p.h, 4);
  ctx.fill();
  ctx.fillStyle = "#8e8aa0";
  ctx.fillRect(p.x + 2, p.y + 1, p.w - 4, 3);
  ctx.fillStyle = c;
  ctx.fillRect(p.x + 6, p.y + p.h / 2 - 1, p.w - 12, 3);
}

function drawRails(ctx, s) {
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 2;
  for (const p of s.platforms) {
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.moveTo(p.a.x + p.w / 2, p.a.y + p.h / 2);
    ctx.lineTo(p.b.x + p.w / 2, p.b.y + p.h / 2);
    ctx.stroke();
  }
  for (const h of s.hazards) {
    if (!h.to) continue;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(h.to.x, h.to.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawBox(ctx, b) {
  ctx.fillStyle = "#8a5a2b";
  roundRect(ctx, b.x, b.y, b.w, b.h, 3);
  ctx.fill();
  ctx.strokeStyle = "#5b3a1a";
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
  if (!b.mirror) {
    ctx.beginPath();
    ctx.moveTo(b.x + 4, b.y + 4);
    ctx.lineTo(b.x + b.w - 4, b.y + b.h - 4);
    ctx.moveTo(b.x + b.w - 4, b.y + 4);
    ctx.lineTo(b.x + 4, b.y + b.h - 4);
    ctx.stroke();
  } else drawMirrorGlass(ctx, b.x + b.w / 2, b.y + b.h / 2, b.mirror, 11);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(b.x + 2, b.y + 1, b.w - 4, 2);
}

function drawMirrorGlass(ctx, x, y, o, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(o === "/" ? -Math.PI / 4 : Math.PI / 4);
  ctx.fillStyle = "#cfefff";
  ctx.fillRect(-r, -2.5, r * 2, 5);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-r, -2.5, r * 2, 1.5);
  ctx.restore();
}

function drawMirror(ctx, m, s) {
  const x = m.rect.x + T / 2;
  const y = m.rect.y + T / 2;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.arc(x, y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = m.ch ? chColor(m.ch) : "#bfa36a";
  ctx.lineWidth = 2;
  ctx.stroke();
  drawMirrorGlass(ctx, x, y, mirrorOrient(s, m), 12);
}

function drawEmitter(ctx, em, t) {
  const x = em.cx;
  const y = em.cy;
  ctx.fillStyle = "#4a3b22";
  roundRect(ctx, x - 12, y - 12, 24, 24, 6);
  ctx.fill();
  ctx.fillStyle = em.lit ? `rgba(255,236,150,${0.8 + Math.sin(t * 9) * 0.2})` : "#6d6047";
  ctx.beginPath();
  ctx.arc(x + em.d[0] * 6, y + em.d[1] * 6, 6, 0, Math.PI * 2);
  ctx.fill();
  if (em.ch) {
    ctx.strokeStyle = chColor(em.ch);
    ctx.lineWidth = 2;
    roundRect(ctx, x - 12, y - 12, 24, 24, 6);
    ctx.stroke();
  }
}

function drawSensor(ctx, sn, t) {
  const c = chColor(sn.ch);
  const x = sn.rect.x + T / 2;
  const y = sn.rect.y + T / 2;
  ctx.fillStyle = "#2c2c36";
  roundRect(ctx, x - 13, y - 13, 26, 26, 7);
  ctx.fill();
  ctx.strokeStyle = c;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = sn.lit ? "#fff7cf" : "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(x, y, sn.lit ? 7 + Math.sin(t * 10) : 6, 0, Math.PI * 2);
  ctx.fill();
  if (sn.hold && sn.timer > 0 && !sn.lit) drawTimer(ctx, x, y - 24, sn.timer / sn.hold, c);
}

function drawBeams(ctx, s, t) {
  if (!s.beams.length) return;
  ctx.lineCap = "round";
  for (const pass of [[10, "rgba(255,230,140,0.18)"], [4, "rgba(255,240,180,0.7)"], [1.5, "#ffffff"]]) {
    ctx.lineWidth = pass[0] + (pass[0] > 5 ? Math.sin(t * 12) * 1.5 : 0);
    ctx.strokeStyle = pass[1];
    ctx.beginPath();
    for (const b of s.beams) {
      ctx.moveTo(b.x0, b.y0);
      ctx.lineTo(b.x1, b.y1);
    }
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

function drawHazard(ctx, h, t) {
  const { x, y } = h.pos;
  if (h.kind === "saw") {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 8);
    ctx.fillStyle = "#c9ced8";
    ctx.beginPath();
    const n = 10;
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const rr = i % 2 ? h.r * 0.78 : h.r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#6c7280";
    ctx.beginPath();
    ctx.arc(0, 0, h.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const C = { fire: ["#ffe08a", "#ff6a1a", "rgba(255,110,30,0.35)"], water: ["#d6f6ff", "#2f9bff", "rgba(60,160,255,0.35)"], toxic: ["#e6ff9a", "#58c41c", "rgba(110,220,50,0.35)"] }[h.kind];
  const pulse = 1 + Math.sin(t * 7 + h.x) * 0.08;
  const halo = ctx.createRadialGradient(x, y, h.r * 0.3, x, y, h.r * 1.8);
  halo.addColorStop(0, C[2]);
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(x - h.r * 2, y - h.r * 2, h.r * 4, h.r * 4);
  const g = ctx.createRadialGradient(x - h.r * 0.3, y - h.r * 0.3, 1, x, y, h.r * pulse);
  g.addColorStop(0, C[0]);
  g.addColorStop(1, C[1]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, h.r * pulse, 0, Math.PI * 2);
  ctx.fill();
  // spikes so the orb reads as dangerous
  ctx.strokeStyle = C[1];
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + t * 2;
    ctx.moveTo(x + Math.cos(a) * h.r * 0.95, y + Math.sin(a) * h.r * 0.95);
    ctx.lineTo(x + Math.cos(a) * h.r * 1.3, y + Math.sin(a) * h.r * 1.3);
  }
  ctx.stroke();
}

/* ------------------------------------------------------------ heroes */

export function drawHero(ctx, p, t, s) {
  const fire = p.el === "fire";
  const cx = p.x + p.w / 2;
  const feet = p.y + p.h;
  let alpha = 1;
  let squash = 1;
  let lift = 0;
  if (p.dead) {
    const k = Math.min(1, (s.time + s.post - p.deathT) / 0.6);
    alpha = 1 - k;
    squash = 1 - k * 0.6;
    if (alpha <= 0) return;
  }
  const running = p.ground && Math.abs(p.vx) > 20;
  const phase = t * 14;
  if (!p.ground) squash = p.vy < 0 ? 1.12 : 0.95;
  else if (running) lift = Math.abs(Math.sin(phase)) * 2;
  else squash = 1 + Math.sin(t * 3) * 0.03;
  if (s.status === "won" && p.atExit) {
    lift = Math.abs(Math.sin((s.post + t * 0) * 9)) * 7;
    squash = 1.05;
  }
  const body = fire ? ["#ffd166", "#ff7a2f", "#e5482a"] : ["#c9f2ff", "#47b9ff", "#1f6fe0"];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, feet - lift);
  ctx.scale(1 / Math.sqrt(squash), squash);
  if (running) ctx.rotate(p.vx * 0.0006);

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, lift, 10, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // feet
  const sw = running ? Math.sin(phase) * 4 : 0;
  ctx.fillStyle = body[2];
  ctx.beginPath();
  ctx.ellipse(-4 + sw, -2.5, 4, 2.6, 0, 0, Math.PI * 2);
  ctx.ellipse(4 - sw, -2.5, 4, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // crown: flame tongues / water curl
  if (fire) {
    const f = (i) => Math.sin(t * 11 + i * 2.1) * 2;
    ctx.fillStyle = "#ff9a3c";
    ctx.beginPath();
    ctx.moveTo(-10, -16);
    ctx.quadraticCurveTo(-11, -27 + f(0), -5, -33 + f(1));
    ctx.quadraticCurveTo(-4, -27, -1, -29);
    ctx.quadraticCurveTo(1, -38 + f(2), 5, -40 + f(3));
    ctx.quadraticCurveTo(6, -31, 9, -30 + f(4));
    ctx.quadraticCurveTo(12, -24, 10, -16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.moveTo(-5, -18);
    ctx.quadraticCurveTo(-3, -28 + f(5), 3, -33 + f(6));
    ctx.quadraticCurveTo(4, -25, 6, -18);
    ctx.closePath();
    ctx.fill();
  } else {
    const wv = Math.sin(t * 4) * 1.5;
    ctx.fillStyle = "#7fd3ff";
    ctx.beginPath();
    ctx.moveTo(-10, -16);
    ctx.quadraticCurveTo(-9, -30, 2, -36 + wv);
    ctx.quadraticCurveTo(8, -38 + wv, 9, -33);
    ctx.quadraticCurveTo(4, -34, 3, -29);
    ctx.quadraticCurveTo(11, -26, 10, -16);
    ctx.closePath();
    ctx.fill();
  }

  // body
  const g = ctx.createRadialGradient(-3, -17, 2, 0, -13, 14);
  g.addColorStop(0, body[0]);
  g.addColorStop(0.55, body[1]);
  g.addColorStop(1, body[2]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -13, 10.5, 11.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // belly shine
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.ellipse(-4, -18, 3.2, 2, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // face
  const look = p.face * 2;
  const blink = (t + (fire ? 0 : 1.7)) % 3.6 < 0.12;
  if (p.dead) {
    ctx.strokeStyle = "#2a1408";
    ctx.lineWidth = 1.6;
    for (const ex of [-3.5, 3.5]) {
      ctx.beginPath();
      ctx.moveTo(ex + look - 2, -16);
      ctx.lineTo(ex + look + 2, -12);
      ctx.moveTo(ex + look + 2, -16);
      ctx.lineTo(ex + look - 2, -12);
      ctx.stroke();
    }
  } else {
    for (const ex of [-3.5, 3.5]) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(ex + look, -14, 2.8, blink ? 0.5 : 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!blink) {
        ctx.fillStyle = fire ? "#3a1405" : "#0b2350";
        ctx.beginPath();
        ctx.arc(ex + look * 1.4, -13.5, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = fire ? "#7a2408" : "#0d3a7a";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (s.status === "won") ctx.arc(look, -9, 3, 0.1, Math.PI - 0.1);
    else ctx.arc(look, -9.5, 2, 0.3, Math.PI - 0.3);
    ctx.stroke();
    ctx.fillStyle = fire ? "rgba(255,90,60,0.5)" : "rgba(120,170,255,0.5)";
    ctx.beginPath();
    ctx.arc(-7 + look, -10.5, 1.8, 0, Math.PI * 2);
    ctx.arc(7 + look, -10.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------ frame */

export function drawFrame(ctx, s, view, fx, bake) {
  const { w, h, dpr, scale, ox, oy } = view;
  const t = s.time + s.post;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#07060c";
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
  if (bake) ctx.drawImage(bake, 0, 0, VIEW_W, VIEW_H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, VIEW_W, VIEW_H);
  ctx.clip();

  drawRails(ctx, s);
  for (const e of s.exits) drawExit(ctx, e, t, s.status === "won");
  for (const d of s.doors) drawDoor(ctx, d, s);
  drawBeams(ctx, s, t);
  for (const m of s.mirrors) drawMirror(ctx, m, s);
  for (const sn of s.sensors) drawSensor(ctx, sn, t);
  for (const em of s.emitters) drawEmitter(ctx, em, t);
  for (const pl of s.plates) drawPlate(ctx, pl);
  for (const lv of s.levers) drawLever(ctx, lv);
  for (const p of s.platforms) drawPlatform(ctx, p);
  for (const b of s.boxes) drawBox(ctx, b);
  for (const g of s.gems) drawGem(ctx, g, t);
  drawLiquids(ctx, s, t);
  for (const p of s.players) drawHero(ctx, p, t, s);
  for (const hz of s.hazards) drawHazard(ctx, hz, t);
  for (const p of fx) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (p.grow ? 1 + (1 - p.life / p.max) * 1.5 : 1), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // timed-door countdown pips on doors fed by held sources
  for (const d of s.doors) {
    const srcs = [...s.plates, ...s.levers, ...s.sensors].filter((x) => x.hold && (d.ch || "").split("+").includes(x.ch));
    const live = srcs.find((x) => x.timer > 0);
    if (live && chOn(s, d.ch)) drawTimer(ctx, d.x + d.w / 2, d.y - 12, live.timer / live.hold, chColor(live.ch));
  }
  ctx.restore();
}

/** particle bursts for sim events (view-only state) */
export function spawnFx(fx, e) {
  const burst = (n, colors, speed, life, extra = {}) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      fx.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, r: 1.5 + Math.random() * 2.5, life, max: life, color: colors[i % colors.length], ...extra });
    }
  };
  if (e.type === "gem") burst(14, e.el === "fire" ? ["#ff5a3c", "#ffd0c0", "#ffffff"] : ["#2f9bff", "#cfe9ff", "#ffffff"], 120, 0.6);
  else if (e.type === "die") {
    const steam = e.cause === "toxic" ? ["#9be15d", "#d9ff9a", "#5fb02a"] : ["#e9eef5", "#b8c2d0", "#ffffff"];
    burst(26, steam, 90, 1.1, { grow: true, g: -60 });
  } else if (e.type === "land") burst(5, ["rgba(255,255,255,0.5)"], 40, 0.3);
  else if (e.type === "jump") burst(3, ["rgba(255,255,255,0.4)"], 30, 0.25);
  else if (e.type === "exit") burst(10, ["#fff3b0", "#ffffff", "#ffd27a"], 70, 0.6);
  else if (e.type === "sensor" || e.type === "lever" || e.type === "plate") burst(6, ["#fff3b0", "#ffffff"], 60, 0.35);
}

export function stepFx(fx, dt) {
  for (const p of fx) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.g ?? 260) * dt;
    p.vx *= 1 - dt * 2;
    p.life -= dt;
  }
  let n = 0;
  for (const p of fx) if (p.life > 0) fx[n++] = p;
  fx.length = n;
}
