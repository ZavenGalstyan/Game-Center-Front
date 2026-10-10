/**
 * Dimension Dash — everything in a level that moves or reacts: instanced
 * rings (+ scattered rings), monitors, springs, boost pads, dash hoops,
 * spikes, lamp-post checkpoints, the goal ring, red star rings, lasers,
 * switches + gates, moving / crumbling platforms and instanced scenery.
 *
 * createProps(W, mats, opts) → { group, sync(W, dt, t), dispose() }
 */
import * as THREE from "three";
import { boxMesh } from "./levelMesh.js";

const RING_GEO = new THREE.TorusGeometry(0.42, 0.085, 10, 28);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

function starShape(r1 = 0.75, r0 = 0.32) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? r0 : r1;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

export function createProps(W, mats, { shadows, world }) {
  const M = mats.M;
  const L = W.level;
  const group = new THREE.Group();
  group.name = "props";
  const geos = [];
  const geo = (g) => (geos.push(g), g);

  /* ---------------- rings (instanced) */
  const nR = W.ringTotal;
  const rings = new THREE.InstancedMesh(RING_GEO, M.gold, Math.max(1, nR));
  rings.castShadow = false;
  rings.frustumCulled = false;
  group.add(rings);
  const loose = new THREE.InstancedMesh(RING_GEO, M.gold, 40);
  loose.frustumCulled = false;
  loose.count = 0;
  group.add(loose);

  /* ---------------- monitors */
  const monGeo = geo(new THREE.BoxGeometry(0.95, 0.95, 0.95));
  const standGeo = geo(new THREE.CylinderGeometry(0.18, 0.3, 0.3, 10));
  const monitors = W.monitors.map((m) => {
    const g = new THREE.Group();
    g.position.set(m.x, m.y, m.z);
    const face = mats.monitorMat(m.kind);
    const box = new THREE.Mesh(monGeo, [M.darkMetal, M.darkMetal, M.metal, M.darkMetal, face, face]);
    box.position.y = 0.72;
    box.castShadow = shadows;
    g.add(box);
    const st = new THREE.Mesh(standGeo, M.metal);
    st.position.y = 0.15;
    g.add(st);
    group.add(g);
    return { m, g, box };
  });

  /* ---------------- springs */
  const baseGeo = geo(new THREE.CylinderGeometry(0.55, 0.62, 0.22, 18));
  const coilGeo = geo(new THREE.TorusGeometry(0.33, 0.06, 6, 18));
  const plateGeo = geo(new THREE.CylinderGeometry(0.58, 0.58, 0.16, 18));
  const springs = W.springs.map((s) => {
    const g = new THREE.Group();
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.h || 0;
    const tilt = new THREE.Group();
    tilt.rotation.x = s.angle || 0; // lean toward +Z (forward)
    g.add(tilt);
    tilt.add(new THREE.Mesh(baseGeo, M.darkMetal));
    const coils = [];
    for (let k = 0; k < 3; k++) {
      const c = new THREE.Mesh(coilGeo, M.coil);
      c.rotation.x = Math.PI / 2;
      tilt.add(c);
      coils.push(c);
    }
    const plate = new THREE.Mesh(plateGeo, s.power > 26 ? M.springY : M.spring);
    plate.castShadow = shadows;
    tilt.add(plate);
    group.add(g);
    return { s, g, coils, plate };
  });

  /* ---------------- boost pads + dash hoops */
  const padGeo = geo(new THREE.PlaneGeometry(1, 1));
  for (const b of W.boosts) {
    const m = new THREE.Mesh(padGeo, M.boost);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.PI + 0; // arrows point along +Z after the yaw below
    const g = new THREE.Group();
    g.position.set(b.x, b.y + 0.03, b.z);
    g.rotation.y = b.h;
    m.scale.set(b.w, b.l, 1);
    m.rotation.set(-Math.PI / 2, 0, Math.PI);
    g.add(m);
    const frame = new THREE.Mesh(geo(new THREE.BoxGeometry(b.w + 0.3, 0.06, b.l + 0.3)), M.darkMetal);
    frame.position.y = -0.02;
    g.add(frame);
    group.add(g);
  }
  const hoopGeo = geo(new THREE.TorusGeometry(1.5, 0.16, 8, 32));
  const hoops = W.dashRings.map((d) => {
    const g = new THREE.Group();
    g.position.set(d.x, d.y, d.z);
    g.rotation.y = d.h;
    const ring = new THREE.Mesh(hoopGeo, M.neonA);
    ring.rotation.x = -(d.angle || 0);
    g.add(ring);
    const inner = new THREE.Mesh(geo(new THREE.CircleGeometry(1.4, 32)), M.gateGlow);
    inner.rotation.x = -(d.angle || 0);
    g.add(inner);
    group.add(g);
    return { d, g, ring };
  });

  /* ---------------- spikes */
  const spikeGeo = geo(new THREE.ConeGeometry(0.24, 0.75, 8));
  for (const s of W.spikes) {
    const g = new THREE.Group();
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.h;
    const base = new THREE.Mesh(geo(new THREE.BoxGeometry(2.4, 0.16, s.w + 0.2)), M.darkMetal);
    base.position.y = 0.08;
    g.add(base);
    for (let i = 0; i < s.n; i++) {
      for (const lx of [-0.75, 0, 0.75]) {
        const c = new THREE.Mesh(spikeGeo, M.spike);
        c.position.set(lx, 0.5, (i - (s.n - 1) / 2) * 0.9);
        c.castShadow = shadows;
        g.add(c);
      }
    }
    group.add(g);
  }

  /* ---------------- checkpoints */
  const postGeo = geo(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 10));
  const lampGeo = geo(new THREE.SphereGeometry(0.22, 14, 10));
  const cps = W.checkpoints.map((c) => {
    const g = new THREE.Group();
    g.position.set(c.x, c.y, c.z);
    const post = new THREE.Mesh(postGeo, M.checkpoint);
    post.position.y = 1.1;
    post.castShadow = shadows;
    g.add(post);
    const head = new THREE.Group();
    head.position.y = 2.25;
    const lamp = new THREE.Mesh(lampGeo, M.lampOff);
    lamp.position.x = 0.25;
    head.add(lamp);
    const arm = new THREE.Mesh(geo(new THREE.BoxGeometry(0.5, 0.06, 0.06)), M.metal);
    arm.position.x = 0.12;
    head.add(arm);
    g.add(head);
    group.add(g);
    return { c, g, head, lamp, spin: 0 };
  });

  /* ---------------- goal ring */
  let goal = null;
  if (W.goal && !W.boss) {
    const g = new THREE.Group();
    g.position.set(W.goal.x, W.goal.y, W.goal.z);
    // in a 2.5D zone the ring faces the side camera; in 3D you run through it
    g.rotation.y = W.goal.h + (W.goal.zone != null ? Math.PI / 2 : 0);
    const ring = new THREE.Mesh(geo(new THREE.TorusGeometry(2.0, 0.28, 16, 48)), M.gold);
    ring.position.y = 2.6;
    ring.castShadow = shadows;
    g.add(ring);
    const glow = new THREE.Mesh(geo(new THREE.CircleGeometry(1.8, 40)), M.glow);
    glow.position.y = 2.6;
    g.add(glow);
    // banner posts
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.12, 0.14, 5.4, 10)), M.checkpoint);
      p.position.set(3.6 * s, 2.7, 0);
      g.add(p);
    }
    const banner = new THREE.Mesh(geo(new THREE.BoxGeometry(7.4, 0.8, 0.12)), M.neonA);
    banner.position.set(0, 5.2, 0);
    g.add(banner);
    group.add(g);
    goal = { g, ring, glow };
  }

  /* ---------------- red stars */
  const starGeo = geo(new THREE.ExtrudeGeometry(starShape(), { depth: 0.14, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }));
  starGeo.center();
  const stars = W.redStars.map((s) => {
    const g = new THREE.Group();
    g.position.set(s.x, s.y, s.z);
    const ring = new THREE.Mesh(geo(new THREE.TorusGeometry(0.85, 0.09, 8, 30)), M.redStar);
    g.add(ring);
    const st = new THREE.Mesh(starGeo, M.redStar);
    g.add(st);
    group.add(g);
    return { s, g };
  });

  /* ---------------- lasers */
  const beamGeo = geo(new THREE.CylinderGeometry(0.07, 0.07, 1, 8));
  const lasers = W.lasers.map((l) => {
    const g = new THREE.Group();
    g.position.set(l.x, l.y, l.z);
    g.rotation.y = l.h;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(geo(new THREE.BoxGeometry(0.3, l.hgt + 0.8, 0.3)), M.darkMetal);
      post.position.set((l.w / 2) * s, (l.hgt + 0.8) / 2, 0);
      g.add(post);
    }
    const beam = new THREE.Mesh(beamGeo, M.laser);
    beam.rotation.z = Math.PI / 2;
    beam.scale.y = l.w;
    beam.position.y = l.hgt;
    g.add(beam);
    group.add(g);
    return { l, beam };
  });

  /* ---------------- switches + gates */
  const switches = W.switches.map((s) => {
    const g = new THREE.Group();
    g.position.set(s.x, s.y, s.z);
    const base = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.7, 0.8, 0.2, 18)), M.darkMetal);
    base.position.y = 0.1;
    g.add(base);
    const btn = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.45, 0.45, 0.22, 18)), M.gate);
    btn.position.y = 0.3;
    g.add(btn);
    group.add(g);
    return { s, btn };
  });
  const gates = W.gates.map((gt) => {
    const b = L.boxes[gt.box];
    const m = boxMesh(b, M, shadows);
    group.add(m);
    return { gt, m };
  });

  /* ---------------- moving / crumbling boxes + moving discs */
  const dyn = [];
  for (const b of W.geom.dyn) {
    if (b.kind === "box") {
      const m = boxMesh(b.src || b, M, shadows);
      group.add(m);
      dyn.push({ b, m });
    } else if (b.kind === "disc") {
      const depth = 1.2;
      const m = new THREE.Mesh(geo(new THREE.CylinderGeometry(b.r, b.r * 0.9, depth, 32)), [M.side, M.top, M.under]);
      m.receiveShadow = shadows;
      m.castShadow = shadows;
      group.add(m);
      dyn.push({ b, m, disc: true, depth });
    }
  }

  /* ---------------- scenery (instanced) */
  const deco = buildDeco(L, M, world, shadows, geo);
  group.add(deco);

  /* ---------------------------------------------------------------- sync */
  function sync(dt, t) {
    // rings: shared spin, magnetised positions, hidden when collected
    const spin = t * 2.6;
    _q.setFromEuler(_e.set(0, spin, 0));
    for (let i = 0; i < nR; i++) {
      if (W.ringAlive[i]) {
        _p.set(W.ringPos[i * 3], W.ringPos[i * 3 + 1] + Math.sin(t * 2 + i * 0.7) * 0.06, W.ringPos[i * 3 + 2]);
        _s.set(1, 1, 1);
      } else {
        _p.set(0, -9999, 0);
        _s.set(0.001, 0.001, 0.001);
      }
      _m.compose(_p, _q, _s);
      rings.setMatrixAt(i, _m);
    }
    rings.instanceMatrix.needsUpdate = true;
    const lz = W.loose;
    loose.count = Math.min(40, lz.length);
    for (let i = 0; i < loose.count; i++) {
      const r = lz[i];
      const blink = r.t > 3 && Math.floor(r.t * 14) % 2 === 0;
      _q.setFromEuler(_e.set(0, spin * 3 + i, 0));
      _p.set(r.x, r.y, r.z);
      _s.setScalar(blink ? 0.001 : 1);
      _m.compose(_p, _q, _s);
      loose.setMatrixAt(i, _m);
    }
    loose.instanceMatrix.needsUpdate = true;

    for (const o of monitors) {
      o.g.visible = !o.m.dead;
      if (!o.m.dead) o.box.rotation.y = Math.sin(t * 1.4 + o.m.x) * 0.25;
    }
    for (const o of springs) {
      const k = o.s.squash;
      const comp = k > 0.5 ? (1 - k) * 2 : k * 2; // up then settle
      const h = 0.2 + 0.18 * (1 - comp * 0.0) + comp * 0.35;
      o.coils.forEach((c, i) => (c.position.y = 0.16 + ((i + 1) / 3) * (h - 0.1)));
      o.plate.position.y = h + 0.1;
    }
    for (const o of hoops) o.ring.material.emissiveIntensity = 1.2 + Math.sin(t * 6) * 0.4;
    for (const o of cps) {
      if (o.c.on) {
        o.lamp.material = M.lampOn;
        o.spin = Math.max(0, (o.spin || 6) - dt * 5);
        o.head.rotation.y += o.spin * dt * 4;
      }
    }
    if (goal) {
      goal.ring.rotation.y = t * (W.goal.hit ? 7 : 1.4);
      goal.glow.material.opacity = 0.35 + Math.sin(t * 3) * 0.15;
    }
    for (const o of stars) {
      o.g.visible = !o.s.got;
      o.g.rotation.y = t * 2.2;
      o.g.position.y = o.s.y + Math.sin(t * 2.4 + o.s.idx) * 0.12;
    }
    for (const o of lasers) {
      o.beam.visible = o.l.lit || o.l.warn;
      o.beam.material = o.l.lit ? M.laser : M.laserWarn;
    }
    for (const o of switches) o.btn.position.y = o.s.pressed ? 0.2 : 0.3;
    for (const o of gates) o.m.visible = !o.gt.open;
    for (const o of dyn) {
      const b = o.b;
      o.m.visible = b.on !== false;
      if (o.disc) o.m.position.set(b.x, b.y - o.depth / 2, b.z);
      else {
        o.m.position.set(b.x, b.y, b.z);
        if (b.crumble && b.crumble.state === "shake") {
          o.m.position.x += Math.sin(t * 60) * 0.05;
          o.m.position.z += Math.cos(t * 55) * 0.05;
        }
      }
    }
    M.boost.map.offset.y = (t * 1.6) % 1;
  }

  function dispose() {
    for (const g of geos) g.dispose();
    group.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.userData && o.geometry.userData.owned) o.geometry.dispose();
    });
    rings.dispose();
    loose.dispose();
  }

  return { group, sync, dispose, rings };
}

/* ------------------------------------------------------------------ scenery */

/** instanced decoration per theme; "auto" picks a theme-appropriate prop */
function buildDeco(L, M, world, shadows, geo) {
  const g = new THREE.Group();
  const theme = world.key;
  const kinds = {
    green: ["palm", "sunflower", "bush", "palm", "totem", "bush"],
    desert: ["cactus", "ruin", "rockSmall", "cactus", "palm"],
    ocean: ["palm", "bush", "rockSmall", "coral", "palm"],
    neon: ["lamp", "billboard", "antenna", "lamp"],
    final: ["crystal", "ruin", "crystal", "rockSmall"],
  }[theme] || ["bush"];
  const items = {};
  const push = (t, d) => (items[t] = items[t] || []).push(d);
  for (const d of L.deco) {
    if (!Number.isFinite(d.y)) continue;
    let t = d.t;
    if (t === "auto") t = kinds[Math.floor((d.seed || 0) * kinds.length) % kinds.length];
    if (t === "tree") t = theme === "neon" ? "lamp" : theme === "final" ? "crystal" : theme === "desert" ? "cactus" : "palm";
    if (t === "flower") t = theme === "green" || theme === "ocean" ? "flower" : theme === "desert" ? "rockSmall" : theme === "neon" ? "lamp" : "crystal";
    push(t, d);
  }
  // part lists: [geometry, material, local matrix]
  const P = (gm, mat, pos = [0, 0, 0], rot = [0, 0, 0], sc = [1, 1, 1], order = "XYZ") => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], order)), new THREE.Vector3(...sc));
    return { gm, mat, m };
  };
  const cyl = (rt, rb, h, s = 8) => geo(new THREE.CylinderGeometry(rt, rb, h, s));
  const sph = (r, a = 10, b = 8) => geo(new THREE.SphereGeometry(r, a, b));
  const cone = (r, h, s = 8) => geo(new THREE.ConeGeometry(r, h, s));
  const box = (x, y, z) => geo(new THREE.BoxGeometry(x, y, z));
  const leaf = geo(new THREE.ConeGeometry(0.75, 3.4, 4, 1));
  leaf.translate(0, 1.7, 0);
  const DEF = {
    palm: [
      P(cyl(0.16, 0.24, 5.2), M.trunk, [0, 2.6, 0], [0, 0, 0.08]),
      ...[0, 1, 2, 3, 4, 5, 6].map((i) => P(leaf, M.leaf, [0.3, 5.15, 0], [Math.PI / 2 - 0.15 - (i % 2) * 0.25, (i / 7) * Math.PI * 2, 0], [1, 1, 0.22], "YXZ")),
      P(sph(0.22), M.trunk, [0.25, 4.9, 0.1]),
    ],
    sunflower: [P(cyl(0.05, 0.06, 1.6), M.stem, [0, 0.8, 0]), P(cyl(0.42, 0.42, 0.08, 12), M.flowerA, [0, 1.65, 0.05], [Math.PI / 2 - 0.3, 0, 0]), P(cyl(0.2, 0.2, 0.1, 10), M.trunk, [0, 1.66, 0.1], [Math.PI / 2 - 0.3, 0, 0])],
    flower: [P(cyl(0.03, 0.03, 0.5), M.stem, [0, 0.25, 0]), P(sph(0.14, 8, 6), M.flowerB, [0, 0.55, 0])],
    bush: [P(sph(1.0), M.leaf, [0, 0.6, 0], [0, 0, 0], [1.3, 0.8, 1.1]), P(sph(0.7), M.leaf, [0.8, 0.5, 0.2])],
    totem: [P(box(0.8, 3.4, 0.8), M.block, [0, 1.7, 0]), P(box(1.6, 0.25, 0.25), M.sign, [0, 2.9, 0])],
    cactus: [P(cyl(0.3, 0.34, 3.2), M.leaf, [0, 1.6, 0]), P(cyl(0.18, 0.2, 1.2), M.leaf, [0.5, 1.9, 0], [0, 0, -0.9]), P(cyl(0.16, 0.18, 1.0), M.leaf, [-0.45, 1.4, 0], [0, 0, 0.9])],
    ruin: [P(cyl(0.6, 0.7, 4.5, 10), M.block, [0, 2.25, 0]), P(box(1.8, 0.5, 1.8), M.block, [0, 4.6, 0], [0, 0.2, 0.08])],
    rockSmall: [P(geo(new THREE.DodecahedronGeometry(0.9)), M.rock, [0, 0.4, 0], [0.3, 0.5, 0])],
    coral: [P(cone(0.4, 1.8, 6), M.flowerB, [0, 0.9, 0]), P(cone(0.3, 1.2, 6), M.flowerC, [0.6, 0.6, 0.2])],
    lamp: [P(cyl(0.08, 0.12, 5), M.darkMetal, [0, 2.5, 0]), P(box(1.2, 0.12, 0.3), M.darkMetal, [0.5, 5, 0]), P(box(0.8, 0.1, 0.25), M.neonB, [0.75, 4.92, 0])],
    billboard: [P(cyl(0.12, 0.12, 4), M.darkMetal, [0, 2, 0]), P(box(3.4, 1.8, 0.2), M.neonA, [0, 4.6, 0])],
    antenna: [P(box(0.9, 2.6, 0.9), M.building, [0, 1.3, 0]), P(cyl(0.04, 0.04, 2.2), M.metal, [0, 3.7, 0]), P(sph(0.12), M.neonA, [0, 4.8, 0])],
    crystal: [P(geo(new THREE.OctahedronGeometry(0.9)), M.crystal, [0, 1.3, 0], [0, 0, 0], [0.7, 1.8, 0.7]), P(geo(new THREE.OctahedronGeometry(0.5)), M.crystal, [0.7, 0.6, 0.2], [0.3, 0, 0.4], [0.6, 1.3, 0.6])],
    sign: [P(cyl(0.08, 0.08, 1.6), M.metal, [0, 0.8, 0]), P(box(1.2, 0.8, 0.12), M.sign, [0, 1.8, 0])],
  };
  DEF.pylon = [P(cyl(0.18, 0.24, 2.4), M.darkMetal, [0, 1.2, 0]), P(sph(0.3), M.neonB, [0, 2.6, 0])];
  // floating islet beside 3D roads: earth cone + grass cap + a theme prop on top
  const isleBase = geo(new THREE.ConeGeometry(3.2, 5, 7));
  isleBase.rotateX(Math.PI);
  const isleTop = cyl(3.4, 3.2, 0.7, 10);
  const topProp = { green: "palm", ocean: "palm", desert: "cactus", neon: "antenna", final: "crystal" }[theme] || "bush";
  DEF.islet = [P(isleBase, theme === "neon" ? M.building : M.side, [0, -2.8, 0]), P(isleTop, theme === "neon" ? M.darkMetal : M.cliffGrass, [0, -0.15, 0]), ...DEF[topProp]];
  const tmp = new THREE.Matrix4();
  for (const [t, list] of Object.entries(items)) {
    const parts = DEF[t] || DEF.bush;
    for (const part of parts) {
      const im = new THREE.InstancedMesh(part.gm, part.mat, list.length);
      im.castShadow = shadows && t !== "flower";
      im.receiveShadow = false;
      list.forEach((d, i) => {
        const s = d.s || 1;
        const base = new THREE.Matrix4().compose(new THREE.Vector3(d.x, d.y, d.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, d.r || 0, 0)), new THREE.Vector3(s, s, s));
        tmp.multiplyMatrices(base, part.m);
        im.setMatrixAt(i, tmp);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      g.add(im);
    }
  }
  return g;
}
