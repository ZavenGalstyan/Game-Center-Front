/**
 * The Cursed House — procedural canvas textures (all original, no files).
 * Each maker returns a THREE.CanvasTexture; world.js tracks and disposes them.
 */
import * as THREE from "three";

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
function tex(c, { repeat = true, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
let seed = 1234567;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const R = (a, b) => a + rnd() * (b - a);

function grime(x, w, h, n, rgb, a0, a1, r0, r1) {
  for (let i = 0; i < n; i++) {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
    const a = R(a0, a1);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    x.save();
    x.translate(R(0, w), R(0, h));
    const r = R(r0, r1);
    x.scale(r * R(0.6, 1.6), r);
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, 1, 0, 7);
    x.fill();
    x.restore();
  }
}
function speckle(x, w, h, n, alpha) {
  for (let i = 0; i < n; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    x.fillStyle = `rgba(${v},${v},${v},${R(0, alpha)})`;
    x.fillRect(R(0, w), R(0, h), R(1, 3), R(1, 3));
  }
}

/**
 * Wallpaper for one storey: canvas covers 2.5 m × 3 m (u along the wall,
 * v = height above the floor / 3). Bottom 0.9 m is wooden wainscot with a
 * chair rail; above it a faded damask; a dark crown at the top.
 */
export function wallpaper(base, ink, panel) {
  const W = 512, H = 614;
  const [c, x] = canvas(W, H);
  const yOf = (m) => H - (m / 3) * H; // metres above floor → canvas y
  x.fillStyle = base;
  x.fillRect(0, 0, W, H);
  // vertical stripes + damask motif
  for (let i = 0; i < 8; i++) {
    x.fillStyle = "rgba(0,0,0,0.07)";
    x.fillRect(i * 64 + 28, 0, 8, H);
  }
  x.strokeStyle = ink;
  x.fillStyle = ink;
  x.lineWidth = 2;
  for (let row = 0; row < 7; row++)
    for (let col = 0; col < 4; col++) {
      const cx = col * 128 + (row % 2 ? 64 : 0), cy = yOf(0.95) - row * 70 - 30;
      if (cy < yOf(2.95)) continue;
      x.save();
      x.translate(cx, cy);
      x.globalAlpha = 0.55;
      x.beginPath();
      x.moveTo(0, -26);
      x.bezierCurveTo(16, -14, 16, 8, 0, 26);
      x.bezierCurveTo(-16, 8, -16, -14, 0, -26);
      x.stroke();
      x.beginPath();
      x.arc(0, 0, 5, 0, 7);
      x.fill();
      for (const s of [-1, 1]) {
        x.beginPath();
        x.moveTo(0, 6);
        x.quadraticCurveTo(s * 22, 0, s * 18, -16);
        x.stroke();
      }
      x.restore();
    }
  x.globalAlpha = 1;
  // damp streaks and stains
  grime(x, W, yOf(0.9), 16, "40,30,10", 0.05, 0.16, 20, 90);
  for (let i = 0; i < 9; i++) {
    const sx = R(0, W), sy = R(0, H * 0.4), len = R(60, 260);
    const g = x.createLinearGradient(0, sy, 0, sy + len);
    g.addColorStop(0, "rgba(30,22,10,0.22)");
    g.addColorStop(1, "rgba(30,22,10,0)");
    x.fillStyle = g;
    x.fillRect(sx, sy, R(3, 10), len);
  }
  // peeling patches showing plaster
  for (let i = 0; i < 4; i++) {
    x.fillStyle = "rgba(150,140,120,0.35)";
    x.beginPath();
    const px = R(0, W), py = R(yOf(2.8), yOf(1.2));
    x.moveTo(px, py);
    for (let k = 0; k < 7; k++) x.lineTo(px + R(-30, 30), py + R(-24, 24));
    x.fill();
  }
  // crown
  x.fillStyle = "#1e1611";
  x.fillRect(0, 0, W, yOf(2.9));
  x.fillStyle = "rgba(255,255,255,0.05)";
  x.fillRect(0, yOf(2.9) - 3, W, 3);
  // wainscot panels
  const top = yOf(0.92);
  x.fillStyle = panel;
  x.fillRect(0, top, W, H - top);
  for (let i = 0; i < 2; i++) {
    const px = i * 256 + 22, pw = 212, py = top + 26, ph = H - top - 56;
    x.fillStyle = "rgba(0,0,0,0.22)";
    x.fillRect(px, py, pw, ph);
    x.fillStyle = "rgba(255,255,255,0.05)";
    x.fillRect(px + 3, py + 3, pw - 6, 3);
    x.fillStyle = panel;
    x.fillRect(px + 7, py + 7, pw - 14, ph - 14);
  }
  for (let i = 0; i < 260; i++) {
    x.strokeStyle = `rgba(0,0,0,${R(0.03, 0.1)})`;
    x.beginPath();
    const yy = R(top, H);
    x.moveTo(0, yy);
    x.lineTo(W, yy + R(-4, 4));
    x.stroke();
  }
  // chair rail + skirting
  x.fillStyle = "#2a1d14";
  x.fillRect(0, top - 9, W, 12);
  x.fillStyle = "rgba(255,255,255,0.08)";
  x.fillRect(0, top - 9, W, 2);
  x.fillStyle = "#17100b";
  x.fillRect(0, H - 22, W, 22);
  grime(x, W, H, 10, "10,8,6", 0.05, 0.15, 10, 40);
  speckle(x, W, H, 1600, 0.05);
  return tex(c);
}

/** Stone block wall (basement): 2 m × 2 m. */
export function stoneWall() {
  const W = 512, H = 512;
  const [c, x] = canvas(W, H);
  x.fillStyle = "#2b2824";
  x.fillRect(0, 0, W, H);
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const h = H / rows;
    let cx = r % 2 ? -40 : 0;
    while (cx < W) {
      const w = R(70, 130);
      const v = R(52, 82);
      x.fillStyle = `rgb(${v + 6},${v + 2},${v - 4})`;
      x.fillRect(cx + 3, r * h + 3, w - 6, h - 6);
      grime(x, 0, 0, 0);
      x.fillStyle = `rgba(0,0,0,${R(0.05, 0.2)})`;
      x.fillRect(cx + 3, r * h + h - 10, w - 6, 7);
      cx += w;
    }
  }
  grime(x, W, H, 22, "20,30,15", 0.08, 0.25, 30, 110);
  grime(x, W, H, 10, "0,0,0", 0.1, 0.3, 20, 60);
  speckle(x, W, H, 3000, 0.12);
  return tex(c);
}

/** Wide worn floorboards: 2 m × 2 m, boards along x. */
export function planks(tint = [74, 52, 36]) {
  const W = 512, H = 512;
  const [c, x] = canvas(W, H);
  const n = 10, bh = H / n;
  for (let i = 0; i < n; i++) {
    const k = R(0.75, 1.15);
    const [r, g, b] = tint.map((v) => Math.round(v * k));
    x.fillStyle = `rgb(${r},${g},${b})`;
    x.fillRect(0, i * bh, W, bh);
    // grain
    for (let j = 0; j < 22; j++) {
      x.strokeStyle = `rgba(0,0,0,${R(0.04, 0.14)})`;
      x.lineWidth = R(0.5, 1.8);
      x.beginPath();
      const y0 = i * bh + R(2, bh - 2);
      x.moveTo(0, y0);
      for (let px = 0; px <= W; px += 64) x.lineTo(px, y0 + R(-1.5, 1.5));
      x.stroke();
    }
    // board ends + nails
    const cut = R(60, 450);
    x.fillStyle = "rgba(0,0,0,0.5)";
    x.fillRect(cut, i * bh, 2, bh);
    x.fillStyle = "rgba(20,20,20,0.7)";
    for (const nx of [cut - 10, cut + 10]) {
      x.fillRect(nx, i * bh + 8, 3, 3);
      x.fillRect(nx, i * bh + bh - 11, 3, 3);
    }
    x.fillStyle = "rgba(0,0,0,0.55)";
    x.fillRect(0, i * bh, W, 2);
  }
  grime(x, W, H, 14, "15,10,5", 0.08, 0.25, 30, 110);
  // scratches
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = `rgba(255,230,200,${R(0.02, 0.06)})`;
    x.beginPath();
    const sx = R(0, W), sy = R(0, H);
    x.moveTo(sx, sy);
    x.lineTo(sx + R(-60, 60), sy + R(-8, 8));
    x.stroke();
  }
  speckle(x, W, H, 1500, 0.06);
  return tex(c);
}

/** Checker tiles (kitchen) or small square tiles (bathroom): 1 m × 1 m. */
export function tiles(a, b, n = 4, grout = "#1a1816") {
  const W = 256, H = 256;
  const [c, x] = canvas(W, H);
  const s = W / n;
  x.fillStyle = grout;
  x.fillRect(0, 0, W, H);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      x.fillStyle = (i + j) % 2 ? a : b;
      x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      x.fillStyle = `rgba(0,0,0,${R(0, 0.12)})`;
      x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      if (rnd() < 0.12) {
        // a crack
        x.strokeStyle = "rgba(0,0,0,0.5)";
        x.beginPath();
        let px = i * s + R(4, s - 4), py = j * s + 2;
        x.moveTo(px, py);
        for (let k = 0; k < 4; k++) {
          px += R(-8, 8);
          py += s / 4;
          x.lineTo(px, py);
        }
        x.stroke();
      }
    }
  grime(x, W, H, 8, "30,20,10", 0.08, 0.22, 10, 50);
  speckle(x, W, H, 500, 0.08);
  return tex(c);
}

export function concrete() {
  const W = 512, H = 512;
  const [c, x] = canvas(W, H);
  x.fillStyle = "#3a3733";
  x.fillRect(0, 0, W, H);
  grime(x, W, H, 40, "0,0,0", 0.04, 0.14, 20, 90);
  grime(x, W, H, 10, "60,40,20", 0.06, 0.16, 30, 100);
  for (let i = 0; i < 6; i++) {
    x.strokeStyle = "rgba(0,0,0,0.45)";
    x.lineWidth = 1.5;
    x.beginPath();
    let px = R(0, W), py = R(0, H);
    x.moveTo(px, py);
    for (let k = 0; k < 8; k++) {
      px += R(-30, 30);
      py += R(-30, 30);
      x.lineTo(px, py);
    }
    x.stroke();
  }
  speckle(x, W, H, 5000, 0.12);
  return tex(c);
}

export function plaster() {
  const W = 256, H = 256;
  const [c, x] = canvas(W, H);
  x.fillStyle = "#5a554c";
  x.fillRect(0, 0, W, H);
  grime(x, W, H, 10, "70,50,20", 0.06, 0.2, 20, 70);
  grime(x, W, H, 14, "0,0,0", 0.03, 0.1, 10, 50);
  speckle(x, W, H, 1200, 0.06);
  return tex(c);
}

/** Furniture wood: grain running along u. */
export function woodGrain(base = [58, 38, 26]) {
  const W = 256, H = 256;
  const [c, x] = canvas(W, H);
  x.fillStyle = `rgb(${base.join(",")})`;
  x.fillRect(0, 0, W, H);
  for (let j = 0; j < 70; j++) {
    x.strokeStyle = `rgba(0,0,0,${R(0.05, 0.18)})`;
    x.lineWidth = R(0.5, 2);
    x.beginPath();
    const y0 = R(0, H);
    x.moveTo(0, y0);
    for (let px = 0; px <= W; px += 32) x.lineTo(px, y0 + Math.sin(px * 0.03 + j) * R(1, 4));
    x.stroke();
  }
  grime(x, W, H, 6, "0,0,0", 0.05, 0.15, 20, 60);
  speckle(x, W, H, 600, 0.06);
  return tex(c);
}

export function paintedWood(base = "#8c8573") {
  const W = 256, H = 256;
  const [c, x] = canvas(W, H);
  x.fillStyle = "#3b2b1e";
  x.fillRect(0, 0, W, H);
  x.fillStyle = base;
  x.fillRect(0, 0, W, H);
  // chipped paint
  for (let i = 0; i < 40; i++) {
    x.fillStyle = "rgba(50,35,22,0.85)";
    x.beginPath();
    const px = R(0, W), py = R(0, H);
    x.moveTo(px, py);
    for (let k = 0; k < 5; k++) x.lineTo(px + R(-7, 7), py + R(-5, 5));
    x.fill();
  }
  grime(x, W, H, 10, "40,30,15", 0.06, 0.2, 20, 70);
  speckle(x, W, H, 800, 0.07);
  return tex(c);
}

export function fabric(base = [70, 20, 24]) {
  const W = 128, H = 128;
  const [c, x] = canvas(W, H);
  x.fillStyle = `rgb(${base.join(",")})`;
  x.fillRect(0, 0, W, H);
  for (let i = 0; i < W; i += 2) {
    x.fillStyle = `rgba(0,0,0,${R(0.03, 0.1)})`;
    x.fillRect(i, 0, 1, H);
    x.fillRect(0, i, W, 1);
  }
  grime(x, W, H, 6, "0,0,0", 0.08, 0.2, 10, 40);
  return tex(c);
}

export function cloth() {
  const W = 128, H = 128;
  const [c, x] = canvas(W, H);
  x.fillStyle = "#a59e8c";
  x.fillRect(0, 0, W, H);
  grime(x, W, H, 10, "70,55,30", 0.08, 0.25, 10, 50);
  for (let i = 0; i < 30; i++) {
    x.strokeStyle = "rgba(0,0,0,0.06)";
    x.beginPath();
    const px = R(0, W);
    x.moveTo(px, 0);
    x.lineTo(px + R(-20, 20), H);
    x.stroke();
  }
  return tex(c);
}

export function brick() {
  const W = 256, H = 256;
  const [c, x] = canvas(W, H);
  x.fillStyle = "#2a201b";
  x.fillRect(0, 0, W, H);
  const rows = 10, h = H / rows;
  for (let r = 0; r < rows; r++)
    for (let k = -1; k < 5; k++) {
      const v = R(60, 95);
      x.fillStyle = `rgb(${v + 30},${v * 0.55},${v * 0.42})`;
      x.fillRect(k * 64 + (r % 2 ? 32 : 0) + 2, r * h + 2, 60, h - 4);
    }
  grime(x, W, H, 10, "0,0,0", 0.15, 0.4, 20, 60);
  return tex(c);
}

/** Moonlit foggy window glass with bare branches and condensation runs. */
export function windowGlass() {
  const W = 128, H = 192;
  const [c, x] = canvas(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#5f7390");
  g.addColorStop(1, "#28303c");
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(10,12,16,0.75)";
  for (let i = 0; i < 4; i++) {
    x.lineWidth = R(2, 4);
    x.beginPath();
    let px = R(0, W), py = H;
    x.moveTo(px, py);
    for (let k = 0; k < 6; k++) {
      px += R(-18, 18);
      py -= R(18, 40);
      x.lineTo(px, py);
      if (rnd() < 0.6) {
        x.moveTo(px, py);
        x.lineTo(px + R(-30, 30), py - R(10, 30));
        x.moveTo(px, py);
      }
    }
    x.stroke();
  }
  // fog
  grime(x, W, H, 18, "190,200,215", 0.06, 0.18, 20, 60);
  // condensation runs
  for (let i = 0; i < 12; i++) {
    x.fillStyle = "rgba(20,25,30,0.25)";
    x.fillRect(R(0, W), R(0, H * 0.6), 1.5, R(20, 90));
  }
  return tex(c, { repeat: false });
}

/** A dark oil portrait in an oval. kind: 0 widow, 1 man, 2 child. */
export function portrait(kind = 0) {
  const W = 128, H = 160;
  const [c, x] = canvas(W, H);
  x.fillStyle = "#120d09";
  x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(64, 70, 10, 64, 80, 80);
  g.addColorStop(0, ["#3d3226", "#2c3326", "#33283a"][kind]);
  g.addColorStop(1, "#0d0a07");
  x.fillStyle = g;
  x.beginPath();
  x.ellipse(64, 80, 54, 70, 0, 0, 7);
  x.fill();
  // shoulders + head
  x.fillStyle = "#16110d";
  x.beginPath();
  x.ellipse(64, 158, 52, 50, 0, 0, 7);
  x.fill();
  x.fillStyle = kind === 2 ? "#9d927f" : "#8f8270";
  x.beginPath();
  x.ellipse(64, 70, kind === 2 ? 20 : 23, kind === 2 ? 25 : 30, 0, 0, 7);
  x.fill();
  // hair
  x.fillStyle = kind === 0 ? "#b6b0a2" : "#1b1510";
  x.beginPath();
  x.ellipse(64, kind === 0 ? 46 : 50, 25, 14, 0, Math.PI, 0);
  x.fill();
  if (kind === 0) {
    x.beginPath();
    x.arc(64, 34, 9, 0, 7);
    x.fill();
  }
  // the eyes are scratched out
  x.strokeStyle = "rgba(0,0,0,0.85)";
  x.lineWidth = 2;
  for (const ex of [55, 73]) {
    for (let k = 0; k < 5; k++) {
      x.beginPath();
      x.moveTo(ex - 6 + R(-2, 2), 66 + R(-3, 3));
      x.lineTo(ex + 6 + R(-2, 2), 68 + R(-3, 3));
      x.stroke();
    }
  }
  x.strokeStyle = "rgba(40,20,15,0.7)";
  x.beginPath();
  x.moveTo(56, 86);
  x.quadraticCurveTo(64, 89, 72, 86);
  x.stroke();
  grime(x, W, H, 8, "0,0,0", 0.1, 0.3, 10, 40);
  // craquelure
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = "rgba(0,0,0,0.25)";
    x.lineWidth = 0.6;
    x.beginPath();
    const px = R(0, W), py = R(0, H);
    x.moveTo(px, py);
    x.lineTo(px + R(-12, 12), py + R(-12, 12));
    x.stroke();
  }
  return tex(c, { repeat: false });
}

export function clockFace() {
  const S = 128;
  const [c, x] = canvas(S, S);
  x.fillStyle = "#c8bc9e";
  x.fillRect(0, 0, S, S);
  x.fillStyle = "#1a140e";
  x.strokeStyle = "#1a140e";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    x.fillRect(64 + Math.sin(a) * 50 - 2, 64 - Math.cos(a) * 50 - 5, 4, 10);
  }
  x.lineWidth = 4;
  x.beginPath();
  x.moveTo(64, 64);
  x.lineTo(64 + 30 * Math.sin(5.2), 64 - 30 * Math.cos(5.2)); // hands frozen near midnight
  x.moveTo(64, 64);
  x.lineTo(64 + 44 * Math.sin(-0.12), 64 - 44 * Math.cos(-0.12));
  x.stroke();
  grime(x, S, S, 6, "60,40,10", 0.1, 0.3, 10, 40);
  return tex(c, { repeat: false });
}

/** Wrinkled face for the widow, centred at u = 0.25 of a sphere map. */
export function widowFace() {
  const W = 512, H = 256;
  const [c, x] = canvas(W, H);
  x.fillStyle = "#9c9686";
  x.fillRect(0, 0, W, H);
  // blotchy skin
  grime(x, W, H, 40, "90,70,50", 0.05, 0.18, 6, 30);
  grime(x, W, H, 20, "60,70,50", 0.05, 0.12, 10, 40);
  const fx = W * 0.25; // face centre (front of the sphere)
  // sunken sockets
  for (const s of [-1, 1]) {
    const g = x.createRadialGradient(fx + s * 30, 112, 2, fx + s * 30, 112, 30);
    g.addColorStop(0, "rgba(5,3,2,1)");
    g.addColorStop(0.55, "rgba(20,12,10,0.85)");
    g.addColorStop(1, "rgba(40,30,25,0)");
    x.fillStyle = g;
    x.beginPath();
    x.ellipse(fx + s * 30, 112, 30, 24, 0, 0, 7);
    x.fill();
    // tiny pale pupils
    x.fillStyle = "#d8d2a0";
    x.beginPath();
    x.arc(fx + s * 27, 113, 3, 0, 7);
    x.fill();
  }
  // brow and nose shading
  x.strokeStyle = "rgba(30,20,15,0.6)";
  x.lineWidth = 3;
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(fx + s * 8, 90);
    x.quadraticCurveTo(fx + s * 30, 78, fx + s * 54, 96);
    x.stroke();
  }
  x.fillStyle = "rgba(30,20,15,0.35)";
  x.beginPath();
  x.moveTo(fx - 5, 110);
  x.lineTo(fx - 10, 150);
  x.lineTo(fx + 10, 150);
  x.lineTo(fx + 5, 110);
  x.fill();
  // wide thin mouth with a few teeth
  x.fillStyle = "#140b08";
  x.beginPath();
  x.moveTo(fx - 42, 170);
  x.quadraticCurveTo(fx, 186, fx + 42, 170);
  x.quadraticCurveTo(fx, 178, fx - 42, 170);
  x.fill();
  x.fillStyle = "#b5a77a";
  for (const tx of [-18, -7, 6, 20]) x.fillRect(fx + tx, 173 + Math.abs(tx) * 0.1, 5, 6);
  // wrinkles
  x.strokeStyle = "rgba(25,18,12,0.45)";
  x.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) {
    x.beginPath();
    const yy = R(40, 210), xx = fx + R(-80, 80);
    x.moveTo(xx, yy);
    x.quadraticCurveTo(xx + R(-15, 15), yy + R(-6, 6), xx + R(-40, 40), yy + R(-4, 4));
    x.stroke();
  }
  for (let i = 0; i < 10; i++) {
    x.fillStyle = "rgba(70,50,30,0.5)";
    x.beginPath();
    x.arc(fx + R(-70, 70), R(40, 210), R(2, 5), 0, 7);
    x.fill();
  }
  return tex(c, { repeat: false });
}

export function dressFabric() {
  const W = 128, H = 128;
  const [c, x] = canvas(W, H);
  x.fillStyle = "#2a2027";
  x.fillRect(0, 0, W, H);
  for (let i = 0; i < W; i += 8) {
    x.fillStyle = "rgba(90,70,80,0.18)";
    x.fillRect(i, 0, 2, H);
  }
  for (let i = 0; i < 40; i++) {
    x.fillStyle = "rgba(120,100,90,0.25)";
    x.beginPath();
    x.arc(R(0, W), R(0, H), R(1, 2.5), 0, 7);
    x.fill();
  }
  grime(x, W, H, 8, "0,0,0", 0.1, 0.3, 10, 40);
  return tex(c);
}

/** Generic soft blob for decals (stains) and glow sprites. */
export function blob(rgb = "255,255,255", hard = 0.3) {
  const S = 64;
  const [c, x] = canvas(S, S);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(hard, `rgba(${rgb},0.4)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return tex(c, { repeat: false });
}

/** Irregular dark stain decal. */
export function stain() {
  const S = 128;
  const [c, x] = canvas(S, S);
  grime(x, S, S, 0);
  for (let i = 0; i < 14; i++) {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "rgba(28,6,4,0.55)");
    g.addColorStop(1, "rgba(28,6,4,0)");
    x.save();
    x.translate(64 + R(-30, 30), 64 + R(-30, 30));
    const r = R(10, 34);
    x.scale(r, r * R(0.5, 1));
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, 1, 0, 7);
    x.fill();
    x.restore();
  }
  return tex(c, { repeat: false });
}

export function cobweb() {
  const S = 128;
  const [c, x] = canvas(S, S);
  x.strokeStyle = "rgba(220,220,220,0.5)";
  x.lineWidth = 0.8;
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(Math.cos(a) * 128, Math.sin(a) * 128);
    x.stroke();
  }
  for (let r = 12; r < 128; r += R(10, 16)) {
    x.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2), rr = r + R(-3, 3);
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) x.moveTo(px, py);
      else x.quadraticCurveTo(Math.cos(a - 0.1) * rr * 0.9, Math.sin(a - 0.1) * rr * 0.9, px, py);
    }
    x.stroke();
  }
  return tex(c, { repeat: false });
}
