/**
 * Corridor 9 — every texture is drawn on a canvas at start-up (no image
 * files). Surfaces that repeat through the loop (floor, wall, ceiling) are
 * forced symmetric — point-symmetric for floor/ceiling, mirror-symmetric
 * for walls — so the 180° teleport can't shift a single pixel of grime.
 */
import * as THREE from "three";

const FONT = "Arial, Helvetica, sans-serif";

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function tex(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** make the image point-symmetric (180° rotation) — copy top half into bottom */
function pointSym(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h / 2; y++)
    for (let x = 0; x < w; x++) {
      const a = (y * w + x) * 4, b = ((h - 1 - y) * w + (w - 1 - x)) * 4;
      d[b] = d[a];
      d[b + 1] = d[a + 1];
      d[b + 2] = d[a + 2];
      d[b + 3] = d[a + 3];
    }
  ctx.putImageData(img, 0, 0);
}
/** make the image mirror-symmetric about x = 0 (≡ x = w): copy left half → right */
function mirrorSym(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w / 2; x++) {
      const a = (y * w + x) * 4, b = (y * w + (w - 1 - x)) * 4;
      d[b] = d[a];
      d[b + 1] = d[a + 1];
      d[b + 2] = d[a + 2];
      d[b + 3] = d[a + 3];
    }
  ctx.putImageData(img, 0, 0);
}
function speckle(ctx, w, h, n, rand, light = 0.05, dark = 0.06) {
  for (let i = 0; i < n; i++) {
    const v = rand();
    ctx.fillStyle = v < 0.5 ? `rgba(255,255,255,${light * rand()})` : `rgba(0,0,0,${dark * rand()})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

/* ------------------------------------------------------------- surfaces */
/** floor: 1.6 m period, 4×4 tiles of 0.4 m */
export function floorTextures() {
  const N = 512, n = 4, s = N / n;
  const [c, x] = canvas(N, N);
  const rand = seeded(7);
  const base = ["#6b675f", "#66625b", "#706b63", "#625e57"];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      x.fillStyle = base[Math.floor(rand() * base.length)];
      x.fillRect(i * s, j * s, s, s);
      const gr = x.createLinearGradient(i * s, j * s, i * s + s, j * s + s);
      gr.addColorStop(0, "rgba(255,255,255,0.05)");
      gr.addColorStop(1, "rgba(0,0,0,0.06)");
      x.fillStyle = gr;
      x.fillRect(i * s, j * s, s, s);
    }
  speckle(x, N, N, 9000, rand, 0.08, 0.1);
  // a few scuffs
  x.strokeStyle = "rgba(20,18,16,0.12)";
  for (let k = 0; k < 18; k++) {
    x.lineWidth = 1 + rand() * 2;
    x.beginPath();
    const px = rand() * N, py = rand() * N;
    x.moveTo(px, py);
    x.quadraticCurveTo(px + rand() * 40 - 20, py + rand() * 40 - 20, px + rand() * 70 - 35, py + rand() * 70 - 35);
    x.stroke();
  }
  // grout
  x.fillStyle = "#2b2926";
  for (let i = 0; i <= n; i++) {
    x.fillRect(i * s - 3, 0, 6, N);
    x.fillRect(0, i * s - 3, N, 6);
  }
  pointSym(x, N, N);
  const map = tex(c, { repeat: true });
  // bump: grout recessed
  const [b, y] = canvas(256, 256);
  y.fillStyle = "#fff";
  y.fillRect(0, 0, 256, 256);
  y.fillStyle = "#000";
  for (let i = 0; i <= n; i++) {
    y.fillRect(i * 64 - 2, 0, 4, 256);
    y.fillRect(0, i * 64 - 2, 256, 4);
  }
  const bump = tex(b, { repeat: true, srgb: false });
  return { map, bump };
}

/** walls: 1.6 m period along the wall, full height (H) vertically */
export function wallTexture(H) {
  const Wd = 512, Ht = 1024;
  const [c, x] = canvas(Wd, Ht);
  const rand = seeded(21);
  const py = (m) => Ht - (m / H) * Ht; // metres from floor → pixel row
  // upper paint
  const up = x.createLinearGradient(0, 0, 0, py(1.4));
  up.addColorStop(0, "#9b978c");
  up.addColorStop(0.18, "#c9c4b6");
  up.addColorStop(1, "#d3cebf");
  x.fillStyle = up;
  x.fillRect(0, 0, Wd, py(1.37));
  speckle(x, Wd, py(1.37), 5000, rand, 0.05, 0.05);
  // glazed tiles 0.2 × 0.1 m below the stripe
  const cols = 8, tw = Wd / cols, th = (0.1 / H) * Ht;
  const tileTop = py(1.25), tileBot = py(0.12);
  for (let r = 0; tileBot - (r + 1) * th >= tileTop - 0.5; r++) {
    for (let i = 0; i < cols; i++) {
      const k = 0.94 + rand() * 0.08;
      x.fillStyle = shade("#d9dccf", k);
      const y0 = tileBot - (r + 1) * th;
      x.fillRect(i * tw, y0, tw, th);
      const gl = x.createLinearGradient(0, y0, 0, y0 + th);
      gl.addColorStop(0, "rgba(255,255,255,0.18)");
      gl.addColorStop(1, "rgba(0,0,0,0.05)");
      x.fillStyle = gl;
      x.fillRect(i * tw, y0, tw, th);
    }
  }
  x.fillStyle = "#8f9188";
  for (let i = 0; i <= cols; i++) x.fillRect(i * tw - 1.5, tileTop, 3, tileBot - tileTop);
  for (let r = 0; tileBot - r * th >= tileTop - 0.5; r++) x.fillRect(0, tileBot - r * th - 1.5, Wd, 3);
  // lower grime on tiles
  const gr = x.createLinearGradient(0, tileTop, 0, tileBot);
  gr.addColorStop(0, "rgba(0,0,0,0)");
  gr.addColorStop(1, "rgba(40,36,28,0.22)");
  x.fillStyle = gr;
  x.fillRect(0, tileTop, Wd, tileBot - tileTop);
  speckle(x, Wd, tileBot - tileTop, 2500, rand, 0.04, 0.05);
  // teal stripe + thin dark line
  x.fillStyle = "#1f5a5c";
  x.fillRect(0, py(1.37), Wd, py(1.25) - py(1.37));
  x.fillStyle = "#16393b";
  x.fillRect(0, py(1.37) - 3, Wd, 3);
  x.fillStyle = "#3d7a7a";
  x.fillRect(0, py(1.25) - 2, Wd, 2);
  // skirting
  x.fillStyle = "#2c2a27";
  x.fillRect(0, tileBot, Wd, Ht - tileBot);
  x.fillStyle = "rgba(255,255,255,0.06)";
  x.fillRect(0, tileBot, Wd, 3);
  mirrorSym(x, Wd, Ht);
  return tex(c, { repeat: true });
}

/** ceiling: 1.6 m period, 2×2 panels of 0.8 m */
export function ceilingTexture() {
  const N = 256, s = N / 2;
  const [c, x] = canvas(N, N);
  const rand = seeded(3);
  x.fillStyle = "#a8a59c";
  x.fillRect(0, 0, N, N);
  speckle(x, N, N, 6000, rand, 0.06, 0.1);
  x.fillStyle = "#6d6a63";
  for (let i = 0; i <= 2; i++) {
    x.fillRect(i * s - 3, 0, 6, N);
    x.fillRect(0, i * s - 3, N, 6);
  }
  pointSym(x, N, N);
  return tex(c, { repeat: true });
}

/* ------------------------------------------------------------- posters */
function frameText(x, text, px, y, size, color, weight = "bold", align = "center", font = FONT) {
  x.font = `${weight} ${size}px ${font}`;
  x.fillStyle = color;
  x.textAlign = align;
  x.textBaseline = "middle";
  x.fillText(text, px, y);
}
function paper(x, w, h, col) {
  x.fillStyle = col;
  x.fillRect(0, 0, w, h);
  const rand = seeded(w + h);
  speckle(x, w, h, 1500, rand, 0.05, 0.05);
}

export function posterTexture(kind) {
  const w = 512, h = 720;
  const [c, x] = canvas(w, h);
  if (kind === "metro") {
    paper(x, w, h, "#e9e4d6");
    frameText(x, "UNDERLINE", w / 2, 70, 58, "#1d2c3a");
    frameText(x, "network map · zone B", w / 2, 120, 24, "#4c5966", "normal");
    const lines = [["#c2482d", 210], ["#2f6db0", 320], ["#3a8f55", 430], ["#d6a12a", 540]];
    lines.forEach(([col, y0], i) => {
      x.strokeStyle = col;
      x.lineWidth = 14;
      x.lineCap = "round";
      x.beginPath();
      x.moveTo(60, y0);
      x.lineTo(180 + i * 20, y0);
      x.lineTo(260 + i * 15, y0 - 60 + i * 30);
      x.lineTo(450, y0 - 60 + i * 30);
      x.stroke();
      for (let k = 0; k < 4; k++) {
        x.fillStyle = "#fff";
        x.beginPath();
        x.arc(80 + k * 120, k < 2 ? y0 : y0 - 60 + i * 30, 10, 0, Math.PI * 2);
        x.fill();
        x.lineWidth = 4;
        x.strokeStyle = "#1d2c3a";
        x.stroke();
      }
    });
    frameText(x, "Exits are numbered. Please count them.", w / 2, 650, 22, "#1d2c3a", "normal");
  } else if (kind === "lost") {
    paper(x, w, h, "#e48a2c");
    x.fillStyle = "#fff4e2";
    x.beginPath();
    x.arc(w / 2, 300, 150, 0, Math.PI * 2);
    x.fill();
    // umbrella icon
    x.fillStyle = "#2a2a2a";
    x.beginPath();
    x.arc(w / 2, 300, 95, Math.PI, 0);
    x.fill();
    x.fillRect(w / 2 - 5, 300, 10, 110);
    x.lineWidth = 10;
    x.strokeStyle = "#2a2a2a";
    x.beginPath();
    x.arc(w / 2 - 22, 410, 22, 0, Math.PI);
    x.stroke();
    frameText(x, "LOST", w / 2, 520, 92, "#2a1d10");
    frameText(x, "& FOUND", w / 2, 600, 58, "#2a1d10");
    frameText(x, "Office B2 · open 06:00 – 23:00", w / 2, 665, 22, "#3a2814", "normal");
  } else if (kind === "seaside" || kind === "seaside_wrong") {
    const wrong = kind === "seaside_wrong";
    const sky = x.createLinearGradient(0, 0, 0, 430);
    sky.addColorStop(0, wrong ? "#1b0d0d" : "#7cc3e6");
    sky.addColorStop(1, wrong ? "#4a1414" : "#f3d9a6");
    x.fillStyle = sky;
    x.fillRect(0, 0, w, 430);
    if (!wrong) {
      x.fillStyle = "#ffcf4a";
      x.beginPath();
      x.arc(w / 2, 330, 90, 0, Math.PI * 2);
      x.fill();
    } else {
      // an eye where the sun was
      x.fillStyle = "#e8ddc8";
      x.beginPath();
      x.ellipse(w / 2, 320, 150, 78, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = "#3a0a0a";
      x.beginPath();
      x.arc(w / 2, 320, 62, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = "#050202";
      x.beginPath();
      x.arc(w / 2, 320, 30, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = "rgba(255,255,255,0.8)";
      x.beginPath();
      x.arc(w / 2 - 18, 302, 9, 0, Math.PI * 2);
      x.fill();
    }
    const sea = x.createLinearGradient(0, 430, 0, 600);
    sea.addColorStop(0, wrong ? "#5c0f0f" : "#2a7fb4");
    sea.addColorStop(1, wrong ? "#220404" : "#174a73");
    x.fillStyle = sea;
    x.fillRect(0, 430, w, 170);
    x.strokeStyle = wrong ? "rgba(255,120,120,0.25)" : "rgba(255,255,255,0.45)";
    x.lineWidth = 4;
    for (let k = 0; k < 6; k++) {
      x.beginPath();
      for (let px = 0; px <= w; px += 16) x.lineTo(px, 455 + k * 24 + Math.sin(px / 30 + k) * 5);
      x.stroke();
    }
    x.fillStyle = wrong ? "#160707" : "#f6f0e2";
    x.fillRect(0, 600, w, 120);
    frameText(x, "SEASIDE LINE", w / 2, 70, 60, wrong ? "#e6d8c4" : "#0f3a5c");
    frameText(x, wrong ? "you never left" : "weekend trips · every 20 min", w / 2, 125, 24, wrong ? "#b98a7a" : "#2d4f68", "normal");
    frameText(x, "Platform 4  →", w / 2, 660, 38, wrong ? "#7a2a22" : "#0f3a5c");
  } else if (kind === "concert") {
    paper(x, w, h, "#1f1c2c");
    for (let k = 0; k < 9; k++) {
      x.strokeStyle = `hsla(${200 + k * 12}, 60%, ${55 + k * 3}%, 0.85)`;
      x.lineWidth = 6;
      x.beginPath();
      x.arc(w / 2, 360, 40 + k * 22, Math.PI * 1.1, Math.PI * 1.9);
      x.stroke();
    }
    frameText(x, "CITY", w / 2, 520, 70, "#efe6d2");
    frameText(x, "STRING QUARTET", w / 2, 585, 40, "#d9b56a");
    frameText(x, "Hall 2 · Fridays 19:30", w / 2, 650, 24, "#a49fb6", "normal");
    frameText(x, "LIVE", w / 2, 110, 36, "#d9b56a");
  }
  return tex(c);
}

/** the pale rectangle left behind by a missing poster */
export function missingPosterTexture() {
  const w = 256, h = 360;
  const [c, x] = canvas(w, h);
  x.fillStyle = "rgba(240,236,224,0.55)";
  x.fillRect(10, 10, w - 20, h - 20);
  x.strokeStyle = "rgba(90,80,60,0.25)";
  x.lineWidth = 3;
  x.strokeRect(10, 10, w - 20, h - 20);
  // tape scraps
  x.fillStyle = "rgba(230,220,180,0.9)";
  [[18, 18], [w - 18, 18], [18, h - 18], [w - 18, h - 18]].forEach(([px, py]) => {
    x.save();
    x.translate(px, py);
    x.rotate(0.6);
    x.fillRect(-16, -6, 32, 12);
    x.restore();
  });
  return tex(c);
}

/** wall info sign; red = the anomaly */
export function infoSignTexture(red) {
  const w = 512, h = 256;
  const [c, x] = canvas(w, h);
  x.fillStyle = red ? "#a31512" : "#1d4f8c";
  x.fillRect(0, 0, w, h);
  x.strokeStyle = "rgba(255,255,255,0.9)";
  x.lineWidth = 8;
  x.strokeRect(14, 14, w - 28, h - 28);
  if (red) {
    x.fillStyle = "#fff";
    x.beginPath();
    x.moveTo(90, 60);
    x.lineTo(150, 170);
    x.lineTo(30, 170);
    x.closePath();
    x.fill();
    frameText(x, "!", 90, 135, 80, "#a31512");
    frameText(x, "DO NOT", 330, 95, 62, "#fff");
    frameText(x, "TURN AROUND", 330, 165, 52, "#fff");
  } else {
    x.fillStyle = "#fff";
    x.beginPath();
    x.arc(90, 128, 58, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#1d4f8c";
    x.beginPath();
    x.moveTo(60, 128);
    x.lineTo(100, 92);
    x.lineTo(100, 114);
    x.lineTo(125, 114);
    x.lineTo(125, 142);
    x.lineTo(100, 142);
    x.lineTo(100, 164);
    x.closePath();
    x.fill();
    frameText(x, "PLEASE KEEP", 330, 95, 50, "#fff");
    frameText(x, "TO THE LEFT", 330, 160, 50, "#fff");
  }
  return tex(c);
}

/** hanging exit sign: number big, arrow, label — redrawn when the exit changes */
export function exitSignCanvas() {
  const [c, x] = canvas(512, 160);
  const t = tex(c);
  const draw = (n, final = false) => {
    x.fillStyle = "#0b0f0c";
    x.fillRect(0, 0, 512, 160);
    x.fillStyle = final ? "#1b6b33" : "#d8b33a";
    x.fillRect(8, 8, 150, 144);
    frameText(x, String(n), 83, 84, 120, "#0b0f0c");
    frameText(x, "EXIT", 330, 62, 64, "#efe9d8");
    frameText(x, final ? "→  WAY OUT" : "↑  PASSAGE 9", 330, 120, 32, final ? "#5fd07c" : "#c9c1a8");
    t.needsUpdate = true;
  };
  draw(0);
  return { texture: t, draw };
}

/** the rules notice that hangs in both connectors */
export function noticeTexture() {
  const w = 512, h = 680;
  const [c, x] = canvas(w, h);
  paper(x, w, h, "#ece6d4");
  x.fillStyle = "#1c1c1c";
  x.fillRect(0, 0, w, 96);
  frameText(x, "NOTICE", w / 2, 50, 58, "#ece6d4");
  const lines = [
    ["Look carefully at the passage.", true],
    ["", false],
    ["If you notice anything unusual,", false],
    ["turn back immediately.", true],
    ["", false],
    ["If you notice nothing unusual,", false],
    ["do not turn back.", true],
    ["", false],
    ["Leave through Exit 9.", true],
  ];
  lines.forEach(([t, b], i) => frameText(x, t, w / 2, 160 + i * 46, b ? 32 : 28, "#222", b ? "bold" : "normal"));
  x.fillStyle = "#1c1c1c";
  x.fillRect(40, h - 70, w - 80, 3);
  frameText(x, "— Passage Authority", w - 60, h - 38, 22, "#555", "italic", "right");
  return tex(c);
}

export function doorTexture(label, num) {
  const w = 256, h = 560;
  const [c, x] = canvas(w, h);
  const g = x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, "#56605a");
  g.addColorStop(0.5, "#5f6a63");
  g.addColorStop(1, "#525c56");
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  speckle(x, w, h, 3000, seeded(label.length * 31), 0.05, 0.08);
  x.strokeStyle = "rgba(0,0,0,0.25)";
  x.lineWidth = 4;
  x.strokeRect(22, 30, w - 44, h - 60);
  // label plate
  x.fillStyle = "#d8d2bf";
  x.fillRect(40, 120, w - 80, 70);
  frameText(x, label, w / 2, 145, 26, "#222");
  frameText(x, num, w / 2, 175, 18, "#555", "normal");
  // kick plate
  x.fillStyle = "#3d4440";
  x.fillRect(0, h - 70, w, 70);
  // grime near the handle
  x.fillStyle = "rgba(20,18,14,0.18)";
  x.beginPath();
  x.ellipse(w - 46, h * 0.52, 26, 50, 0, 0, Math.PI * 2);
  x.fill();
  return tex(c);
}

/** clock face (numbers + ticks) */
export function clockFaceTexture() {
  const N = 512;
  const [c, x] = canvas(N, N);
  x.fillStyle = "#f2efe6";
  x.beginPath();
  x.arc(N / 2, N / 2, N / 2, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = "#222";
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const big = i % 5 === 0;
    x.lineWidth = big ? 10 : 4;
    x.beginPath();
    x.moveTo(N / 2 + Math.sin(a) * (N / 2 - 18), N / 2 - Math.cos(a) * (N / 2 - 18));
    x.lineTo(N / 2 + Math.sin(a) * (N / 2 - (big ? 58 : 36)), N / 2 - Math.cos(a) * (N / 2 - (big ? 58 : 36)));
    x.stroke();
  }
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    frameText(x, String(i), N / 2 + Math.sin(a) * 160, N / 2 - Math.cos(a) * 160 + 4, 52, "#222");
  }
  frameText(x, "PASSAGE TIME", N / 2, N / 2 + 90, 20, "#777", "normal");
  return tex(c);
}

/** a soft human shadow (alpha) */
export function shadowTexture() {
  const w = 256, h = 512;
  const [c, x] = canvas(w, h);
  x.filter = "blur(10px)";
  x.fillStyle = "#000";
  x.beginPath();
  x.ellipse(w / 2, 80, 36, 44, 0, 0, Math.PI * 2); // head
  x.fill();
  x.beginPath();
  x.moveTo(w / 2 - 34, 128);
  x.quadraticCurveTo(w / 2 - 80, 140, w / 2 - 84, 230); // shoulder/arm
  x.lineTo(w / 2 - 92, 360);
  x.lineTo(w / 2 - 70, 362);
  x.lineTo(w / 2 - 54, 260);
  x.lineTo(w / 2 - 48, 500);
  x.lineTo(w / 2 + 48, 500);
  x.lineTo(w / 2 + 54, 260);
  x.lineTo(w / 2 + 70, 362);
  x.lineTo(w / 2 + 92, 360);
  x.lineTo(w / 2 + 84, 230);
  x.quadraticCurveTo(w / 2 + 80, 140, w / 2 + 34, 128);
  x.closePath();
  x.fill();
  x.filter = "none";
  return tex(c);
}

/** soft dark blob (contact shadows, puddle) */
export function blobTexture(inner = 0.6) {
  const N = 128;
  const [c, x] = canvas(N, N);
  const g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(inner, "rgba(0,0,0,0.6)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, N, N);
  return tex(c);
}

/** wet stain for the leak (darkens and glosses the floor) */
export function puddleTexture() {
  const N = 256;
  const [c, x] = canvas(N, N);
  const rand = seeded(99);
  x.fillStyle = "rgba(0,0,0,0)";
  x.fillRect(0, 0, N, N);
  for (let k = 0; k < 14; k++) {
    const r = 20 + rand() * 50;
    const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.7, "rgba(255,255,255,0.8)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.save();
    x.translate(N / 2 + (rand() - 0.5) * 90, N / 2 + (rand() - 0.5) * 90);
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, r, 0, Math.PI * 2);
    x.fill();
    x.restore();
  }
  return tex(c, { srgb: false });
}
