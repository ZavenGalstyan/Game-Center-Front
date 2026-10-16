/**
 * School Life Simulator 3D — question pools and generators for lessons,
 * homework and exams. Every generator takes an `rng` (() => [0,1)) so the
 * headless tests can make them deterministic.
 *
 * Question shapes:
 *   { type: "mc", q, options: [..4], answer: index, topic }
 *   { type: "input", q, answer: number, topic }
 *   { type: "order", q, items: [{ label, key }], answer: [keys in correct order], topic }
 *   { type: "arrange", q, words: [shuffled], answer: "the correct sentence", topic }
 */

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const int = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** Build an MC question from a right answer + distractors (deduplicated, shuffled). */
function mc(rng, q, right, wrong, topic) {
  const seen = new Set([String(right)]);
  const opts = [right];
  for (const w of shuffle(rng, wrong)) {
    if (opts.length >= 4) break;
    if (seen.has(String(w))) continue;
    seen.add(String(w));
    opts.push(w);
  }
  const order = shuffle(rng, opts.map((_, i) => i));
  return { type: "mc", q, options: order.map((i) => String(opts[i])), answer: order.indexOf(0), topic };
}
const near = (rng, n, spread = 6) => {
  const out = new Set();
  let guard = 0;
  while (out.size < 5 && guard++ < 50) {
    const d = int(rng, -spread, spread);
    if (d && n + d >= 0) out.add(n + d);
  }
  out.add(n + 10);
  return [...out];
};

/* ================================================================ MATH */
const MATH_GEN = [
  (rng) => {
    const a = int(rng, 12, 89);
    const b = int(rng, 11, 79);
    return { type: "input", q: `${a} + ${b} = ?`, answer: a + b, topic: "Addition" };
  },
  (rng) => {
    const a = int(rng, 40, 120);
    const b = int(rng, 8, a - 5);
    return { type: "input", q: `${a} − ${b} = ?`, answer: a - b, topic: "Subtraction" };
  },
  (rng) => {
    const a = int(rng, 3, 12);
    const b = int(rng, 4, 12);
    return mc(rng, `${a} × ${b} = ?`, a * b, near(rng, a * b, 8).concat([a * (b + 1), (a + 1) * b]), "Multiplication");
  },
  (rng) => {
    const b = int(rng, 3, 12);
    const r = int(rng, 3, 12);
    return { type: "input", q: `${b * r} ÷ ${b} = ?`, answer: r, topic: "Division" };
  },
  (rng) => {
    const a = int(rng, 2, 9);
    const b = int(rng, 2, 9);
    const c = int(rng, 2, 9);
    return mc(rng, `${a} + ${b} × ${c} = ?`, a + b * c, [(a + b) * c, a * b + c, a + b + c, a + b * c + 1, a + b * c - 2], "Order of operations");
  },
  (rng) => {
    const x = int(rng, 2, 19);
    const k = int(rng, 3, 25);
    return { type: "input", q: `Solve for x:  x + ${k} = ${x + k}`, answer: x, topic: "Equations" };
  },
  (rng) => {
    const x = int(rng, 2, 12);
    const k = int(rng, 2, 9);
    return mc(rng, `Solve for x:  ${k}x = ${k * x}`, x, near(rng, x, 4).concat([k * x - k, x + k]), "Equations");
  },
  (rng) => {
    const p = pick(rng, [10, 20, 25, 50, 75]);
    const n = pick(rng, [40, 60, 80, 120, 200, 240]);
    return mc(rng, `What is ${p}% of ${n}?`, (p * n) / 100, [(p * n) / 10, n - p, (p * n) / 100 + 5, n / p, (p * n) / 50], "Percentages");
  },
  (rng) => {
    const s = int(rng, 1, 6);
    const d = int(rng, 2, 7);
    const seq = [s, s + d, s + 2 * d, s + 3 * d];
    return mc(rng, `What comes next?  ${seq.join(", ")}, …`, s + 4 * d, [s + 4 * d + 1, s + 5 * d, s + 4 * d - d + 1, s + 3 * d + 2], "Sequences");
  },
  (rng) => {
    const s = int(rng, 1, 4);
    const r = pick(rng, [2, 3]);
    const seq = [s, s * r, s * r * r, s * r ** 3];
    return mc(rng, `What comes next?  ${seq.join(", ")}, …`, s * r ** 4, [s * r ** 3 + s * r, s * r ** 3 * 2 + 1, s * r ** 3 + r, s * r ** 4 + r], "Sequences");
  },
  (rng) => {
    const w = int(rng, 3, 12);
    const h = int(rng, 2, 9);
    return mc(rng, `A rectangle is ${w} m wide and ${h} m tall. What is its area?`, `${w * h} m²`, [`${2 * (w + h)} m²`, `${w + h} m²`, `${w * h + w} m²`, `${w * h - h} m²`], "Geometry");
  },
  (rng) => {
    const w = int(rng, 3, 12);
    const h = int(rng, 2, 9);
    return mc(rng, `A rectangle is ${w} cm by ${h} cm. What is its perimeter?`, `${2 * (w + h)} cm`, [`${w * h} cm`, `${w + h} cm`, `${2 * w + h} cm`, `${2 * (w + h) + 2} cm`], "Geometry");
  },
  (rng) => {
    const a = int(rng, 30, 80);
    const b = int(rng, 30, 150 - a);
    return mc(rng, `Two angles of a triangle are ${a}° and ${b}°. What is the third angle?`, `${180 - a - b}°`, [`${180 - a}°`, `${360 - a - b}°`, `${180 - a - b + 10}°`, `${90 - Math.min(a, b)}°`], "Geometry");
  },
  (rng) => {
    const price = int(rng, 3, 9);
    const n = int(rng, 3, 8);
    return { type: "input", q: `Pencils cost ${price} points each. How many points do ${n} pencils cost?`, answer: price * n, topic: "Word problems" };
  },
  (rng) => {
    const total = int(rng, 4, 9) * 4;
    return { type: "input", q: `${total} students are split evenly into 4 teams. How many students per team?`, answer: total / 4, topic: "Word problems" };
  },
  (rng) => {
    const t = pick(rng, [
      { q: "Which number is prime?", a: "17", w: ["21", "27", "15", "9"] },
      { q: "Which number is prime?", a: "13", w: ["12", "15", "39", "49"] },
      { q: "Which fraction equals 0.5?", a: "3/6", w: ["2/5", "5/8", "1/3", "4/6"] },
      { q: "Which is the largest?", a: "0.7", w: ["0.65", "0.07", "0.699", "0.5"] },
      { q: "What is 2³?", a: "8", w: ["6", "9", "16", "5"] },
      { q: "What is √81?", a: "9", w: ["8", "7", "18", "40.5"] },
      { q: "If all cats are animals and Tom is a cat, then…", a: "Tom is an animal", w: ["All animals are cats", "Tom is not an animal", "Some cats are not animals"] },
      { q: "How many minutes are in 2.5 hours?", a: "150", w: ["125", "250", "130", "200"] },
      { q: "Round 4.86 to one decimal place.", a: "4.9", w: ["4.8", "5.0", "4.86", "4.0"] },
      { q: "What is −3 + 8?", a: "5", w: ["−11", "11", "−5", "4"] },
    ]);
    return mc(rng, t.q, t.a, t.w, "Number sense");
  },
];

/* ================================================================ ENGLISH */
const SYNONYMS = [
  ["happy", "joyful", ["angry", "tired", "hungry", "silent"]],
  ["big", "enormous", ["tiny", "narrow", "quick", "pale"]],
  ["fast", "rapid", ["slow", "heavy", "quiet", "late"]],
  ["smart", "clever", ["lazy", "foolish", "rude", "loud"]],
  ["begin", "start", ["finish", "stop", "pause", "forget"]],
  ["brave", "courageous", ["afraid", "careless", "weak", "shy"]],
  ["difficult", "challenging", ["simple", "easy", "boring", "gentle"]],
  ["ancient", "very old", ["modern", "brand new", "broken", "huge"]],
  ["silent", "quiet", ["noisy", "bright", "rough", "busy"]],
  ["choose", "select", ["refuse", "lose", "break", "wait"]],
  ["gigantic", "huge", ["tiny", "round", "early", "soft"]],
  ["exhausted", "very tired", ["energetic", "excited", "nervous", "hungry"]],
  ["generous", "giving", ["selfish", "grumpy", "proud", "sneaky"]],
  ["curious", "inquisitive", ["bored", "certain", "sleepy", "careful"]],
  ["fragile", "delicate", ["sturdy", "heavy", "sharp", "plain"]],
];
const ANTONYMS = [
  ["ancient", "modern", ["old", "historic", "dusty", "early"]],
  ["generous", "selfish", ["kind", "giving", "wealthy", "polite"]],
  ["victory", "defeat", ["win", "triumph", "prize", "battle"]],
  ["expand", "shrink", ["grow", "stretch", "build", "inflate"]],
  ["visible", "hidden", ["clear", "bright", "obvious", "seen"]],
  ["accept", "reject", ["receive", "allow", "take", "agree"]],
  ["frequent", "rare", ["common", "regular", "usual", "daily"]],
  ["arrive", "depart", ["reach", "enter", "come", "land"]],
  ["temporary", "permanent", ["brief", "short", "passing", "quick"]],
  ["timid", "bold", ["shy", "nervous", "quiet", "meek"]],
];
const FILL = [
  ["She ___ to school every morning.", "walks", ["walk", "walking", "walked to"]],
  ["They ___ playing football when it started to rain.", "were", ["was", "is", "be"]],
  ["I have ___ finished my homework.", "already", ["yet", "ever", "since"]],
  ["This is the ___ book I have ever read.", "best", ["better", "good", "most good"]],
  ["If it rains tomorrow, we ___ stay inside.", "will", ["would have", "was", "are"]],
  ["He is taller ___ his brother.", "than", ["then", "that", "as"]],
  ["Neither the teacher ___ the students were late.", "nor", ["or", "and", "but"]],
  ["The students ___ their projects yesterday.", "presented", ["present", "presenting", "presents"]],
  ["We need ___ umbrella today.", "an", ["a", "the many", "some a"]],
  ["___ you ever been to a museum?", "Have", ["Has", "Did", "Are"]],
  ["The cat hid ___ the table.", "under", ["between", "among", "during"]],
  ["She speaks English very ___.", "well", ["good", "nicely good", "goodly"]],
  ["I'm looking forward ___ the weekend.", "to", ["for", "at", "on"]],
  ["Their house is bigger than ___.", "ours", ["our", "us", "our's"]],
  ["Each of the players ___ a uniform.", "has", ["have", "having", "are having"]],
];
const SPELLING = [
  ["necessary", ["neccessary", "necesary", "nesessary"]],
  ["separate", ["seperate", "separete", "seprate"]],
  ["definitely", ["definately", "defenitely", "definitly"]],
  ["library", ["libary", "librery", "liberry"]],
  ["receive", ["recieve", "receeve", "resieve"]],
  ["beginning", ["begining", "beggining", "beginnig"]],
  ["environment", ["enviroment", "envirnoment", "environmant"]],
  ["tomorrow", ["tommorow", "tomorow", "tommorrow"]],
  ["because", ["becuase", "becouse", "beacause"]],
  ["friend", ["freind", "frend", "friand"]],
];
const SENTENCES = [
  "The students are reading in the library",
  "Our teacher explained the new lesson",
  "We played basketball after lunch",
  "My best friend lives near the school",
  "The bell rings at half past eight",
  "She finished her homework before dinner",
  "The science lab has new microscopes",
  "History is my favourite subject",
];
const ENGLISH_GEN = [
  (rng) => {
    const [w, a, wr] = pick(rng, SYNONYMS);
    return mc(rng, `Which word means the same as “${w}”?`, a, wr, "Vocabulary — synonyms");
  },
  (rng) => {
    const [w, a, wr] = pick(rng, ANTONYMS);
    return mc(rng, `Which word is the opposite of “${w}”?`, a, wr, "Vocabulary — antonyms");
  },
  (rng) => {
    const [s, a, wr] = pick(rng, FILL);
    return mc(rng, `Complete the sentence:  ${s}`, a, wr, "Sentence completion");
  },
  (rng) => {
    const [a, wr] = pick(rng, SPELLING);
    return mc(rng, "Which spelling is correct?", a, wr, "Spelling");
  },
  (rng) => {
    const s = pick(rng, SENTENCES);
    const words = s.split(" ");
    let sh = shuffle(rng, words);
    if (sh.join(" ") === s) sh = sh.slice().reverse();
    return { type: "arrange", q: "Put the words in order to make a sentence.", words: sh, answer: s, topic: "Sentence building" };
  },
];

/* ================================================================ SCIENCE */
const SCIENCE_POOL = [
  ["What gas do plants absorb from the air?", "Carbon dioxide", ["Oxygen", "Nitrogen", "Helium"]],
  ["What is the boiling point of water at sea level?", "100 °C", ["50 °C", "90 °C", "212 °C"]],
  ["Which planet is closest to the Sun?", "Mercury", ["Venus", "Mars", "Earth"]],
  ["What part of the cell contains DNA?", "Nucleus", ["Membrane", "Cytoplasm", "Cell wall"]],
  ["What force pulls objects toward Earth?", "Gravity", ["Friction", "Magnetism", "Tension"]],
  ["H₂O is the chemical formula for…", "Water", ["Hydrogen peroxide", "Salt", "Oxygen"]],
  ["Which organ pumps blood through the body?", "Heart", ["Lungs", "Liver", "Kidney"]],
  ["What is the chemical symbol for gold?", "Au", ["Go", "Gd", "Ag"]],
  ["Sound travels fastest through…", "Solids", ["Gases", "Liquids", "A vacuum"]],
  ["What do we call animals that eat only plants?", "Herbivores", ["Carnivores", "Omnivores", "Decomposers"]],
  ["A substance with pH 2 is…", "Acidic", ["Neutral", "Basic", "Salty"]],
  ["Which of these is a renewable energy source?", "Wind", ["Coal", "Natural gas", "Oil"]],
  ["What is the powerhouse of the cell?", "Mitochondria", ["Ribosome", "Nucleus", "Vacuole"]],
  ["Light from the Sun reaches Earth in about…", "8 minutes", ["8 seconds", "8 hours", "8 days"]],
  ["What unit is used to measure force?", "Newton", ["Joule", "Watt", "Pascal"]],
  ["Ice melting into water is a…", "Physical change", ["Chemical change", "Nuclear change", "Biological change"]],
  ["Which blood cells fight infection?", "White blood cells", ["Red blood cells", "Platelets", "Plasma"]],
  ["What is the largest planet in our solar system?", "Jupiter", ["Saturn", "Neptune", "Earth"]],
  ["Photosynthesis mainly happens in the…", "Leaves", ["Roots", "Flowers", "Seeds"]],
  ["Which material conducts electricity best?", "Copper", ["Wood", "Plastic", "Rubber"]],
  ["What does a thermometer measure?", "Temperature", ["Pressure", "Mass", "Speed"]],
  ["Which state of matter has a fixed shape?", "Solid", ["Liquid", "Gas", "Plasma"]],
  ["The Moon shines because it…", "Reflects sunlight", ["Burns gas", "Glows with heat", "Has volcanoes"]],
  ["What is the hardest natural substance?", "Diamond", ["Iron", "Quartz", "Granite"]],
  ["Which vitamin do we get from sunlight?", "Vitamin D", ["Vitamin C", "Vitamin A", "Vitamin K"]],
];
const SCIENCE_GEN = [(rng) => {
  const [q, a, w] = pick(rng, SCIENCE_POOL);
  return mc(rng, q, a, w, "Science quiz");
}];

/** Experiments for the Science lesson — the overlay plays the one named by `kind`. */
export function scienceExperiment(rng = Math.random) {
  const kind = pick(rng, ["titration", "circuit", "mixing"]);
  if (kind === "titration") {
    const target = int(rng, 55, 80); // % of the burette when the indicator turns pink
    return { kind, title: "Titration", instr: "Hold POUR to add the base drop by drop. Stop as close as possible to the colour change — the flask turns pale pink at the end point.", target };
  }
  if (kind === "circuit") {
    // pick resistors so the bulb current lands in the green band
    const volts = pick(rng, [6, 9, 12]);
    const target = pick(rng, [0.5, 1, 1.5]);
    return { kind, title: "Light the Bulb", instr: `Choose a resistor so a ${volts} V battery drives ${target} A through the bulb (I = V ÷ R).`, volts, target, options: shuffle(rng, [volts / target, volts / target + 2, Math.max(1, volts / target - 2), volts / target * 2]) };
  }
  const recipes = [
    { name: "Green", parts: { blue: 1, yellow: 1, red: 0 } },
    { name: "Orange", parts: { red: 1, yellow: 1, blue: 0 } },
    { name: "Purple", parts: { red: 1, blue: 1, yellow: 0 } },
  ];
  const r = pick(rng, recipes);
  return { kind, title: "Pigment Mixing", instr: `Mix equal parts of the right two pigments to make ${r.name}. Add drops, then press TEST.`, target: r };
}

/* ================================================================ HISTORY */
const EVENTS = [
  ["The Great Pyramid of Giza is built", -2560],
  ["The first Olympic Games in Greece", -776],
  ["The Roman Republic is founded", -509],
  ["Julius Caesar is assassinated", -44],
  ["The Western Roman Empire falls", 476],
  ["The Magna Carta is signed", 1215],
  ["Gutenberg's printing press", 1440],
  ["Columbus reaches the Americas", 1492],
  ["Shakespeare writes Hamlet", 1600],
  ["The American Declaration of Independence", 1776],
  ["The French Revolution begins", 1789],
  ["The first steam locomotive railway", 1825],
  ["The telephone is invented", 1876],
  ["The Wright brothers' first flight", 1903],
  ["World War I begins", 1914],
  ["World War II ends", 1945],
  ["The first person walks on the Moon", 1969],
  ["The Berlin Wall falls", 1989],
  ["The World Wide Web is invented", 1989],
  ["The first iPhone is released", 2007],
];
const HISTORY_POOL = [
  ["Who was the first President of the United States?", "George Washington", ["Abraham Lincoln", "Thomas Jefferson", "John Adams"]],
  ["Which ancient civilisation built Machu Picchu?", "The Inca", ["The Maya", "The Aztecs", "The Romans"]],
  ["The Renaissance began in which country?", "Italy", ["England", "France", "Spain"]],
  ["Which wall divided a German city until 1989?", "The Berlin Wall", ["Hadrian's Wall", "The Great Wall", "The Western Wall"]],
  ["Who painted the Mona Lisa?", "Leonardo da Vinci", ["Michelangelo", "Raphael", "Van Gogh"]],
  ["Which empire was ruled by Genghis Khan?", "The Mongol Empire", ["The Ottoman Empire", "The Roman Empire", "The Persian Empire"]],
  ["What was the Silk Road?", "A trade route", ["A royal palace", "A river", "A battle"]],
  ["Ancient Egyptian kings were called…", "Pharaohs", ["Emperors", "Sultans", "Tsars"]],
  ["The Industrial Revolution started in…", "Britain", ["Japan", "Brazil", "India"]],
  ["Who was the first woman to win a Nobel Prize?", "Marie Curie", ["Florence Nightingale", "Ada Lovelace", "Rosa Parks"]],
  ["Which ship sank on its first voyage in 1912?", "Titanic", ["Mayflower", "Santa Maria", "Victory"]],
  ["What did the Wright brothers invent?", "The airplane", ["The car", "The telephone", "The radio"]],
  ["Which city was buried by Mount Vesuvius?", "Pompeii", ["Athens", "Carthage", "Troy"]],
  ["The Great Wall was built to protect…", "China", ["Egypt", "Rome", "India"]],
];
const ordinal = (n) => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] || "th"}`;
};
const centuryOf = (y) => (y < 0 ? `${ordinal(Math.ceil(-y / 100))} century BCE` : `${ordinal(Math.floor((y - 1) / 100) + 1)} century`);
export const fmtYear = (y) => (y < 0 ? `${-y} BCE` : `${y}`);
const HISTORY_GEN = [
  (rng) => {
    const [q, a, w] = pick(rng, HISTORY_POOL);
    return mc(rng, q, a, w, "History quiz");
  },
  (rng) => {
    const [e, y] = pick(rng, EVENTS);
    return mc(rng, `In which year: ${e}?`, fmtYear(y), [y + 10, y - 25, y + 50, y - 100, y + 4].map(fmtYear), "Dates");
  },
  (rng) => {
    const [e, y] = pick(rng, EVENTS.filter(([, yy]) => yy > 0));
    const c = centuryOf(y);
    const w = [centuryOf(y + 100), centuryOf(y - 100), centuryOf(y + 200)];
    return mc(rng, `${e} — in which century?`, c, w, "Centuries");
  },
  (rng) => {
    const set = shuffle(rng, EVENTS).slice(0, 4);
    const items = shuffle(rng, set).map(([label, y]) => ({ label, key: label, year: y }));
    return { type: "order", q: "Put these events in order, oldest first.", items, answer: set.slice().sort((a, b) => a[1] - b[1]).map(([l]) => l), topic: "Timeline" };
  },
];

/* ================================================================ COMPUTER SCIENCE */
const CS_POOL = [
  ["What does CPU stand for?", "Central Processing Unit", ["Computer Personal Unit", "Central Program Utility", "Core Power Unit"]],
  ["Which of these is a loop?", "for", ["if", "print", "return"]],
  ["What is 1010 in binary as a decimal number?", "10", ["2", "8", "1010"]],
  ["What value does a Boolean hold?", "true or false", ["any number", "a word", "a list"]],
  ["An algorithm is…", "A step-by-step set of instructions", ["A type of computer", "A programming error", "A website"]],
  ["What is a bug?", "An error in a program", ["A fast computer", "A type of loop", "A file format"]],
  ["Which symbol usually means “not equal”?", "!=", ["==", "=>", "<>="]],
  ["What does RAM do?", "Holds data the computer is using right now", ["Stores files forever", "Draws graphics", "Connects to Wi-Fi"]],
  ["How many bits are in a byte?", "8", ["4", "16", "10"]],
  ["Which is an example of input?", "Keyboard", ["Monitor", "Speaker", "Printer"]],
  ["What does HTML describe?", "The structure of web pages", ["Computer hardware", "Music files", "Spreadsheets"]],
  ["A variable is…", "A named place to store a value", ["A broken program", "A computer virus", "A loop that never ends"]],
];
const CS_GEN = [
  (rng) => {
    const n = int(rng, 2, 6);
    const s = int(rng, 0, 5);
    const k = int(rng, 1, 4);
    const code = `x = ${s}\nrepeat ${n} times:\n    x = x + ${k}\nprint(x)`;
    return mc(rng, code, s + n * k, near(rng, s + n * k, 5).concat([s + k, n * k, s + (n - 1) * k]), "Loops");
  },
  (rng) => {
    const a = int(rng, 1, 20);
    const b = int(rng, 1, 20);
    const code = `a = ${a}\nb = ${b}\nif a > b:\n    print("A")\nelse:\n    print("B")`;
    return mc(rng, code, a > b ? "A" : "B", [a > b ? "B" : "A", "AB", "nothing"], "Conditions");
  },
  (rng) => {
    const x = int(rng, 1, 9);
    const code = `x = ${x}\nx = x * 2\nx = x - 1\nprint(x)`;
    return { type: "input", q: code, answer: x * 2 - 1, topic: "Variables" };
  },
  (rng) => {
    const t = pick(rng, [
      ["true AND false", "false", ["true", "error", "maybe"]],
      ["true OR false", "true", ["false", "error", "both"]],
      ["NOT true", "false", ["true", "null", "1"]],
      ["(5 > 3) AND (2 > 4)", "false", ["true", "5", "error"]],
      ["(1 == 1) OR (2 == 3)", "true", ["false", "2", "error"]],
    ]);
    return mc(rng, `What is the result of: ${t[0]}`, t[1], t[2], "Logic");
  },
  (rng) => {
    const [q, a, w] = pick(rng, CS_POOL);
    return mc(rng, q, a, w, "Computing");
  },
  (rng) => {
    const list = Array.from({ length: 4 }, () => int(rng, 1, 9));
    const code = `nums = [${list.join(", ")}]\ntotal = 0\nfor n in nums:\n    total = total + n\nprint(total)`;
    return { type: "input", q: code, answer: list.reduce((s, v) => s + v, 0), topic: "Loops" };
  },
];

/**
 * Robot programming puzzle for Computer Science: a 5×5 grid, a robot facing
 * east at `start`, a goal and some walls. The player builds a command list
 * (F = forward, L / R = turn). Generated so a short solution always exists.
 */
export function robotPuzzle(rng = Math.random) {
  const N = 5;
  for (let attempt = 0; attempt < 60; attempt++) {
    const walls = new Set();
    const wcount = int(rng, 3, 6);
    while (walls.size < wcount) walls.add(`${int(rng, 0, N - 1)},${int(rng, 0, N - 1)}`);
    const start = [0, int(rng, 0, N - 1)];
    const goal = [int(rng, 2, N - 1), int(rng, 0, N - 1)];
    const sk = `${start[0]},${start[1]}`;
    const gk = `${goal[0]},${goal[1]}`;
    if (walls.has(sk) || walls.has(gk) || sk === gk) continue;
    const sol = solveRobot({ N, walls, start, dir: 0, goal });
    if (sol && sol.length >= 4 && sol.length <= 10) return { N, walls: [...walls], start, dir: 0, goal, best: sol.length };
  }
  return { N, walls: ["2,1", "2,2", "2,3"], start: [0, 2], dir: 0, goal: [4, 2], best: 7 };
}
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E, S, W, N  (y grows downward)
/** Runs a program; returns { pos, dir, crashed, reached, trail }. */
export function runRobot(p, prog) {
  const walls = new Set(p.walls);
  let [x, y] = p.start;
  let d = p.dir;
  const trail = [[x, y]];
  for (const c of prog) {
    if (c === "L") d = (d + 3) % 4;
    else if (c === "R") d = (d + 1) % 4;
    else if (c === "F") {
      const nx = x + DIRS[d][0];
      const ny = y + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= p.N || ny >= p.N || walls.has(`${nx},${ny}`)) return { pos: [x, y], dir: d, crashed: true, reached: false, trail };
      x = nx;
      y = ny;
      trail.push([x, y]);
    }
  }
  return { pos: [x, y], dir: d, crashed: false, reached: x === p.goal[0] && y === p.goal[1], trail };
}
function solveRobot({ N, walls, start, dir, goal }) {
  const key = (x, y, d) => `${x},${y},${d}`;
  const q = [[start[0], start[1], dir, []]];
  const seen = new Set([key(start[0], start[1], dir)]);
  while (q.length) {
    const [x, y, d, path] = q.shift();
    if (x === goal[0] && y === goal[1]) return path;
    if (path.length > 12) continue;
    const moves = [["F", x + DIRS[d][0], y + DIRS[d][1], d], ["L", x, y, (d + 3) % 4], ["R", x, y, (d + 1) % 4]];
    for (const [c, nx, ny, nd] of moves) {
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || walls.has(`${nx},${ny}`)) continue;
      const k = key(nx, ny, nd);
      if (seen.has(k)) continue;
      seen.add(k);
      q.push([nx, ny, nd, path.concat(c)]);
    }
  }
  return null;
}

/* ================================================================ public API */
const GEN = { math: MATH_GEN, english: ENGLISH_GEN, science: SCIENCE_GEN, history: HISTORY_GEN, cs: CS_GEN };

/** `n` varied questions for a subject — avoids repeating the same prompt in one set. */
export function makeQuestions(subject, n, rng = Math.random, { noTypes = [] } = {}) {
  const gens = GEN[subject];
  const out = [];
  const seen = new Set();
  let guard = 0;
  // cycle through generators so a set mixes question kinds
  const order = shuffle(rng, gens.map((_, i) => i));
  let gi = 0;
  while (out.length < n && guard++ < n * 30) {
    const g = gens[order[gi++ % order.length]];
    const q = g(rng);
    if (noTypes.includes(q.type)) continue;
    const k = q.q + (q.items ? q.items.map((i) => i.key).join() : "");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...q, subject });
  }
  return out;
}

/** Exam: questions spread over several subjects, each with a time limit. */
export function makeExam(subjects, rng = Math.random, total = 10) {
  const out = [];
  subjects.forEach((s, i) => {
    const n = Math.floor(total / subjects.length) + (i < total % subjects.length ? 1 : 0);
    out.push(...makeQuestions(s, n, rng, { noTypes: ["order", "arrange"] }));
  });
  return shuffle(rng, out);
}

/** Checks one answer; `given` is an index (mc), number/string (input), key array (order) or sentence (arrange). */
export function isCorrect(q, given) {
  if (given == null) return false;
  if (q.type === "mc") return given === q.answer;
  if (q.type === "input") return Number(String(given).replace(",", ".").trim()) === q.answer && String(given).trim() !== "";
  if (q.type === "order") return Array.isArray(given) && given.length === q.answer.length && given.every((k, i) => k === q.answer[i]);
  if (q.type === "arrange") return String(given).trim().toLowerCase() === q.answer.toLowerCase();
  return false;
}

/** Homework descriptions per subject. */
export const HOMEWORK_TEXT = {
  math: ["Practice sheet: equations & percentages", "Worksheet: geometry problems", "Number puzzles, page 42"],
  english: ["Vocabulary list: synonyms & antonyms", "Grammar worksheet: sentence completion", "Spelling practice, chapter 3"],
  science: ["Read chapter 5 and answer the questions", "Lab report: today's experiment", "Revision sheet: the human body"],
  history: ["Timeline worksheet: key events", "Read about the Renaissance and answer questions", "Dates & centuries revision"],
  cs: ["Trace the code: loops and variables", "Logic gates worksheet", "Write the steps of an algorithm"],
};

/** Teacher feedback lines by letter grade. */
export const FEEDBACK = {
  A: ["Outstanding work — that's exactly what I like to see!", "Excellent! You clearly understood today's lesson.", "Top marks. Keep this up!"],
  B: ["Very good work. Just a couple of small slips.", "Nicely done — you're on the right track.", "Good effort, well above average."],
  C: ["Solid effort. Review your mistakes and you'll improve.", "Not bad! A bit more practice will help.", "Fair work — let's aim higher next time."],
  D: ["You passed, but you need more practice.", "Some good moments, but review this topic tonight.", "Let's work on this together — come see me if you're stuck."],
  F: ["That one didn't go well. Please revise and try the homework.", "I know you can do better. Study this topic again.", "Don't give up — practice makes perfect."],
};
