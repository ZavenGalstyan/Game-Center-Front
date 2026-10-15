/**
 * Throw Masters — scene renderer. Draws a Battle into a 2D canvas: parallax
 * arena backdrop, terrain, obstacles, stuck weapons, fighters, projectiles,
 * particles, damage numbers and the aim indicator. The world (W × H) is fitted
 * inside the canvas; the backdrop and ground extend past the world edges so
 * any aspect ratio fills without letterboxing.
 */
import { W, H } from "./data.js";
import { groundY, launchOrigin } from "./physics.js";
import { drawFighter, drawWeapon, star, shade } from "./art.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createView() {
  return { w: 0, h: 0, dpr: 1, s: 1, filter: false };
}

export function resizeView(view, canvas, w, h, dpr) {
  view.dpr = Math.min(dpr || 1, 2);
  view.w = w;
  view.h = h;
  // fit the world, but keep a little headroom above it for the HUD
  view.s = Math.min(w / W, h / (H * 1.02));
  canvas.width = Math.max(1, Math.round(w * view.dpr));
  canvas.height = Math.max(1, Math.round(h * view.dpr));
}

/** Screen (CSS px inside the canvas) → world, using the battle camera. */
export function toWorld(view, cam, px, py) {
  const sc = view.s * cam.zoom;
  return { x: cam.x + (px - view.w / 2) / sc, y: cam.y + (py - view.h / 2) / sc };
}

/** Set the transform for a parallax layer (f = 0 static … 1 moves with the world). */
function layer(c, v, cam, f, shx = 0, shy = 0) {
  const z = 1 + (cam.zoom - 1) * f;
  const sc = v.s * z;
  const cx = W / 2 + (cam.x - W / 2) * f;
  const cy = H / 2 + (cam.y - H / 2) * f;
  const d = v.dpr;
  c.setTransform(d * sc, 0, 0, d * sc, d * (v.w / 2 - cx * sc + shx * f), d * (v.h / 2 - cy * sc + shy * f));
  return { x0: cx - v.w / 2 / sc, x1: cx + v.w / 2 / sc, y0: cy - v.h / 2 / sc, y1: cy + v.h / 2 / sc };
}

/* ======================================================================
   Arena decoration (generated once per arena, deterministic)
   ====================================================================== */

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const DECO = new Map();
function deco(id) {
  if (DECO.has(id)) return DECO.get(id);
  const r = seeded(id.length * 7919 + id.charCodeAt(0) * 31);
  const d = { clouds: [], far: [], mid: [], items: [], stars: [], windows: [] };
  for (let i = 0; i < 7; i++) d.clouds.push({ x: r() * 2600 - 500, y: 60 + r() * 220, s: 0.6 + r() * 0.8, v: 8 + r() * 14 });
  for (let i = 0; i < 90; i++) d.stars.push({ x: r() * 2600 - 500, y: r() * 520, s: 0.6 + r() * 1.6, p: r() * 6 });
  // ridge lines for far / mid hills
  for (let x = -900; x <= 2500; x += 60) {
    d.far.push(x, Math.sin(x * 0.004 + 1) * 50 + Math.sin(x * 0.011) * 22 + r() * 10);
    d.mid.push(x, Math.sin(x * 0.006 + 2) * 36 + Math.sin(x * 0.017) * 14 + r() * 8);
  }
  for (let i = 0; i < 26; i++) d.items.push({ x: -700 + i * 125 + r() * 70, s: 0.75 + r() * 0.5, k: r() });
  for (let i = 0; i < 400; i++) d.windows.push(r());
  DECO.set(id, d);
  return d;
}

function ridge(c, pts, base, amp, x0, x1, yBottom) {
  c.beginPath();
  c.moveTo(x0 - 50, yBottom);
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i];
    if (x < x0 - 120 || x > x1 + 120) continue;
    c.lineTo(x, base - pts[i + 1] * amp);
  }
  c.lineTo(x1 + 50, yBottom);
  c.closePath();
  c.fill();
}

function cloud(c, x, y, s, col) {
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y, 34 * s, 0, TAU);
  c.arc(x + 38 * s, y - 14 * s, 42 * s, 0, TAU);
  c.arc(x + 82 * s, y, 32 * s, 0, TAU);
  c.arc(x + 40 * s, y + 10 * s, 34 * s, 0, TAU);
  c.fill();
}

function tree(c, x, y, s, col) {
  c.fillStyle = "#6b4a2b";
  c.fillRect(x - 5 * s, y - 50 * s, 10 * s, 50 * s);
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y - 70 * s, 30 * s, 0, TAU);
  c.arc(x - 22 * s, y - 54 * s, 22 * s, 0, TAU);
  c.arc(x + 22 * s, y - 54 * s, 22 * s, 0, TAU);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.12)";
  c.beginPath();
  c.arc(x - 8 * s, y - 80 * s, 14 * s, 0, TAU);
  c.fill();
}

function pine(c, x, y, s, col, snow) {
  c.fillStyle = "#4b3424";
  c.fillRect(x - 4 * s, y - 20 * s, 8 * s, 20 * s);
  for (let i = 0; i < 3; i++) {
    const w = (44 - i * 10) * s;
    const yy = y - 18 * s - i * 26 * s;
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x - w, yy);
    c.lineTo(x, yy - 46 * s);
    c.lineTo(x + w, yy);
    c.closePath();
    c.fill();
    if (snow) {
      c.fillStyle = "#f4f9ff";
      c.beginPath();
      c.moveTo(x - w * 0.55, yy - 20 * s);
      c.lineTo(x, yy - 46 * s);
      c.lineTo(x + w * 0.55, yy - 20 * s);
      c.quadraticCurveTo(x, yy - 28 * s, x - w * 0.55, yy - 20 * s);
      c.fill();
    }
  }
}

function palm(c, x, y, s, t) {
  c.strokeStyle = "#8a5d34";
  c.lineWidth = 12 * s;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(x + 30 * s, y - 90 * s, x + 14 * s, y - 180 * s);
  c.stroke();
  const tx = x + 14 * s;
  const ty = y - 180 * s;
  c.fillStyle = "#2f8f4e";
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.55 + Math.sin(t * 1.4 + i) * 0.04;
    c.beginPath();
    c.moveTo(tx, ty);
    c.quadraticCurveTo(tx + Math.cos(a - 0.3) * 60 * s, ty + Math.sin(a - 0.3) * 60 * s - 10 * s, tx + Math.cos(a) * 95 * s, ty + Math.sin(a) * 70 * s + 30 * s);
    c.quadraticCurveTo(tx + Math.cos(a + 0.2) * 50 * s, ty + Math.sin(a + 0.2) * 40 * s, tx, ty);
    c.fill();
  }
  c.fillStyle = "#6b4a2b";
  c.beginPath();
  c.arc(tx - 5 * s, ty + 8 * s, 7 * s, 0, TAU);
  c.arc(tx + 7 * s, ty + 9 * s, 7 * s, 0, TAU);
  c.fill();
}

function cactus(c, x, y, s) {
  c.fillStyle = "#4f9a52";
  const rrect = (xx, yy, w, h) => {
    c.beginPath();
    c.moveTo(xx, yy + h);
    c.lineTo(xx, yy + w / 2);
    c.arc(xx + w / 2, yy + w / 2, w / 2, Math.PI, 0);
    c.lineTo(xx + w, yy + h);
    c.closePath();
    c.fill();
  };
  rrect(x - 10 * s, y - 110 * s, 20 * s, 110 * s);
  rrect(x - 34 * s, y - 80 * s, 14 * s, 40 * s);
  c.fillRect(x - 34 * s, y - 46 * s, 30 * s, 12 * s);
  rrect(x + 18 * s, y - 92 * s, 14 * s, 50 * s);
  c.fillRect(x + 4 * s, y - 50 * s, 28 * s, 12 * s);
  c.fillStyle = "rgba(255,255,255,0.15)";
  c.fillRect(x - 5 * s, y - 100 * s, 4 * s, 90 * s);
}

/* ---------------------------------------------------------------- per-arena backdrops */

function sky(c, v, stops) {
  const g = c.createLinearGradient(0, 0, 0, v.h * v.dpr);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = g;
  c.fillRect(0, 0, v.w * v.dpr, v.h * v.dpr);
}

const BACKDROPS = {
  meadow(c, v, cam, t, d) {
    sky(c, v, [[0, "#4fa8f0"], [0.55, "#a9dcff"], [1, "#e9f8ff"]]);
    let e = layer(c, v, cam, 0.05);
    // sun
    const sx = 1260;
    const sy = 150;
    c.save();
    c.translate(sx, sy);
    c.rotate(t * 0.05);
    c.fillStyle = "rgba(255,245,180,0.25)";
    for (let i = 0; i < 12; i++) {
      c.rotate(TAU / 12);
      c.beginPath();
      c.moveTo(0, -60);
      c.lineTo(14, -190);
      c.lineTo(-14, -190);
      c.fill();
    }
    c.restore();
    const sg = c.createRadialGradient(sx, sy, 10, sx, sy, 90);
    sg.addColorStop(0, "#fffbe0");
    sg.addColorStop(0.5, "#ffe680");
    sg.addColorStop(1, "rgba(255,230,128,0)");
    c.fillStyle = sg;
    c.beginPath();
    c.arc(sx, sy, 90, 0, TAU);
    c.fill();
    for (const cl of d.clouds) {
      const x = ((cl.x + t * cl.v) % 2600) - 500;
      cloud(c, x, cl.y, cl.s, "rgba(255,255,255,0.92)");
    }
    e = layer(c, v, cam, 0.25);
    c.fillStyle = "#93c9b4";
    ridge(c, d.far, 560, 1.4, e.x0, e.x1, e.y1 + 50);
    e = layer(c, v, cam, 0.55);
    c.fillStyle = "#6cbf62";
    ridge(c, d.mid, 640, 1.2, e.x0, e.x1, e.y1 + 50);
    for (const it of d.items) {
      if (it.x < e.x0 - 100 || it.x > e.x1 + 100) continue;
      if (it.k < 0.55) tree(c, it.x, 650 - (it.k * 20), it.s * 0.9, it.k < 0.25 ? "#3f9b46" : "#4caf50");
      else if (it.k > 0.92) windmill(c, it.x, 640, t);
    }
  },
  canyon(c, v, cam, t, d) {
    sky(c, v, [[0, "#f28a4b"], [0.5, "#ffc27a"], [1, "#ffe6b8"]]);
    let e = layer(c, v, cam, 0.05);
    const sg = c.createRadialGradient(400, 330, 20, 400, 330, 160);
    sg.addColorStop(0, "rgba(255,250,220,1)");
    sg.addColorStop(0.35, "rgba(255,220,140,0.9)");
    sg.addColorStop(1, "rgba(255,180,100,0)");
    c.fillStyle = sg;
    c.beginPath();
    c.arc(400, 330, 160, 0, TAU);
    c.fill();
    c.strokeStyle = "rgba(90,40,30,0.5)";
    c.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const bx = ((300 + i * 260 + t * 22) % 1900) - 150;
      const by = 180 + i * 40 + Math.sin(t * 2 + i) * 8;
      const fl = Math.sin(t * 8 + i) * 6;
      c.beginPath();
      c.moveTo(bx - 14, by - fl);
      c.quadraticCurveTo(bx - 6, by - 6, bx, by);
      c.quadraticCurveTo(bx + 6, by - 6, bx + 14, by - fl);
      c.stroke();
    }
    e = layer(c, v, cam, 0.22);
    c.fillStyle = "#d9895c";
    for (let i = 0; i < 9; i++) {
      const x = -600 + i * 380 + (i % 3) * 40;
      const w = 160 + (i % 4) * 60;
      const h = 150 + (i % 3) * 70;
      c.beginPath();
      c.moveTo(x - 30, 640);
      c.lineTo(x, 640 - h);
      c.lineTo(x + w, 640 - h);
      c.lineTo(x + w + 30, 640);
      c.fill();
    }
    c.fillRect(e.x0 - 50, 620, e.x1 - e.x0 + 100, e.y1 - 600);
    e = layer(c, v, cam, 0.5);
    c.fillStyle = "#b6613b";
    ridge(c, d.mid, 680, 1.8, e.x0, e.x1, e.y1 + 50);
    c.strokeStyle = "rgba(120,50,25,0.35)";
    c.lineWidth = 4;
    for (let y = 700; y < 820; y += 26) {
      c.beginPath();
      c.moveTo(e.x0, y);
      c.lineTo(e.x1, y + 6);
      c.stroke();
    }
    for (const it of d.items) {
      if (it.x < e.x0 - 100 || it.x > e.x1 + 100 || it.k > 0.5) continue;
      cactus(c, it.x, 700, it.s * 0.8);
    }
  },
  snow(c, v, cam, t, d) {
    sky(c, v, [[0, "#7ea7dc"], [0.6, "#c4dbf5"], [1, "#eef6ff"]]);
    let e = layer(c, v, cam, 0.05);
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.beginPath();
    c.arc(1180, 160, 48, 0, TAU);
    c.fill();
    for (const cl of d.clouds) {
      const x = ((cl.x + t * cl.v * 0.6) % 2600) - 500;
      cloud(c, x, cl.y * 0.8, cl.s * 0.9, "rgba(240,246,255,0.75)");
    }
    e = layer(c, v, cam, 0.2);
    for (let i = 0; i < 9; i++) {
      const x = -700 + i * 360;
      const h = 300 + ((i * 97) % 160);
      c.fillStyle = i % 2 ? "#8ea4c4" : "#9db2cf";
      c.beginPath();
      c.moveTo(x - 240, 680);
      c.lineTo(x, 680 - h);
      c.lineTo(x + 240, 680);
      c.fill();
      c.fillStyle = "#f6fbff";
      c.beginPath();
      c.moveTo(x - 80, 680 - h + 110);
      c.lineTo(x, 680 - h);
      c.lineTo(x + 80, 680 - h + 110);
      c.lineTo(x + 40, 680 - h + 90);
      c.lineTo(x + 10, 680 - h + 118);
      c.lineTo(x - 30, 680 - h + 92);
      c.closePath();
      c.fill();
    }
    e = layer(c, v, cam, 0.5);
    c.fillStyle = "#e3edf8";
    ridge(c, d.mid, 690, 1.2, e.x0, e.x1, e.y1 + 50);
    for (const it of d.items) {
      if (it.x < e.x0 - 100 || it.x > e.x1 + 100 || it.k > 0.7) continue;
      pine(c, it.x, 700 - it.k * 20, it.s * 0.85, it.k < 0.3 ? "#2e6b4f" : "#357a59", true);
    }
  },
  island(c, v, cam, t, d) {
    sky(c, v, [[0, "#4a2f7a"], [0.45, "#d65f7c"], [0.75, "#ffae6b"], [1, "#ffd8a0"]]);
    let e = layer(c, v, cam, 0.05);
    const sg = c.createRadialGradient(560, 560, 20, 560, 560, 200);
    sg.addColorStop(0, "rgba(255,240,190,1)");
    sg.addColorStop(0.3, "rgba(255,190,110,0.9)");
    sg.addColorStop(1, "rgba(255,140,90,0)");
    c.fillStyle = sg;
    c.beginPath();
    c.arc(560, 560, 200, 0, TAU);
    c.fill();
    for (const cl of d.clouds) {
      const x = ((cl.x + t * cl.v * 0.5) % 2600) - 500;
      cloud(c, x, cl.y * 0.7, cl.s * 0.8, "rgba(255,190,190,0.35)");
    }
    e = layer(c, v, cam, 0.18);
    // sea
    const sea = c.createLinearGradient(0, 590, 0, 760);
    sea.addColorStop(0, "#3a6fa8");
    sea.addColorStop(1, "#1f4f80");
    c.fillStyle = sea;
    c.fillRect(e.x0 - 50, 590, e.x1 - e.x0 + 100, e.y1 - 560);
    c.fillStyle = "rgba(255,210,150,0.5)";
    for (let i = 0; i < 18; i++) {
      const y = 600 + i * 9;
      const w = 160 - i * 6;
      c.fillRect(560 - w / 2 + Math.sin(t * 2 + i) * 10, y, w, 2);
    }
    c.strokeStyle = "rgba(255,255,255,0.25)";
    c.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const x = ((i * 190 + t * 18) % 2400) - 400;
      const y = 620 + (i % 5) * 26;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + 15, y - 5, x + 30, y);
      c.stroke();
    }
    // ship
    const shx = 1150 + Math.sin(t * 0.3) * 20;
    const shy = 598 + Math.sin(t * 1.2) * 2;
    c.fillStyle = "#2a1c2e";
    c.beginPath();
    c.moveTo(shx - 70, shy - 14);
    c.lineTo(shx + 80, shy - 14);
    c.lineTo(shx + 60, shy + 4);
    c.lineTo(shx - 56, shy + 4);
    c.fill();
    c.fillRect(shx - 2, shy - 100, 4, 90);
    c.fillRect(shx - 42, shy - 76, 3, 64);
    c.fillStyle = "#f2e0c8";
    c.beginPath();
    c.moveTo(shx + 4, shy - 96);
    c.quadraticCurveTo(shx + 40, shy - 70, shx + 4, shy - 30);
    c.fill();
    c.beginPath();
    c.moveTo(shx - 38, shy - 72);
    c.quadraticCurveTo(shx - 10, shy - 54, shx - 38, shy - 26);
    c.fill();
    c.fillStyle = "#2a1c2e";
    c.beginPath();
    c.ellipse(-300, 600, 260, 40, 0, Math.PI, 0);
    c.fill();
    e = layer(c, v, cam, 0.55);
    for (const it of d.items) {
      if (it.x < e.x0 - 200 || it.x > e.x1 + 200 || it.k > 0.45) continue;
      palm(c, it.x, 720, it.s * 0.9, t);
    }
  },
  city(c, v, cam, t, d) {
    sky(c, v, [[0, "#070a24"], [0.55, "#1b2457"], [1, "#3d2d6e"]]);
    let e = layer(c, v, cam, 0.03);
    for (const s of d.stars) {
      const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s.p));
      c.fillStyle = `rgba(255,255,255,${a})`;
      c.fillRect(s.x, s.y, s.s * 1.6, s.s * 1.6);
    }
    const mg = c.createRadialGradient(1240, 140, 10, 1240, 140, 120);
    mg.addColorStop(0, "rgba(255,255,230,1)");
    mg.addColorStop(0.35, "rgba(255,250,210,0.9)");
    mg.addColorStop(0.4, "rgba(200,210,255,0.25)");
    mg.addColorStop(1, "rgba(200,210,255,0)");
    c.fillStyle = mg;
    c.beginPath();
    c.arc(1240, 140, 120, 0, TAU);
    c.fill();
    c.fillStyle = "rgba(200,200,170,0.35)";
    c.beginPath();
    c.arc(1226, 130, 9, 0, TAU);
    c.arc(1256, 154, 6, 0, TAU);
    c.fill();
    e = layer(c, v, cam, 0.2);
    let wi = 0;
    for (let i = 0; i < 26; i++) {
      const x = -700 + i * 125;
      const h = 220 + ((i * 131) % 230);
      const w = 100 + ((i * 53) % 40);
      c.fillStyle = "#151a3d";
      c.fillRect(x, 700 - h, w, h + 200);
      for (let yy = 700 - h + 14; yy < 690; yy += 22) {
        for (let xx = x + 10; xx < x + w - 12; xx += 18) {
          const r = d.windows[wi++ % d.windows.length];
          if (r < 0.32) {
            c.fillStyle = r < 0.08 ? "#9fd8ff" : "#ffd97a";
            c.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(t * 0.3 + r * 40));
            c.fillRect(xx, yy, 8, 11);
            c.globalAlpha = 1;
          }
        }
      }
    }
    e = layer(c, v, cam, 0.5);
    for (let i = 0; i < 14; i++) {
      const x = -600 + i * 230;
      const h = 140 + ((i * 71) % 120);
      c.fillStyle = "#232a55";
      c.fillRect(x, 760 - h, 170, h + 200);
      c.fillStyle = "#2c3466";
      c.fillRect(x, 760 - h, 170, 8);
      if (i % 3 === 0) {
        // neon sign
        const col = i % 2 ? "#ff4fd8" : "#40f0ff";
        c.save();
        c.shadowColor = col;
        c.shadowBlur = 18;
        c.strokeStyle = col;
        c.lineWidth = 4;
        c.globalAlpha = 0.75 + Math.sin(t * 6 + i) * 0.25 * (i % 2);
        c.strokeRect(x + 30, 760 - h + 26, 110, 34);
        c.restore();
      }
      if (i % 4 === 1) {
        c.fillStyle = "#1a1f42";
        c.fillRect(x + 110, 760 - h - 60, 46, 40);
        c.fillRect(x + 116, 760 - h - 20, 4, 20);
        c.fillRect(x + 146, 760 - h - 20, 4, 20);
      }
    }
  },
};

function windmill(c, x, y, t) {
  c.fillStyle = "#e9dfcf";
  c.beginPath();
  c.moveTo(x - 20, y);
  c.lineTo(x - 12, y - 110);
  c.lineTo(x + 12, y - 110);
  c.lineTo(x + 20, y);
  c.fill();
  c.fillStyle = "#c0392b";
  c.beginPath();
  c.moveTo(x - 16, y - 108);
  c.lineTo(x, y - 128);
  c.lineTo(x + 16, y - 108);
  c.fill();
  c.save();
  c.translate(x, y - 108);
  c.rotate(t * 0.8);
  c.fillStyle = "#f5f0e6";
  for (let i = 0; i < 4; i++) {
    c.rotate(TAU / 4);
    c.fillRect(-4, -70, 8, 66);
    c.fillRect(4, -66, 12, 50);
  }
  c.restore();
}

/* ---------------------------------------------------------------- ground + obstacles */

const GROUND = {
  meadow: { top: "#6fd04f", lip: "#8ce86a", fill: ["#8a5a2f", "#5e3b1d"], dot: "rgba(255,255,255,0.12)" },
  canyon: { top: "#f0c27a", lip: "#ffd99b", fill: ["#d0884c", "#8f5228"], dot: "rgba(90,40,10,0.18)" },
  snow: { top: "#ffffff", lip: "#ffffff", fill: ["#dbe8f6", "#9eb5d2"], dot: "rgba(120,150,190,0.25)" },
  island: { top: "#f4d58c", lip: "#ffe7ad", fill: ["#e3b96a", "#b98a45"], dot: "rgba(255,255,255,0.3)" },
  city: { top: "#6a7088", lip: "#8a90a8", fill: ["#3f4459", "#262a3a"], dot: "rgba(255,255,255,0.06)" },
};

function drawGround(c, b, e, t) {
  const G = GROUND[b.arena] || GROUND.meadow;
  const gp = b.world.ground;
  const x0 = e.x0 - 40;
  const x1 = e.x1 + 40;
  const bottom = Math.max(e.y1 + 40, H + 100);
  c.beginPath();
  c.moveTo(x0, groundY(gp, x0));
  for (const [x, y] of gp) if (x > x0 && x < x1) c.lineTo(x, y);
  c.lineTo(x1, groundY(gp, x1));
  c.lineTo(x1, bottom);
  c.lineTo(x0, bottom);
  c.closePath();
  const g = c.createLinearGradient(0, 600, 0, H);
  g.addColorStop(0, G.fill[0]);
  g.addColorStop(1, G.fill[1]);
  c.fillStyle = g;
  c.fill();
  // texture dots
  c.save();
  c.clip();
  c.fillStyle = G.dot;
  for (let i = 0; i < 120; i++) {
    const x = (i * 137.5) % 2600 - 500;
    const y = groundY(gp, x) + 26 + ((i * 53) % 140);
    c.beginPath();
    c.ellipse(x, y, 7 + (i % 4) * 3, 4 + (i % 3), 0, 0, TAU);
    c.fill();
  }
  if (b.arena === "city") {
    c.strokeStyle = "rgba(0,0,0,0.25)";
    c.lineWidth = 3;
    for (let x = Math.floor(x0 / 140) * 140; x < x1; x += 140) {
      c.beginPath();
      c.moveTo(x, groundY(gp, x) + 22);
      c.lineTo(x, bottom);
      c.stroke();
    }
  }
  c.restore();
  // top band
  c.lineJoin = "round";
  c.lineCap = "round";
  c.strokeStyle = G.top;
  c.lineWidth = 22;
  c.beginPath();
  c.moveTo(x0, groundY(gp, x0) + 9);
  for (const [x, y] of gp) if (x > x0 && x < x1) c.lineTo(x, y + 9);
  c.lineTo(x1, groundY(gp, x1) + 9);
  c.stroke();
  c.strokeStyle = G.lip;
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(x0, groundY(gp, x0) + 1);
  for (const [x, y] of gp) if (x > x0 && x < x1) c.lineTo(x, y + 1);
  c.lineTo(x1, groundY(gp, x1) + 1);
  c.stroke();
  // grass tufts / flowers / snow lumps
  if (b.arena === "meadow") {
    for (let i = 0; i < 70; i++) {
      const x = (i * 61.7) % 2400 - 400;
      if (x < x0 || x > x1) continue;
      const y = groundY(gp, x);
      c.strokeStyle = "#4fae3a";
      c.lineWidth = 3;
      const sw = Math.sin(t * 2 + i) * 2;
      c.beginPath();
      c.moveTo(x, y + 2);
      c.lineTo(x - 4 + sw, y - 10);
      c.moveTo(x, y + 2);
      c.lineTo(x + 3 + sw, y - 12);
      c.stroke();
      if (i % 5 === 0) {
        c.fillStyle = ["#ff6b8a", "#ffd23f", "#ffffff", "#9b7bff"][i % 4];
        c.beginPath();
        c.arc(x + 8 + sw, y - 8, 4, 0, TAU);
        c.fill();
      }
    }
  } else if (b.arena === "snow") {
    c.fillStyle = "#ffffff";
    for (let i = 0; i < 40; i++) {
      const x = (i * 97.3) % 2400 - 400;
      if (x < x0 || x > x1) continue;
      c.beginPath();
      c.ellipse(x, groundY(gp, x) - 1, 20, 7, 0, Math.PI, 0);
      c.fill();
    }
  } else if (b.arena === "island") {
    for (let i = 0; i < 18; i++) {
      const x = (i * 151.3) % 2400 - 400;
      if (x < x0 || x > x1) continue;
      const y = groundY(gp, x) + 14;
      c.fillStyle = i % 2 ? "#ffd2c8" : "#fff0d8";
      c.beginPath();
      c.arc(x, y, 5, Math.PI, 0);
      c.fill();
    }
  } else if (b.arena === "canyon") {
    c.fillStyle = "#a8683a";
    for (let i = 0; i < 22; i++) {
      const x = (i * 127.1) % 2400 - 400;
      if (x < x0 || x > x1) continue;
      c.beginPath();
      c.ellipse(x, groundY(gp, x) + 2, 8 + (i % 3) * 4, 5, 0, Math.PI, 0);
      c.fill();
    }
  }
}

const OBST = {
  meadow: { rock: "#9aa0a8", wood: "#b0773f", stone: "#a7a39a", float: "#8a5a2f", orb: "#7d8a74" },
  canyon: { rock: "#b0683e", wood: "#9c6a3c", stone: "#c27a48", float: "#9c6a3c", orb: "#a85a32" },
  snow: { rock: "#8ea1b8", wood: "#8a6a4a", stone: "#b9d8f2", float: "#8a6a4a", orb: "#aee0ff" },
  island: { rock: "#8b8378", wood: "#a0703e", stone: "#9a8f80", float: "#7a5530", orb: "#6c6a64" },
  city: { rock: "#5a6078", wood: "#6c5a4a", stone: "#525a7a", float: "#4a5070", orb: "#ff4fd8" },
};

function drawObstacle(c, o, arena, t) {
  const P = OBST[arena] || OBST.meadow;
  c.save();
  if (o.type === "circle") {
    if (o.style === "orb") {
      // floating boulder / neon orb
      const col = P.orb;
      const g = c.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.3, 2, o.x, o.y, o.r);
      g.addColorStop(0, shade(col, 0.45));
      g.addColorStop(1, shade(col, -0.35));
      if (arena === "city") {
        c.shadowColor = col;
        c.shadowBlur = 24;
      }
      c.fillStyle = g;
      c.beginPath();
      c.arc(o.x, o.y, o.r, 0, TAU);
      c.fill();
      c.shadowBlur = 0;
      c.fillStyle = "rgba(0,0,0,0.12)";
      c.beginPath();
      c.ellipse(o.x, o.y + o.r + 40 + Math.sin(t * 2) * 4, o.r * 0.7, 6, 0, 0, TAU);
      c.fill();
    } else {
      const g = c.createRadialGradient(o.x - o.r * 0.35, o.y - o.r * 0.4, 3, o.x, o.y, o.r * 1.1);
      g.addColorStop(0, shade(P.rock, 0.35));
      g.addColorStop(1, shade(P.rock, -0.35));
      c.fillStyle = g;
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        const rr = o.r * (0.92 + ((i * 37) % 10) / 80);
        c.lineTo(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(0,0,0,0.18)";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(o.x - o.r * 0.3, o.y - o.r * 0.2);
      c.lineTo(o.x + o.r * 0.1, o.y + o.r * 0.1);
      c.lineTo(o.x + o.r * 0.05, o.y + o.r * 0.5);
      c.stroke();
      if (arena === "snow") {
        c.fillStyle = "#fff";
        c.beginPath();
        c.ellipse(o.x, o.y - o.r * 0.75, o.r * 0.7, o.r * 0.3, 0, Math.PI, 0);
        c.fill();
      }
    }
    c.restore();
    return;
  }
  const { x, y, w, h } = o;
  if (o.style === "crate") {
    const col = arena === "city" ? "#5d6b8a" : P.wood;
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
    c.strokeStyle = shade(col, -0.35);
    c.lineWidth = 5;
    c.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
    c.beginPath();
    c.moveTo(x + 4, y + 4);
    c.lineTo(x + w - 4, y + h - 4);
    c.stroke();
    if (arena === "city") {
      c.fillStyle = "rgba(255,255,255,0.15)";
      for (let i = 1; i < 4; i++) c.fillRect(x + 8, y + (i * h) / 4, w - 16, 3);
    }
  } else if (o.style === "float") {
    c.strokeStyle = "rgba(60,40,20,0.7)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x + 12, y);
    c.lineTo(x + 12, y - 900);
    c.moveTo(x + w - 12, y);
    c.lineTo(x + w - 12, y - 900);
    c.stroke();
    c.fillStyle = P.float;
    c.fillRect(x, y, w, h);
    c.fillStyle = shade(P.float, 0.25);
    c.fillRect(x, y, w, 6);
    c.strokeStyle = shade(P.float, -0.3);
    c.lineWidth = 2;
    for (let xx = x + 30; xx < x + w; xx += 30) {
      c.beginPath();
      c.moveTo(xx, y + 6);
      c.lineTo(xx, y + h);
      c.stroke();
    }
    if (arena === "snow") {
      c.fillStyle = "#fff";
      c.fillRect(x - 2, y - 5, w + 4, 7);
    }
  } else {
    // wall / tower — stone blocks
    const col = arena === "snow" && o.style === "wall" ? "#b9d8f2" : P.stone;
    c.fillStyle = shade(col, -0.1);
    c.fillRect(x, y, w, h);
    c.strokeStyle = shade(col, -0.38);
    c.lineWidth = 3;
    const bh = 26;
    for (let yy = y, row = 0; yy < y + h; yy += bh, row++) {
      c.fillStyle = shade(col, ((row * 7) % 5) / 40);
      c.fillRect(x, yy, w, Math.min(bh, y + h - yy));
      c.beginPath();
      c.moveTo(x, yy);
      c.lineTo(x + w, yy);
      const off = row % 2 ? w / 2 : w / 4;
      for (let xx = x + off; xx < x + w; xx += w / 2) {
        c.moveTo(xx, yy);
        c.lineTo(xx, Math.min(yy + bh, y + h));
      }
      c.stroke();
    }
    c.strokeRect(x, y, w, h);
    c.fillStyle = arena === "snow" ? "#fff" : "rgba(255,255,255,0.18)";
    c.fillRect(x - 3, y - 4, w + 6, 8);
    if (arena === "city" && o.style === "tower") {
      c.fillStyle = Math.sin(t * 3) > 0 ? "#ff4a4a" : "#7a1a1a";
      c.beginPath();
      c.arc(x + w / 2, y - 10, 6, 0, TAU);
      c.fill();
    }
  }
  c.restore();
}

/* ---------------------------------------------------------------- targets */

function drawTarget(c, tg, t) {
  if (!tg) return;
  if (!tg.alive) {
    if (tg.pop > 0.3) return;
    c.save();
    c.globalAlpha = 1 - tg.pop / 0.3;
    c.translate(tg.x, tg.y);
    c.scale(1 + tg.pop * 3, 1 + tg.pop * 3);
    c.strokeStyle = "#fff";
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, tg.r, 0, TAU);
    c.stroke();
    c.restore();
    return;
  }
  c.save();
  if (tg.kind === "board") {
    c.fillStyle = "#7a4e2a";
    c.fillRect(tg.x - 5, tg.y, 10, 900);
  } else if (tg.kind === "high") {
    c.strokeStyle = "rgba(255,255,255,0.7)";
    c.lineWidth = 1.5;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(tg.x + s * 20, tg.y - tg.r + 4);
      c.lineTo(tg.x + s * 24, tg.y - tg.r - 42);
      c.stroke();
      c.fillStyle = s < 0 ? "#ff5d7a" : "#5dc8ff";
      c.beginPath();
      c.ellipse(tg.x + s * 24, tg.y - tg.r - 60, 15, 19, 0, 0, TAU);
      c.fill();
    }
  } else {
    c.strokeStyle = "rgba(255,255,255,0.7)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(tg.x, tg.y + tg.r);
    c.quadraticCurveTo(tg.x + 8, tg.y + tg.r + 30, tg.x, tg.y + tg.r + 60);
    c.stroke();
    const g = c.createRadialGradient(tg.x - 9, tg.y - 10, 3, tg.x, tg.y, tg.r * 1.2);
    g.addColorStop(0, "#ffb3c6");
    g.addColorStop(1, "#e2335f");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(tg.x, tg.y, tg.r, tg.r * 1.15, 0, 0, TAU);
    c.fill();
    c.fillStyle = "#e2335f";
    c.beginPath();
    c.moveTo(tg.x - 5, tg.y + tg.r * 1.15 + 6);
    c.lineTo(tg.x, tg.y + tg.r * 1.1);
    c.lineTo(tg.x + 5, tg.y + tg.r * 1.15 + 6);
    c.fill();
    star(c, tg.x, tg.y, 11, "rgba(255,255,255,0.85)");
    c.restore();
    return;
  }
  const rings = ["#ffffff", "#e74c3c", "#ffffff", "#e74c3c", "#ffd23f"];
  c.fillStyle = "#5a3a1e";
  c.beginPath();
  c.arc(tg.x, tg.y, tg.r + 4, 0, TAU);
  c.fill();
  rings.forEach((col, i) => {
    c.fillStyle = col;
    c.beginPath();
    c.arc(tg.x, tg.y, tg.r * (1 - i * 0.2), 0, TAU);
    c.fill();
  });
  c.restore();
}

/* ---------------------------------------------------------------- effects */

function drawParticles(c, b) {
  for (const q of b.particles) {
    const k = q.t / q.life;
    const a = 1 - k;
    switch (q.kind) {
      case "fire": {
        c.save();
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = a * 0.75;
        c.fillStyle = k < 0.2 ? "#ffd25a" : k < 0.55 ? "#ff8a2a" : "#e2401a";
        c.beginPath();
        c.arc(q.x, q.y, q.size * (1 - k * 0.5), 0, TAU);
        c.fill();
        c.restore();
        break;
      }
      case "smoke":
      case "dust":
        c.globalAlpha = a * (q.kind === "smoke" ? 0.5 : 0.7);
        c.fillStyle = q.color || "#999";
        c.beginPath();
        c.arc(q.x, q.y, q.size * (0.6 + k), 0, TAU);
        c.fill();
        break;
      case "spark":
        c.globalAlpha = a;
        c.strokeStyle = q.color || "#ffd35a";
        c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(q.x, q.y);
        c.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03);
        c.stroke();
        break;
      case "star":
        c.globalAlpha = a;
        star(c, q.x, q.y, q.size, q.color || "#ffe066");
        break;
      case "confetti":
        c.globalAlpha = Math.min(1, a * 2);
        c.save();
        c.translate(q.x, q.y);
        c.rotate(q.rot);
        c.fillStyle = q.color;
        c.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2);
        c.restore();
        break;
      case "shard":
      case "chip":
        c.globalAlpha = a;
        c.save();
        c.translate(q.x, q.y);
        c.rotate(q.rot);
        c.fillStyle = q.color || "#bbb";
        if (q.kind === "shard") {
          c.beginPath();
          c.moveTo(0, -q.size);
          c.lineTo(q.size * 0.5, 0);
          c.lineTo(0, q.size);
          c.lineTo(-q.size * 0.5, 0);
          c.fill();
        } else c.fillRect(-q.size / 2, -q.size / 2, q.size, q.size * 0.7);
        c.restore();
        break;
      case "glint":
        c.globalAlpha = a;
        c.fillStyle = q.color || "#fff";
        c.fillRect(q.x - q.size, q.y - 0.8, q.size * 2, 1.6);
        c.fillRect(q.x - 0.8, q.y - q.size, 1.6, q.size * 2);
        break;
      default:
        break;
    }
  }
  c.globalAlpha = 1;
  for (const r of b.rings) {
    const k = r.t / 0.45;
    c.globalAlpha = 1 - k;
    c.strokeStyle = r.color;
    c.lineWidth = 8 * (1 - k) + 1;
    c.beginPath();
    c.arc(r.x, r.y, r.r + (r.max - r.r) * Math.sqrt(k), 0, TAU);
    c.stroke();
  }
  c.globalAlpha = 1;
}

function drawTexts(c, b) {
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineJoin = "round";
  for (const t of b.texts) {
    const k = t.t / 1.3;
    const pop = t.t < 0.12 ? 0.6 + (t.t / 0.12) * 0.6 : t.t < 0.22 ? 1.2 - ((t.t - 0.12) / 0.1) * 0.2 : 1;
    c.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    c.save();
    c.translate(t.x, t.y);
    c.scale(pop, pop);
    c.font = `900 ${t.size}px "Inter", system-ui, sans-serif`;
    c.lineWidth = t.size * 0.18;
    c.strokeStyle = "rgba(30,15,40,0.9)";
    c.strokeText(t.text, 0, 0);
    c.fillStyle = t.color;
    c.fillText(t.text, 0, 0);
    if (t.sub) {
      c.font = `900 ${Math.round(t.size * 0.48)}px "Inter", system-ui, sans-serif`;
      c.lineWidth = 5;
      c.strokeText(t.sub, 0, -t.size * 0.78);
      c.fillStyle = "#ffdf3d";
      c.fillText(t.sub, 0, -t.size * 0.78);
    }
    c.restore();
  }
  c.globalAlpha = 1;
}

function trailColor(p) {
  if (p.skin?.glow) return p.skin.glow;
  return { fireball: "#ff9a3a", crystal: "#8ff3ff", bomb: "#c8c8d0", boomerang: "#ffe0a8" }[p.id] || "#ffffff";
}

function drawProjectiles(c, b, e) {
  for (const p of b.projectiles) {
    const tr = p.trail;
    if (tr.length > 4) {
      const col = trailColor(p);
      c.lineCap = "round";
      for (let i = 2; i < tr.length; i += 2) {
        const k = i / tr.length;
        c.globalAlpha = k * (p.id === "fireball" ? 0.55 : 0.35);
        c.strokeStyle = col;
        c.lineWidth = (p.id === "fireball" || p.id === "crystal" ? 14 : 6) * k;
        c.beginPath();
        c.moveTo(tr[i - 2], tr[i - 1]);
        c.lineTo(tr[i], tr[i + 1]);
        c.stroke();
      }
      c.globalAlpha = 1;
    }
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.id === "fireball" ? Math.atan2(p.vy, p.vx) : p.rot);
    drawWeapon(c, p.id, p.skin, b.time);
    c.restore();
    // off-screen marker for high lobs
    if (p.y < e.y0 + 10) {
      const x = clamp(p.x, e.x0 + 30, e.x1 - 30);
      const y = e.y0 + 26;
      c.fillStyle = "rgba(255,255,255,0.9)";
      c.beginPath();
      c.moveTo(x, y - 14);
      c.lineTo(x - 11, y + 4);
      c.lineTo(x + 11, y + 4);
      c.closePath();
      c.fill();
      c.font = '800 16px "Inter", system-ui, sans-serif';
      c.textAlign = "center";
      c.fillText(`${Math.round((e.y0 - p.y) / 10)}m`, x, y + 22);
    }
  }
}

function drawDecor(c, b) {
  for (const d of b.decor) {
    const a = d.t > d.life - 0.6 ? (d.life - d.t) / 0.6 : 1;
    c.globalAlpha = Math.max(0, a);
    c.save();
    if (d.on != null) {
      const f = b.fighters[d.on];
      c.translate(f.x + d.ox, f.y + d.oy);
    } else c.translate(d.x, d.y);
    c.rotate(d.rot);
    // pull pointy weapons back so they look embedded
    const back = { arrow: -14, spear: -30, axe: -8, knives: -6, shuriken: -4 }[d.id] || 0;
    c.translate(back, 0);
    drawWeapon(c, d.id, d.skin, 0);
    c.restore();
  }
  c.globalAlpha = 1;
}

/* ---------------------------------------------------------------- aim UI */

function drawAim(c, b, view) {
  const f = b.current;
  if (!f || b.phase !== "aim" || f.anim !== "aim" || f.aimPower <= 0.01) return;
  const o = launchOrigin(f);
  const a = (f.aimAngle * Math.PI) / 180;
  const dx = Math.cos(a) * f.dir;
  const dy = -Math.sin(a);
  const p = f.aimPower;
  const col = p < 0.5 ? `hsl(${120 - p * 80},85%,58%)` : `hsl(${80 - (p - 0.5) * 160},90%,58%)`;
  const human = f.human;
  c.globalAlpha = human ? 1 : 0.65;

  // preview dots
  const pts = human ? b.preview() : null;
  if (pts) {
    for (let i = 2; i < pts.length; i += 2) {
      c.fillStyle = `rgba(255,255,255,${0.85 - (i / pts.length) * 0.7})`;
      c.beginPath();
      c.arc(pts[i], pts[i + 1], 5 - (i / pts.length) * 2.5, 0, TAU);
      c.fill();
    }
  }
  // direction arrow
  const len = 70 + p * 120;
  c.strokeStyle = "rgba(0,0,0,0.35)";
  c.lineWidth = 12;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(o.x + dx * 30, o.y + dy * 30);
  c.lineTo(o.x + dx * len, o.y + dy * len);
  c.stroke();
  c.strokeStyle = col;
  c.lineWidth = 7;
  c.setLineDash([14, 10]);
  c.lineDashOffset = -b.time * 60;
  c.beginPath();
  c.moveTo(o.x + dx * 30, o.y + dy * 30);
  c.lineTo(o.x + dx * len, o.y + dy * len);
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = col;
  c.save();
  c.translate(o.x + dx * (len + 6), o.y + dy * (len + 6));
  c.rotate(Math.atan2(dy, dx));
  c.beginPath();
  c.moveTo(16, 0);
  c.lineTo(-8, -13);
  c.lineTo(-8, 13);
  c.closePath();
  c.fill();
  c.restore();

  // power ring around the shoulder
  const R = 58;
  c.lineWidth = 9;
  c.strokeStyle = "rgba(0,0,0,0.3)";
  c.beginPath();
  c.arc(o.x, o.y, R, 0, TAU);
  c.stroke();
  c.strokeStyle = col;
  c.beginPath();
  c.arc(o.x, o.y, R, -Math.PI / 2, -Math.PI / 2 + TAU * p);
  c.stroke();

  // labels
  const lx = o.x + dx * (len + 46);
  const ly = o.y + dy * (len + 46);
  c.font = '900 26px "Inter", system-ui, sans-serif';
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineWidth = 6;
  c.strokeStyle = "rgba(20,10,30,0.85)";
  const t1 = `${Math.round(p * 100)}%`;
  const t2 = `${Math.round(f.aimAngle)}°`;
  c.strokeText(t1, lx, ly - 13);
  c.fillStyle = "#fff";
  c.fillText(t1, lx, ly - 13);
  c.font = '800 19px "Inter", system-ui, sans-serif';
  c.strokeText(t2, lx, ly + 13);
  c.fillStyle = "#ffe27a";
  c.fillText(t2, lx, ly + 13);
  c.globalAlpha = 1;

  // rubber band from the press point (human)
  if (human && b.aim) {
    c.strokeStyle = "rgba(255,255,255,0.5)";
    c.lineWidth = 3;
    c.setLineDash([6, 8]);
    c.beginPath();
    c.moveTo(b.aim.sx, b.aim.sy);
    c.lineTo(b.aim.x, b.aim.y);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.beginPath();
    c.arc(b.aim.sx, b.aim.sy, 8, 0, TAU);
    c.fill();
    c.strokeStyle = col;
    c.lineWidth = 4;
    c.beginPath();
    c.arc(b.aim.x, b.aim.y, 16, 0, TAU);
    c.stroke();
  }
}

function drawTurnMarker(c, b) {
  if (b.phase !== "aim" || b.mode === "demo") return;
  const f = b.current;
  if (!f) return;
  const y = f.y - 190 * f.k + Math.sin(b.time * 5) * 6;
  c.fillStyle = f.side === 0 ? "#ffd23f" : "#ff6b8a";
  c.strokeStyle = "rgba(0,0,0,0.4)";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(f.x, y + 14);
  c.lineTo(f.x - 13, y - 6);
  c.lineTo(f.x + 13, y - 6);
  c.closePath();
  c.fill();
  c.stroke();
}

/* ---------------------------------------------------------------- frame */

export function draw(c, view, b, opts = {}) {
  if (!view.w) return;
  const t = b.time;
  const d = deco(b.arena);
  const shake = opts.shake === false ? 0 : b.shake;
  const shx = shake ? (Math.random() - 0.5) * shake * 1.4 : 0;
  const shy = shake ? (Math.random() - 0.5) * shake * 1.4 : 0;
  (BACKDROPS[b.arena] || BACKDROPS.meadow)(c, view, b.cam, t, d);

  const e = layer(c, view, b.cam, 1, shx, shy);
  drawGround(c, b, e, t);
  for (const o of b.world.obstacles) drawObstacle(c, o, b.arena, t);
  if (b.world.targets) for (const tg of b.world.targets) drawTarget(c, tg, t);
  drawDecor(c, b);

  for (const f of b.fighters) {
    c.save();
    c.translate(f.x, f.y);
    if (f.flash > 0 && view.filter) c.filter = "brightness(2.4) saturate(0.3)";
    drawFighter(c, f, t);
    c.restore();
  }
  drawTurnMarker(c, b);
  drawProjectiles(c, b, e);
  drawParticles(c, b);
  drawTexts(c, b);
  drawAim(c, b, view);

  // snowfall in front (screen-ish space, slight parallax)
  if (b.arena === "snow") {
    const e2 = layer(c, view, b.cam, 1.1);
    c.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 80; i++) {
      const x = ((i * 211 + t * (20 + (i % 5) * 8)) % (W + 400)) - 200 + Math.sin(t + i) * 12;
      const y = ((i * 97 + t * (50 + (i % 7) * 12)) % (H + 100)) - 50;
      if (x < e2.x0 || x > e2.x1) continue;
      c.beginPath();
      c.arc(x, y, 1.5 + (i % 3), 0, TAU);
      c.fill();
    }
  }

  // screen flash
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (b.flash > 0) {
    c.fillStyle = `rgba(255,255,255,${Math.min(0.35, b.flash)})`;
    c.fillRect(0, 0, view.w * view.dpr, view.h * view.dpr);
  }
  // vignette
  const vg = c.createRadialGradient(view.w * view.dpr / 2, view.h * view.dpr / 2, view.h * view.dpr * 0.4, view.w * view.dpr / 2, view.h * view.dpr / 2, view.w * view.dpr * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, b.arena === "city" ? "rgba(0,0,20,0.35)" : "rgba(0,0,0,0.18)");
  c.fillStyle = vg;
  c.fillRect(0, 0, view.w * view.dpr, view.h * view.dpr);
}

