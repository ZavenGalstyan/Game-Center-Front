/**
 * Shadow Warriors — move library.
 *
 * Every attack is frame data (s startup, a active, r recovery — 60 Hz frames),
 * damage/stamina numbers, a hit height, and pose keyframes. The striking limb
 * (`limb`) is a capsule taken from the solved skeleton during the active
 * frames, so reach comes from the animation itself (plus the weapon length).
 *
 * Heights: high (crouching dodges it), mid (block standing or crouching),
 * low (block crouching), over (overhead — block standing).
 */
import { BASE_POSE, pose } from "./skeleton.js";

// ------------------------------------------------------------------ stances
export const CROUCH = pose({ hy: -44, t: 36, h: -14, lF: 86, kF: 136, lB: 2, kB: 118, aF: 66, eF: 70, aB: 40, eB: 96 });
export const AIR = pose({ t: 6, lF: 72, kF: 104, lB: 18, kB: 96, aF: 70, eF: 60, aB: 40, eB: 90 });

const GUARDS = {
  fists: BASE_POSE,
  blade: pose({ aF: 40, eF: 58, wF: 18, aB: 32, eB: 92 }),
  dual: pose({ aF: 44, eF: 78, wF: -14, aB: 36, eB: 88, wB: -8 }),
  pole: pose({ aF: 58, eF: 30, wF: 2, aB: 38, eB: 62, t: 10 }),
  heavy: pose({ aF: 34, eF: 96, wF: 72, aB: 46, eB: 76, t: 10 }),
  chain: pose({ aF: 30, eF: 70, wF: -10, wl: 0.16, aB: 34, eB: 96 }),
};
export const guardFor = (family) => GUARDS[family] || BASE_POSE;
export const crouchFor = (family) => {
  const g = GUARDS[family] || BASE_POSE;
  return { ...CROUCH, aF: g.aF + 8, eF: g.eF, wF: g.wF, aB: g.aB, eB: g.eB, wB: g.wB, wl: g.wl };
};
export const airFor = (family) => {
  const g = GUARDS[family] || BASE_POSE;
  return { ...AIR, aF: g.aF + 14, eF: g.eF, wF: g.wF, aB: g.aB, eB: g.eB, wB: g.wB, wl: g.wl };
};

// ------------------------------------------------------------------ helpers
/** Build keyframes from guard → chamber → strike → follow → end. */
function keys(m, from, end) {
  const s = m.s;
  const c = Math.max(1, Math.round(s * (m.chamberAt ?? 0.55)));
  const out = [[0, from]];
  out.push([c, { ...from, ...m.chamber }]);
  if (m.hold) out.push([Math.max(c + 1, s - 3), { ...from, ...m.chamber, ...m.hold }]);
  out.push([s, { ...from, ...m.strike }]);
  out.push([s + m.a, { ...from, ...(m.follow || m.strike) }]);
  out.push([s + m.a + m.r, end]);
  return out;
}

const D = {
  // dmg, stam, hitstun, blockstun, push (u/s), hitstop
  light: { hitstun: 15, blockstun: 9, push: 170, hitstop: 4 },
  med: { hitstun: 19, blockstun: 12, push: 230, hitstop: 6 },
  heavy: { hitstun: 24, blockstun: 16, push: 300, hitstop: 9 },
};

// ------------------------------------------------------------------ shared moves
// (punches and kicks are the same for every weapon; the weapon stays in hand)
const SHARED = {
  jab: { name: "Jab", kind: "punch", limb: "handF", s: 5, a: 3, r: 10, dmg: 4, stam: 4, height: "high", ...D.light, next: { p: "cross", k: "kick" }, chamber: { aF: 58, eF: 84 }, strike: { aF: 88, eF: 4, t: 14, aB: 28, eB: 104, lF: 26, lB: -22, hx: 4 }, sfx: "punch" },
  cross: { name: "Cross", kind: "punch", limb: "handB", s: 6, a: 3, r: 12, dmg: 5, stam: 5, height: "high", ...D.light, next: { p: "hook", k: "roundhouse" }, chamber: { aB: 50, eB: 100, t: 4 }, strike: { aB: 90, eB: 2, t: 22, aF: 36, eF: 96, hx: 8, lF: 30, lB: -24 }, sfx: "punch" },
  hook: { name: "Hook", kind: "punch", limb: "handF", s: 8, a: 3, r: 16, dmg: 7, stam: 7, height: "high", ...D.med, push: 320, chamber: { aF: 72, eF: 88, t: -2, h: 2 }, strike: { aF: 96, eF: 30, t: 24, hx: 10, aB: 20, eB: 110 }, sfx: "punch", finisher: true },
  lowPunch: { name: "Low Strike", kind: "punch", limb: "handF", s: 6, a: 3, r: 12, dmg: 4, stam: 4, height: "low", ...D.light, crouch: true, chamber: { aF: 50, eF: 90 }, strike: { aF: 82, eF: 4, t: 34 }, sfx: "punch" },
  uppercut: { name: "Rising Fist", kind: "punch", limb: "handF", s: 10, a: 4, r: 18, dmg: 8, stam: 9, height: "mid", ...D.med, kd: true, kb: { vx: 240, vy: 560 }, lunge: { v: 260, from: 2, to: 10 }, chamber: { hy: -22, t: 26, aF: 16, eF: 124, lF: 50, kF: 70 }, strike: { t: -6, aF: 160, eF: 18, hx: 10, lF: 12, kF: 6, lB: -12, kB: 6 }, follow: { t: -10, aF: 172, eF: 10, hx: 10, lF: 12, kF: 6, lB: -12, kB: 6 }, sfx: "punch", antiAir: true },
  kick: { name: "Front Kick", kind: "kick", limb: "footF", s: 8, a: 3, r: 14, dmg: 6, stam: 7, height: "mid", ...D.light, next: { k: "roundhouse" }, chamber: { lF: 82, kF: 104, t: -2, aF: 40, eF: 88 }, strike: { lF: 92, kF: 4, t: -14, lB: -8, kB: 6, aF: 34, eF: 92, aB: 8, eB: 84, hx: 6 }, sfx: "kick" },
  roundhouse: { name: "Roundhouse", kind: "kick", limb: "footB", s: 10, a: 4, r: 18, dmg: 8, stam: 9, height: "high", ...D.med, push: 340, chamber: { lB: 72, kB: 112, t: -10, aF: 30, eF: 70 }, strike: { lB: 116, kB: 6, t: -30, lF: -2, kF: 6, aF: 20, eF: 60, aB: -24, eB: 40, hx: 8 }, sfx: "kick", finisher: true },
  sweep: { name: "Sweep", kind: "kick", limb: "footB", s: 9, a: 4, r: 20, dmg: 6, stam: 8, height: "low", ...D.med, crouch: true, kd: true, kb: { vx: 120, vy: 300 }, chamber: { lB: 40, kB: 90, t: 30 }, strike: { t: 36, lF: 82, kF: 128, lB: 86, kB: 0, aF: 76, eF: 30, aB: 70, eB: 30 }, follow: { t: 36, lF: 82, kF: 128, lB: 70, kB: 0, aF: 76, eF: 30, aB: 70, eB: 30 }, sfx: "kick" },
  pushKick: { name: "Push Kick", kind: "kick", limb: "footF", s: 11, a: 4, r: 18, dmg: 7, stam: 9, height: "mid", ...D.med, push: 480, lunge: { v: 200, from: 4, to: 12 }, chamber: { lF: 96, kF: 124, t: -6 }, strike: { lF: 94, kF: 0, t: -20, hx: 14, lB: -14, kB: 6 }, sfx: "kick" },
  airPunch: { name: "Diving Strike", kind: "punch", limb: "handF", s: 5, a: 7, r: 8, dmg: 5, stam: 5, height: "over", ...D.light, air: true, chamber: { aF: 120, eF: 60 }, strike: { aF: 56, eF: 0, t: 18 }, sfx: "punch" },
  airKick: { name: "Jump Kick", kind: "kick", limb: "footF", s: 6, a: 9, r: 8, dmg: 7, stam: 7, height: "over", ...D.med, air: true, chamber: { lF: 90, kF: 120, t: -4 }, strike: { lF: 62, kF: 0, t: -10, lB: 10, kB: 80 }, sfx: "kick" },
};

// ------------------------------------------------------------------ weapon families
// w1..w4 = L string, wHeavy = forward+L, wLow = down+L, wAir = air L.
const FAMILY = {
  fists: {
    w1: { name: "Palm Strike", limb: "handF", s: 12, a: 4, r: 18, dmg: 9, stam: 11, height: "mid", ...D.heavy, push: 420, chamber: { aF: 30, eF: 110, aB: 30, eB: 110, t: -6, hx: -4 }, strike: { aF: 84, eF: 0, aB: 80, eB: 6, t: 26, hx: 14, lF: 34, lB: -30 }, sfx: "heavy" },
    wHeavy: { name: "Flying Knee", limb: "footF", s: 14, a: 5, r: 20, dmg: 11, stam: 14, height: "mid", ...D.heavy, kd: true, kb: { vx: 300, vy: 420 }, lunge: { v: 420, from: 5, to: 18 }, chamber: { hy: -10, t: 18, lF: 40, kF: 70 }, strike: { lF: 100, kF: 140, t: -8, aF: 120, eF: 50, aB: 110, eB: 50, hy: 10 }, sfx: "heavy" },
    wLow: { name: "Shin Breaker", limb: "footF", s: 9, a: 3, r: 16, dmg: 7, stam: 8, height: "low", ...D.med, crouch: true, chamber: { lF: 50, kF: 80 }, strike: { lF: 76, kF: 0, t: 30, hy: -20 }, sfx: "kick" },
    wAir: { name: "Axe Heel", limb: "footF", s: 8, a: 8, r: 10, dmg: 9, stam: 9, height: "over", ...D.med, air: true, chamber: { lF: 170, kF: 0, t: -16 }, strike: { lF: 60, kF: 0, t: 10 }, sfx: "kick" },
  },
  blade: {
    w1: { name: "Falling Cut", limb: "weaponF", s: 8, a: 4, r: 14, dmg: 8, stam: 9, height: "mid", ...D.med, next: { w: "w2" }, chamber: { aF: 150, eF: 30, wF: 20, t: -4 }, strike: { aF: 82, eF: 0, wF: -10, t: 20, hx: 6 }, follow: { aF: 40, eF: 0, wF: -16, t: 22, hx: 6 }, sfx: "slash" },
    w2: { name: "Rising Cut", limb: "weaponF", s: 7, a: 4, r: 14, dmg: 7, stam: 8, height: "mid", ...D.med, next: { w: "w3" }, chamber: { aF: 18, eF: 0, wF: -20, t: 12 }, strike: { aF: 96, eF: 10, wF: 0, t: 14, hx: 6 }, follow: { aF: 140, eF: 20, wF: 0, t: 6, hx: 6 }, sfx: "slash" },
    w3: { name: "Piercing Thrust", limb: "weaponF", s: 10, a: 4, r: 20, dmg: 10, stam: 10, height: "mid", ...D.heavy, push: 420, finisher: true, lunge: { v: 300, from: 4, to: 12 }, chamber: { aF: 48, eF: 110, wF: -68, t: 0, hx: -6 }, strike: { aF: 90, eF: 0, wF: 0, t: 26, hx: 20, lF: 42, lB: -42 }, sfx: "slash" },
    wHeavy: { name: "Crescent Cleave", limb: "weaponF", s: 16, a: 5, r: 22, dmg: 15, stam: 16, height: "over", ...D.heavy, kd: true, kb: { vx: 280, vy: 360 }, crush: 1.6, lunge: { v: 260, from: 8, to: 18 }, chamber: { aF: 172, eF: 20, wF: 10, t: -14 }, hold: { aF: 176, eF: 18, wF: 14, t: -16 }, strike: { aF: 96, eF: 0, wF: -10, t: 30, hx: 16 }, follow: { aF: 46, eF: 0, wF: -12, t: 34, hx: 16 }, sfx: "heavy" },
    wLow: { name: "Ankle Cut", limb: "weaponF", s: 9, a: 4, r: 16, dmg: 8, stam: 8, height: "low", ...D.med, crouch: true, chamber: { aF: 18, eF: 40, wF: -20 }, strike: { aF: 82, eF: 0, wF: -22, t: 34 }, follow: { aF: 70, eF: 0, wF: -30, t: 34 }, sfx: "slash" },
    wAir: { name: "Sky Cleave", limb: "weaponF", s: 7, a: 8, r: 10, dmg: 10, stam: 9, height: "over", ...D.med, air: true, chamber: { aF: 160, eF: 20, wF: 10 }, strike: { aF: 76, eF: 0, wF: -10, t: 14 }, follow: { aF: 34, eF: 0, wF: -10, t: 18 }, sfx: "slash" },
  },
  dual: {
    w1: { name: "Fang Slash", limb: "weaponF", s: 6, a: 3, r: 11, dmg: 5, stam: 6, height: "mid", ...D.light, next: { w: "w2" }, chamber: { aF: 120, eF: 40, wF: 10 }, strike: { aF: 84, eF: 0, wF: -12, t: 16, hx: 4 }, follow: { aF: 50, eF: 0, wF: -14, t: 18, hx: 4 }, sfx: "slash" },
    w2: { name: "Back Fang", limb: "weaponB", s: 6, a: 3, r: 11, dmg: 5, stam: 6, height: "mid", ...D.light, next: { w: "w3" }, chamber: { aB: 120, eB: 40, wB: 10 }, strike: { aB: 86, eB: 0, wB: -12, t: 24, hx: 8, aF: 30, eF: 100 }, follow: { aB: 50, eB: 0, wB: -14, t: 24, hx: 8, aF: 30, eF: 100 }, sfx: "slash" },
    w3: { name: "Twin Stab", limb: "weaponF", limbs: ["weaponF", "weaponB"], s: 7, a: 3, r: 12, dmg: 6, stam: 7, height: "mid", ...D.med, next: { w: "w4" }, chamber: { aF: 40, eF: 110, wF: -60, aB: 40, eB: 110, wB: -60, hx: -6 }, strike: { aF: 90, eF: 0, wF: 0, aB: 84, eB: 0, wB: 0, t: 22, hx: 14 }, sfx: "slash" },
    w4: { name: "Whirling Fangs", limb: "weaponF", limbs: ["weaponF", "weaponB"], s: 9, a: 5, r: 20, dmg: 7, stam: 9, height: "mid", ...D.heavy, push: 380, finisher: true, chamber: { aF: 150, eF: 10, wF: 0, aB: -30, eB: 0, wB: 0, t: -6 }, strike: { aF: 100, eF: 0, wF: 0, aB: 100, eB: 0, wB: 10, t: 20, hx: 10 }, follow: { aF: 30, eF: 0, wF: 0, aB: 150, eB: 0, wB: 0, t: 26, hx: 10 }, sfx: "slash" },
    wHeavy: { name: "Cross Lunge", limb: "weaponF", limbs: ["weaponF", "weaponB"], s: 12, a: 5, r: 20, dmg: 12, stam: 13, height: "mid", ...D.heavy, kd: true, kb: { vx: 300, vy: 340 }, lunge: { v: 520, from: 5, to: 15 }, chamber: { aF: 160, eF: 10, wF: 10, aB: 160, eB: 10, wB: 10, t: -10 }, strike: { aF: 80, eF: 0, wF: -10, aB: 76, eB: 0, wB: -6, t: 30, hx: 14 }, follow: { aF: 40, eF: 0, wF: -10, aB: 36, eB: 0, wB: -6, t: 32, hx: 14 }, sfx: "heavy" },
    wLow: { name: "Low Fangs", limb: "weaponF", limbs: ["weaponF", "weaponB"], s: 7, a: 4, r: 13, dmg: 6, stam: 6, height: "low", ...D.light, crouch: true, chamber: { aF: 30, eF: 40, wF: -20 }, strike: { aF: 86, eF: 0, wF: -26, aB: 74, eB: 0, wB: -26, t: 34 }, sfx: "slash" },
    wAir: { name: "Diving Fangs", limb: "weaponF", limbs: ["weaponF", "weaponB"], s: 6, a: 8, r: 8, dmg: 8, stam: 7, height: "over", ...D.med, air: true, chamber: { aF: 150, eF: 20, aB: 150, eB: 20 }, strike: { aF: 56, eF: 0, wF: 0, aB: 50, eB: 0, wB: 0, t: 16 }, sfx: "slash" },
  },
  pole: {
    w1: { name: "Staff Jab", limb: "weaponF", s: 7, a: 4, r: 13, dmg: 7, stam: 7, height: "mid", ...D.light, next: { w: "w2" }, chamber: { aF: 40, eF: 44, wF: 6, hx: -8, t: 4 }, strike: { aF: 86, eF: 2, wF: 2, t: 18, hx: 12, lF: 32, lB: -28 }, sfx: "staff" },
    w2: { name: "Rising Arc", limb: "weaponF", s: 8, a: 5, r: 15, dmg: 8, stam: 8, height: "mid", ...D.med, next: { w: "w3" }, chamber: { aF: 20, eF: 10, wF: -28, t: 14 }, strike: { aF: 92, eF: 12, wF: 20, t: 12, hx: 8 }, follow: { aF: 140, eF: 10, wF: 20, t: 2, hx: 8 }, sfx: "staff" },
    w3: { name: "Temple Bell", limb: "weaponF", s: 11, a: 5, r: 20, dmg: 11, stam: 11, height: "over", ...D.heavy, push: 400, finisher: true, chamber: { aF: 162, eF: 20, wF: 18, t: -10 }, strike: { aF: 94, eF: 0, wF: -18, t: 26, hx: 12 }, follow: { aF: 62, eF: 0, wF: -18, t: 30, hx: 12 }, sfx: "heavy" },
    wHeavy: { name: "Whirlwind", limb: "weaponF", s: 14, a: 8, r: 20, dmg: 13, stam: 15, height: "mid", ...D.heavy, kd: true, kb: { vx: 320, vy: 300 }, lunge: { v: 240, from: 6, to: 20 }, chamber: { aF: -40, eF: 10, wF: -30, t: -6 }, strike: { aF: 100, eF: 0, wF: 0, t: 22, hx: 14 }, follow: { aF: 176, eF: 0, wF: 10, t: 4, hx: 14 }, sfx: "heavy" },
    wLow: { name: "Reed Sweep", limb: "weaponF", s: 9, a: 5, r: 16, dmg: 8, stam: 8, height: "low", ...D.med, crouch: true, chamber: { aF: 40, eF: 10, wF: -10 }, strike: { aF: 86, eF: 0, wF: -26, t: 34 }, follow: { aF: 76, eF: 0, wF: -30, t: 34 }, sfx: "staff" },
    wAir: { name: "Falling Pole", limb: "weaponF", s: 7, a: 8, r: 10, dmg: 9, stam: 8, height: "over", ...D.med, air: true, chamber: { aF: 170, eF: 10, wF: 10 }, strike: { aF: 76, eF: 0, wF: -6, t: 12 }, follow: { aF: 46, eF: 0, wF: -6, t: 16 }, sfx: "staff" },
  },
  heavy: {
    w1: { name: "Side Crusher", limb: "weaponF", s: 13, a: 5, r: 20, dmg: 10, stam: 12, height: "mid", ...D.heavy, next: { w: "w2" }, crush: 1.5, chamber: { aF: -28, eF: 10, wF: -94, t: -4, hx: -6 }, strike: { aF: 92, eF: 0, wF: 0, t: 22, hx: 10 }, follow: { aF: 140, eF: 0, wF: 10, t: 14, hx: 10 }, sfx: "heavy" },
    w2: { name: "Mountain Fall", limb: "weaponF", s: 15, a: 5, r: 24, dmg: 13, stam: 14, height: "over", ...D.heavy, kd: true, kb: { vx: 200, vy: 300 }, crush: 1.8, finisher: true, chamber: { aF: 172, eF: 10, wF: 20, t: -14 }, strike: { aF: 82, eF: 0, wF: -14, t: 30, hx: 10 }, follow: { aF: 46, eF: 0, wF: -16, t: 36, hx: 10 }, sfx: "heavy", quake: true },
    wHeavy: { name: "Earthbreaker", limb: "weaponF", s: 20, a: 6, r: 26, dmg: 17, stam: 20, height: "over", ...D.heavy, hitstop: 11, kd: true, kb: { vx: 320, vy: 420 }, crush: 2.2, armor: [4, 20], lunge: { v: 300, from: 8, to: 22 }, chamber: { aF: 176, eF: 10, wF: 24, t: -18, hy: 6 }, hold: { aF: 180, eF: 8, wF: 26, t: -20, hy: 8 }, strike: { aF: 84, eF: 0, wF: -10, t: 34, hx: 16 }, follow: { aF: 44, eF: 0, wF: -16, t: 38, hx: 16 }, sfx: "heavy", quake: true },
    wLow: { name: "Knee Smasher", limb: "weaponF", s: 12, a: 5, r: 20, dmg: 9, stam: 11, height: "low", ...D.heavy, crouch: true, kd: true, kb: { vx: 160, vy: 280 }, crush: 1.4, chamber: { aF: -30, eF: 0, wF: -80 }, strike: { aF: 84, eF: 0, wF: -30, t: 34 }, follow: { aF: 100, eF: 0, wF: -30, t: 32 }, sfx: "heavy" },
    wAir: { name: "Falling Anvil", limb: "weaponF", s: 9, a: 9, r: 12, dmg: 11, stam: 12, height: "over", ...D.heavy, air: true, crush: 1.6, chamber: { aF: 176, eF: 10, wF: 20 }, strike: { aF: 70, eF: 0, wF: -10, t: 14 }, follow: { aF: 40, eF: 0, wF: -10, t: 16 }, sfx: "heavy" },
  },
  chain: {
    w1: { name: "Serpent Lash", limb: "weaponF", s: 10, a: 5, r: 16, dmg: 8, stam: 8, height: "mid", ...D.med, next: { w: "w2" }, chamber: { aF: 150, eF: 20, wF: 0, wl: 0.2 }, strike: { aF: 94, eF: 0, wF: 0, wl: 1, t: 16, hx: 6 }, follow: { aF: 80, eF: 0, wF: 0, wl: 0.92, t: 16, hx: 6 }, sfx: "chain" },
    w2: { name: "Coil Crack", limb: "weaponF", s: 10, a: 5, r: 20, dmg: 10, stam: 10, height: "over", ...D.heavy, push: 380, finisher: true, chamber: { aF: 175, eF: 10, wF: 20, wl: 0.4, t: -10 }, strike: { aF: 110, eF: 0, wF: 0, wl: 1, t: 20, hx: 6 }, follow: { aF: 70, eF: 0, wF: -6, wl: 0.95, t: 24, hx: 6 }, sfx: "chain" },
    wHeavy: { name: "Serpent Pull", limb: "weaponF", s: 13, a: 5, r: 22, dmg: 7, stam: 12, height: "mid", ...D.heavy, hitstun: 30, push: -520, pull: true, chamber: { aF: 140, eF: 20, wF: 0, wl: 0.3, t: -6 }, strike: { aF: 92, eF: 0, wF: 0, wl: 1, t: 18, hx: 6 }, follow: { aF: 70, eF: 30, wF: 0, wl: 0.4, t: 0 }, sfx: "chain" },
    wLow: { name: "Ground Viper", limb: "weaponF", s: 11, a: 5, r: 18, dmg: 8, stam: 9, height: "low", ...D.med, crouch: true, chamber: { aF: 120, eF: 20, wl: 0.2 }, strike: { aF: 72, eF: 0, wF: 0, wl: 1, t: 34 }, follow: { aF: 66, eF: 0, wF: -4, wl: 0.9, t: 34 }, sfx: "chain" },
    wAir: { name: "Hawk Chain", limb: "weaponF", s: 8, a: 8, r: 10, dmg: 9, stam: 8, height: "over", ...D.med, air: true, chamber: { aF: 160, eF: 10, wl: 0.3 }, strike: { aF: 50, eF: 0, wF: 0, wl: 0.85, t: 12 }, sfx: "chain" },
  },
};

// pole family variants: the spear trades the arcs for long thrusts
const SPEAR = {
  w1: { name: "Crane Thrust", limb: "weaponF", s: 9, a: 4, r: 16, dmg: 8, stam: 8, height: "mid", ...D.light, next: { w: "w2" }, chamber: { aF: 52, eF: 70, wF: -30, hx: -10, t: 2 }, strike: { aF: 90, eF: 0, wF: -2, t: 18, hx: 14, lF: 34, lB: -30 }, sfx: "staff" },
  w2: { name: "Twin Thrust", limb: "weaponF", s: 8, a: 4, r: 18, dmg: 9, stam: 9, height: "high", ...D.med, next: { w: "w3" }, chamber: { aF: 64, eF: 70, wF: -30, hx: -6, t: 6 }, strike: { aF: 102, eF: 0, wF: -4, t: 12, hx: 14, lF: 34, lB: -30 }, sfx: "staff" },
  w3: { name: "Dragon Lance", limb: "weaponF", s: 13, a: 5, r: 22, dmg: 12, stam: 12, height: "mid", ...D.heavy, push: 460, finisher: true, lunge: { v: 380, from: 5, to: 16 }, chamber: { aF: 40, eF: 100, wF: -50, hx: -12, t: -4 }, strike: { aF: 90, eF: 0, wF: 0, t: 28, hx: 24, lF: 46, lB: -46 }, sfx: "heavy" },
  wHeavy: { name: "Heaven Piercer", limb: "weaponF", s: 16, a: 6, r: 24, dmg: 15, stam: 16, height: "mid", ...D.heavy, kd: true, kb: { vx: 360, vy: 300 }, lunge: { v: 560, from: 7, to: 20 }, chamber: { aF: 36, eF: 110, wF: -56, hx: -14, t: -8, hy: -8 }, hold: { aF: 34, eF: 112, wF: -58, hx: -16, t: -10, hy: -10 }, strike: { aF: 92, eF: 0, wF: 0, t: 30, hx: 26, lF: 50, lB: -50 }, sfx: "heavy" },
};

// ------------------------------------------------------------------ abilities (meter specials)
export const SPECIAL_MOVES = {
  wave: { name: "Shadow Wave", kind: "special", limb: null, s: 14, a: 2, r: 18, dmg: 0, stam: 0, height: "mid", ...D.med, effect: "wave", chamber: { aF: 160, eF: 30, aB: 150, eB: 30, t: -10 }, strike: { aF: 90, eF: 0, aB: 84, eB: 0, t: 24, hx: 12 }, sfx: "special" },
  iron: { name: "Iron Body", kind: "special", limb: null, s: 16, a: 2, r: 12, dmg: 0, stam: 0, height: "mid", ...D.light, effect: "iron", chamber: { aF: 40, eF: 140, aB: 40, eB: 140, hy: -12, t: 4 }, strike: { aF: 70, eF: 120, aB: 70, eB: 120, hy: -16, t: 10 }, sfx: "buff" },
  rush: { name: "Phantom Rush", kind: "special", limb: "body", limbs: ["body", "handF"], s: 10, a: 14, r: 18, dmg: 14, stam: 0, height: "mid", ...D.heavy, kd: true, kb: { vx: 360, vy: 380 }, lunge: { v: 1000, from: 10, to: 24 }, effect: "rush", chamber: { t: 30, hy: -14, aF: 20, eF: 60 }, strike: { t: 36, hx: 10, aF: 90, eF: 0, lF: 60, kF: 40, lB: -50, kB: 10 }, sfx: "special" },
  vampire: { name: "Blood Moon", kind: "special", limb: null, s: 16, a: 2, r: 12, dmg: 0, stam: 0, height: "mid", ...D.light, effect: "vampire", chamber: { aF: 150, eF: 10, aB: 150, eB: 10, t: -14, h: -10 }, strike: { aF: 170, eF: 0, aB: 170, eB: 0, t: -16, h: -14 }, sfx: "buff" },
  quake: { name: "Earthshaker", kind: "special", limb: "footF", s: 18, a: 3, r: 22, dmg: 6, stam: 0, height: "low", ...D.med, effect: "quake", chamber: { lF: 110, kF: 100, t: -10, aF: 120, eF: 20, aB: 110, eB: 20 }, strike: { lF: 30, kF: 10, t: 20, hy: -10, aF: 40, eF: 40, aB: 30, eB: 40 }, sfx: "heavy" },
};

// ------------------------------------------------------------------ boss moves
export const BOSS_MOVES = {
  ripple: { name: "Earth Ripple", kind: "special", limb: "weaponF", s: 30, a: 4, r: 24, dmg: 7, stam: 0, height: "low", ...D.heavy, kd: true, kb: { vx: 200, vy: 300 }, effect: "ripple", telegraph: true, chamber: { aF: 176, eF: 10, wF: 20, t: -14, hy: 4 }, hold: { aF: 180, eF: 8, wF: 24, t: -16, hy: 6 }, strike: { aF: 66, eF: 0, wF: -14, t: 36, hx: 12 }, sfx: "heavy", unparry: true },
  ironStance: { name: "Iron Stance", kind: "special", limb: null, s: 24, a: 2, r: 10, dmg: 0, stam: 0, height: "mid", ...D.light, effect: "ironStance", telegraph: true, chamber: { aF: 160, eF: 10, wF: 0, hy: -14, t: 0 }, strike: { aF: 120, eF: 30, wF: 0, hy: -18, t: 8 }, sfx: "buff" },
  thorns: { name: "Thorn Volley", kind: "special", limb: null, s: 26, a: 18, r: 18, dmg: 0, stam: 0, height: "mid", ...D.med, effect: "thorns", telegraph: true, chamber: { aF: 150, eF: 30, aB: 150, eB: 30, t: -10 }, strike: { aF: 96, eF: 0, aB: 70, eB: 20, t: 18 }, sfx: "special" },
  vanish: { name: "Leaf Step", kind: "special", limb: null, s: 18, a: 2, r: 4, dmg: 0, stam: 0, height: "mid", ...D.light, effect: "vanish", telegraph: true, chamber: { t: 20, hy: -20, aF: 20, eF: 20 }, strike: { t: 30, hy: -30, aF: 10, eF: 10 }, sfx: "vanish" },
  clone: { name: "Shadow Clone", kind: "special", limb: null, s: 28, a: 2, r: 16, dmg: 0, stam: 0, height: "mid", ...D.med, effect: "clone", telegraph: true, chamber: { aF: 150, eF: 50, aB: 150, eB: 50, t: -4 }, strike: { aF: 90, eF: 0, aB: 90, eB: 0, t: 14 }, sfx: "special" },
  flurry: { name: "Viper Flurry", kind: "special", limb: "weaponF", limbs: ["weaponF", "weaponB"], s: 22, a: 26, r: 26, dmg: 4, stam: 0, height: "mid", ...D.light, hitstun: 12, multi: 5, lunge: { v: 520, from: 22, to: 34 }, effect: "flurry", telegraph: true, chamber: { aF: 160, eF: 10, aB: -40, eB: 0, t: -10, hy: -6 }, strike: { aF: 96, eF: 0, aB: 100, eB: 0, t: 22, hx: 10 }, follow: { aF: 40, eF: 0, aB: 150, eB: 0, t: 26, hx: 10 }, sfx: "slash" },
  erupt: { name: "Quicksand Eruption", kind: "special", limb: null, s: 24, a: 2, r: 18, dmg: 0, stam: 0, height: "mid", ...D.heavy, effect: "erupt", telegraph: true, chamber: { aF: 176, eF: 10, wF: 20, t: -16 }, strike: { aF: 60, eF: 0, wF: -20, t: 40, hx: 10 }, sfx: "heavy" },
  storm: { name: "Sandstorm", kind: "special", limb: null, s: 30, a: 2, r: 14, dmg: 0, stam: 0, height: "mid", ...D.light, effect: "storm", telegraph: true, chamber: { aF: 150, eF: 0, aB: 150, eB: 0, wF: 0, t: -10 }, strike: { aF: 170, eF: 0, aB: 170, eB: 0, wF: 10, t: -12 }, sfx: "buff" },
  eclipse: { name: "Eclipse Slash", kind: "special", limb: null, s: 40, a: 2, r: 26, dmg: 0, stam: 0, height: "high", ...D.heavy, effect: "eclipse", telegraph: true, chamber: { aF: -40, eF: 0, wF: -60, t: -6, hy: -10 }, hold: { aF: -44, eF: 0, wF: -62, t: -8, hy: -12 }, strike: { aF: 100, eF: 0, wF: 0, t: 26, hx: 14 }, sfx: "special", unparry: true },
  spikes: { name: "Frost Spikes", kind: "special", limb: null, s: 22, a: 2, r: 20, dmg: 0, stam: 0, height: "low", ...D.med, effect: "spikes", telegraph: true, chamber: { aF: 150, eF: 0, wF: 20, t: -8 }, strike: { aF: 40, eF: 0, wF: -40, t: 30, hy: -16 }, sfx: "special" },
};

// ------------------------------------------------------------------ assembly
const scaled = (base, w, isWeapon) => {
  // telegraphed specials can be slowed by a heavy weapon but never sped up
  const sp = isWeapon ? (base.kind === "special" ? Math.max(1, w.speed) : w.speed) : 1;
  const m = { ...base };
  m.s = Math.max(3, Math.round(base.s * sp));
  m.a = Math.max(2, Math.round(base.a * (isWeapon ? Math.max(0.8, Math.min(1.3, sp)) : 1)));
  m.r = Math.max(6, Math.round(base.r * sp) + (isWeapon ? w.rec || 0 : 0));
  if (base.lunge) {
    const k = m.s / base.s;
    m.lunge = { ...base.lunge, from: Math.round(base.lunge.from * k), to: Math.round(base.lunge.to * k) };
  }
  if (base.armor) {
    const k = m.s / base.s;
    m.armor = [Math.round(base.armor[0] * k), Math.round(base.armor[1] * k)];
  }
  if (isWeapon) {
    m.dmg = base.dmg * w.dmg;
    m.stam = Math.round(base.stam * w.stamina);
    m.kind = base.kind === "special" ? "special" : "weapon";
    if (w.dual && m.limb === "weaponF" && !m.limbs && w.family === "dual") m.limbs = ["weaponF", "weaponB"];
  }
  return m;
};

/** Build the complete moveset for a weapon (frames scaled, keyframes ready). */
export function buildMoveset(w) {
  const fam = w.family;
  const G = guardFor(fam);
  const C = crouchFor(fam);
  const A = airFor(fam);
  const famMoves = { ...FAMILY[fam] };
  if (w.id === "spear") Object.assign(famMoves, SPEAR);
  const set = {};
  const add = (id, base, isWeapon) => {
    const m = scaled(base, w, isWeapon);
    m.id = id;
    // jump-in attacks stay out while the body comes down (they end on landing)
    if (m.air) m.a = Math.max(m.a, 24);
    const from = m.air ? A : m.crouch ? C : G;
    const end = m.air ? A : m.crouch ? C : G;
    m.keys = keys(m, from, end);
    m.total = m.s + m.a + m.r;
    set[id] = m;
  };
  // lows trade speed for the mix-up: a little slower and more punishable
  const lowTax = (b) => (b.height === "low" && !b.air ? { ...b, s: b.s + 2, r: b.r + 4 } : b);
  for (const [id, b] of Object.entries(SHARED)) add(id, lowTax(b), false);
  for (const [id, b] of Object.entries(famMoves)) add(id, lowTax(b), true);
  // fists: w1 has no follow-up string; map missing ids so input lookup is simple
  for (const [id, b] of Object.entries(SPECIAL_MOVES)) add(id, b, false);
  for (const [id, b] of Object.entries(BOSS_MOVES)) add(id, b, true);
  set.__guard = G;
  set.__crouch = C;
  set.__air = A;
  return set;
}

/** Which move a button + direction starts (not chains). */
export function pickMove(set, btn, { air, down, fwd }) {
  if (btn === "p") return air ? set.airPunch : down ? set.lowPunch : fwd ? set.uppercut : set.jab;
  if (btn === "k") return air ? set.airKick : down ? set.sweep : fwd ? set.pushKick : set.kick;
  if (btn === "w") return air ? set.wAir : down ? set.wLow : fwd ? set.wHeavy : set.w1;
  return null;
}
