/**
 * Zombie Outbreak — the zombie body (and boss bodies).
 *
 * One rig per pool slot, built once from unit geometries; configure() sizes
 * the parts for a zombie's rig dimensions and toggles type extras, then
 * applyPose() copies engine/pose.js numbers onto the joints every frame.
 * The joint hierarchy mirrors the one documented in pose.js exactly — the
 * hitboxes are computed from the same chain.
 */
import * as THREE from "three";
import * as T from "./textures.js";

const U = {
  sph: new THREE.SphereGeometry(1, 16, 12),
  sphLo: new THREE.SphereGeometry(1, 8, 6),
  cap: new THREE.CapsuleGeometry(0.5, 1, 4, 10),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(1, 1, 8),
  plane: new THREE.PlaneGeometry(1, 1),
};

function part(geom, mat, parent) {
  const m = new THREE.Mesh(geom, mat);
  parent.add(m);
  return m;
}

function joint(parent) {
  const g = new THREE.Group();
  parent.add(g);
  return g;
}

let blobMat = null;

export function createRig() {
  const skin = new THREE.MeshStandardMaterial({ map: T.skinTex(), roughness: 0.82, color: "#7d8a6a" });
  const face = new THREE.MeshStandardMaterial({ map: T.faceTex(), roughness: 0.8, color: "#7d8a6a" });
  const shirt = new THREE.MeshStandardMaterial({ map: T.clothTex(), roughness: 0.95, color: "#5a3d35" });
  const pants = new THREE.MeshStandardMaterial({ map: T.clothTex(), roughness: 0.95, color: "#2c2b2a" });
  const dark = new THREE.MeshStandardMaterial({ color: "#1d1a17", roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: "#1b1712", roughness: 1 });
  const eye = new THREE.MeshBasicMaterial({ color: "#ffe9a8" });
  const glow = new THREE.MeshStandardMaterial({ color: "#5aff3a", emissive: "#3aff2a", emissiveIntensity: 0.6, roughness: 0.4 });
  const armor = new THREE.MeshStandardMaterial({ color: "#3c3f43", roughness: 0.45, metalness: 0.75 });
  const bone = new THREE.MeshStandardMaterial({ color: "#c9bf9f", roughness: 0.7 });
  if (!blobMat) blobMat = new THREE.MeshBasicMaterial({ map: T.blobShadowTex(), transparent: true, depthWrite: false, opacity: 0.85 });
  const mats = { skin, face, shirt, pants, dark, hair, eye, glow, armor, bone };

  const root = new THREE.Group();
  root.visible = false;
  const blob = part(U.plane, blobMat, root);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.025;
  blob.renderOrder = 1;

  const hips = joint(root);
  const pelvis = part(U.sph, pants, hips);
  const abdomen = part(U.sph, shirt, hips);
  const chest = part(U.sph, shirt, hips);
  const ribs = part(U.sph, skin, hips); // exposed skin through a tear
  const belly = part(U.sph, glow, hips); // bomber pustule / giant sac
  const pustules = [part(U.sphLo, glow, hips), part(U.sphLo, glow, hips), part(U.sphLo, glow, hips)];
  const hump = part(U.sph, skin, hips); // brute back hump
  const plates = [part(U.box, armor, hips), part(U.box, armor, hips), part(U.box, armor, hips)];
  const spikes = [0, 1, 2, 3, 4].map(() => part(U.cone, bone, hips));
  const core = part(U.sph, glow, hips); // titan core

  const neck = joint(hips);
  const neckM = part(U.cyl, skin, neck);
  const head = part(U.sph, face, neck);
  const eyes = [part(U.sphLo, eye, neck), part(U.sphLo, eye, neck)];
  const jawJ = joint(neck);
  const jaw = part(U.sph, skin, jawJ);
  const hairM = [part(U.sphLo, hair, neck), part(U.sphLo, hair, neck), part(U.sphLo, hair, neck)];
  const sac = part(U.sph, glow, neck); // spitter throat sac
  const crown = [0, 1, 2, 3].map(() => part(U.cone, armor, neck));
  const horns = [part(U.cone, bone, neck), part(U.cone, bone, neck)];

  const arm = (side) => {
    const sh = joint(hips);
    const ball = part(U.sph, shirt, sh);
    const upper = part(U.cap, shirt, sh);
    const el = joint(sh);
    const fore = part(U.cap, skin, el);
    const hand = part(U.sph, skin, el);
    const claws = [part(U.cone, bone, el), part(U.cone, bone, el), part(U.cone, bone, el)];
    const pad = part(U.box, armor, sh);
    return { side, sh, ball, upper, el, fore, hand, claws, pad };
  };
  const leg = (side) => {
    const hp = joint(root);
    const thigh = part(U.cap, pants, hp);
    const kn = joint(hp);
    const shin = part(U.cap, pants, kn);
    const foot = part(U.box, dark, kn);
    return { side, hp, thigh, kn, shin, foot };
  };
  const armL = arm(1);
  const armR = arm(-1);
  const legL = leg(1);
  const legR = leg(-1);

  const rig = {
    root,
    blob,
    hips,
    neck,
    jawJ,
    head,
    eyes,
    sac,
    belly,
    pustules,
    core,
    armL,
    armR,
    legL,
    legR,
    mats,
    parts: { pelvis, abdomen, chest, ribs, hump, plates, spikes, neckM, jaw, hairM, crown, horns },
    type: null,
    flash: 0,
    gen: -1,
  };
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return rig;
}

const BOSS_LOOK = {
  bruteKing: { skin: "#86806a", shirt: "#5a4a3c", pants: "#3e3830", eye: "#ffb020", plates: true, crown: true, hump: true },
  beast: { skin: "#7a4a44", shirt: "#7a4a44", pants: "#3a2422", eye: "#ff3a2a", spikes: true, claws: true, bare: true, horns: true },
  toxicGiant: { skin: "#6f7f4a", shirt: "#3d4a2c", pants: "#2b3022", eye: "#b6ff4a", belly: true, pustules: true, hump: true, glow: "#7dff3a" },
  stalker: { skin: "#3a3e48", shirt: "#2a2c34", pants: "#24262c", eye: "#ff1a1a", claws: true, bare: true, spikes: true },
  titan: { skin: "#8a7e72", shirt: "#5a4e44", pants: "#3e3832", eye: "#ff6a1a", spikes: true, core: true, horns: true, hump: true, plates: true, glow: "#ff5a1a" },
};

/** Sizes and dresses the rig for zombie `z` (called when the slot's zombie changes). */
export function configureRig(rig, z) {
  const r = z.rig;
  const v = z.variant;
  const P = rig.parts;
  const type = z.type;
  const look = z.boss ? BOSS_LOOK[type] || {} : {};
  rig.type = type;
  rig.gen = z.gen;
  const M = rig.mats;
  M.skin.color.set(look.skin || v.skin);
  M.face.color.set(look.skin || v.skin);
  M.shirt.color.set(look.shirt || (type === "bomber" ? "#4a4a3a" : type === "spitter" ? "#3a4a3e" : v.shirt));
  M.pants.color.set(look.pants || v.pants);
  M.eye.color.set(look.eye || (type === "runner" ? "#ff5a3a" : type === "spitter" ? "#b6ff4a" : type === "bomber" ? "#ffb04a" : "#ffe9a8"));
  const glowCol = look.glow || (type === "bomber" ? "#ff8a1a" : "#7dff3a");
  M.glow.color.set(glowCol);
  M.glow.emissive.set(glowCol);
  M.hair.color.set(v.hair === 2 ? "#5a4a32" : "#1b1712");
  const bare = !!look.bare || type === "runner" ? v.torn >= 1 : false;

  // Torso.
  P.pelvis.position.set(0, 0, 0);
  P.pelvis.scale.set(r.hipW + r.legR + 0.05, 0.13, r.torsoR * 0.78);
  P.abdomen.position.set(0, r.torsoLen * 0.28, 0);
  P.abdomen.scale.set(r.torsoR * 0.92, r.torsoLen * 0.32, r.torsoR * 0.74);
  P.chest.position.set(0, r.torsoLen * 0.66, 0);
  P.chest.scale.set(r.torsoR * 1.08, r.torsoLen * 0.36, r.torsoR * 0.8);
  P.abdomen.material = look.bare ? M.skin : M.shirt;
  P.chest.material = look.bare ? M.skin : M.shirt;
  P.ribs.visible = !look.bare && (v.torn >= 1 || bare);
  P.ribs.position.set(r.torsoR * 0.35 * (v.torn === 2 ? -1 : 1), r.torsoLen * 0.55, r.torsoR * 0.42);
  P.ribs.scale.set(r.torsoR * 0.55, r.torsoLen * 0.22, r.torsoR * 0.42);
  P.hump.visible = !!look.hump || type === "brute";
  P.hump.position.set(0, r.torsoLen * 0.82, -r.torsoR * 0.45);
  P.hump.scale.set(r.torsoR * 0.95, r.torsoLen * 0.3, r.torsoR * 0.6);

  // Bomber belly / giant sac / spitter sac / pustules.
  rig.belly.visible = type === "bomber" || !!look.belly;
  rig.belly.position.set(0, r.torsoLen * 0.3, r.torsoR * 0.45);
  rig.belly.scale.set(r.torsoR * 0.75, r.torsoLen * 0.3, r.torsoR * 0.55);
  rig.pustules.forEach((p, i) => {
    p.visible = type === "bomber" || !!look.pustules;
    const a = (i - 1) * 0.9;
    p.position.set(Math.sin(a) * r.torsoR * 0.95, r.torsoLen * (0.45 + i * 0.15), Math.cos(a) * r.torsoR * 0.7);
    const s = r.torsoR * (0.28 + (i % 2) * 0.08);
    p.scale.set(s, s, s);
  });
  rig.sac.visible = type === "spitter";
  rig.sac.position.set(0, r.headR * 0.1, r.headR * 0.55);
  rig.core.visible = !!look.core;
  rig.core.position.set(0, r.torsoLen * 0.62, r.torsoR * 0.72);
  rig.core.scale.setScalar(0.15);

  P.plates.forEach((p, i) => {
    p.visible = !!look.plates;
    if (i === 0) {
      p.position.set(0, r.torsoLen * 0.62, r.torsoR * 0.62);
      p.scale.set(r.torsoR * 1.6, r.torsoLen * 0.45, 0.06);
      p.rotation.set(-0.12, 0, 0);
    } else {
      const s = i === 1 ? 1 : -1;
      p.position.set(s * r.shoulder * 0.95, r.torsoLen * 0.95, 0);
      p.scale.set(r.torsoR * 0.9, 0.08, r.torsoR * 1.2);
      p.rotation.set(0, 0, s * -0.4);
    }
  });
  P.spikes.forEach((p, i) => {
    p.visible = !!look.spikes;
    p.position.set(0, r.torsoLen * (0.3 + i * 0.17), -r.torsoR * 0.75);
    p.scale.set(0.05, 0.22 - i * 0.015, 0.05);
    p.rotation.set(-1.9, 0, 0);
  });

  // Neck + head.
  P.neckM.position.set(0, 0.02, 0);
  P.neckM.scale.set(r.headR * 0.48, 0.14, r.headR * 0.48);
  rig.head.position.set(0, r.headR * 1.05, r.headR * 0.15);
  rig.head.scale.set(r.headR * 0.92, r.headR * 1.1, r.headR * 1.02);
  // Face texture's centre is at u = 0.25 → rotate so it faces +Z.
  rig.head.rotation.set(0, Math.PI / 2 - Math.PI / 2, 0);
  rig.eyes.forEach((e, i) => {
    const s = i === 0 ? 1 : -1;
    e.position.set(s * r.headR * 0.32, r.headR * 1.12, r.headR * 0.98);
    e.scale.setScalar(r.headR * (z.boss ? 0.15 : 0.12));
  });
  rig.jawJ.position.set(0, r.headR * 0.62, r.headR * 0.5);
  P.jaw.position.set(0, -r.headR * 0.12, r.headR * 0.2);
  P.jaw.scale.set(r.headR * 0.62, r.headR * 0.25, r.headR * 0.5);
  P.hairM.forEach((h, i) => {
    h.visible = !z.boss && v.hair > 0 && type !== "bomber";
    h.position.set((i - 1) * r.headR * 0.45, r.headR * 1.85, r.headR * (-0.1 + (i % 2) * 0.2));
    h.scale.set(r.headR * 0.45, r.headR * 0.28, r.headR * 0.5);
  });
  P.crown.forEach((c, i) => {
    c.visible = !!look.crown;
    const a = (i / 4) * Math.PI * 2;
    c.position.set(Math.cos(a) * r.headR * 0.7, r.headR * 2.0, Math.sin(a) * r.headR * 0.7);
    c.scale.set(0.035, 0.12, 0.035);
  });
  P.horns.forEach((h, i) => {
    h.visible = !!look.horns;
    const s = i === 0 ? 1 : -1;
    h.position.set(s * r.headR * 0.75, r.headR * 1.7, -r.headR * 0.1);
    h.scale.set(0.04, 0.2, 0.04);
    h.rotation.set(-0.5, 0, s * -0.7);
  });

  // Arms.
  for (const A of [rig.armL, rig.armR]) {
    A.sh.position.set(A.side * r.shoulder, r.torsoLen * 0.86, 0);
    A.ball.scale.setScalar(r.armR * 1.6);
    A.upper.position.set(0, -r.armLen * 0.25, 0);
    A.upper.scale.set(r.armR * 2, r.armLen * 0.36, r.armR * 2);
    A.upper.material = bare || look.bare ? M.skin : M.shirt;
    A.ball.material = bare || look.bare ? M.skin : M.shirt;
    A.el.position.set(0, -r.armLen * 0.5, 0);
    A.fore.position.set(0, -r.armLen * 0.23, 0);
    A.fore.scale.set(r.armR * 1.7, r.armLen * 0.34, r.armR * 1.7);
    A.hand.position.set(0, -r.armLen * 0.5, 0.01);
    A.hand.scale.set(r.armR * 1.2, r.armR * 1.9, r.armR * 0.8);
    A.claws.forEach((c, i) => {
      c.visible = !!look.claws;
      c.position.set((i - 1) * r.armR * 0.7, -r.armLen * 0.5 - r.armR * 2.2, 0.02);
      c.scale.set(0.012, 0.1, 0.012);
      c.rotation.set(Math.PI, 0, 0);
    });
    A.pad.visible = !!look.plates;
    A.pad.position.set(A.side * 0.02, 0.04, 0);
    A.pad.scale.set(r.armR * 3.2, r.armR * 1.4, r.armR * 3.2);
  }
  // Legs.
  for (const L of [rig.legL, rig.legR]) {
    L.hp.position.set(L.side * r.hipW, r.legLen, 0);
    L.thigh.position.set(0, -r.legLen * 0.25, 0);
    L.thigh.scale.set(r.legR * 2.2, r.legLen * 0.34, r.legR * 2.2);
    L.kn.position.set(0, -r.legLen * 0.5, 0);
    L.shin.position.set(0, -r.legLen * 0.24, 0);
    L.shin.scale.set(r.legR * 1.8, r.legLen * 0.36, r.legR * 1.8);
    L.foot.position.set(0, -r.legLen * 0.48, 0.05);
    L.foot.scale.set(r.legR * 1.9, 0.07, r.legR * 3.4);
    L.foot.material = look.bare ? M.skin : M.dark;
  }
  const br = (r.shoulder + r.torsoR) * 1.6;
  rig.blob.scale.set(br, br * 0.9, 1);
}

/** Copies pose numbers onto the joints. */
export function applyPose(rig, z, t) {
  const P = z.pose;
  rig.root.position.set(z.x, P.rootY + (z.y || 0), z.z);
  rig.root.rotation.y = z.yaw;
  rig.root.scale.setScalar(z.scale);
  rig.hips.position.set(0, P.hipY, 0);
  rig.hips.rotation.set(P.lean, 0, P.roll);
  rig.neck.position.set(0, z.rig.torsoLen, 0);
  rig.neck.rotation.set(P.headPitch, 0, P.headRoll);
  rig.jawJ.rotation.x = P.jaw * 0.55;
  const a = [rig.armL, rig.armR];
  const pa = [P.armL, P.armR];
  for (let i = 0; i < 2; i++) {
    a[i].sh.rotation.set(pa[i].p, 0, pa[i].s * a[i].side);
    a[i].el.rotation.x = pa[i].e;
  }
  rig.legL.hp.position.y = P.hipY;
  rig.legR.hp.position.y = P.hipY;
  rig.legL.hp.rotation.x = P.legL.p;
  rig.legR.hp.rotation.x = P.legR.p;
  rig.legL.kn.rotation.x = P.legL.k;
  rig.legR.kn.rotation.x = P.legR.k;
  // Blob shadow stays on the ground (counter the root's rise/fall and leaps).
  rig.blob.position.y = (-(P.rootY + (z.y || 0)) + 0.025) / z.scale;
  rig.blob.visible = z.anim.death < 2.4;
  rig.blob.material.opacity = 0.85;

  // Glows: bomber fizz, spitter sac, boss telegraphs.
  const glow = P.glow;
  const M = rig.mats;
  if (z.type === "bomber") {
    const arming = z.anim.arm > 0;
    const pulse = arming ? 0.5 + 0.5 * Math.sin(t * (14 + z.anim.arm * 30)) : 0.5 + 0.2 * Math.sin(t * 3);
    M.glow.emissive.set(arming ? "#ff2a1a" : "#ff8a1a");
    M.glow.emissiveIntensity = 0.5 + pulse * (arming ? 2.4 : 0.6);
    const sw = 1 + z.anim.arm * 0.35;
    rig.belly.scale.set(z.rig.torsoR * 0.75 * sw, z.rig.torsoLen * 0.3 * sw, z.rig.torsoR * 0.55 * sw);
  } else if (z.type === "spitter") {
    const k = 1 + glow * 0.8;
    rig.sac.scale.set(z.rig.headR * 0.55 * k, z.rig.headR * 0.45 * k, z.rig.headR * 0.5 * k);
    M.glow.emissiveIntensity = 0.4 + glow * 2.2;
  } else if (z.boss) {
    M.glow.emissiveIntensity = 0.6 + glow * 2.5 + Math.sin(t * 4) * 0.2;
    if (rig.core.visible) rig.core.scale.setScalar(0.15 * (1 + glow * 0.4));
  }
  // Eyes flare during telegraphs.
  const eyeK = z.anim.death >= 0 ? 0 : 1;
  rig.eyes[0].visible = rig.eyes[1].visible = eyeK > 0;
  if (z.boss) rig.eyes.forEach((e) => e.scale.setScalar(z.rig.headR * 0.15 * (1 + glow * 0.8)));

  // Hit flash.
  if (rig.flash > 0) rig.flash = Math.max(0, rig.flash - 0.06);
  const f = rig.flash;
  M.skin.emissive.setRGB(f * 0.6, f * 0.12, f * 0.08);
  M.shirt.emissive.setRGB(f * 0.5, f * 0.1, f * 0.06);
  M.face.emissive.setRGB(f * 0.6, f * 0.12, f * 0.08);
  // Stalker shroud: it darkens while retreating.
  if (z.type === "stalker") {
    const s = z.shroud || 0;
    M.skin.color.set("#3a3e48").multiplyScalar(1 - s * 0.6);
  }
}

export function disposeRig(rig) {
  for (const m of Object.values(rig.mats)) m.dispose();
}
