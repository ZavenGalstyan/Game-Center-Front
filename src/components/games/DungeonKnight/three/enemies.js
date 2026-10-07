/**
 * Dungeon Knight — enemy views: the model for each archetype/boss in the
 * dungeon's palette, posed from the AI state every frame, plus the readable
 * telegraph decals on the floor (orange → red as the wind-up completes), a
 * small health bar over damaged enemies, and the elite aura.
 */
import * as THREE from "three";
import { buildHumanoid, poseHumanoid, disposeHumanoid } from "./humanoid.js";
import { buildSlime, buildBat, buildSpider, buildGolem } from "./creatures.js";
import { dangerTexture, glowTexture } from "./textures.js";
import { geo } from "./materials.js";
import { clamp, lerp, smooth, easeOut } from "../engine/math.js";

/* ------------------------------------------------------------------ palettes */
const SLIME = {
  cellar: { body: "#3aa889", glow: "#2fd0a0", core: "#1c6552", eye: "#e2fff4" },
  crypt: { body: "#6aa83a", glow: "#a6e060", core: "#3a6a1c", eye: "#f4ffe0" },
  frozen: { body: "#86c8f0", glow: "#c4ecff", core: "#3a7ab0", eye: "#ffffff" },
  ember: { body: "#f07a2a", glow: "#ffb05a", core: "#a8320f", eye: "#fff2d0" },
  shadow: { body: "#8a5aff", glow: "#c39bff", core: "#3a2380", eye: "#f2e8ff" },
};
const EYE = { cellar: "#6ff0e0", crypt: "#a6ff6a", frozen: "#9fe8ff", ember: "#ffb04a", shadow: "#c39bff" };
const BONE = { cellar: "#d9d0b8", crypt: "#c9c8a6", frozen: "#dfe8ee", ember: "#cdb9a2", shadow: "#c9c2d8" };

function humanoidSpec(e, theme, shadows) {
  const t = e.type;
  const eye = e.def.elite ? "#ffd166" : EYE[theme];
  if (t === "skeleton" || t === "shieldSkel") {
    return {
      style: "skeleton", shadows,
      colors: { bone: BONE[theme], cloth: theme === "shadow" ? "#3a2a5a" : theme === "frozen" ? "#4a6a80" : "#5a3a2a", leather: "#4a3020", eye },
      weapon: { kind: "shortsword", colors: { metal: "#8a7560" } },
      shield: t === "shieldSkel" ? { face: "#6b4a2e", rim: "#8a8378", boss: "#9a948a", shape: "round", emblem: null } : null,
    };
  }
  if (t === "darkKnight") {
    return {
      style: "dark", shadows,
      colors: { metal: "#3c3f4a", dark: "#1f2128", trim: "#6a5a7a", cloth: "#2a1f2f", leather: "#2a2022", eye: e.def.elite ? "#ffd166" : theme === "ember" ? "#ff5a3a" : "#c39bff" },
      weapon: { kind: "greatsword", colors: { metal: "#5a5e6a", glow: theme === "ember" ? "#ff5a2a" : "#8a6aff" } },
    };
  }
  if (t === "mage") {
    return {
      style: "mage", shadows,
      colors: { cloth: theme === "crypt" ? "#2e4a3a" : theme === "ember" ? "#4a1f1a" : "#2f2a5a", trim: "#b8964a", eye },
      weapon: { kind: "staff", colors: { glow: theme === "crypt" ? "#8fff9a" : theme === "ember" ? "#ff8a3a" : "#a68bff" } },
    };
  }
  if (t === "cellarGuardian") {
    return {
      style: "guardian", shadows,
      colors: { metal: "#8f897c", dark: "#5c5a55", trim: "#6fa39b", cloth: "#24504f", leather: "#4a3a2c", eye: "#4ff0e0" },
      weapon: { kind: "heavysword", colors: { metal: "#a59f92" } },
      shield: { face: "#4a4f55", rim: "#7a766c", boss: "#8a8478", shape: "round", emblem: null },
    };
  }
  if (t === "cryptWarden") {
    return { style: "warden", shadows, colors: { cloth: "#26331f", trim: "#5f7f36", bone: "#cfcaa8", eye: "#a6ff6a" }, weapon: { kind: "scythe", colors: { metal: "#9aa08a", glow: "#7fff6a" } } };
  }
  if (t === "frostKeeper") {
    return { style: "frost", shadows, colors: { metal: "#cfe2ef", dark: "#5f7f9a", trim: "#9fe8ff", cloth: "#2a4a6a", eye: "#bff2ff" }, weapon: { kind: "greatsword", colors: { metal: "#d8f2ff", glow: "#7fd8ff" } } };
  }
  if (t === "infernalJailer") {
    return { style: "jailer", shadows, colors: { leather: "#4a2f24", dark: "#2a2420", trim: "#b8823a", eye: "#ff9a3a" }, weapon: { kind: "flail", colors: { metal: "#5a524a", glow: "#ff6a1a" } } };
  }
  if (t === "shadowKing") {
    return { style: "king", shadows, colors: { metal: "#4a4560", dark: "#1d1a2a", trim: "#d9b45a", cloth: "#3a2266", eye: "#d2b0ff" }, weapon: { kind: "greatsword", colors: { metal: "#6a6488", glow: "#a67bff" } } };
  }
  return null;
}

/* ------------------------------------------------------------------ decals */
function decalMaterial() {
  return new THREE.MeshBasicMaterial({ map: dangerTexture(), color: "#ff8a3a", transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}
function sectorGeo(arc) {
  const a = Math.round(arc * 100) / 100;
  return geo(`sector:${a}`, () => {
    const g = new THREE.CircleGeometry(1, 36, -Math.PI / 2 - a, 2 * a);
    g.rotateX(-Math.PI / 2);
    // remap UVs radially so the bright rim follows the arc edge
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) * 0.5, 0.5 + p.getZ(i) * 0.5);
    return g;
  });
}

export function createEnemyView(e, theme, opts = {}) {
  const shadows = opts.shadows !== false;
  const root = new THREE.Group();
  const v = { e, root, kind: null, rig: null, model: null, theme, deathDone: false, hpShown: 0, flashT: 0 };
  const fam = e.def.family;
  if (e.type === "slime") {
    v.model = buildSlime(SLIME[theme] || SLIME.cellar, shadows);
    v.kind = "slime";
  } else if (e.type === "bat") {
    v.model = buildBat({ body: theme === "frozen" ? "#4a5a6a" : "#2a2228", wing: theme === "frozen" ? "#3a4a5a" : "#3a2a30", eye: e.def.elite ? "#ffd166" : "#ff4a4a" }, shadows);
    v.kind = "bat";
  } else if (e.type === "spider") {
    v.model = buildSpider({ body: theme === "crypt" ? "#2a3326" : "#2a2626", leg: "#1f1c1c", eye: e.def.elite ? "#ffd166" : "#ff5a5a", mark: theme === "crypt" ? "#a6ff6a" : "#ff6a3a" }, shadows);
    v.kind = "spider";
  } else if (e.type === "golem") {
    const pal = {
      frozen: { body: "#a8c8dc", body2: "#86a8c0", glow: "#7fe0ff" },
      ember: { body: "#4a3a34", body2: "#3a2e2a", glow: "#ff7a2a" },
      shadow: { body: "#4a4660", body2: "#3a3650", glow: "#b48aff" },
    }[theme] || { body: "#7a746a", body2: "#625d55", glow: "#6ff0e0" };
    v.model = buildGolem(e.def.elite ? { ...pal, glow: "#ffd166" } : pal, shadows);
    v.kind = "golem";
  } else {
    v.rig = buildHumanoid({ ...humanoidSpec(e, theme, shadows), scale: e.def.scale || 1 });
    v.kind = "humanoid";
  }
  const model = v.model ? v.model.root : v.rig.root;
  if (v.model && e.def.scale && e.def.scale !== 1) v.model.root.scale.setScalar(e.def.scale);
  if (v.model) root.add(model);
  else root.add(v.rig.root);
  v.fam = fam;

  /* telegraph decals (world space, not parented to the moving model) */
  const tele = new THREE.Group();
  v.tele = tele;
  v.decal = new THREE.Mesh(sectorGeo(1), decalMaterial());
  v.decal.renderOrder = 2;
  tele.add(v.decal);
  v.decal.visible = false;
  v.ring = new THREE.Mesh(geo("teleRing", () => {
    const g = new THREE.RingGeometry(0.86, 1, 64);
    g.rotateX(-Math.PI / 2);
    return g;
  }), new THREE.MeshBasicMaterial({ color: "#ff6a3a", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  v.ring.visible = false;
  tele.add(v.ring);

  /* elite aura */
  if (e.def.elite || e.def.boss) {
    const aura = new THREE.Mesh(geo("aura", () => {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      return g;
    }), new THREE.MeshBasicMaterial({ map: glowTexture(), color: e.def.boss ? EYE[theme] : "#ffc54a", transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    aura.scale.setScalar(e.def.radius * 4.2);
    aura.position.y = 0.03;
    root.add(aura);
    v.aura = aura;
  }

  /* health bar (billboard) */
  if (!e.def.boss) {
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(geo("hpBg", () => new THREE.PlaneGeometry(0.8, 0.09)), new THREE.MeshBasicMaterial({ color: "#120d10", transparent: true, opacity: 0.75, depthTest: false }));
    const fill = new THREE.Mesh(geo("hpFill", () => {
      const g = new THREE.PlaneGeometry(0.76, 0.055);
      g.translate(0.38, 0, 0);
      return g;
    }), new THREE.MeshBasicMaterial({ color: e.def.elite ? "#ffcf4a" : "#e2534a", depthTest: false }));
    fill.position.set(-0.38, 0, 0.001);
    bg.renderOrder = 10;
    fill.renderOrder = 11;
    bar.add(bg, fill);
    bar.visible = false;
    v.bar = bar;
    v.barFill = fill;
    root.add(bar);
  }
  return v;
}

export function disposeEnemyView(v) {
  if (v.rig) disposeHumanoid(v.rig);
  if (v.model && v.model.owned) for (const m of v.model.owned) m.dispose();
  v.decal.material.dispose();
  v.ring.material.dispose();
  if (v.aura) v.aura.material.dispose();
  if (v.bar) {
    v.bar.children[0].material.dispose();
    v.barFill.material.dispose();
  }
  v.root.removeFromParent();
  v.tele.removeFromParent();
}

/* ------------------------------------------------------------------ posing */
const P = {
  x: 0, z: 0, yaw: 0, y: 0, twist: 0, lean: 0, crouch: 0, roll: 0, fall: 0, fallSide: 1, hurt: 0,
  hR: [0.28, 1.0, 0.25], dR: [0.1, 0.5, 0.85], hL: [-0.3, 1.05, 0.3], nL: [-0.45, 0, 0.9], eyes: 0, swinging: false,
};
const set3 = (a, x, y, z) => {
  a[0] = x;
  a[1] = y;
  a[2] = z;
  return a;
};

/** attack progress helpers */
function atkInfo(e) {
  const k = e.atk;
  if (!k) return null;
  const a = k.def;
  const tele = k.phase === "tele" ? clamp(k.t / k.tele, 0, 1) : 1;
  const act = k.phase === "act" ? clamp(k.t / Math.max(0.05, k.act), 0, 1) : k.phase === "rec" ? 1 : 0;
  const rec = k.phase === "rec" ? clamp(k.t / k.rec, 0, 1) : 0;
  return { a, k, tele, act, rec, phase: k.phase };
}

function humanoidPose(v, W, time) {
  const e = v.e;
  const rig = v.rig;
  P.x = e.x;
  P.z = e.z;
  P.yaw = e.yaw;
  P.y = 0;
  P.twist = 0;
  P.lean = 0;
  P.crouch = 0;
  P.roll = 0;
  P.fall = 0;
  P.hurt = 0;
  P.eyes = 0;
  P.swinging = false;
  P.noGait = false;
  const wk = rig.weapon ? rig.style : "";
  const twoHand = !rig.shield && (wk === "dark" || wk === "frost" || wk === "king" || wk === "warden" || wk === "guardian");
  // rest pose
  if (wk === "mage") {
    set3(P.hR, 0.3, 1.0, 0.18);
    set3(P.dR, 0.05, 1, 0.12);
    set3(P.hL, -0.28, 1.05, 0.25);
    set3(P.nL, -0.3, 0.2, 1);
  } else if (wk === "jailer") {
    set3(P.hR, 0.34, 0.98, 0.15);
    set3(P.dR, 0.15, 0.95, 0.3);
    set3(P.hL, -0.32, 1.0, 0.22);
    set3(P.nL, -0.5, 0, 1);
  } else if (wk === "warden") {
    set3(P.hR, 0.24, 1.05, 0.28);
    set3(P.dR, 0.05, 1, 0.2);
    set3(P.hL, -0.12, 1.28, 0.3);
    set3(P.nL, 0, 0, 1);
  } else {
    set3(P.hR, 0.3, 1.0, 0.26);
    set3(P.dR, 0.12, 0.55, 0.82);
    set3(P.hL, twoHand ? 0.12 : -0.3, twoHand ? 0.92 : 1.05, twoHand ? 0.3 : 0.3);
    set3(P.nL, -0.45, 0, 0.9);
  }
  const ai = atkInfo(e);
  if (ai && e.state !== "dead") {
    const { a, tele, act, rec, phase } = ai;
    P.eyes = phase === "tele" ? tele : phase === "act" ? 1 : 0.3 * (1 - rec);
    const back = phase === "tele" ? smooth(tele) : 1 - smooth(rec * 1.4);
    if (a.kind === "arc" && a.arc <= 0.5 && wk !== "jailer") {
      // thrust: pull back, then drive straight forward
      const out = phase === "act" ? easeOut(act) : phase === "rec" ? 1 - smooth(rec) : 0;
      set3(P.hR, 0.3, 1.22, lerp(lerp(0.22, -0.18, back), 0.68, out));
      set3(P.dR, 0.0, 0.05, 1);
      P.lean = 0.15 * out - 0.1 * back * (phase === "tele" ? 1 : 0);
      P.swinging = phase === "act";
    } else if (a.kind === "arc") {
      // horizontal sweep: wind back-right, slash across to the left
      let ang;
      if (phase === "tele") ang = lerp(0.6, 1.95, smooth(tele));
      else if (phase === "act") ang = lerp(1.95, -1.35, smooth(act));
      else ang = lerp(-1.35, 0.4, smooth(Math.max(0, rec - 0.35) / 0.65));
      const hy = phase === "tele" ? lerp(1.05, 1.45, smooth(tele)) : 1.2;
      const tw = clamp(ang * 0.38, -0.62, 0.62);
      const shx = 0.22 * Math.cos(tw);
      const shz = -0.22 * Math.sin(tw);
      set3(P.hR, shx + Math.sin(ang) * 0.42, hy, shz + Math.cos(ang) * 0.42);
      set3(P.dR, Math.sin(ang), phase === "tele" ? 0.35 : -0.08, Math.cos(ang));
      P.twist = tw;
      P.crouch = phase === "act" ? 0.06 : 0.03 * back;
      P.swinging = phase === "act";
      if (twoHand) set3(P.hL, P.hR[0] - 0.12, P.hR[1] - 0.05, P.hR[2] - 0.05);
      if (wk === "jailer") {
        // the chain lash: a straight overhead throw down the line
        set3(P.hR, 0.3, phase === "tele" ? lerp(1.0, 1.85, smooth(tele)) : lerp(1.85, 1.15, smooth(act)), phase === "tele" ? -0.1 : 0.5);
        set3(P.dR, 0, phase === "tele" ? 0.6 : 0.2, phase === "tele" ? -0.8 : 1);
        P.twist = 0;
      }
    } else if (a.kind === "slam") {
      const up = phase === "tele" ? smooth(tele) : phase === "act" ? 1 - easeOut(act) : 0;
      const down = phase === "act" ? easeOut(act) : phase === "rec" ? 1 - smooth(rec) : 0;
      set3(P.hR, 0.12, lerp(1.0, 1.95, up) - down * 0.95 + (phase === "rec" ? 0.95 * (1 - smooth(rec)) * 0 : 0), lerp(0.25, 0.02, up) + down * 0.42);
      if (phase === "act" || phase === "rec") set3(P.hR, 0.12, lerp(1.95, 0.9, down), lerp(0.02, 0.62, down));
      set3(P.dR, 0, lerp(-0.6, 0.85, up) * (down > 0.5 ? 0.3 : 1) - down * 0.6, lerp(0.8, -0.45, up) + down * 1.2);
      set3(P.hL, P.hR[0] - 0.22, P.hR[1] - 0.06, P.hR[2] - 0.02);
      P.crouch = down * 0.18;
      P.lean = down * 0.3 - up * 0.12;
      P.swinging = phase === "act";
      if (wk === "mage" || wk === "warden") {
        // casters slam the staff / scythe butt into the ground
        set3(P.dR, 0, 1, 0.15);
      }
    } else if (a.kind === "charge") {
      const go = phase === "act" ? 1 : phase === "tele" ? smooth(tele) : 1 - smooth(rec);
      if (rig.shield) {
        set3(P.hL, -0.06, 1.2, lerp(0.3, 0.55, go));
        set3(P.nL, 0.05, 0.05, 1);
      } else {
        set3(P.hR, 0.25, 1.15, lerp(0.2, 0.6, go));
        set3(P.dR, 0, 0.1, 1);
        if (twoHand) set3(P.hL, 0.1, 1.1, lerp(0.15, 0.5, go));
      }
      P.crouch = go * 0.14;
      P.lean = go * 0.35;
    } else if (a.kind === "orb") {
      const cast = phase === "tele" ? smooth(tele) : 1 - smooth(rec);
      set3(P.hL, -0.18, lerp(1.1, 1.5, cast), lerp(0.3, 0.55, cast));
      set3(P.nL, 0, 0.3, 1);
      if (wk === "mage") {
        set3(P.hR, 0.26, lerp(1.0, 1.35, cast), lerp(0.18, 0.4, cast));
        set3(P.dR, 0, 1, lerp(0.12, 0.6, cast));
      } else {
        set3(P.hR, 0.32, lerp(1.0, 1.7, cast), 0.1);
        set3(P.dR, 0.1, 0.9, 0.2);
      }
      P.lean = -0.08 * cast;
    } else if (a.kind === "ring") {
      const gather = phase === "tele" ? smooth(tele) : 0;
      const burst = phase === "act" ? easeOut(Math.min(1, act * 3)) : phase === "rec" ? 1 - smooth(rec) : 0;
      set3(P.hR, lerp(0.18, 0.62, burst), lerp(1.0 - gather * 0.2, 1.7, burst), lerp(0.3, 0.1, burst));
      set3(P.hL, -lerp(0.18, 0.62, burst), lerp(1.0 - gather * 0.2, 1.7, burst), lerp(0.3, 0.1, burst));
      set3(P.dR, 0.3, 1, 0);
      set3(P.nL, -1, 0.4, 0.3);
      P.crouch = gather * 0.22 - burst * 0.04;
    }
  }
  if (e.state === "hurt") {
    const k = 1 - clamp(e.st / (e.hurtDur || 0.4), 0, 1);
    P.hurt = Math.sin(k * Math.PI) * 0.9;
    P.lean = -0.25 * k;
  }
  if (e.state === "intro" || e.state === "roar") {
    const k = Math.sin(clamp(e.st / (e.state === "intro" ? 1.7 : 1.1), 0, 1) * Math.PI);
    set3(P.hR, 0.55, lerp(1.0, 1.85, k), 0.15);
    set3(P.dR, 0.3, 1, 0.1);
    set3(P.hL, -0.55, lerp(1.05, 1.8, k), 0.15);
    P.lean = -0.25 * k;
    P.eyes = k;
    P.crouch = -0.02 * k;
  }
  if (e.state === "notice") P.eyes = 1 - e.st / 0.45;
  if (e.state === "taunt") {
    set3(P.hR, 0.35, 1.25, 0.2);
    set3(P.dR, 0.2, 1, 0.1);
  }
  if (e.state === "rec" && ai && ai.a.kind !== "ring") {
    // heavy recovery: visibly winded (the punish window)
    P.lean += 0.12 * Math.sin(Math.min(1, ai.rec * 2) * Math.PI);
    P.crouch += 0.05;
  }
  if (e.dead) {
    const k = clamp(e.deathT / 0.9, 0, 1);
    P.fall = easeOut(k);
    P.fallSide = (e.uid % 2) * 2 - 1;
    P.y = -Math.max(0, e.deathT - 1.5) * 0.9;
    P.eyes = -1;
    P.noGait = true;
  }
  poseHumanoid(rig, P, v.dt, time);
  // weapon extras
  const wpn = rig.weapon;
  if (wpn && wpn.userData.chain) {
    // flail chain hangs, then whips out on the lash
    const lash = ai && ai.a.id === "chain" && (ai.phase === "act" || (ai.phase === "rec" && ai.rec < 0.2));
    wpn.userData.chain.rotation.x = lash ? -1.5 : ai && ai.phase === "tele" ? -2.6 + Math.sin(time * 18) * 0.4 : Math.PI + Math.sin(time * 2) * 0.1;
    wpn.userData.chain.scale.y = lash ? 5.5 : 1;
  }
  if (wpn && wpn.userData.orb) wpn.userData.orb.scale.setScalar(1 + (P.eyes > 0 ? P.eyes : 0) * 0.8 + Math.sin(time * 5) * 0.06);
  if (rig.eyes.length) {
    const s = e.dead ? 0.01 : 1 + Math.max(0, P.eyes) * 0.9;
    for (const m of rig.eyes) m.scale.setScalar(s);
  }
}

function slimePose(v, W, time, dt) {
  const e = v.e;
  const m = v.model;
  m.root.position.set(e.x, 0, e.z);
  m.root.rotation.y = e.yaw;
  let sy = 1;
  let sxz = 1;
  let y = 0;
  const wob = Math.sin(e.wob * 5.2) * 0.04;
  const ai = atkInfo(e);
  let glowK = 0;
  if (e.state === "chase" || e.state === "idle" || e.state === "notice" || e.state === "taunt") {
    // squishy shuffle: hop-steps while moving
    const mv = Math.min(1, Math.hypot(e.vx, e.vz) / 1.5);
    const hop = Math.abs(Math.sin(e.wob * 6.5));
    y = hop * 0.12 * mv;
    sy = 1 + wob - hop * 0.08 * mv;
  }
  if (ai) {
    if (ai.phase === "tele") {
      // the big readable crouch: flatten + glow
      const k = smooth(ai.tele);
      sy = 1 - 0.32 * k + Math.sin(time * 40) * 0.02 * k;
      glowK = k;
    } else if (ai.phase === "act") {
      const k = ai.act;
      y = Math.sin(k * Math.PI) * 0.75;
      sy = 1.28 - 0.3 * k;
      glowK = 1;
    } else {
      const k = ai.rec;
      sy = 0.72 + 0.28 * smooth(k * 1.6);
      glowK = 0;
    }
  }
  if (e.state === "hurt") {
    const k = 1 - clamp(e.st / 0.42, 0, 1);
    sy = 1 - 0.18 * Math.sin(k * Math.PI * 3) * k;
  }
  sxz = 1 / Math.sqrt(Math.max(0.3, sy));
  const flash = Math.max(0, 1 - (W.clock - e.flashAt) / 0.14);
  m.skin.emissiveIntensity = 0.22 + glowK * 0.9 + flash * 2.2;
  m.coreMat.emissiveIntensity = 0.4 + glowK * 1.4;
  if (e.dead) {
    // melt into a puddle, then fade
    const k = clamp(e.deathT / 0.7, 0, 1);
    sy = Math.max(0.05, 1 - easeOut(k));
    sxz = 1 + k * 0.6;
    const fade = clamp((e.deathT - 0.8) / 1.2, 0, 1);
    m.skin.opacity = 0.82 * (1 - fade);
    m.coreMat.opacity = 0.9 * (1 - fade);
    m.puddle.material.opacity = Math.min(0.55, k) * (1 - fade);
    m.puddle.scale.setScalar(0.5 + k * 0.7);
    for (const eye of m.eyes) eye.visible = k < 0.4;
  }
  m.body.position.y = y;
  m.body.scale.set(sxz, sy, sxz);
  for (const eye of m.eyes) eye.scale.setScalar(1 + glowK * 0.35);
  void dt;
}

function batPose(v, W, time) {
  const e = v.e;
  const m = v.model;
  const y = e.baseY + e.def.height / 2;
  m.root.position.set(e.x, y, e.z);
  m.root.rotation.y = e.yaw;
  const ai = atkInfo(e);
  let flap = 14;
  let spread = 0;
  let pitch = 0;
  if (ai && ai.phase === "tele") {
    spread = smooth(ai.tele);
    flap = 22;
    pitch = -0.3 * spread;
  }
  if (ai && ai.phase === "act") {
    pitch = 0.6;
    spread = 1;
    flap = 0;
  }
  const a = flap ? Math.sin(time * flap + e.uid) * 0.9 : -0.25;
  for (const w of m.wings) w.pivot.rotation.z = w.s * (a * (1 - spread * 0.6) + spread * 0.2);
  m.body.rotation.x = pitch;
  if (e.state === "hurt") m.body.rotation.z = Math.sin(e.st * 30) * 0.4;
  else m.body.rotation.z = 0;
  if (e.dead) {
    m.body.rotation.z = 2.6;
    for (const w of m.wings) w.pivot.rotation.z = w.s * 0.9;
    m.root.position.y = Math.max(0.15, y) - Math.max(0, e.deathT - 1.5) * 0.6;
  }
}

function spiderPose(v, W, time, dt) {
  const e = v.e;
  const m = v.model;
  m.root.position.set(e.x, 0, e.z);
  m.root.rotation.y = e.yaw;
  const sp = Math.hypot(e.vx, e.vz);
  m.walk += sp * dt * 3.2;
  const ai = atkInfo(e);
  let rear = 0;
  let hopY = 0;
  if (ai && ai.phase === "tele") rear = smooth(ai.tele);
  if (ai && ai.phase === "act") {
    rear = 0.6;
    hopY = Math.sin(ai.act * Math.PI) * 0.6;
  }
  m.body.position.y = 0.45 + hopY + Math.sin(m.walk * 2) * 0.02;
  m.body.rotation.x = -rear * 0.5;
  const mv = Math.min(1, sp / 1.5);
  for (const L of m.legs) {
    const ph = m.walk + L.phase * Math.PI * 2;
    const lift = Math.max(0, Math.sin(ph)) * 0.16 * mv;
    const front = L.k === 0;
    // foot on the floor (body space: the body sits 0.45 m up), knee arched high
    const reach = 0.82;
    const a = L.spread;
    let fx = L.ax + L.side * Math.cos(a) * reach;
    let fz = L.az + Math.sin(a) * reach + Math.cos(ph) * 0.14 * mv;
    let fy = -m.body.position.y + 0.02 + lift + 0.0;
    if (front && rear > 0) {
      // reared up: the front pair lifts and reaches forward (the telegraph)
      fy += rear * 0.75;
      fz += rear * 0.25;
    }
    _A.set(L.ax, 0, L.az);
    _F.set(fx, fy, fz);
    _K.copy(_A).lerp(_F, 0.45);
    _K.y = Math.max(_A.y, _F.y) + 0.36;
    _K.x += L.side * 0.06;
    segment(L.upper, _A, _K);
    segment(L.lower, _K, _F);
    L.knee.position.copy(_K);
  }
  if (e.state === "hurt") m.body.rotation.z = Math.sin(e.st * 30) * 0.15;
  else m.body.rotation.z = 0;
  if (e.dead) {
    const k = clamp(e.deathT / 0.6, 0, 1);
    m.body.rotation.z = k * Math.PI;
    m.body.position.y = 0.45 + Math.sin(k * Math.PI) * 0.3 - k * 0.15 - Math.max(0, e.deathT - 1.5) * 0.8;
  }
  void time;
}

function golemPose(v, W, time) {
  const e = v.e;
  const m = v.model;
  m.root.position.set(e.x, 0, e.z);
  m.root.rotation.y = e.yaw;
  const sp = Math.hypot(e.vx, e.vz);
  const walk = time * 3.4 * Math.min(1, sp / 1.2);
  const ai = atkInfo(e);
  let raise = 0;
  let slam = 0;
  let sweep = 0;
  let side = 0;
  let glowK = 0.2;
  if (ai) {
    if (ai.a.kind === "slam") {
      raise = ai.phase === "tele" ? smooth(ai.tele) : 0;
      slam = ai.phase === "act" ? easeOut(ai.act) : ai.phase === "rec" ? 1 - smooth(ai.rec) : 0;
    } else {
      side = ai.phase === "tele" ? smooth(ai.tele) : 0;
      sweep = ai.phase === "act" ? smooth(ai.act) : ai.phase === "rec" ? 1 - smooth(ai.rec) : 0;
    }
    glowK = ai.phase === "tele" ? 0.2 + ai.tele * 1.5 : ai.phase === "act" ? 1.8 : 0.4;
  }
  m.body.position.y = 1.25 + Math.abs(Math.sin(walk)) * 0.05 - slam * 0.18;
  m.body.rotation.x = slam * 0.35 - raise * 0.12;
  m.body.rotation.y = side * 0.5 - sweep * 1.0;
  for (const A of m.arms) {
    const swingWalk = Math.sin(walk + (A.s > 0 ? 0 : Math.PI)) * 0.3 * Math.min(1, sp);
    let ax = swingWalk;
    if (raise || slam) ax = -2.6 * raise + slam * 1.0 * (raise ? 0 : 1) - (slam ? 2.6 * (1 - slam) - 0.4 : 0);
    if (side || sweep) ax = A.s > 0 ? -1.2 * side - 0.3 * sweep : swingWalk;
    A.upper.rotation.set(ax, 0, A.s * (0.18 + (sweep && A.s > 0 ? 0.9 * sweep : 0)));
    A.fore.rotation.set(-0.3 - raise * 0.4, 0, 0);
  }
  for (const L of m.legs) L.hip.rotation.x = Math.sin(walk + (L.s > 0 ? 0 : Math.PI)) * 0.35 * Math.min(1, sp);
  for (const eye of m.eyes) eye.scale.setScalar(1 + glowK * 0.4);
  if (e.state === "hurt") m.body.rotation.z = Math.sin(e.st * 24) * 0.06;
  else m.body.rotation.z = 0;
  if (e.dead) {
    // crumble: the body sinks and tips, rocks spread
    const k = clamp(e.deathT / 1.0, 0, 1);
    m.body.position.y = 1.25 - easeOut(k) * 0.9 - Math.max(0, e.deathT - 1.4) * 1.2;
    m.body.rotation.x = k * 0.9;
    for (const A of m.arms) A.upper.rotation.z = A.s * (0.2 + k * 1.2);
  }
}

const _A = new THREE.Vector3();
const _F = new THREE.Vector3();
const _K = new THREE.Vector3();
const _D = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);
/** stretch a unit +Y segment mesh from a to b */
function segment(mesh, a, b) {
  _D.subVectors(b, a);
  const len = _D.length() || 1e-3;
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(_UP, _D.divideScalar(len));
  mesh.scale.set(1, len, 1);
}

/** Per-frame update: pose, decals, bar, death clean-up. Returns false once the body is gone. */
export function updateEnemyView(v, W, camera, time, dt) {
  const e = v.e;
  v.dt = dt;
  if (v.kind === "humanoid") humanoidPose(v, W, time);
  else if (v.kind === "slime") slimePose(v, W, time, dt);
  else if (v.kind === "bat") batPose(v, W, time);
  else if (v.kind === "spider") spiderPose(v, W, time, dt);
  else if (v.kind === "golem") golemPose(v, W, time);

  if (v.aura) {
    v.aura.position.set(e.x, 0.03, e.z);
    v.aura.material.opacity = e.dead ? Math.max(0, 0.45 - e.deathT) : 0.32 + Math.sin(time * 3) * 0.08;
  }

  /* telegraph decal */
  const ai = !e.dead && atkInfo(e);
  let show = false;
  let ringShow = false;
  if (ai && (ai.phase === "tele" || ai.phase === "act")) {
    const a = ai.a;
    const k = ai.phase === "tele" ? ai.tele : 1;
    const col = v.decal.material.color;
    col.setRGB(1, lerp(0.62, 0.16, k), lerp(0.24, 0.12, k));
    const op = ai.phase === "act" ? 0.9 : 0.3 + 0.55 * smooth(k);
    if (a.kind === "arc") {
      v.decal.geometry = sectorGeo(a.arc);
      v.decal.position.set(e.x, 0.035, e.z);
      v.decal.rotation.set(0, e.yaw, 0);
      v.decal.scale.setScalar(a.reach + 0.2);
      show = true;
    } else if (a.kind === "slam") {
      v.decal.geometry = geo("teleCircle", () => {
        const g = new THREE.CircleGeometry(1, 40);
        g.rotateX(-Math.PI / 2);
        return g;
      });
      const k2 = ai.k;
      const cx = k2.cx !== undefined ? k2.cx : a.target ? k2.tx : e.x + Math.sin(e.yaw) * a.offset;
      const cz = k2.cz !== undefined ? k2.cz : a.target ? k2.tz : e.z + Math.cos(e.yaw) * a.offset;
      v.decal.position.set(cx, 0.035, cz);
      v.decal.rotation.set(0, 0, 0);
      v.decal.scale.setScalar(a.r * (ai.phase === "tele" ? lerp(0.35, 1, smooth(k)) : 1));
      show = true;
    } else if (a.kind === "hop" || a.kind === "charge" || a.kind === "swoop") {
      v.decal.geometry = geo("teleLane", () => {
        const g = new THREE.PlaneGeometry(1, 1);
        g.rotateX(-Math.PI / 2);
        g.translate(0, 0, 0.5);
        return g;
      });
      const len = a.kind === "charge" ? a.range : Math.max(1.2, Math.hypot(ai.k.tx - e.x, ai.k.tz - e.z) + 0.6);
      const yaw = ai.k.lockYaw;
      v.decal.position.set(e.x, 0.035, e.z);
      v.decal.rotation.set(0, yaw, 0);
      v.decal.scale.set((a.contact || 0.6) * 2, 1, ai.phase === "act" ? Math.max(0.2, len - ai.k.travelled) : len);
      if (ai.phase === "act") v.decal.position.set(e.x, 0.035, e.z);
      show = a.kind !== "swoop" || true;
    } else if (a.kind === "ring") {
      ringShow = true;
      const r = ai.phase === "act" ? ai.k.ringR : lerp(0.6, 1.4, smooth(k));
      v.ring.position.set(e.x, 0.04, e.z);
      v.ring.scale.setScalar(Math.max(0.3, r));
      v.ring.material.opacity = ai.phase === "act" ? 0.9 : 0.25 + 0.5 * k;
      v.ring.material.color.setRGB(1, lerp(0.55, 0.2, k), 0.2);
    } else if (a.kind === "orb") {
      // casters glow (on the model); a small warning circle under the caster
      v.decal.geometry = geo("teleCircle", () => {
        const g = new THREE.CircleGeometry(1, 40);
        g.rotateX(-Math.PI / 2);
        return g;
      });
      v.decal.position.set(e.x, 0.035, e.z);
      v.decal.scale.setScalar(0.9);
      v.decal.rotation.set(0, 0, 0);
      show = ai.phase === "tele";
    }
    v.decal.material.opacity = op;
  }
  v.decal.visible = show;
  v.ring.visible = ringShow;

  /* health bar */
  if (v.bar) {
    const shown = !e.dead && e.hp < e.maxHp && e.state !== "idle";
    v.bar.visible = shown;
    if (shown) {
      v.hpShown += (e.hp / e.maxHp - v.hpShown) * (1 - Math.exp(-12 * dt));
      if (!v.hpInit) {
        v.hpShown = e.hp / e.maxHp;
        v.hpInit = true;
      }
      const top = e.baseY + e.def.height * (v.kind === "humanoid" ? 1.04 : 1.0) + 0.35;
      v.bar.position.set(e.x, top, e.z);
      v.bar.quaternion.copy(camera.quaternion);
      v.barFill.scale.x = Math.max(0.001, clamp(e.hp / e.maxHp, 0, 1));
    }
  }
  if (e.dead && e.deathT > 3.2 && !v.deathDone) {
    v.deathDone = true;
    v.root.visible = false;
    if (v.aura) v.aura.visible = false;
  }
  return !v.deathDone;
}
