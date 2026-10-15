/**
 * Tank Warfare 3D — pooled visual effects (Three.js).
 *
 *   Particles — camera-facing quads drawn with ONE instanced draw call per
 *               pool (alpha-blended smoke/dust, additive fire/sparks/flash).
 *               Fixed-size CPU arrays, no allocation per particle.
 *   Tracers   — shell streaks: instanced quads stretched along velocity.
 *   Debris    — instanced chunks with gravity, bounce and spin.
 *   Decals    — scorch marks on the ground, recycled ring buffer.
 *   Flashes   — two point lights reused for muzzle flashes / explosions
 *               (always in the scene so the light count never changes).
 */
import * as THREE from "three";

function canvasTex(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function fxTextures() {
  const puff = canvasTex(128, (g, s) => {
    for (let i = 0; i < 18; i++) {
      const x = s * (0.3 + Math.random() * 0.4);
      const y = s * (0.3 + Math.random() * 0.4);
      const r = s * (0.16 + Math.random() * 0.2);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,0.42)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    }
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "rgba(255,255,255,0.35)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
  const glow = canvasTex(64, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(255,255,255,0.75)");
    gr.addColorStop(0.6, "rgba(255,255,255,0.18)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
  const scorch = canvasTex(128, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "rgba(10,8,6,0.9)");
    gr.addColorStop(0.45, "rgba(25,20,15,0.65)");
    gr.addColorStop(1, "rgba(30,25,20,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      g.strokeStyle = "rgba(15,12,10,0.4)";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(s / 2, s / 2);
      g.lineTo(s / 2 + Math.cos(a) * s * 0.48, s / 2 + Math.sin(a) * s * 0.48);
      g.stroke();
    }
  });
  return { puff, glow, scorch };
}

/* ------------------------------------------------------------------ particles */
const VERT = `
attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iSR;
varying vec2 vUv; varying vec4 vCol; varying float vDepth;
void main(){
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSR.y), s = sin(iSR.y);
  vec2 p = position.xy * iSR.x;
  mv.xy += vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  vDepth = -mv.z;
  vUv = uv; vCol = iCol;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = (additive) => `
uniform sampler2D map; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
varying vec2 vUv; varying vec4 vCol; varying float vDepth;
void main(){
  vec4 t = texture2D(map, vUv);
  float f = smoothstep(fogNear, fogFar, vDepth);
  ${additive
    ? "vec3 col = vCol.rgb * t.rgb * t.a * vCol.a * (1.0 - f); gl_FragColor = vec4(col, 1.0);"
    : "vec3 col = mix(vCol.rgb * t.rgb, fogColor, f); gl_FragColor = vec4(col, t.a * vCol.a);"}
  #include <colorspace_fragment>
}`;

export class Particles {
  constructor(max, map, additive) {
    this.max = max;
    this.n = 0;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute("position", base.attributes.position);
    g.setAttribute("uv", base.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aSR = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
    for (const a of [this.aPos, this.aCol, this.aSR]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("iPos", this.aPos);
    g.setAttribute("iCol", this.aCol);
    g.setAttribute("iSR", this.aSR);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, fogColor: { value: new THREE.Color(0xaaaaaa) }, fogNear: { value: 100 }, fogFar: { value: 500 } },
      vertexShader: VERT,
      fragmentShader: FRAG(additive),
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 5;
    // state
    const F = (k) => new Float32Array(max * k);
    this.p = F(3);
    this.v = F(3);
    this.life = F(1);
    this.maxLife = F(1);
    this.size = F(2);
    this.rot = F(2);
    this.c0 = F(4);
    this.c1 = F(3);
    this.phys = F(3); // drag, gravity, fadeIn
  }
  /** o: {x,y,z, vx,vy,vz, life, s0,s1, rot,spin, r,g,b,a, r1,g1,b1, drag, grav, fadeIn} */
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, o = {}) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p.set([x, y, z], i * 3);
    this.v.set([vx, vy, vz], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i * 2] = s0;
    this.size[i * 2 + 1] = s1;
    this.rot[i * 2] = o.rot ?? Math.random() * 6.28;
    this.rot[i * 2 + 1] = o.spin ?? (Math.random() - 0.5) * 1.2;
    this.c0.set([r, g, b, a], i * 4);
    this.c1.set([o.r1 ?? r, o.g1 ?? g, o.b1 ?? b], i * 3);
    this.phys[i * 3] = o.drag ?? 0.8;
    this.phys[i * 3 + 1] = o.grav ?? 0;
    this.phys[i * 3 + 2] = o.fadeIn ?? 0.08;
  }
  copy(d, s) {
    this.p.copyWithin(d * 3, s * 3, s * 3 + 3);
    this.v.copyWithin(d * 3, s * 3, s * 3 + 3);
    this.life[d] = this.life[s];
    this.maxLife[d] = this.maxLife[s];
    this.size.copyWithin(d * 2, s * 2, s * 2 + 2);
    this.rot.copyWithin(d * 2, s * 2, s * 2 + 2);
    this.c0.copyWithin(d * 4, s * 4, s * 4 + 4);
    this.c1.copyWithin(d * 3, s * 3, s * 3 + 3);
    this.phys.copyWithin(d * 3, s * 3, s * 3 + 3);
  }
  update(dt) {
    let i = 0;
    const P = this.aPos.array;
    const C = this.aCol.array;
    const SR = this.aSR.array;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.n--;
        if (i !== this.n) this.copy(i, this.n);
        continue;
      }
      const k = i * 3;
      const drag = Math.max(0, 1 - this.phys[k] * dt);
      this.v[k] *= drag;
      this.v[k + 1] = this.v[k + 1] * drag + this.phys[k + 1] * dt;
      this.v[k + 2] *= drag;
      this.p[k] += this.v[k] * dt;
      this.p[k + 1] += this.v[k + 1] * dt;
      this.p[k + 2] += this.v[k + 2] * dt;
      this.rot[i * 2] += this.rot[i * 2 + 1] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      const fi = this.phys[k + 2];
      const alpha = this.c0[i * 4 + 3] * (t < fi ? t / fi : 1 - (t - fi) / (1 - fi));
      P[k] = this.p[k];
      P[k + 1] = this.p[k + 1];
      P[k + 2] = this.p[k + 2];
      C[i * 4] = this.c0[i * 4] + (this.c1[k] - this.c0[i * 4]) * t;
      C[i * 4 + 1] = this.c0[i * 4 + 1] + (this.c1[k + 1] - this.c0[i * 4 + 1]) * t;
      C[i * 4 + 2] = this.c0[i * 4 + 2] + (this.c1[k + 2] - this.c0[i * 4 + 2]) * t;
      C[i * 4 + 3] = Math.max(0, alpha);
      SR[i * 2] = this.size[i * 2] + (this.size[i * 2 + 1] - this.size[i * 2]) * Math.sqrt(t);
      SR[i * 2 + 1] = this.rot[i * 2];
      i++;
    }
    this.geo.instanceCount = this.n;
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSR.needsUpdate = true;
  }
  clear() {
    this.n = 0;
    this.geo.instanceCount = 0;
  }
  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/* ------------------------------------------------------------------ tracers */
const TR_VERT = `
attribute vec3 iA; attribute vec3 iB; attribute vec4 iCol; attribute float iW;
varying vec4 vCol; varying vec2 vUv;
void main(){
  vec4 a = modelViewMatrix * vec4(iA, 1.0);
  vec4 b = modelViewMatrix * vec4(iB, 1.0);
  vec4 m = mix(a, b, position.y + 0.5);
  vec2 d = b.xy / max(0.1, -b.z) - a.xy / max(0.1, -a.z);
  vec2 n = normalize(vec2(-d.y, d.x) + vec2(1e-5));
  m.xy += n * position.x * iW;
  vCol = iCol; vUv = uv;
  gl_Position = projectionMatrix * m;
}`;
const TR_FRAG = `
varying vec4 vCol; varying vec2 vUv;
void main(){
  float side = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float along = smoothstep(0.0, 0.35, vUv.y);
  gl_FragColor = vec4(vCol.rgb * side * side * along * vCol.a, 1.0);
}`;
export class Tracers {
  constructor(max = 64) {
    this.max = max;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute("position", base.attributes.position);
    g.setAttribute("uv", base.attributes.uv);
    this.A = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.B = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.C = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.W = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    for (const a of [this.A, this.B, this.C, this.W]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("iA", this.A);
    g.setAttribute("iB", this.B);
    g.setAttribute("iCol", this.C);
    g.setAttribute("iW", this.W);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({ vertexShader: TR_VERT, fragmentShader: TR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
  }
  set(list) {
    const n = Math.min(this.max, list.length);
    for (let i = 0; i < n; i++) {
      const t = list[i];
      this.A.array.set(t.a, i * 3);
      this.B.array.set(t.b, i * 3);
      this.C.array.set(t.c, i * 4);
      this.W.array[i] = t.w;
    }
    this.geo.instanceCount = n;
    for (const a of [this.A, this.B, this.C, this.W]) a.needsUpdate = true;
  }
  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/* ------------------------------------------------------------------ debris */
export class Debris {
  constructor(max, mat) {
    this.max = max;
    const g = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.items = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.col = new THREE.Color();
    this.v3 = new THREE.Vector3();
    this.s3 = new THREE.Vector3();
    this.mesh.setColorAt(0, this.col.set(1, 1, 1));
  }
  spawn(x, y, z, n, color, s = 1, speed = 8) {
    for (let k = 0; k < n; k++) {
      if (this.items.length >= this.max) this.items.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.items.push({
        x, y, z,
        vx: Math.cos(a) * sp, vy: 3 + Math.random() * speed * 0.9, vz: Math.sin(a) * sp,
        rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - 0.5) * 12, wy: (Math.random() - 0.5) * 12,
        sx: (0.2 + Math.random() * 0.5) * s, sy: (0.1 + Math.random() * 0.3) * s, sz: (0.2 + Math.random() * 0.6) * s,
        life: 2.5 + Math.random() * 1.5, color, rest: false,
      });
    }
  }
  update(dt, ground) {
    const out = [];
    for (const d of this.items) {
      d.life -= dt;
      if (d.life <= 0) continue;
      if (!d.rest) {
        d.vy -= 18 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        d.rx += d.wx * dt;
        d.ry += d.wy * dt;
        const g = ground(d.x, d.z) + d.sy * 0.5;
        if (d.y < g) {
          d.y = g;
          d.vy *= -0.3;
          d.vx *= 0.5;
          d.vz *= 0.5;
          d.wx *= 0.5;
          d.wy *= 0.5;
          if (Math.abs(d.vy) < 1.2) d.rest = true;
        }
      }
      out.push(d);
    }
    this.items = out;
    let i = 0;
    for (const d of out) {
      const k = Math.min(1, d.life / 0.6);
      this.e.set(d.rx, d.ry, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v3.set(d.x, d.y, d.z), this.q, this.s3.set(d.sx * k, d.sy * k, d.sz * k));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.col.setHex(d.color));
      i++;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() {
    this.items = [];
    this.mesh.count = 0;
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

/* ------------------------------------------------------------------ decals */
export class Decals {
  constructor(max, map) {
    this.max = max;
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, opacity: 0.9 });
    this.mesh = new THREE.InstancedMesh(g, this.mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.next = 0;
    this.items = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
  }
  add(x, y, z, r, normal) {
    const it = { x, y, z, r, nx: normal.x, ny: normal.y, nz: normal.z, rot: Math.random() * 6.28 };
    if (this.items.length < this.max) this.items.push(it);
    else this.items[this.next] = it;
    this.next = (this.next + 1) % this.max;
    this.rebuild();
  }
  rebuild() {
    const up = new THREE.Vector3(0, 1, 0);
    const n = new THREE.Vector3();
    const qs = new THREE.Quaternion();
    this.items.forEach((it, i) => {
      n.set(it.nx, it.ny, it.nz);
      this.q.setFromUnitVectors(up, n);
      qs.setFromAxisAngle(up, it.rot);
      this.q.multiply(qs);
      this.m.compose(new THREE.Vector3(it.x, it.y + 0.06, it.z), this.q, new THREE.Vector3(it.r * 2, 1, it.r * 2));
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.count = this.items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    this.items = [];
    this.next = 0;
    this.mesh.count = 0;
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}

/* ------------------------------------------------------------------ flash lights */
export class Flashes {
  constructor(scene, n = 2) {
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 30, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push({ l, t: 0, max: 1, peak: 0 });
    }
  }
  fire(x, y, z, peak, dur, color = 0xffb060, range = 30) {
    // reuse the weakest light
    let best = this.lights[0];
    for (const f of this.lights) if (f.t <= 0 || f.peak * (f.t / f.max) < best.peak * (best.t / best.max)) best = f;
    best.l.position.set(x, y, z);
    best.l.color.setHex(color);
    best.l.distance = range;
    best.t = best.max = dur;
    best.peak = peak;
  }
  update(dt) {
    for (const f of this.lights) {
      f.t = Math.max(0, f.t - dt);
      f.l.intensity = f.t > 0 ? f.peak * (f.t / f.max) ** 1.5 : 0;
    }
  }
  dispose(scene) {
    for (const f of this.lights) scene.remove(f.l);
  }
}
