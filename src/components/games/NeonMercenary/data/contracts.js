/**
 * The 20 story contracts. Each is a list of steps run by engine/missions.js.
 *
 * Step types
 *   talk      {npc, dialogue}                       talk to an NPC
 *   deliver   {npc, item, n?, dialogue}             hand quest items to an NPC
 *   scene     {dialogue}                            radio / cut-in dialogue
 *   cinematic {scene}                               camera sequence
 *   goto      {at, r}                               travel (only where travel IS the objective)
 *   door      {door}                                use a door / hatch / elevator
 *   kill      {spawn}                               defeat everything spawned by this step
 *   collect   {item, need, pickups, spawn}          pick up quest items (some carried by enemies)
 *   objects   {targets, order?}                     interact with every target (hold E; hack = faster with hacking power)
 *   hack      {target, tier}                        breach-protocol minigame on a terminal
 *   defend    {at, r, duration, waves, protect?}    stay in range while a process runs
 *   search    {clues}                               find clues inside search areas, one after another
 *   boss      {boss, at, arena}
 *   choice    {}                                    the ending decision
 *
 * Common step fields: text (HUD objective), spawn (enemies), say/dialogue on
 * enter, stealth (fail if any enemy goes into combat), timer (fail when it
 * runs out), triggers (area → spawn ambush), zones / vents (hazards),
 * cameras, checkpoint (retry restarts here), retryAt, flag (set on enter),
 * open (gate ids opened on enter), give (stacks on enter).
 *
 * Spawn entries: {t: enemy type, at: [x,z], route?, hold?, alert?, drop?, yaw?}
 */
const G = (t, x, z, o = {}) => ({ t, at: [x, z], ...o });

export const CONTRACTS = [
  /* ===================================================================== NEON MARKET */
  {
    id: 1, key: "firstBlood", title: "First Blood", district: "market", giver: "Juno Vale", location: "Noodle Nan's stall, Lantern Street",
    brief: "Red Fang thugs are shaking down Noodle Nan. Make them leave.",
    rewards: { xp: 160, credits: 300, stacks: { medkit: 2 } },
    start: "c1_start",
    steps: [
      { type: "talk", npc: "juno", dialogue: "c1_juno", text: "Meet Juno at The Switchboard" },
      { type: "kill", text: "Drive off the Red Fang thugs at Noodle Nan's stall", checkpoint: true, retryAt: { x: -2, z: -16, yaw: -2.4 },
        spawn: [G("gangFighter", -21, -1, { yaw: 3.1 }), G("gangFighter", -16.5, 1, { yaw: 3.1 }), G("gangFighter", -19, 3.5, { yaw: 3.1 })] },
      { type: "talk", npc: "nan", dialogue: "c1_end", text: "Check on Noodle Nan" },
    ],
  },
  {
    id: 2, key: "missingPackage", title: "Missing Package", district: "market", giver: "Kenji Oduya", location: "Red Fang alleys",
    brief: "The Fangs stole Kenji's prototype optics. Find the stash and bring the package back.",
    rewards: { xp: 220, credits: 450, stacks: { scrap: 3 } },
    start: "c2_start",
    steps: [
      { type: "talk", npc: "kenji", dialogue: "c2_kenji", text: "Talk to Kenji at his gun shop" },
      { type: "talk", npc: "pip", dialogue: "c2_pip", text: "Ask Pip about Red Fang stashes" },
      { type: "kill", text: "Clear the Red Fang stash", checkpoint: true, retryAt: { x: -14, z: -10, yaw: 3.1 },
        spawn: [G("gangGunner", -28, -26, { yaw: 1.6 }), G("gangGunner", -17, -26.5, { yaw: -1.6 }), G("gangGunner", -14, -30, { yaw: 0 }), G("gangFighter", -14, -21, { yaw: 3.1 })] },
      { type: "collect", item: "package", need: 1, text: "Recover the optics package", pickups: [{ item: "package", at: [-20.4, -25.2] }] },
      { type: "deliver", npc: "kenji", item: "package", dialogue: "c2_end", text: "Return the package to Kenji" },
    ],
  },
  {
    id: 3, key: "streetSweep", title: "Street Sweep", district: "market", giver: "Juno Vale", location: "Red Fang alleys (west)",
    brief: "Clear the gang-controlled alley and disable the jammer blinding police drones.",
    rewards: { xp: 300, credits: 600, stacks: { trauma: 1 } },
    start: "c3_start",
    steps: [
      { type: "kill", text: "Clear the Red Fang alley", checkpoint: true, retryAt: { x: -26, z: -4, yaw: 3.6 },
        spawn: [G("gangFighter", -46, -30), G("gangFighter", -38, -14), G("gangGunner", -50, -34), G("gangGunner", -30, -20), G("gangGunner", -46, -22), G("gangGunner", -56, -10), G("gangGunner", -34, -34), G("gangHeavy", -36, -30)] },
      { type: "objects", text: "Disable the signal jammer and search the crates",
        targets: [{ id: "jammer", at: [-54, -20.8], label: "Disable the signal jammer", hold: 2.5, hack: true }, { id: "hdCrates", at: [-50, -22], label: "Examine the stencilled crates", hold: 1, dialogue: "c3_clue" }] },
      { type: "scene", dialogue: "c3_end" },
    ],
  },
  {
    id: 4, key: "dataRunner", title: "Data Runner", district: "market", giver: "Doc Silas Rhee", location: "Rhee's clinic → relay plaza dead-drop",
    brief: "Carry an encrypted shard to a dead-drop before its key rotates.",
    rewards: { xp: 320, credits: 700, stacks: { battery: 2 } },
    start: "c4_start",
    steps: [
      { type: "talk", npc: "rhee", dialogue: "c4_rhee", text: "Pick up the shard from Doc Rhee", give: null, after: { give: { shard: 1 } } },
      { type: "objects", text: "Deliver the shard to the dead-drop", timer: 95, checkpoint: true, retryAt: { x: -8, z: 14, yaw: 1.6 }, retryGive: { shard: 1 },
        targets: [{ id: "deadDrop", at: [56, 43.2], label: "Deposit the data shard", hold: 1.2, take: { shard: 1 } }],
        triggers: [{ area: [22, 10, 62, 58], say: ["Kade", "Ambush! They knew I was coming."], spawn: [G("gangGunner", 32, 30, { alert: true }), G("gangGunner", 40, 22, { alert: true }), G("gangGunner", 50, 40, { alert: true }), G("gangFighter", 30, 44, { alert: true }), G("gangFighter", 46, 53, { alert: true })] }] },
      { type: "scene", dialogue: "c4_end" },
    ],
  },
  {
    id: 5, key: "silentEntry", title: "Silent Entry", district: "market", giver: "Juno Vale", location: "Lotus counting house (north-east)",
    brief: "Infiltrate the guarded counting house and download the Red Fang ledger without raising the alarm.",
    rewards: { xp: 420, credits: 900, stacks: { circuit: 2 } },
    start: "c5_start",
    steps: [
      { type: "goto", at: [16, -38], r: 4, text: "Reach the Lotus compound entrance" },
      { type: "objects", text: "Download the ledger — stay undetected", stealth: true, checkpoint: true, retryAt: { x: 14, z: -38, yaw: 1.57 }, dialogue: "c5_brief",
        spawn: [
          G("gangGunner", 25.5, -56, { route: [[25.5, -57], [25.5, -19]] }),
          G("gangFighter", 40, -58, { route: [[36, -58], [58, -58]] }),
          G("gangGunner", 46, -21, { route: [[40, -21], [58, -21], [58, -32]] }),
          G("gangGunner", 41, -37, { route: [[41, -37.5], [54, -37.5]] }),
          G("gangFighter", 52.5, -29, { yaw: 0, hold: true }),
          G("gangGunner", 39.6, -44, { route: [[39.6, -43], [39.6, -52], [50, -52.5]] }),
        ],
        targets: [{ id: "lotusTerminal", at: [53.4, -51], label: "Download the Red Fang ledger", hold: 4, hack: true, give: { ledger: 1 } }] },
      { type: "goto", at: [15, -38], r: 3.5, text: "Slip out of the compound unseen", stealth: true },
      { type: "scene", dialogue: "c5_end" },
    ],
    cleanup: ["ledger"],
  },
  {
    id: 6, key: "brokenSignal", title: "Broken Signal", district: "market", giver: "Pip", location: "Lantern Street relay (relay plaza)",
    brief: "Find three fuses and repair the communications relay while the Fangs try to stop you.",
    rewards: { xp: 450, credits: 950, stacks: { scrap: 4 } },
    start: "c6_start",
    steps: [
      { type: "collect", item: "fuse", need: 3, text: "Find the relay fuses", dialogue: "c6_brief",
        pickups: [{ item: "fuse", at: [58, 14.5] }, { item: "fuse", at: [33.1, 50], y: 3.3 }],
        spawn: [G("gangHeavy", 30, -4.5, { route: [[30, -4.5], [56, -4.5], [56, 4], [30, 4]], drop: "fuse" }), G("gangGunner", 40, 3, { route: [[34, 4], [54, 4]] })] },
      { type: "objects", text: "Install the fuses in the relay console", targets: [{ id: "relayConsole", at: [49, 38.4], y: 2.4, label: "Install relay fuses", hold: 2, take: { fuse: 3 } }] },
      { type: "defend", text: "Hold the relay while the repair uplink runs", at: [49, 36], y: 2.4, r: 8, duration: 30, label: "Relay repair", checkpoint: true, retryAt: { x: 39, z: 34, yaw: 1.57 },
        waves: [
          { t: 1, spawn: [G("gangGunner", 28, 30, { alert: true }), G("gangGunner", 30, 44, { alert: true }), G("gangFighter", 34, 16, { alert: true })] },
          { t: 10, spawn: [G("gangFighter", 56, 52, { alert: true }), G("gangFighter", 28, 52, { alert: true }), G("gangGunner", 58, 20, { alert: true })] },
          { t: 19, spawn: [G("gangHeavy", 30, 22, { alert: true }), G("gangGunner", 40, 52, { alert: true }), G("gangGunner", 26, 38, { alert: true })] },
        ] },
      { type: "scene", dialogue: "c6_end" },
    ],
  },
  {
    id: 7, key: "razorsFall", title: "Razor's Fall", district: "market", giver: "Juno Vale", location: "Red Fang hideout (north-west)",
    brief: "Storm the Red Fang hideout and take down their leader, Razor.",
    rewards: { xp: 600, credits: 1200, stacks: { medkit: 2 } },
    start: "c7_start",
    unlock: "industrial",
    steps: [
      { type: "goto", at: [-48, -33.5], r: 3.5, text: "Reach the Red Fang hideout gate" },
      { type: "kill", text: "Break into the hideout", open: ["hideoutGate"], checkpoint: true, retryAt: { x: -48, z: -32, yaw: Math.PI },
        spawn: [G("gangGunner", -56, -46, { alert: true }), G("gangGunner", -40, -48, { alert: true }), G("gangFighter", -48, -46, { alert: true }), G("gangHeavy", -44, -56, { alert: true })] },
      { type: "boss", boss: "razor", at: [-48, -53], arena: { x0: -60, z0: -60, x1: -36, z1: -40 }, text: "Defeat Razor", checkpoint: true, retryAt: { x: -48, z: -42, yaw: Math.PI } },
      { type: "scene", dialogue: "c7_end" },
    ],
  },
  /* ===================================================================== INDUSTRIAL SECTOR */
  {
    id: 8, key: "factoryShutdown", title: "Factory Shutdown", district: "industrial", giver: "Juno Vale", location: "Kessler Foundry floor (north-west)",
    brief: "The foundry's assembly units have gone rogue. Override all four while their drones attack.",
    rewards: { xp: 520, credits: 1000, stacks: { circuit: 2 } },
    start: "c8_start",
    steps: [
      { type: "goto", at: [-44, -18], r: 5, text: "Enter the Kessler Foundry" },
      { type: "objects", text: "Override the rogue assembly units", checkpoint: true, retryAt: { x: -44, z: -16, yaw: Math.PI },
        spawn: [G("secBot", -40, -30), G("secBot", -46, -48), G("drone", -42, -40)],
        targets: [
          { id: "mach1", at: [-52, -48.6], label: "Override assembly unit A", hold: 3, hack: true, spawner: { type: "drone", every: 11, max: 2 } },
          { id: "mach2", at: [-32, -48.6], label: "Override assembly unit B", hold: 3, hack: true, spawner: { type: "drone", every: 11, max: 2 } },
          { id: "mach3", at: [-52, -32.6], label: "Override assembly unit C", hold: 3, hack: true, spawner: { type: "secBot", every: 16, max: 1 } },
          { id: "mach4", at: [-32, -32.6], label: "Override assembly unit D", hold: 3, hack: true, spawner: { type: "drone", every: 11, max: 2 } },
        ] },
      { type: "scene", dialogue: "c8_end" },
    ],
  },
  {
    id: 9, key: "lostShipment", title: "Lost Shipment", district: "industrial", giver: "Juno Vale", location: "Container yard (north-east)",
    brief: "Find container HD-0447 using the yard manifests and recover its cargo core.",
    rewards: { xp: 560, credits: 1100, stacks: { scrap: 4, circuit: 1 } },
    start: "c9_start",
    steps: [
      { type: "objects", text: "Check the yard manifest terminals",
        spawn: [G("secBot", 30, -44, { route: [[24, -44], [58, -44]] }), G("drone", 44, -36, { route: [[30, -36], [56, -36], [56, -52], [30, -52]] })],
        targets: [
          { id: "man1", at: [23.8, -24], label: "Check manifest terminal", hold: 1.5, note: "Manifest 1/3: 'HD-0447 — re-routed, ROW C'." },
          { id: "man2", at: [40, -26.2], label: "Check manifest terminal", hold: 1.5, note: "Manifest 2/3: 'HD-0447 — BAY 4, flagged LIVE CARGO'." },
          { id: "man3", at: [57.6, -44], label: "Check manifest terminal", hold: 1.5, note: "Manifest 3/3: 'HD-0447 — scrubbed from the public record'." },
        ] },
      { type: "objects", text: "Open container HD-0447", dialogue: "c9_found", targets: [{ id: "hd0447", at: [40, -47.4], label: "Cut the seal on HD-0447", hold: 3 }] },
      { type: "cinematic", scene: "c9_pods" },
      { type: "objects", text: "Take the cargo core", targets: [{ id: "core", at: [40, -47.4], label: "Take the cargo core", hold: 1, give: { manifest: 1 } }] },
      { type: "kill", text: "Survive the Sentinel ambush", checkpoint: true, retryAt: { x: 40, z: -44, yaw: 0 }, retryGive: { manifest: 1 },
        spawn: [G("secBot", 26, -44, { alert: true }), G("secBot", 54, -44, { alert: true }), G("secBot", 40, -30, { alert: true }), G("drone", 30, -56, { alert: true }), G("drone", 52, -56, { alert: true })] },
      { type: "deliver", npc: "ozzy", item: "manifest", dialogue: "c9_end", text: "Bring the cargo core to Ozzy at the station" },
    ],
  },
  {
    id: 10, key: "securityBreach", title: "Security Breach", district: "industrial", giver: "Juno Vale", location: "Restricted annex checkpoint (north)",
    brief: "Break through the security checkpoint and breach the protected terminal in the restricted annex.",
    rewards: { xp: 600, credits: 1200, stacks: { circuit: 2 } },
    start: "c10_start",
    steps: [
      { type: "kill", text: "Neutralise the checkpoint security", checkpoint: true, retryAt: { x: 0, z: 6, yaw: Math.PI },
        spawn: [G("secBot", -6, -13, { hold: true, yaw: Math.PI * 0 }), G("secBot", 6, -9, { hold: true }), G("gangHeavy", 0, -14, { hold: true }), G("drone", 0, -10, { route: [[-12, -10], [12, -10]] })] },
      { type: "objects", text: "Open the checkpoint gate", targets: [{ id: "gateCtl", at: [5.6, -13], label: "Override the gate controls", hold: 2, hack: true }] },
      { type: "hack", text: "Breach the protected terminal", open: ["restrictedGate"], target: { id: "protTerm", at: [0, -33.4], label: "Breach the protected terminal" }, tier: 2, checkpoint: true, retryAt: { x: 0, z: -22, yaw: Math.PI },
        spawn: [G("secBot", -8, -30), G("secBot", 8, -30), G("drone", 0, -44, { route: [[-12, -44], [12, -44]] })],
        alarm: [G("drone", -12, -40, { alert: true }), G("drone", 12, -40, { alert: true })], give: null, after: { give: { accessKey: 1 } } },
      { type: "scene", dialogue: "c10_end" },
    ],
    cleanup: ["accessKey"],
  },
  {
    id: 11, key: "steelPatrol", title: "Steel Patrol", district: "industrial", giver: "Ozzy Kane", location: "Main road, yards and warehouses",
    brief: "Three rogue Sentinel squads are shooting civilians. Destroy every unit.",
    rewards: { xp: 650, credits: 1300, stacks: { circuit: 3 } },
    start: "c11_start",
    flags: ["steelPatrol"],
    steps: [
      { type: "kill", text: "Destroy the rogue Sentinel squads", marker: "enemies", checkpoint: true, retryAt: { x: 0, z: 44, yaw: Math.PI },
        spawn: [
          G("secBot", -50, -4, { route: [[-56, -8], [-26, -8], [-26, 4], [-56, 4]] }), G("secBot", -48, -2, { route: [[-56, -8], [-26, -8], [-26, 4], [-56, 4]] }), G("secBot", -52, 2, { route: [[-26, 4], [-56, 4], [-56, -8], [-26, -8]] }), G("drone", -40, 0, { route: [[-56, 0], [-26, 0]] }),
          G("secBot", 30, 12, { route: [[28, 12], [56, 12], [56, 36], [28, 36]] }), G("secBot", 34, 12, { route: [[28, 12], [56, 12], [56, 36], [28, 36]] }), G("secBot", 52, 34, { route: [[56, 36], [28, 36], [28, 12], [56, 12]] }), G("drone", 44, 26, { route: [[30, 26], [56, 26]] }),
          G("secBot", 26, -44, { route: [[24, -44], [58, -44]] }), G("secBot", 58, -44, { route: [[58, -44], [24, -44]] }), G("secBot", 40, -36, { route: [[24, -36], [58, -36]] }), G("drone", 40, -50, { route: [[30, -54], [56, -54]] }),
        ] },
    ],
  },
  {
    id: 12, key: "toxicRoute", title: "Toxic Route", district: "industrial", giver: "Juno Vale", location: "Chemical works (south-west)",
    brief: "Cross the flooded chemical works: close three valves to clear the gas, then engage the pump controls.",
    rewards: { xp: 680, credits: 1350, stacks: { nanofiber: 1, trauma: 1 } },
    start: "c12_start",
    steps: [
      { type: "goto", at: [-40, 9], r: 4, text: "Enter the chemical works" },
      { type: "objects", text: "Close the three drain valves", order: true, checkpoint: true, retryAt: { x: -40, z: 6, yaw: 0 }, dialogue: "c12_brief",
        zones: [
          { id: "z1", x0: -44, z0: 17, x1: -36, z1: 27, dps: 22, clear: "valve1" },
          { id: "z2", x0: -44, z0: 31, x1: -36, z1: 43, dps: 22, clear: "valve2" },
          { id: "z3", x0: -52, z0: 45, x1: -42, z1: 58, dps: 22, clear: "valve3" },
        ],
        vents: [{ x: -42, z: 22, r: 2.1, period: 4.6, off: 0 }, { x: -38, z: 22, r: 2.1, period: 4.6, off: 2.3 }, { x: -40, z: 36, r: 2.3, period: 4.2, off: 1 }, { x: -40, z: 41, r: 2.1, period: 4.2, off: 3 }, { x: -36, z: 48, r: 2.2, period: 5, off: 1.5 }],
        spawn: [G("drone", -40, 30, { route: [[-40, 16], [-40, 42]] }), G("drone", -30, 52, { route: [[-36, 48], [-22, 56]] }), G("secBot", -24, 48, { hold: true, yaw: -1.6 })],
        targets: [
          { id: "valve1", at: [-41.6, 14.5], label: "Close valve 1", hold: 2.5 },
          { id: "valve2", at: [-38.4, 29], label: "Close valve 2", hold: 2.5 },
          { id: "valve3", at: [-30, 49.5], label: "Close valve 3", hold: 2.5 },
        ] },
      { type: "objects", text: "Engage the pump controls", spawn: [G("secBot", -46, 52, { alert: false, hold: true, yaw: 1.6 })], targets: [{ id: "pumpCtl", at: [-55.8, 52], label: "Engage the pump controls", hold: 3 }] },
      { type: "scene", dialogue: "c12_end" },
    ],
  },
  {
    id: 13, key: "undergroundAccess", title: "Underground Access", district: "industrial", giver: "Ozzy Kane", location: "Warehouses → maintenance tunnel",
    brief: "Follow old Benny's trail to the sealed maintenance hatch and descend toward the foundry sublevel.",
    rewards: { xp: 600, credits: 1200, stacks: { medkit: 2 } },
    start: "c13_start",
    steps: [
      { type: "search", text: "Search for Benny's trail",
        clues: [
          { id: "clue1", at: [29.8, 16.6], area: [32, 18], r: 9, label: "Read the shift log", dialogue: "c13_c1", hint: "Search the loading dock" },
          { id: "clue2", at: [14, 0.5], area: [10, -2], r: 9, label: "Examine the drag marks", dialogue: "c13_c2", hint: "Look for drag marks along the north road" },
          { id: "clue3", at: [48, 36.2], area: [46, 40], r: 9, label: "Read the maintenance log", dialogue: "c13_c3", hint: "Search behind the warehouses", flag: "hatchFound" },
        ] },
      { type: "door", door: "tunnelHatch", text: "Open Hatch 9 and descend", marker: [54, 50] },
      { type: "goto", at: [-14.5, 119], r: 4, text: "Follow the tunnel to the foundry chamber", checkpoint: true, retryAt: { x: 0, z: 74, yaw: 0 },
        spawn: [G("secBot", 0, 88, { hold: true, yaw: Math.PI }), G("drone", 0, 96, { route: [[0, 80], [0, 98], [-14, 102]] }), G("secBot", -15, 101, { hold: true, yaw: 1.6 }), G("secBot", -15, 112, { hold: true, yaw: Math.PI }), G("drone", -14, 116, { route: [[-14, 106], [-14, 120]] })] },
      { type: "scene", dialogue: "c13_end" },
    ],
  },
  {
    id: 14, key: "ironjawProtocol", title: "Ironjaw Protocol", district: "industrial", giver: "Juno Vale", location: "Foundry sublevel chamber",
    brief: "Destroy IRONJAW, Halcyon's strongest CHOIR subject.",
    rewards: { xp: 800, credits: 1600, stacks: { trauma: 1 } },
    start: "c14_start",
    unlock: "corporate",
    steps: [
      { type: "goto", at: [0, 125], r: 5, text: "Enter the foundry chamber", marker: [0, 125] },
      { type: "boss", boss: "ironjaw", at: [0, 147], arena: { x0: -21, z0: 122, x1: 21, z1: 155 }, text: "Destroy Ironjaw", checkpoint: true, retryAt: { x: -14.5, z: 117, yaw: 0 } },
      { type: "scene", dialogue: "c14_end" },
    ],
  },
  /* ===================================================================== CORPORATE DISTRICT */
  {
    id: 15, key: "corporateEspionage", title: "Corporate Espionage", district: "corporate", giver: "Dr. Lena Sato", location: "Halcyon Annex offices (west)",
    brief: "Steal Halcyon's confidential CHOIR dossiers from three office terminals.",
    rewards: { xp: 700, credits: 1500, stacks: { nanofiber: 1 } },
    start: "c15_start",
    steps: [
      { type: "talk", npc: "lena", dialogue: "c15_lena", text: "Meet Dr. Lena Sato in Concord Plaza" },
      { type: "objects", text: "Download the CHOIR dossiers", checkpoint: true, retryAt: { x: -24, z: -30, yaw: -1.57 },
        spawn: [G("corpSoldier", -40, -30, { route: [[-48, -30], [-37, -30], [-37, -25]] }), G("corpSoldier", -50, -44, { route: [[-52, -42], [-40, -42], [-36, -52]] }), G("eliteGuard", -36, -36, { hold: true, yaw: Math.PI / 2 }), G("corpSoldier", -26, -26, { route: [[-26, -22], [-26, -34]] }), G("drone", -44, -12, { route: [[-56, -10], [-30, -10]] })],
        targets: [
          { id: "off1", at: [-54.4, -24], label: "Download dossier", hold: 3, hack: true, give: { dossier: 1 } },
          { id: "off2", at: [-54.4, -52], label: "Download dossier", hold: 3, hack: true, give: { dossier: 1 } },
          { id: "off3", at: [-33, -52.4], label: "Download dossier", hold: 3, hack: true, give: { dossier: 1 } },
        ] },
      { type: "deliver", npc: "lena", item: "dossier", n: 3, dialogue: "c15_end", text: "Bring the dossiers to Lena" },
    ],
  },
  {
    id: 16, key: "ghostNetwork", title: "Ghost Network", district: "corporate", giver: "Dr. Lena Sato", location: "Surveillance nodes across the district",
    brief: "Disable four surveillance nodes. Their cameras will call drones if they spot you.",
    rewards: { xp: 760, credits: 1600, stacks: { circuit: 3 } },
    start: "c16_start",
    flags: ["towerOpen"],
    steps: [
      { type: "objects", text: "Disable the surveillance nodes", checkpoint: true, retryAt: { x: 0, z: 30, yaw: Math.PI },
        cameras: [{ x: -44, z: -6, y: 4, yaw: 0, sweep: 1.1, range: 16 }, { x: 44, z: -10, y: 4, yaw: 0, sweep: 1.1, range: 16 }, { x: 32, z: 46, y: 4, yaw: Math.PI, sweep: 1.0, range: 15 }, { x: -32, z: 46, y: 4, yaw: Math.PI, sweep: 1.0, range: 15 }],
        alarm: [G("drone", 0, 0, { alert: true }), G("drone", 0, 0, { alert: true })],
        spawn: [G("corpSoldier", -46, 6, { hold: true, yaw: 0 }), G("corpSoldier", -40, -4, { hold: true, yaw: 1.6 }), G("corpSoldier", 46, 2, { hold: true, yaw: Math.PI }), G("eliteGuard", 40, -8, { hold: true, yaw: -1.6 }), G("corpSoldier", 34, 36, { hold: true, yaw: -1.6 }), G("drone", 32, 44, { route: [[28, 40], [38, 40]] }), G("corpSoldier", -34, 36, { hold: true, yaw: 1.6 }), G("eliteGuard", -28, 44, { hold: true, yaw: 1.6 })],
        targets: [
          { id: "node1", at: [-44, 1.6], label: "Disable surveillance node", hold: 3, hack: true },
          { id: "node2", at: [44, -2.4], label: "Disable surveillance node", hold: 3, hack: true },
          { id: "node3", at: [32, 41.6], label: "Disable surveillance node", hold: 3, hack: true },
          { id: "node4", at: [-32, 41.6], label: "Disable surveillance node", hold: 3, hack: true },
        ] },
      { type: "scene", dialogue: "c16_end" },
    ],
  },
  {
    id: 17, key: "highSecurity", title: "High Security", district: "corporate", giver: "Dr. Lena Sato", location: "Halcyon Tower",
    brief: "Get through the Tower lobby lockdown and take the executive floor.",
    rewards: { xp: 820, credits: 1800, stacks: { trauma: 1 } },
    start: "c17_start",
    flags: ["roofOpen"],
    steps: [
      { type: "door", door: "towerDoor", text: "Enter Halcyon Tower" },
      { type: "kill", text: "Clear the lobby security", checkpoint: true, retryAt: { x: 100, z: 6, yaw: Math.PI },
        spawn: [G("corpSoldier", 92, -14, { alert: true }), G("corpSoldier", 108, -14, { alert: true }), G("corpSoldier", 100, -20), G("eliteGuard", 100, -24, { hold: true, yaw: 0 })] },
      { type: "objects", text: "Release the three lockdown terminals", checkpoint: true, retryAt: { x: 100, z: 4, yaw: Math.PI },
        targets: [
          { id: "lock1", at: [84.4, -10], label: "Release lock terminal", hold: 3, hack: true, spawnOnDone: [G("corpSoldier", 100, 6, { alert: true }), G("corpSoldier", 104, 6, { alert: true })] },
          { id: "lock2", at: [115.6, -10], label: "Release lock terminal", hold: 3, hack: true, spawnOnDone: [G("eliteGuard", 96, 6, { alert: true })] },
          { id: "lock3", at: [100, -25.8], label: "Release lock terminal", hold: 3, hack: true },
        ], after: { flag: "liftOpen" } },
      { type: "door", door: "lobbyLift", text: "Ride the executive elevator" },
      { type: "kill", text: "Take the executive floor", checkpoint: true, retryAt: { x: 100, z: 23, yaw: 0 },
        spawn: [G("eliteGuard", 92, 44, { alert: false, hold: true, yaw: 0.5 }), G("eliteGuard", 108, 44, { hold: true, yaw: -0.5 }), G("corpSoldier", 104, 36), G("corpSoldier", 86, 30, { route: [[86, 28], [114, 28]] })] },
      { type: "objects", text: "Access the executive terminal", targets: [{ id: "execTerm", at: [100, 52.2], label: "Access the executive terminal", hold: 3, hack: true, dialogue: "c17_exec" }] },
      { type: "scene", dialogue: "c17_end" },
    ],
  },
  {
    id: 18, key: "specterHunt", title: "Specter Hunt", district: "corporate", giver: "Dr. Lena Sato", location: "Halcyon Tower roof",
    brief: "Defeat Specter-9 — and break her CHOIR implant.",
    rewards: { xp: 900, credits: 2000, stacks: { trauma: 2 } },
    start: "c18_start",
    steps: [
      { type: "door", door: "execUp", text: "Reach the Tower roof", marker: "door" },
      { type: "boss", boss: "specter", at: [102, 98], arena: { x0: 81, z0: 67, x1: 123, z1: 109 }, text: "Defeat Specter-9", checkpoint: true, retryAt: { x: 102, z: 69, yaw: 0 } },
      { type: "scene", dialogue: "c18_end" },
    ],
  },
  {
    id: 19, key: "finalTransmission", title: "Final Transmission", district: "corporate", giver: "Dr. Lena Sato", location: "Halcyon research labs (east)",
    brief: "Recover the CHOIR research logs and protect Lena while she uploads the evidence.",
    rewards: { xp: 950, credits: 2200, stacks: { quantum: 1 } },
    start: "c19_start",
    flags: ["dcOpen"],
    steps: [
      { type: "goto", at: [27, -34], r: 3.5, text: "Get into the research labs" },
      { type: "objects", text: "Copy the CHOIR research logs", checkpoint: true, retryAt: { x: 24, z: -34, yaw: -1.57 },
        spawn: [G("corpSoldier", 36, -30, { route: [[34, -30], [52, -30]] }), G("corpSoldier", 50, -36, { hold: true, yaw: -1.6 }), G("eliteGuard", 50, -50, { hold: true, yaw: -1.6 }), G("corpSoldier", 36, -50, { route: [[34, -44], [34, -54], [42, -54]] })],
        targets: [
          { id: "arch1", at: [34.2, -52], label: "Copy research log", hold: 3, hack: true, give: { choirLog: 1 } },
          { id: "arch2", at: [52, -54.4], label: "Copy research log", hold: 3, hack: true, give: { choirLog: 1 } },
          { id: "arch3", at: [54.8, -44], label: "Copy research log", hold: 3, hack: true, give: { choirLog: 1 } },
        ] },
      { type: "defend", text: "Protect Lena while she uploads the evidence", at: [38, -46], r: 9, duration: 45, label: "Evidence upload", dialogue: "c19_upload", protect: { npc: "lena", at: [39.6, -46.4], hp: 320 }, checkpoint: true, retryAt: { x: 36, z: -42, yaw: 0 }, retryGive: { choirLog: 3 },
        waves: [
          { t: 2, spawn: [G("corpSoldier", 32, -26, { alert: true }), G("corpSoldier", 26, -34, { alert: true })] },
          { t: 13, spawn: [G("eliteGuard", 54, -28, { alert: true }), G("drone", 26, -30, { alert: true })] },
          { t: 25, spawn: [G("corpSoldier", 26, -34, { alert: true }), G("corpSoldier", 34, -24, { alert: true }), G("drone", 50, -26, { alert: true })] },
          { t: 35, spawn: [G("eliteGuard", 26, -34, { alert: true })] },
        ] },
      { type: "cinematic", scene: "c19_reveal" },
      { type: "scene", dialogue: "c19_end" },
    ],
    cleanup: ["choirLog", "dossier"],
  },
  {
    id: 20, key: "lastContract", title: "The Last Contract", district: "corporate", giver: "Juno Vale", location: "Data centre beneath Concord Plaza",
    brief: "Descend into the data centre and stop Director Vex before CHOIR goes live.",
    rewards: { xp: 1000, credits: 3000, stacks: {} },
    start: "c20_start",
    steps: [
      { type: "door", door: "dcElevator", text: "Take the service elevator to the data centre" },
      { type: "kill", text: "Fight through the server halls", checkpoint: true, retryAt: { x: -102, z: -26, yaw: 0 },
        spawn: [G("corpSoldier", -102, -10, { hold: true, yaw: Math.PI }), G("corpSoldier", -116, 10, { alert: false, route: [[-120, 4], [-120, 18], [-92, 18]] }), G("eliteGuard", -86, 10, { hold: true, yaw: -1.6 }), G("drone", -100, 12, { route: [[-118, 11], [-86, 11]] }), G("eliteGuard", -102, 22, { hold: true, yaw: Math.PI }), G("corpSoldier", -94, 4, { hold: true, yaw: 2.6 }), G("drone", -110, 18, { route: [[-118, 18], [-86, 4]] })] },
      { type: "goto", at: [-102, 25], r: 3, text: "Enter the CHOIR core chamber" },
      { type: "scene", dialogue: "c20_vex" },
      { type: "boss", boss: "vex", at: [-102, 42], arena: { x0: -122, z0: 28, x1: -82, z1: 60 }, text: "Stop Director Vex", checkpoint: true, retryAt: { x: -102, z: 27, yaw: 0 } },
      { type: "cinematic", scene: "ending" },
      { type: "choice", text: "Decide what to do with the CHOIR files" },
    ],
  },
];

export const CONTRACT_BY_ID = Object.fromEntries(CONTRACTS.map((c) => [c.id, c]));
