/**
 * Lumberjack Life — pooled particles. Nothing is allocated per hit:
 *
 *  chips  InstancedMesh of small flat slivers (wood chips / bark bits /
 *         leaves) — gravity, drag, spin, bounce once on the terrain, fade.
 *  puffs  Points with a soft sprite — dust, sawdust, snow puffs; grow + fade.
 *  ambient  looping weather motes around the camera (pollen, mist motes,
 *           falling leaves, snow, golden sparkles).
 *
 * Pool sizes scale with the Particles setting / quality; when the pool is
 * full the oldest particle is recycled.
 */
import * as THREE from "three";
import { spriteTexture } from "./textures.js";

const _o = new THREE.Object3D();
const _c = new THREE.Color();

export function createEffects(scene, { quality = "medium", particles = true, ground }) {
  const scale = !particles ? 0.25 : quality === "low" ? 0.5 : quality === "high" ? 1 : 0.8;
  /* ---------------- chips */
  const CHIPS = Math.round(220 * scale) + 20;
  const chipGeo = new THREE.BoxGeometry(0.05, 0.012, 0.03);
  const chipMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const chips = new THREE.InstancedMesh(chipGeo, chipMat, CHIPS);
  chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  chips.frustumCulled = false;
  chips.castShadow = false;
  for (let i = 0; i < CHIPS; i++) {
    _o.position.set(0, -999, 0);
    _o.scale.setScalar(0.0001);
    _o.updateMatrix();
    chips.setMatrixAt(i, _o.matrix);
    chips.setColorAt(i, _c.set("#d9b47a"));
  }
  scene.add(chips);
  const C = [];
  for (let i = 0; i < CHIPS; i++) C.push({ life: 0, max: 1, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0, size: 1, bounced: false, leaf: false });
  let chipNext = 0;

  /* ---------------- puffs */
  const PUFFS = Math.round(420 * scale) + 40;
  const pPos = new Float32Array(PUFFS * 3);
  const pCol = new Float32Array(PUFFS * 4);
  const pSize = new Float32Array(PUFFS);
  const P = [];
  for (let i = 0; i < PUFFS; i++) {
    pPos[i * 3 + 1] = -999;
    P.push({ life: 0, max: 1, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, s0: 0.1, s1: 0.5, a: 0.5, r: 1, g: 1, b: 1, grav: 0 });
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute("aCol", new THREE.BufferAttribute(pCol, 4).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute("aSize", new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
  const pMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTex: { value: spriteTexture() }, uScale: { value: 600 } },
    vertexShader: `attribute vec4 aCol; attribute float aSize; varying vec4 vCol; uniform float uScale;
      void main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(0.1, -mv.z); }`,
    fragmentShader: `uniform sampler2D uTex; varying vec4 vCol;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vCol.rgb, vCol.a * t.a); if (gl_FragColor.a < 0.01) discard; }`,
  });
  const puffs = new THREE.Points(pGeo, pMat);
  puffs.frustumCulled = false;
  puffs.renderOrder = 5;
  scene.add(puffs);
  let puffNext = 0;

  const rnd = (a, b) => a + Math.random() * (b - a);

  function chip(x, y, z, vx, vy, vz, color, size = 1, life = 1.6, leaf = false) {
    const c = C[chipNext];
    chips.setColorAt(chipNext, _c.set(color));
    chipNext = (chipNext + 1) % CHIPS;
    Object.assign(c, { life, max: life, x, y, z, vx, vy, vz, rx: rnd(0, 6), ry: rnd(0, 6), rz: rnd(0, 6), sx: rnd(-14, 14), sy: rnd(-14, 14), sz: rnd(-14, 14), size: size * rnd(0.7, 1.3), bounced: false, leaf });
  }
  function puff(x, y, z, { vx = 0, vy = 0.3, vz = 0, color = "#cbb89a", s0 = 0.15, s1 = 0.7, a = 0.45, life = 1.2, grav = 0 } = {}) {
    const p = P[puffNext];
    puffNext = (puffNext + 1) % PUFFS;
    _c.set(color);
    Object.assign(p, { life, max: life, x, y, z, vx, vy, vz, s0, s1, a, r: _c.r, g: _c.g, b: _c.b, grav });
  }

  /* ---------------- ambient weather */
  const AMB = Math.round((quality === "low" ? 120 : quality === "high" ? 320 : 220) * (particles ? 1 : 0.3));
  const aPos = new Float32Array(AMB * 3);
  const aSeed = new Float32Array(AMB);
  for (let i = 0; i < AMB; i++) {
    aPos[i * 3] = rnd(-18, 18);
    aPos[i * 3 + 1] = rnd(0, 12);
    aPos[i * 3 + 2] = rnd(-18, 18);
    aSeed[i] = Math.random() * 100;
  }
  const aGeo = new THREE.BufferGeometry();
  aGeo.setAttribute("position", new THREE.BufferAttribute(aPos, 3).setUsage(THREE.DynamicDrawUsage));
  aGeo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
  const aMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTex: { value: spriteTexture() }, uColor: { value: new THREE.Color("#fff6c8") }, uSize: { value: 0.06 }, uAlpha: { value: 0.6 }, uScale: { value: 600 }, uTime: { value: 0 } },
    vertexShader: `attribute float aSeed; uniform float uSize; uniform float uScale; uniform float uTime; varying float vTw;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; vTw = 0.6 + 0.4 * sin(uTime * 2.0 + aSeed);
        gl_PointSize = uSize * uScale / max(0.1, -mv.z); }`,
    fragmentShader: `uniform sampler2D uTex; uniform vec3 uColor; uniform float uAlpha; varying float vTw;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(uColor, uAlpha * t.a * vTw); if (gl_FragColor.a < 0.01) discard; }`,
  });
  const ambient = new THREE.Points(aGeo, aMat);
  ambient.frustumCulled = false;
  scene.add(ambient);
  let weather = "pollen";

  function setWeather(kind) {
    weather = kind;
    const U = aMat.uniforms;
    if (kind === "snow") {
      U.uColor.value.set("#ffffff");
      U.uSize.value = 0.09;
      U.uAlpha.value = 0.85;
    } else if (kind === "leaves") {
      U.uColor.value.set("#e0873a");
      U.uSize.value = 0.11;
      U.uAlpha.value = 0.85;
    } else if (kind === "gold") {
      U.uColor.value.set("#ffd76a");
      U.uSize.value = 0.06;
      U.uAlpha.value = 0.8;
    } else if (kind === "mist") {
      U.uColor.value.set("#f2f6f8");
      U.uSize.value = 0.05;
      U.uAlpha.value = 0.45;
    } else {
      U.uColor.value.set("#fff3c2");
      U.uSize.value = 0.045;
      U.uAlpha.value = 0.55;
    }
  }

  /* ---------------- high-level effects */
  const fx = {
    /** axe bites wood: chips fly back toward the cutter, bark bits, a little dust */
    woodHit(x, y, z, nx, nz, wood, bark, strength = 1) {
      const n = Math.round((8 + 6 * strength) * scale);
      for (let i = 0; i < n; i++) {
        const sp = rnd(1.5, 3.8) * strength;
        const side = rnd(-1, 1);
        chip(x, y, z, nx * sp + -nz * side * 1.6, rnd(1.2, 3.4), nz * sp + nx * side * 1.6, i % 3 === 0 ? bark : wood, rnd(0.8, 1.5), rnd(1.2, 2));
      }
      for (let i = 0; i < Math.round(3 * scale) + 1; i++) puff(x + rnd(-0.1, 0.1), y, z + rnd(-0.1, 0.1), { vx: nx * 0.5, vy: 0.25, vz: nz * 0.5, color: wood, s0: 0.08, s1: 0.4, a: 0.35, life: 0.7 });
    },
    /** chainsaw bite: a stream of sawdust */
    sawdust(x, y, z, nx, nz, wood) {
      const n = Math.max(1, Math.round(3 * scale));
      for (let i = 0; i < n; i++) puff(x, y, z, { vx: nx * rnd(1.5, 3) + rnd(-0.6, 0.6), vy: rnd(0.4, 1.4), vz: nz * rnd(1.5, 3) + rnd(-0.6, 0.6), color: wood, s0: 0.03, s1: 0.09, a: 0.85, life: 0.6, grav: 4 });
      if (Math.random() < 0.6) chip(x, y, z, nx * rnd(1, 2.5), rnd(0.5, 2), nz * rnd(1, 2.5), wood, 0.5, 0.8);
    },
    /** tree hits the ground: dust along the trunk, leaves burst from the crown */
    treeLand(points, leafCols, dustCol) {
      for (const p of points) {
        for (let i = 0; i < Math.round(5 * scale) + 1; i++) puff(p.x + rnd(-0.6, 0.6), p.y + rnd(-0.1, 0.3), p.z + rnd(-0.6, 0.6), { vx: rnd(-1.4, 1.4), vy: rnd(0.4, 1.3), vz: rnd(-1.4, 1.4), color: dustCol, s0: 0.4, s1: 1.8, a: 0.4, life: rnd(1.4, 2.4) });
      }
      const crown = points[points.length - 1];
      for (let i = 0; i < Math.round(40 * scale) + 4; i++) chip(crown.x + rnd(-2, 2), crown.y + rnd(0, 1.5), crown.z + rnd(-2, 2), rnd(-2.5, 2.5), rnd(1, 4), rnd(-2.5, 2.5), leafCols[i % leafCols.length], 1.6, rnd(2, 3.5), true);
    },
    /** shake loose a few leaves from a standing tree when it's hit */
    leaves(x, y, z, cols, n = 3) {
      for (let i = 0; i < Math.round(n * scale) + (Math.random() < 0.5 ? 1 : 0); i++) chip(x + rnd(-1.5, 1.5), y + rnd(-0.5, 0.5), z + rnd(-1.5, 1.5), rnd(-0.4, 0.4), rnd(-0.2, 0.3), rnd(-0.4, 0.4), cols[i % cols.length], 1.5, rnd(2.5, 4), true);
    },
    dust(x, y, z, color = "#b9a585", n = 4, size = 0.6) {
      for (let i = 0; i < Math.round(n * scale) + 1; i++) puff(x + rnd(-0.3, 0.3), y, z + rnd(-0.3, 0.3), { vx: rnd(-0.6, 0.6), vy: rnd(0.2, 0.7), vz: rnd(-0.6, 0.6), color, s0: size * 0.3, s1: size * 1.4, a: 0.35, life: rnd(0.8, 1.4) });
    },
    /** sawmill blade: sawdust spraying out of the housing */
    millSpray(x, y, z, dirx, dirz, wood) {
      puff(x, y, z, { vx: dirx * rnd(1, 2.6) + rnd(-0.4, 0.4), vy: rnd(0.6, 1.8), vz: dirz * rnd(1, 2.6) + rnd(-0.4, 0.4), color: wood, s0: 0.04, s1: 0.12, a: 0.8, life: 0.9, grav: 3 });
    },
    setWeather,
    update(dt, camPos, time, wind = 1) {
      // chips
      for (let i = 0; i < CHIPS; i++) {
        const c = C[i];
        if (c.life <= 0) continue;
        c.life -= dt;
        if (c.leaf) {
          c.vy = Math.max(c.vy - 2.2 * dt, -0.8);
          c.vx += Math.sin(time * 3 + i) * dt * 1.5 * wind;
          c.vz += Math.cos(time * 2.6 + i) * dt * 1.5 * wind;
          c.vx *= 1 - 1.5 * dt;
          c.vz *= 1 - 1.5 * dt;
        } else {
          c.vy -= 9.8 * dt;
          c.vx *= 1 - 0.6 * dt;
          c.vz *= 1 - 0.6 * dt;
        }
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        const gy = ground(c.x, c.z) + 0.01;
        if (c.y < gy) {
          c.y = gy;
          if (!c.bounced && !c.leaf) {
            c.vy = -c.vy * 0.3;
            c.vx *= 0.4;
            c.vz *= 0.4;
            c.bounced = true;
          } else {
            c.vx = c.vz = c.vy = 0;
            c.sx = c.sy = c.sz = 0;
          }
        }
        c.rx += c.sx * dt;
        c.ry += c.sy * dt;
        c.rz += c.sz * dt;
        const fade = Math.min(1, c.life / 0.4);
        _o.position.set(c.x, c.y, c.z);
        _o.rotation.set(c.leaf && c.y <= gy + 0.001 ? 0 : c.rx, c.ry, c.leaf && c.y <= gy + 0.001 ? 0 : c.rz);
        const sc = c.size * fade * (c.leaf ? 1.6 : 1);
        _o.scale.set(sc, sc, sc * (c.leaf ? 1.3 : 1));
        _o.updateMatrix();
        chips.setMatrixAt(i, _o.matrix);
        if (c.life <= 0) {
          _o.position.set(0, -999, 0);
          _o.scale.setScalar(0.0001);
          _o.updateMatrix();
          chips.setMatrixAt(i, _o.matrix);
        }
      }
      chips.instanceMatrix.needsUpdate = true;
      if (chips.instanceColor) chips.instanceColor.needsUpdate = true;
      // puffs
      for (let i = 0; i < PUFFS; i++) {
        const p = P[i];
        if (p.life <= 0) {
          if (pPos[i * 3 + 1] !== -999) {
            pPos[i * 3 + 1] = -999;
            pCol[i * 4 + 3] = 0;
          }
          continue;
        }
        p.life -= dt;
        p.vy -= p.grav * dt;
        p.vx *= 1 - 1.2 * dt;
        p.vz *= 1 - 1.2 * dt;
        p.vy *= 1 - (p.grav ? 0.2 : 1.0) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.grav) {
          const gy = ground(p.x, p.z) + 0.02;
          if (p.y < gy) {
            p.y = gy;
            p.vx = p.vy = p.vz = 0;
          }
        }
        const k = 1 - p.life / p.max;
        pPos[i * 3] = p.x;
        pPos[i * 3 + 1] = p.y;
        pPos[i * 3 + 2] = p.z;
        pCol[i * 4] = p.r;
        pCol[i * 4 + 1] = p.g;
        pCol[i * 4 + 2] = p.b;
        pCol[i * 4 + 3] = p.a * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
        pSize[i] = p.s0 + (p.s1 - p.s0) * Math.sqrt(k);
      }
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.aCol.needsUpdate = true;
      pGeo.attributes.aSize.needsUpdate = true;
      // ambient motes follow the camera in a wrapped box
      aMat.uniforms.uTime.value = time;
      const fall = weather === "snow" ? 0.9 : weather === "leaves" ? 0.7 : weather === "gold" ? -0.05 : 0.03;
      for (let i = 0; i < AMB; i++) {
        const s = aSeed[i];
        let x = aPos[i * 3] + Math.sin(time * 0.4 + s) * dt * 0.35 * wind + (weather === "leaves" || weather === "snow" ? Math.sin(time * 1.3 + s) * dt * 0.5 : 0);
        let y = aPos[i * 3 + 1] - fall * dt * (0.7 + (s % 1) * 0.6) + Math.sin(time * 0.7 + s * 2) * dt * 0.08;
        let z = aPos[i * 3 + 2] + Math.cos(time * 0.35 + s) * dt * 0.35 * wind;
        // wrap around the camera
        const cx = camPos.x;
        const cz = camPos.z;
        if (x - cx > 18) x -= 36;
        if (x - cx < -18) x += 36;
        if (z - cz > 18) z -= 36;
        if (z - cz < -18) z += 36;
        const gy = ground(x, z);
        if (y < gy) y = gy + 10 + (s % 3);
        if (y > gy + 14) y = gy + 0.3;
        aPos[i * 3] = x;
        aPos[i * 3 + 1] = y;
        aPos[i * 3 + 2] = z;
      }
      aGeo.attributes.position.needsUpdate = true;
    },
    setPixelScale(h) {
      pMat.uniforms.uScale.value = h * 0.9;
      aMat.uniforms.uScale.value = h * 0.9;
    },
    clear() {
      for (const c of C) c.life = 0;
      for (const p of P) p.life = 0;
    },
    dispose() {
      scene.remove(chips, puffs, ambient);
      chipGeo.dispose();
      chipMat.dispose();
      chips.dispose();
      pGeo.dispose();
      pMat.dispose();
      aGeo.dispose();
      aMat.dispose();
    },
  };
  // first-frame placement around the origin
  return fx;
}
