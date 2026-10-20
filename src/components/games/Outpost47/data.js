/**
 * Outpost 47: Frozen Secrets — all world + story data.
 *
 * Pure data and small rule functions; no Three.js, no React. sim.js is the only
 * thing that judges anything, and it reads everything from here. The world is
 * two regions joined by portals (lift / cave descent):
 *   SURFACE     around x = 0       — the station, outbuildings, the storm
 *   UNDERGROUND around x = UX (400) — ice caves, tunnels, Site B, the lab
 *
 * Coordinates: metres, x east, z south (the player arrives from +z and walks
 * north toward −z). Rooms are axis-aligned boxes; layout.js turns them into
 * walls, doors, floors and colliders.
 */

export const SAVE_KEY = "outpost47-progress";
export const SETTINGS_KEY = "outpost47-settings";
export const RECORD_KEY = "outpost47-records";
export const UX = 400;
export const WALL_T = 0.3;
export const DOOR_H = 2.4;
const U = (x) => x + UX;

/* ================================================================ terrain */
// Flat pads under buildings/paths; gentle drifts elsewhere; mountains rise
// beyond the playable boundary. Shared by sim (ground height) and world (mesh).
const PADS = [
  [-23, -19, 23, 27], [-3.5, 26, 3.5, 78], [-5, 64, 5, 80], [10, 36, 22, 48], [-13, 44, -5, 56],
  [32, 4, 42, 14], [44, -14, 56, -2], [24, -22, 32, 10], [32, -30, 40, -22], [20, -12, 34, -6],
  [-2, -62, 14, -50], [4, -50, 10, -18], [-27, -12, -21, -4],
];
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const BOUNDS = { x1: -58, x2: 62, z1: -62, z2: 82 };
export function terrain(x, z) {
  if (x > UX - 100) return 0;
  let d = 99;
  for (const [x1, z1, x2, z2] of PADS) {
    const dx = Math.max(x1 - x, 0, x - x2), dz = Math.max(z1 - z, 0, z - z2);
    d = Math.min(d, Math.hypot(dx, dz));
  }
  const k = Math.min(1, d / 7);
  const sm = k * k * (3 - 2 * k);
  let h = (vnoise(x * 0.08, z * 0.08) - 0.5) * 1.6 + (vnoise(x * 0.23 + 9, z * 0.23) - 0.5) * 0.5;
  // beyond the boundary the land climbs into ridges (visual backdrop)
  const ox = Math.max(BOUNDS.x1 - x, 0, x - BOUNDS.x2), oz = Math.max(BOUNDS.z1 - z, 0, z - BOUNDS.z2);
  const out = Math.hypot(ox, oz);
  if (out > 0) h += out * 0.55 + vnoise(x * 0.05, z * 0.05) * out * 0.5;
  return h * sm + (out > 0 ? out * 0.25 : 0);
}

/* ================================================================ items */
export const ITEMS = {
  flashlight: { name: "Flashlight", icon: "flashlight", kind: "tool", desc: "Your field flashlight. Press F to toggle. Batteries recharge it." },
  battery: { name: "Battery Pack", icon: "battery", kind: "consumable", stack: true, desc: "A lithium cell for the flashlight. Use it to recharge, or it swaps in automatically when the light dies." },
  ice_pick: { name: "Ice Pick", icon: "tool", kind: "tool", desc: "A short ice axe from the supply shed. Good for breaking frozen latches." },
  card_access: { name: "Access Card — K. Lund", icon: "card", kind: "key", desc: "Station access card, Logistics. Opens the entrance security door." },
  relay: { name: "Power Relay", icon: "part", kind: "part", desc: "Heavy 3-pole relay stamped GEN-1 / EXCITER. Belongs in the generator." },
  coil: { name: "Ignition Coil", icon: "part", kind: "part", desc: "Generator ignition coil. Someone pulled it deliberately — the leads were cut clean." },
  fuse: { name: "200 A Fuse", icon: "part", kind: "part", desc: "Ceramic cartridge fuse, 200 A. The generator's main output fuse." },
  wrench: { name: "Valve Wrench", icon: "tool", kind: "tool", desc: "A long-handled valve key. Seized valves turn with this." },
  card_security: { name: "Security Card — R. Holt", icon: "card", kind: "key", desc: "Chief of Security Rhys Holt's keycard. Opens the security office." },
  shovel: { name: "Snow Shovel", icon: "tool", kind: "tool", desc: "Aluminium snow shovel from the supply container." },
  gear_s: { name: "Small Gear (10 T)", icon: "gear", kind: "part", desc: "Small steel spur gear, 10 teeth." },
  gear_m: { name: "Medium Gear (20 T)", icon: "gear", kind: "part", desc: "Medium spur gear, 20 teeth." },
  gear_l: { name: "Large Gear (30 T)", icon: "gear", kind: "part", desc: "Large spur gear, 30 teeth. Heavy." },
  card_l5: { name: "Level-5 Clearance — E. Varga", icon: "card", kind: "key", desc: "Station Director Elena Varga's clearance card. Restricted laboratory access." },
  core: { name: "Ice Core C-47", icon: "sample", kind: "sample", desc: "A sealed tube of ancient lake ice from 3.2 km down. Faint blue specks drift inside it." },
  vial: { name: "Specimen 47 Vial", icon: "sample", kind: "sample", desc: "A cryo-sealed vial from the containment tank. It is cold enough to burn through your glove." },
  frag1: { name: "Evac Code — Fragment I", icon: "code", kind: "code", desc: "Recovered from the director's terminal. Fragment I reads: 47" },
  frag2: { name: "Evac Code — Fragment II", icon: "code", kind: "code", desc: "Found in Varga's locker at Site B. Fragment II reads: 19" },
  frag3: { name: "Evac Code — Fragment III", icon: "code", kind: "code", desc: "Spoken at the end of Varga's final recording. Fragment III reads: 06" },
};

/* ================================================================ documents */
export const DOCS = {
  pilot: { title: "Mission Brief", from: "Arctic Rescue Coordination", body: "Outpost 47 (Halvorsen Polar Dynamics research station) has not transmitted in eleven days. Seven crew on the manifest.\n\nYou are cleared to enter, assess and report. Weather window closes in minutes; Skyhook will return when the storm breaks.\n\nPriority: find the crew. Find out what happened." },
  lund_note: { title: "Note taped to the workbench", from: "K. Lund, Logistics", body: "Left my access card in the snowcat glovebox AGAIN. Latch froze solid on the way back from the fuel run.\n\nIf you find this, the pick on the bench will crack the ice off the latch. Don't swing at the window.\n\n— Karin" },
  plaque: { title: "Brass plaque", from: "Entrance checkpoint", body: "OUTPOST 47\nHALVORSEN POLAR DYNAMICS\nARCTIC RESEARCH STATION\n\nESTABLISHED 1987\n\n“Knowledge from the ice.”" },
  emergency: { title: "Emergency message (looping)", from: "Checkpoint terminal — recorded 11 days ago", body: "[AUTOMATED LOOP — VOICE: R. HOLT]\n\n“This is Outpost 47. We have a biological containment event. Station director has ordered a full shutdown. Do not— [static] —repeat, do NOT restore— [static] —keep it cold. Keep the lab cold. If you are hearing this, the crew is below. Director Varga has—”\n\n[SIGNAL LOST]" },
  roster: { title: "Crew roster — winter season", from: "Corridor notice board", body: "DIRECTOR — Dr. Elena Varga\nMICROBIOLOGY — Dr. Mikhail Orlov\nMEDICAL — Dr. Aiko Tanaka\nENGINEERING — Sam Keene\nSECURITY — Rhys Holt\nCOMMUNICATIONS — Jonah Pell\nLOGISTICS — Karin Lund\n\nReminder: sublevel access is DIRECTOR AUTHORISED ONLY." },
  keene_note: { title: "Keene's note", from: "S. Keene, Engineering", body: "Varga ordered me to pull the generator and make sure nobody could start it again. 'Not even me,' she said. 'Keep the station cold until help comes.'\n\nI pulled the relay and the ignition coil. Coil's on the storage racks — shelf C. Relay stays with me. The main fuse is in the boiler room toolbox.\n\nIf she's wrong, we freeze. If she's right — God help whoever turns the heat back on without knowing why." },
  gen_manual: { title: "GEN-1 cold start procedure", from: "Taped to the generator room wall", body: "COLD START — BELOW −20 °C\n\n1. FUEL PUMP — on. Wait for prime.\n2. GLOW PLUGS — hold until the lamp goes out.\n3. CHOKE — closed.\n4. STARTER — crank.\n5. MAIN BREAKER — only once the engine settles.\n\nThe distribution panel must route HEAT, LIGHTS and CONTROL before the breaker will hold." },
  boiler_tag: { title: "Boiler startup tag", from: "Wired to the boiler manifold", body: "BOILER B-2 — COLD RESTART\n\n• RETURN line (BLUE) fully open — 5 — before firing.\n• BYPASS (GREEN) closed — 0. An open bypass dumps the burner.\n• Bring FEED (RED) up until system pressure sits in the GREEN BAND, 3.4 – 3.8 bar.\n\nValves seize in the cold — use the valve wrench." },
  tanaka_diary: { title: "Dr. Tanaka's diary", from: "Bunk 3, living quarters", body: "Day 3 of the cold. Mikhail keeps breaking into the infirmary for sedatives so I changed the keypad code.\n\nI set it to his birthday — day and month, four digits. He'll never think the code is about him. The man doesn't even remember his own birthday; the galley calendar has to remind him.\n\nOrlov's hands are blue at the fingertips and he says he feels warm. That's wrong. That is very wrong." },
  orlov_diary: { title: "Dr. Orlov's diary", from: "Bunk 5, living quarters", body: "The core from Lake Kessel is alive. Not 'contains life' — ALIVE. Forty thousand years asleep in the dark and it woke up in four hours on the bench.\n\nIt hates warmth. Above minus ten it blooms. Below, it sleeps. Elena calls it Specimen 47. Halvorsen calls it 'the product'.\n\nI keep wanting to walk outside. It's so warm in here." },
  holt_log: { title: "Holt — security log", from: "Bunk 6, living quarters", body: "Halvorsen ordered an overload test on the sublevel cryo plant. Keene ran it. Containment warmed to +4 °C for nineteen minutes.\n\nThat was enough.\n\nVarga has me escorting people to medical. Pell won't stop trying to raise the company on the tower. Varga says if Halvorsen gets here first, the crew becomes 'samples'. I believe her.\n\nI left my keycard in the infirmary tray. If anyone reads this: medical first." },
  photo: { title: "Photograph", from: "Shelf above the director's bunk", body: "A faded photo of a younger Elena Varga laughing in a snowfield, arms around a big grey husky.\n\nOn the back, in pen:\n“Me and Bear — my first sled dog. Svalbard, 1998.”" },
  calendar: { title: "Galley calendar — February", from: "Mess hall wall", body: "FEBRUARY\n\n02 — Fuel run (Lund)\n07 — Tower inspection (Pell)\n09 — CRYO OVERLOAD TEST — sublevel (Keene / Halvorsen order)\n20 — Resupply flight\n\nBirthdays this season: Lund 02/01 · Orlov 14/03 · Pell 30/05 · Tanaka 11/08" },
  medlog: { title: "Medical log", from: "Dr. A. Tanaka", body: "Patients: Orlov, Lund, Pell, Keene. Core temperature dropping, patients report feeling warm. Classic paradoxical undressing — but they're INDOORS.\n\nCold arrests it. Below −10 °C the organism goes dormant. Varga wants to put everyone into the sublevel cryo pods until a real hospital can treat them.\n\nIt's insane. It's also the only thing that's worked." },
  door_log: { title: "Door access log — night of 9 Feb", from: "Security office printout (card IDs corrupted)", body: "01:52   MEDICAL BAY ............. OPEN\n02:10   GENERATOR ROOM .......... OPEN\n02:26   STORAGE WAREHOUSE ....... OPEN\n02:41   SUBLEVEL LIFT (CAGE) .... OPEN\n\n[ERROR] camera labels lost during shutdown — re-associate footage by hand." },
  holt_memo: { title: "Security memo", from: "R. Holt", body: "Director's terminal password is reset weekly. Varga writes her own hint into the security archive so I can unlock it if she's incapacitated.\n\nThe archive only opens once the footage index is rebuilt. Fix the timeline first." },
  timeline_result: { title: "Reconstructed timeline", from: "Security archive", body: "01:52  Tanaka moves the exposed crew into medical.\n02:10  Keene strips parts from the generator.\n02:26  Holt and Lund carry a sealed crate between the storage racks.\n02:41  Varga unchains the sublevel lift. No one comes back up.\n\nARCHIVE — Director password hint (set by E. Varga):\n“My first dog's name, followed by the year this station was established.”" },
  pell_log: { title: "Pell — comms log", from: "Communications office", body: "Day 1: Halvorsen keeps asking for 'the product' status, not crew status.\n\nDay 2: Varga cut the comm tower feed from the director's terminal. Said the company would use our signal to find the samples first.\n\nIf someone needs the tower back: the feed has to be re-enabled from her terminal, then the junction in the weather hut brought up by hand." },
  varga_terminal: { title: "Director's terminal — PROJECT 47", from: "Dr. Elena Varga", body: "PROJECT 47 — HALVORSEN EYES ONLY\n\nSubglacial Lake Kessel, 3.2 km. A dormant microbial community, ~40,000 years old. Antifreeze proteins beyond anything in literature. Halvorsen's interest: induced cryostasis — 'soldiers who can be put on ice'.\n\nAfter the overload test the organism bloomed. Exposed crew became cold-seeking, confused, convinced they were warm.\n\nI have:\n• shut down power to keep the station cold\n• cut the comm tower so Halvorsen can't locate the samples\n• taken the crew below, to the cryo pods\n\nTower feed: RE-ENABLED from this terminal if you are reading this.\nEvacuation authorisation — FRAGMENT I: 47\nThe rest is below. Follow the lift — or the ice." },
  weather_log: { title: "Weather log", from: "Weather monitoring station", body: "OUTSIDE AIR: −41 °C\nWIND: 26 m/s gusting 34, NNE\nVISIBILITY: < 50 m\n\nAuto-log paused: tower junction offline." },
  tower_placard: { title: "Tower junction placard", from: "Weather hut wall", body: "COMM TOWER FEED — JUNCTION J-4\n\nBus A  12 V  — antenna de-icer\nBus B  24 V  — transmitter\nBus C  12 V  — amplifier\nBus D  24 V  — scanner (aux)\n\n• The tower needs EXACTLY 48 V at the bus.\n• C and D share a ground — never run both.\n• Keep the de-icer (A) ON whenever outside air is below −30 °C." },
  scan_result: { title: "Ground scan", from: "Tower scanner console", body: "THERMAL / GROUND-PENETRATING SCAN — NORTH RIDGE\n\nVoid detected behind the ridge face, 6 m east of the survey cairn. Steel door signature under ~2 m of drift.\n\nA manmade shaft descends from there. Old Site B access." },
  steam_tag: { title: "Manifold tag", from: "Ice cave — manifold M-3", body: "MANIFOLD M-3\n\nThe line tags have frozen off. Three lines leave this manifold — follow them by eye.\n\nOne feeds the de-icing jets. Opening more than one splits the pressure and the jets won't melt anything." },
  orlov_page: { title: "Torn notebook page", from: "Ice cave floor", body: "…the glow in the ice is it. All of it. The cave walls are full of it, sleeping.\n\nElena brought them down in a line, holding hands like children. Aiko last. Nobody spoke.\n\nIt's cold enough here that I can think again." },
  bulkhead_plate: { title: "Bulkhead drive plate", from: "Maintenance tunnel", body: "BULKHEAD B-7 — MANUAL OVERRIDE\n\nGear train: CRANK → IDLER → DRIVE.\nThe crank turns CLOCKWISE.\nThe drive must turn CLOCKWISE at ONE-THIRD crank speed (3 : 1).\n\nGears were removed for the winter. Check the tunnels." },
  lift_note: { title: "Chalk on the lift cage", from: "Maintenance lift", body: "CHAINED FROM BELOW — E.V.\n\nNobody comes down without walking through the ice first." },
  whiteboard: { title: "Corridor whiteboard", from: "Research corridor", body: "SPECIMEN 47 — LIFE CYCLE\n\n   ❄ DORMANT   →   💧 THAW   →   ✶ SPORULATION   →   ✿ BLOOM\n\nNEVER let it reach stage four outside containment.\n\n(Below: the four symbols are drawn large in the same order, circled.)" },
  siteb_log: { title: "Varga — field log, Site B", from: "Site B desk", body: "Everyone is in the pods. Seven pods, six crew, and one for me.\n\nThe lab is in lockdown. To open it you need my clearance card and the access challenge from the protocol card.\n\nMy card is in my locker here. The lock follows the life cycle on the corridor board — start where it sleeps.\n\nFragment II of the evacuation code is in the locker with the card." },
  protocol_card: { title: "Laboratory access protocol", from: "Site B desk", body: "RESTRICTED LAB — ACCESS CHALLENGE\nAnswer the challenge word shown on the lockdown panel:\n\nAURORA ....... 2281\nGLACIER ...... 4417\nTUNDRA ....... 9036\nNUNATAK ...... 5170\nPERMAFROST ... 3842\n\nClearance card must be inserted first." },
  cryo_placard: { title: "Cryo coolant placard", from: "Cryo plant, restricted lab", body: "PRIMARY COOLANT LOOP\n\n• Total flow: 9 L/min.\n• Line C feeds the pod manifold — EXACTLY 2 L/min.\n• Line B must never exceed Line A." },
  emitter_note: { title: "Emitter bus note", from: "Containment console", body: "Containment field needs all three emitters (A, B, C) live off the bus.\nRotate the junction blocks until power reaches every emitter." },
  spectro_note: { title: "Orlov — analyzer note", from: "Lab bench", body: "To confirm a viable specimen, load the core and calibrate the analyzer:\n\nSpecimen 47 fluoresces at 470 nm.\nRun it at gain ×3 — the peak is unmistakable." },
  research_logs: { title: "Classified research archive", from: "Main lab terminal (decrypted)", body: "LOG 31 — Bloom confirmed above −10 °C. Aerosol spread. Hosts become cold-seeking and euphoric.\n\nLOG 34 — Halvorsen: 'Proceed to weaponisation trials. Crew consent is not required.'\n\nLOG 36 — Overload test ordered by Halvorsen to 'stress the product'. Containment rises to +4 °C.\n\nLOG 37 — Exposure. Six crew.\n\nLOG 38 (Varga) — Cryostasis halts the bloom in exposed hosts. Pods hold indefinitely while coolant flows. Halvorsen recovery team will 'collect' pods and samples. I will not let that happen.\n\nContainment chamber unsealed for authorised review." },
  varga_message: { title: "Varga — final recording", from: "Containment chamber", body: "“If you're hearing this, you turned the power back on. Good — the pods were on battery.\n\nThey're alive. All six. They'll stay alive as long as the coolant flows. Never cut the lab seal while they're in there.\n\nHalvorsen will hear the tower. They'll come. You have to decide what the world gets: the truth, with everything in it — or nothing at all.\n\nEvacuation code, fragment three: zero-six. The hangar is through the east door. I'm going to sleep now. Pod seven.”" },
  freq_card: { title: "Frequency card", from: "Radio room", body: "EMERGENCY RELAY — STATION KESTREL\n\nFrequency: 406.4 MHz\nAntenna: align to Kestrel's bearing (see wall map)." },
  radio_map: { title: "Wall map", from: "Radio room", body: "A laminated chart of the north coast. A red line runs from Outpost 47 to Station Kestrel, marked in grease pencil:\n\nBEARING 215°\n\nAround the edge: “relay only works on Kestrel's bearing — don't waste battery scanning.”" },
  evac_power_plate: { title: "Evac power bus", from: "Evacuation control", body: "EVAC RESERVE BUS — 100 kW MAX\n\nHANGAR HEAT 30 · DOOR MOTORS 40 · CLAMPS 20 · LAB SEAL 30 · BEACON 10\n\nLaunch requires DOOR MOTORS, CLAMPS and BEACON.\nOverloading the bus trips everything." },
  evac_procedure: { title: "Evacuation procedure", from: "Evac corridor wall", body: "VEHICLE LAUNCH — IN THIS ORDER ONLY\n\n1. SEAL LAB\n2. VENT HANGAR\n3. OPEN BAY DOOR\n4. RELEASE CLAMPS" },
};

/* ================================================================ rooms */
// side: n (z1) / s (z2) / w (x1) / e (x2). `at` is the opening centre along
// that wall (x for n/s, z for e/w). skip: sides another room builds.
export const ROOMS = [
  // ---------------- surface: main outpost
  { id: "checkpoint", name: "Entrance Checkpoint", x1: -2, z1: 16, x2: 2, z2: 24, h: 3.2, env: "indoor", theme: "station", doors: [{ side: "s", at: 0, w: 1.8, id: "d_entrance" }, { side: "n", at: 0, w: 1.6, id: "d_inner" }] },
  { id: "corr_s", name: "South Corridor", x1: -2, z1: 2, x2: 2, z2: 16, h: 3.2, env: "indoor", theme: "station", skip: "ns", doors: [{ side: "w", at: 9, w: 1.6, id: "d_mess" }, { side: "e", at: 9, w: 1.6, id: "d_medical" }] },
  { id: "corr_ew", name: "Main Corridor", x1: -20, z1: -2, x2: 20, z2: 2, h: 3.2, env: "indoor", theme: "station", doors: [
    { side: "n", at: -14, w: 1.6, id: "d_generator" }, { side: "n", at: 0, w: 4 }, { side: "n", at: 13, w: 1.8, id: "d_storage" },
    { side: "s", at: -15, w: 1.6, id: "d_quarters" }, { side: "s", at: -6, w: 2.4 }, { side: "s", at: 0, w: 4 }, { side: "s", at: 15, w: 1.6, id: "d_security" },
  ] },
  { id: "corr_n", name: "North Corridor", x1: -2, z1: -10, x2: 2, z2: -2, h: 3.2, env: "indoor", theme: "station", skip: "ns", doors: [{ side: "w", at: -6, w: 1.6, id: "d_boiler" }, { side: "e", at: -6, w: 1.6, id: "d_comms" }] },
  { id: "quarters", name: "Living Quarters", x1: -20, z1: 2, x2: -10, z2: 16, h: 3.2, env: "indoor", theme: "station", skip: "n" },
  { id: "mess", name: "Mess Hall", x1: -10, z1: 2, x2: -2, z2: 16, h: 3.2, env: "indoor", theme: "station", skip: "nwe" },
  { id: "medical", name: "Medical Room", x1: 2, z1: 2, x2: 10, z2: 16, h: 3.2, env: "indoor", theme: "clinic", skip: "nw" },
  { id: "security", name: "Security Office", x1: 10, z1: 2, x2: 20, z2: 16, h: 3.2, env: "indoor", theme: "station", skip: "nw" },
  { id: "generator", name: "Generator Room", x1: -20, z1: -16, x2: -7, z2: -2, h: 3.2, env: "indoor", theme: "industrial", skip: "s" },
  { id: "boiler", name: "Boiler Room", x1: -7, z1: -10, x2: -2, z2: -2, h: 3.2, env: "indoor", theme: "industrial", skip: "nsew" },
  { id: "comms", name: "Communications Office", x1: 2, z1: -10, x2: 7, z2: -2, h: 3.2, env: "indoor", theme: "station", skip: "nsew" },
  { id: "control", name: "Central Control Room", x1: -7, z1: -16, x2: 7, z2: -10, h: 3.2, env: "indoor", theme: "station", skip: "we", doors: [{ side: "s", at: 0, w: 1.8, id: "d_control" }] },
  { id: "storage", name: "Storage Warehouse", x1: 7, z1: -16, x2: 20, z2: -2, h: 3.2, env: "indoor", theme: "industrial", skip: "s", doors: [{ side: "e", at: -9, w: 2.4, id: "d_east" }] },
  // ---------------- surface: outbuildings
  { id: "shed", name: "Supply Shed", x1: 12, z1: 38, x2: 20, z2: 46, h: 3, env: "shelter", theme: "shed", doors: [{ side: "w", at: 42, w: 1.4, id: "d_shed" }] },
  { id: "hut", name: "Weather Monitoring Station", x1: 34, z1: 6, x2: 40, z2: 12, h: 3, env: "shelter", theme: "shed", doors: [{ side: "w", at: 9, w: 1.4, id: "d_weather" }] },
  // ---------------- underground
  { id: "cave_a", name: "Ice Caves — Entrance Chamber", x1: U(-10), z1: 40, x2: U(10), z2: 62, h: 6, env: "cave", theme: "ice", doors: [{ side: "n", at: U(0), w: 6, id: "d_icewall" }] },
  { id: "cave_b", name: "Ice Caves — Frozen Gallery", x1: U(-6), z1: 18, x2: U(6), z2: 40, h: 5.5, env: "cave", theme: "ice", skip: "s", doors: [{ side: "n", at: U(0), w: 2.6 }] },
  { id: "tunnel", name: "Maintenance Tunnels", x1: U(-2), z1: -12, x2: U(2), z2: 18, h: 3, env: "tunnel", theme: "tunnel", skip: "s", doors: [{ side: "w", at: 4, w: 2 }, { side: "n", at: U(0), w: 2.2, id: "d_bulkhead" }] },
  { id: "liftroom", name: "Maintenance Lift", x1: U(-12), z1: 0, x2: U(-2), z2: 8, h: 3, env: "tunnel", theme: "tunnel", skip: "e" },
  { id: "rcorr", name: "Research Corridor", x1: U(-2), z1: -44, x2: U(2), z2: -12, h: 3, env: "tunnel", theme: "lab", skip: "ns", doors: [{ side: "e", at: -24, w: 1.6, id: "d_siteb" }] },
  { id: "siteb", name: "Site B — Abandoned Research Site", x1: U(2), z1: -32, x2: U(16), z2: -16, h: 3.4, env: "tunnel", theme: "industrial", skip: "w" },
  { id: "lab", name: "Restricted Laboratory", x1: U(-14), z1: -66, x2: U(14), z2: -44, h: 4, env: "lab", theme: "lab", doors: [{ side: "s", at: U(0), w: 2.2, id: "d_lab" }, { side: "n", at: U(0), w: 2, id: "d_containment" }, { side: "e", at: -56, w: 2, id: "d_evac" }] },
  { id: "contain", name: "Containment Chamber", x1: U(-6), z1: -80, x2: U(6), z2: -66, h: 4, env: "lab", theme: "lab", skip: "s" },
  { id: "ecorr", name: "Evacuation Corridor", x1: U(14), z1: -58, x2: U(30), z2: -54, h: 3, env: "lab", theme: "lab", skip: "we", doors: [{ side: "s", at: U(22), w: 1.6, id: "d_radio" }] },
  { id: "radio", name: "Emergency Radio Room", x1: U(18), z1: -54, x2: U(26), z2: -46, h: 3, env: "lab", theme: "station", skip: "n" },
  { id: "hangar", name: "Evacuation Hangar", x1: U(30), z1: -72, x2: U(54), z2: -40, h: 7, env: "hangar", theme: "industrial", doors: [{ side: "w", at: -56, w: 2.4, id: "d_hangar" }] },
];
export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

/* ================================================================ doors */
// lock: card (item) · keypad/puzzle (opens a puzzle) · flag (opened by story)
export const DOORS = {
  d_entrance: { name: "Entrance Security Door", lock: "card", item: "card_access", deny: "Card reader — ACCESS CARD REQUIRED", heavy: true },
  d_inner: { name: "Inner Door" },
  d_mess: { name: "Mess Hall" },
  d_medical: { name: "Medical Room", lock: "puzzle", puzzle: "p_medical", power: true },
  d_generator: { name: "Generator Room" },
  d_storage: { name: "Storage Warehouse" },
  d_quarters: { name: "Living Quarters" },
  d_security: { name: "Security Office", lock: "card", item: "card_security", power: true, deny: "Security office — SECURITY CARD REQUIRED" },
  d_boiler: { name: "Boiler Room" },
  d_comms: { name: "Communications" },
  d_control: { name: "Central Control Room", power: true, heavy: true },
  d_east: { name: "East Cargo Door", insideX: 20, heavy: true },
  d_shed: { name: "Supply Shed" },
  d_weather: { name: "Weather Station" },
  d_icewall: { name: "Wall of ice", lock: "flag", flag: "iceMelt", deny: "Solid ice seals the passage. Something must melt it.", style: "ice" },
  d_bulkhead: { name: "Bulkhead B-7", lock: "puzzle", puzzle: "p_gears", heavy: true },
  d_siteb: { name: "Site B" },
  d_lab: { name: "Restricted Laboratory", lock: "flag", flag: "lockdownOff", deny: "LOCKDOWN — use the lockdown panel beside the door", heavy: true },
  d_containment: { name: "Containment Chamber", lock: "flag", flag: "analyzed", deny: "SEALED — authorised review only", heavy: true },
  d_evac: { name: "Evacuation Wing", lock: "flag", flag: "truth", deny: "SEALED — containment review incomplete", heavy: true },
  d_radio: { name: "Radio Room" },
  d_hangar: { name: "Hangar Blast Door", lock: "flag", flag: "launch", deny: "BLAST DOOR — complete the evacuation sequence", heavy: true },
};

/* ================================================================ props */
// [type, x, z, rot (quarter turns), opts]. Footprints (w × d × h, metres, at
// rot 0: w along x) become colliders; types without one are decoration.
export const FOOT = {
  desk: [1.6, 0.8, 0.78], console: [3.2, 0.9, 1.1], terminal: [1.2, 0.7, 0.9], locker: [0.6, 0.55, 1.95], lockers: [2.4, 0.55, 1.95],
  rack: [1, 7.6, 2.6], shelf: [2, 0.5, 2], crate: [1, 1, 1], crates: [2.1, 1.1, 1.8], bunk: [0.95, 2.05, 1.8], table: [2.4, 1, 0.76],
  bench: [2.2, 0.4, 0.45], counter: [5, 0.7, 0.92], fridge: [0.9, 0.7, 2], medbed: [1, 2.1, 0.9], cabinet: [1.2, 0.5, 1.9],
  generator: [5, 3, 2.3], boiler: [2, 3, 2.6], panel: [1.8, 0.35, 2], liftcage: [2.6, 2.6, 3], barrels: [1.4, 1.4, 1],
  heater: [1.2, 0.5, 0.9], workbench: [2.4, 0.8, 0.95], snowcat: [2.7, 4.8, 2.9], container: [2.5, 6.1, 2.6], tank: [2.4, 2.4, 3],
  tower: [3.2, 3.2, 30], mast: [0.6, 0.6, 6], rock: [3, 3, 2.5], bigrock: [6, 5, 4], ice: [1.2, 1.2, 2.6], drill: [2, 2, 3.4],
  cryo: [4, 2, 2.6], emitter: [3, 1.4, 1.4], analyzer: [2, 1.4, 1.4], island: [3, 1.2, 1], pod: [1.2, 1.2, 2.3], specimen: [1.8, 1.8, 3],
  radio: [2.6, 0.8, 1.2], evacconsole: [1.6, 0.7, 1.2], cart: [1, 0.6, 0.9], sled: [1, 2.2, 0.5], toolbox: [0.7, 0.4, 0.4],
  lamppost: [0.3, 0.3, 4.5], fueltank: [2, 4, 2.2], cratepile: [2.4, 2.4, 2.2], cairn: [1, 1, 1.2], pad: null, flag: null,
  pipes: null, mmonitor: null, notice: null, chair: null, papers: null, debris: null, cables: null, mapwall: null, tag: null,
  whiteboard: null, crystal: null, icicles: null, gurney: [0.8, 2, 0.9], serverrack: [0.8, 1, 2.1], wreck: [1.6, 1.6, 1],
};

export const PROPS = [
  // checkpoint
  ["desk", 1.4, 20.2, 1], ["terminal", 1.45, 20.2, 3, { onDesk: true, screen: "emg" }], ["lockers", -1.65, 18.6, 1], ["notice", -1.88, 21.4, 1, { kind: "plaque" }], ["chair", 0.6, 20.2, 1], ["papers", -0.5, 22.5, 0],
  // corridors
  ["notice", -1.88, 12.5, 1, { kind: "board" }], ["pipes", 0, 9, 0, { len: 14, axis: "z", side: 1.7 }], ["pipes", 0, 0, 0, { len: 40, axis: "x", side: 1.6 }], ["pipes", 0, -6, 0, { len: 8, axis: "z", side: -1.7 }],
  ["debris", 0.6, 5.5, 0], ["chair", -1.3, -0.8, 2], ["papers", 7, 0.6, 0], ["papers", -11, -0.8, 0],
  // mess
  ["table", -6, 6.6, 0], ["bench", -6, 5.6, 0], ["bench", -6, 7.6, 0], ["table", -6, 11.4, 0], ["bench", -6, 10.4, 0], ["bench", -6, 12.4, 0],
  ["counter", -6.6, 15.25, 2], ["fridge", -9.4, 12.6, 1], ["notice", -9.88, 5, 1, { kind: "calendar" }], ["chair", -3.4, 4.5, 1], ["papers", -6.2, 11.2, 0],
  // quarters
  ["bunk", -19.4, 4.8, 0], ["bunk", -19.4, 8.8, 0], ["bunk", -19.4, 12.8, 0], ["bunk", -10.6, 9.6, 0], ["bunk", -10.6, 13.6, 0],
  ["lockers", -15, 15.6, 2], ["table", -15, 8.6, 1], ["chair", -14.2, 8.6, 1], ["crate", -17.6, 5.4, 0, { foot: true }], ["papers", -14.8, 11.8, 0],
  // medical
  ["medbed", 9.1, 5.2, 0], ["medbed", 9.1, 9.2, 0], ["medbed", 9.1, 13.2, 0], ["cabinet", 2.6, 13, 1], ["desk", 3.4, 4, 1], ["gurney", 6.2, 11, 0], ["counter", 6.8, 15.5, 2, { w: 3 }],
  // security
  ["console", 15, 15.4, 2, { screens: 4 }], ["desk", 12.4, 8, 1], ["lockers", 19.6, 9, 3], ["chair", 15, 14.2, 0], ["serverrack", 19.4, 4, 3], ["papers", 13.2, 10.5, 0],
  // generator room
  ["generator", -14, -9.2, 0], ["panel", -19.8, -8, 1, { kind: "dist" }], ["panel", -11, -15.8, 0, { kind: "start" }], ["liftcage", -17.6, -13.6, 0],
  ["barrels", -9, -14.6, 0], ["barrels", -8.4, -4, 0], ["notice", -12.8, -15.88, 0, { kind: "manual" }], ["pipes", -14, -15.3, 0, { len: 12, axis: "x", side: 0 }], ["cables", -14, -6.6, 0],
  // boiler room
  ["boiler", -5.2, -5.6, 0], ["pipes", -4.5, -9.6, 0, { len: 5, axis: "x", side: 0 }], ["toolbox", -6.5, -2.8, 0], ["tag", -3.2, -9.86, 0],
  // comms office
  ["desk", 6.3, -6, 3], ["radio", 6.55, -8.6, 3, { small: true }], ["chair", 5.4, -6, 3], ["serverrack", 6.5, -3, 3],
  // control room
  ["console", 0, -15.35, 0, { screens: 6, big: true }], ["desk", -5, -12.2, 1], ["terminal", -4.95, -12.2, 1, { onDesk: true, screen: "blue" }], ["chair", -4.2, -12.2, 1],
  ["mapwall", 6.88, -13, 3], ["serverrack", 6.4, -11, 3], ["chair", 0, -14.2, 0],
  // storage
  ["rack", 9.6, -10, 0], ["rack", 13, -10, 0], ["rack", 16.4, -10, 0, { stencil: "C" }], ["workbench", 18.9, -4.3, 3], ["crates", 9.6, -3.4, 0], ["crates", 18.6, -14.8, 0], ["crate", 8, -15, 0],
  // shed
  ["workbench", 16.4, 45.4, 2], ["shelf", 16, 38.4, 0], ["heater", 19.6, 40.6, 3], ["crate", 18.8, 44.6, 0], ["barrels", 13.2, 39.3, 0],
  // weather hut
  ["desk", 36.4, 11.4, 2], ["panel", 39.8, 9, 3, { kind: "junction" }], ["chair", 36.4, 10.6, 0], ["notice", 39.88, 7.3, 3, { kind: "placard" }],
  // outdoor
  ["pad", 0, 72, 0], ["snowcat", -9, 50, 0, { frozen: true }], ["snowcat", 36, -26, 1], ["container", 28, -16, 0, { color: "rust", open: "s" }], ["container", 28, 4, 0, { color: "blue", open: "n" }],
  ["tower", 50, -8, 0], ["mast", 42.5, 3, 0], ["fueltank", -24, -8, 0], ["cratepile", 25, -14, 0], ["cairn", 0, -52, 0],
  ["lamppost", 4.2, 28, 0, { fx: "yard" }], ["lamppost", -4.2, 28, 0, { fx: "yard" }], ["lamppost", 23, -4, 0, { fx: "yard" }], ["lamppost", 44, -2, 0, { fx: "yard" }],
  ["rock", -30, 30, 0], ["rock", 36, 40, 1], ["bigrock", -40, -20, 0], ["rock", 22, 62, 0], ["bigrock", 48, 30, 1], ["rock", -24, 62, 1], ["rock", -44, 12, 0], ["rock", 56, -40, 0],
  ["rock", -14, -40, 1], ["bigrock", 30, -46, 0], ["ice", -20, 40, 0], ["ice", 30, 56, 0], ["ice", -36, -36, 0], ["wreck", 40, 50, 0],
  // ---------------- underground
  ["rock", U(-8), 58, 0], ["rock", U(8), 56, 1], ["ice", U(7), 46, 0], ["ice", U(-7), 54, 0], ["crystal", U(5), 60, 0], ["crystal", U(-4), 44, 0], ["icicles", U(0), 50, 0],
  ["pipes", U(-9.7), 47, 0, { steam: true }],
  ["ice", U(-4.6), 34, 0], ["ice", U(4.6), 30, 0], ["ice", U(4.4), 22, 0], ["crystal", U(-4.6), 20, 0], ["crystal", U(-3.6), 37, 0], ["sled", U(-4.2), 25, 0], ["icicles", U(0), 27, 0], ["rock", U(4.4), 37, 0],
  ["pipes", U(0), 3, 0, { len: 30, axis: "z", side: 1.7, low: true }], ["toolbox", U(1.4), -8, 0], ["notice", U(-1.88), -9.6, 1, { kind: "plate" }], ["cables", U(0), 10, 0],
  ["liftcage", U(-9.6), 4, 1], ["crate", U(-5.2), 1.2, 0], ["barrels", U(-4.2), 6.6, 0],
  ["whiteboard", U(-1.88), -30, 1], ["notice", U(1.88), -42.4, 3, { kind: "lockdown" }], ["pipes", U(0), -28, 0, { len: 32, axis: "z", side: -1.7, low: true }],
  ["drill", U(9), -24, 0], ["desk", U(9), -30.9, 0], ["desk", U(4.6), -17.4, 2], ["workbench", U(12.6), -28.5, 1], ["lockers", U(15.6), -20, 3, { varga: true }], ["crates", U(14.4), -17, 0], ["cables", U(9), -21, 0],
  ["cryo", U(-12.4), -54, 1], ["emitter", U(12.6), -48.5, 3], ["analyzer", U(-9), -64.2, 0], ["island", U(0), -52, 0], ["desk", U(-4.6), -64.5, 0], ["desk", U(6), -64.5, 0], ["notice", U(-13.88), -50.4, 1, { kind: "placard" }],
  ["cart", U(6), -46, 0], ["serverrack", U(13.4), -61, 3], ["serverrack", U(13.4), -63, 3], ["chair", U(0), -51, 0],
  ["specimen", U(0), -73.6, 0], ["pod", U(-5), -69.6, 1], ["pod", U(-5), -73.2, 1], ["pod", U(-5), -76.8, 1], ["pod", U(5), -69.6, 3], ["pod", U(5), -73.2, 3], ["pod", U(5), -76.8, 3], ["pod", U(0), -79, 0, { open: true }], ["cart", U(-2.6), -67.4, 0],
  ["evacconsole", U(26), -57.4, 0], ["notice", U(28.4), -57.88, 0, { kind: "procedure" }],
  ["radio", U(22), -46.5, 2], ["notice", U(25.88), -50, 3, { kind: "card" }], ["mapwall", U(18.12), -50, 1], ["chair", U(22), -47.6, 2],
  ["snowcat", U(44), -56, 1, { evac: true }], ["evacconsole", U(41), -49.5, 0, { final: true }], ["crates", U(34), -43, 0], ["fueltank", U(50), -44, 0], ["barrels", U(33), -69, 0], ["cratepile", U(50), -68, 0],
];

/* Extra colliders (outdoor boundary, ridge, drifts). [x1,z1,x2,z2,y2] */
export const EXTRA_COLLIDERS = [
  [BOUNDS.x1 - 2, BOUNDS.z1, BOUNDS.x1, BOUNDS.z2, 20], [BOUNDS.x2, BOUNDS.z1, BOUNDS.x2 + 2, BOUNDS.z2, 20],
  [BOUNDS.x1, BOUNDS.z2, BOUNDS.x2, BOUNDS.z2 + 2, 20],
  // north ridge with the cave recess between x 3..9
  [BOUNDS.x1, -70, 3, -58, 14], [9, -70, BOUNDS.x2, -58, 14], [3, -70, 9, -60.4, 14],
];
// The snow drift in front of the cave door — a collider until dug out.
export const DRIFT = { x1: 2.6, z1: -60.4, x2: 9.4, z2: -56.6, y2: 2 };

/* ================================================================ zones */
// env: outdoor (cold) · cave (slow cold) · shelter (no change; warm if heated)
// · indoor (warm once heating is on) · tunnel · lab · hangar (neutral/warm).
export const ENV = {
  outdoor: { cold: 0.62, label: "Outside — blizzard" },
  cave: { cold: 0.22, label: "Ice caves — freezing" },
  shelter: { cold: 0, warmFlag: "heater", warm: 1.4, label: "Sheltered" },
  indoor: { cold: 0, warmFlag: "heat", warm: 1.8, label: "Indoors" },
  tunnel: { cold: 0, warm: 0.4, label: "Sheltered" },
  lab: { cold: 0, warmFlag: "lockdownOff", warm: 1.2, label: "Laboratory" },
  hangar: { cold: 0, label: "Hangar" },
};
export const ZONE_OUTDOOR = { id: "outdoor", name: "Outdoors — Outpost 47", env: "outdoor" };
export const ZONE_DEEP = { id: "deep", name: "Underground", env: "tunnel" };

/* ================================================================ portals */
export const SPAWN = { x: 0, y: 0, z: 68, yaw: 0 };
export const PORTALS = {
  cave_down: { x: 6, z: -55, yaw: 0, to: { x: U(0), z: 59, yaw: 0 }, label: "Descending into the ice…" },
  cave_up: { to: { x: 6, z: -54.6, yaw: Math.PI }, label: "Climbing back to the surface…" },
  lift_down: { to: { x: U(-7.4), z: 4, yaw: -Math.PI / 2 }, label: "Riding the maintenance lift down…" },
  lift_up: { to: { x: -15.4, z: -11.2, yaw: Math.PI / 2 + 0.6 }, label: "Riding the maintenance lift up…" },
};

/* ================================================================ fixtures */
// Light fixtures: emissive mesh always; the nearest active ones get one of the
// renderer's pooled point lights. group decides when a fixture is lit.
export const FIXTURE_GROUPS = {
  main: (f) => !!f.power, emg: () => true, yard: (f) => !!f.power, shed: () => true, hut: () => true, tower: (f) => !!f.towerPower,
  ice: () => true, tun: () => true, lab: (f) => !!f.lockdownOff, labemg: (f) => !f.lockdownOff, evac: (f) => !!f.truth, hangar: (f) => !!f.evacPower,
};
export const FIXTURE_LOOK = {
  main: { color: 0xdfeeff, power: 1.35, range: 11 }, emg: { color: 0xff3020, power: 0.7, range: 7 }, yard: { color: 0xffd9a0, power: 1.6, range: 16 },
  shed: { color: 0xffb060, power: 1.25, range: 9 }, hut: { color: 0xffc070, power: 0.9, range: 7 }, tower: { color: 0xff2a20, power: 2.2, range: 26 },
  ice: { color: 0x48c8ff, power: 1.0, range: 9 }, tun: { color: 0xffa040, power: 0.85, range: 8 }, lab: { color: 0xd8f4ff, power: 1.3, range: 12 },
  labemg: { color: 0xff2a2a, power: 0.85, range: 9 }, evac: { color: 0xbfe6ff, power: 1.2, range: 10 }, hangar: { color: 0xfff0d0, power: 2.6, range: 22 },
};
export const FIXTURES = (() => {
  const out = [];
  const add = (x, y, z, group, flicker = 0) => out.push({ x, y, z, group, flicker });
  for (const r of ROOMS) {
    const cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
    const w = r.x2 - r.x1, d = r.z2 - r.z1;
    const y = r.h - 0.12;
    let g = { station: "main", clinic: "main", industrial: "main", shed: null, ice: null, tunnel: "tun", lab: "lab" }[r.theme];
    if (r.id === "hangar") g = "hangar";
    if (r.id === "radio" || r.id === "ecorr") g = "evac";
    if (!g) continue;
    const step = 6.5;
    const nx = Math.max(1, Math.round(w / step)), nz = Math.max(1, Math.round(d / step));
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x = r.x1 + (w / nx) * (i + 0.5), z = r.z1 + (d / nz) * (j + 0.5);
        add(x, y, z, g, (i + j * 3 + out.length) % 5 === 2 ? 1 : 0);
      }
    }
    if (g === "main") add(r.x2 - 0.45, r.h - 0.4, r.z2 - 0.45, "emg", out.length % 3 === 0 ? 1 : 0);
    if (g === "lab" && r.id !== "contain") add(cx, r.h - 0.4, r.z2 - 0.6, "labemg", 1);
  }
  add(16, 2.7, 42, "shed"); add(37, 2.7, 9, "hut");
  add(50, 30.5, -8, "tower");
  // ice glows (caves)
  [[U(5), 1.2, 60], [U(-4), 1.0, 44], [U(-7), 2.5, 54], [U(7), 2.2, 46], [U(-4.6), 1.2, 20], [U(0), 1.0, 36], [U(4.6), 2, 30], [U(-4.6), 2, 34]].forEach(([x, y, z]) => add(x, y, z, "ice"));
  add(U(0), 3.2, -73.6, "ice");
  return out;
})();

/* ================================================================ puzzles */
const N = 1, E = 2, S = 4, W = 8;
export const rotMask = (m, k = 1) => {
  let r = m;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) r = ((r << 1) | (r >> 3)) & 15;
  return r;
};
/** Which cells are powered, flooding from the source through matching edges. */
export function circuitFlow(p, rots) {
  const { cols, rows, cells } = p;
  const mask = (i) => {
    const c = cells[i];
    if (!c) return 0;
    if (c.fixed) return c.m;
    return rotMask(c.m, c.r0 + (rots?.[i] || 0));
  };
  const lit = new Set();
  const src = cells.findIndex((c) => c && c.src);
  const q = [src];
  lit.add(src);
  while (q.length) {
    const i = q.pop();
    const m = mask(i);
    const x = i % cols, y = Math.floor(i / cols);
    const nb = [[N, 0, -1, S], [E, 1, 0, W], [S, 0, 1, N], [W, -1, 0, E]];
    for (const [bit, dx, dy, back] of nb) {
      if (!(m & bit)) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (lit.has(j)) continue;
      if (mask(j) & back) {
        lit.add(j);
        q.push(j);
      }
    }
  }
  return lit;
}
function grid(cols, rows, spec) {
  // spec: { "x,y": [mask, r0] | {src|sink} }
  const cells = new Array(cols * rows).fill(null);
  for (const [k, v] of Object.entries(spec)) {
    const [x, y] = k.split(",").map(Number);
    cells[y * cols + x] = Array.isArray(v) ? { m: v[0], r0: v[1] } : v;
  }
  return { cols, rows, cells };
}

export const SYMBOLS = ["flake", "drop", "spore", "bloom", "moon", "tri"];
export const GEAR_TEETH = { gear_s: 10, gear_m: 20, gear_l: 30 };

export const PUZZLES = {
  p_medical: {
    type: "keypad", title: "Medical Room Keypad", sub: "4-digit code", len: 4, clue: ["tanaka_diary", "calendar"],
    check: (a) => a === "1403", onSolve: (g) => g.open("d_medical"), hints: ["Tanaka's diary says what she set the code to.", "The mess hall calendar lists the crew's birthdays as day/month."],
  },
  p_genstart: {
    type: "sequence", title: "GEN-1 Start Panel", sub: "Cold-start the generator", clue: ["gen_manual"],
    buttons: [["breaker", "MAIN BREAKER"], ["starter", "STARTER"], ["fuel", "FUEL PUMP"], ["choke", "CHOKE"], ["glow", "GLOW PLUGS"]],
    check: (a) => a.join(",") === "fuel,glow,choke,starter,breaker", onSolve: (g) => g.powerOn(), hints: ["The procedure is taped to the wall beside the panel."],
  },
  p_gencircuit: {
    type: "circuit", title: "Distribution Panel", sub: "Route power to HEAT, LIGHTS and CONTROL", clue: [],
    ...grid(6, 4, {
      "0,1": { src: true, fixed: true, m: E, label: "GEN" },
      "1,1": [11, 1], "1,0": [6, 2], "2,0": [10, 1], "3,0": [10, 1], "4,0": [10, 1], "5,0": { sink: "HEAT", fixed: true, m: W },
      "2,1": [12, 3], "2,2": [7, 2], "2,3": [3, 1], "3,3": [10, 1], "4,3": [9, 2], "4,2": [6, 3], "5,2": { sink: "LIGHTS", fixed: true, m: W },
      "3,2": [9, 1], "3,1": [6, 2], "4,1": [10, 1], "5,1": { sink: "CONTROL", fixed: true, m: W },
      "0,0": [3, 1], "0,2": [5, 0], "0,3": [6, 1], "1,2": [7, 3], "1,3": [10, 1], "5,3": [12, 2],
    }),
    check: (a, g, p) => p.cells.every((c, i) => !c?.sink || circuitFlow(p, a).has(i)), onSolve: (g) => g.set("routed"),
    hints: ["Click a junction block to rotate it. Every labelled output on the right must light up."],
  },
  p_boiler: {
    type: "valves", title: "Boiler B-2 Manifold", sub: "Bring the heating loop to pressure", clue: ["boiler_tag"], unit: "bar", band: [3.4, 3.8], max: 5, gaugeMax: 5,
    valves: [["red", "FEED", "#e0553a"], ["blue", "RETURN", "#3a8fe0"], ["green", "BYPASS", "#3ac07a"]],
    gauge: (v) => Math.max(0, 0.8 + v.red * 0.55 + v.blue * 0.1 - v.green * 0.5),
    check: (v, g, p) => v.blue === 5 && v.green === 0 && p.gauge(v) >= 3.4 && p.gauge(v) <= 3.8, onSolve: (g) => g.heatOn(),
    hints: ["The startup tag on the boiler lists the three rules.", "Return fully open, bypass closed, then raise the feed until the needle is in the green band."],
  },
  p_timeline: {
    type: "timeline", title: "CCTV Archive — Rebuild Index", sub: "Match each clip to the door event it recorded", clue: ["door_log"],
    slots: [["0152", "01:52"], ["0210", "02:10"], ["0226", "02:26"], ["0241", "02:41"]],
    clips: [
      ["c1", "Two figures haul a long sealed crate between tall shelving racks. A stencilled letter on the rack end reads “C”."],
      ["c2", "A tall figure in a parka pulls a chain off a steel cage. The floor of the cage is a platform hanging over darkness."],
      ["c3", "A woman in scrubs steers a gurney past white cabinets toward a row of beds, glancing back over her shoulder."],
      ["c4", "Someone in an engineer's coverall kneels at the side of a huge diesel engine block and pulls a part out of an open housing."],
    ],
    check: (a) => a["0152"] === "c3" && a["0210"] === "c4" && a["0226"] === "c1" && a["0241"] === "c2",
    onSolve: (g) => g.addDoc("timeline_result"), hints: ["The printout on the desk lists which door opened at each time.", "Each clip shows the room it was filmed in — you've been in all of them."],
  },
  p_varga: {
    type: "password", title: "Director's Terminal", sub: "E. VARGA — password required", clue: ["timeline_result", "photo", "plaque"],
    check: (a) => a.replace(/\s+/g, "").toUpperCase() === "BEAR1987", onSolve: (g) => {
      g.set("p47");
      g.set("towerFeed");
      g.give("frag1");
      g.addDoc("varga_terminal");
    },
    hints: ["Holt's memo says the hint is in the security archive.", "Her first dog is in the photo above her bunk; the founding year is on the entrance plaque."],
  },
  p_tower: {
    type: "switches", title: "Junction J-4", sub: "Bring the comm tower bus to 48 V", clue: ["tower_placard", "weather_log"], unit: "V", target: 48,
    switches: [["A", "BUS A · DE-ICER", 12], ["B", "BUS B · TRANSMITTER", 24], ["C", "BUS C · AMPLIFIER", 12], ["D", "BUS D · SCANNER", 24]],
    check: (a) => a.A && a.B && a.C && !a.D, onSolve: (g) => g.towerOn(),
    hints: ["The placard on the wall gives the rules; the weather log gives the outside temperature.", "It's −41 °C, so the de-icer must stay on. That leaves exactly one legal way to reach 48 V."],
  },
  p_steam: {
    type: "steam", title: "Manifold M-3", sub: "Send steam to the de-icing jets", clue: ["steam_tag"],
    lines: [["orange", "ORANGE", "#ff8a2a"], ["blue", "BLUE", "#3a8fe0"], ["grey", "GREY", "#9aa4ae"]],
    check: (a) => a.orange && !a.blue && !a.grey, onSolve: (g) => g.melt(),
    hints: ["Look at where each coloured pipe runs in the cave.", "Only one pipe runs along the wall to the ice. Open that one alone."],
  },
  p_gears: {
    type: "gears", title: "Bulkhead B-7 Override", sub: "Build the gear train: crank → idler → drive", clue: ["bulkhead_plate"],
    check: (a) => a.A === "gear_s" && a.B === "gear_m" && a.C === "gear_l", onSolve: (g) => {
      g.take("gear_s");
      g.take("gear_m");
      g.take("gear_l");
      g.open("d_bulkhead");
    },
    hints: ["The plate on the tunnel wall: 3:1 reduction, drive clockwise.", "Ratio = drive teeth ÷ crank teeth. Each extra gear in a chain flips the direction."],
  },
  p_locker: {
    type: "symbols", title: "Varga's Locker", sub: "Four-symbol lock", clue: ["whiteboard", "siteb_log"],
    check: (a) => a.join(",") === "flake,drop,spore,bloom", onSolve: (g) => {
      g.give("card_l5");
      g.give("frag2");
      g.set("locker");
    },
    hints: ["Varga's field log: the lock follows the life cycle on the corridor whiteboard.", "Start where it sleeps — dormant first."],
  },
  p_auth: {
    type: "challenge", title: "Lab Lockdown Panel", sub: "Clearance + access challenge", clue: ["protocol_card"],
    words: [["AURORA", "2281"], ["GLACIER", "4417"], ["TUNDRA", "9036"], ["NUNATAK", "5170"], ["PERMAFROST", "3842"]],
    check: (a, g, p) => a === p.words[g.seed % p.words.length][1], onSolve: (g) => g.lockdownOff(),
    hints: ["The protocol card on the Site B desk lists an answer for every challenge word."],
  },
  p_cryo: {
    type: "valves", title: "Cryo Coolant Loop", sub: "Restore coolant flow", clue: ["cryo_placard"], unit: "L/min", band: [9, 9], max: 6, gaugeMax: 12,
    valves: [["a", "LINE A", "#4fc8ff"], ["b", "LINE B", "#4f8cff"], ["c", "LINE C · PODS", "#a080ff"]],
    gauge: (v) => v.a + v.b + v.c,
    check: (v) => v.c === 2 && v.a + v.b + v.c === 9 && v.b <= v.a, onSolve: (g) => g.set("sysCryo"),
    hints: ["The placard on the west wall has three rules.", "C at exactly 2, total 9, and B no higher than A."],
  },
  p_labcircuit: {
    type: "circuit", title: "Containment Field Bus", sub: "Energise emitters A, B and C", clue: ["emitter_note"],
    ...grid(6, 5, {
      "0,2": { src: true, fixed: true, m: E, label: "BUS" },
      "1,2": [13, 1], "1,1": [6, 3], "2,1": [9, 2], "2,0": [6, 1], "3,0": [10, 1], "4,0": [10, 1], "5,0": { sink: "A", fixed: true, m: W },
      "1,3": [3, 2], "2,3": [14, 1], "3,3": [9, 3], "3,2": [6, 1], "4,2": [10, 1], "5,2": { sink: "B", fixed: true, m: W },
      "2,4": [3, 3], "3,4": [10, 1], "4,4": [10, 1], "5,4": { sink: "C", fixed: true, m: W },
      "0,0": [10, 1], "0,1": [3, 2], "0,3": [7, 1], "0,4": [12, 3], "1,0": [9, 1], "1,4": [5, 1], "3,1": [15, 0], "4,1": [6, 2], "4,3": [11, 1], "5,1": [5, 1], "5,3": [3, 2],
    }),
    check: (a, g, p) => p.cells.every((c, i) => !c?.sink || circuitFlow(p, a).has(i)), onSolve: (g) => g.set("sysField"),
    hints: ["Rotate junction blocks until all three emitters on the right are lit."],
  },
  p_spectro: {
    type: "tuner", title: "Sample Analyzer", sub: "Calibrate on the loaded core", clue: ["spectro_note"],
    dials: [["wl", "WAVELENGTH", 380, 700, 10, "nm", 560], ["gain", "GAIN", 1, 5, 1, "×", 1]],
    target: { wl: 470, gain: 3 }, meter: "spectrum",
    check: (a) => a.wl === 470 && a.gain === 3, onSolve: (g) => {
      g.set("sysAnalyzer");
    },
    hints: ["Orlov left a note about the analyzer on the lab bench."],
  },
  p_radio: {
    type: "tuner", title: "Emergency Relay Transmitter", sub: "Raise Station Kestrel", clue: ["freq_card", "radio_map"],
    dials: [["freq", "FREQUENCY", 400, 410, 0.1, "MHz", 403.0], ["bearing", "ANTENNA BEARING", 0, 355, 5, "°", 90]],
    target: { freq: 406.4, bearing: 215 }, meter: "signal",
    check: (a) => Math.abs(a.freq - 406.4) < 0.05 && a.bearing === 215, onSolve: (g) => g.commsOn(),
    hints: ["The frequency card is pinned by the door; the wall map shows the bearing."],
  },
  p_evac1: {
    type: "keypad", title: "Evacuation Control — Stage 1", sub: "Six-digit authorisation (fragments I · II · III)", len: 6, clue: ["frag1", "frag2", "frag3"],
    check: (a) => a === "471906", onSolve: (g) => g.set("evacAuth"), hints: ["Your three code fragments are in your inventory — enter them in order I, II, III."],
  },
  p_evac2: {
    type: "switches", title: "Evacuation Control — Stage 2", sub: "Reserve bus: 100 kW maximum", clue: ["evac_power_plate", "varga_message"], unit: "kW", target: 100, cap: 100,
    switches: [["heat", "HANGAR HEAT", 30], ["door", "DOOR MOTORS", 40], ["clamps", "CLAMPS", 20], ["seal", "LAB SEAL", 30], ["beacon", "BEACON", 10]],
    check: (a) => a.door && a.clamps && a.beacon && a.seal && !a.heat, onSolve: (g) => g.set("evacPower"),
    hints: ["The bus plate lists what launch needs.", "Varga's recording: never cut the lab seal while the pods are occupied."],
  },
  p_evac3: {
    type: "sequence", title: "Evacuation Control — Stage 3", sub: "Vehicle launch sequence", clue: ["evac_procedure"],
    buttons: [["door", "OPEN BAY DOOR"], ["clamps", "RELEASE CLAMPS"], ["seal", "SEAL LAB"], ["vent", "VENT HANGAR"]],
    check: (a) => a.join(",") === "seal,vent,door,clamps", onSolve: (g) => g.launch(), hints: ["The procedure is posted on the corridor wall beside the console."],
  },
};

/* ================================================================ chapters */
const docsRead = (g, ids) => ids.filter((d) => g.docs.includes(d)).length;
const partsIn = (g) => ["relay", "coil", "fuse"].filter((p) => g.f["inst_" + p] || g.has(p)).length;
const sysCount = (g) => ["sysCryo", "sysField", "sysAnalyzer"].filter((k) => g.f[k]).length;

export const CHAPTERS = [
  {
    n: 1, title: "The Silent Arrival", intro: "Outpost 47 stopped transmitting eleven days ago. The helicopter can't wait out the storm. You're alone.",
    spawn: SPAWN,
    objectives: [
      { id: "reach", text: "Reach Outpost 47", done: (g) => !!g.f.reached, hint: "Follow the red marker flags north through the snow." },
      { id: "shelter", text: "Find shelter from the storm", done: (g) => !!g.f.sheltered, hint: "The entrance is locked. A lit window glows in the supply shed to the east of the path." },
      { id: "card", text: "Locate an access card", done: (g) => g.has("card_access") || !!g.f.door_d_entrance, hint: "Lund's note in the shed: the card is in the frozen snowcat's glovebox. Take the ice pick." },
      { id: "door", text: "Open the entrance security door", done: (g) => !!g.f.door_d_entrance, hint: "Use the access card on the reader at the station entrance." },
      { id: "msg", text: "Discover the emergency message", done: (g) => g.docs.includes("emergency"), hint: "The terminal on the checkpoint desk is still looping a message." },
    ],
  },
  {
    n: 2, title: "The Power Failure", intro: "The station is dark and dead cold. Someone shut it down on purpose.",
    spawn: { x: 0, z: 18, yaw: 0 },
    objectives: [
      { id: "genroom", text: "Find the generator room", done: (g) => !!g.f.seen_generator, hint: "The generator room is off the main corridor, north-west." },
      { id: "parts", text: (g) => `Collect the missing components (${partsIn(g)}/3)`, done: (g) => partsIn(g) === 3 || !!g.f.repaired, hint: "Keene's note (in the living quarters) says where he hid each part: relay with him, coil on rack C in storage, fuse in the boiler room toolbox." },
      { id: "repair", text: "Repair the generator", done: (g) => !!g.f.repaired, hint: "Use the components on the generator's open housing." },
      { id: "route", text: "Route power through the distribution panel", done: (g) => !!g.f.routed, hint: "The distribution panel is on the generator room's west wall. Light all three outputs." },
      { id: "power", text: "Restore main power", done: (g) => !!g.f.power, hint: "Follow the cold-start procedure taped beside the start panel." },
      { id: "heat", text: "Activate the heating system", done: (g) => !!g.f.heat, hint: "Boiler room, off the north corridor. You'll need the valve wrench from the storage workbench." },
      { id: "control", text: "Unlock the central control room", done: (g) => !!g.f.door_d_control, hint: "With power back, the control room door at the end of the north corridor will open." },
    ],
  },
  {
    n: 3, title: "Missing Personnel", intro: "Seven crew. No bodies. No answers. Every log on the main server has been wiped.",
    spawn: { x: 0, z: -8, yaw: 0 },
    objectives: [
      { id: "quarters", text: "Explore the living quarters", done: (g) => !!g.f.seen_quarters, hint: "The living quarters are off the main corridor, south-west." },
      { id: "logs", text: (g) => `Read the personnel logs (${docsRead(g, ["tanaka_diary", "orlov_diary", "holt_log"])}/3)`, done: (g) => docsRead(g, ["tanaka_diary", "orlov_diary", "holt_log"]) === 3, hint: "Diaries lie on the bunks in the living quarters." },
      { id: "medical", text: "Unlock the medical room", done: (g) => !!g.f.door_d_medical, hint: "Tanaka set the keypad to Orlov's birthday. Check the calendar in the mess hall." },
      { id: "timeline", text: "Reconstruct the security timeline", done: (g) => !!g.solved.p_timeline, hint: "Holt's keycard (medical room) opens the security office. Match the CCTV clips to the door log." },
      { id: "password", text: "Crack Director Varga's terminal", done: (g) => !!g.solved.p_varga, hint: "The rebuilt archive holds her password hint. Her dog's name is on the photo by her bunk; the year is on the entrance plaque." },
      { id: "p47", text: "Discover what Project 47 is", done: (g) => g.docs.includes("varga_terminal"), hint: "Read the files on Varga's terminal in the control room." },
    ],
  },
  {
    n: 4, title: "Beneath the Ice", intro: "The crew went below. The way down is out there, in the storm.",
    spawn: { x: 18.6, z: -9, yaw: -Math.PI / 2 },
    objectives: [
      { id: "tower", text: "Restore power to the communication tower", done: (g) => !!g.f.towerPower, hint: "The east cargo door in storage leads outside. The tower junction is in the weather hut — read the placard and the weather log." },
      { id: "cave", text: "Locate the hidden cave entrance", done: (g) => !!g.f.caveOpen, hint: "Run the ground scan at the tower base, then dig out the drift at the north ridge with a shovel from the supply container." },
      { id: "ice", text: "Find a way through the ice caves", done: (g) => !!g.f.iceMelt, hint: "Follow the coloured pipes from the manifold in the first chamber. Only one leads to the ice." },
      { id: "bulkhead", text: "Open the maintenance bulkhead", done: (g) => !!g.f.door_d_bulkhead, hint: "Three gears are scattered in the caves and tunnels. Read the drive plate beside the bulkhead." },
      { id: "siteb", text: "Discover the abandoned research site", done: (g) => g.docs.includes("siteb_log"), hint: "Site B opens off the research corridor. Read Varga's field log on the desk." },
    ],
  },
  {
    n: 5, title: "Project 47", intro: "Behind the lockdown is everything Halvorsen wanted buried.",
    spawn: { x: U(0), z: -20, yaw: 0 },
    objectives: [
      { id: "clearance", text: "Find security clearance", done: (g) => g.has("card_l5") || !!g.f.lockdownOff, hint: "Varga's locker in Site B uses the life-cycle symbols from the corridor whiteboard." },
      { id: "lockdown", text: "Disable the laboratory lockdown", done: (g) => !!g.f.lockdownOff, hint: "The lockdown panel is beside the lab door. The protocol card on the Site B desk answers the challenge." },
      { id: "systems", text: (g) => `Restore the experimental systems (${sysCount(g)}/3)`, done: (g) => sysCount(g) === 3, hint: "Cryo plant (west wall), containment field bus (east), sample analyzer (north — needs the ice core from Site B)." },
      { id: "analyze", text: "Analyze the classified research logs", done: (g) => !!g.f.analyzed, hint: "The main terminal on the central island decrypts once all three systems run." },
      { id: "truth", text: "Discover the truth", done: (g) => !!g.f.truth, hint: "The containment chamber has unsealed. Listen to the recording inside." },
    ],
  },
  {
    n: 6, title: "The Final Transmission", intro: "Halvorsen will hear the tower. They are coming. Decide what the world gets.",
    spawn: { x: U(10), z: -56, yaw: -Math.PI / 2 },
    objectives: [
      { id: "comms", text: "Activate emergency communications", done: (g) => !!g.f.comms, hint: "The radio room is off the evacuation corridor. Frequency card and wall map are on the walls." },
      { id: "evac", text: "Restore the evacuation systems", done: (g) => !!g.f.evacPower, hint: "Evacuation control in the corridor: enter fragments I-II-III, then balance the reserve bus." },
      { id: "launch", text: "Complete the launch sequence", done: (g) => !!g.f.launch, hint: "The procedure is posted beside the evacuation console." },
      { id: "hangar", text: "Reach the evacuation hangar", done: (g) => !!g.f.seen_hangar, hint: "The blast door at the end of the corridor is open." },
      { id: "decide", text: "Make your final decision", done: (g) => !!g.f.ending, hint: "The command console beside the snowcat." },
    ],
  },
];

/* ================================================================ interactables */
// on(g) performs the action (and may return a panel to open). ok(g) returns
// true, or a string explaining why it can't be used yet.
const P = (x, y, z) => [x, y, z];
export const INTERACT = [
  /* ---------- chapter 1 */
  { id: "shed_heater", pos: P(19.5, 0.7, 40.6), r: 0.6, label: "Space heater", verb: (g) => (g.f.heater ? null : "Switch on"), on: (g) => {
    g.set("heater");
    g.sfx("switch");
    g.toast("The heater ticks and hums. Warmth, finally.", "good");
  } },
  { id: "ice_pick", pos: P(15.6, 1.0, 45.3), r: 0.45, pickup: "ice_pick", label: "Ice pick" },
  { id: "lund_note", pos: P(17.2, 0.98, 45.3), r: 0.35, doc: "lund_note", label: "Taped note" },
  { id: "bat_shed", pos: P(16.4, 1.35, 38.4), r: 0.35, pickup: "battery", label: "Battery pack" },
  { id: "glovebox", pos: P(-7.6, 1.5, 49.6), r: 0.7, label: "Snowcat cab door", verb: (g) => (g.f.glovebox ? null : g.has("ice_pick") ? "Break ice with" : "Open"), sub: (g) => (g.f.glovebox ? "" : g.has("ice_pick") ? "Ice Pick" : ""),
    ok: (g) => (g.f.glovebox ? "Empty glovebox" : g.has("ice_pick") ? true : "The latch is frozen solid — you need something to break the ice."),
    on: (g) => {
      g.set("glovebox");
      g.sfx("ice");
      g.give("card_access");
      g.toast("You chip the latch free. Lund's access card is in the glovebox.", "good");
    } },
  { id: "plaque", pos: P(-1.86, 1.6, 21.4), r: 0.45, doc: "plaque", label: "Brass plaque" },
  { id: "emg_terminal", pos: P(1.45, 1.15, 20.2), r: 0.5, doc: "emergency", label: "Checkpoint terminal", verb: "Play message", after: (g) => {
    if (!g.f.heardMsg) {
      g.set("heardMsg");
      g.sfx("static");
    }
  } },
  /* ---------- chapter 2 */
  { id: "roster", pos: P(-1.86, 1.6, 12.5), r: 0.5, doc: "roster", label: "Notice board" },
  { id: "keene_relay", pos: P(-17.6, 1.05, 5.4), r: 0.5, pickup: "relay", label: "Keene's footlocker — relay" },
  { id: "keene_note", pos: P(-19.4, 0.95, 5.6), r: 0.4, doc: "keene_note", label: "Keene's note" },
  { id: "coil", pos: P(16.4, 1.45, -11.5), r: 0.4, pickup: "coil", label: "Ignition coil (shelf C)" },
  { id: "wrench", pos: P(18.9, 1.0, -4.8), r: 0.45, pickup: "wrench", label: "Valve wrench" },
  { id: "fuse", pos: P(-6.5, 0.55, -2.8), r: 0.4, pickup: "fuse", label: "Toolbox — 200 A fuse" },
  { id: "bat_store", pos: P(9.6, 1.25, -3.4), r: 0.35, pickup: "battery", label: "Battery pack" },
  { id: "bat_gen", pos: P(-8.4, 1.05, -4), r: 0.35, pickup: "battery", label: "Battery pack" },
  { id: "gen_manual", pos: P(-12.8, 1.6, -15.86), r: 0.45, doc: "gen_manual", label: "Cold-start procedure" },
  { id: "generator", pos: P(-14, 1.2, -7.4), r: 0.9, label: "GEN-1 diesel generator",
    verb: (g) => (g.f.repaired ? null : ["relay", "coil", "fuse"].some((p) => g.has(p)) ? "Install" : "Inspect"),
    sub: (g) => (g.f.repaired ? "" : ["relay", "coil", "fuse"].filter((p) => g.has(p)).map((p) => ITEMS[p].name).join(", ")),
    ok: (g) => (g.f.repaired ? "Repaired — start it from the start panel" : true),
    on: (g) => g.installParts() },
  { id: "dist_panel", pos: P(-19.6, 1.4, -8), r: 0.7, puzzle: "p_gencircuit", label: "Distribution panel", ok: (g) => (g.f.repaired ? true : "Dead — the generator has to be repaired first.") },
  { id: "start_panel", pos: P(-11, 1.4, -15.6), r: 0.7, puzzle: "p_genstart", label: "Generator start panel",
    ok: (g) => (!g.f.repaired ? "The generator is missing parts." : !g.f.routed ? "Breaker won't hold — route the distribution panel first." : true) },
  { id: "boiler", pos: P(-4.5, 1.3, -9.6), r: 0.7, puzzle: "p_boiler", label: "Boiler manifold",
    ok: (g) => (!g.f.power ? "No power for the burner." : !g.has("wrench") ? "The valves are seized solid. You need a valve wrench." : true) },
  { id: "boiler_tag", pos: P(-3.2, 1.5, -9.84), r: 0.35, doc: "boiler_tag", label: "Startup tag" },
  { id: "lift_gen", pos: P(-17.6, 1.3, -12.3), r: 0.9, label: "Maintenance lift", verb: (g) => (g.f.liftOpen ? "Ride down" : "Inspect"),
    ok: (g) => (g.f.liftOpen ? (g.f.power ? true : "No power to the lift.") : "The cage gate is chained shut — from below."), on: (g) => g.portal("lift_down") },
  { id: "bat_comms", pos: P(6.3, 0.95, -5.3), r: 0.35, pickup: "battery", label: "Battery pack" },
  /* ---------- chapter 3 */
  { id: "tanaka_diary", pos: P(-19.4, 0.72, 8.2), r: 0.4, doc: "tanaka_diary", label: "Tanaka's diary" },
  { id: "orlov_diary", pos: P(-10.6, 0.72, 9.0), r: 0.4, doc: "orlov_diary", label: "Orlov's diary" },
  { id: "holt_log", pos: P(-10.6, 0.72, 13.0), r: 0.4, doc: "holt_log", label: "Holt's log" },
  { id: "photo", pos: P(-19.75, 1.45, 12.8), r: 0.35, doc: "photo", label: "Photograph" },
  { id: "calendar", pos: P(-9.86, 1.6, 5), r: 0.45, doc: "calendar", label: "Galley calendar" },
  { id: "bat_mess", pos: P(-6.6, 0.82, 6.6), r: 0.35, pickup: "battery", label: "Battery pack" },
  { id: "card_security", pos: P(6.8, 0.98, 15.4), r: 0.4, pickup: "card_security", label: "Holt's keycard (instrument tray)" },
  { id: "medlog", pos: P(3.4, 0.85, 4), r: 0.4, doc: "medlog", label: "Medical log" },
  { id: "door_log", pos: P(12.4, 0.85, 8), r: 0.4, doc: "door_log", label: "Door log printout" },
  { id: "holt_memo", pos: P(13.2, 0.1, 10.5), r: 0.4, doc: "holt_memo", label: "Security memo" },
  { id: "cctv", pos: P(15, 1.4, 15.2), r: 0.8, puzzle: "p_timeline", label: "CCTV archive console" },
  { id: "pell_log", pos: P(6.3, 0.85, -6.6), r: 0.4, doc: "pell_log", label: "Pell's comms log" },
  { id: "varga_terminal", pos: P(-4.95, 1.15, -12.2), r: 0.5, label: "Director's terminal", verb: (g) => (g.solved.p_varga ? "Read" : "Log in"),
    on: (g) => (g.solved.p_varga ? g.read("varga_terminal") : g.puzzle("p_varga")) },
  { id: "station_map", pos: P(6.85, 1.6, -13), r: 0.6, label: "Station map display", verb: "View", on: (g) => g.panel({ type: "map" }) },
  /* ---------- chapter 4 */
  { id: "weather_log", pos: P(36.4, 0.85, 11.4), r: 0.4, doc: "weather_log", label: "Weather log" },
  { id: "tower_placard", pos: P(39.86, 1.6, 7.3), r: 0.4, doc: "tower_placard", label: "Junction placard" },
  { id: "junction", pos: P(39.6, 1.3, 9), r: 0.7, puzzle: "p_tower", label: "Tower junction J-4", ok: (g) => (!g.f.power ? "No station power on the feed." : !g.f.towerFeed ? "FEED DISABLED — locked out from the director's terminal." : true) },
  { id: "scanner", pos: P(47.4, 1.2, -8), r: 0.7, label: "Ground scanner console", verb: (g) => (g.f.scanned ? "Read" : "Run scan"),
    ok: (g) => (g.f.towerPower ? true : "Dark. The tower has no power."), on: (g) => {
      if (!g.f.scanned) {
        g.set("scanned");
        g.sfx("scan");
      }
      return g.read("scan_result");
    } },
  { id: "shovel", pos: P(28, 1.0, -13.6), r: 0.6, pickup: "shovel", label: "Supply container — snow shovel" },
  { id: "bat_cont", pos: P(28, 1.0, 1.4), r: 0.6, pickup: "battery", label: "Supply container — batteries" },
  { id: "drift", pos: P(6, 1.0, -57), r: 1.5, label: (g) => (g.f.scanned ? "Snow drift over a steel door" : "Snow drift against the ridge"), verb: (g) => (g.f.caveOpen ? null : g.f.scanned ? "Dig out" : "Inspect"),
    sub: (g) => (g.f.scanned && g.has("shovel") ? "Snow Shovel" : ""),
    ok: (g) => (g.f.caveOpen ? false : !g.f.scanned ? "Just rock and drifted snow." : g.has("shovel") ? true : "Something is buried here. You need a shovel."), on: (g) => g.dig() },
  { id: "cave_door", pos: P(6, 1.2, -60.2), r: 1.1, label: "Steel door in the rock", verb: "Descend", ok: (g) => (g.f.caveOpen ? true : false), on: (g) => g.portal("cave_down") },
  { id: "cave_up", pos: P(U(0), 1.4, 61.5), r: 1.0, label: "Rope ladder to the surface", verb: "Climb", on: (g) => g.portal("cave_up") },
  { id: "steam_tag", pos: P(U(-9.7), 1.75, 48.4), r: 0.35, doc: "steam_tag", label: "Manifold tag" },
  { id: "manifold", pos: P(U(-9.5), 1.2, 47), r: 0.7, puzzle: "p_steam", label: "Steam manifold M-3", ok: (g) => (g.f.iceMelt ? "Steam is flowing to the jets." : true) },
  { id: "orlov_page", pos: P(U(2.5), 0.1, 31), r: 0.4, doc: "orlov_page", label: "Torn page" },
  { id: "gear_s", pos: P(U(-4.2), 0.62, 24.6), r: 0.4, pickup: "gear_s", label: "Small gear" },
  { id: "gear_m", pos: P(U(1.4), 0.5, -8), r: 0.4, pickup: "gear_m", label: "Toolbox — idler gear" },
  { id: "gear_l", pos: P(U(-5.2), 1.08, 1.2), r: 0.45, pickup: "gear_l", label: "Large gear" },
  { id: "bat_tun", pos: P(U(-4.2), 1.05, 6.6), r: 0.35, pickup: "battery", label: "Battery pack" },
  { id: "bulkhead_plate", pos: P(U(-1.86), 1.6, -9.6), r: 0.4, doc: "bulkhead_plate", label: "Drive plate" },
  { id: "lift_chain", pos: P(U(-8.2), 1.2, 4), r: 0.8, label: "Lift cage", verb: (g) => (g.f.liftOpen ? "Ride up" : "Remove chain"),
    on: (g) => {
      if (!g.f.liftOpen) {
        g.set("liftOpen");
        g.sfx("chain");
        g.toast("Chain off. The lift is a shortcut to the generator room now.", "good");
        return;
      }
      return g.portal("lift_up");
    }, ok: (g) => (g.f.liftOpen && !g.f.power ? "No power to the lift." : true) },
  { id: "lift_note", pos: P(U(-8.3), 1.7, 5.2), r: 0.35, doc: "lift_note", label: "Chalk writing" },
  { id: "siteb_log", pos: P(U(9), 0.85, -30.9), r: 0.45, doc: "siteb_log", label: "Varga's field log" },
  /* ---------- chapter 5 */
  { id: "whiteboard", pos: P(U(-1.86), 1.6, -30), r: 0.8, doc: "whiteboard", label: "Whiteboard" },
  { id: "protocol_card", pos: P(U(4.6), 0.85, -17.4), r: 0.4, doc: "protocol_card", label: "Protocol card" },
  { id: "core", pos: P(U(12.6), 1.05, -28.5), r: 0.4, pickup: "core", label: "Ice core C-47" },
  { id: "bat_siteb", pos: P(U(14.4), 1.2, -17), r: 0.35, pickup: "battery", label: "Battery pack" },
  { id: "locker", pos: P(U(15.5), 1.3, -20), r: 0.7, puzzle: "p_locker", label: "Varga's locker", ok: (g) => (g.f.locker ? "Empty." : true) },
  { id: "lockdown", pos: P(U(1.86), 1.4, -42.4), r: 0.55, puzzle: "p_auth", label: "Lockdown panel",
    ok: (g) => (g.f.lockdownOff ? "Lockdown lifted." : g.has("card_l5") ? true : "INSERT LEVEL-5 CLEARANCE") },
  { id: "cryo_placard", pos: P(U(-13.86), 1.6, -50.4), r: 0.4, doc: "cryo_placard", label: "Coolant placard" },
  { id: "cryo", pos: P(U(-11.3), 1.3, -54), r: 0.8, puzzle: "p_cryo", label: "Cryo coolant plant", ok: (g) => (g.f.sysCryo ? "Coolant flowing." : true) },
  { id: "emitter_note", pos: P(U(13.8), 1.6, -51), r: 0.4, doc: "emitter_note", label: "Bus note" },
  { id: "emitter", pos: P(U(11.8), 1.2, -48.5), r: 0.8, puzzle: "p_labcircuit", label: "Containment field bus", ok: (g) => (g.f.sysField ? "Field stable." : true) },
  { id: "spectro_note", pos: P(U(-4.6), 0.85, -64.5), r: 0.4, doc: "spectro_note", label: "Orlov's note" },
  { id: "analyzer", pos: P(U(-9), 1.2, -63.4), r: 0.8, label: "Sample analyzer", verb: (g) => (g.f.sysAnalyzer ? null : g.f.coreLoaded ? "Calibrate" : g.has("core") ? "Load" : "Inspect"),
    sub: (g) => (!g.f.coreLoaded && g.has("core") ? "Ice Core C-47" : ""),
    ok: (g) => (g.f.sysAnalyzer ? "Calibrated — specimen confirmed." : g.f.coreLoaded || g.has("core") ? true : "Sample chamber empty. It needs a core sample."),
    on: (g) => {
      if (!g.f.coreLoaded) {
        g.take("core");
        g.set("coreLoaded");
        g.sfx("clunk");
      }
      return g.puzzle("p_spectro");
    } },
  { id: "bat_lab", pos: P(U(6), 0.95, -46), r: 0.35, pickup: "battery", label: "Battery pack" },
  { id: "lab_terminal", pos: P(U(0), 1.1, -51.3), r: 0.7, label: "Main research terminal", verb: (g) => (g.f.analyzed ? "Read" : "Decrypt archive"),
    ok: (g) => (g.f.analyzed ? true : sysCount(g) < 3 ? `Archive locked — experimental systems ${sysCount(g)}/3` : true),
    on: (g) => {
      if (!g.f.analyzed) {
        g.set("analyzed");
        g.open("d_containment");
        g.sfx("unlock");
      }
      return g.read("research_logs");
    } },
  { id: "recording", pos: P(U(3), 1.1, -67.6), r: 0.5, label: "Recorder", verb: "Play", on: (g) => {
    if (!g.f.truth) {
      g.set("truth");
      g.give("frag3");
      g.open("d_evac");
    }
    return g.read("varga_message");
  } },
  { id: "vial", pos: P(U(-2.6), 0.98, -67.4), r: 0.4, pickup: "vial", label: "Specimen vial" },
  /* ---------- chapter 6 */
  { id: "freq_card", pos: P(U(25.86), 1.6, -50), r: 0.4, doc: "freq_card", label: "Frequency card" },
  { id: "radio_map", pos: P(U(18.14), 1.6, -50), r: 0.8, doc: "radio_map", label: "Wall map" },
  { id: "radio", pos: P(U(22), 1.2, -46.9), r: 0.8, puzzle: "p_radio", label: "Emergency relay transmitter", ok: (g) => (g.f.comms ? "Channel open to Kestrel." : true) },
  { id: "evac_procedure", pos: P(U(28.4), 1.6, -57.86), r: 0.4, doc: "evac_procedure", label: "Evacuation procedure" },
  { id: "evac_plate", pos: P(U(26.9), 1.25, -57.3), r: 0.3, doc: "evac_power_plate", label: "Bus plate" },
  { id: "evac_console", pos: P(U(26), 1.2, -57.2), r: 0.6, label: "Evacuation control", verb: (g) => (g.f.launch ? null : "Operate"),
    ok: (g) => (g.f.launch ? "Launch sequence complete." : !g.f.comms ? "OFFLINE — open an emergency relay channel first." : true),
    on: (g) => g.puzzle(!g.solved.p_evac1 ? "p_evac1" : !g.solved.p_evac2 ? "p_evac2" : "p_evac3") },
  { id: "final_console", pos: P(U(41), 1.2, -49.9), r: 0.7, label: "Command console", verb: "Decide", ok: (g) => (g.f.ending ? false : true), on: (g) => g.panel({ type: "decision" }) },
];

/* Scripted environmental beats: fire once when the player enters a zone. */
export const ZONE_EVENTS = {
  checkpoint: { sfx: "clank", say: null },
  generator: { sfx: "groan", say: ["You", "Diesel and cold metal. Someone pulled this engine apart on purpose."] },
  quarters: { sfx: "radio", say: ["Radio", "…kssh… don't go… below… kssh… keep it… cold…"] },
  medical: { sfx: "drip", say: null },
  storage: { sfx: "clank", say: null },
  cave_a: { sfx: "crack", say: ["You", "The ice is glowing. Not reflecting — glowing."] },
  tunnel: { sfx: "groan", say: null },
  siteb: { sfx: "drip", say: ["You", "Coffee cups. Half-written notes. They left in a hurry."] },
  lab: { sfx: "hum", say: null },
  contain: { sfx: "heart", say: ["You", "Seven pods. Six are frosted over. Someone is inside every one."] },
  hangar: { sfx: "clank", say: ["Kestrel", "Outpost 47, Kestrel relay. We read you. Halvorsen aircraft inbound to your position — ETA forty minutes."] },
};

export const ENDINGS = {
  expose: {
    title: "The Truth, Unfiltered",
    body: "The archive goes out on every channel Kestrel can reach — the logs, the orders, the specimen data. By morning Halvorsen's aircraft turns back. By the week's end there are inquiries in four countries.\n\nThe crew are flown south in their pods under international medical escort. Doctors finally know what they're treating.\n\nBut the recipe is out there now, too. Somewhere, someone is already reading it very carefully.",
  },
  destroy: {
    title: "Nothing Left to Find",
    body: "The incinerator takes the samples and the purge takes the archive. Specimen 47 ends where it began: in the dark, in the cold, forgotten.\n\nYou send one message — a medical beacon for seven frozen people — and drive into the storm.\n\nHalvorsen finds an empty lab and a station with no records. No one will ever prove what happened at Outpost 47. No one will ever be able to do it again.",
  },
};
