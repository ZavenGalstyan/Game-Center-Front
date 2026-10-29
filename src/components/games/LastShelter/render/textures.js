/**
 * Last Shelter — procedural canvas textures for the house (no image files).
 * Each is generated once per world and disposed with it.
 */
import * as THREE from "three";

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function canvas(w, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
function tex(c, repeat = [1, 1], aniso = 4) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  return t;
}
const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, k);
  return `#${c.getHexString()}`;
};
function speckle(g, w, h, n, colors, r, rand, alpha = 0.25) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * rand();
    g.fillStyle = colors[Math.floor(rand() * colors.length)];
    g.beginPath();
    g.arc(rand() * w, rand() * h, r * (0.4 + rand()), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

export function makeTextures(aniso = 4) {
  const T = {};
  const R = rng(7);
  // warm honey wood planks
  const wood = (base, seed) => {
    const r = rng(seed);
    const [c, g] = canvas(512);
    const rows = 8;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 200;
      while (x < 512) {
        const len = 140 + r() * 200;
        g.fillStyle = shade(base, (r() - 0.5) * 0.08);
        g.fillRect(x, i * 64, len, 64);
        // grain
        g.strokeStyle = shade(base, -0.08);
        g.globalAlpha = 0.25;
        for (let k = 0; k < 5; k++) {
          g.beginPath();
          const y = i * 64 + 6 + r() * 52;
          g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 8, x + len * 0.6, y + (r() - 0.5) * 8, x + len, y + (r() - 0.5) * 6);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = shade(base, -0.18);
        g.fillRect(x, i * 64, 2, 64);
        x += len;
      }
      g.fillStyle = shade(base, -0.2);
      g.fillRect(0, i * 64, 512, 2);
    }
    return tex(c, [1, 1], aniso);
  };
  T.wood = wood("#c8955e", 3);
  T.woodDark = wood("#8a5a3b", 5);
  // bathroom tiles
  {
    const [c, g] = canvas(256);
    g.fillStyle = "#cfd8d6";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        g.fillStyle = shade((x + y) % 5 === 0 ? "#9ccfd8" : "#eef3f1", (R() - 0.5) * 0.04);
        g.fillRect(x * 32 + 1.5, y * 32 + 1.5, 29, 29);
      }
    T.tile = tex(c, [1, 1], aniso);
  }
  // kitchen checker
  {
    const [c, g] = canvas(256);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        g.fillStyle = (x + y) % 2 ? "#e9dfc8" : "#5f8f8a";
        g.fillRect(x * 64, y * 64, 64, 64);
      }
    speckle(g, 256, 256, 400, ["#000", "#fff"], 1.4, R, 0.12);
    T.checker = tex(c, [1, 1], aniso);
  }
  // carpets
  const carpet = (base, seed) => {
    const r = rng(seed);
    const [c, g] = canvas(256);
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, 3000, [shade(base, 0.08), shade(base, -0.08)], 1.2, r, 0.5);
    return tex(c, [1, 1], aniso);
  };
  T.carpetBlue = carpet("#7fa3c9", 11);
  // concrete
  {
    const [c, g] = canvas(512);
    g.fillStyle = "#9a9a94";
    g.fillRect(0, 0, 512, 512);
    speckle(g, 512, 512, 2500, ["#7f7f7a", "#b3b3ad"], 2, R, 0.35);
    speckle(g, 512, 512, 14, ["#6e6a60"], 40, R, 0.18);
    g.strokeStyle = "rgba(60,60,55,0.35)";
    g.lineWidth = 2;
    g.strokeRect(0, 0, 512, 512);
    T.concrete = tex(c, [1, 1], aniso);
  }
  // grass
  {
    const [c, g] = canvas(512);
    g.fillStyle = "#6e9b4d";
    g.fillRect(0, 0, 512, 512);
    speckle(g, 512, 512, 60, ["#5d8a40", "#80ad58"], 50, R, 0.3);
    for (let i = 0; i < 4000; i++) {
      g.strokeStyle = R() < 0.5 ? "rgba(52,90,35,0.45)" : "rgba(150,190,100,0.35)";
      const x = R() * 512;
      const y = R() * 512;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (R() - 0.5) * 3, y - 4 - R() * 5);
      g.stroke();
    }
    T.grass = tex(c, [1, 1], aniso);
  }
  // paving / sidewalk
  {
    const [c, g] = canvas(256);
    g.fillStyle = "#c9c3b5";
    g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, 900, ["#b0aa9b", "#ddd8cb"], 1.5, R, 0.4);
    g.strokeStyle = "rgba(90,85,75,0.5)";
    g.lineWidth = 3;
    g.strokeRect(0, 0, 256, 256);
    g.beginPath();
    g.moveTo(128, 0);
    g.lineTo(128, 256);
    g.stroke();
    T.paving = tex(c, [1, 1], aniso);
  }
  // asphalt
  {
    const [c, g] = canvas(256);
    g.fillStyle = "#4a4b4f";
    g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, 2500, ["#3a3b3f", "#5d5e63"], 1.3, R, 0.6);
    T.asphalt = tex(c, [1, 1], aniso);
  }
  // wallpapers: soft stripes / dots on a base colour
  const paper = (base, kind, seed) => {
    const r = rng(seed);
    const [c, g] = canvas(256);
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    if (kind === "stripe") {
      g.fillStyle = shade(base, 0.04);
      for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 14, 256);
    } else if (kind === "dots") {
      g.fillStyle = shade(base, -0.06);
      for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < 256; x += 32) {
        g.beginPath();
        g.arc(x + 8, y + 8, 3.2, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === "tile") {
      for (let y = 0; y < 256; y += 32)
        for (let x = 0; x < 256; x += 32) {
          g.fillStyle = shade(base, (r() - 0.5) * 0.05);
          g.fillRect(x + 1, y + 1, 30, 30);
        }
    } else if (kind === "block") {
      for (let y = 0; y < 256; y += 32)
        for (let x = (y / 32) % 2 ? -32 : 0; x < 256; x += 64) {
          g.fillStyle = shade(base, (r() - 0.5) * 0.06);
          g.fillRect(x + 1.5, y + 1.5, 61, 29);
        }
    } else {
      g.fillStyle = shade(base, -0.05);
      for (let i = 0; i < 40; i++) {
        const x = r() * 256;
        const y = r() * 256;
        g.beginPath();
        g.ellipse(x, y, 4, 7, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    speckle(g, 256, 256, 500, [shade(base, -0.1)], 1, r, 0.15);
    return tex(c, [1, 1], aniso);
  };
  T.wallMint = paper("#bfe0cf", "dots", 21);
  T.wallTile = paper("#dfeef0", "tile", 22);
  T.wallRose = paper("#ecc9c3", "stripe", 23);
  T.wallOlive = paper("#c9cba3", "leaf", 24);
  T.wallCream = paper("#f1e3c8", "stripe", 25);
  T.wallYellow = paper("#f3dfa2", "dots", 26);
  T.wallConcrete = paper("#b9b6ad", "block", 27);
  T.exterior = paper("#e7d8bf", "block", 28);
  // food can label
  {
    const [c, g] = canvas(128, 64);
    g.fillStyle = "#d9963a";
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = "#b2402f";
    g.fillRect(0, 18, 128, 28);
    g.fillStyle = "#f6e7c1";
    g.font = "bold 18px sans-serif";
    g.fillText("BEANS", 30, 39);
    T.canLabel = tex(c, [1, 1], aniso);
  }
  // book spines (for shelves)
  {
    const [c, g] = canvas(256, 64);
    let x = 0;
    const cols = ["#b5482f", "#3d5a80", "#e0b33a", "#4f8a7b", "#6b4fa0", "#e07a5f", "#2b2d42", "#81b29a"];
    while (x < 256) {
      const w = 10 + R() * 16;
      g.fillStyle = cols[Math.floor(R() * cols.length)];
      const h = 40 + R() * 24;
      g.fillRect(x, 64 - h, w - 1.5, h);
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.fillRect(x + 2, 64 - h + 6, w - 5, 2);
      x += w;
    }
    T.books = tex(c, [1, 1], aniso);
  }
  // soft round blob shadow / glow sprite
  {
    const [c, g] = canvas(128);
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.5, "rgba(255,255,255,0.45)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    T.blob = tex(c);
  }
  // ring (pickup halo / hatch marker)
  {
    const [c, g] = canvas(256);
    g.strokeStyle = "#fff";
    for (let i = 0; i < 3; i++) {
      g.globalAlpha = [1, 0.4, 0.15][i];
      g.lineWidth = [10, 22, 40][i];
      g.beginPath();
      g.arc(128, 128, 100, 0, Math.PI * 2);
      g.stroke();
    }
    T.ring = tex(c);
  }
  // hazard stripes for the hatch rim
  {
    const [c, g] = canvas(256, 32);
    g.fillStyle = "#f2c230";
    g.fillRect(0, 0, 256, 32);
    g.fillStyle = "#222";
    for (let x = -32; x < 256; x += 32) {
      g.beginPath();
      g.moveTo(x, 32);
      g.lineTo(x + 16, 32);
      g.lineTo(x + 32, 0);
      g.lineTo(x + 16, 0);
      g.fill();
    }
    T.hazard = tex(c, [6, 1], aniso);
  }
  return T;
}

export function disposeTextures(T) {
  for (const t of Object.values(T)) t.dispose?.();
}
