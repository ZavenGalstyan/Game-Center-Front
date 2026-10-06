/**
 * Lost Toy — everything in a level that is tied to the engine and moves or
 * reacts: Memory Buttons, checkpoint flags, the finish flag, ridable movers,
 * pushable blocks, interactables, hazards and pets. Static furniture comes
 * from props.js (merged); the room from room.js.
 *
 * update(dt, ctx) reads engine state only (never writes it).
 */
import * as THREE from "three";
import { mat, worldUV, KINDS, glowTexture } from "./materials.js";
import { buildProps, rbox, blob, carParts, Parts, mergeParts, blockFace, labelMat, cyl, lathe } from "./props.js";
import { buildHazard, buildPet } from "./actors.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ------------------------------------------------------------------ shared geometry */
function buttonGeometry() {
  // a sewing button: rounded disc, raised rim, four thread holes
  const pts = [];
  const R = 0.3;
  pts.push([0, -0.05]);
  pts.push([R * 0.96, -0.05]);
  pts.push([R, -0.02]);
  pts.push([R, 0.03]);
  pts.push([R * 0.92, 0.065]);
  pts.push([R * 0.8, 0.055]);
  pts.push([R * 0.72, 0.03]);
  pts.push([0, 0.035]);
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 32);
  g.computeVertexNormals();
  return g;
}

function staticGroup(build) {
  const P = new Parts();
  build(P);
  const g = new THREE.Group();
  for (const m of mergeParts(P, { shadows: true })) {
    m.matrixAutoUpdate = true;
    g.add(m);
  }
  return g;
}

/* ------------------------------------------------------------------ movers */
const MOVER_BUILD = {
  gondola(m, def) {
    const g = new THREE.Group();
    const b = m.base;
    const w = b.max[0] - b.min[0];
    const d = b.max[2] - b.min[2];
    const body = staticGroup((P) => {
      P.frame(0, 0, 0);
      // a little wooden tray with a rim and a felt seat pad
      P.add(rbox(w, 0.25, d, 0.08, 1), "wood", def.color, { p: [0, -0.125, 0] });
      for (const s of [-1, 1]) {
        P.add(rbox(w, 0.35, 0.14, 0.05, 1), "wood", def.color2, { p: [0, 0.05, s * (d / 2 - 0.07)] });
        P.add(rbox(0.14, 0.35, d, 0.05, 1), "wood", def.color2, { p: [s * (w / 2 - 0.07), 0.05, 0] });
      }
      // strings up to a hanger + hook on the line
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const a = new THREE.Vector3(sx * (w / 2 - 0.12), 0.15, sz * (d / 2 - 0.12));
        const c = new THREE.Vector3(0, 4.4, 0);
        const dir = c.clone().sub(a);
        const len = dir.length();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        const e = new THREE.Euler().setFromQuaternion(q);
        P.add(cyl(0.025, 0.025, len, 5), "matte", "#efe6d2", { p: [(a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2], r: [e.x, e.y, e.z], cast: false });
      }
      P.add(new THREE.TorusGeometry(0.3, 0.06, 8, 16), "metal", "#d4d7dc", { p: [0, 4.65, 0], r: [0, Math.PI / 2, 0] });
      P.add(cyl(0.35, 0.35, 0.18, 16), "wood", "#d9473b", { p: [0, 6.3 - 0.95, 0], r: [Math.PI / 2, 0, 0] });
      P.add(cyl(0.05, 0.05, 1.0, 6), "metal", "#d4d7dc", { p: [0, 4.85, 0], cast: false });
    });
    g.add(body);
    // the line it hangs from (static, world space)
    let line = null;
    if (def.extra && def.extra.anchorA) {
      const A = new THREE.Vector3(...def.extra.anchorA);
      const Bv = new THREE.Vector3(...def.extra.anchorB);
      const len = A.distanceTo(Bv);
      line = new THREE.Mesh(cyl(0.035, 0.035, len, 6), mat("matte", "#efe6d2"));
      line.position.copy(A).add(Bv).multiplyScalar(0.5);
      line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize());
    }
    return {
      obj: g,
      extra: line,
      sway: 0,
      update(dt, M, ctx) {
        const bb = M.box;
        g.position.set((bb.min[0] + bb.max[0]) / 2, bb.max[1], (bb.min[2] + bb.max[2]) / 2);
        // a gentle pendulum sway when it starts/stops (visual only)
        const v = bb.vel[0];
        this.sway += ((-v * 0.04 - this.sway) * 3) * dt;
        body.rotation.z = ctx.motion ? this.sway : 0;
      },
    };
  },
  car(m, def) {
    const g = new THREE.Group();
    const body = staticGroup((P) => {
      P.frame(0, 0, 0);
      carParts(P, def.color, 0.86);
    });
    g.add(body);
    const ax = m.path.d && Math.abs(m.path.d[0]) > Math.abs(m.path.d[2]);
    return {
      obj: g,
      update(dt, M) {
        const bb = M.box;
        g.position.set((bb.min[0] + bb.max[0]) / 2, bb.min[1], (bb.min[2] + bb.max[2]) / 2);
        // nose points along travel (cars are symmetric under 180° so the box never changes)
        const h = M.heading;
        g.rotation.y = h - Math.PI / 2 + (ax ? 0 : 0);
      },
    };
  },
  vacuum(m, def) {
    // robot vacuum: a round disc with a bumper, a light and spinning side brushes
    const g = new THREE.Group();
    const b = m.base;
    const r = (b.max[0] - b.min[0]) * 0.68;
    const h = b.max[1] - b.min[1];
    const body = staticGroup((P) => {
      P.frame(0, 0, 0);
      P.add(cyl(r, r * 1.02, h * 0.8, 40), "plastic", def.color, { p: [0, h * 0.45, 0] });
      P.add(cyl(r * 0.96, r * 0.96, 0.08, 40), "glossy", def.color2, { p: [0, h * 0.86, 0] });
      P.add(cyl(r * 1.04, r * 1.04, h * 0.3, 40, true), "rubber", "#3a3a3e", { p: [0, h * 0.35, 0] });
      P.add(cyl(r * 0.25, r * 0.25, 0.1, 20), "plastic", "#f4f4f4", { p: [0, h * 0.9, -r * 0.35] });
    });
    g.add(body);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat("glow", "#5df2a8"));
    led.position.set(0, h * 0.92, r * 0.55);
    g.add(led);
    const brushes = [];
    for (const s of [-1, 1]) {
      const br = new THREE.Group();
      br.position.set(s * r * 0.6, 0.06, r * 0.65);
      for (let i = 0; i < 3; i++) {
        const bristle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.9), mat("matte", "#2a2a2e"));
        bristle.position.z = 0.4;
        const arm = new THREE.Group();
        arm.rotation.y = (i / 3) * TAU;
        arm.add(bristle);
        br.add(arm);
      }
      g.add(br);
      brushes.push({ br, s });
    }
    return {
      obj: g,
      update(dt, M, ctx) {
        const bb = M.box;
        g.position.set((bb.min[0] + bb.max[0]) / 2, bb.min[1], (bb.min[2] + bb.max[2]) / 2);
        g.rotation.y = M.heading;
        for (const b2 of brushes) b2.br.rotation.y += b2.s * dt * (M.active ? 14 : 0);
        led.material = mat("glow", M.active ? "#5df2a8" : "#f2c14e");
        void ctx;
      },
    };
  },
  trolley(m, def) {
    const g = new THREE.Group();
    const b = m.base;
    const w = b.max[0] - b.min[0];
    const d = b.max[2] - b.min[2];
    const h = b.max[1] - b.min[1];
    const body = staticGroup((P) => {
      P.frame(0, 0, 0);
      P.add(rbox(w, 0.3, d, 0.08, 1), "metal", def.color, { p: [0, h - 0.15, 0] });
      P.add(rbox(w, 0.25, d, 0.08, 1), "metal", def.color, { p: [0, h * 0.35, 0] });
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        P.add(cyl(0.12, 0.12, h - 0.4, 8), "metal", "#c9ccd2", { p: [sx * (w / 2 - 0.2), h / 2, sz * (d / 2 - 0.2)] });
        P.add(cyl(0.3, 0.3, 0.2, 14), "rubber", "#2a2a2e", { p: [sx * (w / 2 - 0.2), 0.3, sz * (d / 2 - 0.2)], r: [Math.PI / 2, 0, 0] });
      }
    });
    g.add(body);
    return {
      obj: g,
      update(dt, M) {
        const bb = M.box;
        g.position.set((bb.min[0] + bb.max[0]) / 2, bb.min[1], (bb.min[2] + bb.max[2]) / 2);
      },
    };
  },
  drawer(m, def) {
    const g = new THREE.Group();
    const b = m.base;
    const w = b.max[0] - b.min[0];
    const d = b.max[2] - b.min[2];
    const h = b.max[1] - b.min[1];
    const body = staticGroup((P) => {
      P.frame(0, 0, 0);
      P.add(rbox(w, h, d, 0.08, 1), "wood", def.color, { p: [0, h / 2, 0] });
      const ex = def.extra || {};
      const fx = ex.front === "+x" ? 1 : ex.front === "-x" ? -1 : 0;
      const fz = ex.front === "+z" ? 1 : ex.front === "-z" ? -1 : fx ? 0 : 1;
      P.add(rbox(fx ? 0.25 : w + 0.2, h + 0.3, fz ? 0.25 : d + 0.2, 0.06, 1), "woodPaint", def.color2, { p: [fx * (w / 2 + 0.1), h / 2, fz * (d / 2 + 0.1)] });
      P.add(new THREE.SphereGeometry(0.3, 12, 10), "metal", "#e0b04a", { p: [fx * (w / 2 + 0.4), h / 2, fz * (d / 2 + 0.4)] });
    });
    g.add(body);
    return {
      obj: g,
      update(dt, M) {
        const bb = M.box;
        g.position.set((bb.min[0] + bb.max[0]) / 2, bb.min[1], (bb.min[2] + bb.max[2]) / 2);
      },
    };
  },
  platform(m, def) {
    // generic: a book / board / lid carried by a string or a hand-crank lift
    const g = new THREE.Group();
    const b = m.base;
    const w = b.max[0] - b.min[0];
    const d = b.max[2] - b.min[2];
    const h = b.max[1] - b.min[1];
    const kind = (def.extra && def.extra.look) || "board";
    const body = staticGroup((P) => {
      P.frame(0, 0, 0);
      if (kind === "leaf") {
        P.add(blob(w * 1.1, h, d * 1.1, 2.4, 1.4), "felt", def.color, { p: [0, h / 2, 0] });
        P.add(new THREE.BoxGeometry(0.08, 0.05, d * 1.0), "felt", def.color2, { p: [0, h, 0], cast: false });
      } else if (kind === "book") {
        P.add(rbox(w, h, d, 0.04, 1), "paper", def.color, { p: [0, h / 2, 0] });
        P.add(new THREE.BoxGeometry(w - 0.12, h - 0.1, d - 0.12), "pages", "#ffffff", { p: [0.05, h / 2, 0] });
      } else if (kind === "lid") {
        P.add(cyl(w / 2, w / 2, h, 32), "metal", def.color, { p: [0, h / 2, 0] });
        P.add(new THREE.SphereGeometry(0.35, 12, 8), "plastic", def.color2, { p: [0, h + 0.15, 0] });
      } else if (kind === "sponge") {
        P.add(rbox(w, h * 0.7, d, 0.1, 2), "felt", "#f2d16b", { p: [0, h * 0.35, 0] });
        P.add(rbox(w, h * 0.3, d, 0.06, 1), "felt", "#5f9b52", { p: [0, h * 0.85, 0] });
      } else {
        P.add(rbox(w, h, d, 0.06, 1), "wood", def.color, { p: [0, h / 2, 0] });
      }
      if (def.extra && def.extra.strings) {
        for (const sx of [-1, 1]) P.add(cyl(0.025, 0.025, def.extra.strings, 5), "matte", "#efe6d2", { p: [sx * (w / 2 - 0.15), h + def.extra.strings / 2, 0], cast: false });
      }
    });
    g.add(body);
    return {
      obj: g,
      update(dt, M, ctx) {
        const bb = M.box;
        g.position.set((bb.min[0] + bb.max[0]) / 2, bb.min[1], (bb.min[2] + bb.max[2]) / 2);
        if (kind === "leaf" && ctx.motion) {
          body.rotation.z = Math.sin(ctx.clock * 1.3 + M.i) * 0.03;
          body.rotation.x = Math.cos(ctx.clock * 1.1 + M.i) * 0.03;
        }
      },
    };
  },
  train(m, def) {
    const g = new THREE.Group();
    const b = m.base;
    const w = b.max[0] - b.min[0];
    const h = b.max[1] - b.min[1];
    const body = staticGroup((P) => {
      P.frame(0, 0, 0);
      P.add(rbox(w, h * 0.55, w, 0.1, 2), "woodPaint", def.color, { p: [0, h * 0.45, 0] });
      P.add(rbox(w * 0.7, 0.18, w * 0.7, 0.06, 1), "woodPaint", def.color2, { p: [0, h - 0.09, 0] });
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        P.add(cyl(0.28, 0.28, 0.16, 14), "woodPaint", "#2a2a2e", { p: [sx * (w / 2 - 0.05), 0.28, sz * (w / 2 - 0.4)], r: [0, 0, Math.PI / 2] });
    });
    g.add(body);
    return {
      obj: g,
      update(dt, M) {
        const bb = M.box;
        g.position.set((bb.min[0] + bb.max[0]) / 2, bb.min[1], (bb.min[2] + bb.max[2]) / 2);
        g.rotation.y = M.heading;
      },
    };
  },
};
MOVER_BUILD.lift = MOVER_BUILD.platform;
MOVER_BUILD.wagon = MOVER_BUILD.trolley;

/* ------------------------------------------------------------------ build */
export function buildLevelMeshes(scene, W, theme, quality, { shadows = true } = {}) {
  const level = W.level;
  const root = new THREE.Group();
  root.name = "level";
  scene.add(root);
  const geos = [];
  const mats = [];

  // static furniture (merged) + reactive props
  const props = buildProps(level, quality, { shadows });
  for (const m of props.meshes) root.add(m);
  for (const d of props.dynamic) root.add(d.obj);
  const byBox = props.byBox;

  /* ---------------- Memory Buttons */
  const bGeo = buttonGeometry();
  geos.push(bGeo);
  const holeGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8);
  geos.push(holeGeo);
  const bMat = new THREE.MeshStandardMaterial({ color: "#f3c25a", roughness: 0.28, metalness: 0.35, emissive: "#ffb43a", emissiveIntensity: 0.55 });
  const holeMat = new THREE.MeshStandardMaterial({ color: "#8a5a1a", roughness: 0.6 });
  mats.push(bMat, holeMat);
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: "#ffcf6e", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  mats.push(glowMat);
  const buttons = level.buttons.map((b, i) => {
    const g = new THREE.Group();
    g.position.set(b.x, b.y, b.z);
    const spin = new THREE.Group();
    g.add(spin);
    const disc = new THREE.Mesh(bGeo, bMat);
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = shadows;
    spin.add(disc);
    for (const [hx, hy] of [
      [-0.07, 0.07],
      [0.07, 0.07],
      [-0.07, -0.07],
      [0.07, -0.07],
    ]) {
      const h = new THREE.Mesh(holeGeo, holeMat);
      h.rotation.x = Math.PI / 2;
      h.position.set(hx, hy, 0.022);
      spin.add(h);
    }
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(1.3, 1.3, 1);
    g.add(glow);
    root.add(g);
    return { g, spin, glow, i, got: false, popT: 0, ph: i * 1.3 };
  });

  /* ---------------- checkpoints: a spool of thread with a little stitched flag */
  const cps = level.checkpoints.map((c, i) => {
    const g = new THREE.Group();
    g.position.set(c.x, c.y, c.z);
    const base = staticGroup((P) => {
      P.frame(0, 0, 0);
      P.add(cyl(0.34, 0.34, 0.08, 20), "wood", "#d9b98f", { p: [0, 0.04, 0] });
      P.add(cyl(0.26, 0.26, 0.3, 20), "knit", "#7fb5c9", { p: [0, 0.23, 0] });
      P.add(cyl(0.34, 0.34, 0.08, 20), "wood", "#d9b98f", { p: [0, 0.42, 0] });
      P.add(cyl(0.035, 0.035, 1.5, 8), "wood", "#8a5a3a", { p: [0, 1.2, 0] });
      P.add(new THREE.SphereGeometry(0.07, 10, 8), "metal", "#e0b04a", { p: [0, 1.97, 0] });
    });
    g.add(base);
    const flagGeo = new THREE.PlaneGeometry(0.7, 0.45, 8, 2);
    flagGeo.translate(0.35, 0, 0);
    geos.push(flagGeo);
    const flagBase = flagGeo.attributes.position.array.slice();
    const fm = new THREE.MeshStandardMaterial({ color: "#efe6d2", roughness: 0.9, side: THREE.DoubleSide, emissive: "#000000" });
    mats.push(fm);
    const flag = new THREE.Mesh(flagGeo, fm);
    flag.position.set(0.035, 1.68, 0);
    flag.castShadow = shadows;
    g.add(flag);
    const ringMat = new THREE.MeshBasicMaterial({ color: "#ffcf6e", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    mats.push(ringMat);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 32), ringMat);
    geos.push(ring.geometry);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    g.add(ring);
    root.add(g);
    return { g, flag, flagGeo, flagBase, fm, ring, ringMat, active: false, pulse: 0, i };
  });

  /* ---------------- finish: a tall toy flag with a gold star + a soft halo */
  let finish = null;
  if (level.finish) {
    const f = level.finish;
    const g = new THREE.Group();
    g.position.set(f.x, f.y, f.z);
    const base = staticGroup((P) => {
      P.frame(0, 0, 0);
      P.add(cyl(0.55, 0.62, 0.22, 24), "woodPaint", "#e98a52", { p: [0, 0.11, 0] });
      P.add(cyl(0.045, 0.045, 2.6, 8), "wood", "#f4e7cf", { p: [0, 1.5, 0] });
    });
    g.add(base);
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.12 : 0.28;
      const a = (i / 10) * TAU + Math.PI / 2;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const sg = new THREE.ExtrudeGeometry(star, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2 });
    sg.translate(0, 0, -0.03);
    geos.push(sg);
    const sm = new THREE.MeshStandardMaterial({ color: "#f3c25a", roughness: 0.3, metalness: 0.4, emissive: "#ffb43a", emissiveIntensity: 0.6 });
    mats.push(sm);
    const starM = new THREE.Mesh(sg, sm);
    starM.position.y = 2.95;
    g.add(starM);
    const flagGeo = new THREE.PlaneGeometry(1.25, 0.8, 10, 3);
    flagGeo.translate(0.62, 0, 0);
    geos.push(flagGeo);
    const flagBase = flagGeo.attributes.position.array.slice();
    const fm = new THREE.MeshStandardMaterial({ color: "#d9473b", roughness: 0.85, side: THREE.DoubleSide });
    mats.push(fm);
    const flag = new THREE.Mesh(flagGeo, fm);
    flag.position.set(0.05, 2.35, 0);
    flag.castShadow = shadows;
    g.add(flag);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#ffd27a", transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    mats.push(halo.material);
    halo.scale.set(3.4, 3.4, 1);
    halo.position.y = 1.6;
    g.add(halo);
    root.add(g);
    finish = { g, flag, flagGeo, flagBase, starM, halo, reached: false, t: 0 };
  }

  /* ---------------- movers */
  const movers = W.movers.map((M) => {
    const def = level.props.find((p) => p.type === "mover" && p.mover === M.i) || { color: "#e85d4a", color2: "#f2c14e" };
    const make = MOVER_BUILD[M.kind] || MOVER_BUILD.platform;
    const v = make(M, def);
    root.add(v.obj);
    if (v.extra) root.add(v.extra);
    v.obj.traverse((o) => {
      if (o.isMesh) o.castShadow = shadows;
    });
    return v;
  });

  /* ---------------- pushable letter blocks */
  const pushes = W.pushables.map((pb) => {
    const def = level.props.find((p) => p.type === "block" && p.pushIndex === pb.i) || { color: "#e85d4a", letter: "A" };
    const s = pb.box.max[0] - pb.box.min[0];
    const tex = blockFace(def.color, def.letter);
    const lm = labelMat(tex, 0.55);
    const geo = rbox(s, s, s, 0.09, 2);
    geos.push(geo);
    const m = new THREE.Mesh(geo, lm.material);
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    root.add(m);
    return { m, pb, s, wob: 0 };
  });

  /* ---------------- interactables */
  const inters = W.interacts.map((it) => {
    const def = level.props.find((p) => p.type === "interact" && p.index === it.i) || {};
    const g = new THREE.Group();
    g.position.set(...it.pos);
    g.rotation.y = (def.rot || 0) * (Math.PI / 2);
    const spinner = new THREE.Group();
    let base;
    if (it.kind === "crank") {
      // a clamp + spool of string with a crank handle
      base = staticGroup((P) => {
        P.frame(0, 0, 0);
        P.add(rbox(0.9, 0.5, 0.9, 0.08, 1), "metal", "#c9ccd2", { p: [0, 0.25, 0] });
        P.add(rbox(0.25, 1.3, 0.8, 0.06, 1), "metal", "#c9ccd2", { p: [-0.35, 0.95, 0] });
        P.add(rbox(0.25, 1.3, 0.8, 0.06, 1), "metal", "#c9ccd2", { p: [0.35, 0.95, 0] });
      });
      const spool = staticGroup((P) => {
        P.frame(0, 0, 0);
        P.add(cyl(0.38, 0.38, 0.1, 18), "wood", "#d9b98f", { p: [0, 0.27, 0], r: [0, 0, 0] });
        P.add(cyl(0.3, 0.3, 0.45, 18), "knit", "#efe6d2", { p: [0, 0, 0] });
        P.add(cyl(0.38, 0.38, 0.1, 18), "wood", "#d9b98f", { p: [0, -0.27, 0] });
        P.add(rbox(0.12, 0.7, 0.12, 0.04, 1), "wood", def.color || "#e85d4a", { p: [0, 0.6, 0.0], r: [0, 0, 0] });
        P.add(cyl(0.1, 0.1, 0.4, 10), "wood", "#f2c14e", { p: [0, 0.85, 0.18], r: [Math.PI / 2, 0, 0] });
      });
      spool.rotation.z = Math.PI / 2;
      spinner.add(spool);
      spinner.position.set(0, 1.25, 0);
    } else if (it.kind === "switch" || it.kind === "lever") {
      base = staticGroup((P) => {
        P.frame(0, 0, 0);
        P.add(rbox(1.0, 0.3, 0.8, 0.08, 1), "plastic", "#f4f0e6", { p: [0, 0.15, 0] });
      });
      const lever = staticGroup((P) => {
        P.frame(0, 0, 0);
        P.add(rbox(0.16, 0.9, 0.16, 0.05, 1), "plastic", def.color || "#e85d4a", { p: [0, 0.45, 0] });
        P.add(new THREE.SphereGeometry(0.18, 12, 8), "plastic", def.color || "#e85d4a", { p: [0, 0.9, 0] });
      });
      spinner.add(lever);
      spinner.position.set(0, 0.3, 0);
      spinner.rotation.z = 0.5;
    } else {
      // wind-up key / big push button
      base = staticGroup((P) => {
        P.frame(0, 0, 0);
        P.add(cyl(0.45, 0.5, 0.25, 20), "plastic", "#f4f0e6", { p: [0, 0.125, 0] });
      });
      const btn = staticGroup((P) => {
        P.frame(0, 0, 0);
        P.add(cyl(0.32, 0.32, 0.2, 20), "plastic", def.color || "#e85d4a", { p: [0, 0.1, 0] });
      });
      spinner.add(btn);
      spinner.position.set(0, 0.25, 0);
    }
    g.add(base);
    g.add(spinner);
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = shadows;
    });
    root.add(g);
    return { g, spinner, it, kind: it.kind, t: 0, press: 0 };
  });

  /* ---------------- hazards + pets (see actors.js) */
  const hazards = W.hazards.map((h) => {
    const v = buildHazard(h, level, quality, { shadows });
    if (v) root.add(v.obj);
    return v;
  });
  const pets = W.pets.map((p) => {
    const v = buildPet(p, { shadows });
    root.add(v.obj);
    return v;
  });

  /* ---------------- per-frame */
  function waveFlag(geoA, base, t, amp) {
    const p = geoA.attributes.position;
    const arr = p.array;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3];
      arr[i * 3 + 2] = base[i * 3 + 2] + Math.sin(t * 5 - x * 5) * amp * x;
    }
    p.needsUpdate = true;
    geoA.computeVertexNormals();
  }

  function update(dt, ctx) {
    const t = ctx.clock;
    const motion = ctx.motion;
    ctx.W = W;
    for (const d of props.dynamic) d.update(dt, ctx);
    // buttons
    for (const b of buttons) {
      if (b.got && b.popT >= 1) continue;
      if (b.got) {
        b.popT = Math.min(1, b.popT + dt / 0.35);
        const s = 1 + b.popT * 0.8;
        b.g.scale.set(s, s, s);
        b.glow.material.opacity = 0.55 * (1 - b.popT);
        if (b.popT >= 1) b.g.visible = false;
        continue;
      }
      b.spin.rotation.y = t * 1.6 + b.ph;
      b.g.position.y = level.buttons[b.i].y + (motion ? Math.sin(t * 2 + b.ph) * 0.08 : 0);
      const pul = 1.2 + Math.sin(t * 3 + b.ph) * 0.12;
      b.glow.scale.set(pul, pul, 1);
    }
    // checkpoints
    for (const c of cps) {
      waveFlag(c.flagGeo, c.flagBase, t + c.i, motion ? (c.active ? 0.08 : 0.04) : 0.01);
      if (c.pulse > 0) {
        c.pulse = Math.max(0, c.pulse - dt / 1.1);
        const k = 1 - c.pulse;
        c.ring.scale.set(1 + k * 3, 1 + k * 3, 1);
        c.ringMat.opacity = c.pulse * 0.8;
      }
    }
    // finish
    if (finish) {
      finish.t += dt;
      waveFlag(finish.flagGeo, finish.flagBase, finish.t, motion ? 0.12 : 0.02);
      finish.starM.rotation.y = finish.t * (finish.reached ? 4 : 1.1);
      const hs = 3.4 + Math.sin(finish.t * 2) * 0.25;
      finish.halo.scale.set(hs, hs, 1);
    }
    // movers
    for (let i = 0; i < movers.length; i++) movers[i].update(dt, W.movers[i], ctx);
    // pushables (slight wobble while being pushed)
    for (const p of pushes) {
      const b = p.pb.box;
      p.m.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
      const pushing = W.player.state === "push" && W.player.push && W.player.push.pb === p.pb;
      p.wob += dt * (pushing ? 18 : 0);
      p.m.rotation.z = pushing && motion ? Math.sin(p.wob) * 0.012 : 0;
    }
    // interactables
    for (const it of inters) {
      const M = it.it.target && it.it.target.mover != null ? W.movers[it.it.target.mover] : null;
      if (it.kind === "crank") {
        if (M && M.active) it.spinner.rotation.x += dt * 2.4 * Math.sign(M.box.vel[0] || M.box.vel[2] || 1);
      } else if (it.kind === "switch" || it.kind === "lever") {
        const on = it.it.used;
        it.spinner.rotation.z += ((on ? -0.5 : 0.5) - it.spinner.rotation.z) * Math.min(1, dt * 12);
      } else {
        it.press = Math.max(0, it.press - dt * 3);
        it.spinner.position.y = 0.25 - it.press * 0.12;
      }
    }
    for (const h of hazards) if (h) h.update(dt, W, ctx);
    for (const p of pets) p.update(dt, W, ctx);
  }

  function onEvent(e) {
    switch (e.type) {
      case "button": {
        const b = buttons[e.i];
        if (b) {
          b.got = true;
          b.popT = 0;
        }
        break;
      }
      case "checkpoint": {
        const c = cps[e.i];
        if (c) {
          c.active = true;
          c.pulse = 1;
          c.fm.color.set("#e98a52");
          c.fm.emissive.set("#6a2a10");
        }
        break;
      }
      case "bounce": {
        const d = byBox.get(e.box - 1);
        if (d && d.bounce) d.bounce(e.strength);
        break;
      }
      case "interact": {
        const it = inters[e.i];
        if (it) it.press = 1;
        break;
      }
      case "finish":
        if (finish) finish.reached = true;
        break;
      case "restart":
        for (const b of buttons) {
          b.got = false;
          b.popT = 0;
          b.g.visible = true;
          b.g.scale.set(1, 1, 1);
          b.glow.material.opacity = 0.55;
        }
        for (const c of cps) {
          c.active = false;
          c.pulse = 0;
          c.fm.color.set("#efe6d2");
          c.fm.emissive.set("#000000");
          c.ringMat.opacity = 0;
        }
        if (finish) finish.reached = false;
        break;
      default:
    }
    for (const h of hazards) if (h && h.onEvent) h.onEvent(e);
    for (const p of pets) if (p.onEvent) p.onEvent(e);
  }

  function dispose() {
    scene.remove(root);
    root.traverse((o) => {
      if (o.isMesh || o.isPoints) {
        if (o.geometry) o.geometry.dispose();
      }
    });
    for (const d of props.dynamic) if (d.geos) for (const g of d.geos) g.dispose();
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    for (const h of hazards) if (h && h.dispose) h.dispose();
    for (const p of pets) if (p.dispose) p.dispose();
  }

  return { root, update, onEvent, dispose, buttons, cps };
}

export const _kinds = { KINDS, worldUV, lathe, clamp };
