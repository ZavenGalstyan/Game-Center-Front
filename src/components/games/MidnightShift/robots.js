/**
 * Midnight Shift — vector drawings of the three original robots.
 * Local coordinates: feet centre at (0,0), up is −y. Heights ≈ 300/330/380.
 * `o.eye` (0..1) scales eye glow, `o.tilt` tilts the head (radians),
 * `o.jaw` (0..1) opens Rustjaw's jaw further, `o.t` is time for small motion.
 */

export const HEAD = { rustjaw: { x: 0, y: -272 }, velvet: { x: 0, y: -286 }, hollow: { x: 0, y: -350 } };
/** eye positions (feet-relative) and glow colours, for "eyes in the dark" hints */
export const EYES = {
  rustjaw: { pts: [[-28, -280]], color: "rgba(255,170,40,A)", r: 10 },
  velvet: { pts: [[-12, -290], [14, -287]], color: "rgba(255,120,180,A)", r: 5 },
  hollow: { pts: [[0, -350]], color: "rgba(170,255,245,A)", r: 14 },
};
export const HEIGHT = { rustjaw: 320, velvet: 340, hollow: 390 };

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function glow(c, x, y, r, color, a) {
  if (a <= 0.01) return;
  const gr = c.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, color.replace("A", String(a)));
  gr.addColorStop(1, color.replace("A", "0"));
  c.fillStyle = gr;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}
function limb(c, pts, w, color, joint) {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.stroke();
  if (joint)
    for (let i = 1; i < pts.length - 1; i++) {
      c.fillStyle = joint;
      c.beginPath();
      c.arc(pts[i][0], pts[i][1], w * 0.62, 0, Math.PI * 2);
      c.fill();
    }
}

/* ------------------------------------------------------------------ Rustjaw */
function rustjaw(c, o) {
  const eye = o.eye ?? 1;
  const jaw = o.jaw ?? 0;
  const rustG = (x0, x1) => {
    const g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, "#3a1a0b");
    g.addColorStop(0.35, "#9a4f24");
    g.addColorStop(0.6, "#7a3c1a");
    g.addColorStop(1, "#2a1308");
    return g;
  };
  // legs (pistons)
  for (const s of [-1, 1]) {
    c.fillStyle = rustG(s * 22 - 18, s * 22 + 18);
    rr(c, s * 34 - 17, -118, 34, 96, 6);
    c.fill();
    c.fillStyle = "#c9c2b0";
    c.fillRect(s * 34 - 6, -110, 12, 50);
    c.fillStyle = "#22140c";
    c.beginPath();
    c.ellipse(s * 38, -10, 40, 16, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#5d2d14";
    rr(c, s * 38 - 38, -26, 76, 20, 8);
    c.fill();
  }
  // hanging arms (behind torso edge)
  for (const s of [-1, 1]) {
    limb(c, [[s * 88, -222], [s * 112, -150], [s * 104, -78]], 22, "#5a2b12", "#2b150a");
    // claw
    c.strokeStyle = "#bdb3a0";
    c.lineWidth = 6;
    c.lineCap = "round";
    for (const k of [-1, 0, 1]) {
      c.beginPath();
      c.moveTo(s * 104, -78);
      c.quadraticCurveTo(s * (104 + k * 14), -52, s * (104 + k * 20) - s * 6, -40);
      c.stroke();
    }
  }
  // torso barrel
  c.fillStyle = rustG(-80, 80);
  rr(c, -78, -238, 156, 134, 26);
  c.fill();
  c.strokeStyle = "rgba(0,0,0,0.45)";
  c.lineWidth = 4;
  for (const y of [-206, -150]) {
    c.beginPath();
    c.moveTo(-76, y);
    c.lineTo(76, y);
    c.stroke();
  }
  c.fillStyle = "#c08a55";
  for (let i = -3; i <= 3; i++) for (const y of [-212, -144]) {
    c.beginPath();
    c.arc(i * 21, y, 2.6, 0, Math.PI * 2);
    c.fill();
  }
  // rust streaks
  c.fillStyle = "rgba(40,14,4,0.5)";
  for (const [x, w, h] of [[-50, 7, 40], [22, 5, 56], [48, 8, 30]]) c.fillRect(x, -200, w, h);
  // pressure gauge
  c.fillStyle = "#d8d0bb";
  c.beginPath();
  c.arc(0, -178, 19, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#2b2016";
  c.lineWidth = 4;
  c.stroke();
  c.strokeStyle = "#a01c10";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(0, -178);
  const na = -0.6 + Math.sin((o.t || 0) * 3) * 0.15 + 1.9;
  c.lineTo(Math.cos(na) * 14, -178 + Math.sin(na) * -14);
  c.stroke();
  // furnace grate glow in belly
  c.fillStyle = "#1c0a04";
  rr(c, -34, -142, 68, 24, 5);
  c.fill();
  glow(c, 0, -130, 46, "rgba(255,110,30,A)", 0.45 * eye);
  c.fillStyle = `rgba(255,140,50,${0.55 * eye})`;
  for (let i = -2; i <= 2; i++) c.fillRect(i * 12 - 3, -138, 6, 16);
  // shoulders + exhaust stacks
  for (const s of [-1, 1]) {
    c.fillStyle = "#4a2410";
    c.beginPath();
    c.arc(s * 82, -222, 28, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2a2622";
    rr(c, s * 64 - 9, -292, 18, 64, 4);
    c.fill();
    c.fillStyle = "#161412";
    c.fillRect(s * 64 - 11, -296, 22, 8);
  }
  // head
  c.save();
  c.translate(0, -258);
  c.rotate(o.tilt || 0);
  c.fillStyle = rustG(-66, 66);
  rr(c, -66, -58, 132, 62, 14);
  c.fill();
  // brow
  c.fillStyle = "#2c1408";
  c.fillRect(-62, -44, 124, 10);
  // eyes: left glowing amber, right dead + cracked
  c.fillStyle = "#120804";
  c.beginPath();
  c.arc(-28, -22, 15, 0, Math.PI * 2);
  c.arc(28, -22, 15, 0, Math.PI * 2);
  c.fill();
  glow(c, -28, -22, 40, "rgba(255,170,40,A)", 0.6 * eye);
  c.fillStyle = `rgba(255,${190 + 40 * eye},90,${0.35 + 0.65 * eye})`;
  c.beginPath();
  c.arc(-28, -22, 8, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#2e2a24";
  c.beginPath();
  c.arc(28, -22, 9, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#8a8070";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(18, -34);
  c.lineTo(36, -12);
  c.moveTo(34, -34);
  c.lineTo(22, -14);
  c.stroke();
  // mouth cavity
  const open = 18 + jaw * 30;
  c.fillStyle = "#080302";
  c.fillRect(-58, 2, 116, open + 6);
  glow(c, 0, 8 + open * 0.5, 50, "rgba(255,90,20,A)", 0.22 * eye);
  // upper teeth
  c.fillStyle = "#d4cdb8";
  for (let i = 0; i < 9; i++) {
    const x = -54 + i * 13.5;
    c.beginPath();
    c.moveTo(x, 2);
    c.lineTo(x + 12, 2);
    c.lineTo(x + 6, 16 + (i % 2) * 5);
    c.fill();
  }
  // hanging jaw
  c.save();
  c.translate(0, 2 + open);
  c.fillStyle = rustG(-60, 60);
  c.beginPath();
  c.moveTo(-60, 0);
  c.lineTo(60, 0);
  c.lineTo(52, 34);
  c.lineTo(-52, 36);
  c.closePath();
  c.fill();
  c.fillStyle = "#d4cdb8";
  for (let i = 0; i < 8; i++) {
    const x = -50 + i * 13.5;
    c.beginPath();
    c.moveTo(x, 1);
    c.lineTo(x + 12, 1);
    c.lineTo(x + 6, -12 - (i % 2) * 5);
    c.fill();
  }
  c.strokeStyle = "#1a0c05";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-60, 0);
  c.lineTo(-64, -open + 2);
  c.moveTo(60, 0);
  c.lineTo(64, -open + 2);
  c.stroke();
  c.restore();
  c.restore();
}

/* ------------------------------------------------------------------ Velvet Doll */
function velvet(c, o) {
  const eye = o.eye ?? 1;
  // legs
  for (const s of [-1, 1]) {
    limb(c, [[s * 20, -40], [s * 22, -6]], 11, "#d9d0c2", null);
    c.fillStyle = "#111";
    c.beginPath();
    c.ellipse(s * 24, -4, 13, 6, 0, 0, Math.PI * 2);
    c.fill();
  }
  // skirt (bell)
  const sk = c.createLinearGradient(-100, 0, 100, 0);
  sk.addColorStop(0, "#2a040c");
  sk.addColorStop(0.3, "#8a1730");
  sk.addColorStop(0.55, "#a6213b");
  sk.addColorStop(1, "#2a040c");
  c.fillStyle = sk;
  c.beginPath();
  c.moveTo(-30, -176);
  c.quadraticCurveTo(-60, -110, -98, -36);
  for (let i = 0; i <= 10; i++) {
    const x = -98 + i * 19.6;
    c.quadraticCurveTo(x - 9.8, -24, x, -36);
  }
  c.quadraticCurveTo(60, -110, 30, -176);
  c.closePath();
  c.fill();
  // folds
  c.strokeStyle = "rgba(20,0,4,0.55)";
  c.lineWidth = 3;
  for (const x of [-52, -20, 14, 46]) {
    c.beginPath();
    c.moveTo(x * 0.3, -168);
    c.quadraticCurveTo(x * 0.7, -100, x, -40);
    c.stroke();
  }
  // moth holes
  c.fillStyle = "rgba(10,0,2,0.8)";
  for (const [x, y, r] of [[-40, -80, 4], [30, -120, 3], [52, -60, 5]]) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  // lace hem
  c.strokeStyle = "rgba(225,214,200,0.75)";
  c.lineWidth = 4;
  c.beginPath();
  for (let i = 0; i <= 10; i++) {
    const x = -98 + i * 19.6;
    if (i === 0) c.moveTo(x, -36);
    else c.quadraticCurveTo(x - 9.8, -22, x, -36);
  }
  c.stroke();
  // wind-up key (behind)
  c.fillStyle = "#8a7a4a";
  c.fillRect(-58, -222, 26, 6);
  c.beginPath();
  c.ellipse(-66, -219, 10, 16, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#1c1408";
  c.beginPath();
  c.ellipse(-66, -219, 4, 8, 0, 0, Math.PI * 2);
  c.fill();
  // bodice
  c.fillStyle = "#5c0d1d";
  c.beginPath();
  c.moveTo(-28, -244);
  c.lineTo(28, -244);
  c.lineTo(32, -172);
  c.lineTo(-32, -172);
  c.closePath();
  c.fill();
  c.fillStyle = "#e8dfcf";
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.arc(0, -232 + i * 15, 3, 0, Math.PI * 2);
    c.fill();
  }
  // arms with ball joints
  const sway = Math.sin((o.t || 0) * 1.3) * 3;
  for (const s of [-1, 1]) {
    limb(c, [[s * 32, -238], [s * 54, -186 + sway * s], [s * 60, -128]], 9, "#ddd4c6", "#bfb4a4");
    c.strokeStyle = "#e6ddcf";
    c.lineWidth = 3;
    for (const k of [-2, -1, 0, 1]) {
      c.beginPath();
      c.moveTo(s * 60, -128);
      c.lineTo(s * (60 + k * 4), -100 + Math.abs(k) * 3);
      c.stroke();
    }
  }
  // lace collar
  c.fillStyle = "#e3d8c6";
  c.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    const x = Math.cos(a) * 40, y = -246 - Math.sin(a) * -10;
    if (i === 0) c.moveTo(x, y);
    else c.quadraticCurveTo(x - 5, y + 10, x, y);
  }
  c.lineTo(36, -244);
  c.lineTo(-36, -244);
  c.fill();
  // head
  c.save();
  c.translate(0, -286);
  c.rotate(o.tilt ?? 0.12);
  // hair ringlets
  c.fillStyle = "#15100e";
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.ellipse(s * 36, -6 + i * 20, 9, 12, 0, 0, Math.PI * 2);
    c.fill();
  }
  // bonnet
  c.fillStyle = "#4a0816";
  c.beginPath();
  c.ellipse(0, -10, 52, 50, 0, Math.PI * 1.02, Math.PI * 1.98);
  c.lineTo(48, 4);
  c.quadraticCurveTo(0, -30, -48, 4);
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(230,220,205,0.6)";
  c.lineWidth = 3;
  c.beginPath();
  c.ellipse(0, -10, 50, 48, 0, Math.PI * 1.05, Math.PI * 1.95);
  c.stroke();
  // face
  const fg = c.createRadialGradient(-10, -10, 4, 0, 0, 46);
  fg.addColorStop(0, "#f4eee4");
  fg.addColorStop(0.7, "#d9cfbf");
  fg.addColorStop(1, "#a59a88");
  c.fillStyle = fg;
  c.beginPath();
  c.ellipse(0, 2, 33, 40, 0, 0, Math.PI * 2);
  c.fill();
  // cracks
  c.strokeStyle = "rgba(40,28,24,0.75)";
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(12, -36);
  c.lineTo(8, -20);
  c.lineTo(16, -10);
  c.lineTo(10, 4);
  c.moveTo(16, -10);
  c.lineTo(26, -6);
  c.moveTo(-22, 22);
  c.lineTo(-14, 30);
  c.stroke();
  // cheeks
  c.fillStyle = "rgba(214,86,104,0.35)";
  for (const s of [-1, 1]) {
    c.beginPath();
    c.arc(s * 19, 14, 7, 0, Math.PI * 2);
    c.fill();
  }
  // eye sockets
  c.fillStyle = "#070405";
  for (const s of [-1, 1]) {
    c.beginPath();
    c.ellipse(s * 13, -4, 9, 11, 0, 0, Math.PI * 2);
    c.fill();
  }
  for (const s of [-1, 1]) {
    glow(c, s * 13, -3, 14, "rgba(255,110,170,A)", 0.55 * eye);
    c.fillStyle = `rgba(255,150,200,${0.3 + 0.7 * eye})`;
    c.beginPath();
    c.arc(s * 13, -3, 2.6, 0, Math.PI * 2);
    c.fill();
  }
  // stitched smile
  c.strokeStyle = "#3a1018";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-20, 22);
  c.quadraticCurveTo(0, 32, 20, 22);
  c.stroke();
  c.lineWidth = 1.4;
  for (let i = -3; i <= 3; i++) {
    const x = i * 5.5, y = 27 - Math.abs(i) * 0.9;
    c.beginPath();
    c.moveTo(x, y - 4);
    c.lineTo(x, y + 4);
    c.stroke();
  }
  // ribbon bow under chin
  c.fillStyle = "#7d1426";
  c.beginPath();
  c.moveTo(0, 44);
  c.lineTo(-18, 36);
  c.lineTo(-16, 54);
  c.closePath();
  c.moveTo(0, 44);
  c.lineTo(18, 36);
  c.lineTo(16, 54);
  c.closePath();
  c.fill();
  c.restore();
}

/* ------------------------------------------------------------------ Hollow Watcher */
function hollow(c, o) {
  const eye = o.eye ?? 1;
  const t = o.t || 0;
  // shroud
  const sg = c.createLinearGradient(-60, 0, 60, 0);
  sg.addColorStop(0, "#06090a");
  sg.addColorStop(0.45, "#1e2b2e");
  sg.addColorStop(0.6, "#172225");
  sg.addColorStop(1, "#050707");
  c.fillStyle = sg;
  c.beginPath();
  c.moveTo(-26, -322);
  c.quadraticCurveTo(-58, -300, -46, -200);
  c.lineTo(-58, -10);
  const teeth = [-58, -44, -36, -20, -8, 6, 18, 32, 44, 58];
  teeth.forEach((x, i) => c.lineTo(x, i % 2 ? 6 + Math.sin(t * 1.7 + i) * 3 : -14));
  c.lineTo(46, -200);
  c.quadraticCurveTo(58, -300, 26, -322);
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(120,170,165,0.12)";
  c.lineWidth = 2;
  for (const x of [-24, -6, 12, 28]) {
    c.beginPath();
    c.moveTo(x * 0.6, -300);
    c.lineTo(x, -20);
    c.stroke();
  }
  // long arms + fingers
  for (const s of [-1, 1]) {
    limb(c, [[s * 34, -300], [s * 66, -210], [s * 62, -96]], 7, "#141c1e", "#0c1112");
    c.strokeStyle = "#1a2426";
    c.lineWidth = 3;
    for (const k of [-1.5, -0.5, 0.5, 1.5]) {
      c.beginPath();
      c.moveTo(s * 62, -96);
      c.quadraticCurveTo(s * (62 + k * 4), -70, s * (62 + k * 7), -46 + Math.abs(k) * 4);
      c.stroke();
    }
  }
  // neck rod
  c.fillStyle = "#2a3436";
  c.fillRect(-4, -334, 8, 18);
  // lantern head
  c.save();
  c.translate(0, -352);
  c.rotate(o.tilt || 0);
  glow(c, 0, 0, 70, "rgba(150,255,240,A)", 0.28 * eye);
  c.fillStyle = "rgba(10,16,17,0.92)";
  c.beginPath();
  c.arc(0, 0, 30, 0, Math.PI * 2);
  c.fill();
  // glowing ring eye
  c.strokeStyle = `rgba(200,255,248,${0.25 + 0.75 * eye})`;
  c.lineWidth = 5;
  c.beginPath();
  c.arc(0, 2, 12, 0, Math.PI * 2);
  c.stroke();
  glow(c, 0, 2, 26, "rgba(170,255,245,A)", 0.5 * eye);
  c.fillStyle = "#020303";
  c.beginPath();
  c.arc(0, 2, 4, 0, Math.PI * 2);
  c.fill();
  // cage bars
  c.strokeStyle = "#4a5a5c";
  c.lineWidth = 3;
  c.beginPath();
  c.arc(0, 0, 30, 0, Math.PI * 2);
  c.stroke();
  for (const x of [-20, -8, 8, 20]) {
    const h = Math.sqrt(900 - x * x);
    c.beginPath();
    c.moveTo(x, -h);
    c.lineTo(x, h);
    c.stroke();
  }
  // cap + hook
  c.fillStyle = "#2c3638";
  c.beginPath();
  c.moveTo(-22, -26);
  c.lineTo(22, -26);
  c.lineTo(12, -40);
  c.lineTo(-12, -40);
  c.closePath();
  c.fill();
  c.strokeStyle = "#2c3638";
  c.lineWidth = 4;
  c.beginPath();
  c.arc(0, -48, 8, Math.PI * 0.1, Math.PI * 0.9, true);
  c.stroke();
  c.restore();
}

const DRAW = { rustjaw, velvet, hollow };

/** draw a robot with feet at (x,y), scale s */
export function drawRobot(c, id, x, y, s, o = {}) {
  c.save();
  c.translate(x, y);
  c.scale(s * (o.flip ? -1 : 1), s);
  DRAW[id](c, o);
  c.restore();
}

/**
 * Pre-rendered sprites (lit + darkened) so cameras/doorways stay cheap.
 * Returns { [id]: { lit, dark, w, h, fx, fy, res } } — feet at (fx, fy) in sprite pixels.
 */
export function buildSprites(res = 1.6) {
  const out = {};
  for (const id of Object.keys(DRAW)) {
    const w = Math.ceil(300 * res), h = Math.ceil((HEIGHT[id] + 60) * res);
    const fx = w / 2, fy = h - 10 * res;
    const mk = (eye) => {
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const c = cv.getContext("2d");
      drawRobot(c, id, fx, fy, res, { eye, t: 0 });
      return cv;
    };
    const lit = mk(0.9);
    const dark = mk(0);
    const dc = dark.getContext("2d");
    dc.globalCompositeOperation = "source-atop";
    dc.fillStyle = "rgba(2,3,4,0.86)";
    dc.fillRect(0, 0, w, h);
    out[id] = { lit, dark, w, h, fx, fy, res };
  }
  return out;
}

/** draw a cached sprite with feet at (x,y), scale s, brightness light (0..1) */
export function blitRobot(c, sp, x, y, s, light = 1, flip = false) {
  const k = s / sp.res;
  const w = sp.w * k, h = sp.h * k;
  c.save();
  c.translate(x, y);
  if (flip) c.scale(-1, 1);
  c.drawImage(sp.dark, -sp.fx * k, -sp.fy * k, w, h);
  if (light > 0.01) {
    c.globalAlpha = Math.min(1, light);
    c.drawImage(sp.lit, -sp.fx * k, -sp.fy * k, w, h);
  }
  c.restore();
}
