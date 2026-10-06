/**
 * Rooftop Dash — particles, dash trail and speed streaks.
 *
 * One pooled THREE.Points system (fixed-size buffers, no per-frame
 * allocation): dust puffs, wall-run grit, star bursts, confetti, steam,
 * sparks. A ribbon trail follows the runner's hips during dash / sprint
 * (colour = the selected trail cosmetic). Speed streaks are thin lines
 * around the camera while moving fast (off with Motion Effects / Reduced
 * Motion).
 */
import * as THREE from "three";

export const TRAILS = [
  { id: "wind", name: "Classic Wind", stars: 0, color: "#ffffff", color2: "#cfe8ff" },
  { id: "blue", name: "Blue Streak", stars: 15, color: "#4fc3ff", color2: "#2b6dff" },
  { id: "sunset", name: "Sunset Trail", stars: 35, color: "#ffb347", color2: "#ff5e62" },
  { id: "emerald", name: "Emerald Trail", stars: 70, color: "#3ee0a0", color2: "#0c9c6a" },
  { id: "spark", name: "Night Spark", stars: 105, color: "#c58bff", color2: "#ff4fa3" },
];
export const trailById = (id) => TRAILS.find((t) => t.id === id) || TRAILS[0];

const POOL = { low: 260, medium: 640, high: 1100 };

export function createEffects(scene, { quality = "medium", trail = "wind", motion = true } = {}) {
  const N = POOL[quality] || POOL.medium;
  const scale = quality === "low" ? 0.45 : quality === "high" ? 1 : 0.75;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const alpha = new Float32Array(N);
  const size = new Float32Array(N);
  const vel = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const maxLife = new Float32Array(N);
  const grav = new Float32Array(N);
  const grow = new Float32Array(N);
  const drag = new Float32Array(N);
  let next = 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("psize", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: 300 } },
    vertexShader: `attribute float alpha; attribute float psize; attribute vec3 color; varying float vA; varying vec3 vC; uniform float uScale;
void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = smoothstep(0.5, 0.15, r) * vA; gl_FragColor = vec4(vC, a); }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);
  const c = new THREE.Color();

  function spawn(x, y, z, vx, vy, vz, color, sz, lt, g = 0, gr = 0, dr = 0) {
    const i = next;
    next = (next + 1) % N;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    vel[i * 3] = vx;
    vel[i * 3 + 1] = vy;
    vel[i * 3 + 2] = vz;
    c.set(color);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    size[i] = sz;
    life[i] = lt;
    maxLife[i] = lt;
    grav[i] = g;
    grow[i] = gr;
    drag[i] = dr;
    alpha[i] = 1;
  }
  const R = Math.random;
  const api = {
    dust(x, y, z, n = 8, color = "#d8cbb8", power = 1) {
      n = Math.max(1, Math.round(n * scale));
      for (let k = 0; k < n; k++) {
        const a = R() * Math.PI * 2;
        const s = (0.8 + R() * 1.6) * power;
        spawn(x + Math.cos(a) * 0.2, y + 0.05, z + Math.sin(a) * 0.2, Math.cos(a) * s, 0.4 + R() * 0.8 * power, Math.sin(a) * s, color, 0.28 + R() * 0.25, 0.45 + R() * 0.35, -1.2, 0.9, 3);
      }
    },
    grit(x, y, z, nx, nz, n = 2, color = "#cdbca5") {
      n = Math.max(1, Math.round(n * scale));
      for (let k = 0; k < n; k++) spawn(x, y + R() * 0.3, z, nx * (0.6 + R()) + (R() - 0.5), 0.4 + R(), nz * (0.6 + R()) + (R() - 0.5), color, 0.12 + R() * 0.1, 0.35, -6, 0.2, 1);
    },
    burst(x, y, z, color = "#ffd166", n = 26) {
      n = Math.max(6, Math.round(n * scale));
      for (let k = 0; k < n; k++) {
        const a = R() * Math.PI * 2;
        const b = (R() - 0.5) * Math.PI;
        const s = 2 + R() * 4;
        spawn(x, y, z, Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s + 1.5, Math.sin(a) * Math.cos(b) * s, k % 3 ? color : "#ffffff", 0.16 + R() * 0.14, 0.6 + R() * 0.4, -4, -0.1, 2.5);
      }
    },
    confetti(x, y, z, n = 90) {
      n = Math.max(20, Math.round(n * scale));
      const cols = ["#ff8a3d", "#ffd166", "#4fc3ff", "#ef476f", "#06d6a0", "#ffffff"];
      for (let k = 0; k < n; k++) {
        const a = R() * Math.PI * 2;
        const s = 1 + R() * 4;
        spawn(x, y + 1.5, z, Math.cos(a) * s, 5 + R() * 6, Math.sin(a) * s, cols[k % cols.length], 0.14 + R() * 0.1, 2 + R() * 1.2, -6, 0, 1.2);
      }
    },
    steam(x, y, z, strong = false) {
      if (R() > scale + 0.2) return;
      spawn(x + (R() - 0.5) * 0.4, y + 0.2, z + (R() - 0.5) * 0.4, (R() - 0.5) * 0.6, strong ? 4 + R() * 3 : 0.8 + R() * 0.8, (R() - 0.5) * 0.6, strong ? "#f2f2f2" : "#cfd3d6", strong ? 0.7 : 0.35, strong ? 0.8 : 1.2, 0.5, strong ? 2.2 : 1.1, 1.5);
    },
    spark(x, y, z, color = "#9fe8ff", n = 4) {
      n = Math.max(1, Math.round(n * scale));
      for (let k = 0; k < n; k++) spawn(x, y, z, (R() - 0.5) * 6, R() * 4, (R() - 0.5) * 6, color, 0.1 + R() * 0.08, 0.25 + R() * 0.2, -9, -0.2, 0.5);
    },
    wind(x, y, z, dx, dz) {
      if (R() > scale) return;
      spawn(x + (R() - 0.5) * 2.5, y + R() * 2.5, z + (R() - 0.5) * 2.5, dx * 9, (R() - 0.5) * 0.4, dz * 9, "#e8f4ff", 0.09, 0.45, 0, 0, 0);
    },
    smoke(x, y, z, color) {
      if (R() > scale + 0.3) return;
      spawn(x + (R() - 0.5) * 1.2, y, z + (R() - 0.5) * 1.2, (R() - 0.5) * 0.5, 1.6 + R() * 1.2, (R() - 0.5) * 0.5, color, 0.9, 2.2, 0.2, 1.4, 0.6);
    },
  };

  /* ---------------- ribbon trail */
  const TN = 26;
  const tPos = new Float32Array(TN * 2 * 3);
  const tAlpha = new Float32Array(TN * 2);
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute("position", new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage));
  tGeo.setAttribute("ta", new THREE.BufferAttribute(tAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let i = 0; i < TN - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  tGeo.setIndex(idx);
  const tr = trailById(trail);
  const tMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uC1: { value: new THREE.Color(tr.color) }, uC2: { value: new THREE.Color(tr.color2) }, uO: { value: 0 } },
    vertexShader: `attribute float ta; varying float vT; void main(){ vT = ta; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uC1; uniform vec3 uC2; uniform float uO; varying float vT; void main(){ gl_FragColor = vec4(mix(uC2, uC1, vT), vT * vT * uO); }`,
  });
  const ribbon = new THREE.Mesh(tGeo, tMat);
  ribbon.frustumCulled = false;
  ribbon.renderOrder = 6;
  scene.add(ribbon);
  const hist = [];
  for (let i = 0; i < TN; i++) hist.push(new THREE.Vector3());
  let histInit = false;
  let trailO = 0;

  /* ---------------- speed streaks */
  const SN = motion ? (quality === "low" ? 10 : 24) : 0;
  const sPos = new Float32Array(Math.max(1, SN) * 2 * 3);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  const sMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const streaks = new THREE.LineSegments(sGeo, sMat);
  streaks.frustumCulled = false;
  scene.add(streaks);
  const sSeeds = Array.from({ length: SN }, () => [R() * Math.PI * 2, 1.2 + R() * 2.2, R() * 10, R()]);

  let t = 0;
  api.update = (dt, ctx) => {
    t += dt;
    // particles
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) {
        if (alpha[i] !== 0) alpha[i] = 0;
        continue;
      }
      life[i] -= dt;
      const k = Math.max(0, 1 - drag[i] * dt);
      vel[i * 3] *= k;
      vel[i * 3 + 1] = vel[i * 3 + 1] * k + grav[i] * dt;
      vel[i * 3 + 2] *= k;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      size[i] = Math.max(0.01, size[i] + grow[i] * dt);
      const u = life[i] / maxLife[i];
      alpha[i] = Math.min(1, u * 2.2) * 0.9;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
    geo.attributes.psize.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    mat.uniforms.uScale.value = ctx.pxScale || 300;

    // trail: sample the hips
    const hp = ctx.hip;
    if (hp) {
      if (!histInit || ctx.snap) {
        for (const h of hist) h.copy(hp);
        histInit = true;
      }
      for (let i = TN - 1; i > 0; i--) hist[i].copy(hist[i - 1]);
      hist[0].copy(hp);
      const want = ctx.trail ? 1 : 0;
      trailO += (want - trailO) * (1 - Math.exp(-(want ? 18 : 6) * dt));
      tMat.uniforms.uO.value = trailO * 0.42;
      ribbon.visible = trailO > 0.01;
      if (ribbon.visible) {
        const cam = ctx.camera.position;
        for (let i = 0; i < TN; i++) {
          const p = hist[i];
          const q = hist[Math.min(TN - 1, i + 1)];
          // ribbon width perpendicular to the segment and the view
          let dx = q.x - p.x;
          let dy = q.y - p.y;
          let dz = q.z - p.z;
          const vx = cam.x - p.x;
          const vy = cam.y - p.y;
          const vz = cam.z - p.z;
          let nx = dy * vz - dz * vy;
          let ny = dz * vx - dx * vz;
          let nz = dx * vy - dy * vx;
          const nl = Math.hypot(nx, ny, nz) || 1;
          const w = 0.16 * (1 - i / TN);
          nx = (nx / nl) * w;
          ny = (ny / nl) * w;
          nz = (nz / nl) * w;
          const o = i * 6;
          tPos[o] = p.x + nx;
          tPos[o + 1] = p.y + ny;
          tPos[o + 2] = p.z + nz;
          tPos[o + 3] = p.x - nx;
          tPos[o + 4] = p.y - ny;
          tPos[o + 5] = p.z - nz;
          const a = 1 - i / (TN - 1);
          tAlpha[i * 2] = a;
          tAlpha[i * 2 + 1] = a;
        }
        tGeo.attributes.position.needsUpdate = true;
        tGeo.attributes.ta.needsUpdate = true;
      }
    }

    // speed streaks around the camera
    if (SN) {
      const k = ctx.speedK || 0;
      sMat.opacity += (k * 0.35 - sMat.opacity) * (1 - Math.exp(-6 * dt));
      streaks.visible = sMat.opacity > 0.01;
      if (streaks.visible) {
        const cam = ctx.camera;
        const fwd = ctx.fwd;
        const up = cam.up;
        const right = ctx.right;
        for (let i = 0; i < SN; i++) {
          const s = sSeeds[i];
          const ph = (t * (2.2 + s[3] * 1.5) + s[2]) % 1;
          const a = s[0];
          const r = s[1];
          const ox = Math.cos(a) * r;
          const oy = Math.sin(a) * r * 0.6;
          const d = 9 - ph * 9;
          const bx = cam.position.x + fwd.x * d + right.x * ox + up.x * oy;
          const by = cam.position.y + fwd.y * d + right.y * ox + up.y * oy;
          const bz = cam.position.z + fwd.z * d + right.z * ox + up.z * oy;
          const L = 0.6 + k * 1.4;
          const o = i * 6;
          sPos[o] = bx;
          sPos[o + 1] = by;
          sPos[o + 2] = bz;
          sPos[o + 3] = bx - fwd.x * L;
          sPos[o + 4] = by - fwd.y * L;
          sPos[o + 5] = bz - fwd.z * L;
        }
        sGeo.attributes.position.needsUpdate = true;
      }
    }
  };
  api.setTrail = (id) => {
    const tt = trailById(id);
    tMat.uniforms.uC1.value.set(tt.color);
    tMat.uniforms.uC2.value.set(tt.color2);
  };
  api.clear = () => {
    life.fill(0);
    alpha.fill(0);
    histInit = false;
    trailO = 0;
  };
  api.dispose = () => {
    scene.remove(points);
    scene.remove(ribbon);
    scene.remove(streaks);
    geo.dispose();
    mat.dispose();
    tGeo.dispose();
    tMat.dispose();
    sGeo.dispose();
    sMat.dispose();
  };
  return api;
}
