/**
 * Last Shelter — the long stories: radio transmissions, rescue attempts,
 * the mystery under the floor, supply discoveries and expedition news.
 * Several of these are chained (chainOnly) and lead to endings.
 */
import { out, tool, isHere, needTool, needRes, needAll, needRadio, presentIds, radioOn } from "./util.js";

const rescueIn = (S, d) => ({ rescueDay: S.day + d });

const RADIO = [
  {
    id: "radio_relief",
    cat: "radio",
    chainOnly: true,
    title: "Ridgeline Relief",
    text: "“...this is Ridgeline Relief Corps. We are clearing sectors north to south. Survivors: keep this frequency. Instructions will follow.” The message loops.",
    choices: [
      { label: "Keep listening for instructions", req: needAll(needRadio, needRes("batteries", 1)), run: () => out("You leave it on all night, taking shifts. Near dawn: “Sector Nine flyover in five nights. Show a light.”", { batteries: -1, flag: { relief: true }, queue: [{ id: "relief_signal", in: 5 }], all: { morale: 10 } }) },
      { label: "Write down the call sign and save power", run: () => out("You'll check back. The radio goes quiet.", { flag: { relief: true }, queue: [{ id: "relief_signal", in: 8 }], all: { morale: 5 } }) },
    ],
  },
  {
    id: "relief_signal",
    cat: "rescue",
    chainOnly: true,
    title: "The Flyover",
    text: "Tonight's the night. A distant thudding of rotors, coming closer. Ridgeline asked for a light from the ground.",
    choices: [
      { label: "Signal with the flashlight", req: needTool("flashlight"), run: (S, c, r) => (r < 0.82 ? out("{A} stands in the yard sweeping the beam back and forth. The helicopter banks, circles once, and blinks back. They've seen you.", { flag: rescueIn(S, 4), all: { morale: 20 } }) : out("The beam is too weak through the haze. The rotors fade away.", { queue: [{ id: "relief_retry", in: 5 }], all: { morale: -6 } })) },
      { label: "Light a fire in the yard", run: (S, c, r) => (r < 0.45 ? out("Broken furniture and a splash of fuel. The blaze lights up the street — and the helicopter turns toward it.", { flag: rescueIn(S, 5), all: { morale: 18 }, who: { fatigue: 10 } }) : out("The fire won't catch properly in the damp. The rotors pass overhead and fade.", { queue: [{ id: "relief_retry", in: 6 }], who: { fatigue: 10 }, all: { morale: -6 } })) },
      { label: "Too dangerous to go up", run: () => out("You listen to the rotors come and go.", { queue: [{ id: "relief_retry", in: 8 }], all: { morale: -8 } }) },
    ],
  },
  {
    id: "relief_retry",
    cat: "rescue",
    chainOnly: true,
    title: "Another Pass",
    text: "The radio crackles: “Ridgeline, sector sweep, final pass tonight.” This may be the last chance.",
    choices: [
      { label: "Signal with the flashlight", req: needTool("flashlight"), run: (S, c, r) => (r < 0.85 ? out("This time the beam cuts clean through the night. The searchlight swings back and holds on you.", { flag: rescueIn(S, 3), all: { morale: 20 } }) : out("They don't see it. They don't come back.", { flag: { reliefMissed: true }, all: { morale: -12 } })) },
      { label: "Build a bigger fire", run: (S, c, r) => (r < 0.55 ? out("A bonfire you could see from space. The helicopter dips its nose in answer.", { flag: rescueIn(S, 4), all: { morale: 18 } }) : out("It smokes more than it burns. The pass goes by.", { flag: { reliefMissed: true }, all: { morale: -12 } })) },
      { label: "Stay below", run: () => out("Quiet. Then quieter.", { flag: { reliefMissed: true }, all: { morale: -10 } }) },
    ],
  },
  {
    id: "cedar_talk",
    cat: "radio",
    chainOnly: true,
    title: "Cedar Hollow",
    text: "The voice from the mast frequency belongs to Wren, at a place called Cedar Hollow, twenty miles north. “We have a greenhouse and a well. But we've been burned before. Prove you're not raiders.”",
    choices: [
      { label: "Ask how to prove it", run: () => out("“We need medicine. Leave some at the water tower on Kell Road. Then we'll talk.”", { queue: [{ id: "cedar_test", in: 4 }], all: { morale: 8 } }) },
      { label: "Ask for advice instead", run: () => out("Wren talks you through growing mushrooms in the dark, and catching rain. “Stay alive. We'll be here.”", { flag: { seeds: true, cedarAdvice: true }, queue: [{ id: "cedar_test", in: 8 }], all: { morale: 6 } }) },
      { label: "Don't trust them", run: () => out("You switch off. Maybe they're raiders. Maybe you're the ones who can't be trusted any more.", { all: { morale: -3 } }) },
    ],
  },
  {
    id: "cedar_test",
    cat: "rescue",
    chainOnly: true,
    title: "Wren's Request",
    text: "Wren again, on schedule. “The water tower on Kell Road. Medicine, or a person we can talk to face-to-face. Your choice.”",
    choices: [
      { label: "Leave 2 Medicine at the tower", req: needRes("meds", 2), run: (S) => out("{A} leaves the pills in a coffee tin. That night Wren comes back on: “Received. We're coming for you. Five days.”", { meds: -2, flag: { cedarDay: S.day + 5 }, who: { fatigue: 10 }, all: { morale: 18 } }) },
      { label: "Send {A} to meet them", req: (S, c) => (S.fam[c.who]?.hp >= 45 && !S.fam[c.who]?.injured) || `${c.who ? c.who[0].toUpperCase() + c.who.slice(1) : "No one"} isn't fit`, run: (S, c, r) => (r < 0.78 ? out("{A} is gone all day and comes back glowing. “They're real. They're kind. They're coming.”", { flag: { cedarDay: S.day + 4 }, who: { fatigue: 18 }, all: { morale: 20 } }) : out("{A} waits at the tower until dark. Nobody comes — and on the way back, someone else does.", { who: { injured: 1, fatigue: 18 }, queue: [{ id: "cedar_test", in: 5 }] })) },
      { label: "Not yet", run: () => out("“We'll keep the channel open,” Wren says. She sounds disappointed.", { queue: [{ id: "cedar_test", in: 7 }] }) },
    ],
  },
  {
    id: "numbers",
    cat: "radio",
    minDay: 5,
    when: radioOn,
    title: "The Numbers Station",
    text: "On a band that was empty yesterday: a child's voice reading numbers. Four, two, seven, nine. Over and over.",
    choices: [
      { label: "Write them all down", run: () => out("Pages of digits. They look like grid references — and one of them is right under your feet.", { flag: { numbers: true }, queue: [{ id: "tapping", in: 2 }] }) },
      { label: "Let Remy decode them", req: (S) => isHere(S, "remy") || "Remy isn't here", run: () => out("Remy cracks it in an hour: “It's a list of shelters. We're on it. So is something called the Deep Line.”", { flag: { numbers: true, deepHint: true }, m: { remy: { morale: 14 } }, queue: [{ id: "tapping", in: 1 }] }) },
      { label: "Switch it off", run: () => out("Some things are better not listened to.", { all: { morale: -1 } }) },
    ],
  },
  {
    id: "requests",
    cat: "radio",
    once: false,
    cooldown: 12,
    minDay: 4,
    when: radioOn,
    title: "Requests Hour",
    text: "A pirate DJ called Lucky Pete is taking requests by morse code. People are actually tapping in.",
    choices: [
      { label: "Listen all night", req: needRes("batteries", 1), run: () => out("Pete plays the song from your wedding. Hollis pretends there's dust in his eye.", { batteries: -1, all: { morale: 12 } }) },
      { label: "One song, then off", run: () => out("Three minutes of something like normal.", { all: { morale: 4 } }) },
      { label: "Tap in a request", req: needRes("batteries", 1), run: (S, c, r) => (r < 0.5 ? out("“This one's for the family on Linden Road!” Pip screams.", { batteries: -1, all: { morale: 16 } }) : out("Pete never gets to it. Still, someone out there heard you.", { batteries: -1, all: { morale: 5 } })) },
    ],
  },
  {
    id: "evac_notice",
    cat: "radio",
    minDay: 8,
    when: (S) => radioOn(S) && !S.exp,
    title: "Evacuation Notice",
    text: "An official broadcast: “Residents of the eastern districts: a supply point is open at Harmon Stadium for forty-eight hours.”",
    choices: [
      { label: "Send {A} to the stadium", run: (S, c, r) => (r < 0.45 ? out("The supply point is real. {A} comes back with a ration box and a registration slip.", { food: 3, water: 3, flag: { registered: true }, who: { fatigue: 18 } }) : r < 0.8 ? out("The stadium is empty, picked clean. A long walk for one bottle.", { water: 1, who: { fatigue: 18 } }) : out("It's a trap set by looters. {A} gets out, barely.", { who: { injured: 1, fatigue: 18 } })) },
      { label: "Stay put", run: () => out("Probably for the best. Probably.", {}) },
    ],
  },
];

const MYSTERY = [
  {
    id: "tapping",
    cat: "mystery",
    minDay: 8,
    title: "Tapping from Below",
    text: "Late at night, with everyone quiet: tapping. Not from the hatch. From under the floor.",
    choices: [
      { label: "Tap back", run: () => out("Silence. Then, faintly, the same rhythm returned. Something down there is listening.", { flag: { tapped: true }, queue: [{ id: "wall_crack", in: 4 }], all: { morale: -2 } }) },
      { label: "Press an ear to the floor", run: () => out("Water, maybe. Or machinery. Or footsteps a very long way down.", { flag: { tapped: true }, queue: [{ id: "wall_crack", in: 6 }] }) },
      { label: "Ignore it", run: () => out("You turn over and sleep. Eventually.", { all: { fatigue: 4 } }) },
    ],
  },
  {
    id: "wall_crack",
    cat: "mystery",
    chainOnly: true,
    title: "A Draft in the Wall",
    text: "The back wall has cracked along a seam that doesn't look like a crack — too straight. Cold air flows through, smelling of oil and old stone.",
    choices: [
      { label: "Break through with the tool kit", req: needTool("toolkit"), run: () => out("Two days of chiselling. Behind the wall: a narrow tunnel with rusty cable trays, sloping down into darkness.", { shelter: -12, flag: { tunnelOpen: true }, all: { fatigue: 12 } }) },
      { label: "Chip at it by hand", run: (S, c, r) => (r < 0.45 ? out("Bloody knuckles and a hole big enough to crawl through. Beyond: a tunnel, going down.", { shelter: -8, flag: { tunnelOpen: true }, who: { fatigue: 15 } }) : out("A slab shears off and crushes {A}'s fingers.", { who: { injured: 1 }, shelter: -4 })) },
      { label: "Seal it up", run: () => out("Cement and rags. Whatever's down there can stay there.", { shelter: 4 }) },
    ],
  },
  {
    id: "builder_plans",
    cat: "mystery",
    minDay: 9,
    title: "The Builder's Plans",
    text: "A tin box behind a loose panel: the shelter's original plans, 1962. A dotted line runs from the back wall marked “SERVICE LINK — DO NOT BREACH”.",
    choices: [
      { label: "Find where the line meets the wall", run: () => out("You tap along the back wall. One section sounds hollow.", { flag: { plans: true }, queue: [{ id: "wall_crack", in: 3 }] }) },
      { label: "Use the notes to reinforce weak points", run: () => out("The engineer marked every weak seam. You shore up three of them.", { shelter: 9, all: { fatigue: 6 } }) },
      { label: "Burn them for a little warmth", run: () => out("Old paper burns fast and bright.", { all: { morale: 3 } }) },
    ],
  },
  {
    id: "whispers",
    cat: "mystery",
    minDay: 10,
    when: (S) => !!S.flags.tunnelOpen && !S.flags.deepSeen,
    title: "Voices in the Tunnel",
    text: "From the dark tunnel mouth: voices. Too far to make out words. A warm light flickers once, far down.",
    choices: [
      { label: "Follow them with the flashlight", req: needTool("flashlight"), run: (S, c, r) => (r < 0.65 ? out("{A} follows the light for an hour and comes back pale and excited, talking about tiles and a train.", { flag: { deepSeen: true }, queue: [{ id: "deep_line", in: 1 }], who: { fatigue: 15 } }) : out("{A} gets turned around in the dark and falls down a service ladder.", { who: { injured: 1, fatigue: 10 } })) },
      { label: "Call down into the dark", run: (S, c, r) => (r < 0.5 ? out("A paper boat drifts back on the trickle of water. Inside: “WELCOME. COME DOWN WHEN READY.”", { all: { morale: 6 }, flag: { welcomed: true } }) : out("The voices stop. That's worse.", { all: { morale: -5 } })) },
      { label: "Board it up", run: () => out("Planks across the hole. The voices go on, muffled.", { flag: { tunnelOpen: false }, shelter: 3 }) },
    ],
  },
  {
    id: "deep_line",
    cat: "mystery",
    chainOnly: true,
    title: "The Deep Line",
    text: "{A} describes it again and again: a metro station never opened to the public. Clean tiles, humming lights, sealed doors stencilled RESERVE — WATER / SEED / MEDICAL. And notes on the wall, in many hands: “You're safe here.”",
    choices: [
      { label: "Move the family down", req: (S) => (S.exp ? "Someone is still out" : true), run: () => out("You carry everything you own down the tunnel. The lights brighten as you come.", { ending: "discovery" }) },
      { label: "Bring back supplies, stay here", run: () => out("Two trips with full arms: water, sealed rations, batteries. The shelter feels rich.", { water: 3, food: 3, batteries: 2, flag: { deepLooted: true }, queue: [{ id: "deep_return", in: 7 }], all: { morale: 10 } }) },
      { label: "Seal the tunnel. It isn't ours.", run: () => out("Some doors are better left closed.", { flag: { tunnelOpen: false }, shelter: 4 }) },
    ],
  },
  {
    id: "deep_return",
    cat: "mystery",
    chainOnly: true,
    title: "Lights Below",
    text: "The tunnel glows warmer every night. Someone has left a lantern at the shelter end, and a note: “The offer stands.”",
    choices: [
      { label: "Go down for good", req: (S) => (S.exp ? "Someone is still out" : true), run: () => out("This time you don't come back up.", { ending: "discovery" }) },
      { label: "Take the lantern, stay", run: () => out("A good lantern. You keep it lit for them.", { batteries: 2, all: { morale: 4 } }) },
    ],
  },
  {
    id: "green_light",
    cat: "mystery",
    minDay: 9,
    title: "Green Glow",
    text: "At night, a faint green light leaks around the hatch rim. Pip says it's fairies. {A} isn't so sure.",
    choices: [
      { label: "Take a look", run: (S, c, r) => (r < 0.55 ? out("Glowing fungus has bloomed across the rubble in the yard. Edible, according to June's field guide memory.", { food: 2, flag: { seeds: true } }) : out("Something green and glowing, and a smell that makes {A}'s eyes water. {A} retreats, coughing.", { who: { sick: 1 } })) },
      { label: "Stay below", run: () => out("By morning the glow is gone.", {}) },
    ],
  },
];

const DISCOVERY = [
  {
    id: "loose_brick",
    cat: "discovery",
    minDay: 3,
    title: "The Loose Brick",
    text: "{A} leans on the wall and a brick shifts. Behind it, a cavity — and the corner of a tin box.",
    choices: [
      { label: "Pry it open with the tool kit", req: needTool("toolkit"), run: () => out("An old emergency cache: tins, a canteen and a sealed first aid pouch.", { food: 2, water: 2, meds: 1 }) },
      { label: "Dig it out by hand", run: (S, c, r) => (r < 0.6 ? out("Fingernails and patience. Tins and a canteen.", { food: 2, water: 1 }) : out("The bricks above shift and drop onto {A}'s hand. One tin comes free.", { food: 1, who: { injured: 1 } })) },
    ],
  },
  {
    id: "seed_packets",
    cat: "discovery",
    minDay: 4,
    when: (S) => !S.flags.seeds,
    title: "Seed Packets",
    text: "In the lining of an old coat: seed packets. Beans, peas — and a jar of oyster mushroom spawn, still alive.",
    choices: [
      { label: "Keep them safe for planting", run: () => out("Wrapped in plastic and tucked on the top shelf. A future, maybe.", { flag: { seeds: true }, all: { morale: 5 } }) },
      { label: "Soak and eat the beans", run: () => out("Chewy and bland. But food.", { food: 1 }) },
    ],
  },
  {
    id: "planting",
    cat: "discovery",
    once: false,
    cooldown: 6,
    when: (S) => !!S.flags.seeds && !S.flags.garden,
    title: "Planting Beds",
    text: "The seeds are waiting. Mushrooms grow in the dark — all they need is damp beds, some water and a little patience.",
    choices: [
      { label: "Build proper beds (2 Water)", req: needAll(needTool("toolkit"), needRes("water", 2)), run: () => out("Crates, damp sawdust and spawn. In a week: tiny white caps.", { water: -2, flag: { garden: true }, all: { morale: 8 } }) },
      { label: "Improvise beds (3 Water)", req: needRes("water", 3), run: (S, c, r) => (r < 0.6 ? out("Cardboard and wet rags. It takes.", { water: -3, flag: { garden: true }, all: { morale: 8 } }) : out("It rots instead of sprouting. Back to the drawing board.", { water: -3, all: { morale: -4 } })) },
      { label: "Not yet", run: () => out("Water is too precious right now.", {}) },
    ],
  },
  {
    id: "collector",
    cat: "discovery",
    once: false,
    cooldown: 8,
    minDay: 6,
    when: (S) => !S.flags.collector,
    title: "Rain on the Hatch",
    text: "Clean rain at last, drumming on the hatch. If you could catch it properly, you'd never be thirsty again.",
    choices: [
      { label: "Build a proper collector", req: needTool("toolkit"), run: () => out("Gutter, filter of sand and charcoal, a pipe down through the vent. It works!", { flag: { collector: true }, water: 1, all: { morale: 8 } }) },
      { label: "Rig a tarp funnel", run: (S, c, r) => (r < 0.5 ? out("A tarp, a funnel, a lot of tape. It holds.", { flag: { collector: true }, water: 1 }) : out("The wind takes the tarp. You catch one bottle's worth.", { water: 1 })) },
      { label: "Just fill some bottles", run: () => out("Two bottles, full and clean.", { water: 2 }) },
    ],
  },
  {
    id: "laundromat",
    cat: "discovery",
    chainOnly: true,
    title: "The Laundromat on Fifth",
    text: "The boy said: under the counter at the laundromat. It's three streets away.",
    choices: [
      { label: "Send {A} to check", run: (S, c, r) => (r < 0.8 ? out("Under the counter: a stash someone forgot. {A} comes back loaded.", { food: 3, water: 2, who: { fatigue: 12 } }) : out("Someone else got there first and they didn't want company.", { who: { injured: 1, fatigue: 12 } })) },
      { label: "Not worth the risk", run: () => out("You'll never know.", {}) },
    ],
  },
  {
    id: "vending",
    cat: "discovery",
    minDay: 4,
    title: "The Vending Machine",
    text: "{A} remembers the vending machine at the bus stop on the corner. Unbroken, last time anyone looked.",
    choices: [
      { label: "Open it with the tool kit", req: needTool("toolkit"), run: () => out("The panel pops off neatly. Snacks and soda for everyone.", { food: 2, water: 2, who: { fatigue: 8 } }) },
      { label: "Smash it open", run: (S, c, r) => (r < 0.65 ? out("Glass everywhere, but snacks too.", { food: 2, water: 1, who: { fatigue: 8 } }) : out("The glass bites back. One bag of crisps for a cut arm.", { food: 1, who: { injured: 1 } })) },
      { label: "Leave it for someone else", run: () => out("Someone else will be grateful.", { all: { morale: 2 } }) },
    ],
  },
  {
    id: "airdrop",
    cat: "discovery",
    minDay: 12,
    title: "A Crate from the Sky",
    text: "A parachute drifts down over the park and snags in the oaks. A green crate dangles beneath it. Other hatches are opening too.",
    choices: [
      { label: "Race for it now", run: (S, c, r) => (r < 0.55 ? out("{A} gets there first and drags it home. Rations, water, a medical pouch.", { food: 3, water: 3, meds: 1, who: { fatigue: 15 } }) : out("A scuffle at the tree. {A} comes back with a split lip and nothing else.", { who: { injured: 1, fatigue: 15 } })) },
      { label: "Wait for dark", run: (S, c, r) => (r < 0.4 ? out("The crowd's gone. They missed a box wedged in the roots.", { food: 1, water: 2 }) : out("Nothing left but the parachute.", { all: { morale: -2 } })) },
      { label: "Let the others have it", run: () => out("Maybe someone needed it more.", {}) },
    ],
  },
];

const EXPEDITION_EVENTS = [
  {
    id: "volunteer",
    cat: "expedition",
    minDay: 4,
    when: (S) => !S.exp && presentIds(S).length >= 2,
    pick: "strong",
    title: "{A} Volunteers",
    text: "{A} is lacing {a.p} boots. “Mabel's corner store. Two days there and back. Somebody has to.”",
    choices: [
      { label: "Send {a.o} now", req: (S, c) => (S.fam[c.who]?.hp >= 30 ? true : "Too weak"), run: () => out("A hug at the ladder, and {A} is gone.", { startExp: { dest: "store" } }) },
      { label: "Make a proper plan first", run: () => out("Routes, signals, a time to be back by. Next trip will go better.", { flag: { riskIntel: true }, who: { morale: 3 } }) },
      { label: "Not yet", run: () => out("{A} unlaces the boots, slowly.", { who: { morale: -4 } }) },
    ],
  },
  {
    id: "late",
    cat: "expedition",
    when: (S) => !!S.exp && S.day - S.exp.start >= 2 && presentIds(S).length >= 1,
    title: "{X} Is Late",
    text: "{X} should have been back by now. Every noise at the hatch makes everyone jump.",
    choices: [
      { label: "Keep a light burning at the hatch", req: needRes("batteries", 1), run: () => out("A lantern in the yard, all night. If {X} is close enough, the light will guide the way home.", { batteries: -1, expDays: -1, all: { morale: 3 } }) },
      { label: "{A} goes out to look", run: (S, c, r) => (r < 0.5 ? out("{A} finds {X}'s trail markers and leaves a note on the route: the fastest way home.", { expDays: -1, who: { fatigue: 12 } }) : out("{A} gets lost in the ash and comes back hurt.", { who: { injured: 1, fatigue: 12 } })) },
      { label: "Wait", run: () => out("You wait. That's all you can do.", { all: { morale: -4 } }) },
    ],
  },
  {
    id: "exp_note",
    cat: "expedition",
    when: (S) => !!S.exp && S.exp.left >= 2,
    title: "A Note at the Hatch",
    text: "A scrap of paper wedged in the hatch, in {X}'s handwriting: “Found a big stash. Need two more days to bring it all. Don't worry.”",
    choices: [
      { label: "Trust {X}", run: () => out("You tape the note to the wall and wait.", { expDays: 2, expBonus: true }) },
      { label: "Leave a reply: come home now", run: () => out("{A} pins a note to the fence: “Come home. Whatever you've got is enough.”", { expDays: -1, all: { morale: 2 } }) },
    ],
  },
  {
    id: "outside_stories",
    cat: "expedition",
    when: (S) => !!S.lastExp && S.lastExp.outcome !== "lost" && S.fam[S.lastExp.who]?.alive && !S.fam[S.lastExp.who]?.away,
    once: false,
    cooldown: 10,
    title: "Stories from Outside",
    text: "The family sits around the bulb while the last traveller describes the world up there.",
    choices: [
      { label: "Ask about other survivors", run: () => out("“There's a radio mast on the ridge. People say someone answered from it.”", { flag: { mastTip: true }, all: { morale: 4 } }) },
      { label: "Ask about the dangers", run: () => out("Routes to avoid, dogs, the bad crossroads. You'll be smarter out there.", { flag: { riskIntel: true } }) },
      { label: "Don't tell us. Not tonight.", run: () => out("Instead you tell old stories. Better ones.", { all: { morale: 6 } }) },
    ],
  },
  {
    id: "map_marks",
    cat: "expedition",
    needItem: "map",
    minDay: 3,
    title: "Marks on the Map",
    text: "Unfolded on the table, the map has someone else's pencil marks: a circle around the rail yard, an X on the ridge, a note — “mast still live?”",
    choices: [
      { label: "Study every route", run: () => out("You memorise the safe streets. Expeditions will be safer.", { flag: { riskIntel: true, mastTip: true } }) },
      { label: "Let Pip add her shortcuts", req: (S) => isHere(S, "pip") || "Pip isn't here", run: () => out("Pip draws in every fence hole and alley. Shorter trips to the store and Elm Street.", { flag: { pipMap: true }, m: { pip: { morale: 6 } } }) },
    ],
  },
  {
    id: "sweep",
    cat: "rescue",
    minDay: 40,
    weight: 4,
    when: (S) => !S.flags.rescueDay,
    title: "Megaphones",
    text: "A truck rolling slowly down the street, a megaphone: “Civil recovery. Survivors, show yourselves. Civil recovery.”",
    choices: [
      { label: "Rush up and wave", run: (S, c, r) => (r < 0.7 ? out("{A} bursts out of the hatch waving a shirt. The truck stops.", { flag: { rescueDay: S.day + 1 }, all: { morale: 22 } }) : out("By the time the hatch is open, the truck has turned the corner.", { all: { morale: -8 } })) },
      { label: "Stay hidden — could be a trick", run: () => out("You'll never know.", { all: { morale: -3 } }) },
    ],
  },
  {
    id: "helicopter",
    cat: "rescue",
    minDay: 24,
    when: (S) => !S.flags.rescueDay && !S.flags.relief,
    title: "Rotors at Dusk",
    text: "A helicopter, low, sweeping a searchlight across the rooftops. Nobody on the radio warned you. It's heading this way.",
    choices: [
      { label: "Signal with the flashlight", req: needTool("flashlight"), run: (S, c, r) => (r < 0.6 ? out("The searchlight swings onto the yard and holds. Someone waves from the open door.", { flag: { rescueDay: S.day + 2 }, all: { morale: 20 } }) : out("It doesn't see you.", { all: { morale: -6 } })) },
      { label: "Wave from the hatch", run: (S, c, r) => (r < 0.25 ? out("Somehow — they see you.", { flag: { rescueDay: S.day + 2 }, all: { morale: 20 } }) : out("Too dark. Too small. It's gone.", { all: { morale: -5 } })) },
      { label: "Hide — it could be anyone", run: () => out("It passes over and away.", {}) },
    ],
  },
];

export default [...RADIO, ...MYSTERY, ...DISCOVERY, ...EXPEDITION_EVENTS];
