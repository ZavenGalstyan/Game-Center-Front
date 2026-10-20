/**
 * Outpost 47 — procedural textures, materials and prop geometry.
 *
 * Everything static is emitted through a Builder into per-(region, material)
 * buckets that world.js merges into a handful of meshes. Textures are drawn on
 * canvases at startup; there are no external assets.
 */
import * as THREE from "three";

/* ================================================================ textures */
function canvas(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  return c;
}
function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function noise(g, w, h, n, a, col = "0,0,0") {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${col},${a * rnd()})`;
    const s = 1 + rnd() * 3;
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
}
function panels(base, seam, opts = {}) {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 1800, 0.08);
    noise(g, w, h, 600, 0.06, "255,255,255");
    g.strokeStyle = seam;
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, w - 3, h - 3);
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.stroke();
    if (opts.band) {
      g.fillStyle = opts.band;
      g.fillRect(0, h * 0.8, w, h * 0.06);
    }
    g.fillStyle = seam;
    for (const [x, y] of [[10, 10], [w / 2 - 10, 10], [w / 2 + 10, 10], [w - 10, 10], [10, h - 10], [w / 2 - 10, h - 10], [w / 2 + 10, h - 10], [w - 10, h - 10]]) {
      g.beginPath();
      g.arc(x, y, 2.6, 0, 7);
      g.fill();
    }
    if (opts.grime) {
      const gr = g.createLinearGradient(0, h, 0, h * 0.6);
      gr.addColorStop(0, "rgba(30,24,16,0.35)");
      gr.addColorStop(1, "rgba(30,24,16,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
  });
}
function tiles(base, line, n = 4) {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 1500, 0.1);
    g.strokeStyle = line;
    g.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      g.beginPath();
      g.moveTo((i * w) / n, 0);
      g.lineTo((i * w) / n, h);
      g.moveTo(0, (i * h) / n);
      g.lineTo(w, (i * h) / n);
      g.stroke();
    }
  });
}
function plate() {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = "#4a5058";
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 2500, 0.15);
    g.fillStyle = "rgba(255,255,255,0.10)";
    for (let y = 0; y < h; y += 16) {
      for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) {
        g.save();
        g.translate(x + 4, y + 8);
        g.rotate(0.7);
        g.fillRect(-5, -1.2, 10, 2.4);
        g.restore();
      }
    }
  });
}
function concrete(base = "#5a5e62") {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 5000, 0.12);
    noise(g, w, h, 2000, 0.06, "255,255,255");
    g.strokeStyle = "rgba(0,0,0,0.25)";
    g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
  });
}
function snowTex() {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = "#dfe8f2";
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 4000, 0.06, "60,90,130");
    noise(g, w, h, 1500, 0.4, "255,255,255");
  });
}
function rockTex(base = "#3c434c") {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "180,200,220"},${0.05 + rnd() * 0.12})`;
      g.beginPath();
      g.ellipse(rnd() * w, rnd() * h, 8 + rnd() * 40, 4 + rnd() * 18, rnd() * 3, 0, 7);
      g.fill();
    }
    noise(g, w, h, 3000, 0.15);
  });
}
function iceTex() {
  return canvas(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, "#5fa9d6");
    gr.addColorStop(1, "#2a6f9e");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(220,245,255,0.35)";
    for (let i = 0; i < 26; i++) {
      g.lineWidth = 0.5 + rnd() * 1.5;
      g.beginPath();
      let x = rnd() * w, y = rnd() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (rnd() - 0.5) * 70;
        y += (rnd() - 0.5) * 70;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    noise(g, w, h, 1500, 0.25, "255,255,255");
  });
}
function woodTex() {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = "#6b4f36";
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = `rgba(0,0,0,${0.1 + rnd() * 0.15})`;
      g.fillRect(0, y, w, 2);
      for (let i = 0; i < 30; i++) {
        g.fillStyle = `rgba(40,25,10,${rnd() * 0.2})`;
        g.fillRect(rnd() * w, y + rnd() * 30, 30 + rnd() * 80, 1);
      }
    }
  });
}
function cladTex(base, stripe) {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = "rgba(0,0,0,0.22)";
      g.fillRect(x, 0, 3, h);
      g.fillStyle = "rgba(255,255,255,0.07)";
      g.fillRect(x + 4, 0, 3, h);
    }
    if (stripe) {
      g.fillStyle = stripe;
      g.fillRect(0, h * 0.62, w, h * 0.1);
    }
    noise(g, w, h, 2500, 0.1);
    const gr = g.createLinearGradient(0, 0, 0, h * 0.25);
    gr.addColorStop(0, "rgba(230,240,250,0.55)");
    gr.addColorStop(1, "rgba(230,240,250,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}
function hazardTex() {
  return canvas(128, 128, (g, w, h) => {
    g.fillStyle = "#e7b416";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#16181b";
    for (let i = -h; i < w + h; i += 32) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 16, 0);
      g.lineTo(i + 16 - h, h);
      g.lineTo(i - h, h);
      g.fill();
    }
  });
}
function screenTex(col, bg) {
  return canvas(256, 160, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = col;
    g.font = "bold 12px monospace";
    const lines = ["OUTPOST 47 // HPD NET", "> SYS STATUS ......", "  GEN-1    [ OK ]", "  HEAT     [ -- ]", "  TOWER    [ OFF ]", "  CRYO-SL  [BATT]", "> LOG 37  [ERR]", "> _"];
    lines.forEach((l, i) => g.fillText(l, 10, 20 + i * 17));
    g.fillStyle = "rgba(255,255,255,0.05)";
    for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  });
}
function textTex(lines, { w = 512, h = 256, bg = "#e9e4d6", fg = "#1b1d22", font = "bold 34px Arial", align = "center", border } = {}) {
  return canvas(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 900, 0.05);
    if (border) {
      g.strokeStyle = border;
      g.lineWidth = 8;
      g.strokeRect(6, 6, w - 12, h - 12);
    }
    g.fillStyle = fg;
    g.textAlign = align;
    g.textBaseline = "middle";
    const n = lines.length;
    lines.forEach((l, i) => {
      const [txt, f] = Array.isArray(l) ? l : [l, font];
      g.font = f;
      g.fillText(txt, align === "center" ? w / 2 : 24, h * ((i + 1) / (n + 1)));
    });
  });
}
function symbolBoard() {
  return canvas(512, 256, (g, w, h) => {
    g.fillStyle = "#eef1f2";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#8a9096";
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = "#1d3c8a";
    g.font = "bold 26px Arial";
    g.textAlign = "center";
    g.fillText("SPECIMEN 47 — LIFE CYCLE", w / 2, 38);
    const xs = [70, 190, 310, 430];
    g.strokeStyle = "#c22";
    g.lineWidth = 4;
    xs.forEach((x, i) => {
      drawSymbol(g, ["flake", "drop", "spore", "bloom"][i], x, 130, 38, "#1d3c8a");
      g.beginPath();
      g.arc(x, 130, 50, 0, 7);
      g.stroke();
      if (i < 3) {
        g.fillStyle = "#1d3c8a";
        g.fillText("→", x + 60, 138);
      }
    });
    g.font = "bold 20px Arial";
    g.fillStyle = "#1d3c8a";
    ["I DORMANT", "II THAW", "III SPORES", "IV BLOOM"].forEach((t, i) => g.fillText(t, xs[i], 215));
  });
}
export function drawSymbol(g, id, x, y, r, col) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = r * 0.14;
  g.lineCap = "round";
  g.beginPath();
  if (id === "flake") {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      g.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
      g.lineTo(Math.cos(a + 0.5) * r * 0.75, Math.sin(a + 0.5) * r * 0.75);
    }
    g.stroke();
  } else if (id === "drop") {
    g.moveTo(0, -r);
    g.quadraticCurveTo(r * 0.9, r * 0.1, 0, r * 0.85);
    g.quadraticCurveTo(-r * 0.9, r * 0.1, 0, -r);
    g.stroke();
  } else if (id === "spore") {
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      g.moveTo(Math.cos(a) * r * 0.62 + r * 0.22, Math.sin(a) * r * 0.62);
      g.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.22, 0, 7);
    }
    g.moveTo(r * 0.25, 0);
    g.arc(0, 0, r * 0.25, 0, 7);
    g.stroke();
  } else if (id === "bloom") {
    for (let i = 0; i < 6; i++) {
      g.save();
      g.rotate((i * Math.PI) / 3);
      g.moveTo(0, 0);
      g.ellipse(0, -r * 0.5, r * 0.22, r * 0.5, 0, 0, 7);
      g.restore();
    }
    g.stroke();
  } else if (id === "moon") {
    g.arc(0, 0, r * 0.8, 0.6, Math.PI * 2 - 0.6);
    g.quadraticCurveTo(r * 0.1, 0, Math.cos(0.6) * r * 0.8, Math.sin(0.6) * r * 0.8);
    g.stroke();
  } else if (id === "tri") {
    g.moveTo(0, -r * 0.85);
    g.lineTo(r * 0.8, r * 0.6);
    g.lineTo(-r * 0.8, r * 0.6);
    g.closePath();
    g.stroke();
  }
  g.restore();
}
function mapTex() {
  return canvas(512, 320, (g, w, h) => {
    g.fillStyle = "#d9e4e8";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#9fb8c4";
    g.beginPath();
    g.moveTo(0, h * 0.7);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, h * 0.62 + Math.sin(x * 0.05) * 18 + rnd() * 10);
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.fill();
    g.strokeStyle = "rgba(60,80,100,0.25)";
    for (let x = 0; x < w; x += 40) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    g.fillStyle = "#c22";
    g.strokeStyle = "#c22";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(360, 90, 8, 0, 7);
    g.fill();
    g.beginPath();
    g.moveTo(360, 90);
    g.lineTo(150, 250);
    g.stroke();
    g.beginPath();
    g.arc(150, 250, 8, 0, 7);
    g.fill();
    g.font = "bold 22px Arial";
    g.fillText("OUTPOST 47", 300, 70);
    g.fillText("KESTREL", 100, 290);
    g.font = "bold 28px Arial";
    g.fillText("215°", 270, 170);
  });
}
function spriteTex() {
  return canvas(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.4, "rgba(255,255,255,0.6)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}

/* ================================================================ materials */
export function createMaterials() {
  seed = 7;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1, ...o });
  const T = {
    panel: tex(panels("#8d98a3", "#5c6670", { band: "#3d6f8f", grime: true })),
    panelDark: tex(panels("#5c636b", "#353b41", { band: "#c9a227", grime: true })),
    clinic: tex(panels("#d7dde2", "#a6b0b8", { band: "#3fa58a" })),
    lab: tex(panels("#e4eaee", "#b9c4cc", { band: "#d23a3a" })),
    floorTile: tex(tiles("#3b4148", "#2a2f35")),
    labTile: tex(tiles("#c9d1d6", "#9aa4ab", 4)),
    plate: tex(plate()),
    ceiling: tex(tiles("#6d757d", "#4c535a", 2)),
    concrete: tex(concrete()),
    snow: tex(snowTex()),
    rock: tex(rockTex()),
    rockIce: tex(rockTex("#3f5a70")),
    ice: tex(iceTex()),
    wood: tex(woodTex()),
    clad: tex(cladTex("#4a5560", "#b5532c")),
    cladShed: tex(cladTex("#7a3a2a", null)),
    hazard: tex(hazardTex()),
    screen: tex(screenTex("#5fffd2", "#04140f"), { repeat: false }),
    screenBlue: tex(screenTex("#9fd8ff", "#04101c"), { repeat: false }),
    screenRed: tex(screenTex("#ff6a5a", "#1a0404"), { repeat: false }),
    sprite: tex(spriteTex(), { repeat: false }),
  };
  const M = {
    wall_station: std({ map: T.panel, roughness: 0.62, metalness: 0.35 }),
    wall_industrial: std({ map: T.panelDark, roughness: 0.6, metalness: 0.45 }),
    wall_clinic: std({ map: T.clinic, roughness: 0.5, metalness: 0.15 }),
    wall_shed: std({ map: T.wood, roughness: 0.85 }),
    wall_tunnel: std({ map: T.concrete, roughness: 0.92 }),
    wall_lab: std({ map: T.lab, roughness: 0.4, metalness: 0.2 }),
    wall_ice: std({ map: T.rockIce, roughness: 0.55, metalness: 0.05 }),
    floor_station: std({ map: T.floorTile, roughness: 0.7 }),
    floor_industrial: std({ map: T.plate, roughness: 0.55, metalness: 0.55 }),
    floor_clinic: std({ map: T.labTile, roughness: 0.45 }),
    floor_shed: std({ map: T.wood, roughness: 0.9 }),
    floor_tunnel: std({ map: T.concrete, roughness: 0.95, color: 0x9aa0a6 }),
    floor_lab: std({ map: T.labTile, roughness: 0.35 }),
    floor_ice: std({ map: T.ice, roughness: 0.25, metalness: 0.1, color: 0xa0c8e0 }),
    ceil: std({ map: T.ceiling, roughness: 0.9 }),
    ceil_ice: std({ map: T.rock, roughness: 0.9, color: 0x8aa0b4 }),
    ext: std({ map: T.clad, roughness: 0.7, metalness: 0.3 }),
    extShed: std({ map: T.cladShed, roughness: 0.8, metalness: 0.2 }),
    roof: std({ map: T.snow, roughness: 0.95 }),
    snow: std({ map: T.snow, roughness: 0.97, color: 0xe8f0ff }),
    rock: std({ map: T.rock, roughness: 0.95 }),
    ice: std({ map: T.ice, roughness: 0.15, metalness: 0.05, color: 0x9fdcff, emissive: 0x1a6aa0, emissiveIntensity: 0.55, transparent: true, opacity: 0.88 }),
    iceGlow: std({ color: 0x9feaff, emissive: 0x38c4ff, emissiveIntensity: 1.6, roughness: 0.2 }),
    iceWall: std({ map: T.ice, color: 0xb8e6ff, emissive: 0x1e74b0, emissiveIntensity: 0.6, roughness: 0.1, transparent: true, opacity: 0.92 }),
    metal: std({ color: 0x8a939c, roughness: 0.45, metalness: 0.7 }),
    metalDark: std({ color: 0x3a4047, roughness: 0.55, metalness: 0.6 }),
    steel: std({ color: 0x5d6670, roughness: 0.35, metalness: 0.85 }),
    paintYellow: std({ color: 0xd9a21e, roughness: 0.6, metalness: 0.3 }),
    paintOrange: std({ color: 0xd2561f, roughness: 0.55, metalness: 0.3 }),
    paintRed: std({ color: 0x9e2420, roughness: 0.6, metalness: 0.3 }),
    paintBlue: std({ color: 0x2f5a86, roughness: 0.6, metalness: 0.3 }),
    paintGreen: std({ color: 0x3f6a4a, roughness: 0.6, metalness: 0.3 }),
    rust: std({ color: 0x7d3a22, roughness: 0.85, metalness: 0.4 }),
    white: std({ color: 0xe6eaee, roughness: 0.5 }),
    plastic: std({ color: 0x23272c, roughness: 0.5 }),
    rubber: std({ color: 0x16181a, roughness: 0.95 }),
    fabric: std({ color: 0x2c4a6e, roughness: 0.95 }),
    fabricGrey: std({ color: 0x6a7076, roughness: 0.95 }),
    wood: std({ map: T.wood, roughness: 0.85 }),
    paper: std({ color: 0xf0ebdc, roughness: 0.9, emissive: 0x302c22, emissiveIntensity: 0.35 }),
    cardboard: std({ color: 0x9a7a4e, roughness: 0.95 }),
    hazard: std({ map: T.hazard, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9ec8e8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false }),
    cryoGlass: new THREE.MeshStandardMaterial({ color: 0xa8e8ff, emissive: 0x2a8cc0, emissiveIntensity: 0.5, roughness: 0.1, transparent: true, opacity: 0.4, depthWrite: false }),
    frost: std({ color: 0xdff4ff, emissive: 0x5fb4e0, emissiveIntensity: 0.35, roughness: 0.4, transparent: true, opacity: 0.85 }),
    specimen: std({ color: 0x40d0ff, emissive: 0x20b0ff, emissiveIntensity: 2.2, roughness: 0.3 }),
    silhouette: std({ color: 0x1a2a38, roughness: 0.9 }),
    screen: std({ color: 0x000000, emissive: 0xffffff, emissiveMap: T.screen, emissiveIntensity: 0.05, roughness: 0.3 }),
    screenBlue: std({ color: 0x000000, emissive: 0xffffff, emissiveMap: T.screenBlue, emissiveIntensity: 0.05, roughness: 0.3 }),
    screenLab: std({ color: 0x000000, emissive: 0xffffff, emissiveMap: T.screenBlue, emissiveIntensity: 0.05, roughness: 0.3 }),
    screenEmg: std({ color: 0x000000, emissive: 0xffffff, emissiveMap: T.screenRed, emissiveIntensity: 1.1, roughness: 0.3 }),
    ledRed: std({ color: 0x300000, emissive: 0xff2010, emissiveIntensity: 2 }),
    ledGreen: std({ color: 0x003000, emissive: 0x20ff60, emissiveIntensity: 2 }),
    ledAmber: std({ color: 0x302000, emissive: 0xffa020, emissiveIntensity: 2 }),
    lampWarm: std({ color: 0x302010, emissive: 0xffc070, emissiveIntensity: 2.4 }),
    winNight: std({ color: 0x0a1a2c, emissive: 0x0c2240, emissiveIntensity: 0.7, roughness: 0.1, metalness: 0.4 }),
    winMain: std({ color: 0x101010, emissive: 0xffc982, emissiveIntensity: 0.0, roughness: 0.3 }),
    winShed: std({ color: 0x101010, emissive: 0xffb060, emissiveIntensity: 1.6, roughness: 0.3 }),
    vehicle: std({ color: 0xd45a1c, roughness: 0.55, metalness: 0.35 }),
    containerRust: std({ map: T.cladShed, color: 0xc07050, roughness: 0.8, metalness: 0.3 }),
    containerBlue: std({ map: T.clad, color: 0x6a90c0, roughness: 0.8, metalness: 0.3 }),
    steamPipe: std({ color: 0xff8a2a, emissive: 0xff6a10, emissiveIntensity: 0.55, roughness: 0.5, metalness: 0.3 }),
    bluePipe: std({ color: 0x3a8fe0, emissive: 0x1a5ac0, emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.3 }),
    greyPipe: std({ color: 0x9aa4ae, emissive: 0x50565c, emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.3 }),
  };
  const signs = {};
  const sign = (key, lines, opts) => {
    if (!signs[key]) {
      const t = tex(textTex(lines, opts), { repeat: false });
      signs[key] = std({ map: t, roughness: 0.7, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: opts?.glow ?? 0.12 });
    }
    return signs[key];
  };
  sign("plaque", [["OUTPOST 47", "bold 54px Georgia"], ["HALVORSEN POLAR DYNAMICS", "bold 26px Georgia"], ["ESTABLISHED 1987", "bold 40px Georgia"]], { bg: "#a4823a", fg: "#2a1c08", border: "#6a5020" });
  sign("calendar", [["FEBRUARY", "bold 44px Arial"], ["Birthdays: Lund 02/01 · Orlov 14/03", "24px Arial"], ["Pell 30/05 · Tanaka 11/08", "24px Arial"], ["09 — CRYO OVERLOAD TEST", "bold 24px Arial"]], { bg: "#f4f1e8", border: "#c33" });
  sign("manual", [["GEN-1 COLD START", "bold 36px Arial"], ["1 FUEL PUMP  2 GLOW PLUGS", "26px Arial"], ["3 CHOKE  4 STARTER", "26px Arial"], ["5 MAIN BREAKER", "26px Arial"]], { bg: "#f2e9c8" });
  sign("board", [["CREW ROSTER", "bold 40px Arial"], ["VARGA · ORLOV · TANAKA · KEENE", "24px Arial"], ["HOLT · PELL · LUND", "24px Arial"]], { bg: "#c8b08a" });
  sign("placard", [["!  READ BEFORE OPERATING", "bold 34px Arial"], ["see rules", "24px Arial"]], { bg: "#f1d24a" });
  sign("plate", [["BULKHEAD B-7", "bold 40px Arial"], ["CRANK → IDLER → DRIVE", "28px Arial"], ["3 : 1   DRIVE CLOCKWISE", "bold 30px Arial"]], { bg: "#b9bec4", border: "#555" });
  sign("lockdown", [["LOCKDOWN", "bold 52px Arial"], ["INSERT LEVEL-5 CLEARANCE", "26px Arial"]], { bg: "#300808", fg: "#ff4a3a", glow: 0.9 });
  sign("procedure", [["LAUNCH: 1 SEAL LAB", "bold 30px Arial"], ["2 VENT HANGAR  3 OPEN BAY DOOR", "26px Arial"], ["4 RELEASE CLAMPS", "bold 30px Arial"]], { bg: "#f1d24a" });
  sign("card", [["KESTREL RELAY", "bold 40px Arial"], ["406.4 MHz", "bold 60px Arial"]], { bg: "#f4f1e8" });
  sign("tag", [["B-2 TAG", "bold 40px Arial"], ["BLUE 5 · GREEN 0", "28px Arial"], ["FEED → 3.4–3.8 bar", "28px Arial"]], { bg: "#e0d8b0" });
  sign("stencilC", [["C", "bold 200px Arial"]], { bg: "#d9a21e", fg: "#111" });
  sign("outpost", [["OUTPOST 47", "bold 120px Arial"]], { w: 1024, h: 256, bg: "#1c2228", fg: "#e9eef3", glow: 0.25 });
  signs.whiteboard = std({ map: tex(symbolBoard(), { repeat: false }), roughness: 0.4, emissive: 0xffffff, emissiveMap: tex(symbolBoard(), { repeat: false }), emissiveIntensity: 0.15 });
  const mt = tex(mapTex(), { repeat: false });
  signs.map = std({ map: mt, emissive: 0xffffff, emissiveMap: mt, emissiveIntensity: 0.15, roughness: 0.6 });
  return { M, T, signs, sign, textTex: (lines, o) => tex(textTex(lines, o), { repeat: false }) };
}

/* ================================================================ builder */
const _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function scaleUV(geo, sx, sy, sz, k) {
  // BoxGeometry faces: +x,-x (z,y), +y,-y (x,z), +z,-z (x,y)
  const uv = geo.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const j = f * 4 + i;
      uv.setXY(j, (uv.getX(j) * dims[f][0]) / k, (uv.getY(j) * dims[f][1]) / k);
    }
  }
}
export class Builder {
  constructor() {
    this.buckets = new Map(); // key -> {mat, geos[]}
    this.base = new THREE.Matrix4();
    this.region = "s";
  }
  at(x, y, z, rot = 0, angle) {
    this.region = x > 300 ? "u" : "s";
    _q.setFromAxisAngle(_v.set(0, 1, 0), angle ?? (rot * Math.PI) / 2);
    this.base.compose(_s.set(x, y, z), _q, new THREE.Vector3(1, 1, 1));
    return this;
  }
  push(mat, geo, x, y, z, o = {}) {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
    _q.setFromEuler(_e);
    _l.compose(_v.set(x, y, z), _q, _s.set(1, 1, 1));
    _m.multiplyMatrices(this.base, _l);
    geo.applyMatrix4(_m);
    const key = this.region + "|" + mat;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { mat, region: this.region, geos: [] }));
    b.geos.push(geo);
  }
  box(mat, x, y, z, sx, sy, sz, o = {}) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (o.uv) scaleUV(g, sx, sy, sz, o.uv);
    this.push(mat, g, x, y, z, o);
  }
  cyl(mat, x, y, z, r1, r2, h, o = {}) {
    this.push(mat, new THREE.CylinderGeometry(r1, r2, h, o.seg || 14, 1, !!o.open), x, y, z, o);
  }
  sph(mat, x, y, z, r, o = {}) {
    const g = new THREE.SphereGeometry(r, o.seg || 12, Math.max(6, (o.seg || 12) >> 1));
    if (o.sx || o.sy || o.sz) g.scale(o.sx || 1, o.sy || 1, o.sz || 1);
    this.push(mat, g, x, y, z, o);
  }
  cone(mat, x, y, z, r, h, o = {}) {
    this.push(mat, new THREE.ConeGeometry(r, h, o.seg || 8), x, y, z, o);
  }
  plane(mat, x, y, z, w, h, o = {}) {
    this.push(mat, new THREE.PlaneGeometry(w, h), x, y, z, o);
  }
}

/* ================================================================ props */
// Each builder draws in local space: origin on the floor at the prop centre,
// front facing +z. B.at() has already applied position + rotation.
const leg4 = (B, mat, w, d, h, t = 0.05) => {
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(mat, (sx * (w - t)) / 2, h / 2, (sz * (d - t)) / 2, t, h, t);
};
export const BUILD = {
  desk(B) {
    B.box("metal", 0, 0.75, 0, 1.6, 0.05, 0.8);
    leg4(B, "metalDark", 1.55, 0.75, 0.73);
    B.box("metalDark", 0.5, 0.45, 0, 0.5, 0.55, 0.7);
  },
  terminal(B, o) {
    B.box("plastic", 0, 0.8, -0.05, 0.42, 0.04, 0.3);
    B.box("plastic", 0, 1.05, -0.15, 0.6, 0.42, 0.05);
    B.plane(o.screen === "emg" ? "screenEmg" : o.screen === "blue" ? "screenBlue" : "screen", 0, 1.05, -0.122, 0.54, 0.36);
    B.box("plastic", 0, 0.79, 0.15, 0.48, 0.02, 0.16);
  },
  console(B, o) {
    const n = o.screens || 4;
    const w = o.big ? 3.2 : 3.2;
    B.box("metalDark", 0, 0.45, 0, w, 0.9, 0.9);
    B.box("metal", 0, 0.95, 0.1, w, 0.08, 0.7, { rx: -0.25 });
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / n) * (i + 0.5);
      B.box("plastic", x, 1.45, -0.32, w / n - 0.06, 0.55, 0.06);
      B.plane(i % 2 ? "screenBlue" : "screen", x, 1.45, -0.285, w / n - 0.14, 0.45);
    }
    for (let i = 0; i < 10; i++) B.box(i % 3 ? "ledGreen" : "ledAmber", -w / 2 + 0.2 + i * 0.3, 1.0, 0.3, 0.06, 0.03, 0.04, { rx: -0.25 });
  },
  lockers(B, o) {
    const n = o.n || 4;
    for (let i = 0; i < n; i++) {
      const x = -1.2 + 0.6 * (i + 0.5);
      B.box(o.varga && i === 1 ? "paintRed" : "paintBlue", x, 0.975, 0, 0.58, 1.95, 0.55);
      B.box("metalDark", x + 0.2, 1.1, 0.28, 0.04, 0.18, 0.03);
      for (let k = 0; k < 3; k++) B.box("metalDark", x, 1.7 - k * 0.04, 0.278, 0.35, 0.015, 0.01);
    }
    if (o.varga) B.box("ledAmber", -0.3 + 0.2, 1.3, 0.3, 0.12, 0.12, 0.03);
  },
  locker(B) {
    BUILD.lockers(B, { n: 1 });
  },
  rack(B, o) {
    for (const z of [-3.7, -1.25, 1.25, 3.7]) for (const x of [-0.45, 0.45]) B.box("paintOrange", x, 1.3, z, 0.08, 2.6, 0.08);
    for (const y of [0.15, 0.95, 1.75, 2.5]) {
      B.box("metal", 0, y, 0, 1, 0.05, 7.6);
      for (let k = 0; k < 5; k++) {
        const z = -3.2 + k * 1.55 + ((y * 7) % 0.6);
        if ((k + y * 3) % 4 > 2.6) continue;
        B.box(k % 2 ? "cardboard" : "metalDark", 0, y + 0.3, z, 0.8, 0.55, 0.9);
      }
    }
    if (o.stencil) {
      B.plane("sign:stencilC", 0, 2.2, 3.82, 0.6, 0.6);
      B.plane("sign:stencilC", 0, 2.2, -3.82, 0.6, 0.6, { ry: Math.PI });
    }
  },
  shelf(B) {
    for (const x of [-0.95, 0.95]) B.box("metal", x, 1, 0, 0.05, 2, 0.5);
    for (const y of [0.3, 0.9, 1.5]) {
      B.box("metal", 0, y, 0, 2, 0.04, 0.5);
      B.box("cardboard", -0.5, y + 0.18, 0, 0.5, 0.32, 0.4);
    }
  },
  crate(B) {
    B.box("wood", 0, 0.5, 0, 1, 1, 1, { uv: 1 });
    B.box("metalDark", 0, 0.5, 0.505, 1, 0.08, 0.01);
  },
  crates(B) {
    B.box("wood", -0.5, 0.55, 0, 1.05, 1.1, 1.1, { uv: 1 });
    B.box("wood", 0.55, 0.45, 0.05, 0.95, 0.9, 0.95, { uv: 1 });
    B.box("cardboard", -0.4, 1.4, 0, 0.7, 0.6, 0.7);
  },
  cratepile(B) {
    B.box("wood", -0.6, 0.6, -0.6, 1.2, 1.2, 1.2, { uv: 1 });
    B.box("wood", 0.6, 0.6, -0.5, 1.15, 1.2, 1.2, { uv: 1 });
    B.box("wood", 0, 0.55, 0.65, 1.2, 1.1, 1.1, { uv: 1 });
    B.box("wood", -0.3, 1.75, -0.4, 1.1, 1.1, 1.1, { uv: 1 });
    B.box("roof", -0.3, 2.33, -0.4, 1.15, 0.08, 1.15);
  },
  bunk(B) {
    for (const y of [0.45, 1.45]) {
      B.box("metal", 0, y, 0, 0.95, 0.08, 2.05);
      B.box("fabric", 0, y + 0.1, 0.05, 0.85, 0.14, 1.9);
      B.box("white", 0, y + 0.2, -0.82, 0.6, 0.1, 0.32);
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box("metalDark", sx * 0.45, 0.9, sz * 1.0, 0.05, 1.8, 0.05);
    B.box("fabricGrey", 0.1, 0.62, 0.4, 0.7, 0.06, 0.9, { ry: 0.2 });
  },
  table(B) {
    B.box("white", 0, 0.74, 0, 2.4, 0.05, 1);
    leg4(B, "metal", 2.3, 0.9, 0.72);
  },
  bench(B) {
    B.box("metal", 0, 0.43, 0, 2.2, 0.05, 0.38);
    leg4(B, "metalDark", 2.1, 0.32, 0.42);
  },
  chair(B) {
    B.box("plastic", 0, 0.46, 0, 0.45, 0.06, 0.45);
    B.box("plastic", 0, 0.75, 0.21, 0.45, 0.55, 0.05);
    B.cyl("metal", 0, 0.22, 0, 0.03, 0.03, 0.44);
  },
  counter(B, o) {
    const w = o.w || 5;
    B.box("metal", 0, 0.45, 0, w, 0.9, 0.7);
    B.box("steel", 0, 0.92, 0, w, 0.04, 0.72);
    for (let i = 0; i < Math.floor(w / 0.8); i++) B.box("metalDark", -w / 2 + 0.4 + i * 0.8, 0.5, 0.355, 0.7, 0.75, 0.01);
  },
  fridge(B) {
    B.box("white", 0, 1, 0, 0.9, 2, 0.7);
    B.box("metal", 0.35, 1.2, 0.36, 0.04, 0.5, 0.04);
  },
  medbed(B) {
    B.box("metal", 0, 0.55, 0, 1, 0.12, 2.1);
    B.box("white", 0, 0.66, 0.05, 0.9, 0.12, 1.95);
    B.box("white", 0, 0.78, -0.75, 0.7, 0.12, 0.4, { rx: 0.3 });
    leg4(B, "metal", 0.9, 2, 0.5);
    B.cyl("metal", 0.55, 1.2, -0.9, 0.015, 0.015, 1.8);
    B.box("cryoGlass", 0.55, 1.75, -0.9, 0.14, 0.25, 0.06);
  },
  gurney(B) {
    B.box("metal", 0, 0.8, 0, 0.7, 0.06, 1.9);
    B.box("white", 0, 0.86, 0, 0.62, 0.06, 1.8);
    leg4(B, "metal", 0.6, 1.8, 0.8, 0.03);
  },
  cabinet(B) {
    B.box("white", 0, 0.95, 0, 1.2, 1.9, 0.5);
    B.box("glass", 0, 1.35, 0.255, 1.1, 0.9, 0.01);
    for (const y of [1.05, 1.45]) B.box("white", 0, y, 0, 1.1, 0.02, 0.45);
    B.box("paintRed", 0, 1.98, 0.2, 0.3, 0.12, 0.06);
  },
  generator(B) {
    B.box("paintYellow", 0, 0.2, 0, 5, 0.4, 3);
    B.box("paintGreen", -0.6, 1.25, 0, 3, 1.7, 2.2);
    B.box("metalDark", 1.6, 1.0, 0, 1.4, 1.4, 2.4);
    B.cyl("steel", 1.6, 1.0, 0, 0.55, 0.55, 2.5, { rx: Math.PI / 2, seg: 20 });
    for (let i = 0; i < 6; i++) B.box("metal", -1.8 + i * 0.5, 2.15, 0, 0.2, 0.12, 1.6);
    B.cyl("metalDark", -1.9, 2.6, 0.6, 0.12, 0.12, 1.2);
    B.box("metalDark", -0.6, 1.2, 1.12, 1.2, 0.8, 0.06);
    B.box("hazard", 0, 0.42, 1.49, 5, 0.06, 0.02);
    B.box("ledRed", 0.9, 1.65, 1.11, 0.08, 0.08, 0.03);
  },
  boiler(B) {
    B.cyl("paintRed", 0, 1.3, 0, 0.9, 0.9, 2.4, { seg: 20 });
    B.sph("paintRed", 0, 2.5, 0, 0.9, { sy: 0.4, seg: 18 });
    B.box("metalDark", 0, 0.1, 0, 2, 0.2, 3);
    B.cyl("steel", 0, 2.8, -1.1, 0.12, 0.12, 2.2, { rx: Math.PI / 2 });
    B.cyl("metal", 0.95, 1.4, 0.5, 0.18, 0.18, 0.08, { rz: Math.PI / 2 });
    B.box("metalDark", 0.92, 1.4, 0.5, 0.05, 0.25, 0.25);
  },
  panel(B, o) {
    B.box(o.kind === "junction" ? "paintGreen" : "metalDark", 0, 1.3, 0, 1.8, 1.4, 0.3);
    B.box("metal", 0, 1.3, 0.16, 1.6, 1.2, 0.02);
    for (let i = 0; i < 6; i++) B.box(i % 2 ? "ledGreen" : "ledRed", -0.6 + i * 0.24, 1.75, 0.18, 0.06, 0.06, 0.02);
    for (let i = 0; i < 4; i++) B.box("plastic", -0.45 + i * 0.3, 1.2, 0.2, 0.1, 0.22, 0.06);
    B.box("hazard", 0, 0.55, 0.16, 1.8, 0.08, 0.02);
    B.cyl("metalDark", 0, 2.3, 0, 0.06, 0.06, 1.0);
  },
  liftcage(B) {
    B.box("metalDark", 0, 0.05, 0, 2.6, 0.1, 2.6);
    B.box("metalDark", 0, 3, 0, 2.6, 0.1, 2.6);
    for (let i = 0; i <= 8; i++) {
      const t = -1.25 + i * 0.3125;
      B.box("steel", t, 1.5, -1.28, 0.04, 3, 0.04);
      B.box("steel", -1.28, 1.5, t, 0.04, 3, 0.04);
      B.box("steel", 1.28, 1.5, t, 0.04, 3, 0.04);
      if (i % 2) B.box("steel", t, 1.5, 1.28, 0.04, 3, 0.04);
    }
    for (const y of [0.6, 1.5, 2.4]) B.box("paintYellow", 0, y, 1.28, 2.6, 0.06, 0.06);
    B.box("hazard", 0, 0.12, 1.2, 2.6, 0.04, 0.2);
    B.cyl("steel", 0, 1.2, 1.32, 0.04, 0.04, 2.4, { rz: Math.PI / 2 });
    B.box("ledAmber", 1.0, 2.3, 1.35, 0.1, 0.1, 0.04);
  },
  barrels(B) {
    for (const [x, z, m] of [[-0.35, -0.35, "paintBlue"], [0.35, -0.3, "paintRed"], [-0.3, 0.35, "paintBlue"], [0.36, 0.36, "rust"]]) {
      B.cyl(m, x, 0.5, z, 0.3, 0.3, 1, { seg: 16 });
      B.cyl("metalDark", x, 1.0, z, 0.31, 0.31, 0.03, { seg: 16 });
    }
  },
  heater(B) {
    B.box("paintRed", 0, 0.45, 0, 1.2, 0.8, 0.5);
    for (let i = 0; i < 7; i++) B.box("lampWarm", -0.45 + i * 0.15, 0.5, 0.26, 0.06, 0.5, 0.02);
    B.box("metalDark", 0, 0.05, 0, 1.3, 0.1, 0.6);
  },
  workbench(B) {
    B.box("wood", 0, 0.9, 0, 2.4, 0.08, 0.8, { uv: 1 });
    leg4(B, "metalDark", 2.3, 0.7, 0.88, 0.07);
    B.box("metal", 0, 0.3, 0, 2.3, 0.04, 0.7);
    B.box("metalDark", 0, 1.6, -0.38, 2.4, 1.3, 0.04);
    for (let i = 0; i < 6; i++) B.box("metal", -0.9 + i * 0.35, 1.7, -0.33, 0.04, 0.35, 0.06);
    B.box("paintRed", 0.8, 1.05, 0.05, 0.5, 0.22, 0.3);
  },
  snowcat(B, o) {
    const body = "vehicle";
    for (const sx of [-1, 1]) {
      B.box("rubber", sx * 1.05, 0.45, 0, 0.55, 0.9, 4.6);
      for (let k = 0; k < 5; k++) B.cyl("metalDark", sx * 1.05, 0.42, -1.8 + k * 0.9, 0.32, 0.32, 0.58, { rz: Math.PI / 2 });
    }
    B.box(body, 0, 1.15, 0.2, 2.2, 0.75, 4.4);
    B.box(body, 0, 2.05, -0.5, 2.1, 1.05, 2.4);
    B.box("glass", 0, 2.1, -1.71, 1.8, 0.75, 0.02);
    B.box("glass", 1.06, 2.15, -0.6, 0.02, 0.6, 1.8);
    B.box("glass", -1.06, 2.15, -0.6, 0.02, 0.6, 1.8);
    B.box("metalDark", 0, 2.62, -0.5, 2.15, 0.08, 2.45);
    B.box("lampWarm", 0.7, 1.35, -1.99, 0.3, 0.18, 0.04);
    B.box("lampWarm", -0.7, 1.35, -1.99, 0.3, 0.18, 0.04);
    B.box("metal", 0, 1.6, 1.6, 2, 0.06, 1.2);
    if (o.frozen) {
      B.box("snow", 0, 2.7, -0.5, 2.2, 0.2, 2.5);
      B.box("snow", 0, 1.56, 1.4, 2.2, 0.16, 1.7);
      B.box("frost", 1.075, 2.15, -0.6, 0.02, 0.62, 1.82);
      B.sph("snow", 1.3, 0.3, 1.6, 0.9, { sy: 0.45 });
    }
    if (o.evac) B.box("hazard", 0, 1.55, 2.41, 2.2, 0.2, 0.02);
  },
  container(B, o) {
    const mat = o.color === "rust" ? "containerRust" : "containerBlue";
    B.box(mat, 0, 1.3, 0, 2.5, 2.6, 0.06, { uv: 2 });
    B.box(mat, -1.22, 1.3, 0, 0.06, 2.6, 6.1, { uv: 2.6 });
    B.box(mat, 1.22, 1.3, 0, 0.06, 2.6, 6.1, { uv: 2.6 });
    B.box(mat, 0, 2.57, 0, 2.5, 0.06, 6.1, { uv: 2.6 });
    B.box("roof", 0, 2.65, 0, 2.5, 0.12, 6.1);
    B.box("metalDark", 0, 0.05, 0, 2.5, 0.1, 6.1);
    const closed = o.open === "s" ? -1 : 1;
    B.box(mat, 0, 1.3, closed * 3.03, 2.5, 2.6, 0.06);
    const oz = -closed * 3.05;
    B.box(mat, -1.25 - 0.62, 1.3, oz + 0.5, 1.2, 2.5, 0.06, { ry: 1.2 });
    B.box(mat, 1.25 + 0.62, 1.3, oz + 0.5, 1.2, 2.5, 0.06, { ry: -1.2 });
    B.box("wood", 0, 0.45, closed * 1.8, 1.6, 0.8, 1.2);
  },
  tower(B) {
    const H = 30;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cyl("paintRed", sx * 1.2, H / 2, sz * 1.2, 0.08, 0.12, H, { rz: -sx * 0.025, rx: sz * 0.025, seg: 6 });
    for (let y = 2; y < H; y += 2.5) {
      const w = 2.4 - (y / H) * 0.9;
      B.box(y % 5 < 2.5 ? "white" : "paintRed", 0, y, -w / 2, w, 0.06, 0.06);
      B.box("white", 0, y, w / 2, w, 0.06, 0.06);
      B.box("white", -w / 2, y, 0, 0.06, 0.06, w);
      B.box("white", w / 2, y, 0, 0.06, 0.06, w);
      B.box("metal", 0, y + 1.2, 0, 0.04, 2.6, w * 1.4, { rx: 0.75 });
    }
    B.cyl("white", 0.8, 24, 0, 0.7, 0.7, 0.2, { rz: Math.PI / 2, seg: 18 });
    B.cyl("white", -0.8, 20, 0.6, 0.5, 0.5, 0.15, { rx: Math.PI / 2, seg: 18 });
    B.box("paintGreen", -2.4, 0.7, 0, 0.8, 1.4, 1.2);
    B.box("plastic", -2.82, 1.15, 0, 0.04, 0.5, 0.8);
    B.plane("screenBlue", -2.85, 1.15, 0, 0.7, 0.4, { ry: -Math.PI / 2 });
    B.box("roof", -2.4, 1.43, 0, 0.85, 0.06, 1.25);
  },
  mast(B) {
    B.cyl("metal", 0, 3, 0, 0.05, 0.06, 6);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      B.cyl("metal", Math.cos(a) * 0.3, 5.8, Math.sin(a) * 0.3, 0.012, 0.012, 0.6, { rz: Math.PI / 2, ry: a });
      B.sph("white", Math.cos(a) * 0.6, 5.8, Math.sin(a) * 0.6, 0.08, { seg: 8 });
    }
    B.box("white", 0, 4.2, 0, 0.3, 0.5, 0.3);
  },
  fueltank(B) {
    B.cyl("white", 0, 1.2, 0, 0.95, 0.95, 3.8, { rx: Math.PI / 2, seg: 20 });
    B.box("metalDark", 0, 0.2, -1.3, 1.6, 0.4, 0.3);
    B.box("metalDark", 0, 0.2, 1.3, 1.6, 0.4, 0.3);
    B.box("roof", 0, 2.05, 0, 1.2, 0.12, 3.6);
    B.box("hazard", 0, 1.2, 1.91, 1.0, 0.25, 0.02);
  },
  pad(B) {
    B.cyl("metalDark", 0, 0.05, 0, 6, 6, 0.1, { seg: 32 });
    B.box("paintYellow", 0, 0.11, 0, 0.5, 0.01, 4);
    B.box("paintYellow", -1.2, 0.11, 0, 0.5, 0.01, 4);
    B.box("paintYellow", 1.2, 0.11, 0, 0.5, 0.01, 4);
    B.box("paintYellow", 0, 0.11, 0, 2.9, 0.01, 0.5);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      B.box("lampWarm", Math.cos(a) * 5.6, 0.12, Math.sin(a) * 5.6, 0.2, 0.1, 0.2);
    }
  },
  flag(B) {
    B.cyl("metal", 0, 1.2, 0, 0.025, 0.025, 2.4, { seg: 6 });
    B.box("paintRed", 0.22, 2.2, 0, 0.42, 0.28, 0.01);
  },
  lamppost(B) {
    B.cyl("metalDark", 0, 2.25, 0, 0.08, 0.1, 4.5, { seg: 8 });
    B.box("metalDark", 0, 4.45, 0.3, 0.2, 0.1, 0.7);
  },
  rock(B) {
    B.sph("rock", 0, 0.6, 0, 1.6, { sx: 1, sy: 0.8, sz: 0.9, seg: 7 });
    B.sph("rock", 0.8, 0.4, 0.6, 1.0, { sy: 0.7, seg: 6 });
    B.sph("snow", 0, 1.5, 0, 1.2, { sy: 0.35, seg: 8 });
  },
  bigrock(B) {
    B.sph("rock", 0, 1, 0, 3.2, { sx: 1, sy: 0.8, sz: 0.8, seg: 7 });
    B.sph("rock", 1.6, 2.2, 0.8, 1.8, { seg: 6 });
    B.sph("snow", 0, 3.2, 0, 2.6, { sy: 0.3, seg: 8 });
  },
  ice(B) {
    B.cone("ice", 0, 1.3, 0, 0.6, 2.6, { seg: 6 });
    B.cone("ice", 0.4, 0.8, 0.3, 0.35, 1.6, { seg: 5, rz: 0.3 });
    B.cone("ice", -0.35, 0.6, -0.2, 0.3, 1.2, { seg: 5, rz: -0.4 });
  },
  crystal(B) {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1;
      B.cone("iceGlow", Math.cos(a) * 0.3, 0.45 + (i % 3) * 0.1, Math.sin(a) * 0.3, 0.12 + (i % 2) * 0.05, 0.9 + (i % 3) * 0.4, { seg: 5, rz: Math.cos(a) * 0.4, rx: Math.sin(a) * 0.4 });
    }
  },
  icicles(B) {
    for (let i = 0; i < 18; i++) {
      const x = ((i * 7) % 11) - 5, z = ((i * 5) % 9) - 4;
      B.cone("ice", x, 5.4 - (i % 4) * 0.25, z, 0.15 + (i % 3) * 0.08, 0.8 + (i % 5) * 0.4, { seg: 5, rx: Math.PI });
    }
  },
  pipes(B, o) {
    if (o.steam) {
      // manifold M-3 and its three visible pipe runs
      B.box("metalDark", 0.2, 1.2, 0, 0.4, 1.2, 1.4);
      for (const [k, z, m] of [[0, -0.45, "steamPipe"], [1, 0, "bluePipe"], [2, 0.45, "greyPipe"]]) {
        B.cyl(m, 0.5, 1.2, z, 0.08, 0.08, 0.5, { rz: Math.PI / 2 });
        B.cyl("metal", 0.78, 1.2, z, 0.16, 0.16, 0.05, { rz: Math.PI / 2, seg: 12 });
        if (k === 0) {
          B.cyl(m, 0.3, 2.85, z, 0.08, 0.08, 3.3);
          B.cyl(m, 0.3, 4.5, -3.525, 0.08, 0.08, 6.15, { rx: Math.PI / 2 });
          B.cyl(m, 6.35, 4.5, -6.6, 0.08, 0.08, 12.1, { rz: Math.PI / 2 });
          for (const x of [7.2, 9.7, 12.2]) {
            B.cyl(m, x, 3.1, -6.6, 0.07, 0.07, 2.8);
            B.cone("metal", x, 1.55, -6.6, 0.14, 0.3, { rx: Math.PI });
          }
        } else if (k === 1) {
          B.cyl(m, 0.3, 0.6, z, 0.08, 0.08, 1.2);
          B.cyl("metalDark", 0.3, 0.02, z, 0.25, 0.25, 0.04);
        } else {
          B.cyl(m, 0.3, 3.6, z, 0.08, 0.08, 4.8);
        }
      }
      return;
    }
    const len = o.len || 6;
    const y = o.low ? 2.5 : 2.85;
    const side = o.side || 0;
    for (let k = 0; k < 3; k++) {
      const off = side + (side > 0 ? -k * 0.18 : side < 0 ? k * 0.18 : (k - 1) * 0.2);
      const mat = ["metal", "paintRed", "metalDark"][k];
      if (o.axis === "z") B.cyl(mat, off, y - k * 0.05, 0, 0.06, 0.06, len, { rx: Math.PI / 2, seg: 8 });
      else B.cyl(mat, 0, y - k * 0.05, off, 0.06, 0.06, len, { rz: Math.PI / 2, seg: 8 });
    }
  },
  cables(B) {
    for (let i = 0; i < 4; i++) B.cyl("rubber", (i - 1.5) * 0.12, 0.03, 0, 0.025, 0.025, 3 + i * 0.4, { rx: Math.PI / 2, ry: i * 0.1, seg: 6 });
  },
  notice(B, o) {
    const key = { plaque: "plaque", board: "board", calendar: "calendar", manual: "manual", placard: "placard", plate: "plate", lockdown: "lockdown", procedure: "procedure", card: "card" }[o.kind] || "placard";
    const big = o.kind === "board" || o.kind === "manual" || o.kind === "procedure";
    const w = big ? 1.2 : o.kind === "card" ? 0.6 : 0.8, h = w * 0.5;
    B.box(o.kind === "plaque" ? "paintYellow" : "metalDark", 0, 1.6, -0.03, w + 0.06, h + 0.06, 0.03);
    B.plane("sign:" + key, 0, 1.6, -0.01, w, h);
  },
  tag(B) {
    B.plane("sign:tag", 0, 1.5, 0.02, 0.4, 0.2);
  },
  whiteboard(B) {
    B.box("metal", 0, 1.6, -0.03, 2.1, 1.1, 0.04);
    B.plane("whiteboard", 0, 1.6, 0.0, 2.0, 1.0);
  },
  mapwall(B) {
    B.box("metalDark", 0, 1.6, -0.03, 1.7, 1.1, 0.03);
    B.plane("map", 0, 1.6, -0.01, 1.6, 1.0);
  },
  papers(B) {
    for (let i = 0; i < 5; i++) B.box("paper", (i % 3) * 0.25 - 0.25, 0.005, Math.floor(i / 3) * 0.3, 0.21, 0.004, 0.29, { ry: i * 0.7 });
  },
  debris(B) {
    B.box("metal", 0, 0.05, 0, 1.2, 0.1, 0.6, { ry: 0.4 });
    B.box("ceil", 0.4, 0.04, 0.5, 0.6, 0.04, 0.6, { ry: -0.3, rz: 0.1 });
    B.cyl("rubber", -0.3, 0.03, 0.3, 0.02, 0.02, 1.4, { rx: Math.PI / 2, ry: 0.8 });
  },
  serverrack(B) {
    B.box("plastic", 0, 1.05, 0, 0.8, 2.1, 1);
    for (let i = 0; i < 9; i++) {
      B.box("metalDark", 0, 0.3 + i * 0.2, 0.505, 0.7, 0.14, 0.01);
      B.box(i % 3 ? "ledGreen" : "ledAmber", 0.25, 0.3 + i * 0.2, 0.512, 0.03, 0.03, 0.01);
    }
  },
  radio(B, o) {
    const w = o.small ? 1.2 : 2.6;
    B.box("metalDark", 0, 0.4, 0, w, 0.8, 0.8);
    B.box("metal", 0, 0.82, 0, w, 0.04, 0.8);
    B.box("plastic", 0, 1.1, -0.25, w * 0.8, 0.5, 0.3);
    for (let i = 0; i < 3; i++) B.cyl("metal", -w * 0.25 + i * w * 0.25, 1.1, -0.09, 0.07, 0.07, 0.04, { rx: Math.PI / 2 });
    B.box("screenBlue", 0, 1.25, -0.09, w * 0.4, 0.12, 0.01);
    B.cyl("metalDark", w * 0.4, 1.0, 0.25, 0.02, 0.01, 0.6);
  },
  drill(B) {
    B.box("paintYellow", 0, 0.15, 0, 2, 0.3, 2);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cyl("paintYellow", sx * 0.7, 1.9, sz * 0.7, 0.07, 0.07, 3.4, { rz: -sx * 0.18, rx: sz * 0.18 });
    B.cyl("steel", 0, 1.6, 0, 0.12, 0.12, 3.2);
    B.box("metalDark", 0, 3.3, 0, 0.6, 0.4, 0.6);
    B.cyl("ice", 0, 0.32, 0, 0.35, 0.35, 0.04);
  },
  cryo(B) {
    B.box("white", 0, 1.1, 0, 4, 2.2, 1.6);
    for (let i = 0; i < 4; i++) B.cyl("cryoGlass", -1.5 + i, 2.35, 0, 0.3, 0.3, 0.9, { seg: 14 });
    B.box("metalDark", 0, 1.2, 0.81, 2.6, 0.9, 0.02);
    for (let i = 0; i < 3; i++) B.cyl("bluePipe", -0.9 + i * 0.9, 1.2, 0.86, 0.14, 0.14, 0.06, { rx: Math.PI / 2, seg: 12 });
    B.plane("screenLab", 1.55, 1.6, 0.815, 0.5, 0.35);
    B.box("hazard", 0, 0.1, 0.81, 4, 0.2, 0.02);
  },
  emitter(B) {
    B.box("metalDark", 0, 0.7, 0, 3, 1.4, 1.4);
    for (let i = 0; i < 3; i++) {
      B.cyl("steel", -1 + i, 1.8, 0, 0.2, 0.28, 0.8, { seg: 10 });
      B.sph("cryoGlass", -1 + i, 2.3, 0, 0.22, { seg: 10 });
    }
    B.plane("screenLab", 0, 0.95, 0.705, 1.2, 0.5);
    B.box("hazard", 0, 0.1, 0.705, 3, 0.2, 0.02);
  },
  analyzer(B) {
    B.box("white", 0, 0.5, 0, 2, 1, 1.4);
    B.box("white", -0.3, 1.25, -0.2, 1.2, 0.5, 0.9);
    B.box("glass", -0.3, 1.25, 0.26, 1.1, 0.4, 0.02);
    B.cyl("cryoGlass", -0.3, 1.2, 0, 0.12, 0.12, 0.3, { seg: 10 });
    B.plane("screenLab", 0.65, 1.3, 0.1, 0.45, 0.35, { rx: -0.3 });
  },
  island(B) {
    B.box("white", 0, 0.5, 0, 3, 1, 1.2);
    B.box("steel", 0, 1.02, 0, 3.05, 0.04, 1.25);
    for (const x of [-0.8, 0, 0.8]) {
      B.box("plastic", x, 1.35, -0.4, 0.7, 0.45, 0.05);
      B.plane("screenLab", x, 1.35, -0.372, 0.62, 0.38);
    }
  },
  pod(B, o) {
    B.box("metalDark", 0, 0.15, 0, 1.2, 0.3, 1.2);
    B.cyl("steel", 0, 2.2, 0, 0.6, 0.6, 0.2, { seg: 18 });
    B.cyl(o.open ? "glass" : "frost", 0, 1.25, 0, 0.5, 0.5, 1.9, { seg: 18 });
    if (!o.open) {
      B.sph("silhouette", 0, 1.7, 0.1, 0.13, { seg: 8 });
      B.cyl("silhouette", 0, 1.1, 0.1, 0.17, 0.12, 0.9, { seg: 8 });
    }
    B.box(o.open ? "ledAmber" : "ledGreen", 0, 0.32, 0.61, 0.25, 0.06, 0.02);
  },
  specimen(B) {
    B.cyl("metalDark", 0, 0.25, 0, 0.9, 1, 0.5, { seg: 20 });
    B.cyl("cryoGlass", 0, 1.6, 0, 0.75, 0.75, 2.2, { seg: 20 });
    B.cyl("metalDark", 0, 2.85, 0, 0.9, 0.9, 0.3, { seg: 20 });
    B.sph("specimen", 0, 1.5, 0, 0.32, { seg: 14 });
    for (let i = 0; i < 5; i++) B.sph("specimen", Math.cos(i * 1.3) * 0.4, 1.0 + i * 0.25, Math.sin(i * 1.3) * 0.4, 0.06, { seg: 6 });
  },
  evacconsole(B, o) {
    B.box("metalDark", 0, 0.5, 0, 1.6, 1, 0.7);
    B.box("metal", 0, 1.05, 0.05, 1.6, 0.06, 0.6, { rx: -0.3 });
    B.plane(o.final ? "screenBlue" : "screenLab", 0, 1.08, 0.08, 1.2, 0.4, { rx: -Math.PI / 2 + 0.3 });
    B.box(o.final ? "ledRed" : "ledAmber", -0.6, 1.12, 0.28, 0.1, 0.03, 0.1);
    B.box("ledGreen", 0.6, 1.12, 0.28, 0.1, 0.03, 0.1);
  },
  cart(B) {
    B.box("steel", 0, 0.85, 0, 1, 0.04, 0.6);
    B.box("steel", 0, 0.4, 0, 1, 0.04, 0.6);
    leg4(B, "metal", 0.95, 0.55, 0.85, 0.03);
  },
  sled(B) {
    B.box("wood", 0, 0.42, 0, 0.9, 0.06, 2, { uv: 1 });
    for (const sx of [-1, 1]) B.box("metal", sx * 0.42, 0.18, 0, 0.04, 0.06, 2.2);
    B.box("paintOrange", 0, 0.55, -0.5, 0.6, 0.25, 0.6);
  },
  toolbox(B) {
    B.box("paintRed", 0, 0.18, 0, 0.7, 0.36, 0.4);
    B.box("metalDark", 0, 0.4, 0, 0.4, 0.04, 0.05);
  },
  cairn(B) {
    B.sph("rock", 0, 0.3, 0, 0.5, { seg: 6 });
    B.sph("rock", 0.05, 0.75, 0, 0.35, { seg: 6 });
    B.sph("rock", 0, 1.05, 0.03, 0.22, { seg: 6 });
    B.cyl("paintOrange", 0, 1.6, 0, 0.02, 0.02, 1);
  },
  wreck(B) {
    B.box("rust", 0, 0.4, 0, 1.6, 0.8, 1.2, { ry: 0.5, rz: 0.15 });
    B.sph("snow", 0, 0.7, 0, 1, { sy: 0.4, seg: 8 });
  },
  mmonitor() {},
};
