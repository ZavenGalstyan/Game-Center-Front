/**
 * (Adapted from Crown of Ashes.) Effects: pooled CPU-simulated particles drawn as two THREE.Points
 * batches (additive: fire, sparks, magic, embers · alpha: smoke, dust,
 * snow-puffs) using one 2×2 sprite atlas, plus
 *
 *   • persistent emitters (campfires, braziers, forges, chimneys, torches)
 *     that only run near the camera,
 *   • a flickering pool of real point lights assigned to the nearest fires,
 *   • weather (snow / rain / ash) wrapped around the camera,
 *   • ground telegraphs — terrain-conforming circles / cones / lines that
 *     fill up before an attack lands (the dodge cue).
 */
import * as THREE from "three";

const TILE = { glow: 0, flame: 1, spark: 2, smoke: 3 };

function atlasTexture() {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S * 2;
  const g = c.getContext("2d");
  // glow
  let gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.3, "rgba(255,255,255,0.55)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  // flame
  g.save();
  g.translate(S, 0);
  gr = g.createRadialGradient(S / 2, S * 0.7, 2, S / 2, S * 0.55, S * 0.5);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.4, "rgba(255,255,255,0.7)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(S / 2, 4);
  g.bezierCurveTo(S * 0.9, S * 0.45, S * 0.85, S * 0.85, S / 2, S - 4);
  g.bezierCurveTo(S * 0.15, S * 0.85, S * 0.1, S * 0.45, S / 2, 4);
  g.fill();
  g.restore();
  // spark (streak)
  g.save();
  g.translate(0, S);
  gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.22);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  g.restore();
  // smoke puff (noisy)
  g.save();
  g.translate(S, S);
  for (let k = 0; k < 26; k++) {
    const x = S / 2 + (Math.random() - 0.5) * S * 0.45;
    const y = S / 2 + (Math.random() - 0.5) * S * 0.45;
    const r = S * (0.12 + Math.random() * 0.2);
    gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,255,255,0.22)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const pvert = `
attribute vec4 aCol; attribute float aSize; attribute float aTile; attribute float aRot;
varying vec4 vCol; varying float vTile; varying float vRot; varying float vFog;
uniform float uScale; uniform float uFogD;
void main(){
  vCol = aCol; vTile = aTile; vRot = aRot;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.5, -mv.z);
  float d = length(mv.xyz);
  vFog = 1.0 - exp(-uFogD * uFogD * d * d);
}`;
const pfrag = `
uniform sampler2D uTex; uniform vec3 uFogC; uniform float uAdd;
varying vec4 vCol; varying float vTile; varying float vRot; varying float vFog;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRot); float s = sin(vRot);
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c) + 0.5;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) discard;
  vec2 tile = vec2(mod(vTile, 2.0), floor(vTile / 2.0));
  vec4 t = texture2D(uTex, (tile + vec2(p.x, 1.0 - p.y)) * 0.5);
  vec4 col = vec4(vCol.rgb * t.rgb, vCol.a * t.a);
  if (uAdd > 0.5) col.rgb *= (1.0 - vFog); else col.rgb = mix(col.rgb, uFogC, vFog);
  if (col.a < 0.003) discard;
  gl_FragColor = col;
}`;

function createBatch(scene, cap, additive, tex, shared) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(cap * 3);
  const col = new Float32Array(cap * 4);
  const size = new Float32Array(cap);
  const tile = new Float32Array(cap);
  const rot = new Float32Array(cap);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aCol", new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aTile", new THREE.BufferAttribute(tile, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aRot", new THREE.BufferAttribute(rot, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex }, uScale: shared.pointScale, uFogC: shared.fogColor, uFogD: shared.fogDensity, uAdd: { value: additive ? 1 : 0 } },
    vertexShader: pvert,
    fragmentShader: pfrag,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = additive ? 5 : 4;
  scene.add(pts);
  const P = [];
  for (let i = 0; i < cap; i++) P.push({ on: false });
  let cursor = 0;
  return {
    pts,
    spawn(o) {
      for (let k = 0; k < cap; k++) {
        cursor = (cursor + 1) % cap;
        if (!P[cursor].on) break;
      }
      const p = P[cursor];
      p.on = true;
      p.x = o.x;
      p.y = o.y;
      p.z = o.z;
      p.vx = o.vx || 0;
      p.vy = o.vy || 0;
      p.vz = o.vz || 0;
      p.g = o.g || 0;
      p.drag = o.drag ?? 0.5;
      p.life = p.max = o.life || 1;
      p.s0 = o.s0 ?? 0.5;
      p.s1 = o.s1 ?? p.s0;
      p.c0 = o.c0 || [1, 1, 1, 1];
      p.c1 = o.c1 || [p.c0[0], p.c0[1], p.c0[2], 0];
      p.tile = TILE[o.tile || "glow"];
      p.rot = o.rot ?? Math.random() * 6.28;
      p.vr = o.vr || 0;
      p.floor = o.floor ?? -1e9;
    },
    update(dt) {
      let n = 0;
      for (let i = 0; i < cap; i++) {
        const p = P[i];
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.on = false;
          continue;
        }
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vz *= k;
        p.vy = p.vy * k - p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < p.floor) {
          p.y = p.floor;
          p.vy *= -0.3;
        }
        p.rot += p.vr * dt;
        const t = 1 - p.life / p.max;
        pos[n * 3] = p.x;
        pos[n * 3 + 1] = p.y;
        pos[n * 3 + 2] = p.z;
        for (let c = 0; c < 4; c++) col[n * 4 + c] = p.c0[c] + (p.c1[c] - p.c0[c]) * t;
        // fade in quickly
        col[n * 4 + 3] *= Math.min(1, t * 8);
        size[n] = p.s0 + (p.s1 - p.s0) * t;
        tile[n] = p.tile;
        rot[n] = p.rot;
        n++;
      }
      geo.setDrawRange(0, n);
      for (const a of ["position", "aCol", "aSize", "aTile", "aRot"]) geo.attributes[a].needsUpdate = true;
      return n;
    },
    clear() {
      for (const p of P) p.on = false;
    },
    dispose() {
      scene.remove(pts);
      geo.dispose();
      mat.dispose();
    },
  };
}

/* ------------------------------------------------------------ telegraphs */
const tVert = `varying vec2 vL; attribute vec2 aL; void main(){ vL = aL; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const tFrag = `uniform vec3 uCol; uniform float uFill; uniform float uAlpha; uniform float uShape; uniform float uHalf; varying vec2 vL;
void main(){
  float r; float edge;
  if (uShape < 0.5) { r = length(vL); edge = smoothstep(0.92, 1.0, r) * step(r, 1.0); }
  else if (uShape < 1.5) { r = length(vL); float a = abs(atan(vL.x, vL.y)); edge = max(smoothstep(0.93, 1.0, r), smoothstep(uHalf - 0.06, uHalf, a)) * step(r, 1.0) * step(a, uHalf); }
  else { r = vL.y; edge = max(smoothstep(0.9, 1.0, abs(vL.x)), smoothstep(0.96, 1.0, vL.y)) * step(abs(vL.x), 1.0) * step(vL.y, 1.0) * step(0.0, vL.y); }
  float inside = (uShape < 1.5 ? step(length(vL), 1.0) : step(abs(vL.x), 1.0) * step(vL.y, 1.0) * step(0.0, vL.y));
  if (uShape > 0.5 && uShape < 1.5) inside *= step(abs(atan(vL.x, vL.y)), uHalf);
  float fill = step(r, uFill) * inside;
  float a = (edge * 0.9 + fill * 0.38 + inside * 0.1) * uAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uCol * (1.0 + fill * 0.5), a);
}`;

function telegraphGeometry(shape, W, x, z, r, yaw, half, len, ground) {
  // a conforming grid over the shape's bounding square
  const n = 18;
  const pos = [];
  const lc = [];
  const idx = [];
  const ext = shape === 2 ? Math.max(r, len) : r;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      let lx;
      let ly;
      let wx;
      let wz;
      if (shape === 2) {
        lx = (i / n) * 2 - 1;
        ly = j / n;
        wx = x + rx * lx * r + fx * ly * len;
        wz = z + rz * lx * r + fz * ly * len;
      } else {
        lx = (i / n) * 2 - 1;
        ly = (j / n) * 2 - 1;
        wx = x + rx * lx * ext + fx * ly * ext;
        wz = z + rz * lx * ext + fz * ly * ext;
      }
      pos.push(wx, ground(wx, wz) + 0.12, wz);
      lc.push(lx, ly);
    }
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aL", new THREE.Float32BufferAttribute(lc, 2));
  g.setIndex(idx);
  void W;
  void half;
  return g;
}

/* ------------------------------------------------------------ main */
export function createFx(scene, W, shared, quality) {
  const tex = atlasTexture();
  const add = createBatch(scene, quality === "low" ? 1200 : 2600, true, tex, shared);
  const alpha = createBatch(scene, quality === "low" ? 900 : 2200, false, tex, shared);
  const lights = [];
  const LN = quality === "low" ? 2 : quality === "high" ? 6 : 4;
  for (let i = 0; i < LN; i++) {
    const l = new THREE.PointLight(0xff9a50, 0, 16, 1.6);
    scene.add(l);
    lights.push(l);
  }
  let fires = [];
  let smokes = [];
  const emit = { acc: new Map() };
  const tele = [];
  const ground = (x, z) => {
    const g = W.col.ground(x, z, 30);
    return g < -5 ? 0 : g;
  };

  // weather
  const WN = quality === "low" ? 800 : 1800;
  const wgeo = new THREE.BufferGeometry();
  const wpos = new Float32Array(WN * 3);
  const wseed = new Float32Array(WN * 3);
  for (let i = 0; i < WN; i++) {
    wseed[i * 3] = Math.random();
    wseed[i * 3 + 1] = Math.random();
    wseed[i * 3 + 2] = Math.random();
  }
  wgeo.setAttribute("position", new THREE.BufferAttribute(wpos, 3));
  wgeo.setAttribute("aSeed", new THREE.BufferAttribute(wseed, 3));
  const wmat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uCam: shared.camPos, uKind: { value: 0 }, uAmt: { value: 0 }, uScale: shared.pointScale },
    vertexShader: `attribute vec3 aSeed; uniform float uTime; uniform vec3 uCam; uniform float uKind; uniform float uAmt; uniform float uScale; varying float vA;
      void main(){
        float B = 26.0;
        float fall = uKind < 0.5 ? 1.6 : (uKind < 1.5 ? 14.0 : 0.7);
        vec3 p = vec3(aSeed.x * 2.0 * B, aSeed.y * 2.0 * B, aSeed.z * 2.0 * B);
        p.y -= uTime * fall * (0.7 + aSeed.x * 0.6);
        p.x += sin(uTime * 0.7 + aSeed.y * 30.0) * (uKind < 0.5 ? 1.2 : 0.2) + uTime * (uKind > 1.5 ? 0.6 : 0.4);
        p = mod(p - uCam + B, 2.0 * B) - B + uCam;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (uKind < 0.5 ? 0.12 : uKind < 1.5 ? 0.05 : 0.09) * uScale / max(0.5, -mv.z);
        vA = step(aSeed.z, uAmt) * smoothstep(B, B * 0.4, length(p - uCam));
      }`,
    fragmentShader: `uniform float uKind; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a;
        if (uKind > 0.5 && uKind < 1.5) a = smoothstep(0.08, 0.0, abs(c.x)) * 0.5; else a = smoothstep(0.5, 0.15, length(c));
        vec3 col = uKind > 1.5 ? vec3(0.35, 0.3, 0.28) : vec3(0.9, 0.93, 1.0);
        if (a * vA < 0.01) discard; gl_FragColor = vec4(col, a * vA * (uKind > 0.5 && uKind < 1.5 ? 0.45 : 0.85)); }`,
    transparent: true,
    depthWrite: false,
  });
  const weather = new THREE.Points(wgeo, wmat);
  weather.frustumCulled = false;
  weather.renderOrder = 6;
  scene.add(weather);

  const R = Math.random;
  const api = {
    shake: 0,
    setSources(f, s) {
      fires = f;
      smokes = s;
    },
    burst(kind, x, y, z, o = {}) {
      const n = o.n ?? 12;
      const col = o.color || [1, 0.6, 0.25];
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2;
        const u = R() * 2 - 1;
        const sp = (o.speed ?? 4) * (0.4 + R() * 0.8);
        const dx = Math.cos(a) * Math.sqrt(1 - u * u);
        const dz = Math.sin(a) * Math.sqrt(1 - u * u);
        switch (kind) {
          case "spark":
            add.spawn({ x, y, z, vx: dx * sp, vy: Math.abs(u) * sp + 1.5, vz: dz * sp, g: 9, drag: 1.5, life: 0.3 + R() * 0.35, s0: 0.14, s1: 0.04, c0: [col[0] * 3, col[1] * 3, col[2] * 3, 1], c1: [col[0], col[1] * 0.5, col[2] * 0.3, 0], tile: "spark" });
            break;
          case "fire":
            add.spawn({ x: x + dx * 0.3, y: y + R() * 0.4, z: z + dz * 0.3, vx: dx * sp * 0.6, vy: 1 + R() * 2.5, vz: dz * sp * 0.6, g: -1.5, drag: 2, life: 0.5 + R() * 0.6, s0: o.size ?? 1.2, s1: 0.2, c0: [1.6, 0.9, 0.35, 0.95], c1: [0.9, 0.2, 0.05, 0], tile: "flame" });
            break;
          case "magic":
            add.spawn({ x, y, z, vx: dx * sp, vy: u * sp, vz: dz * sp, g: 0, drag: 2.5, life: 0.4 + R() * 0.5, s0: o.size ?? 0.5, s1: 0.05, c0: [col[0] * 2, col[1] * 2, col[2] * 2, 1], c1: [col[0], col[1], col[2], 0], tile: "glow" });
            break;
          case "smoke":
            alpha.spawn({ x: x + dx * 0.4, y, z: z + dz * 0.4, vx: dx * sp * 0.4, vy: 0.6 + R(), vz: dz * sp * 0.4, g: -0.3, drag: 1.2, life: 1.2 + R() * 1.2, s0: o.size ?? 1.2, s1: (o.size ?? 1.2) * 2.6, c0: [0.25, 0.23, 0.22, 0.55], c1: [0.3, 0.3, 0.3, 0], tile: "smoke", vr: (R() - 0.5) * 0.6 });
            break;
          case "dust":
            alpha.spawn({ x: x + dx * 0.5, y: y + 0.1, z: z + dz * 0.5, vx: dx * sp * 0.5, vy: 0.3 + R() * 0.5, vz: dz * sp * 0.5, g: 0.4, drag: 2.5, life: 0.6 + R() * 0.5, s0: 0.5, s1: 1.4, c0: o.snow ? [0.9, 0.92, 0.98, 0.5] : [0.55, 0.48, 0.38, 0.38], c1: [0.6, 0.55, 0.45, 0], tile: "smoke" });
            break;
          case "heal":
            add.spawn({ x: x + dx * 0.6, y: y + R() * 1.6, z: z + dz * 0.6, vx: 0, vy: 1 + R(), vz: 0, g: 0, drag: 0.5, life: 0.8 + R() * 0.5, s0: 0.35, s1: 0.05, c0: [0.5, 2, 0.7, 1], c1: [0.2, 1, 0.3, 0], tile: "glow" });
            break;
          case "level":
            add.spawn({ x: x + dx * 1.2, y: y + R() * 2.4, z: z + dz * 1.2, vx: dx * 0.4, vy: 1.5 + R() * 1.5, vz: dz * 0.4, g: 0, drag: 0.6, life: 1 + R() * 0.8, s0: 0.45, s1: 0.05, c0: [2.2, 1.8, 0.7, 1], c1: [1, 0.7, 0.2, 0], tile: "glow" });
            break;
          case "ash":
            add.spawn({ x: x + dx * 2, y: y + R() * 2, z: z + dz * 2, vx: dx, vy: 0.5 + R(), vz: dz, g: -0.2, drag: 0.8, life: 1.4 + R(), s0: 0.12, s1: 0.04, c0: [2, 0.7, 0.2, 1], c1: [1, 0.2, 0.05, 0], tile: "spark" });
            break;
          case "shadow":
            alpha.spawn({ x: x + dx * 0.5, y: y + R() * 1.6, z: z + dz * 0.5, vx: dx * sp * 0.3, vy: 0.5, vz: dz * sp * 0.3, g: 0, drag: 2, life: 0.6 + R() * 0.4, s0: 0.8, s1: 1.6, c0: [0.08, 0.04, 0.12, 0.7], c1: [0.1, 0.05, 0.15, 0], tile: "smoke" });
            break;
          case "frost":
            add.spawn({ x, y, z, vx: dx * sp, vy: u * sp, vz: dz * sp, g: 1, drag: 2, life: 0.5 + R() * 0.4, s0: 0.3, s1: 0.05, c0: [1, 1.6, 2.2, 1], c1: [0.4, 0.7, 1, 0], tile: "glow" });
            break;
        }
      }
    },
    /** Spell trail puff in an arbitrary colour (rgb 0..1). */
    spell(x, y, z, col, size = 0.35, life = 0.35, spread = 0.15) {
      add.spawn({ x: x + (R() - 0.5) * spread, y: y + (R() - 0.5) * spread, z: z + (R() - 0.5) * spread, vx: (R() - 0.5) * 0.4, vy: (R() - 0.5) * 0.4, vz: (R() - 0.5) * 0.4, life, s0: size, s1: size * 0.15, c0: [col[0] * 2.2, col[1] * 2.2, col[2] * 2.2, 0.9], c1: [col[0], col[1], col[2], 0], tile: "glow", drag: 2 });
    },
    /** Sparkle shower (impacts, reveals, level-ups) in a colour. */
    sparkle(x, y, z, col, n = 16, speed = 3, size = 0.22) {
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2;
        const u = R() * 2 - 1;
        const s = Math.sqrt(1 - u * u);
        const sp = speed * (0.3 + R() * 0.9);
        add.spawn({ x, y, z, vx: Math.cos(a) * s * sp, vy: u * sp + 1, vz: Math.sin(a) * s * sp, g: 2.5, drag: 2.2, life: 0.4 + R() * 0.6, s0: size, s1: 0.02, c0: [col[0] * 3, col[1] * 3, col[2] * 3, 1], c1: [col[0], col[1], col[2], 0], tile: R() < 0.5 ? "spark" : "glow" });
      }
    },
    mist(x, y, z, col = [0.6, 0.65, 0.7], size = 4, life = 4) {
      alpha.spawn({ x, y, z, vx: (R() - 0.5) * 0.3, vy: 0.05, vz: (R() - 0.5) * 0.3, g: 0, drag: 0.2, life, s0: size, s1: size * 1.4, c0: [...col, 0.18], c1: [...col, 0], tile: "smoke", vr: (R() - 0.5) * 0.2 });
    },
    /** A short flame jet (dragon breath segment, fire trap). */
    jet(x, y, z, dx, dy, dz, speed = 16, n = 6, spread = 0.18) {
      for (let i = 0; i < n; i++) {
        const sx = dx + (R() - 0.5) * spread;
        const sy = dy + (R() - 0.5) * spread;
        const sz = dz + (R() - 0.5) * spread;
        const sp = speed * (0.7 + R() * 0.5);
        add.spawn({ x, y, z, vx: sx * sp, vy: sy * sp, vz: sz * sp, g: -2, drag: 1.4, life: 0.55 + R() * 0.4, s0: 0.8, s1: 3.2, c0: [1.8, 1.0, 0.4, 0.95], c1: [0.9, 0.18, 0.04, 0], tile: "flame" });
      }
      if (R() < 0.4) alpha.spawn({ x: x + dx * speed * 0.6, y: y + 1, z: z + dz * speed * 0.6, vx: dx * 4, vy: 1.5, vz: dz * 4, g: -0.5, drag: 1, life: 1.5, s0: 2, s1: 5, c0: [0.15, 0.12, 0.11, 0.45], c1: [0.2, 0.2, 0.2, 0], tile: "smoke" });
    },
    trail(kind, x, y, z) {
      if (kind === "fire") add.spawn({ x, y, z, vx: (R() - 0.5) * 0.6, vy: 0.4, vz: (R() - 0.5) * 0.6, g: -0.5, drag: 1, life: 0.35, s0: 0.7, s1: 0.1, c0: [1.8, 0.9, 0.3, 0.9], c1: [0.8, 0.2, 0.05, 0], tile: "flame" });
      else if (kind === "arrow") add.spawn({ x, y, z, life: 0.18, s0: 0.12, s1: 0.02, c0: [1, 1, 0.9, 0.4], c1: [1, 1, 1, 0], tile: "glow" });
      else if (kind === "frost") add.spawn({ x, y, z, life: 0.3, s0: 0.35, s1: 0.05, c0: [0.8, 1.4, 2, 0.9], c1: [0.4, 0.7, 1, 0], tile: "glow" });
      else if (kind === "shadow") add.spawn({ x, y, z, life: 0.3, s0: 0.25, s1: 0.04, c0: [0.8, 0.4, 1.4, 0.8], c1: [0.3, 0.1, 0.5, 0], tile: "glow" });
      else if (kind === "bolt") add.spawn({ x, y, z, life: 0.25, s0: 0.25, s1: 0.04, c0: [1.4, 1.2, 0.8, 0.6], c1: [1, 1, 1, 0], tile: "glow" });
      else if (kind === "corrupt") add.spawn({ x, y, z, vx: 0, vy: 0.3, vz: 0, life: 0.45, s0: 0.6, s1: 0.1, c0: [1.6, 0.3, 0.15, 0.9], c1: [0.4, 0.05, 0.05, 0], tile: "flame" });
    },
    /** shape: 'circle' | 'cone' | 'line'. Returns a handle with .set(fill), .kill(). */
    telegraph(o) {
      const shape = o.shape === "cone" ? 1 : o.shape === "line" ? 2 : 0;
      const g = telegraphGeometry(shape, W, o.x, o.z, o.r, o.yaw || 0, o.half || 0.5, o.len || o.r, o.interior ? () => o.y ?? 0 : ground);
      const m = new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Color(o.color || "#ff5a2a") }, uFill: { value: 0 }, uAlpha: { value: 1 }, uShape: { value: shape }, uHalf: { value: o.half || 0.5 } },
        vertexShader: tVert,
        fragmentShader: tFrag,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      scene.add(mesh);
      const h = { mesh, t: 0, dur: o.dur || 1, hold: o.hold ?? 0.15, dead: false, id: o.id };
      tele.push(h);
      return h;
    },
    killTelegraph(id) {
      for (const h of tele) if (h.id === id) h.t = h.dur + h.hold;
    },
    update(dt, camPos, view) {
      // fire emitters near the camera
      const nearFires = [];
      for (const f of fires) {
        if (f.lit === false) continue;
        const d = Math.hypot(f.x - camPos.x, f.z - camPos.z);
        if (d > 70 || f.hidden) continue;
        nearFires.push([d, f]);
        if (f.kind === "lantern") continue;
        const acc = (emit.acc.get(f) || 0) + dt * (f.kind === "torch" ? 9 : f.kind === "campfire" ? 22 * f.s : 14 * (f.s || 1));
        let n = Math.floor(acc);
        emit.acc.set(f, acc - n);
        while (n-- > 0) {
          const s = f.s || 1;
          const ember = f.ember;
          add.spawn({
            x: f.x + (R() - 0.5) * 0.4 * s,
            y: f.y + R() * 0.1,
            z: f.z + (R() - 0.5) * 0.4 * s,
            vx: (R() - 0.5) * 0.3 + view.windX * 0.5,
            vy: 0.8 + R() * 1.4 * s,
            vz: (R() - 0.5) * 0.3,
            g: -0.6,
            drag: 1.2,
            life: 0.4 + R() * 0.45,
            s0: (f.kind === "torch" ? 0.45 : 0.9) * s,
            s1: 0.1,
            c0: f.kind === "darkfire" ? [0.4, 1.9, 0.7, 0.95] : f.kind === "blue" ? [0.5, 0.9, 2.0, 0.95] : ember ? [1.9, 0.7, 0.25, 0.95] : [1.7, 0.95, 0.4, 0.95],
            c1: f.kind === "darkfire" ? [0.05, 0.5, 0.15, 0] : f.kind === "blue" ? [0.1, 0.2, 0.8, 0] : [0.8, 0.15, 0.03, 0],
            tile: "flame",
          });
          if (R() < 0.12) add.spawn({ x: f.x, y: f.y + 0.3, z: f.z, vx: (R() - 0.5) * 1.2, vy: 1.5 + R() * 2, vz: (R() - 0.5) * 1.2, g: -0.2, drag: 0.6, life: 1 + R(), s0: 0.08, s1: 0.03, c0: [2, 0.8, 0.3, 1], c1: [1, 0.3, 0.05, 0], tile: "spark" });
          if (f.kind !== "torch" && R() < 0.18) alpha.spawn({ x: f.x, y: f.y + 0.8, z: f.z, vx: view.windX * 0.6, vy: 0.9 + R() * 0.6, vz: 0, g: -0.2, drag: 0.4, life: 2.5 + R() * 1.5, s0: 0.8 * s, s1: 3 * s, c0: [0.2, 0.19, 0.18, 0.35], c1: [0.32, 0.32, 0.32, 0], tile: "smoke", vr: (R() - 0.5) * 0.5 });
        }
      }
      if (!view.interior)
        for (const s of smokes) {
          if (Math.hypot(s.x - camPos.x, s.z - camPos.z) > 130) continue;
          const acc = (emit.acc.get(s) || 0) + dt * 2.2;
          let n = Math.floor(acc);
          emit.acc.set(s, acc - n);
          while (n-- > 0) alpha.spawn({ x: s.x, y: s.y, z: s.z, vx: view.windX * 0.8 + (R() - 0.5) * 0.2, vy: 0.9 + R() * 0.5, vz: (R() - 0.5) * 0.2, g: -0.05, drag: 0.3, life: 4 + R() * 2, s0: 0.7, s1: 4, c0: [0.75, 0.74, 0.72, 0.28], c1: [0.8, 0.8, 0.8, 0], tile: "smoke", vr: (R() - 0.5) * 0.4 });
        }
      // flickering lights on the nearest fires
      nearFires.sort((a, b) => a[0] - b[0]);
      const t = shared.time.value;
      lights.forEach((l, i) => {
        const f = nearFires[i]?.[1];
        if (!f) {
          l.intensity = 0;
          return;
        }
        l.position.set(f.x, f.y + 0.6, f.z);
        const fl = 0.82 + Math.sin(t * 13 + i * 7) * 0.08 + Math.sin(t * 23 + i * 3) * 0.06 + Math.random() * 0.05;
        const base = f.kind === "torch" ? 14 : f.kind === "campfire" ? 22 * (f.s || 1) : f.kind === "hearth" ? 26 : f.kind === "darkfire" ? 9 : 16;
        l.intensity = base * fl * (view.interior ? 1.5 : 0.45 + view.night * 1.1);
        l.distance = f.kind === "torch" ? 16 : 22;
        l.color.set(f.kind === "darkfire" ? 0x5ac888 : f.kind === "blue" ? 0x6aa8ff : f.ember ? 0xff7a3a : 0xffa060);
      });
      add.update(dt);
      alpha.update(dt);
      // telegraphs
      for (let i = tele.length - 1; i >= 0; i--) {
        const h = tele[i];
        h.t += dt;
        const u = h.mesh.material.uniforms;
        u.uFill.value = Math.min(1, h.t / h.dur);
        u.uAlpha.value = h.t > h.dur ? Math.max(0, 1 - (h.t - h.dur) / Math.max(0.05, h.hold)) : Math.min(1, h.t * 6);
        if (h.t > h.dur + h.hold) {
          scene.remove(h.mesh);
          h.mesh.geometry.dispose();
          h.mesh.material.dispose();
          tele.splice(i, 1);
        }
      }
      // weather
      wmat.uniforms.uKind.value = view.weather === "rain" ? 1 : view.weather === "ash" ? 2 : 0;
      wmat.uniforms.uAmt.value += ((view.weather && !view.interior ? view.weatherAmt : 0) - wmat.uniforms.uAmt.value) * Math.min(1, dt * 0.8);
      weather.visible = wmat.uniforms.uAmt.value > 0.01;
      this.shake = Math.max(0, this.shake - dt * 3);
    },
    clear() {
      add.clear();
      alpha.clear();
      for (const h of tele) {
        scene.remove(h.mesh);
        h.mesh.geometry.dispose();
        h.mesh.material.dispose();
      }
      tele.length = 0;
    },
    dispose() {
      this.clear();
      add.dispose();
      alpha.dispose();
      lights.forEach((l) => scene.remove(l));
      scene.remove(weather);
      wgeo.dispose();
      wmat.dispose();
      tex.dispose();
    },
  };
  return api;
}
