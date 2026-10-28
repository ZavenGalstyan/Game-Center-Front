/**
 * Last Shelter — events inside the shelter: equipment trouble, leaks,
 * spoiling supplies and sickness.
 */
import { out, tool, isHere, needTool, needRes, needHere, anySick, anyHurt, presentIds } from "./util.js";

const EQUIPMENT = [
  {
    id: "bulb",
    cat: "equipment",
    minDay: 3,
    title: "The Light Goes Out",
    text: "Pop. The bulb over the table dies, and the shelter shrinks to the size of a match flame.",
    choices: [
      { label: "Rig a lamp from batteries", req: needRes("batteries", 1), run: () => out("A battery, two wires, a bulb from the flashlight drawer. Light again — dimmer, warmer.", { batteries: -1, all: { morale: 3 } }) },
      { label: "Wire in the flashlight", req: needTool("flashlight"), run: () => out("The flashlight becomes a ceiling lamp, permanently. You'll miss it outside.", { item: { flashlight: -1 }, all: { morale: 5 } }) },
      { label: "Live in the dark for now", run: () => out("Shapes in the dark. Pip sleeps between her parents.", { all: { morale: -7 } }) },
    ],
  },
  {
    id: "radio_sputter",
    cat: "equipment",
    when: (S) => tool(S, "radio") && S.radio > 0,
    title: "The Radio Sputters",
    text: "The radio pops and squeals, then drops to a whisper. A smell of hot dust comes out of the back.",
    choices: [
      { label: "Open it up with the tool kit", req: needTool("toolkit"), run: (S, c, r) => (r < 0.8 || isHere(S, "remy") ? out("A loose valve, reseated. It hums happily.", { radio: 25 }) : out("A screwdriver slips. Something inside goes ping.", { radio: -30 })) },
      { label: "Give it a good smack", run: (S, c, r) => (r < 0.5 ? out("Percussive maintenance. It works!", { radio: 12, all: { morale: 2 } }) : out("It works less.", { radio: -28 })) },
      { label: "Switch it off and let it cool", run: () => out("It sulks, but survives.", { radio: -12 }) },
    ],
  },
  {
    id: "vent_fan",
    cat: "equipment",
    minDay: 5,
    title: "The Vent Fan Grinds",
    text: "The hand-cranked vent fan is shrieking with every turn. Something in the bearing is going.",
    choices: [
      { label: "Strip and re-grease it", req: needTool("toolkit"), run: () => out("Grease from the tool kit tin. It spins silent and smooth.", { shelter: 4, who: { fatigue: 6 } }) },
      { label: "Stop cranking it for a while", run: () => out("The air turns thick and sleepy.", { all: { fatigue: 8, morale: -2 } }) },
      { label: "Keep cranking", run: (S, c, r) => (r < 0.5 ? out("It squeals all week, but it turns.", { all: { morale: -2 } }) : out("With a crack the bearing seizes. You have to wrench the housing to free it.", { shelter: -7 })) },
    ],
  },
  {
    id: "hatch_seal",
    cat: "equipment",
    minDay: 7,
    title: "The Hatch Seal Is Failing",
    text: "Daylight shows around the rim of the hatch. The rubber seal is cracked through in three places.",
    choices: [
      { label: "Replace it properly", req: needTool("toolkit"), run: () => out("Cut, glue, clamp. Tight as a drum.", { shelter: 7 }) },
      { label: "Tape and stuff the gaps", run: (S, c, r) => (r < 0.6 ? out("Ugly, but it holds.", { shelter: 2 }) : out("The tape peels by morning; grit pours in.", { shelter: -4 })) },
      { label: "Leave it", run: () => out("You get used to the draught.", { shelter: -8 }) },
    ],
  },
  {
    id: "generator",
    cat: "equipment",
    minDay: 4,
    title: "The Old Hand Generator",
    text: "Behind the crates {A} finds a dusty bicycle-crank generator, the kind they sold in catalogues for camping.",
    choices: [
      { label: "Fix it up", req: needTool("toolkit"), run: (S, c, r) => (r < 0.75 ? out("A new belt and some cursing. An hour of pedalling tops up your batteries.", { batteries: 3, who: { fatigue: 10 }, flag: { generator: true } }) : out("The flywheel snaps loose and clips {A}'s knee.", { who: { injured: 1 } })) },
      { label: "Strip it for radio parts", req: (S) => tool(S, "radio") || "No radio to fix", run: () => out("Its coil is just what the radio needed.", { radio: 35 }) },
      { label: "Pedal it as it is", run: (S, c, r) => (r < 0.4 ? out("It wheezes out a single charge before the belt goes.", { batteries: 1, who: { fatigue: 12 } }) : out("Nothing but noise and sore legs.", { who: { fatigue: 12 } })) },
    ],
  },
  {
    id: "flashlight_flicker",
    cat: "equipment",
    needItem: "flashlight",
    title: "Flickering Flashlight",
    text: "The flashlight stutters on and off. On, off. Somewhere inside a contact has worked loose.",
    choices: [
      { label: "Swap in fresh batteries", req: needRes("batteries", 1), run: () => out("Bright and steady.", { batteries: -1 }) },
      { label: "Tap it until it works", run: (S, c, r) => (r < 0.55 ? out("It settles into a steady glow. Victory.", {}) : out("One tap too many. The lens cracks and the bulb dies.", { item: { flashlight: -1 } })) },
      { label: "Fix the contact", req: needTool("toolkit"), run: () => out("Bend, file, solder. Better than new.", { all: { morale: 2 } }) },
    ],
  },
  {
    id: "hatch_jam",
    cat: "equipment",
    minDay: 9,
    title: "The Hatch Jams",
    text: "The hatch won't budge. Something has fallen across it, or the frame has warped.",
    choices: [
      { label: "Pry it with the tool kit", req: needTool("toolkit"), run: () => out("A crowbar, a lot of leverage, and it pops free.", { who: { fatigue: 6 } }) },
      { label: "Hollis shoulders it open", req: needHere("hollis", "Hollis"), run: (S, c, r) => (r < 0.7 ? out("Hollis heaves until something above crashes aside. Free.", { m: { hollis: { fatigue: 12 } } }) : out("It gives — and so does Hollis's shoulder.", { m: { hollis: { injured: 1 } } })) },
      { label: "Leave it shut", run: () => out("Trapped. But tightly sealed.", { shelter: 3, all: { morale: -6 } }) },
    ],
  },
];

const LEAKS = [
  {
    id: "drip",
    cat: "leak",
    minDay: 3,
    title: "A Steady Drip",
    text: "Drip. Drip. A bead of water has started falling from the ceiling joint above the cots.",
    choices: [
      { label: "Put a bottle under it", run: () => out("It fills slowly. Free water — and a damp spot that's spreading.", { water: 1, flag: { leak: true } }) },
      { label: "Patch the joint", req: needTool("toolkit"), run: () => out("Sealant from the tool kit. The drip stops.", { shelter: 3 }) },
      { label: "Ignore it", run: () => out("You move the cots. The drip keeps going.", { flag: { leak: true }, all: { morale: -2 } }) },
    ],
  },
  {
    id: "flood",
    cat: "leak",
    minDay: 8,
    when: (S) => !!S.flags.leak,
    title: "Groundwater Rising",
    text: "You wake with wet feet. The floor is ankle-deep and the leak has become a trickle down the wall.",
    choices: [
      { label: "Bail all day", run: () => out("Buckets up the ladder until your arms shake. The floor is dry — for now.", { all: { fatigue: 15 } }) },
      { label: "Dig a sump and seal the crack", req: needTool("toolkit"), run: () => out("A pit in the corner and a plug of cement in the crack. Fixed for good.", { flag: { leak: false }, shelter: 5, who: { fatigue: 14 } }) },
      { label: "Raise the supplies and wait", run: (S, c, r) => (r < 0.5 ? out("The water drains away overnight. Two cans were on the bottom shelf. Labels gone, rust started.", { food: -Math.min(2, S.res.food) }) : out("It drains by evening. Everything soggy, nothing lost.", { all: { morale: -3 } })) },
    ],
  },
  {
    id: "pipe_burst",
    cat: "leak",
    minDay: 5,
    title: "Burst Pipe",
    text: "A hiss and a roar from above — a water main has split somewhere in the yard. Water is pouring past the hatch.",
    choices: [
      { label: "Collect as much as you can", run: () => out("Every pot, bottle and boot. You're soaked, but rich.", { water: 3, shelter: -4, all: { fatigue: 6 } }) },
      { label: "Seal the hatch rim", req: needTool("toolkit"), run: () => out("Not a drop gets in. Not a drop gets saved either.", { shelter: 2 }) },
      { label: "Let it drain", run: () => out("It drains — through your ceiling.", { shelter: -6, flag: { leak: true } }) },
    ],
  },
  {
    id: "mould",
    cat: "leak",
    minDay: 10,
    title: "Black Spots on the Wall",
    text: "Mould is creeping out of the corner behind the cots, black and furry. The air smells like a cellar.",
    choices: [
      { label: "Scrub it with water", req: needRes("water", 1), run: () => out("Scrubbing until the wall is grey again.", { water: -1 }) },
      { label: "Open the hatch to dry it out", run: (S, c, r) => (r < 0.6 ? out("A day of fresh air. The spots fade.", { all: { morale: 4 } }) : out("Fresh air, and a lungful of drifting ash for {A}.", { who: { sick: 1 } })) },
      { label: "Ignore it", run: (S, c, r) => (r < 0.5 ? out("{A} starts wheezing at night.", { who: { sick: 1 } }) : out("It spreads, slowly.", { all: { morale: -3 } })) },
    ],
  },
  {
    id: "leak_fix",
    cat: "leak",
    when: (S) => !!S.flags.leak && tool(S, "toolkit"),
    title: "That Leak Again",
    text: "The leak in the ceiling is worse. With the tool kit, you could finally deal with it.",
    choices: [
      { label: "Fix it properly", run: () => out("A full day's work. The ceiling is dry.", { flag: { leak: false }, shelter: 4, who: { fatigue: 12 } }) },
      { label: "Rig a gutter to catch it", run: () => out("A split bottle channels the drip into a jug. Free water, wet wall.", { water: 2 }) },
    ],
  },
];

const SPOILAGE = [
  {
    id: "bulging_can",
    cat: "spoilage",
    minDay: 4,
    when: (S) => S.res.food >= 1,
    title: "A Bulging Can",
    text: "One of the cans has swollen like a little drum. The lid flexes when you press it.",
    choices: [
      { label: "Throw it out", run: () => out("Into the waste bucket. Better safe.", { food: -1 }) },
      { label: "{A} eats it anyway", run: (S, c, r) => (r < 0.55 ? out("{A} eats the lot. Nothing happens. Lucky.", { who: { hunger: -40 } }) : out("{A} spends the night doubled over.", { who: { hunger: -25, sick: 1 } })) },
      { label: "Boil it hard first", req: needRes("batteries", 1), run: (S, c, r) => out(r < 0.85 ? "Ten minutes at a rolling boil. Edible, just." : "Boiled — and still bad. {A} pays for it.", r < 0.85 ? { batteries: -1, who: { hunger: -40 } } : { batteries: -1, who: { hunger: -30, sick: 1 } }) },
    ],
  },
  {
    id: "mice",
    cat: "spoilage",
    when: (S) => S.res.food >= 2,
    minDay: 5,
    title: "Mice in the Stores",
    text: "Tiny droppings on the food shelf. A gnawed label. Something is sharing your supplies.",
    choices: [
      { label: "Set a trap", run: (S, c, r) => (r < 0.7 ? out("Snap, in the night. Problem solved.", {}) : out("The trap stays empty. Another can is chewed open.", { food: -1 })) },
      { label: "Let the cat handle it", req: (S) => !!S.flags.cat || "You don't have a cat", run: () => out("The cat brings you a gift at dawn. Everyone cheers, then gags.", { all: { morale: 5 } }) },
      { label: "Move everything up high", run: (S, c, r) => out(r < 0.7 ? "Everything goes on the top shelf. Safe." : "Up high, but one can was already ruined.", r < 0.7 ? { all: { fatigue: 4 } } : { food: -1, all: { fatigue: 4 } }) },
    ],
  },
  {
    id: "cloudy_water",
    cat: "spoilage",
    minDay: 6,
    when: (S) => S.res.water >= 2,
    title: "Cloudy Water",
    text: "Two of the bottles have gone cloudy, with something stringy floating inside.",
    choices: [
      { label: "Boil it on the burner", req: needRes("batteries", 1), run: () => out("Boiled and cooled. Tastes flat, but safe.", { batteries: -1 }) },
      { label: "Drink it anyway", run: (S, c, r) => (r < 0.5 ? out("{A} drinks it first. Fine, apparently.", {}) : out("{A}'s stomach disagrees.", { who: { sick: 1 } })) },
      { label: "Pour out the worst one", run: () => out("Down the drain. One bottle saved.", { water: -1 }) },
    ],
  },
  {
    id: "midnight_snack",
    cat: "spoilage",
    minDay: 5,
    when: (S) => S.res.food >= 2 && presentIds(S).length >= 2,
    title: "The Midnight Snack",
    text: "A can is missing. An empty one turns up under {A}'s blanket.",
    choices: [
      { label: "Confront {A}", run: () => out("{A} admits it, ashamed. Everyone feels worse.", { food: -1, who: { morale: -10, hunger: -30 } }) },
      { label: "Let it go", run: () => out("Nobody says anything. Kindness, or tiredness.", { food: -1, who: { hunger: -30 }, all: { morale: 2 } }) },
      { label: "Lock the food in the tool box", req: needTool("toolkit"), run: () => out("The food lives under lock now. It feels like a prison.", { food: -1, who: { hunger: -30 }, all: { morale: -4 }, flag: { foodLocked: true } }) },
    ],
  },
  {
    id: "forgotten_jar",
    cat: "spoilage",
    minDay: 6,
    title: "The Forgotten Jar",
    text: "Behind the bottom shelf, {A} finds a jar of pickled beets from some long-ago summer. The lid is still tight.",
    choices: [
      { label: "Share it tonight", run: () => out("Sour, purple, glorious. A small feast.", { all: { hunger: -12, morale: 8 } }) },
      { label: "Save it for later", run: () => out("Onto the shelf with the cans.", { food: 1 }) },
    ],
  },
];

const ILLNESS = [
  {
    id: "fever",
    cat: "illness",
    minDay: 3,
    pick: "weak",
    title: "Fever",
    text: "{A} is hot to the touch and shivering under two blankets.",
    choices: [
      { label: "Give medicine now", req: needRes("meds", 1), run: () => out("Pills, water, sleep. By morning the fever's broken.", { meds: -1, who: { hp: 5 } }) },
      { label: "Cool cloths and water", req: needRes("water", 1), run: (S, c, r) => (r < 0.6 ? out("A long night of damp cloths. It breaks before dawn.", { water: -1 }) : out("The fever doesn't break.", { water: -1, who: { sick: 1 } })) },
      { label: "Wait and see", run: (S, c, r) => (r < 0.45 ? out("It passes on its own. Phew.", {}) : out("By morning {A} is properly ill.", { who: { sick: 1 } })) },
    ],
  },
  {
    id: "cough_spread",
    cat: "illness",
    pick: "sick",
    when: anySick,
    title: "Coughing at Night",
    text: "{A}'s cough fills the whole shelter. In a space this small, it's only a matter of time.",
    choices: [
      { label: "Quarantine {A} in the corner", run: () => out("A blanket wall, a separate cup. {A} feels like a leper.", { who: { morale: -10 } }) },
      { label: "Dose {A} with medicine", req: needRes("meds", 1), run: () => out("The cough loosens by evening.", { meds: -1, who: { sick: -1 } }) },
      { label: "Keep everyone together", run: (S, c, r) => (c.who2 && r < 0.5 ? out("{B} starts coughing too.", { who2: { sick: 1 }, all: { morale: 2 } }) : out("Together. Coughing, but together.", { all: { morale: 3 } })) },
    ],
  },
  {
    id: "toothache",
    cat: "illness",
    minDay: 6,
    title: "Toothache",
    text: "{A} has been holding {a.p} jaw all day. A back tooth has gone bad.",
    choices: [
      { label: "June pulls it", req: needHere("june", "June"), run: (S, c, r) => (r < 0.8 ? out("Pliers, a count of three, and it's out.", { who: { hp: -4, morale: 4 } }) : out("It breaks. The rest has to come out in pieces.", { who: { hp: -10, sick: 1 } })) },
      { label: "Painkillers", req: needRes("meds", 1), run: () => out("Numb and grateful.", { meds: -1 }) },
      { label: "Grit {a.p} teeth", run: () => out("Literally. A miserable week.", { who: { morale: -12, fatigue: 10 } }) },
    ],
  },
  {
    id: "rash",
    cat: "illness",
    minDay: 7,
    title: "The Rash",
    text: "Red blotches are crawling up {A}'s arms. Fallout dust, probably, carried down on clothes.",
    choices: [
      { label: "Wash it off with water", req: needRes("water", 1), run: () => out("A careful scrub. The blotches fade.", { water: -1 }) },
      { label: "Ask June to look", req: needHere("june", "June"), run: () => out("June makes a paste from baking soda. It works.", { who: { morale: 3 } }) },
      { label: "Bandage it and ignore it", run: (S, c, r) => (r < 0.6 ? out("It fades on its own.", {}) : out("It spreads, and {A} runs a fever.", { who: { sick: 1 } })) },
    ],
  },
  {
    id: "nightmares",
    cat: "illness",
    pick: "kid",
    title: "Nightmares",
    text: "{A} wakes screaming for the third night in a row, about the sirens and the light.",
    choices: [
      { label: "{B} stays up with {a.o}", req: (S, c) => !!c.who2 || "No one else is here", run: () => out("{B} talks quietly until dawn. {A} sleeps at last.", { who: { morale: 10 }, who2: { fatigue: 15 } }) },
      { label: "Read to {a.o}", req: needTool("books"), run: () => out("A chapter, then another. {A} falls asleep mid-sentence.", { who: { morale: 12 } }) },
      { label: "Let {a.o} cry it out", run: () => out("Eventually it stops. Nobody slept.", { who: { morale: -10 }, all: { fatigue: 6 } }) },
    ],
  },
  {
    id: "collapse",
    cat: "illness",
    when: (S) => presentIds(S).some((id) => S.fam[id].fatigue >= 55),
    pick: "weak",
    title: "{A} Collapses",
    text: "{A} stands up too fast and goes down hard. Pale, shaking, eyes rolling. Too little sleep, too little everything.",
    choices: [
      { label: "Everyone rests today", run: () => out("Nobody lifts a finger. It helps.", { all: { fatigue: -20 } }) },
      { label: "Give {a.o} extra water", req: needRes("water", 1), run: () => out("Small sips. Colour comes back into {A}'s face.", { water: -1, who: { fatigue: -25, hp: 6, thirst: -30 } }) },
      { label: "Push through it", run: () => out("{A} gets back up. That's what matters, right?", { who: { hp: -10, fatigue: 5 } }) },
    ],
  },
  {
    id: "infection",
    cat: "illness",
    pick: "hurt",
    when: anyHurt,
    title: "Infected Wound",
    text: "{A}'s wound has gone red and hot around the edges.",
    choices: [
      { label: "Clean it with medicine", req: needRes("meds", 1), run: () => out("Antiseptic and a fresh dressing. The redness retreats.", { meds: -1, who: { injured: -1 } }) },
      { label: "Cauterise it", run: (S, c, r) => (r < 0.7 ? out("A heated knife. {A} screams, and then it's done.", { who: { hp: -10, injured: -1 } }) : out("It doesn't take. The infection spreads.", { who: { hp: -10, sick: 1 } })) },
      { label: "Hope it clears up", run: (S, c, r) => (r < 0.4 ? out("It does. Somehow.", { who: { injured: -1 } }) : out("It doesn't.", { who: { sick: 1 } })) },
    ],
  },
];

export default [...EQUIPMENT, ...LEAKS, ...SPOILAGE, ...ILLNESS];
