/**
 * Strike Force — pooled world effects. Nothing is allocated per shot:
 *   tracers      instanced glowing streaks travelling at ~420 m/s
 *   sparks       one Points cloud (ring buffer) for impact sparks / chips
 *   puffs        sprite pool for dust / snow / hit puffs / muzzle smoke
 *   holes        instanced bullet-hole decals (ring buffer, oldest reused)
 *   flashes      sprite pool for other soldiers' muzzle flashes
 *   flashLight   one point light that follows the latest bot flash
 * Hits on soldiers are stylised (energy sparks in team colour), never gore.
 */
import * as THREE from "three";
import { flashTexture, holeTexture, radialTexture, smokeTexture } from "./textures.js";

const SURF = {
  metal: { spark: "#ffd27a", puff: "#8d8f92", sparks: 9, puffs: 1 },
  concrete: { spark: "#d9cfbf", puff: "#a39d93", sparks: 5, puffs: 2 },
  wood: { spark: "#a8794a", puff: "#7d6248", sparks: 6, puffs: 1 },
  sand: { spark: "#d8c39a", puff: "#cdb48a", sparks: 3, puffs: 2 },
  snow: { spark: "#ffffff", puff: "#eef3f7", sparks: 4, puffs: 2 },
  dirt: { spark: "#8a7356", puff: "#7f6a52", sparks: 3, puffs: 2 },
  glass: { spark: "#cfe8ff", puff: "#b9c8d2", sparks: 8, puffs: 0 },
  water: { spark: "#d6ecf3", puff: "#cfe1e8", sparks: 6, puffs: 1 },
};
export function surfaceOf(m, k) {
  if (!m) return "concrete";
  if (/metal|corrugated|steel|rack|vehicle|barrel|grate|chain|tank|Roof/i.test(m) || k === "container" || k === "vehicle") return "metal";
  if (/wood|crate|bark|log/i.test(m)) return "wood";
  if (/sand|hesco|sandbag/i.test(m)) return "sand";
  if (/snow/i.test(m)) return "snow";
  if (/grass|dirt|forest|gravel/i.test(m)) return "dirt";
  if (/glass/i.test(m)) return "glass";
  return "concrete";
}

export function createEffects(scene, { quality = "medium", groundSurface = "concrete" } = {}) {
  const lowQ = quality === "low";
  const group = new THREE.Group();
  group.name = "fx";
  scene.add(group);
  const disposables = [];
  const T = (x) => (disposables.push(x), x);

  /* ------------------------------------------------------------ tracers */
  const MAX_TR = 48;
  const trGeo = T(new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1, true));
  trGeo.rotateX(Math.PI / 2);
  const trMat = T(new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffcf7a").multiplyScalar(3.5), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const tracers = new THREE.InstancedMesh(trGeo, trMat, MAX_TR);
  tracers.frustumCulled = false;
  tracers.count = 0;
  group.add(tracers);
  const trList = [];
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _v = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _z = new THREE.Vector3(0, 0, 1);
  function tracer(ox, oy, oz, x, y, z, speed = 420, len = 5) {
    const dx = x - ox;
    const dy = y - oy;
    const dz = z - oz;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 2) return;
    if (trList.length >= MAX_TR) trList.shift();
    trList.push({ ox, oy, oz, dx: dx / dist, dy: dy / dist, dz: dz / dist, dist, d: 0, speed, len: Math.min(len, dist) });
  }

  /* ------------------------------------------------------------ sparks (points) */
  const MAX_SP = lowQ ? 220 : 520;
  const spPos = new Float32Array(MAX_SP * 3);
  const spCol = new Float32Array(MAX_SP * 3);
  const spVel = new Float32Array(MAX_SP * 3);
  const spLife = new Float32Array(MAX_SP);
  const spGeo = T(new THREE.BufferGeometry());
  spGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute("color", new THREE.BufferAttribute(spCol, 3));
  const spMat = T(
    new THREE.PointsMaterial({
      size: 0.06,
      map: radialTexture([
        [0, "rgba(255,255,255,1)"],
        [0.4, "rgba(255,255,255,0.8)"],
        [1, "rgba(255,255,255,0)"],
      ]),
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      toneMapped: false,
    }),
  );
  const sparks = new THREE.Points(spGeo, spMat);
  sparks.frustumCulled = false;
  group.add(sparks);
  let spHead = 0;
  const _c = new THREE.Color();
  function spark(x, y, z, nx, ny, nz, color, n, speed = 4, gravity = 1) {
    _c.set(color);
    const k = 2.4;
    for (let i = 0; i < n; i++) {
      const j = spHead;
      spHead = (spHead + 1) % MAX_SP;
      spPos[j * 3] = x;
      spPos[j * 3 + 1] = y;
      spPos[j * 3 + 2] = z;
      const s = speed * (0.4 + Math.random() * 0.8);
      spVel[j * 3] = (nx + (Math.random() - 0.5) * 1.4) * s;
      spVel[j * 3 + 1] = (ny + Math.random() * 0.9) * s;
      spVel[j * 3 + 2] = (nz + (Math.random() - 0.5) * 1.4) * s;
      spLife[j] = 0.25 + Math.random() * 0.35 * gravity;
      spCol[j * 3] = _c.r * k;
      spCol[j * 3 + 1] = _c.g * k;
      spCol[j * 3 + 2] = _c.b * k;
    }
  }

  /* ------------------------------------------------------------ puffs (sprites) */
  const MAX_PF = lowQ ? 24 : 56;
  const smoke = smokeTexture();
  const puffs = [];
  for (let i = 0; i < MAX_PF; i++) {
    const m = T(new THREE.SpriteMaterial({ map: smoke, transparent: true, depthWrite: false, opacity: 0, color: "#ffffff" }));
    const sp = new THREE.Sprite(m);
    sp.visible = false;
    group.add(sp);
    puffs.push({ sp, m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 0.2, s1: 1, o: 0.5 });
  }
  let pfHead = 0;
  function puff(x, y, z, color, { size = 0.6, grow = 1.8, life = 0.9, opacity = 0.45, vx = 0, vy = 0.3, vz = 0, additive = false } = {}) {
    const p = puffs[pfHead];
    pfHead = (pfHead + 1) % MAX_PF;
    p.sp.visible = true;
    p.sp.position.set(x, y, z);
    p.m.color.set(color);
    p.m.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.m.rotation = Math.random() * Math.PI * 2;
    p.life = 0;
    p.max = life;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.s0 = size;
    p.s1 = size * grow;
    p.o = opacity;
  }

  /* ------------------------------------------------------------ bullet holes */
  const MAX_H = lowQ ? 40 : 140;
  const hGeo = T(new THREE.PlaneGeometry(0.11, 0.11));
  const hMat = T(new THREE.MeshBasicMaterial({ map: holeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, opacity: 0.92 }));
  const holes = new THREE.InstancedMesh(hGeo, hMat, MAX_H);
  holes.count = 0;
  holes.frustumCulled = false;
  group.add(holes);
  let hHead = 0;
  let hCount = 0;
  const _n = new THREE.Vector3();
  function hole(x, y, z, nx, ny, nz) {
    _n.set(nx, ny, nz);
    _q.setFromUnitVectors(_z, _n);
    const rot = new THREE.Quaternion().setFromAxisAngle(_n, Math.random() * Math.PI * 2);
    _q.premultiply(rot);
    const s = 0.75 + Math.random() * 0.6;
    _m.compose(_v.set(x + nx * 0.005, y + ny * 0.005, z + nz * 0.005), _q, _s.set(s, s, s));
    holes.setMatrixAt(hHead, _m);
    hHead = (hHead + 1) % MAX_H;
    hCount = Math.min(MAX_H, hCount + 1);
    holes.count = hCount;
    holes.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------ remote muzzle flashes */
  const MAX_FL = 14;
  const flTex = flashTexture();
  const flashes = [];
  for (let i = 0; i < MAX_FL; i++) {
    const m = T(new THREE.SpriteMaterial({ map: flTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color("#ffd8a0").multiplyScalar(2) }));
    const sp = new THREE.Sprite(m);
    sp.visible = false;
    group.add(sp);
    flashes.push({ sp, m, life: 0 });
  }
  let flHead = 0;
  const flashLight = new THREE.PointLight("#ffb46a", 0, 9, 2);
  group.add(flashLight);
  let flashLightT = 0;
  function muzzle(x, y, z, silenced) {
    if (silenced) {
      puff(x, y, z, "#9a9a9a", { size: 0.08, grow: 3, life: 0.35, opacity: 0.25, vy: 0.2 });
      return;
    }
    const f = flashes[flHead];
    flHead = (flHead + 1) % MAX_FL;
    f.sp.visible = true;
    f.sp.position.set(x, y, z);
    const s = 0.35 + Math.random() * 0.25;
    f.sp.scale.set(s, s, s);
    f.m.rotation = Math.random() * Math.PI * 2;
    f.life = 0.05;
    flashLight.position.set(x, y, z);
    flashLight.intensity = lowQ ? 0 : 6;
    flashLightT = 0.05;
  }

  /* ------------------------------------------------------------ public API */
  /** world impact: surface material, normal */
  function impact(x, y, z, nx, ny, nz, m, k, { decal = true, big = false } = {}) {
    const s = SURF[surfaceOf(m, k)] || SURF.concrete;
    spark(x, y, z, nx, ny, nz, s.spark, Math.round(s.sparks * (big ? 1.6 : 1) * (lowQ ? 0.6 : 1)), surfaceOf(m, k) === "metal" ? 6 : 3.5);
    for (let i = 0; i < s.puffs; i++) puff(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, s.puff, { size: big ? 0.4 : 0.22, grow: 3.2, life: 0.8 + Math.random() * 0.5, opacity: 0.42, vx: nx * 0.5, vy: ny * 0.5 + 0.25, vz: nz * 0.5 });
    if (decal && surfaceOf(m, k) !== "snow") hole(x, y, z, nx, ny, nz);
  }
  function groundHit(x, y, z) {
    impact(x, y, z, 0, 1, 0, groundSurface, "ground");
  }
  /** stylised body hit: armour sparks in team colour, no gore */
  function bodyHit(x, y, z, dx, dy, dz, color = "#ffd27a", head = false) {
    spark(x, y, z, -dx, -dy + 0.3, -dz, head ? "#ffffff" : color, head ? 14 : 8, 3.2);
    puff(x, y, z, color, { size: 0.16, grow: 2.2, life: 0.28, opacity: 0.55, additive: true, vy: 0.1 });
  }
  function deathPuff(x, y, z) {
    puff(x, y + 0.3, z, "#8a8a85", { size: 0.7, grow: 2.2, life: 1.4, opacity: 0.3, vy: 0.35 });
  }

  function update(dt, camPos) {
    // tracers
    let k = 0;
    for (let i = trList.length - 1; i >= 0; i--) {
      const t = trList[i];
      t.d += t.speed * dt;
      if (t.d - t.len > t.dist) {
        trList.splice(i, 1);
        continue;
      }
    }
    for (const t of trList) {
      const head = Math.min(t.d, t.dist);
      const tail = Math.max(0, t.d - t.len);
      const len = head - tail;
      if (len <= 0.01) continue;
      const mid = (head + tail) / 2;
      _v.set(t.ox + t.dx * mid, t.oy + t.dy * mid, t.oz + t.dz * mid);
      _n.set(t.dx, t.dy, t.dz);
      _q.setFromUnitVectors(_z, _n);
      const dist = camPos ? _v.distanceTo(camPos) : 10;
      const w = Math.max(1, Math.min(4, dist / 12));
      _m.compose(_v, _q, _s.set(w, w, len));
      tracers.setMatrixAt(k++, _m);
    }
    tracers.count = k;
    tracers.instanceMatrix.needsUpdate = true;
    // sparks
    for (let j = 0; j < MAX_SP; j++) {
      if (spLife[j] <= 0) continue;
      spLife[j] -= dt;
      if (spLife[j] <= 0) {
        spPos[j * 3 + 1] = -999;
        continue;
      }
      spVel[j * 3 + 1] -= 9.8 * dt;
      spPos[j * 3] += spVel[j * 3] * dt;
      spPos[j * 3 + 1] += spVel[j * 3 + 1] * dt;
      spPos[j * 3 + 2] += spVel[j * 3 + 2] * dt;
      if (spPos[j * 3 + 1] < 0.01) {
        spPos[j * 3 + 1] = 0.01;
        spVel[j * 3 + 1] *= -0.35;
        spVel[j * 3] *= 0.6;
        spVel[j * 3 + 2] *= 0.6;
      }
      const f = Math.min(1, spLife[j] * 4);
      spCol[j * 3] *= 0.985 + 0.015 * f;
      spCol[j * 3 + 1] *= 0.97 + 0.03 * f;
      spCol[j * 3 + 2] *= 0.95 + 0.05 * f;
    }
    spGeo.attributes.position.needsUpdate = true;
    spGeo.attributes.color.needsUpdate = true;
    // puffs
    for (const p of puffs) {
      if (!p.sp.visible) continue;
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) {
        p.sp.visible = false;
        continue;
      }
      p.sp.position.x += p.vx * dt;
      p.sp.position.y += p.vy * dt;
      p.sp.position.z += p.vz * dt;
      p.vx *= 1 - dt * 2;
      p.vz *= 1 - dt * 2;
      const s = p.s0 + (p.s1 - p.s0) * (1 - (1 - t) ** 2);
      p.sp.scale.set(s, s, s);
      p.m.opacity = p.o * (1 - t) * Math.min(1, t * 8);
      p.m.rotation += dt * 0.3;
    }
    // flashes
    for (const f of flashes) {
      if (!f.sp.visible) continue;
      f.life -= dt;
      if (f.life <= 0) f.sp.visible = false;
    }
    flashLightT -= dt;
    if (flashLightT <= 0) flashLight.intensity = 0;
  }

  function clear() {
    trList.length = 0;
    tracers.count = 0;
    spLife.fill(0);
    for (const p of puffs) p.sp.visible = false;
    hCount = 0;
    holes.count = 0;
  }

  function dispose() {
    scene.remove(group);
    for (const d of disposables) d.dispose?.();
    tracers.dispose();
    holes.dispose();
  }

  return { group, tracer, impact, groundHit, bodyHit, deathPuff, muzzle, puff, spark, update, clear, dispose };
}
