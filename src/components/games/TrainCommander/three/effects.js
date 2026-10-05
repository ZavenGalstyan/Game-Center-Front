/**
 * Train Commander — pooled combat effects (no allocation after construction).
 *
 *   Bits    small solid chips: sparks, metal shards, debris, scrap bits.
 *           One InstancedMesh, per-instance colour, simple ballistics.
 *   Puffs   camera-facing soft sprites (smoke, dust, steam). One
 *           InstancedMesh with per-instance alpha. `drift` makes a puff
 *           belong to the ground: it slides back at −trainSpeed, so smoke
 *           and dust trail correctly behind a moving train.
 *   Flashes the same sprite system with additive blending and a hot
 *           texture: muzzle flashes, explosion cores, weld glints.
 *   Rings   flat expanding ground rings (shockwaves, landing marks).
 * Effects are deliberately restrained: strategy readability comes first.
 */
import * as THREE from "three";
import { puffTexture, flashTexture, ringTexture } from "./textures.js";

const tmpO = new THREE.Object3D();
const tmpC = new THREE.Color();

export class Bits {
  constructor(max = 420) {
    this.max = max;
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2, flatShading: true });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: 0.1, rx: 0, ry: 0, spin: 0, g: 9, bounce: false, drift: 0 });
    this.mesh.setColorAt(0, tmpC.set("#ffffff"));
    this.next = 0;
    this.hideAll();
  }
  hideAll() {
    tmpO.position.set(0, 0, 0);
    tmpO.rotation.set(0, 0, 0);
    tmpO.scale.setScalar(0);
    tmpO.updateMatrix();
    for (let i = 0; i < this.max; i++) {
      this.mesh.setMatrixAt(i, tmpO.matrix);
      this.p[i].on = false;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  spawn(x, y, z, o) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const p = this.p[i];
    p.on = true;
    p.x = x;
    p.y = y;
    p.z = z;
    const sp = o.speed ?? 3;
    const a = Math.random() * Math.PI * 2;
    const up = o.up ?? 0.6;
    p.vx = Math.cos(a) * sp * (1 - up) + (o.vx || 0);
    p.vz = Math.sin(a) * sp * (1 - up) + (o.vz || 0);
    p.vy = sp * up * (0.6 + Math.random() * 0.6) + (o.vy || 0);
    p.life = 0;
    p.max = (o.life ?? 0.4) * (0.7 + Math.random() * 0.6);
    p.s = (o.size ?? 0.06) * (0.6 + Math.random() * 0.8);
    p.g = o.gravity ?? 9;
    p.spin = (Math.random() - 0.5) * 14;
    p.rx = Math.random() * 3;
    p.ry = Math.random() * 3;
    p.bounce = !!o.bounce;
    p.drift = o.drift ? 1 : 0;
    this.mesh.setColorAt(i, tmpC.set(o.color || "#ffffff"));
    this.mesh.instanceColor.needsUpdate = true;
  }
  burst(n, x, y, z, o) {
    for (let k = 0; k < n; k++) this.spawn(x, y, z, o);
  }
  update(dt, trainV = 0) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i];
      if (!p.on) continue;
      any = true;
      p.life += dt;
      if (p.life >= p.max) {
        p.on = false;
        tmpO.scale.setScalar(0);
        tmpO.updateMatrix();
        this.mesh.setMatrixAt(i, tmpO.matrix);
        continue;
      }
      p.vy -= p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.03) {
        p.y = 0.03;
        if (p.bounce && p.vy < -1) p.vy *= -0.3;
        else p.vy = 0;
        p.vx *= 0.6;
        p.vz *= 0.6;
        p.spin *= 0.6;
        p.drift = 1; // resting on the ground → it belongs to the scenery now
      }
      if (p.drift) p.x -= trainV * dt;
      p.rx += p.spin * dt;
      p.ry += p.spin * 0.7 * dt;
      const k = 1 - p.life / p.max;
      tmpO.position.set(p.x, p.y, p.z);
      tmpO.rotation.set(p.rx, p.ry, 0);
      tmpO.scale.setScalar(p.s * (0.4 + 0.6 * Math.min(1, k * 2.5)));
      tmpO.updateMatrix();
      this.mesh.setMatrixAt(i, tmpO.matrix);
    }
    if (any || this._wasAny) this.mesh.instanceMatrix.needsUpdate = true;
    this._wasAny = any;
  }
}

export class Puffs {
  constructor(max = 160, { additive = false, map = null } = {}) {
    this.max = max;
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("aAlpha", this.alpha);
    this.mat = new THREE.MeshBasicMaterial({ map: map || (additive ? flashTexture() : puffTexture()), transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !additive });
    this.mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aAlpha;\nvarying float vAlpha;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvAlpha = aAlpha;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vAlpha;").replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vAlpha;");
    };
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 7 : 5;
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 2, rot: 0, a: 1, drift: 0, col: new THREE.Color() });
    this.mesh.setColorAt(0, tmpC.set("#ffffff"));
    this.next = 0;
    this.hideAll();
  }
  hideAll() {
    tmpO.position.set(0, 0, 0);
    tmpO.quaternion.identity();
    tmpO.scale.setScalar(0);
    tmpO.updateMatrix();
    for (let i = 0; i < this.max; i++) {
      this.p[i].on = false;
      this.mesh.setMatrixAt(i, tmpO.matrix);
      this.alpha.setX(i, 0);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }
  spawn(x, y, z, o) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const p = this.p[i];
    p.on = true;
    p.x = x + (Math.random() - 0.5) * (o.spread ?? 0.3);
    p.y = y + Math.random() * (o.spreadY ?? 0.1);
    p.z = z + (Math.random() - 0.5) * (o.spread ?? 0.3);
    const a = Math.random() * Math.PI * 2;
    const sp = o.speed ?? 0.6;
    p.vx = Math.cos(a) * sp + (o.vx || 0);
    p.vz = Math.sin(a) * sp * 0.6 + (o.vz || 0);
    p.vy = (o.rise ?? 0.5) * (0.6 + Math.random() * 0.8);
    p.life = 0;
    p.max = (o.life ?? 0.8) * (0.75 + Math.random() * 0.5);
    p.s0 = (o.size ?? 0.6) * (0.7 + Math.random() * 0.6);
    p.s1 = p.s0 * (o.grow ?? 2.2);
    p.rot = Math.random() * Math.PI * 2;
    p.a = o.alpha ?? 0.85;
    p.drift = o.drift ?? 0;
    p.fadeIn = o.fadeIn ?? 0.15;
    p.col.set(o.color || "#d9cbb4");
    this.mesh.setColorAt(i, p.col);
    this.mesh.instanceColor.needsUpdate = true;
  }
  burst(n, x, y, z, o) {
    for (let k = 0; k < n; k++) this.spawn(x, y, z, o);
  }
  update(dt, camera, trainV = 0) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i];
      if (!p.on) continue;
      any = true;
      p.life += dt;
      if (p.life >= p.max) {
        p.on = false;
        tmpO.scale.setScalar(0);
        tmpO.updateMatrix();
        this.mesh.setMatrixAt(i, tmpO.matrix);
        this.alpha.setX(i, 0);
        continue;
      }
      const k = p.life / p.max;
      p.x += (p.vx - trainV * p.drift) * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 1 - 1.5 * dt;
      p.vz *= 1 - 1.5 * dt;
      p.vy *= 1 - 0.9 * dt;
      tmpO.position.set(p.x, p.y, p.z);
      tmpO.quaternion.copy(camera.quaternion);
      tmpO.rotateZ(p.rot + k * 0.6);
      const s = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k));
      const fade = k < p.fadeIn ? k / p.fadeIn : 1 - (k - p.fadeIn) / (1 - p.fadeIn);
      tmpO.scale.set(s, s, 1);
      tmpO.updateMatrix();
      this.mesh.setMatrixAt(i, tmpO.matrix);
      this.alpha.setX(i, Math.max(0, fade) * p.a);
    }
    if (any || this._wasAny) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.alpha.needsUpdate = true;
    }
    this._wasAny = any;
  }
}

/** flat expanding rings on the ground (shockwaves) */
export class Rings {
  constructor(max = 24) {
    this.max = max;
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.geo.rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("aAlpha", this.alpha);
    this.mat = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aAlpha;\nvarying float vAlpha;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvAlpha = aAlpha;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vAlpha;").replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vAlpha;");
    };
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ on: false, x: 0, y: 0, z: 0, life: 0, max: 1, r0: 0.2, r1: 2, a: 1 });
    this.mesh.setColorAt(0, tmpC.set("#ffffff"));
    this.next = 0;
    this.hideAll();
  }
  hideAll() {
    tmpO.position.set(0, 0, 0);
    tmpO.rotation.set(0, 0, 0);
    tmpO.scale.setScalar(0);
    tmpO.updateMatrix();
    for (let i = 0; i < this.max; i++) {
      this.p[i].on = false;
      this.mesh.setMatrixAt(i, tmpO.matrix);
      this.alpha.setX(i, 0);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }
  spawn(x, y, z, o) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const p = this.p[i];
    Object.assign(p, { on: true, x, y, z, life: 0, max: o.life ?? 0.45, r0: o.r0 ?? 0.3, r1: o.r1 ?? 2.5, a: o.alpha ?? 0.8 });
    this.mesh.setColorAt(i, tmpC.set(o.color || "#ffe2b0"));
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt, trainV = 0) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i];
      if (!p.on) continue;
      any = true;
      p.life += dt;
      if (p.life >= p.max) {
        p.on = false;
        tmpO.scale.setScalar(0);
        tmpO.updateMatrix();
        this.mesh.setMatrixAt(i, tmpO.matrix);
        this.alpha.setX(i, 0);
        continue;
      }
      p.x -= trainV * dt;
      const k = p.life / p.max;
      const r = p.r0 + (p.r1 - p.r0) * (1 - (1 - k) * (1 - k));
      tmpO.position.set(p.x, p.y, p.z);
      tmpO.rotation.set(0, 0, 0);
      tmpO.scale.set(r * 2, 1, r * 2);
      tmpO.updateMatrix();
      this.mesh.setMatrixAt(i, tmpO.matrix);
      this.alpha.setX(i, (1 - k) * p.a);
    }
    if (any || this._wasAny) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.alpha.needsUpdate = true;
    }
    this._wasAny = any;
  }
}
