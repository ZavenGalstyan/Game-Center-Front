/**
 * Procedural textures (canvas) — no external image files beyond the
 * character pack. Generated once per page and cached.
 *
 *  signAtlas()   neon sign artwork (8×8 slots of 256×128) + slot metadata
 *  glowTex()     soft radial falloff (halos, light pools, sprites)
 *  softTex()     puffy particle (steam)
 *  tileTex(kind) seamless surface textures: crate, container, hazard, panel,
 *                concrete, tiles, grate, server, ceilingLights …
 */
import * as THREE from "three";

const cache = {};
const canvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
const rnd = (() => {
  let s = 1234567;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();

export const SIGN_WORDS = {
  market: ["RAMEN", "NOODLES", "KARAOKE", "BAR 24H", "CHROME", "PACHINKO", "HOTEL", "LOTUS", "CLINIC", "GUNS", "TATTOO", "OPEN", "DUMPLING", "NEON", "ARCADE", "SUSHI", "CYBER", "LIQUOR", "SOBA", "CAFE", "VIDEO", "LOVE", "TEA", "DRAGON"],
  industrial: ["KESSLER", "DANGER", "FOUNDRY", "HIGH VOLT", "DOCK 7", "NO ENTRY", "LOADING", "CAUTION", "SECTOR 2", "RAIL", "WELD", "EXIT", "STEEL", "SHIFT B", "REACTOR", "OZZY'S"],
  corporate: ["HALCYON", "CONCORD", "AXIOM", "SYNAPSE", "NOVA BANK", "ORBITAL", "HELIX", "VERITY", "ZENITH", "LUMEN", "PRIME", "SECURE", "KAIROS", "APEX", "CHOIR", "VANTA"],
};

/** 2048×1024 atlas, 8 cols × 8 rows of 256×128 neon signs. Returns {tex, slots:[{u0,v0,u1,v1,color,vertical}]} */
export function signAtlas(district, palette) {
  const key = `signs:${district}`;
  if (cache[key]) return cache[key];
  const W = 2048;
  const H = 1024;
  const c = canvas(W, H);
  const g = c.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  const words = SIGN_WORDS[district] || SIGN_WORDS.market;
  const slots = [];
  const fonts = ["900 64px Impact, 'Arial Black', sans-serif", "700 60px 'Courier New', monospace", "800 62px 'Trebuchet MS', sans-serif", "italic 900 60px Georgia, serif", "700 58px Verdana, sans-serif"];
  for (let i = 0; i < 64; i++) {
    const col = i % 8;
    const row = Math.floor(i / 8);
    const x = col * 256;
    const y = row * 128;
    const color = palette[i % palette.length];
    const word = words[(i * 7) % words.length];
    const vertical = i % 4 === 3;
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.rect(0, 0, 256, 128);
    g.clip();
    // frame / tube outline
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.strokeStyle = color;
    g.lineWidth = 5;
    const style = i % 5;
    if (style === 0) {
      g.strokeRect(10, 12, 236, 104);
    } else if (style === 1) {
      g.beginPath();
      g.roundRect?.(12, 14, 232, 100, 40);
      g.stroke();
    } else if (style === 2) {
      g.beginPath();
      g.moveTo(14, 112);
      g.lineTo(242, 112);
      g.stroke();
    }
    g.fillStyle = "#fff";
    g.shadowBlur = 24;
    if (vertical) {
      // stacked letters for blade signs (rendered rotated on a tall quad)
      g.translate(128, 64);
      g.rotate(-Math.PI / 2);
      g.font = "900 46px Impact, 'Arial Black', sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = color;
      g.fillText(word, 0, 0, 120);
      g.fillStyle = "#ffffff";
      g.globalAlpha = 0.65;
      g.fillText(word, 0, 0, 120);
    } else {
      g.font = fonts[i % fonts.length];
      g.textAlign = "center";
      g.textBaseline = "middle";
      let size = 64;
      g.font = g.font.replace(/\d+px/, `${size}px`);
      while (g.measureText(word).width > 220 && size > 24) {
        size -= 4;
        g.font = g.font.replace(/\d+px/, `${size}px`);
      }
      g.fillStyle = color;
      g.fillText(word, 128, 66);
      g.globalAlpha = 0.7;
      g.fillStyle = "#fff";
      g.fillText(word, 128, 66);
      g.globalAlpha = 1;
      if (style === 3) {
        // little glyph row
        g.font = "700 18px monospace";
        g.fillStyle = color;
        g.fillText("◆ 24H ◆ OPEN ◆", 128, 108);
      }
    }
    g.restore();
    slots.push({ u0: x / W, v0: 1 - (y + 128) / H, u1: (x + 256) / W, v1: 1 - y / H, color, vertical });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  cache[key] = { tex, slots };
  return cache[key];
}

export function glowTex() {
  if (cache.glow) return cache.glow;
  const c = canvas(128, 128);
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.25, "rgba(255,255,255,0.55)");
  gr.addColorStop(0.6, "rgba(255,255,255,0.12)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  cache.glow = new THREE.CanvasTexture(c);
  return cache.glow;
}

/** Vertical streak for wet-street sign reflections (bright near the sign end). */
export function streakTex() {
  if (cache.streak) return cache.streak;
  const c = canvas(64, 256);
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "rgba(255,255,255,0.9)");
  gr.addColorStop(0.35, "rgba(255,255,255,0.35)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 256);
  // horizontal fade
  const img = g.getImageData(0, 0, 64, 256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 64; x++) {
      const k = 1 - Math.abs(x - 31.5) / 32;
      const n = 0.75 + 0.25 * Math.sin(y * 0.9 + x * 0.3);
      img.data[(y * 64 + x) * 4 + 3] *= Math.pow(k, 1.6) * n;
    }
  g.putImageData(img, 0, 0);
  cache.streak = new THREE.CanvasTexture(c);
  return cache.streak;
}

export function softTex() {
  if (cache.soft) return cache.soft;
  const c = canvas(128, 128);
  const g = c.getContext("2d");
  for (let i = 0; i < 9; i++) {
    const x = 40 + rnd() * 48;
    const y = 40 + rnd() * 48;
    const r = 26 + rnd() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,255,255,0.35)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  cache.soft = new THREE.CanvasTexture(c);
  return cache.soft;
}

/* ------------------------------------------------------------ tiling surfaces */
function noiseFill(g, w, h, base, amp, n = 2200, size = 2) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = Math.floor(rnd() * amp);
    g.fillStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "255,255,255"},${v / 255})`;
    g.fillRect(rnd() * w, rnd() * h, size, size);
  }
}
export function tileTex(kind) {
  if (cache[kind]) return cache[kind];
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext("2d");
  switch (kind) {
    case "crate": {
      noiseFill(g, S, S, "#5b4a36", 30);
      g.strokeStyle = "rgba(20,14,8,0.9)";
      g.lineWidth = 10;
      g.strokeRect(5, 5, S - 10, S - 10);
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(10, 10);
      g.lineTo(S - 10, S - 10);
      g.stroke();
      for (let y = 40; y < S; y += 48) {
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(10, y, S - 20, 3);
      }
      g.fillStyle = "rgba(255,190,60,0.85)";
      g.font = "700 26px monospace";
      g.fillText("H.D.", 150, 230);
      break;
    }
    case "container": {
      g.fillStyle = "#808080";
      g.fillRect(0, 0, S, S);
      for (let x = 0; x < S; x += 16) {
        const gr = g.createLinearGradient(x, 0, x + 16, 0);
        gr.addColorStop(0, "rgba(255,255,255,0.18)");
        gr.addColorStop(0.5, "rgba(0,0,0,0.25)");
        gr.addColorStop(1, "rgba(255,255,255,0.18)");
        g.fillStyle = gr;
        g.fillRect(x, 0, 16, S);
      }
      for (let i = 0; i < 300; i++) {
        g.fillStyle = `rgba(90,40,10,${rnd() * 0.25})`;
        g.fillRect(rnd() * S, rnd() * S, 3 + rnd() * 6, 2 + rnd() * 18);
      }
      break;
    }
    case "hazard": {
      g.fillStyle = "#cfcfcf";
      g.fillRect(0, 0, S, S);
      g.fillStyle = "#e8b020";
      for (let i = -S; i < S * 2; i += 64) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + 32, 0);
        g.lineTo(i + 32 - S, S);
        g.lineTo(i - S, S);
        g.fill();
      }
      g.globalAlpha = 0.25;
      noiseFill(g, S, S, "rgba(0,0,0,0)", 60, 1500);
      g.globalAlpha = 1;
      break;
    }
    case "concrete": {
      noiseFill(g, S, S, "#5c5d62", 26, 5000);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.08})`;
        g.fillRect(rnd() * S, 0, 2 + rnd() * 10, S);
      }
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(0, S - 3, S, 3);
      g.fillRect(S - 3, 0, 3, S);
      break;
    }
    case "panel": {
      noiseFill(g, S, S, "#3a3d44", 16, 2500);
      g.strokeStyle = "rgba(0,0,0,0.55)";
      g.lineWidth = 3;
      g.strokeRect(2, 2, S - 4, S / 2 - 4);
      g.strokeRect(2, S / 2 + 2, S - 4, S / 2 - 4);
      for (const [x, y] of [[12, 12], [S - 12, 12], [12, S / 2 + 12], [S - 12, S / 2 + 12]]) {
        g.fillStyle = "rgba(255,255,255,0.25)";
        g.beginPath();
        g.arc(x, y, 3, 0, 7);
        g.fill();
      }
      break;
    }
    case "whitePanel": {
      noiseFill(g, S, S, "#c9cdd4", 10, 1500);
      g.strokeStyle = "rgba(60,70,90,0.35)";
      g.lineWidth = 2;
      g.strokeRect(1, 1, S - 2, S - 2);
      g.fillStyle = "rgba(80,140,255,0.25)";
      g.fillRect(0, S * 0.62, S, 4);
      break;
    }
    case "rust": {
      noiseFill(g, S, S, "#4a4038", 30, 4000);
      for (let x = 0; x < S; x += 22) {
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(x, 0, 4, S);
        g.fillStyle = "rgba(255,255,255,0.06)";
        g.fillRect(x + 5, 0, 3, S);
      }
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `rgba(120,50,10,${rnd() * 0.3})`;
        g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 5, 6 + rnd() * 30);
      }
      break;
    }
    case "tiles": {
      noiseFill(g, S, S, "#2c2d33", 14, 2000);
      g.strokeStyle = "rgba(0,0,0,0.6)";
      g.lineWidth = 3;
      for (let i = 0; i <= S; i += 64) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, S);
        g.moveTo(0, i);
        g.lineTo(S, i);
        g.stroke();
      }
      break;
    }
    case "marble": {
      noiseFill(g, S, S, "#d8dbe0", 8, 1200);
      g.strokeStyle = "rgba(120,130,150,0.25)";
      for (let i = 0; i < 10; i++) {
        g.lineWidth = 1 + rnd() * 2;
        g.beginPath();
        g.moveTo(rnd() * S, 0);
        g.bezierCurveTo(rnd() * S, S * 0.3, rnd() * S, S * 0.6, rnd() * S, S);
        g.stroke();
      }
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.strokeRect(0, 0, S, S);
      break;
    }
    case "grate": {
      g.fillStyle = "#1e2024";
      g.fillRect(0, 0, S, S);
      g.fillStyle = "#3a3e46";
      for (let i = 0; i < S; i += 16) {
        g.fillRect(i, 0, 5, S);
        g.fillRect(0, i, S, 5);
      }
      break;
    }
    case "server": {
      g.fillStyle = "#0d1016";
      g.fillRect(0, 0, S, S);
      for (let y = 6; y < S; y += 20) {
        g.fillStyle = "#1c2230";
        g.fillRect(8, y, S - 16, 14);
        for (let x = 16; x < S - 16; x += 10) {
          const on = rnd() < 0.5;
          g.fillStyle = on ? (rnd() < 0.7 ? "#19f0ff" : "#4dff9a") : "#223";
          g.fillRect(x, y + 5, 4, 4);
        }
      }
      break;
    }
    case "ceilingLights": {
      g.fillStyle = "#000";
      g.fillRect(0, 0, S, S);
      g.fillStyle = "#fff";
      g.fillRect(S * 0.42, 0, S * 0.16, S);
      break;
    }
    case "screen": {
      g.fillStyle = "#03121a";
      g.fillRect(0, 0, S, S);
      g.font = "700 18px monospace";
      for (let y = 18; y < S; y += 20) {
        g.fillStyle = rnd() < 0.2 ? "#ff2bd6" : "#19f0ff";
        let s = "";
        for (let k = 0; k < 18; k++) s += "0123456789ABCDEF<>/#"[Math.floor(rnd() * 20)];
        g.fillText(s, 8, y);
      }
      break;
    }
    case "graffiti": {
      g.fillStyle = "rgba(0,0,0,0)";
      g.clearRect(0, 0, S, S);
      g.font = "italic 900 70px Impact, sans-serif";
      g.fillStyle = "#ff3b5c";
      g.strokeStyle = "#111";
      g.lineWidth = 6;
      g.save();
      g.translate(20, 150);
      g.rotate(-0.12);
      g.strokeText("FANGS", 0, 0);
      g.fillText("FANGS", 0, 0);
      g.restore();
      break;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = kind === "ceilingLights" ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache[kind] = t;
  return t;
}
