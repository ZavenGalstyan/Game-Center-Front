/**
 * Arena Gladiator — pooled impact effects: metal sparks (one LineSegments
 * draw call), sand puffs and impact flashes (a small sprite pool). No gore —
 * hits read through sparks, dust, sound, reaction and hit-stop.
 */
import * as THREE from "three";
import { glowTexture } from "./textures.js";

const MAX_SPARKS = 90;
const MAX_PUFFS = 28;

export function createEffects(scene) {
  const segPos = new Float32Array(MAX_SPARKS * 6);
  const segCol = new Float32Array(MAX_SPARKS * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(segPos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(segCol, 3));
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(geo, lineMat);
  lines.frustumCulled = false;
  scene.add(lines);
  const sparks = [];
  for (let i = 0; i < MAX_SPARKS; i++) sparks.push({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color() });

  const puffTex = glowTexture("rgba(235,215,175,0.85)", "rgba(235,215,175,0)");
  const flashTex = glowTexture("rgba(255,240,200,1)", "rgba(255,160,60,0)");
  const puffs = [];
  for (let i = 0; i < MAX_PUFFS; i++) {
    const m = new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 });
    const s = new THREE.Sprite(m);
    s.visible = false;
    scene.add(s);
    puffs.push({ s, life: 0, max: 1, v: new THREE.Vector3(), grow: 1, flash: false });
  }
  let nextSpark = 0;
  let nextPuff = 0;
  let enabled = true;

  function spark(point, n, color, speed = 4, spread = 1) {
    if (!enabled) return;
    for (let i = 0; i < n; i++) {
      const s = sparks[nextSpark];
      nextSpark = (nextSpark + 1) % MAX_SPARKS;
      s.p.set(point.x, point.y, point.z);
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      s.v.set(Math.cos(a) * r * spread, u * 0.6 + 0.5, Math.sin(a) * r * spread).multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      s.max = s.life = 0.18 + Math.random() * 0.25;
      s.c.set(color);
    }
  }
  function puff(point, { size = 0.5, life = 0.7, flash = false, rise = 0.4, color = null } = {}) {
    if (!enabled && !flash) return;
    const p = puffs[nextPuff];
    nextPuff = (nextPuff + 1) % MAX_PUFFS;
    p.s.position.set(point.x, point.y, point.z);
    p.s.material.map = flash ? flashTex : puffTex;
    p.s.material.blending = flash ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.s.material.color.set(color || "#ffffff");
    p.s.material.needsUpdate = true;
    p.s.scale.setScalar(size);
    p.s.visible = true;
    p.life = p.max = life;
    p.grow = flash ? 2.5 : 1.2;
    p.flash = flash;
    p.v.set((Math.random() - 0.5) * 0.4, rise, (Math.random() - 0.5) * 0.4);
  }

  return {
    setEnabled(on) {
      enabled = !!on;
    },
    /** kind: hit | armor | block | parry | clash | guardBreak | dodge | step */
    burst(kind, point) {
      if (kind === "parry") {
        spark(point, 26, "#ffd27a", 5.5, 1.2);
        puff(point, { size: 0.55, life: 0.22, flash: true });
      } else if (kind === "clash") {
        spark(point, 20, "#ffe2a0", 5, 1);
        puff(point, { size: 0.4, life: 0.18, flash: true });
      } else if (kind === "block") {
        spark(point, 10, "#ffcf80", 3.5, 1);
        puff(point, { size: 0.3, life: 0.14, flash: true });
      } else if (kind === "guardBreak") {
        spark(point, 16, "#ffb060", 4, 1.3);
        puff(point, { size: 0.5, life: 0.2, flash: true, color: "#ffc080" });
      } else if (kind === "armor") {
        spark(point, 8, "#ffe6b0", 3, 1);
        puff(point, { size: 0.22, life: 0.12, flash: true });
      } else if (kind === "hit") {
        // non-graphic: a pale impact flash and a little dust off the body
        puff(point, { size: 0.3, life: 0.14, flash: true, color: "#fff2dd" });
        puff(point, { size: 0.3, life: 0.5, rise: 0.2 });
      } else if (kind === "dodge") {
        puff({ x: point.x, y: 0.15, z: point.z }, { size: 0.7, life: 0.8, rise: 0.25 });
        puff({ x: point.x + 0.2, y: 0.1, z: point.z - 0.1 }, { size: 0.5, life: 0.6, rise: 0.2 });
      } else if (kind === "fall") {
        for (let i = 0; i < 4; i++) puff({ x: point.x + (Math.random() - 0.5), y: 0.15, z: point.z + (Math.random() - 0.5) }, { size: 1, life: 1.2, rise: 0.2 });
      }
    },
    update(dt) {
      let any = false;
      for (let i = 0; i < MAX_SPARKS; i++) {
        const s = sparks[i];
        const o = i * 6;
        if (s.life <= 0) {
          segPos[o] = segPos[o + 3] = 0;
          segPos[o + 1] = segPos[o + 4] = -10;
          segPos[o + 2] = segPos[o + 5] = 0;
          continue;
        }
        any = true;
        s.life -= dt;
        s.v.y -= 9 * dt;
        s.p.addScaledVector(s.v, dt);
        const k = Math.max(0, s.life / s.max);
        segPos[o] = s.p.x;
        segPos[o + 1] = s.p.y;
        segPos[o + 2] = s.p.z;
        segPos[o + 3] = s.p.x - s.v.x * 0.025;
        segPos[o + 4] = s.p.y - s.v.y * 0.025;
        segPos[o + 5] = s.p.z - s.v.z * 0.025;
        segCol[o] = s.c.r * k;
        segCol[o + 1] = s.c.g * k;
        segCol[o + 2] = s.c.b * k;
        segCol[o + 3] = s.c.r * k * 0.3;
        segCol[o + 4] = s.c.g * k * 0.3;
        segCol[o + 5] = s.c.b * k * 0.3;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      lines.visible = any;
      for (const p of puffs) {
        if (p.life <= 0) continue;
        p.life -= dt;
        const k = Math.max(0, p.life / p.max);
        p.s.material.opacity = p.flash ? k : k * 0.55;
        p.s.scale.multiplyScalar(1 + dt * p.grow);
        p.s.position.addScaledVector(p.v, dt);
        if (p.life <= 0) p.s.visible = false;
      }
    },
    dispose() {
      scene.remove(lines);
      geo.dispose();
      lineMat.dispose();
      for (const p of puffs) {
        scene.remove(p.s);
        p.s.material.dispose();
      }
    },
  };
}
