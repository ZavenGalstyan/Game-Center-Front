/**
 * Downhill Riders — the bike and rider model (plain Three.js) with a
 * procedural, blended animation rig.
 *
 *   root ── pitch/lean ── spin (360 trick) ── suspension ──┬─ bike (frame,
 *                                                         │  rear wheel,
 *                                                         │  cranks, front
 *                                                         │  assembly: fork,
 *                                                         │  wheel, bars)
 *                                                         └─ rider
 *
 * The rider's legs and arms are 2-bone IK chains: feet stay on the pedals
 * as the cranks turn, hands on the grips as the bars steer. Every pose
 * parameter (crouch, tuck, arm raise, trick angles…) is smoothed, so
 * PEDAL → COAST → LEAN → JUMP → AIR → LAND → TRICK → CRASH → VICTORY blend
 * without pops.
 *
 * Local frame: +z forward, +y up, +x left. Wheel radius 0.36 m, wheelbase
 * 1.2 m; the root sits on the ground under the bottom bracket.
 */
import * as THREE from "three";
import { clamp } from "../engine/rng.js";

const UP = new THREE.Vector3(0, 1, 0);
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 8);
const unitCylLo = new THREE.CylinderGeometry(1, 1, 1, 6);
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitSphere = new THREE.SphereGeometry(1, 12, 9);
const tireGeo = new THREE.TorusGeometry(0.322, 0.06, 8, 30);
const rotorGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.006, 18);
const rimGeo = new THREE.TorusGeometry(0.29, 0.016, 5, 24);
const spokeGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.58, 3);
const SKIN = "#e2b48c";
// tapered limb (thicker at the joint it hangs from), unit length along +Y, centred
const limbGeo = new THREE.CylinderGeometry(0.82, 1, 1, 10);
// torso: a lathe profile — waist, wider ribcage, rounded shoulders (unit height, base at 0)
const torsoGeo = (() => {
  const pts = [[0.01, 0], [0.78, 0.02], [0.82, 0.25], [0.95, 0.55], [1.02, 0.78], [0.9, 0.93], [0.5, 1.0], [0.01, 1.0]].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 14);
})();
// full-face chin bar
const chinGeo = (() => {
  const g = new THREE.TorusGeometry(0.115, 0.032, 6, 14, Math.PI);
  g.rotateX(Math.PI / 2);
  g.rotateY(Math.PI);
  g.scale(1, 1, 1.25);
  return g;
})();
const padGeo = new THREE.BoxGeometry(0.12, 0.17, 0.05);

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();

function limb(mesh, A, B, r) {
  tmpA.subVectors(B, A);
  const len = tmpA.length();
  mesh.position.addVectors(A, B).multiplyScalar(0.5);
  if (len > 1e-5) mesh.quaternion.setFromUnitVectors(UP, tmpA.multiplyScalar(1 / len));
  mesh.scale.set(r, Math.max(1e-3, len), r);
}

/** Two-bone IK: joint position for root A reaching target T, bending toward `bend`. */
function ik(A, T, l1, l2, bend, out) {
  tmpB.subVectors(T, A);
  let d = tmpB.length();
  const maxD = l1 + l2 - 1e-3;
  if (d > maxD) d = maxD;
  if (d < 0.05) d = 0.05;
  tmpB.normalize();
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  tmpC.copy(bend).addScaledVector(tmpB, -bend.dot(tmpB)).normalize();
  out.copy(A).addScaledVector(tmpB, l1 * cosA).addScaledVector(tmpC, l1 * sinA);
  return out;
}

const ease = (t) => t * t * (3 - 2 * t);

export function createRider(colors, opts = {}) {
  const mats = [];
  const M = (color, extra = {}) => {
    const m = new THREE.MeshLambertMaterial({ color, ...extra });
    mats.push(m);
    return m;
  };
  const mFrame = M(colors.frame);
  const mAccent = M(colors.accent);
  const mRim = M(colors.rim);
  const mTire = M(colors.tire);
  const mJersey = M(colors.jersey);
  const mJersey2 = M(colors.jersey2);
  const mPants = M(colors.pants);
  const mGloves = M(colors.gloves);
  const mShoes = M(colors.shoes);
  const mHelmet = M(colors.helmet);
  const mVisor = M(colors.visor);
  const mSkin = M(SKIN);
  const mDark = M("#26272c");
  const mChrome = M("#c9ced6");
  const mLens = new THREE.MeshPhongMaterial({ color: "#ff9a2a", emissive: "#552200", shininess: 120, specular: "#ffffff" });
  mats.push(mLens);
  const mSole = M("#e8e4dc");
  const shadows = !!opts.shadows;

  const root = new THREE.Group();
  const tilt = new THREE.Group(); // pitch + lean
  const spin = new THREE.Group(); // 360
  const susp = new THREE.Group();
  const bike = new THREE.Group();
  const riderG = new THREE.Group();
  root.add(tilt);
  tilt.add(spin);
  spin.add(susp);
  susp.add(bike, riderG);

  const mesh = (geo, mat, parent, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadows && cast;
    parent.add(m);
    return m;
  };
  const tube = (A, B, r, mat, parent) => {
    const m = mesh(unitCylLo, mat, parent);
    limb(m, A, B, r);
    return m;
  };
  const v = (x, y, z) => new THREE.Vector3(x, y, z);

  // --- bike -------------------------------------------------------------------------
  const BB = v(0, 0.34, -0.04);
  const rearAx = v(0, 0.36, -0.62);
  const seatTop = v(0, 0.86, -0.22);
  const headTop = v(0, 0.97, 0.44);
  const headBot = v(0, 0.8, 0.5);
  tube(BB, headBot, 0.032, mFrame, bike); // down tube
  tube(seatTop, headTop, 0.026, mFrame, bike); // top tube
  tube(BB, seatTop, 0.026, mFrame, bike); // seat tube
  tube(BB, rearAx, 0.018, mFrame, bike); // chainstays
  tube(v(0, 0.8, -0.2), rearAx, 0.015, mFrame, bike); // seatstays
  tube(headBot, headTop, 0.036, mFrame, bike); // head tube
  tube(v(0, 0.52, 0.12), v(0, 0.72, -0.08), 0.03, mAccent, bike); // shock body
  tube(v(0, 0.86, -0.22), v(0, 1.0, -0.27), 0.014, mDark, bike); // seat post
  const seat = mesh(unitBox, mDark, bike);
  seat.scale.set(0.12, 0.04, 0.27);
  seat.position.set(0, 1.02, -0.28);
  // chainring
  const ring = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 14), mChrome, bike);
  ring.rotation.z = Math.PI / 2;
  ring.position.copy(BB).x = -0.05;
  // rear wheel
  const wheel = () => {
    const g = new THREE.Group();
    mesh(tireGeo, mTire, g).rotation.y = Math.PI / 2;
    mesh(rimGeo, mRim, g).rotation.y = Math.PI / 2;
    for (let k = 0; k < 6; k++) {
      const s = mesh(spokeGeo, mChrome, g, false);
      s.rotation.x = (k / 6) * Math.PI;
    }
    const rotor = mesh(rotorGeo, mChrome, g, false);
    rotor.rotation.z = Math.PI / 2;
    rotor.position.x = 0.055;
    const hub = mesh(unitCyl, mDark, g, false);
    hub.scale.set(0.035, 0.12, 0.035);
    hub.rotation.z = Math.PI / 2;
    return g;
  };
  const rearW = wheel();
  rearW.position.copy(rearAx);
  bike.add(rearW);
  // front assembly turns about the head tube
  const steerAxis = new THREE.Group();
  steerAxis.position.copy(headBot);
  steerAxis.rotation.x = -0.3; // head angle
  bike.add(steerAxis);
  const front = new THREE.Group();
  steerAxis.add(front);
  // fork & wheel in the steer frame (axle 0.48 below / ahead)
  const axleLocal = v(0, -0.47, 0.0);
  const frontW = wheel();
  frontW.position.copy(axleLocal);
  front.add(frontW);
  for (const sx of [0.06, -0.06]) {
    tube(v(sx, 0.02, 0), v(sx, -0.24, 0), 0.022, mChrome, front);
    tube(v(sx, -0.24, 0), v(sx, -0.47, 0), 0.02, mDark, front);
  }
  tube(v(0, 0.0, 0), v(0, 0.22, 0), 0.03, mDark, front); // steerer
  tube(v(0, 0.22, 0), v(0, 0.25, 0.07), 0.025, mDark, front); // stem
  const barL = v(0.38, 0.26, 0.06);
  const barR = v(-0.38, 0.26, 0.06);
  tube(barL, barR, 0.014, mDark, front);
  for (const g of [barL, barR]) {
    const grip = mesh(unitCyl, mDark, front);
    grip.scale.set(0.02, 0.1, 0.02);
    grip.rotation.z = Math.PI / 2;
    grip.position.copy(g);
  }
  // chain (top and bottom runs) and rear brake caliper
  tube(v(-0.05, 0.43, -0.04), v(-0.05, 0.4, -0.62), 0.008, mDark, bike);
  tube(v(-0.05, 0.25, -0.04), v(-0.05, 0.32, -0.62), 0.008, mDark, bike);
  const caliper = mesh(unitBox, mDark, bike);
  caliper.scale.set(0.03, 0.05, 0.07);
  caliper.position.set(0.07, 0.42, -0.55);
  // cranks + pedals
  const cranks = new THREE.Group();
  cranks.position.copy(BB);
  bike.add(cranks);
  const crankArms = [];
  const pedals = [];
  for (const side of [1, -1]) {
    const arm = mesh(unitBox, mChrome, cranks);
    arm.scale.set(0.02, 0.17, 0.03);
    crankArms.push(arm);
    const ped = mesh(unitBox, mDark, cranks);
    ped.scale.set(0.09, 0.02, 0.1);
    pedals.push(ped);
    arm.userData.side = side;
  }

  // --- rider (≈1.78 m, downhill kit: full-face helmet, goggles, long-sleeve
  // jersey, hydration pack, gloves, long pants with knee pads, flat shoes) ----
  const torso = mesh(torsoGeo, mJersey, riderG);
  const stripe = mesh(torsoGeo, mJersey2, riderG);
  const pack = mesh(unitBox, mDark, riderG);
  const packStrapL = mesh(unitBox, mAccent, riderG);
  const packStrapR = mesh(unitBox, mAccent, riderG);
  const pelvis = mesh(unitSphere, mPants, riderG);
  const neck = mesh(limbGeo, mSkin, riderG);
  const head = new THREE.Group();
  riderG.add(head);
  const helmet = mesh(unitSphere, mHelmet, head);
  helmet.scale.set(0.135, 0.14, 0.158);
  const chin = mesh(chinGeo, mHelmet, head);
  chin.position.set(0, -0.075, 0.035);
  const vent = mesh(unitBox, mAccent, head);
  vent.scale.set(0.05, 0.02, 0.06);
  vent.position.set(0, -0.08, 0.17);
  const goggles = mesh(unitBox, mVisor, head);
  goggles.scale.set(0.19, 0.062, 0.05);
  goggles.position.set(0, 0.005, 0.138);
  const lens = mesh(unitBox, mLens, head);
  lens.scale.set(0.17, 0.045, 0.01);
  lens.position.set(0, 0.006, 0.165);
  const gStrap = mesh(unitBox, mAccent, head);
  gStrap.scale.set(0.275, 0.03, 0.2);
  gStrap.position.set(0, 0.01, 0.0);
  const peak = mesh(unitBox, mHelmet, head);
  peak.scale.set(0.2, 0.018, 0.11);
  peak.position.set(0, 0.085, 0.165);
  peak.rotation.x = -0.28;
  const L = { thigh: [], shin: [], knee: [], kneePad: [], foot: [], sole: [], shoulder: [], upper: [], elbow: [], fore: [], hand: [], fingers: [] };
  for (let k = 0; k < 2; k++) {
    L.thigh.push(mesh(limbGeo, mPants, riderG));
    L.shin.push(mesh(limbGeo, mPants, riderG));
    L.knee.push(mesh(unitSphere, mPants, riderG));
    L.kneePad.push(mesh(padGeo, mDark, riderG));
    L.foot.push(mesh(unitBox, mShoes, riderG));
    L.sole.push(mesh(unitBox, mSole, riderG));
    L.shoulder.push(mesh(unitSphere, mJersey, riderG));
    L.upper.push(mesh(limbGeo, mJersey, riderG));
    L.elbow.push(mesh(unitSphere, mJersey2, riderG));
    L.fore.push(mesh(limbGeo, mJersey2, riderG));
    L.hand.push(mesh(unitBox, mGloves, riderG));
    L.fingers.push(mesh(unitBox, mGloves, riderG));
  }
  // blob shadow (separate, placed on the ground by the caller)
  const blob = opts.blobTex
    ? new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.0), new THREE.MeshBasicMaterial({ map: opts.blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }))
    : null;
  if (blob) {
    blob.rotation.x = -Math.PI / 2;
    blob.renderOrder = 2;
    mats.push(blob.material);
  }

  // --- pose state (smoothed) ---------------------------------------------------------------
  const P = { crouch: 0, tuck: 0, armUp: 0, crankA: 0, steer: 0, lean: 0, pitch: 0, whip: 0, table: 0, bar: 0, spin: 0, standing: 0, crash: 0, back: 0, speed: 0 };
  const hipW = 0.105;
  const shW = 0.2;
  const THIGH = 0.45;
  const SHIN = 0.45;
  const UPPER = 0.31;
  const FORE = 0.3;
  const pedPos = [new THREE.Vector3(), new THREE.Vector3()];
  const knee = new THREE.Vector3();
  const elbow = new THREE.Vector3();
  const hip = new THREE.Vector3();
  const sh = new THREE.Vector3();
  const grip = new THREE.Vector3();
  const foot = new THREE.Vector3();
  const pelvisC = new THREE.Vector3();
  const chest = new THREE.Vector3();
  const headC = new THREE.Vector3();
  const tmpE = new THREE.Euler();
  const tmpQ = new THREE.Quaternion();
  const bendKnee = new THREE.Vector3();
  const bendElbow = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const bk = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();

  /**
   * s: { speed, pedal (rad), pedaling, braking, steer (−1..1), lean, pitch,
   *      air, compress, trick: {kind,p,dir}|null, crash: {t,fell}|null,
   *      victory (0..1), stand (bool), wheelSpin }
   */
  function update(s, dt) {
    const k = (rate) => Math.min(1, dt * rate);
    const air = !!s.air;
    const tr = s.trick;
    const C = s.crash;
    P.speed += ((s.speed || 0) - P.speed) * k(3);
    // attack position: lower and tighter as speed rises, legs soak up the hits
    const speedTuck = clamp((P.speed - 12) / 16, 0, 1);
    const crouchT = (air ? 0.5 : 0.22 + clamp(s.compress, -0.3, 1) * 0.7) + speedTuck * 0.28;
    P.crouch += (crouchT - P.crouch) * k(10);
    P.tuck += ((air ? 1 : 0) - P.tuck) * k(6);
    P.back += ((s.braking ? 1 : 0) - P.back) * k(6);
    P.armUp += ((s.victory || 0) - P.armUp) * k(4);
    P.steer += ((s.steer || 0) - P.steer) * k(10);
    P.lean += ((s.lean || 0) - P.lean) * k(12);
    P.pitch += ((s.pitch || 0) - P.pitch) * k(air ? 4 : 10);
    P.standing += ((s.stand ? 1 : 0) - P.standing) * k(5);
    P.crash += ((C ? 1 : 0) - P.crash) * k(C ? 8 : 3);
    // tricks: authored curves that return to neutral by p = 1
    let whipT = 0;
    let tableT = 0;
    let barT = 0;
    let spinT = 0;
    if (tr) {
      const p = clamp(tr.p, 0, 1);
      const bell = Math.sin(p * Math.PI);
      if (tr.kind === "whip") whipT = bell * tr.dir;
      if (tr.kind === "tabletop") tableT = bell;
      if (tr.kind === "barspin") barT = ease(p) * Math.PI * 2;
      if (tr.kind === "spin") spinT = ease(p) * Math.PI * 2 * tr.dir;
    }
    P.whip += (whipT - P.whip) * k(18);
    P.table += (tableT - P.table) * k(18);
    P.bar = barT; // exact, wraps to 0
    P.spin = spinT;

    // cranks: turn when pedalling, level out when coasting
    if (s.pedaling) P.crankA = s.pedal * 2;
    else {
      const lvl = Math.round((P.crankA - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
      P.crankA += (lvl - P.crankA) * k(6);
    }
    cranks.rotation.x = P.crankA;
    crankArms.forEach((arm, i) => {
      const a = i === 0 ? 0 : Math.PI;
      const side = arm.userData.side;
      arm.position.set(side * 0.085, Math.cos(a) * 0.085, Math.sin(a) * 0.085);
      arm.rotation.x = a;
      pedals[i].position.set(side * 0.13, Math.cos(a) * 0.17, Math.sin(a) * 0.17);
      pedals[i].rotation.x = -P.crankA;
    });
    const spinRate = s.wheelSpin ?? 0;
    rearW.rotation.x = spinRate;
    frontW.rotation.x = spinRate;
    front.rotation.y = P.steer * 0.32 + P.bar;

    // body attitude: the bike leans into the turn, the rider stays more upright
    tilt.rotation.set(P.pitch, 0, P.lean * (1 - P.standing));
    spin.rotation.y = P.spin;
    susp.position.y = -clamp(s.compress, -0.3, 1) * 0.07;
    // whip / tabletop act on the bike under the rider; in the air the bike is pulled up
    bike.rotation.set(-P.tuck * 0.06, P.whip * 0.9, P.whip * 0.35 + P.table * 1.15);
    bike.position.set(P.table * 0.12, P.table * 0.1 + P.tuck * 0.08, 0);

    // --- rider pose ---------------------------------------------------------------------
    bike.updateMatrix();
    const pedalRock = s.pedaling && !air ? Math.sin(P.crankA) : 0;
    const upright = 1 - P.standing;
    riderG.position.set(-P.lean * 0.12 * upright + pedalRock * 0.025, 0, 0);
    riderG.rotation.set(C ? 0 : 0, 0, -P.lean * 0.45 * upright + P.table * 0.25 + pedalRock * 0.04);
    for (let i = 0; i < 2; i++) {
      const ped = pedals[i];
      tmpD.copy(ped.position).applyEuler(cranks.rotation).add(cranks.position);
      pedPos[i].copy(tmpD).applyMatrix4(bike.matrix);
    }
    const st = P.standing;
    const cr = P.crouch;
    // hips hang back over the rear wheel (more under braking), chest low over the bars
    pelvisC.set(0, 1.0 - cr * 0.2 - P.tuck * 0.08 + Math.abs(pedalRock) * 0.03, -0.24 - cr * 0.08 - P.back * 0.14);
    chest.set(0, pelvisC.y + 0.4 - cr * 0.12 + P.back * 0.04, pelvisC.z + 0.32 + cr * 0.06 - P.back * 0.06);
    if (st > 0.01) {
      // standing beside the bike (menu)
      pelvisC.lerp(v1.set(0.62, 0.96, -0.05), st);
      chest.lerp(v2.set(0.63, 1.46, 0.0), st);
    }
    // crash: thrown forward, tumbling
    let tumble = 0;
    if (C) {
      const t = C.t;
      tumble = t * (C.fell ? 6 : 9) * Math.exp(-t * (C.fell ? 0.3 : 1.2));
      const fly = Math.min(t, 0.8);
      pelvisC.z += fly * 1.6 + 0.2;
      pelvisC.y += Math.max(0, 0.7 * Math.sin(Math.min(t, 0.6) * 5)) - (C.fell ? 0 : Math.min(t, 0.8) * 0.9);
      chest.z += fly * 1.8 + 0.25;
      chest.y = pelvisC.y + 0.3;
    }
    riderG.rotation.x = tumble;
    // torso (lathe: waist → ribcage → shoulders)
    v1.subVectors(chest, pelvisC);
    const tl = v1.length();
    fwd.copy(v1).normalize();
    tmpQ.setFromUnitVectors(UP, fwd);
    bk.set(0, 0, -1).applyQuaternion(tmpQ);
    torso.position.copy(pelvisC).addScaledVector(fwd, -0.04);
    torso.quaternion.copy(tmpQ);
    torso.scale.set(0.2, tl + 0.12, 0.145);
    stripe.position.copy(pelvisC).addScaledVector(fwd, tl * 0.5);
    stripe.quaternion.copy(tmpQ);
    stripe.scale.set(0.207, (tl + 0.12) * 0.16, 0.152);
    // hydration pack on the back, straps over the chest
    pack.position.copy(pelvisC).addScaledVector(fwd, tl * 0.6).addScaledVector(bk, 0.15);
    pack.quaternion.copy(tmpQ);
    pack.scale.set(0.24, 0.32, 0.09);
    [packStrapL, packStrapR].forEach((strap, j) => {
      strap.position.copy(pelvisC).addScaledVector(fwd, tl * 0.72);
      strap.position.x += (j ? -1 : 1) * 0.085;
      strap.quaternion.copy(tmpQ);
      strap.scale.set(0.035, 0.32, 0.31);
    });
    pelvis.position.copy(pelvisC);
    pelvis.quaternion.copy(tmpQ);
    pelvis.scale.set(0.17, 0.13, 0.13);
    // head: held level, eyes up the trail and into the turn
    headC.copy(chest).addScaledVector(fwd, 0.12);
    headC.y += 0.12;
    headC.z += 0.05;
    limb(neck, chest, headC, 0.05);
    head.position.copy(headC);
    head.position.y += 0.06;
    tmpE.set(-0.1 + cr * 0.25 - P.pitch * 0.6 - st * 0.1, P.steer * 0.35 + st * 0.5, -P.lean * 0.3 * upright);
    head.quaternion.setFromEuler(tmpE);
    // legs (knees out a little, pads on)
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      hip.set(pelvisC.x + side * hipW, pelvisC.y - 0.02, pelvisC.z);
      if (st > 0.5) foot.set(0.62 + side * 0.13, 0.06, -0.05 + side * 0.08);
      else if (C) foot.set(side * 0.2, pelvisC.y - 0.75, pelvisC.z + 0.2 + Math.sin(C.t * 7 + i) * 0.2);
      else foot.copy(pedPos[i]).add(v1.set(side * 0.01, 0.05, 0));
      bendKnee.set(side * 0.35, 0.1, 1);
      ik(hip, foot, THIGH, SHIN, bendKnee, knee);
      limb(L.thigh[i], hip, knee, 0.085);
      limb(L.shin[i], knee, foot, 0.06);
      L.knee[i].position.copy(knee);
      L.knee[i].scale.setScalar(0.068);
      // knee pad on the front of the knee, along the shin
      v1.subVectors(foot, knee).normalize();
      v2.subVectors(hip, knee).normalize();
      v3.addVectors(v1, v2).normalize().multiplyScalar(-1);
      L.kneePad[i].position.copy(knee).addScaledVector(v3, 0.045).addScaledVector(v1, 0.04);
      L.kneePad[i].quaternion.setFromUnitVectors(UP, v1);
      L.foot[i].position.copy(foot).add(v1.set(0, 0.035, 0.04));
      L.foot[i].scale.set(0.105, 0.07, 0.27);
      L.sole[i].position.copy(foot).add(v1.set(0, -0.005, 0.04));
      L.sole[i].scale.set(0.11, 0.022, 0.28);
    }
    // arms: elbows out and bent (ready to absorb), hands wrapped on the grips
    front.updateMatrixWorld(true);
    riderG.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      sh.copy(chest).addScaledVector(fwd, -0.04);
      sh.x += side * shW;
      L.shoulder[i].position.copy(sh);
      L.shoulder[i].scale.setScalar(0.07);
      tmpD.copy(i === 0 ? barL : barR);
      front.localToWorld(tmpD);
      riderG.worldToLocal(tmpD);
      grip.copy(tmpD);
      const freeHands = P.bar > 0.3 && P.bar < Math.PI * 2 - 0.3;
      if (freeHands) grip.set(side * 0.42, chest.y + 0.05, chest.z + 0.25);
      if (st > 0.5 && i === 0) grip.set(0.84, 0.92, 0.02);
      if (C) grip.set(side * 0.5, chest.y + 0.3 * Math.sin(C.t * 6 + i), chest.z + 0.3);
      const up = P.armUp * (i === 0 ? 1 : opts.bothArms ? 1 : 0.0);
      if (up > 0.01) grip.lerp(v2.set(sh.x + side * 0.15, sh.y + 0.62, sh.z + 0.05), up);
      bendElbow.set(side * 1.0, -0.15, -0.35);
      ik(sh, grip, UPPER, FORE, bendElbow, elbow);
      limb(L.upper[i], sh, elbow, 0.055);
      limb(L.fore[i], elbow, grip, 0.045);
      L.elbow[i].position.copy(elbow);
      L.elbow[i].scale.setScalar(0.055);
      v1.subVectors(grip, elbow).normalize();
      L.hand[i].position.copy(grip);
      L.hand[i].quaternion.setFromUnitVectors(UP, v1);
      L.hand[i].scale.set(0.085, 0.09, 0.05);
      L.fingers[i].position.copy(grip).addScaledVector(v1, 0.04);
      L.fingers[i].position.y -= 0.025;
      L.fingers[i].quaternion.copy(L.hand[i].quaternion);
      L.fingers[i].scale.set(0.08, 0.05, 0.06);
    }
  }

  function dispose() {
    for (const m of mats) m.dispose();
    ring.geometry.dispose();
    if (blob) blob.geometry.dispose();
  }

  update({ speed: 0, pedal: 0, steer: 0, lean: 0, pitch: 0, compress: 0 }, 1);
  return { root, update, dispose, blob, bike, riderG };
}
