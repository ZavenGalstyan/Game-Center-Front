/**
 * Web Hero — effects. Everything is pooled (no per-frame allocation):
 *
 *  particles   one Points cloud (soft round sprites, per-particle colour /
 *              size / fade): hit sparks, dust, web bits, energy, heals …
 *  shockwaves  pooled flat rings (landing, slams, burst, storm)
 *  web line    the swing rope (a thin cylinder hand → anchor) + a sag-free
 *              "tension" flicker on attach
 *  trails      two ribbons behind the hands/feet while swinging fast
 *  projectiles web blobs (hero), bullets / bolts / knives (enemies)
 *  reticle     a subtle ring on the anchor the web WOULD attach to
 *  beacon      a light pillar on the current objective
 *  pickups     hero tokens, health orbs, intel chips, devices, protect target
 *  hazards     boss shock rings, telegraphed strike marks, laser beams
 */
import * as THREE from "three";
import { dot } from "./textures.js";

const MAXP = 2400;
const VS = `
attribute float size; attribute float alpha; attribute vec3 color;
varying float vA; varying vec3 vC;
void main() {
  vA = alpha; vC = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D map; varying float vA; varying vec3 vC;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vC, t.a * vA);
}`;

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export function createEffects(scene, { reduced, accent = "#19d6c8" }) {
  const own = [];
  const k = (x) => (own.push(x), x);

  /* ---------------- particles */
  const P = {
    pos: new Float32Array(MAXP * 3),
    col: new Float32Array(MAXP * 3),
    size: new Float32Array(MAXP),
    alpha: new Float32Array(MAXP),
    vel: new Float32Array(MAXP * 3),
    life: new Float32Array(MAXP),
    max: new Float32Array(MAXP),
    s0: new Float32Array(MAXP),
    grav: new Float32Array(MAXP),
    drag: new Float32Array(MAXP),
    n: 0,
    head: 0,
  };
  const pg = k(new THREE.BufferGeometry());
  pg.setAttribute("position", new THREE.BufferAttribute(P.pos, 3));
  pg.setAttribute("color", new THREE.BufferAttribute(P.col, 3));
  pg.setAttribute("size", new THREE.BufferAttribute(P.size, 1));
  pg.setAttribute("alpha", new THREE.BufferAttribute(P.alpha, 1));
  const addMat = k(new THREE.ShaderMaterial({ uniforms: { map: { value: dot() } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const points = new THREE.Points(pg, addMat);
  points.frustumCulled = false;
  scene.add(points);
  const pg2 = k(new THREE.BufferGeometry());
  const Q = { pos: new Float32Array(MAXP * 3), col: new Float32Array(MAXP * 3), size: new Float32Array(MAXP), alpha: new Float32Array(MAXP), vel: new Float32Array(MAXP * 3), life: new Float32Array(MAXP), max: new Float32Array(MAXP), s0: new Float32Array(MAXP), grav: new Float32Array(MAXP), drag: new Float32Array(MAXP), head: 0 };
  pg2.setAttribute("position", new THREE.BufferAttribute(Q.pos, 3));
  pg2.setAttribute("color", new THREE.BufferAttribute(Q.col, 3));
  pg2.setAttribute("size", new THREE.BufferAttribute(Q.size, 1));
  pg2.setAttribute("alpha", new THREE.BufferAttribute(Q.alpha, 1));
  const normMat = k(new THREE.ShaderMaterial({ uniforms: { map: { value: dot() } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false }));
  const points2 = new THREE.Points(pg2, normMat);
  points2.frustumCulled = false;
  scene.add(points2);

  function emit(B, x, y, z, vx, vy, vz, col, size, life, grav = 0, drag = 1) {
    const i = B.head;
    B.head = (B.head + 1) % MAXP;
    B.pos[i * 3] = x;
    B.pos[i * 3 + 1] = y;
    B.pos[i * 3 + 2] = z;
    B.vel[i * 3] = vx;
    B.vel[i * 3 + 1] = vy;
    B.vel[i * 3 + 2] = vz;
    _c.set(col);
    B.col[i * 3] = _c.r;
    B.col[i * 3 + 1] = _c.g;
    B.col[i * 3 + 2] = _c.b;
    B.size[i] = size;
    B.s0[i] = size;
    B.life[i] = life;
    B.max[i] = life;
    B.alpha[i] = 1;
    B.grav[i] = grav;
    B.drag[i] = drag;
  }
  const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

  /** named bursts */
  function burst(kind, x, y, z, o = {}) {
    const scale = reduced() ? 0.5 : 1;
    const n = Math.max(1, Math.round((o.n || 10) * scale));
    switch (kind) {
      case "hit":
        for (let i = 0; i < n; i++) emit(P, x, y, z, rnd(6), rnd(5) + 2, rnd(6), i % 3 ? "#fff3c0" : "#ffb02a", 0.35 + Math.random() * 0.3, 0.25 + Math.random() * 0.2, 6, 0.9);
        emit(P, x, y, z, 0, 0, 0, "#ffffff", o.heavy ? 2.6 : 1.6, 0.12);
        break;
      case "spark":
        for (let i = 0; i < n; i++) emit(P, x, y, z, rnd(5), rnd(4) + 2, rnd(5), "#9fe8ff", 0.25, 0.3, 8);
        break;
      case "dust":
        for (let i = 0; i < n; i++) emit(Q, x + rnd(0.4), y + 0.1, z + rnd(0.4), rnd(o.spd || 2.5), Math.random() * 1.2, rnd(o.spd || 2.5), o.col || "#d8d0c0", (o.size || 0.9) * (0.8 + Math.random() * 0.6), 0.6 + Math.random() * 0.5, -0.6, 0.92);
        break;
      case "web":
        for (let i = 0; i < n; i++) emit(Q, x, y, z, rnd(3), rnd(3), rnd(3), "#f4f8ff", 0.22 + Math.random() * 0.15, 0.4 + Math.random() * 0.3, 4, 0.9);
        break;
      case "energy":
        for (let i = 0; i < n; i++) emit(P, x + rnd(0.6), y + Math.random() * 1.6, z + rnd(0.6), rnd(1.2), 1.5 + Math.random() * 2, rnd(1.2), o.col || accent, 0.3, 0.6 + Math.random() * 0.4, -1, 0.95);
        break;
      case "heal":
        for (let i = 0; i < n; i++) emit(P, x + rnd(0.5), y + rnd(0.5), z + rnd(0.5), rnd(1), 2 + Math.random() * 2, rnd(1), "#4dff9a", 0.35, 0.8, -1, 0.95);
        break;
      case "token":
        for (let i = 0; i < n; i++) emit(P, x, y, z, rnd(4), rnd(4) + 1, rnd(4), i % 2 ? "#ffd84a" : "#fff6c0", 0.3, 0.6, 3, 0.94);
        break;
      case "smoke":
        for (let i = 0; i < n; i++) emit(Q, x + rnd(0.8), y + rnd(0.5), z + rnd(0.8), rnd(1.2), 1 + Math.random() * 1.6, rnd(1.2), o.col || "#3a3a40", 1.8 + Math.random(), 1.2 + Math.random() * 0.6, -0.4, 0.96);
        break;
      case "explosion":
        for (let i = 0; i < n; i++) emit(P, x, y, z, rnd(9), rnd(7) + 3, rnd(9), i % 3 ? "#ff9a2a" : "#fff0a0", 0.6 + Math.random() * 0.5, 0.4 + Math.random() * 0.3, 8, 0.9);
        burst("smoke", x, y, z, { n: 8 });
        break;
      case "zap":
        for (let i = 0; i < n; i++) emit(P, x + rnd(0.6), y + rnd(1), z + rnd(0.6), rnd(6), rnd(6), rnd(6), i % 2 ? "#fff36a" : "#7fd8ff", 0.22, 0.2, 0, 0.8);
        break;
      case "speed":
        emit(P, x + rnd(1.5), y + rnd(1.2), z + rnd(1.5), o.vx || 0, o.vy || 0, o.vz || 0, "#e8f6ff", 0.12, 0.25, 0, 1);
        break;
      default:
    }
  }
  function stepParticles(B, dt, geo) {
    for (let i = 0; i < MAXP; i++) {
      if (B.life[i] <= 0) {
        if (B.alpha[i] !== 0) B.alpha[i] = 0;
        continue;
      }
      B.life[i] -= dt;
      const d = Math.pow(B.drag[i], dt * 60);
      B.vel[i * 3] *= d;
      B.vel[i * 3 + 1] = B.vel[i * 3 + 1] * d - B.grav[i] * dt;
      B.vel[i * 3 + 2] *= d;
      B.pos[i * 3] += B.vel[i * 3] * dt;
      B.pos[i * 3 + 1] += B.vel[i * 3 + 1] * dt;
      B.pos[i * 3 + 2] += B.vel[i * 3 + 2] * dt;
      const u = Math.max(0, B.life[i] / B.max[i]);
      B.alpha[i] = u;
      B.size[i] = B.s0[i] * (0.6 + 0.4 * u);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
  }

  /* ---------------- shockwave rings */
  const ringGeo = k(new THREE.RingGeometry(0.85, 1, 48));
  const rings = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(ringGeo, k(new THREE.MeshBasicMaterial({ color: "#fff", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    rings.push({ m, t: 0, life: 0, r0: 0, r1: 0 });
  }
  let ringHead = 0;
  function shock(x, y, z, r1, col = "#ffffff", life = 0.45, r0 = 0.3) {
    const R = rings[ringHead];
    ringHead = (ringHead + 1) % rings.length;
    R.m.position.set(x, y + 0.06, z);
    R.m.material.color.set(col);
    R.t = 0;
    R.life = life;
    R.r0 = r0;
    R.r1 = r1;
    R.m.visible = true;
  }

  /* ---------------- web line (swing rope) */
  const ropeMat = k(new THREE.MeshBasicMaterial({ color: "#f2f6ff" }));
  const rope = new THREE.Mesh(k(new THREE.CylinderGeometry(0.022, 0.022, 1, 5, 1, true)), ropeMat);
  rope.visible = false;
  scene.add(rope);
  const anchorSplat = new THREE.Mesh(k(new THREE.CircleGeometry(0.45, 10)), k(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })));
  anchorSplat.visible = false;
  scene.add(anchorSplat);
  function setRope(on, hand, ax, ay, az, nx = 0, ny = 1, nz = 0) {
    rope.visible = on;
    anchorSplat.visible = on;
    if (!on) return;
    _a.copy(hand);
    _b.set(ax, ay, az);
    _v.subVectors(_b, _a);
    const len = _v.length();
    rope.position.copy(_a).addScaledVector(_v, 0.5);
    rope.scale.set(1, len, 1);
    _q.setFromUnitVectors(UP, _v.normalize());
    rope.quaternion.copy(_q);
    anchorSplat.position.set(ax + nx * 0.05, ay + ny * 0.05, az + nz * 0.05);
    _v.set(nx, ny, nz);
    if (_v.lengthSq() < 0.5) _v.set(0, 1, 0);
    anchorSplat.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _v);
  }
  // web shot strands (short-lived lines from the hand to a target)
  const strands = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(rope.geometry, k(new THREE.MeshBasicMaterial({ color: "#f2f6ff", transparent: true, opacity: 0 })));
    m.visible = false;
    scene.add(m);
    strands.push({ m, t: 0, life: 0 });
  }
  let strandHead = 0;
  function strand(from, tx, ty, tz, life = 0.25) {
    const S = strands[strandHead];
    strandHead = (strandHead + 1) % strands.length;
    _v.set(tx - from.x, ty - from.y, tz - from.z);
    const len = _v.length();
    S.m.position.set(from.x + _v.x / 2, from.y + _v.y / 2, from.z + _v.z / 2);
    S.m.scale.set(0.8, len, 0.8);
    S.m.quaternion.setFromUnitVectors(UP, _v.normalize());
    S.t = 0;
    S.life = life;
    S.m.visible = true;
  }

  /* ---------------- swing trails (two ribbons) */
  const TN = 26;
  function makeTrail(col) {
    const pos = new Float32Array(TN * 2 * 3);
    const al = new Float32Array(TN * 2);
    const g = k(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("alpha", new THREE.BufferAttribute(al, 1));
    const idx = [];
    for (let i = 0; i < TN - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    const m = new THREE.Mesh(
      g,
      k(
        new THREE.ShaderMaterial({
          uniforms: { col: { value: new THREE.Color(col) } },
          vertexShader: "attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
          fragmentShader: "uniform vec3 col; varying float vA; void main(){ gl_FragColor = vec4(col, vA); }",
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );
    m.frustumCulled = false;
    scene.add(m);
    return { m, pos, al, g, pts: [], col };
  }
  const trails = [makeTrail(accent), makeTrail("#ffffff")];
  function pushTrail(T, x, y, z, w, on) {
    T.pts.unshift([x, y, z, on ? 1 : 0]);
    if (T.pts.length > TN) T.pts.pop();
    const n = T.pts.length;
    for (let i = 0; i < TN; i++) {
      const p = T.pts[Math.min(i, n - 1)];
      const f = 1 - i / TN;
      const hw = w * f;
      T.pos[i * 6] = p[0];
      T.pos[i * 6 + 1] = p[1] + hw;
      T.pos[i * 6 + 2] = p[2];
      T.pos[i * 6 + 3] = p[0];
      T.pos[i * 6 + 4] = p[1] - hw;
      T.pos[i * 6 + 5] = p[2];
      const a = i < n ? p[3] * f * 0.55 : 0;
      T.al[i * 2] = a;
      T.al[i * 2 + 1] = a;
    }
    T.g.attributes.position.needsUpdate = true;
    T.g.attributes.alpha.needsUpdate = true;
  }

  /* ---------------- projectiles */
  const webBlobGeo = k(new THREE.SphereGeometry(0.16, 8, 6));
  const webBlobMat = k(new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  const shotGeo = k(new THREE.CapsuleGeometry(0.06, 0.5, 2, 6));
  const shotMats = {
    bullet: k(new THREE.MeshBasicMaterial({ color: "#ffd36a" })),
    bolt: k(new THREE.MeshBasicMaterial({ color: "#ff3a3a" })),
    knife: k(new THREE.MeshBasicMaterial({ color: "#d0d8e0" })),
    zap: k(new THREE.MeshBasicMaterial({ color: "#fff36a" })),
    missile: k(new THREE.MeshBasicMaterial({ color: "#ff7a2a" })),
  };
  const blobPool = [];
  const shotPool = [];
  function syncPool(pool, list, make, place) {
    let i = 0;
    for (const s of list) {
      if (i >= pool.length) {
        const m = make();
        scene.add(m);
        pool.push(m);
      }
      place(pool[i++], s);
    }
    for (; i < pool.length; i++) pool[i].visible = false;
  }

  /* ---------------- reticle + beacon */
  const reticle = new THREE.Mesh(k(new THREE.RingGeometry(0.5, 0.75, 24)), k(new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide })));
  reticle.renderOrder = 20;
  reticle.visible = false;
  scene.add(reticle);
  const beacon = new THREE.Mesh(k(new THREE.CylinderGeometry(1.1, 1.1, 120, 16, 1, true)), k(new THREE.MeshBasicMaterial({ color: "#ffd84a", transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })));
  beacon.visible = false;
  scene.add(beacon);
  const beaconRing = new THREE.Mesh(k(new THREE.RingGeometry(2.2, 2.6, 40)), k(new THREE.MeshBasicMaterial({ color: "#ffd84a", transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })));
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.visible = false;
  scene.add(beaconRing);

  /* ---------------- pickups */
  const tokenGeo = k(new THREE.CylinderGeometry(0.42, 0.42, 0.09, 24));
  const tokenMat = k(new THREE.MeshStandardMaterial({ color: "#ffcf3a", emissive: "#ff9a00", emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.25 }));
  const tokenEmb = k(new THREE.TorusGeometry(0.25, 0.04, 6, 6));
  const healGeo = k(new THREE.IcosahedronGeometry(0.32, 1));
  const healMat = k(new THREE.MeshStandardMaterial({ color: "#5dffa0", emissive: "#20ff70", emissiveIntensity: 1.1, roughness: 0.3 }));
  const intelGeo = k(new THREE.BoxGeometry(0.5, 0.08, 0.35));
  const intelMat = k(new THREE.MeshStandardMaterial({ color: "#59c8ff", emissive: "#2a8fff", emissiveIntensity: 1, metalness: 0.6, roughness: 0.3 }));
  const devGeo = k(new THREE.BoxGeometry(1.1, 1.3, 0.8));
  const devMat = k(new THREE.MeshStandardMaterial({ color: "#2c3038", metalness: 0.7, roughness: 0.4 }));
  const devLight = k(new THREE.SphereGeometry(0.12, 8, 6));
  const glow = k(new THREE.SpriteMaterial({ map: dot(), color: "#ffd84a", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const pickPools = { token: [], heal: [], intel: [], dev: [] };
  function makeToken() {
    const g = new THREE.Group();
    const c = new THREE.Mesh(tokenGeo, tokenMat);
    c.rotation.x = Math.PI / 2;
    const e = new THREE.Mesh(tokenEmb, tokenMat);
    e.position.z = 0.05;
    e.rotation.z = Math.PI / 6;
    const s = new THREE.Sprite(glow);
    s.scale.set(1.8, 1.8, 1);
    g.add(c, e, s);
    return g;
  }
  function makeDev() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(devGeo, devMat);
    b.position.y = 0.65;
    const l = new THREE.Mesh(devLight, new THREE.MeshBasicMaterial({ color: "#ff2a2a" }));
    l.position.set(0, 1.2, 0.42);
    own.push(l.material);
    g.add(b, l);
    g.userData.light = l;
    return g;
  }
  // protect target (generic armoured van / generator with a hp ring)
  const protect = new THREE.Group();
  {
    const body = new THREE.Mesh(k(new THREE.BoxGeometry(2.4, 2, 4.6)), k(new THREE.MeshStandardMaterial({ color: "#e8e8ea", metalness: 0.4, roughness: 0.4 })));
    body.position.y = 1.2;
    const stripe = new THREE.Mesh(k(new THREE.BoxGeometry(2.42, 0.3, 4.62)), k(new THREE.MeshStandardMaterial({ color: "#2f7fd0" })));
    stripe.position.y = 1.1;
    protect.add(body, stripe);
  }
  const protRing = new THREE.Mesh(k(new THREE.RingGeometry(3.4, 3.8, 48, 1, 0, Math.PI * 2)), k(new THREE.MeshBasicMaterial({ color: "#4dff9a", transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })));
  protRing.rotation.x = -Math.PI / 2;
  protect.add(protRing);
  protect.visible = false;
  scene.add(protect);

  /* ---------------- boss hazards */
  const hzRingGeo = k(new THREE.TorusGeometry(1, 0.12, 6, 64));
  const hzRingMat = k(new THREE.MeshBasicMaterial({ color: "#ff7a2a", transparent: true, opacity: 0.9 }));
  const markGeo = k(new THREE.CircleGeometry(1, 32));
  const markEdgeGeo = k(new THREE.RingGeometry(0.92, 1, 32));
  const beamGeo = k(new THREE.BoxGeometry(0.5, 0.5, 1));
  const hz = { rings: [], marks: [], beams: [] };

  let t = 0;
  function update(dt, W, hand, cam) {
    t += dt;
    stepParticles(P, dt, pg);
    stepParticles(Q, dt, pg2);
    for (const R of rings) {
      if (!R.m.visible) continue;
      R.t += dt;
      const u = R.t / R.life;
      if (u >= 1) {
        R.m.visible = false;
        continue;
      }
      const r = R.r0 + (R.r1 - R.r0) * (1 - (1 - u) * (1 - u));
      R.m.scale.set(r, r, r);
      R.m.material.opacity = (1 - u) * 0.85;
    }
    for (const S of strands) {
      if (!S.m.visible) continue;
      S.t += dt;
      S.m.material.opacity = Math.max(0, 1 - S.t / S.life);
      if (S.t >= S.life) S.m.visible = false;
    }
    // projectiles
    syncPool(blobPool, W.webs, () => new THREE.Mesh(webBlobGeo, webBlobMat), (m, w) => {
      m.visible = true;
      m.position.set(w.x, w.y, w.z);
      m.scale.setScalar(w.kind === "trap" ? 1.6 : 1);
    });
    syncPool(shotPool, W.shots, () => new THREE.Mesh(shotGeo, shotMats.bullet), (m, s) => {
      m.visible = true;
      m.material = shotMats[s.kind] || shotMats.bullet;
      m.position.set(s.x, s.y, s.z);
      _v.set(s.vx, s.vy, s.vz).normalize();
      m.quaternion.setFromUnitVectors(UP, _v);
    });
    // pickups
    const tok = W.tokens.filter((x) => !x.got);
    syncPool(pickPools.token, tok, makeToken, (m, p) => {
      m.visible = true;
      m.position.set(p.x, p.y + Math.sin(t * 2 + p.idx) * 0.15, p.z);
      m.rotation.y = t * 2.2 + p.idx;
    });
    const heals = W.heals.filter((x) => !x.got);
    syncPool(pickPools.heal, heals, () => new THREE.Mesh(healGeo, healMat), (m, p) => {
      m.visible = true;
      m.position.set(p.x, p.y + Math.sin(t * 3 + p.x) * 0.12, p.z);
      m.rotation.set(t, t * 1.3, 0);
    });
    const intel = W.intel.filter((x) => !x.got);
    syncPool(pickPools.intel, intel, () => new THREE.Mesh(intelGeo, intelMat), (m, p) => {
      m.visible = true;
      m.position.set(p.x, p.y + Math.sin(t * 3 + p.id) * 0.12, p.z);
      m.rotation.y = t * 1.5;
    });
    syncPool(pickPools.dev, W.devices, makeDev, (m, d) => {
      m.visible = true;
      m.position.set(d.x, d.y, d.z);
      const l = m.userData.light;
      l.material.color.set(d.done ? "#3dff6e" : Math.sin(t * 10) > 0 ? "#ff2a2a" : "#550000");
      m.scale.y = 1 + (d.hold > 0 && !d.done ? Math.sin(t * 40) * 0.02 : 0);
    });
    // protect target
    if (W.protect) {
      protect.visible = true;
      protect.position.set(W.protect.x, W.protect.y, W.protect.z);
      const f = Math.max(0, W.protect.hp / W.protect.maxHp);
      const q = Math.round(f * 60);
      if (q !== protRing.userData.q) {
        protRing.userData.q = q;
        protRing.geometry.dispose();
        protRing.geometry = new THREE.RingGeometry(3.4, 3.8, 48, 1, 0, Math.PI * 2 * Math.max(0.001, q / 60));
      }
      protRing.material.color.set(f > 0.5 ? "#4dff9a" : f > 0.25 ? "#ffd84a" : "#ff4a3a");
    } else protect.visible = false;
    // boss hazards
    const B = W.boss;
    syncPool(hz.rings, B ? B.rings : [], () => new THREE.Mesh(hzRingGeo, hzRingMat), (m, r) => {
      m.visible = true;
      m.position.set(r.x, r.y + 0.3, r.z);
      m.rotation.x = Math.PI / 2;
      m.scale.set(r.r, r.r, 1 + r.h);
    });
    syncPool(
      hz.marks,
      B ? B.marks.filter((mk) => !mk.done) : [],
      () => {
        const g = new THREE.Group();
        const fill = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: "#ff3a2a", transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
        const edge = new THREE.Mesh(markEdgeGeo, new THREE.MeshBasicMaterial({ color: "#ff3a2a", transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
        fill.rotation.x = edge.rotation.x = -Math.PI / 2;
        own.push(fill.material, edge.material);
        g.add(fill, edge);
        g.userData.fill = fill;
        return g;
      },
      (g, mk) => {
        g.visible = true;
        g.position.set(mk.x, mk.y + 0.07, mk.z);
        g.scale.setScalar(mk.rad);
        const u = Math.min(1, mk.t / mk.delay);
        g.userData.fill.scale.setScalar(Math.max(0.01, u));
        g.userData.fill.material.opacity = 0.2 + u * 0.35;
      },
    );
    syncPool(
      hz.beams,
      B ? B.beams : [],
      () => {
        const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: "#ff2a2a", transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
        own.push(m.material);
        return m;
      },
      (m, bm) => {
        m.visible = true;
        const L = bm.len;
        m.position.set(bm.x + Math.sin(bm.a) * L * 0.5, bm.y + 0.7, bm.z + Math.cos(bm.a) * L * 0.5);
        m.rotation.set(0, bm.a, 0);
        m.scale.set(bm.on ? 1 : 0.15, bm.on ? 1 : 0.15, L);
        m.material.opacity = bm.on ? 0.75 + Math.sin(t * 40) * 0.2 : 0.4 + Math.sin(t * 20) * 0.2;
      },
    );
    // reticle faces the camera
    if (reticle.visible && cam) {
      reticle.quaternion.copy(cam.quaternion);
      const d = cam.position.distanceTo(reticle.position);
      reticle.scale.setScalar(Math.max(0.6, d * 0.03) * (1 + Math.sin(t * 8) * 0.08));
    }
    beacon.material.opacity = 0.12 + Math.sin(t * 2.5) * 0.04;
    beaconRing.scale.setScalar(1 + ((t * 0.8) % 1) * 0.5);
    beaconRing.material.opacity = 0.7 * (1 - ((t * 0.8) % 1));
    void hand;
  }

  function setReticle(a) {
    reticle.visible = !!a;
    if (a) reticle.position.set(a.x, a.y, a.z);
  }
  function setBeacon(p) {
    beacon.visible = !!p;
    beaconRing.visible = !!p;
    if (p) {
      beacon.position.set(p.x, p.y + 60, p.z);
      beaconRing.position.set(p.x, p.y + 0.08, p.z);
    }
  }
  function setTrail(i, x, y, z, on, w = 0.12) {
    pushTrail(trails[i], x, y, z, w, on);
  }

  function dispose() {
    for (const o of own) o.dispose && o.dispose();
    for (const T of trails) T.g.dispose();
  }
  return { burst, shock, setRope, strand, setTrail, setReticle, setBeacon, update, dispose, points };
}
