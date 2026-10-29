/**
 * Enemy groups. A group spawns when its `when` condition holds (engine/
 * conditions.js) and the player is within `range`; members leash to their
 * home. `once` groups never come back after dying (bosses, quest fights);
 * others respawn `respawn` seconds after the whole group falls, out of
 * sight. `tag` marks members for quest kill counts and markers. Members:
 * [type, x, z, opts] — opts: {patrol:[[x,z]…], tag, yaw, guard (stand still)}.
 */

export const SPAWNS = [
  /* ---------------------------------------------------- Thornwick raid (opening) */
  {
    id: "raid",
    once: true,
    range: 200,
    when: { q: "q_thornwick.raiders" },
    tag: "raider",
    members: [
      ["bandit", -22, 146],
      ["bandit", -34, 158],
      ["bandit", 10, 168],
      ["archerBandit", 24, 150],
      ["bandit", -50, 196],
      ["bandit", 30, 186],
    ],
  },
  /* ---------------------------------------------------- roads and wilds */
  { id: "eastAmbush", respawn: 600, range: 120, when: { qd: "q_thornwick" }, members: [["bandit", 152, 102], ["bandit", 158, 92], ["archerBandit", 166, 108]] },
  { id: "westRoad", respawn: 600, range: 120, when: { qd: "q_thornwick" }, members: [["bandit", -128, 104], ["archerBandit", -140, 118]] },
  { id: "watchtower", respawn: 900, range: 120, members: [["bandit", -118, -32], ["bandit", -126, -46], ["archerBandit", -112, -50]] },
  { id: "southMarch", respawn: 900, range: 120, members: [["bandit", -104, 338], ["bandit", -96, 350], ["archerBandit", -112, 344]] },
  { id: "wolvesA", respawn: 360, range: 110, members: [["wolf", -212, -26], ["wolf", -206, -34], ["wolf", -218, -38]] },
  { id: "wolvesB", respawn: 360, range: 110, members: [["wolf", -62, -84], ["wolf", -54, -92]] },
  { id: "wolvesC", respawn: 360, range: 110, members: [["wolf", -262, 118], ["wolf", -254, 126], ["wolf", -270, 128]] },
  { id: "snowWolves", respawn: 360, range: 110, members: [["wolf", 92, -196, { snow: true }], ["wolf", 100, -204, { snow: true }], ["wolf", 86, -206, { snow: true }]] },
  { id: "mineWolves", respawn: 360, range: 110, members: [["wolf", -110, -236, { snow: true }], ["wolf", -100, -230, { snow: true }]] },
  { id: "den", once: true, range: 120, tag: "greyfang", members: [["greyfang", -332, -82], ["wolf", -322, -74], ["wolf", -340, -90]] },
  { id: "stones", respawn: 600, range: 90, night: true, members: [["undead", 146, -56], ["undead", 156, -64], ["undead", 150, -48]] },
  { id: "eastHills", respawn: 900, range: 120, when: { qd: "q_testament" }, members: [["corrupted", 380, 150], ["ashArcher", 390, 162]] },
  /* ---------------------------------------------------- Red Hand camp */
  {
    id: "redhand",
    once: true,
    range: 140,
    members: [
      ["bandit", -284, 196, { patrol: [[-284, 196], [-296, 182], [-310, 194]] }],
      ["bandit", -292, 212],
      ["bandit", -316, 204],
      ["bandit", -300, 186],
      ["bandit", -262, 182, { guard: true, yaw: 1.2 }],
      ["bandit", -266, 190, { guard: true, yaw: 1.2 }],
      ["archerBandit", -290, 222],
      ["archerBandit", -312, 216],
      ["archerBandit", -278, 176],
      ["garrick", -312, 192, { tag: "garrick" }],
    ],
  },
  /* ---------------------------------------------------- Ashfall */
  {
    id: "ashOuter",
    respawn: 1200,
    range: 140,
    when: { qd: "q_testament" },
    members: [
      ["corrupted", 244, 30, { patrol: [[244, 30], [244, 6], [252, -10]] }],
      ["corrupted", 250, 46],
      ["ashArcher", 238, 18],
    ],
  },
  {
    id: "ashCourt",
    once: true,
    range: 120,
    members: [
      ["corrupted", 280, 30],
      ["corrupted", 290, 10, { patrol: [[290, 10], [310, 10], [310, 40], [290, 40]] }],
      ["corrupted", 316, 34],
      ["corrupted", 274, 8],
      ["ashArcher", 326, 6],
      ["ashArcher", 300, 46],
      ["elite", 296, 24, { guard: true }],
      ["elite", 318, 44, { guard: true, yaw: 3.1 }],
      ["voss", 305, 18, { tag: "voss" }],
    ],
  },
  { id: "tunnel", once: true, range: 80, interior: "tunnel", members: "tunnel" },
  { id: "crypt", once: true, range: 120, interior: "crypt", members: "crypt" },
  { id: "warden", once: true, range: 80, interior: "crypt", tag: "hollowWarden", members: "cryptBoss" },
  /* ---------------------------------------------------- Cinderpeak path (anchor guards) */
  { id: "anchor1", once: true, range: 110, members: [["corrupted", 322, -102], ["corrupted", 332, -116], ["ashArcher", 318, -124]] },
  { id: "anchor2", once: true, range: 110, members: [["corrupted", 284, -192], ["elite", 276, -204, { guard: true }], ["ashArcher", 290, -208]] },
  { id: "anchor3", once: true, range: 110, members: [["corrupted", 338, -246], ["corrupted", 348, -258], ["elite", 340, -264, { guard: true }], ["ashArcher", 330, -240]] },
  /* ---------------------------------------------------- the end */
  {
    id: "siege",
    once: true,
    range: 200,
    when: { q: "q_throne.siege" },
    tag: "siege",
    members: [
      ["corrupted", -10, -276],
      ["corrupted", 12, -280],
      ["corrupted", -24, -290],
      ["corrupted", 26, -292],
      ["corrupted", -6, -298],
      ["corrupted", 16, -270],
      ["ashArcher", -36, -300],
      ["ashArcher", 36, -306],
      ["elite", 0, -300, { guard: true }],
      ["elite", -18, -310, { guard: true }],
      ["elite", 18, -310, { guard: true }],
    ],
  },
  { id: "malric", once: true, range: 200, when: { q: "q_throne.malric" }, tag: "malric", members: [["malric", 0, -312, { yaw: 3.14 }]] },
];

/** Allies who join the final battle, by the faction you pledged to. */
export const SIEGE_ALLIES = {
  wardens: { look: "wardenGuard", weapon: "sword", n: 5, name: "Warden" },
  ember: { look: "emberGuard", weapon: "halberd", n: 5, name: "Ember Guard" },
  marches: { look: "militia", weapon: "spear", n: 6, name: "Marches Militia" },
};
