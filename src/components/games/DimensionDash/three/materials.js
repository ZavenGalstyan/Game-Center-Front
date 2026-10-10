/**
 * Dimension Dash — procedural canvas textures + the per-world material set.
 * No image files: every surface pattern is drawn here (small, tiling).
 */
import * as THREE from "three";

function canvas(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
};

/** classic two-tone checkered cliff (with a darker band) */
function checker(a, b) {
  return canvas(128, 128, (g) => {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        g.fillStyle = (x + y) % 2 ? a : b;
        g.fillRect(x * 32, y * 32, 32, 32);
      }
    }
    g.fillStyle = "rgba(0,0,0,0.08)";
    for (let i = 0; i < 4; i++) g.fillRect(0, i * 32 + 28, 128, 4);
  });
}

function grassTop(a, b, theme) {
  return canvas(128, 128, (g) => {
    g.fillStyle = a;
    g.fillRect(0, 0, 128, 128);
    if (theme === "neon") {
      g.strokeStyle = "rgba(61,245,255,0.55)";
      g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        g.beginPath();
        g.moveTo(i * 32, 0);
        g.lineTo(i * 32, 128);
        g.stroke();
        g.beginPath();
        g.moveTo(0, i * 32);
        g.lineTo(128, i * 32);
        g.stroke();
      }
      return;
    }
    if (theme === "final") {
      g.strokeStyle = "rgba(125,255,240,0.35)";
      g.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.moveTo(Math.random() * 128, 0);
        g.lineTo(Math.random() * 128, 128);
        g.stroke();
      }
    }
    // stripes (mown lawn / sand ripples / planks)
    for (let i = 0; i < 4; i++) {
      g.fillStyle = b;
      g.fillRect(0, i * 32, 128, 16);
    }
    // speckles
    for (let i = 0; i < 220; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    if (theme === "ocean") {
      g.strokeStyle = "rgba(90,60,30,0.35)";
      g.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        g.beginPath();
        g.moveTo(0, i * 16);
        g.lineTo(128, i * 16);
        g.stroke();
      }
    }
  });
}

function arrows() {
  return canvas(64, 128, (g) => {
    g.fillStyle = "#1a1a24";
    g.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 2; i++) {
      const y = i * 64 + 8;
      const grd = g.createLinearGradient(0, y, 0, y + 46);
      grd.addColorStop(0, "#fff6a0");
      grd.addColorStop(1, "#ff8a1f");
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(32, y);
      g.lineTo(60, y + 30);
      g.lineTo(46, y + 30);
      g.lineTo(46, y + 46);
      g.lineTo(18, y + 46);
      g.lineTo(18, y + 30);
      g.lineTo(4, y + 30);
      g.closePath();
      g.fill();
    }
  });
}

function hexGlow() {
  return canvas(128, 128, (g) => {
    g.fillStyle = "rgba(0,0,0,0)";
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 3;
    const r = 16;
    for (let y = -1; y < 6; y++) {
      for (let x = -1; x < 6; x++) {
        const cx = x * r * 1.5 * 1.15 + (y % 2) * r * 0.86;
        const cy = y * r * 1.0 * 1.6;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const px = cx + Math.cos(a) * r * 0.8;
          const py = cy + Math.sin(a) * r * 0.8;
          if (k === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        g.stroke();
      }
    }
  });
}

function stoneTex(a, b) {
  return canvas(128, 128, (g) => {
    g.fillStyle = a;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = b;
    g.lineWidth = 3;
    for (let y = 0; y < 4; y++) {
      g.beginPath();
      g.moveTo(0, y * 32);
      g.lineTo(128, y * 32);
      g.stroke();
      for (let x = 0; x < 3; x++) {
        const ox = (y % 2) * 21 + x * 43;
        g.beginPath();
        g.moveTo(ox, y * 32);
        g.lineTo(ox, y * 32 + 32);
        g.stroke();
      }
    }
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
    }
  });
}

function railTex() {
  return canvas(64, 16, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 16);
    grd.addColorStop(0, "#f4f8ff");
    grd.addColorStop(0.5, "#9aa6bd");
    grd.addColorStop(1, "#4a5470");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 16);
  });
}

function monitorFace(kind) {
  const ICON = { rings: "◎", speed: "»", magnet: "U", shield: "◈", invincible: "✦", jump: "⇑", life: "1UP" };
  const COL = { rings: "#ffd23a", speed: "#ff5a3a", magnet: "#ffd23a", shield: "#5ad8ff", invincible: "#ffffff", jump: "#7bff6a", life: "#4fa2ff" };
  return canvas(128, 128, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, "#2a3550");
    grd.addColorStop(1, "#0e1424");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = COL[kind] || "#fff";
    g.font = kind === "life" ? "900 40px Arial Black, Arial" : "900 76px Arial Black, Arial";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = COL[kind] || "#fff";
    g.shadowBlur = 16;
    g.fillText(ICON[kind] || "?", 64, 68);
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.fillRect(0, 0, 128, 40);
  });
}

export function createMaterials(world) {
  const gnd = world.ground;
  const theme = world.key;
  const T = {};
  const texs = [];
  const tx = (t) => (texs.push(t), t);
  T.side = tx(checker(gnd.side, gnd.side2));
  T.top = tx(grassTop(gnd.top, gnd.top2, theme));
  T.arrows = tx(arrows());
  T.hex = tx(hexGlow());
  T.stone = tx(stoneTex(theme === "neon" ? "#3a3f63" : theme === "final" ? "#5d4f94" : "#c9a36a", theme === "neon" ? "#22253d" : theme === "final" ? "#3c2f6b" : "#8a6a3c"));
  T.rail = tx(railTex());
  const mats = [];
  const m = (o) => {
    const x = new THREE.MeshStandardMaterial(o);
    mats.push(x);
    return x;
  };
  const neon = theme === "neon";
  const M = {
    top: m({ map: T.top, roughness: 0.85, metalness: neon ? 0.3 : 0 }),
    side: m({ map: T.side, roughness: 0.9 }),
    edge: m({ color: gnd.edge, roughness: 0.7, emissive: neon ? gnd.edge : "#000000", emissiveIntensity: neon ? 0.8 : 0 }),
    under: m({ color: shade(gnd.side2, 0.6), roughness: 1 }),
    platform: m({ map: T.top, roughness: 0.8 }),
    platSide: m({ map: T.side, roughness: 0.9 }),
    block: m({ map: T.stone, roughness: 0.85 }),
    rock: m({ color: theme === "green" ? "#8d8a86" : theme === "desert" ? "#c08850" : theme === "ocean" ? "#9fb5b8" : theme === "neon" ? "#454b72" : "#6b5aa0", roughness: 0.95, flatShading: true }),
    lift: m({ color: "#ffcf3a", roughness: 0.4, metalness: 0.4 }),
    crumble: m({ color: theme === "neon" ? "#5b6390" : "#b98a52", roughness: 0.9, map: T.stone }),
    gate: m({ color: "#ff4a6a", roughness: 0.4, emissive: "#ff2040", emissiveIntensity: 0.4 }),
    metal: m({ color: "#c9d2e6", roughness: 0.3, metalness: 0.8 }),
    darkMetal: m({ color: "#353b52", roughness: 0.45, metalness: 0.6 }),
    rail: m({ map: T.rail, color: "#ffffff", roughness: 0.2, metalness: 0.9 }),
    railPost: m({ color: neon ? "#3df5ff" : "#5a6378", roughness: 0.5, metalness: 0.5, emissive: neon ? "#1a9aa8" : "#000000", emissiveIntensity: neon ? 0.6 : 0 }),
    loop: m({ map: T.top, roughness: 0.75, side: THREE.DoubleSide }),
    loopSide: m({ color: gnd.side, roughness: 0.8, side: THREE.DoubleSide }),
    gold: m({ color: "#ffcc22", roughness: 0.18, metalness: 1, emissive: "#6a4a00", emissiveIntensity: 0.55 }),
    red: m({ color: "#e4261e", roughness: 0.35, metalness: 0.2 }),
    redStar: m({ color: "#ff2a3a", roughness: 0.2, metalness: 0.7, emissive: "#9a0010", emissiveIntensity: 0.7 }),
    white: m({ color: "#ffffff", roughness: 0.5 }),
    spike: m({ color: "#e8edf6", roughness: 0.25, metalness: 0.85 }),
    boost: m({ map: T.arrows, roughness: 0.4, emissive: "#ff8a1f", emissiveMap: T.arrows, emissiveIntensity: 0.9 }),
    spring: m({ color: "#ff3b2e", roughness: 0.35, metalness: 0.3 }),
    springY: m({ color: "#ffd23a", roughness: 0.35, metalness: 0.3 }),
    coil: m({ color: "#cfd6e4", roughness: 0.3, metalness: 0.9 }),
    trunk: m({ color: theme === "desert" ? "#9a6a3a" : "#8a5a2c", roughness: 0.9 }),
    leaf: m({ color: theme === "desert" ? "#5aa040" : theme === "ocean" ? "#2fbf6a" : "#2fae3a", roughness: 0.75, flatShading: true, side: THREE.DoubleSide }),
    flowerA: m({ color: "#ffd23a", roughness: 0.6 }),
    flowerB: m({ color: "#ff5ab4", roughness: 0.6 }),
    flowerC: m({ color: "#7a4dff", roughness: 0.6 }),
    stem: m({ color: "#2f8a2c", roughness: 0.8 }),
    sign: m({ color: "#3a68ff", roughness: 0.5 }),
    water: m({ color: theme === "neon" ? "#1a1040" : "#3bb8ff", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }),
    glass: m({ color: "#9fe8ff", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    neonA: m({ color: world.colors.a, emissive: world.colors.a, emissiveIntensity: 1.4, roughness: 0.4 }),
    neonB: m({ color: world.colors.b, emissive: world.colors.b, emissiveIntensity: 1.4, roughness: 0.4 }),
    crystal: m({ color: "#7dfff0", emissive: "#3aa8ff", emissiveIntensity: 0.7, roughness: 0.1, metalness: 0.2, flatShading: true, transparent: true, opacity: 0.9 }),
    building: m({ color: "#1d2140", roughness: 0.6, metalness: 0.3 }),
    sand: m({ color: "#e9c27a", roughness: 1 }),
    cliffGrass: m({ color: gnd.top, roughness: 0.9 }),
    checkpoint: m({ color: "#3a68ff", roughness: 0.4, metalness: 0.3 }),
    lampOff: m({ color: "#555a66", roughness: 0.3, emissive: "#000000" }),
    lampOn: m({ color: "#ff3a3a", roughness: 0.3, emissive: "#ff2020", emissiveIntensity: 1.6 }),
  };
  // additive glow materials (shift gates, speed tunnels, boost shine)
  const add = (o) => {
    const x = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, ...o });
    mats.push(x);
    return x;
  };
  M.gateGlow = add({ map: T.hex, color: "#7dfff0", opacity: 0.55 });
  M.gateRing = add({ color: "#7dfff0", opacity: 0.9 });
  M.gateRingB = add({ color: "#ff6bd6", opacity: 0.8 });
  M.speedRing = add({ color: "#ffd23a", opacity: 0.55 });
  M.glow = add({ color: "#ffffff", opacity: 0.6 });
  M.laser = add({ color: "#ff2a55", opacity: 0.85 });
  M.laserWarn = add({ color: "#ff2a55", opacity: 0.18 });
  M.reticle = add({ color: "#ffe14a", opacity: 0.95 });

  const faces = {};
  function monitorMat(kind) {
    if (!faces[kind]) {
      const t = tx(monitorFace(kind));
      faces[kind] = new THREE.MeshStandardMaterial({ map: t, emissive: "#ffffff", emissiveMap: t, emissiveIntensity: 0.45, roughness: 0.2 });
      mats.push(faces[kind]);
    }
    return faces[kind];
  }

  function dispose() {
    for (const x of mats) x.dispose();
    for (const t of texs) t.dispose();
  }
  return { M, T, monitorMat, dispose };
}
