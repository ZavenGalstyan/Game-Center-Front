/**
 * Space Station Escape — procedural canvas art: hull panels, floor grating,
 * the view of Earth and stars, signage and soft sprites.
 */
function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

/** Hull wall: bevelled panels, seams, rivets, vents and scuffs. */
export function panelCanvas(base, seed = 3) {
  const [c, x] = makeCanvas(512, 512);
  const r = rand(seed);
  x.fillStyle = shade(base, 0.55);
  x.fillRect(0, 0, 512, 512);
  const cells = [[0, 0, 256, 300], [256, 0, 256, 300], [0, 300, 170, 212], [170, 300, 172, 212], [342, 300, 170, 212]];
  for (const [px, py, w, h] of cells) {
    const g = x.createLinearGradient(px, py, px + w, py + h);
    g.addColorStop(0, shade(base, 1.12));
    g.addColorStop(1, shade(base, 0.86));
    x.fillStyle = g;
    x.fillRect(px + 4, py + 4, w - 8, h - 8);
    x.strokeStyle = "rgba(255,255,255,0.12)";
    x.lineWidth = 2;
    x.strokeRect(px + 6, py + 6, w - 12, h - 12);
    x.fillStyle = "rgba(0,0,0,0.35)";
    for (const [rx, ry] of [[12, 12], [w - 12, 12], [12, h - 12], [w - 12, h - 12]]) {
      x.beginPath();
      x.arc(px + rx, py + ry, 3.5, 0, Math.PI * 2);
      x.fill();
    }
  }
  // vent slots
  x.fillStyle = "rgba(0,0,0,0.5)";
  for (let i = 0; i < 6; i++) x.fillRect(200, 380 + i * 14, 110, 6);
  // scuffs
  for (let k = 0; k < 900; k++) {
    x.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.08)";
    x.fillRect(r() * 512, r() * 512, 1 + r() * 4, 1);
  }
  return c;
}
export function gratingCanvas(seed = 2) {
  const [c, x] = makeCanvas(512, 512);
  const r = rand(seed);
  x.fillStyle = "#1b1f26";
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const g = x.createLinearGradient(i * 128, j * 128, i * 128 + 128, j * 128 + 128);
      g.addColorStop(0, "#3c434e");
      g.addColorStop(1, "#2a3038");
      x.fillStyle = g;
      x.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
      x.fillStyle = "rgba(0,0,0,0.55)";
      for (let k = 0; k < 7; k++) x.fillRect(i * 128 + 14, j * 128 + 14 + k * 15, 100, 7);
    }
  for (let k = 0; k < 600; k++) {
    x.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.12)";
    x.fillRect(r() * 512, r() * 512, 2, 2);
  }
  return c;
}
export function ceilingCanvas() {
  const [c, x] = makeCanvas(256, 256);
  x.fillStyle = "#22272f";
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = "rgba(0,0,0,0.6)";
  x.lineWidth = 4;
  for (let i = 0; i <= 256; i += 128) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i, 256);
    x.moveTo(0, i);
    x.lineTo(256, i);
    x.stroke();
  }
  return c;
}

/** The view out of a window: stars, nebula haze and (optionally) Earth. */
export function spaceCanvas(earth = true, seed = 11) {
  const [c, x] = makeCanvas(1024, 512);
  const r = rand(seed);
  x.fillStyle = "#02030a";
  x.fillRect(0, 0, 1024, 512);
  for (let k = 0; k < 4; k++) {
    const g = x.createRadialGradient(r() * 1024, r() * 512, 0, r() * 1024, r() * 512, 200 + r() * 200);
    g.addColorStop(0, k % 2 ? "rgba(90,60,160,0.22)" : "rgba(40,90,170,0.2)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 1024, 512);
  }
  for (let k = 0; k < 900; k++) {
    const s = r() < 0.92 ? 1 : 2;
    x.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
    x.fillRect(r() * 1024, r() * 512, s, s);
  }
  if (earth) {
    const cx = 700, cy = 640, R = 420;
    const halo = x.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.12);
    halo.addColorStop(0, "rgba(120,190,255,0.75)");
    halo.addColorStop(1, "rgba(120,190,255,0)");
    x.fillStyle = halo;
    x.fillRect(0, 0, 1024, 512);
    const g = x.createRadialGradient(cx - 120, cy - 260, 40, cx, cy, R);
    g.addColorStop(0, "#5fb0ff");
    g.addColorStop(0.55, "#1d5ea8");
    g.addColorStop(1, "#06152e");
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, R, 0, Math.PI * 2);
    x.fill();
    x.save();
    x.clip();
    x.fillStyle = "rgba(70,140,70,0.75)";
    for (let k = 0; k < 9; k++) {
      x.beginPath();
      x.ellipse(cx - 300 + r() * 600, cy - 380 + r() * 200, 30 + r() * 90, 14 + r() * 40, r() * 3, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = "rgba(255,255,255,0.55)";
    for (let k = 0; k < 40; k++) {
      x.beginPath();
      x.ellipse(cx - 380 + r() * 760, cy - 410 + r() * 260, 20 + r() * 70, 4 + r() * 10, (r() - 0.5) * 0.6, 0, Math.PI * 2);
      x.fill();
    }
    const night = x.createLinearGradient(cx - R, 0, cx + R, 0);
    night.addColorStop(0.55, "rgba(0,0,0,0)");
    night.addColorStop(1, "rgba(0,0,10,0.75)");
    x.fillStyle = night;
    x.fillRect(0, 0, 1024, 512);
    x.restore();
  }
  return c;
}

export function textCanvas(lines, { w = 512, h = 256, bg = null, color = "#cfe9ff", font = "'Segoe UI', system-ui, sans-serif", size = 40, weight = 700, colors = null } = {}) {
  const [c, x] = makeCanvas(w, h);
  if (bg) {
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
  }
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `${weight} ${size}px ${font}`;
  lines.forEach((l, i) => {
    x.fillStyle = (colors && colors[i]) || color;
    x.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.3);
  });
  return c;
}
export function glowCanvas(inner = "rgba(255,255,255,1)") {
  const [c, x] = makeCanvas(128, 128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.3, inner.replace(/[\d.]+\)$/, "0.4)"));
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return c;
}
export function hazardCanvas() {
  const [c, x] = makeCanvas(256, 64);
  x.fillStyle = "#e0b020";
  x.fillRect(0, 0, 256, 64);
  x.fillStyle = "#111";
  for (let i = -64; i < 256; i += 48) {
    x.beginPath();
    x.moveTo(i, 64);
    x.lineTo(i + 24, 64);
    x.lineTo(i + 88, 0);
    x.lineTo(i + 64, 0);
    x.fill();
  }
  return c;
}
