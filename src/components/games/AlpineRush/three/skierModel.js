/**
 * Alpine Rush — the 3D skier: a procedural rig (plain Three.js) with
 * jacket, pants, helmet, goggles, gloves, boots, two skis and two poles.
 *
 *   root ─ pitch (slope) ─ lean (carve / edge angle) ─┬─ skis + boots (flat on the snow)
 *                                                     └─ hips ─ torso ─ head / arms / poles
 *                                                          └─ legs (2-bone IK hip → ankle)
 *
 * The legs are solved every frame from the hip to the ankle, so the skis
 * always stay exactly under the boots whatever the posture. Poses blend
 * smoothly (no snapping): idle in the start house (pole fidget), upright
 * skiing, tuck, race tuck, carving lean left / right, snowplough (skis in a
 * wedge, knees in), jump / airborne (arms out), landing compression, fall
 * (tumble), getting up, victory (arms and poles up).
 */
import * as THREE from "three";
import { skiTex } from "./textures.js";
import { GOGGLES } from "../data/skis.js";

const THIGH = 0.46;
const SHIN = 0.46;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createSkierModel({ suit, ski, design = "set", shadows = false, blobTex = null }) {
  const disp = [];
  const own = (x) => (disp.push(x), x);
  const mat = (color, extra = {}) => own(new THREE.MeshLambertMaterial({ color, ...extra }));
  const mJacket = mat(suit.jacket);
  const mJacket2 = mat(new THREE.Color(suit.jacket).offsetHSL(0, 0, -0.12));
  const mPants = mat(suit.pants);
  const mHelmet = mat(suit.helmet);
  const gg = GOGGLES[suit.goggles] || GOGGLES.amber;
  const mLens = own(new THREE.MeshPhongMaterial({ color: gg.lens, shininess: 90, specular: "#ffffff" }));
  const mRim = mat(gg.rim);
  const mGlove = mat("#1a1c22");
  const mBoot = mat(new THREE.Color(ski.accent).offsetHSL(0, 0, -0.05));
  const mBuckle = mat("#c9ced6");
  const mSkin = mat("#e8b896");
  const mPole = mat("#c9ced6");
  const mBib = mat("#ffffff");
  const pattern = design === "set" ? ski.pattern || "stripe" : design;
  const mSki = own(new THREE.MeshLambertMaterial({ map: skiTex(ski, pattern) }));
  const mSkiSide = mat(ski.tip);

  const root = new THREE.Group();
  const pitch = new THREE.Group();
  const fall = new THREE.Group();
  const lean = new THREE.Group();
  root.add(pitch);
  pitch.add(fall);
  fall.add(lean);
  const meshes = [];
  const add = (parent, geo, m, x = 0, y = 0, z = 0) => {
    const g = own(geo);
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = shadows;
    parent.add(o);
    meshes.push(o);
    return o;
  };

  // --- skis + boots (kept flat on the snow) ----------------------------------------------
  const feet = [];
  for (const side of [1, -1]) {
    const foot = new THREE.Group();
    lean.add(foot);
    // ski: a long plank with a curled tip
    const skiG = new THREE.Group();
    foot.add(skiG);
    add(skiG, new THREE.BoxGeometry(0.1, 0.025, 1.62), mSki, 0, 0.012, 0.08);
    const tip = add(skiG, new THREE.BoxGeometry(0.1, 0.022, 0.2), mSkiSide, 0, 0.05, 0.95);
    tip.rotation.x = -0.5;
    add(skiG, new THREE.BoxGeometry(0.1, 0.02, 0.08), mSkiSide, 0, 0.022, -0.71);
    add(skiG, new THREE.BoxGeometry(0.09, 0.03, 0.3), mBuckle, 0, 0.038, 0.0); // binding
    // boot
    add(foot, new THREE.BoxGeometry(0.13, 0.2, 0.3), mBoot, 0, 0.15, 0.02);
    add(foot, new THREE.BoxGeometry(0.135, 0.04, 0.2), mBuckle, 0, 0.2, 0.03);
    add(foot, new THREE.BoxGeometry(0.14, 0.06, 0.32), mBoot, 0, 0.06, 0.02);
    feet.push({ foot, skiG, side });
  }

  // --- hips, legs ---------------------------------------------------------------------------
  const hips = new THREE.Group();
  lean.add(hips);
  add(hips, new THREE.BoxGeometry(0.34, 0.2, 0.22), mPants, 0, 0, 0);
  const legs = [];
  for (const side of [1, -1]) {
    const thigh = new THREE.Group();
    thigh.position.set(0.1 * side, -0.04, 0);
    hips.add(thigh);
    add(thigh, new THREE.CylinderGeometry(0.085, 0.075, THIGH, 8), mPants, 0, -THIGH / 2, 0);
    const knee = new THREE.Group();
    knee.position.set(0, -THIGH, 0);
    thigh.add(knee);
    add(knee, new THREE.SphereGeometry(0.078, 8, 6), mPants);
    add(knee, new THREE.CylinderGeometry(0.075, 0.07, SHIN, 8), mPants, 0, -SHIN / 2, 0);
    legs.push({ thigh, knee, side });
  }

  // --- torso, head, arms, poles ----------------------------------------------------------------
  const torso = new THREE.Group();
  torso.position.set(0, 0.06, 0);
  hips.add(torso);
  add(torso, new THREE.CapsuleGeometry(0.16, 0.34, 4, 10), mJacket, 0, 0.27, 0).scale.set(1.15, 1, 0.82);
  add(torso, new THREE.BoxGeometry(0.36, 0.08, 0.27), mJacket2, 0, 0.1, 0); // waist band
  add(torso, new THREE.BoxGeometry(0.26, 0.24, 0.02), mBib, 0, 0.3, 0.145); // race bib
  add(torso, new THREE.BoxGeometry(0.06, 0.4, 0.02), mJacket2, 0.13, 0.3, 0.13);
  const neck = new THREE.Group();
  neck.position.set(0, 0.58, 0);
  torso.add(neck);
  add(neck, new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8), mJacket2, 0, 0.02, 0);
  const head = new THREE.Group();
  head.position.set(0, 0.14, 0.01);
  neck.add(head);
  add(head, new THREE.SphereGeometry(0.11, 12, 10), mSkin, 0, 0, 0.0);
  const helmet = add(head, new THREE.SphereGeometry(0.13, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), mHelmet, 0, 0.01, -0.005);
  helmet.scale.set(1, 1.05, 1.12);
  add(head, new THREE.BoxGeometry(0.2, 0.03, 0.06), mHelmet, 0, 0.0, -0.13); // brim back
  add(head, new THREE.BoxGeometry(0.21, 0.08, 0.05), mRim, 0, 0.01, 0.105);
  add(head, new THREE.BoxGeometry(0.19, 0.06, 0.02), mLens, 0, 0.012, 0.132);
  add(head, new THREE.BoxGeometry(0.24, 0.025, 0.2), mRim, 0, 0.01, 0.02); // strap
  const arms = [];
  for (const side of [1, -1]) {
    const sh = new THREE.Group();
    sh.position.set(0.22 * side, 0.48, 0);
    torso.add(sh);
    add(sh, new THREE.SphereGeometry(0.075, 8, 6), mJacket);
    add(sh, new THREE.CylinderGeometry(0.065, 0.06, 0.3, 8), mJacket, 0, -0.15, 0);
    const el = new THREE.Group();
    el.position.set(0, -0.3, 0);
    sh.add(el);
    add(el, new THREE.CylinderGeometry(0.058, 0.05, 0.27, 8), mJacket, 0, -0.135, 0);
    const hand = new THREE.Group();
    hand.position.set(0, -0.29, 0);
    el.add(hand);
    add(hand, new THREE.SphereGeometry(0.058, 8, 6), mGlove);
    // pole: grip in the glove, shaft, basket near the tip
    const pole = new THREE.Group();
    hand.add(pole);
    add(pole, new THREE.CylinderGeometry(0.018, 0.012, 1.18, 6), mPole, 0, -0.55, 0);
    add(pole, new THREE.CylinderGeometry(0.03, 0.026, 0.14, 6), mGlove, 0, 0.02, 0);
    add(pole, new THREE.CylinderGeometry(0.06, 0.06, 0.012, 10), mGlove, 0, -1.04, 0);
    arms.push({ sh, el, hand, pole, side });
  }

  // blob shadow (always: the cheap, readable "where will I land" cue)
  let blob = null;
  if (blobTex) {
    const bm = own(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
    blob = new THREE.Mesh(own(new THREE.PlaneGeometry(1.0, 2.0)), bm);
    blob.renderOrder = 2;
  }

  // --- animation state ----------------------------------------------------------------------
  const P = { crouch: 0, fwd: 0.35, armF: 0.3, armOut: 0.1, poleBack: 0.4, plow: 0, spread: 0, lean: 0, steer: 0, air: 0, victory: 0, fall: 0, tumble: 0, side: 0, raise: 0, plant: 0 };
  const blend = (k, v, rate, dt) => (P[k] += (v - P[k]) * Math.min(1, dt * rate));

  /**
   * s: { speed, tuck (0..1), plow, steer, lean, sharp, air, compress, crash,
   *      hold, pole (phase), slope (pitch rad), victory, t }
   */
  function update(s, dt) {
    const tuck = clamp(s.tuck || 0, 0, 1);
    const race = clamp((tuck - 0.6) / 0.4, 0, 1);
    const air = s.air ? 1 : 0;
    const C = s.crash;
    // posture targets
    let crouch = lerp(0.12, 0.42, Math.min(1, tuck / 0.6)) + race * 0.08;
    let fwd = lerp(0.32, 0.85, Math.min(1, tuck / 0.6)) + race * 0.25;
    let armF = lerp(0.35, 1.25, Math.min(1, tuck / 0.6));
    let armOut = 0.12 - tuck * 0.06;
    let poleBack = lerp(0.35, 1.35, tuck);
    if (s.plow > 0.05) {
      crouch = lerp(crouch, 0.22, s.plow);
      fwd = lerp(fwd, 0.25, s.plow);
      armOut = lerp(armOut, 0.35, s.plow);
      armF = lerp(armF, 0.45, s.plow);
    }
    if (air) {
      crouch = 0.3 + tuck * 0.1;
      armOut = 0.6;
      armF = 0.55;
      fwd = 0.45;
      poleBack = 0.9;
    }
    if (s.hold) {
      crouch = 0.18;
      fwd = 0.45;
      armF = 0.75;
      armOut = 0.28;
      poleBack = 0.15;
    }
    const comp = clamp(-(s.compress || 0) * 0.6, -0.08, 0.22);
    crouch += comp;
    blend("crouch", crouch, 8, dt);
    blend("fwd", fwd, 7, dt);
    blend("armF", armF, 7, dt);
    blend("armOut", armOut, 7, dt);
    blend("poleBack", poleBack, 6, dt);
    blend("plow", s.plow || 0, 10, dt);
    blend("lean", s.lean || 0, 10, dt);
    blend("steer", s.steer || 0, 8, dt);
    blend("air", air, 6, dt);
    blend("victory", s.victory ? 1 : 0, 3, dt);

    // fall: tumble, lie, get up (driven from the crash clock)
    let fallT = 0;
    let rise = 0;
    if (C) {
      const t = C.t;
      fallT = clamp(t / 0.45, 0, 1);
      rise = C.fell ? 0 : clamp((t - 1.5) / 0.8, 0, 1);
      P.tumble = C.fell ? t * 5 : Math.min(t, 0.9) * 7 * (1 - rise);
      P.side = C.spin || 1;
    } else {
      P.tumble *= Math.exp(-dt * 8);
    }
    const down = fallT * (1 - rise);
    fall.rotation.z = P.side * down * 1.35;
    fall.rotation.x = Math.sin(P.tumble) * 0.35 * down;
    fall.position.y = -down * 0.15;

    // slope pitch (skis follow the snow), carve lean (edge angle)
    pitch.rotation.x = s.slope || 0;
    lean.rotation.z = -P.lean * 0.9;

    // skis: wedge for the snowplough, a little steer, inside ski leads in a carve
    const stance = 0.14 + P.plow * 0.12;
    for (const f of feet) {
      const inside = Math.sign(P.lean) === f.side ? 1 : 0;
      f.foot.position.set(f.side * stance, 0, inside * Math.min(0.12, Math.abs(P.lean) * 0.2));
      f.skiG.rotation.y = -f.side * P.plow * 0.36 + P.steer * 0.1;
      f.foot.rotation.z = f.side * P.plow * 0.18; // knees in, edges biting
    }
    // hips over the feet
    const hipY = 0.98 - P.crouch * 0.95;
    hips.position.set(0, hipY, -0.05 - P.fwd * 0.12);
    hips.rotation.y = P.steer * 0.12;
    // legs: 2-bone IK hip → ankle (ankle 0.17 above the ski)
    for (const L of legs) {
      const f = feet.find((x) => x.side === L.side);
      const ax = f.foot.position.x - L.side * 0.1;
      const ay = 0.17 - hipY + 0.04;
      const az = f.foot.position.z - hips.position.z;
      const d = Math.min(THIGH + SHIN - 1e-3, Math.hypot(ay, az));
      const phi = Math.atan2(az, -ay);
      const cA = (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d);
      const cK = (THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN);
      const A = Math.acos(clamp(cA, -1, 1));
      const K = Math.acos(clamp(cK, -1, 1));
      L.thigh.rotation.x = -(phi + A);
      L.thigh.rotation.z = Math.atan2(ax, -ay) * 0.9;
      L.knee.rotation.x = Math.PI - K;
    }
    // torso / head
    torso.rotation.x = P.fwd;
    torso.rotation.z = P.lean * 0.25;
    neck.rotation.x = -P.fwd * 0.85 + P.air * 0.1;
    // arms + poles
    const t = s.t || 0;
    const fidget = s.hold ? Math.sin(t * 1.6) * 0.08 : 0;
    const plant = s.pole ? Math.max(0, Math.sin(s.pole * Math.PI * 2)) : 0;
    for (const a of arms) {
      const v = P.victory;
      const swing = s.hold ? 0 : Math.sin(t * 2 + a.side) * 0.04 * (1 - tuck);
      a.sh.rotation.x = lerp(-P.armF - swing - plant * 0.4 - fidget, -2.9, v);
      a.sh.rotation.z = lerp(a.side * P.armOut, a.side * 0.35, v);
      a.el.rotation.x = lerp(-0.35 - tuck * 0.9, -0.2, v);
      a.hand.rotation.x = lerp(P.poleBack + plant * 0.8 + 0.6, 0.2, v) + P.air * 0.3;
      a.hand.rotation.z = -a.side * (0.05 + P.plow * 0.15);
    }
  }

  function dispose() {
    for (const d of disp) d.dispose?.();
    if (blob) blob.material.dispose();
  }

  return { root, blob, update, dispose, meshes };
}
