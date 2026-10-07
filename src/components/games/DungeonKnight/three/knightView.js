/**
 * Dungeon Knight — the knight on screen. Builds the humanoid in the equipped
 * armour colours with the equipped sword and shield, and every frame turns
 * the engine player (state, sword/shield pose, velocity) into a body pose:
 * strides, the roll, block crouch, hurt flinch, the potion drink, the
 * victory salute and the fall.
 */
import { buildHumanoid, poseHumanoid, swapKnightWeapon, swapKnightShield, disposeHumanoid } from "./humanoid.js";
import { itemById, STARTER } from "../data/items.js";
import { ATTACKS, POTION, DODGE } from "../engine/config.js";
import { clamp, smooth, easeOut } from "../engine/math.js";

export function knightSpec(equipped, shadows = true) {
  const w = itemById(equipped.weapon) || itemById(STARTER.weapon);
  const a = itemById(equipped.armor) || itemById(STARTER.armor);
  const s = itemById(equipped.shield) || itemById(STARTER.shield);
  return {
    style: "knight",
    shadows,
    colors: { metal: a.look.metal, cloth: a.look.cloth, trim: a.look.trim, leather: "#5b3a22", dark: "#5d636f", eye: "#7fe6ff" },
    weapon: { kind: "sword", look: w.look },
    shield: s.look,
    scale: 1,
  };
}

export function createKnightView(equipped, shadows = true) {
  const rig = buildHumanoid(knightSpec(equipped, shadows));
  const view = { rig, equipped: { ...equipped }, shadows };
  return view;
}

/** Equipment changed mid-run (chest → EQUIP): rebuild only what changed. */
export function refreshKnightView(view, equipped, scene) {
  const e = view.equipped;
  if (e.armor !== equipped.armor) {
    // armour colours are baked into many parts: rebuild the whole knight
    const parent = view.rig.root.parent;
    disposeHumanoid(view.rig);
    view.rig = buildHumanoid(knightSpec(equipped, view.shadows));
    (parent || scene).add(view.rig.root);
  } else {
    if (e.weapon !== equipped.weapon) swapKnightWeapon(view.rig, (itemById(equipped.weapon) || itemById(STARTER.weapon)).look, view.shadows);
    if (e.shield !== equipped.shield) swapKnightShield(view.rig, (itemById(equipped.shield) || itemById(STARTER.shield)).look, view.shadows);
  }
  view.equipped = { ...equipped };
}

const P = {
  x: 0, z: 0, yaw: 0, y: 0, twist: 0, lean: 0, crouch: 0, roll: 0, rollBack: false, fall: 0, fallSide: 1, hurt: 0,
  hR: null, dR: null, hL: null, nL: null, flask: false, swinging: false, eyes: 0, headYaw: 0, stanceZ: 0,
};

export function updateKnightView(view, p, dt, time) {
  const a = p.act;
  P.x = p.x;
  P.z = p.z;
  P.yaw = p.yaw;
  P.y = 0;
  P.twist = p.twist || 0;
  P.lean = 0;
  P.crouch = 0;
  P.roll = 0;
  P.rollBack = false;
  P.fall = 0;
  P.hurt = 0;
  P.flask = false;
  P.swinging = false;
  P.noGait = false;
  P.stanceZ = 0;
  P.hR = p.swordH;
  P.dR = p.swordD;
  P.hL = p.shieldH;
  P.nL = p.shieldN;
  if (p.blocking) {
    P.crouch = 0.07;
    P.lean = 0.06;
    P.stanceZ = 0.08;
  }
  if (a) {
    switch (a.type) {
      case "attack": {
        const A = ATTACKS[a.name];
        const act = a.t >= a.su && a.t <= a.su + a.ac + 0.04;
        P.swinging = a.t >= a.su * 0.7 && a.t <= a.su + a.ac + 0.06;
        if (A.heavy) {
          const up = smooth(a.t / a.su);
          const down = act || a.t > a.su ? easeOut(clamp((a.t - a.su) / (a.ac + 0.05), 0, 1)) : 0;
          P.lean = -0.12 * up * (1 - down) + 0.3 * down * (1 - smooth((a.t - a.su - a.ac) / a.re));
          P.crouch = 0.12 * down * (1 - smooth((a.t - a.su - a.ac) / a.re));
        } else {
          const k = clamp((a.t - a.su * 0.5) / (a.su * 0.5 + a.ac), 0, 1);
          P.lean = 0.14 * Math.sin(k * Math.PI);
          P.crouch = 0.05 * Math.sin(k * Math.PI);
        }
        P.stanceZ = 0.1;
        break;
      }
      case "dodge": {
        const k = clamp(a.t / a.dur, 0, 1);
        if (a.back) {
          P.lean = -0.25 * Math.sin(k * Math.PI);
          P.crouch = 0.15 * Math.sin(k * Math.PI);
          P.y = Math.sin(k * Math.PI) * 0.12;
        } else {
          // a full forward roll inside the invulnerable slice
          const rk = clamp((a.t - DODGE.iStart * 0.5) / (a.dur * 0.82), 0, 1);
          P.roll = smooth(rk) * Math.PI * 2;
          P.noGait = rk > 0 && rk < 1;
        }
        break;
      }
      case "hurt":
        P.hurt = Math.sin(clamp(a.t / a.dur, 0, 1) * Math.PI);
        P.lean = -0.2 * P.hurt;
        break;
      case "blockHit":
        P.hurt = 0.4 * Math.sin(clamp(a.t / a.dur, 0, 1) * Math.PI);
        P.crouch = 0.1;
        P.stanceZ = 0.1;
        break;
      case "guardBreak": {
        const k = clamp(a.t / a.dur, 0, 1);
        P.hurt = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.9;
        P.crouch = 0.22 * Math.sin(k * Math.PI);
        P.lean = -0.15 * Math.sin(k * Math.PI);
        break;
      }
      case "potion": {
        const k = clamp(a.t / POTION.time, 0, 1);
        P.flask = k < 0.85;
        // raise the flask to the visor and tip it
        const lift = Math.sin(clamp(k / 0.85, 0, 1) * Math.PI);
        P.hL = [-0.12 + lift * 0.06, 1.05 + lift * 0.58, 0.3 - lift * 0.1];
        P.nL = [-0.6, 0.2, 0.7];
        P.lean = -0.12 * lift;
        break;
      }
      case "interact": {
        const k = clamp(a.t / a.dur, 0, 1);
        P.crouch = 0.3 * Math.sin(k * Math.PI);
        P.lean = 0.35 * Math.sin(k * Math.PI);
        P.hL = [-0.18, 0.9 - 0.25 * Math.sin(k * Math.PI), 0.55];
        P.nL = [-0.3, 0.6, 0.6];
        break;
      }
      case "victory": {
        const k = clamp(a.t / 0.6, 0, 1);
        P.lean = -0.12 * smooth(k);
        break;
      }
      case "defeated": {
        const k = clamp(a.t / 1.1, 0, 1);
        P.fall = easeOut(k);
        P.fallSide = 1;
        P.noGait = true;
        break;
      }
      default:
        break;
    }
  }
  poseHumanoid(view.rig, P, dt, time);
}

/** World hilt/tip of the drawn sword (for the trail). */
export function swordEnds(view, outHilt, outTip) {
  const w = view.rig.weapon;
  if (!w) return false;
  outHilt.set(0, 0.15, 0);
  outTip.set(0, w.userData.len || 1, 0);
  w.localToWorld(outHilt);
  w.localToWorld(outTip);
  return true;
}

export { disposeHumanoid };
