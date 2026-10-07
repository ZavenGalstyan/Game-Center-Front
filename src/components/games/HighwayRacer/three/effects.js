/**
 * Highway Racer — lightweight effects, all pooled (fixed buffers, no
 * per-event allocation): crash sparks, crash smoke, coin sparkles and speed
 * streaks. Particle counts follow the Particles setting (LOW / NORMAL).
 */
import * as THREE from "three";
import { glowTex } from "./materials.js";

function pointsPool(n, color, size) {
  const pos = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size,
    map: glowTex(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const P = Array.from({ length: n }, () => ({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, drag: 1, g: 9 }));
  for (let i = 0; i < n; i++) pos[i * 3 + 1] = -99;
  let cursor = 0;
  return {
    obj: pts,
    emit(x, y, z, vx, vy, vz, life, drag = 1.5, g = 9) {
      const p = P[cursor];
      cursor = (cursor + 1) % n;
      Object.assign(p, { life, x, y, z, vx, vy, vz, drag, g });
    },
    update(dt, scrollV) {
      let any = false;
      for (let i = 0; i < n; i++) {
        const p = P[i];
        if (p.life <= 0) {
          pos[i * 3 + 1] = -99;
          continue;
        }
        any = true;
        p.life -= dt;
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vz *= k;
        p.vy = p.vy * k - p.g * dt;
        p.x += p.vx * dt;
        p.y = Math.max(0.03, p.y + p.vy * dt);
        p.z += (p.vz + scrollV) * dt;
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.life > 0 ? p.y : -99;
        pos[i * 3 + 2] = p.z;
      }
      geo.attributes.position.needsUpdate = true;
      pts.visible = any;
    },
    clear() {
      for (const p of P) p.life = 0;
      for (let i = 0; i < n; i++) pos[i * 3 + 1] = -99;
      geo.attributes.position.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

function smokeTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createEffects(scene) {
  const group = new THREE.Group();
  scene.add(group);
  let level = "normal";

  const sparks = pointsPool(140, "#ffb24a", 0.16);
  const sparkle = pointsPool(70, "#ffe27a", 0.2);
  const blue = pointsPool(50, "#7fd8ff", 0.22);
  group.add(sparks.obj, sparkle.obj, blue.obj);

  /* smoke puffs */
  const smokeTex = smokeTexture();
  const smokeGeo = new THREE.PlaneGeometry(1, 1);
  const smoke = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({ map: smokeTex, color: "#9a9a9a", transparent: true, depthWrite: false, opacity: 0 }));
    m.visible = false;
    group.add(m);
    smoke.push({ m, life: 0, max: 1, vx: 0, vy: 0, vz: 0 });
  }
  let smokeCursor = 0;

  /* speed streaks: thin additive quads streaming past the camera */
  const STREAKS = 36;
  const streakGeo = new THREE.PlaneGeometry(0.03, 5.5);
  streakGeo.rotateX(-Math.PI / 2);
  const streakMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const streaks = new THREE.InstancedMesh(streakGeo, streakMat, STREAKS);
  streaks.frustumCulled = false;
  const streakState = Array.from({ length: STREAKS }, () => ({ x: 0, y: 0, z: 0 }));
  const rnd = Math.random;
  const placeStreak = (s, far) => {
    const a = rnd() * Math.PI * 2;
    const r = 2.6 + rnd() * 3.5;
    s.x = Math.cos(a) * r * 1.6;
    s.y = 2.4 + Math.sin(a) * r * 0.75;
    if (s.y < 0.4) s.y = 0.4 + rnd();
    s.z = far ? -40 - rnd() * 40 : -rnd() * 80;
  };
  for (const s of streakState) placeStreak(s, false);
  group.add(streaks);
  const m4 = new THREE.Matrix4();
  let streakAlpha = 0;

  const count = (n) => (level === "low" ? Math.ceil(n * 0.35) : n);

  return {
    setLevel(l) {
      level = l === "low" ? "low" : "normal";
    },
    crash(x, y, z, side) {
      const n = count(60);
      for (let i = 0; i < n; i++) {
        sparks.emit(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.5, z, (Math.random() - 0.5) * 9 + side * 3, 2 + Math.random() * 6, (Math.random() - 0.3) * 10, 0.4 + Math.random() * 0.5, 1.2, 14);
      }
      const puffs = level === "low" ? 4 : 9;
      for (let i = 0; i < puffs; i++) {
        const s = smoke[smokeCursor];
        smokeCursor = (smokeCursor + 1) % smoke.length;
        s.life = s.max = 1.2 + Math.random() * 0.9;
        s.m.position.set(x + (Math.random() - 0.5) * 1.2, y + 0.3, z + (Math.random() - 0.5) * 1.2);
        s.vx = (Math.random() - 0.5) * 1.2;
        s.vy = 0.6 + Math.random() * 0.8;
        s.vz = (Math.random() - 0.5) * 1.2;
        s.m.visible = true;
      }
    },
    scrape(x, z) {
      for (let i = 0; i < count(4); i++) sparks.emit(x, 0.3, z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, 2 + Math.random() * 3, 0.25, 2, 12);
    },
    coin(x, y, z) {
      for (let i = 0; i < count(12); i++) {
        const a = Math.random() * Math.PI * 2;
        sparkle.emit(x, y, z, Math.cos(a) * 2.5, 1 + Math.random() * 2.5, Math.sin(a) * 2.5 - 4, 0.35 + Math.random() * 0.25, 3, 2);
      }
    },
    boostPickup(x, y, z) {
      for (let i = 0; i < count(20); i++) {
        const a = Math.random() * Math.PI * 2;
        blue.emit(x, y, z, Math.cos(a) * 3.5, 1 + Math.random() * 3, Math.sin(a) * 3.5 - 5, 0.4 + Math.random() * 0.3, 2.5, 1);
      }
    },
    /** `speedK` 0..1 (+ boost) → streak visibility; `scrollV` = world speed */
    update(dt, scrollV, streakTarget, cameraPos) {
      sparks.update(dt, scrollV);
      sparkle.update(dt, scrollV);
      blue.update(dt, scrollV);
      for (const s of smoke) {
        if (s.life <= 0) continue;
        s.life -= dt;
        const k = 1 - s.life / s.max;
        s.m.position.x += s.vx * dt;
        s.m.position.y += s.vy * dt;
        s.m.position.z += (s.vz + scrollV) * dt;
        s.m.scale.setScalar(1 + k * 3.5);
        s.m.material.opacity = Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.5;
        if (cameraPos) s.m.lookAt(cameraPos);
        if (s.life <= 0) s.m.visible = false;
      }
      streakAlpha += (streakTarget - streakAlpha) * Math.min(1, dt * 5);
      streaks.visible = streakAlpha > 0.01;
      if (streaks.visible) {
        streakMat.opacity = streakAlpha * 0.32;
        const v = Math.max(scrollV, 30) * 1.6;
        for (let i = 0; i < STREAKS; i++) {
          const s = streakState[i];
          s.z += v * dt;
          if (s.z > 8) placeStreak(s, true);
          m4.makeTranslation(s.x + (cameraPos ? cameraPos.x * 0.6 : 0), s.y, s.z);
          streaks.setMatrixAt(i, m4);
        }
        streaks.instanceMatrix.needsUpdate = true;
      }
    },
    clear() {
      sparks.clear();
      sparkle.clear();
      blue.clear();
      for (const s of smoke) {
        s.life = 0;
        s.m.visible = false;
      }
      streakAlpha = 0;
      streaks.visible = false;
    },
    dispose() {
      scene.remove(group);
      sparks.dispose();
      sparkle.dispose();
      blue.dispose();
      smokeTex.dispose();
      smokeGeo.dispose();
      for (const s of smoke) s.m.material.dispose();
      streakGeo.dispose();
      streakMat.dispose();
      streaks.dispose();
    },
  };
}
