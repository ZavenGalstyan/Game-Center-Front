/**
 * Mario Adventure 3D — level props (meshes only; behaviour lives in engine/).
 *
 * Static scenery (trees, flowers, bushes, rocks, cacti, palms, pines …) is
 * batched through an Instancer: every distinct (geometry, material) pair
 * becomes ONE InstancedMesh, so a meadow of flowers is a handful of draw
 * calls. Things that move (platforms, blocks, coins, pickups, flags, the
 * star, hazards) get light objects the renderer syncs every frame.
 */
import * as THREE from "three";
import { boxGeo, cylGeo, styleMats, tex } from "./materials.js";

/* ------------------------------------------------------------------ banks */
export function createGeoBank() {
  const map = new Map();
  const extra = [];
  return {
    get(key, make) {
      let g = map.get(key);
      if (!g) {
        g = make();
        map.set(key, g);
      }
      return g;
    },
    own(g) {
      extra.push(g);
      return g;
    },
    dispose() {
      for (const g of map.values()) g.dispose();
      for (const g of extra) g.dispose();
      map.clear();
      extra.length = 0;
    },
  };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export function createInstancer(shadows) {
  const groups = new Map();
  return {
    add(geo, mat, x, y, z, rx, ry, rz, sx, sy, sz, color, cast = true) {
      const key = geo.uuid + mat.uuid;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { geo, mat, items: [], cast }));
      g.items.push([x, y, z, rx, ry, rz, sx, sy ?? sx, sz ?? sx, color]);
    },
    build(parent) {
      const meshes = [];
      for (const g of groups.values()) {
        const im = new THREE.InstancedMesh(g.geo, g.mat, g.items.length);
        g.items.forEach((it, i) => {
          _p.set(it[0], it[1], it[2]);
          _q.setFromEuler(_e.set(it[3], it[4], it[5]));
          _s.set(it[6], it[7], it[8]);
          _m.compose(_p, _q, _s);
          im.setMatrixAt(i, _m);
          if (it[9]) im.setColorAt(i, _c.set(it[9]));
        });
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.castShadow = shadows && g.cast;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        parent.add(im);
        meshes.push(im);
      }
      return meshes;
    },
  };
}

/* ------------------------------------------------------------------ platforms */
export function makePlatform(pl, ctx) {
  const { bank, G, world, shadows } = ctx;
  const d = pl.def;
  const s = pl.solid;
  const root = new THREE.Group();
  const style = d.style || "grass";
  const h = s.hy * 2;
  let body;
  if (style === "spring") {
    const base = new THREE.Mesh(G.get("springBase", () => new THREE.CylinderGeometry(0.9, 1, 0.16, 24)), bank.color("#3a3a46", { roughness: 0.5, metalness: 0.4 }));
    base.position.y = -h / 2 + 0.08;
    const coil = new THREE.Mesh(G.get("springCoil", () => new THREE.TorusGeometry(0.55, 0.07, 8, 24)), bank.color("#c0c4cc", { roughness: 0.3, metalness: 0.7 }));
    coil.rotation.x = Math.PI / 2;
    const coil2 = coil.clone();
    coil.position.y = -0.02;
    coil2.position.y = 0.08;
    const pad = new THREE.Mesh(G.get("springPad", () => new THREE.CylinderGeometry(0.88, 0.88, 0.14, 24)), bank.color("#e3262b", { roughness: 0.45 }));
    pad.position.y = h / 2 - 0.07;
    const star = new THREE.Mesh(G.get("springStar", () => starShape(0.32, 0.14, 0.04)), bank.color("#ffd23a", { emissive: "#7a5a00", roughness: 0.4 }));
    star.rotation.x = -Math.PI / 2;
    star.position.y = h / 2 + 0.01;
    const top = new THREE.Group();
    top.add(pad, star);
    root.add(base, coil, coil2, top);
    root.userData.top = top;
    root.userData.coils = [coil, coil2];
    for (const o of [base, coil, coil2, pad]) {
      o.castShadow = shadows;
      o.receiveShadow = true;
    }
  } else if (s.shape === "cyl") {
    const key = `cyl:${s.r}:${h}:${style}`;
    const geo = G.get(key, () => cylGeo(s.r, h, 32, 2));
    const mats = styleMats(bank, style, world);
    body = new THREE.Mesh(geo, [mats[0], mats[2], mats[3]]);
    root.add(body);
  } else {
    const key = `box:${s.hx * 2}:${h}:${s.hz * 2}`;
    const geo = G.get(key, () => boxGeo(s.hx * 2, h, s.hz * 2, 2));
    let mats = styleMats(bank, style, world);
    if (pl.kind === "blink") {
      const m = bank.own(mats[0].clone());
      mats = [m, m, m, m, m, m];
      root.userData.blinkMat = m;
    }
    body = new THREE.Mesh(geo, mats);
    root.add(body);
    // grass lip on grass-style platforms
    if ((style === "grass" || style === "grassBlock") && world.key !== "lava") {
      const lipKey = `lip:${s.hx * 2}:${s.hz * 2}`;
      const lipGeo = G.get(lipKey, () => boxGeo(s.hx * 2 + 0.12, 0.22, s.hz * 2 + 0.12, 2));
      const lipM = mats[2];
      const lip = new THREE.Mesh(lipGeo, lipM);
      lip.position.y = h / 2 - 0.1;
      lip.castShadow = shadows;
      lip.receiveShadow = true;
      root.add(lip);
    }
    if (pl.kind === "move" && style === "lift") {
      // little engine glow underneath so lifts read as "machines"
      const glow = new THREE.Mesh(G.get("liftGlow", () => new THREE.SphereGeometry(0.22, 12, 8)), bank.color("#ffd23a", { emissive: "#ff9a1f", emissiveIntensity: 1.2 }));
      glow.position.y = -h / 2 - 0.05;
      root.add(glow);
    }
    if (pl.kind === "fall") {
      root.userData.shake = true;
    }
  }
  if (body) {
    body.castShadow = shadows;
    body.receiveShadow = true;
  }
  root.position.set(s.x, s.y, s.z);
  root.rotation.y = -s.yaw;
  return root;
}

/** per-frame: follow the solid, shake/fade/squash */
export function syncPlatform(obj, pl, t) {
  const s = pl.solid;
  obj.position.set(s.x, s.y, s.z);
  obj.rotation.y = -s.yaw;
  if (pl.kind === "fall") {
    obj.visible = s.active || pl.state === "drop";
    if (pl.state === "shake") {
      obj.position.x += Math.sin(t * 70) * 0.06;
      obj.position.z += Math.cos(t * 63) * 0.06;
    }
    const k = pl.fade;
    obj.scale.setScalar(0.6 + 0.4 * k);
  } else if (pl.kind === "blink") {
    const m = obj.userData.blinkMat;
    const vis = pl.fade;
    obj.visible = vis > 0.02;
    if (m) {
      const flick = pl.warn ? (Math.floor(t * 14) % 2 ? 0.25 : 0.85) : 0.85;
      m.opacity = vis * flick;
    }
  } else if (pl.kind === "bounce") {
    const top = obj.userData.top;
    if (top) top.position.y = -pl.squash * 0.18 + Math.max(0, Math.sin(pl.squash * 9)) * pl.squash * 0.1;
  }
}

/* rotation convention: engine yaw rotates local→world by +yaw around Y with
 * x' = x cos − z sin, z' = x sin + z cos ; THREE's rotation.y = θ maps
 * x' = x cos + z sin, z' = −x sin + z cos → rotation.y = −yaw. */

/* ------------------------------------------------------------------ shapes */
export function starShape(R, r, depth, bevel = true) {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 ? r : R;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) sh.moveTo(x, y);
    else sh.lineTo(x, y);
  }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel, bevelThickness: depth * 0.6, bevelSize: R * 0.08, bevelSegments: 3 });
  g.center();
  return g;
}

function heartShape(s, depth) {
  const sh = new THREE.Shape();
  sh.moveTo(0, -0.9 * s);
  sh.bezierCurveTo(0.9 * s, -0.2 * s, 1.0 * s, 0.6 * s, 0.5 * s, 0.75 * s);
  sh.bezierCurveTo(0.2 * s, 0.85 * s, 0, 0.6 * s, 0, 0.45 * s);
  sh.bezierCurveTo(0, 0.6 * s, -0.2 * s, 0.85 * s, -0.5 * s, 0.75 * s);
  sh.bezierCurveTo(-1.0 * s, 0.6 * s, -0.9 * s, -0.2 * s, 0, -0.9 * s);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: depth * 0.5, bevelSize: s * 0.1, bevelSegments: 3 });
  g.center();
  return g;
}

/* ------------------------------------------------------------------ blocks */
export function makeBlock(b, ctx) {
  const { bank, G, shadows } = ctx;
  const geo = G.get("block", () => new THREE.BoxGeometry(1.1, 1.1, 1.1));
  const m = new THREE.Mesh(geo, b.kind === "brick" ? bank.tex("brick") : bank.tex("qblock", { emissive: "#3a2400", emissiveIntensity: 0.25 }));
  m.castShadow = shadows;
  m.receiveShadow = true;
  m.position.set(b.x, b.y, b.z);
  m.userData.usedMat = bank.tex("used");
  return m;
}
export function syncBlock(m, b) {
  m.visible = !b.hidden;
  const bump = b.bumpT > 0 ? Math.sin((1 - b.bumpT / 0.22) * Math.PI) * 0.35 : 0;
  m.position.y = b.y + bump;
  if (b.used && m.material !== m.userData.usedMat) m.material = m.userData.usedMat;
}

/* ------------------------------------------------------------------ pipes */
export function makePipe(p, ctx) {
  const { bank, G, shadows } = ctx;
  const g = new THREE.Group();
  const green = bank.color("#25b34a", { roughness: 0.35, metalness: 0.05 });
  const dark = bank.color("#0f3d1a", { roughness: 1 });
  const hl = bank.color("#7be38f", { roughness: 0.3 });
  const tube = new THREE.Mesh(G.get(`pipeTube:${p.r}:${p.h}`, () => new THREE.CylinderGeometry(p.r * 0.86, p.r * 0.86, p.h - 0.55, 28)), green);
  tube.position.y = (p.h - 0.55) / 2;
  const lip = new THREE.Mesh(G.get(`pipeLip:${p.r}`, () => new THREE.CylinderGeometry(p.r, p.r, 0.6, 28)), green);
  lip.position.y = p.h - 0.3;
  const hole = new THREE.Mesh(G.get(`pipeHole:${p.r}`, () => new THREE.CircleGeometry(p.r * 0.78, 24)), dark);
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = p.h + 0.005;
  const stripe = new THREE.Mesh(G.get(`pipeStripe:${p.r}:${p.h}`, () => new THREE.BoxGeometry(0.12, p.h - 0.6, 0.06)), hl);
  stripe.position.set(-p.r * 0.5, (p.h - 0.6) / 2, p.r * 0.7);
  stripe.rotation.y = -0.6;
  const stripe2 = new THREE.Mesh(G.get(`pipeStripe2:${p.r}`, () => new THREE.BoxGeometry(0.14, 0.5, 0.06)), hl);
  stripe2.position.set(-p.r * 0.58, p.h - 0.3, p.r * 0.82);
  stripe2.rotation.y = -0.6;
  g.add(tube, lip, hole, stripe, stripe2);
  for (const o of [tube, lip]) {
    o.castShadow = shadows;
    o.receiveShadow = true;
  }
  if (p.to != null) {
    // warp pipes breathe a faint sparkle ring so curious players notice them
    const ring = new THREE.Mesh(G.get("pipeRing", () => new THREE.TorusGeometry(0.62, 0.035, 6, 32)), bank.color("#ffffff", { emissive: "#b8ffcf", emissiveIntensity: 0.8, transparent: true, opacity: 0.55 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = p.h + 0.25;
    g.add(ring);
    g.userData.ring = ring;
  }
  g.position.set(p.x, p.base, p.z);
  return g;
}

/* ------------------------------------------------------------------ coins (instanced) */
export function makeCoins(coins, ctx) {
  const { bank, G } = ctx;
  const geo = G.get("coin", () => {
    // lathe profile → a coin with a raised rim, then stood upright
    const pts = [
      [0, -0.05],
      [0.34, -0.05],
      [0.42, -0.07],
      [0.44, -0.04],
      [0.44, 0.04],
      [0.42, 0.07],
      [0.34, 0.05],
      [0, 0.05],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts.reverse(), 28);
    g.rotateX(Math.PI / 2);
    return g;
  });
  const mat = bank.color("#ffcc1f", { roughness: 0.28, metalness: 0.55, emissive: "#8a5a00", emissiveIntensity: 0.55 });
  // spare slots for coins that appear mid-level (boss rewards)
  const cap = coins.length + 24;
  const im = new THREE.InstancedMesh(geo, mat, cap);
  im.castShadow = ctx.shadows;
  im.frustumCulled = false;
  im.count = coins.length;
  const mark = G.get("coinMark", () => new THREE.BoxGeometry(0.1, 0.42, 0.13));
  const im2 = new THREE.InstancedMesh(mark, bank.color("#ffe680", { roughness: 0.3, metalness: 0.5, emissive: "#a07000", emissiveIntensity: 0.5 }), cap);
  im2.frustumCulled = false;
  im2.count = coins.length;
  const group = new THREE.Group();
  group.add(im, im2);
  return { group, im, im2 };
}
export function syncCoins(view, coins, t) {
  const { im, im2 } = view;
  const spin = t * 3.2;
  const n = Math.min(coins.length, im.instanceMatrix.count);
  im.count = im2.count = n;
  for (let i = 0; i < n; i++) {
    const c = coins[i];
    if (c.taken) {
      _s.set(0, 0, 0);
    } else _s.set(1, 1, 1);
    const bob = c.mag ? 0 : Math.sin(t * 2.4 + i * 0.7) * 0.08;
    _p.set(c.x, c.y + bob, c.z);
    _q.setFromEuler(_e.set(0, spin + i * 0.25, 0));
    _m.compose(_p, _q, _s);
    im.setMatrixAt(i, _m);
    im2.setMatrixAt(i, _m);
  }
  im.instanceMatrix.needsUpdate = true;
  im2.instanceMatrix.needsUpdate = true;
}

/* ------------------------------------------------------------------ checkpoint flag */
export function makeCheckpoint(c, ctx) {
  const { bank, G, shadows } = ctx;
  const g = new THREE.Group();
  const pole = new THREE.Mesh(G.get("cpPole", () => new THREE.CylinderGeometry(0.07, 0.07, 3, 10)), bank.color("#d9dde3", { roughness: 0.35, metalness: 0.5 }));
  pole.position.y = 1.5;
  const knob = new THREE.Mesh(G.get("cpKnob", () => new THREE.SphereGeometry(0.15, 14, 10)), bank.color("#ffd23a", { roughness: 0.3, metalness: 0.5 }));
  knob.position.y = 3.05;
  const base = new THREE.Mesh(G.get("cpBase", () => new THREE.CylinderGeometry(0.55, 0.65, 0.25, 18)), bank.color("#8a8f99", { roughness: 0.8 }));
  base.position.y = 0.12;
  const flagPivot = new THREE.Group();
  flagPivot.position.set(0, 2.55, 0);
  const flagGeo = G.get("cpFlag", () => {
    const geo = new THREE.PlaneGeometry(1.1, 0.7, 6, 1);
    geo.translate(0.55, 0, 0);
    return geo;
  });
  const flagOff = bank.color("#c9ced6", { side: THREE.DoubleSide, roughness: 0.8 });
  const flagOn = bank.color("#e3262b", { side: THREE.DoubleSide, roughness: 0.7, emissive: "#3a0000" });
  const flag = new THREE.Mesh(flagGeo, flagOff);
  const emb = new THREE.Mesh(G.get("cpStar", () => starShape(0.17, 0.08, 0.02, false)), bank.color("#ffffff", { emissive: "#666666" }));
  emb.position.set(0.5, 0, 0.02);
  flagPivot.add(flag, emb);
  g.add(pole, knob, base, flagPivot);
  for (const o of [pole, base, flag]) o.castShadow = shadows;
  g.position.set(c.x, c.y, c.z);
  g.userData = { flag, flagPivot, flagOn, flagOff, emb, geo: flagGeo, base: flagGeo.attributes.position.array.slice() };
  return g;
}
export function syncCheckpoint(g, c, t) {
  const u = g.userData;
  const mat = c.active ? u.flagOn : u.flagOff;
  if (u.flag.material !== mat) u.flag.material = mat;
  u.emb.visible = c.active;
  // raise the flag when activated
  const want = c.active ? 2.55 : 1.0;
  u.flagPivot.position.y += (want - u.flagPivot.position.y) * 0.08;
  u.flagPivot.rotation.y = Math.sin(t * 1.3) * 0.15;
}

/* ------------------------------------------------------------------ goal pole */
export function makeGoal(goal, ctx) {
  const { bank, G, shadows } = ctx;
  const g = new THREE.Group();
  const h = goal.h;
  const pole = new THREE.Mesh(G.get(`goalPole:${h}`, () => new THREE.CylinderGeometry(0.1, 0.1, h, 12)), bank.color("#7ee08a", { roughness: 0.3, metalness: 0.2 }));
  pole.position.y = h / 2 + 0.5;
  const ball = new THREE.Mesh(G.get("goalBall", () => new THREE.SphereGeometry(0.32, 20, 14)), bank.color("#ffd23a", { roughness: 0.25, metalness: 0.6, emissive: "#6a4a00" }));
  ball.position.y = h + 0.75;
  const base = new THREE.Mesh(G.get("goalBase", () => boxGeo(1.1, 1, 1.1, 1.1)), bank.tex("used"));
  base.position.y = 0.5;
  const flagGeo = G.get("goalFlag", () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(-1.7, -0.6);
    s.lineTo(0, -1.2);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  });
  const flag = new THREE.Mesh(flagGeo, bank.color("#ffffff", { side: THREE.DoubleSide, roughness: 0.7 }));
  const emb = new THREE.Mesh(G.get("goalStar", () => starShape(0.26, 0.11, 0.03, false)), bank.color("#2ec44a", { emissive: "#0a4a14" }));
  emb.position.set(-0.6, -0.6, 0.03);
  const flagPivot = new THREE.Group();
  flagPivot.add(flag, emb);
  flagPivot.position.set(-0.08, h + 0.3, 0);
  g.add(pole, ball, base, flagPivot);
  for (const o of [pole, ball, base, flag]) {
    o.castShadow = shadows;
    o.receiveShadow = true;
  }
  // a soft beacon so the goal reads from far away
  const beam = new THREE.Mesh(G.get(`goalBeam:${h}`, () => new THREE.CylinderGeometry(0.9, 0.9, h + 3, 20, 1, true)), bank.color("#ffffff", { transparent: true, opacity: 0.08, emissive: "#fff2a8", emissiveIntensity: 1, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = (h + 3) / 2;
  g.add(beam);
  g.position.set(goal.x, goal.y, goal.z);
  g.userData = { flagPivot, beam };
  return g;
}
export function syncGoal(g, goal, W, t) {
  g.visible = !goal.hidden;
  const u = g.userData;
  if (W.state === "goal" || W.state === "complete") {
    // flag slides down with Mario
    const k = Math.min(1, W.goalT / 1.1);
    u.flagPivot.position.y = goal.h + 0.3 - k * (goal.h - 1);
  } else u.flagPivot.position.y = goal.h + 0.3;
  u.flagPivot.rotation.y = Math.sin(t * 1.5) * 0.12;
  u.beam.material.opacity = 0.06 + Math.sin(t * 2) * 0.02;
}

/* ------------------------------------------------------------------ hidden star + pickups */
export function makeStar(ctx, big = true) {
  const { bank, G } = ctx;
  const g = new THREE.Group();
  const star = new THREE.Mesh(G.get(big ? "bigStar" : "smallStar", () => starShape(big ? 0.75 : 0.42, big ? 0.34 : 0.19, big ? 0.22 : 0.12)), bank.color("#ffd21f", { roughness: 0.2, metalness: 0.45, emissive: "#b07a00", emissiveIntensity: big ? 0.8 : 0.6 }));
  star.castShadow = ctx.shadows;
  g.add(star);
  if (big) {
    // cute eyes
    const eyeG = G.get("starEye", () => new THREE.CapsuleGeometry(0.05, 0.12, 4, 8));
    const eyeM = bank.color("#1a1206");
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(eyeG, eyeM);
      e.position.set(0.14 * s, 0.05, 0.2);
      star.add(e);
    }
    const halo = new THREE.Mesh(G.get("starHalo", () => new THREE.RingGeometry(0.95, 1.25, 40)), bank.color("#fff2a8", { transparent: true, opacity: 0.35, emissive: "#ffe066", emissiveIntensity: 1, side: THREE.DoubleSide, depthWrite: false }));
    g.add(halo);
    g.userData.halo = halo;
  }
  g.userData.star = star;
  return g;
}

export function makePickup(type, ctx) {
  const { bank, G } = ctx;
  const g = new THREE.Group();
  const shell = new THREE.Mesh(G.get("bubble", () => new THREE.SphereGeometry(0.58, 24, 16)), bank.color("#ffffff", { transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false }));
  let core;
  if (type === "heart") {
    core = new THREE.Mesh(G.get("heart", () => heartShape(0.36, 0.14)), bank.color("#ff3b5c", { roughness: 0.35, emissive: "#6a0012" }));
    core.rotation.z = Math.PI;
  } else if (type === "star") {
    core = new THREE.Mesh(G.get("smallStar", () => starShape(0.42, 0.19, 0.12)), bank.color("#ffe14a", { roughness: 0.2, emissive: "#ffb000", emissiveIntensity: 0.9 }));
  } else if (type === "speed") {
    core = new THREE.Group();
    const bolt = new THREE.Mesh(
      G.get("bolt", () => {
        const s = new THREE.Shape();
        s.moveTo(0.08, 0.45);
        s.lineTo(-0.22, -0.02);
        s.lineTo(-0.02, -0.02);
        s.lineTo(-0.12, -0.45);
        s.lineTo(0.24, 0.08);
        s.lineTo(0.03, 0.08);
        s.closePath();
        const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2 });
        geo.center();
        return geo;
      }),
      bank.color("#38b6ff", { roughness: 0.3, emissive: "#0b5fa8", emissiveIntensity: 0.8 }),
    );
    core.add(bolt);
  } else if (type === "jump") {
    core = new THREE.Group();
    const m = bank.color("#4cd964", { roughness: 0.3, emissive: "#0f6a22", emissiveIntensity: 0.7 });
    const cone = G.get("arrowHead", () => new THREE.ConeGeometry(0.2, 0.25, 4));
    const stem = G.get("arrowStem", () => new THREE.BoxGeometry(0.1, 0.22, 0.1));
    for (const y of [-0.12, 0.2]) {
      const h = new THREE.Mesh(cone, m);
      h.position.y = y + 0.1;
      const st = new THREE.Mesh(stem, m);
      st.position.y = y - 0.1;
      core.add(h, st);
    }
  } else if (type === "magnet") {
    core = new THREE.Group();
    const arc = new THREE.Mesh(G.get("magArc", () => new THREE.TorusGeometry(0.24, 0.09, 10, 20, Math.PI)), bank.color("#e3262b", { roughness: 0.35, emissive: "#4a0000" }));
    arc.rotation.z = Math.PI;
    const tipG = G.get("magTip", () => new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12));
    const tipM = bank.color("#dfe3ea", { roughness: 0.3, metalness: 0.6 });
    for (const s of [-1, 1]) {
      const tip = new THREE.Mesh(tipG, tipM);
      tip.position.set(0.24 * s, 0.08, 0);
      core.add(tip);
    }
    core.add(arc);
    core.position.y = 0.05;
  }
  g.add(core, shell);
  g.userData = { core, shell, type };
  return g;
}

/* ------------------------------------------------------------------ signs */
export function makeSign(s, ctx) {
  const { bank, G, shadows } = ctx;
  const g = new THREE.Group();
  const wood = bank.tex("plank");
  const post = new THREE.Mesh(G.get("signPost", () => new THREE.BoxGeometry(0.16, 1.3, 0.16)), wood);
  post.position.y = 0.65;
  const board = new THREE.Mesh(G.get("signBoard", () => boxGeo(1.3, 0.85, 0.12, 1)), wood);
  board.position.y = 1.35;
  const mark = new THREE.Mesh(G.get("signMark", () => new THREE.CircleGeometry(0.24, 20)), bank.color("#ffd23a", { emissive: "#6a4a00" }));
  mark.position.set(0, 1.35, 0.065);
  const bang = new THREE.Mesh(G.get("signBang", () => new THREE.BoxGeometry(0.07, 0.22, 0.02)), bank.color("#5a3412"));
  bang.position.set(0, 1.39, 0.08);
  const dot = new THREE.Mesh(G.get("signDot", () => new THREE.BoxGeometry(0.07, 0.07, 0.02)), bank.color("#5a3412"));
  dot.position.set(0, 1.23, 0.08);
  g.add(post, board, mark, bang, dot);
  post.castShadow = board.castShadow = shadows;
  g.position.set(s.x, s.y, s.z);
  g.rotation.y = s.yaw || 0;
  return g;
}

/* ------------------------------------------------------------------ hazards */
export function makeHazard(h, ctx) {
  const { bank, G, shadows } = ctx;
  const d = h.def;
  const g = new THREE.Group();
  switch (h.kind) {
    case "spikes": {
      const w = d.w ?? 2;
      const dd = d.d ?? w;
      const base = new THREE.Mesh(G.get(`spBase:${w}:${dd}`, () => boxGeo(w, 0.18, dd, 1)), bank.color("#5a5f6b", { roughness: 0.5, metalness: 0.5 }));
      base.position.y = 0.09;
      g.add(base);
      const cone = G.get("spike", () => new THREE.ConeGeometry(0.2, 0.55, 8));
      const m = bank.color("#d7dce6", { roughness: 0.25, metalness: 0.8 });
      const nx = Math.max(1, Math.round(w / 0.45));
      const nz = Math.max(1, Math.round(dd / 0.45));
      for (let i = 0; i < nx; i++) {
        for (let k = 0; k < nz; k++) {
          const c = new THREE.Mesh(cone, m);
          c.position.set(-w / 2 + (i + 0.5) * (w / nx), 0.45, -dd / 2 + (k + 0.5) * (dd / nz));
          c.castShadow = shadows;
          g.add(c);
        }
      }
      g.position.set(d.x, d.y, d.z);
      break;
    }
    case "firebar": {
      const blk = new THREE.Mesh(G.get("block", () => new THREE.BoxGeometry(1.1, 1.1, 1.1)), bank.tex("used"));
      blk.scale.setScalar(0.92);
      g.add(blk);
      const ballG = G.get("fireball", () => new THREE.SphereGeometry(0.3, 12, 10));
      const ballM = bank.color("#ff9a1f", { emissive: "#ff5a00", emissiveIntensity: 1.4, roughness: 0.6 });
      const n = (d.n ?? 5) * (d.double ? 2 : 1);
      const balls = [];
      for (let i = 0; i < n; i++) {
        const b = new THREE.Mesh(ballG, ballM);
        balls.push(b);
        ctx.root.add(b);
      }
      g.userData.balls = balls;
      g.position.set(d.x, d.y, d.z);
      break;
    }
    case "crusher": {
      const s = h.solid.hx * 2;
      const box = new THREE.Mesh(G.get(`crush:${s}`, () => boxGeo(s, s, s, 1.1)), bank.tex("stone", { color: "#a8b4c4" }));
      box.castShadow = shadows;
      box.receiveShadow = true;
      g.add(box);
      // angry face
      const eyeM = bank.color("#1a1a22");
      const browG = G.get("crBrow", () => new THREE.BoxGeometry(0.5, 0.12, 0.05));
      const eyeG = G.get("crEye", () => new THREE.BoxGeometry(0.22, 0.32, 0.05));
      for (const sd of [-1, 1]) {
        const e = new THREE.Mesh(eyeG, eyeM);
        e.position.set(0.38 * sd, 0.1, s / 2 + 0.02);
        const b = new THREE.Mesh(browG, eyeM);
        b.position.set(0.38 * sd, 0.42, s / 2 + 0.02);
        b.rotation.z = -0.4 * sd;
        g.add(e, b);
      }
      const mouth = new THREE.Mesh(G.get("crMouth", () => new THREE.BoxGeometry(0.9, 0.14, 0.05)), eyeM);
      mouth.position.set(0, -0.45, s / 2 + 0.02);
      g.add(mouth);
      // shadow-ish warning disc on the ground
      const warn = new THREE.Mesh(G.get(`crWarn:${s}`, () => new THREE.PlaneGeometry(s * 1.05, s * 1.05)), bank.color("#000000", { transparent: true, opacity: 0.25, depthWrite: false }));
      warn.rotation.x = -Math.PI / 2;
      ctx.root.add(warn);
      warn.position.set(d.x, h.low + 0.03, d.z);
      g.userData.warn = warn;
      break;
    }
    case "cannon": {
      const base = new THREE.Mesh(G.get("cnBase", () => boxGeo(1.4, 1.3, 1.4, 1.1)), bank.tex("used"));
      base.position.y = 0.65;
      const barrel = new THREE.Mesh(G.get("cnBarrel", () => new THREE.CylinderGeometry(0.42, 0.5, 1.4, 18)), bank.color("#2a2a30", { roughness: 0.35, metalness: 0.6 }));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 1.45, 0.3);
      const ring = new THREE.Mesh(G.get("cnRing", () => new THREE.TorusGeometry(0.45, 0.07, 8, 20)), bank.color("#d6a531", { roughness: 0.3, metalness: 0.7 }));
      ring.position.set(0, 1.45, 0.98);
      const skull = new THREE.Mesh(G.get("cnSkull", () => new THREE.CircleGeometry(0.28, 16)), bank.color("#ffffff"));
      skull.position.set(0, 0.7, 0.71);
      g.add(base, barrel, ring, skull);
      base.castShadow = barrel.castShadow = shadows;
      g.position.set(d.x, d.y, d.z);
      g.rotation.y = d.yaw || 0;
      g.userData.barrel = barrel;
      break;
    }
    case "icicle": {
      const ice = new THREE.Mesh(G.get("icicle", () => new THREE.ConeGeometry(0.35, 1.6, 8)), bank.color("#bfe9ff", { roughness: 0.1, transparent: true, opacity: 0.9, emissive: "#3a7aa8", emissiveIntensity: 0.3 }));
      ice.rotation.x = Math.PI;
      ice.position.y = -0.8;
      ice.castShadow = shadows;
      g.add(ice);
      g.position.set(d.x, d.y, d.z);
      break;
    }
    case "geyser": {
      const lava = ctx.world.key === "lava";
      const col = lava ? "#ff7a1f" : ctx.world.key === "desert" ? "#e8c27a" : "#bfe9ff";
      const vent = new THREE.Mesh(G.get("gyVent", () => new THREE.CylinderGeometry(1.0, 1.3, 0.35, 18)), bank.color(lava ? "#3a2c2d" : "#9a8a7a", { roughness: 0.9 }));
      vent.position.y = 0.17;
      const pool = new THREE.Mesh(G.get("gyPool", () => new THREE.CircleGeometry(0.75, 18)), bank.color(col, { emissive: lava ? "#ff3a00" : "#000000", emissiveIntensity: 0.8 }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.36;
      const colH = d.height ?? 5;
      const column = new THREE.Mesh(G.get(`gyCol:${colH}`, () => new THREE.CylinderGeometry(0.85, 1.05, colH, 16, 1, true)), bank.color(col, { emissive: lava ? "#ff4a00" : "#555555", emissiveIntensity: lava ? 1.2 : 0.3, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      column.position.y = colH / 2;
      g.add(vent, pool, column);
      g.position.set(d.x, d.y, d.z);
      g.userData.column = column;
      g.userData.pool = pool;
      break;
    }
    default:
  }
  return g;
}

/* ------------------------------------------------------------------ scenery */
/** adds one decoration to the instancer (static) */
export function addDeco(I, o, ctx) {
  const { bank, G, world } = ctx;
  const s = o.s || 1;
  const x = o.x;
  const y = o.y;
  const z = o.z;
  const r = o.rot || 0;
  const rnd = (k) => {
    const v = Math.sin(x * 12.9 + z * 78.2 + k * 3.7) * 43758.5;
    return v - Math.floor(v);
  };
  switch (o.t) {
    case "tree": {
      const trunk = G.get("trunk", () => new THREE.CylinderGeometry(0.28, 0.4, 2.4, 10));
      const leaf = G.get("leaf", () => new THREE.SphereGeometry(1, 18, 14));
      const tm = bank.color("#8a5a2b", { roughness: 0.9 });
      const lm = bank.color("#ffffff", { roughness: 0.85 });
      I.add(trunk, tm, x, y + 1.2 * s, z, 0, r, 0, s);
      const greens = world.key === "ocean" ? ["#3fbf55", "#4fd067"] : ["#3cae3a", "#48bf43", "#2f9d35"];
      I.add(leaf, lm, x, y + 3.2 * s, z, 0, r, 0, 1.55 * s, 1.35 * s, 1.55 * s, greens[0]);
      I.add(leaf, lm, x + 0.5 * s, y + 3.9 * s, z + 0.2 * s, 0, r, 0, 1.0 * s, 0.9 * s, 1.0 * s, greens[1]);
      I.add(leaf, lm, x - 0.55 * s, y + 3.7 * s, z - 0.3 * s, 0, r, 0, 0.95 * s, 0.85 * s, 0.95 * s, greens[2] || greens[0]);
      break;
    }
    case "bush": {
      const leaf = G.get("leaf", () => new THREE.SphereGeometry(1, 18, 14));
      const lm = bank.color("#ffffff", { roughness: 0.85 });
      const c = world.key === "snow" ? "#e8f0fa" : world.key === "desert" ? "#8aa34a" : "#2f9d35";
      I.add(leaf, lm, x, y + 0.35 * s, z, 0, 0, 0, 0.75 * s, 0.6 * s, 0.75 * s, c);
      I.add(leaf, lm, x + 0.55 * s, y + 0.28 * s, z + 0.1 * s, 0, 0, 0, 0.55 * s, 0.45 * s, 0.55 * s, c);
      I.add(leaf, lm, x - 0.5 * s, y + 0.25 * s, z - 0.15 * s, 0, 0, 0, 0.5 * s, 0.42 * s, 0.5 * s, c);
      break;
    }
    case "flowers": {
      const stem = G.get("stem", () => new THREE.CylinderGeometry(0.025, 0.025, 0.4, 5));
      const head = G.get("petal", () => new THREE.SphereGeometry(0.12, 8, 6));
      const ctr = G.get("ctr", () => new THREE.SphereGeometry(0.06, 6, 5));
      const sm = bank.color("#3a9a2e");
      const pm = bank.color("#ffffff", { roughness: 0.7 });
      const cm = bank.color("#ffd23a", { emissive: "#5a4000", roughness: 0.6 });
      const cols = world.key === "snow" ? ["#9ad4ff", "#ffffff"] : world.key === "desert" ? ["#ff7a59", "#ffd23a"] : ["#ffffff", "#ff5a7a", "#ffd23a", "#ff9ad5", "#7ac8ff"];
      const n = 5 + Math.floor(rnd(1) * 4);
      for (let i = 0; i < n; i++) {
        const a = rnd(i + 2) * Math.PI * 2;
        const rr = rnd(i + 9) * 1.3;
        const fx = x + Math.cos(a) * rr;
        const fz = z + Math.sin(a) * rr;
        const fy = ctx.ground(fx, fz, y);
        I.add(stem, sm, fx, fy + 0.2, fz, 0, 0, 0, 1, 1, 1, null, false);
        I.add(head, pm, fx, fy + 0.42, fz, 0, 0, 0, 1, 0.55, 1, cols[Math.floor(rnd(i + 20) * cols.length)], false);
        I.add(ctr, cm, fx, fy + 0.47, fz, 0, 0, 0, 1, 1, 1, null, false);
      }
      break;
    }
    case "rock": {
      const g = G.get("rock", () => new THREE.DodecahedronGeometry(1, 0));
      I.add(g, bank.color("#ffffff", { roughness: 0.95, flatShading: true }), x, y + 0.3 * s, z, rnd(3), r, rnd(4), 1.0 * s, 0.7 * s, 0.9 * s, world.rock);
      break;
    }
    case "fence": {
      const post = G.get("fPost", () => new THREE.BoxGeometry(0.14, 0.9, 0.14));
      const rail = G.get("fRail", () => new THREE.BoxGeometry(2.6, 0.1, 0.08));
      const m = bank.color("#c08a4a", { roughness: 0.85 });
      const c = Math.cos(r);
      const sn = Math.sin(r);
      for (const k of [-1.2, 0, 1.2]) I.add(post, m, x + c * k, y + 0.45, z - sn * k, 0, r, 0, 1);
      I.add(rail, m, x, y + 0.65, z, 0, r, 0, 1);
      I.add(rail, m, x, y + 0.35, z, 0, r, 0, 1);
      break;
    }
    case "castle":
      addCastle(I, o, ctx);
      break;
    case "palm": {
      const seg = G.get("palmSeg", () => new THREE.CylinderGeometry(0.2, 0.26, 1, 8));
      const tm = bank.color("#b98a52", { roughness: 0.9 });
      for (let i = 0; i < 6; i++) I.add(seg, tm, x + i * i * 0.025 * s, y + (0.5 + i) * s, z, 0, 0, -i * 0.04, s);
      const frond = G.get("frond", () => {
        const geo = new THREE.SphereGeometry(1, 10, 6);
        geo.scale(1.6, 0.12, 0.45);
        geo.translate(1.3, 0, 0);
        return geo;
      });
      const fm = bank.color("#3fbf55", { roughness: 0.8 });
      const tx = x + 0.9 * s;
      for (let i = 0; i < 7; i++) I.add(frond, fm, tx, y + 6 * s, z, 0, (i / 7) * Math.PI * 2 + r, -0.35, s);
      const nut = G.get("nut", () => new THREE.SphereGeometry(0.2, 8, 6));
      I.add(nut, bank.color("#6a4422"), tx + 0.2, y + 5.8 * s, z, 0, 0, 0, s);
      I.add(nut, bank.color("#6a4422"), tx - 0.15, y + 5.75 * s, z + 0.15, 0, 0, 0, s);
      break;
    }
    case "cactus": {
      const body = G.get("cactus", () => new THREE.CapsuleGeometry(0.4, 2, 6, 12));
      const arm = G.get("cactusArm", () => new THREE.CapsuleGeometry(0.25, 0.8, 4, 10));
      const m = bank.color("#4f9a42", { roughness: 0.75 });
      I.add(body, m, x, y + 1.4 * s, z, 0, r, 0, s);
      I.add(arm, m, x + 0.55 * s * Math.cos(r), y + 1.6 * s, z - 0.55 * s * Math.sin(r), 0, r, 0, s);
      I.add(arm, m, x - 0.5 * s * Math.cos(r), y + 1.2 * s, z + 0.5 * s * Math.sin(r), 0, r, 0, s * 0.8);
      const fl = G.get("cactusFlower", () => new THREE.SphereGeometry(0.16, 8, 6));
      I.add(fl, bank.color("#ff5a7a", { emissive: "#4a0010" }), x, y + 2.75 * s, z, 0, 0, 0, s);
      break;
    }
    case "pine": {
      const trunk = G.get("trunk", () => new THREE.CylinderGeometry(0.28, 0.4, 2.4, 10));
      const cone = G.get("pineCone", () => new THREE.ConeGeometry(1.5, 2.4, 10));
      const tm = bank.color("#6e4a2a", { roughness: 0.9 });
      I.add(trunk, tm, x, y + 0.9 * s, z, 0, 0, 0, s * 0.8);
      const gm = bank.color("#2f7a4f", { roughness: 0.85 });
      const sm = bank.color("#f4f8ff", { roughness: 0.9 });
      for (let i = 0; i < 3; i++) {
        const k = 1 - i * 0.25;
        I.add(cone, gm, x, y + (2.3 + i * 1.3) * s, z, 0, r, 0, k * s, s, k * s);
        I.add(cone, sm, x, y + (2.75 + i * 1.3) * s, z, 0, r, 0, k * s * 0.6, s * 0.45, k * s * 0.6);
      }
      break;
    }
    case "snowman": {
      const b = G.get("leaf", () => new THREE.SphereGeometry(1, 18, 14));
      const wm = bank.color("#ffffff", { roughness: 0.9 });
      I.add(b, wm, x, y + 0.7 * s, z, 0, 0, 0, 0.75 * s);
      I.add(b, wm, x, y + 1.65 * s, z, 0, 0, 0, 0.5 * s);
      I.add(b, wm, x, y + 2.3 * s, z, 0, 0, 0, 0.36 * s);
      const nose = G.get("snNose", () => new THREE.ConeGeometry(0.07, 0.35, 8));
      I.add(nose, bank.color("#ff8a1f"), x + Math.sin(r) * 0.42 * s, y + 2.3 * s, z + Math.cos(r) * 0.42 * s, Math.PI / 2, r, 0, s);
      const hat = G.get("snHat", () => new THREE.CylinderGeometry(0.25, 0.25, 0.4, 14));
      I.add(hat, bank.color("#e3262b"), x, y + 2.75 * s, z, 0, 0, 0, s);
      break;
    }
    case "crystal": {
      const g = G.get("crystal", () => new THREE.OctahedronGeometry(1, 0));
      const m = bank.color("#9fe3ff", { roughness: 0.1, metalness: 0.1, emissive: "#3aa8e8", emissiveIntensity: 0.4, flatShading: true, transparent: true, opacity: 0.85 });
      I.add(g, m, x, y + 1.1 * s, z, 0, r, 0.2, 0.45 * s, 1.3 * s, 0.45 * s);
      I.add(g, m, x + 0.45 * s, y + 0.6 * s, z + 0.2 * s, 0, r, -0.5, 0.3 * s, 0.8 * s, 0.3 * s);
      break;
    }
    case "deadTree": {
      const tr = G.get("dtTrunk", () => new THREE.CylinderGeometry(0.15, 0.35, 3.8, 7));
      const br = G.get("dtBranch", () => new THREE.CylinderGeometry(0.06, 0.12, 1.4, 6));
      const m = bank.color("#2a2122", { roughness: 1 });
      I.add(tr, m, x, y + 1.9 * s, z, 0, r, 0.05, s);
      I.add(br, m, x + 0.4 * s, y + 2.8 * s, z, 0, r, -0.9, s);
      I.add(br, m, x - 0.35 * s, y + 2.3 * s, z + 0.1, 0, r, 0.9, s);
      break;
    }
    case "column": {
      const c = G.get("colShaft", () => cylGeo(0.6, 5, 16, 2));
      const cap = G.get("colCap", () => boxGeo(1.6, 0.4, 1.6, 1.6));
      const m = bank.tex("sandstone");
      I.add(c, m, x, y + 2.5 * s, z, 0, r, 0, s);
      I.add(cap, m, x, y + 5.2 * s, z, 0, r, 0, s);
      I.add(cap, m, x, y + 0.2 * s, z, 0, r, 0, s);
      break;
    }
    case "pyramid": {
      const g = G.get("pyramid", () => new THREE.ConeGeometry(1, 1, 4));
      I.add(g, bank.tex("sandstone"), x, y + 4 * s, z, 0, Math.PI / 4 + r, 0, 7 * s, 8 * s, 7 * s);
      break;
    }
    case "shell": {
      const g = G.get("shell", () => new THREE.ConeGeometry(0.3, 0.4, 7));
      I.add(g, bank.color("#ffd1c4", { roughness: 0.5 }), x, y + 0.15, z, Math.PI / 2, r, 0, s);
      break;
    }
    case "mushroom": {
      const st = G.get("mushStem", () => new THREE.CylinderGeometry(0.35, 0.45, 2, 12));
      const cap = G.get("mushCap", () => new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2));
      I.add(st, bank.color("#fff3dc"), x, y + 1 * s, z, 0, 0, 0, s);
      I.add(cap, bank.color("#e3262b", { roughness: 0.5 }), x, y + 1.9 * s, z, 0, 0, 0, 1.2 * s, 0.8 * s, 1.2 * s);
      break;
    }
    case "lavaRock": {
      const g = G.get("rock", () => new THREE.DodecahedronGeometry(1, 0));
      I.add(g, bank.color("#ffffff", { roughness: 0.95, flatShading: true }), x, y + 0.4 * s, z, rnd(3), r, rnd(4), 1.2 * s, 1 * s, 1.1 * s, "#3a2c2d");
      break;
    }
    case "torch": {
      const p = G.get("torchPost", () => new THREE.CylinderGeometry(0.1, 0.12, 1.6, 8));
      const f = G.get("torchFire", () => new THREE.ConeGeometry(0.2, 0.5, 8));
      I.add(p, bank.color("#3a2a1a"), x, y + 0.8, z, 0, 0, 0, s);
      I.add(f, bank.color("#ffb02e", { emissive: "#ff6a00", emissiveIntensity: 1.5 }), x, y + 1.8, z, 0, 0, 0, s, s, s, null, false);
      break;
    }
    default:
  }
}

/** a small storybook castle (goal backdrop) */
function addCastle(I, o, ctx) {
  const { bank, G } = ctx;
  const { x, y, z } = o;
  const s = o.s || 1;
  const r = o.rot || 0;
  const c = Math.cos(r);
  const sn = Math.sin(r);
  const at = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  const lava = ctx.world.key === "lava";
  const wallM = lava ? bank.tex("castle") : bank.tex("stone", { color: "#e9e2d8" });
  const roofM = bank.color(lava ? "#5a1a1a" : "#e3262b", { roughness: 0.6 });
  const box = G.get("cBox", () => boxGeo(1, 1, 1, 1));
  const tower = G.get("cTower", () => cylGeo(1, 1, 18, 2));
  const cone = G.get("cCone", () => new THREE.ConeGeometry(1, 1, 18));
  const door = G.get("cDoor", () => new THREE.CylinderGeometry(1, 1, 1, 18, 1, false, 0, Math.PI));
  let [px, pz] = at(0, 0);
  I.add(box, wallM, px, y + 2 * s, pz, 0, r, 0, 7 * s, 4 * s, 4 * s);
  [px, pz] = at(0, 0);
  I.add(box, wallM, px, y + 5 * s, pz, 0, r, 0, 3.6 * s, 2.4 * s, 3 * s);
  [px, pz] = at(0, 0);
  I.add(cone, roofM, px, y + 7.2 * s, pz, 0, r + Math.PI / 4, 0, 2.6 * s, 2 * s, 2.6 * s);
  for (const sx of [-1, 1]) {
    [px, pz] = at(3.6 * sx * s, 0);
    I.add(tower, wallM, px, y + 3 * s, pz, 0, r, 0, 1.2 * s, 6 * s, 1.2 * s);
    I.add(cone, roofM, px, y + 7 * s, pz, 0, r, 0, 1.5 * s, 2 * s, 1.5 * s);
  }
  // battlements
  for (let i = -3; i <= 3; i += 1.5) {
    [px, pz] = at(i * s, -2 * s);
    I.add(box, wallM, px, y + 4.35 * s, pz, 0, r, 0, 0.7 * s, 0.7 * s, 0.5 * s);
  }
  [px, pz] = at(0, -2.02 * s);
  I.add(door, bank.color("#2a1a12"), px, y + 0.9 * s, pz, Math.PI / 2, r + Math.PI / 2, 0, 1 * s, 0.1 * s, 1.6 * s);
}

/* ------------------------------------------------------------------ waterfall (animated) */
export function makeWaterfall(d, ctx) {
  const { bank, G } = ctx;
  const w = d.w ?? 4;
  const h = d.h ?? 8;
  const t = tex("water").clone();
  t.needsUpdate = true;
  t.repeat.set(w / 3, h / 3);
  const m = bank.own(new THREE.MeshStandardMaterial({ color: "#bfefff", map: t, transparent: true, opacity: 0.82, roughness: 0.15, emissive: "#3a8ab8", emissiveIntensity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
  const g = new THREE.Group();
  const sheet = new THREE.Mesh(G.get(`wf:${w}:${h}`, () => new THREE.PlaneGeometry(w, h, 1, 1)), m);
  sheet.position.y = h / 2;
  g.add(sheet);
  const foam = new THREE.Mesh(G.get(`wfFoam:${w}`, () => new THREE.CylinderGeometry(w * 0.55, w * 0.7, 0.5, 18)), bank.color("#ffffff", { transparent: true, opacity: 0.7, roughness: 1 }));
  foam.position.y = 0.2;
  g.add(foam);
  g.position.set(d.x, d.y, d.z);
  g.rotation.y = d.rot || 0;
  g.userData = { tex: t, d: { ...d, w } };
  t.userData = { owned: true };
  ctx.bank.own({ dispose: () => t.dispose() });
  return g;
}
