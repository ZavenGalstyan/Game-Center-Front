/**
 * The procedural 3D doll.
 *
 * buildDoll(spec) assembles a doll of one of the eight types from its body
 * plan: a revolved torso, a deformed-sphere head with a paintable face
 * texture, tapered limbs on sockets, glass / button / painted eyes, a hair
 * system, the outfit, shoes, accessories and buttons — then lays the
 * order's damage onto it as real visual states:
 *   grime (per-vertex dust/dirt/stain), crack lines, scratches, torn fabric
 *   with stitch paths, broken limbs/eyes/accessories, missing buttons and
 *   shoes, tangled or missing hair and faded face paint.
 *
 * The session (engine/session.js) reads `grime`, `cracks`, `scratches`,
 * `tears`, `sockets`, `hair` and drives the setters below as the player
 * works. Everything lives in doll-root space (feet at the origin, facing +Z).
 * Runs headless too (no textures) so the logic can be tested in node.
 */
import * as THREE from "three";
import { revolve, profile, tube, sphereish, addGrime, dirAE, V3 } from "./geo.js";
import { surfaceMat, mat } from "./materials.js";
import { furTex, furBump, woodTex, fabricTex } from "./textures.js";
import { createFace } from "./face.js";
import { buildHair, hairlineEl } from "./hair.js";
import { buildOutfit, disposeGroup } from "./outfits.js";
import { buildEye, buildButton, buildShoe, buildAccessory, accessoryMount } from "./parts.js";
import { DOLL_TYPES, HAIR_COLORS, sanitizeLook, PAINT_COLORS } from "../data/dolls.js";
import { PARTS } from "../data/items.js";
import { bodyPlan, torsoPoints } from "../engine/plan.js";
import { mulberry, fbm3, smooth, clamp } from "../engine/rng.js";
import { hexRgb } from "./face.js";

const tmpV = new THREE.Vector3();

/* --------------------------------------------------------------- the head */
function headDeform(plan) {
  const hr = plan.hr;
  const chub = DOLL_TYPES[plan.type].prop.chub;
  const eyes = [dirAE(plan.eyeAz, plan.eyeEl), dirAE(-plan.eyeAz, plan.eyeEl)];
  const nose = dirAE(0, plan.eyeEl - 0.22);
  const cheeks = [dirAE(0.55, plan.eyeEl - 0.3), dirAE(-0.55, plan.eyeEl - 0.3)];
  const teddy = plan.kind === "teddy";
  const puppet = plan.kind === "puppet";
  const cloth = plan.kind === "cloth";
  const gauss = (d, w) => Math.exp(-(d * d) / (w * w));
  return (dir, out) => {
    let bump = 0;
    if (!teddy) {
      for (const e of eyes) if (!cloth && !puppet) bump -= 0.05 * gauss(dir.distanceTo(e), 0.16);
      if (!cloth && !puppet) bump += (0.07 - chub * 0.035) * gauss(dir.distanceTo(nose), 0.1);
      for (const c of cheeks) bump += (0.035 + chub * 0.05) * gauss(dir.distanceTo(c), 0.42);
    }
    out.copy(dir).multiplyScalar(1 + bump);
    out.y *= teddy ? 0.94 : 1.04;
    if (out.z < 0) out.z *= teddy ? 1.0 : 1.05;
    if (!teddy) {
      const chin = smooth(-0.1, -0.95, dir.y);
      out.x *= 1 - (0.16 - chub * 0.1) * chin;
      if (dir.z > 0) out.z *= 1 - 0.06 * chin;
    } else {
      out.x *= 1.04;
    }
    return out.multiplyScalar(hr);
  };
}

/* ------------------------------------------------------------- limb curves */
function armCurve(plan, side) {
  // side +1 = doll's left (+X), -1 = right
  const L = plan.armLen;
  if (plan.kind === "teddy") {
    const S = V3(side * plan.shoulderX, plan.shoulderY, 0.015);
    const rel = [V3(0, 0, 0), V3(side * 0.035, -0.07, 0.04), V3(side * 0.055, -0.13, 0.08), V3(side * 0.06, -0.165, 0.11)];
    return mk(S, rel, plan.armR0, plan.armR1);
  }
  const S = V3(side * plan.shoulderX, plan.shoulderY - plan.armR0 * 0.85, 0);
  const baby = plan.kind === "baby";
  const rel = baby
    ? [V3(0, 0, 0), V3(side * 0.018, -L * 0.42, 0.01), V3(side * 0.024, -L * 0.7, 0.05), V3(side * 0.016, -L * 0.88, 0.1)]
    : [V3(0, 0, 0), V3(side * 0.014, -L * 0.3, 0.002), V3(side * 0.024, -L * 0.55, 0.01), V3(side * 0.026, -L * 0.78, 0.028), V3(side * 0.02, -L * 0.96, 0.045)];
  return mk(S, rel, plan.armR0, plan.armR1);
}

function legCurve(plan, side) {
  if (plan.kind === "teddy") {
    const S = V3(side * plan.legX, plan.hipY, 0.05);
    const rel = [V3(0, 0, 0), V3(side * 0.012, -0.02, 0.07), V3(side * 0.02, -0.03, 0.15)];
    return mk(S, rel, plan.legR0, plan.legR1);
  }
  const S = V3(side * plan.legX, plan.hipY, 0);
  const L = plan.legLen;
  const rel = [V3(0, 0, 0), V3(side * 0.002, -L * 0.3, 0.004), V3(side * 0.003, -L * 0.52, 0.008), V3(side * 0.003, -L * 0.78, 0.002), V3(side * 0.002, -L, -0.004)];
  return mk(S, rel, plan.legR0, plan.legR1);
}

function mk(S, rel, r0, r1) {
  const points = rel.map((p) => p.clone().add(S));
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  return {
    S,
    rel,
    points: curve.getSpacedPoints(16),
    curve,
    radius: (t) => r0 + (r1 - r0) * t,
    dirAt: (t) => curve.getTangentAt(clamp(t, 0, 1)).normalize(),
  };
}

/* ------------------------------------------------------------- materials */
function skinMaterial(plan, hex, faceTex = null) {
  const T = DOLL_TYPES[plan.type];
  const map = faceTex || null;
  const color = faceTex ? "#ffffff" : hex;
  switch (plan.kind) {
    case "teddy":
      return surfaceMat("plush", hex, { map: furTex(), bump: furBump() });
    case "puppet":
      return surfaceMat("wood", color, { map: map || woodTex("light") });
    case "cloth":
      return surfaceMat("cloth", color, { map: map || fabricTex("cotton") });
    case "bjd":
      return surfaceMat("resin", color, { map, gloss: T.skinGloss });
    default:
      return surfaceMat(plan.type === "porcelain" ? "porcelain" : "vinyl", color, { map, gloss: T.skinGloss });
  }
}

/* ===================================================================== */
export function buildDoll(specIn, { headless = typeof document === "undefined" } = {}) {
  const spec = { ...specIn, look: sanitizeLook(specIn.type, specIn.look) };
  const type = spec.type;
  const T = DOLL_TYPES[type];
  const plan = bodyPlan(type);
  const look = spec.look;
  const seed = spec.seed || 1;
  const rand = mulberry(seed);
  const root = new THREE.Group();
  root.name = "doll";
  const hc = V3(...plan.headC);
  const deform = headDeform(plan);
  const head = {
    c: hc,
    surf: (dir, lift = 0) => deform(dir, new THREE.Vector3()).add(hc).addScaledVector(dir, lift),
  };
  const dmg = spec.damage || [];
  const has = (k) => dmg.some((d) => d.kind === k);
  const disposables = [];

  const model = {
    root,
    spec,
    plan,
    type,
    look,
    head,
    pickables: [],
    grime: [],
    sockets: {},
    cracks: [],
    scratches: [],
    tears: [],
    buttons: [],
    patches: [],
    hair: null,
    face: null,
    parts: {},
    gloss: 0,
    shine: [],
  };

  /* --------------------------------------------------------------- torso */
  const tp = torsoPoints(plan);
  const skinHex = spec.skin || T.skin;
  const bodyMat = skinMaterial(plan, skinHex);
  const torsoGeo = addGrime(revolve(profile(tp.pts, 4), { segs: 40, squash: tp.squash, capBottom: true }));
  const torso = new THREE.Mesh(torsoGeo, bodyMat);
  torso.castShadow = torso.receiveShadow = true;
  torso.userData = { part: "torso", grime: true };
  root.add(torso);
  model.parts.torso = torso;
  if (plan.kind === "teddy") {
    // lighter belly patch + seams
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18, -0.9, 1.8, 0.5, 1.9), surfaceMat("plush", new THREE.Color(skinHex).offsetHSL(0, -0.05, 0.12).getStyle(), { map: furTex(), bump: furBump(), grime: false }));
    belly.scale.set(0.168 * 1.02, 0.19, 0.168 * tp.squash * 1.03);
    belly.position.y = 0.17;
    belly.rotation.y = 0;
    belly.userData.part = "torso";
    root.add(belly);
    model.pickables.push(belly);
  }
  if (plan.kind === "puppet") {
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(plan.neckR, plan.neckR * 1.1, plan.shoulderY - plan.neckTop + plan.hr * 0.2, 12), bodyMat);
    neck.position.y = (plan.shoulderY + plan.neckTop) / 2;
    root.add(neck);
  }

  /* ---------------------------------------------------------------- head */
  let face = null;
  if (!headless && plan.kind !== "teddy") face = createFace(plan, skinHex);
  model.face = face;
  const headGeo = addGrime(sphereish(plan.hr, deform, 64, 48));
  const headMat = skinMaterial(plan, skinHex, face ? face.texture : null);
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.position.copy(hc);
  headMesh.castShadow = headMesh.receiveShadow = true;
  headMesh.userData = { part: "head", grime: true };
  root.add(headMesh);
  model.parts.head = headMesh;

  if (plan.kind === "teddy") buildTeddyFace(model, plan, hc, skinHex);
  if (plan.kind === "puppet") {
    const nose = new THREE.Mesh(tube([V3(0, 0, 0), V3(0, -0.002, plan.hr * 0.22)], (t) => plan.hr * (0.09 - t * 0.02), { radial: 10, tubular: 3 }), bodyMat);
    nose.position.copy(head.surf(dirAE(0, plan.eyeEl - 0.2), -0.002));
    nose.userData.part = "head";
    root.add(nose);
    model.pickables.push(nose);
  }
  // ears (humans, mostly hidden by hair)
  if (plan.kind !== "teddy") {
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(plan.hr * 0.17, 14, 10), bodyMat);
      ear.scale.set(0.45, 1, 0.8);
      ear.position.copy(head.surf(dirAE(s * 1.55, plan.eyeEl - 0.05), -plan.hr * 0.05));
      ear.userData.part = "head";
      root.add(ear);
      model.pickables.push(ear);
    }
  }

  /* ---------------------------------------------------------------- eyes */
  const eyeKind = T.eyes;
  model.eyeColor = { L: look.eyeColor, R: look.eyeColor };
  const placeEye = (side, { color, broken }) => {
    const id = side > 0 ? "eyeL" : "eyeR";
    const old = model.parts[id];
    if (old) {
      root.remove(old);
      disposeGroup(old);
    }
    if (eyeKind === "painted") return null;
    const dir = dirAE(side * plan.eyeAz, plan.eyeEl);
    const lift = eyeKind === "button" ? plan.eyeR * 0.15 : -plan.eyeR * 0.45;
    const pos = head.surf(dir, lift);
    const eye = buildEye(plan, { kind: eyeKind, color, broken, skinHex, lid: plan.kind === "baby" ? 0.38 : 0.22 });
    eye.position.copy(pos);
    eye.lookAt(pos.clone().add(dir).add(V3(-side * 0.05, 0, 0)));
    if (broken) {
      eye.rotateY(side * 0.55);
      eye.rotateX(-0.35);
    }
    eye.traverse((m) => {
      if (m.isMesh) {
        m.userData.part = id;
        model.pickables.push(m);
      }
    });
    root.add(eye);
    model.parts[id] = eye;
    model.sockets[id] = { id, kind: "eye", side: side > 0 ? "L" : "R", pos: pos.clone(), axis: V3(0, 1, 0), forward: dir.clone(), open: false };
    return eye;
  };
  for (const side of [1, -1]) {
    const s = side > 0 ? "L" : "R";
    placeEye(side, { color: look.eyeColor, broken: dmg.some((d) => d.kind === "eye" && d.side === s) });
  }
  model.placeEye = placeEye;

  /* --------------------------------------------------------------- limbs */
  const curves = { armL: armCurve(plan, 1), armR: armCurve(plan, -1), legL: legCurve(plan, 1), legR: legCurve(plan, -1) };
  model.curves = curves;
  const buildLimb = (id, { broken = false, planOverride = null, forSide = null } = {}) => {
    const P = planOverride || plan;
    const side = forSide ?? (id.endsWith("L") ? 1 : -1);
    const isArm = id.startsWith("arm");
    const c = isArm ? armCurve(P, side) : legCurve(P, side);
    const grp = new THREE.Group();
    const mt = planOverride ? skinMaterial(P, DOLL_TYPES[P.type].skin) : bodyMat;
    const mtl = broken ? mt.clone() : mt;
    if (broken) {
      mtl.color = mtl.color.clone().lerp(new THREE.Color("#8d857c"), 0.35);
      mtl.onBeforeCompile = mt.onBeforeCompile;
      mtl.customProgramCacheKey = mt.customProgramCacheKey;
    }
    const rel = c.rel;
    const jointed = P.jointed;
    const teddyLimb = P.kind === "teddy";
    const r0 = isArm ? P.armR0 : P.legR0;
    const r1 = isArm ? P.armR1 : P.legR1;
    const radius = (t) => {
      let r = r0 + (r1 - r0) * t;
      if (!isArm && !teddyLimb) r += r0 * 0.18 * Math.exp(-(((t - 0.62) / 0.13) ** 2)) - r0 * 0.12 * Math.exp(-(((t - 0.5) / 0.05) ** 2));
      if (isArm && !teddyLimb) r += r0 * 0.08 * Math.exp(-(((t - 0.25) / 0.12) ** 2));
      if (teddyLimb) r = r0 * (1 - 0.1 * t) + r0 * 0.12 * Math.sin(t * Math.PI);
      return r;
    };
    const cutAt = broken ? (isArm ? 0.62 : 0.86) : 1;
    const used = c.rel.map((p) => p.clone());
    const curveL = new THREE.CatmullRomCurve3(used, false, "centripetal");
    const meshes = [];
    if (jointed) {
      // segmented limb with ball joints (puppet / BJD)
      const segs = [[0, 0.47], [0.53, cutAt < 1 ? Math.min(cutAt, 0.97) : 0.97]];
      for (const [a, b] of segs) {
        if (a >= cutAt) continue;
        const pts = [];
        for (let k = 0; k <= 6; k++) pts.push(curveL.getPointAt(a + ((b - a) * k) / 6));
        const g = addGrime(tube(pts, (t) => radius(a + (b - a) * t) * 0.95, { radial: 14, tubular: 10 }));
        meshes.push(new THREE.Mesh(g, mtl));
      }
      const jr = r0 * 0.92;
      const joint = new THREE.Mesh(addGrime(new THREE.SphereGeometry(jr, 16, 12)), mtl);
      joint.position.copy(curveL.getPointAt(0.5));
      meshes.push(joint);
      const top = new THREE.Mesh(addGrime(new THREE.SphereGeometry(r0 * 1.05, 16, 12)), mtl);
      meshes.push(top);
    } else {
      const pts = [];
      for (let k = 0; k <= 14; k++) pts.push(curveL.getPointAt((k / 14) * cutAt));
      const g = addGrime(tube(pts, (t) => radius(t * cutAt), { radial: 18, tubular: 22, capEnd: true }));
      // keep arc-length t on uv.v so sleeves can hide the upper arm
      meshes.push(new THREE.Mesh(g, mtl));
    }
    // hand / foot
    if (cutAt >= 1) {
      const end = curveL.getPointAt(1);
      const dir = curveL.getTangentAt(1).normalize();
      if (isArm) {
        const hand = new THREE.Mesh(addGrime(teddyLimb ? new THREE.SphereGeometry(r1 * 1.15, 16, 12) : new THREE.SphereGeometry(r1 * 1.25, 16, 12)), mtl);
        hand.position.copy(end).addScaledVector(dir, r1 * 0.9);
        hand.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.clone().negate());
        hand.scale.set(teddyLimb ? 1 : 0.62, teddyLimb ? 1.05 : 1.45, teddyLimb ? 1 : 1.05);
        meshes.push(hand);
        if (!teddyLimb && P.kind !== "cloth") {
          const thumbDir = V3(-side * 0.2, -0.3, 1).normalize();
          const t0 = hand.position.clone().addScaledVector(dir, -r1 * 0.3).addScaledVector(thumbDir, r1 * 0.5);
          const thumb = new THREE.Mesh(addGrime(tube([t0, t0.clone().addScaledVector(thumbDir, r1 * 0.8)], r1 * 0.32, { radial: 8, tubular: 3 })), mtl);
          meshes.push(thumb);
        }
        if (teddyLimb) {
          const pad = new THREE.Mesh(new THREE.SphereGeometry(r1 * 0.85, 14, 10), mat("#5e3f2b", { roughness: 0.9 }));
          pad.scale.set(1, 1, 0.3);
          pad.position.copy(end).addScaledVector(dir, r1 * 1.25);
          pad.lookAt(pad.position.clone().add(dir));
          meshes.push(pad);
        }
      } else {
        const footLen = teddyLimb ? 0 : P.legR0 * 2.3;
        if (teddyLimb) {
          const pad = new THREE.Mesh(new THREE.SphereGeometry(r1 * 0.95, 16, 12), mat("#5e3f2b", { roughness: 0.92 }));
          pad.scale.set(1, 1.1, 0.25);
          pad.position.copy(end).addScaledVector(dir, r1 * 0.95);
          pad.lookAt(pad.position.clone().add(dir));
          meshes.push(pad);
          const cap = new THREE.Mesh(addGrime(new THREE.SphereGeometry(r1 * 1.02, 16, 12)), mtl);
          cap.position.copy(end).addScaledVector(dir, r1 * 0.2);
          meshes.push(cap);
        } else {
          const foot = new THREE.Mesh(addGrime(new THREE.SphereGeometry(1, 18, 12)), mtl);
          foot.scale.set(r1 * 1.25, P.footH * 0.52, footLen * 0.55);
          foot.position.copy(end).add(V3(0, -P.footH * 0.42, footLen * 0.3));
          meshes.push(foot);
          const ankle = new THREE.Mesh(addGrime(new THREE.SphereGeometry(r1 * 1.05, 14, 10)), mtl);
          ankle.position.copy(end).add(V3(0, -P.footH * 0.1, 0));
          meshes.push(ankle);
        }
        grp.userData.ankle = end.clone();
        grp.userData.footLen = footLen;
      }
    } else {
      // jagged break: chipped stump + crack lines
      const end = curveL.getPointAt(cutAt);
      const dir = curveL.getTangentAt(cutAt).normalize();
      const rr = radius(cutAt);
      const chip = new THREE.Mesh(new THREE.ConeGeometry(rr * 1.02, rr * 1.4, 7, 1, true), mtl);
      chip.position.copy(end).addScaledVector(dir, rr * 0.4);
      chip.quaternion.setFromUnitVectors(V3(0, -1, 0), dir.clone().negate());
      chip.material = mtl.clone();
      chip.material.side = THREE.DoubleSide;
      meshes.push(chip);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(rr * 0.98, 7), mat(P.kind === "teddy" ? "#f4efe6" : P.kind === "puppet" ? "#e9c79a" : "#efe9e2", { roughness: 0.95 }));
      inner.position.copy(end).addScaledVector(dir, rr * 0.05);
      inner.lookAt(inner.position.clone().add(dir));
      meshes.push(inner);
      if (P.kind === "teddy") {
        for (let k = 0; k < 5; k++) {
          const fluff = new THREE.Mesh(new THREE.SphereGeometry(rr * (0.35 + rand() * 0.2), 10, 8), mat("#fbf8f2", { roughness: 1 }));
          fluff.position.copy(end).addScaledVector(dir, rr * (0.2 + rand() * 0.5)).add(V3((rand() - 0.5) * rr, (rand() - 0.5) * rr, (rand() - 0.5) * rr));
          meshes.push(fluff);
        }
      }
      const crackMat = mat("#3b2c26", { roughness: 0.9 });
      for (let k = 0; k < 3; k++) {
        const t0 = cutAt - 0.05 - rand() * 0.3;
        const a = rand() * Math.PI * 2;
        const pts = [];
        for (let s = 0; s <= 5; s++) {
          const tt = Math.max(0.05, t0 - s * 0.04);
          const cp = curveL.getPointAt(tt);
          const tg = curveL.getTangentAt(tt);
          const nrm = V3(Math.cos(a + s * 0.25), 0, Math.sin(a + s * 0.25));
          nrm.addScaledVector(tg, -nrm.dot(tg)).normalize();
          pts.push(cp.addScaledVector(nrm, radius(tt) * 1.01));
        }
        meshes.push(new THREE.Mesh(tube(pts, 0.0012, { radial: 3, tubular: 8 }), crackMat));
      }
    }
    for (const m of meshes) {
      m.castShadow = m.receiveShadow = true;
      m.userData.part = id;
      if (m.geometry.attributes.aGrime) m.userData.grime = true;
      if (m.geometry.attributes.aGrime && m.geometry.userData.rows) m.userData.limbTube = true;
      grp.add(m);
    }
    grp.position.copy(c.S);
    if (broken) {
      // dangling at a wrong angle
      grp.rotation.z = (isArm ? side * 0.32 : side * 0.12);
      grp.rotation.x = isArm ? -0.15 : 0.12;
    }
    grp.userData = { ...grp.userData, id, broken, curve: c, isArm, side };
    return grp;
  };
  // relative-to-socket construction: rel curves start at the origin
  for (const id of ["armL", "armR", "legL", "legR"]) {
    const s = id.endsWith("L") ? "L" : "R";
    const broken = dmg.some((d) => d.kind === (id.startsWith("arm") ? "arm" : "leg") && d.side === s);
    const g = buildLimb(id, { broken });
    root.add(g);
    model.parts[id] = g;
    model.sockets[id] = { id, kind: id.startsWith("arm") ? "arm" : "leg", side: s, pos: curves[id].S.clone(), axis: curves[id].dirAt(0.05), open: false, broken };
  }
  model.buildLimb = buildLimb;

  /* ---------------------------------------------------------------- hair */
  const bodyCaps = plan.kind === "teddy" ? [] : [
    { a: V3(0, plan.hipY, 0), b: V3(0, plan.shoulderY - 0.01, 0), r: plan.chestR * 1.02 + 0.008 },
    { a: V3(-plan.shoulderX, plan.shoulderY - plan.armR0 * 0.6, 0), b: V3(plan.shoulderX, plan.shoulderY - plan.armR0 * 0.6, 0), r: plan.armR0 * 2.1 + 0.01 },
    { a: curves.armL.points[0], b: curves.armL.points[16], r: plan.armR0 * 1.6 + 0.006 },
    { a: curves.armR.points[0], b: curves.armR.points[16], r: plan.armR0 * 1.6 + 0.006 },
    { a: V3(0, plan.neckTop - 0.02, 0), b: V3(0, plan.shoulderY, 0), r: plan.neckR * 1.25 },
  ];
  const buildHairNow = () => {
    if (model.hair) {
      root.remove(model.hair.group);
      model.hair.dispose();
      model.hair = null;
    }
    if (look.hairStyle === "none" || !T.styles.length) return;
    const hx = HAIR_COLORS[look.hairColor]?.hex || "#7a4a2c";
    model.hair = buildHair({ style: look.hairStyle, hex: hx, plan, head, body: bodyCaps, seed, skinHex });
    root.add(model.hair.group);
  };
  buildHairNow();
  model.rebuildHair = buildHairNow;
  if (plan.kind === "puppet") {
    // carved, painted wooden hair cap
    const capGeo = sphereish(plan.hr, (d, o) => o.copy(head.surf(d, 0.004)).sub(hc), 40, 28);
    const keep = (c) => {
      const d = c.clone().normalize();
      return Math.asin(clamp(d.y, -1, 1)) > hairlineEl(Math.atan2(d.x, d.z)) + 0.05;
    };
    const cap = new THREE.Mesh(capGeo, surfaceMat("wood", "#6b4430", { map: woodTex("dark"), grime: false }));
    const ix = capGeo.index.array;
    const p = capGeo.attributes.position;
    const out = [];
    for (let i = 0; i < ix.length; i += 3) {
      const c = V3((p.getX(ix[i]) + p.getX(ix[i + 1]) + p.getX(ix[i + 2])) / 3, (p.getY(ix[i]) + p.getY(ix[i + 1]) + p.getY(ix[i + 2])) / 3, (p.getZ(ix[i]) + p.getZ(ix[i + 1]) + p.getZ(ix[i + 2])) / 3);
      if (keep(c)) out.push(ix[i], ix[i + 1], ix[i + 2]);
    }
    capGeo.setIndex(out);
    cap.position.copy(hc);
    cap.userData.part = "head";
    cap.castShadow = true;
    root.add(cap);
    model.pickables.push(cap);
    model.woodHair = cap;
  }

  /* -------------------------------------------------------------- outfit */
  model.outfit = null;
  const buildOutfitNow = () => {
    if (model.outfit) {
      root.remove(model.outfit.group);
      model.outfit.dispose();
    }
    model.outfit = buildOutfit(plan, look, { arms: { L: curves.armL, R: curves.armR }, seed });
    root.add(model.outfit.group);
  };
  buildOutfitNow();

  /* ------------------------------------------------------------- buttons */
  const BUTTON_STYLE = { cloth: "wood", teddy: "wood", puppet: "wood", porcelain: "pearl", collector: "pearl", princess: "pearl", fashion: "pearl", baby: "red" };
  model.buttonStyle = BUTTON_STYLE[type] || "pearl";
  const buildButtons = (fresh = false) => {
    for (const b of model.buttons) if (b.obj) {
      b.obj.parent?.remove(b.obj);
      disposeGroup(b.obj);
    }
    const prev = model.buttons;
    model.buttons = [];
    model.outfit.buttons.forEach((s, i) => {
      const missing = !fresh && dmg.some((d) => d.kind === "button" && d.slot === i);
      const st = !fresh && prev[i] ? prev[i].style : missing ? null : model.buttonStyle;
      const b = { slot: i, pos: s.p.clone(), n: s.n.clone(), size: s.size, style: st, obj: null, threads: null };
      model.buttons.push(b);
      setButton(i, st);
      model.sockets[`button${i}`] = { id: `button${i}`, kind: "button", slot: i, pos: s.p.clone(), axis: s.n.clone(), forward: s.n.clone(), open: false };
    });
  };
  const setButton = (i, style) => {
    const b = model.buttons[i];
    if (!b) return;
    if (b.obj) {
      root.remove(b.obj);
      disposeGroup(b.obj);
      b.obj = null;
    }
    b.style = style;
    if (style) {
      const o = buildButton(style, b.size);
      o.position.copy(b.pos);
      o.lookAt(b.pos.clone().add(b.n));
      o.traverse((m) => m.isMesh && (m.userData.part = `button${i}`));
      root.add(o);
      b.obj = o;
    } else {
      // two loose thread ends where the button was
      const o = new THREE.Group();
      const tm = mat("#f1e9d8", { roughness: 0.9 });
      for (const s of [-1, 1]) {
        const p0 = b.pos.clone();
        const p1 = p0.clone().add(V3(s * 0.004, -0.008, 0)).addScaledVector(b.n, 0.004);
        const p2 = p1.clone().add(V3(s * 0.006, -0.01, 0));
        o.add(new THREE.Mesh(tube([p0, p1, p2], 0.0007, { radial: 3, tubular: 6 }), tm));
      }
      const holes = new THREE.Mesh(new THREE.CircleGeometry(b.size * 0.9, 16), new THREE.MeshStandardMaterial({ color: "#000", transparent: true, opacity: 0.12 }));
      holes.position.copy(b.pos).addScaledVector(b.n, -0.001);
      holes.lookAt(b.pos.clone().add(b.n));
      o.add(holes);
      root.add(o);
      b.obj = o;
    }
  };
  model.setButton = setButton;
  buildButtons();

  /* --------------------------------------------------------------- shoes */
  model.shoes = { L: look.shoes, R: look.shoes };
  for (const s of ["L", "R"]) if (dmg.some((d) => d.kind === "shoe" && d.side === s)) model.shoes[s] = null;
  const setShoe = (side, style) => {
    const leg = model.parts[side === "L" ? "legL" : "legR"];
    const old = leg.userData.shoe;
    if (old) {
      leg.remove(old);
      disposeGroup(old);
      leg.userData.shoe = null;
    }
    model.shoes[side] = style;
    if (!style || style === "none" || plan.kind === "teddy") return;
    const ankle = leg.userData.ankle;
    if (!ankle) return;
    const sh = buildShoe(style, look.shoeColor, leg.userData.footLen || plan.legR0 * 2.3, plan.legR1, plan.footH * 0.9);
    sh.position.copy(ankle);
    sh.traverse((m) => {
      if (m.isMesh) {
        m.userData.part = side === "L" ? "shoeL" : "shoeR";
        if (m.geometry.attributes.aGrime || m.material.userData?.grime) {
          addGrime(m.geometry);
          m.userData.grime = true;
        }
      }
    });
    leg.add(sh);
    leg.userData.shoe = sh;
  };
  model.setShoe = setShoe;
  for (const s of ["L", "R"]) setShoe(s, model.shoes[s]);
  for (const s of ["L", "R"]) {
    const leg = model.parts[s === "L" ? "legL" : "legR"];
    if (plan.kind !== "teddy" && leg.userData.ankle) {
      model.sockets[`shoe${s}`] = { id: `shoe${s}`, kind: "shoe", side: s, pos: leg.userData.ankle.clone().add(leg.position).add(V3(0, -plan.footH * 0.5, 0.01)), axis: V3(0, 1, 0), forward: V3(0, 0, 1), open: !model.shoes[s] && look.shoes !== "none" };
    }
  }

  /* --------------------------------------------------------- accessories */
  const handPos = () => {
    const arm = model.parts.armR;
    const c = curves.armR;
    return c.points[16].clone().add(V3(0, -plan.armR1 * 1.2, 0)).add(arm ? V3(0, 0, 0) : V3());
  };
  model.acc = {};
  const setAccessory = (slot, id, { broken = false } = {}) => {
    const old = model.acc[slot];
    if (old) {
      root.remove(old.obj);
      disposeGroup(old.obj);
      delete model.acc[slot];
    }
    if (!id || id === "none") return;
    const m = accessoryMount(id, plan, handPos());
    let strings = null;
    if (id === "crossbar") {
      const ends = [
        [V3(-plan.hr * 1.5, 0, 0), curves.armR.points[16]],
        [V3(plan.hr * 1.5, 0, 0), curves.armL.points[16]],
        [V3(0, 0, plan.hr * 1.0), head.surf(dirAE(0, 0.95), 0)],
        [V3(-plan.hr * 0.4, 0, -plan.hr * 1.0), curves.legR.points[8]],
        [V3(plan.hr * 0.4, 0, -plan.hr * 1.0), curves.legL.points[8]],
      ];
      strings = ends.map(([from, to]) => ({ from, to: to.clone().sub(m.pos) }));
    }
    const obj = new THREE.Group();
    const inner = buildAccessory(id, look.accent, plan, { broken, strings: broken ? strings?.slice(0, 2) : strings });
    obj.add(inner);
    obj.position.copy(m.pos);
    obj.rotation.copy(m.rot);
    obj.traverse((o) => {
      if (o.isMesh) {
        o.userData.part = `acc:${slot}`;
        model.pickables.push(o);
      }
    });
    root.add(obj);
    model.acc[slot] = { id, obj, broken, mount: m };
  };
  model.setAccessory = setAccessory;
  for (const slot of ["hat", "ribbon", "extra"]) {
    const id = look[slot];
    const broken = dmg.some((d) => d.kind === "accessory" && d.item === id);
    setAccessory(slot, id, { broken });
    if (broken) {
      const m = accessoryMount(id, plan, handPos());
      model.sockets[`acc:${slot}`] = { id: `acc:${slot}`, kind: "acc", slot, want: id, pos: m.pos.clone(), axis: V3(0, 1, 0), forward: V3(0, 0, 1), open: false, broken: true };
    }
  }

  /* --------------------------------------------------------------- stand */
  if (plan.stand) {
    const steel = new THREE.MeshStandardMaterial({ color: "#c9c3bb", metalness: 1, roughness: 0.3 });
    const stand = new THREE.Group();
    stand.name = "stand";
    const base = new THREE.Mesh(revolve(profile([[0.14, 0], [0.142, 0.006], [0.13, 0.014], [0.02, 0.016]], 2), { segs: 40, capTop: true }), steel);
    stand.add(base);
    const back = -tp.squash * plan.waistR - 0.03;
    const rodH = plan.hipY + plan.torsoLen * 0.42;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, rodH, 10), steel);
    rod.position.set(0, rodH / 2, back - 0.02);
    stand.add(rod);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, Math.abs(back - 0.02), 8), steel);
    foot.rotation.x = Math.PI / 2;
    foot.position.set(0, 0.015, (back - 0.02) / 2);
    stand.add(foot);
    const clampR = plan.waistR * 1.05 + 0.02;
    const clampM = new THREE.Mesh(new THREE.TorusGeometry(clampR, 0.004, 6, 24, Math.PI * 0.9), steel);
    clampM.rotation.set(Math.PI / 2, 0, Math.PI * 0.05 + Math.PI);
    clampM.scale.set(1, tp.squash + 0.1, 1);
    clampM.position.set(0, rodH, 0);
    stand.add(clampM);
    stand.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = o.receiveShadow = true;
        o.userData.part = "stand";
      }
    });
    root.add(stand);
    model.stand = stand;
  }

  /* ======================================================= damage visuals */
  // hair: tangles + bald patches
  if (model.hair) {
    const tg = dmg.find((d) => d.kind === "tangle");
    if (tg) model.hair.locks.forEach((L, i) => model.hair.setLock(i, { tangle: clamp(tg.amount * (0.7 + rand() * 0.45), 0, 1) }));
    const bd = dmg.find((d) => d.kind === "bald");
    if (bd) {
      const centers = [[0.95, 0.62], [-1.25, 0.5], [2.4, 0.45], [-2.5, 0.25], [0.2, 0.95]].slice(0, bd.count || 1);
      const patches = model.hair.makePatches(centers);
      for (const P of patches) for (const i of P.ids) model.hair.setLock(i, { present: false, growth: 0 });
      model.patches = patches;
    }
    model.hair.flush();
  }

  // faded paint
  const fd = dmg.find((d) => d.kind === "faded");
  model.faded = fd ? fd.features.filter((f) => plan.paintable.includes(f)) : [];
  if (face) face.setFaded(model.faded);

  // cracks
  const crackMat = mat("#3a2a24", { roughness: 0.8 });
  const crackHi = mat("#fff6ee", { roughness: 0.4 });
  dmg.filter((d) => d.kind === "crack").forEach((d, ci) => {
    const where = d.where || "cheek";
    const start = where === "forehead" ? [-0.08, 0.27] : where === "jaw" ? [-0.58, -0.24] : [0.25, -0.33];
    const end = where === "forehead" ? [0.22, 0.05] : where === "jaw" ? [-0.26, -0.6] : [0.78, -0.12];
    const pts = [];
    const nrm = [];
    const n = 14;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const az = start[0] + (end[0] - start[0]) * t + (k && k < n ? (rand() - 0.5) * 0.07 : 0);
      const el = start[1] + (end[1] - start[1]) * t + (k && k < n ? (rand() - 0.5) * 0.07 : 0);
      const dir = dirAE(az, el);
      pts.push(head.surf(dir, 0.0007));
      nrm.push(dir.clone());
    }
    // branch
    const mid = Math.floor(n * 0.45);
    const bpts = [pts[mid].clone()];
    const bdir = nrm[mid].clone();
    for (let k = 1; k <= 4; k++) {
      const az = Math.atan2(bdir.x, bdir.z) + k * 0.05 * (where === "jaw" ? 1 : -1);
      const el = Math.asin(bdir.y) - k * 0.05;
      bpts.push(head.surf(dirAE(az, el), 0.0007));
    }
    const grp = new THREE.Group();
    const line = new THREE.Mesh(tube(pts, (t) => 0.0016 * (1 - 0.5 * Math.abs(t - 0.4)), { radial: 4, tubular: 40, flat: 0.5 }), crackMat.clone());
    const hi = new THREE.Mesh(tube(pts.map((p, i) => p.clone().add(V3(0, 0.0012, 0)).addScaledVector(nrm[i], 0.0002)), 0.0006, { radial: 3, tubular: 40 }), crackHi.clone());
    const br = new THREE.Mesh(tube(bpts, (t) => 0.0012 * (1 - t), { radial: 3, tubular: 10 }), crackMat.clone());
    for (const m of [line, hi, br]) {
      m.material.transparent = true;
      grp.add(m);
    }
    root.add(grp);
    const all = pts.concat(bpts.slice(1));
    model.cracks.push({ id: `crack${ci}`, where, pts: all, main: pts.length, branchFrom: mid, normals: nrm, group: grp, lines: [line, hi, br], glue: null });
  });

  // scratches
  dmg.filter((d) => d.kind === "scratch").forEach((d) => {
    const targets = d.part === "leg" ? ["legL", "legR"] : d.part === "arm" ? ["armL", "armR"] : ["armL", "legR", "head", "armR", "legL"];
    const want = d.count || 2;
    let made = 0;
    for (let k = 0; made < want && k < want * 4; k++) {
      const pid = targets[k % targets.length];
      let pts;
      if (pid === "head") {
        const az = (rand() - 0.5) * 0.9;
        const el = plan.eyeEl - 0.15 - rand() * 0.2;
        pts = [0, 1, 2, 3].map((s) => head.surf(dirAE(az + s * 0.06, el + s * 0.025), 0.0005));
      } else {
        const lim = model.parts[pid];
        if (!lim || lim.userData.broken) continue;
        const c = lim.userData.curve;
        const visibleFrom = pid.startsWith("leg") ? (model.outfit.covers.legAbove < 10 ? 0.25 : 0.2) : Math.max(0.15, model.outfit.covers.armTo + 0.08);
        const hem = model.outfit.covers.legAbove;
        let tt = visibleFrom + rand() * (0.85 - visibleFrom);
        if (pid.startsWith("leg")) {
          // keep the scratch below the hem so it's reachable
          for (let g = 0; g < 10 && c.curve.getPointAt(tt).y > hem - 0.02; g++) tt = Math.min(0.85, tt + 0.08);
        }
        const a = (rand() - 0.5) * 1.6 + (pid.endsWith("L") ? 0.8 : -0.8);
        const L = 0.035;
        pts = [];
        for (let s = 0; s <= 4; s++) {
          const t2 = clamp(tt + (s / 4 - 0.5) * (L / (pid.startsWith("arm") ? plan.armLen : plan.legLen)), 0.02, 0.98);
          const cp = c.curve.getPointAt(t2);
          const tg = c.curve.getTangentAt(t2);
          const nr = V3(Math.sin(a + s * 0.08), 0, Math.cos(a + s * 0.08));
          nr.addScaledVector(tg, -nr.dot(tg)).normalize();
          const rad = (pid.startsWith("arm") ? plan.armR0 + (plan.armR1 - plan.armR0) * t2 : plan.legR0 + (plan.legR1 - plan.legR0) * t2) * 1.0;
          const rr = pid.startsWith("leg") ? rad + plan.legR0 * 0.18 * Math.exp(-(((t2 - 0.62) / 0.13) ** 2)) - plan.legR0 * 0.12 * Math.exp(-(((t2 - 0.5) / 0.05) ** 2)) : rad + plan.armR0 * 0.08 * Math.exp(-(((t2 - 0.25) / 0.12) ** 2));
          pts.push(cp.addScaledVector(nr, rr + 0.0012));
        }
      }
      const tint = new THREE.Color(skinHex).lerp(new THREE.Color("#5a4038"), 0.55);
      const m = new THREE.Mesh(tube(pts, (t) => 0.0011 * (0.4 + Math.sin(t * Math.PI)), { radial: 3, tubular: 10, flat: 0.4 }), new THREE.MeshStandardMaterial({ color: tint, roughness: 0.9, transparent: true }));
      root.add(m);
      model.scratches.push({ id: `scratch${model.scratches.length}`, part: pid, pts, mesh: m, depth: 1 });
      made++;
    }
  });

  // tears (fabric) / burst seams (teddy)
  dmg.filter((d) => d.kind === "tear").forEach((d, ti) => {
    const where = d.where || "skirt";
    const out = model.outfit;
    let surf = out.surfaces[where] || out.surfaces.skirt || out.surfaces.bodice;
    let tr = out.tears[where] || out.tears.skirt || out.tears.bodice;
    if (where === "seam" || !surf) {
      // plush body seam
      const tpp = torsoPoints(plan);
      surf = (a, y, lift = 0) => {
        let r = 0;
        for (let i = 1; i < tpp.pts.length; i++) if (y <= tpp.pts[i][1]) {
          const q = (y - tpp.pts[i - 1][1]) / (tpp.pts[i][1] - tpp.pts[i - 1][1]);
          r = tpp.pts[i - 1][0] + (tpp.pts[i][0] - tpp.pts[i - 1][0]) * q;
          break;
        }
        const n = V3(Math.sin(a), 0.1, Math.cos(a) * tpp.squash).normalize();
        return { p: V3(Math.sin(a) * r, y, Math.cos(a) * r * tpp.squash).addScaledVector(n, lift), n };
      };
      tr = { a0: 0.28, y0: 0.29, a1: 0.18, y1: 0.12 };
    }
    const N = 11;
    const path = [];
    const normals = [];
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const a = tr.a0 + (tr.a1 - tr.a0) * t + Math.sin(t * 7 + ti) * 0.03;
      const y = tr.y0 + (tr.y1 - tr.y0) * t;
      const s = surf(a, y, 0.0025);
      path.push(s.p);
      normals.push(s.n);
    }
    const tear = { id: `tear${ti}`, where, path, normals, stitched: 0, closed: 0, group: new THREE.Group(), seam: where === "seam" };
    buildTearMesh(tear, rand, look);
    root.add(tear.group);
    model.tears.push(tear);
  });

  /* ------------------------------------------------------------ grime */
  collectGrime(model);
  initGrime(model, dmg, seed);

  /* ---------------------------------------------------------- pickables */
  refreshPickables(model);

  /* ---------------------------------------------------------- API */
  model.setGloss = (v) => {
    model.gloss = v;
    const mats = new Set();
    for (const g of model.grime) if (g.skin) mats.add(g.mesh.material);
    for (const m of mats) {
      if ("clearcoat" in m) {
        if (m.userData.baseCC == null) {
          m.userData.baseCC = m.clearcoat;
          m.userData.baseR = m.roughness;
        }
        m.clearcoat = m.userData.baseCC + (1 - m.userData.baseCC) * v;
        m.roughness = m.userData.baseR * (1 - 0.5 * v);
      }
    }
  };
  model.setCrack = (i, { glue = null, stage = "open", residual = 1 }) => {
    const c = model.cracks[i];
    if (!c) return;
    for (const l of c.lines) l.material.opacity = residual;
    if (c.glue) {
      c.group.remove(c.glue);
      c.glue.traverse((m) => m.isMesh && m.geometry.dispose());
      c.glue = null;
    }
    if (glue && stage !== "polished") {
      const g = new THREE.Group();
      const wet = stage === "glued";
      const gm = new THREE.MeshPhysicalMaterial({ color: wet ? "#fff7df" : "#ffffff", roughness: 0.05, clearcoat: 1, transparent: true, opacity: wet ? 0.85 : stage === "curing" ? 0.6 : 0.35 });
      let run = [];
      const flushRun = () => {
        if (run.length >= 2) g.add(new THREE.Mesh(tube(run, 0.0028, { radial: 6, tubular: Math.max(2, run.length * 2) }), gm));
        else if (run.length === 1) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 6), gm);
          s.position.copy(run[0]);
          g.add(s);
        }
        run = [];
      };
      c.pts.forEach((p, k) => {
        if (k === c.main) flushRun();
        if (glue[k] > 0) run.push(p.clone().addScaledVector(k < c.main ? c.normals[k] : c.normals[c.main - 1] || V3(0, 0, 1), 0.0008));
        else flushRun();
      });
      flushRun();
      c.glue = g;
      c.group.add(g);
    }
  };
  model.setScratch = (i, depth) => {
    const s = model.scratches[i];
    if (!s) return;
    s.depth = depth;
    s.mesh.material.opacity = clamp(depth, 0, 1);
    s.mesh.visible = depth > 0.02;
  };
  model.setTear = (i, stitched, closed, quality = 1) => {
    const t = model.tears[i];
    if (!t) return;
    t.stitched = stitched;
    t.closed = closed;
    updateTear(t, quality, look);
  };
  model.setShine = () => {};
  model.rebuildOutfit = () => {
    for (const t of model.tears) {
      root.remove(t.group);
      disposeGroup(t.group);
    }
    model.tears = [];
    buildOutfitNow();
    buildButtons(true);
    collectGrime(model);
    refreshPickables(model);
  };
  model.applyLook = (next) => {
    const prev = { ...look };
    Object.assign(look, sanitizeLook(type, { ...look, ...next }));
    if (look.hairStyle !== prev.hairStyle) {
      buildHairNow();
      model.patches = [];
    } else if (look.hairColor !== prev.hairColor && model.hair) model.hair.recolor(HAIR_COLORS[look.hairColor].hex);
    if (look.outfit !== prev.outfit || look.dressColor !== prev.dressColor || look.accent !== prev.accent) model.rebuildOutfit();
    if (look.shoes !== prev.shoes || look.shoeColor !== prev.shoeColor) for (const s of ["L", "R"]) setShoe(s, model.shoes[s] === null ? null : look.shoes);
    for (const slot of ["hat", "ribbon", "extra"]) {
      if (look[slot] !== prev[slot] || ((look.accent !== prev.accent) && look[slot] !== "none")) {
        const cur = model.acc[slot];
        if (cur && cur.broken && look[slot] === prev[slot]) continue;
        setAccessory(slot, look[slot]);
      }
    }
    collectGrime(model);
    refreshPickables(model);
  };
  /** Take a part off its socket (broken limb, cracked eye, snapped accessory). Returns the object for the drop animation. */
  model.detach = (sid) => {
    const so = model.sockets[sid];
    if (!so) return null;
    let obj = null;
    if (so.kind === "arm" || so.kind === "leg") {
      obj = model.parts[sid];
      if (obj) root.remove(obj);
      model.parts[sid] = null;
      for (const sc of model.scratches) if (sc.part === sid) model.setScratch(model.scratches.indexOf(sc), 0);
    } else if (so.kind === "eye") {
      obj = model.parts[sid];
      if (obj) root.remove(obj);
      model.parts[sid] = null;
    } else if (so.kind === "acc") {
      const a = model.acc[so.slot];
      if (a) {
        obj = a.obj;
        root.remove(obj);
        delete model.acc[so.slot];
      }
    }
    so.open = true;
    collectGrime(model);
    refreshPickables(model);
    return obj;
  };
  /** Fit a (compatible) replacement part into a socket. */
  model.attach = (sid, partId) => {
    const so = model.sockets[sid];
    const P = PARTS[partId];
    if (!so || !P) return;
    if (so.kind === "arm" || so.kind === "leg") {
      const g = buildLimb(sid, { broken: false });
      root.add(g);
      model.parts[sid] = g;
      if (so.kind === "leg") setShoe(so.side, model.shoes[so.side] === undefined ? look.shoes : model.shoes[so.side]);
      so.broken = false;
    } else if (so.kind === "eye") {
      placeEye(so.side === "L" ? 1 : -1, { color: P.variant, broken: false });
      model.eyeColor[so.side] = P.variant;
    } else if (so.kind === "button") {
      setButton(so.slot, P.variant);
    } else if (so.kind === "shoe") {
      setShoe(so.side, P.variant);
    } else if (so.kind === "acc") {
      setAccessory(so.slot, P.variant);
      so.broken = false;
    }
    so.open = false;
    so.filled = partId;
    collectGrime(model);
    refreshPickables(model);
  };
  model.disposables = disposables;
  model.dispose = () => {
    if (model.hair) model.hair.dispose();
    if (face) face.dispose();
    disposeGroup(root);
  };
  return model;
}

/* =============================================================== grime */
/** Gather grime meshes with cached root-space vertex positions/normals and a visibility mask. */
export function collectGrime(model) {
  const { root, plan, outfit } = model;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const old = new Map(model.grime.map((g) => [g.mesh, g]));
  const list = [];
  const covers = outfit.covers;
  const hairOn = !!model.hair || !!model.woodHair;
  const style = model.look.hairStyle;
  root.traverse((m) => {
    if (!m.isMesh || !m.geometry.attributes.aGrime || !m.visible) return;
    if (!m.userData.grime) return;
    let ok = true;
    for (let p = m.parent; p; p = p.parent) if (p === root) break; else if (!p.visible) ok = false;
    if (!ok) return;
    if (old.has(m)) {
      list.push(old.get(m));
      return;
    }
    const part = m.userData.part;
    const g = m.geometry;
    const n = g.attributes.position.count;
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    const vis = new Uint8Array(n);
    const M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const NM = new THREE.Matrix3().getNormalMatrix(M);
    const P = g.attributes.position;
    const Nn = g.attributes.normal;
    const uv = g.attributes.uv;
    const v = new THREE.Vector3();
    const nn = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(M);
      nn.fromBufferAttribute(Nn, i).applyMatrix3(NM).normalize();
      pos[i * 3] = v.x;
      pos[i * 3 + 1] = v.y;
      pos[i * 3 + 2] = v.z;
      nrm[i * 3] = nn.x;
      nrm[i * 3 + 1] = nn.y;
      nrm[i * 3 + 2] = nn.z;
      let visible = part === "outfit" || (part && part.startsWith("shoe")) ? nn.y > -0.65 : true;
      if (part === "torso") visible = visible && !covers.torso && !(covers.vest && inVest(v, covers.vest));
      else if (part === "head") {
        const d = tmpV.copy(v).sub(model.head.c).normalize();
        const az = Math.atan2(d.x, d.z);
        const el = Math.asin(clamp(d.y, -1, 1));
        if (hairOn && el > hairlineEl(az, style) - 0.03) visible = false;
      } else if (part && part.startsWith("leg")) {
        if (v.y > covers.legAbove) visible = false;
        if (v.y < 0.012) visible = false;
        const side = part.endsWith("L") ? "L" : "R";
        const shoe = model.shoes[side];
        if (shoe && shoe !== "none" && plan.kind !== "teddy" && v.y < (shoe === "boots" ? plan.footH * 3.6 : plan.footH * 1.6)) visible = false;
      } else if (part && part.startsWith("arm")) {
        if (m.userData.limbTube && uv && uv.getY(i) < covers.armTo) visible = false;
      } else if (part === "outfit") {
        // skirt underside near the floor can't be reached
        if (v.y < 0.008) visible = false;
      }
      vis[i] = visible ? 1 : 0;
    }
    const skin = part === "head" || part === "torso" || (part && (part.startsWith("arm") || part.startsWith("leg")) && !part.startsWith("shoe"));
    list.push({ mesh: m, part, attr: g.attributes.aGrime, pos, nrm, vis, n, skin });
  });
  model.grime = list;
  return list;
}

function inVest(v, vest) {
  if (v.y < vest.y0 || v.y > vest.y1) return false;
  let a = Math.atan2(v.x, v.z);
  if (a < 0) a += Math.PI * 2;
  return a >= vest.a0 && a <= vest.a1;
}

/** Lay the order's dust/dirt/stains onto the grime attributes (deterministic). */
export function initGrime(model, dmg, seed) {
  const dust = dmg.find((d) => d.kind === "dust");
  const dirt = dmg.find((d) => d.kind === "dirt");
  const stain = dmg.find((d) => d.kind === "stain");
  const rand = mulberry(seed * 7 + 3);
  const H = model.plan.height;
  // stain centres on visible, front-ish vertices
  const centers = [];
  if (stain) {
    const cands = [];
    for (const g of model.grime) {
      if (!(g.part === "outfit" || g.part === "head" || g.part === "torso" || g.part?.startsWith("arm"))) continue;
      for (let i = 0; i < g.n; i += 7) {
        if (!g.vis[i]) continue;
        if (g.nrm[i * 3 + 2] < 0.35) continue;
        cands.push([g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]]);
      }
    }
    for (let k = 0; k < (stain.count || 1) && cands.length; k++) {
      let best = null;
      for (let tries = 0; tries < 30; tries++) {
        const c = cands[Math.floor(rand() * cands.length)];
        if (centers.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) > 0.09)) {
          best = c;
          break;
        }
      }
      if (best) centers.push([...best, 0.03 + rand() * 0.016]);
    }
  }
  model.stainCenters = centers;
  for (const g of model.grime) {
    const a = g.attr.array;
    for (let i = 0; i < g.n; i++) {
      const o = i * 4;
      if (!g.vis[i]) {
        a[o] = a[o + 1] = a[o + 2] = a[o + 3] = 0;
        continue;
      }
      const x = g.pos[i * 3], y = g.pos[i * 3 + 1], z = g.pos[i * 3 + 2];
      const ny = g.nrm[i * 3 + 1];
      if (dust) a[o] = clamp(dust.amount * (0.5 + 0.55 * Math.max(0, ny)) * (0.65 + 0.5 * fbm3(x * 14, y * 14, z * 14, seed)), 0, 1);
      if (dirt) {
        const b = smooth(0.42, 0.62, fbm3(x * 9 + 3, y * 9, z * 9, seed + 11));
        const low = 1 + 0.7 * smooth(0.55, 0.05, y / H);
        a[o + 1] = clamp(dirt.amount * b * low * 1.1, 0, 1);
      }
      if (centers.length) {
        let s = 0;
        for (const [cx, cy, cz, r] of centers) {
          const d = Math.hypot(x - cx, y - cy, z - cz);
          if (d < r) s = Math.max(s, 1 - Math.pow(d / r, 3));
        }
        a[o + 2] = s;
      }
    }
    g.attr.needsUpdate = true;
  }
}

export function refreshPickables(model) {
  const list = [];
  model.root.traverse((m) => {
    if (!m.isMesh || !m.userData.part || m.userData.part === "stand") return;
    let vis = true;
    for (let p = m; p && p !== model.root; p = p.parent) if (!p.visible) vis = false;
    if (vis) list.push(m);
  });
  model.pickables = list;
}

/* ============================================================ teddy face */
function buildTeddyFace(model, plan, hc, skinHex) {
  const root = model.root;
  const hr = plan.hr;
  const fur = surfaceMat("plush", skinHex, { map: furTex(), bump: furBump() });
  const light = surfaceMat("plush", new THREE.Color(skinHex).offsetHSL(0, -0.08, 0.15).getStyle(), { map: furTex(), bump: furBump() });
  const snout = new THREE.Mesh(addGrime(new THREE.SphereGeometry(hr * 0.48, 24, 18)), light);
  snout.scale.set(1.12, 0.78, 0.82);
  snout.position.copy(model.head.surf(dirAE(0, -0.28), -hr * 0.2));
  snout.userData = { part: "head", grime: true };
  root.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.15, 16, 12), new THREE.MeshPhysicalMaterial({ color: "#2b1d17", roughness: 0.35, clearcoat: 0.6 }));
  nose.scale.set(1.3, 0.85, 0.8);
  nose.position.copy(snout.position).add(V3(0, hr * 0.14, hr * 0.37));
  nose.userData.part = "head";
  root.add(nose);
  const thread = mat("#2b1d17", { roughness: 0.9 });
  const m0 = nose.position.clone().add(V3(0, -hr * 0.1, hr * 0.0));
  const m1 = m0.clone().add(V3(0, -hr * 0.13, -hr * 0.0));
  root.add(new THREE.Mesh(tube([m0, m1], 0.0016, { radial: 4, tubular: 2 }), thread));
  for (const s of [-1, 1]) root.add(new THREE.Mesh(tube([m1, m1.clone().add(V3(s * hr * 0.1, hr * 0.02, -hr * 0.02)), m1.clone().add(V3(s * hr * 0.18, hr * 0.06, -hr * 0.07))], 0.0016, { radial: 4, tubular: 6 }), thread));
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(addGrime(new THREE.SphereGeometry(hr * 0.36, 20, 14)), fur);
    ear.scale.set(1, 0.92, 0.5);
    ear.position.copy(model.head.surf(dirAE(s * 0.85, 0.72), -hr * 0.08));
    ear.lookAt(ear.position.clone().add(V3(s * 0.3, 0.2, 1)));
    ear.userData = { part: "head", grime: true };
    root.add(ear);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.24, 16, 12), light);
    inner.scale.set(1, 0.9, 0.3);
    inner.position.copy(ear.position).add(V3(0, -hr * 0.02, hr * 0.12)).add(V3(s * -hr * 0.02, 0, 0));
    inner.lookAt(inner.position.clone().add(V3(s * 0.3, 0.2, 1)));
    inner.userData.part = "head";
    root.add(inner);
  }
  // stitched belly seam
  const tp = torsoPoints(plan);
  const seam = [];
  for (let k = 0; k <= 10; k++) {
    const y = 0.06 + k * 0.03;
    let r = 0;
    for (let i = 1; i < tp.pts.length; i++) if (y <= tp.pts[i][1]) {
      const q = (y - tp.pts[i - 1][1]) / (tp.pts[i][1] - tp.pts[i - 1][1]);
      r = tp.pts[i - 1][0] + (tp.pts[i][0] - tp.pts[i - 1][0]) * q;
      break;
    }
    seam.push(V3(0, y, r * tp.squash + 0.0015));
  }
  root.add(new THREE.Mesh(tube(seam, 0.0011, { radial: 3, tubular: 20 }), mat(new THREE.Color(skinHex).offsetHSL(0, 0, -0.18).getStyle())));
}

/* ================================================================= tears */
function buildTearMesh(tear, rand, look) {
  const grp = tear.group;
  const path = tear.path;
  const N = path.length;
  // gap strip: width follows a lens shape; jagged edges
  const left = [];
  const right = [];
  tear.side = [];
  for (let k = 0; k < N; k++) {
    const p = path[k];
    const nx = tear.normals[k];
    const tg = (k < N - 1 ? path[k + 1].clone().sub(p) : p.clone().sub(path[k - 1])).normalize();
    const side = new THREE.Vector3().crossVectors(nx, tg).normalize();
    tear.side.push(side);
    const w = 0.011 * Math.sin((k / (N - 1)) * Math.PI) + 0.0015;
    const j = (rand() - 0.5) * 0.004;
    left.push([p, side, w + j]);
    right.push([p, side, -(w - j)]);
  }
  tear.edges = { left, right };
  const gapMat = new THREE.MeshStandardMaterial({ color: tear.seam ? "#fbf7f0" : "#3d2924", roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(N * 2 * 3), 3));
  const idx = [];
  for (let k = 0; k < N - 1; k++) {
    const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  g.setIndex(idx);
  tear.gap = new THREE.Mesh(g, gapMat);
  tear.gap.userData.part = "outfit";
  grp.add(tear.gap);
  // frayed fibres
  const fm = new THREE.MeshStandardMaterial({ color: "#f3ead8", roughness: 1 });
  tear.fibres = [];
  for (let k = 1; k < N - 1; k++) {
    for (const s of [-1, 1]) {
      if (rand() < 0.35) continue;
      const fibre = new THREE.Mesh(new THREE.CylinderGeometry(0.0004, 0.0004, 0.007, 3), fm);
      fibre.userData = { k, s };
      grp.add(fibre);
      tear.fibres.push(fibre);
    }
  }
  if (tear.seam) {
    tear.stuffing = [];
    const st = new THREE.MeshStandardMaterial({ color: "#fdfbf6", roughness: 1 });
    for (let k = 2; k < N - 2; k += 2) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.008 + rand() * 0.004, 10, 8), st);
      s.userData.k = k;
      grp.add(s);
      tear.stuffing.push(s);
    }
  }
  tear.stitchGroup = new THREE.Group();
  grp.add(tear.stitchGroup);
  tear.thread = look ? (look.dressColor === "white" || look.dressColor === "cream" ? "#c9a46a" : "#fffaf0") : "#fffaf0";
  updateTear(tear, 1, look);
}

function updateTear(tear, quality = 1) {
  const N = tear.path.length;
  const pos = tear.gap.geometry.attributes.position;
  const open = 1 - tear.closed;
  for (let k = 0; k < N; k++) {
    const [p, side, wl] = tear.edges.left[k];
    const wr = tear.edges.right[k][2];
    const nx = tear.normals[k];
    const a = p.clone().addScaledVector(side, wl * open).addScaledVector(nx, 0.0006);
    const b = p.clone().addScaledVector(side, wr * open).addScaledVector(nx, 0.0006);
    pos.setXYZ(k * 2, a.x, a.y, a.z);
    pos.setXYZ(k * 2 + 1, b.x, b.y, b.z);
  }
  pos.needsUpdate = true;
  tear.gap.geometry.computeBoundingSphere();
  tear.gap.visible = open > 0.02;
  for (const f of tear.fibres) {
    const { k, s } = f.userData;
    const [p, side, wl] = tear.edges.left[k];
    const w = s > 0 ? wl : tear.edges.right[k][2];
    f.position.copy(p).addScaledVector(side, w * open * 1.05).addScaledVector(tear.normals[k], 0.001);
    f.quaternion.setFromUnitVectors(V3(0, 1, 0), side.clone().multiplyScalar(s));
    f.visible = open > 0.1;
  }
  if (tear.stuffing) for (const s of tear.stuffing) {
    const k = s.userData.k;
    s.position.copy(tear.path[k]).addScaledVector(tear.normals[k], 0.004 * open);
    s.scale.setScalar(Math.max(0.01, open));
    s.visible = open > 0.05;
  }
  // stitches: a cross-stitch over each sewn path point
  const sg = tear.stitchGroup;
  while (sg.children.length > tear.stitched) {
    const c = sg.children.pop();
    c.geometry.dispose();
  }
  const tm = new THREE.MeshStandardMaterial({ color: tear.thread, roughness: 0.7 });
  for (let k = sg.children.length; k < tear.stitched; k++) {
    const p = tear.path[k];
    const side = tear.side[k];
    const nx = tear.normals[k];
    const tg = (k < N - 1 ? tear.path[k + 1].clone().sub(p) : p.clone().sub(tear.path[k - 1])).normalize();
    const w = 0.009 * (0.85 + 0.15 * quality);
    const jit = (1 - quality) * 0.003;
    const a = p.clone().addScaledVector(side, w).addScaledVector(tg, -0.003 + jit).addScaledVector(nx, 0.0012);
    const b = p.clone().addScaledVector(side, -w).addScaledVector(tg, 0.003 - jit).addScaledVector(nx, 0.0012);
    const m = new THREE.Mesh(tube([a, p.clone().addScaledVector(nx, 0.0018), b], 0.0011, { radial: 4, tubular: 4 }), tm);
    m.castShadow = true;
    sg.add(m);
  }
}

/** A standalone replacement part for the carry/align minigame (origin = socket). */
export function buildPartPreview(model, partId, socket) {
  const P = PARTS[partId];
  const g = new THREE.Group();
  if (!P) return g;
  const plan = model.plan;
  if (P.kind === "arm" || P.kind === "leg") {
    const id = `${P.kind}${socket?.side || "L"}`;
    const ownPlan = bodyPlan(P.doll);
    const limb = model.buildLimb(id, { planOverride: ownPlan, forSide: (socket?.side || "L") === "L" ? 1 : -1 });
    limb.position.set(0, 0, 0);
    g.add(limb);
    if (P.kind === "leg" && model.shoes && limb.userData.ankle && plan.kind !== "teddy") {
      const sh = buildShoe(model.look.shoes, model.look.shoeColor, limb.userData.footLen || plan.legR0 * 2.3, ownPlan.legR1, ownPlan.footH * 0.9);
      sh.position.copy(limb.userData.ankle);
      limb.add(sh);
    }
  } else if (P.kind === "eye") {
    const e = buildEye(plan, { kind: P.eyes === "button" ? "button" : "glass", color: P.variant, skinHex: DOLL_TYPES[model.type].skin, lid: plan.kind === "baby" ? 0.65 : 0.3 });
    g.add(e);
  } else if (P.kind === "button") {
    const sz = model.buttons[socket?.slot ?? 0]?.size || 0.01;
    g.add(buildButton(P.variant, sz));
  } else if (P.kind === "shoe") {
    const legLen = plan.legR0 * 2.3;
    const sh = buildShoe(P.variant, model.look.shoeColor, legLen, plan.legR1, plan.footH * 0.9);
    sh.position.set(0, plan.footH * 0.5, -0.01);
    g.add(sh);
  } else if (P.kind === "acc") {
    g.add(buildAccessory(P.variant, model.look.accent, plan));
  }
  g.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.userData = { ...m.userData, preview: true };
    }
  });
  return g;
}

export { PAINT_COLORS, hexRgb };
