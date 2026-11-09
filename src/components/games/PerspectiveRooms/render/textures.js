/**
 * Perspective: Impossible Rooms — procedural canvas textures (no image files,
 * no text). Every texture is created once per world and disposed with it.
 */
import * as THREE from "three";

function canvas(w, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Soft architectural grid: one cell per metre, a stronger line every 2 m. */
function grid() {
  const [c, g] = canvas(256);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, 256);
  // faint noise so large surfaces are not dead flat
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 246 + Math.random() * 9;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = "rgba(90,100,130,0.20)";
  g.lineWidth = 2;
  g.strokeRect(1, 1, 254, 254);
  g.strokeStyle = "rgba(90,100,130,0.08)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(128, 0);
  g.lineTo(128, 256);
  g.moveTo(0, 128);
  g.lineTo(256, 128);
  g.stroke();
  const t = tex(c);
  t.repeat.set(0.5, 0.5);
  return t;
}

/** Wall panels: tall soft seams. */
function panels() {
  const [c, g] = canvas(256);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "rgba(255,255,255,0)");
  grd.addColorStop(1, "rgba(120,130,160,0.08)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "rgba(90,100,130,0.13)";
  g.fillRect(0, 0, 2, 256);
  g.fillRect(0, 0, 256, 1);
  const t = tex(c);
  t.repeat.set(1 / 1.5, 1 / 3);
  return t;
}

function diePips() {
  const faces = [];
  const spots = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
    6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]],
  };
  for (const n of [1, 6, 2, 5, 3, 4]) {
    const [c, g] = canvas(128);
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = n === 1 ? "#ff4f7b" : "#2b2f45";
    for (const [x, y] of spots[n]) {
      g.beginPath();
      g.arc(x * 128, y * 128, n === 1 ? 17 : 11, 0, Math.PI * 2);
      g.fill();
    }
    faces.push(tex(c, { repeat: false }));
  }
  return faces;
}

function crate() {
  const [c, g] = canvas(128);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "rgba(120,80,40,0.16)";
  for (let i = 0; i < 4; i++) g.fillRect(0, i * 32 + 30, 128, 2);
  g.strokeStyle = "rgba(120,80,40,0.35)";
  g.lineWidth = 10;
  g.strokeRect(5, 5, 118, 118);
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(8, 8);
  g.lineTo(120, 120);
  g.stroke();
  return tex(c, { repeat: false });
}

function gift() {
  const [c, g] = canvas(128);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "rgba(255,255,255,0.0)";
  for (let i = -128; i < 256; i += 22) {
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 10, 0);
    g.lineTo(i + 138, 128);
    g.lineTo(i + 128, 128);
    g.fill();
  }
  g.fillStyle = "#fff4c2";
  g.fillRect(54, 0, 20, 128);
  g.fillRect(0, 54, 128, 20);
  return tex(c, { repeat: false });
}

function pages() {
  const [c, g] = canvas(64);
  g.fillStyle = "#fbf6ea";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "rgba(150,130,100,0.25)";
  for (let y = 2; y < 64; y += 4) g.fillRect(0, y, 64, 1);
  return tex(c, { repeat: false });
}

function plank() {
  const [c, g] = canvas(256, 64);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 9; i++) {
    g.strokeStyle = `rgba(150,100,60,${0.08 + Math.random() * 0.1})`;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    const y = Math.random() * 64;
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
    g.stroke();
  }
  g.fillStyle = "rgba(150,100,60,0.22)";
  g.fillRect(0, 0, 256, 3);
  g.fillRect(0, 61, 256, 3);
  return tex(c, { repeat: false });
}

/** The eye symbol painted on the floor at a viewpoint. */
function eyeMark() {
  const [c, g] = canvas(256);
  g.clearRect(0, 0, 256, 256);
  g.translate(128, 128);
  g.strokeStyle = "#ffffff";
  g.fillStyle = "#ffffff";
  g.lineWidth = 9;
  g.beginPath();
  g.arc(0, 0, 112, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(-82, 0);
  g.quadraticCurveTo(0, -70, 82, 0);
  g.quadraticCurveTo(0, 70, -82, 0);
  g.stroke();
  g.beginPath();
  g.arc(0, 0, 26, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.fillRect(Math.cos(a) * 96 - 3, Math.sin(a) * 96 - 3, 6, 6);
  }
  return tex(c, { repeat: false });
}

/** Footprints for plates only you can press. */
function feetMark() {
  const [c, g] = canvas(128);
  g.fillStyle = "#ffffff";
  const foot = (x, y, r) => {
    g.save();
    g.translate(x, y);
    g.rotate(r);
    g.beginPath();
    g.ellipse(0, 0, 11, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(0, 30, 9, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  foot(46, 52, -0.15);
  foot(82, 62, 0.15);
  return tex(c, { repeat: false });
}

/** Abstract gallery paintings. */
function art(seed) {
  const [c, g] = canvas(256, 192);
  const rnd = (() => {
    let s = seed * 9301 + 49297;
    return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  })();
  const pal = ["#7cf7ff", "#ff5cd6", "#ffd36b", "#8affc1", "#9b8cff", "#ff8f6b"];
  g.fillStyle = "#151233";
  g.fillRect(0, 0, 256, 192);
  for (let i = 0; i < 7; i++) {
    g.strokeStyle = pal[Math.floor(rnd() * pal.length)];
    g.lineWidth = 3 + rnd() * 8;
    g.globalAlpha = 0.85;
    g.beginPath();
    if (rnd() < 0.5) g.arc(rnd() * 256, rnd() * 192, 10 + rnd() * 60, 0, Math.PI * 2);
    else {
      g.moveTo(rnd() * 256, rnd() * 192);
      g.lineTo(rnd() * 256, rnd() * 192);
      g.lineTo(rnd() * 256, rnd() * 192);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  return tex(c, { repeat: false });
}

export function createTextures() {
  const t = {
    grid: grid(),
    panels: panels(),
    die: diePips(),
    crate: crate(),
    gift: gift(),
    pages: pages(),
    plank: plank(),
    eye: eyeMark(),
    feet: feetMark(),
    art: [art(1), art(2), art(3), art(4)],
  };
  t.dispose = () => {
    for (const v of Object.values(t)) {
      if (Array.isArray(v)) v.forEach((x) => x.dispose());
      else if (v && v.isTexture) v.dispose();
    }
  };
  return t;
}
