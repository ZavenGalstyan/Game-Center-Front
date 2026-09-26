/**
 * Laser Maze — hand-authored level maps. Token legend: engine/level.js.
 *
 * Maps describe the STARTING board only. Par (the proven shortest solution)
 * and the guided solution are never written by hand: they come from
 * data/solutions.js, which tools/validateLevels.mjs regenerates by running
 * the real engine's exhaustive solver over every level.
 */

const r = String.raw;

export const LEVEL_DEFS = [
  /* ================= WORLD 1 — FIRST LIGHT ================= */
  {
    id: 1,
    name: "First Light",
    tip: "Tap the mirror to turn it. Guide the beam into the target.",
    map: r`
      .  .  .  .  .
      >r .  .  /  .
      .  .  .  .  .
      .  .  .  Tr .
    `,
  },
  {
    id: 2,
    name: "Double Bounce",
    tip: "Every mirror flips between / and \\.",
    map: r`
      >r .  .  /  .  .
      .  .  .  .  .  .
      .  .  .  /  .  Tr
      .  .  .  .  .  .
    `,
  },
  {
    id: 3,
    name: "Around the Wall",
    tip: "Walls stop light. Find the way around.",
    map: r`
      .  .  .  .  .  .
      >r .  /  #  Tr .
      .  .  .  #  .  .
      .  .  /  .  \  .
    `,
  },
  {
    id: 4,
    name: "Zig Zag",
    map: r`
      .  .  .  .  /  \  Tr
      >r .  /  #  .  .  .
      .  .  .  #  .  .  .
      .  /  /  .  .  \  .
      .  .  .  .  .  .  .
    `,
  },
  {
    id: 5,
    name: "Crossroads",
    tip: "Beams can cross each other freely.",
    map: r`
      .  \  .  /  .  .  .
      .  .  .  .  .  /  .
      >r .  .  \  .  #  .
      .  .  .  /  .  #  .
      .  /  .  .  .  .  Tr
    `,
  },
  {
    id: 6,
    name: "Long Way Round",
    map: r`
      >r .  .  .  .  .  /  .
      .  .  .  .  /  .  .  .
      .  .  \  .  .  .  \  /
      .  \  .  #  #  #  #  #
      .  .  /  .  .  .  .  Tr
    `,
  },
  {
    id: 7,
    name: "Mirror Hall",
    map: r`
      .  .  .  Tr .  .  /  .
      .  \  .  .  /  .  .  .
      .  .  .  /  .  #  .  .
      /  .  #  .  /  .  \  .
      .  .  .  #  .  .  .  .
      .  ^r .  .  /  .  \  .
    `,
  },
  {
    id: 8,
    name: "Detour",
    map: r`
      .  .  \  .  .  .  .  /
      .  .  .  .  #  .  .  .
      >r .  \  .  #  .  /  .
      .  .  .  .  #  .  .  .
      .  .  /  .  .  .  \  .
      .  .  .  .  .  .  .  Tr
    `,
  },
  {
    id: 9,
    name: "Spiral",
    map: r`
      >r .  .  .  .  .  /
      .  .  .  .  .  .  .
      \  .  .  .  /  .  .
      .  .  Tr .  .  #  .
      .  .  /  .  /  .  .
      .  #  .  .  .  .  .
      /  .  .  .  .  .  \
    `,
  },
  {
    id: 10,
    name: "Lab Graduation",
    map: r`
      .  .  .  .  /  .  .  .  .
      >r .  .  /  .  #  .  #  .
      .  .  .  .  .  .  \  .  Tr
      .  #  .  .  .  #  .  #  .
      .  \  .  \  .  \  .  .  .
      .  /  .  .  .  .  \  .  .
    `,
  },

  /* ================= WORLD 2 — CRYSTAL CAVES ================= */
  {
    id: 11,
    name: "Twin Crystals",
    tip: "Light every target at the same time.",
    map: r`
      >r .  .  /  .  .
      .  .  .  .  .  .
      .  .  .  Tr .  Tr
      .  \  .  .  .  \
      .  ^r .  .  .  .
    `,
  },
  {
    id: 12,
    name: "Shared Mirror",
    tip: "One mirror can guide two beams at once.",
    map: r`
      .  .  .  Tr .  /  .
      .  #  .  .  .  .  .
      >r .  .  \  .  .  Tr
      .  .  .  .  .  #  .
      .  .  .  /  .  .  <r
    `,
  },
  {
    id: 13,
    name: "Three Veins",
    map: r`
      .  Tr .  .  /  .  .  vr
      >r .  /  .  .  .  .  .
      .  .  .  .  .  /  #  .
      .  \  .  #  .  .  .  .
      Tr .  \  .  .  .  .  \
      .  .  Tr .  ^r .  .  .
    `,
  },
  {
    id: 14,
    name: "Geode",
    map: r`
      >r .  .  .  .  /  .
      .  Tr \  .  .  .  /
      .  .  .  #  #  .  .
      .  .  .  #  #  .  .
      .  .  Tr #  \  .  .
      .  /  .  .  .  \  .
      .  .  .  .  .  .  ^r
    `,
  },
  {
    id: 15,
    name: "Echo Chamber",
    map: r`
      >r .  .  /  .  .  Tr .
      .  .  .  .  .  #  .  .
      .  #  .  .  .  /  .  .
      Tr .  .  /  .  .  \  .
      .  \  .  .  .  .  .  <r
      .  Tr .  ^r .  .  .  .
    `,
  },
  {
    id: 16,
    name: "Deep Vein",
    map: r`
      .  .  .  .  Tr .  /  /  .
      \  .  .  /  .  .  .  .  #
      .  .  #  .  .  #  .  .  .
      .  .  .  .  .  \  .  #  .
      .  Tr .  /  .  .  \  .  .
      ^r .  .  /  .  .  .  .  <r
    `,
  },
  {
    id: 17,
    name: "Resonance",
    map: r`
      .  Tr .  .  .  vr .  .
      >r .  /  /  .  .  .  .
      .  .  .  .  .  .  \  .
      .  /  .  .  .  \  .  .
      .  .  .  .  #  .  .  .
      Tr .  \  .  .  .  .  <r
      .  .  Tr .  /  .  .  .
    `,
  },
  {
    id: 18,
    name: "Split Light",
    tip: "Splitters pass half the beam straight and reflect the other half.",
    map: r`
      .  .  .  \  .  Tr .
      .  .  .  .  .  .  .
      >r .  .  S\ .  .  Tr
      .  .  .  .  .  .  .
      .  .  .  .  .  .  .
    `,
  },
  {
    id: 19,
    name: "Forked Tunnel",
    map: r`
      >r .  /  .  .  Tr .  .
      .  .  .  .  .  .  .  #
      .  .  S/ .  .  S\ .  Tr
      .  #  .  .  .  .  .  .
      Tr .  \  .  .  .  .  .
      .  .  .  .  .  .  .  .
    `,
  },
  {
    id: 20,
    name: "Crystal Heart",
    map: r`
      .  Tr .  .  /  .  .  .  .
      .  .  .  #  .  .  .  /  .
      .  .  .  .  .  .  #  .  .
      >r .  .  .  S\ .  .  .  Tr
      .  \  \  .  .  .  /  .  .
      .  #  .  .  .  .  Tr .  .
      Tr .  S/ .  .  .  .  .  <r
    `,
  },

  /* ================= WORLD 3 — COLOR GARDEN ================= */
  {
    id: 21,
    name: "Red and Blue",
    tip: "Targets only light for their own color.",
    map: r`
      .  .  .  Tr .  Tb
      .  .  .  .  .  .
      >r .  .  \  .  \
      .  .  .  .  .  .
      .  .  .  ^b .  .
    `,
  },
  {
    id: 22,
    name: "Three Petals",
    map: r`
      .  .  .  Tb .  .  .
      .  Tr .  /  .  .  <b
      .  .  #  .  .  .  .
      >r .  .  \  .  /  .
      .  .  .  .  .  .  .
      .  .  .  ^g .  Tg .
    `,
  },
  {
    id: 23,
    name: "Swap Meet",
    tip: "A target hit by the wrong color stays dark.",
    map: r`
      .  .  .  .  .  .  .
      .  .  .  \  .  Tr .
      .  .  .  .  .  .  .
      >r .  .  \  .  .  <b
      .  .  .  .  .  .  .
      .  .  .  /  .  Tb .
      .  .  .  .  .  .  .
    `,
  },
  {
    id: 24,
    name: "Green Thumb",
    map: r`
      .  .  .  .  .  vb .  .
      >r .  .  S/ .  .  .  Tr
      .  .  #  .  .  .  .  .
      .  .  .  .  .  /  .  Tb
      .  Tr .  \  .  .  .  <g
      .  .  .  Tg .  .  #  .
    `,
  },
  {
    id: 25,
    name: "Petal Loop",
    map: r`
      >r .  .  .  /  .  .  .
      .  Tr .  .  .  .  #  .
      .  .  .  .  .  .  /  .
      .  /  .  .  \  .  .  <b
      .  .  #  .  .  .  .  .
      \  .  .  .  /  .  Tb .
      ^g .  .  .  Tg .  .  .
    `,
  },
  {
    id: 26,
    name: "Blue Divide",
    map: r`
      .  .  .  vr .  .  .  .
      .  .  .  /  .  .  .  Tr
      >b .  .  S/ .  .  .  Tb
      .  .  .  .  .  #  .  .
      .  Tb .  \  .  .  .  .
      .  .  .  .  .  .  .  .
    `,
  },
  {
    id: 27,
    name: "Hedge Maze",
    map: r`
      >r .  /  #  .  .  .  .  .
      Tr .  .  .  .  /  .  #  .
      .  .  /  .  .  /  .  Tb .
      .  #  .  .  \  .  .  .  /
      /  .  .  .  .  \  #  .  .
      .  .  .  #  /  .  Tg .  .
      ^b .  .  .  .  .  .  .  ^g
    `,
  },
  {
    id: 28,
    name: "Color Weave",
    map: r`
      .  Tr Tg .  .  .  Tb vr
      .  .  .  .  #  .  .  .
      .  /  .  .  .  .  .  \
      >g .  S\ .  .  /  .  .
      .  .  .  #  .  .  .  .
      .  .  .  .  .  Tg /  <b
    `,
  },
  {
    id: 29,
    name: "Sunflower",
    map: r`
      .  .  .  .  Tr .  .  .  .
      >b .  .  .  .  .  /  .  .
      .  .  #  .  .  .  .  .  .
      .  \  .  .  S/ .  .  \  <g
      .  .  Tb .  .  .  \  .  .
      .  Tr .  .  .  .  .  Tg .
      .  .  .  .  ^r .  #  .  .
    `,
  },
  {
    id: 30,
    name: "Garden of Light",
    map: r`
      >r .  .  /  .  Tb .  .  vb
      .  .  .  .  .  .  .  #  .
      .  \  .  S\ .  /  .  .  \
      .  .  .  .  .  .  \  .  Tg
      .  .  .  /  .  .  .  .  Tr
      /  .  #  .  .  .  .  #  .
      .  Tr .  .  .  .  ^g .  .
    `,
  },

  /* ================= WORLD 4 — ANCIENT TEMPLE ================= */
  {
    id: 31,
    name: "Temple Door",
    tip: "Light crossing a rune switch opens the gate with its number.",
    map: r`
      .  .  \  .  .  /  .
      .  .  *1 .  .  .  .
      >r .  \  .  .  .  .
      .  .  .  .  .  G1 .
      .  .  /  .  #  Tr .
    `,
  },
  {
    id: 32,
    name: "Twin Seals",
    map: r`
      .  .  .  .  .  \  .  Tr
      >r *1 /  .  .  .  .  #
      .  .  G1 .  .  G2 .  .
      .  .  /  *2 .  \  .  .
      .  .  .  .  .  .  .  .
    `,
  },
  {
    id: 33,
    name: "Split Key",
    map: r`
      .  .  .  .  .  *1 .
      .  .  #  .  .  .  .
      >r .  S/ .  .  \  .
      .  .  G1 .  .  .  .
      .  .  .  .  #  .  .
      .  .  /  .  .  .  Tr
    `,
  },
  {
    id: 34,
    name: "Keeper's Beam",
    map: r`
      .  .  .  \  .  .  .  Tr
      .  #  .  .  .  .  #  .
      .  .  .  G1 .  *1 .  .
      .  .  .  .  .  .  \  .
      >r .  .  \  .  .  .  .
      .  .  .  .  .  /  .  <b
    `,
  },
  {
    id: 35,
    name: "Double Duty",
    map: r`
      >r *1 .  /  .  .  .  .
      .  .  .  G1 .  #  .  .
      .  .  .  *2 \  G2 .  /
      Tr .  .  \  .  .  .  .
      .  .  #  .  .  .  .  .
      .  .  .  .  Tg .  .  ^g
    `,
  },
  {
    id: 36,
    name: "Sun Dial",
    map: r`
      .  .  \  .  .  .  /  .  .
      .  .  G1 .  #  .  G2 .  .
      .  .  .  .  .  .  .  .  #
      >r .  S\ .  *1 .  .  #  .
      .  Tr .  .  .  *2 \  .  .
      .  .  .  #  .  .  .  .  .
      .  .  .  .  .  /  .  .  <b
    `,
  },
  {
    id: 37,
    name: "Rune Circuit",
    map: r`
      .  .  .  .  .  .  .  .
      >r .  S/ .  *1 \  .  #
      Tr .  G1 .  .  .  /  .
      .  #  .  .  .  .  .  .
      .  .  S/ .  G2 .  \  .
      .  .  *2 .  .  #  .  .
      .  .  .  .  .  .  .  .
    `,
  },
  {
    id: 38,
    name: "Colored Seals",
    map: r`
      >g .  .  /  .  .  .  vb
      Tr .  .  *1 .  /  .  .
      .  \  .  .  .  .  .  \
      Tg .  .  \  .  G1 .  .
      .  .  #  .  .  .  .  .
      .  Tb .  .  .  /  .  <r
    `,
  },
  {
    id: 39,
    name: "Hall of Pillars",
    map: r`
      .  Tr G2 .  /  .  #  \  Tr
      .  .  .  .  .  .  .  .  .
      .  #  .  .  *1 .  \  *2 .
      .  /  .  .  .  .  .  .  .
      .  .  .  .  S\ .  G1 \  .
      .  .  #  .  .  .  .  .  .
      .  .  .  .  ^r .  .  .  .
    `,
  },
  {
    id: 40,
    name: "Temple Heart",
    map: r`
      .  .  /  .  .  .  Tr .  vb
      .  .  #  .  .  .  .  .  .
      .  .  .  .  \  *2 G1 .  \
      \  *1 G3 /  .  .  .  #  .
      .  .  .  .  *3 .  .  \  .
      .  #  .  /  .  G2 \  .  .
      ^r .  .  .  Tb .  .  .  .
    `,
  },

  /* ================= WORLD 5 — PRISM PALACE ================= */
  {
    id: 41,
    name: "White Light",
    tip: "Prisms split white light: red bends left, green goes straight, blue bends right.",
    map: r`
      .  .  .  Tr .  .  .
      .  .  .  .  .  .  .
      \  .  .  P  .  .  Tg
      .  .  .  .  .  .  .
      ^w .  .  /  .  Tb .
    `,
  },
  {
    id: 42,
    name: "Bending Blue",
    tip: "A single color still bends its own way through a prism.",
    map: r`
      .  .  .  .  .  .  .
      >r .  /  .  .  .  .
      .  .  .  .  #  .  .
      \  .  P  .  .  .  Tr
      .  .  .  .  .  .  .
      ^b .  Tb .  .  .  .
    `,
  },
  {
    id: 43,
    name: "Spectrum",
    map: r`
      Tr .  .  /  .  Tg .  .
      .  .  .  .  .  .  .  .
      >w .  .  P  .  \  .  .
      .  .  .  .  .  .  .  #
      .  .  .  /  .  /  .  .
      .  .  .  .  .  Tb .  .
    `,
  },
  {
    id: 44,
    name: "Prism Pair",
    map: r`
      Tr .  /  .  .  .  .  .
      .  .  .  .  #  /  P  Tb
      .  .  .  .  .  .  .  .
      >w .  P  .  .  .  .  Tg
      .  .  .  .  .  .  .  .
      .  .  /  .  .  .  \  .
    `,
  },
  {
    id: 45,
    name: "Refraction",
    map: r`
      .  .  .  .  .  .  .  .
      Tr .  .  P  .  .  #  .
      .  .  .  .  .  .  .  .
      \  .  .  \  .  P  .  .
      .  .  #  .  .  .  .  .
      ^r .  .  .  .  Tb .  .
      .  .  .  /  .  .  .  <b
    `,
  },
  {
    id: 46,
    name: "Palace Gate",
    map: r`
      .  .  \  .  .  .  Tr .
      .  .  G1 .  .  #  .  .
      .  .  .  .  .  .  /  .
      >w .  P  .  *1 /  .  .
      .  .  .  .  .  .  .  .
      .  .  /  .  Tb Tg .  .
    `,
  },
  {
    id: 47,
    name: "Crystal Stair",
    map: r`
      >w .  .  .  /  .  .  Tr .
      .  .  .  .  .  .  #  .  .
      .  P  .  .  S/ .  .  .  .
      .  .  .  .  .  .  .  .  .
      .  Tb .  .  P  .  .  \  .
      .  .  #  .  .  .  .  .  .
      .  .  .  .  Tg .  .  .  .
    `,
  },
  {
    id: 48,
    name: "Twin Spectra",
    map: r`
      Tr .  /  .  .  .  Tg .  .
      .  .  .  .  #  .  .  .  .
      \  .  P  .  .  .  .  .  Tg
      .  Tr .  .  .  .  P  .  Tb
      .  .  /  .  .  /  .  .  .
      ^w .  .  #  .  .  .  .  .
      .  .  .  .  .  Tb /  .  <w
    `,
  },
  {
    id: 49,
    name: "Chromatic Lock",
    map: r`
      .  .  .  \  .  .  .  .  Tr
      Tg .  .  G1 .  /  .  Tb .
      .  .  .  .  .  .  .  .  .
      >w .  .  P  .  S\ .  .  Tg
      .  .  .  .  .  .  .  .  .
      .  .  #  /  .  *1 .  \  .
      .  .  .  .  .  .  .  .  .
    `,
  },
  {
    id: 50,
    name: "Prism Throne",
    map: r`
      >w .  .  /  .  Tb .  Tr .  .
      .  .  .  .  .  .  #  .  .  .
      .  \  .  P  .  *1 .  \  .  .
      .  .  .  .  .  .  .  .  #  .
      Tg .  .  G1 .  P  .  .  .  /
      .  Tb .  /  .  .  Tg .  .  .
      .  .  .  .  .  Tr .  .  .  ^w
    `,
  },

  /* ================= WORLD 6 — FROZEN REFLECTIONS ================= */
  {
    id: 51,
    name: "Sliding Ice",
    tip: "Tap an ice mirror to pick it up, then tap a glowing slot to place it.",
    map: r`
      .  .  .  .  .  .
      >r .  .  o  .  M\
      .  .  .  .  .  .
      .  .  .  .  .  .
      .  .  .  Tr .  .
    `,
  },
  {
    id: 52,
    name: "Two Skates",
    map: r`
      >r .  o  .  M\ .  M/
      .  .  .  .  .  .  .
      .  .  .  #  .  .  .
      Tr .  o  #  o  .  .
      .  .  .  .  .  .  .
    `,
  },
  {
    id: 53,
    name: "Frost Bite",
    map: r`
      .  .  .  .  .  M\ .
      .  .  #  .  .  .  .
      \  .  .  o  .  o  .
      .  .  .  .  .  .  .
      .  o  .  /  .  .  Tr
      ^r .  .  .  .  .  .
    `,
  },
  {
    id: 54,
    name: "Glacier Relay",
    map: r`
      .  .  .  .  \  .  Tr .
      .  .  .  .  .  .  #  .
      >r .  o  .  o  .  /  .
      .  .  .  .  .  .  .  .
      .  M\ .  .  o  .  Tb .
      .  .  .  .  ^b .  M/ .
    `,
  },
  {
    id: 55,
    name: "Snowdrift",
    map: r`
      Tr .  .  o  .  .  M\ .
      .  .  .  .  .  #  .  Tg
      .  .  .  .  .  .  .  .
      >w .  .  P  .  o  .  \
      .  .  #  .  .  .  .  .
      .  Tb .  o  .  .  M/ .
    `,
  },
  {
    id: 56,
    name: "Ice Sculptor",
    map: r`
      >r .  .  .  .  o  .  .
      .  .  M\ .  .  .  .  Tr
      .  .  .  .  #  .  .  .
      M/ .  o  .  .  o  .  .
      .  .  .  .  .  .  .  M\
      .  .  .  M/ .  .  .  .
    `,
  },
  {
    id: 57,
    name: "Cold Gate",
    map: r`
      .  .  .  *1 .  .  .  .
      .  .  .  M/ .  #  .  .
      >r .  .  S/! .  G1 o  .
      .  .  .  .  .  .  .  .
      .  .  o  .  .  #  .  .
      .  .  M\ .  .  .  Tr .
    `,
  },
  {
    id: 58,
    name: "Skating Splitter",
    map: r`
      o  .  .  .  .  .  .  .
      >r .  .  S/ .  o  .  .
      .  M\ .  .  .  .  #  .
      .  .  .  .  .  o  .  Tr
      Tr .  .  o  .  .  .  .
      M/ .  .  .  .  .  M\ .
    `,
  },
  {
    id: 59,
    name: "Aurora",
    map: r`
      .  Tr .  .  Tg .  .  Tb .
      .  .  .  .  M\ .  .  .  .
      .  .  #  .  .  .  #  .  .
      .  o  .  .  P  .  .  o  .
      .  .  .  .  .  .  .  .  .
      o  .  .  .  .  .  .  .  .
      >w .  .  .  \  .  .  .  M/
    `,
  },
  {
    id: 60,
    name: "Frozen Crown",
    map: r`
      .  .  .  M/ .  .  Tr .  M/
      >r .  /  .  .  #  .  .  .
      .  .  .  .  o  .  .  .  Tb
      .  .  *1 .  .  .  .  #  .
      M\ .  .  .  .  .  .  .  .
      .  .  o  .  .  G1 o  .  .
      .  #  .  .  /  .  .  .  <b
    `,
  },

  /* ================= WORLD 7 — NEON CIRCUIT ================= */
  {
    id: 61,
    name: "Color Filter",
    tip: "Filters only let their own color through.",
    map: r`
      .  .  /! .  .  .  Tr
      .  .  Fr .  .  .  .
      >w .  \  .  .  .  .
      .  .  Fb .  .  .  .
      .  .  \! .  .  .  .
    `,
  },
  {
    id: 62,
    name: "Mixing Desk",
    tip: "Light adds up: red + blue makes purple.",
    map: r`
      >r .  .  /  .  .  .
      .  .  .  .  .  .  .
      .  .  .  Tp .  .  .
      .  .  .  .  .  .  .
      .  .  .  /  .  .  <b
    `,
  },
  {
    id: 63,
    name: "Yellow Alert",
    map: r`
      .  .  .  .  .  .  .  .
      \  .  Fy .  S/ Fr .  Tr
      .  .  .  .  .  .  #  .
      .  .  .  .  Ty .  .  .
      ^w .  .  .  .  .  .  .
    `,
  },
  {
    id: 64,
    name: "Subtractive",
    map: r`
      Tg Fg /  .  .  .  .  .
      .  .  .  .  .  \  .  Tr
      >w .  S/! Fp .  P  .  .
      .  .  .  .  .  /  .  Tb
      .  .  .  .  .  .  .  .
    `,
  },
  {
    id: 65,
    name: "Neon Mixer",
    map: r`
      .  .  .  .  Tg .  .  .
      .  .  .  \  .  .  /  .
      .  #  .  .  .  .  .  .
      >w .  .  P  \  .  Tp .
      .  .  .  .  .  .  .  #
      .  .  .  /  .  .  \  .
      .  .  .  .  .  .  .  .
    `,
  },
  {
    id: 66,
    name: "Filter Gate",
    map: r`
      .  .  .  .  Tr .  .  vb
      .  .  .  #  .  .  .  .
      .  \  .  .  G1 *1 Fb \
      .  .  .  .  .  .  .  .
      >r .  .  .  \  .  #  .
      .  Tb .  .  .  .  .  .
    `,
  },
  {
    id: 67,
    name: "Circuit Board",
    map: r`
      .  .  .  .  Tc .  /  .  .
      .  .  #  .  .  .  .  .  .
      .  .  .  .  .  .  /  .  <b
      .  Ty .  .  S/ .  .  #  .
      .  Fr .  .  .  .  .  .  .
      >w \  .  .  .  .  .  .  .
      .  .  .  .  ^g .  .  .  .
    `,
  },
  {
    id: 68,
    name: "Glitch",
    map: r`
      >w Fy .  S/ Fc .  /  .
      .  .  .  .  .  .  .  .
      .  .  #  Fr .  .  .  .
      .  Tr .  \  .  .  Tg .
      .  .  .  .  .  .  .  .
    `,
  },
  {
    id: 69,
    name: "Overdrive",
    map: r`
      .  .  .  .  .  .  .  .  .
      .  .  \  .  *1 .  /  .  .
      .  .  .  .  .  .  .  /  .
      >w .  P  .  Fr .  Tp .  .
      .  .  .  .  .  .  .  #  .
      .  .  /  .  G1 .  \  .  \
      .  .  .  .  .  .  .  .  .
    `,
  },
  {
    id: 70,
    name: "Neon Core",
    tip: "A white target needs red, green and blue together.",
    map: r`
      >w Fc /  .  \  .  .  .  <g
      .  .  .  .  .  .  #  .  .
      .  #  .  .  .  .  .  .  .
      \  .  .  .  Tw .  /  .  .
      .  .  .  .  .  .  .  #  .
      .  .  Tc .  .  .  .  .  .
      ^r .  .  .  .  .  /  .  <b
    `,
  },

  /* ================= WORLD 8 — PORTAL CHAMBERS ================= */
  {
    id: 71,
    name: "Warp",
    tip: "A beam entering a portal leaves its twin, travelling the same way.",
    map: r`
      .  .  .  .  #  .  .
      >r .  /  .  #  @1 .
      .  .  .  .  #  .  .
      .  .  @1 .  #  .  .
      .  .  .  .  #  Tr .
    `,
  },
  {
    id: 72,
    name: "Wormhole Turn",
    map: r`
      .  .  .  .  #  .  .  .
      .  .  .  #  Tr .  /  .
      .  .  .  @1 #  .  .  .
      .  .  .  .  .  .  .  .
      >r .  .  \  .  .  @1 .
      .  .  .  .  .  .  .  .
    `,
  },
  {
    id: 73,
    name: "Double Warp",
    map: r`
      >r .  /  .  .  .  @1 .
      .  .  .  .  #  .  .  .
      .  .  @1 .  @2 .  \  .
      .  .  .  Tr #  .  .  .
      .  .  .  .  #  .  .  .
      .  .  .  /  .  @2 .  .
    `,
  },
  {
    id: 74,
    name: "Infinite Hall",
    map: r`
      .  .  .  .  .  Tr .
      .  .  .  #  .  .  .
      >r @1 .  #  .  @1 /
      .  /  .  .  .  .  \
      .  .  .  .  .  .  .
    `,
  },
  {
    id: 75,
    name: "Chromatic Warp",
    map: r`
      .  .  .  .  .  .  .  .
      .  \  .  @1 #  .  .  .
      .  .  .  .  #  Tr .  .
      .  .  .  #  .  .  .  .
      .  .  .  @1 .  \  .  <b
      .  ^r .  .  .  Tb .  .
    `,
  },
  {
    id: 76,
    name: "Gatekeeper",
    map: r`
      .  .  @1 .  .  .  .  .
      .  .  .  #  Tr .  /  .
      >r .  \  \  .  .  G1 <b
      .  .  .  .  .  .  .  .
      .  .  .  Tb .  #  *1 .
      .  .  .  .  .  .  @1 .
    `,
  },
  {
    id: 77,
    name: "Pocket Mirror",
    map: r`
      .  .  .  .  Tr .  /  .
      >r M/ @1 .  #  .  .  .
      .  .  .  .  #  .  .  .
      .  .  .  o  #  .  .  .
      .  .  .  .  .  @1 M\ .
      .  .  .  .  .  .  .  .
    `,
  },
  {
    id: 78,
    name: "Prism Warp",
    map: r`
      .  .  Tb .  .  .  .  Tr .
      .  .  .  .  #  .  @1 .  .
      .  .  .  .  .  .  .  .  .
      >w .  /  .  .  .  P  \  .
      .  .  .  .  .  .  .  .  .
      .  .  @1 .  .  #  .  .  .
      .  .  .  .  .  .  Tg .  .
    `,
  },
  {
    id: 79,
    name: "Split Warp",
    map: r`
      .  @1 .  .  .  /  .  .
      .  .  .  @2 .  Tr #  .
      .  .  .  .  .  .  .  .
      >r .  .  S\ @1 .  .  .
      .  .  .  .  .  .  .  .
      .  .  #  #  .  Tr /  .
      .  .  .  .  .  .  @2 .
    `,
  },
  {
    id: 80,
    name: "Portal Nexus",
    map: r`
      .  .  .  .  .  .  .  .  Tr
      \  *1 .  @1 .  #  .  .  .
      .  \  .  M/ .  Tb .  .  .
      .  .  #  .  @2 .  o  .  .
      .  @2 .  .  G1 .  .  #  .
      .  .  .  .  .  .  .  @1 \
      ^r .  .  .  ^b .  .  .  .
    `,
  },

  /* ================= WORLD 9 — CLOCKWORK LIGHT ================= */
  {
    id: 81,
    name: "First Gear",
    tip: "Turn the crank: every geared part it drives moves together.",
    map: r`
      .  .  .  .       .  .  .
      >r .  .  g1:/\   .  .  .
      .  .  .  .       .  .  .
      .  .  .  Tr      .  .  .
      C1 .  .  .       .  .  .
    `,
  },
  {
    id: 82,
    name: "Shutter",
    map: r`
      .  .  .        .  .  .  .
      >r .  h1:01    .  /  .  .
      .  .  .        .  .  .  .
      .  .  .        .  Tr .  C1
    `,
  },
  {
    id: 83,
    name: "Gear Train",
    map: r`
      .  .  .         .  .  .  .  .
      .  .  .         #  .  .  .  .
      >r .  g1:/\\    .  .  .  .  .
      .  .  .         .  .  #  .  .
      .  .  g1:\/\    .  .  .  .  Tr
      C1 .  .         .  .  .  .  .
    `,
  },
  {
    id: 84,
    name: "Pendulum",
    map: r`
      .  .  /!  .  h1:10  .  \!  .
      >r .  \   .  .      .  .   .
      .  .  .   .  .      .  .   .
      .  .  h1:01 .  .    .  .   .
      .  .  \!  .  .      .  Tr  .
      C1 .  .   .  .      .  .   .
    `,
  },
  {
    id: 85,
    name: "Clock Tower",
    map: r`
      .  .  .  .         Tb       .        .  .
      >r .  .  g1:/\\/   .        .        .  .
      .  .  .  .         .        .        #  .
      .  .  .  /         .        .        .  Tr
      .  #  .  .         .        .        .  .
      .  .  .  .         g1://\\  h1:0011  .  <b
      C1 .  .  .         .        .        .  .
    `,
  },
  {
    id: 86,
    name: "Escapement",
    map: r`
      >r .  .  g1:/\\  .  .       .  .
      .  .  .  .       .  #       .  .
      .  #  .  h2:01   .  .       .  .
      .  .  .  g2:/\   .  h1:101  .  Tr
      .  .  .  .       .  .       .  .
      C1 .  .  .       .  .       .  C2
    `,
  },
  {
    id: 87,
    name: "Cuckoo",
    map: r`
      .  .  .       .  .  .  .       .
      .  .  .       .  #  .  @1      .
      >r .  g1:/\\  .  #  .  h1:101  .
      .  .  .       .  #  .  .       .
      .  .  @1      .  Tr .  \       .
      C1 .  .       .  .  .  .       .
    `,
  },
  {
    id: 88,
    name: "Brass Prism",
    map: r`
      .  .  .       .  .       .  .  .   .
      .  Tr .       .  g1:/\\  .  .  #   .
      .  .  #       .  .       .  .  .   .
      >w .  h1:110  .  P       .  .  /   .
      .  .  .       .  .       .  .  .   .
      .  .  Tb      .  g1:\//  .  .  Tg  .
      C1 .  .       .  .       .  .  .   .
    `,
  },
  {
    id: 89,
    name: "Mainspring",
    map: r`
      .  .  .          .  .   .  .   .  .
      >r .  S/         .  *1  .  #   .  .
      .  .  .          .  .   .  Tr  .  .
      .  .  h1:0011    .  .   .  .   .  .
      .  .  g1:/\/\    .  G1  .  \   .  .
      .  #  .          .  .   .  .   .  .
      C1 .  .          .  .   .  .   .  .
    `,
  },
  {
    id: 90,
    name: "Grand Clock",
    map: r`
      >r .  g1://\/  .  Tb  \        .  Tr        .  C2
      .  .  .        .  .   .        .  .         #  .
      .  #  h2:001   .  .   .        .  .         .  .
      .  .  /        .  *1  g2:\\/   .  .         #  .
      .  .  .        .  .   .        .  .         .  .
      .  .  .        #  G1  .        .  .         .  .
      C1 .  .        .  g1:/\\/  .   h1:0110  .   .  <b
    `,
  },

  /* ================= WORLD 10 — COSMIC LIGHT ================= */
  {
    id: 91,
    name: "Stardust",
    map: r`
      .  .  .  .  .  Tr .  .
      .  .  .  .  .  .  #  .
      >w .  S/ Fr .  \  .  .
      .  .  .  .  .  .  .  .
      .  .  Fb .  .  .  @1 Tb
      .  .  /  @1 .  .  .  .
    `,
  },
  {
    id: 92,
    name: "Nebula",
    map: r`
      .  .  .  .  .  .  Tg .  .
      .  o  .  o  .  @1 .  .  Tb
      .  .  #  .  .  .  .  .  .
      .  .  .  M/ .  .  .  .  .
      >w .  .  P  .  .  \  .  .
      .  .  .  .  .  #  .  .  .
      .  .  .  /  .  .  @1 M\ Tr
    `,
  },
  {
    id: 93,
    name: "Orbit",
    map: r`
      .  .  .  .       .  .  .       .
      >r .  .  g1:/\\  .  .  .       .
      .  .  #  .       .  .  .       .
      .  .  .  Tp      .  .  h1:101  <b
      .  .  .  \       .  .  Tg      .
      .  .  .  Fg      .  #  .       .
      C1 .  .  ^w      .  .  .       .
    `,
  },
  {
    id: 94,
    name: "Constellation",
    map: r`
      >r .  S/ .  *1 .  /  .  .
      .  .  .  .  .  #  .  .  .
      .  .  @1 .  .  .  Tr .  .
      .  .  .  .  .  \  .  G2 <b
      >g G1 *2 /  .  .  .  .  .
      .  .  .  .  .  Tb .  @1 .
      .  .  .  Tg .  .  .  Tr .
    `,
  },
  {
    id: 95,
    name: "Supernova",
    map: r`
      .  .  Tr .  Tg .  Tb .  .
      .  .  .  .  .  .  .  .  .
      .  .  *1 .  G1 .  .  #  .
      .  #  .  .  .  .  .  .  .
      .  .  M/ .  P  .  M\ .  .
      .  .  .  .  .  .  .  .  .
      >w .  .  .  \  .  .  .  o
    `,
  },
  {
    id: 96,
    name: "Event Horizon",
    map: r`
      .  .  .  .  .  .  .       vb
      Tr @2 .  .  .  .  .       h1:101
      .  .  #  .  .  .  .       .
      >r .  @1 .  #  @1 g1://\  .
      .  .  .  .  .  .  .       .
      .  .  .  .  @2 .  \       .
      C1 .  .  .  .  .  .       Tb
    `,
  },
  {
    id: 97,
    name: "Dark Matter",
    map: r`
      .  .  .  .  \  .  .  /  .
      >w .  Fp .  P  .  .  .  .
      .  .  .  .  .  .  #  .  .
      .  .  .  .  .  .  .  Tp .
      .  .  .  .  /  @1 #  .  .
      .  .  #  .  .  .  .  .  .
      .  @1 .  .  .  .  .  \  .
    `,
  },
  {
    id: 98,
    name: "Galaxy",
    map: r`
      >r .  .  /  Tr .  /  .  .  .
      .  /  .  .  .  .  .  .  \  .
      .  .  #  .  .  .  .  #  .  .
      \  .  .  /  .  .  \  .  .  Tg
      .  .  .  .  .  #  .  .  .  .
      .  .  .  /  .  Tb .  .  /  .
      ^b .  .  .  .  .  /  .  .  <g
    `,
  },
  {
    id: 99,
    name: "Singularity",
    map: r`
      .  .   .         \  .   .  Tr         .  .
      .  .   #         .  .   .  .          .  @1
      .  .   .         *1 .   .  .          .  .
      >w h1:1001  .    P  G1  .  g1:///\    .  .
      .  .   .         .  .   .  .          .  h1:0001
      .  .   .         @1 .   #  /          Tg .
      C1 .   .         .  .   .  .          .  Tb
    `,
  },
  {
    id: 100,
    name: "Cosmic Light",
    tip: "Every rule of light, one last time. Take it step by step.",
    map: r`
      .  .  .       .  .       .  .   .  .  .
      .  .  .       .  #       .  .   .  Tg .
      .  .  \       *1 .       S/ .   G2 .  Tr
      .  .  .       .  .       Tr .   .  .  .
      >w .  P       G1 M\      @1 .   #  .  .
      .  .  .       .  .       .  .   .  *2 .
      .  o  g1:/\   .  h1:01   Fb Tb  .  .  .
      C1 M/ .       .  .       .  .   @1 o  .
    `,
  },
];
