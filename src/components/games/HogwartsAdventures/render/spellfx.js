/**
 * Spell visuals driven by the simulation:
 *   bolts      a hot core + a coloured halo (pooled meshes) and a particle
 *              trail; the Patronus gallops as a translucent silver stag-like
 *              guardian built from simple shapes
 *   beams      instant target spells: a tapering ribbon from wand to target
 *   shields    Protego bubble (fresnel), enemy shields, Ron's / Harry's domes,
 *              the Dark Lord's sphere
 *   lumos      a real point light at the wand tip + glow
 *   markers    pulsing rings on objects your equipped spell can affect
 */
import * as THREE from "three";
import { SPELLS } from "../data/spells.js";
import { glowTex } from "./textures.js";

const fresnelVert = `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const fresnelFrag = `uniform vec3 uCol; uniform float uA; uniform float uTime; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); float rip = 0.85 + 0.15 * sin(uTime * 8.0 + vN.y * 12.0);
  gl_FragColor = vec4(uCol * (0.4 + f * 1.8) * rip, (0.08 + f * 0.75) * uA); }`;

function fresnelMat(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(color) }, uA: { value: 1 }, uTime: { value: 0 } },
    vertexShader: fresnelVert,
    fragmentShader: fresnelFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
const rgb = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

export function createSpellFx(scene, fx) {
  const group = new THREE.Group();
  scene.add(group);
  const mats = [];
  const geos = [];
  const glow = glowTex();
  // ---------------------------------------------------------- bolt pool
  const coreGeo = new THREE.SphereGeometry(0.11, 10, 8);
  const haloMat = (c) => {
    const m = new THREE.SpriteMaterial({ map: glow, color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    mats.push(m);
    return m;
  };
  geos.push(coreGeo);
  const coreMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  mats.push(coreMat);
  const pool = [];
  const boltViews = new Map();
  function getBoltView(b) {
    let v = pool.pop();
    if (!v) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(coreGeo, coreMat);
      const halo = new THREE.Sprite(haloMat("#ffffff"));
      halo.scale.setScalar(0.9);
      const halo2 = new THREE.Sprite(haloMat("#ffffff"));
      halo2.scale.setScalar(2.2);
      g.add(core, halo, halo2);
      v = { g, core, halo, halo2 };
    }
    v.halo.material.color.set(b.color || "#ffffff");
    v.halo2.material.color.set(b.color || "#ffffff");
    v.halo2.material.opacity = 0.45;
    const big = b.kind === "patronum";
    v.core.scale.setScalar(big ? 0.1 : b.team === "enemy" ? 1.25 : 1);
    v.halo.scale.setScalar(big ? 1.6 : 0.9);
    v.halo2.scale.setScalar(big ? 4.5 : 2.1);
    v.col = rgb(b.color || "#ffffff");
    v.g.visible = true;
    group.add(v.g);
    return v;
  }
  // ---------------------------------------------------------- patronus guardian
  const patMat = fresnelMat("#cfe6ff");
  mats.push(patMat);
  const pat = new THREE.Group();
  {
    const add = (g, x, y, z, rx = 0, rz = 0) => {
      geos.push(g);
      const m = new THREE.Mesh(g, patMat);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      pat.add(m);
      return m;
    };
    add(new THREE.CapsuleGeometry(0.32, 0.9, 4, 10), 0, 1.15, 0, Math.PI / 2);
    add(new THREE.CapsuleGeometry(0.12, 0.45, 3, 8), 0, 1.55, 0.6, -0.7);
    add(new THREE.CapsuleGeometry(0.13, 0.22, 3, 8), 0, 1.86, 0.88, Math.PI / 2 - 0.3);
    const legs = [];
    for (const [x, z] of [[-0.2, 0.45], [0.2, 0.45], [-0.2, -0.45], [0.2, -0.45]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.0, z);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.75, 3, 6), patMat);
      geos.push(leg.geometry);
      leg.position.y = -0.48;
      pivot.add(leg);
      pat.add(pivot);
      legs.push(pivot);
    }
    for (const s of [-1, 1]) {
      const a = new THREE.Group();
      a.position.set(s * 0.08, 2.0, 0.85);
      a.rotation.set(-0.5, 0, s * 0.6);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.6, 5), patMat);
      geos.push(beam.geometry);
      beam.position.y = 0.3;
      a.add(beam);
      for (let k = 0; k < 2; k++) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.3, 4), patMat);
        geos.push(t.geometry);
        t.position.set(0, 0.25 + k * 0.18, 0.08);
        t.rotation.x = 0.9;
        a.add(t);
      }
      pat.add(a);
    }
    pat.userData.legs = legs;
    pat.visible = false;
    group.add(pat);
  }
  // ---------------------------------------------------------- beams
  const beamGeo = new THREE.PlaneGeometry(1, 1, 1, 8);
  beamGeo.translate(0, 0.5, 0);
  geos.push(beamGeo);
  const beams = [];
  const beamMatOf = (c) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(c) }, uA: { value: 1 }, uT: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uCol; uniform float uA; uniform float uT; varying vec2 vUv; void main(){ float x = abs(vUv.x - 0.5) * 2.0; float core = smoothstep(1.0, 0.0, x); float w = 0.6 + 0.4 * sin(vUv.y * 30.0 - uT * 30.0); gl_FragColor = vec4(mix(uCol, vec3(1.0), core * core * 0.6) * (core * 1.6 + 0.2) * w, core * uA); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    mats.push(m);
    return m;
  };
  // ---------------------------------------------------------- shields
  const sphere = new THREE.SphereGeometry(1, 28, 18);
  geos.push(sphere);
  const shieldMat = fresnelMat("#7fd0ff");
  const counterMat = fresnelMat("#3dff8a");
  mats.push(shieldMat, counterMat);
  const shield = new THREE.Mesh(sphere, shieldMat);
  shield.visible = false;
  group.add(shield);
  const counter = new THREE.Mesh(sphere, counterMat);
  counter.visible = false;
  group.add(counter);
  const enemyShields = new Map();
  const domes = new Map();
  const bossSphereMat = fresnelMat("#5a2a8a");
  mats.push(bossSphereMat);
  const bossSphere = new THREE.Mesh(sphere, bossSphereMat);
  bossSphere.visible = false;
  group.add(bossSphere);
  // ---------------------------------------------------------- lumos
  const lumos = new THREE.PointLight("#fff0c8", 0, 15, 1.6);
  scene.add(lumos);
  const lumosGlow = new THREE.Sprite(haloMat("#fff4d0"));
  lumosGlow.scale.setScalar(0.6);
  lumosGlow.visible = false;
  group.add(lumosGlow);
  // wand flare when charging / casting
  const flare = new THREE.Sprite(haloMat("#ffffff"));
  flare.visible = false;
  group.add(flare);
  // ---------------------------------------------------------- target markers
  const ringGeo = new THREE.RingGeometry(0.55, 0.68, 32);
  geos.push(ringGeo);
  const markers = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    mats.push(m.material);
    m.visible = false;
    group.add(m);
    markers.push(m);
  }

  let t = 0;
  const api = {
    beam(x0, y0, z0, x1, y1, z1, color, fail = false) {
      const m = new THREE.Mesh(beamGeo, beamMatOf(color));
      const d = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
      const L = d.length();
      m.position.set(x0, y0, z0);
      m.scale.set(fail ? 0.12 : 0.22, L, 1);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      group.add(m);
      beams.push({ m, t: 0, dur: fail ? 0.25 : 0.42 });
      fx.sparkle(x1, y1, z1, rgb(color), fail ? 6 : 22, fail ? 2 : 3.5);
    },
    flash(x, y, z, color, s = 1) {
      flare.position.set(x, y, z);
      flare.material.color.set(color);
      flare.scale.setScalar(1.4 * s);
      flare.visible = true;
      flare.userData.t = 0.12;
    },
    update(G, dt, cam, wandTip, actors) {
      t += dt;
      const p = G.player;
      // bolts
      const alive = new Set();
      let patBolt = null;
      for (const b of G.projectiles) {
        alive.add(b.id);
        let v = boltViews.get(b.id);
        if (!v) {
          v = getBoltView(b);
          boltViews.set(b.id, v);
        }
        if (v.color !== b.color) {
          v.halo.material.color.set(b.color);
          v.halo2.material.color.set(b.color);
          v.col = rgb(b.color);
          v.color = b.color;
        }
        v.g.position.set(b.x, b.y, b.z);
        const pulse = 1 + Math.sin(t * 40 + b.id) * 0.12;
        v.halo.scale.setScalar((b.kind === "patronum" ? 1.6 : 0.95) * pulse);
        // trail
        const n = b.kind === "patronum" ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const k = i / n;
          fx.spell(b.x - (b.vx / b.speed) * k * 0.5, b.y - (b.vy / b.speed) * k * 0.5, b.z - (b.vz / b.speed) * k * 0.5, v.col, b.kind === "patronum" ? 0.9 : 0.34, b.kind === "patronum" ? 0.7 : 0.32);
        }
        if (b.kind === "incendio" && Math.random() < 0.6) fx.trail("fire", b.x, b.y, b.z);
        if (b.kind === "curse" && Math.random() < 0.4) fx.spell(b.x, b.y, b.z, [0.1, 0.9, 0.3], 0.6, 0.5, 0.4);
        if (b.kind === "patronum") patBolt = b;
      }
      for (const [id, v] of boltViews)
        if (!alive.has(id)) {
          v.g.visible = false;
          group.remove(v.g);
          pool.push(v);
          boltViews.delete(id);
        }
      // patronus guardian rides the bolt
      pat.visible = !!patBolt;
      if (patBolt) {
        pat.position.set(patBolt.x, patBolt.y - 1.2, patBolt.z);
        pat.rotation.y = Math.atan2(patBolt.vx, patBolt.vz);
        const L = pat.userData.legs;
        L.forEach((l, i) => (l.rotation.x = Math.sin(t * 14 + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.6 : 0)) * 0.7));
        patMat.uniforms.uTime.value = t;
        patMat.uniforms.uA.value = 0.9;
      }
      // beams
      for (let i = beams.length - 1; i >= 0; i--) {
        const B = beams[i];
        B.t += dt;
        B.m.material.uniforms.uA.value = Math.max(0, 1 - B.t / B.dur);
        B.m.material.uniforms.uT.value = t;
        if (B.t >= B.dur) {
          group.remove(B.m);
          B.m.material.dispose();
          beams.splice(i, 1);
        }
      }
      // protego / counter
      const hy = p.y + 1.0;
      shield.visible = p.shieldT > 0 && !p.dead;
      if (shield.visible) {
        const perfect = p.shieldAge < 0.3;
        shield.position.set(p.x, hy, p.z);
        shield.scale.set(1.15, 1.25, 1.15);
        shieldMat.uniforms.uTime.value = t;
        shieldMat.uniforms.uA.value = Math.min(1, p.shieldT * 4) * (perfect ? 1.5 : 1);
        shieldMat.uniforms.uCol.value.set(perfect ? "#b8ecff" : "#6ab8ff");
      }
      counter.visible = p.counterT > 0;
      if (counter.visible) {
        counter.position.set(p.x, hy, p.z);
        counter.scale.setScalar(1.05 + Math.sin(t * 20) * 0.04);
        counterMat.uniforms.uTime.value = t;
      }
      // enemy shields
      const es = new Set();
      for (const e of G.enemies) {
        if (e.dead || !(e.shieldT > 0)) continue;
        es.add(e);
        let m = enemyShields.get(e);
        if (!m) {
          m = new THREE.Mesh(sphere, fresnelMat(e.type === "voldemort" ? "#3dff8a" : "#7fd0ff"));
          group.add(m);
          enemyShields.set(e, m);
        }
        m.position.set(e.x, e.y + 1, e.z);
        m.scale.set(1.1, 1.2, 1.1);
        m.material.uniforms.uTime.value = t;
        m.material.uniforms.uA.value = Math.min(1, e.shieldT * 4);
      }
      for (const [e, m] of enemyShields)
        if (!es.has(e)) {
          group.remove(m);
          m.material.dispose();
          enemyShields.delete(e);
        }
      // domes
      const ds = new Set();
      for (const z of G.zones) {
        if (z.kind !== "dome") continue;
        ds.add(z);
        let m = domes.get(z);
        if (!m) {
          m = new THREE.Mesh(sphere, fresnelMat(z.reflect ? "#ffd27a" : "#7fd0ff"));
          group.add(m);
          domes.set(z, m);
        }
        const k = Math.min(1, z.t * 5) * Math.min(1, (z.dur - z.t) * 3);
        m.position.set(z.x, p.y + 0.2, z.z);
        m.scale.set(z.r * k, z.r * 0.8 * k, z.r * k);
        m.material.uniforms.uTime.value = t;
        m.material.uniforms.uA.value = 0.8;
      }
      for (const [z, m] of domes)
        if (!ds.has(z)) {
          group.remove(m);
          m.material.dispose();
          domes.delete(z);
        }
      // the Dark Lord's sphere
      const boss = G.boss;
      bossSphere.visible = !!(boss && boss.sphere && !boss.e.dead);
      if (bossSphere.visible) {
        const e = boss.e;
        bossSphere.position.set(e.x, e.y + 1, e.z);
        bossSphere.scale.setScalar(2.3 + Math.sin(t * 3) * 0.08);
        bossSphereMat.uniforms.uTime.value = t;
        if (Math.random() < 0.3) fx.spell(e.x + (Math.random() - 0.5) * 3, e.y + 1 + (Math.random() - 0.5) * 3, e.z + (Math.random() - 0.5) * 3, [0.4, 0.15, 0.7], 0.5, 0.6);
      }
      // lumos
      const tip = wandTip;
      const on = p.lumos && !p.dead && tip;
      lumos.intensity += ((on ? (G.P.spells.lumos >= 2 ? 26 : 18) : 0) - lumos.intensity) * Math.min(1, dt * 10);
      lumosGlow.visible = !!on;
      if (tip) {
        // a little ahead of the wand so the light falls on the room, not on the hero's robes
        lumos.position.set(tip.x + Math.sin(G.camYaw) * 1.4, tip.y + 0.5, tip.z + Math.cos(G.camYaw) * 1.4);
        lumosGlow.position.copy(tip);
        lumosGlow.scale.setScalar(0.45 + Math.sin(t * 9) * 0.04);
      }
      lumos.distance = G.P.spells.lumos >= 2 ? 20 : 15;
      if (flare.visible) {
        flare.userData.t -= dt;
        if (flare.userData.t <= 0) flare.visible = false;
      }
      // target markers for the equipped utility spell
      const eq = G.P.equipped;
      const S = SPELLS[eq];
      let mi = 0;
      if (S && S.kind === "target" && !p.dead) {
        for (const o of G.objects.list) {
          if (mi >= markers.length) break;
          if (o.gone || !(o.def.tags || []).includes(eq) || G.objects.invalid(o, eq)) continue;
          const d = Math.hypot(o.tp.x - p.x, o.tp.z - p.z);
          if (d > 30) continue;
          const m = markers[mi++];
          m.visible = true;
          m.position.set(o.tp.x, o.tp.y, o.tp.z);
          m.lookAt(cam.position);
          const s = (o.radius + 0.3) * (1 + Math.sin(t * 4) * 0.08);
          m.scale.setScalar(s);
          m.material.color.set(S.color);
          m.material.opacity = d < 26 ? 0.75 : 0.35;
        }
      }
      for (; mi < markers.length; mi++) markers[mi].visible = false;
      void actors;
    },
    dispose() {
      scene.remove(group);
      scene.remove(lumos);
      for (const B of beams) B.m.material.dispose();
      for (const m of enemyShields.values()) m.material.dispose();
      for (const m of domes.values()) m.material.dispose();
      mats.forEach((m) => m.dispose());
      geos.forEach((g) => g.dispose());
    },
  };
  return api;
}
