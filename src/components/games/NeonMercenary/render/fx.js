/**
 * Pooled combat FX: tracers, muzzle flashes (one shared point light), spark /
 * smoke particles, bullet decals, projectile glows, EMP / shockwave rings,
 * pickups. All pools are fixed-size — nothing is allocated mid-fight.
 */
import * as THREE from "three";
import { glowTex, softTex } from "./textures.js";

const V = new THREE.Vector3();
const Q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 0, 1);
const TRACER_COL = { pistol: "#ffe2a0", heavyPistol: "#ffc070", smg: "#9ff4ff", shotgun: "#ffb070", ar: "#d8ff9a", energy: "#9aa8ff" };

export function createFx(scene, quality = "medium") {
  const group = new THREE.Group();
  scene.add(group);
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);

  /* ---------------------------------------------------- tracers */
  const NT = 48;
  const trGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  trGeo.translate(0, 0, 0.5);
  const trMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, vertexColors: false }));
  const tracers = new THREE.InstancedMesh(trGeo, trMat, NT);
  tracers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NT * 3), 3);
  tracers.frustumCulled = false;
  group.add(tracers);
  const trData = Array.from({ length: NT }, () => ({ life: 0, max: 0.06, a: new THREE.Vector3(), b: new THREE.Vector3(), w: 0.02, col: new THREE.Color() }));
  let trI = 0;
  const M4 = new THREE.Matrix4();
  const S = new THREE.Vector3();

  /* ---------------------------------------------------- particles */
  const NP = quality === "low" ? 160 : quality === "high" ? 520 : 320;
  const pPos = new Float32Array(NP * 3);
  const pCol = new Float32Array(NP * 3);
  const pSize = new Float32Array(NP);
  const pAlpha = new Float32Array(NP);
  const parts = Array.from({ length: NP }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 9, size: 0.1, grow: 0, r: 1, gg: 1, b: 1, smoke: false }));
  const pGeo = keep(new THREE.BufferGeometry());
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  pGeo.setAttribute("aSize", new THREE.BufferAttribute(pSize, 1));
  pGeo.setAttribute("aAlpha", new THREE.BufferAttribute(pAlpha, 1));
  const pMat = keep(
    new THREE.ShaderMaterial({
      uniforms: { map: { value: glowTex() }, uScale: { value: 500 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC = color; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.a, t.a * vA); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  group.add(points);
  // smoke uses normal blending
  const NS = quality === "low" ? 40 : 90;
  const sPos = new Float32Array(NS * 3);
  const sSize = new Float32Array(NS);
  const sAlpha = new Float32Array(NS);
  const smokes = Array.from({ length: NS }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.5 }));
  const sGeo = keep(new THREE.BufferGeometry());
  sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute("aSize", new THREE.BufferAttribute(sSize, 1));
  sGeo.setAttribute("aAlpha", new THREE.BufferAttribute(sAlpha, 1));
  const sMat = keep(
    new THREE.ShaderMaterial({
      uniforms: { map: { value: softTex() }, uScale: { value: 500 }, uColor: { value: new THREE.Color("#5a5a66") } },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 uColor; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(uColor, t.a * vA); }`,
      transparent: true,
      depthWrite: false,
    })
  );
  const smokePts = new THREE.Points(sGeo, sMat);
  smokePts.frustumCulled = false;
  group.add(smokePts);
  let pI = 0;
  let sI = 0;
  function spark(x, y, z, col, n = 8, speed = 4, size = 0.12, life = 0.35, g = 12) {
    const c = new THREE.Color(col);
    for (let i = 0; i < n; i++) {
      const p = parts[pI];
      pI = (pI + 1) % NP;
      p.life = p.max = life * (0.6 + Math.random() * 0.8);
      p.x = x;
      p.y = y;
      p.z = z;
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 2 - 0.6;
      const s = speed * (0.3 + Math.random());
      p.vx = Math.cos(a) * s;
      p.vz = Math.sin(a) * s;
      p.vy = e * s;
      p.g = g;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.grow = 0;
      p.r = c.r;
      p.gg = c.g;
      p.b = c.b;
    }
  }
  function puff(x, y, z, n = 4, size = 0.8, life = 1.4, up = 0.8) {
    for (let i = 0; i < n; i++) {
      const p = smokes[sI];
      sI = (sI + 1) % NS;
      p.life = p.max = life * (0.7 + Math.random() * 0.6);
      p.x = x + (Math.random() - 0.5) * 0.4;
      p.y = y + Math.random() * 0.3;
      p.z = z + (Math.random() - 0.5) * 0.4;
      p.vx = (Math.random() - 0.5) * 0.8;
      p.vy = up * (0.5 + Math.random());
      p.vz = (Math.random() - 0.5) * 0.8;
      p.size = size * (0.6 + Math.random() * 0.8);
    }
  }

  /* ---------------------------------------------------- muzzle flash + light */
  const flashLight = new THREE.PointLight(0xffc070, 0, 9, 2);
  group.add(flashLight);
  let flashT = 0;
  const flashSprite = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  flashSprite.scale.setScalar(0.6);
  flashSprite.visible = false;
  group.add(flashSprite);
  const eFlash = Array.from({ length: 8 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff7050, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    keep(s.material);
    s.visible = false;
    s.userData.t = 0;
    group.add(s);
    return s;
  });
  let efI = 0;

  /* ---------------------------------------------------- decals */
  const ND = 60;
  const decGeo = keep(new THREE.PlaneGeometry(0.14, 0.14));
  const decMat = keep(new THREE.MeshBasicMaterial({ map: glowTex(), color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  const decals = new THREE.InstancedMesh(decGeo, decMat, ND);
  decals.count = 0;
  decals.frustumCulled = false;
  group.add(decals);
  let dI = 0;

  /* ---------------------------------------------------- bolts */
  const NB = 80;
  const boltMat = keep(new THREE.SpriteMaterial({ map: glowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const bolts = Array.from({ length: NB }, () => {
    const s = new THREE.Sprite(boltMat.clone());
    keep(s.material);
    s.visible = false;
    group.add(s);
    return s;
  });
  const trailGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  trailGeo.translate(0, 0, -0.5);
  const trails = new THREE.InstancedMesh(trailGeo, keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })), NB);
  trails.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NB * 3), 3);
  trails.frustumCulled = false;
  group.add(trails);

  /* ---------------------------------------------------- rings (emp / shockwave / spawn) */
  const ringGeo = keep(new THREE.RingGeometry(0.85, 1, 48));
  ringGeo.rotateX(-Math.PI / 2);
  const rings = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    keep(m.material);
    m.visible = false;
    m.userData = { t: 0, max: 0.6, r: 10 };
    group.add(m);
    return m;
  });
  let rI = 0;
  function ring(x, y, z, r, col, dur = 0.6) {
    const m = rings[rI];
    rI = (rI + 1) % rings.length;
    m.position.set(x, y, z);
    m.material.color.set(col);
    m.userData = { t: 0, max: dur, r };
    m.visible = true;
  }

  /* ---------------------------------------------------- pickups */
  const pickupViews = new Map();
  const pickGeo = {
    credits: keep(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 6)),
    ammo: keep(new THREE.BoxGeometry(0.34, 0.2, 0.22)),
    stack: keep(new THREE.OctahedronGeometry(0.2)),
  };
  pickGeo.credits.rotateX(Math.PI / 2);
  const pickMat = {
    credits: keep(new THREE.MeshStandardMaterial({ color: "#ffd36b", emissive: "#ffb02e", emissiveIntensity: 1.6, metalness: 0.9, roughness: 0.3 })),
    ammo: keep(new THREE.MeshStandardMaterial({ color: "#3a4a3a", emissive: "#4dff9a", emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.5 })),
    stack: keep(new THREE.MeshStandardMaterial({ color: "#19f0ff", emissive: "#19f0ff", emissiveIntensity: 2.2, transparent: true, opacity: 0.85, toneMapped: false })),
    quest: keep(new THREE.MeshStandardMaterial({ color: "#ffb02e", emissive: "#ffb02e", emissiveIntensity: 2.6, toneMapped: false })),
  };
  const beamGeo = keep(new THREE.CylinderGeometry(0.05, 0.25, 3, 10, 1, true));
  beamGeo.translate(0, 1.5, 0);
  const beamMat = keep(new THREE.MeshBasicMaterial({ color: "#ffb02e", transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));

  let shake = 0;
  let time = 0;

  /* ---------------------------------------------------- event intake */
  function onEvent(ev, G, muzzleOf) {
    switch (ev.type) {
      case "fire": {
        const m = muzzleOf?.() || V.set(ev.x, ev.y, ev.z);
        flashSprite.position.copy(m);
        flashSprite.visible = true;
        flashSprite.material.color.set(ev.weapon === "energy" ? "#9aa8ff" : "#ffd9a0");
        flashSprite.scale.setScalar(ev.weapon === "shotgun" ? 1.1 : ev.weapon === "energy" ? 0.9 : 0.65);
        flashLight.position.copy(m);
        flashLight.color.set(ev.weapon === "energy" ? "#8090ff" : "#ffb070");
        flashLight.intensity = ev.weapon === "shotgun" ? 26 : 14;
        flashT = 0.06;
        shake = Math.max(shake, ev.weapon === "shotgun" ? 0.35 : ev.weapon === "heavyPistol" ? 0.25 : 0.08);
        G._muzzleWorld = m.clone();
        break;
      }
      case "tracer": {
        const t = trData[trI];
        trI = (trI + 1) % NT;
        const from = G._muzzleWorld || V.set(ev.x0, ev.y0, ev.z0);
        t.a.copy(from);
        t.b.set(ev.x1, ev.y1, ev.z1);
        t.life = t.max = ev.weapon === "energy" ? 0.12 : 0.05;
        t.w = ev.weapon === "energy" ? 0.06 : 0.018;
        t.col.set(TRACER_COL[ev.weapon] || "#ffe2a0");
        break;
      }
      case "etracer": {
        const t = trData[trI];
        trI = (trI + 1) % NT;
        t.a.set(ev.x0, ev.y0, ev.z0);
        t.b.set(ev.x1, ev.y1, ev.z1);
        t.life = t.max = 0.05;
        t.w = 0.016;
        t.col.set("#ff6a50");
        break;
      }
      case "enemyFire": {
        const s = eFlash[efI];
        efI = (efI + 1) % eFlash.length;
        s.position.set(ev.x, ev.y, ev.z);
        s.scale.setScalar(ev.robot ? 0.5 : 0.45);
        s.material.color.set(ev.robot ? "#ffb02e" : "#ff8060");
        s.visible = true;
        s.userData.t = 0.05;
        break;
      }
      case "laserFire": {
        const t = trData[trI];
        trI = (trI + 1) % NT;
        t.a.set(ev.x0, ev.y0, ev.z0);
        t.b.set(ev.x1, ev.y1, ev.z1);
        t.life = t.max = 0.18;
        t.w = 0.09;
        t.col.set(ev.color || "#ff2050");
        shake = Math.max(shake, 0.3);
        break;
      }
      case "impact": {
        const col = ev.kind === "orb" ? "#ff6bf0" : ev.color || (ev.kind === "wall" ? "#ffd9a0" : "#ff6a50");
        spark(ev.x, ev.y, ev.z, col, ev.small ? 3 : ev.kind === "orb" ? 14 : 6, ev.kind === "orb" ? 6 : 3.5, 0.08);
        if (ev.kind === "wall" && !ev.small) {
          puff(ev.x, ev.y, ev.z, 1, 0.35, 0.6, 0.3);
          // bullet decal
          const n = V.set(ev.nx || 0, ev.ny || 0, ev.nz || 0);
          if (n.lengthSq() > 0) {
            Q.setFromUnitVectors(UP, n);
            M4.compose(V.set(ev.x + n.x * 0.01, ev.y + n.y * 0.01, ev.z + n.z * 0.01), Q, S.set(1, 1, 1));
            decals.setMatrixAt(dI, M4);
            dI = (dI + 1) % ND;
            decals.count = Math.max(decals.count, dI);
            decals.instanceMatrix.needsUpdate = true;
          }
        }
        break;
      }
      case "dmg":
        spark(ev.x, ev.y, ev.z, ev.crit ? "#ffe14d" : "#ff4040", ev.crit ? 10 : 5, 3, 0.09, 0.3);
        break;
      case "kill":
        if (ev.robot) {
          spark(ev.x, ev.y, ev.z, "#ffb02e", 26, 7, 0.14, 0.7);
          puff(ev.x, ev.y, ev.z, 6, 1.2, 2.2, 1);
          flashLight.position.set(ev.x, ev.y + 0.5, ev.z);
          flashLight.color.set("#ff8a3d");
          flashLight.intensity = 40;
          flashT = 0.18;
          shake = Math.max(shake, 0.25);
        }
        break;
      case "bossDown":
        spark(ev.x, ev.y + 0.5, ev.z, "#ffffff", 50, 9, 0.2, 1.2);
        puff(ev.x, ev.y, ev.z, 12, 2, 3, 1.2);
        ring(ev.x, 0.1, ev.z, 16, "#ffffff", 1.2);
        shake = 1;
        break;
      case "emp":
        ring(ev.x, 0.15, ev.z, ev.r, "#b9fbff", 0.55);
        ring(ev.x, 1.1, ev.z, ev.r * 0.8, "#7b8cff", 0.45);
        spark(ev.x, ev.y, ev.z, "#b9fbff", 30, 9, 0.12, 0.5, 2);
        shake = Math.max(shake, 0.3);
        break;
      case "shockwave":
        ring(ev.x, 0.12, ev.z, ev.r, "#ff8a1f", 0.45);
        spark(ev.x, 0.3, ev.z, "#ffb02e", 24, 8, 0.15, 0.6);
        puff(ev.x, 0.2, ev.z, 8, 1.4, 1.6, 0.6);
        shake = Math.max(shake, 0.8);
        break;
      case "spawnFx":
      case "teleport":
        ring(ev.x ?? G.player.x, 0.1, ev.z ?? G.player.z, 2.5, ev.color || "#ff2bd6", 0.5);
        spark(ev.x ?? G.player.x, ev.y ?? 1, ev.z ?? G.player.z, ev.color || "#ff2bd6", 16, 4, 0.1, 0.5, 0);
        break;
      case "cloak":
        if (!ev.on && ev.x != null) spark(ev.x, ev.y, ev.z, "#9fe7ff", 18, 4, 0.1, 0.5, 0);
        break;
      case "shieldBreak":
        spark(ev.x, ev.y, ev.z, "#7b8cff", 20, 5, 0.12, 0.5, 2);
        break;
      case "armorBreak":
        spark(ev.x, ev.y, ev.z, "#ffb02e", 40, 8, 0.15, 0.8);
        puff(ev.x, ev.y, ev.z, 8, 1.2, 2, 0.8);
        shake = 0.6;
        break;
      case "hurt":
        shake = Math.max(shake, Math.min(0.5, ev.amount / 40));
        break;
      case "ability":
        if (ev.effect !== "emp") ring(G.player.x, 0.1, G.player.z, 3, ev.effect === "shield" ? "#7b8cff" : ev.effect === "neural" ? "#ff2bd6" : "#19f0ff", 0.4);
        break;
      case "meleeHit":
        shake = Math.max(shake, 0.18);
        break;
    }
  }

  /* ---------------------------------------------------- per frame */
  function update(dt, G, cam) {
    time += dt;
    // tracers
    for (let i = 0; i < NT; i++) {
      const t = trData[i];
      if (t.life > 0) {
        t.life -= dt;
        const k = Math.max(0, t.life / t.max);
        V.subVectors(t.b, t.a);
        const L = V.length();
        Q.setFromUnitVectors(UP, V.normalize());
        M4.compose(t.a, Q, S.set(t.w * (0.5 + k), t.w * (0.5 + k), L));
        tracers.setMatrixAt(i, M4);
        tracers.setColorAt(i, t.col.clone().multiplyScalar(1.5 * k + 0.3));
      } else {
        M4.makeScale(0, 0, 0);
        tracers.setMatrixAt(i, M4);
      }
    }
    tracers.instanceMatrix.needsUpdate = true;
    if (tracers.instanceColor) tracers.instanceColor.needsUpdate = true;
    // flash
    flashT -= dt;
    if (flashT <= 0) {
      flashLight.intensity = 0;
      flashSprite.visible = false;
    } else flashLight.intensity *= 0.6;
    for (const s of eFlash) {
      if (!s.visible) continue;
      s.userData.t -= dt;
      if (s.userData.t <= 0) s.visible = false;
    }
    // sparks
    for (let i = 0; i < NP; i++) {
      const p = parts[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.02) {
          p.y = 0.02;
          p.vy *= -0.3;
          p.vx *= 0.6;
          p.vz *= 0.6;
        }
        const k = Math.max(0, p.life / p.max);
        pPos[i * 3] = p.x;
        pPos[i * 3 + 1] = p.y;
        pPos[i * 3 + 2] = p.z;
        pCol[i * 3] = p.r * 2;
        pCol[i * 3 + 1] = p.gg * 2;
        pCol[i * 3 + 2] = p.b * 2;
        pSize[i] = p.size;
        pAlpha[i] = k;
      } else pAlpha[i] = 0;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
    pGeo.attributes.aSize.needsUpdate = true;
    pGeo.attributes.aAlpha.needsUpdate = true;
    for (let i = 0; i < NS; i++) {
      const p = smokes[i];
      if (p.life > 0) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const k = Math.max(0, p.life / p.max);
        sPos[i * 3] = p.x;
        sPos[i * 3 + 1] = p.y;
        sPos[i * 3 + 2] = p.z;
        sSize[i] = p.size * (1 + (1 - k) * 2);
        sAlpha[i] = k * 0.5;
      } else sAlpha[i] = 0;
    }
    sGeo.attributes.position.needsUpdate = true;
    sGeo.attributes.aSize.needsUpdate = true;
    sGeo.attributes.aAlpha.needsUpdate = true;
    // bolts
    for (let i = 0; i < NB; i++) {
      const b = G.bolts[i];
      const s = bolts[i];
      if (!b) {
        s.visible = false;
        M4.makeScale(0, 0, 0);
        trails.setMatrixAt(i, M4);
        continue;
      }
      s.visible = true;
      s.position.set(b.x, b.y, b.z);
      s.material.color.set(b.color);
      s.scale.setScalar(b.size * (b.hp ? 3.6 + Math.sin(time * 20) * 0.4 : 3.2));
      V.set(b.vx, b.vy, b.vz);
      const sp = V.length();
      Q.setFromUnitVectors(UP, V.normalize());
      M4.compose(s.position, Q, S.set(b.size * 0.7, b.size * 0.7, Math.min(2.2, sp * 0.05)));
      trails.setMatrixAt(i, M4);
      trails.setColorAt(i, s.material.color);
    }
    trails.instanceMatrix.needsUpdate = true;
    if (trails.instanceColor) trails.instanceColor.needsUpdate = true;
    // rings
    for (const m of rings) {
      if (!m.visible) continue;
      m.userData.t += dt;
      const k = m.userData.t / m.userData.max;
      if (k >= 1) {
        m.visible = false;
        continue;
      }
      m.scale.setScalar(0.2 + m.userData.r * k);
      m.material.opacity = (1 - k) * 0.9;
    }
    // pickups
    const live = new Set();
    for (const p of G.pickups) {
      live.add(p.id);
      let v = pickupViews.get(p.id);
      if (!v) {
        const quest = p.kind === "stack" && (p.big || p.mission);
        v = new THREE.Group();
        const mesh = new THREE.Mesh(pickGeo[p.kind] || pickGeo.stack, quest ? pickMat.quest : pickMat[p.kind] || pickMat.stack);
        mesh.scale.setScalar(quest ? 1.4 : 1);
        v.add(mesh);
        if (quest) v.add(new THREE.Mesh(beamGeo, beamMat));
        v.userData.mesh = mesh;
        group.add(v);
        pickupViews.set(p.id, v);
      }
      v.position.set(p.x, (p.y || 0) + 0.45 + Math.sin(time * 3 + p.id) * 0.08, p.z);
      v.userData.mesh.rotation.y += dt * 2.5;
    }
    for (const [id, v] of pickupViews)
      if (!live.has(id)) {
        group.remove(v);
        pickupViews.delete(id);
      }
    shake = Math.max(0, shake - dt * 2.2);
    void cam;
  }

  return {
    onEvent,
    update,
    spark,
    puff,
    get shake() {
      return shake;
    },
    addShake(v) {
      shake = Math.max(shake, v);
    },
    setScale(h) {
      pMat.uniforms.uScale.value = h * 0.9;
      sMat.uniforms.uScale.value = h * 0.9;
    },
    clear() {
      for (const t of trData) t.life = 0;
      for (const p of parts) p.life = 0;
      for (const p of smokes) p.life = 0;
      decals.count = 0;
      dI = 0;
      for (const [, v] of pickupViews) group.remove(v);
      pickupViews.clear();
    },
    dispose() {
      this.clear();
      scene.remove(group);
      for (const d of disposables) d.dispose?.();
      tracers.dispose();
      decals.dispose();
      trails.dispose();
    },
  };
}
