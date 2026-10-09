/**
 * Mario Adventure 3D — procedural textures + shared materials.
 *
 * No image files: every texture is painted on a canvas once (? block, brick,
 * grass, dirt, stone, sandstone, ice, planks, castle brick, basalt …) and
 * cached. A level's renderer asks for materials through a `MaterialBank`
 * which remembers what it created, so disposing the level frees all of it.
 * World-space box UVs (boxGeo) keep textures at a constant scale on every
 * platform size.
 */
import * as THREE from "three";

/* ------------------------------------------------------------------ painters */
function canvas(n = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = n;
  return [c, c.getContext("2d")];
}
let rs = 12345;
const rnd = () => {
  rs = (rs * 16807) % 2147483647;
  return (rs - 1) / 2147483646;
};
function speckle(g, n, colors, size = 2, w = 128) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(rnd() * colors.length) | 0];
    const s = size * (0.5 + rnd());
    g.fillRect(rnd() * w, rnd() * w, s, s);
  }
}

const PAINT = {
  qblock(g) {
    g.fillStyle = "#f6b417";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#ffd65a";
    g.fillRect(6, 6, 116, 10);
    g.fillRect(6, 6, 10, 116);
    g.fillStyle = "#c97a07";
    g.fillRect(6, 112, 116, 10);
    g.fillRect(112, 6, 10, 116);
    g.strokeStyle = "#7a4300";
    g.lineWidth = 5;
    g.strokeRect(2.5, 2.5, 123, 123);
    g.fillStyle = "#7a4300";
    for (const [x, y] of [
      [18, 18],
      [110, 18],
      [18, 110],
      [110, 110],
    ]) {
      g.beginPath();
      g.arc(x, y, 4.5, 0, Math.PI * 2);
      g.fill();
    }
    g.font = "900 84px Arial Black, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#7a4300";
    g.fillText("?", 68, 72);
    g.fillStyle = "#fff6d8";
    g.fillText("?", 64, 67);
  },
  used(g) {
    g.fillStyle = "#9a6232";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#5c3415";
    g.lineWidth = 6;
    g.strokeRect(3, 3, 122, 122);
    g.fillStyle = "#5c3415";
    for (const [x, y] of [
      [18, 18],
      [110, 18],
      [18, 110],
      [110, 110],
    ]) {
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fill();
    }
  },
  brick(g) {
    g.fillStyle = "#5a2a12";
    g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 3; col++) {
        const x = col * 64 + (row % 2) * 32 + 3;
        const y = row * 32 + 3;
        g.fillStyle = "#c4602b";
        g.fillRect(x, y, 58, 26);
        g.fillStyle = "#e07d42";
        g.fillRect(x, y, 58, 5);
        g.fillStyle = "#9c4518";
        g.fillRect(x, y + 21, 58, 5);
      }
    }
  },
  grass(g) {
    g.fillStyle = "#5cc93f";
    g.fillRect(0, 0, 128, 128);
    speckle(g, 900, ["#4fb836", "#6cd64a", "#79dc55", "#48ad31"], 3);
  },
  dirt(g) {
    g.fillStyle = "#a8693a";
    g.fillRect(0, 0, 128, 128);
    speckle(g, 500, ["#94592e", "#b77845", "#8a5129", "#c08350"], 4);
    g.fillStyle = "rgba(90,50,20,0.35)";
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.ellipse(rnd() * 128, rnd() * 128, 5 + rnd() * 6, 3 + rnd() * 3, 0, 0, Math.PI * 2);
      g.fill();
    }
  },
  stone(g) {
    g.fillStyle = "#8e8a86";
    g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 2; row++) {
      for (let col = -1; col < 2; col++) {
        const x = col * 64 + (row % 2) * 32 + 2;
        const y = row * 64 + 2;
        g.fillStyle = "#a6a29c";
        g.fillRect(x, y, 60, 60);
        g.fillStyle = "#bdb9b2";
        g.fillRect(x, y, 60, 6);
        g.fillStyle = "#77736e";
        g.fillRect(x, y + 54, 60, 6);
      }
    }
    speckle(g, 260, ["#96928c", "#b3afa8", "#86827c"], 3);
  },
  sandstone(g) {
    g.fillStyle = "#c79a5a";
    g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 3; col++) {
        const x = col * 64 + (row % 2) * 32 + 2;
        const y = row * 32 + 2;
        g.fillStyle = "#e3bb7c";
        g.fillRect(x, y, 60, 28);
        g.fillStyle = "#efcd94";
        g.fillRect(x, y, 60, 4);
      }
    }
    speckle(g, 300, ["#d6a868", "#c99b5c", "#e9c58b"], 3);
    g.strokeStyle = "rgba(120,80,30,0.5)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(20, 40);
    g.lineTo(30, 52);
    g.lineTo(26, 60);
    g.stroke();
  },
  sand(g) {
    g.fillStyle = "#ecc277";
    g.fillRect(0, 0, 128, 128);
    speckle(g, 900, ["#e2b469", "#f4d08f", "#dcaa5f", "#f7dca5"], 2);
  },
  ice(g) {
    const gr = g.createLinearGradient(0, 0, 128, 128);
    gr.addColorStop(0, "#c9eeff");
    gr.addColorStop(1, "#8fd3f7");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(255,255,255,0.8)";
    g.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      const x = rnd() * 128;
      const y = rnd() * 128;
      g.moveTo(x, y);
      g.lineTo(x + 20 - rnd() * 40, y + 20 - rnd() * 40);
      g.stroke();
    }
    g.fillStyle = "rgba(255,255,255,0.5)";
    g.fillRect(8, 8, 40, 6);
  },
  snow(g) {
    g.fillStyle = "#f2f6ff";
    g.fillRect(0, 0, 128, 128);
    speckle(g, 500, ["#ffffff", "#e4ecf8", "#dde7f6"], 3);
  },
  plank(g) {
    g.fillStyle = "#6e4320";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4; i++) {
      const y = i * 32;
      g.fillStyle = i % 2 ? "#b77a40" : "#c4874b";
      g.fillRect(0, y + 2, 128, 28);
      g.fillStyle = "rgba(80,45,15,0.35)";
      for (let k = 0; k < 4; k++) g.fillRect(0, y + 8 + k * 6 + rnd() * 3, 128, 1.5);
      g.fillStyle = "#4a2b10";
      g.beginPath();
      g.arc(10, y + 16, 3, 0, Math.PI * 2);
      g.arc(118, y + 16, 3, 0, Math.PI * 2);
      g.fill();
    }
  },
  lift(g) {
    g.fillStyle = "#e86a1e";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#ff9a3c";
    g.fillRect(0, 0, 128, 18);
    g.fillStyle = "#b24a0e";
    g.fillRect(0, 110, 128, 18);
    g.fillStyle = "#fff1c9";
    for (const x of [16, 112]) {
      g.beginPath();
      g.arc(x, 64, 7, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#7a2e05";
    g.fillRect(40, 56, 48, 16);
  },
  spin(g) {
    g.fillStyle = "#3a6fe0";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#5c8cf2";
    g.fillRect(0, 0, 64, 64);
    g.fillRect(64, 64, 64, 64);
    g.fillStyle = "#ffe066";
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 12 : 26;
      g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    g.fill();
  },
  crumble(g) {
    g.fillStyle = "#c9a26b";
    g.fillRect(0, 0, 128, 128);
    speckle(g, 300, ["#b38b55", "#d8b47f"], 4);
    g.strokeStyle = "#6d4b22";
    g.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      let x = rnd() * 128;
      let y = rnd() * 128;
      g.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        x += 18 - rnd() * 36;
        y += 18 - rnd() * 36;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  },
  castle(g) {
    g.fillStyle = "#3a3236";
    g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 3; col++) {
        const x = col * 64 + (row % 2) * 32 + 2;
        const y = row * 32 + 2;
        g.fillStyle = "#6a5e62";
        g.fillRect(x, y, 60, 28);
        g.fillStyle = "#7c7074";
        g.fillRect(x, y, 60, 4);
      }
    }
    speckle(g, 200, ["#5a4f53", "#83787c"], 3);
  },
  basalt(g) {
    g.fillStyle = "#3b3032";
    g.fillRect(0, 0, 128, 128);
    speckle(g, 400, ["#4b3e40", "#2f2627", "#574a4c"], 4);
    g.strokeStyle = "#ff6a1f";
    g.lineWidth = 2;
    g.globalAlpha = 0.6;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      let x = rnd() * 128;
      let y = rnd() * 128;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += 16 - rnd() * 32;
        y += 16 - rnd() * 32;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  },
  rock(g) {
    g.fillStyle = "#8f8578";
    g.fillRect(0, 0, 128, 128);
    speckle(g, 600, ["#7e7468", "#a39888", "#6f665b", "#b2a796"], 5);
  },
  water(g) {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(0,0,0,0.13)";
    g.lineWidth = 3;
    for (let i = 0; i < 16; i++) {
      const y = rnd() * 128;
      const x = rnd() * 128;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 10, y - 5, x + 22, y);
      g.stroke();
    }
  },
  lava(g) {
    g.fillStyle = "#ff5a1f";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = rnd() > 0.5 ? "#ffb02e" : "#d3300a";
      g.beginPath();
      g.ellipse(rnd() * 128, rnd() * 128, 6 + rnd() * 14, 3 + rnd() * 6, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  },
  wood(g) {
    PAINT.plank(g);
  },
  mushcap(g) {
    g.fillStyle = "#e3262b";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#fff6e8";
    for (const [x, y, r] of [
      [22, 26, 13],
      [84, 18, 10],
      [62, 70, 16],
      [14, 96, 9],
      [108, 92, 12],
      [104, 50, 7],
    ]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  },
  stem(g) {
    g.fillStyle = "#f6e6c8";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(170,130,80,0.25)";
    g.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.moveTo(i * 16 + 4, 0);
      g.lineTo(i * 16 + 8, 128);
      g.stroke();
    }
  },
  detail(g) {
    g.fillStyle = "#f4f4f4";
    g.fillRect(0, 0, 128, 128);
    speckle(g, 1400, ["#ffffff", "#e2e2e2", "#d6d6d6", "#ececec", "#fafafa"], 3);
  },
  cloud(g) {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 128, 128);
    speckle(g, 200, ["#eef6ff", "#f7fbff"], 6);
  },
};

const texCache = new Map();
export function tex(name, repeat = true) {
  const key = name;
  let t = texCache.get(key);
  if (t) return t;
  const [c, g] = canvas(128);
  rs = 12345 + name.length * 97;
  (PAINT[name] || PAINT.stone)(g);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  texCache.set(key, t);
  return t;
}
export function disposeTextures() {
  for (const t of texCache.values()) t.dispose();
  texCache.clear();
}

/* ------------------------------------------------------------------ geometry helpers */
/** BoxGeometry with world-space UVs (1 texture tile per `tile` units) */
export function boxGeo(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
    }
  }
  uv.needsUpdate = true;
  return g;
}

/** a cylinder whose side UV wraps by circumference */
export function cylGeo(r, h, seg = 28, tile = 2) {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1);
  const uv = g.attributes.uv;
  const circ = Math.PI * 2 * r;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / tile, (uv.getY(i) * h) / tile);
  uv.needsUpdate = true;
  return g;
}

/* ------------------------------------------------------------------ material bank */
export function createBank() {
  const mats = new Map();
  const extra = [];
  const bank = {
    std(key, o) {
      let m = mats.get(key);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...o });
        mats.set(key, m);
      }
      return m;
    },
    tex(name, o = {}) {
      return bank.std(`tex:${name}:${o.color || ""}:${o.emissive || ""}`, { map: tex(name), ...o });
    },
    color(c, o = {}) {
      return bank.std(`c:${c}:${JSON.stringify(o)}`, { color: c, ...o });
    },
    own(m) {
      extra.push(m);
      return m;
    },
    dispose() {
      for (const m of mats.values()) m.dispose();
      for (const m of extra) m.dispose();
      mats.clear();
      extra.length = 0;
    },
  };
  return bank;
}

/** materials [side,side,top,bottom,side,side] for a platform style in a world */
export function styleMats(bank, style, world) {
  const t = world.key;
  const side = (n, o) => bank.tex(n, o);
  switch (style) {
    case "grass":
    case "grassBlock":
      if (t === "snow") return six(side("dirt", { color: "#c9d8ea" }), side("snow"));
      if (t === "desert") return six(side("sandstone"), side("sand"));
      if (t === "ocean") return six(side("dirt", { color: "#f0dcb0" }), side("grass"));
      if (t === "lava") return six(side("basalt"), side("rock", { color: "#7a6a6a" }));
      return six(side("dirt"), side("grass"));
    case "brickBlock":
      return six(side("brick"), side("brick"));
    case "stone":
    case "pillar":
    case "wall":
      if (t === "desert") return six(side("sandstone"), side("sandstone"));
      if (t === "snow") return six(side("stone", { color: "#cfe0f2" }), side("snow"));
      if (t === "lava") return six(side("castle"), side("castle"));
      if (t === "ocean") return six(side("rock", { color: "#c7c2b8" }), side("rock", { color: "#d8d2c6" }));
      return six(side("stone"), side("stone"));
    case "sandstone":
      return six(side("sandstone"), side("sandstone"));
    case "lift":
      return six(side("lift"), side("lift"));
    case "disc":
    case "bar":
      return six(side("spin"), side("spin"));
    case "crumble":
      return six(side("crumble"), side("crumble"));
    case "ice":
      return six(bank.tex("ice", { transparent: true, opacity: 0.88, roughness: 0.15, metalness: 0.05 }), bank.tex("ice", { roughness: 0.12 }));
    case "snow":
      return six(side("dirt", { color: "#c9d8ea" }), side("snow"));
    case "wood":
    case "plank":
    case "log":
      return six(side("plank"), side("plank"));
    case "castle":
      return six(side("castle"), side("castle"));
    case "basalt":
      return six(side("basalt"), side("basalt"));
    case "cloud":
      return six(side("cloud", { roughness: 1, emissive: "#9ab", emissiveIntensity: 0.25 }), side("cloud", { roughness: 1, emissive: "#9ab", emissiveIntensity: 0.25 }));
    case "mushcap":
      return six(side("mushcap", { roughness: 0.5 }), side("mushcap", { roughness: 0.5 }));
    case "stem":
      return six(side("stem"), side("stem"));
    case "blink": {
      const m = bank.std(`blink:${t}`, { color: "#5ee7ff", emissive: "#1aa6c9", emissiveIntensity: 0.6, transparent: true, opacity: 0.8, roughness: 0.3 });
      return six(m, m);
    }
    default:
      return six(side("stone"), side("stone"));
  }
}
function six(side, top) {
  return [side, side, top, side, side, side];
}
