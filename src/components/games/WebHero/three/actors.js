/**
 * Web Hero — enemy, civilian and boss views (all built on the shared
 * humanoid rig, except the drone). Each view has update(dt, t) that reads
 * its engine entity and poses / tints the model:
 *
 *   thug      hoodie + beanie, brass knuckles      bruiser   huge, vest, bald, chain
 *   gunner    jacket + cap + rifle                 shield    riot helmet + riot shield
 *   assassin  slim, hood + red visor, twin blades  runner    thug in a bright tracksuit
 *   drone     quad-rotor with a red eye            civilian  casual clothes, cowers
 *
 * Readability: a red warning ring grows under an enemy during its windup
 * (attack telegraph), a "!" pops on alert, a small health bar appears once
 * hurt, webbed enemies wear a white cocoon, hit enemies flash white.
 *
 * Bosses (createBossView): IRON BRUISER (armoured giant, orange core),
 * DRONE COMMANDER (jetpack, energy shield bubble), SHOCK STRIKER (lightning
 * suit, crackling aura), SHADOW HUNTER (cloak; fades when invisible, blue
 * glow in counter stance), TITAN OVERLORD (4 m mech, core vents, pylons).
 * The weak point glows bright whenever damage can land.
 */
import * as THREE from "three";
import { buildHumanoid, blendPose, applyPose, zeroPose, poseIdle, poseRun, poseAir, clothMat, skinMat, denimMap, shell, optimizeRig } from "./humanoid.js";

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o });

// natural variety: every enemy / civilian gets its own skin tone, hair, beard
const SKIN_TONES = ["#f1c9a5", "#e6b590", "#d29a72", "#b97e57", "#9a6442", "#7a4a2e", "#5e3a24"];
const HAIR_COLS = ["#16100b", "#2b1d12", "#4a2e18", "#6b4424", "#a07040", "#1b1b1d", "#5a5a5e"];
const pick = (arr, seed, k = 0) => arr[(seed * 7 + k * 13) % arr.length];

/**
 * outfit: top / bottom / shoes colours, cloth fit, headwear, extra detail flags.
 * Materials: fabric-weave cloth, denim twill jeans, leather, skin with sheen.
 */
const OUTFITS = {
  thug: { top: "#5b6472", denim: "#2f3d5c", shoes: "#e8e8e8", sole: "#f4f4f4", hat: "beanie", hatCol: "#b23a3a", fit: { top: 1.13, legs: 1.07 }, hoodie: true, knuckles: true },
  runner: { top: "#1fb36b", bottom: "#1fb36b", shoes: "#ffffff", sole: "#ffffff", hat: "cap", hatCol: "#111", fit: { top: 1.1, legs: 1.08 }, stripes: true },
  bruiser: { top: "#2e2e30", bottom: "#4a3e33", shoes: "#2a2018", sole: "#141010", hat: null, height: 2.15, bulk: 1.45, sleeveless: true, beard: true, hair: "bald", fit: { top: 1.04, legs: 1.1 }, chain: true, vest: "#3a2a1e" },
  gunner: { top: "#3a4a36", bottom: "#4a4434", shoes: "#1c1c1c", sole: "#0e0e0e", hat: "cap", hatCol: "#3d3d3d", fit: { top: 1.12, legs: 1.1 }, tactical: true },
  shield: { top: "#1e2a44", bottom: "#1e2a44", shoes: "#0f0f0f", sole: "#090909", hat: "helmet", hatCol: "#1b1e26", bulk: 1.12, fit: { top: 1.12, legs: 1.08 }, armor: true },
  assassin: { top: "#15151c", bottom: "#15151c", shoes: "#0c0c10", sole: "#060608", hat: "hood", hatCol: "#101016", height: 1.78, bulk: 0.92, masked: true, fit: { top: 1.06, legs: 1.04 } },
};

function telegraphRing(color = "#ff3030") {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 3;
  m.visible = false;
  return m;
}
function bangSprite() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#ffcc00";
  g.beginPath();
  g.moveTo(32, 2);
  g.lineTo(62, 58);
  g.lineTo(2, 58);
  g.closePath();
  g.fill();
  g.fillStyle = "#1a1a1a";
  g.font = "900 40px Arial";
  g.textAlign = "center";
  g.fillText("!", 32, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(0.6, 0.6, 1);
  s.visible = false;
  s.renderOrder = 10;
  return s;
}
function hpBar() {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.09), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.6, depthTest: false }));
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.06), new THREE.MeshBasicMaterial({ color: "#ff4a3a", depthTest: false }));
  fg.position.z = 0.001;
  bg.renderOrder = 11;
  fg.renderOrder = 12;
  g.add(bg, fg);
  g.visible = false;
  return { g, fg };
}
function cocoon() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), new THREE.MeshStandardMaterial({ color: "#f4f7ff", roughness: 0.9, wireframe: true, transparent: true, opacity: 0.9 }));
  m.scale.set(1, 1.6, 1);
  m.visible = false;
  return m;
}

/* ================================================================== humanoid enemies */
export function createEnemyView(e, { shadows }) {
  if (e.kind === "drone") return createDroneView(e, { shadows });
  const kind = e.runner ? "runner" : e.kind;
  const O = OUTFITS[kind] || OUTFITS.thug;
  const seed = e.id * 37 + 11;
  const skinCol = O.masked ? "#15151c" : pick(SKIN_TONES, seed);
  const hairCol = pick(HAIR_COLS, seed, 1);
  const mats = {
    top: clothMat(O.top),
    bottom: O.denim ? clothMat("#ffffff", { map: denimMap(O.denim), roughness: 0.92 }) : clothMat(O.bottom, { roughness: 0.92 }),
    shoes: O.hat === "hood" ? clothMat(O.shoes) : mat(O.shoes, { roughness: 0.55 }),
    sole: mat(O.sole || "#eeeeee", { roughness: 0.9 }),
    skin: O.masked ? clothMat(skinCol) : skinMat(skinCol),
    hair: mat(hairCol, { roughness: 0.85 }),
    extra: clothMat(O.hatCol || "#222"),
    leather: mat(O.vest || "#2a2622", { roughness: 0.5, metalness: 0.1 }),
    metal: mat("#9aa0a8", { metalness: 0.85, roughness: 0.32 }),
  };
  const hair = O.hair || (O.hat === "hood" ? null : O.hat ? "buzz" : ["short", "buzz", "short", "long"][seed % 4]);
  const rig = buildHumanoid({
    height: O.height || 1.78,
    bulk: O.bulk || 1,
    shoulder: kind === "bruiser" ? 0.225 : 0.205,
    shadows,
    face: !O.masked,
    eyeColor: pick(["#3a2a1c", "#2a3a4a", "#3a4a2a", "#1c1410"], seed, 2),
    hair,
    beard: O.beard || (!O.masked && seed % 5 === 0),
    fit: O.fit,
    staticHands: true,
    staticGrip: 0.7,
    mats: { top: mats.top, bottom: mats.bottom, shoes: mats.shoes, sole: mats.sole, hands: O.tactical || O.armor || O.masked ? mats.leather : mats.skin, head: mats.skin, neck: O.armor ? mats.top : mats.skin, arms: O.sleeveless ? mats.skin : mats.top, hair: mats.hair },
  });
  const { joints: J, size: S } = rig;
  const own = [];
  const add = (parent, geo, m, pos, rot, scl) => {
    const x = new THREE.Mesh(geo, m);
    if (pos) x.position.set(...pos);
    if (rot) x.rotation.set(...rot);
    if (scl) x.scale.set(...scl);
    x.castShadow = !!shadows;
    parent.add(x);
    own.push(geo);
    return x;
  };
  const hr = S.hr;
  const s = S.s;
  // headwear
  if (O.hat === "beanie") {
    add(J.head, new THREE.SphereGeometry(hr * 1.02, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.extra, [0, hr * 1.02, -hr * 0.06], [-0.12, 0, 0], [0.98, 1.05, 1.06]);
    add(J.head, new THREE.TorusGeometry(hr * 0.94, hr * 0.12, 8, 24), mats.extra, [0, hr * 1.22, -hr * 0.04], [Math.PI / 2 - 0.12, 0, 0], [0.98, 1.06, 1]);
  }
  if (O.hat === "cap") {
    add(J.head, new THREE.SphereGeometry(hr * 0.98, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mats.extra, [0, hr * 1.2, -hr * 0.04], [-0.08, 0, 0], [0.98, 0.95, 1.06]);
    add(J.head, new THREE.CylinderGeometry(hr * 0.62, hr * 0.62, 0.012, 18, 1, false, -Math.PI / 2, Math.PI), mats.extra, [0, hr * 1.24, hr * 0.78], [0.18, 0, 0], [1.2, 1, 1]);
  }
  if (O.hat === "helmet") {
    add(J.head, new THREE.SphereGeometry(hr * 1.2, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), mats.extra, [0, hr * 0.98, -hr * 0.04]);
    add(J.head, new THREE.SphereGeometry(hr * 1.22, 18, 8, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.32, Math.PI * 0.3), new THREE.MeshStandardMaterial({ color: "#9fc4ff", transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.4 }), [0, hr * 0.98, 0]);
  }
  if (O.hat === "hood") {
    add(J.head, new THREE.SphereGeometry(hr * 1.18, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), mats.extra, [0, hr * 0.95, -hr * 0.1], null, [1, 1.08, 1.08]);
    add(J.chest, new THREE.ConeGeometry(0.16 * s, 0.28 * s, 14, 1, true), mats.extra, [0, 0.36 * s, -0.06 * s], [0.25, 0, 0]);
    add(J.head, new THREE.BoxGeometry(hr * 1.3, hr * 0.16, hr * 0.12), new THREE.MeshBasicMaterial({ color: "#ff2a3a" }), [0, hr * 0.98, hr * 0.86]);
  }
  // clothing details + archetype gear
  let shieldMesh = null;
  if (O.hoodie) {
    // hood bunched on the back, drawstrings, kangaroo pocket
    add(J.chest, new THREE.SphereGeometry(0.115 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.top, [0, 0.27 * s, -0.11 * s], [-1.0, 0, 0], [1.1, 0.8, 0.9]);
    for (const sx of [1, -1]) add(J.chest, new THREE.CylinderGeometry(0.005 * s, 0.005 * s, 0.14 * s, 5), mats.sole, [sx * 0.035 * s, 0.18 * s, 0.145 * s], [0.12, 0, 0]);
    add(J.spine, new THREE.BoxGeometry(0.19 * s, 0.09 * s, 0.012 * s), mats.top, [0, 0.07 * s, 0.1 * s * 1.13]);
  }
  if (O.knuckles) add(J.wrR, new THREE.TorusGeometry(0.034 * s, 0.009 * s, 6, 12, Math.PI), mats.metal, [0, -0.09 * s, 0.018 * s], [0, 0, Math.PI]);
  if (O.stripes) {
    const w = mat("#ffffff", { roughness: 0.6 });
    mats.stripe = w;
    for (const side of ["L", "R"]) {
      const sx = side === "L" ? 1 : -1;
      add(J[`sh${side}`], new THREE.BoxGeometry(0.012 * s, S.upperL * 0.95, 0.02 * s), w, [sx * 0.064 * s, -S.upperL * 0.5, 0]);
      add(J[`hip${side}`], new THREE.BoxGeometry(0.012 * s, S.thighL * 0.95, 0.02 * s), w, [sx * 0.1 * s, -S.thighL * 0.5, 0]);
      add(J[`knee${side}`], new THREE.BoxGeometry(0.012 * s, S.shinL * 0.8, 0.02 * s), w, [sx * 0.068 * s, -S.shinL * 0.45, 0]);
    }
  }
  if (kind === "bruiser") {
    // leather vest over a tank top, heavy chain, belt
    shell(rig, "chest", mats.leather, { k: 1.07, p: 2.5, from: 0, to: 4, shadows });
    shell(rig, "abdomen", mats.leather, { k: 1.07, p: 2.4, from: 2, to: 4, shadows });
    add(J.chest, new THREE.TorusGeometry(0.15 * s * 1.3, 0.018 * s, 6, 22), mats.metal, [0, 0.27 * s, 0.03 * s], [Math.PI / 2.3, 0, 0]);
    add(J.body, new THREE.TorusGeometry(0.16 * s * 1.45, 0.022 * s, 6, 22), mats.leather, [0, 0.11 * s, 0], [Math.PI / 2, 0, 0], [1, 0.7, 1]);
  }
  if (O.tactical) {
    // plate carrier with pouches + a proper rifle
    shell(rig, "chest", mats.leather, { k: 1.1, p: 3.2, from: 0, to: 3, shadows });
    shell(rig, "abdomen", mats.leather, { k: 1.1, p: 3, from: 3, to: 4, shadows });
    const pouch = clothMat("#4a5440");
    mats.pouch = pouch;
    for (const x of [-0.075, 0, 0.075]) add(J.chest, new THREE.BoxGeometry(0.062 * s, 0.085 * s, 0.035 * s), pouch, [x * s, 0.0 * s, 0.128 * s]);
    const gun = new THREE.Group();
    gun.position.set(0, -0.07 * s, 0.05 * s);
    J.wrR.add(gun);
    const gm = mat("#1d1d1f", { metalness: 0.7, roughness: 0.35 });
    mats.gun = gm;
    add(gun, new THREE.BoxGeometry(0.05 * s, 0.07 * s, 0.38 * s), gm, [0, 0, 0.12 * s]);
    add(gun, new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.26 * s, 8), gm, [0, 0.01 * s, 0.42 * s], [Math.PI / 2, 0, 0]);
    add(gun, new THREE.BoxGeometry(0.035 * s, 0.11 * s, 0.05 * s), gm, [0, -0.08 * s, 0.14 * s], [0.25, 0, 0]);
    add(gun, new THREE.BoxGeometry(0.04 * s, 0.08 * s, 0.16 * s), gm, [0, -0.02 * s, -0.12 * s]);
    add(gun, new THREE.BoxGeometry(0.03 * s, 0.03 * s, 0.1 * s), gm, [0, 0.055 * s, 0.1 * s]);
  }
  if (O.armor) {
    // riot armour: chest plate, shoulder pads, knee pads + the riot shield
    const am = mat("#2a3550", { metalness: 0.5, roughness: 0.4 });
    mats.armor = am;
    shell(rig, "chest", am, { k: 1.12, p: 2.8, from: 0, to: 4, shadows });
    for (const side of ["L", "R"]) {
      add(J[`sh${side}`], new THREE.SphereGeometry(0.09 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), am, [0, 0.015 * s, 0], null, [1.15, 0.9, 1.15]);
      add(J[`knee${side}`], new THREE.BoxGeometry(0.1 * s, 0.12 * s, 0.05 * s), am, [0, -0.02 * s, 0.06 * s]);
    }
    const sm = new THREE.MeshStandardMaterial({ color: "#a8c4ff", transparent: true, opacity: 0.5, roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide });
    mats.shield = sm;
    shieldMesh = add(J.elL, new THREE.BoxGeometry(0.6, 1.0, 0.035), sm, [0.02, -0.18, 0.2]);
    add(shieldMesh, new THREE.BoxGeometry(0.62, 1.02, 0.02), mat("#20242c", { metalness: 0.6, roughness: 0.4, wireframe: true }), [0, 0, 0]);
    add(shieldMesh, new THREE.BoxGeometry(0.34, 0.06, 0.01), new THREE.MeshBasicMaterial({ color: "#ffffff" }), [0, 0.32, 0.025]);
  }
  if (kind === "assassin") {
    for (const w of [J.wrL, J.wrR]) {
      add(w, new THREE.BoxGeometry(0.008 * s, 0.035 * s, 0.42 * s), mat("#d9e2ea", { metalness: 0.95, roughness: 0.12 }), [0, -0.07 * s, 0.2 * s]);
      add(w, new THREE.BoxGeometry(0.03 * s, 0.03 * s, 0.07 * s), mats.leather, [0, -0.07 * s, -0.01 * s]);
    }
    add(J.body, new THREE.TorusGeometry(0.14 * s, 0.014 * s, 6, 20), mat("#7a1a22", { roughness: 0.7 }), [0, 0.08 * s, 0], [Math.PI / 2, 0, 0], [1, 0.72, 1]);
  }

  const mergedGeos = optimizeRig(rig);
  const root = rig.root;
  const ring = telegraphRing();
  const bang = bangSprite();
  const bar = hpBar();
  const coc = cocoon();
  coc.position.y = 0.95;
  root.add(coc);
  const group = new THREE.Group();
  group.add(root, ring, bang, bar.g);
  const flashMats = [mats.top, mats.bottom, mats.skin];
  const target = zeroPose();
  let ph = Math.random() * 6;
  let lx = e.x;
  let lz = e.z;
  let t = 0;
  let lastState = e.state;
  let stateT = 0;

  function update(dt, cam) {
    t += dt;
    const vis = !e.dead;
    group.visible = vis;
    if (!vis) return;
    const sp = Math.hypot(e.x - lx, e.z - lz) / Math.max(dt, 1e-4);
    lx = e.x;
    lz = e.z;
    if (e.state !== lastState) {
      lastState = e.state;
      stateT = 0;
    }
    stateT += dt;
    root.position.set(e.x, e.y, e.z);
    root.rotation.y = e.facing;
    for (const k in target) target[k] = 0;
    const p = target;
    let rate = 12;
    const st = e.state;
    const wind = e.K.wind;
    if (st === "defeated") {
      p.bodyRX = -1.45;
      p.bodyY = -S.hipY + 0.18;
      p.lShZ = 1.2;
      p.rShZ = -1.1;
      p.rKnee = 0.5;
      rate = 7;
      const fade = Math.max(0, 1 - Math.max(0, e.deadT - 1.6) / 0.9);
      root.scale.setScalar(Math.max(0.01, fade));
    } else {
      root.scale.setScalar(1);
      if (e.web > 0) {
        poseIdle(p, t, 0);
        p.lShZ = 0.05;
        p.rShZ = -0.05;
        p.lEl = 0;
        p.rEl = 0;
        p.headRX = Math.sin(t * 9) * 0.1;
        p.bodyRZ = Math.sin(t * 7) * 0.06;
        rate = 10;
      } else if (st === "airborne") {
        poseAir(p, e.vy, t);
        p.bodyRX = -0.6 + stateT * 4;
        rate = 10;
      } else if (st === "down") {
        p.bodyRX = -1.4;
        p.bodyY = -S.hipY + 0.2;
        p.lShZ = 1;
        p.rShZ = -1;
        if (stateT > 0.7) {
          p.bodyRX = -0.4;
          p.bodyY = -0.5;
          p.lKnee = 2;
          p.rKnee = 2;
          p.lHipX = -1.5;
          p.rHipX = -1.5;
        }
        rate = 9;
      } else if (st === "stunned") {
        poseIdle(p, t, 0.2);
        p.spineRX = -0.25 + Math.sin(t * 8) * 0.05;
        p.headRX = 0.3;
        p.bodyRZ = Math.sin(t * 6) * 0.12;
        p.lShX = -2.2;
        p.rShX = -2.1;
        p.lEl = -2.2;
        p.rEl = -2.2;
        rate = 14;
      } else if (st === "windup") {
        poseIdle(p, t, 1);
        const u = Math.min(1, e.t / wind);
        if (e.K.ranged) {
          p.rShX = -1.5;
          p.rEl = -0.1;
          p.lShX = -1.3;
          p.lEl = -0.6;
          p.lShY = -0.5;
          p.chestRY = 0.25;
        } else if (e.K.slam) {
          p.lShX = -2.9 * u;
          p.rShX = -2.9 * u;
          p.lEl = -0.6;
          p.rEl = -0.6;
          p.spineRX = -0.3 * u;
          p.bodyY = -0.1 * u;
        } else {
          p.chestRY = 0.6 * u;
          p.rShX = 0.5 * u;
          p.rEl = -1.9;
          p.spineRX = -0.1 * u;
          p.lHipX = -0.3;
          p.lKnee = 0.4;
          if (kind === "assassin") {
            p.bodyY = -0.25 * u;
            p.spineRX = 0.5 * u;
          }
        }
        rate = 14;
      } else if (st === "active" || (st === "recover" && stateT < 0.12)) {
        poseIdle(p, t, 1);
        if (e.K.ranged) {
          p.rShX = -1.55;
          p.rEl = -0.05;
          p.lShX = -1.3;
          p.lEl = -0.6;
          p.chestRY = 0.25;
          p.spineRX = -0.08;
        } else if (e.K.slam) {
          p.lShX = -1.0;
          p.rShX = -1.0;
          p.spineRX = 0.8;
          p.bodyY = -0.3;
          p.lKnee = 0.8;
          p.rKnee = 0.8;
        } else {
          p.chestRY = -0.7;
          p.rShX = -1.75;
          p.rEl = -0.05;
          p.spineRX = 0.2;
          p.lHipX = -0.5;
          p.lKnee = 0.5;
        }
        rate = 30;
      } else if (st === "alert") {
        poseIdle(p, t, 0.6);
        p.bodyY = stateT < 0.2 ? 0.06 : 0;
        p.spineRX = -0.15;
        rate = 16;
      } else if (sp > 0.5) {
        const k = sp < 3 ? 0.35 : sp < 6 ? 0.8 : 1.2;
        ph += dt * (4 + sp * 0.9);
        poseRun(p, ph, k);
        if (kind === "shield" && e.guardBroken <= 0) {
          p.lShX = -1.3;
          p.lEl = -1.2;
        }
        if (kind === "gunner") {
          p.rShX = -0.5;
          p.rEl = -1.0;
        }
        rate = 12;
      } else {
        poseIdle(p, t, st === "idle" || st === "patrol" ? 0 : 1);
        if (kind === "shield" && e.guardBroken <= 0) {
          p.lShX = -1.4;
          p.lEl = -1.25;
          p.lShY = 0.3;
        }
        rate = 8;
      }
    }
    blendPose(rig, p, rate, dt);
    applyPose(rig);
    if (shieldMesh) {
      shieldMesh.visible = e.guardBroken <= 0 || st === "defeated";
      shieldMesh.material.opacity = e.guardBroken > 0 ? 0.2 : 0.55;
    }
    // telegraph ring: grows to full as the strike lands
    const tele = st === "windup" && !e.K.ranged;
    ring.visible = tele;
    if (tele) {
      const u = Math.min(1, e.t / wind);
      const R = (e.K.reach + 0.4) * (0.45 + u * 0.55);
      ring.scale.setScalar(R);
      ring.position.set(e.x, e.y + 0.05, e.z);
      ring.material.opacity = 0.35 + u * 0.6;
      ring.material.color.set(u > 0.8 ? "#ff1a1a" : "#ff8a2a");
    }
    bang.visible = st === "alert" || (st === "windup" && e.K.ranged);
    bang.position.set(e.x, e.y + S.H + 0.55 + (st === "alert" ? Math.sin(stateT * 20) * 0.04 : 0), e.z);
    if (st === "windup" && e.K.ranged) bang.material.color.set("#ff6a6a");
    else bang.material.color.set("#ffffff");
    // health bar (once damaged)
    const showBar = st !== "defeated" && e.hp < e.maxHp;
    bar.g.visible = showBar;
    if (showBar) {
      bar.g.position.set(e.x, e.y + S.H + 0.32, e.z);
      if (cam) bar.g.quaternion.copy(cam.quaternion);
      const f = Math.max(0, e.hp / e.maxHp);
      bar.fg.scale.x = Math.max(0.001, f);
      bar.fg.position.x = -0.43 * (1 - f);
    }
    coc.visible = e.web > 0 && st !== "defeated";
    // hit flash
    const fl = e.flash > 0 ? Math.min(1, e.flash * 7) : 0;
    for (const m of flashMats) {
      m.emissive.setRGB(fl, fl, fl);
      m.emissiveIntensity = fl ? 0.9 : 0;
    }
  }

  function dispose() {
    for (const g of own) g.dispose();
    for (const g of mergedGeos) g.dispose();
    for (const m of Object.values(mats)) m.dispose();
    ring.geometry.dispose();
    ring.material.dispose();
    bang.material.map.dispose();
    bang.material.dispose();
    bar.g.children.forEach((c) => (c.geometry.dispose(), c.material.dispose()));
    coc.geometry.dispose();
    coc.material.dispose();
  }
  return { root: group, update, dispose, e };
}

/* ================================================================== drone */
function createDroneView(e, { shadows }) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const shell = mat("#2c3340", { metalness: 0.7, roughness: 0.35 });
  const trim = mat("#e9b21a", { metalness: 0.4, roughness: 0.4 });
  const eye = new THREE.MeshBasicMaterial({ color: "#ff2a2a" });
  const own = [];
  const add = (geo, m, pos, rot) => {
    const x = new THREE.Mesh(geo, m);
    if (pos) x.position.set(...pos);
    if (rot) x.rotation.set(...rot);
    x.castShadow = !!shadows;
    body.add(x);
    own.push(geo);
    return x;
  };
  add(new THREE.SphereGeometry(0.42, 16, 12), shell, [0, 0, 0]).scale.set(1, 0.6, 1.2);
  add(new THREE.CylinderGeometry(0.16, 0.18, 0.12, 12), eye, [0, -0.08, 0.42], [Math.PI / 2, 0, 0]);
  const rotors = [];
  for (const [x, z] of [[0.55, 0.55], [-0.55, 0.55], [0.55, -0.55], [-0.55, -0.55]]) {
    add(new THREE.BoxGeometry(0.08, 0.05, 0.75), trim, [x / 2, 0.02, z / 2], [0, Math.atan2(x, z), 0]);
    const r = add(new THREE.BoxGeometry(0.6, 0.015, 0.06), mat("#111"), [x, 0.12, z]);
    rotors.push(r);
    add(new THREE.CylinderGeometry(0.33, 0.33, 0.04, 16, 1, true), new THREE.MeshBasicMaterial({ color: "#9aa", transparent: true, opacity: 0.25, side: THREE.DoubleSide }), [x, 0.12, z]);
  }
  const ring = telegraphRing();
  const bar = hpBar();
  const coc = cocoon();
  coc.scale.set(1.1, 0.8, 1.1);
  body.add(coc);
  const group = new THREE.Group();
  group.add(g, ring, bar.g);
  let lx = e.x;
  let lz = e.z;
  let t = 0;
  function update(dt, cam) {
    t += dt;
    group.visible = !e.dead;
    if (e.dead) return;
    const vx = (e.x - lx) / Math.max(dt, 1e-4);
    const vz = (e.z - lz) / Math.max(dt, 1e-4);
    lx = e.x;
    lz = e.z;
    g.position.set(e.x, e.y, e.z);
    g.rotation.y = e.facing;
    const f = Math.sin(e.facing);
    const c = Math.cos(e.facing);
    body.rotation.x = Math.max(-0.4, Math.min(0.4, (vx * f + vz * c) * 0.05));
    body.rotation.z = Math.max(-0.4, Math.min(0.4, -(vx * c - vz * f) * 0.05));
    const down = e.state === "defeated" || e.web > 0;
    for (const r of rotors) r.rotation.y += dt * (down ? 6 : 40);
    if (down) body.rotation.z += dt * 6;
    eye.color.set(e.state === "windup" ? (Math.sin(t * 30) > 0 ? "#ffffff" : "#ff2a2a") : "#ff2a2a");
    coc.visible = e.web > 0;
    ring.visible = false;
    const showBar = e.hp < e.maxHp && e.state !== "defeated";
    bar.g.visible = showBar;
    if (showBar) {
      bar.g.position.set(e.x, e.y + 0.8, e.z);
      if (cam) bar.g.quaternion.copy(cam.quaternion);
      const fr = Math.max(0, e.hp / e.maxHp);
      bar.fg.scale.x = Math.max(0.001, fr);
      bar.fg.position.x = -0.43 * (1 - fr);
    }
    const fl = e.flash > 0 ? 1 : 0;
    shell.emissive.setRGB(fl, fl, fl);
    shell.emissiveIntensity = fl;
    if (e.state === "defeated") g.scale.setScalar(Math.max(0.01, 1 - Math.max(0, e.deadT - 1) / 1));
  }
  function dispose() {
    for (const x of own) x.dispose();
    shell.dispose();
    trim.dispose();
    eye.dispose();
    ring.geometry.dispose();
    ring.material.dispose();
    bar.g.children.forEach((ch) => (ch.geometry.dispose(), ch.material.dispose()));
    coc.geometry.dispose();
    coc.material.dispose();
    body.traverse((o) => o.isMesh && o.material && o.material.dispose && o.material.dispose());
  }
  return { root: group, update, dispose, e };
}

/* ================================================================== civilians */
export function createCivilianView(c, { shadows }) {
  const hue = c.tint;
  const seed = Math.floor(hue * 997) + c.id * 5;
  const mats = {
    top: clothMat(new THREE.Color().setHSL((hue + 0.12) % 1, 0.62, 0.42)),
    bottom: seed % 2 ? clothMat("#ffffff", { map: denimMap(["#2f3d5c", "#3c4a66", "#22262e"][seed % 3]) }) : clothMat(new THREE.Color().setHSL((hue + 0.5) % 1, 0.25, 0.32)),
    shoes: mat(["#3a2a20", "#e8e8e8", "#1c1c1c"][seed % 3], { roughness: 0.55 }),
    sole: mat("#efefef", { roughness: 0.9 }),
    skin: skinMat(pick(SKIN_TONES, seed)),
    hair: mat(pick(HAIR_COLS, seed, 1), { roughness: 0.85 }),
  };
  const female = seed % 2 === 0;
  const rig = buildHumanoid({
    height: female ? 1.66 : 1.76,
    bulk: female ? 0.88 : 0.97,
    shoulder: female ? 0.185 : 0.2,
    hip: female ? 0.1 : 0.095,
    shadows,
    face: true,
    eyeColor: pick(["#3a2a1c", "#2a3a4a", "#3a4a2a"], seed, 2),
    hair: female ? "long" : ["short", "buzz", "short"][seed % 3],
    beard: !female && seed % 4 === 1,
    fit: { top: 1.08, legs: 1.05 },
    staticHands: true,
    staticGrip: 0.15,
    mats: { top: mats.top, bottom: mats.bottom, shoes: mats.shoes, sole: mats.sole, hands: mats.skin, head: mats.skin, hair: mats.hair },
  });
  // a "!" bubble → "HELP" marker above while cowering
  const mergedGeos = optimizeRig(rig);
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: "#3dff8a" }));
  const group = new THREE.Group();
  group.add(rig.root, marker);
  const target = zeroPose();
  let t = 0;
  let ph = 0;
  function update(dt) {
    t += dt;
    const p = target;
    for (const k in p) p[k] = 0;
    if (c.state === "safe" && c.t > 7) {
      group.visible = false;
      return;
    }
    group.visible = true;
    rig.root.position.set(c.x, c.y, c.z);
    if (c.state === "cower") {
      p.bodyY = -0.45;
      p.spineRX = 0.7;
      p.lHipX = -1.6;
      p.rHipX = -1.5;
      p.lKnee = 2.1;
      p.rKnee = 2.1;
      p.lShX = -2.6;
      p.rShX = -2.6;
      p.lEl = -2.2;
      p.rEl = -2.2;
      p.lShZ = 0.4;
      p.rShZ = -0.4;
      p.bodyRZ = Math.sin(t * 22) * 0.02;
      rig.root.rotation.y = c.id * 1.3;
    } else if (c.state === "rescued") {
      poseIdle(p, t, 0);
      p.rShX = -2.8;
      p.rShZ = -0.4 + Math.sin(t * 12) * 0.3;
      p.rEl = -0.3;
    } else {
      ph += dt * 7;
      poseRun(p, ph, 0.4);
      rig.root.rotation.y = Math.atan2(Math.sin(c.id * 2.1), Math.cos(c.id * 2.1));
    }
    blendPose(rig, p, 9, dt);
    applyPose(rig);
    marker.visible = c.state === "cower";
    marker.position.set(c.x, c.y + 1.75 + Math.sin(t * 3) * 0.12, c.z);
    marker.rotation.y = t * 2;
  }
  function dispose() {
    for (const m of Object.values(mats)) m.dispose();
    for (const g of mergedGeos) g.dispose();
    marker.geometry.dispose();
    marker.material.dispose();
  }
  return { root: group, update, dispose, c };
}

/* ================================================================== bosses */
const BOSS_LOOK = {
  bruiser: { height: 2.9, bulk: 1.7, top: "#4b4f58", bottom: "#353840", skin: "#9a6b4a", core: "#ff7a1a", armor: "#7d838f" },
  commander: { height: 2.1, bulk: 1.15, top: "#26364f", bottom: "#1d2533", skin: "#26364f", core: "#2aa8ff", armor: "#c8d2e0" },
  striker: { height: 1.95, bulk: 1.0, top: "#1b2a6b", bottom: "#151d40", skin: "#1b2a6b", core: "#ffe23a", armor: "#ffe23a" },
  hunter: { height: 2.0, bulk: 0.98, top: "#1a1622", bottom: "#141019", skin: "#1a1622", core: "#b45cff", armor: "#2a2433" },
  titan: { height: 4.3, bulk: 1.85, top: "#5a6274", bottom: "#454c5c", skin: "#5a6274", core: "#ff3a2a", armor: "#c3cad8" },
};

export function createBossView(B, { shadows }) {
  const L = BOSS_LOOK[B.kind];
  const e = B.e;
  const mech = B.kind === "titan";
  const human = B.kind === "bruiser";
  const mats = {
    top: mech ? mat(L.top, { metalness: 0.6, roughness: 0.4 }) : human ? clothMat("#2e2e30") : clothMat(L.top, { roughness: 0.6, metalness: 0.15 }),
    bottom: mech ? mat(L.bottom, { metalness: 0.55, roughness: 0.45 }) : clothMat(L.bottom, { roughness: 0.7 }),
    skin: human ? skinMat("#b07d5b") : mech ? mat(L.skin, { metalness: 0.6, roughness: 0.4 }) : clothMat(L.skin, { roughness: 0.55 }),
    armor: mat(L.armor, { metalness: 0.85, roughness: 0.3 }),
    hair: mat("#1a120c", { roughness: 0.85 }),
    core: new THREE.MeshStandardMaterial({ color: L.core, emissive: L.core, emissiveIntensity: 1.2 }),
  };
  const rig = buildHumanoid({
    height: L.height,
    bulk: L.bulk,
    shoulder: human || mech ? 0.225 : 0.205,
    shadows,
    face: human,
    hair: human ? "bald" : null,
    beard: human,
    eyeColor: "#2a1a10",
    fit: { top: human ? 1 : 1.04, legs: 1.06 },
    staticHands: true,
    staticGrip: 0.9,
    mats: { top: mats.top, bottom: mats.bottom, shoes: mats.armor, hands: human ? mats.armor : mats.top, head: mats.skin, arms: human ? mats.skin : mats.top, hair: mats.hair },
  });
  const { joints: J, size: S } = rig;
  const own = [];
  const add = (parent, geo, m, pos, rot, scl) => {
    const x = new THREE.Mesh(geo, m);
    if (pos) x.position.set(...pos);
    if (rot) x.rotation.set(...rot);
    if (scl) x.scale.set(...scl);
    x.castShadow = !!shadows;
    parent.add(x);
    own.push(geo);
    return x;
  };
  const s = S.s;
  // weak-point core on the chest (all bosses)
  const core = add(J.chest, new THREE.SphereGeometry(0.09 * s, 16, 12), mats.core, [0, 0.17 * s, 0.13 * s]);
  // shoulder pauldrons + chest plate
  for (const side of ["L", "R"]) add(J[`sh${side}`], new THREE.SphereGeometry(0.11 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.armor, [0, 0.02 * s, 0], null, [1.2, 0.9, 1.2]);
  add(J.chest, new THREE.BoxGeometry(0.36 * s, 0.22 * s, 0.05 * s), mats.armor, [0, 0.27 * s, 0.11 * s]);
  // eyes
  const eyeM = new THREE.MeshBasicMaterial({ color: B.kind === "hunter" ? "#c77dff" : B.kind === "striker" ? "#fff36a" : "#ff3a2a" });
  for (const sx of [1, -1]) add(J.head, new THREE.SphereGeometry(0.018 * s, 6, 6), eyeM, [sx * 0.04 * s, S.hr * 1.0, S.hr * 0.92]);
  let bubble = null;
  let arcs = null;
  let cloak = null;
  const jets = [];
  if (B.kind === "bruiser") {
    add(J.head, new THREE.BoxGeometry(0.2 * s, 0.08 * s, 0.05), mats.armor, [0, S.hr * 0.75, S.hr * 0.9]);
    for (const side of ["L", "R"]) add(J[`wr${side}`], new THREE.BoxGeometry(0.13 * s, 0.14 * s, 0.13 * s), mats.armor, [0, -0.05 * s, 0]);
  }
  if (B.kind === "commander") {
    add(J.head, new THREE.SphereGeometry(S.hr * 1.2, 16, 12), mats.armor, [0, S.hr * 0.95, 0]);
    add(J.head, new THREE.BoxGeometry(S.hr * 1.6, S.hr * 0.4, 0.03), new THREE.MeshBasicMaterial({ color: "#2aa8ff" }), [0, S.hr * 1.0, S.hr * 1.15]);
    for (const sx of [1, -1]) {
      add(J.chest, new THREE.CylinderGeometry(0.06 * s, 0.07 * s, 0.32 * s, 10), mats.armor, [sx * 0.09 * s, 0.15 * s, -0.16 * s]);
      jets.push(add(J.chest, new THREE.ConeGeometry(0.05 * s, 0.3 * s, 10), new THREE.MeshBasicMaterial({ color: "#7fd8ff", transparent: true, opacity: 0.8 }), [sx * 0.09 * s, -0.12 * s, -0.16 * s], [Math.PI, 0, 0]));
    }
    bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 2), new THREE.MeshBasicMaterial({ color: "#59c8ff", transparent: true, opacity: 0.22, wireframe: false, depthWrite: false, side: THREE.DoubleSide }));
    own.push(bubble.geometry);
  }
  if (B.kind === "striker") {
    for (const side of ["L", "R"]) add(J[`el${side}`], new THREE.BoxGeometry(0.02, S.foreL * 0.9, 0.12 * s), mats.core, [0, -S.foreL / 2, 0]);
    add(J.chest, new THREE.BoxGeometry(0.04 * s, 0.3 * s, 0.02), mats.core, [0, 0.15 * s, 0.12 * s], [0, 0, 0.5]);
    const pts = new Float32Array(16 * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    arcs = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: "#fff36a", transparent: true, opacity: 0.9 }));
    arcs.frustumCulled = false;
    own.push(g);
  }
  if (B.kind === "hunter") {
    cloak = add(J.chest, new THREE.ConeGeometry(0.42 * s, 1.35 * s, 16, 1, true), new THREE.MeshStandardMaterial({ color: "#120e18", roughness: 0.9, side: THREE.DoubleSide, transparent: true }), [0, -0.25 * s, -0.04 * s]);
    add(J.head, new THREE.ConeGeometry(S.hr * 1.4, S.hr * 2.6, 12, 1, true), cloak.material, [0, S.hr * 1.1, -S.hr * 0.15]);
    for (const w of [J.wrL, J.wrR]) add(w, new THREE.BoxGeometry(0.02, 0.04, 0.55), mat("#cfd6dd", { metalness: 0.95, roughness: 0.15 }), [0, -0.06, 0.24]);
  }
  if (B.kind === "titan") {
    add(J.head, new THREE.BoxGeometry(S.hr * 2.1, S.hr * 1.7, S.hr * 2), mats.armor, [0, S.hr, 0]);
    add(J.head, new THREE.BoxGeometry(S.hr * 1.6, S.hr * 0.25, 0.04), new THREE.MeshBasicMaterial({ color: "#ff3a2a" }), [0, S.hr * 1.05, S.hr * 1.02]);
    for (const side of ["L", "R"]) {
      add(J[`sh${side}`], new THREE.BoxGeometry(0.3 * s, 0.18 * s, 0.3 * s), mats.armor, [0, 0.06 * s, 0]);
      add(J[`knee${side}`], new THREE.BoxGeometry(0.16 * s, 0.32 * s, 0.18 * s), mats.armor, [0, -S.shinL * 0.45, 0.02 * s]);
    }
    add(J.chest, new THREE.BoxGeometry(0.46 * s, 0.4 * s, 0.32 * s), mats.armor, [0, 0.15 * s, -0.02 * s]);
    for (const sx of [1, -1]) jets.push(add(J.chest, new THREE.ConeGeometry(0.07 * s, 0.4 * s, 10), new THREE.MeshBasicMaterial({ color: "#ffb36a", transparent: true, opacity: 0 }), [sx * 0.14 * s, -0.15 * s, -0.2 * s], [Math.PI, 0, 0]));
    const trim = new THREE.MeshBasicMaterial({ color: "#ff4a2a" });
    mats.trim = trim;
    for (const side of ["L", "R"]) {
      add(J[`el${side}`], new THREE.BoxGeometry(0.02 * s, S.foreL * 0.8, 0.02 * s), trim, [0, -S.foreL / 2, 0.06 * s]);
      add(J[`knee${side}`], new THREE.BoxGeometry(0.02 * s, S.shinL * 0.7, 0.02 * s), trim, [0, -S.shinL / 2, 0.08 * s]);
    }
    add(J.chest, new THREE.BoxGeometry(0.4 * s, 0.015 * s, 0.02 * s), trim, [0, 0.33 * s, 0.15 * s]);
  }
  // pylons (titan phase 2)
  core.userData.keep = true;
  for (const j of jets) j.userData.keep = true;
  const mergedGeos = optimizeRig(rig);
  const pylons = B.pylons.map((p) => {
    const g = new THREE.Group();
    const pm = new THREE.MeshStandardMaterial({ color: "#4a505e", metalness: 0.7, roughness: 0.4 });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 3.2, 8), pm);
    pillar.position.y = 1.6;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), new THREE.MeshBasicMaterial({ color: "#ff3a2a" }));
    orb.position.y = 3.5;
    g.add(pillar, orb);
    g.position.set(p.x, p.y, p.z);
    own.push(pillar.geometry, orb.geometry);
    return { g, orb, pm, p };
  });
  const tether = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#ff5a3a", transparent: true, opacity: 0.8 }));
  tether.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(B.pylons.length * 6), 3));
  tether.frustumCulled = false;
  own.push(tether.geometry);

  const group = new THREE.Group();
  group.add(rig.root, tether);
  for (const p of pylons) group.add(p.g);
  if (bubble) group.add(bubble);
  if (arcs) group.add(arcs);
  const target = zeroPose();
  let ph = 0;
  let lx = e.x;
  let lz = e.z;
  let t = 0;
  const flashMats = [mats.top, mats.bottom];

  function update(dt) {
    t += dt;
    const p = target;
    for (const k in p) p[k] = 0;
    const sp = Math.hypot(e.x - lx, e.z - lz) / Math.max(dt, 1e-4);
    lx = e.x;
    lz = e.z;
    const defeated = B.defeated;
    group.visible = !(defeated && B.doneT > 3.5);
    rig.root.position.set(e.x, e.y, e.z);
    rig.root.rotation.y = e.facing;
    const st = B.st;
    let rate = 10;
    if (defeated) {
      p.bodyRX = -1.35;
      p.bodyY = -S.hipY + 0.3 * s;
      p.lShZ = 1.1;
      p.rShZ = -1.1;
      rate = 3;
    } else if (st === "intro" || st === "phase") {
      poseIdle(p, t, 0.3);
      p.lShZ = 1.2;
      p.rShZ = -1.2;
      p.lShX = -0.5;
      p.rShX = -0.5;
      p.chestRX = -0.3;
      p.headRX = -0.35;
      rate = 6;
    } else if (/Wind$/.test(st)) {
      poseIdle(p, t, 1);
      const u = Math.min(1, B.t / (B.windT || 0.8));
      if (st === "slamWind") {
        p.lShX = -2.9 * u;
        p.rShX = -2.9 * u;
        p.spineRX = -0.35 * u;
      } else if (st === "hayWind") {
        p.chestRY = 0.9 * u;
        p.rShX = 0.6 * u;
        p.rEl = -1.6;
      } else {
        p.bodyY = -0.3 * u * s;
        p.spineRX = 0.6 * u;
        p.lKnee = 1.0 * u;
        p.rKnee = 1.0 * u;
        p.lHipX = -0.8 * u;
        p.rHipX = 0.2;
        p.lShX = 0.5;
        p.rShX = 0.5;
      }
      rate = 12;
    } else if (st === "charge" || st === "dash") {
      ph += dt * 14;
      poseRun(p, ph, 1.5, 0.35);
      rate = 18;
    } else if (st === "stunned" || st === "overheat" || st === "revealed" || st === "grounded") {
      poseIdle(p, t, 0);
      p.spineRX = 0.45;
      p.headRX = 0.4;
      p.lShZ = 0.5;
      p.rShZ = -0.5;
      p.bodyRZ = Math.sin(t * 4) * 0.08;
      p.lKnee = 0.5;
      p.rKnee = 0.5;
      p.bodyY = -0.1 * s;
      rate = 8;
    } else if (st === "counter") {
      poseIdle(p, t, 1);
      p.lShX = -1.6;
      p.rShX = -1.6;
      p.lShZ = -0.5;
      p.rShZ = 0.5;
      p.lEl = -1.6;
      p.rEl = -1.6;
      rate = 14;
    } else if (st === "knives") {
      poseIdle(p, t, 1);
      const u = Math.min(1, B.t / 0.5);
      p.rShX = 0.4 - u * 2.0;
      p.rShZ = -0.3;
      p.chestRY = 0.5 - u;
      rate = 20;
    } else if (st === "hover" || st === "exposed" || st === "fly") {
      poseAir(p, -2, t);
      p.lHipX = 0.1;
      p.rHipX = 0.25;
      p.lKnee = 0.4;
      p.rKnee = 0.7;
      p.rShX = -1.4;
      p.rEl = -0.2;
      rate = 6;
    } else if (sp > 0.6) {
      ph += dt * (3 + sp * 0.9);
      poseRun(p, ph, sp > 5 ? 1 : 0.5);
      rate = 10;
    } else {
      poseIdle(p, t, 1);
      rate = 7;
    }
    blendPose(rig, p, rate, dt);
    applyPose(rig);
    // weak point + flash
    const weak = B.weak && !defeated;
    mats.core.emissiveIntensity = weak ? 3 + Math.sin(t * 16) * 1.2 : 0.7;
    core.scale.setScalar(weak ? 1.35 + Math.sin(t * 16) * 0.12 : 1);
    const fl = e.flash > 0 ? 1 : 0;
    for (const m of flashMats) {
      m.emissive.setRGB(fl, fl * 0.9, fl * 0.8);
      m.emissiveIntensity = fl ? 0.7 : 0;
    }
    if (bubble) {
      bubble.visible = B.shield && !defeated;
      bubble.position.set(e.x, e.y + 1.1, e.z);
      bubble.rotation.y = t * 0.6;
      bubble.material.opacity = 0.18 + Math.sin(t * 4) * 0.05;
    }
    for (const j of jets) {
      const on = st === "hover" || st === "exposed" || st === "fly" || (B.kind === "commander" && !defeated);
      j.material.opacity = on ? 0.55 + Math.random() * 0.35 : 0;
      j.scale.y = 0.8 + Math.random() * 0.5;
    }
    if (arcs) {
      const on = (B.aura || st === "dash" || st === "dashWind") && !defeated;
      arcs.visible = on;
      if (on) {
        const P = arcs.geometry.attributes.position.array;
        for (let i = 0; i < 16; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = 0.6 + Math.random() * 0.5;
          const y = e.y + 0.3 + Math.random() * 1.8;
          P[i * 6] = e.x + Math.cos(a) * r;
          P[i * 6 + 1] = y;
          P[i * 6 + 2] = e.z + Math.sin(a) * r;
          P[i * 6 + 3] = e.x + Math.cos(a + 0.6) * (r + 0.3);
          P[i * 6 + 4] = y + (Math.random() - 0.5) * 0.6;
          P[i * 6 + 5] = e.z + Math.sin(a + 0.6) * (r + 0.3);
        }
        arcs.geometry.attributes.position.needsUpdate = true;
      }
    }
    if (cloak) {
      const op = B.invisible ? 0.08 : 1;
      cloak.material.opacity += (op - cloak.material.opacity) * Math.min(1, dt * 8);
      for (const m of [mats.top, mats.bottom, mats.skin, mats.armor]) {
        m.transparent = true;
        m.opacity = cloak.material.opacity;
      }
      mats.core.opacity = cloak.material.opacity;
      mats.core.transparent = true;
      eyeM.color.set(B.counter ? "#59c8ff" : "#c77dff");
      if (B.counter) {
        mats.top.emissive.set("#2a7fff");
        mats.top.emissiveIntensity = 0.6 + Math.sin(t * 12) * 0.3;
      }
    }
    // pylons + tethers to the titan
    const TP = tether.geometry.attributes.position.array;
    pylons.forEach((py, i) => {
      const on = py.p.on && !py.p.done;
      py.g.visible = B.kind === "titan";
      py.orb.material.color.set(py.p.done ? "#333" : on ? (Math.sin(t * 8) > 0 ? "#ff3a2a" : "#ff8a6a") : "#555");
      py.orb.scale.setScalar(on ? 1 + Math.sin(t * 8) * 0.1 : 0.8);
      TP[i * 6] = py.p.x;
      TP[i * 6 + 1] = py.p.y + 3.5;
      TP[i * 6 + 2] = py.p.z;
      TP[i * 6 + 3] = on ? e.x : py.p.x;
      TP[i * 6 + 4] = on ? e.y + 2.5 : py.p.y + 3.5;
      TP[i * 6 + 5] = on ? e.z : py.p.z;
    });
    tether.geometry.attributes.position.needsUpdate = true;
  }

  function dispose() {
    for (const g of own) g.dispose();
    for (const g of mergedGeos) g.dispose();
    for (const m of Object.values(mats)) m.dispose();
    eyeM.dispose();
    if (bubble) bubble.material.dispose();
    if (arcs) arcs.material.dispose();
    if (cloak) cloak.material.dispose();
    tether.material.dispose();
    for (const p of pylons) {
      p.pm.dispose();
      p.orb.material.dispose();
    }
    for (const j of jets) j.material.dispose();
  }
  return { root: group, update, dispose };
}
