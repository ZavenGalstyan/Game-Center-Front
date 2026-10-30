/**
 * Low-poly models for everything except the hero: enemies, the boss, caged
 * friends, pickups, level props and hazards. All geometry / materials go
 * through a Kit so a level's whole scene can be disposed in one call.
 */
import * as THREE from "three";

export function createKit() {
  const geos = new Set();
  const mats = new Map();
  const kit = {
    geo(g) {
      geos.add(g);
      return g;
    },
    /** shared Lambert material per colour/options */
    mat(color, o = {}) {
      const key = `${color}|${JSON.stringify(o)}`;
      if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, ...o }));
      return mats.get(key);
    },
    basic(color, o = {}) {
      const key = `b${color}|${JSON.stringify(o)}`;
      if (!mats.has(key)) mats.set(key, new THREE.MeshBasicMaterial({ color, ...o }));
      return mats.get(key);
    },
    own(m) {
      mats.set(`own${mats.size}`, m);
      return m;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats.values()) {
        m.map?.dispose?.();
        m.dispose();
      }
      geos.clear();
      mats.clear();
    },
  };
  kit.sphere = kit.geo(new THREE.SphereGeometry(1, 14, 10));
  kit.sphereLo = kit.geo(new THREE.SphereGeometry(1, 8, 6));
  kit.box = kit.geo(new THREE.BoxGeometry(1, 1, 1));
  kit.cone = kit.geo(new THREE.ConeGeometry(1, 1, 8));
  kit.cyl = kit.geo(new THREE.CylinderGeometry(1, 1, 1, 12));
  return kit;
}

const mesh = (g, m, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  return o;
};

/** angry little eyes (white + pupil + slanted brow) on a group */
function eyes(K, parent, x, y, z, r = 0.09, angry = true) {
  const out = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(sx * x, y, z);
    e.add(mesh(K.sphere, K.mat(0xffffff, { emissive: 0x333333 }), 0, 0, 0, r, r * 1.1, r * 0.6));
    e.add(mesh(K.sphereLo, K.mat(0x111111), sx * -r * 0.15, -r * 0.1, r * 0.45, r * 0.5));
    if (angry) {
      const b = mesh(K.box, K.mat(0x221111), 0, r * 1.05, r * 0.3, r * 2.1, r * 0.4, r * 0.4);
      b.rotation.z = sx * 0.45;
      e.add(b);
    }
    parent.add(e);
    out.push(e);
  }
  return out;
}

/* ================================================================ enemies */
const ENEMY_COLORS = {
  valley: { a: 0x7a4fd0, b: 0xb48cff, c: 0x4cbf4c },
  desert: { a: 0xd2691e, b: 0xf4a460, c: 0x8b4513 },
  snow: { a: 0x3d7fd6, b: 0xbfe3ff, c: 0xffffff },
  cave: { a: 0x18a999, b: 0x7af0e0, c: 0xb15cff },
  castle: { a: 0x8b1e2d, b: 0x3a3a46, c: 0xffb000 },
};

/** Grumblebug — a round shelled beetle that patrols back and forth */
export function makePatrol(K, theme, tough) {
  const C = ENEMY_COLORS[theme] || ENEMY_COLORS.valley;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(mesh(K.sphere, K.mat(C.a), 0, 0.42, 0, 0.5, 0.38, 0.55)); // shell
  body.add(mesh(K.sphere, K.mat(C.b), 0, 0.3, 0.02, 0.44, 0.24, 0.5)); // underside
  // shell spots
  for (const [x, z] of [
    [0.2, -0.1],
    [-0.22, 0.05],
    [0.05, -0.32],
  ])
    body.add(mesh(K.sphereLo, K.mat(C.c), x, 0.72, z, 0.09, 0.04, 0.09));
  const head = new THREE.Group();
  head.position.set(0, 0.42, 0.45);
  body.add(head);
  head.add(mesh(K.sphere, K.mat(C.b), 0, 0, 0, 0.26, 0.22, 0.2));
  const E = eyes(K, head, 0.1, 0.06, 0.16, 0.07);
  for (const sx of [-1, 1]) {
    const ant = mesh(K.cyl, K.mat(0x222222), sx * 0.08, 0.25, 0, 0.015, 0.25, 0.015);
    ant.rotation.z = sx * -0.4;
    head.add(ant);
    head.add(mesh(K.sphereLo, K.mat(C.c), sx * 0.15, 0.37, 0, 0.05));
  }
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const sx = i % 2 ? 1 : -1;
    const l = mesh(K.cyl, K.mat(0x2a2a2a), sx * 0.42, 0.14, -0.25 + Math.floor(i / 2) * 0.25, 0.035, 0.28, 0.035);
    l.rotation.z = sx * 0.6;
    body.add(l);
    legs.push(l);
  }
  if (tough) {
    for (let i = 0; i < 4; i++) {
      const sp = mesh(K.cone, K.mat(0xd9d9e0), -0.24 + i * 0.16, 0.85, -0.05, 0.07, 0.22, 0.07);
      body.add(sp);
    }
    body.add(mesh(K.sphere, K.mat(0x55555f), 0, 0.5, 0, 0.53, 0.32, 0.57)); // armour band
  }
  return {
    root,
    update(e, t) {
      const walk = e.state === "walk";
      body.position.y = walk ? Math.abs(Math.sin(t * 12)) * 0.05 : 0;
      for (let i = 0; i < legs.length; i++) legs[i].rotation.x = walk ? Math.sin(t * 14 + i * 1.7) * 0.5 : 0;
      head.rotation.y = e.state === "idle" ? Math.sin(t * 3) * 0.4 : 0;
      for (const ey of E) ey.scale.y = e.hitT > 0 ? 0.3 : 1;
    },
  };
}

/** Thornling — a spiky hopping imp that chases the bear */
export function makeChaser(K, theme, tough) {
  const C = ENEMY_COLORS[theme] || ENEMY_COLORS.valley;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(mesh(K.sphere, K.mat(C.c === 0xffffff ? 0x9fb7d9 : C.c), 0, 0.55, 0, 0.42, 0.46, 0.42));
  body.add(mesh(K.sphere, K.mat(C.b), 0, 0.5, 0.2, 0.3, 0.3, 0.25));
  // back spikes
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45;
    const sp = mesh(K.cone, K.mat(C.a), Math.sin(a) * 0.32, 0.72 + Math.cos(a) * 0.08, -0.25, 0.08, 0.3, 0.08);
    sp.rotation.x = -0.9;
    sp.rotation.z = -a * 0.6;
    body.add(sp);
  }
  // horns
  for (const sx of [-1, 1]) {
    const h = mesh(K.cone, K.mat(0xfff1d6), sx * 0.2, 0.98, 0.05, 0.06, 0.2, 0.06);
    h.rotation.z = sx * -0.4;
    body.add(h);
  }
  const E = eyes(K, body, 0.14, 0.66, 0.36, 0.1);
  const mouth = mesh(K.box, K.mat(0x220000), 0, 0.42, 0.4, 0.2, 0.05, 0.05);
  body.add(mouth);
  for (const sx of [-1, 1]) {
    const tooth = mesh(K.cone, K.mat(0xffffff), sx * 0.06, 0.4, 0.42, 0.025, -0.07, 0.025);
    body.add(tooth);
  }
  const feet = [];
  for (const sx of [-1, 1]) {
    const f = mesh(K.sphere, K.mat(C.a), sx * 0.18, 0.08, 0.05, 0.13, 0.08, 0.17);
    root.add(f);
    feet.push(f);
  }
  if (tough) {
    body.add(mesh(K.cyl, K.mat(0x55555f), 0, 1.0, 0, 0.3, 0.12, 0.3)); // iron helmet rim
    body.add(mesh(K.sphere, K.mat(0x77778a), 0, 1.02, 0, 0.3, 0.18, 0.3));
  }
  // "!" alert marker
  const alert = new THREE.Group();
  alert.add(mesh(K.box, K.basic(0xffe14d), 0, 0.18, 0, 0.09, 0.28, 0.09));
  alert.add(mesh(K.box, K.basic(0xffe14d), 0, -0.05, 0, 0.09, 0.09, 0.09));
  alert.position.y = 1.55;
  root.add(alert);
  return {
    root,
    update(e, t) {
      const chase = e.state === "chase" && e.pause <= 0;
      const hop = chase ? Math.abs(Math.sin(t * 13)) : Math.abs(Math.sin(t * 3)) * 0.2;
      body.position.y = hop * 0.18;
      body.rotation.x = chase ? 0.2 : 0;
      feet[0].position.z = 0.05 + (chase ? Math.sin(t * 13) * 0.15 : 0);
      feet[1].position.z = 0.05 - (chase ? Math.sin(t * 13) * 0.15 : 0);
      alert.visible = e.state === "chase" && e.pause > 0;
      alert.rotation.y = t * 4;
      for (const ey of E) ey.scale.y = e.hitT > 0 ? 0.3 : 1;
      mouth.scale.y = chase ? 0.09 : 0.05;
    },
  };
}

/* ================================================================ boss */
/** Baron Bristlesnout — a crowned warthog tyrant in purple and gold */
export function makeBoss(K) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hide = K.mat(0x6b4a6e);
  const hideDark = K.mat(0x4a3150);
  body.add(mesh(K.sphere, hide, 0, 1.45, 0, 1.25, 1.15, 1.35));
  body.add(mesh(K.sphere, K.mat(0xd9b24c), 0, 1.3, 0.55, 0.95, 0.85, 0.85)); // gold breastplate
  body.add(mesh(K.sphere, K.mat(0xb88e2c), 0, 1.3, 0.62, 0.55, 0.5, 0.75));
  // mane bristles
  for (let i = 0; i < 7; i++) {
    const sp = mesh(K.cone, hideDark, 0, 2.45 - i * 0.05, -0.2 - i * 0.22, 0.14, 0.55, 0.14);
    sp.rotation.x = -0.5 - i * 0.12;
    body.add(sp);
  }
  // cape
  const cape = mesh(K.box, K.mat(0xc0283c), 0, 1.5, -1.15, 1.6, 1.9, 0.08);
  cape.rotation.x = 0.15;
  body.add(cape);
  const head = new THREE.Group();
  head.position.set(0, 2.2, 0.95);
  body.add(head);
  head.add(mesh(K.sphere, hide, 0, 0, 0, 0.75, 0.68, 0.7));
  const snout = mesh(K.cyl, K.mat(0x8a6390), 0, -0.15, 0.7, 0.36, 0.5, 0.3);
  snout.rotation.x = Math.PI / 2;
  head.add(snout);
  head.add(mesh(K.cyl, K.mat(0xf09bb0), 0, -0.15, 0.96, 0.33, 0.04, 0.27).rotateX(Math.PI / 2)); // nose disc
  for (const sx of [-1, 1]) {
    head.add(mesh(K.sphereLo, K.mat(0x3a1f2a), sx * 0.12, -0.15, 0.99, 0.07, 0.09, 0.03));
    const tusk = mesh(K.cone, K.mat(0xfff6e0), sx * 0.38, -0.2, 0.75, 0.09, 0.55, 0.09);
    tusk.rotation.z = sx * -0.5;
    tusk.rotation.x = 0.3;
    head.add(tusk);
    const ear = mesh(K.cone, hideDark, sx * 0.55, 0.5, -0.05, 0.22, 0.5, 0.1);
    ear.rotation.z = sx * -0.7;
    head.add(ear);
  }
  const E = eyes(K, head, 0.28, 0.2, 0.55, 0.13);
  for (const e of E) e.children[1].material = K.basic(0xff2a2a);
  // crown
  const crown = new THREE.Group();
  crown.position.set(0, 0.65, -0.05);
  head.add(crown);
  crown.add(mesh(K.cyl, K.mat(0xffcc33, { emissive: 0x332200 }), 0, 0, 0, 0.42, 0.25, 0.42));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    crown.add(mesh(K.cone, K.mat(0xffcc33, { emissive: 0x332200 }), Math.sin(a) * 0.36, 0.25, Math.cos(a) * 0.36, 0.08, 0.28, 0.08));
    crown.add(mesh(K.sphereLo, K.mat(i % 2 ? 0xe02050 : 0x30a0ff, { emissive: 0x220011 }), Math.sin(a) * 0.43, 0.02, Math.cos(a) * 0.43, 0.06));
  }
  const legs = [];
  for (const [sx, sz] of [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ]) {
    const l = new THREE.Group();
    l.position.set(sx * 0.75, 0.7, sz * 0.6);
    l.add(mesh(K.cyl, hideDark, 0, -0.35, 0, 0.26, 0.7, 0.26));
    l.add(mesh(K.cyl, K.mat(0x2a1a22), 0, -0.68, 0.05, 0.3, 0.12, 0.34));
    root.add(l);
    legs.push(l);
  }
  // stun stars
  const stars = new THREE.Group();
  stars.position.y = 3.6;
  for (let i = 0; i < 5; i++) {
    const s = mesh(K.sphereLo, K.basic(0xffe14d), Math.cos((i / 5) * 6.28) * 0.9, 0, Math.sin((i / 5) * 6.28) * 0.9, 0.14);
    stars.add(s);
  }
  root.add(stars);
  // telegraph glow (red aura)
  const aura = mesh(K.sphere, K.basic(0xff3030, { transparent: true, opacity: 0.0, depthWrite: false }), 0, 1.5, 0, 1.7, 1.6, 1.8);
  root.add(aura);
  const flashMats = [hide, hideDark];
  return {
    root,
    update(B, t, dt) {
      const st = B.state;
      body.rotation.set(0, 0, 0);
      body.position.set(0, 0, 0);
      head.rotation.set(0, 0, 0);
      root.scale.setScalar(1);
      const tele = st === "chargeTele" || st === "slamTele" || st === "rainTele";
      aura.material.opacity = tele ? 0.18 + 0.12 * Math.sin(t * 20) : 0;
      stars.visible = B.vulnerable;
      stars.rotation.y = t * 4;
      for (const l of legs) l.rotation.x = 0;
      if (st === "sleep") {
        body.rotation.x = 0.15;
        head.rotation.x = 0.35;
        for (const e of E) e.scale.y = 0.15;
      } else for (const e of E) e.scale.y = B.vulnerable ? 0.35 : 1;
      if (st === "chargeTele") {
        body.rotation.x = 0.25;
        legs[0].rotation.x = Math.sin(t * 25) * 0.4; // pawing the ground
      } else if (st === "charge") {
        body.rotation.x = 0.35;
        for (let i = 0; i < 4; i++) legs[i].rotation.x = Math.sin(t * 30 + i * 1.6) * 0.7;
      } else if (st === "slamTele") {
        body.position.y = -0.25;
        body.scale.set(1.08, 0.88, 1.08);
      } else if (st === "slamAir") {
        body.scale.set(0.95, 1.1, 0.95);
        for (const l of legs) l.rotation.x = -0.4;
      } else if (st === "rainTele" || st === "rain") {
        head.rotation.x = -0.5;
        body.rotation.x = -0.15 + Math.sin(t * 12) * 0.05;
      } else if (B.vulnerable) {
        body.rotation.z = Math.sin(t * 3) * 0.12;
        head.rotation.y = Math.sin(t * 5) * 0.3;
      } else if (st === "intro") {
        head.rotation.x = -0.4 + Math.sin(t * 18) * 0.06; // roar
      } else if (st === "recover") {
        for (let i = 0; i < 4; i++) legs[i].rotation.x = Math.sin(t * 12 + i * 1.6) * 0.4;
      }
      if (st !== "slamTele") body.scale.set(1, 1, 1);
      if (st === "defeat" || st === "gone") {
        const k = Math.min(1, B.deadT / 2.2);
        root.rotation.z = 0;
        body.rotation.y = k * 12;
        root.scale.setScalar(Math.max(0.001, 1 - k));
      }
      const f = B.flash > 0 ? 1 : 0;
      for (const m of flashMats) m.emissive.setRGB(f * 0.45, f * 0.12, f * 0.05);
      void dt;
    },
  };
}

/* ================================================================ friends */
const FRIENDS = {
  bunny: { c: 0xf4efe8, c2: 0xffb6c8, ears: "long" },
  fox: { c: 0xf07a2a, c2: 0xffffff, ears: "pointy", tail: true },
  hedgehog: { c: 0xc89a6a, c2: 0x6b4a32, ears: "round", spikes: true },
  chick: { c: 0xffdc3a, c2: 0xff8a1e, ears: "none", beak: true },
  penguin: { c: 0x2a3140, c2: 0xffffff, ears: "none", beak: true },
  owl: { c: 0x9a6b42, c2: 0xf3d9a5, ears: "tuft", beak: true, bigEyes: true },
  piglet: { c: 0xffb3c6, c2: 0xff8fae, ears: "pointy", snout: true },
  mouse: { c: 0xa9a9b8, c2: 0xffc0cb, ears: "big" },
  cat: { c: 0xf2a65a, c2: 0xffffff, ears: "pointy", tail: true },
  queen: { c: 0xd8a35a, c2: 0xf6dfb5, ears: "round", crown: true },
};

export function makeFriend(K, kind) {
  const F = FRIENDS[kind] || FRIENDS.bunny;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const s = kind === "queen" ? 1.25 : 1;
  body.scale.setScalar(s);
  const fur = K.mat(F.c), fur2 = K.mat(F.c2);
  body.add(mesh(K.sphere, fur, 0, 0.32, 0, 0.26, 0.28, 0.24));
  body.add(mesh(K.sphere, fur2, 0, 0.3, 0.13, 0.17, 0.19, 0.13));
  body.add(mesh(K.sphere, fur, 0, 0.72, 0.02, 0.24, 0.22, 0.22));
  eyes(K, body, 0.09, 0.76, 0.18, F.bigEyes ? 0.075 : 0.05, false);
  if (F.beak) {
    const bk = mesh(K.cone, K.mat(0xff9a1e), 0, 0.68, 0.24, 0.05, 0.12, 0.05);
    bk.rotation.x = Math.PI / 2;
    body.add(bk);
  } else if (F.snout) body.add(mesh(K.cyl, fur2, 0, 0.67, 0.22, 0.08, 0.06, 0.06).rotateX(Math.PI / 2));
  else body.add(mesh(K.sphereLo, K.mat(0x332222), 0, 0.69, 0.22, 0.035));
  for (const sx of [-1, 1]) {
    if (F.ears === "long") {
      const e = mesh(K.sphere, fur, sx * 0.09, 1.02, -0.02, 0.06, 0.2, 0.04);
      e.rotation.z = sx * -0.15;
      body.add(e);
    } else if (F.ears === "pointy" || F.ears === "tuft") {
      const e = mesh(K.cone, fur, sx * 0.13, 0.94, 0, 0.07, F.ears === "tuft" ? 0.14 : 0.16, 0.05);
      e.rotation.z = sx * -0.3;
      body.add(e);
    } else if (F.ears === "round" || F.ears === "big") {
      const r = F.ears === "big" ? 0.11 : 0.07;
      body.add(mesh(K.sphere, fur, sx * 0.17, 0.9, -0.02, r, r, r * 0.5));
    }
    body.add(mesh(K.sphere, fur, sx * 0.12, 0.06, 0.05, 0.09, 0.06, 0.12)); // feet
  }
  if (F.tail) {
    const tl = mesh(K.sphere, fur, 0, 0.3, -0.3, 0.1, 0.1, 0.22);
    tl.rotation.x = -0.6;
    body.add(tl);
  }
  if (F.spikes)
    for (let i = 0; i < 6; i++) {
      const sp = mesh(K.cone, fur2, Math.sin(i) * 0.15, 0.45 + (i % 3) * 0.12, -0.18, 0.06, 0.18, 0.06);
      sp.rotation.x = -1.2;
      body.add(sp);
    }
  if (F.crown) {
    body.add(mesh(K.cyl, K.mat(0xffd84a, { emissive: 0x442200 }), 0, 0.97, 0, 0.12, 0.1, 0.12));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28;
      body.add(mesh(K.cone, K.mat(0xffd84a, { emissive: 0x442200 }), Math.sin(a) * 0.1, 1.07, Math.cos(a) * 0.1, 0.03, 0.09, 0.03));
    }
  }
  // cage
  const cage = new THREE.Group();
  const bars = K.mat(0x6d6d78);
  cage.add(mesh(K.cyl, K.mat(0x55555f), 0, 0.05, 0, 0.75, 0.1, 0.75));
  cage.add(mesh(K.cyl, K.mat(0x55555f), 0, 1.45, 0, 0.75, 0.1, 0.75));
  cage.add(mesh(K.cone, K.mat(0x55555f), 0, 1.7, 0, 0.6, 0.45, 0.6));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    cage.add(mesh(K.cyl, bars, Math.sin(a) * 0.7, 0.75, Math.cos(a) * 0.7, 0.035, 1.4, 0.035));
  }
  const lock = mesh(K.box, K.mat(0xffc93a, { emissive: 0x332200 }), 0, 0.7, 0.75, 0.2, 0.22, 0.1);
  cage.add(lock);
  root.add(cage);
  return {
    root,
    cage,
    update(f, t) {
      if (!f.freed) {
        body.position.y = 0;
        body.rotation.y = Math.sin(t * 1.5) * 0.4;
        cage.position.y = 0;
        cage.rotation.z = f.hits ? Math.sin(t * 40) * 0.03 : 0;
        cage.visible = true;
      } else {
        const k = f.t;
        // bars fly up and fade; friend hops for joy
        cage.position.y = k * 6;
        cage.rotation.y = k * 4;
        cage.visible = k < 1.2;
        body.position.y = Math.abs(Math.sin(k * 6)) * 0.5;
        body.rotation.y = k * 2;
      }
    },
  };
}

/* ================================================================ props */
export function makeCoinGeometry(K) {
  const g = K.geo(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 16));
  g.rotateX(Math.PI / 2);
  return g;
}

export function makeChest(K) {
  const root = new THREE.Group();
  const wood = K.mat(0x9a5b2a), gold = K.mat(0xffc93a, { emissive: 0x332200 });
  root.add(mesh(K.box, wood, 0, 0.25, 0, 0.8, 0.5, 0.55));
  root.add(mesh(K.box, gold, 0, 0.25, 0, 0.84, 0.08, 0.59));
  const lid = new THREE.Group();
  lid.position.set(0, 0.5, -0.27);
  const lidMesh = mesh(K.cyl, wood, 0, 0, 0.27, 0.28, 0.8, 0.28);
  lidMesh.rotation.z = Math.PI / 2;
  lidMesh.scale.set(0.28, 0.8, 0.28);
  lid.add(lidMesh);
  lid.add(mesh(K.box, gold, 0, 0.0, 0.55, 0.14, 0.18, 0.06));
  root.add(lid);
  const glow = mesh(K.sphere, K.basic(0xfff1a0, { transparent: true, opacity: 0.0, depthWrite: false }), 0, 0.7, 0, 0.6);
  root.add(glow);
  return {
    root,
    update(c, t) {
      lid.rotation.x = c.open ? -Math.min(1.9, c.t * 6) : Math.sin(t * 3) * 0.03;
      glow.material.opacity = c.open ? Math.max(0, 0.6 - c.t * 0.6) : 0.12 + Math.sin(t * 2) * 0.05;
    },
  };
}

export function makeCheckpoint(K) {
  const root = new THREE.Group();
  root.add(mesh(K.cyl, K.mat(0x8a5a32), 0, 0.9, 0, 0.05, 1.8, 0.05));
  root.add(mesh(K.sphereLo, K.mat(0xffd84a), 0, 1.85, 0, 0.09));
  root.add(mesh(K.cyl, K.mat(0x777777), 0, 0.05, 0, 0.35, 0.1, 0.35));
  const flagGeo = K.geo(new THREE.BoxGeometry(0.7, 0.45, 0.03));
  flagGeo.translate(0.37, 0, 0);
  const off = K.mat(0xbfbfbf), on = K.mat(0x3fd16a, { emissive: 0x0a3a14 });
  const flag = new THREE.Mesh(flagGeo, off);
  flag.position.set(0.03, 1.55, 0);
  root.add(flag);
  // paw print emblem
  const paw = mesh(K.sphereLo, K.mat(0xffffff), 0.37, 0, 0.03, 0.08, 0.08, 0.02);
  flag.add(paw);
  return {
    root,
    update(c, t) {
      flag.material = c.on ? on : off;
      flag.rotation.y = Math.sin(t * 4) * 0.25;
      flag.scale.y = c.on ? 1 : 0.8;
    },
  };
}

export function makePortal(K) {
  const root = new THREE.Group();
  const ring = new THREE.Mesh(K.geo(new THREE.TorusGeometry(1.1, 0.16, 10, 32)), K.mat(0xffd84a, { emissive: 0x553300 }));
  ring.position.y = 1.35;
  root.add(ring);
  const inner = new THREE.Mesh(K.geo(new THREE.CircleGeometry(1.0, 32)), K.own(new THREE.MeshBasicMaterial({ color: 0x8be0ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })));
  inner.position.y = 1.35;
  root.add(inner);
  const swirl = new THREE.Mesh(K.geo(new THREE.RingGeometry(0.25, 0.85, 24, 1, 0, Math.PI * 1.2)), K.own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })));
  swirl.position.set(0, 1.35, 0.01);
  root.add(swirl);
  root.add(mesh(K.cyl, K.mat(0x8d8a96), 0, 0.08, 0, 1.4, 0.16, 1.4));
  for (const sx of [-1, 1]) root.add(mesh(K.cyl, K.mat(0x8d8a96), sx * 1.15, 0.6, 0, 0.14, 1.2, 0.14));
  const lock = new THREE.Group();
  lock.add(mesh(K.box, K.mat(0x777788), 0, 0, 0, 0.5, 0.42, 0.12));
  const shackle = new THREE.Mesh(K.geo(new THREE.TorusGeometry(0.16, 0.05, 6, 12, Math.PI)), K.mat(0x777788));
  shackle.position.y = 0.2;
  lock.add(shackle);
  lock.position.set(0, 1.35, 0.15);
  root.add(lock);
  return {
    root,
    update(o, t) {
      inner.material.color.setHex(o.open ? 0x7fd8ff : 0x555566);
      inner.material.opacity = o.open ? 0.75 + Math.sin(t * 3) * 0.1 : 0.55;
      swirl.visible = o.open;
      swirl.rotation.z = -t * 3;
      ring.rotation.z = t * 0.5;
      lock.visible = !o.open;
      root.scale.setScalar(o.open ? 1 + Math.sin(t * 2) * 0.02 : 1);
    },
  };
}

export function makeSpring(K) {
  const root = new THREE.Group();
  root.add(mesh(K.cyl, K.mat(0x888899), 0, 0.08, 0, 0.5, 0.16, 0.5));
  const coil = mesh(K.cyl, K.mat(0xdddddd), 0, 0.22, 0, 0.25, 0.2, 0.25);
  root.add(coil);
  const pad = new THREE.Group();
  pad.add(mesh(K.cyl, K.mat(0xf03c4a), 0, 0, 0, 0.55, 0.12, 0.55));
  pad.add(mesh(K.cyl, K.mat(0xffffff), 0, 0.065, 0, 0.25, 0.01, 0.25));
  pad.position.y = 0.34;
  root.add(pad);
  let boing = 0;
  return {
    root,
    boing() {
      boing = 1;
    },
    update(s, t, dt) {
      boing = Math.max(0, boing - dt * 2.5);
      const k = boing > 0 ? Math.sin(boing * 14) * boing : 0;
      pad.position.y = 0.34 + k * 0.25;
      coil.scale.y = 0.2 + k * 0.25;
      coil.position.y = 0.2 + k * 0.12;
      void t;
    },
  };
}

export function makeHoney(K) {
  const root = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const y = i / 8;
    pts.push(new THREE.Vector2(0.18 + Math.sin(y * Math.PI) * 0.13 - (y > 0.85 ? 0.08 : 0), y * 0.5));
  }
  const jar = new THREE.Mesh(K.geo(new THREE.LatheGeometry(pts, 12)), K.mat(0xffb020, { emissive: 0x442200 }));
  root.add(jar);
  root.add(mesh(K.cyl, K.mat(0xd2702a), 0, 0.52, 0, 0.14, 0.06, 0.14));
  root.add(mesh(K.cyl, K.mat(0xffffff), 0, 0.27, 0.0, 0.3, 0.12, 0.3).translateZ(0));
  root.add(mesh(K.sphereLo, K.mat(0xff4f6a), 0, 0.28, 0.3, 0.07)); // heart
  return { root };
}

/* ================================================================ hazards */
export function makeHazard(K, h, theme) {
  const root = new THREE.Group();
  const metal = K.mat(theme === "cave" ? 0xb59cff : 0xc7c7d2);
  switch (h.type) {
    case "spikes": {
      const w = h.x1 - h.x0, d = h.z1 - h.z0;
      const nx = Math.max(1, Math.round(w / 0.45)), nz = Math.max(1, Math.round(d / 0.45));
      const spikes = new THREE.Group();
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < nz; j++) spikes.add(mesh(K.cone, metal, h.x0 + (i + 0.5) * (w / nx) - (h.x0 + w / 2), 0.22, h.z0 + (j + 0.5) * (d / nz) - (h.z0 + d / 2), 0.17, 0.45, 0.17));
      root.add(mesh(K.box, K.mat(0x5a5a66), 0, 0.02, 0, w, 0.06, d));
      root.add(spikes);
      root.position.set(h.x0 + w / 2, h.y, h.z0 + d / 2);
      return { root, spikes };
    }
    case "bar": {
      root.add(mesh(K.cyl, K.mat(0x6b4a2e), 0, 0.3, 0, 0.18, 0.6, 0.18));
      const arm = new THREE.Group();
      arm.position.y = 0.5;
      const log = mesh(K.cyl, K.mat(theme === "castle" ? 0x777788 : 0x8b5a2b), 0, 0, 0, 0.17, h.len * 2, 0.17);
      log.rotation.z = Math.PI / 2;
      arm.add(log);
      for (const sx of [-1, 1]) arm.add(mesh(K.cyl, K.mat(0xc9a06a), sx * h.len, 0, 0, 0.18, 0.02, 0.18).rotateZ(Math.PI / 2));
      if (theme === "castle") for (let i = -2; i <= 2; i++) if (i) arm.add(mesh(K.cone, metal, (i / 2) * h.len * 0.8, 0.2, 0, 0.06, 0.18, 0.06));
      root.add(arm);
      root.position.set(h.x, h.y, h.z);
      return { root, arm };
    }
    case "saw": {
      const ball = new THREE.Group();
      ball.add(mesh(K.sphere, K.mat(theme === "desert" ? 0xa0703a : 0x55555f), 0, 0, 0, h.r * 0.75));
      for (let i = 0; i < 14; i++) {
        const v = new THREE.Vector3(Math.sin(i * 2.4) * Math.cos(i * 1.3), Math.cos(i * 2.4), Math.sin(i * 2.4) * Math.sin(i * 1.3)).normalize();
        const c = mesh(K.cone, metal, v.x * h.r * 0.7, v.y * h.r * 0.7, v.z * h.r * 0.7, 0.09, 0.32, 0.09);
        c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
        ball.add(c);
      }
      ball.position.y = h.r;
      root.add(ball);
      root.position.set(h.ax, h.y, h.az);
      return { root, ball };
    }
    case "fire": {
      root.add(mesh(K.cyl, K.mat(0x3a3a44), 0, 0.05, 0, 0.55, 0.1, 0.55));
      root.add(mesh(K.cyl, K.mat(0x1a1a20), 0, 0.11, 0, 0.4, 0.02, 0.4));
      const flame = new THREE.Group();
      flame.add(mesh(K.cone, K.basic(0xff5a1e, { transparent: true, opacity: 0.85 }), 0, 1.2, 0, 0.5, 2.4, 0.5));
      flame.add(mesh(K.cone, K.basic(0xffd23a, { transparent: true, opacity: 0.9 }), 0, 0.9, 0, 0.28, 1.6, 0.28));
      root.add(flame);
      const smoke = mesh(K.sphereLo, K.basic(0x555555, { transparent: true, opacity: 0.5, depthWrite: false }), 0, 0.4, 0, 0.3);
      root.add(smoke);
      root.position.set(h.x, h.y, h.z);
      return { root, flame, smoke };
    }
    case "drop": {
      const obj = theme === "snow" ? mesh(K.cone, K.mat(0xbfeaff, { emissive: 0x113344 }), 0, 0, 0, 0.32, -1.1, 0.32) : mesh(K.geo(new THREE.DodecahedronGeometry(0.5)), K.mat(0x7a6a5a), 0, 0, 0, 1);
      const shadow = mesh(K.geo(new THREE.CircleGeometry(1, 20)), K.basic(0x400000, { transparent: true, opacity: 0.4, depthWrite: false }), 0, 0.03, 0, 1);
      shadow.rotation.x = -Math.PI / 2;
      root.add(obj, shadow);
      root.position.set(h.x, h.y, h.z);
      return { root, obj, shadow };
    }
    default:
      return { root };
  }
}

/* ================================================================ decor */
export function makeDecor(K, kind, theme) {
  const g = new THREE.Group();
  switch (kind) {
    case "tree": {
      g.add(mesh(K.cyl, K.mat(0x7a4a26), 0, 0.8, 0, 0.18, 1.6, 0.18));
      g.add(mesh(K.sphere, K.mat(0x4caf50), 0, 2.0, 0, 0.9, 0.8, 0.9));
      g.add(mesh(K.sphere, K.mat(0x66c25a), 0.35, 2.4, 0.1, 0.55));
      break;
    }
    case "pine": {
      g.add(mesh(K.cyl, K.mat(0x6a4426), 0, 0.5, 0, 0.15, 1, 0.15));
      for (let i = 0; i < 3; i++) g.add(mesh(K.cone, K.mat(i === 2 ? 0xf4fbff : 0x2f7d5a), 0, 1.2 + i * 0.7, 0, 0.9 - i * 0.25, 1.1, 0.9 - i * 0.25));
      break;
    }
    case "cactus": {
      const c = K.mat(0x4f9a46);
      g.add(mesh(K.cyl, c, 0, 0.9, 0, 0.22, 1.8, 0.22));
      g.add(mesh(K.cyl, c, 0.35, 1.1, 0, 0.13, 0.7, 0.13));
      g.add(mesh(K.cyl, c, -0.35, 1.3, 0, 0.13, 0.6, 0.13));
      g.add(mesh(K.sphereLo, K.mat(0xff6fa0), 0, 1.85, 0, 0.12));
      break;
    }
    case "crystal": {
      const col = [0xb15cff, 0x5ce0ff, 0xff5ccf][Math.floor(Math.random() * 3)];
      for (let i = 0; i < 3; i++) {
        const c = mesh(K.geo(new THREE.OctahedronGeometry(0.4)), K.mat(col, { emissive: col, emissiveIntensity: 0.45 }), (i - 1) * 0.3, 0.5 + (i % 2) * 0.2, 0, 0.6, 1.6 - i * 0.3, 0.6);
        c.rotation.z = (i - 1) * 0.3;
        g.add(c);
      }
      break;
    }
    case "mushroom": {
      g.add(mesh(K.cyl, K.mat(0xf3e5c8), 0, 0.35, 0, 0.12, 0.7, 0.12));
      g.add(mesh(K.sphere, K.mat(0xe0403a), 0, 0.72, 0, 0.42, 0.22, 0.42));
      g.add(mesh(K.sphereLo, K.mat(0xffffff), 0.15, 0.88, 0.1, 0.07));
      break;
    }
    case "torch": {
      g.add(mesh(K.cyl, K.mat(0x4a3a2a), 0, 0.7, 0, 0.07, 1.4, 0.07));
      g.add(mesh(K.cone, K.basic(0xffa12a), 0, 1.6, 0, 0.16, 0.4, 0.16));
      g.add(mesh(K.cone, K.basic(0xffe680), 0, 1.55, 0, 0.08, 0.25, 0.08));
      break;
    }
    case "flower": {
      const col = [0xff6fa0, 0xffd84a, 0x8be0ff, 0xffffff][Math.floor(Math.random() * 4)];
      g.add(mesh(K.cyl, K.mat(0x3f9a3a), 0, 0.15, 0, 0.02, 0.3, 0.02));
      g.add(mesh(K.sphereLo, K.mat(col), 0, 0.32, 0, 0.1, 0.05, 0.1));
      g.add(mesh(K.sphereLo, K.mat(0xffd84a), 0, 0.34, 0, 0.04));
      break;
    }
    case "tower": {
      const stone = K.mat(0x4a4452);
      g.add(mesh(K.cyl, stone, 0, 2.5, 0, 0.9, 5, 0.9));
      g.add(mesh(K.cone, K.mat(0x5a2030), 0, 5.6, 0, 1.15, 1.3, 1.15));
      g.add(mesh(K.box, K.basic(0xffc060), 0, 3.6, 0.9, 0.25, 0.4, 0.05));
      break;
    }
    case "rock":
    default:
      g.add(mesh(K.geo(new THREE.DodecahedronGeometry(0.5)), K.mat(theme === "desert" ? 0xc28a4e : theme === "snow" ? 0x8e9aa8 : 0x7d7a86), 0, 0.25, 0, 1, 0.7, 1));
  }
  return g;
}
