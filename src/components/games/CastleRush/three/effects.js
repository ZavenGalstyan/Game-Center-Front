/**
 * Castle Rush — pooled combat effects (no allocation after construction).
 *
 *   Bits   small solid chips: sword sparks, shield sparks, stone fragments,
 *          coins. One InstancedMesh, per-instance colour, simple ballistics.
 *   Puffs  soft billboard dust / smoke sprites (one InstancedMesh, camera-
 *          facing, alpha via per-instance colour on a dark-to-light ramp).
 * Effects are restrained by design: a few chips per hit, a short dust puff,
 * more only for castle impacts and the destruction sequence.
 */
import * as THREE from "three";
import { puffTexture } from "./textures.js";

const tmpO = new THREE.Object3D();
const tmpC = new THREE.Color();

export class Bits {
  constructor(max = 360) {
    this.max = max;
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1, flatShading: true });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: 0.1, rx: 0, ry: 0, spin: 0, g: 9, glow: false, bounce: false });
    this.mesh.setColorAt(0, tmpC.set("#ffffff"));
    this.next = 0;
    this.live = 0;
    this.hideAll();
  }
  hideAll() {
    tmpO.scale.setScalar(0);
    tmpO.updateMatrix();
    for (let i = 0; i < this.max; i++) {
      this.mesh.setMatrixAt(i, tmpO.matrix);
      this.p[i].on = false;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.live = 0;
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
    p.vz = Math.sin(a) * sp * (1 - up) * 0.6 + (o.vz || 0);
    p.vy = sp * up * (0.6 + Math.random() * 0.6) + (o.vy || 0);
    p.life = 0;
    p.max = (o.life ?? 0.4) * (0.7 + Math.random() * 0.6);
    p.s = (o.size ?? 0.06) * (0.6 + Math.random() * 0.8);
    p.g = o.gravity ?? 9;
    p.spin = (Math.random() - 0.5) * 14;
    p.rx = Math.random() * 3;
    p.ry = Math.random() * 3;
    p.bounce = !!o.bounce;
    this.mesh.setColorAt(i, tmpC.set(o.color || "#ffffff"));
    this.mesh.instanceColor.needsUpdate = true;
  }
  burst(n, x, y, z, o) {
    for (let k = 0; k < n; k++) this.spawn(x, y, z, o);
  }
  update(dt) {
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
        p.vx *= 0.7;
        p.vz *= 0.7;
        p.spin *= 0.7;
      }
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
  constructor(max = 120) {
    this.max = max;
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("aAlpha", this.alpha);
    this.mat = new THREE.MeshBasicMaterial({ map: puffTexture(), transparent: true, depthWrite: false, opacity: 1 });
    // per-instance alpha: a tiny patch on the basic material
    this.mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aAlpha;\nvarying float vAlpha;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvAlpha = aAlpha;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vAlpha;").replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vAlpha;");
    };
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 2, rot: 0, col: new THREE.Color() });
    this.mesh.setColorAt(0, tmpC.set("#ffffff"));
    this.next = 0;
    tmpO.scale.setScalar(0);
    tmpO.updateMatrix();
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, tmpO.matrix);
  }
  hideAll() {
    tmpO.scale.setScalar(0);
    tmpO.updateMatrix();
    for (let i = 0; i < this.max; i++) {
      this.p[i].on = false;
      this.mesh.setMatrixAt(i, tmpO.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
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
    p.vz = Math.sin(a) * sp * 0.5;
    p.vy = (o.rise ?? 0.5) * (0.6 + Math.random() * 0.8);
    p.life = 0;
    p.max = (o.life ?? 0.8) * (0.75 + Math.random() * 0.5);
    p.s0 = (o.size ?? 0.6) * (0.7 + Math.random() * 0.6);
    p.s1 = p.s0 * (o.grow ?? 2.2);
    p.rot = Math.random() * Math.PI * 2;
    p.col.set(o.color || "#d9cbb4");
    p.a = o.alpha ?? 0.85;
    this.mesh.setColorAt(i, p.col);
    this.mesh.instanceColor.needsUpdate = true;
  }
  burst(n, x, y, z, o) {
    for (let k = 0; k < n; k++) this.spawn(x, y, z, o);
  }
  update(dt, camera) {
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
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 1 - 1.5 * dt;
      p.vy *= 1 - 1.2 * dt;
      tmpO.position.set(p.x, p.y, p.z);
      tmpO.quaternion.copy(camera.quaternion);
      tmpO.rotateZ(p.rot + k * 0.6);
      // fade = shrink the alpha by darkening toward transparent (scale tail)
      const s = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k));
      const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
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

/** arrow mesh pool (shaft + head + fletching merged), oriented along flight */
export function arrowGeometry() {
  const parts = [];
  const shaft = new THREE.BoxGeometry(0.03, 0.03, 0.8);
  parts.push(shaft);
  const head = new THREE.ConeGeometry(0.045, 0.14, 4);
  head.rotateX(Math.PI / 2);
  head.translate(0, 0, 0.46);
  parts.push(head);
  const f1 = new THREE.BoxGeometry(0.005, 0.09, 0.14);
  f1.translate(0, 0, -0.34);
  const f2 = new THREE.BoxGeometry(0.09, 0.005, 0.14);
  f2.translate(0, 0, -0.34);
  parts.push(f1, f2);
  return parts;
}
