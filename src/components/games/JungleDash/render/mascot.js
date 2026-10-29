/**
 * Mango — the original orange jungle critter: big round head, huge
 * leaf-shaped ears, oversized green eyes, a spiral striped tail, a leafy
 * green headband, chunky green gloves and teal sneakers.
 *
 * Built from simple primitives (toon-shaded) on a small hierarchy that is
 * posed procedurally: idle, run, jump, fall, spin, hit, win and ko poses
 * are blended every frame from the sim's player state.
 */
import * as THREE from "three";

let gradient = null;
export function toonGradient() {
  if (gradient) return gradient;
  const d = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}
export const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });

const C = {
  fur: "#f58a1f",
  furDark: "#c9601a",
  cream: "#ffe2b0",
  glove: "#3fbf4a",
  gloveCuff: "#e9f7d0",
  shoe: "#20b2b8",
  sole: "#f4f4f0",
  lace: "#ffd23f",
  band: "#2f9e44",
  leaf: "#6fd04a",
  eye: "#ffffff",
  iris: "#2dbb5a",
  pupil: "#14202a",
  nose: "#3a2216",
  mouth: "#7a2e22",
};

function capsule(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
  return m;
}
function sphere(r, mat, ws = 14, hs = 10) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);
}

export function createMascot() {
  const M = {
    fur: toon(C.fur),
    furDark: toon(C.furDark),
    cream: toon(C.cream),
    glove: toon(C.glove),
    cuff: toon(C.gloveCuff),
    shoe: toon(C.shoe),
    sole: toon(C.sole),
    lace: toon(C.lace),
    band: toon(C.band),
    leaf: toon(C.leaf),
    eye: new THREE.MeshBasicMaterial({ color: C.eye }),
    iris: toon(C.iris),
    pupil: new THREE.MeshBasicMaterial({ color: C.pupil }),
    shine: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
    nose: toon(C.nose),
    mouth: new THREE.MeshBasicMaterial({ color: C.mouth }),
  };
  const root = new THREE.Group();
  root.name = "mango";
  const body = new THREE.Group(); // squash / spin / lean
  root.add(body);

  // --- hips + legs
  const hips = new THREE.Group();
  hips.position.y = 0.4;
  body.add(hips);
  const legs = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.12 * s, 0, 0);
    hips.add(pivot);
    const thigh = capsule(0.075, 0.14, M.fur);
    thigh.position.y = -0.12;
    pivot.add(thigh);
    const foot = new THREE.Group();
    foot.position.y = -0.28;
    pivot.add(foot);
    const shoe = sphere(0.12, M.shoe);
    shoe.scale.set(0.85, 0.62, 1.35);
    shoe.position.set(0, -0.03, 0.05);
    foot.add(shoe);
    const sole = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.11, 0.05, 12), M.sole);
    sole.scale.set(1, 1, 1.55);
    sole.position.set(0, -0.085, 0.05);
    foot.add(sole);
    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.05), M.lace);
    lace.position.set(0, 0.04, 0.1);
    lace.rotation.x = -0.4;
    foot.add(lace);
    return pivot;
  });

  // --- torso
  const torso = new THREE.Group();
  torso.position.y = 0.42;
  body.add(torso);
  const trunk = sphere(0.24, M.fur, 16, 12);
  trunk.scale.set(1, 1.12, 0.92);
  trunk.position.y = 0.17;
  torso.add(trunk);
  const belly = sphere(0.19, M.cream, 14, 10);
  belly.scale.set(0.9, 1.05, 0.55);
  belly.position.set(0, 0.13, 0.13);
  torso.add(belly);

  // --- arms
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.22 * s, 0.32, 0);
    torso.add(pivot);
    const upper = capsule(0.058, 0.16, M.fur);
    upper.position.y = -0.11;
    pivot.add(upper);
    const hand = new THREE.Group();
    hand.position.y = -0.27;
    pivot.add(hand);
    const glove = sphere(0.1, M.glove);
    glove.scale.set(1, 0.95, 0.95);
    hand.add(glove);
    const thumb = sphere(0.045, M.glove, 8, 6);
    thumb.position.set(-0.06 * s, 0.03, 0.06);
    hand.add(thumb);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.03, 6, 12), M.cuff);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = 0.08;
    hand.add(cuff);
    pivot.rotation.z = 0.25 * s;
    return pivot;
  });

  // --- head
  const head = new THREE.Group();
  head.position.y = 0.5;
  torso.add(head);
  const skull = sphere(0.3, M.fur, 18, 14);
  skull.scale.set(1.06, 0.94, 0.98);
  skull.position.y = 0.18;
  head.add(skull);
  const cheeks = sphere(0.17, M.cream, 14, 10);
  cheeks.scale.set(1.35, 0.78, 0.8);
  cheeks.position.set(0, 0.07, 0.19);
  head.add(cheeks);
  const nose = sphere(0.05, M.nose, 10, 8);
  nose.scale.set(1.3, 0.9, 1);
  nose.position.set(0, 0.14, 0.33);
  head.add(nose);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 10, Math.PI), M.mouth);
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, 0.06, 0.32);
  head.add(mouth);
  const eyes = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(0.115 * s, 0.24, 0.235);
    g.rotation.y = 0.28 * s;
    head.add(g);
    const white = sphere(0.1, M.eye, 14, 12);
    white.scale.set(0.82, 1.12, 0.55);
    g.add(white);
    const iris = sphere(0.062, M.iris, 12, 10);
    iris.scale.set(1, 1.1, 0.5);
    iris.position.set(0, -0.005, 0.04);
    g.add(iris);
    const pupil = sphere(0.036, M.pupil, 10, 8);
    pupil.scale.set(1, 1.1, 0.5);
    pupil.position.set(0, -0.005, 0.062);
    g.add(pupil);
    const shine = sphere(0.016, M.shine, 6, 6);
    shine.position.set(0.02 * s, 0.03, 0.075);
    g.add(shine);
    return g;
  });
  // brows
  const brows = [-1, 1].map((s) => {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.07, 2, 6), M.furDark);
    b.rotation.z = Math.PI / 2 + 0.25 * s;
    b.position.set(0.12 * s, 0.38, 0.27);
    head.add(b);
    return b;
  });
  // big leaf-shaped ears
  const ears = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(0.24 * s, 0.36, -0.02);
    g.rotation.z = -0.62 * s;
    head.add(g);
    const outer = sphere(0.2, M.fur, 12, 10);
    outer.scale.set(0.62, 1.25, 0.22);
    outer.position.y = 0.17;
    g.add(outer);
    const inner = sphere(0.15, M.cream, 10, 8);
    inner.scale.set(0.55, 1.05, 0.12);
    inner.position.set(0, 0.16, 0.03);
    g.add(inner);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 8), M.furDark);
    tip.position.y = 0.42;
    g.add(tip);
    return g;
  });
  // tuft
  for (let i = -1; i <= 1; i++) {
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), M.fur);
    tuft.position.set(i * 0.06, 0.47, 0.06 - Math.abs(i) * 0.03);
    tuft.rotation.set(0.35, 0, -i * 0.5);
    head.add(tuft);
  }
  // leafy headband
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.03, 6, 22), M.band);
  band.rotation.x = Math.PI / 2 + 0.22;
  band.position.y = 0.3;
  band.scale.set(1.05, 1, 1);
  head.add(band);
  const leaf = sphere(0.09, M.leaf, 8, 6);
  leaf.scale.set(0.45, 1.3, 0.15);
  leaf.position.set(-0.27, 0.33, -0.08);
  leaf.rotation.set(0.3, 0.4, 0.9);
  head.add(leaf);
  const leaf2 = leaf.clone();
  leaf2.position.set(-0.3, 0.27, -0.02);
  leaf2.rotation.set(-0.2, 0.3, 1.6);
  head.add(leaf2);

  // --- spiral striped tail
  const tail = new THREE.Group();
  tail.position.set(0, 0.06, -0.2);
  torso.add(tail);
  const segs = [];
  let parent = tail;
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    g.position.set(0, i === 0 ? 0 : 0.085, 0);
    parent.add(g);
    const r = 0.085 - i * 0.006;
    const s = sphere(r, i % 2 ? M.cream : M.fur, 10, 8);
    s.position.y = 0.04;
    g.add(s);
    segs.push(g);
    parent = g;
  }

  // spin swirl (shown while spinning)
  const swirlMat = new THREE.MeshBasicMaterial({ color: "#fff3c4", transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  const swirl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.45, 1.0, 18, 1, true), swirlMat);
  swirl.position.y = 0.55;
  swirl.visible = false;
  root.add(swirl);

  root.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });

  const rig = { root, body, hips, legs, torso, arms, head, eyes, brows, ears, tail, segs, swirl, swirlMat, mats: M, spinA: 0, blink: 2, t: 0 };
  return rig;
}

const lerp = (a, b, k) => a + (b - a) * k;

/** pose the rig from the player state; `p` is the sim player (or a fake {anim, animT, speed, landT}) */
export function animateMascot(rig, p, dt, opts = {}) {
  rig.t += dt;
  const t = rig.t;
  const a = p.anim;
  const at = p.animT || 0;
  const k = Math.min(1, dt * 16);
  const [legL, legR] = rig.legs;
  const [armL, armR] = rig.arms;
  // targets
  let bodyY = 0, lean = 0, sy = 1, sxz = 1, lL = 0, lR = 0, aLx = 0, aRx = 0, aLz = 0.25, aRz = -0.25, headX = 0, headZ = 0, tailX = -0.5, eyeS = 1, roll = 0;
  switch (a) {
    case "run": {
      const ph = t * (8 + (p.speed || 6) * 0.9);
      const s = Math.sin(ph);
      lL = s * 0.95;
      lR = -s * 0.95;
      aLx = -s * 0.9;
      aRx = s * 0.9;
      aLz = 0.35;
      aRz = -0.35;
      bodyY = Math.abs(Math.cos(ph)) * 0.06;
      lean = 0.2;
      headX = -0.1;
      tailX = -1.2 + Math.sin(ph * 0.5) * 0.15;
      roll = Math.sin(ph) * 0.05;
      break;
    }
    case "jump":
      lL = -0.9;
      lR = 0.35;
      aLz = 2.3;
      aRz = -2.3;
      aLx = -0.2;
      aRx = -0.2;
      sy = 1.08;
      sxz = 0.95;
      headX = -0.15;
      tailX = -1.4;
      break;
    case "fall": {
      const w = Math.sin(t * 14) * 0.25;
      lL = 0.4;
      lR = -0.25;
      aLz = 1.35 + w;
      aRz = -1.35 + w;
      headX = 0.15;
      tailX = 0.2;
      eyeS = 1.1;
      break;
    }
    case "spin":
      aLz = 1.55;
      aRz = -1.55;
      lL = 0.25;
      lR = -0.25;
      sy = 0.94;
      sxz = 1.05;
      tailX = -1.5;
      break;
    case "hit":
      lean = -0.45;
      aLz = 2.0;
      aRz = -2.0;
      aLx = -0.6;
      aRx = -0.6;
      headX = 0.3;
      eyeS = 0.25;
      lL = -0.5;
      lR = 0.5;
      break;
    case "ko":
      lean = -1.35;
      bodyY = -0.1;
      aLz = 1.7;
      aRz = -1.7;
      eyeS = 0.15;
      lL = -0.7;
      lR = -0.4;
      break;
    case "win": {
      const hop = Math.max(0, Math.sin(at * 7));
      bodyY = hop * 0.35;
      aLz = 2.5 + Math.sin(at * 14) * 0.3;
      aRz = -2.5 - Math.sin(at * 14 + 1) * 0.3;
      lL = -hop * 0.6;
      lR = -hop * 0.3;
      tailX = -0.9 + Math.sin(at * 9) * 0.4;
      headX = -0.2;
      break;
    }
    default: {
      // idle: breathe, look around, wag tail
      const b = Math.sin(t * 2.2);
      sy = 1 + b * 0.02;
      aLz = 0.28 + b * 0.04;
      aRz = -0.28 - b * 0.04;
      aLx = 0.1;
      aRx = 0.1;
      headZ = Math.sin(t * 0.7) * 0.08;
      headX = Math.sin(t * 0.5) * 0.05;
      tailX = -0.55 + Math.sin(t * 1.8) * 0.12;
      if (opts.wave) {
        aRz = -2.6;
        aRx = Math.sin(t * 9) * 0.35;
      }
    }
  }
  if (p.landT > 0 && a !== "jump") {
    const q = p.landT / 0.18;
    sy *= 1 - 0.18 * q;
    sxz *= 1 + 0.12 * q;
  }
  // blink
  rig.blink -= dt;
  if (rig.blink < 0) rig.blink = 2.5 + ((t * 7.3) % 2);
  if (rig.blink < 0.12) eyeS *= 0.12;

  const B = rig.body;
  B.position.y = lerp(B.position.y, bodyY, k);
  B.rotation.x = lerp(B.rotation.x, lean, k);
  B.rotation.z = lerp(B.rotation.z, roll, k);
  B.scale.y = lerp(B.scale.y, sy, k);
  B.scale.x = B.scale.z = lerp(B.scale.x, sxz, k);
  legL.rotation.x = lerp(legL.rotation.x, lL, k);
  legR.rotation.x = lerp(legR.rotation.x, lR, k);
  armL.rotation.x = lerp(armL.rotation.x, aLx, k);
  armR.rotation.x = lerp(armR.rotation.x, aRx, k);
  armL.rotation.z = lerp(armL.rotation.z, -aLz, k);
  armR.rotation.z = lerp(armR.rotation.z, -aRz, k);
  rig.head.rotation.x = lerp(rig.head.rotation.x, headX, k);
  rig.head.rotation.z = lerp(rig.head.rotation.z, headZ, k);
  for (const e of rig.eyes) e.scale.y = lerp(e.scale.y, eyeS, Math.min(1, dt * 30));
  // ears flop with motion
  const flop = a === "fall" ? 0.35 : a === "jump" ? -0.25 : a === "run" ? Math.sin(t * 16) * 0.08 : Math.sin(t * 1.3) * 0.04;
  rig.ears[0].rotation.x = lerp(rig.ears[0].rotation.x, flop, k);
  rig.ears[1].rotation.x = lerp(rig.ears[1].rotation.x, flop, k);
  // tail curls into a spiral, base angle follows the pose
  rig.tail.rotation.x = lerp(rig.tail.rotation.x, tailX, k);
  for (let i = 1; i < rig.segs.length; i++) {
    const s = rig.segs[i];
    s.rotation.x = lerp(s.rotation.x, -0.42 - i * 0.04 + Math.sin(t * 3 - i * 0.6) * 0.05, k);
    s.rotation.z = lerp(s.rotation.z, Math.sin(t * 2.4 - i * 0.5) * (a === "run" ? 0.12 : 0.06), k);
  }
  // spin: whole body whirls, swirl cone shows
  if (a === "spin") {
    rig.spinA += dt * 26;
    B.rotation.y = rig.spinA;
    rig.swirl.visible = true;
    rig.swirl.rotation.y = -rig.spinA * 0.6;
    rig.swirlMat.opacity = 0.32 + Math.sin(t * 40) * 0.08;
  } else {
    if (rig.spinA) B.rotation.y = Math.atan2(Math.sin(B.rotation.y), Math.cos(B.rotation.y)); // no unwinding
    rig.spinA = 0;
    B.rotation.y = lerp(B.rotation.y, 0, Math.min(1, dt * 20));
    rig.swirl.visible = false;
  }
}
