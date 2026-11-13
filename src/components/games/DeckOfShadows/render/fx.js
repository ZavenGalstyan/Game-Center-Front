/**
 * Combat effects. One CPU particle pool per blend mode (additive sparks /
 * embers / glows and alpha-blended smoke / dust / blood), plus short-lived
 * meshes: projectiles with trails, slash arcs, shockwave rings, rune sigils,
 * light pillars, a protective barrier in front of the camera and flash lights.
 * Everything is budgeted by the quality preset (particle cap, light flashes).
 */
import * as THREE from "three";
import { softSprite, smokeTexture } from "./materials.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

class Pool {
  constructor(max, additive, tex) {
    this.max = max;
    this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.rot = new Float32Array(max);
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aRot", new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.p = [];
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uMap: { value: tex }, uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute vec4 aColor; attribute float aSize; attribute float aRot; uniform float uScale;
        varying vec4 vC; varying float vR;
        void main(){ vC = aColor; vR = aRot; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; varying vec4 vC; varying float vR;
        void main(){ vec2 c = gl_PointCoord - 0.5; float s = sin(vR), co = cos(vR);
          vec2 uv = vec2(c.x * co - c.y * s, c.x * s + c.y * co) + 0.5;
          vec4 t = texture2D(uMap, uv); gl_FragColor = vec4(vC.rgb, vC.a * t.a); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 8 : 7;
    this.geo = g;
  }
  emit(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push(o);
  }
  update(dt) {
    const P = this.p;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.age += dt;
      if (q.age >= q.life) continue;
      q.vy -= q.grav * dt;
      const d = Math.exp(-q.drag * dt);
      q.vx *= d;
      q.vy *= d;
      q.vz *= d;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      if (q.floor != null && q.y < q.floor) {
        q.y = q.floor;
        q.vy *= -0.25;
        q.vx *= 0.5;
        q.vz *= 0.5;
      }
      q.r += q.spin * dt;
      const k = q.age / q.life;
      P[w++] = q;
      const j = w - 1;
      this.pos[j * 3] = q.x;
      this.pos[j * 3 + 1] = q.y;
      this.pos[j * 3 + 2] = q.z;
      const fade = q.fadeIn ? Math.min(1, k / q.fadeIn) * (1 - k) : 1 - k * k;
      this.col[j * 4] = q.c0[0] + (q.c1[0] - q.c0[0]) * k;
      this.col[j * 4 + 1] = q.c0[1] + (q.c1[1] - q.c0[1]) * k;
      this.col[j * 4 + 2] = q.c0[2] + (q.c1[2] - q.c0[2]) * k;
      this.col[j * 4 + 3] = q.a * fade;
      this.size[j] = q.s0 + (q.s1 - q.s0) * k;
      this.rot[j] = q.r;
    }
    P.length = w;
    this.geo.setDrawRange(0, w);
    for (const k of ["position", "aColor", "aSize", "aRot"]) this.geo.attributes[k].needsUpdate = true;
  }
  clear() {
    this.p.length = 0;
    this.geo.setDrawRange(0, 0);
  }
  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

const rnd = (a, b) => a + Math.random() * (b - a);
const col = (h) => new THREE.Color(h).toArray();

export function createFx(scene, camera, opts = {}) {
  const budget = opts.particles ?? 1200;
  const glow = new Pool(budget, true, softSprite());
  const smoke = new Pool(Math.round(budget * 0.5), false, smokeTexture());
  scene.add(glow.points, smoke.points);
  const live = []; // { obj, t, life, update(k, dt), dispose }
  const lightsAllowed = opts.lights ?? 2;
  let lightsUsed = 0;

  function spray(pool, at, n, o) {
    n = Math.max(1, Math.round(n * (opts.scale ?? 1)));
    for (let i = 0; i < n; i++) {
      const dir = o.dir ? o.dir.clone() : V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize();
      if (o.dir && o.cone) dir.add(V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(o.cone)).normalize();
      const sp = rnd(o.speed[0], o.speed[1]);
      const c0 = o.color2 && Math.random() < 0.5 ? col(o.color2) : col(o.color);
      pool.emit({
        x: at.x + rnd(-1, 1) * (o.jitter || 0),
        y: at.y + rnd(-1, 1) * (o.jitter || 0),
        z: at.z + rnd(-1, 1) * (o.jitter || 0),
        vx: dir.x * sp,
        vy: dir.y * sp + (o.up || 0),
        vz: dir.z * sp,
        grav: o.grav ?? 0,
        drag: o.drag ?? 1.5,
        age: 0,
        life: rnd(o.life[0], o.life[1]),
        s0: rnd(o.size[0], o.size[1]),
        s1: o.grow != null ? rnd(o.size[0], o.size[1]) * o.grow : 0,
        c0,
        c1: o.fadeTo ? col(o.fadeTo) : c0,
        a: o.alpha ?? 1,
        r: Math.random() * 6.28,
        spin: rnd(-1, 1) * (o.spin ?? 0.5),
        floor: o.floor,
        fadeIn: o.fadeIn,
      });
    }
  }
  const sparks = (at, n, o) => spray(glow, at, n, o);
  const puff = (at, n, o) => spray(smoke, at, n, o);

  function addLive(obj, life, update, dispose) {
    scene.add(obj);
    live.push({ obj, t: 0, life, update, dispose });
  }

  function flashLight(at, color, intensity = 30, life = 0.35, dist = 8) {
    if (lightsUsed >= lightsAllowed) return;
    lightsUsed++;
    const L = new THREE.PointLight(color, intensity, dist, 2);
    L.position.copy(at);
    addLive(
      L,
      life,
      (k) => (L.intensity = intensity * (1 - k) * (1 - k)),
      () => {
        lightsUsed--;
        L.dispose?.();
      },
    );
  }

  function ring(at, color, radius = 2, life = 0.6, { thick = 0.08, up = V(0, 1, 0), additive = true, opacity = 0.9 } = {}) {
    const g = new THREE.RingGeometry(Math.max(0, 1 - thick * 2), 1, 64);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.copy(at);
    mesh.quaternion.setFromUnitVectors(V(0, 0, 1), up);
    addLive(
      mesh,
      life,
      (k) => {
        const s = radius * (0.15 + Math.sqrt(k) * 0.85);
        mesh.scale.set(s, s, s);
        m.opacity = opacity * (1 - k);
      },
      () => {
        mesh.geometry.dispose();
        m.dispose();
      },
    );
  }

  /** Crescent slash ribbon sweeping across `at`. */
  function slash(at, color, { size = 1.4, tilt = 0.6, life = 0.32, width = 0.22, facing = null, flip = 1 } = {}) {
    const seg = 40;
    const g = new THREE.BufferGeometry();
    const verts = new Float32Array((seg + 1) * 2 * 3);
    const uv = new Float32Array((seg + 1) * 2 * 2);
    const idx = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const a = (t - 0.5) * Math.PI * 0.95;
      const w = width * Math.sin(t * Math.PI);
      verts.set([Math.sin(a) * size, Math.cos(a) * size - size, 0, Math.sin(a) * (size - w), Math.cos(a) * (size - w) - size, 0], i * 6);
      uv.set([t, 0, t, 1], i * 4);
      if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uK: { value: 0 }, uColor: { value: new THREE.Color(color) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uK; uniform vec3 uColor; varying vec2 vUv;
        void main(){ float head = uK * 1.3; float d = head - vUv.x; if (d < 0.0) discard;
          float trail = exp(-d * 4.0); float edge = pow(1.0 - vUv.y, 1.5);
          vec3 c = mix(uColor, vec3(1.0), pow(edge, 4.0) * 0.8);
          gl_FragColor = vec4(c * 2.0, trail * edge * (1.0 - smoothstep(0.75, 1.0, uK))); }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.copy(at);
    if (facing) mesh.lookAt(facing);
    mesh.rotateZ(tilt);
    mesh.scale.x = flip;
    mesh.renderOrder = 9;
    addLive(
      mesh,
      life,
      (k) => (m.uniforms.uK.value = k),
      () => {
        g.dispose();
        m.dispose();
      },
    );
  }

  /** Projectile with a glowing head and trail; resolves on arrival. */
  function bolt(from, to, color, { dur = 0.45, arc = 0.6, size = 0.35, trail = 3, smokeTrail = 0, color2 = null } = {}) {
    return new Promise((res) => {
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      head.scale.setScalar(size);
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(), color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      core.scale.setScalar(size * 0.35);
      head.add(core);
      const mid = from.clone().lerp(to, 0.5).add(V(rnd(-0.4, 0.4), arc, 0));
      const curve = new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone());
      const p = V();
      addLive(
        head,
        dur,
        (k) => {
          const e = k * k * (3 - 2 * k) * 0.3 + k * 0.7;
          curve.getPoint(e, p);
          head.position.copy(p);
          for (let i = 0; i < trail; i++) sparks(p, 1, { color, color2, speed: [0.05, 0.3], life: [0.2, 0.45], size: [size * 0.25, size * 0.5], grow: 0.2, drag: 3, jitter: 0.03 });
          if (smokeTrail) puff(p, smokeTrail, { color: 0x080610, speed: [0.05, 0.2], life: [0.4, 0.8], size: [0.3, 0.5], grow: 2, alpha: 0.6, drag: 2 });
        },
        () => {
          head.material.dispose();
          core.material.dispose();
          res();
        },
      );
    });
  }

  function sigil(at, color, { radius = 1.4, life = 2.2, spin = 0.6 } = {}) {
    const g = new THREE.CircleGeometry(radius, 64);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uK: { value: 0 }, uT: { value: 0 }, uColor: { value: new THREE.Color(color) } },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uK, uT; uniform vec3 uColor; varying vec2 vP;
        void main(){ float r = length(vP) / ${radius.toFixed(3)}; float a = atan(vP.y, vP.x) + uT;
          float rings = smoothstep(0.02, 0.0, abs(r - 0.95)) + smoothstep(0.015, 0.0, abs(r - 0.82)) + smoothstep(0.012, 0.0, abs(r - 0.45));
          float runes = step(0.84, r) * step(r, 0.93) * step(0.55, fract(a * 24.0 / 6.2831)) * step(0.5, fract(r * 40.0 + a * 3.0));
          float star = 0.0; for (int i = 0; i < 5; i++){ float ang = float(i) * 2.513 + uT * 0.5; vec2 d = vec2(cos(ang), sin(ang));
            vec2 n = vec2(-d.y, d.x); star += smoothstep(0.012, 0.0, abs(dot(vP / ${radius.toFixed(3)}, n) - 0.29)) * step(r, 0.83); }
          float inten = (rings + runes * 0.8 + star * 0.7) * smoothstep(0.0, 0.15, uK) * (1.0 - smoothstep(0.75, 1.0, uK));
          gl_FragColor = vec4(uColor * 2.2, inten); }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.copy(at);
    mesh.position.y += 0.02;
    mesh.renderOrder = 4;
    addLive(
      mesh,
      life,
      (k, dt) => {
        m.uniforms.uK.value = k;
        m.uniforms.uT.value += dt * spin;
      },
      () => {
        g.dispose();
        m.dispose();
      },
    );
  }

  function pillar(at, color, { height = 7, radius = 0.9, life = 1.3 } = {}) {
    const g = new THREE.CylinderGeometry(radius, radius * 1.2, height, 32, 1, true);
    g.translate(0, height / 2, 0);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uK: { value: 0 }, uColor: { value: new THREE.Color(color) } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uK; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ float e = pow(abs(dot(vN, vV)), 2.0); float a = e * (1.0 - vUv.y) * sin(uK * 3.1416) * (0.8 + 0.2 * sin(vUv.y * 40.0 - uK * 30.0));
          gl_FragColor = vec4(mix(uColor, vec3(1.0), e * 0.5) * 2.0, a); }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.copy(at);
    mesh.renderOrder = 9;
    addLive(
      mesh,
      life,
      (k) => {
        m.uniforms.uK.value = k;
        mesh.scale.set(1 + k * 0.4, 1, 1 + k * 0.4);
      },
      () => {
        g.dispose();
        m.dispose();
      },
    );
  }

  /** Protective barrier hovering in front of the camera. */
  function barrier(color = 0x7a8aff, life = 1.4) {
    const g = new THREE.SphereGeometry(1.6, 48, 24, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.25, Math.PI * 0.5);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uK: { value: 0 }, uColor: { value: new THREE.Color(color) } },
      vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uK; uniform vec3 uColor; varying vec3 vP; varying vec3 vN; varying vec3 vV;
        float hex(vec2 p){ p.x *= 1.1547; p.y += mod(floor(p.x), 2.0) * 0.5; p = abs(fract(p) - 0.5); return abs(max(p.x * 1.5 + p.y, p.y * 2.0) - 1.0); }
        void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.0); vec2 q = vec2(atan(vP.z, vP.x) * 4.0, vP.y * 4.0);
          float hx = smoothstep(0.1, 0.0, hex(q)); float sweep = smoothstep(0.15, 0.0, abs(fract(vP.y * 0.4 - uK * 1.5) - 0.5));
          float a = (f * 0.45 + hx * 0.14 + sweep * 0.22) * sin(min(1.0, uK * 1.2) * 3.1416);
          gl_FragColor = vec4(uColor * 1.6, a); }`,
    });
    const mesh = new THREE.Mesh(g, m);
    const holder = new THREE.Group();
    holder.add(mesh);
    mesh.rotation.y = Math.PI; // dome centre (+Z) → in front of the camera (-Z)
    holder.position.copy(camera.position);
    holder.quaternion.copy(camera.quaternion);
    mesh.renderOrder = 10;
    addLive(
      holder,
      life,
      (k) => {
        m.uniforms.uK.value = k;
        holder.position.copy(camera.position);
        holder.quaternion.copy(camera.quaternion);
      },
      () => {
        g.dispose();
        m.dispose();
      },
    );
  }

  /** Point in front of the camera (for effects that start "from the player"). */
  function fromPlayer(dx = 0, dy = -0.35, dz = -0.9) {
    return V(dx, dy, dz).applyQuaternion(camera.quaternion).add(camera.position);
  }

  function update(dt) {
    glow.update(dt);
    smoke.update(dt);
    for (let i = live.length - 1; i >= 0; i--) {
      const L = live[i];
      L.t += dt;
      const k = Math.min(1, L.t / L.life);
      L.update(k, dt);
      if (k >= 1) {
        L.obj.removeFromParent();
        L.dispose?.();
        live.splice(i, 1);
      }
    }
  }

  function clear() {
    glow.clear();
    smoke.clear();
    for (const L of live) {
      L.obj.removeFromParent();
      L.dispose?.();
    }
    live.length = 0;
  }

  function dispose() {
    clear();
    glow.points.removeFromParent();
    smoke.points.removeFromParent();
    glow.dispose();
    smoke.dispose();
  }

  function setScale(h) {
    glow.mat.uniforms.uScale.value = h * 0.45;
    smoke.mat.uniforms.uScale.value = h * 0.45;
  }

  return { sparks, puff, ring, slash, bolt, sigil, pillar, barrier, flashLight, fromPlayer, update, clear, dispose, setScale, busy: () => live.length };
}
