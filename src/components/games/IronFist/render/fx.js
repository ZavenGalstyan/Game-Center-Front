/**
 * Lightweight combat effects. Everything is pooled and pre-allocated; the
 * point lights exist from the start (intensity 0 when idle) so no material
 * ever recompiles mid-fight.
 *
 *  • particles  one THREE.Points cloud (additive, per-particle colour/size/life)
 *  • flashes    impact star-burst sprites
 *  • smoke      soft normal-blended puffs (dust, vanish smoke)
 *  • rings      ground shockwaves
 *  • orbs       Dragon Wave projectiles (core + halo + light + trail)
 *  • bolt       jagged lightning ribbon + strike light; ground telegraph ring
 */
import * as THREE from "three";
import { softDot, starBurst, smoke as smokeTex } from "./textures.js";

const N = 900;

export function createFx(scene) {
  const group = new THREE.Group();
  scene.add(group);

  /* -------------------------------------------------------------- particles */
  const pos = new Float32Array(N * 3);
  const colr = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const alpha = new Float32Array(N);
  const P = Array.from({ length: N }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, s: 0.05, drag: 0 }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(colr, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const pmat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: softDot() }, uScale: { value: 600 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
      uniform float uScale;
      void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb * vA * 2.0, t.a * vA); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, pmat);
  points.frustumCulled = false;
  points.renderOrder = 10;
  group.add(points);
  let cursor = 0;
  const c3 = new THREE.Color();
  function emit(x, y, z, vx, vy, vz, color, life, s, g = 0, drag = 0) {
    const i = cursor;
    cursor = (cursor + 1) % N;
    const p = P[i];
    p.life = p.max = life;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.g = g;
    p.s = s;
    p.drag = drag;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    c3.set(color);
    colr[i * 3] = c3.r;
    colr[i * 3 + 1] = c3.g;
    colr[i * 3 + 2] = c3.b;
  }
  function burst(x, y, z, color, count = 20, speed = 4, life = 0.4, s = 0.06, g = -9, spread = 1) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * Math.PI * spread;
      const v = speed * (0.35 + Math.random() * 0.65);
      emit(x, y, z, Math.cos(a) * Math.cos(b) * v, Math.sin(b) * v + speed * 0.25, Math.sin(a) * Math.cos(b) * v * 0.6, color, life * (0.6 + Math.random() * 0.6), s * (0.6 + Math.random() * 0.8), g, 1.5);
    }
  }

  /* -------------------------------------------------------------- flashes */
  const flashes = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.SpriteMaterial({ map: starBurst(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
    const s = new THREE.Sprite(m);
    s.visible = false;
    s.renderOrder = 12;
    group.add(s);
    flashes.push({ s, t: 0, max: 0.16, size: 1 });
  }
  let fi = 0;
  function flash(x, y, z, color, sz = 0.8, dur = 0.16) {
    const f = flashes[fi];
    fi = (fi + 1) % flashes.length;
    f.s.position.set(x, y, z);
    f.s.material.color.set(color);
    f.s.material.rotation = Math.random() * Math.PI;
    f.s.visible = true;
    f.t = f.max = dur;
    f.size = sz;
  }

  /* -------------------------------------------------------------- smoke */
  const puffs = [];
  for (let i = 0; i < 28; i++) {
    const m = new THREE.SpriteMaterial({ map: smokeTex(), color: 0xffffff, depthWrite: false, transparent: true, opacity: 0 });
    const s = new THREE.Sprite(m);
    s.visible = false;
    s.renderOrder = 9;
    group.add(s);
    puffs.push({ s, t: 0, max: 1, vx: 0, vy: 0, grow: 1, a0: 0.5 });
  }
  let si = 0;
  function puff(x, y, z, color, count = 5, spread = 0.4, sz = 0.6, a0 = 0.45, life = 0.9) {
    for (let k = 0; k < count; k++) {
      const p = puffs[si];
      si = (si + 1) % puffs.length;
      p.s.position.set(x + (Math.random() - 0.5) * spread, y + Math.random() * spread * 0.4, z + (Math.random() - 0.5) * spread * 0.4);
      p.s.material.color.set(color);
      p.s.scale.setScalar(sz * (0.6 + Math.random() * 0.5));
      p.s.material.rotation = Math.random() * 6;
      p.s.visible = true;
      p.t = p.max = life * (0.7 + Math.random() * 0.5);
      p.vx = (Math.random() - 0.5) * 0.8;
      p.vy = 0.25 + Math.random() * 0.5;
      p.grow = 1 + Math.random();
      p.a0 = a0;
    }
  }

  /* -------------------------------------------------------------- rings */
  const rings = [];
  const ringGeo = new THREE.RingGeometry(0.82, 1, 64);
  ringGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const r = new THREE.Mesh(ringGeo, m);
    r.visible = false;
    r.renderOrder = 8;
    group.add(r);
    rings.push({ r, t: 0, max: 0.5, R: 2 });
  }
  let ri = 0;
  function ring(x, z, color, R = 2.2, dur = 0.5, y = 0.03) {
    const o = rings[ri];
    ri = (ri + 1) % rings.length;
    o.r.position.set(x, y, z);
    o.r.material.color.set(color);
    o.r.visible = true;
    o.t = o.max = dur;
    o.R = R;
  }

  /* -------------------------------------------------------------- lights (fixed set) */
  // only two always-present lights (every lit pixel pays for each point light):
  // one for impacts / lightning strikes, one for the projectile
  const impact = new THREE.PointLight(0xffffff, 0, 8, 1.8);
  const orbLights = [new THREE.PointLight(0x66aaff, 0, 5, 2)];
  const boltLight = impact;
  for (const l of [impact, ...orbLights]) group.add(l);
  let impactI = 0;
  let boltI = 0;
  function light(x, y, z, color, i = 6) {
    if (boltI > 1) return; // a lightning strike owns the light
    impact.position.set(x, y, z + 0.6);
    impact.color.set(color);
    impact.distance = 8;
    impactI = Math.max(impactI, i);
  }

  /* -------------------------------------------------------------- orbs */
  const orbs = new Map(); // projectile id → pooled orb
  const orbGeo = new THREE.SphereGeometry(0.16, 24, 16);
  const orbPool = [];
  function makeOrb(color) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), toneMapped: false }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.setScalar(1.1);
    const halo2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: starBurst(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
    halo2.scale.setScalar(0.9);
    g.add(core, halo, halo2);
    g.visible = false;
    group.add(g);
    return g;
  }
  for (let i = 0; i < 3; i++) orbPool.push(makeOrb("#66aaff"));
  function takeOrb(color) {
    const g = orbPool.find((o) => !o.visible) || orbPool[0];
    g.visible = true;
    g.children[0].material.color.set(color).multiplyScalar(2.2);
    g.children[1].material.color.set(color);
    g.children[2].material.color.set(color);
    return g;
  }
  function syncOrbs(list, color, dt) {
    const live = new Set();
    let li = 0;
    for (const p of list) {
      live.add(p.id);
      let o = orbs.get(p.id);
      if (!o) {
        o = { g: takeOrb(color), color, x: p.x };
        orbs.set(p.id, o);
      }
      o.x = p.x;
      o.g.position.set(p.x, p.y, 0);
      o.g.children[2].material.rotation += dt * 9;
      const k = 1 + Math.sin(performance.now() * 0.03) * 0.08;
      o.g.children[1].scale.setScalar(1.1 * k);
      for (let j = 0; j < 3; j++) emit(p.x - Math.sign(p.vx) * 0.12, p.y + (Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.18, -p.vx * 0.15, (Math.random() - 0.5) * 0.4, 0, o.color, 0.35, 0.09, 0, 2);
      if (li < orbLights.length) {
        const L = orbLights[li++];
        L.position.set(p.x, p.y, 0.3);
        L.color.set(o.color);
        L.intensity = 5;
      }
    }
    for (; li < orbLights.length; li++) orbLights[li].intensity = 0;
    for (const [id, o] of orbs)
      if (!live.has(id)) {
        burst(o.x, 1.2, 0, o.color, 26, 3.5, 0.45, 0.08, -2);
        o.g.visible = false;
        orbs.delete(id);
      }
  }

  /* -------------------------------------------------------------- lightning */
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#cfefff").multiplyScalar(2.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const boltGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#4ab8ff"), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const SEG = 18;
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
  const idx = [];
  for (let i = 0; i < SEG; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  boltGeo.setIndex(idx);
  const boltMesh = new THREE.Mesh(boltGeo, boltMat);
  const boltGlow = new THREE.Mesh(boltGeo, boltGlowMat);
  boltGlow.scale.set(1, 1, 1);
  boltMesh.frustumCulled = boltGlow.frustumCulled = false;
  boltMesh.renderOrder = boltGlow.renderOrder = 11;
  group.add(boltGlow, boltMesh);
  let boltT = 0;
  let boltX = 0;
  function shapeBolt(x, w) {
    const a = boltGeo.attributes.position;
    let cx = x + (Math.random() - 0.5) * 0.6;
    for (let i = 0; i <= SEG; i++) {
      const y = 9 - (i / SEG) * 9;
      if (i === SEG) cx = x;
      else cx += (Math.random() - 0.5) * 0.45;
      const ww = w * (0.4 + (i / SEG) * 0.6);
      a.setXYZ(i * 2, cx - ww, y, 0.05);
      a.setXYZ(i * 2 + 1, cx + ww, y, 0.05);
    }
    a.needsUpdate = true;
  }
  function bolt(x, color = "#9fd8ff") {
    boltX = x;
    boltT = 0.32;
    shapeBolt(x, 0.05);
    boltGlowMat.color.set(color);
    boltLight.position.set(x, 3, 1.5);
    boltLight.color.set(color);
    boltLight.distance = 14;
    boltI = 60;
    flash(x, 0.4, 0.1, color, 2.4, 0.3);
    ring(x, 0, color, 2.4, 0.55);
    burst(x, 0.15, 0, color, 50, 6, 0.6, 0.07, -12);
    puff(x, 0.1, 0, "#2a2f3a", 6, 0.8, 1.1, 0.5, 1.2);
  }
  // telegraph: crackling ring under the target while the bolt charges
  const markGeo = new THREE.RingGeometry(0.42, 0.55, 48);
  markGeo.rotateX(-Math.PI / 2);
  const markMat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const mark = new THREE.Mesh(markGeo, markMat);
  mark.position.y = 0.025;
  mark.renderOrder = 8;
  group.add(mark);
  let markT = 0;
  function telegraph(x, color, dur = 0.4) {
    mark.position.x = x;
    markMat.color.set(color);
    markT = dur;
  }

  /* -------------------------------------------------------------- update */
  function update(dt) {
    const a = geo.attributes;
    for (let i = 0; i < N; i++) {
      const p = P[i];
      if (p.life <= 0) {
        if (alpha[i] !== 0) {
          alpha[i] = 0;
          size[i] = 0;
        }
        continue;
      }
      p.life -= dt;
      const k = Math.max(0, p.life / p.max);
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx *= dr;
      p.vy = p.vy * dr + p.g * dt;
      p.vz *= dr;
      pos[i * 3] += p.vx * dt;
      pos[i * 3 + 1] = Math.max(0.01, pos[i * 3 + 1] + p.vy * dt);
      pos[i * 3 + 2] += p.vz * dt;
      alpha[i] = k;
      size[i] = p.s * (0.5 + k * 0.5);
    }
    a.position.needsUpdate = a.alpha.needsUpdate = a.size.needsUpdate = a.color.needsUpdate = true;
    for (const f of flashes) {
      if (!f.s.visible) continue;
      f.t -= dt;
      if (f.t <= 0) {
        f.s.visible = false;
        continue;
      }
      const k = f.t / f.max;
      f.s.scale.setScalar(f.size * (1.4 - k * 0.6));
      f.s.material.opacity = k;
    }
    for (const p of puffs) {
      if (!p.s.visible) continue;
      p.t -= dt;
      if (p.t <= 0) {
        p.s.visible = false;
        continue;
      }
      const k = p.t / p.max;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.scale.multiplyScalar(1 + dt * p.grow * 0.8);
      p.s.material.opacity = p.a0 * Math.min(1, k * 2) * Math.min(1, (1 - k) * 8);
    }
    for (const o of rings) {
      if (!o.r.visible) continue;
      o.t -= dt;
      if (o.t <= 0) {
        o.r.visible = false;
        continue;
      }
      const k = 1 - o.t / o.max;
      o.r.scale.setScalar(0.2 + o.R * (1 - (1 - k) * (1 - k)));
      o.r.material.opacity = (1 - k) * 0.9;
    }
    impactI *= Math.max(0, 1 - dt * 14);
    boltI *= Math.max(0, 1 - dt * 9);
    const li = Math.max(impactI, boltI * (0.7 + Math.random() * 0.6));
    impact.intensity = li < 0.05 ? 0 : li;
    if (boltT > 0) {
      boltT -= dt;
      if (Math.random() < 0.5) shapeBolt(boltX, 0.05);
      const k = Math.max(0, boltT / 0.32);
      boltMat.opacity = k;
      boltGlowMat.opacity = k * 0.7;
      boltGlow.scale.set(1, 1, 1);
    } else boltMat.opacity = boltGlowMat.opacity = 0;
    if (markT > 0) {
      markT -= dt;
      markMat.opacity = 0.55 + Math.sin(performance.now() * 0.05) * 0.35;
      mark.scale.setScalar(1 + Math.sin(performance.now() * 0.02) * 0.08);
      if (Math.random() < 0.6) emit(mark.position.x + (Math.random() - 0.5) * 0.9, 0.05, (Math.random() - 0.5) * 0.4, 0, 1.5 + Math.random() * 2, 0, markMat.color, 0.3, 0.05, 0, 0);
    } else markMat.opacity = 0;
  }

  /** Make every pooled object visible for one renderer.compile() (no first-hit hitch). */
  function setAllVisible(v) {
    for (const f of flashes) f.s.visible = v;
    for (const p of puffs) p.s.visible = v;
    for (const o of rings) o.r.visible = v;
    for (const g of orbPool) g.visible = v;
  }
  function clear() {
    for (const p of P) p.life = 0;
    for (const f of flashes) f.s.visible = false;
    for (const p of puffs) p.s.visible = false;
    for (const o of rings) o.r.visible = false;
    syncOrbs([], "#fff", 0);
    boltT = markT = 0;
    impactI = boltI = 0;
  }

  return {
    group,
    emit,
    burst,
    flash,
    puff,
    ring,
    light,
    bolt,
    telegraph,
    syncOrbs,
    setAllVisible,
    update,
    clear,
    setScale(h) {
      pmat.uniforms.uScale.value = h * 0.9;
    },
    dispose() {
      clear();
      scene.remove(group);
      geo.dispose();
      pmat.dispose();
      ringGeo.dispose();
      markGeo.dispose();
      orbGeo.dispose();
      for (const g of orbPool) g.children.forEach((c) => c.material.dispose());
      boltGeo.dispose();
      boltMat.dispose();
      boltGlowMat.dispose();
      markMat.dispose();
      for (const f of flashes) f.s.material.dispose();
      for (const p of puffs) p.s.material.dispose();
      for (const o of rings) o.r.material.dispose();
    },
  };
}
