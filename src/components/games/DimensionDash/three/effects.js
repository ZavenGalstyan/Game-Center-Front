/**
 * Dimension Dash — particles, speed trail, homing reticle, power-up auras
 * and the little birds freed from defeated robots.
 *
 * Two pooled point systems (additive sparkles / alpha-blended dust) share one
 * shader with per-particle size, colour and fade. Nothing allocates per frame.
 */
import * as THREE from "three";

const VS = `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC;
void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
const FS = `varying float vA; varying vec3 vC; uniform float soft;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float a = vA * smoothstep(0.5, soft, d); gl_FragColor = vec4(vC, a); }`;

function pool(n, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const alpha = new Float32Array(n);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { soft: { value: additive ? 0.0 : 0.25 } },
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const P = [];
  for (let i = 0; i < n; i++) P.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, s0: 1, s1: 1, r: 1, gr: 1, b: 1 });
  let next = 0;
  return {
    pts,
    spawn(o) {
      const p = P[next];
      next = (next + 1) % n;
      Object.assign(p, { g: 0, drag: 0, ...o, life: o.max });
      return p;
    },
    update(dt) {
      for (let i = 0; i < n; i++) {
        const p = P[i];
        if (p.life <= 0) {
          alpha[i] = 0;
          size[i] = 0;
          continue;
        }
        p.life -= dt;
        const k = Math.max(0, p.life / p.max);
        p.vy -= p.g * dt;
        const dr = Math.max(0, 1 - p.drag * dt);
        p.vx *= dr;
        p.vy *= dr;
        p.vz *= dr;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r;
        col[i * 3 + 1] = p.gr;
        col[i * 3 + 2] = p.b;
        size[i] = p.s1 + (p.s0 - p.s1) * k;
        alpha[i] = (p.a ?? 1) * Math.min(1, k * 2.2);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

const C = new THREE.Color();
const rgb = (hex) => {
  C.set(hex);
  return { r: C.r, gr: C.g, b: C.b };
};

export function createEffects(scene, { reduced, dust = "#f2e6c8" } = {}) {
  const glow = pool(700, true);
  const soft = pool(500, false);
  scene.add(glow.pts);
  scene.add(soft.pts);
  const R = () => Math.random() - 0.5;
  const red = () => (reduced && reduced() ? 0.5 : 1);

  /* ---- trail ribbon */
  const TN = 26;
  const trailGeo = new THREE.BufferGeometry();
  const tpos = new Float32Array(TN * 2 * 3);
  const tcol = new Float32Array(TN * 2 * 4);
  trailGeo.setAttribute("position", new THREE.BufferAttribute(tpos, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeo.setAttribute("color", new THREE.BufferAttribute(tcol, 4).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let i = 0; i < TN - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  trailGeo.setIndex(idx);
  const trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  scene.add(trail);
  const hist = [];
  let trailK = 0;

  /* ---- reticle, shield bubble, magnet ring */
  const retGeo = new THREE.RingGeometry(0.9, 1.1, 4, 1);
  const retMat = new THREE.MeshBasicMaterial({ color: "#ffe14a", transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide });
  const reticle = new THREE.Group();
  const r1 = new THREE.Mesh(retGeo, retMat);
  const r2 = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.45, 32, 1), retMat);
  reticle.add(r1);
  reticle.add(r2);
  reticle.renderOrder = 10;
  reticle.visible = false;
  scene.add(reticle);
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: "#5ad8ff", transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  bubble.visible = false;
  scene.add(bubble);
  const magRing = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.04, 6, 40), new THREE.MeshBasicMaterial({ color: "#ffd23a", transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  magRing.visible = false;
  scene.add(magRing);

  /* ---- freed birds */
  const birdGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const wingGeo = new THREE.BoxGeometry(0.34, 0.03, 0.12);
  const birdMats = ["#4fa2ff", "#ff7a3a", "#ffd23a", "#ff5ab4"].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
  const birds = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(birdGeo, birdMats[i % 4]);
    g.add(b);
    const wl = new THREE.Mesh(wingGeo, birdMats[i % 4]);
    wl.position.x = 0.17;
    const wr = new THREE.Mesh(wingGeo, birdMats[i % 4]);
    wr.position.x = -0.17;
    g.add(wl);
    g.add(wr);
    g.visible = false;
    scene.add(g);
    birds.push({ g, wl, wr, t: 0, on: false, vx: 0, vz: 0 });
  }
  let birdNext = 0;

  function burst(kind, x, y, z, o = {}) {
    const k = red();
    switch (kind) {
      case "ring":
        for (let i = 0; i < 6 * k; i++) glow.spawn({ x, y, z, vx: R() * 4, vy: 2 + Math.random() * 3, vz: R() * 4, max: 0.45, s0: 0.5, s1: 0.05, ...rgb(i % 2 ? "#fff4a0" : "#ffcc22"), drag: 3 });
        break;
      case "dust": {
        const c = rgb(o.color || dust);
        for (let i = 0; i < (o.n || 6) * k; i++) soft.spawn({ x: x + R() * 0.6, y: y + 0.1, z: z + R() * 0.6, vx: R() * (o.spd || 2.4), vy: 0.6 + Math.random() * 1.2, vz: R() * (o.spd || 2.4), max: 0.55 + Math.random() * 0.3, s0: 0.35, s1: o.size || 1.0, ...c, a: 0.55, drag: 2.5 });
        break;
      }
      case "explode":
        for (let i = 0; i < 16 * k; i++) glow.spawn({ x, y, z, vx: R() * 10, vy: R() * 10 + 2, vz: R() * 10, max: 0.5, s0: 0.9, s1: 0.1, ...rgb(i % 3 ? "#ffb02a" : "#fff2a0"), drag: 4, g: 6 });
        for (let i = 0; i < 8 * k; i++) soft.spawn({ x: x + R(), y: y + R(), z: z + R(), vx: R() * 3, vy: 1.5 + Math.random() * 2, vz: R() * 3, max: 0.9, s0: 0.5, s1: 1.8, ...rgb("#5a5a66"), a: 0.6, drag: 2 });
        break;
      case "sparks":
        for (let i = 0; i < (o.n || 3) * k; i++) glow.spawn({ x, y, z, vx: (o.vx || 0) * -0.2 + R() * 4, vy: 1 + Math.random() * 3, vz: (o.vz || 0) * -0.2 + R() * 4, max: 0.25, s0: 0.28, s1: 0.04, ...rgb(i % 2 ? "#ffe27a" : "#ffffff"), g: 18 });
        break;
      case "star":
        for (let i = 0; i < 26 * k; i++) {
          const a = (i / 26) * Math.PI * 2;
          glow.spawn({ x, y, z, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7, vz: R() * 3, max: 0.8, s0: 0.7, s1: 0.05, ...rgb(i % 2 ? "#ff2a3a" : "#ffd23a"), drag: 2.5 });
        }
        break;
      case "confetti":
        for (let i = 0; i < 60 * k; i++) glow.spawn({ x: x + R() * 2, y: y + 2, z: z + R() * 2, vx: R() * 9, vy: 4 + Math.random() * 8, vz: R() * 9, max: 1.6, s0: 0.5, s1: 0.3, ...rgb(["#ff3d6e", "#ffd23a", "#3df5ff", "#7bff6a", "#a46bff"][i % 5]), g: 9, drag: 1.2 });
        break;
      case "shield":
        for (let i = 0; i < 18 * k; i++) glow.spawn({ x, y, z, vx: R() * 8, vy: R() * 8, vz: R() * 8, max: 0.5, s0: 0.5, s1: 0.05, ...rgb("#5ad8ff"), drag: 3 });
        break;
      case "puff":
        for (let i = 0; i < 10 * k; i++) {
          const a = (i / 10) * Math.PI * 2;
          soft.spawn({ x, y, z, vx: Math.cos(a) * 4, vy: 0.4, vz: Math.sin(a) * 4, max: 0.4, s0: 0.4, s1: 1.1, ...rgb("#ffffff"), a: 0.6, drag: 5 });
        }
        break;
      case "homing":
        for (let i = 0; i < 4 * k; i++) glow.spawn({ x: x + R() * 0.4, y: y + R() * 0.4, z: z + R() * 0.4, vx: R(), vy: R(), vz: R(), max: 0.3, s0: 0.6, s1: 0.1, ...rgb("#7dd8ff") });
        break;
      case "boost":
        for (let i = 0; i < 8 * k; i++) glow.spawn({ x: x + R() * 1.4, y: y + 0.2, z: z + R() * 1.4, vx: R() * 2, vy: 2 + Math.random() * 3, vz: R() * 2, max: 0.4, s0: 0.45, s1: 0.05, ...rgb("#ffb02a") });
        break;
      case "charge":
        for (let i = 0; i < 2 * k; i++) soft.spawn({ x: x - (o.fx || 0) * 0.5 + R() * 0.3, y: y + 0.1, z: z - (o.fz || 0) * 0.5 + R() * 0.3, vx: -(o.fx || 0) * 5 + R() * 2, vy: 0.5 + Math.random(), vz: -(o.fz || 0) * 5 + R() * 2, max: 0.4, s0: 0.3, s1: 0.8, ...rgb(o.color || dust), a: 0.6, drag: 3 });
        glow.spawn({ x: x + R() * 0.6, y: y + 0.4 + R() * 0.6, z: z + R() * 0.6, vx: 0, vy: 0, vz: 0, max: 0.25, s0: 0.35, s1: 0.0, ...rgb("#9fd8ff") });
        break;
      case "sparkle":
        glow.spawn({ x: x + R() * 1.2, y: y + Math.random() * 1.4, z: z + R() * 1.2, vx: 0, vy: 0.6, vz: 0, max: 0.5, s0: 0.4, s1: 0.0, ...rgb(o.color || "#ffffff") });
        break;
      case "splash":
        for (let i = 0; i < 14 * k; i++) soft.spawn({ x, y, z, vx: R() * 5, vy: 3 + Math.random() * 5, vz: R() * 5, max: 0.7, s0: 0.4, s1: 0.2, ...rgb("#d8f4ff"), a: 0.8, g: 14 });
        break;
      default:
        break;
    }
  }

  function freeBird(x, y, z) {
    const b = birds[birdNext];
    birdNext = (birdNext + 1) % birds.length;
    b.on = true;
    b.t = 0;
    b.g.position.set(x, y, z);
    const a = Math.random() * Math.PI * 2;
    b.vx = Math.cos(a) * 3;
    b.vz = Math.sin(a) * 3;
    b.g.rotation.y = Math.atan2(b.vx, b.vz);
    b.g.visible = true;
  }

  /** per-frame: hero centre, speed state, power-ups, lock target */
  function update(dt, s, camera) {
    glow.update(dt);
    soft.update(dt);
    // trail
    const want = s.trail ? 1 : 0;
    trailK += (want - trailK) * Math.min(1, dt * 8);
    hist.unshift([s.x, s.y, s.z]);
    if (hist.length > TN) hist.length = TN;
    const camPos = camera.position;
    for (let i = 0; i < TN; i++) {
      const p = hist[Math.min(i, hist.length - 1)];
      const q = hist[Math.min(i + 1, hist.length - 1)];
      let tx = p[0] - q[0];
      let ty = p[1] - q[1];
      let tz = p[2] - q[2];
      const vx = camPos.x - p[0];
      const vy = camPos.y - p[1];
      const vz = camPos.z - p[2];
      // side = t × v
      let sx = ty * vz - tz * vy;
      let sy = tz * vx - tx * vz;
      let sz = tx * vy - ty * vx;
      const l = Math.hypot(sx, sy, sz) || 1;
      const w = 0.42 * (1 - i / TN) * trailK;
      sx = (sx / l) * w;
      sy = (sy / l) * w;
      sz = (sz / l) * w;
      tpos.set([p[0] + sx, p[1] + sy, p[2] + sz, p[0] - sx, p[1] - sy, p[2] - sz], i * 6);
      const a = (1 - i / TN) * 0.7 * trailK;
      const c = s.trailColor || [0.35, 0.65, 1];
      tcol.set([c[0], c[1], c[2], a, c[0], c[1], c[2], a], i * 8);
      void tx;
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;
    trail.visible = trailK > 0.02;

    // reticle on the homing target
    if (s.lock) {
      reticle.visible = true;
      reticle.position.set(s.lock.x, s.lock.y + (s.lock.hy || 0.5), s.lock.z);
      reticle.quaternion.copy(camera.quaternion);
      r1.rotation.z += dt * 3;
      const pulse = 0.85 + Math.sin(performance.now() * 0.012) * 0.12;
      reticle.scale.setScalar(pulse);
    } else reticle.visible = false;

    bubble.visible = !!s.shield;
    if (s.shield) {
      bubble.position.set(s.x, s.y, s.z);
      bubble.scale.setScalar(0.95 + Math.sin(performance.now() * 0.006) * 0.04);
    }
    magRing.visible = !!s.magnet;
    if (s.magnet) {
      magRing.position.set(s.x, s.y - 0.3, s.z);
      magRing.rotation.x = Math.PI / 2;
      magRing.rotation.z += dt * 4;
    }
    if (s.invincible && Math.random() < 0.6) burst("sparkle", s.x, s.y - 0.5, s.z, { color: ["#ffffff", "#ffd23a", "#7dfff0"][Math.floor(Math.random() * 3)] });

    for (const b of birds) {
      if (!b.on) continue;
      b.t += dt;
      b.g.position.x += b.vx * dt;
      b.g.position.z += b.vz * dt;
      b.g.position.y += (1.5 + b.t * 2) * dt;
      const f = Math.sin(b.t * 30) * 0.8;
      b.wl.rotation.z = f;
      b.wr.rotation.z = -f;
      if (b.t > 3) {
        b.on = false;
        b.g.visible = false;
      }
    }
  }

  function dispose() {
    scene.remove(glow.pts, soft.pts, trail, reticle, bubble, magRing);
    glow.dispose();
    soft.dispose();
    trailGeo.dispose();
    trailMat.dispose();
    retGeo.dispose();
    retMat.dispose();
    r2.geometry.dispose();
    bubble.geometry.dispose();
    bubble.material.dispose();
    magRing.geometry.dispose();
    magRing.material.dispose();
    birdGeo.dispose();
    wingGeo.dispose();
    for (const m of birdMats) m.dispose();
    for (const b of birds) scene.remove(b.g);
  }

  return { burst, freeBird, update, dispose };
}
