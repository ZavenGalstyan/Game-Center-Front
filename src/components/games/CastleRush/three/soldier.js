/**
 * Castle Rush — articulated low-poly soldiers + their procedural animation.
 *
 * Rig (model faces +Z; right hand on −X):
 *   root (lane position, facing)  ─ blob shadow, health bar
 *    └ fall (death topple, pivots at the feet)
 *       └ body (hip height + bob)
 *          ├ pelvis · hipL/R → thigh → kneeL/R → shin+boot
 *          └ torso (lean / twist)
 *             ├ head (helmet / hood)
 *             └ shoulderL/R → upper arm → elbowL/R → forearm + hand + weapon/shield/bow
 * Every part is one merged, vertex-coloured mesh; geometries are cached per
 * (unit type, side) and shared by all soldiers of that kind. Each rig owns
 * ONE material clone so it can flash on a hit and fade out when defeated.
 *
 * Animation is a pure function of the engine unit (state, timers, distance
 * walked): attacks use the SAME windup the engine uses, so the blade reaches
 * the target — or the arrow leaves the string — on the exact impact frame.
 */
import * as THREE from "three";
import { UNITS } from "../data/units.js";
import { cached, paint, merge, T, box, cyl, cone, sph, dome, capsule, vcMat } from "./geo.js";
import { blobTexture } from "./textures.js";

export const TEAM = {
  player: { cloth: "#2f72d6", clothDark: "#1f4f9c", trim: "#f3c64f", metal: "#cfd6de", metalDark: "#8e98a6", leather: "#8a5a32", plume: "#4aa8ff", hood: "#2a8a4a" },
  enemy: { cloth: "#c7362b", clothDark: "#86211a", trim: "#2b2427", metal: "#9a9ea6", metalDark: "#4a4e57", leather: "#5a3820", plume: "#ff4b3a", hood: "#7a2a22" },
};
const SKIN = "#e7b48c";
const SKIN_D = "#c98f69";
const HAIR = "#4a3424";
const WOOD = "#8b5a2e";
const DARK = "#2a2420";

const HIP_Y = 0.74;
const THIGH = 0.36;
const UPPER = 0.28;
const FORE = 0.27;

/* ================================================================ parts */
function partsFor(type, side) {
  const key = `${type}|${side}`;
  return cached(`soldier:${key}`, () => {
    const c = TEAM[side];
    const enemy = side === "enemy";
    const heavy = type === "shield" || type === "knight";
    const armorCol = type === "knight" ? c.metal : type === "shield" ? c.metalDark : type === "archer" ? c.leather : "#a6adb6";

    /* legs */
    const thigh = merge([
      paint(T(box(0.15, THIGH, 0.17), 0, -THIGH / 2, 0), type === "archer" ? "#5b4a3a" : heavy ? c.metalDark : "#6b5a48"),
      ...(heavy ? [paint(T(box(0.17, 0.12, 0.19), 0, -THIGH + 0.04, 0.005), c.metal)] : []),
    ]);
    const shin = merge([
      paint(T(box(0.13, 0.3, 0.15), 0, -0.15, 0), heavy ? c.metal : "#5d4c3c"),
      paint(T(box(0.16, 0.12, 0.27), 0, -0.32, 0.045), heavy ? c.metalDark : DARK),
    ]);

    /* pelvis: belt + tunic skirt */
    const pelvisParts = [
      paint(T(cyl(0.21, 0.26, 0.28, 10), 0, -0.07, 0, 0, 0, 0, 1, 1, 0.78), type === "archer" ? c.hood : c.cloth, 0.06, 3),
      paint(T(cyl(0.215, 0.215, 0.07, 10), 0, 0.06, 0, 0, 0, 0, 1, 1, 0.8), c.leather),
      paint(T(box(0.07, 0.07, 0.03), 0, 0.06, 0.18), c.trim),
    ];
    if (heavy) pelvisParts.push(paint(T(cyl(0.24, 0.29, 0.16, 10), 0, -0.04, 0, 0, 0, 0, 1, 1, 0.8), c.metalDark, 0.05, 4));
    const pelvis = merge(pelvisParts);

    /* torso */
    const tp = [];
    const chestW = type === "knight" ? 0.46 : type === "shield" ? 0.44 : 0.4;
    tp.push(paint(T(box(chestW, 0.46, 0.26), 0, 0.3, 0), armorCol, 0.08, 5));
    tp.push(paint(T(box(chestW * 0.92, 0.18, 0.22), 0, 0.12, 0), armorCol, 0.06, 6));
    // tabard (team colour) over the armour
    if (type !== "archer") {
      tp.push(paint(T(box(chestW * 0.6, 0.5, 0.03), 0, 0.22, 0.135), c.cloth, 0.04, 7));
      tp.push(paint(T(box(chestW * 0.6, 0.04, 0.035), 0, 0.46, 0.137), c.trim));
      tp.push(paint(T(box(0.07, 0.07, 0.036), 0, 0.3, 0.15), c.trim));
    } else {
      tp.push(paint(T(box(chestW * 0.96, 0.4, 0.04), 0, 0.28, 0.12), c.hood, 0.05, 8));
      // quiver on the back with fletchings
      tp.push(paint(T(cyl(0.07, 0.07, 0.42, 8), 0.08, 0.36, -0.18, 0.35, 0, -0.3), WOOD));
      for (let i = 0; i < 3; i++) tp.push(paint(T(cone(0.035, 0.1, 4), 0.02 + i * 0.05, 0.62, -0.26 + i * 0.01, 0.35, 0, -0.3), c.plume));
      tp.push(paint(T(box(0.03, 0.5, 0.03), 0.0, 0.3, 0.0, 0, 0, 0.75), c.leather));
    }
    // pauldrons
    const pr = type === "knight" ? 0.14 : type === "shield" ? 0.13 : 0.1;
    if (type !== "archer") {
      tp.push(paint(T(sph(pr, 8, 6), -0.25, 0.5, 0, 0, 0, 0, 1.1, 0.75, 1), heavy ? c.metal : "#b8bec6"));
      tp.push(paint(T(sph(pr, 8, 6), 0.25, 0.5, 0, 0, 0, 0, 1.1, 0.75, 1), heavy ? c.metal : "#b8bec6"));
      if (enemy) {
        tp.push(paint(T(cone(0.04, 0.14, 5), -0.3, 0.6, 0, 0, 0, 0.5), c.metalDark));
        tp.push(paint(T(cone(0.04, 0.14, 5), 0.3, 0.6, 0, 0, 0, -0.5), c.metalDark));
      }
    }
    // knight cape
    if (type === "knight") {
      tp.push(paint(T(box(0.42, 0.78, 0.04), 0, 0.12, -0.16, -0.12, 0, 0), c.clothDark, 0.05, 9));
      tp.push(paint(T(box(0.44, 0.05, 0.05), 0, 0.5, -0.15), c.trim));
    }
    tp.push(paint(T(cyl(0.07, 0.08, 0.1, 8), 0, 0.57, 0), SKIN_D));
    const torso = merge(tp);

    /* head */
    const hp = [];
    hp.push(paint(T(sph(0.155, 12, 10), 0, 0.15, 0.01), SKIN));
    hp.push(paint(T(box(0.035, 0.035, 0.02), -0.055, 0.17, 0.155), DARK));
    hp.push(paint(T(box(0.035, 0.035, 0.02), 0.055, 0.17, 0.155), DARK));
    hp.push(paint(T(box(0.04, 0.06, 0.05), 0, 0.12, 0.165), SKIN_D));
    if (type === "swordsman") {
      hp.push(paint(T(dome(0.175, 12, 6), 0, 0.17, 0), c.metal === "#cfd6de" ? "#bfc6ce" : c.metal, 0.05, 11));
      hp.push(paint(T(cyl(0.18, 0.18, 0.04, 12), 0, 0.17, 0), c.metalDark));
      hp.push(paint(T(box(0.03, 0.13, 0.03), 0, 0.12, 0.17), c.metalDark));
      if (enemy) hp.push(paint(T(cone(0.04, 0.16, 5), 0, 0.38, 0), c.metalDark));
      else hp.push(paint(T(box(0.03, 0.08, 0.2), 0, 0.36, -0.02), c.plume));
      hp.push(paint(T(box(0.26, 0.12, 0.12), 0, 0.05, -0.08), HAIR));
    } else if (type === "archer") {
      // hood with a soft point
      hp.push(paint(T(sph(0.185, 10, 8), 0, 0.17, -0.025, 0, 0, 0, 1, 1.02, 1.05), c.hood, 0.06, 12));
      hp.push(paint(T(cone(0.09, 0.2, 6), 0, 0.27, -0.16, -1.0, 0, 0), c.hood));
      hp.push(paint(T(box(0.22, 0.2, 0.05), 0, 0.15, 0.13), SKIN));
      hp.push(paint(T(box(0.035, 0.035, 0.02), -0.055, 0.17, 0.157), DARK));
      hp.push(paint(T(box(0.035, 0.035, 0.02), 0.055, 0.17, 0.157), DARK));
    } else if (type === "shield") {
      // closed bascinet with a face slit
      hp.push(paint(T(sph(0.185, 12, 10), 0, 0.16, 0, 0, 0, 0, 1, 1.08, 1.04), c.metalDark, 0.05, 13));
      hp.push(paint(T(box(0.2, 0.025, 0.05), 0, 0.18, 0.17), DARK));
      hp.push(paint(T(cyl(0.195, 0.2, 0.05, 12), 0, 0.05, 0), c.metal));
      hp.push(paint(T(box(0.03, 0.06, 0.24), 0, 0.37, 0), c.cloth));
    } else {
      // great helm with plume (knight)
      hp.push(paint(T(cyl(0.18, 0.17, 0.3, 12), 0, 0.17, 0), c.metal, 0.04, 14));
      hp.push(paint(T(dome(0.18, 12, 5), 0, 0.32, 0), c.metal));
      hp.push(paint(T(box(0.25, 0.025, 0.05), 0, 0.2, 0.17), DARK));
      hp.push(paint(T(box(0.025, 0.12, 0.04), 0, 0.12, 0.18), DARK));
      hp.push(paint(T(box(0.04, 0.32, 0.03), 0, 0.17, 0.18), c.trim));
      if (enemy) {
        hp.push(paint(T(cone(0.045, 0.26, 6), -0.17, 0.38, 0, 0, 0, 0.75), "#e9dcc4"));
        hp.push(paint(T(cone(0.045, 0.26, 6), 0.17, 0.38, 0, 0, 0, -0.75), "#e9dcc4"));
      } else {
        hp.push(paint(T(capsule(0.06, 0.22, 3, 6), 0, 0.5, -0.08, -1.1, 0, 0), c.plume));
        hp.push(paint(T(capsule(0.05, 0.16, 3, 6), 0, 0.46, -0.2, -1.5, 0, 0), c.plume));
      }
    }
    const head = merge(hp);

    /* arms */
    const sleeve = type === "archer" ? c.hood : heavy ? c.metal : "#a6adb6";
    const upper = merge([paint(T(box(0.12, UPPER, 0.12), 0, -UPPER / 2, 0), sleeve, 0.05, 15)]);
    const fore = (right) => {
      const fp = [paint(T(box(0.11, FORE - 0.04, 0.11), 0, -FORE / 2 + 0.02, 0), heavy ? c.metal : type === "archer" ? c.leather : "#8d8f93", 0.04, 16)];
      fp.push(paint(T(box(0.13, 0.08, 0.13), 0, -FORE + 0.08, 0), heavy ? c.metalDark : c.leather));
      fp.push(paint(T(sph(0.062, 8, 6), 0, -FORE - 0.01, 0), heavy ? c.metalDark : SKIN));
      const hy = -FORE - 0.01;
      if (right) {
        if (type === "swordsman") {
          // arming sword: blade forward-ish out of the fist
          const d = new THREE.Vector3(0, -0.35, 1).normalize();
          const ang = Math.atan2(d.y, d.z);
          fp.push(paint(T(box(0.05, 0.05, 0.16), 0, hy, -0.02, -ang, 0, 0), WOOD));
          fp.push(paint(T(box(0.24, 0.04, 0.05), 0, hy + d.y * 0.08, d.z * 0.08, -ang, 0, 0), c.trim));
          fp.push(paint(T(box(0.065, 0.018, 0.72), 0, hy + d.y * 0.46, d.z * 0.46, -ang, 0, 0), "#e6ebf0"));
          fp.push(paint(T(sph(0.035, 6, 4), 0, hy - d.y * 0.1, -d.z * 0.1), c.trim));
        } else if (type === "knight") {
          // greatsword
          const d = new THREE.Vector3(0, -0.35, 1).normalize();
          const ang = Math.atan2(d.y, d.z);
          fp.push(paint(T(box(0.055, 0.055, 0.3), 0, hy - d.y * 0.04, -d.z * 0.04, -ang, 0, 0), DARK));
          fp.push(paint(T(box(0.4, 0.05, 0.07), 0, hy + d.y * 0.13, d.z * 0.13, -ang, 0, 0), c.trim));
          fp.push(paint(T(box(0.1, 0.025, 1.15), 0, hy + d.y * 0.72, d.z * 0.72, -ang, 0, 0), "#eef2f6"));
          fp.push(paint(T(sph(0.05, 6, 4), 0, hy - d.y * 0.2, -d.z * 0.2), c.trim));
        } else if (type === "shield") {
          // spear along the forearm (tip beyond the fist)
          fp.push(paint(T(cyl(0.022, 0.022, 1.7, 6), 0, hy - 0.45, 0.02), WOOD));
          fp.push(paint(T(cone(0.05, 0.2, 4), 0, hy - 1.38, 0.02, Math.PI, 0, 0), "#e6ebf0"));
          fp.push(paint(T(box(0.07, 0.04, 0.07), 0, hy - 1.24, 0.02), c.trim));
        }
      } else {
        if (type === "shield") {
          // tower shield: wide face toward the forearm's front
          fp.push(paint(T(box(0.66, 0.08, 1.02), 0, hy + 0.02, 0.06), c.cloth, 0.04, 17));
          fp.push(paint(T(box(0.72, 0.06, 1.08), 0, hy + 0.06, 0.06), c.metalDark));
          fp.push(paint(T(box(0.1, 0.03, 0.84), 0, hy - 0.035, 0.06), c.trim));
          fp.push(paint(T(box(0.5, 0.03, 0.1), 0, hy - 0.035, 0.16), c.trim));
          fp.push(paint(T(sph(0.07, 8, 6), 0, hy - 0.05, 0.06), c.metal));
        } else if (type === "archer") {
          // recurve bow, string side toward the archer
          const bp = [];
          for (let i = -3; i <= 3; i++) {
            const t = i / 3;
            const z = t * 0.56;
            const y = hy - 0.05 - (1 - t * t) * 0.12 + (Math.abs(t) > 0.85 ? -0.04 : 0);
            bp.push(paint(T(box(0.045, 0.05, 0.2), 0, y, z, -t * 0.42, 0, 0), WOOD));
          }
          fp.push(...bp);
          fp.push(paint(T(box(0.012, 0.012, 1.12), 0, hy + 0.04, 0), "#f2ead8"));
          fp.push(paint(T(box(0.06, 0.06, 0.12), 0, hy - 0.02, 0), c.leather));
        } else if (type === "knight") {
          // gauntlet only — both hands on the greatsword
        }
      }
      return merge(fp);
    };
    const foreR = fore(true);
    const foreL = fore(false);

    // nocked arrow (archer), lives in torso space
    const arrow =
      type === "archer"
        ? merge([
            paint(T(box(0.018, 0.018, 0.78), 0, 0, 0.12), "#e9d6a6"),
            paint(T(cone(0.03, 0.09, 4), 0, 0, 0.55, Math.PI / 2, 0, 0), "#d8dde2"),
            paint(T(box(0.005, 0.06, 0.1), 0, 0, -0.24), c.plume),
          ])
        : null;
    return { thigh, shin, pelvis, torso, head, upper, foreR, foreL, arrow };
  });
}

/* swing trail (shared): a curved ribbon in the torso's sagittal plane */
function trailGeo(r) {
  return cached(`trail${r}`, () => {
    // arc from over the shoulder (back-top) over the head to forward-low, the path the blade sweeps
    const g = new THREE.RingGeometry(r * 0.84, r, 24, 1, Math.PI * 0.3, Math.PI * 0.78);
    g.rotateY(Math.PI / 2);
    return g;
  });
}

const blobGeo = () => cached("blob", () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
const barGeo = () => cached("bar", () => new THREE.PlaneGeometry(1, 1));
let blobMat = null;
const barMats = {};
const trailMats = {};

/* ================================================================ rig */
export function buildSoldier(type, side) {
  const P = partsFor(type, side);
  const def = UNITS[type];
  const base = vcMat("soldier");
  const mat = base.clone();
  mat.emissive = new THREE.Color(0, 0, 0);
  const mk = (g) => {
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    return m;
  };
  const root = new THREE.Group();
  const fall = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = HIP_Y;
  const pelvis = mk(P.pelvis);
  const hipL = new THREE.Group();
  const hipR = new THREE.Group();
  hipL.position.set(0.11, 0, 0);
  hipR.position.set(-0.11, 0, 0);
  const kneeL = new THREE.Group();
  const kneeR = new THREE.Group();
  kneeL.position.y = kneeR.position.y = -THIGH;
  hipL.add(mk(P.thigh), kneeL);
  hipR.add(mk(P.thigh), kneeR);
  kneeL.add(mk(P.shin));
  kneeR.add(mk(P.shin));
  const torso = new THREE.Group();
  torso.position.y = 0.02;
  torso.add(mk(P.torso));
  const head = new THREE.Group();
  head.position.y = 0.6;
  head.add(mk(P.head));
  const shL = new THREE.Group();
  const shR = new THREE.Group();
  shL.position.set(0.26, 0.48, 0);
  shR.position.set(-0.26, 0.48, 0);
  const elL = new THREE.Group();
  const elR = new THREE.Group();
  elL.position.y = elR.position.y = -UPPER;
  shL.add(mk(P.upper), elL);
  shR.add(mk(P.upper), elR);
  elL.add(mk(P.foreL));
  elR.add(mk(P.foreR));
  torso.add(head, shL, shR);
  let arrow = null;
  if (P.arrow) {
    arrow = new THREE.Mesh(P.arrow, mat);
    arrow.position.set(-0.05, 0.5, 0.1);
    arrow.visible = false;
    torso.add(arrow);
  }
  // swing trail for melee
  let trail = null;
  if (!def.ranged) {
    const key = `${side}${type}`;
    if (!trailMats[key]) trailMats[key] = new THREE.MeshBasicMaterial({ color: type === "knight" ? "#fff6d8" : "#ffffff", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    trail = new THREE.Mesh(trailGeo(type === "knight" ? 1.35 : type === "shield" ? 1.1 : 1.0), trailMats[key].clone());
    trail.position.set(-0.26, 0.48, 0);
    trail.visible = false;
    torso.add(trail);
  }
  body.add(pelvis, hipL, hipR, torso);
  fall.add(body);
  root.add(fall);
  // blob shadow
  if (!blobMat) blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), color: "#000000", transparent: true, opacity: 0.32, depthWrite: false });
  const blob = new THREE.Mesh(blobGeo(), blobMat);
  blob.position.y = 0.03;
  blob.scale.setScalar(def.radius * 2.6);
  blob.renderOrder = 1;
  root.add(blob);
  // health bar (billboarded by the renderer)
  if (!barMats.bg) {
    barMats.bg = new THREE.MeshBasicMaterial({ color: "#14181c", transparent: true, opacity: 0.75, depthWrite: false, depthTest: false });
    barMats.player = new THREE.MeshBasicMaterial({ color: "#47d36b", depthWrite: false, depthTest: false });
    barMats.enemy = new THREE.MeshBasicMaterial({ color: "#ff5040", depthWrite: false, depthTest: false });
  }
  const bar = new THREE.Group();
  const bw = 0.8 * (type === "knight" ? 1.15 : 1);
  const bg = new THREE.Mesh(barGeo(), barMats.bg);
  bg.scale.set(bw + 0.06, 0.13, 1);
  const fill = new THREE.Mesh(barGeo(), barMats[side]);
  fill.scale.set(bw, 0.08, 1);
  fill.position.z = 0.001;
  bg.renderOrder = 20;
  fill.renderOrder = 21;
  bar.add(bg, fill);
  bar.position.y = 2.0;
  bar.visible = false;
  root.add(bar);

  root.scale.setScalar(def.visualScale);
  return {
    type,
    side,
    root,
    fall,
    body,
    torso,
    head,
    hipL,
    hipR,
    kneeL,
    kneeR,
    shL,
    shR,
    elL,
    elR,
    arrow,
    trail,
    mat,
    bar,
    barFill: fill,
    barW: bw,
    blob,
    hpShown: 1,
    unitId: 0,
    flash: 0,
    j: null, // smoothed joint values
  };
}

/* ================================================================ poses */
const J = ["bodyY", "lean", "twist", "headX", "shLx", "shLz", "elL", "shRx", "shRz", "elR", "hipL", "hipR", "kneeL", "kneeR", "crouch"];
const zero = () => Object.fromEntries(J.map((k) => [k, 0]));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeIn = (t) => t * t * t;
const smooth = (t) => t * t * (3 - 2 * t);

/** rest stance per type (arms carrying the weapon) */
function guard(type, o) {
  if (type === "swordsman") {
    o.shRx = -0.35;
    o.elR = -1.25;
    o.shRz = -0.08;
    o.shLx = -0.15;
    o.shLz = 0.12;
    o.elL = -0.4;
  } else if (type === "archer") {
    o.shLx = -0.35;
    o.elL = -0.25;
    o.shLz = 0.1;
    o.shRx = -0.1;
    o.elR = -0.3;
  } else if (type === "shield") {
    o.shLx = -0.75;
    o.shLz = -0.2;
    o.elL = -0.95;
    o.shRx = 0.25;
    o.elR = -1.85;
    o.crouch = 0.04;
  } else {
    o.shRx = -0.55;
    o.elR = -1.05;
    o.shRz = 0.32;
    o.shLx = -0.6;
    o.shLz = -0.32;
    o.elL = -1.0;
  }
}

/** attack pose at time t into the attack (impact at `w`) */
function attackPose(type, t, w, cd, o) {
  if (type === "archer") {
    // nock → draw → hold → release at w → recoil
    const draw = clamp01(t / (w * 0.8));
    const d = smooth(draw);
    o.shLx = lerp(-0.35, -1.52, d);
    o.shLz = lerp(0.1, 0.05, d);
    o.elL = lerp(-0.25, -0.04, d);
    o.shRx = lerp(-0.1, -1.5, d);
    o.shRz = lerp(0, 0.35, d);
    o.elR = lerp(-0.3, -2.25, d);
    o.twist = -0.35 * d;
    o.headX = 0.05 * d;
    if (t >= w) {
      const r = clamp01((t - w) / 0.18);
      o.shRx = lerp(-1.5, -1.25, r);
      o.elR = lerp(-2.25, -2.6, Math.sin(r * Math.PI));
      o.shRz = lerp(0.35, 0.55, r);
      const back = clamp01((t - w - 0.25) / 0.35);
      o.shLx = lerp(o.shLx, -0.35, smooth(back));
      o.elL = lerp(o.elL, -0.25, smooth(back));
      o.shRx = lerp(o.shRx, -0.1, smooth(back));
      o.elR = lerp(o.elR, -0.3, smooth(back));
      o.shRz = lerp(o.shRz, 0, smooth(back));
      o.twist = lerp(-0.35, 0, smooth(back));
    }
    return;
  }
  if (type === "shield") {
    // spear: cock back, thrust at w, recover; shield stays forward
    const strike = 0.12;
    const a = clamp01(t / Math.max(0.01, w - strike));
    const b = clamp01((t - (w - strike)) / strike);
    const back = smooth(a);
    o.shRx = lerp(0.25, 0.55, back);
    o.elR = lerp(-1.85, -2.0, back);
    o.twist = lerp(0, 0.25, back);
    if (t >= w - strike) {
      const k = easeIn(b);
      o.shRx = lerp(0.55, -1.45, k);
      o.elR = lerp(-2.0, -0.12, k);
      o.twist = lerp(0.25, -0.3, k);
      o.lean = lerp(0, 0.16, k);
    }
    if (t >= w) {
      const r = smooth(clamp01((t - w - 0.08) / Math.max(0.1, cd - w - 0.2)));
      o.shRx = lerp(-1.45, 0.25, r);
      o.elR = lerp(-0.12, -1.85, r);
      o.twist = lerp(-0.3, 0, r);
      o.lean = lerp(0.16, 0, r);
    }
    o.shLx = -0.75;
    o.shLz = -0.2;
    o.elL = -0.95;
    o.crouch = 0.06;
    return;
  }
  // overhead swing (swordsman one-handed, knight two-handed & heavier)
  const heavy = type === "knight";
  const strike = heavy ? 0.16 : 0.13;
  const raiseEnd = Math.max(0.05, w - strike);
  const a = easeOut(clamp01(t / raiseEnd));
  const up = { shRx: heavy ? -2.85 : -2.75, elR: heavy ? -0.55 : -0.85, twist: heavy ? 0.42 : 0.38, lean: -0.1, shRz: heavy ? 0.22 : -0.15 };
  const hit = { shRx: heavy ? -0.75 : -0.62, elR: -0.08, twist: heavy ? -0.42 : -0.32, lean: heavy ? 0.24 : 0.18, shRz: heavy ? 0.28 : -0.05 };
  const g = {};
  guard(type, g);
  o.shRx = lerp(g.shRx, up.shRx, a);
  o.elR = lerp(g.elR, up.elR, a);
  o.twist = lerp(0, up.twist, a);
  o.lean = lerp(0, up.lean, a);
  o.shRz = lerp(g.shRz, up.shRz, a);
  if (t >= raiseEnd) {
    const k = easeIn(clamp01((t - raiseEnd) / strike));
    o.shRx = lerp(up.shRx, hit.shRx, k);
    o.elR = lerp(up.elR, hit.elR, k);
    o.twist = lerp(up.twist, hit.twist, k);
    o.lean = lerp(up.lean, hit.lean, k);
    o.shRz = lerp(up.shRz, hit.shRz, k);
  }
  if (t >= w) {
    const f = clamp01((t - w) / 0.09);
    const follow = { shRx: hit.shRx + 0.25, elR: 0, twist: hit.twist - 0.06, lean: hit.lean + 0.03, shRz: hit.shRz };
    const r = smooth(clamp01((t - w - 0.12) / Math.max(0.12, cd - w - 0.25)));
    for (const k of ["shRx", "elR", "twist", "lean", "shRz"]) o[k] = lerp(lerp(hit[k], follow[k], f), k === "twist" || k === "lean" ? 0 : g[k], r);
  }
  if (heavy) {
    // left hand follows the grip
    o.shLx = o.shRx * 0.95;
    o.shLz = -o.shRz;
    o.elL = o.elR;
  } else {
    o.shLx = -0.15 + o.twist * 0.6;
    o.shLz = 0.12;
    o.elL = -0.4;
  }
  // front-foot lunge into the blow
  const lunge = t >= raiseEnd ? Math.sin(clamp01((t - raiseEnd) / (strike + 0.25)) * Math.PI) : 0;
  o.hipR = -0.35 * lunge;
  o.kneeR = 0.25 * lunge;
  o.hipL = 0.25 * lunge;
  o.kneeL = 0.15 * lunge;
  o.crouch = 0.05 * lunge;
}

const tmpPose = zero();

/**
 * Pose a rig from its unit. `time` = engine time (for idle breathing), `dt`
 * real frame time for smoothing, `ended` = battle decided, `won` side.
 */
export function animateSoldier(rig, u, time, dt, ended, winner) {
  const def = UNITS[u.type];
  const o = tmpPose;
  for (const k of J) o[k] = 0;
  guard(u.type, o);
  const st = u.state;
  if (st === "ATTACKING" || st === "RECOVERING") {
    attackPose(u.type, u.atkT, def.windup, def.attackCooldown, o);
  } else if (st !== "DEFEATED") {
    // walk cycle driven by distance actually covered (no foot sliding)
    const stride = 1.05 * def.visualScale * (def.weight === "heavy" ? 0.9 : 1);
    const ph = (u.walk / stride) * Math.PI * 2;
    const w = u.moving ? 1 : 0;
    rig.walkW = lerp(rig.walkW || 0, w, 1 - Math.exp(-10 * dt));
    const ww = rig.walkW;
    const s = Math.sin(ph);
    o.hipL += -0.55 * s * ww;
    o.hipR += 0.55 * s * ww;
    o.kneeL += Math.max(0, Math.sin(ph + 1.3)) * 0.85 * ww;
    o.kneeR += Math.max(0, Math.sin(ph + Math.PI + 1.3)) * 0.85 * ww;
    o.bodyY += Math.abs(Math.cos(ph)) * 0.045 * ww;
    o.lean += 0.08 * ww;
    if (u.type === "swordsman" || u.type === "archer") {
      o.shLx += 0.35 * s * ww;
      if (u.type === "archer") o.shRx += -0.35 * s * ww;
    } else if (u.type === "knight") {
      o.shRx += 0.08 * s * ww;
      o.shLx += 0.08 * s * ww;
    }
    // idle breathing
    const br = Math.sin(time * 2.2 + u.id) * (1 - ww);
    o.bodyY += br * 0.008;
    o.headX += br * 0.02;
    // victory cheer
    if (ended && winner === u.side && !u.moving) {
      const c = (Math.sin(time * 6 + u.id) + 1) / 2;
      o.shRx = -2.9 + c * 0.2;
      o.elR = -0.2;
      o.bodyY += c * 0.05;
    }
  }
  // hurt: knocked back a touch
  if (u.hurtT > 0 && st !== "DEFEATED") {
    const h = u.hurtT / 0.22;
    o.lean -= 0.22 * h;
    o.headX -= 0.25 * h;
  }

  // smoothing (attacks stay frame-exact so the blade meets the impact)
  if (!rig.j) rig.j = { ...o };
  const exact = st === "ATTACKING";
  const k = exact ? 1 : 1 - Math.exp(-16 * dt);
  const j = rig.j;
  for (const key of J) j[key] = exact ? o[key] : lerp(j[key], o[key], k);

  rig.body.position.y = HIP_Y + j.bodyY - j.crouch;
  rig.torso.rotation.set(j.lean, j.twist, 0);
  rig.head.rotation.x = j.headX - j.lean * 0.5;
  rig.shL.rotation.set(j.shLx, 0, j.shLz);
  rig.shR.rotation.set(j.shRx, 0, j.shRz);
  rig.elL.rotation.x = j.elL;
  rig.elR.rotation.x = j.elR;
  rig.hipL.rotation.x = j.hipL;
  rig.hipR.rotation.x = j.hipR;
  rig.kneeL.rotation.x = j.kneeL;
  rig.kneeR.rotation.x = j.kneeR;

  // archer: arrow on the string while drawing
  if (rig.arrow) {
    const drawing = st === "ATTACKING" && u.atkT > def.windup * 0.25;
    rig.arrow.visible = drawing;
  }
  // swing trail around the strike
  if (rig.trail) {
    const strike = u.type === "knight" ? 0.16 : u.type === "shield" ? 0.12 : 0.13;
    const t = u.atkT;
    let a = 0;
    if ((st === "ATTACKING" || st === "RECOVERING") && t > def.windup - strike && t < def.windup + 0.14) a = t < def.windup ? clamp01((t - (def.windup - strike)) / strike) : 1 - (t - def.windup) / 0.14;
    rig.trail.visible = a > 0.02 && u.type !== "shield";
    if (rig.trail.visible) {
      rig.trail.material.opacity = 0.3 * a;
    }
  }

  // death: topple backwards, lie still, sink & fade
  if (st === "DEFEATED") {
    const t = u.deadT;
    const f = easeOut(clamp01(t / 0.45));
    rig.fall.rotation.x = -1.42 * f;
    rig.fall.position.y = 0.08 * f;
    const sink = clamp01((t - 0.75) / 0.5);
    rig.fall.position.y -= sink * 0.45;
    rig.mat.transparent = true;
    rig.mat.opacity = 1 - sink;
    rig.blob.material = blobMat;
    rig.blob.scale.setScalar(UNITS[u.type].radius * 2.6 * (1 - sink * 0.6));
    if (!rig.dead) {
      rig.dead = true;
      rig.mat.depthWrite = true;
    }
  } else if (rig.dead) {
    rig.dead = false;
  }

  // hit flash
  const fl = u.hurtT > 0 ? u.hurtT / 0.22 : 0;
  rig.mat.emissive.setRGB(fl * 0.32, fl * 0.26, fl * 0.2);
}

/** return a pooled rig to a neutral pose */
export function resetRig(rig) {
  rig.fall.rotation.set(0, 0, 0);
  rig.fall.position.set(0, 0, 0);
  rig.mat.transparent = false;
  rig.mat.opacity = 1;
  rig.mat.emissive.setScalar(0);
  rig.j = null;
  rig.walkW = 0;
  rig.dead = false;
  rig.bar.visible = false;
  rig.hpShown = 1;
  if (rig.arrow) rig.arrow.visible = false;
  if (rig.trail) rig.trail.visible = false;
}

/** Army-screen / menu showcase: a looping idle → attack demo on a fake unit */
export function showcaseUnit(type, t) {
  const def = UNITS[type];
  const cycle = def.attackCooldown + 1.4;
  const k = t % cycle;
  const u = { id: 7, type, side: "player", walk: 0, moving: false, hurtT: 0, state: "MOVING", atkT: 0, deadT: 0 };
  if (k > 1.4) {
    u.state = k - 1.4 < def.windup ? "ATTACKING" : "RECOVERING";
    u.atkT = k - 1.4;
  }
  return u;
}

