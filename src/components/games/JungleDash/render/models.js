/**
 * Low-poly models built from primitives: enemies (Snapclaw crab, Thornback,
 * Spitpod plant), Mossjaw the boss, checkpoint totems, the finish portal
 * and per-theme scenery props. Each `make*` returns { group, update(...) }.
 */
import * as THREE from "three";
import { toon } from "./mascot.js";
import { swirlTex } from "./textures.js";

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const flat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
};
const GEO = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  lowSphere: new THREE.IcosahedronGeometry(1, 0),
  ico1: new THREE.IcosahedronGeometry(1, 1),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cone4: new THREE.ConeGeometry(1, 1, 5),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  dodec: new THREE.DodecahedronGeometry(1, 0),
};
// shared by every model and kept for the app lifetime (the level teardown skips them)
for (const g of Object.values(GEO)) g.userData.keep = true;

/* ----------------------------------------------------------------- enemies */
export function makeCrab() {
  const g = new THREE.Group();
  const shell = toon("#e2483a");
  const belly = toon("#ffb08a");
  const legM = toon("#b0302a");
  const body = new THREE.Group();
  g.add(body);
  const top = mesh(GEO.sphere, shell, 0, 0.36, 0);
  top.scale.set(0.5, 0.3, 0.42);
  body.add(top);
  const under = mesh(GEO.sphere, belly, 0, 0.3, 0.02);
  under.scale.set(0.44, 0.2, 0.38);
  body.add(under);
  // spots
  for (const [x, z] of [[-0.2, -0.1], [0.18, -0.15], [0, -0.28]]) {
    const s = mesh(GEO.sphere, toon("#ff8a4a"), x, 0.6, z);
    s.scale.set(0.07, 0.03, 0.07);
    body.add(s);
  }
  const eyes = [-1, 1].map((s) => {
    const st = mesh(GEO.cyl, legM, 0.13 * s, 0.68, 0.2);
    st.scale.set(0.03, 0.2, 0.03);
    body.add(st);
    const e = mesh(GEO.sphere, new THREE.MeshBasicMaterial({ color: "#fff" }), 0.13 * s, 0.8, 0.22);
    e.scale.setScalar(0.08);
    body.add(e);
    const pu = mesh(GEO.sphere, new THREE.MeshBasicMaterial({ color: "#111" }), 0.13 * s, 0.8, 0.29);
    pu.scale.setScalar(0.04);
    body.add(pu);
    return e;
  });
  const claws = [-1, 1].map((s) => {
    const arm = new THREE.Group();
    arm.position.set(0.42 * s, 0.35, 0.25);
    body.add(arm);
    const up = mesh(GEO.sphere, shell, 0.08 * s, 0, 0.1);
    up.scale.set(0.16, 0.12, 0.2);
    arm.add(up);
    const pinA = mesh(GEO.cone, shell, 0.1 * s, 0.05, 0.3);
    pinA.scale.set(0.07, 0.22, 0.07);
    pinA.rotation.x = Math.PI / 2;
    arm.add(pinA);
    const pinB = mesh(GEO.cone, shell, 0.1 * s, -0.05, 0.28);
    pinB.scale.set(0.06, 0.18, 0.06);
    pinB.rotation.x = Math.PI / 2;
    arm.add(pinB);
    arm.userData.pinA = pinA;
    return arm;
  });
  const legs = [];
  for (const s of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const l = mesh(GEO.cyl, legM, 0.38 * s, 0.18, -0.15 + i * 0.15);
      l.scale.set(0.035, 0.3, 0.035);
      l.rotation.z = 0.9 * s;
      body.add(l);
      legs.push(l);
    }
  void eyes;
  return {
    group: g,
    update(e, t) {
      const walk = e.state === "walk" ? 1 : 0.3;
      legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 14 + i * 1.7) * 0.4 * walk));
      claws.forEach((c, i) => (c.userData.pinA.rotation.y = Math.sin(t * 6 + i) * 0.3));
      body.position.y = Math.abs(Math.sin(t * 14)) * 0.03 * walk;
    },
  };
}

export function makeThorn() {
  const g = new THREE.Group();
  const bodyM = toon("#5b3f8f");
  const spikeM = flat("#d6c6ff", { emissive: "#6a3cff", emissiveIntensity: 0.35 });
  const body = new THREE.Group();
  g.add(body);
  const dome = mesh(GEO.sphere, bodyM, 0, 0.4, 0);
  dome.scale.set(0.58, 0.42, 0.62);
  body.add(dome);
  const face = mesh(GEO.sphere, toon("#c9b28a"), 0, 0.34, 0.42);
  face.scale.set(0.3, 0.24, 0.2);
  body.add(face);
  for (const s of [-1, 1]) {
    const e = mesh(GEO.sphere, new THREE.MeshBasicMaterial({ color: "#ffe14a" }), 0.11 * s, 0.42, 0.56);
    e.scale.set(0.06, 0.05, 0.03);
    body.add(e);
  }
  const nose = mesh(GEO.sphere, toon("#2a1a2a"), 0, 0.34, 0.62);
  nose.scale.setScalar(0.05);
  body.add(nose);
  // spikes over the back
  const spikes = new THREE.Group();
  body.add(spikes);
  for (let r = 0; r < 4; r++)
    for (let i = 0; i < 7; i++) {
      const th = -1.2 + (i / 6) * 2.4;
      const ph = 0.25 + r * 0.33;
      const x = Math.sin(th) * Math.sin(ph) * 0.55;
      const y = 0.4 + Math.cos(ph) * 0.4;
      const z = -Math.cos(th) * Math.sin(ph) * 0.58 + 0.05;
      if (z > 0.35 && y < 0.6) continue;
      const c = mesh(GEO.cone4, spikeM, x, y, z);
      c.scale.set(0.07, 0.3, 0.07);
      c.lookAt(x * 3, 0.4 + (y - 0.4) * 3, z * 3);
      c.rotateX(Math.PI / 2);
      spikes.add(c);
    }
  const feet = [-1, 1].flatMap((s) => [0.25, -0.25].map((z) => {
    const f = mesh(GEO.sphere, toon("#3a2560"), 0.32 * s, 0.07, z);
    f.scale.set(0.12, 0.08, 0.14);
    body.add(f);
    return f;
  }));
  return {
    group: g,
    update(e, t) {
      const w = e.state === "walk" ? 1 : 0;
      feet.forEach((f, i) => (f.position.y = 0.07 + Math.max(0, Math.sin(t * 16 + i * Math.PI * 0.5)) * 0.08 * w));
      body.rotation.z = Math.sin(t * 16) * 0.05 * w;
      spikeM.emissiveIntensity = e.stun > 0 ? 1.2 : 0.35 + Math.sin(t * 3) * 0.15;
      body.position.x = e.stun > 0 ? Math.sin(t * 60) * 0.05 : 0;
    },
  };
}

export function makePlant(fire = false) {
  const g = new THREE.Group();
  const stemM = toon(fire ? "#5a3a22" : "#3e9a3a");
  const headM = toon(fire ? "#d8461c" : "#7ad04a", { emissive: fire ? "#ff3a00" : "#ff2a00", emissiveIntensity: 0 });
  const leafM = toon(fire ? "#7a2a14" : "#2f7f2a");
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const l = mesh(GEO.sphere, leafM, Math.sin(a) * 0.32, 0.06, Math.cos(a) * 0.32);
    l.scale.set(0.14, 0.05, 0.34);
    l.rotation.y = a;
    g.add(l);
  }
  const stem = mesh(GEO.cyl, stemM, 0, 0.35, 0);
  stem.scale.set(0.08, 0.7, 0.08);
  g.add(stem);
  const headG = new THREE.Group();
  headG.position.y = 0.85;
  g.add(headG);
  const head = mesh(GEO.sphere, headM, 0, 0, 0);
  head.scale.set(0.36, 0.32, 0.36);
  headG.add(head);
  const lips = mesh(new THREE.TorusGeometry(0.14, 0.05, 6, 12), toon(fire ? "#ffd04a" : "#ffe37a"), 0, 0.02, 0.3);
  headG.add(lips);
  const mouth = mesh(GEO.sphere, new THREE.MeshBasicMaterial({ color: "#2a0a0a" }), 0, 0.02, 0.31);
  mouth.scale.set(0.12, 0.12, 0.04);
  headG.add(mouth);
  for (const s of [-1, 1]) {
    const e = mesh(GEO.sphere, new THREE.MeshBasicMaterial({ color: "#fff" }), 0.15 * s, 0.17, 0.22);
    e.scale.setScalar(0.07);
    headG.add(e);
    const pu = mesh(GEO.sphere, new THREE.MeshBasicMaterial({ color: "#111" }), 0.15 * s, 0.17, 0.28);
    pu.scale.setScalar(0.035);
    headG.add(pu);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sp = mesh(GEO.cone4, flat(fire ? "#ffcf6a" : "#f6f2c0"), Math.sin(a) * 0.3, 0.12, Math.cos(a) * 0.3 - 0.05);
    sp.scale.set(0.05, 0.16, 0.05);
    sp.rotation.set(-0.4 + Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.8);
    headG.add(sp);
  }
  return {
    group: g,
    update(e, t) {
      let s = 1, glow = 0, lean = 0;
      if (e.state === "windup") {
        const k = Math.min(1, e.st / 0.8);
        s = 1 + k * 0.3 + Math.sin(t * 40) * 0.03 * k;
        glow = k * 0.9;
        lean = -0.35 * k;
      } else if (e.state === "fire") {
        s = 0.85;
        lean = 0.45;
      } else {
        s = 1 + Math.sin(t * 2.5) * 0.03;
        lean = Math.sin(t * 1.7) * 0.06;
      }
      headG.scale.setScalar(s);
      headG.rotation.x = lean;
      headM.emissiveIntensity = glow;
    },
  };
}

/* ----------------------------------------------------------------- boss */
export function makeBoss() {
  const g = new THREE.Group();
  const stone = flat("#7f8a7a");
  const stoneD = flat("#5d665a");
  const moss = flat("#4f9a3a");
  const wood = flat("#8a5a32");
  const eyeM = new THREE.MeshBasicMaterial({ color: "#7dffb0" });
  const crystalM = flat("#6ff0ff", { emissive: "#29c8ff", emissiveIntensity: 0.6, transparent: true, opacity: 0.95 });
  const body = new THREE.Group();
  g.add(body);
  const hips = new THREE.Group();
  hips.position.y = 1.0;
  body.add(hips);
  const legs = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(0.65 * s, 0, 0);
    hips.add(p);
    const l = mesh(GEO.box, stoneD, 0, -0.5, 0);
    l.scale.set(0.6, 1.0, 0.7);
    p.add(l);
    const f = mesh(GEO.box, stone, 0, -0.95, 0.15);
    f.scale.set(0.8, 0.3, 1.0);
    p.add(f);
    return p;
  });
  const torso = new THREE.Group();
  torso.position.y = 1.0;
  body.add(torso);
  const chest = mesh(GEO.dodec, stone, 0, 0.95, 0);
  chest.scale.set(1.35, 1.15, 1.0);
  torso.add(chest);
  const belly = mesh(GEO.dodec, stoneD, 0, 0.45, 0.25);
  belly.scale.set(0.9, 0.6, 0.7);
  torso.add(belly);
  for (const s of [-1, 1]) {
    const m = mesh(GEO.ico1, moss, 1.05 * s, 1.55, 0);
    m.scale.set(0.65, 0.4, 0.6);
    torso.add(m);
  }
  const mossB = mesh(GEO.ico1, moss, 0, 1.75, -0.35);
  mossB.scale.set(0.9, 0.35, 0.6);
  torso.add(mossB);
  // vines
  for (const x of [-0.6, 0.1, 0.7]) {
    const v = mesh(GEO.cyl6, moss, x, 1.0, 0.9);
    v.scale.set(0.06, 0.9, 0.06);
    v.rotation.z = x * 0.3;
    torso.add(v);
  }
  // head with a carved wooden mask
  const head = new THREE.Group();
  head.position.y = 2.0;
  torso.add(head);
  const skull = mesh(GEO.dodec, stone, 0, 0.35, 0);
  skull.scale.set(0.75, 0.65, 0.7);
  head.add(skull);
  const mask = mesh(GEO.box, wood, 0, 0.3, 0.55);
  mask.scale.set(1.0, 0.85, 0.18);
  head.add(mask);
  const brow = mesh(GEO.box, flat("#5e3a1e"), 0, 0.55, 0.66);
  brow.scale.set(1.05, 0.14, 0.12);
  head.add(brow);
  const eyes = [-1, 1].map((s) => {
    const e = mesh(GEO.box, eyeM, 0.25 * s, 0.38, 0.66);
    e.scale.set(0.2, 0.12, 0.05);
    head.add(e);
    return e;
  });
  const jaw = mesh(GEO.box, flat("#6e4424"), 0, 0.02, 0.6);
  jaw.scale.set(0.7, 0.18, 0.16);
  head.add(jaw);
  for (const s of [-1, 1]) {
    const tusk = mesh(GEO.cone4, flat("#f2ead2"), 0.28 * s, 0.12, 0.72);
    tusk.scale.set(0.07, 0.22, 0.07);
    head.add(tusk);
  }
  const crystal = mesh(new THREE.OctahedronGeometry(0.32, 0), crystalM, 0, 0.95, 0);
  crystal.scale.set(0.8, 1.3, 0.8);
  head.add(crystal);
  // arms with huge fists
  const arms = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(1.35 * s, 1.35, 0);
    torso.add(p);
    const up = mesh(GEO.box, stoneD, 0, -0.45, 0);
    up.scale.set(0.5, 0.95, 0.55);
    p.add(up);
    const fist = mesh(GEO.dodec, stone, 0, -1.15, 0.05);
    fist.scale.set(0.55, 0.5, 0.55);
    p.add(fist);
    const m = mesh(GEO.ico1, moss, 0, -0.05, 0);
    m.scale.set(0.36, 0.22, 0.36);
    p.add(m);
    return p;
  });
  // dizzy stars
  const stars = new THREE.Group();
  stars.position.y = 4.1;
  g.add(stars);
  for (let i = 0; i < 4; i++) {
    const s = mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: "#ffe14a" }));
    const a = (i / 4) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9);
    stars.add(s);
  }
  // "flash white" when hit
  const mats = [stone, stoneD, moss, wood];
  for (const m of mats) m.emissive = new THREE.Color("#ffffff");
  let t = 0;
  return {
    group: g,
    crystal,
    update(B, dt) {
      t += dt;
      const s = B.state;
      const st = B.st;
      let armX = 0, armZ = 0.15, lean = 0, legSwing = 0, headX = 0, crouch = 0, sink = 0;
      if (s === "sleep") {
        lean = 0.35;
        headX = 0.4;
        crouch = 0.15;
        armX = 0.2;
      } else if (s === "intro") {
        const k = Math.min(1, st / 1.2);
        lean = 0.35 * (1 - k) - 0.15 * Math.sin(k * Math.PI);
        armX = -2.2 * Math.sin(k * Math.PI);
        armZ = 0.7;
        headX = -0.3 * Math.sin(k * Math.PI);
      } else if (s === "slamTele") {
        armX = -2.9;
        armZ = 0.25;
        lean = -0.2;
        crouch = -0.05;
      } else if (s === "slam") {
        armX = Math.min(0.6, -2.9 + st * 30);
        lean = 0.35;
        crouch = 0.2;
      } else if (s === "bouldersTele" || s === "boulders") {
        const ph = (st % 0.5) / 0.5;
        armX = s === "bouldersTele" ? -2.4 : -2.4 + ph * 2.8;
        armZ = 0.2;
        lean = -0.1;
      } else if (s === "chargeTele") {
        lean = 0.45;
        crouch = 0.2;
        armX = 0.9;
        legSwing = Math.sin(t * 22) * 0.25;
      } else if (s === "charge") {
        lean = 0.6;
        armX = 1.0;
        legSwing = Math.sin(t * 18) * 0.8;
      } else if (s === "tired" || s === "dizzy") {
        lean = 0.5;
        crouch = 0.35;
        headX = 0.5 + Math.sin(t * 4) * 0.1;
        armX = 0.3;
        armZ = 0.4;
      } else if (s === "hurt") {
        lean = -0.4;
        armX = -1.2;
        armZ = 0.9;
        headX = -0.4;
      } else if (s === "defeat") {
        const k = Math.min(1, st / 3.2);
        lean = -0.2 + k * 0.6;
        sink = k * 1.2;
        armZ = 0.9;
        headX = 0.6 * k;
        body.position.x = Math.sin(t * 50) * 0.08 * (1 - k);
      } else {
        // idle: breathing sway
        lean = Math.sin(t * 1.4) * 0.04;
        armX = Math.sin(t * 1.4) * 0.15;
        legSwing = 0;
      }
      if (B.defeated) {
        sink = 1.2 + Math.min(3, B.deadT * 1.5);
        g.visible = B.deadT < 2;
      } else g.visible = true;
      const k = Math.min(1, dt * 12);
      torso.rotation.x += (lean - torso.rotation.x) * k;
      head.rotation.x += (headX - head.rotation.x) * k;
      body.position.y += (-crouch - sink - body.position.y) * k;
      arms[0].rotation.x += (armX - arms[0].rotation.x) * k;
      arms[1].rotation.x += (armX - arms[1].rotation.x) * k;
      arms[0].rotation.z += (-armZ - arms[0].rotation.z) * k;
      arms[1].rotation.z += (armZ - arms[1].rotation.z) * k;
      legs[0].rotation.x = legSwing;
      legs[1].rotation.x = -legSwing;
      stars.visible = s === "dizzy" || s === "tired";
      stars.rotation.y = t * 4;
      stars.position.y = 4.1 - crouch - 0.6 * (s === "tired" || s === "dizzy" ? 1 : 0);
      const vul = B.vulnerable;
      crystalM.emissiveIntensity = vul ? 1.4 + Math.sin(t * 12) * 0.6 : 0.4;
      crystal.rotation.y = t * 1.5;
      crystal.scale.setScalar(vul ? 1.25 + Math.sin(t * 12) * 0.08 : 1);
      eyeM.color.set(s.endsWith("Tele") || s === "charge" ? "#ff5a3a" : vul ? "#ffe14a" : "#7dffb0");
      const fl = B.flash > 0 ? (Math.sin(t * 50) > 0 ? 0.8 : 0) : 0;
      for (const m of mats) m.emissiveIntensity = fl;
    },
  };
}

/* ----------------------------------------------------------------- checkpoint / portal */
export function makeCheckpoint() {
  const g = new THREE.Group();
  const wood = flat("#9a6a3a");
  const woodD = flat("#6a4222");
  const pole = mesh(GEO.cyl6, woodD, 0, 0.9, 0);
  pole.scale.set(0.12, 1.8, 0.12);
  g.add(pole);
  const face = mesh(GEO.cyl6, wood, 0, 0.55, 0);
  face.scale.set(0.3, 0.7, 0.3);
  g.add(face);
  const eyeM = new THREE.MeshLambertMaterial({ color: "#555", emissive: "#3cff7a", emissiveIntensity: 0 });
  for (const s of [-1, 1]) {
    const e = mesh(GEO.box, eyeM, 0.11 * s, 0.68, 0.27);
    e.scale.set(0.1, 0.07, 0.04);
    g.add(e);
  }
  const mouth = mesh(GEO.box, woodD, 0, 0.42, 0.27);
  mouth.scale.set(0.22, 0.06, 0.04);
  g.add(mouth);
  const flagM = new THREE.MeshLambertMaterial({ color: "#9a9a9a", side: THREE.DoubleSide });
  const flag = mesh(new THREE.PlaneGeometry(0.7, 0.45, 4, 1), flagM, 0.36, 1.45, 0);
  g.add(flag);
  const ringM = new THREE.MeshBasicMaterial({ color: "#7dff9a", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const ring = mesh(new THREE.RingGeometry(0.6, 0.9, 24), ringM, 0, 0.05, 0);
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  let on = false, t = 0, burst = 0;
  return {
    group: g,
    update(c, dt) {
      t += dt;
      if (c.on && !on) {
        on = true;
        burst = 1;
        flagM.color.set("#3fcf5a");
        eyeM.emissiveIntensity = 1.2;
      }
      flag.position.y += ((on ? 1.5 : 0.95) - flag.position.y) * Math.min(1, dt * 4);
      const pos = flag.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + 0.35;
        pos.setZ(i, Math.sin(t * 6 - x * 6) * 0.06 * x);
      }
      pos.needsUpdate = true;
      if (burst > 0) {
        burst = Math.max(0, burst - dt * 1.2);
        ring.scale.setScalar(1 + (1 - burst) * 2.2);
        ringM.opacity = burst * 0.8;
      }
    },
  };
}

export function makePortal() {
  const g = new THREE.Group();
  const stone = flat("#8a8f84");
  const mossM = flat("#4f9a3a");
  for (const s of [-1, 1]) {
    const p = mesh(GEO.box, stone, 1.35 * s, 1.3, 0);
    p.scale.set(0.5, 2.6, 0.6);
    g.add(p);
    const m = mesh(GEO.ico1, mossM, 1.35 * s, 2.65, 0);
    m.scale.set(0.42, 0.22, 0.42);
    g.add(m);
  }
  const top = mesh(GEO.box, stone, 0, 2.75, 0);
  top.scale.set(3.4, 0.45, 0.7);
  g.add(top);
  const disc = new THREE.MeshBasicMaterial({ map: swirlTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const swirl = mesh(new THREE.CircleGeometry(1.08, 32), disc, 0, 1.3, 0);
  swirl.scale.set(1, 1.15, 1);
  g.add(swirl);
  const ring = mesh(new THREE.TorusGeometry(1.12, 0.08, 8, 32), new THREE.MeshBasicMaterial({ color: "#aaffdf" }), 0, 1.3, 0);
  ring.scale.set(1, 1.15, 1);
  g.add(ring);
  const glow = new THREE.PointLight("#7dffd0", 2.2, 9, 1.6);
  glow.position.set(0, 1.4, 1);
  g.add(glow);
  let t = 0;
  return {
    group: g,
    update(P, dt) {
      t += dt;
      swirl.rotation.z = -t * 2.2;
      const s = 1 + Math.sin(t * 3) * 0.03;
      swirl.scale.set(s, 1.15 * s, 1);
      const open = !P || P.open;
      if (open) P && (P.k = Math.min(1, (P.k || 0) + dt * 1.5));
      const k = P ? P.k || 0 : 1;
      swirl.visible = ring.visible = k > 0.01;
      ring.scale.set(k, 1.15 * k, k);
      swirl.scale.multiplyScalar(k);
      glow.intensity = 2.2 * k;
    },
  };
}

/* ----------------------------------------------------------------- scenery */
export function makeProp(kind, rnd, theme) {
  const g = new THREE.Group();
  const P = theme.palette;
  switch (kind) {
    case "palm": {
      const h = 3.5 + rnd() * 2.5;
      const trunkM = flat(P.trunk);
      let x = 0, y = 0;
      const lean = (rnd() - 0.5) * 0.5;
      for (let i = 0; i < 6; i++) {
        const seg = mesh(GEO.cyl6, trunkM, x, y + h / 12, 0);
        seg.scale.set(0.2 - i * 0.015, h / 6, 0.2 - i * 0.015);
        seg.rotation.z = lean * 0.5;
        g.add(seg);
        x += Math.sin(lean) * (h / 6) * 0.5;
        y += h / 6;
      }
      const leafM = flat(P.leaf, { side: THREE.DoubleSide });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rnd() * 0.3;
        const lf = mesh(GEO.cone4, leafM, x + Math.cos(a) * 0.9, y - 0.25, Math.sin(a) * 0.9);
        lf.scale.set(0.35, 2.0, 0.08);
        lf.rotation.set(0, -a, Math.PI / 2 + 0.35);
        lf.rotateY(Math.PI / 2);
        g.add(lf);
      }
      const nuts = mesh(GEO.lowSphere, flat("#6a4a22"), x, y - 0.3, 0);
      nuts.scale.setScalar(0.22);
      g.add(nuts);
      break;
    }
    case "tree":
    case "pine": {
      const pine = kind === "pine";
      const h = 3 + rnd() * 3;
      const trunk = mesh(GEO.cyl6, flat(P.trunk), 0, h * 0.3, 0);
      trunk.scale.set(0.22, h * 0.6, 0.22);
      g.add(trunk);
      const leafM = flat(P.leaf);
      if (pine)
        for (let i = 0; i < 3; i++) {
          const c = mesh(GEO.cone, leafM, 0, h * 0.45 + i * h * 0.22, 0);
          c.scale.set(1.5 - i * 0.4, h * 0.38, 1.5 - i * 0.4);
          g.add(c);
        }
      else
        for (let i = 0; i < 3; i++) {
          const b = mesh(GEO.ico1, leafM, (rnd() - 0.5) * 0.9, h * 0.7 + rnd() * 0.6, (rnd() - 0.5) * 0.9);
          b.scale.setScalar(0.9 + rnd() * 0.6);
          g.add(b);
        }
      break;
    }
    case "bush": {
      const m = flat(P.bush);
      for (let i = 0; i < 3; i++) {
        const b = mesh(GEO.ico1, m, (rnd() - 0.5) * 0.8, 0.35, (rnd() - 0.5) * 0.8);
        b.scale.setScalar(0.45 + rnd() * 0.3);
        g.add(b);
      }
      if (P.flower) {
        for (let i = 0; i < 3; i++) {
          const f = mesh(GEO.lowSphere, flat(P.flower[i % P.flower.length]), (rnd() - 0.5) * 0.9, 0.7 + rnd() * 0.2, (rnd() - 0.5) * 0.9);
          f.scale.setScalar(0.1);
          g.add(f);
        }
      }
      break;
    }
    case "rock": {
      const r = mesh(GEO.dodec, flat(P.rock), 0, 0.3, 0);
      r.scale.set(0.6 + rnd() * 0.8, 0.4 + rnd() * 0.6, 0.6 + rnd() * 0.8);
      r.rotation.y = rnd() * 3;
      g.add(r);
      break;
    }
    case "pillar": {
      const h = 2 + rnd() * 3.5;
      const m = flat(P.rock);
      const c = mesh(GEO.cyl, m, 0, h / 2, 0);
      c.scale.set(0.45, h, 0.45);
      g.add(c);
      const cap = mesh(GEO.box, m, 0, h + 0.15, 0);
      cap.scale.set(1.1, 0.3, 1.1);
      if (rnd() < 0.7) g.add(cap);
      const vine = mesh(GEO.cyl6, flat(P.leaf), 0.4, h * 0.5, 0);
      vine.scale.set(0.05, h * 0.8, 0.05);
      g.add(vine);
      break;
    }
    case "head": {
      // a huge carved stone head half-buried in the ground
      const m = flat(P.rock);
      const hd = mesh(GEO.box, m, 0, 1.2, 0);
      hd.scale.set(1.8, 2.4, 1.6);
      g.add(hd);
      const nose = mesh(GEO.box, m, 0, 1.2, 0.9);
      nose.scale.set(0.4, 0.8, 0.3);
      g.add(nose);
      const brow = mesh(GEO.box, flat("#5a5040"), 0, 1.75, 0.82);
      brow.scale.set(1.6, 0.25, 0.1);
      g.add(brow);
      const moss = mesh(GEO.ico1, flat(P.leaf), 0.3, 2.45, 0);
      moss.scale.set(0.9, 0.25, 0.8);
      g.add(moss);
      break;
    }
    case "spire": {
      const h = 3 + rnd() * 5;
      const c = mesh(GEO.cone4, flat(P.rock), 0, h / 2, 0);
      c.scale.set(0.9 + rnd() * 0.6, h, 0.9 + rnd() * 0.6);
      c.rotation.y = rnd() * 3;
      g.add(c);
      break;
    }
    case "deadtree": {
      const h = 2.5 + rnd() * 2;
      const m = flat("#2a2020");
      const t = mesh(GEO.cyl6, m, 0, h / 2, 0);
      t.scale.set(0.14, h, 0.14);
      g.add(t);
      for (let i = 0; i < 3; i++) {
        const b = mesh(GEO.cyl6, m, 0, h * (0.5 + i * 0.15), 0);
        b.scale.set(0.06, 1.0, 0.06);
        b.rotation.z = (i % 2 ? 1 : -1) * 0.9;
        b.position.x = (i % 2 ? -1 : 1) * 0.35;
        g.add(b);
      }
      break;
    }
    case "mushroom": {
      const h = 0.6 + rnd() * 1.4;
      const st = mesh(GEO.cyl6, flat("#e8e0f0"), 0, h / 2, 0);
      st.scale.set(0.12 * h, h, 0.12 * h);
      g.add(st);
      const cap = mesh(GEO.sphere, new THREE.MeshLambertMaterial({ color: P.glow, emissive: P.glow, emissiveIntensity: 0.7 }), 0, h, 0);
      cap.scale.set(0.5 * h, 0.25 * h, 0.5 * h);
      g.add(cap);
      break;
    }
    case "tower": {
      const h = 6 + rnd() * 5;
      const m = flat(P.rock);
      const c = mesh(GEO.cyl6, m, 0, h / 2, 0);
      c.scale.set(1.4, h, 1.4);
      g.add(c);
      const roof = mesh(GEO.cone, flat("#8a3a2a"), 0, h + 1, 0);
      roof.scale.set(1.9, 2.2, 1.9);
      g.add(roof);
      const flag = mesh(GEO.box, flat("#e8c23a"), 0.4, h + 2.4, 0);
      flag.scale.set(0.8, 0.45, 0.04);
      g.add(flag);
      break;
    }
    case "torch": {
      const pole = mesh(GEO.cyl6, flat("#4a3020"), 0, 0.8, 0);
      pole.scale.set(0.08, 1.6, 0.08);
      g.add(pole);
      const fire = mesh(GEO.cone4, new THREE.MeshBasicMaterial({ color: "#ffb03a" }), 0, 1.8, 0);
      fire.scale.set(0.16, 0.4, 0.16);
      g.add(fire);
      g.userData.flame = fire;
      break;
    }
    case "reeds": {
      const m = flat(P.leaf);
      for (let i = 0; i < 5; i++) {
        const r = mesh(GEO.cyl6, m, (rnd() - 0.5) * 0.6, 0.6, (rnd() - 0.5) * 0.6);
        r.scale.set(0.03, 1.2 + rnd(), 0.03);
        r.rotation.z = (rnd() - 0.5) * 0.3;
        g.add(r);
      }
      break;
    }
    default:
      break;
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = kind !== "mushroom" && kind !== "torch";
      o.receiveShadow = false;
    }
  });
  return g;
}
