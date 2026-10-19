/**
 * Hulk: Open World 3D — effects (all pooled, nothing allocated per frame).
 *
 *  particles   GPU billboards (one instanced draw each for additive fire /
 *              sparks / flashes and alpha smoke / dust / spray); per-particle
 *              velocity, drag, gravity, growth and colour ramp
 *  debris      physical chunks (box instances) that bounce and settle
 *  rings       expanding shockwave rings · craters (ground decals)
 *  flashes     a fixed set of point lights (no shader recompiles)
 *  projectiles tracer streaks, rockets with smoke trails, plasma orbs
 *  telegraphs  boss attack circles, beams, shock rings; objective pillars
 */
import * as THREE from "three";

const MAXP = 2600;
const MAXD = 260;

function particleSystem(scene, additive) {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute("position", quad.attributes.position);
  geo.setAttribute("uv", quad.attributes.uv);
  const off = new Float32Array(MAXP * 3);
  const sz = new Float32Array(MAXP * 2); // size, rotation
  const col = new Float32Array(MAXP * 4);
  geo.setAttribute("aOff", new THREE.InstancedBufferAttribute(off, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aSz", new THREE.InstancedBufferAttribute(sz, 2).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aCol", new THREE.InstancedBufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uSoft: { value: additive ? 1.0 : 0.0 } },
    vertexShader: `attribute vec3 aOff; attribute vec2 aSz; attribute vec4 aCol; varying vec4 vCol; varying vec2 vUv;
      void main(){ vCol = aCol; vUv = uv; vec4 mv = modelViewMatrix * vec4(aOff, 1.0); float c = cos(aSz.y), s = sin(aSz.y);
      vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aSz.x; mv.xy += p; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec4 vCol; varying vec2 vUv; uniform float uSoft;
      void main(){ vec2 d = vUv - 0.5; float r = length(d) * 2.0; float a = uSoft > 0.5 ? pow(max(0.0, 1.0 - r), 1.6) : smoothstep(1.0, 0.35, r) * (0.85 + 0.15 * sin(vUv.x * 9.0 + vUv.y * 7.0));
      if (a <= 0.003) discard; gl_FragColor = vec4(vCol.rgb, vCol.a * a); }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = additive ? 5 : 4;
  scene.add(mesh);
  const P = [];
  for (let i = 0; i < MAXP; i++) P.push({ alive: false });
  let cursor = 0;
  return {
    mesh,
    spawn(o) {
      for (let k = 0; k < MAXP; k++) {
        cursor = (cursor + 1) % MAXP;
        if (!P[cursor].alive) break;
      }
      const p = P[cursor];
      p.alive = true;
      p.x = o.x;
      p.y = o.y;
      p.z = o.z;
      p.vx = o.vx || 0;
      p.vy = o.vy || 0;
      p.vz = o.vz || 0;
      p.life = o.life || 1;
      p.age = 0;
      p.s0 = o.s0 ?? 1;
      p.s1 = o.s1 ?? p.s0;
      p.c0 = o.c0 || [1, 1, 1, 1];
      p.c1 = o.c1 || [p.c0[0], p.c0[1], p.c0[2], 0];
      p.g = o.g || 0;
      p.drag = o.drag ?? 1.5;
      p.rot = o.rot ?? Math.random() * 6.28;
      p.spin = o.spin || 0;
    },
    update(dt) {
      let n = 0;
      for (let i = 0; i < MAXP; i++) {
        const p = P[i];
        if (!p.alive) continue;
        p.age += dt;
        if (p.age >= p.life) {
          p.alive = false;
          continue;
        }
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vz *= k;
        p.vy = p.vy * k - p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.rot += p.spin * dt;
        const u = p.age / p.life;
        off[n * 3] = p.x;
        off[n * 3 + 1] = p.y;
        off[n * 3 + 2] = p.z;
        sz[n * 2] = p.s0 + (p.s1 - p.s0) * u;
        sz[n * 2 + 1] = p.rot;
        for (let j = 0; j < 4; j++) col[n * 4 + j] = p.c0[j] + (p.c1[j] - p.c0[j]) * u;
        n++;
      }
      geo.instanceCount = n;
      geo.attributes.aOff.needsUpdate = true;
      geo.attributes.aSz.needsUpdate = true;
      geo.attributes.aCol.needsUpdate = true;
      geo.attributes.aOff.addUpdateRange?.(0, n * 3);
    },
    clear() {
      for (const p of P) p.alive = false;
    },
    dispose() {
      scene.remove(mesh);
      geo.dispose();
      quad.dispose();
      mat.dispose();
    },
  };
}

export function createFx(scene, city, { quality = "high" } = {}) {
  const lowQ = quality === "low";
  const add = particleSystem(scene, true);
  const alpha = particleSystem(scene, false);
  const R = Math.random;
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);

  /* ---------------------------------------------------------------- debris chunks */
  const dGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  const dMat = keep(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 }));
  const debris = new THREE.InstancedMesh(dGeo, dMat, MAXD);
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debris.castShadow = !lowQ;
  debris.frustumCulled = false;
  scene.add(debris);
  const D = [];
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAXD; i++) {
    D.push({ alive: false });
    debris.setMatrixAt(i, zero);
    debris.setColorAt(i, new THREE.Color("#888"));
  }
  let dCur = 0;
  const DCOL = { metal: ["#5b6066", "#2c2f33", "#8a8f94"], wood: ["#8a5d34", "#a77a47", "#5e3e22"], concrete: ["#9a958c", "#7d786f", "#b5b0a6"], dirt: ["#8a7a52", "#6e6040"], glass: ["#9fc4d8"], robot: ["#7d838a", "#3b4046", "#c98a1f"], rock: ["#6e665c", "#8a8276"] };
  const tmpC = new THREE.Color();
  function chunk(x, y, z, kind, s, dx = 0, dz = 0, speed = 9) {
    dCur = (dCur + 1) % MAXD;
    const d = D[dCur];
    const a = R() * Math.PI * 2;
    const sp = speed * (0.4 + R() * 0.8);
    d.alive = true;
    d.x = x;
    d.y = y;
    d.z = z;
    d.vx = Math.cos(a) * sp * 0.7 + dx * speed * 0.6;
    d.vz = Math.sin(a) * sp * 0.7 + dz * speed * 0.6;
    d.vy = 4 + R() * speed;
    d.rx = R() * 6;
    d.ry = R() * 6;
    d.wx = (R() - 0.5) * 14;
    d.wy = (R() - 0.5) * 14;
    d.s = s * (0.5 + R() * 0.8);
    d.sx = d.s * (0.6 + R() * 0.8);
    d.sy = d.s * (0.4 + R() * 0.6);
    d.sz = d.s * (0.6 + R() * 0.8);
    d.age = 0;
    d.life = 3 + R() * 2.5;
    d.rest = false;
    const pal = DCOL[kind] || DCOL.concrete;
    tmpC.set(pal[Math.floor(R() * pal.length)]);
    debris.setColorAt(dCur, tmpC);
    debris.instanceColor.needsUpdate = true;
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sv = new THREE.Vector3();

  /* ---------------------------------------------------------------- rings, craters, lights */
  const ringGeo = keep(new THREE.RingGeometry(0.82, 1, 48, 1).rotateX(-Math.PI / 2));
  const rings = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.MeshBasicMaterial({ color: "#fff1d0", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    keep(m);
    const r = new THREE.Mesh(ringGeo, m);
    r.visible = false;
    r.renderOrder = 6;
    scene.add(r);
    rings.push({ mesh: r, t: 0, life: 0.5, r0: 1, r1: 10 });
  }
  let ringCur = 0;
  function ring(x, y, z, r1, color = "#fff1d0", life = 0.5, r0 = 1) {
    ringCur = (ringCur + 1) % rings.length;
    const R0 = rings[ringCur];
    R0.mesh.position.set(x, y + 0.15, z);
    R0.mesh.material.color.set(color);
    R0.mesh.visible = true;
    R0.t = 0;
    R0.life = life;
    R0.r0 = r0;
    R0.r1 = r1;
  }
  const craterTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, "rgba(20,16,12,0.95)");
    gr.addColorStop(0.55, "rgba(35,30,24,0.7)");
    gr.addColorStop(1, "rgba(35,30,24,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(10,8,6,0.8)";
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + R() * 0.4;
      g.beginPath();
      g.moveTo(64, 64);
      g.lineTo(64 + Math.cos(a) * (40 + R() * 22), 64 + Math.sin(a) * (40 + R() * 22));
      g.lineWidth = 1 + R() * 2;
      g.stroke();
    }
    return keep(new THREE.CanvasTexture(c));
  })();
  const craterGeo = keep(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
  const craters = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.MeshBasicMaterial({ map: craterTex, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 });
    keep(m);
    const c = new THREE.Mesh(craterGeo, m);
    c.visible = false;
    c.renderOrder = 1;
    scene.add(c);
    craters.push({ mesh: c, t: 0 });
  }
  let crCur = 0;
  function crater(x, y, z, r) {
    crCur = (crCur + 1) % craters.length;
    const c = craters[crCur];
    c.mesh.position.set(x, y + 0.04, z);
    c.mesh.scale.setScalar(r);
    c.mesh.rotation.y = R() * 6;
    c.mesh.visible = true;
    c.mesh.material.opacity = 0.9;
    c.t = 0;
  }
  const lights = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.PointLight("#ffb060", 0, 30, 2);
    scene.add(l);
    lights.push({ l, t: 0, life: 0.3, i0: 0 });
  }
  let lCur = 0;
  function flash(x, y, z, intensity, dist, color = "#ffb060", life = 0.35) {
    lCur = (lCur + 1) % lights.length;
    const L = lights[lCur];
    L.l.position.set(x, y, z);
    L.l.color.set(color);
    L.l.distance = dist;
    L.i0 = intensity;
    L.t = 0;
    L.life = life;
  }

  /* ---------------------------------------------------------------- projectile meshes */
  const tracerGeo = keep(new THREE.BoxGeometry(0.08, 0.08, 2.4));
  const tracerMat = keep(new THREE.MeshBasicMaterial({ color: "#ffd27a", transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  const tracers = new THREE.InstancedMesh(tracerGeo, tracerMat, 160);
  tracers.frustumCulled = false;
  scene.add(tracers);
  const orbGeo = keep(new THREE.SphereGeometry(1, 12, 8));
  const orbMat = keep(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  const orbs = new THREE.InstancedMesh(orbGeo, orbMat, 120);
  orbs.frustumCulled = false;
  for (let i = 0; i < 120; i++) orbs.setColorAt(i, new THREE.Color("#fff"));
  scene.add(orbs);
  const rocketGeo = keep(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 8).rotateX(Math.PI / 2));
  const rocketMat = keep(new THREE.MeshStandardMaterial({ color: "#3d4238", roughness: 0.6 }));
  const rockets = new THREE.InstancedMesh(rocketGeo, rocketMat, 60);
  rockets.frustumCulled = false;
  scene.add(rockets);
  const PCOL = { blast: "#ff3b2a", blast3: "#ff7a1a", orb: "#6ef4ff", laser: "#ff2a5a", shell: "#ffcf6a" };

  /* ---------------------------------------------------------------- telegraphs + markers */
  const discGeo = keep(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2));
  const tele = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.MeshBasicMaterial({ color: "#ff2a1a", transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
    keep(m);
    const fill = new THREE.Mesh(discGeo, m);
    const rm = new THREE.MeshBasicMaterial({ color: "#ff3a1a", transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    keep(rm);
    const edge = new THREE.Mesh(ringGeo, rm);
    fill.visible = edge.visible = false;
    fill.renderOrder = edge.renderOrder = 3;
    scene.add(fill, edge);
    tele.push({ fill, edge });
  }
  const beamGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5));
  const beams = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.MeshBasicMaterial({ color: "#ff2a3a", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    keep(m);
    const b = new THREE.Mesh(beamGeo, m);
    b.visible = false;
    b.frustumCulled = false;
    scene.add(b);
    beams.push(b);
  }
  const bossRing = new THREE.Mesh(ringGeo, keep(new THREE.MeshBasicMaterial({ color: "#ffb03a", transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
  bossRing.visible = false;
  scene.add(bossRing);
  // objective pillars + zone rings
  const pillarGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0));
  const pillars = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    keep(m);
    const p = new THREE.Mesh(pillarGeo, m);
    p.visible = false;
    p.renderOrder = 7;
    scene.add(p);
    const rm = new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    keep(rm);
    const r = new THREE.Mesh(ringGeo, rm);
    r.visible = false;
    scene.add(r);
    pillars.push({ p, r });
  }

  /* ---------------------------------------------------------------- spawners */
  const fire = (x, y, z, s = 1) => add.spawn({ x: x + (R() - 0.5) * s, y, z: z + (R() - 0.5) * s, vy: 2 + R() * 2.5, vx: (R() - 0.5) * 1.2, vz: (R() - 0.5) * 1.2, life: 0.5 + R() * 0.5, s0: 1.4 * s, s1: 0.3 * s, c0: [1, 0.55 + R() * 0.2, 0.15, 0.9], c1: [0.8, 0.15, 0.05, 0], drag: 1, spin: (R() - 0.5) * 2 });
  const smoke = (x, y, z, s = 1, dark = 0.18) => alpha.spawn({ x: x + (R() - 0.5) * s, y, z: z + (R() - 0.5) * s, vy: 1.5 + R() * 2, vx: (R() - 0.5) * 1.5 + 0.6, vz: (R() - 0.5) * 1.5, life: 2.2 + R() * 1.6, s0: 1.2 * s, s1: 4 * s, c0: [dark, dark, dark * 1.05, 0.55], c1: [dark + 0.15, dark + 0.15, dark + 0.17, 0], drag: 0.6, spin: (R() - 0.5) * 0.6 });
  const dust = (x, y, z, s = 1, sp = 6) => {
    const a = R() * Math.PI * 2;
    alpha.spawn({ x, y, z, vx: Math.cos(a) * sp * (0.5 + R() * 0.7), vz: Math.sin(a) * sp * (0.5 + R() * 0.7), vy: 0.5 + R() * 2, life: 1.2 + R() * 1.2, s0: 1.4 * s, s1: 4.5 * s, c0: [0.62, 0.57, 0.48, 0.55], c1: [0.7, 0.66, 0.58, 0], drag: 2.2, spin: (R() - 0.5) });
  };
  const spark = (x, y, z, n = 8, c = [1, 0.8, 0.4, 1], sp = 10) => {
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2;
      const b = R() * 1.2;
      add.spawn({ x, y, z, vx: Math.cos(a) * sp * (0.4 + R()), vz: Math.sin(a) * sp * (0.4 + R()), vy: Math.sin(b) * sp, life: 0.25 + R() * 0.35, s0: 0.25, s1: 0.05, c0: c, c1: [c[0], c[1] * 0.4, c[2] * 0.2, 0], g: 18, drag: 0.8 });
    }
  };
  function explosion(x, y, z, r, big) {
    const n = lowQ ? 10 : big ? 26 : 16;
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2;
      const u = R();
      add.spawn({ x, y: y + R() * r * 0.4, z, vx: Math.cos(a) * r * 2.2 * u, vz: Math.sin(a) * r * 2.2 * u, vy: 2 + R() * r * 1.6, life: 0.45 + R() * 0.5, s0: r * 0.7, s1: r * 0.25, c0: [1, 0.75, 0.3, 1], c1: [0.9, 0.2, 0.04, 0], drag: 3.5 });
    }
    for (let i = 0; i < (lowQ ? 6 : 12); i++) smoke(x + (R() - 0.5) * r, y + R() * r * 0.6, z + (R() - 0.5) * r, r * 0.45, 0.12);
    add.spawn({ x, y: y + 1, z, life: 0.18, s0: r * 3.2, s1: r * 4, c0: [1, 0.9, 0.7, 0.9], c1: [1, 0.6, 0.2, 0], drag: 0 });
    spark(x, y + 0.5, z, big ? 20 : 12, [1, 0.75, 0.35, 1], r * 3);
    for (let i = 0; i < (big ? 10 : 5); i++) chunk(x, y + 0.5, z, "metal", 0.35 + r * 0.04, 0, 0, r * 2.2);
    ring(x, y, z, r * 2.1, "#ffcf8a", 0.45);
    crater(x, y, z, r * 0.55);
    flash(x, y + 2, z, big ? 60 : 35, r * 7, "#ffa050", 0.45);
  }

  function handle(f) {
    switch (f.type) {
      case "spark":
        spark(f.x, f.y, f.z, f.n || 8);
        break;
      case "splinter":
        for (let i = 0; i < (f.n || 4); i++) chunk(f.x, f.y, f.z, "wood", 0.18, 0, 0, 6);
        break;
      case "debris": {
        const n = lowQ ? Math.ceil(f.n / 2) : f.n;
        for (let i = 0; i < n; i++) chunk(f.x, f.y, f.z, f.kind, 0.2 + (f.s || 1) * 0.16, f.dx, f.dz, 8);
        for (let i = 0; i < 4; i++) dust(f.x, f.y - 0.3, f.z, 0.6 + (f.s || 1) * 0.3, 3);
        break;
      }
      case "dust":
        for (let i = 0; i < Math.min(16, 4 + (f.r || 2) * 2); i++) dust(f.x, f.y, f.z, (f.r || 2) * 0.35, (f.r || 2) * 2.4);
        break;
      case "explosion":
        explosion(f.x, f.y, f.z, f.r || 4, false);
        break;
      case "bigExplosion":
        explosion(f.x, f.y, f.z, f.r || 7, true);
        break;
      case "shockwave":
        ring(f.x, f.y, f.z, f.r, f.rage ? "#7dff5a" : f.soft ? "#cfe9ff" : "#fff1d0", f.soft ? 0.35 : 0.55);
        if (!f.soft) {
          for (let i = 0; i < Math.min(28, f.r * 2.5); i++) {
            const a = (i / Math.min(28, f.r * 2.5)) * Math.PI * 2;
            alpha.spawn({ x: f.x + Math.cos(a) * 1.5, y: f.y + 0.3, z: f.z + Math.sin(a) * 1.5, vx: Math.cos(a) * f.r * 2.4, vz: Math.sin(a) * f.r * 2.4, vy: 0.6 + R(), life: 0.8 + R() * 0.5, s0: 1.6, s1: 3.8, c0: [0.65, 0.6, 0.5, 0.6], c1: [0.7, 0.66, 0.58, 0], drag: 3 });
          }
          for (let i = 0; i < 8; i++) chunk(f.x + (R() - 0.5) * 3, f.y + 0.3, f.z + (R() - 0.5) * 3, "rock", 0.3, 0, 0, 7);
        }
        break;
      case "crater":
        crater(f.x, f.y, f.z, f.r);
        break;
      case "impact":
        spark(f.x, f.y, f.z, f.big ? 14 : 7, [1, 1, 0.85, 1], f.big ? 12 : 7);
        add.spawn({ x: f.x, y: f.y, z: f.z, life: 0.12, s0: f.big ? 3.5 : 2, s1: f.big ? 5 : 2.8, c0: [1, 1, 0.9, 0.8], c1: [1, 0.9, 0.6, 0], drag: 0 });
        if (f.big) ring(f.x, f.y - 1, f.z, 5, "#ffffff", 0.25);
        break;
      case "clap": {
        const fx = Math.sin(f.h);
        const fz = Math.cos(f.h);
        for (let i = 0; i < 40; i++) {
          const sp = (R() - 0.5) * 1.1;
          const dx = fx * Math.cos(sp) - fz * Math.sin(sp) * 0;
          const ang = f.h + sp;
          alpha.spawn({ x: f.x, y: f.y + (R() - 0.5) * 2, z: f.z, vx: Math.sin(ang) * (25 + R() * 15), vz: Math.cos(ang) * (25 + R() * 15), vy: (R() - 0.3) * 3, life: 0.6 + R() * 0.3, s0: 1.2, s1: 4.5, c0: [0.85, 0.9, 1, 0.5], c1: [0.9, 0.95, 1, 0], drag: 3.2 });
          void dx;
        }
        add.spawn({ x: f.x, y: f.y, z: f.z, life: 0.15, s0: 4, s1: 7, c0: [0.9, 0.95, 1, 0.9], c1: [1, 1, 1, 0], drag: 0 });
        break;
      }
      case "hit":
        spark(f.x, f.y, f.z, f.n || 5, f.robot ? [1, 0.8, 0.3, 1] : [0.9, 0.25, 0.2, 0.9], 6);
        if (f.robot && R() < 0.5) chunk(f.x, f.y, f.z, "robot", 0.18, 0, 0, 6);
        break;
      case "hitHero":
        spark(f.x, f.y, f.z, 4, f.kind === "laser" ? [1, 0.2, 0.4, 1] : [1, 0.85, 0.5, 1], 5);
        break;
      case "ricochet":
        spark(f.x, f.y, f.z, 3, [1, 0.85, 0.5, 1], 6);
        if (f.kind === "blast" || f.kind === "blast3") add.spawn({ x: f.x, y: f.y, z: f.z, life: 0.2, s0: 1.4, s1: 2.4, c0: [1, 0.4, 0.2, 0.9], c1: [1, 0.2, 0.1, 0], drag: 0 });
        break;
      case "muzzle":
        add.spawn({ x: f.x, y: f.y, z: f.z, life: 0.06, s0: f.kind === "bullet" ? 0.7 : 1.5, s1: 0.4, c0: f.kind === "blast" || f.kind === "blast3" ? [1, 0.3, 0.2, 1] : [1, 0.85, 0.45, 1], c1: [1, 0.5, 0.2, 0], drag: 0 });
        break;
      case "spray":
        sprays.push({ x: f.x, y: f.y, z: f.z, t: f.t });
        break;
      case "splash":
        for (let i = 0; i < 8; i++) alpha.spawn({ x: f.x, y: f.y, z: f.z, vx: (R() - 0.5) * 3, vz: (R() - 0.5) * 3, vy: 4 + R() * 3, life: 0.7, s0: 0.5, s1: 1.2, c0: [0.8, 0.9, 1, 0.6], c1: [0.9, 0.95, 1, 0], g: 12, drag: 0.5 });
        break;
      case "shieldHit":
        add.spawn({ x: f.x, y: f.y, z: f.z, life: 0.25, s0: 3, s1: 5, c0: [0.4, 0.95, 1, 0.8], c1: [0.4, 0.9, 1, 0], drag: 0 });
        break;
      default:
    }
  }
  const sprays = [];

  /* ---------------------------------------------------------------- per frame */
  const tmpM = new THREE.Matrix4();
  const tq = new THREE.Quaternion();
  const fwd = new THREE.Vector3(0, 0, 1);
  const dir = new THREE.Vector3();
  let emitT = 0;
  function update(sim, dt, cam, time) {
    // effect requests from the sim
    for (const f of sim.fx) handle(f);
    sim.fx.length = 0;
    // debris physics
    let dirtyD = false;
    for (let i = 0; i < MAXD; i++) {
      const d = D[i];
      if (!d.alive) continue;
      d.age += dt;
      if (d.age > d.life) {
        d.alive = false;
        debris.setMatrixAt(i, zero);
        dirtyD = true;
        continue;
      }
      if (!d.rest) {
        d.vy -= 26 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        d.rx += d.wx * dt;
        d.ry += d.wy * dt;
        const gy = sim.col.groundAt(d.x, d.z, d.y + 0.3, 0.3, 0.1, false).y + d.sy * 0.5;
        if (d.y < gy) {
          d.y = gy;
          d.vy *= -0.3;
          d.vx *= 0.55;
          d.vz *= 0.55;
          d.wx *= 0.5;
          d.wy *= 0.5;
          if (Math.abs(d.vy) < 1.2 && Math.hypot(d.vx, d.vz) < 1) d.rest = true;
        }
      }
      const fade = d.age > d.life - 0.6 ? (d.life - d.age) / 0.6 : 1;
      e.set(d.rx, d.ry, 0);
      q.setFromEuler(e);
      v.set(d.x, d.y, d.z);
      sv.set(d.sx * fade, d.sy * fade, d.sz * fade);
      m4.compose(v, q, sv);
      debris.setMatrixAt(i, m4);
      dirtyD = true;
    }
    if (dirtyD) debris.instanceMatrix.needsUpdate = true;
    // rings, craters, lights
    for (const r of rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const u = r.t / r.life;
      if (u >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const s = r.r0 + (r.r1 - r.r0) * (1 - (1 - u) * (1 - u));
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = 0.85 * (1 - u);
    }
    for (const c of craters) {
      if (!c.mesh.visible) continue;
      c.t += dt;
      if (c.t > 25) {
        c.mesh.material.opacity -= dt * 0.3;
        if (c.mesh.material.opacity <= 0) c.mesh.visible = false;
      }
    }
    for (const L of lights) {
      if (L.i0 <= 0) continue;
      L.t += dt;
      const u = Math.min(1, L.t / L.life);
      L.l.intensity = L.i0 * (1 - u) * (1 - u);
      if (u >= 1) {
        L.i0 = 0;
        L.l.intensity = 0;
      }
    }
    // continuous emitters: burning wrecks, sprays, rage aura, charging dust
    emitT += dt;
    const h = sim.hero;
    if (emitT > 0.05) {
      const k = emitT;
      emitT = 0;
      for (const p of sim.activeProps) {
        if (p.burn > 0 && Math.hypot(p.x - cam.x, p.z - cam.z) < 160) {
          if (R() < k * 18) fire(p.x, p.y + p.def.hy * 1.6, p.z, 1.2);
          if (R() < k * 10) smoke(p.x, p.y + p.def.hy * 2, p.z, 1, 0.1);
        }
      }
      // burnt wrecks keep smouldering
      for (let i = 0; i < 6; i++) {
        const p = sim.props[(Math.random() * sim.props.length) | 0];
        if (p && p.burnt && p.mode !== "gone" && Math.hypot(p.x - cam.x, p.z - cam.z) < 120) smoke(p.x, p.y + 1.2, p.z, 0.8, 0.14);
      }
      for (let i = sprays.length - 1; i >= 0; i--) {
        const s = sprays[i];
        s.t -= k;
        if (s.t <= 0) {
          sprays.splice(i, 1);
          continue;
        }
        for (let j = 0; j < 3; j++) alpha.spawn({ x: s.x, y: s.y, z: s.z, vx: (R() - 0.5) * 1.5, vz: (R() - 0.5) * 1.5, vy: 8 + R() * 3, life: 1.1, s0: 0.4, s1: 1.4, c0: [0.85, 0.92, 1, 0.6], c1: [0.9, 0.95, 1, 0], g: 14, drag: 0.4 });
      }
      if (h.raging && R() < k * 30) add.spawn({ x: h.x + (R() - 0.5) * 2.4, y: h.y + R() * 3.2, z: h.z + (R() - 0.5) * 2.4, vy: 2 + R() * 2, life: 0.6, s0: 0.5, s1: 0.1, c0: [0.45, 1, 0.3, 0.9], c1: [0.2, 0.8, 0.1, 0], drag: 1 });
      if (h.charging && h.anim.charge > 0.05) {
        for (let j = 0; j < 2; j++) {
          const a = R() * Math.PI * 2;
          const rr = 4 + R() * 2;
          alpha.spawn({ x: h.x + Math.cos(a) * rr, y: h.y + 0.2, z: h.z + Math.sin(a) * rr, vx: -Math.cos(a) * rr * 1.4, vz: -Math.sin(a) * rr * 1.4, vy: 0.4, life: 0.6, s0: 0.8, s1: 1.6, c0: [0.62, 0.57, 0.48, 0.45 * h.anim.charge], c1: [0.7, 0.66, 0.58, 0], drag: 0.5 });
        }
      }
      if (h.sprinting && h.grounded && R() < k * 14) dust(h.x - Math.sin(h.heading) * 1.5, h.y + 0.2, h.z - Math.cos(h.heading) * 1.5, 0.5, 1.5);
      // dying bosses smoke
      for (const b of sim.bosses) if (b.dead && b.deadT < 8) smoke(b.x + (R() - 0.5) * 4, b.y + b.def.h * 0.6, b.z + (R() - 0.5) * 4, 2, 0.08);
    }
    // projectiles
    let nt = 0;
    let no = 0;
    let nr = 0;
    for (const p of sim.projectiles) {
      if (p.dead) continue;
      dir.set(p.vx, p.vy, p.vz).normalize();
      tq.setFromUnitVectors(fwd, dir);
      if (p.kind === "bullet" || p.kind === "laser") {
        if (nt >= 160) continue;
        v.set(p.x - dir.x * 1.2, p.y - dir.y * 1.2, p.z - dir.z * 1.2);
        sv.set(p.kind === "laser" ? 2 : 1, p.kind === "laser" ? 2 : 1, 1);
        tmpM.compose(v, tq, sv);
        tracers.setMatrixAt(nt++, tmpM);
      } else if (p.kind === "rocket" || p.kind === "missile") {
        if (nr >= 60) continue;
        v.set(p.x, p.y, p.z);
        sv.set(p.kind === "missile" ? 2 : 1, p.kind === "missile" ? 2 : 1, p.kind === "missile" ? 1.6 : 1);
        tmpM.compose(v, tq, sv);
        rockets.setMatrixAt(nr++, tmpM);
        if (R() < 0.8) alpha.spawn({ x: p.x - dir.x, y: p.y - dir.y, z: p.z - dir.z, vy: 0.4, life: 1.1, s0: 0.5, s1: 1.8, c0: [0.75, 0.75, 0.75, 0.5], c1: [0.8, 0.8, 0.8, 0], drag: 1 });
        add.spawn({ x: p.x - dir.x * 0.7, y: p.y - dir.y * 0.7, z: p.z - dir.z * 0.7, life: 0.06, s0: 0.7, s1: 0.3, c0: [1, 0.7, 0.3, 1], c1: [1, 0.3, 0.1, 0], drag: 0 });
      } else if (p.kind === "flame") {
        if (R() < 0.7) add.spawn({ x: p.x, y: p.y, z: p.z, vx: p.vx * 0.3, vy: p.vy * 0.3 + 1, vz: p.vz * 0.3, life: 0.35, s0: 1.6 * (0.5 + p.age * 2), s1: 3, c0: [1, 0.6, 0.15, 0.85], c1: [0.7, 0.15, 0.05, 0], drag: 1 });
      } else {
        if (no >= 120) continue;
        const s = p.kind === "orb" ? 1.0 : p.kind === "blast3" ? 0.55 : p.kind === "shell" ? 0.35 : 0.42;
        v.set(p.x, p.y, p.z);
        sv.set(s, s, s);
        tmpM.compose(v, tq, sv);
        orbs.setMatrixAt(no, tmpM);
        tmpC.set(PCOL[p.kind] || "#ffffff");
        orbs.setColorAt(no++, tmpC);
        if (p.kind === "orb" || R() < 0.4) add.spawn({ x: p.x, y: p.y, z: p.z, life: 0.25, s0: s * 2.4, s1: s * 0.8, c0: [tmpC.r, tmpC.g, tmpC.b, 0.6], c1: [tmpC.r, tmpC.g, tmpC.b, 0], drag: 0 });
      }
    }
    tracers.count = nt;
    tracers.instanceMatrix.needsUpdate = true;
    orbs.count = no;
    orbs.instanceMatrix.needsUpdate = true;
    if (orbs.instanceColor) orbs.instanceColor.needsUpdate = true;
    rockets.count = nr;
    rockets.instanceMatrix.needsUpdate = true;
    // boss telegraphs
    let ti = 0;
    let bi = 0;
    bossRing.visible = false;
    for (const b of sim.bosses) {
      if (b.dead) continue;
      for (const m of b.markers) {
        if (ti >= tele.length) break;
        const T = tele[ti++];
        const u = Math.min(1, m.t / m.ttl);
        const gy = sim.city.terrainH(m.x, m.z) + 0.06;
        T.fill.visible = T.edge.visible = !m.done;
        T.fill.position.set(m.x, gy, m.z);
        T.fill.scale.setScalar(m.r * u);
        T.fill.material.opacity = 0.18 + u * 0.25;
        T.edge.position.set(m.x, gy + 0.02, m.z);
        T.edge.scale.set(m.r, 1, m.r);
        T.edge.material.opacity = 0.5 + Math.sin(time * 18) * 0.3;
      }
      if (b.beam && bi < beams.length) {
        const B = beams[bi++];
        B.visible = true;
        const laser = b.beam.kind === "laser";
        const oy = b.kind === "titan" ? b.y + (b.beam.kind === "sight" ? 11 : 11) : b.y + 4.4;
        B.position.set(b.x + Math.sin(b.beam.yaw) * b.def.r, oy, b.z + Math.cos(b.beam.yaw) * b.def.r);
        const ty = laser ? b.y + 0.8 : b.kind === "titan" ? b.y + 0.5 : sim.hero.y + 1.5;
        const L = b.beam.len;
        const tx = b.x + Math.sin(b.beam.yaw) * L;
        const tz = b.z + Math.cos(b.beam.yaw) * L;
        dir.set(tx - B.position.x, ty - B.position.y, tz - B.position.z);
        const len = dir.length();
        dir.normalize();
        B.quaternion.setFromUnitVectors(fwd, dir);
        const w = laser ? 0.55 + Math.sin(time * 40) * 0.1 : 0.06;
        B.scale.set(w, w, len);
        B.material.color.set(b.beam.kind === "path" ? "#ffb02a" : "#ff2a3a");
        B.material.opacity = laser ? 0.9 : 0.6 + Math.sin(time * 20) * 0.3;
        if (laser && R() < 0.6) {
          spark(tx, ty, tz, 2, [1, 0.3, 0.4, 1], 5);
          crater(tx + (R() - 0.5), sim.city.terrainH(tx, tz), tz + (R() - 0.5), 1.2);
        }
      }
      if (b.ring) {
        bossRing.visible = true;
        bossRing.position.set(b.ring.x, b.ring.y + 0.25, b.ring.z);
        bossRing.scale.set(b.ring.r + 1.3, 1, b.ring.r + 1.3);
        bossRing.material.opacity = 0.85;
      }
    }
    for (let i = ti; i < tele.length; i++) tele[i].fill.visible = tele[i].edge.visible = false;
    for (let i = bi; i < beams.length; i++) beams[i].visible = false;
    // objective pillars / zones
    const info = sim.objective();
    let pi = 0;
    if (info && info.markers) {
      for (const m of info.markers) {
        if (pi >= pillars.length) break;
        if (m.kind === "enemy" || m.kind === "civ" || m.kind === "target") continue;
        const P = pillars[pi++];
        const active = m.active !== false;
        const col = m.kind === "roof" ? (active ? "#3fe0ff" : "#2a6a88") : m.kind === "zone" ? "#ff8a2a" : m.kind === "danger" ? "#ff3a2a" : m.kind === "safe" ? "#5aff7a" : "#ffd23f";
        const gy = m.y || sim.city.terrainH(m.x, m.z);
        P.p.visible = true;
        P.p.position.set(m.x, gy, m.z);
        const rr = m.r ? Math.min(2.2, m.r * 0.15) : 1.4;
        P.p.scale.set(rr, m.kind === "zone" ? 6 : 60, rr);
        P.p.material.color.set(col);
        P.p.material.opacity = (active ? 0.28 : 0.1) + Math.sin(time * 3 + pi) * 0.06;
        P.r.visible = true;
        P.r.position.set(m.x, gy + 0.1, m.z);
        const R2 = m.r || (m.kind === "roof" ? 7.5 : 4);
        P.r.scale.set(R2, 1, R2);
        P.r.material.color.set(col);
        P.r.material.opacity = 0.55 + Math.sin(time * 4) * 0.2;
      }
    }
    for (let i = pi; i < pillars.length; i++) pillars[i].p.visible = pillars[i].r.visible = false;
    add.update(dt);
    alpha.update(dt);
  }

  return {
    update,
    handle,
    clear() {
      add.clear();
      alpha.clear();
      for (const d of D) d.alive = false;
      for (let i = 0; i < MAXD; i++) debris.setMatrixAt(i, zero);
      debris.instanceMatrix.needsUpdate = true;
      for (const c of craters) c.mesh.visible = false;
      for (const r of rings) r.mesh.visible = false;
      sprays.length = 0;
    },
    dispose() {
      add.dispose();
      alpha.dispose();
      for (const d of disposables) d.dispose && d.dispose();
      for (const L of lights) scene.remove(L.l);
      scene.remove(debris, tracers, orbs, rockets, bossRing);
      debris.dispose();
      tracers.dispose();
      orbs.dispose();
      rockets.dispose();
    },
  };
}
