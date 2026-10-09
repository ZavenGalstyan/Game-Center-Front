/**
 * Night Corridor — the ten sections.
 *
 * Each section is pure data: an ASCII map (legend in engine/level.js), a
 * theme, the markers its map uses, chase configurations and a director
 * script of one-shot rules. The engine knows nothing section-specific.
 *
 * Rule conditions (`when`, all must hold):
 *   zone: 'A'            player stands in a cell of marker A
 *   near: ['A', 6]       player within 6 m of marker A's centre
 *   see: 'A'             marker A is on screen and in line of sight
 *   flag / notFlag       game flags (item ids, 'used:B', 'tried:L', 'chased:c1', …)
 *   time: 12             seconds since the section (re)started
 *   after: 'rule', delay seconds after another rule fired
 *   noChase / creatureHidden
 *
 * Event types: OBJECTIVE, MESSAGE, FLAG, CHECKPOINT, LIGHT, DOOR, SOUND,
 * STEPS, FALL, STINGER, SHAKE, RADIO, CREATURE, CHASE, END — each may carry
 * `t` (seconds after the rule fires).
 */

export const SECTIONS = [
  // ===================================================================== 1
  {
    id: 1,
    name: "FIRST LIGHT",
    place: "St. Aldric Hospital — Ward B",
    blurb: "Learn to move, look and use the flashlight. Find a way out of the ward.",
    theme: "hospital",
    objective: "FIND A WAY OUT",
    startHeading: "N",
    map: [
      "######################",
      "####c####..R##########",
      "####N####.x.##########",
      "####o#####D###########",
      "##.XG.x.o.f...AAo..e##",
      "####D#########D#######",
      "###c..#######...######",
      "###.@.#######.K.######",
      "###..f#######..c######",
      "######################",
    ],
    exit: { requires: "key_maint", lockedMsg: "LOCKED — IT NEEDS A KEY", label: "Unlock Door" },
    marks: {
      K: { type: "item", item: "key_maint", name: "Maintenance Key", label: "Pick Up Key", model: "key" },
      R: { type: "radio", label: "Turn Off Radio" },
      G: { type: "point" },
      N: { type: "point" },
      A: { type: "zone" },
    },
    signs: ["WARD B", "EXIT", "MAINTENANCE", "B-12", "QUIET PLEASE", "STAFF ONLY"],
    ambient: { interval: [9, 18], kinds: ["creak", "drip", "vent", "settle", "pipes"] },
    script: [
      { id: "hint", when: { time: 1.2 }, events: [{ type: "MESSAGE", text: "WARD B — 2:47 AM", dur: 3.5 }] },
      { id: "tried", when: { flag: "triedExit" }, events: [{ type: "OBJECTIVE", text: "FIND THE MAINTENANCE KEY" }] },
      { id: "corr", when: { near: ["A", 13] }, events: [{ type: "OBJECTIVE", text: "FIND THE MAINTENANCE KEY" }] },
      // A light stutters as you pass. Nothing happens.
      { id: "flick", when: { near: ["A", 11], notFlag: "key_maint" }, events: [
        { type: "LIGHT", target: "player:5", mode: "flicker", dur: 1.6 },
        { t: 4.5, type: "SOUND", kind: "metal", at: "far:24", vol: 0.8 },
      ] },
      // A radio crackles on in the break room.
      { id: "radio", when: { near: ["R", 6.5] }, events: [{ type: "RADIO", at: "R", dur: 45 }] },
      // A door closes somewhere far away.
      { id: "door", when: { time: 50, notFlag: "key_maint" }, events: [{ type: "SOUND", kind: "distantDoor", at: "far:26" }] },
      // Key in hand: something is waiting where you came from.
      { id: "key", when: { flag: "key_maint" }, events: [
        { type: "OBJECTIVE", text: "RETURN TO THE LOCKED DOOR" },
        { type: "CREATURE", action: "glimpse", path: ["G", "N"], hold: 0, seenHold: 1.1, near: 9, timeout: 30, speed: 1.4,
          then: [{ t: 1.2, type: "SOUND", kind: "distantDoor", at: "N", vol: 1.2 }, { t: 1.4, type: "STINGER", kind: "low" }] },
      ] },
      { id: "dark", when: { flag: "key_maint", near: ["G", 17] }, events: [
        { type: "LIGHT", target: "behind:11", mode: "fail" },
        { t: 0.3, type: "SOUND", kind: "settle", at: "behind:8", vol: 0.8 },
      ] },
    ],
  },

  // ===================================================================== 2
  {
    id: 2,
    name: "FOOTSTEPS",
    place: "St. Aldric Hospital — Service Corridor",
    blurb: "The power is failing. Restore it. Then run.",
    theme: "hospital",
    objective: "RESTORE POWER",
    startHeading: "E",
    map: [
      "################################",
      "##############...###############",
      "##############.F.###############",
      "##############c..###############",
      "###############D################",
      "#.@..o..P.e.f.....B.e..f...D..e#",
      "############M#################.#",
      "###########.C.################.#",
      "###########c..################f#",
      "################w.c###########.#",
      "###############XZ..S.x...f.....#",
      "################..c#############",
      "################################",
    ],
    exit: { label: "Enter Stairwell" },
    marks: {
      F: { type: "item", item: "fuse", name: "Fuse", label: "Pick Up Fuse", model: "fuse" },
      B: { type: "use", model: "fusebox", requires: "fuse", flag: "power", label: "Insert Fuse", needMsg: "THE MAIN FUSE IS MISSING", side: "N" },
      M: { type: "door", locked: "never", lockedMsg: "IT'S JAMMED" },
      S: { type: "door", open: true, style: "security", label: "Safe Room" },
      C: { type: "spawn" },
      Z: { type: "safe" },
      P: { type: "point" },
    },
    lampsOff: ["emergency"],
    signs: ["STAIRS", "SERVICE", "ELECTRICAL", "NO ENTRY", "B-14", "STAFF ONLY"],
    ambient: { interval: [8, 16], kinds: ["creak", "metal", "vent", "pipes", "settle"] },
    chases: {
      c1: { spawn: ["C"], safe: "Z", speed: 3.9, delay: 2.0, lockDoor: "S", objective: "RUN", after: "FIND THE STAIRWELL" },
    },
    script: [
      { id: "fail1", when: { near: ["P", 2.5] }, events: [
        { type: "LIGHT", target: "behind:10", mode: "fail" },
        { t: 1.8, type: "LIGHT", target: "near:P:5", mode: "unstable" },
      ] },
      // Something moves inside the jammed room. Still no monster.
      { id: "steps", when: { near: ["M", 3.2] }, events: [
        { type: "STEPS", path: [{ x: 23, z: 17 }, { x: 27, z: 15 }, { x: 25, z: 14.6 }], speed: 0.9 },
        { t: 3.5, type: "SOUND", kind: "thud", at: "C", vol: 0.8 },
      ] },
      { id: "needfuse", when: { flag: "tried:B" }, events: [{ type: "OBJECTIVE", text: "FIND A FUSE" }] },
      { id: "gotfuse", when: { flag: "fuse" }, events: [{ type: "OBJECTIVE", text: "INSERT THE FUSE" }] },
      // Power returns...
      { id: "power", when: { flag: "power" }, events: [
        { type: "LIGHT", target: "main", mode: "on" },
        { type: "OBJECTIVE", text: "FIND THE STAIRWELL" },
        { t: 3.6, type: "LIGHT", target: "main", mode: "flicker", dur: 0.6 },
        { t: 4.2, type: "FLAG", flag: "blackout" },
      ] },
      // ...and dies. Something is behind you.
      { id: "chase1", when: { flag: "blackout" }, events: [
        { type: "LIGHT", target: "main", mode: "off" },
        { type: "STINGER", kind: "low" },
        { t: 0.5, type: "LIGHT", target: "kind:e", mode: "on" },
        { t: 0.6, type: "CHECKPOINT" },
        { t: 0.8, type: "STEPS", path: ["C", "M"], speed: 1.6 },
        { t: 0.9, type: "CHASE", id: "c1" },
        { t: 2.7, type: "DOOR", target: "M", action: "burst" },
      ] },
      // Safe — it hammers on the door, then walks away.
      { id: "safe1", when: { flag: "chased:c1" }, events: [
        { t: 1.0, type: "DOOR", target: "S", action: "bang" },
        { t: 1.7, type: "DOOR", target: "S", action: "bang" },
        { t: 2.2, type: "DOOR", target: "S", action: "bang" },
        { t: 6.0, type: "STEPS", path: ["S", { x: 61, z: 21 }, { x: 61, z: 11 }], speed: 1.2 },
        { t: 3.0, type: "MESSAGE", text: "IT'S GONE. FOR NOW.", dur: 3 },
      ] },
    ],
  },
  // ===================================================================== 3
  {
    id: 3,
    name: "LOCKED WARD",
    place: "St. Aldric Hospital — Ward D",
    blurb: "Search the patient rooms for the ward key. Something is moving on the other side of the walls.",
    theme: "ward",
    objective: "FIND THE WARD KEY",
    startHeading: "E",
    windows: 0.5,
    map: [
      "##############################",
      "##...####...######...####...##",
      "##.c.####.R.######..c####.f.##",
      "##...####...######...####...##",
      "###A######D#########P#####M###",
      "#@.o.....f...x.....o......e.X#",
      "#..........G.........N.....###",
      "###D######D#########D#####Q###",
      "##...####...######...####...##",
      "##c.c####.K.######...####.c.##",
      "##...####...######.H.####...##",
      "##############################",
    ],
    exit: { requires: "key_ward", lockedMsg: "WARD DOOR — LOCKED", label: "Unlock Ward Door" },
    marks: {
      K: { type: "item", item: "key_ward", name: "Ward Key", label: "Pick Up Ward Key", model: "key" },
      R: { type: "radio", label: "Turn Off Radio" },
      A: { type: "door", label: "Room 210" },
      P: { type: "door", label: "Room 214" },
      M: { type: "door", locked: "never", lockedMsg: "IT WON'T BUDGE", label: "Room 216" },
      Q: { type: "door", open: true, label: "Room 217" },
      G: { type: "point" },
      N: { type: "point" },
    },
    ambient: { interval: [8, 15], kinds: ["creak", "drip", "vent", "settle", "pipes", "metal"] },
    script: [
      { id: "intro", when: { time: 1 }, events: [{ type: "MESSAGE", text: "WARD D — 3:09 AM", dur: 3.5 }] },
      { id: "radio", when: { near: ["R", 6] }, events: [{ type: "RADIO", at: "R", dur: 40 }] },
      // A door down the hall eases open on its own.
      { id: "creak", when: { near: ["G", 3] }, events: [
        { type: "DOOR", target: "P", action: "creak", amount: 0.45 },
        { t: 2.5, type: "SOUND", kind: "settle", at: "P", vol: 0.7 },
      ] },
      // Room 216 is locked — and something on the other side knocks back.
      { id: "knock", when: { near: ["M", 3.6] }, events: [
        { type: "DOOR", target: "M", action: "bang" },
        { t: 0.55, type: "DOOR", target: "M", action: "bang" },
        { t: 2.4, type: "STEPS", path: [{ x: 51, z: 7 }, { x: 55, z: 3 }], speed: 0.8 },
      ] },
      { id: "pop", when: { near: ["N", 3], notFlag: "key_ward" }, events: [{ type: "LIGHT", target: "near:N:5", mode: "explode" }] },
      // Phantom steps in the rooms across the hall while you search.
      { id: "rooms", when: { near: ["K", 3] }, events: [{ t: 1.5, type: "STEPS", path: [{ x: 7, z: 5 }, { x: 21, z: 5 }], speed: 1.1 }] },
      // Key in hand: it's standing by the ward door. It steps into Room 217.
      { id: "key", when: { flag: "key_ward" }, events: [
        { type: "OBJECTIVE", text: "RETURN TO THE WARD DOOR" },
        { type: "CREATURE", action: "glimpse", path: [{ x: 55, z: 11 }, { x: 53, z: 13 }, { x: 53, z: 17 }, { x: 53, z: 19 }], hold: 0, seenHold: 1.0, near: 10, timeout: 25, speed: 1.3,
          then: [{ t: 0.6, type: "DOOR", target: "Q", action: "slam" }, { t: 0.8, type: "STINGER", kind: "low" }] },
      ] },
      { id: "passQ", when: { flag: "key_ward", near: ["Q", 3.2] }, events: [
        { type: "DOOR", target: "Q", action: "bang" },
        { t: 0.4, type: "SOUND", kind: "whisper", at: "Q" },
      ] },
    ],
  },

  // ===================================================================== 4
  {
    id: 4,
    name: "BLACKOUT",
    place: "Administration — Third Floor",
    blurb: "The power is gone. Find the security keycard in the dark, then get to the stairs.",
    theme: "office",
    objective: "FIND THE SECURITY KEYCARD",
    startHeading: "N",
    map: [
      "#########################",
      "#######.....###...#######",
      "#######.c.c.###.K.#######",
      "#######..x..###...#######",
      "#######.c.c.####D########",
      "#######..C..E......f....#",
      "##########M######.####e##",
      "##########.######.#######",
      "##########x######@#######",
      "#.f..L....o..x....#######",
      "#.#######################",
      "#.#######################",
      "#e###################w.##",
      "#.....D.....f.......SZ.X#",
      "#########################",
    ],
    lock: { item: "keycard", lockedMsg: "SECURITY DOOR — KEYCARD REQUIRED", unlockMsg: "ACCESS GRANTED" },
    exit: { label: "Take the Stairs" },
    marks: {
      K: { type: "item", item: "keycard", name: "Security Keycard", label: "Pick Up Keycard", model: "keycard" },
      E: { type: "door", label: "Open-Plan Office" },
      M: { type: "door", locked: "never", lockedMsg: "IT'S BLOCKED FROM THE OTHER SIDE" },
      S: { type: "door", open: true, style: "security" },
      C: { type: "spawn" },
      Z: { type: "safe" },
    },
    lampsOff: ["emergency"],
    ambient: { interval: [7, 14], kinds: ["creak", "settle", "vent", "metal", "drip"] },
    chases: {
      c1: { spawn: ["C"], safe: "Z", speed: 3.95, delay: 1.9, lockDoor: "S", objective: "RUN", after: "GET TO THE STAIRS" },
    },
    script: [
      { id: "intro", when: { time: 1 }, events: [{ type: "MESSAGE", text: "ADMINISTRATION — 3:21 AM", dur: 3.5 }] },
      { id: "hall", when: { near: ["E", 3.5] }, events: [
        { type: "LIGHT", target: "player:9", mode: "fail" },
        { t: 0.5, type: "SOUND", kind: "settle", at: "behind:8" },
      ] },
      { id: "office", when: { near: ["C", 2.5] }, events: [
        { type: "FALL", at: { x: 21, z: 7 } },
        { t: 1.2, type: "STINGER", kind: "low" },
      ] },
      { id: "tried", when: { flag: "tried:L", notFlag: "keycard" }, events: [{ type: "OBJECTIVE", text: "FIND THE SECURITY KEYCARD" }] },
      { id: "card", when: { flag: "keycard" }, events: [
        { type: "OBJECTIVE", text: "OPEN THE SECURITY DOOR" },
        { t: 2, type: "STEPS", path: [{ x: 15, z: 3 }, { x: 23, z: 9 }, { x: 15, z: 9 }], speed: 1.1 },
        { t: 6, type: "DOOR", target: "M", action: "bang" },
      ] },
      { id: "chase", when: { flag: "unlocked:L" }, events: [
        { type: "CHECKPOINT" },
        { type: "LIGHT", target: "main", mode: "off" },
        { t: 0.3, type: "LIGHT", target: "kind:e", mode: "on" },
        { t: 0.2, type: "CHASE", id: "c1" },
        { t: 1.8, type: "DOOR", target: "M", action: "burst" },
      ] },
      { id: "safe", when: { flag: "chased:c1" }, events: [
        { t: 1.0, type: "DOOR", target: "S", action: "bang" },
        { t: 1.6, type: "DOOR", target: "S", action: "bang" },
        { t: 3, type: "MESSAGE", text: "THE STAIRS. KEEP GOING.", dur: 3 },
      ] },
    ],
  },

  // ===================================================================== 5
  {
    id: 5,
    name: "STORAGE",
    place: "Basement Storage B",
    blurb: "It walks the aisles. Hide when it comes. Find the freight key.",
    theme: "storage",
    objective: "FIND THE FREIGHT KEY",
    startHeading: "E",
    map: [
      "######################",
      "#@..HbH....b......b..#",
      "#1.........5.........#",
      "#.SSSS..SSSS..SSSS...#",
      "#...........b........#",
      "#.SSSS..SSSS..SSSS..2#",
      "#....................#",
      "#H...b......b.....b.K#",
      "#3...................#",
      "#.SSSS..SSSS..SSSS..H#",
      "#.........b.........4#",
      "#H...................#",
      "##########X###########",
      "######################",
    ],
    exit: { requires: "key_freight", lockedMsg: "FREIGHT ELEVATOR — KEY REQUIRED", label: "Call Freight Elevator" },
    marks: {
      K: { type: "item", item: "key_freight", name: "Freight Key", label: "Pick Up Freight Key", model: "key" },
      S: { type: "prop", model: "shelf", free: true },
    },
    ambient: { interval: [9, 16], kinds: ["creak", "drip", "settle", "metal"] },
    script: [
      { id: "intro", when: { time: 1 }, events: [{ type: "MESSAGE", text: "STORAGE B — 3:58 AM", dur: 3.5 }] },
      { id: "warn", when: { time: 7 }, events: [
        { type: "SOUND", kind: "distantDoor", at: { x: 44, z: 22 } },
        { t: 1.5, type: "STEPS", path: [{ x: 46, z: 26 }, { x: 46, z: 16 }], speed: 1.1 },
      ] },
      { id: "hideCue", when: { after: "warn", delay: 4.5 }, events: [
        { type: "OBJECTIVE", text: "HIDE" },
        { type: "MESSAGE", text: "IT'S COMING — HIDE IN A LOCKER", dur: 4 },
        { t: 1, type: "CREATURE", action: "patrol", spawn: "5", points: ["1", "3", "4", "2"], speed: 1.25, chaseSpeed: 3.6, loseTime: 5 },
      ] },
      { id: "afterHide", when: { flag: "hid", after: "hideCue", delay: 18 }, events: [{ type: "OBJECTIVE", text: "FIND THE FREIGHT KEY" }] },
      { id: "afterNoHide", when: { after: "hideCue", delay: 30 }, events: [{ type: "OBJECTIVE", text: "FIND THE FREIGHT KEY" }] },
      { id: "key", when: { flag: "key_freight" }, events: [{ type: "OBJECTIVE", text: "REACH THE FREIGHT ELEVATOR" }] },
    ],
  },

  // ===================================================================== 6
  {
    id: 6,
    name: "RED HALL",
    place: "C-Wing — Emergency Power",
    blurb: "Only the emergency lights are working. Open the security gate — and don't look back.",
    theme: "red",
    objective: "OPEN THE SECURITY GATE",
    startHeading: "E",
    map: [
      "##############################",
      "#########...##.U.#############",
      "#########.C.##...#############",
      "##########M####D##############",
      "#@..e...e....e...e.....e...e.#",
      "########################G#####",
      "########################.#####",
      "########w.##############e#####",
      "#######XZ.S...D....e.....#####",
      "########..####################",
      "##############################",
    ],
    exit: { label: "Enter Stairwell" },
    marks: {
      U: { type: "use", model: "lever", flag: "gate", label: "Pull Lever", side: "N" },
      G: { type: "door", locked: "never", lockedMsg: "THE SECURITY GATE IS DOWN", style: "security" },
      M: { type: "door", locked: "never", lockedMsg: "IT WON'T OPEN" },
      S: { type: "door", open: true, style: "security" },
      C: { type: "spawn" },
      Z: { type: "safe" },
    },
    ambient: { interval: [8, 14], kinds: ["creak", "metal", "vent", "pipes", "settle"] },
    chases: {
      c1: { spawn: ["C"], safe: "Z", speed: 3.95, delay: 1.8, lockDoor: "S", objective: "RUN", after: "REACH THE STAIRWELL" },
    },
    script: [
      { id: "intro", when: { time: 1 }, events: [{ type: "MESSAGE", text: "C-WING — EMERGENCY POWER ONLY", dur: 3.5 }] },
      // Something on the other side of the gate.
      { id: "gate", when: { near: ["G", 4] }, events: [
        { type: "DOOR", target: "G", action: "bang" },
        { t: 0.45, type: "DOOR", target: "G", action: "bang" },
        { t: 1.6, type: "STEPS", path: [{ x: 49, z: 13 }, { x: 49, z: 17 }, { x: 39, z: 17 }], speed: 1.4 },
        { t: 2, type: "OBJECTIVE", text: "FIND THE GATE CONTROLS" },
      ] },
      { id: "room", when: { near: ["M", 3] }, events: [{ type: "SOUND", kind: "thud", at: "C" }] },
      { id: "lever", when: { flag: "gate" }, events: [
        { type: "CHECKPOINT" },
        { type: "DOOR", target: "G", action: "unlock" },
        { t: 0.3, type: "DOOR", target: "G", action: "open" },
        { t: 0.3, type: "SOUND", kind: "metal", at: "G" },
        { t: 0.4, type: "CHASE", id: "c1" },
        { t: 1.7, type: "DOOR", target: "M", action: "burst" },
        { t: 0.6, type: "LIGHT", target: "all", mode: "flicker", dur: 1.2 },
      ] },
      { id: "safe", when: { flag: "chased:c1" }, events: [
        { t: 1.1, type: "DOOR", target: "S", action: "bang" },
        { t: 1.8, type: "DOOR", target: "S", action: "bang" },
        { t: 2.3, type: "DOOR", target: "S", action: "bang" },
      ] },
    ],
  },

  // ===================================================================== 7
  {
    id: 7,
    name: "WRONG DOOR",
    place: "Records Floor",
    blurb: "Room 3C has the archive key. Every other door on this floor is wrong.",
    theme: "office",
    objective: "FIND ROOM 3C",
    startHeading: "E",
    map: [
      "##########################",
      "##...###Y..###...###...###",
      "##.R.###.c.###.K.###.T.###",
      "##...###...###H..###...###",
      "###A#####B#####C#####E####",
      "#@.x..o....f.....x...o.eX#",
      "##########F###############",
      "#########...##############",
      "#########...##############",
      "##########################",
    ],
    exit: { requires: "key_archive", lockedMsg: "LOCKED — THE ARCHIVE KEY OPENS IT", label: "Unlock Exit" },
    marks: {
      K: { type: "item", item: "key_archive", name: "Archive Key", label: "Pick Up Archive Key", model: "key" },
      R: { type: "radio", label: "Turn Off Radio" },
      A: { type: "door", label: "Room 3A" },
      B: { type: "door", label: "Room 3B" },
      C: { type: "door", label: "Room 3C" },
      E: { type: "door", label: "Room 3D" },
      F: { type: "door", locked: "never", lockedMsg: "ROOM 3E — LOCKED", label: "Room 3E" },
      Y: { type: "point" },
      T: { type: "point" },
    },
    lampsOff: ["emergency"],
    ambient: { interval: [8, 15], kinds: ["creak", "settle", "vent", "drip"] },
    script: [
      { id: "intro", when: { time: 1 }, events: [{ type: "MESSAGE", text: "RECORDS FLOOR — 4:12 AM", dur: 3.5 }] },
      { id: "radio", when: { near: ["R", 4] }, events: [{ type: "RADIO", at: "R", dur: 30 }] },
      // 3B: it's standing in the corner. Then it isn't.
      { id: "b", when: { near: ["B", 2.2] }, events: [
        { type: "CREATURE", action: "glimpse", path: ["Y"], hold: 0, seenHold: 0.5, near: 3.5, timeout: 8, forceAfter: 0.2 },
      ] },
      // 3D: the door slams behind you and the light dies.
      { id: "d", when: { near: ["T", 1.8] }, events: [
        { type: "DOOR", target: "E", action: "slam" },
        { type: "LIGHT", target: "near:T:4", mode: "off" },
        { t: 0.6, type: "SOUND", kind: "whisper", at: "T" },
        { t: 4, type: "LIGHT", target: "near:T:4", mode: "on" },
      ] },
      // 3E knocks back.
      { id: "e", when: { near: ["F", 3] }, events: [
        { type: "DOOR", target: "F", action: "bang" },
        { t: 0.5, type: "DOOR", target: "F", action: "bang" },
        { t: 1.3, type: "DOOR", target: "F", action: "bang" },
      ] },
      // Key in hand: the hall lights die and it walks the corridor, door to door.
      { id: "key", when: { flag: "key_archive" }, events: [
        { type: "OBJECTIVE", text: "HIDE" },
        { t: 0.3, type: "LIGHT", target: "main", mode: "fail" },
        { t: 1, type: "MESSAGE", text: "FOOTSTEPS IN THE HALL", dur: 3 },
        { t: 2.5, type: "CREATURE", action: "walk", spawn: { x: 3, z: 11 }, points: [{ x: 47, z: 11 }], speed: 1.05, chaseSpeed: 3.7, loseTime: 5 },
      ] },
      { id: "gone", when: { after: "key", delay: 14, creatureHidden: true }, events: [
        { type: "OBJECTIVE", text: "REACH THE EXIT" },
        { type: "LIGHT", target: "kind:e", mode: "on" },
      ] },
    ],
  },

  // ===================================================================== 8
  {
    id: 8,
    name: "LOWER FLOOR",
    place: "Level −1 — Maintenance",
    blurb: "Steam blocks the only way out. Find the valve wheel. It is down here with you.",
    theme: "industrial",
    objective: "SHUT OFF THE STEAM",
    startHeading: "E",
    map: [
      "##########################",
      "#@...b..1...b..H....b..2.#",
      "#.##########.###########.#",
      "#.######...#.#####...###.#",
      "#b######.W.#b#####.c.###b#",
      "#.######...#.#####...###.#",
      "#.#######D##.######D####.#",
      "#4..b.V.....3...b....H..5#",
      "##############P###########",
      "##############.###########",
      "##############X###########",
      "##########################",
    ],
    exit: { label: "Climb the Ladder" },
    marks: {
      W: { type: "item", item: "valve_wheel", name: "Valve Wheel", label: "Pick Up Valve Wheel", model: "valve" },
      V: { type: "use", model: "valve", requires: "valve_wheel", flag: "steam_off", label: "Fit Wheel & Turn", needMsg: "THE VALVE WHEEL IS MISSING" },
      P: { type: "door", locked: "never", lockedMsg: "SCALDING STEAM — TURN IT OFF FIRST", style: "security" },
    },
    ambient: { interval: [5, 10], kinds: ["vent", "pipes", "drip", "metal", "settle"] },
    script: [
      { id: "intro", when: { time: 1 }, events: [{ type: "MESSAGE", text: "LEVEL −1 — 4:31 AM", dur: 3.5 }] },
      { id: "steam", when: { near: ["P", 5] }, events: [{ type: "SOUND", kind: "vent", at: "P", vol: 1.4 }, { t: 2.4, type: "SOUND", kind: "vent", at: "P", vol: 1.2 }] },
      { id: "valve", when: { flag: "tried:V" }, events: [{ type: "OBJECTIVE", text: "FIND THE VALVE WHEEL" }] },
      { id: "hunt", when: { time: 9 }, events: [
        { type: "STEPS", path: [{ x: 49, z: 3 }, { x: 49, z: 13 }], speed: 1.2 },
        { t: 3, type: "CREATURE", action: "patrol", spawn: "2", points: ["2", "5", "3", "4", "1"], speed: 1.2, chaseSpeed: 3.7, loseTime: 5 },
      ] },
      { id: "wheel", when: { flag: "valve_wheel" }, events: [{ type: "OBJECTIVE", text: "FIT THE WHEEL TO THE VALVE" }] },
      { id: "off", when: { flag: "steam_off" }, events: [
        { type: "SOUND", kind: "pipes", at: "V", vol: 1.2 },
        { t: 0.8, type: "DOOR", target: "P", action: "unlock" },
        { t: 1.0, type: "DOOR", target: "P", action: "open" },
        { t: 1.0, type: "OBJECTIVE", text: "CLIMB OUT" },
      ] },
    ],
  },

  // ===================================================================== 9
  {
    id: 9,
    name: "IT KNOWS",
    place: "Service Level",
    blurb: "Restore power to the service elevator. It has been waiting for you to try.",
    theme: "industrial",
    objective: "FIND THE POWER SWITCH",
    startHeading: "E",
    map: [
      "##############################",
      "##########################.U.#",
      "###@..o....x....o..e..f..D...#",
      "####################M######G##",
      "###################.C.#####.##",
      "###################...#####e##",
      "#X#########################.##",
      "#w.########################.##",
      "#Z.########################f##",
      "#..S..e.O..e...O..e...O..e..##",
      "##############################",
    ],
    exit: { label: "Take the Elevator" },
    marks: {
      U: { type: "use", model: "switch", flag: "power", label: "Restore Elevator Power", side: "N" },
      M: { type: "door", locked: "never", lockedMsg: "IT WON'T OPEN" },
      G: { type: "door", locked: "never", lockedMsg: "SHUTTER IS DOWN", style: "security" },
      S: { type: "door", locked: "never", lockedMsg: "NO POWER", style: "security" },
      O: { type: "door", open: true },
      C: { type: "spawn" },
      Z: { type: "safe" },
    },
    lampsOff: ["emergency"],
    ambient: { interval: [6, 12], kinds: ["vent", "pipes", "metal", "settle"] },
    chases: {
      c1: { spawn: ["C"], safe: "Z", speed: 4.0, delay: 1.6, lockDoor: "S", objective: "RUN", after: "TAKE THE ELEVATOR" },
    },
    script: [
      { id: "intro", when: { time: 1 }, events: [{ type: "MESSAGE", text: "SERVICE LEVEL — 4:47 AM", dur: 3.5 }] },
      // It knows you're here: the door beside you is hammered from inside.
      { id: "knows", when: { near: ["M", 2.6] }, events: [
        { type: "DOOR", target: "M", action: "bang" },
        { t: 0.35, type: "DOOR", target: "M", action: "bang" },
        { t: 0.8, type: "DOOR", target: "M", action: "bang" },
        { t: 0.1, type: "STINGER", kind: "low" },
        { t: 0.2, type: "SHAKE", amount: 0.4 },
      ] },
      { id: "follow", when: { after: "knows", delay: 4 }, events: [{ type: "STEPS", path: [{ x: 41, z: 9 }, { x: 43, z: 11 }, { x: 39, z: 11 }], speed: 1.0 }] },
      { id: "shut", when: { near: ["G", 3] }, events: [{ type: "LIGHT", target: "player:7", mode: "flicker", dur: 1.4 }] },
      { id: "power", when: { flag: "power" }, events: [
        { type: "CHECKPOINT" },
        { type: "DOOR", target: "G", action: "unlock" },
        { t: 0.2, type: "DOOR", target: "G", action: "open" },
        { type: "DOOR", target: "S", action: "unlock" },
        { t: 0.2, type: "DOOR", target: "S", action: "open" },
        { type: "LIGHT", target: "main", mode: "off" },
        { t: 0.4, type: "LIGHT", target: "kind:e", mode: "on" },
        { t: 0.3, type: "CHASE", id: "c1" },
        { t: 1.5, type: "DOOR", target: "M", action: "burst" },
      ] },
      { id: "safe", when: { flag: "chased:c1" }, events: [
        { t: 1, type: "DOOR", target: "S", action: "bang" },
        { t: 1.5, type: "DOOR", target: "S", action: "bang" },
        { t: 1.9, type: "DOOR", target: "S", action: "bang" },
        { t: 2.3, type: "DOOR", target: "S", action: "bang" },
      ] },
    ],
  },

  // ===================================================================== 10
  {
    id: 10,
    name: "EXIT",
    place: "Main Lobby",
    blurb: "The main doors are right there. They need a security keycard. It will not let you leave quietly.",
    theme: "lobby",
    objective: "FIND THE MAIN EXIT",
    startHeading: "S",
    windows: 0.6,
    map: [
      "############################",
      "###########.@.###########.##",
      "###########.x.###########C##",
      "############D############.##",
      "############.############.##",
      "####x.......Y.......o####M##",
      "####....#.......#....#c...c#",
      "####........f........D....b#",
      "####....#.......#....#c....#",
      "####........R.......P#K...c#",
      "####eQ..............x#######",
      "######X#####################",
      "############################",
    ],
    exit: { requires: "keycard_main", lockedMsg: "SEALED — SECURITY KEYCARD REQUIRED", label: "Escape" },
    marks: {
      K: { type: "item", item: "keycard_main", name: "Security Keycard", label: "Pick Up Keycard", model: "keycard" },
      M: { type: "door", locked: "never", lockedMsg: "IT WON'T OPEN" },
      R: { type: "prop", model: "desk", free: true },
      C: { type: "spawn" },
      Y: { type: "point" },
      Q: { type: "point" },
      P: { type: "point" },
    },
    ambient: { interval: [9, 16], kinds: ["creak", "settle", "vent", "drip"] },
    chases: {
      c1: { spawn: ["C"], speed: 4.0, delay: 2.0, objective: "GET OUT" },
    },
    script: [
      { id: "intro", when: { time: 1 }, events: [{ type: "MESSAGE", text: "MAIN LOBBY — 5:03 AM", dur: 3.5 }] },
      // It's waiting by the main doors.
      { id: "lobby", when: { near: ["Y", 2.5] }, events: [
        { type: "CREATURE", action: "glimpse", path: ["Q", "P"], hold: 0, seenHold: 1.3, near: 8, timeout: 20, speed: 1.2 },
      ] },
      { id: "tried", when: { flag: "triedExit", notFlag: "keycard_main" }, events: [{ type: "OBJECTIVE", text: "FIND A SECURITY KEYCARD" }] },
      { id: "card", when: { flag: "keycard_main" }, events: [
        { type: "CHECKPOINT" },
        { type: "STINGER", kind: "low" },
        { type: "LIGHT", target: "main", mode: "off" },
        { t: 0.3, type: "LIGHT", target: "kind:e", mode: "on" },
        { t: 0.4, type: "CHASE", id: "c1" },
        { t: 2.0, type: "DOOR", target: "M", action: "burst" },
      ] },
    ],
  },

];

export const TOTAL_SECTIONS = SECTIONS.length;
export const getSection = (id) => SECTIONS.find((s) => s.id === id) || null;
