/**
 * Rooftop Dash — meshes for one level, built from the SAME data the engine
 * collides with (W.level + the live mover / crumble / hazard records), and
 * updated each frame from engine state. Nothing here affects gameplay.
 *
 *  - route buildings: instanced boxes with the shared building shader
 *    (walkable roofs get the painted safety edge)
 *  - obstacles: vault ducts, slide pipes, wall-run murals / billboards, posts,
 *    rooms, beams
 *  - props: one InstancedMesh per prop type
 *  - movers / lifts / swinging loads, crumbling scaffold boards
 *  - hazards: steam vents, electric boxes, wind ducts, crane hooks
 *  - stars, checkpoints (beacons), finish beacon, blob shadow
 */
import * as THREE from "three";
import { buildingMaterial, glowTexture, muralTexture, billboardTexture, stripeTexture } from "./materials.js";
import { propGeometry, vaultMesh, pipeMesh, wallMesh, solidMesh, beamMesh } from "./props.js";
import { hazardPhase } from "../engine/world.js";

// per-frame scratch (no allocation in update)
const _top = new THREE.Vector3();
const _from = new THREE.Vector3();
const _dir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const STYLE = { apartment: 1, office: 2, brick: 3, tower: 4, low: 5, construction: 6, glass: 4, plain: 0 };

function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.2 : 0.46;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2 });
  g.center();
  return g;
}

export function buildLevelMeshes(scene, W, theme, quality, { shadows = true } = {}) {
  const L = W.level;
  const group = new THREE.Group();
  group.name = "level";
  scene.add(group);
  const disp = [];
  const T = (o) => {
    disp.push(o);
    return o;
  };

  /* ---------------- shared materials */
  const stripe = stripeTexture();
  const mats = {
    vc: T(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 })),
    stripe: T(new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.55, metalness: 0.2 })),
    darkMetal: T(new THREE.MeshStandardMaterial({ color: "#3d4148", roughness: 0.55, metalness: 0.4 })),
    wallBody: T(new THREE.MeshStandardMaterial({ color: theme.key === "neon" ? "#2c2b3d" : "#8b6d5c", roughness: 0.9 })),
    trim: T(new THREE.MeshStandardMaterial({ color: theme.trim, roughness: 0.6 })),
    lamp: T(new THREE.MeshBasicMaterial({ color: "#fff3cf" })),
    room: T(new THREE.MeshStandardMaterial({ color: theme.facades[3] || "#cdbfae", roughness: 0.85 })),
    beam: T(new THREE.MeshStandardMaterial({ color: "#e3b23c", roughness: 0.6, metalness: 0.3 })),
    _mural: {},
    _bill: {},
    mural(v) {
      if (!this._mural[v]) this._mural[v] = T(new THREE.MeshStandardMaterial({ map: muralTexture(theme, v), roughness: 0.8 }));
      return this._mural[v];
    },
    billboard(i) {
      if (!this._bill[i]) this._bill[i] = T(new THREE.MeshStandardMaterial({ map: billboardTexture(i), roughness: 0.5, emissive: "#ffffff", emissiveIntensity: theme.night ? 0.55 : 0.12, emissiveMap: billboardTexture(i) }));
      return this._bill[i];
    },
  };

  /* ---------------- route buildings (instanced) */
  const bmat = T(buildingMaterial(theme));
  bmat.userData.uniforms.uStreet.value = L.streetY ?? -30;
  const roofs = L.roofs.filter((r) => !r.beam);
  const unit = T(new THREE.BoxGeometry(1, 1, 1));
  const ig = T(unit.clone());
  const style = new Float32Array(roofs.length * 4);
  const inst = new THREE.InstancedMesh(ig, bmat, Math.max(1, roofs.length));
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  roofs.forEach((r, i) => {
    const b = r.box;
    m4.makeScale(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]).setPosition((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    inst.setMatrixAt(i, m4);
    col.set(theme.facades[(i * 3 + L.id) % theme.facades.length]);
    inst.setColorAt(i, col);
    style[i * 4] = STYLE[r.style] ?? 1;
    style[i * 4 + 1] = ((i * 7919 + L.id * 31) % 100) / 100;
    style[i * 4 + 2] = theme.windowsLit;
    style[i * 4 + 3] = 1;
  });
  ig.setAttribute("aStyle", new THREE.InstancedBufferAttribute(style, 4));
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.receiveShadow = shadows;
  inst.castShadow = shadows;
  inst.frustumCulled = false;
  group.add(inst);
  for (const r of L.roofs) if (r.beam) group.add(beamMesh(r.box, theme, mats));

  /* ---------------- obstacles + gameplay boxes */
  let wallIdx = 0;
  for (const b of L.boxes) {
    let m = null;
    if (b.kind === "vault") m = vaultMesh(b, theme, mats);
    else if (b.kind === "pipe") m = pipeMesh(b, theme, mats);
    else if (b.kind === "post" || b.kind === "room" || b.kind === "beam") m = solidMesh(b, theme, mats);
    else if (b.kind === "wall") m = wallMesh(b, theme, mats, wallIdx++);
    if (!m) continue;
    m.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = shadows;
        o.receiveShadow = shadows;
        if (o.geometry) disp.push(o.geometry);
        if (o.material && o.material.userData && o.material.userData.own) {
          disp.push(o.material);
          if (o.material.map) disp.push(o.material.map);
        }
      }
    });
    group.add(m);
  }

  /* ---------------- props (instanced per type) */
  const byType = new Map();
  for (const d of L.decor) {
    if (!byType.has(d.type)) byType.set(d.type, []);
    byType.get(d.type).push(d);
  }
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const pv = new THREE.Vector3();
  for (const [type, list] of byType) {
    const g = propGeometry(type, theme);
    if (!g) continue;
    const im = new THREE.InstancedMesh(g, mats.vc, list.length);
    list.forEach((d, i) => {
      e.set(0, d.rot + (d.turn90 ? Math.PI / 2 : 0), 0);
      q.setFromEuler(e);
      pv.set(d.x, d.y, d.z);
      m4.compose(pv, q, one);
      im.setMatrixAt(i, m4);
    });
    im.castShadow = shadows;
    im.receiveShadow = shadows;
    im.frustumCulled = false;
    group.add(im);
  }

  /* ---------------- movers */
  const moverMeshes = W.movers.map((m, i) => {
    const b = m.base;
    const sx = b.max[0] - b.min[0];
    const sz = b.max[2] - b.min[2];
    const sy = b.max[1] - b.min[1];
    const g = new THREE.Group();
    const deck = new THREE.Mesh(T(new THREE.BoxGeometry(sx, sy, sz)), mats.darkMetal);
    g.add(deck);
    const grate = new THREE.Mesh(T(new THREE.BoxGeometry(sx - 0.2, 0.02, sz - 0.2)), T(new THREE.MeshStandardMaterial({ color: "#6f747c", roughness: 0.5, metalness: 0.6 })));
    grate.position.y = sy / 2 + 0.005;
    g.add(grate);
    // yellow/black edge
    const edgeMat = T(new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6 }));
    for (const [w, d, x, z] of [
      [sx, 0.16, 0, sz / 2 - 0.08],
      [sx, 0.16, 0, -sz / 2 + 0.08],
      [0.16, sz, sx / 2 - 0.08, 0],
      [0.16, sz, -sx / 2 + 0.08, 0],
    ]) {
      const s = new THREE.Mesh(T(new THREE.BoxGeometry(w, 0.03, d)), edgeMat);
      s.position.set(x, sy / 2 + 0.015, z);
      g.add(s);
    }
    // lights on the corners
    const lampM = T(new THREE.MeshBasicMaterial({ color: theme.accent }));
    for (const [x, z] of [
      [sx / 2 - 0.15, sz / 2 - 0.15],
      [-sx / 2 + 0.15, -sz / 2 + 0.15],
    ]) {
      const l = new THREE.Mesh(T(new THREE.SphereGeometry(0.07, 8, 6)), lampM);
      l.position.set(x, sy / 2 + 0.07, z);
      g.add(l);
    }
    let cables = null;
    if (m.path.type === "swing" || m.kind === "crane") {
      // cables up to a pivot (crane load)
      const len = m.path.len || 7;
      const cm = T(new THREE.MeshBasicMaterial({ color: "#222428" }));
      cables = [];
      for (const [x, z] of [
        [sx / 2 - 0.1, sz / 2 - 0.1],
        [-sx / 2 + 0.1, -sz / 2 + 0.1],
        [sx / 2 - 0.1, -sz / 2 + 0.1],
        [-sx / 2 + 0.1, sz / 2 - 0.1],
      ]) {
        const c = new THREE.Mesh(T(new THREE.CylinderGeometry(0.02, 0.02, 1, 4)), cm);
        c.userData.local = [x, z];
        g.add(c);
        cables.push(c);
      }
      const hook = new THREE.Mesh(T(new THREE.BoxGeometry(0.4, 0.5, 0.4)), T(new THREE.MeshStandardMaterial({ color: "#d1462f", roughness: 0.6 })));
      g.add(hook);
      g.userData.hook = hook;
      g.userData.len = len;
    }
    if (m.kind === "lift") {
      const rail = T(new THREE.MeshStandardMaterial({ color: "#f2b632", roughness: 0.6, metalness: 0.3 }));
      for (const [x, z] of [
        [sx / 2, sz / 2],
        [-sx / 2, sz / 2],
      ]) {
        const p = new THREE.Mesh(T(new THREE.BoxGeometry(0.08, 1.0, 0.08)), rail);
        p.position.set(x, sy / 2 + 0.5, z);
        g.add(p);
      }
      const bar = new THREE.Mesh(T(new THREE.BoxGeometry(sx, 0.06, 0.06)), rail);
      bar.position.set(0, sy / 2 + 1.0, sz / 2);
      g.add(bar);
    }
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = shadows;
    });
    group.add(g);
    // a static guide rail / shaft showing the path (readability)
    const d = m.path.d;
    if (d && (Math.abs(d[0]) + Math.abs(d[2]) > 0.1 || Math.abs(d[1]) > 0.1)) {
      const start = new THREE.Vector3((b.min[0] + b.max[0]) / 2, b.min[1] - 0.25, (b.min[2] + b.max[2]) / 2);
      if (Math.abs(d[1]) > 0.1) {
        // lift: two vertical guide posts
        const h = Math.abs(d[1]) + 2;
        for (const s of [-1, 1]) {
          const post = new THREE.Mesh(T(new THREE.BoxGeometry(0.16, h + 6, 0.16)), mats.darkMetal);
          post.position.set(start.x + (sx / 2 + 0.15) * s, start.y + d[1] / 2 - 2, start.z);
          group.add(post);
        }
      } else {
        const len = Math.hypot(d[0], d[2]) + Math.max(sx, sz);
        const rail = new THREE.Mesh(T(new THREE.BoxGeometry(Math.abs(d[0]) > 0.1 ? len : 0.12, 0.12, Math.abs(d[2]) > 0.1 ? len : 0.12)), mats.darkMetal);
        rail.position.set(start.x + d[0] / 2, start.y - 0.15, start.z + d[2] / 2);
        group.add(rail);
      }
    }
    return { g, m, cables, sy };
  });

  /* ---------------- crumbling scaffold boards */
  const crumbleMeshes = W.crumbles.map((c) => {
    const b = c.box;
    const sx = b.max[0] - b.min[0];
    const sz = b.max[2] - b.min[2];
    const sy = b.max[1] - b.min[1];
    const g = new THREE.Group();
    const wood = T(new THREE.MeshStandardMaterial({ color: "#b8875a", roughness: 0.85 }));
    const alongX = sx >= sz;
    const n = Math.max(3, Math.round((alongX ? sz : sx) / 0.32));
    for (let i = 0; i < n; i++) {
      const w = (alongX ? sz : sx) / n;
      const p = new THREE.Mesh(T(new THREE.BoxGeometry(alongX ? sx : w * 0.92, sy * 0.5, alongX ? w * 0.92 : sz)), wood);
      const o = -((alongX ? sz : sx) / 2) + w * (i + 0.5);
      p.position.set(alongX ? 0 : o, sy * 0.25, alongX ? o : 0);
      p.userData.base = p.position.clone();
      p.userData.k = Math.random();
      p.castShadow = shadows;
      g.add(p);
    }
    const frame = new THREE.Mesh(T(new THREE.BoxGeometry(sx, sy * 0.4, sz)), T(new THREE.MeshStandardMaterial({ color: "#7d838c", roughness: 0.5, metalness: 0.5, wireframe: false })));
    frame.position.y = -sy * 0.2;
    frame.scale.set(1, 1, 1);
    g.add(frame);
    g.position.set((b.min[0] + b.max[0]) / 2, b.min[1] + sy * 0.5, (b.min[2] + b.max[2]) / 2);
    group.add(g);
    return { g, c, home: g.position.clone(), fallV: 0 };
  });

  /* ---------------- hazards */
  const glow = glowTexture();
  const hazardMeshes = W.hazards.map((h) => {
    const g = new THREE.Group();
    g.position.set(h.pos[0], h.pos[1], h.pos[2]);
    const info = { g, h };
    if (h.type === "steam") {
      const base = new THREE.Mesh(T(new THREE.CylinderGeometry(0.42, 0.5, 0.35, 16)), mats.darkMetal);
      base.position.y = 0.17;
      g.add(base);
      const grate = new THREE.Mesh(T(new THREE.CylinderGeometry(0.36, 0.36, 0.02, 16)), T(new THREE.MeshStandardMaterial({ color: "#1d1f22", roughness: 0.4 })));
      grate.position.y = 0.36;
      g.add(grate);
      const ring = new THREE.Mesh(T(new THREE.TorusGeometry(h.r || 0.8, 0.04, 6, 28)), T(new THREE.MeshBasicMaterial({ color: "#ff8a3d", transparent: true, opacity: 0.6 })));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.03;
      g.add(ring);
      info.ring = ring;
      const col = new THREE.Mesh(T(new THREE.CylinderGeometry(h.r * 0.75 || 0.6, h.r * 0.35 || 0.3, h.h || 2.6, 14, 1, true)), T(new THREE.MeshBasicMaterial({ color: "#f4f6f8", transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide })));
      col.position.y = (h.h || 2.6) / 2 + 0.3;
      g.add(col);
      info.col = col;
    } else if (h.type === "zap") {
      const boxm = new THREE.Mesh(T(new THREE.BoxGeometry(0.9, 1.3, 0.6)), T(new THREE.MeshStandardMaterial({ color: "#8d949c", roughness: 0.45, metalness: 0.5 })));
      boxm.position.y = 0.65;
      g.add(boxm);
      const sign = new THREE.Mesh(T(new THREE.PlaneGeometry(0.4, 0.35)), T(new THREE.MeshBasicMaterial({ color: "#ffd23f" })));
      sign.position.set(0, 0.85, 0.305);
      g.add(sign);
      const arcs = new THREE.Group();
      const am = T(new THREE.MeshBasicMaterial({ color: "#9fe8ff", transparent: true, opacity: 0.9 }));
      for (let i = 0; i < 6; i++) {
        const a = new THREE.Mesh(T(new THREE.BoxGeometry(0.04, 0.04, (h.r || 0.8) * 1.6)), am);
        a.rotation.y = (i / 6) * Math.PI;
        a.position.y = 0.5 + i * 0.25;
        arcs.add(a);
      }
      g.add(arcs);
      info.arcs = arcs;
      const ring = new THREE.Mesh(T(new THREE.TorusGeometry(h.r || 0.8, 0.04, 6, 28)), T(new THREE.MeshBasicMaterial({ color: "#4fd2ff", transparent: true, opacity: 0.5 })));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.03;
      g.add(ring);
      info.ring = ring;
    } else if (h.type === "fan") {
      // wind duct: a frame with a big spinning fan behind the zone, blowing along dir
      const s = h.size;
      const frameM = T(new THREE.MeshStandardMaterial({ color: "#59616b", roughness: 0.5, metalness: 0.5 }));
      const back = new THREE.Group();
      const dx = h.dir[0];
      const dz = h.dir[2];
      const across = Math.abs(dx) > 0.5 ? s[2] : s[0];
      const ring = new THREE.Mesh(T(new THREE.TorusGeometry(Math.min(across, s[1]) * 0.46, 0.12, 8, 28)), frameM);
      back.add(ring);
      const blades = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const bl = new THREE.Mesh(T(new THREE.BoxGeometry(0.08, Math.min(across, s[1]) * 0.42, 0.32)), T(new THREE.MeshStandardMaterial({ color: "#c8ccd2", roughness: 0.4, metalness: 0.6 })));
        bl.position.y = Math.min(across, s[1]) * 0.21;
        const piv = new THREE.Group();
        piv.rotation.z = (i / 5) * Math.PI * 2;
        piv.add(bl);
        blades.add(piv);
      }
      back.add(blades);
      back.position.set(-dx * (Math.abs(dx) > 0.5 ? s[0] : s[2]) * 0.5, s[1] * 0.5, -dz * (Math.abs(dz) > 0.5 ? s[2] : s[0]) * 0.5);
      back.rotation.y = Math.atan2(dx, dz);
      g.add(back);
      info.blades = blades;
    } else if (h.type === "hook") {
      const cable = new THREE.Mesh(T(new THREE.CylinderGeometry(0.03, 0.03, 1, 6)), T(new THREE.MeshBasicMaterial({ color: "#1d1f24" })));
      g.add(cable);
      const hook = new THREE.Group();
      const blk = new THREE.Mesh(T(new THREE.BoxGeometry(0.7, 0.55, 0.45)), T(new THREE.MeshStandardMaterial({ color: "#f2b632", roughness: 0.5, metalness: 0.3 })));
      hook.add(blk);
      const ball = new THREE.Mesh(T(new THREE.SphereGeometry((h.r || 0.6) * 0.75, 14, 10)), T(new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.5 })));
      ball.position.y = -0.5;
      hook.add(ball);
      const curl = new THREE.Mesh(T(new THREE.TorusGeometry(0.22, 0.06, 8, 16, Math.PI * 1.4)), mats.darkMetal);
      curl.position.y = -1.0;
      hook.add(curl);
      g.add(hook);
      info.cable = cable;
      info.hook = hook;
      // the jib above (static) so the hook reads as hanging from something
      const jib = new THREE.Mesh(T(new THREE.BoxGeometry(0.7, 0.7, 8)), T(new THREE.MeshStandardMaterial({ color: "#f2b632", roughness: 0.6 })));
      jib.position.set(0, 0.4, 0);
      if (h.axis === "x") jib.rotation.y = Math.PI / 2;
      g.add(jib);
      g.position.set(h.pos[0], h.pos[1], h.pos[2]);
    }
    g.traverse((o) => {
      if (o.isMesh && !o.material.transparent) o.castShadow = shadows;
    });
    group.add(g);
    return info;
  });

  /* ---------------- stars */
  const starGeo = T(starGeometry());
  const starMat = T(new THREE.MeshStandardMaterial({ color: "#ffcc33", emissive: "#ffb000", emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.6 }));
  const glowMat = T(new THREE.SpriteMaterial({ map: glow, color: "#ffd166", transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  const stars = L.stars.map((s) => {
    const g = new THREE.Group();
    g.position.set(s.x, s.y, s.z);
    const m = new THREE.Mesh(starGeo, starMat);
    m.castShadow = shadows;
    g.add(m);
    const sp = new THREE.Sprite(glowMat);
    sp.scale.set(2.0, 2.0, 1);
    g.add(sp);
    group.add(g);
    return { g, m, taken: false, pop: 0 };
  });

  /* ---------------- checkpoints */
  const cpMats = {
    off: T(new THREE.MeshBasicMaterial({ color: theme.accent })),
    on: T(new THREE.MeshBasicMaterial({ color: "#4cff9a" })),
  };
  const poleMat = T(new THREE.MeshStandardMaterial({ color: "#2f3338", roughness: 0.5, metalness: 0.5 }));
  const cps = W.checkpoints.map((c) => {
    const g = new THREE.Group();
    g.position.set(c.x, c.y, c.z);
    g.rotation.y = c.yaw || 0; // pole stands beside the lane, not in it
    const pole = new THREE.Mesh(T(new THREE.CylinderGeometry(0.05, 0.07, 2.4, 8)), poleMat);
    pole.position.set(2.45, 1.2, 0);
    g.add(pole);
    const lamp = new THREE.Mesh(T(new THREE.SphereGeometry(0.16, 12, 8)), cpMats.off);
    lamp.position.set(2.45, 2.48, 0);
    g.add(lamp);
    const flag = new THREE.Mesh(T(new THREE.PlaneGeometry(0.7, 0.42, 6, 1)), T(new THREE.MeshStandardMaterial({ color: theme.accent, side: THREE.DoubleSide, roughness: 0.8 })));
    flag.position.set(2.45 - 0.37, 2.1, 0);
    g.add(flag);
    const ring = new THREE.Mesh(T(new THREE.RingGeometry(1.25, 1.42, 40)), T(new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    g.add(ring);
    const beam = new THREE.Mesh(T(new THREE.CylinderGeometry(0.12, 0.12, 30, 8, 1, true)), T(new THREE.MeshBasicMaterial({ color: "#4cff9a", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })));
    beam.position.set(2.45, 15, 0);
    g.add(beam);
    group.add(g);
    return { g, lamp, flag, ring, beam, on: false, pulse: 0 };
  });

  /* ---------------- finish beacon */
  let finish = null;
  if (L.finish) {
    const f = L.finish;
    const g = new THREE.Group();
    g.position.set(f.x, f.y, f.z);
    const pad = new THREE.Mesh(T(new THREE.CircleGeometry(f.r + 0.4, 48)), T(new THREE.MeshStandardMaterial({ color: "#26303d", roughness: 0.7 })));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.02;
    g.add(pad);
    const ring = new THREE.Mesh(T(new THREE.RingGeometry(f.r - 0.1, f.r + 0.25, 56)), T(new THREE.MeshBasicMaterial({ color: theme.accent, side: THREE.DoubleSide })));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    g.add(ring);
    // chevrons pointing inward
    const chevM = T(new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Mesh(T(new THREE.PlaneGeometry(0.5, 0.18)), chevM);
      const a = (i / 8) * Math.PI * 2;
      c.position.set(Math.cos(a) * (f.r - 0.55), 0.035, Math.sin(a) * (f.r - 0.55));
      c.rotation.set(-Math.PI / 2, 0, -a);
      g.add(c);
    }
    // light pillar + spinning ring + flag pole
    const beam = new THREE.Mesh(T(new THREE.CylinderGeometry(f.r * 0.55, f.r * 0.8, 60, 24, 1, true)), T(new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })));
    beam.position.y = 30;
    g.add(beam);
    const halo = new THREE.Mesh(T(new THREE.TorusGeometry(f.r * 0.85, 0.07, 8, 48)), T(new THREE.MeshBasicMaterial({ color: "#fff1d0" })));
    halo.position.y = 2.6;
    halo.rotation.x = Math.PI / 2;
    g.add(halo);
    const pole = new THREE.Mesh(T(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 8)), poleMat);
    pole.position.set(f.r + 0.3, 2.1, 0);
    g.add(pole);
    const flag = new THREE.Mesh(T(new THREE.PlaneGeometry(1.4, 0.85, 10, 1)), T(new THREE.MeshStandardMaterial({ color: "#ffffff", side: THREE.DoubleSide, roughness: 0.8, emissive: theme.accent, emissiveIntensity: 0.25 })));
    flag.position.set(f.r + 0.3 - 0.72, 3.7, 0);
    g.add(flag);
    group.add(g);
    finish = { g, beam, halo, flag, ring, pulse: 0 };
  }

  /* ---------------- blob shadow under the runner (always on: landing readability) */
  const blobTex = glow;
  const blob = new THREE.Mesh(T(new THREE.PlaneGeometry(1, 1)), T(new THREE.MeshBasicMaterial({ map: blobTex, color: "#000000", transparent: true, opacity: 0.45, depthWrite: false })));
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = 2;
  group.add(blob);

  /* ---------------- runtime update */
  let t = 0;
  const flagWave = (mesh, amp, speed) => {
    const p = mesh.geometry.attributes.position;
    if (!mesh.userData.base) mesh.userData.base = Float32Array.from(p.array);
    const base = mesh.userData.base;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3];
      const k = (x + 0.75) / 1.5;
      p.setZ(i, Math.sin(t * speed + x * 4) * amp * k);
    }
    p.needsUpdate = true;
  };

  function update(dt, ctx) {
    t += dt;
    // movers follow the engine boxes
    for (const mm of moverMeshes) {
      const b = mm.m.box;
      mm.g.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
      if (mm.cables) {
        // pivot is straight above the swing centre at rest
        const base = mm.m.base;
        const len = mm.g.userData.len;
        const px = (base.min[0] + base.max[0]) / 2;
        const pz = (base.min[2] + base.max[2]) / 2;
        const py = base.max[1] + len;
        const top = _top.set(px - mm.g.position.x, py - mm.g.position.y, pz - mm.g.position.z);
        for (const c of mm.cables) {
          const [lx, lz] = c.userData.local;
          const from = _from.set(lx, mm.sy / 2, lz);
          const dir = _dir.copy(top).sub(from);
          const l = dir.length();
          c.position.copy(from).addScaledVector(dir, 0.5);
          c.scale.set(1, l, 1);
          c.quaternion.setFromUnitVectors(UP, dir.normalize());
        }
        mm.g.userData.hook.position.copy(top);
        mm.g.userData.hook.position.y -= 0.3;
      }
    }
    // crumbles: shake while cracking, drop when fallen, pop back when reset
    for (const cm of crumbleMeshes) {
      const st = cm.c.state;
      if (st === "solid") {
        cm.g.visible = true;
        cm.g.position.copy(cm.home);
        cm.fallV = 0;
        for (const p of cm.g.children) if (p.userData.base) p.position.copy(p.userData.base);
      } else if (st === "cracking") {
        const k = cm.c.t / cm.c.delay;
        for (const p of cm.g.children) {
          if (!p.userData.base) continue;
          p.position.copy(p.userData.base);
          p.position.y += Math.sin(t * 60 + p.userData.k * 9) * 0.02 * (0.4 + k);
          p.rotation.z = Math.sin(t * 45 + p.userData.k * 7) * 0.04 * k;
        }
      } else {
        cm.fallV += 18 * dt;
        cm.g.position.y -= cm.fallV * dt;
        if (cm.g.position.y < cm.home.y - 30) cm.g.visible = false;
      }
    }
    // hazards
    for (const hm of hazardMeshes) {
      const h = hm.h;
      if (h.type === "steam") {
        const st = hazardPhase(h, ctx.clock);
        hm.col.material.opacity += ((st.on ? 0.42 : 0) - hm.col.material.opacity) * (1 - Math.exp(-14 * dt));
        hm.col.scale.set(1 + Math.sin(t * 20) * 0.05, 1, 1 + Math.cos(t * 17) * 0.05);
        hm.ring.material.opacity = st.warn ? 0.5 + 0.5 * Math.sin(t * 22) : st.on ? 0.9 : 0.35;
        hm.ring.material.color.set(st.on || st.warn ? "#ff5a3d" : "#ff8a3d");
        if (ctx.fx) {
          if (st.on) {
            ctx.fx.steam(h.pos[0], h.pos[1] + 0.3, h.pos[2], true);
            ctx.fx.steam(h.pos[0], h.pos[1] + 0.3, h.pos[2], true);
          } else if (st.warn || Math.random() < 0.15) ctx.fx.steam(h.pos[0], h.pos[1] + 0.3, h.pos[2], false);
        }
      } else if (h.type === "zap") {
        const st = hazardPhase(h, ctx.clock);
        hm.arcs.visible = st.on || (st.warn && Math.sin(t * 40) > 0.4);
        hm.arcs.rotation.y = t * 9;
        for (const a of hm.arcs.children) a.scale.z = 0.6 + Math.random() * 0.6;
        hm.ring.material.opacity = st.warn ? 0.4 + 0.5 * Math.abs(Math.sin(t * 18)) : st.on ? 0.9 : 0.3;
        if (st.on && ctx.fx && Math.random() < 0.5) ctx.fx.spark(h.pos[0], h.pos[1] + 1.2, h.pos[2]);
      } else if (h.type === "fan") {
        hm.blades.rotation.z += dt * 14;
        if (ctx.fx && Math.random() < 0.6) ctx.fx.wind(h.pos[0], h.pos[1] + 0.3, h.pos[2], h.dir[0], h.dir[2]);
      } else if (h.type === "hook") {
        // engine owns the hook position; cable from the jib to the hook
        hm.hook.position.set(h.x - h.pos[0], h.y - h.pos[1], h.z - h.pos[2]);
        hm.cable.position.copy(hm.hook.position).multiplyScalar(0.5);
        const dir = _dir.copy(hm.hook.position);
        hm.cable.scale.set(1, dir.length(), 1);
        hm.cable.quaternion.setFromUnitVectors(UP, dir.normalize().negate());
        hm.hook.rotation.z = (h.x - h.pos[0]) * 0.05;
      }
    }
    // stars
    stars.forEach((s, i) => {
      const taken = ctx.W.stars[i];
      if (taken && !s.taken) {
        s.taken = true;
        s.pop = 1;
      } else if (!taken && s.taken) {
        s.taken = false;
        s.pop = 0;
        s.g.visible = true;
        s.g.scale.setScalar(1);
      }
      if (s.taken) {
        s.pop = Math.max(0, s.pop - dt * 4);
        s.g.scale.setScalar(1 + (1 - s.pop) * 0.8);
        s.g.visible = s.pop > 0.01;
        s.m.material.opacity = s.pop;
      } else {
        s.m.rotation.y = t * 2.2 + i;
        s.g.position.y = L.stars[i].y + Math.sin(t * 2 + i) * 0.12;
      }
    });
    // checkpoints
    cps.forEach((c, i) => {
      const on = i <= ctx.W.cpIndex;
      if (on && !c.on) {
        c.on = true;
        c.pulse = 1;
        c.lamp.material = cpMats.on;
        c.ring.material.color.set("#4cff9a");
        c.flag.material.color.set("#4cff9a");
      } else if (!on && c.on) {
        c.on = false;
        c.lamp.material = cpMats.off;
        c.ring.material.color.set(theme.accent);
        c.flag.material.color.set(theme.accent);
      }
      c.pulse = Math.max(0, c.pulse - dt * 0.8);
      c.beam.material.opacity = c.pulse * 0.5;
      c.ring.scale.setScalar(1 + c.pulse * 0.6);
      c.ring.material.opacity = 0.35 + 0.25 * Math.sin(t * 3 + i) + c.pulse * 0.4;
      if (Math.abs(c.g.position.x - ctx.cam.x) + Math.abs(c.g.position.z - ctx.cam.z) < 90) flagWave(c.flag, 0.06, 6);
    });
    // finish
    if (finish) {
      finish.halo.rotation.z = t * 0.8;
      finish.halo.position.y = 2.4 + Math.sin(t * 2) * 0.15;
      finish.beam.material.opacity = 0.14 + 0.06 * Math.sin(t * 3) + finish.pulse * 0.4;
      finish.pulse = Math.max(0, finish.pulse - dt * 0.6);
      if (Math.abs(finish.g.position.x - ctx.cam.x) + Math.abs(finish.g.position.z - ctx.cam.z) < 120) flagWave(finish.flag, 0.12, 5);
      if (ctx.fx && Math.random() < 0.25) ctx.fx.smoke(L.finish.x, L.finish.y + 0.2, L.finish.z, theme.accent);
    }
    // blob shadow
    const P = ctx.W.player;
    const gy = ctx.groundY;
    if (gy != null && P.state !== "fallout") {
      const h = Math.max(0, P.y - gy);
      blob.visible = true;
      blob.position.set(P.x, gy + 0.03, P.z);
      const s = 0.95 * (1 + h * 0.08);
      blob.scale.set(s, s, 1);
      blob.material.opacity = Math.max(0.08, 0.5 - h * 0.05);
    } else blob.visible = false;
  }

  function onFinish() {
    if (finish) finish.pulse = 1;
  }

  function dispose() {
    scene.remove(group);
    for (const d of disp) if (d && d.dispose) d.dispose();
    inst.dispose();
    group.traverse((o) => {
      if (o.isInstancedMesh && o !== inst) o.dispose();
    });
  }

  return { group, update, dispose, onFinish, mats };
}
