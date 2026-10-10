/**
 * Web Hero — the hero: an ORIGINAL web-slinging superhero built on the shared
 * humanoid rig (three/humanoid.js).
 *
 * Design: athletic V-taper; full-face mask with large angular eye lenses
 * framed in black; a woven hex-web suit pattern (canvas texture) in the suit
 * colour with accent web lines; a "Nexus" chest emblem (a split diamond with
 * three radiating strands); chunky silver web launchers with glowing
 * cartridges on both wrists; dark gloves, boots and a utility belt with a
 * glowing buckle. Suits recolour every material (data/suits.js).
 *
 * animate(h, W, dt) maps the controller state (mode / action / move / speed /
 * trick timers) to a target pose and blends to it — idle, walk, run, sprint,
 * jump, double-jump flip, fall, land squash, climb, wall-run, ledge vault,
 * swing (+ pumping legs), release tricks, every melee move, web shot, dodge
 * roll / side-flip, hurt, knockdown, defeat, rescue, Web Storm and victory.
 */
import * as THREE from "three";
import { buildHumanoid, blendPose, applyPose, zeroPose, poseIdle, poseRun, poseAir, ease, sphere, box, loft, optimizeRig } from "./humanoid.js";
import { MOVES } from "../engine/config.js";

function suitTexture(base, accent, dark) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  // subtle fabric weave
  g.globalAlpha = 0.08;
  for (let y = 0; y < 256; y += 4) {
    g.fillStyle = y % 8 ? "#ffffff" : "#000000";
    g.fillRect(0, y, 256, 2);
  }
  g.globalAlpha = 1;
  // hex web
  g.strokeStyle = dark;
  g.globalAlpha = 0.55;
  g.lineWidth = 3;
  const R = 22;
  for (let row = -1; row < 9; row++) {
    for (let col = -1; col < 8; col++) {
      const cx = col * R * 1.5 * 1.2;
      const cy = row * R * Math.sqrt(3) + (col % 2 ? (R * Math.sqrt(3)) / 2 : 0);
      g.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * R;
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
  }
  g.globalAlpha = 0.9;
  g.strokeStyle = accent;
  g.lineWidth = 1.4;
  for (let row = -1; row < 9; row++) {
    for (let col = -1; col < 8; col++) {
      const cx = col * R * 1.5 * 1.2;
      const cy = row * R * Math.sqrt(3) + (col % 2 ? (R * Math.sqrt(3)) / 2 : 0);
      g.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * R;
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** angular lens: a swept teardrop (wider at the outer edge) */
function lensShape(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w * 0.5, h * 0.15);
  s.quadraticCurveTo(-w * 0.1, h * 0.6, w * 0.5, h * 0.5);
  s.quadraticCurveTo(w * 0.62, -h * 0.05, w * 0.25, -h * 0.5);
  s.quadraticCurveTo(-w * 0.25, -h * 0.35, -w * 0.5, h * 0.15);
  return s;
}

function emblemShape() {
  // split diamond (two halves with a gap) — the "Nexus"
  const a = new THREE.Shape();
  a.moveTo(0.012, 0.075);
  a.lineTo(0.06, 0);
  a.lineTo(0.012, -0.075);
  a.lineTo(0.012, 0.075);
  const b = new THREE.Shape();
  b.moveTo(-0.012, 0.075);
  b.lineTo(-0.06, 0);
  b.lineTo(-0.012, -0.075);
  b.lineTo(-0.012, 0.075);
  return [a, b];
}

export function createHeroModel({ shadows, suit }) {
  const mats = {
    suit: new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.48, metalness: 0.05, clearcoat: 0.55, clearcoatRoughness: 0.35, sheen: 0.4, sheenRoughness: 0.5 }),
    dark: new THREE.MeshPhysicalMaterial({ color: "#111", roughness: 0.42, metalness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.25 }),
    accent: new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#000", emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.3 }),
    lens: new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#fff", emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.1 }),
    rim: new THREE.MeshStandardMaterial({ color: "#07080c", roughness: 0.35, metalness: 0.4 }),
    metal: new THREE.MeshStandardMaterial({ color: "#c9d1dc", roughness: 0.25, metalness: 0.9 }),
    glow: new THREE.MeshBasicMaterial({ color: "#fff" }),
  };
  const rig = buildHumanoid({
    height: 1.82,
    bulk: 1.1,
    shoulder: 0.232,
    hip: 0.092,
    headR: 0.118,
    shadows,
    mats: { top: mats.suit, bottom: mats.suit, arms: mats.suit, shoes: mats.dark, hands: mats.dark, head: mats.suit },
  });
  const { joints: J, parts: P, size: S } = rig;
  const sh = !!shadows;
  const add = (parent, geo, mat, pos, rot, scl) => {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    if (scl) m.scale.set(...scl);
    m.castShadow = sh;
    parent.add(m);
    return m;
  };
  const s = S.s;

  // ---- mask: lenses + black frames, a subtle brow ridge
  const headG = J.head;
  const hr = S.hr;
  // big, expressive lenses that wrap round the face (the hero's signature look)
  const lensGeo = new THREE.ExtrudeGeometry(lensShape(0.078 * s, 0.056 * s), { depth: 0.004, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.002, bevelSegments: 2 });
  const rimGeo = new THREE.ExtrudeGeometry(lensShape(0.094 * s, 0.07 * s), { depth: 0.004, bevelEnabled: false });
  for (const sx of [1, -1]) {
    const g = new THREE.Group();
    // on the face surface at eye level, wrapping round toward the temples
    g.position.set(sx * hr * 0.4, hr * 0.92, hr * 0.84);
    g.rotation.set(-0.08, sx * 0.62, sx * 0.16);
    g.scale.set(sx, 1, 1);
    headG.add(g);
    add(g, rimGeo, mats.rim, [0, 0, -0.004]);
    add(g, lensGeo, mats.lens, [0.002, 0, 0.002], null, [0.86, 0.86, 1]);
  }
  // ---- emblem on the chest
  const [ea, eb] = emblemShape();
  const embGeo = new THREE.ExtrudeGeometry([ea, eb], { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1 });
  const emb = add(J.chest, embGeo, mats.accent, [0, 0.16 * s, 0.112 * s], [-0.12, 0, 0], [1.35 * s, 1.35 * s, 1]);
  // three strands radiating from the emblem across the chest
  for (const [a, l] of [[0.6, 0.15], [-0.6, 0.15], [Math.PI, 0.1]]) {
    add(J.chest, box(0.008, l * s, 0.008), mats.accent, [Math.sin(a) * 0.09 * s, 0.16 * s - Math.cos(a) * 0.09 * s + (a === Math.PI ? 0.02 : 0), 0.104 * s], [-0.1, 0, a]);
  }
  void emb;
  // ---- dark side panels (lats) under the arms
  for (const sx of [1, -1]) add(J.chest, box(0.012, 0.2 * s, 0.11 * s), mats.dark, [sx * 0.165 * s * 1.1, 0.08 * s, -0.005 * s], [0, 0, sx * 0.12]);
  // ---- belt with glowing buckle
  add(J.body, new THREE.TorusGeometry(0.158 * s, 0.011 * s, 6, 28), mats.dark, [0, 0.08 * s, 0], [Math.PI / 2, 0, 0], [1.1, 0.7, 1.4]);
  add(J.body, box(0.05 * s, 0.04 * s, 0.02), mats.accent, [0, 0.07 * s, 0.13 * s]);
  // ---- boots (shin cuffs) + gloves (forearm cuffs) + launchers
  for (const side of ["L", "R"]) {
    const knee = J[`knee${side}`];
    // boot: follows the calf, flaring slightly at the top
    const bk = 0.0605 * s * 1.1; // radius scale for this physique
    add(knee, loft([{ y: -1.04, rx: 0.042, rz: 0.046 }, { y: -0.85, rx: 0.042, rz: 0.046 }, { y: -0.62, rx: 0.05, rz: 0.055, oz: -0.004 }, { y: -0.5, rx: 0.056, rz: 0.062, oz: -0.008 }].map((r) => ({ ...r, y: r.y * S.shinL, rx: (r.rx * bk) / 0.0605, rz: (r.rz * bk) / 0.0605, oz: (r.oz || 0) * s })), 20), mats.dark);
    add(knee, new THREE.TorusGeometry(0.075 * s, 0.01 * s, 6, 18), mats.accent, [0, -S.shinL * 0.48, 0], [Math.PI / 2, 0, 0]);
    const el = J[`el${side}`];
    // glove cuff: hugs the forearm taper
    add(el, loft([{ y: -1.01, rx: 0.034, rz: 0.028 }, { y: -0.82, rx: 0.037, rz: 0.031 }, { y: -0.62, rx: 0.044, rz: 0.04 }].map((r) => ({ ...r, y: r.y * S.foreL, rx: r.rx * s * 1.12, rz: r.rz * s * 1.12 })), 18), mats.dark);
    // web launcher: housing + nozzle + glowing cartridge
    const L = new THREE.Group();
    L.position.set(0, -S.foreL * 0.74, 0.045 * s);
    el.add(L);
    add(L, box(0.05 * s, 0.085 * s, 0.035 * s), mats.metal);
    add(L, new THREE.CylinderGeometry(0.009 * s, 0.012 * s, 0.03 * s, 8), mats.metal, [0, -0.05 * s, 0.006 * s]);
    add(L, box(0.034 * s, 0.03 * s, 0.006), mats.accent, [0, 0.012 * s, 0.02 * s]);
    // thigh accent stripes (outer side)
    const hip = J[`hip${side}`];
    add(hip, box(0.012, S.thighL * 0.8, 0.02), mats.accent, [(side === "L" ? 1 : -1) * 0.085 * s, -S.thighL * 0.5, 0]);
    const shg = J[`sh${side}`];
    add(shg, box(0.012, S.upperL * 0.7, 0.02), mats.accent, [(side === "L" ? 1 : -1) * 0.06 * s, -S.upperL * 0.5, 0]);
  }
  // ---- back spine strand
  add(J.chest, box(0.012, 0.26 * s, 0.01), mats.accent, [0, 0.12 * s, -0.11 * s], [0.12, 0, 0]);

  // ---- hand anchor (where the web line leaves the right launcher)
  const handR = new THREE.Object3D();
  handR.position.set(0, -0.06 * s, 0.03);
  J.wrR.add(handR);
  const handL = new THREE.Object3D();
  handL.position.set(0, -0.06 * s, 0.03);
  J.wrL.add(handL);

  // ---- energy aura (Web Storm / full meter glow) + shield bubble
  const aura = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 16), new THREE.MeshBasicMaterial({ color: "#5ff", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  aura.position.y = 1;
  rig.root.add(aura);
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 2), new THREE.MeshBasicMaterial({ color: "#e8ffff", wireframe: true, transparent: true, opacity: 0 }));
  shield.position.y = 1;
  rig.root.add(shield);

  // per-hero geometries (lenses, emblem, belt, launchers) before merging
  const ownGeos = [];
  rig.root.traverse((o) => o.isMesh && ["ExtrudeGeometry", "TorusGeometry", "CylinderGeometry"].includes(o.geometry.type) && ownGeos.push(o.geometry));
  aura.userData.keep = true;
  shield.userData.keep = true;
  const mergedGeos = optimizeRig(rig);

  let textures = [];
  function setSuit(su) {
    for (const t of textures) t.dispose();
    const tex = suitTexture(su.base, su.accent, su.dark);
    tex.repeat.set(3, 3);
    textures = [tex];
    mats.suit.map = tex;
    mats.suit.color.set("#ffffff");
    mats.suit.sheenColor = new THREE.Color(su.accent);
    mats.suit.needsUpdate = true;
    mats.dark.color.set(su.dark);
    mats.accent.color.set(su.accent);
    mats.accent.emissive.set(su.accent);
    mats.lens.color.set(su.lens);
    mats.lens.emissive.set(su.lens);
    aura.material.color.set(su.accent);
  }
  setSuit(suit);

  /* ------------------------------------------------------------------ animation */
  const A = { ph: 0, climbPh: 0, t: 0, land: 0, flip: 0, lastAction: "none", lastMode: "ground", prevVy: 0, roll: 0, stepT: 0 };
  const target = zeroPose();

  function animate(h, W, dt) {
    A.t += dt;
    const t = A.t;
    for (const k in target) target[k] = 0;
    const p = target;
    let rate = 14;
    const sp = h.speed || 0;
    // landing squash
    if (h.landImpact > 4) A.land = Math.min(1, h.landImpact / 22);
    A.land = Math.max(0, A.land - dt * 3.2);

    const act = h.action;
    const atk = h.atk;
    if (act === "perch") {
      // the classic rooftop-edge crouch: one knee down, a hand on the ledge
      const b = Math.sin(t * 1.6) * 0.012;
      p.bodyY = -0.5 + b;
      p.spineRX = 0.55;
      p.chestRX = 0.1;
      p.headRX = -0.55;
      p.headRY = Math.sin(t * 0.4) * 0.25;
      p.lHipX = -1.75;
      p.lKnee = 2.3;
      p.lAnk = -0.4;
      p.rHipX = -0.55;
      p.rKnee = 2.45;
      p.rHipZ = -0.25;
      p.lShX = -0.55;
      p.lEl = -0.25;
      p.lShZ = 0.15;
      p.rShX = -0.35;
      p.rShZ = -0.35;
      p.rEl = -1.4;
      rate = 6;
    } else if (act === "defeated") {
      p.bodyRX = -1.45;
      p.bodyY = -S.hipY + 0.2;
      p.lShZ = 1.2;
      p.rShZ = -1.0;
      p.lHipX = -0.2;
      p.rKnee = 0.6;
      rate = 5;
    } else if (act === "knockdown") {
      const u = h.actT;
      if (u < 0.75) {
        p.bodyRX = -1.35;
        p.bodyY = -S.hipY + 0.25;
        p.lShZ = 1;
        p.rShZ = -1;
        p.lKnee = 1;
        p.rKnee = 0.4;
        rate = 9;
      } else {
        // push back up
        p.bodyY = -0.35;
        p.spineRX = 0.6;
        p.lKnee = 1.8;
        p.rKnee = 1.2;
        p.lHipX = -1.4;
        p.rHipX = -0.6;
        p.lShX = -0.6;
        p.rShX = -0.3;
        rate = 10;
      }
    } else if (act === "hurt") {
      poseIdle(p, t, 0.4);
      p.spineRX = -0.35;
      p.headRX = 0.3;
      p.lShZ = 0.7;
      p.rShZ = -0.7;
      p.bodyZ = -0.08;
      rate = 20;
    } else if (act === "victory") {
      // landing pose → fist raised, web hand sign
      poseIdle(p, t, 0, 0.6);
      p.rShX = -2.9;
      p.rShZ = -0.15;
      p.rEl = -0.25;
      p.lShZ = 0.35;
      p.lEl = -1.2;
      p.lShX = -0.3;
      p.chestRX = -0.18;
      p.headRX = -0.25;
      p.lHipZ = 0.16;
      p.rHipZ = -0.16;
      rate = 6;
    } else if (act === "rescue") {
      p.bodyY = -0.42;
      p.spineRX = 0.55;
      p.lHipX = -1.5;
      p.rHipX = -0.3;
      p.lKnee = 2.0;
      p.rKnee = 1.8;
      p.lShX = -1.2;
      p.rShX = -1.25;
      p.lEl = -0.6;
      p.rEl = -0.5;
      p.headRX = 0.25;
      rate = 8;
    } else if (act === "special") {
      // Web Storm: rise, curl, then explode outward spinning
      const u = h.actT;
      if (u < 0.5) {
        p.bodyRX = 0.4;
        p.lHipX = -1.8;
        p.rHipX = -1.6;
        p.lKnee = 2.2;
        p.rKnee = 2.2;
        p.lShX = -1.1;
        p.rShX = -1.1;
        p.lEl = -2.2;
        p.rEl = -2.2;
        p.lShZ = -0.2;
        p.rShZ = 0.2;
      } else {
        p.bodyRY = (u - 0.5) * 22;
        p.lShZ = 1.55;
        p.rShZ = -1.55;
        p.lHipZ = 0.5;
        p.rHipZ = -0.5;
        p.chestRX = -0.3;
      }
      rate = 18;
    } else if (act === "attack" && atk) {
      attackPose(p, atk, h);
      rate = 26;
    } else if (act === "dodge") {
      dodgePose(p, h);
      rate = 30;
    } else if (h.mode === "swing") {
      swingPose(p, h, t);
      rate = 11;
    } else if (h.mode === "climb") {
      A.climbPh += dt * (h.climbMove || 0) * 7;
      const c = Math.sin(A.climbPh);
      p.bodyZ = 0.12;
      p.spineRX = -0.1;
      p.headRX = -0.45;
      p.lShX = -2.5 - c * 0.45;
      p.rShX = -2.5 + c * 0.45;
      p.lShZ = 0.35;
      p.rShZ = -0.35;
      p.lEl = -0.7 + c * 0.4;
      p.rEl = -0.7 - c * 0.4;
      p.lHipX = -0.9 + c * 0.5;
      p.rHipX = -0.9 - c * 0.5;
      p.lHipZ = 0.35;
      p.rHipZ = -0.35;
      p.lKnee = 1.5 - c * 0.4;
      p.rKnee = 1.5 + c * 0.4;
      p.bodyY = -0.05;
      rate = 12;
    } else if (h.mode === "wallrun") {
      A.ph += dt * 16;
      poseRun(p, A.ph, 1.4, 0.05);
      const w = h.wall;
      // lean away from the wall
      const side = w ? Math.sign(w.nx * Math.cos(h.facing) - w.nz * Math.sin(h.facing)) || 1 : 1;
      p.bodyRZ = -side * 0.55;
      rate = 16;
    } else if (h.mode === "ledge") {
      p.bodyY = -0.3;
      p.spineRX = 0.5;
      p.lShX = -1.0;
      p.rShX = -1.0;
      p.lEl = 0;
      p.rEl = 0;
      p.lHipX = -1.6;
      p.rHipX = -1.1;
      p.lKnee = 2;
      p.rKnee = 1.6;
      rate = 16;
    } else if (!h.grounded) {
      poseAir(p, h.vy, t);
      // double jump: forward flip · release / wall-jump trick: corkscrew
      if (h.trick > 0) {
        const total = h.jumpsUsed === 2 ? 0.5 : 0.6;
        const u = 1 - h.trick / total;
        if (h.jumpsUsed === 2) {
          p.bodyRX = ease(u) * Math.PI * 2;
          tuck(p, 0.8);
        } else {
          p.bodyRY = ease(u) * Math.PI * 2;
          p.bodyRX = 0.35;
          tuck(p, 0.5);
        }
        rate = 40;
      } else if (sp > 18) {
        // fast glide after a release: superhero dive
        p.bodyRX = 0.6;
        p.lShX = -2.6;
        p.rShX = 0.6;
        p.lEl = -0.2;
        p.lHipX = 0.2;
        p.rHipX = 0.35;
        p.lKnee = 0.3;
        p.rKnee = 0.8;
        rate = 6;
      }
      rate = Math.min(rate, h.trick > 0 ? 40 : 10);
    } else {
      // grounded locomotion
      if (sp > 0.6) {
        const k = sp < 6 ? (sp / 6) * 0.5 : sp < 11 ? 0.5 + ((sp - 6) / 5) * 0.5 : 1 + Math.min(0.6, (sp - 11) / 6);
        A.ph += dt * (sp < 6 ? sp * 1.35 : 6 + sp * 0.62);
        poseRun(p, A.ph, k, k > 1.1 ? 0.18 : 0);
        if (k > 1.1) {
          // sprint: arms swept back, low lean (a hero dash, not a jog)
          p.lShX = Math.max(p.lShX, 0.2) + 0.5;
          p.rShX = Math.max(p.rShX, 0.2) + 0.5;
          p.lEl = -0.3;
          p.rEl = -0.3;
          p.lShZ = 0.25;
          p.rShZ = -0.25;
        }
        rate = 16;
      } else {
        const fighting = W.enemies.some((e) => !e.dead && e.state !== "defeated" && e.state !== "idle" && e.state !== "patrol" && Math.hypot(e.x - h.x, e.z - h.z) < 10);
        poseIdle(p, t, fighting ? 1 : 0);
        rate = 8;
      }
      if (A.land > 0) {
        p.bodyY -= A.land * 0.35;
        p.lKnee += A.land * 1.1;
        p.rKnee += A.land * 1.1;
        p.lHipX -= A.land * 0.6;
        p.rHipX -= A.land * 0.6;
        p.spineRX += A.land * 0.4;
        rate = 30;
      }
    }
    // web shot arm (overrides the right arm)
    if (h.webPose > 0 && act !== "attack" && act !== "dodge") {
      p.rShX = -1.55;
      p.rShZ = -0.05;
      p.rEl = -0.05;
      p.rWr = -0.9; // palm out — the thwip
      p.rGrip = -0.35;
      p.chestRY = -0.25;
    }
    // reset spin accumulators when leaving rotations behind (prevents unwinding)
    const c = rig.cur;
    for (const k of ["bodyRX", "bodyRY", "bodyRZ"]) {
      if (Math.abs(p[k]) < 1e-6 && Math.abs(c[k]) > Math.PI) c[k] = ((c[k] % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    }
    blendPose(rig, p, rate, dt);
    applyPose(rig);

    // effects state
    const full = W.energy >= 100;
    aura.material.opacity = act === "special" ? 0.28 + Math.sin(t * 30) * 0.08 : full ? 0.05 + Math.sin(t * 5) * 0.03 : 0;
    aura.scale.setScalar(act === "special" ? 1.2 + h.actT * 1.5 : 0.95);
    shield.material.opacity = h.shieldT > 0 ? Math.min(0.55, h.shieldT * 0.8) : 0;
    shield.rotation.y += dt * 2;
    mats.lens.emissiveIntensity = 0.5 + (full ? 0.4 + Math.sin(t * 6) * 0.2 : 0);
    // footstep cadence (for audio)
    A.stepT = h.grounded && sp > 1 ? A.ph : A.stepT;
  }

  function tuck(p, k) {
    p.lHipX = -1.9 * k;
    p.rHipX = -1.9 * k;
    p.lKnee = 2.3 * k;
    p.rKnee = 2.3 * k;
    p.lShX = -1.0 * k;
    p.rShX = -1.0 * k;
    p.lEl = -1.8 * k;
    p.rEl = -1.8 * k;
    p.spineRX = 0.5 * k;
  }

  function swingPose(p, h, t) {
    const s = h.swing;
    // forward speed relative to facing decides the pendulum phase look
    const vf = Math.hypot(h.vx, h.vz);
    const up = Math.max(-1, Math.min(1, h.vy / 14));
    p.rShX = -3.0; // web arm straight up the line
    p.rShZ = 0.15;
    p.rEl = -0.12;
    p.lShX = -0.6 - up * 0.5;
    p.lShZ = 0.9;
    p.lEl = -0.9;
    // legs: tucked through the bottom of the arc, extended at the ends
    const low = s ? Math.max(0, Math.min(1, (s.ay - h.y - 1.5) / (s.len || 10))) : 0.5;
    p.lHipX = -0.9 * low - 0.3 + up * 0.4;
    p.rHipX = -0.3 * low + 0.1 + up * 0.2;
    p.lKnee = 1.3 * low + 0.3;
    p.rKnee = 0.6 * low + 0.2;
    p.spineRX = -0.15 + up * 0.25;
    p.chestRX = -0.1;
    p.headRX = -0.3 - up * 0.2;
    p.bodyRZ = Math.sin(t * 1.3) * 0.05;
    if (vf > 22) {
      p.lHipX -= 0.2;
      p.lShX = -0.2;
      p.lShZ = 1.2;
    }
  }

  function dodgePose(p, h) {
    const u = Math.min(1, h.actT / 0.32);
    const f = Math.sin(h.facing);
    const g = Math.cos(h.facing);
    const [dx, dz] = h.dodgeDir;
    const fwd = dx * f + dz * g;
    const side = dx * -g + dz * f; // + = toward the hero's right… sign used for the roll direction
    tuck(p, 0.85);
    p.bodyY = -0.45;
    if (Math.abs(fwd) >= Math.abs(side)) p.bodyRX = (fwd >= 0 ? 1 : -1) * ease(u) * Math.PI * 2;
    else p.bodyRZ = (side >= 0 ? -1 : 1) * ease(u) * Math.PI * 2;
  }

  function attackPose(p, a, h) {
    const mv = MOVES[a.move];
    const t = a.t;
    const w = mv.wind;
    const act = mv.act;
    const uW = Math.min(1, t / Math.max(0.01, w));
    const uA = Math.max(0, Math.min(1, (t - w) / Math.max(0.01, act)));
    const uR = Math.max(0, Math.min(1, (t - w - act) / Math.max(0.01, mv.rec)));
    const strike = uA > 0 ? 1 - uR * 0.7 : 0;
    poseIdle(p, 0, 1, 0);
    p.lGrip = 1;
    p.rGrip = 1;
    switch (mv.anim) {
      case "punchR":
        p.chestRY = 0.35 * uW - 0.7 * strike;
        p.rShX = 0.3 * uW - 1.85 * strike;
        p.rEl = -1.9 * (1 - strike) - 0.05;
        p.rShZ = -0.2;
        p.spineRX = 0.15;
        p.lShX = -0.8;
        p.lEl = -1.9;
        p.rHipX = 0.25;
        p.lHipX = -0.35;
        p.lKnee = 0.35;
        break;
      case "punchL":
        p.chestRY = -0.35 * uW + 0.7 * strike;
        p.lShX = 0.3 * uW - 1.85 * strike;
        p.lEl = -1.9 * (1 - strike) - 0.05;
        p.lShZ = 0.2;
        p.spineRX = 0.15;
        p.rShX = -0.8;
        p.rEl = -1.9;
        p.lHipX = 0.25;
        p.rHipX = -0.35;
        p.rKnee = 0.35;
        break;
      case "roundKick":
        p.bodyRY = -(uW * 0.6 + uA * 5.6 + uR * 0.08);
        p.rHipZ = -1.35 * Math.max(uW * 0.5, strike);
        p.rHipX = -0.4 * strike;
        p.rKnee = 0.9 * (1 - strike) + 0.1;
        p.lKnee = 0.3;
        p.spineRZ = 0.3 * strike;
        p.lShZ = 0.9;
        p.rShZ = -0.9;
        break;
      case "frontKick":
        p.rHipX = -0.6 * uW - 1.0 * strike;
        p.rKnee = 1.6 * (1 - strike) * Math.min(1, uW * 2) + 0.05;
        p.spineRX = -0.2 * strike;
        p.lKnee = 0.3;
        break;
      case "launchKick":
        p.rHipX = -0.5 * uW - 2.2 * strike;
        p.rKnee = 1.2 * (1 - strike) + 0.05;
        p.spineRX = -0.5 * strike;
        p.lShZ = 0.8;
        p.rShZ = -0.8;
        p.bodyY = 0.1 * strike;
        break;
      case "heavyPunch":
        p.chestRY = 0.7 * uW - 0.9 * strike;
        p.spineRX = -0.1 * uW + 0.35 * strike;
        p.rShX = 0.7 * uW - 1.9 * strike;
        p.rEl = -2.2 * (1 - strike) - 0.05;
        p.lShX = -0.5 + 0.6 * strike;
        p.lEl = -1.5;
        p.lHipX = -0.7 * strike - 0.2;
        p.lKnee = 0.6 * strike + 0.2;
        p.rHipX = 0.5 * strike;
        p.bodyY = -0.12 * strike;
        break;
      case "aerialStrike":
        p.bodyRX = uW * 0.7 + uA * 5.6;
        p.rHipX = -2.2 * (1 - uA) + 0.3 * uA;
        p.lHipX = -0.6;
        p.rKnee = 0.1;
        p.lKnee = 1.2;
        p.lShZ = 1;
        p.rShZ = -1;
        break;
      case "counter":
        p.bodyRY = uW * 0.8 + uA * 5.5;
        p.rShX = -1.5 * strike;
        p.rShZ = -1.2 * strike;
        p.rEl = -0.1;
        p.lHipZ = 1.1 * strike;
        p.spineRZ = -0.3 * strike;
        break;
      case "finisher":
        // leap, then double-fist hammer
        p.bodyY = 0.5 * Math.sin(Math.min(1, t / (w + act)) * Math.PI);
        p.lShX = -2.9 * (1 - strike) - 1.2 * strike;
        p.rShX = -2.9 * (1 - strike) - 1.2 * strike;
        p.lEl = -0.4;
        p.rEl = -0.4;
        p.lShZ = -0.3;
        p.rShZ = 0.3;
        p.spineRX = -0.4 * (1 - strike) + 0.6 * strike;
        p.lKnee = 1.2;
        p.rKnee = 1.2;
        p.lHipX = -0.8;
        p.rHipX = -0.8;
        break;
      default:
        p.rShX = -1.6 * strike;
    }
    if (a.air) p.bodyY = Math.max(p.bodyY, 0);
    void h;
  }

  /** fade the hero out when the camera is squeezed right up against them */
  let fade = 1;
  function setFade(k) {
    if (Math.abs(k - fade) < 0.01) return;
    fade = k;
    for (const m of [mats.suit, mats.dark, mats.accent, mats.lens, mats.rim, mats.metal]) {
      m.transparent = k < 0.99;
      m.opacity = k;
      m.depthWrite = k > 0.5;
    }
  }

  /** world position of the web hand (for the web line) */
  const _v = new THREE.Vector3();
  function webHand(out = _v, left = false) {
    rig.root.updateMatrixWorld(true);
    return (left ? handL : handR).getWorldPosition(out);
  }

  function dispose() {
    for (const t of textures) t.dispose();
    for (const m of Object.values(mats)) m.dispose();
    for (const g of ownGeos) g.dispose();
    for (const g of mergedGeos) g.dispose();
    aura.geometry.dispose();
    shield.geometry.dispose();
    aura.material.dispose();
    shield.material.dispose();
  }

  return { root: rig.root, rig, animate, setSuit, webHand, setFade, dispose, anim: A, mats };
}

export { sphere };
