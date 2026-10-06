/**
 * Rooftop Dash — shared materials, shaders and procedural textures.
 *
 * Buildings (route AND background) are instanced unit boxes drawn with ONE
 * MeshStandardMaterial patched in onBeforeCompile: the facade pattern
 * (windows, mullions, floor slabs, lit windows at night) and the roof
 * (tar + painted safety edge on walkable roofs) are computed from world
 * position, so any box size looks right with no textures and no UVs.
 *
 * Per-instance attribute aStyle = (style, seed, litFraction, walkable):
 *   style 0 plain · 1 apartment · 2 office bands · 3 brick · 4 glass tower ·
 *         5 low/service · 6 construction frame
 */
import * as THREE from "three";

const cache = new Map();
export function disposeMaterialCache() {
  for (const v of cache.values()) {
    if (v && v.dispose) v.dispose();
  }
  cache.clear();
}
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

/* ------------------------------------------------------------------ building shader */
let buildingSeq = 0;
export function buildingMaterial(theme) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.04 });
  const uniforms = {
    uGlass: { value: new THREE.Color(theme.glass) },
    uGlow: { value: new THREE.Color(theme.windowGlow) },
    uTrim: { value: new THREE.Color(theme.trim) },
    uRoofA: { value: new THREE.Color(theme.roof[0]) },
    uRoofB: { value: new THREE.Color(theme.roof[1] || theme.roof[0]) },
    uSkyTint: { value: new THREE.Color(theme.sky.horizon) },
    uNight: { value: theme.night || 0 },
    uWet: { value: theme.wet ? 1 : 0 },
    uStreet: { value: -30 },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec4 aStyle;
varying vec4 vStyle;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec4 vEdge;
varying vec3 vHalf;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  mat4 rdIM = instanceMatrix;
#else
  mat4 rdIM = mat4(1.0);
#endif
  vec4 rdW = modelMatrix * rdIM * vec4(position, 1.0);
  vWPos = rdW.xyz;
  vWNrm = normalize(mat3(modelMatrix * rdIM) * normal);
  vec3 rdS = vec3(length(rdIM[0].xyz), length(rdIM[1].xyz), length(rdIM[2].xyz));
  // local position (scaled to metres) — edge distances are taken per FRAGMENT
  vEdge = vec4(position.x * rdS.x, position.z * rdS.z, (0.5 - position.y) * rdS.y, 0.0);
  vHalf = rdS * 0.5;
  vStyle = aStyle;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 uGlass; uniform vec3 uGlow; uniform vec3 uTrim; uniform vec3 uRoofA; uniform vec3 uRoofB; uniform vec3 uSkyTint;
uniform float uNight; uniform float uWet; uniform float uStreet;
varying vec4 vStyle; varying vec3 vWPos; varying vec3 vWNrm; varying vec4 vEdge; varying vec3 vHalf;
float rdHash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float rdNoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(rdHash(i),rdHash(i+vec2(1,0)),f.x), mix(rdHash(i+vec2(0,1)),rdHash(i+vec2(1,1)),f.x), f.y); }
float rdBox(vec2 p, vec2 lo, vec2 hi){ vec2 a = step(lo, p) * step(p, hi); return a.x*a.y; }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  vec3 rdN = normalize(vWNrm);
  float rdStyle = floor(vStyle.x + 0.5);
  float rdSeed = vStyle.y;
  float rdLitFrac = vStyle.z;
  float rdWalk = vStyle.w;
  float rdTop = step(0.6, rdN.y);
  float rdBottom = step(0.6, -rdN.y);
  float rdLit = 0.0;
  vec3 rdCol = diffuseColor.rgb;
  float rdRough = 0.86;
  if (rdTop > 0.5) {
    // ---- roof: tar / concrete with grain, tiles, painted safety edge on walkable roofs
    vec2 q = vWPos.xz;
    float n = rdNoise(q * 1.7) * 0.5 + rdNoise(q * 6.3) * 0.25 + rdNoise(q * 0.35) * 0.35;
    vec3 roof = mix(uRoofA, uRoofB, n);
    float tiles = (1.0 - smoothstep(0.0, 0.045, min(abs(fract(q.x / 2.0) - 0.5), abs(fract(q.y / 2.0) - 0.5)) - 0.455)) * 0.0;
    vec2 g = abs(fract(q / 2.4) - 0.5);
    float seam = 1.0 - smoothstep(0.47, 0.5, max(g.x, g.y));
    roof *= mix(0.93, 1.0, seam);
    float edgeD = min(vHalf.x - abs(vEdge.x), vHalf.z - abs(vEdge.y));
    if (rdWalk > 0.5) {
      float trim = 1.0 - smoothstep(0.22, 0.26, edgeD);
      float stripe = (1.0 - smoothstep(0.36, 0.4, edgeD)) * smoothstep(0.30, 0.34, edgeD);
      roof = mix(roof, uTrim, trim * 0.92);
      roof = mix(roof, uTrim * 0.85, stripe * 0.5);
    } else {
      roof *= 0.86;
      roof = mix(roof, uTrim * 0.7, (1.0 - smoothstep(0.15, 0.2, edgeD)) * 0.4);
    }
    rdCol = roof * (0.92 + tiles);
    rdRough = mix(0.92, 0.32, uWet);
  } else if (rdBottom > 0.5) {
    rdCol *= 0.45;
  } else {
    // ---- facade
    float fu = abs(rdN.x) > 0.5 ? vWPos.z : vWPos.x;
    float fv = vWPos.y;
    float floorH = rdStyle == 2.0 || rdStyle == 4.0 ? 3.6 : 3.2;
    float cellW = rdStyle == 1.0 ? 1.8 : rdStyle == 3.0 ? 1.5 : rdStyle == 5.0 ? 2.6 : rdStyle == 6.0 ? 3.6 : 2.1;
    vec2 cell = vec2(floor((fu + rdSeed * 17.0) / cellW), floor((fv - uStreet) / floorH));
    vec2 f = vec2(fract((fu + rdSeed * 17.0) / cellW), fract((fv - uStreet) / floorH));
    float win = 0.0;
    float frame = 0.0;
    if (rdStyle == 1.0) { // apartment: punched windows with sills
      win = rdBox(f, vec2(0.24, 0.30), vec2(0.76, 0.80));
      frame = rdBox(f, vec2(0.20, 0.25), vec2(0.80, 0.84)) - win;
    } else if (rdStyle == 2.0) { // office: continuous glass bands with mullions
      win = rdBox(f, vec2(-0.1, 0.34), vec2(1.1, 0.94)) * (1.0 - rdBox(vec2(fract(f.x * 2.0), f.y), vec2(0.0, 0.0), vec2(0.05, 1.0)));
    } else if (rdStyle == 3.0) { // brick: small tall windows
      win = rdBox(f, vec2(0.32, 0.28), vec2(0.68, 0.82));
      frame = rdBox(f, vec2(0.28, 0.22), vec2(0.72, 0.86)) - win;
      float course = step(0.82, fract(fv / 0.22)) * 0.12 + step(0.92, fract((fu + floor(fv / 0.22) * 0.12) / 0.5)) * 0.1;
      rdCol *= 1.0 - course;
    } else if (rdStyle == 4.0) { // glass tower: full grid
      win = 1.0 - max(rdBox(vec2(fract(f.x * 2.0), f.y), vec2(0.0, 0.0), vec2(0.035, 1.0)), rdBox(f, vec2(0.0, 0.0), vec2(1.0, 0.06)));
    } else if (rdStyle == 5.0) { // low service building: a few small windows, panels
      win = rdBox(f, vec2(0.35, 0.45), vec2(0.65, 0.75)) * step(0.45, rdHash(cell + rdSeed));
    } else if (rdStyle == 6.0) { // construction: open floors with columns
      float col = rdBox(vec2(fract(f.x), f.y), vec2(0.0, 0.0), vec2(0.12, 1.0));
      float slab = rdBox(f, vec2(0.0, 0.0), vec2(1.0, 0.16));
      win = (1.0 - max(col, slab));
      frame = 0.0;
    }
    // far away the window grid is smaller than a pixel: fade to its average (no moiré)
    float rdAA = smoothstep(0.05, 0.22, max(fwidth(fu), fwidth(fv)) / cellW);
    win = mix(win, rdStyle == 4.0 ? 0.85 : 0.4, rdAA);
    frame *= 1.0 - rdAA;
    // slab line every floor + street-level darkening + top cornice
    float slabLine = rdBox(f, vec2(-1.0, 0.0), vec2(2.0, 0.05)) * (rdStyle == 4.0 ? 0.0 : 1.0) * (1.0 - rdAA);
    rdCol *= 1.0 - slabLine * 0.18;
    rdCol = mix(rdCol, uTrim * 0.9, frame * 0.55);
    float rnd = rdHash(cell + rdSeed * 3.1);
    vec3 glass = uGlass * (0.75 + 0.5 * rnd);
    // sky reflection gradient on glass
    glass = mix(glass, uSkyTint, clamp((fv - uStreet) / 160.0, 0.0, 0.45) * (rdStyle == 4.0 || rdStyle == 2.0 ? 0.55 : 0.25));
    if (rdStyle == 6.0) glass = vec3(0.10, 0.10, 0.11);
    rdCol = mix(rdCol, glass, win);
    // lit interiors: per window up close, averaged (no sparkle) far away
    float litHere = mix(win * step(rnd, rdLitFrac), win * rdLitFrac, rdAA);
    float tint = rdHash(cell * 2.3 + 1.0);
    vec3 interior = uGlow * mix(0.16, 0.42, tint) * mix(vec3(1.0), vec3(0.85, 0.95, 1.15), step(0.7, tint));
    rdCol = mix(rdCol, interior, litHere * (0.3 + uNight * 0.3));
    rdLit = litHere * (0.45 + 0.55 * rdHash(cell * 1.7 + 4.0));
    rdRough = mix(0.88, 0.18, win);
    // cornice at the roof line
    float cornice = 1.0 - smoothstep(0.32, 0.38, vEdge.z);
    rdCol = mix(rdCol, uTrim * 0.95, cornice * (rdWalk > 0.5 ? 0.85 : 0.5));
    float h = clamp((fv - uStreet) / 28.0, 0.0, 1.0);
    rdCol *= mix(0.55, 1.0, h);
  }
  diffuseColor.rgb = rdCol;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
  roughnessFactor = rdRough;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
  totalEmissiveRadiance += uGlow * rdLit * (0.02 + uNight * 0.5);`,
      );
  };
  // unique per material: three.js only calls onBeforeCompile (which attaches
  // these uniforms) when it compiles a NEW program, so two materials sharing a
  // key would leave the second one with stale uniforms
  const key = `rd-building-${++buildingSeq}`;
  m.customProgramCacheKey = () => key;
  return m;
}

/* ------------------------------------------------------------------ sky dome */
export function skyMaterial(theme) {
  const s = theme.sky;
  const sun = new THREE.Vector3(...theme.sun.dir).normalize();
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(s.top) },
      uMid: { value: new THREE.Color(s.mid) },
      uHor: { value: new THREE.Color(s.horizon) },
      uGlow: { value: new THREE.Color(s.glow) },
      uGround: { value: new THREE.Color(s.ground) },
      uSun: { value: sun },
      uDisc: { value: new THREE.Color(theme.sun.disc) },
      uSize: { value: theme.sun.size },
      uNight: { value: theme.night || 0 },
      uTime: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uGlow; uniform vec3 uGround; uniform vec3 uSun; uniform vec3 uDisc; uniform float uSize; uniform float uNight; uniform float uTime;
varying vec3 vDir;
float h21(vec2 p){ p=fract(p*vec2(233.34,851.73)); p+=dot(p,p+23.45); return fract(p.x*p.y); }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHor, uMid, smoothstep(0.02, 0.28, h));
  col = mix(col, uTop, smoothstep(0.25, 0.85, h));
  col = mix(col, uGround, smoothstep(0.0, -0.18, h));
  float sd = max(dot(d, uSun), 0.0);
  col += uGlow * (pow(sd, 6.0) * 0.45 + pow(sd, 48.0) * 0.5) * (1.0 - smoothstep(0.35, 0.9, h));
  float disc = smoothstep(cos(uSize), cos(uSize * 0.82), sd);
  col = mix(col, uDisc, disc);
  // stars at night
  if (uNight > 0.5 && h > 0.05) {
    vec2 g = floor(vec2(atan(d.z, d.x) * 180.0, h * 260.0));
    float s = step(0.9965, h21(g)) * smoothstep(0.05, 0.4, h);
    col += vec3(s) * (0.6 + 0.4 * sin(uTime * 2.0 + h21(g + 3.0) * 30.0));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
}

/* ------------------------------------------------------------------ canvas textures */
function canvasTex(w, h, draw, key, repeat = false) {
  return cached(key, () => {
    const c = typeof document !== "undefined" ? document.createElement("canvas") : null;
    if (!c) return null;
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** soft round glow sprite */
export function glowTexture() {
  return canvasTex(
    128,
    128,
    (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, "rgba(255,255,255,1)");
      r.addColorStop(0.25, "rgba(255,255,255,0.55)");
      r.addColorStop(0.6, "rgba(255,255,255,0.12)");
      r.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, w, w);
    },
    "glow",
  );
}

/** puffy cloud sprite */
export function cloudTexture() {
  return canvasTex(
    256,
    128,
    (g, w, h) => {
      const blobs = [
        [0.3, 0.62, 0.22],
        [0.48, 0.48, 0.3],
        [0.66, 0.58, 0.24],
        [0.2, 0.7, 0.16],
        [0.82, 0.7, 0.15],
        [0.55, 0.7, 0.26],
      ];
      for (const [x, y, r] of blobs) {
        const gr = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
        gr.addColorStop(0, "rgba(255,255,255,0.95)");
        gr.addColorStop(0.55, "rgba(255,255,255,0.6)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }
    },
    "cloud",
  );
}

/** painted wall-run mural (bold shapes + chevrons that read "run along me") */
export function muralTexture(theme, variant = 0) {
  return canvasTex(
    512,
    256,
    (g, w, h) => {
      const base = variant === 1 ? "#2c6e7f" : "#3a3f6b";
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      // brick hint
      g.globalAlpha = 0.12;
      g.fillStyle = "#000";
      for (let y = 0; y < h; y += 16) {
        g.fillRect(0, y, w, 2);
        for (let x = (y / 16) % 2 ? 0 : 24; x < w; x += 48) g.fillRect(x, y, 2, 16);
      }
      g.globalAlpha = 1;
      const cols = variant === 1 ? ["#ffd166", "#ef476f", "#06d6a0", "#f8f4e3"] : [theme.accent, "#ffd166", "#4fc3ff", "#f8f4e3"];
      // big sweeping band
      g.fillStyle = cols[0];
      g.beginPath();
      g.moveTo(0, h * 0.62);
      g.bezierCurveTo(w * 0.3, h * 0.35, w * 0.6, h * 0.85, w, h * 0.45);
      g.lineTo(w, h * 0.66);
      g.bezierCurveTo(w * 0.62, h * 1.02, w * 0.3, h * 0.55, 0, h * 0.85);
      g.closePath();
      g.fill();
      // circles
      g.fillStyle = cols[2];
      g.beginPath();
      g.arc(w * 0.18, h * 0.32, h * 0.18, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = cols[1];
      g.beginPath();
      g.arc(w * 0.78, h * 0.28, h * 0.13, 0, Math.PI * 2);
      g.fill();
      // chevrons (direction cue)
      g.fillStyle = cols[3];
      for (let i = 0; i < 4; i++) {
        const x = w * 0.36 + i * 34;
        g.beginPath();
        g.moveTo(x, h * 0.2);
        g.lineTo(x + 22, h * 0.32);
        g.lineTo(x, h * 0.44);
        g.lineTo(x + 10, h * 0.32);
        g.closePath();
        g.fill();
      }
      // top & bottom stripes
      g.fillStyle = cols[3];
      g.globalAlpha = 0.85;
      g.fillRect(0, 6, w, 6);
      g.fillRect(0, h - 12, w, 6);
      g.globalAlpha = 1;
    },
    `mural-${variant}-${theme.key}`,
    true,
  );
}

const BILLBOARD_COPY = [
  ["SUNPEAK", "fizzy citrus", "#ff7a3d", "#ffd166"],
  ["METRO JAM", "live radio 98.4", "#7b5cff", "#4fe0ff"],
  ["ZIPPA", "shoes that fly", "#ef476f", "#ffffff"],
  ["SKYBITE", "noodles all night", "#06d6a0", "#073b4c"],
  ["NOVELLO", "city bikes", "#118ab2", "#ffd166"],
];
export function billboardTexture(i = 0) {
  const [title, sub, a, b] = BILLBOARD_COPY[i % BILLBOARD_COPY.length];
  return canvasTex(
    512,
    256,
    (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, a);
      gr.addColorStop(1, b);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(255,255,255,0.18)";
      g.beginPath();
      g.arc(w * 0.82, h * 0.4, h * 0.42, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ffffff";
      g.font = "900 78px Arial Black, Arial, sans-serif";
      g.textBaseline = "middle";
      g.fillText(title, 28, h * 0.42);
      g.font = "600 30px Arial, sans-serif";
      g.globalAlpha = 0.9;
      g.fillText(sub.toUpperCase(), 32, h * 0.72);
      g.globalAlpha = 1;
    },
    `billboard-${i}`,
  );
}

/** yellow/black hazard stripes */
export function stripeTexture() {
  return canvasTex(
    128,
    32,
    (g, w, h) => {
      g.fillStyle = "#f4c430";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#1d1d1f";
      for (let x = -h; x < w + h; x += 32) {
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x + 16, h);
        g.lineTo(x + 16 + h, 0);
        g.lineTo(x + h, 0);
        g.closePath();
        g.fill();
      }
    },
    "stripes",
    true,
  );
}

/** neon sign art for Neon City */
export function neonTexture(i, color) {
  const words = ["OPEN", "RAMEN", "ARCADE", "HOTEL", "24/7", "KARAOKE"];
  return canvasTex(
    256,
    96,
    (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = "rgba(10,8,20,0.85)";
      g.fillRect(0, 0, w, h);
      g.shadowColor = color;
      g.shadowBlur = 16;
      g.strokeStyle = color;
      g.lineWidth = 4;
      g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = "#ffffff";
      g.font = "800 48px Arial, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(words[i % words.length], w / 2, h / 2 + 2);
    },
    `neon-${i}-${color}`,
  );
}

/** shared simple materials (cached per key) */
export function stdMat(key, params) {
  return cached(`std-${key}`, () => new THREE.MeshStandardMaterial(params));
}
