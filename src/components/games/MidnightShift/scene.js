/**
 * Midnight Shift — 2.5D canvas renderer.
 *
 * Static art (the office, both lit hallways, the blast doors and the eight
 * camera rooms) is painted procedurally ONCE into offscreen canvases by
 * buildArt(); render() then composites those layers each frame with the
 * dynamic bits: door positions, light pools, robots, fan, static, power-out
 * darkness and the jumpscare. Virtual resolution is 1280×720.
 */
import { buildSprites, blitRobot, drawRobot, EYES, HEAD } from "./robots.js";
import { DOOR_NODE, JUMPSCARE_SECONDS } from "./data.js";

export const VW = 1280, VH = 720;
export const OW = 1360; // office art is wider than the view for mouse parallax
export const PAR = (OW - VW) / 2; // max offset each side (centre = PAR)
export const DOORWAY = {
  L: { x: 46, y: 150, w: 206, h: 462 },
  R: { x: OW - 46 - 206, y: 150, w: 206, h: 462 },
};
/** door/light button panels (office coordinates) — the JSX places real buttons here */
export const PANEL = {
  L: { x: 264, y: 300, w: 60, h: 176 },
  R: { x: OW - 264 - 60, y: 300, w: 60, h: 176 },
};
const CW = 640, CH = 360; // camera feed resolution

function mk(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a ^ (a >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return ((a ^ (a >>> 13)) >>> 0) / 4294967296;
  };
}
function grime(c, x, y, w, h, n, rnd, color = "0,0,0", amax = 0.18) {
  for (let i = 0; i < n; i++) {
    const r = 2 + rnd() * 26;
    const px = x + rnd() * w, py = y + rnd() * h;
    const g = c.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(${color},${rnd() * amax})`);
    g.addColorStop(1, `rgba(${color},0)`);
    c.fillStyle = g;
    c.fillRect(px - r, py - r, r * 2, r * 2);
  }
}
function drips(c, x, y, w, n, rnd, color = "rgba(10,8,6,0.35)") {
  c.fillStyle = color;
  for (let i = 0; i < n; i++) c.fillRect(x + rnd() * w, y, 1 + rnd() * 2.5, 10 + rnd() * 60);
}
function vignette(c, w, h, a = 0.8, inner = 0.35) {
  const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * inner, w / 2, h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${a})`);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}
function cone(c, x, y, topW, botW, h, color, a) {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, color.replace("A", String(a)));
  g.addColorStop(1, color.replace("A", "0"));
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x - topW / 2, y);
  c.lineTo(x + topW / 2, y);
  c.lineTo(x + botW / 2, y + h);
  c.lineTo(x - botW / 2, y + h);
  c.closePath();
  c.fill();
}
function pool(c, x, y, r, color, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace("A", String(a)));
  g.addColorStop(1, color.replace("A", "0"));
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}
function pipe(c, x0, y, x1, r, base = [70, 74, 72]) {
  const g = c.createLinearGradient(0, y - r, 0, y + r);
  g.addColorStop(0, `rgb(${base.map((v) => v * 0.5).join(",")})`);
  g.addColorStop(0.4, `rgb(${base.join(",")})`);
  g.addColorStop(1, `rgb(${base.map((v) => v * 0.25).join(",")})`);
  c.fillStyle = g;
  c.fillRect(x0, y - r, x1 - x0, r * 2);
}
function vpipe(c, x, y0, y1, r, base = [70, 74, 72]) {
  const g = c.createLinearGradient(x - r, 0, x + r, 0);
  g.addColorStop(0, `rgb(${base.map((v) => v * 0.5).join(",")})`);
  g.addColorStop(0.4, `rgb(${base.join(",")})`);
  g.addColorStop(1, `rgb(${base.map((v) => v * 0.25).join(",")})`);
  c.fillStyle = g;
  c.fillRect(x - r, y0, r * 2, y1 - y0);
}
/** a one-point-perspective room: back wall rect + floor/ceiling/walls */
function room(c, w, h, bx, by, bw, bh, col) {
  // ceiling
  c.fillStyle = col.ceil;
  c.beginPath();
  c.moveTo(0, 0); c.lineTo(w, 0); c.lineTo(bx + bw, by); c.lineTo(bx, by); c.closePath(); c.fill();
  // floor
  c.fillStyle = col.floor;
  c.beginPath();
  c.moveTo(0, h); c.lineTo(w, h); c.lineTo(bx + bw, by + bh); c.lineTo(bx, by + bh); c.closePath(); c.fill();
  // side walls
  c.fillStyle = col.side;
  c.beginPath();
  c.moveTo(0, 0); c.lineTo(bx, by); c.lineTo(bx, by + bh); c.lineTo(0, h); c.closePath(); c.fill();
  c.beginPath();
  c.moveTo(w, 0); c.lineTo(bx + bw, by); c.lineTo(bx + bw, by + bh); c.lineTo(w, h); c.closePath(); c.fill();
  // back wall
  c.fillStyle = col.back;
  c.fillRect(bx, by, bw, bh);
}
function floorLines(c, w, h, bx, by, bw, bh, color, n = 9) {
  c.strokeStyle = color;
  c.lineWidth = 1;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    c.beginPath();
    c.moveTo(bx + bw * f, by + bh);
    c.lineTo(w * f, h);
    c.stroke();
  }
  for (let i = 1; i < 7; i++) {
    const f = Math.pow(i / 7, 1.8);
    const y = by + bh + (h - by - bh) * f;
    c.beginPath();
    c.moveTo(bx * (1 - f), y);
    c.lineTo(w - (w - bx - bw) * (1 - f), y);
    c.stroke();
  }
}
function text(c, s, x, y, size, color, align = "center", font = "Impact, 'Arial Black', sans-serif") {
  c.font = `${size}px ${font}`;
  c.textAlign = align;
  c.textBaseline = "middle";
  c.fillStyle = color;
  c.fillText(s, x, y);
}
function hazard(c, x, y, w, h, s = 18) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.fillStyle = "#b8901c";
  c.fillRect(x, y, w, h);
  c.fillStyle = "#16130c";
  for (let i = -h; i < w + h; i += s * 2) {
    c.beginPath();
    c.moveTo(x + i, y + h);
    c.lineTo(x + i + s, y + h);
    c.lineTo(x + i + s + h, y);
    c.lineTo(x + i + h, y);
    c.closePath();
    c.fill();
  }
  c.fillStyle = "rgba(0,0,0,0.35)";
  c.fillRect(x, y, w, h);
  c.restore();
}

/* ====================================================================== office */
function buildOffice() {
  const cv = mk(OW, VH);
  const c = cv.getContext("2d");
  const rnd = seeded(1962);
  // back wall
  let g = c.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, "#0b0d0c");
  g.addColorStop(0.2, "#1d2421");
  g.addColorStop(0.75, "#141a17");
  g.addColorStop(1, "#0c0f0d");
  c.fillStyle = g;
  c.fillRect(0, 0, OW, VH);
  // tiles
  c.strokeStyle = "rgba(170,200,180,0.05)";
  c.lineWidth = 1;
  for (let y = 124; y < 440; y += 28) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(OW, y); c.stroke();
    for (let x = (y / 28) % 2 ? 0 : 22; x < OW; x += 44) {
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 28); c.stroke();
    }
  }
  grime(c, 0, 120, OW, 420, 160, rnd);
  drips(c, 0, 124, OW, 80, rnd);
  // wainscot
  c.fillStyle = "#0e1a15";
  c.fillRect(0, 440, OW, 130);
  c.fillStyle = "rgba(170,140,40,0.35)";
  c.fillRect(0, 436, OW, 6);
  grime(c, 0, 440, OW, 130, 60, rnd, "0,0,0", 0.3);
  // ceiling + pipes
  g = c.createLinearGradient(0, 0, 0, 124);
  g.addColorStop(0, "#050606");
  g.addColorStop(1, "#111413");
  c.fillStyle = g;
  c.fillRect(0, 0, OW, 120);
  pipe(c, 0, 34, OW, 11, [78, 70, 62]);
  pipe(c, 0, 66, OW, 7, [60, 70, 74]);
  for (let x = 90; x < OW; x += 240) {
    c.fillStyle = "#1d1f1f";
    c.fillRect(x, 18, 10, 60);
  }
  vpipe(c, 340, 66, 570, 8, [64, 70, 70]);
  vpipe(c, OW - 340, 34, 570, 10, [82, 66, 52]);
  // posters ------------------------------------------------------------
  // Brightgear company poster
  c.save();
  c.translate(470, 262);
  c.rotate(-0.03);
  c.fillStyle = "#b7ab8c";
  c.fillRect(-72, -96, 144, 192);
  c.fillStyle = "#8c2f22";
  c.fillRect(-72, -96, 144, 34);
  text(c, "BRIGHTGEAR", 0, -79, 22, "#efe2c2");
  // cartoon mascot
  c.fillStyle = "#d9963c";
  rr(c, -30, -50, 60, 46, 8); c.fill();
  c.fillStyle = "#2a1a10";
  c.beginPath(); c.arc(-12, -30, 6, 0, 7); c.arc(12, -30, 6, 0, 7); c.fill();
  c.strokeStyle = "#2a1a10"; c.lineWidth = 3;
  c.beginPath(); c.arc(0, -20, 12, 0.2, Math.PI - 0.2); c.stroke();
  c.fillStyle = "#4b6d8c";
  rr(c, -24, 0, 48, 40, 6); c.fill();
  text(c, "PLAY IS OUR PURPOSE", 0, 58, 13, "#3a2a1a", "center", "Georgia, serif");
  text(c, "TOY CO. · EST. 1962", 0, 78, 11, "#5a4a3a", "center", "Georgia, serif");
  c.fillStyle = "rgba(20,14,8,0.35)";
  c.beginPath(); c.moveTo(72, 96); c.lineTo(30, 96); c.lineTo(72, 50); c.fill();
  grime(c, -72, -96, 144, 192, 30, rnd, "40,25,10", 0.35);
  c.restore();
  // safety sign
  c.save();
  c.translate(900, 250);
  c.rotate(0.025);
  hazard(c, -78, -64, 156, 128, 14);
  c.fillStyle = "#d8cfb4";
  c.fillRect(-68, -54, 136, 108);
  text(c, "SAFETY FIRST", 0, -36, 18, "#1c1a14");
  text(c, "DAYS WITHOUT", 0, -12, 12, "#1c1a14", "center", "Arial, sans-serif");
  text(c, "AN INCIDENT", 0, 2, 12, "#1c1a14", "center", "Arial, sans-serif");
  c.strokeStyle = "#1c1a14"; c.lineWidth = 2; c.strokeRect(-24, 14, 48, 34);
  text(c, "0", 0, 32, 30, "#8a1a14", "center", "'Comic Sans MS', 'Marker Felt', cursive");
  grime(c, -68, -54, 136, 108, 20, rnd, "40,25,10", 0.3);
  c.restore();
  // children's drawings (taped)
  const kids = [
    [612, 220, -0.12, "#c8692c"],
    [690, 206, 0.06, "#c2304a"],
    [766, 226, 0.14, "#7fd8d0"],
  ];
  for (const [x, y, a, col] of kids) {
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.fillStyle = "#cfc7b4";
    c.fillRect(-30, -36, 60, 72);
    c.strokeStyle = col; c.lineWidth = 3; c.lineCap = "round";
    c.beginPath();
    c.arc(0, -14, 10, 0, 7);
    c.moveTo(0, -4); c.lineTo(0, 18); c.moveTo(-12, 4); c.lineTo(12, 4);
    c.moveTo(0, 18); c.lineTo(-9, 30); c.moveTo(0, 18); c.lineTo(9, 30);
    c.stroke();
    c.fillStyle = "#1a1a1a";
    c.beginPath(); c.arc(-4, -16, 2, 0, 7); c.arc(4, -16, 2, 0, 7); c.fill();
    c.fillStyle = "rgba(220,210,170,0.6)";
    c.fillRect(-10, -40, 20, 8);
    c.restore();
  }
  // vent grille
  c.fillStyle = "#0a0c0c";
  c.fillRect(1010, 140, 86, 52);
  c.strokeStyle = "#3a403e"; c.lineWidth = 3;
  for (let y = 146; y < 190; y += 8) { c.beginPath(); c.moveTo(1012, y); c.lineTo(1094, y); c.stroke(); }
  // floor
  c.fillStyle = "#14110e";
  c.fillRect(0, 570, OW, 150);
  for (let row = 0; row < 6; row++) {
    const y0 = 570 + Math.pow(row / 6, 1.5) * 150, y1 = 570 + Math.pow((row + 1) / 6, 1.5) * 150;
    const n = 22;
    for (let i = -2; i < n + 2; i++) {
      const sx = (k, y) => OW / 2 + (k - n / 2) * (OW / n) * (0.75 + 0.5 * (y - 570) / 150);
      c.fillStyle = (i + row) % 2 ? "#221d18" : "#16130f";
      c.beginPath();
      c.moveTo(sx(i, y0), y0); c.lineTo(sx(i + 1, y0), y0); c.lineTo(sx(i + 1, y1), y1); c.lineTo(sx(i, y1), y1);
      c.closePath(); c.fill();
    }
  }
  grime(c, 0, 570, OW, 150, 50, rnd, "0,0,0", 0.4);
  // doorways
  for (const s of ["L", "R"]) {
    const d = DOORWAY[s];
    c.fillStyle = "#010101";
    c.fillRect(d.x, d.y, d.w, d.h);
    // steel frame
    c.fillStyle = "#2a2e30";
    c.fillRect(d.x - 18, d.y - 30, d.w + 36, 30);
    c.fillRect(d.x - 18, d.y, 18, d.h + 4);
    c.fillRect(d.x + d.w, d.y, 18, d.h + 4);
    hazard(c, d.x - 18, d.y - 30, d.w + 36, 18, 14);
    c.fillStyle = "rgba(255,255,255,0.06)";
    c.fillRect(d.x - 18, d.y, 4, d.h);
    c.fillStyle = "rgba(0,0,0,0.5)";
    c.fillRect(d.x + d.w + 14, d.y, 4, d.h);
    text(c, s === "L" ? "WEST GATE" : "EAST GATE", d.x + d.w / 2, d.y - 52, 15, "rgba(200,190,160,0.55)", "center", "Arial Black, sans-serif");
    // panels
    const p = PANEL[s];
    c.fillStyle = "#1e2224";
    rr(c, p.x - 6, p.y - 6, p.w + 12, p.h + 12, 8); c.fill();
    c.fillStyle = "#30363a";
    rr(c, p.x, p.y, p.w, p.h, 6); c.fill();
    c.fillStyle = "#0b0c0d";
    for (const k of [0, 1]) {
      c.beginPath(); c.arc(p.x + p.w / 2, p.y + 46 + k * 86, 25, 0, 7); c.fill();
    }
    text(c, "DOOR", p.x + p.w / 2, p.y + 12, 10, "#9aa0a0", "center", "Arial, sans-serif");
    text(c, "LIGHT", p.x + p.w / 2, p.y + 98, 10, "#9aa0a0", "center", "Arial, sans-serif");
    c.strokeStyle = "#151719"; c.lineWidth = 4;
    c.beginPath(); c.moveTo(p.x + p.w / 2, p.y + p.h + 6); c.lineTo(p.x + p.w / 2, 570); c.stroke();
  }
  // desk
  g = c.createLinearGradient(0, 520, 0, 640);
  g.addColorStop(0, "#3d2c1d");
  g.addColorStop(1, "#24190f");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(352, 532); c.lineTo(1008, 532); c.lineTo(1090, 640); c.lineTo(270, 640); c.closePath(); c.fill();
  c.fillStyle = "#17100a";
  c.fillRect(270, 640, 820, 80);
  c.fillStyle = "rgba(255,220,170,0.08)";
  c.fillRect(270, 638, 820, 4);
  c.fillStyle = "#0e0a06";
  c.fillRect(300, 660, 240, 50);
  c.fillRect(820, 660, 240, 50);
  c.strokeStyle = "#3a2a1a"; c.lineWidth = 2;
  c.strokeRect(300, 660, 240, 50);
  c.strokeRect(820, 660, 240, 50);
  // CRT monitors
  const crt = (x, y, w, h) => {
    c.fillStyle = "#2a2822";
    c.beginPath(); c.moveTo(x + 12, y + h); c.lineTo(x + w - 12, y + h); c.lineTo(x + w - 30, y + h + 18); c.lineTo(x + 30, y + h + 18); c.fill();
    g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "#3c3a32"); g.addColorStop(0.5, "#5f5b4e"); g.addColorStop(1, "#2c2a24");
    c.fillStyle = g;
    rr(c, x, y, w, h, 10); c.fill();
    c.fillStyle = "#061008";
    rr(c, x + 14, y + 12, w - 28, h - 34, 12); c.fill();
    c.fillStyle = "#3a6a3a";
    c.beginPath(); c.arc(x + w - 18, y + h - 12, 3, 0, 7); c.fill();
  };
  crt(410, 400, 170, 134);
  crt(774, 410, 156, 124);
  // monitor text
  c.fillStyle = "rgba(90,220,120,0.55)";
  c.font = "10px monospace";
  c.textAlign = "left";
  ["BRIGHTGEAR SEC-NET v2.1", "> CAMS ONLINE: 8", "> DOOR LOCKS: OK", "> GENERATOR: LOW", "> ERR 0x1F: UNIT 03", "> ERR 0x1F: UNIT 03"].forEach((l, i) => c.fillText(l, 432, 426 + i * 13));
  c.strokeStyle = "rgba(90,220,120,0.6)";
  c.lineWidth = 2;
  c.beginPath();
  for (let i = 0; i <= 20; i++) c.lineTo(796 + i * 5.6, 470 - Math.abs(Math.sin(i * 1.3)) * 30 - (i > 14 ? (i - 14) * 6 : 0));
  c.stroke();
  // papers, mug, phone, figurine
  c.save(); c.translate(560, 584); c.rotate(-0.15);
  c.fillStyle = "#a9a28e"; c.fillRect(-46, -30, 92, 62);
  c.fillStyle = "rgba(40,40,40,0.5)"; for (let i = 0; i < 6; i++) c.fillRect(-38, -22 + i * 9, 60 + (i % 3) * 8, 2);
  c.restore();
  c.save(); c.translate(610, 596); c.rotate(0.2);
  c.fillStyle = "#bcb5a0"; c.fillRect(-40, -26, 80, 54);
  c.restore();
  c.fillStyle = "#3b4a52"; rr(c, 960, 548, 34, 40, 6); c.fill();
  c.strokeStyle = "#3b4a52"; c.lineWidth = 6; c.beginPath(); c.arc(996, 566, 10, -1.2, 1.2); c.stroke();
  c.fillStyle = "#1b1a18"; rr(c, 340, 566, 70, 36, 8); c.fill();
  c.fillStyle = "#2e2c28"; rr(c, 346, 550, 58, 16, 8); c.fill();
  // small toy-robot figurine of Rustjaw on the desk
  drawRobot(c, "rustjaw", 900, 600, 0.17, { eye: 0.4 });
  // fan housing (blades are dynamic)
  c.fillStyle = "#1c1d1d";
  rr(c, 650, 560, 60, 22, 6); c.fill();
  c.fillRect(674, 520, 12, 44);
  // hanging lamp
  c.strokeStyle = "#0a0a0a"; c.lineWidth = 3;
  c.beginPath(); c.moveTo(OW / 2, 0); c.lineTo(OW / 2, 96); c.stroke();
  c.fillStyle = "#2b3532";
  c.beginPath(); c.moveTo(OW / 2 - 18, 96); c.lineTo(OW / 2 + 18, 96); c.lineTo(OW / 2 + 52, 128); c.lineTo(OW / 2 - 52, 128); c.closePath(); c.fill();
  // baked lamp light
  c.globalCompositeOperation = "lighter";
  pool(c, OW / 2, 360, 520, "rgba(255,210,140,A)", 0.13);
  pool(c, OW / 2, 600, 380, "rgba(255,200,130,A)", 0.08);
  c.globalCompositeOperation = "source-over";
  vignette(c, OW, VH, 0.85, 0.3);
  return cv;
}

function buildHall(side) {
  const d = DOORWAY[side];
  const cv = mk(d.w, d.h);
  const c = cv.getContext("2d");
  const w = d.w, h = d.h;
  const vx = side === "L" ? w * 0.62 : w * 0.38;
  room(c, w, h, vx - 34, h * 0.3, 68, h * 0.32, { ceil: "#2a2620", floor: "#3a342a", side: "#4a4436", back: "#0d0c0a" });
  floorLines(c, w, h, vx - 34, h * 0.3, 68, h * 0.32, "rgba(0,0,0,0.35)", 6);
  const rnd = seeded(side === "L" ? 7 : 8);
  grime(c, 0, 0, w, h, 40, rnd, "0,0,0", 0.4);
  // poster on the hall wall
  c.fillStyle = "rgba(160,150,120,0.45)";
  if (side === "L") c.fillRect(16, 130, 34, 50);
  else c.fillRect(w - 50, 130, 34, 50);
  // light falloff (bright near the doorway top, dark far end)
  const g = c.createRadialGradient(w / 2, 0, 20, w / 2, h * 0.4, h * 0.9);
  g.addColorStop(0, "rgba(255,236,190,0.35)");
  g.addColorStop(0.5, "rgba(0,0,0,0.1)");
  g.addColorStop(1, "rgba(0,0,0,0.75)");
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  return cv;
}

function buildDoor() {
  const d = DOORWAY.L;
  const cv = mk(d.w, d.h);
  const c = cv.getContext("2d");
  const g = c.createLinearGradient(0, 0, d.w, 0);
  g.addColorStop(0, "#23282b"); g.addColorStop(0.5, "#40474b"); g.addColorStop(1, "#1d2124");
  c.fillStyle = g;
  c.fillRect(0, 0, d.w, d.h);
  c.strokeStyle = "rgba(0,0,0,0.5)";
  c.lineWidth = 3;
  for (let y = 40; y < d.h; y += 48) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(d.w, y); c.stroke();
    c.strokeStyle = "rgba(255,255,255,0.05)";
    c.beginPath(); c.moveTo(0, y + 3); c.lineTo(d.w, y + 3); c.stroke();
    c.strokeStyle = "rgba(0,0,0,0.5)";
  }
  hazard(c, 0, d.h - 34, d.w, 34, 16);
  const rnd = seeded(31);
  grime(c, 0, 0, d.w, d.h, 40, rnd, "50,30,10", 0.3);
  // porthole frame
  const px = d.w / 2, py = d.h * 0.3;
  c.fillStyle = "#15181a";
  c.beginPath(); c.arc(px, py, 44, 0, 7); c.fill();
  c.globalCompositeOperation = "destination-out";
  c.beginPath(); c.arc(px, py, 34, 0, 7); c.fill();
  c.globalCompositeOperation = "source-over";
  c.fillStyle = "#6b7377";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.beginPath(); c.arc(px + Math.cos(a) * 39, py + Math.sin(a) * 39, 2.5, 0, 7); c.fill();
  }
  return { cv, px, py, r: 34 };
}

/* ====================================================================== cameras */
const CAM_ART = {
  showroom(c, rnd) {
    room(c, CW, CH, 150, 70, 340, 170, { ceil: "#0c0910", floor: "#1b1520", side: "#18121c", back: "#1f1626" });
    // stage
    c.fillStyle = "#2b1d14";
    c.fillRect(110, 214, 420, 40);
    c.fillStyle = "#3d2a1c";
    c.beginPath(); c.moveTo(110, 214); c.lineTo(530, 214); c.lineTo(500, 200); c.lineTo(140, 200); c.fill();
    // curtains
    for (const s of [0, 1]) {
      const x0 = s ? 470 : 120;
      for (let i = 0; i < 6; i++) {
        c.fillStyle = i % 2 ? "#4a0c14" : "#2e060c";
        c.fillRect(x0 + i * 9, 60, 9, 145);
      }
    }
    c.fillStyle = "#3a0a10";
    for (let i = 0; i < 20; i++) c.fillRect(120 + i * 21, 58, 21, 18 + (i % 2) * 6);
    // banner with dead bulbs
    c.fillStyle = "#14100c";
    c.fillRect(200, 30, 240, 30);
    text(c, "B R I G H T G E A R", 320, 46, 18, "#6a5a2a");
    for (let i = 0; i < 16; i++) {
      c.fillStyle = rnd() < 0.3 ? "rgba(255,220,120,0.8)" : "#2a2418";
      c.beginPath(); c.arc(206 + i * 15, 26, 3, 0, 7); c.fill();
    }
    // display shelves
    for (const x of [10, 560]) {
      c.fillStyle = "#1a1418";
      c.fillRect(x, 120, 72, 200);
      for (let y = 140; y < 320; y += 45) {
        c.fillStyle = "#2a2228"; c.fillRect(x, y + 30, 72, 5);
        for (let k = 0; k < 3; k++) {
          c.fillStyle = ["#3a2a3a", "#2a3a3a", "#3a3a28"][k];
          c.fillRect(x + 4 + k * 23, y, 18, 30);
        }
      }
    }
    cone(c, 230, 0, 20, 140, 260, "rgba(255,230,200,A)", 0.08);
    cone(c, 410, 0, 20, 140, 260, "rgba(255,230,200,A)", 0.06);
  },
  assembly(c, rnd) {
    room(c, CW, CH, 180, 80, 300, 140, { ceil: "#0a0c0e", floor: "#181c1e", side: "#14181a", back: "#1a2024" });
    floorLines(c, CW, CH, 180, 80, 300, 140, "rgba(0,0,0,0.3)");
    // conveyor
    c.fillStyle = "#0e0f10";
    c.beginPath(); c.moveTo(0, 250); c.lineTo(420, 180); c.lineTo(470, 196); c.lineTo(40, 290); c.closePath(); c.fill();
    c.fillStyle = "#26292b";
    c.beginPath(); c.moveTo(0, 240); c.lineTo(420, 172); c.lineTo(468, 186); c.lineTo(30, 278); c.closePath(); c.fill();
    c.strokeStyle = "rgba(0,0,0,0.6)";
    for (let i = 0; i < 14; i++) {
      const f = i / 14;
      c.beginPath(); c.moveTo(f * 420, 240 - f * 68); c.lineTo(30 + f * 438, 278 - f * 92); c.stroke();
    }
    // doll heads on belt
    for (let i = 0; i < 7; i++) {
      const f = 0.08 + i * 0.12;
      const x = 15 + f * 430, y = 252 - f * 78;
      c.fillStyle = "#8f8676";
      c.beginPath(); c.arc(x, y - 8, 8 - f * 3, 0, 7); c.fill();
      c.fillStyle = "#111";
      c.beginPath(); c.arc(x - 2.5, y - 9, 1.4, 0, 7); c.arc(x + 2.5, y - 9, 1.4, 0, 7); c.fill();
    }
    // robotic arms
    for (const x of [140, 330]) {
      c.strokeStyle = "#3a3f42"; c.lineWidth = 9; c.lineCap = "round";
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 10, 60); c.lineTo(x + 40, 110); c.stroke();
      c.fillStyle = "#c8a030";
      c.beginPath(); c.arc(x + 10, 60, 7, 0, 7); c.fill();
      c.strokeStyle = "#555"; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x + 40, 110); c.lineTo(x + 32, 124); c.moveTo(x + 40, 110); c.lineTo(x + 50, 122); c.stroke();
    }
    // chains
    c.strokeStyle = "#2a2a2a"; c.lineWidth = 2;
    for (const x of [470, 520, 590]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 4, 120 + rnd() * 60); c.stroke(); }
    pool(c, 560, 40, 24, "rgba(255,40,30,A)", 0.5);
  },
  paint(c, rnd) {
    room(c, CW, CH, 170, 70, 300, 160, { ceil: "#0c0b0a", floor: "#1d1a17", side: "#1a1714", back: "#221e1a" });
    // splatter
    const cols = ["120,20,30", "30,60,120", "150,120,30", "40,110,70", "130,40,110"];
    for (let i = 0; i < 70; i++) {
      const col = cols[Math.floor(rnd() * cols.length)];
      const x = rnd() * CW, y = 20 + rnd() * 240, r = 2 + rnd() * 14;
      c.fillStyle = `rgba(${col},${0.25 + rnd() * 0.35})`;
      c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      if (rnd() < 0.4) c.fillRect(x - 1, y, 2, 10 + rnd() * 30);
    }
    // spray booth with plastic strips
    c.fillStyle = "#121110";
    c.fillRect(250, 80, 140, 150);
    for (let i = 0; i < 12; i++) {
      c.fillStyle = `rgba(200,210,200,${0.06 + (i % 3) * 0.03})`;
      c.fillRect(252 + i * 11.5, 82, 9, 146);
    }
    // drums
    for (const [x, y, col] of [[60, 280, "#5a1a1a"], [110, 296, "#1a3a5a"], [520, 286, "#5a4a1a"], [570, 300, "#3a3a3a"]]) {
      c.fillStyle = col;
      rr(c, x - 22, y - 50, 44, 56, 6); c.fill();
      c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(x - 22, y - 30, 44, 4); c.fillRect(x - 22, y - 12, 44, 4);
      c.fillStyle = "rgba(255,255,255,0.08)"; c.beginPath(); c.ellipse(x, y - 50, 22, 6, 0, 0, 7); c.fill();
    }
    // drying rack of painted doll faces
    c.strokeStyle = "#3a3632"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(430, 90); c.lineTo(600, 90); c.stroke();
    for (let i = 0; i < 6; i++) {
      const x = 442 + i * 28;
      c.strokeStyle = "#2a2622"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, 90); c.lineTo(x, 104); c.stroke();
      c.fillStyle = "#b8ae9c";
      c.beginPath(); c.ellipse(x, 116, 10, 13, 0, 0, 7); c.fill();
      c.fillStyle = "#151010";
      c.beginPath(); c.arc(x - 4, 113, 2, 0, 7); c.arc(x + 4, 113, 2, 0, 7); c.fill();
      c.strokeStyle = "rgba(140,20,30,0.8)"; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, 120, 4, 0.2, Math.PI - 0.2); c.stroke();
    }
    cone(c, 320, 0, 10, 160, 250, "rgba(220,255,220,A)", 0.05);
  },
  dock(c, rnd) {
    room(c, CW, CH, 120, 50, 400, 200, { ceil: "#08090a", floor: "#16181a", side: "#121416", back: "#1a1d20" });
    // rolling shutter, half open at the bottom
    c.fillStyle = "#2c3034";
    c.fillRect(200, 60, 240, 150);
    c.strokeStyle = "rgba(0,0,0,0.45)"; c.lineWidth = 2;
    for (let y = 64; y < 210; y += 7) { c.beginPath(); c.moveTo(200, y); c.lineTo(440, y); c.stroke(); }
    c.fillStyle = "#020203";
    c.fillRect(200, 210, 240, 40);
    hazard(c, 196, 52, 248, 10, 10);
    // caged light
    c.fillStyle = "#c8b060";
    c.beginPath(); c.arc(320, 42, 6, 0, 7); c.fill();
    pool(c, 320, 42, 90, "rgba(255,220,140,A)", 0.18);
    // crates
    for (const [x, y, w, h] of [[30, 250, 80, 70], [40, 190, 66, 60], [520, 260, 90, 70], [540, 200, 60, 60], [470, 290, 50, 40]]) {
      c.fillStyle = "#3a2c1c"; c.fillRect(x, y, w, h);
      c.strokeStyle = "#20160c"; c.lineWidth = 3; c.strokeRect(x + 2, y + 2, w - 4, h - 4);
      c.beginPath(); c.moveTo(x + 2, y + 2); c.lineTo(x + w - 2, y + h - 2); c.stroke();
    }
    text(c, "FRAGILE · TOYS", 74, 286, 9, "rgba(150,40,30,0.8)", "center", "Arial Black, sans-serif");
    // floor stripes + puddle
    c.fillStyle = "rgba(180,150,40,0.35)";
    c.beginPath(); c.moveTo(196, 252); c.lineTo(206, 252); c.lineTo(150, 360); c.lineTo(130, 360); c.fill();
    c.beginPath(); c.moveTo(434, 252); c.lineTo(444, 252); c.lineTo(510, 360); c.lineTo(490, 360); c.fill();
    c.fillStyle = "rgba(120,140,160,0.12)";
    c.beginPath(); c.ellipse(330, 320, 90, 14, 0, 0, 7); c.fill();
  },
  boiler(c, rnd) {
    room(c, CW, CH, 140, 60, 360, 180, { ceil: "#0a0605", floor: "#1a1210", side: "#170f0c", back: "#1e1410" });
    // pipes
    pipe(c, 0, 40, CW, 9, [70, 50, 40]);
    pipe(c, 0, 70, CW, 6, [60, 60, 56]);
    vpipe(c, 600, 40, 360, 9, [72, 52, 40]);
    // boiler tank
    const g = c.createLinearGradient(60, 0, 300, 0);
    g.addColorStop(0, "#1a100c"); g.addColorStop(0.45, "#4a3022"); g.addColorStop(1, "#140c08");
    c.fillStyle = g;
    rr(c, 60, 80, 230, 220, 40); c.fill();
    c.strokeStyle = "rgba(0,0,0,0.5)"; c.lineWidth = 4;
    for (const y of [130, 200, 260]) { c.beginPath(); c.moveTo(62, y); c.lineTo(288, y); c.stroke(); }
    for (const [x, y] of [[120, 110], [180, 104], [240, 112]]) {
      c.fillStyle = "#b8b098"; c.beginPath(); c.arc(x, y, 12, 0, 7); c.fill();
      c.strokeStyle = "#8a1a10"; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 7, y - 6); c.stroke();
    }
    // furnace grate
    c.fillStyle = "#0c0604";
    rr(c, 120, 220, 110, 60, 6); c.fill();
    c.fillStyle = "rgba(255,110,30,0.65)";
    for (let i = 0; i < 6; i++) c.fillRect(128 + i * 17, 228, 9, 44);
    pool(c, 175, 260, 190, "rgba(255,90,20,A)", 0.3);
    // steam haze
    for (let i = 0; i < 14; i++) pool(c, 300 + rnd() * 300, 60 + rnd() * 140, 40 + rnd() * 50, "rgba(180,170,160,A)", 0.04);
  },
  storage(c, rnd) {
    room(c, CW, CH, 220, 70, 200, 150, { ceil: "#090a0b", floor: "#16171a", side: "#121316", back: "#0b0c0e" });
    // shelving rows in perspective (both sides)
    for (const s of [0, 1]) {
      for (let k = 0; k < 4; k++) {
        const f0 = k / 4, f1 = (k + 0.8) / 4;
        const xa = s ? CW - (CW - 420) * f0 : 220 * f0, xb = s ? CW - (CW - 420) * f1 : 220 * f1;
        const top0 = 70 * f0, top1 = 70 * f1, bot0 = CH - (CH - 220) * f0, bot1 = CH - (CH - 220) * f1;
        c.fillStyle = "#1e2024";
        c.beginPath(); c.moveTo(xa, top0); c.lineTo(xb, top1); c.lineTo(xb, bot1); c.lineTo(xa, bot0); c.fill();
        for (let r = 1; r < 5; r++) {
          const ya = top0 + (bot0 - top0) * (r / 5), yb = top1 + (bot1 - top1) * (r / 5);
          c.strokeStyle = "#34373c"; c.lineWidth = 3;
          c.beginPath(); c.moveTo(xa, ya); c.lineTo(xb, yb); c.stroke();
          c.fillStyle = ["#3a3222", "#2a3a44", "#3a2a2a"][(k + r) % 3];
          c.beginPath(); c.moveTo(xa + (xb - xa) * 0.1, ya - 4); c.lineTo(xa + (xb - xa) * 0.9, yb - 4);
          c.lineTo(xa + (xb - xa) * 0.9, yb - (yb - top1) * 0.12); c.lineTo(xa + (xb - xa) * 0.1, ya - (ya - top0) * 0.12); c.fill();
        }
      }
    }
    text(c, "ARMS", 70, 140, 12, "rgba(200,190,160,0.6)", "center", "Arial Black, sans-serif");
    text(c, "EYES", 575, 196, 12, "rgba(200,190,160,0.6)", "center", "Arial Black, sans-serif");
    // mannequin arm sticking out of a bin
    c.strokeStyle = "#b5ab98"; c.lineWidth = 6; c.lineCap = "round";
    c.beginPath(); c.moveTo(90, 214); c.lineTo(118, 190); c.lineTo(128, 172); c.stroke();
    pool(c, 320, 60, 70, "rgba(200,220,255,A)", 0.12);
  },
  westHall(c, rnd) {
    room(c, CW, CH, 270, 100, 100, 110, { ceil: "#0b0b09", floor: "#1d1a14", side: "#1a1814", back: "#0a0907" });
    floorLines(c, CW, CH, 270, 100, 100, 110, "rgba(0,0,0,0.4)", 7);
    // posters on walls
    c.fillStyle = "rgba(150,120,80,0.5)";
    c.beginPath(); c.moveTo(60, 110); c.lineTo(120, 128); c.lineTo(120, 200); c.lineTo(60, 196); c.fill();
    c.fillStyle = "rgba(120,40,30,0.5)";
    c.beginPath(); c.moveTo(520, 132); c.lineTo(570, 116); c.lineTo(570, 190); c.lineTo(520, 196); c.fill();
    // "OFFICE" sign + arrow
    c.fillStyle = "#1a2a1c"; c.fillRect(286, 84, 68, 14);
    text(c, "OFFICE ▼", 320, 91, 9, "rgba(120,220,140,0.7)", "center", "Arial Black, sans-serif");
    // ceiling fixtures
    for (const [x, y, w] of [[320, 40, 90], [320, 76, 40]]) {
      c.fillStyle = "#c8c0a0"; c.fillRect(x - w / 2, y, w, 4);
      pool(c, x, y + 20, w * 1.4, "rgba(255,240,200,A)", 0.12);
    }
    grime(c, 0, 0, CW, CH, 60, rnd, "0,0,0", 0.35);
  },
  eastHall(c, rnd) {
    room(c, CW, CH, 260, 96, 110, 116, { ceil: "#0a0a0b", floor: "#191a1c", side: "#16171a", back: "#08080a" });
    floorLines(c, CW, CH, 260, 96, 110, 116, "rgba(0,0,0,0.4)", 7);
    // vending machine (right wall)
    c.fillStyle = "#2a1414";
    c.beginPath(); c.moveTo(470, 80); c.lineTo(560, 40); c.lineTo(560, 330); c.lineTo(470, 270); c.fill();
    c.fillStyle = "rgba(120,200,255,0.18)";
    c.beginPath(); c.moveTo(480, 96); c.lineTo(540, 70); c.lineTo(540, 230); c.lineTo(480, 230); c.fill();
    pool(c, 510, 150, 80, "rgba(120,200,255,A)", 0.1);
    // children's drawings on left wall
    for (let i = 0; i < 4; i++) {
      c.fillStyle = "rgba(200,190,170,0.45)";
      c.save(); c.translate(70 + i * 40, 130 + i * 8); c.rotate((rnd() - 0.5) * 0.4);
      c.fillRect(-14, -16, 28, 32);
      c.strokeStyle = ["#c8692c", "#c2304a", "#7fd8d0", "#c2304a"][i]; c.lineWidth = 2;
      c.beginPath(); c.arc(0, -4, 5, 0, 7); c.moveTo(0, 1); c.lineTo(0, 12); c.stroke();
      c.restore();
    }
    // wet floor sign
    c.fillStyle = "#b89a20";
    c.beginPath(); c.moveTo(150, 330); c.lineTo(170, 270); c.lineTo(190, 330); c.fill();
    text(c, "!", 170, 312, 16, "#111");
    c.fillStyle = "#c8c0a0"; c.fillRect(290, 44, 70, 4);
    pool(c, 325, 64, 110, "rgba(255,240,200,A)", 0.1);
    grime(c, 0, 0, CW, CH, 60, rnd, "0,0,0", 0.35);
  },
};

/** where robots stand on each camera: [x, feetY, scale, light] in feed pixels */
const SPOTS = {
  showroom: { rustjaw: [232, 210, 0.42, 0.75], velvet: [408, 210, 0.4, 0.7], hollow: [320, 236, 0.4, 0.45] },
  assembly: { rustjaw: [300, 262, 0.52, 0.6], velvet: [380, 250, 0.45, 0.5], hollow: [520, 272, 0.5, 0.35] },
  paint: { rustjaw: [210, 280, 0.5, 0.5], velvet: [330, 252, 0.48, 0.6], hollow: [480, 270, 0.5, 0.35] },
  dock: { rustjaw: [260, 268, 0.5, 0.55], velvet: [380, 268, 0.5, 0.55], hollow: [320, 252, 0.46, 0.4] },
  boiler: { rustjaw: [380, 296, 0.56, 0.6], velvet: [450, 290, 0.5, 0.5], hollow: [520, 286, 0.52, 0.3] },
  storage: { rustjaw: [300, 250, 0.4, 0.45], velvet: [330, 268, 0.48, 0.55], hollow: [310, 240, 0.4, 0.35] },
  westHall: { rustjaw: [270, 330, 0.64, 0.65], velvet: [330, 300, 0.58, 0.6], hollow: [420, 250, 0.44, 0.32] },
  eastHall: { rustjaw: [300, 300, 0.6, 0.6], velvet: [360, 336, 0.68, 0.62], hollow: [230, 250, 0.44, 0.32] },
};
const CAM_TINT = {
  showroom: "rgba(90,40,120,0.10)", assembly: "rgba(40,90,120,0.10)", paint: "rgba(90,110,60,0.10)", dock: "rgba(40,60,90,0.12)",
  boiler: "rgba(140,60,20,0.12)", storage: "rgba(40,60,90,0.12)", westHall: "rgba(110,90,40,0.10)", eastHall: "rgba(40,90,110,0.10)",
};

function buildCams() {
  const out = {};
  let seed = 100;
  for (const id of Object.keys(CAM_ART)) {
    const cv = mk(CW, CH);
    const c = cv.getContext("2d");
    c.fillStyle = "#000";
    c.fillRect(0, 0, CW, CH);
    CAM_ART[id](c, seeded(seed++));
    vignette(c, CW, CH, 0.75, 0.3);
    out[id] = cv;
  }
  return out;
}
function buildNoise() {
  const list = [];
  for (let k = 0; k < 4; k++) {
    const cv = mk(320, 180);
    const c = cv.getContext("2d");
    const img = c.createImageData(320, 180);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    list.push(cv);
  }
  return list;
}
function buildScan() {
  const cv = mk(4, 4);
  const c = cv.getContext("2d");
  c.fillStyle = "rgba(0,0,0,0.32)";
  c.fillRect(0, 0, 4, 2);
  return cv;
}

export function buildArt() {
  return {
    office: buildOffice(),
    hall: { L: buildHall("L"), R: buildHall("R") },
    door: buildDoor(),
    cams: buildCams(),
    noise: buildNoise(),
    scan: buildScan(),
    sprites: buildSprites(1.6),
    feed: mk(CW, CH),
  };
}

/* ====================================================================== per-frame render */
function eyesInDark(c, id, x, y, s, a) {
  const e = EYES[id];
  for (const [ex, ey] of e.pts) pool(c, x + ex * s, y + ey * s, e.r * s * 2.4, e.color, a);
}

function drawDoorway(c, art, g, v, side, t) {
  const d = DOORWAY[side];
  const lit = g.lights[side];
  const here = g.at(DOOR_NODE[side]);
  c.save();
  c.beginPath();
  c.rect(d.x, d.y, d.w, d.h);
  c.clip();
  if (lit) {
    const fl = 0.85 + 0.15 * Math.sin(t * 37) * Math.sin(t * 11);
    c.drawImage(art.hall[side], d.x, d.y);
    here.forEach((id, i) => {
      const s = id === "hollow" ? 1.1 : 1.28;
      const x = d.x + d.w / 2 + (i - (here.length - 1) / 2) * 60 + (side === "L" ? 8 : -8);
      blitRobot(c, art.sprites[id], x, d.y + d.h - 6, s, 0.95 * fl);
    });
    c.fillStyle = `rgba(0,0,0,${(1 - fl) * 0.6})`;
    c.fillRect(d.x, d.y, d.w, d.h);
  } else {
    // eyes in the dark — a faint, slow hint (only Rustjaw's furnace eye and Velvet's pupils)
    here.forEach((id, i) => {
      if (id === "hollow") return;
      const x = d.x + d.w / 2 + (i - (here.length - 1) / 2) * 60;
      eyesInDark(c, id, x, d.y + d.h - 6, 1.28, 0.16 + 0.06 * Math.sin(t * 1.7 + i));
    });
  }
  // the blast door
  const k = v.door[side];
  if (k > 0.001) {
    const y = d.y - d.h * (1 - k);
    c.drawImage(art.door.cv, d.x, y);
    if (k > 0.98) {
      // porthole glass tint
      const px = d.x + art.door.px, py = y + art.door.py;
      c.fillStyle = lit ? "rgba(90,110,100,0.35)" : "rgba(10,14,14,0.85)";
      c.beginPath(); c.arc(px, py, art.door.r, 0, 7); c.fill();
      c.strokeStyle = "rgba(200,220,210,0.12)"; c.lineWidth = 2;
      c.beginPath(); c.arc(px - 8, py - 8, art.door.r * 0.6, Math.PI * 1.1, Math.PI * 1.5); c.stroke();
    }
  }
  c.restore();
  if (lit) {
    c.save();
    c.globalCompositeOperation = "lighter";
    pool(c, d.x + d.w / 2, d.y + d.h * 0.5, d.w * 1.1, "rgba(255,230,180,A)", 0.07);
    c.restore();
  }
}

function drawOffice(c, art, g, v, t) {
  c.save();
  c.translate(-v.par, 0);
  c.drawImage(art.office, 0, 0);
  drawDoorway(c, art, g, v, "L", t);
  drawDoorway(c, art, g, v, "R", t);
  // fan blades
  const fanOn = g.phase === "play" || g.phase === "intro";
  c.save();
  c.translate(680, 500);
  c.fillStyle = "rgba(20,22,22,0.95)";
  c.beginPath(); c.arc(0, 0, 40, 0, 7); c.fill();
  c.rotate(v.fanA);
  c.fillStyle = fanOn ? "rgba(90,96,96,0.55)" : "rgba(90,96,96,0.9)";
  for (let i = 0; i < 3; i++) {
    c.rotate((Math.PI * 2) / 3);
    c.beginPath(); c.ellipse(0, -20, 10, 20, 0, 0, 7); c.fill();
  }
  c.restore();
  c.strokeStyle = "rgba(120,126,126,0.5)"; c.lineWidth = 2;
  c.beginPath(); c.arc(680, 500, 42, 0, 7); c.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.beginPath(); c.moveTo(680, 500); c.lineTo(680 + Math.cos(a) * 42, 500 + Math.sin(a) * 42); c.stroke();
  }
  // CRT glow
  if (fanOn) {
    c.globalCompositeOperation = "lighter";
    pool(c, 495, 445, 110, "rgba(80,220,120,A)", 0.07 + 0.02 * Math.sin(t * 9));
    pool(c, 852, 455, 100, "rgba(80,220,120,A)", 0.06);
    c.globalCompositeOperation = "source-over";
  }
  // lamp flicker (subtle, never a full-screen flash)
  if (v.flick > 0) {
    c.fillStyle = `rgba(0,0,0,${v.flick})`;
    c.fillRect(0, 0, OW, VH);
  }
  c.restore();
}

function drawFeed(c, art, g, v, t) {
  const f = art.feed;
  const fc = f.getContext("2d");
  const cam = g.cam;
  fc.globalAlpha = 1;
  fc.drawImage(art.cams[cam], 0, 0);
  const here = g.at(cam);
  for (const id of here) {
    const sp = SPOTS[cam][id];
    if (!sp) continue;
    const r = g.robots[id];
    const jitter = r.moves % 2 ? 14 : -10;
    blitRobot(fc, art.sprites[id], sp[0] + jitter, sp[1], sp[2], sp[3], r.moves % 3 === 1);
  }
  fc.fillStyle = CAM_TINT[cam];
  fc.fillRect(0, 0, CW, CH);
  // camera grain + interference
  const n = art.noise[Math.floor(t * 24) % art.noise.length];
  fc.globalAlpha = 0.07;
  fc.drawImage(n, 0, 0, CW, CH);
  const st = Math.max(v.static, g.glitch > 0 ? 0.35 + 0.4 * (g.glitch / 0.75) : 0);
  if (st > 0) {
    fc.globalAlpha = Math.min(0.92, st);
    fc.drawImage(art.noise[(Math.floor(t * 30) + 1) % art.noise.length], 0, 0, CW, CH);
  }
  fc.globalAlpha = 1;
  // rolling bar
  const by = ((t * 60) % (CH + 60)) - 30;
  fc.fillStyle = "rgba(255,255,255,0.025)";
  fc.fillRect(0, by, CW, 26);
  // draw to screen with a slight wobble
  const wob = Math.sin(t * 2.1) * 1.5 + (st > 0.3 ? (Math.random() - 0.5) * 10 * st : 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(f, wob, 0, VW, VH);
  c.fillStyle = c.createPattern(art.scan, "repeat");
  c.fillRect(0, 0, VW, VH);
  vignette(c, VW, VH, 0.6, 0.45);
}

function drawPowerOut(c, art, g, v, t) {
  const o = g.out;
  c.fillStyle = "rgba(0,0,0,0.9)";
  c.fillRect(0, 0, VW, VH);
  if (o && (o.stage === "tune" || o.stage === "dark2")) {
    // the Watcher stands in the west doorway, its lantern eye breathing slowly
    const d = DOORWAY.L;
    const x = d.x + d.w / 2 - v.par, y = d.y + d.h - 6;
    const a = o.stage === "tune" ? 0.35 + 0.3 * Math.sin(t * 2.2) : 0.12;
    c.save();
    c.globalAlpha = 0.35;
    blitRobot(c, art.sprites.hollow, x, y, 1.1, 0.12);
    c.restore();
    pool(c, x + HEAD.hollow.x * 1.1, y + HEAD.hollow.y * 1.1, 60, "rgba(170,255,245,A)", a);
    eyesInDark(c, "hollow", x, y, 1.1, a + 0.15);
  }
}

function drawJumpscare(c, art, g, v, t) {
  const id = g.killer || "hollow";
  const k = Math.min(1, g.jumpT / 0.22);
  const ease = 1 - Math.pow(1 - k, 3);
  const S = 1.6 + ease * 1.9;
  const decay = Math.max(0, 1 - g.jumpT / JUMPSCARE_SECONDS);
  const sx = (Math.sin(t * 61) + Math.sin(t * 37)) * 9 * decay, sy = (Math.cos(t * 53) + Math.sin(t * 29)) * 7 * decay;
  c.fillStyle = "#030202";
  c.fillRect(0, 0, VW, VH);
  const h = HEAD[id];
  c.save();
  c.translate(VW / 2 + sx, VH * 0.5 + sy);
  // feet so that the head sits at screen centre
  drawRobot(c, id, -h.x * S, -h.y * S + 40 * ease, S, { eye: 1, jaw: 1, t: t * 6, tilt: id === "velvet" ? 0.25 * ease : (Math.random() - 0.5) * 0.04 });
  c.restore();
  // red-black vignette (no white flash)
  const gr = c.createRadialGradient(VW / 2, VH / 2, 160, VW / 2, VH / 2, 760);
  gr.addColorStop(0, "rgba(0,0,0,0)");
  gr.addColorStop(1, `rgba(60,0,0,${0.7 * (0.6 + 0.4 * decay)})`);
  c.fillStyle = gr;
  c.fillRect(0, 0, VW, VH);
}

/** draw one frame. `c` is the visible canvas context, already scaled to 1280×720 units. */
export function render(c, art, g, v, t) {
  if (g.phase === "jumpscare" || (g.phase === "lost" && g.killer)) {
    if (g.phase === "jumpscare") drawJumpscare(c, art, g, v, t);
    else {
      c.fillStyle = "#020101";
      c.fillRect(0, 0, VW, VH);
    }
    return;
  }
  const m = v.monitor;
  if (m < 0.999 || g.phase === "powerout") drawOffice(c, art, g, v, t);
  if (g.phase === "powerout") {
    drawPowerOut(c, art, g, v, t);
    return;
  }
  if (m > 0.001) {
    const y = VH * (1 - m);
    if (m >= 0.999) {
      drawFeed(c, art, g, v, t);
    } else {
      // the monitor rising
      c.fillStyle = "#0b0d0d";
      c.fillRect(30, y + 10, VW - 60, VH);
      c.fillStyle = "#151918";
      rr(c, 30, y + 10, VW - 60, VH, 18);
      c.fill();
      c.globalAlpha = 0.6;
      c.drawImage(art.noise[Math.floor(t * 30) % 4], 60, y + 40, VW - 120, VH - 80);
      c.globalAlpha = 1;
    }
  }
}

/** menu backdrop: the showroom camera with all three of them, and the odd burst of static */
export function renderMenu(c, art, t) {
  const fake = {
    cam: "showroom",
    glitch: 0,
    at: () => ["rustjaw", "velvet", "hollow"],
    robots: { rustjaw: { moves: 0 }, velvet: { moves: 0 }, hollow: { moves: 0 } },
  };
  const burstOn = t > 1 && (t % 9) < 0.35;
  c.save();
  c.translate(VW * 0.2, 0);
  drawFeed(c, art, fake, { static: burstOn ? 0.6 : 0 }, t);
  c.restore();
  const g = c.createLinearGradient(0, 0, VW * 0.6, 0);
  g.addColorStop(0, "rgba(0,0,0,0.92)");
  g.addColorStop(0.45, "rgba(0,0,0,0.6)");
  g.addColorStop(1, "rgba(0,0,0,0.2)");
  c.fillStyle = g;
  c.fillRect(0, 0, VW, VH);
}
