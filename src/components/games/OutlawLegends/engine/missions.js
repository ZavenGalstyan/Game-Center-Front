/**
 * The 20 missions of Outlaw Legends. Each mission builds its own layout (a
 * shared location generator + mission-specific cover and props), places
 * NPCs / mission objects / enemy groups, and lists the objective steps the
 * sim walks through in order. Every step is a checkpoint.
 *
 * Step types: talk · reach · kill (groups; `fists` = guns holstered) ·
 * targets (shoot objects) · interact (hold E on objects) · collect (walk over)
 * · survive (timer + waves) · defend (object hp + timer + waves) · duel.
 * Enemy entry: [type, x, z, opts] — opts: rot (deg), hold, alert, patrol,
 * name, boss {hp, specials}, siege, ko (knock-out instead of kill).
 */
import { createLayout, town, saloon, ranch, stockyard, desertCamp, canyon, openDesert, miningTown, mineTunnel, station, fort, bootHill, hacienda, mesa } from "./layout.js";

export const CHAPTERS = [
  { id: 1, name: "Red Mesa", missions: [1, 2, 3, 4] },
  { id: 2, name: "Wanted", missions: [5, 6, 7, 8] },
  { id: 3, name: "Red Sands", missions: [9, 10, 11, 12] },
  { id: 4, name: "Iron & Silver", missions: [13, 14, 15, 16] },
  { id: 5, name: "The Crowe Gang", missions: [17, 18, 19, 20] },
];

const HALE = "Sheriff Hale";
const ELI = "Eli Hart";

/** Long-lined helper so enemy lists stay compact. */
const g = (type, x, z, opts = {}) => [type, x, z, opts];

export const MISSIONS = [
  /* ------------------------------------------------------------ 1 */
  {
    id: 1,
    name: "Dust and Iron",
    location: "Red Mesa · Main Street",
    brief: "A drifter rides into Red Mesa answering the sheriff's call for help. Prove you can handle a gun, then run the Crowe gang's bullies out of town.",
    theme: "noon",
    build(B) {
      town(B);
      B.fence(-3.2, 24, 3.2, 24, { h: 1.0 });
      B.wagon(-3.5, -18, "z", true);
      B.crate(4, -28, 1.2);
      B.barrel(-2, -32);
    },
    start: [0, 41, 0],
    npcs: [{ id: "hale", name: HALE, look: "sheriff", x: 3.5, z: 35, rot: 160 }],
    objects: [-2.4, -1.2, 0, 1.2, 2.4].map((x, i) => ({ id: `b${i}`, kind: "bottle", x, y: 1.2, z: 24 })),
    groups: {
      g1: [g("bandit", -3, -34), g("bandit", 4.5, -37), g("bandit", -5, -29, { rot: 180 })],
    },
    steps: [
      {
        type: "talk",
        npc: "hale",
        text: "Talk to Sheriff Hale",
        hint: "Walk with W A S D. Move the mouse to look around. Press E to talk.",
        lines: [
          [HALE, "So you're the drifter who answered my telegram. Name's Ruth Hale."],
          [HALE, "The Crowe gang has been bleeding Red Mesa dry. I need a gun I can trust."],
          [HALE, "Show me you can shoot. Five bottles on that fence."],
        ],
      },
      { type: "targets", ids: ["b0", "b1", "b2", "b3", "b4"], text: "Shoot the bottles on the fence", hint: "Hold right mouse button to aim, left click to shoot. R reloads." },
      {
        type: "kill",
        groups: ["g1"],
        text: "Run the bandits out of the general store",
        hint: "Crouch behind cover with C. Shift sprints, Q dodges.",
        npcAt: { hale: [6, -18] },
        say: [[HALE, "Not bad at all. Trouble — Crowe's boys are hassling the general store up the street!"]],
      },
      {
        type: "talk",
        npc: "hale",
        text: "Report back to Sheriff Hale",
        lines: [
          [HALE, "Three of Crowe's men, and you didn't even lose your hat."],
          [HALE, "Folks will talk. Come by the office tomorrow — I've got real work for you."],
        ],
      },
    ],
    reward: { money: 120, xp: 150 },
  },

  /* ------------------------------------------------------------ 2 */
  {
    id: 2,
    name: "Trouble at the Bank",
    location: "Red Mesa · First Frontier Bank",
    brief: "The Crowe gang is robbing the bank in broad daylight. Stop the robbers, recover the stolen money and catch the getaway riders.",
    theme: "afternoon",
    build(B) {
      town(B, { hollow: { bank: true } });
      B.wagon(-3, 6, "z", true);
      B.barrel(-6.5, 16);
      B.barrel(5, 4);
      B.crate(3, 13, 1.2, 2);
      B.crate(-4, 26, 1.2);
      B.sandbags(2, 30, 3);
      B.solid("safe", -16.4, 13.2, 1.3, 1.3, 1.7);
      B.solid("counter", -13.2, 7.2, 4.6, 0.8, 1.1);
    },
    start: [0, -40, 180],
    npcs: [{ id: "hale", name: HALE, look: "sheriff", x: 3, z: -37, rot: 180 }],
    objects: [
      { id: "m1", kind: "moneybag", x: -15.6, z: 12.4 },
      { id: "m2", kind: "moneybag", x: -11.6, z: 9.6 },
      { id: "m3", kind: "moneybag", x: 2.2, z: 10.5 },
    ],
    groups: {
      g1: [g("bandit", -5, 10), g("bandit", 1, 8), g("bandit", 5, 14), g("bandit", -6, 2), g("gunslinger", 3, 19)],
      g2: [g("bandit", -14, 13), g("bandit", -12, 8), g("gunslinger", -14, 5.6)],
      g3: [g("bandit", -2, 42, { alert: true }), g("bandit", 3, 44, { alert: true }), g("gunslinger", 0, 46, { alert: true }), g("bandit", -5, 40, { alert: true })],
    },
    steps: [
      {
        type: "kill",
        groups: ["g1"],
        text: "Stop the robbers outside the bank",
        say: [[HALE, "They're cleaning out the First Frontier Bank! Get down there, I'll cover the north road."]],
      },
      { type: "kill", groups: ["g2"], text: "Clear the robbers inside the bank" },
      { type: "collect", ids: ["m1", "m2", "m3"], text: "Recover the stolen money bags" },
      {
        type: "kill",
        groups: ["g3"],
        text: "Stop the getaway gang at the stables",
        say: [[ELI, "Riders coming in from the south — the getaway crew."]],
      },
      {
        type: "talk",
        npc: "hale",
        text: "Return the money to Sheriff Hale",
        npcAt: { hale: [5, 2] },
        lines: [
          [HALE, "Every last dollar. The bank owes you, and so do I."],
          [HALE, "But Crowe won't take this lying down. Watch your back."],
        ],
      },
    ],
    reward: { money: 150, xp: 200 },
  },

  /* ------------------------------------------------------------ 3 */
  {
    id: 3,
    name: "The Wanted Poster",
    location: "Red Mesa · Sheriff's Office",
    brief: "Sheriff Hale has a name for you: Snake-Eye Morgan. Collect his wanted poster, settle a drunken brawl with your fists and deal with Morgan's scouts.",
    theme: "morning",
    build(B) {
      town(B, { hollow: { sheriff: true } });
      B.solid("desk", 15, -36.5, 2.4, 1.2, 0.9);
      B.solid("cell", 15.8, -30.6, 3, 3, 3, { bars: true });
      B.crate(-2, 6, 1.2);
      B.crate(3, -2, 1.2, 2);
      B.wagon(4, 12, "z", true);
      B.barrel(-5, -6);
      B.barrel(-4.2, -6.6);
    },
    start: [11.5, -33, 90],
    npcs: [{ id: "hale", name: HALE, look: "sheriff", x: 14.2, z: -35, rot: 60 }],
    objects: [
      { id: "poster", kind: "poster", x: 17.3, z: -38.4, y: 1.7, face: "w", wanted: "Snake-Eye Morgan" },
      { id: "bag", kind: "saddlebag", x: 0.5, z: -9 },
    ],
    groups: {
      tom: [g("brawler", -3, 37, { name: "Big Tom", ko: true, rot: 0 }), g("brawler", -6, 41, { ko: true }), g("brawler", 1.5, 40, { ko: true })],
      g3: [g("bandit", -4, -10, { alert: true }), g("bandit", 4, -14, { alert: true }), g("gunslinger", 0, -20, { alert: true }), g("bandit", -6, -22, { alert: true }), g("bandit", 5, -4, { alert: true })],
    },
    steps: [
      {
        type: "talk",
        npc: "hale",
        text: "Talk to Sheriff Hale",
        lines: [
          [HALE, "Morning. The man behind the bank job is Snake-Eye Morgan — Crowe's fastest gun."],
          [HALE, "His poster's on the wall. Take it, and learn that face."],
        ],
      },
      { type: "interact", ids: ["poster"], text: "Take Snake-Eye Morgan's wanted poster", verb: "Take poster", hold: 0.4 },
      {
        type: "kill",
        groups: ["tom"],
        fists: true,
        text: "Knock out Big Tom and his friends with your fists",
        hint: "Guns are holstered. F punches (press repeatedly for a combo), V kicks, hold X to block, Q to dodge.",
        say: [[HALE, "Big Tom's drunk again and wrecking the stables. He's harmless — no guns, just knock some sense into him."]],
      },
      {
        type: "kill",
        groups: ["g3"],
        text: "Deal with Morgan's scouts",
        hint: "Knocked-down enemies can be finished with a takedown: get close and press E.",
        say: [[HALE, "Gunfire up the street — Morgan's scouts! They followed the money."]],
      },
      {
        type: "interact",
        ids: ["bag"],
        text: "Search the scouts' saddlebag",
        verb: "Search",
        hold: 0.6,
        doneSay: [[ELI, "A note: 'Morgan waits on Main Street at high noon.' So be it."]],
      },
    ],
    reward: { money: 160, xp: 220 },
  },

  /* ------------------------------------------------------------ 4 */
  {
    id: 4,
    name: "High Noon",
    location: "Red Mesa · Main Street",
    brief: "Snake-Eye Morgan has called you out. Clear his gang from Main Street, then face him in your first duel. Wait for the signal — and draw fast.",
    theme: "noon",
    wanted: { name: "Snake-Eye Morgan", bounty: 500 },
    build(B) {
      town(B);
      B.wagon(-3, 22, "z", true);
      B.wagon(4, 8, "x", true);
      B.crate(-4, 12, 1.2, 2);
      B.crate(2, 28, 1.2);
      B.barrel(-6, 4);
      B.barrel(5, 30);
      B.sandbags(-2, -2, 3);
      B.crate(6, -8, 1.2);
    },
    start: [0, 42, 0],
    npcs: [],
    objects: [],
    groups: {
      g1: [g("bandit", -3, 16), g("bandit", 3, 12), g("bandit", -5, 6), g("gunslinger", 2, 2), g("bandit", 5, 20), g("bandit", -2, -4)],
      g2: [g("gunslinger", -8.4, -22, { alert: true }), g("gunslinger", 8.4, -14, { alert: true }), g("gunslinger", -8.4, -8, { alert: true })],
      morgan: [],
    },
    steps: [
      { type: "kill", groups: ["g1"], text: "Clear Morgan's gang from Main Street", say: [["Snake-Eye Morgan", "Let's see if the drifter can get past my boys!"]] },
      { type: "kill", groups: ["g2"], text: "Take down the gunmen on the porches" },
      { type: "reach", at: [0, -16], r: 3, text: "Meet Morgan in the middle of the street", say: [["Snake-Eye Morgan", "You've got sand, stranger. Let's settle this the old way."]] },
      {
        type: "duel",
        foe: { name: "Snake-Eye Morgan", look: "gunslinger", reaction: 1.0 },
        at: [0, -16],
        foeAt: [0, -32],
        text: "Duel: outdraw Snake-Eye Morgan",
        hint: "Keep still until DRAW! appears. Then aim at Morgan and click — shoot before he does. Shooting early loses the duel.",
      },
    ],
    reward: { money: 200, xp: 300 },
  },

  /* ------------------------------------------------------------ 5 */
  {
    id: 5,
    name: "Saloon Brawl",
    location: "The Rusty Spur Saloon",
    brief: "Morgan's friends are drinking in the Rusty Spur and spoiling for a fight. Win the brawl with your fists — then deal with the gunmen who come through the door.",
    theme: "interior",
    build(B) {
      saloon(B);
    },
    start: [0, 10.5, 0],
    npcs: [{ id: "gus", name: "Gus the Bartender", look: "bartender", x: -3, z: -11, rot: 0 }],
    objects: [],
    groups: {
      g1: [g("brawler", -7, 3, { rot: 120 }), g("brawler", 6, 0, { rot: -120 }), g("brawler", -1, -5), g("brawler", 10, 5, { rot: -90 })],
      g2: [g("gunslinger", -1.5, 12.2, { alert: true }), g("bandit", 1.5, 12.2, { alert: true }), g("bandit", 0, 12.4, { alert: true }), g("gunslinger", 13.6, 10.5, { alert: true }), g("shotgunner", 12.5, -2, { alert: true })],
    },
    steps: [
      {
        type: "talk",
        npc: "gus",
        text: "Talk to Gus the bartender",
        lines: [
          ["Gus the Bartender", "Morgan's friends are here, itching for a fight."],
          ["Gus the Bartender", "Keep your guns holstered in my saloon — I can't afford new mirrors."],
        ],
      },
      {
        type: "kill",
        groups: ["g1"],
        fists: true,
        text: "Win the bar fight with your fists",
        hint: "Block with X when a brawler winds up. Kicks (V) break their guard.",
        say: [["Brawler", "You're the one who shot Morgan? Let's dance, cowboy!"]],
      },
      {
        type: "kill",
        groups: ["g2"],
        text: "Take down the gunmen",
        say: [["Gus the Bartender", "Gunmen at the door! Forget the mirrors — shoot back!"]],
      },
      {
        type: "talk",
        npc: "gus",
        text: "Talk to Gus",
        lines: [
          ["Gus the Bartender", "Morgan's partner is Rattlesnake Rhodes. Runs a ranch west of town."],
          ["Gus the Bartender", "Half the gang's guns come through his barn. Shut him down and Crowe bleeds."],
        ],
      },
    ],
    reward: { money: 180, xp: 280 },
  },

  /* ------------------------------------------------------------ 6 */
  {
    id: 6,
    name: "Wanted: Dead or Alive",
    location: "Rhodes Ranch",
    brief: "Rattlesnake Rhodes is worth $800 to the county. Fight through his ranch hands, corner him in his barn and claim his double-barrel shotgun.",
    theme: "afternoon",
    wanted: { name: "Rattlesnake Rhodes", bounty: 800 },
    unlock: "shotgun",
    build(B) {
      ranch(B);
      B.crate(20, -25, 1.1);
    },
    start: [0, 40, 0],
    npcs: [],
    objects: [{ id: "chest", kind: "chest", x: 22.5, z: -25.6, wid: "shotgun" }],
    groups: {
      g1: [g("bandit", -6, 8), g("bandit", 6, 2), g("bandit", -16, -10), g("shotgunner", -2, -8), g("bandit", 14, 10), g("bandit", -22, 4), g("gunslinger", 4, -16)],
      boss: [
        g("boss", 18, -21, { name: "Rattlesnake Rhodes", boss: { hp: 480, specials: ["fan"] }, hold: false }),
        g("gunslinger", 14, -20),
        g("gunslinger", 22, -18),
      ],
    },
    steps: [
      { type: "reach", at: [0, 26], r: 4, text: "Approach the Rhodes ranch", say: [[ELI, "Rhodes' ranch. Every window's got a rifle in it."]] },
      { type: "kill", groups: ["g1"], text: "Clear out Rhodes' ranch hands" },
      {
        type: "kill",
        groups: ["boss"],
        boss: "Rattlesnake Rhodes",
        text: "Defeat Rattlesnake Rhodes",
        hint: "When a boss flashes red he's about to fan his hammer — get behind cover or dodge with Q.",
        say: [["Rattlesnake Rhodes", "Nobody walks onto my land and walks off it!"]],
      },
      {
        type: "interact",
        ids: ["chest"],
        text: "Take the Double-Barrel Shotgun from Rhodes' chest",
        verb: "Open chest",
        hold: 0.6,
        give: "shotgun",
        doneSay: [[ELI, "A double-barrel. That'll even the odds up close. (Press 2 to switch.)"]],
      },
    ],
    reward: { money: 260, xp: 400 },
  },

  /* ------------------------------------------------------------ 7 */
  {
    id: 7,
    name: "Lead Rain",
    location: "Red Mesa Stockyard",
    brief: "Rustlers are stealing the town's cattle shipment. Use the crates for cover, push through the stockyard and hold out until the herd is loaded.",
    theme: "afternoon",
    build(B) {
      stockyard(B);
    },
    start: [0, 33, 0],
    npcs: [],
    objects: [],
    groups: {
      g1: [g("bandit", -3, 6), g("bandit", 6, 2), g("gunslinger", 0, -10), g("bandit", -10, -2), g("shotgunner", 10, -4), g("gunslinger", -6, -18), g("bandit", 12, -18)],
      w1: [g("bandit", -12, -28, { alert: true }), g("bandit", 0, -28, { alert: true }), g("gunslinger", 6, -26, { alert: true })],
      w2: [g("bandit", -32, 14, { alert: true }), g("shotgunner", -32, 4, { alert: true }), g("bandit", -32, -12, { alert: true })],
      w3: [g("gunslinger", 32, 20, { alert: true }), g("bandit", 32, -2, { alert: true }), g("shotgunner", 32, 12, { alert: true })],
    },
    steps: [
      {
        type: "kill",
        groups: ["g1"],
        text: "Push through the stockyard",
        hint: "Press C near a crate to crouch behind it. Enemies can't hit what they can't see.",
        say: [[HALE, "Rustlers in the stockyard! Use those crates, Eli — they've got numbers."]],
      },
      { type: "survive", time: 45, waves: [[0, "w1"], [14, "w2"], [28, "w3"]], text: "Hold the stockyard while the cattle are loaded" },
      { type: "kill", groups: ["w1", "w2", "w3"], text: "Finish off the rustlers" },
    ],
    reward: { money: 260, xp: 420 },
  },

  /* ------------------------------------------------------------ 8 */
  {
    id: 8,
    name: "Sheriff's Last Stand",
    location: "Red Mesa · Jailhouse",
    brief: "Hale has Bull Hackett behind bars, and the Crowe gang is coming to break him out. Defend the jailhouse until the cavalry arrives.",
    theme: "dusk",
    wanted: { name: "Jeb Hackett", bounty: 900 },
    build(B) {
      town(B);
      B.sandbags(5, -29, 3.4, "z");
      B.sandbags(5, -39, 3.4, "z");
      B.wagon(-2, -34, "z", true);
      B.crate(2, -22, 1.2, 2);
      B.crate(-4, -44, 1.2);
      B.sandbags(0, -26, 4);
      B.barrel(3, -42);
    },
    start: [6, -34, 180],
    pickups: [["tonic", 4, -24], ["ammo", 4, -44]],
    npcs: [{ id: "hale", name: HALE, look: "sheriff", x: 7.2, z: -33.2, rot: -90 }],
    objects: [{ id: "jail", kind: "jail", x: 13.6, z: -34, hp: 650, r: 6 }],
    groups: {
      w1: [g("bandit", -2, 40, { siege: true, alert: true }), g("bandit", 3, 42, { siege: true, alert: true }), g("gunslinger", 0, 46, { siege: true, alert: true })],
      w2: [g("bandit", -30, -26, { siege: true, alert: true }), g("bandit", -30, -14, { siege: true, alert: true }), g("shotgunner", -30, -20, { siege: true, alert: true })],
      w3: [g("gunslinger", -9, -48, { siege: true, alert: true }), g("bandit", 9, -48, { siege: true, alert: true }), g("bandit", 30, -18, { siege: true, alert: true })],
      w4: [g("bandit", -3, 44, { siege: true, alert: true }), g("shotgunner", 3, 44, { siege: true, alert: true }), g("gunslinger", 30, -2, { siege: true, alert: true })],
      boss: [g("boss", 0, 40, { name: "Jeb Hackett", boss: { hp: 520, specials: ["fan", "dynamite"] }, alert: true }), g("gunslinger", -4, 42, { alert: true }), g("gunslinger", 4, 42, { alert: true })],
    },
    steps: [
      {
        type: "talk",
        npc: "hale",
        text: "Talk to Sheriff Hale",
        lines: [
          [HALE, "We caught Bull Hackett. Crowe will come for him tonight."],
          [HALE, "The cavalry's an hour out. We hold this jail till then — whatever it takes."],
        ],
      },
      { type: "defend", obj: "jail", time: 75, waves: [[0, "w1"], [16, "w2"], [34, "w3"], [52, "w4"]], text: "Defend the jailhouse", hint: "Raiders shoot at the jail. Keep them busy — they target you once you're close." },
      {
        type: "kill",
        groups: ["boss", "w1", "w2", "w3", "w4"],
        boss: "Jeb Hackett",
        text: "Defeat Jeb Hackett",
        say: [["Jeb Hackett", "Give me my brother, Sheriff, or I'll burn this town to cinders!"]],
      },
    ],
    reward: { money: 300, xp: 480 },
  },

  /* ------------------------------------------------------------ 9 */
  {
    id: 9,
    name: "Desert Camp",
    location: "Vulture Flats",
    brief: "The gang's supply camp lies out in the desert. Silence the sentries, plant dynamite on their supply wagons and clear the camp.",
    theme: "dusk",
    build(B) {
      desertCamp(B);
      B.wagon(-22, -16, "z");
      B.wagon(22, -16, "z");
      B.wagon(0, -36, "x");
    },
    start: [0, 44, 0],
    npcs: [],
    objects: [
      { id: "d1", kind: "dynamite", x: -20.4, z: -16, wagon: [-22, -16] },
      { id: "d2", kind: "dynamite", x: 20.4, z: -16, wagon: [22, -16] },
      { id: "d3", kind: "dynamite", x: 0, z: -34.4, wagon: [0, -36] },
    ],
    spawn: ["g1"],
    groups: {
      g0: [g("bandit", -12, 14, { patrol: [[-12, 14], [-20, 4], [-12, -2]] }), g("bandit", 10, 12, { patrol: [[10, 12], [18, 0]] }), g("bandit", 0, 2, { rot: 180, patrol: [[0, 2], [0, 10]] })],
      g1: [g("bandit", -6, -12), g("bandit", 6, -14), g("shotgunner", -14, -22), g("bandit", 14, -22), g("marksman", 0, -28, { hold: true }), g("bandit", -24, -10), g("gunslinger", 24, -8), g("shotgunner", 4, -30)],
    },
    steps: [
      {
        type: "kill",
        groups: ["g0"],
        text: "Take out the camp sentries",
        hint: "Sneak up behind an unaware sentry and press E for a silent takedown. Crouching (C) keeps you hidden longer.",
        say: [[ELI, "Three sentries. If I keep it quiet, the camp won't know I'm here."]],
      },
      { type: "interact", ids: ["d1", "d2", "d3"], text: "Plant dynamite on the supply wagons", verb: "Plant dynamite", hold: 1.2, blast: true },
      { type: "kill", groups: ["g1"], text: "Clear the bandit camp" },
    ],
    reward: { money: 300, xp: 500 },
  },

  /* ------------------------------------------------------------ 10 */
  {
    id: 10,
    name: "Canyon Ambush",
    location: "Deadman's Canyon",
    brief: "The only way to the mining country runs through Deadman's Canyon — and the gang has marksmen on every bend. Grab the rifle and fight your way through.",
    theme: "afternoon",
    unlock: "rifle",
    build(B) {
      canyon(B);
      B.crate(-1, 75, 1.1);
    },
    start: [0, 79, 0],
    npcs: [],
    objects: [{ id: "rifle", kind: "weapon", wid: "rifle", x: -1, z: 75, y: 1.15 }],
    groups: {
      g1: [g("bandit", -2, 50), g("bandit", 4, 46), g("bandit", -4, 38), g("marksman", 3, 26, { hold: true }), g("marksman", -1, 22, { hold: true })],
      g2: [g("gunslinger", -4, 4), g("gunslinger", 4, 0), g("shotgunner", -1, -6), g("marksman", -4, -24, { hold: true }), g("marksman", 5, -20, { hold: true }), g("bandit", 2, 8)],
      g3: [g("bandit", -3, -40), g("bandit", 3, -44), g("shotgunner", -4, -50), g("gunslinger", 0, -52), g("marksman", 4, -66, { hold: true }), g("marksman", -2, -70, { hold: true })],
    },
    steps: [
      { type: "interact", ids: ["rifle"], text: "Pick up the Lever-Action Rifle", verb: "Take rifle", hold: 0.3, give: "rifle", hint: "Press 3 for the rifle. Aiming with right click zooms in for long shots." },
      { type: "kill", groups: ["g1"], text: "Survive the first ambush", say: [[ELI, "Glint on the rocks ahead — marksmen. Stay low."]] },
      { type: "kill", groups: ["g2"], text: "Break the second ambush" },
      { type: "kill", groups: ["g3"], text: "Clear the canyon's north end" },
      { type: "reach", at: [0, -76], r: 4, text: "Reach the canyon exit" },
    ],
    reward: { money: 320, xp: 540 },
  },

  /* ------------------------------------------------------------ 11 */
  {
    id: 11,
    name: "Riders of the Red Sands",
    location: "The Red Sands",
    brief: "The Silver Creek stagecoach lost a wheel in open desert, and mounted raiders are circling. Protect the coach until old Pete gets it rolling.",
    theme: "noon",
    build(B) {
      openDesert(B);
      B.solid("coach", 0, -1, 2.4, 5, 2.6);
      B.crate(-4, 3, 1.1);
      B.crate(3.6, -6, 1.1);
      B.barrel(4, 4);
      B.sandbags(-6, -8, 3.4);
      B.sandbags(6, 8, 3.4);
      B.sandbags(-7, 6, 3, "z");
      B.sandbags(7, -5, 3, "z");
      B.crate(-2.5, -9, 1.1);
    },
    start: [-3, 6, 0],
    npcs: [{ id: "pete", name: "Old Pete", look: "townsman", x: 2.2, z: 3.4, rot: 200 }],
    pickups: [["tonic", -2.5, 4.5], ["tonic", 2.8, -7.5], ["ammo", -3.5, -6], ["ammo", 3, 6.5]],
    objects: [{ id: "coach", kind: "coach", x: 0, z: -1, hp: 600, r: 4 }],
    groups: {
      w1: [g("rider", 0, -50, { alert: true, siege: true }), g("rider", -12, -50, { alert: true, siege: true }), g("rider", 12, -50, { alert: true, siege: true })],
      w2: [g("bandit", 54, 4, { alert: true, siege: true }), g("bandit", 54, -6, { alert: true, siege: true }), g("gunslinger", 54, 12, { alert: true, siege: true }), g("bandit", 54, -14, { alert: true, siege: true })],
      w3: [g("rider", -54, 10, { alert: true, siege: true }), g("rider", -54, -10, { alert: true, siege: true })],
      w4: [g("gunslinger", -6, 56, { alert: true, siege: true }), g("bandit", 6, 56, { alert: true, siege: true }), g("rider", 20, 56, { alert: true, siege: true })],
    },
    steps: [
      {
        type: "talk",
        npc: "pete",
        text: "Talk to Old Pete",
        lines: [
          ["Old Pete", "Busted wheel, and riders on the horizon. Just my luck."],
          ["Old Pete", "Give me a minute and a half, and keep those devils off my coach!"],
        ],
      },
      { type: "defend", obj: "coach", time: 75, waves: [[0, "w1"], [18, "w2"], [36, "w3"], [54, "w4"]], text: "Protect the stagecoach", hint: "Riders are fast. Lead your shots, or wait for them to turn." },
      { type: "kill", groups: ["w1", "w2", "w3", "w4"], text: "Drive off the last of the raiders" },
    ],
    reward: { money: 340, xp: 560 },
  },

  /* ------------------------------------------------------------ 12 */
  {
    id: 12,
    name: "The Coyote's Den",
    location: "Coyote Mesa",
    brief: "Coyote Kate hasn't lost a duel in eleven years. Clear her camp on the mesa, walk beneath the stone arch, and face her as the sun goes down.",
    theme: "sunset",
    wanted: { name: "Coyote Kate", bounty: 1200 },
    build(B) {
      mesa(B);
    },
    start: [0, 42, 0],
    npcs: [],
    objects: [],
    groups: {
      g1: [g("bandit", -6, 24), g("bandit", 6, 22), g("shotgunner", -14, 18), g("shotgunner", 14, 14), g("marksman", -24, 1, { hold: true }), g("marksman", 24, -3, { hold: true }), g("bandit", 0, 14)],
      g2: [g("gunslinger", -10, -6, { alert: true }), g("gunslinger", 10, -10, { alert: true }), g("gunslinger", 0, -8, { alert: true }), g("marksman", -30, -24, { hold: true, alert: true }), g("marksman", 30, -28, { hold: true, alert: true })],
    },
    steps: [
      { type: "kill", groups: ["g1"], text: "Clear Coyote Kate's camp", say: [["Coyote Kate", "Another bounty hunter? My boys will send you home in a box."]] },
      { type: "kill", groups: ["g2"], text: "Defeat Kate's personal guard" },
      { type: "reach", at: [0, -12], r: 3, text: "Walk beneath the stone arch", say: [["Coyote Kate", "Nobody's outdrawn me in eleven years, cowboy. Step up."]] },
      {
        type: "duel",
        foe: { name: "Coyote Kate", look: "kate", reaction: 0.88 },
        at: [0, -12],
        foeAt: [0, -30],
        text: "Duel: outdraw Coyote Kate",
      },
    ],
    reward: { money: 380, xp: 620 },
  },

  /* ------------------------------------------------------------ 13 */
  {
    id: 13,
    name: "Silver Creek",
    location: "Silver Creek Mining Camp",
    brief: "The Crowe gang has seized Silver Creek and taken miners hostage. Clear the guards, free the captives and fight off the reinforcements from the mine.",
    theme: "afternoon",
    build(B) {
      miningTown(B);
    },
    start: [0, 40, 0],
    npcs: [{ id: "martha", name: "Martha Doyle", look: "townswoman", x: 4, z: 37, rot: 200 }],
    objects: [
      { id: "h1", kind: "hostage", x: -21, z: -24, rot: 90 },
      { id: "h2", kind: "hostage", x: 23, z: -26, rot: -90 },
      { id: "h3", kind: "hostage", x: -25, z: 14, rot: 90 },
    ],
    spawn: ["g2"],
    groups: {
      g1: [g("bandit", -4, 20), g("bandit", 5, 16), g("gunslinger", -8, 6), g("bandit", 8, 2), g("elite", 0, -6), g("gunslinger", -12, -12), g("bandit", 12, -14)],
      g2: [g("bandit", -22, -22), g("shotgunner", 21, -24), g("bandit", -23, 16)],
      g3: [g("shotgunner", -3, -38, { alert: true }), g("shotgunner", 3, -38, { alert: true }), g("elite", 0, -36, { alert: true }), g("elite", -6, -34, { alert: true }), g("marksman", 10, -30, { alert: true, hold: true })],
    },
    steps: [
      {
        type: "talk",
        npc: "martha",
        text: "Talk to Martha Doyle",
        lines: [
          ["Martha Doyle", "Thank God, a lawman! They took my Patrick and two other miners."],
          ["Martha Doyle", "They're tied up in the shacks. Please — bring them home."],
        ],
      },
      { type: "kill", groups: ["g1"], text: "Clear the guards from Silver Creek", hint: "Elite gunmen wear red sashes. They take more hits and use cover well." },
      { type: "interact", ids: ["h1", "h2", "h3"], text: "Free the captive miners", verb: "Untie", hold: 1.0 },
      { type: "kill", groups: ["g3"], text: "Fight off the reinforcements from the mine", say: [["Patrick Doyle", "More of 'em coming out of the mine! The foreman's in there — Iron Brannigan!"]] },
    ],
    reward: { money: 400, xp: 660 },
  },

  /* ------------------------------------------------------------ 14 */
  {
    id: 14,
    name: "Into the Mine",
    location: "Silver Creek Mine",
    brief: "Iron Brannigan runs the gang's silver operation from deep inside the mine. Fight through the tunnels, raid the gang's weapon stash and bring the brute down.",
    theme: "mine",
    wanted: { name: "Iron Brannigan", bounty: 1500 },
    unlock: "dual",
    build(B) {
      mineTunnel(B);
      B.crate(-27, 15, 1.1);
    },
    start: [0, 38, 0],
    npcs: [],
    objects: [{ id: "dual", kind: "weapon", wid: "dual", x: -27, z: 15, y: 1.15 }],
    spawn: ["g2"],
    groups: {
      g1: [g("bandit", -1, 28), g("bandit", 2, 20), g("shotgunner", -10, 12), g("bandit", 10, 10)],
      g2: [g("elite", -24, 10), g("elite", -26, 16)],
      g3: [g("gunslinger", 0, -2, { alert: true }), g("gunslinger", -2, -10, { alert: true }), g("shotgunner", 16, 0, { alert: true }), g("gunslinger", 16, -10, { alert: true }), g("shotgunner", 2, -12, { alert: true })],
      boss: [g("bossBrute", 0, -34, { name: "Iron Brannigan", boss: { hp: 900, specials: ["charge", "slam"] } }), g("brawler", -8, -30), g("brawler", 8, -30)],
    },
    steps: [
      { type: "kill", groups: ["g1"], text: "Fight through the mine tunnels" },
      { type: "interact", ids: ["dual"], text: "Take the Dual Revolvers from the gang's stash", verb: "Take revolvers", hold: 0.3, give: "dual", hint: "Press 4 for Dual Revolvers. Hold the trigger to fan both guns." },
      { type: "kill", groups: ["g2", "g3"], text: "Clear the deep tunnels" },
      {
        type: "kill",
        groups: ["boss"],
        boss: "Iron Brannigan",
        text: "Defeat Iron Brannigan",
        hint: "When Brannigan lowers his head he charges — dodge sideways with Q.",
        say: [["Iron Brannigan", "I broke rocks with these hands for twenty years. You're next."]],
      },
    ],
    reward: { money: 440, xp: 720 },
  },

  /* ------------------------------------------------------------ 15 */
  {
    id: 15,
    name: "Station Siege",
    location: "Dry Gulch Station",
    brief: "The 5:15 carries the silver payroll, and the Crowe gang means to take it. Hold Dry Gulch Station until the train arrives, then face Deacon Shaw.",
    theme: "afternoon",
    wanted: { name: "Deacon Shaw", bounty: 1600 },
    build(B) {
      station(B);
      B.sandbags(-4, -4, 3);
      B.sandbags(6, -4, 3);
    },
    start: [0, 16, 0],
    npcs: [{ id: "bell", name: "Stationmaster Bell", look: "conductor", x: 2, z: -5, rot: 180 }],
    pickups: [["tonic", -6, -3], ["ammo", 8, -3], ["tonic", 14, 12]],
    objects: [],
    groups: {
      w1: [g("bandit", -48, -10, { alert: true }), g("bandit", -48, -4, { alert: true }), g("gunslinger", -48, 2, { alert: true })],
      w2: [g("gunslinger", 48, -10, { alert: true }), g("shotgunner", 48, -4, { alert: true }), g("bandit", 48, 2, { alert: true })],
      w3: [g("elite", -10, -29, { alert: true }), g("bandit", 0, -29, { alert: true }), g("marksman", 14, -29, { alert: true, hold: true }), g("bandit", 22, -29, { alert: true })],
      w4: [g("elite", -48, 18, { alert: true }), g("shotgunner", 48, 20, { alert: true }), g("gunslinger", -40, 26, { alert: true }), g("gunslinger", 40, 26, { alert: true })],
      boss: [g("boss", 0, -29, { name: "Deacon Shaw", boss: { hp: 760, specials: ["fan", "dynamite"] }, alert: true }), g("elite", -8, -29, { alert: true }), g("elite", 8, -29, { alert: true })],
    },
    steps: [
      {
        type: "talk",
        npc: "bell",
        text: "Talk to Stationmaster Bell",
        lines: [
          ["Stationmaster Bell", "The 5:15 carries the silver payroll for half the territory."],
          ["Stationmaster Bell", "Hold the platform till she pulls in. I'll be under the counter."],
        ],
      },
      { type: "survive", time: 80, waves: [[0, "w1"], [18, "w2"], [38, "w3"], [58, "w4"]], text: "Hold the station until the train arrives" },
      {
        type: "kill",
        groups: ["boss", "w1", "w2", "w3", "w4"],
        boss: "Deacon Shaw",
        text: "Defeat Deacon Shaw",
        train: true,
        say: [["Deacon Shaw", "The Lord giveth, and the Deacon taketh away. Hand over that payroll."]],
      },
    ],
    reward: { money: 460, xp: 760 },
  },

  /* ------------------------------------------------------------ 16 */
  {
    id: 16,
    name: "The Iron Horse",
    location: "The Silver Line",
    brief: "The gang stopped the payroll train in the hills. Fight car by car along the tracks, recover the strongbox and secure the locomotive.",
    theme: "afternoon",
    build(B) {
      B.bounds(-64, -24, 64, 24);
      B.L.floor = "dirt";
      B.rails(-64, 0, 64, 0);
      const cars = [[-52, "loco"], [-38, "box"], [-23, "pass"], [-8, "box"], [7, "flat"], [22, "box"], [37, "pass"], [52, "box"]];
      for (const [x, car] of cars) B.trainCar(x, 0, car === "loco" ? 13 : 12.4, "x", car);
      for (const [x, z, w, d, h] of [[-44, 12, 4, 3, 1.6], [-30, -11, 3, 2.4, 1.3], [-16, 13, 3.4, 2.6, 1.5], [0, -12, 4, 3, 1.4], [14, 11, 3, 2.4, 1.2], [28, -13, 3, 3, 1.6], [44, 12, 4, 3, 1.5], [54, -12, 3, 2.4, 1.3], [-56, -14, 3, 3, 1.4], [-6, 15, 2.6, 2, 1.2]]) B.rock(x, z, w, d, h, 0);
      B.cliff(0, 22, 128, 4, 9, 0);
      B.cliff(0, -22, 128, 4, 9, 0);
      for (const [x, z, s] of [[48, 6, 1], [34, -6, 2], [18, 6, 1], [-12, -6, 1], [-34, 6, 2], [-46, -6, 1]]) B.crate(x, z, 1.1, s);
      B.cacti([[60, 16], [-60, 16], [20, -17], [-20, 17]]);
    },
    start: [60, 8, 90],
    npcs: [],
    objects: [{ id: "box", kind: "strongbox", x: -23, z: 2.1 }],
    groups: {
      g1: [g("bandit", 44, 6), g("bandit", 40, -6), g("gunslinger", 30, 5), g("shotgunner", 26, -5), g("bandit", 50, -6), g("marksman", 14, 4, { hold: true })],
      g2: [g("elite", 4, 6), g("gunslinger", 0, -6), g("bandit", -6, 6), g("elite", -12, -5), g("marksman", -20, -6, { hold: true }), g("shotgunner", 12, -4)],
      g3: [g("elite", -32, 5, { alert: true }), g("elite", -40, -5, { alert: true }), g("shotgunner", -46, 6, { alert: true }), g("gunslinger", -56, -5, { alert: true }), g("marksman", -58, 8, { alert: true, hold: true })],
    },
    steps: [
      { type: "kill", groups: ["g1"], text: "Clear the rear cars", say: [[ELI, "They've stopped the train. Gaps between the cars — careful, they can shoot through."]] },
      { type: "kill", groups: ["g2"], text: "Fight along the train" },
      { type: "interact", ids: ["box"], text: "Recover the payroll strongbox", verb: "Recover strongbox", hold: 1.0 },
      { type: "kill", groups: ["g3"], text: "Secure the locomotive" },
      { type: "reach", at: [-52, 4.5], r: 3, text: "Climb up to the locomotive cab" },
    ],
    reward: { money: 480, xp: 800 },
  },

  /* ------------------------------------------------------------ 17 */
  {
    id: 17,
    name: "Devil's Rock",
    location: "Devil's Rock Hideout",
    brief: "You've found the Crowe gang's hideout. Silence the lookouts, blow the gate and defeat Crowe's three lieutenants inside the fort.",
    theme: "dusk",
    build(B) {
      fort(B);
    },
    start: [0, 50, 0],
    npcs: [],
    objects: [
      { id: "gate", kind: "dynamite", x: 0, z: 29.8, wagon: null, gate: true },
      { id: "map", kind: "maptable", x: 0, z: -21.6 },
    ],
    groups: {
      g1: [g("bandit", -8, 36), g("bandit", 10, 34), g("marksman", -24, 31, { hold: true }), g("marksman", 24, 31, { hold: true }), g("gunslinger", 0, 33)],
      g2: [g("bandit", -6, 18), g("gunslinger", 6, 14), g("shotgunner", -12, 6, { alert: true }), g("elite", 10, 4), g("bandit", -20, 10), g("gunslinger", 20, 8), g("elite", 0, 8), g("shotgunner", 4, 20, { alert: true })],
      g3: [
        g("elite", -16, -12, { name: "Mad Dog Pike", boss: { hp: 300, specials: ["fan"] }, alert: true }),
        g("elite", 16, -12, { name: "Hatchet Grey", boss: { hp: 300, specials: ["dynamite"] }, alert: true }),
        g("elite", 0, -20, { name: "Belle Starling", boss: { hp: 300, specials: ["fan"] }, alert: true }),
      ],
    },
    steps: [
      { type: "kill", groups: ["g1"], text: "Take out the lookouts outside the fort" },
      { type: "interact", ids: ["gate"], text: "Blow open the fort gate", verb: "Plant dynamite", hold: 1.2, blast: true },
      { type: "kill", groups: ["g2"], text: "Storm the fort" },
      { type: "kill", groups: ["g3"], boss: "Crowe's Lieutenants", text: "Defeat Crowe's three lieutenants", say: [["Belle Starling", "You've made a lot of enemies, Eli Hart. Time to meet three more."]] },
      {
        type: "interact",
        ids: ["map"],
        text: "Search Crowe's map table",
        verb: "Search",
        hold: 0.6,
        doneSay: [[ELI, "Crowe's at his hacienda by the border. And he's left the Varga twins waiting for me on Boot Hill."]],
      },
    ],
    reward: { money: 520, xp: 860 },
  },

  /* ------------------------------------------------------------ 18 */
  {
    id: 18,
    name: "Blood Moon Duel",
    location: "Boot Hill",
    brief: "Under a blood-red moon, the Varga twins wait for you among the graves. Survive the ambush, then beat both brothers in back-to-back duels.",
    theme: "night",
    wanted: { name: "The Varga Twins", bounty: 2000 },
    build(B) {
      bootHill(B);
    },
    start: [0, 36, 0],
    npcs: [],
    objects: [],
    groups: {
      g1: [g("gunslinger", -6, 20), g("elite", 6, 14), g("bandit", -12, 10), g("shotgunner", 10, 4), g("gunslinger", -4, 2), g("marksman", 0, -30, { hold: true })],
      g2: [g("elite", -20, -24, { alert: true }), g("gunslinger", 20, -26, { alert: true }), g("shotgunner", -14, -30, { alert: true }), g("elite", 14, -32, { alert: true }), g("gunslinger", 0, -36, { alert: true })],
    },
    steps: [
      { type: "kill", groups: ["g1"], text: "Survive the ambush in the ghost town", say: [["Dante Varga", "Welcome to Boot Hill, Hart. We saved you a plot."]] },
      { type: "reach", at: [0, 4], r: 3, text: "Step into the moonlight", say: [["Dante Varga", "Brother, this one is mine."]] },
      { type: "duel", foe: { name: "Dante Varga", look: "twin", reaction: 0.82 }, at: [0, 4], foeAt: [0, -14], text: "Duel: outdraw Dante Varga" },
      { type: "kill", groups: ["g2"], text: "Fight off Diego's gunmen", say: [["Diego Varga", "Dante! You'll pay for that — kill him, boys!"]] },
      { type: "reach", at: [0, 4], r: 3, text: "Face Diego Varga", say: [["Diego Varga", "Enough. Just you and me, Hart. For my brother."]] },
      { type: "duel", foe: { name: "Diego Varga", look: "twin", reaction: 0.76 }, at: [0, 4], foeAt: [0, -14], text: "Duel: outdraw Diego Varga" },
    ],
    reward: { money: 560, xp: 900 },
  },

  /* ------------------------------------------------------------ 19 */
  {
    id: 19,
    name: "Red Mesa Burns",
    location: "Red Mesa",
    brief: "While you were away, the Crowe gang set Red Mesa on fire. Rescue the trapped townsfolk and take down Crowe's enforcer, Red Jack Malone.",
    theme: "burning",
    wanted: { name: "Red Jack Malone", bounty: 2200 },
    build(B) {
      town(B);
      for (const [x, z, s] of [[-13.6, -22, 1.4], [13.6, -6, 1.2], [-13.6, 24, 1.3], [13.6, 37, 1.1], [-13.6, -36, 1], [13.6, 23, 1]]) B.fire(x, z, s);
      B.wagon(-3, 0, "x", true);
      B.wagon(3, -24, "z", true);
      B.crate(-4, 14, 1.2, 2);
      B.crate(4, 20, 1.2);
      B.sandbags(-1, 32, 4);
      B.barrel(5, 6);
    },
    start: [0, -40, 180],
    npcs: [{ id: "hale", name: HALE, look: "sheriff", x: 3, z: -38, rot: 180 }],
    objects: [
      { id: "t1", kind: "hostage", x: -20, z: -24, rot: 90, look: "townswoman" },
      { id: "t2", kind: "hostage", x: 20, z: -12, rot: -90, look: "townsman" },
      { id: "t3", kind: "hostage", x: -20, z: 22, rot: 90, look: "townsman" },
      { id: "t4", kind: "hostage", x: 20, z: 32, rot: -90, look: "townswoman" },
    ],
    spawn: ["g1"],
    groups: {
      g1: [g("bandit", -4, -20), g("gunslinger", 4, -12), g("shotgunner", -19, -20), g("bandit", 19, -8), g("elite", 0, 6), g("bandit", -19, 18), g("gunslinger", 19, 28), g("shotgunner", 4, 24), g("bandit", -5, 30), g("marksman", 0, 42, { hold: true })],
      boss: [g("boss", 0, 12, { name: "Red Jack Malone", boss: { hp: 820, specials: ["fan", "dynamite"] }, alert: true }), g("elite", -5, 16, { alert: true }), g("elite", 5, 16, { alert: true }), g("gunslinger", 0, 20, { alert: true })],
    },
    steps: [
      { type: "interact", ids: ["t1", "t2", "t3", "t4"], text: "Rescue the trapped townsfolk", verb: "Untie", hold: 1.0, say: [[HALE, "They're burning the town! Save whoever you can, Eli — I'll get the bucket line going!"]] },
      { type: "kill", groups: ["boss", "g1"], boss: "Red Jack Malone", text: "Defeat Red Jack Malone", say: [["Red Jack Malone", "Crowe said to leave nothing standing. That includes you."]] },
      {
        type: "talk",
        npc: "hale",
        text: "Talk to Sheriff Hale",
        npcAt: { hale: [3, 2] },
        lines: [
          [HALE, "The fires are out. The town will rebuild — it always does."],
          [HALE, "Crowe's waiting at his hacienda south of here. End this, Eli. For all of us."],
        ],
      },
    ],
    reward: { money: 600, xp: 950 },
  },

  /* ------------------------------------------------------------ 20 */
  {
    id: 20,
    name: "Legend of the Frontier",
    location: "Crowe Hacienda",
    brief: "The final showdown. Storm Silas Crowe's hacienda, break his last gang, defeat the outlaw king — and finish it with one last duel at sunset.",
    theme: "sunset",
    wanted: { name: "Silas Crowe", bounty: 5000 },
    final: true,
    build(B) {
      hacienda(B);
    },
    start: [0, 50, 0],
    npcs: [],
    objects: [],
    pickups: [["tonic", 0, 44], ["ammo", 2, 44], ["tonic", -2, -2], ["ammo", 2, -2], ["tonic", 0, -18]],
    groups: {
      g1: [g("bandit", -6, 30), g("gunslinger", 6, 28), g("shotgunner", -10, 18), g("elite", 10, 16), g("marksman", -24, 30, { hold: true }), g("marksman", 24, 30, { hold: true }), g("gunslinger", 0, 6), g("bandit", -12, 4)],
      g2: [g("elite", -6, -12, { alert: true }), g("elite", 6, -14, { alert: true }), g("shotgunner", -16, -18, { alert: true }), g("shotgunner", 16, -18, { alert: true }), g("marksman", 0, -44, { hold: true, alert: true }), g("gunslinger", -10, -26, { alert: true })],
      boss: [g("boss", 0, -36, { name: "Silas Crowe", boss: { hp: 950, specials: ["fan", "dynamite", "summon"] }, alert: true })],
      adds: [g("elite", -20, -48, { alert: true }), g("gunslinger", 20, -48, { alert: true }), g("bandit", 0, -52, { alert: true })],
    },
    steps: [
      { type: "kill", groups: ["g1"], text: "Storm the hacienda courtyard", say: [["Silas Crowe", "So the drifter finally came. Kill him, and every man here gets a share of the silver!"]] },
      { type: "kill", groups: ["g2"], text: "Break through to the back field" },
      {
        type: "kill",
        groups: ["boss", "adds"],
        later: ["adds"],
        boss: "Silas Crowe",
        text: "Defeat Silas Crowe",
        hint: "Crowe throws dynamite — watch for the fizzing fuse and roll clear with Q.",
        say: [["Silas Crowe", "I built this frontier with blood and silver. You think one drifter can take it from me?"]],
      },
      {
        type: "duel",
        foe: { name: "Silas Crowe", look: "boss", reaction: 0.72 },
        at: [0, -22],
        foeAt: [0, -40],
        text: "Final duel: outdraw Silas Crowe",
        say: [["Silas Crowe", "Not like this... Face me like a gunslinger, Hart. One last draw."]],
      },
    ],
    reward: { money: 800, xp: 1200 },
  },
];

export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

/** Build a mission's layout (fresh object every call). */
export function buildMission(m) {
  const themeName = m.theme;
  const B = createLayout(themeName);
  m.build(B);
  return B.L;
}

export const THEME_LABEL = {
  noon: "High noon",
  morning: "Morning",
  afternoon: "Afternoon",
  sunset: "Sunset",
  dusk: "Dusk",
  night: "Blood moon",
  burning: "Burning",
  interior: "Indoors",
  mine: "Underground",
};
