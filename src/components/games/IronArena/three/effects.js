/**
 * Iron Arena — visual effects.
 *
 * Particles: two pooled instanced-billboard systems (additive for fire,
 * sparks, flashes, plasma; alpha-blended for smoke, dust, debris puffs,
 * snow spray) sharing one procedural sprite atlas. Sparks/tracers stretch
 * along their screen-space velocity. Everything is CPU-simulated in typed
 * arrays and uploaded once per frame — no allocations per particle.
 *
 * Also: projectile tracer meshes (instanced), scorch decals (pooled), flying
 * debris chunks (instanced), explosion point lights (fixed pool, intensity
 * only — the light count never changes, so no shader recompiles), and
 * camera-following weather (rain, snow, dust motes, pollen).
 */
import * as THREE from "three";
import { canvasTex } from "./textures.js";

/* ------------------------------------------------------------------ sprite atlas (4×2) */
function atlas() {
  return canvasTex("ia-atlas", 1024, 512, (g) => {
    const T = 256;
    const cell = (i) => [(i % 4) * T, Math.floor(i / 4) * T];
    const rnd = (() => {
      let a = 99;
      return () => ((a = (a * 16807) % 2147483647) / 2147483647);
    })();
    // 0 soft glow
    {
      const [x, y] = cell(0);
      const gr = g.createRadialGradient(x + T / 2, y + T / 2, 0, x + T / 2, y + T / 2, T / 2);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.25, "rgba(255,255,255,0.75)");
      gr.addColorStop(0.6, "rgba(255,255,255,0.18)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(x, y, T, T);
    }
    // 1 smoke puff, 2 fire, 4 dust: layered blobs
    const blobby = (i, n, rMin, rMax, alpha, spread) => {
      const [x, y] = cell(i);
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd()) * T * spread;
        const cx = x + T / 2 + Math.cos(a) * d;
        const cy = y + T / 2 + Math.sin(a) * d;
        const r = T * (rMin + rnd() * (rMax - rMin));
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, `rgba(255,255,255,${alpha})`);
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fill();
      }
    };
    blobby(1, 26, 0.12, 0.24, 0.32, 0.22);
    blobby(2, 18, 0.1, 0.22, 0.45, 0.18);
    blobby(4, 30, 0.08, 0.18, 0.22, 0.28);
    // 3 spark: bright core with a short streak
    {
      const [x, y] = cell(3);
      const gr = g.createRadialGradient(x + T / 2, y + T / 2, 0, x + T / 2, y + T / 2, T * 0.18);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(x, y, T, T);
      const lg = g.createLinearGradient(x, 0, x + T, 0);
      lg.addColorStop(0, "rgba(255,255,255,0)");
      lg.addColorStop(0.5, "rgba(255,255,255,0.9)");
      lg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = lg;
      g.fillRect(x, y + T / 2 - 6, T, 12);
    }
    // 5 debris chunk (dark irregular)
    {
      const [x, y] = cell(5);
      g.fillStyle = "rgba(255,255,255,1)";
      g.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const r = T * (0.18 + rnd() * 0.16);
        g.lineTo(x + T / 2 + Math.cos(a) * r, y + T / 2 + Math.sin(a) * r);
      }
      g.fill();
    }
    // 6 ring
    {
      const [x, y] = cell(6);
      const gr = g.createRadialGradient(x + T / 2, y + T / 2, T * 0.3, x + T / 2, y + T / 2, T / 2);
      gr.addColorStop(0, "rgba(255,255,255,0)");
      gr.addColorStop(0.75, "rgba(255,255,255,0.85)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(x, y, T, T);
    }
    // 7 flake / droplet
    {
      const [x, y] = cell(7);
      const gr = g.createRadialGradient(x + T / 2, y + T / 2, 0, x + T / 2, y + T / 2, T * 0.25);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.5, "rgba(255,255,255,0.6)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(x, y, T, T);
    }
  });
}

const VERT = `
#include <fog_pars_vertex>
attribute vec3 iPos; attribute vec4 iCol; attribute vec4 iData; attribute vec3 iVel;
varying vec2 vUv; varying vec4 vCol;
void main(){
  // iData: x = size, y = rotation, z = frame, w = stretch
  vCol = iCol;
  float fr = iData.z;
  vec2 cell = vec2(mod(fr, 4.0), 1.0 - floor(fr / 4.0));
  vUv = (position.xy + 0.5 + cell) / vec2(4.0, 2.0);
  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
  vec2 q = position.xy * iData.x;
  if (iData.w > 0.0) {
    vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
    vec2 d = vv.xy;
    float L = length(d);
    vec2 dir = L > 1e-4 ? d / L : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float len = iData.x * (1.0 + iData.w * L * 0.06);
    q = dir * position.x * len + nrm * position.y * iData.x * 0.35;
  } else {
    float c = cos(iData.y), s = sin(iData.y);
    q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  }
  mvPosition.xy += q;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = `
#include <fog_pars_fragment>
uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol;
void main(){
  vec4 t = texture2D(uMap, vUv);
  gl_FragColor = vec4(vCol.rgb * t.rgb, vCol.a * t.a);
  if (gl_FragColor.a < 0.004) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function createSystem(max, additive, tex) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute("position", quad.attributes.position);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const iCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iData = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute("iPos", iPos);
  g.setAttribute("iCol", iCol);
  g.setAttribute("iData", iData);
  g.setAttribute("iVel", iVel);
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, ...THREE.UniformsLib.fog },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: !additive,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = additive ? 6 : 5;
  // simulation state
  const S = {
    n: 0,
    max,
    px: new Float32Array(max),
    py: new Float32Array(max),
    pz: new Float32Array(max),
    vx: new Float32Array(max),
    vy: new Float32Array(max),
    vz: new Float32Array(max),
    life: new Float32Array(max),
    maxLife: new Float32Array(max),
    s0: new Float32Array(max),
    s1: new Float32Array(max),
    rot: new Float32Array(max),
    rv: new Float32Array(max),
    c0: new Float32Array(max * 4),
    c1: new Float32Array(max * 4),
    drag: new Float32Array(max),
    grav: new Float32Array(max),
    frame: new Float32Array(max),
    stretch: new Float32Array(max),
  };
  function emit(o) {
    let i = S.n;
    if (i >= max) {
      // overwrite the oldest-ish slot
      i = Math.floor(Math.random() * max);
    } else S.n++;
    S.px[i] = o.x;
    S.py[i] = o.y;
    S.pz[i] = o.z;
    S.vx[i] = o.vx || 0;
    S.vy[i] = o.vy || 0;
    S.vz[i] = o.vz || 0;
    S.life[i] = 0;
    S.maxLife[i] = o.life || 1;
    S.s0[i] = o.s0 ?? 1;
    S.s1[i] = o.s1 ?? S.s0[i];
    S.rot[i] = o.rot ?? Math.random() * 6.28;
    S.rv[i] = o.rv ?? (Math.random() - 0.5) * 1.5;
    const a = o.c0 || [1, 1, 1, 1];
    const b = o.c1 || [a[0], a[1], a[2], 0];
    S.c0.set(a, i * 4);
    S.c1.set(b, i * 4);
    S.drag[i] = o.drag ?? 0.5;
    S.grav[i] = o.grav ?? 0;
    S.frame[i] = o.frame ?? 0;
    S.stretch[i] = o.stretch ?? 0;
  }
  function update(dt) {
    let n = S.n;
    for (let i = 0; i < n; i++) {
      S.life[i] += dt;
      if (S.life[i] >= S.maxLife[i]) {
        // swap-remove
        n--;
        const j = n;
        if (i !== j) {
          for (const k of ["px", "py", "pz", "vx", "vy", "vz", "life", "maxLife", "s0", "s1", "rot", "rv", "drag", "grav", "frame", "stretch"]) S[k][i] = S[k][j];
          S.c0.copyWithin(i * 4, j * 4, j * 4 + 4);
          S.c1.copyWithin(i * 4, j * 4, j * 4 + 4);
        }
        i--;
        continue;
      }
      const k = Math.exp(-S.drag[i] * dt);
      S.vx[i] *= k;
      S.vy[i] = S.vy[i] * k - S.grav[i] * dt;
      S.vz[i] *= k;
      S.px[i] += S.vx[i] * dt;
      S.py[i] += S.vy[i] * dt;
      S.pz[i] += S.vz[i] * dt;
      S.rot[i] += S.rv[i] * dt;
    }
    S.n = n;
    const P = iPos.array;
    const C = iCol.array;
    const D = iData.array;
    const Vv = iVel.array;
    for (let i = 0; i < n; i++) {
      const t = S.life[i] / S.maxLife[i];
      P[i * 3] = S.px[i];
      P[i * 3 + 1] = S.py[i];
      P[i * 3 + 2] = S.pz[i];
      // fade-in for the first 10% then interpolate colours
      const fin = Math.min(1, t * 10);
      for (let c = 0; c < 4; c++) C[i * 4 + c] = S.c0[i * 4 + c] + (S.c1[i * 4 + c] - S.c0[i * 4 + c]) * t;
      C[i * 4 + 3] *= fin;
      D[i * 4] = S.s0[i] + (S.s1[i] - S.s0[i]) * Math.sqrt(t);
      D[i * 4 + 1] = S.rot[i];
      D[i * 4 + 2] = S.frame[i];
      D[i * 4 + 3] = S.stretch[i];
      Vv[i * 3] = S.vx[i];
      Vv[i * 3 + 1] = S.vy[i];
      Vv[i * 3 + 2] = S.vz[i];
    }
    g.instanceCount = n;
    iPos.needsUpdate = iCol.needsUpdate = iData.needsUpdate = iVel.needsUpdate = true;
  }
  return { mesh, emit, update, S, dispose: () => (g.dispose(), mat.dispose(), quad.dispose()), clear: () => ((S.n = 0), (g.instanceCount = 0)) };
}

/* ------------------------------------------------------------------ colours */
const KIND_COL = {
  shell: [1.0, 0.75, 0.4],
  burst: [1.0, 0.85, 0.45],
  clip: [1.0, 0.8, 0.35],
  he: [1.0, 0.6, 0.25],
  rail: [0.4, 0.85, 1.0],
  plasma: [0.75, 0.45, 1.0],
  flame: [1.0, 0.55, 0.15],
  strike: [1.0, 0.65, 0.3],
};
const SURF_DUST = {
  sand: [0.86, 0.72, 0.5],
  dirt: [0.5, 0.4, 0.3],
  grass: [0.45, 0.42, 0.3],
  mud: [0.36, 0.3, 0.24],
  snow: [0.95, 0.97, 1.0],
  ice: [0.85, 0.93, 1.0],
  concrete: [0.68, 0.66, 0.62],
  asphalt: [0.42, 0.42, 0.45],
  metal: [0.55, 0.55, 0.55],
  wood: [0.55, 0.45, 0.35],
  water: [0.85, 0.92, 0.98],
};

export function createEffects(scene, quality) {
  const tex = atlas();
  const maxA = quality === "high" ? 3200 : quality === "medium" ? 2200 : 1100;
  const add = createSystem(maxA, true, tex);
  const alpha = createSystem(maxA, false, tex);
  scene.add(add.mesh, alpha.mesh);
  const Q = { high: 1, medium: 0.75, low: 0.45 }[quality] || 0.75;
  const R = Math.random;

  /* ---------- tracers */
  const TR_MAX = 160;
  const trGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1);
  trGeo.rotateX(Math.PI / 2);
  const trMat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = new THREE.InstancedMesh(trGeo, trMat, TR_MAX);
  tracers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TR_MAX * 3), 3);
  tracers.frustumCulled = false;
  tracers.count = 0;
  scene.add(tracers);
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _v = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _z = new THREE.Vector3(0, 0, 1);

  /* ---------- decals */
  const scorchTex = canvasTex("ia-scorch", 256, 256, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, "rgba(10,8,6,0.95)");
    gr.addColorStop(0.45, "rgba(20,16,12,0.75)");
    gr.addColorStop(0.8, "rgba(30,24,18,0.25)");
    gr.addColorStop(1, "rgba(30,24,18,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.25})`;
      const a = Math.random() * 6.28;
      const r = (0.2 + Math.random() * 0.3) * w;
      g.beginPath();
      g.arc(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r, 2 + Math.random() * 6, 0, 6.28);
      g.fill();
    }
  });
  const DEC = quality === "low" ? 16 : 40;
  const decGeo = new THREE.PlaneGeometry(1, 1);
  const decals = [];
  for (let i = 0; i < DEC; i++) {
    const m = new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, opacity: 0 });
    const mesh = new THREE.Mesh(decGeo, m);
    mesh.visible = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
    decals.push({ mesh, t: 0, life: 25 });
  }
  let decI = 0;
  const markerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 0.25, 0.15), transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, map: canvasTex("ia-marker", 256, 256, (g, w) => {
    g.strokeStyle = "white";
    g.lineWidth = 10;
    g.beginPath();
    g.arc(w / 2, w / 2, w * 0.42, 0, 6.28);
    g.stroke();
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(w / 2, w * 0.15);
    g.lineTo(w / 2, w * 0.85);
    g.moveTo(w * 0.15, w / 2);
    g.lineTo(w * 0.85, w / 2);
    g.stroke();
  }) });
  const markers = [];

  /* ---------- debris (instanced chunks with simple physics) */
  const DB = quality === "low" ? 40 : 120;
  const dbGeo = new THREE.DodecahedronGeometry(0.13, 0);
  const dbMat = new THREE.MeshStandardMaterial({ color: "#6a625a", roughness: 0.9, metalness: 0.2 });
  const debris = new THREE.InstancedMesh(dbGeo, dbMat, DB);
  debris.castShadow = false;
  debris.frustumCulled = false;
  debris.count = 0;
  scene.add(debris);
  const dbS = Array.from({ length: DB }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0, rv: 0, s: 1, t: 0, ground: 0 }));
  let dbI = 0;

  /* ---------- explosion lights */
  const NL = quality === "high" ? 4 : quality === "medium" ? 2 : 0;
  const lights = [];
  for (let i = 0; i < NL; i++) {
    const l = new THREE.PointLight("#ffaa55", 0, 22, 2);
    scene.add(l);
    lights.push({ l, t: 0, life: 0.3, i0: 0 });
  }
  let lightI = 0;
  function flashLight(x, y, z, color, intensity, life = 0.25, dist = 22) {
    if (!lights.length) return;
    const L = lights[lightI++ % lights.length];
    L.l.position.set(x, y, z);
    L.l.color.set(color);
    L.l.distance = dist;
    L.t = 0;
    L.life = life;
    L.i0 = intensity;
  }

  /* ---------- weather */
  let weather = null;
  function setWeather(kind, color, count) {
    if (weather) {
      scene.remove(weather.obj);
      weather.dispose();
      weather = null;
    }
    if (!kind) return;
    const n = Math.round(count * (quality === "high" ? 1 : quality === "medium" ? 0.7 : 0.35));
    const BOX = kind === "rain" ? 40 : 60;
    const H2 = kind === "rain" ? 25 : 30;
    if (kind === "rain") {
      const pos = new Float32Array(n * 6);
      const seeds = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) seeds.set([R() * BOX * 2 - BOX, R() * H2, R() * BOX * 2 - BOX], i * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      const m = new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.35, depthWrite: false });
      const obj = new THREE.LineSegments(g, m);
      obj.frustumCulled = false;
      scene.add(obj);
      let t = 0;
      weather = {
        obj,
        update(dt, cam) {
          t += dt;
          for (let i = 0; i < n; i++) {
            const sx = seeds[i * 3];
            const sz = seeds[i * 3 + 2];
            const y = ((seeds[i * 3 + 1] - t * 28) % H2 + H2) % H2;
            const x = cam.x + (((sx - cam.x) % (BOX * 2)) + BOX * 3) % (BOX * 2) - BOX;
            const z = cam.z + (((sz - cam.z) % (BOX * 2)) + BOX * 3) % (BOX * 2) - BOX;
            const yy = cam.y - 8 + y;
            pos.set([x, yy, z, x + 0.15, yy + 0.9, z + 0.05], i * 6);
          }
          g.attributes.position.needsUpdate = true;
        },
        dispose: () => (g.dispose(), m.dispose()),
      };
      return;
    }
    const pos = new Float32Array(n * 3);
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) seeds.set([R() * BOX * 2 - BOX, R() * H2, R() * BOX * 2 - BOX, R()], i * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.PointsMaterial({
      color: new THREE.Color(color),
      size: kind === "snow" ? 0.22 : kind === "pollen" ? 0.12 : 0.1,
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: kind === "snow" ? 0.9 : 0.55,
      sizeAttenuation: true,
      blending: kind === "pollen" ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    // use the glow cell of the atlas for points
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace("#include <map_particle_fragment>", "vec2 ia_uv = (vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) + vec2(3.0, 0.0)) / vec2(4.0, 2.0);\n  diffuseColor *= texture2D(map, ia_uv);");
    };
    const obj = new THREE.Points(g, m);
    obj.frustumCulled = false;
    scene.add(obj);
    let t = 0;
    const fall = kind === "snow" ? 2.2 : kind === "pollen" ? -0.08 : 0.15;
    weather = {
      obj,
      update(dt, cam) {
        t += dt;
        for (let i = 0; i < n; i++) {
          const ph = seeds[i * 4 + 3] * 6.28;
          const sx = seeds[i * 4] + Math.sin(t * 0.7 + ph) * 1.2 + t * (kind === "dust" ? 0.8 : 0.3);
          const sz = seeds[i * 4 + 2] + Math.cos(t * 0.5 + ph) * 1.2;
          const y = ((seeds[i * 4 + 1] - t * fall) % H2 + H2) % H2;
          const x = cam.x + (((sx - cam.x) % (BOX * 2)) + BOX * 3) % (BOX * 2) - BOX;
          const z = cam.z + (((sz - cam.z) % (BOX * 2)) + BOX * 3) % (BOX * 2) - BOX;
          pos[i * 3] = x;
          pos[i * 3 + 1] = cam.y - 10 + y;
          pos[i * 3 + 2] = z;
        }
        g.attributes.position.needsUpdate = true;
      },
      dispose: () => (g.dispose(), m.dispose()),
    };
  }

  /* ---------------------------------------------------------------- emitters */
  const C = (rgb, a) => [rgb[0], rgb[1], rgb[2], a];
  function smoke(x, y, z, n, o = {}) {
    for (let i = 0; i < Math.ceil(n * Q); i++) {
      const sh = o.shade ?? 0.18;
      const g = sh + R() * 0.08;
      alpha.emit({ x: x + (R() - 0.5) * (o.spread || 1), y: y + R() * 0.5, z: z + (R() - 0.5) * (o.spread || 1), vx: (R() - 0.5) * (o.v || 2), vy: (o.up ?? 1.5) + R() * 1.5, vz: (R() - 0.5) * (o.v || 2), life: (o.life || 3) * (0.7 + R() * 0.6), s0: o.s0 ?? 1.5, s1: o.s1 ?? 5, c0: [g * (o.tint?.[0] ?? 1), g * (o.tint?.[1] ?? 0.98), g * (o.tint?.[2] ?? 0.95), o.a ?? 0.55], c1: [g * 1.4, g * 1.4, g * 1.4, 0], drag: 1.2, grav: -0.3, frame: 1, rv: (R() - 0.5) * 0.6 });
    }
  }
  function fire(x, y, z, n, size = 2, o = {}) {
    for (let i = 0; i < Math.ceil(n * Q); i++) {
      add.emit({ x: x + (R() - 0.5) * size * 0.6, y: y + (R() - 0.5) * size * 0.4, z: z + (R() - 0.5) * size * 0.6, vx: (R() - 0.5) * (o.v ?? 5), vy: (R() - 0.2) * (o.vUp ?? 5), vz: (R() - 0.5) * (o.v ?? 5), life: (o.life ?? 0.55) * (0.6 + R() * 0.7), s0: size * (0.5 + R() * 0.5), s1: size * (1.4 + R()), c0: [1.6, 0.85 + R() * 0.3, 0.35, 0.9], c1: [0.9, 0.25, 0.05, 0], drag: 2.5, grav: -2, frame: 2 });
    }
  }
  function sparks(x, y, z, n, col = [1.6, 1.1, 0.5], speed = 14, o = {}) {
    for (let i = 0; i < Math.ceil(n * Q); i++) {
      const a = R() * 6.28;
      const e = (o.up ?? 0.3) + R() * 0.9;
      const v = speed * (0.4 + R() * 0.8);
      const nx = o.nx ?? 0;
      const ny = o.ny ?? 1;
      const nz = o.nz ?? 0;
      add.emit({ x, y, z, vx: Math.cos(a) * v * (1 - e * 0.5) + nx * v * 0.5, vy: e * v * 0.6 + ny * v * 0.4, vz: Math.sin(a) * v * (1 - e * 0.5) + nz * v * 0.5, life: 0.35 + R() * 0.5, s0: 0.12, s1: 0.06, c0: C(col, 1), c1: [col[0], col[1] * 0.5, col[2] * 0.2, 0], drag: 1.5, grav: 14, frame: 3, stretch: 1 });
    }
  }
  function dust(x, y, z, n, col, o = {}) {
    for (let i = 0; i < Math.ceil(n * Q); i++) {
      const a = R() * 6.28;
      const v = (o.v ?? 4) * (0.5 + R());
      alpha.emit({ x: x + Math.cos(a) * (o.r ?? 0.5), y: y + 0.2, z: z + Math.sin(a) * (o.r ?? 0.5), vx: Math.cos(a) * v + (o.vx || 0), vy: (o.up ?? 1) * (0.5 + R()), vz: Math.sin(a) * v + (o.vz || 0), life: (o.life ?? 1.6) * (0.7 + R() * 0.6), s0: o.s0 ?? 1, s1: o.s1 ?? 3.5, c0: C(col, o.a ?? 0.5), c1: C(col, 0), drag: 2, grav: o.grav ?? -0.2, frame: 4 });
    }
  }
  function debrisBurst(x, y, z, n, speed = 9) {
    for (let i = 0; i < Math.ceil(n * Q); i++) {
      const d = dbS[dbI++ % DB];
      const a = R() * 6.28;
      d.on = true;
      d.x = x;
      d.y = y + 0.3;
      d.z = z;
      d.vx = Math.cos(a) * speed * (0.3 + R());
      d.vy = speed * (0.6 + R() * 0.9);
      d.vz = Math.sin(a) * speed * (0.3 + R());
      d.r = R() * 6;
      d.rv = (R() - 0.5) * 14;
      d.s = 0.5 + R() * 1.4;
      d.t = 0;
      d.ground = y - 0.2;
    }
  }
  function scorch(x, y, z, nx, ny, nz, size) {
    const D = decals[decI++ % decals.length];
    D.mesh.visible = true;
    D.mesh.position.set(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05);
    D.mesh.lookAt(x + nx, y + ny, z + nz);
    D.mesh.rotateZ(R() * 6.28);
    D.mesh.scale.setScalar(size);
    D.mesh.material.opacity = 0.85;
    D.t = 0;
  }
  function ring(x, y, z, size, col = [1.4, 0.9, 0.5], life = 0.45) {
    add.emit({ x, y, z, life, s0: size * 0.2, s1: size, c0: C(col, 0.8), c1: C(col, 0), drag: 0, frame: 6, rot: 0, rv: 0 });
  }

  /* ---------------------------------------------------------------- public API */
  const api = {
    add,
    alpha,
    setWeather,
    smoke,
    fire,
    sparks,
    dust,
    muzzle(x, y, z, dx, dy, dz, kind, scale = 1) {
      const col = KIND_COL[kind] || KIND_COL.shell;
      const L = Math.hypot(dx, dy, dz) || 1;
      const ux = dx / L;
      const uy = dy / L;
      const uz = dz / L;
      const big = kind === "he" || kind === "shell" ? 1.3 : kind === "rail" ? 1.1 : 0.7;
      const s = big * scale;
      add.emit({ x, y, z, life: 0.09, s0: 2.6 * s, s1: 3.4 * s, c0: [col[0] * 2.2, col[1] * 2.2, col[2] * 2.2, 1], c1: C(col, 0), frame: 0 });
      for (let k = 1; k <= 3; k++) add.emit({ x: x + ux * k * 0.6 * s, y: y + uy * k * 0.6 * s, z: z + uz * k * 0.6 * s, vx: ux * 6, vy: uy * 6, vz: uz * 6, life: 0.08, s0: (1.4 - k * 0.25) * s, s1: (1.8 - k * 0.3) * s, c0: [col[0] * 1.8, col[1] * 1.5, col[2], 1], c1: C(col, 0), frame: 2 });
      if (kind !== "plasma" && kind !== "rail") smoke(x + ux, y + uy, z + uz, kind === "burst" || kind === "clip" ? 1 : 4, { s0: 0.8 * s, s1: 3.2 * s, life: 1.4, up: 0.6, v: 3, a: 0.4, shade: 0.55 });
      if (kind === "rail") ring(x + ux, y + uy, z + uz, 3, [0.5, 1.2, 1.8], 0.3);
      if (kind === "plasma") ring(x + ux * 0.5, y + uy * 0.5, z + uz * 0.5, 1.6, [1.2, 0.6, 1.8], 0.25);
      flashLight(x + ux, y + uy, z + uz, kind === "rail" ? "#7fd8ff" : kind === "plasma" ? "#c08aff" : "#ffb060", 22 * big, 0.08, 16);
    },
    /** ground blast rings under heavy guns */
    blastDust(x, y, z, col) {
      dust(x, y, z, 10, col, { v: 9, up: 0.4, s0: 1.2, s1: 4.5, life: 1.2, a: 0.45 });
    },
    impact(e, surfaceCol) {
      const big = e.kind === "he" || e.kind === "strike";
      const med = e.kind === "shell";
      const col = KIND_COL[e.kind] || KIND_COL.shell;
      const onTank = e.tank >= 0;
      if (e.kind === "plasma") {
        ring(e.x, e.y, e.z, 4, [1.2, 0.6, 2], 0.35);
        add.emit({ x: e.x, y: e.y, z: e.z, life: 0.25, s0: 2.5, s1: 4.5, c0: [1.4, 0.8, 2.2, 1], c1: [0.6, 0.2, 1, 0], frame: 0 });
        sparks(e.x, e.y, e.z, 14, [1.3, 0.8, 2.0], 10, { nx: e.nx, ny: e.ny, nz: e.nz });
        smoke(e.x, e.y, e.z, 2, { s0: 1, s1: 3, life: 1.2, a: 0.3, shade: 0.4, tint: [0.9, 0.85, 1] });
        flashLight(e.x, e.y + 0.5, e.z, "#b07aff", 30, 0.25, 18);
        if (!onTank) scorch(e.x, e.y, e.z, e.nx, e.ny, e.nz, 2.2);
        return;
      }
      if (e.kind === "rail") {
        sparks(e.x, e.y, e.z, 26, [0.6, 1.4, 2.0], 22, { nx: e.nx, ny: e.ny, nz: e.nz });
        add.emit({ x: e.x, y: e.y, z: e.z, life: 0.18, s0: 2, s1: 3.5, c0: [0.8, 1.6, 2.2, 1], c1: [0.2, 0.6, 1, 0], frame: 0 });
        ring(e.x, e.y, e.z, 3.2, [0.6, 1.5, 2.2], 0.3);
        flashLight(e.x, e.y + 0.4, e.z, "#7fd8ff", 30, 0.2, 18);
        if (!onTank) {
          scorch(e.x, e.y, e.z, e.nx, e.ny, e.nz, 1.6);
          dust(e.x, e.y, e.z, 5, surfaceCol, { v: 4, s1: 2.5 });
        }
        return;
      }
      if (e.kind === "burst" || e.kind === "clip") {
        sparks(e.x, e.y, e.z, onTank ? 10 : 6, [1.6, 1.1, 0.5], 12, { nx: e.nx, ny: e.ny, nz: e.nz });
        add.emit({ x: e.x, y: e.y, z: e.z, life: 0.12, s0: 1.2, s1: 2.2, c0: [1.8, 1.2, 0.6, 1], c1: C(col, 0), frame: 0 });
        if (!onTank) dust(e.x, e.y, e.z, 4, surfaceCol, { v: 3, up: 2, s0: 0.6, s1: 2.4, life: 1.0, a: 0.5 });
        else smoke(e.x, e.y, e.z, 1, { s0: 0.6, s1: 2, life: 0.8, a: 0.4 });
        if (e.kind === "clip" && !onTank) scorch(e.x, e.y, e.z, e.nx, e.ny, e.nz, 0.9);
        return;
      }
      // shells / HE / artillery strikes
      const S = big ? 1.8 : med ? 1.15 : 0.9;
      fire(e.x, e.y + 0.4, e.z, big ? 14 : 8, 2.2 * S, { v: 6 * S, vUp: 7 * S, life: 0.55 });
      add.emit({ x: e.x, y: e.y + 0.5, z: e.z, life: 0.16, s0: 4 * S, s1: 7 * S, c0: [2.2, 1.6, 0.9, 1], c1: [1, 0.4, 0.1, 0], frame: 0 });
      sparks(e.x, e.y + 0.3, e.z, big ? 30 : 16, [1.7, 1.1, 0.45], 16 * S, { nx: e.nx, ny: e.ny, nz: e.nz });
      smoke(e.x, e.y, e.z, big ? 7 : 5, { s0: 2 * S, s1: 6.5 * S, life: big ? 4 : 2.8, up: 2.2, v: 3.5 * S, a: 0.5, shade: 0.2 });
      ring(e.x, e.y + 0.2, e.z, 7 * S, [1.4, 1.0, 0.6], 0.4);
      flashLight(e.x, e.y + 1.2, e.z, "#ffa050", 70 * S, 0.3, 24 * S);
      if (!onTank) {
        dust(e.x, e.y, e.z, big ? 14 : 8, surfaceCol, { v: 7 * S, up: 3, s0: 1.5 * S, s1: 5 * S, life: 2.2, a: 0.55 });
        scorch(e.x, e.y, e.z, e.nx, e.ny, e.nz, (big ? 5.5 : 3) * (0.8 + R() * 0.4));
        debrisBurst(e.x, e.y, e.z, big ? 6 : 3, 8 * S);
      }
    },
    tankExplosion(x, y, z) {
      fire(x, y + 1.2, z, 26, 3.6, { v: 9, vUp: 11, life: 0.8 });
      add.emit({ x, y: y + 1.5, z, life: 0.25, s0: 8, s1: 14, c0: [2.4, 1.7, 1.0, 1], c1: [1, 0.3, 0.05, 0], frame: 0 });
      sparks(x, y + 1.2, z, 50, [1.8, 1.2, 0.5], 22);
      smoke(x, y + 1, z, 16, { s0: 3, s1: 11, life: 6, up: 3, v: 4, a: 0.7, shade: 0.12 });
      ring(x, y + 0.4, z, 16, [1.6, 1.0, 0.5], 0.55);
      debrisBurst(x, y + 1, z, 16, 13);
      flashLight(x, y + 2, z, "#ff9040", 160, 0.55, 40);
      scorch(x, y + 0.05, z, 0, 1, 0, 9);
    },
    inferno(x, y, z) {
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * 6.28;
        add.emit({ x: x + Math.cos(a) * 1.5, y: y + 0.3, z: z + Math.sin(a) * 1.5, vx: Math.cos(a) * 17, vy: 1 + R() * 2, vz: Math.sin(a) * 17, life: 0.55, s0: 1.6, s1: 4.2, c0: [1.8, 0.9, 0.3, 1], c1: [1, 0.25, 0.05, 0], drag: 2.2, frame: 2 });
      }
      ring(x, y + 0.3, z, 22, [1.8, 0.8, 0.3], 0.55);
      flashLight(x, y + 2, z, "#ff7a2a", 120, 0.5, 30);
    },
    shieldHit(x, y, z) {
      add.emit({ x, y, z, life: 0.25, s0: 1.8, s1: 3.2, c0: [0.5, 1.6, 1.4, 0.9], c1: [0.2, 0.8, 1, 0], frame: 6 });
      sparks(x, y, z, 8, [0.5, 1.6, 1.4], 8);
    },
    deflect(x, y, z) {
      sparks(x, y, z, 10, [1.6, 1.4, 1.0], 12);
    },
    flame(x, y, z, vx, vy, vz, rad, age) {
      const t = Math.min(1, age / 0.7);
      add.emit({ x, y, z, vx: vx * 0.3, vy: vy * 0.3 + 1, vz: vz * 0.3, life: 0.16, s0: 0.6 + rad * 1.2, s1: 0.9 + rad * 1.6, c0: [1.8 - t * 0.4, 0.9 - t * 0.4, 0.35 - t * 0.2, 0.75], c1: [0.9, 0.2, 0.05, 0], drag: 1, frame: 2 });
      if (R() < 0.12) smoke(x, y + 0.5, z, 1, { s0: 1, s1: 3, life: 1.2, a: 0.25, shade: 0.2 });
    },
    flameHit(x, y, z) {
      fire(x, y, z, 2, 1.4, { v: 3, vUp: 3, life: 0.4 });
    },
    trail(x, y, z, kind) {
      if (kind === "plasma") add.emit({ x, y, z, life: 0.22, s0: 0.9, s1: 0.2, c0: [1.0, 0.5, 1.8, 0.8], c1: [0.5, 0.2, 1, 0], frame: 0 });
      else if (kind === "rail") add.emit({ x, y, z, life: 0.5, s0: 0.5, s1: 1.4, c0: [0.4, 1.0, 1.6, 0.6], c1: [0.2, 0.5, 1, 0], frame: 0, rv: 0 });
      else if (kind === "he" || kind === "shell" || kind === "strike") alpha.emit({ x, y, z, vx: (R() - 0.5) * 0.4, vy: 0.3, vz: (R() - 0.5) * 0.4, life: 0.8, s0: 0.35, s1: 1.4, c0: [0.75, 0.73, 0.7, 0.35], c1: [0.8, 0.8, 0.8, 0], frame: 1, drag: 1 });
    },
    trackDust(x, y, z, surf, speed, vx, vz) {
      const col = SURF_DUST[surf] || SURF_DUST.dirt;
      if (surf === "asphalt" || surf === "metal" || surf === "concrete") {
        if (R() < 0.35) dust(x, y, z, 1, col, { v: 0.6, up: 0.3, s0: 0.6, s1: 1.8, life: 0.9, a: 0.18, vx: vx * 0.2, vz: vz * 0.2 });
        return;
      }
      const a = surf === "water" ? 0.45 : surf === "snow" ? 0.55 : 0.32;
      dust(x, y, z, 1, col, { v: 0.8 + speed * 0.08, up: surf === "snow" || surf === "water" ? 1.6 : 0.6, s0: 0.7, s1: 2.4 + speed * 0.12, life: surf === "water" ? 0.7 : 1.4, a, vx: vx * 0.25, vz: vz * 0.25, grav: surf === "water" ? 3 : -0.2 });
    },
    damageSmoke(x, y, z, heavy) {
      smoke(x, y, z, 1, { s0: 0.8, s1: heavy ? 4 : 2.8, life: heavy ? 2.6 : 2, up: 2.4, v: 0.6, a: heavy ? 0.6 : 0.4, shade: heavy ? 0.1 : 0.3, spread: 0.4 });
      if (heavy && R() < 0.5) fire(x, y, z, 1, 0.9, { v: 0.8, vUp: 2.5, life: 0.4 });
    },
    nitro(x, y, z, dx, dz) {
      add.emit({ x, y, z, vx: -dx * 6, vy: 0.5, vz: -dz * 6, life: 0.18, s0: 0.5, s1: 1.1, c0: [0.6, 1.0, 2.0, 0.9], c1: [0.2, 0.4, 1, 0], frame: 2 });
    },
    marker(x, y, z, life = 1.4) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), markerMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y + 0.2, z);
      m.renderOrder = 3;
      scene.add(m);
      markers.push({ m, t: 0, life });
    },
    /** projectiles → tracer instances (called every frame with interpolation) */
    tracers(list, alphaT) {
      let n = 0;
      for (const p of list) {
        if (!p.active || n >= TR_MAX) continue;
        if (p.kind === "flame") continue;
        const x = p.px + (p.x - p.px) * alphaT;
        const y = p.py + (p.y - p.py) * alphaT;
        const z = p.pz + (p.z - p.pz) * alphaT;
        const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
        _v.set(p.vx / sp, p.vy / sp, p.vz / sp);
        _q.setFromUnitVectors(_z, _v);
        const len = p.kind === "rail" ? 9 : p.kind === "plasma" ? 1.2 : p.kind === "burst" || p.kind === "clip" ? 2.4 : 3.2;
        const rad = p.kind === "rail" ? 0.14 : p.kind === "plasma" ? 0.45 : p.kind === "he" || p.kind === "strike" ? 0.16 : 0.1;
        _s.set(rad, rad, len);
        _m.compose(_v.set(x - (p.vx / sp) * len * 0.5, y - (p.vy / sp) * len * 0.5, z - (p.vz / sp) * len * 0.5), _q, _s);
        tracers.setMatrixAt(n, _m);
        const c = KIND_COL[p.kind] || KIND_COL.shell;
        const k = p.kind === "plasma" ? 3 : 2.6;
        tracers.instanceColor.setXYZ(n, c[0] * k, c[1] * k, c[2] * k);
        n++;
      }
      tracers.count = n;
      tracers.instanceMatrix.needsUpdate = true;
      tracers.instanceColor.needsUpdate = true;
    },
    update(dt, cam) {
      add.update(dt);
      alpha.update(dt);
      // debris
      let dn = 0;
      for (const d of dbS) {
        if (!d.on) continue;
        d.t += dt;
        d.vy -= 22 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        d.r += d.rv * dt;
        if (d.y < d.ground) {
          d.y = d.ground;
          d.vy *= -0.3;
          d.vx *= 0.5;
          d.vz *= 0.5;
          d.rv *= 0.5;
        }
        if (d.t > 3.5) {
          d.on = false;
          continue;
        }
        _q.setFromAxisAngle(_v.set(0.6, 0.8, 0).normalize(), d.r);
        const s = d.s * Math.min(1, (3.5 - d.t) * 2);
        _m.compose(_v.set(d.x, d.y, d.z), _q, _s.set(s, s, s));
        debris.setMatrixAt(dn++, _m);
      }
      debris.count = dn;
      debris.instanceMatrix.needsUpdate = true;
      // decals fade
      for (const D of decals) {
        if (!D.mesh.visible) continue;
        D.t += dt;
        if (D.t > D.life) D.mesh.visible = false;
        else if (D.t > D.life - 4) D.mesh.material.opacity = 0.85 * ((D.life - D.t) / 4);
      }
      for (let i = markers.length - 1; i >= 0; i--) {
        const k = markers[i];
        k.t += dt;
        k.m.material.opacity = 0.7 * (0.6 + 0.4 * Math.sin(k.t * 18));
        k.m.rotation.z += dt * 2;
        if (k.t > k.life) {
          scene.remove(k.m);
          k.m.geometry.dispose();
          markers.splice(i, 1);
        }
      }
      for (const L of lights) {
        if (L.i0 <= 0) continue;
        L.t += dt;
        const k = 1 - L.t / L.life;
        L.l.intensity = k > 0 ? L.i0 * k * k : 0;
        if (k <= 0) L.i0 = 0;
      }
      if (weather && cam) weather.update(dt, cam);
    },
    clear() {
      add.clear();
      alpha.clear();
      for (const d of dbS) d.on = false;
      debris.count = 0;
      for (const D of decals) D.mesh.visible = false;
      for (const k of markers) {
        scene.remove(k.m);
        k.m.geometry.dispose();
      }
      markers.length = 0;
      tracers.count = 0;
      for (const L of lights) {
        L.i0 = 0;
        L.l.intensity = 0;
      }
    },
    surfaceColor: (s) => SURF_DUST[s] || SURF_DUST.dirt,
    dispose() {
      api.clear();
      setWeather(null);
      add.dispose();
      alpha.dispose();
      scene.remove(add.mesh, alpha.mesh, tracers, debris);
      trGeo.dispose();
      trMat.dispose();
      dbGeo.dispose();
      dbMat.dispose();
      decGeo.dispose();
      for (const D of decals) {
        scene.remove(D.mesh);
        D.mesh.material.dispose();
      }
      markerMat.dispose();
      for (const L of lights) scene.remove(L.l);
    },
  };
  return api;
}
