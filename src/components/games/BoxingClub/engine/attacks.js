/**
 * Boxing Club — attack data. All times in ms, distances in metres.
 *
 * `reach` is the largest centre-to-centre distance at which the glove, at
 * full extension, touches the defender's hurtbox. The renderer draws the
 * glove from the same number (see render/rig.js → gloveTip), so a punch
 * that visibly falls short never lands and a landed punch always shows the
 * glove on the target.
 *
 * Phases: startup (winding, no hit) → active (the only window where a hit
 * can register) → recovery (arm returns; vulnerable). A whiff adds
 * `whiffRecovery`; a punch that connected (hit or blocked) may be chained
 * into the next one after `cancelAt` of its recovery.
 */
export const ATTACKS = {
  jab: {
    id: "jab", label: "Jab", hand: "lead", target: "head", kind: "straight",
    startup: 110, active: 60, recovery: 170, whiffRecovery: 110, cancelAt: 0.4,
    reach: 1.06, damage: 2.4, stamina: 5, hitStun: 180, blockStun: 120, blockStamina: 5,
    push: 0.04, react: "light", shake: 0.15, hitStop: 0,
  },
  cross: {
    id: "cross", label: "Cross", hand: "rear", target: "head", kind: "straight",
    startup: 225, active: 65, recovery: 250, whiffRecovery: 180, cancelAt: 0.45,
    reach: 1.13, damage: 4.4, stamina: 9, hitStun: 260, blockStun: 170, blockStamina: 10,
    push: 0.1, react: "medium", shake: 0.45, hitStop: 40,
  },
  hookL: {
    id: "hookL", label: "Lead Hook", hand: "lead", target: "head", kind: "hook",
    startup: 300, active: 75, recovery: 330, whiffRecovery: 250, cancelAt: 0.5,
    reach: 0.86, damage: 6.2, stamina: 12, hitStun: 340, blockStun: 220, blockStamina: 16,
    push: 0.08, react: "heavy", shake: 0.8, hitStop: 55,
  },
  hookR: {
    id: "hookR", label: "Rear Hook", hand: "rear", target: "head", kind: "hook",
    startup: 320, active: 75, recovery: 350, whiffRecovery: 260, cancelAt: 0.5,
    reach: 0.84, damage: 6.6, stamina: 13, hitStun: 360, blockStun: 230, blockStamina: 17,
    push: 0.08, react: "heavy", shake: 0.9, hitStop: 60,
  },
  bodyJab: {
    id: "bodyJab", label: "Body Jab", hand: "lead", target: "body", kind: "straight",
    startup: 125, active: 60, recovery: 190, whiffRecovery: 120, cancelAt: 0.4,
    reach: 1.0, damage: 2.1, stamina: 6, hitStun: 190, blockStun: 130, blockStamina: 6,
    bodyDrain: 5, push: 0.03, react: "body", shake: 0.1, hitStop: 0,
  },
  bodyCross: {
    id: "bodyCross", label: "Body Cross", hand: "rear", target: "body", kind: "straight",
    startup: 235, active: 65, recovery: 265, whiffRecovery: 190, cancelAt: 0.45,
    reach: 1.06, damage: 3.9, stamina: 10, hitStun: 260, blockStun: 180, blockStamina: 10,
    bodyDrain: 9, push: 0.08, react: "body", shake: 0.35, hitStop: 35,
  },
  bodyHook: {
    id: "bodyHook", label: "Body Hook", hand: "lead", target: "body", kind: "hook",
    startup: 305, active: 75, recovery: 335, whiffRecovery: 250, cancelAt: 0.5,
    reach: 0.82, damage: 5.2, stamina: 12, hitStun: 330, blockStun: 220, blockStamina: 15,
    bodyDrain: 13, push: 0.06, react: "body", shake: 0.6, hitStop: 50,
  },
};

/** The body version of each head punch (used with the BODY modifier). */
export const BODY_OF = { jab: "bodyJab", cross: "bodyCross", hookL: "bodyHook", hookR: "bodyHook" };

export const COUNTER_MULT = 1.35;
export const COUNTER_STUN = 130;

/** Dodge (slip) timing. Head punches pass through during the invulnerable window. */
export const DODGE = {
  duration: 350,
  invulnFrom: 35,
  invulnTo: 255,
  perfectWindow: 190, // impact this soon after the slip began = PERFECT DODGE
  stamina: 9,
  backDistance: 0.46,
  inDistance: 0.1,
  counterWindow: 520,
  perfectCounterWindow: 760,
  perfectRecoveryPenalty: 220, // attacker's extra recovery after a perfect dodge
};

export const BLOCK = {
  raise: 55, // guard is effective this long after raising
  headChip: 0, // blocked head punches do no health damage…
  bodyThrough: 0.5, // …body punches through the guard still do half
  breakStun: 560, // guard broken (stamina exhausted by a blocked punch)
  counterWindow: 360,
};
