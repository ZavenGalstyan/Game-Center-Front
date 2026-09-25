/**
 * Bottle Flip — environments (5 themes), drawn procedurally every frame.
 *
 * Layers, back to front:
 *   wall / sky          screen-space gradient
 *   far layer           par 0.55 (backyard hills, master shapes)
 *   wall layer          par WALL_PAR (windows, frames, bed, fridge …)
 *   floor               perspective band from the wall junction to the
 *                       screen bottom; plank seams connect the same x at
 *                       wall depth and at the gameplay plane
 *   props               par 1 (plants, rugs, lamp on the desk)
 *   — platforms, bottle, effects are drawn by the caller —
 *   foreground          par 1.25 (a leaf or two, high graphics only)
 *
 * Everything is deterministic from the level id (no Math.random), so a level
 * always looks the same.
 */
import { setWorld, setScreen } from "./view.js";
import { shade } from "./bottle.js";

export const WALL_PAR = 0.86;
const WALL_PAR_Y = 0.92;
const JUNCTION = 13; // wall/floor junction height on the wall layer

export const THEMES = {
  room: {
    wall: ["#f4e4cf", "#ead3b8"],
    stripe: "rgba(160,110,60,0.05)",
    floor: ["#c58d5d", "#a8703f"],
    seam: "rgba(70,35,10,0.25)",
    base: "#fbf5ec",
    accent: "#e39b7b",
    light: "rgba(255,214,150,",
  },
  kitchen: {
    wall: ["#eef4ee", "#dfe9e2"],
    stripe: "rgba(80,120,100,0.04)",
    floor: ["#e9e4dc", "#cfc7bb"],
    seam: "rgba(80,70,60,0.2)",
    base: "#ffffff",
    accent: "#7fb3c9",
    light: "rgba(255,240,200,",
    checker: true,
  },
  office: {
    wall: ["#e4e9f0", "#cfd8e3"],
    stripe: "rgba(40,60,90,0.035)",
    floor: ["#7d8aa0", "#5f6b80"],
    seam: "rgba(20,30,50,0.22)",
    base: "#eef2f7",
    accent: "#4f86c6",
    light: "rgba(220,235,255,",
    carpet: true,
  },
  backyard: {
    wall: ["#8fd3ff", "#d9f1ff"],
    floor: ["#7fc86a", "#5aa84a"],
    seam: "rgba(30,80,20,0.18)",
    base: "#c49a6c",
    accent: "#ffcf5a",
    light: "rgba(255,245,200,",
    outdoor: true,
  },
  master: {
    wall: ["#12142a", "#262a4f"],
    floor: ["#1a1d38", "#0f1124"],
    seam: "rgba(94,241,255,0.35)",
    base: "#2a2f55",
    accent: "#ff5fd2",
    light: "rgba(94,241,255,",
    neon: true,
  },
};

/* ------------------------------------------------------------------ utils */

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function rrect(ctx, x, y, w, h, r) {
  const k = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + k);
  ctx.lineTo(x + w, y + h - k);
  ctx.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  ctx.lineTo(x + k, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - k);
  ctx.lineTo(x, y + k);
  ctx.quadraticCurveTo(x, y, x + k, y);
  ctx.closePath();
}

function lin(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

/* ------------------------------------------------------ layout (per level) */

/**
 * Pre-computes where the wall decorations go for a level. Cached on the
 * level object; purely derived from level data.
 */
export function sceneLayout(level) {
  if (level._layout) return level._layout;
  const theme = level.theme || "room";
  const b = level.bounds;
  const span0 = b.x0 * WALL_PAR - 120;
  const span1 = b.x1 * WALL_PAR + 120;
  const items = [];
  const seed = level.id * 17;
  let x = span0 + 20 + hash(seed) * 40;
  let i = 0;
  const seq = {
    room: ["window", "frames", "shelfDecor", "frames", "window", "clock"],
    kitchen: ["uppers", "window", "uppers", "utensils", "fridge", "uppers"],
    office: ["window", "board", "clockOffice", "window", "posters", "window"],
    backyard: ["tree", "lights", "tree", "lights", "tree", "flag"],
    master: ["spot", "hoop", "spot", "hoop", "spot", "hoop"],
  }[theme];
  const off = level.id % seq.length;
  while (x < span1) {
    const kind = seq[(i + off) % seq.length];
    const w = { window: 70, frames: 60, shelfDecor: 55, clock: 30, uppers: 90, utensils: 40, fridge: 50, board: 80, clockOffice: 30, posters: 55, tree: 70, lights: 110, flag: 30, spot: 80, hoop: 60 }[kind];
    items.push({ kind, x, w, r: hash(seed + i * 3.3) });
    x += w + 35 + hash(seed + i * 7.1) * 45;
    i += 1;
  }
  // a bed in the bedroom levels, a sofa in some later room levels
  const big = [];
  if (theme === "room" && level.bed !== false) {
    const bx = (level.bedX ?? (b.x0 + b.x1) / 2) * WALL_PAR;
    big.push({ kind: "bed", x: bx, w: 150 });
  }
  level._layout = { theme, items, big };
  return level._layout;
}

/* ------------------------------------------------------------- wall items */

function drawWindow(ctx, it, th, time, theme) {
  const x = it.x;
  const w = it.w;
  const y0 = 105;
  const h = 78;
  // frame shadow
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  rrect(ctx, x - 3, y0 - 6, w + 6, h + 8, 2);
  ctx.fill();
  // sky
  const night = theme === "office" && it.r > 0.8;
  ctx.fillStyle = lin(ctx, 0, y0, 0, y0 + h, night ? [[0, "#27324f"], [1, "#4b5d86"]] : [[0, "#bfe4ff"], [1, "#7cc2f2"]]);
  ctx.fillRect(x, y0, w, h);
  if (theme === "office") {
    // city skyline
    ctx.fillStyle = night ? "#1a2238" : "#8fb2d0";
    for (let i = 0; i < 7; i++) {
      const bw = w / 7;
      const bh = 18 + hash(it.x + i) * 38;
      ctx.fillRect(x + i * bw, y0, bw - 1, bh);
    }
    // blinds
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let yy = y0 + h - 4; yy > y0 + h * 0.55; yy -= 4) ctx.fillRect(x, yy, w, 1.4);
  } else {
    // soft clouds
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const cx = x + ((time * 1.5 + it.r * 60) % (w + 30)) - 15;
    for (const [dx, dy, r] of [[0, 0, 6], [7, 2, 7], [14, 0, 5]]) {
      ctx.beginPath();
      ctx.arc(cx + dx, y0 + h * 0.62 + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // distant green
    ctx.fillStyle = "#8fcf8a";
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.quadraticCurveTo(x + w * 0.4, y0 + 20, x + w, y0 + 8);
    ctx.lineTo(x + w, y0);
    ctx.closePath();
    ctx.fill();
  }
  // glass sheen
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.1, y0 + h);
  ctx.lineTo(x + w * 0.35, y0 + h);
  ctx.lineTo(x + w * 0.15, y0);
  ctx.lineTo(x - w * 0.1 + 6, y0);
  ctx.closePath();
  ctx.fill();
  // frame + mullions
  ctx.strokeStyle = th.base;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y0, w, h);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y0);
  ctx.lineTo(x + w / 2, y0 + h);
  ctx.moveTo(x, y0 + h * 0.55);
  ctx.lineTo(x + w, y0 + h * 0.55);
  ctx.stroke();
  // sill
  ctx.fillStyle = shade(th.base, -0.08);
  rrect(ctx, x - 5, y0 - 4, w + 10, 4, 1);
  ctx.fill();
  if (theme === "room") {
    // curtains with folds
    for (const side of [-1, 1]) {
      const cx0 = side < 0 ? x - 12 : x + w - 6;
      ctx.fillStyle = lin(ctx, cx0, 0, cx0 + 18, 0, [
        [0, shade(th.accent, -0.15)],
        [0.3, th.accent],
        [0.55, shade(th.accent, -0.2)],
        [0.8, shade(th.accent, 0.1)],
        [1, shade(th.accent, -0.15)],
      ]);
      ctx.beginPath();
      ctx.moveTo(cx0, y0 + h + 10);
      ctx.lineTo(cx0 + 18, y0 + h + 10);
      ctx.quadraticCurveTo(cx0 + 13 + side * 2, y0 + h * 0.4, cx0 + 16, y0 - 12);
      ctx.lineTo(cx0 + 2, y0 - 12);
      ctx.quadraticCurveTo(cx0 + 5 - side * 2, y0 + h * 0.4, cx0, y0 + h + 10);
      ctx.fill();
    }
    ctx.fillStyle = "#8b6a4f";
    ctx.fillRect(x - 16, y0 + h + 9, w + 32, 2);
  }
}

function drawFrames(ctx, it) {
  const arts = [
    (x, y, w, h) => {
      ctx.fillStyle = "#f6d9a8";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#e58f65";
      ctx.beginPath();
      ctx.arc(x + w * 0.65, y + h * 0.62, h * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7aa97c";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.55, x + w * 0.6, y + h * 0.2);
      ctx.quadraticCurveTo(x + w * 0.8, y + h * 0.05, x + w, y + h * 0.3);
      ctx.lineTo(x + w, y);
      ctx.fill();
    },
    (x, y, w, h) => {
      ctx.fillStyle = "#dfe8f1";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#4f86c6";
      ctx.fillRect(x + w * 0.15, y + h * 0.2, w * 0.3, h * 0.6);
      ctx.fillStyle = "#f2c14e";
      ctx.beginPath();
      ctx.arc(x + w * 0.66, y + h * 0.4, w * 0.18, 0, Math.PI * 2);
      ctx.fill();
    },
    (x, y, w, h) => {
      ctx.fillStyle = "#2f3b4c";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#f6d9a8";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, 0.3, Math.PI * 1.7);
      ctx.stroke();
    },
  ];
  const frames = [
    [it.x, 128, 26, 34],
    [it.x + 32, 140, 24, 20],
    [it.x + 32, 118, 24, 16],
  ];
  frames.forEach(([x, y, w, h], i) => {
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(x - 1.5, y - 2.5, w + 3, h + 3);
    ctx.fillStyle = i === 0 ? "#b98252" : "#f8f4ec";
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    arts[(i + Math.floor(it.r * 3)) % 3](x, y, w, h);
  });
}

function drawShelfDecor(ctx, it, th) {
  const y = 132;
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  ctx.fillRect(it.x, y - 3.5, it.w, 2);
  ctx.fillStyle = "#b98252";
  rrect(ctx, it.x, y - 2, it.w, 3, 0.6);
  ctx.fill();
  // small items: plant, books, vase
  let x = it.x + 5;
  const cols = ["#e2574c", "#4f86c6", "#f2c14e", "#57a773"];
  for (let i = 0; i < 4; i++) {
    const h = 10 + ((i * 7) % 5);
    ctx.fillStyle = cols[i];
    ctx.fillRect(x, y + 1, 3, h);
    x += 3.4;
  }
  ctx.fillStyle = "#d9c7b0";
  rrect(ctx, x + 6, y + 1, 7, 7, 2);
  ctx.fill();
  ctx.fillStyle = "#5c9e62";
  for (let k = 0; k < 5; k++) {
    ctx.beginPath();
    ctx.ellipse(x + 9.5 + (k - 2) * 2, y + 11 + (k % 2) * 2, 1.6, 4, (k - 2) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = th.accent;
  rrect(ctx, x + 22, y + 1, 6, 11, 3);
  ctx.fill();
}

function drawClock(ctx, it, time, office) {
  const x = it.x + 15;
  const y = office ? 165 : 150;
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  ctx.beginPath();
  ctx.arc(x + 0.8, y - 1.2, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = office ? "#2f3b4c" : "#b98252";
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fbf8f2";
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineCap = "round";
  const hands = [
    [time * 0.02, 5, 1.1],
    [time * 0.25, 7.5, 0.7],
  ];
  for (const [a, l, lw] of hands) {
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.sin(a) * l, y + Math.cos(a) * l);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

function drawBed(ctx, it) {
  const x = it.x;
  const w = it.w;
  // headboard
  ctx.fillStyle = lin(ctx, 0, JUNCTION, 0, JUNCTION + 75, [[0, "#8e5e3b"], [1, "#b17a4f"]]);
  rrect(ctx, x, JUNCTION, 14, 78, 3);
  ctx.fill();
  // mattress & blanket
  ctx.fillStyle = "#f7f3ee";
  rrect(ctx, x + 10, JUNCTION + 20, w - 14, 20, 4);
  ctx.fill();
  ctx.fillStyle = lin(ctx, 0, JUNCTION + 16, 0, JUNCTION + 38, [[0, "#8fb3d9"], [1, "#6a93c4"]]);
  rrect(ctx, x + 42, JUNCTION + 16, w - 44, 26, 5);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 0.8;
  for (let k = 1; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(x + 42 + k * ((w - 44) / 4), JUNCTION + 17);
    ctx.lineTo(x + 42 + k * ((w - 44) / 4), JUNCTION + 41);
    ctx.stroke();
  }
  // pillows
  ctx.fillStyle = "#ffffff";
  rrect(ctx, x + 15, JUNCTION + 38, 26, 10, 4);
  ctx.fill();
  ctx.fillStyle = "#f3d7c4";
  rrect(ctx, x + 18, JUNCTION + 36, 20, 9, 4);
  ctx.fill();
  // frame
  ctx.fillStyle = "#8e5e3b";
  ctx.fillRect(x + 8, JUNCTION, w - 8, 20);
  ctx.fillStyle = "#6f4529";
  ctx.fillRect(x + w - 6, JUNCTION, 6, 34);
}

function drawUppers(ctx, it, th) {
  const y0 = 150;
  const h = 55;
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.fillRect(it.x - 1, y0 - 3, it.w + 2, h + 3);
  const n = Math.max(2, Math.round(it.w / 30));
  const dw = it.w / n;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = lin(ctx, 0, y0, 0, y0 + h, [[0, "#ffffff"], [1, "#eceae4"]]);
    rrect(ctx, it.x + i * dw + 0.5, y0, dw - 1, h, 1);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.1)";
    ctx.lineWidth = 0.4;
    ctx.stroke();
    ctx.fillStyle = "#a9b2bd";
    rrect(ctx, it.x + i * dw + (i % 2 ? 3 : dw - 5), y0 + 4, 1.4, 8, 0.6);
    ctx.fill();
  }
  // backsplash tiles under the cabinet
  ctx.strokeStyle = "rgba(90,130,120,0.16)";
  ctx.lineWidth = 0.4;
  for (let yy = 96; yy < y0 - 4; yy += 6) {
    ctx.beginPath();
    ctx.moveTo(it.x - 8, yy);
    ctx.lineTo(it.x + it.w + 8, yy);
    ctx.stroke();
    for (let xx = it.x - 8 + ((yy / 6) % 2) * 6; xx < it.x + it.w + 8; xx += 12) {
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx, yy + 6);
      ctx.stroke();
    }
  }
  void th;
}

function drawUtensils(ctx, it) {
  const y = 150;
  ctx.fillStyle = "#9aa4af";
  ctx.fillRect(it.x, y, it.w, 1.4);
  const tools = ["#c0c7cf", "#e2574c", "#c0c7cf", "#b98252", "#c0c7cf"];
  tools.forEach((c, i) => {
    const x = it.x + 4 + i * 8;
    ctx.fillStyle = "#6b7480";
    ctx.fillRect(x - 0.3, y - 3, 0.6, 3);
    ctx.fillStyle = c;
    rrect(ctx, x - 1, y - 18, 2, 15, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y - 20, i % 2 ? 2.4 : 1.6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawFridge(ctx, it) {
  const x = it.x;
  ctx.fillStyle = lin(ctx, x, 0, x + 50, 0, [[0, "#d6dde4"], [0.5, "#f4f7fa"], [1, "#c9d1da"]]);
  rrect(ctx, x, JUNCTION, 50, 170, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(x, JUNCTION + 110);
  ctx.lineTo(x + 50, JUNCTION + 110);
  ctx.stroke();
  ctx.fillStyle = "#9aa4af";
  rrect(ctx, x + 42, JUNCTION + 118, 2, 26, 1);
  ctx.fill();
  rrect(ctx, x + 42, JUNCTION + 70, 2, 30, 1);
  ctx.fill();
  // magnets / note
  ctx.fillStyle = "#fff6b8";
  ctx.fillRect(x + 12, JUNCTION + 125, 12, 14);
  ctx.fillStyle = "#e2574c";
  ctx.beginPath();
  ctx.arc(x + 18, JUNCTION + 139, 1.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawBoard(ctx, it) {
  const y0 = 110;
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  ctx.fillRect(it.x - 2, y0 - 4, it.w + 4, 58);
  ctx.fillStyle = "#c9d1da";
  ctx.fillRect(it.x - 2, y0 - 2, it.w + 4, 56);
  ctx.fillStyle = "#fbfdff";
  ctx.fillRect(it.x, y0, it.w, 52);
  ctx.strokeStyle = "#4f86c6";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(it.x + 8, y0 + 12);
  ctx.lineTo(it.x + 22, y0 + 28);
  ctx.lineTo(it.x + 36, y0 + 20);
  ctx.lineTo(it.x + 50, y0 + 38);
  ctx.stroke();
  ctx.strokeStyle = "#e2574c";
  ctx.beginPath();
  ctx.arc(it.x + 62, y0 + 32, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(47,59,76,0.5)";
  for (let k = 0; k < 3; k++) ctx.fillRect(it.x + 8, y0 + 44 - k * 4, 26 - k * 6, 1);
}

function drawPosters(ctx, it) {
  const cols = [["#4f86c6", "#f2c14e"], ["#57a773", "#ffffff"]];
  cols.forEach(([a, b], i) => {
    const x = it.x + i * 30;
    const y = 120 + i * 8;
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    ctx.fillRect(x + 1, y - 2, 24, 32);
    ctx.fillStyle = a;
    ctx.fillRect(x, y, 24, 32);
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 6);
    ctx.lineTo(x + 20, y + 6);
    ctx.lineTo(x + 12, y + 22);
    ctx.closePath();
    ctx.fill();
  });
}

function drawTree(ctx, it, time) {
  const x = it.x + it.w / 2;
  ctx.fillStyle = "#7a5334";
  ctx.fillRect(x - 3, JUNCTION, 6, 60);
  const sway = Math.sin(time * 0.8 + it.r * 6) * 1.5;
  const greens = ["#4f9e4a", "#5fb357", "#3f8a3d"];
  const blobs = [[0, 80, 26], [-18, 66, 18], [18, 64, 20], [-8, 96, 18], [12, 92, 16]];
  blobs.forEach(([dx, dy, r], i) => {
    ctx.fillStyle = greens[i % 3];
    ctx.beginPath();
    ctx.arc(x + dx + sway * (dy / 90), JUNCTION + dy, r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawLights(ctx, it, time) {
  const x0 = it.x;
  const x1 = it.x + it.w;
  const y = 150;
  ctx.strokeStyle = "rgba(40,40,40,0.6)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.quadraticCurveTo((x0 + x1) / 2, y - 22, x1, y);
  ctx.stroke();
  const cols = ["#ffd36a", "#ff8f6a", "#7fe0ff", "#b6ff8a"];
  for (let k = 1; k < 9; k++) {
    const t = k / 9;
    const px = x0 + (x1 - x0) * t;
    const py = y - 22 * 2 * t * (1 - t) * 1 - 3;
    const c = cols[k % 4];
    const tw = 0.6 + 0.4 * Math.sin(time * 2 + k);
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.35 * tw;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(px, py, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSpot(ctx, it, time) {
  const x = it.x + it.w / 2;
  const sw = Math.sin(time * 0.5 + it.r * 5) * 20;
  ctx.fillStyle = lin(ctx, 0, 240, 0, JUNCTION, [[0, "rgba(94,241,255,0.22)"], [1, "rgba(94,241,255,0)"]]);
  ctx.beginPath();
  ctx.moveTo(x - 3, 240);
  ctx.lineTo(x + 3, 240);
  ctx.lineTo(x + sw + 30, JUNCTION);
  ctx.lineTo(x + sw - 30, JUNCTION);
  ctx.closePath();
  ctx.fill();
}

function drawHoop(ctx, it, time) {
  const x = it.x + it.w / 2;
  const y = 120 + Math.sin(time * 0.7 + it.r * 4) * 6;
  ctx.strokeStyle = it.r > 0.5 ? "rgba(255,95,210,0.55)" : "rgba(94,241,255,0.5)";
  ctx.lineWidth = 1.4;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  if (it.r > 0.66) ctx.arc(x, y, 14, 0, Math.PI * 2);
  else if (it.r > 0.33) {
    ctx.moveTo(x, y + 16);
    ctx.lineTo(x + 14, y - 8);
    ctx.lineTo(x - 14, y - 8);
    ctx.closePath();
  } else ctx.rect(x - 12, y - 12, 24, 24);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawFlag(ctx, it, time, wind) {
  const x = it.x + 10;
  ctx.fillStyle = "#e9e3d7";
  ctx.fillRect(x - 0.8, JUNCTION, 1.6, 80);
  const dir = wind >= 0 ? 1 : -1;
  const str = Math.min(1, Math.abs(wind) / 120);
  ctx.fillStyle = "#e45f4f";
  ctx.beginPath();
  ctx.moveTo(x, JUNCTION + 80);
  const len = 16 + 6 * str;
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    ctx.lineTo(x + dir * len * t, JUNCTION + 80 - t * (6 - 5 * str) + Math.sin(time * (4 + str * 6) + t * 5) * (1 + str) * t);
  }
  for (let k = 8; k >= 0; k--) {
    const t = k / 8;
    ctx.lineTo(x + dir * len * t, JUNCTION + 69 - t * (6 - 5 * str) + Math.sin(time * (4 + str * 6) + t * 5 + 0.4) * (1 + str) * t);
  }
  ctx.closePath();
  ctx.fill();
}

/* ------------------------------------------------------------------ floor */

function floorBand(ctx, v, th, level, q) {
  // screen ys of the junction (wall layer) and the gameplay floor line
  const jy = v.H / 2 - (JUNCTION - v.cy * WALL_PAR_Y) * v.s;
  const fy = v.H / 2 - (0 - v.cy) * v.s;
  if (jy >= v.H) return;
  setScreen(ctx, v);
  const g = ctx.createLinearGradient(0, jy, 0, v.H);
  g.addColorStop(0, shade(th.floor[1], -0.15));
  g.addColorStop(Math.max(0.01, Math.min(0.99, (fy - jy) / Math.max(1, v.H - jy))), th.floor[0]);
  g.addColorStop(1, shade(th.floor[0], 0.08));
  ctx.fillStyle = g;
  ctx.fillRect(0, jy, v.W, v.H - jy);

  const depthY = (d) => jy + (fy - jy) * d;
  const depthX = (x, d) => {
    const par = WALL_PAR + (1 - WALL_PAR) * d;
    return v.W / 2 + (x - v.cx * par) * v.s;
  };
  // rows (perspective spacing)
  const rows = [0, 0.18, 0.38, 0.6, 0.85, 1.14, 1.5, 1.95, 2.5, 3.2, 4.1];
  const maxD = (v.H - jy) / Math.max(1, fy - jy);
  ctx.strokeStyle = th.seam;
  ctx.lineWidth = Math.max(0.6, v.s * 0.25);
  if (th.outdoor) {
    // grass tufts + patio stones instead of seams
    for (let r = 1; r < rows.length && rows[r - 1] < maxD; r++) {
      const d = rows[r];
      const y = depthY(d);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(0, y, v.W, 1);
    }
    const stoneY = depthY(1.05);
    const stoneY2 = depthY(1.5);
    ctx.fillStyle = "rgba(210,200,180,0.55)";
    for (let x = Math.floor((v.cx - 400) / 40) * 40; x < v.cx + 400; x += 40) {
      const a = depthX(x + 4, 1.05);
      const b = depthX(x + 34, 1.05);
      const c = depthX(x + 34, 1.5);
      const d = depthX(x + 4, 1.5);
      ctx.beginPath();
      ctx.moveTo(a, stoneY);
      ctx.lineTo(b, stoneY);
      ctx.lineTo(c, stoneY2);
      ctx.lineTo(d, stoneY2);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }
  const plank = th.checker ? 24 : th.carpet ? 40 : 60;
  for (let r = 1; r < rows.length; r++) {
    const d0 = rows[r - 1];
    const d1 = rows[r];
    if (d0 > maxD) break;
    const y0 = depthY(d0);
    const y1 = depthY(d1);
    if (!th.carpet) {
      ctx.beginPath();
      ctx.moveTo(0, y1);
      ctx.lineTo(v.W, y1);
      ctx.stroke();
    }
    const visHalf = v.W / 2 / v.s + 80;
    const off = (r % 2) * plank * 0.5;
    const start = Math.floor((v.cx - visHalf) / plank) * plank;
    for (let x = start + off; x < v.cx + visHalf; x += plank) {
      if (th.checker) {
        if ((Math.round((x - off) / plank) + r) % 2 === 0) {
          ctx.fillStyle = "rgba(60,70,80,0.1)";
          ctx.beginPath();
          ctx.moveTo(depthX(x, d0), y0);
          ctx.lineTo(depthX(x + plank, d0), y0);
          ctx.lineTo(depthX(x + plank, d1), y1);
          ctx.lineTo(depthX(x, d1), y1);
          ctx.closePath();
          ctx.fill();
        }
        continue;
      }
      if (th.carpet) continue;
      ctx.beginPath();
      ctx.moveTo(depthX(x, d0), y0);
      ctx.lineTo(depthX(x, d1), y1);
      ctx.stroke();
    }
  }
  if (th.neon) {
    ctx.strokeStyle = "rgba(94,241,255,0.35)";
    ctx.lineWidth = 1;
    const visHalf = v.W / 2 / v.s + 200;
    for (let x = Math.floor((v.cx - visHalf) / 30) * 30; x < v.cx + visHalf; x += 30) {
      ctx.beginPath();
      ctx.moveTo(depthX(x, 0), depthY(0));
      ctx.lineTo(depthX(x, maxD), depthY(maxD));
      ctx.stroke();
    }
  }
  if (th.carpet && q !== "low") {
    // carpet tile checker, very subtle
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    for (let r = 1; r < rows.length; r++) {
      if (rows[r - 1] > maxD) break;
      const y0 = depthY(rows[r - 1]);
      const y1 = depthY(rows[r]);
      if (r % 2) ctx.fillRect(0, y0, v.W, y1 - y0);
    }
  }
  // baseboard shadow line
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(0, jy, v.W, Math.max(1, v.s * 0.8));
  void level;
}

/* --------------------------------------------------------------- props */

function drawPlant(ctx, x, y, s, time, green = "#4f9e4a") {
  ctx.fillStyle = lin(ctx, x - 6 * s, 0, x + 6 * s, 0, [[0, "#b8643f"], [0.5, "#d9825a"], [1, "#a8573a"]]);
  ctx.beginPath();
  ctx.moveTo(x - 6 * s, y + 12 * s);
  ctx.lineTo(x + 6 * s, y + 12 * s);
  ctx.lineTo(x + 4.6 * s, y);
  ctx.lineTo(x - 4.6 * s, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#8f4a2c";
  ctx.fillRect(x - 6.5 * s, y + 10.5 * s, 13 * s, 2 * s);
  const sway = Math.sin(time * 0.9 + x) * 0.05;
  for (let k = 0; k < 7; k++) {
    const a = -1.1 + k * 0.37 + sway;
    ctx.fillStyle = k % 2 ? green : shade(green, 0.15);
    ctx.save();
    ctx.translate(x, y + 11 * s);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, 11 * s, 2.6 * s, 10 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawLamp(ctx, x, y, time, on = true) {
  if (on) {
    const g = ctx.createRadialGradient(x, y + 26, 2, x, y + 26, 55);
    g.addColorStop(0, "rgba(255,214,150,0.35)");
    g.addColorStop(1, "rgba(255,214,150,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y + 26, 55, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#3a3f4a";
  rrect(ctx, x - 5, y, 10, 2.2, 1);
  ctx.fill();
  ctx.strokeStyle = "#3a3f4a";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(x, y + 2);
  ctx.lineTo(x - 3, y + 16);
  ctx.lineTo(x + 3, y + 26);
  ctx.stroke();
  ctx.fillStyle = lin(ctx, x - 8, 0, x + 8, 0, [[0, "#f0b37a"], [0.5, "#ffd9a8"], [1, "#e39b6b"]]);
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 32);
  ctx.lineTo(x + 5, y + 32);
  ctx.lineTo(x + 9, y + 22);
  ctx.lineTo(x - 8, y + 22);
  ctx.closePath();
  ctx.fill();
  void time;
}

function drawMiniBooks(ctx, x, y) {
  const cols = ["#4f86c6", "#e2574c", "#f2c14e"];
  cols.forEach((c, i) => {
    ctx.fillStyle = c;
    rrect(ctx, x + i * 0.6, y + i * 2.4, 16 - i * 2, 2.3, 0.4);
    ctx.fill();
  });
}

function drawMug(ctx, x, y, c = "#e2574c") {
  ctx.fillStyle = c;
  rrect(ctx, x, y, 5, 6, 1);
  ctx.fill();
  ctx.strokeStyle = c;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(x + 5.3, y + 3, 1.6, -1.2, 1.2);
  ctx.stroke();
}

function drawRug(ctx, v, x0, x1, d0, d1, color) {
  const jy = v.H / 2 - (JUNCTION - v.cy * WALL_PAR_Y) * v.s;
  const fy = v.H / 2 - (0 - v.cy) * v.s;
  const depthY = (d) => jy + (fy - jy) * d;
  const depthX = (x, d) => v.W / 2 + (x - v.cx * (WALL_PAR + (1 - WALL_PAR) * d)) * v.s;
  setScreen(ctx, v);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(depthX(x0, d0), depthY(d0));
  ctx.lineTo(depthX(x1, d0), depthY(d0));
  ctx.lineTo(depthX(x1, d1), depthY(d1));
  ctx.lineTo(depthX(x0, d1), depthY(d1));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = Math.max(1, v.s * 0.6);
  const m = 0.12;
  ctx.beginPath();
  ctx.moveTo(depthX(x0 + 6, d0 + m), depthY(d0 + m));
  ctx.lineTo(depthX(x1 - 6, d0 + m), depthY(d0 + m));
  ctx.lineTo(depthX(x1 - 6, d1 - m), depthY(d1 - m));
  ctx.lineTo(depthX(x0 + 6, d1 - m), depthY(d1 - m));
  ctx.closePath();
  ctx.stroke();
}

/* ------------------------------------------------------------- main entry */

export function drawBackdrop(ctx, v, level, time, q) {
  const layout = sceneLayout(level);
  const th = THEMES[layout.theme];
  setScreen(ctx, v);
  // wall / sky
  const g = ctx.createLinearGradient(0, 0, 0, v.H);
  g.addColorStop(0, th.wall[0]);
  g.addColorStop(1, th.wall[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.W, v.H);

  if (th.outdoor) {
    // sun + clouds + hills (far layer)
    setWorld(ctx, v, 0.4, 0.6);
    const sx = level.bounds.x0 * 0.4 + 60;
    const sun = ctx.createRadialGradient(sx, 220, 2, sx, 220, 60);
    sun.addColorStop(0, "rgba(255,244,200,1)");
    sun.addColorStop(0.25, "rgba(255,236,170,0.8)");
    sun.addColorStop(1, "rgba(255,236,170,0)");
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(sx, 220, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (let k = 0; k < 6; k++) {
      const cx = level.bounds.x0 * 0.4 + ((k * 97 + time * (3 + k)) % 600) - 50;
      const cy = 190 + (k % 3) * 18;
      for (const [dx, dy, r] of [[0, 0, 9], [10, 3, 11], [21, 0, 8]]) {
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    setWorld(ctx, v, 0.6, 0.75);
    ctx.fillStyle = "#9fd39a";
    ctx.beginPath();
    ctx.moveTo(level.bounds.x0 * 0.6 - 400, JUNCTION);
    for (let x = level.bounds.x0 * 0.6 - 400; x < level.bounds.x1 * 0.6 + 400; x += 40) {
      ctx.lineTo(x, JUNCTION + 40 + Math.sin(x * 0.013) * 16 + Math.sin(x * 0.041) * 6);
    }
    ctx.lineTo(level.bounds.x1 * 0.6 + 400, JUNCTION);
    ctx.fill();
  } else if (th.neon) {
    setScreen(ctx, v);
    // star specks
    for (let k = 0; k < 40; k++) {
      const x = (hash(k) * v.W * 1.4 - v.cx * 0.2 * v.s) % v.W;
      const y = hash(k + 99) * v.H * 0.6;
      ctx.fillStyle = `rgba(200,220,255,${0.2 + 0.3 * hash(k + 5)})`;
      ctx.fillRect((x + v.W) % v.W, y, 1.5, 1.5);
    }
  }

  // wall layer
  setWorld(ctx, v, WALL_PAR, WALL_PAR_Y);
  if (!th.outdoor && !th.neon && q !== "low") {
    // wallpaper stripes
    ctx.fillStyle = th.stripe;
    const x0 = v.cx * WALL_PAR - v.W / v.s;
    for (let x = Math.floor(x0 / 12) * 12; x < x0 + (v.W / v.s) * 2; x += 12) ctx.fillRect(x, JUNCTION, 4, 300);
  }
  if (th.outdoor) {
    // fence
    ctx.fillStyle = "#c49a6c";
    const x0 = Math.floor((v.cx * WALL_PAR - v.W / v.s) / 12) * 12;
    for (let x = x0; x < x0 + (v.W / v.s) * 2 + 24; x += 12) {
      ctx.fillStyle = (x / 12) % 2 ? "#c49a6c" : "#b98d5f";
      ctx.beginPath();
      ctx.moveTo(x, JUNCTION);
      ctx.lineTo(x + 10.5, JUNCTION);
      ctx.lineTo(x + 10.5, JUNCTION + 52);
      ctx.lineTo(x + 5.25, JUNCTION + 56);
      ctx.lineTo(x, JUNCTION + 52);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#a57a4e";
    ctx.fillRect(x0, JUNCTION + 12, (v.W / v.s) * 2 + 24, 3);
    ctx.fillRect(x0, JUNCTION + 40, (v.W / v.s) * 2 + 24, 3);
  }
  for (const it of layout.items) {
    switch (it.kind) {
      case "window":
        drawWindow(ctx, it, th, time, layout.theme);
        break;
      case "frames":
        drawFrames(ctx, it);
        break;
      case "shelfDecor":
        drawShelfDecor(ctx, it, th);
        break;
      case "clock":
        drawClock(ctx, it, time, false);
        break;
      case "clockOffice":
        drawClock(ctx, it, time, true);
        break;
      case "uppers":
        drawUppers(ctx, it, th);
        break;
      case "utensils":
        drawUtensils(ctx, it);
        break;
      case "fridge":
        drawFridge(ctx, it);
        break;
      case "board":
        drawBoard(ctx, it);
        break;
      case "posters":
        drawPosters(ctx, it);
        break;
      case "tree":
        drawTree(ctx, it, time);
        break;
      case "lights":
        drawLights(ctx, it, time);
        break;
      case "flag":
        drawFlag(ctx, it, time, level.wind || 0);
        break;
      case "spot":
        if (q !== "low") drawSpot(ctx, it, time);
        break;
      case "hoop":
        drawHoop(ctx, it, time);
        break;
      default:
        break;
    }
  }
  for (const bg of layout.big) if (bg.kind === "bed") drawBed(ctx, bg);
  if (!th.outdoor && !th.neon) {
    // baseboard
    ctx.fillStyle = th.base;
    ctx.fillRect(v.cx * WALL_PAR - v.W / v.s, JUNCTION, (v.W / v.s) * 2, 6);
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(v.cx * WALL_PAR - v.W / v.s, JUNCTION + 6, (v.W / v.s) * 2, 0.8);
  }
  floorBand(ctx, v, th, level, q);

  // floor props (rugs under, plants, …)
  for (const pr of level.props || []) {
    if (pr.kind === "rug") drawRug(ctx, v, pr.x, pr.x + pr.w, 0.35, 1.35, pr.color || "#c9785f");
  }
  setWorld(ctx, v, 1);
  for (const pr of level.props || []) {
    if (pr.kind === "plant") drawPlant(ctx, pr.x, pr.y ?? 1, pr.s ?? 1.4, time, pr.color);
  }
}

/** Items that sit on platform tops (behind the bottle plane). */
export function drawPlatformDecor(ctx, level, offsets, time) {
  level.platforms.forEach((p, i) => {
    if (!p.decor) return;
    const o = offsets[i];
    const x0 = p.x + o.dx;
    const top = p.top + o.dy + 2.2; // back half of the top face
    for (const d of p.decor) {
      const x = x0 + (d.at ?? 0.1) * p.w;
      if (d.kind === "lamp") drawLamp(ctx, x, top, time);
      else if (d.kind === "books") drawMiniBooks(ctx, x, top);
      else if (d.kind === "plant") drawPlant(ctx, x, top, 0.7, time);
      else if (d.kind === "mug") drawMug(ctx, x, top, d.color);
    }
  });
}

/** Foreground depth (high graphics): a soft blurred leaf in a corner. */
export function drawForeground(ctx, v, level, time, q) {
  if (q !== "high") return;
  const th = THEMES[level.theme || "room"];
  if (th.neon) return;
  setWorld(ctx, v, 1.25, 1.1);
  const x = level.bounds.x0 * 1.25 - 10;
  // soft out-of-focus leaves: radial fills instead of a (slow) blur filter
  const col = th.outdoor ? "63,127,58" : "61,122,69";
  for (let k = 0; k < 4; k++) {
    ctx.save();
    ctx.translate(x, -30);
    ctx.rotate(-0.5 + k * 0.28 + Math.sin(time * 0.6 + k) * 0.03);
    ctx.scale(1, 5);
    const g = ctx.createRadialGradient(0, 6, 0, 0, 6, 7);
    g.addColorStop(0, `rgba(${col},0.55)`);
    g.addColorStop(0.7, `rgba(${col},0.4)`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 6, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
