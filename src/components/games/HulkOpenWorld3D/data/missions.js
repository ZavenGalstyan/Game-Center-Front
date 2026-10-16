/**
 * Hulk: Open World 3D — the 20 story missions and the 5 city activities.
 *
 * Positions are written relative to the city's named sites
 * (engine/city.js `sites`) as { s: site, dx, dz } and are snapped to the
 * nearest walkable spot at run time; rooftop chains are resolved from the
 * real buildings. Step types are interpreted by engine/missions.js:
 *   reach · destroyAny · leap · defeat · destroy · protect · defend · waves
 *   convoy · rescue · roofs · boss · smashUse
 * Spawn groups: [type, count, at, opts?]  (types: config.ENEMY)
 */
const at = (s, dx = 0, dz = 0) => ({ s, dx, dz });

export const MISSIONS = [
  {
    id: 1,
    title: "The Awakening",
    district: "downtown",
    xp: 160,
    start: at("plaza", 0, 6),
    brief: "Something big just woke up in City Hall Plaza. Learn to move, smash and leap — then deal with the soldiers sent to contain you.",
    steps: [
      { type: "reach", label: "Walk to the fountain", at: at("plaza", 14, -14), r: 4 },
      { type: "destroyAny", label: "Smash 5 objects (punch benches, lamps, cars)", n: 5 },
      { type: "reach", label: "Hold SPACE to charge a SUPER LEAP onto City Hall's roof", at: at("plazaRoof"), r: 9, minY: 14, roof: true },
      { type: "defeat", label: "Defeat the containment squad", spawn: [["soldier", 3, at("plaza", 0, 18)]] },
    ],
  },
  {
    id: 2,
    title: "First Smash",
    district: "residential",
    xp: 210,
    start: at("resStreet", 0, -30),
    brief: "Soldiers are sweeping Oak Avenue looking for you. Show them what a GROUND SMASH (Q) does to a squad.",
    steps: [
      { type: "defeat", label: "Defeat the first squad", spawn: [["soldier", 3, at("resStreet", 0, 10)]] },
      { type: "smashUse", label: "Hit enemies with a GROUND SMASH (Q)", spawn: [["soldier", 4, at("resStreet", 0, 48)]], n: 2 },
      { type: "defeat", label: "Finish off the squad", spawn: [] },
    ],
  },
  {
    id: 3,
    title: "City Trouble",
    district: "downtown",
    xp: 270,
    start: at("dtEast", -10, -40),
    brief: "A trigger-happy unit is rounding up civilians on Market Street. Keep the civilians alive — they are the targets.",
    fail: { civLost: 3 },
    steps: [
      {
        type: "protect",
        label: "Protect the civilians",
        civs: [[at("dtEast", 4, 6), 3], [at("dtEast", -5, 14), 3]],
        maxLost: 3,
        waves: [
          { delay: 0, spawn: [["soldier", 4, at("dtEast", 0, 46)]] },
          { delay: 14, spawn: [["soldier", 3, at("dtEast", 40, 6)], ["heavy", 1, at("dtEast", 42, 0)]] },
        ],
      },
    ],
  },
  {
    id: 4,
    title: "Robot Patrol",
    district: "industrial",
    xp: 310,
    start: at("indStreet", 0, -20),
    brief: "Combat robots are patrolling the industrial district. Track down all three patrols and scrap them.",
    steps: [
      { type: "defeat", label: "Destroy patrol 1 (Foundry Road)", spawn: [["robot", 2, at("indStreet", 0, 40), { patrol: true }]], marker: at("indStreet", 0, 40) },
      { type: "defeat", label: "Destroy patrol 2 (Dockside Yard)", spawn: [["robot", 3, at("yard"), { patrol: true }]], marker: at("yard") },
      { type: "defeat", label: "Destroy patrol 3 (Canal Works)", spawn: [["robot", 2, at("indNorth", 0, 10), { patrol: true }], ["soldier", 2, at("indNorth", 10, 10)]], marker: at("indNorth", 0, 10) },
    ],
  },
  {
    id: 5,
    title: "Street Defense",
    district: "residential",
    xp: 330,
    start: at("intersectionN", 0, 8),
    brief: "Demolition teams want to plant charges at the Elm Street crossing. Hold the zone — don't let them stand in it.",
    steps: [
      {
        type: "defend",
        label: "Defend Elm Street crossing",
        zone: at("intersectionN"),
        r: 14,
        waves: [
          { delay: 2, spawn: [["soldier", 4, at("intersectionN", 70, 0)]] },
          { delay: 22, spawn: [["soldier", 4, at("intersectionN", -70, 0)], ["heavy", 1, at("intersectionN", -74, 4)]] },
          { delay: 44, spawn: [["soldier", 3, at("intersectionN", 0, 70)], ["robot", 2, at("intersectionN", 4, 74)]] },
        ],
      },
    ],
  },
  {
    id: 6,
    title: "Rooftop Leap",
    district: "downtown",
    xp: 350,
    start: at("dtStreet", 0, 12),
    brief: "Reach the rooftop beacons before time runs out. Snipers are posted up high — leap fast.",
    steps: [{ type: "roofs", label: "Reach the rooftop beacons", near: "dtStreet", n: 6, time: 150, snipers: 3 }],
  },
  {
    id: 7,
    title: "Industrial Chaos",
    district: "industrial",
    xp: 390,
    start: at("yard", -40, 30),
    brief: "The army is fuelling an assault from Dockside Yard. Destroy the fuel tanks and generators — use thrown objects or your fists.",
    steps: [
      {
        type: "destroy",
        label: "Destroy the fuel depot",
        targets: [["fuelTank", at("yard", -12, -10)], ["fuelTank", at("yard", 5, -10)], ["generator", at("yard", -18, 16)], ["generator", at("yard", 6, 20)]],
        spawn: [["soldier", 4, at("yard", 10, 6)], ["robot", 1, at("yard", 20, 20)]],
      },
    ],
  },
  {
    id: 8,
    title: "Break the Barricade",
    district: "military",
    xp: 430,
    start: at("bridge", 0, -20),
    brief: "The military checkpoint at the south end of the east bridge is sealed. Tear down the barricades and storm the gate.",
    steps: [
      { type: "destroy", label: "Destroy the checkpoint barricades", tag: "mainGate", spawn: [["soldier", 4, at("gate", 0, 14)], ["turret", 2, at("gateIn", 0, -4)]], marker: at("gate", 0, 18) },
      { type: "reach", label: "Storm through the gate", at: at("gateIn", 0, 8), r: 8 },
      { type: "defeat", label: "Defeat the checkpoint garrison", spawn: [["soldier", 3, at("gateIn", 14, 16)], ["heavy", 2, at("gateIn", -12, 20)]] },
    ],
  },
  {
    id: 9,
    title: "Heavy Resistance",
    district: "industrial",
    xp: 470,
    start: at("steel", -30, 40),
    brief: "Heavy weapons teams and a Heavy Robot hold the Steelworks. Rockets hurt — keep moving, use cover, close the distance.",
    steps: [
      { type: "defeat", label: "Defeat the heavy weapons teams", spawn: [["heavy", 4, at("steel", 0, -10)], ["soldier", 2, at("steel", 10, 10)]] },
      { type: "defeat", label: "Destroy the Heavy Robot", spawn: [["heavyRobot", 1, at("steel", 6, 0), { aggro: true }]] },
    ],
  },
  {
    id: 10,
    title: "Downtown Battle",
    district: "downtown",
    xp: 530,
    start: at("arena", 0, 0),
    brief: "Liberty Square is a warzone. Survive every wave — the last one rolls in with armour.",
    steps: [
      {
        type: "waves",
        label: "Survive the assault",
        waves: [
          { delay: 2, spawn: [["soldier", 5, at("arena", 0, -40)]] },
          { delay: 0, after: true, spawn: [["soldier", 3, at("arena", 40, 0)], ["heavy", 2, at("arena", -40, 0)], ["robot", 1, at("arena", 0, 40)]] },
          { delay: 0, after: true, spawn: [["apc", 1, at("arena", 0, -60)], ["soldier", 3, at("arena", 30, -40)]] },
        ],
      },
    ],
  },
  {
    id: 11,
    title: "Military Pursuit",
    district: "outskirts",
    xp: 570,
    start: at("outskirtsRoad", -110, 26),
    brief: "An armoured convoy is hauling captured gamma tech to the military zone. Catch it on Old Mill Road and destroy both vehicles before they reach the gate.",
    steps: [{ type: "convoy", label: "Destroy the convoy", from: at("convoyStart"), route: [[3, 771], [190, 771], [380, 771], [570, 771]], n: 2, escorts: [["soldier", 4, at("outskirtsRoad", 80, 0)]] }],
  },
  {
    id: 12,
    title: "Armored Threat",
    district: "military",
    xp: 610,
    start: at("gateIn", 0, 10),
    brief: "The armour depot is fielding APCs and gun turrets. Wreck every one of them.",
    steps: [
      { type: "defeat", label: "Destroy the APCs and turrets", spawn: [["apc", 3, at("depot", 0, 6), { aggro: true }], ["turret", 2, at("depot", 20, -2)], ["soldier", 3, at("depot", -20, 6)]] },
    ],
  },
  {
    id: 13,
    title: "Rescue Mission",
    district: "residential",
    xp: 650,
    start: at("park", 10, 0),
    brief: "Collapsed debris has trapped families around Maple Park and soldiers are moving in. Smash the debris to free them, then cover their run to the park.",
    fail: { civLost: 2 },
    steps: [
      { type: "rescue", label: "Free the trapped civilians", groups: [at("resStreet", 12, -36), at("resStreet", -40, 10), at("resStreet", 30, 40)], per: 2, safe: at("park", 0, 0), maxLost: 2, spawn: [["soldier", 3, at("resStreet", 0, 60)], ["soldier", 2, at("resStreet", 60, 0)]] },
    ],
  },
  {
    id: 14,
    title: "War Machine",
    district: "military",
    xp: 900,
    boss: true,
    start: at("fort", 0, -26),
    brief: "BOSS — The War Machine guards Fort Bastion. Dodge the chaingun sweep, run from the missile circles, and bait its charge into a wall: a stunned or overheating War Machine is wide open.",
    steps: [{ type: "boss", label: "Defeat the War Machine", boss: "warMachine", at: at("fort", 0, 8) }],
  },
  {
    id: 15,
    title: "Factory Assault",
    district: "industrial",
    xp: 770,
    start: at("foundryOut", 0, 26),
    brief: "The robots are being built inside The Foundry. Break through its wall, scrap the production line, and destroy the reactor core.",
    steps: [
      { type: "destroy", label: "Break through the Foundry wall", tag: "foundryWall", spawn: [["soldier", 3, at("foundryOut", 14, 10)]], marker: at("foundryOut", 0, -6) },
      { type: "defeat", label: "Destroy the robots on the factory floor", spawn: [["robot", 4, at("foundryIn", 0, -6)], ["heavyRobot", 1, at("foundryIn", 6, -10)]] },
      { type: "destroy", label: "Destroy the reactor core", tag: "reactor", arm: true },
    ],
  },
  {
    id: 16,
    title: "Iron Colossus",
    district: "industrial",
    xp: 1100,
    boss: true,
    start: at("steel", -10, 30),
    brief: "BOSS — The Iron Colossus. Its hammer slam marks the ground: get out, then JUMP the shockwave ring. While the hammer is stuck it kneels — smash the glowing chest core.",
    steps: [{ type: "boss", label: "Defeat the Iron Colossus", boss: "colossus", at: at("steel", 6, -14) }],
  },
  {
    id: 17,
    title: "City Under Attack",
    district: "downtown",
    xp: 920,
    start: at("dtStreet", 0, 20),
    brief: "Three districts are under attack at once. Leap from hot zone to hot zone and clear each before the timer runs out.",
    steps: [
      { type: "defeat", label: "Clear Downtown crossing", time: 110, spawn: [["soldier", 4, at("dtStreet", 0, -30)], ["heavy", 1, at("dtStreet", 20, -30)]], marker: at("dtStreet") },
      { type: "defeat", label: "Clear Foundry Road", time: 120, spawn: [["robot", 3, at("indStreet", 0, 10)], ["soldier", 2, at("indStreet", 14, 0)]], marker: at("indStreet") },
      { type: "defeat", label: "Clear Oak Avenue", time: 120, spawn: [["soldier", 4, at("resStreet", 0, 20)], ["heavy", 2, at("resStreet", 20, 0)]], marker: at("resStreet") },
    ],
  },
  {
    id: 18,
    title: "Final Defense",
    district: "downtown",
    xp: 1050,
    start: at("plaza", 0, 0),
    brief: "Everything they have left is converging on City Hall. Hold the plaza through four waves.",
    steps: [
      {
        type: "defend",
        label: "Hold City Hall Plaza",
        zone: at("plaza", 0, -4),
        r: 16,
        waves: [
          { delay: 2, spawn: [["soldier", 5, at("plaza", 0, 70)]] },
          { delay: 24, spawn: [["robot", 3, at("plaza", 70, 10)], ["heavy", 2, at("plaza", -70, 10)]] },
          { delay: 50, spawn: [["heavyRobot", 1, at("plaza", 0, 72)], ["soldier", 4, at("plaza", 60, 50)]] },
          { delay: 78, spawn: [["apc", 1, at("plaza", -96, 40)], ["robot", 2, at("plaza", 70, -30)], ["heavy", 2, at("plaza", 0, 80)]] },
        ],
      },
    ],
  },
  {
    id: 19,
    title: "Titan Destroyer",
    district: "outskirts",
    xp: 1500,
    boss: true,
    start: at("titan", 0, 30),
    brief: "BOSS — The Titan Destroyer hides behind an energy shield. Destroy its three shield generators, jump its ground beam, outrun the orbital strikes — and hit the core while it overheats.",
    steps: [{ type: "boss", label: "Defeat the Titan Destroyer", boss: "titan", at: at("titan", 0, -16) }],
  },
  {
    id: 20,
    title: "Ultimate Rage",
    district: "military",
    xp: 2000,
    start: at("fort", 0, -24),
    rageStart: true,
    brief: "One last stand at Fort Bastion: wave after wave, then a rebuilt War Machine. You start fully enraged — use it.",
    steps: [
      {
        type: "waves",
        label: "Survive the onslaught",
        waves: [
          { delay: 1, spawn: [["soldier", 5, at("fort", 0, 20)], ["heavy", 2, at("fort", 20, 20)]] },
          { delay: 0, after: true, spawn: [["robot", 4, at("fort", -24, 10)], ["heavyRobot", 1, at("fort", 24, 10)]] },
          { delay: 0, after: true, spawn: [["apc", 2, at("depot", 0, 6), { aggro: true }], ["heavy", 2, at("fort", 0, 24)], ["robot", 2, at("fort", 20, -10)]] },
        ],
      },
      { type: "boss", label: "Destroy the War Machine Mk II", boss: "warMachine", at: at("fort", 0, 14), hpMul: 0.9, name: "War Machine Mk II" },
    ],
  },
];

export const missionById = (id) => MISSIONS.find((m) => m.id === id);

/** City activities — started in Free Roam by walking into their ring and pressing E. */
export const ACTIVITIES = [
  { id: "destruction", name: "Destruction Challenge", site: at("yard", -20, 20), xp: 220, rules: "Cause as much destruction as you can in 60 seconds. Score 1500 points to win.", target: 1500, time: 60 },
  { id: "longjump", name: "Long-Jump Challenge", site: at("field", -10, 0), xp: 200, rules: "Three super leaps from the launch pad. Land 55 m or further to win.", target: 55, tries: 3 },
  { id: "arena", name: "Combat Arena", site: at("arena", 0, 10), xp: 260, rules: "Survive 90 seconds of escalating waves in Liberty Square. Score 12 defeats to win.", target: 12, time: 90 },
  { id: "rooftop", name: "Rooftop Checkpoint Race", site: at("dtEast", -12, 10), xp: 240, rules: "Hit 6 rooftop checkpoints in 75 seconds.", n: 6, time: 75 },
  { id: "throwing", name: "Vehicle Throwing Challenge", site: at("range", 0, 0), xp: 220, rules: "Five throws from the line at the target rings (30 m, 45 m, 60 m). Score 220 points to win.", target: 220, throws: 5 },
];
